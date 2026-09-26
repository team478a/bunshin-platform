# Service LINE Broadcast Operations V1 Report

## 1. 調査した内容

- OEMサービスのLINE一斉配信について、一覧、CSV出力、取消、失敗宛先再送の実行経路を確認した。
- 各経路のService scope、管理権限、宛先状態、Job状態、監査ログの更新範囲を確認した。
- 再送では、失敗宛先の`FAILED -> PENDING`更新だけが先に確定し、その後の配信状態・監査ログ更新が失敗すると不整合が残り得ることを確認した。

## 2. 変更したファイル

- `packages/application/src/service-line-broadcast-operations.ts`
  - 一覧、CSV、取消、再送のApplication ServiceとRepository Portを追加。
- `packages/database/src/service-line-broadcast-operations-repository.ts`
  - Service scopeと管理権限を再検証するDatabase adapterを追加。
- `packages/database/src/service-line-broadcast-scope.ts`
  - 一斉配信で共通利用する管理権限判定を分離。
- `apps/web/src/http/service-line-broadcasts.ts`
  - 4経路の直接Prisma操作を除去し、新しいApplication/Repository境界へ接続。
- Application、Database、Webの各層へ境界テストを追加。

## 3. 主要な設計判断

- HTTP層でServiceを解決した後も、Repositoryで`workspaceId`、`groupId`、`actorUserId`、`serviceRole`を再検証する。
- 一覧とCSVはRepositoryから集計済み宛先数を返し、Web層へPrisma modelを漏らさない。
- 再送は配信の競合防止、失敗宛先の再設定、監査ログを同一トランザクションで処理する。
- 取消は配信、未送信宛先、配信Job、監査ログを同一トランザクションで処理する。
- CSVセルは引用符をescapeし、数式として評価される先頭文字を無害化する。
- Job投入は外部キューとの接続点であるためWeb composition rootに残し、DBの再送トランザクション成功後だけ実行する。

## 4. 実行した検証

- Application Serviceの上限、CSV、安全な失敗分類、時刻・理由の正規化。
- Database RepositoryのService分離、管理権限、宛先状態集計、再送競合、取消Job scope、監査ログ。
- Web HTTP境界が正しいService scopeを渡し、再送成功後だけJobを投入すること。
- 変更ファイルのformat確認。
- Application、Database、Web各packageのtypecheck、lint、test。
- ルートのtypecheck、lint、architecture、test、build。
- Windows上のルート全体format確認は、今回未変更の既存ファイルを含むCRLF差分で失敗した。今回の変更ファイルだけを対象にしたformat確認は成功している。

## 5. 未解決事項

- 実際の配信を行うworkerには大きな直接Prisma処理が残っている。
- Job投入が失敗した場合、予約済み配信を検出・回復する運用確認は次のworker分割で扱う。
- 本番LINE Providerへの実送信は行っていない。

## 6. 次Phaseへ進める条件

- CIのdatabase・verifyが成功すること。
- 次は配信workerを、claim、宛先送信、集計・完了処理へ分割し、Provider障害時の再試行と回復経路を確認する。
