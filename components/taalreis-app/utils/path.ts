import { PAD } from "../constants";

export function cubicBez(p0: number, p1: number, p2: number, p3: number, t: number) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

export function midpointOnPath(index: number) {
  const y0 = index * PAD.rowH + PAD.nodeY0;
  const y1 = (index + 1) * PAD.rowH + PAD.nodeY0;
  const x0 = index % 2 === 0 ? PAD.xLeft : PAD.xRight;
  const x1 = (index + 1) % 2 === 0 ? PAD.xLeft : PAD.xRight;
  const midY = (y0 + y1) / 2;
  return [cubicBez(x0, x0, x1, x1, 0.5), cubicBez(y0, midY, midY, y1, 0.5)] as const;
}

export function buildPath(count: number, shadow: boolean) {
  const points: Array<[number, number]> = [];

  for (let index = 0; index < count; index += 1) {
    const y = index * PAD.rowH + PAD.nodeY0;
    const x = index % 2 === 0 ? PAD.xLeft : PAD.xRight;
    points.push([x + (shadow ? 2 : 0), y + (shadow ? 2 : 0)]);
  }

  if (points.length < 2) {
    return "";
  }

  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const curr = points[index];
    const midY = (prev[1] + curr[1]) / 2;
    d += ` C ${prev[0]} ${midY}, ${curr[0]} ${midY}, ${curr[0]} ${curr[1]}`;
  }

  return d;
}
