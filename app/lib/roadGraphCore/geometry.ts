import type { Coordinate, RoadGraph, RoadNode } from "./types";

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function roundCoordinate(value: number, precision: number): number {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

export function toNodeId(lng: number, lat: number, precision: number): string {
  return `${roundCoordinate(lng, precision)},${roundCoordinate(lat, precision)}`;
}

export function getDistanceMeters(a: Coordinate, b: Coordinate): number {
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

function getClosestPointOnLineSegment(
  point: Coordinate,
  segmentStart: Coordinate,
  segmentEnd: Coordinate
): Coordinate {
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

export function findNearestRoadNode(graph: RoadGraph, lng: number, lat: number): RoadNode | null {
  if (!graph?.nodes) {
    return null;
  }

  let nearestNode: RoadNode | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const node of Object.values(graph.nodes)) {
    const distance = getDistanceMeters([lng, lat], [node.lng, node.lat]);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestNode = node;
    }
  }

  return nearestNode;
}
