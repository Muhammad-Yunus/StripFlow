import {
  addFlag,
  addLabel,
  deleteSelection,
  duplicateSelection,
  mirrorSelection,
  moveSelection,
  rotateSelection,
  toggleExclude,
} from '../schematic/commands.js';
import { deleteBoardSelection, rotatePlaced } from '../board/commands.js';
import { placementFits } from '../board/model.js';

/** @type {string[]} */
let clipboard = [];

/**
 * @param {{
 *  store: import('../core/store.js').Store,
 *  schematicTools: import('../schematic/tools.js').SchematicTools,
 *  boardTools: import('../board/tools.js').BoardTools,
 *  getActivePanel: () => 'schematic'|'board',
 *  onSave: () => void,
 *  onNew: () => void,
 *  onOpen: () => void,
 *  toast: (m:string, k?:string) => void,
 }} deps
 */
export function initKeyboard(deps) {
  const { store, schematicTools, boardTools, getActivePanel, toast } = deps;

  globalThis.addEventListener('keydown', (e) => {
    const target = e.target;
    if (
      target instanceof HTMLElement &&
      (target.matches('input, textarea, select') || target.isContentEditable)
    ) {
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    const panel = getActivePanel();
    const ui = store.getUI();
    const project = store.getProject();
    const key = e.key;

    if (mod) {
      switch (key.toLowerCase()) {
        case 'z':
          e.preventDefault();
          if (e.shiftKey) store.redo();
          else store.undo();
          return;
        case 'y':
          e.preventDefault();
          store.redo();
          return;
        case 's':
          e.preventDefault();
          deps.onSave();
          return;
        case 'o':
          e.preventDefault();
          deps.onOpen();
          return;
        case 'n':
          e.preventDefault();
          deps.onNew();
          return;
        case 'a':
          e.preventDefault();
          if (panel === 'schematic') {
            const s = project.schematic;
            store.setUI({
              schematicSelection: [
                ...s.components.map((c) => c.id),
                ...s.wires.map((w) => w.id),
                ...s.flags.map((f) => f.id),
                ...s.labels.map((l) => l.id),
              ],
            });
          } else {
            store.setUI({
              boardSelection: [
                ...project.board.parts.map((p) => p.compId),
                ...project.board.wires.map((w) => w.id),
                ...project.board.cuts.map((c) => c.id),
              ],
            });
          }
          return;
        case 'c':
          e.preventDefault();
          clipboard = [...ui.schematicSelection];
          toast(`${clipboard.length} item${clipboard.length === 1 ? '' : 's'} copied`);
          return;
        case 'v':
          e.preventDefault();
          if (panel === 'schematic' && clipboard.length > 0) {
            pasteSchematic();
          }
          return;
        case 'd':
          e.preventDefault();
          if (panel === 'schematic' && ui.schematicSelection.length > 0) {
            duplicateSchematic();
          }
          return;
        default:
          return;
      }
    }

    if (key === 'Escape') {
      e.preventDefault();
      schematicTools.cancel();
      boardTools.cancel();
      store.setUI({
        schematicSelection: [],
        boardSelection: [],
        pendingSymbol: null,
        pendingPart: null,
        hoverNet: null,
        schematicTool: 'select',
        boardTool: 'select',
      });
      return;
    }

    if (key === 'Enter') {
      if (panel === 'schematic' && schematicTools.wire) {
        e.preventDefault();
        schematicTools.finishWire();
      }
      return;
    }

    if (key === 'Backspace') {
      if (panel === 'schematic' && schematicTools.wire) {
        e.preventDefault();
        const wire = schematicTools.wire;
        if (wire.points.length > 1) wire.points.pop();
        else schematicTools.cancel();
        return;
      }
    }

    if (key === 'Delete') {
      e.preventDefault();
      if (e.altKey && panel === 'schematic') {
        store.apply('Delete all wires', (draft) => {
          draft.schematic.wires = [];
        });
        return;
      }
      if (panel === 'schematic') {
        if (ui.schematicSelection.length === 0) return;
        store.apply('Delete selection', (draft) =>
          deleteSelection(draft.schematic, ui.schematicSelection),
        );
        store.setUI({ schematicSelection: [] });
      } else {
        if (ui.boardSelection.length === 0) return;
        store.apply('Delete selection', (draft) =>
          deleteBoardSelection(draft, ui.boardSelection),
        );
        store.setUI({ boardSelection: [] });
      }
      return;
    }

    if (key === 'Home' && !mod) {
      e.preventDefault();
      if (panel === 'schematic') {
        store.setUI({ schematicView: { pan: { x: 80, y: 80 }, zoom: 1 } });
      } else if (panel === 'board') {
        store.setUI({ boardView: { pan: { x: 24, y: 24 }, zoom: 1 } });
      }
      toast('View reset', 'info');
      return;
    }

    if (key.startsWith('Arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 5 : 1;
      const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
      const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
      if (panel === 'schematic') {
        if (ui.schematicSelection.length === 0) return;
        store.apply('Move selection', (draft) =>
          moveSelection(draft.schematic, ui.schematicSelection, dx, dy),
        );
      } else {
        // Board coords: row is vertical (dy), col is horizontal (dx).
        moveBoardParts(dy, dx);
      }
      return;
    }

    switch (key.toLowerCase()) {
      case 'w': {
        const tool = panel === 'schematic' ? ui.schematicTool : ui.boardTool;
        const next = tool === 'wire' ? 'select' : 'wire';
        if (panel === 'schematic') {
          if (next === 'select') schematicTools.cancel();
          store.setUI({ schematicTool: next, pendingSymbol: null, pendingPart: null });
        } else {
          if (next === 'select') boardTools.cancel();
          store.setUI({ boardTool: next, pendingSymbol: null, pendingPart: null });
        }
        return;
      }
      case 'c':
        if (panel === 'board') {
          store.setUI({ boardTool: ui.boardTool === 'cut' ? 'select' : 'cut' });
          boardTools.cancel();
        }
        return;
      case 'r':
        if (panel === 'schematic') {
          if (ui.schematicSelection.length === 0) return;
          store.apply('Rotate selection', (draft) =>
            rotateSelection(draft.schematic, ui.schematicSelection),
          );
        } else {
          const ids = ui.boardSelection.filter((id) =>
            project.board.parts.some((p) => p.compId === id && !p.locked),
          );
          if (ids.length === 0) return;
          store.apply('Rotate parts', (draft) => {
            for (const id of ids) rotatePlaced(draft, id);
          });
        }
        return;
      case 'm':
        if (panel === 'schematic' && ui.schematicSelection.length > 0) {
          store.apply('Mirror selection', (draft) =>
            mirrorSelection(draft.schematic, ui.schematicSelection),
          );
        }
        return;
      case 'e':
        if (panel === 'schematic' && ui.schematicSelection.length > 0) {
          store.apply('Exclude selection', (draft) =>
            toggleExclude(draft.schematic, ui.schematicSelection),
          );
        }
        return;
      case 'l':
        if (panel === 'schematic') {
          const pos = pointerCell(schematicTools);
          const name = globalThis.prompt?.('Net label name', 'SIG');
          if (name) {
            store.apply('Add net label', (draft) => addLabel(draft.schematic, name, pos.x, pos.y));
          }
        } else {
          const ids = ui.boardSelection.filter((id) =>
            project.board.parts.some((p) => p.compId === id),
          );
          if (ids.length === 0) return;
          store.apply('Lock parts', (draft) => {
            for (const id of ids) {
              const p = draft.board.parts.find((x) => x.compId === id);
              if (p) p.locked = !p.locked;
            }
          });
        }
        return;
      case 'g':
      case 'p':
        if (panel === 'schematic') {
          const pos = pointerCell(schematicTools);
          const isGround = key.toLowerCase() === 'g';
          store.apply('Add flag', (draft) =>
            addFlag(draft.schematic, isGround ? 'gnd' : 'pwr', isGround ? 'GND' : 'VCC', pos.x, pos.y),
          );
        }
        return;
      default:
        return;
    }
  });

  function moveBoardParts(dRow, dCol) {
    const ids = uiBoardIds();
    if (ids.length === 0) return;
    store.apply('Move parts', (draft) => {
      for (const id of ids) {
        const p = draft.board.parts.find((x) => x.compId === id);
        if (!p || p.locked) continue;
        const candidate = { ...p, row: p.row + dRow, col: p.col + dCol };
        if (placementFits(draft, candidate)) {
          p.row = candidate.row;
          p.col = candidate.col;
        }
      }
    });
  }

  function uiBoardIds() {
    const state = store.getUI();
    const project = store.getProject();
    return state.boardSelection.filter((id) => project.board.parts.some((p) => p.compId === id));
  }

  function pasteSchematic() {
    const ids = clipboard.filter((id) => selectionExists(id));
    if (ids.length === 0) {
      toast('Clipboard is empty', 'error');
      return;
    }
    let created = [];
    store.apply('Paste', (draft) => {
      created = duplicateSelection(draft.schematic, ids, 1, 1, draft.customSymbols);
    });
    store.setUI({ schematicSelection: created });
  }

  function duplicateSchematic() {
    const ui = store.getUI();
    let created = [];
    store.apply('Duplicate', (draft) => {
      created = duplicateSelection(draft.schematic, ui.schematicSelection, 1, 1, draft.customSymbols);
    });
    store.setUI({ schematicSelection: created });
  }

  function selectionExists(id) {
    const s = store.getProject().schematic;
    return (
      s.components.some((c) => c.id === id) ||
      s.wires.some((w) => w.id === id) ||
      s.flags.some((f) => f.id === id) ||
      s.labels.some((l) => l.id === id)
    );
  }

  function pointerCell(tools) {
    if (tools.pointer) return { x: Math.round(tools.pointer.x), y: Math.round(tools.pointer.y) };
    return { x: 0, y: 0 };
  }
}
