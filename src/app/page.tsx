"use client";

import { useEffect, useRef, useState } from "react";

type Source = { source: string; similarity: number };
type ChatEntry = { question: string; answer: string; sources: Source[]; error?: boolean };
type Usage = { voyageTokens: number; groqPrompt: number; groqCompletion: number; groqTotal: number };
type DocSource = { source: string; chunks: number };

const ZERO_USAGE: Usage = { voyageTokens: 0, groqPrompt: 0, groqCompletion: 0, groqTotal: 0 };

const SAMPLE_FILES = [
  {
    file: "company-handbook.txt",
    label: "Company Handbook",
    description: "HR policy doc — vacation, remote work, expenses, parental leave",
  },
  {
    file: "product-docs.txt",
    label: "API Docs",
    description: "Developer docs — auth, rate limits, webhooks, pagination",
  },
  {
    file: "research-notes.txt",
    label: "RAG Research Notes",
    description: "Notes on how retrieval-augmented generation systems work",
  },
  {
    file: "saas-master-agreement.txt",
    label: "SaaS Agreement",
    description: "Master Subscription Agreement — fees, liability, termination, data protection",
  },
];

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ChatEntry[]>([]);

  const [allSources, setAllSources] = useState<DocSource[]>([]);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [usage, setUsage] = useState<Usage>(ZERO_USAGE);
  const [deletingSource, setDeletingSource] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocSource | null>(null);

  const filteredSources = allSources.filter((s) =>
    s.source.toLowerCase().includes(sourceFilter.trim().toLowerCase())
  );
  const allFilteredSelected =
    filteredSources.length > 0 && filteredSources.every((s) => selectedSources.has(s.source));

  async function refreshSources() {
    const res = await fetch("/api/documents");
    const data = await res.json();
    if (res.ok) {
      const names = new Set(allSources.map((s) => s.source));
      setAllSources(data.sources);
      setSelectedSources((prev) => {
        const next = new Set(prev);
        data.sources.forEach((s: DocSource) => {
          if (!names.has(s.source)) next.add(s.source);
        });
        return next;
      });
    }
  }

  useEffect(() => {
    refreshSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSource(source: string) {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelectedSources((prev) => new Set([...prev, ...filteredSources.map((s) => s.source)]));
  }

  function deselectAllFiltered() {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      filteredSources.forEach((s) => next.delete(s.source));
      return next;
    });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { source } = deleteTarget;
    setDeleteTarget(null);
    setDeletingSource(source);

    const res = await fetch(`/api/documents?source=${encodeURIComponent(source)}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setAllSources((prev) => prev.filter((s) => s.source !== source));
      setSelectedSources((prev) => {
        const next = new Set(prev);
        next.delete(source);
        return next;
      });
    }
    setDeletingSource(null);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setIndexing(true);
    setUploadStatus(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();

    setUploadStatus(
      res.ok
        ? { text: `Indexed ${data.chunksIndexed} chunks from "${data.source}"` }
        : { text: data.error ?? "Something went wrong", error: true }
    );
    setIndexing(false);

    if (res.ok) {
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUsage((u) => ({ ...u, voyageTokens: u.voyageTokens + (data.usage?.voyageTokens ?? 0) }));
      await refreshSources();
    }
  }

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    const askedQuestion = question;

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, sources: Array.from(selectedSources) }),
    });
    const data = await res.json();

    if (res.ok) {
      setHistory((h) => [...h, { question: askedQuestion, answer: data.answer, sources: data.sources }]);
      setQuestion("");
      setUsage((u) => ({
        voyageTokens: u.voyageTokens + (data.usage?.voyageTokens ?? 0),
        groqPrompt: u.groqPrompt + (data.usage?.groqTokens?.prompt ?? 0),
        groqCompletion: u.groqCompletion + (data.usage?.groqTokens?.completion ?? 0),
        groqTotal: u.groqTotal + (data.usage?.groqTokens?.total ?? 0),
      }));
    } else {
      setHistory((h) => [...h, { question: askedQuestion, answer: data.error, sources: [], error: true }]);
    }
    setLoading(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 pb-24 pt-12 sm:px-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-indigo-300/80">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_10px_2px_rgba(129,140,248,0.7)]" />
          Retrieval-augmented Q&A
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">RAG Q&A Demo</h1>
        <p className="max-w-xl text-sm leading-relaxed text-neutral-400">
          Upload a document, ask questions about it, and get answers grounded in what you
          uploaded — with citations back to the source.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[380px_1fr] lg:items-start">
      {/* Left: upload + file selection */}
      <div className="flex flex-col gap-6">
      {/* Upload */}
      <form
        onSubmit={handleUpload}
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-xl shadow-black/20 backdrop-blur-sm sm:p-6"
      >
        <label className="mb-3 block text-sm font-medium text-neutral-200">
          Upload a document to index
        </label>
        <div className="flex flex-col gap-3">
          <label className="flex flex-1 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-3 text-sm text-neutral-400 transition hover:border-indigo-400/50 hover:bg-indigo-500/5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-indigo-300">
              <path d="M12 16V4m0 0L7 9m5-5l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="truncate">{file ? file.name : "Choose a .pdf or .txt file…"}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
          <button
            disabled={!file || indexing}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {indexing ? (
              <>
                <Spinner /> Indexing…
              </>
            ) : (
              "Index"
            )}
          </button>
        </div>
        {uploadStatus && (
          <p
            className={
              "mt-3 flex items-center gap-1.5 text-sm animate-fade-up " +
              (uploadStatus.error ? "text-rose-400" : "text-emerald-400")
            }
          >
            {uploadStatus.error ? "⚠" : "✓"} {uploadStatus.text}
          </p>
        )}

        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="mb-2 text-xs font-medium text-neutral-500">
            No file handy? Download a sample to try it with:
          </p>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_FILES.map((s) => (
              <a
                key={s.file}
                href={`/samples/${s.file}`}
                download
                title={s.description}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-transparent px-3 py-1.5 text-xs font-medium text-neutral-400 transition hover:border-indigo-400/40 hover:text-indigo-200"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="shrink-0">
                  <path d="M12 15V3m0 12l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </form>

      {/* Source filter */}
      {allSources.length > 0 && (
        <div className="animate-fade-up rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-neutral-200">
              Search within
              <span className="ml-2 font-normal text-neutral-500">
                ({selectedSources.size} of {allSources.length} selected)
              </span>
            </p>
            <button
              type="button"
              onClick={allFilteredSelected ? deselectAllFiltered : selectAllFiltered}
              className="text-xs font-medium text-indigo-300 transition hover:text-indigo-200"
            >
              {allFilteredSelected ? "Deselect all" : "Select all"}
            </button>
          </div>

          <div className="relative mb-3">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
            >
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              placeholder="Filter documents…"
              className="w-full rounded-lg border border-white/10 bg-black/20 py-1.5 pl-8 pr-3 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-indigo-400/50 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {filteredSources.length === 0 && (
              <p className="text-xs text-neutral-600">No documents match &quot;{sourceFilter}&quot;.</p>
            )}
            {filteredSources.map(({ source, chunks }) => {
              const active = selectedSources.has(source);
              const deleting = deletingSource === source;
              return (
                <div
                  key={source}
                  className={
                    "flex items-center gap-1 rounded-full border pl-3 pr-1.5 py-1.5 text-xs font-medium transition " +
                    (active
                      ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-200"
                      : "border-white/10 bg-transparent text-neutral-500")
                  }
                >
                  <button type="button" onClick={() => toggleSource(source)} disabled={deleting} className="disabled:opacity-40">
                    {active ? "✓ " : ""}
                    {source}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget({ source, chunks })}
                    disabled={deleting}
                    title="Delete document"
                    className="rounded-full p-1 text-neutral-500 transition hover:bg-white/10 hover:text-rose-300 disabled:opacity-40"
                  >
                    {deleting ? (
                      <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                      </svg>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>

      {/* Right: chat */}
      <div className="flex flex-col gap-4">
      {/* Chat history */}
      <div className="flex flex-col gap-4">
        {history.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center text-sm text-neutral-500">
            {allSources.length === 0
              ? "Upload a document, then ask your first question here."
              : "Ask a question below to get started."}
          </div>
        )}
        {history.map((entry, i) => (
          <div key={i} className="animate-fade-up flex flex-col gap-2">
            <div className="self-end rounded-2xl rounded-br-sm bg-indigo-500/15 px-4 py-2.5 text-sm text-indigo-100">
              {entry.question}
            </div>
            <div
              className={
                "self-start rounded-2xl rounded-bl-sm border px-4 py-3 text-sm leading-relaxed " +
                (entry.error
                  ? "border-rose-500/20 bg-rose-500/[0.06] text-rose-300"
                  : "border-white/10 bg-white/[0.04] text-neutral-200")
              }
            >
              <p className="whitespace-pre-wrap">{entry.answer}</p>
              {entry.sources.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/10 pt-2.5">
                  {entry.sources.map((s, j) => (
                    <span
                      key={j}
                      className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-neutral-400"
                      title={`similarity ${s.similarity.toFixed(3)}`}
                    >
                      [{j + 1}] {s.source}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-1.5 self-start rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.04] px-4 py-3.5">
            <span className="bounce-dot h-1.5 w-1.5 rounded-full bg-neutral-400" />
            <span className="bounce-dot h-1.5 w-1.5 rounded-full bg-neutral-400" />
            <span className="bounce-dot h-1.5 w-1.5 rounded-full bg-neutral-400" />
          </div>
        )}
      </div>

      {/* Ask */}
      <form onSubmit={handleAsk} className="sticky bottom-16 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about your indexed documents…"
          className="flex-1 rounded-xl border border-white/10 bg-neutral-900/90 px-4 py-3 text-sm text-neutral-100 shadow-lg shadow-black/30 backdrop-blur placeholder:text-neutral-500 focus:border-indigo-400/50 focus:outline-none"
        />
        <span className="group relative">
          <button
            disabled={loading || !question.trim() || selectedSources.size === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {loading ? <Spinner /> : "Ask"}
          </button>
          {selectedSources.size === 0 && (
            <span className="pointer-events-none absolute bottom-full right-0 mb-2 w-max max-w-[220px] rounded-lg border border-white/10 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
              Upload or select a document before asking a question
              <span className="absolute right-4 top-full h-2 w-2 -translate-y-1 rotate-45 bg-neutral-800" />
            </span>
          )}
        </span>
      </form>
      </div>
      </div>

      {/* Token usage monitor */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-black/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-1 px-6 py-2.5 text-[11px] text-neutral-400 sm:justify-between">
          <span className="hidden font-medium uppercase tracking-widest text-neutral-600 sm:inline">
            Token usage
          </span>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            <span className="text-neutral-300">Voyage AI (embeddings)</span>
            <span className="font-mono text-neutral-500">{usage.voyageTokens.toLocaleString()} tok</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
            <span className="text-neutral-300">Groq (Llama 3.3 70B)</span>
            <span className="font-mono text-neutral-500">
              {usage.groqTotal.toLocaleString()} tok
              <span className="text-neutral-600"> ({usage.groqPrompt.toLocaleString()} in / {usage.groqCompletion.toLocaleString()} out)</span>
            </span>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl shadow-black/50 animate-fade-up"
          >
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-rose-500/10 text-rose-400">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 7h16M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m2 0v12a2 2 0 01-2 2H9a2 2 0 01-2-2V7h10z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2 className="text-center text-base font-semibold text-white">Delete this document?</h2>
            <p className="mt-2 text-center text-sm text-neutral-400">
              <span className="font-medium text-neutral-200">{deleteTarget.source}</span> and its{" "}
              <span className="font-medium text-rose-300">
                {deleteTarget.chunks} indexed chunk{deleteTarget.chunks === 1 ? "" : "s"}
              </span>{" "}
              will be permanently removed from the vector store. This can&apos;t be undone.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-neutral-300 transition hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-400"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
