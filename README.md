# RAG Q&A Demo

Upload a document, ask questions about it, get answers with inline citations.
Built with Next.js (App Router), Supabase (Postgres + pgvector), and a swappable AI backend —
Groq + Voyage AI (hosted) or Ollama (fully local) — controlled by one env var.

## How it works

1. **Upload** — a PDF/TXT is parsed, split into overlapping chunks, embedded, and stored in Supabase's `documents` table (pgvector column), tagged with which embedding model produced it.
2. **Ask** — the question is embedded, Supabase's `match_documents` RPC does a cosine-similarity search for the top 5 chunks (only among chunks embedded with the currently active model), and the chat model answers using only that retrieved context, citing sources as `[1]`, `[2]`, etc.

## Web vs. local mode (`AI_MODE`)

One env var, `AI_MODE`, switches both chat generation and embeddings at once — never a code change, and it's the same on every branch:

| `AI_MODE` | Chat generation | Embeddings | Needs |
|---|---|---|---|
| `web` (default) | Groq (Llama 3.3 70B) | Voyage AI (`voyage-3`) | `GROQ_API_KEY`, `VOYAGE_API_KEY` |
| `local` | Ollama (`llama3.1:8b`) | Ollama (`mxbai-embed-large`) | Ollama running locally, models pulled |

**For `local` mode:**
```bash
brew install --cask ollama   # or brew install ollama for CLI-only
open -a Ollama                # or: ollama serve
ollama pull llama3.1:8b
ollama pull mxbai-embed-large
```
No API keys needed for local mode — Ollama is just a local HTTP server on `localhost:11434` with no auth.

**Important:** switching `AI_MODE` only affects *newly-uploaded* documents. Every chunk is tagged with the exact model that embedded it (`documents.embedding_model`), and the document picker / retrieval only ever show or search chunks matching the *currently active* model — a `voyage-3` chunk and an `mxbai-embed-large` chunk are both 1024-dimensional but live in completely different vector spaces, so they're never mixed. If you switch modes, documents embedded under the other mode simply won't appear until you switch back (they're not lost, just hidden as incompatible) — re-upload them if you want them searchable under the new mode.

## Setup

1. **Create a Supabase project** at supabase.com.
   - Open the SQL Editor and run [`supabase/schema.sql`](supabase/schema.sql) — this enables `pgvector`, creates the `documents` table, and the `match_documents` function.
   - Copy your Project URL and `service_role` key from Project Settings > API.

2. **Choose a mode** — see [Web vs. local mode](#web-vs-local-mode-ai_mode) above.
   - `web`: get API keys from console.groq.com (Groq) and dashboard.voyageai.com (Voyage AI).
   - `local`: install Ollama and pull the two models (commands above) — no API keys.

3. **Configure env vars**
   ```
   cp .env.example .env.local
   # set AI_MODE, plus whichever keys that mode needs (see .env.example)
   ```

4. **Install and run**
   ```
   npm install
   npm run dev
   ```
   Open http://localhost:3000, upload a document, then ask questions about it.

## Deploying (Vercel + Supabase)

Deploying only works with `AI_MODE=web` — Vercel's servers can't reach `localhost:11434` on your machine, so `local` mode only works while running the app on your own laptop.

1. Push this folder to a GitHub repo.
2. Import the repo in Vercel (vercel.com/new).
3. Add the env vars from `.env.local` (with `AI_MODE=web`) in the Vercel project's Environment Variables settings.
4. Deploy. Supabase requires no extra deploy step — it's already hosted.

## Sample data sources to demo with

Since this works with any PDF/TXT, good demo-ready sources:

- **Your own resume/LinkedIn export (PDF)** — turns this into an "ask me anything about my career" demo, which doubles nicely as a portfolio feature.
- **Public domain books** — Project Gutenberg (gutenberg.org) has plain-text/PDF classics, good for showing multi-chunk retrieval over a large document.
- **arXiv papers** — any paper PDF from arxiv.org works well to show technical Q&A with citations.
- **Open-source project docs** — e.g. export a library's README/docs pages as text; good for a "docs assistant" framing.
- **Wikipedia articles** — export any article as PDF (Tools > Download as PDF) for a quick, recognizable demo.

## What to mention on your portfolio

- Retrieval-augmented generation pipeline: chunking, embeddings, vector similarity search, grounded generation with citations.
- Full stack on Vercel + Supabase (Postgres/pgvector), no separate vector DB service to manage.
- Groq (Llama 3.3 70B) for low-latency generation, Voyage AI for embeddings.
