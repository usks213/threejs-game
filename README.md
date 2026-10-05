# 空と灯の大地 — Voxel Co-op Adventure


PR3の基盤から分岐した、独自の三層世界を探索するvoxel協力アドベンチャーです。権威サーバーの共有世界で、地形を掘り、部品を組み、地表・空・洞海を旅します。任天堂作品の地図・登場人物・素材・台詞は使用していません。

- [新作仕様と54項目](docs/adventure/voxel-coop-adventure-spec.md)
- [実装・試験・未完了項目](docs/adventure/implementation-status.md) / [項目別台帳](docs/adventure/feature-status.json)
- [最初の協力探索](docs/adventure/play-guide.md) / [移動拠点と収納](docs/adventure/mobile-camp-acceptance.md)

ローカル実装と公開プレビューは別の版です。台帳のローカル成功は公開ブラウザやスマートフォンの受入完了を意味しません。公開待ち・部分実装・実機未検証を残しており、全仕様完成とはしていません。

以下の従来操作は旧生成器1〜3との互換説明も含みます。新作では地形を盛る際に石を消費し、道具・装備は旅の工作から作れます。協力プレイ中の世界はサーバーへ保存され、誰かがメニューを開いても時間は止まりません。

## 操作

左上の目標をタップすると、必要な制作・建築画面を開きます。素材の不足数を見ながら道具→作業台→装備→祭壇へ進めます。下部の「食事」で即回復、攻撃は長押し対応。回避はスティック方向へ。建築部品は透過プレビューを確認して「回転」「設置」。カメラ距離・感度・太陽の影は「☰」から調整できます。

右側の青い「放水」は長押しで連続放水。空を向いていても、素材や魔力がなくても使えます。水流はプレイヤー・岩・木材・敵を押します。HP・体力・魔力は左上のバー、保存・読込・出発点へ戻る操作は右上の「☰」です。

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
| src/networking/ | WebRTC/無料WSS中継・入力予測/同期・Dedicated接続 |
| src/platform/, src/ui/ | 起動・連携・HUD・保存UI |
| public/ | 将来のモデル・テクスチャ・音声 |
| tests/unit/, tests/e2e/ | Nodeのロジック検証とブラウザ検証 |
| docs/ | 仕様、実装状況、ADR |

ゲームルールへDOM・Three.jsを持ち込まず、WorkerとNodeで同じSimulationを実行します。詳細なAI変更規約はAGENTS.mdに記載しています。

## 自動検証

ゲーム変更のPull Requestとmainへのpushで、npm ci → 型 → 必要なVitest → buildを実行します。今回のpush差分から対象を選び、接続テストは通信変更時、ブラウザテストは影響する操作だけを実行します。文書・CI設定だけの変更ではゲームの再テスト・再ビルド・再公開を省きます。Playwrightの全ブラウザ検証はmainへのpushと手動起動で実行します。PC/Android相当のChromiumで起動、入力、ジャンプ、画面回転、編集、水、物理、保存復元、書出、不正読込、WebGLエラーを検証し、スクリーンショットと失敗時トレースをActionsへ保存します。

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

有限2km世界を全生成せず、近傍BrickをWorkerで生成。DPR最大1・長辺900pxのHDR描画、木/鉱石/岩/木材/破片はInstancedMesh、水面は共有Meshで描画。編集100,000回、近傍の水2048セルを処理・描画する予算があります。水を出す数には上限を設けず、遠方の水は保持して近づいた時に処理します。岩の個数制限はありません。太陽の投影影は近傍1024px・約8Hz更新で、設定から無効化できます。草は近傍2200株・1 draw call。PBR材質、物理スカイ、昼夜連動のSH/IBL、半解像度ボリュメトリック光とSSR、自動露出、ブルームを使用します。詳しくは[描画設計](docs/adr/0011-mobile-hdr-rendering.md)。SSRが取得できない画面外の反射はIBLで補います。

画面の「性能・試作の範囲」でFPS・Draw calls・Triangles・処理時間・読み込み待機を確認できます。以前の1m/2m混在試作では800 Brick、表示128 Brick、29,438面、Geometry約0.98MB、生成284msでした。今回の共通1m格子の性能は別途計測し、スマホの読み込み・描画もレビューします。スマホ60FPSの保証ではありません。物理の近似・外部NAT・長時間負荷等の未検証点は実装状況に記載しています。

最新の操作：左スティックを倒したまま↑でジャンプ。画面ドラッグで水平360°・真上/真下まで視点変更。「視点を戻す」で復帰。岩は押す・飛び乗る・下を掘る、水は穴に注いで出口を掘る操作をレビューできます。未完成の機能と重点レビューは `docs/phase0-status.md` に記載します。

## 冒険と協力プレイ
冒険メニューで持ち物・クラフト・建築・魔法・世界を操作。採集→装備/作業台→祭壇でボス召喚→撃破で次地域。PCはE採集、Q攻撃、R強撃、Shift回避。食事・寝床・焚き火・箱も利用できます。岩の12個制限は撤廃。
全仕様の進捗は `docs/specs/implementation-status.md`。完成前の公開を全仕様完成と扱いません。

`npm run server` は任意のNode/Colyseus Dedicatedを起動。保存先はサーバー側の `GAME_SAVE_DIRECTORY`。常設公開にはHTTPS/WSSと運用先が必要です。Cloudflare Workerの静的配信はNodeサーバーを常設実行しません。Signalingは `apps/signaling` で独立し、ゲーム状態を計算しません。Hostの直接接続が成立しない場合は既存の無料WSS中継へ自動で切り替えます。有料TURNは契約していません。Dedicatedの参加者IDは端末に保存し、再参加時に持ち物を復元します。保存ファイルは一時ファイルから置換し、同じ保存先に複数の部屋が同時書込しないよう制限します。


現在のユーザー方針は、v0.4全体を実装してからまとめてレビューすることです。途中の公開はチェックポイントとして扱い、レビュー待ちで実装を止めません。mainへのマージは引き続き本人のプレイOK後です。

## 草原プリプロダクション（作業中）

現在の新規ゲームは、採集→道具→狩猟→調理と3食→拠点→雷鹿の試練をつなぐ草原キャンペーンです。完全再現の完成版ではありません。受入要件と未実装は `docs/milestones/preproduction-meadows.md` に記録します。

木は斧で伐採し、建築にはハンマーを作ります。屋根を作業台の上に置くと制作・無料修理が可能です。料理台を焚き火の上に置き、生肉を載せて焼けたら取り出します。食事は異なる3種類。鹿の証2個を北の祭壇へ持ち込み、討伐した証を出発地点で奉納します。放水とVoxel掘削は引き続き使用できます。

従来のセーブを削除せず草原用の保存領域を分けています。旧ワールドはURLに `?campaign=legacy` を付けて開けます。書出・読込も使えます。

### コア改善版の操作（2026-10-04）
ゲームは常に横向きの画面です。スマホを横持ちすると自然に操作できます。左スティックで移動、画面で視点、攻撃/強撃/回避/押している間の盾/ジャンプ、長押し放水。拾う・扉・箱・設備は照準を合わせると中央に操作が出ます。持ち物の上段8枠を押すと装備/食事、枠の移動で割り当てを変更します。

PCはWASD、画面クリックでマウス視点、左クリック攻撃、右ボタンを押してガード。Spaceジャンプ、Ctrl/C回避、Shift走る、E照準の物を使う、Tab持ち物、B建築、R強撃/建築回転、F放水、1–8クイックスロット、Escapeでメニュー/マウス解除。建築中は左クリック設置、右クリック終了。ハンマー装備で建物に照準を合わせE修理、X解体。

木/建物/地形の削りとDrop、水の0.5mセル、旧セーブ互換性の設計はADR0013、今回のレビュー対象と制約は`docs/milestones/core-action-review.md`を参照してください。
