# Agent Note: Windows native-control inset for the tabbed client UI

Status: implemented

[English](2026-09-14-electron-windows-native-control-inset.md) | 中文

## Problem

带标签页的客户端 UI 会在窗口顶边绘制面板标签条和 76 像素高的会话 Header。Windows 把原生 Window Controls Overlay（最小化、最大化、关闭，约 138 × 40 CSS 像素）覆盖在同一区域的右上角，于是右侧面板的标签条和 Header 右侧控件都落在系统按钮之下（issue #93）。

只在会话 Header 内部留出边距只能让这一个 Header 避开：面板标签条并不是会话 Header，窗口顶边上此后出现的每个界面元素都需要各自预留宽度。

## Decision

侧栏右侧的各列在 Windows 和 Linux 上让出原生控件行，与 macOS 侧栏让出“交通信号灯”行完全一致。[`window-chrome.css`](../../../../apps/electron/src/renderer/desktop/window-chrome.css) 持有 `--dsh-content-top-inset`：默认 `0px`，在 `win32` 和 `linux` 下于中心列和右侧面板列取 `--dsh-native-control-row-height`（40px）。

中心列以 `box-sizing: border-box` 把该留白用作 `padding-top`，于是处于文档流中的 Header 和会话下移到该行之下，列本身仍留在自己的 grid 行内。右侧面板列只承载绝对定位的面板，而绝对定位盒会忽略这份 padding，因此面板的 `[data-sidebar-right-panel='push']` 盒把该留白用作自己的 `top`。

两列都用一条高度等于该留白的 `::before` 拖拽条覆盖空出的区域，使该区域保持留空、可拖动窗口，且不从列接收指针事件。空白会话的中心列把该拖拽条再加高一个原生控件行，以继续覆盖其隐藏 Header 所占的那一行。模态对话框打开期间，该拖拽条与页面的其他拖拽区域一同暂停。

[`window-chrome.ts`](../../../../apps/electron/src/renderer/desktop/window-chrome.ts) 适配器把右侧面板列标记为 `data-dsh-electron-rightbar` —— AppFrame 的第三个结构子节点，与侧栏、中心列和会话 Header 的标记一同解析 —— 因此 CSS 通过 Electron 自有的标记定位上游布局。侧栏保留窗口顶边，其品牌行承载折叠控件。全屏右侧面板仍为 `position: fixed; inset: 0` —— 它会像覆盖页面上其他所有拖拽表面一样覆盖该区域 —— 并以 `box-sizing: border-box` 把该行作为自身的 `padding-top` 留出，使其标签条与“退出全屏/折叠”两个控件都避开原生控件。由于它覆盖了本该位于该区域之上的列拖拽条，该区域的拖拽表面由面板自身绘制。`--dsh-panel-top-inset` 即该行高度：Windows 和 Linux 上取 `--dsh-native-control-row-height`，macOS 上取 `--dsh-macos-sidebar-top-inset`（28px）—— 在 macOS 上面板覆盖侧栏，其标签条否则会落在“交通信号灯”之下。

## Alternatives considered

**保留按 Header 计算的标题栏留白。** 右侧面板的标签条并不是会话 Header，仍会落在系统按钮之下，而且顶边上此后出现的每个界面元素都要各自按 overlay 几何预留宽度。

**改为给面板标签条加边距。** 面板 chrome 位于 `packages/**`，由本 fork 从上游同步；桌面布局保留在 `apps/electron`。

**预留一整行空白 Heading。** [Electron 桌面集成记录](../feature/2026-08-15-electron-desktop-integration.zh.md)已否决视觉上独立的 Heading 以及把产品 UI 推离窗口边缘的做法；Windows 留白改为让侧栏的品牌行留在该边缘。

## Consequences

侧栏右侧的各列在 Windows 和 Linux 上少 40 像素高度，并在系统按钮所在的位置得到一条留空的可拖拽区域。侧栏保持完整高度。macOS 的各列不受影响：其留白保持 `0px`，拖拽条收缩为零，push 面板保留其自身样式表声明的 `top`；全屏面板则让出 28 像素的“交通信号灯”行。

面板规则依赖共享的 `data-sidebar-right-panel` 属性，因此丢弃该属性的客户端会让 push 面板重新覆盖该区域，并使全屏面板自有的该区域失去拖拽能力。这是一个已记录的覆盖缺口：适配器测试只观察 Electron 自有的标记，而聚焦的 CSS 检查固定的是样式表文本，而非它所要定位的上游 `data-sidebar-right-panel` 属性。Windows 验收 —— 系统按钮之下没有面板标签、Header 控件或面板 chrome，且该区域可拖动窗口 —— 需要在 Windows 主机上人工检查。
