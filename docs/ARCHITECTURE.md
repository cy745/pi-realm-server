# Pi Realm — 文字冒险 RPG 游戏架构文档

## 概述

基于 `@earendil-works/pi-agent-core` 构建的持久化文字冒险 RPG 游戏。

核心特色：
- **持续性世界**：世界 24/7 运行，有玩家在线或无玩家在线时持续推进
- **AI 驱动 NPC**：NPC 与玩家共享相同的角色属性模板，但由 AI Agent 自主驱动
- **可插拔内容**：支持通过 TypeScript 代码定义和 AI Agent 动态扩展游戏内容
- **多模式运行**：支持 CLI 终端和 Web 界面两种交互方式

## 技术栈

| 层面 | 选型 | 说明 |
|---|---|---|
| 运行时 | Node.js | TypeScript 原生支持 |
| 语言 | TypeScript | 全栈类型安全 |
| Agent 框架 | `@earendil-works/pi-agent-core` | 工具调用 + 状态管理 |
| CLI 终端 | `@earendil-works/pi-tui` | 差分渲染终端 UI |
| 数据库 | SQLite + Kysely | 嵌入式数据库，类型安全查询 |
| 内容定义 | TypeScript | 纯代码定义，IDE 友好 |
| 构建 | tsup | 零配置打包，CLI 单文件输出 |
| 测试 | vitest | 与 TypeScript 原生集成 |
| 代码规范 | Biome | 格式化 + lint 合一 |
| 项目结构 | 单体包 | 单一 npm 包，按目录分层 |
| 部署 | Docker + docker-compose | CLI / Web 双模式支持 |

## 项目结构

```
pi-realm/
├── src/
│   ├── cli.ts                # CLI 入口（pi-tui 模式）
│   ├── server.ts             # Web 服务入口（后续）
│   ├── game/                 # 纯逻辑引擎，与 I/O 无关
│   │   ├── engine.ts         # 游戏核心（状态管理、指令路由）
│   │   ├── world.ts          # 世界模型（房间图、地图）
│   │   ├── entity.ts         # 实体系统（角色、NPC、物品）
│   │   ├── combat.ts         # 战斗系统
│   │   └── action-resolver.ts
│   ├── agent/                # pi-agent 集成
│   │   ├── game-agent.ts     # Agent 配置 + System Prompt
│   │   └── tools/            # Agent Tool 定义
│   │       ├── move.ts
│   │       ├── look.ts
│   │       ├── inventory.ts
│   │       ├── combat.ts
│   │       ├── dialogue.ts
│   │       └── dynamic-extend.ts
│   ├── cli/                  # CLI 适配层
│   │   ├── tui.ts            # pi-tui 界面
│   │   └── input.ts          # 输入 + 超时自动
│   ├── web/                  # Web 适配层（后续）
│   │   └── handler.ts
│   ├── db/                   # 持久化
│   │   ├── schema.ts         # Kysely schema
│   │   └── repository.ts
│   └── content/              # 可插拔内容
│       ├── registry.ts
│       └── built-in/
│           ├── rooms.ts
│           ├── items.ts
│           └── npcs.ts
├── test/
├── Dockerfile                # 多阶段构建
├── docker-compose.yml        # CLI + Web 双模式
├── biome.json
├── tsconfig.json
├── tsup.config.ts
└── package.json
```

## 架构设计

```
┌──────────────────────────────────────────────────────────────────┐
│                    CLI / Web 交互层                               │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐  │
│  │ pi-tui 终端界面      │  │ Web 界面（后续）                  │  │
│  │ - 叙事文本面板       │  │ - 浏览器游玩                     │  │
│  │ - 指令选项列表       │  │ - REST/WS API                    │  │
│  │ - 角色状态栏         │  │                                  │  │
│  │ - 超时自动按钮       │  │                                  │  │
│  └─────────┬───────────┘  └──────────────┬───────────────────┘  │
└────────────┼──────────────────────────────┼──────────────────────┘
             │                              │
             ▼                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Game Engine（纯逻辑层）                        │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ World    │ │ Entity   │ │ Combat   │ │ Action           │   │
│  │ Model    │ │ System   │ │ System   │ │ Resolver         │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌────────────────────────────────┐   │
│  │ Content  │ │ Save/    │ │ Event/Tick                     │   │
│  │ Registry │ │ Load     │ │ Manager                        │   │
│  └──────────┘ └──────────┘ └────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
             │                              │
             ▼                              ▼
┌──────────────────────────────────────────────────────────────────┐
│              pi-agent-core 集成层                                 │
│                                                                  │
│  ┌────────────────────┐ ┌──────────────────────────────────┐    │
│  │ 玩家 Agent         │ │ NPC Agent 池                      │    │
│  │ - 叙事生成         │ │ - 多 Agent 并行调度               │    │
│  │ - NPC 对话         │ │ - 按距离/活跃度动态调频           │    │
│  │ - 动态内容扩展     │ │ - Tick 驱动决策                  │    │
│  └────────────────────┘ └──────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Agent Tool 定义                                           │   │
│  │ move / look / inventory / combat / dialogue / dynamic-ext │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────────┐
│                   持久化层（SQLite）                              │
│                                                                  │
│  同一数据库文件（pi-realm.db），分表隔离：                        │
│  - world_* 表：世界全局状态、时间线                               │
│  - characters 表：所有角色（玩家+NPC 统一模板）                   │
│  - character_* 表：角色关联数据（物品、技能）                     │
│  - game_log 表：行为日志                                          │
└──────────────────────────────────────────────────────────────────┘
```

## 世界 Tick 系统

### 基本参数

| 参数 | 值 |
|---|---|
| Tick 间隔（现实） | 5 分钟 |
| 对应游戏时间 | 1 小时 |
| 游戏日长度（现实） | 2 小时 |
| 时间流速 | 加速时间（非 1:1 实时） |

### Tick 循环逻辑

```
固定间隔 T = 5min（现实）

理想情况：
  tick1 ████████▏  tick2 ████████▏  tick3 ████████▏
  ↑                  ↑                  ↑
  T0                 T0+T               T0+2T

过载情况（tick1 耗时 > T）：
  tick1 ████████████████▏  ✗跳过  tick3 ████████▏
  ↑                       ↑         ↑
  T0                      T0+T      T0+2T
                           ↑
                      tick1 超时越过 tick2 边界
                      → 跳过 tick2，不积压队列
                      → AI Agent 收到准确世界时间：
                        "世界时间已从 T0+Δt 推进到 T0+2T"
```

### 关键设计约束

1. **固定间隔不漂移**：Tick 按固定现实时间间隔调度，不受处理耗时影响
2. **跳过不积压**：当前 tick 超时则跳过下一个，避免级联延迟
3. **时间感知准确**：AI Agent 始终接收正确的世界时间戳，包括被跳过的 tick 信息
4. **NPC 调度频率自适应**：
   - 玩家附近 NPC → 密集决策
   - 远处 NPC → 稀疏决策
   - 无人区域 → 最低频率或仅记录时间流逝

## NPC AI Agent 系统

### 设计理念

NPC 与玩家角色共享相同的属性模板（HP、MP、技能、装备、背包），区别仅在于：
- 玩家：由人类通过 CLI/Web 操作
- NPC：由 AI Agent 自主驱动

### NPC 调度架构

- **多 Agent 并行池**：多个 pi-agent 实例并发运行，每个处理一批 NPC
- **混合驱动模式**：
  - Tick 驱动：固定间隔触发 NPC 行为决策
  - 事件驱动：玩家交互、世界事件触发即时响应
- **动态调频**：根据 NPC 与玩家距离、区域活跃度调整 AI 调用频率

### NPC 状态生命周期

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  休眠     │────▶│  活跃     │────▶│  决策     │
│ (无玩家   │     │ (附近有   │     │ (AI Agent │
│  在附近)  │     │  玩家)    │     │  生成行为) │
└──────────┘     └──────────┘     └─────┬────┘
      ▲                                  │
      │            ┌──────────┐           │
      └────────────│  执行     │◀──────────┘
                   │ (更新世界 │
                   │  状态)    │
                   └──────────┘
```

### NPC 日程系统（后续）

可为重要 NPC 定义周期性日程：
- 白天：在特定地点活动
- 夜晚：回到住所休息
- 特殊事件：触发特定行为

## 数据库设计

### 表结构概览

同一 SQLite 文件（pi-realm.db），按表前缀逻辑隔离：

```
pi-realm.db
├── world_rooms           # 房间/地图状态
│   ├── id               # 房间 ID
│   ├── name             # 房间名称
│   ├── description      # 房间描述
│   ├── exits            # 出口（JSON: {n: room2, s: room3, ...}）
│   └── state            # 房间状态（JSON: 动态属性）
│
├── world_events          # 世界事件时间线
│   ├── id
│   ├── tick             # 发生时的 tick 编号
│   ├── world_time       # 游戏内时间
│   ├── type             # 事件类型
│   └── payload          # 事件数据（JSON）
│
├── world_time            # 当前世界时间（单行表）
│   ├── tick_count       # 已执行 tick 数
│   ├── game_time        # 游戏内当前时间戳
│   └── last_tick_at     # 上次 tick 现实时间
│
├── characters            # 所有角色（玩家 + NPC）
│   ├── id
│   ├── name
│   ├── type             # 'player' | 'npc'
│   ├── room_id          # 当前位置
│   ├── attributes       # 属性（JSON: HP, MP, ATK, DEF...）
│   └── is_online        # 是否在线
│
├── character_items       # 角色物品
│   ├── char_id
│   ├── item_id
│   ├── item_data        # 物品属性（JSON）
│   └── equipped         # 是否已装备
│
├── character_skills      # 角色技能
│   ├── char_id
│   ├── skill_id
│   └── skill_data       # 技能状态（JSON）
│
├── npc_schedules         # NPC 日程（可选）
│   ├── npc_id
│   ├── time_range       # 时间段
│   ├── room_id          # 目标房间
│   └── action           # 行为描述
│
└── game_log              # 行为日志
    ├── id
    ├── tick
    ├── world_time
    ├── char_id          # 行为者
    ├── action           # 行为描述
    └── result           # 结果（JSON）
```

## Docker 部署

### Dockerfile

多阶段构建：

```dockerfile
# 阶段 1：依赖安装 + 构建
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# 阶段 2：运行
FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
VOLUME /app/data
ENTRYPOINT ["node", "dist/cli.js"]
```

### docker-compose.yml

```yaml
services:
  cli:
    build: .
    volumes:
      - game-data:/app/data
    stdin_open: true
    tty: true
    profiles: ["cli"]
    # 使用: docker compose run --rm cli

  world:
    build: .
    command: ["node", "dist/world.js"]    # Tick 守护进程
    volumes:
      - game-data:/app/data
    restart: unless-stopped
    profiles: ["world"]
    # 后台持续运行，驱动世界演进

  web:
    build: .
    command: ["node", "dist/server.js"]
    ports:
      - "3000:3000"
    volumes:
      - game-data:/app/data
    environment:
      - MODE=web
    profiles: ["web"]

volumes:
  game-data:
```

### 使用方式

```bash
# 启动世界服务（后台持续运行）
docker compose --profile world up -d

# CLI 游玩（连接同一 SQLite）
docker compose run --rm cli

# Web 模式（后续）
docker compose --profile web up -d
```

## 战斗系统设计

### 设计原则

- **回合制指令 + AI 叙事混合**
- 默认提供文字冒险的标准指令选项供玩家选择
- AI 生成的特殊选择分支与常规指令并列显示
- 超时等待机制：超时自动触发"自动"操作

### 战斗指令（初期规划）

- 攻击（普通攻击）
- 技能（使用已学技能）
- 防御（减伤）
- 使用物品（嗑药/道具）
- 逃跑（概率成功）

### 数值体系（待细化）

- HP / MP / ATK / DEF / SPD 基础属性
- 装备提供属性加成
- Buff/Debuff 系统（回合制持续时间）
- 经验值 + 等级系统

## 存档策略

| 维度 | 说明 |
|---|---|
| 世界存档 | 自动持续写入，tick 每次执行后更新 |
| 角色存档 | 玩家操作实时写入，NPC 行为由 Agent 写入 |
| 灾难恢复 | SQLite WAL 模式，异常中断不丢数据 |
| 备份策略 | 可定期 cp 数据库文件做快照 |

## 后续规划

### 短期（MVP）
- [ ] 项目脚手架搭建（npm init, tsup, biome, docker）
- [ ] 数据库 schema 设计与初始化
- [ ] 游戏引擎核心（世界模型、实体系统、指令路由）
- [ ] pi-agent 集成与 Tool 定义
- [ ] CLI 界面（pi-tui 叙事面板、指令列表、状态栏）
- [ ] Tick 系统实现
- [ ] 基础战斗系统
- [ ] 存档/读档
- [ ] Docker 部署

### 中期
- [ ] NPC AI Agent 并行调度池
- [ ] 多角色支持（本地切换角色）
- [ ] 内容注册表与 AI 动态扩展
- [ ] 战斗系统完善（技能、Buff、装备）

### 长期
- [ ] Web 界面
- [ ] NPC 日程系统
- [ ] 世界事件与剧情系统
- [ ] 联机模式（C/S 架构）
