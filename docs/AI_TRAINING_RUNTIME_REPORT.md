# AI研修 Runtime 接続レポート

## 1. 調査した内容

- `AiTrainingV1Policy` と既存の Program Runtime テーブルの接続状況
- `ProgramEnrollment`、`ProgramMissionAssignment`、`ProgramProgressSnapshot` の更新規則
- `TrainingParticipantProfile` と回答評価後の進捗更新
- 受講者本人・Workspace・Service・Enrollment の境界条件
- 完了済み課題、WAIT、RECOVERY の再選定条件

## 2. 変更したファイル

- `packages/capability-training/src/index.ts`
- `packages/capability-training/src/runtime.ts`
- `packages/capability-training/test/ai-training-v1-policy.test.ts`
- `packages/capability-training/test/runtime.test.ts`
- `packages/database/src/training-runtime.ts`
- `packages/database/src/index.ts`
- `packages/database/package.json`
- `apps/web/src/http/ai-training-participant.ts`
- `apps/web/app/api/services/[serviceSlug]/ai-training/enrollments/[programEnrollmentId]/current/route.ts`
- `apps/web/package.json`
- `pnpm-lock.yaml`

## 3. 主要な設計判断

- 新しい進捗テーブルを作らず、既存の Assignment、Event、ProgressSnapshot を正本として使う。
- 公開済み `ProgramTemplateVersion` に存在する AI研修 Mission だけを選定可能にする。
- Mission選定はルールベースで行い、同じ状態では同じ候補を返す。
- 完了済みの職種別Missionは再提示せず、職種別の順序で次の未完了Missionへ進める。
- 全職種別Mission完了後は、翌日再判定の WAIT を提示する。
- Assignment作成とSnapshot更新をSerializable Transactionで行い、revisionと一意制約で重複を防ぐ。
- 受講者本人のActiveなGroupMembershipとEnrollmentが一致しない場合は存在を開示しない。

## 4. 実行した検証

- AI研修Policy・Runtimeテスト: 10件成功
- `@bunshin/capability-training` typecheck / lint: 成功
- `@bunshin/database` typecheck / lint: 成功
- `web` typecheck / lint: 成功
- 変更ファイルのPrettier適用、`git diff --check`: 成功

## 5. 未解決事項

- 受講者の `role` と `aiLevel` を登録する初期設定API・画面
- Mission本文と回答欄を表示するスマートフォン向け受講画面
- 「困った」「後でやる」のAction Event記録
- AI研修通知のLINE配信とDeep Link

## 6. 次Phaseへ進める条件

- 本変更のCIが成功し、mainへマージされること。
- 次は初期設定と受講画面を、今回追加したCurrent Mission APIへ接続する。
