// Same-day scheduling-conflict detection. A person — candidate or interviewer —
// can't reasonably be in two interview sessions back-to-back, so any two
// sessions involving the same person on the same date must sit at least
// MIN_GAP_MINUTES apart (measured from one session's end to the next one's start).

export const MIN_GAP_MINUTES = 60;

export function timeToMinutes(time: string): number {
  const [h, m] = (time || '0:0').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export interface TimeWindow {
  time: string;
  duration: number;
}

// True when the two sessions overlap or sit closer together than the
// required gap — i.e. scheduling `b` alongside `a` would be a conflict.
export function isWithinGap(a: TimeWindow, b: TimeWindow, gapMinutes = MIN_GAP_MINUTES): boolean {
  const aStart = timeToMinutes(a.time);
  const aEnd = aStart + (Number(a.duration) || 60);
  const bStart = timeToMinutes(b.time);
  const bEnd = bStart + (Number(b.duration) || 60);
  return aStart < bEnd + gapMinutes && bStart < aEnd + gapMinutes;
}

// Combine a YYYY-MM-DD date and an optional HH:MM time into a Date.
// A missing time defaults to the end of that day, so a date-only deadline
// ("due 2026-06-12") isn't considered overdue until that whole day has passed.
export function parseDueDateTime(date: string, time?: string): Date | null {
  if (!date) return null;
  const timePart = time && /^\d{1,2}:\d{2}$/.test(time) ? time : '23:59';
  const d = new Date(`${date}T${timePart}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// True when a scheduled date/time has passed and the activity is still in a
// non-terminal state (e.g. an interview still "scheduled" or an assessment
// still "pending"/"submitted") — used to surface "Overdue" badges across
// interviews and assessments so nothing silently falls through the cracks.
export function isOverdue(date: string, time: string | undefined, isPending: boolean, now: Date = new Date()): boolean {
  if (!isPending) return false;
  const due = parseDueDateTime(date, time);
  if (!due) return false;
  return due.getTime() < now.getTime();
}
