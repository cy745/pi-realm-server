// Terrain generation using simplex-noise
// Multi-frequency noise for elevation + moisture layers

import { createNoise2D } from 'simplex-noise';

export interface TerrainSample {
  height: number;   // -1 to 1
  type: string;
  slope: number;    // 0-1
}

const TERRAIN: Array<{ name: string; test: (h: number, s: number, m: number) => boolean; color: string }> = [
  { name: 'ocean',      test: (h) => h < -0.35,                   color: '#1a3050' },
  { name: 'deepwater',  test: (h) => h < -0.20,                   color: '#2a5580' },
  { name: 'water',      test: (h) => h < -0.08,                   color: '#4a80aa' },
  { name: 'beach',      test: (h) => h < -0.02,                   color: '#c8b888' },
  { name: 'plains',     test: (_h, _s, m) => m < 0.4,            color: '#8ab860' },
  { name: 'grassland',  test: (_h, _s, m) => m < 0.7,             color: '#72a84e' },
  { name: 'forest',     test: (_h, _s, _m) => true,               color: '#4a8a38' },
  { name: 'denseforest',test: (h, _s, m) => h > 0.1 && m > 0.6,  color: '#307028' },
  { name: 'hills',      test: (_h, s) => s > 0.12,                color: '#7a9a50' },
  { name: 'highland',   test: (h) => h > 0.25,                    color: '#6a8a40' },
  { name: 'rock',       test: (h, s) => h > 0.3 || s > 0.25,    color: '#8a7a60' },
  { name: 'mountain',   test: (_h, s) => s > 0.30,                color: '#7a6a50' },
  { name: 'peak',       test: (h) => h > 0.45,                    color: '#9a8a78' },
  { name: 'snow',       test: (h) => h > 0.55,                    color: '#d0d4d8' },
];

let noise2D: ReturnType<typeof createNoise2D> | null = null;

function getNoise(): ReturnType<typeof createNoise2D> {
  if (!noise2D) noise2D = createNoise2D();
  return noise2D;
}

export function sampleTerrain(x: number, y: number): TerrainSample {
  const n = getNoise();
  const s = 0.00025; // base scale — 1 unit per 4km

  // Elevation: 4 octaves
  const e0 = n(x * s, y * s);
  const e1 = n(x * s * 2, y * s * 2) * 0.5;
  const e2 = n(x * s * 4, y * s * 4) * 0.25;
  const e3 = n(x * s * 8, y * s * 8) * 0.125;
  const height = e0 + e1 + e2 + e3;

  // Moisture: separate noise (offset coords for different pattern)
  const m0 = n(x * s * 0.5 + 1000, y * s * 0.5 + 1000);
  const m1 = n(x * s * 2 + 1000, y * s * 2 + 1000) * 0.5;
  const moisture = (m0 + m1 + 1.5) / 3; // normalize to ~0-1

  // Slope
  const eps = 0.001 / s;
  const dx = n((x + eps) * s, y * s);
  const dy = n(x * s, (y + eps) * s);
  const slope = Math.min(1, Math.sqrt((dx - e0) ** 2 + (dy - e0) ** 2) / s / 5);

  const type = TERRAIN.find((t) => t.test(height, slope, moisture))?.name ?? 'plains';
  return { height, type, slope };
}

export function getTerrainColor(type: string): string {
  return TERRAIN.find((t) => t.name === type)?.color ?? '#8ab860';
}
