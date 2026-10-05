# 最適化後の4接続・15分確認

2026-10-05 23:09 UTC開始。公開763c79024cabd948818b38db502a155b8440f8ecと同じtreeのローカル89d0367を固定コピーし、既存`SOAK_PLAYERS=4 node --import tsx scripts/soak-coop.ts`を実行した。途中のソース変更を検出するhashは`ad50e80749162a1ec6a7ded1d26d8f7a1a8e9ca7b818e0601ed197b156792ac9`。新規の本物の世界を使用し、水/敵/所持品等を軽いfixtureへ置換していない。

## 結果

- 903.307秒完走、失敗/notice/サーバー例外0。
- 4本の実WebSocket。完全snapshotと水の照合を各358回、保存検査31回。
- 予定した切断/復帰1回、実Nodeサーバー再起動1回、意図的な差分欠落と完全再同期1回、再送検査7回。
- 受理81操作、想定した拒否13操作。自然に遠ざかった部品を操作範囲外から無理に動かすことはせず、該当操作をskipした記録も残す。
- 35,043 frame、受信1,530,819,810byte。ACK p95は761.49ms。
- 計測期間のNode RSS最大565,739,520byte、終了時も含めた最大571,453,440byte。heapサンプル最大336,879,208byte。
- 2つのserver実行で、計測器を含むroom.step平均26.67/27.93ms、p95は77.07/78.87ms。schedulerは合計95回rebaseし、31,416msの古い遅れを記録した。固定30Hzのdtを使うことを、常時30tick/実秒の達成と同一視しない。

集計は`docs/benchmarks/four-player-soak-2026-10-05.json`。元summaryのSHA-256は`4dcbeaf7e82afe5da3f56801b205cc3318a084084e49d9aedc40703e58583ef5`。保存データ/復帰capabilityそのものは公開しない。

## 限界

これはNodeサーバー/driverによる整合・保存・長時間の確認で、ブラウザ描画、実Android/iPhone、Cloudflare128MB制約の証明ではない。過去の遅い版とはtick数/自然な世界の成長/操作結果が違うため、総byte数やRSSだけで最適化の因果効果を主張しない。同じcommitの実Worker60秒測定は別資料で約26.8Hzであり、30Hz受入は引き続き未達。後続の変更へこの15分合格を無条件に継承しない。
