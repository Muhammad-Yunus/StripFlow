import { allSymbols, SPECIAL_ITEMS } from '../schematic/library.js';
import { DEFAULT_LEAD_SPAN, PACKAGES, isFlexible } from '../board/packages.js';
import { rotatePlaced, unplacePart } from '../board/commands.js';
import { renameNet, setNetColor } from '../schematic/commands.js';
import { showContextMenu } from './menus.js';

export class Sidebar {
  /** @param {import('../core/store.js').Store} store */
  constructor(store, { toast = () => {}, onEditSymbol = () => {} } = {}) {
    this.store = store;
    this.toast = toast;
    this.onEditSymbol = onEditSymbol;
    this.libraryEl = document.getElementById('library-list');
    this.netEl = document.getElementById('net-list');
    this.unplacedEl = document.getElementById('unplaced-list');
    this.placedEl = document.getElementById('placed-list');
    this.propertiesEl = document.getElementById('properties');
    this.issuesEl = document.getElementById('issue-list');
    this.tabs = [...document.querySelectorAll('.sidebar__tab')];
    this.panes = [...document.querySelectorAll('.sidebar__pane')];
    this.librarySignature = '';
    this.lastNets = null;
    this.pendingNetColor = null;
    this.colorInput = document.createElement('input');
    this.colorInput.type = 'color';
    this.colorInput.className = 'color-proxy';
    this.colorInput.tabIndex = -1;
    this.colorInput.addEventListener('change', () => {
      const name = this.pendingNetColor;
      this.pendingNetColor = null;
      if (!name) return;
      const color = this.colorInput.value;
      this.store.apply('Net color', (draft) => setNetColor(draft.schematic, name, color));
    });
    document.body.appendChild(this.colorInput);
    this.buildTabs();
    this.bindLibrary();
    this.buildLibrary();
  }

  buildTabs() {
    for (const tab of this.tabs) {
      tab.addEventListener('click', () => {
        const name = tab.dataset.tab;
        this.store.setUI({ sidebarTab: name });
        for (const t of this.tabs) t.classList.toggle('is-active', t.dataset.tab === name);
        for (const p of this.panes) p.classList.toggle('is-active', p.dataset.pane === name);
      });
    }
  }

  bindLibrary() {
    this.libraryEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.libitem');
      if (!btn) return;
      const id = btn.dataset.id;
      const ui = this.store.getUI();
      const next = ui.pendingSymbol === id ? null : id;
      this.store.setUI({
        pendingSymbol: next,
        pendingPart: null,
        schematicTool: 'select',
        boardTool: 'select',
      });
    });
    this.libraryEl.addEventListener('contextmenu', (e) => {
      const btn = e.target.closest('.libitem');
      if (!btn) return;
      const id = btn.dataset.id;
      const project = this.store.getProject();
      const symbol = project.customSymbols?.find((s) => s.id === id);
      if (!symbol) return;
      e.preventDefault();
      const used = project.schematic.components.some((c) => c.symbolId === id);
      showContextMenu(
        [
          {
            label: used ? 'Delete (in use)' : 'Delete custom component',
            danger: true,
            disabled: used,
            action: () => {
              this.store.apply('Delete custom component', (draft) => {
                draft.customSymbols = draft.customSymbols.filter((s) => s.id !== id);
              });
              if (this.store.getUI().pendingSymbol === id) {
                this.store.setUI({ pendingSymbol: null });
              }
              this.toast('Custom component deleted');
            },
          },
        ],
        e.clientX,
        e.clientY,
      );
    });
  }

  buildLibrary() {
    const project = this.store.getProject();
    const ui = this.store.getUI();
    const symbols = allSymbols(project.customSymbols);
    this.librarySignature = symbols.map((s) => s.id).join('|');
    this.libraryEl.textContent = '';
    for (const symbol of symbols) {
      this.libraryEl.appendChild(this.makeLibItem(symbol.id, symbol.label, iconSvg(symbol.id)));
    }
    for (const item of SPECIAL_ITEMS) {
      this.libraryEl.appendChild(this.makeLibItem(item.id, item.label, iconSvg(item.id)));
    }
    this.libraryEl.querySelectorAll('.libitem').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.id === ui.pendingSymbol);
    });
  }

  makeLibItem(id, label, svg) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'libitem';
    btn.dataset.id = id;
    btn.draggable = true;
    btn.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
    });
    btn.innerHTML = svg;
    const span = document.createElement('span');
    span.textContent = label;
    btn.appendChild(span);
    return btn;
  }

  /** @param {import('../core/types.js').Project} project @param {import('../core/types.js').UIState} ui */
  syncTools(project, ui) {
    this.libraryEl.querySelectorAll('.libitem').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.id === ui.pendingSymbol);
    });
    void project;
  }

  /**
   * @param {import('../core/types.js').Project} project
   * @param {import('../core/types.js').UIState} ui
   * @param {ReturnType<import('../schematic/netlist.js').computeNets>} nets
   * @param {ReturnType<import('../board/strips.js').analyzeBoard>} analysis
   */
  update(project, ui, nets, analysis) {
    const signature = allSymbols(project.customSymbols)
      .map((s) => s.id)
      .join('|');
    if (signature !== this.librarySignature) this.buildLibrary();
    this.syncTools(project, ui);
    this.renderNets(nets, analysis, ui);
    this.renderParts(project, ui, analysis);
    this.renderIssues(analysis, nets);
  }

  renderNets(nets, analysis, ui) {
    this.lastNets = nets;
    this.netEl.textContent = '';
    if (nets.nets.length === 0) {
      this.netEl.appendChild(empty('No nets yet. Draw wires between pins or add flags and labels.'));
      return;
    }
    const incomplete = new Set(analysis.incomplete.map((i) => i.refs.net));
    const shorted = new Set(
      analysis.conflicts.filter((c) => c.kind === 'short').flatMap((c) => c.refs.nets ?? []),
    );
    for (const net of nets.nets) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'netrow';
      if (ui.hoverNet === net.name) row.classList.add('is-hover');

      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = net.color;
      swatch.title = 'Change colour';
      row.appendChild(swatch);

      const name = document.createElement('span');
      name.className = 'netrow__name';
      name.textContent = net.name;
      row.appendChild(name);

      if (incomplete.has(net.name) || shorted.has(net.name)) {
        const badge = document.createElement('span');
        badge.className = 'netrow__badge';
        badge.textContent = shorted.has(net.name) ? 'short' : 'open';
        row.appendChild(badge);
      }

      const count = document.createElement('span');
      count.className = 'netrow__count';
      count.textContent = `${net.pins.length}p`;
      row.appendChild(count);

      row.title = 'Double-click to rename • right-click for colour';
      row.addEventListener('mouseenter', () => this.store.setUI({ hoverNet: net.name }));
      row.addEventListener('mouseleave', () => {
        if (this.store.getUI().hoverNet === net.name) this.store.setUI({ hoverNet: null });
      });
      row.addEventListener('dblclick', () => this.renameNetPrompt(net));
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(
          [
            { label: 'Rename net…', action: () => this.renameNetPrompt(net) },
            { label: 'Change colour…', action: () => this.chooseNetColor(net) },
          ],
          e.clientX,
          e.clientY,
        );
      });
      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        this.chooseNetColor(net);
      });
      this.netEl.appendChild(row);
    }
  }

  renderParts(project, ui, analysis) {
    const placedIds = new Set(project.board.parts.map((p) => p.compId));
    const unplaced = project.schematic.components.filter(
      (c) => !placedIds.has(c.id) && !c.excluded,
    );
    this.unplacedEl.textContent = '';
    if (unplaced.length === 0) {
      this.unplacedEl.appendChild(empty('Everything is placed. Nice.'));
    }
    for (const comp of unplaced) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'trayrow';
      if (ui.pendingPart === comp.id) row.classList.add('is-active');
      const ref = document.createElement('span');
      ref.className = 'trayrow__ref';
      ref.textContent = comp.ref;
      const value = document.createElement('span');
      value.className = 'trayrow__value';
      value.textContent = comp.value;
      row.append(ref, value);
      row.addEventListener('click', () => {
        const next = ui.pendingPart === comp.id ? null : comp.id;
        this.store.setUI({ pendingPart: next, pendingSymbol: null, boardTool: 'select' });
      });
      this.unplacedEl.appendChild(row);
    }

    this.placedEl.textContent = '';
    if (project.board.parts.length === 0) {
      this.placedEl.appendChild(empty('No parts on the board yet.'));
    }
    const byId = new Map(project.schematic.components.map((c) => [c.id, c]));
    for (const placed of project.board.parts) {
      const comp = byId.get(placed.compId);
      if (!comp) continue;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'trayrow';
      if (ui.boardSelection.includes(comp.id)) row.classList.add('is-active');
      const ref = document.createElement('span');
      ref.className = 'trayrow__ref';
      ref.textContent = comp.ref;
      const meta = document.createElement('span');
      meta.className = 'trayrow__meta';
      meta.textContent = `r${placed.row + 1} c${placed.col + 1}${placed.locked ? ' • locked' : ''}`;
      row.append(ref, meta);
      row.addEventListener('click', () =>
        this.store.setUI({ boardSelection: [comp.id], pendingPart: null }),
      );
      this.placedEl.appendChild(row);
    }

    this.renderProperties(project, ui, byId);
    void analysis;
  }

  renderProperties(project, ui, byId) {
    this.propertiesEl.textContent = '';
    if (ui.boardSelection.length !== 1) return;
    const id = ui.boardSelection[0];
    const placed = project.board.parts.find((p) => p.compId === id);
    if (!placed) return;
    const comp = byId.get(id);
    if (!comp) return;

    const title = document.createElement('h3');
    title.className = 'sidebar__heading';
    title.textContent = 'Properties';
    this.propertiesEl.appendChild(title);

    const valueLabel = document.createElement('label');
    valueLabel.textContent = 'Value';
    const valueInput = document.createElement('input');
    valueInput.value = comp.value;
    valueInput.addEventListener('change', () => {
      const value = valueInput.value;
      this.store.apply('Edit value', (draft) => {
        const c = draft.schematic.components.find((x) => x.id === id);
        if (c) c.value = value;
      });
    });
    valueLabel.appendChild(valueInput);
    this.propertiesEl.appendChild(valueLabel);

    const pkgLabel = document.createElement('label');
    pkgLabel.textContent = 'Package';
    const pkgSelect = document.createElement('select');
    for (const [key, pkg] of Object.entries(PACKAGES)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = pkg.label;
      pkgSelect.appendChild(opt);
    }
    pkgSelect.value = placed.packageId;
    pkgSelect.addEventListener('change', () => {
      const packageId = pkgSelect.value;
      this.store.apply('Change package', (draft) => {
        const p = draft.board.parts.find((x) => x.compId === id);
        if (p) p.packageId = packageId;
      });
    });
    pkgLabel.appendChild(pkgSelect);
    this.propertiesEl.appendChild(pkgLabel);

    if (isFlexible(comp.symbolId)) {
      const horizontal = placed.rot % 180 === 0;
      const anchor = horizontal ? placed.col : placed.row;
      const extent = horizontal ? project.board.cols : project.board.rows;
      const maxSpan = Math.max(2, 2 * Math.floor(Math.min(anchor, extent - 1 - anchor)));
      const spanLabel = document.createElement('label');
      spanLabel.textContent = 'Lead span (holes)';
      const spanInput = document.createElement('input');
      spanInput.type = 'number';
      spanInput.min = '2';
      spanInput.max = String(maxSpan);
      spanInput.step = '2';
      spanInput.value = String(Math.max(2, Math.round(placed.leadsSpan || DEFAULT_LEAD_SPAN)));
      spanInput.addEventListener('change', () => {
        let leadsSpan = Math.round(Number(spanInput.value));
        if (!Number.isFinite(leadsSpan)) leadsSpan = DEFAULT_LEAD_SPAN;
        leadsSpan = Math.max(2, Math.min(maxSpan, leadsSpan));
        if (leadsSpan % 2 !== 0) leadsSpan += 1;
        spanInput.value = String(leadsSpan);
        this.store.apply('Flexible lead span', (draft) => {
          const p = draft.board.parts.find((x) => x.compId === id);
          if (p) p.leadsSpan = leadsSpan;
        });
      });
      spanLabel.appendChild(spanInput);
      this.propertiesEl.appendChild(spanLabel);
    }

    const offLabel = document.createElement('label');
    offLabel.className = 'field field--inline';
    const offInput = document.createElement('input');
    offInput.type = 'checkbox';
    offInput.checked = Boolean(comp.offBoard);
    offInput.addEventListener('change', () => {
      const offBoard = offInput.checked;
      this.store.apply('Toggle off-board', (draft) => {
        const c = draft.schematic.components.find((x) => x.id === id);
        if (c) c.offBoard = offBoard;
      });
    });
    offLabel.append(offInput, 'Off-board (pads only)');
    this.propertiesEl.appendChild(offLabel);

    const actions = document.createElement('div');
    actions.className = 'properties__actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn';
    editBtn.textContent = 'Edit footprint';
    editBtn.addEventListener('click', () => this.onEditSymbol(id));
    actions.appendChild(editBtn);

    const rotateBtn = document.createElement('button');
    rotateBtn.className = 'btn';
    rotateBtn.textContent = 'Rotate';
    rotateBtn.addEventListener('click', () =>
      this.store.apply('Rotate part', (draft) => rotatePlaced(draft, id)),
    );
    actions.appendChild(rotateBtn);

    const lockBtn = document.createElement('button');
    lockBtn.className = 'btn';
    lockBtn.textContent = placed.locked ? 'Unlock' : 'Lock';
    lockBtn.addEventListener('click', () => {
      this.store.apply('Lock part', (draft) => {
        const p = draft.board.parts.find((x) => x.compId === id);
        if (p) p.locked = !p.locked;
      });
    });
    actions.appendChild(lockBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn--danger';
    removeBtn.textContent = 'Unplace';
    removeBtn.addEventListener('click', () => {
      this.store.apply('Unplace part', (draft) => unplacePart(draft, id));
      this.store.setUI({ boardSelection: [] });
    });
    actions.appendChild(removeBtn);

    this.propertiesEl.appendChild(actions);
  }

  renderIssues(analysis, nets) {
    this.issuesEl.textContent = '';
    const issueCount = analysis.issues.length;
    const header = document.createElement('h3');
    header.className = 'sidebar__heading';
    header.textContent = issueCount === 0 ? 'All clear' : `${issueCount} issue${issueCount > 1 ? 's' : ''}`;
    this.issuesEl.appendChild(header);

    if (issueCount === 0) {
      const ok = document.createElement('div');
      ok.className = 'issuerow';
      ok.dataset.kind = 'ok';
      ok.textContent = 'Every net is connected and no strips short together.';
      this.issuesEl.appendChild(ok);
      return;
    }

    for (const issue of analysis.issues) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'issuerow';
      row.dataset.kind = issue.severity === 'warn' ? 'warn' : 'error';

      const text = document.createElement('span');
      text.className = 'issuerow__text';
      text.textContent = issue.message;
      row.appendChild(text);

      row.addEventListener('click', () => {
        const refs = issue.refs ?? {};
        if (issue.kind === 'short' && refs.segId) {
          this.store.setUI({ hoverNet: [...refs.nets][0] ?? null });
        } else if (refs.net) {
          this.store.setUI({ hoverNet: refs.net });
        } else if (refs.wireId) {
          this.store.setUI({ boardSelection: [refs.wireId] });
        } else if (refs.compId) {
          this.store.setUI({ boardSelection: [refs.compId] });
        }
      });
      this.issuesEl.appendChild(row);
    }

    if (nets.nameConflicts.length > 0) {
      for (const conflict of nets.nameConflicts) {
        const row = document.createElement('div');
        row.className = 'issuerow';
        row.dataset.kind = 'warn';
        row.textContent = `Two names on one net: ${conflict.names.join(', ')}`;
        this.issuesEl.appendChild(row);
      }
    }
  }

  /** @param {import('../core/types.js').Net} net */
  renameNetPrompt(net) {
    if (!this.lastNets) return;
    const next = globalThis.prompt?.('Net name', net.name)?.trim();
    if (!next || next === net.name) return;
    if (this.lastNets.nets.some((n) => n.name === next)) {
      this.toast(`Net "${next}" already exists`, 'error');
      return;
    }
    const aliases = this.lastNets.nameConflicts
      .filter((c) => c.net === net.name)
      .flatMap((c) => c.names);
    this.store.apply('Rename net', (draft) => renameNet(draft.schematic, net, next, aliases));
  }

  /** @param {import('../core/types.js').Net} net */
  chooseNetColor(net) {
    this.pendingNetColor = net.name;
    this.colorInput.value = /^#[0-9a-f]{6}$/i.test(net.color) ? net.color : '#2563eb';
    this.colorInput.click();
  }

  /** @param {ReturnType<import('../schematic/netlist.js').computeNets>} nets */
  netColor(nets, name) {
    return nets.nets.find((n) => n.name === name)?.color ?? 'var(--color-copper)';
  }
}

function empty(text) {
  const div = document.createElement('div');
  div.className = 'empty';
  div.textContent = text;
  return div;
}

/** @param {string} id */
function iconSvg(id) {
  const wrap = (inner) =>
    `<svg viewBox="-4 -4 8 8" fill="none" stroke="currentColor" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  switch (id) {
    case 'resistor':
      return wrap('<path d="M-3 0h1l.4-.7.6 1.4.6-1.4.6 1.4.6-1.4.4.7h1"/>');
    case 'capacitor':
      return wrap('<path d="M-3 0h2.4M.6 0H3M-.6-1.3v2.6M.6-1.3v2.6"/>');
    case 'cap_pol':
      return wrap('<path d="M-3 0h2.4M.6 0H3M-.6-1.3v2.6M.6-1.3v2.6M-2.3-1.9h1M-1.8-2.4v1"/>');
    case 'diode':
      return wrap('<path d="M-3 0h2M1 0h2M-1-.9 1 0-1 .9ZM1-.9V.9"/>');
    case 'led':
      return wrap('<path d="M-3 0h2M1 0h2M-1-.9 1 0-1 .9ZM1-.9V.9M.4-1.2.9-1.8M.9-1.1l.5-.6"/>');
    case 'npn':
    case 'pnp':
      return wrap('<circle r="2.1"/><path d="M-3 0h2.2M-1-.8v1.6M-1-.3.5-1.4 1-2.3M-1 .3.5 1.4 1 2.3"/>');
    case 'opamp':
      return wrap(
        '<path d="M-1.4-2.8v1.6L1.6-2ZM-3-2h1.4M1.6-2H3M-1.4 1.2v1.6L1.6 2ZM-3 2h1.4M1.6 2H3M0-4v1.4M0 4v-1.4"/>',
      );
    case 'ic8':
    case 'ic14':
    case 'ic16':
      return wrap(
        '<rect x="-2" y="-2.4" width="4" height="4.8" rx=".3"/><path d="M-3-1.2h1M-3 0h1M-3 1.2h1M2-1.2h1M2 0h1M2 1.2h1"/>',
      );
    case 'conn2':
    case 'conn3':
      return wrap('<circle cx="-1.2" cy="0" r=".5"/><circle cx="1.2" cy="0" r=".5"/><path d="M-1.2 1h2.4"/>');
    case 'switch':
      return wrap('<path d="M-3 0h1.6M1.4 0H3M-.9 0 1-1.1"/><circle cx="-.9" r=".25"/><circle cx="1.1" r=".25"/>');
    case 'pot':
      return wrap('<rect x="-2" y="-.6" width="4" height="1.2" rx=".3"/><path d="M0-3v1.5M-.6-1.5 0-1l.6-.5"/>');
    case 'inductor':
      return wrap('<path d="M-3 0h.9"/><path d="M-1.9 0a.35.35 0 01.35-.35.35.35 0 01.35.35.35.35 0 01.35.35.35.35 0 01.35.35.35.35 0 01.35.35.35.35 0 01.35.35.35.35 0 01.35.35"/><path d="M1.25 0h1.75"/>');
    case 'flag-gnd':
      return wrap('<path d="M0-2v2M-1.4 0h2.8M-1 .6h2M-.5 1.2h1"/>');
    case 'flag-pwr':
      return wrap('<path d="M0-2v3M-1.2-1 0-2l1.2 1"/>');
    case 'net-label':
      return wrap('<path d="M-2.5-1h3.4l1.6 1-1.6 1h-3.4z"/><path d="M-1.6 0h1.6"/>');
    default:
      return wrap('<rect x="-2" y="-1.3" width="4" height="2.6" rx=".4"/>');
  }
}
