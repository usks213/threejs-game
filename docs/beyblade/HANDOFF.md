# PR #7 — AIエージェント向け開発引き継ぎ

作成日: **2026-10-31（日本時間）**。会話履歴や前エージェントの作業環境がなくても再開するための資料です。

**対象はベイブレードX風の物理プロトタイプ「X ARENA」です。以前のVoxel／SDF一人称ゲームの開発を、このPRで再開しないでください。**

## 1. 最初に読む要約

| 項目 | 確認した状態 |
|---|---|
| リポジトリ | [usks213/threejs-game](https://github.com/usks213/threejs-game) |
| 対象PR | [#7](https://github.com/usks213/threejs-game/pull/7)、open / draft |
| 作業ブランチ | `feature/beyblade-x-arena` |
| この資料の実装基準コミット | `cc5ba5df8e830c1c695ac44216ad4cebaf64c5e0` |
| 確認時のmain | `fe54d7da0379cfd07b0a349c8d8f514dcf9a8e1a` |
| ゲームの入口 | `/beyblade/`。既存ゲーム `/` は別の入口 |
| 静的プレビュー | [CPU戦・カスタマイズ・図鑑](https://feature-beyblade-x-arena-threejs-game.usks213.workers.dev/beyblade/) |
| 基準コミットのCI | [40218640275 — success](https://github.com/usks213/threejs-game/actions/runs/40218640275) |
| オンライン | ローカルNode／ローカルworkerdで実装・検証済み。専用公開は保留 |
| 物理の完成度 | 6DOFの未校正近似。実物と同じ挙動・勝率を検証したものではない |

この資料を追加するコミットは上記の実装基準より後になります。再開時はPRの実際のheadを取得し、基準以降の差分を確認してください。この資料のSHAへブランチを戻す必要はありません。

読む順序は、リポジトリ直下の [AGENTS.md](../../AGENTS.md) → 本資料 → [機能概要](README.md) → 担当領域の設計資料です。最新のユーザー指示が優先されます。過去の測定報告にあるテスト件数・SHA・実行時間は、その報告当時の記録です。

## 2. ユーザーの意図と直近の変更

ユーザーは自然言語で要望を伝え、レビューURLで試遊する進め方を取っています。コード編集、Git操作、検証、PR更新はエージェント側で担当します。

直近の依頼と実装は次の対応です。

| 依頼 | 現状 |
|---|---|
| シュート位置をポインターで選びたい | マウス／タップ／ドラッグと矢印キー。青い選択範囲、位置マーカー、初期位置へ戻す操作を追加。座標は実際の物理開始位置に使用 |
| 「口頭で言ったことを反映できるようにして」 | 前エージェントはゲーム内音声入力と解釈し、パワー・角度・傾きの音声／文字入力、確認、反映を実装 |
| 決着時にリザルトを出してほしい | 勝敗、獲得点、合計スコア、ラウンド／試合終了、ドロー、退出による決着を表示 |
| フィニッシュの種類の文字を出してほしい | 決着直後に日本語フィニッシュ名のバナーを表示。余動中も保持 |

**音声入力という解釈についてユーザーから明示的な追認はまだありません。** 「口頭で言ったこと」が開発への指示反映を意味していた可能性もあります。追加の音声機能を当然の要望として広げず、次の指示で意図が異なる場合はそれに合わせてください。現状は自由な自然言語によるルール変更や自動シュートには対応していません。

今回の依頼は引き継ぎ資料の作成です。次の機能開発の優先順位や、mainへのマージは新たに依頼されていません。

## 3. 新しい環境で起動する

必要環境はNode.js 22以上、npm、Git。CIはNode.js 22を使用します。Three.js 0.180.0、TypeScript 5.9.2、Vite 7.3.7、Vitest 4.1.12、Playwright 1.55.1、Wrangler 4.152.0をlockfileで固定しています。

### 新規取得と状態確認

```sh
git clone --branch feature/beyblade-x-arena https://github.com/usks213/threejs-game.git
cd threejs-game
git status --short
git log -1 --oneline
npm ci
```

既存checkoutを使う場合は最初に作業中の差分とブランチを確認してください。別PRのcheckout、未コミット変更、他エージェントの更新を上書きしないこと。GitHub CLIを使える環境では次でも確認できます。

```sh
gh pr view 7 --repo usks213/threejs-game --json state,isDraft,headRefName,headRefOid,baseRefName,url
gh pr checks 7 --repo usks213/threejs-game
```

CLIが使えなければGitHubのPR画面／APIで同じ情報を取得できます。この資料は特定のAIサービスや前セッションの一時フォルダーに依存しません。

### CPU戦とローカルオンラインをまとめて起動

```sh
npm run build
npm run server:beyblade
```

`http://127.0.0.1:8787/beyblade/` を開きます。Nodeサーバーは`dist/`とWebSocket `/api/beyblade`を同時配信します。2つの独立したブラウザーコンテキストで「オンライン」→「対戦相手を探す」→両者の「シュート準備を送信」を操作してください。ローカル匿名対戦に外部認証情報は不要です。

UIの開発は別ターミナルで`npm run dev`。Vite側のオンライン欄にある「開発用の接続設定」で`ws://127.0.0.1:8787/api/beyblade`を指定できます。Nodeの静的画面へ変更を反映するには再buildが必要です。

`PORT`でNodeのポートを変更可能。既定のlisten先は`127.0.0.1`です。実機LAN検証が必要な場合だけ`HOST=0.0.0.0`を指定し、接続先IPとOrigin制約を確認してください。公開トンネルは起動しません。

## 4. コードの地図

パスはリポジトリルートからの相対パスです。

| 領域 | 主なファイル | 責務・変更時の注意 |
|---|---|---|
| 入口・ビルド | `beyblade/index.html`, `src/beyblade/main.ts`, `vite.config.ts` | 既存`/`と`/beyblade/`の複数入口。`dist/deployment.json`にコミットを出力 |
| 画面の接続 | `src/beyblade/ui/app.ts` | 構成選択、ローカル固定ステップ、カウントダウン、ネットワーク状態、結果UIを接続 |
| 画面構造 | `src/beyblade/ui/template.html`, `style.css` | canvas、設定、図鑑、リザルト。既存IDをE2Eが使用 |
| 位置入力 | `core/launch-position.ts`, `ui/launch-pointer.ts` | 以下の`src/beyblade/`配下。範囲検証、初期座標、Pointer capture、キャンセル、キーボード |
| 音声／文字 | `core/launch-command.ts`, `ui/launch-speech.ts` | DOMなしの数値パーサーとブラウザー音声API。確認前は適用しない |
| リザルト | `ui/battle-result.ts`, `core/rules.ts` | 日本語名称と表示／公式モデル上の得点。表示から再採点しない |
| 物理 | `src/beyblade/core/physics.ts`, `types.ts` | `createBattle`, `stepBattle`, `stepSettlingBattle`、剛体状態と判定 |
| 共有形状・慣性 | `core/body-geometry.ts`, `core/inertia.ts`, `data/assembly-mass.ts` | 同じ形状・COM・テンソルを接触／描画／分離へ使用 |
| 描画 | `src/beyblade/rendering/arena.ts`, `top-mesh.ts`, `stadium-surface.ts`, `top-preview.ts` | 対戦、共通部品メッシュ、適応分割した床、組立プレビュー。入力raycastもarenaが提供 |
| 部品モデル | `src/beyblade/data/catalog.ts`, `physical-estimates.ts` | `Build`→`profileFor`→物理`Profile`。合法構成、推定値、欠測情報 |
| 根拠データ | `data/official-data.ts`, `shape-facts.ts`, `expanded-shape-facts.ts`, `independent-masses.ts` | 公式台帳、形状観察、限定採用した独立秤量。前3行と同じ`src/beyblade/`配下 |
| 配布台帳 | `public/beyblade-data/` | 出典付きJSON／CSV、欠測台帳、調査範囲。実行時データとの整合を保つ |
| 通信 | `src/beyblade/network/client.ts`, `protocol.ts` | 再接続、heartbeat、sequence、状態メッセージ。クライアントはサーバーの結果を表示 |
| 対戦権威 | `server/beyblade/manager.ts` | キュー、合法構成／入力検証、試合の物理と得点、退出／再接続 |
| 実行アダプター | `server/beyblade/node.ts`, `run.ts`, `worker.ts` | Node WebSocket／HTTPとCloudflare Worker＋Durable Object |
| CI・公開 | `.github/workflows/ci.yml`, `playwright.config.ts`, `wrangler.beyblade.jsonc` | CIは1 browser worker。専用公開ジョブは`if: false`で保留 |
| 分析 | `scripts/analyze-beyblade-physics.ts`, `compare-beyblade-models.ts`, `compare-beyblade-com.ts` | 通常入力の軌道、部品交換、COM比較。生成結果には入力・モデル版を残す |

略記の`core/`・`ui/`・`data/`はこの表ではすべて`src/beyblade/`直下です。既存ゲームの`src/core/`などと混同しないでください。

## 5. 状態遷移と維持すべき仕様

### シュート位置と設定

- 単位はメートル・秒・ラジアン。UIはパーセントと度で入力し、`launchInput()`で変換します。
- `Launch`は`power`, `angle`, `tilt`, 任意の`position: {x,z}`。位置省略時は従来通りplayer 0が`(-0.105,-0.053)`、player 1が`(+0.105,+0.053)`。
- 選べる中心は半径0.12 m以内、player 0は`x <= -0.04`、player 1は`x >= +0.04`。これは初期重なりを避けるプロトタイプの制約で、実競技の公式ルールとは主張しません。
- キーボードは矢印で0.005 m移動、Enterで選択終了。選択モード中だけcanvasのtouch-actionを抑止します。
- `createBattle`とサーバーで位置を検証。位置を変えても発射仕事量を任意に増減させません。位置省略と明示的初期位置の完全一致を単体テストしています。
- UI範囲はパワー20〜100%、角度−50〜50°、傾き0〜30°。サーバーの既存受付範囲はpower 0.2〜1、angle ±π、tilt 0〜0.65 radで、UIと同一ではありません。
- ローカルはクリック時に`pendingLaunch`へ設定をコピーし、実時間で3秒のカウントダウン。オンラインは両者ready後にサーバーで既定2秒。カウントダウン終了時にUIの可変値を読み直さないこと。
- `launchSent`とサーバーのreadyでオンライン送信後の編集を止めます。試合中の部品変更は禁止。ラウンド間は部品を保持してシュートを調整します。

### 音声入力

`SpeechRecognition`／`webkitSpeechRecognition`を機能検出し、ユーザーがマイクボタンを押して初めて開始します。`ja-JP`、単発認識、15秒で打ち切り。停止、blur、非表示、破棄時に中止します。ブラウザーの音声サービスへ送信される場合がある旨をUIに表示します。

パーサーは全角英数字の正規化と「マイナス」に対応し、パワー・角度・傾きの整数だけを提案します。範囲外や同じ項目の重複は適用不可。認識した文字列を確認し「設定に反映」で初めて変更します。未対応・拒否・エラー時は文字入力を使います。音声だけでシュートは開始しません。任意の文意を理解するAI機能ではありません。

### 物理・得点・余動

- 固定ステップ`STEP=1/240`。COM位置・Quaternion・世界角運動量・完全慣性テンソルで姿勢と接触を計算する6DOF近似です。
- 物理コアはDOM／Three.jsへ依存させず、入力・時刻・状態を明示します。勝者の事前決定、中心吸引、無条件ダッシュ倍率で問題を隠さないこと。
- 公式評価、独立測定、推定値を区別します。同じパワーは同じ推定発射仕事量であり、異なる慣性のベイを同じRPMに固定しません。
- ルールはコードに収録した日本向け第12版をモデル化。Spin 1、Over 2、Burst 2、Xtreme 3、4点先取。同時判定はdraw／再シュート。最新の実競技ルールを再調査したという意味ではありません。
- `battle.result`確定時に一度だけ採点。対応する通常Burstはブレード組立・ラチェット・ビットの剛体へ分離し、結果確定後2.5秒の余動を`stepSettlingBattle`で計算します。CX内部層は一体、一体型などの特殊機構は未対応。
- 余動中は次ラウンドへ進めず、追加採点もしません。リザルトは決着時から表示し、次ラウンド／リセットで消去します。
- レール・肩部・ポケットは描画と物理で同じ表面定義を共有。見た目だけ直して接触形状を残さないこと。

### オンライン

`idle → queued → ready → countdown → battle → round-end → ready`。勝ち点到達や棄権は`match-end`。通信中断は`opponent-disconnected`になり、同じメモリー上のtokenで15秒の猶予中に再接続できます。再起動後の試合復旧はありません。

サーバーが物理・結果・得点を決め、クライアントはsnapshotを描画します。player 1の画面でも自分を青／YOUとするため、`app.ts`はtops、scores、winner、断片のsourceTopを自分基準へ並べ替えます。**物理のworld座標自体は左右反転しません。** オンライン2人目の選択範囲は右側です。

退出・猶予超過は棄権であり、架空のSpin等やフィニッシュ点を付けません。両者不在なら勝者なし。同一権威上の既定上限は2 active rooms／128 sessions。試合状態は揮発性です。詳細は[通信仕様](multiplayer.md)。

## 6. 検証済みの基準と再実行コマンド

### 基準コミットcc5ba5dの記録

2026-10-31時点でGitHub上の[CI 40218640275](https://github.com/usks213/threejs-game/actions/runs/40218640275)を再確認し、successを確認しました。

| 検証 | 基準コミットでの記録 |
|---|---|
| 型チェック・build | 成功 |
| 単体・統合 | 16ファイル／180件成功 |
| Playwright | 36件初回成功、オンライン1件は再試行成功（1 flaky）、重複オンライン1件は意図的skip。合計38ケース |
| 新規UI | 位置選択・キーボード・設定固定・文字入力・モック音声イベントがPC／Android相当で成功 |
| 対戦結果 | Burstの結果表示／余動／次ラウンド消去、オンラインの勝敗反転／退出表示を確認 |
| ローカルworkerd | 2クライアント対戦と再起動テスト成功 |
| ビルド識別 | CIでdistのSHA照合に成功 |
| 静的公開 | Cloudflare botがcc5ba5dのBuild／Deployment成功を記録。前回作業では公開`deployment.json`のHTTP 200と同SHAも確認 |
| 未検証 | 実マイクの認識精度、Android／iPhone実機、Safari実機、専用オンライン公開環境 |

オンラインの初回失敗は`tests/e2e/beyblade/online.spec.ts`の`arenaBattleObserved`が10秒以内にtrueにならないタイムアウト。原因は未特定です。再試行で通ったことを「不安定性を修正済み」と扱わないでください。従前の`7d17c68`では153テスト・ブラウザー31件初回成功でしたが、最新件数は上の表です。

### 通常の検証

```sh
npm run typecheck
npm run test
npm run build
npx playwright install --with-deps chromium
CI=1 npm run e2e
npm run test:worker
```

`AGENTS.md`の型・単体・build、および入力／描画変更時のE2Eを満たしてください。CIはSwiftShaderの資源競合を避けるため1 worker、再試行1回。テストの入力・物理時間・期限を緩めて失敗を隠さないこと。`E2E_BASE_URL`未指定時はPlaywrightがport 4173のローカルNodeサーバーを起動します。静的公開先に全E2Eを向けると、未公開のオンラインテストまで成功するとは限りません。

変更領域の切り分け用コマンド（全体の検証を置き換えるものではありません）:

```sh
npx vitest run tests/unit/beyblade/launch-controls.test.ts tests/unit/beyblade/multiplayer.test.ts
npx vitest run tests/unit/beyblade/rail-bank.test.ts tests/unit/beyblade/burst.test.ts
CI=1 npm run e2e -- tests/e2e/beyblade/arena.spec.ts --grep 'pointer and keyboard|spoken settings|speech recognition transcript|ordinary Burst'
CI=1 npm run e2e -- tests/e2e/beyblade/online.spec.ts --project=desktop-chromium
```

診断用の軌道レポートは、書き込み可能な任意の作業用ディレクトリへ出力します。

```sh
mkdir -p diagnostics
npm run analyze:beyblade -- diagnostics/trajectory.json
```

これは通常入力14ケースの記録で、全組合せの保証ではありません。出力をコミットする場合は目的と入力条件を明記します。

### 環境依存の失敗の記録

以前の制限環境ではChromium取得時のzip展開／lockエラー、workerd起動時の`uv_interface_addresses`エラーが発生しました。アプリの検証成功と混同せず、CIで実行した結果を使っています。同じ環境制約の回避を延々と試したり、権限・課金設定を変えたりしないこと。通常のローカル環境でも必ず起こる問題ではありません。

CIの`browser-test-results`と`beyblade-tested-dist`は保存期間7日です。再開時に失効していたら既存成果物が取得可能と仮定せず、再現テストで新しいtraceを取得してください。

## 7. 失ってはいけない回帰ケース

| ケース | 入力と確認点 |
|---|---|
| レール外への閉じ込め | 自分: ドランソード／3-60／N、80%／0°／8°。CPU: ドランソード／4-60／T、既定76%／−0.12 rad／0.11 rad。初期シュート位置を使用。CPUが外側に出た後に内側へ復帰し、ラウンドが終わる |
| Burst余動 | ヘルズサイズ／4-60／T、50%／−50°／30°、既定CPUと初期位置。結果・得点を固定したまま部品が動き、余動後に次へ進める |
| 旧クライアント互換 | position省略と明示的default座標で初期Battleが完全一致する |
| サーバーの入力検証 | 非有限・範囲外・相手側のpositionを拒否し、受理した位置はサーバー初期状態に反映される |
| オンライン2人目 | 両者に同一物理状態、互いに逆のYOU／OPPONENT得点・勝敗。退出にフィニッシュ点を足さない |
| 音声確認 | 認識／入力だけでは値を変更しない。確認後に反映、範囲外は反映不可。開始後はマイク／設定を止める |

レール修正は、連続肩部と内側の実接触側面への噛合を導入したものです。最初の修正時の「1.767秒で終了」と、独立質量を採用した後の「28.40秒でSpin終了」は異なるモデルの記録です。古い短時間に合わせるために現在の物理を改変しないでください。[レール回帰](rail-regression.md)を参照。

床の適応分割による軽量化は採用済みです。91,336→20,955三角形、同一条件で59.57→35.07秒という測定は過去のSwiftShader比較で、実機FPSや現headの測定ではありません。[描画性能](render-performance.md)を参照。

## 8. 未解決事項と次の作業候補

以下は引き継ぎ時の提案であり、追加実装の確定依頼ではありません。

| 優先候補 | 現状 | 着手時に取る証拠 |
|---|---|---|
| オンラインE2Eの不安定性 | BATTLE表示待ちが1回timeout、retry成功。原因未特定 | 初回失敗のtrace、WebSocket時系列、ready／countdown／battleのDOM遷移、runner負荷。根拠なく期限を延ばさない |
| タッチ・音声の実機確認 | エミュレーション／モックのみ | Android Chrome・iPhone Safariでタップ、ドラッグcancel、回転、マイク許可／拒否／停止、結果表示を確認。端末・OS・ブラウザー・SHAを記録 |
| シュートUIの意図確認 | 「口頭」の解釈は未追認。自分側に限定した位置選択は実装上の制約 | 次のユーザーフィードバックを優先し、未依頼の音声拡張や制約変更をしない |
| 物理の校正 | 形状・寸法・摩擦・COM／慣性等は推定が多い | 部品が一致する実測・動画追跡・比較条件を揃え、公式評価からSI値を捏造しない |
| 実機性能 | SwiftShader測定はあるが実機FPS未検証 | 物理と描画を分けて測定。同じ入力・状態の一致を保持し、物理tickを飛ばさない |
| 部品と競技形式 | 自由CX組替え、特殊機構、3on3画面／オンラインなど未完 | 合法構成・一次資料・欠測を明示。既存の3on3共通ロジックを完成UIと称さない |
| 専用オンライン公開 | 無料プラン確認の権限不足で保留 | 下記の境界を守り、解決する新たな根拠／承認が得られてから判断 |

台帳は前回調査時点の311部品レコード／156製品を保持しています。全製品の網羅や現在の在庫を意味しません。日付が進んだだけで発売判定・根拠を更新せず、`CATALOG_AS_OF`と出典を確認してください。`official-data.ts`と配布JSON／CSVは同じ更新として扱い、生成スクリプトを使う場合は入力の調査ファイルが存在することを先に確認します。

## 9. 公開・権限・Gitの境界

- 作業はPR #7のブランチに反映し、通常のGit連携静的プレビューを確認します。mainへのマージ、既存本番、PR #3〜#6の内容変更は依頼されていません。
- `wrangler.jsonc`は既存`threejs-game`用。専用オンライン設定は`wrangler.beyblade.jsonc`の`threejs-game-beyblade-pr7`＋`BeybladeArena`で、区別してください。
- `.github/workflows/ci.yml`の`publish-beyblade-preview`は`if: false`。過去に無料プラン確認の読み取りがHTTP 403となり、専用公開を止めています。新しい根拠／承認なしに解除、同じ拒否の再試行、新権限・課金・新しい認証情報の要求へ進まないこと。
- `npm run test:worker`はローカル検証であり、公開成功ではありません。静的プレビューが成功しても、専用オンラインが使えることにはなりません。
- `scripts/publish-beyblade.mjs`は引き継ぎ資料を読んだだけで実行するコマンドではありません。公開の前提が解決して初めて扱います。
- push前にリモートheadを再確認。他エージェントの更新があれば差分を統合し、force pushで上書きしないこと。コード変更の確認範囲とCI結果をPRへ記録します。
- 公開URLはCloudflare bot等の実デプロイ記録から取得し、`/deployment.json`のcommitと対象headを照合します。古いURLの存在だけで最新デプロイ成功と報告しません。

## 10. 詳細資料と根拠

| 資料 | 内容 |
|---|---|
| [PR #7本文](https://github.com/usks213/threejs-game/pull/7) | 最新状態、変更履歴、CIと公開記録 |
| [基準コミット](https://github.com/usks213/threejs-game/commit/cc5ba5df8e830c1c695ac44216ad4cebaf64c5e0) | 位置・音声設定・リザルト追加の差分 |
| [機能概要](README.md) | 操作と起動方法 |
| [物理](physics.md) / [共有モデル](part-model.md) | 6DOF、接触、推定式と限界 |
| [COM・慣性](center-of-mass.md) / [独立秤量](independent-mass-observations.md) | 形状からの質量分布と、限定した測定値採用 |
| [通信](multiplayer.md) | ライフサイクル、権威、制限、公開保留 |
| [レール回帰](rail-regression.md) / [描画性能](render-performance.md) | 再現条件、修正の理由、過去の測定 |
| [台帳範囲](catalog.md) / [依存関係](dependency-security.md) | データ欠測と依存更新時の注意 |

本資料の準備ではPR本文・head・CI状態・Cloudflare botのコメントと、基準コミットの実ファイルを照合しました。外部の競技ルール・製品発売状況・料金体系を2026-10-31時点で新たに調査した資料ではありません。

## 11. 次のAIエージェントへ渡す開始用プロンプト

以下をコピーして、末尾の「今回の依頼」を具体化してください。

```text
usks213/threejs-game の PR #7 の開発を引き継いでください。
対象は feature/beyblade-x-arena の /beyblade/（X ARENA）です。
以前のVoxel/SDFゲームとは別の開発です。

最初に実際のPR head・ブランチ・未コミット変更を確認し、
AGENTS.md、docs/beyblade/HANDOFF.md、docs/beyblade/README.mdを読んでください。
引き継ぎの実装基準はcc5ba5df8e830c1c695ac44216ad4cebaf64c5e0ですが、
その後の変更があれば優先して読み、基準へ巻き戻さないでください。

型・単体・buildと変更領域のブラウザーテストを実施し、
CIの初回失敗／再試行や未検証を隠さず報告してください。
位置・音声設定・リザルトは実装済みです。
実物同等の物理、実マイク認識、専用オンライン公開は検証済みと扱わないでください。
オンライン公開ジョブの保留を勝手に解除せず、mainへマージしないでください。

今回の依頼: （ここへ次に改善したい内容を記入）
```
