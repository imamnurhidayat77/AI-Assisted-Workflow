# Test & Evaluation Plan — Street Smart Cockpit

**Companion to:** `01-requirements-brief.md`, `02-system-design.md`
**Status:** Living document — v1.0
**Agreement link:** Target Outcomes — requirements brief + system design (done: `01`, `02`),
working prototype (done: monorepo `apps/*`), AI-assisted processing/reporting (in progress),
testing & evaluation of usability and time saved (this doc + harness), technical docs + handover.

> Catatan: bullet ke-4 Target Outcomes di Schedule 1 sebagian tertutup di screenshot
> ("…usability and time…") — redaksi di atas asumsi dari fragmen + dokumen ini.
> Konfirmasi ke docx agreement sebelum submit final.

---

## 1. Apa yang sudah ada (reuse, jangan bikin baru)

| Harness | Perintah | Bukti |
|---|---|---|
| `apps/api/eval/run.ts` (T1–T6): anti-halusinasi 6 pertanyaan, documents API, ingest→retrieve→chat fixture, cleanup | `npm run eval --workspace=apps/api` (`--live` untuk model asli, butuh kuota) | `apps/api/eval/last-run.json` (PASS/FAIL + tanggal + mode) |
| Acceptance demo script | `01-requirements-brief.md` §6 (5 langkah) | manual, tiap milestone |
| Mock dataset kanonis | `packages/shared` (6 tender, 5 job, 3 dokumen) | ground truth konsistensi web↔API |

## 2. Dimensi evaluasi (traceable ke NFR)

| ID | Dimensi (NFR) | Metode | Lolos jika |
|---|---|---|---|
| E1 | No hallucinated records (NFR-03) | T1 harness: semua `tenderIds` jawaban ∈ DB, 6 pertanyaan EN+ID | 0 ID asing; perluas ke 12 pertanyaan saat tambah assistant baru |
| E2 | Extraction accuracy (NFR-02) | Ground-truth set 20 dokumen (campur PDF/XLSX/CSV tender, sales, quotation) — bandingkan field hasil `/extract` vs kunci jawaban | ≥ 90% field benar; simpan set di `apps/api/eval/fixtures/` + `keys.json` (data simulasi, bukan data perusahaan asli — lih. risiko R1 di `01`) |
| E3 | RAG grounding (FR-02/03) | T3–T5 harness: fixture CSV → chunk → top-1 retrieval = dokumen fixture → jawaban mensitasi + angka benar | T3–T5 PASS; uji regresi tiap ubah `embed()`/chunking |
| E4 | Usability (NFR-01) | 3–5 partisipan (persona ops/management): 3 tugas — upload→extract, ask→answer, temukan tender; think-aloud, tanpa panduan | Semua tugas selesai tanpa training; catat titik gagal → backlog UX |
| E5 | Time saved (Target Outcome) | Ukur baseline manual (stopwatch: cari tender di spreadsheet, rekap sales) vs AI-assisted untuk 3 workflow prioritas (triage tender, approval quotation, ringkasan sales) | Lapor Δ menit + % per workflow; target: ≥ 50% pada triage tender |
| E6 | Responsiveness + graceful degradation (NFR-04/05) | Chat mock ~600 ms (ukur p95 20 request); matikan Postgres → chat+documents tetap jawab (fallback); matikan API → UI fallback lokal | p95 < 2 s mock; tidak ada error halaman kosong di kedua skenario |
| E7 | Reproducibility (NFR-06) | Fresh clone → `npm install` + 2 perintah jalan mode mock, `npm run build` lolos web+api | Lolos di mesin kedua (catat Node/docker version) |

## 3. Cara jalan (urutan ponytail: yang murah dulu)

1. `npm run eval --workspace=apps/api` → harus 6/6 sebelum tiap milestone (gratis, deterministik).
2. Bangun `eval/fixtures/` 20 dokumen + `keys.json` → skrip skor E2 (satu file `eval/score-extraction.ts`, reuse `ingestDocument`).
3. E4+E5 bareng: sesi 30 mnt/partisipan, ukur waktu manual vs AI dalam sesi yang sama.
4. E6+E7 tiap release kandidat; simpan hasil di tabel §5.

## 4. Jadwal (10 minggu: 16 Nov 2026 – 5 Feb 2027)

| Minggu | Fokus evaluasi |
|---|---|
| 1–2 | E1+E3 hijau di harness; mulai kumpulkan 20 fixture |
| 3–5 | E2 skoring jalan; iterasi extraction sampai ≥ 90% |
| 6–7 | E4+E5 sesi pengguna; perbaiki UX dari temuan |
| 8–9 | E6+E7 + `--live` (jika ada kuota) sebagai pembanding |
| 10 | Bekukan `last-run.json` final + tulis hasil ke §5 + handover |

## 5. Log hasil

| Tanggal | Mode | E1 | E2 | E3 | E4 | E5 | E6 | E7 | Catatan |
|---|---|---|---|---|---|---|---|---|---|
| (isi per run) | mock/live | | | | | | | | `eval/last-run.json` = bukti mentah |

## 6. Batasan yang diketahui

- `shortcut: fixtures = data simulasi, bukan data perusahaan asli — skor E2 valid untuk pipeline, bukan untuk data real; upgrade saat terima data asli (anonimkan dulu).`
- Tanpa API key: E2/E3 jalan mode deterministik; `--live` opsional, bukan syarat lolos.
- E4/E5 butuh akses 3–5 staf — jadwalkan via Partner Mentor lebih awal.
