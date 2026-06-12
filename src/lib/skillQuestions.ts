// A curated, per-skill question bank so interview guides ask things an actual
// interviewer would ask about *that* technology — not a templated sentence
// with the skill name swapped in. Each skill has a 6-question ladder ordered
// roughly from foundational to advanced; getSkillQuestions() picks a window
// based on the candidate's experience level, so a junior candidate gets
// concept/fundamentals questions while a senior candidate gets
// design-tradeoff/debugging/architecture questions on the same topic.

export type CandidateLevel = 'junior' | 'mid' | 'senior';

// <2 years -> junior, 2-5 -> mid, 5+ -> senior. Used to pick which slice of
// each skill's question ladder to surface.
export function levelFromExperience(years: number): CandidateLevel {
  if (years >= 5) return 'senior';
  if (years >= 2) return 'mid';
  return 'junior';
}

// Each array is 6 questions, ordered easiest -> hardest.
const BANK: Record<string, string[]> = {
  javascript: [
    "What's the difference between `var`, `let`, and `const`, and when would you use each?",
    'Explain how closures work in JavaScript — can you give an example from something you\'ve built?',
    "Walk me through how `this` behaves differently in a regular function vs. an arrow function.",
    'How does the JavaScript event loop handle asynchronous code — what\'s the difference between a microtask and a macrotask?',
    "Describe a performance issue you've debugged in a JS application and how you tracked it down.",
    "How would you implement debouncing or throttling, and where have you needed it in a real feature?",
  ],
  typescript: [
    "What advantages does TypeScript give you over plain JavaScript, in your own words?",
    "Explain the difference between an `interface` and a `type` — when would you pick one over the other?",
    "How do generics work in TypeScript, and can you give an example where you've used one?",
    "What's the difference between `unknown` and `any`, and why does it matter for type safety?",
    "Describe how you'd type a complex API response with optional/nested fields, and how you'd narrow those types safely.",
    "How would you migrate a medium-sized JavaScript codebase to TypeScript incrementally without breaking things?",
  ],
  nodejs: [
    "What is Node.js, and how does its non-blocking I/O model differ from a traditional multi-threaded server?",
    "Walk me through how you've structured a REST API in Node — routing, middleware, error handling.",
    "How do you handle errors in async/await code, and what happens if a promise rejection goes unhandled?",
    "How would you handle a CPU-intensive task in Node without blocking the event loop?",
    "Describe how you've handled authentication/authorization (e.g. JWT, sessions) in a Node app, including a tricky edge case.",
    "How would you design a Node service to handle thousands of concurrent connections — what would you monitor, and what breaks first?",
  ],
  express: [
    "What is middleware in Express, and can you describe the request/response lifecycle through a few middleware functions?",
    "How do you handle errors centrally in an Express app?",
    "Walk me through how you'd structure routes/controllers for a medium-sized Express API.",
    "How would you validate and sanitize incoming request data in Express?",
    "Describe how you've secured an Express API (rate limiting, CORS, helmet, auth) in a real project.",
    "How would you structure a large Express codebase to keep routes, validation, and business logic decoupled and testable?",
  ],
  react: [
    "What's the difference between state and props in React?",
    "Explain how `useEffect` works — what's the dependency array for, and what's a mistake you've made with it?",
    "Walk me through how you'd lift state up or share state between sibling components.",
    "How do you optimize a React app that's re-rendering too often — what tools/techniques have you used?",
    "Describe a complex component or feature you built — how did you structure state, side effects, and component boundaries?",
    "How would you decide between local component state, server state (e.g. React Query), and global state for a given piece of data?",
  ],
  redux: [
    "What problem does Redux solve that React's built-in state doesn't?",
    "Walk me through the flow of an action from dispatch to the store updating and the UI re-rendering.",
    "What's a reducer, and why must it be a pure function?",
    "How have you handled async logic in Redux (thunks, sagas, RTK Query)?",
    "Describe a time Redux added complexity you didn't need — how did you simplify it (or would you, with hindsight)?",
    "How would you structure a large Redux store to avoid deeply nested state and excessive re-renders?",
  ],
  angular: [
    "What's the difference between a component and a service in Angular?",
    "Explain dependency injection in Angular — how does it work and why is it useful?",
    "Walk me through how data binding works (one-way vs. two-way) with an example.",
    "How do you handle HTTP calls and error handling using Angular's HttpClient?",
    "Describe how you've optimized change detection in a larger Angular app.",
    "How would you structure a large Angular app into feature modules, and how do you handle lazy loading?",
  ],
  vue: [
    "What's the difference between Vue's Options API and Composition API?",
    "Explain reactivity in Vue — how does Vue know when to re-render a component?",
    "Walk me through how you'd pass data between a parent and child component, and emit an event back up.",
    "How have you managed shared/global state in a Vue app (Vuex/Pinia)?",
    "Describe a performance issue in a Vue app you've diagnosed and fixed.",
    "How would you structure a large Vue app — component organization, composables, and state boundaries?",
  ],
  nextjs: [
    "What's the difference between server-side rendering, static generation, and client-side rendering in Next.js, and when would you use each?",
    "Walk me through how routing works in the Next.js you've used (pages or app router).",
    "How do you fetch data in a Next.js page, and how do you handle loading/error states?",
    "How have you handled SEO and metadata in a Next.js app?",
    "Describe a deployment or build issue you've run into with Next.js and how you resolved it.",
    "How would you decide what should be a Server Component vs. a Client Component in a Next.js app?",
  ],
  html: [
    "What's the difference between a `<div>` and a semantic element like `<section>` or `<article>`, and why does it matter?",
    "How do you structure a form to be accessible — labels, ARIA attributes, keyboard navigation?",
    "Walk me through how you'd make sure a page is responsive across screen sizes.",
    "What's the difference between `id` and `class`, and how does that affect styling and JS hooks?",
    "Describe an accessibility issue you've fixed on a real page.",
    "How would you structure markup so a multi-step form works well with screen readers and keyboard-only navigation?",
  ],
  css: [
    "Explain the difference between Flexbox and Grid — when would you reach for each?",
    "What is the CSS box model, and how does `box-sizing: border-box` change it?",
    "How does CSS specificity work, and how do you avoid specificity wars in a large codebase?",
    "Walk me through how you'd implement a responsive layout without a framework.",
    "Describe a layout bug you've debugged and how you found the root cause.",
    "How would you architect CSS for a large app to avoid conflicts and keep it maintainable (e.g. BEM, CSS modules, utility classes)?",
  ],
  'rest api': [
    "What makes an API \"RESTful\" — what principles or constraints define REST?",
    "Walk me through the difference between PUT, PATCH, and POST, and when you'd use each.",
    "How do you design an API to be versioned and stay backward-compatible?",
    "How do you handle authentication and rate limiting on an API you've built?",
    "Describe how you've designed an API for a resource with relationships (e.g. orders with line items) — endpoints, status codes, error format.",
    "How would you design pagination, filtering, and sorting for a list endpoint that could return millions of rows?",
  ],
  graphql: [
    "What problem does GraphQL solve compared to REST?",
    "Explain the difference between a query, a mutation, and a subscription.",
    "Walk me through how you'd structure a schema for a feature you've built.",
    "How do you handle the N+1 query problem in a GraphQL resolver?",
    "How have you handled authentication/authorization at the resolver level?",
    "How would you handle caching on the client and server for a GraphQL API?",
  ],
  sql: [
    "What's the difference between an INNER JOIN and a LEFT JOIN — can you give an example where they'd return different results?",
    "What's the difference between `WHERE` and `HAVING`?",
    "How do indexes work, and how would you decide what to index on a table?",
    "How would you find duplicate rows in a table based on one or more columns?",
    "Describe a slow query you've optimized — how did you diagnose it (e.g. EXPLAIN plan) and what changed?",
    "How would you design a schema for a many-to-many relationship, and how would you query it efficiently?",
  ],
  mongodb: [
    "What's the difference between a relational schema and MongoDB's document model — when would you choose one over the other?",
    "How do you design a schema in MongoDB to avoid needing joins — embedding vs. referencing?",
    "How do indexes work in MongoDB, and how would you find and fix a slow query?",
    "Walk me through an aggregation pipeline you've written — what stages did you use and why?",
    "Describe a data-consistency challenge you've faced with MongoDB (e.g. multi-document updates) and how you handled it.",
    "How would you handle a schema migration on a large MongoDB collection without downtime?",
  ],
  redis: [
    "What is Redis typically used for, and what data structures does it support beyond simple key-value?",
    "Walk me through a caching strategy you've implemented with Redis — including cache invalidation.",
    "How would you use Redis for something like rate limiting or session storage?",
    "What's the difference between Redis's persistence options (RDB vs. AOF), and why would you care?",
    "Describe a bug you've run into with stale or inconsistent cached data, and how you fixed it.",
    "How would you design a leaderboard or rate-limiter using Redis's data structures?",
  ],
  docker: [
    "What's the difference between an image and a container?",
    "Walk me through how you'd write a Dockerfile for an app you've built, including any optimizations like layer caching or multi-stage builds.",
    "How do containers communicate with each other and with the host (networking, volumes)?",
    "How do you manage environment-specific configuration (dev/staging/prod) in a Dockerized app?",
    "Describe a debugging session where something worked locally but failed in a container — how did you track it down?",
    "How would you reduce the size and build time of a Docker image for a real project?",
  ],
  kubernetes: [
    "What's the difference between a Pod, a Deployment, and a Service?",
    "How does Kubernetes handle scaling and self-healing of a workload?",
    "Walk me through how you'd expose an application running in a cluster to the internet.",
    "How do you manage configuration and secrets in Kubernetes?",
    "Describe an incident where a pod was crash-looping or misbehaving — how did you debug it (logs, describe, events)?",
    "How would you roll out a new version of a service with zero downtime in Kubernetes?",
  ],
  aws: [
    "Which AWS services have you used in production, and what was each one for?",
    "Walk me through how you'd deploy a web application on AWS — the services involved end to end.",
    "How do you manage access/permissions securely in AWS (IAM roles vs. access keys)?",
    "How would you design for high availability and handle a region/AZ outage?",
    "Describe a cost or performance issue you've diagnosed in an AWS environment and how you resolved it.",
    "How would you set up a CI/CD pipeline that deploys to AWS, and what would you do if a deploy needed to be rolled back?",
  ],
  git: [
    "What's the difference between `git merge` and `git rebase`, and when would you use each?",
    "Walk me through how you'd resolve a merge conflict.",
    "What's your branching strategy on a team project (e.g. trunk-based, git-flow)?",
    "How would you safely undo a commit that's already been pushed?",
    "Describe a time a bad commit or push caused a problem, and how you fixed it.",
    "How would you find which commit introduced a bug, without manually checking each one?",
  ],
  testing: [
    "What's the difference between a unit test, an integration test, and an end-to-end test?",
    "Walk me through how you'd write a unit test for a function that has an external dependency (e.g. an API call) — how do you isolate it?",
    "What makes a good test case — how do you decide what to test, including edge cases?",
    "How do you handle testing asynchronous code or components with side effects?",
    "Describe a bug that slipped through to production — how would a test have caught it, and did you add one afterward?",
    "How would you decide what level of test coverage is 'enough' for a project, and how do you keep a test suite from becoming a maintenance burden?",
  ],
  linux: [
    "How would you find which process is using a given port, and stop it?",
    "Walk me through how you'd check disk usage, memory, and CPU load on a server.",
    "What's the difference between a hard link and a symbolic link?",
    "How would you set up a cron job, and what would you watch out for?",
    "Describe a production issue you debugged via SSH/logs on a Linux server.",
    "How would you investigate a server that's suddenly running out of memory?",
  ],
  python: [
    "What's the difference between a list, a tuple, and a set in Python, and when would you use each?",
    "How do you handle exceptions in Python — and can you describe a case where you used a custom exception?",
    "Walk me through how you'd structure a small project — modules, virtual environments, dependency management.",
    "Explain how Python's GIL affects multithreading, and how you'd achieve real parallelism if you needed it.",
    "Describe a script or program you wrote that processes data — what libraries did you use and why?",
    "How would you profile a slow Python function and decide what to optimize?",
  ],
  django: [
    "What's the difference between a Django model, view, and template — how do they fit together?",
    "Walk me through how Django's ORM handles a relationship like one-to-many or many-to-many.",
    "How do you handle authentication and permissions in Django?",
    "How would you optimize a Django view that's making too many database queries (N+1)?",
    "Describe how you've structured a Django project with multiple apps, and how they interact.",
    "How would you handle background/async tasks (e.g. sending emails) in a Django app?",
  ],
  flask: [
    "What's the difference between Flask and a full framework like Django — what do you have to set up yourself?",
    "Walk me through how you'd structure routes, blueprints, and error handling in a Flask app.",
    "How do you manage configuration and secrets across environments in Flask?",
    "How would you add request validation to a Flask endpoint?",
    "Describe a Flask app you've built — architecture, database, and deployment.",
    "How would you add background task processing (e.g. Celery) to a Flask app?",
  ],
  pandas: [
    "What's the difference between a Series and a DataFrame?",
    "How would you handle missing data in a DataFrame — what options do you have and when would you use each?",
    "Walk me through how you'd merge/join two DataFrames, and what to watch for (e.g. duplicate keys).",
    "How do you efficiently apply a transformation across a large DataFrame without a slow Python loop?",
    "Describe a real data-cleaning task you did with pandas — what was messy about the data and how did you fix it?",
    "How would you process a dataset too large to fit in memory using pandas?",
  ],
  numpy: [
    "What's the advantage of a NumPy array over a Python list for numerical work?",
    "Explain broadcasting in NumPy with an example.",
    "How would you vectorize an operation that you'd otherwise write as a nested loop?",
    "What's the difference between a view and a copy of an array, and why does it matter?",
    "Describe a performance problem you solved by switching from pure Python to NumPy.",
    "How would you implement a custom mathematical operation efficiently across a large array?",
  ],
  'machine learning': [
    "Walk me through the difference between supervised, unsupervised, and reinforcement learning, with an example of each.",
    "Describe a model you've trained — what features did you use, what algorithm, and how did you evaluate it?",
    "How do you evaluate whether a model is overfitting, and what would you do about it?",
    "How do you handle imbalanced classes in a classification problem?",
    "Describe how you'd take a trained model from a notebook to something usable in production.",
    "How would you monitor a deployed model for performance degradation (drift) over time?",
  ],
  java: [
    "What's the difference between an interface and an abstract class in Java?",
    "What's the difference between `==` and `.equals()` for objects, and why does it matter for things like Strings?",
    "Walk me through how you'd handle exceptions — checked vs. unchecked — in a real application.",
    "Explain how garbage collection works in the JVM, at a high level.",
    "Describe a multi-threading issue you've debugged in a Java application.",
    "How would you design a thread-safe class without synchronizing every method?",
  ],
  spring: [
    "What is dependency injection, and how does Spring implement it?",
    "Walk me through how a request flows through a Spring Boot app — controller, service, repository.",
    "How do you handle validation and centralized error handling in a Spring Boot REST API?",
    "How does Spring Data JPA simplify database access, and what's a pitfall you've hit with it (e.g. lazy loading)?",
    "Describe how you've configured a Spring Boot app for different environments (profiles, externalized config).",
    "How would you handle eventual consistency or a distributed transaction across services in a Spring-based system?",
  ],
  'c#': [
    "What's the difference between a value type and a reference type in C#?",
    "Walk me through how async/await works in C#, and a mistake you've seen with it.",
    "Explain dependency injection in ASP.NET Core — how is it set up and used?",
    "How do you handle configuration and secrets across environments in .NET?",
    "Describe an API you've built in ASP.NET Core — controllers, middleware, error handling, and how you tested it.",
    "How would you diagnose a memory leak in a long-running .NET service?",
  ],
  php: [
    "What's the difference between PHP's `==` and `===`?",
    "Walk me through how routing, controllers, and views fit together in Laravel (or your PHP framework of choice).",
    "How does an ORM like Eloquent handle relationships, and how do you avoid N+1 queries?",
    "How do you handle validation and error responses in a PHP API?",
    "Describe an application you've built — structure, database, and any tricky part.",
    "How would you handle background jobs or queues in a PHP application?",
  ],
  selenium: [
    "What's the difference between implicit and explicit waits in Selenium, and why does it matter?",
    "Walk me through how you'd structure an automated test suite (e.g. page object model).",
    "How do you handle flaky tests — what causes them and how do you reduce flakiness?",
    "How would you integrate automated tests into a CI pipeline?",
    "Describe a tricky UI element (dynamic content, iframe, popup) you've automated and how you handled it.",
    "How would you design a test suite that runs reliably across multiple browsers and environments?",
  ],
  excel: [
    "What's the difference between VLOOKUP/XLOOKUP and INDEX-MATCH, and when would you prefer one?",
    "How would you summarize a large dataset using pivot tables — walk me through your approach.",
    "How do you handle data cleaning in Excel (duplicates, inconsistent formats, blanks)?",
    "Describe a formula or macro you've built to automate a repetitive task.",
    "Walk me through a real analysis you did in Excel — the question you were answering and how you got to the answer.",
    "How would you build a dashboard in Excel that updates automatically as new data is added?",
  ],
  'data analysis': [
    "Walk me through your process when you get a new dataset — what do you check first?",
    "How do you decide which chart or visualization to use for a given question?",
    "How do you handle outliers or missing data in an analysis?",
    "Describe a time your analysis led to a decision or change — what was the impact?",
    "Describe a time your initial analysis was wrong or misleading — how did you catch it?",
    "How would you communicate a counter-intuitive finding to non-technical stakeholders?",
  ],
  cicd: [
    "What is a CI/CD pipeline, and what problem does it solve compared to manually building and deploying?",
    "Walk me through the stages of a pipeline you've set up — build, test, deploy — and what runs at each stage.",
    "How do you handle secrets and environment-specific configuration in a pipeline?",
    "How would you set up a pipeline so a failing test blocks a deploy but a flaky test doesn't block every release?",
    "Describe a bad deploy you've been part of — what went wrong, and what changed in the pipeline afterward?",
    "How would you design a pipeline that supports rolling back a bad release quickly and safely?",
  ],
  terraform: [
    "What problem does infrastructure-as-code solve compared to provisioning resources manually?",
    "Walk me through the Terraform workflow — init, plan, apply — and what each step actually does.",
    "What's Terraform state, and why does it matter (especially with a team)?",
    "How do you structure Terraform code for multiple environments (dev/staging/prod) without duplicating everything?",
    "Describe a time `terraform apply` did something unexpected — how did you diagnose and recover from it?",
    "How would you safely make a breaking change to a shared module used across many environments?",
  ],
  kafka: [
    "What is Kafka used for, and how does a topic/partition/consumer group fit together?",
    "Walk me through how a producer and consumer interact with a topic in something you've built.",
    "How does Kafka provide ordering guarantees, and what are the limits of that guarantee?",
    "How would you handle a consumer that's falling behind (lag) on a high-throughput topic?",
    "Describe a data-consistency or duplicate-message issue you've run into with Kafka and how you handled it.",
    "How would you design a Kafka-based system to be resilient to a broker failure?",
  ],
  figma: [
    "Walk me through your design process from a rough idea to a hand-off-ready Figma file.",
    "How do you use components and variants in Figma to keep a design system consistent?",
    "How do you structure a Figma file (pages, frames, naming) so developers can find what they need?",
    "Describe how you've collaborated with engineers during hand-off — specs, redlines, or dev mode.",
    "Tell me about a time user feedback or testing changed a design significantly after you'd already built it out.",
    "How would you design and maintain a scalable design system used across multiple products/teams?",
  ],
  'mobile development': [
    "What are the key differences between building for mobile vs. web that have shaped how you approach a feature?",
    "Walk me through the architecture of a mobile app you've built — navigation, state management, networking.",
    "How do you handle different screen sizes, orientations, and platform differences (iOS vs. Android)?",
    "How do you manage offline support and data syncing in a mobile app?",
    "Describe a performance issue (slow startup, jank, memory) you've debugged on a mobile app and how you fixed it.",
    "How would you structure a mobile app's release process — versioning, staged rollouts, crash monitoring?",
  ],
};

// Aliases — different names for the same underlying topic.
const ALIASES: Record<string, string> = {
  expressjs: 'express',
  vuejs: 'vue',
  postgresql: 'sql',
  postgres: 'sql',
  mysql: 'sql',
  mariadb: 'sql',
  'sql server': 'sql',
  oracle: 'sql',
  sqlite: 'sql',
  'spring boot': 'spring',
  net: 'c#',
  'net core': 'c#',
  aspnet: 'c#',
  laravel: 'php',
  mongoose: 'mongodb',
  'automation testing': 'selenium',
  'google sheets': 'excel',
  'unit testing': 'testing',
  jest: 'testing',
  mocha: 'testing',
  chai: 'testing',
  cypress: 'testing',
  vitest: 'testing',
  pytest: 'testing',
  junit: 'testing',
  'test-driven development': 'testing',
  tdd: 'testing',
  'qa testing': 'testing',
  // Common alternate spellings/phrasings for skills already in the bank — a
  // JD or resume listing "React JS", "Node JS", "Next JS" etc. previously
  // fell through to the generic fallback questions because none of these
  // exact strings (post dot-stripping) matched a BANK key.
  reactjs: 'react',
  'react js': 'react',
  nodejs: 'nodejs',
  'node js': 'nodejs',
  node: 'nodejs',
  nextjs: 'nextjs',
  'next js': 'nextjs',
  next: 'nextjs',
  'amazon web services': 'aws',
  'restful api': 'rest api',
  'restful apis': 'rest api',
  k8s: 'kubernetes',
  // ML library names commonly listed as standalone "skills" — reuse the
  // machine-learning ladder rather than the generic fallback.
  tensorflow: 'machine learning',
  pytorch: 'machine learning',
  'scikit-learn': 'machine learning',
  scikitlearn: 'machine learning',
  keras: 'machine learning',
  // CI/CD tooling — distinct tools, same underlying ladder.
  jenkins: 'cicd',
  'github actions': 'cicd',
  'gitlab ci': 'cicd',
  'gitlab ci/cd': 'cicd',
  'ci/cd': 'cicd',
  // Infra-as-code tooling.
  ansible: 'terraform',
  // Design tooling — same underlying design-process ladder.
  'uiux design': 'figma',
  'ui/ux design': 'figma',
  'ui ux design': 'figma',
  'adobe xd': 'figma',
  sketch: 'figma',
  // Mobile platforms/frameworks — same underlying mobile-dev ladder.
  swift: 'mobile development',
  kotlin: 'mobile development',
  flutter: 'mobile development',
  dart: 'mobile development',
  android: 'mobile development',
  ios: 'mobile development',
  'react native': 'mobile development',
};

const normalize = (s: string) => s.toLowerCase().replace(/\./g, '').trim();

function lookup(skill: string): string[] | null {
  const key = normalize(skill);
  const resolved = ALIASES[key] || key;
  return BANK[resolved] || BANK[ALIASES[resolved]] ||
    // Job postings often pluralize ("REST APIs") while the bank's keys are
    // singular ("rest api") — fall back to a singularized key.
    BANK[resolved.replace(/s$/, '')] || null;
}

// Generic but level-appropriate questions for a skill that has no curated
// bank entry — still names the specific skill and varies by depth, just
// without a pre-written technical question for that exact technology.
function fallbackQuestions(skill: string, level: CandidateLevel): string[] {
  if (level === 'junior') {
    return [
      `In your own words, what is ${skill} and what kind of problem is it typically used to solve?`,
      `Walk me through a specific project or task where you used ${skill} — what was your role?`,
      `What's one thing you found confusing or hard to learn about ${skill} when you started, and how did you work through it?`,
      `If a teammate asked you to explain ${skill} to someone new to the team, how would you explain it simply?`,
    ];
  }
  if (level === 'mid') {
    return [
      `Walk me through the most complex thing you've done with ${skill} — what was the problem, your role, and the outcome?`,
      `What's a mistake, bug, or limitation you've run into with ${skill}, and how did you resolve it?`,
      `How do you keep your knowledge of ${skill} current, and what's something you've changed your approach on recently?`,
      `Describe a time you had to choose between ${skill} and an alternative — what drove the decision?`,
    ];
  }
  return [
    `Describe a situation where ${skill} was a key design or process decision — what alternatives did you weigh, and why did this win?`,
    `What's a mistake, bug, or limitation you've run into with ${skill}, and how did you resolve it?`,
    `How would you mentor someone who's struggling with ${skill}? What are the common pitfalls you'd watch for?`,
    `How do you decide when NOT to use ${skill}, even when it's available?`,
  ];
}

// Returns up to `count` questions for `skill` at the given depth. Curated
// skills return a sliding window over a 6-question ladder (junior ->
// [0..count), mid -> [1..count+1), senior -> [2..count+2)) so the same topic
// gets harder as the candidate's experience level rises, while still
// returning `count` (up to 4) questions at every level.
export function getSkillQuestions(skill: string, level: CandidateLevel, count = 3): string[] {
  const ladder = lookup(skill);
  if (!ladder) return fallbackQuestions(skill, level).slice(0, count);
  const start = level === 'junior' ? 0 : level === 'mid' ? 1 : 2;
  return ladder.slice(start, start + count);
}
