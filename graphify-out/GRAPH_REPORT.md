# Graph Report - Smart City Street  (2026-11-04)

## Corpus Check
- 131 files · ~79,895 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 17 file(s) not represented in the graph (top: .csv 8, (none) 3, .example 2)

## Summary
- 797 nodes · 2060 edges · 36 communities (26 shown, 10 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 70 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9db15201`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- api/package.json
- Shell
- routes/documents.ts
- socket.ts
- web/package.json
- shared/src/index.ts
- compilerOptions
- scripts
- services/drafts.ts
- compilerOptions
- Requirements Brief — Street Smart Cockpit
- embeddings.ts
- dotenv
- realtime.ts
- shared/package.json
- conversation/page.tsx
- make-fixtures.py
- llm.ts
- sql.ts
- @types/multer@^2.3.0
- pgvector
- api/src/index.ts
- Changelog — Street Smart Copilot
- drafts.transitions.test.ts
- AGENTS.md
- seed.ts
- dependencies
- drafts.transitions.test.ts
- scripts
- Handover Guide — Street Smart Cockpit
- db-backup.sh
- mammoth

## God Nodes (most connected - your core abstractions)
1. `Shell()` - 38 edges
2. `Button()` - 37 edges
3. `useToast()` - 35 edges
4. `Icon()` - 34 edges
5. `useAuth()` - 32 edges
6. `PageHeader()` - 29 edges
7. `Status()` - 27 edges
8. `Body()` - 27 edges
9. `@prisma/client` - 27 edges
10. `react` - 23 edges

## Surprising Connections (you probably didn't know these)
- `3.4 RAG pipeline (`services/ingest.ts`, `embeddings.ts`, `retrieval.ts`)` --references--> `embed()`  [INFERRED]
  docs/02-system-design.md → apps/api/src/services/embeddings.ts
- `API stub (apps/api)` --references--> `Quotation`  [INFERRED]
  README.md → packages/shared/src/index.ts
- `3. Backend (`apps/api`)` --references--> `requireAuth()`  [INFERRED]
  docs/02-system-design.md → apps/api/src/services/auth.ts
- `3. Backend (`apps/api`)` --references--> `chatWithAI()`  [INFERRED]
  docs/02-system-design.md → apps/api/src/services/llm.ts
- `3.3 Drafts service (`services/drafts.ts`, `routes/drafts.ts`, `routes/jobs.ts`)` --references--> `draftToJob()`  [INFERRED]
  docs/02-system-design.md → packages/shared/src/index.ts

## Import Cycles
- None detected.

## Communities (36 total, 10 thin omitted)

### Community 0 - "api/package.json"
Cohesion: 0.15
Nodes (17): devDependencies, prisma@^5.22.0, tsx@^4.19.1, @types/cors@^2.8.17, @types/express@^4.17.21, @types/node@^22.7.0, typescript@^5.6.3, name (+9 more)

### Community 1 - "Shell"
Cohesion: 0.10
Nodes (74): nextConfig, AuditRow, AuditsPage(), ConversationsPage(), Row, DataPage(), SqlResult, DeadlinesPage() (+66 more)

### Community 2 - "routes/documents.ts"
Cohesion: 0.06
Nodes (52): text, rows, Check, checks, FIXTURE_TEXT, LIVE, main(), ok() (+44 more)

### Community 3 - "socket.ts"
Cohesion: 0.83
Nodes (3): getSocket(), reauthSocket(), storedKey()

### Community 4 - "web/package.json"
Cohesion: 0.08
Nodes (31): dependencies, next@^15.1.0, react@^19.0.0, react-dom@^19.0.0, socket.io-client@^4.8.4, @street-smart/shared@*, devDependencies, tailwindcss@^4.0.0 (+23 more)

### Community 5 - "shared/src/index.ts"
Cohesion: 0.06
Nodes (32): ACTION_HREFS, ApproverKind, ASSISTANT_BY_ID, ASSISTANT_ROLES, AssistantDefinition, CHECKED_KINDS, conversationHistory, ConversationItem (+24 more)

### Community 6 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 7 - "scripts"
Cohesion: 0.08
Nodes (24): dependencies, @neon/config@^1.10.0, @neon/env@^1.6.8, description, engines, node, name, private (+16 more)

### Community 8 - "services/drafts.ts"
Cohesion: 0.09
Nodes (32): canSee(), mustDecide(), mustOwn(), r, viewerOf(), asJson(), createDraft(), CreateDraftInput (+24 more)

### Community 9 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, declaration, esModuleInterop, lib, module, moduleResolution, outDir, resolveJsonModule (+5 more)

### Community 10 - "Requirements Brief — Street Smart Cockpit"
Cohesion: 0.12
Nodes (15): 1. Background, 2. Objectives (from internship agreement), 3. Stakeholders & Users, 4.1 AI Chat (Joule-style copilot), 4.2 Document Ingestion & Extraction, 4.3 Data Management, 4.4 Reports & Operations, 4.5 Human-in-the-Loop Drafts (AI drafter, human decider) (+7 more)

### Community 11 - "embeddings.ts"
Cohesion: 0.12
Nodes (21): @huggingface/transformers@^4.3.2, clean(), embed(), EMBEDDING_DIMS, embeddingInfo(), EmbeddingProvider, embeddingProvider(), embedHash() (+13 more)

### Community 13 - "realtime.ts"
Cohesion: 0.09
Nodes (36): ChatMessagePayload, draftRooms(), emitDraftChanged(), initRealtime(), MGMT_ROOM, STAGE_LABEL, userRoom(), appendExchange() (+28 more)

### Community 14 - "shared/package.json"
Cohesion: 0.18
Nodes (11): devDependencies, vitest@^5.0.5, main, name, private, scripts, test, type (+3 more)

### Community 15 - "conversation/page.tsx"
Cohesion: 0.14
Nodes (22): LlmChatResult, AssistantPicker(), Body(), ConversationPage(), deniedAnswer(), DocEditor(), draftTone(), offlineAnswer() (+14 more)

### Community 18 - "make-fixtures.py"
Cohesion: 0.12
Nodes (3): main(), save_csv(), specs()

### Community 19 - "llm.ts"
Cohesion: 0.06
Nodes (60): listDrafts(), embedOne(), FinanceSnapshot, db(), getHrSnapshot(), ChatOpts, chatWithAI(), chatWithHttp() (+52 more)

### Community 20 - "sql.ts"
Cohesion: 0.08
Nodes (32): buildSql(), db(), ENUM_HINTS, extractText(), isSqlIntent(), mockAnswerSql(), proposeSql(), quoteIdent() (+24 more)

### Community 23 - "api/src/index.ts"
Cohesion: 0.06
Nodes (53): allowedOrigins, app, httpServer, port, r, dummyPassword(), passwordOk(), r (+45 more)

### Community 26 - "drafts.transitions.test.ts"
Cohesion: 0.29
Nodes (6): buildDraftFromChat(), canApproveDraft(), DRAFT_SLA_DAYS, DraftStatus, templateRefsFromSources(), tenderFactLine()

### Community 30 - "AGENTS.md"
Cohesion: 0.25
Nodes (6): Bahasa, Database — Neon SAJA (jangan pakai docker lagi), graphify, Otoritas produk, Peta repo, Prinsip setiap pengembangan

### Community 35 - "seed.ts"
Cohesion: 0.20
Nodes (11): main(), mapStatus(), prisma, newApiKey(), closeChecklist, distributorSales, hrPolicies, invoices (+3 more)

### Community 38 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, cors@^2.8.5, express@^4.21.2, multer@^2.5.0, pdf-parse@^2.4.5, @prisma/client@^5.22.0, socket.io@^4.8.4, @street-smart/shared@* (+7 more)

### Community 39 - "drafts.transitions.test.ts"
Cohesion: 0.44
Nodes (8): asJson(), db(), slaDays(), startScheduler(), sweepEscalations(), sweepQuotationExpiry(), isDraftOverdue(), wasEscalated()

### Community 40 - "scripts"
Cohesion: 0.15
Nodes (13): scripts, build, dev, eval, eval:answers, eval:extraction, lint, prisma:generate (+5 more)

### Community 42 - "Handover Guide — Street Smart Cockpit"
Cohesion: 0.18
Nodes (10): 1. Peta 2 menit, 2. Setup pertama kali (fresh clone), 3. Loop harian, 4. Environment variables, 5. Inventaris kredensial & data, 6. Endpoint reference (ringkas), 7. Troubleshooting, 8. Kesiapan produksi (+2 more)

## Knowledge Gaps
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@prisma/client` connect `api/src/index.ts` to `api/package.json`, `routes/documents.ts`, `seed.ts`, `dependencies`, `drafts.transitions.test.ts`, `services/drafts.ts`, `realtime.ts`, `llm.ts`, `sql.ts`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Should `Shell` be split into smaller, more focused modules?**
  _Cohesion score 0.1014096360193562 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Shell` to `web/package.json`, `conversation/page.tsx`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Should `routes/documents.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0554954954954955 - nodes in this community are weakly interconnected._
- **Why does `next` connect `Shell` to `web/package.json`, `conversation/page.tsx`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08064516129032258 - nodes in this community are weakly interconnected._
- **Should `shared/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06050420168067227 - nodes in this community are weakly interconnected._