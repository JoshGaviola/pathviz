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
const OVERPASS_HEADERS: Record<string, string> = {
  "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
  accept: "application/json",
  "user-agent": "PathViz/1.0",
};

function formatBoundingBoxParam(
  boundingBox: [{ latitude: number; longitude: number }, { latitude: number; longitude: number }]
): string {
  return [
    boundingBox[0].latitude,
    boundingBox[0].longitude,
    boundingBox[1].latitude,
    boundingBox[1].longitude,
  ].join(",");
}

function getRoadGraphApiUrl(
  boundingBox: [{ latitude: number; longitude: number }, { latitude: number; longitude: number }]
): string {
  const params = new URLSearchParams({ bbox: formatBoundingBoxParam(boundingBox) });
  return `/api/road-graph?${params.toString()}`;
}

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

  const REQUEST_TIMEOUT_MS = 15000; // per-endpoint timeout
  const RETRY_ON_429_DELAY_MS = 2000;

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  async function fetchWithTimeout(endpoint: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const onOuterAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeout);
        controller.abort();
      } else {
        signal.addEventListener("abort", onOuterAbort);
      }
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: OVERPASS_HEADERS,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeout);
      if (signal) {
        try {
          signal.removeEventListener("abort", onOuterAbort);
        } catch {
          /* ignore */
        }
      }
    }
  }

  for (const endpoint of OVERPASS_API_URLS) {
    try {
      const response = await fetchWithTimeout(endpoint);

      if (!response.ok) {
        lastError = new OverpassError(
          response.status,
          `Overpass request failed with status ${response.status} from ${endpoint}`
        );

        // For rate-limited responses, wait a moment and try the next endpoint
        if (response.status === 429) {
          await delay(RETRY_ON_429_DELAY_MS);
          continue;
        }

        continue;
      }

      return response;
    } catch (error) {
      // If the outer signal aborted, propagate immediately so callers can handle cancellation.
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
  if (typeof window !== "undefined") {
    return fetch(getRoadGraphApiUrl(boundingBox), { signal });
  }

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
