import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { getMapStyle, type MapStyleType } from "@/app/lib/mapStyles";
import { setMapInstance } from "../lib/mapStore";

interface MapContainerProps {
  mapStyle?: MapStyleType;
}

export function MapContainer({ mapStyle = "streets" }: MapContainerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() =>   {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: getMapStyle(mapStyle),
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
    setMapInstance(map)
    

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setStyle(getMapStyle(mapStyle));
    }
  }, [mapStyle]);

  return  <div ref={mapContainerRef} className="h-full w-full" />;
}
