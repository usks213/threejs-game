# TERRA — オープンワールド・サバイバル試作

添付仕様v0.4に従い、まずPhase 0の技術検証を進めています。今回はスマホで地形を掘る・盛る、水と岩を試せるSingle Player版です。協力プレイ・戦闘・クラフト・建築・ボスは後続段階です。

[遊び方・実装状況・制約](docs/phase0-status.md) / [仕様v0.4](docs/specs/open-world-survival-v0.4.md) / [今回の設計判断](docs/adr/0001-phase0-voxel-prototype.md)

新しい主要モジュール: `src/world/` は密度・編集・Streaming・Mesh生成、`src/simulation/` は共通ルールとWorker、`src/fluid/` / `src/physics/` は水と球体、`src/save/` は保存形式とIndexedDB、`src/content/` はデータ定義、`src/rendering/voxel/` はThree.js表示、`src/networking/transport.ts` は後続接続用interfaceです。

セーブは端末とURLごとのIndexedDBへ自動保存されます。URLを変更する前に画面の「書出」、移動先で「読込」を使ってください。

---

# FIELD — スマホ向け3Dゲーム

左下の仮想スティックで、床の上をキャラクターが移動する小さな3D世界です。PCではWASD・矢印キーで操作できます。「中央へ戻る」で位置をリセットできます。

## 技術構成
Three.js / TypeScript / Vite / Vitest / Playwright / GitHub Actions / Cloudflare Pages。まずWeb版を優先し、Capacitor・Electron・Tauriは将来検討します。

## 開発者向けコマンド
Node.js 22以上を使用します。通常、ユーザーが以下を実行する必要はありません。

```sh
npm install
npm run dev
npm run typecheck
npm run test
npm run build
npx playwright install chromium
npm run e2e
```

`dev`は開発用、`build`は公開用ファイルをdistへ出力します。`e2e`はビルド結果をブラウザで検証します。Linuxではブラウザのシステム依存が必要な場合に `npx playwright install --with-deps chromium` を使います。

## 構成
ゲームルールは `src/core/`、描画は `src/rendering/`、操作は `src/input/`、起動と連携は `src/platform/` と `src/main.ts`、画面スタイルは `src/ui/` に分離しています。将来用のgame/player/enemy/combat/audio/saveディレクトリとpublicアセットディレクトリを用意しています。詳細な変更規約はAGENTS.mdに記載しています。

## 自動検証
Pull Requestとmainへのpushで、npm ci→型チェック→Vitest→ビルド→Playwrightを実行します。E2Eでは起動、UI、canvas、移動、リセット、リサイズ、JavaScript例外、WebGLエラー表示を確認します。スクリーンショットと失敗時トレースをActionsのアーティファクトへ保存します。Android相当のブラウザ設定は実機のGPU・Safariの保証ではないため、公開URLで実機レビューも行います。

## Cloudflare Pages
Git連携で `usks213/threejs-game` を指定します。

| 設定 | 値 |
| --- | --- |
| Production branch | main |
| Framework preset | Vite |
| Build command | npm run build |
| Build output directory | dist |
| Root directory | 空欄（リポジトリ直下） |
| NODE_VERSION | 22 |
| Preview branches | すべての開発ブランチ |

mainは本番、featureブランチとPRはレビュー用Previewです。GitHubとCloudflareの外部認証だけはアカウント所有者が公式UIで承認します。APIキー・トークンをチャットやリポジトリに貼る必要はありません。

## 自然言語で開発
「敵を追加して」などの指示をCodexへ送ると、AIがAGENTS.mdを読み、featureブランチで実装・検証・GitHub反映を行い、Cloudflareの実際のPreview URLを提示します。スマホで遊んで、次の修正を自然言語で送ってください。新しいCodex Cloudタスクではこのリポジトリの環境を選択してください。継続作業にはGitHubへの書き込み権限とCloudflare Git連携が必要です。

## モバイルと性能
Safe Areaと縦横画面に対応し、描画解像度を抑え、木の繰り返し描画にはInstancedMeshを使っています。重い影・post processing・外部アセットは使用しません。WebGL起動失敗や接続喪失は画面に表示します。

## 既存のCloudflare Workers公開先
ユーザーから共有されたURLは https://threejs-game.usks213.workers.dev です。公開成功・Git連携は自動チェックの結果で確認します。これはWorkersのURLで、Pagesの公開先とは別です。

既存Workerでも同じゲームを配信できるよう、`wrangler.jsonc` に `dist` の静的配信を設定しています。WorkersのGit連携では対象リポジトリを `usks213/threejs-game`、本番ブランチを `main`、Build commandを `npm run build`、Deploy commandを `npx wrangler deploy` にします。Pagesの設定は上記のまま利用可能です。

ビルドは `deployment.json` にソースコミットを記録します。mainのCI成功後、GitHub Actionsの `verify-production` が既存URLに対象コミットが配信されたことを確認し、公開ゲームへPlaywrightテストを実行します。更新待ちは最大約10分です。デプロイ未完了・バージョン違い・HTTPエラー・E2E失敗を成功として扱いません。Preview URLはCloudflareの実際のデプロイ結果から取得し、公開確認のために本番へ未検証コードを反映しないでください。
