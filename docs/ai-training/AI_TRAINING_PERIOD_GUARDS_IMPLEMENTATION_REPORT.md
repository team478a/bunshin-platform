# AI研修 受講期間ガード 実装報告

## 調査

main `10e1ff0b`（#1000）を基準とした。LINE配信は終了予定日前に限定される一方、Runtime・初期設定・回答・学習操作・評価はACTIVEだけで期間を確認していなかった。有料受講の期限状態更新は別に存在するが、未更新のACTIVE受講に対するWeb/APIの制限にはならない。

## 変更したファイル

- database/training-enrollment-periodと公開入口: Prisma期間条件の共通化。
- database/training-runtime-{shared,state-repository,candidate-repository}: ACTIVEの期間を制限。Decision保存は既存のロック後Scope解決で現在時刻を再確認する。
- database/training-{profile,answer,barrier,interaction,work-result}: ロック後に期間確認。回答は事前確認に加えてロック後も再確認する。
- web/http/{ai-training-evaluation,program-goals}、services/ai-training-evaluation-queue、jobs/training-answer-evaluation-job-handler: 評価要求/再試行、Queue登録、Provider呼出直前、評価保存時の期間確認。共通目標・設定APIではAI研修だけへ適用する。
- programs/[programEnrollmentId]/page: 未更新ACTIVEでも期限後は終了案内、開始前は開始前案内。Runtimeを呼ばず、期限後のToolkit/Exportは既存権限のまま残す。
- Unit/UI/実DBテスト、D-139、本報告、ロードマップ。

## 設計判断

受講開始日時以下かつ終了日時未満を利用期間とする。開始日時なし/未来は学習不可、終了日時なしは上限なし。期間条件とWorkspace/Service/本人所属・ACTIVE/AI研修Moduleの条件を合成する。書込は過去のoccurredAtや候補選択時刻ではなく、受講ロック後の現在時刻で確認する。

評価はProvider呼出直前にも再確認する。呼出後に期限を越えた場合は非再試行のScopeエラーとし、回答READY・点数・進捗を保存しない。実際に行ったProvider処理の使用量記録は残し、Provider未実行の期間拒否をProvider障害と記録しない。外部へ既に送った処理の撤回は保証しない。

受講期間に基づく表示はDBのEXPIREDへの遷移、保持期限起算日の記録、課金停止・返金を行わない。既存の終了日不明判定は変更せず、表示を削除実行の根拠にしない。既存の冪等再送結果は新しい学習処理を発生させない。

## 検証

- DB Unit: 共通条件、4種の学習書込のロック順序/サーバー時刻、提出時の期限競合、Runtime Scope、既存の所有/Module/削除世代境界。
- Web: 期限ちょうど、開始前、ACTIVE/終了/取消の表示、Toolkit/Export維持、Queue/再試行の拒否、Provider未実行、期限をまたいだ評価保存拒否、既存HTTP/404境界。
- 実DB: 開始日時と一致/開始前、終了1ms前/終了日時と一致、終了日時なし/開始日時なし、他Workspace拒否、状態と保持期限起算日を変更しないことを追加。
- 全体format/typecheck/lint/test/build、Migration/実DB統合はPRのCI結果で確定する。

## 未解決事項

Schema/Migration変更なし。自動EXPIRED状態更新、管理一覧の期限表示統合、期限通知、過去終了日の確定、契約延長は別タスク。本番保持期限実行APIの停止を維持する。外部API実呼出、LINE送信、設定変更、本番データ操作はしていない。

## 次へ進める条件

全体CI/実DB統合成功と人間レビュー後にマージする。本番反映はproduction SHAと実環境の期間境界確認が必要。自動終了や保持期限処理を有効化する場合は、別途対象・起算日・停止/復旧方法を確認する。
