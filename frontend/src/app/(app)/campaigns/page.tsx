"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { toLocal } from "@/lib/datetime";

interface CampaignStats {
  total: number;
  pending: number;
  in_progress: number;
  replied: number;
  done: number;
  error: number;
}

interface Campaign {
  _id: string;
  name: string;
  description: string;
  status: "draft" | "active" | "paused" | "done";
  steps: { order: number; type: string; platform?: string; content: string; delay_minutes: number }[];
  created_at: string;
  updated_at: string;
  stats: CampaignStats;
}

const STATUS_META: Record<Campaign["status"], { label: string; cls: string; dot: string }> = {
  draft: { label: "Чернетка", cls: "bg-zinc-700/40 text-zinc-300 border-zinc-700", dot: "bg-zinc-400" },
  active: { label: "Активна", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400 animate-pulse" },
  paused: { label: "Пауза", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30", dot: "bg-amber-400" },
  done: { label: "Завершено", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30", dot: "bg-violet-400" },
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Campaign[]>("/campaigns");
      setCampaigns(data);
    } catch (err) {
      setError(getErrorMessage(err, "Не вдалось завантажити"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Кампанії</h1>
            <p className="text-zinc-500 text-sm mt-1">
              Послідовності повідомлень з плановим часом для списку контактів.
            </p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-violet-500/20"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Нова кампанія
          </button>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border border-dashed border-zinc-800 rounded-xl">
            <p className="text-zinc-600 mb-3">Ще немає кампаній</p>
            <button
              onClick={() => setCreateOpen(true)}
              className="text-violet-400 hover:text-violet-300 text-sm"
            >
              + Створити кампанію
            </button>
          </div>
        ) : (
          <div className="border border-zinc-800 rounded-xl overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-zinc-900/60">
                <tr className="text-left">
                  <th className="py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Кампанія</th>
                  <th className="py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Статус</th>
                  <th className="py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Прогрес</th>
                  <th className="py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Відповіді</th>
                  <th className="py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Створено</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const meta = STATUS_META[c.status] || STATUS_META.draft;
                  const progress = c.stats.total > 0
                    ? Math.round(((c.stats.done + c.stats.replied) / c.stats.total) * 100)
                    : 0;
                  const replyRate = c.stats.total > 0
                    ? Math.round((c.stats.replied / c.stats.total) * 100)
                    : 0;
                  return (
                    <tr
                      key={c._id}
                      className="border-t border-zinc-800 hover:bg-zinc-900/50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <Link
                          href={`/campaigns/${c._id}`}
                          className="text-white font-medium hover:text-violet-300 transition-colors"
                        >
                          {c.name}
                        </Link>
                        {c.description && (
                          <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-md">{c.description}</p>
                        )}
                        <p className="text-[11px] text-zinc-600 mt-0.5">
                          {c.steps.length} {c.steps.length === 1 ? "крок" : "кроків"}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${meta.cls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 min-w-[180px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-linear-to-r from-violet-600 to-violet-400 transition-all duration-500"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-zinc-400 w-10 text-right">{progress}%</span>
                        </div>
                        <p className="text-[11px] text-zinc-600 mt-1">
                          {c.stats.done + c.stats.replied} / {c.stats.total} лідів
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm text-zinc-300">{replyRate}%</p>
                        <p className="text-[11px] text-zinc-600">{c.stats.replied} з {c.stats.total}</p>
                      </td>
                      <td className="py-3 px-4 text-xs text-zinc-500">{toLocal(c.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {createOpen && (
        <CreateCampaignModal
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            window.location.href = `/campaigns/${id}`;
          }}
        />
      )}
    </div>
  );
}

// ─── Create modal ─────────────────────────────────────────────────────

function CreateCampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Назва обов'язкова");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<{ _id: string }>("/campaigns", {
        name: name.trim(),
        description: description.trim(),
        steps: [],
      });
      onCreated(data._id);
    } catch (err) {
      setError(getErrorMessage(err, "Не вдалось створити"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Нова кампанія</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Назва</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-violet-500 transition-colors"
              placeholder="Наприклад: Q2 outreach"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Опис (опційно)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-violet-500 transition-colors resize-none"
              placeholder="Для чого ця кампанія…"
            />
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm disabled:opacity-50"
            >
              {submitting ? "Створюю…" : "Створити"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
