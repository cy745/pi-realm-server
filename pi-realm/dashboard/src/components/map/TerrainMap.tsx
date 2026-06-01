// Terrain Map — offscreen canvas terrain layer + 10m tiles
// Terrain only rebuilt on pan/zoom; static frames just blit from cache

import { useCallback, useEffect, useRef, useState } from 'react';
import { sampleTerrain, getTerrainColor } from './perlin.ts';
import Stats from 'stats.js';

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

function getTileColor(wx: number, wy: number, tileWorld: number): string {
  const key = Math.floor(wx / tileWorld) * 100003 + Math.floor(wy / tileWorld);
  let color = tileCache.get(key);
  if (!color) {
    color = getTerrainColor(sampleTerrain(wx + tileWorld / 2, wy + tileWorld / 2).type);
    tileCache.set(key, color);
    if (tileCache.size > MAX_CACHE) {
      const first = tileCache.keys().next().value;
      if (first !== undefined) tileCache.delete(first);
    }
  }
  return color;
}

// Adaptive tile sizing: fewer larger tiles at low zoom, finer at high zoom
function getTileSizing(zoom: number): { tileWorld: number; tilePx: number } {
  const tilePx = Math.max(4, Math.floor(8 * Math.max(zoom, 0.3)));
  // Larger terrain tiles when zoomed out to reduce fillRect count
  const tileWorld = zoom < 0.5 ? 20 : zoom < 1 ? 15 : 10;
  return { tileWorld, tilePx };
}

// Module-level offscreen canvas (shared across instances)
let offCanvas: HTMLCanvasElement | null = null;
let offCtx: CanvasRenderingContext2D | null = null;

function getOffscreen(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  if (!offCanvas || offCanvas.width !== w || offCanvas.height !== h) {
    offCanvas = document.createElement('canvas');
    offCanvas.width = w;
    offCanvas.height = h;
    offCtx = offCanvas.getContext('2d');
  }
  return [offCanvas, offCtx!];
}

export function TerrainMap({ locations, characters, centerX = 500, centerY = 800, className = '' }: TerrainMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef({ x: centerX, y: centerY, zoom: 0.2 });
  const [zoom, setZoom] = useState(0.2);
  const [viewCenter, setViewCenter] = useState({ x: centerX, y: centerY });
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const renderPending = useRef(0);
  const statsRef = useRef<Stats | null>(null);
  const terrainBuiltAt = useRef({ x: 0, y: 0, zoom: 0, w: 0, h: 0 });

  // Init Stats.js
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

  // ── Mouse ──────────────────────────────────────

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    dragStart.current = { x: e.clientX, y: e.clientY };
    const { tileWorld, tilePx } = getTileSizing(viewRef.current.zoom);
    const worldPerPx = tileWorld / tilePx;
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

  // ── Build offscreen terrain (only when view changes) ──

  function refreshTerrain(w: number, h: number, cx: number, cy: number, z: number) {
    const sizing = getTileSizing(z);
    const tilePx = sizing.tilePx;
    const tileWorld = sizing.tileWorld;
    const worldPerPx = tileWorld / tilePx;
    const halfW = (w / 2) * worldPerPx;
    const halfH = (h / 2) * worldPerPx;
    const minX = cx - halfW;
    const maxX = cx + halfW;
    const minY = cy - halfH;
    const maxY = cy + halfH;

    const [oc] = getOffscreen(w, h);
    if (!offCtx) return { worldPerPx, minX, minY };

    // Clear
    offCtx.fillStyle = '#1a3a5c';
    offCtx.fillRect(0, 0, w, h);

    const cols = Math.ceil(w / tilePx) + 2;
    const rows = Math.ceil(h / tilePx) + 2;
    const startTx = Math.floor(minX / tileWorld) * tileWorld;
    const startTy = Math.floor(minY / tileWorld) * tileWorld;

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const wx = startTx + c * tileWorld;
        const wy = startTy + r * tileWorld;
        const px = (wx - minX) / worldPerPx;
        const py = (wy - minY) / worldPerPx;
        offCtx.fillStyle = getTileColor(wx, wy, tileWorld);
        offCtx.fillRect(px, py, tilePx + 0.5, tilePx + 0.5);
      }
    }

    return { worldPerPx, minX, minY };
  }

  // ── Draw overlays (every frame) ────────────────

  function drawOverlays(
    ctx: CanvasRenderingContext2D,
    w: number, h: number,
    cx: number, cy: number, z: number,
  ) {
    const sizing = getTileSizing(z);
    const tilePx = sizing.tilePx;
    const tileWorld = sizing.tileWorld;
    const worldPerPx = tileWorld / tilePx;
    const halfW = (w / 2) * worldPerPx;
    const halfH = (h / 2) * worldPerPx;
    const minX = cx - halfW;
    const maxX = cx + halfW;
    const minY = cy - halfH;
    const maxY = cy + halfH;

    // Grid (100m)
    const gsPx = 100 / worldPerPx;
    if (gsPx > 4) {
      ctx.strokeStyle = 'rgba(0,0,0,0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const gsx = Math.floor(minX / 100) * 100;
      const gsy = Math.floor(minY / 100) * 100;
      for (let gx = gsx; gx <= maxX; gx += 100) {
        const px = (gx - minX) / worldPerPx; ctx.moveTo(px, 0); ctx.lineTo(px, h);
      }
      for (let gy = gsy; gy <= maxY; gy += 100) {
        const py = (gy - minY) / worldPerPx; ctx.moveTo(0, py); ctx.lineTo(w, py);
      }
      ctx.stroke();
    }

    // 1km grid
    const kmPx = 1000 / worldPerPx;
    if (kmPx > 4) {
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const ksx = Math.floor(minX / 1000) * 1000;
      const ksy = Math.floor(minY / 1000) * 1000;
      for (let gx = ksx; gx <= maxX; gx += 1000) {
        const px = (gx - minX) / worldPerPx; ctx.moveTo(px, 0); ctx.lineTo(px, h);
      }
      for (let gy = ksy; gy <= maxY; gy += 1000) {
        const py = (gy - minY) / worldPerPx; ctx.moveTo(0, py); ctx.lineTo(w, py);
      }
      ctx.stroke();
    }

    // Locations
    const sorted = [...locations].sort((a, b) =>
      ((a.type === 'region' || a.type === 'continent') ? 0 : 1) -
      ((b.type === 'region' || b.type === 'continent') ? 0 : 1),
    );
    for (const loc of sorted) {
      const lx = (loc.x - loc.w / 2 - minX) / worldPerPx;
      const ly = (loc.y - loc.h / 2 - minY) / worldPerPx;
      const lw = loc.w / worldPerPx;
      const lh = loc.h / worldPerPx;
      if (lx + lw < -50 || lx > w + 50 || ly + lh < -50 || ly > h + 50) continue;

      if (lw > 2) {
        ctx.strokeStyle = loc.type === 'room' ? 'rgba(255,200,50,0.4)' :
          loc.type === 'building' ? 'rgba(255,200,50,0.6)' :
          loc.type === 'town' ? 'rgba(255,255,255,0.8)' :
          loc.type === 'region' ? 'rgba(255,255,255,0.25)' : 'rgba(200,200,200,0.4)';
        ctx.lineWidth = loc.type === 'region' ? 1 : loc.type === 'town' ? 1.5 : 1;
        ctx.setLineDash(loc.type === 'region' || loc.type === 'continent' ? [4, 3] : []);
        ctx.strokeRect(lx, ly, lw, lh);
        ctx.setLineDash([]);
      }
      if (lw > 30 && lh > 8) {
        const fs = Math.max(9, Math.min(13, lw / 10));
        ctx.font = `600 ${fs}px "Fira Sans", sans-serif`;
        ctx.fillStyle = loc.type === 'town' ? '#ffffff' : loc.type === 'region' ? 'rgba(255,255,255,0.6)' : 'rgba(255,220,100,0.8)';
        ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 3;
        ctx.textBaseline = 'top';
        ctx.fillText(loc.name, lx + 2, ly + 2);
        ctx.shadowBlur = 0;
      }
    }

    // Characters
    for (const ch of characters) {
      const cx2 = (ch.x - minX) / worldPerPx;
      const cy2 = (ch.y - minY) / worldPerPx;
      if (cx2 < -20 || cx2 > w + 20 || cy2 < -20 || cy2 > h + 20) continue;
      const r = ch.type === 'player' ? 5 : 4;
      const color = ch.type === 'player' ? '#A855F7' : '#22C55E';
      ctx.beginPath(); ctx.arc(cx2, cy2, r + 2, 0, Math.PI * 2);
      ctx.fillStyle = color + '30'; ctx.fill();
      ctx.beginPath(); ctx.arc(cx2, cy2, r, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.font = '600 10px "Fira Sans", sans-serif';
      ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'bottom';
      ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
      ctx.fillText(ch.name, cx2 + 8, cy2 - 4);
      ctx.shadowBlur = 0;
    }

    // Scale bar
    const barMeters = z > 4 ? 50 : z > 1 ? 100 : 500;
    const barPx = barMeters / worldPerPx;
    const barY = h - 26;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(10, barY - 6, barPx + 6, 14);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(13, barY); ctx.lineTo(13 + barPx, barY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(13, barY - 3); ctx.lineTo(13, barY + 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(13 + barPx, barY - 3); ctx.lineTo(13 + barPx, barY + 3); ctx.stroke();
    ctx.font = '9px "Fira Code", monospace';
    ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle';
    ctx.fillText(`${barMeters >= 1000 ? `${barMeters / 1000}km` : `${barMeters}m`}`, 16, barY);
  }

  // ── Main draw ───────────────────────────────────

  const draw = useCallback(() => {
    const stats = statsRef.current;
    if (stats) stats.begin();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = dims;
    if (w === 0 || h === 0) return;

    const z = viewRef.current.zoom;
    const cx = viewRef.current.x;
    const cy = viewRef.current.y;
    const prev = terrainBuiltAt.current;

    // Detect if view changed enough to warrant terrain rebuild
    const zoomDelta = Math.abs(z - prev.zoom);
    const panDelta = Math.sqrt((cx - prev.x) ** 2 + (cy - prev.y) ** 2);
    const sizeChanged = w !== prev.w || h !== prev.h;
    const needsRebuild = zoomDelta > 0.01 || panDelta > 5 || sizeChanged;

    if (needsRebuild) {
      // Rebuild offscreen terrain at current view
      refreshTerrain(w, h, cx, cy, z);
      terrainBuiltAt.current = { x: cx, y: cy, zoom: z, w, h };
    }

    // Always blit offscreen terrain to main canvas
    canvas.width = w;
    canvas.height = h;
    if (offCanvas) {
      ctx.drawImage(offCanvas, 0, 0);
    }

    // Always draw overlays
    drawOverlays(ctx, w, h, cx, cy, z);

    if (stats) stats.end();
  }, [locations, characters, dims]);

  // ── rAF loop ────────────────────────────────────

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

  // ── Keyboard ────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(50, z * 1.2));
      if (e.key === '-') setZoom((z) => Math.max(0.02, z / 1.2));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div ref={containerRef} className={`relative bg-ink-900 rounded-sm overflow-hidden ${className}`}
      style={{ width: '100%', height: '100%', minHeight: '400px' }}>
      <canvas ref={canvasRef} className="block w-full h-full"
        style={{ cursor: isDragging.current ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp} onMouseLeave={onMouseLeave} />
      <div className="absolute top-3 right-3 flex flex-col gap-1">
        <button type="button" onClick={() => setZoom((z) => Math.min(50, z * 1.3))}
          className="w-7 h-7 bg-white/10 hover:bg-white/20 text-white font-mono text-xs rounded-sm cursor-pointer transition-colors" aria-label="+">+</button>
        <button type="button" onClick={() => setZoom((z) => Math.max(0.02, z / 1.3))}
          className="w-7 h-7 bg-white/10 hover:bg-white/20 text-white font-mono text-xs rounded-sm cursor-pointer transition-colors" aria-label="−">−</button>
        <button type="button" onClick={() => { terrainBuiltAt.current = { x: 0, y: 0, zoom: 0, w: 0, h: 0 }; setZoom(0.2); setViewCenter({ x: centerX, y: centerY }); }}
          className="w-7 h-7 bg-white/10 hover:bg-white/20 text-white font-mono text-xs rounded-sm cursor-pointer transition-colors" aria-label="Reset">⟲</button>
      </div>
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
        <div className="bg-black/50 text-white/70 text-[9px] font-mono px-1.5 py-0.5 rounded-sm">
          ({viewCenter.x.toFixed(0)}, {viewCenter.y.toFixed(0)}) · {zoom.toFixed(2)}×
        </div>
      </div>
    </div>
  );
}
