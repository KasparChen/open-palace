# Open Palace — Agent 的记忆宫殿

基于 ECS 架构的 AI Agent 认知记忆系统。

*Awareness, rather than memory.*

> [English Documentation](./README.md)

---

Open Palace 是一个类 ECS（Entity-Component-System）架构的 AI Agent 认知系统，以本地 MCP Server 形式运行。

出发点只有一个：**Agent 不是可靠的指令执行者**。你在 system prompt 里写"每次操作后记得 commit"。它会忘记、跳过、出错。所以一切必须发生的事，都应该是工程化的实现（PostHook Engine），不是 context 指令。

Open Palace 不是一个记忆插件，我们希望构建的是一个完整的认知栈：

- Agent *是谁*（Entity Registry，双向 SOUL 同步 + 人格演化追踪）
- Agent *知道什么*（Component Store，三级索引 + L2 混合搜索）
- Agent *做了什么决策以及为什么*（双层日志，含理由和被否决的方案，写前验证）
- Agent *和谁打交道*（Relationship Memory，交互标签 + 信任追踪）
- *哪些事情自动发生不需要 Agent 操心*（System Store，Librarian、Memory Decay、Health Check、Retrieval+Digest 等可扩展管道）

所有数据存在 `~/.open-palace/`，一个你完全自主拥有和管理的 git 仓库。

### 当下普遍的问题

现有 Agent 框架通过 context 指令和 Markdown 文件进行认知管理，但往往会频繁的出现问题：

- **空白且孤立的 Sub-agents：** spawn 一个 "CMO" sub-agent，它对上一个 "CMO" 做过什么一无所知。同名的 independent agent 同样也是一个完全独立的实体，没有任何共享状态。
- **丢失的跨 session 记忆：** 每个新 session 从零开始，想要获得更多的上下文就需要执行完全的 search 或者整体日志查询，上周定了什么？Agent 无从得知。
- **长上下文的退化：** 单个 session 内，随着上下文增长，Agent 的指令遵循准确度下降。Compaction 和 pruning 按块丢弃而非选择性裁剪，容易丢失关键的决策上下文。
- **多 Agent 间的上下文冗余：** 多 Agent 对话中每个参与者携带完整上下文，实际上各自只需要其中一部分。目前缺乏按需加载的结构化索引机制。
- **记忆文件缺乏保护：** 没有版本控制和结构性约束，Agent 可能用矛盾信息覆写已有记忆，且无法回滚。
- **只增不减的记忆：** 没有主动遗忘机制，随着文件积累，检索噪音持续增加。用了几个月之后，找到正确的信息变得更难而不是更容易。
- **Prompt 指令不可靠：** Context 中的指令是建议性的，Agent 可能忘记执行、跳过或格式错误。关键操作需要代码级保证。

Open Palace 用确定性工程解决这些问题：存算分离、代码级 PostHook、三级索引、温度模型记忆衰减、写前验证、Git 版本控制。

---

## 核心亮点

**基于温度模型的记忆衰减。** 记忆不是永久的。Open Palace 对每条记录基于年龄、访问频率和引用次数计算温度分数。冷数据自动归档。被标记为 pinned 的条目受到保护。Librarian 的安全水位线确保在 digest 处理之前不会归档任何数据。结果：即使经过数月的数据积累，检索依然精准。

**抗 Compaction 的上下文快照。** 当宿主清空上下文时，Agent 立即恢复。`mp_snapshot_save` 写入一个覆写式的实时状态文件——当前焦点、活跃任务、阻塞项、近期决策。Compaction 后，`mp_snapshot_read` 一次调用恢复工作状态。不是 session 日志，是一个存档点。

**写入完整性保护。** 记忆进入系统前可以被验证。验证层检测四种风险：重复、矛盾、幻觉事实、过时覆盖。Decision 类型的条目自动触发验证。原则：不盲目信任 Agent 的写入。

**三层可插拔搜索。** L2 搜索使用当前可用的最佳后端：安装了 QMD 时用 QMD（BM25 + 向量 + LLM reranking），没有则退回 Orama BM25 嵌入式搜索，最后兜底简单关键词扫描。不需要自建 RAG 管道。Retrieval+Digest 系统结合 L0/L1/L2 结果和 LLM 合成，提供结构化的回答。

**带信任追踪的关系记忆。** 交互标签随时间自动累积。信任分基于显式事件演化。Agent 为每个用户或协作者构建结构化画像——沟通风格、专长、偏好——用于影响后续交互。

**集中化配置参考。** 所有子系统的可调参数——28 个参数覆盖 Librarian 调度、衰减阈值、验证规则、搜索后端等——汇总在一张可查询的参考表中，包含默认值、类型、影响的系统和代码位置。`mp_config_reference` 返回完整表格，支持关键字过滤。

---

## 速览

ECS 架构的 AI Agent 认知系统。身份 + 知识 + 决策 + 关系，代码级保证。

1. **ECS 架构。** Entity Registry（身份/人格）+ Component Store（知识模块）+ System Store（自动化管道）。按需挂载/卸载。
2. **三级索引。** L0 总目录（< 500 tokens，始终在 context 中）提供全局 awareness。L1 摘要按需加载。L2 原始数据定点搜索。Agent 不背 context，而是知道什么存在、按需加载。
3. **Working Memory。** 零摩擦的 `mp_scratch_write` 随时捕获工作中的洞察。Compaction 后依然存在。原生 `memory/*.md` 文件在启动时自动被吸收。
4. **抗 Compaction 快照。** 覆写式状态文件，Agent 在 context 被清空后立即读取，一次调用恢复焦点、任务和决策。
5. **人格可追溯。** SOUL 在宿主 workspace 和 Open Palace 之间双向同步。每次变更记录演化历史。Git 回滚。
6. **决策可追溯。** 双层日志 + 写前验证：自动捕捉重复、矛盾和幻觉记忆。
7. **温度模型记忆衰减。** 基于年龄、访问模式和引用次数的主动遗忘。冷数据归档而非删除。Librarian 安全水位线防止数据丢失。
8. **三层可插拔搜索。** QMD 混合搜索（可用时）、Orama BM25 嵌入式备选、简单扫描兜底。Retrieval+Digest 系统结合 L0/L1/L2 与 LLM 合成回答。
9. **关系记忆。** 交互标签、信任分、用户画像。Agent 学习如何与每个用户互动。
10. **代码级保证。** PostHook 引擎在每次写操作后自动 git commit、更新索引、写入日志、触发搜索 reindex。管道执行，不靠 prompt 指令。
11. **完全本地，完全可迁移。** `~/.open-palace/` 是自包含的 git 仓库。YAML + Markdown + Git。无云端依赖，`cp -r` 到任何机器。

---

## 快速开始

### 环境要求

- Node.js >= 18（推荐 v22）
- npm

### Cursor（推荐——一行命令安装）

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/KasparChen/open-palace/main/scripts/install-cursor.sh)
```

自动克隆、构建、注册 MCP server 到 `~/.cursor/mcp.json`，并安装 Cursor rule + skill 文件。Agent 在每个 session 中自动使用 Open Palace。

### Claude Desktop

编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`：

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

### OpenClaw

添加到 `~/.openclaw/workspace/config/mcporter.json`：

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

然后运行 `mp_onboarding_init` 自动完成 SKILL、TOOLS.md、AGENTS.md 配置。

### 验证安装

让 Agent 执行：

```
mp_index_get          → 应返回 L0 Master Index
mp_system_list        → 应显示 6 个注册系统
mp_onboarding_status  → 应显示安装状态
```

---

## 开发

```bash
npm run typecheck         # 类型检查
npm run build             # 编译 TypeScript
npx tsx src/test-e2e.ts   # 运行 E2E 测试（138 个断言）
```

## 路线图

- **Phase 1** -- MCP Server 骨架 + Entity + Index + Component + Changelog + PostHook
- **Phase 2** -- L0/L1/Component/Changelog 核心逻辑
- **Phase 3** -- Librarian + System Store + Health Check
- **Phase 3.5** -- Onboarding + 双向 Workspace 同步
- **v0.2** -- Working Memory（Scratch + Memory Ingest + Librarian scratch triage）
- **v0.3** -- Cursor 集成（rule + skill 自动安装，多环境 onboarding）
- **v0.4** -- Context Snapshot、Librarian Safety Gate、Memory Decay、Write Validation、Relationship Memory、三层搜索（QMD/Orama/builtin）、Retrieval+Digest、Staleness Scoring、集中化配置参考

---

## 致谢

最初的设计调研看了六个游戏的记忆和人格机制：矮人要塞、极乐迪斯科、Nemesis 系统（中土世界：暗影魔多/战争）、博德之门 3、十字军之王 3、异域镇魂曲。主要收获是思路层面的：分层的记忆结构、记忆应该是可查询的而不是隐式的、关系可以用标签化的交互来捕捉。我们没有照搬任何游戏机制，LLM Agent 不需要状态机或人格数值系统，但这些游戏影响了我们思考这个问题的方式。

以下项目和文章对架构有直接的影响：

- [Generative Agents](https://github.com/joonspk-research/generative_agents)（Stanford）-- 证明了"结构化外部记忆 + LLM 反思"真的可行的那篇论文。Open Palace 的整个前提——Agent 应该读写一个持久化的结构化存储而不是依赖 context window——可以追溯到这项工作。
- [MemGPT / Letta](https://github.com/letta-ai/letta) -- 提出了显式的记忆分层和 load/unload 操作，把 LLM context 当作需要管理的资源。我们的 Component 挂载/卸载和 "Awareness > Context" 原则来自同一个洞察。
- [HippoRAG](https://github.com/OSU-NLP-Group/HippoRAG) -- 模拟海马体的分层检索。直接影响了我们 L0→L1→L2 的逐层解包流程。
- [OpenViking](https://github.com/volcengine/OpenViking) -- 分层上下文加载，Abstract / Overview / Details 三级按需交付。对我们三级索引设计最直接的启发来源。
- [A-MEM](https://github.com/WujiangXu/A-mem) -- 基于 Zettelkasten 方法的 Agent 记忆，笔记之间自组织、智能关联。
- [Mem0](https://github.com/mem0ai/mem0) -- 把记忆做成独立的基础设施层，验证了存算分离原则。
- [Zep](https://github.com/getzep/zep) / [Graphiti](https://github.com/getzep/graphiti) -- 带时间维度的知识图谱，影响了 changelog 的按时间查询和决策可追溯性的设计。
- [Ray Wang 的 OpenClaw 记忆管理实战指南](https://x.com/wangray/status/2027034737311907870) -- 基于 5 个 Agent 协作团队 30 天实际运行的实践报告。温度模型记忆衰减、"先提炼再遗忘"的安全原则、NOW.md Compaction 恢复模式、CRUD 写前验证方案的直接灵感来源。Open Palace 用代码级保证而非 prompt 指令来实现了这些模式。
- [MCP](https://modelcontextprotocol.io/)（Anthropic）-- 让 Open Palace 不绑定任何特定宿主的协议层。
- [OpenClaw](https://github.com/nicepkg/openclaw) -- 我们集成的第一个宿主环境。OpenClaw 的 workspace 文件约定直接影响了双向同步和 onboarding 的设计。
- [QMD](https://github.com/tobi/qmd) -- 本地混合搜索引擎（BM25 + 向量 + LLM reranking）。Open Palace 的三层搜索后端在 QMD 可用时将其作为最高质量的选项。

**推荐阅读：** [@lijiuer92 的帖子](https://x.com/lijiuer92/status/2025678747509391664)，对 Agent 记忆架构有不错的分析。

---

## License

MIT
