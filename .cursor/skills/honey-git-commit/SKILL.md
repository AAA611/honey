---
name: honey-git-commit
description: Repository-local git commit workflow for the Honey repo. Use when Codex needs to prepare or perform a commit in this repository, especially for requests like "提交代码", "帮我 commit", "总结改动后提交", or when generating a commit subject from staged changes. Inspect only staged changes, summarize them, derive a conventional `type(scope): subject` line, and create the final git commit without pulling unstaged work into the commit.
---

# Honey Git Commit

按本仓库的提交规范执行提交。先检查已暂存改动，再由 AI 总结改动意图，最后生成并使用规范化的 `git subject` 完成 commit。

## Workflow

1. 只查看 staged 改动。
   - 先运行 `git diff --cached --name-only`。
   - 再运行 `git diff --cached --stat` 和 `git diff --cached`。
   - 不要把 unstaged 或 untracked 改动纳入总结，也不要默认帮用户 `git add`。
2. 在没有 staged 改动时停止。
   - 明确告诉用户当前没有可提交内容。
   - 如确实需要继续，再让用户决定是否先自行暂存，或明确要求你去暂存。
3. 先总结，再生成 subject。
   - 根据 staged diff 提炼 1 个主要意图。
   - 如果存在多个改动，按“用户感知行为变化 > 测试保障 > 重构/清理”的优先级选主意图。
4. 生成最终 subject，并展示给用户。
   - 默认先给出 1 个最终 subject。
   - 除非用户明确要求“直接提交”，否则先展示 summary 和 subject，等待确认。
5. 执行 `git commit -m "<subject>"`。
   - 默认只写单行 subject。
   - 只有当用户明确要求补充 body，或改动需要记录额外背景时，才追加 commit body。

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

在 commit 前，先给用户一个极简摘要：

- `Summary`: 1 到 3 句，只基于 staged 改动
- `Subject`: 最终建议的 commit subject

如果用户要求“直接提交”，则可跳过确认，直接执行 commit，并在完成后回报实际使用的 subject。

## Decision Heuristics

- 同时包含代码与测试时：
  - 若核心价值是修复行为，优先 `fix(...)`
  - 若核心价值只是补测试，优先 `test(...)`
- 同时包含代码与文档时：
  - 以主改动为准；文档只是配套时不要用 `docs`
- 纯重命名、提取函数、整理结构且行为不变时：
  - 使用 `refactor(...)`
- 依赖、脚本、构建配置调整：
  - 优先 `build(...)` 或 `chore(...)`

## Guardrails

- 不要根据 unstaged diff 猜测提交内容。
- 不要把 unrelated changes 合并进一次 commit 的总结里。
- 不要生成多主题 subject，例如同时写功能、测试、文档三件事。
- 不要在没有读过 staged diff 的情况下直接起草 subject。
- 如果 staged 改动明显混杂且无法形成单一意图，先提醒用户拆分提交，而不是硬凑 subject。

## Examples

用户说：

```text
帮我提交这次改动
```

执行方式：

1. 读取 staged diff
2. 输出 summary
3. 提供一个最终 subject，例如 `test(harness): cover runtime teardown edge cases`
4. 用户确认后执行 commit

用户说：

```text
直接 commit，帮我总结后提交
```

执行方式：

1. 读取 staged diff
2. 生成 summary 和 subject
3. 直接执行 `git commit -m "<subject>"`
4. 回报实际 commit 结果
