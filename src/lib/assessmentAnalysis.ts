// Deterministic heuristic analysis for coding and written assessments.
// Philosophy mirrors interviewAnalysis.ts: real evaluator notes + submission
// in, inspectable scoring out — no randomness, no fabricated narrative.
// Every score traces back to signals actually present in what the reviewer
// wrote or the candidate submitted.

import type { AssessmentType } from '../db/models/Assessment';

export interface AssessmentAnalysisInput {
  type: AssessmentType;
  round: string;
  submission: string;
  evaluatorNotes: string;
  testsPassed: number;
  testsTotal: number;
  candidateName: string;
  jobTitle: string;
}

export interface AssessmentAnalysisResult {
  codeQualityScore: number;
  algorithmScore: number;
  problemSolvingScore: number;
  overallScore: number;
  recommendation: string;
  summary: string;
  strengths: string[];
  concerns: string[];
  reasoning: string;
  decision: 'advance' | 'hold';
}

interface Signal {
  re: RegExp;
  label: string;
  weight: number;
}
const P = (re: RegExp, label: string, w = 1): Signal => ({ re, label, weight: w });
const N = (re: RegExp, label: string, w = 1): Signal => ({ re, label, weight: -w });

// ── Evaluator-note signals ────────────────────────────────────────────────────

const CODE_QUALITY_SIGNALS: Signal[] = [
  P(/\b(?:clean|readable|well[- ]?structured|maintainable|clear|neat|elegant|tidy)\b[^.?!]{0,20}\bcode\b/i, 'clean, readable, well-structured code', 2),
  P(/\b(?:good|solid|excellent|well[- ]?named)\b[^.?!]{0,15}\b(?:variables?|naming|functions?|abstractions?|modularity|modules?)\b/i, 'good naming and code organisation', 1.5),
  P(/\b(?:followed|respects?|adhered to)\b[^.?!]{0,20}\b(?:best\s+practices?|SOLID|DRY|KISS|design\s+patterns?|conventions?)\b/i, 'followed best practices / design patterns', 2),
  P(/\b(?:well[- ]?commented|good\s+comments?|documentation|inline\s+docs?)\b/i, 'included clear comments / documentation', 1),
  N(/\b(?:messy|cluttered|hard[- ]?to[- ]?read|unreadable|spaghetti|convoluted|over[- ]?engineered)\b[^.?!]{0,15}\bcode\b/i, 'messy, hard-to-read code', 2),
  N(/\b(?:poor|bad|no|inconsistent)\b[^.?!]{0,15}\b(?:naming|variables?|structure|organisation|modularity)\b/i, 'poor naming / structure', 1.5),
  N(/\b(?:no\s+comments?|uncommented|missing\s+docs?|undocumented)\b/i, 'no comments or documentation', 0.8),
  N(/\b(?:duplicate|copy[- ]?pasted?|repeated)\b[^.?!]{0,15}\bcode\b/i, 'code duplication / copy-paste', 1.5),
];

const ALGORITHM_SIGNALS: Signal[] = [
  P(/\b(?:optimal|efficient|O\s*\(\s*n\b|correct\s+time\s+complexity|linear|logarithmic)\b/i, 'optimal / efficient algorithm', 2.5),
  P(/\b(?:edge\s+cases?|boundary\s+conditions?|handled\s+all\s+cases?)\b/i, 'handled edge cases', 2),
  P(/\b(?:all|every)\s+(?:\d+\s+)?tests?\s+(?:pass(?:ed|ing)?|succeed(?:ed)?)\b/i, 'all tests passed', 3),
  P(/\b(?:correct(?:ly)?|accurate(?:ly)?|working)\b[^.?!]{0,20}\b(?:solution|output|result|answer)\b/i, 'correct, working solution', 2),
  P(/\b(?:clever|creative|elegant|insightful)\b[^.?!]{0,20}\b(?:approach|solution|algorithm|logic)\b/i, 'clever / creative approach', 1.5),
  N(/\b(?:O\s*\(\s*n\s*[²2]\b|quadratic|exponential|brute[- ]?force(?!\s+works))\b/i, 'inefficient algorithm (brute force / quadratic)', 2),
  N(/\b(?:wrong|incorrect|fails?|broken|doesn'?t\s+work)\b[^.?!]{0,20}\b(?:output|result|answer|logic|solution)\b/i, 'incorrect output / logic errors', 3),
  N(/\b(?:missed|skipped|ignored|forgot)\b[^.?!]{0,15}\b(?:edge\s+cases?|null|empty|boundary)\b/i, 'missed edge cases', 2),
  N(/\b(?:time\s+limit|TLE|memory\s+limit|MLE|exceeded|timeout)\b/i, 'exceeded time / memory limits', 2.5),
  N(/\b(?:did\s+not|didn'?t|failed\s+to)\b[^.?!]{0,20}\b(?:compil(?:e|es?)|run|execute)\b/i, 'code did not compile or run', 3),
];

const PROBLEM_SOLVING_SIGNALS: Signal[] = [
  P(/\b(?:good|solid|strong|excellent|impressive|clear)\b[^.?!]{0,20}\b(?:approach|thinking|reasoning|methodology|logic|solution)\b/i, 'good problem-solving approach', 2),
  P(/\b(?:broke\s+down|decomposed|systematically|step[- ]?by[- ]?step)\b[^.?!]{0,30}\b(?:problem|challenge|task|question)\b/i, 'broke the problem down systematically', 2),
  P(/\b(?:explained|justified|articulated|reasoned)\b[^.?!]{0,20}\b(?:approach|solution|trade[- ]?off|decision|choice)\b/i, 'explained their reasoning well', 1.5),
  P(/\b(?:proactive|creative|innovative|original)\b[^.?!]{0,15}\b(?:solution|approach|idea|thinking)\b/i, 'showed creative / proactive thinking', 1.5),
  N(/\b(?:weak|poor|unclear|confused|wrong)\b[^.?!]{0,15}\b(?:approach|reasoning|thinking|logic|methodology)\b/i, 'weak problem-solving approach', 2),
  N(/\b(?:no\s+(?:clear|obvious)\s+approach|trial\s+and\s+error|random(?:ly)?|guessed)\b/i, 'no clear approach — trial and error', 2),
  N(/\b(?:incomplete|unfinished|didn'?t\s+(?:finish|complete|solve))\b/i, 'incomplete solution', 2.5),
  N(/\b(?:misunderstood|missed\s+the\s+point|wrong\s+problem)\b/i, 'misunderstood the problem', 3),
];

// ── Submission quality heuristics ────────────────────────────────────────────

function submissionHeuristics(submission: string, type: AssessmentType): { score: number; notes: string[] } {
  const text = submission.trim();
  const notes: string[] = [];
  let bonus = 0;

  if (!text) return { score: -10, notes: ['no submission on record'] };

  const len = text.length;
  if (len > 200) { bonus += 5; notes.push('substantial submission present'); }

  if (type === 'coding') {
    const hasFunction = /\b(?:function|def |class |const\s+\w+\s*=|=>\s*\{|public\s+\w+)\b/.test(text);
    const hasLogic = /\b(?:if\s*\(|for\s*\(|while\s*\(|switch\s*\(|return\s+)\b/.test(text);
    if (hasFunction) { bonus += 3; notes.push('submission contains function/class definitions'); }
    if (hasLogic) { bonus += 2; notes.push('submission contains control flow logic'); }
  } else {
    const sentences = text.split(/[.?!]+/).filter(s => s.trim().length > 10).length;
    if (sentences >= 5) { bonus += 4; notes.push(`written submission (~${sentences} sentences)`); }
    if (sentences >= 10) { bonus += 3; }
  }
  return { score: bonus, notes };
}

// ── Signal scanning ───────────────────────────────────────────────────────────

function scanSignals(text: string, signals: Signal[]): { net: number; hits: { label: string; positive: boolean }[] } {
  const lower = text.toLowerCase();
  let net = 0;
  const hits: { label: string; positive: boolean }[] = [];
  for (const s of signals) {
    if (s.re.test(lower)) {
      net += s.weight;
      hits.push({ label: s.label, positive: s.weight > 0 });
    }
  }
  return { net, hits };
}

function scoreFromNet(net: number): number {
  return Math.max(5, Math.min(98, Math.round(60 + net * 8)));
}

// ── Test pass rate scoring ────────────────────────────────────────────────────

function testPassScore(passed: number, total: number): number {
  if (total <= 0) return 0; // no test data — don't influence
  const rate = passed / total;
  if (rate >= 1.0) return 30;
  if (rate >= 0.8) return 20;
  if (rate >= 0.6) return 10;
  if (rate >= 0.4) return -5;
  return -15;
}

// ── Recommendation label ──────────────────────────────────────────────────────

function getRecommendation(score: number): string {
  if (score >= 85) return 'Advance';
  if (score >= 68) return 'Likely Advance';
  if (score >= 50) return 'Borderline';
  return 'Do Not Advance';
}

// ── Summary line ──────────────────────────────────────────────────────────────

function buildSummary(input: AssessmentAnalysisInput, overallScore: number, testData: boolean): string {
  const src: string[] = [];
  if (input.evaluatorNotes.trim()) src.push("evaluator's notes");
  if (input.submission.trim()) src.push('submission');
  if (testData) src.push(`test results (${input.testsPassed}/${input.testsTotal})`);
  const srcLine = src.length ? `Based on ${src.join(', ')}.` : '';
  const tier = overallScore >= 80 ? 'strong' : overallScore >= 65 ? 'solid' : overallScore >= 50 ? 'mixed' : 'weak';
  return `${srcLine} ${input.candidateName}'s ${input.round} for "${input.jobTitle}" shows ${tier} signal (${overallScore}/100).`.trim();
}

// ── Reasoning ────────────────────────────────────────────────────────────────

function buildReasoning(input: AssessmentAnalysisInput, scores: { cq: number; alg: number; ps: number; overall: number }, strengths: string[], concerns: string[], decision: 'advance' | 'hold'): string {
  const { cq, alg, ps, overall } = scores;
  const tier = (n: number) => n >= 80 ? 'strong' : n >= 65 ? 'solid' : n >= 50 ? 'mixed' : 'weak';
  const parts: string[] = [];
  const typeLabel = input.type === 'coding' ? 'coding assessment' : input.type === 'written' ? 'written assessment' : 'take-home';

  parts.push(`Analysed ${input.candidateName}'s "${input.round}" ${typeLabel} for "${input.jobTitle}". Overall signal: ${tier(overall)} (${overall}/100).`);

  if (input.type === 'coding') {
    parts.push(`Code quality: ${tier(cq)} (${cq}/100). Algorithm / correctness: ${tier(alg)} (${alg}/100). Problem-solving approach: ${tier(ps)} (${ps}/100).`);
    if (input.testsTotal > 0) {
      const rate = Math.round((input.testsPassed / input.testsTotal) * 100);
      parts.push(`Tests: ${input.testsPassed}/${input.testsTotal} passed (${rate}%) — this was a primary signal in the algorithm score.`);
    }
  } else {
    parts.push(`Writing quality: ${tier(cq)} (${cq}/100). Comprehension / correctness: ${tier(alg)} (${alg}/100). Analytical thinking: ${tier(ps)} (${ps}/100).`);
  }

  if (strengths.length) parts.push(`Observed strengths — ${strengths.slice(0, 3).join('; ')}.`);
  if (concerns.length) parts.push(`Observed concerns — ${concerns.slice(0, 3).join('; ')}.`);

  const verb = decision === 'advance' ? 'advance' : 'hold';
  parts.push(`Verdict: ${getRecommendation(overall).toLowerCase()} — ${decision === 'advance' ? `signal is strong enough to ${verb} to the next stage.` : `concerns are material enough to ${verb} before advancing.`}`);
  return parts.join(' ');
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function analyzeAssessment(input: AssessmentAnalysisInput): AssessmentAnalysisResult {
  const notes = (input.evaluatorNotes || '').trim();
  const submission = (input.submission || '').trim();
  const combined = [notes, submission].filter(Boolean).join('\n');

  const cqSig = scanSignals(combined, CODE_QUALITY_SIGNALS);
  const algSig = scanSignals(combined, ALGORITHM_SIGNALS);
  const psSig = scanSignals(combined, PROBLEM_SOLVING_SIGNALS);

  const testBonus = testPassScore(input.testsPassed, input.testsTotal);
  const hasTestData = input.testsTotal > 0;

  const subHeuristic = submissionHeuristics(submission, input.type);

  // Base scores from net signal balance; algorithm gets the test pass bonus
  let codeQualityScore = scoreFromNet(cqSig.net) + subHeuristic.score;
  let algorithmScore = scoreFromNet(algSig.net + testBonus / 8);
  if (hasTestData) {
    // Test pass rate is a strong, concrete anchor for algorithm score
    const passRate = input.testsPassed / input.testsTotal;
    algorithmScore = Math.round(algorithmScore * 0.4 + passRate * 100 * 0.6);
  }
  let problemSolvingScore = scoreFromNet(psSig.net);

  // Clamp all scores
  codeQualityScore = Math.max(5, Math.min(98, codeQualityScore));
  algorithmScore = Math.max(5, Math.min(98, algorithmScore));
  problemSolvingScore = Math.max(5, Math.min(98, problemSolvingScore));

  // Overall: weighted blend — algorithm/correctness is the primary signal for coding
  const overallScore = input.type === 'coding'
    ? Math.round(codeQualityScore * 0.30 + algorithmScore * 0.50 + problemSolvingScore * 0.20)
    : Math.round(codeQualityScore * 0.35 + algorithmScore * 0.35 + problemSolvingScore * 0.30);

  const recommendation = getRecommendation(overallScore);
  const decision: 'advance' | 'hold' = overallScore >= 60 ? 'advance' : 'hold';

  const allHits = [...cqSig.hits, ...algSig.hits, ...psSig.hits, ...subHeuristic.notes.map(n => ({ label: n, positive: true }))];
  const strengths = allHits.filter(h => h.positive).map(h => h.label);
  const concerns  = allHits.filter(h => !h.positive).map(h => h.label);

  const summary = buildSummary(input, overallScore, hasTestData);
  const reasoning = buildReasoning(input, { cq: codeQualityScore, alg: algorithmScore, ps: problemSolvingScore, overall: overallScore }, strengths, concerns, decision);

  return {
    codeQualityScore,
    algorithmScore,
    problemSolvingScore,
    overallScore,
    recommendation,
    summary,
    strengths,
    concerns,
    reasoning,
    decision,
  };
}

export function inferAssessmentType(stageKey: string, stageLabel: string): AssessmentType {
  const s = `${stageKey} ${stageLabel}`.toLowerCase();
  if (/\btake[-_\s]?home\b/.test(s)) return 'take-home';
  if (/\bwritten\b/.test(s)) return 'written';
  return 'coding';
}
