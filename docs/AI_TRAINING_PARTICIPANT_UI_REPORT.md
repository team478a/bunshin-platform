# AI研修 受講者画面 実装レポート

## 1. 調査した内容

- AI研修PilotのProgram Runtime、Training Policy、回答・AI評価APIの接続状況
- 既存のAI物販参加者画面と、Program Moduleごとの画面振り分け方法
- `TrainingParticipantProfile`、`ProgramMissionAssignment`、`TrainingMissionAnswer`、`ProgramActionEvent`の既存構造
- Workspace、Service、Membership、Enrollment、Userの境界条件
- スマートフォンで「設定、課題確認、回答、評価、次の課題」まで進むために不足していたUIとAPI

## 2. 変更したファイル

- `packages/capability-training/src/runtime.ts`
- `packages/capability-training/test/runtime.test.ts`
- `packages/database/src/training-runtime.ts`
- `packages/database/src/training-profile.ts`
- `packages/database/src/index.ts`
- `packages/database/test/ai-training-profile-boundary.test.ts`
- `apps/web/src/http/ai-training-participant.ts`
- `apps/web/app/api/services/[serviceSlug]/ai-training/enrollments/[programEnrollmentId]/profile/route.ts`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/page.tsx`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/ai-training-card.tsx`
- `apps/web/app/s/[serviceSlug]/programs/page.tsx`
- `apps/web/app/styles.css`
- `apps/web/test/ai-training-participant-ui.test.ts`

## 3. 主要な設計判断

- 新しい研修基盤やAssignmentテーブルは作らず、既存のProgram Runtimeを正本として使用した。
- `ServiceProgram.settings.moduleKey`でAI物販とAI研修の参加者画面を安全に振り分けた。
- 初回設定は既存の`TrainingParticipantProfile`へ保存し、保存直後にTraining Policyで最初の個別課題を決定する。
- 課題本文はMission Definitionのキーに対応するTraining Capability内のカタログで管理する。過去に保存済みの表示スナップショットにも本文を補完できる。
- 回答送信後のAI評価失敗や画面再読み込みに備え、現在Assignmentに紐づく回答IDと評価状態をRuntimeから返す。
- プロフィール更新は`ProgramActionEvent`へ冪等に記録し、Workspace、Service、Participant Membership、Enrollment、User、Moduleの全境界を検証する。
- 受講者画面には内部キーやルールバージョンを表示せず、「今日やること」と理由、目安時間、回答欄だけを優先した。

## 4. 実行した検証

- Training Capability unit test
- Training Capability typecheck / lint
- Database boundary test
- Database typecheck / lint
- Web participant UI test
- Web typecheck / lint
- Repository全体のtest / typecheck / lint / build

## 5. 未解決事項

- 「困った」「後でやる」のProgram Action Event記録と画面操作
- AI研修のLINE通知とDeep Link
- 法人管理画面の進捗、継続率、現在テーマ、苦手領域表示
- Pilot用Program DefinitionとMission Definitionを本番サービスへ登録する運用手順

## 6. 次Phaseへ進める条件

- 本変更のCIが通り、受講者がスマートフォンで初回設定からAI評価まで完了できること
- Pilot対象サービスにAI研修Program、Offering、Enrollmentが正しく作成されていること
- AI Provider設定と研修回答評価用Promptが本番環境で利用可能であること

次Phaseは、LINE通知とDeep Linkを追加し、当日の個別課題へ迷わず到達できる状態にする。
