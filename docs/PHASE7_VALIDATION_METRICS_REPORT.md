# Phase 7 Validation Metrics Core 実装レポート

## 1. 目的

100-user FREE検証で、登録数だけではなく「BUNSHINの指示によって実際に投稿したか」を既存Raw Eventから確認できるようにする。

## 2. 実装範囲

- Workspace単位のValidation Metrics集計ユースケース
- OWNER / ADMIN専用の読み取りAPI
- RegistrationからD7 Activeまでのユニークユーザーfunnel
- 投稿数、GOOD Feedback率、D7率
- 最重要KPI「登録後7日未満に3回以上投稿したユーザー率」
- 認証、期間入力、tenant isolation、aggregate-only responseのテスト

DB schemaとmigrationは変更していない。既存のUser、Membership、Bunshin、Capability Assignment、Strategy、Mission Activity、PostRecord、Feedbackを集計元とする。

## 3. API

```http
GET /api/workspaces/{workspaceId}/validation-metrics?from=2026-08-01&to=2026-09-01
```

`from`はUTC日付の開始を含み、`to`はUTC日付の開始を含まない。最大366日。レスポンスは`private, no-store`で、個人情報、Knowledge、Memory、投稿本文、URLを返さない。

アクセスできないWorkspace、MEMBER権限、別Workspaceは情報漏えいを避けるため404として扱う。

## 4. 指標定義

期間内の各funnel値は、該当イベントを1回以上行ったユニークユーザー数である。

- Registration: 期間内に作成されたUserで、対象WorkspaceにACTIVE membershipを持つ
- Bunshin Creation: 期間内にBunshinを作成したowner
- SOCIAL Activation: 期間内にSOCIAL assignmentがactivatedになったactor
- Strategy Completion: 期間内にStrategyを作成したBunshin owner
- Strategy Approval: 期間内にStrategyを承認したBunshin owner
- First Mission View: VIEWED activityを持つactor（期間内の初回有無）
- Mission Acceptance: ACCEPTED activityを持つactor
- Copy: いずれかのCOPIED activityを持つactor
- Posted: PostRecordを持つactor
- D7 Active: 登録後7日以上8日未満にMission ActivityまたはPostRecordを持つactor

初週3投稿率とD7率は、期間末時点で登録後8日を完了したcohortだけを分母にする。観測期間不足のユーザーを失敗扱いしない。

## 5. Isolation / Privacy

- 全クエリに`workspaceId`を必須適用
- ACTIVE WorkspaceのACTIVE OWNER / ADMIN membershipを最初に検証
- cohort eventも対象Workspaceで再制限
- aggregate値だけを返し、userIdを含む明細は返さない

## 6. 今回の対象外

- 管理画面UI
- AI原価（現状Provider usageの永続化がないため）
- 外部Analytics、SNS OAuth、自動投稿
- Share / Referral / Segmentation
- LINE、課金、法務文書・退会フロー

## 7. 次の推奨Slice

1. このAPIを使う最小管理画面
2. AI Provider usage / costのRaw Event設計と保存
3. 利用規約・プライバシー同意・削除/退会

本番ダッシュボードでの作業を必要としない順序で進められる。
