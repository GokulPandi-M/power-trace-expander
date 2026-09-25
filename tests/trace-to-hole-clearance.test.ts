import { expect, test } from "bun:test";
import { SpatialObstacleIndex } from "../src/SpatialObstacleIndex";
import type { SimpleRouteJson } from "../src/types";

test("trace-to-hole clearance selects the hole margin without adding pad clearance", () => {
  for (const clearance of [0, 0.05, 0.2, 0.5]) {
    const srj: SimpleRouteJson = {
      layerCount: 2, minTraceWidth: 0.2, minTraceToPadEdgeClearance: 0.35,
      minTraceToHoleEdgeClearance: clearance,
      bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 }, connections: [],
      obstacles: [{ type: "rect", isHole: true, shape: "circle", center: { x: 0, y: 0 },
        width: 2, height: 2, layers: ["top", "bottom"], connectedTo: [] }],
    };
    const before = JSON.stringify(srj);
    const index = new SpatialObstacleIndex(srj, []);
    for (const layer of ["top", "bottom"]) {
      const query = {
        start: { x: -3, y: 1.1 + clearance + 0.001 },
        end: { x: 3, y: 1.1 + clearance + 0.001 },
        width: 0.2, layer, connectionNames: ["signal"],
      };
      expect(index.collides(query)).toBe(false);
      query.start.y -= 0.002;
      query.end.y -= 0.002;
      expect(index.collides(query)).toBe(true);
    }
    expect(JSON.stringify(srj)).toBe(before);
  }
});
