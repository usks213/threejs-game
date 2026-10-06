# Worker時計での正のtimer yield

2026-10-05。公開ed64434cではWebSocketが開いた後、welcomeも受信byteも得られず20秒で検査が止まった。以下はその原因候補を再現する時計モデルと最小修正であり、この時点では公開復旧の証明ではない。

[Cloudflareの時計仕様](https://developers.cloudflare.com/workers/runtime-apis/performance/)では、公開Workerの時計はI/Oの後に進み、同期JSのCPU時間には使えない。ローカルworkerdの時計は異なる動作になる。 [Web標準の説明](https://developers.cloudflare.com/workers/runtime-apis/web-standards/#performancetimeorigin-and-performancenow)ではperformance.nowとDate.nowの関係も明記されている。

従来のschedulerは33.333…msのdeadlineに対し、残り0.333…msのtimerをそのまま渡していた。整数epoch時計と小数ms切捨てを組み合わせた再現モデルでは、最初の33msの後で時刻が変わらない0ms timerを繰り返す。モデル上はtickが1回も進まず、35msに待っているhelloイベントにも到達しない。修正前の新規テストはこのlivelockを検出して失敗した。

修正は待ち時間を切上げて必ず1ms以上の正の整数にする。Nodeの微小な浮動小数点残差だけを除き、未到達deadlineを0msで待ち続けない。既存の固定dt、backlog上限、停止/再開始と古いcallbackの保護を維持する。

WorkerはmaxCatchUpSteps=1とし、重いstepごとにtimerへ戻る。時計が止まっている間の「12ms CPU制限」は主張しない。Nodeは従来の最大3stepと、同期中に進む時計によるbest-effortの時間予算を維持する。

10関連試験に合格。整数epoch/frozen-clock・切捨てtimerでhelloが進むこと、正の整数delay、30回/約1秒の固定step、1回80ms相当の同期処理でcallbackを1stepに制限することを追加確認した。実Workerの入力gate・公開の再welcome・再接続・持続tickは公開版で別途検証する。

## ローカルworkerdも分けて確認

公開用と同じWrangler4.147.0が依存するMiniflare5.20261001.0-alpha/workerdで、変更前のcommitted sourceと修正後のbundleを別々に起動した。実4WebSocketによるwelcome、独立ID、3peer、進むframe、正常切断は両方で合格した。変更前も通るので、ローカルworkerdだけでは公開時計の退行を再現できないことも記録する。

各1秒の短い測定器smokeであり、Workers128MB適合・30Hzや長時間負荷の証拠ではない。修正後には実際にoverload/rebaseも記録された。公開ed64434cの失敗結果はhealth/build照合成功、1hello送信、受信0byte、測定0msであり、「4人が動いた」とは扱わない。

統合した最小修正は型・全882試験/189ファイル・buildに合格。公開でのwelcome復旧とブラウザの完走は次の同SHA CIで確認する。Workerの同期処理内にあるtickMs等もCPU時間の実測にはならず、client側の実時間tick/RTTと区別する。

## 2026-10-06: native wait候補と未確定の実行順序

公開707a0c46の60.052秒測定は4接続を維持したが、最小22.780Hzで30Hz未達だった。最初の接続の同じpong両端ではclient実時間56,956.524msに対しWorker時計43,400ms、実tick/callbackは共に1,302。時計上の30.000Hz、rebase/dropが0、最大debtが0.784msでも、実時間30Hzを意味しない。生の観測は`docs/benchmarks/public-worker-load-707a0c46.json`へ保存した。差分だけから全13.557秒をCPU時間と断定しない。

[workerdのtimeout実装](https://github.com/cloudflare/workerd/blob/main/src/workerd/io/io-context.c%2B%2B)は、callback実行中もtimeout時刻を保持し、`context.now()`が次のtimeout時刻でclampされ得る。`setInterval`もcallbackの後に同じ`setTimeoutImpl`を呼び直すため、raw wall-clock intervalへの切替にはならない。`precise_timers`は[experimental flag](https://github.com/cloudflare/workerd/blob/main/src/workerd/io/compatibility-date.capnp)であり、採用していない。

Workerだけに`createWorkerSchedule`を挿入し、公開されたAPI `scheduler.wait(delay, {signal})`のnative promiseから既存FixedStepClockへ戻る候補を実装した。[Scheduler::waitの実装](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/basics.c%2B%2B)はC++のKJ promiseをfulfillし、[IoContextのpromise変換](https://github.com/cloudflare/workerd/blob/main/src/workerd/io/io-context.h)は別の`run()`でJSへ戻る。これはJSの`new Promise(resolve => setTimeout(resolve, delay))`とは別の境界である。

ただし、調査で確認できたのはnative再入と`runImpl()`による`syncTime()`まで。KJ promise/taskの破棄順序を含め、公開runtimeで再入時に元のtimeout clampが既に除かれていることは未証明。追加したclampモデルは「除去済みなら実時間へ追従する」という仮説の回帰試験であり、runtimeの実行順序を証明する試験ではない。[公式scheduler仕様](https://developers.cloudflare.com/workers/runtime-apis/scheduler/)もCPU実行中には時計が進まないと明記している。したがって本候補を公開30Hz復旧やCPU時計の導入と扱わず、同SHAの既存4接続公開probeで再判定する。

変更範囲はWorkerの待機adapterと停止時のabort/失敗通知だけ。Nodeのscheduler、固定dt、Workerの1callback/1step、positive整数delay、backlog上限、既存counter、物理/水/ゲーム仕様は維持した。待機の同期例外・非同期reject・step失敗は停止を通知し、leave/restart時の古いfulfillment/rejectionは次のrunへ作用しない。関連28試験と全typecheckに合格。全体試験/buildと公開確認は統合側で実施する。

同じ候補bundleをMiniflare5.20261001.0-alpha/workerd1.20261001.1で起動し、本物の4WebSocketで5秒の接続smokeを完走した。全員のwelcome/3peer/進むframeと2つずつの有効なtiming sampleを確認。ローカル最小29.738Hz、開始直後には4回のoverload/rebaseも観測した。ローカルの時計は公開と異なり、この短い試験はadapterの実API接続確認であって、公開性能やcleanup順序の証明ではない。

## 2a1debf1の公開結果と次の待機開始位置

native wait版2a1debf1は、公開4接続の測定区間でWorker58.520秒/client58.425秒と両時計が近づいた。ただしbrowser QAの別部屋と並行した60.015秒の測定では最小14.896Hz。876tick/callback、26rebase、29,304.070msのdiscardを観測し、30Hzには届かなかった。これは`public-worker-load-2a1debf1-concurrent.json`へ保存した。

全browser QA終了・関連する別部屋のsocketを閉じた後、同じSHA・同じ4接続条件のload-only再測定は60.045秒、最小24.282Hz、失敗0だった。同じpong両端でWorker56.182秒/client56.947秒、1,386tick/callback、10rebase、9,977.106msのdiscard。元の結果は`public-worker-load-2a1debf1-isolated.json`。同じ版で大きく変わるため14.896Hzの全差をnative adapterのコストと断定しない。一方、残る0.765秒の時計差もCPU実測とは扱わず、load-onlyでも30Hz未達と記録する。

### 固定commitによる順序の確認

workerd commit `0e2da6cb219819e65fd80175331a4cef256508e9` と、同じcommitの[依存指定](https://github.com/cloudflare/workerd/blob/0e2da6cb219819e65fd80175331a4cef256508e9/build/deps/gen/deps.MODULE.bazel#L27-L35)が参照するKJ commit `1be2d2a8e60152c89b00adca758c0c495acadc2b`で再確認した。

- [timeoutのattachmentとeager評価](https://github.com/cloudflare/workerd/blob/0e2da6cb219819e65fd80175331a4cef256508e9/src/workerd/io/io-context.c%2B%2B#L976-L1003)：timeout時刻の除去処理をpromiseにattachしてからeagerlyEvaluateする。
- [KJ EagerPromiseNode::fire](https://github.com/capnproto/capnproto/blob/1be2d2a8e60152c89b00adca758c0c495acadc2b/c%2B%2B/src/kj/async.c%2B%2B#L3033-L3042)：callbackを含むdependencyを実行し、そのdependencyを破棄してから依存側を起こす。
- [native wait](https://github.com/cloudflare/workerd/blob/0e2da6cb219819e65fd80175331a4cef256508e9/src/workerd/api/basics.c%2B%2B#L1360-L1397)はKJ eventを起こす。現在のeventが戻る前に別eventが実行されることはない。JS Promiseをresolveするtimeout callbackのmicrotaskとは順序が異なる。

したがって確認したupstream実装では元timeoutの除去がnative JS再入より先になる。公開fleetがこの正確なcommitであることや実時間30Hzを、sourceだけで保証するものではない。

### single-step pre-arm候補

Workerだけ`maxCatchUpSteps=1`と`scheduleBeforeStep=true`を組み合わせ、次のpositive整数waitをroom.step前に予約する候補を追加。native再入では前のtimeoutが除かれているため、新しいtimeoutを最先頭として予約できる。同期stepの後に初めて待機を開始する直列化を避けるが、CPU時間を読めるようにしたりcatch-up上限を増やしたりはしない。Nodeは既定のpost-armを維持する。

stop・例外・leave/restart・古いcallbackを検証。pre-arm中の同期停止でも返ってきたcancel handleを直ちに呼び、次のstepを行わない。pre-armと複数step設定の併用は拒否する。関連33試験と全typecheckに合格。

2a1debf1のfrozen sourceにtimer変更だけを適用し、booleanだけが異なるbundleをローカルworkerdでpost/pre/pre/post順に各5秒測定した。最小Hzは29.891 / 29.823 / 29.366 / 29.781、4接続はいずれも完走。preの一回では初期rebaseもあり、localthroughput改善を証明していない。`docs/benchmarks/worker-prearm-local-abba.json`を参照。公開へ採用する場合も同SHA・load-only条件で再判定する。
