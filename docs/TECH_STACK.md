# Tech Stack — StripFlow

**Technology Decisions & Rationale**
Versi: 1.0
Terakhir diperbarui: 2026-10-23
Terkait: [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`PRD.md`](./PRD.md)

---

## 1. Ringkasan Keputusan

| Area | Keputusan | Alasan |
|---|---|---|
| Bahasa | JavaScript (ES2022) + JSDoc types | Vanilla, tanpa transpile; baca sebagai dokumen. |
| Modul | Native ES Modules (`<script type="module">`) | Tanpa build step; browser modern mendukung. |
| UI | HTML + CSS Custom Properties, tanpa framework | Kontrol penuh, bundel kecil. |
| Rendering | Canvas 2D | Cepat untuk ribuan objek; kontrol DPR & zoom. |
| Storage | IndexedDB (data project) + localStorage (settings) | Kapasitas besar, async. |
| Concurrency | Web Worker (module) | Auto-layout tidak memblok UI. |
| Testing | `node --test` (unit) + Playwright (e2e, opsional) | Tanpa bundler; e2e untuk render. |
| Lint/Format | ESLint (flat config) + Prettier | Konsistensi, menangkap bug. |
| Dev server | `python -m http.server` atau `npx serve` | Cukup untuk ES modules. |

**Tidak digunakan**: React/Vue/Svelte, TypeScript compiler, bundler wajib, CSS framework, jQuery, backend apa pun.

---

## 2. Runtime Target

| Browser | Versi minimum | Catatan |
|---|---|---|
| Chrome / Edge | 110+ | `crypto.randomUUID`, module workers, `structuredClone` |
| Firefox | 110+ | |
| Safari | 16.4+ | Module worker + IndexedDB stabil |

Baseline fitur yang diasumsikan tersedia:

- ES2022 syntax, `class`, private fields, optional chaining, `Array.at`, `structuredClone`.
- `OffscreenCanvas` **tidak wajib** (opsional optimization).
- `crypto.randomUUID()` + fallback manual.
- CSS `:has()`, `color-scheme`, custom properties, `@media print`.

Tidak ada target IE/legacy.

---

## 3. JavaScript

### 3.1 Gaya & Type Checking

- **JSDoc sebagai kontrak tipe**; tidak ada `.ts` dan tidak ada build.
- Mengaktifkan `checkJs` lewat `jsconfig.json` agar editor (VS Code) memberi intellisense/validasi tanpa compile.
- Tidak memakai `// @ts-ignore` kecuali mendesak + komentar alasan (dev-only).

Contoh:

```js
/**
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {number}
 */
export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
```

### 3.2 Batasan Dependensi

- **Nol runtime dependency** selain pustaka kecil yang di-vendor (`js/export/qr.js`, MIT).
- Semua kode pihak ketiga disimpan di repo dengan header lisensi.
- Menambah dependency baru harus: < 10 KB gzip, tanpa transitive deps, lisensi permisif, dan didokumentasikan di sini.

### 3.3 API Browser yang Dipakai

| API | Kegunaan |
|---|---|
| CanvasRenderingContext2D | render skema & board |
| IndexedDB | storage project |
| localStorage | preferensi tema/grid/effort |
| Web Worker (module) | auto-layout |
| `Blob` + `URL.createObjectURL` | download JSON/netlist |
| `FileReader` / `File.text()` | import file |
| `window.print()` + CSS print | cetak 1:1 |
| `structuredClone` | copy/paste, snapshot aman |
| `ResizeObserver` | resize canvas |
| `AbortController` | batal auto-layout/IO |
| `matchMedia` | preferensi dark mode |

Tidak memakai: Service Worker (v1), WebGL, WebAssembly, WebRTC, IndexedDB SQLite WASM di v1.

---

## 4. HTML & CSS

- Semantik HTML5; satu `index.html` dengan app shell + elemen `<template>` untuk modal/print.
- CSS:
  - `css/main.css` memuat design tokens di `:root`.
  - Desktop-first, breakpoint minimal (`≥1280px` optimal).
  - **BEM-ish** untuk komponen (`block__element--modifier`) di `ui`/`css` (lihat CONVENTIONS).
  - Tema gelap via `[data-theme="dark"]` pada `<html>`.
  - Unit print memakai `mm`/`cm` untuk presisi fisik.
- Tidak memakai preprocessor (Sass/PostCSS). Native nesting didukung browser target (opsional; fallback selektor biasa bila perlu).
- Ikon via SVG sprite `assets/icons.svg` (`<use href="#icon-x">`).

### 4.1 Design Tokens (ringkas)

```css
:root {
  --color-bg: #f7f7f8;
  --color-surface: #ffffff;
  --color-text: #1a1a1a;
  --color-muted: #6b7280;
  --color-accent: #2563eb;
  --color-danger: #dc2626;
  --color-grid: #e5e7eb;
  --color-copper: #d97706;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --radius: 6px;
  --font-ui: system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, "Cascadia Code", monospace;
}
```

---

## 5. Rendering

- **Canvas 2D** untuk kedua editor.
- DPR-aware; redraw via `requestAnimationFrame` + dirty flags.
- Background statis (grid, strips) dapat dirender ke offscreen canvas bila terukur membantu.
- Tidak memakai SVG untuk kanvas interaktif (hit-test & performa lebih sederhana di Canvas); SVG dipakai untuk ikon/print overlay jika perlu.

---

## 6. Storage

### 6.1 IndexedDB

- Nama DB: `stripflow`, versi 1.
- Store: `projects`, `settings`, `meta` (lihat ARCHITECTURE §10).
- Wrapper minimal (Promise-based) di `core/storage.js`; tanpa library IDB eksternal.
- Satu record per project; write debounce via autosave.

### 6.2 localStorage

Hanya untuk preferensi kecil: `theme`, `lastOpenedProjectId`, `gridSize`, `effort`, `printOptions`.

### 6.3 Fallback

Jika IndexedDB tidak tersedia (mode private tertentu), tampilkan peringatan dan gunakan penyimpanan sementara in-memory + dorong export JSON. (Tidak menyamarkan sebagai persist.)

---

## 7. Concurrency

- Satu Web Worker khusus auto-layout (`js/layout/worker.js`).
- Data ditransfer minimal; hasil dikembalikan sebagai plain object.
- `layout/client.js` menyediakan `run(project, options, { onProgress, signal })`.
- Bila worker worker module tidak didukung (browser lama), fallback ke jalankan di main thread dengan yield berkala (`await new Promise(r => setTimeout(r))`) — lambat tapi tetap benar.

---

## 8. Tooling

### 8.1 Dev Server

Tanpa bundler. Pilihan:

```powershell
# Opsi A: Python
python -m http.server 5173

# Opsi B: Node
npx serve .
```

> ES modules memerlukan HTTP; membuka `file://` tidak didukung.

### 8.2 Lint & Format

- **ESLint** flat config (`eslint.config.js`), preset `@eslint/js` + aturan kustom.
- **Prettier** untuk formatting.
- Perintah:

```powershell
npx eslint .
npx prettier --check .
npx prettier --write .
```

### 8.3 Testing

- **Unit**: `node --test tests/unit` (Node 20+). Target: modul murni (geometry, netlist, strips, seqpair, decoder, scorer, json).
- **E2E/Visual** (opsional): Playwright untuk smoke test render & print preview.
- **Benchmark**: script `node tests/unit/bench-layout.js` menjalankan 5 rangkaian PRD §9 dan mencetak skor/waktu.

Contoh perintah:

```powershell
node --test tests/unit
npx playwright test
node tests/unit/bench-layout.js
```

### 8.4 Type Checking (tanpa emit)

`jsconfig.json`:

```json
{
  "compilerOptions": {
    "checkJs": true,
    "allowJs": true,
    "noEmit": true,
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true
  },
  "include": ["js/**/*.js"]
}
```

Jalankan via editor atau `npx tsc -p jsconfig.json --noEmit` (TypeScript hanya sebagai checker, bukan build).

### 8.5 CI (opsional)

- Lint + unit test pada push (GitHub Actions).
- Tidak ada deploy backend; hosting statis (GitHub Pages / Netlify / Vercel static).

---

## 9. Dependensi & Lisensi

| Paket | Jenis | Lisensi | Ukuran | Catatan |
|---|---|---|---|---|
| `qr.js` (vendored) | runtime | MIT | ~5 KB | dipakai hanya untuk print QR |
| ESLint + plugins | dev | MIT | — | lint |
| Prettier | dev | MIT | — | format |
| TypeScript (checker) | dev | Apache-2.0 | — | `--noEmit` |
| Playwright | dev (opsional) | Apache-2.0 | — | e2e |
| Data IC (subset KiCad) | data | CC-BY-SA 4.0 | — | atribusi wajib |

**Atribusi**: pinout IC berasal dari KiCad symbol library (CC-BY-SA 4.0). Cantumkan di `README`/About dan header `data/ic-library.js`.

---

## 10. Build & Deploy

- **Tidak ada build step wajib.** Deploy = unggah folder statis.
- Opsional minifikasi untuk produksi (esbuild `--minify`) hanya sebagai langkah rilis; source tetap berjalan langsung.
- Target hosting: static (GitHub Pages, Netlify, Vercel, Cloudflare Pages).
- Cache: `index.html` no-cache; `js/`/`css/` boleh cache dengan hash nama file bila ada pipeline rilis (opsional).

---

## 11. Performance Budget

| Metrik | Target |
|---|---|
| JS total (gzip, tanpa data IC) | ≤ 500 KB |
| CSS total (gzip) | ≤ 40 KB |
| Data IC library (lazy?) | ≤ 300 KB, dimuat saat dibutuhkan |
| First paint | < 1 s lokal |
| Interaksi board | 60 FPS @ ≤ 60×40 hole |
| Decode auto-layout | < 0.1 ms / board (40 komponen) |

Data IC besar dimuat **lazy** via dynamic `import()` saat pengguna membuka pemilih IC, agar load awal ringan.

---

## 12. Security & Privacy

- Tidak ada request jaringan setelah load (kecuali user membuka link eksternal).
- Import JSON: parse murni, tanpa `eval`/`Function`; batas ukuran file (mis. 10 MB); validasi struktur.
- Render teks user (nama net/komponen) via Canvas `fillText` (aman dari HTML injection) atau `textContent` di DOM.
- Tidak ada cookie/tracking.

---

## 13. Ringkasan "Kenapa Bukan X"

| Alternatif | Kenapa tidak |
|---|---|
| React/Vue | Overhead untuk UI sederhana; Canvas tetap manual; bundel lebih besar. |
| TypeScript build | Menambah toolchain; JSDoc + `checkJs` cukup. |
| SVG interaktif | Hit-test & ribuan elemen kurang efisien; Canvas lebih terkontrol. |
| WebGL | Overkill; 2D cukup untuk grid & simbol. |
| Backend/DB | Di luar scope client-only; IndexedDB memenuhi kebutuhan. |
| WebAssembly (auto-layout) | Kompleksitas tinggi; JS + worker cukup untuk target performa. |
| CSS framework | Design system kecil; token native lebih ringan. |
