// Anúncio por voz usando a Web Speech API (voz local do navegador, funciona em intranet)

let ptVoice = null;

function pickVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  ptVoice =
    voices.find((v) => v.lang === 'pt-BR') ||
    voices.find((v) => v.lang?.startsWith('pt')) ||
    null;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  pickVoice();
  window.speechSynthesis.onvoiceschanged = pickVoice;
}

export function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [880, 1174.66]; // lá 5 → ré 6, "ding-dong" de chamada
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.35;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.4, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      osc.start(t);
      osc.stop(t + 0.65);
    });
    return new Promise((resolve) => setTimeout(resolve, 900));
  } catch {
    return Promise.resolve();
  }
}

function spellCode(code) {
  // "N003" → "N, 0, 0, 3" para a voz soletrar de forma clara
  return code.split('').join(', ');
}

export async function announceTicket(ticket) {
  if (!('speechSynthesis' in window)) return;
  await playChime();
  const parts = [`Senha ${spellCode(ticket.code)}`];
  if (ticket.customer_name) parts.push(ticket.customer_name);
  if (ticket.counter_name) parts.push(ticket.counter_name);
  const utter = new SpeechSynthesisUtterance(parts.join('. '));
  utter.lang = 'pt-BR';
  if (ptVoice) utter.voice = ptVoice;
  utter.rate = 0.95;
  utter.volume = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}
