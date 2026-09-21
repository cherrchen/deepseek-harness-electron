# Agent Note: Electron-managed network settings

Status: proposed

English | [中文](2026-09-20-electron-managed-network-settings.zh.md)

## Problem

Desktop currently inherits separate network behavior from Chromium, Electron Main, the supervised Harness process, package-manager children, and Agent processes. Environment proxy variables cover some Harness HTTP clients, but they do not provide operating-system proxy discovery, PAC or WPAD evaluation, SOCKS5, one strict route across those process boundaries, or a safe place to keep upstream proxy credentials.

Default behavior must remain untouched, while an explicit Direct mode must remove proxy environment variables from Desktop-controlled children. Managed modes must never turn a failed selected proxy into an implicit alternative route or a direct connection.

## Proposal

Electron Main will own one `DesktopNetworkController`. The controller will apply versioned preferences, encrypted secrets, Electron proxy configuration, child environments, relaunch decisions, diagnostics, and failure presentation. Runtime plugins will consume a typed `ctx.desktop.network` capability and will not receive Electron objects, raw IPC, upstream credentials, or environment mutation APIs.

A packaged Rust helper will own the loopback HTTP Gateway, operating-system proxy providers, PAC execution, connectors, authentication adapters, route failure classification, and system-policy watchers. Main will launch the helper from one application-owned resource path and negotiate a versioned JSON Lines protocol over stdio. Managed Harness and Desktop-owned child processes will see only the loopback Gateway URL.

System resolution may return ordered routes for diagnostics, but execution will accept only the first final route. An explicit `DIRECT` result is a valid selected route; connector failure is not permission to inspect the remaining list.

## Foundation

The preferences document uses schema version 1 and retains the update channel, one Manual draft, Agent opt-in, and diagnostic URLs. Writers re-read and merge under the Desktop single-instance writer queue, flush a random exclusive sibling, rename it atomically, and flush the parent directory where the platform supports that operation. Invalid Network data falls back to Default without discarding a valid update channel.

The Main-only secret store encrypts values with Electron `safeStorage`, rejects Linux `basic_text`, stores only a branded reference in preferences, and returns only `hasPassword` to future Renderer consumers. A one-shot override accepts only Default and is removed before use.

Environment policy is a pure mode decision. Default clones the input unchanged; Direct removes every upper- and lowercase proxy variable plus `NODE_USE_ENV_PROXY`; System and Manual route Desktop-owned children through the loopback Gateway; Agent processes retain their existing environment unless the user opts in, except that Direct always removes proxy variables.

The [Rust Network Runtime](../../../../docs/electron/network-runtime.md) binds an ephemeral IPv4 loopback Gateway and supports versioned JSONL negotiation, validated configuration replacement, HTTP/HTTPS/SOCKS5 Manual routing, and bounded shutdown. The Main client launches the prepared or packaged executable without PATH lookup, transfers credentials through stdin, and fails closed on protocol or process failure. Local fixtures exercise the actual DSH HTTP dispatcher through all three Manual protocols. Production network-plane wiring remains outside this foundation.

The macOS feasibility probe successfully called `CFNetworkCopySystemProxySettings` and `CFNetworkCopyProxiesForURL` on an arm64 development host. Windows WinHTTP/SSPI, Linux GNOME/KDE and PAC sandbox behavior, macOS PAC and change notifications, signed-package launch, and installer inclusion remain platform qualification work; capability flags stay false until those paths have executable evidence.

## Alternatives considered

**Use Chromium system proxy configuration as the shared authority.** Chromium may apply proxy-list fallback and cannot govern Node or ordinary child-process transports. It cannot enforce the required first-route failure behavior across Desktop network planes.

**Put platform networking in Electron Main or an N-API addon.** This avoids another process, but platform APIs, PAC execution, tunnels, and authentication would share Electron Main's crash and ABI boundary. A helper isolates native failure and has no Electron or Node ABI coupling.

**Write proxy credentials into environment variables.** This would let Harness, tools, diagnostics, and model-controlled children read the upstream secret. The Gateway keeps credentials in Main/runtime memory and exposes only a credential-free loopback endpoint.

**Reuse the repository atomic-write package.** The Electron TypeScript program has a package-local `rootDir`; resolving workspace source through the repository path map pulls that package outside the compiler program. The Desktop-local writer adds the required file and directory flushes and is limited to the single-instance Desktop persistence boundary.

**Implement HTTP, SOCKS, and TLS from scratch.** Hyper owns HTTP framing and streaming, tokio-socks owns SOCKS5 negotiation, and Rustls with the platform verifier owns TLS and system certificate validation. The Runtime owns route selection and lifecycle; duplicating those protocol libraries would add parser and cryptographic maintenance without changing the routing guarantee.

## Acceptance criteria

M1 is complete when preferences migration, non-overwriting partial updates, validation, secret isolation, environment policy, one-shot override, and controller lifecycle tests pass while Default changes no child environment or Electron proxy state.

The complete feature is accepted only after the Gateway supports Manual HTTP, HTTPS, and SOCKS5; system providers pass native Windows, macOS, GNOME, and KDE tests; PAC and authentication capability matrices have executable evidence; every managed network plane uses the same strict selected route; and the Settings UI exposes no secret.

## Risks

PAC engines and integrated proxy authentication are platform-specific code-execution and credential boundaries. An unavailable implementation must fail closed and report an unsupported capability rather than advertise support or select Direct.

Release qualification needs native runners, signing identities, installers, and real desktop proxy environments. Repository tests can verify paths and artifacts but cannot substitute for those platform observations.
