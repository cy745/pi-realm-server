# Pi Realm — 文字冒险 RPG 游戏架构文档

## 概述

基于 `@earendil-works/pi-agent-core` 构建的**持久化世界**文字冒险 RPG 游戏。

核心特色：
- **C/S 架构**：服务端持续推进世界演进，客户端作为"视角"接入
- **持续性世界**：世界 24/7 运行，无玩家在线时持续推进
- **AI 驱动 NPC**：NPC 与玩家共享相同属性模板，但由 AI Agent 自主驱动
- **信息不对称**：玩家/NPC 默认互相不可见属性，需探查技能获取快照
- **可插拔内容**：TypeScript 代码定义 + AI 动态扩展
- **多客户端**：CLI（pi-tui）与 Web 共享同一服务器

## 技术栈

| 层面 | 选型 | 说明 |
|---|---|---|
| 运行时 | Node.js | TypeScript 原生支持 |
| 语言 | TypeScript | 全栈类型安全 |
| Agent 框架 | `@earendil-works/pi-agent-core` | 工具调用 + 状态管理 |
| Web 框架 | Express | 成熟的 Node.js Web 框架 |
| 通信协议 | WebSocket（`ws` 库） | 实时双向通信 |
| CLI 终端 | `@earendil-works/pi-tui` | 差分渲染终端 UI |
| 数据库 | SQLite + Kysely | 嵌入式，类型安全查询 |
| 内容定义 | TypeScript | 纯代码定义，IDE 友好 |
| 构建 | tsup | 零配置打包，CLI 单文件输出 |
| 测试 | vitest | 与 TypeScript 原生集成 |
| 代码规范 | Biome | 格式化 + lint 合一 |
| 项目结构 | 单体包 | 单一 npm 包，按目录分层 |
| 部署 | Docker + docker-compose | 服务端常驻，客户端即用即连 |

## C/S 架构概览

```
┌───────────────────────────────────────────────────────────────┐
│                    Server（持续运行）                          │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ Tick Loop（世界推进）                                 │   │
│  │ - 固定 5min 现实 = 1h 游戏                            │   │
│  │ - 超时跳过下一 tick，AI 感知准确时间                  │   │
│  └─────────────────┬─────────────────────────────────────┘   │
│                    ↓                                          │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ World State（完整真相）                               │   │
│  │ - 所有房间、物品、NPC、玩家、事件                     │   │
│  │ - 完整知识库、NPC 心意、剧情标记                     │   │
│  └─────────────────┬─────────────────────────────────────┘   │
│                    ↓                                          │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ Event Generator（事件生成）                           │   │
│  │ - NPC AI Agent 池（多 Agent 并行）                    │   │
│  │ - 玩家指令处理                                       │   │
│  │ - 剧情事件触发                                       │   │
│  │ - 战斗结算                                           │   │
│  └─────────────────┬─────────────────────────────────────┘   │
│                    ↓                                          │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ WorldEvent（带可见性规范的完整事件）                   │   │
│  └─────────────────┬─────────────────────────────────────┘   │
│                    ↓                                          │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ Visibility Filter Pipeline（每客户端独立过滤）         │   │
│  │ - 空间过滤 / 知识过滤 / 剧情过滤 / 衰减过滤            │   │
│  └─────────────────┬─────────────────────────────────────┘   │
│                    ↓                                          │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ LLM Narrator（视角叙事器）                            │   │
│  │ - 输入：过滤后事件 + 角色状态 + 风格                   │   │
│  │ - 输出：角色视角的自然语言描述                         │   │
│  └─────────────────┬─────────────────────────────────────┘   │
│                    ↓                                          │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ CharacterView → WebSocket 推送                        │   │
│  │ - 每个连接客户端一份独立视图                          │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
└───────────────────────┬───────────────────────────────────────┘
                        │ WebSocket
        ┌───────────────┴───────────────┐
        ↓                               ↓
┌──────────────────┐            ┌──────────────────┐
│ TUI Client       │            │ Web Client       │
│ - pi-tui 界面    │            │ - 浏览器界面     │
│ - 状态面板       │            │ - 后端对接       │
│ - 输入框+超时    │            │ - 实时渲染       │
└──────────────────┘            └──────────────────┘
```

## 项目结构

```
pi-realm/
├── src/
│   ├── server.ts             # Express + WebSocket 入口
│   ├── client/
│   │   ├── tui.ts            # pi-tui 客户端
│   │   └── web.ts            # Web 客户端入口（后续）
│   ├── game/                 # 纯逻辑引擎
│   │   ├── engine.ts         # 游戏核心
│   │   ├── world.ts          # 世界模型
│   │   ├── entity.ts         # 实体系统
│   │   ├── combat.ts         # 战斗系统
│   │   ├── knowledge.ts      # 知识与衰减系统
│   │   └── view.ts           # 角色视图生成器
│   ├── visibility/           # 可见性系统（核心）
│   │   ├── filter.ts         # 过滤管线
│   │   ├── spatial.ts        # 空间规则
│   │   ├── knowledge-rule.ts # 知识规则
│   │   ├── plot.ts           # 剧情规则
│   │   ├── decay.ts          # 时间衰减
│   │   └── scout.ts          # 探查技能（信息快照）
│   ├── agent/                # pi-agent 集成
│   │   ├── game-agent.ts     # 玩家 Agent
│   │   ├── npc-agent-pool.ts # NPC Agent 并行池
│   │   ├── narrator.ts       # 视角叙事 LLM
│   │   └── tools/            # Agent Tool 定义
│   │       ├── move.ts
│   │       ├── look.ts
│   │       ├── inventory.ts
│   │       ├── combat.ts
│   │       ├── dialogue.ts
│   │       ├── scout.ts
│   │       └── dynamic-extend.ts
│   ├── api/                  # WebSocket API
│   │   ├── protocol.ts       # 消息类型定义
│   │   ├── auth.ts           # 账号密码认证
│   │   ├── session.ts        # 客户端会话管理
│   │   └── handlers/         # 消息处理器
│   │       ├── movement.ts
│   │       ├── combat.ts
│   │       └── dialogue.ts
│   ├── tick/                 # 世界 Tick 系统
│   │   ├── tick-loop.ts
│   │   └── tick-scheduler.ts
│   ├── db/                   # 持久化
│   │   ├── schema.ts
│   │   └── repository.ts
│   └── content/              # 可插拔内容
│       ├── registry.ts
│       └── built-in/
│           ├── rooms.ts
│           ├── items.ts
│           └── npcs.ts
├── test/
├── Dockerfile
├── docker-compose.yml
├── biome.json
├── tsconfig.json
├── tsup.config.ts
└── package.json
```

## 可见性系统（核心设计）

### 信息分层模型

| 层级 | 类别 | 可见性规则 | 实现方式 |
|---|---|---|---|
| **L0** | 角色自身 | 始终可见 | 直接读取角色状态 |
| **L1** | 同空间感知 | 空间过滤 | 房间距离 + 视野规则 |
| **L2** | 邻近听觉 | 空间 + 强度 | 距离 + 声源强度 |
| **L3** | 知识库 | 知识标记 | per-character knownBy 集合 |
| **L4** | 剧情触发 | 剧情标记 | plot flag 匹配 |
| **L5** | 服务端私有 | 永不外泄 | 服务器内部 |

### 角色间信息可见性（关键博弈设计）

**默认状态：完全不可见**

玩家-玩家 / 玩家-NPC / NPC-NPC 默认互相**不可见**对方属性，**只能看到**：
- 名字
- 外观描述
- 当前所在位置（因为同房间就能看到）
- 外在行为（动作、说的话）

**探查技能：一次性信息快照**

| 条件 | 效果 |
|---|---|
| 探查者等级 >= 目标等级 | 可使用探查技能 |
| 技能等级 + 熟练度 | 决定可获取信息范围 |
| 一次快照 | 获取**当时**对方信息副本，不随目标状态变化更新 |
| 不同等级可获取的信息 | 基础：名字/等级；中级：+ HP/装备；高级：+ 技能/状态；大师：+ 近期行为 |

```typescript
// 信息快照（不可变）
interface ScoutSnapshot {
  targetId: CharacterId;
  capturedAt: number;          // 世界时间戳
  scoutUserId: CharacterId;
  // 根据技能水平裁剪
  data: {
    name?: string;
    level?: number;
    hp?: { current: number; max: number };
    mp?: { current: number; max: number };
    equipment?: ItemInfo[];
    skills?: SkillInfo[];
    buffs?: BuffInfo[];
    recentActions?: string[];   // 高级探查可见
  };
  // 注意：此对象冻结，不响应目标后续状态变化
}
```

### 知识衰减系统

```typescript
interface KnowledgeEntry {
  id: string;
  description: string;
  knownBy: Map<CharacterId, KnowledgeMeta>;
  // 重要知识永不衰减
  permanent: boolean;
}

interface KnowledgeMeta {
  acquiredAt: number;          // 世界时间
  relevance: number;           // 0-1，随时间衰减
  reinforcedAt: number[];      // 复述/重提时间戳（重置衰减）
}
```

衰减规则：
- 每个 tick 后 relevance -= decayRate
- 当 relevance <= 阈值，自动从 knownBy 移除
- permanent = true 的知识不衰减
- 角色间对话提及 / 自我回忆可强化 relevance

### 事件过滤管线

```typescript
// 服务端完整事件
interface WorldEvent {
  id: string;
  type: 'combat_hit' | 'dialogue' | 'npc_action' | 'world_change' | ...;
  tick: number;
  worldTime: number;
  location: RoomId;
  payload: EventPayload;        // 完整数据
  visibility: VisibilitySpec;   // 可见性规范
}

interface VisibilitySpec {
  directRooms: RoomId[];        // 哪些房间直接可见
  adjacentAware: boolean;       // 相邻是否可闻
  knownBy: CharacterId[];       // 谁明确知道
  requiresFlags?: string[];     // 所需剧情标记
  decayTicks?: number;          // 多少 tick 后不再主动提醒
}
```

过滤流程：

```
WorldEvent
  ↓
spatialFilter(viewer, event)    // 同房间？邻接？
  ↓ pass
knowledgeFilter(viewer, event)  // viewer 是否在 knownBy？
  ↓ pass
plotFilter(viewer, event)       // 剧情标记是否满足？
  ↓ pass
decayFilter(viewer, event)      // 是否已过衰减期？
  ↓ pass
→ 进入 LLM Narrator
  ↓
narrate(viewer, event)          // 生成角色视角描述
  ↓
CharacterView → WebSocket 推送
```

### CharacterView 数据结构

```typescript
interface CharacterView {
  // L0 自身
  self: CharacterSnapshot;
  // L1 同空间
  currentRoom: RoomView;        // 房间内可见的物品、NPC、其他玩家
  // L2 听觉
  nearbySounds: SoundEvent[];
  // L3 知识
  knowledge: KnowledgeEntry[];
  // L4 剧情
  plotProgress: PlotFlag[];
  // 探查快照（用户主动获取）
  scoutSnapshots: ScoutSnapshot[];
  // 待处理事件（已叙事化）
  events: NarratedEvent[];
  // 可执行操作
  availableActions: Action[];
}
```

## 通信协议

### WebSocket 消息

**客户端 → 服务端：**
```typescript
type ClientMessage =
  | { type: 'auth'; username: string; password: string }
  | { type: 'action'; action: Action }
  | { type: 'query'; target: 'self' | 'room' | 'knowledge' | 'scout' }
  | { type: 'scout'; targetId: CharacterId }
  | { type: 'ping' };
```

**服务端 → 客户端：**
```typescript
type ServerMessage =
  | { type: 'auth_result'; success: boolean; characterId?: CharacterId; error?: string }
  | { type: 'view_update'; view: CharacterView }
  | { type: 'event'; event: NarratedEvent }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' };
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

### Tick 内部流程

```typescript
async function tick(tickId: number) {
  const startTime = worldTime.current;
  
  // 1. 推进世界时间
  worldTime.advance(TICK_DURATION);
  
  // 2. 知识衰减
  knowledgeSystem.decay(currentTick);
  
  // 3. NPC Agent 调度
  //    - 玩家附近 NPC：实时 AI 决策
  //    - 远处 NPC：稀疏决策
  //    - 无人区：仅时间流逝
  await npcAgentPool.runActiveNPCs();
  
  // 4. 事件生成
  const events = eventGenerator.flush();
  
  // 5. 持久化
  await repository.saveTick(tickId, worldTime.current, events);
  
  // 6. 通知所有客户端
  for (const client of connectedClients) {
    const view = await generateView(client.characterId);
    client.send({ type: 'view_update', view });
  }
}
```

## NPC AI Agent 系统

### 设计理念

NPC 与玩家角色共享相同的属性模板（HP、MP、技能、装备、背包、知识），区别仅在于：
- 玩家：由人类通过 CLI/Web 操作
- NPC：由 AI Agent 自主驱动
- NPC 内心独白**对玩家不可见**，仅可见其外在行为和言语

### NPC 调度架构

- **多 Agent 并行池**：多个 pi-agent 实例并发运行
- **混合驱动模式**：
  - Tick 驱动：固定间隔触发
  - 事件驱动：玩家交互、世界事件触发即时响应
- **动态调频**：
  - 玩家附近 NPC → 密集决策
  - 远处 NPC → 稀疏决策
  - 无人区域 → 最低频率或仅记录时间流逝

### NPC 内心独白不可见

NPC AI Agent 内部思考过程（LLM 推理）**永远不会推送给玩家**。玩家只能看到：
- NPC 的动作（attack/move/say）
- NPC 的发言（dialogue）
- NPC 的状态变化（HP 变化、装备变化）

NPC 决定说谎、隐瞒、表达不同立场时，玩家无从得知真实想法，只能根据 NPC 的外在行为推断。

## 世界状态系统

### 核心设计原则

世界状态分为两个**严格隔离**的子系统：

| 系统 | 性质 | 生命周期 | 谁可读 | 谁可写 |
|---|---|---|---|---|
| **Map State（地图状态）** | 客观物理真相，固化 | 永久 | 全员（按可见性） | 服务端 |
| **Memory（角色记忆）** | 主观认知，可衰减 | 衰减/可重置 | 仅本人 | 仅本人 |

**关键区分：**
- 当角色**身处**某场景时，看到的是**当前 Map State**（不是他的记忆）
- 角色可以**回忆起**过去的 Map State（"我记得这道门以前是完好的"）
- 当前 Map State 与角色记忆**可能不一致**（NPC 修好了一道破门）
- 角色不主动回忆时，看不到自己记忆中的"过去状态"

### Map State（地图状态）

```typescript
interface RoomState {
  id: RoomId;
  
  // 静态基础（很少改变）
  base: {
    name: string;
    description: string;          // 初始描述
    exits: ExitMap;
    material: 'stone' | 'wood' | 'earth' | 'metal' | 'glass' | 'plant';
    capacity: number;             // 容纳量
  };
  
  // 动态状态（持续演化）
  dynamic: {
    // 物理损坏
    structural: number;           // 0-1 结构完整度
    fire: {
      intensity: number;          // 0-1 当前火势
      fuelRemaining: number;      // 燃烧剩余 tick
      spreadRadius: number;       // 当前扩散范围
    };
    
    // 天气
    weather: {
      type: 'clear' | 'rain' | 'snow' | 'storm' | 'fog' | 'sandstorm';
      intensity: number;          // 0-1
      windDirection?: 'N' | 'S' | 'E' | 'W';
    };
    
    // 时间
    timeOfDay: 'dawn' | 'day' | 'dusk' | 'night';
    season: 'spring' | 'summer' | 'autumn' | 'winter';
    
    // 可见物体
    visible: {
      items: ItemInstance[];
      corpses: CharacterId[];
      debris: string[];           // ["broken furniture", "cracked floor"]
      marks: string[];            // ["scorch marks", "claw marks"]
      lightSources: LightSource[];
    };
    
    // 隐藏物体（需探测技能）
    hidden: {
      secretDoors: SecretDoor[];
      traps: Trap[];
      hiddenItems: ItemInstance[];
    };
  };
  
  // 状态变更历史（用于记忆锚定）
  history: StateChange[];
}
```

### StateChange（状态变更记录）

每次 Map State 变化都记录：

```typescript
interface StateChange {
  id: string;
  tick: number;
  worldTime: number;
  roomId: RoomId;
  type: 'damage' | 'fire_started' | 'fire_spread' | 'weather_change' | 
        'structural_decay' | 'item_moved' | 'modification' | 'vegetation_growth' | ...;
  before: Partial<RoomState>;     // 变更前快照
  after: Partial<RoomState>;      // 变更后快照
  cause: 'event' | 'weather' | 'decay' | 'npc_action' | 'fire_spread' | 'emergent';
  causedBy?: CharacterId | WorldEventId;
  // 记忆锚点：哪些角色目睹了这次变更
  witnessedBy: CharacterId[];
}
```

### Memory with Map State Reference

```typescript
interface MemoryEntry {
  id: string;
  characterId: CharacterId;
  description: string;            // 自然语言描述
  
  // 记忆内容
  witnessedEventId?: WorldEventId;
  relatedStateChangeId?: StateChangeId;  // 锚定到具体状态变更
  
  // Map State 引用（快照+引用混合）
  mapStateReference: {
    roomId: RoomId;
    stateChangeId?: StateChangeId;       // 引用的具体变更
    snapshotAt: number;                  // 世界时间
    captured: Partial<RoomState>;        // 当时关键字段快照
  };
  
  // 衰减元数据
  relevance: number;              // 0-1
  acquiredAt: number;             // 世界时间
  permanent: boolean;             // 关键剧情记忆
  reinforcedAt: number[];         // 强化时间戳
}
```

### 当前状态 vs 记忆

角色查看某场景时：

```typescript
function renderRoom(characterId: CharacterId, roomId: RoomId): RoomView {
  const currentState = mapState.getRoom(roomId);     // 真相
  const memories = memory.getByCharacterAndRoom(characterId, roomId);
  
  return {
    current: currentState,         // 实际看到的东西
    memories: memories,            // "我记得..."
    // LLM 根据这两者生成叙事：
    // "破败的城堡大门。墙上有明显的烧焦痕迹。
    //  你记得三周前这里曾经发生过一场大火，门是后来才修好的。"
  };
}
```

## 跨场景感知系统

### 简化距离模型

每个 WorldEvent 定义传播参数：

```typescript
interface WorldEvent {
  // ... 基础字段
  propagation: {
    sound: {
      radius: number;              // 声音传播半径（房间数）
      obstacleReduction: number;   // 每堵墙削减量
    };
    light: {
      radius: number;              // 光照半径
      blockedByWalls: boolean;     // 直线视距
    };
    damage: {
      radius: number;              // 伤害半径
      falloff: 'linear' | 'inverse_square' | 'constant';
    };
    vibration: {
      radius: number;              // 震动传播（穿透固体）
      reducesPerWall: number;      // 墙体削减
    };
  };
}
```

### 感知判定算法

```typescript
function calculatePerception(event: WorldEvent, character: Character): PerceptionResult | null {
  const distance = pathDistance(event.location, character.room);
  const walls = countWallsBetween(event.location, character.room);
  const lineOfSight = hasLineOfSight(event.location, character.room);
  
  // 伤害：距离衰减
  if (distance <= event.propagation.damage.radius) {
    const damage = applyFalloff(
      event.payload.damage ?? 0, 
      distance, 
      event.propagation.damage.falloff
    );
    if (damage > 0) {
      return {
        type: 'damage',
        damage,
        sensations: getDamageSensations(event),  // ['fire', 'heat', 'impact']
        witnessed: false,                       // 可能看不到源头
      };
    }
  }
  
  // 视觉：直线视距
  if (lineOfSight && distance <= event.propagation.light.radius) {
    return {
      type: 'witnessed',
      sensations: ['flame', 'shockwave', 'light'],
      witnessed: true,                          // 看到了事件
    };
  }
  
  // 听觉：距离 + 障碍物削减
  const effectiveSoundRange = event.propagation.sound.radius - 
                               (walls * event.propagation.sound.obstacleReduction);
  if (distance <= effectiveSoundRange) {
    return {
      type: 'heard',
      sensations: ['noise'],
      witnessed: false,                         // 只听到
      muffled: walls > 0,
    };
  }
  
  // 震动：穿透墙体
  const effectiveVibRange = event.propagation.vibration.radius - 
                             (walls * event.propagation.vibration.reducesPerWall);
  if (distance <= effectiveVibRange) {
    return {
      type: 'felt',
      sensations: ['tremor', 'vibration'],
      witnessed: false,
    };
  }
  
  return null;  // 完全无感知
}
```

### 示例：城堡爆炸

```
事件: 城堡外大爆炸
  location: 城堡外广场
  propagation:
    sound: { radius: 8, obstacleReduction: 2 }
    light: { radius: 6, blockedByWalls: true }
    damage: { radius: 3, falloff: 'linear' }
    vibration: { radius: 12, reducesPerWall: 1 }

角色A（地下室，距离 4 房间，墙体多）:
  - damage: distance 4 > 3, 无伤害
  - light: distance 4 <= 6, 但 lineOfSight 失败（多层楼板） → 看不到
  - sound: 8 - 3*2 = 2, distance 4 > 2, 听不到清晰声音
  - vibration: 12 - 3*1 = 9, distance 4 <= 9 → 感知到震动
  → 返回 { type: 'felt', sensations: ['tremor'] }

角色B（城堡外，距离 0）:
  - damage: distance 0, 满伤害
  - light: 直接看到
  - sound: 听到巨响
  → 返回 { type: 'damage', damage: 100, sensations: ['fire', 'heat', 'noise', 'light'] }
```

### 旁观者记忆生成

```typescript
// 事件触发后
async function propagateToCharacters(event: WorldEvent) {
  for (const character of characters) {
    const perception = calculatePerception(event, character);
    if (perception) {
      // 写入角色记忆
      await memory.addEntry(character.id, {
        description: await narrate(character, event, perception),
        relatedStateChangeId: event.relatedStateChange?.id,
        mapStateReference: {
          roomId: event.location,
          stateChangeId: event.relatedStateChange?.id,
          snapshotAt: worldTime.current,
          captured: mapState.getRoom(event.location),
        },
      });
      
      // 若有伤害，施加效果
      if (perception.damage) {
        character.takeDamage(perception.damage);
      }
    }
  }
}
```

## 背景模拟（全背景模拟）

每个 World Tick 中，世界状态在持续演化。

### 模拟系统清单

```typescript
class BackgroundSimulator {
  async tick(currentTick: number) {
    // 1. 时间推进
    this.advanceTimeOfDay();
    this.advanceSeason();          // 长时间尺度
    
    // 2. 天气演化
    this.evolveWeather();          // 天气自身变化
    this.applyWeatherEffects();    // 天气影响所有场景
    
    // 3. 火灾蔓延
    this.spreadFire();             // 火从燃烧房间向相邻蔓延
    this.burnoutFire();            // 燃料耗尽熄灭
    
    // 4. 结构老化与破坏
    this.applyStructuralDecay();   // 已损坏结构持续恶化
    this.handleCollapses();        // 结构完整度=0 时坍塌
    
    // 5. 植被生长
    this.growVegetation();         // 野外场景的植物随时间变化
    
    // 6. 尸体/物品腐烂
    this.decayCorpses();
    this.degradeItems();
    
    // 7. 疾病/污染传播
    this.spreadDiseases();
    
    // 8. NPC 自发行为
    await this.npcAgentPool.tickActiveNPCs();
    
    // 9. 知识衰减
    this.knowledgeSystem.decay();
    
    // 10. 世界织网者（剧情涌现）
    await this.worldWeaver.tick();
  }
}
```

### 火灾蔓延示例

```typescript
async spreadFire() {
  for (const room of allRooms()) {
    if (room.dynamic.fire.intensity > 0) {
      // 减少燃料
      room.dynamic.fire.fuelRemaining--;
      if (room.dynamic.fire.fuelRemaining <= 0) {
        await this.recordStateChange(room.id, {
          type: 'fire_extinguished',
          before: { fire: { intensity: 0.8 } },
          after: { fire: { intensity: 0 } },
          cause: 'decay',
        });
        room.dynamic.fire.intensity = 0;
        continue;
      }
      
      // 向相邻房间蔓延
      for (const exit of room.base.exits) {
        const neighbor = mapState.getRoom(exit.target);
        if (neighbor.dynamic.fire.intensity === 0 && 
            this.canIgnite(neighbor, room.dynamic.fire)) {
          await this.recordStateChange(neighbor.id, {
            type: 'fire_spread',
            before: { fire: { intensity: 0 } },
            after: { fire: { intensity: 0.3 } },
            cause: 'fire_spread',
            causedBy: room.id,
          });
          neighbor.dynamic.fire.intensity = 0.3;
        }
      }
    }
  }
}
```

### 天气影响

```typescript
async applyWeatherEffects() {
  for (const room of allRooms()) {
    const weather = room.dynamic.weather;
    
    if (weather.type === 'rain' && room.base.material !== 'indoor') {
      // 灭火
      if (room.dynamic.fire.intensity > 0) {
        room.dynamic.fire.intensity -= 0.1 * weather.intensity;
      }
      // 积水
    }
    
    if (weather.type === 'storm' && room.base.material === 'wood') {
      // 木结构风化
      room.dynamic.structural -= 0.01 * weather.intensity;
    }
    
    // 季节影响
    if (room.dynamic.season === 'winter' && weather.type === 'snow') {
      // 积雪、路径封堵
    }
  }
}
```

## 涌现式剧情生成

### 设计原则

**剧情 = 世界观 + 涌现事件，不设置关键节点**

| 维度 | 设计 |
|---|---|
| 世界观 | 设计师定义：地理、势力、历史、初始 NPC、初始关系 |
| 关键节点 | **无**。剧情不被脚本化 |
| 大事件 | 由 NPC 行为 + 玩家动作 + 世界状态变化**涌现** |
| 设计师角色 | 提供土壤，不写剧本 |

### World Weaver（世界织网者）

一个特殊的"观察型" AI Agent，不直接干预世界，而是：

```typescript
class WorldWeaver {
  // 频率低于主 tick
  async weaverTick() {
    // 1. 分析世界状态
    const summary = await this.analyzeWorld();
    
    // 2. 检测潜在戏剧张力
    const tensions = this.detectEmergingDrama(summary);
    
    // 3. 让 LLM 建议微妙的"催化条件"
    if (tensions.length > 0) {
      const suggestion = await this.llm.suggestNudge(summary, tensions);
      // 例如：spawn a wandering merchant
      // 例如：让 NPC X 接到一封来自远方的信
      // 例如：在某处生成一个新的物品线索
      
      // 4. 应用建议（轻微，不强制结果）
      await this.applySuggestion(suggestion);
    }
  }
  
  detectEmergingDrama(world: WorldSummary): Tension[] {
    return [
      // 检测模式：
      // - 两个敌对 NPC 在同一区域
      // - 玩家接近某重要 NPC 的领地
      // - 资源紧张区域
      // - 长时间无事件的"沉寂区"
    ];
  }
}
```

### 大事件涌现路径

```
玩家进入某区域
  ↓
触发 NPC Agent "警觉" 状态
  ↓
NPC 决定接近玩家（基于其目标和性格）
  ↓
玩家和 NPC 互动，对话/交易/冲突
  ↓
冲突可能升级为战斗
  ↓
战斗产生 WorldEvent (爆炸/伤害)
  ↓
通过传播系统影响其他角色和场景
  ↓
火灾可能蔓延，波及第三方 NPC
  ↓
第三方 NPC 产生新反应（逃跑/反击/求援）
  ↓
求援可能引发更大规模冲突
  ↓
大事件从局部动作涌现
```

### 设计师提供的内容

```typescript
// 初始世界观（一次性，不写关键节点）
const initialWorld: WorldConfig = {
  geography: {
    // 房间布局
    // 气候带
    // 资源分布
  },
  factions: [
    {
      id: 'thieves_guild',
      name: '盗贼公会',
      members: ['npc_a', 'npc_b'],
      relations: { city_watch: 'hostile' },
    },
  ],
  npcs: [
    {
      id: 'npc_a',
      name: '神秘的陌生人',
      personality: '神秘、谨慎',
      goals: ['找到失落的遗物'],
      startingLocation: 'tavern',
    },
  ],
  history: [
    '十年前，城堡领主被暗杀，凶手未明',
    '近期有商队在森林失踪',
  ],
  // 无关键节点，无脚本事件
};
```

### NPC Agent 行为驱动

NPC 不是被动等待交互，而是有自己的目标：

```typescript
class NPCAgent {
  // 核心目标
  goals: Goal[];
  personality: Personality;
  // 当前计划
  currentPlan: Plan;
  
  // 每个 tick 决定
  async decideAction() {
    // 1. 评估当前状态
    // 2. 根据 personality 调整决策
    // 3. 选择最能推进 goals 的行动
    // 4. 可能包括：移动、对话、交易、攻击、等待
    
    const action = await this.llm.decide(this.context, this.goals, this.personality);
    await this.executeAction(action);
  }
}
```

NPC 之间的合作与冲突、目标冲突、关系演化都自然涌现。

## 数据库设计

### 表结构（单 SQLite 文件，按前缀隔离）

```
pi-realm.db
├── world_rooms               # 房间/地图基础
│   ├── id, name, description
│   ├── base (JSON: 静态字段)
│   └── dynamic (JSON: 动态状态)
│
├── room_state_changes        # 状态变更历史（记忆锚点）
│   ├── id, tick, world_time, room_id
│   ├── type, cause, caused_by
│   ├── before (JSON), after (JSON)
│   └── witnessed_by (JSON array)
│
├── world_weather             # 天气状态
│   ├── region_id, type, intensity
│   ├── wind_direction
│   └── updated_at
│
├── world_time                # 当前世界时间
│   ├── tick_count, game_time
│   ├── time_of_day, season
│   └── last_tick_at
│
├── world_events              # 完整事件日志
│   ├── id, tick, world_time
│   ├── type, location, payload (JSON)
│   ├── propagation (JSON: 传播参数)
│   └── visibility (JSON)
│
├── characters                # 所有角色
│   ├── id, name, type ('player' | 'npc')
│   ├── room_id, attributes (JSON)
│   ├── is_online
│   └── faction, goals (JSON)
│
├── character_items           # 角色物品
├── character_skills          # 角色技能
├── character_knowledge       # 知识条目（带衰减）
├── character_memories        # 角色记忆条目（含 Map State 引用）
│
├── users                     # 账号系统
│   ├── username, password_hash (bcrypt)
│   └── created_at
│
├── user_characters           # 用户-角色绑定
│   ├── user_id, character_id
│   └── last_login
│
├── npc_relationships         # NPC 关系网络
│   ├── npc_a_id, npc_b_id
│   ├── affinity (-100 to 100)
│   └── last_interaction
│
├── npc_schedules             # NPC 日程（可选）
│
├── plot_flags                # 剧情标记
│   ├── flag_name
│   ├── triggered_at, world_time
│   └── global / per-character
│
└── scout_snapshots           # 探查快照
    ├── id, scout_user_id, target_id
    ├── captured_at, world_time
    └── snapshot_data (JSON, 冻结)
```

## 战斗系统设计

### 风格

**回合制指令 + AI 叙事混合**：
- 默认提供文字冒险的标准指令选项（攻击/防御/技能/物品/逃跑）
- AI 生成的特殊选择分支与常规指令并列显示
- 超时等待机制：超时自动触发"自动"操作

### 数值体系

- HP / MP / ATK / DEF / SPD 基础属性
- 装备提供属性加成
- Buff/Debuff 系统（回合制持续时间）
- 经验值 + 等级系统（影响探查技能可用性）

## Docker 部署

### docker-compose.yml

```yaml
services:
  server:
    build: .
    command: ["node", "dist/server.js"]
    ports:
      - "3000:3000"
    volumes:
      - game-data:/app/data
      - game-logs:/app/logs
    environment:
      - MODE=server
      - JWT_SECRET=xxx
    restart: unless-stopped
    # 持续运行

  # 客户端通过 docker compose run 启动
  cli:
    build: .
    command: ["node", "dist/client/tui.js"]
    stdin_open: true
    tty: true
    volumes:
      - game-data:/app/data  # 共享存档（只读）
    profiles: ["cli"]
    # 使用: docker compose run --rm cli

volumes:
  game-data:
  game-logs:
```

### 使用方式

```bash
# 启动服务端
docker compose up -d server

# CLI 客户端连接
docker compose run --rm cli

# Web 客户端
# 浏览器访问 http://localhost:3000
```

## 后续规划

### 短期（MVP）
- [ ] 项目脚手架搭建（npm init, tsup, Biome, Dockerfile）
- [ ] 数据库 schema 设计
- [ ] 可见性系统实现（filter, scout, knowledge）
- [ ] WebSocket 服务端 + 认证
- [ ] CLI 客户端（pi-tui）
- [ ] pi-agent 集成与 Tool 定义
- [ ] 基础战斗系统
- [ ] Tick 系统
- [ ] Docker 部署

### 中期
- [ ] NPC AI Agent 并行池
- [ ] 探查技能系统（带等级/熟练度）
- [ ] 知识衰减系统
- [ ] 多角色支持
- [ ] 战斗系统完善（技能、Buff、装备）

### 长期
- [ ] Web 客户端
- [ ] NPC 日程系统
- [ ] 联机模式
- [ ] 剧情系统
- [ ] 玩家间私聊（信息可见性局部突破）
