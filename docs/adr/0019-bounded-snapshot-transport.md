# ADR 0019: 同じ権威状態を保つ上限付き差分通信

状態: ローカル実装・固定版の全体検証待ち。公開版には未反映。

## 背景

protocol4の固定4d5a1f9は、実初期世界・2 WebSocket・15分で再接続、サーバー再起動、差分欠落からの復帰、水の権威一致を通過した。一方で合計受信1.905GB、平均21〜26tick/sで、整合性だけでは遊びやすさを満たさない。実保存による60frame比較では水のJSONと非水stateがほぼ半々だった。

## 決定

protocol6ではwelcomeを完全基準とし、通常転送を`delta`へ変更する。復号後だけ従来の完全`frame`をシミュレーション/UIへ渡す。

- 水は以前のexact deltaを小さなバイナリへ符号化してbase64へ変換。座標や既に丸められた速度などは、元のJavaScript Numberへ完全に戻る場合だけ整数表現を使う。体積はFloat64。表現できない値と負ゼロにはFloat64 escapeを使う。物理の精度、対象セル数、転送頻度を落とさない。
- 非水stateは正規JSON状態の葉差分。配列の長さが変わるとその配列を置換し、差分の方が大きい場合は完全なstateを送る。基準/revision、最大4MiB、12,000操作、深さ24、安全なプロパティ名を検査する。
- decoderは変更経路だけcopy-on-writeし、完成した候補のサイズを確認してから基準を進める。外へ渡すコピーは内部基準と分離する。
- 水またはstateのどちらかが欠落/破損したら一部をゲームへ渡さず、完全welcomeが来るまでその差分系列を停止する。従来の1秒welcome集約と入力停止を使う。
- クライアント間で予測した値を正本にせず、同じ権威tickの状態を復元する。水配列の格納順は意味を持たないため比較時に座標順へ正規化する。それ以外の配列順は保持する。

## ローカルの短い実測

保存された実世界から静止/移動それぞれ60frame、計120回で完全snapshotの一致を検証。移動ケースではprotocol4のJSON8.70MB→protocol6約2.82MB（67.6%削減）、静止は約69.0%削減。非水stateは4.28MB→0.402MB、水は約2.408MB。

copy-on-write後の移動ケースはencode平均3.57ms/p95 5.33、decode平均5.04ms/p95 7.57。旧JSON parse＋water decoderは同じ実行で平均3.27ms/p95 5.13。帯域と引換にCPUが増えるため、実ルーム全体のtick・メモリ・ACK時間で再評価する。

これはNodeの短い測定。公開回線、モバイルCPU、GPU、ブラウザ操作や15分protocol6受入を代替しない。計測rawはsoak-results内に版別保存し、古い結果を上書きしない。

## 配信環境で別途確認する事項

上記byte数はローカルのWebSocketアプリpayloadで、TLSやWebSocket圧縮後の公開回線量ではない。[Cloudflareの公式互換性説明](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#websocket-compression)はWebSocket圧縮への対応を示すが、現公開接続でのextension交渉は未検証。NodeのRSSも[Workersのメモリ制限](https://developers.cloudflare.com/workers/platform/limits/#memory)と直接比較できない。実Workerのメモリ・CPU・遅い受信者のバックプレッシャーは独立した受入項目として残す。新しい有料サービスや権限は追加していない。
