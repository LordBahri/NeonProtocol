export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export interface Interpolatable {
  prevX: number;
  prevY: number;
  x: number;
  y: number;
  prevAngle: number;
  angle: number;
}

export function interpolatePosition(state: Interpolatable, alpha: number) {
  return {
    x: lerp(state.prevX, state.x, alpha),
    y: lerp(state.prevY, state.y, alpha),
    angle: lerpAngle(state.prevAngle, state.angle, alpha),
  };
}
