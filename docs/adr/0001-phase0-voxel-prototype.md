# ADR 0001: Phase 0の最初の地形・Simulation試作

## 状態
採用。2026-10-03。添付仕様v0.4の第27・28節に従い、全ゲームを一度に実装しない。

## 判断
まずSingle PlayerでSDF地形、局所編集、Chunk/Brick Streaming、Worker上の固定Tick Simulation、水・球体衝突・差分保存を検証する。スマホ操作は既存のユーザー要件を継続する。

- 世界は2km四方の有限範囲。16m Chunk、8m Brick、近傍1m/遠方2mサンプリング。全世界を一括生成しない。
- 独自のMarching Tetrahedraで滑らかなSurface Meshを生成する。Voxel表示のために立方体を並べない。これは候補比較用実装であり、Dual Contouring等の最終採用判断ではない。
- `src/simulation/GameSimulation`はDOM、Three.js、WebRTCに依存しない。ブラウザではWorkerで実行し、Node上のVitestでも同じコードを実行する。
- 地形はSeed + 有限長の編集ログで保存し、編集が交差するBrickだけ再生成する。LOD境界の厳密なステッチ・永続Chunk圧縮は後続検証。
- 水は低頻度の容量保存セル移送。物理は球体の限定衝突。いずれも実用物理・流体エンジンとの比較前の試作。
- IndexedDBにバージョン付きセーブを保存し、JSON Export/Importを提供する。通信でGuestを正本にしない設計は次のADRで具体化する。

## 範囲と次のゲート
今回の完了はPhase 0全体・MVPの完了を意味しない。次はWebRTCのHost+Guest、Signaling、予測/補間、同じSimulationのNode/Colyseus接続、Voxel差分同期を検証する。STUN/TURN、4人Host/8人Dedicatedの実ネットワーク負荷、AoI、セーブ再参加が通るまで協力プレイを完成と呼ばない。

## 制約
現在の公開基盤はCloudflare Workersの静的配信。SignalingやDedicatedは未設置。新規有料サービスを作成しない。未実装の通信を動くボタンとして見せない。
