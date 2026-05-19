# Reproducibility Appendices (RepoLens Thesis)

This appendix reflects the actual RepoLens implementation used in this thesis.

## Study Snapshot

- Repository: `repolens-core`
- Branch: `dev`
- Commit: `b111026`
- OS: macOS `15.5`
- CPU architecture: `arm64` (Apple Silicon, M1-class machine)
- Node.js: `v22.17.1`

---

## Appendix A - Repository Overview

### A.1 Repository Layout

- `api/` - NestJS backend for indexing, matching, metrics, and ground-truth management
- `frontend/` - Next.js annotation and evaluation UI
- `dataset/` - exported matcher CSVs per benchmark project
- `docs/requirements/` - requirement documents used for extraction/matching
- `notebook/Repolens.ipynb` - notebook artifact
- `api/src/common/prompts/` - centralized prompt templates

### A.2 Core Backend Modules Used

- `api/src/repositories/repositories.service.ts` - repository analysis orchestration
- `api/src/workers/parser.worker.ts` - parsing and node extraction
- `api/src/workers/embedding.worker.ts` - embedding generation and persistence
- `api/src/requirements/requirements.service.ts` - extraction and requirement matching
- `api/src/requirements/traceability-metrics.service.ts` - metrics and threshold evaluation

### A.3 Benchmark Projects Present in Dataset

- `bubbletea`
- `caddy`
- `esbuild`
- `fastapi`
- `go-redis`
- `json-server`
- `minisearch`
- `mitt`
- `requests`
- `typer`

---

## Appendix B - Embedding Pipeline (CLI)

### B.1 Model and Vector Configuration

From `api/src/common/tensor/tensor.service.ts`:

- Embedding model: `text-embedding-3-small`
- Embedding dimension: `1536`
- Chat/summarization model: `gpt-4o-mini`

From matching/search services:

- Query vectors are required to be 1536 dimensions
- Vector similarity is cosine-style via pgvector distance conversion

### B.2 Runtime Commands

Backend:

```bash
cd api
npm install
npm run build
npm run start
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

### B.3 Pipeline Stages

1. Repository analyze starts
2. Files are scanned and filtered by language support
3. Parse worker creates `Node` records and symbol references
4. Embedding worker creates vectors and stores them in `Embedding.vector`
5. Requirement matchers consume indexed nodes for link prediction

### B.4 Storage Mode and `api/storage` Note

Storage behavior is implemented in `api/src/common/s3/s3.service.ts`:

- If `LOCAL_STORAGE=true`, artifacts are written under:
  - `storage/any-bucket` (resolved from backend working directory)
- In this mode, local files include repository archives, file blobs, and AST artifacts.
- This is why local runs may create storage data under the API workspace path.

Operational checks:

- If vectors are missing (`Embedding.vector IS NULL`), embedding-based matching may return zero links.
- If `DIRECT_URL` or pgvector is misconfigured, vector persistence/search can fail.

---

## Appendix C - Requirement Extraction UI

UI page: `frontend/src/app/dashboard/requirements/page.tsx`

Workflow used:

1. Select project
2. Upload document (PDF/DOCX/TXT/MD) or paste requirement text
3. Run extraction
4. Run matching:
   - single matcher via `match/all` + `matcherType`, or
   - all matchers via `match/all-baselines`
5. Review links and mark ground truth

Primary API endpoints:

- `POST /api/requirements/extract`
- `POST /api/requirements/extract/upload`
- `POST /api/requirements/match/all`
- `POST /api/requirements/match/all-baselines`
- `POST /api/requirements/ground-truth/:projectId`
- `POST /api/requirements/ground-truth/:projectId/bulk`
- `DELETE /api/requirements/ground-truth?requirementId=...&nodeId=...`

---

## Appendix D - Dataset Description

### D.1 Dataset Structure

Each project folder in `dataset/` contains:

- `embedding.csv`
- `hybrid.csv`
- `tfidf.csv`
- `structural-only.csv`

### D.2 Ground Truth Data Model

Ground truth is stored as link-level pairs in `RequirementGroundTruth`:

- unit of annotation: `(requirementId, nodeId)`
- uniqueness: `requirementId + nodeId`

### D.3 Prediction Data Model

Predictions are stored in `RequirementMatch`:

- keyed by `(requirementId, nodeId, matcherType)`
- scored by `matchScore`
- filtered during evaluation using `matchScore >= threshold`

---

## Appendix E - Ground Truth Examples and Protocol

Ground truth in RepoLens is link-level, not requirement-level.

Annotation and QA protocol used in this thesis is documented in:

- `annotation_guide.md`

That guide contains:

- inclusion/exclusion criteria for true links
- consistency rules across annotators/sessions
- leakage-avoidance practices
- final QA checklist before export/evaluation

---

## Appendix F - Matching and Evaluation Logic

### F.1 Matchers Implemented

From `api/src/requirements/matchers/types.ts`:

- `embedding`
- `tfidf`
- `structural-only`
- `hybrid`

### F.2 Score Semantics

- Embedding matcher: dense semantic similarity from vector search
- TF-IDF matcher: cosine similarity over TF-IDF vectors
- Structural-only matcher: structural token overlap, then graph propagation
- Hybrid matcher:
  - semantic retrieval with threshold ladder
  - calibrated score: semantic weight `0.7` + symbol bonus `0.3`
  - graph propagation with `alpha = 0.15`

### F.3 Evaluation Formulation

In `traceability-metrics.service.ts`:

- Ground truth set `G`: links from `RequirementGroundTruth`
- Predicted set `P(tau)`: links from `RequirementMatch` with `matchScore >= tau` for matcher `m`

Metrics:

- Precision = `TP / (TP + FP)`
- Recall = `TP / (TP + FN)`
- F1 = `2TP / (2TP + FP + FN)`
- Coverage = `linkedRequirements / totalRequirements`

### F.4 Threshold and Split Protocol

Threshold grid used:

- `0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9`

Default fallback threshold in compare view:

- `embedding` and `hybrid`: `0.3`
- `tfidf` and `structural-only`: `0.5`

Threshold tuning split:

- 70/30 validation/test on GT links
- fixed seed: `42`
- disjoint split enforced in code

---

## Appendix J - Prompt Design

### J.1 Prompt Source of Truth

All prompts are centralized in:

- `api/src/common/prompts/`

Prompt inventory file:

- `api/src/common/prompts/prompt-catalog.ts`

### J.2 Prompt Families Used

- Requirements extraction prompts
- Summarization prompts
- AI analysis and QA prompts
- RAG response prompts

### J.3 Model Coupling for Prompt Execution

- Embedding path: `text-embedding-3-small` (1536 dimensions)
- Chat/summarization/extraction path: `gpt-4o-mini`

### J.4 Reproducibility Constraint

Prompt and model configuration are fixed to commit `b111026` for this thesis run.  
Any prompt/model change requires re-running matching and evaluation.

# Reproducibility Appendices (RepoLens Thesis)

This appendix is aligned to the RepoLens codebase used in this thesis.

**Study snapshot (this repository state)**

- Repository: `repolens-core`
- Branch: `dev`
- Commit: `b111026`
- Platform: macOS `15.5`, Apple Silicon (`arm64`, M1 class machine)
- Node.js: `v22.17.1`
- Frontend: Next.js app in `frontend/`
- Backend: NestJS API in `api/`

---

## Appendix A – Repository Overview

### A.1 Repository Structure Used in This Study

- `api/` - backend indexing, matching, metrics, and GT APIs
- `frontend/` - annotation + evaluation UI
- `dataset/` - per-project matcher exports (`embedding`, `hybrid`, `tfidf`, `structural-only`)
- `docs/requirements/` - requirement documents for benchmark projects
- `notebook/Repolens.ipynb` - notebook artifact
- `api/src/common/prompts/` - all prompt templates used by the system

### A.2 Core Backend Components

- `api/src/repositories/repositories.service.ts` - repository analyze/index orchestration
- `api/src/workers/parser.worker.ts` - file parsing, node extraction, symbol refs
- `api/src/workers/embedding.worker.ts` - embedding generation + vector persistence
- `api/src/requirements/requirements.service.ts` - extraction and matching workflows
- `api/src/requirements/traceability-metrics.service.ts` - P/R/F1/coverage and threshold logic

### A.3 Repositories Included in Dataset

Based on folders in `dataset/` and documents in `docs/requirements/`:

- `bubbletea`
- `caddy`
- `esbuild`
- `fastapi`
- `go-redis`
- `json-server`
- `minisearch`
- `mitt`
- `requests`
- `typer`

---

## Appendix B – Embedding Pipeline (CLI)

### B.1 Runtime and Model Configuration

From `api/src/common/tensor/tensor.service.ts`:

- Embedding model: `text-embedding-3-small`
- Embedding dimensions: `1536`
- Chat model: `gpt-4o-mini`

From worker/search pipeline:

- Embeddings are generated for parsed code nodes/chunks and stored in `Embedding.vector`
- Query vectors are expected to be 1536-dim and matched with pgvector cosine similarity

### B.2 Commands Used

Backend:

```bash
cd api
npm install
npm run build
npm run start
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

### B.3 Pipeline Stages

1. Repository analysis begins (`repositories.service`)
2. Files scanned and filtered by supported language extensions
3. Parse jobs produce code `Node` records and symbol references
4. Embedding jobs generate vectors for nodes and persist pgvector values
5. Requirements matching runs against indexed nodes

### B.4 Operational Notes

- If vectors are missing (`vector IS NULL`), embedding matcher returns zero links.
- If DB/pgvector direct connection is misconfigured, vector storage/search may fail.
- `SKIP_SUMMARIZATION=true` can reduce token costs during indexing.

---

## Appendix C – Requirement Extraction UI

### C.1 UI Workflow

Path: frontend dashboard requirements page (`frontend/src/app/dashboard/requirements/page.tsx`).

Main operator flow:

1. Select project
2. Upload requirement document (PDF/DOCX/TXT/MD) or paste text
3. Extract requirements
4. Run matching:
   - single matcher via `match/all` with `matcherType`
   - all baselines via `match/all-baselines`
5. Review predicted links and annotate ground truth links

### C.2 Backend Endpoints Used by UI

- `POST /api/requirements/extract`
- `POST /api/requirements/extract/upload`
- `POST /api/requirements/match/all`
- `POST /api/requirements/match/all-baselines`
- `POST /api/requirements/ground-truth/:projectId`
- `POST /api/requirements/ground-truth/:projectId/bulk`
- `DELETE /api/requirements/ground-truth?requirementId=...&nodeId=...`

---

## Appendix D – Dataset Description

### D.1 Dataset Layout

Each project folder under `dataset/` contains:

- `embedding.csv`
- `hybrid.csv`
- `tfidf.csv`
- `structural-only.csv`

### D.2 Ground Truth Representation

Ground truth is link-level:

- table/model: `RequirementGroundTruth`
- unit: `(requirementId, nodeId)` pair
- unique key: `requirementId + nodeId`

### D.3 Matching Prediction Representation

Predictions are stored in `RequirementMatch`:

- key includes `matcherType`
- score field: `matchScore`
- evaluation uses threshold filtering: `matchScore >= tau`

---

## Appendix E – Ground Truth Examples

Ground truth in RepoLens is link-level, not requirement-level labels.

### E.1 Annotation Unit

- True link example format:
  - `requirementId`: `<requirement_uuid>`
  - `nodeId`: `<node_uuid>`
  - `source`: `manual` (or `expert` / `import`)
  - `notes`: optional reviewer rationale

### E.2 Annotation Process Reference

The full annotation protocol used in this thesis is documented in:

- `annotation_guide.md`

That file defines:

- inclusion/exclusion rules
- consistency policy
- leakage-avoidance guidance
- QA checklist before export

---

## Appendix F – Matching & Evaluation Logic

### F.1 Matchers Implemented

From `api/src/requirements/matchers/types.ts`:

- `embedding`
- `tfidf`
- `structural-only`
- `hybrid`

### F.2 Scoring Semantics by Matcher

- **Embedding**: semantic vector similarity from pgvector search.
- **TF-IDF**: cosine similarity over TF-IDF vectors (`tfidf.matcher.ts`).
- **Structural-only**: structural token overlap + graph propagation.
- **Hybrid**:
  - semantic search with threshold ladder
  - calibrated score in matcher:
    - semantic weight `0.7`
    - symbol match bonus `0.3`
  - graph propagation applied (`alpha = 0.15`)

### F.3 Evaluation Formulation

In `traceability-metrics.service.ts`:

- `G` = set of GT pairs from `RequirementGroundTruth`
- `P(tau)` = predicted pairs from `RequirementMatch` for matcher `m` with `matchScore >= tau`

Metrics:

- Precision = `TP / (TP + FP)`
- Recall = `TP / (TP + FN)`
- F1 = `2TP / (2TP + FP + FN)`
- Coverage = `linkedRequirements / totalRequirements`

### F.4 Threshold Protocol Used

Default threshold grid:

- `[0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]`

Default compare threshold fallback:

- `embedding` / `hybrid`: `0.3`
- `tfidf` / `structural-only`: `0.5`

Tuning split:

- validation/test split of GT links = 70/30
- random seed = `42`
- disjoint split enforced

---

## Appendix J – Prompt Design

### J.1 Prompt Source of Truth

All prompts are centralized under:

- `api/src/common/prompts/`

Prompt inventory file:

- `api/src/common/prompts/prompt-catalog.ts`

### J.2 Prompt Families Used

- Requirements extraction prompts (`requirements.prompts.ts`)
- Summarization prompts (`tensor.prompts.ts`)
- AI analysis and QA prompts (`ai.prompts.ts`)
- RAG response prompts (`search.prompts.ts`)

### J.3 Model Coupling

- Prompt execution model for embeddings: `text-embedding-3-small`
- Prompt execution model for chat/summarization/extraction: `gpt-4o-mini`

### J.4 Reproducibility Rule

For experiments in this thesis:

- prompt set is fixed by commit `b111026`
- model names/dimensions are fixed as listed above
- any prompt/model change requires re-running matching + evaluation

# Reproducibility Appendix Template (RepoLens)

Use this template directly in your thesis/paper appendix.  
Replace placeholders like `<...>` with your project-specific values.

---

## Appendix A – Repository Overview

### A.1 Study Snapshot

| Item | Value |
|------|-------|
| Repository | `<repo url/name>` |
| Commit SHA | `<git rev-parse HEAD>` |
| Branch | `<branch name>` |
| Run Date | `<yyyy-mm-dd>` |
| OS / Hardware | `<e.g., macOS + CPU/RAM>` |
| Backend Runtime | `<Node version>` |
| Frontend Runtime | `<Node version>` |
| DB / Vector | `<Postgres version, pgvector version>` |
| Queue | `<Redis version>` |

### A.2 Codebase Layout

- `api/` – backend services (indexing, matching, metrics)
- `frontend/` – annotation and evaluation UI
- `dataset/` – exported per-project matcher CSV outputs
- `docs/requirements/` – requirement documents per benchmark project
- `api/src/common/prompts/` – prompt templates used in experiments

### A.3 Major Components

| Component | Responsibility |
|-----------|----------------|
| `repositories.service` | repository ingest/analyze orchestration |
| `parser.worker` | parse files, extract nodes/symbol refs |
| `embedding.worker` | generate/store vectors for nodes |
| `requirements.service` | extraction and match orchestration |
| `traceability-metrics.service` | precision/recall/F1/coverage at threshold(s) |

---

## Appendix B – Embedding Pipeline (CLI)

### B.1 Environment Configuration

Required variables:

- `OPENAI_API_KEY=<...>`
- `DATABASE_URL=<...>`
- `DIRECT_URL=<...>` (direct DB connection for pgvector ops)
- `REDIS_HOST=<...>`
- `REDIS_PORT=<...>`

Optional variables:

- `SKIP_SUMMARIZATION=true|false`
- `DISABLE_WORKERS=true|false`

### B.2 Reproduction Commands

```bash
# 1) Backend
cd api
npm install
npm run build
npm run start

# 2) Frontend
cd ../frontend
npm install
npm run dev
```

### B.3 Pipeline Description

1. Repository analyzed (`/api/repositories/:id/analyze`)
2. Files scanned and filtered by supported extensions
3. Files parsed into nodes (`Node`)
4. Embeddings created per node (`Embedding.vector`)
5. Symbol references generated for graph-aware matching

### B.4 Verification Checks

- Embeddings with vectors exist: `Embedding.vector IS NOT NULL`
- Worker queues active: parse + embed jobs consumed
- Repo status transitions complete (`INDEXING -> INDEXED`)

### B.5 Embedding Configuration

| Parameter | Value |
|-----------|-------|
| Model | `<e.g., text-embedding-3-small>` |
| Dimensions | `<e.g., 1536>` |
| Input unit | `<node text / chunk text>` |
| Truncation policy | `<chars/tokens if applied>` |

---

## Appendix C – Requirement Extraction UI

### C.1 UI Path

- Navigate to: `<frontend route, e.g., /dashboard/requirements>`

### C.2 Extraction Procedure

1. Select project
2. Upload requirements document or paste text
3. Run extraction
4. Review generated requirements
5. Run matching (`Match all` or `Match all baselines`)

### C.3 Inputs and Constraints

| Input Type | Supported |
|------------|-----------|
| PDF | Yes |
| DOCX | Yes |
| TXT / MD | Yes |
| Pasted text | Yes |

### C.4 Output Artifacts

- Number of extracted requirements
- Requirement records (`Requirement`)
- Optional auto-match queue jobs

---

## Appendix D – Dataset Description

### D.1 Projects Included

| Project | Language(s) | Domain | Size (LOC/files) |
|---------|-------------|--------|------------------|
| `<project>` | `<lang>` | `<domain>` | `<size>` |

### D.2 Dataset Statistics

| Project | #Requirements | #Nodes | #GT Links | #Pred Links (Hybrid) | #Pred Links (Embedding) | #Pred Links (TF-IDF) | #Pred Links (Structural) |
|---------|---------------|--------|-----------|-----------------------|-------------------------|----------------------|--------------------------|
| `<project>` | `<n>` | `<n>` | `<n>` | `<n>` | `<n>` | `<n>` | `<n>` |

### D.3 Inclusion/Filtering Policy

- Requirement deduplication rule: `<...>`
- Node inclusion rule: `<...>`
- Unsupported files excluded: `<...>`

### D.4 Split Strategy (if applicable)

| Split | Ratio | Seed | Notes |
|-------|-------|------|-------|
| Validation | `<e.g., 70%>` | `<e.g., 42>` | `<disjoint link split>` |
| Test | `<e.g., 30%>` | `<e.g., 42>` | `<disjoint link split>` |

---

## Appendix E – Ground Truth Examples

### E.1 Positive Examples

| Requirement ID | Requirement Text (short) | Node ID / Path | Why True |
|----------------|---------------------------|----------------|----------|
| `<req>` | `<text>` | `<node>` | `<rationale>` |

### E.2 Hard Negative Examples

| Requirement ID | Candidate Node | Why Rejected |
|----------------|----------------|--------------|
| `<req>` | `<node>` | `<reason>` |

### E.3 Annotation Protocol

- GT is link-level (`requirementId`, `nodeId`)
- Consistency policy: `<granularity, scope rules>`
- Conflict resolution: `<single annotator / adjudication>`
- Reference guide: `annotation_guide.md`

---

## Appendix F – Matching & Evaluation Logic

### F.1 Matchers

- `hybrid`
- `embedding`
- `tfidf`
- `structural-only`

### F.2 Score Semantics

| Matcher | Score Basis | Range |
|---------|-------------|-------|
| Embedding | cosine similarity | `[0,1]` |
| TF-IDF | cosine similarity over TF-IDF vectors | `[0,1]` |
| Structural | token/structure overlap heuristic | `[0,1]` (normalized) |
| Hybrid | embedding-led score + graph propagation | `[0,1]` |

### F.3 Prediction and Ground Truth Sets

- Predicted set at threshold `tau`:  
  `P(tau) = { (r, n) in RequirementMatch | matchScore >= tau AND matcherType = m }`
- Ground truth set:  
  `G = { (r, n) in RequirementGroundTruth }`

### F.4 Metrics

- Precision = `TP / (TP + FP)`
- Recall = `TP / (TP + FN)`
- F1 = `2TP / (2TP + FP + FN)`
- Coverage = `|linked requirements| / |requirements|`

### F.5 Threshold Protocol

- Threshold grid: `<e.g., 0.05..0.9>`
- Per-matcher default threshold: `<values>`
- Tuning strategy: `<validation argmax F1, evaluate once on test>`

---

## Appendix J – Prompt Design

### J.1 Prompt Inventory

| Prompt ID | File | Type | Used By |
|-----------|------|------|---------|
| `<id>` | `<path>` | `system` / `user-template` | `<service>` |

Recommended source: `api/src/common/prompts/prompt-catalog.ts`

### J.2 Prompt Families

- Requirements extraction prompts
- Summarization prompts
- AI analysis prompts
- RAG response prompts

### J.3 Prompt Reproducibility Notes

- Fix commit SHA for prompt versioning
- Record model name/version and temperature
- Record truncation limits and max tokens
- Re-run experiments whenever prompts change

---

## Reproducibility Checklist (Optional)

- [ ] Commit SHA pinned
- [ ] Environment variables documented
- [ ] Dataset project list fixed
- [ ] GT annotation protocol fixed
- [ ] Threshold grid fixed
- [ ] Prompt catalog version recorded
- [ ] Commands and outputs archived

