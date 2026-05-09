import type { RoadGraph } from "../roadGraph";

export type PathfindingAlgorithmType = "astar" | "dijkstra" | "greedy" | "bidirectional";

export interface SearchSnapshot {
  visitedNodeIds: string[];
  frontierNodeIds: string[];
  pathNodeIds: string[];
  pathEdgeKeys: string[];
  finished: boolean;
  foundPath: boolean;
}

export interface SearchState {
  graph: RoadGraph;
  startId: string;
  endId: string;
  algorithm: PathfindingAlgorithmType;
  edgeDistances: Map<string, number>;
  distFromStart: Map<string, number>;
  parent: Map<string, string | null>;
  visited: Set<string>;
  open: Set<string>;
  heuristic: Map<string, number>;
  openStart: Set<string>;
  openEnd: Set<string>;
  closedStart: Set<string>;
  closedEnd: Set<string>;
  parentStart: Map<string, string | null>;
  parentEnd: Map<string, string | null>;
  finished: boolean;
  foundPath: boolean;
  meetingNodeId: string | null;
}
