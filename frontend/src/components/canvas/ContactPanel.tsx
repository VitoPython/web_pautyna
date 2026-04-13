"use client";

import type { GraphNode } from "./WebCanvas";

interface ContactPanelProps {
  contact: GraphNode;
  onClose: () => void;
  onDelete?: (id: string) => void;
}

const PLATFORM_INFO: Record<string, { label: string; color: string }> = {
  linkedin: { label: "LinkedIn", color: "text-blue-400" },
  instagram: { label: "Instagram", color: "text-pink-400" },
  telegram: { label: "Telegram", color: "text-sky-400" },
  gmail: { label: "Gmail", color: "text-red-400" },
};

export default function ContactPanel({ contact, onClose, onDelete }: ContactPanelProps) {
  if (contact.isCenter) {
    return (
      <div className="w-80 shrink-0 bg-zinc-900 border-l border-zinc-800 h-full flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-white font-semibold">Ваш профіль</h2>
          <CloseBtn onClick={onClose} />
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🕸️</span>
            </div>
            <p className="text-white font-medium text-lg">Центр вашої мережі</p>
            <p className="text-zinc-500 text-sm mt-2">Всі контакти з&apos;єднані через вас</p>
          </div>
        </div>
      </div>
    );
  }

  const pi = PLATFORM_INFO[contact.platform || ""];
  const details = [
    { icon: "mail", label: "Email", value: contact.email },
    { icon: "phone", label: "Телефон", value: contact.phone },
    { icon: "briefcase", label: "Посада", value: contact.job_title },
    { icon: "building", label: "Компанія", value: contact.company },
  ].filter((d) => d.value);

  return (
    <div className="w-80 shrink-0 bg-zinc-900 border-l border-zinc-800 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <h2 className="text-white font-semibold truncate">{contact.name}</h2>
        <CloseBtn onClick={onClose} />
      </div>

      {/* Profile card */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          {contact.avatar_url ? (
            <img src={contact.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center text-xl font-bold text-white shrink-0">
              {contact.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-white font-medium truncate">{contact.name}</p>
            {contact.job_title && <p className="text-zinc-400 text-xs truncate">{contact.job_title}</p>}
            {pi && <p className={`text-xs mt-0.5 ${pi.color}`}>{pi.label}</p>}
          </div>
        </div>

        {/* Tags */}
        {contact.tags && contact.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {contact.tags.map((tag) => (
              <span key={tag} className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-xs rounded-full">{tag}</span>
            ))}
          </div>
        )}
      </div>

      {/* Contact details */}
      {details.length > 0 && (
        <div className="p-4 border-b border-zinc-800">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Деталі</p>
          <div className="flex flex-col gap-2.5">
            {details.map((d) => (
              <div key={d.icon} className="flex items-center gap-3">
                <DetailIcon type={d.icon} />
                <div className="min-w-0">
                  <p className="text-zinc-500 text-xs">{d.label}</p>
                  <p className="text-zinc-200 text-sm truncate">{d.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="p-4 border-b border-zinc-800">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Дії</p>
        <div className="flex flex-col gap-2">
          <ActionBtn icon="mail" label="Надіслати повідомлення" />
          <ActionBtn icon="note" label="Відкрити нотатки" />
          <ActionBtn icon="action" label="Створити Action" />
        </div>
      </div>

      {/* Notion placeholder */}
      <div className="flex-1 p-4 overflow-auto">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Нотатки</p>
        <div className="border border-dashed border-zinc-700 rounded-lg p-4 text-center">
          <p className="text-zinc-600 text-sm">Notion-редактор буде тут</p>
        </div>
      </div>

      {/* Delete */}
      {onDelete && (
        <div className="p-4 border-t border-zinc-800">
          <button onClick={() => onDelete(contact.id)}
            className="w-full px-3 py-2 text-red-400 hover:bg-red-500/10 rounded-lg text-sm transition-colors">
            Видалити контакт
          </button>
        </div>
      )}
    </div>
  );
}

function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-zinc-500 hover:text-white transition-colors shrink-0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

function DetailIcon({ type }: { type: string }) {
  const cls = "w-4 h-4 text-zinc-500 shrink-0";
  switch (type) {
    case "mail": return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={cls}><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22,4 12,13 2,4" /></svg>;
    case "phone": return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={cls}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>;
    case "briefcase": return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={cls}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></svg>;
    case "building": return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={cls}><rect x="4" y="2" width="16" height="20" rx="1" /><line x1="9" y1="6" x2="9" y2="6.01" /><line x1="15" y1="6" x2="15" y2="6.01" /><line x1="9" y1="10" x2="9" y2="10.01" /><line x1="15" y1="10" x2="15" y2="10.01" /><line x1="9" y1="14" x2="9" y2="14.01" /><line x1="15" y1="14" x2="15" y2="14.01" /><path d="M9 22v-4h6v4" /></svg>;
    default: return null;
  }
}

function ActionBtn({ icon, label }: { icon: string; label: string }) {
  const iconEl = icon === "mail"
    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4"><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22,4 12,13 2,4" /></svg>
    : icon === "note"
    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" /></svg>
    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>;

  return (
    <button className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-300 transition-colors">
      {iconEl} {label}
    </button>
  );
}
