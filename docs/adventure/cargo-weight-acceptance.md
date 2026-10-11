# PHYS-A01: 実際の積荷による重量差

2026-10-05 UTC。新規世界から実操作で獲得した車両のcheckpointを使い、空荷・積載・荷下ろし後で、同じ物体への同じ操作を比較した。`vehicle-input-acceptance.md` と `standing-deck-water-acceptance.md` の既存receiptは保持する。

## 準備も通常操作で行う

- 既存車両の電池を解体して木4、石の車輪4個を解体して石8を地面へ戻し、通常の拾得で回収。
- 回収した木4で収納を制作し、既存の板・席2個へ接着。空荷の構造物は4部品・ゲーム内質量24。
- 作成者が収納を共有し、通常の預入で石8を入れる。荷重16が収納に加わり、総質量40となる。
- もう1人が通常の取出操作で石8を受け取ると、総質量24に戻る。質量・在庫・速度・座標を試験から直接代入していない。

## 比較結果

各比較の前に、実際の「掴む→姿勢を起こす→移動」操作で、同じ構造・向き・発射位置へ戻す。空荷/積載とも上限60になる同じ投擲入力を使用した。部品位置/Quaternionの最大差は約2.49e-14で、1e-8以内という条件を満たした。

| 状態 | 総質量 | 操作直後の速度 | 衝突のない4tick後の重心の水平移動 |
|---|---:|---:|---:|
| 空荷 | 24 | 2.5m/s | 0.3291977438m |
| 石8を積載 | 40 | 1.5m/s | 0.1975186463m |
| 仲間が石8を取り出した後 | 24 | 2.5m/s | 0.3291977438m |

積載時の速度・移動量は空荷の0.6倍となり、同じ力積に対する質量の逆比24/40に一致した。荷下ろし後は空荷の応答へ戻った。全比較でauthorityの接触数が0であることを各tick検査し、衝突や地形摩擦の差を重量差へ混ぜない。

両者のsnapshotに共有収納の石8が一致して見える。2人の所持品と収納の合計は常に石8で、最後は取出操作をしたBが全8個を持つ。保存・再起動後も維持した。

## 証拠の層

`scripts/vehicle-cargo-mass-acceptance.ts` のSession入力区間は303tick・40操作・4段階保存・再起動1回で合格。材料fixtureはなく、獲得済み車両saveを継続した。単なる質量関数への任意値代入ではない。

- ゲームsource hash: `4f75eff6ae783f392a9c896c3b1a0d1e0167b379082dc78bdbdc3b97fd2e165c`
- 重量比較source trace: `8007ffa171fc84dde0b27be840bbc9f2bf0af96a527d30e3f46b0a771a42881e`
- 新規開始の車両区間と結合したtrace: `59ed513bbc910a0b7dd5fd6c51740fe02d1559114dfa9cf78c691445199ffa7f`
- 個別strict TypeScript検査: 合格。ゲームsource/packageは変更せず、全単体/buildを重複実行していない。

## 新規世界からの実2WebSocket結果

2026-10-05 13:14:28–13:15:59 UTCに完了。車両を作る入力から再生し、72操作ACK、1,492tick、10段階保存、2回の実サーバー再起動を通した。完全snapshot比較1,000件、水比較1,000件がすべて一致し、失敗・未照合は0件。

`verify-cargo-mass-replay.ts` は凍結済みの正本checkpoint比較を再利用し、10段階の部品・地形・水・個人状態を検査する。実ソケットcheckpointでの4tick後の前進速度も、空荷2.4504966833、積載1.4702980100、荷下ろし後2.4504966833となり、比率0.6と元の応答への復帰を確認した。

個人時計の表現差は、`standing-deck-water-acceptance.md` と同じ厳密な条件で扱う。共有時計の一致を必須とし、個人時計が共有時刻と同じ、またはちょうど1/30秒先のどちらかであることを確認してから正規化する。8件の生の差をreceiptに残した。それ以外の個人状態は厳密比較する。

ローカルreceipt: `/tmp/voxel-cargo-mass-socket-01/summary.json`、`cargo-mass-verification.json`。結合経緯: `/tmp/voxel-cargo-mass-composed-01/provenance.json`。一時ファイルであり公開済みartifactとは扱わない。

## 再現と制限

```sh
VEHICLE_RESUME=/path/to/earned/vehicle-restart.save.json VEHICLE_OUTPUT=/tmp/cargo-mass-source node --import tsx scripts/vehicle-cargo-mass-acceptance.ts
```

ソケットreplay後は `scripts/verify-cargo-mass-replay.ts COMPOSED_DIRECTORY REPLAY_DIRECTORY` で照合する。

上のsaveは `scripts/vehicle-coop-acceptance.ts` の通常操作で獲得したものを使用する。結合replayでは空の世界から全入力を送り、source saveを注入せず、自身が獲得したcheckpointだけを再起動時に読む。

これは短い空中運動での重量差の受入。積荷を増やした浮力/沈み込み、長距離運転、実時間負荷、公開ブラウザ、スマートフォン実機をこの結果から合格扱いしない。
