import type { RoadGraph } from "../roadGraph";
import type {
  PathfindingAlgorithmType,
  SearchSnapshot,
} from "./types";
import {
  getEdgeKey,
  getHeuristic,
  getSnapshot,
} from "./utils";
import {
  AStar,
  BidirectionalSearch,
  Dijkstra,
  Greedy,
  type PathfindingAlgorithm,
} from "./algorithms";

export class PathfindingRunner {
  private algorithm: PathfindingAlgorithm;

  constructor(
    graph: RoadGraph,
    startNodeId: string,
    endNodeId: string,
    algorithmType: PathfindingAlgorithmType
  ) {
    const edgeDistances = new Map<string, number>();
    for (const edge of graph.edges) {
      edgeDistances.set(getEdgeKey(edge.from, edge.to), edge.distanceMeters);
    }

    const heuristic = new Map<string, number>();
    for (const nodeId of Object.keys(graph.nodes)) {
      heuristic.set(nodeId, getHeuristic(graph, nodeId, endNodeId));
    }

    // Instantiate the appropriate algorithm
    switch (algorithmType) {
      case "astar":
        this.algorithm = new AStar(graph, startNodeId, endNodeId, edgeDistances, heuristic);
        break;
      case "dijkstra":
        this.algorithm = new Dijkstra(graph, startNodeId, endNodeId, edgeDistances, heuristic);
        break;
      case "greedy":
        this.algorithm = new Greedy(graph, startNodeId, endNodeId, edgeDistances, heuristic);
        break;
      case "bidirectional":
        this.algorithm = new BidirectionalSearch(graph, startNodeId, endNodeId, edgeDistances, heuristic);
        break;
      default:
        throw new Error(`Unknown algorithm: ${algorithmType}`);
    }
  }

  getSnapshot(): SearchSnapshot {
    return getSnapshot(this.algorithm.getState());
  }

  nextStep(): SearchSnapshot {
    const state = this.algorithm.getState();
    if (state.finished) {
      return getSnapshot(state);
    }

    this.algorithm.nextStep();
    return getSnapshot(this.algorithm.getState());
  }
}
