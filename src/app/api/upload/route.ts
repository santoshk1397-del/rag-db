import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import { chunkText } from "@/lib/chunk";
import { embedDocuments, activeEmbeddingModel } from "@/lib/embeddingProvider";
import { supabase } from "@/lib/supabase";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { providerErrorResponse } from "@/lib/providerError";
import { isLocalMode } from "@/lib/aiMode";

export const runtime = "nodejs";

const UPLOAD_LIMIT = 10;
const UPLOAD_WINDOW_SECONDS = 60 * 60; // 1 hour

export async function POST(req: NextRequest) {
  // The rate limiter exists to protect hosted-provider quotas (Groq/Voyage
  // free tiers) — not needed in local mode, where generation/embeddings run
  // on your own machine at no per-request cost.
  if (!isLocalMode()) {
    const ip = getClientIp(req);
    const allowed = await checkRateLimit(`upload:${ip}`, UPLOAD_LIMIT, UPLOAD_WINDOW_SECONDS);
    if (!allowed) {
      return NextResponse.json(
        { error: `Rate limit exceeded: max ${UPLOAD_LIMIT} uploads per hour. Try again later.` },
        { status: 429 }
      );
    }
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
  const text = isPdf ? (await pdfParse(buffer)).text : buffer.toString("utf-8");

  const chunks = chunkText(text);
  if (chunks.length === 0) {
    return NextResponse.json({ error: "No extractable text in file" }, { status: 400 });
  }

  let embeddings: number[][];
  let tokens: number;
  try {
    ({ embeddings, tokens } = await embedDocuments(chunks));
  } catch (err) {
    return providerErrorResponse(err, "Embedding provider");
  }

  const embeddingModel = activeEmbeddingModel();
  const rows = chunks.map((content, i) => ({
    source: file.name,
    content,
    embedding: embeddings[i],
    embedding_model: embeddingModel,
  }));

  const { error } = await supabase.from("documents").insert(rows);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    chunksIndexed: rows.length,
    source: file.name,
    usage: { embeddingTokens: tokens },
  });
}
