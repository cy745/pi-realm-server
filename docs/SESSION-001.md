# 会话记录 SESSION-001

- **日期**：2026-05-28
- **主题**：基于 pi-agent 的文字冒险 RPG 游戏需求澄清与技术栈讨论
- **工具**：Claude Code / oh-my-claudecode

---

## 背景

分析 GitHub 仓库 [earendil-works/pi](https://github.com/earendil-works/pi)（AI Agent 工具集 monorepo，56.7k stars）后，决定基于其核心包 `@earendil-works/pi-agent-core` 构建一个文字冒险 RPG 游戏。

---

## 需求澄清（Q&A 记录）

### 1. 游戏题材
> Q: 奇幻/科幻/悬疑/武侠/通用框架？
> **A: 通用框架，内容可插拔**

### 2. 世界状态管理
> Q: 纯 LLM 驱动 vs 代码管理结构化状态？
> **A: 代码管理结构化状态（推荐方案）**

### 3. MVP 功能集
> Q: 需要哪些功能？
> **A:**
> - 移动（N/S/E/W）
> - 查看环境（look）
> - 拾取/丢弃物品
> - 背包系统
> - 战斗系统（完整，含技能、装备、buff、道具）
> - NPC 对话
> - 装备系统
> - 技能/Buff 系统
> - 存档/读档
> - AI Agent 实时动态扩展内容元素

### 4. 交互形式
> Q: CLI / Web / 先 CLI 后 Web？
> **A: 先 CLI（pi-tui），后续扩展 Web**

### 5. 多人支持
> Q: 单人/多人？
> **A: 需支持多人（区分多个角色），暂时不联机，本地多角色**

### 6. 集成方式
> Q: pi Extension vs 独立 Node.js 应用？
> **A: 独立 Node.js 应用，基于 @earendil-works/pi-agent-core SDK**

### 7. 战斗系统风格
> Q: 回合制指令 vs 自动叙事？
> **A: 两者结合。默认显示文字冒险指令选项，AI 生成的特殊选择分支一起显示。有超时等待机制，超时触发自动操作**

### 8. Docker 部署场景
> Q: CLI 容器化 / Web 服务 / 两者都支持？
> **A: 两者都支持。数据持久化使用 Docker volume**

---

## 技术栈决策

| 决策项 | 选择 | 说明 |
|---|---|---|
| CLI 框架 | `@earendil-works/pi-tui` | 差分渲染，适合频繁内容刷新 |
| 内容定义格式 | TypeScript 代码定义 | 类型安全，IDE 友好 |
| 持久化方案 | SQLite | 嵌入式，无需额外服务 |
| ORM | Kysely | 类型安全 SQL 查询构建器 |
| 构建工具 | tsup | 零配置打包 TS |
| 测试框架 | vitest | TS 原生集成，速度快 |
| 代码规范 | Biome | 格式化+lint 合一 |
| 项目结构 | 单体包 | MVP 阶段够用 |
| 数据存储 | Docker volume 挂载 | 容器重启数据不丢 |

---

## 世界系统设计决策

### 持续性世界
> Q&A: 世界在没有用户在线时持续演进

### NPC 设计
> Q&A: NPC 按正常角色模板设计，与玩家共享属性结构，由 AI Agent 驱动

### 存档分离
> Q: 同一个 SQLite 不同表 / 两个 SQLite 文件？
> **A: 同一个 SQLite，不同表前缀隔离**

### Tick 系统
| 参数 | 值 |
|---|---|
| 现实 5min = 游戏 1h | 1 游戏日 = 现实 2h |
| 过载策略 | 超时跳过下一 tick，AI 感知正确世界时间 |
| NPC 调度 | 多 Agent 并行池，按玩家距离动态调整频率 |
| 时间流速 | 加速时间（非 1:1 实时） |

### Tick 过载策略细节
> Q&A: 当一个 tick 的结束时间超过下一个 tick 的开始时间时，跳过下一个 tick，等待下下个 tick 的执行。需要传递正确的 tick 时间，让 AI Agent 正确感知到当前的世界时间。

### NPC Agent 调度
> Q&A: 多 Agent 并行池（多个 pi-agent 并发运行）

---

## 交付物

1. `docs/ARCHITECTURE.md` — 完整架构设计文档
2. `docs/SESSION-001.md` — 本会话记录

---

## 下一步待定

- [ ] 项目脚手架搭建（npm init, tsup, Biome, Dockerfile, docker-compose）
- [ ] 深入设计某个子系统（战斗数值、Tick 实现、NPC Agent 池架构）
- [ ] 直接进入编码实现
