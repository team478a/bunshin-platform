# HASSY SNS継続支援 定期判定接続 実装報告

## 1. 調査した内容

- 既存Mission Scheduler、Barrier Rule、観測Repository、Case永続化、本人確認UIを確認した。
- 定期Projectionだけが未接続であり、手動でCaseを作らない限り本人確認が表示されない状態を確認した。

## 2. 変更したファイル

- `packages/capability-social/src/activity-barrier-projection.ts`
- `packages/database/src/social-activity-barrier-repository.ts`
- `apps/web/src/http/mission-scheduler.ts`
- Feature Definition migration、関連テスト、Decision Log

## 3. 主要な設計判断

- `SOCIAL.ACTIVITY_SUPPORT`を明示的に有効化したServiceだけを対象にする。
- 毎日03:10 JSTに、当日途中の行動を含めない直近28日を評価する。
- 全Bunshinを個別評価し、行動推定は`SUSPECTED`までに限定する。
- 個別失敗を分離し、既存のCase・Evidence冪等性を維持する。

## 4. 実行した検証

- Capability Social、Database、Webのtypecheck / lint / test。
- Feature境界、Service / Membership / User / Bunshin境界、複数Bunshin、日次時刻、障害分離、Scheduler接続を検証する。

## 5. 未解決事項

- 対象ServiceでFeatureを有効化する運用操作。
- 実Productionデータでの初回Projectionと本人画面表示の確認。
- 確認質問をLINEで通知する機能は今回含めない。

## 6. 次Phaseへ進める条件

- MigrationとCIが成功すること。
- 対象Serviceと段階導入人数を決定し、Featureを監査付きで有効化すること。
