// Terrain Map — Canvas2D + chunk-based offscreen terrain caching
// Terrain layer rendered to offscreen canvas, only rebuilt on view change.
// Overlays (grid, locations, chars) drawn on main canvas every frame.

import { useEffect, useRef, useState } from 'react';
import { sampleTerrain, getTerrainColor } from './perlin.ts';

interface LM { id: string; name: string; type: string; x: number; y: number; w: number; h: number; }
interface CD { id: string; name: string; type: string; x: number; y: number; }
interface Props { locations: LM[]; characters: CD[]; centerX?: number; centerY?: number; className?: string; }

const TILE = 20; // world meters per terrain tile

// Module-level offscreen canvas (shared across remounts)
let offCanvas: HTMLCanvasElement | null = null;
let offCtx: CanvasRenderingContext2D | null = null;
let lastKey = '';

function getOffscreen(w: number, h: number) {
  if (!offCanvas || offCanvas.width !== w || offCanvas.height !== h) {
    offCanvas = document.createElement('canvas');
    offCanvas.width = w;
    offCanvas.height = h;
    offCtx = offCanvas.getContext('2d');
  }
  return { canvas: offCanvas!, ctx: offCtx! };
}

export function TerrainMap({ locations, characters, centerX = 500, centerY = 800, className = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const locRef = useRef(locations);
  const charRef = useRef(characters);
  locRef.current = locations;
  charRef.current = characters;

  const state = useRef({
    vx: centerX, vy: centerY, zoom: 0.3,
    w: 800, h: 500,
    drag: false, dx: 0, dy: 0, dvx: 0, dvy: 0,
  });
  const [ready, setReady] = useState(false);
  const paintReq = useRef(0);

  // ── Build offscreen terrain layer ───────────────

  function buildTerrain(vx: number, vy: number, zoom: number, w: number, h: number) {
    const { ctx } = getOffscreen(w, h);
    if (!ctx) return;

    const halfW = w / 2 / zoom;
    const halfH = h / 2 / zoom;
    const minX = vx - halfW;
    const minY = vy - halfH;
    const maxX = vx + halfW;

    ctx.fillStyle = '#1a3050';
    ctx.fillRect(0, 0, w, h);

    const worldPerPx = (halfW * 2) / w;
    const toX = (wx: number) => (wx - minX) / worldPerPx;
    const toY = (wy: number) => (wy - minY) / worldPerPx;
    const tilePx = Math.max(2, TILE * zoom);

    const startTx = Math.floor(minX / TILE) * TILE;
    const startTy = Math.floor(minY / TILE) * TILE;

    for (let wx = startTx; wx <= maxX; wx += TILE) {
      for (let wy = startTy; wy <= minY + halfH * 2; wy += TILE) {
        const px = toX(wx);
        const py = toY(wy);
        const hex = getTerrainColor(sampleTerrain(wx + TILE / 2, wy + TILE / 2).type);
        ctx.fillStyle = hex;
        ctx.fillRect(px, py, tilePx + 0.5, tilePx + 0.5);
      }
    }
  }

  // ─── Main paint ──────────────────────────────────

  function paint() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = state.current;
    if (w < 50 || h < 50) return;
    canvas.width = w;
    canvas.height = h;

    const zoom = state.current.zoom;
    const vx = state.current.vx;
    const vy = state.current.vy;
    const key = `${vx.toFixed(0)},${vy.toFixed(0)},${zoom.toFixed(3)}`;

    // Rebuild terrain only when view changes
    if (key !== lastKey) {
      buildTerrain(vx, vy, zoom, w, h);
      lastKey = key;
    }

    // Blit terrain layer
    const { canvas: off } = getOffscreen(w, h);
    ctx.drawImage(off, 0, 0);

    // ── Overlays ────────────────────────────────────
    const halfW = w / 2 / zoom;
    const halfH = h / 2 / zoom;
    const minX = vx - halfW;
    const minY = vy - halfH;
    const maxX = vx + halfW;
    const maxY = vy + halfH;
    const worldPerPx = (halfW * 2) / w;

    const toSX = (wx: number) => (wx - minX) / worldPerPx;
    const toSY = (wy: number) => (wy - minY) / worldPerPx;

    // Grid
    if (100 * zoom > 3) {
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let gx = Math.floor(minX / 100) * 100; gx <= maxX; gx += 100) {
        ctx.moveTo(toSX(gx), 0); ctx.lineTo(toSX(gx), h);
      }
      for (let gy = Math.floor(minY / 100) * 100; gy <= maxY; gy += 100) {
        ctx.moveTo(0, toSY(gy)); ctx.lineTo(w, toSY(gy));
      }
      ctx.stroke();
    }
    if (1000 * zoom > 3) {
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = Math.floor(minX / 1000) * 1000; gx <= maxX; gx += 1000) {
        ctx.moveTo(toSX(gx), 0); ctx.lineTo(toSX(gx), h);
      }
      for (let gy = Math.floor(minY / 1000) * 1000; gy <= maxY; gy += 1000) {
        ctx.moveTo(0, toSY(gy)); ctx.lineTo(w, toSY(gy));
      }
      ctx.stroke();
    }

    // Locations
    const sorted = [...locRef.current].sort((a, b) =>
      ((a.type === 'region' || a.type === 'continent') ? 1 : 0) -
      ((b.type === 'region' || b.type === 'continent') ? 1 : 0));
    for (const loc of sorted) {
      const lx = toSX(loc.x - loc.w / 2);
      const ly = toSY(loc.y - loc.h / 2);
      const lw = loc.w / worldPerPx;
      const lh = loc.h / worldPerPx;
      if (lx + lw < -50 || lx > w + 50 || ly + lh < -50 || ly > h + 50) continue;
      if (lw > 2) {
        ctx.strokeStyle = loc.type === 'town' ? 'rgba(255,255,255,0.8)' : 'rgba(255,204,51,0.6)';
        ctx.lineWidth = loc.type === 'region' ? 0.5 : 1;
        ctx.setLineDash(loc.type === 'region' || loc.type === 'continent' ? [4, 3] : []);
        ctx.strokeRect(lx, ly, lw, lh);
        ctx.setLineDash([]);
      }
      if (lw > 30 && lh > 8) {
        ctx.font = '600 11px "Fira Sans", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 3;
        ctx.fillText(loc.name, lx + 3, ly + 3);
        ctx.shadowBlur = 0;
      }
    }

    // Characters
    for (const ch of charRef.current) {
      const cx = toSX(ch.x); const cy = toSY(ch.y);
      if (cx < -20 || cx > w + 20 || cy < -20 || cy > h + 20) continue;
      const r = ch.type === 'player' ? 6 : 5;
      const color = ch.type === 'player' ? '#A855F7' : '#22C55E';
      ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.fillStyle = color + '30'; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.font = '600 10px "Fira Sans", sans-serif';
      ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'bottom';
      ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
      ctx.fillText(ch.name, cx + 10, cy - 5);
      ctx.shadowBlur = 0;
    }

    // Scale bar
    const barM = zoom > 2 ? 50 : zoom > 0.5 ? 100 : 500;
    const barPx = barM / worldPerPx; const barY = h - 28;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(12, barY - 6, barPx + 6, 16);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(15, barY); ctx.lineTo(15 + barPx, barY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(15, barY - 3); ctx.lineTo(15, barY + 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(15 + barPx, barY - 3); ctx.lineTo(15 + barPx, barY + 3); ctx.stroke();
    ctx.font = '10px "Fira Code", monospace';
    ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle';
    ctx.fillText(barM >= 1000 ? `${barM / 1000}km` : `${barM}m`, 18, barY);
  }

  // ── Init ────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const resize = () => {
      state.current.w = parent.clientWidth || 800;
      state.current.h = parent.clientHeight || 500;
      lastKey = '';
      paint();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    resize();
    setReady(true);

    const onDown = (e: MouseEvent) => {
      state.current.drag = true;
      state.current.dx = e.clientX;
      state.current.dy = e.clientY;
      state.current.dvx = state.current.vx;
      state.current.dvy = state.current.vy;
    };
    const onMove = (e: MouseEvent) => {
      if (!state.current.drag) return;
      const wpp = state.current.w / 2 / state.current.zoom * 2 / state.current.w;
      state.current.vx = state.current.dvx - (e.clientX - state.current.dx) * wpp;
      state.current.vy = state.current.dvy - (e.clientY - state.current.dy) * wpp;
      if (paintReq.current) cancelAnimationFrame(paintReq.current);
      paintReq.current = requestAnimationFrame(() => { paintReq.current = 0; try { paint(); } catch (e) { console.error('[map]', e); } });
    };
    const onUp = () => {
      state.current.drag = false;
      lastKey = '';
      if (paintReq.current) cancelAnimationFrame(paintReq.current);
      paintReq.current = requestAnimationFrame(() => { paintReq.current = 0; try { paint(); } catch (e) { console.error('[map]', e); } });
    };

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      state.current.zoom = Math.max(0.02, Math.min(50, state.current.zoom * (e.deltaY > 0 ? 0.85 : 1.18)));
      lastKey = '';
      if (paintReq.current) cancelAnimationFrame(paintReq.current);
      paintReq.current = requestAnimationFrame(() => { paintReq.current = 0; try { paint(); } catch (e) { console.error('[map]', e); } });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') { state.current.zoom = Math.min(50, state.current.zoom * 1.2); lastKey = ''; paint(); }
      if (e.key === '-') { state.current.zoom = Math.max(0.02, state.current.zoom / 1.2); lastKey = ''; paint(); }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      ro.disconnect();
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
      if (paintReq.current) cancelAnimationFrame(paintReq.current);
    };
  }, []);

  return (
    <div className={`relative overflow-hidden bg-ink-900 ${className}`}
      style={{ width: '100%', height: '500px' }}>
      <canvas ref={canvasRef} className="block w-full h-full"
        style={{ cursor: state.current.drag ? 'grabbing' : 'grab' }} />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-white/50 text-xs font-mono pointer-events-none">
          Loading...
        </div>
      )}
      <div className="absolute top-3 right-3 flex flex-col gap-1 z-10">
        <button type="button" onClick={() => { state.current.zoom = Math.min(50, state.current.zoom * 1.3); lastKey = ''; paint(); }}
          className="w-7 h-7 bg-white/10 hover:bg-white/25 text-white font-mono text-sm rounded-sm cursor-pointer transition-colors flex items-center justify-center">+</button>
        <button type="button" onClick={() => { state.current.zoom = Math.max(0.02, state.current.zoom / 1.3); lastKey = ''; paint(); }}
          className="w-7 h-7 bg-white/10 hover:bg-white/25 text-white font-mono text-sm rounded-sm cursor-pointer transition-colors flex items-center justify-center">−</button>
        <button type="button" onClick={() => { state.current.vx = centerX; state.current.vy = centerY; state.current.zoom = 0.3; lastKey = ''; paint(); }}
          className="w-7 h-7 bg-white/10 hover:bg-white/25 text-white font-mono text-xs rounded-sm cursor-pointer transition-colors flex items-center justify-center">⟲</button>
      </div>
      <div className="absolute bottom-2 left-2 text-white/50 text-[9px] font-mono pointer-events-none select-none">
        ({state.current.vx.toFixed(0)}, {state.current.vy.toFixed(0)}) · {state.current.zoom.toFixed(2)}×
      </div>
    </div>
  );
}
