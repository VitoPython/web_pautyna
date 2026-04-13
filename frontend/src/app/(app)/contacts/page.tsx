"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";

interface Contact {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  job_title?: string;
  company?: string;
  website?: string;
  avatar_url?: string;
  platforms: { type: string; profile_id: string }[];
  tags: string[];
  extra?: { email?: string; phone?: string; job_title?: string; company?: string };
}

type ModalView = null | "choose" | "manual" | "csv" | "edit";

const PLATFORM_BADGE: Record<string, { label: string; cls: string }> = {
  linkedin: { label: "LinkedIn", cls: "bg-blue-500/15 text-blue-400" },
  instagram: { label: "Instagram", cls: "bg-pink-500/15 text-pink-400" },
  telegram: { label: "Telegram", cls: "bg-sky-500/15 text-sky-400" },
  gmail: { label: "Gmail", cls: "bg-red-500/15 text-red-400" },
};

function getField(c: Contact, field: string): string {
  return (c as any)[field] || (c.extra as any)?.[field] || "";
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalView>(null);
  const [editContact, setEditContact] = useState<Contact | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/contacts");
      setContacts(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = useCallback(async (id: string) => {
    await api.delete(`/contacts/${id}`);
    setContacts((prev) => prev.filter((c) => c._id !== id));
  }, []);

  const openEdit = useCallback((c: Contact) => {
    setEditContact(c);
    setModal("edit");
  }, []);

  const filtered = contacts.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.tags.some((t) => t.toLowerCase().includes(q)) ||
      c.platforms.some((p) => p.type.includes(q)) ||
      getField(c, "email").toLowerCase().includes(q) ||
      getField(c, "company").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 pb-0">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-white">Контакти</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{contacts.length} контактів у павутині</p>
          </div>
          <button
            onClick={() => setModal("choose")}
            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-violet-500/20"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Додати контакт
          </button>
        </div>
        <div className="mb-4 relative">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук контактів..."
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors" />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border border-dashed border-zinc-800 rounded-xl">
            <p className="text-zinc-600 mb-3">{search ? "Нічого не знайдено" : "Додайте перший контакт"}</p>
            {!search && (
              <button onClick={() => setModal("choose")} className="text-violet-400 hover:text-violet-300 text-sm">+ Додати контакт</button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="py-3 px-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Контакт</th>
                <th className="py-3 px-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Платформа</th>
                <th className="py-3 px-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Email</th>
                <th className="py-3 px-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Компанія</th>
                <th className="py-3 px-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">Теги</th>
                <th className="py-3 px-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const badge = c.platforms?.[0] ? PLATFORM_BADGE[c.platforms[0].type] : null;
                const email = getField(c, "email");
                const company = getField(c, "company");
                const jobTitle = getField(c, "job_title");
                return (
                  <tr key={c._id} className="border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors group cursor-pointer" onClick={() => openEdit(c)}>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-3">
                        {c.avatar_url ? (
                          <img src={c.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-bold text-white shrink-0">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-white text-sm font-medium">{c.name}</p>
                          {jobTitle && <p className="text-zinc-500 text-xs">{jobTitle}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      {badge ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                      ) : <span className="text-zinc-700 text-xs">—</span>}
                    </td>
                    <td className="py-3 px-3 text-zinc-400 text-sm">{email || "—"}</td>
                    <td className="py-3 px-3 text-zinc-400 text-sm">{company || "—"}</td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.map((tag) => (
                          <span key={tag} className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-xs rounded-full">{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => handleDelete(c._id)}
                        className="text-zinc-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100" title="Видалити">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                          <polyline points="3,6 5,6 21,6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modals ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setModal(null); setEditContact(null); }} />
          {modal === "choose" && <ChooseModal onPick={(v) => setModal(v)} onClose={() => setModal(null)} />}
          {modal === "csv" && <CsvModal onDone={() => { setModal(null); load(); }} onBack={() => setModal("choose")} onClose={() => setModal(null)} />}
          {modal === "manual" && <ManualModal onDone={() => { setModal(null); load(); }} onBack={() => setModal("choose")} onClose={() => setModal(null)} />}
          {modal === "edit" && editContact && <EditModal contact={editContact} onDone={() => { setModal(null); setEditContact(null); load(); }} onClose={() => { setModal(null); setEditContact(null); }} />}
        </div>
      )}
    </div>
  );
}

// ── Choose Modal ──
function ChooseModal({ onPick, onClose }: { onPick: (v: "csv" | "manual") => void; onClose: () => void }) {
  return (
    <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-white">Додати контакт</h2>
        <CloseBtn onClick={onClose} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ChooseCard icon="csv" color="violet" label="Імпорт з CSV" desc="Завантажте CSV файл з контактами" onClick={() => onPick("csv")} />
        <ChooseCard icon="manual" color="emerald" label="Додати вручну" desc="Створити контакт через форму" onClick={() => onPick("manual")} />
      </div>
    </div>
  );
}

function ChooseCard({ icon, color, label, desc, onClick }: { icon: string; color: string; label: string; desc: string; onClick: () => void }) {
  const c = color === "violet" ? { bg: "bg-violet-500/10", hover: "hover:border-violet-500/50 hover:bg-violet-500/5", hoverBg: "group-hover:bg-violet-500/20", text: "text-violet-400" }
    : { bg: "bg-emerald-500/10", hover: "hover:border-emerald-500/50 hover:bg-emerald-500/5", hoverBg: "group-hover:bg-emerald-500/20", text: "text-emerald-400" };
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-3 p-5 bg-zinc-800/50 border border-zinc-700/50 rounded-xl ${c.hover} transition-colors group`}>
      <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center ${c.hoverBg} transition-colors`}>
        {icon === "csv" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={`w-6 h-6 ${c.text}`}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" />
            <line x1="12" y1="18" x2="12" y2="12" /><polyline points="9,15 12,12 15,15" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={`w-6 h-6 ${c.text}`}>
            <circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 1 0-16 0" />
            <line x1="20" y1="11" x2="20" y2="17" /><line x1="17" y1="14" x2="23" y2="14" />
          </svg>
        )}
      </div>
      <div className="text-center">
        <p className="text-white font-medium text-sm">{label}</p>
        <p className="text-zinc-500 text-xs mt-0.5">{desc}</p>
      </div>
    </button>
  );
}

// ── CSV Modal ──
function CsvModal({ onDone, onBack, onClose }: { onDone: () => void; onBack: () => void; onClose: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true); setError(""); setResult(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post("/integrations/csv/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setResult(data);
    } catch (err: unknown) { setError(getErrorMessage(err, "Помилка")); } finally { setUploading(false); }
  };

  return (
    <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
      <ModalHeader title="Імпорт з CSV" icon="csv" color="violet" onBack={onBack} onClose={onClose} />
      {!result ? (
        <>
          <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${dragOver ? "border-violet-500 bg-violet-500/5" : "border-zinc-700"}`}>
            <div className="w-12 h-12 rounded-full bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6 text-violet-400">
                <line x1="12" y1="18" x2="12" y2="8" /><polyline points="8,12 12,8 16,12" /><path d="M20 21H4" />
              </svg>
            </div>
            <p className="text-white font-medium mb-1">Завантажте CSV файл</p>
            <p className="text-zinc-500 text-sm mb-4">Перетягніть файл або натисніть кнопку</p>
            <input ref={fileRef} type="file" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} className="hidden" />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="px-5 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {uploading ? "Завантаження..." : "Обрати файл"}
            </button>
          </div>
          {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        </>
      ) : (
        <div className="text-center py-6">
          <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-7 h-7 text-emerald-400"><polyline points="20,6 9,17 4,12" /></svg>
          </div>
          <p className="text-white font-medium text-lg mb-1">Імпорт завершено!</p>
          <p className="text-zinc-400 text-sm">Додано: <strong className="text-emerald-400">{result.imported}</strong>{result.skipped > 0 && ` · Пропущено: ${result.skipped}`}</p>
          <button onClick={onDone} className="mt-5 px-6 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors">Готово</button>
        </div>
      )}
    </div>
  );
}

// ── Manual / Edit shared form fields ──
interface FormData {
  firstName: string; lastName: string; email: string; phone: string;
  platform: string; profileUrl: string; jobTitle: string; company: string; website: string; tags: string;
}

const EMPTY_FORM: FormData = { firstName: "", lastName: "", email: "", phone: "", platform: "linkedin", profileUrl: "", jobTitle: "", company: "", website: "", tags: "" };

function ContactForm({ form, setForm, children }: { form: FormData; setForm: (f: FormData) => void; children: React.ReactNode }) {
  const set = (key: keyof FormData, val: string) => setForm({ ...form, [key]: val });
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ім'я *" value={form.firstName} onChange={(v) => set("firstName", v)} placeholder="Ім'я" autoFocus required />
        <Field label="Прізвище" value={form.lastName} onChange={(v) => set("lastName", v)} placeholder="Прізвище" />
      </div>
      <div>
        <label className="block text-sm text-zinc-400 mb-1">Профіль</label>
        <div className="flex gap-2">
          <select value={form.platform} onChange={(e) => set("platform", e.target.value)}
            className="px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500 w-36">
            <option value="linkedin">LinkedIn</option><option value="instagram">Instagram</option>
            <option value="telegram">Telegram</option><option value="gmail">Gmail</option>
          </select>
          <input type="text" value={form.profileUrl} onChange={(e) => set("profileUrl", e.target.value)} placeholder="https://linkedin.com/in/..."
            className="flex-1 px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-violet-500" />
        </div>
      </div>
      <Field label="Посада" value={form.jobTitle} onChange={(v) => set("jobTitle", v)} placeholder="Marketing Manager" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Компанія" value={form.company} onChange={(v) => set("company", v)} placeholder="Acme Corp" />
        <Field label="Вебсайт" value={form.website} onChange={(v) => set("website", v)} placeholder="https://..." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email" value={form.email} onChange={(v) => set("email", v)} placeholder="email@example.com" type="email" />
        <Field label="Телефон" value={form.phone} onChange={(v) => set("phone", v)} placeholder="+380..." />
      </div>
      <Field label="Теги" value={form.tags} onChange={(v) => set("tags", v)} placeholder="B2B, Kyiv, Partner" />
      {children}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", autoFocus, required }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string; autoFocus?: boolean; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm text-zinc-400 mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} required={required}
        className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors" />
    </div>
  );
}

// ── Manual Modal ──
function ManualModal({ onDone, onBack, onClose }: { onDone: () => void; onBack: () => void; onClose: () => void }) {
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
    if (!name) return;
    setLoading(true); setError("");
    try {
      const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
      const platforms = form.profileUrl.trim() ? [{ type: form.platform, profile_id: form.profileUrl.trim() }] : [];
      await api.post("/contacts", { name, email: form.email, phone: form.phone, job_title: form.jobTitle, company: form.company, website: form.website, platforms, tags, position: { x: 0, y: 0 } });
      onDone();
    } catch (err: unknown) { setError(getErrorMessage(err, "Помилка")); } finally { setLoading(false); }
  };

  return (
    <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
      <ModalHeader title="Створити контакт" icon="manual" color="emerald" onBack={onBack} onClose={onClose} />
      <form onSubmit={handleSubmit}>
        <ContactForm form={form} setForm={setForm}>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex justify-end gap-3 mt-1">
            <button type="button" onClick={onClose} className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-lg">Скасувати</button>
            <button type="submit" disabled={loading || !form.firstName.trim()} className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
              {loading ? "Створюю..." : "Створити контакт"}
            </button>
          </div>
        </ContactForm>
      </form>
    </div>
  );
}

// ── Edit Modal ──
function EditModal({ contact, onDone, onClose }: { contact: Contact; onDone: () => void; onClose: () => void }) {
  const nameParts = contact.name.split(" ");
  const [form, setForm] = useState<FormData>({
    firstName: nameParts[0] || "",
    lastName: nameParts.slice(1).join(" ") || "",
    email: getField(contact, "email"),
    phone: getField(contact, "phone"),
    platform: contact.platforms?.[0]?.type || "linkedin",
    profileUrl: contact.platforms?.[0]?.profile_id || "",
    jobTitle: getField(contact, "job_title"),
    company: getField(contact, "company"),
    website: (contact as any).website || "",
    tags: contact.tags.join(", "),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(contact.avatar_url || "");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post(`/contacts/${contact._id}/avatar`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setAvatarUrl(data.avatar_url);
    } catch { /* ignore */ } finally { setAvatarUploading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
    if (!name) return;
    setLoading(true); setError("");
    try {
      const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
      const platforms = form.profileUrl.trim() ? [{ type: form.platform, profile_id: form.profileUrl.trim() }] : [];
      await api.patch(`/contacts/${contact._id}`, { name, email: form.email, phone: form.phone, job_title: form.jobTitle, company: form.company, website: form.website, platforms, tags });
      onDone();
    } catch (err: unknown) { setError(getErrorMessage(err, "Помилка")); } finally { setLoading(false); }
  };

  return (
    <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-white">Редагувати контакт</h2>
        <CloseBtn onClick={onClose} />
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4 mb-5 pb-5 border-b border-zinc-800">
        <div className="relative group cursor-pointer" onClick={() => avatarRef.current?.click()}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center text-2xl font-bold text-white">
              {contact.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            {avatarUploading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5 text-white">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            )}
          </div>
          <input ref={avatarRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
        </div>
        <div>
          <p className="text-white font-medium">{contact.name}</p>
          <p className="text-zinc-500 text-xs mt-0.5">Натисніть на аватар щоб змінити фото</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <ContactForm form={form} setForm={setForm}>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex justify-end gap-3 mt-1">
            <button type="button" onClick={onClose} className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-lg">Скасувати</button>
            <button type="submit" disabled={loading || !form.firstName.trim()} className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
              {loading ? "Зберігаю..." : "Зберегти"}
            </button>
          </div>
        </ContactForm>
      </form>
    </div>
  );
}

// ── Shared components ──
function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-zinc-500 hover:text-white transition-colors">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

function ModalHeader({ title, icon, color, onBack, onClose }: { title: string; icon: string; color: string; onBack: () => void; onClose: () => void }) {
  const c = color === "violet" ? { bg: "bg-violet-500/10", text: "text-violet-400" } : { bg: "bg-emerald-500/10", text: "text-emerald-400" };
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-zinc-500 hover:text-white transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><polyline points="15,18 9,12 15,6" /></svg>
        </button>
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}>
            {icon === "csv" ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={`w-4 h-4 ${c.text}`}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={`w-4 h-4 ${c.text}`}>
                <circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 1 0-16 0" />
              </svg>
            )}
          </div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>
      </div>
      <CloseBtn onClick={onClose} />
    </div>
  );
}
