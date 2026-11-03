# Test & Evaluation Plan — Street Smart Copilot

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
| E2 | Extraction accuracy (NFR-02) | Ground-truth set 40 dokumen (`eval/fixtures/` + `keys.json` format `{fixtures:[{file,kind,expectValues?,ocr?,expectTextContains?}]}`): 20 paralel (PDF/DOCX/CSV/XLSX via `make-fixtures.py`, butuh fpdf2+openpyxl+python-docx) + 18 teks/CSV/XLSX (`gen-fixtures.py` + `gen-xlsx.ts`) + 2 PNG OCR (`ocr_*.png`). Mock: kontrak + kindMatch + recall OCR Tesseract; `--live`: recall nilai field LLM. Jalankan: `npm run eval:extraction --workspace=apps/api [--live]` | mock 40/40; live ≥ 90% recall nilai (data simulasi, bukan data perusahaan asli — lih. risiko R1 di `01`) |
| E3 | RAG grounding (FR-02/03) | T3–T5 harness: fixture CSV → chunk → top-1 retrieval = dokumen fixture → jawaban mensitasi + angka benar | T3–T5 PASS; uji regresi tiap ubah `embed()`/chunking |
| E4 | Usability (NFR-01) | 3–5 partisipan (persona ops/management): 3 tugas — upload→extract, ask→answer, temukan tender; think-aloud, tanpa panduan | Semua tugas selesai tanpa training; catat titik gagal → backlog UX |
| E5 | Time saved (Target Outcome) | Ukur baseline manual (stopwatch: cari tender di spreadsheet, rekap sales) vs AI-assisted untuk 3 workflow prioritas (triage tender, approval quotation, ringkasan sales) | Lapor Δ menit + % per workflow; target: ≥ 50% pada triage tender |
| E6 | Honest failure + responsiveness (PRD §9.2/§13.3) | DB down → API 503 + UI error/empty state (tegaskan: tidak ada data palsu); chat p95 < 2 s | Tidak ada konten fabrikasi di semua skenario; latensi dalam target |
| E7 | Reproducibility (NFR-06) | Fresh clone → `npm install` + 2 perintah jalan mode mock, `npm run build` lolos web+api | Lolos di mesin kedua (catat Node/docker version) |
| E8 | Draft decision integrity (FR-15/16) | Unit tests `drafts.transitions.test.ts` + `extract.test.ts`: state machine, edit-lock, anti-spoof `decidedBy`, sanitiser LLM | `npm run test --workspace=apps/api` 10/10 pass sebelum tiap milestone |

## 3. Cara jalan (urutan ponytail: yang murah dulu)

1. `npm run eval --workspace=apps/api` → harus 6/6 + `npm run test --workspace=apps/api` → 10/10 sebelum tiap milestone (gratis, deterministik).
2. ✅ Selesai: `eval/fixtures/` 40 dokumen + `keys.json` → `eval/score-extraction.ts` (reuse `parseFile`/`extractDocument`/`ocrImageBuffer`; `gen-fixtures.py` merge-safe terhadap 20 fixture paralel).
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
| 2026-11-02 | mock | ✅6/6 | 100% (40/40 file: 20 paralel + 18 teks + 2 OCR, recall=1.0) | ✅T3–T5 | — | — | ✅ manual | ✅ fresh-clone N/A | E2 merged hijau incl. OCR Tesseract; E4/E5 menunggu akses staf |

## 6. Batasan yang diketahui

- `shortcut: fixtures = data simulasi, bukan data perusahaan asli — skor E2 valid untuk pipeline, bukan untuk data real; upgrade saat terima data asli (anonimkan dulu).`
- Tanpa API key: E2/E3 jalan mode deterministik; `--live` opsional, bukan syarat lolos.
- E4/E5 butuh akses 3–5 staf — jadwalkan via Partner Mentor lebih awal.
