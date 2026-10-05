# 数値密度の厳密な境界による計算省略

2026-10-05。別の「符号だけを計算するAPI」は小さな比較では速かったが、交互順の実authority比較ではsimulation平均23.38→32.11msへ悪化したため採用していない。ここでは既存の `skyboundDensity` の数値をそのまま維持する。

島・柱・大穴の形状には、水平距離を計算する前に得られる保守的な下限がある。その下限から、現在のmin/maxを絶対に変更しないと証明できる場合だけMath.hypot等を省く。等値は省かず、符号付きゼロとCSGの境界を維持する。非有限値での従来のNaN挙動も検証する。地形そのもの、島の個数、seed、編集、描画の密度/gradientを変更する機能ではない。

同じプロセスに成熟保存の4人authorityを旧新それぞれ構築し、同じ入力を300tick、処理順を毎tick交互に変えて比較した。client decodeは計測外、冷たいtickや外れ値も保持する。inspectorは使っていない。

| 項目 | 旧 | 新 |
|---|---:|---:|
| room.step 平均ms | 38.59 | 36.75 |
| room.step p95ms | 88.57 | 84.78 |
| simulation 平均ms | 21.54 | 19.89 |
| simulation p95ms | 34.42 | 31.25 |
| room.step 最大ms | 122.01 | 170.99 |

平均は約4.8%、simulationは約7.7%改善した一方、最大値は悪化しており、すべてが改善したとはしない。room全体は33.3msを超えるため、4人30Hz品質の達成ではない。これはNodeの同期処理時間で、公開Workers、実回線、実機FPSの証拠ではない。

両側8回ずつ、decoded snapshotをそのauthorityの完全状態と厳密比較して合格。両側の全ゲーム保存hashは `d298b62a6e39b247a87a6ff4874a3cf09e45418f67a934c2cbece59b3b0f6a3d` で一致する。集計は `docs/benchmarks/authority-density-bounds-2026-10-05.json`。

関連21試験とTypeScript検査に合格。新しい試験は15万点の数値そのものを旧式とObject.is比較し、島/大穴/洞窟/斜路の境界、CSG等値、±0、NaN、±Infinityも比較する。既存generator1〜4・編集/undo・Voxelメッシュと境界の確認も維持する。公開統合・実時間受入は別途行う。
