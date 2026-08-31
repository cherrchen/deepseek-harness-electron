# Agent Note: Electron follows the alpha.2 client and Host authentication APIs

Status: implemented

English | [中文](2026-08-31-electron-alpha2-client-host-authentication.zh.md)

## Problem

The desktop composition loaded client extensions through the removed `dsh-client-runtime` package and treated the Web readiness line as an unauthenticated origin. The current Web Host emits a launch-token URL, requires an authority-bound cookie for HTTP and WebSocket traffic, and exposes client services through Cordis context plus their owning packages. Keeping the old assumptions lets the initial process start but leaves the Electron renderer unauthenticated and makes runtime-plugin tests resolve obsolete published packages.

## Decision

Electron client extensions use Cordis `Context` directly. Store helpers come from `dsh-client-store`, slot registration comes from `dsh-client-ui-renderer`, and session list types come from `dsh-api-session-controller`. Downstream package peer declarations name the owning client packages, while development dependencies use `workspace:` so repository tests exercise the synchronized source.

The Electron supervisor preserves the complete loopback readiness URL. `HarnessProxy` exchanges its launch token exactly once, stores only the returned cookie pair, and attaches that cookie to every proxied HTTP request and the `/api/remote.mux` WebSocket handshake. The preload-owned `MessagePort` carries text frames in both directions so the remote mux can send client requests and receive Host responses. The renderer receives neither the launch token nor the cookie. Bootstrap extraction decodes the Host's HTML attribute entities before loading combo-script URLs.

The legacy fixture dependency may retain its published install script in the lockfile, but the root install denies that script because the fixture does not execute it. The current workspace `dsh-subprocess-local` postinstall remains explicitly allowed.

## Verification

The Electron suite covers token parsing, token-to-cookie exchange, authenticated HTTP requests, authenticated WebSocket creation, and runtime plugin hot reload. The Git plugin suite resolves the workspace client bundles. Full builds and real `pnpm dsh web` and Electron launches exercise the assembled applications.

## Alternatives considered

**Retain compatibility shims for removed packages.** This preserves obsolete ownership and makes downstream plugins depend on APIs that the synchronized source does not provide.

**Pass the launch token through every proxied URL.** The Host accepts the token only for the root exchange, and exposing it to the renderer expands access to process credentials unnecessarily.

**Use the browser session as the Host cookie jar.** Electron terminates the custom scheme in Main, so Host HTTP and WebSocket connections originate in Main and require one Main-owned credential path.

## Consequences

Desktop plugins follow the same client service ownership as the Web application, and Main remains the only process that can reach the authenticated Host origin. WebSocket transport has one direct `ws` dependency so Main can supply the cookie header. A Host authentication change must update the readiness parser, HTTP proxy, WebSocket factory, and their tests together.
