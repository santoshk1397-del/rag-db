import { NextRequest, NextResponse } from "next/server";
import { embedQuery } from "@/lib/embeddings";
import { supabase } from "@/lib/supabase";
import { groq, CHAT_MODEL } from "@/lib/groq";

export const runtime = "nodejs";

type MatchedDoc = {
  source: string;
  content: string;
  similarity: number;
};

export async function POST(req: NextRequest) {
  const { question, sources: selectedSources } = await req.json();
  if (!question?.trim()) {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }

  const queryEmbedding = await embedQuery(question);

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

  const completion = await groq.chat.completions.create({
    model: CHAT_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "system",
        content:
          "You answer questions using ONLY the provided context. Cite sources inline using [1], [2], etc. " +
          "If the context doesn't contain the answer, say so plainly instead of guessing.",
      },
      {
        role: "user",
        content: `Context:\n\n${context}\n\nQuestion: ${question}`,
      },
    ],
  });

  const answer = completion.choices[0]?.message?.content ?? "";

  return NextResponse.json({
    answer,
    sources: docs.map((d) => ({ source: d.source, similarity: d.similarity })),
  });
}
