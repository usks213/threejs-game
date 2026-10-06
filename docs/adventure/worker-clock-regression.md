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

## 14459fe2: pre-armを棄却し、admitted-I/O wakeを測定候補にする

browser QA後に順序付けた公開14459fe2の4接続測定は60.017秒・通信失敗0だが、最小19.994Hz。以前のpost-arm版2a1debf1のload-only24.282Hzを上回る証拠はなく、pre-arm optionとその専用試験を除去した。native wait・既存telemetry・固定dt・物理/水・broadcastは保持。失敗した実験の記録は削除せず、`public-worker-load-14459fe2-sequenced.json`を追加した。

測定pong両端はWorker59.204秒/client58.813秒、1,177step/tick、20rebase、19,966.096msのdiscard。最大I/O-clock debtは1,803.008msだが、clientの最大3tick-frame間隔は約274msだった。1.8秒debtを1.8秒の単発CPU停止と呼ばない。runtime時計がvirtual deadlineから外部I/O時刻へ補正される可能性と、実際の処理/待機負荷を分ける。元のreceiptは最初/最後のpongだけで、各rebaseと2秒pingとの一致は証明できない。productionのTimerChannelは公開workerdのinterfaceから先を確認できず、`syncTime()`という名前だけでraw wall clockへの更新を保証しない。

次の候補はタイマーの置換ではなく、既存deadlineを満たしたserver I/Oから同じsingle-step turnを実行する`FixedStepClock.wake()`。admitted input・有効delivery receipt・認証済み/rate内pingのみをAuthorityRoom内部の戻り値で許可する。新しいinput sequenceの採用を確認し、pre-handshake・未保存access変更中・不正/古いinput・偽造/再利用receipt・rate超過・action/resyncはwake対象外。messageの内容にある時刻や送信頻度からdeadlineを作らない。

wakeはrunningかつ非reentrant、maxCatchUpSteps=1、Worker-owned nowが既存deadline以上の場合だけ行う。未到達ならtimerを一切触らない。到達時は古いwaitをcancel/generationで無効化し、clockを読み直して既存の固定stepとrebase規則を一回だけ実行する。deadlineは各stepの固定interval加算または既存overload時の前進だけで、message数による前倒しはない。native timerは引き続きidle時も進める。Nodeの通常timer経路と3step上限は変えない。

sourceからは、pending timeoutを除去すると`now()`へのnext-timeout clamp引数が変わることを確認できる。しかし外部I/O wakeが公開30Hzを回復するかは未実測。これを完成やCPU能力改善と扱わず、次の同SHA・QA終了後の4接続測定でaccept/rejectする。

optional `events`診断も追加し、step entry/message entryで観測したI/O-clockの前回観測からの増分、250ms超のjump数、最大jump、逆行数、最後のjumpだけを保持する。message entryの観測は不正messageを含むが、schedulerのadmissionとは別。これらはCPU/wall-timeではない。probe側は最大8つの異なるsampled jumpを保持し、完全なevent logとは呼ばない。runtimeの進み方を変えるための計測用fetchや外部サービスは追加しない。

このwake候補の関連51試験と全typecheckに合格。early wakeでtimerを再予約しないこと、1,000msのserver-clock上で大量wakeを送っても30stepを超えないこと、reentrant/stale callback/stop/restart/例外、clock clamp除去後の読み直し、admissionとoptional診断の互換性/不正値/逆行を確認した。wakeの外側でnow/cancelが例外になっても、捕捉したtimerをstopしてから同じroom/timerの場合だけ参照を除去する。

ローカルworkerdの実4WebSocket/5秒smokeも通信失敗0で完走し、全員2つの有効なevent telemetry sampleを受信した。対応するpong両端は60tick/2,013msのI/O-clock区間。短い全測定窓では直前のframe到着位置の影響を受けるため、これを公開30Hz合格へ拡大しない。結果はローカルadapterの接続確認だけで、公開でのwake効果やCPU能力は未確認。

## 6aa70935: I/O wakeも棄却、native post-armへ戻す

QA終了後に順序付けた公開6aa70935の4接続は60.019秒、通信失敗0だったが、最小12.696HzでI/O wake候補は不合格。`docs/benchmarks/public-worker-load-6aa70935-sequenced.json`に元のreceiptを保持した。wake method、admission flag/callsite、専用試験を除去し、22ce332のnative post-arm動作へ戻した。constant-size clock診断とcaptured-timer停止helperは保持する。物理/水/dt/broadcastを下げる変更はなく、別の未検証timer候補は追加しない。

最初/最後のpongが共通して覆う区間はWorker56.502秒/client56.823秒、721step/tick、30rebase、32,480.058msのI/O-clock debt discard。run末の累積event値は821step entry、6,147message entry、stepで発見した250ms超jumpが4、messageで発見したjumpが34。この区間の増分に限ると721step entry、5,546message entry、step jump 1/message jump 29だった。累積最大advanceは1,778ms。観測jumpが主にmessage entryで現れたことは確認できる。

ただし`recentClockJumps`は2秒間隔のpongが最後のjumpを取り出したsampleで、message subtypeを記録しない。sample到着の約2秒間隔だけから「pingがclockを補正した」と断定しない。最大受信frame gapは505.903msで、最大1,778msのclock advanceを単発の1.778秒CPU/実時間停止とは呼べない。累積CPU時間、待機/queue時間、event-clockの更新遅れの割合は、このtelemetryだけでは分離できない。

[Cloudflareのperformance仕様](https://developers.cloudflare.com/workers/runtime-apis/performance/)では、公開Workerの時計は同期CPU実行中には進まない。[scheduler仕様](https://developers.cloudflare.com/workers/runtime-apis/scheduler/)も同じ制約を説明している。sourceで確認したnative promise/timeoutの順序は、このclockをCPU計測器に変えない。現時点で言える制約は「この計測ではWorker CPU/peak memoryとclock補正を直接分離できず、30Hz未達の原因を特定できていない」こと。Cloudflare上で30Hzが不可能だという結論ではない。追加判断には実WorkerのCPU/メモリ指標や対応するruntime観測が必要で、Nodeの値を代用しない。

rollback後の関連46試験/9ファイル、全typecheck、diff checkに合格。message entry観測だけではtimerをcancelしたりsimulationを進めたりしないこと、captured old timerを停止してもreplacement runを消去/通知しないことも確認した。公開でrollback版をまだ再測定していないため、復旧後のHzは未確定。

## 54850cae: native post-armの公開再測定

[同一SHAのCI37401531255](https://github.com/usks213/threejs-game/actions/runs/37401531255) で公開2browser終了後に4接続を測定した。60.038秒、通信失敗0、最小13.941Hzで30Hz目標は未達。[元receipt](../benchmarks/public-worker-load-54850cae-sequenced.json)を保持する。

他の公開browser接続が終了して数分経ってから、同じSHAの負荷jobだけ一度再実行した。60.017秒、通信失敗0、最小17.695Hzだった。[再測定receipt](../benchmarks/public-worker-load-54850cae-quiet-repeat.json)も保持する。この差だけで、別roomの保持、CPU競合、GC、providerのisolate配置のどれが原因かは判定できない。quietという呼称も専用isolateや他負荷ゼロの証明ではない。

別途、最終切断後にもroomとfulfilled loading promiseが残る参照を発見した。新しい候補は最後の保存完了・保留join/saveなしを待って参照を解放し、次の参加時に保存から再構築する。ローカル同一Durable Objectのcold rejoinで保存状態を確認したが、この変更が公開Hzまたはpeak heapを改善するかはまだ測定していない。30Hz・128MiBの合格へ読み替えない。

## 7c7caae9: idle lifecycle修正後も30Hz未達

[CI37404827306](https://github.com/usks213/threejs-game/actions/runs/37404827306) の公開2browserは新しい全退出/保存再参加を含む6件に成功。後続の4接続は60.049秒、通信失敗0、最小11.291Hzで30Hz未達だった。[計測receipt](../benchmarks/public-worker-load-7c7caae9-idle-cleanup.json)を保存する。31回のrebaseと約37,295msのI/O-clock debt破棄を観測したが、CPU・実時間停止の測定とは解釈しない。

最終退出後の参照解放とcold rejoinの機能上の証拠は得られた一方、今回の公開計測ではthroughput改善を確認できない。別roomの残留が遅さの原因だったとも、修正が遅さを生んだとも、この1回の前後差から断定しない。実WorkerのCPU/peak heap指標は引き続き未確認。
