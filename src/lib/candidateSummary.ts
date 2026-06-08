// Synthesizes a candidate's resume read together with every completed
// interview's AI analysis into a single, dynamically-recomputed verdict —
// "where do they stand right now, and why." Mirrors interviewAnalysis.ts's
// philosophy: every claim traces back to a real score, a real decision, or a
// real strength/concern that was actually recorded — nothing fabricated, and
// the read changes as new rounds complete rather than freezing at the resume.

import { findStage, isHiredStage, type PipelineStage } from './pipeline';
import { getRecommendation } from './resumeAnalysis';

export type CandidateVerdict = 'advance' | 'hold' | 'rejected' | 'early' | 'hired';

export interface CandidateSummaryInterview {
  round: string;
  date: string;
  status: string;
  commScore?: number;
  techScore?: number;
  confidenceScore?: number;
  recommendation?: string;
  analysis: {
    decision: 'advance' | 'hold';
    strengths: string[];
    concerns: string[];
    reasoning: string;
  } | null;
}

export interface RoundBreakdownEntry {
  round: string;
  date: string;
  decision: 'advance' | 'hold';
  recommendation: string;
  overallScore: number;
  commScore: number;
  techScore: number;
  confidenceScore: number;
  // How this round's overall score compares to the one before it — lets the
  // panel show whether the candidate is trending up, down, or holding steady
  // across rounds rather than just listing numbers in isolation.
  trend: 'up' | 'down' | 'flat' | 'first';
  trendDelta: number;
}

export interface LatestStageNote {
  stageLabel: string;
  note: string;
  movedBy: string;
  movedAt: Date | string;
}

export interface CandidateSummaryInput {
  name: string;
  score: number;
  skillsMatch: number;
  educationMatch: number;
  experience: number;
  recommendation: string;
  currentStage: string;
  rejected: boolean;
  rejectedAt: Date | string | null;
  rejectedBy: string;
  pipeline: PipelineStage[];
  // Ascending by date — oldest first, so "latest" is simply the last entry.
  interviews: CandidateSummaryInterview[];
  // Resume-vs-JD grounding — every "why" the panel states about fit traces
  // back to one of these real, recorded lists rather than a vibe.
  matchedSkills: string[];
  practicalSkills: string[];
  achievements: string[];
  jobRequiredSkills: string[];
  jobNiceToHaveSkills: string[];
  jobLevel: string;
  // The most recent human-written remark from a stage move (auto-advance notes
  // excluded) — folding live recruiter input into the read is what makes it
  // "dynamic per stage" rather than frozen at the resume.
  latestStageNote: LatestStageNote | null;
}

export interface CandidateSummary {
  verdict: CandidateVerdict;
  verdictLabel: string;
  headline: string;
  narrative: string;
  forwardSignals: string[];
  concernSignals: string[];
  // The headline "AI Score"/"AI Recommendation" the candidate page banner
  // shows — a live blend of the resume read and every analyzed interview
  // round so far, NOT a frozen resume-upload-time snapshot. Once interview
  // signal exists it dominates (interviews are a far more direct read of the
  // person than a resume is), but the resume baseline still anchors it so a
  // single noisy round can't swing the headline wildly. Resume score alone
  // when no analyzed interview exists yet — same number it always was then.
  overallScore: number;
  overallLabel: string;
  roundsConsidered: number;
  // Oldest-to-newest, mirroring the order rounds actually happened in — the
  // panel renders this as a per-round score trend so "updated after each
  // stage" is visible, not just asserted in prose.
  roundBreakdown: RoundBreakdownEntry[];
}

export interface OverallScoreInterview {
  status: string;
  analysis: unknown;
  commScore?: number | null;
  techScore?: number | null;
  confidenceScore?: number | null;
}

// The one place that turns "resume score + interview rounds" into the live
// headline number shown across the platform (candidate detail banner, the
// candidates list, anywhere else that needs "where do they stand right now").
// Resume-only until an analyzed interview exists — at that point interviews
// dominate (they're a far more direct read of the person than a resume is),
// blended with the resume baseline so one noisy round can't swing it wildly.
export function blendOverallScore(resumeScore: number, interviews: OverallScoreInterview[]): { overallScore: number; overallLabel: string; roundsConsidered: number } {
  const analyzed = interviews.filter(iv => iv.status === 'completed' && iv.analysis);
  if (!analyzed.length) {
    return { overallScore: resumeScore, overallLabel: getRecommendation(resumeScore), roundsConsidered: 0 };
  }
  const avgInterview = analyzed.reduce((sum, iv) => {
    const comm = iv.commScore ?? 0;
    const tech = iv.techScore ?? 0;
    const conf = iv.confidenceScore ?? 0;
    return sum + (comm + tech + conf) / 3;
  }, 0) / analyzed.length;
  const overallScore = Math.round(resumeScore * 0.3 + avgInterview * 0.7);
  return { overallScore, overallLabel: getRecommendation(overallScore), roundsConsidered: analyzed.length };
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function firstSentences(text: string, count: number): string {
  return text.split(/(?<=[.!?])\s+/).slice(0, count).join(' ');
}

export interface JdAlignment {
  matchedRequired: string[];
  missingRequired: string[];
  matchedNice: string[];
  practical: string[];
  listedOnly: string[];
}

// The single place that turns "resume vs. JD" into a concrete, checkable
// breakdown — every list here is something a reviewer could re-derive by
// reading the resume and the job post side by side. Nothing here is inferred
// beyond what `resumeAnalysis.ts` already extracted from real text.
function buildJdAlignment(input: CandidateSummaryInput): JdAlignment {
  const matchedLower = new Set(input.matchedSkills.map(s => s.toLowerCase()));
  const practicalLower = new Set(input.practicalSkills.map(s => s.toLowerCase()));
  const matchedRequired = input.jobRequiredSkills.filter(s => matchedLower.has(s.toLowerCase()));
  const missingRequired = input.jobRequiredSkills.filter(s => !matchedLower.has(s.toLowerCase()));
  const matchedNice = input.jobNiceToHaveSkills.filter(s => matchedLower.has(s.toLowerCase()));
  const practical = input.matchedSkills.filter(s => practicalLower.has(s.toLowerCase()));
  const listedOnly = input.matchedSkills.filter(s => !practicalLower.has(s.toLowerCase()));
  return { matchedRequired, missingRequired, matchedNice, practical, listedOnly };
}

function listOf(items: string[], max = 4): string {
  if (items.length <= max) return items.join(', ');
  return `${items.slice(0, max).join(', ')}, +${items.length - max} more`;
}

// Renders the JD-fit picture as plain, grounded sentences — skills against
// what the role actually asks for, which of those are demonstrated vs. merely
// named, the experience read against the role's band, and any standout extras
// found on the page. This is the "skill / exp / against JD / practical work /
// extra achievements" breakdown the assessment is expected to carry.
function jdFitSentences(input: CandidateSummaryInput, jd: JdAlignment): string[] {
  const out: string[] = [];
  if (input.jobRequiredSkills.length) {
    out.push(
      jd.missingRequired.length
        ? `Against the role's required skills: ${jd.matchedRequired.length}/${input.jobRequiredSkills.length} show up on the resume (${listOf(jd.matchedRequired)}); ${jd.missingRequired.length} ${jd.missingRequired.length === 1 ? 'is' : 'are'} not evident anywhere on it (${listOf(jd.missingRequired)}).`
        : `Covers all ${input.jobRequiredSkills.length} of the role's required skills on paper (${listOf(jd.matchedRequired)}).`
    );
  }
  if (jd.practical.length || jd.listedOnly.length) {
    if (jd.practical.length && jd.listedOnly.length) {
      out.push(`Of the skills found, ${listOf(jd.practical)} show real hands-on evidence — built into a project, role, or "tech stack" line, not just named — while ${listOf(jd.listedOnly)} ${jd.listedOnly.length === 1 ? 'appears' : 'appear'} only as a listed name with nothing on the page to back it up yet.`);
    } else if (jd.practical.length) {
      out.push(`Encouragingly, every matched skill (${listOf(jd.practical)}) shows real hands-on evidence on the page — built into a project or role, not just named in a list.`);
    } else if (jd.listedOnly.length) {
      out.push(`${listOf(jd.listedOnly)} ${jd.listedOnly.length === 1 ? 'appears' : 'appear'} on the resume only as named skills — no project or work-history line backs up hands-on use, so that's worth probing directly rather than assuming.`);
    }
  }
  const levelNote = input.jobLevel ? ` — the role's stated band is ${input.jobLevel}` : '';
  out.push(`Resume reads as ${input.experience} year${input.experience === 1 ? '' : 's'} of actual employment history${levelNote}.`);
  if (input.achievements.length) {
    out.push(`Beyond the core ask, the resume also surfaces: ${input.achievements.slice(0, 3).join('; ')}.`);
  }
  return out;
}

function resumeForwardSignals(input: CandidateSummaryInput, jd: JdAlignment): string[] {
  const out: string[] = [];
  if (jd.practical.length >= 2) out.push(`Demonstrated hands-on use — not just naming — of ${listOf(jd.practical)}, evidenced directly in the resume's project/work text`);
  if (input.skillsMatch >= 75) out.push(`Resume shows strong skill alignment with the role (${input.skillsMatch}% match, weighted by demonstrated use)`);
  if (input.educationMatch >= 75) out.push(`Education background matches what the role asks for (${input.educationMatch}% match)`);
  if (input.experience >= 3) out.push(`Brings ${input.experience} year${input.experience === 1 ? '' : 's'} of actual employment history`);
  if (input.score >= 85) out.push(`Resume score of ${input.score}/100 places them well above the bar for this role`);
  if (input.achievements.length) out.push(`Stands out beyond the baseline ask: ${input.achievements.slice(0, 2).join('; ')}`);
  return out;
}

function buildRoundBreakdown(completed: CandidateSummaryInterview[]): RoundBreakdownEntry[] {
  let prevOverall: number | null = null;
  return completed.map(iv => {
    const comm = iv.commScore ?? 0;
    const tech = iv.techScore ?? 0;
    const conf = iv.confidenceScore ?? 0;
    const overall = Math.round((comm + tech + conf) / 3);
    let trend: RoundBreakdownEntry['trend'] = 'first';
    let trendDelta = 0;
    if (prevOverall !== null) {
      trendDelta = overall - prevOverall;
      trend = trendDelta > 0 ? 'up' : trendDelta < 0 ? 'down' : 'flat';
    }
    prevOverall = overall;
    return {
      round: iv.round,
      date: iv.date,
      decision: iv.analysis!.decision,
      recommendation: iv.recommendation || '',
      overallScore: overall,
      commScore: comm,
      techScore: tech,
      confidenceScore: conf,
      trend,
      trendDelta,
    };
  });
}

function resumeConcernSignals(input: CandidateSummaryInput, jd: JdAlignment): string[] {
  const out: string[] = [];
  if (jd.missingRequired.length) out.push(`No evidence anywhere on the resume of ${listOf(jd.missingRequired)} — required by this role`);
  if (jd.listedOnly.length >= 2) out.push(`${listOf(jd.listedOnly)} are named on the resume but show no project or work-history line demonstrating real hands-on use`);
  if (input.skillsMatch < 60) out.push(`Resume shows limited overlap with the role's required skills (${input.skillsMatch}% match, weighted by demonstrated use)`);
  if (input.educationMatch < 50) out.push(`Education background is a weaker match for the role's stated requirement (${input.educationMatch}% match)`);
  if (input.experience < 1) out.push(`Resume reads as having no real employment history yet — likely an early-career or bootcamp profile rather than a gap in an established career`);
  if (input.score < 65) out.push(`Resume score of ${input.score}/100 is on the low side for this role`);
  return out;
}

export function buildCandidateSummary(input: CandidateSummaryInput): CandidateSummary {
  const stage = findStage(input.pipeline, input.currentStage);
  const stageLabel = stage?.label || input.currentStage;

  const completedAll = input.interviews.filter(iv => iv.status === 'completed');
  const completed = completedAll.filter(iv => iv.analysis);
  const unanalyzedCount = completedAll.length - completed.length;
  const latest = completed.length ? completed[completed.length - 1] : null;
  const advanceCount = completed.filter(iv => iv.analysis!.decision === 'advance').length;
  const holdCount = completed.length - advanceCount;

  // Most recent rounds carry the freshest read — surface their strengths/
  // concerns first when deduping across multiple interviews.
  const interviewStrengths = dedupe(completed.slice().reverse().flatMap(iv => iv.analysis!.strengths));
  const interviewConcerns = dedupe(completed.slice().reverse().flatMap(iv => iv.analysis!.concerns));
  const jd = buildJdAlignment(input);
  const forwardSignals = dedupe([...interviewStrengths, ...resumeForwardSignals(input, jd)]).slice(0, 6);
  const concernSignals = dedupe([...interviewConcerns, ...resumeConcernSignals(input, jd)]).slice(0, 6);
  const roundBreakdown = buildRoundBreakdown(completed);
  const { overallScore, overallLabel } = blendOverallScore(input.score, input.interviews);
  const fitSentences = jdFitSentences(input, jd);
  const stageNoteSentence = input.latestStageNote
    ? `Most recent stage note from "${input.latestStageNote.stageLabel}" (${input.latestStageNote.movedBy || 'recruiter'}, ${new Date(input.latestStageNote.movedAt).toLocaleDateString()}): "${firstSentences(input.latestStageNote.note, 1)}"`
    : '';

  // --- Rejected: terminal outcome, nothing here is a path forward ---
  if (input.rejected) {
    const rejDate = input.rejectedAt ? new Date(input.rejectedAt) : null;
    const rejNote = rejDate && !isNaN(rejDate.getTime()) ? ` on ${rejDate.toLocaleDateString()}` : '';
    const sentences = [
      `${input.name} was rejected${rejNote}${input.rejectedBy ? ` by ${input.rejectedBy}` : ''} while at the "${stageLabel}" stage.`,
    ];
    if (latest) {
      sentences.push(
        `The last completed round ("${latest.round}" on ${latest.date}) ${latest.analysis!.decision === 'advance'
          ? 'had actually leaned toward advancing them, but the rejection decision overrides that read'
          : 'leaned toward holding, consistent with the call to end the process'}: ${firstSentences(latest.analysis!.reasoning, 1)}`
      );
    } else if (concernSignals.length) {
      sentences.push(`The original resume read had already flagged: ${concernSignals.slice(0, 2).join('; ')}.`);
    }
    if (stageNoteSentence) sentences.push(stageNoteSentence + '.');
    sentences.push(`This is a terminal outcome — ${input.name} cannot move to any further stage, and nothing below should be read as a case for moving forward.`);
    return {
      verdict: 'rejected',
      verdictLabel: 'Rejected — process ended',
      headline: `${input.name}'s process ended at "${stageLabel}" — no further movement is possible.`,
      narrative: sentences.join(' '),
      forwardSignals: [],
      concernSignals,
      overallScore,
      overallLabel,
      roundsConsidered: completed.length,
      roundBreakdown,
    };
  }

  // --- Hired: the other terminal outcome — the process succeeded and is over.
  // Without this branch the generic "interviews on the books" narrative below
  // would keep telling the reader to "schedule the next round" or "move them
  // to the next stage" for someone who has already been hired into the role —
  // a stale, self-contradicting read that falls out of sync the moment the
  // stage actually changes. This keeps the page's story matching the journey. ---
  if (isHiredStage(input.pipeline, input.currentStage)) {
    const hireNote = input.latestStageNote && input.latestStageNote.stageLabel === stageLabel
      ? ` ${firstSentences(input.latestStageNote.note, 1)}`
      : '';
    const sentences = [
      `${input.name} was hired for this role — their process reached "${stageLabel}", the final stage in this job's pipeline.${hireNote}`,
    ];
    if (latest) {
      sentences.push(
        `Their last completed round ("${latest.round}" on ${latest.date}) ${latest.analysis!.decision === 'advance' ? 'had leaned toward advancing them, consistent with the call to bring them on' : 'had actually leaned toward holding, though the final hiring call overrode that read'}: ${firstSentences(latest.analysis!.reasoning, 1)}`
      );
    }
    if (stageNoteSentence && !hireNote) sentences.push(stageNoteSentence + '.');
    sentences.push(`This is a terminal outcome — ${input.name} cannot move to any further stage, and nothing below should be read as an open question still being decided.`);
    return {
      verdict: 'hired',
      verdictLabel: 'Hired — process complete',
      headline: `${input.name} was hired — their process is complete and no further action is needed here.`,
      narrative: sentences.join(' '),
      forwardSignals,
      concernSignals: [],
      overallScore,
      overallLabel,
      roundsConsidered: completed.length,
      roundBreakdown,
    };
  }

  // --- No completed interviews yet: the read leans entirely on the resume ---
  if (!completed.length) {
    const verdict: CandidateVerdict = input.score >= 80 ? 'advance' : input.score >= 60 ? 'early' : 'hold';
    const verdictLabel =
      verdict === 'advance' ? 'Strong resume signal — proceed with interviews'
      : verdict === 'hold' ? 'Weak resume signal — interview with caution'
      : 'Building signal — resume alone is not yet decisive';
    const closing =
      verdict === 'advance'
        ? `That's a strong enough baseline to justify the interviews already in motion — the sessions ahead are about confirming this read, not rescuing a weak one.`
        : verdict === 'hold'
          ? `That's a thinner baseline than the role calls for — interviews should specifically probe the gaps below before any decision to push ${input.name} further.`
          : `That's a moderate baseline — genuinely undecided until the interviews add real signal on top of it.`;
    const openLine = unanalyzedCount > 0
      ? `${input.name} is currently at the "${stageLabel}" stage. ${unanalyzedCount} interview${unanalyzedCount === 1 ? ' is' : 's are'} marked completed but ${unanalyzedCount === 1 ? "hasn't" : "haven't"} been analyzed yet — likely completed before detailed feedback was captured — so this read still leans entirely on the resume. Add their feedback (see the interview page) to fold real interview signal into this assessment.`
      : `${input.name} is currently at the "${stageLabel}" stage with no completed interviews yet, so this read leans entirely on the resume.`;
    const sentences = [
      openLine,
      `Resume score sits at ${input.score}/100 (${(input.recommendation || 'unscored').toLowerCase()}), with ${input.skillsMatch}% skills match and ${input.educationMatch}% education match against the role.`,
      ...fitSentences,
    ];
    if (stageNoteSentence) sentences.push(stageNoteSentence + '.');
    sentences.push(closing);
    return {
      verdict,
      verdictLabel,
      headline: closing,
      narrative: sentences.join(' '),
      forwardSignals,
      concernSignals,
      overallScore,
      overallLabel,
      roundsConsidered: 0,
      roundBreakdown,
    };
  }

  // --- Interviews on the books: the latest completed round's read dominates,
  // earlier rounds add historical context rather than overriding it — the
  // most recent, most-informed assessment of where the candidate stands today
  // should carry the call. ---
  const verdict: CandidateVerdict = latest!.analysis!.decision;
  const sentences = [
    `${input.name} is currently at the "${stageLabel}" stage, ${completed.length} interview${completed.length === 1 ? '' : 's'} in.`,
    `The most recent completed round — "${latest!.round}" on ${latest!.date} — ${verdict === 'advance' ? 'leaned toward moving them forward' : 'leaned toward holding here'}: ${firstSentences(latest!.analysis!.reasoning, 2)}`,
  ];
  if (completed.length > 1) {
    const trendMatches = (advanceCount > holdCount) === (verdict === 'advance');
    sentences.push(
      advanceCount === holdCount
        ? `Across all rounds so far the signal has been evenly split (${advanceCount} of ${completed.length} leaned toward advancing) — the latest read is what's tipping the call.`
        : `Across all rounds so far, ${advanceCount} of ${completed.length} leaned toward advancing, which is ${trendMatches ? 'consistent with' : 'in some tension with'} where the latest round landed — worth weighing if the picture feels mixed.`
    );
    // Score trajectory across rounds — the clearest "is this getting better or
    // worse" read, since it's a straight line of real numbers rather than prose.
    const scoreLine = roundBreakdown.map(r => r.overallScore).join(' → ');
    const first = roundBreakdown[0].overallScore;
    const last = roundBreakdown[roundBreakdown.length - 1].overallScore;
    const direction = last > first ? 'trending upward' : last < first ? 'trending downward' : 'holding steady';
    sentences.push(`Their blended interview score has moved ${scoreLine} round over round — ${direction} (latest: Comm ${latest!.commScore ?? 0} · Tech ${latest!.techScore ?? 0} · Confidence ${latest!.confidenceScore ?? 0}).`);
  } else {
    sentences.push(`That round scored Comm ${latest!.commScore ?? 0} · Tech ${latest!.techScore ?? 0} · Confidence ${latest!.confidenceScore ?? 0} (blended ${roundBreakdown[0].overallScore}/100) — the baseline this read will be measured against as further rounds complete.`);
  }
  if (unanalyzedCount > 0) {
    sentences.push(`Separately, ${unanalyzedCount} more completed interview${unanalyzedCount === 1 ? '' : 's'} on file ${unanalyzedCount === 1 ? "hasn't" : "haven't"} been analyzed yet (no feedback was captured for ${unanalyzedCount === 1 ? 'it' : 'them'}) — backfilling that feedback would sharpen this read further.`);
  }
  // Ties the headline "AI Score" badge directly back to the math behind it —
  // the number at the top of the page is this blend, not the frozen resume
  // score, and this sentence is what makes that traceable rather than magic.
  sentences.push(`Folding that interview signal in with the original resume read of ${input.score}/100, ${input.name}'s overall score now stands at ${overallScore}/100 (${overallLabel}) — the number shown at the top of this page, recomputed as each round completes rather than frozen at upload.`);
  sentences.push(...fitSentences);
  if (stageNoteSentence) sentences.push(stageNoteSentence + '.');
  sentences.push(
    verdict === 'advance'
      ? `Net read: the case for moving ${input.name} forward currently outweighs the concerns — schedule the next round when ready, or move them to the next stage.`
      : `Net read: the concerns currently outweigh the case for advancing — either gather more signal with another round, or treat this as grounds to close out the process rather than letting them drift forward by default.`
  );

  return {
    verdict,
    verdictLabel: verdict === 'advance' ? 'Leaning toward advancing' : 'Leaning toward holding',
    headline: sentences[sentences.length - 1],
    narrative: sentences.join(' '),
    forwardSignals,
    concernSignals,
    overallScore,
    overallLabel,
    roundsConsidered: completed.length,
    roundBreakdown,
  };
}
