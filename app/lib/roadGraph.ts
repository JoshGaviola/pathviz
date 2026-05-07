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

const highWayExclude = ["footway", "street_lamp", "steps", "pedestrian", "track", "path"];

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
function getClosestPointOnLineSegment(point: Coordinate, segmentStart: Coordinate, segmentEnd: Coordinate): Coordinate {
  const [px, py] = point;
  const [x1, y1] = segmentStart;
  const [x2, y2] = segmentEnd;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return segmentStart;
  }

  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));

  return [x1 + t * dx, y1 + t * dy];
}

export function getNearestPointOnRoad(
  latitude: number,
  longitude: number,
  graph: RoadGraph
): Coordinate | null {
  const point: Coordinate = [longitude, latitude];
  let nearestPoint: Coordinate | null = null;
  let minDistance = Number.POSITIVE_INFINITY;

  for (const edge of graph.edges) {
    const fromNode = graph.nodes[edge.from];
    const toNode = graph.nodes[edge.to];

    if (!fromNode || !toNode) {
      continue;
    }

    const from: Coordinate = [fromNode.lng, fromNode.lat];
    const to: Coordinate = [toNode.lng, toNode.lat];
    const closest = getClosestPointOnLineSegment(point, from, to);
    const distance = getDistanceMeters(point, closest);

    if (distance < minDistance) {
      minDistance = distance;
      nearestPoint = closest;
    }
  }

  return nearestPoint;
}
export function createGeoJSONCircle(
  center: Coordinate,
  radiusInKm: number,
  points = 64
): Coordinate[] {
  const [longitude, latitude] = center;
  const distanceX = radiusInKm / (111.32 * Math.cos((latitude * Math.PI) / 180));
  const distanceY = radiusInKm / 110.574;
  const ring: Coordinate[] = [];

  for (let index = 0; index < points; index += 1) {
    const theta = (index / points) * 2 * Math.PI;
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);

    ring.push([longitude + x, latitude + y]);
  }

  ring.push(ring[0]);
  return ring;
}

export function getBoundingBoxFromPolygon(
  polygon: Coordinate[]
): [{ latitude: number; longitude: number }, { latitude: number; longitude: number }] {
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;

  for (const [longitude, latitude] of polygon) {
    minLon = Math.min(minLon, longitude);
    maxLon = Math.max(maxLon, longitude);
    minLat = Math.min(minLat, latitude);
    maxLat = Math.max(maxLat, latitude);
  }

  return [
    { latitude: minLat, longitude: minLon },
    { latitude: maxLat, longitude: maxLon },
  ];
}

function createOverpassQuery(
  boundingBox: [{ latitude: number; longitude: number }, { latitude: number; longitude: number }]
): string {
  const exclusion = highWayExclude.map((entry) => `[highway!="${entry}"]`).join("");

  return `
[out:json];(
    way[highway]${exclusion}[footway!="*"]
    (${boundingBox[0].latitude},${boundingBox[0].longitude},${boundingBox[1].latitude},${boundingBox[1].longitude});
    node(w);
);
out skel;`;
}

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

async function fetchOverpassResponse(
  query: string,
  signal?: AbortSignal
): Promise<Response> {
  let lastError: unknown = null;

  for (const endpoint of OVERPASS_API_URLS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: query,
        signal,
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

      return response;
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }

      lastError = error;
    }
  }

  if (lastError instanceof OverpassError) {
    throw lastError;
  }

  throw new Error("Unable to load data from any Overpass endpoint");
}

export function fetchOverpassData(
  boundingBox: [{ latitude: number; longitude: number }, { latitude: number; longitude: number }],
  signal?: AbortSignal
): Promise<Response> {
  const query = createOverpassQuery(boundingBox);
  return fetchOverpassResponse(query, signal);
}

export async function getNearestNode(
  latitude: number,
  longitude: number,
  radiusKm = 2,
  signal?: AbortSignal
): Promise<OverpassNode | null> {
  const circle = createGeoJSONCircle([longitude, latitude], radiusKm);
  const boundingBox = getBoundingBoxFromPolygon(circle);
  const response = await fetchOverpassData(boundingBox, signal);
  const data = (await response.json()) as OverpassResponse;

  let result: OverpassNode | null = null;

  for (const node of data.elements) {
    if (node.type !== "node") {
      continue;
    }

    if (!result) {
      result = node;
      continue;
    }

    const newLength = Math.hypot(node.lat - latitude, node.lon - longitude);
    const resultLength = Math.hypot(result.lat - latitude, result.lon - longitude);

    if (newLength < resultLength) {
      result = node;
    }
  }

  return result;
}

export async function getMapGraph(
  bounds: [{ latitude: number; longitude: number }, { latitude: number; longitude: number }],
  signal?: AbortSignal
): Promise<RoadGraph> {
  return fetchRoadGraphForBounds(bounds, { signal });
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

export function filterRoadGraphToRadius(
  graph: RoadGraph,
  center: Coordinate,
  radiusKm: number
): RoadGraph {
  const radiusMeters = radiusKm * 1000;
  const keptNodeIds = new Set<string>();

  for (const node of Object.values(graph.nodes)) {
    if (getDistanceMeters([node.lng, node.lat], center) <= radiusMeters) {
      keptNodeIds.add(node.id);
    }
  }

  const nodes: Record<string, RoadNode> = {};
  for (const nodeId of keptNodeIds) {
    const node = graph.nodes[nodeId];
    if (node) {
      nodes[nodeId] = {
        ...node,
        neighborIds: [],
      };
    }
  }

  const edges: RoadEdge[] = [];
  for (const edge of graph.edges) {
    if (!keptNodeIds.has(edge.from) || !keptNodeIds.has(edge.to)) {
      continue;
    }

    edges.push(edge);
    nodes[edge.from]?.neighborIds.push(edge.to);
    nodes[edge.to]?.neighborIds.push(edge.from);
  }

  return {
    nodes,
    edges,
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
