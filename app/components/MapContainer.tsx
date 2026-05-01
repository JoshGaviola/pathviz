import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { getMapStyle, type MapStyleType } from "@/app/lib/mapStyles";
import { setMapInstance } from "../lib/mapStore";
import {
  fetchRoadGraphForBounds,
  findNearestRoadNode,
  roadGraphToEdgeFeatureCollection,
  roadGraphToNodeFeatureCollection,
  type RoadGraph,
} from "../lib/roadGraph";

interface MapContainerProps {
  mapStyle?: MapStyleType;
}

const ROAD_NODE_SOURCE_ID = "road-node-source";
const ROAD_EDGE_SOURCE_ID = "road-edge-source";
const ROAD_NODE_LAYER_ID = "road-node-layer";
const ROAD_EDGE_LAYER_ID = "road-edge-layer";
const MIN_GRAPH_ZOOM = 12;
const REQUEST_DEBOUNCE_MS = 900;

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
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.2, 14, 5.8, 18, 8.2],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 16, 2],
        "circle-opacity": 1,
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

export function MapContainer({ mapStyle = "streets" }: MapContainerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const initialMapStyleRef = useRef(mapStyle);
  const roadGraphRef = useRef<RoadGraph | null>(null);
  const pendingSnapRef = useRef<maplibregl.LngLat | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const lastRequestKeyRef = useRef<string | null>(null);
  const markerARef = useRef<maplibregl.Marker | null>(null);
  const markerBRef = useRef<maplibregl.Marker | null>(null);
  const pointARef = useRef<maplibregl.LngLat | null>(null);
  const pointBRef = useRef<maplibregl.LngLat | null>(null);
  const isLoadingRef = useRef(false);

  let isActive = null;

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

    const snapMarkerToNearestNode = (lngLat: maplibregl.LngLatLike, graph: RoadGraph) => {
      const clicked = maplibregl.LngLat.convert(lngLat);
      const nearestNode = findNearestRoadNode(graph, clicked.lng, clicked.lat);
      

      if(!nearestNode) return;

      if(!markerARef.current) {
        markerARef.current = new maplibregl.Marker({ color: "#f50b0b" })
          .setLngLat([nearestNode.lng, nearestNode.lat])
          .addTo(map);
        pointARef.current = new maplibregl.LngLat(nearestNode.lng, nearestNode.lat);
      }else{
        markerBRef.current?.remove();
        markerBRef.current = new maplibregl.Marker({ color: "#0b8df5" })
          .setLngLat([nearestNode.lng, nearestNode.lat])
          .addTo(map);
        pointBRef.current = new maplibregl.LngLat(nearestNode.lng, nearestNode.lat);
      }

      /*
        markerARef.current.getElement().addEventListener("contextmenu", (e) => {
           e.preventDefault();
           isActive = true;

           if(isActive) {{

           }
       });
        markerBRef.current?.getElement().addEventListener("contextmenu", (e) => {
           e.preventDefault();
          alert("Marker B: " + pointBRef.current?.toString());
       });
       */

      // marker.setLngLat([nearestNode.lng, nearestNode.lat]).addTo(map);
    };      
    const loadRoadGraph = async () => {
      if (!map.isStyleLoaded()) return;

        if (map.getZoom() < MIN_GRAPH_ZOOM) {
        roadGraphRef.current = null;
        clearRoadGraph(map);
        setRoadGraphLayerVisibility(map, false);
        return;
      }

      if (isLoadingRef.current) return;
      isLoadingRef.current = true;

      const bounds = map.getBounds();

      const requestKey = [
        Math.floor(map.getZoom()),
        bounds.getWest().toFixed(2),
        bounds.getSouth().toFixed(2),
        bounds.getEast().toFixed(2),
        bounds.getNorth().toFixed(2),
      ].join(":");

      if (requestKey === lastRequestKeyRef.current && roadGraphRef.current) {
        setRoadGraphLayerVisibility(map, true);

        if (pendingSnapRef.current) {
          snapMarkerToNearestNode(pendingSnapRef.current, roadGraphRef.current);
          pendingSnapRef.current = null;
        }

        isLoadingRef.current = false;
        return;
      }

      lastRequestKeyRef.current = requestKey;

      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = window.setTimeout(async () => {
        try {
          ensureRoadGraphLayers(map);

          const graph = await fetchRoadGraphForBounds(
            {
              west: bounds.getWest(),
              south: bounds.getSouth(),
              east: bounds.getEast(),
              north: bounds.getNorth(),
            },
            { signal: undefined, zoom: map.getZoom() }
          );

          roadGraphRef.current = graph;

          getGeoJsonSource(map, ROAD_EDGE_SOURCE_ID)?.setData(
            roadGraphToEdgeFeatureCollection(graph)
          );

          getGeoJsonSource(map, ROAD_NODE_SOURCE_ID)?.setData(
            roadGraphToNodeFeatureCollection(graph)
          );

          setRoadGraphLayerVisibility(map, true);

          if (pendingSnapRef.current) {
            snapMarkerToNearestNode(pendingSnapRef.current, graph);
            pendingSnapRef.current = null;
          }

        } catch (error) {
          console.error("Failed to load road graph", error);

          roadGraphRef.current = null;
          clearRoadGraph(map);
          setRoadGraphLayerVisibility(map, false);

        } finally {
          isLoadingRef.current = false;
        }
      }, REQUEST_DEBOUNCE_MS);
    };

    const onMapClick = (e: maplibregl.MapMouseEvent) => {
      if (roadGraphRef.current) {
        snapMarkerToNearestNode(e.lngLat, roadGraphRef.current);
        return;
      }

      pendingSnapRef.current = maplibregl.LngLat.convert(e.lngLat);

      if (map.getZoom() < MIN_GRAPH_ZOOM) {
        map.easeTo({ zoom: MIN_GRAPH_ZOOM, duration: 800 });
      } else {
        void loadRoadGraph();
      }
    };

    map.on("click", onMapClick);
    map.on("load", () => {
      ensureRoadGraphLayers(map);
      void loadRoadGraph();
    });
    map.on('styleimagemissing', (e) => {
      if (!e.id || e.id.startsWith('road') || e.id === '') return;

      console.warn('Missing image:', e.id);
    });
    map.on("moveend", () => void loadRoadGraph());
    map.on("styledata", () => {
      if (map.isStyleLoaded()) {
        ensureRoadGraphLayers(map);
        setRoadGraphLayerVisibility(map, true);
        void loadRoadGraph();
      }
    });

    return () => {
      map.off("click", onMapClick);
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    console.log("mounth");

    if (mapRef.current) {
      mapRef.current.setStyle(getMapStyle(mapStyle));
    }
  }, [mapStyle]);

  return <div ref={mapContainerRef} className="h-full w-full" />;
}
