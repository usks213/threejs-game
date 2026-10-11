# 実入力で組み立てた協力橋の受入

2026-10-05 UTC。新規世界での制作、2人の実際の渡橋、設計帳、解体、地面からの素材回収、再建、保存復帰をSessionAuthorityの本番入力で検証し、別Nodeプロセスの本番AuthorityRoomと独立した2本の実WebSocketで再生した。ブラウザ、公開回線、実機性能の合格は、この記録に含めない。

## 合格した範囲

- 新規Generator4世界の共有物資、木12・石8・樹脂4を通常の拾得で獲得。持ち物・座標・地形・部品・接着・体力へのfixture代入はない。
- 木の板3枚と石の板2枚を通常の制作・掴む・接着で連結。各板のコストは素材4個、合計は木12・石8。樹脂は消費しない。
- 直径7mの既存の裂け目、中心 `(28, 8)` に長さ10m、幅2mの連続した板橋を設置。組立時の板5枚の高さを揃えた後、通常の重力・接地で姿勢が決まる。固定フラグは付けない。
- Aが制作・接着・設計を行い、Bが実際に全体を掴み、移動して放す。両者が高い東岸から乗り、西岸まで歩く。地形の低い西岸から頭を板にぶつけて登ろうとする経路は使わない。
- 裂け目の中央5.6mの区間では、各人の50/50 tickすべてで接地と実在する板の支持面を確認。ジャンプ入力なし。足下の地形は約-11m、板上は約4.6m。各人の中央到達を個別の保存checkpointに記録した。
- 5部品の連結を設計帳へ保存。既存の橋に重なる再建を本当に要求し、拒否時に5部品・在庫・設計・次の部品IDが完全に変化しないことを確認。
- 板橋を持ち上げ、東へずらして木を避け、南岸へ実際に移す。各部品を個別に掴んで解体。素材は在庫へ直接入らず、木4個×3、石4個×2の地面Dropになる。
- 通常の歩行とgatherで5つのDropを回収し、木12・石8をちょうど取り戻す。実体Dropの回収前に資源を付与しない。
- 回収素材を持った状態で、地形に埋まる再建を本当に要求。木12・石8を含む在庫、部品、設計、次IDの前後hashが完全一致。
- 適切な設置位置で再建し、木12・石8を消費。新しいIDの5部品が生成され、設計・部品・個人持ち物を自分で獲得した保存から再読込できる。
- 敵は消していない。終点の体力はAが2、Bが13で、両者とも生存。この経路は戦闘や無傷の安全な移動の受入ではない。

## 証跡

`scripts/bridge-coop-acceptance.ts` は、既存の `ContinuousCoopJourney` を利用する独立した経路。ゲームソースへfixtureを追加しない。ソケット側は既存runnerの明示的な期待拒否オプションを使用する。

- 入力: 1,711 tick、成功操作39回、意図した拒否2回
- 保存: 11段階、実ソケットのサーバープロセス再起動1回
- 実ソケット: 41操作ACKのうち39成功・2期待拒否。snapshot完全比較1,144件・水比較1,144件、未照合・予期しない失敗0件
- ソケットrun時間: 約84.6秒。入力に合わせて決定的tickを進めるため、実時間30Hz性能の証明ではない
- ゲームsource hash: `4f75eff6ae783f392a9c896c3b1a0d1e0167b379082dc78bdbdc3b97fd2e165c`
- 入力trace SHA-256: `71dac3d4607f5edd65cfbfcec3b5d112b7f111d111d8eb229fc2e5ae1e815b74`
- source trace: `/tmp/voxel-bridge-source-final/trace.json`
- 到達/支持/費用/Dropの観測: `/tmp/voxel-bridge-source-final/bridge-observations.json`
- 保存とreceipt: 同じディレクトリの `*.save.json`、`receipt.json`
- 実ソケットreceipt: `/tmp/voxel-bridge-socket-final/summary.json`
- summary SHA-256: `430d3631dcc8dcfa9130b47cbbca101a21bbe2dff1ba5c18208df7ea7dc10722`
- 独立比較receipt: `/tmp/voxel-bridge-socket-final/bridge-journey-verification.json`
- 追加した2scriptの個別strict TypeScript検査: 合格
- 既存の関連単体: `skybound.test.ts`、`skybound-salvage-atomic.test.ts`、`skybound-id-counter.test.ts` の17件が合格

これらの一時ファイルはGit管理された公開artifactではない。スクリプトを再現経路として保持する。ゲームソース変更はないため、同一ソースの全単体・buildの再実行を、この検証では行っていない。

## 独立したsource/実ソケット比較

`scripts/verify-bridge-journey-replay.ts` はsource保存を読取専用の比較入力として扱い、復元には使用しない。認証済み公開IDとの対応を検証し、11段階すべてで完全なskybound状態、両者の全保存姿勢、地形編集、保存された水の全体を厳密照合する。各人の中央到達checkpointも一致した。

個人adventure全体の最初の生比較では、次の2フィールドだけに表現差があり、失敗として検出した。両保存を同じvalidateSaveへ再通過させても変化しない。元ファイルと初回失敗ログ `/tmp/voxel-bridge-verifier.log` は保持した。

- `seconds`: 22人分の比較のうち7件でsourceが共有world時刻+1/30秒、socketが共有world時刻。共有world時刻は全11段階で完全一致。`SessionAuthority.withActor` はaction/viewの前に共有時刻をコピーし、`stepPersonal` は1tick増加する。socketの通常frame viewはこのcacheを共有時刻へ戻すため、この差が生じる。比較では各raw値が共有時刻または共有時刻+正確に1tickであることを先に検査し、コピー内の当該フィールドだけを共有時刻へ揃える。
- `meadows.slotLimit`: 最初のB保存1件のみ、sourceでは省略、socketでは32。`inventoryLimit` の省略時既定値が32で、`snapshot.refreshGrowth` が同じ値を明示する。双方が省略または32の場合だけ32へ揃える。

この限定したcache/既定値正規化後、個人adventureの全フィールドが一致した。在庫、装備lot、体力、スタミナ、進行、記録などは除外せず厳密比較する。比較receiptは `rawStrictMatch:false` と、8件のraw値・正規化規則を明記する。生の全保存がbyte単位で完全一致したという主張ではない。

渡橋の50/50接地カウンターと各10件の支持面サンプルは、trace hashに結び付いたsource観測を検証する。実ソケットでは全入力の再生と各人の中央到達checkpointの完全一致を確認する。全50tickの幾何判定をソケット保存から再計算した証拠とは分ける。

## 意図した拒否と実ソケットの扱い

拒否は成功操作へ変換しない。traceには `kind: action-rejected`、`expected: true`、実際の要求・エラー文字列・前後の完全な状態とSHA-256を残す。前後の比較対象は在庫、部品、設計、次ID。

通常のfail-fast動作は維持する。`--allow-expected-rejections` を付けない対照試験はサーバー起動前にexit1となった。オプション付きrunでは、2回とも本物の拒否ACKと正確な理由を確認。同tickで正本の在庫・装備・部品・設計・Drop・地形・IDカウンターが変化しないことを検査した。後続の通常frame、tick1107と1617で両クライアントの支払済み状態が変わらないことも確認。検証のための追加simulation tickは0。

誤った拒否理由、`expected:true` の欠落、実際には成功する操作を拒否扱いしたmini対照試験は、それぞれ意図どおり失敗した。これらは本経路の失敗ではなく、誤った成功判定を防ぐrunnerの検査。任意の拒否、全エラー条件、悪意ある破損receiptの網羅試験ではない。Nodeの実通信であり、公開サイト・ブラウザ表示/タッチ・端末FPSの検証とは分ける。

## 再実行

未使用の出力先を指定する。

```sh
BRIDGE_OUTPUT=/tmp/bridge-source node --import tsx scripts/bridge-coop-acceptance.ts
node --import tsx scripts/playthrough-coop-websocket.ts /tmp/bridge-source/trace.json /tmp/bridge-socket --allow-expected-rejections
node --import tsx scripts/verify-bridge-journey-replay.ts /tmp/bridge-source /tmp/bridge-socket
npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM --strict --skipLibCheck scripts/bridge-coop-acceptance.ts scripts/verify-bridge-journey-replay.ts
npm test -- tests/unit/skybound.test.ts tests/unit/skybound-salvage-atomic.test.ts tests/unit/skybound-id-counter.test.ts
```

初期試行では、西岸からの乗り込み、組立中に片端だけ先に接地した高さ差、南岸への移動中の木との衝突で停止した。入力経路と通常の設置高さを修正し、新規世界から全経路を再取得した。失敗traceと保存は各試行の出力先に残し、ゲーム状態の代入やゲームソースの変更で通過させていない。

## 追加受入: 切断・再参加時の橋全体の操作権

別の新規world runで、上記の橋の制作から再建までを再実行した後、`scripts/bridge-lease-acceptance.ts` の経路を続けた。Aが5部品の橋全体を掴む→切断で全lease解放→Bが再取得→Aが同じ認証IDで再参加→競合grabは本当に拒否→Bが放す→Aが取得して放す、という流れを実WebSocketで確認した。追加の保存・プロセス再起動後もleaseは残らず、5部品と両者の支払済み在庫を保持した。

- 合計1,774 tick、47 ACK＝44成功＋3期待拒否、13 checkpoint、2プロセス再起動、切断/再参加各1回
- 完全snapshotと水の比較各1,185件。失敗・未照合0件
- 通常frameによるlease検査9段階、接続中の全クライアント×橋の全5部品で合計80検査。元の2人が同時に操作権を持つことはない
- 独立比較は13 checkpointのskybound、全保存姿勢、個人adventure、地形、水を検査。cache/既定値差は基礎runと同じ8件。切断中のAの時刻は両方57.33333333333264で完全一致し、共有時刻57.73333333333262への正規化はしない
- trace SHA-256: `5a989616fb354abc2322f9ea37eba4412b6463402d61e9e241dd00d0fd47aef6`
- summary SHA-256: `74021c24bb66c6b83809b1a4980278e8c6d4f134ac45844796943107954c7c24`
- source: `/tmp/voxel-bridge-lease-source-final/trace.json`
- socket: `/tmp/voxel-bridge-lease-socket-final/summary.json`、`bridge-lease-journey-verification.json`

比較scriptは `--include-lease-tail` と `--expected-runtime-hash` を明示した場合だけ追加scopeを受け付ける。既存の基礎11段階の既定modeとreceiptは保持した。runtime hashはsource完了後・socket開始前に記録した値で、source起動時点で計測した証跡ではない。全source checkpointとsocket自身の保存の一致を別途要求する。leaseの切断復帰の受入であり、長時間待機での期限切れや広域回線の障害全般の合格ではない。

```sh
node --import tsx scripts/verify-bridge-journey-replay.ts /tmp/voxel-bridge-lease-source-final /tmp/voxel-bridge-lease-socket-final --include-lease-tail --expected-runtime-hash 4f75eff6ae783f392a9c896c3b1a0d1e0167b379082dc78bdbdc3b97fd2e165c
```
