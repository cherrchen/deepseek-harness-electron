# Agent Note: 桌面发布与可执行文件分类

Status: implemented

[English](2026-09-05-desktop-repository-test-classification.md) | 中文
## Problem

上游发布发现会纳入使用独立 npm scope 和版本的下游 manifest。可执行文件发现也会遇到四个尚未分类的桌面维护脚本。

## Decision

除已有的实验包排除规则外，dsh 发布家族还排除 `apps/electron` 和 `packages/dsh-electron`。私有包版本规划同样排除 `packages/dsh-electron`。其余候选包仍严格校验上游 scope。可执行文件清单逐项登记四个桌面版本和同步脚本；其他可执行文件仍须登记。

Python 集成测试要求 PATH 中存在可用的 CPython 3.10+。未激活的 mise shim 属于环境配置错误；运行时继续严格校验。

## Alternatives considered

**接受任意 npm scope。** 这可能让下游包随上游家族一起发布或修改版本。

**移除 shebang 或豁免整个桌面脚本目录。** 两者都会削弱可执行文件发现，掩盖新增启动器。

**绕过损坏的 Python shim 回退。** 这会静默改变所选解释器，而没有修正环境。

## Consequences

下游发布保持独立的成员和版本。下游目录结构变化时，需要维护这些明确的排除和分类。夹具测试覆盖保留上游成员、排除桌面成员、拒绝其他 scope、接受已分类维护脚本，以及拒绝未知桌面可执行文件。
