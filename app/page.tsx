"use client";

import maplibregl, { type StyleSpecification } from "maplibre-gl";
import { useEffect, useRef } from "react";

const mapStyle: StyleSpecification = {
  version: 8,
  sources: {
    cartoDark: {
      type: "raster",
      tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    {
      id: "cartoDark",
      type: "raster",
      source: "cartoDark",
    },
  ],
} as const;

export default function Home() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyle,
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

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={mapContainerRef} className="h-screen w-screen" />;
}
