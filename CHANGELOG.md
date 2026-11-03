# Changelog — Street Smart Copilot

## Spaces: dari arsip pasif ke workspace kontekstual

Sebelumnya halaman Spaces hanya daftar kartu statis: dibuat manual, isinya tautan mentah,
tidak memengaruhi jawaban copilot, tanpa aksi, tanpa jejak siapa melakukan apa.

Sesudahnya Spaces adalah workspace yang memberi konteks ke copilot:

- **Kepemilikan & visibilitas** (`ownerId/ownerRole`, `PRIVATE|ROLE`, `status`):
  space privat hanya pemilik, space role untuk se-role, management melihat semua.
  Space lama (tanpa owner) tetap terlihat semua — perilaku lama dipertahankan.
- **Enforcement server-side** (`spaceAccess.ts`, unit-tested): semua route spaces
  menolak yang tak berhak dengan 404 (tanpa membocorkan keberadaan).
- **Konteks grounding** (`spaceContext.ts`, bounded ±3000 char, unit-tested):
  item conversation (milik sendiri), dokumen (sesuai domain role), tender
  (sales/ops/mgmt), note + draft tertaut + 10 aktivitas terakhir.
- **Chat sadar-space** (`POST /api/chat { spaceId? }`, REST + Socket.IO):
  konteks disuntik ke prompt sebagai "Space context", jawaban wajib mensitasnya,
  akses ditolak 403 bila tak boleh lihat (bukan diam-diam). Pemakaian dicatat
  (`SpaceActivity.CONTEXT_USED` + `ChatAudit.spaceId`).
- **Aksi turunan data** (`GET /api/spaces/:id/actions`): review draft (maker-checker
  aware), follow-up conversation >7 hari, tender closing ≤14 hari. Tanpa aksi karangan.
- **Draft ↔ space**: `Draft.spaceId` (SetNull); create/approve/reject mencatat
  `DRAFT_CREATED/APPROVED/REJECTED` ke timeline space. Scheduler eskalasi ikut tercatat.
- **Saran simpan deterministik**: keyword domain vs nama/deskripsi space
  (bukan tebakan model), banner non-blocking yang bisa di-dismiss per pesan.
- **Timeline aktivitas** per space (ringkasan saja, tanpa isi mentah) + arsip satu arah.
- **Template pembuatan** (`SPACE_TEMPLATES`): tender review, monthly close, distributor.

Semua role lama tetap berlaku; DB lama aman (kolom baru nullable/default, migrasi aditif).
