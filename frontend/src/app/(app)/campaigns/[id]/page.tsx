"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";

type CampaignStatus = "draft" | "active" | "paused" | "done";

interface Step {
  order: number;
  type: string;
  platform?: string;
  content: string;
  subject?: string;
  delay_minutes: number;
}

interface Campaign {
  _id: string;
  name: string;
  description: string;
  status: CampaignStatus;
  steps: Step[];
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

const STATUS_META: Record<CampaignStatus, { label: string; cls: string }> = {
  draft: { label: "Чернетка", cls: "bg-zinc-700/40 text-zinc-300 border-zinc-700" },
  active: { label: "Активна", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  paused: { label: "Пауза", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  done: { label: "Завершено", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
};

const LEAD_STATUS_META: Record<Lead["status"], { label: string; cls: string }> = {
  pending: { label: "В черзі", cls: "text-zinc-300" },
  in_progress: { label: "В процесі", cls: "text-sky-300" },
  replied: { label: "Відповів", cls: "text-emerald-300" },
  done: { label: "Завершено", cls: "text-violet-300" },
  error: { label: "Помилка", cls: "text-red-300" },
};

const PLATFORMS = [
  { value: "telegram", label: "Telegram" },
  { value: "gmail", label: "Gmail" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
];

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uk", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

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
      <div className="px-6 pt-6 pb-4 border-b border-zinc-800">
        <Link href="/campaigns" className="text-xs text-zinc-500 hover:text-violet-300 transition-colors">
          ← Кампанії
        </Link>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <h1 className="text-2xl font-bold text-white">{campaign.name}</h1>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${meta.cls}`}>
            {meta.label}
          </span>
          <button
            onClick={toggleStatus}
            disabled={campaign.steps.length === 0}
            className={`ml-auto px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              campaign.status === "active"
                ? "bg-amber-600 hover:bg-amber-500 text-white"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
            title={campaign.steps.length === 0 ? "Додайте хоча б один крок" : undefined}
          >
            {campaign.status === "active" ? "Призупинити" : "Запустити"}
          </button>
        </div>
        {campaign.description && <p className="text-zinc-500 text-sm mt-1">{campaign.description}</p>}

        {/* Tabs */}
        <div className="flex gap-2 mt-4">
          {([
            ["leads", `Ліди (${campaign.stats.total})`],
            ["steps", `Кроки (${campaign.steps.length})`],
            ["analytics", "Аналітика"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${
                tab === key ? "bg-violet-500/20 text-violet-300" : "text-zinc-400 hover:text-white"
              }`}
            >
              {label}
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
        {tab === "analytics" && <AnalyticsTab stats={campaign.stats} />}
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
  steps: Step[];
  onChanged: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);

  const remove = async (leadId: string) => {
    if (!confirm("Видалити ліда з кампанії?")) return;
    await api.delete(`/campaigns/${campaignId}/leads/${leadId}`);
    onChanged();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-zinc-400">
          {leads.length > 0 ? `${leads.length} лідів` : "Ще немає лідів"}
        </p>
        <button
          onClick={() => setAddOpen(true)}
          className="px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
        >
          + Додати лідів
        </button>
      </div>

      {leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 border border-dashed border-zinc-800 rounded-xl">
          <p className="text-zinc-600 text-sm mb-2">Додайте контакти як лідів — їм відправляться повідомлення по кроках.</p>
          <button onClick={() => setAddOpen(true)} className="text-violet-400 text-sm hover:text-violet-300">
            + Додати
          </button>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-zinc-900/60">
              <tr className="text-left">
                <th className="py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Контакт</th>
                <th className="py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Статус</th>
                <th className="py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Крок</th>
                <th className="py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Останнє</th>
                <th className="py-3 px-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">Наступне</th>
                <th className="py-3 px-4 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const meta = LEAD_STATUS_META[lead.status];
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
                      <span className={`text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                      {lead.status === "error" && lead.error && (
                        <p className="text-[11px] text-red-400 mt-0.5 max-w-[240px] truncate" title={lead.error}>
                          {lead.error}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-zinc-400">
                      {steps.length > 0 ? `${Math.min(lead.current_step + 1, steps.length)} / ${steps.length}` : "—"}
                    </td>
                    <td className="py-3 px-4 text-xs text-zinc-500">{formatDate(lead.last_action_at)}</td>
                    <td className="py-3 px-4 text-xs text-zinc-500">{formatDate(lead.next_action_at)}</td>
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

function StepsTab({ steps, onSave }: { steps: Step[]; onSave: (steps: Step[]) => Promise<void> }) {
  const [local, setLocal] = useState<Step[]>(steps);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // Reset local when server state changes (e.g. after save).
  useEffect(() => { setLocal(steps); }, [steps]);

  const addStep = () => {
    const order = local.length + 1;
    setLocal([
      ...local,
      {
        order,
        type: "send_message",
        platform: order === 1 ? "telegram" : local[local.length - 1]?.platform || "telegram",
        content: "",
        subject: "",
        delay_minutes: order === 1 ? 0 : 60,
      },
    ]);
  };

  const updateStep = (idx: number, patch: Partial<Step>) => {
    setLocal((list) => list.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const removeStep = (idx: number) => {
    setLocal((list) => list.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })));
  };

  const save = async () => {
    setSaving(true);
    try {
      const sanitized = local.map((s, i) => ({ ...s, order: i + 1 }));
      await onSave(sanitized);
      setSavedAt(new Date());
    } finally {
      setSaving(false);
    }
  };

  const dirty = JSON.stringify(local) !== JSON.stringify(steps);
  const isEmail = (p?: string) => p === "gmail" || p === "outlook";

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-zinc-400">
          {local.length > 0 ? `${local.length} ${local.length === 1 ? "крок" : "кроків"}` : "Послідовність порожня"}
        </p>
        <div className="flex items-center gap-2">
          {savedAt && <span className="text-xs text-zinc-600">Збережено {savedAt.toLocaleTimeString("uk")}</span>}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors disabled:opacity-40"
          >
            {saving ? "Збереження…" : "Зберегти"}
          </button>
        </div>
      </div>

      {local.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 border border-dashed border-zinc-800 rounded-xl">
          <p className="text-zinc-600 text-sm mb-2">Додайте перший крок послідовності.</p>
          <button onClick={addStep} className="text-violet-400 text-sm hover:text-violet-300">
            + Крок
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {local.map((step, idx) => (
            <div key={idx} className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/40">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-violet-500/20 text-violet-300 text-xs font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <span className="text-sm text-white font-medium">Надіслати повідомлення</span>
                </div>
                <button
                  onClick={() => removeStep(idx)}
                  className="text-zinc-500 hover:text-red-400 transition-colors"
                  title="Видалити"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                    <polyline points="3,6 5,6 21,6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1">Платформа</label>
                  <select
                    value={step.platform || "telegram"}
                    onChange={(e) => updateStep(idx, { platform: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1">
                    {idx === 0 ? "Відправити через (хв, 0 = одразу)" : "Затримка від попереднього (хв)"}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={step.delay_minutes}
                    onChange={(e) => updateStep(idx, { delay_minutes: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              {isEmail(step.platform) && (
                <div className="mb-3">
                  <label className="block text-[11px] text-zinc-500 mb-1">Тема листа</label>
                  <input
                    type="text"
                    value={step.subject || ""}
                    onChange={(e) => updateStep(idx, { subject: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
                    placeholder="Subject"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Текст повідомлення</label>
                <textarea
                  value={step.content}
                  onChange={(e) => updateStep(idx, { content: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500 resize-y"
                  placeholder="Привіт, я хотів би обговорити…"
                />
              </div>
            </div>
          ))}

          <button
            onClick={addStep}
            className="py-3 border border-dashed border-zinc-700 rounded-xl text-sm text-zinc-400 hover:text-violet-300 hover:border-violet-500/40 transition-colors"
          >
            + Крок
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Analytics tab ─────────────────────────────────────────────────────

function AnalyticsTab({ stats }: { stats: Campaign["stats"] }) {
  const cards = [
    { label: "Всього лідів", value: stats.total, cls: "text-white" },
    { label: "В черзі", value: stats.pending, cls: "text-zinc-300" },
    { label: "В процесі", value: stats.in_progress, cls: "text-sky-300" },
    { label: "Відповіли", value: stats.replied, cls: "text-emerald-300" },
    { label: "Завершили", value: stats.done, cls: "text-violet-300" },
    { label: "Помилки", value: stats.error, cls: "text-red-300" },
  ];
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">{c.label}</p>
            <p className={`text-3xl font-bold mt-1 ${c.cls}`}>{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
