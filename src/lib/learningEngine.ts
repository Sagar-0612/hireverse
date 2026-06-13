// The platform-wide "adaptive intelligence" layer described in
// ai-architecture-recommendation.txt section 10. Two independent, additive
// mechanisms, both deterministic and fully auditable (no black-box ML):
//
//  1. SKILL ALIAS LEARNING — when a recruiter points at resume text as real
//     evidence of a required skill the static skillRelations lexicon missed,
//     that correction is recorded. Once the SAME (skill, phrase) pair has
//     been confirmed by LEARNED_ALIAS_THRESHOLD independent corrections, it
//     is "promoted" and applied to every future resume (any job, any
//     candidate) that requires that skill — see resumeAnalysis.ts's
//     `learnedAliases` parameter.
//
//  2. OUTCOME CALIBRATION — every stage advance, rejection, and hire is
//     logged with the candidate's resume score at that moment. Aggregated by
//     job and score band, this surfaces whether the scoring rubric actually
//     correlates with real outcomes for that role — a read-only insight for
//     recruiters, never an automatic score adjustment (preserves fairness/
//     auditability: every candidate is still scored by the same explicit
//     rules at the moment of analysis).
//
// Both mechanisms only ever ADD information on top of the existing
// deterministic scoring — nothing here can make a score worse, and a
// platform with zero signals yet (a fresh install) behaves identically to
// before this layer existed.

import { LearningSignal } from '../db/models/LearningSignal.ts';
import { SkillIntelligence } from '../db/models/SkillIntelligence.ts';
import { appearsInText, findRelatedEvidence, findLearnedEvidence, type LearnedAlias } from './skillRelations.ts';
import { RELATED_SKILL_SCORE } from './resumeAnalysis.ts';

// Same normalization as skillRelations.ts's normSkill — keeps "Node.js" /
// "NodeJS" / "node js" all resolving to the same SkillIntelligence document.
const normSkill = (s: string) => s.toLowerCase().replace(/\./g, '').trim();
const normPhrase = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');

// How many independent recruiter corrections (across any candidate/job) must
// agree that "phrase X is evidence of skill Y" before that alias is trusted
// for ALL future resumes. >1 so a single mis-click can't immediately bias
// scoring platform-wide, while still being a small enough bar that the
// "every correction makes the platform smarter" story is felt quickly.
export const LEARNED_ALIAS_THRESHOLD = 2;

export interface SkillCorrectionInput {
  jobId: string;
  candidateId: string;
  skill: string;
  evidencePhrase: string;
  fromStatus: string;
  toStatus: string;
  actor?: string;
}

// Records a recruiter's correction and updates the running tally for that
// (skill, phrase) pair. Returns the resulting alias entry, including whether
// this correction just caused it to be promoted (useful for UI messaging:
// "thanks — after 1 more confirmation like this, the platform will recognize
// this for every future resume").
export async function recordSkillCorrection(input: SkillCorrectionInput): Promise<{ occurrences: number; promoted: boolean; justPromoted: boolean }> {
  const skill = normSkill(input.skill);
  const phrase = normPhrase(input.evidencePhrase);

  await LearningSignal.create({
    type: 'skill-alias-correction',
    jobId: input.jobId,
    candidateId: input.candidateId,
    skill,
    evidencePhrase: phrase,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    actor: input.actor || 'Maya Kim',
  });

  let doc = await SkillIntelligence.findOne({ skill });
  if (!doc) {
    doc = await SkillIntelligence.create({ skill, aliases: [] });
  }

  const existing = doc.aliases.find(a => normPhrase(a.term) === phrase);
  const wasPromoted = existing?.promoted ?? false;
  if (existing) {
    existing.occurrences += 1;
    existing.lastSeenAt = new Date();
    existing.promoted = existing.occurrences >= LEARNED_ALIAS_THRESHOLD;
  } else {
    doc.aliases.push({
      term: phrase,
      occurrences: 1,
      promoted: 1 >= LEARNED_ALIAS_THRESHOLD,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    } as any);
  }
  await doc.save();

  const updated = doc.aliases.find(a => normPhrase(a.term) === phrase)!;
  return {
    occurrences: updated.occurrences,
    promoted: updated.promoted,
    justPromoted: updated.promoted && !wasPromoted,
  };
}

// Loads every PROMOTED skill alias, keyed by normalized skill — the exact
// shape resumeAnalysis.ts's `findLearnedEvidence` expects. Cheap (one
// collection scan, small collection) and safe to call on every resume
// analysis; returns {} on a fresh install with no SkillIntelligence
// documents yet, which makes findLearnedEvidence a no-op — i.e. identical
// behavior to before this layer existed.
export async function getLearnedAliases(): Promise<Record<string, LearnedAlias[]>> {
  const docs = await SkillIntelligence.find({ 'aliases.promoted': true }).lean();
  const result: Record<string, LearnedAlias[]> = {};
  for (const doc of docs) {
    const promoted = (doc.aliases || []).filter((a: any) => a.promoted);
    if (promoted.length) {
      result[doc.skill] = promoted.map((a: any) => ({ term: a.term, occurrences: a.occurrences }));
    }
  }
  return result;
}

export interface SkillGapLike {
  skill: string;
  status: string;
  relatedSkill?: string;
  score: number;
  required: boolean;
  learnedOccurrences?: number;
}

export interface AutoSkillEvidence {
  skill: string;
  evidencePhrase: string;
  source: 'direct' | 'related' | 'learned';
}

// The AUTOMATIC counterpart to the recruiter-driven "Found evidence?" form in
// skill-correction.ts. Every time an interview is analyzed, the interviewer's
// own feedback/transcript text is scanned for evidence of any skill this
// candidate's resume marked "missing" — the same kind of real, first-hand
// signal a recruiter would otherwise have to notice and submit by hand.
// Three tiers, checked in order of strength:
//  - 'direct'  — the missing skill itself is named in the feedback (the
//                interviewer directly observed it).
//  - 'related' — a statically-known adjacent skill (SKILL_RELATIONS) is named.
//  - 'learned' — a previously-promoted alias (from recruiter corrections on
//                OTHER candidates) is named.
// Any match upgrades the gap the same way a manual correction would
// ('missing' -> 'related', score -> RELATED_SKILL_SCORE) — never a decrease.
// This makes the "gets smarter automatically" loop work even if no human
// ever opens the skill-correction form.
export function scanFeedbackForSkillEvidence(
  skillGaps: SkillGapLike[],
  feedbackText: string,
  learnedAliases: Record<string, LearnedAlias[]>
): { updatedGaps: SkillGapLike[]; applied: AutoSkillEvidence[] } {
  const lowerText = feedbackText.toLowerCase();
  const applied: AutoSkillEvidence[] = [];
  const updatedGaps = skillGaps.map(gap => {
    if (gap.status !== 'missing' || !lowerText.trim()) return gap;

    let evidencePhrase: string | null = null;
    let source: AutoSkillEvidence['source'] = 'direct';
    if (appearsInText(lowerText, gap.skill)) {
      evidencePhrase = gap.skill;
      source = 'direct';
    } else {
      const related = findRelatedEvidence(lowerText, gap.skill);
      if (related) {
        evidencePhrase = related;
        source = 'related';
      } else {
        const learned = findLearnedEvidence(lowerText, gap.skill, learnedAliases);
        if (learned) {
          evidencePhrase = learned.term;
          source = 'learned';
        }
      }
    }

    if (!evidencePhrase) return gap;
    applied.push({ skill: gap.skill, evidencePhrase, source });
    return { ...gap, status: 'related', relatedSkill: evidencePhrase, score: RELATED_SKILL_SCORE };
  });

  return { updatedGaps, applied };
}

export interface OutcomeSignalInput {
  jobId: string;
  candidateId: string;
  score: number;
  fromStageKey?: string;
  toStageKey?: string;
  outcome: 'advanced' | 'rejected' | 'hired';
}

// Append-only — never mutates a candidate's own record. Pure signal capture
// for the calibration insights below.
export async function recordOutcomeSignal(input: OutcomeSignalInput): Promise<void> {
  await LearningSignal.create({
    type: 'stage-outcome',
    jobId: input.jobId,
    candidateId: input.candidateId,
    score: input.score,
    fromStageKey: input.fromStageKey || '',
    toStageKey: input.toStageKey || '',
    outcome: input.outcome,
  });
}

// Score bands used for the calibration insight — fixed, deterministic
// buckets so results are stable and easy to reason about. Matches the
// "Not Recommended / Consider / Recommend / Strongly Recommend" thresholds
// in resumeAnalysis.ts's getRecommendation.
export const SCORE_BANDS = [
  { label: '0-64 (Not Recommended)', min: 0, max: 64 },
  { label: '65-74 (Consider)', min: 65, max: 74 },
  { label: '75-87 (Recommend)', min: 75, max: 87 },
  { label: '88-100 (Strongly Recommend)', min: 88, max: 100 },
];

export interface CalibrationBand {
  label: string;
  total: number;
  advanced: number;
  rejected: number;
  hired: number;
  advanceRate: number; // (advanced + hired) / total, 0-100
}

export interface CalibrationInsight {
  jobId: string;
  jobTitle: string;
  bands: CalibrationBand[];
  totalSignals: number;
}

// Aggregates recorded stage-outcome signals into score-band vs outcome
// counts, per job. Purely descriptive — recruiters decide whether a band
// with a low advance-rate means the score threshold for that job should be
// revisited; nothing here writes back to scoring automatically.
export function summarizeOutcomeSignals(signals: { jobId: string; score?: number; outcome?: string }[], jobTitles: Record<string, string>): CalibrationInsight[] {
  const byJob = new Map<string, { jobId: string; score?: number; outcome?: string }[]>();
  for (const s of signals) {
    if (typeof s.score !== 'number' || !s.outcome) continue;
    const list = byJob.get(s.jobId) || [];
    list.push(s);
    byJob.set(s.jobId, list);
  }

  const insights: CalibrationInsight[] = [];
  for (const [jobId, list] of byJob) {
    const bands: CalibrationBand[] = SCORE_BANDS.map(band => {
      const inBand = list.filter(s => (s.score as number) >= band.min && (s.score as number) <= band.max);
      const advanced = inBand.filter(s => s.outcome === 'advanced').length;
      const rejected = inBand.filter(s => s.outcome === 'rejected').length;
      const hired = inBand.filter(s => s.outcome === 'hired').length;
      const total = inBand.length;
      return {
        label: band.label,
        total,
        advanced,
        rejected,
        hired,
        advanceRate: total > 0 ? Math.round(((advanced + hired) / total) * 100) : 0,
      };
    });
    insights.push({ jobId, jobTitle: jobTitles[jobId] || 'Unknown job', bands, totalSignals: list.length });
  }
  return insights.sort((a, b) => b.totalSignals - a.totalSignals);
}
