export function fmtTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function fmtHours(s: number): string {
  return (s / 3600).toFixed(1) + 'h';
}

export function fmtHora(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function mmToImperial(mm: number) {
  if (!mm) return { ft: 0, inch: 0, frac: '0' };
  const totalIn = mm / 25.4;
  const ft = Math.floor(totalIn / 12);
  const remIn = totalIn - ft * 12;
  const inch = Math.floor(remIn);
  const fracVal = remIn - inch;
  const fracs = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
  const closest = fracs.reduce((a, b) => (Math.abs(b - fracVal) < Math.abs(a - fracVal) ? b : a));
  return { ft, inch, frac: String(closest) };
}
