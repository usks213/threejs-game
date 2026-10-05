# 権威側のプロファイルと固定刻み時計

2026-10-05。性能改善の実装と短いローカル検証。**公開4人の30Hz・長時間品質・Workersメモリ受入は未完了**。

## 何を測ったか

`scripts/profile-authority.ts` は本物の新規世界、または前回15分試験の最終checkpointから4人を復元する。地形・水・敵・部品を置換/削除せず、同じ30Hzの入力列を実行する。権威の `room.step()`、simulation、水snapshot/辞書、状態差分、クライアントdecode、元soakの追加JSON byte計測を別々に時間計測し、Node CPU sampling profileとGCイベントを保存する。

- `combined` は同じNode内の4 decoderを含む。150tickごとに復号snapshotを本物の権威と完全比較する。計測位相はinclusiveなので合計してはいけない。
- `server-only` はdecoder・比較・追加JSON計測を除く。送信済み文字列と受領通知を処理するだけで、実socketや永続化は含まない。
- 実時間を待たないCPU調査なので入力のrate制限には単調な仮想30Hz時計を明示的に渡す。これを実時間30Hz達成として数えない。
- `tsx` は変換時の関数名保持処理も含む。esbuildで束ねたNode版も別に測定し、ブラウザ/Workersの実測へ読み替えない。
- 冷たいtickと外れ値を除外していない。GCを明示実行した版は計測前と終了後だけで、測定中のGCは自然に発生したもの。CPU profiler自身やNodeのヒープ確保方針による負荷も残る。

集計は `docs/benchmarks/authority-profile-2026-10-05.json`。元のJSON/CPU profileは今回の作業環境の `pr5-authority-*.{json,cpuprofile}` に保存。baselineはf581e15のゲームソース。部分sourceHashは3変更ファイルとAuthorityRoomの識別用で、全リポジトリのruntime hashではない。

## 測定から直した経路

1. 全建物について各actorの足元を調べる `footSurface` が、遠方でも空のVoxel列を走査していた。既存の同じVoxel境界で先に除外し、y走査をモデル内部へ絞った。`occupied` も外側を先に除外する。穴、階段、部分セルの着地判定は同じ。
2. 水のencoderは各peer/frameで最大8192個の座標文字列を再生成していた。WORLD内の半セル格子を衝突しない整数キーへ変換し、wireの削除座標だけ文字列にする。辞書上限・不正入力の原子的拒否・値の精度・転送頻度を変えない。
3. 非水snapshot差分は変化しない葉にも経路配列を毎回作っていた。走査中は1本を再利用し、実際の変更の経路だけコピーする。キー検査/木検査も不要な配列を減らす。従来の正規JSON化、サイズ/深さ/prototype検査は維持する。

## 結果と限界

| 条件 | room.step平均ms 旧→新 | simulation平均ms 旧→新 | 補足 |
|---|---:|---:|---|
| 新規、600tick、tsx、combined | 45.26→18.66 | 21.16→6.87 | 初期の3経路改善。追加byte計測は旧0.09ms/frameで、元の遅さ全体を説明しない |
| 成熟保存、300tick、tsx、combined | 71.74→51.14 | 45.25→32.68 | 両側8回の完全snapshot一致。30Hz予算を超える |
| 新規、600tick、bundle、server-only | 36.40→21.14 | 17.13→7.72 | 最終のVoxel占有除外を含む。p95 94.68→76.11ms |
| 成熟保存、300tick、bundle、server-only | 69.04→63.68 | 41.64→36.91 | 新版の最大tick1.75秒も保持。p50 37.29→27.75msだが平均/p95を含む品質は未達 |

成熟保存の全ゲーム保存digestは旧新どちらも `d298b62a6e39b247a87a6ff4874a3cf09e45418f67a934c2cbece59b3b0f6a3d`。新規600tickの旧新bundleも `d5e8bdca02d8595e9359c35e6919b7b0e1e4b24954111ad48c31302b91524363` で一致する。水・個人状態・建物・敵・所持品などを除外した比較ではない。

成熟server-onlyの終了後GC済みheapは45.90→44.78MBで、小さな保持量改善に留まる。30tickごとのサンプル内でheap最大は245.09→248.60MB、RSS最大は410.98→418.88MB（全時刻の真の最大ではない）。Node RSSをWorkersの128MiB制約と同一視せず、メモリゲートの解消とはしない。今回の主な確認済み改善はCPU/割当とGC時間であり、通信byte量を下げる変更ではない。

## 固定刻み時計

従来のsetIntervalでは、3tickごとのbroadcastが33.3msを超えると、平均CPUが予算内でも遅れを取り戻せない。Node/Workerを共通の `FixedStepClock` に変更した。

- 単調な時計のdeadlineへ固定dtの呼出しを合わせる。simulationのdt、ネット送信頻度や物理の精度は変えない。
- Nodeは1 turn最大3step、時計が同期処理中にも進む環境では原則12msの仕事まで。Workersは1 callback最大1stepとし、正の整数ms timerへ必ず戻す。Workersの時計は同期JS中に進まないので、12msのCPU上限を測れているとは扱わない。1回の重いstep自体は途中で打ち切れない。
- 250msを超える古い遅れはrebaseし、`rebases`, `droppedMs`, `maxDebtMs` へ明記する。ここで失った壁時計時間をゲームが30Hzで処理したとはしない。
- Nodeは `server.timing()` とsoakのmetrics/finalに統計を出す。Workerはrebase時に `coop-scheduler-overload` をlogへ出す。`steps` はscheduler呼出し数で、保存待ち/参加待ちを除いた実simulation tick数ではない。
- stop/再start、古いcallback、最後の退出、保存失敗、例外、サーバーshutdownのcleanupを維持する。古いroomの遅延closeイベントが新しいroomの時計を止めないようidentityも確認する。

## 検証

- Voxel足元: 全建物、破壊セル、境界、高い落下で旧走査との完全一致。遠方のセルlookupが0回であることも確認。
- Voxel占有: 建物/木/破壊セル/境界で旧lookupと完全一致。
- 水辞書: WORLD端と半格子、重複/不正座標、失敗後のrevision、削除/復号の一致。
- 状態差分: 兄弟の変更経路が共有配列で破損せず、以前のdeltaも変わらない。
- scheduler: 50msのbroadcast負荷でも固定30呼出し/秒、catch-up上限、時間上限、debt記録、停止/再開/古いcallback/例外。
- 実WebSocket: 共有拾得・移動・再同期・再接続・保存/サーバー再起動、tick停止中の通常入力、server時計の終了/再起動を合格。
- 関連TypeScript検査合格。全体CI/buildと公開版の実時間受入は統合後に別途記録する。

## 再実行

`node --import tsx scripts/profile-authority.ts /tmp/profile 600 - combined`

bundle比較は `node_modules/.bin/esbuild scripts/profile-authority.ts --bundle --platform=node --format=esm --target=node22 --outfile=scripts/.profile-authority.mjs` 後、`node --expose-gc scripts/.profile-authority.mjs /tmp/profile 600 - server-only`。終了後に生成mjsを削除する。第3引数の `-` は実checkpointのパスへ変更できる。使用した保存・ソース・runtime・modeを揃えて比較する。
