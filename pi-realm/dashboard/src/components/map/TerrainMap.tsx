// Terrain Map — PixiJS v8, terrain rendered as Graphics rects (no texture issues)
// Overlays (locations, chars, grid) rendered together in one pass

import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { sampleTerrain, getTerrainColor } from './perlin.ts';

interface LM { id: string; name: string; type: string; x: number; y: number; w: number; h: number; }
interface CD { id: string; name: string; type: string; x: number; y: number; }
interface Props { locations: LM[]; characters: CD[]; centerX?: number; centerY?: number; className?: string; }

// Coordinate system: container scaled by zoom. 1 world meter = zoom screen pixels.

export function TerrainMap({ locations, characters, centerX = 500, centerY = 800, className = '' }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const state = useRef({
    app: null as Application | null,
    world: null as Container | null,
    vx: centerX, vy: centerY,
    zoom: 0.3,
    w: 800, h: 500,
    dragging: false, dragSx: 0, dragSy: 0, dragVx: 0, dragVy: 0,
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const div = rootRef.current;
    if (!div || state.current.app) return;

    (async () => {
      const app = new Application();
      await app.init({
        width: div.clientWidth || 800,
        height: div.clientHeight || 500,
        background: '#1a3a5c',
        antialias: false,
        resolution: 1,
      });
      div.appendChild(app.canvas);

      const s = state.current;
      s.app = app;
      s.w = app.screen.width;
      s.h = app.screen.height;

      const world = new Container();
      app.stage.addChild(world);
      s.world = world;

      // Drag
      app.stage.eventMode = 'static';
      app.stage.hitArea = app.screen;
      app.stage.on('pointerdown', (e) => {
        s.dragging = true;
        s.dragSx = e.global.x; s.dragSy = e.global.y;
        s.dragVx = s.vx; s.dragVy = s.vy;
      });
      app.stage.on('globalpointermove', (e) => {
        if (!s.dragging) return;
        const f = s.zoom;
        if (f <= 0) return;
        s.vx = s.dragVx - (e.global.x - s.dragSx) / f;
        s.vy = s.dragVy - (e.global.y - s.dragSy) / f;
        draw();
      });
      const endDrag = () => { s.dragging = false; };
      app.stage.on('pointerup', endDrag);
      app.stage.on('pointerupoutside', endDrag);

      // Wheel
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        s.zoom = Math.max(0.02, Math.min(50, s.zoom * (e.deltaY > 0 ? 0.85 : 1.18)));
        draw();
      };
      div.addEventListener('wheel', onWheel, { passive: false });

      // Keyboard
      const onKey = (e: KeyboardEvent) => {
        if (e.key === '+' || e.key === '=') { s.zoom = Math.min(50, s.zoom * 1.2); draw(); }
        if (e.key === '-') { s.zoom = Math.max(0.02, s.zoom / 1.2); draw(); }
      };
      window.addEventListener('keydown', onKey);

      // Resize
      const ro = new ResizeObserver(() => {
        const nw = div.clientWidth || 800;
        const nh = div.clientHeight || 500;
        if (nw !== s.w || nh !== s.h) {
          s.w = nw; s.h = nh;
          app.renderer.resize(nw, nh);
          draw();
        }
      });
      ro.observe(div);

      draw();
      setReady(true);

      return () => {
        ro.disconnect();
        window.removeEventListener('keydown', onKey);
        div.removeEventListener('wheel', onWheel);
        app.destroy({ removeView: true, releaseGlobalResources: true });
        s.app = null;
      };
    })();
  }, []);

  function draw() {
    const app = state.current.app;
    const world = state.current.world;
    if (!app || !world) return;

    const zoom = state.current.zoom;
    const vx = state.current.vx;
    const vy = state.current.vy;
    const w = state.current.w;
    const h = state.current.h;

    if (w < 50 || h < 50) return;

    world.removeChildren().forEach((c) => c.destroy());

    // Container transform: zoom
    world.x = w / 2;
    world.y = h / 2;
    world.scale.set(zoom);

    // World bounds (relative to view center vx, vy)
    const halfW = w / 2 / zoom;  // half viewport in world meters
    const halfH = h / 2 / zoom;
    const minX = vx - halfW;
    const minY = vy - halfH;

    const g = new Graphics();
    const t = new Container();

    // Local coords: origin (0,0) = view center → maps to world.x/y = screen center
    const tx = (wx: number) => wx - vx;
    const ty = (wy: number) => wy - vy;
    const maxX = vx + halfW;
    const maxY = vy + halfH;

    // ── Terrain tiles ────────────────────────────────
    const tileSize = Math.max(5, Math.round(12 / Math.max(zoom, 0.05)));
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
          const color = getTerrainColor(sampleTerrain(wx, wy).type);
          g.rect(tx(wx), ty(wy), tileSize, tileSize).fill({ color: parseInt(color.slice(1), 16) });
        }
      }
    } else {
      // Downsample: skip tiles to stay under limit (keep it smooth)
      const skip = Math.max(1, Math.round(Math.sqrt(cols * rows / maxTiles)));
      for (let c = 0; c < cols; c += skip) {
        for (let r = 0; r < rows; r += skip) {
          const wx = startTx + c * tileSize;
          const wy = startTy + r * tileSize;
          const color = getTerrainColor(sampleTerrain(wx, wy).type);
          g.rect(tx(wx), ty(wy), tileSize * skip, tileSize * skip).fill({ color: parseInt(color.slice(1), 16) });
        }
      }
    }

    // ── Grid ──────────────────────────────────────────
    if (100 * zoom > 3) {
      g.stroke({ width: 0.5, color: 0x000000, alpha: 0.04 });
      for (let gx = Math.floor(minX / 100) * 100; gx <= maxX; gx += 100) {
        g.moveTo(tx(gx), -halfH).lineTo(tx(gx), halfH);
      }
      for (let gy = Math.floor(minY / 100) * 100; gy <= maxY; gy += 100) {
        g.moveTo(-halfW, ty(gy)).lineTo(halfW, ty(gy));
      }
      g.stroke();
    }
    if (1000 * zoom > 3) {
      g.stroke({ width: 1, color: 0x000000, alpha: 0.1 });
      for (let gx = Math.floor(minX / 1000) * 1000; gx <= maxX; gx += 1000) {
        g.moveTo(tx(gx), -halfH).lineTo(tx(gx), halfH);
      }
      for (let gy = Math.floor(minY / 1000) * 1000; gy <= maxY; gy += 1000) {
        g.moveTo(-halfW, ty(gy)).lineTo(halfW, ty(gy));
      }
      g.stroke();
    }

    // ── Locations ──────────────────────────────────────
    const sorted = [...locations].sort((a, b) =>
      ((a.type === 'region' || a.type === 'continent') ? 1 : 0) -
      ((b.type === 'region' || b.type === 'continent') ? 1 : 0));
    for (const loc of sorted) {
      const lx = tx(loc.x - loc.w / 2);
      const ly = ty(loc.y - loc.h / 2);
      if (lx + loc.w < -halfW - 50 || lx > halfW + 50 || ly + loc.h < -halfH - 50 || ly > halfH + 50) continue;
      if (loc.w * zoom > 2) {
        const color = loc.type === 'town' ? 0xffffff : loc.type === 'building' ? 0xffcc33 : 0xffffff;
        const alpha = loc.type === 'region' ? 0.25 : 0.8;
        g.stroke({ width: loc.type === 'region' ? 0.5 : 1, color, alpha });
        g.rect(lx, ly, loc.w, loc.h).stroke();
      }
      if (loc.w * zoom > 30 && loc.h * zoom > 8) {
        t.addChild(new Text({ text: loc.name, style: { fontSize: 10, fill: '#ffffff' }, x: lx + 3, y: ly + 3 }));
      }
    }

    // ── Characters ──────────────────────────────────
    for (const ch of characters) {
      const cx = tx(ch.x); const cy = ty(ch.y);
      if (cx < -halfW - 20 || cx > halfW + 20 || cy < -halfH - 20 || cy > halfH + 20) continue;
      const r = ch.type === 'player' ? 5 : 4;
      const color = ch.type === 'player' ? 0xA855F7 : 0x22C55E;
      g.circle(cx, cy, r + 2).fill({ color, alpha: 0.15 });
      g.circle(cx, cy, r).fill({ color });
      g.circle(cx, cy, r).stroke({ width: 1.5, color: 0xffffff });
      t.addChild(new Text({ text: ch.name, style: { fontSize: 10, fill: '#ffffff' }, x: cx + 8, y: cy - 14 }));
    }

    world.addChild(g);
    world.addChild(t);
  }

  return (
    <div ref={rootRef} className={`relative overflow-hidden bg-ink-900 ${className}`}
      style={{ width: '100%', height: '500px' }}>
      {!ready && <div className="absolute inset-0 flex items-center justify-center text-white/50 text-xs font-mono">Initializing...</div>}
    </div>
  );
}
