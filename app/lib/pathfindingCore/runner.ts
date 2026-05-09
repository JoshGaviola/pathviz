import type { RoadGraph } from "../roadGraph";
import { stepBidirectional, stepSingleDirection } from "./steps";
import type {
  PathfindingAlgorithmType,
  SearchSnapshot,
  SearchState,
} from "./types";
import {
  getEdgeKey,
  getHeuristic,
  getSnapshot,
} from "./utils";

export class PathfindingRunner {
  private state: SearchState;

  constructor(
    graph: RoadGraph,
    startNodeId: string,
    endNodeId: string,
    algorithm: PathfindingAlgorithmType
  ) {
    const edgeDistances = new Map<string, number>();
    for (const edge of graph.edges) {
      edgeDistances.set(getEdgeKey(edge.from, edge.to), edge.distanceMeters);
    }

    const heuristic = new Map<string, number>();
    for (const nodeId of Object.keys(graph.nodes)) {
      heuristic.set(nodeId, getHeuristic(graph, nodeId, endNodeId));
    }

    this.state = {
      graph,
      startId: startNodeId,
      endId: endNodeId,
      algorithm,
      edgeDistances,
      distFromStart: new Map([[startNodeId, 0]]),
      parent: new Map([[startNodeId, null]]),
      visited: new Set(),
      open: new Set([startNodeId]),
      heuristic,
      openStart: new Set([startNodeId]),
      openEnd: new Set([endNodeId]),
      closedStart: new Set(),
      closedEnd: new Set(),
      parentStart: new Map([[startNodeId, null]]),
      parentEnd: new Map([[endNodeId, null]]),
      finished: false,
      foundPath: false,
      meetingNodeId: null,
    };
  }

  getSnapshot(): SearchSnapshot {
    return getSnapshot(this.state);
  }

  nextStep(): SearchSnapshot {
    if (this.state.finished) {
      return getSnapshot(this.state);
    }

    if (this.state.algorithm === "bidirectional") {
      stepBidirectional(this.state);
    } else {
      stepSingleDirection(this.state);
    }

    return getSnapshot(this.state);
  }
}
