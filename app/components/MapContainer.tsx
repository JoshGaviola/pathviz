import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { darkMapStyle } from "@/app/lib/mapStyles";

export function MapContainer() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: darkMapStyle,
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

  return <div ref={mapContainerRef} className="h-full w-full" />;
}
