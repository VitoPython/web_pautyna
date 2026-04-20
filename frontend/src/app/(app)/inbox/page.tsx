"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useUIStore } from "@/stores/ui-store";
import ChatAvatar from "@/components/ChatAvatar";

interface Chat {
  contact_id: string;
  contact_name: string;
  contact_avatar: string;
  platform: string;
  last_message: string;
  last_direction: string;
  last_sent_at: string;
  unread_count: number;
}

interface Message {
  _id: string;
  contact_id: string;
  platform: string;
  direction: "inbound" | "outbound";
  content: string;
  subject?: string;
  sent_at: string;
  read: boolean;
}

const PLATFORM_BADGE: Record<string, { label: string; cls: string; color: string }> = {
  telegram: { label: "Telegram", cls: "bg-sky-500/15 text-sky-400", color: "#38bdf8" },
  gmail: { label: "Gmail", cls: "bg-red-500/15 text-red-400", color: "#f87171" },
  google_oauth: { label: "Gmail", cls: "bg-red-500/15 text-red-400", color: "#f87171" },
  outlook: { label: "Outlook", cls: "bg-indigo-500/15 text-indigo-400", color: "#818cf8" },
  linkedin: { label: "LinkedIn", cls: "bg-blue-500/15 text-blue-400", color: "#60a5fa" },
  instagram: { label: "Instagram", cls: "bg-pink-500/15 text-pink-400", color: "#f472b6" },
  whatsapp: { label: "WhatsApp", cls: "bg-emerald-500/15 text-emerald-400", color: "#34d399" },
};

type PlatformFilter = "all" | "telegram" | "gmail" | "google_oauth" | "outlook" | "linkedin" | "instagram" | "whatsapp";

export default function InboxPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [draft, setDraft] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const setUnreadMessages = useUIStore((s) => s.setUnreadMessages);
  const searchParams = useSearchParams();
  const contactParam = searchParams?.get("contact") || "";
  const autoSelectedRef = useRef(false);

  const loadChats = useCallback(async () => {
    try {
      const { data } = await api.get<Chat[]>("/messages/chats");
      setChats(data);
      setUnreadMessages(data.reduce((s, c) => s + (c.unread_count || 0), 0));
    } finally {
      setLoading(false);
    }
  }, [setUnreadMessages]);

  // Replace messages only when something actually changed — compare length +
  // last message id — so polling a stable thread doesn't cause a re-render
  // storm that visually "jumps" the view.
  const applyMessages = useCallback((next: Message[]) => {
    setMessages((prev) => {
      if (
        prev.length === next.length &&
        prev.length > 0 &&
        prev[prev.length - 1]?._id === next[next.length - 1]?._id &&
        prev[0]?._id === next[0]?._id
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const loadMessages = useCallback(async (contactId: string, opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoadingMessages(true);
    try {
      const { data } = await api.get(`/messages/contact/${contactId}`);
      applyMessages(data);
    } finally {
      if (!opts.silent) setLoadingMessages(false);
    }
  }, [applyMessages]);

  const syncMessages = useCallback(async (contactId: string, opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setSyncing(true);
    try {
      await api.post(`/messages/contact/${contactId}/sync`);
      await loadMessages(contactId, { silent: true });
      await loadChats();
    } catch {
      // silent
    } finally {
      if (!opts.silent) setSyncing(false);
    }
  }, [loadMessages, loadChats]);

  useEffect(() => { loadChats(); }, [loadChats]);

  // Auto-select chat when coming from an external link (e.g. Canvas "send" action).
  // Runs once per session: first time chats arrive and the `?contact=<id>` matches a chat.
  useEffect(() => {
    if (!contactParam || autoSelectedRef.current || chats.length === 0) return;
    const match = chats.find((c) => c.contact_id === contactParam);
    if (match) {
      setSelectedChat(match);
      autoSelectedRef.current = true;
    }
  }, [contactParam, chats]);

  // WebSocket for real-time updates
  useWebSocket((event) => {
    if (event.type === "new_message") {
      loadChats();
      const payload = event.payload as { contact_id: string };
      if (selectedChat?.contact_id === payload.contact_id) {
        loadMessages(selectedChat.contact_id, { silent: true });
      }
    }
  });

  // Auto-scroll only when the message count grows or we switched chats.
  // Without this gate, every idempotent poll fires a scroll animation.
  const prevLenRef = useRef(0);
  const prevChatRef = useRef<string | null>(null);
  useEffect(() => {
    const chatId = selectedChat?.contact_id || null;
    const switched = chatId !== prevChatRef.current;
    const grew = messages.length > prevLenRef.current;
    if (switched || grew) {
      messagesEndRef.current?.scrollIntoView({
        behavior: switched ? "auto" : "smooth",
      });
    }
    prevLenRef.current = messages.length;
    prevChatRef.current = chatId;
  }, [messages, selectedChat?.contact_id]);

  // When chat is selected — load + silently sync messages (sync must not
  // toggle the loading spinner, or the user sees a flash every switch).
  useEffect(() => {
    if (!selectedChat) return;
    loadMessages(selectedChat.contact_id);
    syncMessages(selectedChat.contact_id, { silent: true });
  }, [selectedChat?.contact_id]); // eslint-disable-line

  // Interim polling — real-time via Unipile requires webhooks (public URL).
  // On localhost we fall back to polling: chat list every 20s and the open
  // chat every 8s. Remove once ngrok/public URL is configured.
  useEffect(() => {
    const listTimer = setInterval(() => { loadChats(); }, 10000);
    return () => clearInterval(listTimer);
  }, [loadChats]);

  useEffect(() => {
    if (!selectedChat) return;
    const id = selectedChat.contact_id;
    const msgTimer = setInterval(() => {
      // Sync silently so the chat view does not flash a spinner or rebind.
      api.post(`/messages/contact/${id}/sync`)
        .then(() => api.get<Message[]>(`/messages/contact/${id}`))
        .then(({ data }) => applyMessages(data))
        .catch(() => {});
    }, 8000);
    return () => clearInterval(msgTimer);
  }, [selectedChat?.contact_id, applyMessages]); // eslint-disable-line

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChat || !draft.trim()) return;
    setSending(true);
    setSendError("");
    try {
      await api.post("/messages/send", {
        contact_id: selectedChat.contact_id,
        platform: selectedChat.platform,
        content: draft,
        subject: emailSubject,
      });
      setDraft("");
      setEmailSubject("");
      // Silent refresh — avoid toggling the loading spinner and re-rendering
      // the whole thread, which is what makes the chat appear to "jump".
      await loadMessages(selectedChat.contact_id, { silent: true });
      await loadChats();
    } catch (err: unknown) {
      setSendError(getErrorMessage(err, "Не вдалось надіслати"));
    } finally {
      setSending(false);
    }
  };

  const isEmailPlatform = !!selectedChat &&
    ["gmail", "google_oauth", "outlook", "email"].includes(selectedChat.platform);

  const suggestReply = async () => {
    if (!selectedChat || aiLoading) return;
    setAiLoading(true);
    setAiSuggestions([]);
    try {
      const { data } = await api.post<{ suggestions: string[] }>(
        "/ai/suggest-reply",
        { contact_id: selectedChat.contact_id },
      );
      setAiSuggestions(data.suggestions || []);
    } catch (err) {
      setSendError(getErrorMessage(err, "Не вдалось згенерувати варіанти"));
    } finally {
      setAiLoading(false);
    }
  };

  // Clear suggestions when the user switches chats.
  useEffect(() => {
    setAiSuggestions([]);
  }, [selectedChat?.contact_id]);

  const filteredChats = chats.filter((c) => {
    if (search && !c.contact_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (platformFilter !== "all" && c.platform !== platformFilter) return false;
    if (unreadOnly && c.unread_count === 0) return false;
    return true;
  });

  const platformsInUse = Array.from(new Set(chats.map((c) => c.platform))) as PlatformFilter[];

  const totalUnread = chats.reduce((sum, c) => sum + c.unread_count, 0);

  return (
    <div className="flex h-full">
      {/* Chat list */}
      <div className={`md:w-80 md:shrink-0 md:border-r md:border-zinc-800 md:flex flex-col w-full ${
        selectedChat ? "hidden md:flex" : "flex flex-1"
      }`}>
        <div className="p-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-white">Inbox</h1>
            {totalUnread > 0 && (
              <span className="px-2 py-0.5 bg-violet-500/20 text-violet-400 text-xs rounded-full font-medium">
                {totalUnread} нових
              </span>
            )}
          </div>
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук чатів..."
              className="w-full pl-10 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-violet-500"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            <FilterChip active={!unreadOnly && platformFilter === "all"} onClick={() => { setUnreadOnly(false); setPlatformFilter("all"); }}>
              Всі
            </FilterChip>
            <FilterChip active={unreadOnly} onClick={() => setUnreadOnly((v) => !v)}>
              Непрочитані{totalUnread > 0 ? ` · ${totalUnread}` : ""}
            </FilterChip>
            {platformsInUse.map((p) => (
              <FilterChip
                key={p}
                active={platformFilter === p}
                onClick={() => setPlatformFilter((cur) => (cur === p ? "all" : p))}
              >
                {PLATFORM_BADGE[p]?.label || p}
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-14 h-14 rounded-full bg-zinc-800/50 mx-auto mb-3 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7 text-zinc-600">
                  <rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22,4 12,13 2,4" />
                </svg>
              </div>
              <p className="text-zinc-500 text-sm">
                {search ? "Нічого не знайдено" : "Немає повідомлень"}
              </p>
              {!search && (
                <p className="text-zinc-600 text-xs mt-2">
                  Повідомлення з&apos;являться автоматично
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              {filteredChats.map((chat) => {
                const badge = PLATFORM_BADGE[chat.platform];
                const isActive = selectedChat?.contact_id === chat.contact_id;
                const isUnread = chat.unread_count > 0;
                return (
                  <button
                    key={`${chat.contact_id}-${chat.platform}`}
                    onClick={() => setSelectedChat(chat)}
                    className={`flex items-start gap-3 p-3 text-left border-b border-zinc-800/40 transition-colors ${
                      isActive ? "bg-zinc-800/60" : "hover:bg-zinc-900/60"
                    }`}
                  >
                    <ChatAvatar url={chat.contact_avatar} name={chat.contact_name} size="lg" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className={`text-sm truncate ${isUnread ? "font-semibold text-white" : "font-medium text-zinc-200"}`}>
                          {chat.contact_name}
                        </p>
                        {badge && (
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${badge.cls}`}>
                            {badge.label}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <p className={`text-xs truncate flex-1 ${isUnread ? "text-zinc-300" : "text-zinc-500"}`}>
                          {chat.last_direction === "outbound" && "Ви: "}
                          {chat.last_message || "—"}
                        </p>
                        {isUnread && (
                          <span className="w-5 h-5 rounded-full bg-violet-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                            {chat.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Chat view */}
      <div className={`flex-1 min-w-0 flex-col ${selectedChat ? "flex" : "hidden md:flex"}`}>
        {!selectedChat ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="w-16 h-16 text-zinc-700 mx-auto mb-3">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <polyline points="22,4 12,13 2,4" />
              </svg>
              <p className="text-zinc-600">Оберіть чат зліва</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center justify-between px-4 md:px-6 h-14 border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setSelectedChat(null)}
                  className="md:hidden text-zinc-400 hover:text-white p-1 -ml-1"
                  aria-label="Назад"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                    <polyline points="15,18 9,12 15,6" />
                  </svg>
                </button>
                <ChatAvatar url={selectedChat.contact_avatar} name={selectedChat.contact_name} size="sm" />
                <div className="min-w-0">
                  <p className="text-white font-semibold truncate">{selectedChat.contact_name}</p>
                  <p className="text-xs text-zinc-500">
                    {PLATFORM_BADGE[selectedChat.platform]?.label || selectedChat.platform}
                  </p>
                </div>
              </div>
              <button
                onClick={() => syncMessages(selectedChat.contact_id)}
                disabled={syncing}
                className="text-zinc-500 hover:text-white transition-colors disabled:opacity-50"
                title="Оновити"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`}>
                  <polyline points="23,4 23,10 17,10" />
                  <polyline points="1,20 1,14 7,14" />
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-auto px-6 py-4">
              {loadingMessages ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-zinc-600 text-sm">Історія порожня. Напишіть першим!</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-w-3xl mx-auto">
                  {messages.map((msg) => (
                    <MessageBubble key={msg._id} message={msg} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Composer */}
            <form onSubmit={handleSend} className="p-4 border-t border-zinc-800 shrink-0">
              {sendError && (
                <p className="text-red-400 text-sm mb-2">{sendError}</p>
              )}
              {isEmailPlatform && (
                <div className="max-w-3xl mx-auto mb-2">
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Тема листа"
                    className="w-full px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-violet-500"
                  />
                </div>
              )}
              {aiSuggestions.length > 0 && (
                <div className="max-w-3xl mx-auto mb-2 flex flex-wrap gap-1.5">
                  {aiSuggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { setDraft(s); setAiSuggestions([]); }}
                      className="px-3 py-1.5 text-xs bg-violet-500/15 text-violet-200 border border-violet-500/30 rounded-full hover:bg-violet-500/25 transition-colors text-left max-w-full truncate"
                      title={s}
                    >
                      {s.length > 80 ? s.slice(0, 80) + "…" : s}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAiSuggestions([])}
                    className="px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    ✕
                  </button>
                </div>
              )}
              <div className="flex gap-2 items-end max-w-3xl mx-auto">
                <button
                  type="button"
                  onClick={suggestReply}
                  disabled={aiLoading || messages.length === 0}
                  title="Запропонувати відповідь (Claude)"
                  className="px-3 py-2.5 text-zinc-300 bg-zinc-800 hover:bg-violet-500/20 hover:text-violet-300 border border-zinc-700 hover:border-violet-500/40 rounded-lg transition-colors disabled:opacity-40 shrink-0"
                >
                  {aiLoading ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 animate-spin">
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                      <path d="M12 2L14.39 8.26L21 9.27L16 14.14L17.45 20.73L12 17.27L6.55 20.73L8 14.14L3 9.27L9.61 8.26L12 2z" />
                    </svg>
                  )}
                </button>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(e as unknown as React.FormEvent);
                    }
                  }}
                  placeholder={`Повідомлення через ${PLATFORM_BADGE[selectedChat.platform]?.label || "..."}`}
                  rows={1}
                  className="flex-1 px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none max-h-32"
                  style={{ minHeight: "42px" }}
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  {sending ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22,2 15,22 11,13 2,9" />
                      </svg>
                      Відправити
                    </>
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
        active
          ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
          : "bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300 hover:border-zinc-700"
      }`}
    >
      {children}
    </button>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isOut = message.direction === "outbound";
  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${
          isOut
            ? "bg-violet-600 text-white rounded-br-sm"
            : "bg-zinc-800 text-zinc-100 rounded-bl-sm"
        }`}
      >
        {message.subject && (
          <p className={`text-xs font-semibold mb-1 ${isOut ? "text-violet-200" : "text-zinc-400"}`}>
            {message.subject}
          </p>
        )}
        <p className="whitespace-pre-wrap wrap-break-word">{message.content}</p>
        <p className={`text-[10px] mt-1 ${isOut ? "text-violet-200" : "text-zinc-500"} text-right`}>
          {new Date(message.sent_at).toLocaleTimeString("uk", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}
