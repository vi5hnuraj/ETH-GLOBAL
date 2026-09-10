# World AgentKit — Integration Feedback

**Project:** GlobalPay — autonomous AI services marketplace (Arc settlement · The Graph intelligence · World identity)
**Track:** AgentKit Continuity
**Date:** September 10, 2026
**Environment:** World ID Sandbox App (Firebase build, Android), Developer Portal staging app `app_be93…`, RP `rp_16e05c…`, IDKit `@worldcoin/idkit` 4.2.3, `@worldcoin/agentkit` 0.2.1

This document covers the four requested feedback areas. Every item below comes from a real integration session — timestamps and console output where relevant.

---

## 1. AgentKit docs and integration flow

### What worked well

- **The v4 quickstart is honest and complete.** The Hono example (facilitator → resource server → hooks → money parser) maps 1:1 to runnable code. We adapted the hooks pattern to Express with no undocumented API surface needed.
- **`createAgentBookVerifier().lookupHuman(address)` is exactly the right primitive.** One call, canonical World Chain deployment, chain-agnostic caller. Our marketplace enriches every service listing with it to render "✓ Human Verified" badges.
- **The free-trial mode is a genuinely good product idea.** "3 free uses for human-backed agents, then x402" is the cleanest bot-mitigation story we've seen — it makes verification *economically* load-bearing rather than decorative.
- **`--format json` and `--schema` on the CLI** made it scriptable from a Node service (we spawn `agentkit-cli register` and parse stdout).

### Friction

1. **No JS API for AgentBook registration.** `agentkit-cli register` exists, but the SDK exports no `registerAgent()`. Embedding registration inside a product (like ours) means spawning a CLI as a child process and scraping stdout for the `world.org/verify` URL. A documented `registerAgent({ address, onVerifyUrl })` in `@worldcoin/agentkit` would remove the entire child-process/stdio layer.
2. **The verify link has no documented contract.** The CLI prints `HUMAN ACTION REQUIRED: … https://world.org/verify?t=wld&i=<uuid>&k=<key>` — nothing documents what `i`/`k` are, how long the link lives, whether it can be re-generated, or whether deep-link handling differs between the production app and the sandbox build.
3. **Version confusion is real.** IDKit v4 is a full redesign (RP signing keys, actions, nullifiers), but v2/v3 tutorials still dominate search results. `npm i @worldcoin/idkit` resolving to v4 with completely different props than most blog posts show was our first hour of confusion. A banner on the docs home ("v2/v3 content is deprecated, here's the v4 migration map") would help a lot.
4. **Express is second-class in examples.** The docs say "Express and Next.js can use the same hooks" but ship only the Hono wrapper. An Express `agentKitGate()` middleware example — the thing we had to write — would be widely copied.

---

## 2. Developer Portal navigation, search, product discovery, debugging

1. **Actions live in a different section than World ID configuration.** We created the app, configured World ID, pasted the RP signing key — and the widget still failed with `action not found`, because the **Verification** section (where actions are created) looked like a *reporting* screen ("No verifications yet"), not a *configuration* one. The error message never says "create the action in the Portal." That single hint in the widget error would have saved ~30 minutes.
2. **The RP signing key is shown once with rotation as the only recovery.** This is fine security-wise, but the UI gives no strong pre-rotation warning that rotating immediately invalidates the old key for every environment the app serves. We rotated casually during testing and only later realized the implications.
3. **Search did not surface "Actions" for the error we saw.** Searching `action not found` in the Portal returns nothing useful (it's a client-side app search, not a docs/error search). An error-code → remediation page in the docs, linked from the Portal, is the missing piece.
4. **Staging vs production toggles are implicit.** The action creation modal didn't ask for an environment; it inherited from a tab selection that's easy to miss. We only confirmed staging by inspecting the created action afterward.

---

## 3. Sandbox App: states, proof flows, errors, edge cases

### What we exercised

- Firebase-invite install → auto-created World ID on first open (worked, no email — correctly pure crypto identity)
- Developer settings → Local Configuration flags (we needed `enable-v4-protocol` ON — was already ON; `issue-v4-credentials` OFF by default, documented nowhere for the RP flow)
- Verification tool screen — Orb/NFC/Selfie stubs only; **no Device stub exists** (device credential is implicit — reasonable, but undiscoverable; we spent real time looking for it)
- QR approval attempt for an RP action (`publish-service`, Device, staging)

### Friction and edge cases

1. **`generic_error` is a catch-all that covers at least six distinct causes** we personally hit: action not created, environment mismatch, expired RP nonce, WASM initialization failure, sandbox app without an in-app scanner, and deep-link falling through to the production Play Store page. A debug mode that surfaces `request_id` + server reason would cut support load dramatically. (We enabled IDKit debug via `window.IDKIT_DEBUG` — even then the messages were generic.)
2. **The sandbox build has no discoverable QR scanner.** The production World App's home-screen scanner doesn't exist in the sandbox build, and `orb-verification-enable-scanner-tab` (a Local Configuration flag) doesn't add an RP-QR scanner. We asked the user to scan with the native camera; the deep link redirected to the **production app's Play Store page** — a dead end for a sandbox-only device. The simulator link inside IDKit is the workaround, but it's easy to miss.
3. **Vite pre-bundling breaks IDKit's WASM.** `@worldcoin/idkit` loads `idkit_wasm_bg.wasm` via `new URL(..., import.meta.url)`. Vite's dependency pre-bundling moves the module into `node_modules/.vite/deps/`, where the computed URL 404s (server returns HTML), WASM init throws, and IDKit surfaces `generic_error`. Fix: `optimizeDeps.exclude: ['@worldcoin/idkit', '@worldcoin/idkit-core']` — then `qrcode` (a CJS transitive dep) needs explicit pre-bundling back for interop. **Zero documentation mentions this.** Any Vite user hits it. This deserves a "Framework notes" doc section.
4. **Device-credential approval UX in staging is opaque.** With the action created and flags matching, the approval screen still isn't guaranteed to appear — the app-to-app relay through World's servers is a black box with no request-status surface. A "pending requests" list inside the sandbox app (like WhatsApp Web's device list) would make debugging trivial.
5. **Edge case: per-user vs per-agent verification.** World's model is one-human-one-nullifier (correct!), but AgentKit docs don't address the product pattern of *user verifies once, all their agents inherit*. We built it at the profile level with agent-side inheritance; a note in the docs on this pattern (it's the natural shape for agent platforms) would help.

---

## 4. What was confusing, missing, broken, or hard to test

**Confusing:**
- v2/v3 vs v4 docs split (biggest single issue)
- `generic_error` opacity (six causes, one message)
- Actions-under-Verification section placement
- Where the sandbox scanner lives (it doesn't — see above)

**Missing:**
- JS SDK registration API (child-process CLI spawning shouldn't be the documented path for products)
- Verify-link lifetime/semantics documentation
- Express/Next.js middleware examples for the hooks flow
- Vite/WASM packaging note
- A sandbox "pending verification requests" surface

**Broken (for our setup):**
- Sandbox deep link → falls through to production Play Store (can't complete RP QR flow on a sandbox-only device)
- IDKit WASM under Vite pre-bundling (worked around via `optimizeDeps.exclude` + explicit `qrcode` pre-bundle)

**Hard to test:**
- End-to-end RP flow requires: Portal app + RP key + action creation + sandbox app install + flags + scanner-or-simulator. Each step is individually documented; the *composition* isn't. A single "test your first verification" checklist (with the simulator as the default path) would compress a day into an hour.
- AgentBook registration testing requires approving in the World App mid-CLI-run — hard in CI. The `--manual` mode (prints call data instead of submitting) helps, but a dry-run/staging relay endpoint would make automated tests possible.

---

## What we built anyway (proof the primitives are good)

Despite the friction, the integration is real and load-bearing:

- **IDKit v4 flow**: RP signature server-side → popup → proof → `developer.world.org/api/v4/verify` → nullifier stored UNIQUE → account-level `world_verified`, all agents inherit
- **AgentBook resolution**: every marketplace service enriched via `lookupHuman()` → "Human Verified" badges from the canonical World Chain registry
- **AgentBook registration**: official `agentkit-cli register` spawned from a backend service, verify-URL surfaced as QR, completion confirmed independently on-chain, persisted (`human_backed`, `agent_book_id`, `agentbook_tx_hash`)
- **AgentKit gate on x402 routes**: `X-AGENT-WALLET` → AgentBook lookup → human-backed agents get 3 free-trial uses (durable `agentkit_usage` table), unregistered bots pay via x402 — the exact free-trial pattern from the docs, in Express

## Top 5 asks

1. Fix the sandbox deep-link fallthrough to the production Play Store page
2. Surface real error codes/reasons in IDKit instead of `generic_error`
3. Ship `registerAgent()` in the JS SDK
4. Document the Vite/WASM `optimizeDeps.exclude` requirement
5. Add the "user verifies once, agents inherit" pattern to the AgentKit docs
