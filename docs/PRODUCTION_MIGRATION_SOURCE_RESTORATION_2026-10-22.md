# 本番適用済みmigration SQLの正本復元（2026-10-22）

## 状態

修正をDraft PRでレビューする。本番DB・履歴・設定・flag・コード反映は変更しない。新しいmigrationは作らない。CI結果はPR本文へ記録し、実装済み／検証済み／本番反映済みを区別する。

## 調査と原因

田中の指示により、ChromeのSupabase SQL Editorから対象projectの`public._prisma_migrations`を`BEGIN READ ONLY`と10秒のstatement timeoutで照会した。資格情報、利用者本文、生のDBエラーは取得・記載していない。取得した260件のmigration名・checksum・完了/rollback日時を、mainとproductionのSQLへローカルで照合した。

| 確認内容                                   | 結果              |
| ------------------------------------------ | ----------------- |
| 履歴件数・完了件数                         | 260件・260件      |
| 未完了/失敗、rollback、同名重複            | すべて0件         |
| mainとchecksumが異なる適用済みSQL          | 16件              |
| その16件とproductionのchecksum             | すべて一致        |
| 未適用                                     | 承認済みの3件だけ |
| 更新カタログ・監査・運用まとめの新テーブル | いずれも未作成    |

比較元はmain `148de029`、本番適用版のSQLを保持するproduction `b96cea56083cb47632f565aab0b74b70bd612986`。復元直前のmainの16 SQLは、失敗したPreviewのmain `b6ffe4a0`と同一である。

production専用コミットで追加された`BEGIN` / `COMMIT`と`SET LOCAL`のtimeout指定がmainに揃っていなかった。DB履歴はそのproduction版のchecksumを保持しており、psql Previewの厳密な履歴検査が`release-checksum-mismatch`として停止した。接続失敗や新しい3 migrationのSQLエラーではない。従来の`migrate status`によるpending一覧だけでは、このchecksum不一致を確認できていなかった。

## 修正内容と境界

- 不一致16件を上記production commitのファイルと同一内容へ復元する。追加は98行のtransaction/timeout wrapperと空行だけで、DDL本文・コメントは維持する。
- 対象名・本番履歴のchecksum・復元前mainのchecksum・wrapperを除く本文のchecksumを`packages/database/test/fixtures/production-migration-checksums-20261022.json`へ固定する。fixtureには運用に必要な技術メタデータだけを置く。
- `production-migration-source-restoration.test.ts`で16件それぞれの正本checksum、transaction/timeout指定、DDL本文の不変性を確認する。
- native psqlのDBテストに260件の履歴照合を追加する。16件は本番で観測した固定checksum、その他は対応するリポジトリSQLのchecksumで履歴だけを使い捨てschemaに作る。復元前のmanifestは拒否、復元後はPreview成功、再度の不一致は拒否し、全履歴の内容が変わらずDDLが実行されないことを確認する。これは本番schema全体の再現や本番Preview成功の証明ではない。
- checksum検査、TLS、lock、timeout、pending完全一致、履歴登録、適用workflowは緩和・変更しない。`schema.prisma`、`LATEST_DATABASE_MIGRATION`、承認済み3 SQLも変更しない。
- マージ済みmigrationを編集しない通常原則に対し、本件は田中の指示による正本復元の例外としてDecision Logへ記録する。履歴の値を現在のmainへ合わせて書き換える対処は採用しない。

## 共有ファイルの変更

- `docs/DECISION_LOG.md`: 読み取り専用調査の事実、正本復元の限定的な例外、後続の本番確認条件を末尾に追記。

## 検証と次の条件

ローカルで正本16件の照合、回帰テスト、format、diff検査を行い、CIのverify（typecheck / lint / test / build等）とdatabase（全migrationの新規DB適用、統合テスト、native psqlテスト）を確認する。検証結果はPR本文に実行先・成功/未実施を明記する。

マージ後に[psql手順](PRODUCTION_RELEASE_PSQL_2026-10-22.md)の本番Previewを新たに実行する。接続先・checksum・未適用3件・既存DDL痕跡・metadata接続のすべてに成功してからApplyへ進み、`db:assert-ready`を確認する。別の不一致があれば再適用せず停止する。コード反映はその後に別工程で行う。本PRでは本番操作・PRのマージは行わない。
