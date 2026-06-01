// Terrain Map — optimized 2D map with drag/zoom + tile cache + ImageData batch render

import { useCallback, useEffect, useRef, useState } from 'react';
import { sampleTerrain, getTerrainColor } from './perlin.ts';

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

const tileCache = new Map<string, string>();
const MAX_CACHE = 5000;

function getTile(wx: number, wy: number, worldStep: number): string {
  const key = `${Math.floor(wx / worldStep)},${Math.floor(wy / worldStep)}`;
  let color = tileCache.get(key);
  if (!color) {
    color = getTerrainColor(sampleTerrain(wx + worldStep / 2, wy + worldStep / 2).type);
    tileCache.set(key, color);
    if (tileCache.size > MAX_CACHE) {
      const first = tileCache.keys().next().value;
      if (first) tileCache.delete(first);
    }
  }
  return color;
}

export function TerrainMap({ locations, characters, centerX = 500, centerY = 800, className = '' }: TerrainMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef({ x: centerX, y: centerY, zoom: 1 });
  const [zoom, setZoom] = useState(1);
  const [viewCenter, setViewCenter] = useState({ x: centerX, y: centerY });
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const renderPending = useRef(0);

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        setDims((prev) => (prev.w !== width || prev.h !== height ? { w: width, h: height } : prev));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
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
    const worldPerPx = 200 / (8 * viewRef.current.zoom);
    setViewCenter((v) => ({ x: v.x - dx * worldPerPx, y: v.y - dy * worldPerPx }));
  }, []);

  const onMouseUp = useCallback(() => { isDragging.current = false; }, []);
  const onMouseLeave = useCallback(() => { isDragging.current = false; }, []);

  // ── Wheel zoom (non-passive, prevents page scroll) ──

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.85 : 1.18;
      setZoom((z) => Math.max(0.1, Math.min(50, z * factor)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // ── Main render ─────────────────────────────────

  const draw = useCallback(() => {
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

    const tileWorld = 200;
    const tilePx = Math.max(1, 8 * z); // adaptive: larger at high zoom
    const worldPerPx = tileWorld / tilePx;
    const halfW = (w / 2) * worldPerPx;
    const halfH = (h / 2) * worldPerPx;
    const minX = cx - halfW;
    const maxX = cx + halfW;
    const minY = cy - halfH;
    const maxY = cy + halfH;

    // ── 1. Draw terrain via ImageData ──────────────
    const stepPx = tilePx;
    const cols = Math.ceil(w / stepPx) + 2;
    const rows = Math.ceil(h / stepPx) + 2;
    const startTileX = Math.floor(minX / tileWorld) * tileWorld;
    const startTileY = Math.floor(minY / tileWorld) * tileWorld;

    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const wx = startTileX + col * tileWorld;
        const wy = startTileY + row * tileWorld;
        const px = (wx - minX) / worldPerPx;
        const py = (wy - minY) / worldPerPx;
        const color = getTile(wx, wy, tileWorld);
        ctx.fillStyle = color;
        ctx.fillRect(px, py, stepPx + 0.5, stepPx + 0.5);
      }
    }

    // ── 2. Grid lines (every 1km) ────────────────
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    const gridStep = 1000;
    const gsPx = gridStep / worldPerPx;
    const gStartX = Math.floor(minX / gridStep) * gridStep;
    const gStartY = Math.floor(minY / gridStep) * gridStep;

    // Only draw grid if spacing > 4px
    if (gsPx > 4) {
      ctx.beginPath();
      for (let gx = gStartX; gx <= maxX; gx += gridStep) {
        const px = (gx - minX) / worldPerPx;
        ctx.moveTo(px, 0); ctx.lineTo(px, h);
      }
      for (let gy = gStartY; gy <= maxY; gy += gridStep) {
        const py = (gy - minY) / worldPerPx;
        ctx.moveTo(0, py); ctx.lineTo(w, py);
      }
      ctx.stroke();
    }

    // ── 3. Locations ───────────────────────────────
    // Sort: region/continent first (drawn behind), building/room last (on top)
    const sortedLocations = [...locations].sort((a, b) =>
      (a.type === 'region' || a.type === 'continent' ? 0 : 1) -
      (b.type === 'region' || b.type === 'continent' ? 0 : 1),
    );

    for (const loc of sortedLocations) {
      const lx = (loc.x - loc.w / 2 - minX) / worldPerPx;
      const ly = (loc.y - loc.h / 2 - minY) / worldPerPx;
      const lw = loc.w / worldPerPx;
      const lh = loc.h / worldPerPx;

      if (lx + lw < -50 || lx > w + 50 || ly + lh < -50 || ly > h + 50) continue;

      // Only draw rectangles when visible
      if (lw > 2) {
        ctx.strokeStyle =
          loc.type === 'room' ? 'rgba(255,200,50,0.5)' :
          loc.type === 'building' ? 'rgba(255,200,50,0.7)' :
          loc.type === 'town' ? 'rgba(255,255,255,0.9)' :
          loc.type === 'region' ? 'rgba(255,255,255,0.3)' :
          'rgba(200,200,200,0.5)';
        ctx.lineWidth = loc.type === 'region' ? 1 : loc.type === 'town' ? 2 : 1.5;
        ctx.setLineDash(loc.type === 'region' || loc.type === 'continent' ? [6, 4] : []);
        ctx.strokeRect(lx, ly, lw, lh);
        ctx.setLineDash([]);
      }

      // Label (only if big enough)
      if (lw > 30 && lh > 8) {
        const fontSize = Math.max(9, Math.min(14, lw / 8));
        ctx.font = `600 ${fontSize}px "Fira Sans", sans-serif`;
        ctx.fillStyle = loc.type === 'town' ? '#ffffff' : loc.type === 'region' ? 'rgba(255,255,255,0.7)' : 'rgba(255,220,100,0.9)';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 3;
        ctx.textBaseline = 'top';
        ctx.fillText(loc.name, lx + 3, ly + 3);
        ctx.shadowBlur = 0;
      }
    }

    // ── 4. Characters ──────────────────────────────
    for (const ch of characters) {
      const cx2 = (ch.x - minX) / worldPerPx;
      const cy2 = (ch.y - minY) / worldPerPx;
      if (cx2 < -20 || cx2 > w + 20 || cy2 < -20 || cy2 > h + 20) continue;

      const radius = ch.type === 'player' ? 6 : 5;
      const color = ch.type === 'player' ? '#A855F7' : '#22C55E';

      // Glow
      ctx.beginPath();
      ctx.arc(cx2, cy2, radius + 3, 0, Math.PI * 2);
      ctx.fillStyle = color + '30';
      ctx.fill();

      // Dot
      ctx.beginPath();
      ctx.arc(cx2, cy2, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label
      ctx.font = '600 10px "Fira Sans", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'bottom';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 3;
      ctx.fillText(ch.name, cx2 + 10, cy2 - 5);
      ctx.shadowBlur = 0;
    }

    // ── 5. Scale bar ──────────────────────────────
    const barMeters = z > 2 ? 100 : z > 0.5 ? 500 : 1000;
    const barPx = barMeters / worldPerPx;
    const barY = h - 30;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(12, barY - 8, barPx + 8, 20);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(16, barY); ctx.lineTo(16 + barPx, barY); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(16, barY - 4); ctx.lineTo(16, barY + 4); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(16 + barPx, barY - 4); ctx.lineTo(16 + barPx, barY + 4); ctx.stroke();
    ctx.font = '10px "Fira Code", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${barMeters >= 1000 ? `${barMeters / 1000}km` : `${barMeters}m`}`, 20, barY);

    // ── 6. Center crosshair ───────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 10, h / 2); ctx.lineTo(w / 2 + 10, h / 2);
    ctx.moveTo(w / 2, h / 2 - 10); ctx.lineTo(w / 2, h / 2 + 10);
    ctx.stroke();
  }, [locations, characters, dims]);

  // ── Throttled render via rAF ────────────────────

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

  // ── Keyboard shortcuts ──────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(50, z * 1.2));
      if (e.key === '-') setZoom((z) => Math.max(0.1, z / 1.2));
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

      {/* Controls overlay */}
      <div className="absolute top-3 right-3 flex flex-col gap-1">
        <button type="button" onClick={() => setZoom((z) => Math.min(50, z * 1.3))}
          className="w-8 h-8 bg-white/10 hover:bg-white/20 text-white font-mono text-sm rounded-sm cursor-pointer transition-colors" aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setZoom((z) => Math.max(0.1, z / 1.3))}
          className="w-8 h-8 bg-white/10 hover:bg-white/20 text-white font-mono text-sm rounded-sm cursor-pointer transition-colors" aria-label="Zoom out">−</button>
        <button type="button" onClick={() => { setZoom(1); setViewCenter({ x: centerX, y: centerY }); }}
          className="w-8 h-8 bg-white/10 hover:bg-white/20 text-white font-mono text-xs rounded-sm cursor-pointer transition-colors" aria-label="Reset view">⟲</button>
      </div>

      {/* Info bar */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
        <div className="bg-black/50 text-white/80 text-[10px] font-mono px-2 py-1 rounded-sm selection:bg-transparent">
          ({viewCenter.x.toFixed(0)}, {viewCenter.y.toFixed(0)}) · {zoom.toFixed(1)}×
        </div>
        <div className="bg-black/50 text-white/60 text-[10px] font-mono px-2 py-1 rounded-sm selection:bg-transparent">
          {characters.length} chars · {locations.length} locations
        </div>
      </div>
    </div>
  );
}
