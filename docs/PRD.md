# PRD — StripFlow

**Product Requirements Document**
Versi: 1.0
Status: Draft
Terakhir diperbarui: 2026-10-23

---

## 1. Ringkasan Produk

StripFlow adalah aplikasi web **client-only** untuk merancang rangkaian elektronik pada **stripboard / veroboard**. Pengguna menggambar skema rangkaian, menempatkan komponen ke papan strip virtual, menyelesaikan konflik koneksi (cut & link wire), lalu mencetak template 1:1 untuk dirakit secara fisik.

Aplikasi ini adalah clone fungsional dari [stripboard-editor.com](https://stripboard-editor.com) dengan perbedaan utama:

- **Tanpa backend.** Semua data disimpan di browser (IndexedDB).
- **Tanpa akun.** Tidak ada login, dashboard, atau sharing lewat server.
- **Vanilla HTML/CSS/JS.** Tanpa framework dan tanpa build step wajib.
- **Full feature parity**, termasuk auto-layout berbasis simulated annealing.

### 1.1 Masalah yang Diselesaikan

Merancang stripboard secara manual itu rawan kesalahan: dua pin tanpa sengaja berada di satu strip copper, net terputus, atau cut terlewat. Editor visual dengan pewarnaan strip per-net dan deteksi konflik real-time mengurangi kesalahan sebelum soldering. Auto-layout menghilangkan teka-teki penempatan komponen, cut, dan link wire.

### 1.2 Target Pengguna

| Persona | Kebutuhan |
|---|---|
| Hobbyist elektronik | Merancang board kecil tanpa install software |
| Pelajar / mahasiswa | Belajar rangkaian dan layout stripboard |
| Maker / prototyper | Iterasi cepat sebelum bikin PCB |
| Pengguna offline | Butuh tool yang jalan tanpa internet setelah dimuat |

### 1.3 Prinsip Produk

1. **Client-only & privacy-first** — tidak ada data yang dikirim ke server.
2. **Tanpa dependensi berat** — beban halaman kecil, cepat dimuat.
3. **Deterministik** — project dapat di-export/import sebagai JSON.
4. **Progressive** — fitur inti tetap jalan tanpa fitur lanjutan.
5. **Aksesibel** — keyboard-first, mendukung print, dark mode.

---

## 2. Scope

### 2.1 In Scope

- Schematic editor lengkap (komponen, wiring, net, flag, label).
- Stripboard editor lengkap (grid, strip coloring, cut, link wire, conflict).
- Auto-layout (simulated annealing) dengan pengaturan effort & lock.
- Print 1:1 (component sheet, cut sheet, BOM).
- Export/import JSON.
- Export KiCad netlist.
- Penyimpanan lokal (IndexedDB) + auto-save.
- Undo/redo penuh.
- Dark mode.
- Custom component.
- Pintasan keyboard lengkap.

### 2.2 Out of Scope (v1)

- Backend, akun, cloud sync, sharing via URL server.
- Kolaborasi real-time / multi-user.
- Import netlist (hanya export).
- Routing PCB / autorouter jalur bebas.
- Simulasi rangkaian (SPICE).
- Mobile touch-first UI (harus tetap bisa dibuka, tapi target utama desktop).
- Plugin/ekstensi pihak ketiga.

---

## 3. Fitur & Acceptance Criteria

Prioritas memakai MoSCoW: **M**ust, **S**hould, **C**ould, **W**on't (v1).

### 3.1 Schematic Editor

| ID | Fitur | Prio | Acceptance Criteria |
|---|---|---|---|
| SC-01 | Kanvas skema dengan grid, zoom, pan | M | Grid terlihat; scroll zoom di cursor; right-drag pan; posisi tersimpan di project. |
| SC-02 | Library simbol bawaan | M | Minimal: Resistor, Capacitor, Polarized Cap, Diode, LED, NPN, PNP, Op-Amp, IC generik (DIP-8/14/16), Connector, Switch, Potentiometer, Ground, Power. |
| SC-03 | Penempatan komponen dari library | M | Drag dari panel ke kanvas; snap ke grid; komponen baru otomatis dapat ref (R1, C1, ...); komponen baru otomatis juga ditambahkan ke board di spot kosong pertama yang tersedia (tidak tumpang tindih dengan part yang sudah ada, tetap dalam batas board) — tanpa memaksa posisi; jika board penuh, tetap masuk unplaced tray. |
| SC-04 | Rotasi & mirror | M | `R` rotasi 90°; `M` mirror; berlaku untuk seleksi. |
| SC-05 | Wiring pin-to-pin / pin-to-grid | M | Klik ujung pin memulai wire; klik pin/titik/grid meneruskan; `Enter` selesai; `Backspace` mundur satu segmen. |
| SC-05a | Wire tegak & lurus (orthogonal) | M | Setiap segmen wire baru hanya horizontal atau vertikal; target diagonal otomatis disisipi satu siku (elbow) hingga semua segmen axis-aligned; berlaku juga untuk preview kursor live. |
| SC-05b | Auto-switch tool dari ujung konektor | M | Di mode select, klik pin (atau tepat di endpoint wire) otomatis pindah ke mode wire & mulai draft dari titik itu; di mode wire, klik badan simbol komponen meng-commit wire berjalan lalu kembali ke mode select dan memilih komponen itu. |
| SC-06 | Aturan konektivitas "touching = connected" | M | Wire end di wire = nyambung; pin di wire = nyambung; dua pin satu titik = nyambung; wire menyilang tanpa junction = **tidak** nyambung. |
| SC-07 | Junction dot & loose end marker | M | Junction otomatis saat 3+ koneksi; ujung wire bebas ditandai kotak berlubang. |
| SC-08 | Net detection otomatis | M | Pin yang terhubung membentuk satu net; nama default `net1`, `net2`, ...; warna unik per net. |
| SC-09 | Ground & Power flag | M | `G`/`P` menaruh flag di cursor; semua flag bernama sama = satu net; double-click rename. |
| SC-10 | Net label | M | `L` menaruh label; semua label bernama sama = satu net. |
| SC-11 | Rename & recolor net | M | Bisa dari sidebar net list; perubahan propagate ke semua pin. |
| SC-12 | Seleksi | M | Click select; `Ctrl+click` toggle; `Shift+click` tambah; box-select kiri→kanan = enclosed, kanan→kiri = touched. |
| SC-13 | Move, copy, paste, duplicate | M | Arrow move (Shift=5 step); `Ctrl+C/V/D`. |
| SC-14 | Rename label komponen/pin | S | Klik label untuk edit inline; label bisa digeser. |
| SC-15 | Custom component | S | Editor pin + body; tersimpan dalam project; bisa dipakai ulang. |
| SC-16 | Mount off-board | S | Part ditandai off-board; di board diganti solder pad / connector. |
| SC-17 | Exclude dari board | S | `E` toggle; part tetap di skema tapi diabaikan di board & net check. |
| SC-18 | Rotate/mirror pin mapping | M | Orientasi mempengaruhi posisi pin relatif untuk net/board. |
| SC-19 | Snap & constraint grid | M | Wire hanya di titik grid; komponen di grid. |

### 3.2 Stripboard Editor

| ID | Fitur | Prio | Acceptance Criteria |
|---|---|---|---|
| SB-01 | Grid hole 0.1 inci (2.54 mm) | M | Jumlah row/col dapat diubah; grid presisi. |
| SB-02 | Copper strip per row | M | Tiap row = satu strip; dapat dipotong oleh cut. |
| SB-03 | Unplaced tray | M | Part skema yang belum ditempatkan muncul di tray. |
| SB-04 | Drag & drop ke board | M | Part menempel ke hole; pin menempati hole sesuai footprint. |
| SB-05 | Live strip coloring | M | Strip berwarna sesuai net; strip dengan >1 net = merah. |
| SB-06 | Conflict detection real-time | M | Konflik muncul < 100ms setelah perubahan; detail konflik dapat diinspeksi. |
| SB-07 | Net completeness indicator | M | Sidebar menunjukkan net yang belum tersambung penuh; hover highlight strip terkait. |
| SB-08 | Cut tool (drill & knife) | M | `C`: klik hole = drill; klik antar-hole = knife cut; klik cut lagi = hapus; bisa di bawah part. |
| SB-09 | Link wire tool | M | `W`: klik hole → hole; wire di hole yang sudah ada diabaikan (bisa hop); tampil sebagai garis. |
| SB-10 | Select tool | M | Pindah part; klik wire/cut untuk drag/delete; drag ujung wire untuk ubah satu ujung. |
| SB-11 | Insert/delete row/col | M | Right-click di board; delete meng-unplace part yang terdampak; part yang hanya melintas mengecil. |
| SB-12 | Flexible leads (2-pin) | S | Drag satu pin untuk mengubah span/resapan; dalam batas package. |
| SB-13 | Package picker | S | Pilih body fisik (resistor 1/4W / 1/2W, TO-92 / TO-220, dsb.). |
| SB-14 | Editable IC footprint | S | Dari properties board: ubah ukuran body & posisi pin IC/connector; symbol standar menjadi salinan custom, pin id & wire dipertahankan. |
| SB-15 | Lock part untuk auto-layout | S | `L` toggle / properties; part terkunci tidak dipindah router. |
| SB-20 | Off-board component | M | Tandai di properties schematic/board; tampilkan solder pad saja. |
| SB-16 | Lock board size | S | Padlock di Rows/Cols; router tidak boleh membesar. |
| SB-17 | Rotate part | M | `R` rotasi; rotasi mempengaruhi hole yang ditempati. |
| SB-18 | Hapus part dari board | M | Delete mengembalikan ke tray. |
| SB-19 | History perubahan board | M | Undo/redo mencakup semua operasi board. |

### 3.3 Auto-Layout

| ID | Fitur | Prio | Acceptance Criteria |
|---|---|---|---|
| AL-01 | Tombol Auto-layout | M | Menjalankan router; progress terlihat; dapat dibatalkan. |
| AL-02 | Penempatan semua part | M | Semua part tidak terkunci ditempatkan. |
| AL-03 | Pemilihan ukuran board | M | Router memilih rows/cols optimal (kecuali dikunci). |
| AL-04 | Generate cuts & link wires | M | Hasil board bebas konflik dan semua net tersambung. |
| AL-05 | Lock board size | S | Jika dikunci, hasil muat dalam batas; mungkin ada sisa wire miring (dilaporkan). |
| AL-06 | Lock parts | S | Part terkunci tetap; layout cenderung lebih besar (dilaporkan). |
| AL-07 | Settings | S | New layout every run, drilled cuts only, no stacked wires, standing parts, extra room, effort, threads. |
| AL-08 | Effort level | S | Mengatur jumlah run & durasi; estimasi waktu ditampilkan. |
| AL-09 | Gagal terkontrol | M | Jika tidak bisa selesai, pop-up menjelaskan apa & kenapa; board tidak dirusak. |
| AL-10 | Non-blocking UI | M | Berjalan di Web Worker; UI tetap responsif; progress bar. |
| AL-11 | Determinisme opsional | C | Seed dapat di-set untuk reproduksi hasil. |

### 3.4 Print & Export

| ID | Fitur | Prio | Acceptance Criteria |
|---|---|---|---|
| PE-01 | Print 1:1 template | M | Skala 100% cocok stripboard nyata; ada calibration ruler. |
| PE-02 | Component sheet | M | Sisi atas; posisi part & label. |
| PE-03 | Cut sheet mirrored | M | Sisi copper; tiap cut ditandai ✕; mirror horizontal. |
| PE-04 | BOM | M | Qty, value, ref; dikelompokkan (value/symbolId/packageId); off-board part punya tabel wiring. |
| PE-05 | Opsi print | S | Warna / B&W; label ref & pin; BOM + wiring off-board; QR code view/edit. |
| PE-06 | Export JSON | M | Download seluruh project; round-trip import identik. |
| PE-07 | Import JSON | M | Validasi versi; error jelas jika korup. |
| PE-08 | Export KiCad netlist | S | XML netlist dengan part, value, pin, net; footprint library zip (`StripFlow.pretty`). |
| PE-09 | Export gambar | C | PNG/SVG board & skema (view board/schematic/both, skala 1–4x, label & grid opsional). |

### 3.5 Persistence & History

| ID | Fitur | Prio | Acceptance Criteria |
|---|---|---|---|
| PS-01 | IndexedDB project store | M | Create, list, open, rename, delete project. |
| PS-02 | Auto-save | M | Debounce ≤ 2s; status "saved" di UI. |
| PS-03 | Undo/redo | M | `Ctrl+Z` / `Ctrl+Y`; minimal 100 langkah; konsisten lintas modul. |
| PS-04 | Settings persistence | S | Preferensi (theme, grid, effort) tersimpan di localStorage. |
| PS-05 | Recovery | C | Jika tab crash, draft terakhir bisa dipulihkan. |

### 3.6 UI/UX

| ID | Fitur | Prio | Acceptance Criteria |
|---|---|---|---|
| UX-01 | Layout dua panel | M | Skema kiri, board kanan; resizable. |
| UX-02 | Toolbar project | M | New, open, save, export, print, undo/redo. |
| UX-03 | Sidebar | M | Net list, unplaced tray, properties, conflicts. |
| UX-04 | Context & floating menu | M | Right-click board; floating menu untuk part terpilih. |
| UX-05 | Keyboard shortcuts | M | Sesuai tabel di §4. |
| UX-06 | Dark mode | S | Toggle; ikut preferensi sistem default. |
| UX-07 | Feedback status | M | Toast untuk aksi (saved, exported, error). |
| UX-10 | Splitter panel | M | Drag + keyboard (Arrow/Home) untuk mengatur lebar schematic/board. |
| UX-11 | Library drag & drop | M | Drag simbol dari library ke canvas schematic. |
| UX-12 | Custom components | M | Buat/edit-komponen kustom di modal, simpan di project, hapus via context menu. |
| UX-08 | Empty states | S | Panduan singkat saat project kosong. |
| UX-09 | Responsif dasar | C | Usable di layar ≥ 1280px; tablet landscape minimal bisa lihat. |

---

## 4. Keyboard Shortcuts

### Umum (kedua editor)

| Shortcut | Aksi |
|---|---|
| `W` | Toggle wire tool |
| `R` | Rotate seleksi |
| `Delete` | Hapus seleksi |
| `Escape` | Batal → clear selection → matikan tool |
| Arrow keys | Geser seleksi 1 step (`Shift` = 5) |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| Right-drag | Pan |
| Scroll | Zoom |

### Schematic

| Shortcut | Aksi |
|---|---|
| `G` / `P` | Ground / Power flag di cursor |
| `L` | Net label di cursor |
| `M` | Mirror seleksi |
| `E` | Exclude/include part |
| `Enter` / `Backspace` | Selesai wire / mundur segmen |
| `Alt+Delete` | Hapus seluruh wire |
| `Ctrl+click` / `Shift+click` | Toggle / tambah seleksi |
| `Ctrl+A` | Select all |
| `Ctrl+C/V/D` | Copy / paste / duplicate |

### Stripboard

| Shortcut | Aksi |
|---|---|
| `C` | Toggle cut tool |
| `L` | Lock/unlock part untuk auto-layout |
| Right-click | Insert/delete row/col |

---

## 5. User Flows

### 5.1 Alur Utama (Manual Layout)

1. Buka app → New project.
2. Tambah komponen dari library ke skema.
3. Gambar wire antar pin; atur flag GND/power & label.
4. Verifikasi net di sidebar.
5. Drag part dari unplaced tray ke board.
6. Amati strip coloring; tambahkan cut di konflik.
7. Tambahkan link wire untuk net yang terputus.
8. Ulangi sampai sidebar menyatakan semua net selesai & 0 konflik.
9. Print template → rakit.

### 5.2 Alur Auto-Layout

1. Selesaikan skema + net.
2. (Opsional) Lock board size / part tertentu.
3. Klik Auto-layout → atur settings → jalankan.
4. Lihat progress; tunggu / batalkan.
5. Periksa hasil; jika perlu, ubah manual.
6. Print / export.

### 5.3 Alur Simpan & Bagikan Lokal

1. Auto-save berjalan otomatis.
2. Export JSON untuk backup / pindah mesin.
3. Import JSON di mesin lain.
4. Print dengan QR code (opsional) berisi data versi ringkas.

---

## 6. Non-Functional Requirements

| Kategori | Target |
|---|---|
| Waktu muat awal | < 1.5 s pada koneksi cepat; < 500 KB total JS gzip (di luar data library besar). |
| Interaksi kanvas | 60 FPS saat drag/pan pada board ≤ 60×40 hole. |
| Deteksi konflik | < 100 ms setelah perubahan. |
| Auto-layout | Board < 25 pin: < 10 s; 25–99 pin: < 60 s; 100–199 pin: < 5 menit (Normal effort). |
| Memori | < 200 MB untuk project besar (200 pin). |
| Kompatibilitas | Chrome/Edge/Firefox/Safari versi 2 tahun terakhir. |
| Aksesibilitas | Navigasi keyboard penuh; focus ring jelas; kontras AA. |
| Offline | Berfungsi penuh offline setelah load pertama (tanpa service worker di v1; cukup dari cache browser). |
| Keamanan | Tidak ada eksekusi kode dari file import; sanitasi string; tanpa eval. |
| Privasi | Tidak ada telemetry/network request setelah load. |

---

## 7. Roadmap & Milestone

| Fase | Isi | Exit Criteria |
|---|---|---|
| **P0 — Fondasi** | Scaffold, event bus, undo/redo, IndexedDB, model data, layout app shell | Bisa buat/simpan/buka project kosong; undo/redo state dasar. |
| **P1 — Schematic** | Komponen, library, wiring, net, flag, label, tools, seleksi | Skema lengkap bisa digambar dan net terdeteksi benar. |
| **P2 — Board Manual** | Grid, placement, strip coloring, conflict, cut, wire, row/col edit | Board bisa dilayout manual sampai 0 konflik. |
| **P3 — Print & Export** | Print 1:1, BOM, JSON, KiCad netlist | Template cetak akurat; round-trip JSON; netlist valid. |
| **P4 — Auto-Layout** | Sequence pair, decoder, scorer, annealer, worker, settings | Router menghasilkan board valid & rapi pada benchmark. |
| **P5 — Polish** | Dark mode, package picker, custom component, off-board, footprint editor, QR | Feature parity checklist terpenuhi. |

---

## 8. Success Metrics

- **Task success**: pengguna dapat membuat board valid dari skema contoh tanpa bantuan (usability test).
- **Correctness**: 100% net pada board hasil auto-layout tersambung dan 0 konflik pada benchmark (≥ 5 rangkaian uji).
- **Print accuracy**: selisih pitch template vs 2.54 mm < 0.5% saat print 100%.
- **Performance**: memenuhi target §6.
- **Data integrity**: round-trip JSON identik (deep-equal) untuk 100% project uji.

---

## 9. Benchmark & Test Circuits

Wajib lulus minimal:

1. **LED + resistor** (2 komponen, 1 net + GND/VCC).
2. **555 astable + transistor load** (6 komponen, 6 net).
3. **Guitar pedal** (18 komponen, 12 net, termasuk off-board pots/switch/jack).
4. **Op-amp buffer**.
5. **DIP-16 IC dengan decoupling caps**.

---

## 10. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Auto-layout terlalu lambat di JS | UX buruk | Web Worker, effort setting, batas waktu, optimasi decoder. |
| Render Canvas kompleks sulit di-maintain | Bug visual | Pisahkan renderer murni dari state; snapshot test visual. |
| Net detection edge case | Board salah | Unit test union-find & aturan touching; fixture benchmark. |
| Print tidak presisi | Rakit gagal | Kalibration ruler + test print fisik; CSS mm unit. |
| Data model berubah | Project lama rusak | Versioning + migration di JSON & IndexedDB. |
| Scope creep | Tidak selesai | Patuhi §2.2; fitur baru masuk backlog v2. |

---

## 11. Definisi "Selesai" (v1)

- Semua fitur berprioritas **M** dan **S** di §3 terimplementasi.
- Benchmark §9 lulus (manual & auto-layout).
- Print 1:1 terverifikasi.
- Round-trip JSON aman.
- Dokumentasi (`PRD`, `ARCHITECTURE`, `TECH_STACK`, `CONVENTIONS`) sinkron.
- Tidak ada dependensi backend.
