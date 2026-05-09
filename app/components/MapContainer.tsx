"use client";

import maplibregl from "maplibre-gl";
import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { getMapStyle, type MapStyleType } from "@/app/lib/mapStyles";
import { setMapInstance } from "../lib/mapStore";
import {
  createGeoJSONCircle,
  filterRoadGraphToRadius,
  findNearestRoadNode,
  getBoundingBoxFromPolygon,
  getMapGraph,
  getNearestPointOnRoad,
  roadGraphToEdgeFeatureCollection,
  roadGraphToNodeFeatureCollection,
  type RoadGraph,
} from "../lib/roadGraph";
import { PathfindingRunner, type PathfindingAlgorithmType } from "../lib/pathfinding";

interface MapContainerProps {
  mapStyle?: MapStyleType;
  selectionRadiusKm?: number;
  algorithm?: PathfindingAlgorithmType;
  animationSpeed?: number;
  playbackCommand?: { id: number; action: "toggle" | "step" | "reset" };
  onPlaybackRunningChange?: (running: boolean) => void;
  onPlaybackReadyChange?: (ready: boolean) => void;
}

const ROAD_NODE_SOURCE_ID = "road-node-source";
const ROAD_EDGE_SOURCE_ID = "road-edge-source";
const ROAD_NODE_LAYER_ID = "road-node-layer";
const ROAD_EDGE_LAYER_ID = "road-edge-layer";
const SELECTION_RADIUS_SOURCE_ID = "selection-radius-source";
const SELECTION_RADIUS_FILL_LAYER_ID = "selection-radius-fill-layer";
const SELECTION_RADIUS_LINE_LAYER_ID = "selection-radius-line-layer";
const VISITED_NODE_SOURCE_ID = "visited-node-source";
const VISITED_NODE_LAYER_ID = "visited-node-layer";
const FRONTIER_NODE_SOURCE_ID = "frontier-node-source";
const FRONTIER_NODE_LAYER_ID = "frontier-node-layer";
const PATH_EDGE_SOURCE_ID = "path-edge-source";
const PATH_EDGE_LAYER_ID = "path-edge-layer";
const SELECTION_RADIUS_KM = 2;

interface PathfindingVisualState {
  visitedNodeIds: string[];
  frontierNodeIds: string[];
  pathEdgeKeys: string[];
}

function getGeoJsonSource(map: maplibregl.Map, sourceId: string): maplibregl.GeoJSONSource | null {
  const source = map.getSource(sourceId);

  if (!source || source.type !== "geojson") {
    return null;
  }

  return source as maplibregl.GeoJSONSource;
}

function getEdgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function ensureRoadGraphLayers(map: maplibregl.Map): void {
  if (!map.getSource(ROAD_EDGE_SOURCE_ID)) {
    map.addSource(ROAD_EDGE_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getLayer(ROAD_EDGE_LAYER_ID)) {
    map.addLayer({
      id: ROAD_EDGE_LAYER_ID,
      type: "line",
      source: ROAD_EDGE_SOURCE_ID,
      paint: {
        "line-color": "#111827",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.8, 14, 3.2, 18, 4.6],
        "line-opacity": 0.7,
      },
    });
  }

  if (!map.getSource(ROAD_NODE_SOURCE_ID)) {
    map.addSource(ROAD_NODE_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getLayer(ROAD_NODE_LAYER_ID)) {
    map.addLayer({
      id: ROAD_NODE_LAYER_ID,
      type: "circle",
      source: ROAD_NODE_SOURCE_ID,
      paint: {
        "circle-color": "#f59e0b",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 1.4, 10, 2.8, 14, 4.8, 18, 7],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 1, 0.2, 10, 0.7, 16, 1.6],
        "circle-opacity": 0.95,
      },
    });
  }

  if (!map.getSource(SELECTION_RADIUS_SOURCE_ID)) {
    map.addSource(SELECTION_RADIUS_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getLayer(SELECTION_RADIUS_FILL_LAYER_ID)) {
    map.addLayer({
      id: SELECTION_RADIUS_FILL_LAYER_ID,
      type: "fill",
      source: SELECTION_RADIUS_SOURCE_ID,
      paint: {
        "fill-color": "#ef4444",
        "fill-opacity": 0.12,
      },
    });
  }

  if (!map.getLayer(SELECTION_RADIUS_LINE_LAYER_ID)) {
    map.addLayer({
      id: SELECTION_RADIUS_LINE_LAYER_ID,
      type: "line",
      source: SELECTION_RADIUS_SOURCE_ID,
      paint: {
        "line-color": "#ef4444",
        "line-width": 2,
        "line-opacity": 0.75,
      },
    });
  }
}

function ensurePathfindingLayers(map: maplibregl.Map): void {
  if (!map.getSource(VISITED_NODE_SOURCE_ID)) {
    map.addSource(VISITED_NODE_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getLayer(VISITED_NODE_LAYER_ID)) {
    map.addLayer({
      id: VISITED_NODE_LAYER_ID,
      type: "circle",
      source: VISITED_NODE_SOURCE_ID,
      paint: {
        "circle-color": "#34d399",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 1.6, 10, 3.4, 14, 5.4, 18, 8],
        "circle-opacity": 0.95,
      },
    });
  }

  if (!map.getSource(FRONTIER_NODE_SOURCE_ID)) {
    map.addSource(FRONTIER_NODE_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getLayer(FRONTIER_NODE_LAYER_ID)) {
    map.addLayer({
      id: FRONTIER_NODE_LAYER_ID,
      type: "circle",
      source: FRONTIER_NODE_SOURCE_ID,
      paint: {
        "circle-color": "#facc15",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 1.8, 10, 3.8, 14, 6, 18, 8.8],
        "circle-opacity": 0.96,
        "circle-stroke-color": "#111827",
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 1, 0.3, 10, 0.8, 14, 1.2],
      },
    });
  }

  if (!map.getSource(PATH_EDGE_SOURCE_ID)) {
    map.addSource(PATH_EDGE_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getLayer(PATH_EDGE_LAYER_ID)) {
    map.addLayer({
      id: PATH_EDGE_LAYER_ID,
      type: "line",
      source: PATH_EDGE_SOURCE_ID,
      paint: {
        "line-color": "#60a5fa",
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1.5, 10, 3.2, 14, 5.4, 18, 7.8],
        "line-opacity": 0.95,
      },
    });
  }
}

function setRoadGraphLayerVisibility(map: maplibregl.Map, visible: boolean): void {
  const visibility = visible ? "visible" : "none";

  if (map.getLayer(ROAD_EDGE_LAYER_ID)) {
    map.setLayoutProperty(ROAD_EDGE_LAYER_ID, "visibility", visibility);
  }

  if (map.getLayer(ROAD_NODE_LAYER_ID)) {
    map.setLayoutProperty(ROAD_NODE_LAYER_ID, "visibility", visibility);
  }
}

function clearRoadGraph(map: maplibregl.Map): void {
  getGeoJsonSource(map, ROAD_EDGE_SOURCE_ID)?.setData({ type: "FeatureCollection", features: [] });
  getGeoJsonSource(map, ROAD_NODE_SOURCE_ID)?.setData({ type: "FeatureCollection", features: [] });
}

function clearSelectionRadius(map: maplibregl.Map): void {
  getGeoJsonSource(map, SELECTION_RADIUS_SOURCE_ID)?.setData({
    type: "FeatureCollection",
    features: [],
  });
}

function clearPathfindingVisualization(map: maplibregl.Map): void {
  getGeoJsonSource(map, VISITED_NODE_SOURCE_ID)?.setData({
    type: "FeatureCollection",
    features: [],
  });
  getGeoJsonSource(map, FRONTIER_NODE_SOURCE_ID)?.setData({
    type: "FeatureCollection",
    features: [],
  });
  getGeoJsonSource(map, PATH_EDGE_SOURCE_ID)?.setData({
    type: "FeatureCollection",
    features: [],
  });
}

function setSelectionRadius(map: maplibregl.Map, circle: [number, number][]): void {
  getGeoJsonSource(map, SELECTION_RADIUS_SOURCE_ID)?.setData({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [circle],
        },
      },
    ],
  });
}

function setStartMarker(
  map: maplibregl.Map,
  markerRef: MutableRefObject<maplibregl.Marker | null>,
  lngLat: [number, number]
): void {
  if (!markerRef.current) {
    markerRef.current = new maplibregl.Marker({ color: "#ef4444" });
  }

  markerRef.current.setLngLat(lngLat).addTo(map);
}

function setEndMarker(
  map: maplibregl.Map,
  markerRef: MutableRefObject<maplibregl.Marker | null>,
  lngLat: [number, number]
): void {
  if (!markerRef.current) {
    markerRef.current = new maplibregl.Marker({ color: "#3b82f6" });
  }

  markerRef.current.setLngLat(lngLat).addTo(map);
}

function setRoadGraphData(map: maplibregl.Map, graph: RoadGraph): void {
  getGeoJsonSource(map, ROAD_EDGE_SOURCE_ID)?.setData(roadGraphToEdgeFeatureCollection(graph));
  getGeoJsonSource(map, ROAD_NODE_SOURCE_ID)?.setData(roadGraphToNodeFeatureCollection(graph));
}

function toNodeFeatureCollection(graph: RoadGraph, nodeIds: string[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];

  for (const nodeId of nodeIds) {
    const node = graph.nodes[nodeId];
    if (!node) {
      continue;
    }

    features.push({
      type: "Feature",
      properties: { id: nodeId },
      geometry: {
        type: "Point",
        coordinates: [node.lng, node.lat],
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function toPathEdgeFeatureCollection(
  graph: RoadGraph,
  pathEdgeKeys: string[]
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const pathKeySet = new Set(pathEdgeKeys);
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];

  for (const edge of graph.edges) {
    const key = getEdgeKey(edge.from, edge.to);
    if (!pathKeySet.has(key)) {
      continue;
    }

    const from = graph.nodes[edge.from];
    const to = graph.nodes[edge.to];
    if (!from || !to) {
      continue;
    }

    features.push({
      type: "Feature",
      properties: { key },
      geometry: {
        type: "LineString",
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function setPathfindingVisualization(
  map: maplibregl.Map,
  graph: RoadGraph,
  state: PathfindingVisualState
): void {
  getGeoJsonSource(map, VISITED_NODE_SOURCE_ID)?.setData(
    toNodeFeatureCollection(graph, state.visitedNodeIds)
  );
  getGeoJsonSource(map, FRONTIER_NODE_SOURCE_ID)?.setData(
    toNodeFeatureCollection(graph, state.frontierNodeIds)
  );
  getGeoJsonSource(map, PATH_EDGE_SOURCE_ID)?.setData(
    toPathEdgeFeatureCollection(graph, state.pathEdgeKeys)
  );
}

function getStepDelayMs(animationSpeed: number): number {
  const safeSpeed = Math.max(0.1, animationSpeed);
  return Math.max(35, Math.round(420 / safeSpeed));
}

export function MapContainer({
  mapStyle = "streets",
  selectionRadiusKm,
  algorithm = "astar",
  animationSpeed = 1,
  playbackCommand,
  onPlaybackRunningChange,
  onPlaybackReadyChange,
}: MapContainerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const initialMapStyleRef = useRef(mapStyle);
  const roadGraphRef = useRef<RoadGraph | null>(null);
  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const endMarkerRef = useRef<maplibregl.Marker | null>(null);
  const selectionCircleRef = useRef<[number, number][] | null>(null);
  const clickAbortControllerRef = useRef<AbortController | null>(null);
  const lastClickPointRef = useRef<[number, number] | null>(null);
  const lastEndPointRef = useRef<[number, number] | null>(null);
  const startNodeIdRef = useRef<string | null>(null);
  const endNodeIdRef = useRef<string | null>(null);
  const runnerRef = useRef<PathfindingRunner | null>(null);
  const pathfindingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playbackRunningRef = useRef(false);
  const playbackReadyRef = useRef(false);
  const lastPlaybackCommandIdRef = useRef<number>(0);
  const pathfindingStateRef = useRef<PathfindingVisualState>({
    visitedNodeIds: [],
    frontierNodeIds: [],
    pathEdgeKeys: [],
  });
  const effectiveRadiusKm = selectionRadiusKm ?? SELECTION_RADIUS_KM;
  const radiusKmRef = useRef(effectiveRadiusKm);

  const setPlaybackRunning = useCallback(
    (running: boolean) => {
      if (playbackRunningRef.current === running) {
        return;
      }

      playbackRunningRef.current = running;
      onPlaybackRunningChange?.(running);
    },
    [onPlaybackRunningChange]
  );

  const setPlaybackReady = useCallback(
    (ready: boolean) => {
      if (playbackReadyRef.current === ready) {
        return;
      }

      playbackReadyRef.current = ready;
      onPlaybackReadyChange?.(ready);
    },
    [onPlaybackReadyChange]
  );

  const stopPathfindingAnimation = useCallback(() => {
    if (pathfindingTimerRef.current) {
      clearInterval(pathfindingTimerRef.current);
      pathfindingTimerRef.current = null;
    }

    setPlaybackRunning(false);
  }, [setPlaybackRunning]);

  const applyPathfindingState = useCallback((state: PathfindingVisualState) => {
    pathfindingStateRef.current = state;

    const map = mapRef.current;
    const graph = roadGraphRef.current;
    if (!map || !graph) {
      return;
    }

    setPathfindingVisualization(map, graph, state);
  }, []);

  const resetPathfindingState = useCallback(() => {
    stopPathfindingAnimation();
    runnerRef.current = null;
    applyPathfindingState({
      visitedNodeIds: [],
      frontierNodeIds: [],
      pathEdgeKeys: [],
    });
  }, [applyPathfindingState, stopPathfindingAnimation]);

  const createPathfindingRunner = useCallback((): boolean => {
    const graph = roadGraphRef.current;
    const startNodeId = startNodeIdRef.current;
    const endNodeId = endNodeIdRef.current;

    if (!graph || !startNodeId || !endNodeId) {
      return false;
    }

    const runner = new PathfindingRunner(graph, startNodeId, endNodeId, algorithm);
    runnerRef.current = runner;
    const initialSnapshot = runner.getSnapshot();
    applyPathfindingState({
      visitedNodeIds: initialSnapshot.visitedNodeIds,
      frontierNodeIds: initialSnapshot.frontierNodeIds,
      pathEdgeKeys: initialSnapshot.pathEdgeKeys,
    });

    return true;
  }, [algorithm, applyPathfindingState]);

  const runPathfindingStep = useCallback(() => {
    const runner = runnerRef.current;
    if (!runner) {
      return;
    }

    const snapshot = runner.nextStep();

    applyPathfindingState({
      visitedNodeIds: snapshot.visitedNodeIds,
      frontierNodeIds: snapshot.frontierNodeIds,
      pathEdgeKeys: snapshot.pathEdgeKeys,
    });

    if (snapshot.finished) {
      stopPathfindingAnimation();
    }
  }, [applyPathfindingState, stopPathfindingAnimation]);

  const runPathfindingAnimation = useCallback(() => {
    if (!runnerRef.current && !createPathfindingRunner()) {
      resetPathfindingState();
      return;
    }

    stopPathfindingAnimation();
    setPlaybackRunning(true);

    pathfindingTimerRef.current = setInterval(() => {
      runPathfindingStep();
    }, getStepDelayMs(animationSpeed));
  }, [
    animationSpeed,
    createPathfindingRunner,
    resetPathfindingState,
    runPathfindingStep,
    setPlaybackRunning,
    stopPathfindingAnimation,
  ]);

  const applySelectionAtPoint = useCallback(
    async (center: [number, number], radiusKm: number) => {
      const map = mapRef.current;
      if (!map) {
        return;
      }

      clickAbortControllerRef.current?.abort();
      const abortController = new AbortController();
      clickAbortControllerRef.current = abortController;

      try {
        const circle = createGeoJSONCircle(center, radiusKm);
        selectionCircleRef.current = circle;
        setSelectionRadius(map, circle);

        const graph = await getMapGraph(getBoundingBoxFromPolygon(circle), abortController.signal);

        if (abortController.signal.aborted) {
          return;
        }

        const filteredGraph = filterRoadGraphToRadius(graph, center, radiusKm);
        if (Object.keys(filteredGraph.nodes).length === 0) {
          roadGraphRef.current = null;
          startNodeIdRef.current = null;
          endNodeIdRef.current = null;
          setPlaybackReady(false);
          startMarkerRef.current?.remove();
          startMarkerRef.current = null;
          endMarkerRef.current?.remove();
          endMarkerRef.current = null;
          clearRoadGraph(map);
          clearPathfindingVisualization(map);
          setRoadGraphLayerVisibility(map, false);
          return;
        }

        roadGraphRef.current = filteredGraph;

        const snappedPoint =
          getNearestPointOnRoad(center[1], center[0], filteredGraph) ?? center;
        const startNode = findNearestRoadNode(filteredGraph, snappedPoint[0], snappedPoint[1]);
        if (!startNode) {
          return;
        }

        startNodeIdRef.current = startNode.id;
        endNodeIdRef.current = null;
        setPlaybackReady(false);
        endMarkerRef.current?.remove();
        endMarkerRef.current = null;

        setStartMarker(map, startMarkerRef, snappedPoint);
        setRoadGraphData(map, filteredGraph);
        setRoadGraphLayerVisibility(map, true);
        resetPathfindingState();
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error("Failed to build road graph around start point", error);
        }
      } finally {
        if (clickAbortControllerRef.current === abortController) {
          clickAbortControllerRef.current = null;
        }
      }
    },
    [resetPathfindingState, setPlaybackReady]
  );

  const applyEndPoint = useCallback(
    async (center: [number, number]) => {
      const map = mapRef.current;
      const graph = roadGraphRef.current;
      if (!map || !graph || !startNodeIdRef.current) {
        return;
      }

      const snappedPoint = getNearestPointOnRoad(center[1], center[0], graph) ?? center;
      const endNode = findNearestRoadNode(graph, snappedPoint[0], snappedPoint[1]);
      if (!endNode) {
        return;
      }

      endNodeIdRef.current = endNode.id;
      setPlaybackReady(true);
      setEndMarker(map, endMarkerRef, snappedPoint);
      createPathfindingRunner();
      runPathfindingAnimation();
    },
    [createPathfindingRunner, runPathfindingAnimation, setPlaybackReady]
  );

  useEffect(() => {
    if (!playbackCommand || playbackCommand.id === lastPlaybackCommandIdRef.current) {
      return;
    }

    lastPlaybackCommandIdRef.current = playbackCommand.id;

    if (playbackCommand.action === "toggle") {
      if (playbackRunningRef.current) {
        stopPathfindingAnimation();
      } else {
        runPathfindingAnimation();
      }
      return;
    }

    if (playbackCommand.action === "step") {
      stopPathfindingAnimation();
      if (!runnerRef.current) {
        const canCreate = createPathfindingRunner();
        if (!canCreate) {
          return;
        }
      }

      runPathfindingStep();
      return;
    }

    stopPathfindingAnimation();
    if (!createPathfindingRunner()) {
      resetPathfindingState();
    }
  }, [
    createPathfindingRunner,
    playbackCommand,
    resetPathfindingState,
    runPathfindingAnimation,
    runPathfindingStep,
    stopPathfindingAnimation,
  ]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: getMapStyle(initialMapStyleRef.current),
      center: [0, 20],
      zoom: 1.6,
      minZoom: 1,
      maxZoom: 18,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");

    mapRef.current = map;
    setMapInstance(map);

    const syncOverlayState = () => {
      ensureRoadGraphLayers(map);
      ensurePathfindingLayers(map);

      if (roadGraphRef.current) {
        setRoadGraphData(map, roadGraphRef.current);
        setRoadGraphLayerVisibility(map, true);
        setPathfindingVisualization(map, roadGraphRef.current, pathfindingStateRef.current);
      } else {
        clearRoadGraph(map);
        clearPathfindingVisualization(map);
        setRoadGraphLayerVisibility(map, false);
      }

      if (selectionCircleRef.current) {
        setSelectionRadius(map, selectionCircleRef.current);
      } else {
        clearSelectionRadius(map);
      }
    };

    const handleMapClick = async (event: maplibregl.MapMouseEvent) => {
      const clickPoint: [number, number] = [event.lngLat.lng, event.lngLat.lat];
      lastClickPointRef.current = clickPoint;
      await applySelectionAtPoint(clickPoint, radiusKmRef.current);
    };

    const handleMapRightClick = async (event: maplibregl.MapMouseEvent) => {
      event.preventDefault?.();
      if (event.originalEvent instanceof MouseEvent) {
        event.originalEvent.preventDefault();
      }

      const clickPoint: [number, number] = [event.lngLat.lng, event.lngLat.lat];
      lastEndPointRef.current = clickPoint;
      await applyEndPoint(clickPoint);
    };

    const handleLoad = () => {
      syncOverlayState();
    };

    const handleStyleData = () => {
      if (map.isStyleLoaded()) {
        syncOverlayState();
      }
    };

    map.on("click", handleMapClick);
    map.on("contextmenu", handleMapRightClick);
    map.on("load", handleLoad);
    map.on("styledata", handleStyleData);

    return () => {
      stopPathfindingAnimation();
      setPlaybackReady(false);
      clickAbortControllerRef.current?.abort();
      map.off("click", handleMapClick);
      map.off("contextmenu", handleMapRightClick);
      map.off("load", handleLoad);
      map.off("styledata", handleStyleData);
      startMarkerRef.current?.remove();
      startMarkerRef.current = null;
      endMarkerRef.current?.remove();
      endMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [applyEndPoint, applySelectionAtPoint, setPlaybackReady, stopPathfindingAnimation]);

  useEffect(() => {
    radiusKmRef.current = effectiveRadiusKm;

    if (lastClickPointRef.current) {
      applySelectionAtPoint(lastClickPointRef.current, effectiveRadiusKm);
    }
  }, [applySelectionAtPoint, effectiveRadiusKm]);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setStyle(getMapStyle(mapStyle));
    }
  }, [mapStyle]);

  useEffect(() => {
    if (startNodeIdRef.current && endNodeIdRef.current) {
      const wasRunning = playbackRunningRef.current;
      createPathfindingRunner();
      if (wasRunning) {
        runPathfindingAnimation();
      }
    }
  }, [algorithm, createPathfindingRunner, runPathfindingAnimation]);

  useEffect(() => {
    if (playbackRunningRef.current) {
      runPathfindingAnimation();
    }
  }, [animationSpeed, runPathfindingAnimation]);

  return <div ref={mapContainerRef} className="h-full w-full" />;
}
