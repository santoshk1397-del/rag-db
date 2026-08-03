"use client";

import { useEffect, useState } from "react";

type Source = { source: string; similarity: number };
type ChatEntry = { question: string; answer: string; sources: Source[] };

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ChatEntry[]>([]);

  const [allSources, setAllSources] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());

  async function refreshSources() {
    const res = await fetch("/api/documents");
    const data = await res.json();
    if (res.ok) {
      setAllSources(data.sources);
      // default to "all selected" for any newly-seen source
      setSelectedSources((prev) => {
        const next = new Set(prev);
        data.sources.forEach((s: string) => {
          if (!allSources.includes(s)) next.add(s);
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

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploadStatus("Indexing...");

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();

    setUploadStatus(
      res.ok
        ? `Indexed ${data.chunksIndexed} chunks from ${data.source}`
        : `Error: ${data.error}`
    );

    if (res.ok) await refreshSources();
  }

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, sources: Array.from(selectedSources) }),
    });
    const data = await res.json();

    if (res.ok) {
      setHistory((h) => [...h, { question, answer: data.answer, sources: data.sources }]);
      setQuestion("");
    } else {
      setHistory((h) => [...h, { question, answer: `Error: ${data.error}`, sources: [] }]);
    }
    setLoading(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
      <h1 className="text-2xl font-semibold">RAG Q&A Demo</h1>

      <form onSubmit={handleUpload} className="flex flex-col gap-2">
        <label className="text-sm text-neutral-400">
          Upload a document (.pdf or .txt) to index
        </label>
        <div className="flex gap-2">
          <input
            type="file"
            accept=".pdf,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="flex-1 rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
          />
          <button className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500">
            Index
          </button>
        </div>
        {uploadStatus && <p className="text-sm text-neutral-400">{uploadStatus}</p>}
      </form>

      {allSources.length > 0 && (
        <div className="flex flex-col gap-2 rounded border border-neutral-800 p-4">
          <p className="text-sm text-neutral-400">
            Search within (uncheck to exclude a document from retrieval):
          </p>
          <div className="flex flex-col gap-1">
            {allSources.map((source) => (
              <label key={source} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedSources.has(source)}
                  onChange={() => toggleSource(source)}
                  className="accent-blue-600"
                />
                {source}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {history.map((entry, i) => (
          <div key={i} className="rounded border border-neutral-800 p-4">
            <p className="font-medium text-neutral-200">{entry.question}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-300">{entry.answer}</p>
            {entry.sources.length > 0 && (
              <p className="mt-2 text-xs text-neutral-500">
                Sources: {entry.sources.map((s) => s.source).join(", ")}
              </p>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleAsk} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about your indexed documents..."
          className="flex-1 rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
        />
        <button
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? "Thinking..." : "Ask"}
        </button>
      </form>
    </main>
  );
}
