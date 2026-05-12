import type { RoadGraph } from "../../roadGraph";
import type { SearchState } from "../types";

/**
 * Base class for all pathfinding algorithms
 */
export abstract class PathfindingAlgorithm {
  protected state: SearchState;

  constructor(
    graph: RoadGraph,
    startNodeId: string,
    endNodeId: string,
    edgeDistances: Map<string, number>,
    heuristic: Map<string, number>
  ) {
    this.state = {
      graph,
      startId: startNodeId,
      endId: endNodeId,
      algorithm: this.getAlgorithmType(),
      edgeDistances,
      distFromStart: new Map([[startNodeId, 0]]),
      parent: new Map([[startNodeId, null]]),
      visited: new Set(),
      open: new Set([startNodeId]),
      heuristic,
      openStart: new Set(),
      openEnd: new Set(),
      closedStart: new Set(),
      closedEnd: new Set(),
      parentStart: new Map(),
      parentEnd: new Map(),
      finished: false,
      foundPath: false,
      meetingNodeId: null,
    };

    this.init();
  }

  protected abstract getAlgorithmType(): "astar" | "dijkstra" | "greedy" | "bidirectional";

  /**
   * Initialize algorithm-specific state
   */
  protected abstract init(): void;

  /**
   * Perform one step of the algorithm
   */
  abstract nextStep(): void;

  /**
   * Get the current search state
   */
  getState(): SearchState {
    return this.state;
  }
}
