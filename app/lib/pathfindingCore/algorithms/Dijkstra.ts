import { PathfindingAlgorithm } from "./PathfindingAlgorithm";
import { getNeighborDistance, pickLowest } from "../utils";

/**
 * Dijkstra's algorithm
 * Guarantees shortest path using only distance from start
 */
export class Dijkstra extends PathfindingAlgorithm {
  protected getAlgorithmType() {
    return "dijkstra" as const;
  }

  protected init(): void {
    // Dijkstra starts with startNode in open set
    this.state.open = new Set([this.state.startId]);
  }

  nextStep(): void {
    if (this.state.open.size === 0) {
      this.state.finished = true;
      this.state.foundPath = false;
      return;
    }

    const currentId = pickLowest(this.state.open, (nodeId) => {
      return this.state.distFromStart.get(nodeId) ?? Number.POSITIVE_INFINITY;
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

    const currentDistance = this.state.distFromStart.get(currentId) ?? Number.POSITIVE_INFINITY;
    const neighbors = this.state.graph.nodes[currentId]?.neighborIds ?? [];

    for (const neighborId of neighbors) {
      if (this.state.visited.has(neighborId)) {
        continue;
      }

      const edgeDistance = getNeighborDistance(
        this.state.edgeDistances,
        currentId,
        neighborId
      );
      const nextDistance = currentDistance + edgeDistance;
      const previousDistance = this.state.distFromStart.get(neighborId);

      if (previousDistance === undefined || nextDistance < previousDistance) {
        this.state.distFromStart.set(neighborId, nextDistance);
        this.state.parent.set(neighborId, currentId);
        this.state.open.add(neighborId);
      }
    }
  }
}
