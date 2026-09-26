# Service LINE Broadcast Worker V1 Report

## 1. 調査した内容

- OEMサービスのLINE一斉配信workerについて、Job取得、配信対象再検証、LINE送信、宛先状態更新、配信完了、再試行の経路を確認した。
- LINE APIの429、タイムアウト、5xxが発生した場合も宛先を即時`FAILED`へ確定し、Job再試行の対象から外していたことを確認した。
- Jobの最終試行が失敗した場合、配信と宛先が`SCHEDULED` / `PENDING`のまま残り得ることを確認した。
- 配信のDB確定後にJob投入が失敗した場合、その配信を定期的に回収する共通経路がないことを確認した。
- worker完了と管理者取消が競合すると、取消済み配信を`COMPLETED`で上書きし得ることを確認した。

## 2. 変更したファイル

- `apps/web/src/jobs/service-line-broadcast-job-handler.ts`
  - workerを調整処理へ縮小し、対象判定、送信、完了処理へ委譲。
- `apps/web/src/jobs/service-line-broadcast-eligibility.ts`
  - Membership、通知同意、Program Assignment、Offering、LINE接続の配信直前再検証を分離。
- `apps/web/src/jobs/service-line-broadcast-recipient-delivery.ts`
  - 宛先単位のLINE送信と、再試行可否による状態遷移を分離。
- `apps/web/src/jobs/service-line-broadcast-completion.ts`
  - 無効配信、通常完了、再試行上限到達時の確定処理を分離。
- `apps/web/src/jobs/service-line-broadcast-delivery-types.ts`
  - worker内部の受け渡し型を追加。
- `apps/web/src/line/messaging-provider.ts`
  - Text PushにLINE Retry Keyと409受理済み判定を追加。
- `packages/application/src/service-line-broadcast-recovery.ts`
  - Jobのない予約済み配信を再投入するApplication Serviceを追加。
- `packages/database/src/service-line-broadcast-recovery-repository.ts`
  - Active Workspaceに限定し、実行中Jobと実施済みRecoveryを除外する候補検索を追加。
- `apps/web/src/http/mission-scheduler.ts`
  - 定期スケジューラへ配信Job回復処理を接続。
- 各層に再試行、Recovery、競合防止のテストを追加・更新。

## 3. 主要な設計判断

- 429、タイムアウト、5xx等の再試行可能な失敗は宛先を`PENDING`に保ち、Jobの指数バックオフへ接続する。
- 認証不正・無効宛先等の再試行不能な失敗だけを即時`FAILED`にする。
- 宛先IDをLINE Retry Keyとして固定し、タイムアウト後の再試行で同一メッセージが二重送信される危険を下げる。
- 最終試行では残った`PENDING`を監査付きで`FAILED`に確定し、配信を停止状態のまま残さない。
- 完了更新は`SCHEDULED`の配信だけを対象とし、同時に行われた取消を上書きしない。
- Recovery候補はWorkspace、Environment、Broadcast IDで分離し、同じ配信へのRecoveryは一度だけ投入する。
- Program、Fortune、通常OEM配信の配信直前チェックは同じEligibility境界で維持する。

## 4. 実行した検証

- Application: 117 test files / 525 tests 成功。Recovery Job入力、冪等キー、候補ごとの失敗分離を確認。
- Database: 145 test files / 460 tests 成功。Active Workspace制約、Environment制約、実行中Jobと実施済みRecoveryの除外を確認。
- Web: 335 test files / 1,427 tests 成功。LINE Retry Key、409受理済み、再試行可能失敗の`PENDING`維持、再試行不能失敗の`FAILED`確定、取消競合を確認。
- AI研修、AI物販、Fortune、週次レポートの既存配信直前検証を確認。
- リポジトリ全体のlint、typecheck、build、直列実行のtestが成功。
- 通常の並列testでは、ファイル走査を伴う既存テスト4件が実行資源の競合でタイムアウトした。該当テストの単独再実行と、全テストの直列再実行はいずれも成功した。

## 5. 未解決事項

- LINE本番Providerを使った429・タイムアウト・409の実受信試験は実施していない。
- Recoveryは定期スケジューラの次回実行時に動作するため、Job投入失敗から回収までスケジューラ間隔分の遅延がある。
- 配信件数の増加に応じたworkerの並列数、LINE APIレート制限、1回500件の処理時間は実運用負荷で確認が必要。

## 6. 次Phaseへ進める条件

- CIのdatabase・verifyが成功すること。
- ステージングで、正常送信、一時障害、最終失敗、取消競合、Job投入漏れ回復を確認すること。
- 次は一斉配信の運用監視として、停滞配信、失敗率、Recovery件数を管理者が確認できる状態を検討する。
