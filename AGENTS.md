# AI開発方針

## 最新の方向変更: 2026-10-06 ダンジョン探索PvPvE
ユーザーはDark and Darker型のダンジョン探索アクションPvPvEを依頼。実装前の要素一覧を `docs/reference/dark-and-darker-requirements.md`、110-ID台帳を `docs/dungeon-implementation-ledger.json` に記録。参照はEA S10/HF127の2026-10-06確認版。まず独立2人の入場→PvPvE戦闘→戦利品→死亡/抽出→倉庫保存を成立させる。ゲームロジックと持物をサーバー権威にし、既存のbrowser-host協力を安全な対人権威と呼ばない。既存キャンペーンと保存は別モード・別キーで保持し、無断移行/削除しない。独自名称・地形・資産を使い、原作完全一致や未検証を完成と偽らない。既存PR4資源のみで公開、追加課金・アクセス権・mainマージは含まない。

## 最新の大改変: 2026-10-04 七つの灯キャンペーン
ユーザーはEnshroudedの主要分類一覧を先に作り、ゲーム内容と進行を上から実装し、一覧に沿って試験して公開するよう依頼。171件を `docs/reference/enshrouded-requirements.md` に先に記録済み。`docs/implementation-checklist.md` の完了/簡易/未実装を更新する。過去の「セーブなし」「小さな試練場のみ」の制限はこの依頼で置き換わる。独自の名称・世界・資産を使い、原作と同規模/全要素実装済みを偽らない。単独プレイ、段階式の地域進行、永続化、制作/建築/生活、戦闘・元素・SDFをつなぐ。mainは依然変更しない。

## 追加指示: 2026-10-04 属性サバイバル
追加では敵の独立Voxel材質場と元素反応、SDF壁で止まるノックバック、落下素材の慣性/反発/摩擦/浮力を扱う。人体の剛体ラグドールや全世界の重力崩壊とは区別する。
PR #4は材質ごとの耐久、5属性、水/火/土/風/雷の局所反応、素材ドロップ、収集、木材から作業台と壁/床を作る流れを含む。`docs/adr/0015-elemental-survival.md`を読む。SDFと近接モーションの方針は保持する。建築サンプルの再採掘による素材増殖と破損扉の再生成を防ぐ。セーブと通信は引き続き追加しない。

## 最新のユーザー指示: 2026-10-04 一人称コア再試作
`docs/adr/0014-sdf-and-authored-motion.md`とREADMEを読む。最新の修正はVoxelを内部距離データにしてSDFから曲面メッシュをリアルタイム抽出する方式。立方体面/DDAの旧試作方針を廃止する。モーションを最優先し、武器の連続軌道を表示と命中判定で共有する。今回の試作は横画面、一人称の近接アクション、照準インタラクト、細かい全Voxel固体と0.125m水セルを検証する。既存の草原版はPR #3に保持。mainは本人のプレイOKまで変更しない。セーブと協力通信は今回の試作には追加しない。PBR/HDR描画は継承する。
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
