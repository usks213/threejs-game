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

この追加だけでは再入室後の同じ穴への再歩行まで合格とはしない。既存の切断中追加編集・復帰・新context参加は編集数を確認し、全state/保存の一致は別の実WebSocket試験が担当する。

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
| NET-A04 | 今回の地形operation一致、穴への歩行/接地、renderer ray、画像 | 新ケースCI。再入室後の穴への再歩行は未追加 |
| NET-A05/06 | 公開UIの切断中追加編集・同一ID復帰・独立新context参加。実WSの完全state比較 | 公開UIでは在庫/全物体までの完全比較を主張しない |
| NET-A07 | 保存checkpointからの実サーバープロセス再起動と完全state/水/進行一致 | 公開Workerの任意強制停止をブラウザから実施した証拠はない |
| NET-A08 | 新規の実endpoint拒否/復帰UIケース。既存protocol/room-access試験 | 新ケースCI。ネットワーク到達不能のTCP障害はoffline条件と同一視しない |
| NET-A09 | `coop-impaired-network.test.ts` の150ms RTT・遅延/損失境界、実WS長時間試験 | 150ms条件の公開2ブラウザ描画操作は未確認 |
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
