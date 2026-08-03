# RAG Q&A Demo

Upload a document, ask questions about it, get answers with inline citations.
Built with Next.js (App Router), Supabase (Postgres + pgvector), Voyage AI embeddings, and Groq (Llama 3.3 70B) for generation.

## How it works

1. **Upload** — a PDF/TXT is parsed, split into overlapping chunks, embedded with Voyage AI, and stored in Supabase's `documents` table (pgvector column).
2. **Ask** — the question is embedded, Supabase's `match_documents` RPC does a cosine-similarity search for the top 5 chunks, and Groq's Llama 3.3 70B answers using only that retrieved context, citing sources as `[1]`, `[2]`, etc.

## Setup

1. **Create a Supabase project** at supabase.com.
   - Open the SQL Editor and run [`supabase/schema.sql`](supabase/schema.sql) — this enables `pgvector`, creates the `documents` table, and the `match_documents` function.
   - Copy your Project URL and `service_role` key from Project Settings > API.

2. **Get API keys**
   - Groq (generation): console.groq.com — free tier available, very fast inference.
   - Voyage AI (embeddings): dashboard.voyageai.com — has a free tier; Groq has no embeddings endpoint, so this is handled separately.

3. **Configure env vars**
   ```
   cp .env.example .env.local
   # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY, VOYAGE_API_KEY
   ```

4. **Install and run**
   ```
   npm install
   npm run dev
   ```
   Open http://localhost:3000, upload a document, then ask questions about it.

## Deploying (Vercel + Supabase)

1. Push this folder to a GitHub repo.
2. Import the repo in Vercel (vercel.com/new).
3. Add the same four env vars from `.env.local` in the Vercel project's Environment Variables settings.
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
