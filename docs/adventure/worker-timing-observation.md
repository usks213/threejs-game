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
