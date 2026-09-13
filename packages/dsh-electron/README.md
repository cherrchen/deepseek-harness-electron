---
description: "The public downstream DSH ecosystem plugin group for portable Host and Client features mirrored into DeepSeek Harness Desktop."
kind: "package-group"
---

# Public DSH ecosystem plugins

English | [中文](README.zh.md)

<a id="summary"></a>
## Summary

Install portable or Desktop-aware product features from this group as standard DSH plugins. Each package is a Git subtree of its canonical npm repository; this tree only validates that plugin against the synchronized Harness.

`@dsh-electron/dsh-plugin-*` names are not an Electron requirement. Portable work uses upstream DSH services; optional native extras use a child `ctx.inject(['desktop'], ...)` fiber.

Keep Desktop-required adapters and always-mounted UI such as Details Host and Theme Studio under `apps/electron/runtime/plugins/`. Do not add Electron imports, preload globals, or a second Desktop-specific variant. Split emergency mirror fixes to the canonical repository; stop upstream sync if upstream claims `packages/dsh-electron`.

<a id="table-of-contents"></a>
## Table of Contents

- [Summary](#summary)
- [Dev Note](#dev-note)

<a id="dev-note"></a>
## Dev Note

None.
