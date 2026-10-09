# 新作54項目の独立再監査

監査日: 2026-10-05 UTC。最終ソース再確認: 10:35 UTC。対象: `voxel-coop-adventure-spec.md` v0.1 と、HEAD `1edafe3` に重ねた作業中ソース。公開版・最終commitの合格証明ではない。監査中にも実装が更新されるため、以下の課題は修正と対応する試験を確認してから閉じる。

## 判定方法

- **実装経路あり**: 必要なゲーム経路と対応する試験ソースを確認。試験をこの監査で再実行した、全受入に合格した、という意味ではない。
- **実装/表示課題あり**: 原仕様の具体的な条項に対して不足や再現した不整合がある。
- **説明を補完**: 実装済みの簡易モデルについて、本書で範囲・順序・予算を明示する。
- **受入残**: 最終ソースの統合試験、公開2ブラウザ、対応実端末など、実装の有無とは別に必要な確認。

商用ゲームと同じ地図規模、一般用途の完全剛体solver、車軸/サスペンション、厳密な流体圧力、navmesh、生物の繁殖は、この原仕様の必須条件へ追加しない。旧台帳の「全装備種の増量」「原作規模ダンジョン」「厳密遮蔽音響」などを、それだけで未実装判定にしない。

## 54 IDの対応

コードパスは `apps/` を除いて `src/` 基準。試験名は `tests/unit/` 基準。全行に最終版の公開/実機受入が別途残る。

| ID | ソース監査結果 | 主なコードと試験 | 具体的な残り |
|---|---|---|---|
| NET-01 | 実装経路あり | `networking/authority-room.ts`、`apps/coop/src/index.ts`、`coop-authority.test.ts` | 実endpointと永続保存の最終版受入。4人上限は4人品質保証とは区別 |
| NET-02 | 実装経路あり・修正反映 | `networking/coop-{protocol,handshake,client}.ts`、`snapshot-wire.ts`、`coop-handshake.test.ts` | 単調操作番号と永続high-waterを追加。N1参照。最終統合/再起動試験 |
| NET-03 | 実装経路あり・修正反映 | `simulation/session.ts`、`game/skybound/powers.ts`、`coop-revision.test.ts`、`equipment-websocket.test.ts` | transaction/lease/revision、窓外の重複拒否を実装。公開同時操作受入 |
| NET-04 | 実装経路あり | `networking/coop-client.ts`、`save/room-storage.ts`、`coop-client-liveness.test.ts`、`room-storage.test.ts` | 最終版の全員切断/停止復帰、初期状態と復旧状態の表示確認 |
| NET-05 | 実装経路あり・修正反映 | `simulation/session.ts`、`game/building-permissions.ts`、`game/skybound/protection.ts`、`room-access-clients.test.ts` | 新規記録/練習人形の保護と銘板位置分離を追加。N2参照。公開荒らし受入 |
| WORLD-01 | 実装経路あり | `world/skybound-terrain.ts`、`adventure-route.test.ts`、`adventure-depth-route.test.ts` | 三層の実入力ルートがある。最終版の公開往復受入 |
| WORLD-02 | 実装経路あり | `world/density.ts`、`world/field-streaming.ts`、`skybound-terrain.test.ts` | 同じ密度/編集を衝突・描画へ使用。境界の実画面受入 |
| WORLD-03 | 実装経路あり | `world/terrain-scheduler.ts`、`simulation/worker.ts`、`platform/game.ts` | LOD/準備待ちあり。権威の密度は描画streamingに依存せず、未描画だから衝突が消える方式ではない |
| WORLD-04 | 実装経路あり | `environment/adventure.ts`、`content/adventure-encounters.ts`、`adventure-environment.test.ts` | 六環境と層別造形。遠景シルエットの実画面QA |
| WORLD-05 | 実装経路あり | `environment/adventure.ts`、`game/traversal.ts`、`game/skybound/context.ts` | 共有時刻による風/天候。草の描画揺れと力学上の風は別。下記説明参照 |
| WORLD-06 | 説明を補完 | `fluid/fluid.ts`、`game/skybound/hull-water.ts`、`fluid-obstacles.test.ts` | 水/浮力/洞窟/灯具/鉱物は存在。本書に現行水モデルを明記 |
| WORLD-07 | 実装経路あり | `game/terrain-undo.ts`、`content/adventure-trials.ts`、`game/sites.ts`、`terrain-undo.test.ts` | 保護/貸出品復旧/安全帰還あり。新規記録の保護はNET-05のN2 |
| MOVE-01 | 実装経路あり・修正反映 | `physics/character.ts`、`physics/character-shape.ts`、`game/crouch.ts`、`rendering/game/avatar.ts` | 実際の低いcapsule/姿勢、天井を検査した立上がり、個人/遠隔表示を追加。optional姿勢保存bit/旧記録読込/個人遠隔の分離を追加。最終受入は別。M1 |
| MOVE-02 | 実装経路あり | `game/traversal.ts`、`traversal-safety.test.ts` | 材質/濡れ、掴まり、警告、滑落、乗越えを追加。最終統合/遅延受入 |
| MOVE-03 | 実装経路あり | `game/traversal.ts`、`traversal-adventure.test.ts` | 翼、上昇風、専用急降下あり。公開操作感 |
| MOVE-04 | 実装経路あり | `physics/character.ts`、`game/traversal.ts`、`traversal-safety.test.ts` | 浮遊/岸上がり/息の警告状態あり。HUD連携と公開2人水面確認 |
| MOVE-05 | 実装経路あり | `game/skybound/platform.ts`、`moving-decks.test.ts` | 席に加えて立った乗員を床の並進/回転へ追従。実Sessionと公開遠隔表示の受入 |
| MOVE-06 | 実装経路あり | `game/companions.ts`、`companions.test.ts` | 餌3回による仲間化、呼ぶ/追従、騎乗、牽引、安全降車。繁殖等は追加要件にしない |
| MOVE-07 | 実装経路あり | `rendering/camera/{aim,follow}.ts`、`ui/accessibility.ts` | 遮蔽補正、照準/建築preview、感度/反転/FOV/揺れ軽減。各場面の公開受入 |
| POWER-01 | 実装経路あり | `game/skybound/{powers,preview}.ts`、`ui/powers.ts`、`creative-previews.test.ts` | 輪郭/lease/材質質量/移動回転/格子接着preview。新UIの実画面受入 |
| POWER-02 | 実装経路あり | `game/skybound/powers.ts`、`game/equipment/items.ts`、`creative-previews.test.ts` | 武器/盾に加えて矢の合成、効果/消費/解除preview。実装統合受入 |
| POWER-03 | 実装経路あり | `game/skybound/powers.ts`、`skybound.test.ts`、`moving-decks.test.ts` | 4秒履歴、lease/epoch固定、接着変更で履歴無効化。保存/クエストを巻き戻さない |
| POWER-04 | 実装経路あり | `game/skybound/powers.ts`、`skybound.test.ts` | 支持/頭上/人/保護/再確認。出口を塞ぐ公開試験 |
| POWER-05 | 実装経路あり | `game/skybound/powers.ts`、`blueprint-management.test.ts` | グラフ保存/再建/費用/配置/部品数検証。外部コード入力なし |
| PHYS-01 | 実装経路あり・修正反映 | `game/skybound/{rigid,assembly-contacts}.ts`、`physics/contacts.ts` | 新作の保持構造物を質量に応じて投げるsky-throwを追加。P1参照 |
| PHYS-02 | 実装経路あり | `game/skybound/{types,powers}.ts`、`skybound-vehicles.test.ts` | 指定9部品、単一構造の権威、電力。汎用車軸solverは必須にしない |
| PHYS-03 | 説明を補完 | `game/skybound/{powers,types}.ts`、`skybound-combinations-events.test.ts` | 火/水/氷/導電/風/爆発を実装。下記の優先順と上限を確認 |
| PHYS-04 | 実装経路あり | `game/skybound/types.ts`、`skybound-rigid-budget.test.ts` | 現行30Hz/64創作部品/16部品構造/4秒。Node測定は実機性能ではない |
| PHYS-05 | 実装経路あり・修正反映 | `game/skybound/{powers,contact-events}.ts`、`skybound-combinations-events.test.ts` | sleep/一度きり接触表示と、返却drop準備後の原子的解体。P2参照 |
| ITEM-01 | 実装経路あり | `game/adventure-exploration.ts`、`content/adventure-{encounters,market}.ts` | 地域素材/鉱物/食材/通貨dropと売却/stackあり。旧「通貨供給なし」は失効 |
| ITEM-02 | 実装経路あり・修正反映 | `content/adventure-food.ts`、`game/meadows/state.ts`、`adventure-food.test.ts` | 5料理効果/3枠/残時間処理に加えHUDへ残秒表示を追加。実画面受入 |
| ITEM-03 | 実装経路あり | `game/equipment/`、`ui/{trail-craft,equipment-warning}.ts` | 個体耐久/破損/修理/強化比較/所持拡張あり。追加装備数そのものを未完了にしない |
| ITEM-04 | 実装経路あり | `game/skybound/camp.ts`、`game/equipment/`、`mobile-camp-websocket.test.ts` | 交易/固定・移動倉庫/装備metadata受渡し/設計管理あり。公開切断受入 |
| COMBAT-01 | 実装経路あり・修正反映 | `game/adventure.ts`、`game/combat/`、`combat-commitment.test.ts` | 近接/射撃/防御/回避/parryに加え権威時刻の長押し溜め/解放を追加。C1と最終Session統合確認 |
| COMBAT-02 | 実装経路あり | `game/combat/aim-assist.ts`、`aim-assist.test.ts` | 個人照準補助、既存parry猶予。世界slow motionは使わない |
| COMBAT-03 | 実装経路あり | `game/adventure-enemies.ts`、`game/adventure-navigation.ts`、`adventure-packs.test.ts` | 各敵役割/環境反応/群れの呼応と包囲/局所再経路。全世界navmeshは必須ではない |
| COMBAT-04 | 実装経路あり | `game/combat/{boss-parts,enemy-contact}.ts`、`boss-parts.test.ts` | 4大型敵の独立部位/移動・射撃弱体化/高所・装置攻略/共有予兆。公開実戦受入 |
| COMBAT-05 | 実装経路あり | `game/coop-revive.ts`、`coop-revive-clients.test.ts` | 救助/安全復活/途中参加/共有報酬。公開切断/人数減少時受入 |
| QUEST-01 | 実装経路あり | `game/adventure-progression.ts`、`content/adventure-chapters.ts` | 出発地で順序付き実地導入と単独救助練習を追加。全工程を実入力で通す受入 |
| QUEST-02 | 実装経路あり | `content/adventure-trials.ts`、`content/adventure-trials.ts`、`adventure-trials.test.ts` | 七属性の試練と代替解。公開実操作 |
| QUEST-03 | 実装経路あり | `content/adventure-sites.ts`、`game/sites.ts`、`adventure-progression.test.ts` | 三地域に元3室＋別棟3室/高所書架、NPC/輸送救助復旧/大型敵。到達可能性・長さの公開QA |
| QUEST-04 | 実装経路あり | `game/progression-state.ts`、`simulation/session.ts`、`adventure-progression.test.ts` | 個人記録/共有設備と報酬を分離し一度だけ記録。公開同時完了 |
| QUEST-05 | 実装経路あり | `game/sites.ts`、`game/skybound/camp.ts`、`adventure-growth.test.ts` | HP/スタミナ/電池容量/所持枠成長、後参加catch-up、道標/移動拠点。旧移動拠点未実装は失効 |
| QUEST-06 | 実装経路あり | `ui/field-guide.ts`、`game/shared-pins.ts`、`game/adventure-progression.ts` | 図鑑/九記録/個人共有ピン/踏査/写真/競走/4装飾。公開写真と操作受入 |
| QUEST-07 | 実装経路あり | `save/adventure-cycle.ts`、`ui/persistence.ts`、`adventure-progression.test.ts` | 終幕/後日依頼/明示確認つき次周と新規世界/旧記録保全。公開完走と失敗復旧受入 |
| UX-01 | 実装経路あり・修正反映 | `ui/adventure.ts`、`ui/coop.ts`、`platform/network.ts` | 電力/食事残秒/泳ぎ警告と入力再割当対応表記を追加。モバイル可読性受入 |
| UX-02 | 実装経路あり・統合中 | `ui/{adventure-map,field-guide,catalog-filter,powers}.ts` | 層/ピン/依頼/recipe/設計/通知あり。検索並替え追加の最終版統合・focus保持受入 |
| UX-03 | 実装経路あり・修正反映 | `ui/accessibility.ts`、`input/keyboard/keyboard.ts` | 無音/自動再生不可でも働くsnapshot駆動音字幕と保存設定を追加。実画面受入 |
| AV-01 | 実装経路あり | `rendering/game/`、`rendering/voxel/primitive.ts` | 独自voxel造形。水の小波/粒子/草の例外を下記に明示。実GPUで顔・手足・道具を確認 |
| AV-02 | 実装経路あり・修正反映 | `rendering/environment/`、`audio/ambience.ts` | 層色/霧/昼夜/雲/天候/草揺れ/独自音、着地遷移音あり。実聴取受入 |
| AV-03 | 実装経路あり | `rendering/game/{skybound,boss-tells}.ts`、`ui/powers.ts` | 輪郭/ghost/接着点/攻撃予兆、lease所有者と残秒あり。実画面で識別性を確認 |
| SAVE-01 | 実装経路あり | `save/{storage,repository,format,checkpoint}.ts`、`save-repository.test.ts` | 専用namespace/世代保全/破損検出/export/import。共有room管理importは原仕様必須へ追加しない |
| SAVE-02 | 実装経路あり・修正反映 | `save/room-storage.ts`、`ui/persistence.ts`、`save-checkpoint.test.ts` | 個人と共有の保存完了generation表示を追加。保存失敗時/切断時の実画面受入 |
| SAVE-03 | 実装経路あり | `apps/coop/src/index.ts`、`platform/network.ts`、`room-storage.test.ts` | 個人/共有保存を分離。下記の終了時挙動と公開全員切断受入 |

## 検出した課題と現在の修正状況

10:26 UTC時点: N1/N2/P1/P2/U1–U4/A1/S1は対応ソースを確認済み。個別試験の実行結果は統合担当の記録を正本とし、最終版合格にはまだ置き換えない。10:33 UTCにC1の短押し/取消修正、M1の物理しゃがみ/表示もソース確認。54 IDすべてに原仕様に対応する実装経路または明示した簡易モデルがある。姿勢のoptional保存bitも担当の実装/関連検査が完了したが、最終全体試験と公開受入は未完了。これは54項目の公開合格を意味しない。

### N1: 256操作を越えたcommandId再実行

`AuthorityRoom` のreceipt集合は256件で古いIDを削除し、checkpointも256件を保持する。2026-10-05の隔離メモリ内検査で、木の矢12本を作る操作→256個の別IDの走行操作→最初のIDを再送すると、矢が12→24、木10→6、石10→8となった。二度消費する実経済効果であり、単なる見た目の重複ではない。修正後は単調な操作番号と保存されるhigh-waterで古い操作を拒否し、旧形式IDも256件を越えて削除せず安全拒否する。`coop-command-sequence.test.ts` に300件後の再送、保存からの再起動、旧形式上限の回帰が追加された。

#### NET互換性と長時間harness

旧形式UUIDは256件で安全拒否する仕様へ変更した。監査時の `scripts/soak-coop.ts` は全通常操作にUUIDを発行するため、15分の戦闘で256成功操作を越えると新しい操作や最終receipt確認が拒否され得る。修正後は通常操作をwelcomeのhigh-waterを読む連番IDへ移行済み。意図的な少数の旧UUID receipt試験は維持できる。連番の重複はaccepted=falseの期限切れ応答、保存された旧UUIDの重複はaccepted=trueの反映済み応答なので、両者のACK契約を混同しない。更新したharnessは `SOAK_PLAYERS=2|4` を受け付ける。新しい固定ソースでの完走は別証拠であり、旧完走結果を新方式の合格へ流用しない。

### N2: 新しい進行対象の封鎖

監査時の `game/skybound/protection.ts` は既存の道標/試練/案内人を保護するが、記録856001–856009と練習人形857001を含まない。記録の必要位置を埋める配置/編集を防ぐか、確実に復旧できる経路を設ける必要がある。機関室の記録は重量等の配置場所と同じX/Zのため、単純に全配置を禁止すると謎解きも壊す。修正後は上記IDを保護し、機関室の銘板をZ=-8の機構中心から相対Z=-9.3へ移動した。重量等の正攻法と両立するよう分離されている。

### M1/P1/P2: 動作と失敗保全

- M1: 当初は忍び足だけだったが、修正後は `physics/character-shape.ts` の低いcapsule、`game/crouch.ts` の立上がり空間検査、AvatarPoseの実姿勢、Session内の個人/遠隔状態を確認。担当から `crouch.test.ts` 6件、character/prediction/interaction/moving-decksの関連回帰、およびroot/coop型検査の合格報告あり。optional姿勢保存bitと旧記録読込、Guest→Hostの姿勢漏れ防止も含む。全体の最終統合/公開受入は別途確認する。
- P1: 創作部品のreleaseは投射速度を与えず、岩ツールは+4mから初速0で落とす。既存の投げ槍は `flintSpear` 専用だが新作recipeは `spear` だけで、入手経路がない。修正後は保持構造物の `sky-throw` が追加され、最大60のimpulse・最大6m/sの初速を質量で制限しleaseを解放する。`skybound-throw.test.ts` の4試験に対応。
- P2: `sky-salvage` は部品削除後に `adventure.ts` が返却dropを作る。隔離検査で返却のID確保を失敗させると、例外後に部品0/drop0になった。修正後は実 `SkyContext.prepareDrops` が返却を計画・確保・確定してから元部品を削除する。`skybound-salvage-atomic.test.ts` の4試験が割当失敗/上限/部分stack計画/成功を扱う。

### U1–U4/A1/S1: 表示と音

- U1: 通常HUDへ搭乗中または近傍構造の電池合計を追加した（`ui/device-energy.ts`）。
- U2: 食事の最大3枠・残秒処理に加え、HUDの品名へ残秒を追加した。
- U3: 救助/写真/地図案内へ設定済みbindingからの表記を追加し、coarse-pointer端末ではキーボード文字を省く。
- U4: `ui/sound-captions.ts` が着地/着水・敵予告・衝突/爆発をsnapshotから字幕化。設定でON/OFFでき、音量やautoplayとは独立する。新規音声台詞は要求しない。
- A1: `ambience.ts` に権威tickのgrounded遷移による着地/着水音を追加。同tickの再受信では鳴らさない。
- S1: 個人/共有とも保存完了generationを表示し、全文をtitle/data属性へ保持する経路を追加。未確認のときは世代未確認と表示する（`save/revision.ts`、`ui/persistence.ts`）。
- C1: 固定強攻撃に加え、権威時刻1.5秒で蓄積し解放する溜め攻撃、最大1.5倍、HUD割合、被弾/変更/取消/離脱による解除（保持中の時間切れは撤廃）を追加。`charged-attack.test.ts` は同tickのSessionAuthority解放/取消を含む4試験合格の報告あり。一般4tick間隔制限で短押し解除が拒否される端点も修正し、攻撃の回復制約は維持する。

## PHYS-03: 現行属性のルールと優先順

対象は創作部品。敵への効果は権威の `SkyEffect` から適用され、味方ダメージは発生させない。独立した属性の全世界流体シミュレーションではない。

| 入力/状態 | 適用順と結果 |
|---|---|
| 固定貸出足場 | 試練/地域の固定slabは通常の属性反応で燃焼/凍結/破壊しない |
| 水没/濡れ | 毎stepで水没なら濡れを5秒へ更新。濡れが残ればまず燃焼を0にする。火を受けても着火せず、濡れを減らして終了 |
| 火＋凍結 | 濡れていない場合も、凍結が残れば先に解凍し、その入力では着火/電池爆発まで進まない |
| 火＋乾いた充電電池 | 電力10以上なら全放電し、半径3mの爆発・部品integrity低下・到達可能な近傍部品への連鎖。壁を越えた近傍伝播はしない |
| 火＋木材 | 上記優先処理の後に燃焼6秒。燃焼中はintegrityが毎秒6減る。一般の火入力でも小さい直接損傷あり |
| 霜 | 消火して速度を0へ。通常4秒、濡れた部品7秒の凍結。凍結中の構造は運動を停止 |
| 気温 | 氷点下の濡れた非固定部品は凍結を更新。20℃超では解凍が通常の2倍。全水域の気候凍結を意味しない |
| 電気 | 金属/濡れ/電池を導体とし、接着リンクでつながった導体へ伝播。近傍の敵へ電気効果。乾いた木だけでは伝導しない |
| 電池＋水没 | 残量があれば30権威tickごとに1電力を失い、電気反応を起こす |
| 火＋風 | 既に燃えていた木から接着先、および風下2m以内の到達可能な乾いた未凍結の木へ延焼。15権威tickごと |
| 破損 | integrity0で部品を除去。積荷がある移動収納は所有権つき残骸として保持し、取り出し可能。過負荷だけを理由に世界を削除しない |

上限は `game/skybound/types.ts` の値が正本: 属性一連鎖8部品、権威tick当たり効果32件、延焼16件。接触/爆発の表示イベントはtick当たり16件、保持64件、30tickを超える古い表示は破棄。表示受信側はイベントIDで重複排除する。これらは合計8個の部品しか存在できないという意味ではなく、創作部品64/構造16の別予算がある。

## WORLD-06/AV-01: 水・風と造形の明示的な範囲

- 新作の水格子は0.5m。権威30Hzの3tickごと、10Hzで流動を進め、1stepの対象はプレイヤー近傍2048セル。遠方のセルは消去せず保存するが、全水域を同時に流動させる方式ではない。
- 各参加者の通常snapshot/描画は近傍48m・最大8192セル。完全保存では全セルを保持する。8192は水の生成/保存総数制限ではない。
- 水量は上下/四方の隣接セルへ移し、地形/建物/船体の占有と遮蔽を参照する。地形を盛って余った水を近傍・上方へ逃がし、密閉されて行先がなければ元セルに保持する。
- 自然水の追加は1権威tick当たり最大16列、既存水が約32768セルに達すると新しい自然源の追加を待機する。未生成位置/既存水を保存し、地図に待機を表示する。手動放水をこの数で禁止したり、古い水を切り捨てたりしない。長期の総保存量/メモリは別途監視が必要。
- 速度/流量は格子の近似。波の圧力、微細な飛沫、任意形状への厳密な連成を解かない。浮力は部品姿勢の9点サンプルと外側水の参照から計算し、船体自身の持ち上げた水底を浮力として数えない。外側参照の地形問い合わせ予算8192に達した遮蔽帯は、未確認の浮力を足さない保守的処理を行う。
- 水面の小波（描画上約0.036mまで）、反射、粒子、草の細線は意図的な表示表現。小波が泳ぎの高さや浮力を直接動かすわけではない。物理的な風は共有時刻に基づき滑空/帆/延焼へ効き、草のshader揺れは視覚効果。
- 三層の地形/資源/敵/建築/道具は独自制作のボクセル造形を基本とする。水面・粒子・細い植生の例外を、形状の不一致や未実装を隠す表現には使わない。

## SAVE-03: 終了と保存先

個人世界は新作専用IndexedDB namespace、共有世界は部屋別サーバーcheckpoint。共有世界で最初の参加者を閉じても他の参加者がいれば進行し、全員退出後は保存された状態から同じ招待先へ再参加する。再接続時の正本はサーバーで、古い参加者snapshotを世界へ書き戻さない。共有のexportは本人の持ち物/記録を含む個人用書き出しであり、他人の非公開在庫や非公開倉庫の一括exportではない。共有への管理import機能はこの原仕様の必須項目へ追加しない。

## 追加した独立Session統合証拠

`tests/unit/adventure-coop-journey.test.ts` は本監査で3/3合格（2026-10-05 10:32 UTC、約5.6秒）。

1. 実際の65tickの参加者移動、採掘、共有拾得の一人移転、create/grab/glue、他者lease競合/古いepoch拒否、実被ダメージから協力救助までをSessionAuthorityで通し、順序付き導入のhookを確認。
2. 石部品を作って地域の重量機構を実際に成立させ、個人の三記録と共有の一度だけの12硬貨報酬を確認。後参加・leave/rejoin・save/restartで分離を保持。
3. 参加者の実近接入力から大型敵の独立部位へ命中し、双方のsnapshotとleave/rejoin/save/restartで同じ部位耐久を確認。

位置・材料・敵遭遇の最小fixtureはコード中で明記。tutorial/solved/reported/completedを直接代入して成功扱いにはしていない。地域までの全行程や公開ブラウザの到達証拠ではない。新しいしゃがみ等が後から統合されるため、最終版の関連再検証は統合ゲートが担当する。

## 実装不足と分けて残す受入

1. 最終変更をまとめた型/単体/ビルドと、変更した機能の関連E2E。以前の715件等を現在のdirty sourceの合格数へ流用しない。
2. 最終commitの公開URL/asset404/console/mixed-content/接続先build整合とCI。
3. 公開独立2ブラウザでM0全10件。実WebSocketの試験はブラウザ画面試験の代用にしない。
4. 三層往復、登攀/滑空/泳ぎ/立乗り、二人の創作/競合、属性連鎖、部位攻略/救助、導入→試練→地域→最終目標→再開を実際の操作で確認する。単体fixtureで座標/進行を直接設定した結果は全行程の到達証明ではない。
5. 端末/解像度を記録したframe time/p95、メモリ、通信量、権威負荷。Node RSSやCIソフトウェアGPU値をAndroid/iPhoneの実機FPSと呼ばない。4人表記の品質保証は4人試験後。
6. 旧PR3/4・main・既存previewを変更しない配布の最終確認。

本書の追加は仕様を削る変更ではない。各課題の修正後には、対象commitと試験証拠を `feature-status.json` の対応IDへ反映する。
