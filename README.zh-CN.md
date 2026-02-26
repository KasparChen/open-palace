# Open Palace — Agent 的记忆宫殿

首个基于 ECS 架构的 AI Agent 认知记忆系统。

*Awareness, rather than memory.*

> [English Documentation](./README.md)

---

Open Palace 是首个类 ECS（Entity-Component-System）架构的 AI Agent 认知系统，以本地 MCP Server 形式运行。

出发点只有一个：**Agent 不是可靠的指令执行者**。你在 system prompt 里写"每次操作后记得 commit"。它会忘记、跳过、出错。所以一切必须发生的事，都应该是工程化的实现（PostHook Engine），不是 context 指令。

Open Palac 不是一个记忆插件，我们希望构建的是一个完整的认知栈：

- Agent *是谁*（Entity Registry，双向 SOUL 同步 + 人格演化追踪）
- Agent *知道什么*（Component Store，三级索引）
- Agent *做了什么决策以及为什么*（双层日志，含理由和被否决的方案）
- *哪些事情自动发生不需要 Agent 操心*（System Store，Librarian、Health Check、可扩展管道）

所有数据存在 `~/.open-palace/`，一个你完全自主拥有和管理的 git 仓库。

### 当下普遍的问题

现有 Agent 框架通过 context 指令和 Markdown 文件进行认知管理，但往往会频繁的出现问题：

- **空白且孤立的 Sub-agents：** spawn 一个 "CMO" sub-agent，它对上一个 "CMO" 做过什么一无所知。同名的 independent agent 同样也是一个完全独立的实体，没有任何共享状态。
- **丢失的跨 session 记忆：** 每个新 session 从零开始，想要获得更多的上下文就需要执行完全的 search 或者整体日志查询，上周定了什么？Agent 无从得知。
- **长上下文的退化：** 单个 session 内，随着上下文增长，Agent 的指令遵循准确度下降。Compaction 和 pruning 按块丢弃而非选择性裁剪，容易丢失关键的决策上下文。
- **多 Agent 间的上下文冗余：** 多 Agent 对话中每个参与者携带完整上下文，实际上各自只需要其中一部分。目前缺乏按需加载的结构化索引机制。
- **记忆文件缺乏保护：** 没有版本控制和结构性约束，Agent 可能用矛盾信息覆写已有记忆，且无法回滚。
- **Prompt 指令不可靠：** Context 中的指令是建议性的，Agent 可能忘记执行、跳过或格式错误。关键操作需要代码级保证。

Open Palace 用确定性工程解决这些问题：存算分离、代码级 PostHook、三级索引、Git 版本控制。

---

## 速览

首个 ECS 架构的 AI Agent 认知系统。身份 + 知识 + 决策，代码级保证。

1. **ECS 架构。** Entity Registry（身份/人格）+ Component Store（知识模块）+ System Store（自动化管道）。按需挂载/卸载。
2. **三级索引。** L0 总目录（< 500 tokens，始终在 context 中）提供全局 awareness。L1 摘要按需加载。L2 原始数据定点查询。Agent 不背 context，而是知道什么存在、按需加载。
3. **人格可追溯。** SOUL 在宿主 workspace 和 Open Palace 之间双向同步。每次变更记录演化历史。Git 回滚。人格不会静默漂移，每次变更都有据可查。
4. **决策可追溯。** 双层日志：操作日志自动生成 + 决策日志记录理由和被否决的方案。"为什么当时选了 SQLite？"答案在 changelog 里，不在谁的记忆里。
5. **代码级保证。** PostHook 引擎在每次写操作后自动 git commit、更新索引、写入日志。管道执行，不靠 prompt 指令。
6. **完全本地，完全可迁移。** `~/.open-palace/` 是自包含的 git 仓库。YAML + Markdown + Git。无云端依赖，`cp -r` 到任何机器。

---

## 什么是 ECS？

ECS（Entity-Component-System）是游戏行业的架构模式，守望先锋、矮人要塞和无数 MMO 背后的引擎都在用。跟传统 OOP 把行为绑在类继承树上不同，ECS 把身份（Entity）、数据（Component）和行为（System）解耦。

结果是一个模块化、可扩展的架构。加新数据类型或行为不用动已有代码。

在 Open Palace 中：

| ECS 概念 | Open Palace 实现 |
|----------|-----------------|
| **Entity** | Agent 身份：SOUL 内容、人格、演化历史 |
| **Component** | 知识模块：项目、技能、知识域、关系。每个自包含，有自己的摘要和 changelog。 |
| **System** | 自动化管道：Librarian（汇总）、Health Check（完整性校验）。通过注册扩展。 |

需要新的知识域？创建 Component。需要新的自动化流程？注册 System。Agent 的身份、知识和维护流程完全解耦。

---

## Agent 如何使用 Open Palace

**Session 启动。** Agent 调用 `mp_index_get`，收到 L0 总目录（< 500 tokens）。现在它知道所有项目、实体、系统的存在。不用搜索，不用猜。

**按需加载上下文。** 用户提到某个项目。Agent 从 L0 匹配，调用 `mp_component_load("projects/my-app")`，获取 L1 摘要和近期决策。只有需要的信息进入 context。

**记录决策。** Agent 调用 `mp_changelog_record`，写入决策内容、理由和被否决的方案。PostHook 自动处理 git commit、L0 更新和全局日志。Agent 不用管这些。

**Spawn sub-agent。** 主 Agent 调用 `mp_entity_get_soul("cmo")` 获取 sub-agent 的人格定义，加载相关 Component 摘要，注入到 spawn prompt 中。Sub-agent 启动时就带着完整上下文，不是白纸一张。

**后台维护。** Librarian 每天消化 changelog 生成 L1 摘要更新，每周做跨 Component 分析，每月重建 L0。Health Check 校验数据完整性。全部代码级执行，Agent 不参与。

---

## 五个设计原则

1. **存算分离。** 确定性工程（索引、日志、git）负责持久化。LLM 负责推理。各做各擅长的事。
2. **Awareness > Context。** Agent 不携带一切。它带着一个压缩的全局索引（< 500 tokens），对什么存在有结构化的感知。信息按需加载。
3. **Memory Agnostic。** 新 session、换模型、context 被清空：Agent 从 Open Palace 的结构化数据完全重建认知。
4. **工程管道 > Context 指令。** 必须发生的事（git commit、索引更新、日志写入）是代码级 PostHook，不是 LLM 可能忘掉的指令。
5. **可迁移性 > 记忆力。** 所有状态可序列化、可传递、有版本控制。把 `~/.open-palace/` 拷到任何机器。

---

## 系统架构

```
┌──────────────────────────────────────────────────────────────────┐
│                        MCP Server (stdio)                        │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  Entity Registry  │  │  Component Store  │  │ System Store  │  │
│  │  Identity + SOUL  │  │  Projects/Skills  │  │  Librarian    │  │
│  │  Evolution Log    │  │  Knowledge/Rels   │  │  Health Check │  │
│  │  Bidirectional    │  │  Load/Unload      │  │  Extensible   │  │
│  │  Workspace Sync   │  │  Per-component    │  │  Code-level   │  │
│  │                   │  │  Changelog        │  │  Pipelines    │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  3-Level Index    │  │  Dual-Layer      │  │  PostHook     │  │
│  │  L0: Global Map   │  │  Changelog       │  │  Engine       │  │
│  │  L1: Summaries    │  │  Operations      │  │  Auto git     │  │
│  │  L2: Raw Data     │  │  + Decisions     │  │  Auto index   │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │  Onboarding      │  │  Workspace Sync   │                    │
│  │  Auto-discovery   │  │  SHA256 diffing   │                    │
│  │  Guided setup     │  │  SOUL writeback   │                    │
│  └──────────────────┘  └──────────────────┘                     │
│                                                                  │
│                     Persistence Layer                             │
│          ~/.open-palace/ (YAML + Markdown + Git)                 │
└──────────────────────────────────────────────────────────────────┘
```

### 三级索引

```
Level 0: Master Index -- 始终在 context 中，< 500 tokens
  压缩格式，一眼看到所有项目、实体、系统。
  Agent 知道有什么，决定加载什么。

Level 1: Component Summaries -- 按需加载
  每个项目/知识域/技能一份摘要，Librarian 维护。
  多数问题在这一层就能回答，不用碰原始数据。

Level 2: Raw Data -- 不直接进 context
  完整 changelog、文档、代码。通过定点查询获取。
```

**检索流程**（逐层解包，不是暴力加载）：

```
用户: "上个月数据库选型最后定了什么？"

Step 1: L0 匹配（零成本，已在 context 中）
  → Master Index → 命中 [P] my-project

Step 2: L1 加载（一次 tool call）
  → mp_component_load("projects/my-project")
  → 返回摘要，含决策和当前状态

Step 3: L2 定点查询（只在需要细节时）
  → mp_changelog_query({scope: "projects/my-project", type: "decision"})
  → 返回具体决策记录，含理由和被否决的方案
```

---

## 快速开始

### 环境要求

- Node.js >= 18（推荐 v22）
- npm

### 安装 & 构建

```bash
git clone https://github.com/kasparchen/open-palace.git
cd open-palace
npm install
npm run build
```

### 连接到 MCP 宿主

**Claude Desktop** -- 编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "open-palace": {
      "command": "node",
      "args": ["/absolute/path/to/open-palace/dist/index.js"]
    }
  }
}
```

**Cursor** -- 添加到 `.cursor/mcp.json`（项目级或全局）：

```json
{
  "mcpServers": {
    "open-palace": {
      "command": "node",
      "args": ["/absolute/path/to/open-palace/dist/index.js"]
    }
  }
}
```

**OpenClaw** -- 添加到 `~/.openclaw/workspace/config/mcporter.json`：

```json
{
  "servers": {
    "open-palace": {
      "command": "node",
      "args": ["/absolute/path/to/open-palace/dist/index.js"]
    }
  }
}
```

### 验证安装

连接后，让 Agent 执行：

```
mp_index_get          → 应返回 L0 Master Index
mp_system_list        → 应显示 librarian 和 health_check
mp_onboarding_status  → 应显示安装状态和引导步骤
```

### 一键安装（适用于有 shell 权限的 agent）

如果你的 agent 能执行 shell 命令（OpenClaw、Cursor Agent、Claude Code 等），直接粘贴这段 prompt：

```
安装并配置 Open Palace -- Agent 的 ECS 结构化记忆系统。

步骤：
1. 克隆并构建：
   git clone https://github.com/kasparchen/open-palace.git ~/open-palace
   cd ~/open-palace && npm install && npm run build
2. 注册为 MCP server。入口文件：node ~/open-palace/dist/index.js
   - Cursor：添加到 .cursor/mcp.json 的 mcpServers 下
   - OpenClaw (mcporter)：添加到 ~/.openclaw/workspace/config/mcporter.json 的 servers 下
   - Claude Desktop：添加到 ~/Library/Application Support/Claude/claude_desktop_config.json 的 mcpServers 下
3. MCP server 连接后，运行 mp_onboarding_init 完成初始化
4. 在 session 启动流程中加入 mp_index_get（如 AGENTS.md），让每个新 session 自动加载全局感知索引
5. 运行 mp_index_get 验证
```

### 已连接后的初始化

如果 MCP server 已经安装连接但还没初始化过：

```
运行 mp_onboarding_status 检查当前状态，然后运行 mp_onboarding_init 完成初始化。
之后在 AGENTS.md 的 session 启动流程中加入 mp_index_get，
让每个新 session 自动加载全局感知索引。
```

---

## MCP 工具清单（24 个）

### Index: 全局感知

| 工具 | 说明 |
|------|------|
| `mp_index_get` | 获取 L0 Master Index，全局感知，< 500 tokens |
| `mp_index_search` | 按关键词搜索 L0 |

### Entity: 身份管理

| 工具 | 说明 |
|------|------|
| `mp_entity_list` | 列出所有注册的 Agent 身份 |
| `mp_entity_get_soul` | 获取人格定义（用于 sub-agent spawn 注入） |
| `mp_entity_get_full` | 获取完整 entity 含演化历史 |
| `mp_entity_create` | 注册新的 Agent 身份 |
| `mp_entity_update_soul` | 更新 SOUL 内容（双向：同时写回 workspace SOUL.md） |
| `mp_entity_log_evolution` | 追加演化记录 |

### Component: 知识模块

| 工具 | 说明 |
|------|------|
| `mp_component_list` | 按类型列出 Component |
| `mp_component_create` | 创建项目 / 知识 / 技能 / 关系模块 |
| `mp_component_load` | 挂载到 context（返回 L1 摘要 + 近期 changelog） |
| `mp_component_unload` | 从 context 卸载 |
| `mp_summary_get` | 获取 L1 摘要 |
| `mp_summary_update` | 更新 L1 摘要 |

### Changelog: 决策追踪

| 工具 | 说明 |
|------|------|
| `mp_changelog_record` | 记录操作或决策（含理由 + 被否决的备选方案） |
| `mp_changelog_query` | 按范围、类型、Agent、时间范围查询 |

### System: 自动化管道

| 工具 | 说明 |
|------|------|
| `mp_system_list` | 列出注册的系统和运行状态 |
| `mp_system_execute` | 执行系统（librarian、health_check） |
| `mp_system_status` | 查看运行历史和状态 |
| `mp_system_configure` | 更新系统配置 |

### Config: 配置管理

| 工具 | 说明 |
|------|------|
| `mp_config_get` | 按 dot-path 读取配置 |
| `mp_config_update` | 更新配置值 |

### Onboarding: 安装引导

| 工具 | 说明 |
|------|------|
| `mp_onboarding_status` | 检查安装状态，获取未完成步骤的引导 |
| `mp_onboarding_init` | 执行初始化：创建 skill、更新 TOOLS.md、同步 workspace 文件 |

---

## 核心系统

### Librarian

把 changelog 按三个层级消化成摘要：

| 层级 | 默认周期 | 做什么 |
|------|---------|--------|
| **Digest** | 每日 | 汇总近期 changelog → 更新 L1 摘要 → 更新 L0 时间戳 |
| **Synthesis** | 每周 | 跨 Component 关联分析 → 生成周报 → 识别项目间依赖 |
| **Review** | 每月 | 完整重建 L0 → 趋势分析 → 生成月报 → 清理建议 |

```bash
# 手动执行
mp_system_execute("librarian", {level: "digest"})
mp_system_execute("librarian", {level: "synthesis"})
mp_system_execute("librarian", {level: "digest", scope: "projects/myapp"})
```

Librarian 默认通过 MCP Sampling 使用宿主的 LLM（不需要额外 API key）。如果宿主不支持 Sampling，会退回到直接调用 Anthropic API。通过 `config.yaml` 中的 `llm.mode` 配置。

### Health Check

校验整个记忆系统的完整性：
- 索引一致性（L0 条目 vs 实际 Component 目录）
- 孤儿检测（有目录没索引条目，或反过来）
- 过期检测（changelog 有新条目但摘要没更新）
- Git 状态（有没有未 commit 的变更）
- Entity 同步状态

### Workspace 同步

Open Palace 在每次 MCP Server 启动时通过 SHA256 差异检测宿主 workspace 的文件变更（SOUL.md、AGENTS.md 等）：

- **Workspace → Open Palace**: 变更的文件自动备份。SOUL.md 的变更会更新 main entity 并记录演化历史。
- **Open Palace → Workspace**: `mp_entity_update_soul` 会把修改写回 workspace 的 SOUL.md。
- 所有变更都有 git commit，完整回滚历史。

### PostHook 引擎

每次写操作自动触发的副作用：

| 操作 | 自动触发 |
|------|---------|
| Entity 创建/更新 | Git commit + 演化记录 |
| Changelog 写入 | Git commit + L0 时间戳更新 |
| Summary 更新 | Git commit + L0 更新 |
| Component 创建 | 目录结构 + L0 条目 + git commit |

代码级管道。Agent 不需要"记得" commit 或更新索引。

---

## 数据目录结构

所有数据存储在 `~/.open-palace/`，一个自包含的 Git 仓库：

```
~/.open-palace/
├── config.yaml                 # 服务器配置
├── .git/                       # 完整版本控制历史
├── index/
│   ├── master.md               # L0 Master Index (< 500 tokens)
│   ├── weekly/                 # Librarian 周度综合报告
│   └── monthly/                # Librarian 月度回顾报告
├── entities/                   # Agent 身份注册表 (YAML)
│   ├── main.yaml
│   └── cto.yaml
├── components/
│   ├── projects/               # 项目知识模块
│   │   └── my-project/
│   │       ├── summary.md      # L1 摘要（Librarian 维护）
│   │       ├── changelog.yaml  # 项目级操作 + 决策日志
│   │       └── raw/            # L2 原始数据
│   ├── knowledge/              # 知识域模块
│   ├── skills/                 # 技能/工具模块
│   └── relationships/          # 关系追踪
├── changelogs/                 # 全局日志（按月分文件）
│   └── 2026-02.yaml
├── sync/
│   ├── sync-state.yaml         # SHA256 hash + 同步时间戳
│   └── workspace-backup/       # 宿主 workspace 核心文件备份
├── system-state.yaml           # 系统执行状态追踪
└── librarian-state.yaml        # Librarian 运行时间戳
```

---

## 配置文件

`~/.open-palace/config.yaml`：

```yaml
version: "0.1.0"
data_dir: "~/.open-palace"

librarian:
  schedules:
    digest:
      interval: daily       # hourly | daily | weekly | monthly | manual
      time: "02:00"
    synthesis:
      interval: weekly
      time: "Sun 03:00"
    review:
      interval: monthly
      time: "1st 04:00"
  llm:
    model: claude-sonnet

llm:
  mode: auto                # auto | sampling | direct
  # model: claude-sonnet-4-20250514    # direct 模式用
  # anthropic_api_key: sk-...          # direct 模式用，或设置 ANTHROPIC_API_KEY 环境变量

# Onboarding 完成后自动填充
workspace_sync:
  host: openclaw
  workspace_path: /home/node/.openclaw/workspace
  watched_files: [SOUL.md, IDENTITY.md, USER.md, AGENTS.md, TOOLS.md]
  entity_mapping:
    main: main

onboarding:
  completed: true
  completed_at: "2026-02-25T14:35:34.057Z"
```

---

## 开发

```bash
npm run typecheck         # 类型检查
npm run build             # 编译 TypeScript
npx tsx src/test-e2e.ts   # 运行 E2E 测试（44 个断言）
```

## 路线图

- **Phase 1** ✅ MCP Server 骨架 + Entity + Index + Component + Changelog + PostHook
- **Phase 2** ✅ L0/L1/Component/Changelog 核心逻辑
- **Phase 3** ✅ Librarian + System Store + Health Check
- **Phase 3.5** ✅ Onboarding + 双向 Workspace 同步
- **Phase 4** -- L2 RAG + Retrieval+Digest + 关系记忆

---

## 致谢

最初的设计调研看了六个游戏的记忆和人格机制：矮人要塞、极乐迪斯科、Nemesis 系统（中土世界：暗影魔多/战争）、博德之门 3、十字军之王 3、异域镇魂曲。主要收获是思路层面的：分层的记忆结构、记忆应该是可查询的而不是隐式的、关系可以用标签化的交互来捕捉。我们没有照搬任何游戏机制，LLM Agent 不需要状态机或人格数值系统，但这些游戏影响了我们思考这个问题的方式。

以下项目对架构有直接的、具体的影响：

- [Generative Agents](https://github.com/joonspk-research/generative_agents)（Stanford）-- 证明了"结构化外部记忆 + LLM 反思"真的可行的那篇论文。在这之前，给 Agent 一个显式的记忆存储会不会比单纯依赖更长的 context 更好，这件事并不显然。Open Palace 的整个前提，Agent 应该读写一个持久化的结构化存储而不是依赖 context window，可以追溯到这项工作。
- [MemGPT / Letta](https://github.com/letta-ai/letta) -- 提出了显式的记忆分层和 load/unload 操作，把 LLM context 当作需要管理的资源而不是垃圾桶。我们的 Component 挂载/卸载和 "Awareness > Context" 原则来自同一个洞察：Agent 不应该背着所有东西，它应该知道什么可用、按需加载。
- [HippoRAG](https://github.com/OSU-NLP-Group/HippoRAG) -- 模拟海马体的分层检索，先宽泛匹配再逐步缩小到具体细节，跟人类记忆的工作方式类似。直接影响了我们 L0→L1→L2 的逐层解包流程：从压缩的全局索引出发，需要时再深入。
- [OpenViking](https://github.com/volcengine/OpenViking) -- 分层上下文加载，Abstract / Overview / Details 三级按需交付。对我们三级索引设计（L0 Master Index / L1 Component Summary / L2 Raw Data）最直接的启发来源。
- [A-MEM](https://github.com/WujiangXu/A-mem) -- 基于 Zettelkasten 方法的 Agent 记忆，笔记之间自组织、智能关联。强化了一个想法：记忆条目之间应该互相连接，Agent 自己可以决定怎么组织知识。
- [Mem0](https://github.com/mem0ai/mem0) -- 把记忆做成独立的基础设施层，跟 Agent 运行时干净地分开。验证了 Open Palace 底层的存算分离原则：确定性工程管持久化，LLM 管推理。
- [Zep](https://github.com/getzep/zep) / [Graphiti](https://github.com/getzep/graphiti) -- 带时间维度的知识图谱，把时间作为 Agent 记忆的一等公民。影响了 changelog 的按时间查询，以及决策可追溯性的设计（不只记录做了什么决策，还记录什么时候做的、否决了什么）。
- [MCP](https://modelcontextprotocol.io/)（Anthropic）-- 让 Open Palace 不绑定任何特定宿主的协议层。没有 MCP 作为开放标准，要做一个同时兼容 Claude Desktop、Cursor、OpenClaw 的记忆系统，就得给每个宿主写适配器。
- [OpenClaw](https://github.com/nicepkg/openclaw) -- 我们集成的第一个宿主环境。OpenClaw 的 workspace 文件约定（SOUL.md、AGENTS.md、TOOLS.md）直接影响了双向同步和 onboarding 的设计。

**推荐阅读：** [@lijiuer92 的帖子](https://x.com/lijiuer92/status/2025678747509391664)，对 Agent 记忆架构有不错的分析。

---

## License

MIT
