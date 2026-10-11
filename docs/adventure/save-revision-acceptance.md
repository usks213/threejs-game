# SAVE-02: 保存完了した世代の表示

## 表示する値

- 個人ワールドは `SaveRepository` の `Manifest3.revision` を表示する。保存・読み込みの検証が成功した実際のUUIDであり、編集数やシミュレーションtickを保存完了番号として流用しない。
- 共有ワールドは `writeRoom` が原子的な保存transactionを完了した後の `CheckpointManifest.generation` を表示する。再接続時には検証済みの保存世代をwelcomeへ含める。以前の正常な保存へ復旧した場合は、復旧先として実際に採用した世代を返す。
- 設定画面の保存欄には短い世代IDを表示し、`title` と `data-revision` に同じ実IDを保持する。ローカルと共有を区別する。まだ正常な保存を確認できない場合は「保存世代未確認」とする。
- 保存に失敗しても、未完了のUUIDで最終保存世代を進めない。読み込めないセーブ、旧形式で世代IDのないセーブ、新規開始でまだ保存していないセーブへ番号を捏造しない。
- ファイル保存を使うローカル実WebSocketサーバーはcheckpoint内へ `persistenceRevision` を保存し、ファイルとディレクトリのsyncを終えてから通知する。保存先ディレクトリを指定しないメモリ専用サーバーは保存世代を通知しない。

## コード

- `src/save/repository.ts`, `src/save/storage.ts`, `src/save/revision.ts`
- `src/save/room-storage.ts`
- `apps/coop/local-server.ts`, `apps/coop/src/index.ts`
- `src/networking/authority-room.ts`, `coop-protocol.ts`, `coop-client.ts`
- `src/platform/network.ts`, `src/platform/game.ts`, `src/ui/persistence.ts`

## ローカル試験

- `save-repository.test.ts`: commit済みUUIDの照合、書込失敗・アーカイブ失敗で前世代保持、書込待機中と旧形式では未確認。
- `room-storage.test.ts`: 世代の永続保存との一致、失敗時の前世代保持、復旧時の採用世代、旧形式移行後の実世代。
- `persisted-revision-clients.test.ts`: 実WebSocket通知とディスク値の一致、保存通知後のACK、サーバー再起動後の照合、メモリ専用ルームで保存世代を出さない。
- 3ファイルと進行の回帰を合わせて32件合格。型検査はメイン・Signaling・Coopをすべて合格。
- `adventure-progression.spec.ts` にローカルHUDとIndexedDB manifestの一致を追加。公開URLのブラウザでの見え方は別途確認する。
