# 既存公開Workerの4人実測

2026-10-05。`scripts/probe-public-coop-load.ts` とCI `public-coop-load` は、PR5の既存プレビューだけを対象にする。今回の追加時点では実Workerで未実行。ローカルの本物の4 WebSocketによる測定器の検査は合格したが、公開性能の証明ではない。

## 測定条件

- 公開assetのcommit、authority healthのbuild/protocol/定員、全welcomeのbuild/roomを期待SHAと照合する。
- 新しい部屋へ独立4接続し、4つの異なるplayer IDと各3peerを確認する。秘密の招待/復帰情報は成果物へ書かない。
- 5秒のwarmup後、通常の移動inputを各20Hz、pingを各2秒に1回送り、60秒測る。接続/ACKの実際の待ち時間は別途掛かる。
- authority tick差分÷実経過秒、frame間隔、ping往復時間、受信byteを記録する。同一epoch/participantの完全baseline更新を許容し、件数も記録する。
- 不意の切断、epoch/ID変化、tick逆行、protocol/復号失敗、notice、15秒のping応答停止を失敗として保存する。
- 最大120秒、送信16,000packet、受信256MiBの上限がある。最後は4socketを閉じる。定員拡張・第三者の部屋・有料負荷サービスを使わない。

`status: completed` はデータ収集に成功した意味で、30Hz品質の合格ではない。目標30Hz、観測最小Hz、目標の2%以内かを別に出力する。成熟世界、ブラウザ描画、実機FPS、長期間の安定性はこの短い新規世界測定では判定しない。

## メモリについて

Cloudflareは[isolate当たり128MBの上限](https://developers.cloudflare.com/workers/platform/limits/)を説明している。NodeのRSS/heapをこの値へそのまま読み替えない。現在の公開endpointはbackendのpeak heapを公開しておらず、この試験も数値を捏造しない。短時間の4接続成功は、成熟した全ての世界が制約内に収まる証拠ではない。

[Durable Objectsの上限](https://developers.cloudflare.com/durable-objects/platform/limits/)と[無料枠](https://developers.cloudflare.com/durable-objects/platform/pricing/)も適用される。実行失敗時にplan・CPU limit・課金設定を自動変更しない。

## 成果物

CI artifact `public-coop-load-evidence` の `public-coop-load.json`。期待SHA、開始/終了時刻、上記の観測値と限界を含む。公開実行後、その結果を別途追記する。

## 測定器とCIの回帰（22:06 UTC）

7e36cdbaのCIは公開実測より前に停止。ローカルserverもViteのCI定義からbuild SHAを持つのに、測定器の単体fixtureが文字列`local`を期待していた。fixtureは実際の`COOP_BUILD_ID`を使い、loopbackに限り`local`または厳密な40桁SHAを許可するよう修正。公開originの制限やasset/authorityのSHA照合は緩めていない。明示した`GITHUB_SHA`で3試験が合格。

新規世界のローカル実4socketを60.063秒動かした観測は26.372tick/秒、受信31,412,860byte、各29pingのp95が約200〜222ms。schedulerは28回のrebase、8,168msの古い遅れを記録した。ただし同じNodeにserverと4decoderがあり、同じ作業環境で別のCPU profileも重なったため、独立したserver容量や最適化前後の比較には使わない。ゲームソースはローカル3f25f59で、公開Workerの結果ではない。

CIの公開測定も同じpreview上の別部屋のbrowser QAと並行し得る。部屋ごとの4参加者は確認するが、同一isolate/共有基盤の他の負荷がゼロとは仮定しない。
