# Conventions — StripFlow

**Coding & Project Conventions**
Versi: 1.0
Terakhir diperbarui: 2026-10-23
Terkait: [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`TECH_STACK.md`](./TECH_STACK.md)

---

## 1. Prinsip Umum

1. **Sederhana > pintar.** Kode mudah dibaca menang atas trik singkat.
2. **Murni bila mungkin.** Fungsi domain murni (input → output), tanpa side effect.
3. **Eksplisit.** Nama jelas; hindari singkatan tidak baku.
4. **Satu tanggung jawab.** Modul kecil, fokus.
5. **Jangan duplikasi konstanta.** Taruh di `core/geometry.js` / `data/*`.
6. **State immutable saat commit.** Mutasi lokal boleh (scratch), tapi state yang dikomit harus object baru.

---

## 2. Gaya Kode (JavaScript)

### 2.1 Format (Prettier)

| Aturan | Nilai |
|---|---|
| Indentasi | 2 spasi |
| Quotes | single `'` |
| Semicolon | ya |
| Trailing comma | `all` |
| Line width | 100 |
| Arrow parens | `always` |
| End of line | `lf` |

Konfigurasi `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "endOfLine": "lf"
}
```

### 2.2 Aturan Dasar

- Selalu `const` kecuali perlu reassign (`let`). Tidak memakai `var`.
- Gunakan strict equality `===` / `!==`.
- Arrow function untuk callback; `function` untuk export top-level bernama dan generator.
- Hindari `any`-like JSDoc (`{*}`); beri tipe bila mudah.
- Tidak ada `console.log` di kode produksi; pakai `debug()` dari `core/assert.js` yang mati kecuali `?debug=1`.
- Tidak ada `alert()`; pakai `toast`/`modal`.
- Tidak ada `innerHTML` dengan data user; gunakan `textContent`/DOM API.
- Tidak ada `eval`, `new Function`, `setTimeout(string)`.
- Tidak ada global variable implisit; setiap file adalah module.

### 2.3 Contoh

```js
export const HOLE_PITCH_MM = 2.54;

/**
 * @param {number} holes
 * @returns {number} millimeters
 */
export function holesToMm(holes) {
  return holes * HOLE_PITCH_MM;
}
```

---

## 3. Penamaan

| Entitas | Konvensi | Contoh |
|---|---|---|
| File & folder | `kebab-case` | `netlist.js`, `undo-redo` (folder `core`) |
| Variabel & fungsi | `camelCase` | `placedParts`, `computeSegments()` |
| Konstanta modul | `UPPER_SNAKE_CASE` | `HOLE_PITCH_MM`, `MAX_UNDO` |
| Class / constructor | `PascalCase` | `AnnealRun`, `UndoStack` |
| Tipe JSDoc | `PascalCase` | `@typedef {Object} Project` |
| Event name | `domain:action` | `state:changed`, `layout:done` |
| Command type | `domain/verb` | `schematic/addComponent`, `board/applyCut` |
| CSS class | `block__element--modifier` | `toolbar__btn--active` |
| CSS custom property | `--kebab-case` | `--color-accent` |
| ID komponen | prefix + nomor | `R1`, `C2`, `U1`, `J1` |
| Test file | `*.test.js` | `geometry.test.js` |

### 3.1 Aturan Nama

- Boolean diawali `is`/`has`/`can`/`should` (`isLocked`, `hasConflict`).
- Fungsi mengembalikan boolean diawali `is`/`has`/`can` atau kata kerja jelas.
- Hindari `data`, `info`, `temp`, `item` tanpa konteks.
- Units dalam nama bila ambigu: `timeoutMs`, `pitchMm`, `rowIndex`.
- Koordinat: `row`/`col` untuk board; `x`/`y` untuk skema/piksel.

---

## 4. Struktur Modul & Import

### 4.1 Aturan

- Setiap file satu tanggung jawab; export named (hindari default export, kecuali worker entry).
- Urutan import: built-in → (tidak ada third-party) → `core` → domain → data → utils → relatif.
- Import absolut tidak dipakai (tanpa path alias); gunakan relative path.
- Selalu sertakan ekstensi `.js` (ES modules di browser).

```js
import { EVENTS } from './eventbus.js';
import { HOLE_PITCH_MM } from '../core/geometry.js';
import { getSymbol } from '../schematic/library.js';
```

### 4.2 Dependency Direction

```
ui → (schematic | board | layout | export) → core → data
```

- Dilarang: `core` import `ui`, `layout` import DOM/renderer.
- `board` boleh bergantung pada hasil net dari `schematic` (read-only).

### 4.3 Barrel File

Barrel (`index.js` re-export) **tidak** dipakai di level folder untuk menghindari lingkaran import. Import file langsung.

---

## 5. State & Commands

### 5.1 Aturan State

- State project **immutable**: reducer mengembalikan object baru.
- Gunakan spread dangkal + ganti array terkait; jangan mutasi object lama.
- `ui` state (selection, hover, modal) tidak masuk undo.
- Jangan menyimpan referensi DOM / Canvas di state project.

### 5.2 Command

```js
/** @typedef {Object} Command
 * @property {string} type
 * @property {Object} payload
 * @property {boolean} [transient]
 */
```

- Nama command: `domain/verb` (`board/addCut`).
- Satu command = satu langkah undo (kecuali `transient`).
- Interaksi drag di-commit **sekali** saat pointerup.
- Command wajib validasi input; gagal → `throw new CommandError(...)`, state tidak berubah.

### 5.3 Reducer

```js
/**
 * @param {AppState} state
 * @param {Object} payload
 * @returns {{state: AppState, inverse: Object}}
 */
export function addCut(state, payload) {}
```

- Reducer murni; tanpa I/O, tanpa random (random hanya di layer command generator bila perlu).
- `inverse` cukup untuk membalik aksi.

---

## 6. Event & Error

### 6.1 Event Bus

- Nama event konstanta di `core/eventbus.js` (`EVENTS.STATE_CHANGED`).
- Payload plain object, serializable.
- Unsubscribe wajib disimpan & dipanggil saat teardown.
- Hindari event storm: throttle scroll/hover; coalesce render via rAF.

### 6.2 Error

- Error domain: `class CommandError extends Error { code }`.
- Import error: `{ code, message, details }` dengan kode stabil (`E_SCHEMA_VERSION`, `E_INVALID_JSON`).
- Jangan menelan error diam-diam; log via `debug()` dan tampilkan `toast` bila user-facing.
- `try/catch` hanya di boundary (I/O, worker, import/export).

---

## 7. JSDoc & Typing

- Tipe publik wajib JSDoc.
- Gunakan `@typedef` di `core/types.js` atau dekat definisi domain.
- `@param`, `@returns`, `@property`, `@typedef`, `@template` bila perlu.
- Opsional: `@ts-check` di file kompleks untuk menyalakan pemeriksaan per-file.
- Tidak memakai tipe union string berulang tanpa typedef (`Rotation`, `ToolId`).

Contoh typedef bersama:

```js
/** @typedef {0|90|180|270} Rotation */
/** @typedef {'select'|'wire'|'cut'} BoardTool */
```

---

## 8. Canvas & Rendering

- Renderer **read-only** terhadap state.
- Semua ukuran kanvas mempertimbangkan `devicePixelRatio`.
- Transform pan/zoom lewat helper `geometry.js` (`screenToBoard`, `boardToScreen`).
- Warna & ukuran dari `data/colors.js` dan token; tidak hardcode di banyak tempat.
- Redraw terkontrol: `markDirty(slice)` + rAF; hindari redraw penuh tiap pointermove.
- Text Canvas: set `font`/`textAlign` eksplisit setiap blok; reset state setelahnya.

---

## 9. Storage

- Akses IndexedDB hanya lewat `core/storage.js`.
- Jangan menyimpan state UI di project.
- Auto-save debounce; flush pada `visibilitychange`.
- Data yang dimigrasi wajib punya `schemaVersion`.
- localStorage: hanya primitif (string/number/boolean), namespace prefix `stripflow:`.

---

## 10. CSS

### 10.1 Organisasi

- `main.css`: reset ringan, tokens, shell (toolbar, panels), utilities.
- `schematic.css` / `board.css`: hanya komponen panel terkait.
- `print.css`: semua yang `@media print`; tidak mengimpor style layar.
- Tidak ada inline style kecuali nilai dinamis (posisi) via `style.setProperty`.

### 10.2 Penamaan & Spesifisitas

- BEM-ish: `.panel`, `.panel__header`, `.panel__header--sticky`.
- Hindari nested selector > 3 level.
- Hindari `!important` kecuali di `print.css` (untuk override) dengan komentar.
- Utility class minimal (`.u-hidden`, `.u-flex`).

### 10.3 Theme

- Semua warna dari custom property; dark mode meng-override token di `[data-theme='dark']`.
- Jangan hardcode hex di komponen.

---

## 11. Print

- Warna default hitam-putih untuk label; cetak 1:1 memakai unit `mm`.
- Setiap lembar punya calibration ruler.
- `@page { size: A4; margin: 0 }` untuk template.
- Elemen interaktif disembunyikan di print; print root dibersihkan setelah selesai.

---

## 12. Testing

- Setiap modul domain murni punya `*.test.js` di `tests/unit`.
- Nama test deskriptif: `test('cuts split a row into segments', ...)`.
- Fixture rangkaian di `tests/fixtures/` (JSON).
- Snapshot hanya untuk output deterministik (netlist, JSON migration).
- E2E: minimal smoke (load, place, print preview).
- Jangan mengejar coverage angka; fokus pada logika rawan (netlist, strips, decoder, undo).

---

## 13. Git

### 13.1 Commit (Conventional Commits)

Format: `type(scope): subject`

| Type | Kegunaan |
|---|---|
| `feat` | fitur baru |
| `fix` | perbaikan bug |
| `refactor` | perubahan struktur tanpa ubah perilaku |
| `perf` | optimasi performa |
| `test` | test |
| `docs` | dokumentasi |
| `style` | format (tanpa logika) |
| `chore` | tooling, build, deps |
| `build` | perubahan build/hosting |

Contoh:

```
feat(schematic): add junction detection for 3+ connections
fix(board): include knife cuts in strip segmentation
docs: add architecture overview
```

- Subject ≤ 72 karakter, imperatif, tanpa titik akhir.
- Body opsional: alasan & perubahan penting.
- Satu commit = satu perubahan logis.

### 13.2 Branch

- `main` stabil.
- Feature: `feat/<slug>`, fix: `fix/<slug>`.
- Tidak commit langsung ke `main` untuk perubahan besar.

### 13.3 Review Checklist

- [ ] Lint & format bersih.
- [ ] Unit test terkait lulus.
- [ ] Tidak ada `console.log`/debug tertinggal.
- [ ] JSDoc untuk API publik baru.
- [ ] Tidak menambah dependency tanpa pembaruan `TECH_STACK.md`.
- [ ] Tidak ada data user lewat `innerHTML`.

---

## 14. Aksesibilitas

- Semua kontrol punya label (`aria-label`/`title`).
- Fokus terlihat jelas (`:focus-visible`).
- Pintasan keyboard tidak menangkap input saat fokus di field teks.
- `Escape` selalu membatalkan aksi aktif.
- Kontras teks memenuhi WCAG AA.
- `prefers-reduced-motion` dihormati untuk animasi non-esensial.

---

## 15. Performa

- Hindari alokasi besar per-frame (reuse object bila perlu).
- Loop net/conflict di-cache dengan hash state; recompute hanya bila berubah.
- Data IC & library besar dimuat lazy (`import()`).
- Batasi undo stack (default 200).
- Gunakan `requestAnimationFrame` untuk render; jangan render di handler pointer langsung.
- Profil sebelum optimasi; ukur dengan `performance.now()` di benchmark.

---

## 16. Dokumentasi

- Perubahan arsitektur/data model → update `ARCHITECTURE.md`.
- Perubahan tooling/dependency → update `TECH_STACK.md`.
- Perubahan scope/fitur → update `PRD.md`.
- Aturan baru → update file ini.
- Komentar kode hanya untuk **mengapa**, bukan **apa**; utamakan nama yang jelas.

---

## 17. Checklist Pull Request

- [ ] Perilaku sesuai acceptance criteria PRD terkait.
- [ ] Tidak melanggar boundary dependency (§4.2).
- [ ] State immutable, undo konsisten.
- [ ] Tidak ada `eval`/`innerHTML` dengan data user.
- [ ] Test ditambah/diubah bila relevan.
- [ ] Docs tersentuh bila perlu.
- [ ] Build-free: tetap jalan sebagai static files.
