// WebAudio tones — no asset files, works offline.
// chime  = gentle two-note marker (minute-10 checkpoint)
// alarm  = harsh repeating square blasts (minute-35 ceiling), runs until stopped
let ctx = null;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, offset, dur, type = 'sine', vol = 0.18) {
  const c = ac();
  const t0 = c.currentTime + offset;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export function chime() {
  tone(880, 0, 0.3);
  tone(1318.5, 0.32, 0.5);
}

export function success() {
  tone(659.3, 0, 0.12);
  tone(880, 0.13, 0.12);
  tone(1318.5, 0.26, 0.3);
}

// single soft note — recognition-mode sub-timer, lighter than the solve chime
export function blip() {
  tone(660, 0, 0.18, 'sine', 0.14);
}

let alarmTimer = null;
export function startAlarm() {
  if (alarmTimer) return;
  const blast = () => {
    tone(740, 0, 0.16, 'square', 0.22);
    tone(740, 0.24, 0.16, 'square', 0.22);
    tone(988, 0.48, 0.22, 'square', 0.22);
  };
  blast();
  alarmTimer = setInterval(blast, 1700);
}
export function stopAlarm() {
  if (alarmTimer) clearInterval(alarmTimer);
  alarmTimer = null;
}
