// Terrain Map — PixiJS with safety guards against infinite resize

import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Sprite, Texture, Text } from 'pixi.js';
import { sampleTerrain, getTerrainColor } from './perlin.ts';

interface LM { id: string; name: string; type: string; x: number; y: number; w: number; h: number; }
interface CD { id: string; name: string; type: string; x: number; y: number; }
interface Props { locations: LM[]; characters: CD[]; centerX?: number; centerY?: number; className?: string; }

const WPX = 8 / 15; // pixels per world meter (at zoom=1)
const TEX_SIZES = [2048, 1024, 512]; // for zoom <0.5, <1, >=1
function texSize(zoom: number) { return zoom < 0.5 ? TEX_SIZES[0]! : zoom < 1 ? TEX_SIZES[1]! : TEX_SIZES[2]!; }

function safe(v: number, fallback = 0): number { return isFinite(v) ? v : fallback; }

export function TerrainMap({ locations, characters, centerX = 500, centerY = 800, className = '' }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const state = useRef({
    app: null as Application | null,
    tc: null as Container | null,
    sprite: null as Sprite | null,
    overlay: null as Graphics | null,
    labels: null as Container | null,
    vx: safe(centerX), vy: safe(centerY),
    zoom: 0.3, // start slightly zoomed in
    texCX: 0, texCY: 0,
    w: 800, h: 400,
    dragging: false, dragSx: 0, dragSy: 0, dragVx: 0, dragVy: 0,
  });

  useEffect(() => {
    const div = rootRef.current;
    if (!div || state.current.app) return;

    (async () => {
      const w0 = Math.max(100, div.clientWidth || 800);
      const h0 = Math.max(100, div.clientHeight || 400);
      const app = new Application();
      try {
        await app.init({
          width: w0, height: h0,
          background: '#1a3a5c', antialias: false,
          resolution: 1,
        });
      } catch {
        console.warn('[map] PixiJS init failed, using fallback');
        div.innerHTML = '<div class="p-4 text-white/50 text-xs">Map unavailable</div>';
        return;
      }
      div.appendChild(app.canvas);
      const s = state.current;
      s.app = app;
      s.w = w0; s.h = h0;

      app.canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        setTimeout(() => window.location.reload(), 500);
      });

      const tc = new Container();
      app.stage.addChild(tc);
      s.tc = tc;

      app.stage.eventMode = 'static';
      app.stage.hitArea = app.screen;
      app.stage.on('pointerdown', (e) => {
        s.dragging = true; s.dragSx = e.global.x; s.dragSy = e.global.y;
        s.dragVx = s.vx; s.dragVy = s.vy;
      });
      app.stage.on('pointermove', (e) => {
        if (!s.dragging) return;
        const f = safe(s.zoom * WPX);
        if (f === 0) return;
        const dx = safe((e.global.x - s.dragSx) / f);
        const dy = safe((e.global.y - s.dragSy) / f);
        s.vx = safe(s.dragVx - dx, centerX);
        s.vy = safe(s.dragVy - dy, centerY);
        tick();
      });
      const end = () => { s.dragging = false; };
      app.stage.on('pointerup', end);
      app.stage.on('pointerupoutside', end);

      // Wheel
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        s.zoom = safe(Math.max(0.02, Math.min(50, s.zoom * (e.deltaY > 0 ? 0.85 : 1.18))), 0.3);
        tick();
      };
      div.addEventListener('wheel', onWheel, { passive: false });

      // Keyboard
      const onKey = (e: KeyboardEvent) => {
        if (e.key === '+' || e.key === '=') { s.zoom = safe(Math.min(50, s.zoom * 1.2), 0.3); tick(); }
        if (e.key === '-') { s.zoom = safe(Math.max(0.02, s.zoom / 1.2), 0.3); tick(); }
      };
      window.addEventListener('keydown', onKey);

      // Resize
      const ro = new ResizeObserver(() => {
        const nw = Math.max(100, div.clientWidth || 800);
        const nh = Math.max(100, div.clientHeight || 400);
        s.w = nw; s.h = nh;
        try { app.renderer.resize(nw, nh); } catch { /* ignore */ }
        tick();
      });
      ro.observe(div);

      function tick() { try { render(s); } catch (e) { console.warn('[map] render error', e); } }

      tick();
      setReady(true);

      return () => {
        ro.disconnect();
        window.removeEventListener('keydown', onKey);
        div.removeEventListener('wheel', onWheel);
        try { app.destroy(true); } catch { /* ignore */ }
        s.app = null;
      };
    })();
  }, []);

  function render(s: typeof state.current) {
    const app = s.app; const tc = s.tc;
    if (!app || !tc) return;
    const w = s.w; const h = s.h;
    if (w < 50 || h < 50) return;
    const zoom = safe(s.zoom, 0.3);
    if (zoom <= 0) return;
    const vx = safe(s.vx, centerX);
    const vy = safe(s.vy, centerY);

    tc.x = w / 2;
    tc.y = h / 2;
    tc.scale.set(zoom);

    const hW = safe((w / 2 / zoom) / WPX, 100);
    const hH = safe((h / 2 / zoom) / WPX, 100);
    const minX = safe(vx - hW, -10000);
    const minY = safe(vy - hH, -10000);

    // Terrain texture
    const texSize = TEX_SIZES[0]!;
    const texWW = safe(texSize / WPX, 1000);
    const rebound = Math.sqrt((vx - s.texCX) ** 2 + (vy - s.texCY) ** 2) > texWW * 0.3;

    if (rebound) {
      if (s.sprite) { try { tc.removeChild(s.sprite); s.sprite.destroy(); } catch { /* ignore */ } s.sprite = null; }
      const tsx = safe(vx - texWW / 2, -100000);
      const tsy = safe(vy - texWW / 2, -100000);
      const canvas = document.createElement('canvas');
      canvas.width = texSize; canvas.height = texSize;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const id = ctx.createImageData(texSize, texSize);
        const d = id.data;
        for (let py = 0; py < texSize; py++) {
          for (let px = 0; px < texSize; px++) {
            const wx = safe(tsx + px * WPX, 0);
            const wy = safe(tsy + py * WPX, 0);
            const c = getTerrainColor(sampleTerrain(wx, wy).type);
            const i = (py * texSize + px) * 4;
            d[i] = parseInt(c.slice(1, 3), 16) || 0;
            d[i + 1] = parseInt(c.slice(3, 5), 16) || 0;
            d[i + 2] = parseInt(c.slice(5, 7), 16) || 0;
            d[i + 3] = 255;
          }
        }
        ctx.putImageData(id, 0, 0);
      }
      let tex: Texture;
      try { tex = Texture.from(canvas); } catch { return; }
      const sprite = new Sprite(tex);
      sprite.x = safe(-(vx - texWW / 2), -100000);
      sprite.y = safe(-(vy - texWW / 2), -100000);
      sprite.scale.set(WPX);
      tc.addChild(sprite);
      s.sprite = sprite;
      s.texCX = vx; s.texCY = vy;
    } else if (s.sprite) {
      s.sprite.x = safe(-(vx - texWW / 2), -100000);
      s.sprite.y = safe(-(vy - texWW / 2), -100000);
    }

    // Overlays
    if (s.overlay) { try { tc.removeChild(s.overlay); s.overlay.destroy(); } catch { /* ignore */ } }
    if (s.labels) { try { tc.removeChild(s.labels); s.labels.destroy(); } catch { /* ignore */ } }

    const overlay = new Graphics();
    const labels = new Container();
    const px = (wx: number) => safe(wx - minX, 0);
    const py = (wy: number) => safe(wy - minY, 0);

    const vw = hW * 2; const vh = hH * 2;

    // Grid
    const g100 = 100 / WPX * zoom;
    if (g100 > 3) {
      overlay.stroke({ width: 0.5, color: 0x000000, alpha: 0.04 });
      for (let gx = Math.floor(minX / 100) * 100; gx <= minX + vw; gx += 100) {
        const x = px(gx); if (x > 0) { overlay.moveTo(x, 0); overlay.lineTo(x, vh); }
      }
      for (let gy = Math.floor(minY / 100) * 100; gy <= minY + vh; gy += 100) {
        const y = py(gy); if (y > 0) { overlay.moveTo(0, y); overlay.lineTo(vw, y); }
      }
      overlay.stroke();
    }

    const g1000 = 1000 / WPX * zoom;
    if (g1000 > 3) {
      overlay.stroke({ width: 1, color: 0x000000, alpha: 0.1 });
      for (let gx = Math.floor(minX / 1000) * 1000; gx <= minX + vw; gx += 1000) {
        const x = px(gx); if (x > 0) { overlay.moveTo(x, 0); overlay.lineTo(x, vh); }
      }
      for (let gy = Math.floor(minY / 1000) * 1000; gy <= minY + vh; gy += 1000) {
        const y = py(gy); if (y > 0) { overlay.moveTo(0, y); overlay.lineTo(vw, y); }
      }
      overlay.stroke();
    }

    // Locations
    const sorted = [...locations].sort((a, b) =>
      ((a.type === 'region' || a.type === 'continent') ? 0 : 1) -
      ((b.type === 'region' || b.type === 'continent') ? 0 : 1));
    for (const loc of sorted) {
      const lx = px(loc.x - loc.w / 2); const ly = py(loc.y - loc.h / 2);
      if (lx > vw + 50 || lx + loc.w < -50 || ly > vh + 50 || ly + loc.h < -50) continue;
      if (!isFinite(lx) || !isFinite(ly)) continue;
      if (loc.w * zoom > 2) {
        const color = loc.type === 'town' ? 0xffffff : loc.type === 'building' ? 0xffcc33 : loc.type === 'room' ? 0xffcc33 : 0xffffff;
        const alpha = loc.type === 'region' ? 0.25 : 0.8;
        overlay.stroke({ width: loc.type === 'region' ? 0.5 : 1, color, alpha });
        overlay.rect(lx, ly, loc.w, loc.h); overlay.stroke();
      }
      if (loc.w * zoom > 30 && loc.h * zoom > 8) {
        try {
          const t = new Text({ text: loc.name, style: { fontSize: 10, fill: '#ffffff', fontFamily: 'Fira Sans' } });
          t.x = lx + 2; t.y = ly + 2; labels.addChild(t);
        } catch { /* ignore */ }
      }
    }

    // Characters
    for (const ch of characters) {
      const cx = px(ch.x); const cy = py(ch.y);
      if (cx < -20 || cx > vw + 20 || cy < -20 || cy > vh + 20 || !isFinite(cx) || !isFinite(cy)) continue;
      const r = ch.type === 'player' ? 5 : 4;
      const color = ch.type === 'player' ? 0xA855F7 : 0x22C55E;
      overlay.circle(cx, cy, r + 2); overlay.fill({ color, alpha: 0.15 });
      overlay.circle(cx, cy, r); overlay.fill({ color });
      overlay.circle(cx, cy, r); overlay.stroke({ width: 1.5, color: 0xffffff });
      try {
        const t = new Text({ text: ch.name, style: { fontSize: 10, fill: '#ffffff', fontFamily: 'Fira Sans' } });
        t.x = cx + 8; t.y = cy - 14; labels.addChild(t);
      } catch { /* ignore */ }
    }

    tc.addChild(overlay); s.overlay = overlay;
    tc.addChild(labels); s.labels = labels;
  }

  return (
    <div ref={rootRef} className={`relative overflow-hidden bg-ink-900 ${className}`}
      style={{ width: '100%', height: '100%', minHeight: '400px' }}>
      {!ready && <div className="absolute inset-0 flex items-center justify-center text-white/50 text-xs font-mono">Initializing...</div>}
    </div>
  );
}
