# 会话记录 SESSION-008

- **日期**：2026-06-01
- **主题**：地图子系统 — Perlin → simplex-noise + PixiJS WebGL 渲染
- **前置会话**：[SESSION-007.md](SESSION-007.md)

---

## 目标

实现地图的实时渲染，支持拖拽和缩放查看，地形由噪声生成。

## 已完成

### 1. 地形噪声引擎 — 手写 Perlin → `simplex-noise`

| 文件 | 说明 |
|---|---|
| `src/map/terrain.ts` | 服务端 Perlin 噪声地形生成（保留，未改动） |
| `dashboard/src/components/map/perlin.ts` | **替换为** `simplex-noise`（70M calls/s，4 频率叠加，14 种地形） |

### 2. 地图渲染 — Canvas2D → PixiJS (WebGL)

| 文件 | 说明 |
|---|---|
| `dashboard/src/components/map/TerrainMap.tsx` | PixiJS v8 地图组件 |
| `dashboard/src/components/map/stats.d.ts` | stats.js 类型声明 |

渲染演进路径：
1. Canvas2D fillRect tile-by-tile → 卡顿（7500+ tiles/frame）
2. Canvas2D + 离屏画布 + tile cache → 仍卡顿，WebGL context lost
3. PixiJS Sprite + Texture.from(offscreen canvas) → 纹理尺寸爆炸，context lost
4. **PixiJS Graphics rects 直接绘制**（当前方案，稳定但渲染性能未达预期）

### 3. 层级地址系统（之前 SESSION-003 实现）

```typescript
address(500, 800) → "Aeloria › Lake District › Raven's Hollow › Market Square"
```

通过 `RegionTree.resolveAddress(x, y)` 计算坐标所在的所有矩形区域，按面积降序排列。

### 4. 坐标移动系统（之前 SESSION-007 实现）

角色使用 `(x, y)` 坐标 + 速度/体力/地形影响。

### 5. Docker 部署

- 后端 `pi-realm-server` 运行在 Docker（端口 3001）
- Dashboard `pi-realm-dashboard` 运行在 Docker（端口 5173）
- 热重载（tsx watch + Vite HMR）
- Docker Hub 镜像配置 `2zpww1kk5t2v3f.xuanyuan.run`

---

## 当前架构

```
用户浏览器
  └─ http://localhost:5173/
       ├─ React Dashboard（模块管理、系统状态）
       ├─ TerrainMap (PixiJS v8 / WebGL)
       │    ├─ Graphics.rect() terrain tiles (simplex-noise)
       │    ├─ Graphics rect/stroke locations
       │    ├─ Graphics circle characters
       │    └─ Text labels
       └─ Vite proxy → http://localhost:3001 (backend API)
```

---

## 已知 Bug

### BUG-001：地图 PIXIJS 渲染不正常

**现象**：地图拖拽和滚轮缩放无响应，渲染结果异常（之前出现右下角 1/4 区域、居中但只有 1/2 大小等）。左下角缩放数字会变化但地图不刷新。

**根因推测**：
- PixiJS v8 的 `globalpointermove` 事件在拖拽时触发 `draw()`，但 `draw()` 内部可能有未捕获的异常导致渲染中断
- `try/catch` 可能吞掉了关键错误
- `removeChildren().destroy()` 可能影响了 PixiJS 内部状态
- 坐标系统可能仍有计算错误

**当前修复尝试**（均未彻底解决）：
1. PPM 概念移除 → 解决坐标偏移
2. 显式 `hitArea = new Rectangle()` → 事件可触发但渲染不更新
3. `try/catch` + `console.error` → 未看到错误输出（可能 draw 根本没调用）
4. Button handlers 直接调用 draw → 缩放数字变化但画面不动

**建议排查方向**：
1. 用最简单的测试确认 PixiJS 能画东西：在 `_draw` 开头画一个红色矩形排除所有地形逻辑
2. 检查 `world.removeChildAt().destroy()` 是否破坏了容器
3. 用 `app.renderer.render(app.stage)` 强制渲染
4. 检查 `world.scale.set(zoom)` 是否正确

---

## 仓库状态

```
main (6 commits this session)
├── 745c120 perf: shrink terrain texture 16x
├── 8c77812 fix: fixed 500px height
├── 2cb4f26 refactor: terrain as Graphics rects
├── 37c1a5e refactor: PixiJS v8 from pixijs-skills
├── 4f6a06f fix: black screen + plains test param
├── 0ef1cea fix: manual PixiJS sizing
├── 04cc75d perf: only rebuild terrain on zoom/pan
├── 4990a6a fix: safe() guards + resolution:1
├── e9ca7a4 feat: simplex-noise terrain
├── c77c9b5 fix: coordinate system origin
├── 4b57545 fix: remove PPM
├── 422e55a fix: drag + zoom + controls
└── 7ceee6f fix: error logging + safe child removal
```

---

## 下一步

- [ ] **修復 BUG-001**（地图 PixiJS 渲染）
- [ ] NPC AI 调度（接入 pi-agent-core）
- [ ] 数据库持久化
- [ ] 战斗系统
