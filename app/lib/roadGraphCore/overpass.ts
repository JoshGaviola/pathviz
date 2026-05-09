import {
  createGeoJSONCircle,
  getBoundingBoxFromPolygon,
} from "./geometry";
import {
  OverpassError,
  type OverpassNode,
  type OverpassResponse,
} from "./types";

const OVERPASS_API_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
];

const HIGHWAY_EXCLUDE = ["footway", "street_lamp", "steps", "pedestrian", "track", "path"];

function createOverpassQuery(
  boundingBox: [{ latitude: number; longitude: number }, { latitude: number; longitude: number }]
): string {
  const exclusion = HIGHWAY_EXCLUDE.map((entry) => `[highway!="${entry}"]`).join("");

  return `
[out:json];(
    way[highway]${exclusion}[footway!="*"]
    (${boundingBox[0].latitude},${boundingBox[0].longitude},${boundingBox[1].latitude},${boundingBox[1].longitude});
    node(w);
);
out skel;`;
}

async function fetchOverpassResponse(query: string, signal?: AbortSignal): Promise<Response> {
  let lastError: unknown = null;

  for (const endpoint of OVERPASS_API_URLS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: query,
        signal,
      });

      if (!response.ok) {
        lastError = new OverpassError(
          response.status,
          `Overpass request failed with status ${response.status} from ${endpoint}`
        );

        if (response.status === 429) {
          throw lastError;
        }

        continue;
      }

      return response;
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }

      lastError = error;
    }
  }

  if (lastError instanceof OverpassError) {
    throw lastError;
  }

  throw new Error("Unable to load data from any Overpass endpoint");
}

export function fetchOverpassData(
  boundingBox: [{ latitude: number; longitude: number }, { latitude: number; longitude: number }],
  signal?: AbortSignal
): Promise<Response> {
  const query = createOverpassQuery(boundingBox);
  return fetchOverpassResponse(query, signal);
}

export async function getNearestNode(
  latitude: number,
  longitude: number,
  radiusKm = 2,
  signal?: AbortSignal
): Promise<OverpassNode | null> {
  const circle = createGeoJSONCircle([longitude, latitude], radiusKm);
  const boundingBox = getBoundingBoxFromPolygon(circle);
  const response = await fetchOverpassData(boundingBox, signal);
  const data = (await response.json()) as OverpassResponse;

  let result: OverpassNode | null = null;

  for (const node of data.elements) {
    if (node.type !== "node") {
      continue;
    }

    if (!result) {
      result = node;
      continue;
    }

    const newLength = Math.hypot(node.lat - latitude, node.lon - longitude);
    const resultLength = Math.hypot(result.lat - latitude, result.lon - longitude);

    if (newLength < resultLength) {
      result = node;
    }
  }

  return result;
}
