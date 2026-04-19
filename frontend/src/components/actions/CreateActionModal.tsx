"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";

interface Contact {
  _id: string;
  name: string;
  avatar_url?: string;
  email?: string;
  platforms?: { type: string; profile_id: string }[];
}

interface CreateActionModalProps {
  onClose: () => void;
  onCreated: () => void;
}

type TriggerKind = "schedule" | "no_reply" | "manual";
type StepType = "send_message" | "create_note" | "add_reminder";
type Platform = "telegram" | "gmail";

// Human-readable cron presets. "custom" lets the user type their own.
const CRON_PRESETS: { key: string; label: string; cron: string }[] = [
  { key: "hourly", label: "Щогодини", cron: "0 * * * *" },
  { key: "daily9", label: "Щодня 09:00", cron: "0 9 * * *" },
  { key: "weekly_mon9", label: "Щопонеділка 09:00", cron: "0 9 * * 1" },
  { key: "monthly1", label: "1-го числа 09:00", cron: "0 9 1 * *" },
];

export default function CreateActionModal({ onClose, onCreated }: CreateActionModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contactId, setContactId] = useState<string>("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState("");

  const [triggerKind, setTriggerKind] = useState<TriggerKind>("schedule");
  const [cronPreset, setCronPreset] = useState("daily9");
  const [cronCustom, setCronCustom] = useState("0 9 * * *");
  const [noReplyDays, setNoReplyDays] = useState(7);

  const [stepType, setStepType] = useState<StepType>("send_message");
  const [platform, setPlatform] = useState<Platform>("telegram");
  const [content, setContent] = useState("");
  const [delayMinutes, setDelayMinutes] = useState(0);

  const [endDate, setEndDate] = useState("");   // datetime-local value
  const [maxRuns, setMaxRuns] = useState<string>("");  // string so empty → unlimited

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Contact[]>("/contacts")
      .then((r) => setContacts(r.data))
      .catch(() => setContacts([]));
  }, []);

  const selectedContact = useMemo(
    () => contacts.find((c) => c._id === contactId),
    [contacts, contactId]
  );

  const filteredContacts = useMemo(() => {
    const q = contactSearch.toLowerCase().trim();
    if (!q) return contacts.slice(0, 20);
    return contacts
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [contacts, contactSearch]);

  const effectiveCron = cronPreset === "custom"
    ? cronCustom
    : (CRON_PRESETS.find((p) => p.key === cronPreset)?.cron || "0 9 * * *");

  const needsContact = stepType === "send_message" || stepType === "create_note";
  const needsPlatform = stepType === "send_message";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Назва обов'язкова");
      return;
    }
    if (needsContact && !contactId) {
      setError("Оберіть контакт для цього типу кроку");
      return;
    }
    if (!content.trim() && stepType !== "add_reminder") {
      setError("Контент кроку не може бути порожнім");
      return;
    }

    const trigger: Record<string, unknown> = { type: "schedule" };
    if (triggerKind === "schedule") {
      trigger.type = "schedule";
      trigger.cron = effectiveCron;
    } else if (triggerKind === "no_reply") {
      trigger.type = "event";
      trigger.event = "no_reply";
      trigger.condition = { days: noReplyDays };
    } else {
      // Manual: use schedule type but without cron — won't auto-fire,
      // only via the "Run now" button.
      trigger.type = "schedule";
      trigger.cron = null;
    }

    const step: Record<string, unknown> = {
      order: 1,
      type: stepType,
      content: content.trim() || name.trim(),
      delay_minutes: delayMinutes,
    };
    if (needsPlatform) step.platform = platform;

    const payload: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim(),
      contact_id: needsContact ? contactId : null,
      trigger,
      steps: [step],
    };
    if (endDate) {
      // datetime-local returns local time; browser adds the user's offset on Date()
      payload.end_date = new Date(endDate).toISOString();
    }
    const maxRunsNum = Number(maxRuns);
    if (maxRuns && maxRunsNum > 0) {
      payload.max_runs = maxRunsNum;
    }

    setSubmitting(true);
    try {
      await api.post("/actions", payload);
      onCreated();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Не вдалось створити Action"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
          <h2 className="text-lg font-semibold text-white">Новий Action</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-5">
          {/* Name */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Назва</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
              placeholder="Наприклад: Доброго ранку Папі"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Опис (опційно)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
              placeholder="Коротка нотатка про ціль цього Action"
            />
          </div>

          {/* Trigger */}
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Коли виконувати</label>
            <div className="flex gap-2 mb-3">
              {([
                ["schedule", "За розкладом"],
                ["no_reply", "Немає відповіді"],
                ["manual", "Тільки вручну"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTriggerKind(key)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    triggerKind === key
                      ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                      : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {triggerKind === "schedule" && (
              <div className="flex flex-col gap-2">
                <select
                  value={cronPreset}
                  onChange={(e) => setCronPreset(e.target.value)}
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-violet-500"
                >
                  {CRON_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>{p.label} ({p.cron})</option>
                  ))}
                  <option value="custom">Свій cron…</option>
                </select>
                {cronPreset === "custom" && (
                  <input
                    type="text"
                    value={cronCustom}
                    onChange={(e) => setCronCustom(e.target.value)}
                    placeholder="* * * * *"
                    className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 font-mono text-sm"
                  />
                )}
              </div>
            )}

            {triggerKind === "no_reply" && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-400">Якщо немає відповіді</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={noReplyDays}
                  onChange={(e) => setNoReplyDays(Math.max(1, Number(e.target.value) || 1))}
                  className="w-20 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-violet-500"
                />
                <span className="text-sm text-zinc-400">днів</span>
              </div>
            )}

            {triggerKind === "manual" && (
              <p className="text-xs text-zinc-500">
                Action спрацює лише коли ви натиснете «Запустити зараз» на картці.
              </p>
            )}
          </div>

          {/* Step */}
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Що робити</label>
            <div className="flex gap-2 mb-3">
              {([
                ["send_message", "Надіслати повідомлення"],
                ["create_note", "Створити нотатку"],
                ["add_reminder", "Нагадування"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStepType(key)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    stepType === key
                      ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                      : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {needsContact && (
              <div className="mb-3">
                <input
                  type="text"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Пошук контакта…"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 text-sm mb-2"
                />
                <div className="max-h-40 overflow-y-auto border border-zinc-800 rounded-lg divide-y divide-zinc-800">
                  {filteredContacts.length === 0 && (
                    <p className="text-zinc-600 text-sm p-3">Нічого не знайдено</p>
                  )}
                  {filteredContacts.map((c) => (
                    <button
                      key={c._id}
                      type="button"
                      onClick={() => setContactId(c._id)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 ${
                        contactId === c._id
                          ? "bg-violet-500/20 text-violet-200"
                          : "text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      <span className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] uppercase shrink-0">
                        {c.name.slice(0, 1)}
                      </span>
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
                {selectedContact && (
                  <p className="text-xs text-violet-400 mt-2">Обрано: {selectedContact.name}</p>
                )}
              </div>
            )}

            {needsPlatform && (
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setPlatform("telegram")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    platform === "telegram"
                      ? "bg-sky-500/20 text-sky-400 border border-sky-500/40"
                      : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
                  }`}
                >
                  Telegram
                </button>
                <button
                  type="button"
                  onClick={() => setPlatform("gmail")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    platform === "gmail"
                      ? "bg-red-500/20 text-red-400 border border-red-500/40"
                      : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
                  }`}
                >
                  Gmail
                </button>
              </div>
            )}

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors resize-none"
              placeholder={
                stepType === "send_message"
                  ? "Текст повідомлення"
                  : stepType === "create_note"
                  ? "Зміст нотатки"
                  : "Текст нагадування"
              }
            />

            <div className="flex items-center gap-2 mt-3">
              <label className="text-xs text-zinc-500">Затримка перед виконанням:</label>
              <input
                type="number"
                min={0}
                value={delayMinutes}
                onChange={(e) => setDelayMinutes(Math.max(0, Number(e.target.value) || 0))}
                className="w-20 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-xs focus:outline-none focus:border-violet-500"
              />
              <span className="text-xs text-zinc-500">хв</span>
            </div>
          </div>

          {/* Stop conditions (optional) */}
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Зупинити (опційно)</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[11px] text-zinc-500 mb-1">До дати</p>
                <input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-violet-500 text-sm"
                />
              </div>
              <div>
                <p className="text-[11px] text-zinc-500 mb-1">Макс. запусків</p>
                <input
                  type="number"
                  min={1}
                  value={maxRuns}
                  onChange={(e) => setMaxRuns(e.target.value)}
                  placeholder="без ліміту"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 text-sm"
                />
              </div>
            </div>
            {(endDate || maxRuns) && (
              <p className="text-[11px] text-zinc-500 mt-1.5">
                Action автоматично перейде у «завершено» коли досягне будь-якої з умов.
              </p>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t border-zinc-800 -mx-5 px-5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 rounded-lg text-sm text-white bg-violet-600 hover:bg-violet-500 transition-colors disabled:opacity-50"
            >
              {submitting ? "Створюю…" : "Створити"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
