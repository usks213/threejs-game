# v0.4実装状況と次の開発

2026-10-03。今回のレビューは **Phase 0の地形技術試作**。MVP・全仕様の完成ではありません。

## 今回試せること

- 2km四方の有限Seedワールド。草原、地下トンネル、浮島。
- SDFから独自のMarching Tetrahedraで滑らかな地形を生成。
- Chunk16m / Brick8m。近傍1m、遠方2mのサンプリング。周辺ChunkをWorkerで生成し、離れたGPU資源を破棄。
- 球形の「掘る」「盛る」。影響するBrickのみ再生成。
- DOM / Three.js / Transport非依存の`GameSimulation`をWorkerの30Hzで実行。Node/Vitestでも同じクラスをテスト。
- 容量保存の水セル試作を10Hzで更新。地形の穴・壁に反応。岩の球体衝突と支持消失後の落下。
- タッチ移動・画面ドラッグ視点・ジャンプ。PCはWASD/矢印、Space、F（ツール使用）。
- IndexedDB自動保存5秒、編集直後保存、手動保存。JSON書出・読込とバージョン/上限/座標の検証。
- 起動・入力・回転・編集・保存/再読込・書出・不正読込・WebGLエラーをPC/Android相当ChromiumでE2E。
- FPS、Draw calls、描画Triangles、Tick・Mesh・編集・水・物理の時間、待機Brick、Geometry数を画面表示。

## 初回の遊び方

左スティックで移動し、画面をドラッグして視点を変える。画面中央の照準を近くの地面に合わせ、下のツールを選び、右の丸いボタンで使う。「掘る」で穴を作り、「水」で穴に流し、「岩」で落下・衝突を試せる。「盛る」で壁や丘を作れるが、建築ピースではない。「出発点へ」は位置だけ戻し、地形を消さない。

セーブはURLのオリジンごと・端末ごとに保存される。別のPreview URLや本番へ移る前に「書出」を使い、移動先で「読込」する。ブラウザのサイトデータを消すと端末保存も消える。互換性のないデータや1MBを超えるファイルは読込を拒否する。

## 試作の制約

- シングルプレイのみ。WebRTC、Signaling、STUN/TURN、Colyseus Dedicated、他端末への同期は未実装。Transport interfaceの存在は接続完成を意味しない。
- 地形編集512回、水384セル、岩12個に制限。上限に達しても性能を守り、無制限に生成しない。
- SDFは距離場の近似。LOD境界の完全ステッチ、Occlusion Culling、VRAM推定、編集ログのChunk Snapshot圧縮は未実装。
- 水は小範囲の容量移送で、海洋・無限水源・浮力・ダムの大規模検証は未実施。盛土で塞いだセルの水は排除量に計上する。
- 岩は球体の簡易衝突。地形全体の支持解析や浮島崩落・建物崩壊は未実装。木は景観で、伐採・衝突は後続段階。
- GPU/端末性能は画面で測定する。ソフトウェア描画CIやNodeでのMesh計測をAndroid実機60FPSの保証として扱わない。
- IndexedDBを初期採用。OPFS比較、Chunkごとの永続化、複数ワールド管理・バックアップ世代は後続検証。

## Phase 0の次のゲート

1. 無料で成立するSignaling基盤を選び、WebRTC Host + Guestの実接続、Reliable/Realtimeチャネル、切断を検証。
2. 入力検証・クライアント予測/補間・Authority reconciliation・AoI・Seed+編集差分同期・再参加保存を実装。
3. 同じGameSimulationをNode/Colyseusで走らせ、Dedicatedへの接続を検証。
4. Host最低4人・目標8人、Dedicated8人の採掘/移動/水/物理の負荷試験。STUN/TURNの異なるNAT環境を検証。
5. Surface方式・LOD継ぎ目、支持解析/物理ライブラリ、水、IndexedDB/OPFSの比較結果をADRに記録。
6. 技術ゲートの後にPhase 1へ。1バイオーム、3〜5敵、1ボス、採集・クラフト・建築ピース・戦闘・魔法を小規模に実装。

勝手に有料TURNやDedicatedホスティングを契約しない。ユーザーが認証する箇所は公式UIのOAuth/アカウント許可だけにする。
