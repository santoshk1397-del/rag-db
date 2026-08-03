import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { activeEmbeddingModel } from "@/lib/embeddingProvider";

export const runtime = "nodejs";

export async function GET() {
  // Only list documents embedded with whichever model is currently active —
  // a document embedded under a different model (e.g. uploaded before an
  // EMBEDDING_PROVIDER switch) can't be searched against a query embedded
  // with today's model, so it'd be misleading to offer it as selectable.
  const { data, error } = await supabase
    .from("documents")
    .select("source")
    .eq("embedding_model", activeEmbeddingModel())
    .order("source");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const counts = new Map<string, number>();
  (data ?? []).forEach((row) => counts.set(row.source, (counts.get(row.source) ?? 0) + 1));

  const sources = Array.from(counts.entries())
    .map(([source, chunks]) => ({ source, chunks }))
    .sort((a, b) => a.source.localeCompare(b.source));

  return NextResponse.json({ sources });
}

export async function DELETE(req: NextRequest) {
  const source = req.nextUrl.searchParams.get("source");
  if (!source) {
    return NextResponse.json({ error: "Missing source" }, { status: 400 });
  }

  // Scope to the currently active embedding model, same as GET/retrieval —
  // otherwise deleting a document shown under one AI_MODE could also delete
  // a same-named document embedded under a different mode that isn't even
  // visible/selectable right now.
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("source", source)
    .eq("embedding_model", activeEmbeddingModel());
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: source });
}
