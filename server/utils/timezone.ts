/**
 * Consistent Uzbekistan (Asia/Tashkent, UTC+5) date & time helpers
 * Immune to host server timezone or DST differences.
 */

export const TASHKENT_TIMEZONE = 'Asia/Tashkent';

export function getTashkentTodayIso(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TASHKENT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function getTashkentTimeParts(date: Date = new Date()): {
  dateIso: string;
  hours: number;
  minutes: number;
  seconds: number;
  dateTimeStr: string;
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TASHKENT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hourRaw = Number(get('hour'));
  const hours = hourRaw === 24 ? 0 : hourRaw;
  const minutes = Number(get('minute'));
  const seconds = Number(get('second'));

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const dateIso = `${year}-${month}-${day}`;

  return {
    dateIso,
    hours,
    minutes,
    seconds,
    dateTimeStr: `${dateIso} ${hh}:${mm}:${ss}`
  };
}

/**
 * Day of week in Uzbekistan (1=Monday ... 7=Sunday) for a YYYY-MM-DD string.
 */
export function getTashkentDayOfWeek(dateIso: string): number {
  const safeIso = /^\d{4}-\d{2}-\d{2}$/.test(dateIso) ? dateIso : getTashkentTodayIso();
  const d = new Date(`${safeIso}T12:00:00+05:00`);
  const day = d.getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Generates inclusive YYYY-MM-DD and DD.MM.YYYY list safely using UTC arithmetic.
 */
export function generateIsoDateRange(startIso: string, endIso: string): Array<{ iso: string; formatted: string }> {
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return [];

  let curMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);
  const results: Array<{ iso: string; formatted: string }> = [];

  while (curMs <= endMs && results.length < 3660) {
    const dt = new Date(curMs);
    const yyyy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    results.push({
      iso: `${yyyy}-${mm}-${dd}`,
      formatted: `${dd}.${mm}.${yyyy}`
    });
    curMs += 86400000;
  }

  return results;
}
