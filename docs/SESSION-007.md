# 会话记录 SESSION-007

- **日期**：2026-06-01
- **主题**：游戏循环流程实现 — 跑通第一轮
- **前置会话**：[SESSION-006.md](SESSION-006.md)

---

## 背景

前 6 个阶段完成了架构设计、模块开发和测试、Dashboard 和 Docker 部署，但**各模块未串联**。
server.ts 是空壳，world 状态为 0 rooms / 0 characters / 0 ticks。

本阶段目标：**让游戏循环跑起来**——世界初始化 → Tick 循环 → WebSocket 动作处理。

---

## 新增/修改文件

| 文件 | 说明 |
|---|---|
| `src/game/engine.ts` | 游戏引擎——串联所有模块的核心循环 |
| `src/game/world.ts` | 世界初始化——Demo 内容（6 房间 + 5 角色） |
| `src/game/actions.ts` | 玩家动作系统（move / look / say / who） |
| `src/server.ts` | **重写**——集成引擎 + WebSocket 消息路由 |

---

## 游戏循环流程

### 启动序列

```
Server start()
  └─ GameEngine()
       ├─ createDemoWorld()          → 6 rooms, 5 characters
       ├─ MemoryStore()
       ├─ TickScheduler()
       └─ startLoop(30s)
            ├─ setInterval(runTick, 30s)
            └─ 每次 tick:
                 ├─ advanceTimeOfDay()        // dawn→day→dusk→night→dawn
                 ├─ evolveWeather()           // clear/rain 随机
                 ├─ applyWeatherEffects()     // 雨灭火、风吹木结构
                 ├─ spreadFire()              // 火灾蔓延
                 ├─ applyStructuralDecay()    // 结构老化
                 ├─ memory.decay()            // 知识衰减
                 └─ broadcastTick()           // 推送给在线客户端
```

### WebSocket 消息路由

```
Client                        Server
  │  connect                      │
  │  ◄── {type:"connected"}       │
  │  login(charId)                │
  │  ◄── {type:"login_ok",view}   │
  │  action({type:"move",dir:"N") │
  │  ├── actionMove()             │
  │  ├── 更新角色位置              │
  │  ├── 生成 WorldEvent          │
  │  └── ◄── action_result+view   │
  │  action({type:"look"})        │
  │  ├── actionLook()             │
  │  └── ◄── action_result+view   │
  │  action({type:"say",text:""}) │
  │  ├── actionSay()              │
  │  └── ◄── action_result+view   │
```

### Client 视角数据流

```
Client 看到的 CharacterView:
{
  self: { hp, mp, roomId },
  currentRoom: {
    name, description, exits,
    occupants: [...其他角色名],
    marks: [...地面痕迹],
    timeOfDay, weather
  },
  events: [...近期事件],
  availableActions: [look, move, say, who, inventory]
}
```

---

## Demo 世界

### 地图

```
  Blacksmith Workshop
        ↑  S
 Village Square ← E → Drunken Dragon Tavern
        ↓  S
   Forest Path
        ↓  S
    Old Ruins
        ↓ DOWN
  Underground Crypt
```

### 角色

| ID | 名称 | 类型 | 初始位置 | 等级 |
|---|---|---|---|---|
| player-1 | Wanderer | player | Village Square | 1 |
| npc-bartender | Grum | npc | Drunken Dragon Tavern | 3 |
| npc-smith | Hilda | npc | Blacksmith Workshop | 5 |
| npc-guard | Aldric | npc | Village Square | 4 |
| npc-mysterious | ??? | npc | Old Ruins | 8 |

### 已验证的功能

| 功能 | 验证结果 |
|---|---|
| World init → 6 rooms, 5 chars | ✓ `rooms:6, characters:5` |
| Tick loop → gameTime 递增 | ✓ `tick=1, gameTime=1` |
| WS login → character found | ✓ `Character: Wanderer, HP:100/100` |
| Look → 房间描述 + NPC 列表 | ✓ `Here: Aldric` |
| Move N → Blacksmith Workshop | ✓ `Success, Message: You move N to Blacksmith Workshop` |
| Say → 聊天 | ✓ `Message: You say: "Hello, world!"` |
| 88 tests passing | ✓ `7 files, 88 tests passed` |

---

## 使用方式

```bash
# 启动服务器
docker compose up -d server

# 验证
curl http://localhost:3001/api/status
# → rooms:6, characters:5, tick:N

# WebSocket 测试（Node.js）
node -e "
const ws = new (require('ws'))('ws://localhost:3001/ws');
ws.on('message', d => console.log(JSON.parse(d)));
ws.on('open', () => {
  ws.send(JSON.stringify({type:'login',payload:{characterId:'player-1'}}));
  setTimeout(() => ws.send(JSON.stringify({type:'action',payload:{type:'move',payload:{direction:'N'}}}), 1000));
});
"
```

---

## 后续

- [ ] 更好的 WebSocket 客户端（TUI pi-tui 或 命令行工具）
- [ ] 动作增加更多类型（inventory, take, drop）
- [ ] 接入 pi-agent-core 实现 NPC AI 决策
- [ ] 数据库持久化（当前全部在内存中）
- [ ] 信息可见性过滤集成（当前动作结果直接推送，未经过滤管线）
