# Handover Guide — Street Smart Cockpit

**Untuk:** tim Smart City Street Ltd / maintainer berikutnya.
**Prasyarat baca:** `01-requirements-brief.md`, `02-system-design.md`.
**Status:** v1.0 — mencerminkan repo apa adanya (termasuk yang masih mock).

---

## 1. Peta 2 menit

| Apa | Di mana | Cara jalan |
|---|---|---|
| UI (Next.js 15) | `apps/web` | `npm run dev:web` → http://localhost:3000 |
| API (Express + Socket.IO) | `apps/api` | `npm run dev:api` → http://localhost:4000 |
| DB (Postgres + pgvector) | Neon (org Imam, project Smart City Street, branch `production`) | `DATABASE_URL` dari `neon env pull` (Sydney region) |
| Tipe + mock data | `packages/shared` | diimpor web & api |
| Dokumen deliverable | `docs/01–04` | markdown, render di GitHub |
| Referensi desain awal | `figma-make/` | **jangan diedit** |

## 2. Setup pertama kali (fresh clone)

```bash
npm install
cp .env.example .env            # lalu isi LLM_* (lihat §4)
neon env pull                   # isi DATABASE_URL/DATABASE_URL_UNPOOLED Neon (butuh `neon login`)
npm run prisma:migrate --workspace=apps/api   # deploy (non-interaktif, aman di CI)
npm run seed --workspace=apps/api             # tender, jobs, docs, spaces, demo users (butuh DATABASE_URL ter-export)
npm run dev:api   # terminal 1
npm run dev:web   # terminal 2 → buka http://localhost:3000
```

Login demo di UI: buka `/login`, pilih akun dummy per role (mis. `u-sales` Sophie Williams,
password `sss12345`) → key tersimpan di `localStorage`. Atau via API:
`POST /api/auth/login {"userId":"u-sales","password":"sss12345"}`.
Tanpa login, Shell me-redirect ke `/login` dan endpoint tulis mengembalikan 401.

## 3. Loop harian

- `npm run dev:web` / `npm run dev:api` — hot reload (tsx watch / Next dev).
- `npm run eval --workspace=apps/api` — 6 checks (grounding, RAG, cleanup). Harus 6/6.
- `npm run build --workspace=apps/web --workspace=apps/api` — gate sebelum demo/commit besar.

## 4. Environment variables

| Var | File | Wajib? | Keterangan |
|---|---|---|---|
| `DATABASE_URL` | `.env` (via `neon env pull`, pooler) + `apps/api/.env` (direct/unpooled, aman untuk migrate) | ya | `postgresql://neondb_owner@ep-plain-shadow-a7n74knt(-pooler).ap-southeast-2.aws.neon.tech/neondb?...` — **tidak pernah di-commit** |
| `API_PORT` | `.env` | tidak | default `4000` |
| `WEB_URL` | `.env` | tidak | default `http://localhost:3000` (CORS + Socket.IO) |
| `NEXT_PUBLIC_API_URL` | `apps/web/.env.local` | ya (prod) | default `http://localhost:4000` |
| `AI_PROVIDER` | `apps/api/.env` | tidak | `http` = model asli, selain itu = simulasi |
| `LLM_BASE_URL` | `apps/api/.env` | bila `http` | `https://opencode.ai/zen/go/v1` |
| `LLM_API_KEY` | `apps/api/.env` | bila `http` | key OpenCode Go — **tidak pernah di-commit** |
| `LLM_MODEL` | `apps/api/.env` | tidak | default `muse-spark-1.3-contributor` |
| `LLM_SESSION_ID` | `apps/api/.env` | tidak | override session gateway (default acak per proses) |
| `EXTRACT_PROVIDER` | `apps/api/.env` | tidak | `http` = ekstraksi field via LLM; default RAG statis |
| `ALLOW_DEMO_LOGIN` | `apps/api/.env` | — | default `true`. **Set `false` di deployment mana pun** |

## 5. Inventaris kredensial & data

- **API key OpenCode Go** — milik pribadi di `apps/api/.env` (gitignored). Rotasi: ganti di console → update file → restart API. Kuota: Muse Spark 1.3 termurah ($0.10/$0.20 per 1M token).
- **Demo users** — `u-sales/u-finance/u-hr/u-ops/u-mgmt` (seed; key acak, hash-only di DB). Login ulang via demo-login merotasi key.
- **DB Neon** — org Imam, project `Smart City Street` (`proud-heart-43211945`), branch `production` (Sydney). Kredensial hanya di `.env`/`apps/api/.env` (gitignored); backup: `npm run db:backup` (`pg_dump "$DATABASE_URL"` ke `./backups`). Link proyek: `.neon` + `neon.ts`; refresh env via `neon env pull`.
- **Upload user** — `apps/api/uploads/` (gitignored). Backup bersama DB bila dokumen penting.

## 6. Endpoint reference (ringkas)

| Method & path | Auth | Keterangan |
|---|---|---|
| `GET /health` | — | liveness |
| `POST /api/auth/demo-login` | — | tukar userId → key (matikan di prod!) |
| `GET /api/auth/me`, `GET /api/auth/users` | key / — | profil + user switcher |
| `POST /api/chat` `{message, assistantId?, role?, sessionId?}` | key | copilot; header `X-AI-Via`, `X-Data-Via`, `X-Assistant` |
| Socket.IO `chat:message` → `chat:stage` → `chat:answer`/`chat:error` | key di payload | realtime, fallback POST otomatis |
| `GET /api/tenders[?q=]`, `GET /api/tenders/:id` | — | DB-first + filter keyword |
| `GET /api/documents`, `POST /upload`, `GET /:id/extract`, `DELETE /:id`, `POST /:id/reingest` | tulis: key | RAG: parse → chunk → pgvector |
| `GET/POST /api/drafts`, `POST /:id/{submit,approve,reject,reopen}`, `PATCH /:id` | tulis: key | human-in-the-loop, audit permanen; approve maker-checker (payment: mgmt saja; sales-kind: ops/mgmt bukan pembuat) |
| `GET /api/drafts/inbox` | key | awaiting (boleh approve) + mine (butuh aksi) — halaman `/inbox` semua role |
| `GET /api/notifications` | key | notifikasi live per-role (deadline ≤14 hari, overdue + flag SLA, closing, extracting, digest Senin mgmt) — bell di Shell |
| `GET /api/finance/overview` | key + role finance/mgmt | invoice + checklist read-only — halaman `/finance` |
| `GET /api/hr/overview` | key + role hr/mgmt | policies + roster agregat — halaman `/hr` |
| `GET/POST /api/quotations`, `PATCH /:id` | key + role sales/ops/mgmt | CRUD quotation (nomor Q-TAHUN-XXXX otomatis; edit draft/rejected saja) — halaman `/quotations`; approval via draft `quotation-review` |
| `/deadlines` (web saja) | role sales/ops/mgmt | timeline closing dari closeLabel (overdue/≤14d/≤30d/later) — tanpa endpoint baru |
| `/executive` (web saja) | role management | KPI + snapshot lintas-domain dari endpoint di atas — tanpa endpoint baru |
| Scheduler (hourly) | — | `in_review` > `DRAFT_SLA_DAYS` (default 3) → history `escalated` sekali; `updatedAt` dipertahankan agar overdue tetap terhitung |
| `GET /api/jobs` | key | antrean riil + draft approvals (halaman: operations/management) |
| `GET /api/reports/summary` | key | KPI + chart data (mock agregat) |
| `GET/POST /api/spaces`, `GET/DELETE /api/spaces/:id`, `POST/DELETE items` | tulis: key | workspace persisten |
| `GET /api/audit?take=` | key + role `management` | riwayat chat (preview 200 char) |

## 7. Troubleshooting

| Gejala | Penyebab umum → aksi |
|---|---|
| `Can't reach database` / timeout ke Neon | `DATABASE_URL` basi atau IP diblokir → `neon env pull` ulang, cek koneksi ke `*.neon.tech:5432`. Migrasi wajib pakai direct URL (bukan pooler). |
| `type "vector" does not exist` di Neon | Extension pgvector belum aktif → `CREATE EXTENSION vector;` di SQL editor Neon (sudah di migrasi `rag_chunks`). |
| Chat selalu "Simulated answer" | API mati / `AI_PROVIDER` bukan `http` / key salah → cek header `X-AI-Via`, log `[llm]`. |
| 401 di semua aksi tulis | Belum login → profil → pilih user. Cek `X-API-Key` terkirim. |
| Upload stuck `Processing` | Download model embedding pertama (~90 MB) / parse gagal → cek log `[ingest]`, tombol reingest tersedia. |
| `type "vector" does not exist` saat migrate | Extension belum aktif → `CREATE EXTENSION IF NOT EXISTS vector;` (sudah di migrasi `rag_chunks`). |
| Prisma Client kedaluwarsa setelah ubah schema | `npm run prisma:generate --workspace=apps/api` + rebuild. |
| `prisma migrate dev` menolak (non-interaktif) | Pakai `npm run prisma:migrate` (= `deploy`). Buat migrasi baru via `prisma migrate diff` → simpan ke `prisma/migrations/`. |
| onnxruntime binding missing (Intel Mac) | Sudah ditangani: embedding memakai hashing deterministik, bukan ORT. Tidak perlu diperbaiki kecuali ganti model neural (lihat docs/02 §3.3). |

## 8. Yang BELUM production-ready (jangan deploy apa adanya)

1. `POST /api/auth/login` memakai satu password dummy untuk semua akun (`DUMMY_PASSWORD`, default `sss12345`) — ganti SSO/OAuth + passwordHash per user, set `ALLOW_DEMO_LOGIN=false`.
2. Tanpa rate limiting, tanpa audit log akses file, `cors` terbuka ke `WEB_URL` saja (pastikan benar di prod).
3. Embedding hashing = batas bawah retrieval; upgrade ke model neural untuk akurasi (interface siap).
4. Backup DB/uploads belum otomatis; belum ada monitoring/alerting.
5. Evaluasi formal (20 dokumen + usability + time-saved, lihat `docs/03`) menunggu data & sesi perusahaan.

## 9. Definisi "selesai" (checklist serah terima)

- [ ] `npm run eval` 6/6 (mock; live bila ada kuota) + `eval/last-run.json` tersimpan.
- [ ] Build web + API hijau; smoke test §10 lolos.
- [ ] `.env` terisi (tanpa secret ter-commit — cek `git status` bersih dari `.env`).
- [ ] Backup DB + uploads bila ada dokumen asli perusahaan.
- [ ] README + docs/01–04 dibaca dan akurat terhadap kode hari ini.
