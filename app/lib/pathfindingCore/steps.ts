import type { RoadGraph } from "../roadGraph";
import type { SearchState } from "./types";
import {
  getHeuristic,
  getNeighborDistance,
  pickLowest,
} from "./utils";

function getBidirectionalBest(openSet: Set<string>, goalId: string, graph: RoadGraph): string | null {
  return pickLowest(openSet, (nodeId) => getHeuristic(graph, nodeId, goalId));
}

function expandBidirectional(
  currentId: string,
  openSet: Set<string>,
  closedSet: Set<string>,
  otherClosedSet: Set<string>,
  parentMap: Map<string, string | null>,
  state: SearchState
): void {
  openSet.delete(currentId);
  closedSet.add(currentId);

  if (otherClosedSet.has(currentId)) {
    state.meetingNodeId = currentId;
    state.finished = true;
    state.foundPath = true;
    return;
  }

  const neighbors = state.graph.nodes[currentId]?.neighborIds ?? [];
  for (const neighborId of neighbors) {
    if (closedSet.has(neighborId)) {
      continue;
    }

    if (!parentMap.has(neighborId)) {
      parentMap.set(neighborId, currentId);
    }

    openSet.add(neighborId);

    if (otherClosedSet.has(neighborId)) {
      state.meetingNodeId = neighborId;
      state.finished = true;
      state.foundPath = true;
      return;
    }
  }
}

export function stepSingleDirection(state: SearchState): void {
  if (state.open.size === 0) {
    state.finished = true;
    state.foundPath = false;
    return;
  }

  const currentId = pickLowest(state.open, (nodeId) => {
    if (state.algorithm === "dijkstra") {
      return state.distFromStart.get(nodeId) ?? Number.POSITIVE_INFINITY;
    }

    if (state.algorithm === "greedy") {
      return state.heuristic.get(nodeId) ?? Number.POSITIVE_INFINITY;
    }

    const distance = state.distFromStart.get(nodeId) ?? Number.POSITIVE_INFINITY;
    const heuristic = state.heuristic.get(nodeId) ?? Number.POSITIVE_INFINITY;
    return distance + heuristic;
  });

  if (!currentId) {
    state.finished = true;
    state.foundPath = false;
    return;
  }

  state.open.delete(currentId);
  state.visited.add(currentId);

  if (currentId === state.endId) {
    state.finished = true;
    state.foundPath = true;
    return;
  }

  const currentDistance = state.distFromStart.get(currentId) ?? Number.POSITIVE_INFINITY;
  const neighbors = state.graph.nodes[currentId]?.neighborIds ?? [];

  for (const neighborId of neighbors) {
    if (state.visited.has(neighborId)) {
      continue;
    }

    const edgeDistance = getNeighborDistance(state.edgeDistances, currentId, neighborId);
    const nextDistance = currentDistance + edgeDistance;
    const previousDistance = state.distFromStart.get(neighborId);

    if (state.algorithm === "greedy") {
      if (!state.open.has(neighborId)) {
        state.open.add(neighborId);
      }

      state.parent.set(neighborId, currentId);
      continue;
    }

    if (previousDistance === undefined || nextDistance < previousDistance) {
      state.distFromStart.set(neighborId, nextDistance);
      state.parent.set(neighborId, currentId);
      state.open.add(neighborId);
    }
  }
}

export function stepBidirectional(state: SearchState): void {
  if (state.openStart.size === 0 || state.openEnd.size === 0) {
    state.finished = true;
    state.foundPath = false;
    return;
  }

  const currentStartId = getBidirectionalBest(state.openStart, state.endId, state.graph);
  if (currentStartId) {
    expandBidirectional(
      currentStartId,
      state.openStart,
      state.closedStart,
      state.closedEnd,
      state.parentStart,
      state
    );
  }

  if (state.finished) {
    return;
  }

  const currentEndId = getBidirectionalBest(state.openEnd, state.startId, state.graph);
  if (currentEndId) {
    expandBidirectional(
      currentEndId,
      state.openEnd,
      state.closedEnd,
      state.closedStart,
      state.parentEnd,
      state
    );
  }
}
