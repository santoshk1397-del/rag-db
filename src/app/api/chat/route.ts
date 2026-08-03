import { NextRequest, NextResponse } from "next/server";
import { embedQuery, activeEmbeddingModel } from "@/lib/embeddingProvider";
import { supabase } from "@/lib/supabase";
import { generateChatCompletion } from "@/lib/chatProvider";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { providerErrorResponse } from "@/lib/providerError";
import { isLocalMode } from "@/lib/aiMode";

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
// Bounded so a long conversation doesn't grow the prompt (and generation
// token usage) without limit.
const MAX_HISTORY_TURNS = 6;

export async function POST(req: NextRequest) {
  // The rate limiter exists to protect hosted-provider quotas (Groq/Voyage
  // free tiers) — not needed in local mode, where generation/embeddings run
  // on your own machine at no per-request cost.
  if (!isLocalMode()) {
    const ip = getClientIp(req);
    const allowed = await checkRateLimit(`chat:${ip}`, CHAT_LIMIT, CHAT_WINDOW_SECONDS);
    if (!allowed) {
      return NextResponse.json(
        { error: `Rate limit exceeded: max ${CHAT_LIMIT} questions per hour. Try again later.` },
        { status: 429 }
      );
    }
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
  let embeddingTokens: number;
  try {
    ({ embedding: queryEmbedding, tokens: embeddingTokens } = await embedQuery(retrievalQuery));
  } catch (err) {
    return providerErrorResponse(err, "Embedding provider");
  }

  const { data: matches, error } = await supabase.rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_count: 5,
    filter_sources:
      Array.isArray(selectedSources) && selectedSources.length > 0
        ? selectedSources
        : null,
    filter_embedding_model: activeEmbeddingModel(),
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

  let result;
  try {
    result = await generateChatCompletion([
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
    ]);
  } catch (err) {
    return providerErrorResponse(err, "Chat provider");
  }

  return NextResponse.json({
    answer: result.content,
    sources: docs.map((d) => ({ source: d.source, similarity: d.similarity })),
    usage: {
      embeddingTokens,
      chatTokens: result.usage,
    },
  });
}
