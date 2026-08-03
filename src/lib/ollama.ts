// Local model client for Ollama (http://localhost:11434 by default). No API
// key — it's just a local HTTP server. Used as the local alternative to
// Groq (chat) and Voyage AI (embeddings); see embeddingProvider.ts and
// chatProvider.ts for how the active provider is chosen.

const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
export const OLLAMA_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL ?? "llama3.1:8b";
export const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "mxbai-embed-large";

class OllamaConnectionError extends Error {
  provider = "Ollama" as const;
  constructor(message: string) {
    super(message);
    this.name = "OllamaConnectionError";
  }
}

async function ollamaFetch(path: string, body: unknown) {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new OllamaConnectionError(
      "Couldn't reach Ollama — make sure it's running locally (open the Ollama app, or run `ollama serve`)."
    );
  }

  if (!res.ok) {
    const text = await res.text();
    throw new OllamaConnectionError(`Ollama request failed: ${res.status} ${text}`);
  }

  return res.json();
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function ollamaChat(messages: ChatMessage[]) {
  const data = await ollamaFetch("/api/chat", {
    model: OLLAMA_CHAT_MODEL,
    messages,
    stream: false,
  });

  return {
    content: data.message?.content ?? "",
    // Ollama reports token counts as prompt_eval_count / eval_count, not the
    // OpenAI-style usage object Groq uses — map them onto the same shape.
    usage: {
      prompt: data.prompt_eval_count ?? 0,
      completion: data.eval_count ?? 0,
      total: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
    },
  };
}

export async function ollamaEmbed(texts: string[]) {
  const data = await ollamaFetch("/api/embed", {
    model: OLLAMA_EMBED_MODEL,
    input: texts,
  });

  return {
    embeddings: data.embeddings as number[][],
    // Ollama's embed endpoint doesn't report token usage — local inference
    // has no per-token cost, so 0 is accurate for the usage monitor.
    tokens: 0,
  };
}
