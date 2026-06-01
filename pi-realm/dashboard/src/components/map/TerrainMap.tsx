// Terrain Map — PixiJS (WebGL) with zero-CPU drag/zoom
// Terrain regenerated on demand; view transforms are GPU-only

import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Sprite, Texture, Text } from 'pixi.js';
import { sampleTerrain, getTerrainColor } from './perlin.ts';

interface LocationMarker { id: string; name: string; type: string; x: number; y: number; w: number; h: number; }
interface CharacterDot { id: string; name: string; type: string; x: number; y: number; }
interface Props { locations: LocationMarker[]; characters: CharacterDot[]; centerX?: number; centerY?: number; className?: string; }

const TILE_W = 15;  // world meters per tile
const TILE_P = 8;   // pixels per tile on texture
const WPX = TILE_P / TILE_W; // pixels per world meter at zoom=1

export function TerrainMap({ locations, characters, centerX = 500, centerY = 800, className = '' }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  // All mutable state lives in refs to avoid React re-render loops
  const state = useRef({
    app: null as Application | null,
    tc: null as Container | null,      // terrain container (root of world-space)
    sprite: null as Sprite | null,
    overlay: null as Graphics | null,
    labels: null as Container | null,
    vx: centerX, vy: centerY,          // view center (world coords)
    zoom: 0.2,                          // view zoom
    texCX: 0, texCY: 0,                // terrain texture center (world coords)
    w: 800, h: 600,
    dragging: false,
    dragSx: 0, dragSy: 0,              // drag start (screen)
    dragVx: 0, dragVy: 0,             // view center at drag start
  });

  // ── Init PixiJS ────────────────────────────────

  useEffect(() => {
    const div = rootRef.current;
    if (!div || state.current.app) return;

    (async () => {
      const w0 = div.clientWidth || 800;
      const h0 = div.clientHeight || 400;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const app = new Application();
      await app.init({
        width: w0,
        height: h0,
        background: '#1a3a5c',
        antialias: false,
        resolution: dpr,
        autoDensity: true,
      });
      div.appendChild(app.canvas);
      const s = state.current;
      s.app = app;

      // Root container for all world-space objects, scaled by zoom
      const tc = new Container();
      app.stage.addChild(tc);
      s.tc = tc;

      // Handle WebGL context loss
      app.canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        console.warn('[map] WebGL context lost, reloading...');
        setTimeout(() => window.location.reload(), 1000);
      });

      // Enable stage interaction
      app.stage.eventMode = 'static';
      app.stage.hitArea = app.screen;

      app.stage.on('pointerdown', (e) => {
        s.dragging = true;
        s.dragSx = e.global.x;
        s.dragSy = e.global.y;
        s.dragVx = s.vx;
        s.dragVy = s.vy;
      });

      app.stage.on('pointermove', (e) => {
        if (!s.dragging) return;
        const dx = (e.global.x - s.dragSx) / s.zoom / WPX;
        const dy = (e.global.y - s.dragSy) / s.zoom / WPX;
        s.vx = s.dragVx - dx;
        s.vy = s.dragVy - dy;
        render(s);
      });

      const endDrag = () => { s.dragging = false; };
      app.stage.on('pointerup', endDrag);
      app.stage.on('pointerupoutside', endDrag);

      // Wheel zoom (DOM event for non-passive)
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.85 : 1.18;
        s.zoom = Math.max(0.02, Math.min(50, s.zoom * factor));
        render(s);
      };
      div.addEventListener('wheel', onWheel, { passive: false });

      // Keyboard
      const onKey = (e: KeyboardEvent) => {
        if (e.key === '+' || e.key === '=') { s.zoom = Math.min(50, s.zoom * 1.2); render(s); }
        if (e.key === '-') { s.zoom = Math.max(0.02, s.zoom / 1.2); render(s); }
      };
      window.addEventListener('keydown', onKey);

      // Resize (manual)
      const ro = new ResizeObserver(() => {
        const nw = div.clientWidth || 800;
        const nh = div.clientHeight || 400;
        if (nw !== app.screen.width || nh !== app.screen.height) {
          app.renderer.resize(nw, nh);
        }
        s.w = nw;
        s.h = nh;
        render(s);
      });
      ro.observe(div);

      // Initial render
      s.w = app.screen.width;
      s.h = app.screen.height;
      render(s);
      setReady(true);

      return () => {
        ro.disconnect();
        window.removeEventListener('keydown', onKey);
        div.removeEventListener('wheel', onWheel);
        app.destroy(true);
        s.app = null;
      };
    })();
  }, []);

  // ── Render ──────────────────────────────────────

  function render(s: typeof state.current) {
    const app = s.app;
    const tc = s.tc;
    if (!app || !tc) return;
    const w = s.w;
    const h = s.h;
    if (w === 0 || h === 0) return;

    const zoom = s.zoom;
    const vx = s.vx;
    const vy = s.vy;

    // Center the container, scale by zoom
    tc.x = w / 2;
    tc.y = h / 2;
    tc.scale.set(zoom);

    // World bounds visible on screen (in world coords, relative to container origin)
    const halfW = (w / 2 / zoom) / WPX;
    const halfH = (h / 2 / zoom) / WPX;
    const minX = vx - halfW;
    const minY = vy - halfH;

    // ── Fixed-size terrain texture ────────────────
    // At low zoom: 2048px covers wide area; at high zoom: 512px is enough
    const TEX_SIZE = zoom < 0.5 ? 2048 : zoom < 1 ? 1024 : 512;
    const texWorldW = TEX_SIZE / WPX; // world meters the texture covers
    const texWorldH = TEX_SIZE / WPX;
    const rebuildThresh = texWorldW * 0.3;
    const needRebuild = Math.sqrt((vx - s.texCX) ** 2 + (vy - s.texCY) ** 2) > rebuildThresh;

    if (needRebuild) {
      if (s.sprite) { tc.removeChild(s.sprite); s.sprite.destroy(); s.sprite = null; }

      // Build fixed-size texture centered on current view
      const texStartX = vx - texWorldW / 2;
      const texStartY = vy - texWorldH / 2;

      // Canvas: 1 pixel = 1 tile
      const TILE_SIZE = WPX; // world units per pixel on canvas = meters per tile
      const canvas = document.createElement('canvas');
      canvas.width = TEX_SIZE;
      canvas.height = TEX_SIZE;
      const ctx = canvas.getContext('2d')!;
      const imageData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
      const data = imageData.data;

      // Batch fill via ImageData — much faster than fillRect per tile
      for (let py = 0; py < TEX_SIZE; py++) {
        for (let px = 0; px < TEX_SIZE; px++) {
          const wx = texStartX + px * TILE_SIZE;
          const wy = texStartY + py * TILE_SIZE;
          const color = getTerrainColor(sampleTerrain(wx, wy).type);
          const i = (py * TEX_SIZE + px) * 4;
          data[i] = parseInt(color.slice(1, 3), 16);     // R
          data[i + 1] = parseInt(color.slice(3, 5), 16);   // G
          data[i + 2] = parseInt(color.slice(5, 7), 16);   // B
          data[i + 3] = 255;                               // A
        }
      }
      ctx.putImageData(imageData, 0, 0);

      const texture = Texture.from(canvas);
      const sprite = new Sprite(texture);

      // Sprite: position so its (texStartX, texStartY) aligns with world origin
      sprite.x = -(vx - texWorldW / 2);
      sprite.y = -(vy - texWorldH / 2);
      sprite.scale.set(WPX);

      tc.addChild(sprite);
      s.sprite = sprite;
      s.texCX = vx;
      s.texCY = vy;
    } else {
      // Update existing sprite position to follow view
      if (s.sprite) {
        s.sprite.x = -(vx - texWorldW / 2);
        s.sprite.y = -(vy - texWorldH / 2);
      }
    }

    // ── Overlays ──────────────────────────────────
    if (s.overlay) { tc.removeChild(s.overlay); s.overlay.destroy(); }
    if (s.labels) { tc.removeChild(s.labels); s.labels.destroy(); }

    const overlay = new Graphics();
    const labels = new Container();
    const toPX = (wx: number, wy: number): [number, number] => [
      (wx - minX), (wy - minY),
    ];

    // Grid
    const gsPx = 100 / WPX * zoom;
    if (gsPx > 4) {
      overlay.stroke({ width: 0.5, color: 0x000000, alpha: 0.04 });
      for (let gx = Math.floor(minX / 100) * 100; gx <= minX + halfW * 2; gx += 100) {
        const [px] = toPX(gx, 0);
        overlay.moveTo(px, 0); overlay.lineTo(px, halfH * 2);
      }
      for (let gy = Math.floor(minY / 100) * 100; gy <= minY + halfH * 2; gy += 100) {
        const [, py] = toPX(0, gy);
        overlay.moveTo(0, py); overlay.lineTo(halfW * 2, py);
      }
      overlay.stroke();
    }

    // 1km grid
    const kmPx = 1000 / WPX * zoom;
    if (kmPx > 4) {
      overlay.stroke({ width: 1, color: 0x000000, alpha: 0.1 });
      for (let gx = Math.floor(minX / 1000) * 1000; gx <= minX + halfW * 2; gx += 1000) {
        const [px] = toPX(gx, 0);
        overlay.moveTo(px, 0); overlay.lineTo(px, halfH * 2);
      }
      for (let gy = Math.floor(minY / 1000) * 1000; gy <= minY + halfH * 2; gy += 1000) {
        const [, py] = toPX(0, gy);
        overlay.moveTo(0, py); overlay.lineTo(halfW * 2, py);
      }
      overlay.stroke();
    }

    // Locations
    const sorted = [...locations].sort((a, b) =>
      ((a.type === 'region' || a.type === 'continent') ? 0 : 1) -
      ((b.type === 'region' || b.type === 'continent') ? 0 : 1));
    for (const loc of sorted) {
      const [lx, ly] = toPX(loc.x - loc.w / 2, loc.y - loc.h / 2);
      const lw = loc.w; const lh = loc.h;
      if (lx + lw < -50 || lx > halfW * 2 + 50 || ly + lh < -50 || ly > halfH * 2 + 50) continue;
      if (lw * zoom > 2) {
        const color = loc.type === 'town' ? 0xffffff : loc.type === 'building' ? 0xffcc33 : loc.type === 'room' ? 0xffcc33 : loc.type === 'region' ? 0xffffff : 0xcccccc;
        const alpha = loc.type === 'region' ? 0.25 : loc.type === 'town' ? 0.8 : 0.6;
        overlay.stroke({ width: loc.type === 'region' ? 0.5 : loc.type === 'town' ? 1.5 : 1, color, alpha });
        if (loc.type === 'region' || loc.type === 'continent') overlay.stroke({ width: 1, color: 0xffffff, alpha: 0.25 });
        overlay.rect(lx, ly, lw, lh);
        overlay.stroke();
      }
      if (lw * zoom > 30 && lh * zoom > 8) {
        const t = new Text({
          text: loc.name,
          style: { fontSize: Math.max(9, Math.min(13, lw * zoom / 10)), fill: loc.type === 'town' ? '#ffffff' : loc.type === 'building' ? '#ffcc64cc' : '#ffffff99', fontFamily: 'Fira Sans, sans-serif', fontWeight: '600' },
        });
        t.x = lx + 2; t.y = ly + 2;
        labels.addChild(t);
      }
    }

    // Characters
    for (const ch of characters) {
      const [cx, cy] = toPX(ch.x, ch.y);
      if (cx < -20 || cx > halfW * 2 + 20 || cy < -20 || cy > halfH * 2 + 20) continue;
      const r = ch.type === 'player' ? 5 : 4;
      const color = ch.type === 'player' ? 0xA855F7 : 0x22C55E;
      overlay.circle(cx, cy, r + 3); overlay.fill({ color, alpha: 0.15 });
      overlay.circle(cx, cy, r); overlay.fill({ color });
      overlay.circle(cx, cy, r); overlay.stroke({ width: 1.5, color: 0xffffff });
      const t = new Text({ text: ch.name, style: { fontSize: 10, fill: '#ffffff', fontFamily: 'Fira Sans, sans-serif', fontWeight: '600' } });
      t.x = cx + 8; t.y = cy - t.height - 2;
      labels.addChild(t);
    }

    tc.addChild(overlay);
    s.overlay = overlay;
    tc.addChild(labels);
    s.labels = labels;
  }

  return (
    <div ref={rootRef} className={`relative overflow-hidden bg-ink-900 ${className}`}
      style={{ width: '100%', height: '100%', minHeight: '400px' }}>
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-white/50 text-xs font-mono">
          Initializing WebGL...
        </div>
      )}
    </div>
  );
}
