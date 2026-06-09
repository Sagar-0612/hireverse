// Extracts real text from uploaded resumes and scores them against a job's
// requirements. Replaces random/placeholder scoring with deterministic,
// inspectable analysis so candidates are judged on what their resume actually says.

interface JobLike {
  requiredSkills?: string[];
  niceToHaveSkills?: string[];
  education?: string;
  level?: string;
}

export type LocationConfidence = 'high' | 'medium' | 'low' | 'none';

export interface ResumeAnalysis {
  name: string;
  email: string;
  phone: string;
  location: string;
  locationConfidence: LocationConfidence;
  experience: number;
  skills: string[];
  // Subset of `skills` whose mention sits near language describing real work
  // ("built", "Tech Stack:", "deployed", etc.) rather than just being named —
  // the resume's own text is the only evidence trail this traces back to.
  practicalSkills: string[];
  // Concrete standout signals lifted verbatim from the resume — certifications,
  // awards, hackathon wins, publications — so "extra achievements" in the
  // assessment point at literal lines rather than an impression.
  achievements: string[];
  skillsMatch: number;
  educationMatch: number;
  score: number;
  recommendation: string;
}

function isLikelyText(s: string): boolean {
  if (!s) return false;
  const printable = s.replace(/[^\x20-\x7E\n\r\t]/g, '').length;
  return printable / s.length > 0.85;
}

export async function extractResumeText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  const ext = (filename.match(/\.(\w+)$/)?.[1] || '').toLowerCase();
  try {
    if (mimeType === 'application/pdf' || ext === 'pdf') {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy?.();
      return result.text || '';
    }
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === 'docx') {
      const mammothModule: any = await import('mammoth');
      const mammoth = mammothModule.default ?? mammothModule;
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    }
    // Legacy binary Word format (.doc, MIME application/msword) — mammoth only
    // reads the modern .docx (OOXML) format, and the binary OLE2 structure of
    // a .doc fails the plain-text decode below, so without this branch every
    // .doc upload silently produced empty text (garbage name-from-filename,
    // zero experience/skills/score).
    if (mimeType === 'application/msword' || ext === 'doc') {
      const WordExtractorModule: any = await import('word-extractor');
      const WordExtractor = WordExtractorModule.default ?? WordExtractorModule;
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buffer);
      return doc.getBody() || '';
    }
    const decoded = buffer.toString('utf-8');
    return isLikelyText(decoded) ? decoded : '';
  } catch (err) {
    console.error(`Resume text extraction failed for "${filename}":`, err);
    return '';
  }
}

function extractNameFromFilename(filename: string): string {
  let name = filename.replace(/\.(pdf|docx|doc|txt)$/i, '');
  name = name.replace(/[-_]/g, ' ');
  name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  name = name.replace(/\b(resume|cv|curriculum|vitae|application|final|updated|new|v\d+)\b/gi, '');
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 3)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ') || 'Unknown Candidate';
}

// Resume templates (especially the consultancy/corporate "Name: X / Role: Y"
// style) commonly render an all-caps, multi-word section header — "EDUCATION
// AND CREDENTIALS", "PROFESSIONAL EXPERIENCE", "TECHNICAL PROFICIENCIES" — on
// its own line. Those satisfy the "every word looks like an acronym/initial"
// heuristic just as well as an all-caps name like "JOHN SMITH" does, so both
// the name and location heuristics need to recognize and skip them.
const SECTION_HEADER_RE = /\b(summary|profile|objective|education|credentials|qualifications|experience|professional|technical|proficienc(?:y|ies)|skills?|projects?|certifications?|certificates?|training|achievements?|accolades|references?|publications?|awards?|languages?|interests?|activities|volunteer|employment|career|background|highlights|expertise|competenc(?:y|ies)|tools|platforms|responsibilities|contact|personal|details|info(?:rmation)?|links|socials?|portfolio|hobbies|strengths|declaration|address(?:es)?)\b/i;

const NAME_NOISE = /resume|curriculum|vitae|\bcv\b|address|objective|summary|profile|contact|linkedin|github|http|www\.|email|phone|@/i;

// "Name: Sagar Pawar" / "Name:\tSagar Pawar" — the corporate consultancy
// resume template puts the field label and value on the same line (unlike
// the usual "Name" header followed by the value below it), which the
// line-by-line heuristic below can't see as a name candidate at all.
// Word-by-word separator is restricted to plain spaces (not \s, which would
// also match the tab that the same templates use between "Name: Sagar Pawar"
// and the *next* field — e.g. "\tDesignation (Grade):" — letting the capture
// run on into "Sagar Pawar Designation").
const NAME_LABELED = /(?:^|[\r\n\t])[ ]*(?:full\s+)?name\s*[:\-][ \t]*([A-Z][a-zA-Z'.-]+(?:[ ]+[A-Z][a-zA-Z'.-]+){1,3})(?=[\t\r\n]|$)/i;

function extractName(text: string, filename: string): string {
  const labeled = text.match(NAME_LABELED);
  if (labeled) {
    return labeled[1]
      .trim()
      .split(/\s+/)
      .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 15);
  // Single-word names (e.g. "Muskan") are valid — capture one from the first 4
  // header lines as a fallback before the filename, but keep searching for a
  // two-word form in case the full name appears slightly further down.
  let singleWordCandidate = '';

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (NAME_NOISE.test(line) || SECTION_HEADER_RE.test(line)) continue;
    if (/\d/.test(line)) continue;
    if (line.length > 40) continue;
    const words = line.split(/\s+/).filter(Boolean);

    if (words.length === 1 && idx < 4) {
      const w = words[0];
      // Require at least 3 chars, all-alpha, starts uppercase — rules out
      // lone punctuation lines, short abbreviations, and ALL-CAPS section headers
      // (those are already caught by SECTION_HEADER_RE above, but defense-in-depth).
      if (w.length >= 3 && /^[A-Z][a-zA-Z'-]+$/.test(w) && !singleWordCandidate) {
        singleWordCandidate = w[0].toUpperCase() + w.slice(1).toLowerCase();
      }
      continue;
    }

    if (words.length < 2 || words.length > 4) continue;
    const looksLikeName = words.every(w => /^[A-Z][a-zA-Z'.-]*$/.test(w) || /^[A-Z]{2,}$/.test(w));
    if (looksLikeName) {
      // If a single-word name was already captured from the first 4 lines (e.g.
      // "Muskan"), trust it over a later job-title-like string ("Frontend Developer"
      // in WORK EXPERIENCE) which would otherwise win because it looks name-like.
      if (singleWordCandidate) return singleWordCandidate;
      return words
        .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
  }
  // A confirmed single-word header name is more reliable than deriving a
  // potentially wrong surname from the filename.
  if (singleWordCandidate) return singleWordCandidate;
  return extractNameFromFilename(filename);
}

function extractEmail(text: string): string {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].toLowerCase() : '';
}

function extractPhone(text: string): string {
  const candidates = text.match(/(\+\d{1,3}[\s.-]?)?\(?\d{2,5}\)?[\s.-]?\d{2,5}[\s.-]?\d{2,5}(?:[\s.-]?\d{2,4})?/g) || [];
  for (const c of candidates) {
    const digits = c.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 13) return c.trim();
  }
  return '';
}

// "City, ST" with a clean two-letter state/province code — the cleanest, most
// unambiguous signal a resume gives for location.
const LOCATION_STRICT = /^[A-Z][a-zA-Z.\s]{1,30},\s?[A-Z]{2}$/;
// "City, Country" / "City, Region" / "City, Region, Country" — still a
// comma-separated place, but the parts aren't tidy two-letter codes so it's
// read with less certainty.
const LOCATION_LOOSE = /^[A-Z][a-zA-Z.\s]{1,30},\s?[A-Z][a-zA-Z.\s]{1,30}(?:,\s?[A-Z][a-zA-Z.\s]{1,30})?$/;
const LOCATION_LABELED = /(?:location|address|based\s+in|residing\s+in|city)\s*[:\-]\s*([A-Z][a-zA-Z,.\s]{2,40})/i;
// Bare single/double-word capitalized line — could be a city, could easily be
// a job title or section header, hence the lowest confidence tier.
const LOCATION_BARE = /^[A-Z][a-zA-Z.]{2,20}(?:\s[A-Z][a-zA-Z.]{2,20})?$/;
const TITLE_NOISE = /engineer|manager|developer|designer|analyst|specialist|lead|director|intern|consultant|architect|founder|officer|scientist|administrator|coordinator|executive/i;

// Resume headers put the candidate's name right next to (often directly above
// or below) their location, so a bare capitalized line is just as likely to be
// their name as their city. Comparing against the already-extracted name lets
// us rule that out instead of reporting "Sagar Pawar" as his own location.
const normalizeForCompare = (s: string) => s.replace(/[^a-zA-Z\s]/g, ' ').trim().toLowerCase().replace(/\s+/g, ' ');

// A degree's or former employer's city ("Ambedkar Nagar, Uttar Pradesh" for a
// college) reads identically to a candidate's home city in isolation — the
// only thing that actually distinguishes them on the page is *where* they
// sit. Resumes group personal contact details together, so a location-shaped
// line sitting right next to the parsed email/phone is far more likely to be
// where the candidate actually lives than one sitting next to a degree's date
// range. This scores every candidate line by its line-distance to the nearest
// contact anchor and prefers whichever sits closest — concrete and inspectable
// rather than a guess from raw position-on-page.
function findLocationNearContact(
  lines: string[],
  anchors: number[],
  isUsable: (line: string) => boolean,
  clean: (line: string) => string,
): { location: string; confidence: LocationConfidence } | null {
  if (!anchors.length) return null;
  const MAX_DISTANCE = 3;
  let best: { location: string; confidence: LocationConfidence; distance: number; strict: boolean } | null = null;

  for (let i = 0; i < lines.length; i++) {
    if (!isUsable(lines[i])) continue;
    const distance = Math.min(...anchors.map(a => Math.abs(i - a)));
    if (distance === 0 || distance > MAX_DISTANCE) continue;
    const c = clean(lines[i]);
    const strict = LOCATION_STRICT.test(c);
    const loose = !strict && LOCATION_LOOSE.test(c);
    if (!strict && !loose) continue;
    if (!best || distance < best.distance || (distance === best.distance && strict && !best.strict)) {
      best = { location: c, confidence: 'high', distance, strict };
    }
  }
  return best ? { location: best.location, confidence: best.confidence } : null;
}

function extractLocation(text: string, candidateName: string, email: string, phone: string): { location: string; confidence: LocationConfidence } {
  const allLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const lines = allLines.slice(0, 12);
  const clean = (l: string) => l.replace(/[|•].*$/, '').trim();
  const isNoisy = (l: string) => /@|\d{4,}|https?:/i.test(l);
  const normalizedName = normalizeForCompare(candidateName);
  const isCandidateName = (l: string) => {
    const n = normalizeForCompare(l);
    return n.length > 0 && n === normalizedName;
  };
  const isUsable = (l: string) => !isNoisy(l) && l.length < 60 && !isCandidateName(l) && !SECTION_HEADER_RE.test(l);

  // Priority 1: a location-shaped line sitting beside the candidate's own
  // email or phone — the strongest, most concrete signal a resume gives.
  const phoneDigits = phone.replace(/\D/g, '');
  const anchors: number[] = [];
  for (let i = 0; i < allLines.length; i++) {
    const l = allLines[i];
    if (email && l.toLowerCase().includes(email.toLowerCase())) anchors.push(i);
    else if (phoneDigits.length >= 7 && l.replace(/\D/g, '').includes(phoneDigits.slice(-7))) anchors.push(i);
  }
  const nearContact = findLocationNearContact(allLines, anchors, isUsable, clean);
  if (nearContact) return nearContact;

  // Resumes frequently pack the entire contact block on one line with | or •:
  // "Mumbai, India | user@email.com | +91-9876543210"
  // The isNoisy guard (triggered by @) and the clean() stripper (strips at first |)
  // both miss the location segment — scan each token individually instead.
  for (const raw of allLines.slice(0, 15)) {
    if (!/[|•~]/.test(raw)) continue;
    for (const seg of raw.split(/[|•~]/).map(s => s.trim()).filter(Boolean)) {
      if (seg.length >= 60 || isNoisy(seg) || isCandidateName(seg) || SECTION_HEADER_RE.test(seg)) continue;
      if (LOCATION_STRICT.test(seg)) return { location: seg, confidence: 'high' };
      if (LOCATION_LOOSE.test(seg)) return { location: seg, confidence: 'medium' };
    }
  }

  for (const line of lines) {
    if (isNoisy(line) || line.length >= 60 || isCandidateName(line)) continue;
    const c = clean(line);
    if (LOCATION_STRICT.test(c)) return { location: c, confidence: 'high' };
  }

  for (const line of lines) {
    if (isNoisy(line) || line.length >= 60 || isCandidateName(line)) continue;
    const c = clean(line);
    if (LOCATION_LOOSE.test(c)) return { location: c, confidence: 'medium' };
  }

  const labeled = text.match(LOCATION_LABELED);
  if (labeled) {
    const value = clean(labeled[1].split(/[\n\r]/)[0]);
    if (value.length > 1 && value.length < 60 && !isCandidateName(value)) {
      return { location: value, confidence: 'medium' };
    }
  }

  for (const line of lines.slice(0, 6)) {
    if (isNoisy(line) || line.length >= 35 || TITLE_NOISE.test(line) || SECTION_HEADER_RE.test(line) || isCandidateName(line)) continue;
    const c = clean(line);
    if (LOCATION_BARE.test(c)) return { location: c, confidence: 'low' };
  }

  return { location: 'Location Not Found', confidence: 'none' };
}

const MONTH_NAMES = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const monthIndex = (name?: string): number | null => {
  if (!name) return null;
  const i = MONTH_NAMES.indexOf(name.slice(0, 3).toLowerCase());
  return i === -1 ? null : i;
};

const DAY = '\\d{1,2}\\s+';
const MONTH_NAME = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
// Captures month name (when present) alongside the year on both ends, so a
// range's actual covered span can be measured to the month rather than just
// "which calendar years did this touch" — the difference between "Sept 2019 –
// May 2023" spanning ~3.7 years vs. a naive year-diff calling it 4.
const RANGE_RE = new RegExp(
  `(?:${DAY})?(?:${MONTH_NAME}\\s+)?(\\d{4})\\s*(?:[-–—]|to)\\s*(?:${DAY})?(?:${MONTH_NAME}\\s+)?(present|current|now|\\d{4})`,
  'gi'
);

// Resumes contain "YYYY - YYYY" ranges for both jobs and degrees. PDF text
// extraction also frequently scrambles section ordering in multi-column
// layouts, so instead of trusting section headers we classify each date range
// individually by whether education-related words appear right around it.
const EDU_NEARBY_RE = /\b(university|college|institute|polytechnic|academy|school|bachelor'?s?|master'?s?|b\.?\s?tech|m\.?\s?tech|b\.?\s?sc|m\.?\s?sc|b\.?\s?e\b|phd|ph\.?d\.?|doctorate|diploma|degree)\b/i;

// A career span (earliest job start → today) silently swallows real gaps
// between roles — e.g. a candidate who worked 2016–2017, sat idle for two
// years, then resumed in 2019 does NOT have 2016-to-now of experience. The
// honest, recruiter-relevant number is the sum of months actually spent
// employed, which means: parse every role's start/end to the month, merge
// any that overlap (concurrent roles / messy multi-column extraction), and
// add up only the covered spans — gaps fall in the cracks on purpose.
function extractExperience(text: string): number {
  const now = new Date();
  const currentYM = now.getFullYear() * 12 + now.getMonth();

  const ranges: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  RANGE_RE.lastIndex = 0;
  while ((m = RANGE_RE.exec(text)) !== null) {
    // Wide enough to reliably cover the 1-2 lines before the date range even
    // when a location/institute line sits in between the degree title and its
    // dates (e.g. "B.tech (...)\nAmbedkar Nagar, UP\n2018 - 2022") — a
    // narrower window clips the leading "B.tech" mid-word, the education
    // exclusion below silently misses it, and a degree gets counted as work.
    const windowStart = Math.max(0, m.index - 110);
    const windowEnd = Math.min(text.length, m.index + m[0].length + 30);
    if (EDU_NEARBY_RE.test(text.slice(windowStart, windowEnd))) continue;

    const startYear = parseInt(m[2], 10);
    const endRaw = m[4].toLowerCase();
    const isPresent = /present|current|now/.test(endRaw);
    const endYear = isPresent ? now.getFullYear() : parseInt(endRaw, 10);
    if (startYear < 1960 || startYear > now.getFullYear()) continue;
    if (endYear < startYear || endYear > now.getFullYear()) continue;

    // A bare year ("2019 - 2023") gives no month — treat it as covering the
    // full calendar year so it doesn't get shortchanged against ranges that
    // do specify months.
    const startMonth = monthIndex(m[1]) ?? 0;
    const endMonth = isPresent ? now.getMonth() : (monthIndex(m[3]) ?? 11);

    const start = startYear * 12 + startMonth;
    const end = Math.min(endYear * 12 + endMonth, currentYM);
    if (end > start) ranges.push({ start, end });
  }

  if (ranges.length) {
    ranges.sort((a, b) => a.start - b.start || a.end - b.end);
    let totalMonths = 0;
    let curStart = ranges[0].start;
    let curEnd = ranges[0].end;
    for (let i = 1; i < ranges.length; i++) {
      const r = ranges[i];
      if (r.start <= curEnd) {
        curEnd = Math.max(curEnd, r.end);
      } else {
        totalMonths += curEnd - curStart;
        curStart = r.start;
        curEnd = r.end;
      }
    }
    totalMonths += curEnd - curStart;
    return Math.min(totalMonths / 12, 45);
  }

  const explicit = text.match(/(\d{1,2})\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:professional\s+|relevant\s+|total\s+|work(?:ing)?\s+)?experience/i);
  if (explicit) {
    const years = parseInt(explicit[1], 10);
    if (years > 0 && years <= 50) return years;
  }
  return 0;
}

// Formats a fractional year count into a human-readable string like "3 yrs 2 mo"
// so display surfaces show actual precision rather than rounding to a whole year.
export function formatExperience(years: number): string {
  const totalMonths = Math.round(years * 12);
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  if (y === 0 && m === 0) return '< 1 mo';
  if (y === 0) return m === 1 ? '1 mo' : `${m} mo`;
  if (m === 0) return y === 1 ? '1 yr' : `${y} yrs`;
  return `${y} yr${y !== 1 ? 's' : ''} ${m} mo`;
}

// Tech skill names are often written interchangeably with/without periods
// (Next.js vs NextJS, Node.js vs NodeJS) — drop periods on both sides before
// matching so a JD's "NextJS" recognizes a resume's "Next.js".
const dropDots = (s: string) => s.replace(/\./g, '');

// Single-edit distance — cheap enough at resume scale and exactly the
// tolerance needed for one-letter spelling drift ("PostgresSQL" vs
// "PostgreSQL", "Kuberentes" vs "Kubernetes") without risking false positives
// between genuinely different short skill names ("Go" vs "C", "R" vs "Go").
function levenshteinAtMost1(a: string, b: string): boolean {
  if (a === b) return true;
  const lenDiff = a.length - b.length;
  if (lenDiff < -1 || lenDiff > 1) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0, j = 0, edits = 0;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (shorter.length === longer.length) { i++; j++; } // substitution
    else j++; // insertion/deletion in the longer string
  }
  edits += (longer.length - j);
  return edits <= 1;
}

function matchSkills(text: string, skills: string[]): string[] {
  const lower = dropDots(text.toLowerCase());
  const words = lower.match(/[a-z0-9+#]+/g) || [];
  const wordSet = new Set(words);

  return skills.filter(skill => {
    const s = dropDots(skill.toLowerCase().trim());
    if (!s) return false;
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[^a-z0-9+#])${escaped}(?:[^a-z0-9+#]|$)`, 'i');
    if (re.test(lower)) return true;

    // Fuzzy fallback for longer single-word skill names — JDs and resumes
    // disagree on spelling ("PostgresSQL" vs "PostgreSQL") far more often than
    // they describe genuinely different technologies that happen to be one
    // letter apart, so this only kicks in past the length where that holds.
    if (s.length >= 6 && !/[\s/]/.test(s)) {
      for (const w of wordSet) {
        if (Math.abs(w.length - s.length) <= 1 && levenshteinAtMost1(w, s)) return true;
      }
    }
    return false;
  });
}

// "Listed in a skills box" and "actually built something with it" are very
// different signals for a recruiter — a JD asking for Kubernetes isn't really
// satisfied by a resume that names it once with nothing behind it. This treats
// a skill as practically demonstrated only when its mention sits near language
// that describes doing real work with it (built/used/deployed/"Tech Stack:"/
// "project", etc.), not merely appearing anywhere on the page.
const PRACTICAL_CUE_RE = /\b(built|build|develop(?:ed|ing|er)?|implement(?:ed|ing|ation)?|creat(?:ed|ing|or)|design(?:ed|ing|er)?|architect(?:ed|ing|ure)?|deploy(?:ed|ing|ment)?|engineer(?:ed|ing)?|integrat(?:ed|ion|ing)?|migrat(?:ed|ion|ing)?|automat(?:ed|ion|ing)?|optimi[sz](?:ed|ation|ing)?|maintain(?:ed|ing|ence)?|wrote|written|writing|work(?:ed|ing)?|us(?:ed|ing)|utili[sz](?:ed|ing)?|\bled\b|lead(?:ing)?|manag(?:ed|ing|ement)?|collaborat(?:ed|ion|ing)?|contribut(?:ed|ion|ing)?|tech\s*stack|stack\s*[:\-]|project[s]?|application[s]?|platform[s]?|system[s]?|feature[s]?|module[s]?|pipeline[s]?|api[s]?|service[s]?|product[s]?|website[s]?|dashboard[s]?|tool(?:ed|ing|s)?)\b/i;

function hasPracticalEvidence(lowerText: string, skill: string): boolean {
  const s = dropDots(skill.toLowerCase().trim());
  if (!s) return false;
  const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|[^a-z0-9+#])${escaped}(?:[^a-z0-9+#]|$)`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(lowerText)) !== null) {
    const windowStart = Math.max(0, m.index - 100);
    const windowEnd = Math.min(lowerText.length, m.index + m[0].length + 100);
    if (PRACTICAL_CUE_RE.test(lowerText.slice(windowStart, windowEnd))) return true;
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  return false;
}

// Surfaces concrete, JD-relevant standout signals — certifications, awards,
// hackathon wins, publications — so "extra achievements" in the assessment
// trace back to literal text on the resume rather than a vibe.
const ACHIEVEMENT_CUE_RE = /\b(certified|certifications?|certificate[ds]?|award(?:ed|s)?|winner|won\b|hackathon|patent(?:ed|s)?|publish(?:ed)?|publications?|scholarships?|rank(?:ed)?\s*#?\d|top\s+\d+\s*%|honou?rs?|dean'?s\s+list|gold\s+medal|silver\s+medal|bronze\s+medal|first\s+place|merit\b|distinction|finalist|semi-?finalist|\d+(?:st|nd|rd|th)\s+(?:place|rank|position))\b/i;
const ACHIEVEMENT_HEADER_ONLY_RE = /^(certificates?|certifications?|awards?|achievements?|honou?rs?|accolades|publications?|patents?|recognition[s]?)$/i;

function extractAchievements(text: string): string[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (ACHIEVEMENT_HEADER_ONLY_RE.test(line)) continue;
    if (line.length < 12 || line.length > 160) continue;
    if (!ACHIEVEMENT_CUE_RE.test(line)) continue;
    const cleaned = line.replace(/^[•\-*•●‣]\s*/, '').trim();
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= 4) break;
  }
  return out;
}

const DEGREE_LEVELS: [RegExp, number][] = [
  [/\bph\.?d\.?\b|doctorate/i, 3],
  [/\bmaster'?s?\b|\bm\.?sc\.?\b|\bm\.?s\.?\b|\bmba\b|\bm\.?tech\b|\bm\.?eng\b/i, 2],
  [/\bbachelor'?s?\b|\bb\.?sc\.?\b|\bb\.?s\.?\b|\bb\.?tech\b|\bb\.?e\.?\b/i, 1],
];

function detectEducationLevel(text: string): number {
  let level = 0;
  for (const [re, val] of DEGREE_LEVELS) {
    if (re.test(text)) level = Math.max(level, val);
  }
  return level;
}

function requiredEducationLevel(requirement: string): number | null {
  if (!requirement) return null;
  if (/phd/i.test(requirement)) return 3;
  if (/master/i.test(requirement)) return 2;
  if (/bachelor/i.test(requirement)) return 1;
  if (/bootcamp|self-taught/i.test(requirement)) return 0;
  return null;
}

function scoreEducation(text: string, requirement: string): number {
  const candidateLevel = detectEducationLevel(text);
  const required = requiredEducationLevel(requirement);
  if (required === null) return candidateLevel > 0 ? 85 : 60;
  const diff = candidateLevel - required;
  if (diff >= 0) return 95;
  if (diff === -1) return 65;
  return 40;
}

function parseLevelRange(level: string): { min: number; max: number } | null {
  const m = level.match(/\((\d+)(?:\s*[–—-]\s*(\d+))?\+?\s*yrs?\)/i);
  if (!m) return null;
  return { min: parseInt(m[1], 10), max: m[2] ? parseInt(m[2], 10) : Infinity };
}

// When the job level doesn't include an explicit year range like "(5-8 yrs)",
// infer a reasonable band from seniority keywords so experience scoring stays
// meaningful instead of falling back to an uncalibrated linear formula.
function inferLevelYears(level: string): { min: number; max: number } | null {
  if (!level) return null;
  if (/junior|entry[\s-]?level?|jr\.?\b|fresher/i.test(level)) return { min: 0, max: 2 };
  if (/\bmid[\s-]?(level)?\b|\bintermediate\b/i.test(level)) return { min: 2, max: 5 };
  if (/\bsenior\b|\bsr\.?\b/i.test(level)) return { min: 5, max: 10 };
  if (/\blead\b|\bprincipal\b|\bstaff\b/i.test(level)) return { min: 7, max: 15 };
  if (/\bmanager\b|\bdirector\b|\bvp\b/i.test(level)) return { min: 8, max: 20 };
  return null;
}

function scoreExperience(years: number, level: string): number {
  const range = parseLevelRange(level) ?? inferLevelYears(level);
  if (!range) return Math.min(95, 40 + years * 8);
  if (years >= range.min && years <= range.max + 2) return 95;
  if (years > range.max + 2) return 88;
  const gap = range.min - years;
  return Math.max(20, 95 - gap * 18);
}

// A skill that's actually been put to work counts for more than one that's
// merely named — this is where "check whether work has been done on those
// skills" actually changes the number, not just the narrative around it.
const PRACTICAL_WEIGHT = 1;
const LISTED_ONLY_WEIGHT = 0.65;

function weightedSkillScore(required: string[], matched: string[], practical: Set<string>): number | null {
  if (!required.length) return null;
  const matchedLower = new Set(matched.map(m => m.toLowerCase()));
  let sum = 0;
  for (const skill of required) {
    const key = skill.toLowerCase();
    if (!matchedLower.has(key)) continue;
    sum += practical.has(key) ? PRACTICAL_WEIGHT : LISTED_ONLY_WEIGHT;
  }
  return Math.round((sum / required.length) * 100);
}

export function getRecommendation(score: number): string {
  if (score >= 88) return 'Strongly Recommend';
  if (score >= 75) return 'Recommend';
  if (score >= 65) return 'Consider';
  return 'Not Recommended';
}

export function analyzeResume(text: string, filename: string, job: JobLike): ResumeAnalysis {
  const cleaned = text.replace(/[ ]/g, ' ').trim();

  const name = extractName(cleaned, filename);
  const email = extractEmail(cleaned);
  const phone = extractPhone(cleaned);
  const { location, confidence: locationConfidence } = extractLocation(cleaned, name, email, phone);
  const experience = extractExperience(cleaned);

  const requiredSkills = job.requiredSkills || [];
  const niceToHaveSkills = job.niceToHaveSkills || [];
  const matchedRequired = matchSkills(cleaned, requiredSkills);
  const matchedNice = matchSkills(cleaned, niceToHaveSkills);
  const skills = [...matchedRequired, ...matchedNice];

  const lowerCleaned = dropDots(cleaned.toLowerCase());
  const practicalSkills = skills.filter(skill => hasPracticalEvidence(lowerCleaned, skill));
  const practicalSet = new Set(practicalSkills.map(s => s.toLowerCase()));
  const achievements = extractAchievements(cleaned);

  let skillsMatch = 0;
  const requiredScore = weightedSkillScore(requiredSkills, matchedRequired, practicalSet);
  const niceScore = weightedSkillScore(niceToHaveSkills, matchedNice, practicalSet);
  if (requiredScore !== null && niceScore !== null) skillsMatch = Math.round(requiredScore * 0.7 + niceScore * 0.3);
  else if (requiredScore !== null) skillsMatch = requiredScore;
  else if (niceScore !== null) skillsMatch = niceScore;

  const educationMatch = scoreEducation(cleaned, job.education || '');
  const experienceMatch = scoreExperience(experience, job.level || '');
  let score = Math.round(skillsMatch * 0.4 + educationMatch * 0.2 + experienceMatch * 0.4);

  // Domain-mismatch hard floor: when a role defines 3+ required skills but the
  // candidate matches fewer than 20% of them, education and experience alone
  // cannot compensate — a non-tech candidate for a tech role should never
  // score above "Not Recommended" just because their years on paper look right.
  if (requiredSkills.length >= 3 && skillsMatch < 20) {
    score = Math.min(score, 48);
  }

  return {
    name,
    email,
    phone,
    location,
    locationConfidence,
    experience,
    skills,
    practicalSkills,
    achievements,
    skillsMatch,
    educationMatch,
    score,
    recommendation: getRecommendation(score),
  };
}

// ── Re-application detection ──
//
// A resume re-uploaded for a job the same person already applied to is only a
// genuine duplicate when NEITHER side of the application has materially moved:
// the JD they're applying against reads the same, AND their own profile
// (experience/skills/achievements) reads the same. Reordering the same list of
// skills, or a JD whose unrelated metadata changed but whose actual ask didn't,
// must NOT count as "different" — only a concrete, substantive change should
// unlock a fresh application. Both fingerprints below are built from
// order-independent, normalized sets for exactly that reason.

interface JdLike {
  title?: string;
  description?: string;
  requiredSkills?: string[];
  niceToHaveSkills?: string[];
  education?: string;
  level?: string;
}

const normText = (s?: string) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const normSet = (arr?: string[]) => [...new Set((arr || []).map(normText).filter(Boolean))].sort();

// Deterministic, dependency-free fingerprint (FNV-1a) — small, stable across
// runs, and order-independent thanks to the normalized/sorted inputs above. A
// real crypto hash would be overkill for "did this JD's substance change".
function fingerprint(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// Captures the substance of a JD — what it's actually asking for — not its
// formatting or field order. Two JDs that ask for the same things in a
// different order, or with re-flowed whitespace, fingerprint identically.
export function jdFingerprint(job: JdLike): string {
  return fingerprint(JSON.stringify({
    title: normText(job.title),
    description: normText(job.description),
    requiredSkills: normSet(job.requiredSkills),
    niceToHaveSkills: normSet(job.niceToHaveSkills),
    education: normText(job.education),
    level: normText(job.level),
  }));
}

interface ProfileLike {
  experience?: number;
  skills?: string[];
  practicalSkills?: string[];
  achievements?: string[];
}

const sameSet = (a?: string[], b?: string[]): boolean => {
  const sa = normSet(a);
  const sb = normSet(b);
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
};

// True when the new resume reads as a concretely different profile from the
// one already on file — not just the same facts in a different order. A
// rounding-level experience wobble or a reshuffled skill list doesn't count;
// an actual gain/loss of skills, achievements, or a real seniority shift does.
export function hasMeaningfulProfileChange(existing: ProfileLike, incoming: ProfileLike): boolean {
  if (Math.abs((existing.experience ?? 0) - (incoming.experience ?? 0)) >= 1) return true;
  if (!sameSet(existing.skills, incoming.skills)) return true;
  if (!sameSet(existing.practicalSkills, incoming.practicalSkills)) return true;
  if (!sameSet(existing.achievements, incoming.achievements)) return true;
  return false;
}
