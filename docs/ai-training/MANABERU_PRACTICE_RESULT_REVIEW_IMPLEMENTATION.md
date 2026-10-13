# マナベルスタイル：実践結果の証拠別レビュー

日付：2026-10-13  
状態：実装PRレビュー待ち。本番未反映。実受講者の学習効果は未検証。

## 目的と実装範囲

自由希望から始めた本人用課題について、本人の報告と提出テキストを分けて記録し、保存済み課題の評価基準に対応する確認結果を返す。既存の`TrainingMissionAnswer`、評価Job、AI利用枠・利用台帳を再利用する。自由課題を旧固定6技能評価へ流さず、目標全体の達成や受講終了にはしない。

今回の変更は第8分割であり、自由希望から実践・途中支援・結果確認・次回再開までの全要件を完了したものではない。

## 主な変更

- Application型で提出種別（`TEXT` / `SELF_REPORT`）、提出Revision、課題固有のレビュー状態と根拠を定義。PASS、点数、習得状態は導入しない。
- `training_mission_answers.mission_assignment_id`のDB一意制約を外すmigrationを追加。新しい動的課題の複数提出を許可し、既存課題の一件制約はRepositoryのEnrollment lock下で維持する。各提出は追記され、直近提出の差替え・上書きは禁止する。
- 提出時にEnrollment、Assignment、候補ID、教材版、連続Revision、既存Pending回答の有無を再確認。同一idempotency keyの異なる本文は競合にする。
- 通常登録のPilot受講は、有効な外部参加席とseat projectionの両方を満たす場合に限り自由希望経路を利用できるよう接続。内部席、失効席、allowlist/cap不整合は拒否する。
- 動的課題用HTTP入口を既存Answer保存と評価Jobへ接続。評価Jobは保存済み教材・基準を使い、一般評価とは別の動的レビュー経路へ分岐する。
- AI入力は教材の元希望・到達点・基準と提出内容に限定。提出文中の指示を実行しない。条件を越える基準参照は拒否する。
- 返すのは提出文から観察できた範囲、未確認事項、次の小さな確認行動。本人申告は`SELF_REPORT_ONLY`のまま、提出物による確認へ昇格させない。
- Review保存前にEnrollment lock、現行Assignment/Answer、課題版、回答Revisionを再確認。遅延・差替え後の評価を新しい回答に適用しない。Assignmentは`STARTED`のまま、Goal/Planやプロフィール技能を更新しない。
- 画面に提出種別、提出履歴、基準に限定した確認結果、未確認事項を表示する。スマートフォン幅の合成UIケースを追加。
- Decision LogとRoadmapへ記録。

## セキュリティ・運用境界

回答本文をActionEvent metadataへ複製せず、識別と冪等性のためのdigest・Revisionだけを使う。利用量・原価は既存のAdmission/Usage台帳を通す。原価設定が不足する場合に0円扱いを追加していない。評価対象の表示や課題自体をProviderへ送る実AI試験は未実施。

このリポジトリではmigrationを追加しただけで、本番・共有DBへ適用していない。main/productionは別リリース系統として維持し、deploy、設定変更、参加者登録、実課金、Pilot開始は行っていない。

## 検証

実施済み：

- `@bunshin/application`対象テスト：10 passed。
- Web対象テスト（Provider review、Practice HTTP）：23 passed。提出文中に存在しないAI引用を証拠扱いしないケースを含む。
- Web・Database型検査：実行済み。`@bunshin/database`のPrisma generate/typecheckとWeb typecheckが成功。
- Database unit tests：998 passed。初回はmigration追従の最新名定数漏れを検出したため定数を更新して再実行。
- UI harness型検査・lint：実行済み。
- 追加のスマートフォン幅合成E2E：実行環境のNode.jsが22.15.0で、runner要件の22.22.3以上または24.8.0以上を満たさず未実行。
- Prettier全体check、変更箇所lint、Prisma schema validate：成功。schema validateは接続しないローカル用placeholder URLで実施。
- 隔離PostgreSQL結合テスト：この実行ではDB接続・marker再確認を行っていないため未実行。

未実施：

- 指定環境での実AI生成・利用量/原価記録確認。Admission・価格レジストリ・許可上限の実運用条件を満たすか未検証。
- 実ユーザーでの初回実践、つまずき、再提出、次回再訪、支援介入時間、学習成果。
- 画像1枚、LINE再開、次課題提案、正式な未達継続。
- migrationのDB適用、本番反映。

## 次の条件

1. Node.js要件を満たす環境でUI E2Eを再実行し、既存Answer/Jobを含むDB結合テストを使い捨てDB marker確認後に実施する。
2. 必須CIを通過し、PRレビューを受ける。
3. 次の実装候補は未達後の同一課題継続と、確認後の次課題提案を既存Goal/Planへ接続すること。その後に画像、LINE、許可された実AI検証を行う。
4. それらの実装・レビュー・限定releaseが揃うまで、実受講者向け機能の完成や本番公開可とは判定しない。
