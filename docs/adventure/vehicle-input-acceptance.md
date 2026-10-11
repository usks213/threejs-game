# 実入力で組み立てた2人乗り車両の受入

2026-10-05 UTC。MOVE-A01 / PHYS-A01 のうち、地上車両の制作・2人搭乗・走行・電力切れ・切断復帰を検証した。カテゴリ全体、公開ブラウザ、実機性能の合格ではない。

## 合格した範囲

- 新規のGenerator4世界から開始。開始時の共有物資、木12・石8・樹脂4を通常の拾得で獲得した。持ち物、座標、地形、部品、接着リンクへのfixture代入はない。
- 2人とも実際の歩行と天抜けで最初の空島へ到達。平らな実地形上に板1・席2・電池1・車輪4を、制作・掴む・接着・放すの通常操作だけで組み立てた。
- 車輪は板の外側に配置。既存の部品直接配置fixtureと異なり、8部品すべてが本番の配置衝突検査を通る。
- 木12・石8をちょうど消費。樹脂1を通常操作で電力25へ変換。
- 2人同時搭乗、操縦者は1人。乗客が逆方向の入力を送っても操縦者の前進が成立。推進器を含まない車輪車両で約0.967m前進した。
- 制動後に約0.256m後退。操舵で約0.243rad回転し、両者が席に追従した。席の通常衝突補正による約1cmの足元差を考慮し、座標誤差を1.5cm以内で各tick検査した。
- 追加の実入力だけで電力を消費。残量0.2となり、4輪を動かす次のtickの必要量約0.267に足りなくなると、全輪の動力が停止した。残量を直接0へ設定していない。
- 操縦者の実切断で残った乗客が操縦者へ切り替わる。再参加で古い搭乗権を復元せず、もう1人の通常降車が安全な床へ着地する。
- 自分の入力で獲得した保存からサーバープロセスを再起動し、8部品・電力・個人持ち物を保持した。

## 証跡と検証の層

`scripts/vehicle-coop-acceptance.ts` がSessionAuthorityに通常入力を送り、到達条件を検査したtraceを生成する。`scripts/playthrough-coop-websocket.ts` が新規世界から全入力を再生する。別Nodeプロセスの本番AuthorityRoomと、独立した2本の実WebSocketを使用する。

実ソケットrunは32操作ACK、1,189tick、6段階保存、サーバー再起動1回、切断/再参加各1回。正本とクライアント復元状態の完全snapshot比較796件、水比較796件がすべて一致し、失敗・未照合は0件だった。

`scripts/verify-vehicle-coop-replay.ts` は、trace hashとno-fixture/fresh-start receiptを検査し、6段階すべてでSessionの車両保存とソケット自身のcheckpointを厳密照合する。部品・接着・姿勢・速度・電力・設計状態と、両者のプレイヤー姿勢が一致した。認証済み公開IDとsource IDの対応だけを正規化する。

- ゲームsource hash: `31edb61b7f99abbfb51f08f1f2f38302f9a86b99963cc83e09a4be8067504a5f`
- 入力trace SHA-256: `7159fda42a894094eb1a920ae641723c7ed6961d19298e549251eb73bdf3b0fc`
- ローカルreceipt: `/tmp/voxel-vehicle-socket-01/summary.json`、`vehicle-verification.json`
- source traceと行動観測: `/tmp/voxel-vehicle-source-03/trace.json`、`vehicle-observations.json`
- 追加した2scriptの個別strict TypeScript検査: 合格。ゲームの変更はなく、同一ソースの全単体/buildを再実行していない。

これらの一時ファイルはGit管理された公開artifactではない。本書と再実行用scriptを再現経路として保持する。

## 再実行

未使用の出力先を指定する。

```sh
VEHICLE_OUTPUT=/tmp/vehicle-source node --import tsx scripts/vehicle-coop-acceptance.ts
node --import tsx scripts/playthrough-coop-websocket.ts /tmp/vehicle-source/trace.json /tmp/vehicle-socket
node --import tsx scripts/verify-vehicle-coop-replay.ts /tmp/vehicle-source /tmp/vehicle-socket
npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM --strict --skipLibCheck scripts/vehicle-coop-acceptance.ts scripts/verify-vehicle-coop-replay.ts
```

## 残る受入

- 自由に立った乗員の床追従、水上運搬、転倒と復元、荷重/素材を変えた比較、登攀と水泳はこのrunで扱っていない。
- 車両で長距離の地形を走破した証拠ではない。平らな空島の短い往復である。
- 時間は入力到着後の決定的tickで進める。本番30Hzの実時間速度、遅延/損失、Workersの128MB内運用を証明しない。
- Nodeクライアントの実通信であり、ブラウザの表示/タッチ/カメラ、Android/iPhone実機の性能、公開endpointの再受入とは分ける。
- 制作からのSession試行中に、最初の厳密な座標比較と固定40tickの後退比較が失敗した。通常の1cm足元補正と制動に要する時間を観測し、接触許容と有限の到達待ちへ変更した後に、新規開始の全traceを再取得した。ゲームソースの修正や入力状態の注入で通過させていない。
