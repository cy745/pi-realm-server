// Browser-side Perlin noise — fixed slope + better terrain distribution

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

const TERRAIN_TYPES: Array<{ name: string; test: (h: number, s: number) => boolean; color: string }> = [
  { name: 'ocean',    test: (h) => h < -0.5,            color: '#1a3a5c' },
  { name: 'deepwater', test: (h) => h < -0.3,            color: '#2a5f8f' },
  { name: 'water',    test: (h) => h < -0.15,            color: '#4a8fbf' },
  { name: 'beach',    test: (h) => h < -0.05,             color: '#d4c496' },
  { name: 'plains',   test: (h) => Math.abs(h) < 0.15 && s < 0.1,  color: '#8fbc6a' },
  { name: 'grassland', test: (_h, s) => s < 0.08,         color: '#7dab5c' },
  { name: 'forest',   test: (h) => h > 0.05,             color: '#4a7a3b' },
  { name: 'hills',    test: (_h, s) => s < 0.2,          color: '#8a9a5c' },
  { name: 'highland', test: (h) => h > 0.3,               color: '#7a8a4c' },
  { name: 'mountain', test: (_h, s) => s < 0.4,          color: '#8b7b5a' },
  { name: 'peak',     test: (_h, s) => s >= 0.4,          color: '#9a8a7a' },
  { name: 'snow',     test: (h) => h > 0.5,               color: '#d8dce0' },
];

export function sampleTerrain(x: number, y: number, seed = 42): TerrainSample {
  const perm = buildPermutation(seed);
  // Lower frequency = larger terrain features
  const scale = 0.0005; // 1 noise unit per 2km
  const nx = x * scale;
  const ny = y * scale;

  // Height from 6-octave noise
  const height = octaveNoise(nx, ny, 6, perm);

  // Slope from 2nd octave for smoother slope
  const eps = 0.005;
  const dx = octaveNoise(nx + eps, ny, 4, perm);
  const dy = octaveNoise(nx, ny + eps, 4, perm);
  const slope = Math.min(1, Math.sqrt((dx - height) ** 2 + (dy - height) ** 2) / eps * 2);

  const type = TERRAIN_TYPES.find((t) => t.test(height, slope))?.name ?? 'plains';
  return { height, type, slope };
}

export function getTerrainColor(type: string): string {
  return TERRAIN_TYPES.find((t) => t.name === type)?.color ?? '#8fbc6a';
}

export { buildPermutation, octaveNoise };
