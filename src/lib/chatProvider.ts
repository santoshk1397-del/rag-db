// Picks the active chat/generation provider from AI_MODE (see aiMode.ts) so
// switching providers is an env var change, never a code change.
import { groq, CHAT_MODEL } from "@/lib/groq";
import { ollamaChat } from "@/lib/ollama";
import { isLocalMode } from "@/lib/aiMode";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatResult = {
  content: string;
  usage: { prompt: number; completion: number; total: number };
};

export async function generateChatCompletion(messages: ChatMessage[]): Promise<ChatResult> {
  if (isLocalMode()) {
    return ollamaChat(messages);
  }

  let completion;
  try {
    completion = await groq.chat.completions.create({
      model: CHAT_MODEL,
      max_tokens: 1024,
      messages,
    });
  } catch (err) {
    if (err && typeof err === "object") (err as { provider?: string }).provider = "Groq";
    throw err;
  }

  return {
    content: completion.choices[0]?.message?.content ?? "",
    usage: {
      prompt: completion.usage?.prompt_tokens ?? 0,
      completion: completion.usage?.completion_tokens ?? 0,
      total: completion.usage?.total_tokens ?? 0,
    },
  };
}
