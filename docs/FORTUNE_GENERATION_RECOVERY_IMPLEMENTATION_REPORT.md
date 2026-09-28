# 占い「生成中」自動復旧 実装報告

- 日付: 2026-09-28
- 対象: おすすめ順の第1項目、実行中断による占い生成の滞留
- Decision: D-129

## 1. 調査した内容

通常のProviderエラーでは標準文へ戻るが、実行プロセスが終了すると`GENERATING`が残り、同日の再アクセスでは既存結果を返すため生成を再開できない。AI生成前に承認された標準本文と行動を保存する既存設計、および最終更新日時による10分の運営監視を確認した。

## 2. 変更したファイル

- `packages/database/src/fortune-generation-recovery.ts`
- `packages/database/src/index.ts`
- `packages/database/test/fortune-generation-recovery.test.ts`
- `packages/database/test/database.integration.test.ts`
- `apps/web/src/http/fortune-generation-recovery.ts`
- `apps/web/app/api/internal/fortune/recover-generating/route.ts`
- `apps/web/test/fortune-generation-recovery.test.ts`
- `apps/web/vercel.json`
- `docs/DECISION_LOG.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- 本報告書

## 3. 主要な設計判断

- 更新後10分未満の処理、正常完了、削除済みを対象から除外し、5分ごとの認証済みProduction Cronで最大100件を処理する。
- 保存済みの標準本文・行動を保持したまま`READY_BASIC`へ戻す。空の標準結果は公開せず`FAILED`として明示する。
- 全所有境界・状態・更新日時・本文を再照合し、並行完了・削除・変更・重複Cronが同じ結果を上書きしない。
- カードと日付を変更せず、1日1回の制約を維持する。AI・LINE・決済を再実行しない。
- 既存のstatus、failureCode、updatedAtを使い、Schema変更・Migrationは不要。監視ログは集計値と安全なエラーコードのみとする。
- APIキー管理スキルの対象範囲を確認したが、今回の実装はProviderを呼ばないDBライフサイクル処理だけで、資格情報の取得・変更は行わない。

## 4. 実行した検証

新規Unit testは、対象条件、所有境界、標準文保持、不完全結果拒否、競合時の更新拒否、冪等性、DB失敗、Cron認証、非Production停止、例外本文非記録を確認する。

- Databaseの復旧・既存Isolation・期限削除テスト: 21件成功。
- Webの復旧・既存Lifecycle・占いHTTPテスト: 17件成功。
- 最初のWeb実行は未設定Cronの期待statusを500とした1件が失敗したが、既存の共通エラー契約（503）へ修正し、再実行は成功した。

実DB統合テストでは2つのWorkspace・Service・利用者の結果を作成し、並行復旧の一度だけの更新、正常結果・新しい生成・削除済みの保持、遅延完了の拒否を検証する。

最終的なformat / typecheck / lint / test / build / database結果はPR本文と対象HEADのCIを正とする。本番のCronは本検証で実行しない。

## 5. 未解決事項

- 本番反映後のCron実行と復旧件数の確認。
- 最大100件を超える滞留は次の実行へ持ち越す。実行時間は環境に依存し、復旧時刻は保証しない。
- 不完全な標準結果を`FAILED`にした場合のデータ補完は自動化しない。
- AI再生成の非同期化・再試行は別の作業単位。今回の自動復旧は安全な標準結果への復帰である。

## 6. 次へ進める条件

PRレビューとCI成功、マージ後の独立したProduction反映。その後、おすすめ順の第2項目「ハッシー追加質問の見送り・再表示制御」へ進む。AI研修の保持期間・削除・Exportは方針決定を伴うため別PRにする。
