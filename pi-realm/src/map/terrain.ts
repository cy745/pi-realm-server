// Perlin noise terrain generator — infinite, deterministic
// Every coordinate yields consistent terrain via seeded noise

export const CHUNK_SIZE = 10_000; // 10km per chunk
const GEN_RANGE = 1_000; // Generate adjacent chunks when within 1km of boundary

export type TerrainType = 'ocean' | 'water' | 'beach' | 'plains' | 'forest' | 'hills' | 'mountain' | 'snow';

export interface TerrainSample {
  height: number;     // -1 to 1
  type: TerrainType;
  slope: number;      // 0-1
  humidity: number;   // 0-1
}

export interface ChunkCoord {
  cx: number;
  cy: number;
}

export function toChunk(worldX: number, worldY: number): ChunkCoord {
  return {
    cx: Math.floor(worldX / CHUNK_SIZE),
    cy: Math.floor(worldY / CHUNK_SIZE),
  };
}

export function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

export function isNearChunkEdge(x: number, y: number): boolean {
  const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const localY = ((y % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return localX < GEN_RANGE || localX > CHUNK_SIZE - GEN_RANGE ||
         localY < GEN_RANGE || localY > CHUNK_SIZE - GEN_RANGE;
}

export function getAdjacentChunks(cx: number, cy: number): ChunkCoord[] {
  const coords: ChunkCoord[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      coords.push({ cx: cx + dx, cy: cy + dy });
    }
  }
  return coords;
}

// ── Perlin Noise ──────────────────────────────────

// Permutation table
const P_SIZE = 256;
function buildPermutation(seed: number): Uint8Array {
  const p = Uint8Array.from({ length: P_SIZE }, (_, i) => i);
  // Fisher-Yates shuffle with seeded RNG
  let s = seed;
  for (let i = P_SIZE - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j]!, p[i]!];
  }
  return p;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

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

  const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
  const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
  return lerp(x1, x2, v);
}

// Octave noise (multiple frequencies)
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

// ── Terrain Sampler ───────────────────────────────

export class TerrainSampler {
  private perm: Uint8Array;
  private seed: number;

  constructor(seed: number = 42) {
    this.seed = seed;
    this.perm = buildPermutation(seed);
  }

  /** Sample terrain at world coordinates (meters) */
  sample(x: number, y: number): TerrainSample {
    // Scale: 1 noise unit = 500m (adjusts terrain frequency)
    const scale = 0.002;
    const nx = x * scale;
    const ny = y * scale;

    const height = octaveNoise(nx, ny, 6, this.perm);

    // Slope: derivative approximation
    const eps = 0.01;
    const dx = octaveNoise(nx + eps, ny, 6, this.perm);
    const dy = octaveNoise(nx, ny + eps, 6, this.perm);
    const slope = Math.min(1, Math.sqrt((dx - height) ** 2 + (dy - height) ** 2) / eps * 5);

    // Humidity: separate noise octave
    const humiditySeed = buildPermutation(this.seed + 1);
    const humidity = (octaveNoise(nx * 0.5, ny * 0.5, 4, humiditySeed) + 1) / 2;

    return {
      height,
      type: this.heightToType(height, slope, humidity),
      slope,
      humidity,
    };
  }

  /** Sample height only (faster, for bulk ops) */
  sampleHeight(x: number, y: number): number {
    const scale = 0.002;
    return octaveNoise(x * scale, y * scale, 6, this.perm);
  }

  private heightToType(height: number, slope: number, humidity: number): TerrainType {
    if (height < -0.4) return 'ocean';
    if (height < -0.2) return 'water';
    if (height < -0.1 && slope < 0.1) return 'beach';
    if (slope > 0.3) {
      if (height > 0.6) return 'snow';
      return 'mountain';
    }
    if (slope > 0.15) return 'hills';
    if (humidity > 0.5 && height > 0) return 'forest';
    return 'plains';
  }
}

/** Check if terrain is traversable */
export function isTraversable(type: TerrainType): boolean {
  return type !== 'ocean' && type !== 'water';
}

/** Terrain movement cost multiplier */
export function terrainSpeedFactor(type: TerrainType): number {
  switch (type) {
    case 'plains': return 1.0;
    case 'forest': return 0.6;
    case 'hills': return 0.5;
    case 'beach': return 0.9;
    case 'mountain': return 0.3;
    case 'snow': return 0.4;
    case 'water': return 0.1;
    case 'ocean': return 0;
  }
}

export function terrainStaminaCost(type: TerrainType): number {
  switch (type) {
    case 'plains': return 1.0;
    case 'forest': return 1.8;
    case 'hills': return 2.5;
    case 'beach': return 1.2;
    case 'mountain': return 4.0;
    case 'snow': return 3.0;
    case 'water': return 0.5;
    case 'ocean': return 0;
  }
}
