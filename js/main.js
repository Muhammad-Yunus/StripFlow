import { Store } from './core/store.js';
import { clamp, componentPinPos } from './core/geometry.js';
import { uid } from './core/ids.js';
import { createProject } from './core/state.js';
import { AutoSave } from './core/autosave.js';
import {
  deleteProject,
  getMeta,
  getProject,
  getSetting,
  listProjects,
  putProject,
  setMeta,
  setSetting,
} from './core/storage.js';
import { computeNets } from './schematic/netlist.js';
import { getSymbol } from './schematic/library.js';
import { SchematicRenderer } from './schematic/renderer.js';
import { SchematicTools } from './schematic/tools.js';
import { BoardRenderer } from './board/renderer.js';
import { BoardTools } from './board/tools.js';
import { analyzeBoard } from './board/strips.js';
import { Sidebar } from './ui/sidebar.js';
import { Toolbar } from './ui/toolbar.js';
import { initKeyboard } from './ui/keyboard.js';
import { initTheme, toggleTheme } from './ui/theme.js';
import { toast } from './ui/toast.js';
import { downloadProject, deserializeProject, normalize, safeName } from './export/json.js';
import { downloadNetlist } from './export/netlist.js';
import { printProject } from './export/print.js';
import { exportImage } from './export/image.js';
import { downloadFootprintLib } from './export/kicad-footprints.js';

globalThis.addEventListener('error', (e) => {
  console.error('[stripflow] uncaught', e.error ?? e.message);
  toast(e.error?.message || e.message || 'Unexpected error', 'error');
});

globalThis.addEventListener('unhandledrejection', (e) => {
  console.error('[stripflow] unhandled rejection', e.reason);
  toast(e.reason?.message || 'Unexpected error', 'error');
});

const SCHEMATIC_HINT = 'Click a part in the library, then click the canvas';
const BOARD_HINT = 'Drag a part to move it • right-click a row or column for board edits';

boot().catch((err) => {
  console.error('[stripflow] boot failed', err);
  toast(`Failed to start: ${err.message}`, 'error');
});

async function boot() {
  const project = await loadInitialProject();
  const store = new Store(project);
  const autosave = new AutoSave(store);
  await setMeta('lastOpenedProjectId', project.id);

  const schematicCanvas = document.getElementById('schematic-canvas');
  const boardCanvas = document.getElementById('board-canvas');
  const schematicRenderer = new SchematicRenderer(schematicCanvas, store);
  const boardRenderer = new BoardRenderer(boardCanvas, store);

  /** @type {'schematic'|'board'} */
  let activePanel = 'schematic';
  /** @type {AbortController|null} */
  let layoutController = null;
  /** @type {{compId:string,symbolId:string,custom:boolean}|null} */
  let symbolEdit = null;
  const setHint = (which, text) => {
    const el = document.getElementById(`${which}-hint`);
    if (el) el.textContent = text || (which === 'schematic' ? SCHEMATIC_HINT : BOARD_HINT);
  };

  let latest = computeAll();
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      render();
    });
  };

  const schematicTools = new SchematicTools(schematicCanvas, store, schematicRenderer, {
    onRender: schedule,
    onStatus: (text) => setHint('schematic', text),
  });
  const boardTools = new BoardTools(boardCanvas, store, boardRenderer, {
    onRender: schedule,
    onStatus: (text) => setHint('board', text),
    toast,
  });

  const sidebar = new Sidebar(store, { toast, onEditSymbol: (compId) => openSymbolEditor(compId) });

  const toolbar = new Toolbar(store, {
    theme: 'light',
    onNew: () => newProject(),
    onOpen: () => openProjectDialog(),
    onSave: () => saveNow(),
    onImport: () => importProject(),
    onExport: () => {
      downloadProject(store.getProject());
      toast('Project exported', 'ok');
    },
    onExportNetlist: () => {
      downloadNetlist(latest.project, latest.nets);
      toast('Netlist exported', 'ok');
    },
    onPrint: () => openPrintDialog(),
    onExportImage: () => openExportImageDialog(),
    onAuto: () => openAutoDialog(),
    onTheme: () => toolbar.setTheme(toggleTheme(currentTheme)),
  });

  let currentTheme = initTheme();
  toolbar.setTheme(currentTheme);

  initKeyboard({
    store,
    schematicTools,
    boardTools,
    getActivePanel: () => activePanel,
    onSave: () => saveNow(),
    onNew: () => newProject(),
    onOpen: () => openProjectDialog(),
    toast,
  });

  document.getElementById('schematic-panel').addEventListener('pointerenter', () => {
    activePanel = 'schematic';
  });
  document.getElementById('board-panel').addEventListener('pointerenter', () => {
    activePanel = 'board';
  });

  schematicCanvas.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('text/plain')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  schematicCanvas.addEventListener('drop', (e) => {
    const symbolId = e.dataTransfer?.getData('text/plain');
    if (!symbolId) return;
    e.preventDefault();
    activePanel = 'schematic';
    schematicTools.placeAtScreen(symbolId, e.clientX, e.clientY);
  });

  document.getElementById('modal-open').addEventListener('close', () => {
    const dialog = document.getElementById('modal-open');
    if (dialog.returnValue && dialog.returnValue.startsWith('open:')) {
      const id = dialog.returnValue.slice(5);
      loadProjectById(id);
    }
  });

  document.getElementById('print-cancel').addEventListener('click', () => {
    document.getElementById('modal-print').close('cancel');
  });
  document.getElementById('print-run').addEventListener('click', () => runPrint());

  document.getElementById('btn-export-image').addEventListener('click', () => openExportImageDialog());
  document.getElementById('export-image-cancel').addEventListener('click', () => {
    document.getElementById('modal-export-image').close('cancel');
  });
  document.getElementById('export-image-run').addEventListener('click', () => runExportImage());

  document.getElementById('btn-custom-component').addEventListener('click', () => openSymbolDialog());
  document.getElementById('symbol-add-pin').addEventListener('click', () => addPinRow());
  document.getElementById('symbol-cancel').addEventListener('click', () => {
    symbolEdit = null;
    document.getElementById('modal-symbol').close('cancel');
  });
  document.getElementById('symbol-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveCustomSymbol();
  });

  document.getElementById('auto-run').addEventListener('click', () => startAutoLayout());
  document.getElementById('auto-cancel').addEventListener('click', () => {
    if (layoutController) layoutController.abort();
    else document.getElementById('modal-auto').close('cancel');
  });
  document.getElementById('modal-auto').addEventListener('cancel', (e) => {
    if (!layoutController) return;
    e.preventDefault();
    layoutController.abort();
  });

  document.getElementById('btn-export-netlist').addEventListener('click', () => {
    downloadNetlist(latest.project, latest.nets);
    toast('Netlist exported', 'ok');
  });

  document.getElementById('btn-export-footprints').addEventListener('click', () => {
    const ok = downloadFootprintLib(latest.project);
    toast(ok ? 'Footprint library exported' : 'No custom components to export', ok ? 'ok' : 'error');
  });

  store.subscribe(() => {
    latest = computeAll();
    schedule();
  });

  function computeAll() {
    const current = store.getProject();
    const nets = computeNets(current.schematic);
    const analysis = analyzeBoard(current, nets);
    return { project: current, ui: store.getUI(), nets, analysis };
  }

  function render() {
    latest = computeAll();
    const { project: p, ui, nets, analysis } = latest;
    schematicRenderer.draw(p, ui, nets, schematicTools.getExtras());
    boardRenderer.draw(p, ui, analysis, nets, boardTools.getExtras());
    sidebar.update(p, ui, nets, analysis);
    toolbar.update(p, ui);

    const schematicPanel = document.getElementById('schematic-panel');
    schematicPanel.classList.toggle('is-wiring', ui.schematicTool === 'wire');
    schematicPanel.classList.toggle('is-placing', Boolean(ui.pendingSymbol));
    const boardPanel = document.getElementById('board-panel');
    boardPanel.classList.toggle('is-cutting', ui.boardTool === 'cut');
    boardPanel.classList.toggle('is-wiring', ui.boardTool === 'wire');
    boardPanel.classList.toggle('is-placing', Boolean(ui.pendingPart));
  }

  async function saveNow() {
    await autosave.saveNow();
    toast('Saved', 'ok');
  }

  async function newProject() {
    if (!globalThis.confirm?.('Start a new project? The current one stays saved in your browser.')) {
      return;
    }
    const fresh = createProject('Untitled');
    store.reset(fresh);
    await putProject(fresh);
    await setMeta('lastOpenedProjectId', fresh.id);
    toast('New project created', 'ok');
    render();
  }

  async function loadProjectById(id) {
    const loaded = await getProject(id);
    if (!loaded) {
      toast('Project not found', 'error');
      return;
    }
    store.reset(normalize(loaded));
    await setMeta('lastOpenedProjectId', id);
    toast('Project opened', 'ok');
    render();
  }

  async function openProjectDialog() {
    const dialog = document.getElementById('modal-open');
    const list = document.getElementById('project-list');
    list.textContent = '';
    const projects = await listProjects();
    if (projects.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'No saved projects yet.';
      list.appendChild(empty);
    }
    for (const row of projects) {
      const wrap = document.createElement('div');
      wrap.className = 'projectlist__row';
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'projectlist__item';
      const name = document.createElement('span');
      name.className = 'projectlist__name';
      name.textContent = row.name;
      const date = document.createElement('span');
      date.className = 'projectlist__date';
      date.textContent = row.modifiedAt ? new Date(row.modifiedAt).toLocaleString() : '—';
      item.append(name, date);
      item.addEventListener('click', () => {
        dialog.close(`open:${row.id}`);
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'projectlist__delete';
      remove.title = `Delete ${row.name}`;
      remove.setAttribute('aria-label', `Delete ${row.name}`);
      remove.textContent = '✕';
      remove.addEventListener('click', async () => {
        if (!globalThis.confirm?.(`Delete "${row.name}"? This cannot be undone.`)) return;
        await deleteProject(row.id);
        wrap.remove();
        if (store.getProject().id === row.id) {
          const fresh = createProject('Untitled');
          store.reset(fresh);
          await putProject(fresh);
          await setMeta('lastOpenedProjectId', fresh.id);
          render();
        }
        toast('Project deleted', 'ok');
        if (!list.querySelector('.projectlist__row')) {
          list.textContent = '';
          const empty = document.createElement('p');
          empty.className = 'empty';
          empty.textContent = 'No saved projects yet.';
          list.appendChild(empty);
        }
      });
      wrap.append(item, remove);
      list.appendChild(wrap);
    }
    dialog.showModal();
  }

  function importProject() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = deserializeProject(text);
        imported.name = imported.name || safeName(file.name.replace(/\.json$/i, ''));
        store.reset(imported);
        await putProject(imported);
        await setMeta('lastOpenedProjectId', imported.id);
        toast('Project imported', 'ok');
        render();
      } catch (err) {
        toast(err.message || 'Import failed', 'error');
      }
    });
    input.click();
  }

  function openPrintDialog() {
    const saved = getSetting('printOptions', {}) ?? {};
    document.getElementById('print-labels').checked = saved.labels ?? true;
    document.getElementById('print-bom').checked = saved.bom ?? true;
    document.getElementById('print-mono').checked = saved.mono ?? false;
    document.getElementById('modal-print').showModal();
  }

  function runPrint() {
    const options = {
      labels: document.getElementById('print-labels').checked,
      bom: document.getElementById('print-bom').checked,
      mono: document.getElementById('print-mono').checked,
    };
    setSetting('printOptions', options);
    document.getElementById('modal-print').close('print');
    const project = store.getProject();
    const nets = computeNets(project.schematic);
    printProject(project, analyzeBoard(project, nets), nets, options);
  }

  function openExportImageDialog() {
    document.getElementById('modal-export-image').showModal();
  }

  function runExportImage() {
    const options = {
      view: document.getElementById('export-image-view').value,
      format: document.getElementById('export-image-format').value,
      scale: document.getElementById('export-image-scale').value,
      labels: document.getElementById('export-image-labels').checked,
      grid: document.getElementById('export-image-grid').checked,
    };
    document.getElementById('modal-export-image').close('export');
    const project = store.getProject();
    void exportImage(project, options);
  }

  function openExportImageDialog() {
    document.getElementById('modal-export-image').showModal();
  }

  function runExportImage() {
    const options = {
      view: document.getElementById('export-image-view').value,
      format: document.getElementById('export-image-format').value,
      scale: document.getElementById('export-image-scale').value,
      labels: document.getElementById('export-image-labels').checked,
      grid: document.getElementById('export-image-grid').checked,
    };
    document.getElementById('modal-export-image').close('export');
    const project = store.getProject();
    void exportImage(project, options);
  }

  function openSymbolDialog() {
    symbolEdit = null;
    const form = document.getElementById('symbol-form');
    form.reset();
    document.getElementById('symbol-title').textContent = 'Custom component';
    document.getElementById('symbol-lede').textContent =
      'Define a reusable symbol with its own body size and pin grid offsets.';
    document.getElementById('symbol-save').textContent = 'Create';
    document.getElementById('symbol-prefix').value = 'U';
    document.getElementById('symbol-value').value = '';
    document.getElementById('symbol-width').value = '6';
    document.getElementById('symbol-height').value = '4';
    const pins = document.getElementById('symbol-pins');
    pins.textContent = '';
    addPinRow('', '-2', '0');
    addPinRow('', '2', '0');
    showSymbolError('');
    document.getElementById('modal-symbol').showModal();
    setTimeout(() => document.getElementById('symbol-label').focus(), 0);
  }

  function openSymbolEditor(compId) {
    const project = store.getProject();
    const comp = project.schematic.components.find((c) => c.id === compId);
    const symbol = comp ? getSymbol(comp.symbolId, project.customSymbols) : null;
    if (!comp || !symbol) {
      toast('Footprint not found', 'error');
      return;
    }
    const custom = (project.customSymbols || []).some((s) => s.id === symbol.id);
    symbolEdit = { compId, symbolId: symbol.id, custom };
    const form = document.getElementById('symbol-form');
    form.reset();
    document.getElementById('symbol-title').textContent = custom
      ? 'Edit custom footprint'
      : 'Edit component footprint';
    document.getElementById('symbol-lede').textContent = custom
      ? 'Updates every component using this custom symbol; pin ids are preserved.'
      : 'Saves a custom copy of this footprint and assigns it to the selected component; ' +
        'pin ids are preserved.';
    document.getElementById('symbol-save').textContent = 'Save footprint';
    document.getElementById('symbol-label').value = custom
      ? symbol.label
      : `${symbol.label} (edited)`;
    document.getElementById('symbol-prefix').value = symbol.refPrefix;
    document.getElementById('symbol-value').value = symbol.defaultValue ?? comp.value;
    document.getElementById('symbol-width').value = String(symbol.width);
    document.getElementById('symbol-height').value = String(symbol.height);
    const pins = document.getElementById('symbol-pins');
    pins.textContent = '';
    for (const pin of symbol.pins) {
      addPinRow(
        pin.name,
        String(pin.offset.x),
        String(pin.offset.y),
        pin.id,
        pin.type || 'passive',
      );
    }
    showSymbolError('');
    document.getElementById('modal-symbol').showModal();
    setTimeout(() => document.getElementById('symbol-label').focus(), 0);
  }

  function addPinRow(name = '', x = '', y = '', pinId = '', pinType = 'passive') {
    const row = document.createElement('div');
    row.className = 'symbol-pin';
    row.dataset.pinId = pinId;
    row.dataset.pinType = pinType;
    for (const [placeholder, value, type] of [
      ['Pin name', name, 'text'],
      ['X', x, 'number'],
      ['Y', y, 'number'],
    ]) {
      const input = document.createElement('input');
      input.placeholder = placeholder;
      input.value = value;
      input.type = type;
      input.step = type === 'number' ? '1' : '';
      row.appendChild(input);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'symbol-pin__remove';
    remove.textContent = '✕';
    remove.title = 'Remove pin';
    remove.addEventListener('click', () => row.remove());
    row.appendChild(remove);
    document.getElementById('symbol-pins').appendChild(row);
  }

  function showSymbolError(message) {
    const el = document.getElementById('symbol-error');
    el.hidden = !message;
    el.textContent = message;
    el.classList.toggle('is-error', Boolean(message));
  }

  function saveCustomSymbol() {
    const label = document.getElementById('symbol-label').value.trim();
    const refPrefix = document.getElementById('symbol-prefix').value.trim().toUpperCase();
    const defaultValue = document.getElementById('symbol-value').value.trim();
    const width = Math.round(Number(document.getElementById('symbol-width').value));
    const height = Math.round(Number(document.getElementById('symbol-height').value));
    if (!label) return showSymbolError('Give the component a name.');
    if (!/^[A-Za-z]{1,4}$/.test(refPrefix)) {
      return showSymbolError('Ref prefix must be 1–4 letters.');
    }
    if (!Number.isFinite(width) || width < 2 || width > 40) {
      return showSymbolError('Width must be between 2 and 40 cells.');
    }
    if (!Number.isFinite(height) || height < 2 || height > 40) {
      return showSymbolError('Height must be between 2 and 40 cells.');
    }
    const rows = [...document.querySelectorAll('#symbol-pins .symbol-pin')];
    if (rows.length < 1) return showSymbolError('Add at least one pin.');
    const pins = [];
    for (const [index, row] of rows.entries()) {
      const inputs = row.querySelectorAll('input');
      const name = inputs[0].value.trim();
      const x = Math.round(Number(inputs[1].value));
      const y = Math.round(Number(inputs[2].value));
      if (!name) return showSymbolError(`Pin ${index + 1} needs a name.`);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return showSymbolError(`Pin "${name}" needs integer X/Y offsets.`);
      }
      if (Math.abs(x) > Math.ceil(width / 2) || Math.abs(y) > Math.ceil(height / 2)) {
        return showSymbolError(`Pin "${name}" is outside the body bounds.`);
      }
      if (pins.some((p) => p.name === name)) {
        return showSymbolError(`Pin name "${name}" is used twice.`);
      }
      const pinId = row.dataset.pinId || `p${index + 1}`;
      if (pins.some((p) => p.id === pinId)) {
        return showSymbolError(`Pin id "${pinId}" is used twice.`);
      }
      pins.push({
        id: pinId,
        name,
        offset: { x, y },
        type: row.dataset.pinType || 'passive',
      });
    }
    const editing = symbolEdit;
    const symbol = {
      id: editing?.custom ? editing.symbolId : uid('sym'),
      label,
      refPrefix,
      defaultValue: defaultValue || label,
      width,
      height,
      custom: true,
      pins,
    };
    if (editing) {
      const compId = editing.compId;
      store.apply('Edit footprint', (draft) => {
        if (!Array.isArray(draft.customSymbols)) draft.customSymbols = [];
        const index = draft.customSymbols.findIndex((s) => s.id === symbol.id);
        if (index >= 0) draft.customSymbols[index] = symbol;
        else draft.customSymbols.push(symbol);
        const clonePins = () => symbol.pins.map((p) => ({ ...p, offset: { ...p.offset } }));
        const key = (p) => `${Math.round(p.x * 1000) / 1000},${Math.round(p.y * 1000) / 1000}`;
        const moves = new Map();
        for (const comp of draft.schematic.components) {
          const sameCustom = symbol.id === editing.symbolId && comp.symbolId === editing.symbolId;
          if (comp.id !== compId && !sameCustom) continue;
          const oldPins = new Map(comp.pins.map((p) => [p.id, p]));
          for (const pin of symbol.pins) {
            const oldPin = oldPins.get(pin.id);
            if (!oldPin) continue;
            moves.set(key(componentPinPos(comp, oldPin.offset)), componentPinPos(comp, pin.offset));
          }
          comp.symbolId = symbol.id;
          comp.pins = clonePins();
        }
        for (const wire of draft.schematic.wires) {
          for (const point of wire.points) {
            const moved = moves.get(key(point));
            if (moved) {
              point.x = moved.x;
              point.y = moved.y;
            }
          }
        }
      });
      symbolEdit = null;
      showSymbolError('');
      document.getElementById('modal-symbol').close('saved');
      toast(`Footprint "${label}" updated`, 'ok');
      return;
    }
    store.apply('Add custom component', (draft) => {
      if (!Array.isArray(draft.customSymbols)) draft.customSymbols = [];
      draft.customSymbols.push(symbol);
    });
    showSymbolError('');
    document.getElementById('modal-symbol').close('created');
    toast(`Custom component "${label}" created`, 'ok');
  }

  function openAutoDialog() {
    document.getElementById('auto-lock-rows').checked = false;
    document.getElementById('auto-lock-cols').checked = false;
    document.getElementById('auto-drilled-only').checked =
      store.getProject().board.options?.drilledCutsOnly ?? false;
    const savedEffort = getSetting('layoutEffort', 'normal');
    document.getElementById('auto-effort').value = ['fast', 'normal', 'high'].includes(savedEffort)
      ? savedEffort
      : 'normal';
    document.getElementById('auto-progress').hidden = true;
    document.getElementById('auto-progress-text').hidden = true;
    document.getElementById('auto-progress-bar').style.width = '0%';
    document.getElementById('auto-run').disabled = false;
    document.getElementById('modal-auto').showModal();
  }

  async function startAutoLayout() {
    const dialog = document.getElementById('modal-auto');
    const runBtn = document.getElementById('auto-run');
    const autoBtn = document.getElementById('btn-auto');
    const progress = document.getElementById('auto-progress');
    const bar = document.getElementById('auto-progress-bar');
    const progressText = document.getElementById('auto-progress-text');
    const options = {
      effort: document.getElementById('auto-effort').value,
      lockRows: document.getElementById('auto-lock-rows').checked,
      lockCols: document.getElementById('auto-lock-cols').checked,
      drilledOnly: document.getElementById('auto-drilled-only').checked,
    };
    const estimate = { fast: 500, normal: 2000, high: 6000 }[options.effort] ?? 2000;
    setSetting('layoutEffort', options.effort);
    const controller = new AbortController();
    layoutController = controller;
    runBtn.disabled = true;
    if (autoBtn) autoBtn.disabled = true;
    progress.hidden = false;
    progressText.hidden = false;
    progressText.textContent = 'Starting…';
    setHint('board', 'Auto-layout running…');
    const started = performance.now();
    const timer = setInterval(() => {
      const pct = Math.min(94, ((performance.now() - started) / estimate) * 100);
      bar.style.width = `${pct}%`;
    }, 100);
    try {
      const { runAutoLayout: run } = await import('./layout/client.js');
      const result = await run(store.getProject(), options, {
        signal: controller.signal,
        onProgress: (p) => {
          progressText.textContent = `Run ${p.run + 1} · step ${p.step} · best score ${p.best}`;
        },
      });
      bar.style.width = '100%';
      const board = result?.board ?? result?.project?.board;
      if (!board) throw new Error('Auto-layout returned no board.');
      store.apply('Auto-layout', (draft) => {
        draft.board = structuredClone(board);
        draft.board.options.drilledCutsOnly = options.drilledOnly;
      });
      toast(
        result.failed?.length
          ? `Auto-layout finished with ${result.failed.length} unplaced part(s)`
          : 'Auto-layout finished',
        result.failed?.length ? 'info' : 'ok',
      );
      dialog.close('done');
    } catch (err) {
      if (err.name === 'AbortError') {
        progressText.textContent = 'Cancelled.';
        toast('Auto-layout cancelled', 'info');
      } else {
        console.error('[stripflow] auto-layout failed', err);
        progressText.textContent = err.message || 'Auto-layout failed.';
        toast(err.message || 'Auto-layout failed', 'error');
      }
    } finally {
      clearInterval(timer);
      layoutController = null;
      runBtn.disabled = false;
      if (autoBtn) autoBtn.disabled = false;
      setHint('board', '');
      setTimeout(() => {
        if (layoutController) return;
        progress.hidden = true;
        progressText.hidden = true;
        bar.style.width = '0%';
      }, 800);
    }
  }

  function initSplitter() {
    const workspace = document.querySelector('.workspace');
    const splitter = document.getElementById('panel-splitter');
    const sidebar = document.getElementById('sidebar');
    if (!workspace || !splitter) return;

    const SPLIT_KEY = 'stripflow:split-left';
    const reset = () => {
      workspace.style.removeProperty('--split-left');
      schedule();
    };
    const bounds = () => {
      const sidebarWidth = sidebar && sidebar.offsetParent ? sidebar.offsetWidth + 5 : 0;
      const max = Math.max(260, workspace.clientWidth - sidebarWidth - 260 - 5);
      return { min: 240, max };
    };
    const setLeft = (value, persist) => {
      const { min, max } = bounds();
      const left = clamp(Math.round(value), min, max);
      workspace.style.setProperty('--split-left', `${left}px`);
      if (persist) {
        try {
          localStorage.setItem(SPLIT_KEY, String(left));
        } catch {
          /* storage unavailable */
        }
      }
      schedule();
    };

    try {
      const saved = Number(localStorage.getItem(SPLIT_KEY));
      if (Number.isFinite(saved) && saved > 0) {
        requestAnimationFrame(() => setLeft(saved, false));
      }
    } catch {
      /* storage unavailable */
    }

    splitter.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      splitter.classList.add('is-dragging');
      const onMove = (event) => {
        event.preventDefault();
        const workspaceLeft = workspace.getBoundingClientRect().left;
        setLeft(event.clientX - workspaceLeft, false);
      };
      const onUp = () => {
        splitter.classList.remove('is-dragging');
        globalThis.removeEventListener('pointermove', onMove);
        globalThis.removeEventListener('pointerup', onUp);
        globalThis.removeEventListener('pointercancel', onUp);
        const width = document.getElementById('schematic-panel').getBoundingClientRect().width;
        try {
          localStorage.setItem(SPLIT_KEY, String(Math.round(width)));
        } catch {
          /* storage unavailable */
        }
      };
      globalThis.addEventListener('pointermove', onMove);
      globalThis.addEventListener('pointerup', onUp);
      globalThis.addEventListener('pointercancel', onUp);
    });

    splitter.addEventListener('keydown', (e) => {
      const width = document.getElementById('schematic-panel').getBoundingClientRect().width;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setLeft(width - (e.shiftKey ? 96 : 24), true);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setLeft(width + (e.shiftKey ? 96 : 24), true);
      } else if (e.key === 'Home') {
        e.preventDefault();
        reset();
        try {
          localStorage.removeItem(SPLIT_KEY);
        } catch {
          /* storage unavailable */
        }
      }
    });

    globalThis.addEventListener('resize', () => {
      const split = workspace.style.getPropertyValue('--split-left');
      if (split) setLeft(parseFloat(split), false);
    });
  }

  setHint('schematic', '');
  setHint('board', '');
  initSplitter();
  render();

  globalThis.__stripflow = { store, autosave, schematicTools, boardTools, renderer: schematicRenderer };
}

async function loadInitialProject() {
  const id = await getMeta('lastOpenedProjectId');
  if (id) {
    const stored = await getProject(id);
    if (stored) return normalize(stored);
  }
  const projects = await listProjects();
  if (projects.length > 0) {
    const stored = await getProject(projects[0].id);
    if (stored) return normalize(stored);
  }
  return createProject('Untitled');
}
