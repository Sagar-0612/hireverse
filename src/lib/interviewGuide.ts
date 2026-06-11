// Builds a per-candidate, per-round interview guide. Every line traces back
// to data already on file — resume skill gaps, education/experience match,
// the job's stated responsibilities, and concerns raised in prior
// interview/assessment rounds — so round 2's guide picks up exactly where
// round 1 left off instead of repeating a generic checklist.

import type { SkillGap } from './resumeAnalysis';
import { parseLevelRange, inferLevelYears, buildSkillRegex } from './resumeAnalysis';
import { getSkillQuestions, levelFromExperience, type CandidateLevel } from './skillQuestions';

export interface GuideStep {
  title: string;
  detail: string;
  // Concrete, ready-to-ask questions for this focus area — what actually
  // gets said in the room, not just a description of the gap.
  questions?: string[];
}

export interface PriorRoundSummary {
  round: string;
  type: 'interview' | 'assessment';
  concerns: string[];
}

export interface InterviewGuideInput {
  jobLevel: string;
  jobEducation: string;
  skillGaps: SkillGap[];
  educationMatch: number;
  experience: number;
  priorRounds: PriorRoundSummary[];
  // Free-text, newline-separated responsibilities from the job posting. Used
  // to ground focus areas in "this is something they'll actually do here",
  // not just a resume-vs-JD skill diff.
  jobResponsibilities?: string;
}

const GAP_SEVERITY: Record<SkillGap['status'], number> = {
  missing: 0,
  related: 1,
  listed: 2,
  practical: 3,
};

// Each gap/skill step surfaces this many topic-specific questions.
const QUESTIONS_PER_TOPIC = 4;
const MAX_SKILL_FOCUS_AREAS = 5;
const MAX_CONCERNS_PER_ROUND = 2;
// Required-skill depth checks are capped so a strong candidate (no required
// gaps) doesn't crowd out the highest-priority nice-to-have gaps entirely.
const REQUIRED_PRACTICAL_CAP = 3;

// If this skill is explicitly mentioned in the job's stated responsibilities,
// say so — ties the question back to "this is something they'll do here",
// not just an abstract resume-vs-JD diff.
function responsibilityNote(skill: string, jobResponsibilities?: string): string {
  if (!jobResponsibilities) return '';
  if (buildSkillRegex(skill).test(jobResponsibilities)) {
    return ` This is also called out directly in this role's responsibilities.`;
  }
  return '';
}

function skillGapStep(gap: SkillGap, level: CandidateLevel, jobResponsibilities?: string): GuideStep {
  const niceToHave = !gap.required;
  const note = responsibilityNote(gap.skill, jobResponsibilities);
  switch (gap.status) {
    case 'missing': {
      // Never been used — probe transferable/foundational understanding
      // rather than assuming hands-on depth they don't have.
      return {
        title: niceToHave
          ? `"${gap.skill}" (nice-to-have) — not found on resume`
          : `"${gap.skill}" — required, not found on resume`,
        detail: (niceToHave
          ? `This is a nice-to-have for the role and doesn't appear anywhere on their resume — not a blocker, but worth a quick check if time allows.`
          : `This is required for the role but doesn't appear anywhere on their resume.`) + note,
        questions: getSkillQuestions(gap.skill, 'junior', QUESTIONS_PER_TOPIC),
      };
    }
    case 'related': {
      return {
        title: niceToHave
          ? `"${gap.skill}" (nice-to-have) — only indirect evidence (via "${gap.relatedSkill}")`
          : `"${gap.skill}" — only indirect evidence (via "${gap.relatedSkill}")`,
        detail: `Their resume shows "${gap.relatedSkill}", which often overlaps with "${gap.skill}" but isn't the same thing${niceToHave ? ' — this is a nice-to-have for the role' : ''}.` + note,
        questions: getSkillQuestions(gap.skill, level, QUESTIONS_PER_TOPIC),
      };
    }
    case 'listed':
    default: {
      return {
        title: niceToHave
          ? `"${gap.skill}" (nice-to-have) — listed but unverified`
          : `"${gap.skill}" — listed but unverified`,
        detail: `"${gap.skill}" appears on their resume with no project or work evidence nearby${niceToHave ? ' (this is a nice-to-have for the role)' : ''}.` + note,
        questions: getSkillQuestions(gap.skill, level, QUESTIONS_PER_TOPIC),
      };
    }
  }
}

// For candidates with strong, verified skills (status 'practical') — there's
// no "gap" to probe, but a recruiter still needs to confirm the depth behind
// the resume bullet rather than taking it at face value. Used to fill out the
// guide when there are few/no gap-driven focus areas, so the guide is never
// just the generic intro/behavioral/wrap-up regardless of how strong the
// candidate looks on paper.
function practicalVerificationStep(gap: SkillGap, level: CandidateLevel, jobResponsibilities?: string): GuideStep {
  const note = responsibilityNote(gap.skill, jobResponsibilities);
  return {
    title: `"${gap.skill}" — verify hands-on depth`,
    detail: `Resume shows direct, hands-on evidence of ${gap.skill}${gap.required ? ' (required for this role)' : ' (nice-to-have)'} — these questions check real depth rather than just familiarity.` + note,
    questions: getSkillQuestions(gap.skill, level, QUESTIONS_PER_TOPIC),
  };
}

// The gap-driven core of the guide: skill gaps, education/experience gaps,
// and carried-forward concerns from prior rounds — without the generic
// intro/outro structure. Reused by both the interview guide and the
// "Suggested Focus Areas" shown when setting up an assessment.
export function generateFocusAreas(input: InterviewGuideInput): GuideStep[] {
  const steps: GuideStep[] = [];
  const level = levelFromExperience(input.experience);
  const gaps = input.skillGaps || [];
  const bySeverity = (a: SkillGap, b: SkillGap) => GAP_SEVERITY[a.status] - GAP_SEVERITY[b.status];

  // The actual loopholes — skills the role requires that aren't solidly
  // demonstrated yet — always come first, most severe (missing) first.
  const requiredGaps = gaps.filter(g => g.required && g.status !== 'practical').sort(bySeverity);
  // Nice-to-have loopholes come after required ones.
  const niceToHaveGaps = gaps.filter(g => !g.required && g.status !== 'practical').sort(bySeverity);
  // Skills already demonstrated with hands-on evidence — no loophole, but
  // worth depth-checking so the guide isn't dominated by these when real
  // gaps exist.
  const requiredPractical = gaps.filter(g => g.required && g.status === 'practical');
  const niceToHavePractical = gaps.filter(g => !g.required && g.status === 'practical');

  type Entry = { gap: SkillGap; kind: 'gap' | 'practical' };
  const ordered: Entry[] = [];

  // 1. All required-skill gaps — these are the loopholes that matter most.
  for (const gap of requiredGaps) ordered.push({ gap, kind: 'gap' });

  // 2. Depth-check a handful of required skills that ARE verified, so a
  // candidate with zero required gaps still gets a guide focused on the
  // required skill set rather than falling straight to nice-to-have gaps.
  for (const gap of requiredPractical.slice(0, REQUIRED_PRACTICAL_CAP)) {
    ordered.push({ gap, kind: 'practical' });
  }

  // 3. Nice-to-have gaps fill whatever's left.
  let remaining = MAX_SKILL_FOCUS_AREAS - ordered.length;
  for (const gap of niceToHaveGaps.slice(0, Math.max(0, remaining))) {
    ordered.push({ gap, kind: 'gap' });
  }

  // 4. Any leftover slots go to remaining practical verification (required
  // first, then nice-to-have).
  remaining = MAX_SKILL_FOCUS_AREAS - ordered.length;
  const leftoverPractical = [...requiredPractical.slice(REQUIRED_PRACTICAL_CAP), ...niceToHavePractical];
  for (const gap of leftoverPractical.slice(0, Math.max(0, remaining))) {
    ordered.push({ gap, kind: 'practical' });
  }

  for (const { gap, kind } of ordered.slice(0, MAX_SKILL_FOCUS_AREAS)) {
    steps.push(
      kind === 'gap'
        ? skillGapStep(gap, level, input.jobResponsibilities)
        : practicalVerificationStep(gap, level, input.jobResponsibilities)
    );
  }

  if (input.educationMatch < 65 && input.jobEducation) {
    steps.push({
      title: 'Education requirement gap',
      detail: `This role asks for "${input.jobEducation}" and the resume's education doesn't clearly meet that bar.`,
      questions: [
        `Tell me about your educational background and how it prepared you for this role.`,
        `Have you done any certifications, courses, or self-directed learning that address "${input.jobEducation}"?`,
      ],
    });
  }

  const expectedRange = parseLevelRange(input.jobLevel) ?? inferLevelYears(input.jobLevel);
  if (expectedRange && input.experience < expectedRange.min) {
    const expectedLabel = `${expectedRange.min}${expectedRange.max < Infinity ? `-${expectedRange.max}` : '+'} years`;
    steps.push({
      title: 'Experience below expected range',
      detail: `This role expects roughly ${expectedLabel}; the candidate's resume shows about ${input.experience}.`,
      questions: [
        `This role typically expects ${expectedLabel} of experience — walk me through your most senior or highest-impact responsibility to date.`,
        `Tell me about a time you had to operate above your formal experience level. What happened, and what did you learn?`,
      ],
    });
  }

  for (const prior of input.priorRounds) {
    for (const concern of (prior.concerns || []).slice(0, MAX_CONCERNS_PER_ROUND)) {
      steps.push({
        title: `Carry-forward from ${prior.round}`,
        detail: `"${concern}" was raised previously — check whether this has improved.`,
        questions: [
          `In your "${prior.round}" round, this came up: "${concern}". How would you respond to that now — has anything changed?`,
        ],
      });
    }
  }

  return steps;
}

export function generateInterviewGuide(input: InterviewGuideInput): GuideStep[] {
  const steps: GuideStep[] = [];

  steps.push({
    title: 'Review the candidate before the session',
    detail: 'Skim the resume, AI score, and the prior-round notes on this page — the focus areas below are built directly from them.',
  });

  steps.push(...generateFocusAreas(input));

  steps.push({
    title: 'Intro & role overview',
    detail: 'Begin with a brief introduction and an overview of the role (5 min).',
  });
  steps.push({
    title: 'Behavioral round',
    detail: 'Ask about communication, collaboration, and growth mindset (10-15 min).',
    questions: [
      'Tell me about a time you disagreed with a teammate or manager — how did you handle it?',
      'Describe a project that didn\'t go as planned. What did you do, and what would you do differently?',
    ],
  });
  steps.push({
    title: 'Candidate Q&A',
    detail: 'Leave 5-10 minutes for the candidate to ask questions.',
  });
  steps.push({
    title: 'Wrap up',
    detail: 'Submit feedback within 24 hours on HireVerse AI.',
  });

  return steps;
}
