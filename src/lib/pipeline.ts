// Shared helpers for per-job configurable hiring pipelines. Stages are stored as an
// ordered array on each Job document — nothing about stage names, counts, or order is
// hardcoded anywhere else in the app.

export interface PipelineStage {
  key: string;
  label: string;
  color: string;
  icon: string;
  order: number;
}

export const STAGE_COLORS = [
  '#6b7280', '#3b82f6', '#8b5cf6', '#f59e0b',
  '#10b981', '#ec4899', '#06b6d4', '#ef4444',
];

// Small curated icon set rendered via set:html — each is a 14x14 inline SVG path.
export const STAGE_ICONS: Record<string, string> = {
  circle:    '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.5"/></svg>',
  star:      '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6L1.5 5.3l3.6-.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  check:     '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.5"/><path d="M4.3 6.6l1.6 1.6 2.8-3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  flag:      '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M3 1.5v10M3 2h6.5l-1.5 2 1.5 2H3" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  calendar:  '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="2.5" width="10" height="9" rx="1.3" stroke="currentColor" stroke-width="1.4"/><path d="M1.5 5.5h10M4 1.2v2.6M9 1.2v2.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  briefcase: '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="4" width="10" height="7.2" rx="1.3" stroke="currentColor" stroke-width="1.4"/><path d="M4.3 4V3a1.7 1.7 0 0 1 1.7-1.7h1a1.7 1.7 0 0 1 1.7 1.7v1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  user:      '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="4.3" r="2.3" stroke="currentColor" stroke-width="1.4"/><path d="M2 11.5c0-2.5 2-3.7 4.5-3.7s4.5 1.2 4.5 3.7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  award:     '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="4.7" r="3.2" stroke="currentColor" stroke-width="1.4"/><path d="M4.6 7.4L3.8 11.5l2.7-1.3 2.7 1.3-.8-4.1" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
};

export const STAGE_ICON_KEYS = Object.keys(STAGE_ICONS);

export function getIconSvg(icon: string): string {
  return STAGE_ICONS[icon] || STAGE_ICONS.circle;
}

const DEFAULT_STAGE_LABELS = ['Applied', 'Screening', 'Shortlisted', 'Interview', 'Offer', 'Hired'];
const DEFAULT_STAGE_ICONS = ['user', 'check', 'star', 'calendar', 'flag', 'award'];

export function slugifyStageKey(label: string, taken: Set<string> = new Set()): string {
  let base = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!base) base = 'stage';
  let key = base;
  let i = 2;
  while (taken.has(key)) {
    key = `${base}-${i++}`;
  }
  taken.add(key);
  return key;
}

export function buildDefaultPipeline(): PipelineStage[] {
  const taken = new Set<string>();
  return DEFAULT_STAGE_LABELS.map((label, i) => ({
    key: slugifyStageKey(label, taken),
    label,
    color: STAGE_COLORS[i % STAGE_COLORS.length],
    icon: DEFAULT_STAGE_ICONS[i % DEFAULT_STAGE_ICONS.length],
    order: i,
  }));
}

export function sortedPipeline(pipeline: PipelineStage[] = []): PipelineStage[] {
  return [...(pipeline || [])].sort((a, b) => a.order - b.order);
}

export function findStage(pipeline: PipelineStage[] = [], key: string): PipelineStage | undefined {
  return pipeline.find(s => s.key === key);
}

// "Cannot move backward — only current stage and forward stages selectable."
export function getValidNextStages(pipeline: PipelineStage[] = [], currentStageKey: string): PipelineStage[] {
  const current = findStage(pipeline, currentStageKey);
  const currentOrder = current ? current.order : -1;
  return sortedPipeline(pipeline).filter(s => s.order >= currentOrder);
}

export function isValidStageTransition(pipeline: PipelineStage[] = [], fromKey: string, toKey: string): boolean {
  const from = findStage(pipeline, fromKey);
  const to = findStage(pipeline, toKey);
  if (!to) return false;
  if (!from) return true;
  return to.order >= from.order;
}

export function isHiredStage(pipeline: PipelineStage[] = [], stageKey: string): boolean {
  const sorted = sortedPipeline(pipeline);
  if (!sorted.length) return false;
  return sorted[sorted.length - 1].key === stageKey;
}

export function isFirstStage(pipeline: PipelineStage[] = [], stageKey: string): boolean {
  const sorted = sortedPipeline(pipeline);
  if (!sorted.length) return false;
  return sorted[0].key === stageKey;
}

export type FunnelBucket = 'Applied' | 'In Progress' | 'Hired' | 'Rejected';

// Cross-job-safe normalization: different jobs can have wildly different pipelines
// (different stage names, different lengths), so dashboard/analytics-wide funnels
// can't key off a specific stage name. Bucketing by relative position in each
// candidate's own pipeline gives a real, derived, comparable funnel.
export function bucketForCandidate(
  candidate: { currentStage: string; rejected?: boolean },
  pipeline: PipelineStage[] = []
): FunnelBucket {
  if (candidate.rejected) return 'Rejected';
  const sorted = sortedPipeline(pipeline);
  if (!sorted.length) return 'Applied';
  const stage = findStage(sorted, candidate.currentStage);
  if (!stage) return 'Applied';
  if (stage.order === sorted[0].order) return 'Applied';
  if (stage.order === sorted[sorted.length - 1].order) return 'Hired';
  return 'In Progress';
}
