# Dependency security check — 2026-10-25

Read-only `npm audit --json` initially reported seven affected dependency nodes (four moderate, three high). Targeted compatible updates reduced this to **zero**. No `npm audit fix --force` or unrelated major upgrade was used.

| Chain | Origin in this PR | Relevance | Remediation |
|---|---|---|---|
| `ws` | New Node multiplayer dependency | Tiny-fragment memory exhaustion can exceed message-size defenses; uninitialized-memory disclosure also affected the old version. | Pin 8.18.3 → 8.21.0, the minimum fixed 8.x release. [Advisory](https://github.com/advisories/GHSA-96hv-2xvq-fx4p) |
| `wrangler → miniflare → undici` | New development/deployment tooling | A malicious HTTP response can crash the Node tooling process; this package is not shipped in the Worker game bundle. | Keep Wrangler 4.152.0; scope an override only to Miniflare's Undici, 7.29.1 → 7.30.1. [Advisory](https://github.com/advisories/GHSA-xjj6-f33q-929c) |
| `vite` | Pre-existing | Development-server file access/editor-command issues; not production static runtime code. | Compatible patch 7.3.6 → 7.3.7. |
| `vitest → @vitest/mocker` | Pre-existing | Test/development mocking endpoints; not production game runtime. | Compatible patch 4.1.11 → 4.1.12. |

Wrangler's latest verified release still pins Miniflare `5.20261019.2-beta`, which pins vulnerable Undici `7.29.1`. The audit's suggested downgrade to Wrangler `4.35.0` is not used. The narrow `overrides.miniflare.undici` entry keeps the same Undici major and supported Node engine. Remove the override once the upstream Miniflare pin includes a fixed version; rerun audit and the actual workerd CI smoke before doing so.

Verification after patching: typecheck, all 53 unit/integration tests, production build and Wrangler bundle dry-run passed. Actual workerd behavior is gated by the CI smoke because local workerd startup is restricted in this sandbox. No finding was attributed to tsx or Playwright by this audit. A zero audit result means no vulnerabilities known to this audit database at check time, not a security guarantee.
