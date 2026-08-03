import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import { chunkText } from "@/lib/chunk";
import { embedDocuments } from "@/lib/embeddings";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
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

  const { embeddings, tokens } = await embedDocuments(chunks);

  const rows = chunks.map((content, i) => ({
    source: file.name,
    content,
    embedding: embeddings[i],
  }));

  const { error } = await supabase.from("documents").insert(rows);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    chunksIndexed: rows.length,
    source: file.name,
    usage: { voyageTokens: tokens },
  });
}
