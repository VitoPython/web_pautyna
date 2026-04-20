"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { toLocal, countdown } from "@/lib/datetime";
import { useWebSocket } from "@/hooks/useWebSocket";
import StepsPipeline, { PipelineStep } from "@/components/campaigns/StepsPipeline";
import { StatusDonut, StepFunnel } from "@/components/campaigns/AnalyticsCharts";

type CampaignStatus = "draft" | "active" | "paused" | "done";

interface Campaign {
  _id: string;
  name: string;
  description: string;
  status: CampaignStatus;
  steps: PipelineStep[];
  created_at: string;
  updated_at: string;
  stats: {
    total: number;
    pending: number;
    in_progress: number;
    replied: number;
    done: number;
    error: number;
  };
}

interface Lead {
  _id: string;
  contact_id: string;
  contact_name: string;
  contact_avatar: string;
  contact_email: string;
  contact_company: string;
  contact_job_title: string;
  status: "pending" | "in_progress" | "replied" | "done" | "error";
  current_step: number;
  next_action_at: string | null;
  last_action_at: string | null;
  error: string;
  added_at: string;
}

interface Contact {
  _id: string;
  name: string;
  avatar_url?: string;
  job_title?: string;
  company?: string;
}

const STATUS_META: Record<CampaignStatus, { label: string; cls: string; dot: string }> = {
  draft: { label: "Чернетка", cls: "bg-zinc-700/40 text-zinc-300 border-zinc-700", dot: "bg-zinc-400" },
  active: { label: "Активна", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400 animate-pulse" },
  paused: { label: "Пауза", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30", dot: "bg-amber-400" },
  done: { label: "Завершено", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30", dot: "bg-violet-400" },
};

const LEAD_STATUS_META: Record<Lead["status"], { label: string; cls: string; dot: string }> = {
  pending: { label: "В черзі", cls: "text-zinc-300 bg-zinc-700/30", dot: "bg-zinc-400" },
  in_progress: { label: "В процесі", cls: "text-sky-300 bg-sky-500/15", dot: "bg-sky-400 animate-pulse" },
  replied: { label: "Відповів", cls: "text-emerald-300 bg-emerald-500/15", dot: "bg-emerald-400" },
  done: { label: "Завершено", cls: "text-violet-300 bg-violet-500/15", dot: "bg-violet-400" },
  error: { label: "Помилка", cls: "text-red-300 bg-red-500/15", dot: "bg-red-400" },
};

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [tab, setTab] = useState<"leads" | "steps" | "analytics">("leads");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [c, l] = await Promise.all([
        api.get<Campaign>(`/campaigns/${id}`),
        api.get<Lead[]>(`/campaigns/${id}/leads`),
      ]);
      setCampaign(c.data);
      setLeads(l.data);
    } catch (err) {
      setError(getErrorMessage(err, "Не вдалось завантажити кампанію"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Soft poll every 20s as a safety net if WS is dropped.
  useEffect(() => {
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  // Live refresh when the backend pushes campaign_updated for this campaign.
  useWebSocket((ev) => {
    if (ev.type !== "campaign_updated") return;
    const payload = ev.payload as { campaign_id?: string };
    if (payload.campaign_id === id) load();
  });

  const updateCampaign = async (patch: Partial<Campaign>) => {
    if (!id) return;
    await api.patch(`/campaigns/${id}`, patch);
    await load();
  };

  const toggleStatus = async () => {
    if (!campaign) return;
    const next: CampaignStatus = campaign.status === "active" ? "paused" : "active";
    await updateCampaign({ status: next });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-6">
        <p className="text-red-400">{error || "Кампанію не знайдено"}</p>
        <Link href="/campaigns" className="text-violet-400 hover:text-violet-300 text-sm mt-4 inline-block">
          ← До списку
        </Link>
      </div>
    );
  }

  const meta = STATUS_META[campaign.status];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-zinc-800 bg-linear-to-b from-zinc-900/30 to-transparent">
        <Link href="/campaigns" className="text-xs text-zinc-500 hover:text-violet-300 transition-colors inline-flex items-center gap-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3 h-3">
            <polyline points="15,18 9,12 15,6" />
          </svg>
          Кампанії
        </Link>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <h1 className="text-2xl font-bold text-white tracking-tight">{campaign.name}</h1>
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium border inline-flex items-center gap-1.5 ${meta.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
          <button
            onClick={toggleStatus}
            disabled={campaign.steps.length === 0}
            className={`ml-auto px-4 py-2 text-sm font-medium rounded-lg transition-colors shadow-lg disabled:opacity-40 disabled:cursor-not-allowed ${
              campaign.status === "active"
                ? "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/20"
                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20"
            }`}
            title={campaign.steps.length === 0 ? "Додайте хоча б один крок" : undefined}
          >
            {campaign.status === "active" ? "⏸ Призупинити" : "▶ Запустити"}
          </button>
        </div>
        {campaign.description && <p className="text-zinc-500 text-sm mt-2">{campaign.description}</p>}

        {/* Tabs */}
        <div className="flex gap-1 mt-5 border-b border-zinc-800 -mx-6 px-6">
          {([
            ["leads", `Ліди`, campaign.stats.total],
            ["steps", `Кроки`, campaign.steps.length],
            ["analytics", "Аналітика", null],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === key
                  ? "border-violet-500 text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {label}
              {count !== null && count > 0 && (
                <span className="ml-1.5 text-[11px] text-zinc-500">({count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {tab === "leads" && (
          <LeadsTab campaignId={campaign._id} leads={leads} onChanged={load} steps={campaign.steps} />
        )}
        {tab === "steps" && (
          <StepsTab
            steps={campaign.steps}
            onSave={(steps) => updateCampaign({ steps } as Partial<Campaign>)}
          />
        )}
        {tab === "analytics" && <AnalyticsTab stats={campaign.stats} leads={leads} steps={campaign.steps} />}
      </div>
    </div>
  );
}

// ─── Leads tab ─────────────────────────────────────────────────────────

function LeadsTab({
  campaignId,
  leads,
  steps,
  onChanged,
}: {
  campaignId: string;
  leads: Lead[];
  steps: PipelineStep[];
  onChanged: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);

  // Tick every second to update countdowns.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const remove = async (leadId: string) => {
    if (!confirm("Видалити ліда з кампанії?")) return;
    await api.delete(`/campaigns/${campaignId}/leads/${leadId}`);
    onChanged();
  };

  const enrichAll = async () => {
    if (enriching || leads.length === 0) return;
    setEnriching(true);
    setEnrichMsg(null);
    try {
      const { data } = await api.post<{ enriched_contacts: number; fields_filled: number }>(
        `/campaigns/${campaignId}/enrich`,
      );
      setEnrichMsg(
        data.enriched_contacts > 0
          ? `Оновлено ${data.enriched_contacts} контактів (${data.fields_filled} полів)`
          : "Немає нових даних для збагачення"
      );
      onChanged();
    } catch {
      setEnrichMsg("Не вдалось збагатити");
    } finally {
      setEnriching(false);
      setTimeout(() => setEnrichMsg(null), 5000);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <p className="text-sm text-zinc-400">
          {leads.length > 0 ? `${leads.length} лідів` : "Ще немає лідів"}
        </p>
        <div className="flex items-center gap-2">
          {leads.length > 0 && (
            <button
              onClick={enrichAll}
              disabled={enriching}
              className="px-3 py-1.5 text-sm text-violet-200 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
              title="Збагатити дані через Unipile"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={`w-3.5 h-3.5 ${enriching ? "animate-spin" : ""}`}>
                <path d="M12 2L14.39 8.26L21 9.27L16 14.14L17.45 20.73L12 17.27L6.55 20.73L8 14.14L3 9.27L9.61 8.26L12 2z" />
              </svg>
              {enriching ? "Збагачую…" : "Enrich all"}
            </button>
          )}
          <button
            onClick={() => setAddOpen(true)}
            className="px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors shadow-lg shadow-violet-500/20"
          >
            + Додати лідів
          </button>
        </div>
      </div>
      {enrichMsg && (
        <div className="mb-3 px-3 py-2 text-xs text-violet-200 bg-violet-500/10 border border-violet-500/20 rounded-lg">
          {enrichMsg}
        </div>
      )}

      {leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 border border-dashed border-zinc-800 rounded-xl">
          <p className="text-zinc-600 text-sm mb-2">Додайте контакти як лідів — їм відправляться повідомлення по кроках.</p>
          <button onClick={() => setAddOpen(true)} className="text-violet-400 text-sm hover:text-violet-300">
            + Додати
          </button>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[880px]">
            <thead className="bg-zinc-900/60">
              <tr className="text-left">
                <th className="py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Контакт</th>
                <th className="py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Статус</th>
                <th className="py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Крок</th>
                <th className="py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Останнє</th>
                <th className="py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Наступне</th>
                <th className="py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Відлік</th>
                <th className="py-3 px-4 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const meta = LEAD_STATUS_META[lead.status];
                const countdownStr = lead.status === "pending" || lead.status === "in_progress"
                  ? countdown(lead.next_action_at)
                  : "—";
                return (
                  <tr key={lead._id} className="border-t border-zinc-800 hover:bg-zinc-900/50 transition-colors">
                    <td className="py-3 px-4">
                      <Link
                        href={`/inbox?contact=${lead.contact_id}`}
                        className="flex items-center gap-3 hover:text-violet-300 transition-colors"
                      >
                        {lead.contact_avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={lead.contact_avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white shrink-0">
                            {lead.contact_name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-white text-sm font-medium">{lead.contact_name}</p>
                          {lead.contact_company && (
                            <p className="text-[11px] text-zinc-500">
                              {[lead.contact_job_title, lead.contact_company].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${meta.cls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                      {lead.status === "error" && lead.error && (
                        <p className="text-[11px] text-red-400 mt-0.5 max-w-[240px] truncate" title={lead.error}>
                          {lead.error}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-zinc-400">
                      {steps.length > 0 ? `${Math.min(lead.current_step + 1, steps.length)} / ${steps.length}` : "—"}
                    </td>
                    <td className="py-3 px-4 text-xs text-zinc-500 whitespace-nowrap">{toLocal(lead.last_action_at)}</td>
                    <td className="py-3 px-4 text-xs text-zinc-500 whitespace-nowrap">{toLocal(lead.next_action_at)}</td>
                    <td className="py-3 px-4 text-xs whitespace-nowrap">
                      <span className={
                        countdownStr === "зараз" ? "text-emerald-300 font-medium"
                        : countdownStr === "—" ? "text-zinc-700"
                        : "text-violet-300"
                      }>
                        {countdownStr}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => remove(lead._id)}
                        className="text-zinc-500 hover:text-red-400 transition-colors"
                        title="Прибрати"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <AddLeadsModal
          campaignId={campaignId}
          existingIds={leads.map((l) => l.contact_id)}
          onClose={() => setAddOpen(false)}
          onAdded={() => { setAddOpen(false); onChanged(); }}
        />
      )}
    </div>
  );
}

function AddLeadsModal({
  campaignId,
  existingIds,
  onClose,
  onAdded,
}: {
  campaignId: string;
  existingIds: string[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Contact[]>("/contacts")
      .then((r) => setContacts(r.data))
      .catch(() => setContacts([]));
  }, []);

  const existing = new Set(existingIds);
  const filtered = contacts.filter((c) => {
    if (existing.has(c._id)) return false;
    if (!search) return true;
    return c.name.toLowerCase().includes(search.toLowerCase());
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      await api.post(`/campaigns/${campaignId}/leads`, { contact_ids: Array.from(selected) });
      onAdded();
    } catch (err) {
      setError(getErrorMessage(err, "Не вдалось додати"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <h3 className="text-white font-semibold">Додати лідів</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="p-5 border-b border-zinc-800">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук контактів…"
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 text-sm"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-zinc-600 text-sm p-5">Нічого не знайдено</p>
          ) : (
            <div className="divide-y divide-zinc-800">
              {filtered.map((c) => {
                const checked = selected.has(c._id);
                return (
                  <button
                    key={c._id}
                    type="button"
                    onClick={() => toggle(c._id)}
                    className={`w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-zinc-800/50 transition-colors ${
                      checked ? "bg-violet-500/10" : ""
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                        checked ? "bg-violet-500 border-violet-500" : "border-zinc-600"
                      }`}
                    >
                      {checked && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} className="w-3 h-3">
                          <polyline points="20,6 9,17 4,12" />
                        </svg>
                      )}
                    </div>
                    {c.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white shrink-0">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{c.name}</p>
                      {(c.job_title || c.company) && (
                        <p className="text-[11px] text-zinc-500 truncate">
                          {[c.job_title, c.company].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {error && (
          <p className="text-sm text-red-400 px-5 py-2 border-t border-zinc-800">{error}</p>
        )}
        <div className="p-5 border-t border-zinc-800 flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">Обрано: {selected.size}</p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm"
            >
              Скасувати
            </button>
            <button
              onClick={submit}
              disabled={submitting || selected.size === 0}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm disabled:opacity-40"
            >
              {submitting ? "Додаю…" : "Додати"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Steps tab ─────────────────────────────────────────────────────────

function StepsTab({ steps, onSave }: { steps: PipelineStep[]; onSave: (steps: PipelineStep[]) => Promise<void> }) {
  const [local, setLocal] = useState<PipelineStep[]>(steps);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const initialRef = useRef(steps);
  // Reset local when server state changes from outside (e.g. refresh).
  useEffect(() => {
    if (JSON.stringify(steps) !== JSON.stringify(initialRef.current)) {
      setLocal(steps);
      initialRef.current = steps;
    }
  }, [steps]);

  const save = async () => {
    setSaving(true);
    try {
      const sanitized = local.map((s, i) => ({ ...s, order: i + 1 }));
      await onSave(sanitized);
      setSavedAt(new Date());
      initialRef.current = sanitized;
    } finally {
      setSaving(false);
    }
  };

  const dirty = JSON.stringify(local) !== JSON.stringify(steps);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-zinc-400">
          {local.length > 0 ? `${local.length} ${local.length === 1 ? "крок" : "кроків"}` : "Послідовність порожня"}
        </p>
        <div className="flex items-center gap-2">
          {savedAt && <span className="text-xs text-zinc-600">Збережено {savedAt.toLocaleTimeString("uk")}</span>}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors disabled:opacity-40 shadow-lg shadow-violet-500/20"
          >
            {saving ? "Збереження…" : "Зберегти"}
          </button>
        </div>
      </div>

      <StepsPipeline steps={local} onChange={setLocal} />
    </div>
  );
}

// ─── Analytics tab ─────────────────────────────────────────────────────

function AnalyticsTab({
  stats,
  leads,
  steps,
}: {
  stats: Campaign["stats"];
  leads: Lead[];
  steps: PipelineStep[];
}) {
  const replyRate = stats.total > 0 ? Math.round((stats.replied / stats.total) * 100) : 0;
  const progressPct = stats.total > 0
    ? Math.round(((stats.done + stats.replied + stats.error) / stats.total) * 100)
    : 0;

  // For each step, how many leads completed it (current_step > i OR lead is terminal past it).
  const leadsAtStep = steps.map((_, i) =>
    leads.filter((l) => {
      // terminal at/after step i means they finished step i
      if (l.status === "done" || l.status === "replied" || l.status === "error") {
        // `done` means reached end; `replied` may stop earlier. Count replied as reaching
        // at least current_step - 1 + 1 = current_step (the step they were ABOUT to run
        // when they replied), so we count completed = current_step itself.
        return l.current_step > i || l.status === "done";
      }
      return l.current_step > i;
    }).length
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Headline KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Всього лідів" value={stats.total} accent="text-white" />
        <KpiCard label="Активних" value={stats.pending + stats.in_progress} accent="text-sky-300" />
        <KpiCard label="Відповіли" value={stats.replied} accent="text-emerald-300" subtitle={`${replyRate}%`} />
        <KpiCard label="Завершили" value={stats.done + stats.replied} accent="text-violet-300" subtitle={`${progressPct}%`} />
      </div>

      {stats.total > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-5 bg-zinc-900/60 border border-zinc-800 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-white">Розподіл статусів</p>
              <p className="text-[11px] text-zinc-500">{stats.total} лідів</p>
            </div>
            <StatusDonut stats={stats} />
          </div>

          <div className="p-5 bg-zinc-900/60 border border-zinc-800 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-white">Воронка по кроках</p>
              <p className="text-[11px] text-zinc-500">{steps.length} {steps.length === 1 ? "крок" : "кроків"}</p>
            </div>
            {steps.length > 0 ? (
              <StepFunnel steps={steps} leadsAtStep={leadsAtStep} totalLeads={stats.total} />
            ) : (
              <p className="text-zinc-600 text-sm italic">Немає кроків для аналізу</p>
            )}
          </div>

          {/* Progress + reply rate bars */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <GaugeBar label="Прогрес кампанії" pct={progressPct} from="#7c3aed" to="#c084fc" />
            <GaugeBar label="Reply rate" pct={replyRate} from="#059669" to="#34d399" />
          </div>

          {/* Timeline of recent activity */}
          {leads.some((l) => l.last_action_at) && (
            <div className="lg:col-span-2 p-5 bg-zinc-900/60 border border-zinc-800 rounded-xl">
              <p className="text-sm font-medium text-white mb-3">Остання активність</p>
              <div className="flex flex-col gap-2">
                {[...leads]
                  .filter((l) => l.last_action_at)
                  .sort((a, b) => (b.last_action_at || "").localeCompare(a.last_action_at || ""))
                  .slice(0, 6)
                  .map((l) => {
                    const meta = LEAD_STATUS_META[l.status];
                    return (
                      <div key={l._id} className="flex items-center gap-3 text-sm py-1 border-b border-zinc-800/40 last:border-0">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                        <span className="text-white min-w-0 truncate flex-1">{l.contact_name}</span>
                        <span className={`text-xs whitespace-nowrap ${meta.cls.split(" ").find((c) => c.startsWith("text-")) || "text-zinc-500"}`}>
                          {meta.label}
                        </span>
                        <span className="text-[11px] text-zinc-600 whitespace-nowrap tabular-nums">{toLocal(l.last_action_at)}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-48 border border-dashed border-zinc-800 rounded-xl">
          <p className="text-zinc-600 text-sm">Додайте лідів щоб побачити аналітику</p>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
  subtitle,
}: {
  label: string;
  value: number;
  accent: string;
  subtitle?: string;
}) {
  return (
    <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl">
      <p className="text-[11px] text-zinc-500 uppercase tracking-wider">{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <p className={`text-3xl font-bold tabular-nums ${accent}`}>{value}</p>
        {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
      </div>
    </div>
  );
}

function GaugeBar({ label, pct, from, to }: { label: string; pct: number; from: string; to: string }) {
  return (
    <div className="p-5 bg-zinc-900/60 border border-zinc-800 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-2xl font-bold text-white tabular-nums">{pct}%</p>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(to right, ${from}, ${to})`,
          }}
        />
      </div>
    </div>
  );
}
