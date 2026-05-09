import {
  getDistanceMeters,
  toNodeId,
  roundCoordinate,
} from "./geometry";
import type {
  Coordinate,
  OverpassResponse,
  OverpassWay,
  RoadEdge,
  RoadGraph,
  RoadNode,
} from "./types";

const DEFAULT_PRECISION = 6;

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
