# S05: Explicit save-history capacity management

## Implemented scope

Settings → saved journeys now shows the number of indexed histories (maximum 32), the sum of their UTF-8 sizes, and each snapshot's save/archive timestamps and destination. The sum is not advertised as browser free space.

A user can select one unprotected history with **書き出して履歴整理を確認**. The normal campaign-file validator checks the selected JSON, a download of the exact original envelope is started, and a separate confirmation identifies the snapshot and generated filename. The user must check **書き出したJSONファイルを端末で確認しました** before **選んだ履歴を完全に削除** is enabled. A download event does not prove that a file was saved; the wording makes that limitation explicit. Successful deletion frees that history slot and its stored record. It does not delete the current world.

Protected identities:

- Exact current primary and rotating-backup bytes
- The history with the greatest save timestamp (last indexed entry breaks equal-time ties)
- All other, unselected histories
- Legacy/western migration originals, migration archives, format selectors and corrupt-recovery records, whose keys are outside this operation's namespace
- Every solo save during invitation preview and guest participation; management also requires leaving a host room

Import/restore histories may be selected explicitly. They are not automatically pruned or blanket-pinned, which would eventually make the 32-slot cap impossible to recover from.

## Transaction and interruption behavior

Preparation is read-only. A frozen, store-bound, single-use proof records the selected immutable bytes and exact current index/primary/backup. Cancel, tab changes, closing/reopening the panel, navigation (including a cached page), starting an import/export or changing cooperation mode invalidates the pending choice. Changed storage requires a new export and confirmation.

Before changing the index, commit writes and reads back a checksummed, scope-bound metadata journal containing the exact previous index and selected ID. It is bounded to 131,072 UTF-16 code units and contains no duplicate world payload. The previous index itself retains its existing 32,768-character bound.

The index is shortened and verified before the sole destructive step removes the selected record. Current/backup/index/record identities are rechecked immediately before that step. Every write/removal is verified. Failure before record removal attempts to restore the exact original index. A failed rollback retains both the record and recovery metadata.

After browser interruption, reads do not finish a deletion. The UI shows **中断した整理を確認・復旧**, and new history cleanup or history-based world switching is blocked. Explicit recovery restores the old index if the selected record still exists, or clears only the transaction receipt if deletion had already completed. It never deletes another history. If the selected record was already removed, its exported JSON is needed for restoration. Corrupt or conflicting recovery metadata stops the operation without guessing or overwriting another index.

Limitations:

- This is explicit permanent deletion after export, not a recycle bin or cloud backup.
- A completely quota-exhausted browser may reject even the small recovery journal. In that case cleanup fails without deleting anything; it does not falsely promise that enough space can always be freed.
- A checksum detects accidental corruption, not malicious alteration. Cross-tab comparisons detect observed changes but localStorage does not provide a multi-key transaction/lock.
- Old, incompatible or corrupt primary/history data must use the existing recovery path. Cleanup cannot discard unreadable saves.
- File export/validation of older large worlds can still block the main thread briefly.

## Verification

- New rule tests: `tests/unit/checkpoint-cleanup.test.ts` (28 cases)
- New confirmation-view tests: `tests/unit/archive-cleanup-view.test.ts` (7 cases)
- Existing history tests: `tests/unit/checkpoint-archives.test.ts` (31 cases)
- Focused save/import/startup/store-selection run: 117 passed across 6 files
- Final local aggregate: 1,033 tests passed across 122 files (381.02 seconds); strict TypeScript and production build passed. Build retains the existing >500 kB chunk-size warning. No lint script is configured.
- Covers cap recovery, exact exported bytes, selection-only removal, protected identities, corrupt records/index/primary, stale/cancelled/forged/cross-store proofs, repeat requests, journal/index/remove failures, dropped writes, rollback failure, interruption after journal/index/record changes, final receipt failure, namespace isolation and conflicting recovery state
- `tests/e2e/campaign-save-history-cleanup.spec.ts`: production-menu archives, exact download comparison, cancel/tab/close/reopen, mandatory acknowledgement, 48px controls, injected journal quota failure, retry, deletion and reload
- `tests/e2e/campaign-invitation-privacy.spec.ts`: existing solo-save isolation route additionally verifies that cleanup, deletion confirmation and journal-recovery controls are unavailable during invitation preview
- Playwright discovery: 4 desktop/Android cases across those 2 files. Existing `campaign-save-history` and invitation CI filters include them.

Local browser execution was deliberately not retried because Chromium is known to fail with a socket EPERM restriction in this executor. Discovery is not a browser pass. PC/Android Chromium CI acceptance, physical mobile/Safari behavior and actual download retention remain unverified for this change. No real user's storage was used by development tests.
