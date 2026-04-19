"use client";

import Link from "next/link";
import { useEffect } from "react";

export interface DrawerContact {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  job_title?: string;
  company?: string;
  website?: string;
  avatar_url?: string;
  platforms: { type: string; profile_id: string; chat_id?: string; account_id?: string }[];
  tags: string[];
  extra?: { email?: string; phone?: string; job_title?: string; company?: string };
}

interface Props {
  contact: DrawerContact;
  onClose: () => void;
  onEdit: () => void;
}

// Platforms that support direct in-app messaging via Unipile.
const CHATTABLE = new Set(["telegram", "gmail", "google_oauth", "outlook", "linkedin", "instagram", "whatsapp"]);

const PLATFORM_META: Record<string, { label: string; color: string; profileBase?: string }> = {
  telegram: { label: "Telegram", color: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  gmail: { label: "Gmail", color: "bg-red-500/15 text-red-300 border-red-500/30" },
  google_oauth: { label: "Gmail", color: "bg-red-500/15 text-red-300 border-red-500/30" },
  outlook: { label: "Outlook", color: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
  linkedin: {
    label: "LinkedIn",
    color: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    profileBase: "https://www.linkedin.com/in/",
  },
  instagram: {
    label: "Instagram",
    color: "bg-pink-500/15 text-pink-300 border-pink-500/30",
    profileBase: "https://www.instagram.com/",
  },
  whatsapp: { label: "WhatsApp", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
};

function getField(c: DrawerContact, field: "email" | "phone" | "job_title" | "company"): string {
  return c[field] || c.extra?.[field] || "";
}

function externalUrl(type: string, profileId: string): string | null {
  const meta = PLATFORM_META[type];
  if (!meta?.profileBase) return null;
  if (profileId.startsWith("http://") || profileId.startsWith("https://")) return profileId;
  return meta.profileBase + profileId;
}

export default function ContactDrawer({ contact, onClose, onEdit }: Props) {
  // Close on Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const email = getField(contact, "email");
  const phone = getField(contact, "phone");
  const jobTitle = getField(contact, "job_title");
  const company = getField(contact, "company");
  const website = contact.website || "";

  // Split platforms: direct-messaging vs profile-only links.
  const messagingPlatforms = contact.platforms.filter(
    (p) => CHATTABLE.has(p.type) && (p.chat_id || p.account_id)
  );
  const profilePlatforms = contact.platforms.filter(
    (p) => !messagingPlatforms.includes(p) && externalUrl(p.type, p.profile_id)
  );

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60" onClick={onClose} />
      <aside className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 h-full flex flex-col shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900 z-10">
          <h2 className="text-white font-semibold">Контакт</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              className="text-zinc-400 hover:text-violet-300 transition-colors p-1.5 rounded-lg hover:bg-zinc-800"
              title="Редагувати"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-zinc-800"
              title="Закрити"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Profile */}
        <div className="p-5 flex items-center gap-4 border-b border-zinc-800">
          {contact.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={contact.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center text-2xl font-bold text-white shrink-0">
              {contact.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-white font-semibold text-lg truncate">{contact.name}</h3>
            {jobTitle && <p className="text-zinc-400 text-sm truncate">{jobTitle}</p>}
            {company && <p className="text-zinc-500 text-xs truncate mt-0.5">{company}</p>}
            {contact.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {contact.tags.map((t) => (
                  <span key={t} className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-[11px] rounded-full">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Direct-messaging platforms */}
        {messagingPlatforms.length > 0 && (
          <div className="p-5 border-b border-zinc-800">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Написати</p>
            <div className="flex flex-col gap-2">
              {messagingPlatforms.map((p, idx) => {
                const meta = PLATFORM_META[p.type] || { label: p.type, color: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30" };
                return (
                  <Link
                    key={`${p.type}-${idx}`}
                    href={`/inbox?contact=${contact._id}`}
                    onClick={onClose}
                    className={`flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm font-medium hover:brightness-125 transition ${meta.color}`}
                  >
                    <span>{meta.label}</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12,5 19,12 12,19" />
                    </svg>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* External profiles */}
        {profilePlatforms.length > 0 && (
          <div className="p-5 border-b border-zinc-800">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Профілі</p>
            <div className="flex flex-col gap-2">
              {profilePlatforms.map((p, idx) => {
                const meta = PLATFORM_META[p.type] || { label: p.type, color: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30" };
                const href = externalUrl(p.type, p.profile_id) || "#";
                return (
                  <a
                    key={`${p.type}-ext-${idx}`}
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={`flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm font-medium hover:brightness-125 transition ${meta.color}`}
                  >
                    <span>{meta.label}</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15,3 21,3 21,9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Details */}
        <div className="p-5 border-b border-zinc-800">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Деталі</p>
          <div className="flex flex-col gap-3">
            <DetailRow icon="mail" label="Email" value={email} href={email ? `mailto:${email}` : undefined} />
            <DetailRow icon="phone" label="Телефон" value={phone} href={phone ? `tel:${phone}` : undefined} />
            <DetailRow icon="briefcase" label="Посада" value={jobTitle} />
            <DetailRow icon="building" label="Компанія" value={company} />
            <DetailRow
              icon="globe"
              label="Вебсайт"
              value={website}
              href={website ? (website.startsWith("http") ? website : `https://${website}`) : undefined}
            />
          </div>
        </div>

        {/* Bottom action */}
        <div className="p-4 mt-auto">
          <Link
            href={`/web?contact=${contact._id}`}
            onClick={onClose}
            className="flex items-center justify-center gap-2 w-full py-2.5 text-sm text-violet-300 bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 rounded-lg transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="12" r="6" strokeDasharray="2 2" />
              <circle cx="12" cy="12" r="10" strokeDasharray="3 3" />
            </svg>
            Відкрити в Павутині
          </Link>
        </div>
      </aside>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  href,
}: {
  icon: string;
  label: string;
  value: string;
  href?: string;
}) {
  if (!value) {
    return (
      <div className="flex items-center gap-3 text-zinc-600">
        <DetailIcon type={icon} />
        <div>
          <p className="text-[11px] text-zinc-500">{label}</p>
          <p className="text-sm">—</p>
        </div>
      </div>
    );
  }
  const content = (
    <>
      <DetailIcon type={icon} />
      <div className="min-w-0">
        <p className="text-[11px] text-zinc-500">{label}</p>
        <p className="text-sm text-zinc-200 truncate">{value}</p>
      </div>
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel={href.startsWith("http") ? "noreferrer noopener" : undefined}
        className="flex items-center gap-3 hover:text-violet-300 transition-colors"
      >
        {content}
      </a>
    );
  }
  return <div className="flex items-center gap-3">{content}</div>;
}

function DetailIcon({ type }: { type: string }) {
  const cls = "w-4 h-4 text-zinc-500 shrink-0";
  switch (type) {
    case "mail":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={cls}>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <polyline points="22,4 12,13 2,4" />
        </svg>
      );
    case "phone":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={cls}>
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      );
    case "briefcase":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={cls}>
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        </svg>
      );
    case "building":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={cls}>
          <rect x="4" y="2" width="16" height="20" rx="1" />
          <line x1="9" y1="6" x2="9" y2="6.01" />
          <line x1="15" y1="6" x2="15" y2="6.01" />
          <line x1="9" y1="10" x2="9" y2="10.01" />
          <line x1="15" y1="10" x2="15" y2="10.01" />
          <path d="M9 22v-4h6v4" />
        </svg>
      );
    case "globe":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={cls}>
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    default:
      return null;
  }
}
