# AI Training Participant Interaction ADR

Date: 2026-09-21

## Decision

AI研修の「ヒントを見る」「困った」「後でやる」は、新しい状態テーブルを作らず、既存`ProgramActionEvent`へEnrollmentとMission Assignmentを付けて記録する。

- `HINT_VIEWED`: 答えを表示せず、Mission Definitionの成功基準と条件から小さな着手ヒントを表示する。
- `HELP_REQUESTED`: 課題を小さく分ける案内を表示し、Assignmentを開始状態へ移す。
- `TRAINING_POSTPONED`: Assignmentを完了・失敗にせず、次回も同じ課題から再開できる状態を維持する。
- REVIEW後の再回答は、Adaptive Policyが`reviewMissionKey`から新しいAssignmentを発行する既存経路を使う。

## Security and privacy

イベント記録時はWorkspace、Service、Participant Membership、Enrollment、Assignmentを同時に検証する。ヒント・困った・後でやるのイベントには回答本文や自由入力を保存しない。

## Idempotency

操作ごとのUUIDを既存`ProgramActionEvent`の一意キーとして使用する。同じ操作の再送は既存イベントを返し、異なる操作へのキー再利用は競合として拒否する。
