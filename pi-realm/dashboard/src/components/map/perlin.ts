// Browser-side Perlin noise — mirrors src/map/terrain.ts
// For rendering terrain in the dashboard

function buildPermutation(seed: number): Uint8Array {
  const p = Uint8Array.from({ length: 256 }, (_, i) => i);
  let s = seed;
  for (let i = 255; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j]!, p[i]!];
  }
  return p;
}

function fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a: number, b: number, t: number) { return a + t * (b - a); }

function grad(hash: number, x: number, y: number): number {
  const h = hash & 3;
  const u = h < 2 ? x : y;
  const v = h < 2 ? y : x;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function perlin2D(x: number, y: number, perm: Uint8Array): number {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);
  const aa = perm[perm[xi]! + yi]!;
  const ab = perm[perm[xi]! + yi + 1]!;
  const ba = perm[perm[xi + 1]! + yi]!;
  const bb = perm[perm[xi + 1]! + yi + 1]!;
  return lerp(
    lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
    lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
    v,
  );
}

function octaveNoise(x: number, y: number, octaves: number, perm: Uint8Array): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * perlin2D(x * frequency, y * frequency, perm);
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / maxValue;
}

export interface TerrainSample {
  height: number;
  type: string;
  slope: number;
}

const TERRAIN_TYPES: Array<{ name: string; test: (h: number, s: number) => boolean; color: string; darkColor: string }> = [
  { name: 'ocean',    test: (h) => h < -0.4,         color: '#1e3a5f', darkColor: '#0d1f33' },
  { name: 'water',    test: (h) => h < -0.2,         color: '#2d5f8a', darkColor: '#1a3d5e' },
  { name: 'beach',    test: (h, s) => h < -0.1 && s < 0.1, color: '#e8d5a3', darkColor: '#c4a86a' },
  { name: 'snow',     test: (h, s) => h > 0.6 && s > 0.3, color: '#f0f0f5', darkColor: '#d8d8e0' },
  { name: 'mountain', test: (_h, s) => s > 0.3,       color: '#8b7355', darkColor: '#5c4a36' },
  { name: 'hills',    test: (_h, s) => s > 0.15,      color: '#7d9e5c', darkColor: '#55703d' },
  { name: 'forest',   test: (h, _s) => h > 0,         color: '#3d7840', darkColor: '#265228' },
  { name: 'plains',   test: () => true,               color: '#8fbc6a', darkColor: '#6b9348' },
];

export function sampleTerrain(x: number, y: number, seed = 42): TerrainSample {
  const perm = buildPermutation(seed);
  const scale = 0.002;
  const nx = x * scale;
  const ny = y * scale;
  const height = octaveNoise(nx, ny, 6, perm);
  const eps = 0.01;
  const dx = octaveNoise(nx + eps, ny, 6, perm);
  const dy = octaveNoise(nx, ny + eps, 6, perm);
  const slope = Math.min(1, Math.sqrt((dx - height) ** 2 + (dy - height) ** 2) / eps * 5);
  const type = TERRAIN_TYPES.find((t) => t.test(height, slope))?.name ?? 'plains';
  return { height, type, slope };
}

export function getTerrainColor(type: string, dark = false): string {
  return TERRAIN_TYPES.find((t) => t.name === type)?.[dark ? 'darkColor' : 'color'] ?? '#8fbc6a';
}

export { buildPermutation, octaveNoise };
