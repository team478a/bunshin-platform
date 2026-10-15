# Personal Learning 費用Hard Stop production限定release

## 1. 調査した内容

production基準は`4b34e1fe6683ddfd935a7bff96052564e96dae1c`、main上の採用元は`c865f4e78c436564c2e95817c5f3e15a12948974`である。main全体はproductionとの差分が大きいためmergeせず、PR #1216の費用Hard Stop実装コミット1件だけをproduction基点へcherry-pickした。

productionには前提となるPersonal Learning AI原価可視化の限定release PR #1215が反映済みである。今回の17ファイル差分は自動適用され、追記型`docs/DECISION_LOG.md`だけ競合した。production固有のcredential rotation決定を保持し、費用Hard Stop決定だけを追加した。main側の無関係なMigration hardening記録は取り込んでいない。

## 2. 変更したファイル

- Application: Admission設定、保守的費用予約、単体テスト
- Database: 日次予約集計、価格版保存、additive Migration、統合テスト
- Web: Pricing Registry接続、Provider識別、Pilot START整合確認、回帰テスト
- production固有の最新Migration固定テスト
- Runbook、Decision Log、実装報告、本release報告

main上の他機能、OEM変更、AI Evolution、他Migrationは取り込んでいない。

## 3. 主要な設計判断

`PERSONAL_LEARNING_CALL_ADMISSION`へ`dailyCostLimitUsdMicros`を必須追加する。Provider/Model完全一致の有効価格から、最大request bytesと最大output tokensによる費用をProvider送信前に予約する。同一ProgramのDB lock内でUTC日次予約額を合計し、予算超過、価格不明、旧NULL行をfail-closedにする。

既存Admission行は推測backfillしない。Migrationはnullable列2個と整合CHECKだけを追加する。失敗、retry、送信前停止でも予約を返金しない。Provider側請求額、税、為替、他機能の利用、Provider account全体のbudgetは別Gateとする。

## 4. 実行した検証

- 対象単体: Application 1 file / 14 tests、Web 3 files / 34 tests成功。
- Prisma schema validate成功。初回はローカル`DIRECT_URL`未設定で接続前に停止し、外部接続しない構文検証用URLを明示して再実行した。
- 使い捨てPostgreSQL 16: production系統の全232 Migrationを適用し、DB名・port・markerの安全preflight後、統合172件成功。確認後にコンテナを削除した。
- 全体typecheck: 25/25 tasksと学習UI成功。ブランチ切替前のmain由来`.next/types`がproductionにない3 routeを参照した初回失敗は、productionの`next typegen`で再生成後に解消した。
- 全体lint: architecture、25/25 tasks、学習UI成功。既存の未使用eslint-disable warning 1件、error 0。
- 全体test: 修正後25/25 tasks成功。Database 872件、Web 3,116件成功、Provider live test 2件は既定どおりskip。初回高並列実行の既存Daily Mission 2件timeoutは単独10件成功し、最終全体実行でも成功した。
- スマートフォン幅の合成E2E: 3 files / 13 tests成功。
- Web build: 13/13 tasks成功。formatと`git diff --check`は最終headで確認する。
- GitHub CIはPR作成後の最終headを正本とし、未完了をPASSにしない。

## 5. 未解決事項

- 本番の実価格、価格版、日次予算、Provider側budget、既存Admission行は未確認・未設定。
- 本番Migration、Deploy、環境設定変更、参加者登録、Pilot開始、Provider実送信、実課金は未実施。
- 旧コードは費用予約を行わないため、Pilot有効状態で新旧instanceを混在させない。
- release PRのmergeはGit連携Deployを開始し得るため、PR作成承認をmerge承認とみなさない。

## 6. 次Phaseへ進める条件

release PRの差分レビューとCI成功後、productionへのマージを人間が明示承認すること。マージ後のDeploy状態確認、本番Migration確認、価格・日次予算の設定、Pilot開始はそれぞれ別の明示承認を必要とする。
