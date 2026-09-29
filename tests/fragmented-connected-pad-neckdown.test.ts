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
}): GraphicsObject => ({
  coordinateSystem: "cartesian",
  rects: [
    {
      center: { x: 1.5, y: 0 },
      width: 5,
      height: 2,
      fill: "transparent",
      stroke: "#cbd5e1",
    },
    {
      center: { x: 0, y: 0 },
      width: 0.6,
      height: 0.3,
      fill: "transparent",
      stroke: "#1d4ed8",
      label: "one physical pad",
    },
    ...problem.obstacles.map((obstacle) => ({
      center: obstacle.center,
      width: obstacle.width,
      height: obstacle.height,
      fill: obstacle.connectedTo.includes(FRAGMENTED_PAD_ID)
        ? "rgba(59, 130, 246, 0.22)"
        : "rgba(100, 116, 139, 0.18)",
      stroke: obstacle.connectedTo.includes(FRAGMENTED_PAD_ID)
        ? "rgba(29, 78, 216, 0.45)"
        : "rgba(71, 85, 105, 0.45)",
    })),
  ],
  lines: trace.route.slice(1).flatMap((end, routeIndex) => {
    const start = trace.route[routeIndex];
    if (start?.route_type !== "wire" || end.route_type !== "wire") return [];
    const belowMinimum = start.width < problem.minTraceWidth;
    return [
      {
        points: [start, end],
        strokeWidth: start.width,
        strokeColor: belowMinimum
          ? "#dc2626"
          : outputMinimumWidth
            ? "rgba(37, 99, 235, 0.40)"
            : "#2563eb",
      },
    ];
  }),
  circles: [
    {
      center: { x: 0, y: 0.01 },
      radius: problem.minTraceWidth / 2,
      fill: "rgba(37, 99, 235, 0.18)",
      stroke: "#1d4ed8",
      label: `${problem.minTraceWidth.toFixed(4)} mm minimum`,
    },
    ...(outputMinimumWidth
      ? [
          {
            center: { x: 0, y: 0.01 },
            radius: outputMinimumWidth / 2,
            fill: "rgba(220, 38, 38, 0.55)",
            stroke: "#991b1b",
            label: `${outputMinimumWidth.toFixed(4)} mm output`,
          },
        ]
      : []),
  ],
  texts: [
    {
      x: 0,
      y: 0.45,
      text: "3 rectangles • one pcb_smtpad identity",
      fontSize: 0.13,
      color: "#1e3a8a",
    },
    {
      x: 1.5,
      y: -0.65,
      text: outputMinimumWidth
        ? `Output minimum: ${outputMinimumWidth.toFixed(4)} mm`
        : `Configured minimum: ${problem.minTraceWidth.toFixed(4)} mm`,
      fontSize: 0.18,
      color: outputMinimumWidth ? "#991b1b" : "#1e3a8a",
    },
  ],
});

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
        titles: [
          "Input: 0.1500 mm fits in the pad union",
          "Output: terminal reduced to 0.0800 mm",
        ],
      },
    ),
    { backgroundColor: "white", svgWidth: 1200, svgHeight: 420 },
  );
  await expect(svg).toMatchSvgSnapshot(import.meta.path);
});
