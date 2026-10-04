# ADR 0004: まとまった冒険と共有Authority

2026-10-03。ユーザーの最新指示で小さな試作単位のレビューをやめ、全仕様の完成状況を追跡しながらまとまった冒険を実装する。元仕様の段階的な内部検証は維持する。

- データ登録：5地域、5ボス、4系統の敵、素材・武器・レシピ・建築ピース・魔法。進行は採集→装備/設備→召喚→攻略→次Tier。
- GameSimulation/Adventure/SessionAuthorityはDOM・Three.js・ネットワーク非依存。Browser WorkerとColyseus Node Roomで共有。
- 岩の12個制限撤廃：空間Hashのペア接触、48m内の物理、65m内の表示、休止、容量倍増するInstancedMesh。無限に生成しても無限のFPSやメモリを保証するものではない。
- 水：2048セル、床を考慮した容量移送、外部面Meshと動的Buffer再使用、水中抵抗/浮上、重い岩への浮力と抵抗、霜魔法の一時凍結。
- 昼夜/天候はSimulation時間に従う。空・星・霧・照明・雨/雪/魔力の粒子・降水を描画/流体へ反映。
- 遠景LODはBrick内部の頂点クラスタで簡略化し、境界頂点をそのまま保持。異解像度の別サンプリングを混ぜない。
- 保存version2：旧version1を受理し、既存地形・岩・水を保持して冒険状態を作る。アイテム/建築/敵/攻略/環境/再参加者を検証・保存。Generator1/Seed7319を維持。
- WebRTC Star型、信頼チャネルとRealtime入力。大きい正本は分割送信。CloudflareのSQLite Durable ObjectsはSignalingだけでSimulationを行わない。Guest正本保存は禁止。
- Dedicatedは任意のNode/Colyseus配布。現時点で常設ホスティングやTURNの未設定を隠さない。無料枠のSQLite Signalingを既存アカウントへ公開し、別アカウント/別リポジトリや有料契約を使わない。
