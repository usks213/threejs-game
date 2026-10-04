# PR4 implementation and acceptance ledger

Reference: [full sourced requirements](reference/enshrouded-requirements.md). Original browser game; statuses refer to implemented mechanics, not Enshrouded parity.

Order: P0 foundation/save; P1 complete progression; P2 breadth/regions; P3 expression/UI; P4 cooperation; final acceptance. No unchecked row counts as complete.
Source audit: 2026-10-04 21:47 UTC. This pass inspected code and test definitions; it did not execute new tests or certify browser acceptance. 「実装あり」means a reachable integration exists in source, not a passed final acceptance. 「部分実装」retains the explicit remaining scope. Paths under core/rendering are relative to src/prototype unless fully qualified. No original requirement was removed.


| ID | Requirement | Status | Implementation/evidence | Remaining |
|---|---|---|---|---|
| F01 | ゲーム開始と再開 | 実装あり・実操作未検証 | src/prototype/campaign-ui.ts; input.ts; app.ts; tests/unit/prototype-input.test.ts | 新規/続き/取消/入力解放を実ブラウザで通す |
| F02 | 安全な入力状態 | 実装あり・実操作未検証 | src/prototype/campaign-ui.ts; input.ts; app.ts; tests/unit/prototype-input.test.ts | 新規/続き/取消/入力解放を実ブラウザで通す |
| F03 | 地形衝突 | 実装あり・実操作未検証 | src/prototype/core/simulation.ts; tests/unit/prototype.test.ts; player.test.ts | 斜面・段差・走行・落下を各地域の実操作で確認 |
| F04 | 歩行/走行 | 実装あり・実操作未検証 | src/prototype/core/simulation.ts; tests/unit/prototype.test.ts; player.test.ts | 斜面・段差・走行・落下を各地域の実操作で確認 |
| F05 | ジャンプ/着地 | 実装あり・実操作未検証 | src/prototype/core/simulation.ts; tests/unit/prototype.test.ts; player.test.ts | 斜面・段差・走行・落下を各地域の実操作で確認 |
| F06 | カメラ | 部分実装 | src/prototype/core/simulation.ts; rendering/scene.ts; campaign-ui.ts | 一人称の感度/視線はある。ズーム・壁際・保存設定の受入は未確認 |
| F07 | グライダー (F05) | 実装あり・実操作未検証 | src/prototype/core/simulation.ts (gliding/grapple); core/campaign.ts; tests/unit/campaign.test.ts | 実際のフック経路/障害物/解除/スタミナ切れ/滑空着地を検査 |
| F08 | フック (F03) | 実装あり・実操作未検証 | src/prototype/core/simulation.ts (gliding/grapple); core/campaign.ts; tests/unit/campaign.test.ts | 実際のフック経路/障害物/解除/スタミナ切れ/滑空着地を検査 |
| F09 | 垂直移動 | 部分実装 | src/prototype/core/regional-world.ts; regions.ts | 階段/フック経路はある。梯子や一般登攀の入口/出口は未実装 |
| F10 | 水泳/潜水 | 部分実装 | src/prototype/core/simulation.ts; regions.ts (REGIONAL_WATERS) | 水面/潜水/酸素と岸上がりを実操作確認。全水域の統一は未確認 |
| F11 | 死亡/復活 | 実装あり・実操作未検証 | src/prototype/core/simulation.ts (respawn/safePosition); core/campaign.ts; tests/unit/campaign-runtime.test.ts | 地形編集による閉込め、死亡後回収・安全帰還の実操作確認 |
| F12 | 救済 | 実装あり・実操作未検証 | src/prototype/core/simulation.ts (respawn/safePosition); core/campaign.ts; tests/unit/campaign-runtime.test.ts | 地形編集による閉込め、死亡後回収・安全帰還の実操作確認 |
| F13 | 時間刻み | 部分実装 | tests/unit/campaign.test.ts; enemy-tactics.test.ts; core/simulation.ts | 霧/敵イベントの30Hz対120Hz定義はある。移動/全効果の時間不変性は未網羅 |
| F14 | ロード状態 | 実装あり・実操作未検証 | core/world-bootstrap.ts; world-bootstrap.worker.ts; app.ts; tests/unit/world-bootstrap.test.ts | 初期拠点→背景統合/失敗/取消のブラウザ表示を確認 |
| E01 | オープンワールド | 部分実装 | core/regions.ts; core/regional-world.ts; tests/unit/regions.test.ts | 7つの約10m四方のポケットと通路。広域自由探索の規模/密度は未達 |
| E02 | 霧危険地域 | 実装あり・実操作未検証 | core/campaign.ts; core/simulation.ts; tests/unit/campaign.test.ts | 霧猶予/深度/報酬/退出回復の通常プレイ受入 |
| E03 | 致死危険度 | 実装あり・実操作未検証 | core/campaign.ts; core/simulation.ts; tests/unit/campaign.test.ts | 霧猶予/深度/報酬/退出回復の通常プレイ受入 |
| E04 | 霧内の報酬 | 実装あり・実操作未検証 | core/campaign.ts; core/simulation.ts; tests/unit/campaign.test.ts | 霧猶予/深度/報酬/退出回復の通常プレイ受入 |
| E05 | 地図 | 実装あり・実操作未検証 | campaign-ui.ts; campaign-presenter.ts; campaign-session.ts | 地図位置/ピン保存/削除/長い名称/小画面をブラウザ確認 |
| E06 | 地図ピン | 実装あり・実操作未検証 | campaign-ui.ts; campaign-presenter.ts; campaign-session.ts | 地図位置/ピン保存/削除/長い名称/小画面をブラウザ確認 |
| E07 | 高所ランドマーク | 簡易実装・受入試験待ち | src/prototype/core/regions.ts + regional-world.ts + tests/unit/regions.test.ts | Normal-play/browser verification and remaining breadth |
| E08 | 移動網 | 実装あり・実操作未検証 | core/campaign.ts; tests/unit/campaign.test.ts (discovered hearth travel) | 炉の発見→移動→再読込を実操作確認 |
| E09 | 昼夜 | 部分実装 | core/simulation.ts (worldHour/worldDay); core/regions.ts | 昼夜時計/夜限定地点はある。空/光/敵との全体同期は未検証 |
| E10 | 天候 | Not implemented / unverified | — | Audit and implement |
| E11 | 寒冷 | 実装あり・実操作未検証 | core/simulation.ts; core/campaign.ts; core/homestead.ts; tests/unit/campaign.test.ts | 寒冷/食事/屋根の休息を実プレイ確認。各バフ表現の一貫性は未確認 |
| E12 | 休息 | 実装あり・実操作未検証 | core/simulation.ts; core/campaign.ts; core/homestead.ts; tests/unit/campaign.test.ts | 寒冷/食事/屋根の休息を実プレイ確認。各バフ表現の一貫性は未確認 |
| E13 | 食事 | 実装あり・実操作未検証 | core/simulation.ts; core/campaign.ts; core/homestead.ts; tests/unit/campaign.test.ts | 寒冷/食事/屋根の休息を実プレイ確認。各バフ表現の一貫性は未確認 |
| E14 | 状態異常 | 部分実装 | core/entity-elements.ts; core/elements.ts; core/campaign.ts; tests/unit/entity-elements.test.ts | 炎/濡れ/雷/霧はある。全状態異常と対応治療は未網羅 |
| E15 | 宝箱 | 実装あり・実操作未検証 | core/campaign.ts; core/regions.ts; tests/unit/campaign.test.ts | 宝箱/発見/報酬の有限性は定義済み。通常探索で入手可能か受入 |
| E16 | 発見報酬 | 実装あり・実操作未検証 | core/campaign.ts; core/regions.ts; tests/unit/campaign.test.ts | 宝箱/発見/報酬の有限性は定義済み。通常探索で入手可能か受入 |
| C01 | アイテム定義 | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| C02 | 採集 | 実装あり・実操作未検証 | core/elements.ts; core/survival.ts; core/simulation.ts; tests/unit/element-integration.test.ts | 実攻撃→破壊→素材回収の全地域/材質受入 |
| C03 | 採掘 | 実装あり・実操作未検証 | core/elements.ts; core/survival.ts; core/simulation.ts; tests/unit/element-integration.test.ts | 実攻撃→破壊→素材回収の全地域/材質受入 |
| C04 | 資源段階 | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| C05 | インベントリ | 部分実装 | campaign-ui.ts; campaign-presenter.ts; core/survival.ts; core/campaign.ts | 共通材料/アイテム台帳と一覧はある。重さ/枠移動等の採否は未確定 |
| C06 | レシピ表示 | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| C07 | 制作トランザクション | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| C08 | 複数個制作 | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| C09 | 設備制作 | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| C10 | 生産待ち | 簡易実装・受入試験待ち | src/prototype/core/homestead.ts + tests/unit/homestead.test.ts | Normal-play/browser verification and remaining breadth |
| C11 | 収納 | 簡易実装・受入試験待ち | src/prototype/core/homestead.ts + tests/unit/homestead.test.ts | Normal-play/browser verification and remaining breadth |
| C12 | 一括収納 | 簡易実装・受入試験待ち | src/prototype/core/homestead.ts + tests/unit/homestead.test.ts | Normal-play/browser verification and remaining breadth |
| C13 | 修理/耐久 | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| C14 | 解体 | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| C15 | 入手ヒント | 簡易実装・受入試験待ち | src/prototype/core/campaign.ts + tests/unit/campaign.test.ts | Normal-play/browser verification and remaining breadth |
| C16 | 収集図鑑 | 部分実装 | campaign-presenter.ts; core/campaign.ts | アイテム入手ヒントはある。独立した収集図鑑の発見登録は未実装 |
| B01 | 基本攻撃 | 実装あり・実操作未検証 | core/simulation.ts; core/motion.ts; tests/unit/prototype.test.ts; motion.test.ts | 武器接触/硬直/盾方向/回避の実操作確認。ゲームの手触りは単体で判定しない |
| B02 | 重攻撃 | 実装あり・実操作未検証 | core/simulation.ts; core/motion.ts; tests/unit/prototype.test.ts; motion.test.ts | 武器接触/硬直/盾方向/回避の実操作確認。ゲームの手触りは単体で判定しない |
| B03 | 防御 | 実装あり・実操作未検証 | core/simulation.ts; core/motion.ts; tests/unit/prototype.test.ts; motion.test.ts | 武器接触/硬直/盾方向/回避の実操作確認。ゲームの手触りは単体で判定しない |
| B04 | パリィ | 実装あり・実操作未検証 | core/simulation.ts; core/motion.ts; tests/unit/prototype.test.ts; motion.test.ts | 武器接触/硬直/盾方向/回避の実操作確認。ゲームの手触りは単体で判定しない |
| B05 | 回避 | 実装あり・実操作未検証 | core/simulation.ts; core/motion.ts; tests/unit/prototype.test.ts; motion.test.ts | 武器接触/硬直/盾方向/回避の実操作確認。ゲームの手触りは単体で判定しない |
| B06 | 弓 | 部分実装 | core/simulation.ts; core/campaign.ts; tests/unit/campaign.test.ts | 弓の弾消費/魔法/剣・弓・杖は実装。武器種別の体験と長距離照準は未検証 |
| B07 | 魔法 | 部分実装 | core/simulation.ts; core/campaign.ts; tests/unit/campaign.test.ts | 弓の弾消費/魔法/剣・弓・杖は実装。武器種別の体験と長距離照準は未検証 |
| B08 | 武器差 | 部分実装 | core/simulation.ts; core/campaign.ts; tests/unit/campaign.test.ts | 弓の弾消費/魔法/剣・弓・杖は実装。武器種別の体験と長距離照準は未検証 |
| B09 | 特殊技 | 部分実装 | core/enemy-tactics.ts (focus); core/simulation.ts (special); tests/unit/enemy-tactics.test.ts | 実際のFocus蓄積→消費→効果を受入。原作全特殊技ではない |
| B10 | 属性 | 実装あり・実操作未検証 | core/elements.ts; entity-elements.ts; simulation.ts; tests/unit/element-integration.test.ts | 静的物体/敵/ドロップへの5元素反応と負荷上限をブラウザ確認 |
| B11 | 敵AI | 簡易実装・受入試験待ち | src/prototype/core/enemy-tactics.ts + tests/unit/enemy-tactics.test.ts; runtime integration pending browser | Normal-play/browser verification and remaining breadth |
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
| H02 | 配置プレビュー | 実装あり・実操作未検証 | core/survival.ts; core/simulation.ts; rendering/scene.ts; tests/unit/building-tools.test.ts; build-preview.test.ts | 7レシピ/回転/開口/地形破壊/返却/undoあり。実操作・保存後の衝突を確認 |
| H03 | 建築形状 | 実装あり・実操作未検証 | core/survival.ts; core/simulation.ts; rendering/scene.ts; tests/unit/building-tools.test.ts; build-preview.test.ts | 7レシピ/回転/開口/地形破壊/返却/undoあり。実操作・保存後の衝突を確認 |
| H04 | 地形編集 | 実装あり・実操作未検証 | core/survival.ts; core/simulation.ts; rendering/scene.ts; tests/unit/building-tools.test.ts; build-preview.test.ts | 7レシピ/回転/開口/地形破壊/返却/undoあり。実操作・保存後の衝突を確認 |
| H05 | 回転/スナップ | 実装あり・実操作未検証 | core/survival.ts; core/simulation.ts; rendering/scene.ts; tests/unit/building-tools.test.ts; build-preview.test.ts | 7レシピ/回転/開口/地形破壊/返却/undoあり。実操作・保存後の衝突を確認 |
| H06 | 削除/返却 | 実装あり・実操作未検証 | core/survival.ts; core/simulation.ts; rendering/scene.ts; tests/unit/building-tools.test.ts; build-preview.test.ts | 7レシピ/回転/開口/地形破壊/返却/undoあり。実操作・保存後の衝突を確認 |
| H07 | Undo | 実装あり・実操作未検証 | core/survival.ts; core/simulation.ts; rendering/scene.ts; tests/unit/building-tools.test.ts; build-preview.test.ts | 7レシピ/回転/開口/地形破壊/返却/undoあり。実操作・保存後の衝突を確認 |
| H08 | 家具 | 簡易実装・受入試験待ち | src/prototype/core/homestead.ts + tests/unit/homestead.test.ts | Normal-play/browser verification and remaining breadth |
| H09 | NPC救出 | 部分実装 | core/campaign.ts; campaign-world.ts; tests/unit/campaign.test.ts | 職人救出と制作解放あり。NPC役割の人数・専門性は簡易 |
| H10 | NPC役割 | 部分実装 | core/campaign.ts; campaign-world.ts; tests/unit/campaign.test.ts | 職人救出と制作解放あり。NPC役割の人数・専門性は簡易 |
| H11 | NPC生活 | 部分実装 | core/campaign-world.ts | 職人の配置はある。生活行動/移動/寝床のAIは未確認 |
| H12 | 作物 | 簡易実装・受入試験待ち | src/prototype/core/homestead.ts + tests/unit/homestead.test.ts | Normal-play/browser verification and remaining breadth |
| H13 | 家畜/ペット | 簡易実装・受入試験待ち | src/prototype/core/homestead.ts + tests/unit/homestead.test.ts | Normal-play/browser verification and remaining breadth |
| H14 | 水設備 | 部分実装 | core/water.ts; core/homestead.ts | 水/生産タイマーはあるが水門・水路・水車動力の統合は未実装 |
| H15 | 生産動力 | 部分実装 | core/water.ts; core/homestead.ts | 水/生産タイマーはあるが水門・水路・水車動力の統合は未実装 |
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
| W10 | ダンジョン | 部分実装 | core/regional-world.ts; world.ts; regions.ts | 洞窟/坑道/地下墓所形状と扉あり。鍵/罠/スイッチを組み合わせたダンジョン受入は未実装 |
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
| I04 | 道具 | 部分実装 | core/simulation.ts; core/campaign.ts | 剣/彫刻具/建築操作あり。斧・つるはし・整地具の独立した道具差は未達 |
| I05 | 移動具 | 実装あり・実操作未検証 | core/campaign.ts; core/simulation.ts | 鉤縄/滑空具と実移動あり。保温装備含む実攻略経路は受入待ち |
| I06 | 近接武器 | 部分実装 | core/campaign.ts; core/simulation.ts | 剣/弓/杖/盾/防具を実装。両手/短剣/全防具部位・全魔法体系ではない |
| I07 | 遠距離/魔法 | 部分実装 | core/campaign.ts; core/simulation.ts | 剣/弓/杖/盾/防具を実装。両手/短剣/全防具部位・全魔法体系ではない |
| I08 | 防具/副装備 | 部分実装 | core/campaign.ts; core/simulation.ts | 剣/弓/杖/盾/防具を実装。両手/短剣/全防具部位・全魔法体系ではない |
| I09 | 消耗品 | 部分実装 | core/campaign.ts; core/homestead.ts | 包帯/料理/修理と消費ガードあり。魚料理・全状態治療は未網羅 |
| I10 | 食品 | 部分実装 | core/campaign.ts; core/homestead.ts | 包帯/料理/修理と消費ガードあり。魚料理・全状態治療は未網羅 |
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
| U10 | コントローラー | Not implemented / unverified | — | Audit and implement |
| U11 | 小画面 | 部分実装 | campaign-ui.css; style.css | レスポンシブ配置はある。実端末/代表4サイズの重なり・タップ試験は未完 |
| U12 | アクセシビリティ | 部分実装 | campaign-ui.ts; input.ts | 感度/キー/音量/品質とARIA表示あり。文字倍率/色代替/揺れ軽減/字幕は未網羅 |
| U13 | 苦手表現 | Not implemented / unverified | — | Audit and implement |
| U14 | 日本語 | 簡易実装・受入試験待ち | src/prototype/campaign-ui.ts (browser acceptance pending) | Normal-play/browser verification and remaining breadth |
| G01 | 人物 | 部分実装 | rendering/rig.ts; core/motion.ts | 一人称腕と敵モデル/動作はある。全装備表示・人物バリエーションは未達 |
| G02 | 地形 | 簡易実装・受入試験待ち | src/prototype/core/regions.ts + regional-world.ts + tests/unit/regions.test.ts | Normal-play/browser verification and remaining breadth |
| G03 | 植生 | 簡易実装・受入試験待ち | src/prototype/core/regions.ts + regional-world.ts + tests/unit/regions.test.ts | Normal-play/browser verification and remaining breadth |
| G04 | 地域差 | 簡易実装・受入試験待ち | src/prototype/core/regions.ts + regional-world.ts + tests/unit/regions.test.ts | Normal-play/browser verification and remaining breadth |
| G05 | 建物 | 簡易実装・受入試験待ち | src/prototype/core/regions.ts + regional-world.ts + tests/unit/regions.test.ts | Normal-play/browser verification and remaining breadth |
| G06 | 光と影 | 部分実装 | rendering/scene.ts; balanced-pipeline.ts; campaign-decor.ts; element-effects.ts | 光/霧/水/元素効果はある。地域時間天候の視覚整合・黒描画の回帰未検証 |
| G07 | 霧 | 部分実装 | rendering/scene.ts; balanced-pipeline.ts; campaign-decor.ts; element-effects.ts | 光/霧/水/元素効果はある。地域時間天候の視覚整合・黒描画の回帰未検証 |
| G08 | 水 | 部分実装 | rendering/scene.ts; balanced-pipeline.ts; campaign-decor.ts; element-effects.ts | 光/霧/水/元素効果はある。地域時間天候の視覚整合・黒描画の回帰未検証 |
| G09 | 戦闘効果 | 部分実装 | rendering/scene.ts; balanced-pipeline.ts; campaign-decor.ts; element-effects.ts | 光/霧/水/元素効果はある。地域時間天候の視覚整合・黒描画の回帰未検証 |
| G10 | 空と時間 | 部分実装 | rendering/scene.ts; balanced-pipeline.ts; campaign-decor.ts; element-effects.ts | 光/霧/水/元素効果はある。地域時間天候の視覚整合・黒描画の回帰未検証 |
| G11 | 音 | 部分実装 | src/prototype/audio.ts; app.ts | 生成音のイベント接続あり。全環境音/距離/個別音量・音無し攻略は未網羅 |
| G12 | 資産品質 | 部分実装 | rendering/scene.ts; campaign-decor.ts; docs/reference/enshrouded-requirements.md | 独自形状中心。公開画面の欠損/ちらつき/裏面と全素材ライセンス台帳は未確認 |
| S01 | 保存範囲 | 簡易実装・受入試験待ち | src/save/checkpoint.ts + tests/unit/save.test.ts | Normal-play/browser verification and remaining breadth |
| S02 | 再開 | 簡易実装・受入試験待ち | src/save/checkpoint.ts + tests/unit/save.test.ts | Normal-play/browser verification and remaining breadth |
| S03 | バージョン移行 | 部分実装 | src/save/checkpoint.ts; validation.ts; campaign-session.ts; tests/unit/save.test.ts | 版/破損/未来版拒否はある。旧公開版に保存自体がなかった点を明記し実際の移行範囲を確認 |
| S04 | バックアップ | 簡易実装・受入試験待ち | src/save/checkpoint.ts + tests/unit/save.test.ts | Normal-play/browser verification and remaining breadth |
| S05 | 保存容量 | 簡易実装・受入試験待ち | src/save/checkpoint.ts + tests/unit/save.test.ts | Normal-play/browser verification and remaining breadth |
| S06 | 世界リセット | 簡易実装・受入試験待ち | src/save/checkpoint.ts + tests/unit/save.test.ts | Normal-play/browser verification and remaining breadth |
| M01 | ネットワーク範囲 | 部分実装 | src/prototype/network/{protocol,relay-room,coop-client,game-session,game-frame}.ts; core/companion.ts; tests/unit/{campaign-network,companion,game-session-authority}.test.ts | 実体2人・同一移動/戦闘・共有持物/進行・差分同期・切断停止を統合。専用常時サーバー/個人キャラ分離は未実装。公開2ブラウザ受入待ち |
| M02 | 接続 | 部分実装 | src/prototype/network/{protocol,relay-room,coop-client,game-session,game-frame}.ts; core/companion.ts; tests/unit/{campaign-network,companion,game-session-authority}.test.ts | 実体2人・同一移動/戦闘・共有持物/進行・差分同期・切断停止を統合。専用常時サーバー/個人キャラ分離は未実装。公開2ブラウザ受入待ち |
| M03 | 同期 | 部分実装 | src/prototype/network/{protocol,relay-room,coop-client,game-session,game-frame}.ts; core/companion.ts; tests/unit/{campaign-network,companion,game-session-authority}.test.ts | 実体2人・同一移動/戦闘・共有持物/進行・差分同期・切断停止を統合。専用常時サーバー/個人キャラ分離は未実装。公開2ブラウザ受入待ち |
| M04 | 個人/世界進行 | 部分実装 | src/prototype/network/{protocol,relay-room,coop-client,game-session,game-frame}.ts; core/companion.ts; tests/unit/{campaign-network,companion,game-session-authority}.test.ts | 実体2人・同一移動/戦闘・共有持物/進行・差分同期・切断停止を統合。専用常時サーバー/個人キャラ分離は未実装。公開2ブラウザ受入待ち |
| M05 | 権限 | 部分実装 | src/prototype/network/{protocol,relay-room,coop-client,game-session,game-frame}.ts; core/companion.ts; tests/unit/{campaign-network,companion,game-session-authority}.test.ts | 実体2人・同一移動/戦闘・共有持物/進行・差分同期・切断停止を統合。専用常時サーバー/個人キャラ分離は未実装。公開2ブラウザ受入待ち |
| M06 | 会話/安全 | 部分実装 | prototype/network/coop-client.ts; tests/unit/campaign-network.test.ts | 文字チャット/ミュートのUIを接続。公開2ブラウザ検査待ち。音声なし |
| M07 | 共有 | Not implemented / unverified | — | Audit and implement |
| Q01 | 新規プレイ | Not implemented / unverified | — | Audit and implement |
| Q02 | 進行網 | 部分検証 | tests/unit/campaign.test.ts; regions.test.ts | 依存非循環/先取り討伐/全7地域ルール試験あり。実際の移動と戦闘を経る全導線は未完 |
| Q03 | 3系統 | Not implemented / unverified | — | Audit and implement |
| Q04 | 失敗系 | 部分検証 | tests/unit/save.test.ts; campaign.test.ts; homestead.test.ts; building-tools.test.ts; campaign-runtime.test.ts | 単体/統合の失敗・原子性・保存検査あり。ブラウザで同等操作を検証待ち |
| Q05 | 連打/競合 | 部分検証 | tests/unit/save.test.ts; campaign.test.ts; homestead.test.ts; building-tools.test.ts; campaign-runtime.test.ts | 単体/統合の失敗・原子性・保存検査あり。ブラウザで同等操作を検証待ち |
| Q06 | 建築保存 | 部分検証 | tests/unit/save.test.ts; campaign.test.ts; homestead.test.ts; building-tools.test.ts; campaign-runtime.test.ts | 単体/統合の失敗・原子性・保存検査あり。ブラウザで同等操作を検証待ち |
| Q07 | 最終到達 | Not implemented / unverified | — | Audit and implement |
| Q08 | 長時間 | Not implemented / unverified | — | Audit and implement |
| Q09 | 性能 | 部分検証 | tests/unit/world-streaming.test.ts; world-bootstrap.test.ts; bootstrap-performance.test.ts | CPU初期生成/near-first測定あり。実機FPS・長時間歩行の公開計測は未完 |
| Q10 | 技術 | 部分検証 | tests/unit/*.test.ts; package.json | 担当者の局所type/unit/build成功記録あり。全統合後の最終SHA CI/E2Eは未完 |
| Q11 | ブラウザー | Not implemented / unverified | — | Audit and implement |
| Q12 | 公開確認 | Not implemented / unverified | — | Audit and implement |
| Q13 | 見た目比較 | Not implemented / unverified | — | Audit and implement |
| Q14 | 残課題 | 追跡中 | docs/implementation-checklist.md | 全171IDを保持し未実装/簡易/未検証を明示。最終公開結果に合わせ更新 |
