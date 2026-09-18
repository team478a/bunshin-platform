# AI物販V1 Runtime Orchestration 実装報告

## 調査した内容

既存の公開サービス登録、Program Enrollment、Program Runtime、共通Cron、AI物販Policyと商品状態を確認した。公開登録は`PrismaServiceParticipationRepository`のSerializable transactionでMembership、法務同意、登録Eventを保存している。定期処理は`/api/internal/jobs/schedule`が正本である。

## 変更したファイル

- `packages/capability-resale/src/runtime.ts`
- `packages/database/src/resale-runtime.ts`
- `apps/web/src/http/mission-scheduler.ts`
- 公開登録接続、package依存、unit test、境界test、Decision Log

## 主要な設計判断

公開登録時刻とOffering利用開始時刻の遅い方を無料7日体験の開始時刻とした。これにより、既存会員をProgram開始前の日数で消化済みにしない。Program名ではなく`ServiceProgram.settings.moduleKey`でAI物販を識別し、Program側でPolicy、timezone、休眠日数、WAIT時間、route、phase、支援方法、自動登録可否を保持する。

Action評価時はAssignmentとProgress Snapshotを同一Serializable transactionで保存する。DAY7は7暦日経過後、未実行でも必ず判定し、分類Event、完了Snapshot、無料Enrollment完了を同時に保存する。正式なWAITの終了時刻を活動基準に含め、WAIT中の時間をPAUSED判定へ加算しない。

## 実行した検証

- repository全体のlint: 23 tasks passed
- repository全体のtypecheck: 23 tasks passed
- repository全体のtest: 23 tasks passed
  - capability-resale: 23 tests passed
  - database: 318 tests passed
  - web: 1,139 tests passed
- repository全体のproduction build: 12 tasks passed

## 未解決事項

利用者向け現在Action API/UI、Action結果入力、ResaleItem更新との再評価接続、LINE通知、DAY7 Offer表示は未実装である。料金と決済はこのRuntimeへ埋め込んでいない。

## 次へ進める条件

本変更のCIが成功し、公開登録と既存会員補完が同じProgram設定を参照することをレビューした後、スマートフォン向けAction API/UIへ進む。
