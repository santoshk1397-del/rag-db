import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const { data, error } = await supabase
    .from("documents")
    .select("source")
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

  const { error } = await supabase.from("documents").delete().eq("source", source);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: source });
}
