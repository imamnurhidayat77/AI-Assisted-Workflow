# Graph Report - Smart City Street  (2026-11-02)

## Corpus Check
- 82 files · ~36,650 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 13 file(s) not represented in the graph (top: .csv 4, (none) 3, .example 2)

## Summary
- 603 nodes · 1231 edges · 38 communities (36 shown, 2 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 39 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b1d01435`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- api/package.json
- Shell
- ingest.ts
- llm.ts
- web/package.json
- shared/src/index.ts
- compilerOptions
- scripts
- services/drafts.ts
- compilerOptions
- Requirements Brief — Street Smart Cockpit
- db
- api/src/index.ts
- services/auth.ts
- shared/package.json
- auth.tsx
- make-fixtures.py
- sql.ts
- System Design — Street Smart Cockpit
- hr.ts
- Ponytail Help
- Ponytail Help
- services/tenders.ts
- Street Smart Cockpit — AI Leverage untuk Smart City Street Ltd NZ
- agent/skills/ponytail-audit/SKILL.md
- Ponytail Gain
- agent/skills/ponytail-review/SKILL.md
- Ponytail
- AGENTS.md
- .agents/skills/ponytail-audit/SKILL.md
- Ponytail Gain
- .agents/skills/ponytail-review/SKILL.md
- Ponytail
- finance.ts
- agent/skills/ponytail-debt/SKILL.md
- .agents/skills/ponytail-debt/SKILL.md

## God Nodes (most connected - your core abstractions)
1. `Shell()` - 28 edges
2. `Icon()` - 25 edges
3. `Button()` - 25 edges
4. `useToast()` - 23 edges
5. `PageHeader()` - 19 edges
6. `@prisma/client` - 17 edges
7. `Body()` - 17 edges
8. `Status()` - 17 edges
9. `chatWithAI()` - 16 edges
10. `compilerOptions` - 16 edges

## Surprising Connections (you probably didn't know these)
- `3.4 RAG pipeline (`services/ingest.ts`, `embeddings.ts`, `retrieval.ts`)` --references--> `embed()`  [INFERRED]
  docs/02-system-design.md → apps/api/src/services/embeddings.ts
- `3. Backend (`apps/api`)` --references--> `requireAuth()`  [INFERRED]
  docs/02-system-design.md → apps/api/src/services/auth.ts
- `3.3 Drafts service (`services/drafts.ts`, `routes/drafts.ts`, `routes/jobs.ts`)` --references--> `DocumentStore`  [INFERRED]
  docs/02-system-design.md → apps/api/src/services/documents.ts
- `2. Dimensi evaluasi (traceable ke NFR)` --references--> `embed()`  [INFERRED]
  docs/03-test-evaluation-plan.md → apps/api/src/services/embeddings.ts
- `3. Cara jalan (urutan ponytail: yang murah dulu)` --references--> `ingestDocument()`  [INFERRED]
  docs/03-test-evaluation-plan.md → apps/api/src/services/ingest.ts

## Import Cycles
- None detected.

## Communities (38 total, 2 thin omitted)

### Community 0 - "api/package.json"
Cohesion: 0.05
Nodes (53): dependencies, cors@^2.8.5, dotenv@^16.4.5, @huggingface/transformers@^4.3.2, mammoth@^1.13.0, multer@^2.5.0, pdf-parse@^2.4.5, pgvector@^0.3.0 (+45 more)

### Community 1 - "Shell"
Cohesion: 0.13
Nodes (49): nextConfig, AlertsPage(), ConnectionsPage(), AssistantPicker(), Body(), ConversationPage(), draftTone(), ConversationsPage() (+41 more)

### Community 2 - "ingest.ts"
Cohesion: 0.05
Nodes (54): Check, checks, FIXTURE_TEXT, LIVE, main(), ok(), Fixture, HERE (+46 more)

### Community 3 - "llm.ts"
Cohesion: 0.20
Nodes (19): chatWithAI(), chatWithHttp(), chatWithMock(), docAnswer(), extractOutputText(), LlmChatResult, stripFences(), ChunkHit (+11 more)

### Community 4 - "web/package.json"
Cohesion: 0.08
Nodes (31): dependencies, next@^15.1.0, react@^19.0.0, react-dom@^19.0.0, socket.io-client@^4.8.4, @street-smart/shared@*, devDependencies, tailwindcss@^4.0.0 (+23 more)

### Community 5 - "shared/src/index.ts"
Cohesion: 0.10
Nodes (19): AlertItem, ASSISTANT_BY_ID, ASSISTANT_ROLES, AssistantDefinition, ConversationItem, DRAFT_KINDS, DRAFT_STATUSES, getAssistant() (+11 more)

### Community 6 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 7 - "scripts"
Cohesion: 0.11
Nodes (18): description, engines, node, name, private, scripts, build, build:api (+10 more)

### Community 8 - "services/drafts.ts"
Cohesion: 0.09
Nodes (30): r, r, asJson(), createDraft(), CreateDraftInput, DraftStore, editDraft(), getDraft() (+22 more)

### Community 9 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, declaration, esModuleInterop, lib, module, moduleResolution, outDir, resolveJsonModule (+5 more)

### Community 10 - "Requirements Brief — Street Smart Cockpit"
Cohesion: 0.12
Nodes (15): 1. Background, 2. Objectives (from internship agreement), 3. Stakeholders & Users, 4.1 AI Chat (Joule-style copilot), 4.2 Document Ingestion & Extraction, 4.3 Data Management, 4.4 Reports & Operations, 4.5 Human-in-the-Loop Drafts (AI drafter, human decider) (+7 more)

### Community 11 - "db"
Cohesion: 0.14
Nodes (13): container_name, environment, image, ports, restart, volumes, POSTGRES_DB, POSTGRES_PASSWORD (+5 more)

### Community 12 - "api/src/index.ts"
Cohesion: 0.13
Nodes (14): express@^4.21.2, app, httpServer, port, ChatMessagePayload, emitDraftChanged(), STAGE_LABEL, r (+6 more)

### Community 13 - "services/auth.ts"
Cohesion: 0.22
Nodes (14): main(), mapStatus(), prisma, initRealtime(), r, auditChat(), authenticate(), authenticateKey() (+6 more)

### Community 14 - "shared/package.json"
Cohesion: 0.29
Nodes (6): main, name, private, type, types, version

### Community 15 - "auth.tsx"
Cohesion: 0.20
Nodes (15): metadata, RootLayout(), get(), getStoredKey(), headers(), notify(), onAuthError(), patch() (+7 more)

### Community 18 - "make-fixtures.py"
Cohesion: 0.18
Nodes (3): main(), save_csv(), specs()

### Community 19 - "sql.ts"
Cohesion: 0.24
Nodes (11): buildSql(), db(), mockAnswerSql(), quoteIdent(), runValidatedSql(), splitColumns(), SqlResult, ValidatedQuery (+3 more)

### Community 20 - "System Design — Street Smart Cockpit"
Cohesion: 0.17
Nodes (11): 1.1 Repository layout, 1.2 Design decisions (ADRs, condensed), 1. Architecture Overview, 2. Frontend (`apps/web`), 3.1 AI service (`services/llm.ts`, `realtime.ts`), 3.4 RAG pipeline (`services/ingest.ts`, `embeddings.ts`, `retrieval.ts`), 3. Backend (`apps/api`), 5. AI Grounding & Anti-Hallucination (+3 more)

### Community 21 - "hr.ts"
Cohesion: 0.27
Nodes (10): db(), getHrSnapshot(), DomainSnapshots, 4. Data Model (Prisma / Postgres), CloseCheckItem, hrPolicies, HrPolicy, Invoice (+2 more)

### Community 22 - "Ponytail Help"
Cohesion: 0.22
Nodes (8): Band (Claude Code), Configure Default Mode, Deactivate, Levels, More, Ponytail Help, Skills, Update

### Community 23 - "Ponytail Help"
Cohesion: 0.22
Nodes (8): Band (Claude Code), Configure Default Mode, Deactivate, Levels, More, Ponytail Help, Skills, Update

### Community 24 - "services/tenders.ts"
Cohesion: 0.48
Nodes (6): db(), filterMock(), filterRows(), getTenders(), STATUS_LABEL, tenders

### Community 25 - "Street Smart Cockpit — AI Leverage untuk Smart City Street Ltd NZ"
Cohesion: 0.29
Nodes (6): API stub (apps/api), Cara jalan (mock, tanpa DB dulu), Dengan Postgres, Langkah berikutnya ke arah SAP Joule beneran, Street Smart Cockpit — AI Leverage untuk Smart City Street Ltd NZ, Struktur halaman (dipetakan dari Figma Make)

### Community 26 - "agent/skills/ponytail-audit/SKILL.md"
Cohesion: 0.40
Nodes (4): 1. Map first, 2. Look for, 3. Check before you report, 4. Output

### Community 27 - "Ponytail Gain"
Cohesion: 0.40
Nodes (4): Boundaries, Honesty boundary, Ponytail Gain, Scoreboard

### Community 28 - "agent/skills/ponytail-review/SKILL.md"
Cohesion: 0.40
Nodes (4): 1. Understand first, 2. Look for, 3. Check before you report, 4. Output

### Community 29 - "Ponytail"
Cohesion: 0.40
Nodes (4): Before you write, Levels, Ponytail, The smallest complete change

### Community 30 - "AGENTS.md"
Cohesion: 0.40
Nodes (3): graphify, Peta repo, Prinsip setiap pengembangan

### Community 31 - ".agents/skills/ponytail-audit/SKILL.md"
Cohesion: 0.40
Nodes (4): 1. Map first, 2. Look for, 3. Check before you report, 4. Output

### Community 32 - "Ponytail Gain"
Cohesion: 0.40
Nodes (4): Boundaries, Honesty boundary, Ponytail Gain, Scoreboard

### Community 33 - ".agents/skills/ponytail-review/SKILL.md"
Cohesion: 0.40
Nodes (4): 1. Understand first, 2. Look for, 3. Check before you report, 4. Output

### Community 34 - "Ponytail"
Cohesion: 0.40
Nodes (4): Before you write, Levels, Ponytail, The smallest complete change

### Community 35 - "finance.ts"
Cohesion: 0.50
Nodes (4): db(), getFinanceSnapshot(), closeChecklist, invoices

### Community 36 - "agent/skills/ponytail-debt/SKILL.md"
Cohesion: 0.50
Nodes (3): Boundaries, Output, Scan

### Community 37 - ".agents/skills/ponytail-debt/SKILL.md"
Cohesion: 0.50
Nodes (3): Boundaries, Output, Scan

## Knowledge Gaps
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@prisma/client` connect `ingest.ts` to `api/package.json`, `finance.ts`, `llm.ts`, `services/drafts.ts`, `services/auth.ts`, `sql.ts`, `hr.ts`, `services/tenders.ts`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Should `api/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.050314465408805034 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Shell` to `web/package.json`, `auth.tsx`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Should `Shell` be split into smaller, more focused modules?**
  _Cohesion score 0.12548076923076923 - nodes in this community are weakly interconnected._
- **Why does `next` connect `Shell` to `web/package.json`, `auth.tsx`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Should `ingest.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.053313587560162905 - nodes in this community are weakly interconnected._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08064516129032258 - nodes in this community are weakly interconnected._