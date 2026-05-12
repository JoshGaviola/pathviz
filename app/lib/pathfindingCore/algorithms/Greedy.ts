import { PathfindingAlgorithm } from "./PathfindingAlgorithm";
import { pickLowest } from "../utils";

/**
 * Greedy Best-First Search algorithm
 * Uses only heuristic, not guaranteed to find shortest path
 */
export class Greedy extends PathfindingAlgorithm {
  protected getAlgorithmType() {
    return "greedy" as const;
  }

  protected init(): void {
    // Greedy starts with startNode in open set
    this.state.open = new Set([this.state.startId]);
  }

  nextStep(): void {
    if (this.state.open.size === 0) {
      this.state.finished = true;
      this.state.foundPath = false;
      return;
    }

    const currentId = pickLowest(this.state.open, (nodeId) => {
      return this.state.heuristic.get(nodeId) ?? Number.POSITIVE_INFINITY;
    });

    if (!currentId) {
      this.state.finished = true;
      this.state.foundPath = false;
      return;
    }

    this.state.open.delete(currentId);
    this.state.visited.add(currentId);

    if (currentId === this.state.endId) {
      this.state.finished = true;
      this.state.foundPath = true;
      return;
    }

    const neighbors = this.state.graph.nodes[currentId]?.neighborIds ?? [];

    for (const neighborId of neighbors) {
      if (this.state.visited.has(neighborId)) {
        continue;
      }

      if (!this.state.open.has(neighborId)) {
        this.state.open.add(neighborId);
      }

      this.state.parent.set(neighborId, currentId);
    }
  }
}
