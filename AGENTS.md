# AI開発方針

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

## テストと高速イテレーション
最優先はユーザーがスマホで早く触れること。実装→必要な確認とビルド→featureへpush→Preview URL提示→ユーザーがプレイ→OKならmainへマージ、修正なら同じブランチを更新する。ユーザーのOK前にmainへ昇格しない。
コード変更時は `npm run typecheck`, `npm run test`, `npm run build` を一度実行し、失敗を修正する。ソースに変更がない限り同じ検証を繰り返さない。文書・CI設定のみの変更ではゲームの全テストを再実行しない。変更したゲームルールはVitestでDOMなしに検証する。
PRのCIは型・単体テスト・ビルドを実行する。全Playwrightはmainへのpushまたは手動起動で実行。入力・描画・保存形式など広い影響がある変更では必要なE2Eを選んで実行する。全E2Eや公開先での同一E2Eの重複実行をレビューURL提示の前提にしない。公開コミットの照合は独立した軽量ジョブで行う。
テスト失敗を成功扱いしない。重大な既知の起動・保存不具合は先に修正する。検証の未実行・実行中はそのまま報告する。エミュレーションはAndroid実機・Safari実機検証の代わりにならない。

## スマホ
優先順位はAndroid Chrome、iPhone Safari、Desktop Chrome。タッチを第一級入力としhoverに依存しない。操作対象は48px以上。Pointer Eventsとpointer captureを使い、cancel・blur・回転時に入力を解除する。Safe Area、縦横回転、リサイズ、スクロール防止を考慮する。WebGL不可・context lostを画面で知らせる。

## 性能
DPRは最大1.5。シンプルなライティングを使い、高価な影・post processingは追加前に測定する。毎フレームの割り当てとDOM更新を抑える。繰り返し形状はInstancedMeshを検討し、テクスチャ寸法とGPUメモリを管理する。dispose漏れを防ぐ。必要になるまで過剰最適化しない。

## Gitとデプロイ
指定リポジトリは `usks213/threejs-game` のみ。通常は `feature/*` ブランチで実装→検証→push→PR→Cloudflare PreviewのURLを提示。mainは安定版。mainの更新は必要なCI成功とユーザーのプレイOKを確認して行う。CI失敗を成功として報告しない。ユーザーへGit操作を依頼しない。
現在は既存Cloudflare WorkersのGit連携を使用。Production branchはmain、build commandは `npm run build`、assetsは `dist`。その他ブランチ・PRはPreview。Preview URLは実際のデプロイ結果から取得し、推測しない。未接続の外部認証・課金のみ本人操作を依頼。無料枠を優先。

## AI変更チェックと完了条件
1. このファイルと既存コードを確認し、必要な範囲を変更。
2. 変更に必要な検証を一度実行し、不具合を修正。
3. 秘密情報や不要アセットが含まれないことを確認。
4. 指定GitHubのfeatureへ反映。必要なCIの結果を確認。全E2E待ちでレビューを遅らせない。
5. Cloudflareの対象コミットのデプロイ成功とレビューURLを確認。
6. ユーザーへURL・変更内容・検証結果・次の操作だけ簡潔に報告。
未実行・失敗・認証待ちを明記し、未完了を完了と扱わない。

## 既存Workers公開先の補助設定
ユーザーから共有されたWorkerは `threejs-game`、URLは `https://threejs-game.usks213.workers.dev`。`wrangler.jsonc` はこの既存Workerへ `dist` を配信するための補助設定で、Pages対応も維持する。CloudflareのGit連携やデプロイ成功を推測しない。mainの `verify-production` は対象コミットを `deployment.json` で照合し、公開ページの起動用HTMLを確認する。全E2Eは別ジョブで実行する。最新コミットが確認できない場合は原因を調べ、初期構築完了とは報告しない。将来Pagesへ接続した場合は公開確認先を実際のPages URLに更新する。

## サバイバル仕様v0.4と段階的開発
`docs/specs/open-world-survival-v0.4.md`, `docs/phase0-status.md`, `docs/adr/`を読む。Phase 0の技術ゲートを優先し、コンテンツを一度に作らない。共通GameSimulationはDOM/Three.js/WebRTC/Colyseusへ依存させずBrowser WorkerとNodeで共有する。地形編集はAuthority側で範囲・頻度・上限を検証し、Seed+差分を保存。未実装通信や人数目標を完成として報告しない。ネットワーク追加前に実接続・再参加・STUN/TURN・負荷試験を設計する。現在のSingle Playerは地形編集512回、水384セル、岩12個が上限。保存形式やSeed/Generatorの破壊的変更にはADRと互換性対応が必要。大きな変更はPreviewでユーザーがプレイした後に安定版へ昇格する。
