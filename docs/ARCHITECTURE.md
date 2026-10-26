# Architecture — StripFlow

**Technical Architecture Document**
Versi: 1.0
Terakhir diperbarui: 2026-10-23
Terkait: [`PRD.md`](./PRD.md), [`TECH_STACK.md`](./TECH_STACK.md), [`CONVENTIONS.md`](./CONVENTIONS.md)

---

## 1. Prinsip Arsitektur

1. **Client-only**: tidak ada server, tidak ada network setelah initial load.
2. **Single source of truth**: satu `AppState` yang immutable-updated lewat committed commands.
3. **Unidirectional data flow**: input → command → reducer/patch → state → render.
4. **Renderer pasif**: renderer hanya membaca state; tidak pernah memutasi.
5. **Modular per domain**: `schematic`, `board`, `layout`, `export` terpisah dengan boundary jelas.
6. **Deterministik & serializable**: seluruh state project bisa di-stringify ke JSON.
7. **Performance budget**: Canvas 2D, dirty-flag redraw, spatial indexing bila perlu.

---

## 2. High-Level Overview

```
┌───────────────────────────────────────────────────────────────┐
│                         Browser (client)                       │
│                                                               │
│  ┌────────────┐   events   ┌──────────────┐   reads   ┌───────┐│
│  │  UI Layer  │───────────▶│  App Core    │──────────▶│Render ││
│  │ toolbar,   │            │ state, undo, │           │Canvas ││
│  │ sidebar,   │◀───────────│ commands     │◀──────────│2D     ││
│  │ modals     │   state    │              │  state    └───────┘│
│  └────────────┘            └──────┬───────┘                    │
│                                   │ persist                    │
│                          ┌────────▼────────┐                   │
│                          │ IndexedDB       │                   │
│                          │ projects/settings│                  │
│                          └─────────────────┘                   │
│                                   │                            │
│                       ┌───────────▼────────────┐               │
│                       │ Auto-layout Web Worker │               │
│                       │ annealer + decoder     │               │
│                       └────────────────────────┘               │
└───────────────────────────────────────────────────────────────┘
```

### 2.1 Aliran Data

```
User input (pointer/keyboard)
   → Tool handler
   → Command { type, payload }
   → CommandBus.dispatch
   → Reducer menghasilkan nextState (immutable) + patch terbalik
   → UndoStack.push(patch)
   → EventBus.emit('state:changed', { slices })
   → Renderer & UI subscribers re-render (dirty slices)
   → AutoSave.schedule()
```

Auto-layout adalah aliran khusus: request → worker → progress events → result → command `board:applyLayout`.

---

## 3. Struktur Direktori

```
stripflow/
├─ index.html
├─ css/
│  ├─ main.css           # layout shell, toolbar, panels, variables
│  ├─ schematic.css      # editor skema
│  ├─ board.css          # editor board
│  ├─ print.css          # @media print + print-only DOM
│  └─ dark.css           # tema gelap via [data-theme="dark"]
├─ js/
│  ├─ main.js            # bootstrap
│  ├─ core/
│  │  ├─ state.js        # AppState, selectors, state factory
│  │  ├─ store.js        # dispatch, subscribe, patch/commit
│  │  ├─ commands.js     # registry command + reducer per domain
│  │  ├─ undo.js         # undo/redo stack (patch-based)
│  │  ├─ eventbus.js     # pub/sub
│  │  ├─ storage.js      # IndexedDB wrapper
│  │  ├─ autosave.js     # debounce + status
│  │  ├─ geometry.js     # grid math, transforms, hit-test
│  │  ├─ ids.js          # ID generation (crypto.randomUUID fallback)
│  │  └─ assert.js       # dev assertions
│  ├─ schematic/
│  │  ├─ components.js   # component factory & defaults
│  │  ├─ library.js      # definisi simbol bawaan
│  │  ├─ custom.js       # custom component editor
│  │  ├─ netlist.js      # union-find net extraction
│  │  ├─ nets.js         # named nets/flags/labels
│  │  ├─ wiring.js       # wire geometry, junction rules
│  │  ├─ tools.js        # pointer state machine
│  │  ├─ renderer.js     # Canvas 2D drawing
│  │  └─ hittest.js      # pick komponen/pin/wire
│  ├─ board/
│  │  ├─ model.js        # board factory & invariants
│  │  ├─ grid.js         # rows/cols insert/delete
│  │  ├─ placement.js    # map pin→hole, validate
│  │  ├─ strips.js       # strip segmentation & net color
│  │  ├─ cuts.js         # cut apply/remove
│  │  ├─ wires.js        # link wire validate/apply
│  │  ├─ conflicts.js    # conflict & completeness checks
│  │  ├─ packages.js     # physical package data
│  │  ├─ tools.js        # select/wire/cut state machine
│  │  ├─ renderer.js     # Canvas 2D drawing
│  │  └─ hittest.js      # pick hole/part/wire/cut
│  ├─ layout/
│  │  ├─ seqpair.js      # sequence-pair → relations → packing
│  │  ├─ decoder.js      # description → board (rows, cols, strips, wires)
│  │  ├─ scorer.js       # weighted score
│  │  ├─ moves.js        # move generator
│  │  ├─ annealer.js     # SA loop, cooling, portfolio runs
│  │  ├─ finisher.js     # start-over / repair pass
│  │  ├─ worker.js       # worker entry
│  │  └─ client.js       # main-thread worker client
│  ├─ export/
│  │  ├─ json.js         # serialize/deserialize + migrations
│  │  ├─ netlist.js      # KiCad netlist + footprint lib
│  │  ├─ print.js        # build print DOM
│  │  └─ qr.js           # QR generator (vendored, MIT)
│  ├─ data/
│  │  ├─ ic-library.js   # pinout IC (subset KiCad, CC-BY-SA)
│  │  ├─ packages.js     # data fisik package
│  │  └─ colors.js       # palette net & tema
│  └─ ui/
│     ├─ toolbar.js
│     ├─ sidebar.js
│     ├─ tray.js
│     ├─ menus.js
│     ├─ modals.js
│     ├─ toast.js
│     ├─ keyboard.js
│     └─ theme.js
├─ assets/
│  └─ icons.svg          # sprite ikon
├─ docs/                 # dokumen ini
└─ tests/
   ├─ unit/
   └─ e2e/
```

**Aturan boundary**: `core` tidak boleh import `ui`; `schematic`/`board` boleh import `core`; `layout` hanya boleh import `core` + model murni (bukan renderer/DOM); `export` boleh import semua model.

---

## 4. Data Model

Semua entity serializable (plain object), tanpa `class` dengan state tersembunyi.

### 4.1 Project

```js
/** @typedef {Object} Project
 * @property {string} schemaVersion  // "1.0.0"
 * @property {string} id
 * @property {string} name
 * @property {Schematic} schematic
 * @property {Board} board
 * @property {SymbolDef[]} customSymbols
 * @property {ProjectMeta} meta
 */

/** @typedef {Object} ProjectMeta
 * @property {number} createdAt
 * @property {number} modifiedAt
 * @property {string} [seed]       // untuk repro auto-layout
 */
```

### 4.2 Schematic

```js
/** @typedef {Object} Schematic
 * @property {SComponent[]} components
 * @property {Wire[]} wires
 * @property {Flag[]} flags
 * @property {NetLabel[]} labels
 * @property {Record<string,{color?:string}>} netStyles  // override warna per nama net
 * @property {Net[]} nets        // hasil derivasi (cache), sumber kebenaran = pin/wire
 * @property {{pan:{x:number,y:number}, zoom:number}} view
 */

/** @typedef {Object} SComponent
 * @property {string} id
 * @property {string} ref          // "R1"
 * @property {string} symbolId     // key di library
 * @property {{x:number,y:number}} pos   // grid coords
 * @property {0|90|180|270} rot
 * @property {boolean} mirror
 * @property {string} value
 * @property {Pin[]} pins
 * @property {boolean} excluded
 * @property {boolean} offBoard
 * @property {Object} [attrs]
 */

/** @typedef {Object} Pin
 * @property {string} id           // stabil, mis. "1"
 * @property {string} name
 * @property {string} [number]
 * @property {{x:number,y:number}} offset  // relatif sebelum rotasi
 * @property {string} type         // passive|power|input|output|bidir
 */

/** @typedef {Object} Wire
 * @property {string} id
 * @property {{x:number,y:number}[]} points
 */

/** @typedef {Object} Flag
 * @property {string} id
 * @property {'gnd'|'pwr'} kind
 * @property {string} name         // "GND", "VCC", ...
 * @property {{x:number,y:number}} pos
 * @property {number} rot
 */

/** @typedef {Object} NetLabel
 * @property {string} id
 * @property {string} name
 * @property {{x:number,y:number}} pos
 * @property {number} rot
 */

/** @typedef {Object} Net
 * @property {string} id
 * @property {string} name
 * @property {string} color
 * @property {{compId:string,pinId:string}[]} pins
 */
```

Catatan:
- `netStyles` menyimpan override warna dari UI sidebar; `computeNets()` mengisinya ke `Net.color`. Rename net memindahkan style lama ke nama baru dan menulis ulang semua flag/label (atau menambah label di pin pertama untuk auto-net).
- Custom component (`customSymbols`) memakai `SymbolDef` yang sama, dengan `custom: true`; id berawalan `sym_`. Pin offset relatif terhadap origin, integer, dan harus berada di dalam body. Dibuat lewat modal dan dapat dihapus bila belum dipakai.
- **Editable footprint (SB-14):** dari properties komponen board, **Edit footprint** membuka modal symbol yang sudah terisi body size + pin. Mengedit symbol standar membuat salinan custom dan meng-assign ke komponen terpilih; mengedit custom symbol memperbarui semua komponen yang memakainya. `pin.id` dipertahankan agar net/wire tidak putus, dan endpoint wire yang menempel pada pin ikut digeser ke posisi pin baru.
- `SComponent.offBoard`: komponen eksternal; board menggambar solder pad (tanpa body solid), print menambahkan tabel off-board wiring. Auto-layout hanya mempertahankan pad yang sudah ditempatkan dan tidak memindahkannya; off-board yang belum ditempatkan diabaikan.
- Package `flexible` (resistor, cap, diode, LED, switch, inductor, thermistor, fuse, LDR) memakai `leadsSpan` untuk pin fleksibel.

### 4.3 Board

```js
/** @typedef {Object} Board
 * @property {number} rows
 * @property {number} cols
 * @property {PlacedPart[]} parts
 * @property {Cut[]} cuts
 * @property {LinkWire[]} wires
 * @property {{pan:{x:number,y:number}, zoom:number}} view
 * @property {BoardOptions} options   // mis. drilledCutsOnly
 */

/** @typedef {Object} PlacedPart
 * @property {string} compId
 * @property {number} row          // hole top-left anchor
 * @property {number} col
 * @property {0|90|180|270} rot
 * @property {number} [leadsSpan]  // 2-pin flexible
 * @property {number} [leadShift]  // posisi relatif pin
 * @property {boolean} flat
 * @property {boolean} locked
 * @property {string} packageId
 * @property {{pinId:string,row:number,col:number}[]} pinHoles
 */

/** @typedef {Object} Cut
 * @property {string} id
 * @property {'drill'|'knife'} type
 * @property {number} row
 * @property {number} col          // knife: koordinat "setengah" (col + 0.5)
 */

/** @typedef {Object} LinkWire
 * @property {string} id
 * @property {{row:number,col:number}} a
 * @property {{row:number,col:number}} b
 * @property {boolean} [insulated]
 */
```

### 4.4 Board Options & Constraints

```js
/** @typedef {Object} BoardOptions
 * @property {boolean} drilledCutsOnly
 * @property {boolean} noStackedWires
 * @property {boolean} standingParts
 * @property {number} clearance     // baris/kolom kosong antar part
 * @property {boolean} rowsLocked
 * @property {boolean} colsLocked
 */
```

### 4.5 Invariants

- Satu hole maksimal ditempati satu pin part.
- Satu `(row,col)` maksimal satu cut drill; knife cut berada di antara dua hole.
- `LinkWire.a !== LinkWire.b`.
- `PlacedPart.pinHoles` harus konsisten dengan footprint + rotasi.
- `partBounds` (isi bounding box for hit-test/rendering): untuk part fleksibel 2-kaki (resistor/kap/inductor/diode/LED/dll), sumbu tegak lurus badan tidak di-pad — part vertikal menempati **satu kolom** dan part horizontal satu baris; lebarnya mengikuti `leadsSpan`. Untuk part multi-pin, badan di-pad menurut `symbol.width/height` yang *ikut rotasi*.
- `rows ≥ 1`, `cols ≥ 1`.
- Nama net unik; warna diturunkan deterministik dari nama.
- `schemaVersion` wajib; migrasi dilakukan saat load.

---

## 5. State Management

### 5.1 Store

```js
// core/store.js (kontrak)
createStore(initialState) -> {
  getState(): AppState,
  dispatch(command): void,
  subscribe(listener, selector?): unsubscribe,
  commit(prev, next, label): void  // internal untuk undo
}
```

- `AppState` = `{ project, ui, layoutRun, storage }`.
- `project` immutable; perubahan menghasilkan object baru (structural sharing manual).
- `ui` = `{ activeTool, selection, hovered, modals, theme }` — tidak masuk undo.
- Subscriber diberi `slices` yang berubah agar renderer bisa skip.

### 5.2 Command & Reducer

Setiap aksi user adalah command bernama:

```js
/** @typedef {Object} Command
 * @property {string} type       // "schematic/addComponent"
 * @property {Object} payload
 * @property {boolean} [transient]  // true = tidak masuk undo (hover, pan)
 */
```

Reducer per domain (`schematic`, `board`, `project`) menerima `(state, payload) → { state, inverse }`. `inverse` dipakai `undo.js` untuk rollback murah.

### 5.3 Undo/Redo

- **Snapshot-based** via `structuredClone` di `core/store.js` (deviasi dari rencana patch-based; lebih sederhana dan cukup untuk ukuran project target).
- Stack: `undo[]`, `redo[]` berisi `{ type, snapshot, label, timestamp }`.
- Command transient (hover, drag preview) di luar transaksi memakai `store.transient()` dan tidak masuk undo; di dalam transaksi (`beginTransaction`) perubahan transient menandai transaksi dirty dan masuk undo satu entry saat `endTransaction`.
- Batas default 200 entri; entry besar di-coalesce (drag part/wire/cut → satu entry saat pointerup).
- Auto-layout ditempatkan sebagai satu entry undo.

### 5.4 Event Bus

Event standar:

| Event | Payload | Konsumen |
|---|---|---|
| `state:changed` | `{ slices, project }` | renderer, sidebar |
| `schematic:nets` | `{ nets, conflicts }` | sidebar board |
| `board:conflicts` | `{ conflicts, incomplete }` | sidebar, renderer |
| `layout:progress` | `{ run, best, progress }` | modal |
| `layout:done` | `{ board, stats }` | store, UI |
| `toast` | `{ kind, message }` | toast UI |
| `autosave:status` | `{ saving, savedAt }` | toolbar |

### 5.5 Layout Shell & Interaction

- Workspace grid: schematic | splitter | board | sidebar. Lebar schematic disimpan di CSS var `--split-left` dan localStorage `stripflow:split-left`; keyboard `ArrowLeft/Right` (±24 px, Shift ±96) dan `Home` (reset) saat splitter fokus.
- Library item bisa diklik-lalu-klik canvas atau **drag & drop** ke canvas (`text/plain` = symbolId).
- Double-click komponen/flag/label di schematic untuk rename inline; right-click net di sidebar untuk rename/recolor.
- Schematic (tool select): klik badan part/wire/flag/label untuk select + drag; `Ctrl`/`Shift` toggle/tambah; klik ujung pin atau tepat di endpoint wire memulai draft wire otomatis (pindah ke tool wire). Draft wire bersifat **orthogonal**: setiap langkah menyisipkan siku sehingga semua segmen horizontal/vertikal (helper `manhattanCorner` di `js/schematic/tools.js`); preview kursor mengikuti aturan yang sama. Di tool wire, klik badan simbol komponen meng-commit wire berjalan lalu kembali ke select dan memilih komponen tersebut; klik wire lama snap ke vertex terdekatnya.
- Board: drag body part untuk memindah, drag endpoint wire untuk memindah satu ujung, drag cut (drill/knife) untuk memindah posisi cut, `Delete` untuk menghapus selection, keyboard `C`/`W` untuk cut/wire. Right-click part menampilkan menu kontekstual (rotate, lock, off-board, unplace); right-click area kosong menampilkan insert/delete row/col.
- Custom component dibuat lewat modal `#modal-symbol`; disimpan di `project.customSymbols`, otomatis muncul di Library, dan bisa dihapus via context menu selama belum dipakai.

---

## 6. Rendering

### 6.1 Canvas 2D

Dua canvas terpisah (skema & board). Masing-masing memiliki:

- **DPR scaling**: `canvas.width = cssW * devicePixelRatio`.
- **View transform**: `translate(pan) · scale(zoom)`.
- **Dirty redraw**: `requestAnimationFrame` coalesced; redraw hanya slice terkait.
- **Layer opsional**: offscreen canvas untuk background grid/strip statis.

### 6.2 Grid & Skala

| Konteks | Satuan | Catatan |
|---|---|---|
| Schematic | grid 10 px (logical) | zoom-independent |
| Board on-screen | 1 hole = 24 px @ zoom 1 | padding 12 px |
| Board print | 1 hole = 2.54 mm | `1mm = 96/25.4 px` di CSS print |

Konstanta di `core/geometry.js` dan `data/packages.js`.

### 6.3 Hit Testing

- Skema: urutan prioritas pin → junction → wire → label → komponen body.
- Board: hole → pin → cut → wire → part body (part body hanya untuk select).
- Gunakan toleransi dalam unit layar (dibagi zoom) supaya konsisten.

### 6.4 Kolom Warna Net

- Hasil `hash(netName)` → indeks palette (HSL). Net `GND`/`VCC` punya warna tetap.
- Kontras teks otomatis (terang/gelap) berdasar luminance.

---

## 7. Net Detection (Schematic)

### 7.1 Aturan Konektivitas

Terhubung bila:

1. Ujung wire menempel pada ujung/titik wire lain.
2. Pin menempel pada wire (di titik mana pun sepanjang segmen).
3. Dua pin (atau lebih) berada di titik yang sama.
4. Wire berakhir di pin.
5. Flag berkumpul berdasarkan nama; label berkumpul berdasarkan nama (virtual net).

Tidak terhubung:

- Wire menyilang tanpa junction (walaupun satu berakhir di titik silang? → **berakhir = tersambung**; hanya crossing murni yang tidak).

### 7.2 Algoritma

1. Kumpulkan **node koneksi**: pin endpoints, wire vertices, wire endpoints, junction points.
2. Snap node ke grid integer (toleransi 1e-6).
3. Bangun graf:
   - tiap segmen wire → edge antar vertex;
   - pin pada segmen → edge pin↔vertex terdekat (proyeksi);
   - pin berimpit → edge;
   - flag/label dengan nama sama → hub node virtual.
4. **Union-Find** gabungkan node.
5. Setiap root = net; nama ditentukan prioritas: label/flag eksplisit > nama default `netN`.
6. Deteksi **conflict schematic** (opsional): output pin bertabrakan dengan output lain, dll. (non-blocking, hanya info).

Kompleksitas ~O((pins + verts) α(n)). Jalankan ulang hanya saat struktur skema berubah (debounced).

### 7.3 Pemetaan ke Board

Setiap pin yang `excluded` / `offBoard` diperlakukan khusus:

- `excluded`: diabaikan di board & pengecekan.
- `offBoard`: pin menjadi **solder pad**; tidak menempati body part di board.

Net board = himpunan `pinHoles` dari pin yang termasuk, digabung dengan union-find berdasarkan: strip connectivity (row segment), link wire, dan cut.

---

## 8. Board Model & Konflik

### 8.1 Strip Segmentation

- Satu row = deretan hole berurutan.
- Cut (drill/knife) memecah row menjadi segmen.
- Setiap segmen punya `net` bila semua pin di segmen itu satu net; jika >1 net → **konflik**.
- Hole kosong tetap bagian segmen (copper).

```js
// strips.js
segmentsForRow(board, row) -> Segment[]
// Segment: { row, startCol, endCol, nets:Set<string>, pins:[{compId,pinId}] }
```

### 8.2 Konflik

| Jenis | Definisi | UI |
|---|---|---|
| `short` | >1 net pada satu segmen strip | strip merah |
| `incomplete-net` | net punya pin di >1 segmen tak terhubung | highlight strip + badge sidebar |
| `stacked-wire` | dua link wire berimpit (bila `noStackedWires`) | wire merah |
| `wire-over-part` | link wire melintasi body part | wire merah putus |
| `off-board` | pin off-board tanpa solder pad | warning |
| `floating-pin` | pin part yang tidak menempel hole | error placement |

Konflik dihitung dalam `conflicts.js` dan di-cache berdasarkan hash board state agar tidak recompute berlebihan.

### 8.3 Validasi Cut & Wire

- Drill: set `cut` pada `(row,col)`; legal walau ada pin? Tidak legal jika menutupi hole berisi pin? **Legal** (cut di bawah part) untuk memutus strip — pin tetap tersolder ke sisi segmen yang tersisa; implementasi mengizinkan.
- Knife: `(row,col+0.5)`; harus berada di antara dua hole pada row yang sama.
- Link wire: kedua endpoint harus hole valid; tidak boleh melewati cut pada kolom yang sama? (wire adalah kabel terpisah, jadi boleh melewati strip).

### 8.4 Insert/Delete Row/Col

- Insert row → semua `row ≥ idx` +1; cut & wire & part ikut bergeser.
- Delete row → part yang punya pin di row itu di-unplace; part yang melintasi mengecilkan `leadsSpan`/footprint; wire yang endpoint-nya hilang dihapus; cut dihapus.
- Operasi menghasilkan satu command undoable.

---

## 9. Auto-Layout Engine

Mengadaptasi pendekatan simulated annealing + sequence pair dari stripboard-editor (lihat referensi di §13).

### 9.1 Representasi State (Description)

```js
/** @typedef {Object} LayoutState
 * @property {string[]} orderA       // urutan komponen (first order)
 * @property {string[]} orderB       // urutan komponen (second order)
 * @property {Record<string,0|1|2|3>} rotation
 * @property {Record<string,{flat:boolean,flip:boolean,span:number}>} flex
 * @property {Record<string, string[][]>} stripGroups  // net -> grup pin
 * @property {Record<string,{belowRows:number,rightCols:number}>} blanks
 * @property {{rows:number|null, cols:number|null}} lock
 */
```

Setiap nilai valid menghasilkan packing tanpa overlap (sequence pair property).

### 9.2 Decoder

```
decode(state) ->
  1. sequencePairToRelations(orderA, orderB)
  2. rowSolve(relations, stripGroups)  // longest-path / difference constraints
  3. colSolve(relations)
  4. render pins into grid (margin 1 + clearance)
   5. segment rows, place cuts at net boundaries
   6. route link wires: endpoint dipilih dari hole mana pun dalam segmen tembaga
      yang sama (bukan hanya hole pin); biaya = jarak + bonus sejajar + penalti silang pin
   => CandidateBoard { parts, cuts, wires, size }
```

- Row solve memakai constraint graph; kontradiksi → split satu pin keluar dari strip group, tulis balik ke state, ulangi.
- Kompleksitas target < 0.1 ms per decode untuk ~40 komponen.
- Komponen `excluded` tidak ikut di-layout; komponen locked dipertahankan di posisi lama.
- `LayoutState.rotation` memakai index `0..3`; saat ditulis ke `PlacedPart.rot` index dipetakan ke derajat `[0,90,180,270]` agar konsisten dengan renderer/UI.

### 9.3 Scorer

```
score =  wArea    * area
       + wShape   * (aspectPenalty + rowPenalty)
       + wWire    * (wireCount*wCount + wireLength*wLen)
       + wCut     * (knifePenalty + drilledPenalty)
       + wConnector * connectorOffEdge
       + wMess(t) * wireMess
       + wUnreach * unreachablePins
```

`wMess(t)` naik geometris sepanjang run (mis. 25 → 400) agar layout awal dibiarkan berantakan dulu.

### 9.4 Moves

Distribusi kira-kira (mengikuti referensi):

| Move | Bobot |
|---|---|
| Pull & tie (tarik komponen ke net sama + gabung strip group) | ~33% |
| Swap entri berdekatan di orderA/orderB | ~15% |
| Pull (tarik ke tetangga satu net) | ~15% |
| Flip flex / flip end / ubah span | ~15% |
| Merge/split strip group | ~10% |
| Rotate rigid | ~5% |
| Open/close blank line | ~5% |
| Throw connector ke ujung | ~2% |

### 9.5 Annealing Loop

```
for run in portfolio(effort):
  state = randomState(seed)
  T = 150
  for step in steps(effort):
    cand = propose(state)
    boardC = decode(cand)
    d = score(boardC) - score(current)
    if d <= 0 or rand() < exp(-d / T): accept()
    T *= coolingFactor
  best = min(best, finish(bestBoard))
```

- Cooling geometris menuju 0.15.
- Effort menentukan jumlah run & step (mis. Fast/Normal/High).
- `finish()`: pilih **start over** (re-route wiring penuh) vs **repair** (perbaiki wire bermasalah); ambil skor terendah.
- Lock: board size dan part locked dihormati sebagai constraint keras.

### 9.6 Web Worker

- `layout/worker.js` menerima `{ project, options, seed }`.
- Mengirim `postMessage` progress throttled (≤ 10 Hz).
- `layout/client.js` menerima `{ signal, onProgress }`; abort → reject `AbortError`, worker di-terminate. `threads` (1–4) menjalankan beberapa worker paralel dengan seed offset dan memilih skor terbaik; `LAYOUT_DONE` hanya di-emit sekali.
- UI modal menampilkan progress bar + est countdown, `Run` disabled selama run, `Cancel`/Escape membatalkan tanpa mengubah board.
- Setting auto-layout disimpan di localStorage `stripflow:layoutOptions` (`effort`, `drilledOnly`, `newLayout`, `extraRoom`, `noStackedWires`, `standingParts`, `threads`); `layoutEffort` lama tetap ditulis untuk kompatibilitas.
- Seed baca dari `project.meta.seed` (bisa diisi di modal auto-layout); bila `newLayout` dimatikan hasil deterministik, bila dinyalakan timestamp ditambahkan. Lock rows/cols disimpan ke `board.options.rowsLocked/colsLocked`.
- `newLayout` menambahkan timestamp ke seed sehingga setiap run menghasilkan layout berbeda; `extraRoom` menambah baris/kolom kosong di luar kebutuhan packing (kecuali dimensi dikunci).
- `noStackedWires` memberi penalti pada link wire yang memakai hole endpoint yang sudah dipakai wire lain; `standingParts` memaksa part fleksibel 2-pin yang belum ditempatkan ke orientasi vertikal.
- Transfer data: kirim model minimal (komponen, pin, net), bukan seluruh project.

### 9.7 Determinisme

PRNG mulberry32 dengan seed dari `project.meta.seed` + effort (dan timestamp bila `newLayout`); hasil dapat direproduksi selama `newLayout` mati. Dengan `threads > 1`, tiap worker memakai seed `base + i * 2654435761` sehingga tetap deterministik.

---

## 10. Persistence

### 10.1 IndexedDB Schema

```
DB: stripflow (version 1)
 store "projects"  keyPath "id"
   index "modifiedAt"
 store "settings"  keyPath "key"
 store "meta"      keyPath "key"     // mis. lastOpenedProjectId
```

Wrapper `storage.js` menyediakan:

```js
openDB()
listProjects() -> ProjectSummary[]
getProject(id) -> Project
putProject(project)
deleteProject(id)
getSetting(key, fallback)
setSetting(key, value)
```

### 10.2 Auto-save

- `autosave.js` subscribe ke `state:changed` slice `project`.
- Debounce 1200 ms inactivity, plus flush pada `visibilitychange→hidden` dan `beforeunload`.
- Status: `idle | saving | saved | error` → UI toolbar.
- Recovery (PS-05): saat perubahan dijadwalkan, `sessionDirty` (`{projectId,name,at}`) ditulis ke localStorage dan dihapus setelah flush sukses. Jika masih ada saat boot untuk project yang sama, banner menampilkan waktu autosave terakhir dan tombol Dismiss.

### 10.3 Migrasi & Versioning

- `schemaVersion` semver. `export/json.js` punya `migrate(project)` bertingkat (`1.0.0 → 1.1.0 → ...`).
- Import menolak versi lebih tinggi dari yang didukung dengan pesan jelas.
- Validasi struktural ringan (bukan schema lib penuh) + normalisasi default.

### 10.4 Kapasitas

IndexedDB umumnya puluhan–ratusan MB. Estimasi project 200 pin ≈ 100–300 KB JSON. Simpan satu record per project (bukan per perubahan) untuk menghindari bloat.

---

## 11. Export & Print

### 11.1 JSON

```json
{
  "schemaVersion": "1.0.0",
  "app": "stripflow",
  "project": { "...": "..." }
}
```

Round-trip: `parse(serialize(p))` harus deep-equal dengan `p` (kecuali `meta.modifiedAt`).

### 11.2 KiCad Netlist

- Generate netlist XML (KiCad 6/7 format): `components`, `nets`, pin `num`/`name`, `value`, `footprint`.
- Mapping footprint: tabel `data/packages.js` → nama footprint KiCad; custom symbol memakai `StripFlow:StripFlow_<label>` dan disertakan dalam library zip (`js/export/kicad-footprints.js`, ZIP tanpa dependency).
- Output berupa `.zip` bila ada custom footprint; selain itu satu file `.net`. Tombol **Footprints** mengunduh `StripFlow.pretty` berisi `.kicad_mod` + README.

### 11.2b Image

- `exportImage(project, { view, format, scale, labels, grid })` merender schematic/board/both ke canvas offscreen lalu PNG (Blob) atau SVG (PNG di-embed via data URL). Board image mengikuti pitch 2.54 mm, net color, cut, wire, dan off-board pad; schematic memakai grid 24 px.

### 11.3 Print

- Opsi print (`#modal-print`) disimpan di settings `printOptions`: `labels` (ref & pin), `bom` (tabel BOM + off-board wiring), `mono` (grayscale), `qr` (ringkasan project). `printProject(project, analysis, nets, { labels, bom, mono, qr })` membangun DOM di `#print-root`.
- Print DOM dibangun di `<div id="print-root">` (tersembunyi di layar) dan diaktifkan lewat `@media print`; `print-root--mono` memaksa grayscale.
- Halaman:
  1. Component sheet (skala 1:1, semua part & label).
  2. Cut sheet (mirror horizontal, ✕ pada cut).
  3. BOM (+ tabel wiring off-board). BOM menggabungkan baris dengan `value + symbolId + packageId` sama dan menampilkan label package.
- Skala: konstanta `PX_PER_MM = 96/25.4`; CSS memakai `mm` untuk ukuran halaman & posisi absolut.
- Calibration ruler 10 mm & 1 inci di setiap lembar.
- QR opsional berisi ringkasan project (nama, dimensi, jumlah part/net/cut/wire, issue) di component sheet; dibuat `js/export/qr.js` di atas `qrcode-generator` (MIT, vendored di `js/export/qrcode-generator.js`).

---

## 12. Error Handling & Resilience

- Command yang gagal validasi → `toast` + tidak mengubah state.
- Import invalid → error terstruktur (`{ code, message, details }`).
- Auto-layout gagal → hasil parsial tidak diterapkan; pop-up alasan.
- Worker crash → recreate worker, laporkan, fallback ke layout manual.
- `assert.js` aktif hanya saat dev (`?debug=1`).
- Semua listener pointer/keyboard di-`dispose` saat re-init.

---

## 13. Referensi Algoritma

1. Kirkpatrick, Gelatt, Vecchi — *Optimization by Simulated Annealing* (1983).
2. Murata et al. — *VLSI module placement based on rectangle-packing by the sequence-pair* (1995/96).
3. Cormen et al. — difference constraints & longest path (untuk row/col solve).
4. Prim — spanning tree untuk menghubungkan segmen net.

---

## 14. Testing Strategy (ringkas)

| Level | Cakupan | Tool |
|---|---|---|
| Unit | geometry, union-find, strips, seqpair, decoder, scorer, json migration | `node --test` |
| Integration | command+store+undo | `node --test` (DOM-free) |
| Visual/e2e | render smoke, drag, print | Playwright (opsional) |
| Benchmark | 5 rangkaian di PRD §9, ukur skor & waktu | script di `tests/unit` |

Detail tooling & perintah ada di [`TECH_STACK.md`](./TECH_STACK.md); aturan gaya ada di [`CONVENTIONS.md`](./CONVENTIONS.md).
