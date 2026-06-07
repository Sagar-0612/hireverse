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

const NAME_NOISE = /resume|curriculum|vitae|\bcv\b|address|objective|summary|profile|contact|linkedin|github|http|www\.|email|phone|@/i;

function extractName(text: string, filename: string): string {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 15);
  for (const line of lines) {
    if (NAME_NOISE.test(line)) continue;
    if (/\d/.test(line)) continue;
    if (line.length > 40) continue;
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) continue;
    const looksLikeName = words.every(w => /^[A-Z][a-zA-Z'.-]*$/.test(w) || /^[A-Z]{2,}$/.test(w));
    if (looksLikeName) {
      return words
        .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
  }
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
// "City, Country" / "City, Region" — still a comma-separated place, but the
// second part isn't a tidy two-letter code so it's read with less certainty.
const LOCATION_LOOSE = /^[A-Z][a-zA-Z.\s]{1,30},\s?[A-Z][a-zA-Z\s]{2,24}$/;
const LOCATION_LABELED = /(?:location|address|based\s+in|residing\s+in|city)\s*[:\-]\s*([A-Z][a-zA-Z,.\s]{2,40})/i;
// Bare single/double-word capitalized line — could be a city, could easily be
// a job title or section header, hence the lowest confidence tier.
const LOCATION_BARE = /^[A-Z][a-zA-Z.]{2,20}(?:\s[A-Z][a-zA-Z.]{2,20})?$/;
const TITLE_NOISE = /engineer|manager|developer|designer|analyst|specialist|lead|director|intern|consultant|architect|founder|officer|scientist|administrator|coordinator|executive/i;

function extractLocation(text: string): { location: string; confidence: LocationConfidence } {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 12);
  const clean = (l: string) => l.replace(/[|•].*$/, '').trim();
  const isNoisy = (l: string) => /@|\d{4,}|https?:/i.test(l);

  for (const line of lines) {
    if (isNoisy(line) || line.length >= 60) continue;
    const c = clean(line);
    if (LOCATION_STRICT.test(c)) return { location: c, confidence: 'high' };
  }

  for (const line of lines) {
    if (isNoisy(line) || line.length >= 60) continue;
    const c = clean(line);
    if (LOCATION_LOOSE.test(c)) return { location: c, confidence: 'medium' };
  }

  const labeled = text.match(LOCATION_LABELED);
  if (labeled) {
    const value = clean(labeled[1].split(/[\n\r]/)[0]);
    if (value.length > 1 && value.length < 60) return { location: value, confidence: 'medium' };
  }

  for (const line of lines.slice(0, 6)) {
    if (isNoisy(line) || line.length >= 35 || TITLE_NOISE.test(line)) continue;
    const c = clean(line);
    if (LOCATION_BARE.test(c)) return { location: c, confidence: 'low' };
  }

  return { location: 'Location Not Found', confidence: 'none' };
}

const DAY = '\\d{1,2}\\s+';
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?\\s+';
// Matches "2019 - 2023", "Mar 2019 - Present", and "10 Sept. 2019 - 13 May 2023"
const RANGE_RE = new RegExp(`(?:${DAY})?(?:${MONTH})?(\\d{4})\\s*(?:[-–—]|to)\\s*(?:${DAY})?(?:${MONTH})?(present|current|now|\\d{4})`, 'gi');

// Resumes contain "YYYY - YYYY" ranges for both jobs and degrees. PDF text
// extraction also frequently scrambles section ordering in multi-column
// layouts, so instead of trusting section headers we classify each date range
// individually by whether education-related words appear right around it.
const EDU_NEARBY_RE = /\b(university|college|institute|polytechnic|academy|school|bachelor'?s?|master'?s?|b\.?\s?tech|m\.?\s?tech|b\.?\s?sc|m\.?\s?sc|b\.?\s?e\b|phd|ph\.?d\.?|doctorate|diploma|degree)\b/i;

function extractExperience(text: string): number {
  const explicit = text.match(/(\d{1,2})\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:professional\s+|relevant\s+|total\s+|work(?:ing)?\s+)?experience/i);
  if (explicit) {
    const years = parseInt(explicit[1], 10);
    if (years > 0 && years <= 50) return years;
  }

  const currentYear = new Date().getFullYear();
  let earliest = Infinity;
  let latest = -Infinity;
  let m: RegExpExecArray | null;
  RANGE_RE.lastIndex = 0;
  while ((m = RANGE_RE.exec(text)) !== null) {
    const windowStart = Math.max(0, m.index - 60);
    const windowEnd = Math.min(text.length, m.index + m[0].length + 30);
    if (EDU_NEARBY_RE.test(text.slice(windowStart, windowEnd))) continue;

    const start = parseInt(m[1], 10);
    const endRaw = m[2].toLowerCase();
    const end = /present|current|now/.test(endRaw) ? currentYear : parseInt(endRaw, 10);
    if (start >= 1960 && start <= currentYear) earliest = Math.min(earliest, start);
    if (end >= 1960 && end <= currentYear) latest = Math.max(latest, end);
  }
  if (earliest !== Infinity && latest !== -Infinity && latest > earliest) {
    return Math.min(latest - earliest, 45);
  }
  return 0;
}

// Tech skill names are often written interchangeably with/without periods
// (Next.js vs NextJS, Node.js vs NodeJS) — drop periods on both sides before
// matching so a JD's "NextJS" recognizes a resume's "Next.js".
const dropDots = (s: string) => s.replace(/\./g, '');

function matchSkills(text: string, skills: string[]): string[] {
  const lower = dropDots(text.toLowerCase());
  return skills.filter(skill => {
    const s = dropDots(skill.toLowerCase().trim());
    if (!s) return false;
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[^a-z0-9+#])${escaped}(?:[^a-z0-9+#]|$)`, 'i');
    return re.test(lower);
  });
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

function scoreExperience(years: number, level: string): number {
  const range = parseLevelRange(level);
  if (!range) return Math.min(95, 40 + years * 8);
  if (years >= range.min && years <= range.max + 2) return 95;
  if (years > range.max + 2) return 88;
  const gap = range.min - years;
  return Math.max(25, 95 - gap * 18);
}

export function getRecommendation(score: number): string {
  if (score >= 88) return 'Strongly Recommend';
  if (score >= 75) return 'Recommend';
  if (score >= 65) return 'Consider';
  return 'Not Recommended';
}

export function analyzeResume(text: string, filename: string, job: JobLike): ResumeAnalysis {
  const cleaned = text.replace(/[  ]/g, ' ').trim();

  const name = extractName(cleaned, filename);
  const email = extractEmail(cleaned);
  const phone = extractPhone(cleaned);
  const { location, confidence: locationConfidence } = extractLocation(cleaned);
  const experience = extractExperience(cleaned);

  const requiredSkills = job.requiredSkills || [];
  const niceToHaveSkills = job.niceToHaveSkills || [];
  const matchedRequired = matchSkills(cleaned, requiredSkills);
  const matchedNice = matchSkills(cleaned, niceToHaveSkills);
  const skills = [...matchedRequired, ...matchedNice];

  let skillsMatch = 0;
  const requiredScore = requiredSkills.length ? (matchedRequired.length / requiredSkills.length) * 100 : null;
  const niceScore = niceToHaveSkills.length ? (matchedNice.length / niceToHaveSkills.length) * 100 : null;
  if (requiredScore !== null && niceScore !== null) skillsMatch = Math.round(requiredScore * 0.7 + niceScore * 0.3);
  else if (requiredScore !== null) skillsMatch = Math.round(requiredScore);
  else if (niceScore !== null) skillsMatch = Math.round(niceScore);

  const educationMatch = scoreEducation(cleaned, job.education || '');
  const experienceMatch = scoreExperience(experience, job.level || '');
  const score = Math.round(skillsMatch * 0.4 + educationMatch * 0.2 + experienceMatch * 0.4);

  return {
    name,
    email,
    phone,
    location,
    locationConfidence,
    experience,
    skills,
    skillsMatch,
    educationMatch,
    score,
    recommendation: getRecommendation(score),
  };
}
