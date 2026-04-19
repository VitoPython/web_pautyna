"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function AIPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    // Optimistic: add user message + empty assistant message we'll stream into.
    const nextMessages = [...messages, userMsg];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setDraft("");
    setStreaming(true);
    setError("");

    try {
      // SSE via fetch streaming (EventSource doesn't support POST with body).
      const resp = await fetch("/api/v1/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: nextMessages }),
      });
      if (!resp.ok || !resp.body) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse out complete SSE `data: ...\n\n` frames; keep the tail for the next chunk.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";

        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (typeof parsed.text === "string") {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: last.content + parsed.text };
                }
                return updated;
              });
            }
          } catch {
            // Ignore malformed frames (e.g. partial JSON)
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Помилка під час чату";
      setError(msg);
      // Drop the placeholder assistant bubble if we never got any text.
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.content === "") return prev.slice(0, -1);
        return prev;
      });
    } finally {
      setStreaming(false);
    }
  }, [draft, messages, streaming]);

  const clear = () => {
    setMessages([]);
    setError("");
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="flex items-center justify-between px-6 h-14 border-b border-zinc-800 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-white">AI Асистент</h1>
          <p className="text-xs text-zinc-500">Claude Opus 4.7 — для планування, підсумків і комунікації</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clear}
            className="text-xs text-zinc-500 hover:text-white transition-colors"
          >
            Очистити
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto flex flex-col gap-4">
          {messages.length === 0 && (
            <div className="text-center py-20">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} className="w-12 h-12 text-violet-500/40 mx-auto mb-4">
                <path d="M12 2L14.39 8.26L21 9.27L16 14.14L17.45 20.73L12 17.27L6.55 20.73L8 14.14L3 9.27L9.61 8.26L12 2z" />
              </svg>
              <p className="text-zinc-500 text-sm max-w-md mx-auto">
                Запитай про щось. Наприклад: &quot;Як відповісти другу який не писав 3 місяці&quot;,
                &quot;Зроби нагадування написати Папі в понеділок&quot;, &quot;Підсумуй мої контакти у LinkedIn&quot;.
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-violet-600 text-white"
                    : "bg-zinc-900 border border-zinc-800 text-zinc-100"
                }`}
              >
                {m.content || (streaming && i === messages.length - 1 ? (
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" style={{ animationDelay: "300ms" }} />
                  </span>
                ) : "")}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>

      {error && (
        <div className="px-6 pb-2">
          <div className="max-w-3xl mx-auto text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="p-4 border-t border-zinc-800 shrink-0"
      >
        <div className="flex gap-2 items-end max-w-3xl mx-auto">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Запитай щось..."
            rows={1}
            disabled={streaming}
            className="flex-1 px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none max-h-48 disabled:opacity-60"
            style={{ minHeight: "42px" }}
          />
          <button
            type="submit"
            disabled={streaming || !draft.trim()}
            className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {streaming ? "..." : "→"}
          </button>
        </div>
      </form>
    </div>
  );
}
