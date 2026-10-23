# AGENTS.md — StripFlow

Panduan untuk AI agent / contributor sebelum menyentuh kode di repo ini.

## WAJIB: baca dokumen di `docs/` lebih dulu

Selalu referensikan dan patuhi dokumen berikut sebelum mengubah apa pun:

| Dokumen | Isi | Kapan dibaca |
|---|---|---|
| [`docs/PRD.md`](./docs/PRD.md) | Scope, fitur, acceptance criteria, prioritas, roadmap, benchmark | Sebelum menambah/mengubah fitur |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Struktur modul, data model, state/undo, rendering, net detection, board/konflik, auto-layout, storage, export/print | Sebelum menulis kode inti |
| [`docs/TECH_STACK.md`](./docs/TECH_STACK.md) | Pilihan teknologi, dependensi, tooling, performance budget | Sebelum menambah dependency/tool |
| [`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md) | Gaya kode, penamaan, import/boundary, commit, testing | Sebelum commit |

## Aturan singkat

- **Client-only**: tanpa backend, tanpa network setelah load, tanpa akun.
- **Vanilla**: HTML/CSS/JS, native ES modules, tanpa framework/bundler wajib.
- **Canvas 2D** untuk schematic & board; state immutable; renderer read-only.
- **IndexedDB** untuk project, localStorage untuk preferensi.
- **Jangan** menambah dependency tanpa memperbarui `docs/TECH_STACK.md`.
- **Jangan** mengubah data model/arsitektur tanpa memperbarui `docs/ARCHITECTURE.md`.
- **Jangan** mengubah scope tanpa memperbarui `docs/PRD.md`.
- Ikuti `docs/CONVENTIONS.md` saat menulis kode dan commit.

Jika dokumen dan permintaan user bertentangan, tanyakan dulu; jangan diam-diam menyimpang.

## Perintah (rencana)

```powershell
# dev server (ES modules butuh HTTP)
python -m http.server 5173

# lint & format
npx eslint .
npx prettier --check .

# test unit
node --test tests/unit
```
