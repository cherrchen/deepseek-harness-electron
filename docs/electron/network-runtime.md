# Desktop Network Runtime

English | [中文](network-runtime.zh.md)

## Summary

Desktop Network Runtime routes HTTP and CONNECT traffic through one Manual proxy or the first final route selected by System policy. Failures never authorize a second proxy or Direct. Desktop activates it before Harness startup for Manual and System modes; Default leaves the existing network behavior untouched.

## Contents

- [Verification](#verification)
- [Control and routing](#control-and-routing)
- [System policy](#system-policy)
- [Credentials and TLS](#credentials-and-tls)
- [Lifecycle and limits](#lifecycle-and-limits)
- [Desktop integration](#desktop-integration)
- [Limitations](#limitations)

<a id="verification"></a>

## Verification

With the repository Node.js, pnpm, and Rust toolchains installed, run from the repository root:

```sh
pnpm --filter @dsh-electron/dsh-electron test:network-runtime
```

This command runs Rust component and executable tests, prepares the release binary, and tests the Main client against that binary. The DSH transport fixture uses the actual source HTTP proxy library and a non-resolving target name, with local HTTP, TLS, and SOCKS5 fixtures. It requires installed workspace dependencies and does not call a model or a public test endpoint. TLS fixtures use a private test trust root without changing the operating system trust store. Desktop CI runs native macOS, Windows, and Linux tests. GNOME builds need GLib development libraries and desktop schemas. Installer inclusion, enterprise WPAD environments, and signed macOS package launch remain release qualification work.

<a id="control-and-routing"></a>

## Control and routing

[NetworkRuntimeClient](../../apps/electron/src/network/runtime-client.ts) launches the fixed application-owned executable with private stdio, negotiates protocol version 2, correlates request IDs, and terminates the process on transport or protocol failure. It drains native stderr without publishing its contents. The runtime writes only JSONL frames to stdout and fixed sanitized diagnostics to stderr.

The supported commands are `hello`, `configure`, `get_system_snapshot`, `reload_system`, `get_diagnostics`, `submit_credential`, `clear_credential`, and `shutdown`. `configure` accepts `{ config, limits?, system? }`, using the [RuntimeNetworkConfig](../../apps/electron/src/network/domain.ts) union. Direct explicitly permits direct routing. System advertises the compiled native backend; unsupported desktops reject configuration. Unsupported commands and invalid payloads return an error response; malformed envelopes emit `runtime_warning`. Neither changes the active configuration.

The Gateway listens only on `127.0.0.1` at an OS-assigned ephemeral port. It closes incoming connections until configuration succeeds. Manual HTTP and HTTPS use absolute-form HTTP requests or CONNECT tunnels; HTTPS encrypts the connection to the proxy. SOCKS5 uses no-auth negotiation and sends domain targets to the proxy without resolving them locally. Incoming proxy credentials and hop-by-hop headers are removed before forwarding; only the active Manual credential can authenticate the upstream proxy.

A failed proxy produces a sanitized `proxy_failure` event and an HTTP 502 response. HTTP 407 distinguishes `PROXY_AUTH_REQUIRED` from `PROXY_AUTH_REJECTED` and emits the corresponding credential event. A rejected target CONNECT is a target failure, not a proxy incident. Ordinary origin HTTP status codes pass through unchanged. Events contain route metadata, never the requested URL, username, password, or authentication header.

<a id="system-policy"></a>

## System policy

The provider exposes snapshot, destination resolution, reload, and watch operations. Windows reads current-user WinHTTP settings and evaluates PAC/WPAD through WinHTTP. macOS reads CFNetwork dictionaries and evaluates PAC with CFNetwork. Linux reads GNOME GSettings or KDE5/6 kioslaverc through `proxy-watch`; environment and portal fallbacks are rejected. Unreadable stores, unsupported desktops, malformed routes, and PAC failures produce explicit errors.

Only the first final route reaches the connector. The remaining ordered entries appear in `alternativeRoutes` for diagnostics. Explicit bypass and `DIRECT` permit direct routing; an unavailable proxy never does. CFNetwork's HTTPS destination proxy uses HTTP CONNECT. macOS rejects the unsupported PAC `HTTPS` transport directive instead of letting the native parser discard it. System accepts only user-supplied Basic credentials for the challenged HTTP or HTTPS proxy endpoint. Digest, NTLM, Negotiate, and silent operating-system credential reuse are unsupported.

Each resolution runs in a private, deadline-limited child of the fixed Runtime executable. Linux PAC runs in QuickJS with standard PAC helpers, DNS, and local-address lookup; it has no filesystem, environment, or module-loader API. PAC downloads use verified HTTP/HTTPS, no ambient proxy, no redirects, and a body limit. QuickJS also limits heap and execution time. Native PAC engines use their operating-system isolation and the worker deadline; `pacMemoryBytes` applies only to QuickJS.

Snapshots expose SHA-256 policy, network, and selected-route fingerprints, never raw settings, PAC source, PAC URLs, or target URLs. Native settings notifications trigger reads; bounded polling also detects interface changes, macOS network state, and Linux resolver/route changes. A changed fingerprint cancels old connections and emits `system_policy_changed` or `network_changed`. `get_system_snapshot` only reads; `reload_system` reads and invalidates connections. Neither operation tests connectivity or selects an alternative route.

`system` supplies all four fields together; omission uses these defaults. Main's request deadline must exceed `resolveTimeoutMs`.

| Field | Default | Accepted range |
| --- | --- | --- |
| `resolveTimeoutMs` | 10000 | 100–30000 |
| `pollIntervalMs` | 5000 | 200–300000 |
| `pacMaxBytes` | 1048576 | 1024–4194304 |
| `pacMemoryBytes` | 67108864 | 1048576–268435456 |

<a id="credentials-and-tls"></a>

## Credentials and TLS

Main supplies the optional Manual credential in the `configure` stdin payload. The client never places it in argv or environment variables. The runtime retains credentials only in memory and zeroizes its owned credential strings and authorization buffers when dropped. Replacing a configuration cancels its connections and releases its credential generation; shutdown releases the active configuration. JavaScript strings and HTTP-library buffer copies do not provide a guarantee of forensic memory erasure.

A real HTTP 407 opens a Main-owned, sandboxed credential prompt. Manual credentials can be used for the current Runtime generation or saved through Electron secure storage; System Basic credentials remain in Runtime memory and apply only to the matching selected endpoint. Unsupported authentication schemes fail explicitly. A rejected saved Manual credential opens a replacement prompt. Secrets travel through private IPC and Runtime stdin, not incident events or diagnostics.

Rustls uses the operating system certificate verifier through `rustls-platform-verifier`. Certificate validation remains enabled, including hostname validation. Invalid certificates report `PROXY_CERT_INVALID`; other TLS handshake failures report `PROXY_TLS_FAILED`. There is no product input for extra CA certificates, disabled verification, or client certificates.

<a id="lifecycle-and-limits"></a>

## Lifecycle and limits

Configuration validation completes before replacement; a rejected configuration preserves the active route. Replacement cancels existing HTTP connections and tunnels. Shutdown stops accepting connections, lets active work drain for the configured interval, cancels remaining work, and acknowledges only after tracked tasks finish. Stdin EOF also shuts down the Gateway. A crash removes the Gateway endpoint; the client reports failure and does not restart or select another route automatically.

`limits` supplies all four fields together; omission uses these defaults. Invalid limits reject configuration.

| Field | Default | Accepted range |
| --- | --- | --- |
| `connectTimeoutMs` | 30000 | 1–300000 |
| `headerTimeoutMs` | 30000 | 1–300000 |
| `shutdownTimeoutMs` | 5000 | 1–300000 |
| `maxConnections` | 256 | 1–4096 |

TCP/DNS establishment and proxy handshakes each have the connection deadline. Incoming headers and upstream response headers have the header deadline. Established tunnels and response bodies remain streaming until completion, configuration cancellation, or shutdown. Admission is limited per configuration generation, including upgraded tunnels. Control frames are capped at 1 MiB and HTTP headers at 64 KiB. Diagnostic events use a bounded queue; saturation drops events rather than accumulating memory or blocking traffic. Main request and shutdown deadlines are constructor options and must exceed the configured drain deadline.

<a id="desktop-integration"></a>

## Desktop integration

Electron Main starts and configures the Runtime before starting Harness in Manual and System modes. Harness and Desktop-owned plugin commands receive only the loopback Gateway URL in their proxy environment; Direct removes active proxy values, and Default preserves its existing launch environment. The Direct Host launch uses empty proxy entries to mask lower-priority `$DSH_HOME/.env` values; Agent children receive tombstones that remove those entries. Electron's app network service and default Session use the main Gateway; the updater Session uses a separate loopback Gateway with the same selected route and no global failure events. The updater's release discovery uses its Session, as do its metadata and downloads. Managed startup stops with an error if the Runtime cannot supply a Gateway. A later Runtime exit leaves the configured Gateway endpoint in place, so requests fail rather than changing route.

The Desktop Host mounts a subprocess provider that derives Agent child environments from a separate Main-provided proxy policy. Direct clears proxy variables even when a caller supplies explicit values. Manual and System preserve the original Agent proxy environment while the Agent toggle is off and replace it with the Gateway when enabled. This covers children created through `ctx.subprocess`, including persistent terminal sessions; it does not enforce routing for raw sockets or processes that ignore proxy environment variables. System policy and network change events close pooled Electron connections so the next request uses the current Runtime policy. Main tracks startup, fingerprint changes, user reload, and Manual credential application as network epochs. It deduplicates proxy incidents by epoch, route, error code, and retry generation; successful traffic or a new epoch resolves the current incident. A native dialog offers Retry, one-shot Default, Network Settings, and dismissal; permanent Default requires a second confirmation. Retry waits for a new request, except that a crashed Runtime relaunches Desktop. The one-shot Default marker is consumed before the next startup and does not alter saved settings.

<a id="limitations"></a>

## Limitations

The [Network Settings page](network-settings.md) exposes user diagnostics through the updater Session and its incident-free Gateway. Gateway-generated HTTP errors carry a symbolic `x-dsh-network-error` header so connection tests distinguish proxy failure from an origin HTTP response; the Gateway removes that header from upstream responses. The native dialog's Open Network Settings action raises the main window and selects the Network section without changing policy. SOCKS5 authentication, arbitrary HTTP Upgrade, UDP, custom proxy CA configuration, client certificates, Manual bypass, and integrated proxy authentication are unsupported.

The [network settings proposal](../../.agents/notes/proposed/feature/2026-09-20-electron-managed-network-settings.md) owns the overall architecture and remaining integration work.
