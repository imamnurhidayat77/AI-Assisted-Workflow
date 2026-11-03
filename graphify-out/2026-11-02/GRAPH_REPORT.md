# Graph Report - Smart City Street  (2026-11-02)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 376 nodes · 755 edges · 18 communities (16 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

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
- conversation/page.tsx
- db
- api/src/index.ts
- seed.ts
- shared/package.json
- layout.tsx

## God Nodes (most connected - your core abstractions)
1. `Shell()` - 27 edges
2. `Button()` - 25 edges
3. `Icon()` - 25 edges
4. `useToast()` - 21 edges
5. `PageHeader()` - 19 edges
6. `compilerOptions` - 16 edges
7. `Status()` - 15 edges
8. `chatWithAI()` - 13 edges
9. `Body()` - 12 edges
10. `compilerOptions` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Body()` --calls--> `mockChatAnswer()`  [EXTRACTED]
  apps/web/src/app/conversation/page.tsx → packages/shared/src/index.ts
- `chatWithMock()` --calls--> `mockChatAnswer()`  [EXTRACTED]
  apps/api/src/services/llm.ts → packages/shared/src/index.ts
- `ChatOpts` --references--> `RoleId`  [EXTRACTED]
  apps/api/src/services/llm.ts → packages/shared/src/index.ts
- `LlmChatResult` --inherits--> `ChatResponse`  [EXTRACTED]
  apps/api/src/services/llm.ts → packages/shared/src/index.ts
- `LlmChatResult` --references--> `Tender`  [EXTRACTED]
  apps/api/src/services/llm.ts → packages/shared/src/index.ts

## Import Cycles
- None detected.

## Communities (18 total, 2 thin omitted)

### Community 0 - "api/package.json"
Cohesion: 0.05
Nodes (49): dependencies, cors@^2.8.5, dotenv@^16.4.5, express@^4.21.2, @huggingface/transformers@^4.3.2, mammoth@^1.13.0, multer@^2.5.0, pdf-parse@^2.4.5 (+41 more)

### Community 1 - "Shell"
Cohesion: 0.16
Nodes (35): nextConfig, AlertsPage(), ConnectionsPage(), ConversationsPage(), DataPage(), DocItem, DocumentsPage(), FALLBACK_DOCS (+27 more)

### Community 2 - "ingest.ts"
Cohesion: 0.08
Nodes (26): Check, checks, FIXTURE_TEXT, LIVE, main(), ok(), ALLOWED, storage (+18 more)

### Community 3 - "llm.ts"
Cohesion: 0.10
Nodes (32): ChatMessagePayload, initRealtime(), STAGE_LABEL, embed(), EMBEDDING_DIMS, embedOne(), embedSingle(), fnv1a() (+24 more)

### Community 4 - "web/package.json"
Cohesion: 0.08
Nodes (31): @types/node@^22.7.0, typescript@^5.6.3, @types/node, typescript, dependencies, next@^15.1.0, react@^19.0.0, react-dom@^19.0.0 (+23 more)

### Community 5 - "shared/src/index.ts"
Cohesion: 0.08
Nodes (26): AlertItem, ASSISTANT_BY_ID, AssistantDefinition, CloseCheckItem, ConversationItem, DRAFT_KINDS, DRAFT_STATUSES, ExtractionSource (+18 more)

### Community 6 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 7 - "scripts"
Cohesion: 0.11
Nodes (18): description, engines, node, name, private, scripts, build, build:api (+10 more)

### Community 8 - "services/drafts.ts"
Cohesion: 0.16
Nodes (14): r, createDraft(), CreateDraftInput, editDraft(), getDraft(), listDrafts(), setDraftStatus(), store (+6 more)

### Community 9 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, declaration, esModuleInterop, lib, module, moduleResolution, outDir, resolveJsonModule (+5 more)

### Community 10 - "conversation/page.tsx"
Cohesion: 0.22
Nodes (9): Body(), ConversationPage(), draftTone(), Composer(), Select(), Textarea(), api, ASSISTANTS (+1 more)

### Community 11 - "db"
Cohesion: 0.14
Nodes (13): container_name, environment, image, ports, restart, volumes, POSTGRES_DB, POSTGRES_PASSWORD (+5 more)

### Community 12 - "api/src/index.ts"
Cohesion: 0.21
Nodes (9): app, httpServer, port, r, r, r, alerts, conversationHistory (+1 more)

### Community 13 - "seed.ts"
Cohesion: 0.22
Nodes (9): main(), mapStatus(), prisma, closeChecklist, hrPolicies, invoices, jobs, leaveRoster (+1 more)

### Community 14 - "shared/package.json"
Cohesion: 0.29
Nodes (6): main, name, private, type, types, version

### Community 15 - "layout.tsx"
Cohesion: 0.50
Nodes (3): metadata, RootLayout(), ToastProvider()

## Knowledge Gaps
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@prisma/client` connect `ingest.ts` to `api/package.json`, `llm.ts`, `seed.ts`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Should `api/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.052244897959183675 - nodes in this community are weakly interconnected._
- **Why does `next` connect `Shell` to `conversation/page.tsx`, `web/package.json`, `layout.tsx`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Should `ingest.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08362369337979095 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Shell` to `conversation/page.tsx`, `web/package.json`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Should `llm.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10099573257467995 - nodes in this community are weakly interconnected._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.07862903225806452 - nodes in this community are weakly interconnected._