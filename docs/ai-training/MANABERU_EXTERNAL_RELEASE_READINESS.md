# マナベルスタイル 外部公開準備判定表

判定日: 2026-10-19  
対象: 本線化指示書v4 §3-2、PR-G  
判定: **NO-GO（本書更新では本番・外部公開の確認や操作をしていない）**

`PASS` は根拠を指定して確認済み、`FAIL` は条件不成立、`UNKNOWN` は証拠なし・未確認を表す。空欄やmainへのマージをPASSに読み替えない。実施者、承認者、時刻、非公開証跡キーが揃わない項目はUNKNOWNのままにする。

## 必須Gate

| Gate                | 外部公開前に必要な証拠                                                                                         | 状態               | 証拠キー / 注記                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------- |
| A〜Fのコード        | A〜F各PRのmain merge SHA、全CI成功                                                                             | PASS（コードのみ） | #1337 PR-Fはmerge済み。N-1/N-2のmergeはあるが、この表はProduction反映を意味しない |
| 固定Release         | 承認済みrelease SHAとVercelの本番alias/配信SHA一致                                                             | UNKNOWN            | 本PRでは確認・deployなし                                                          |
| DB整合性            | 全migration履歴、checksum/drift、必要schema、role/RLSのread-only照合                                           | UNKNOWN            | 失敗・未確認時は開始不可                                                          |
| Backup/restore      | 直近Backup取得成功と隔離restore成功。**復元元Backup ID・取得時刻・復元先の来歴が信頼できる記録で結び付くこと** | UNKNOWN            | #1205由来の課題。件数比較等から来歴を推定しない                                   |
| 実AI会話評価        | 固定10シナリオ、Web 5件/LINE 5件、各10発言以上、実AI、費用/応答時間証跡                                        | UNKNOWN（未実施）  | PR-G評価パケットと非公開証跡を使用                                                |
| 人手採点            | 各会話2人以上の採点。1人以上は受講者役と別。7観点、差2点以上の調整を記録                                       | UNKNOWN（未実施）  | 採点CSVは空テンプレート                                                           |
| 評価結果            | 観点1〜6平均4.0以上、観点4〜6の1点なし、観点7の承認済み上限内、重大問題なし                                    | UNKNOWN            | 合格は固定評価セット内の品質確認のみ                                              |
| Admission/実費      | Provider/model/単価版、既存Admission、Provider側上限、実費照合、監視担当を承認                                 | UNKNOWN            | 実価格/実費を推測しない。未設定・費用不明はNO-GO                                  |
| 同意/プライバシー   | 適用同意版、データ範囲、保存期間、Export/削除、運営閲覧制限を確認                                              | UNKNOWN            | 画面文言・規約の確定者による確認が必要                                            |
| LINE                | Webhook URLとredelivery設定、月間quota、警告/停止、retry-key、5件のLINE評価                                    | UNKNOWN            | Console実設定と実配送証跡が必要                                                   |
| 自動削除            | Retention preview/execution、cron登録、dry-runと削除後照合、対象範囲/監査件数の確認                            | UNKNOWN            | 本番有効化は別承認。保持対象の未処理や本文記録がないこと                          |
| Kill switch / drain | Pilot停止、全instance反映、新規AI操作拒否、処理中callと送信済みjobのdrain、V1継続                              | UNKNOWN            | 実環境での担当者・連絡先・停止時限を確認                                          |
| 内部運用観測        | 内部1〜3人の実完走、再Login復元、障害・原価・Privacy観測を証跡で確認                                           | UNKNOWN            | Wave 0結果レビューが必要                                                          |
| 法人/外部契約       | 参加条件、外部上限/Wave、利用規約・プライバシー表示の専門家確認、サポート/停止窓口                             | UNKNOWN            | 事業責任者・専門家の承認が必要                                                    |
| 最終承認            | PR-G評価、全Gate、Wave 0、保持cron実動作を田中が確認し外部公開を別途明示承認                                   | UNKNOWN            | 本PRは承認・開始・公開を代行しない                                                |

## 判定ルール

- すべての必須Gateが証拠付きPASSになるまで外部公開しない。一つでもFAIL/UNKNOWNならNO-GO。
- 本番反映、DB migration、Feature flag変更、Pilot enable、外部Seat/募集、Retention cron有効化は、それぞれ個別の承認と手順に従う。本表の記入・PR mergeはそれらの承認ではない。
- PR-Gの実AI会話や採点を実施していない段階では、外部公開の結論をPASSへ更新しない。
- 復元元Backupの証明が得られない場合、他GateのPASSに関係なくNO-GOを維持する。

## 変更履歴

| 日付       | 更新者 | 変更                                                  | 証跡       |
| ---------- | ------ | ----------------------------------------------------- | ---------- |
| 2026-10-19 | Codex  | 初版。確認していないProduction項目をUNKNOWNのまま登録 | PR-G Draft |
