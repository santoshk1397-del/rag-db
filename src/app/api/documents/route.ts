import { NextResponse } from "next/server";
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

  const sources = Array.from(new Set((data ?? []).map((row) => row.source)));
  return NextResponse.json({ sources });
}
