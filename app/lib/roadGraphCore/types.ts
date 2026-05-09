export type Coordinate = [number, number];

export interface RoadNode {
  id: string;
  lng: number;
  lat: number;
  neighborIds: string[];
}

export interface RoadEdge {
  from: string;
  to: string;
  distanceMeters: number;
}

export interface RoadGraph {
  nodes: Record<string, RoadNode>;
  edges: RoadEdge[];
}

export interface BoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface OverpassElementBase {
  id: number;
  type: "node" | "way";
}

export interface OverpassNode extends OverpassElementBase {
  type: "node";
  lat: number;
  lon: number;
}

export interface OverpassWay extends OverpassElementBase {
  type: "way";
  nodes: number[];
}

export interface OverpassResponse {
  elements: Array<OverpassNode | OverpassWay>;
}

export class OverpassError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "OverpassError";
    this.status = status;
  }
}
