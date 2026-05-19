import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OVERPASS_API_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
];

const HIGHWAY_EXCLUDE = ["footway", "street_lamp", "steps", "pedestrian", "track", "path"];

const OVERPASS_HEADERS: Record<string, string> = {
  "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
  accept: "application/json",
  "user-agent": process.env.OVERPASS_USER_AGENT ?? "PathViz/1.0",
};

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
  const REQUEST_TIMEOUT_MS = 15000;
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
      return await fetch(endpoint, {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: OVERPASS_HEADERS,
        signal: controller.signal,
      });
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
        lastError = new Error(`Overpass request failed with status ${response.status} from ${endpoint}`);
        if (response.status === 429) {
          await delay(RETRY_ON_429_DELAY_MS);
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

  throw lastError instanceof Error ? lastError : new Error("Unable to load data from any Overpass endpoint");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bboxParam = url.searchParams.get("bbox");

  if (!bboxParam) {
    return NextResponse.json({ error: "Missing bbox query parameter" }, { status: 400 });
  }

  const parts = bboxParam.split(",").map((value) => Number(value));
  if (parts.length !== 4 || parts.some((value) => Number.isNaN(value))) {
    return NextResponse.json({ error: "Invalid bbox query parameter" }, { status: 400 });
  }

  const [south, west, north, east] = parts;
  const query = createOverpassQuery([
    { latitude: south, longitude: west },
    { latitude: north, longitude: east },
  ]);

  try {
    const response = await fetchOverpassResponse(query, request.signal);
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load road graph";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
