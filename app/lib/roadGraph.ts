export type {
  BoundingBox,
  Coordinate,
  OverpassNode,
  OverpassResponse,
  OverpassWay,
  RoadEdge,
  RoadGraph,
  RoadNode,
} from "./roadGraphCore/types";

export { OverpassError } from "./roadGraphCore/types";

export {
  createGeoJSONCircle,
  findNearestRoadNode,
  getBoundingBoxFromPolygon,
  getDistanceMeters,
  getNearestPointOnRoad,
} from "./roadGraphCore/geometry";

export {
  buildRoadGraphFromOverpass,
  filterRoadGraphToRadius,
  roadGraphToEdgeFeatureCollection,
  roadGraphToNodeFeatureCollection,
} from "./roadGraphCore/build";

export { fetchRoadGraphForBounds } from "./roadGraphCore/cache";

export { fetchOverpassData, getNearestNode } from "./roadGraphCore/overpass";

import { fetchRoadGraphForBounds } from "./roadGraphCore/cache";
import type { RoadGraph } from "./roadGraphCore/types";

export async function getMapGraph(
  bounds: [{ latitude: number; longitude: number }, { latitude: number; longitude: number }],
  signal?: AbortSignal
): Promise<RoadGraph> {
  return fetchRoadGraphForBounds(bounds, { signal });
}
