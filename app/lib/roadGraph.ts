type Coordinate = [number, number];

export interface RoadNode {
  id: string;
  lng: number;
  lat: number;
  neighborIds: string[];
}

export interface RoadEdge {
  from: string;
  to: string;
  distanceMeters: number;
}

export interface RoadGraph {
  nodes: Record<string, RoadNode>;
  edges: RoadEdge[];
}

export interface BoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface OverpassElementBase {
  id: number;
  type: "node" | "way";
}

interface OverpassNode extends OverpassElementBase {
  type: "node";
  lat: number;
  lon: number;
}

interface OverpassWay extends OverpassElementBase {
  type: "way";
  nodes: number[];
}

interface OverpassResponse {
  elements: Array<OverpassNode | OverpassWay>;
}

export class OverpassError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "OverpassError";
    this.status = status;
  }
}

const OVERPASS_API_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
];

const DEFAULT_PRECISION = 6;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 16;

interface CacheEntry {
  key: string;
  graph: RoadGraph;
  timestamp: number;
}

const roadGraphCache = new Map<string, CacheEntry>();

function roundCoordinate(value: number, precision: number): number {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function toNodeId(lng: number, lat: number, precision: number): string {
  return `${roundCoordinate(lng, precision)},${roundCoordinate(lat, precision)}`;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function getDistanceMeters(a: Coordinate, b: Coordinate): number {
  const earthRadiusMeters = 6_371_000;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);

  const haversine =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1Rad) * Math.cos(lat2Rad);

  const centralAngle = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return earthRadiusMeters * centralAngle;
}

function createOverpassRoadQuery(bounds: BoundingBox): string {
  return `
[out:json][timeout:25];
(
  way["highway"~"motorway|primary|secondary|tertiary"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
);
(._;>;);
out body;
`;
}

function normalizeBoundsKey(bounds: BoundingBox, zoom: number): string {
  const round = (value: number) => Math.round(value * 20) / 20;
  return [zoom, round(bounds.west), round(bounds.south), round(bounds.east), round(bounds.north)].join(",");
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

function storeCachedGraph(cacheKey: string, graph: RoadGraph) {
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
  bounds: BoundingBox,
  options?: { signal?: AbortSignal; precision?: number; zoom?: number }
): Promise<RoadGraph> {
  const precision = options?.precision ?? DEFAULT_PRECISION;
  const zoom = options?.zoom ?? 0;
  const cacheKey = normalizeBoundsKey(bounds, Math.floor(zoom));
  const cachedGraph = getCachedGraph(cacheKey);

  if (cachedGraph) {
    return cachedGraph;
  }

  const query = createOverpassRoadQuery(bounds);
  let lastError: unknown = null;

  for (const endpoint of OVERPASS_API_URLS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: query,
        signal: options?.signal,
      });

      if (!response.ok) {
        lastError = new OverpassError(
          response.status,
          `Overpass request failed with status ${response.status} from ${endpoint}`
        );

        if (response.status === 429) {
          throw lastError;
        }

        continue;
      }

      const payload = (await response.json()) as OverpassResponse;
      const graph = buildRoadGraphFromOverpass(payload, precision);
      storeCachedGraph(cacheKey, graph);
      return graph;
    } catch (error) {
      if (options?.signal?.aborted) {
        throw error;
      }

      lastError = error;
    }
  }

  if (lastError instanceof OverpassError) {
    throw lastError;
  }

  throw new Error("Unable to load road graph from any Overpass endpoint");
}

export function buildRoadGraphFromOverpass(
  payload: OverpassResponse,
  precision = DEFAULT_PRECISION
): RoadGraph {
  const nodesByOsmId = new Map<number, Coordinate>();
  const ways: OverpassWay[] = [];

  for (const element of payload.elements) {
    if (element.type === "node") {
      nodesByOsmId.set(element.id, [element.lon, element.lat]);
      continue;
    }

    ways.push(element);
  }

  const graphNodes = new Map<string, RoadNode>();
  const edgeKeySet = new Set<string>();
  const edges: RoadEdge[] = [];

  for (const way of ways) {
    for (let index = 0; index < way.nodes.length - 1; index += 1) {
      const sourceCoordinate = nodesByOsmId.get(way.nodes[index]);
      const targetCoordinate = nodesByOsmId.get(way.nodes[index + 1]);

      if (!sourceCoordinate || !targetCoordinate) {
        continue;
      }

      const [sourceLng, sourceLat] = sourceCoordinate;
      const [targetLng, targetLat] = targetCoordinate;
      const sourceId = toNodeId(sourceLng, sourceLat, precision);
      const targetId = toNodeId(targetLng, targetLat, precision);

      if (sourceId === targetId) {
        continue;
      }

      if (!graphNodes.has(sourceId)) {
        graphNodes.set(sourceId, {
          id: sourceId,
          lng: roundCoordinate(sourceLng, precision),
          lat: roundCoordinate(sourceLat, precision),
          neighborIds: [],
        });
      }

      if (!graphNodes.has(targetId)) {
        graphNodes.set(targetId, {
          id: targetId,
          lng: roundCoordinate(targetLng, precision),
          lat: roundCoordinate(targetLat, precision),
          neighborIds: [],
        });
      }

      const edgeKey = sourceId < targetId ? `${sourceId}|${targetId}` : `${targetId}|${sourceId}`;
      if (edgeKeySet.has(edgeKey)) {
        continue;
      }

      edgeKeySet.add(edgeKey);

      edges.push({
        from: sourceId,
        to: targetId,
        distanceMeters: getDistanceMeters(sourceCoordinate, targetCoordinate),
      });

      graphNodes.get(sourceId)?.neighborIds.push(targetId);
      graphNodes.get(targetId)?.neighborIds.push(sourceId);
    }
  }

  return {
    nodes: Object.fromEntries(graphNodes),
    edges,
  };
}

export function roadGraphToNodeFeatureCollection(graph: RoadGraph): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: Object.values(graph.nodes).map((node) => ({
      type: "Feature",
      properties: {
        id: node.id,
        degree: node.neighborIds.length,
      },
      geometry: {
        type: "Point",
        coordinates: [node.lng, node.lat],
      },
    })),
  };
}

export function roadGraphToEdgeFeatureCollection(
  graph: RoadGraph
): GeoJSON.FeatureCollection<GeoJSON.LineString, { from: string; to: string; distanceMeters: number }> {
  const features: GeoJSON.Feature<
    GeoJSON.LineString,
    { from: string; to: string; distanceMeters: number }
  >[] = [];

  for (const edge of graph.edges) {
    const fromNode = graph.nodes[edge.from];
    const toNode = graph.nodes[edge.to];


    if (!fromNode || !toNode) {
      continue;
    }

    features.push({
      type: "Feature",
      properties: {
        from: edge.from,
        to: edge.to,
        distanceMeters: edge.distanceMeters,
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [fromNode.lng, fromNode.lat],
          [toNode.lng, toNode.lat],
        ],
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

export function findNearestRoadNode(
  graph: RoadGraph,
  lng: number,
  lat: number
): RoadNode | null {
  if (!graph?.nodes) return null;

  let nearestNode: RoadNode | null = null;
  let nearestDistance = Infinity;

  for (const node of Object.values(graph.nodes)) {
    if (!node || typeof node.lng !== "number" || typeof node.lat !== "number") {
      continue;
    }

    const distance = getDistanceMeters(
      [lng, lat],
      [node.lng, node.lat]
    );

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestNode = node;
    }
  }

  return nearestNode;
}
