// Terrain Map — PixiJS v8 (WebGL/WebGPU) following pixijs-skills conventions
// - Graphics: shape().fill().stroke() chain (NOT beginFill/drawRect)
// - Text: new Text({ text, style }) (NOT positional args)
// - Drag: globalpointermove (NOT pointermove)
// - Container: isRenderGroup for large subtrees
// - Terrain: render to offscreen canvas → Texture.from → Sprite
// - Overlays: rebuild only on view change (Graphics NOT redrawn per frame)

import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Sprite, Texture, Text } from 'pixi.js';
import { sampleTerrain, getTerrainColor } from './perlin.ts';

interface LM { id: string; name: string; type: string; x: number; y: number; w: number; h: number; }
interface CD { id: string; name: string; type: string; x: number; y: number; }
interface Props { locations: LM[]; characters: CD[]; centerX?: number; centerY?: number; className?: string; }

const TILE_SIZE = 40; // meters per terrain tile (higher = fewer tiles = faster)
const PPM = 1 / TILE_SIZE; // pixels per meter on terrain texture
const TEX_SIZE = 256; // terrain texture size (px) — smaller = much faster generation
const TEX_WORLD = TEX_SIZE / PPM; // world meters covered by texture

export function TerrainMap({ locations, characters, centerX = 500, centerY = 800, className = '' }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const state = useRef({
    app: null as Application | null,
    world: null as Container | null,  // scaled container for zoom
    terrain: null as Sprite | null,
    overlay: null as Container | null,
    vx: centerX, vy: centerY,
    zoom: 0.3,
    texCX: centerX, texCY: centerY,
    w: 800, h: 400,
    dragging: false, dragSx: 0, dragSy: 0, dragVx: 0, dragVy: 0,
  });
  const [ready, setReady] = useState(false);
  const rebuildReq = useRef(true);

  // ── Init ────────────────────────────────────────

  useEffect(() => {
    const div = rootRef.current;
    if (!div || state.current.app) return;

    (async () => {
      const app = new Application();
      await app.init({
        width: Math.max(100, div.clientWidth || 800),
        height: Math.max(100, div.clientHeight || 500),
        background: '#1a3a5c',
        antialias: false,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        preference: 'webgl',
      });
      div.appendChild(app.canvas);

      const s = state.current;
      s.app = app;
      s.w = app.screen.width;
      s.h = app.screen.height;

      // ── Scene: world container (zoom by scale) ──
      const world = new Container({ isRenderGroup: true });
      app.stage.addChild(world);
      s.world = world;

      // Overlay container (separate from terrain for z-ordering)
      const overlay = new Container();
      world.addChild(overlay);
      s.overlay = overlay;

      // ── Drag (globalpointermove) ────────────────
      app.stage.eventMode = 'static';
      app.stage.hitArea = app.screen;

      app.stage.on('pointerdown', (e) => {
        s.dragging = true;
        s.dragSx = e.global.x;
        s.dragSy = e.global.y;
        s.dragVx = s.vx;
        s.dragVy = s.vy;
      });

      app.stage.on('globalpointermove', (e) => {
        if (!s.dragging) return;
        const factor = s.zoom * PPM;
        if (factor <= 0) return;
        s.vx = s.dragVx - (e.global.x - s.dragSx) / factor;
        s.vy = s.dragVy - (e.global.y - s.dragSy) / factor;
        rebuildReq.current = true;
        tick();
      });

      const endDrag = () => { s.dragging = false; };
      app.stage.on('pointerup', endDrag);
      app.stage.on('pointerupoutside', endDrag);

      // ── Wheel zoom ──────────────────────────────
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        s.zoom = Math.max(0.02, Math.min(50, s.zoom * (e.deltaY > 0 ? 0.85 : 1.18)));
        rebuildReq.current = true;
        tick();
      };
      div.addEventListener('wheel', onWheel, { passive: false });

      // ── Keyboard ────────────────────────────────
      const onKey = (e: KeyboardEvent) => {
        if (e.key === '+' || e.key === '=') { s.zoom = Math.min(50, s.zoom * 1.2); rebuildReq.current = true; tick(); }
        if (e.key === '-') { s.zoom = Math.max(0.02, s.zoom / 1.2); rebuildReq.current = true; tick(); }
      };
      window.addEventListener('keydown', onKey);

      // ── Resize ─────────────────────────────────
      const ro = new ResizeObserver(() => {
        const nw = div.clientWidth || 800;
        const nh = div.clientHeight || 400;
        if (nw !== s.w || nh !== s.h) {
          s.w = nw; s.h = nh;
          app.renderer.resize(nw, nh);
          rebuildReq.current = true;
          tick();
        }
      });
      ro.observe(div);

      const tick = () => {
        try { render(s); } catch (e) { console.warn('[map] render error', e); }
      };
      tick();
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

  // ── Render ──────────────────────────────────────

  function render(s: typeof state.current) {
    const app = s.app;
    const world = s.world;
    if (!app || !world) return;
    const { w, h } = s;
    if (w < 50 || h < 50) return;

    const zoom = s.zoom;
    const vx = s.vx;
    const vy = s.vy;

    // Position and scale world container
    world.x = w / 2;
    world.y = h / 2;
    world.scale.set(zoom);

    // Visible world bounds (in world coords)
    const halfW = (w / 2 / zoom) / PPM;
    const halfH = (h / 2 / zoom) / PPM;
    const minX = vx - halfW;
    const minY = vy - halfH;
    const maxX = vx + halfW;
    const maxY = vy + halfH;

    // ── Terrain texture (rebuild when panned too far) ──
    const drift = Math.sqrt((vx - s.texCX) ** 2 + (vy - s.texCY) ** 2);
    const rebuildTex = drift > TEX_WORLD * 0.25 || rebuildReq.current;

    if (rebuildTex) {
      if (s.terrain) {
        world.removeChild(s.terrain);
        s.terrain.destroy();
        s.terrain = null;
      }

      // Build offscreen canvas at fixed TEX_SIZE
      const texStartX = vx - TEX_WORLD / 2;
      const texStartY = vy - TEX_WORLD / 2;
      const canvas = document.createElement('canvas');
      canvas.width = TEX_SIZE;
      canvas.height = TEX_SIZE;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const id = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        const d = id.data;
        const step = TILE_SIZE;
        for (let py = 0; py < TEX_SIZE; py++) {
          for (let px = 0; px < TEX_SIZE; px++) {
            const wx = texStartX + px * step;
            const wy = texStartY + py * step;
            const c = getTerrainColor(sampleTerrain(wx, wy).type);
            const i = (py * TEX_SIZE + px) * 4;
            d[i] = parseInt(c.slice(1, 3), 16) || 0;
            d[i + 1] = parseInt(c.slice(3, 5), 16) || 0;
            d[i + 2] = parseInt(c.slice(5, 7), 16) || 0;
            d[i + 3] = 255;
          }
        }
        ctx.putImageData(id, 0, 0);
      }

      const texture = Texture.from(canvas);
      const sprite = new Sprite({ texture });
      // Position sprite in world coords
      sprite.x = texStartX;
      sprite.y = texStartY;
      sprite.scale.set(PPM);
      world.addChildAt(sprite, 0); // behind overlay
      s.terrain = sprite;
      s.texCX = vx;
      s.texCY = vy;
      rebuildReq.current = false;
    }

    // ── Overlays (grid, locations, chars) ──────────
    // Clear previous overlay
    s.overlay?.removeChildren().forEach((c) => c.destroy());

    const overlay = new Graphics();
    const labels = new Container();

    const toX = (wx: number) => wx - minX;
    const toY = (wy: number) => wy - minY;
    const vw = halfW * 2;
    const vh = halfH * 2;

    // 100m grid (fine)
    if (100 / PPM * zoom > 3) {
      overlay.stroke({ width: 0.5, color: 0x000000, alpha: 0.04 });
      overlay.moveTo(0, 0);
      for (let gx = Math.floor(minX / 100) * 100; gx <= maxX; gx += 100) {
        overlay.moveTo(toX(gx), 0).lineTo(toX(gx), vh);
      }
      for (let gy = Math.floor(minY / 100) * 100; gy <= maxY; gy += 100) {
        overlay.moveTo(0, toY(gy)).lineTo(vw, toY(gy));
      }
      overlay.stroke();
    }

    // 1km grid (bold)
    if (1000 / PPM * zoom > 3) {
      overlay.stroke({ width: 1, color: 0x000000, alpha: 0.1 });
      for (let gx = Math.floor(minX / 1000) * 1000; gx <= maxX; gx += 1000) {
        overlay.moveTo(toX(gx), 0).lineTo(toX(gx), vh);
      }
      for (let gy = Math.floor(minY / 1000) * 1000; gy <= maxY; gy += 1000) {
        overlay.moveTo(0, toY(gy)).lineTo(vw, toY(gy));
      }
      overlay.stroke();
    }

    // Locations
    const sorted = [...locations].sort((a, b) =>
      ((a.type === 'region' || a.type === 'continent') ? 0 : 1) -
      ((b.type === 'region' || b.type === 'continent') ? 0 : 1));
    for (const loc of sorted) {
      const lx = toX(loc.x - loc.w / 2);
      const ly = toY(loc.y - loc.h / 2);
      if (lx + loc.w < -50 || lx > vw + 50 || ly + loc.h < -50 || ly > vh + 50) continue;
      if (loc.w * zoom > 2) {
        const color = loc.type === 'town' ? 0xffffff : loc.type === 'building' ? 0xffcc33 : loc.type === 'region' ? 0xffffff : 0xcccccc;
        const alpha = loc.type === 'region' ? 0.25 : 0.8;
        overlay.stroke({ width: loc.type === 'region' ? 0.5 : 1, color, alpha });
        overlay.rect(lx, ly, loc.w, loc.h).stroke();
      }
      if (loc.w * zoom > 30 && loc.h * zoom > 8) {
        labels.addChild(new Text({
          text: loc.name,
          style: { fontSize: 10, fill: '#ffffff', fontFamily: 'Fira Sans' },
          x: lx + 2, y: ly + 2,
        }));
      }
    }

    // Characters
    for (const ch of characters) {
      const cx = toX(ch.x);
      const cy = toY(ch.y);
      if (cx < -20 || cx > vw + 20 || cy < -20 || cy > vh + 20) continue;
      const r = ch.type === 'player' ? 5 : 4;
      const color = ch.type === 'player' ? 0xA855F7 : 0x22C55E;
      overlay.circle(cx, cy, r + 2).fill({ color, alpha: 0.15 });
      overlay.circle(cx, cy, r).fill({ color });
      overlay.circle(cx, cy, r).stroke({ width: 1.5, color: 0xffffff });
      labels.addChild(new Text({
        text: ch.name,
        style: { fontSize: 10, fill: '#ffffff', fontFamily: 'Fira Sans' },
        x: cx + 8, y: cy - 14,
      }));
    }

    s.overlay!.addChild(overlay);
    s.overlay!.addChild(labels);
  }

  return (
    <div ref={rootRef} className={`relative overflow-hidden bg-ink-900 ${className}`}
      style={{ width: '100%', height: '500px' }}>
      {!ready && <div className="absolute inset-0 flex items-center justify-center text-white/50 text-xs font-mono">Initializing...</div>}
    </div>
  );
}
