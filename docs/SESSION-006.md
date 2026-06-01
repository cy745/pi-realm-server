# 会话记录 SESSION-006

- **日期**：2026-06-01
- **主题**：Docker 部署后端 + 热重载开发环境
- **前置会话**：[SESSION-005.md](SESSION-005.md)

---

## 完成内容

### 1. 后端服务器入口

`src/server.ts` — Express + WebSocket 服务：

| 端点 | 方法 | 说明 |
|---|---|---|
| `GET /api/health` | HTTP | 健康检查（ok + version + uptime） |
| `GET /api/status` | HTTP | 系统状态（内存、模块状态、世界状态） |
| `WS /ws` | WebSocket | 实时事件通道（心跳、模块事件） |

服务器监听 `0.0.0.0:3001`。

### 2. Docker 开发环境

**Dockerfile** — 三阶段：

| 阶段 | 基础 | 用途 |
|---|---|---|
| `base` | node:22-alpine | 安装 tsx |
| `dev` | base | **热重载开发**（tsx watch，源码 volume mount） |
| `build` | base | tsup 产物体积 |
| `prod` | node:22-alpine | 生产运行（node dist/server.js） |

**docker-compose.yml**：

```yaml
services:
  server:
    build:
      context: .
      target: dev
    ports:
      - '3001:3001'
    volumes:
      - ./src:/app/src          # 源码 mount，文件改动自动重启
      - ./package.json:/app/package.json
      - ./tsconfig.json:/app/tsconfig.json
      - pi-realm-data:/app/data
    environment:
      - NODE_ENV=development
    restart: unless-stopped
    command: ['tsx', 'watch', 'src/server.ts']
    healthcheck:
      test: ['CMD', 'wget', '-qO-', 'http://localhost:3001/api/health']
```

### 3. 热重载机制

- **`tsx watch`**：监控 `src/` 下文件变化，检测到变更自动重启进程
- Docker volume 将本地 `src/` 挂载到容器内，修改即同步
- `npm run dev` — 本地开发（tsx watch）
- `npm run dev:docker` — Docker 开发（docker compose up --build）

### 4. 验证

| 测试 | 结果 |
|---|---|
| `GET /api/health` | `{"status": "ok", "version": "0.1.0"}` |
| `GET /api/status` | 7 个模块状态均为 `online` |
| `WS /ws` 连接 | 返回 `{type: "connected"}` |
| 热重载（touch server.ts） | tsx 检测到变更，自动重启，uptime 重置 |
| SIGTERM/SIGINT 优雅关闭 | ws.close → httpServer.close → exit(0) |

---

## 新增/修改文件

| 文件 | 说明 |
|---|---|
| `src/server.ts` | Express + WebSocket 入口 |
| `tsup.config.ts` | 仅 build server.ts |
| `Dockerfile` | 四阶段多阶段构建 |
| `.dockerignore` | 排除 node_modules/dist 等 |
| `docker-compose.yml` | 开发/生产服务编排 |
| `package.json` | 新增 dev/dev:docker/start 脚本 |
| `dashboard/` | （未被 Docker 包含，后续单独处理） |

---

## 使用方式

```bash
# 本地开发（热重载）
cd pi-realm
npm run dev

# Docker 开发（热重载）
npm run dev:docker

# 生产构建
npm run build
npm start
```

---

## 后续

- [ ] 将 dashboard 作为独立服务加入 docker-compose（或由 Express 托管静态文件）
- [ ] 接入真实数据（world store、tick loop 等）
- [ ] 数据库初始化
- [ ] 添加认证
