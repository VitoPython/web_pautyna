"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";

interface IntegrationStatus {
  gmail: { connected: boolean; email: string };
  telegram: { connected: boolean; phone: string };
  linkedin: { connected: boolean; name: string };
  instagram: { connected: boolean; username: string };
}

const INTEGRATIONS = [
  {
    key: "gmail", name: "Gmail",
    description: "Імпорт контактів, читання та відправка листів",
    color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/30",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8"><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22,4 12,13 2,4" /></svg>,
  },
  {
    key: "telegram", name: "Telegram",
    description: "Всі чати, контакти та повідомлення 24/7",
    color: "text-sky-400", bgColor: "bg-sky-500/10", borderColor: "border-sky-500/30",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8"><path d="M21.2 4.4L2.4 11.3c-.7.3-.7.8.1 1l4.8 1.5 1.9 5.9c.2.6.5.7 1 .4l2.7-2.2 5.3 3.9c1 .5 1.5.3 1.7-.8L22.8 5.6c.3-1.1-.4-1.6-1.6-1.2z" /><path d="M9.3 13.8l8.5-5.2" /></svg>,
  },
  {
    key: "linkedin", name: "LinkedIn",
    description: "Імпорт профілю та зв'язків",
    color: "text-blue-400", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/30",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8"><rect x="2" y="2" width="20" height="20" rx="4" /><path d="M7 10v7M7 7v.01M11 10v7m0-4c0-2 1.5-3 3-3s3 1 3 3v4" /></svg>,
  },
  {
    key: "instagram", name: "Instagram",
    description: "Followers та DM (Business акаунти)",
    color: "text-pink-400", bgColor: "bg-pink-500/10", borderColor: "border-pink-500/30",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>,
  },
];

export default function IntegrationsPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [tgModal, setTgModal] = useState<"connect" | "sync" | false>(false);
  const [gmailModal, setGmailModal] = useState(false);

  const loadStatus = useCallback(() => {
    api.get("/integrations/status").then(({ data }) => setStatus(data)).catch(() => {});
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleConnect = useCallback(async (key: string) => {
    if (key === "telegram") {
      const tgStatus = status?.telegram;
      setTgModal(tgStatus?.connected ? "sync" : "connect");
    } else if (key === "gmail") {
      const gmailStatus = status?.gmail;
      if (gmailStatus?.connected) {
        setGmailModal(true);
      } else {
        try {
          const { data } = await api.get("/gmail/auth/url");
          window.location.href = data.url;
        } catch { alert("Помилка підключення Gmail"); }
      }
    } else if (key === "linkedin") {
      const liStatus = status?.linkedin;
      if (liStatus?.connected) {
        alert("LinkedIn вже підключено");
      } else {
        try {
          const { data } = await api.get("/linkedin/auth/url");
          window.location.href = data.url;
        } catch { alert("Помилка підключення LinkedIn"); }
      }
    } else {
      alert(`${key} інтеграція буде доступна найближчим часом`);
    }
  }, [status, loadStatus]);

  const handleDisconnect = useCallback(async (key: string) => {
    if (key === "telegram") {
      await api.post("/telegram/disconnect");
      loadStatus();
    } else if (key === "gmail") {
      await api.post("/gmail/disconnect");
      loadStatus();
    } else if (key === "linkedin") {
      await api.post("/linkedin/disconnect");
      loadStatus();
    }
  }, [loadStatus]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Інтеграції</h1>
        <p className="text-zinc-500 text-sm mt-1">Підключіть акаунти для імпорту контактів та повідомлень</p>
      </div>

      <div className="grid gap-4">
        {INTEGRATIONS.map((integration) => {
          const s = status?.[integration.key as keyof IntegrationStatus];
          const connected = s?.connected ?? false;
          const detail = s && "phone" in s ? s.phone : s && "email" in s ? s.email : s && "username" in s ? s.username : "";

          return (
            <div key={integration.key}
              className={`bg-zinc-900 border rounded-xl p-5 flex items-center gap-4 transition-colors ${connected ? integration.borderColor : "border-zinc-800"}`}>
              <div className={`w-12 h-12 rounded-lg ${integration.bgColor} flex items-center justify-center shrink-0 ${integration.color}`}>
                {integration.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-medium">{integration.name}</h3>
                  {connected && <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-400 text-xs rounded-full">Підключено</span>}
                </div>
                <p className="text-zinc-500 text-sm mt-0.5">{integration.description}</p>
                {connected && detail && <p className="text-zinc-400 text-xs mt-1">{detail}</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                {connected && (
                  <button onClick={() => handleDisconnect(integration.key)}
                    className="px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                    Відключити
                  </button>
                )}
                <button onClick={() => handleConnect(integration.key)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    connected ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" : "bg-violet-600 hover:bg-violet-500 text-white"
                  }`}>
                  {connected ? "Синхронізувати" : "Підключити"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
        <p className="text-zinc-500 text-sm text-center">Всі інтеграції доступні безкоштовно на Free плані</p>
      </div>

      {/* Telegram connect modal */}
      {tgModal && (
        <TelegramModal
          startAtSelect={tgModal === "sync"}
          onDone={() => { setTgModal(false); loadStatus(); }}
          onClose={() => setTgModal(false)}
        />
      )}

      {/* Gmail select modal */}
      {gmailModal && (
        <GmailSelectModal
          onDone={() => { setGmailModal(false); loadStatus(); }}
          onClose={() => setGmailModal(false)}
        />
      )}
    </div>
  );
}

// ── Telegram Connection Modal ──
interface TgContact { tg_id: string; name: string; username: string; phone: string; already_imported: boolean; }

function TelegramModal({ startAtSelect, onDone, onClose }: { startAtSelect?: boolean; onDone: () => void; onClose: () => void }) {
  const [step, setStep] = useState<"phone" | "code" | "2fa" | "select" | "importing" | "done">(startAtSelect ? "select" : "phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [phoneCodeHash, setPhoneCodeHash] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Select contacts
  const [tgContacts, setTgContacts] = useState<TgContact[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchLoading, setSearchLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number } | null>(null);

  // Load contacts immediately if starting at select
  useEffect(() => {
    if (startAtSelect) {
      setSearchLoading(true);
      api.get("/telegram/contacts").then(({ data }) => setTgContacts(data)).catch(() => {}).finally(() => setSearchLoading(false));
    }
  }, [startAtSelect]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const { data } = await api.post("/telegram/auth/start", { phone });
      setPhoneCodeHash(data.phone_code_hash);
      setStep("code");
    } catch (err: unknown) { setError(getErrorMessage(err, "Не вдалось відправити код")); }
    finally { setLoading(false); }
  };

  const goToSelect = async () => {
    setStep("select");
    setSearchLoading(true);
    try {
      const { data } = await api.get("/telegram/contacts");
      setTgContacts(data);
    } catch { /* ignore */ }
    finally { setSearchLoading(false); }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const { data } = await api.post("/telegram/auth/verify", { phone, code, phone_code_hash: phoneCodeHash, password });
      if (data.status === "2fa_required") { setStep("2fa"); }
      else { await goToSelect(); }
    } catch (err: unknown) { setError(getErrorMessage(err, "Невірний код")); }
    finally { setLoading(false); }
  };

  const handle2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      await api.post("/telegram/auth/verify", { phone, code, phone_code_hash: phoneCodeHash, password });
      await goToSelect();
    } catch (err: unknown) { setError(getErrorMessage(err, "Невірний пароль")); }
    finally { setLoading(false); }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  };

  const selectAll = () => {
    const ids = filteredContacts.filter((c) => !c.already_imported).map((c) => c.tg_id);
    setSelected(new Set(ids));
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    setStep("importing");
    try {
      const { data } = await api.post("/telegram/contacts/import", { contact_ids: Array.from(selected) });
      setImportResult(data);
      setStep("done");
    } catch { setStep("select"); }
  };

  const handleSearch = async (q: string) => {
    setSearch(q);
    setSearchLoading(true);
    try {
      const { data } = await api.get(`/telegram/contacts?q=${encodeURIComponent(q)}`);
      setTgContacts(data);
    } catch { /* ignore */ }
    finally { setSearchLoading(false); }
  };

  const filteredContacts = tgContacts;

  const stepLabel = { phone: "Крок 1 — номер телефону", code: "Крок 2 — код підтвердження", "2fa": "Двофакторний пароль", select: "Оберіть контакти", importing: "Імпорт...", done: "Готово!" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full ${step === "select" ? "max-w-lg" : "max-w-md"} p-6 shadow-2xl max-h-[85vh] flex flex-col`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5 text-sky-400">
                <path d="M21.2 4.4L2.4 11.3c-.7.3-.7.8.1 1l4.8 1.5 1.9 5.9c.2.6.5.7 1 .4l2.7-2.2 5.3 3.9c1 .5 1.5.3 1.7-.8L22.8 5.6c.3-1.1-.4-1.6-1.6-1.2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Telegram</h2>
              <p className="text-zinc-500 text-xs">{stepLabel[step]}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg shrink-0"><p className="text-red-400 text-sm">{error}</p></div>}

        {/* Phone */}
        {step === "phone" && (
          <form onSubmit={handleSendCode}>
            <p className="text-zinc-400 text-sm mb-4">Введіть номер телефону вашого Telegram акаунту.</p>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required autoFocus placeholder="+380XXXXXXXXX"
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-lg text-center tracking-widest placeholder-zinc-600 focus:outline-none focus:border-sky-500 mb-4" />
            <button type="submit" disabled={loading || phone.length < 10}
              className="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium rounded-lg">{loading ? "Відправляю..." : "Надіслати код"}</button>
          </form>
        )}

        {/* Code */}
        {step === "code" && (
          <form onSubmit={handleVerifyCode}>
            <p className="text-zinc-400 text-sm mb-4">Код надіслано на <span className="text-white">{phone}</span></p>
            <input type="text" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus placeholder="12345" maxLength={6}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-2xl text-center tracking-[0.5em] placeholder-zinc-600 focus:outline-none focus:border-sky-500 mb-4" />
            <button type="submit" disabled={loading || code.length < 4}
              className="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium rounded-lg">{loading ? "Перевіряю..." : "Підтвердити"}</button>
          </form>
        )}

        {/* 2FA */}
        {step === "2fa" && (
          <form onSubmit={handle2FA}>
            <p className="text-zinc-400 text-sm mb-4">Двофакторна автентифікація. Введіть пароль.</p>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus placeholder="Пароль 2FA"
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500 mb-4" />
            <button type="submit" disabled={loading || !password}
              className="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium rounded-lg">{loading ? "Перевіряю..." : "Підтвердити"}</button>
          </form>
        )}

        {/* Select contacts */}
        {step === "select" && (
          <>
            <div className="flex items-center gap-2 mb-3 shrink-0">
              <div className="relative flex-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input type="text" value={search} onChange={(e) => handleSearch(e.target.value)} placeholder="Пошук контактів..."
                  className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-sky-500" />
              </div>
              <button onClick={selectAll} className="px-3 py-2 text-xs text-sky-400 hover:bg-sky-500/10 rounded-lg whitespace-nowrap">Обрати все</button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
              {searchLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filteredContacts.length === 0 ? (
                <p className="text-zinc-600 text-sm text-center py-10">Контактів не знайдено</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {filteredContacts.map((c) => (
                    <label key={c.tg_id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                        c.already_imported ? "opacity-50" : selected.has(c.tg_id) ? "bg-sky-500/10" : "hover:bg-zinc-800"
                      }`}>
                      <input type="checkbox" disabled={c.already_imported} checked={selected.has(c.tg_id) || c.already_imported}
                        onChange={() => toggleSelect(c.tg_id)}
                        className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-sky-500 focus:ring-sky-500 focus:ring-offset-0" />
                      <div className="w-8 h-8 rounded-full bg-sky-500/15 flex items-center justify-center text-sm font-bold text-sky-400 shrink-0">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{c.name}</p>
                        <p className="text-zinc-500 text-xs truncate">
                          {c.username ? `@${c.username}` : c.phone || "—"}
                          {c.already_imported && " · вже додано"}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800 shrink-0">
              <p className="text-zinc-500 text-sm">Обрано: <span className="text-white">{selected.size}</span></p>
              <button onClick={handleImport} disabled={selected.size === 0}
                className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                Імпортувати обраних
              </button>
            </div>
          </>
        )}

        {/* Importing */}
        {step === "importing" && (
          <div className="text-center py-8">
            <div className="w-10 h-10 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white font-medium">Імпорт контактів...</p>
          </div>
        )}

        {/* Done */}
        {step === "done" && (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-7 h-7 text-emerald-400"><polyline points="20,6 9,17 4,12" /></svg>
            </div>
            <p className="text-white font-medium text-lg mb-1">Готово!</p>
            {importResult && <p className="text-zinc-400 text-sm">Імпортовано: <strong className="text-emerald-400">{importResult.imported}</strong> контактів</p>}
            <button onClick={onDone} className="mt-5 px-6 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg">Готово</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Gmail Select Modal ──
interface GmailContact { google_id: string; name: string; email: string; phone: string; company: string; job_title: string; avatar: string; already_imported: boolean; }

function GmailSelectModal({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [contacts, setContacts] = useState<GmailContact[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number } | null>(null);

  useEffect(() => {
    api.get("/gmail/contacts").then(({ data }) => setContacts(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSearch = async (q: string) => {
    setSearch(q);
    setLoading(true);
    try {
      const { data } = await api.get(`/gmail/contacts?q=${encodeURIComponent(q)}`);
      setContacts(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  };

  const selectAll = () => {
    const ids = contacts.filter((c) => !c.already_imported).map((c) => c.google_id);
    setSelected(new Set(ids));
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    try {
      const { data } = await api.post("/gmail/contacts/import", { contact_ids: Array.from(selected) });
      setResult(data);
    } catch { /* ignore */ }
    finally { setImporting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5 text-red-400">
                <rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22,4 12,13 2,4" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Google Контакти</h2>
              <p className="text-zinc-500 text-xs">{result ? "Готово!" : "Оберіть контакти для імпорту"}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {result ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-7 h-7 text-emerald-400"><polyline points="20,6 9,17 4,12" /></svg>
            </div>
            <p className="text-white font-medium text-lg mb-1">Готово!</p>
            <p className="text-zinc-400 text-sm">Імпортовано: <strong className="text-emerald-400">{result.imported}</strong> контактів</p>
            <button onClick={onDone} className="mt-5 px-6 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg">Готово</button>
          </div>
        ) : importing ? (
          <div className="text-center py-8">
            <div className="w-10 h-10 border-2 border-red-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white font-medium">Імпорт контактів...</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3 shrink-0">
              <div className="relative flex-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input type="text" value={search} onChange={(e) => handleSearch(e.target.value)} placeholder="Пошук контактів..."
                  className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-red-500" />
              </div>
              <button onClick={selectAll} className="px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 rounded-lg whitespace-nowrap">Обрати все</button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : contacts.length === 0 ? (
                <p className="text-zinc-600 text-sm text-center py-10">Контактів не знайдено</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {contacts.map((c) => (
                    <label key={c.google_id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                        c.already_imported ? "opacity-50" : selected.has(c.google_id) ? "bg-red-500/10" : "hover:bg-zinc-800"
                      }`}>
                      <input type="checkbox" disabled={c.already_imported} checked={selected.has(c.google_id) || c.already_imported}
                        onChange={() => toggleSelect(c.google_id)}
                        className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-red-500 focus:ring-red-500 focus:ring-offset-0" />
                      {c.avatar ? (
                        <img src={c.avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center text-sm font-bold text-red-400 shrink-0">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{c.name}</p>
                        <p className="text-zinc-500 text-xs truncate">
                          {c.email || c.phone || "—"}
                          {c.company && ` · ${c.company}`}
                          {c.already_imported && " · вже додано"}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800 shrink-0">
              <p className="text-zinc-500 text-sm">Обрано: <span className="text-white">{selected.size}</span></p>
              <button onClick={handleImport} disabled={selected.size === 0}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                Імпортувати обраних
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
