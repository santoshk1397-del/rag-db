import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

// Returns true if allowed, false if the caller is over the limit. Fails open
// (allows the request) if the check itself errors, so a Supabase hiccup
// doesn't take the whole app down for every user.
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error("Rate limit check failed:", error.message);
    return true;
  }

  return data as boolean;
}
