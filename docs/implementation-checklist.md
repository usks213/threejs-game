# PR4 implementation and acceptance ledger

Reference: [full sourced requirements](reference/enshrouded-requirements.md). Original browser game; statuses refer to implemented mechanics, not Enshrouded parity.

Order: P0 foundation/save; P1 complete progression; P2 breadth/regions; P3 expression/UI; P4 cooperation; final acceptance. No unchecked row counts as complete.
Source audit: 2026-10-04 21:47 UTC. This pass inspected code and test definitions; it did not execute new tests or certify browser acceptance. 「実装あり」means a reachable integration exists in source, not a passed final acceptance. 「部分実装」retains the explicit remaining scope. Paths under core/rendering are relative to src/prototype unless fully qualified. No original requirement was removed.


Acceptance update (2026-10-04 23:32 UTC): [47b698 CI](https://github.com/usks213/threejs-game/actions/runs/37239967895) passed the PC/Android normal-input gather → hearth → save/reload route and menu/reset checks. [40a2d1 CI](https://github.com/usks213/threejs-game/actions/runs/37242258018) passed Android continuation, PC/Android menus, elemental controls and motion; the longer chapter and cooperative browser acceptance remain failed/pending fixes. The exact 40a2d1 preview was verified by deployment job111553585248. Opt-in sampled-world migration, revised HUD/materials and corrected routes below still require the next SHA browser run. No full-campaign completion is claimed.

Acceptance update (2026-10-05): physical animal movement, player wet/fire/shock exposure, metal armor reactions, traversal rendering, portable verified saves and protocol-2 compatibility are integrated. Normal-Core seven-region, western-road and specialist routes now walk around the animal yard and berry beds using ordinary controls; all three focused routes pass without granting resources or changing collision rules. Typecheck/build and discovery of all 54 browser test cases pass. Final aggregate and exact-commit PC/Android/browser deployment verification are tracked separately; all 171 original rows remain, and full parity is not claimed.

Published checkpoint (2026-10-05 09:13 UTC): commit `3eb279af724f0faea5d539e1bb8e21033d1d83ad`, [CI37287775537](https://github.com/usks213/threejs-game/actions/runs/37287775537). GitHub 780/780 tests, typecheck and build passed; deploy job111693190536 verified the exact preview commit and protocol-2 relay health. Browser save history/file transfer passed on PC/Android; input/duel/motion and elemental cases also passed. Invitation/co-op availability, legacy-to-streamed conversion, a standard-preset water-visibility assertion, and authored long-play routes exposed failures. The following patch addresses their concrete causes and retains browser acceptance as pending until its own run. The legacy conversion failure protected the original save before writes.

First-chapter ridge correction (2026-10-05): [Android job111722895799](https://github.com/usks213/threejs-game/actions/runs/37297158358/job/111722895799), artifact11341885822, reached rescue, equipment, the crypt warden, grapple/cache/glide and flame tier2, then failed the final guard. Trace checkpoints show HP68.2 at the flame with no medicine, but grass6/cloth24 still held. The route passed the approaching guard before turning about147°: HP68.2→45.8 during the waypoint, then23.4→1 during the turn. Its first guarded counter reduced guard HP100→58 before death. The correction gathers a guaranteed six extra grass, crafts two additional real bandages with exact cost assertions, and faces the guard at z=-24 before passing it. Normal Core full-chapter and delayed ridge look/counter routes pass with zero deaths and no state grants; typecheck/build and PC/Android browser-test discovery pass. Damage, hit geometry, aim tolerances, death checks and timeouts are unchanged. Actual PC/Android first-chapter acceptance remains pending the corrected SHA; local Chromium was not retried because the known launch socket restriction occurs before a page opens.

| ID | Requirement | Status | Implementation/evidence | Remaining |
|---|---|---|---|---|
| F01 | ゲーム開始と再開 | 実装あり・実操作未検証 | src/prototype/campaign-ui.ts; input.ts; app.ts; tests/unit/prototype-input.test.ts | 新規/続き/取消/入力解放を実ブラウザで通す |
| F02 | 安全な入力状態 | 実装あり・実操作未検証 | src/prototype/campaign-ui.ts; input.ts; app.ts; tests/unit/prototype-input.test.ts | 新規/続き/取消/入力解放を実ブラウザで通す |
| F03 | 地形衝突 | 実装あり・実操作未検証 | src/prototype/core/simulation.ts; tests/unit/prototype.test.ts; player.test.ts | 斜面・段差・走行・落下を各地域の実操作で確認 |
| F04 | 歩行/走行 | 実装あり・実操作未検証 | src/prototype/core/simulation.ts; tests/unit/prototype.test.ts; player.test.ts | 斜面・段差・走行・落下を各地域の実操作で確認 |
| F05 | ジャンプ/着地 | 実装あり・実操作未検証 | src/prototype/core/simulation.ts; tests/unit/prototype.test.ts; player.test.ts | 斜面・段差・走行・落下を各地域の実操作で確認 |
| F06 | カメラ | 部分実装・ブラウザ受入待ち | rendering/exploration-camera.ts; scene.ts; campaign-ui.ts; tests/unit/exploration-camera.test.ts; campaign-camera-settings.test.ts | 一人称既定に加え保存可能な三人称/距離設定。SDF球掃引・近壁で身体非表示・照準正本維持を5試験で確認。PC/Android設定/再開ケース作成、実画面は未検証 |
| F07 | グライダー (F05) | 実装あり・実操作未検証 | src/prototype/core/simulation.ts (gliding/grapple); core/campaign.ts; tests/unit/campaign.test.ts | 実際のフック経路/障害物/解除/スタミナ切れ/滑空着地を検査 |
| F08 | フック (F03) | 実装あり・実操作未検証 | src/prototype/core/simulation.ts (gliding/grapple); core/campaign.ts; tests/unit/campaign.test.ts | 実際のフック経路/障害物/解除/スタミナ切れ/滑空着地を検査 |
| F09 | 垂直移動 | 部分実装・ブラウザ受入待ち | core/climbing.ts; survival.ts; simulation.ts; tests/unit/climbing*.test.ts | 階段/フックに加え木材6の建築梯子。実SDF/両面/回転/天井/他身体/破損/疲労/跳躍解除/再開を検査。初期0素材→採集→炉→作業台→梯子→昇降→着地を生産操作だけで通過。自由壁登攀/専用登攀アニメ・PC/タッチ受入は未完 |
| F10 | 水泳/潜水 | 部分実装 | src/prototype/core/simulation.ts; regions.ts (REGIONAL_WATERS) | 水面/潜水/酸素と岸上がりを実操作確認。全水域の統一は未確認 |
| F11 | 死亡/復活 | 実装あり・実操作未検証 | src/prototype/core/simulation.ts (respawn/safePosition); core/campaign.ts; tests/unit/campaign-runtime.test.ts | 地形編集による閉込め、死亡後回収・安全帰還の実操作確認 |
| F12 | 救済 | 実装あり・実操作未検証 | src/prototype/core/simulation.ts (respawn/safePosition); core/campaign.ts; tests/unit/campaign-runtime.test.ts | 地形編集による閉込め、死亡後回収・安全帰還の実操作確認 |
| F13 | 時間刻み | 部分実装 | tests/unit/campaign.test.ts; enemy-tactics.test.ts; core/simulation.ts | 霧/敵イベントの30Hz対120Hz定義はある。移動/全効果の時間不変性は未網羅 |
| F14 | ロード状態 | 実装あり・実操作未検証 | core/world-bootstrap.ts; world-bootstrap.worker.ts; app.ts; tests/unit/world-bootstrap.test.ts | 初期拠点→背景統合/失敗/取消のブラウザ表示を確認 |
| E01 | オープンワールド | 部分実装・公開未検証 | core/regions.ts; regional-world.ts; expedition-west.ts; western-sample-provider.ts; tests/unit/expedition-west*.test.ts | 元の7小地域に加え、別v4 opt-inで集落/二口坑道/2本の約60m道路/帰還路を接続。物理通行/有限報酬/閉開門は局所試験済み。原作規模や全域の自由探索密度、公開ブラウザ受入は未達 |
| E02 | 霧危険地域 | 実装あり・実操作未検証 | core/campaign.ts; core/simulation.ts; tests/unit/campaign.test.ts | 霧猶予/深度/報酬/退出回復の通常プレイ受入 |
| E03 | 致死危険度 | 実装あり・実操作未検証 | core/campaign.ts; core/simulation.ts; tests/unit/campaign.test.ts | 霧猶予/深度/報酬/退出回復の通常プレイ受入 |
| E04 | 霧内の報酬 | 実装あり・実操作未検証 | core/campaign.ts; core/simulation.ts; tests/unit/campaign.test.ts | 霧猶予/深度/報酬/退出回復の通常プレイ受入 |
| E05 | 地図 | 部分実装・局所検証済 | campaign-map.ts; campaign-presenter.ts; campaign-ui.ts; tests/unit/campaign-map.test.ts | 発見した地域/実在経路と通過済み西方道の等縮尺略図、未発見地点の遮蔽、番号/記号付き非重複ラベルと座標一覧。17投影/境界/探索試験。完全地形測量・実ブラウザ受入は未達 |
| E06 | 地図ピン | 実装あり・ブラウザ受入待ち | campaign-map.ts; app.ts; tests/unit/campaign-map.test.ts; tests/e2e/campaign-map.spec.ts | 同じ投影のタッチ逆変換とキーボード選択、保存範囲制限/非有限値拒否/重複ID防止。削除/保存も接続。PC/Android実操作ケース作成、未実行 |
| E07 | 高所ランドマーク | 簡易実装・受入試験待ち | src/prototype/core/regions.ts + regional-world.ts + tests/unit/regions.test.ts | Normal-play/browser verification and remaining breadth |
| E08 | 移動網 | 実装あり・実操作未検証 | core/campaign.ts; tests/unit/campaign.test.ts (discovered hearth travel) | 炉の発見→移動→再読込を実操作確認 |
| E09 | 昼夜 | 部分実装 | core/simulation.ts (worldHour/worldDay); core/regions.ts | 昼夜時計/夜限定地点はある。空/光/敵との全体同期は未検証 |
| E10 | 天候 | 部分実装・ブラウザ受入待ち | core/weather.ts; CoreSimulation.tick; rendering/scene.ts; tests/unit/weather.test.ts | 保存時計で晴/雨/風/霧/雪。近傍の燃焼状態/敵/落下素材を屋根判定付きで濡らし消火、質量別の風力と滑空偏流。0.5秒16本の屋根レイ上限。局所近似で気圧/流域/全世界降雨は未実装、実画面は未検証 |
| E11 | 寒冷 | 実装あり・実操作未検証 | core/simulation.ts; core/campaign.ts; core/homestead.ts; tests/unit/campaign.test.ts | 寒冷/食事/屋根の休息を実プレイ確認。各バフ表現の一貫性は未確認 |
| E12 | 休息 | 実装あり・実操作未検証 | core/simulation.ts; core/campaign.ts; core/homestead.ts; tests/unit/campaign.test.ts | 寒冷/食事/屋根の休息を実プレイ確認。各バフ表現の一貫性は未確認 |
| E13 | 食事 | 実装あり・実操作未検証 | core/simulation.ts; core/campaign.ts; core/homestead.ts; tests/unit/campaign.test.ts | 寒冷/食事/屋根の休息を実プレイ確認。各バフ表現の一貫性は未確認 |
| E14 | 状態異常 | 部分実装・Core検証済 | core/player-environment.ts; simulation.ts; companion.ts; tests/unit/player-environment*.test.ts | 敵/地形に加え各プレイヤーの接触炎上/濡れ/感電、鎧材質、遮蔽、有限パルス、復活/保存/旧形式/同期を検査。術者も共有地形の影響を受ける。全状態異常/プレイヤー部位破壊/ブラウザ受入は未達 |
| E15 | 宝箱 | 実装あり・実操作未検証 | core/campaign.ts; core/regions.ts; tests/unit/campaign.test.ts | 宝箱/発見/報酬の有限性は定義済み。通常探索で入手可能か受入 |
| E16 | 発見報酬 | 実装あり・実操作未検証 | core/campaign.ts; core/regions.ts; tests/unit/campaign.test.ts | 宝箱/発見/報酬の有限性は定義済み。通常探索で入手可能か受入 |
| C01 | アイテム定義 | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| C02 | 採集 | 実装あり・実操作未検証 | core/elements.ts; core/survival.ts; core/simulation.ts; tests/unit/element-integration.test.ts | 実攻撃→破壊→素材回収の全地域/材質受入 |
| C03 | 採掘 | 実装あり・実操作未検証 | core/elements.ts; core/survival.ts; core/simulation.ts; tests/unit/element-integration.test.ts | 実攻撃→破壊→素材回収の全地域/材質受入 |
| C04 | 資源段階 | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| C05 | インベントリ | 部分実装 | campaign-ui.ts; campaign-presenter.ts; core/survival.ts; core/campaign.ts | 共通材料/アイテム台帳と一覧はある。重さ/枠移動等の採否は未確定 |
| C06 | レシピ表示 | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| C07 | 制作トランザクション | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| C08 | 複数個制作 | 実装・局所検証済・ブラウザ未 | campaign-ui.ts; campaign-presenter.ts; campaign-commands.ts; tests/unit/campaign-bulk-crafting.test.ts | 1/最大/指定1〜20回、複合素材/出力数/所持上限、原子的消費と入力保持を45重点試験。PC/Androidケースは発見のみ、実行未 |
| C09 | 設備制作 | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| C10 | 生産待ち | 簡易実装・受入試験待ち | src/prototype/core/homestead.ts + tests/unit/homestead.test.ts | Normal-play/browser verification and remaining breadth |
| C11 | 収納 | 簡易実装・受入試験待ち | src/prototype/core/homestead.ts + tests/unit/homestead.test.ts | Normal-play/browser verification and remaining breadth |
| C12 | 一括収納 | 簡易実装・受入試験待ち | src/prototype/core/homestead.ts + tests/unit/homestead.test.ts | Normal-play/browser verification and remaining breadth |
| C13 | 修理/耐久 | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| C14 | 解体 | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| C15 | 入手ヒント | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| C16 | 収集図鑑 | 実装あり・ブラウザ受入待ち | core/discovery.ts; campaign-codex.ts; campaign-codex-view.ts; tests/unit/discovery-codex.test.ts; tests/e2e/campaign-codex.spec.ts | 初入手を即時記録し、消費せず永続化。素材・制作・報酬・釣り・農業・加工・収納経路と旧保存互換を11試験で確認。日本語の発見状態・地域・入手・用途、検索と絞込。未発見の場所は伏せる。PC/Android 4ケースはローカルChromiumのsocket EPERMで起動前に停止、CIで実操作受入が必要 |
| B01 | 基本攻撃 | 実装あり・実操作未検証 | core/simulation.ts; core/motion.ts; tests/unit/prototype.test.ts; motion.test.ts | 武器接触/硬直/盾方向/回避の実操作確認。ゲームの手触りは単体で判定しない |
| B02 | 重攻撃 | 実装あり・実操作未検証 | core/simulation.ts; core/motion.ts; tests/unit/prototype.test.ts; motion.test.ts | 武器接触/硬直/盾方向/回避の実操作確認。ゲームの手触りは単体で判定しない |
| B03 | 防御 | 実装あり・実操作未検証 | core/simulation.ts; core/motion.ts; tests/unit/prototype.test.ts; motion.test.ts | 武器接触/硬直/盾方向/回避の実操作確認。ゲームの手触りは単体で判定しない |
| B04 | パリィ | 実装あり・実操作未検証 | core/simulation.ts; core/motion.ts; tests/unit/prototype.test.ts; motion.test.ts | 武器接触/硬直/盾方向/回避の実操作確認。ゲームの手触りは単体で判定しない |
| B05 | 回避 | 実装あり・実操作未検証 | core/simulation.ts; core/motion.ts; tests/unit/prototype.test.ts; motion.test.ts | 武器接触/硬直/盾方向/回避の実操作確認。ゲームの手触りは単体で判定しない |
| B06 | 弓 | 部分実装 | core/simulation.ts; core/campaign.ts; tests/unit/campaign.test.ts | 弓の弾消費/魔法/剣・弓・杖は実装。武器種別の体験と長距離照準は未検証 |
| B07 | 魔法 | 部分実装 | core/simulation.ts; core/campaign.ts; tests/unit/campaign.test.ts | 弓の弾消費/魔法/剣・弓・杖は実装。武器種別の体験と長距離照準は未検証 |
| B08 | 武器差 | 実装あり・ブラウザ受入待ち | core/equipment.ts; core/motion.ts; core/simulation.ts; tests/unit/equipment-tools.test.ts | 剣・大剣・短剣の連続軌道/間合い/速度/消費/怯み、盾併用制限、既存弓/杖をCore検証。新系統の実ブラウザ戦闘は未検証 |
| B09 | 特殊技 | 部分実装 | core/enemy-tactics.ts (focus); core/simulation.ts (special); tests/unit/enemy-tactics.test.ts | 実際のFocus蓄積→消費→効果を受入。原作全特殊技ではない |
| B10 | 属性 | 実装あり・実操作未検証 | core/elements.ts; entity-elements.ts; simulation.ts; tests/unit/element-integration.test.ts | 静的物体/敵/ドロップへの5元素反応と負荷上限をブラウザ確認 |
| B11 | 敵AI | 部分実装・ブラウザ受入待ち | core/enemy-tactics.ts; guard-awareness.ts; simulation.ts; tests/unit/guard-awareness.test.ts | 通常番兵もSDF遮蔽・警戒・最後に見た場所の捜索・帰還を使う。閉じた実扉では非感知、開くと警戒する統合試験。全敵種/複雑な経路探索と視覚受入は未完 |
| B12 | 敵移動 | 簡易実装・受入試験待ち | src/prototype/core/enemy-tactics.ts + tests/unit/enemy-tactics.test.ts; runtime integration pending browser | Normal-play/browser verification and remaining breadth |
| B13 | 敵の予備動作 | 簡易実装・受入試験待ち | src/prototype/core/enemy-tactics.ts + tests/unit/enemy-tactics.test.ts; runtime integration pending browser | Normal-play/browser verification and remaining breadth |
| B14 | 複数敵 | 簡易実装・受入試験待ち | src/prototype/core/enemy-tactics.ts + tests/unit/enemy-tactics.test.ts; runtime integration pending browser | Normal-play/browser verification and remaining breadth |
| B15 | ボス段階 | 簡易実装・受入試験待ち | src/prototype/core/enemy-tactics.ts + tests/unit/enemy-tactics.test.ts; runtime integration pending browser | Normal-play/browser verification and remaining breadth |
| B16 | ボス報酬 | 実装あり・実操作未検証 | core/campaign.ts; simulation.ts; tests/unit/campaign-runtime.test.ts | 討伐→報酬→死亡/再読込で再付与しないことを通常進行で確認 |
| B17 | 経験値 | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| B18 | スキル | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| B19 | 装備成長 | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| B20 | ジェム | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| B21 | ビルド成立 | 部分実装 | core/campaign.ts; simulation.ts | 剣/弓/杖のデータと修飾効果あり。3系統すべてのボスまでの通常攻略は未確認 |
| B22 | 戦闘明瞭性 | 部分実装 | rendering/rig.ts; element-effects.ts; core/motion.ts | 動作/予兆/効果あり。複数敵での視認性と実機の手触り未検証 |
| H01 | 拠点核 | 実装あり・実操作未検証 | core/campaign-world.ts; core/campaign.ts; tests/unit/campaign.test.ts | 炉の点灯/強化/領域条件を新規プレイで受入 |
| H02 | 配置プレビュー | 実装あり・実操作未検証 | core/survival.ts; core/simulation.ts; rendering/scene.ts; tests/unit/building-tools.test.ts; build-preview.test.ts | 8レシピ/回転/開口/地形破壊/返却/undoあり。実操作・保存後の衝突を確認 |
| H03 | 建築形状 | 実装あり・実操作未検証 | core/survival.ts; core/simulation.ts; rendering/scene.ts; tests/unit/building-tools.test.ts; build-preview.test.ts | 8レシピ/回転/開口/地形破壊/返却/undoあり。実操作・保存後の衝突を確認 |
| H04 | 地形編集 | 実装あり・ブラウザ受入待ち | core/soil-fill.ts; core/survival.ts; tests/unit/soil-fill.test.ts; soil-normal-play.test.ts; docs/soil-fill-acceptance.md | 土9の有限盛土・熊手切削・平面補修・SDF表示/衝突・無傷撤去/undo・保存を実装。ゼロ付与の通常Core採集→制作→盛土→歩行→撤去→再読込を検証。公開ブラウザ実操作は未検証 |
| H05 | 回転/スナップ | 実装あり・実操作未検証 | core/survival.ts; core/simulation.ts; rendering/scene.ts; tests/unit/building-tools.test.ts; build-preview.test.ts | 8レシピ/回転/開口/地形破壊/返却/undoあり。実操作・保存後の衝突を確認 |
| H06 | 削除/返却 | 実装あり・実操作未検証 | core/survival.ts; core/simulation.ts; rendering/scene.ts; tests/unit/building-tools.test.ts; build-preview.test.ts | 8レシピ/回転/開口/地形破壊/返却/undoあり。実操作・保存後の衝突を確認 |
| H07 | Undo | 実装あり・実操作未検証 | core/survival.ts; core/simulation.ts; rendering/scene.ts; tests/unit/building-tools.test.ts; build-preview.test.ts | 8レシピ/回転/開口/地形破壊/返却/undoあり。実操作・保存後の衝突を確認 |
| H08 | 家具 | 簡易実装・受入試験待ち | src/prototype/core/homestead.ts + tests/unit/homestead.test.ts | Normal-play/browser verification and remaining breadth |
| H09 | NPC救出 | 部分実装・Core通し検証済 | core/campaign.ts; expedition-west.ts; expedition-west-integration.ts; tests/unit/west-specialists*.test.ts | 鍛冶師ナギに加え西方の木工師マキ/錬金師セナ。実在する身体への照準救出、条件/有限報酬/拠点への一度限りの移住を検査。初期素材0から2名救出と会話/制作/再開を通過。実ブラウザと原作規模の人数は未達 |
| H10 | NPC専門性 | 部分実装・Core通し検証済 | core/campaign.ts; expedition-west-integration.ts; campaign-presenter.ts; tests/unit/west-specialists*.test.ts | 救出台帳でのみ専業レシピを解放。風織り翼の速度/消費と錬金杖の属性威力をCoreへ接続、移住先会話から素材/制作場所を案内。日常生活AIはH11に別記 |
| H11 | NPC生活 | 3人実装・Core検証済 / 公開受入待ち | core/npc-life.ts; core/western-npc-life.ts; rendering/npc-life-view.ts; tests/unit/*npc-life*.test.ts; docs/npc-daily-life.md | ナギ/マキ/セナの実歩行・仕事/交流/休息、別々の実寝台と屋根、現在位置会話、建築/身体回避、厳密な旧形式移行・保存/ホスト表示を接続。初期素材0から西方2名救出→生活→会話/制作→再開を検査。限定拠点内の生活で、任意の寝床割当や住人同士の会話イベントは未実装。公開PC/Androidの視覚・日夜受入は未検証 |
| H12 | 作物 | 簡易実装・受入試験待ち | src/prototype/core/homestead.ts + tests/unit/homestead.test.ts | Normal-play/browser verification and remaining breadth |
| H13 | 家畜/ペット | 簡易実装・受入試験待ち | src/prototype/core/homestead.ts + tests/unit/homestead.test.ts | Normal-play/browser verification and remaining breadth |
| H14 | 水設備 | 部分実装 | core/water.ts; core/watermill.ts; watermill-acceptance.md | 既存の局所水槽・放水レバーと固定水車を接続。新しい水路・排水口・全世界流体は対象外。満水では停止 |
| H15 | 生産動力 | 実装あり・ブラウザ受入待ち | core/watermill.ts; tests/unit/watermill*.test.ts; tests/e2e/watermill.spec.ts; watermill-acceptance.md | 有限素材で固定水車を組立/修理。実セル面の落水量のみで草葉6→布2、停水/静水/閉塞で停止。原子性・保存・権限・ゼロ付与Core経路を検証。PC/Android4ケースは定義のみ、実ブラウザ未検証 |
| H16 | 装飾/収集展示 | 部分実装 | core/homestead.ts; simulation.ts (buildFurniture) | 寝床/机/火鉢/敷物はある。収集展示/自由装飾の広がりは未実装 |
| W01 | 初期草原 (独自名 | 簡易実装・受入試験待ち | src/prototype/core/regions.ts + regional-world.ts + tests/unit/regions.test.ts | Normal-play/browser verification and remaining breadth |
| W02 | 森林 (翠の森) | 簡易実装・受入試験待ち | src/prototype/core/regions.ts + regional-world.ts + tests/unit/regions.test.ts | Normal-play/browser verification and remaining breadth |
| W03 | 立体湿地 (沈み木の谷) | 簡易実装・受入試験待ち | src/prototype/core/regions.ts + regional-world.ts + tests/unit/regions.test.ts | Normal-play/browser verification and remaining breadth |
| W04 | 高原 (赤岩の台地) | 簡易実装・受入試験待ち | src/prototype/core/regions.ts + regional-world.ts + tests/unit/regions.test.ts | Normal-play/browser verification and remaining breadth |
| W05 | 荒野 (灰砂の廃都) | 簡易実装・受入試験待ち | src/prototype/core/regions.ts + regional-world.ts + tests/unit/regions.test.ts | Normal-play/browser verification and remaining breadth |
| W06 | 雪山 (白嶺) | 簡易実装・受入試験待ち | src/prototype/core/regions.ts + regional-world.ts + tests/unit/regions.test.ts | Normal-play/browser verification and remaining breadth |
| W07 | 湖沼 (蒼水の盆地) | 簡易実装・受入試験待ち | src/prototype/core/regions.ts + regional-world.ts + tests/unit/regions.test.ts | Normal-play/browser verification and remaining breadth |
| W08 | POI分類 | 簡易実装・受入試験待ち | src/prototype/core/regions.ts + regional-world.ts + tests/unit/regions.test.ts | Normal-play/browser verification and remaining breadth |
| W09 | POI内容 | 簡易実装・受入試験待ち | src/prototype/core/regions.ts + regional-world.ts + tests/unit/regions.test.ts | Normal-play/browser verification and remaining breadth |
| W10 | ダンジョン | 小規模実装・通常Core検証済・ブラウザ未 | core/echo-vault.ts; rendering/echo-vault-view.ts; campaign-session.ts; tests/unit/echo-vault*.test.ts; tests/e2e/echo-vault.spec.ts; 局所最終872/872・型/ビルド/62件列挙PASS | 薄響の封庫で開始0素材→手掛かり→実採掘→鍵→予告罠/安全側道/停止→実開閉機/格子→唯一報酬→徒歩退出/再開。旧保存衝突回避・全所有形状/台帳/収納整合・死亡/共有再適用を検査。戦闘/休憩を含む大型迷宮、多数の鍵謎、PC/Android実画面は未完。docs/echo-vault-acceptance.md |
| W11 | 昼夜限定POI | 実装あり・実操作未検証 | core/regions.ts; core/campaign.ts; tests/unit/campaign.test.ts | 夜限定読物/敵の時間判定あり。表示と実体の同期を確認 |
| W12 | 戦闘勢力 | 簡易実装・受入試験待ち | src/prototype/core/enemy-tactics.ts + tests/unit/enemy-tactics.test.ts; runtime integration pending browser | Normal-play/browser verification and remaining breadth |
| W13 | 中ボス | 簡易実装・受入試験待ち | src/prototype/core/enemy-tactics.ts + tests/unit/enemy-tactics.test.ts; runtime integration pending browser | Normal-play/browser verification and remaining breadth |
| W14 | 地域ボス | 簡易実装・受入試験待ち | src/prototype/core/enemy-tactics.ts + tests/unit/enemy-tactics.test.ts; runtime integration pending browser | Normal-play/browser verification and remaining breadth |
| W15 | クエスト | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| W16 | 地域解放 | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| W17 | 伝承/収集 | 簡易実装・受入試験待ち | src/prototype/core/regions.ts + regional-world.ts + tests/unit/regions.test.ts | Normal-play/browser verification and remaining breadth |
| W18 | 到達目標 | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| I01 | 自然資源 | 部分実装 | core/materials.ts; core/campaign.ts; core/homestead.ts; core/regions.ts | 素材と制作参照あり。カテゴリ全品目の入手/用途網羅は未確認 |
| I02 | 加工資源 | 部分実装 | core/materials.ts; core/campaign.ts; core/homestead.ts; core/regions.ts | 素材と制作参照あり。カテゴリ全品目の入手/用途網羅は未確認 |
| I03 | 危険地域資源 | 部分実装 | core/materials.ts; core/campaign.ts; core/homestead.ts; core/regions.ts | 素材と制作参照あり。カテゴリ全品目の入手/用途網羅は未確認 |
| I04 | 道具 | 実装あり・ブラウザ受入待ち | core/equipment.ts; core/elements.ts; core/simulation.ts; tests/unit/equipment-normal-play.test.ts | 独立制作/選択した斧・つるはしの材質別採集、熊手の切削整地、槌の有料建築/解体、有限修理を実装。新規Core通常操作→保存を検証。土9の有限盛土/切削切替と無傷撤去を追加。ブラウザは定義のみ |
| I05 | 移動具 | 実装あり・実操作未検証 | core/campaign.ts; core/simulation.ts | 鉤縄/滑空具と実移動あり。保温装備含む実攻略経路は受入待ち |
| I06 | 近接武器 | 実装あり・ブラウザ受入待ち | core/motion.ts; core/simulation.ts; rendering/rig.ts; tests/unit/equipment-tools.test.ts | 片手/大剣/短剣の共有描画・命中軌道、速度/射程/消費/怯みとSDF壁遮蔽をCore検証。各新系統の全章ブラウザ完走は未検証 |
| I07 | 遠距離/魔法 | 部分実装 | core/campaign.ts; core/simulation.ts | 剣/弓/杖/盾/防具を実装。両手/短剣/全防具部位・全魔法体系ではない |
| I08 | 防具/副装備 | 実装あり・ブラウザ受入待ち | core/equipment.ts; core/campaign.ts; rendering/rig.ts; tests/unit/equipment-tools.test.ts | 頭/胴/脚/盾/共用護符・指輪枠、実軽減/重量/寒冷/材質反応、個別表示、旧5枠保存の復元を検証。画面選択定義あり、実ブラウザ受入待ち |
| I09 | 消耗品 | 部分実装 | core/campaign.ts; core/homestead.ts | 包帯/料理/修理と消費ガードあり。魚料理・全状態治療は未網羅 |
| I10 | 食品 | 部分実装・統合受入中 | core/campaign.ts; homestead.ts; fishing.ts; tests/unit/fishing.test.ts | 料理/食事、実水面での釣りと魚料理を接続中。釣竿・餌・待ち/食いつき/巻上げ、原子的な魚料理コストを重点検査。全食品/治療体系と実ブラウザ受入は未完 |
| I11 | 農業/生物 | 実装あり・実操作未検証 | core/homestead.ts; tests/unit/homestead.test.ts | 種の準備/栽培/餌/動物生産あり。世界内モデルとの視覚一致は未検証 |
| I12 | 建材 | 部分実装 | core/survival.ts; core/homestead.ts; core/simulation.ts | 壁/床/屋根/窓/階段/扉・作業台/家具はある。全建材系統ではない |
| I13 | 設備/家具 | 部分実装 | core/survival.ts; core/homestead.ts; core/simulation.ts | 壁/床/屋根/窓/階段/扉・作業台/家具はある。全建材系統ではない |
| I14 | 強化/重要品 | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| I15 | 外見/収集 | 部分実装 | core/regions.ts; core/homestead.ts | 古文書/家具の一部のみ。衣装・楽器・化石展示等は未実装 |
| I16 | データ健全性 | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| U01 | HUD | 実装あり・実操作未検証 | app.ts; input.ts; campaign-ui.ts; core/simulation.ts (target) | HUD/入力/照準コンテキストはある。全状態とPC/Android通常操作は未検証 |
| U02 | 操作案内 | 実装あり・実操作未検証 | app.ts; input.ts; campaign-ui.ts; core/simulation.ts (target) | HUD/入力/照準コンテキストはある。全状態とPC/Android通常操作は未検証 |
| U03 | コンテキスト操作 | 実装あり・実操作未検証 | app.ts; input.ts; campaign-ui.ts; core/simulation.ts (target) | HUD/入力/照準コンテキストはある。全状態とPC/Android通常操作は未検証 |
| U04 | メニュー階層 | 簡易実装・受入試験待ち | src/prototype/campaign-ui.ts (browser acceptance pending) | Normal-play/browser verification and remaining breadth |
| U05 | アイテム詳細 | 簡易実装・受入試験待ち | src/prototype/campaign-ui.ts (browser acceptance pending) | Normal-play/browser verification and remaining breadth |
| U06 | クエスト追跡 | 簡易実装・受入試験待ち | src/prototype/campaign-ui.ts (browser acceptance pending) | Normal-play/browser verification and remaining breadth |
| U07 | レシピ検索 | 簡易実装・受入試験待ち | src/prototype/campaign-ui.ts (browser acceptance pending) | Normal-play/browser verification and remaining breadth |
| U08 | 建築UI | 実装あり・実操作未検証 | app.ts; core/simulation.ts; rendering/scene.ts; tests/unit/build-preview.test.ts | 建築モード/回転/緑赤プレビューの実画面を確認 |
| U09 | キー設定 | 簡易実装・受入試験待ち | src/prototype/campaign-ui.ts (browser acceptance pending) | Normal-play/browser verification and remaining breadth |
| U10 | コントローラー | 部分実装・実機受入待ち | input.ts; tests/unit/gamepad-input.test.ts; index.html | 標準 Gamepad の移動/視点/戦闘/建築とメニュー操作に加え、15 操作のボタン交換、左右スティック交換、上下反転、遊び調整、初期化と旧セーブ互換を接続。Pause とメニュー決定/戻るは固定し、変更後は中立入力を要求。39 件の設定/実入力/保存/連続編集試験を通過。実画面の変更・再開ケースを追加、実ブラウザと物理パッドの受入は未完 |
| U11 | 小画面 | 部分実装・ブラウザ受入待ち | campaign-ui.css; style.css; tests/e2e/campaign-hud.spec.ts | HUD背景/文字/地域欄の分離と建築コンテキスト表示を修正。960/844/568幅の次CI画像を確認、実端末試験は未完 |
| U12 | アクセシビリティ | 部分実装・ブラウザ受入待ち | campaign-ui.ts; input.ts; rendering/camera-motion.ts; tests/unit/camera-motion.test.ts | 感度/キー/音量、説明文100〜125%、歩行揺れ/被弾カメラ揺れ/赤明滅の軽減を保存。初回OSの揺れ軽減設定を反映。武器命中軌道は不変。色代替・全字幕/小画面実画面は未網羅 |
| U13 | 苦手表現 | 対象外・将来再評価 | rendering/rig.ts; core/regions.ts | 現在の敵一覧に蜘蛛は登場しないため蜘蛛置換は不要。将来対象生物を追加する際は判定/難易度を変えない代替表示を要検討 |
| U14 | 日本語 | 簡易実装・受入試験待ち | src/prototype/campaign-ui.ts (browser acceptance pending) | Normal-play/browser verification and remaining breadth |
| G01 | 人物 | 部分実装・描画受入待ち | rendering/rig.ts; traversal-view.ts; core/motion.ts; tests/unit/rig-rewind.test.ts; traversal-view.test.ts | 一人称/三人称、鎧材質の色/粗さ、実滑空中の木布翼と鉤縄先端への綱を接続。保存巻戻し時に損傷メッシュを正しく戻す。全装備/人物差/実描画は未達 |
| G02 | 地形 | 簡易実装・受入試験待ち | src/prototype/core/regions.ts + regional-world.ts + tests/unit/regions.test.ts | Normal-play/browser verification and remaining breadth |
| G03 | 植生 | 簡易実装・受入試験待ち | src/prototype/core/regions.ts + regional-world.ts + tests/unit/regions.test.ts | Normal-play/browser verification and remaining breadth |
| G04 | 地域差 | 部分実装・ブラウザ受入待ち | rendering/meshes.ts; tests/unit/voxel-materials.test.ts | 独自材質色・草/土法線・雪/灰/赤土の色と粗さ。実画面確認と植生/地形/建築のさらなる地域差は未完 |
| G05 | 建物 | 簡易実装・受入試験待ち | src/prototype/core/regions.ts + regional-world.ts + tests/unit/regions.test.ts | Normal-play/browser verification and remaining breadth |
| G06 | 光と影 | 部分実装 | rendering/scene.ts; balanced-pipeline.ts; campaign-decor.ts; element-effects.ts | 光/霧/水/元素効果はある。地域時間天候の視覚整合・黒描画の回帰未検証 |
| G07 | 霧 | 部分実装 | rendering/scene.ts; balanced-pipeline.ts; campaign-decor.ts; element-effects.ts | 光/霧/水/元素効果はある。地域時間天候の視覚整合・黒描画の回帰未検証 |
| G08 | 水 | 部分実装 | rendering/scene.ts; balanced-pipeline.ts; campaign-decor.ts; element-effects.ts | 光/霧/水/元素効果はある。地域時間天候の視覚整合・黒描画の回帰未検証 |
| G09 | 戦闘効果 | 部分実装 | rendering/scene.ts; balanced-pipeline.ts; campaign-decor.ts; element-effects.ts | 光/霧/水/元素効果はある。地域時間天候の視覚整合・黒描画の回帰未検証 |
| G10 | 空と時間 | 部分実装 | rendering/scene.ts; balanced-pipeline.ts; campaign-decor.ts; element-effects.ts | 光/霧/水/元素効果はある。地域時間天候の視覚整合・黒描画の回帰未検証 |
| G11 | 音 | 部分実装・聴取未検証 | src/prototype/audio.ts; app.ts; tests/unit/audio.test.ts; campaign-audio-settings.test.ts | 独自の効果音/5音源の環境・和音、天候/危険への変化、音楽/効果/環境の個別音量、隠れたタブの停止を接続。12音声API代替試験。実ブラウザ聴取・距離音響は未検証 |
| G12 | 資産品質 | 部分実装 | docs/assets-and-audio.md; public/THIRD_PARTY_NOTICES.txt; rendering/meshes.ts | 独自のSDF/人物/竿/炎/合成音とThree.js MIT通知を記録。材質表現は改善済みだが公開画面の欠損/ちらつき/高品質比較は未検証 |
| S01 | 保存範囲 | 実装あり・Core検証済 | campaign-session.ts; src/save/campaign-file-transfer.ts; tests/unit/campaign-file-transfer.test.ts; campaign-soak.test.ts | 所持/装備/進行/地形/元素/敵/建築/水/設定を保存。通常経路後の5反復とオフラインJSON往復を検査。ファイルUI・実機の容量/操作受入は未完 |
| S02 | 再開 | 実装あり・Core検証済 | campaign-session.ts; checkpoint.ts; campaign-file-transfer.ts; tests/unit/campaign-file-transfer.test.ts | 全構成要素を隔離検証して復元。ファイル選択と確定を分離し、検証済み不変バイトの証明を再利用。未知形式/破損/改ざん/容量不足では原本保持。旧形式の同期検証は数秒止まり得る |
| S03 | バージョン移行 | 部分実装・ブラウザ受入待ち | src/save/campaign-migration.ts; western-campaign-migration.ts; campaign-store-selection.ts; tests/unit/*campaign*save*.test.ts | 明示opt-inのv2→v3→v4、原本/専用アーカイブ保持・未来版拒否・22俳優/地形台帳の原子検証。変更済み地形と新内容が衝突する場合は移行拒否。実ブラウザでの受入は次の対象SHAで確認待ち |
| S04 | バックアップ | 実装あり・ブラウザ受入待ち | src/save/checkpoint.ts; tests/unit/checkpoint-archives.test.ts; tests/e2e/campaign-save-history.spec.ts | 自動保存と別の不変履歴、復元前退避、日時/容量/保存先表示、確認/取消。破損/容量/衝突時は停止、32履歴を自動削除しない。重点86試験通過、実メニュー受入未実行 |
| S05 | 保存容量 | 部分実装・ブラウザ受入待ち | src/save/checkpoint.ts; campaign-store-selection.ts; tests/unit/checkpoint-archives.test.ts | 書込失敗/破損時に元データ保持、履歴容量表示と32件上限。検証済みJSONの端末書出し/確認付き取込を追加。自動削除は行わず、32履歴上限の手動整理は未実装 |
| S06 | 世界リセット | 実装あり・ブラウザ受入待ち | src/save/checkpoint.ts; src/save/campaign-startup.ts; app.ts; tests/unit/checkpoint-archives.test.ts; campaign-startup.test.ts | 新規前に検証済みの現行/回復保存を不変保管。招待プレビューは永続保存へ一切アクセスせずゲストの新規/復元を禁止。型・重点試験通過、PC/Android実行は次の対象SHAで確認待ち |
| M01 | ネットワーク範囲 | 部分実装 | src/prototype/network/{protocol,relay-room,coop-client,game-session,game-frame}.ts; core/companion.ts; tests/unit/{campaign-network,companion,game-session-authority}.test.ts | 実体2人・同一移動/戦闘・共有持物/進行・差分同期・切断停止を統合。専用常時サーバー/個人キャラ分離は未実装。公開2ブラウザ受入待ち |
| M02 | 接続 | 部分実装 | src/prototype/network/{protocol,relay-room,coop-client,game-session,game-frame}.ts; core/companion.ts; tests/unit/{campaign-network,companion,game-session-authority}.test.ts | 実体2人・同一移動/戦闘・共有持物/進行・差分同期・切断停止を統合。専用常時サーバー/個人キャラ分離は未実装。公開2ブラウザ受入待ち |
| M03 | 同期 | 部分実装 | src/prototype/network/{protocol,relay-room,coop-client,game-session,game-frame}.ts; core/companion.ts; tests/unit/{campaign-network,companion,game-session-authority}.test.ts | 実体2人・同一移動/戦闘・共有持物/進行・差分同期・切断停止を統合。専用常時サーバー/個人キャラ分離は未実装。部屋更新を描画時計から分離し、シェーダー非同期準備と待ち時間観測を追加（docs/cooperation-render-scheduling.md）。鮮度/権限の期限は維持。公開2ブラウザ再受入待ち |
| M04 | 個人/世界進行 | 部分実装 | src/prototype/network/{protocol,relay-room,coop-client,game-session,game-frame}.ts; core/companion.ts; tests/unit/{campaign-network,companion,game-session-authority}.test.ts | 実体2人・同一移動/戦闘・共有持物/進行・差分同期・切断停止を統合。専用常時サーバー/個人キャラ分離は未実装。公開2ブラウザ受入待ち |
| M05 | 権限 | 部分実装 | src/prototype/network/{protocol,relay-room,coop-client,game-session,game-frame}.ts; core/companion.ts; tests/unit/{campaign-network,companion,game-session-authority}.test.ts | 実体2人・同一移動/戦闘・共有持物/進行・差分同期・切断停止を統合。専用常時サーバー/個人キャラ分離は未実装。公開2ブラウザ受入待ち |
| M06 | 会話/安全 | 部分実装 | prototype/network/coop-client.ts; tests/unit/campaign-network.test.ts | 文字チャット/ミュートのUIを接続。公開2ブラウザ検査待ち。音声なし |
| M07 | 共有 | 未実装 | network/game-session.ts | 招待による一時的な協力のみ。保存世界の常時公開/所有権移転/公開取消は別設計が必要で、公開用データ送信機能は実装していない |
| Q01 | 新規プレイ | 部分検証 | tests/unit/campaign-normal-play.test.ts; tests/e2e/campaign-progression.spec.ts | 元の開始状態から通常Core操作だけで採集→炉→救出→装備→ボス→鉤縄/滑空→炉2→尾根→保存再開PASS、HP/素材/座標付与なし。これは描画/キータッチの証明ではない。実ブラウザ全章受入は未完 |
| Q02 | 進行網 | Core通し検証済・ブラウザ未 | tests/unit/campaign-regional-play.test.ts; helpers/normal-campaign-player.ts | 元の開始状態から7地域の印、9討伐報酬、有限補給/修理/強化、湖の泳ぎ帰還、保存一致がPASS。座標/HP/素材の付与なし。既知の地形に対する自動操作者のCore整合性証明で、人間の操作難度/PC・タッチ試験は別 |
| Q03 | 3系統 | Core通し検証済・ブラウザ未 | tests/unit/campaign-combat-builds-normal.test.ts; campaign-normal-play.test.ts | 初期空所持から近接/旅弓/灯木の杖を生産操作で制作・装備、入口番兵→職人→中核番人撃破。弓は有限矢の物理命中、杖は濡れ/雷の間隔と回復予算を使用。PC/タッチによる3系統受入は未実施 |
| Q04 | 失敗系 | 部分検証 | tests/unit/save.test.ts; campaign.test.ts; homestead.test.ts; building-tools.test.ts; campaign-runtime.test.ts | 単体/統合の失敗・原子性・保存検査あり。ブラウザで同等操作を検証待ち |
| Q05 | 連打/競合 | 部分検証 | tests/unit/save.test.ts; campaign.test.ts; homestead.test.ts; building-tools.test.ts; campaign-runtime.test.ts | 単体/統合の失敗・原子性・保存検査あり。ブラウザで同等操作を検証待ち |
| Q06 | 建築保存 | 部分検証 | tests/unit/save.test.ts; campaign.test.ts; homestead.test.ts; building-tools.test.ts; campaign-runtime.test.ts | 単体/統合の失敗・原子性・保存検査あり。ブラウザで同等操作を検証待ち |
| Q07 | 最終到達 | Core通し検証済・ブラウザ未 | tests/unit/campaign-regional-play.test.ts; western-normal-play.test.ts | 七つの灯の最終守護者と報酬、追加西方の坑道/開閉機/2本道/帰還路を通常Core操作で到達。公開ブラウザの最終到達・見た目・操作性は未検証 |
| Q08 | 長時間 | Core10分検証済・ブラウザ未 | tests/unit/campaign-soak.test.ts; docs/performance-soak.md | 生産経路で初章後に探索/制作取消/収納/元素56回を継続、600秒=18,000 tick、28周、5保存復元、死亡0。イベント/粒子/素材と64ブロック3MiBキャッシュ上限を検査。実時間/ブラウザ/GPU/実機の長時間受入は未完 |
| Q09 | 性能 | 部分検証 | tests/unit/world-streaming.test.ts; world-bootstrap.test.ts; bootstrap-performance.test.ts | CPU初期生成/near-first測定あり。実機FPS・長時間歩行の公開計測は未完 |
| Q10 | 技術 | 部分検証 | tests/unit/*.test.ts; package.json | 担当者の局所type/unit/build成功記録あり。全統合後の最終SHA CI/E2Eは未完 |
| Q11 | ブラウザー | Not implemented / unverified | — | Audit and implement |
| Q12 | 公開確認 | 部分検証 | 3eb279af deployment job111693190536; preview-release artifact11335461632 | 公開SHA/ヘルス一致確認済み。全チェックリスト受入後の最終版確認は未完 |
| Q13 | 見た目比較 | Not implemented / unverified | — | Audit and implement |
| Q14 | 残課題 | 追跡中 | docs/implementation-checklist.md | 全171IDを保持し未実装/簡易/未検証を明示。最終公開結果に合わせ更新 |

Equipment/tool checkpoint details and explicit limitations: [equipment tools acceptance](equipment-tools-acceptance.md).

最新の公開ブラウザ検証と未解消失敗は `docs/survival-wave-browser-status.md` を参照。939件のルール検証合格は、全171要件や全ブラウザ受入の完了を意味しない。
