"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import CreateActionModal from "@/components/actions/CreateActionModal";

interface ActionStep {
  order: number;
  type: string;
  platform?: string;
  content?: string;
  delay_minutes?: number;
}

interface ActionTrigger {
  type: string;
  cron?: string | null;
  event?: string | null;
  condition?: Record<string, unknown>;
}

interface Action {
  _id: string;
  name: string;
  description: string;
  contact_id?: string | null;
  trigger: ActionTrigger;
  steps: ActionStep[];
  status: "active" | "paused" | "completed" | "error";
  last_run?: string | null;
  next_run?: string | null;
  run_count: number;
  end_date?: string | null;
  max_runs?: number | null;
  created_by_ai?: boolean;
  created_at: string;
}

interface FailedAction {
  _id: string;
  action_id: string;
  snapshot: { name?: string; steps?: ActionStep[] };
  error: string;
  attempts: number;
  failed_at: string;
}

interface Contact {
  _id: string;
  name: string;
}

type Tab = "active" | "failed";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  paused: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  completed: "bg-zinc-500/15 text-zinc-400 border-zinc-600",
  error: "bg-red-500/15 text-red-400 border-red-500/30",
};

const STATUS_LABEL: Record<string, string> = {
  active: "активний",
  paused: "на паузі",
  completed: "завершено",
  error: "помилка",
};

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("uk", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function describeTrigger(t: ActionTrigger): string {
  if (t.type === "schedule") {
    if (!t.cron) return "Вручну";
    return `Cron: ${t.cron}`;
  }
  if (t.type === "event" && t.event === "no_reply") {
    const days = (t.condition as { days?: number } | undefined)?.days ?? 7;
    return `Немає відповіді ${days} днів`;
  }
  return t.type;
}

function describeStep(s: ActionStep): string {
  const kind = s.type;
  const platform = s.platform ? ` (${s.platform})` : "";
  const preview = s.content ? `: ${s.content.slice(0, 40)}${s.content.length > 40 ? "…" : ""}` : "";
  const labelMap: Record<string, string> = {
    send_message: "Надіслати",
    create_note: "Нотатка",
    add_reminder: "Нагадування",
  };
  return `${labelMap[kind] || kind}${platform}${preview}`;
}

export default function ActionsPage() {
  const [tab, setTab] = useState<Tab>("active");
  const [actions, setActions] = useState<Action[]>([]);
  const [failed, setFailed] = useState<FailedAction[]>([]);
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const [runningId, setRunningId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [actionsRes, failedRes, contactsRes] = await Promise.all([
        api.get<Action[]>("/actions"),
        api.get<FailedAction[]>("/actions/failed"),
        api.get<Contact[]>("/contacts"),
      ]);
      setActions(actionsRes.data);
      setFailed(failedRes.data);
      const map: Record<string, Contact> = {};
      for (const c of contactsRes.data) map[c._id] = c;
      setContacts(map);
    } catch (err) {
      setError(getErrorMessage(err, "Не вдалось завантажити Actions"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (a: Action) => {
    // Optimistic — flip status, rollback on error.
    const prev = a.status;
    const next = prev === "active" ? "paused" : "active";
    setActions((list) => list.map((x) => x._id === a._id ? { ...x, status: next } : x));
    try {
      await api.post(`/actions/${a._id}/toggle`);
    } catch (err) {
      setActions((list) => list.map((x) => x._id === a._id ? { ...x, status: prev } : x));
      setError(getErrorMessage(err, "Не вдалось змінити статус"));
    }
  };

  const runNow = async (a: Action) => {
    if (runningId === a._id) return;  // debounce double-click
    setRunningId(a._id);
    try {
      await api.post(`/actions/${a._id}/run`);
      // Worker typically finishes in <1s; wait a beat then refresh counters.
      await new Promise((r) => setTimeout(r, 1200));
      await load();
      setFlashId(a._id);
      setTimeout(() => setFlashId(null), 2000);
    } catch (err) {
      setError(getErrorMessage(err, "Не вдалось запустити"));
    } finally {
      setRunningId(null);
    }
  };

  const remove = async (a: Action) => {
    if (!confirm(`Видалити «${a.name}»?`)) return;
    const prev = actions;
    setActions((list) => list.filter((x) => x._id !== a._id));
    try {
      await api.delete(`/actions/${a._id}`);
    } catch (err) {
      setActions(prev);
      setError(getErrorMessage(err, "Не вдалось видалити"));
    }
  };

  const removeFailed = async (id: string) => {
    const prev = failed;
    setFailed((list) => list.filter((x) => x._id !== id));
    try {
      await api.delete(`/actions/failed/${id}`);
    } catch (err) {
      setFailed(prev);
      setError(getErrorMessage(err, "Не вдалось видалити"));
    }
  };

  const failedCount = failed.length;

  const activeList = useMemo(
    () => [...actions].sort((a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1)),
    [actions]
  );

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Actions</h1>
            <p className="text-zinc-500 text-sm mt-1">AI-автоматизація ваших задач</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + Створити Action
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-zinc-800">
          <button
            onClick={() => setTab("active")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              tab === "active"
                ? "border-violet-500 text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Всі ({actions.length})
          </button>
          <button
            onClick={() => setTab("failed")}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
              tab === "failed"
                ? "border-red-500 text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Помилки
            {failedCount > 0 && (
              <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded-full">
                {failedCount}
              </span>
            )}
          </button>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === "active" ? (
          activeList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 border border-dashed border-zinc-800 rounded-xl gap-3">
              <p className="text-zinc-600">Ще немає жодного Action</p>
              <button
                onClick={() => setShowCreate(true)}
                className="text-violet-400 hover:text-violet-300 text-sm"
              >
                Створити перший →
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {activeList.map((a) => {
                const contact = a.contact_id ? contacts[a.contact_id] : null;
                const step = a.steps[0];
                return (
                  <div
                    key={a._id}
                    className={`p-4 bg-zinc-900/60 border rounded-xl transition-colors ${
                      flashId === a._id
                        ? "border-emerald-500/60 bg-emerald-500/5"
                        : "border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="text-white font-semibold truncate">{a.name}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_STYLE[a.status]}`}>
                            {STATUS_LABEL[a.status]}
                          </span>
                          {a.created_by_ai && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-violet-500/30 bg-violet-500/15 text-violet-300">
                              AI
                            </span>
                          )}
                        </div>
                        {a.description && (
                          <p className="text-sm text-zinc-500 truncate">{a.description}</p>
                        )}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          onClick={() => runNow(a)}
                          disabled={runningId === a._id}
                          title="Запустити зараз"
                          className="p-2 text-zinc-400 hover:text-violet-400 hover:bg-violet-500/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {runningId === a._id ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 animate-spin">
                              <path d="M21 12a9 9 0 11-6.219-8.56" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => toggle(a)}
                          title={a.status === "active" ? "Пауза" : "Активувати"}
                          className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                        >
                          {a.status === "active" ? (
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                              <rect x="6" y="4" width="4" height="16" />
                              <rect x="14" y="4" width="4" height="16" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => remove(a)}
                          title="Видалити"
                          className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5 text-zinc-400">
                        <span className="text-zinc-600">⏱</span>
                        <span>{describeTrigger(a.trigger)}</span>
                      </div>
                      {contact && (
                        <div className="flex items-center gap-1.5 text-zinc-400">
                          <span className="text-zinc-600">👤</span>
                          <span className="truncate">{contact.name}</span>
                        </div>
                      )}
                      {step && (
                        <div className="flex items-center gap-1.5 text-zinc-400 col-span-full">
                          <span className="text-zinc-600">→</span>
                          <span className="truncate">{describeStep(step)}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-zinc-800 text-[11px] text-zinc-500 flex-wrap">
                      <span>
                        Запусків:{" "}
                        <span className="text-zinc-300">
                          {a.run_count}{a.max_runs ? ` / ${a.max_runs}` : ""}
                        </span>
                      </span>
                      <span>Останній: <span className="text-zinc-300">{formatDate(a.last_run)}</span></span>
                      <span>Наступний: <span className="text-zinc-300">{formatDate(a.next_run)}</span></span>
                      {a.end_date && (
                        <span>
                          Зупиниться:{" "}
                          <span className="text-zinc-300">{formatDate(a.end_date)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          // Failed tab
          failed.length === 0 ? (
            <div className="flex items-center justify-center h-64 border border-dashed border-zinc-800 rounded-xl">
              <p className="text-zinc-600">Помилок немає 🎉</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {failed.map((f) => (
                <div
                  key={f._id}
                  className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-white font-semibold truncate">
                        {f.snapshot?.name || "(unnamed)"}
                      </h3>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {formatDate(f.failed_at)} · {f.attempts} спроб · action_id={f.action_id}
                      </p>
                    </div>
                    <button
                      onClick={() => removeFailed(f._id)}
                      title="Прибрати з журналу"
                      className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  <pre className="text-xs text-red-300 font-mono whitespace-pre-wrap wrap-break-word bg-red-950/40 rounded-lg p-2 border border-red-500/20">
                    {f.error}
                  </pre>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {showCreate && (
        <CreateActionModal
          onClose={() => setShowCreate(false)}
          onCreated={() => load()}
        />
      )}
    </div>
  );
}
