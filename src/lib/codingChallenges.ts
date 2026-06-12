// Generates the 4-5 questions shown on a "Create Assessment" / assessment
// detail page. Unlike skillQuestions.ts (discussion questions for live
// interviews), these are hands-on tasks an evaluator hands to a candidate to
// actually DO — write code, design a system, or produce a written artifact —
// so "Create Assessment" no longer reuses the interview-prep question bank.
//
// Selection is grounded in real data for THIS candidate against THIS job:
// the job's required/nice-to-have skills (what's actually being tested),
// the candidate's experience level (how hard the task should be), and the
// assessment type (coding/written/take-home). Nothing here is a single
// fixed template — different skill combinations, levels, and types produce
// different question sets.

import type { AssessmentType } from '../db/models/Assessment';
import { levelFromExperience, type CandidateLevel } from './skillQuestions.ts';

export interface AssessmentQuestion {
  skill: string;
  difficulty: CandidateLevel;
  question: string;
}

export interface AssessmentQuestionsInput {
  type: AssessmentType;
  jobTitle: string;
  jobLevel: string;
  experience: number;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  practicalSkills: string[];
  matchedSkills: string[];
}

const TARGET_COUNT = 5;

// ── Coding-task bank ─────────────────────────────────────────────────────────
// Each skill ladders junior -> mid -> senior, two hands-on tasks per level —
// real "build/implement/debug this" prompts, not discussion questions.
const CODING_BANK: Record<string, Record<CandidateLevel, string[]>> = {
  javascript: {
    junior: [
      'Write a function `groupByKey(items, key)` that groups an array of objects by a given property — return an object mapping each key value to an array of matching items.',
      'Implement `flattenArray(arr)` that flattens a nested array of arbitrary depth into a single flat array, without using `Array.prototype.flat`.',
    ],
    mid: [
      'Implement a `debounce(fn, delay)` utility from scratch and write a short test showing it only fires once after rapid repeated calls.',
      'Given an array of `{ id, parentId, name }` records, write a function that builds a nested tree structure from the flat list.',
    ],
    senior: [
      'Design and implement a small in-memory LRU cache class (`get`/`set` with a max size) with O(1) operations — explain the data structures you chose.',
      'Write an async task queue that runs up to N promises concurrently from a larger list of tasks, preserving results in input order.',
    ],
  },
  typescript: {
    junior: [
      'Write a typed `Result<T, E>` union (`{ ok: true, value: T } | { ok: false, error: E }`) and a function `parseNumber(input: string): Result<number, string>` that uses it.',
      'Given an interface `User { id: number; name: string; email?: string }`, write a function `formatUser` that returns a display string, handling the optional `email` safely with TypeScript narrowing.',
    ],
    mid: [
      'Write a generic `Repository<T>` class with `findById`, `findAll`, `create`, and `delete` methods backed by an in-memory array, fully typed.',
      'Given a union of event types (e.g. `{type:"click", x:number,y:number} | {type:"keypress", key:string}`), write a type-safe `handleEvent` function using a discriminated union switch.',
    ],
    senior: [
      'Design typed API request/response contracts for a small REST resource (e.g. "orders") including pagination, and a typed client function that fetches and validates the response shape.',
      'Write a utility type `DeepPartial<T>` and a `mergeDeep<T>(base: T, patch: DeepPartial<T>): T` function that deep-merges nested objects while preserving types.',
    ],
  },
  nodejs: {
    junior: [
      'Write an Express route `GET /users/:id` that reads from an in-memory array of users and returns 404 if not found, 200 with the user otherwise.',
      'Write a small Node script that reads a CSV file line-by-line (using streams) and logs the total number of rows and the sum of a numeric column.',
    ],
    mid: [
      'Build a small Express middleware that rate-limits requests per IP (e.g. max 10 requests per minute) using an in-memory store, and explain its limitations in production.',
      'Write an async function `fetchWithRetry(url, retries)` that retries a failed HTTP request with exponential backoff, and a unit test that verifies the retry behavior.',
    ],
    senior: [
      'Design a Node.js module that processes a queue of background jobs with configurable concurrency, retry-on-failure, and graceful shutdown (in-flight jobs finish before exit).',
      'Given a Node API experiencing intermittent timeouts under load, write a short diagnostic plan plus a code change (e.g. connection pooling, timeout handling) you would make first, with reasoning.',
    ],
  },
  express: {
    junior: [
      'Write an Express app with routes for basic CRUD (`GET/POST/PUT/DELETE /tasks`) backed by an in-memory array, including input validation that returns 400 on missing fields.',
      'Write Express middleware that logs method, path, and response time for every request.',
    ],
    mid: [
      'Implement centralized error handling in Express: a custom `AppError` class plus an error-handling middleware that returns consistent JSON error responses with status codes.',
      'Write an Express route that accepts a paginated list query (`?page=&limit=&sort=`) and returns paginated results with metadata (total, page, pages) from an in-memory dataset.',
    ],
    senior: [
      'Design the route/controller/service layering for a medium-sized Express API (e.g. an ATS) — show how you would structure folders and where validation, business logic, and DB access live.',
      'Write Express middleware implementing JWT-based auth with role-based access control for at least two roles, including how you would test it.',
    ],
  },
  python: {
    junior: [
      'Write a function `most_common_word(text)` that returns the most frequently occurring word in a string, ignoring punctuation and case.',
      'Write a function `is_valid_parentheses(s)` that returns whether a string of `()[]{}` brackets is balanced and correctly nested.',
    ],
    mid: [
      'Write a function `merge_intervals(intervals)` that merges all overlapping intervals in a list of `[start, end]` pairs and returns the merged list sorted by start time.',
      'Implement a simple LRU cache class in Python using `collections.OrderedDict` with `get`/`put` methods, both O(1).',
    ],
    senior: [
      'Design and implement a rate limiter class (token bucket or sliding window) in Python, with unit tests for burst and sustained traffic.',
      'Given a large CSV that does not fit in memory, write a memory-efficient approach (generator-based) to compute aggregate statistics (e.g. average, max) per category column.',
    ],
  },
  django: {
    junior: [
      'Define a Django model `Task` with `title`, `done`, and `created_at` fields, and write a view that lists all incomplete tasks.',
      'Write a Django form (or serializer, if DRF) that validates a "create task" request, rejecting empty titles.',
    ],
    mid: [
      'Write a Django REST Framework viewset for a `Task` model supporting list/create/update/delete, with permission so users can only modify their own tasks.',
      'Given an N+1 query problem in a Django view that lists orders and their items, rewrite the queryset using `select_related`/`prefetch_related` to fix it.',
    ],
    senior: [
      'Design the schema and DRF serializers for a multi-tenant feature (e.g. each company sees only its own data) — explain how you would enforce tenant isolation at the query level.',
      'Write a Django management command that performs a data migration/backfill safely on a large table (batching, idempotency, progress logging).',
    ],
  },
  java: {
    junior: [
      'Write a Java method `boolean isPalindrome(String s)` that checks whether a string reads the same forwards and backwards, ignoring case and non-alphanumeric characters.',
      'Implement a generic `Stack<T>` class backed by an `ArrayList`, with `push`, `pop`, `peek`, and `isEmpty`.',
    ],
    mid: [
      'Write a method that takes a `List<Order>` and groups/sums order totals by customer using Java Streams.',
      'Implement a thread-safe counter class using `synchronized` (or `AtomicInteger`) and explain the tradeoffs of each approach.',
    ],
    senior: [
      'Design a small plugin/strategy-pattern based system in Java for processing different payment types, and implement two strategies plus the dispatcher.',
      'Given a Spring Boot REST endpoint that is slow under load, describe and implement a caching layer (e.g. with `@Cacheable`) including cache invalidation strategy.',
    ],
  },
  spring: {
    junior: [
      'Create a Spring Boot REST controller with a `GET /products/{id}` endpoint backed by a simple in-memory repository, returning 404 when not found.',
      'Add request validation (`@Valid` + bean validation annotations) to a `POST /products` endpoint and return a 400 with field errors on invalid input.',
    ],
    mid: [
      'Write a Spring Data JPA repository and service layer for a `Product` entity with a custom query method (e.g. `findByCategoryAndPriceLessThan`).',
      'Implement global exception handling in Spring Boot using `@ControllerAdvice` that converts custom exceptions into consistent JSON error responses.',
    ],
    senior: [
      'Design a Spring Boot service that integrates with an external payment API — show how you would handle retries, timeouts, and idempotency keys.',
      'Implement role-based method security (`@PreAuthorize`) for an admin-only endpoint, and describe how you would test it.',
    ],
  },
  react: {
    junior: [
      'Build a `Counter` component with increment/decrement/reset buttons using `useState`.',
      'Build a `SearchableList` component that filters a list of items as the user types into a search input.',
    ],
    mid: [
      'Build a `useFetch(url)` custom hook that handles loading, error, and data states, and use it in a component that lists items from an API.',
      'Build a paginated table component that fetches a page of data when the page number changes, cancelling the previous in-flight request.',
    ],
    senior: [
      'Design a form component handling 10+ fields with validation, async submit, and field-level error messages — discuss how you would structure state to avoid unnecessary re-renders.',
      'Given a React app that re-renders an entire large list on every keystroke in a search box, identify the likely causes and implement a fix (e.g. memoization, virtualization, debouncing).',
    ],
  },
  sql: {
    junior: [
      'Write a SQL query to find all employees who earn more than the average salary in their department.',
      'Write a SQL query to return the second-highest salary from an `employees` table without using `LIMIT`/`OFFSET`.',
    ],
    mid: [
      'Given `orders(id, customer_id, order_date, total)` and `customers(id, name)`, write a query returning each customer\'s total spend and order count, including customers with zero orders.',
      'Write a query using window functions to rank employees by salary within each department.',
    ],
    senior: [
      'A reporting query joining 3 large tables is slow. Explain how you would diagnose it (EXPLAIN plan, indexes) and write the indexes/query rewrite you would try first.',
      'Design a schema for an order-and-inventory system that prevents overselling under concurrent writes, and write the key constraints/transactions involved.',
    ],
  },
  mongodb: {
    junior: [
      'Write a MongoDB query to find all documents in a `products` collection where `price` is between 100 and 500, sorted by price descending.',
      'Write an aggregation pipeline that counts the number of documents in a `users` collection grouped by `country`.',
    ],
    mid: [
      'Given an `orders` collection with embedded `items` arrays, write an aggregation pipeline that returns total revenue per product across all orders.',
      'Design a schema for a blog (posts + comments) — would you embed or reference comments, and why? Write the schema for your choice.',
    ],
    senior: [
      'A collection has grown to tens of millions of documents and a common query is slow. Describe the indexing strategy you would investigate and write the index definitions.',
      'Design a sharding/partitioning approach for a multi-tenant collection where one tenant is much larger than the others, and explain the tradeoffs.',
    ],
  },
  docker: {
    junior: [
      'Write a `Dockerfile` for a simple Node.js (or Python) app, including dependency installation and the correct `CMD`.',
      'Write a `docker-compose.yml` that runs an app container alongside a MongoDB (or PostgreSQL) container, with the app depending on the database being ready.',
    ],
    mid: [
      'Optimize a given `Dockerfile` for a Node.js app to reduce image size and build time using multi-stage builds — explain each change.',
      'Write a `docker-compose.yml` for a 3-service app (frontend, backend, database) including environment variables and a shared network.',
    ],
    senior: [
      'Design a containerization strategy for a microservices app with shared base images, secrets management, and health checks — describe the Dockerfile/compose structure.',
      'A container keeps getting OOM-killed in production. Describe how you would diagnose memory usage and what Docker/runtime changes you would try.',
    ],
  },
  kubernetes: {
    junior: [
      'Write a Kubernetes Deployment + Service manifest for a simple web app exposing port 3000 internally via a ClusterIP service.',
      'Explain (with a manifest snippet) how you would set CPU/memory requests and limits for a pod, and why both matter.',
    ],
    mid: [
      'Write a manifest adding a liveness and readiness probe to an existing Deployment, and explain the difference between the two.',
      'Design a rolling update strategy (maxSurge/maxUnavailable) for a Deployment that must stay available during deploys, and write the relevant manifest section.',
    ],
    senior: [
      'Design a multi-environment (dev/staging/prod) Kubernetes setup using namespaces and Kustomize/Helm — describe the structure and what differs per environment.',
      'A pod is crash-looping in production. Describe your debugging steps (kubectl commands, what you would check) and propose likely fixes for common causes.',
    ],
  },
  aws: {
    junior: [
      'Describe (with example CLI commands or console steps) how you would host a static website using S3, including making it publicly readable.',
      'Write an IAM policy (JSON) that grants read-only access to a specific S3 bucket and nothing else.',
    ],
    mid: [
      'Design a simple serverless API: API Gateway -> Lambda -> DynamoDB. Describe the request flow and write the Lambda handler for a `GET /items/{id}` endpoint.',
      'Write a script (CLI or SDK) that automates creating daily snapshots of an RDS database and deletes snapshots older than 7 days.',
    ],
    senior: [
      'Design a highly-available architecture for a web app across multiple AZs — describe load balancing, auto scaling, database failover, and how you would handle a region-level outage.',
      'A production Lambda function is timing out intermittently under load. Walk through how you would diagnose this (CloudWatch metrics/logs, concurrency limits) and the fixes you would try.',
    ],
  },
  terraform: {
    junior: [
      'Write a Terraform configuration that provisions a single S3 bucket with versioning enabled.',
      'Write Terraform variables and outputs for a configuration that provisions an EC2 instance, parameterizing instance type and AMI.',
    ],
    mid: [
      'Write a Terraform module that provisions a VPC with public and private subnets across two availability zones.',
      'Given a Terraform state drift (someone changed a resource manually in the console), describe how you would detect and resolve it safely.',
    ],
    senior: [
      'Design a Terraform project structure for managing dev/staging/prod environments with shared modules and remote state — describe the layout and state isolation strategy.',
      'Write a Terraform configuration that provisions an autoscaling group behind a load balancer, with a launch template referencing a custom AMI.',
    ],
  },
  'data structures': {
    junior: [
      'Implement a singly linked list class with `insert`, `delete`, and `find` methods.',
      'Write a function that reverses a singly linked list iteratively.',
    ],
    mid: [
      'Implement a binary search tree with `insert`, `find`, and an in-order traversal that returns sorted values.',
      'Given a binary tree, write a function to determine whether it is height-balanced.',
    ],
    senior: [
      'Implement a graph as an adjacency list and write BFS and DFS traversals; use BFS to find the shortest path between two nodes in an unweighted graph.',
      'Design and implement a trie (prefix tree) supporting `insert`, `search`, and `startsWith`, and discuss its use for autocomplete.',
    ],
  },
  algorithms: {
    junior: [
      'Write a function that returns the two indices of numbers in an array that add up to a given target (two-sum).',
      'Write a function that removes duplicates from a sorted array in place and returns the new length.',
    ],
    mid: [
      'Write a function that finds the longest substring without repeating characters in a string, and explain its time complexity.',
      'Implement binary search on a sorted array, including the rotated-sorted-array variant.',
    ],
    senior: [
      'Given a list of meetings with start/end times, write a function that determines the minimum number of rooms required to schedule all of them without conflicts.',
      'Implement a function that finds the shortest path in a weighted graph (Dijkstra\'s algorithm) and discuss when you would choose it over BFS.',
    ],
  },
};

const SKILL_ALIASES: Record<string, string> = {
  'js': 'javascript',
  'es6': 'javascript',
  'ts': 'typescript',
  'node': 'nodejs',
  'node.js': 'nodejs',
  'expressjs': 'express',
  'express.js': 'express',
  'reactjs': 'react',
  'react.js': 'react',
  'postgresql': 'sql',
  'postgres': 'sql',
  'mysql': 'sql',
  'plsql': 'sql',
  't-sql': 'sql',
  'rest api': 'nodejs',
  'restful api': 'nodejs',
  'aws lambda': 'aws',
  'amazon web services': 'aws',
  'k8s': 'kubernetes',
  'spring boot': 'spring',
  'data structures and algorithms': 'data structures',
  'dsa': 'data structures',
};

function normalizeSkill(skill: string): string {
  const key = skill.toLowerCase().trim();
  return SKILL_ALIASES[key] || key;
}

function codingTaskFor(skill: string, level: CandidateLevel): { question: string; matched: boolean } {
  const key = normalizeSkill(skill);
  const ladder = CODING_BANK[key];
  if (ladder) {
    const tasks = ladder[level];
    return { question: tasks[Math.floor(Math.random() * tasks.length)], matched: true };
  }
  // No curated ladder for this skill — still produce a concrete, hands-on
  // (not generic-template) task naming the skill and scaled to level.
  const generic: Record<CandidateLevel, string> = {
    junior: `Write a small program using ${skill} that solves a basic, real task you'd expect on day one with this technology (your choice of task) — explain your approach as you go.`,
    mid: `Build a small feature using ${skill} that touches at least two real-world concerns (e.g. error handling, validation, or persistence) — describe the design decisions you made.`,
    senior: `Design and implement a small but production-shaped piece of work using ${skill}, including how you'd test it and what you'd monitor once it's live.`,
  };
  return { question: generic[level], matched: false };
}

function genericAlgorithmTask(level: CandidateLevel, used: Set<string>): string {
  const pool = CODING_BANK['algorithms'][level].concat(CODING_BANK['data structures'][level]);
  for (const q of pool) {
    if (!used.has(q)) return q;
  }
  return pool[0];
}

// ── Written / take-home task generation ──────────────────────────────────────

function writtenOrTakeHomeTasks(input: AssessmentQuestionsInput, level: CandidateLevel, skills: string[]): AssessmentQuestion[] {
  const primary = skills[0] || input.jobTitle;
  const secondary = skills[1] || skills[0] || 'the role\'s core stack';
  const out: AssessmentQuestion[] = [];

  if (input.type === 'take-home') {
    out.push({
      skill: primary,
      difficulty: level,
      question: `Take-home project: build a small application (your choice of scope, ~3-6 hours) that demonstrates ${primary}${secondary !== primary ? ` and ${secondary}` : ''}, relevant to a "${input.jobTitle}" role. Include a README covering setup, the design decisions you made, and known limitations.`,
    });
    out.push({
      skill: secondary,
      difficulty: level,
      question: `As part of your submission, write a short (1-2 paragraph) explanation of how you would test this project (unit/integration), and what you would add next if you had another day.`,
    });
    out.push({
      skill: primary,
      difficulty: level,
      question: `Submit your code via a public/shareable repository link (or a zip if preferred) along with instructions to run it locally.`,
    });
  } else {
    // written
    out.push({
      skill: primary,
      difficulty: level,
      question: `Design write-up: describe how you would architect a feature for a "${input.jobTitle}" role that relies on ${primary}${secondary !== primary ? ` and ${secondary}` : ''}. Cover the key components, data flow, and at least one tradeoff you considered.`,
    });
    out.push({
      skill: secondary,
      difficulty: level,
      question: `Describe a real (or realistic) problem you've solved involving ${secondary}, including what made it hard and how you approached it.`,
    });
    out.push({
      skill: primary,
      difficulty: level,
      question: level === 'senior'
        ? `How would you mentor a junior engineer joining this team on ${primary}? What would you have them learn first, and what mistakes would you watch for?`
        : `What's one thing about ${primary} you're still building confidence in, and how are you working on it?`,
    });
  }

  if (input.requiredSkills.length) {
    out.push({
      skill: input.requiredSkills.join(', '),
      difficulty: level,
      question: `Given this role's required skills (${input.requiredSkills.join(', ')}), which one are you most confident in and which would you want to grow in over the next 6 months — and why?`,
    });
  }

  return out.slice(0, TARGET_COUNT);
}

// ── Main entry point ──────────────────────────────────────────────────────────

// Builds the 4-5 questions shown when an assessment is created — grounded in
// THIS job's required/nice-to-have skills and THIS candidate's experience
// level, never a fixed template regardless of role.
export function generateAssessmentQuestions(input: AssessmentQuestionsInput): AssessmentQuestion[] {
  const level = levelFromExperience(input.experience);

  // Required skills first (what the role actually needs verified), then
  // nice-to-haves to fill remaining slots. Skills the candidate already
  // claims practical/matched experience with are prioritized — the
  // assessment should verify the depth behind the resume.
  const claimed = new Set([...input.practicalSkills, ...input.matchedSkills].map(s => s.toLowerCase()));
  const required = [...input.requiredSkills];
  const niceToHave = [...input.niceToHaveSkills];
  const bySkillPriority = (a: string, b: string) => {
    const aClaimed = claimed.has(a.toLowerCase()) ? 0 : 1;
    const bClaimed = claimed.has(b.toLowerCase()) ? 0 : 1;
    return aClaimed - bClaimed;
  };
  const orderedSkills = dedupeBySkill([...required.sort(bySkillPriority), ...niceToHave.sort(bySkillPriority)]);

  if (input.type !== 'coding') {
    return writtenOrTakeHomeTasks(input, level, orderedSkills.length ? orderedSkills : [input.jobTitle]);
  }

  const questions: AssessmentQuestion[] = [];
  const usedQuestionText = new Set<string>();

  // Up to 3 skill-specific coding tasks from the role's most relevant skills.
  for (const skill of orderedSkills) {
    if (questions.length >= 3) break;
    const { question } = codingTaskFor(skill, level);
    if (usedQuestionText.has(question)) continue;
    usedQuestionText.add(question);
    questions.push({ skill, difficulty: level, question });
  }

  // No skills resolved to anything (rare) — fall back entirely to generic
  // algorithm/DS problems below.

  // Round out to TARGET_COUNT with generic algorithm/data-structure problems
  // scaled to the candidate's level — every coding assessment also probes
  // fundamentals independent of the specific stack.
  while (questions.length < TARGET_COUNT) {
    const q = genericAlgorithmTask(level, usedQuestionText);
    if (usedQuestionText.has(q)) {
      // Pool exhausted at this level — stop rather than duplicate.
      break;
    }
    usedQuestionText.add(q);
    questions.push({ skill: 'Data Structures & Algorithms', difficulty: level, question: q });
  }

  return questions.slice(0, TARGET_COUNT);
}

function dedupeBySkill(skills: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of skills) {
    const key = s.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
