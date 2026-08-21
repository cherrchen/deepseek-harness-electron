# Agent Note: 下游 workflow 合并所有权

Status: implemented

[English](2026-08-21-downstream-workflow-merge-ownership.md) | 中文

## 问题

桌面下游保留上游 GitHub Actions 文件，以便上游同步维持仓库目录树，但其 CI/CD 策略只运行 `desktop-*.yml` 和 `sync-upstream.yml`。下游若修改上游 workflow 路径及其共享 spec，即使这些 workflow 不属于桌面自动化，也会反复产生内容冲突。

## 决策

上游拥有 `.github/workflows/*.yml` 和 `scripts/ci-workflow.spec.ts`。更具体的下游规则拥有 `.github/workflows/desktop-*.yml`、`.github/workflows/sync-upstream.yml` 和 `scripts/desktop-workflow.spec.ts`。[`.gitattributes`](../../../../.gitattributes) 记录优先级，[`sync-upstream.yml`](../../../../.github/workflows/sync-upstream.yml) 则在合并前注册 `theirs` 驱动，使干净合并和发生冲突的上游所有路径都采用上游内容。

下游 workflow 断言只位于 [`desktop-workflow.spec.ts`](../../../../scripts/desktop-workflow.spec.ts)。上游 [`ci-workflow.spec.ts`](../../../../scripts/ci-workflow.spec.ts) 与 `upstream/master` 保持逐字节一致；下游策略不向其中增加断言。

翻译配对记录继续使用专用合并驱动。先合并 owner Markdown 文件，再从已确认的合并后 owner 重新生成发生冲突的 `*.i18n.yaml` 记录，而不是按仓库所有权选择其中一侧。

## 曾考虑的替代方案

- **继续在 `ci-workflow.spec.ts` 中保留下游断言** — 否决，因为每条桌面断言都会使上游所有文件产生永久分叉。
- **删除未使用的上游 workflow** — 否决，因为上游修改会形成 modify/delete 冲突，且下游目录树不再与上游路径对应。
- **所有 workflow 路径统一选择一方** — 否决，因为桌面与同步 workflow 属于下游发布基础设施，不能被上游覆盖。

## 后果

上游 workflow 变更无需人工解决内容即可完成同步。桌面 workflow 变更在上游合并期间保持稳定。涉及上游 workflow 的下游要求必须通过下游所有的 workflow 或聚焦的下游策略文件实现，不得修改上游 workflow 或其 spec。

## 验证

聚焦的 workflow spec 会解析 YAML owner，并断言合并驱动注册和冲突兜底路径。翻译配对检查继续独立校验重新生成的双语记录。
