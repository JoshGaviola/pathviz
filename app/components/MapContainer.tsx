import maplibregl from "maplibre-gl";
import { useCallback, useEffect, useRef } from "react";
import { getMapStyle, type MapStyleType } from "@/app/lib/mapStyles";
import { setMapInstance } from "../lib/mapStore";
import {
  createGeoJSONCircle,
  getBoundingBoxFromPolygon,
  getMapGraph,
  getNearestNode,
  filterRoadGraphToRadius,
  roadGraphToEdgeFeatureCollection,
  roadGraphToNodeFeatureCollection,
  type RoadGraph,
} from "../lib/roadGraph";

interface MapContainerProps {
  mapStyle?: MapStyleType;
  selectionRadiusKm?: number;
}

const ROAD_NODE_SOURCE_ID = "road-node-source";
const ROAD_EDGE_SOURCE_ID = "road-edge-source";
const ROAD_NODE_LAYER_ID = "road-node-layer";
const ROAD_EDGE_LAYER_ID = "road-edge-layer";
const SELECTION_RADIUS_SOURCE_ID = "selection-radius-source";
const SELECTION_RADIUS_FILL_LAYER_ID = "selection-radius-fill-layer";
const SELECTION_RADIUS_LINE_LAYER_ID = "selection-radius-line-layer";
const SELECTION_RADIUS_KM = 0.15;

function getGeoJsonSource(
  map: maplibregl.Map,
  sourceId: string
): maplibregl.GeoJSONSource | null {
  const source = map.getSource(sourceId);

  if (!source || source.type !== "geojson") {
    return null;
  }

  return source as maplibregl.GeoJSONSource;
}

function ensureRoadGraphLayers(map: maplibregl.Map) {
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
        "line-opacity": 0.85,
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
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 1.5, 10, 3.2, 14, 5.8, 18, 8.2],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 1, 0.4, 10, 0.8, 16, 2],
        "circle-opacity": 1,
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

function setRoadGraphLayerVisibility(map: maplibregl.Map, visible: boolean) {
  const visibility = visible ? "visible" : "none";

  if (map.getLayer(ROAD_EDGE_LAYER_ID)) {
    map.setLayoutProperty(ROAD_EDGE_LAYER_ID, "visibility", visibility);
  }

  if (map.getLayer(ROAD_NODE_LAYER_ID)) {
    map.setLayoutProperty(ROAD_NODE_LAYER_ID, "visibility", visibility);
  }
}

function clearRoadGraph(map: maplibregl.Map) {
  getGeoJsonSource(map, ROAD_EDGE_SOURCE_ID)?.setData({ type: "FeatureCollection", features: [] });
  getGeoJsonSource(map, ROAD_NODE_SOURCE_ID)?.setData({ type: "FeatureCollection", features: [] });
}

function clearSelectionRadius(map: maplibregl.Map) {
  getGeoJsonSource(map, SELECTION_RADIUS_SOURCE_ID)?.setData({
    type: "FeatureCollection",
    features: [],
  });
}

function setSelectionRadius(map: maplibregl.Map, circle: [number, number][]) {
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
  markerRef: React.MutableRefObject<maplibregl.Marker | null>,
  lngLat: [number, number]
) {
  if (!markerRef.current) {
    markerRef.current = new maplibregl.Marker({ color: "#ef4444" });
  }

  markerRef.current.setLngLat(lngLat).addTo(map);
}

function setRoadGraphData(map: maplibregl.Map, graph: RoadGraph) {
  getGeoJsonSource(map, ROAD_EDGE_SOURCE_ID)?.setData(roadGraphToEdgeFeatureCollection(graph));
  getGeoJsonSource(map, ROAD_NODE_SOURCE_ID)?.setData(roadGraphToNodeFeatureCollection(graph));
}

export function MapContainer({
  mapStyle = "streets",
  selectionRadiusKm,
}: MapContainerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const initialMapStyleRef = useRef(mapStyle);
  const roadGraphRef = useRef<RoadGraph | null>(null);
  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const selectionCircleRef = useRef<[number, number][] | null>(null);
  const clickAbortControllerRef = useRef<AbortController | null>(null);
  const lastClickPointRef = useRef<[number, number] | null>(null);
  const effectiveRadiusKm = selectionRadiusKm ?? SELECTION_RADIUS_KM;
  const radiusKmRef = useRef(effectiveRadiusKm);

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
        const nearestNode = await getNearestNode(
          center[1],
          center[0],
          radiusKm,
          abortController.signal
        );

        if (abortController.signal.aborted) {
          return;
        }

        if (!nearestNode) {
          startMarkerRef.current?.remove();
          startMarkerRef.current = null;
          selectionCircleRef.current = null;
          clearSelectionRadius(map);
          roadGraphRef.current = null;
          clearRoadGraph(map);
          setRoadGraphLayerVisibility(map, false);
          return;
        }

        setStartMarker(map, startMarkerRef, center);

        const circle = createGeoJSONCircle(center, radiusKm);
        selectionCircleRef.current = circle;
        setSelectionRadius(map, circle);

        const graph = await getMapGraph(
          getBoundingBoxFromPolygon(circle),
          abortController.signal
        );

        if (abortController.signal.aborted) {
          return;
        }

        const filteredGraph = filterRoadGraphToRadius(graph, center, radiusKm);
        roadGraphRef.current = filteredGraph;
        setRoadGraphData(map, filteredGraph);
        setRoadGraphLayerVisibility(map, true);
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error("Failed to resolve the nearest road node", error);
        }
      } finally {
        if (clickAbortControllerRef.current === abortController) {
          clickAbortControllerRef.current = null;
        }
      }
    },
    [
      clearRoadGraph,
      clearSelectionRadius,
      createGeoJSONCircle,
      filterRoadGraphToRadius,
      getBoundingBoxFromPolygon,
      getMapGraph,
      getNearestNode,
      setRoadGraphData,
      setRoadGraphLayerVisibility,
      setSelectionRadius,
      setStartMarker,
    ]
  );

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

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: false }),
      "top-right"
    );

    mapRef.current = map;
    setMapInstance(map);

    const syncOverlayState = () => {
      ensureRoadGraphLayers(map);

      if (roadGraphRef.current) {
        setRoadGraphData(map, roadGraphRef.current);
        setRoadGraphLayerVisibility(map, true);
      } else {
        clearRoadGraph(map);
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

    const handleLoad = () => {
      syncOverlayState();
    };

    const handleStyleData = () => {
      if (map.isStyleLoaded()) {
        syncOverlayState();
      }
    };

    map.on("click", handleMapClick);
    map.on("load", handleLoad);
    map.on("styledata", handleStyleData);

    return () => {
      clickAbortControllerRef.current?.abort();
      map.off("click", handleMapClick);
      map.off("load", handleLoad);
      map.off("styledata", handleStyleData);
      startMarkerRef.current?.remove();
      startMarkerRef.current = null;
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

  return <div ref={mapContainerRef} className="h-full w-full" />;
}
