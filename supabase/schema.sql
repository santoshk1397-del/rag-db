-- Run this in the Supabase SQL editor (Project > SQL Editor > New query)

create extension if not exists vector;

create table if not exists documents (
  id bigint generated always as identity primary key,
  source text not null,          -- original filename or URL
  content text not null,         -- the chunk text
  embedding vector(1024) not null, -- voyage-3 embeddings are 1024-dim
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- No approximate index (ivfflat/hnsw) yet — with a small number of chunks a plain
-- sequential scan is fast and exact. ivfflat in particular gives bad/empty results
-- when "lists" is set higher than the row count, so don't add one until you have
-- at least a few thousand chunks, and set lists accordingly (~sqrt(row count)).

-- Similarity search RPC, called from /api/chat.
-- filter_sources: pass null (or omit) to search all documents, or an array of
-- source filenames to restrict the search to just those documents.
create or replace function match_documents (
  query_embedding vector(1024),
  match_count int default 5,
  filter_sources text[] default null
)
returns table (
  id bigint,
  source text,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    id,
    source,
    content,
    metadata,
    1 - (embedding <=> query_embedding) as similarity
  from documents
  where filter_sources is null or source = any(filter_sources)
  order by embedding <=> query_embedding
  limit match_count;
$$;
