import { PathfindingAlgorithm } from "./PathfindingAlgorithm";
import { getHeuristic, pickLowest } from "../utils";

/**
 * Bidirectional Search algorithm
 * Searches from both start and end simultaneously
 */
export class BidirectionalSearch extends PathfindingAlgorithm {
  protected getAlgorithmType() {
    return "bidirectional" as const;
  }

  protected init(): void {
    // Initialize bidirectional state
    this.state.openStart = new Set([this.state.startId]);
    this.state.openEnd = new Set([this.state.endId]);
    this.state.parentStart = new Map([[this.state.startId, null]]);
    this.state.parentEnd = new Map([[this.state.endId, null]]);
  }

  nextStep(): void {
    if (this.state.openStart.size === 0 || this.state.openEnd.size === 0) {
      this.state.finished = true;
      this.state.foundPath = false;
      return;
    }

    // Expand from start side
    const currentStartId = this.getNextFromOpenSet(this.state.openStart);
    if (currentStartId) {
      this.expandBidirectional(
        currentStartId,
        this.state.openStart,
        this.state.closedStart,
        this.state.closedEnd,
        this.state.parentStart
      );

      if (this.state.finished) {
        return;
      }
    }

    // Expand from end side
    const currentEndId = this.getNextFromOpenSet(this.state.openEnd);
    if (currentEndId) {
      this.expandBidirectional(
        currentEndId,
        this.state.openEnd,
        this.state.closedEnd,
        this.state.closedStart,
        this.state.parentEnd
      );
    }
  }

  private getNextFromOpenSet(openSet: Set<string>): string | null {
    return pickLowest(openSet, (nodeId) => {
      // Use heuristic for picking next node in bidirectional search
      const fromStart = this.state.closedStart.has(nodeId) || this.state.openStart.has(nodeId);
      const goalId = fromStart ? this.state.endId : this.state.startId;
      return getHeuristic(this.state.graph, nodeId, goalId);
    });
  }

  private expandBidirectional(
    currentId: string,
    openSet: Set<string>,
    closedSet: Set<string>,
    otherClosedSet: Set<string>,
    parentMap: Map<string, string | null>
  ): void {
    openSet.delete(currentId);
    closedSet.add(currentId);

    // Check if we've met from the other side
    if (otherClosedSet.has(currentId)) {
      this.state.meetingNodeId = currentId;
      this.state.finished = true;
      this.state.foundPath = true;
      return;
    }

    const neighbors = this.state.graph.nodes[currentId]?.neighborIds ?? [];
    for (const neighborId of neighbors) {
      if (closedSet.has(neighborId)) {
        continue;
      }

      if (!parentMap.has(neighborId)) {
        parentMap.set(neighborId, currentId);
      }

      openSet.add(neighborId);

      // Check if we've met from the other side
      if (otherClosedSet.has(neighborId)) {
        this.state.meetingNodeId = neighborId;
        this.state.finished = true;
        this.state.foundPath = true;
        return;
      }
    }
  }
}
