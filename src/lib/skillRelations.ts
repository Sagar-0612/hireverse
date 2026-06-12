// A required skill that's never named on a resume isn't always a clean "0" —
// someone who's worked with Node.js almost certainly has REST API exposure
// even if they never wrote the words "REST API". This is a curated,
// inspectable map from a skill to the *other* skills whose presence on a
// resume is reasonable evidence of related working knowledge. It covers both
// IT (web/mobile/data/devops/QA) and common non-IT domains (sales, marketing,
// accounting, HR, design) since job postings span both.
//
// Keys and values are normalized (lowercase, dots stripped) via `normSkill`.
// The map is intentionally conservative — only genuinely adjacent/overlapping
// skills, not "anything in the same industry".
export const SKILL_RELATIONS: Record<string, string[]> = {
  // ── Web / JS ecosystem ──
  'rest api': ['nodejs', 'express', 'expressjs', 'django', 'flask', 'fastapi', 'spring boot', 'spring', 'aspnet', 'net core', 'laravel', 'ruby on rails', 'php'],
  'graphql': ['apollo', 'nodejs', 'react', 'express'],
  'nodejs': ['javascript', 'express', 'npm', 'typescript', 'rest api'],
  'express': ['nodejs', 'javascript', 'rest api'],
  'expressjs': ['nodejs', 'javascript', 'rest api'],
  'javascript': ['typescript', 'react', 'nodejs', 'jquery', 'vue', 'angular'],
  'typescript': ['javascript', 'angular', 'react', 'nodejs'],
  'react': ['javascript', 'redux', 'jsx', 'nextjs', 'typescript'],
  'redux': ['react', 'javascript'],
  'nextjs': ['react', 'javascript', 'typescript'],
  'vue': ['javascript', 'vuex', 'vuejs'],
  'vuejs': ['javascript', 'vuex', 'vue'],
  'angular': ['typescript', 'javascript'],
  'html': ['css', 'bootstrap', 'html5'],
  'css': ['html', 'sass', 'scss', 'tailwind', 'bootstrap', 'css3'],
  'sass': ['css', 'scss'],
  'scss': ['css', 'sass'],
  'tailwind': ['css', 'html'],
  'bootstrap': ['css', 'html'],
  'jquery': ['javascript', 'html'],

  // ── Databases ──
  'sql': ['mysql', 'postgresql', 'postgres', 'sql server', 'oracle', 'sqlite'],
  'mysql': ['sql', 'mariadb'],
  'postgresql': ['sql', 'mysql', 'postgres'],
  'postgres': ['sql', 'mysql', 'postgresql'],
  'mongodb': ['mongoose', 'nosql'],
  'mongoose': ['mongodb', 'nodejs'],
  'nosql': ['mongodb', 'redis', 'cassandra', 'dynamodb'],
  'redis': ['nosql', 'caching'],

  // ── DevOps / Cloud ──
  'docker': ['kubernetes', 'containerization', 'cicd'],
  'kubernetes': ['docker', 'containerization'],
  'cicd': ['jenkins', 'github actions', 'gitlab ci', 'docker'],
  'jenkins': ['cicd', 'devops'],
  'aws': ['cloud', 'ec2', 's3', 'azure', 'gcp'],
  'azure': ['cloud', 'aws'],
  'gcp': ['cloud', 'aws', 'google cloud'],
  'google cloud': ['cloud', 'aws', 'gcp'],
  'git': ['github', 'gitlab', 'version control'],
  'linux': ['bash', 'shell scripting'],
  'terraform': ['aws', 'azure', 'devops', 'infrastructure as code'],

  // ── Python / Data ──
  'python': ['django', 'flask', 'pandas', 'numpy', 'fastapi'],
  'django': ['python', 'rest api'],
  'flask': ['python', 'rest api'],
  'fastapi': ['python', 'rest api'],
  'pandas': ['python', 'numpy', 'data analysis'],
  'numpy': ['python', 'pandas'],
  'machine learning': ['python', 'tensorflow', 'pytorch', 'scikit-learn', 'data science'],
  'tensorflow': ['python', 'machine learning'],
  'pytorch': ['python', 'machine learning'],
  'data analysis': ['excel', 'python', 'sql', 'pandas'],
  'data science': ['python', 'machine learning', 'pandas', 'sql'],

  // ── Java ecosystem ──
  'java': ['spring', 'spring boot', 'hibernate'],
  'spring': ['java', 'rest api', 'hibernate', 'spring boot'],
  'spring boot': ['java', 'rest api', 'hibernate', 'spring'],
  'hibernate': ['java', 'sql'],

  // ── .NET / PHP / Ruby ──
  'c#': ['net', 'aspnet', 'net core', 'sql server'],
  'net': ['c#', 'rest api', 'aspnet'],
  'net core': ['c#', 'rest api', 'aspnet'],
  'aspnet': ['c#', 'rest api', 'net'],
  'php': ['laravel', 'mysql', 'wordpress'],
  'laravel': ['php', 'rest api'],
  'ruby': ['ruby on rails'],
  'ruby on rails': ['ruby', 'rest api'],

  // ── Mobile ──
  'react native': ['react', 'javascript', 'mobile development'],
  'flutter': ['dart', 'mobile development'],
  'swift': ['ios', 'xcode'],
  'kotlin': ['android', 'java'],
  'android': ['kotlin', 'java'],
  'ios': ['swift', 'xcode'],

  // ── QA / Testing ──
  'selenium': ['automation testing', 'java', 'python'],
  'automation testing': ['selenium', 'cypress', 'jest', 'qa'],
  'manual testing': ['qa', 'test cases'],
  'jest': ['javascript', 'react', 'unit testing'],
  'cypress': ['javascript', 'automation testing'],
  'unit testing': ['jest', 'junit', 'pytest'],

  // ── Project management ──
  'agile': ['scrum', 'jira'],
  'scrum': ['agile', 'jira'],
  'jira': ['agile', 'scrum', 'project management'],

  // ── Sales / Marketing ──
  'crm': ['salesforce', 'hubspot', 'zoho crm'],
  'salesforce': ['crm'],
  'lead generation': ['crm', 'cold calling', 'sales'],
  'seo': ['google analytics', 'content marketing', 'digital marketing'],
  'google ads': ['ppc', 'digital marketing', 'seo'],
  'content marketing': ['seo', 'copywriting', 'social media marketing'],
  'social media marketing': ['content marketing', 'digital marketing'],
  'email marketing': ['digital marketing', 'mailchimp'],
  'digital marketing': ['seo', 'google ads', 'social media marketing', 'content marketing', 'email marketing'],

  // ── Accounting / Finance ──
  'excel': ['google sheets', 'data analysis', 'ms office'],
  'tally': ['accounting', 'bookkeeping', 'gst'],
  'bookkeeping': ['tally', 'quickbooks', 'accounting'],
  'gst': ['tally', 'accounting', 'taxation'],
  'quickbooks': ['bookkeeping', 'accounting'],
  'financial analysis': ['excel', 'accounting'],
  'accounting': ['tally', 'quickbooks', 'bookkeeping'],

  // ── HR ──
  'recruitment': ['hrms', 'talent acquisition', 'sourcing'],
  'hrms': ['recruitment', 'payroll'],
  'payroll': ['hrms', 'accounting'],
  'onboarding': ['hrms', 'recruitment'],

  // ── Customer support ──
  'customer support': ['crm', 'zendesk', 'communication'],
  'zendesk': ['customer support', 'crm'],

  // ── Design ──
  'figma': ['uiux design', 'adobe xd', 'sketch'],
  'uiux design': ['figma', 'adobe xd', 'wireframing', 'sketch'],
  'adobe xd': ['figma', 'uiux design'],
  'photoshop': ['graphic design', 'adobe illustrator'],

  // ── DevOps / Cloud-native (extended) ──
  'ci/cd': ['jenkins', 'github actions', 'gitlab ci', 'cicd', 'docker'],
  'github actions': ['cicd', 'ci/cd', 'devops'],
  'gitlab ci': ['cicd', 'ci/cd', 'devops', 'gitlab'],
  'ansible': ['devops', 'terraform', 'linux'],
  'infrastructure as code': ['terraform', 'ansible', 'cloud'],
  'helm': ['kubernetes', 'docker'],
  'prometheus': ['grafana', 'monitoring', 'kubernetes'],
  'grafana': ['prometheus', 'monitoring'],
  'monitoring': ['prometheus', 'grafana', 'devops'],
  'nginx': ['linux', 'devops', 'load balancing'],
  'cloud': ['aws', 'azure', 'gcp'],

  // ── Messaging / data infra ──
  'kafka': ['microservices', 'event-driven architecture', 'rabbitmq'],
  'rabbitmq': ['kafka', 'microservices', 'message queue'],
  'message queue': ['kafka', 'rabbitmq'],
  'elasticsearch': ['search', 'logstash', 'kibana', 'nosql'],
  'microservices': ['docker', 'kubernetes', 'rest api', 'kafka', 'grpc'],
  'grpc': ['microservices', 'protobuf'],
  'websockets': ['socketio', 'nodejs', 'real-time'],
  'socketio': ['websockets', 'nodejs', 'javascript'],

  // ── Frontend tooling ──
  'webpack': ['javascript', 'frontend build tools', 'babel'],
  'vite': ['javascript', 'frontend build tools', 'react', 'vue'],
  'babel': ['javascript', 'webpack'],
  'storybook': ['react', 'vue', 'uiux design'],

  // ── Backend / data extras ──
  'firebase': ['nosql', 'mobile development', 'cloud'],
  'supabase': ['postgresql', 'sql', 'firebase'],
  'scikit-learn': ['python', 'machine learning', 'pandas'],
  'data engineering': ['python', 'sql', 'spark', 'airflow'],
  'spark': ['python', 'data engineering', 'big data'],
  'airflow': ['python', 'data engineering'],

  // ── Mobile (extended) ──
  'mobile development': ['android', 'ios', 'react native', 'flutter'],
  'dart': ['flutter', 'mobile development'],
  'xcode': ['ios', 'swift'],
};

// Same normalization as resumeAnalysis's `dropDots` + lowercase — keeps both
// the lexicon's keys and the skill names coming from job postings comparable
// regardless of "Node.js" vs "NodeJS" vs "node js" style differences.
const normSkill = (s: string) => s.toLowerCase().replace(/\./g, '').trim();

// Mirrors matchSkills' word-boundary regex (and its trailing-"s" tolerance,
// e.g. "REST API" vs "REST APIs") so a related skill name only counts when it
// appears as its own token, not as a substring of something else (e.g. "java"
// shouldn't match inside "javascript").
function appearsInText(lowerText: string, term: string): boolean {
  const t = normSkill(term);
  if (!t) return false;
  const base = t.length >= 5 && t.endsWith('s') ? t.slice(0, -1) : t;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|[^a-z0-9+#])${escaped}s?(?:[^a-z0-9+#]|$)`, 'i');
  return re.test(lowerText);
}

// Returns the first related skill found in the resume text for a required
// skill that wasn't matched directly — e.g. given "REST API" and a resume
// that mentions Node.js, returns "Node.js" (original casing from the lexicon
// value, title-cased for display) so the gap can read "Node.js suggests
// working knowledge of REST API" rather than a bare boolean.
export function findRelatedEvidence(lowerText: string, skill: string): string | null {
  const key = normSkill(skill);
  // Job postings often pluralize ("REST APIs", "Web Services") while the
  // lexicon's keys are singular ("rest api") — fall back to a singularized
  // key so plural/singular phrasing of the same skill still resolves.
  const related = SKILL_RELATIONS[key] || SKILL_RELATIONS[key.replace(/s$/, '')];
  if (!related) return null;
  for (const candidate of related) {
    if (appearsInText(lowerText, candidate)) {
      return candidate;
    }
  }
  return null;
}
