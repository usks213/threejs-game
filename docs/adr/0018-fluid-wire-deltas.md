# ADR 0018: 正確な水セルの差分転送と再同期

2026-10-05。ローカル実装・個別試験済み。公開ブラウザ/通信受入は別ゲート。

## 問題

初期の1参加者 snapshot は水7578セルを含み758,592 bytes。10Hzで毎回全水状態をJSON化していたため、静止している水まで大量に再送していた。

## 決定

- Coop protocol4。旧版はhello時に拒否し、ページ更新を案内する。セーブの水、世界権威、30Hz物理は変更しない。
- welcomeは従来の完全snapshotで接続ごとの水基準を初期化する。
- frameのwireではstate.fluids=[]とし、water={base,revision,count,changed,removed}を添付する。セルは[x,y,z,size,volume,bottom,vx,vz,frozenBit]のtupleで表す。
- 数値の量子化・時間間引きは行わない。変化したセルを正確に送り、removedは表示範囲から外れたセルを表す。世界から水を削除する命令ではない。
- クライアントは完全なFluidCell[]へ戻してから既存worker/UIへ届ける。表示辞書は8192セルまで。サーバーの全世界保存にはこの辞書を使わない。
- base/revision、件数、座標/格子/体積/速度/凍結値、重複キーを検査する。失敗したパッチは原子的に拒否してresyncを要求し、完全welcomeまで予測入力を止める。
- reconnect、server epoch変更、resyncは基準を作り直す。部屋管理の保存中に来たresyncは失わず、保存後に処理する。
- 重い完全welcomeは同じ接続につき最大1秒に1回へ集約する。通常の位置/水差分frameを間引くものではない。

## 証拠

- tuple/差分の正確なround trip、視野削除、凍結/速度変更、重複/欠落/不正値の原子的拒否、明示baselineからの再開をunitで確認。
- CoopClientが復号後にのみ完全snapshotを渡し、gap時にresyncへ入り再welcomeで戻ることを通信境界のunitで検査。
- 実WebSocketの共有world/復帰/管理/再起動回帰をprotocol4で実行。元の物理状態との長時間一致は追加soakで検査する。
- 初期world、1人静止、実authority90tick/30frameのNode比較: 全体24,418,776 bytes→差分版3,586,845 bytes（比率0.1469）、最大wire frame142,120 bytes。平均変更水セル1481.7/回。数値は/tmp/voxel-fluid-wire-budget.json。
- この比較はNodeでの内容と転送byte数。公開ネット、実ブラウザ、圧縮率、GPU/スマホFPSの測定ではない。welcomeは依然完全なworldを含み、初回読込負荷は残る。

## 自然水の追加予算

別途、新規自然水の生成は既存セル数32,768付近で待機し、未生成column cursorと既存水を保つ。既存保存のlegacy水queueは捨てず継続する。これは新規源の追加予算で、既存水の流動や手動放水を消す/全水セルを切り捨てる上限ではない。待機は地図で明示する。総保存量・全水の分散処理には今後も監視が必要。
