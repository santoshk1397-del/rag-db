import { NextRequest, NextResponse } from "next/server";
import { embedQuery } from "@/lib/embeddings";
import { supabase } from "@/lib/supabase";
import { groq, CHAT_MODEL } from "@/lib/groq";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { providerErrorResponse } from "@/lib/providerError";

export const runtime = "nodejs";

const CHAT_LIMIT = 20;
const CHAT_WINDOW_SECONDS = 60 * 60; // 1 hour

type MatchedDoc = {
  source: string;
  content: string;
  similarity: number;
};

type HistoryTurn = { question: string; answer: string };

// How many prior turns to carry into both retrieval and the model's context.
// Bounded so a long conversation doesn't grow the prompt (and Groq token
// usage) without limit.
const MAX_HISTORY_TURNS = 6;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const allowed = await checkRateLimit(`chat:${ip}`, CHAT_LIMIT, CHAT_WINDOW_SECONDS);
  if (!allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded: max ${CHAT_LIMIT} questions per hour. Try again later.` },
      { status: 429 }
    );
  }

  const { question, sources: selectedSources, history: rawHistory } = await req.json();
  if (!question?.trim()) {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }

  const history: HistoryTurn[] = Array.isArray(rawHistory)
    ? rawHistory.slice(-MAX_HISTORY_TURNS)
    : [];

  // Naive follow-up handling: fold the immediately preceding question into the
  // retrieval query, so "what about the other one?" has a better chance of
  // embedding close to the right chunks than the bare pronoun would alone.
  const retrievalQuery =
    history.length > 0 ? `${history[history.length - 1].question}\n${question}` : question;

  let queryEmbedding: number[];
  let voyageTokens: number;
  try {
    ({ embedding: queryEmbedding, tokens: voyageTokens } = await embedQuery(retrievalQuery));
  } catch (err) {
    return providerErrorResponse("Voyage AI", err);
  }

  const { data: matches, error } = await supabase.rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_count: 5,
    filter_sources:
      Array.isArray(selectedSources) && selectedSources.length > 0
        ? selectedSources
        : null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const docs = (matches ?? []) as MatchedDoc[];
  const context = docs
    .map((d, i) => `[${i + 1}] (source: ${d.source})\n${d.content}`)
    .join("\n\n");

  const historyMessages = history.flatMap((turn) => [
    { role: "user" as const, content: turn.question },
    { role: "assistant" as const, content: turn.answer },
  ]);

  let completion;
  try {
    completion = await groq.chat.completions.create({
      model: CHAT_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "system",
          content:
            "You answer questions using ONLY the provided context. Cite sources inline using [1], [2], etc. " +
            "If the context doesn't contain the answer, say so plainly instead of guessing. " +
            "Prior turns are included for conversational context (e.g. resolving 'it' or 'the other one') " +
            "— the context below reflects only the CURRENT question's retrieval, so don't assume it also " +
            "covers what earlier turns discussed unless it's repeated here.",
        },
        ...historyMessages,
        {
          role: "user",
          content: `Context:\n\n${context}\n\nQuestion: ${question}`,
        },
      ],
    });
  } catch (err) {
    return providerErrorResponse("Groq", err);
  }

  const answer = completion.choices[0]?.message?.content ?? "";

  return NextResponse.json({
    answer,
    sources: docs.map((d) => ({ source: d.source, similarity: d.similarity })),
    usage: {
      voyageTokens,
      groqTokens: {
        prompt: completion.usage?.prompt_tokens ?? 0,
        completion: completion.usage?.completion_tokens ?? 0,
        total: completion.usage?.total_tokens ?? 0,
      },
    },
  });
}
