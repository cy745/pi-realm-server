// Terrain Map — offscreen canvas terrain layer + 10m tiles
// Drag: only repaints overlay (chars + locations), terrain is shifted
// Zoom: re-renders everything at new resolution

import { useCallback, useEffect, useRef, useState } from 'react';
import { sampleTerrain, getTerrainColor } from './perlin.ts';
import Stats from 'stats.js';

const TILE_WORLD = 10; // 10m per tile
const TILE_PX_BASE = 8; // pixels per tile at zoom=1

interface LocationMarker {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CharacterDot {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
}

interface TerrainMapProps {
  locations: LocationMarker[];
  characters: CharacterDot[];
  centerX?: number;
  centerY?: number;
  className?: string;
}

// ── Tile Cache ────────────────────────────────────

const tileCache = new Map<number, string>();
const MAX_CACHE = 20000;

function getTileColor(wx: number, wy: number): string {
  const key = Math.floor(wx / TILE_WORLD) * 100003 + Math.floor(wy / TILE_WORLD);
  let color = tileCache.get(key);
  if (!color) {
    color = getTerrainColor(sampleTerrain(wx + TILE_WORLD / 2, wy + TILE_WORLD / 2).type);
    tileCache.set(key, color);
    if (tileCache.size > MAX_CACHE) {
      const first = tileCache.keys().next().value;
      if (first !== undefined) tileCache.delete(first);
    }
  }
  return color;
}

// Invalidate cache when zoom changes (terrain visualization may change)
let lastZoom = 0;
function invalidateCacheOnZoom(zoom: number): boolean {
  const tilePx = Math.max(4, TILE_PX_BASE * zoom);
  if (Math.abs(tilePx - lastZoom) > 2) {
    lastZoom = tilePx;
    return true; // zoom changed significantly
  }
  return false;
}

// ── Offscreen Canvas Pool ─────────────────────────

let terrainOffscreen: HTMLCanvasElement | null = null;
let terrainCtx: CanvasRenderingContext2D | null = null;
let terrainKey = '';

function getTerrainCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  if (!terrainOffscreen || terrainOffscreen.width !== w || terrainOffscreen.height !== h) {
    terrainOffscreen = document.createElement('canvas');
    terrainOffscreen.width = w;
    terrainOffscreen.height = h;
    terrainCtx = terrainOffscreen.getContext('2d');
  }
  return [terrainOffscreen, terrainCtx!];
}

export function TerrainMap({ locations, characters, centerX = 500, centerY = 800, className = '' }: TerrainMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef({ x: centerX, y: centerY, zoom: 1 });
  const [zoom, setZoom] = useState(0.2); // start zoomed out
  const [viewCenter, setViewCenter] = useState({ x: centerX, y: centerY });
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const renderPending = useRef(0);
  const statsRef = useRef<Stats | null>(null);
  const needsTerrainRebuild = useRef(true);
  const prevViewRef = useRef({ x: centerX, y: centerY, zoom: 0.2 });

  // Track container size + init Stats.js
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (!statsRef.current) {
      const stats = new Stats();
      stats.showPanel(0);
      stats.dom.style.position = 'absolute';
      stats.dom.style.top = '0';
      stats.dom.style.left = '0';
      stats.dom.style.zIndex = '1';
      stats.dom.style.pointerEvents = 'none';
      stats.dom.style.opacity = '0.7';
      el.appendChild(stats.dom);
      statsRef.current = stats;
    }

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        setDims((prev) => (prev.w !== width || prev.h !== height ? { w: width, h: height } : prev));
      }
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (statsRef.current) {
        try { statsRef.current.dom.remove(); } catch { /* noop */ }
        statsRef.current = null;
      }
    };
  }, []);

  // ── Mouse drag ──────────────────────────────────

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    dragStart.current = { x: e.clientX, y: e.clientY };
    const tilePx = Math.max(4, TILE_PX_BASE * viewRef.current.zoom);
    const worldPerPx = TILE_WORLD / tilePx;
    setViewCenter((v) => ({ x: v.x - dx * worldPerPx, y: v.y - dy * worldPerPx }));
  }, []);

  const onMouseUp = useCallback(() => { isDragging.current = false; }, []);
  const onMouseLeave = useCallback(() => { isDragging.current = false; }, []);

  // ── Wheel zoom (non-passive) ────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.85 : 1.18;
      setZoom((z) => Math.max(0.02, Math.min(50, z * factor)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // ── Draw terrain to offscreen canvas ────────────

  const buildTerrain = useCallback((w: number, h: number, cx: number, cy: number, z: number) => {
    const tilePx = Math.max(4, TILE_PX_BASE * z);
    const worldPerPx = TILE_WORLD / tilePx;
    const halfW = (w / 2) * worldPerPx;
    const halfH = (h / 2) * worldPerPx;
    const minX = cx - halfW;
    const maxX = cx + halfW;
    const minY = cy - halfH;
    const maxY = cy + halfH;

    const [offCanvas, offCtx] = getTerrainCanvas(w, h);

    // Clear
    offCtx.fillStyle = '#1a3a5c'; // ocean default
    offCtx.fillRect(0, 0, w, h);

    const cols = Math.ceil(w / tilePx) + 4;
    const rows = Math.ceil(h / tilePx) + 4;
    const startTx = Math.floor(minX / TILE_WORLD) * TILE_WORLD;
    const startTy = Math.floor(minY / TILE_WORLD) * TILE_WORLD;

    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const wx = startTx + col * TILE_WORLD;
        const wy = startTy + row * TILE_WORLD;
        const px = (wx - minX) / worldPerPx;
        const py = (wy - minY) / worldPerPx;
        offCtx.fillStyle = getTileColor(wx, wy);
        offCtx.fillRect(px, py, tilePx + 0.5, tilePx + 0.5);
      }
    }

    return { offCanvas, worldPerPx, minX, minY, tilePx };
  }, []);

  // ── Full draw ───────────────────────────────────

  const draw = useCallback(() => {
    const stats = statsRef.current;
    if (stats) stats.begin();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = dims;
    if (w === 0 || h === 0) return;
    canvas.width = w;
    canvas.height = h;

    const z = viewRef.current.zoom;
    const cx = viewRef.current.x;
    const cy = viewRef.current.y;
    const prev = prevViewRef.current;
    const zoomChanged = Math.abs(z - prev.zoom) > 0.01;
    const panned = Math.abs(cx - prev.x) > 0.1 || Math.abs(cy - prev.y) > 0.1;

    if (!panned && !zoomChanged) {
      if (stats) stats.end();
      return; // nothing changed
    }
    prevViewRef.current = { x: cx, y: cy, zoom: z };

    // Build terrain layer (only on zoom change or first paint)
    if (zoomChanged || needsTerrainRebuild.current) {
      const result = buildTerrain(w, h, cx, cy, z);
      needsTerrainRebuild.current = false;
      // Draw terrain offscreen to main canvas
      ctx.drawImage(result.offCanvas, 0, 0);
    } else {
      // Panning: rebuild terrain (simple for now — could optimize with shift)
      const result = buildTerrain(w, h, cx, cy, z);
      ctx.drawImage(result.offCanvas, 0, 0);
    }

    const tilePx = Math.max(4, TILE_PX_BASE * z);
    const worldPerPx = TILE_WORLD / tilePx;
    const halfW = (w / 2) * worldPerPx;
    const halfH = (h / 2) * worldPerPx;
    const minX = cx - halfW;
    const minY = cy - halfH;
    const maxX = cx + halfW;
    const maxY = cy + halfH;

    // ── Grid lines (only if spacing > 8px) ───────
    const gridStep = 100;
    const gsPx = gridStep / worldPerPx;
    if (gsPx > 8) {
      ctx.strokeStyle = 'rgba(0,0,0,0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const gsx = Math.floor(minX / gridStep) * gridStep;
      const gsy = Math.floor(minY / gridStep) * gridStep;
      for (let gx = gsx; gx <= maxX; gx += gridStep) {
        const px = (gx - minX) / worldPerPx;
        ctx.moveTo(px, 0); ctx.lineTo(px, h);
      }
      for (let gy = gsy; gy <= maxY; gy += gridStep) {
        const py = (gy - minY) / worldPerPx;
        ctx.moveTo(0, py); ctx.lineTo(w, py);
      }
      ctx.stroke();
    }

    // ── 1km bold grid ────────────────────────────
    const bigGrid = 1000;
    const bgPx = bigGrid / worldPerPx;
    if (bgPx > 4) {
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const bgsx = Math.floor(minX / bigGrid) * bigGrid;
      const bgsy = Math.floor(minY / bigGrid) * bigGrid;
      for (let gx = bgsx; gx <= maxX; gx += bigGrid) {
        const px = (gx - minX) / worldPerPx;
        ctx.moveTo(px, 0); ctx.lineTo(px, h);
      }
      for (let gy = bgsy; gy <= maxY; gy += bigGrid) {
        const py = (gy - minY) / worldPerPx;
        ctx.moveTo(0, py); ctx.lineTo(w, py);
      }
      ctx.stroke();
    }

    // ── Locations ────────────────────────────────
    const sortedLocs = [...locations].sort((a, b) =>
      ((a.type === 'region' || a.type === 'continent') ? 0 : 1) -
      ((b.type === 'region' || b.type === 'continent') ? 0 : 1),
    );

    for (const loc of sortedLocs) {
      const lx = (loc.x - loc.w / 2 - minX) / worldPerPx;
      const ly = (loc.y - loc.h / 2 - minY) / worldPerPx;
      const lw = loc.w / worldPerPx;
      const lh = loc.h / worldPerPx;

      if (lx + lw < -50 || lx > w + 50 || ly + lh < -50 || ly > h + 50) continue;

      if (lw > 2) {
        ctx.strokeStyle =
          loc.type === 'room' ? 'rgba(255,200,50,0.4)' :
          loc.type === 'building' ? 'rgba(255,200,50,0.6)' :
          loc.type === 'town' ? 'rgba(255,255,255,0.8)' :
          loc.type === 'region' ? 'rgba(255,255,255,0.25)' :
          'rgba(200,200,200,0.4)';
        ctx.lineWidth = loc.type === 'region' ? 1 : loc.type === 'town' ? 1.5 : 1;
        ctx.setLineDash(loc.type === 'region' || loc.type === 'continent' ? [4, 3] : []);
        ctx.strokeRect(lx, ly, lw, lh);
        ctx.setLineDash([]);
      }

      if (lw > 30 && lh > 8) {
        const fontSize = Math.max(9, Math.min(13, lw / 10));
        ctx.font = `600 ${fontSize}px "Fira Sans", sans-serif`;
        ctx.fillStyle = loc.type === 'town' ? '#ffffff' : loc.type === 'region' ? 'rgba(255,255,255,0.6)' : 'rgba(255,220,100,0.8)';
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 3;
        ctx.textBaseline = 'top';
        ctx.fillText(loc.name, lx + 2, ly + 2);
        ctx.shadowBlur = 0;
      }
    }

    // ── Characters ──────────────────────────────
    for (const ch of characters) {
      const cx2 = (ch.x - minX) / worldPerPx;
      const cy2 = (ch.y - minY) / worldPerPx;
      if (cx2 < -20 || cx2 > w + 20 || cy2 < -20 || cy2 > h + 20) continue;

      const radius = ch.type === 'player' ? 5 : 4;
      const color = ch.type === 'player' ? '#A855F7' : '#22C55E';

      ctx.beginPath();
      ctx.arc(cx2, cy2, radius + 2, 0, Math.PI * 2);
      ctx.fillStyle = color + '30';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx2, cy2, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = '600 10px "Fira Sans", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'bottom';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 3;
      ctx.fillText(ch.name, cx2 + 8, cy2 - 4);
      ctx.shadowBlur = 0;
    }

    // ── Scale bar ──────────────────────────────
    const barMeters = z > 4 ? 50 : z > 1 ? 100 : 500;
    const barPx = barMeters / worldPerPx;
    const barY = h - 28;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(10, barY - 6, barPx + 6, 16);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(13, barY); ctx.lineTo(13 + barPx, barY); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(13, barY - 3); ctx.lineTo(13, barY + 3); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(13 + barPx, barY - 3); ctx.lineTo(13 + barPx, barY + 3); ctx.stroke();
    ctx.font = '9px "Fira Code", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${barMeters >= 1000 ? `${barMeters / 1000}km` : `${barMeters}m`}`, 16, barY);

    if (stats) stats.end();
  }, [locations, characters, dims, buildTerrain]);

  // ── rAF render loop ────────────────────────────

  useEffect(() => {
    viewRef.current = { x: viewCenter.x, y: viewCenter.y, zoom };
    if (renderPending.current) cancelAnimationFrame(renderPending.current);
    renderPending.current = requestAnimationFrame(() => {
      renderPending.current = 0;
      draw();
    });
    return () => {
      if (renderPending.current) cancelAnimationFrame(renderPending.current);
    };
  }, [viewCenter, zoom, draw]);

  // ── Keyboard ──────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(50, z * 1.2));
      if (e.key === '-') setZoom((z) => Math.max(0.02, z / 1.2));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative bg-ink-900 rounded-sm overflow-hidden ${className}`}
      style={{ width: '100%', height: '100%', minHeight: '400px' }}
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        style={{ cursor: isDragging.current ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      />

      <div className="absolute top-3 right-3 flex flex-col gap-1">
        <button type="button" onClick={() => setZoom((z) => Math.min(50, z * 1.3))}
          className="w-7 h-7 bg-white/10 hover:bg-white/20 text-white font-mono text-xs rounded-sm cursor-pointer transition-colors" aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setZoom((z) => Math.max(0.02, z / 1.3))}
          className="w-7 h-7 bg-white/10 hover:bg-white/20 text-white font-mono text-xs rounded-sm cursor-pointer transition-colors" aria-label="Zoom out">−</button>
        <button type="button" onClick={() => { needsTerrainRebuild.current = true; setZoom(0.2); setViewCenter({ x: centerX, y: centerY }); }}
          className="w-7 h-7 bg-white/10 hover:bg-white/20 text-white font-mono text-xs rounded-sm cursor-pointer transition-colors" aria-label="Reset view">⟲</button>
      </div>

      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
        <div className="bg-black/50 text-white/70 text-[9px] font-mono px-1.5 py-0.5 rounded-sm selection:bg-transparent">
          ({viewCenter.x.toFixed(0)}, {viewCenter.y.toFixed(0)}) · {zoom.toFixed(2)}×
        </div>
        <div className="bg-black/50 text-white/50 text-[9px] font-mono px-1.5 py-0.5 rounded-sm selection:bg-transparent">
          10m/tile
        </div>
      </div>
    </div>
  );
}
