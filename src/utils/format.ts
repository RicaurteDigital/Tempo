// Formatting utilities using Intl (es-419)

const numberFmt = new Intl.NumberFormat('es-419', { maximumFractionDigits: 1 });
const percentFmt = new Intl.NumberFormat('es-419', { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' });
const dateFmt = new Intl.DateTimeFormat('es-419', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('es-419', { hour: '2-digit', minute: '2-digit', hour12: false });

/** Format ms as "Xh Ym" or "Xm" or "Xs" */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  return `${seconds}s`;
}

/** Format ms as "HH:MM:SS" for the big timer display */
export function formatTimerDisplay(ms: number): string {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const h = hours.toString().padStart(2, '0');
  const m = minutes.toString().padStart(2, '0');
  const s = seconds.toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/** Format delta as "+12.3%" or "−38%" */
export function formatDelta(actual: number, expected: number): string {
  if (expected === 0) return '—';
  const ratio = (actual - expected) / expected;
  return percentFmt.format(ratio);
}

/** Localized number */
export function formatNumber(n: number): string {
  return numberFmt.format(n);
}

/** Localized date: "jueves, 12 de junio" */
export function formatDate(date: Date): string {
  return dateFmt.format(date);
}

/** Localized time: "14:30" */
export function formatTime(date: Date): string {
  return timeFmt.format(date);
}

/** Relative time: "hace 3 días" */
export function formatRelativeTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `hace ${days} día${days > 1 ? 's' : ''}`;
  if (hours > 0) return `hace ${hours} hora${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
  return 'hace un momento';
}
