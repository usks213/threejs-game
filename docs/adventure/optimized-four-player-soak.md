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


## 2026-10-06:14459fe2対応ソースの再確認

local3fc3cad/remote14459fe2の固定コピーを使った実4WebSocket試験は903,574.632msで完走。state/水各338照合、31保存、85成功操作/11正規拒否、7再送、計画切断1・実サーバープロセス再起動1・欠落deltaからの再同期1、失敗0。初期世界の差替えはありません。[保存結果](../benchmarks/four-player-soak-2026-10-06.json)。

ACK p95は810.15ms、受信1,493,165,385bytes。Node RSSの定期サンプル最大580,431,872bytes、終了時を含む最大587,198,464bytes、heap定期最大344,714,616bytes。第1サーバーのstep平均24.73/p9572.53ms、第2は41.71/p9594.22msで、長時間品質30Hz合格とはしません。Node RSSをWorker128MiB制限に読み替えません。後続のWorker時計修正や追加ブラウザ受入には、それぞれ別の実行証拠が必要です。

完全summary SHA256: `43fe31ab6973f716d407ec88a603cb81b4212a4f1775c9af04edc4fe0d3e2b0d`。sourceHash: `f7f462c07baf52f1f9e875c5ef80180e8332bea428b2550eb43be3e701d07ea2`。
