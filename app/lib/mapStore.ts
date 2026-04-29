import maplibregl from "maplibre-gl";

let mapInstance: maplibregl.Map | null = null;

export const setMapInstance = (map: maplibregl.Map) => {
  mapInstance = map;
};

export const getMapInstance = () => {
  return mapInstance;
};