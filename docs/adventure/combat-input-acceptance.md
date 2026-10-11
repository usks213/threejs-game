# 協力戦闘の実入力受入

2026-10-05 UTC。新規世界で獲得した盾・弓・矢を使い、通常ガード、時間を合わせたパリィ、回避、溜め近接攻撃、別参加者の射撃、地面の戦利品回収、保存再起動を確認した。本番SessionAuthorityへの入力を、別Nodeプロセスの本番AuthorityRoomと独立した2本の実WebSocketで再生した。ゲームソースは変更していない。

## 確認できた操作

- Aが共有物資の木12・石8・樹脂4と、実在する落ち枝2か所から木6を拾う。盾、粗末な弓、木の矢12本を制作し、木16・石1・樹脂4を支払う。座標・所持品・敵・体力の代入はない。
- Aが弓と矢を地面へ落とし、Bが拾って装備。Aは盾と初期所持の棍棒を使う。Bへの装備移転も通常のDropと拾得による。
- Aが東の実在する石の番人へ歩いて近づく。自然な予備動作の早い段階から盾を保持し、基本威力12の攻撃を盾と防具で5ダメージへ軽減。体力25→20、スタミナ50→45.2、盾耐久200→199。早い保持ガードではパリィの怯みが発生しない。
- 次の攻撃の予備動作中に横回避。スタミナ50→28、実際の横移動約1.6m、体力20を維持。敵の攻撃が解決した時点の回避残り時間は0.28秒。移動と回避時間の両方があるため、静止状態の無敵時間だけを独立検証したとは扱わない。
- 次の自然な攻撃へ、残り予備動作約0.117秒で盾を上げる。体力20→18、スタミナ50→45.2、攻撃した敵に実際の2秒の怯み。パリィでも完全無傷になるという判定ではない。
- 敵の怯み中に45tickかけて100%溜め、実際に放す。強攻撃の接触で敵体力48→約8.20011、Aのスタミナ50→39.2。敵の位置や体力は変更していない。
- Bが約6.74m離れた場所から弓を発射し、実飛翔体が命中して同じ敵を倒す。矢12→11、弓耐久50→49。AとBの攻撃は別の認証済み接続から届く。
- 石3・鉄1・硬貨2がまず地面Dropになる。倒した時点のBの在庫へ鉄・硬貨を直接付与しないことを独立比較でも確認。Bが歩いて拾った後、所持品へ正確な数量が移る。
- 両者が通常の安全帰還を使い、獲得した保存からサーバープロセスを実際に再起動。装備・所持品・戦利品を保持して再参加する。

## 証跡

- 成功操作30回、入力1,130tick、7保存checkpoint、実サーバー再起動1回
- 実WebSocketの全snapshot比較756件・水比較756件。拒否・失敗・未照合0件
- 最終ソケットrunは約60.9秒。決定的な入力時計の機能検証であり、実時間30Hz負荷の証明ではない
- game source hash: `4f75eff6ae783f392a9c896c3b1a0d1e0167b379082dc78bdbdc3b97fd2e165c`
- trace SHA-256: `59182c3bb0261b64605d4fa01e9c55ea29d019fea87c859b98fa05fd212909c6`
- summary SHA-256: `003d44b4d1a5a0c2c220487472260d7227069f102dbb4819b2bc1211e5d3ace0`
- source: `/tmp/voxel-combat-source-05/trace.json`、`combat-observations.json`、`*.save.json`
- socket: `/tmp/voxel-combat-socket-03/summary.json`、`events.jsonl`、`*.checkpoint.json`
- 独立比較: `/tmp/voxel-combat-socket-03/combat-verification.json`
- 追加した2scriptの個別strict TypeScript検査: 合格

一時ファイルはGit管理された公開artifactではない。再現できる入力script、独立比較script、本書を残す。ゲーム変更がないため、全単体試験・buildの重複実行はしていない。GitHub CI、push、公開、課金・設定変更はこの受入では行っていない。

## 独立比較と観測の注意点

`scripts/combat-coop-acceptance.ts` は既存ContinuousCoopJourneyを利用する。すべてのゲーム操作は通常のinput/action。ソース側も、本番サーバーと同じ通常の3tickごとのframe viewと参加時のviewを観測する。

初期の比較では、viewを省略したsolverの個人時刻cacheと、敵を倒した後の復活予定時刻が、実ソケットより1/30秒進むことを検出した。`SessionAuthority.withActor` がview/actionの前に共有時刻を個人cacheへコピーし、`stepPersonal` が1tick進めるためである。ゲームを変更したり比較対象から敵のタイマーを除外したりせず、solverへ通常frame観測を追加し、新規世界から再取得した。前の試行と失敗ログも保持している。

最終版の `scripts/verify-combat-coop-replay.ts` は、認証IDへの対応だけを正規化し、7checkpointすべてで以下を厳密比較する。

- 共有の全敵状態と全資源/Drop状態。敵の体力、怯み、復活予定時刻も含む
- 両者の完全な保存姿勢と個人adventure全体。体力、スタミナ、装備個体、耐久、在庫、進行、状態異常、個人時刻も含む
- 共有world時刻

時刻の誤差許容・フィールド除外はない。さらにソケット自身のcheckpointから、盾の被ダメージ/支払、回避の移動/体力/支払、パリィの怯み、溜め攻撃の体力減少、矢の消費/弓耐久、拾得前の地面報酬と拾得後の在庫を再検査する。

観測JSONは保存時点で複製し、後の拾得で以前のDrop数量が書き換わらない。入力traceを実ソケットへ送るだけで、sourceの保存をソケットへ読み込ませる経路はない。再起動は当該ソケットrunが自身で獲得・保存したcheckpointだけを使う。

## 残る範囲

これはCOMBAT-A01の追加の部分受入であり、項目全体の完了ではない。

- 独立ブラウザ画面、タッチ操作、公開回線、Android/iPhone実機、性能は未検証
- この経路の判定対象は実在する石の番人1体。複数敵の同時戦闘を網羅しない
- 大型敵、蘇生、戦闘中切断と報酬分配の組合せは本経路の対象外。既存の連続攻略証拠とは区別する
- 全武器、全属性、盾の破損/スタミナ不足、溜め解除/被弾中断などの全variantは網羅しない

## 再現

未使用の出力先を指定する。

```sh
COMBAT_OUTPUT=/tmp/combat-source node --import tsx scripts/combat-coop-acceptance.ts
node --import tsx scripts/playthrough-coop-websocket.ts /tmp/combat-source/trace.json /tmp/combat-socket
node --import tsx scripts/verify-combat-coop-replay.ts /tmp/combat-source /tmp/combat-socket
./node_modules/.bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck scripts/combat-coop-acceptance.ts scripts/verify-combat-coop-replay.ts
```
