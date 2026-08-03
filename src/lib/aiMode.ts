// Single switch controlling both chat generation and embeddings at once —
// "local" routes both to Ollama (no API keys, runs on your machine), "web"
// (the default) routes both to the hosted providers (Groq + Voyage AI).
// This is the only place that reads AI_MODE; chatProvider.ts and
// embeddingProvider.ts both import isLocalMode() from here so switching is
// always just this one env var, never a code change, on any branch.
export function isLocalMode(): boolean {
  return process.env.AI_MODE === "local";
}
