/**
 * @typedef {Object} LayoutOptions
 * @property {'fast'|'normal'|'high'} effort
 * @property {boolean} lockRows
 * @property {boolean} lockCols
 * @property {boolean} drilledOnly
 * @property {boolean} [newLayout]
 * @property {number} [extraRoom]
 * @property {boolean} [noStackedWires]
 * @property {boolean} [standingParts]
 * @property {number} [threads]
 * @property {number} [targetRows]
 * @property {number} [targetCols]
 */

/**
 * @typedef {Object} RotGeometry
 * @property {number} rot
 * @property {number} w
 * @property {number} h
 * @property {number} minRow
 * @property {number} minCol
 * @property {{pinId:string,dr:number,dc:number,net:string|null}[]} pins
 */

/**
 * @typedef {Object} ModelComponent
 * @property {string} compId
 * @property {string} ref
 * @property {RotGeometry[]} rotOptions
 * @property {boolean} flexible
 * @property {string} packageId
 * @property {boolean} locked
 * @property {import('../core/types.js').PlacedPart|null} existing
 */

/**
 * @typedef {Object} LayoutModel
 * @property {Map<string, ModelComponent>} components
 * @property {string[]} netNames
 * @property {Map<string,string>} pinNet
 * @property {Map<string, import('../core/types.js').SComponent>} byId
 */

/**
 * @typedef {Object} LayoutState
 * @property {string[]} orderA
 * @property {string[]} orderB
 * @property {Record<string, number>} rot
 */

/**
 * @typedef {Object} LayoutMetrics
 * @property {number} area
 * @property {number} rows
 * @property {number} cols
 * @property {number} cuts
 * @property {number} links
 * @property {number} wireLength
 * @property {number} groups
 * @property {number} overlaps
 * @property {number} lockedOverlap
 * @property {number} pinCollision
 * @property {number} invalidDrills
 * @property {number} outOfBounds
 * @property {number} wireOverPin
 * @property {number} wireStack
 * @property {number|null} targetRows
 * @property {number|null} targetCols
 * @property {number} freeCount
 */

/**
 * @typedef {Object} Candidate
 * @property {number} rows
 * @property {number} cols
 * @property {number} neededRows
 * @property {number} neededCols
 * @property {import('../core/types.js').PlacedPart[]} parts
 * @property {import('../core/types.js').Cut[]} cuts
 * @property {import('../core/types.js').LinkWire[]} wires
 * @property {{compId:string,pinId:string,row:number,col:number,net:string|null}[]} pins
 * @property {LayoutMetrics} metrics
 * @property {number} score
 */
