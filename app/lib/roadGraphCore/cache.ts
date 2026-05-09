import { buildRoadGraphFromOverpass } from "./build";
import { fetchOverpassData } from "./overpass";
import type { OverpassResponse, RoadGraph } from "./types";

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 16;
const DEFAULT_PRECISION = 6;

interface CacheEntry {
  key: string;
  graph: RoadGraph;
  timestamp: number;
}

const roadGraphCache = new Map<string, CacheEntry>();

function normalizeBoundsKey(
  bounds: [{ latitude: number; longitude: number }, { latitude: number; longitude: number }],
  zoom: number
): string {
  const round = (value: number) => Math.round(value * 20) / 20;
  return [
    zoom,
    round(bounds[0].longitude),
    round(bounds[0].latitude),
    round(bounds[1].longitude),
    round(bounds[1].latitude),
  ].join(",");
}

function getCachedGraph(cacheKey: string): RoadGraph | null {
  const entry = roadGraphCache.get(cacheKey);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    roadGraphCache.delete(cacheKey);
    return null;
  }

  return entry.graph;
}

function storeCachedGraph(cacheKey: string, graph: RoadGraph): void {
  roadGraphCache.set(cacheKey, {
    key: cacheKey,
    graph,
    timestamp: Date.now(),
  });

  if (roadGraphCache.size <= MAX_CACHE_ENTRIES) {
    return;
  }

  const oldestKey = [...roadGraphCache.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .at(0)?.key;

  if (oldestKey) {
    roadGraphCache.delete(oldestKey);
  }
}

export async function fetchRoadGraphForBounds(
  bounds: [{ latitude: number; longitude: number }, { latitude: number; longitude: number }],
  options?: { signal?: AbortSignal; precision?: number; zoom?: number }
): Promise<RoadGraph> {
  const precision = options?.precision ?? DEFAULT_PRECISION;
  const zoom = options?.zoom ?? 0;
  const cacheKey = normalizeBoundsKey(bounds, Math.floor(zoom));
  const cachedGraph = getCachedGraph(cacheKey);

  if (cachedGraph) {
    return cachedGraph;
  }

  const response = await fetchOverpassData(bounds, options?.signal);
  const payload = (await response.json()) as OverpassResponse;
  const graph = buildRoadGraphFromOverpass(payload, precision);

  storeCachedGraph(cacheKey, graph);
  return graph;
}
