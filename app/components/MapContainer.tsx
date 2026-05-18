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
  type RoadGraph,
} from "../lib/roadGraph";
import { PathfindingRunner, type PathfindingAlgorithmType, type SearchSnapshot } from "../lib/pathfinding";

interface MapContainerProps {
  mapStyle?: MapStyleType;
  selectionRadiusKm?: number;
  algorithm?: PathfindingAlgorithmType;
  animationSpeed?: number;
  showRoadOverlay?: boolean;
  playbackCommand?: { id: number; action: "toggle" | "step" | "reset" };
  onPlaybackRunningChange?: (running: boolean) => void;
  onPlaybackReadyChange?: (ready: boolean) => void;
}

const ROAD_EDGE_SOURCE_ID = "road-edge-source";
const ROAD_EDGE_LAYER_ID = "road-edge-layer";
const SELECTION_RADIUS_SOURCE_ID = "selection-radius-source";
const SELECTION_RADIUS_FILL_LAYER_ID = "selection-radius-fill-layer";
const SELECTION_RADIUS_LINE_LAYER_ID = "selection-radius-line-layer";
const EXPLORED_EDGE_SOURCE_ID = "explored-edge-source";
const EXPLORED_EDGE_LAYER_ID = "explored-edge-layer";
const PATH_EDGE_SOURCE_ID = "path-edge-source";
const PATH_EDGE_LAYER_ID = "path-edge-layer";
const SELECTION_RADIUS_KM = 2;

interface PathfindingVisualState {
  exploredEdgeKeys: string[];
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
        "line-color": "#1F2937",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 14, 2.2, 18, 3.2],
        "line-opacity": 0.6,
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
        "fill-color": "#059669",
        "fill-opacity": 0.08,
      },
    });
  }

  if (!map.getLayer(SELECTION_RADIUS_LINE_LAYER_ID)) {
    map.addLayer({
      id: SELECTION_RADIUS_LINE_LAYER_ID,
      type: "line",
      source: SELECTION_RADIUS_SOURCE_ID,
      paint: {
        "line-color": "#047857",
        "line-width": 2.5,
        "line-opacity": 0.7,
      },
    });
  }
}

function ensurePathfindingLayers(map: maplibregl.Map): void {
  if (!map.getSource(EXPLORED_EDGE_SOURCE_ID)) {
    map.addSource(EXPLORED_EDGE_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getLayer(EXPLORED_EDGE_LAYER_ID)) {
    map.addLayer({
      id: EXPLORED_EDGE_LAYER_ID,
      type: "line",
      source: EXPLORED_EDGE_SOURCE_ID,
      paint: {
        "line-color": "#46B780",
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1.2, 10, 2.4, 14, 4.2, 18, 6.4],
        "line-opacity": 0.85,
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
        "line-color": "#A50D20",
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1.8, 10, 3.6, 14, 5.8, 18, 8.4],
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
}

function clearRoadGraph(map: maplibregl.Map): void {
  getGeoJsonSource(map, ROAD_EDGE_SOURCE_ID)?.setData({ type: "FeatureCollection", features: [] });
}

function clearSelectionRadius(map: maplibregl.Map): void {
  getGeoJsonSource(map, SELECTION_RADIUS_SOURCE_ID)?.setData({
    type: "FeatureCollection",
    features: [],
  });
}

function clearPathfindingVisualization(map: maplibregl.Map): void {
  getGeoJsonSource(map, EXPLORED_EDGE_SOURCE_ID)?.setData({
    type: "FeatureCollection",
    features: [],
  });
  getGeoJsonSource(map, PATH_EDGE_SOURCE_ID)?.setData({
    type: "FeatureCollection",
    features: [],
  });
}

function setSelectionRadius(map: maplibregl.Map, circle: [number, number][]): void {
  // debug: log when we attempt to set selection radius data
  // eslint-disable-next-line no-console
  console.debug("setSelectionRadius: attempting to set data on source", SELECTION_RADIUS_SOURCE_ID, { hasSource: !!map.getSource(SELECTION_RADIUS_SOURCE_ID) });

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
    markerRef.current = new maplibregl.Marker({ color: "#46B780" });
  }

  markerRef.current.setLngLat(lngLat).addTo(map);
}

function setEndMarker(
  map: maplibregl.Map,
  markerRef: MutableRefObject<maplibregl.Marker | null>,
  lngLat: [number, number]
): void {
  if (!markerRef.current) {
    markerRef.current = new maplibregl.Marker({ color: "#980C0C" });
  }

  markerRef.current.setLngLat(lngLat).addTo(map);
}

function setRoadGraphData(map: maplibregl.Map, graph: RoadGraph): void {
  getGeoJsonSource(map, ROAD_EDGE_SOURCE_ID)?.setData(roadGraphToEdgeFeatureCollection(graph));
}

function toExploredEdgesFromSnapshot(
  graph: RoadGraph,
  snapshot: SearchSnapshot
): string[] {
  const exploredNodeIds = new Set([...snapshot.visitedNodeIds, ...snapshot.frontierNodeIds]);
  const exploredEdgeKeys: string[] = [];

  for (const edge of graph.edges) {
    if (exploredNodeIds.has(edge.from) || exploredNodeIds.has(edge.to)) {
      const key = getEdgeKey(edge.from, edge.to);
      exploredEdgeKeys.push(key);
    }
  }

  return exploredEdgeKeys;
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
  getGeoJsonSource(map, EXPLORED_EDGE_SOURCE_ID)?.setData(
    toPathEdgeFeatureCollection(graph, state.exploredEdgeKeys)
  );
  getGeoJsonSource(map, PATH_EDGE_SOURCE_ID)?.setData(
    toPathEdgeFeatureCollection(graph, state.pathEdgeKeys)
  );
}

export function MapContainer({
  mapStyle = "streets",
  selectionRadiusKm,
  algorithm = "astar",
  animationSpeed = 1,
  showRoadOverlay = false,
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
  const pathfindingRafRef = useRef<number | null>(null);
  const playbackRunningRef = useRef(false);
  const playbackReadyRef = useRef(false);
  const lastPlaybackCommandIdRef = useRef<number>(0);
  const previousTimeRef = useRef<number | null>(null);
  const stepAccumulatorRef = useRef<number>(0);
  const animationSpeedRef = useRef<number>(animationSpeed);
  const applySelectionAtPointRef = useRef<
    ((center: [number, number], radiusKm: number) => Promise<void>) | null
  >(null);
  const applyEndPointRef = useRef<((center: [number, number]) => Promise<void>) | null>(null);
  const stopPathfindingAnimationRef = useRef<(() => void) | null>(null);
  const setPlaybackReadyRef = useRef<((ready: boolean) => void) | null>(null);
  const showRoadOverlayRef = useRef(showRoadOverlay);
  const pathfindingStateRef = useRef<PathfindingVisualState>({
    exploredEdgeKeys: [],
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
    if (pathfindingRafRef.current) {
      cancelAnimationFrame(pathfindingRafRef.current);
      pathfindingRafRef.current = null;
    }
    previousTimeRef.current = null;

    // stop timing
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
      exploredEdgeKeys: [],
      pathEdgeKeys: [],
    });
    try {
      localStorage.removeItem("pv_start");
      localStorage.removeItem("pv_end");
    } catch {
      /* ignore */
    }
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
      exploredEdgeKeys: toExploredEdgesFromSnapshot(graph, initialSnapshot),
      pathEdgeKeys: initialSnapshot.pathEdgeKeys,
    });

    return true;
  }, [algorithm, applyPathfindingState]);

  const runPathfindingStep = useCallback(() => {
    const runner = runnerRef.current;
    const graph = roadGraphRef.current;
    if (!runner || !graph) {
      return;
    }

    const snapshot = runner.nextStep();

    applyPathfindingState({
      exploredEdgeKeys: toExploredEdgesFromSnapshot(graph, snapshot),
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
    previousTimeRef.current = null;
    

    const animate = (newTime: number) => {
      if (previousTimeRef.current === null) {
        previousTimeRef.current = newTime;
        pathfindingRafRef.current = requestAnimationFrame(animate);
        return;
      }

      const dtMs = newTime - (previousTimeRef.current ?? newTime);
      previousTimeRef.current = newTime;

      // base steps per second controls how many algorithm steps per real second at speed=1
      const BASE_STEPS_PER_SECOND = 60;
      const stepsToAdd = (dtMs / 1000) * BASE_STEPS_PER_SECOND * (animationSpeedRef.current ?? 1);
      stepAccumulatorRef.current += stepsToAdd;

      const stepsToRun = Math.floor(stepAccumulatorRef.current);
      if (stepsToRun > 0) {
        stepAccumulatorRef.current -= stepsToRun;
        for (let i = 0; i < stepsToRun; i++) {
          runPathfindingStep();
        }
      }

      pathfindingRafRef.current = requestAnimationFrame(animate);
    };

    pathfindingRafRef.current = requestAnimationFrame(animate);
  }, [
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
        setRoadGraphLayerVisibility(map, showRoadOverlay);
        resetPathfindingState();
        try {
          localStorage.setItem(
            "pv_start",
            JSON.stringify({ center, radiusKm })
          );
          localStorage.removeItem("pv_end");
        } catch {
          /* ignore */
        }
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
    [resetPathfindingState, setPlaybackReady, showRoadOverlay]
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
      try {
        localStorage.setItem(
          "pv_end",
          JSON.stringify({ center })
        );
      } catch {
        /* ignore */
      }
    },
    [createPathfindingRunner, runPathfindingAnimation, setPlaybackReady]
  );

  applySelectionAtPointRef.current = applySelectionAtPoint;
  applyEndPointRef.current = applyEndPoint;
  stopPathfindingAnimationRef.current = stopPathfindingAnimation;
  setPlaybackReadyRef.current = setPlaybackReady;
  showRoadOverlayRef.current = showRoadOverlay;

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
        // debug: ensure overlays are re-added after style changes
        // eslint-disable-next-line no-console
        console.debug("syncOverlayState: ensuring overlay layers/sources");
        ensureRoadGraphLayers(map);
        ensurePathfindingLayers(map);

      if (roadGraphRef.current) {
        setRoadGraphData(map, roadGraphRef.current);
        setRoadGraphLayerVisibility(map, showRoadOverlayRef.current);
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
      await applySelectionAtPointRef.current?.(clickPoint, radiusKmRef.current);
    };

    const handleMapRightClick = async (event: maplibregl.MapMouseEvent) => {
      event.preventDefault?.();
      if (event.originalEvent instanceof MouseEvent) {
        event.originalEvent.preventDefault();
      }

      const clickPoint: [number, number] = [event.lngLat.lng, event.lngLat.lat];
      lastEndPointRef.current = clickPoint;
      await applyEndPointRef.current?.(clickPoint);
    };

    const handleLoad = () => {
      syncOverlayState();
    };

    const handleStyleLoad = () => {
      // style.load is emitted when the style is fully rebuilt
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
    map.on("style.load", handleStyleLoad);
    map.on("styledata", handleStyleData);

    return () => {
      stopPathfindingAnimationRef.current?.();
      setPlaybackReadyRef.current?.(false);
      clickAbortControllerRef.current?.abort();
      map.off("click", handleMapClick);
      map.off("contextmenu", handleMapRightClick);
      map.off("load", handleLoad);
      map.off("style.load", handleStyleLoad);
      map.off("styledata", handleStyleData);
      startMarkerRef.current?.remove();
      startMarkerRef.current = null;
      endMarkerRef.current?.remove();
      endMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
    const map = mapRef.current;
    if (!map) return;
    // Only show road overlay if it's enabled AND we have a graph loaded
    if (showRoadOverlay && roadGraphRef.current) {
      setRoadGraphLayerVisibility(map, true);
    } else {
      setRoadGraphLayerVisibility(map, false);
    }
  }, [showRoadOverlay]);

  useEffect(() => {
    // Hide road overlay on initial mount (default behavior)
    const map = mapRef.current;
    if (map) {
      setRoadGraphLayerVisibility(map, false);
    }
  }, []);

  useEffect(() => {
    if (startNodeIdRef.current && endNodeIdRef.current) {
      const map = mapRef.current;
      let prevCenter: [number, number] | null = null;
      let prevZoom: number | null = null;
      if (map) {
        const c = map.getCenter();
        prevCenter = [c.lng, c.lat];
        prevZoom = map.getZoom();
      }

      const wasRunning = playbackRunningRef.current;
      createPathfindingRunner();

      // restore view to avoid jumping when algorithm changes
      if (map && prevCenter && typeof prevZoom === "number") {
        try {
          map.jumpTo({ center: prevCenter, zoom: prevZoom });
        } catch {
          /* ignore */
        }
      }

      if (wasRunning) {
        runPathfindingAnimation();
      }
    }
  }, [algorithm, createPathfindingRunner, runPathfindingAnimation]);

  useEffect(() => {
    // Keep the current RAF running when speed changes; update ref instead
    animationSpeedRef.current = animationSpeed;
  }, [animationSpeed]);

  useEffect(() => {
    // Restore previous selection (survives hot reloads/dev edits)
    (async () => {
      try {
        const s = localStorage.getItem("pv_start");
        if (!s) return;
        const parsed = JSON.parse(s);
        if (parsed?.center && parsed?.radiusKm) {
          await applySelectionAtPoint(parsed.center, parsed.radiusKm);
        }

        const e = localStorage.getItem("pv_end");
        if (e) {
          const parsedE = JSON.parse(e);
          if (parsedE?.center) {
            await applyEndPoint(parsedE.center);
          }
        }
      } catch (err) {
        // best-effort restore, ignore failures
        console.warn("PathViz: failed to restore selection", err);
      }
    })();
  }, [applySelectionAtPoint, applyEndPoint]);

  return <div ref={mapContainerRef} className="h-full w-full" />;
}
