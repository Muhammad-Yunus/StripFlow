/**
 * Central typedefs. No runtime behaviour.
 *
 * @typedef {{x:number,y:number}} Point
 * @typedef {0|90|180|270} Rotation
 * @typedef {'select'|'wire'|'cut'} ToolId
 * @typedef {'light'|'dark'} Theme
 *
 * @typedef {Object} PinDef
 * @property {string} id
 * @property {string} name
 * @property {Point} offset
 * @property {string} [type]
 *
 * @typedef {Object} SymbolDef
 * @property {string} id
 * @property {string} label
 * @property {string} refPrefix
 * @property {string} defaultValue
 * @property {number} width
 * @property {number} height
 * @property {PinDef[]} pins
 * @property {string} [packageId]
 * @property {boolean} [custom]
 *
 * @typedef {Object} Pin
 * @property {string} id
 * @property {string} name
 * @property {Point} offset
 * @property {string} type
 *
 * @typedef {Object} SComponent
 * @property {string} id
 * @property {string} ref
 * @property {string} symbolId
 * @property {Point} pos
 * @property {Rotation} rot
 * @property {boolean} mirror
 * @property {string} value
 * @property {Pin[]} pins
 * @property {boolean} excluded
 * @property {boolean} offBoard
 * @property {Record<string, unknown>} attrs
 * @property {{x:number,y:number}} [labelPos]
 *
 * @typedef {Object} Wire
 * @property {string} id
 * @property {Point[]} points
 *
 * @typedef {Object} Flag
 * @property {string} id
 * @property {'gnd'|'pwr'} kind
 * @property {string} name
 * @property {Point} pos
 * @property {number} rot
 *
 * @typedef {Object} NetLabel
 * @property {string} id
 * @property {string} name
 * @property {Point} pos
 * @property {number} rot
 *
 * @typedef {Object} Net
 * @property {string} id
 * @property {string} name
 * @property {string} color
 * @property {{compId:string,pinId:string}[]} pins
 *
   * @typedef {Object} Schematic
   * @property {SComponent[]} components
   * @property {Wire[]} wires
   * @property {Flag[]} flags
   * @property {NetLabel[]} labels
   * @property {Record<string, {color?:string}>} [netStyles]
 *
 * @typedef {Object} PinHole
 * @property {string} pinId
 * @property {number} row
 * @property {number} col
 *
 * @typedef {Object} PlacedPart
 * @property {string} compId
 * @property {number} row
 * @property {number} col
 * @property {Rotation} rot
 * @property {number} leadsSpan
 * @property {boolean} flat
 * @property {boolean} locked
 * @property {string} packageId
 * @property {{row:number,col:number}} [labelOffset]
 *
 * @typedef {Object} Cut
 * @property {string} id
 * @property {'drill'|'knife'} type
 * @property {number} row
 * @property {number} col
 *
 * @typedef {Object} LinkWire
 * @property {string} id
 * @property {{row:number,col:number}} a
 * @property {{row:number,col:number}} b
 *
 * @typedef {Object} BoardOptions
 * @property {boolean} drilledCutsOnly
 * @property {boolean} noStackedWires
 * @property {number} clearance
 *
 * @typedef {Object} Board
 * @property {number} rows
 * @property {number} cols
 * @property {PlacedPart[]} parts
 * @property {Cut[]} cuts
 * @property {LinkWire[]} wires
 * @property {BoardOptions} options
 *
 * @typedef {Object} ProjectMeta
 * @property {number} createdAt
 * @property {number} modifiedAt
 * @property {string} seed
 *
 * @typedef {Object} Project
 * @property {string} schemaVersion
 * @property {string} id
 * @property {string} name
 * @property {Schematic} schematic
 * @property {Board} board
 * @property {SymbolDef[]} customSymbols
 * @property {ProjectMeta} meta
 *
 * @typedef {Object} UIState
 * @property {'select'|'wire'} schematicTool
 * @property {ToolId} boardTool
 * @property {string[]} schematicSelection
 * @property {string[]} boardSelection
 * @property {string|null} pendingSymbol
 * @property {string|null} pendingPart
 * @property {string|null} hoverNet
 * @property {'light'|'dark'} theme
 * @property {'library'|'nets'|'parts'|'conflicts'} sidebarTab
 * @property {{pan:Point,zoom:number}} schematicView
 * @property {{pan:Point,zoom:number}} boardView
 * @property {string|null} message
 */

export {};
