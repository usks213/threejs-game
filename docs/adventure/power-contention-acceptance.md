# 能力の競合・出口再検査の実入力受入

2026-10-05 UTC。POWER-A02の逆再生中の競合と、確認後に塞がれた上昇出口の安全な拒否を、新規世界から2人の通常入力で検証した。ゲームソース変更なし。CI・公開の成功を示す記録ではない。

## 実際に行った操作

- 共有の木12個を拾い、木の梁2本を各2個で制作、掴む・接着・移動・放すを実行。残りは木8個。座標、持ち物、接着、物理状態へのfixture代入はない。
- 梁は通常の重力で高さ4.125mから約1.386mまで落下。記録された実際の軌跡をAが逆再生した。
- 逆再生中にBが掴もうとして「別の冒険者が操作しています」で拒否。続くA自身の掴む操作も「軌跡を戻している途中です」で拒否。両方を実際のwire ACKで確認した。
- 逆再生が自然に完了した後、Bが梁を掴み直して放した。保存内の2部品の逆再生距離は約2.063m、1.900m。木8個を保持。
- 2人が徒歩で試練825007へ移動し、通常の試練リセットで貸出床を出した。Bは天抜けの確認・確定で約3.5m上の床へ移動し、床端へ歩いた。Aは下の床で空いている出口を確認した。
- 90tickの確認期限内に、Bが上の床を歩いてAの出口へ入った。Aの確定は「出口が変わりました。もう一度確認してください」で拒否。Aは下の床に留まり、資源を失わず、古いpreviewが消えた。
- Bが横へ退いた後、Aは確認をやり直して上昇に成功。両者が上の床に接地した状態を保存し、その実ソケットrun自身の保存からサーバーを再起動した。

## 実ソケットと照合

`scripts/power-contention-acceptance.ts` がSessionAuthorityで取得した同じ入力を、`scripts/playthrough-coop-websocket.ts` が空の世界から独立した2つのWebSocketで再生した。比較用source保存をサーバーへ読み込んでいない。

- 成功操作18回、意図した拒否3回、入力604tick
- checkpoint4段階、実サーバープロセス再起動1回
- 完全snapshot406回、水状態406回が正本と一致。未照合・失敗0
- 各拒否は同tickの正本在庫・装備・部品・設計・Drop・地形・ID割当が不変。両クライアントの次の通常frameでも支払済み状態を確認。追加simulation tickなし
- 実行wall time約40.74秒。IPCで制御した30Hzの決定的clockを使うため、本番wall-clock負荷や端末FPSの測定ではない

`scripts/verify-power-contention-replay.ts` は4段階の全skybound、姿勢、地形編集、全保存水、個人adventureをsourceと照合する。共有world時刻は厳密一致。個人保存には、Bの省略されたslotLimitと既定値32、別checkpointのBの共有時刻cacheと1/30秒進んだcacheの2件だけ表現差があった。既知の範囲を先に検査し、コピー内のその2フィールドのみ正規化する。在庫・装備・体力・進行などは除外しない。receiptにraw値と `rawStrictMatch:false` を残す。

## 証跡

- runtime source SHA-256: `4f75eff6ae783f392a9c896c3b1a0d1e0167b379082dc78bdbdc3b97fd2e165c`
- source trace: `/tmp/voxel-power-contention-source-01/trace.json`
- trace SHA-256: `68cc4b0cb3f86152f5ebe5baba00fa5d525d90e8b65574961f97743a7184ca8d`
- socket receipt: `/tmp/voxel-power-contention-socket-final/summary.json`
- receipt SHA-256: `6ff39b7d56fbfa1906c09baa27d789a99377c7cddb7020e6fcd88143c28f484f`
- checkpoint比較: 同ディレクトリの `power-contention-verification.json`
- 比較receipt SHA-256: `b183e1cd9d34ddeef3d88f77a34d1bd015f85c86ed7d935c0af639f9fbf32fa6`
- source/replay/verifierの個別strict TypeScript確認: 合格

保存とreceiptは検証用の非公開artifactでありGitへ追加しない。検証scriptと再現手順を保持する。

## 再実行・範囲

未使用の出力先を指定する。

```sh
POWER_CONTENTION_OUTPUT=/tmp/power-source node --import tsx scripts/power-contention-acceptance.ts
node --import tsx scripts/playthrough-coop-websocket.ts /tmp/power-source/trace.json /tmp/power-socket --allow-expected-rejections
node --import tsx scripts/verify-power-contention-replay.ts /tmp/power-source /tmp/power-socket
npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM --strict --skipLibCheck scripts/power-contention-acceptance.ts scripts/verify-power-contention-replay.ts
```

この経路は能力競合・出口占有・失敗時の資源保全を扱う。合成の全素材/武器/盾/矢の組合せ、地形編集での出口封鎖、悪意ある全payload、ブラウザ描画/タッチ、公開インターネット、実機性能の網羅的受入ではない。身体の位置と移動はsourceの観測と実ソケットcheckpointで照合し、映像記録とは区別する。
