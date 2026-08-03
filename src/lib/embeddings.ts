const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

async function embed(texts: string[], inputType: "document" | "query") {
  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: texts,
      model: "voyage-3",
      input_type: inputType,
    }),
  });

  if (!res.ok) {
    throw new Error(`Voyage embeddings request failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return {
    embeddings: data.data.map((d: { embedding: number[] }) => d.embedding) as number[][],
    tokens: (data.usage?.total_tokens as number) ?? 0,
  };
}

export async function embedDocuments(texts: string[]) {
  const { embeddings, tokens } = await embed(texts, "document");
  return { embeddings, tokens };
}

export async function embedQuery(text: string) {
  const { embeddings, tokens } = await embed([text], "query");
  return { embedding: embeddings[0], tokens };
}
