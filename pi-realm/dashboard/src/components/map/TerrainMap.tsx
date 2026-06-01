// Terrain Map — PixiJS v8, clean coordinate system, drag + zoom + control buttons

import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Text, Rectangle } from 'pixi.js';
import { sampleTerrain, getTerrainColor } from './perlin.ts';

interface LM { id: string; name: string; type: string; x: number; y: number; w: number; h: number; }
interface CD { id: string; name: string; type: string; x: number; y: number; }
interface Props { locations: LM[]; characters: CD[]; centerX?: number; centerY?: number; className?: string; }

export function TerrainMap({ locations, characters, centerX = 500, centerY = 800, className = '' }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const state = useRef({
    app: null as Application | null,
    world: null as Container | null,
    vx: centerX, vy: centerY,
    zoom: 0.3,
    w: 800, h: 500,
    dragging: false, dragSx: 0, dragSy: 0, dragVx: 0, dragVy: 0,
    ready: false,
  });
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const div = rootRef.current;
    if (!div || state.current.app) return;

    (async () => {
      const w0 = div.clientWidth || 800;
      const h0 = div.clientHeight || 500;
      const app = new Application();

      try {
        await app.init({
          width: w0, height: h0,
          background: '#1a3a5c',
          antialias: false,
          resolution: 1,
        });
      } catch {
        div.innerHTML = '<div style="padding:20px;color:white;font-size:12px">WebGL unavailable</div>';
        return;
      }

      app.canvas.style.touchAction = 'none';
      div.appendChild(app.canvas);
      app.canvas.style.display = 'block';

      const s = state.current;
      s.app = app;
      s.w = w0; s.h = h0;

      const world = new Container();
      app.stage.addChild(world);
      s.world = world;

      // HitArea & Events
      app.stage.eventMode = 'static';
      app.stage.hitArea = new Rectangle(0, 0, w0, h0);

      app.stage.on('pointerdown', (e) => {
        s.dragging = true;
        s.dragSx = e.global.x; s.dragSy = e.global.y;
        s.dragVx = s.vx; s.dragVy = s.vy;
      });

      app.stage.on('globalpointermove', (e) => {
        if (!s.dragging) return;
        s.vx = s.dragVx - (e.global.x - s.dragSx) / s.zoom;
        s.vy = s.dragVy - (e.global.y - s.dragSy) / s.zoom;
        doDraw();
      });

      app.stage.on('pointerup', () => { s.dragging = false; });
      app.stage.on('pointerupoutside', () => { s.dragging = false; });

      // Wheel
      div.addEventListener('wheel', (e) => {
        e.preventDefault();
        s.zoom = Math.max(0.02, Math.min(50, s.zoom * (e.deltaY > 0 ? 0.85 : 1.18)));
        doDraw();
      }, { passive: false });

      // Keyboard
      window.addEventListener('keydown', (e) => {
        if (e.key === '+' || e.key === '=') { s.zoom = Math.min(50, s.zoom * 1.2); doDraw(); }
        if (e.key === '-') { s.zoom = Math.max(0.02, s.zoom / 1.2); doDraw(); }
      });

      // Resize
      const ro = new ResizeObserver(() => {
        const nw = div.clientWidth || 800;
        const nh = div.clientHeight || 500;
        if (nw !== s.w || nh !== s.h) {
          s.w = nw; s.h = nh;
          app.renderer.resize(nw, nh);
          (app.stage.hitArea as Rectangle).width = nw;
          (app.stage.hitArea as Rectangle).height = nh;
          doDraw();
        }
      });
      ro.observe(div);

      const doDraw = () => { try { draw(s); } catch (e) { console.warn('[map] draw:', e); } };

      doDraw();
      s.ready = true;
      forceUpdate((n) => n + 1);

      return () => {
        ro.disconnect();
        app.destroy({ removeView: true, releaseGlobalResources: true });
        s.app = null;
      };
    })();
  }, []);

  function draw(s: typeof state.current) {
    const app = s.app; const world = s.world;
    if (!app || !world) return;
    const w = s.w; const h = s.h;
    if (w < 50 || h < 50) return;

    const zoom = s.zoom;
    const vx = s.vx; const vy = s.vy;

    // Container: center of screen, scaled by zoom
    world.x = w / 2;
    world.y = h / 2;
    world.scale.set(zoom);

    // Viewport in world coords (local to container)
    const halfW = w / 2 / zoom;
    const halfH = h / 2 / zoom;
    const minX = vx - halfW;
    const minY = vy - halfH;
    const maxX = vx + halfW;

    // Remove previous frame
    world.removeChildren().forEach((c) => { try { c.destroy({ children: true }); } catch { /* ignore */ } });

    const g = new Graphics();
    const labels = new Container();

    // Local coord helpers: origin at (0,0) = view center = screen center
    const lx = (wx: number) => wx - vx;
    const ly = (wy: number) => wy - vy;

    // ── Terrain tiles ────────────────────────────────
    const tileSize = Math.max(5, Math.round(12 / Math.max(zoom, 0.02)));
    const startTx = Math.floor(minX / tileSize) * tileSize;
    const startTy = Math.floor(minY / tileSize) * tileSize;
    const cols = Math.ceil((maxX - startTx) / tileSize) + 1;
    const rows = Math.ceil((halfH * 2 - (startTy - minY)) / tileSize) + 1;
    const maxTiles = 5000;

    if (cols * rows <= maxTiles) {
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const wx = startTx + c * tileSize;
          const wy = startTy + r * tileSize;
          const color = getTerrainColor(sampleTerrain(wx, wy).type);
          g.rect(lx(wx), ly(wy), tileSize, tileSize).fill({ color: parseInt(color.slice(1), 16) });
        }
      }
    } else {
      const skip = Math.max(1, Math.round(Math.sqrt(cols * rows / maxTiles)));
      for (let c = 0; c < cols; c += skip) {
        for (let r = 0; r < rows; r += skip) {
          const wx = startTx + c * tileSize;
          const wy = startTy + r * tileSize;
          const color = getTerrainColor(sampleTerrain(wx, wy).type);
          g.rect(lx(wx), ly(wy), tileSize * skip, tileSize * skip).fill({ color: parseInt(color.slice(1), 16) });
        }
      }
    }

    // ── Grid ──────────────────────────────────────────
    if (100 * zoom > 3) {
      g.stroke({ width: 0.5, color: 0x000000, alpha: 0.04 });
      for (let gx = Math.floor(minX / 100) * 100; gx <= maxX; gx += 100) {
        g.moveTo(lx(gx), -halfH).lineTo(lx(gx), halfH);
      }
      for (let gy = Math.floor(minY / 100) * 100; gy <= minY + halfH * 2; gy += 100) {
        g.moveTo(-halfW, ly(gy)).lineTo(halfW, ly(gy));
      }
      g.stroke();
    }
    if (1000 * zoom > 3) {
      g.stroke({ width: 1, color: 0x000000, alpha: 0.1 });
      for (let gx = Math.floor(minX / 1000) * 1000; gx <= maxX; gx += 1000) {
        g.moveTo(lx(gx), -halfH).lineTo(lx(gx), halfH);
      }
      for (let gy = Math.floor(minY / 1000) * 1000; gy <= minY + halfH * 2; gy += 1000) {
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
        const color = loc.type === 'town' ? 0xffffff : loc.type === 'building' ? 0xffcc33 : 0xffffff;
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

  // ── Render ──────────────────────────────────────

  return (
    <div ref={rootRef} className={`relative overflow-hidden bg-ink-900 ${className}`}
      style={{ width: '100%', height: '500px' }}>
      {!state.current.ready && (
        <div className="absolute inset-0 flex items-center justify-center text-white/50 text-xs font-mono">
          Initializing...
        </div>
      )}

      {/* Controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1 z-10">
        <button type="button" onClick={() => { state.current.zoom = Math.min(50, state.current.zoom * 1.3); try { draw(state.current); } catch {} }}
          className="w-7 h-7 bg-white/10 hover:bg-white/25 text-white font-mono text-sm rounded-sm cursor-pointer transition-colors flex items-center justify-center">+</button>
        <button type="button" onClick={() => { state.current.zoom = Math.max(0.02, state.current.zoom / 1.3); try { draw(state.current); } catch {} }}
          className="w-7 h-7 bg-white/10 hover:bg-white/25 text-white font-mono text-sm rounded-sm cursor-pointer transition-colors flex items-center justify-center">−</button>
        <button type="button" onClick={() => { state.current.vx = centerX; state.current.vy = centerY; state.current.zoom = 0.3; try { draw(state.current); } catch {} }}
          className="w-7 h-7 bg-white/10 hover:bg-white/25 text-white font-mono text-xs rounded-sm cursor-pointer transition-colors flex items-center justify-center">⟲</button>
      </div>

      {/* Info */}
      <div className="absolute bottom-2 left-2 text-white/50 text-[9px] font-mono pointer-events-none select-none">
        ({state.current.vx.toFixed(0)}, {state.current.vy.toFixed(0)}) · {state.current.zoom.toFixed(2)}×
      </div>
    </div>
  );
}
