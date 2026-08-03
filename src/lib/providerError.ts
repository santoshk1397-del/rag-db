import { NextResponse } from "next/server";

// Groq's SDK (an OpenAI SDK fork) throws APIError instances with a `.status`
// property; our own Voyage fetch wrapper attaches the same shape (see
// embeddings.ts). This lets both be handled the same way here.
function statusOf(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

function providerOf(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "provider" in err) {
    const provider = (err as { provider?: unknown }).provider;
    if (typeof provider === "string") return provider;
  }
  return fallback;
}

export function providerErrorResponse(err: unknown, fallbackProvider: string) {
  const provider = providerOf(err, fallbackProvider);
  const status = statusOf(err);

  if (status === 429) {
    return NextResponse.json(
      {
        error: `${provider} is rate-limiting requests right now. Please wait a moment and try again.`,
      },
      { status: 429 }
    );
  }

  console.error(`${provider} request failed:`, err);
  // Prefer the error's own message when we have one (e.g. Ollama's
  // "make sure it's running locally" hint) over a generic fallback.
  const message = err instanceof Error && err.message ? err.message : `${provider} request failed. Please try again.`;
  return NextResponse.json({ error: message }, { status: 502 });
}
