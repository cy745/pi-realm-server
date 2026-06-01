// Terrain Map — real-time rendered 2D map with drag/zoom
// Renders Perlin noise terrain + location rectangles + character dots

import { useCallback, useEffect, useRef, useState } from 'react';
import { sampleTerrain, getTerrainColor } from './perlin.ts';

const TILE_SIZE = 8; // pixels per terrain tile at zoom=1
const TILE_WORLD = 200; // meters per tile

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

export function TerrainMap({ locations, characters, centerX = 500, centerY = 800, className = '' }: TerrainMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [viewCenter, setViewCenter] = useState({ x: centerX, y: centerY });
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setDims({ w: e.contentRect.width, h: e.contentRect.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Mouse drag
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    dragStart.current = { x: e.clientX, y: e.clientY };
    // Convert pixel delta to world delta
    const worldPerPixel = TILE_WORLD / (TILE_SIZE * zoom);
    setViewCenter((v) => ({ x: v.x - dx * worldPerPixel, y: v.y - dy * worldPerPixel }));
  }, [zoom]);

  const onMouseUp = useCallback(() => { isDragging.current = false; }, []);

  // Scroll zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.85 : 1.18;
    setZoom((z) => Math.max(0.1, Math.min(50, z * factor)));
  }, []);

  // Main render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = dims;
    canvas.width = w;
    canvas.height = h;

    // Visible world bounds
    const worldPerPixel = TILE_WORLD / (TILE_SIZE * zoom);
    const halfW = (w / 2) * worldPerPixel;
    const halfH = (h / 2) * worldPerPixel;
    const minX = viewCenter.x - halfW;
    const maxX = viewCenter.x + halfW;
    const minY = viewCenter.y - halfH;
    const maxY = viewCenter.y + halfH;

    // Draw terrain tiles
    const step = TILE_SIZE * zoom;
    const worldStep = TILE_WORLD;

    // Align first tile to world grid for stable rendering
    const startTileX = Math.floor(minX / worldStep) * worldStep;
    const startTileY = Math.floor(minY / worldStep) * worldStep;

    for (let wx = startTileX; wx <= maxX; wx += worldStep) {
      for (let wy = startTileY; wy <= maxY; wy += worldStep) {
        const sample = sampleTerrain(wx + worldStep / 2, wy + worldStep / 2);
        const px = (wx - minX) / worldPerPixel;
        const py = (wy - minY) / worldPerPixel;
        ctx.fillStyle = getTerrainColor(sample.type);
        ctx.fillRect(px, py, step + 1, step + 1); // +1 to avoid gaps
      }
    }

    // Grid lines (every 1km)
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    const gridStep = 1000; // 1km
    const gridStartX = Math.floor(minX / gridStep) * gridStep;
    const gridStartY = Math.floor(minY / gridStep) * gridStep;
    for (let gx = gridStartX; gx <= maxX; gx += gridStep) {
      const px = (gx - minX) / worldPerPixel;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
    for (let gy = gridStartY; gy <= maxY; gy += gridStep) {
      const py = (gy - minY) / worldPerPixel;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
      ctx.stroke();
    }

    // Draw location rectangles
    for (const loc of locations) {
      const lx = (loc.x - loc.w / 2 - minX) / worldPerPixel;
      const ly = (loc.y - loc.h / 2 - minY) / worldPerPixel;
      const lw = (loc.w) / worldPerPixel;
      const lh = (loc.h) / worldPerPixel;

      // Only draw if visible on screen
      if (lx + lw < -50 || lx > w + 50 || ly + lh < -50 || ly > h + 50) continue;

      ctx.strokeStyle = loc.type === 'room' ? 'rgba(255,200,50,0.5)' :
        loc.type === 'building' ? 'rgba(255,200,50,0.7)' :
        loc.type === 'town' ? 'rgba(255,255,255,0.9)' :
        loc.type === 'region' ? 'rgba(255,255,255,0.3)' :
        'rgba(200,200,200,0.5)';
      ctx.lineWidth = loc.type === 'region' ? 1 : loc.type === 'town' ? 2 : 1.5;
      ctx.setLineDash(loc.type === 'region' || loc.type === 'continent' ? [6, 4] : []);
      ctx.strokeRect(lx, ly, lw, lh);
      ctx.setLineDash([]);

      // Label
      if (lw > 30) {
        const fontSize = Math.max(9, Math.min(14, lw / 8));
        ctx.font = `600 ${fontSize}px "Fira Sans", sans-serif`;
        ctx.fillStyle = loc.type === 'town' ? '#ffffff' : loc.type === 'region' ? 'rgba(255,255,255,0.7)' : 'rgba(255,220,100,0.9)';
        ctx.textBaseline = 'top';
        ctx.fillText(loc.name, lx + 3, ly + 3);
      }
    }

    // Draw character dots
    for (const char of characters) {
      const cx = (char.x - minX) / worldPerPixel;
      const cy = (char.y - minY) / worldPerPixel;

      // Out of screen check
      if (cx < -20 || cx > w + 20 || cy < -20 || cy > h + 20) continue;

      const radius = char.type === 'player' ? 6 : 5;
      const color = char.type === 'player' ? '#A855F7' : '#22C55E';

      // Glow
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
      ctx.fillStyle = color + '30';
      ctx.fill();

      // Dot
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
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
      ctx.fillText(char.name, cx + 10, cy - 5);
      ctx.shadowBlur = 0;
    }

    // Scale bar (lower left)
    const barMeters = zoom > 2 ? 100 : zoom > 0.5 ? 500 : 1000;
    const barPixels = barMeters / worldPerPixel;
    const barY = h - 30;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(12, barY - 8, barPixels + 8, 20);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(16, barY);
    ctx.lineTo(16 + barPixels, barY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(16, barY - 4);
    ctx.lineTo(16, barY + 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(16 + barPixels, barY - 4);
    ctx.lineTo(16 + barPixels, barY + 4);
    ctx.stroke();
    ctx.font = '10px "Fira Code", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${barMeters >= 1000 ? `${barMeters / 1000}km` : `${barMeters}m`}`, 20, barY);

    // Center crosshair
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 10, h / 2);
    ctx.lineTo(w / 2 + 10, h / 2);
    ctx.moveTo(w / 2, h / 2 - 10);
    ctx.lineTo(w / 2, h / 2 + 10);
    ctx.stroke();

  }, [dims, zoom, viewCenter, locations, characters]);

  // Keyboard zoom
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
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      />

      {/* Controls overlay */}
      <div className="absolute top-3 right-3 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(50, z * 1.3))}
          className="w-8 h-8 bg-white/10 hover:bg-white/20 text-white font-mono text-sm rounded-sm cursor-pointer transition-colors"
          aria-label="Zoom in"
        >+</button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.1, z / 1.3))}
          className="w-8 h-8 bg-white/10 hover:bg-white/20 text-white font-mono text-sm rounded-sm cursor-pointer transition-colors"
          aria-label="Zoom out"
        >−</button>
        <button
          type="button"
          onClick={() => { setZoom(1); setViewCenter({ x: centerX, y: centerY }); }}
          className="w-8 h-8 bg-white/10 hover:bg-white/20 text-white font-mono text-xs rounded-sm cursor-pointer transition-colors"
          aria-label="Reset view"
        >⟲</button>
      </div>

      {/* Info bar */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
        <div className="bg-black/50 text-white/80 text-[10px] font-mono px-2 py-1 rounded-sm">
          ({viewCenter.x.toFixed(0)}, {viewCenter.y.toFixed(0)}) · {zoom.toFixed(1)}×
        </div>
        <div className="bg-black/50 text-white/60 text-[10px] font-mono px-2 py-1 rounded-sm">
          {characters.length} chars · {locations.length} locations · drag to pan · scroll to zoom
        </div>
      </div>
    </div>
  );
}
