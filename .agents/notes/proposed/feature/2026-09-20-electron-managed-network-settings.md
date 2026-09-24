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

The Main-only secret store encrypts values with Electron `safeStorage`, rejects Linux `basic_text`, stores only a branded reference in preferences, and returns only `hasPassword` to Renderer consumers. A one-shot override accepts only Default and is removed before use.

Environment policy is a pure mode decision. Default clones the input unchanged; Direct removes every upper- and lowercase proxy variable plus `NODE_USE_ENV_PROXY`; System and Manual route Desktop-owned children through the loopback Gateway; Agent processes retain their existing environment unless the user opts in, except that Direct always removes proxy variables. The Desktop Host replaces the upstream local subprocess provider with a subclass that applies Main's separate Agent policy to executable lookup, ordinary spawns, and PTY spawns. The opt-out policy combines Main's original inherited proxy values with the CLI's accepted `.env` layers because the Host inherits Gateway values before the CLI reads those files. This keeps the upstream provider's containment and teardown behavior while accounting for the Host's Gateway environment.

The [Rust Network Runtime](../../../../docs/electron/network-runtime.md) binds an ephemeral IPv4 loopback Gateway and supports versioned JSONL negotiation, validated configuration replacement, HTTP/HTTPS/SOCKS5 Manual routing, and bounded shutdown. The Main client launches the prepared or packaged executable without PATH lookup, transfers credentials through stdin, and fails closed on protocol or process failure. Local fixtures exercise the actual DSH HTTP dispatcher through all three Manual protocols. Electron Main configures the Runtime before Harness, applies the Gateway to Electron's app and Sessions, and gives Harness and plugin commands credential-free Gateway environments. Release discovery uses the updater Session alongside metadata and downloads.

Main owns epoch and incident lifetimes rather than asking the Gateway to keep UI state. Fingerprints rotate System epochs; Manual credential application and user reload create explicit epochs. Real traffic failures are deduplicated by epoch, route, error class, and retry generation. The native dialog leaves the selected route in place unless the user chooses one-shot or confirmed permanent Default; a crashed Runtime restarts Desktop only after Retry. A separate loopback listener gives updater traffic the same route without posting global incidents. Manual Basic credentials may be saved in encrypted Desktop storage; System Basic credentials remain scoped to one Runtime generation and selected endpoint. Unsupported schemes fail explicitly.

System providers use current-user WinHTTP, CFNetwork, and GNOME/KDE settings. Every resolution runs in a bounded helper process, and Linux PAC uses a memory-limited QuickJS context without filesystem or environment APIs. Native settings notifications and network fingerprints invalidate existing connections. Native macOS tests cover ordered PAC output, malformed first entries, repeatable snapshots, and reload; Desktop CI owns Windows WinHTTP and isolated GNOME/KDE store execution. The Windows installer smoke requires the packaged runtime executable. Signed macOS launch, enterprise WPAD laboratories, and integrated authentication remain operator checks.

The Network page is a required Desktop client plugin in the shared Settings section. Its controls come from `@deepseek-ai/dsh-client-ui-primitives`. It uses a closed `ctx.desktop.network` capability, which Main connects to trusted IPC handlers and a typed preload bridge. Main repeats configuration validation and returns only sanitized state. Connection tests use the updater Session's incident-free Gateway, keep Save independent from test outcomes, and treat origin HTTP responses as reachable while identifying Gateway errors separately. The Client renders the stored password as a fixed placeholder, sends only a replacement or removal action, and asks before discarding a new password when secure storage is unavailable. The page lists registered LLM providers and requires an explicit health URL; it never sends a model request. A dialog navigation request passes through sanitized Network state and activates the existing Settings controls, keeping the downstream shortcut out of upstream packages.

## Alternatives considered

**Use Chromium system proxy configuration as the shared authority.** Chromium may apply proxy-list fallback and cannot govern Node or ordinary child-process transports. It cannot enforce the required first-route failure behavior across Desktop network planes.

**Put platform networking in Electron Main or an N-API addon.** This avoids another process, but platform APIs, PAC execution, tunnels, and authentication would share Electron Main's crash and ABI boundary. A helper isolates native failure and has no Electron or Node ABI coupling.

**Write proxy credentials into environment variables.** This would let Harness, tools, diagnostics, and model-controlled children read the upstream secret. The Gateway keeps credentials in Main/runtime memory and exposes only a credential-free loopback endpoint.

**Reuse the repository atomic-write package.** The Electron TypeScript program has a package-local `rootDir`; resolving workspace source through the repository path map pulls that package outside the compiler program. The Desktop-local writer adds the required file and directory flushes and is limited to the single-instance Desktop persistence boundary.

**Implement HTTP, SOCKS, and TLS from scratch.** Hyper owns HTTP framing and streaming, tokio-socks owns SOCKS5 negotiation, and Rustls with the platform verifier owns TLS and system certificate validation. The Runtime owns route selection and lifecycle; duplicating those protocol libraries would add parser and cryptographic maintenance without changing the routing guarantee.

**Delegate all automatic routing to a general proxy resolver.** Resolvers that skip malformed PAC entries, fall back from failed automatic discovery to static settings, or try later proxies violate the first-route rule. Platform APIs supply policy; strict result validation and the single-route connector remain Runtime-owned. A process deadline bounds native PAC and blocking DNS without delaying the Gateway control loop. CFNetwork HTTPS dictionaries identify the destination scheme, so they map to HTTP CONNECT rather than TLS to the proxy.

## Acceptance criteria

M1 is complete when preferences migration, non-overwriting partial updates, validation, secret isolation, environment policy, one-shot override, and controller lifecycle tests pass while Default changes no child environment or Electron proxy state.

The complete feature is accepted only after the Gateway supports Manual HTTP, HTTPS, and SOCKS5; system providers pass native Windows, macOS, GNOME, and KDE tests; PAC and authentication capability matrices have executable evidence; every managed network plane uses the same strict selected route; the Settings UI exposes no secret; and the release checks cover loopback binding, mixed-port HTTP proxies, and the packaged Windows runtime path.

## Risks

PAC engines and integrated proxy authentication are platform-specific code-execution and credential boundaries. An unavailable implementation must fail closed and report an unsupported capability rather than advertise support or select Direct.

Desktop CI runs the Network Runtime on macOS, Windows, and Linux. Repository tests verify the loopback Gateway, mixed-port HTTP behavior, and the packaged runtime path. They do not substitute for signed macOS launch, an enterprise WPAD laboratory, or integrated authentication.
