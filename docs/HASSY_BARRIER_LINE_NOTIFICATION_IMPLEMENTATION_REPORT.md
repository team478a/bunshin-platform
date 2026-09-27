# SNS継続支援 LINE確認通知 実装レポート

## 1. 調査した内容

- SNS行動停止要因の定期判定、本人確認、無償支援の既存フローを確認した。
- `SocialActivityBarrierCase` の `SUSPECTED` はWeb画面で確認できるが、LINEから気づく導線がないことを確認した。
- 既存のService別LINE Broadcast、配信対象再検証、Deep Link、ジョブの冪等性を再利用できることを確認した。

## 2. 変更したファイル

- `packages/capability-social/src/activity-barrier-support.ts`
  - 本人確認用のLINE文面を追加。
- `apps/web/src/services/social-activity-barrier-line-scheduler.ts`
  - 本人確認待ちケースのみをまとめ、既存BroadcastとLINE Delivery Jobへ接続。
- `apps/web/src/jobs/service-line-broadcast-eligibility.ts`
  - 配信時点でケースが引き続き `SUSPECTED` かを再検証。
- `apps/web/src/http/mission-scheduler.ts`
  - 行動停止要因の投影完了後にLINE通知を予約。
- 関連テストを追加・更新。

## 3. 主要な設計判断

- LINEは通知と入口に限定し、回答は既存Web画面で行う。
- 本人回答前の推定CategoryはLINE文面に出さない。
- Workspace、Service Group、Membership、User、Bunshinの一致を必須とする。
- 通知予約前と実配信時の2段階で、LINE連携、同意、Case状態を検証する。
- 同じ確認回は、Case IDと再発回数から決定的なキーを作り、重複通知しない。再発した新しい確認回は別通知とする。
- 既存のFeature `SOCIAL.ACTIVITY_SUPPORT` が有効なServiceのみでCaseが生成されるため、Service名やslugはハードコードしない。

## 4. 実行した検証

- `@bunshin/capability-social` typecheck
- `web` typecheck
- `@bunshin/capability-social` test: 20 files / 139 tests
- SNS行動停止要因SchedulerとLINE Schedulerのテスト
- Broadcast配信時再検証のテスト
- `@bunshin/capability-social` lint
- `web` lint
- format check

## 5. 未解決事項

- 本番LINEへの実送信は実施していない。
- LINE内での回答完結は対象外で、Webの本人確認画面へ運ぶ。

## 6. 次Phaseへ進める条件

- CIがすべて成功すること。
- 検証用Serviceで、未回答の確認通知が一度だけ届くこと。
- 回答後の再実行で、配信対象から外れること。
