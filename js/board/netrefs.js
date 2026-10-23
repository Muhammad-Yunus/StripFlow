/**
 * Thin adapter between schematic nets and board consumers.
 * Kept separate so board modules do not depend on the netlist implementation.
 * @param {import('../core/types.js').Project} project
 * @param {import('../schematic/netlist.js').computeNets extends (s:any)=>infer R ? R : never} netResult
 */
export function computeNetRefs(project, netResult) {
  void project;
  return {
    pinNets: netResult.pinNet,
    wireNets: netResult.wireNet,
    nets: netResult.nets,
  };
}
