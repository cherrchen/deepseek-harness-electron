中文 | [English](README.en.md)

# reference/ —— 稳定技术参考

收录**相对稳定、按需查阅的技术事实**：内部 API、schema、协议、格式、配置的参考说明。

- 收：机制性参考（数据流、格式契约、算法行为），内容与代码同步演进但结构稳定。
- 不收：决策理由（→ [`../decisions/`](../decisions/README.md)）、需求（→ [`../requirements/`](../requirements/README.md)）、一次性问题排查（→ [`../troubleshooting/`](../troubleshooting/README.md)）。
- 本目录文档不强制双语；禁止创建空壳 `.en.md`。

## 条目

- [git-graph-layout.md](git-graph-layout.md) —— Git Graph Layout Engine：DAG → Layout → Renderer 数据流、lane 语义、分页 continuation、renderer 契约与拓扑不变量。
