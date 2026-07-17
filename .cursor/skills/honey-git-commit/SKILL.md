---
name: honey-git-commit
description: Repository-local git commit workflow for the Honey repo. Use when Codex needs to prepare or perform a commit in this repository, especially for requests like "提交代码", "帮我 commit", "总结改动后提交", "意图识别", "分次提交", or when generating a commit subject from staged changes. Inspect only staged changes, auto-detect one or more commit intents, propose conventional `type(scope): subject` lines, and create one commit per intent without pulling unstaged work into commits.
---

# Honey Git Commit

按本仓库的提交规范执行提交。先检查已暂存改动，再由 AI **自动识别意图**；若存在多个无关意图，则 **自动拆成多次 commit**（每意图一次），而不是硬凑成一条多主题 subject。

## Workflow

1. 只查看 staged 改动。
   - 先运行 `git diff --cached --name-only`。
   - 再运行 `git diff --cached --stat` 和 `git diff --cached`。
   - 不要把 unstaged 或 untracked 改动纳入总结，也不要默认帮用户 `git add` 未暂存内容。
2. 在没有 staged 改动时停止。
   - 明确告诉用户当前没有可提交内容。
   - 如确实需要继续，再让用户决定是否先自行暂存，或明确要求你去暂存。
3. **自动意图识别（必做）。**
   - 阅读完整 staged diff，按“可独立解释的用户/仓库结果”切分意图。
   - 每个意图必须能写成 **一条** `type(scope): subject`，且不依赖其它意图才能说清楚。
   - 若只有 1 个意图 → 走单次提交路径。
   - 若有 ≥2 个无关意图 → 走 **分次提交** 路径（见下），不要硬选一个“主意图”吞掉其余改动。
4. 先展示计划，再提交（除非用户要求直接提交）。
   - 单意图：展示 `Summary` + `Subject`。
   - 多意图：展示编号计划，每条含 `Summary`、`Subject`、拟纳入的文件/改动范围。
   - 除非用户明确要求“直接提交”/“直接 commit”，否则等待确认后再执行。
5. 执行 commit。
   - 单意图：`git commit -m "<subject>"`（仅当前 staged 内容）。
   - 多意图：按计划顺序执行分次提交（见 Multi-Intent Split）。
   - 默认只写单行 subject；仅当用户明确要求 body，或需要额外背景时才追加 body。

## Intent Recognition

把 staged 改动切成尽量少、但彼此独立的意图。以下任一信号通常表示 **应拆分**：

- 不同产品能力或用户可感知行为（例如 Skills 核心 vs REPL picker vs README banner）
- 不同稳定模块/scope（例如 `tui` 行为修复 vs `docs` 资源替换），且没有“后者仅为前者配套”的关系
- 纯仓务/skill/配置与功能代码无关地混在一起
- 无法用 **一条** 不空泛的 subject 诚实概括全部 staged 改动

以下通常表示 **应合并为同一意图**：

- 同一行为的实现 + 配套测试
- 同一功能的代码 + 仅解释该功能的 ADR/`CONTEXT` 词条
- 同一依赖引入与唯一消费者的接线（例如 picker 与 `@inquirer/prompts`）
- 纯格式/重命名且无行为变化，且与相邻改动属于同一次整理

优先级（仅用于 **同一意图内部** 选 type，不用于把多意图压成一条）：

1. 用户感知行为变化（`feat` / `fix`）
2. 测试保障（`test`）
3. 重构/清理（`refactor` / `chore` / `docs`）

## Multi-Intent Split

当识别出 ≥2 个意图时：

1. 先向用户展示分次计划（Commit 1…N），每条含 Summary、Subject、文件范围。
2. 用户确认（或已说“直接提交”）后，**按依赖顺序**依次提交：
   - 被依赖的基础能力先于消费者（例如 skills 核心 → CLI picker）。
   - 同级无关意图按“用户感知 > 测试 > 仓务/文档”排序。
3. 执行方式（保持工作区其它未暂存改动不变）：
   - 用 `git reset HEAD`（或等价）清空 index，**不要**丢弃工作区内容。
   - 按意图选择性 `git add` 后 `git commit -m "<subject>"`。
   - 同一文件混有多意图时：写入该意图对应的中间版本 → add → commit → 再恢复后续意图的完整内容；禁止把无关 hunk 打进当前 commit。
   - `package.json` / lockfile 等同理：只纳入当前意图需要的依赖或脚本改动。
4. 全部完成后回报每条实际 subject 与 commit hash；确认工作区与“未纳入计划的 unstaged/untracked”状态。

禁止：

- 用一条多主题 subject 掩盖拆分需求
- 为了省事把无关意图塞进同一次 commit
- 自动 `git add` 计划外的 unstaged/untracked 文件

## Commit Format

始终使用：

```text
type(scope): subject
```

如果 scope 不明确，可退化为：

```text
type: subject
```

### Allowed Types

- `feat`: 新功能、用户可感知能力新增
- `fix`: 缺陷修复、行为纠正
- `refactor`: 不改变外部行为的结构调整
- `test`: 测试新增或测试修正
- `docs`: 文档内容变更
- `chore`: 杂项维护、配置、小型仓务
- `build`: 构建、打包、依赖、发布流程
- `ci`: CI/CD 工作流变更
- `perf`: 性能优化
- `revert`: 回滚历史提交
- `style`: 纯格式调整，不改变逻辑

优先选择最能描述“为什么要提交”的 type，不要机械地按文件后缀决定。

## Scope Rules

scope 优先取本仓库中的稳定模块名，而不是临时任务名。

按以下顺序选择：

1. 顶层产品或模块目录，如 `src` 下稳定子模块
2. 运行时/构建域，如 `runtime`、`build`、`docs`
3. 横切能力，如 `harness`、`specs`
4. 如果没有清晰 scope，则省略 scope

推荐映射：

- 改动集中在 `src/runtime/*`：优先考虑 `runtime` 或更具体的稳定子域
- 改动集中在 `src/tui/*`：优先考虑 `tui`
- 改动集中在 `src/skills/*`：优先考虑 `skills`
- 改动集中在 `src/cli*`：优先考虑 `cli`
- 改动集中在测试 harness：优先考虑 `harness`
- 改动集中在 `docs/`、`README.md`、`CONTEXT.md`：优先考虑 `docs`
- 改动集中在 `specs/`：优先考虑 `specs`

不要使用过长 scope。scope 一般控制在 1 到 2 个词。

## Subject Rules

subject 必须满足：

- 使用英文
- 使用祈使/结果式短语，如 `add retry coverage for runtime harness`
- 不以句号结尾
- 尽量不超过 72 个字符
- 聚焦结果，不复述实现细节
- 避免空泛词，如 `update stuff`、`fix issues`、`misc changes`

优先写“本次提交让什么发生了变化”，不要写“你做了什么操作”。

更好：

- `fix(runtime): avoid duplicate harness teardown`
- `test(harness): cover timeout cleanup path`
- `docs: clarify local issue tracker workflow`

较差：

- `fix runtime bug`
- `update test`
- `change files`

## Summary Output

### 单意图

- `Summary`: 1 到 3 句，只基于该意图的 staged 改动
- `Subject`: 最终建议的 commit subject

### 多意图

用编号列表展示计划，例如：

```text
检测到 N 个意图，将分次提交：

1. Summary: …
   Subject: type(scope): …
   Files: …

2. Summary: …
   Subject: type(scope): …
   Files: …
```

如果用户要求“直接提交”，可跳过确认，按计划直接执行全部分次 commit，并在完成后回报实际使用的 subject 与 hash。

## Decision Heuristics

- 同时包含代码与测试时：
  - 若核心价值是修复行为，优先 `fix(...)`
  - 若核心价值只是补测试，优先 `test(...)`
- 同时包含代码与文档时：
  - 以主改动为准；文档只是配套时不要用 `docs`，也不要拆成第二次无意义的 docs commit
- 纯重命名、提取函数、整理结构且行为不变时：
  - 使用 `refactor(...)`
- 依赖、脚本、构建配置调整：
  - 优先 `build(...)` 或 `chore(...)`；若依赖只为某一功能服务，归入该功能意图

## Guardrails

- 不要根据 unstaged diff 猜测提交内容。
- 不要把 unrelated changes 合并进一次 commit。
- 不要生成多主题 subject。
- 不要在没有读过 staged diff 的情况下直接起草 subject 或拆分计划。
- 多意图时必须自动拆分并展示计划；不要只提醒用户“请自行拆分”后停住（除非文件级冲突到无法安全拆分——此时说明阻塞点并请求指示）。
- 分次提交时不得丢失工作区未暂存改动；不得 reset --hard / 强制丢弃。

## Examples

用户说：

```text
帮我提交这次改动
```

执行方式：

1. 读取 staged diff 并识别意图
2. 单意图：输出 Summary + Subject，确认后 commit
3. 多意图：输出分次计划，确认后按序拆分 commit

用户说：

```text
直接 commit，帮我总结后提交
```

执行方式：

1. 读取 staged diff 并识别意图
2. 生成 Summary/Subject 或分次计划
3. 跳过确认，直接执行一次或多次 `git commit`
4. 回报实际 commit 结果

用户说：

```text
意图识别+分次提交
```

执行方式：

1. 强制走意图识别
2. 无论用户是否提“分次”，只要 ≥2 意图就产出分次计划并（确认后）执行
