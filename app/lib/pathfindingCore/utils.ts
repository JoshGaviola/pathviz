import type { RoadGraph } from "../roadGraph";
import type { SearchSnapshot, SearchState } from "./types";
import { getDistanceMeters } from "../roadGraphCore/geometry";

export function getEdgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function getHeuristic(graph: RoadGraph, fromId: string, toId: string): number {
  const from = graph.nodes[fromId];
  const to = graph.nodes[toId];

  if (!from || !to) {
    return Number.POSITIVE_INFINITY;
  }

  // Use haversine distance in meters (same units as edge distances)
  return getDistanceMeters([from.lng, from.lat], [to.lng, to.lat]);
}

export function getNeighborDistance(
  edgeDistances: Map<string, number>,
  fromId: string,
  toId: string
): number {
  return edgeDistances.get(getEdgeKey(fromId, toId)) ?? Number.POSITIVE_INFINITY;
}

export function pickLowest(openSet: Set<string>, score: (nodeId: string) => number): string | null {
  let minNodeId: string | null = null;
  let minScore = Number.POSITIVE_INFINITY;

  for (const nodeId of openSet) {
    const nodeScore = score(nodeId);
    if (nodeScore < minScore) {
      minScore = nodeScore;
      minNodeId = nodeId;
    }
  }

  return minNodeId;
}

export function buildPathFromParents(
  parents: Map<string, string | null>,
  startId: string,
  endId: string
): string[] {
  const path: string[] = [];
  let currentId: string | null = endId;

  while (currentId) {
    path.push(currentId);
    if (currentId === startId) {
      return path.reverse();
    }

    currentId = parents.get(currentId) ?? null;
  }

  return [];
}

export function buildBidirectionalPath(state: SearchState): string[] {
  if (!state.meetingNodeId) {
    return [];
  }

  const startHalf = buildPathFromParents(state.parentStart, state.startId, state.meetingNodeId);
  if (startHalf.length === 0) {
    return [];
  }

  const endHalf: string[] = [];
  let currentId: string | null = state.parentEnd.get(state.meetingNodeId) ?? null;
  while (currentId) {
    endHalf.push(currentId);
    if (currentId === state.endId) {
      break;
    }

    currentId = state.parentEnd.get(currentId) ?? null;
  }

  return [...startHalf, ...endHalf];
}

export function toPathEdgeKeys(pathNodeIds: string[]): string[] {
  const edgeKeys: string[] = [];

  for (let index = 0; index < pathNodeIds.length - 1; index += 1) {
    edgeKeys.push(getEdgeKey(pathNodeIds[index], pathNodeIds[index + 1]));
  }

  return edgeKeys;
}

export function getSnapshot(state: SearchState): SearchSnapshot {
  let pathNodeIds: string[] = [];

  if (state.finished && state.foundPath) {
    if (state.algorithm === "bidirectional") {
      pathNodeIds = buildBidirectionalPath(state);
    } else {
      pathNodeIds = buildPathFromParents(state.parent, state.startId, state.endId);
    }
  }

  let frontierNodeIds: string[] = [];
  let visitedNodeIds: string[] = [];

  if (state.algorithm === "bidirectional") {
    frontierNodeIds = [...state.openStart, ...state.openEnd];
    visitedNodeIds = [...state.closedStart, ...state.closedEnd];
  } else {
    frontierNodeIds = [...state.open];
    visitedNodeIds = [...state.visited];
  }

  return {
    frontierNodeIds,
    visitedNodeIds,
    pathNodeIds,
    pathEdgeKeys: toPathEdgeKeys(pathNodeIds),
    finished: state.finished,
    foundPath: state.foundPath,
  };
}
