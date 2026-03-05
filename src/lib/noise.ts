export function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smoothstep(x - ix), fy = smoothstep(y - iy);
  return (
    hash2(ix,     iy    ) * (1 - fx) * (1 - fy) +
    hash2(ix + 1, iy    ) * fx       * (1 - fy) +
    hash2(ix,     iy + 1) * (1 - fx) * fy +
    hash2(ix + 1, iy + 1) * fx       * fy
  );
}

export function fbm(x: number, y: number): number {
  return (
    valueNoise(x,     y    ) * 0.500 +
    valueNoise(x * 2, y * 2) * 0.250 +
    valueNoise(x * 4, y * 4) * 0.125 +
    valueNoise(x * 8, y * 8) * 0.063
  ) / 0.938;
}
