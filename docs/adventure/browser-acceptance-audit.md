# 原仕様9章のブラウザ受入監査

2026-10-06 UTC。対象はPR5の新作54項目と、原仕様 `voxel-coop-adventure-spec.md` 9章。全項目に実装経路があることと、全受入に合格したことを分ける。追加ブラウザ試験の実行結果と残る範囲を以下に記録する。試験ソースの存在を合格証明にはしない。下の受入表が現在の要約であり、commit別の履歴段落は当時の失敗・未実行をそのまま残す。

現行公開は `54850cae6bad022940704f3cf98983be00fe86f6`。[CI37401531255](https://github.com/usks213/threejs-game/actions/runs/37401531255) の公開実2browserは6/6合格。直前の6aa70935でも公開/ローカル各6/6が合格している。548のローカルhost初回はAの復活直後の過渡的な照準へ採掘し、保護領域の正しい拒否でNET-A05が失敗した。serial全体のretry中にjobの10分期限へ達しており、ローカル結果を全合格とは扱わない。今回の試験側の照準安定待ちはブラウザ再実行待ち。

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

### NET-A05/06: 復帰者の個人在庫・完全な共有部品・編集履歴

最終の切断/後参加ケースを拡張する。`tests/helpers/coop-browser-recovery.ts` はA/B/Cそれぞれの実WebSocketを受動観測し、productionの `CoopFrameDecoder` でwelcomeと差分を復元する。delivery callbackを渡さず、観測側からACK・resync・操作を送らない。新しいsocketには独立decoderを使う。内部の現行water baseline以外には大きなsnapshotを溜めず、履歴はepoch/tick・本人のinventory・完全な `skybound.parts` の120件までに限定する。decode失敗は保存し、次のwelcomeで復帰しても失敗を消さない。

Playwright Chromiumの `framereceived` はCDPの `Network.webSocketFrameReceived` に由来し、故障helperが後段のDOM `message` を遅延/抑止する前のwireを観測する。先行NET-A02/09の意図したDOM配送欠落は、受動decoderの欠落ではない。全履歴のdecode失敗0という条件を維持し、NET-A05開始時には故障設定OFF・追加欠落要求なし・待機queue0も確認する。単体回帰は実helperでDOM側decoderの欠落失敗とnative側の完全観測を区別する。productionの同一世界継続判定は試験flagに依存しない。

- B切断前に、B自身の全inventoryを実受信stateから記録する。切断中のAの追加採掘は通常UIのみで行い、Bの編集数が古いままであることも維持する。
- Bの新しいwelcomeで同じ公開ID、全inventoryの完全一致、Aが実際に受け取った全編集operationとの完全一致を要求する。切断中に増えたoperationそのものを含め、件数だけの検査にしない。
- 復帰後の同じauthority epoch/tickをA/Bの有限履歴から選び、完全なparts配列を比較する。位置・回転・速度・links・revision相当のepoch・lease所有者/期限・その他の部品fieldを削らない。違うtickの物理状態を比較せず、一致する姿勢になるまで待つ方法も採らない。
- Bの通常の持物画面を開き、全正数の品物を実スロットの表示数量へ照合する。素材のゼロ数量も通常表示で確認する。Bの在庫をAへ一致させず、個人blueprint/fusionも共有部品として比較しない。
- 空の新規browser contextのCは通常の招待画面からjoinし、running・A/Bと異なる公開ID・3人接続・完全なwelcome編集履歴を要求する。C/Aでもwelcome後の同じauthority tickの完全partsを比較する。
- B/Cの創作画面で、先行ケースで実際に作成した共有の木箱を同じIDで選択し、部品名/番号と操作可能な通常UIを確認する。追加の箱や地形fixture、合成game actionを用意しない。

`browser-recovery-state.json` と `returned-personal-bag.png`、`returned-shared-block.png`、`late-shared-block.png` を保存する。JSONは比較対象の個人在庫、受理編集、同tick部品、公開IDとUI選択に限り、hello・resume key・delivery token・全保存worldを含まない。既存NET-A04の再入室後の地形描画/衝突検査を、最終ケースでもう一度歩いて繰り返すことはしない。追加assertionのブラウザ実行前にNET-A05/06の完全受入とは記録しない。

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
| NET-A01 | 2a1debf1公開6ケースの一つとして相互の移動/向き/空中pixelが合格。14459fe2公開でも通過 | 実機FPS/美術全体の確認へ読み替えない |
| NET-A02 | 2a1debf1と14459fe2の公開実2browserで箱作成・共有・同時掴み一方拒否・移動・期限切れ/切断lease回収が合格 | この条件は検証済み |
| NET-A03 | 2a1debf1と14459fe2の公開UIで同時拾得、成功操作の同一ID再送拒否後も木12の一度だけ移転 | 経済効果の二重適用防止を検証済み。映像/音の重複再生は未観測 |
| NET-A04 | 6aa70935/54850cae公開で完全operation、有限の視点探索、掘削面/衝突、再入室後の同じ床へのジャンプ/接地まで合格 | 548ローカルも初回/retryの両方でこのケースは合格。過去の遮蔽失敗は履歴に保持 |
| NET-A05/06 | 6aa70935/54850cae公開でB全inventory、全編集operation、A/B・A/C同tick全parts、通常bag/創作UIが合格 | 548ローカル初回の採掘は保護範囲で拒否。復活後の照準安定待ちと正確な採掘ACK確認を追加し、再実行待ち |
| NET-A07 | 保存checkpointから実Nodeサーバープロセスを再起動し、完全state/水/進行が一致。2WS証拠と合格済み4WS・15分receiptを維持 | 原仕様のサーバー停止/再開条件の証拠あり。公開Workerの任意強制停止を新しい必須条件にしない。最新sourceの耐久確認は別途扱う |
| NET-A08 | 2a1debf1公開で接続不能/offline・別room・版違い・満室・不正payloadの説明/安全な拒否と復帰が合格 | 原仕様の区分を確認済み。DNS/TCP障害の追加種類を新しい必須ゲートにしない |
| NET-A09 | 実WSに加え2a1debf1/14459fe2公開2browserで150ms追加RTT・限定loss・成功操作の再送・キー解放が合格 | literalな映像/音の重複再生は未観測。実TCP packet lossの測定とは称さない |
| NET-A10 | 実UI送信commandIdと権威ACK、2a1debf1公開の表示画像・GPU/地形JSONを保持 | 今回の復帰状態JSON/持物・創作画像はCIで実際の生成と内容を確認するまで追加受入待ち |
| WORLD/MOVE | 実2WS三層・登攀/水泳/岸上がり・滑空・立乗りの通常入力ルート | ブラウザのカメラ遮蔽/復帰、実機での視認・操作 |
| POWER/PHYS/COMBAT | 橋・lease・設計再建・合成消費・能力競合・車両/重量/水上/立乗り・戦闘の実2WS | 同じ経路の全てをブラウザ操作/実GPUで再現した証拠ではない |
| QUEST | 新規開始→導入→七試練→三地域→最終目標、保存再開/人数減少、後日談の実2WS | ブラウザでの全行程は未確認。任意18室全訪問を主導線へ追加しない |
| UX/SAVE | 設定保存・字幕・検索/設計・長押し取消・次周確認/取消・旧保存保護などの既存browser/単体 | 実端末の可読性/操作。拒否/復帰UIは2a1debf1公開でも合格 |
| PERF-A01 | 実WSの4接続整合とNode測定。性能担当の本番hot path計測は別証拠 | Android/iPhone実機、解像度つきframe time/p95/メモリ、公開権威負荷・net bytes。CI SwiftShaderを実機FPSと呼ばない |
| M5 | PR5専用公開54850caeと公開6ケース合格。過去commitの証拠は独立して保持 | 548ローカルNET-A05失敗/serial retryのjob期限切れ、今回の照準待ち変更は再実行待ち。PR3/4/main/旧previewは変更対象外 |

`full-spec-audit.md` と各機能の `*-acceptance.md` の証拠を維持する。この表は未確認を実装不足と取り違えず、原仕様にない規模・厳密物理・追加コンテンツを新しい必須条件にしないための監査である。

NET-A07の既存証拠は単なるsaveのメモリ内再読込ではない。`scripts/playthrough-coop-websocket.ts` は子サーバーの終了を待って新しいprocessを起動し、そのrun自身が獲得したcheckpointから再接続する。`standing-deck-water-acceptance.md` の実2WS記録は3回のprocess再起動と1,090件の完全snapshot/水比較を含む。`optimized-four-player-soak.md` と `docs/benchmarks/four-player-soak-2026-10-05.json` は903.307秒・再起動1回・完全snapshot/水各358比較・失敗0を記録する。これらのソース・日付・限界を保持し、最新sourceの耐久試験や公開Workerでの停止と混同しない。

## この変更の検証と実行方法

- `peer-render-probe.test.ts`: 完了GPU結果だけの記録、負の遮蔽結果/offscreen除外、context lostでの解放を単体で確認。
- `coop-browser-recovery.test.ts`: 実protocol decoderの全比較field、履歴件数、epoch/tick境界、個人在庫分離、decode失敗の保持、socketごとのbaseline、秘密値/大きなwater履歴の除外、native観測とDOM配送欠落の分離を5単体で確認。既存decoder/impairment/continuationと合わせ関連16単体と型検査が合格。
- TypeScriptとPlaywright discoveryを実行。全ゲームの単体/buildおよびブラウザの成否は統合担当の最終commit結果を参照する。
- この実行環境はChromiumのソケット起動がEPERM、cloud browserはWebGLが利用できないため、ブラウザを再試行していない。実Android/iPhoneも未接続。未実行を失敗したゲーム機能とはしない。
- CIの既存public-coop jobは `--project=desktop-chromium --grep 'two real browsers' --retries=0` で6ケースを発見する。公開URLを `E2E_BASE_URL` に指定し、同じコマンドで再現する。
- 保存するartifact: `mutual-avatar-render-evidence.json`、`peer-east-visible.png`、`peer-west-visible.png`、`terrain-render-collision-evidence.json`、`remote-excavation-collision.png`、`room-refusal-and-recovery.json`、`room-recovered.png`。今回の追加は `browser-recovery-state.json`、`returned-personal-bag.png`、`returned-shared-block.png`、`late-shared-block.png`。実際の生成と内容をCIで確認するまで追加条件は受入待ち。

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


## 763c7902の公開/ローカル結果とGPU読出し時間

[CI run 37386732391](https://github.com/usks213/threejs-game/actions/runs/37386732391) は公開・ローカルとも3合格・1失敗・2skip。拾得/同じIDの再送、同一epochの完全再同期、箱の同時掴み/移動/lease失効/切断回収、NET-A09の限定遅延・損失条件、拒否説明と復帰が合格した。地形/再入室と後続の復帰ケースはNET-A01失敗によりskipであり、今回の結果で合格へ変更しない。

公開traceの通常ジャンプ3回は、権威位置が足元y1.468から約2.7まで上昇した。しかし観測側の画面間隔は約0.9–2.2秒、最大約3秒で、両方のビューが空中期間も描画を続けていた。8件query列の容量超過はない。公開の実color描画の最高yは1.6098（visible=true）で、足元から約0.142mのため必要な0.15mを満たさない。画面では移動後のavatarが視野内にあり、遮蔽による全不可視ではなかった。

非同期のquery完了も遅い。公開の約113482msのcolor描画結果は121036msに初めて取得され、約7.55秒遅れた。ローカルretryでは291228.9msの3回目のSpaceに対し、約291802msにy2.170の実color描画があり、そのvisible=true結果が301963.1msの失敗後diagnosticsで初めて現れた（約10.16秒後）。後者は実際の空中pixelを捉えていたが、試験の2.5秒の結果待ちより遅かった。受信snapshotだけを描画証拠に読み替えた判断ではない。なお、片方向の一度のpixelを相互受入の合格にはしない。

次の試験変更は通常のSpace直後にTabで持物メニューを開き、操作側の描画を止めて観測側をforegroundへ戻す。メニューのクリックで2描画frameのactionability待ちを挟まない。Spaceが実際に権威位置を上げ、接地へ戻ることは引き続き要求する。

各試行のGPU読出しは最大15秒で、成功pixelを得るか、接地後の描画sampleまでFIFO結果が完了することを要求する。後者の時点で高いpixelがなければ初めて「空中frameを取り逃した」と数える。読出し自体が未完了なら失敗し、成功へ置換しない。最大3回の通常ジャンプ、同一player ID・visible=true・足元より0.15m高い条件を維持し、全体予算は180秒。失敗時も各試行の権威上昇・描画履歴・frame統計をJSONへ保存する。

描画解像度は従来の640×360 CSS / deviceScaleFactor 0.5と既存の自動調整のまま。この変更は試験操作と観測の待機条件だけで、物理・姿勢・描画効果は変更していない。型検査と6ケースのdiscoveryに合格。変更後の実ブラウザ結果はCI待ちであり、SwiftShaderの時間を実機FPSとして扱わない。

## 707a0c46の未送信操作と観測カメラ（2026-10-06）

[CI run 37390246811](https://github.com/usks213/threejs-game/actions/runs/37390246811) の公開NET-A02は共有設定の送信待ちで失敗した。[公開証拠](https://github.com/usks213/threejs-game/actions/runs/37390246811/artifacts/11380463929) のbrowser-0 traceで、`#power-share` のcall@216直後（32580.653ms）に `data-connection=syncing`、試みた操作 `sky-share 1:on`、通知「再接続してから操作してください」が同時にある。ACK紛失を推測したのではなく、再同期とクリックが交差してclientがqueue投入前に拒否していた。取得/再送ケースと拒否説明/復帰は合格、後続3ケースはskipで、公開NET-A02の合格にはしない。

- CoopClientの操作結果を、ローカルqueueへ入った `queued + commandId` と、入らなかった `refused + 理由` に分けた。queuedは権威の成功ACKを意味しない。遅延送信・切断再送でも元のIDを維持し、ACKまで二つ目の操作へ置き換えない。
- UIは試みた操作だけでなく実際の投入結果を記録する。拒否済みのoffline操作を再接続後に自動実行する変更はない。管理保存中、read-only、64件の待機上限も拒否を維持する。
- browser試験は実UI入力の結果を観測し、明示したoffline拒否、またはcommit callbackが走らず保持されたpreviewの場合だけ再度本人操作を行う。native framesentがまだないことを再クリックの理由にしない。投入された正確なcommandIdの実WebSocket送信と、その同じIDの成功ACKを引き続き要求する。

同runの[ローカル証拠](https://github.com/usks213/threejs-game/actions/runs/37390246811/artifacts/11381292003) ではNET-A02/NET-A09が両試行で合格したが、NET-A01の二方向目の移動/向きで失敗し、今回のジャンプ条件まで到達していない。先行するBの東移動後もBのカメラはyaw=0のままで、Aが西へ移ると視野外になっていた。最終poseはAのx=-0.44667、heading=-1.57080、screen.x=-1.08741、visible=false。retryでもAがx=.17591で既にscreen.x=-1.07477、visible=falseだった。直前の可視poseはheading=-.86499であり、必要な向きとの差0.25未満を満たさない。

試験の観測側カメラを通常の中ボタンドラッグ100 CSS pxで相手側へ0.6rad振り、移動とジャンプの実pixelを観測する。移動がカメラ相対なので、各方向の観測後は逆ドラッグで元のyawへ戻したことも要求し、次のactor/地形試験へ渡す。非表示の視点リセットを強制クリックせず、teleport・合成snapshot・GPU結果注入は使わない。移動0.35m超、heading差0.25未満、上昇0.15m超、接地までのFIFO結果を最大15秒待つ条件と保護領域の配置拒否は維持する。

投入拒否/同一ID再送/UI結果分離、既存遅延helperとpreview保持の関連22単体試験、型検査に合格。新しいカメラ操作と公開経路のブラウザ合格は次のCI待ち。環境の既知のChromium起動EPERMを回避して実行したとは記録しない。

## 2a1debf1の公開合格とローカル掘削面の遮蔽（2026-10-06）

[CI run 37393247103](https://github.com/usks213/threejs-game/actions/runs/37393247103) の2a1debf1公開2browserは6ケース合格。共有操作、相互移動/向き/ジャンプの実pixel、地形の低い面と接触、再入室後の同じ床への着地、切断復帰と遅い参加まで通過した。[公開証拠](https://github.com/usks213/threejs-game/actions/runs/37393247103/artifacts/11383020654) を使用する。

一方、同じソースの[ローカル試験](https://github.com/usks213/threejs-game/actions/runs/37393247103/job/112043893817) は4合格・1失敗・1skip。[trace/画面](https://github.com/usks213/threejs-game/actions/runs/37393247103/artifacts/11383280007) では両試行とも箱の競合/回収と相互の空中pixelまで合格した。掘削の成功ACK、編集の伝播、Bが穴へ歩き、低い位置で接地するところも通過したが、地形の照準targetがnullだった。公開合格でこの失敗を隠さない。

Bのカメラはpitch1.2・yawほぼ0まで実際に下がっていた。Bの足元はy=-.0413（retryは-.1173）なのに、reticleTargetはy3.5819（retryは3.7256）で止まり、画面には穴の東側の大きな崩落片が見える。元の地形面へ向くrayの手前にある実体を、productionの遮蔽処理が正しく優先した結果だった。

記録された掘削位置を使うソース回帰では実際の採掘処理から20個のfragmentが生まれる。productionの球体/接触規則で静止させ、実field-terrainのrayとreticle遮蔽を使うと、元のyaw0はy3.5684のfragmentに遮られる。通常の中ボタンドラッグ2回に相当するyaw3.12では、両方の記録された接地位置から、遮蔽のない低い地形面へ当たることを確認した。このソース再現を新しいブラウザ合格には数えない。

browser試験は最初の視点で実際に低い掘削面が見えた場合、その成功経路を維持する。見えない場合だけ中ボタンドラッグ2回で反対側から覗き、実際のcamera yaw更新を待つ。fragmentの削除・不可視化・遮蔽の無視はせず、terrain targetが編集前より0.3m低いこと、編集中心から2.3m以内、権威の接地と0.4m以上の落差、再入室後の同じ床への通常ジャンプ/着地という元の条件をすべて保持する。最初のtargetと視点変更の有無も証拠JSONへ残す。

変更後は型検査、掘削の遮蔽再現と既存camera/field-renderingの関連20単体試験、6browserケースのdiscoveryが合格。追加した反対側視点の実ブラウザ検証は次のCI待ち。

## 14459fe2の拾得物遮蔽と有限の視点探索（2026-10-06）

[CI run 37396450818](https://github.com/usks213/threejs-game/actions/runs/37396450818) の[公開trace/画面](https://github.com/usks213/threejs-game/actions/runs/37396450818/artifacts/11383414443) では、相互の実pixel・ジャンプまで通過したが、掘削面の照準で停止した。反対側へのドラッグ自体は完了し、camera yaw=3.12、pitch=1.2だった。しかし `data-interaction=r:3000425`、画面の「石×5を拾う E」が示す通り、今度は実際の石のDropが地形の手前で交差していた。reticleTargetは(7.0864,.5854,5.5587)、terrain targetはnull。この低いreticleTargetを地形のhitと読み替えない。

直前のソース回帰はfragmentを静止させていたが、Dropを生成時の高さから落下させておらず、この後発の拾得物遮蔽を再現できていなかった。新しい回帰は `stepDrops` も使い、両方の記録された採掘位置でfragmentと石を落ち着かせる。公開失敗のyaw3.12では石の拾得判定がy.5848で交差することを再現し、別の実カメラ方向では遮蔽のない低いfield-terrainの面があることを確認した。Dropの存在や接触を無効にした結果ではない。

[ホストtrace](https://github.com/usks213/threejs-game/actions/runs/37396450818/artifacts/11383620862) の初回は、最初の地形観測を通過した後、再入室したepoch4のyawほぼ0でfragmentに遮られている。retryはepoch2の最初の観測で、yaw3.12の石の拾得物に遮られた。初回だけ直して再入室を未対処にしない。

固定した二方向だけで成功を仮定する方法を止め、通常の中ボタンドラッグで最大8方位×2段階の俯角（1.2/1.44rad）を調べる。各候補は要求したyaw/pitchへの到達、照準rayの同じpitch、その後の実描画回数の増加を要求する。その新しいrayに実terrain targetがあり、編集前の高さから0.3m以上低く、同じ掘削中心から2.3m未満である場合だけ採用する。最初に見えた有効な視点で終了し、16候補とも不適切なら失敗する。画面外・pickupだけのhit・無限遠・過去のrayを成功へ数えない。

同じ探索を、最初の低い接地を確認した後と、再入室して通常ジャンプ/着地を確認した後の両方で行う。fragment/Drop/保存状態の削除や変更、teleport、合成snapshotはない。権威の0.4m以上の落差、地形面の高さ/水平範囲、同じ床への復帰、ジャンプ0.15m超の元の条件は維持する。

成功時も失敗時も `terrain-collision-view-search.json` と `terrain-reentry-view-search.json` に、試した各視点の要求角度・実角度・時刻・描画回数・terrain ray・reticleTarget・interaction ID/表示名・新鮮な観測か・採用したかを残す。候補に届かない場合も、その要求と最後に観測できた状態を残す。

型検査と関連21単体試験、6browserケースのdiscoveryに合格。有限の視点探索を加えた実ブラウザの合格は次のCI待ちであり、過去2aの公開合格を新しいソースへ移し替えない。


## 公開6aa70935で強化した復帰受入の実行結果

[CI37399174801](https://github.com/usks213/threejs-game/actions/runs/37399174801) の公開/ローカル実2browserは各6/6、再試行0で成功。Bの全所持品と通常bag表示、B/Cの完全な編集履歴、同じ権威tickの全共有parts、既存箱のUI選択、地形の視線探索/再参加後の接地と新しい床hitを実行済み。公開artifact11385250050のJSONと画像を確認し、[識別子を省いた照合結果](../benchmarks/public-browser-6aa70935.json)を保存した。通常bagの4品/個数を画像でも確認した。共有箱のスクリーンショットは上側のpanelを写していたため、次の試験では選択欄を通常scrollで画面内へ表示する。6aaのUI選択/内容assertionは実際に合格したが、その画像だけで選択欄の見た目を証明しない。

NET-A05/06の旧「edit数だけ」という不足はこの実行で閉じた。NET-A07の実プロセス停止/復帰は別の固定ソース長時間証拠として引き続き区別する。最新公開版の4人30Hz、Worker最大メモリ、実Android/iPhone、全内容の実機視認/操作はこれらの成功とは別の未完了項目である。

## 54850caeローカルの復活直後の採掘拒否（2026-10-06）

[host job112070557244](https://github.com/usks213/threejs-game/actions/runs/37401531255/job/112070557244) の初回は拾得・創作・相互のGPU移動/ジャンプ・地形/再入室を合格した後、最終の切断復帰ケースで失敗した。[artifact11385981236](https://github.com/usks213/threejs-game/actions/runs/37401531255/artifacts/11385981236) のA traceとjob logを確認した。

- 02:03:27.281 UTC、実UIのdigは `(x=-.3314315752, y=1.1783135867, z=5.6891922901)` を送り、同じcommandIdのACKは02:03:27.363に「開始・復帰地点と案内標の小さな保護範囲には設置・地形編集できません」と明示拒否した。
- Aはメニューが開いた間にHP0になっていた。採掘click時には通常の復活が進み、本人位置は `(-6,1.2640,8)`、HP25だったが、camera rayは以前の東側の視点から追従中だった。traceの実targetはx=-.3314→-3.3393→-5.0594→-5.3437→-5.3907→-5.3994と推移し、最終的には-5.4へ収束した。
- 編集数は21のまま。Bの新しいwelcomeも21だった。今回の失敗は、受理後の崩落編集が増えたことや、完全履歴比較の不一致ではない。
- retryの採掘は収束した `(-5.4,1.1140923678,5.8075701842)` で成功した。Bの復帰inventory/全履歴/同tick部品/通常bag・創作UI、Cの新規参加/同tick部品/創作UIまで到達し、Cの選択欄の画像も残ったが、serial全体の再試行中にjob期限へ達した。retryの最終完走は未確認。公開548の6/6合格とこのローカル未完了を区別する。

試験はAをforegroundへ戻して通常メニューを閉じ、生存・接地・同じlocal epochの異なる実描画2回を確認する。本人位置と実terrain targetが各0.03m未満しか変わらなくなってから、一度だけ通常のdigボタンを押す。過渡的なcamera ray、同じcached draw、HP0、空中、無効targetを安定と数えない。正常な復活を待つだけで、HP・位置・地形・カメラを代入しない。

その一回のqueue receiptと同じcommandIdの権威ACKを要求し、拒否された場合は編集数を待つ前に正確な拒否理由で失敗する。待機中の有限な観測列と実送信内容/ACKを `browser-recovery-state.json` に追加する。保護範囲、操作頻度、B/Cの完全inventory/operation/同tick parts比較、通常UI検査は緩めていない。

`coop-recovery-aim.test.ts` は記録された過渡照準を除外し、収束後だけ受理待ちへ進むことを確認する。同じ記録座標へproduction保護判定を適用し、拒否された照準は保護内、収束後は保護外であることも検査する。新しい2単体と既存recovery/decoderを合わせた9単体が合格し、最終の描画番号検査追加後も2単体と型検査を再確認した。これはソース回帰であり、新たなブラウザ合格ではない。

## SAVE-03 全員退出後の通常UI再参加（2026-10-06、実行待ち）

最終の復帰ケースへ、Cと作成者Aの退出後に最後のBも通常の退出ボタンで離れ、同じ招待コード・同じ本人で再参加する検査を追加した。A/B/Cの実WebSocketがすべて閉じたこと、Bの個人世界が別のlocal epochで準備完了したことを待つ。ゲーム状態の代入・合成操作・追加の検査APIはない。

最後のsocketを閉じた後には保存完了ACKを受け取れない。固定秒数を「保存が終わった証明」にせず、60秒の一つのstep内で通常の退出→個人世界の復元→再参加を最大3回まで行う。保存と再参加が交差して同じ権威epochへ戻った場合も、そのwelcomeと完全状態比較を残す。公開Workerの合格には新しい権威epochを必須とし、最大回数または期限までに観測できなければ失敗のまま。追加の60秒はこの最終ケースだけに割り当て、既存ケースの待機・再試行数は増やしていない。

- 各welcomeで本人ID、全inventory、退出直前までに受信した全terrain operationを完全一致で比較する。以前の切断中に受理された履歴も全件含むことを先に確認する。
- 全部品のID・kind・material・mass・links・creator・shared・trial・anchored・loan・element・enabled・cargoMassを比較する。これは異なるtick間の永続的な構造/所有権比較である。位置/速度/回転、sleep、環境/動力、recall revisionは物理再開で変わり得るため同一とは要求せず、退出時に消えるlease/recallの復活は別途拒否する。従来のA/B/C同一epoch・同一tickにおける全parts完全一致をこの投影へ置き換えていない。
- 再参加後の権威tick進行、通常bagの全正数在庫、共有木箱のID・表示名・選択・grab有効状態を確認し、選択欄を画面内にscrollした画像を残す。
- 既存の `/coop/health` で公開先のSQLite Workerを確認し、通常heartbeatのpongから検証済み `timing.run` とI/O-clockの少数scalarだけを受動観測する。新epochとrun継続は同じDO内の再構築と整合するが、providerのeviction・instanceの同一性・heap解放を直接証明するものではない。追加のpingや内部inspect要求はない。
- Nodeのローカルauthorityは空のroomを保持する実装のため、ローカル結果は全員退出後の状態/UI復帰として記録し、storage cold reloadと称さない。公開先でWorkerのmarkerが欠けた場合はこのローカル条件へ降格せず失敗する。

各試行のwelcome、前後の完全観測/構造投影、全編集、bag行、timingを `browser-recovery-state.json` の `allLeaveRejoin` へ残す。型検査、recovery/decoder/aimの関連11単体、6browserケースのdiscoveryが合格した。実ブラウザおよび公開Workerでのこの新しい全員退出経路は未実行であり、次の対象commitのCI結果を待つ。
