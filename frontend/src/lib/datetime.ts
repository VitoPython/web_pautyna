// Backend returns naive datetimes serialized without a timezone suffix
// ("2026-04-20T07:56:00.123"), so the browser treats them as local time and
// displays the value offset by the user's tz. The backend always stores UTC,
// so we ensure a `Z` suffix before parsing.

export function ensureUtc(iso: string | null | undefined): string | null {
  if (!iso) return null;
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(iso)) return iso;
  return iso + "Z";
}

export function toLocal(iso: string | null | undefined): string {
  const s = ensureUtc(iso);
  if (!s) return "—";
  return new Date(s).toLocaleString("uk", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Human countdown like "за 15 хв" or "щойно". Negative diff → "зараз". */
export function countdown(iso: string | null | undefined, nowMs: number = Date.now()): string {
  const s = ensureUtc(iso);
  if (!s) return "—";
  const diff = new Date(s).getTime() - nowMs;
  if (diff <= 0) return "зараз";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "< 1 хв";
  if (mins < 60) return `за ${mins} хв`;
  const hours = Math.floor(mins / 60);
  const remMins = mins - hours * 60;
  if (hours < 24) return remMins > 0 ? `за ${hours} год ${remMins} хв` : `за ${hours} год`;
  const days = Math.floor(hours / 24);
  return `за ${days} дн`;
}
