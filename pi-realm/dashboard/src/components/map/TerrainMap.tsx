// Terrain Map — PixiJS v8, minimal debug + full terrain

import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Text, Rectangle } from 'pixi.js';
import { sampleTerrain, getTerrainColor } from './perlin.ts';

interface LM { id: string; name: string; type: string; x: number; y: number; w: number; h: number; }
interface CD { id: string; name: string; type: string; x: number; y: number; }
interface Props { locations: LM[]; characters: CD[]; centerX?: number; centerY?: number; className?: string; }

export function TerrainMap({ locations, characters, centerX = 500, centerY = 800, className = '' }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const s = useRef({
    app: null as Application | null,
    world: null as Container | null,
    vx: centerX, vy: centerY, zoom: 0.3,
    w: 800, h: 500,
    dragging: false, dragSx: 0, dragSy: 0, dragVx: 0, dragVy: 0,
    ready: false,
  });
  const [, bump] = useState(0);

  useEffect(() => {
    const div = rootRef.current;
    if (!div || s.current.app) return;

    (async () => {
      const app = new Application();
      await app.init({
        width: div.clientWidth || 800,
        height: div.clientHeight || 500,
        background: '#1a3050',
        antialias: false,
        resolution: 1,
      });
      app.canvas.style.touchAction = 'none';
      app.canvas.style.display = 'block';
      div.appendChild(app.canvas);

      const st = s.current;
      st.app = app;
      st.w = app.screen.width;
      st.h = app.screen.height;

      const world = new Container();
      app.stage.addChild(world);
      st.world = world;

      // Events
      app.stage.eventMode = 'static';
      app.stage.hitArea = new Rectangle(0, 0, st.w, st.h);

      app.stage.on('pointerdown', (e) => {
        st.dragging = true;
        st.dragSx = e.global.x; st.dragSy = e.global.y;
        st.dragVx = st.vx; st.dragVy = st.vy;
      });
      app.stage.on('globalpointermove', (e) => {
        if (!st.dragging) return;
        st.vx = st.dragVx - (e.global.x - st.dragSx) / st.zoom;
        st.vy = st.dragVy - (e.global.y - st.dragSy) / st.zoom;
        draw(st);
      });
      app.stage.on('pointerup', () => { st.dragging = false; });
      app.stage.on('pointerupoutside', () => { st.dragging = false; });

      div.addEventListener('wheel', (e) => {
        e.preventDefault();
        st.zoom = Math.max(0.02, Math.min(50, st.zoom * (e.deltaY > 0 ? 0.85 : 1.18)));
        draw(st);
      }, { passive: false });

      window.addEventListener('keydown', (e) => {
        if (e.key === '+' || e.key === '=') { st.zoom = Math.min(50, st.zoom * 1.2); draw(st); }
        if (e.key === '-') { st.zoom = Math.max(0.02, st.zoom / 1.2); draw(st); }
      });

      const ro = new ResizeObserver(() => {
        const nw = div.clientWidth || 800;
        const nh = div.clientHeight || 500;
        st.w = nw; st.h = nh;
        app.renderer.resize(nw, nh);
        (app.stage.hitArea as Rectangle).width = nw;
        (app.stage.hitArea as Rectangle).height = nh;
        draw(st);
      });
      ro.observe(div);

      function draw(st: typeof s.current) {
        try {
          _draw(st);
        } catch (e) {
          console.error('[map] draw error', e);
        }
      }

      draw(st);
      st.ready = true;
      bump((n) => n + 1);

      return () => {
        ro.disconnect();
        app.destroy({ removeView: true, releaseGlobalResources: true });
        s.current.app = null;
      };
    })();
  }, []);

  function _draw(st: typeof s.current) {
    const app = st.app; const world = st.world;
    if (!app || !world) return;
    const w = st.w; const h = st.h;
    if (w < 50 || h < 50) return;

    const zoom = st.zoom;
    const vx = st.vx; const vy = st.vy;

    // Container transform
    world.x = w / 2;
    world.y = h / 2;
    world.scale.set(zoom);

    // Destroy previous frame
    while (world.children.length > 0) {
      try { world.removeChildAt(0).destroy({ children: true }); } catch { /* ignore */ }
    }

    // Local → world coords
    const lx = (wx: number) => wx - vx;
    const ly = (wy: number) => wy - vy;

    const halfW = w / 2 / zoom;
    const halfH = h / 2 / zoom;
    const minX = vx - halfW;
    const minY = vy - halfH;
    const maxX = vx + halfW;
    const maxY = vy + halfH;

    const g = new Graphics();
    const labels = new Container();

    // ── Terrain tiles ────────────────────────────────
    const tileSize = Math.max(5, Math.round(12 / Math.max(zoom, 0.02)));
    const startTx = Math.floor(minX / tileSize) * tileSize;
    const startTy = Math.floor(minY / tileSize) * tileSize;
    const cols = Math.ceil((maxX - startTx) / tileSize) + 1;
    const rows = Math.ceil((maxY - startTy) / tileSize) + 1;
    const maxTiles = 5000;

    if (cols * rows <= maxTiles) {
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const wx = startTx + c * tileSize;
          const wy = startTy + r * tileSize;
          const hex = getTerrainColor(sampleTerrain(wx, wy).type);
          g.rect(lx(wx), ly(wy), tileSize, tileSize).fill({ color: parseInt(hex.slice(1), 16) });
        }
      }
    } else {
      const skip = Math.round(Math.sqrt(cols * rows / maxTiles));
      for (let c = 0; c < cols; c += skip) {
        for (let r = 0; r < rows; r += skip) {
          const wx = startTx + c * tileSize;
          const wy = startTy + r * tileSize;
          const hex = getTerrainColor(sampleTerrain(wx, wy).type);
          g.rect(lx(wx), ly(wy), tileSize * skip, tileSize * skip).fill({ color: parseInt(hex.slice(1), 16) });
        }
      }
    }

    // ── Grid ──────────────────────────────────────────
    if (100 * zoom > 3) {
      g.stroke({ width: 0.5, color: 0x000000, alpha: 0.04 });
      for (let gx = Math.floor(minX / 100) * 100; gx <= maxX; gx += 100) {
        g.moveTo(lx(gx), -halfH).lineTo(lx(gx), halfH);
      }
      for (let gy = Math.floor(minY / 100) * 100; gy <= maxY; gy += 100) {
        g.moveTo(-halfW, ly(gy)).lineTo(halfW, ly(gy));
      }
      g.stroke();
    }
    if (1000 * zoom > 3) {
      g.stroke({ width: 1, color: 0x000000, alpha: 0.1 });
      for (let gx = Math.floor(minX / 1000) * 1000; gx <= maxX; gx += 1000) {
        g.moveTo(lx(gx), -halfH).lineTo(lx(gx), halfH);
      }
      for (let gy = Math.floor(minY / 1000) * 1000; gy <= maxY; gy += 1000) {
        g.moveTo(-halfW, ly(gy)).lineTo(halfW, ly(gy));
      }
      g.stroke();
    }

    // ── Locations ──────────────────────────────────
    const sorted = [...locations].sort((a, b) =>
      ((a.type === 'region' || a.type === 'continent') ? 1 : 0) -
      ((b.type === 'region' || b.type === 'continent') ? 1 : 0));
    for (const loc of sorted) {
      const x = lx(loc.x - loc.w / 2);
      const y = ly(loc.y - loc.h / 2);
      if (x + loc.w < -halfW - 50 || x > halfW + 50 || y + loc.h < -halfH - 50 || y > halfH + 50) continue;
      if (loc.w * zoom > 2) {
        const color = loc.type === 'town' ? 0xffffff : 0xffcc33;
        g.stroke({ width: 1, color, alpha: loc.type === 'region' ? 0.25 : 0.8 });
        g.rect(x, y, loc.w, loc.h).stroke();
      }
      if (loc.w * zoom > 30 && loc.h * zoom > 8) {
        labels.addChild(new Text({ text: loc.name, style: { fontSize: 10, fill: '#ffffff' }, x: x + 3, y: y + 3 }));
      }
    }

    // ── Characters ──────────────────────────────────
    for (const ch of characters) {
      const cx = lx(ch.x); const cy = ly(ch.y);
      if (cx < -halfW - 20 || cx > halfW + 20 || cy < -halfH - 20 || cy > halfH + 20) continue;
      const r = ch.type === 'player' ? 5 : 4;
      const color = ch.type === 'player' ? 0xA855F7 : 0x22C55E;
      g.circle(cx, cy, r + 2).fill({ color, alpha: 0.15 });
      g.circle(cx, cy, r).fill({ color });
      g.circle(cx, cy, r).stroke({ width: 1.5, color: 0xffffff });
      labels.addChild(new Text({ text: ch.name, style: { fontSize: 10, fill: '#ffffff' }, x: cx + 8, y: cy - 14 }));
    }

    world.addChild(g);
    world.addChild(labels);
  }

  return (
    <div ref={rootRef} className={`relative overflow-hidden bg-ink-900 ${className}`}
      style={{ width: '100%', height: '500px' }}>
      {!s.current.ready && (
        <div className="absolute inset-0 flex items-center justify-center text-white/50 text-xs font-mono">Initializing...</div>
      )}
      <div className="absolute top-3 right-3 flex flex-col gap-1 z-10">
        <button type="button" onClick={() => { s.current.zoom = Math.min(50, s.current.zoom * 1.3); draw(s.current); }}
          className="w-7 h-7 bg-white/10 hover:bg-white/25 text-white font-mono text-sm rounded-sm cursor-pointer transition-colors flex items-center justify-center">+</button>
        <button type="button" onClick={() => { s.current.zoom = Math.max(0.02, s.current.zoom / 1.3); draw(s.current); }}
          className="w-7 h-7 bg-white/10 hover:bg-white/25 text-white font-mono text-sm rounded-sm cursor-pointer transition-colors flex items-center justify-center">−</button>
        <button type="button" onClick={() => { s.current.vx = centerX; s.current.vy = centerY; s.current.zoom = 0.3; draw(s.current); }}
          className="w-7 h-7 bg-white/10 hover:bg-white/25 text-white font-mono text-xs rounded-sm cursor-pointer transition-colors flex items-center justify-center">⟲</button>
      </div>
      <div className="absolute bottom-2 left-2 text-white/50 text-[9px] font-mono pointer-events-none select-none">
        ({s.current.vx.toFixed(0)}, {s.current.vy.toFixed(0)}) · {s.current.zoom.toFixed(2)}×
      </div>
    </div>
  );

  function draw(st: typeof s.current) {
    try { _draw(st); } catch (e) { console.error('[map] draw fail', e); }
  }
}
