// Duração legível: "45s" / "3min 05s" / "1h 02min"
export const fmtDur = (sec) => {
  if (sec == null || sec < 0) return '—';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}min ${String(sec % 60).padStart(2, '0')}s`;
  return `${Math.floor(sec / 3600)}h ${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}min`;
};

// Cronômetro mm:ss (ou h:mm:ss a partir de 1 hora)
export const fmtClock = (sec) => {
  if (sec == null || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// Segundos decorridos desde um timestamp
export const elapsedSec = (from, now = Date.now()) =>
  from ? Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000)) : null;
