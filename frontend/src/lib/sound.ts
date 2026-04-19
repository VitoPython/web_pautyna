// Tiny ping for inbox notifications. Uses the Web Audio API so we don't need
// to ship an audio file. Lazily creates a single AudioContext per tab — browsers
// require a user gesture before audio can play, so the first ping may be muted
// until the user clicks somewhere in the page (we accept that).

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  type WithWebkit = typeof window & { webkitAudioContext?: typeof AudioContext };
  const w = window as WithWebkit;
  const AC = w.AudioContext || w.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  return ctx;
}

export function playPing() {
  const ac = getContext();
  if (!ac) return;

  // Two short tones: 880 Hz then 660 Hz — soft but distinctive.
  const now = ac.currentTime;
  const master = ac.createGain();
  master.gain.value = 0.12;
  master.connect(ac.destination);

  const tone = (freq: number, start: number, dur: number) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(1, now + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
    osc.connect(gain).connect(master);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.02);
  };

  tone(880, 0, 0.12);
  tone(660, 0.13, 0.18);
}
