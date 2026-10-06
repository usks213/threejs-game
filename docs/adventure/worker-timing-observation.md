# Optional Worker scheduler timing observations

The existing authenticated `ping` / `pong` path can now include a version-1
`timing` object on Worker pongs. Protocol 7, cadence, input/authentication,
backlog limits, gameplay state, persistence, and other packet serialization are
unchanged. Old clients ignore the additional property; old/local servers may
omit it. The load probe reports omitted telemetry as unavailable.

The constant-size payload contains only:

- `clock: "worker-io"`, scheduler `run`, `startedIoMs`, and pong `nowIoMs`.
- `lastStepIoMs`: the observed I/O clock directly after a successful return from
  `room.step()`, or null before the first return. This is not an actual CPU
  completion timestamp, and a room-step return need not advance the simulation.
- Optional version-1 `events` entry-clock observations, described below.
- Current simulation `tick`, scheduler `active`, and its existing six counters:
  `steps`, `turns`, `catchUpSteps`, `rebases`, `droppedMs`, `maxDebtMs`.

Cloudflare's deployed Worker clocks advance with I/O, and can remain frozen
through synchronous work, as documented by [Cloudflare](https://developers.cloudflare.com/workers/runtime-apis/performance/). None of these fields measures CPU duration. In
particular, `steps` counts returned scheduler callbacks; pending access or other
room early returns can leave tick unchanged. A caught room-step failure can also
be followed by the scheduler counting its enclosing callback. The diagnostic
records tick and callback deltas separately.

`probe-public-coop-load.ts` retains only the first/last eligible measured pong
samples per client, their client receive timestamps, counts, and maximum observed
last-step age. It validates/copies known finite scalar fields. It refuses to
calculate an interval across counter/clock regression, a scheduler restart, or
malformed telemetry. A stopped/discarded timer produces no diagnostic rather
than fabricated zero counters.

Interpretation:

- `delta.rebases` and `delta.droppedMs` show actual scheduler rebasing within the
  sampled interval. They do not establish why the backlog accumulated.
- `delta.steps` and `delta.ticks` distinguish callback service from simulation
  advancement.
- `elapsedIoMs` and `elapsedClientMs` cover those same two pong endpoints, not
  the entire load interval. Their difference also includes changing network
  delay and must not be treated as proof of clock drift or CPU throttling.
- `maxDebtIoMs` is the scheduler-run cumulative high-water mark. The difference
  between endpoint maxima is not an interval maximum.
- These samples contain no Worker memory measurement. Collection success does
  not change the 30 Hz performance acceptance result.

Focused validation covers optional-pong compatibility, scalar bounds and copy
ownership, frozen clocks, unchanged scheduler cadence/debt/stop behavior,
endpoint deltas, malformed/missing data, and counter/run regressions. Actual
public observations require publication and a new bounded probe of that exact
commit.

ローカルworkerdでも4本の本物のWebSocketを5秒接続し、全員が2つずつの有効なtiming sampleを受信した。未知/破損/不連続sampleは0。これは実adapterとprobeの接続確認で、公開時計の挙動や処理能力の証明ではない。

## Public 707a0c46 observation and the native-wait candidate

The verified 60.052-second four-socket run completed without connection failures,
but the minimum client-observed tick rate was 22.780 Hz. It did not pass the 30 Hz
acceptance target. The unchanged receipt is
`docs/benchmarks/public-worker-load-707a0c46.json`.

For client 1, the measured pong endpoints span 56,956.524 ms on the client and
43,400 ms on the Worker I/O clock. The interval contains 1,302 returned callbacks
and 1,302 simulation ticks. Rebase/drop counters are zero and the run-cumulative
maximum I/O-clock debt is 0.784 ms. These are actual values for that clock;
wall-clock debt and CPU time remain unavailable, not zero. The gap cannot be
attributed wholly to CPU execution from this telemetry alone. `catchUpSteps=0`
is also expected with the Worker's one-step callback cap.

The proposed Worker-only native `scheduler.wait` adapter leaves this schema and
all counters unchanged. Its native-promise reentry may avoid observing time from
inside a still-clamped timer callback; pending-timeout removal ordering is an
unverified production hypothesis, detailed in `worker-clock-regression.md`.
Neither the model test nor local workerd establishes deployed cadence. A new
probe against the exact published commit must validate the effect; the earlier
707a0c46 result remains a performance failure.

The subsequent native-wait build `2a1debf1` was measured twice. Concurrent browser
QA produced a minimum 14.896 Hz; a same-build load-only repeat after those rooms
closed produced 24.282 Hz. Both four-client runs completed without connection
errors, and neither met 30 Hz. Their unchanged receipts are
`public-worker-load-2a1debf1-concurrent.json` and
`public-worker-load-2a1debf1-isolated.json` under `docs/benchmarks`.

The isolated client's first/last pong interval contains 1,386 callbacks/ticks,
10 rebases and 9,977.106 ms of recorded discard, over 56.182 Worker-clock seconds
versus 56.947 client seconds. A residual clock/network interval difference still
exists; this is not a CPU measurement. The large difference between the two runs
prevents attributing the concurrent slowdown solely to scheduler reentry. The
upstream ordering is now traced to fixed commits in `worker-clock-regression.md`;
deployed cadence remains an empirical acceptance gate.

## Bounded entry-clock observations

Optional `events` version 1 preserves compatibility with existing pongs. It counts
step-callback entries and WebSocket-message entries, attributes each observed
positive clock advance to the kind of entry that first saw it, counts advances
strictly above 250 ms and regressions, and keeps the maximum advance and last
jump. A jump contains only previous/current entry kinds, before/after I/O-clock
values, their difference, and simulation tick. It contains no message content,
identity, room capability or client-provided timestamp.

These advances are between consecutive observations of either kind, not CPU
measurements or per-step durations. Message observations include rejected traffic;
that does not authorize a scheduler wake. The probe keeps at most eight distinct
sampled last-jumps with the run and client receipt timestamp. Sampling can miss
intervening jumps; it is not an event trace. Missing telemetry stays optional,
malformed fields are rejected, and new clock-regression evidence invalidates the
sample interval even if the final clock later catches up.

The sequenced 14459fe2 run had 1,803 ms maximum I/O-clock debt but only about
274 ms maximum received frame gap. Its 19,966 ms discard is recorded logical
schedule debt, not measured CPU or lost wall time. Pre-arm was rejected; the next
admitted-I/O wake candidate must be judged from a fresh public measurement.
