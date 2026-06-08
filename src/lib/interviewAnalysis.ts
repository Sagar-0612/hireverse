// Deterministic, lexicon-based analysis of post-interview feedback (and an
// optional transcript). Mirrors resumeAnalysis.ts's philosophy: real text in,
// inspectable scoring out — no random numbers, no fabricated narrative. Every
// score and every line of reasoning traces back to a phrase actually present
// in what the interviewer wrote (or the transcript said), because a wrong call
// here affects someone's career.

export type InterviewDecision = 'advance' | 'hold';

export interface InterviewAnalysisResult {
  commScore: number;
  techScore: number;
  confidenceScore: number;
  overallScore: number;
  recommendation: string;
  decision: InterviewDecision;
  strengths: string[];
  concerns: string[];
  reasoning: string;
  transcriptSummary: string;
}

interface SignalPattern {
  re: RegExp;
  label: string;
  weight: number;
}

const POS = (re: RegExp, label: string, weight = 1): SignalPattern => ({ re, label, weight });
const NEG = (re: RegExp, label: string, weight = 1): SignalPattern => ({ re, label, weight: -weight });

// Real interview transcripts are first-person dialogue, not an interviewer's
// third-person summary — "the candidate showed gaps" never appears verbatim;
// what appears is the candidate themselves saying "I don't know", "I haven't
// worked with that", "I can't recall an example". A *single* honest admission
// like that is healthy self-awareness, not a concern — everyone has gaps. A
// *pattern* of them across a conversation is the real signal, so these are
// counted (not just detected once) and only weighed in once they cluster.
const UNCERTAINTY_ADMISSION_RE = /\bi\s+(?:don'?t|do\s+not)\s+(?:know|remember|recall)\b|\bi\s+(?:can'?t|cannot)\s+(?:recall|remember|think\s+of\s+(?:any|a))\b|\bi\s+(?:haven'?t|have\s+not)\s+(?:worked\s+(?:much\s+)?(?:on|with)|used|done\s+much|tried|written)\b|\bnot\s+much\b[^.?!]{0,25}\b(?:experience|exposure|knowledge|familiarity)\b|\bi\s+(?:have\s+)?(?:heard|read)\s+(?:about|of)\s+(?:it|that|them)\s+but\s+(?:haven'?t|have\s+not|never)\b|\bi\s+(?:usually|just)\s+(?:use\s+)?whichever\s+(?:one\s+)?works?\b|\bi\s+(?:don'?t|do\s+not)\s+have\s+(?:much|any)\s+(?:experience|exposure|idea)\b/gi;

function countMatches(text: string, re: RegExp): number {
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

// Each dimension is scored from the net balance of matched phrases — the same
// "count what's actually there" approach resumeAnalysis uses for skills.
const TECHNICAL_SIGNALS: SignalPattern[] = [
  POS(/\b(?:strong|solid|deep|excellent|impressive|thorough|good|great|sharp|clear)\b[^.?!]{0,40}\b(?:technical|coding|problem[- ]solving|system design|algorithm(?:ic)?|engineering|domain)\b[^.?!]{0,40}\b(?:knowledge|understanding|skills?|grasp|depth|fundamentals?|ability)\b/i, 'demonstrated strong technical depth', 2.5),
  POS(/\b(?:solved|nailed|aced|cracked|worked through|reasoned through|walked (?:us|me) through)\b[^.?!]{0,50}\b(?:problem|question|exercise|challenge|design|case|bug|algorithm)\b/i, 'worked through the technical problem effectively', 2),
  POS(/\b(?:wrote|produced|delivered)\b[^.?!]{0,30}\b(?:clean|efficient|well[- ]structured|readable|correct|working)\b[^.?!]{0,20}\bcode\b/i, 'produced clean, working code', 2),
  POS(/\b(?:correctly|accurately)\b[^.?!]{0,30}\b(?:identified|diagnosed|explained|described|implemented|optimi[sz]ed)\b/i, 'reasoned correctly under examination', 1.5),
  POS(/\b(?:good|strong|solid)\s+(?:grasp|command|understanding|fundamentals?)\s+of\b/i, 'showed solid command of the fundamentals', 1.5),
  POS(/\bable to\s+(?:explain|justify|defend|reason about|trade[- ]?off)\b/i, 'could explain and justify technical decisions', 1.5),
  NEG(/\b(?:could not|couldn'?t|unable to|failed to|didn'?t|did not)\b[^.?!]{0,40}\b(?:solve|answer|complete|finish|explain|implement|debug|optimi[sz]e)\b/i, 'could not complete or explain the core technical task', 3),
  NEG(/\b(?:struggled|fumbled|floundered)\b[^.?!]{0,40}\b(?:with|through|on)\b[^.?!]{0,40}\b(?:problem|question|exercise|design|code|algorithm|debugging)\b/i, 'struggled with the core technical exercise', 2.5),
  NEG(/\b(?:lack(?:ed|s|ing)?|gaps? in|limited|weak|shaky|no)\b[^.?!]{0,30}\b(?:technical|fundamental|domain|coding)\b[^.?!]{0,30}\b(?:knowledge|understanding|skills?|depth|fundamentals?)\b/i, 'showed gaps in fundamental technical knowledge', 3),
  NEG(/\b(?:guessed|memoriz(?:ed|ing)|rote)\b[^.?!]{0,40}\b(?:without|with no|lacking)\b[^.?!]{0,30}\b(?:understanding|reasoning|comprehension)\b/i, 'answers seemed memorized rather than understood', 2),
  NEG(/\bincorrect (?:approach|solution|answer|implementation|reasoning)\b/i, 'landed on an incorrect technical approach', 2),
  NEG(/\bcouldn'?t (?:get|write|produce)[^.?!]{0,30}\bworking\b/i, 'could not produce a working solution', 2.5),
  // Distinct from the "lacks ... technical/domain ... knowledge" pattern above —
  // this catches the equally common phrasing where the interviewer names the
  // *role's bar* directly ("lacks the depth expected for a Senior X role")
  // without an intervening domain-keyword. This is the interviewer's own
  // explicit JD-relative judgment, so it carries real weight.
  NEG(/\blacks?\s+(?:the\s+)?(?:depth|experience|seniority|maturity|skills?|expertise)\b[^.?!]{0,60}\b(?:expected|required|needed|necessary)\b[^.?!]{0,50}\b(?:senior|lead|principal|staff|architect|role|position|level)\b/i, 'interviewer explicitly judged the candidate as not yet at the depth this specific role calls for', 3.5),
];

const COMMUNICATION_SIGNALS: SignalPattern[] = [
  POS(/\b(?:communicated|explained|articulated|presented)\b[^.?!]{0,30}\b(?:clearly|concisely|well|effectively|confidently)\b/i, 'communicated clearly and effectively', 2.5),
  POS(/\b(?:articulate|well[- ]spoken|clear communicator|easy to follow|structured (?:answers|response|thinking))\b/i, 'came across as an articulate, structured communicator', 2),
  POS(/\b(?:asked|raised)\b[^.?!]{0,20}\b(?:good|thoughtful|clarifying|insightful)\b[^.?!]{0,20}\bquestions?\b/i, 'asked thoughtful clarifying questions', 1.5),
  POS(/\b(?:active listener|listened (?:carefully|well|attentively))\b/i, 'listened carefully and engaged with the conversation', 1),
  NEG(/\b(?:rambl(?:ed|ing)|unclear|vague|hard to follow|difficult to follow|unstructured|disorgani[sz]ed)\b[^.?!]{0,30}\b(?:answer|response|explanation|communication)?/i, 'answers were unclear, vague, or hard to follow', 2.5),
  NEG(/\b(?:did not|didn'?t|failed to)\b[^.?!]{0,30}\b(?:answer|address)\b[^.?!]{0,20}\b(?:the )?question\b/i, 'frequently did not directly answer the question asked', 2.5),
  NEG(/\b(?:talked over|interrupted|dominated the conversation|monopoli[sz]ed)\b/i, 'talked over the interviewer / dominated the conversation', 2),
  NEG(/\b(?:long[- ]winded|went off[- ]topic|veered off[- ]topic|lost track of the question)\b/i, 'tended to go off-topic or lose the thread', 1.5),
  // Verbatim transcript close — "no questions for us?" / "no, I don't have any
  // questions" — is one of the few things a transcript reveals about genuine
  // curiosity that written feedback rarely restates explicitly.
  NEG(/\bno,?\s*i\s+(?:don'?t|do\s+not)\s+have\s+(?:any\s+)?questions?\b/i, 'showed little curiosity or engagement — had no questions for the interviewer at the close', 1),
];

const CONFIDENCE_SIGNALS: SignalPattern[] = [
  POS(/\b(?:confident|composed|calm|poised|self[- ]assured)\b[^.?!]{0,30}\b(?:throughout|under pressure|when challenged|when pushed)?/i, 'remained confident and composed, including under pressure', 2),
  POS(/\b(?:handled|responded to|took)\b[^.?!]{0,20}\b(?:pushback|challenge|follow[- ]up|criticism|feedback)\b[^.?!]{0,20}\b(?:well|gracefully|calmly|professionally)\b/i, 'handled pushback and follow-up questions gracefully', 2),
  POS(/\b(?:owned|acknowledged)\b[^.?!]{0,30}\b(?:mistake|gap|what (?:they|she|he) (?:didn'?t|did not) know|uncertainty)\b/i, 'showed self-awareness by owning gaps honestly', 1.5),
  NEG(/\b(?:nervous|hesitant|unsure|uneasy|uncomfortable|anxious)\b[^.?!]{0,30}\b(?:throughout|the whole time|for most of)?/i, 'appeared nervous or unsure for much of the session', 2),
  NEG(/\b(?:froze|blanked|went silent|shut down)\b[^.?!]{0,30}\bwhen\b/i, 'froze or shut down when challenged', 2.5),
  NEG(/\b(?:lost composure|fell apart|got flustered|got rattled)\b/i, 'lost composure when the conversation got difficult', 2.5),
  NEG(/\b(?:over[- ]?confident|dismissive|arrogant|defensive|argumentative|combative)\b/i, 'came across as defensive, dismissive, or combative', 2),
];

// These describe the *whole interview*, not one dimension — they swing the
// overall verdict directly because they're the interviewer's own bottom line.
const VERDICT_SIGNALS: SignalPattern[] = [
  // Negative lookbehinds keep "would not recommend moving him forward" from
  // also reading as a positive endorsement — the negation a few characters
  // back flips the whole phrase's meaning, so a bare substring match isn't
  // enough here the way it's safe to be elsewhere.
  POS(/(?<!\b(?:not|never)\s)(?<!n't\s)\b(?:strongly recommend|hire(?:d)? (?:them|him|her)|move (?:them|him|her)?\s*forward|advance (?:them|him|her)?\s*to|great fit|excellent fit|top candidate|would love to have (?:them|him|her))\b/i, 'interviewer explicitly advocated moving forward', 4),
  POS(/(?<!\b(?:not|never)\s)(?<!n't\s)\b(?:recommend (?:moving|advancing|proceeding)|next round|good fit|solid fit|worth (?:advancing|progressing))\b/i, 'interviewer leaned toward advancing the candidate', 2.5),
  NEG(/\b(?:do not recommend|wouldn'?t recommend|would not recommend|not a fit|not a good fit|pass on (?:this|the) candidate|would not (?:hire|move (?:them|him|her) forward)|do not (?:hire|advance|move (?:them|him|her) forward))\b/i, 'interviewer explicitly recommended against advancing', 4.5),
  NEG(/\b(?:red flag|major concern|serious concern|dealbreaker|deal[- ]breaker|would not trust|integrity concern|inconsistent (?:story|answers|account))\b/i, 'interviewer raised a serious red flag', 5),
  NEG(/\b(?:not (?:ready|there) yet|borderline|on the fence|mixed feelings|some reservations|hesitant to recommend)\b/i, 'interviewer expressed real reservations', 1.5),
];

function scanText(text: string, signals: SignalPattern[]): { net: number; hits: { label: string; positive: boolean; weight: number }[] } {
  let net = 0;
  const hits: { label: string; positive: boolean; weight: number }[] = [];
  for (const s of signals) {
    if (s.re.test(text)) {
      net += s.weight;
      hits.push({ label: s.label, positive: s.weight > 0, weight: Math.abs(s.weight) });
    }
  }
  return { net, hits };
}

// Maps a net signal balance to a 0-100 score around a neutral baseline of 60
// (a feedback note that says nothing notable either way shouldn't read as a
// failing grade — it reads as "unremarkable", which is what 60 represents).
function scoreFromNet(net: number): number {
  return Math.max(5, Math.min(98, Math.round(60 + net * 7)));
}

export function getInterviewRecommendation(score: number): string {
  if (score >= 85) return 'Strongly Recommend';
  if (score >= 68) return 'Recommend';
  if (score >= 50) return 'Neutral';
  return 'Do Not Recommend';
}

function summarizeTranscript(transcript: string, hits: { label: string; positive: boolean }[]): string {
  const trimmed = transcript.trim();
  if (!trimmed) return '';
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  const positives = hits.filter(h => h.positive).length;
  const negatives = hits.filter(h => !h.positive).length;
  const signalNote = positives || negatives
    ? `Scanning it surfaced ${positives} positive signal${positives === 1 ? '' : 's'} and ${negatives} concern${negatives === 1 ? '' : 's'} that fed into the scores below.`
    : `Scanning it didn't surface strong signals either way — the verdict below leans mainly on the interviewer's written feedback.`;
  return `Transcript on file (~${words.toLocaleString()} words). ${signalNote}`;
}

function buildReasoning(opts: {
  candidateName: string;
  round: string;
  hasTranscript: boolean;
  techScore: number;
  commScore: number;
  confidenceScore: number;
  overallScore: number;
  recommendation: string;
  decision: InterviewDecision;
  strengths: string[];
  concerns: string[];
  redFlag: boolean;
  jobTitle: string;
  jobLevel: string;
}): string {
  const { candidateName, round, hasTranscript, techScore, commScore, confidenceScore, overallScore, recommendation, decision, strengths, concerns, redFlag, jobTitle, jobLevel } = opts;
  const sourceNote = hasTranscript ? "the interviewer's written feedback and the interview transcript" : "the interviewer's written feedback";

  const tier = (n: number) => n >= 80 ? 'strong' : n >= 65 ? 'solid' : n >= 50 ? 'mixed' : 'weak';
  const sentences: string[] = [];

  sentences.push(`Based on ${sourceNote} for the "${round}" round, ${candidateName} comes across with ${tier(overallScore)} overall signal (${overallScore}/100).`);
  sentences.push(`Technical assessment: ${tier(techScore)} (${techScore}/100). Communication: ${tier(commScore)} (${commScore}/100). Confidence and composure: ${tier(confidenceScore)} (${confidenceScore}/100).`);

  // Grounds the read in the JD it's actually being measured against — the same
  // transcript answers can be a fine showing for an entry-level round and a
  // real concern for a senior one, and a verdict that doesn't say which bar
  // it's using isn't one a recruiter can sanity-check.
  const seniorish = /senior|lead|principal|staff|architect/i.test(jobLevel) || /senior|lead|principal|staff|architect/i.test(jobTitle);
  if (jobLevel || jobTitle) {
    const roleNote = jobTitle ? `the "${jobTitle}" role` : 'this role';
    const levelNote = jobLevel ? ` (pegged at ${jobLevel})` : '';
    const calibration = seniorish && concerns.length
      ? ` At that level, the gaps and uncertainty noted below carry materially more weight than they would in an entry-level round, where some of the same answers might be perfectly normal.`
      : '';
    sentences.push(`This read is being measured against ${roleNote}${levelNote} specifically — not a generic bar.${calibration}`);
  }

  if (strengths.length) {
    sentences.push(`What stood out positively — ${strengths.slice(0, 3).join('; ')}.`);
  }
  if (concerns.length) {
    sentences.push(`What raises concern — ${concerns.slice(0, 3).join('; ')}.`);
  }
  if (redFlag) {
    sentences.push(`The interviewer's feedback contains language consistent with a serious red flag — that alone is enough to recommend against advancing regardless of how the rest of the session went.`);
  }

  if (decision === 'advance') {
    sentences.push(`Net verdict: ${recommendation.toLowerCase()} — the signal is strong enough to justify moving ${candidateName} forward to the next stage.`);
  } else if (strengths.length) {
    sentences.push(`Net verdict: ${recommendation.toLowerCase()} — the concerns outweigh the strengths closely enough that this should not advance without a second opinion.`);
  } else {
    sentences.push(`Net verdict: ${recommendation.toLowerCase()} — there's no counterbalancing strength here strong enough to justify moving ${candidateName} forward on this showing.`);
  }

  if (!strengths.length && !concerns.length) {
    sentences.push(`Note: the feedback didn't contain much specific, scoreable detail — consider asking the interviewer for more concrete observations before relying heavily on this verdict.`);
  }

  return sentences.join(' ');
}

export interface AnalyzeInterviewInput {
  candidateName: string;
  round: string;
  feedback: string;
  transcript?: string;
  // The role this interview is actually being measured against — without this,
  // "solid fundamentals" reads the same whether the bar is an internship or a
  // staff role. Optional only because older callers may not have it on hand;
  // every code path that can supply it should.
  jobTitle?: string;
  jobLevel?: string;
}

export function analyzeInterview(input: AnalyzeInterviewInput): InterviewAnalysisResult {
  const feedback = (input.feedback || '').trim();
  const transcript = (input.transcript || '').trim();
  const combined = [feedback, transcript].filter(Boolean).join('\n');
  const jobTitle = (input.jobTitle || '').trim();
  const jobLevel = (input.jobLevel || '').trim();

  const tech = scanText(combined, TECHNICAL_SIGNALS);
  const comm = scanText(combined, COMMUNICATION_SIGNALS);
  const conf = scanText(combined, CONFIDENCE_SIGNALS);
  const verdict = scanText(combined, VERDICT_SIGNALS);

  // First-person admissions ("I don't know that", "I haven't worked with X")
  // are real transcript content the third-person-oriented lexicon above can't
  // see — and a *single* one is healthy honesty, not a concern. It's the
  // density across a conversation that turns "everyone has gaps" into "this
  // person's exposure looks shallow" — so this only weighs in once a real
  // pattern (3+) shows up, and the label states the literal count so the
  // claim stays checkable against the transcript.
  const uncertaintyCount = countMatches(combined, UNCERTAINTY_ADMISSION_RE);
  if (uncertaintyCount >= 3) {
    const penalty = Math.min(uncertaintyCount, 8) * 0.9;
    tech.net -= penalty;
    conf.net -= penalty * 0.5;
    const label = `repeatedly said they didn't know, didn't remember, or hadn't worked with core topics raised (${uncertaintyCount}× across the conversation) — a pattern of shallow exposure rather than an isolated honest gap`;
    tech.hits.push({ label, positive: false, weight: penalty });
  }

  const techScore = scoreFromNet(tech.net);
  const commScore = scoreFromNet(comm.net);
  const confidenceScore = scoreFromNet(conf.net);

  // The interviewer's own bottom line carries real weight alongside the
  // dimension scores — a glowing technical note paired with "would not
  // recommend" should not read as a hire.
  const dimensionAvg = techScore * 0.4 + commScore * 0.3 + confidenceScore * 0.3;
  const verdictAdjusted = dimensionAvg + verdict.net * 4;
  let overallScore = Math.max(2, Math.min(99, Math.round(verdictAdjusted)));

  const redFlag = verdict.hits.some(h => !h.positive && h.weight >= 5);
  // A genuine red flag caps the verdict — no amount of positive technical
  // signal should outweigh an integrity or trust concern.
  if (redFlag) overallScore = Math.min(overallScore, 35);

  const recommendation = getInterviewRecommendation(overallScore);
  const decision: InterviewDecision = (recommendation === 'Strongly Recommend' || recommendation === 'Recommend') ? 'advance' : 'hold';

  const allHits = [...tech.hits, ...comm.hits, ...conf.hits, ...verdict.hits];
  const dedupe = (positive: boolean) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const h of allHits) {
      if (h.positive !== positive) continue;
      const key = h.label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(h.label);
    }
    return out;
  };
  const strengths = dedupe(true).slice(0, 6);
  const concerns = dedupe(false).slice(0, 6);

  const reasoning = buildReasoning({
    candidateName: input.candidateName,
    round: input.round,
    hasTranscript: !!transcript,
    techScore,
    commScore,
    confidenceScore,
    overallScore,
    recommendation,
    decision,
    jobTitle,
    jobLevel,
    strengths,
    concerns,
    redFlag,
  });

  const transcriptSummary = transcript ? summarizeTranscript(transcript, allHits) : '';

  return {
    commScore,
    techScore,
    confidenceScore,
    overallScore,
    recommendation,
    decision,
    strengths,
    concerns,
    reasoning,
    transcriptSummary,
  };
}
