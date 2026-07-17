中文 | [English](README.en.md)

<p align="center">
  <img src="docs/assets/honey-banner.svg" alt="HONEY" width="100%" />
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" />
  <img alt="Node.js 18.18+" src="https://img.shields.io/badge/Node.js-%3E%3D18.18-339933?logo=nodedotjs&logoColor=white" />
  <img alt="Vitest" src="https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white" />
  <img alt="version 0.1.0" src="https://img.shields.io/badge/version-0.1.0-0B6E4F" />
</p>

<p align="center">
  <img alt="Harness" src="https://img.shields.io/badge/Harness-FFAF00" />
  <img alt="Skills" src="https://img.shields.io/badge/Skills-E67E22" />
  <img alt="REPL" src="https://img.shields.io/badge/REPL-2E86AB" />
  <img alt="Patch-first" src="https://img.shields.io/badge/Patch--first-27AE60" />
  <img alt="Session Log" src="https://img.shields.io/badge/Session%20Log-8E44AD" />
</p>

# Honey

**一个本地 TypeScript Harness，用来学习 Codex / Claude Code 风格的 agent runtime 是怎么搭出来的。**

Honey 是一个小而可检视的 agent 运行时，用来研究现代 coding agent 背后的核心循环：

- 显式状态迁移
- 结构化 JSON tool call
- patch-first 编辑
- guarded vs safe 的 Tool 执行边界
- 分层 context 与 summarization
- 轻量 Plan
- 结构化事件日志
- eval fixture 与 runtime 测试
- Skill 包发现、目录注入与脚本执行

它故意保持狭窄。Honey 目前不追求做成完整的托管 agent 平台；目标是让 Harness 本身容易阅读、运行、修改和扩展。

---

## 为什么是 Honey

多数 agent 项目要么：

- 把 runtime 藏在庞大的产品表面之下，要么
- 停在没有真实控制边界的玩具 ReAct demo

Honey 瞄准中间地带：

- **小到一次能读懂**
- **真到能学到实际 Harness 问题**
- **结构清楚，能往生产向 runtime 延展**

如果你想看清 Provider、Runtime、Tools、Context 与 policy 之间的接缝，这个仓库就是那个起点。

---

## 当前能力

### Runtime

- 显式状态机：`USER_INPUT -> MODEL_TURN -> TOOL_DISPATCH -> TOOL_RESULT -> DONE/ERROR`
- Provider 抽象，规范化 tool-call 响应
- 轻量 Plan，带步骤状态跟踪
- 结构化事件日志，便于 Run / Turn 检视
- Session event log：默认开启的 JSONL 时间线，写在 `.honey/session-logs/`（可用 `--no-session-event-log` 关闭；用 `--session-event-log-dir` 或 `HONEY_SESSION_EVENT_LOG_DIR` 覆盖目录）

### Tools

- `read_file`
- `search_workspace`
- `exec_command`
- `apply_patch`
- `run_tests`
- `run_skill_script`

### Skills

- Skill 文件系统包（`SKILL.md` + 可选 scripts / references）
- Skill catalog 注入 Assembled prompt 的 Root set
- 显式 `$name` 注入与按需 `read_file` 加载
- REPL Skill picker / slash overlay（`/` 或 `/skills`）
- Plugin 在 v1 仅作分发占位（见 `src/plugins/types.ts`）

### Guardrails

- Safe vs guarded Tool 分类
- 运行时可关闭 guarded Tool 执行
- Patch-first 编辑模型
- Skill 脚本按 Skill scope 审批（bundled / repo / user）

### Context

- 稳定 system instructions
- 当前 Task 层
- 活跃 Working set
- 历史压缩后的 Summary

### Session UX

- Command mode：`honey "<prompt>"` 一次性执行
- REPL mode：TTY 下使用 Session TUI（Transcript + Composer + slash Overlay）
- Session banner：Session 入口的品牌欢迎面

### Testing

- TypeScript typecheck
- 基于 `vitest` 的 runtime 测试
- 最小端到端 Harness eval 入口

---

## 它现在不是什么

Honey **当前不提供**：

- 多 agent 编排
- 托管服务
- 浏览器自动化
- 长期记忆系统
- 完整审批工作流产品
- 桌面端 / 完整 IDE UX（Session TUI 仅覆盖 REPL 交互壳）

默认 CLI 仍使用 **scripted Provider**，演示与测试不依赖外部 API。需要真实模型 Turn 时，可显式选择 OpenAI-compatible Provider（DeepSeek preset）。

---

## 快速开始

### 要求

- Node.js `>= 18.18`
- npm

### 安装依赖

```bash
npm install
```

### 本地终端安装

主开发路径：

```bash
npm install
npm run build
npm link
honey
```

打包校验路径：

```bash
npm install
npm run build
npm pack
npm install -g ./honey-0.1.0.tgz
honey
```

### 校验项目

```bash
npm run typecheck
npm test
npm run build
```

### 运行 demo CLI

```bash
npm start
```

或直接传 prompt：

```bash
node dist/cli.js "read: CONTEXT.md"
node dist/cli.js "search: Harness"
```

### 运行 eval 入口

```bash
npm run eval
```

---

## 当前 CLI 行为

默认：scripted Provider。

支持的 scripted demo prompt 模式：

- `read: <path>`
- `search: <query>`

示例：

```bash
npm run build
node dist/cli.js "read: CONTEXT.md"
```

可选的 live DeepSeek preset（OpenAI Chat Completions 兼容；需要 API key）。这是**手动 smoke**路径——自动化测试使用假 HTTP transport，**不会**在 CI 里调用 DeepSeek：

```bash
export DEEPSEEK_API_KEY=...
honey --provider deepseek --allow-guarded-tools "read CONTEXT.md and summarize"
```

覆盖项：`--model`、`--base-url`，或环境变量 `HONEY_MODEL` / `HONEY_BASE_URL`。Key 回退：`HONEY_API_KEY`。除非设置 `--allow-guarded-tools`，否则 guarded Tools 保持关闭。Live 调用需显式 `--provider deepseek`；缺凭证会直接失败。

这条路径会跑通真实 Harness runtime：

1. 用户输入进入 runtime
2. Provider 返回结构化 tool call
3. Tool 执行
4. Tool 结果写回对话
5. runtime 干净退出并给出最终 assistant 响应

---

## 项目结构

```text
src/
  cli.ts                 # 本地 CLI 入口
  cli/                   # CLI 辅助（如 Skill picker 降级路径）
  types.ts               # 共享 runtime / Provider 类型
  context/               # 分层 context 与 summarization
  evals/                 # 最小 eval 入口
  logging/               # 结构化事件日志
  planning/              # 轻量 Plan 状态
  plugins/               # Plugin 分发占位类型
  providers/             # Provider 抽象与 scripted Provider
  runtime/               # Harness 状态机
  skills/                # Skill 发现、解析、catalog、bundled Skills
  tools/                 # Tool 定义、registry、session manager
  tui/                   # Session TUI（Ink + React）
```

其他重要文件：

- `specs/harness-v0-spec.md` — V0 产品与架构规格
- `CONTEXT.md` — 项目 glossary 与领域词汇
- `AGENTS.md` — 本地 agent 工作流约定
- `docs/adr/` — 架构决策记录

---

## 架构概览

Honey 按大型 agent 系统同样关键的边界切开：

- **Provider** 负责把模型响应规范化
- **Runtime** 拥有状态机与 turn loop
- **Tools** 定义 agent 对环境能做什么
- **Skills** 提供可复用任务包（指令 + 可选脚本），与 Tool 不同
- **Context** 控制每轮模型看到什么
- **Planning** 把任务状态留在 Transcript 之外
- **Logging** 捕获可回放的事件流

这种分离本身就是这个项目的重点。

---

## 开发

### 主要脚本

```bash
npm run typecheck
npm test
npm run build
npm run eval
npm start
```

### 典型工作流

```bash
npm install
npm run typecheck
npm test
npm run build
npm run eval
```

---

## Roadmap

Harness 下一步计划：

- 更丰富的 guarded 审批流
- 更强的 patch 格式与编辑校验
- 更高信号的 eval fixture
- 更好的 Session 检视与 streaming UX
- 在现有 adapter 之上提供可选的 `--provider openai-compatible` CLI 糖
- Plugin 安装与 MCP bundling（超出 v1 Skill 核心环）

---

## 设计原则

- **显式 runtime 控制优先于 prompt 魔法**
- **保持 Tool 接口结构化**
- **把安全策略写成代码，而不是措辞**
- **用仍能教对课的最小架构**
- **runtime 还没有的能力，不要假装有**

---

## License

尚未添加 license 文件。
