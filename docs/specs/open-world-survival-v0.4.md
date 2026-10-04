# AI開発指示書 v0.4
## 剣と魔法 × マルチプレイ × オープンワールド × サバイバルクラフト × Voxel物理世界

> 本書は、AIコーディングエージェント／開発エージェントに対して、ゲーム全体を段階的に設計・実装させるための上位指示書である。
>
> 本プロジェクトは **Valheim系のゲーム進行・協力サバイバルクラフト** を基礎にしつつ、**完全Voxelワールド、地形破壊、物理演算、流体シミュレーション、SDFベースの表面表現** を統合した独自ゲームを目指す。
>
> 既存ゲームのコード、アセット、内部実装をコピーしてはならない。参考にするのは、ゲームデザイン上の特徴、プレイヤー体験、技術的な方向性のみとし、実装は独自に設計すること。

---

# 1. プロジェクトの最終目標

以下の特徴を持つ、協力型オープンワールド・サバイバルクラフトゲームを開発する。

- 剣と魔法のファンタジー世界
- マルチプレイ対応
- オープンワールド
- サバイバルクラフト
- 探索 → 資源収集 → 装備更新 → 拠点建築 → ボス攻略 → 次バイオーム解放、という明快な進行
- 世界そのものが3D Voxelで構成される
- 地面、山、洞窟、建築可能地形、浮島などを3次元的に生成可能
- 地形の採掘、掘削、破壊、造成が可能
- Voxelと物理演算を密接に統合する
- 水などの流体が地形変化に追従する
- Voxel表面はSigned Distance Field（SDF）を利用したコンパクトな表現方式を採用する
- 将来的にバイオーム、ボス、素材、敵、魔法、建築パーツを追加しやすいデータ駆動設計にする
- グラフィックスは写実性ではなく、ローポリ・低解像度テクスチャ・ライティング・フォグ・色彩設計によって雰囲気を作る

最終的な体験として、プレイヤーが「世界そのものを掘り、壊し、作り変えながら冒険する」ことをゲームの大きな特徴とする。

---

# 2. コアゲームデザイン

## 2.1 基本ゲームループ

ゲームの中核ループは以下とする。

1. 未知の土地を探索する
2. 木、石、鉱石、植物、モンスター素材などを収集する
3. ツール、武器、防具、食料、魔法、建築設備をクラフトする
4. 仮拠点または恒久拠点を建築する
5. 新しいダンジョン、敵、イベントを攻略する
6. バイオーム固有の素材を集める
7. そのバイオームのボスを発見し、召喚または攻略条件を満たす
8. ボス撃破によって新しい能力・加工技術・資源アクセスを解放する
9. 次のバイオームへ進出する
10. より危険な環境に対応するため、装備と拠点を更新する

プレイヤーが数値レベルを上げるだけではなく、**世界探索・クラフト設備・装備・ボス攻略によってゲーム進行が視覚的かつ物理的に変化すること**を重視する。

---

# 3. Valheim系の進行設計から採用する要素

以下の思想をゲーム進行の基礎とする。

- バイオーム単位で明確な危険度と資源階層を持たせる
- 各バイオームに象徴的なボスを配置する
- ボス撃破が次Tierへのキーになる
- 拠点建築をゲーム進行上の重要要素にする
- 食事、休息、装備準備によって冒険効率が変わる
- 死亡には適度なリスクを持たせるが、極端なロストでプレイヤーを脱落させない
- 協力プレイでは役割分担が自然に生まれるようにする
- 世界探索によって「遠征」の感覚を作る
- 航海・移動手段・ポータル等は後半の探索テンポ改善に利用可能とする

ただし、以下は完全コピーしない。

- UI構成
- アイテム名
- 敵デザイン
- バイオーム名
- ボス名
- 数値バランス
- 建築パーツ形状
- アニメーション
- オーディオ
- マップ構造

---

# 4. ワールドの基本構造

## 4.1 完全3D Voxelワールド

世界の地形データは高さマップではなく、3次元Voxelデータを基礎とする。

これにより以下を実現する。

- 地下洞窟
- 地下都市
- オーバーハング
- 崖の張り出し
- 巨大アーチ
- 天然橋
- 空洞の山
- 空島
- 地下湖
- 浮遊ダンジョン
- プレイヤーによるトンネル掘削
- 地形内部への拠点建築
- 地形破壊による水路変更

「地形の上にゲーム世界がある」のではなく、**Voxel空間そのものが世界である**という設計にする。

## 4.2 有限ワールド

ワールドは有限とする。

境界は単なる見えない壁ではなく、ゲーム世界として自然に認識できる方法を優先する。

候補：

- 巨大海洋
- 世界を包む霧 / 魔力障壁
- 極端に危険な外縁地帯
- 断崖 / 世界端演出

内部実装では必ず `WorldBounds` を持つ。

```text
WorldBounds
- MinX / MaxX
- MinY / MaxY
- MinZ / MaxZ
- SeaLevel
- WorldSeed
```

ワールド生成、Chunk ID、保存、流体、AI、スポーンはこの境界外へデータを生成しない。

初期MVPは2km x 2km相当で検証し、製品版サイズはプロファイリング後に決定する。

---

# 5. Voxelシステム

## 5.1 データ構造

Voxelワールドはチャンク単位で管理する。

推奨構造：

```text
World
 └─ Region
     └─ Chunk
         └─ Brick
             └─ Voxel / SDF Data
```

各階層はストリーミング可能にする。

### 必須要件

- 有限ワールドを前提とし、`WorldBounds` で水平・垂直範囲を明示的に定義する
- ワールドサイズは設定値で変更可能にし、MVPと製品版で同じ生成コードを利用する
- 周辺チャンクのみロード
- セッションのAuthority側（ホストまたはDedicated Server）が権威的な地形データを保持
- プレイヤーによる変更差分を保存
- 未変更チャンクはSeedから再生成可能
- 変更済みチャンクだけ永続化できる構造

---

# 6. SDF + BrickベースのVoxel表面表現

Voxel描画は単純なMinecraft型キューブ描画にはしない。

目標は、SDF（Signed Distance Field）とBrick単位の圧縮表現を利用し、滑らかで編集可能なVoxel表面を効率的に描画する方式とする。

本プロジェクト内ではこのレンダリングシステムを仮に **Brick SDF Renderer** と呼ぶ。

## 6.1 基本思想

各Brickは小さなVoxelブロック集合を保持し、各セルに以下の情報を保持可能とする。

- Signed Distance
- Material ID
- Surface Type
- Density
- Optional biome metadata

SDFから表面を復元し、必要に応じてGPU上でメッシュまたはサーフェス表現を生成する。

候補技術：

- Dual Contouring
- Surface Nets
- Marching Cubes
- SDF Ray Marching
- GPU Compute Mesh Generation
- Mesh Shader
- Virtualized Geometryとの組み合わせ

実装時には、見た目、編集コスト、GPU負荷、ネットワーク同期コストを比較し、最適方式を選定すること。

## 6.2 必須特性

- 地形編集後の局所再生成
- チャンク全体を再メッシュしない
- Brick単位でDirty Flagを管理
- 複数LOD対応
- 遠距離地形の簡略化
- 法線生成
- Material Blend
- 洞窟内部も描画可能
- オーバーハング対応
- 浮島対応

---

# 7. 地形破壊・編集

プレイヤーは以下を実行できる。

- 掘る
- 削る
- 穴を開ける
- トンネルを作る
- 山を削る
- 盛土する
- 地形を造成する
- 爆発で地形を破壊する
- 魔法によって地形を変形させる

地形編集はSDFへの演算として設計する。

例：

```text
Dig Sphere
Add Sphere
Subtract Capsule
Explosion Falloff
Smooth
Flatten
Stamp
Noise Stamp
```

地形変更は可能な限り局所的に適用する。

---

# 8. 物理演算

Voxel世界と物理システムを統合する。

ただし、すべてのVoxelをRigidBody化してはならない。

## 8.1 物理対象

- 木
- 岩
- 建築物
- 落石
- 破壊された地形の一部
- プレイヤー設置物
- 敵
- 投射物
- 乗り物

## 8.2 地形崩壊

必要に応じて、支持を失ったVoxel構造を検出する。

例：

- 崖を下から掘る
- 柱を破壊する
- 浮いた岩塊ができる

一定サイズ以下の孤立Voxel塊は動的物理オブジェクトへ変換可能とする。

巨大地形は即座にRigidBody化せず、以下の簡略化を行う。

```text
Voxel Island Detection
→ Bounding Volume
→ Simplified Collision
→ Dynamic Rock Body
```

性能を最優先し、破壊可能性より安定性を優先できる設定を用意する。

---

# 9. 流体シミュレーション

水は見た目だけの平面ではなく、地形形状に追従する動的流体とする。

## 9.1 必須挙動

- 高い場所から低い場所へ流れる
- 穴を掘ると流路が変化する
- ダムを作ると水位が上がる
- 堤防を壊すと水が流れ出す
- 洞窟に流入する
- 地下空洞を満たす
- 水源と排水先を持てる

## 9.2 実装方針

完全なNavier-Stokesシミュレーションは避ける。

ゲーム用に簡略化したVoxel Fluid Simulationを使用する。

候補：

- Cellular Automata
- Height + Volume hybrid
- Sparse voxel fluid
- Chunk-local simulation

更新頻度はグラフィックスフレームレートと分離する。

例：

```text
Render: 60 FPS
Physics: 30-60 Hz
Fluid: 5-15 Hz
World background simulation: 1-5 Hz
```

流体はプレイヤー周辺のみ高精度計算する。

遠距離では低頻度、もしくは休止状態とする。

---

# 10. ワールド生成

## 10.1 基本方針

ワールド生成はSeedベースのプロシージャル生成とする。

バイオーム追加によって生成コード全体を書き換えなくて済むよう、データ駆動設計にする。

例：

```text
BiomeDefinition
- BiomeID
- TemperatureRange
- HumidityRange
- ElevationRange
- MagicLevel
- DangerTier
- TerrainGenerator
- CaveGenerator
- StructureTable
- EnemyTable
- ResourceTable
- BossDefinition
- AmbientProfile
- LightingProfile
```

## 10.2 3次元バイオーム

地表だけでなく、以下も独立した環境として生成可能にする。

- 地下バイオーム
- 高高度バイオーム
- 空島バイオーム
- 巨大洞窟
- 地底海
- 浮遊大陸

3D NoiseとSDF演算を組み合わせる。

候補：

- Perlin Noise
- Simplex Noise
- Worley Noise
- Domain Warping
- Erosion approximation
- Density field composition

---

# 11. 初期バイオーム構成

最初のバージョンでは5バイオームとする。

具体的な名称やテーマは後で変更できるようデータ駆動にする。

暫定例：

| Tier | バイオーム | 特徴 |
|---|---|---|
| 1 | 緑豊かな森林 | 初期拠点、木材、石材、弱敵 |
| 2 | 黒い森・丘陵 | 鉱石、地下遺跡、強敵 |
| 3 | 沼地 | 毒、水、腐敗、湿地資源 |
| 4 | 火山・高山 | 寒暖環境、希少鉱石、飛行敵 |
| 5 | 魔力汚染地帯 / 空島 | 高度な魔法素材、浮島、最終Tier敵 |

これらは仮案であり、正式名称ではない。

---

# 12. ボスシステム

初期ボスは5体。

各バイオームに1体を基本とする。

ボスは以下の役割を持つ。

- バイオームの最終試験
- 新Tierの解放
- 特殊素材の供給
- 新しいクラフト設備解放
- 世界の状態変化

例：

```text
BossDefinition
- BossID
- BiomeID
- SummonRequirement
- ArenaRules
- PhaseDefinitions
- RewardTable
- WorldUnlocks
```

将来的にボスを追加しても、ゲーム進行コードを変更せず登録だけで増やせる設計にする。

---

# 13. 戦闘

戦闘のベースは **Valheim系の三人称アクション戦闘** とする。

単なるコンボアクションではなく、**間合い・スタミナ管理・ガード・パリィ・回避・装備準備**を重視する。

基本戦闘の上に魔法システムを追加し、近接・遠距離・魔法を同じ戦闘ルール上で成立させる。

## 13.1 基本戦闘ルール

- 三人称視点を基本とする
- 通常攻撃
- 強攻撃 / Secondary Attack
- 武器ごとの攻撃モーションとリーチ
- スタミナ消費
- ガード
- ガード強度
- パリィ
- 回避ロール / ステップ
- ノックバック
- よろけ / Stagger
- 状態異常
- 属性ダメージ
- 弱点 / 耐性
- 装備重量または移動ペナルティを拡張可能にする

複雑な長時間コンボより、攻撃タイミング、敵の予備動作、スタミナ残量、位置取りを理解して戦う設計を優先する。

## 13.2 武器カテゴリ例

- 剣
- 大剣
- 斧
- 槍
- 弓
- 杖
- 魔導書
- 盾

## 13.3 魔法

魔法は既存の近接戦闘を置き換えるのではなく、同じ戦闘システムへ追加する。

魔法ごとに以下をデータ定義可能にする。

```text
SpellDefinition
- SpellID
- School / Element
- CastTime
- Cooldown
- ResourceCost
- StaminaCost
- Projectile / Hitscan / Area / Self
- DamageProfile
- StatusEffects
- VoxelInteraction
- FluidInteraction
- PhysicsImpulse
- VFXProfile
```

魔法はVoxel世界との相互作用を重視する。

例：

- 岩壁を破壊する
- 地面を隆起させる
- 氷壁を作る
- 水を凍らせる
- 爆発で洞窟を開ける

ただし地形変更系魔法はネットワーク・保存・Authority負荷が高いため、Authority側（ホストまたはDedicated Server）で範囲、頻度、最大編集量を制限できるようにする。

---

# 14. クラフト

クラフトTierはバイオーム進行と連動させる。

例：

```text
Stone
→ Copper/Bronze equivalent
→ Iron equivalent
→ Magical Alloy
→ Endgame Material
```

アイテムはData Asset / Data Table相当のデータ駆動方式で登録する。

---

# 15. 建築

建築はゲームの重要要素とする。

プレイヤーは以下を建築可能。

- 家
- 城
- 塔
- 壁
- 橋
- 地下拠点
- 空島拠点
- 港
- 工房

Voxel造成と建築ピースを組み合わせる。

建築システムには構造支持の概念を持たせる。

ただし現実的な構造解析ではなく、ゲーム向けに単純化する。

例：

```text
Foundation
SupportStrength
DistanceFromSupport
MaterialStrength
```

---

# 16. マルチプレイ

## 16.1 基本方針

**PvE協力プレイを基本**とし、通常プレイではPvPを行わない。

- プレイヤー同士の直接ダメージはデフォルト無効
- Friendly Fireはデフォルト無効
- PvP前提のバランス調整を行わない
- 将来必要になった場合に限定的なPvPルールを追加できる余地だけ残す

マルチプレイは、以下の**2方式を同じゲームロジックでサポート**する。

1. **Host Session（標準）** — 1人のプレイヤーがワールドを開き、そのプレイヤーのブラウザがAuthorityとなる。専用ゲームサーバーを立てなくてもフレンドが参加できる。
2. **Dedicated Server（任意）** — Node.js上で常時稼働するAuthorityを用意する。大人数、24時間稼働、コミュニティサーバー用途向け。

重要なのは、どちらも**Authoritative Simulation**であること。
Host SessionではホストプレイヤーのブラウザがAuthority、Dedicated ServerではNode.jsプロセスがAuthorityを担当する。

Authorityは以下を最終決定する。

- プレイヤー状態
- NPC状態
- 戦闘判定
- ダメージ判定
- アイテム
- インベントリ
- Voxel編集
- 建築
- 流体の重要状態
- 重要な物理演算
- ワールドイベント
- セーブデータ

非Authorityクライアントは、入力送信、予測、補間、描画を担当する。

## 16.2 Host Session — プレイヤーホスト方式

通常のフレンド協力プレイではこちらを優先する。

```text
Host Browser
├─ Three.js Rendering
├─ Local Player Client
├─ Authoritative GameSimulation
├─ World / Voxel / AI / Physics / Fluid Authority
├─ Save Owner
└─ WebRTC Host Peer
       ↑
       ├── Guest Player A
       ├── Guest Player B
       └── Guest Player C ...
```

通信トポロジは**Hostを中心としたStar型**とする。
参加者同士を直接フルメッシュ接続しない。

Host Sessionの通信には **WebRTC DataChannel** を使用する。
Webブラウザは通常のWebSocketサーバーとして外部から直接待ち受ける用途には向かないため、ブラウザ同士の接続はWebRTCを基準とする。

接続成立のため、以下の軽量インフラは使用してよい。

```text
Signaling Service
- Room code / invite token
- SDP offer / answer exchange
- ICE candidate exchange
- Lobby metadata

STUN
- NAT traversal用

TURN
- P2P直結できない場合のrelay fallback
```

**Signaling / STUN / TURNはゲームSimulationを実行しない。**
つまり、Dedicated Game Serverなしでプレイできることを要件とする。
TURN経由時は通信パケットがrelayされるが、ワールド状態の権威はHostに残す。

### Host SessionのDataChannel分割

用途ごとに論理チャネルを分けることを推奨する。

```text
control / gameplay-critical
- reliable
- ordered
- join/leave
- inventory
- crafting
- boss state
- confirmed combat events

world-edit
- reliable
- ordered
- voxel edits
- building edits
- save-relevant events

realtime-state
- low latency priority
- player transforms
- NPC transforms
- animation state
- frequent snapshots
- 必要に応じてunordered / limited retransmissionを検証
```

実際のチャネル数、reliability設定、packet formatはPhase 0で計測して決定する。

### Host離脱

MVPではHostが退出した場合、そのセッションを終了してよい。
保存データは退出前および定期AutosaveでHost側へ保存する。

Host Migrationは将来機能とし、初期必須要件にしない。
実装する場合は、Authority state snapshot、save ownership、connection renegotiationを明示的に設計する。

## 16.3 Dedicated Server方式

Dedicated Serverを利用する場合の基準実装は以下とする。

```text
Client
- TypeScript
- Three.js
- Colyseus Client SDK

Dedicated Server
- Node.js LTS
- TypeScript
- Colyseus
- WebSocket / WSS
- Authoritative fixed-tick simulation
```

ColyseusはDedicated Serverモードのルーム管理、接続、再接続、状態同期、メッセージングの基盤として使用する。

ただしゲームロジックそのものをColyseusへ密結合させてはならない。

## 16.4 共通Simulation層

Host SessionとDedicated Serverで別々のゲームロジックを書いてはならない。

`GameSimulation` をTransportおよびRenderingから完全に分離し、同一コードを以下の両方で実行可能にする。

```text
Browser Host
GameSimulation
    ↓
Web Worker / Worker pool
    ↓
WebRTC Transport

Dedicated Server
GameSimulation
    ↓
Node.js Worker / process
    ↓
Colyseus / WebSocket Transport
```

推奨構成：

```text
apps/
  client/             # Three.js client + Host UI
  signaling/          # Lightweight signaling only
  dedicated-server/   # Node.js + Colyseus, optional deployment
packages/
  shared/             # Protocol / types / IDs / common math
  simulation/         # Authority gameplay logic; browser/Node共通
  world/              # Seed / voxel operation definitions
  networking/
    transport-core/   # SessionTransport interface
    webrtc/           # Host Session transport
    colyseus/         # Dedicated transport
```

Transport abstraction例：

```text
SessionTransport
- connect()
- disconnect()
- sendReliable()
- sendRealtime()
- broadcastReliable()
- broadcastRealtime()
- onPeerJoin()
- onPeerLeave()
- onMessage()
- getStats()
```

GameSimulationからWebRTC APIやColyseus APIを直接呼ばないこと。

## 16.5 Netcode

リアルタイムアクション部分は固定Tickで処理する。

初期目安：

```text
Authority simulation: 20-30 Hzから検証
Client render: 60 FPS目標
Remote entity interpolation: enabled
Local player prediction: enabled
Authority reconciliation: enabled
```

すべてを毎Tick全員へ送信してはならない。
Interest Management / Area of Interest を実装し、プレイヤー周辺のEntity、Voxel変更、物理イベントのみ高頻度同期する。

Host SessionではHost自身も描画負荷を持つため、Authority SimulationをWeb Workerへ分離し、RendererのFrame TimeとSimulation Tickを可能な限り分離する。

## 16.6 同時接続人数

Three.jsそのものでは最大人数を決めない。
上限は主にAuthority側のVoxel、物理、流体、AI、ネットワーク帯域、さらにHost SessionではホストPCの描画負荷によって決まるため、実測ベースで決定する。

初期目標：

```text
Host Session
- Acceptance target: 4 players minimum
- Performance target: 8 players
- Stretch: profiling後に増加

Dedicated Server
- Acceptance target: 8 players
- Architecture target: 16 players
- Stretch goal: 32 players after profiling/optimization
```

ゲームデザイン上の最大人数は現段階では固定しない。
ホスト方式を8人まで快適にすることを優先し、それ以上は実測後に決定する。

人数を増やす場合は以下を先に実装する。

- Interest Management
- Spatial partitioning
- Entity sleep / dormancy
- Authorityを維持したRegion scheduling
- Voxel edit batching
- Network delta compression
- AI update budget
- Fluid simulation budget
- Per-peer bandwidth budget
- Host CPU/GPU frame budget separation

## 16.7 セッション作成UX

最低限、ユーザーからは以下のように見えること。

```text
Single Player
Host Game
Join Game
Dedicated Server
```

`Host Game` を選択した場合：

1. ローカルワールドを選択または新規作成
2. Host Sessionを開始
3. Invite Code / Invite Linkを生成
4. フレンドがJoin Gameから参加
5. HostがAuthorityとしてSimulationを実行

ユーザーにポート開放を要求しないことを目標とする。
直結できないネットワークではTURN relayへフォールバック可能にする。

---

# 17. Voxelネットワーク同期

Voxel全体を同期してはならない。

Seed + Edit Operation方式を基本とする。

例：

```text
World Seed
+
Voxel Edit Log
```

Voxel変更イベント：

```text
EditID
ChunkID
OperationType
Position
Radius
Strength
Material
Timestamp
```

クライアントは同じSeedからワールドを生成し、差分操作を適用する。

一定量以上差分が蓄積した場合はChunk Snapshotへ圧縮する。

---

# 18. セーブシステム

保存対象：

- World Seed
- Voxel変更
- 建築物
- プレイヤーデータ
- アイテム
- コンテナ
- ボス撃破状態
- ワールドイベント
- 流体重要状態

チャンク単位で保存する。

Host SessionではHostがワールドセーブの所有者となる。
Dedicated ServerではDedicated側ストレージが所有者となる。

Host Sessionの初期保存先はブラウザローカルストレージ系APIを利用し、容量とランダムアクセス特性を考慮してIndexedDB / OPFSをPhase 0で比較する。
ワールドのExport / Importを可能にし、ブラウザキャッシュ消去だけで唯一のワールドデータを失わない運用を目指す。

Guestクライアントをセーブの正本にしてはならない。

---

# 19. グラフィックス方針

## 19.1 基本ビジュアル

グラフィックスは、**ローポリ・低解像度テクスチャ・限定的なマテリアル表現を基礎にし、ライティング、霧、色、天候、シルエットによって雰囲気を作る**。

狙いは写実性ではない。

「簡素な形状と素材でも、一目で美しく、遠景まで読みやすく、ゲームプレイ上の視認性が高い」ことを優先する。

## 19.2 アート原則

- 形状はシンプル
- シルエットを強くする
- 小さなディテールを増やしすぎない
- テクスチャ解像度を意図的に抑える
- ノーマルマップ依存を減らす
- マテリアル数を抑える
- 色面を大きく使う
- 環境光と方向光を重視する
- フォグで距離感を作る
- 天候で雰囲気を変える
- 昼夜で色温度を大きく変える
- バイオームごとに色設計を明確に変える

## 19.3 低解像度テクスチャ

基本テクスチャサイズは小さく保つ。

例：

```text
64x64
128x128
256x256
```

大型アセットも高解像度テクスチャを大量使用せず、タイル可能なテクスチャ、頂点カラー、マスク、プロシージャルブレンドを利用する。

## 19.4 Voxel地形との統合

Voxel地形はフォトリアルにしない。

SDF表面から生成した地形に対して以下を適用する。

- Flat / semi-flat normal
- Triplanar mapping
- Material palette
- Vertex color
- Slope-based material
- Height-based material
- Biome tint

地形表面の細かな凹凸より、大きな地形シルエットを重視する。

---

# 20. ライティング

ライティングは本作品の画作りの中心とする。

## 20.1 重要項目

- 太陽光
- 環境光
- 空の色
- Fog
- Volumetric Fog
- Shadow
- Ambient Occlusion
- Emissive
- Magic Light

## 20.2 バイオームLighting Profile

各バイオームは独自Lighting Profileを持つ。

例：

```text
LightingProfile
- SunColor
- SunIntensity
- SkyColor
- FogColor
- FogDensity
- AmbientIntensity
- ShadowContrast
- Saturation
- Exposure
```

これにより、新しいバイオームを追加する際も固有の雰囲気を簡単に作れるようにする。

---

# 21. 天候

天候システムを実装する。

例：

- 晴れ
- 曇り
- 雨
- 雷雨
- 雪
- 霧
- 魔力嵐

天候は以下に影響する。

- 視界
- ライティング
- 音
- 温度
- 敵出現
- 魔法
- 流体

---

# 22. スケーラビリティ方針

本プロジェクトでは、画面上の情報密度を無理に上げず、**大量の地形、敵、建築、Voxel編集が存在しても成立する画作り**を重視する。

ローポリ・低解像度テクスチャを採用する理由は美術的な方向性だけではなく、以下の技術的利点も狙うためである。

- メッシュデータ量削減
- VRAM削減
- テクスチャストリーミング負荷削減
- 描画コスト削減
- LOD作成容易化
- 大規模ワールドとの相性向上
- ネットワークゲームでのクライアント負荷削減
- アセット制作コスト削減

ただし、ローポリであることを理由に最適化を省略してはならない。

以下は必須。

- LOD
- Occlusion Culling
- Frustum Culling
- GPU Instancing
- Hierarchical Instancing
- Chunk Streaming
- Texture Atlas / Array
- Object Pooling
- Async Loading
- Background Generation

---

# 23. 描画負荷の優先順位

画質調整時は以下の順に品質を優先する。

1. シルエット
2. ライティング
3. 影
4. Fog / Atmosphere
5. 色
6. アニメーション
7. 地形の大形状
8. テクスチャ細部

テクスチャ解像度やポリゴン数を上げる前に、ライティングと色設計を改善する。

---

# 24. パフォーマンス目標

最低限、以下のPerformance Budgetを設定する。

暫定目標：

```text
Target FPS: 60 FPS
Minimum FPS: 30 FPS
```

AIエージェントは各主要システムに計測機構を追加すること。

計測対象：

- Voxel mesh generation time
- Voxel edit latency
- Fluid update time
- Physics time
- Draw calls
- Triangles
- VRAM
- Network bandwidth
- Authority tick time (Host / Dedicated)
- Chunk load time
- Per-player bandwidth
- Active entity count
- Active fluid cells
- Voxel edits per second

マルチプレイ性能は「Three.jsで何人動くか」ではなく、実測値で管理する。

最低限、Dedicatedでは8クライアント、Host SessionではHost + 3〜7 Guest相当のBot/擬似Peer負荷試験を自動化し、以下の複合負荷を再現する。

- 全員移動
- 戦闘
- 採掘
- 建築
- Voxel爆発
- AI戦闘
- 水更新

---

# 25. システム設計方針

全システムをモジュール化する。

例：

```text
Core
World
Voxel
VoxelRenderer
WorldGeneration
Biome
Fluid
Physics
Building
Crafting
Combat
Magic
AI
Boss
Multiplayer
SessionTransport
WebRTCTransport
DedicatedTransport
Signaling
Persistence
Audio
Weather
UI
```

各モジュールの依存関係を明確にする。

特に `simulation` はThree.js、WebRTC、Colyseusへ依存してはならない。
依存方向は `presentation/network adapters -> simulation interfaces` を基本とし、Host SessionとDedicated ServerでSimulationコードを共有できる状態を維持する。

---

# 26. データ駆動設計

以下はハードコードしてはならない。

- バイオーム
- 敵
- ボス
- 武器
- 防具
- 素材
- レシピ
- 建築物
- 魔法
- Loot Table
- Spawn Table

新しいコンテンツはデータ定義追加だけで登録可能にする。

---

# 27. AIエージェントへの開発指示

AIエージェントは、いきなりゲーム全体を実装してはならない。

必ず以下の順番で進める。

## Phase 0 — 技術検証

最初に以下のPrototypeを作成する。

1. Three.jsでVoxel Chunk表示
2. SDF編集
3. Surface Mesh生成
4. Chunk Streaming
5. Transport非依存の`GameSimulation` Prototype
6. WebRTC Host Session接続基盤 + signaling
7. Browser Host authoritative movement + prediction/interpolation
8. Node.js + Colyseus Dedicated接続基盤
9. 同一SimulationをBrowser Host / Node Dedicatedの両方で実行
10. Voxel Multiplayer Sync
11. Fluid Prototype
12. Physics Object + Voxel Interaction
13. Host + Guest負荷試験
14. 8-client Dedicated headless/bot load test
15. NAT環境差を想定したSTUN/TURN接続試験

この段階ではゲームコンテンツを作り込まない。

## Phase 1 — Vertical Slice

以下を含む小規模な遊べるゲームを作る。

- 1バイオーム
- 1ボス
- 3〜5種類の敵
- 採掘
- 木材収集
- クラフト
- 建築
- 戦闘
- 魔法
- マルチプレイ
- Voxel破壊
- 水

## Phase 2 — Core Game

5バイオームへ拡張。

## Phase 3 — Content Expansion

新バイオーム、敵、魔法、ボスを追加。

---

# 28. AIエージェントの実装ルール

AIエージェントは以下を守ること。

1. 大規模機能を一度に実装しない
2. 小さなPrototypeを作る
3. Profilingする
4. Testを書く
5. Network Testを行う
6. Save/Load Testを行う
7. 破壊的変更の前にArchitecture Decision Recordを残す
8. 技術的不確実性が高い部分から検証する
9. コンテンツ量ではなくコア技術を優先する
10. 特定ゲームの非公開実装を推測してコピーしない

---

# 29. 最重要技術リスク

以下は最優先で検証する。

## Risk 1

Voxel + Multiplayer

## Risk 2

Voxel + Physics

## Risk 3

Voxel + Fluid

## Risk 4

SDF Surface Rendering performance

## Risk 5

Large World Streaming

## Risk 6

Browser Host authority + WebRTC + NAT traversal + Host performance

これらが成立しない場合、ゲーム全体の設計を変更する必要がある。

---

# 30. MVP

最初に作るべきMVP：

```text
有限の2km x 2km相当テストワールド
1 Biome
Voxel terrain
Digging
Building
Water
Basic Physics
Host Session 4-player minimum / 8-player performance target
Dedicated Server 8-player stress/acceptance target
1 Boss
Basic Crafting
Valheim-style Basic Combat
Basic Magic
```

グラフィックス：

```text
Low Poly
Low Resolution Texture
Stylized Lighting
Fog
Day/Night
```

このMVPで「このゲームの技術的な核が面白いか」を検証する。

---

# 31. 初期アート方向の具体ルール

アーティスト／AI生成アセット／プロシージャル生成物は、以下に従う。

### キャラクター

- 遠距離から職業・敵種が判別できるシルエット
- 顔の細部より装備シルエットを優先
- 防具は大きな面で構成
- 小物を大量につけすぎない

### 建築

- 大きな梁、柱、屋根形状で様式を出す
- 細かな装飾は抑える
- 低解像度テクスチャでも材質差が分かる配色にする

### 地形

- 岩山、崖、洞窟は細かなノイズより大きな塊感を優先
- 遠景でも形が読める地形生成
- 霧と色で奥行きを作る

### 魔法

- 高解像度エフェクトより、明快な色・発光・形状で表現
- 魔法属性ごとにカラー言語を統一

---

# 32. 将来拡張

将来的に以下を追加可能にする。

- 10+ バイオーム
- 20+ ボス
- 海洋
- 巨大地下世界
- 浮遊大陸
- NPC集落
- 商人
- 農業
- 家畜
- 大型船
- Siege
- Dynamic Event
- Raid
- Magic School
- Procedural Dungeon

---

# 33. 技術スタック

本プロジェクトのクライアント描画基盤は **Three.js** に固定する。

## 33.1 Client

```text
Language: TypeScript
Rendering: Three.js
Build tool: Vite
Primary target: Desktop web browser
Rendering backend: WebGLを互換基準とし、WebGPUは高性能経路として段階導入
```

ゲームロジックをThree.jsのScene Graphへ直接埋め込まない。
Three.jsは主に表示層として扱い、World/Simulation/Networkingと分離する。

```text
Game State
    ↓
Presentation Adapter
    ↓
Three.js Scene
```

## 33.2 Multiplayer Runtime

マルチプレイは2モードを持つ。

### A. Host Session — 標準フレンドプレイ

```text
Authority runtime: Browser
Language: TypeScript
Simulation: shared GameSimulation package
Authority execution: Web Worker推奨
Transport: WebRTC DataChannel
Topology: Host-centered star
Discovery / negotiation: Lightweight signaling service
NAT traversal: STUN
Fallback relay: TURN
Dedicated game server: 不要
```

Host SessionではThree.jsのレンダリング処理とAuthority Simulationを同一Main Threadで処理しないことを強く推奨する。
Simulation、Voxel処理、AI処理などはWorkerへ移し、Main Threadは入力、UI、Three.js描画を優先する。

### B. Dedicated Server — 任意

```text
Runtime: Node.js LTS
Language: TypeScript
Multiplayer framework: Colyseus
Transport: WebSocket / WSS
Architecture: Dedicated authoritative server
Simulation: shared GameSimulation package
```

最初は1ワールド = 1 Authority Simulationとして実装する。
将来の水平スケールに備え、認証、ロビー、永続化、ゲームSimulationをモジュール分離する。

### C. Signaling / Relay Infrastructure

Host Session用に、小規模な常設サービスを持つことは許容する。
ただしゲームワールドをSimulationするDedicated Serverとは明確に区別する。

```text
signaling service
- create/join room
- invite token
- SDP / ICE exchange
- connection metadata

STUN/TURN
- NAT traversal
- relay fallback
```

Signaling障害中でも既に確立済みのP2Pセッションを可能な限り継続できる設計を目指す。


## 33.3 Physics

Three.js自体を物理エンジンとして使用しない。
物理ライブラリはPhase 0で比較検証し、通常クライアント、Browser Host、Node.js Dedicated Serverの各実行環境で共有しやすいものを選定する。

比較優先候補：

- Rapier
- cannon-es
- 必要箇所のみ独自の簡略物理

Voxel地形の衝突は通常RigidBodyとは別レイヤーとして設計し、チャンク/Brickから簡略Collisionを生成する。

## 33.4 WebGPU方針

SDF/Brick生成、GPU計算、将来の高度なVoxel描画にはWebGPUが有力だが、Phase 0ではWebGPU必須にしない。

以下をベンチマークして採用範囲を決める。

- WebGLでのCPU mesh generation + BufferGeometry
- Workerを利用したmesh generation
- WebGPU computeを利用したBrick処理
- GPU memory usage
- 対象ブラウザ互換性

「新技術を使うこと」より、安定した60 FPSと編集レイテンシを優先する。

---

# 34. 未確定事項・ユーザー確認待ち

以下は今後決める。

1. 製品版の最終ワールド寸法と垂直範囲
2. ブラウザ専用か、Electron/Tauri等のデスクトップ版も提供するか
3. キャラクター成長方式（スキル成長、装備Tier、魔法習熟など）
4. 魔法のリソース方式（Mana、スタミナ、触媒、Cooldown等）
5. 建築自由度と建築パーツ粒度
6. 地形崩壊のリアルさ
7. 水以外の流体（溶岩等）
8. 移動手段（船、騎乗、飛行等）
9. ポータル等の高速移動方式
10. 死亡ペナルティ
11. 食事・休息システムの深さ
12. 敵AIの複雑さ
13. Dedicated Server配布方式（公式ホスティング / ユーザーSelf-host / 両方）とHost Migration対応有無
14. 永続DBの選定
15. MOD対応の有無

---

# 35. 現段階での優先順位

優先順位は以下とする。

```text
1. Voxel World
2. SDF / Brick Rendering
3. Terrain Editing
4. Multiplayer Sync
5. Streaming
6. Physics Interaction
7. Fluid Simulation
8. Building
9. Combat
10. Crafting
11. Boss Progression
12. Content
13. Final Visual Polish
```

ゲームコンテンツ制作より、先に技術基盤を完成させる。

---

# 36. 完成判定

このプロジェクトの最初の成功判定は、単に「遊べる」ではない。

以下を満たした時点をCore Technology Milestoneとする。

- 複数プレイヤーが同じVoxel世界に参加できる
- 地形を掘れる
- 地形を盛れる
- 掘った穴へ水が流れる
- 建築物を設置できる
- 地形と建築に物理インタラクションがある
- 洞窟を生成できる
- 浮島を生成できる
- 遠距離チャンクをストリーミングできる
- 保存して再接続後も変更が残る
- ローポリ・低解像度テクスチャでもライティングとフォグによって魅力的な画面を作れる
- Host Sessionで4人以上を最低基準とし、8人を性能目標としてVoxel編集・戦闘・建築を含め安定してプレイできる
- Dedicated Serverモードでも同一GameSimulationを利用して8人負荷試験を通過できる

この技術基盤が成立した後で、5バイオーム・5ボスのゲームコンテンツを本格実装する。

---

# 37. AIエージェントへの最終命令

このゲームを「大量の機能を持つゲーム」としてではなく、以下の3本柱から設計すること。

```text
1. PvEで協力して探索・成長するサバイバルクラフト
2. プレイヤーが物理的に作り変えられるVoxel世界
3. 低コストな形状と素材を、光・色・霧で魅力的に見せる画作り
```

この3つを壊す実装判断は避けること。

新機能追加時には必ず以下を確認する。

- この機能は探索を面白くするか
- この機能は協力プレイを面白くするか
- この機能はVoxel世界を活かしているか
- この機能はAuthority負荷（Browser Host / Dedicated）を許容範囲に保てるか
- この機能は将来のバイオーム追加を妨げないか
- この機能はローポリ・低解像度アート方針と整合するか

以上を、本プロジェクトの上位設計原則とする。
