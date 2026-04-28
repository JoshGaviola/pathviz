import { type StyleSpecification } from "maplibre-gl";

export const darkMapStyle: StyleSpecification = {
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

export const lightMapStyle: StyleSpecification = {
  version: 8,
  sources: {
    cartoLight: {
      type: "raster",
      tiles: ["https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    {
      id: "cartoLight",
      type: "raster",
      source: "cartoLight",
    },
  ],
} as const;

export const streetsMapStyle: StyleSpecification = {
  version: 8,
  sources: {
    cartoVoyager: {
      type: "raster",
      tiles: [
        "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    {
      id: "cartoVoyager",
      type: "raster",
      source: "cartoVoyager",
    },
  ],
} as const;

export type MapStyleType = "dark" | "light" | "streets";

export function getMapStyle(style: MapStyleType): StyleSpecification {
  if (style === "light") {
    return lightMapStyle;
  }

  if (style === "streets") {
    return streetsMapStyle;
  }

  return darkMapStyle;
}
