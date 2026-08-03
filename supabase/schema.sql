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

-- ---------- rate limiting ----------
-- One row per (route, client) key, e.g. "upload:203.0.113.4". A fixed window:
-- once window_start is older than p_window_seconds, the counter resets.
create table if not exists rate_limits (
  key text primary key,
  count int not null default 0,
  window_start timestamptz not null default now()
);

-- Returns true if this call is allowed (and records it), false if the caller
-- is over the limit for the current window. The upsert is a single atomic
-- statement, so concurrent requests for the same key can't race each other.
create or replace function check_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
)
returns boolean
language plpgsql
as $$
declare
  v_count int;
begin
  insert into rate_limits (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case
          when rate_limits.window_start < now() - (p_window_seconds || ' seconds')::interval
            then 1
          else rate_limits.count + 1
        end,
        window_start = case
          when rate_limits.window_start < now() - (p_window_seconds || ' seconds')::interval
            then now()
          else rate_limits.window_start
        end
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;
