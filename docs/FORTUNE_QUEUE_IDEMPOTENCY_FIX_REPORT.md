# 占いJob同時投入の冪等性修正

日付: 2026-09-29

## 1. 調査した内容

- 研修PR #1004のmain統合後CI run `36534259310`で、占いJobの同時投入テストがP2002（environment/idempotency_key重複）により失敗した。
- #1007で導入した空updateのPrisma upsertは、同時実行時に読み取り後のinsertが競合する。研修の期限終了処理ではなく、mainにある占いQueueの問題。

## 2. 変更したファイル

- `packages/database/src/fortune-generation-jobs.ts`: DB側で重複を無視して挿入し、確定したJobを再取得する。
- `packages/database/test/fortune-generation-jobs.test.ts`: 挿入順序、重複時の再取得、本人不一致拒否、終了済みJobの再開拒否を検証。
- `packages/database/test/database.integration.test.ts`: 同時投入を2件から8件へ増やし、全件の正常終了とJobが1件のみであることを確認。
- `docs/DECISION_LOG.md`: D-145に原子的な重複防止の判断を追記。
- 本報告書。

## 3. 主要な設計判断

- `createMany(skipDuplicates: true)`と`findUniqueOrThrow`を既存Transaction内で実行する。失敗したTransaction内でP2002を握りつぶす方式は使わない。
- 重複時もWorkspace、Bunshin、本人、用途を照合する。既存Jobの状態・試行回数は更新せず、Readingの比較更新とlease検証を維持する。
- 占いのみを修正し、研修・他サービス・共通JobRepositoryへ変更を広げない。schema変更はないためmigrationは不要。

## 4. 実行した検証

- ローカルの占いQueue/復旧unit test 25件、Database型確認、変更ファイルlint、format、architecture check、`git diff --check`が成功した。
- 実DBの競合検証と全体lint/typecheck/test/buildはPRの隔離PostgreSQL CIで確認する。結果はPR本文へ記載する。

## 5. 未解決事項

- 本番設定、実AI呼出、LINE送信、過去Jobの再投入は行っていない。
- 研修PR #1004の競合は解消済みだが、この修正がmainへ入るまではCI成功と扱わない。

## 6. 次へ進める条件

- 本修正のCIとレビュー後、先にmainへマージする。
- 続いて研修PR #1004へ最新mainを統合し、期限終了テストを含むCIを再確認する。
