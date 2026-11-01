# Requirements Brief — Street Smart Cockpit

**Project:** Business Optimization — AI-assisted data management & business process platform
**Organisation:** Smart City Street Ltd, NZ
**Period:** 16 November 2026 – 5 February 2027 (10 weeks)
**Author:** Imam Nurhidayat (ICT Internship, Innovation NZ)
**Status:** Living document — v1.0

---

## 1. Background

Smart City Streets handles government tenders, distributor sales, product catalogues
(Smartstud, Smartped, tunnel markers), quotations, and supporting documents across
New Zealand, Australia, and other markets. Information is scattered across PDFs,
spreadsheets, and disconnected records, making it hard to search, compare, and report.

This project builds a **working full-stack prototype** of a data management and
business process platform with an SAP Joule-style AI copilot ("Street Smart Cockpit"),
and explores how modern AI tools improve information handling: extracting and
structuring information from documents, easier search, useful reports, and automation
of selected routine tasks.

## 2. Objectives (from internship agreement)

| # | Objective | Mapped feature(s) |
|---|-----------|-------------------|
| O1 | Extract & structure information from documents | Document ingestion → upload, processing queue, structured extraction preview (`/documents`, `GET /api/documents/:id/extract`) |
| O2 | Make information easier to search | AI chat grounded on live tender data (`/conversation`, `POST /api/chat`), database explorer (`/data`) |
| O3 | Produce useful reports | Tender reports + KPI (`/reports`, `GET /api/reports/summary`) |
| O4 | Automate selected routine tasks | Jobs & automations (`/jobs`): deadline monitoring, sales import, weekly summaries |

## 3. Stakeholders & Users

| Role | Need |
|---|---|
| Operations staff (e.g. Isaac Ngatai, persona) | Prioritise tenders, track deadlines, find quotations awaiting approval |
| Management | Pipeline analytics by country, success rate, monthly performance |
| IT / handover recipient | Clean codebase, docs, reproducible local setup |

> Prototype assumes a **single demo user**; multi-user auth is out of scope (see §7).

## 4. Functional Requirements

### 4.1 AI Chat (Joule-style copilot)
- **FR-01** User asks natural-language questions from Discover, global search, or conversation view.
- **FR-02** System returns: answer title + explanation, up to 3 tender cards, AI recommendation, sources with references, follow-up suggestions.
- **FR-03** Tender cards shown must come from **live database rows** — the system must never invent tender IDs (validated server-side).
- **FR-04** Every chat response carries provenance headers (`X-AI-Via: mock|http`, `X-Data-Via: db|mock`) for evaluation.
- **FR-05** "New conversation" opens a blank composer; clicking a history item opens that conversation's detail (no separate menu).

### 4.2 Document Ingestion & Extraction
- **FR-06** Upload PDF/XLSX/XLS/CSV/DOCX (max 50 MB) via picker or drag-drop; unsupported types rejected.
- **FR-07** Each file gets a processing status (`Processing` → `Processed`/`Completed`) visible in the queue with polling.
- **FR-08** Each document exposes a **structured extraction preview** (document kind, confidence, key fields).
- **FR-09** Documents can be deleted (metadata + stored file).

### 4.3 Data Management
- **FR-10** Tender records stored in Postgres (Prisma) with full CRUD-ready model; list + search API (`GET /api/tenders?q=`).
- **FR-11** Database explorer shows indexed records with search, dataset catalog, and row selection.
- **FR-12** DB connection management view (PostgreSQL ops DB, SQL Server sales warehouse, MySQL catalogue — connection status + sync info).

### 4.4 Reports & Operations
- **FR-13** Tender analytics: KPIs (total, pipeline value, success rate, closing soon), monthly performance chart, pipeline-by-country split.
- **FR-14** Jobs view lists automations with trigger, last run, progress; system status + alerts views for operational health.

## 5. Non-Functional Requirements

| # | Requirement | Target |
|---|---|---|
| NFR-01 | Usability | Core tasks (upload→extract, ask→answer, find tender) completable without training; measured by task-completion test |
| NFR-02 | Extraction accuracy | ≥ 90% field accuracy on a 20-document ground-truth set |
| NFR-03 | No hallucinated records | 0 invented tender IDs in chat responses (automated check) |
| NFR-04 | Responsiveness | Chat mock latency ~600 ms; pages build as static where possible |
| NFR-05 | Graceful degradation | API works with DB down (mock fallback); UI works with API down (local fallback) |
| NFR-06 | Local reproducibility | Fresh clone → running (mock mode) with `npm install` + 2 commands, no external keys |

## 6. Acceptance Criteria (demo script)

1. Upload a tender PDF → status flips to `Processed` → extraction preview shows tender fields.
2. Ask "Brisbane crossing" → card `TND-2026-004` appears with `X-Data-Via: db`.
3. Insert a tender directly in DB → chat surfaces it without code changes.
4. Kill Postgres → chat + documents still respond (fallback).
5. `npm run build` passes for `apps/web` and `apps/api`.

## 7. Out of Scope (v1)

- Real LLM API key / paid inference (provider interface ready, `AI_PROVIDER=http`).
- Multi-user auth, roles, audit log.
- True PDF parsing/OCR and vector search (extraction is deterministic simulation; RAG is keyword grounding).
- Production deployment, backups, monitoring.

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| No real company data available | Deterministic simulation data mirroring real shapes; documented as ground truth for evaluation |
| AI hallucinations undermine trust | ID validation against DB; provenance headers; disclaimer in UI |
| Port/environment conflicts on demo machine | Dockerised Postgres on 5433; mock fallbacks at every layer |

## 9. Traceability to Agreement Deliverables

- Requirements brief + DB/system design → **this doc + `02-system-design.md`**
- Working prototype (DB + backend + web) → monorepo `apps/*`
- AI-assisted processing/reporting workflow → chat grounding + extraction + reports
- Testing & evaluation → `03-test-evaluation-plan.md` (planned)
- Technical docs + handover → `README.md` + this folder
