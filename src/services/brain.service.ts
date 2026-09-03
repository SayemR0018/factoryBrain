import { dataset } from "./dataset";
import type { BrainGraph, BrainEntityPublic } from "./types";

export const brainService = {
  getGraph(filters?: { kinds?: BrainEntityPublic["kind"][]; query?: string }): BrainGraph {
    const kindFilter = filters?.kinds?.length ? new Set(filters.kinds) : null;
    const q = filters?.query?.toLowerCase();
    const nodes = dataset.graph.nodes
      .filter((n) => (kindFilter ? kindFilter.has(n.kind) : true))
      .filter((n) =>
        q
          ? n.label.toLowerCase().includes(q) || (n.labelBn ?? "").toLowerCase().includes(q)
          : true
      );
    const ids = new Set(nodes.map((n) => n.id));
    const edges = dataset.graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    return { nodes, edges };
  },
  getEntity(id: string): BrainEntityPublic | undefined {
    return dataset.graph.nodes.find((n) => n.id === id);
  },
  getNeighbors(id: string): BrainEntityPublic[] {
    const edgeIds = dataset.graph.edges
      .filter((e) => e.source === id || e.target === id)
      .map((e) => (e.source === id ? e.target : e.source));
    return dataset.graph.nodes.filter((n) => edgeIds.includes(n.id));
  }
};