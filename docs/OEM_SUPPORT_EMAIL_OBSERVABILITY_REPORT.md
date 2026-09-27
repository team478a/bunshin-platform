# OEM支援候補メール 失敗確認・再送実装報告

## 1. 調査した内容

配送Workerは失敗分類、試行回数、次回実行時刻を保存するが、Service運営管理者が失敗を確認する画面と、設定修正後の手動再送予約はなかった。

## 2. 変更したファイル

- `apps/web/app/s/[serviceSlug]/manage/personalization/page.tsx`
- `apps/web/app/s/[serviceSlug]/manage/personalization/oem-support-email-actions.ts`
- `apps/web/test/social-activity-oem-support-admin.test.ts`

## 3. 主要な設計判断

- 同じWorkspace、Service、Service Configurationの`FAILED`配送だけを表示・操作する。
- 宛先メールアドレスや本文は一覧に表示しない。
- 再送は即時送信せず`PENDING`へ戻し、既存WorkerがProvider設定を再検証して送信する。
- 送信済み、停止、他Serviceの配送は再送できない。
- 再送予約の実行者と前後状態をService Configuration Auditに保存する。

## 4. 未解決事項

本番Providerを使った「失敗→設定修正→再送成功」の実運用確認。
