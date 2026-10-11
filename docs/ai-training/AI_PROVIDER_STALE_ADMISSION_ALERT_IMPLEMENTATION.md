# AI Provider未精算費用予約 外部通知 実装報告

## 1. 調査した内容

共有AI Provider費用Admission、管理Alert Center、管理者メール設定、LINE運用通知、Vercel Cronを調査した。15分を超えるOPEN予約は管理画面に表示されるが、画面を開かない運用担当への通知は存在しなかった。既存の管理者メール設定は暗号化、環境分離、接続確認、active／pauseを備えているため、新しい通知先やsecretを追加せず再利用する。

## 2. 変更したファイル

- Application
  - 15分超かつ直近1時間に未通知のOPEN予約を監視する契約
  - Provider別件数、予約額、最古時刻だけの通知Projection
  - 同一予約集合・同一UTC時間の通知fingerprint
- Database
  - `ai_provider_call_admissions.last_alerted_at`
  - stale／cooldown検索用indexとmigration
  - 最大1,000件の通知対象取得、通知成功後の条件付き記録
- Web
  - Resendによる集計専用通知Adapter
  - Cron認証付き`/api/internal/ai-provider-cost/monitor`
  - 毎時30分のVercel Cron登録
- Tests
  - 通知成功後だけの記録、失敗時の再試行保持、設定なしfail-closed、時間単位の冪等性、Scope条件、本文のID非掲載

## 3. 主要な設計判断

予約は時間経過で解放・精算しない。`last_alerted_at`は通知cooldownにだけ使用し、費用Gate、`settled_at`、復旧可否を変更しない。

通知は15分超のOPEN予約を対象とし、同一行は成功通知から1時間後まで再通知しない。並行Cronは同じ予約集合とUTC時間から同じResend idempotency keyを作る。次のUTC時間には別fingerprintとし、未解決状態を再通知できる。

通知成功後だけDBへ記録する。送信失敗または記録失敗はHTTP失敗として残し、予約を通知済みと推定しない。記録失敗後の同一時間再送はProvider冪等キーで重複送信を抑止する。

通知にはProvider、件数、予約額、最古時刻だけを含める。operation key／digest、Admission ID、User、Workspace、Bunshin、Prompt、入力、出力は含めない。1回最大1,000件とし、超過を明示する。

Database管理のメール設定が存在する場合、pause／未検証／ERRORからlegacy環境変数へ戻さない。productionで通知設定が利用できない場合は、対象ゼロでもmonitorを正常扱いにしない。

## 4. 実行した検証

- Application通知契約: 1 file / 6 tests成功
- Database予約通知: `provider-configurations.test.ts` 7 tests成功
- Web Cron／Resend境界: 1 file / 5 tests成功
- Prisma schema validation、全migrationの空DB適用、database readiness gate成功
- 全体format、lint、typecheck、test、build成功
  - testはTurbo 25 task成功。Web 3,299 tests、Database 958 testsを含み、live 2 testsだけ既定skip
  - lintは既存`apps/web/app/consent/page.tsx`のunused disable warning 1件のみ
  - Next.js production buildで新しいCron routeを含む全route生成成功
- 空の使い捨てPostgreSQLへのintegrationは184 tests中178 tests成功。既存6 testsがローカルDockerの5秒timeout／Prisma schema engine起動境界で失敗した。今回追加したmigrationは適用済みで、schema readinessは成功したが、integration全体をPASSとは記録しない
- integration後は識別子を再確認して使い捨てcontainerを削除し、割当portにlistenerが残っていないことを確認

本番DB、実Resend、利用者データ、実課金は使用していない。

## 5. 未解決事項

- Provider請求書／請求APIとの確定額照合、税、為替は未実装。
- 利用実績がないOPEN予約の解放・精算は行わない。Provider終了証跡の取込が別途必要。
- 通知先・監視間隔・一次担当・エスカレーション時間は本番開始前の人間確認が必要。
- Resend側の配送完了は取得せず、API受付成功までを通知成功としている。
- 1,000件を超える未通知予約は次回以降に処理する。全件一括送信は行わない。

## 6. 次Phaseへ進める条件

PRレビューとCIを確認する。productionへは自動反映せず、production基点の限定releaseでmigration対象、active管理者メール設定、通知先、Cron、停止・rollbackを別確認する。ローカルintegrationの既存6件のtimeout／起動境界失敗は、CIのdatabase jobを独立した証跡として確認する。

本番Deploy、設定変更、実通知、Provider送信、参加者登録、Pilot開始、実課金はそれぞれ明示承認を待つ。請求照合または証跡のない予約復旧へ進む場合は、Provider別の正本データと権限を先に設計する。
