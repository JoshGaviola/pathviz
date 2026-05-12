import { PathfindingAlgorithm } from "./PathfindingAlgorithm";
import { getNeighborDistance, pickLowest } from "../utils";

/**
 * A* pathfinding algorithm
 * Combines heuristic with distance from start for optimal pathfinding
 */
export class AStar extends PathfindingAlgorithm {
  protected getAlgorithmType() {
    return "astar" as const;
  }

  protected init(): void {
    // Initialize A* specific state if needed
    this.state.open = new Set([this.state.startId]);
  }

  nextStep(): void {
    if (this.state.open.size === 0) {
      this.state.finished = true;
      this.state.foundPath = false;
      return;
    }

    const currentId = pickLowest(this.state.open, (nodeId) => {
      const distance = this.state.distFromStart.get(nodeId) ?? Number.POSITIVE_INFINITY;
      const heuristic = this.state.heuristic.get(nodeId) ?? Number.POSITIVE_INFINITY;
      return distance + heuristic;
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
