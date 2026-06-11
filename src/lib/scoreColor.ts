// Shared score-to-color mapping so a low score never reads as "good" just
// because of which column/badge it happens to sit in. Same three-tier scale
// used across interview and assessment score displays.
export function scoreColorHex(score: number): string {
  if (score >= 70) return '#10b981';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

export function scoreBadgeClass(score: number): string {
  if (score >= 70) return 'badge-success';
  if (score >= 40) return 'badge-warning';
  return 'badge-error';
}
