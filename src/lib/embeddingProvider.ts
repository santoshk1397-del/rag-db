// Picks the active embedding provider from AI_MODE (see aiMode.ts) so
// switching providers is an env var change, never a code change.
import { embedDocuments as embedDocumentsVoyage, embedQuery as embedQueryVoyage } from "@/lib/embeddings";
import { ollamaEmbed, OLLAMA_EMBED_MODEL } from "@/lib/ollama";
import { isLocalMode } from "@/lib/aiMode";

// Same dimensionality doesn't mean the same vector space, so every chunk (and
// every query) is tagged with exactly which model produced it — see
// documents.embedding_model in schema.sql. This is what the app currently
// has active, used both to tag new rows and to filter retrieval/the document
// picker to only what's actually compatible.
export function activeEmbeddingModel(): string {
  return isLocalMode() ? OLLAMA_EMBED_MODEL : "voyage-3";
}

export async function embedDocuments(texts: string[]) {
  if (isLocalMode()) return ollamaEmbed(texts);
  return embedDocumentsVoyage(texts);
}

export async function embedQuery(text: string) {
  if (isLocalMode()) {
    const { embeddings, tokens } = await ollamaEmbed([text]);
    return { embedding: embeddings[0], tokens };
  }
  return embedQueryVoyage(text);
}
