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
          <div className="border border-zinc-800 rounded-xl overflow-x-auto bg-zinc-900/40">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="text-left border-b border-zinc-800">
                  <th className="py-3 px-5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Кампанія</th>
                  <th className="py-3 px-5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Статус</th>
                  <th className="py-3 px-5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider w-[260px]">Прогрес</th>
                  <th className="py-3 px-5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Ліди</th>
                  <th className="py-3 px-5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Reply</th>
                  <th className="py-3 px-5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Створено</th>
                  <th className="py-3 px-5 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => <CampaignRow key={c._id} campaign={c} />)}
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

// ─── Campaign row ────────────────────────────────────────────────────

function CampaignRow({ campaign: c }: { campaign: Campaign }) {
  const meta = STATUS_META[c.status] || STATUS_META.draft;
  const total = c.stats.total || 1;
  const segments = [
    { key: "replied", value: c.stats.replied, color: "bg-emerald-500" },
    { key: "done", value: c.stats.done, color: "bg-violet-500" },
    { key: "in_progress", value: c.stats.in_progress, color: "bg-sky-500" },
    { key: "error", value: c.stats.error, color: "bg-red-500" },
    { key: "pending", value: c.stats.pending, color: "bg-zinc-700" },
  ];
  const progress = c.stats.total > 0
    ? Math.round(((c.stats.done + c.stats.replied) / c.stats.total) * 100)
    : 0;
  const replyRate = c.stats.total > 0
    ? Math.round((c.stats.replied / c.stats.total) * 100)
    : 0;

  return (
    <tr className="border-t border-zinc-800 hover:bg-zinc-900/60 transition-colors group">
      <td className="py-4 px-5">
        <Link
          href={`/campaigns/${c._id}`}
          className="block"
        >
          <p className="text-white font-medium group-hover:text-violet-200 transition-colors">{c.name}</p>
          {c.description && (
            <p className="text-[11px] text-zinc-500 mt-0.5 truncate max-w-[300px]">{c.description}</p>
          )}
          <p className="text-[11px] text-zinc-600 mt-0.5">
            {c.steps.length} {c.steps.length === 1 ? "крок" : "кроків"}
          </p>
        </Link>
      </td>
      <td className="py-4 px-5">
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${meta.cls}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
      </td>
      <td className="py-4 px-5">
        <div className="flex h-2 rounded-full overflow-hidden bg-zinc-800">
          {segments.map((s) => (
            s.value > 0 ? (
              <div
                key={s.key}
                className={`${s.color} transition-all duration-500`}
                style={{ width: `${(s.value / total) * 100}%` }}
                title={`${s.key}: ${s.value}`}
              />
            ) : null
          ))}
        </div>
        <p className="text-[11px] text-zinc-600 mt-1 tabular-nums">
          {progress}% · {c.stats.done + c.stats.replied} / {c.stats.total}
        </p>
      </td>
      <td className="py-4 px-5 text-sm text-zinc-300 tabular-nums">{c.stats.total}</td>
      <td className="py-4 px-5">
        <p className="text-sm text-emerald-300 font-medium tabular-nums">{replyRate}%</p>
        <p className="text-[11px] text-zinc-600 tabular-nums">{c.stats.replied} з {c.stats.total}</p>
      </td>
      <td className="py-4 px-5 text-xs text-zinc-500 whitespace-nowrap">{toLocal(c.created_at)}</td>
      <td className="py-4 px-5">
        <Link
          href={`/campaigns/${c._id}`}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 group-hover:text-violet-300 group-hover:bg-zinc-800 transition-all"
          title="Відкрити"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4 group-hover:translate-x-0.5 transition-transform">
            <polyline points="9,6 15,12 9,18" />
          </svg>
        </Link>
      </td>
    </tr>
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
