# AGENTS.md

Modus default: `ponytail` full (lazy senior dev) + skill di `.agents/skills/ponytail*`.
Perintah: `/ponytail lite|full|ultra`, `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`.

## Prinsip setiap pengembangan

1. **Clean code** — fungsi kecil, nama eksplisit, tanpa kode mati. Pakai helper/komponen/pola yang sudah ada di repo ini dulu, bukan bikin baru.
2. **Maintainability** — ikuti struktur yang ada (`apps/web`, `apps/api`, `packages/shared`). Setiap perubahan wajib selesaikan callers, tests, fixtures, dan exports yang terdampak. Batas yang diketahui ditulis sebagai `shortcut: <batasnya>, <kapan upgrade>`.
3. **Security** — validasi di trust boundary (input API, form, query), jangan log atau expose data sensitif, jangan commit secret, error handling tidak boleh menghilangkan data, least privilege untuk DB/otomasi.

Yang tidak boleh dipotong: validasi, error handling anti data-loss, keamanan, aksesibilitas, dan yang user minta eksplisit.

## Otoritas produk

- Ikuti `docs/PRD.md` (v1.0, Owner: Imam Nurhidayat). Bila bertentangan dengan dokumen lain, PRD menang.
- Perilaku default: **fail clearly** (PRD §7/§9.2/§13.3) — DB/API mati = 503 + empty/error state jujur, tanpa data fabrikasi. Mock hanya mode demo eksplisit (env-gated + badge UI).

## Bahasa

- **UI wajib English semua** — semua string user-facing (halaman, tombol, toast, error, placeholder) dalam English. Jangan campur Indonesian di UI.
- Komentar kode mengikuti konvensi file sekitarnya (boleh Indonesian bila file-nya begitu).

## Peta repo

- `apps/web` Next.js 15 (App Router, TS, Tailwind v4) — state di `apps/web/src/lib/store.tsx`
- `apps/api` Express TS — REST (`/health`, `/api/tenders`, `/api/chat`, `/api/jobs`, `/api/alerts`, `/api/reports/summary`)
- `packages/shared` kontrak tipe + mock data
- `figma-make/` referensi saja, jangan diedit

## Database — Neon SAJA (jangan pakai docker lagi)

- Project: **Smart City Street** (`proud-heart-43211945`), region Sydney, branch utama `production`.
  `DATABASE_URL` Neon live di `apps/api/.env` (gitignored — jangan pernah commit/copy ke chat).
- Perintah DB selalu dari `apps/api`: `npx prisma migrate status|deploy`, `npm run seed`, `npm run eval`.
- `docker compose.yml` peninggalan lokal — jangan dihidupkan; Postgres lokal port 5433 sudah pensiun.
- Aturan: migrasi destruktif / reset / hapus branch = tanya user dulu. Perubahan skema berisiko
  uji di branch Neon terpisah, bukan langsung di `production`. Jangan log connection string.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
