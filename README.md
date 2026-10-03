# TERRA — オープンワールド・サバイバル試作

仕様v0.4に従い、まずPhase 0の技術検証を進めています。今回はスマホで地形を掘る・盛る、水と岩を試せるSingle Player版です。協力プレイ・戦闘・クラフト・建築・ボスは後続段階です。

[遊び方・実装状況・制約](docs/phase0-status.md) / [仕様v0.4](docs/specs/open-world-survival-v0.4.md) / [設計判断](docs/adr/0001-phase0-voxel-prototype.md)

## 操作

左スティックで移動、画面をドラッグで視点変更。下のツールを選び、近くの地面に照準を合わせ、右の丸いボタンで使います。↑でジャンプ。「出発点へ」は位置だけ戻します。

PCはWASD/矢印、Spaceでジャンプ、Fでツール使用。マウスドラッグで視点を変えられます。

「保存」は端末のIndexedDBへ保存します。編集後と5秒ごとにも自動保存。「書出」「読込」はJSONバックアップです。別の端末や別のPreview URLへ移る前に書き出してください。セーブは端末とURLのオリジンごとに別です。

## 技術構成

Three.js / TypeScript strict / Vite / Vitest / Playwright / GitHub Actions。現行の配信はCloudflare WorkersのGit連携・静的アセットです。Pagesでも同じdistを配信できます。Capacitor・Electron・TauriはWeb版を完成させてから検討します。

## 開発者向けコマンド

Node.js 22以上を使用します。ユーザーが実行する必要はありません。

```sh
npm install
npm run dev
npm run typecheck
npm run test
npm run build
npx playwright install chromium
npm run e2e
```

`dev`は開発サーバー、`build`は公開用のdist生成、`e2e`はビルド結果のブラウザテストです。Linuxでは `npx playwright install --with-deps chromium` でシステム依存も用意します。

## ディレクトリ

| 場所 | 役割 |
| --- | --- |
| src/world/ | Seed密度場・SDF編集・Chunk/Brick Streaming・Surface Mesh生成 |
| src/simulation/ | Transport/描画非依存のGameSimulation、固定Tick、Worker接続 |
| src/fluid/, src/physics/ | 低頻度の水セルと限定的な球体衝突 |
| src/content/ | バイオーム等のデータ定義 |
| src/rendering/ | Three.js Scene・Voxel表示・GPU資源の管理 |
| src/input/ | タッチ・キーボード・カメラ入力 |
| src/save/ | 保存形式の検証とIndexedDB |
| src/networking/ | 後続WebRTC/Colyseus用Transport interface（接続未実装） |
| src/platform/, src/ui/ | 起動・連携・HUD・保存UI |
| public/ | 将来のモデル・テクスチャ・音声 |
| tests/unit/, tests/e2e/ | Nodeのロジック検証とブラウザ検証 |
| docs/ | 仕様、実装状況、ADR |

ゲームルールへDOM・Three.jsを持ち込まず、WorkerとNodeで同じSimulationを実行します。詳細なAI変更規約はAGENTS.mdに記載しています。

## 自動検証

Pull Requestとmainへのpushで、npm ci → 型 → Vitest → buildを実行します。Playwrightの全ブラウザ検証はmainへのpushと手動起動で実行します。PC/Android相当のChromiumで起動、入力、ジャンプ、画面回転、編集、水、物理、保存復元、書出、不正読込、WebGLエラーを検証し、スクリーンショットと失敗時トレースをActionsへ保存します。

PRの `deploy-preview` は検証済みdistをGitHub ActionsからCloudflare Previewへ直接公開し、Wranglerが返したURLとdeployment.jsonのコミットを照合します。Cloudflareビルド環境の起動待ちを避けるための経路です。mainの `verify-production` も公開コミットと起動用HTMLを確認します。これらは独立して進み、同じ全E2Eを公開先でも繰り返しません。待機超過、バージョン違い、HTTPエラー、テスト失敗を正常扱いしません。

Androidエミュレーションとソフトウェア描画CIは実機GPU/Safariの保証ではありません。スマホのレビューで操作感とFPSを確認します。

## Cloudflare配信

現行Worker名はthreejs-game、本番URLは https://threejs-game.usks213.workers.dev です。初期設定は以下です。

| Workers設定 | 値 |
| --- | --- |
| Repository | usks213/threejs-game |
| Production branch | main |
| Build command | npm run build |
| Deploy command | npx wrangler deploy |
| Preview command | npx wrangler preview |
| Enable Preview Builds | 有効 |
| Wrangler assets directory | ./dist |
| Wrangler previews | {} |

直接Preview公開には、指定CloudflareアカウントのWorkers Scripts編集権限を持つAPIトークンをGitHub Actionsの `CLOUDFLARE_API_TOKEN` Secretに一度登録します。トークン値をチャットへ送らないでください。失敗した公開ジョブだけ再実行でき、テスト・ビルドのやり直しは不要です。公開URLはActionsのSummary/ログ/preview-release artifactに記録します。Git連携は維持します。

Git接続・Preview BuildsはCloudflare側で設定します。wrangler.jsoncだけでは外部のGit設定を有効にできません。外部OAuthだけはアカウント所有者が公式UIで承認します。APIキーやトークンをチャット/リポジトリに貼らないでください。

Pagesへ接続する場合は同じリポジトリ、main、Vite、build command `npm run build`、output `dist`、root空欄、Node22、Preview開発ブランチすべてを使用します。現行WorkersとPagesを混同せず、移行は別作業として扱います。

## 自然言語での開発

「敵を追加して」などの指示→featureで実装→必要な確認とビルド→Preview URL→スマホでプレイ、の順で短く回します。「OK」ならAIがmainへマージし、修正点があれば同じPreviewを更新します。ユーザーのOK前にmainへ昇格しません。確認済みの同じソースを繰り返しテストせず、全E2Eの完了待ちでプレイを遅らせません。URLには今回の実装、重点的に触ってほしい操作、未完成・既知の問題を添えます。コードやGitを操作する必要はありません。

新しいCodex Cloudタスクではusks213/threejs-gameの環境を選びます。GitHub書き込み権限とCloudflare Git連携が必要です。変更はPreviewでプレイしてOKした後に安定版へ昇格します。

## 性能と制約

有限2km世界を全生成せず、近傍BrickをWorkerで生成。DPR最大1.5、霧・頂点カラー・シンプルな光、繰り返す景観/水/岩はInstancedMeshを使用。編集512回、水384セル、岩12個に制限しています。重い影やpost processingは導入していません。

画面の「性能・試作の範囲」でFPS・Draw calls・Triangles・処理時間・読み込み待機を確認できます。以前の1m/2m混在試作では800 Brick、表示128 Brick、29,438面、Geometry約0.98MB、生成284msでした。今回の共通1m格子の性能は別途計測し、スマホの読み込み・描画もレビューします。スマホ60FPSの保証ではありません。LOD境界や本格物理・マルチプレイ等の未検証点は実装状況に記載しています。

最新の操作：左スティックを倒したまま↑でジャンプ。画面ドラッグで水平360°・真上/真下まで視点変更。「視点を戻す」で復帰。岩は押す・飛び乗る・下を掘る、水は穴に注いで出口を掘る操作をレビューできます。未完成の機能と重点レビューは `docs/phase0-status.md` に記載します。
