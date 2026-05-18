import { NextResponse } from "next/server";
import { buildRoadGraphFromOverpass } from "@/app/lib/roadGraphCore/build";
import { fetchOverpassData } from "@/app/lib/roadGraphCore/overpass";

type GraphBounds = [{ latitude: number; longitude: number }, { latitude: number; longitude: number }];

function parseBounds(value: string | null): GraphBounds | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as GraphBounds;
    if (!Array.isArray(parsed) || parsed.length !== 2) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const bounds = parseBounds(url.searchParams.get("bounds"));
  const precision = Number(url.searchParams.get("precision") ?? "6");

  if (!bounds) {
    return NextResponse.json({ error: "Invalid bounds" }, { status: 400 });
  }

  const safePrecision = Number.isFinite(precision) ? precision : 6;

  try {
    const response = await fetchOverpassData(bounds);
    const payload = await response.json();
    const graph = buildRoadGraphFromOverpass(payload, safePrecision);

    return NextResponse.json(graph, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load road graph", message: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}