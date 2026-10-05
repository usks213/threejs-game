# 継ぎ装の消費・装備保持の実入力受入

2026-10-05 UTC。POWER-A02の「合成消費」と失敗時の資源保全について、新規世界から2人の通常操作を実行し、同じ入力を独立した2つのWebSocketで再生した。ゲームソース変更なし。合成の代表例に関するcore/socket受入であり、描画・タッチ・公開環境の合格やPOWER-A02全体の完了は意味しない。

## 実際に取得・消費したもの

- 共有cacheの木12・石8・樹脂4をAが拾った後、Bが同じ木Dropを再取得しようとして拒否された。共有素材の複製なし。
- 2人が徒歩で既存の近傍の落ち枝2か所と樹脂1か所へ移動。木6・樹脂1を追加取得し、通常の帰還操作で出発点へ戻った。位置、資源、装備、耐久、品質を直接設定していない。
- 実素材から盾・粗末な弓・木の矢12本を制作。木18・石8・樹脂5から、制作後は木2・石7・樹脂1となった。
- 装備中の棍棒に石1個を融合。個体ID・品質1・本体耐久100を保ち、衝撃+6・合成耐久30が付いた。通常の空振り1回で、同じ個体の本体耐久99・合成耐久29となり、追加の石消費はなかった。
- offhand装備中の盾に石1個を融合。個体ID・品質1・本体耐久200を保ち、衝撃+6・合成耐久30が付いた。
- 木の矢1本と樹脂1個を火の矢1本へ変換。弓を装備して上方へ1回発射すると、その火の矢だけが消費され、木の矢11本は残った。core観測では発射体にburn=5が存在し、同じ弓個体の耐久は50→49。敵への命中・燃焼damageはこの経路では試していない。
- 融合済みの盾をAが地面へ落とし、Bが拾って個体ID・品質・本体耐久・融合をそのまま受け取った。Aの古いDrop再取得は拒否された。Bが盾を装備しguardをON/OFFした後、融合解除で素材が戻らないことを確認。Aから石1個を実Dropで受け渡してBが再融合し、その石だけを消費した。
- 最後はAに木2・石4・木の矢11本、Bに同じ盾個体があり、両者の樹脂/転送石/火の矢の不要な増加なし。実socket run自身の保存からサーバープロセスを再起動し、持ち物・全装備個体・装備選択・融合効果が保存前と一致した。

## 意図した拒否9件

1. Bによる取得済み共有木Dropの再取得
2. Aの棍棒への未所持crystal融合
3. 非対応素材woodでの棍棒融合
4. 非対応装備gliderへの融合
5. Bの棍棒への未所持resin融合
6. Aの融合済み棍棒への重ね掛け
7. 棍棒の攻撃回復中の融合解除
8. 樹脂0での2本目の火の矢融合
9. Bが拾った融合盾DropをAが再取得

各操作の拒否理由を実wire ACKで照合。同tickでの正本在庫・装備・部品・設計・Drop・地形・ID割当が不変であり、両クライアントの次の通常frameでも支払済み状態が変わらないことを確認した。確認用の追加simulation tickやresyncは使用しない。Drop競合は正本への到着順で行っており、同時ネットワークraceや同一commandIdの再送を新たに証明したものではない。

## 検証結果

- `scripts/fusion-coop-acceptance.ts`: 新規SessionAuthority、通常入力638tick、成功28操作、意図した拒否9操作
- `scripts/playthrough-coop-websocket.ts`: 独立2socket、別serverプロセス、空の世界から同じ入力を再生。比較用source保存の注入なし
- checkpoint4段階、自身の保存によるserver再起動1回
- 完全snapshot428回、水状態428回が正本と一致。失敗0、未照合0
- 実行wall time42.68秒。IPC制御の決定的clockであり、wall-clock負荷/実機FPSの測定ではない
- `scripts/verify-fusion-coop-replay.ts`: 上記9拒否に加え、実socket保存から制作費・融合費・1射の消費・装備ID/耐久/融合・盾移転・再融合・再起動後の保持を独立に検査
- 全4段階のskybound・地形編集・保存水・姿勢・個人adventureをsourceと照合。再起動後の両者の個人seconds cacheだけ各1/30秒の表現差があり、共有時刻と既知cache範囲を検査して比較用コピー内で正規化。除外した状態フィールドはなく、receiptは`rawStrictMatch:false`と実値2件を保持
- 新規controller/verifierの個別strict TypeScript確認: 合格。src/package変更なしのため全suite・typecheck・buildは再実行していない

## 対象と証跡

- local HEAD: `096a84b88de36d61ef79e9232591bab94ffc5a88`
- runtime source SHA-256: `486a72a852ffb5a5bdba28da374f8d6d57068d407dd06eacb45d80628658b943`
- replay runner SHA-256: `8c4bb9692a09bdda0ab406d8dfcb1c0116622a276054e07be2c3e28992123162`
- source trace: `/tmp/voxel-fusion-source-01/trace.json`
- trace SHA-256: `c60f08f280645abd5fb6aa037336c7342e0633aff47300801393d2cfab24634f`
- socket summary: `/tmp/voxel-fusion-socket-01/summary.json`
- summary SHA-256: `239a85a8ad66508afb02d02990586487c91e335a0818988ec608be8efc73fa01`
- 詳細比較: `/tmp/voxel-fusion-socket-01/fusion-verification.json`
- 詳細比較 SHA-256: `3ccf889f0c8376ca75c536e9f408acf1845fe70020866d65c872aa1bd2252a1a`
- 非公開backup: `/workspace/shared/voxel-fusion-acceptance-20261005/`。`SHA256SUMS`で各fileを検証。raw保存は比較のための非公開artifactであり、Git/公開対象に含めない

## 再現

未使用の出力directoryを指定する。

```sh
FUSION_OUTPUT=/tmp/fusion-source node --import tsx scripts/fusion-coop-acceptance.ts
node --import tsx scripts/playthrough-coop-websocket.ts /tmp/fusion-source/trace.json /tmp/fusion-socket --allow-expected-rejections
node --import tsx scripts/verify-fusion-coop-replay.ts /tmp/fusion-source /tmp/fusion-socket
npx tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM,DOM.Iterable --types node scripts/fusion-coop-acceptance.ts scripts/verify-fusion-coop-replay.ts
```

対象は石融合の棍棒/盾、樹脂による火の矢の代表例。全素材/全武器、実際の盾受けでのfusion耐久消費、容量上限、命中時の属性効果、タッチ/GPU、公開インターネット、端末性能はこのreceiptの対象外。既存の戦闘・橋・逆再生経路の回数増し再実行はしていない。push、公開、CI再実行、課金/権限変更は行っていない。
