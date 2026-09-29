import { expect, test } from "bun:test";
import "bun-match-svg";
import {
  getSvgFromGraphicsObject,
  stackGraphicsHorizontally,
  type GraphicsObject,
} from "graphics-debug";
import {
  createFragmentedConnectedPadNeckdownProblem,
  FRAGMENTED_PAD_ID,
  FRAGMENTED_PAD_MINIMUM_TRACE_WIDTH,
} from "../fixtures/fragmented-connected-pad-neckdown/createFragmentedConnectedPadNeckdownProblem";
import { PowerTraceExpanderSolver } from "../src";
import type { SimpleRouteJson, SimplifiedPcbTrace } from "../src/types";

const getMinimumWireWidth = (trace: SimplifiedPcbTrace) =>
  Math.min(
    ...trace.route.flatMap((point) =>
      point.route_type === "wire" ? [point.width] : [],
    ),
  );

const getWireSegments = (trace: SimplifiedPcbTrace) =>
  trace.route.slice(1).flatMap((end, routeIndex) => {
    const start = trace.route[routeIndex];
    if (start?.route_type !== "wire" || end.route_type !== "wire") return [];
    return [
      {
        start,
        end,
        width: start.width,
        length: Math.hypot(end.x - start.x, end.y - start.y),
      },
    ];
  });

const drawFragmentedPadTrace = ({
  problem,
  trace,
  outputMinimumWidth,
}: {
  problem: SimpleRouteJson;
  trace: SimplifiedPcbTrace;
  outputMinimumWidth?: number;
}): GraphicsObject => {
  const terminalViewMaximumX = 0.8;
  const visibleTraceLines = trace.route.slice(1).flatMap((end, routeIndex) => {
    const start = trace.route[routeIndex];
    if (
      start?.route_type !== "wire" ||
      end.route_type !== "wire" ||
      start.x >= terminalViewMaximumX
    ) {
      return [];
    }
    const visibleEnd = {
      ...end,
      x: Math.min(end.x, terminalViewMaximumX),
    };
    const belowMinimum = start.width < problem.minTraceWidth;
    return [
      {
        points: [start, visibleEnd],
        strokeWidth: start.width,
        strokeColor: belowMinimum
          ? "#dc2626"
          : outputMinimumWidth
            ? "rgba(124, 58, 237, 0.22)"
            : "#2563eb",
      },
    ];
  });
  const fragmentedPadObstacles = problem.obstacles.filter((obstacle) =>
    obstacle.connectedTo.includes(FRAGMENTED_PAD_ID),
  );

  return {
    coordinateSystem: "cartesian",
    rects: [
      {
        center: { x: 0.2, y: 0 },
        width: 1.4,
        height: 1,
        fill: "transparent",
        stroke: "#cbd5e1",
      },
      ...fragmentedPadObstacles.map((obstacle) => ({
        center: obstacle.center,
        width: obstacle.width,
        height: obstacle.height,
        fill: "rgba(59, 130, 246, 0.20)",
        stroke: "#2563eb",
      })),
      {
        center: { x: 0, y: 0 },
        width: 0.6,
        height: 0.3,
        fill: "transparent",
        stroke: "#1e3a8a",
      },
    ],
    lines: [
      ...(outputMinimumWidth
        ? [
            {
              points: [
                { x: 0, y: 0.01 },
                { x: 0.3, y: 0.01 },
              ],
              strokeWidth: problem.minTraceWidth,
              strokeColor: "rgba(37, 99, 235, 0.22)",
            },
          ]
        : []),
      ...visibleTraceLines,
    ],
    circles: outputMinimumWidth
      ? [
          {
            center: { x: 0, y: 0.01 },
            radius: problem.minTraceWidth / 2,
            fill: "transparent",
            stroke: "#1d4ed8",
          },
          {
            center: { x: 0, y: 0.01 },
            radius: outputMinimumWidth / 2,
            fill: "#dc2626",
            stroke: "#991b1b",
          },
        ]
      : [],
    texts: [
      {
        x: 0.2,
        y: 0.4,
        text: "SAME PHYSICAL PAD • 3 CONNECTED RECTANGLES",
        fontSize: 0.075,
        color: "#1e3a8a",
      },
      ...fragmentedPadObstacles.map((obstacle, fragmentIndex) => ({
        x: -0.24,
        y: obstacle.center.y,
        text: `${fragmentIndex + 1}`,
        fontSize: 0.05,
        color: "#1e3a8a",
      })),
      {
        x: 0.2,
        y: -0.34,
        text: outputMinimumWidth
          ? `BLUE = ${problem.minTraceWidth.toFixed(4)} mm REQUIRED MINIMUM`
          : `INPUT TRACE = ${problem.minTraceWidth.toFixed(4)} mm`,
        fontSize: 0.07,
        color: "#1d4ed8",
      },
      ...(outputMinimumWidth
        ? [
            {
              x: 0.2,
              y: -0.43,
              text: `RED = ${outputMinimumWidth.toFixed(4)} mm EMITTED SEGMENT`,
              fontSize: 0.07,
              color: "#991b1b",
            },
          ]
        : []),
    ],
  };
};

test("reproduces a sub-minimum terminal neckdown on a fragmented connected pad", async () => {
  const fragmentedPadInput = createFragmentedConnectedPadNeckdownProblem();
  const inputTrace = fragmentedPadInput.traces![0]!;
  const solver = new PowerTraceExpanderSolver(
    structuredClone(fragmentedPadInput),
    { allowNewVias: false },
  );

  solver.solve();

  const outputTrace = solver.getOutput()[0]!;
  const minimumOutputWidth = getMinimumWireWidth(outputTrace);
  const inputSegments = getWireSegments(inputTrace);
  const outputSegments = getWireSegments(outputTrace);
  const belowMinimumSegments = outputSegments.filter(
    (segment) => segment.width < fragmentedPadInput.minTraceWidth,
  );
  const materialBelowMinimumSegments = belowMinimumSegments.filter(
    (segment) => segment.length > 0.001,
  );
  const terminal = fragmentedPadInput.connections[0]!.pointsToConnect[0]!;
  const minimumTraceRadius = FRAGMENTED_PAD_MINIMUM_TRACE_WIDTH / 2;
  const fragmentedPadObstacles = fragmentedPadInput.obstacles.filter(
    (obstacle) => obstacle.connectedTo.includes(FRAGMENTED_PAD_ID),
  );

  expect(solver.solved).toBe(true);
  expect(solver.failed).toBe(false);
  expect(solver.stats.repairedPadNeckSegmentCount).toBe(1);
  expect(fragmentedPadObstacles).toHaveLength(3);
  expect(
    fragmentedPadObstacles.every((obstacle) =>
      obstacle.connectedTo.includes(FRAGMENTED_PAD_ID),
    ),
  ).toBe(true);
  expect(Math.abs(terminal.x) + minimumTraceRadius).toBeLessThanOrEqual(0.3);
  expect(Math.abs(terminal.y) + minimumTraceRadius).toBeLessThanOrEqual(0.15);
  expect(
    inputSegments.every(
      (segment) => segment.width >= fragmentedPadInput.minTraceWidth,
    ),
  ).toBe(true);
  expect(minimumOutputWidth).toBeCloseTo(0.08, 6);
  expect(minimumOutputWidth).toBeLessThan(fragmentedPadInput.minTraceWidth);
  expect(belowMinimumSegments.length).toBeGreaterThan(0);
  expect(
    belowMinimumSegments.every(
      (segment) => Math.abs(segment.width - 0.08) < 1e-6,
    ),
  ).toBe(true);
  expect(materialBelowMinimumSegments).toHaveLength(1);
  expect(materialBelowMinimumSegments[0]!.width).toBeCloseTo(0.08, 6);
  expect(materialBelowMinimumSegments[0]!.length).toBeGreaterThan(0.29);

  const svg = getSvgFromGraphicsObject(
    stackGraphicsHorizontally(
      [
        drawFragmentedPadTrace({
          problem: fragmentedPadInput,
          trace: inputTrace,
        }),
        drawFragmentedPadTrace({
          problem: fragmentedPadInput,
          trace: outputTrace,
          outputMinimumWidth: minimumOutputWidth,
        }),
      ],
      {
        titles: ["BEFORE — 0.1500 mm INPUT", "AFTER — 0.0800 mm OUTPUT"],
      },
    ),
    { backgroundColor: "white", svgWidth: 1400, svgHeight: 460 },
  );
  await expect(svg).toMatchSvgSnapshot(import.meta.path);
});
