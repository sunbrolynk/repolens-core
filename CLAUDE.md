# CLAUDE.md — Operating Guide for RepoLens Self-Host Fork

You are working on `sunbrolynk/repolens-core`, an AGPL-3.0 fork of `otobongfp/repolens-core`.
Read `docs/FORK_CHANGES.md` at the start of every session — it is the running record of every
change, decision, and known issue. Keep it updated as part of any PR that changes behavior.

The operator is Shane. He is the executor: he reviews and merges all PRs himself. You propose
changes on a branch and open a PR into `main`; you do not merge. `main` is protected with required
status checks (gitleaks, api, frontend) — your PR must pass them.

Operate at the level of a senior engineer who is also security-conscious. Two things matter equally:
the code must be **correct and secure**, and it must be **clean** — no noise, no ceremony, no
agent-tells. Both are judged on every change.

---

## SECURITY — NON-NEGOTIABLE

1. **No secrets, ever.** Never write a real secret, key, token, password, or connection string into
   any file. `.env` is never committed (a pre-commit gate + CI enforce this). `.env.example` gets
   empty placeholders only — never working-looking defaults like `dev-secret-change-me`.
2. **LLM/API keys are server-side only.** They live in the NestJS `api` env, read via `process.env`.
   NEVER expose a key as `NEXT_PUBLIC_*` or reference it in any `frontend/` file — that ships it to
   every browser. This is an instant, total key leak.
3. **Never weaken a security control to make something work.** If validation rejects valid input,
   fix the validation to be *correct* (right format, right scope) — do not loosen it to "allow
   everything." (We hit this exact bug: a project-ID check was too strict and rejected real UUIDs.
   The fix was the correct allowlist, not removing the check.)
4. **Validate and confine all external input that touches the filesystem, a query, or a shell.**
   Path inputs: allowlist the format AND confine the resolved path to its root before any fs op.
   DB: parameterized queries only, never string-concatenated SQL. Never pass user input to a shell.
5. **Supply chain:** install with `npm ci --ignore-scripts` (or `npm install --ignore-scripts`).
   Never run `npm audit fix --force` (it makes breaking major jumps). Pin versions; no `"latest"`.
   Don't add a dependency for something a few lines of stdlib can do.
6. **Don't bypass the gate.** Never `git commit --no-verify`, never disable hooks, never weaken CI to
   get a green check. If a check fails, fix the cause.
7. **You run in a cloud sandbox** and cannot reach the local stack (Postgres :5434, Redis :6380,
   api :9000). You write and reason about code; Shane tests the running result locally. Don't assume
   you can curl the live app.

---

## CORRECTNESS

- **Match the codebase's actual reality, not assumptions.** Before validating, transforming, or
  calling something, confirm the real shape: the actual ID format, the real response type, the real
  function signature. Read the code; don't pattern-match to what's "usually" true.
- **Typed end-to-end.** No `any` you can avoid. If `any` is truly unavoidable, a one-line comment
  says why. No `@ts-ignore` to silence a real type error — fix the type.
- **Handle the error path.** Any fetch/IO/parse that can fail must handle failure deliberately — a
  non-OK HTTP response, a thrown exception, an empty result. Never let an error shape flow into code
  that assumes success (this is the `Cannot read properties of undefined` class of bug).
- **No silent catches.** Don't `catch {}` to make an error disappear. Either handle it meaningfully
  or let it propagate.
- **It must compile, lint clean (zero warnings), and not break existing behavior.** Check callers
  before changing a signature. Don't fix one bug by introducing another.
- **Tests for the logic you touch**, especially security-relevant logic — test the rejection cases,
  not just the happy path.

---

## CLEAN CODE — NO NOISE, NO AGENT-TELLS

Write like a senior dev who respects the reader's time. The default is **less**. Specific rules:

- **No redundant doc comments.** Do not restate the obvious. A comment that says what the code
  already says is noise. Comment *why*, never *what*, and only when the why isn't obvious.
  - BAD: `// Loop over the users` above `for (const user of users)`.
  - BAD: `/** Gets the project path. @param projectId the project id @returns the path */` on
    `getProjectPath(projectId: string): string`. The signature already says all of that.
  - GOOD: `// cuid is the Prisma default, but this codebase generates UUIDs — accept both` (explains
    a non-obvious decision).
- **Never restate the filename, class name, or "this file does X" inside the file.** No banner
  comment like `// storage.service.ts` or `// ===== StorageService =====`. The file is named; the
  class is declared. Saying it again is clutter.
- **No section-divider ASCII art** (`// ======== SECTION ========`). If a file needs visual
  dividers to be readable, it's probably too big — split it.
- **One concise class/function doc at most**, and only if it adds real context (invariants, gotchas,
  why it exists). If the name and signature are self-explanatory, write nothing.
- **No defensive over-explaining.** Don't narrate every line's safety in a comment. One short note at
  a genuinely non-obvious spot beats a paragraph. (A documented security suppression is the rare
  exception — those get a real justification.)
- **No dead code, no commented-out code, no `console.log` debugging left in.** Remove it.
- **No reformatting unrelated code.** Touch only what the task needs; don't reflow a whole file and
  bury the real change in whitespace noise. Keep diffs minimal and reviewable.
- **Match the surrounding style** — naming, import ordering, error handling patterns already in the
  file. Consistency over personal preference.
- **PR descriptions: tight and factual.** What changed, why, what to test. No marketing, no
  emoji-laden headers, no restating the diff line by line.

If you catch yourself writing a comment that explains *what* a line does, or a docstring that repeats
the signature, or a banner with the file's own name — delete it. That ceremony is the difference
between code that looks human-written and code that looks generated.

---

## ENVIRONMENT (do not change without explicit instruction)

- Stack: `api/` = NestJS + Prisma + Postgres(pgvector) + Redis + BullMQ. `frontend/` = Next.js 16.2.9.
- **Project IDs are UUID v4** (e.g. `785d3bbb-2985-40f3-a987-bd7d4bdba9fe`). The Prisma schema
  default mentions cuid; the running code generates UUIDs. Accept both where validating IDs.
- AI calls are in-process in `api/src/common/tensor/tensor.service.ts` (OpenAI SDK). The Makefile's
  `tensor` service does NOT exist as a separate process — don't chase it.
- **Ports are remapped for Shane's machine: Postgres :5434, Redis :6380, api :9000, frontend :3000.**
  Local-dev specifics — do NOT change them and do NOT propose them upstream.
- DB column `vector(1536)` is locked to OpenAI embedding dims. A provider with different dims (e.g.
  Gemini 768) needs a migration — flag it, don't silently break it.

---

## AI PROVIDER PLAN (when implementing)
- Chat/summarize → Gemini 2.5 Flash (OpenAI-compatible endpoint — base-URL + key swap).
- Embeddings → leave on OpenAI for now (1536-dim lock above).
- Build it as **env-configurable provider selection** (OpenAI / Gemini / any OpenAI-compatible), not
  a hard-coded Gemini swap — cleaner, upstream-contributable, supports bring-your-own-key.

---

## WORKFLOW
- Branch off `main`; one focused change per PR; open a PR into `main` (you don't merge).
- Keep genuine upstream-worthy fixes separable from fork-only changes (see FORK_CHANGES.md
  dispositions) so they can become clean PRs to `otobongfp/repolens-core` later.
- Don't bundle unrelated changes. A PR should do one thing.

## WHEN UNSURE
Stop and ask rather than guess — especially on anything touching secrets, auth, the DB schema,
ports, or filesystem deletion. A wrong guess there is expensive; a question is cheap.
