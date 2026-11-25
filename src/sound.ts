let ctx: AudioContext | null = null;
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function playSoftTick() {
  try {
    const ac = getCtx();
    const now = ac.currentTime;
    const DUR = 0.55;

    const master = ac.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(0.028, now + 0.06);
    master.gain.linearRampToValueAtTime(0.022, now + 0.18);
    master.gain.exponentialRampToValueAtTime(0.0001, now + DUR);
    master.connect(ac.destination);

    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(900, now);
    lp.frequency.exponentialRampToValueAtTime(600, now + DUR);
    lp.Q.value = 0.4;
    lp.connect(master);

    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(392, now);
    osc.connect(lp);
    osc.start(now);
    osc.stop(now + DUR + 0.05);

    const sub = ac.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(196, now);
    const subGain = ac.createGain();
    subGain.gain.setValueAtTime(0, now);
    subGain.gain.linearRampToValueAtTime(0.4, now + 0.08);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + DUR);
    sub.connect(subGain);
    subGain.connect(lp);
    sub.start(now);
    sub.stop(now + DUR + 0.05);
  } catch {}
}

export function playListenChime() {
  try {
    const ac = getCtx();
    const now = ac.currentTime;

    const master = ac.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(0.035, now + 0.18);
    master.gain.linearRampToValueAtTime(0.022, now + 0.45);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
    master.connect(ac.destination);

    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1600;
    lp.Q.value = 0.6;
    lp.connect(master);

    const notes = [
      { f: 523.25, start: 0.0, dur: 0.7 },
      { f: 783.99, start: 0.12, dur: 0.75 },
    ];
    for (const n of notes) {
      const osc = ac.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(n.f, now + n.start);
      const g = ac.createGain();
      g.gain.setValueAtTime(0, now + n.start);
      g.gain.linearRampToValueAtTime(0.55, now + n.start + 0.22);
      g.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);
      osc.connect(g);
      g.connect(lp);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.05);
    }
  } catch {}
}
