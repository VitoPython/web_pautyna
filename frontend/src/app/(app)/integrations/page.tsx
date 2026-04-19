"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useWebSocket } from "@/hooks/useWebSocket";

interface UnipileAccount {
  account_id: string;
  provider: string;
  status: string;
  name?: string;
  email?: string;
  connected_at?: string | null;
  orphan?: boolean;
}

const PROVIDERS = [
  { code: "TELEGRAM", label: "Telegram", cls: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  { code: "LINKEDIN", label: "LinkedIn", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  { code: "GOOGLE", label: "Gmail", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  { code: "INSTAGRAM", label: "Instagram", cls: "bg-pink-500/15 text-pink-400 border-pink-500/30" },
  { code: "WHATSAPP", label: "WhatsApp", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  { code: "GOOGLE_CALENDAR", label: "Google Calendar", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  { code: "OUTLOOK", label: "Outlook", cls: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30" },
];

function providerMeta(code: string) {
  const norm = (code || "").toUpperCase();
  return PROVIDERS.find((p) => p.code === norm) || { code: norm, label: code || "Unknown", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" };
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uk", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function IntegrationsPage() {
  const [accounts, setAccounts] = useState<UnipileAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeBusy, setWipeBusy] = useState(false);
  const [wipeResult, setWipeResult] = useState<{ contacts: number; messages: number; notifications: number; pages: number } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<UnipileAccount[]>("/unipile/accounts");
      setAccounts(data);
    } catch (err) {
      setError(getErrorMessage(err, "Не вдалось завантажити акаунти"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh when Unipile webhook confirms a new account connection.
  useWebSocket((event) => {
    if (event.type === "unipile_connected") load();
  });

  const connect = async (providerCode: string) => {
    setConnecting(providerCode);
    setError("");
    try {
      const { data } = await api.post<{ url: string }>("/unipile/hosted-link", {
        providers: providerCode === "*" ? "*" : [providerCode],
      });
      // Open Unipile's hosted auth in a new tab.
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(getErrorMessage(err, "Не вдалось згенерувати посилання"));
    } finally {
      setConnecting(null);
    }
  };

  const disconnect = async (accountId: string) => {
    if (!confirm("Відключити цей акаунт?")) return;
    const prev = accounts;
    setAccounts((list) => list.filter((a) => a.account_id !== accountId));
    try {
      await api.delete(`/unipile/accounts/${accountId}`);
    } catch (err) {
      setAccounts(prev);
      setError(getErrorMessage(err, "Не вдалось відключити"));
    }
  };

  const claim = async (accountId: string) => {
    try {
      await api.post(`/unipile/accounts/${accountId}/claim`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Не вдалось прив'язати"));
    }
  };

  const wipeLegacy = async () => {
    setWipeBusy(true);
    try {
      const { data } = await api.post<{ wiped: { contacts: number; messages: number; notifications: number; pages: number } }>("/integrations/wipe-legacy");
      setWipeResult(data.wiped);
    } catch (err) {
      setError(getErrorMessage(err, "Не вдалось очистити"));
    } finally {
      setWipeBusy(false);
    }
  };

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Інтеграції</h1>
            <p className="text-zinc-500 text-sm mt-1">Підключення платформ через Unipile — єдиний шлюз для Telegram, Gmail, LinkedIn, Instagram і календарів.</p>
          </div>
          <button
            onClick={() => setWipeOpen(true)}
            className="px-3 py-2 text-xs text-zinc-400 hover:text-red-400 border border-zinc-800 hover:border-red-500/40 rounded-lg transition-colors"
            title="Видалити всі старі контакти, повідомлення, сесії (legacy migration)"
          >
            Очистити старі дані
          </button>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Provider grid — click to connect via hosted link */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">Підключити акаунт</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.code}
                onClick={() => connect(p.code)}
                disabled={connecting === p.code}
                className={`p-4 rounded-xl border text-left transition-colors hover:border-violet-500/40 hover:bg-violet-500/5 disabled:opacity-50 ${p.cls}`}
              >
                <div className="text-sm font-medium">{p.label}</div>
                <div className="text-[11px] opacity-70 mt-1">
                  {connecting === p.code ? "Генеруємо посилання…" : "Connect →"}
                </div>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-zinc-500 mt-3">
            Відкриється сторінка Unipile у новій вкладці. Залогіньтесь у потрібному сервісі — акаунт автоматично з&apos;явиться нижче.
          </p>
        </div>

        {/* Connected accounts */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">Підключені акаунти</h2>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex items-center justify-center h-32 border border-dashed border-zinc-800 rounded-xl">
              <p className="text-zinc-600 text-sm">Ще нічого не підключено</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {accounts.map((a) => {
                const meta = providerMeta(a.provider);
                return (
                  <div
                    key={a.account_id}
                    className="flex items-center gap-3 p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl"
                  >
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0 ${meta.cls}`}>
                      {meta.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm truncate">
                        {a.name || a.email || a.account_id}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {a.status} · підключено {formatDate(a.connected_at)}
                        {a.orphan && <span className="ml-2 text-amber-400">(not synced)</span>}
                      </p>
                    </div>
                    {a.orphan && (
                      <button
                        onClick={() => claim(a.account_id)}
                        className="px-2.5 py-1.5 text-[11px] text-violet-300 bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 rounded-lg transition-colors shrink-0"
                      >
                        Прив&apos;язати
                      </button>
                    )}
                    <button
                      onClick={() => disconnect(a.account_id)}
                      title="Відключити"
                      className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Wipe-legacy confirmation */}
      {wipeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => !wipeBusy && setWipeOpen(false)} />
          <div className="relative bg-zinc-900 border border-red-500/30 rounded-xl max-w-md w-full p-6 shadow-2xl">
            {wipeResult ? (
              <>
                <h3 className="text-white font-semibold mb-3">Готово</h3>
                <p className="text-sm text-zinc-400 mb-4">Очищено:</p>
                <ul className="text-sm text-zinc-300 space-y-1 mb-5">
                  <li>Контактів: <span className="text-red-400">{wipeResult.contacts}</span></li>
                  <li>Повідомлень: <span className="text-red-400">{wipeResult.messages}</span></li>
                  <li>Нотифікацій: <span className="text-red-400">{wipeResult.notifications}</span></li>
                  <li>Сторінок: <span className="text-red-400">{wipeResult.pages}</span></li>
                </ul>
                <button
                  onClick={() => { setWipeOpen(false); setWipeResult(null); }}
                  className="w-full py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm"
                >
                  Закрити
                </button>
              </>
            ) : (
              <>
                <h3 className="text-white font-semibold mb-3">⚠️ Очистити старі дані?</h3>
                <p className="text-sm text-zinc-400 mb-4">
                  Буде видалено всі контакти, повідомлення, нотифікації, сторінки, actions та скинуто canvas.
                  <br /><br />
                  <strong className="text-red-400">Це необоротно.</strong> Використовуйте після підключення Unipile, щоб почати з чистого стану.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setWipeOpen(false)}
                    disabled={wipeBusy}
                    className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm"
                  >
                    Скасувати
                  </button>
                  <button
                    onClick={wipeLegacy}
                    disabled={wipeBusy}
                    className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm disabled:opacity-50"
                  >
                    {wipeBusy ? "Чищу…" : "Так, очистити"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
