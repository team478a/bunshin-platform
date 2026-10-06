# マナベルスタイル Wave 0 実行チェックシート

[Launch Runbook](MANABERU_STYLE_PRODUCTION_WAVE0_LAUNCH_RUNBOOK.md)と併用する。現在は全Production操作未実施、UNKNOWN、開始NO-GO。未記入をPASSにしない。証跡は非公開保管先のキーのみ、秘密/個人本文/UUID名簿を公開Gitへ貼らない。

## 対象固定・担当

- release SHA / rollback SHA / 本書revision: UNKNOWN
- Vercel project / alias / Supabase project / DB role（識別子のみ）: UNKNOWN
- Workspace / Service / Program対応の非公開証跡キー: UNKNOWN
- release責任者 / DB owner / Migration担当 / 停止担当 / Definition reviewer: UNKNOWN
- 内部人数（1〜2）/監視間隔/原価Alert/5xx・latency閾値/通知先: UNKNOWN
- backup方式 / timestamp / 成功証跡 / restore実行者 / RPO / 実測RTO: UNKNOWN
- 非公開実行記録の保管先 / 保持期間 / 参加者同意: UNKNOWN

## Human Approval Points

| 承認                                            | 承認者・時刻・証跡キー | 状態    |
| ----------------------------------------------- | ---------------------- | ------- |
| Production同定・読取監査の範囲/権限             | 未記入                 | UNKNOWN |
| Migration（全pending/backup/lock/drain含む）    | 未記入                 | UNKNOWN |
| 固定SHA Production deploy                       | 未記入                 | UNKNOWN |
| 3Definition教育判断とAPPROVE操作                | 未記入                 | UNKNOWN |
| authority/上限/モデル・費用/監視/停止手段の設定 | 未記入                 | UNKNOWN |
| 内部1〜2人のEnrollment/Seat準備                 | 未記入                 | UNKNOWN |
| 本人Profile回答・Provider送信への同意           | 未記入                 | UNKNOWN |
| Pilot enable / 実Provider費用 / 停止試験・再開  | 未記入                 | UNKNOWN |
| Wave1移行（この記録では実行しない）             | 未記入                 | UNKNOWN |

## Production操作記録

結果はPASS/FAIL/UNKNOWNを使用し、各行を実測証拠で更新。失敗/UNKNOWNで後続停止。担当と承認者を区別する。

| Phase・操作                               | 実行者 | 実行時刻 | 実行前確認                    | 実行結果 | Evidenceキー | 判定    | rollback必要性 |
| ----------------------------------------- | ------ | -------- | ----------------------------- | -------- | ------------ | ------- | -------------- |
| A 対象同定・全差分/CI/pending/flag読取    | 未記入 | 未実施   | 独立read承認                  | 未実施   | 未記入       | UNKNOWN | 未判断         |
| B backup確認・隔離restore/RLS/DDL検証     | 未記入 | 未実施   | DB owner/restore承認          | 未実施   | 未記入       | UNKNOWN | 未判断         |
| B 全pending Migration                     | 未記入 | 未実施   | backup/lock/drain/実行承認    | 未実施   | 未記入       | UNKNOWN | 未判断         |
| C deploy・alias/SHA/schema/RLS確認        | 未記入 | 未実施   | CI/release承認/Pilot OFF      | 未実施   | 未記入       | UNKNOWN | 未判断         |
| C 旧V1/Auth/Admin/LINE/Pilot OFF smoke    | 未記入 | 未実施   | 課金・実送信なし範囲          | 未実施   | 未記入       | UNKNOWN | 未判断         |
| E 専用Program初期化/停止操作・authority   | 未記入 | 未実施   | trusted operation Blocker解消 | 未実施   | 未記入       | UNKNOWN | 未判断         |
| D 3Definitionレビュー→APPROVE→GET/監査    | 未記入 | 未実施   | 7項目人間確認/固定版          | 未実施   | 未記入       | UNKNOWN | 未判断         |
| F Enrollment準備→停止状態再確認           | 未記入 | 未実施   | ACTIVE/SUSPENDED切替承認      | 未実施   | 未記入       | UNKNOWN | 未判断         |
| F Wave0 CONFIGURE→INTERNAL ADMIT          | 未記入 | 未実施   | CAS/空台帳/内部人数承認       | 未実施   | 未記入       | UNKNOWN | 未判断         |
| F 本人Profile UI保存・再読取              | 未記入 | 未実施   | 本人session/必須3回答/停止    | 未実施   | 未記入       | UNKNOWN | 未判断         |
| G 準備flag閉鎖・全Gate/開始承認→ON        | 未記入 | 未実施   | 全PASS/READY/費用/停止        | 未実施   | 未記入       | UNKNOWN | 未判断         |
| H 実本人/実端末E2E・境界試験              | 未記入 | 未実施   | 内部seatのみ/実課金承認       | 未実施   | 未記入       | UNKNOWN | 未判断         |
| H FirstSuccess/Capability/再Login復元     | 未記入 | 未実施   | 本人操作・評価・明示完了      | 未実施   | 未記入       | UNKNOWN | 未判断         |
| I 観測（各sessionの記録を追加）           | 未記入 | 未実施   | 担当/閾値/本文非保存          | 未実施   | 未記入       | UNKNOWN | 未判断         |
| K 停止・Provider/Assignment拒否・drain/V1 | 未記入 | 未実施   | 承認済み停止手段              | 未実施   | 未記入       | UNKNOWN | 未判断         |
| J Wave0結果レビュー/Wave1判断             | 未記入 | 未実施   | 全証拠/重大問題ゼロ           | 未実施   | 未記入       | UNKNOWN | 未判断         |

## 最終Gate

| Gate               | 必要証拠                                          | 現在                             |
| ------------------ | ------------------------------------------------- | -------------------------------- |
| Code/release       | 採用SHAのCI成功・全差分承認                       | UNKNOWN（基準main CI成功とは別） |
| Migration          | 全履歴・backup/restore・実schema/FK/RLS/role      | UNKNOWN                          |
| Deploy/V1          | alias/SHA、非破壊smoke、共有資源影響              | UNKNOWN                          |
| Definition         | 3版の人間判断・APPROVED/現承認者/監査             | UNKNOWN                          |
| Internal           | 人数/INTERNAL Seat/allowlist/Profile/実Auth       | UNKNOWN                          |
| Provider/Admission | source/model/価格/数値/課金承認/観測              | UNKNOWN                          |
| Stop               | trusted操作・全instance・送信済call/drain・V1継続 | UNKNOWN                          |
| Privacy/Logs       | log本文除外・同意/保持/復元後削除・実境界否定     | UNKNOWN                          |

現在NO-GO。最初の操作はProduction対象同定・読み取り監査の承認。Migration/deploy/APPROVE/登録/ONはその承認に含まれない。実施中に重大問題があればRunbook冒頭の停止手順へ移り、データを保全する。
