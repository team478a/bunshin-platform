# マナベルスタイル：結果に応じた次の実践

日付：2026-10-13  
状態：実装PR作成中。実AI・実受講者・本番では未検証。

## 目的

一つの動的課題で確認できた提出結果を使い、元の希望を保った次の実践案を用意する。課題未達・本人申告のみ・評価待ちでは次の課題を出さず、現在の課題をそのまま継続する。提案と実行中Planの切替は別操作にする。

## 実装

- 最後の提出が`CURRENT_STEP_EVIDENCE`で確認済みの場合だけ、既存`PersonalLearningRequest`の次Revisionを追記する。元の希望、端末、ツール、経験を保持し、確認できた点・未確認事項・次の行動を`currentPosition`へ限定保存する。
- 課題・確認結果・本人・Enrollmentの所有範囲をEnrollment lock内で再確認し、`PERSONAL_LEARNING_NEXT_TASK_PROPOSED`を冪等キー付きで保存する。AI生成はtransaction外の既存課題作成前AI費用Admission・利用台帳・教材候補保存を再利用する。
- Lesson Prompt v2は前回の確認情報を学習進捗データとして扱い、指示として実行しない。前課題を繰り返さず元の希望へ進む小さな実践を提案する。モデルが未確認情報を必要と判断した場合は、前課題を維持する。
- 次候補を表示・本人確認した後、別操作で開始する。Enrollment lock下で候補・元希望・前課題の確認済み回答・proposal event・Plan revisionを照合する。前のAssignmentを完了履歴として保持し、同じGoalの次Plan revisionと次Assignmentを原子的に作る。
- 開始時の再送は保存済みの次Assignmentを返す。古い課題・回答・評価・支援履歴は削除・上書きせず、Goal全体や受講終了・Profile技能へ進捗を転記しない。

## 確認範囲

- APIの次案生成は既存教材生成サービスを使う。ローカルでは実AIを呼び出していない。
- 追加した隔離PostgreSQL結合ケースは、証拠確認後の次候補、Plan revision 2、Assignment切替、冪等再送、前履歴保持を検証する。実行結果はPR CIを確認後に記録する。
- 実受講者が次課題の適切さを確認した事実、実AI原価、本番設定・Migration・Deployは未検証・未実施。
- 画像添付、LINEからの再開、経験の異なる受講者による効果は別作業。

## 境界

本人が次課題案を確認するまでは既存のCONFIRMED PlanとSTARTED Assignmentを変えない。確認して「開始」を押したときに限ってPlan revisionを切り替える。一つの課題の完了はGoal全体の完了を意味しない。実際のAI利用・本番反映は既存の承認Gateに従う。
