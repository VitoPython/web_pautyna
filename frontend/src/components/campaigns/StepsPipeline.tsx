"use client";

import { useEffect, useRef, useState } from "react";

export interface PipelineStep {
  order: number;
  type: string;
  platform?: string;
  content: string;
  subject?: string;
  delay_minutes: number;
}

interface Props {
  steps: PipelineStep[];
  runningIdx?: number | null; // highlight active step
  onChange: (steps: PipelineStep[]) => void;
}

const PLATFORMS = [
  { value: "telegram", label: "Telegram", icon: "✈", color: "text-sky-300 bg-sky-500/15 border-sky-500/30" },
  { value: "gmail", label: "Gmail", icon: "✉", color: "text-red-300 bg-red-500/15 border-red-500/30" },
  { value: "linkedin", label: "LinkedIn", icon: "in", color: "text-blue-300 bg-blue-500/15 border-blue-500/30" },
  { value: "instagram", label: "Instagram", icon: "◎", color: "text-pink-300 bg-pink-500/15 border-pink-500/30" },
  { value: "whatsapp", label: "WhatsApp", icon: "✆", color: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30" },
];

function platformMeta(code?: string) {
  return PLATFORMS.find((p) => p.value === code) || PLATFORMS[0];
}

function isEmail(p?: string) {
  return p === "gmail" || p === "outlook";
}

export default function StepsPipeline({ steps, runningIdx, onChange }: Props) {
  const [expanded, setExpanded] = useState<number | null>(steps.length > 0 ? 0 : null);

  useEffect(() => {
    if (expanded !== null && expanded >= steps.length) setExpanded(null);
  }, [steps.length, expanded]);

  const update = (idx: number, patch: Partial<PipelineStep>) => {
    onChange(steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const remove = (idx: number) => {
    onChange(steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })));
    setExpanded(null);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const to = idx + dir;
    if (to < 0 || to >= steps.length) return;
    const next = [...steps];
    [next[idx], next[to]] = [next[to], next[idx]];
    onChange(next.map((s, i) => ({ ...s, order: i + 1 })));
  };

  const add = () => {
    const order = steps.length + 1;
    const lastPlatform = steps[steps.length - 1]?.platform || "telegram";
    onChange([
      ...steps,
      {
        order,
        type: "send_message",
        platform: lastPlatform,
        content: "",
        subject: "",
        delay_minutes: order === 1 ? 0 : 60,
      },
    ]);
    setExpanded(steps.length);
  };

  return (
    <div className="flex flex-col items-center">
      {/* Start node */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-linear-to-r from-violet-500/30 to-violet-500/10 border border-violet-500/40 text-violet-200 text-xs font-medium">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        Старт кампанії
      </div>

      {steps.map((step, idx) => {
        const meta = platformMeta(step.platform);
        const isExpanded = expanded === idx;
        const isActive = runningIdx === idx;

        return (
          <div key={idx} className="w-full max-w-xl flex flex-col items-center">
            {/* Connector with delay chip */}
            <FlowLine active={isActive || runningIdx === idx - 1} />
            {step.delay_minutes > 0 && (
              <div className="text-[11px] text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-full px-2 py-0.5 mt-1 mb-1">
                {idx === 0 ? "через" : "+"} {formatDelay(step.delay_minutes)}
              </div>
            )}
            <FlowLine active={isActive || runningIdx === idx - 1} short />

            {/* Step node */}
            <div
              className={`w-full rounded-xl border transition-all ${
                isActive
                  ? "border-violet-500/60 bg-violet-500/5 shadow-[0_0_0_4px_rgba(139,92,246,0.15)]"
                  : isExpanded
                  ? "border-violet-500/40 bg-zinc-900"
                  : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
              }`}
            >
              <button
                type="button"
                onClick={() => setExpanded(isExpanded ? null : idx)}
                className="w-full flex items-center gap-3 p-3 text-left"
              >
                <span className={`w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-bold ${meta.color}`}>
                  {meta.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-500">Крок {idx + 1} · {meta.label}</p>
                  <p className="text-sm text-white truncate">
                    {step.content ? step.content : <span className="text-zinc-600 italic">Порожній</span>}
                  </p>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); move(idx, -1); }}
                    disabled={idx === 0}
                    className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded disabled:opacity-30"
                    title="Вгору"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
                      <polyline points="18,15 12,9 6,15" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); move(idx, 1); }}
                    disabled={idx === steps.length - 1}
                    className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded disabled:opacity-30"
                    title="Вниз"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
                      <polyline points="6,9 12,15 18,9" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); remove(idx); }}
                    className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded"
                    title="Видалити"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
                      <polyline points="3,6 5,6 21,6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 pt-1 flex flex-col gap-3 border-t border-zinc-800/60">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-zinc-500 mb-1">Платформа</label>
                      <select
                        value={step.platform || "telegram"}
                        onChange={(e) => update(idx, { platform: e.target.value })}
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
                      >
                        {PLATFORMS.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-500 mb-1">
                        {idx === 0 ? "Через (хв, 0=одразу)" : "Затримка від попереднього (хв)"}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={step.delay_minutes}
                        onChange={(e) => update(idx, { delay_minutes: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
                      />
                    </div>
                  </div>

                  {isEmail(step.platform) && (
                    <div>
                      <label className="block text-[11px] text-zinc-500 mb-1">Тема листа</label>
                      <input
                        type="text"
                        value={step.subject || ""}
                        onChange={(e) => update(idx, { subject: e.target.value })}
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
                        placeholder="Subject"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] text-zinc-500 mb-1">Текст повідомлення</label>
                    <textarea
                      value={step.content}
                      onChange={(e) => update(idx, { content: e.target.value })}
                      rows={4}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500 resize-y"
                      placeholder="Привіт, я хотів би обговорити…"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Tail connector + add button */}
      <FlowLine active={runningIdx === steps.length - 1} />
      <button
        type="button"
        onClick={add}
        className="mt-1 px-4 py-2 rounded-full bg-zinc-900 border border-dashed border-zinc-700 text-sm text-zinc-400 hover:text-violet-300 hover:border-violet-500/40 transition-colors"
      >
        + Крок
      </button>
    </div>
  );
}

function FlowLine({ active, short = false }: { active?: boolean; short?: boolean }) {
  return (
    <div
      className={`${short ? "h-3" : "h-6"} w-[2px] relative overflow-hidden`}
      style={{
        backgroundImage: active
          ? "linear-gradient(to bottom, rgba(139,92,246,0.9) 50%, transparent 50%)"
          : "linear-gradient(to bottom, rgb(63,63,70) 50%, transparent 50%)",
        backgroundSize: "2px 8px",
        animation: active ? "pipeline-flow 0.9s linear infinite" : undefined,
      }}
    />
  );
}

function formatDelay(mins: number): string {
  if (mins < 60) return `${mins} хв`;
  const h = Math.floor(mins / 60);
  const rem = mins - h * 60;
  return rem > 0 ? `${h} год ${rem} хв` : `${h} год`;
}
