# 原仕様9章のブラウザ受入監査

2026-10-05 UTC。対象はPR5の新作54項目と、原仕様 `voxel-coop-adventure-spec.md` 9章。全項目に実装経路があることと、全受入に合格したことを分ける。今回の追加ブラウザ試験はCI実行待ちであり、試験ソースの存在を合格証明にはしない。

## 今回追加した限定的な観測

### NET-A01: 相互の移動・向き・ジャンプが実際に描かれること

`tests/e2e/network.spec.ts` は同じ実endpointへ独立2contextで参加し、異なる公開player IDを確認する。移動・ジャンプは通常のキーボード入力のみ。

従来の `data-peers` は受信した権威snapshotであり、描画の証明ではなかった。`?coopRenderProbe=1` のときだけ、実際の遠隔avatarの胴体color描画を記録し、同じframeの全描画完了後にcolor/depthの書込を無効にした同一geometryをWebGL2の `ANY_SAMPLES_PASSED` queryで検査する。後から描かれた地形の遮蔽も、完成した深度bufferに対して検査する。

- canvasへのcolor描画だけを観測し、offscreen targetとoverride materialの描画を除く。
- queryの完了を非同期で確認し、深度検査を通過したpixelがあるときだけvisibleを記録する。query未完了・機能非対応・context lostを成功へ置換しない。
- 実際に描画した補間後の位置・向き・画面座標と、その時点のtickを有限長の履歴へ記録する。権威の目標位置だけを見て描画済みとしない。
- 2人が交代して移動・向き・空中姿勢を見せる。短いジャンプをGPU描画が取り逃した場合は、接地後の通常ジャンプを最大3回まで試す。
- 胴体のGPU通過は顔・全身・装備の美術品質を自動合格にするものではない。両方向の画面画像と権威/描画対照JSONを保存する。
- queryと元callbackは離脱・dispose・context lostで解放/復元する。通常URLではprobeを作らない。

### NET-A04: 編集数以外の見た目・衝突

実際にサーバーが受理した最初の採掘operationをA/Bの実WebSocketから受動観測し、完全一致を要求する。Bは通常の方向入力でその掘削中心へ移動し、元の地表より低い位置へ落ちて接地する。Bの通常HUD位置とAが受信するBの権威位置の両方を確認する。

さらにBが通常のカメラ操作で穴を見下ろし、実際の表示地形に使うreticle raycastが同じ掘削範囲の低い面へ当たることを要求する。画像とoperation・接地位置・renderer ray・streaming情報を保存する。地形やプレイヤー位置を試験から代入しない。

追加の再入室工程ではBが通常UIで退出し、同じ招待先・同じ公開IDで再参加する。新しいローカル地形epochとwelcomeの完全な編集履歴一致を確認し、通常ジャンプから同じ低い床へ着地し直す。保存位置だけの一致とは区別する。再構築した表示地形へのray hitと画像も保存する。CIで実行されるまで合格とは扱わない。

### NET-A08 / UX-A01: 拒否説明と復帰

追加の単一UIケースは同じ実endpointを使う。PlaywrightのWebSocket経路で、実際にゲームが送るhelloだけを意図的に変更する。サーバーの返答をmockしない。

- 不正な招待コード: 接続前に説明し、未接続を維持する。
- オフライン: 再接続中の表示から退出を選び、通信復帰後に勝手に再参加せず個人世界へ戻る。
- 版違い・別room・不正な復帰情報: 新しいwelcome/player IDを得ず、画面に説明を表示する。
- 満室: 4本の実際の待機WebSocketで定員を埋め、5番目のUIを拒否する。これは4人のGPU/性能試験ではない。
- 障害条件を除去後、同じ招待先へ通常UIで参加できることを確認する。

handshakeの秘密値やresume capabilityは記録しない。記録するのは拒否理由・接続/welcome件数・結果だけ。

## 原仕様の残りをどう判定するか

| 受入 | 現在ある証拠 / 今回の追加 | 残る範囲 |
|---|---|---|
| NET-A01 | 公開2contextの移動snapshot。今回、相互の実GPU描画検査を追加 | 新ケースのCI画面/JSON結果 |
| NET-A02 | 公開UIの拾得材料から箱作成・共有・同時掴み一方拒否・移動・期限切れ/切断lease回収 | 最新公開commitで回帰 |
| NET-A03 | 公開UIの同時拾得で木12の一度だけ移転。再送/単調連番は実WS・単体 | 最新版で必要な境界回帰。UIの再送試験を行ったとは扱わない |
| NET-A04 | 今回の地形operation一致、穴への歩行/接地、renderer ray、画像 | 新ケースCI。再入室後の地形再構築、通常ジャンプ/接地、同じ穴へのrenderer rayも追加 |
| NET-A05/06 | 公開UIの切断中追加編集・同一ID復帰・独立新context参加。実WSの完全state比較 | 公開UIでは在庫/全物体までの完全比較を主張しない |
| NET-A07 | 保存checkpointからの実サーバープロセス再起動と完全state/水/進行一致 | 公開Workerの任意強制停止をブラウザから実施した証拠はない |
| NET-A08 | 新規の実endpoint拒否/復帰UIケース。既存protocol/room-access試験 | 新ケースCI。ネットワーク到達不能のTCP障害はoffline条件と同一視しない |
| NET-A09 | `coop-impaired-network.test.ts` の150ms RTT・遅延/損失境界、実WS長時間試験 | 150ms追加RTT・少量損失・成功済み入力の再送・キー解放の公開2browserケースを追加、CI結果待ち。映像/音の重複再生は別判定 |
| NET-A10 | 実UI送信commandIdと権威ACKを対応。今回、表示画像とGPU/地形観測JSONを追加 | CI artifactの実行結果を確認してから対象条項だけ閉じる |
| WORLD/MOVE | 実2WS三層・登攀/水泳/岸上がり・滑空・立乗りの通常入力ルート | ブラウザのカメラ遮蔽/復帰、実機での視認・操作 |
| POWER/PHYS/COMBAT | 橋・lease・設計再建・合成消費・能力競合・車両/重量/水上/立乗り・戦闘の実2WS | 同じ経路の全てをブラウザ操作/実GPUで再現した証拠ではない |
| QUEST | 新規開始→導入→七試練→三地域→最終目標、保存再開/人数減少、後日談の実2WS | ブラウザでの全行程は未確認。任意18室全訪問を主導線へ追加しない |
| UX/SAVE | 設定保存・字幕・検索/設計・長押し取消・次周確認/取消・旧保存保護などの既存browser/単体 | 実端末の可読性/操作。今回の拒否/復帰CI結果 |
| PERF-A01 | 実WSの4接続整合とNode測定。性能担当の本番hot path計測は別証拠 | Android/iPhone実機、解像度つきframe time/p95/メモリ、公開権威負荷・net bytes。CI SwiftShaderを実機FPSと呼ばない |
| M5 | PR5専用公開とcommit/authority build照合、公開2browser経路は既存 | 最新commitのCI/deploy/asset/console結果と今回artifact。PR3/4/main/旧previewは変更対象外 |

`full-spec-audit.md` と各機能の `*-acceptance.md` の証拠を維持する。この表は未確認を実装不足と取り違えず、原仕様にない規模・厳密物理・追加コンテンツを新しい必須条件にしないための監査である。

## この変更の検証と実行方法

- `peer-render-probe.test.ts`: 完了GPU結果だけの記録、負の遮蔽結果/offscreen除外、context lostでの解放を単体で確認。
- TypeScriptとPlaywright discoveryを実行。全ゲームの単体/buildおよびブラウザの成否は統合担当の最終commit結果を参照する。
- この実行環境はChromiumのソケット起動がEPERM、cloud browserはWebGLが利用できないため、ブラウザを再試行していない。実Android/iPhoneも未接続。未実行を失敗したゲーム機能とはしない。
- CIの既存public-coop jobは `--project=desktop-chromium --grep 'two real browsers' --retries=0` で6ケースを発見する。公開URLを `E2E_BASE_URL` に指定し、同じコマンドで再現する。
- 新しく保存するartifact: `mutual-avatar-render-evidence.json`、`peer-east-visible.png`、`peer-west-visible.png`、`terrain-render-collision-evidence.json`、`remote-excavation-collision.png`、`room-refusal-and-recovery.json`、`room-recovered.png`。ファイルが実際に生成されたことと内容をCIで確認するまで、この追加は受入待ち。

## 公開11f702bで実際に失敗した再同期境界

[CI run 37374866285](https://github.com/usks213/threejs-game/actions/runs/37374866285) のpublic-coopは1合格・1失敗・3skip。2026-10-05 21:29 UTCの同時掴みはA成功・B明示拒否のACKが返ったが、BのUIがlease所有者を表示できず失敗した。これを通信成功として全体合格にはしない。

取得済みtraceから確認できる事実:

- Aはrunning/地形epoch2で、権威tick594・lease期限740の保持状態を実際に表示した。
- Bはtick597付近でpowers-panelを開いたままloading/地形epoch3へ変わった。
- 終了時は両者ともsnapshotが届き続け、地形meshを12件受信しているがGPUへ0件しか適用せず、near-ready fenceが未完了だった。
- 旧traceはwelcomeのサーバーepochを記録していない。正確にどのwelcome要求が発端だったかは確定していない。

対応した実装上の問題:

1. welcomeを受けるたびにローカル地形を無条件に破棄していた。同一のサーバーepoch・player ID・seed・generator・save versionで、tickが後退せず、既存地形履歴が完全一致するprefixである場合だけ、同じ地形へ新しい正本snapshotを適用する。再起動・世界変更・rollback・履歴書換えは従来どおり再初期化する。
2. この継続でも、古いWorker応答/request IDと未確認の移動予測は破棄する。WorkerのPredictionを作り直してから新baselineを適用し、切断前の移動・ジャンプを再生しない。
3. 同じサーバーepochのwelcome ACKが既送信入力より古くても、クライアントは入力連番を再使用しない。新epochではACKから再開する。
4. 正当な再起動や初回参加のloading中は、メニューを開いていても既存の上限付き地形GPU転送を進める。メニュー裏の世界を常時描画する変更ではない。

ブラウザ回帰は初回参加のsession-panelを開いたままloading完了を要求し、共有箱の操作中に各clientの実deltaを1件だけ意図的に落とす。サーバーからの完全welcome、同じ地形epoch、running維持、powers-panel維持、共有箱の同一IDを要求した後、従来の同時掴み・一方拒否・両UIの所有者・移動・解放・lease期限切れ・切断回収のassertionをすべて行う。lease時間を延ばしたり、UIのassertionを権威ACKだけへ置き換えたりしていない。

この修正のブラウザ合格は次の公開CI結果を待つ。純粋な継続条件、UI→継続経路、Worker予測破棄、古い応答の無視、入力連番の回帰を個別に確認する。


## NET-A09の限定した公開ブラウザ条件（試験追加・実行待ち）

`tests/helpers/coop-browser-impairment.ts` は実WebSocketの送信と受信のアプリ境界を各75ms＋0–25msの決定的jitterで遅らせる。FIFOを守り、socket終了時には未送信/未配信timerをすべて破棄する。公開internet自体のRTTとブラウザの処理時間に加算するため、「実測RTTがちょうど150ms」とは記録しない。実際のping往復時間と片道待機時間を別に保存する。

- 通常UIで生成され、実際に成功ACKが来た拾得操作だけを同じcommandId/同じbytesで1回再送する。再送の拒否ACK到着後も合計木12をUIで要求する。
- 各clientの50番目と100番目の実deltaだけを落とし、実際に2件落としたことを要求する。TCP packet lossそのものの計測ではなく、アプリ配信の損失条件である。
- 既存の箱作成/同時掴み/一方拒否/移動/解放/実tickによるlease失効/切断からの再取得の条件を維持する。
- Bの通常移動とキー解放を行い、最初のidle入力1件を落としても、その後の通常heartbeatで停止することをAの受信位置から検査する。落とした件数が0の試行を成功へ数えない。
- 終了時に遅延設定を解除し、待機queueが0になってから後の描画/地形試験へ進む。外部へ保存するのは件数・時間・停止位置だけで、resume capabilityや生のhelloを出力しない。

`impaired-browser-transport.json` を新しい証拠にする。これは操作の経済効果の二重適用防止を扱う。粒子・音声の実際の二重再生を観測したとは扱わない。helperのFIFO/両方向遅延/実RTT/限定loss/成功操作の同一再送/終了時取消は3単体試験で確認した。

## CI37379440094の実ソケット試験の停止理由

`coop-impaired-network.test.ts` の採掘数待ちが失敗したため、実際のACKを確認した。2回の採掘送信は両方とも「操作の間隔を空けてください」で拒否されており、受理した編集の同期不一致ではなかった。拒否済み拾得の再送もactorの操作間隔を消費し得る。150msのネットワーク待機が、負荷中の4simulation tick経過を保証すると考えた試験側の前提を修正した。

拾得の元receiptと再送receiptを両者分待ち、その後の新しい権威frameから4tick進むまで次の異なる操作を待つ。採掘は成功ACKを明示要求した上で、従来どおり両者の編集数が正確に1、再入室後も1、拾得合計が12であることを要求する。ゲームのクールダウン・assertion・20秒の全体予算は緩めていない。実ソケットとclock/lifecycleの関連9試験、型検査に合格。

## ed64434cのNET-A01描画観測（2026-10-05 22:19–22:24 UTC）

[CI run 37381201111](https://github.com/usks213/threejs-game/actions/runs/37381201111) のローカル実2browserは、拾得、同一epochの完全再同期、箱競合/lease回収、150ms追加遅延・限定loss・成功拾得の再送・移動停止を両試行で通過した。次の相互描画ケースは移動/向きが通ったが、空中の実pixelを観測できず失敗し、後続の地形ケースはskip。公開Workerの結果や全受入合格へ読み替えない。

traceではAはBの上昇位置を受信していた一方、描画frameの間隔が約1秒以上になっていた。最初のSpace入力は139689.9ms、Aのairborne受信は139955.8ms（y1.953、足元1.430）だが、前後の画面swapは139653.5msと140860.7ms。次の試行でも147558.3msの入力を147531.6→149566.9msのframe間隔が挟んだ。document.hiddenはfalseであり、これだけでOS/ブラウザの厳密なthrottle原因までは断定しない。

記録済みGPU queryはすべてvisibleだったが、観測した最高の上昇は約0.064mで、必要な0.15mに達しなかった。元probeは未完了queryが1件ある間は新しい描画poseを採らず、query結果の間隔が5–10秒になることもあった。

対策候補は、通常Spaceの直後に観測側ページを明示的にforegroundへし、操作側のメニューを再度押すのは空中観測の後にすること。probeは同時8件までの有限query列で各実描画poseを採り、完了結果だけを記録する。容量超過は数え、queryや描画を偽造して成功へ置き換えない。color/depthへの追加書込はしない。

visible=true・足元より0.15m上・同じplayer IDという条件、通常のjump入力、最大3回の試行を維持する。5probe単体試験と型検査、6browserケースの発見は合格。実際のブラウザでこの変更が空中pixelを観測できるかは次のCI結果待ちであり、原NET-A01はまだ未完了。

## 17d67fd1の公開UI拒否と配置安全判定

[CI run 37383321716](https://github.com/usks213/threejs-game/actions/runs/37383321716) の公開NET-A02では、移動のpreview-confirmが `data-connection=syncing` 中に押された。UIは移動を記録したが、CoopClientは「再接続してから操作してください」と送信を拒否し、旧UIは未送信のpreviewを先に消していた。

- 試験の遅延helperにも不具合があった。各messageの独立timerが端数の丸めで同じ予定時刻でも順序を入れ替え、意図しない再同期を増やした。旧helperは端数時刻の回帰で送信順1,2,3,4,5,10,6…となることを再現。新helperは方向ごとに一つのFIFO drainを持ち、75ms＋jitter、明示した2delta損失、同一拾得の再送を維持する。以前の結果を「指定条件どおりのFIFO配送」とは称さない。
- 創作previewは同期中・再接続中の確定を無効にし、説明と未送信内容を保持する。同期が戻っても勝手に実行せず、本人の再確定が必要。失ったleaseを復元/延長する変更はない。
- browser検査はオンライン状態を確認してから確定し、クリックと再同期が交差してpreviewが未送信のまま残った場合だけ同じ内容を再確定する。依然として実送信のcommandIdと成功ACK、両者の位置一致を要求する。

同じrunのlocal retryは別の正しい拒否だった。箱が初期のrunestone810001（中心0,1.0124,3）へ寄って静止し、Upだけの行先の一つの角が0.6363,2.2233,3.1312となって半径0.65mの保護領域へ入った。記録された姿勢を実際のclearanceに戻して拒否を再現した。

安全判定を緩めず、試験では通常のUp＋Forwardで上方かつ石碑から離れる行先をpreviewし、確定まで実体不動・確定後の正確な0.125m格子位置を両clientで要求する。元の危険な行先が拒否され、位置/epoch/lease期限を変えないことと、上方・外側の安全な行先だけが通ることを境界試験で維持する。

FIFO/preview保持/記録姿勢の安全判定/既存Skyboundの関連18試験が合格。修正したbrowser経路の実行結果は次のCI待ち。
