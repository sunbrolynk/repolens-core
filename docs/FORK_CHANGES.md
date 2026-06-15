# RepoLens Self-Host Fork — Change Log

**Fork:** `sunbrolynk/repolens-core` (upstream: `otobongfp/repolens-core`)
**License:** AGPL-3.0 (copyleft — modifications must stay AGPL; network use triggers source-disclosure obligation)
**Goal:** Self-host RepoLens on Proxmox/Portainer with a free-tier LLM backend (Gemini 2.5 Flash primary), full security hardening, professional backend standards.
**Last updated:** 2026-06-15

---

## How to use this document
- This is the single running record of everything changed in the fork.
- Each entry notes **what**, **why**, **files**, and **upstream-PR disposition** (contribute back / fork-only).
- Newest entries go at the **top** of the Change Log section.
- Mirrors the raw material for eventual upstream PR descriptions.

---

## Environment Snapshot (current)

| Layer | Detail |
|-------|--------|
| Dev machine | WSL2 (Ubuntu 24.04) + VS Code |
| Repo path | `~/repolens` (clone dir name; remote is `repolens-core`) |
| Default branch | `main` — **protected, required checks enforced** |
| Working branches | `feature/*`, `chore/*`, `fix/*`, `docs/*` → squash-merge to `main` |
| Node | v24.14.1 |
| Python | 3.12.3 |
| Docker | 29.4.1 |
| Postgres | `pgvector/pgvector:pg16`, host port **5434** → 5432, loopback-bound |
| Redis | `redis:7-alpine`, host port **6380** → 6379, loopback-bound, password-required |
| API (NestJS) | port **9000**, `/api/health` green |
| Frontend (Next.js 16.2.9) | port **3000** |
| pgvector | 0.8.2, `vector(1536)` columns on Embedding + Requirement (HNSW index) |

**Stack shape:** `api/` = NestJS + Prisma + Postgres + Redis + BullMQ. `frontend/` = Next.js. The "tensor" service referenced in the Makefile **does not exist** in the repo; the generative + embedding LLM calls live in-process in `api/src/common/tensor/tensor.service.ts` via the OpenAI SDK.

---

## Branch Protection / Gate (current state)

- `main`: no direct pushes; PR required; **required status checks** (`strict: true`):
  `gitleaks (secret scan)`, `api (typecheck / lint / test / audit)`, `frontend (lint / build / audit)`.
- Squash-merge only; auto-delete branch on merge; linear history; no force-push;
  conversation resolution required; `enforce_admins: true`; required approvals `0`
  (solo-maintainer — gate is enforced by CI checks, not a second reviewer).
- semgrep SAST runs but is **informational** (non-blocking) pending finding triage.
- Pre-commit (local): gitleaks, detect-private-key, large-file/conflict checks,
  yaml/json, EOL fixers, forbid-dotenv.
- Secret scanning + push protection: enabled (from upstream). Dependabot: enabled.

---

## Provider / AI Notes (decisions, not yet implemented)

- Upstream uses **OpenAI** (`gpt-4o-mini` chat, `text-embedding-3-small` @ 1536 dims) through the OpenAI SDK in `tensor.service.ts`.
- **Plan:** chat/summarize → **Gemini 2.5 Flash** (free tier, OpenAI-compatible endpoint, base-URL swap). Embeddings → left on OpenAI (or disabled) because Gemini embeddings are 768-dim and the DB column is locked at `vector(1536)`; changing requires a migration.
- **Preferred framing for upstream:** make the provider **env-configurable** (OpenAI/Gemini/any OpenAI-compatible) rather than a hard Gemini swap — contributable upstream AND supports "bring your own key" for a future hosted model.
- **Privacy posture:** free tiers may train on inputs → public repos only for now; private-repo provider decision deferred.

---

## Change Log

### 2026-06-15 — CI pipeline live + enforced, SAST triage begun
**PRs:** #2 (baseline), #4/#5 (CI bootstrap), #6 (storage SAST doc)

1. **CI workflow now fires and is enforced.** Root-caused a chain of bootstrap failures:
   (a) bare `on:` key was YAML-coerced to boolean `true` → workflow registered but never
   triggered (fix: quote the key as `"on":`); (b) GitHub disables Actions on forks until
   manually enabled in the Actions tab; (c) workflows only register/trigger from the version
   present on the **default branch**, so the corrected workflow had to land on `main` before
   any PR would fire it. Replaced upstream's stale `ci.yml` (it referenced a deleted
   `backend/` Python tree from the pre-NestJS era — dead CI that would fail on their own
   current code).
   - Files: `.github/workflows/ci.yml`
   - Upstream: **YES** — their CI is broken against their own current architecture

2. **Required status checks enforced on `main`:** `gitleaks (secret scan)`,
   `api (typecheck / lint / test / audit)`, `frontend (lint / build / audit)`, `strict: true`.
   Notes for future reference: the `/branches/main/protection/required_status_checks`
   sub-endpoint returns 404 — must PUT the **full** protection object instead. gitleaks-action
   v2 requires `GITHUB_TOKEN` env to scan `pull_request` events (breaking change).
   - Files: `.github/workflows/ci.yml` (gitleaks token)
   - Upstream: **fork-only** (our enforcement posture)

3. **semgrep SAST added — informational for now.** 14 path-traversal finding instances across
   4 files: `repositories.service.ts` (upstream, the majority), `storage.service.ts` (ours),
   `github-auth.service.ts`, `prisma.service.ts`. Our storage finding is a **documented
   false-positive** — `projectId` passes a cuid allowlist regex, a `path.basename` equality
   check (rejects any path component), and a resolved-path containment check before use;
   traversal is not reachable. Added a `path.basename` reduction (genuine defense-in-depth)
   and an in-code justification. Inline `// nosemgrep` does not reliably suppress under
   `--config=auto`; deferring config-level suppression (`.semgrepignore` / `semgrep.yml`) to
   the point where semgrep is promoted to a blocking check, done in one pass alongside upstream
   triage.
   - Files: `api/src/common/storage/storage.service.ts`
   - Upstream: storage fix is ours; the traversal triage of `repositories.service.ts` is an
     upstream-PR candidate once real findings are separated from false positives.

### 2026-06-14 — Security baseline pushed to fork
**Commit:** `chore: security baseline, storage module, queue fix, dep hardening` (merged via PR #2)

1. **Hardened `.gitignore`** — merged upstream's app-specific rules with a secrets-leak block (env files, keys/certs, credentials, SOPS/age, token drops). Kept `.env.example` tracked.
   - Files: `.gitignore`
   - Upstream: **maybe** (secrets block is generally useful; some entries are our-posture-specific)

2. **Fixed over-broad `storage/` ignore** — unanchored `storage/` matched `src/common/storage/` source and silently excluded it from commits. Anchored to `/storage/` + `/api/storage/` (runtime artifact dirs only).
   - Files: `.gitignore`
   - Upstream: **YES** — latent footgun for anyone who adds the storage source

3. **Added missing `StorageModule` / `StorageService`** — upstream `dev` does not compile; six files import `./common/storage/*` that was never committed. Wrote to the `STORAGE_CONFIG.md` contract (`getProjectPath`, `ensureProjectDirectory`, `deleteProjectDirectory`), mirroring `S3Service`'s `process.cwd()/storage/any-bucket` root. **Path-traversal hardened**: cuid-pattern ID validation + basename reduction + resolved-path containment check before any mkdir/rm; delete re-validates immediately before `fs.rm`.
   - Files: `api/src/common/storage/storage.service.ts`, `api/src/common/storage/storage.module.ts`
   - Upstream: **YES (headline)** — makes the branch buildable

4. **Fixed `QueueService` dual-ioredis type conflict** — root `ioredis@5.11.1` vs bullmq's nested `5.10.1` breaks `tsc` (`Type 'Redis' is not assignable to 'ConnectionOptions'`). Switched to passing a typed `ConnectionOptions` object instead of a constructed `Redis` instance (also the recommended BullMQ pattern). **Also wired the previously-ignored Redis password** (`process.env.REDIS_PASSWORD`), and added cleanup of the `events` map in `onModuleDestroy` (latent leak upstream).
   - Files: `api/src/common/queue/queue.service.ts`
   - Upstream: **YES** — compile fix + correctness

5. **Added local dev `docker-compose`** — Makefile references `../docker/docker-compose.yml` (outside repo, nonexistent). Wrote `docker/docker-compose.dev.yml`: pgvector Postgres + Redis, **loopback-bound**, `no-new-privileges`, healthchecks, Redis password required, secrets via gitignored `docker/.env` with `:?` guards that refuse to start on unset values.
   - Files: `docker/docker-compose.dev.yml`
   - Upstream: **maybe** — they may intend user-supplied DBs; offer as "working dev compose"

6. **Pinned Next.js `16.2.9`** (was `"latest"`) + resolved postcss advisory — `"latest"` is non-deterministic/security-risky. Pinned to current stable. Cleared 10 frontend vulns (1 critical Next RCE, 6 high) via non-forced `npm audit fix`; remaining postcss moderate resolved by aligning the direct dep to `^8.5.10` + `overrides`. (Dependabot full-tree scan including devDeps later showed 123 → triaged down to 12 after baseline.)
   - Files: `frontend/package.json`, `frontend/package-lock.json`
   - Upstream: **maybe** — security yes, pinning may be debated

7. **Added pre-commit security gate** — gitleaks (secret scan), detect-private-key, large-file/merge-conflict/case-conflict checks, yaml/json validation, EOL fixers, and a custom `forbid-dotenv` hook (blocks any real `.env` even via `git add -f`). Full-history gitleaks scan: **69 commits, no leaks found.**
   - Files: `.pre-commit-config.yaml`, `scripts/forbid-dotenv.sh`
   - Upstream: **fork-only** (our security posture)

8. **Supply-chain hardening** — `.npmrc` with `ignore-scripts=true` (blocks install-time code
   execution) + `save-exact=true` (pin exact versions). CI uses `npm ci --ignore-scripts`
   (lockfile-integrity-verified installs). GitHub Actions pinned to commit SHAs;
   semgrep container pinned to image digest. Dependabot config watches api + frontend npm
   trees and the Actions themselves (grouped minor/patch).
   - Files: `.npmrc`, `.github/dependabot.yml`, `.github/workflows/ci.yml`
   - Upstream: **fork-only** (posture), though SHA-pinning is good practice to suggest

---

## Outstanding / Known Issues (not yet fixed)

| # | Issue | Where | Notes |
|---|-------|-------|-------|
| A | "Failed to load projects" / "Failed to get local codebases" — frontend throws on not-ok api responses | frontend + `GET /api/projects`, `/api/codebases` | All failing calls send `getAuthHeaders()`; likely **auth-gated** (better-auth, no session). Need network status (401 vs 500) from local stack to confirm. **Primary blocker to a working analysis.** |
| B | Project analysis errors (0 files, 0 B) on a GitHub repo | `fetch-files` worker / StorageService / GitHub fetch | Likely no `GITHUB_TOKEN` (60/hr unauth limit) OR storage path issue — needs api log to confirm |
| C | `"license": "MIT"` in `api/package.json` contradicts AGPL-3.0 LICENSE | `api/package.json` | False license declaration; fix to AGPL-3.0. **Upstream PR candidate.** |
| D | `tree-sitter-markdown@0.7.1` fails native compile (`-fexceptions`) | `api` install | Worked around via `--ignore-scripts` (regex fallback). Revisit for AST precision or drop the parser. |
| E | Gemini provider swap not yet implemented | `tensor.service.ts` | See Provider/AI Notes above |
| F | semgrep path-traversal findings need triage; promote to required once clean | `api/src/repositories/repositories.service.ts` (+ `github-auth`, `prisma`) | Separate real traversal risks from false positives; fix real → upstream PR; then config-level suppress audited false-positives (incl. our storage) and make semgrep a required check |
| G | 12 Dependabot findings (dev-dependency surface) | `api` + `frontend` devDeps | Down from 123 after baseline. Triage real-vs-noise. |
| H | api `package.json` test/lint scripts informational in CI | `api`, `frontend` | Promote lint/test/build from informational → blocking as upstream debt is cleaned + a real test suite (80/95 coverage) is added |

---

## Upstream PR Plan (when ready)

Group into focused PRs (don't bundle our-posture changes with genuine fixes):
- **PR 1 (high value):** StorageModule/StorageService + anchored gitignore → makes `dev` compile. *(landed in our fork via #2)*
- **PR 2:** QueueService ioredis fix + Redis password wiring.
- **PR 3:** `package.json` license correction (MIT → AGPL-3.0).
- **PR 4:** Replace stale `ci.yml` (references deleted `backend/` Python tree).
- **PR 5 (optional):** env-configurable LLM provider.
- **PR 6 (optional):** working dev docker-compose.
- **PR 7 (optional):** real path-traversal fixes in `repositories.service.ts` (after triage).

Keep our fork-only items (remapped ports, generated secrets, pre-commit config, enforcement posture) **out** of upstream PRs.

---

## Workflow Standards (reference)
- Answer first; **complete regenerated files** over diffs/snippets; one file at a time; Shane commits via `gh`, squash-merge, delete branch.
- All work on `feature/*` `chore/*` `fix/*` `docs/*` branches → PR → required checks pass → squash-merge to `main`.
- `gh repo set-default sunbrolynk/repolens-core`; always `--repo sunbrolynk/repolens-core` on PR commands (gh defaults to upstream otherwise).
- Deploy: Portainer image pulls only, never direct server edits.
- No plaintext secrets anywhere; LLM key server-side only (never in frontend bundle).
- Every push passes: gitleaks, SAST (semgrep), dependency audit, lint, type-check; tests + coverage (80% global / 95% critical) as the suite is built out.
- Egress allowlisted to the LLM endpoint only.
- Install with `--ignore-scripts`; never `npm audit fix --force`.
