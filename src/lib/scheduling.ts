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
