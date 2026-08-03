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

export function providerErrorResponse(provider: "Voyage AI" | "Groq", err: unknown) {
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
  return NextResponse.json(
    { error: `${provider} request failed. Please try again.` },
    { status: 502 }
  );
}
