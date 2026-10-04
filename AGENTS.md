# AI開発方針

## 最新のユーザー指示: 2026-10-04 一人称コア再試作
`docs/adr/0013-first-person-voxel-core.md`とREADMEを読む。今回の試作は横画面、一人称の近接アクション、照準インタラクト、細かい全Voxel固体と0.125m水セルを検証する。既存の草原版はPR #3に保持。mainは本人のプレイOKまで変更しない。セーブと協力通信は今回の試作には追加しない。PBR/HDR描画は継承する。
必要な型・短い単体・ビルドを実行し、PCとスマホの関連ブラウザケースをCIで確認する。Preview公開とブラウザ検証は独立ジョブ。失敗/未検証を明記する。

## 目的
スマホでプレイできる軽量なThree.jsゲームを作る。ユーザーは自然言語で指示し、レビューURLで遊ぶ。コード編集、Git、CLI、テスト、ビルド、デプロイ設定はAIが担当する。

## アーキテクチャと構成
- `src/core/`: DOM・WebGL・Three.jsに依存しない状態とルール。位置は数値で保持し、単位はメートル・秒。
- `src/game/`, `player/`, `enemy/`, `combat/`: 成長に合わせてゲームルールを分割。
- `src/rendering/scene/`, `camera/`, `effects/`: Three.jsの表示と追従カメラ。
- `src/input/touch/`, `keyboard/`: 入力を共通の軸へ変換。
- `src/platform/`: 描画・入力・ルールの組み合わせとライフサイクル。
- `src/ui/`, `audio/`, `save/`: UI、音声、保存。
- `src/main.ts`: 起動のみ。
- `public/models/`, `textures/`, `sounds/`, `music/`: 静的アセット。
- `tests/unit/`, `tests/e2e/`: ロジックとブラウザの検証。

## コーディング
TypeScript strictを維持する。巨大な単一ファイル、不要なany、隠れたグローバル状態を避ける。ゲームロジックへThree.jsを持ち込まない。入力・時間・状態を明示する。イベントリスナー、RAF、GPU資源の後始末を行う。秘密情報をソースやログへ書かない。

## テスト
変更したルールはVitestでDOMなしに検証。常に `npm run typecheck`, `npm run test`, `npm run build` を実行し、失敗を修正してから反映する。入力・画面・描画に関わる変更は `npm run e2e` も実行。PlaywrightのChromiumデスクトップ・Android相当で起動、canvas、初期UI、移動、リセット、リサイズ、例外、WebGLエラー表示を確認する。エミュレーションはAndroid実機・Safari実機検証の代わりにならない。

## スマホ
優先順位はAndroid Chrome、iPhone Safari、Desktop Chrome。タッチを第一級入力としhoverに依存しない。操作対象は48px以上。Pointer Eventsとpointer captureを使い、cancel・blur・回転時に入力を解除する。Safe Area、縦横回転、リサイズ、スクロール防止を考慮する。WebGL不可・context lostを画面で知らせる。

## 性能
DPRは最大1.5。シンプルなライティングを使い、高価な影・post processingは追加前に測定する。毎フレームの割り当てとDOM更新を抑える。繰り返し形状はInstancedMeshを検討し、テクスチャ寸法とGPUメモリを管理する。dispose漏れを防ぐ。必要になるまで過剰最適化しない。

## Gitとデプロイ
指定リポジトリは `usks213/threejs-game` のみ。通常は `feature/*` ブランチで実装→検証→push→PR→Cloudflare PreviewのURLを提示。mainは安定版。mainの更新はCIの成功を確認して行う。CI失敗を成功として報告しない。ユーザーへGit操作を依頼しない。
Cloudflare PagesのGit連携を使用。Production branchはmain、build commandは `npm run build`、outputは `dist`。その他ブランチ・PRはPreview。Preview URLは実際のデプロイ結果から取得し、推測しない。未接続の外部認証・課金のみ本人操作を依頼。無料枠を優先。

## AI変更チェックと完了条件
1. このファイルと既存コードを確認し、必要な範囲を変更。
2. 型・ルール・ビルドと必要なE2Eを実行し、不具合を修正。
3. 秘密情報や不要アセットが含まれないことを確認。
4. 検証済みコードを指定GitHubへ反映。Actionsの結果を確認。
5. Cloudflareの対象コミットのデプロイ成功とレビューURLを確認。
6. ユーザーへURL・変更内容・検証結果・次の操作だけ簡潔に報告。
未実行・失敗・認証待ちを明記し、未完了を完了と扱わない。

## 既存Workers公開先の補助設定
ユーザーから共有されたWorkerは `threejs-game`、URLは `https://threejs-game.usks213.workers.dev`。`wrangler.jsonc` はこの既存Workerへ `dist` を配信するための補助設定で、Pages対応も維持する。CloudflareのGit連携やデプロイ成功を推測しない。mainの `verify-production` は対象コミットを `deployment.json` で照合し、公開先でE2Eを行う。最新コミットが確認できない場合は原因を調べ、初期構築完了とは報告しない。将来Pagesへ接続した場合は公開確認先を実際のPages URLに更新する。
