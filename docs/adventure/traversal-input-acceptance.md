# MOVE-A01: 2人の登攀・水泳・岸上がり

2026-10-05 UTC。新規世界から短い実入力ルートを作り、既存の滑空/三層の本編runを繰り返さず、登攀と水泳の残る組合せを確認する。

## 通常操作から作る条件

- 開始時の共有の木12・石8を拾い、通常工作でハンマーを作る。木の壁と上の床を通常建築で設置する。
- 2人が別の位置から壁を向き、「登る」を使う。無入力では高さを保って掴まり、方向入力で両者とも0.48m上昇する。スタミナが減り、最後は実際の上の床へ乗り越える。
- 近くの地面を通常採掘し、通常放水で浅い池を作る。位置・地形・水セル・濡れ・スタミナ・登攀状態を試験から代入しない。
- 両者が同じ通常配信frameで `swimming=true` になるまで、実際の移動入力で入水位置を調整する。水中の移動後、実地形と水深から届く岸を選び、通常のジャンプ＋方向入力で0.8mの岸上がりを行う。5スタミナの消費と接地した出口を確認する。
- 開始物資の残りの石6から2部品を作り、接着する。一方のプレイヤーが通常の短命leaseで保持し、実際の水泳で濡れたもう1人が登る。約0.53m登ってから掴まり、事前の「間もなく」警告後に滑落する。交代して両者を確認する。固定anchorや濡れ状態は注入しない。
- 2回の保存・再起動を通す。両者とも生存する。

材料消費は通常のレシピによる。ハンマーが木3/石2、壁/床が各木2、石部品が各石3。ルート全体は1,134tick・21操作・5段階保存で、全物語や大規模な移動を再試験していない。

## 短い状態を正直に検証する

`scripts/playthrough-coop-websocket.ts` に、明示的な `traversal-observation` のread-only検査を追加した。

- 通常の3tick間隔の最新frameのみを使う。余分なシミュレーションtickやresyncを送らない。
- 接続中の両者を重複なく要求し、登攀/掴まり/水泳/息/材質/警告等の完全なtraversal snapshotとスタミナ・体力を厳密比較する。
- 不完全な観測、古いframe、不一致を失敗にする。transient flagを正規化して成功へ変えない。
- 個別strict TypeScriptと、81tick/56 snapshot・水比較の実2WebSocket smokeに合格した。

最初の全ソケット試行では、1,074tick・722比較の通信/保存は一致したが、swimの成立後に観測frameへ時刻を合わせた結果、短い状態を取り逃した。最終semantic verifierが `swimming=false` を検出したため、そのrunを水泳受入合格へ数えない。修正版は「両者が泳いでいる通常配信frame」の時点で停止して記録する。以前のreceiptは保持する。

最終trace SHA-256: `82629e815618e88659dc5a1103f259320dd421e8d379aa5243eb7ce565713332`。

## 最終の実2WebSocket結果

2026-10-05 14:02:12–14:03:25 UTCに完了。21操作ACK、1,134tick、5段階保存、2回の実サーバー再起動を通し、完全snapshot比較762件・水比較762件が一致した。失敗・未照合は0件。

12回の通常frame観測について、両者分24件の完全なtraversal状態・スタミナ・体力を厳密比較した。両者の `swimming=true` も同じ通常frameで確認した。観測のための追加tick/resyncと、transient状態の正規化は0件。木の掴まり/上昇と、石の事前警告/滑落のsemantic条件も合格した。

全5checkpointの部品・地形編集・全保存水・個人位置・持ち物/進行が一致した。個人セーブの秒数のみ、共有時計そのものかちょうど1/30秒先のcacheであることを検査して正規化し、生の差をreceiptへ保存した。共有時計は厳密一致で、登攀/水泳/警告等の観測へこの正規化を流用しない。

実行source hash: `486a72a852ffb5a5bdba28da374f8d6d57068d407dd06eacb45d80628658b943`。実時間の入室/input rate制限を修正した版を使い、そのguardを無効化していない。

ローカルreceipt: `/tmp/voxel-traversal-socket-02/summary.json` と `traversal-verification.json`。Source: `/tmp/voxel-traversal-source-13/trace.json` と `traversal-observations.json`。一時ファイルは公開済みartifactではなく、本書と再現scriptを追跡先として保持する。追加2scriptとrunnerのstrict TypeScript検査も合格した。

## 再現

```sh
TRAVERSAL_OUTPUT=/tmp/traversal-source node --import tsx scripts/traversal-coop-acceptance.ts
node --import tsx scripts/playthrough-coop-websocket.ts /tmp/traversal-source/trace.json /tmp/traversal-socket
node --import tsx scripts/verify-traversal-coop-replay.ts /tmp/traversal-source /tmp/traversal-socket
```

## この結果へ含めないもの

ブラウザのタッチ/キーボード、カメラ遮蔽、実GPU描画、Android/iPhone実機、RTT/損失条件は別の受入である。時間は決定的なゲームtickで進むが、実WebSocketの入室/入力rate制限は通常の実時間guardを維持する。
