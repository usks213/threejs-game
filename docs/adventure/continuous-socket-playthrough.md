# 連続協力プレイの実WebSocket検証

2026-10-05。新規ワールドからチュートリアル、七試練、三地域、全九記録、最終ボス、保存再起動まで、2本の実WebSocket接続で通過した。後日談3件と帰還碑の実設置は、別の新参加者による継続runで確認した。全18室の訪問、ブラウザ・実機操作は未確認として扱う。

## 最新の合格: 新規開始から最終ボス・最終保存

2026-10-05 11:55:26–12:10:20 UTC。4つの実入力source区間を獲得済みcheckpointで結合し、**全入力を空のワールドから実行**した。結合境界3回を含む10回の本物のプロセス再起動は、当該ソケットrun自身の保存だけを読み直した。

- 両者チュートリアル5段階・個別記録9件、共有試練7件、地域3件、道標4件、地域報告3件
- `echowarden`、`loadwarden`、`sailwarden`、`stormcore` を実攻撃で撃破
- 地下救助の途中でBを実切断・再参加。地上戦ではAの体力0・downedを保存し、Bの救助ACK後にAの体力19.45・downed解除を保存で確認
- 操作ACK228件、11,193 tick、段階保存23回、サーバー再起動10回、切断/再参加各1回
- snapshot完全照合7,415件、水照合7,415件。拒否・不一致・未照合・失敗は0件
- 全11サーバー世代で同一ゲームsource hashを確認

**訪問室はAが11/18、Bが9/18。全18室訪問とは扱わない。** 個別訪問IDはsummaryに記載。両者とも `routeBanner` / `echoMemorial` / `windChime` が解放済み。共有後日談は0/3、`routeMonument` は未解放であり、この本編runの完了範囲に含めない。

source hash: `38654e4f618f22e53fa28a11de4c9ceebc769b04871a7f0df0dd797ed7b6a81f`。

結合trace SHA-256: `80cecd109f0b26f0478407ad3bc80990c0c033367d1e821a1aec259cf58fe436`。

ローカル証跡は `/tmp/voxel-websocket-full-final/summary.json` と同ディレクトリのevents・23個のcheckpoint。source各区間・境界save・挿入restartのhashは `/tmp/voxel-continuous-composed-final/provenance.json`。最終世界の正規化JSON SHA-256は `b7961bb1daa68aca1b90815749583d5914b045d1ca62766ad003697ed51872b6`。後続試験はこの本編receiptを上書きしない。

## 合格済み: 本編の実保存から後日談・帰還碑へ

2026-10-05 12:22:16–12:25:46 UTC。前項の本編runが実際に残したcheckpointから、新しい2クライアントで継続した。**新規開始からの再走でも、元の2人の復帰でもない。** 互換saveを修正後の固定ソースで復元したことを明記する。

- 新参加者の初回持ち物は各 `ragTunic:1 / club:1 / glider:1 / berry:6`。個別記録・journalを引き継いでいない
- 残っていた実Dropの結晶と案内人の銀貨を採集し、正規の取引・制作で材料とハンマーを得た
- 地表・地下・空の後日談3件を実行。`routeMonument` を解放し、ID `3000745` を支持のある位置 X5/Y1.623864/Z10 に実設置
- 最後の本物の保存再起動後も碑が存在し、health 99.872を確認
- 操作32件、2,735 tick、段階保存4回、切断/再参加各1回、サーバー再起動1回
- snapshot/水の完全照合各919件。拒否・不一致・失敗は0件
- `preservedOriginalMembers:2`。元の2人の持ち物・装備lot・個別進行・試練/地域journalを最終checkpointで同一確認。元の個別記録は各9件、新参加者は各0件
- 共有の後日談完了により、元の2人と新参加者の全員に帰還碑が解放。元のroom訪問数11/9はそのままで、18室訪問の代用にしない

復元元checkpoint SHA-256: `aa20b90f7642f5b1bc5dd239c7e2c6ba357c53f8cb35e21646c7fa2f8153be7a`。world SHA-256は前項の `b7961bb1…` と同一。

旧本編source hash: `38654e4f618f22e53fa28a11de4c9ceebc769b04871a7f0df0dd797ed7b6a81f`。

継続runの固定source hash: `31edb61b7f99abbfb51f08f1f2f38302f9a86b99963cc83e09a4be8067504a5f`。2つのサーバー世代とも一致。旧本編run全体をこの新ソースで再走したとは扱わない。

tail trace SHA-256: `48b156a0c5a5d0a7ca9c6b05ddd55ac87a28b68260d77c5d88db5c029f809ba7`。

証跡: `/tmp/voxel-websocket-epilogue-final/summary.json` と同ディレクトリのevents・checkpoint。sourceは `/tmp/voxel-epilogue-socket-source/trace.json`。本編summaryのhash `a286cd072366ce6acc465cccdcb01f7ae12f0dac23fa43ef37588d3ae82585f2` は継続後も変わっていない。

## 検証方法

- `scripts/playthrough-coop.ts` の実入力ルートをtraceへ記録し、`scripts/playthrough-coop-websocket.ts` で再生する。
- クライアント2人と `scripts/playthrough-coop-socket-server.ts` の別Nodeプロセスが、実際のloopback WebSocketで通信する。
- サーバーは本体と共通の `AuthorityRoom`、認証、protocol 7、入力、操作ACK、差分snapshot、水差分、受信確認を使用する。操作の地形revision・部品epochはクライアントが受け取ったsnapshotから指定する。
- テスト専用IPCは、入力受信後の1 tick進行、保存、停止の制御に限定する。位置・素材・敵・攻略状態を設定する操作はない。既定の本編runはtrace内のsaveを投入せず、新規ワールドから始める。明示的な継続modeは、合格済みソケットrun自身の保存だけを使う。
- 各welcome/frameで、クライアントが復元したsnapshot全体と水辞書のSHA-256を、送信時の正本と照合する。
- 各checkpointは、その時点の位置・持ち物・個別進行・共有試練・地域達成・撃破記録を入力ルートと照合する。
- 再起動は、実操作で得たcheckpointを検証・ディスクへ同期保存し、サーバープロセスを終了して、新プロセスで読み直す。復帰能力の秘密値はログ・保存へ出力しない。
- 最新harnessは `src/**/*.ts` とpackage定義のsource hashを全サーバー世代で照合し、再起動の間にゲームソースが変わった場合は停止する。

## 実行例

七試練までの入力traceを新規作成する。

```sh
node --import tsx --input-type=module -e 'import {ContinuousCoopJourney} from "./scripts/playthrough-coop.ts"; const j=new ContinuousCoopJourney("/tmp/coop-route-source"); try { j.tutorial(); j.surfaceTrials(); j.skyTrials(); j.depthTrials(); j.event("route-complete",{scope:"tutorial-and-seven-trials"}); } finally { j.flush(); }'
```

上のコマンドが成功したtraceを、未使用の出力先で再生する。既存checkpointがある出力先は新規開始の証拠に使えないため拒否される。

```sh
node --import tsx scripts/playthrough-coop-websocket.ts /tmp/coop-route-source/trace.json /tmp/coop-route-socket
```

`summary.json`、`events.jsonl`、段階別の `.checkpoint.json`、実際のサーバー保存が出力される。`completed-source-route` は「渡したtraceの範囲を通過」の意味で、ゲーム全体の完成判定ではない。完全攻略traceが完成した際も、同じコマンドへそのtraceを渡す。

socket/composer/epilogue scriptsは個別にstrict確認する。主ルートdriverは単体テストからのimportでも型検査される。

```sh
npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM --strict --skipLibCheck scripts/playthrough-coop-websocket.ts scripts/playthrough-coop-socket-server.ts scripts/playthrough-coop-compose.ts scripts/playthrough-coop-epilogue.ts
```

## 獲得済みcheckpointで分割したルートの結合

長いルートを実操作で獲得したsaveから続行して解く場合は、`scripts/playthrough-coop-compose.ts` で経緯を残して結合する。manifest例:

```json
{"segments":[{"trace":"/tmp/fresh/trace.json","through":"earned-checkpoint"},{"trace":"/tmp/continuation/trace.json"}]}
```

```sh
node --import tsx scripts/playthrough-coop-compose.ts /tmp/segments.json /tmp/composed-route
node --import tsx scripts/playthrough-coop-websocket.ts /tmp/composed-route/trace.json /tmp/composed-socket /tmp/composed-route/provenance.json
```

各境界は元traceの実checkpointとsaveの位置・持ち物・進行が一致し、次のtraceがその同じsaveを参照している必要がある。元trace・採用区間・境界save・結合traceのSHA-256と省略区間を記録する。新しいsource traceは、読み込んだsaveの `resumeSha256` も開始時に記録する。旧traceにこの値がなければ、当時のhashまで検証したとは扱わない。

最後の区間が `route-complete` で終了し、採用区間に失敗・拒否イベントがなければ結合できる。続行traceの開始イベントだけを、本物のサーバー再起動に置き換える。ソケット側は最初の全入力から実行し、境界で自分が獲得したsaveだけを保存・再読込する。source saveの投入や世界状態の置換は行わない。

最終summaryには、実際の自前checkpointから各プレイヤーの訪問room ID・件数・記録・解放装飾、共有の地域報告と後日談を保存する。18室の存在や最終ボス撃破だけを、18室訪問・全後日談完了の代用にしない。

### 本編後の別クライアント継続

明示的な `--continue-from-replay COMPLETED_RUN` は、合格済み本編ソケットrunの自身のcheckpointに限って別出力へ複製し、新しい2人で続ける。既定の新規開始チェックはそのまま。完了receipt、最終ボス記録、source hash、sourceが実際に読んだworldのhashを照合する。任意のsource saveを投入する機能ではない。

```sh
node --import tsx scripts/playthrough-coop-websocket.ts /tmp/late-join-source/trace.json /tmp/late-join-socket --continue-from-replay /tmp/voxel-websocket-full-final
```

互換saveを修正後ソースで復元する場合は、明示的な `--continuation-source-hash NEW_SHA256` を追加する。基点の旧source hashと実行する新source hashを両方記録し、全世代が指定した新hashに一致することを要求する。元の本編runを新ソースで通過したと書き換えない。

新参加者は自分の初期持ち物・記録から始まり、元の2人の秘密の復帰能力を保存・再利用しない。初回welcomeの持ち物と空の個別進行を保存する。終了後の実checkpointで、元参加者全員の個別持ち物・装備lot・進行・試練/地域journalが基点と一致することを要求し、`preservedOriginalMembers` に確認数を記録する。summaryの `continuation` に基点receipt・checkpoint・worldのhashと元参加者の公開ID、`freshStart:false` を明記する。この継続結果を元の2人の個別進行や新規開始の証明と混同しない。

## 合格済み: 新規開始から七試練

実行時刻: 2026-10-05 11:24:33–11:28:01 UTC。ゲームのGit基点は `fdda94bcaac7af55d9cde634f6e0b91bfe846791`。実行当時、ゲームの `src` に未commit変更はなかった。

- 2人とも歩行・採掘・組立・救助練習のチュートリアルを完了
- 重さ・回路・天抜け・運搬・上昇気流・熱と水・帰り石の七試練を達成
- 地表・空・地下の3道標を起動。空への天抜け、滑空での上昇気流、東の大穴からの下降、通常の帰還操作を使用
- 操作ACK 70件、simulation 3,363 tick、正本とのsnapshot照合2,250件、水照合2,250件
- 段階保存9回、サーバープロセスの保存・再起動3回
- 不一致・未照合snapshot・失敗は0件

到達checkpoint:

1. `tutorial-and-first-beacon`
2. `trial-weight`
3. `trial-circuit`
4. `three-surface-trials`
5. `trial-carry`
6. `five-trials-sky-return`
7. `depth-beacon`
8. `trial-heat-water`
9. `seven-trials-three-layers`

trace SHA-256: `6ed2c340082eb69f87eaecd6b70315dcd40c61648daa2f659ab4c191f17ccdbe`。

source hash: `85f1ec7a0929199fc814ef7c7133e16610acb4a39c9e8330ef3016c0bf1aaa4a`。初回runではhash記録を途中導入したため、実記録があるのはサーバー第3・第4世代のみ。第1・第2世代のhash照合まで成功したとは扱わない。後続の全通しrunは最初からhash照合する。

ローカル証跡: `/tmp/voxel-websocket-route-1/summary.json` と同ディレクトリの `events.jsonl`・9つのcheckpoint。入力traceは `/tmp/voxel-continuous-clean/trace.json`。一時ファイルであり、Gitに含まれる公開artifactではない。

## 合格済み: 切断・復帰の短い別run

実行時刻: 2026-10-05 11:29:19–11:29:29 UTC。新規ワールドから入力・装備操作だけで作った別traceを使用した。

- 実WebSocket切断1回、同じ公開player IDでの再参加1回
- サーバープロセス再起動1回、復帰後の操作ACKを確認
- 操作4件、144 tick、段階保存3回、snapshot/水照合各95件
- 失敗・未照合は0件。全サーバー世代のsource hash一致を確認

trace SHA-256: `2877f47c160943f9503225f61322ea96914bd3f74863f6a89488be4bb789d64f`。

source hash: `85f1ec7a0929199fc814ef7c7133e16610acb4a39c9e8330ef3016c0bf1aaa4a`。

ローカル証跡: `/tmp/voxel-websocket-lifecycle-1/summary.json`。`leave {player}` / `rejoin {player}` の再生、接続中メンバーの照合、再参加後の操作連番を確認済み。救助先はtraceの論理player IDから認証済み公開IDへ対応付けるが、本物の協力救助は完全攻略traceで別途検証する。

## 次周・復旧記録と残る室訪問の評価

`QUEST-A01` の主導線（導入→七試練→三地域目標→最終目標、途中の保存再開、人数減少中の続行）は本編runで確認した。6室×3地域の全室中心への立入りは必須主導線の条件ではなく、任意探索の到達確認としてA11/18・B9/18をそのまま残す。18室の全訪問や全画面品質を合格扱いにしない。

次周回は個人ワールドの操作であり、共有サーバーのリセット操作ではない。`src/ui/persistence.ts` は共有参加中の次周開始を拒否し、個人ワールドで説明・確定・取消を経て保存処理へ進む。`prepareNextAdventureCycle` は旧ワールドを変更せず新しい個人用saveを作り、記録・装飾・競走最高記録をheritageへ残す。`SaveRepository.import` は旧保存の保護と置換を一つのcommitにまとめる。

既存の `tests/unit/adventure-progression.test.ts` は旧保存の非破壊、次周内容、archive失敗時の旧保存保持と成功時の原子的保護を検査する。`tests/e2e/adventure-progression.spec.ts` のAndroid設定ブラウザケースは、終幕fixtureから確認文・取消・Escape・確定・メニュー閉鎖・新ワールド起動・引継ぎ表示を検査し、公開 `19af8321238718bf646bc9e51094d7b1a963ee8e` の既存合格記録に属する。これは実Android端末の証拠でも、今回の共有ワールドを次周化した証拠でもない。該当UI経路を変更していないため、この調査では同じブラウザケースを再実行していない。

## 証跡の保全

本編・後日談のsummary、events、制御trace、結合provenance、獲得済みcheckpointは `/workspace/shared/pr5-continuous-acceptance-20261005-1229` にハッシュ照合済みで保全した。`MANIFEST.json` は元パス、複製パス、byte数、SHA-256を記録する。manifest SHA-256: `b73aa0fc509041431c057c79b95265be82e4a5fa05245b0b91efbe08fa48dd63`。復帰秘密値は含まず、生成save/checkpointは非公開の試験資料として扱い、Gitへ追加・公開しない。

## 未確認・対象外

- IPCによる決定的なtick制御であり、本番30Hzの実時間スケジューリング、負荷、帯域遅延の試験ではない。既存の15分間の実時間soakとは別の証拠。
- Nodeクライアントであり、ブラウザのタッチ・キーボード・描画・UIの検証ではない。Chromiumの起動は行っていない。
- Android/iPhone実機性能、外部ネットワーク、NAT/TURN、公開Workerの実接続を証明しない。
- 旧・七試練のみrunは地域攻略・最終章を含まない。上記の完全本編run・後日談継続runと範囲を区別する。ゲーム本体の変更後に旧receiptを新ソースの検証結果として使い回さない。
