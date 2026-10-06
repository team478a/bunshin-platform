# Personal Learning Pilot Profile初期化

## 基準と範囲

基準main: `f3b05fc13504b6e5ee296c6e16c3d371be193b29` (#1155)。branch: `feat/personal-learning-pilot-profile`。commit/PRと全体検証結果はPRのheadおよびChecksを参照する（自己参照SHAは本文に埋め込まない）。

今回のゴールは、本人による既存TrainingParticipantProfileの最小初回保存・復元API。UI、Goal、Plan、Assignment、Definition承認、Pilot開始、Provider、本番配備を追加・実行しない。

## APIと準備Gate

`GET /api/services/{serviceSlug}/ai-training/enrollments/{programEnrollmentId}/personal-learning/profile` は本人の最小Profileまたはnullを返す。GETはDB更新しない。

同pathのPOSTは `operationId` (UUID)、`role` (SALES/OFFICE/MANAGER/OTHER)、`aiLevel` (BEGINNER/INTERMEDIATE)、`dailyMinutes` (5/10/15)、`confirmation=CONFIRM_MY_LEARNING_PROFILE`、`expectedAbsent=true` のみ受け付ける。全項目明示必須、追加key拒否、JSONは2048byte以内。POSTはsame-originが必須。

非本番かつ `PERSONAL_LEARNING_PROFILE_PREPARATION=true` の場合のみ利用可。既定無効。本番ではflagがtrueでも拒否する。既存sessionとservice所属からactor/workspace/groupを解決し、DBで本人ACTIVE PARTICIPANT、User/Workspace/Group、利用期間内ACTIVE Enrollmentを再検証する。管理者による他人のProfile初期化は不可。

専用ProgramはSUSPENDED、moduleKey=AI_TRAINING_V1、personalLearningPilot.enabled=false、enrollmentIdsは本人を含む重複なしUUID1〜5件、trainingOperations.notificationsEnabled=false/postponedReminderEnabled=falseが必要。準備段階で対象allowlistだけ設定し、Pilot実行は有効化しない。実参加者登録・設定変更はこのPRで行っていない。既存通知jobのdrain確認は開始前の人間Gateとして残る。

## 保存正本とPrivacy

TrainingParticipantProfileを唯一の正本にする。role/aiLevel/dailyMinutesと本人updatedByUserId、既存catalog versionだけ設定し、learningGoalKeyはnull。旧Profile保存処理のGoal作成/取消は呼ばない。Goal/Assignmentが既にあるEnrollmentを旧コースから変換しない。

UNKNOWNをBEGINNERやNONEへ変換しない。必須項目に本人が回答できなければ保存しない。P1-BのAI経験projectionは引き続きUNKNOWNであり、BEGINNERを未経験と解釈しない。Tool経験等は追加しない。

相談・業務context・成果物・自由文を保存しない。既存ProgramActionEventには版/確認種別/スコープと回答のfingerprintのみを追加する。fingerprintも個人由来データであり、匿名Analyticsではない。既存Export/ALL削除対象に含まれる。ALL削除auditがある場合は初期化・再送・読取を拒否し、削除後に再作成しない。

## 冪等性・競合

既存Enrollment lock、Serializable transaction、Enrollment単位のProfile unique/create-if-absentで初期化CASを構成する。既存Profileをupsertしない。同operation UUID/本人/scope/正規化回答だけ再送可能、変更再送はCONFLICT。再送時も権限・期間・準備Gateを再検証する。競合時はCONFLICTとなり再送を判断できる。Profile/Eventは同一transaction。

## 変更ファイルと検証

追加: database repository/contract test、web HTTP handler/route/API test、本報告とADR。変更: package exports、既存Pilot pure policyとtest、既存PostgreSQL統合testへのケース追加。

ローカル追加テスト: policy 8、contract 2、API 17成功。実PostgreSQLで初期保存/復元、再送と変更拒否、同時初期化、別scope、失効所属、停止Program/期間、削除後再作成を検証する。全体format/typecheck/lint/test/buildと既存回帰・DB統合はPR Checksで確認する。未実行/未成功のGateを成功と扱わない。

schema/migration/新Model/依存Provider/UI/LINE/30日V1の既存処理変更なし。本番Migration・deploy・実課金APIなし。

## 積み残しとrollback

準備UIは未作成。APIは非本番で本人の既存認証を使用する。管理者が本人の回答を代入したり、秘密情報/sessionをコピーする運用を前提にしない。実認証によるstaging E2E、実Profile登録、Definition人間承認、専用Enrollment設定、通知停止確認、Pilot開始承認は別Gate。実Pilot参加者の準備完了をこのPR完了と同一視しない。#1153 readiness文書は未マージであることにも注意する。

rollbackは準備flagを無効化しAPIを閉じる。必要なら本PRをrevertする。既存Profile/Eventを自動削除せず、個人データ削除は既存の本人権限付き削除手順を用いる。次機能へは別指示を待つ。
