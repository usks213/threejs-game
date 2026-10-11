# Bounded persistence-failure diagnostics

On 2026-10-06, exact preview 647e6376 published successfully and passed type/unit and standalone browser checks. Two separate fresh-room probes failed before their first welcome with the existing generic uncertain-save notice. No load duration completed; this is a blocking public cooperative failure, not performance acceptance.

The save exception was discarded, so the observed notice cannot establish a quota, provider outage, encoding defect or other specific cause. A bounded local check passed 124 checkpoint encodings across ticks 0–30, staging first hello at ticks 0,1,3 and 15. Four in-memory writeRoom/readRoom round-trips succeeded before welcome. Maximum checkpoint was approximately 1.04 MB / 33 segments; this does not reproduce real Cloudflare storage behavior.

## Diagnostic only, no unsafe recovery

The existing failure notice now appends an allowlisted phase/category code. It never appends exception text, stack, room/player identifiers, keys, tokens or checkpoint contents. Unknown exceptions remain unknown. The Worker retains the original exception privately as cause; it is not serialized to clients or logged by this change.

Phases distinguish checkpoint construction, checkpoint/access encoding, transaction entry/read/segment write/pointer write/stale cleanup/commit, final revision recording, and queue admission. The commit phase is set after the transaction callback's awaited work and before its return; a rejection of the outer transaction promise remains a commit-stage failure. Callback retries restart inner phase tracking. Each physical write owns its own phase variable.

Categories recognize only explicit SQLite codes, the exact QuotaExceededError name, the application's exact queue-full error, the documented overloaded flag, and the documented storage-timeout prefix. Generic words such as quota/limit/size do not create a classification. A code reports an observed signature, not an account-specific diagnosis or billing recommendation. See [Cloudflare storage-limit errors](https://developers.cloudflare.com/durable-objects/platform/limits/) and [documented overload/timeout behavior](https://developers.cloudflare.com/durable-objects/observability/troubleshooting/).

Persist-before-welcome/ACK, transaction atomicity, save generations, failure shutdown and close 1011 remain unchanged. No save is deleted, no fallback state is invented, and no request is admitted after an uncertain write. No endpoint, credentials, permission, paid service or dashboard access is added.

## Checks

Tests cover every write phase and original writeRoom exception identity; transaction rejection before callback and after callback; formatter getters and invalid enums; private-error redaction; initial welcome/late-ACK suppression; and Worker-wrapper checkpoint/commit/revision failures. Existing rollback and lifecycle tests remain. Exact-SHA CI/public diagnostics are needed to identify the deployed failure; local success is not proof of service recovery.
