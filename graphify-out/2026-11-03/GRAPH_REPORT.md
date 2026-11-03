# Graph Report - Smart City Street  (2026-11-03)

## Corpus Check
- 116 files · ~64,254 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 17 file(s) not represented in the graph (top: .csv 8, (none) 3, .example 2)

## Summary
- 793 nodes · 1924 edges · 52 communities (44 shown, 8 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 69 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2c901b19`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- api/package.json
- Shell
- ingest.ts
- chatWithAI
- web/package.json
- shared/src/index.ts
- compilerOptions
- scripts
- services/drafts.ts
- compilerOptions
- Requirements Brief — Street Smart Cockpit
- embeddings.ts
- realtime.ts
- api/src/index.ts
- shared/package.json
- conversation/page.tsx
- make-fixtures.py
- sql.ts
- System Design — Street Smart Cockpit
- hr.ts
- Ponytail Help
- Ponytail Help
- chat.ts
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
- seed.ts
- agent/skills/ponytail-debt/SKILL.md
- .agents/skills/ponytail-debt/SKILL.md
- dependencies
- drafts.transitions.test.ts
- scripts
- llm.ts
- Handover Guide — Street Smart Cockpit
- sales.ts
- ChatResponse
- socket.ts
- db-backup.sh
- cors
- dotenv
- mammoth
- multer

## God Nodes (most connected - your core abstractions)
1. `Shell()` - 38 edges
2. `Button()` - 37 edges
3. `useToast()` - 35 edges
4. `Icon()` - 34 edges
5. `useAuth()` - 30 edges
6. `PageHeader()` - 29 edges
7. `@prisma/client` - 26 edges
8. `Status()` - 25 edges
9. `Body()` - 24 edges
10. `react` - 23 edges

## Surprising Connections (you probably didn't know these)
- `3.4 RAG pipeline (`services/ingest.ts`, `embeddings.ts`, `retrieval.ts`)` --references--> `embed()`  [INFERRED]
  docs/02-system-design.md → apps/api/src/services/embeddings.ts
- `3. Backend (`apps/api`)` --references--> `requireAuth()`  [INFERRED]
  docs/02-system-design.md → apps/api/src/services/auth.ts
- `2. Dimensi evaluasi (traceable ke NFR)` --references--> `embed()`  [INFERRED]
  docs/03-test-evaluation-plan.md → apps/api/src/services/embeddings.ts
- `3. Backend (`apps/api`)` --references--> `chatWithAI()`  [INFERRED]
  docs/02-system-design.md → apps/api/src/services/llm.ts
- `3. Backend (`apps/api`)` --references--> `proposeSql()`  [INFERRED]
  docs/02-system-design.md → apps/api/src/services/sql.ts

## Import Cycles
- None detected.

## Communities (52 total, 8 thin omitted)

### Community 0 - "api/package.json"
Cohesion: 0.15
Nodes (17): devDependencies, prisma@^5.22.0, tsx@^4.19.1, @types/cors@^2.8.17, @types/express@^4.17.21, @types/node@^22.7.0, typescript@^5.6.3, name (+9 more)

### Community 1 - "Shell"
Cohesion: 0.10
Nodes (72): nextConfig, AuditRow, AuditsPage(), ConversationsPage(), Row, DataPage(), SqlResult, DeadlinesPage() (+64 more)

### Community 2 - "ingest.ts"
Cohesion: 0.06
Nodes (47): text, rows, digits(), fuzzyHas(), Key, letters(), LIVE, main() (+39 more)

### Community 3 - "chatWithAI"
Cohesion: 0.17
Nodes (16): Check, checks, FIXTURE_TEXT, LIVE, main(), ok(), embedOne(), chatWithAI() (+8 more)

### Community 4 - "web/package.json"
Cohesion: 0.08
Nodes (31): dependencies, next@^15.1.0, react@^19.0.0, react-dom@^19.0.0, socket.io-client@^4.8.4, @street-smart/shared@*, devDependencies, tailwindcss@^4.0.0 (+23 more)

### Community 5 - "shared/src/index.ts"
Cohesion: 0.07
Nodes (27): ApproverKind, ASSISTANT_BY_ID, ASSISTANT_ROLES, AssistantDefinition, CHECKED_KINDS, conversationHistory, ConversationItem, DRAFT_KINDS (+19 more)

### Community 6 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 7 - "scripts"
Cohesion: 0.08
Nodes (24): dependencies, @neon/config@^1.10.0, @neon/env@^1.6.8, description, engines, node, name, private (+16 more)

### Community 8 - "services/drafts.ts"
Cohesion: 0.10
Nodes (34): canSee(), mustDecide(), mustOwn(), r, viewerOf(), asJson(), createDraft(), CreateDraftInput (+26 more)

### Community 9 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, declaration, esModuleInterop, lib, module, moduleResolution, outDir, resolveJsonModule (+5 more)

### Community 10 - "Requirements Brief — Street Smart Cockpit"
Cohesion: 0.12
Nodes (15): 1. Background, 2. Objectives (from internship agreement), 3. Stakeholders & Users, 4.1 AI Chat (Joule-style copilot), 4.2 Document Ingestion & Extraction, 4.3 Data Management, 4.4 Reports & Operations, 4.5 Human-in-the-Loop Drafts (AI drafter, human decider) (+7 more)

### Community 11 - "embeddings.ts"
Cohesion: 0.12
Nodes (21): @huggingface/transformers@^4.3.2, clean(), embed(), EMBEDDING_DIMS, embeddingInfo(), EmbeddingProvider, embeddingProvider(), embedHash() (+13 more)

### Community 12 - "realtime.ts"
Cohesion: 0.16
Nodes (20): ChatMessagePayload, draftRooms(), emitDraftChanged(), initRealtime(), MGMT_ROOM, STAGE_LABEL, userRoom(), auditChat() (+12 more)

### Community 13 - "api/src/index.ts"
Cohesion: 0.08
Nodes (36): allowedOrigins, app, httpServer, port, r, dummyPassword(), passwordOk(), r (+28 more)

### Community 14 - "shared/package.json"
Cohesion: 0.18
Nodes (11): devDependencies, vitest@^5.0.5, main, name, private, scripts, test, type (+3 more)

### Community 15 - "conversation/page.tsx"
Cohesion: 0.21
Nodes (18): AssistantPicker(), Body(), ConversationPage(), deniedAnswer(), DocPreview(), draftTone(), offlineAnswer(), PastTurn() (+10 more)

### Community 18 - "make-fixtures.py"
Cohesion: 0.12
Nodes (3): main(), save_csv(), specs()

### Community 19 - "sql.ts"
Cohesion: 0.17
Nodes (14): buildSql(), db(), ENUM_HINTS, extractText(), proposeSql(), quoteIdent(), runValidatedSql(), splitColumns() (+6 more)

### Community 20 - "System Design — Street Smart Cockpit"
Cohesion: 0.14
Nodes (16): del(), get(), headers(), notify(), patch(), post(), 1.1 Repository layout, 1.2 Design decisions (ADRs, condensed) (+8 more)

### Community 21 - "hr.ts"
Cohesion: 0.24
Nodes (13): db(), FinanceSnapshot, getFinanceSnapshot(), db(), getHrSnapshot(), DomainSnapshots, Overview, Overview (+5 more)

### Community 22 - "Ponytail Help"
Cohesion: 0.22
Nodes (8): Band (Claude Code), Configure Default Mode, Deactivate, Levels, More, Ponytail Help, Skills, Update

### Community 23 - "Ponytail Help"
Cohesion: 0.22
Nodes (8): Band (Claude Code), Configure Default Mode, Deactivate, Levels, More, Ponytail Help, Skills, Update

### Community 24 - "chat.ts"
Cohesion: 0.17
Nodes (11): chatLimiter, hits, loginLimiter, prune(), queryLimiter, rateLimit(), RateOpts, db() (+3 more)

### Community 25 - "Street Smart Cockpit — AI Leverage untuk Smart City Street Ltd NZ"
Cohesion: 0.29
Nodes (6): Quotation, API stub (apps/api), Cara jalan (butuh DB Neon — tanpa fallback mock), Langkah berikutnya ke arah SAP Joule beneran, Street Smart Cockpit — AI Leverage untuk Smart City Street Ltd NZ, Struktur halaman (dipetakan dari Figma Make)

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
Cohesion: 0.29
Nodes (5): Bahasa, Database — Neon SAJA (jangan pakai docker lagi), graphify, Peta repo, Prinsip setiap pengembangan

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

### Community 35 - "seed.ts"
Cohesion: 0.20
Nodes (11): main(), mapStatus(), prisma, newApiKey(), closeChecklist, distributorSales, hrPolicies, invoices (+3 more)

### Community 36 - "agent/skills/ponytail-debt/SKILL.md"
Cohesion: 0.50
Nodes (3): Boundaries, Output, Scan

### Community 37 - ".agents/skills/ponytail-debt/SKILL.md"
Cohesion: 0.50
Nodes (3): Boundaries, Output, Scan

### Community 38 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, express@^4.21.2, pdf-parse@^2.4.5, pgvector@^0.3.0, @prisma/client@^5.22.0, socket.io@^4.8.4, @street-smart/shared@*, @types/multer@^2.3.0 (+7 more)

### Community 39 - "drafts.transitions.test.ts"
Cohesion: 0.27
Nodes (11): asJson(), db(), slaDays(), startScheduler(), sweepEscalations(), sweepQuotationExpiry(), DRAFT_SLA_DAYS, DraftHistoryEntry (+3 more)

### Community 40 - "scripts"
Cohesion: 0.17
Nodes (12): scripts, build, dev, eval, eval:extraction, lint, prisma:generate, prisma:migrate (+4 more)

### Community 41 - "llm.ts"
Cohesion: 0.33
Nodes (11): chatWithMock(), docAnswer(), noDataAnswer(), tenderPriorityAnswer(), isSqlIntent(), mockAnswerSql(), financeAnswer(), hrAnswer() (+3 more)

### Community 42 - "Handover Guide — Street Smart Cockpit"
Cohesion: 0.18
Nodes (10): 1. Peta 2 menit, 2. Setup pertama kali (fresh clone), 3. Loop harian, 4. Environment variables, 5. Inventaris kredensial & data, 6. Endpoint reference (ringkas), 7. Troubleshooting, 8. Yang BELUM production-ready (jangan deploy apa adanya) (+2 more)

### Community 43 - "sales.ts"
Cohesion: 0.60
Nodes (4): db(), getSalesSnapshot(), SalesSnapshot, DistributorSale

### Community 44 - "ChatResponse"
Cohesion: 0.50
Nodes (4): LlmChatResult, ThreadMsg, Turn, ChatResponse

### Community 45 - "socket.ts"
Cohesion: 0.83
Nodes (3): getSocket(), reauthSocket(), storedKey()

## Knowledge Gaps
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@prisma/client` connect `api/src/index.ts` to `api/package.json`, `ingest.ts`, `seed.ts`, `chatWithAI`, `dependencies`, `drafts.transitions.test.ts`, `services/drafts.ts`, `sales.ts`, `realtime.ts`, `sql.ts`, `hr.ts`, `chat.ts`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Should `Shell` be split into smaller, more focused modules?**
  _Cohesion score 0.10263157894736842 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Shell` to `web/package.json`, `conversation/page.tsx`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Should `ingest.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05924978687127025 - nodes in this community are weakly interconnected._
- **Why does `next` connect `Shell` to `web/package.json`, `conversation/page.tsx`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08064516129032258 - nodes in this community are weakly interconnected._
- **Should `shared/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._