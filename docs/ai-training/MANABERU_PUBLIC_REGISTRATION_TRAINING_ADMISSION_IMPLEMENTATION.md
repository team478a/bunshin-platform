# マナベル公開登録から研修参加を準備する実装

日付: 2026-11-03

## 1. 調査した内容

main限定・Production承認付きの読み取り専用監査（GitHub Actions run `41646822050`）で、次を確認した。DB変更は0件だった。

- `manaberu-style` は公開・登録方式 `PUBLIC`、メール登録有効、LINE登録無効。
- AI Training Programは2件。Personal Learningは `SUSPENDED`、AI研修30日は `ACTIVE`。
- 両Programの有効Offeringは無料だが、参加条件は `INVITATION_ONLY`。
- 有効な一般参加者は2名。一般参加者に紐づく有効Enrollmentは0件で、2名とも研修未登録。
- 既存の内部テストはEnrollment 1件、INTERNAL seat 1件、本人同意1件。内部枠上限は1名。
- ProductionのAI Provider設定は停止されておらず、日次・月次の予算上限と検証済み資格情報を保持している。

コードでは、公開サービス登録がWorkspace/Group所属・法的同意・登録完了イベント等を作成した後、ProgramEnrollmentや研修枠を作らず終了していた。招待受諾だけが、`manaberu-style`の停止中・最大3名の内部テスト専用処理へ接続されていた。

## 2. 変更したファイル

- `packages/database/src/service-registration-training-admission.ts`
- `packages/database/src/service-participation-registration-repository.ts`
- `packages/database/test/service-registration-training-admission.test.ts`
- `packages/database/test/service-participation-module-boundary.test.ts`

## 3. 主要な設計判断

- `ServiceRegistrationPolicy.onboardingConfig.trainingAutoAdmission` に、版・有効状態・対象Program ID・対象Offering IDを明示する。設定がないサービスには作用しない。
- 公開登録と同じSerializable transactionでEnrollmentとINTERNAL seatを準備する。Program行をロックし、定員確認・seat作成・allowlist更新を直列化する。
- Workspace、Group、Membership、Program、Offeringをすべて同一scopeで照合する。他サービスのProgram/Offering IDは利用できない。
- Programは有効な `AI_TRAINING_V1` Personal Learning、Offeringは有効・無料・GUIDED、Pilot実行設定は実行可能な整合状態であることを必須にする。
- 既存Enrollment/seatが完全一致する場合は冪等に成功する。不一致、失効済みseat、定員超過、projection不整合はfail-closedとし、サービス登録を含むtransaction全体をロールバックする。
- `AiTrainingUsageConsent` は作成しない。本人が既存の同意画面で明示同意するまでProvider呼び出しを許可しない。
- 既存のProvider予算・call admission・原価記録は変更しない。自動参加準備によってAI呼び出しや費用は発生しない。

設定形式:

```json
{
  "trainingAutoAdmission": {
    "version": "SERVICE_TRAINING_AUTO_ADMISSION_V1",
    "enabled": true,
    "serviceProgramId": "<same-service program UUID>",
    "programOfferingId": "<same-program offering UUID>"
  }
}
```

## 4. 実行した検証

- database TypeScript typecheck
- 変更ファイルのESLint
- 対象Vitest 9件
- 設定なし、厳格な設定形式、Enrollment/INTERNAL seat作成、allowlist revision、再実行の冪等性、定員超過、AI同意を自動作成しない境界を確認

## 5. 未解決事項

- 本番のAI研修30日Programは、現在の読み取り結果ではPersonal Learning Pilot設定・参加枠設定が準備済みと確認できない。
- 本番Offeringは招待限定のままであり、公開登録から利用する対象Program/Offeringの運用決定が必要。
- 本番の`trainingAutoAdmission`設定は未変更。既存2名のEnrollment/seat backfillも未実施。
- migration、Production設定、機能flag、デプロイはこの実装に含めない。

## 6. 次へ進める条件

1. この実装PRをレビュー・マージする。
2. 対象をAI研修30日専用Program/Offeringとすること、定員、Pilot実行設定、通知停止、費用上限を具体的にレビューする。
3. 別PRで冪等なProduction設定変更と、既存2名を含めるかどうかを提示する。
4. 設定反映後、テスト利用者で「公開登録 → Enrollment/seat → 本人AI同意 → 研修開始」を確認する。
