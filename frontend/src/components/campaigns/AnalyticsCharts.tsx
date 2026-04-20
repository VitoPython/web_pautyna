"use client";

interface Stats {
  total: number;
  pending: number;
  in_progress: number;
  replied: number;
  done: number;
  error: number;
}

const COLORS = {
  pending: "#a1a1aa",
  in_progress: "#38bdf8",
  replied: "#34d399",
  done: "#a78bfa",
  error: "#f87171",
} as const;

const LABELS: Record<keyof typeof COLORS, string> = {
  pending: "В черзі",
  in_progress: "В процесі",
  replied: "Відповіли",
  done: "Завершили",
  error: "Помилки",
};

/** SVG donut for status distribution. Each slice proportional to its count. */
export function StatusDonut({ stats }: { stats: Stats }) {
  const size = 180;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = stats.total;

  const segments: { key: keyof typeof COLORS; value: number }[] = (
    [
      { key: "replied", value: stats.replied },
      { key: "done", value: stats.done },
      { key: "in_progress", value: stats.in_progress },
      { key: "pending", value: stats.pending },
      { key: "error", value: stats.error },
    ] as const
  ).filter((s) => s.value > 0);

  // Compute offsets for a segmented ring.
  let offset = 0;
  const arcs = segments.map((s) => {
    const length = total > 0 ? (s.value / total) * circumference : 0;
    const arc = {
      key: s.key,
      dash: length,
      gap: circumference - length,
      offset,
    };
    offset -= length;
    return arc;
  });

  const replyRate = total > 0 ? Math.round((stats.replied / total) * 100) : 0;

  return (
    <div className="flex items-center justify-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#27272a"
          strokeWidth={stroke}
        />
        {/* Segments */}
        {total > 0 && arcs.map((a) => (
          <circle
            key={a.key}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={COLORS[a.key]}
            strokeWidth={stroke}
            strokeDasharray={`${a.dash} ${a.gap}`}
            strokeDashoffset={a.offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dasharray 600ms ease-out, stroke-dashoffset 600ms ease-out" }}
          />
        ))}
        {/* Center text */}
        <text
          x="50%"
          y="46%"
          textAnchor="middle"
          className="fill-white"
          style={{ fontSize: 28, fontWeight: 700 }}
        >
          {replyRate}%
        </text>
        <text
          x="50%"
          y="62%"
          textAnchor="middle"
          className="fill-zinc-500"
          style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}
        >
          Reply rate
        </text>
      </svg>

      <div className="flex flex-col gap-2 min-w-0">
        {(Object.keys(LABELS) as Array<keyof typeof COLORS>).map((key) => {
          const value = stats[key];
          const pct = total > 0 ? Math.round((value / total) * 100) : 0;
          return (
            <div key={key} className="flex items-center gap-2 text-sm">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: COLORS[key] }}
              />
              <span className="text-zinc-400 w-24">{LABELS[key]}</span>
              <span className="text-white font-medium tabular-nums">{value}</span>
              <span className="text-zinc-600 text-xs tabular-nums">({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Horizontal funnel — how many leads reached each step. */
export function StepFunnel({
  steps,
  leadsAtStep,
  totalLeads,
}: {
  steps: { order: number; content: string; platform?: string }[];
  leadsAtStep: number[]; // count of leads that have completed step i (i.e. current_step > i)
  totalLeads: number;
}) {
  if (steps.length === 0) return null;
  const maxWidth = Math.max(totalLeads, 1);
  return (
    <div className="flex flex-col gap-2">
      {steps.map((step, idx) => {
        const count = leadsAtStep[idx] || 0;
        const pct = Math.round((count / maxWidth) * 100);
        const conversion = idx > 0 && leadsAtStep[idx - 1] > 0
          ? Math.round((count / leadsAtStep[idx - 1]) * 100)
          : null;
        return (
          <div key={idx} className="group">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-5 h-5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-bold flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <span className="text-sm text-zinc-300 truncate">
                  {step.content || <span className="text-zinc-600 italic">Порожній крок</span>}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs shrink-0 ml-2">
                <span className="text-white font-medium tabular-nums">{count}</span>
                {conversion !== null && (
                  <span className={conversion === 100 ? "text-emerald-400" : "text-zinc-500"}>
                    · {conversion}%
                  </span>
                )}
              </div>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(to right, #8b5cf6, #c084fc)`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
