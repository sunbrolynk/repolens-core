# RepoLens Self-Host Fork — Change Log

**Fork:** `sunbrolynk/repolens-core` (upstream: `otobongfp/repolens-core`)
**License:** AGPL-3.0 (copyleft — modifications must stay AGPL; network use triggers source-disclosure obligation)
**Goal:** Self-host RepoLens on Proxmox/Portainer with a free-tier LLM backend (Gemini 2.5 Flash primary), full security hardening, professional backend standards.
**Last updated:** 2026-06-14

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
| Active branch | `chore/security-baseline` (off `main`) — **pushed to fork** |
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

## Provider / AI Notes (decisions, not yet implemented)

- Upstream uses **OpenAI** (`gpt-4o-mini` chat, `text-embedding-3-small` @ 1536 dims) through the OpenAI SDK in `tensor.service.ts`.
- **Plan:** chat/summarize → **Gemini 2.5 Flash** (free tier, OpenAI-compatible endpoint, base-URL swap). Embeddings → left on OpenAI (or disabled) because Gemini embeddings are 768-dim and the DB column is locked at `vector(1536)`; changing requires a migration.
- **Preferred framing for upstream:** make the provider **env-configurable** (OpenAI/Gemini/any OpenAI-compatible) rather than a hard Gemini swap — contributable upstream AND supports "bring your own key" for a future hosted model.
- **Privacy posture:** free tiers may train on inputs → public repos only for now; private-repo provider decision deferred.

---

## Change Log

### 2026-06-14 — Security baseline pushed to fork
**Commit:** `chore: security baseline, storage module, queue fix, dep hardening` (branch `chore/security-baseline`)

1. **Hardened `.gitignore`** — merged upstream's app-specific rules with a secrets-leak block (env files, keys/certs, credentials, SOPS/age, token drops). Kept `.env.example` tracked.
   - Files: `.gitignore`
   - Upstream: **maybe** (secrets block is generally useful; some entries are our-posture-specific)

2. **Fixed over-broad `storage/` ignore** — unanchored `storage/` matched `src/common/storage/` source and silently excluded it from commits. Anchored to `/storage/` + `/api/storage/` (runtime artifact dirs only).
   - Files: `.gitignore`
   - Upstream: **YES** — latent footgun for anyone who adds the storage source

3. **Added missing `StorageModule` / `StorageService`** — upstream `dev` does not compile; six files import `./common/storage/*` that was never committed. Wrote to the `STORAGE_CONFIG.md` contract (`getProjectPath`, `ensureProjectDirectory`, `deleteProjectDirectory`), mirroring `S3Service`'s `process.cwd()/storage/any-bucket` root. **Path-traversal hardened**: cuid-pattern ID validation + resolved-path containment check before any mkdir/rm; delete re-validates immediately before `fs.rm`.
   - Files: `api/src/common/storage/storage.service.ts`, `api/src/common/storage/storage.module.ts`
   - Upstream: **YES (headline)** — makes the branch buildable

4. **Fixed `QueueService` dual-ioredis type conflict** — root `ioredis@5.11.1` vs bullmq's nested `5.10.1` breaks `tsc` (`Type 'Redis' is not assignable to 'ConnectionOptions'`). Switched to passing a typed `ConnectionOptions` object instead of a constructed `Redis` instance (also the recommended BullMQ pattern). **Also wired the previously-ignored Redis password** (`process.env.REDIS_PASSWORD`), and added cleanup of the `events` map in `onModuleDestroy` (latent leak upstream).
   - Files: `api/src/common/queue/queue.service.ts`
   - Upstream: **YES** — compile fix + correctness

5. **Added local dev `docker-compose`** — Makefile references `../docker/docker-compose.yml` (outside repo, nonexistent). Wrote `docker/docker-compose.dev.yml`: pgvector Postgres + Redis, **loopback-bound**, `no-new-privileges`, healthchecks, Redis password required, secrets via gitignored `docker/.env` with `:?` guards that refuse to start on unset values.
   - Files: `docker/docker-compose.dev.yml`
   - Upstream: **maybe** — they may intend user-supplied DBs; offer as "working dev compose"

6. **Pinned Next.js `16.2.9`** (was `"latest"`) + resolved postcss advisory — `"latest"` is non-deterministic/security-risky. Pinned to current stable. Cleared 10 frontend vulns (1 critical Next RCE, 6 high) via non-forced `npm audit fix`; remaining postcss moderate resolved by aligning the direct dep to `^8.5.10` + `overrides`.
   - Files: `frontend/package.json`, `frontend/package-lock.json`
   - Upstream: **maybe** — security yes, pinning may be debated

7. **Added pre-commit security gate** — gitleaks (secret scan), detect-private-key, large-file/merge-conflict/case-conflict checks, yaml/json validation, EOL fixers, and a custom `forbid-dotenv` hook (blocks any real `.env` even via `git add -f`). Full-history gitleaks scan: **69 commits, no leaks found.**
   - Files: `.pre-commit-config.yaml`, `scripts/forbid-dotenv.sh`
   - Upstream: **fork-only** (our security posture)

---

## Outstanding / Known Issues (not yet fixed)

| # | Issue | Where | Notes |
|---|-------|-------|-------|
| A | "Failed to load projects" — `ProjectsPage` crashes on `Cannot read properties of undefined (reading 'type')` | frontend + `GET /api/projects` | Needs api terminal log; frontend should also handle error payload gracefully |
| B | Project analysis errors (0 files, 0 B) on a GitHub repo | `fetch-files` worker / StorageService / GitHub fetch | Likely no `GITHUB_TOKEN` (60/hr unauth limit) OR storage path issue — needs api log to confirm |
| C | `"license": "MIT"` in `api/package.json` contradicts AGPL-3.0 LICENSE | `api/package.json` | False license declaration; fix to AGPL-3.0. **Upstream PR candidate.** |
| D | `tree-sitter-markdown@0.7.1` fails native compile (`-fexceptions`) | `api` install | Worked around via `--ignore-scripts` (regex fallback). Revisit for AST precision or drop the parser. |
| E | Gemini provider swap not yet implemented | `tensor.service.ts` | See Provider/AI Notes above |
| F | CI workflow (GitHub Actions) enforcing full gate not yet written | `.github/workflows/` | gitleaks + SAST + dep audit + lint + tests/coverage (80/95) |

---

## Upstream PR Plan (when ready)

Group into focused PRs (don't bundle our-posture changes with genuine fixes):
- **PR 1 (high value):** StorageModule/StorageService + anchored gitignore → makes `dev` compile.
- **PR 2:** QueueService ioredis fix + Redis password wiring.
- **PR 3:** `package.json` license correction (MIT → AGPL-3.0).
- **PR 4 (optional):** env-configurable LLM provider.
- **PR 5 (optional):** working dev docker-compose.

Keep our fork-only items (remapped ports, generated secrets, pre-commit config) **out** of upstream PRs.

---

## Workflow Standards (reference)
- Answer first; complete files over diffs; one file at a time; Shane commits via `gh`, squash-merge, delete branch.
- Deploy: Portainer image pulls only, never direct server edits.
- No plaintext secrets anywhere; LLM key server-side only (never in frontend bundle).
- Every push passes: gitleaks, SAST (bandit/semgrep), dependency audit, lint (zero ruff/eslint warnings), tests + coverage (80% global / 95% critical).
- Egress allowlisted to the LLM endpoint only.
