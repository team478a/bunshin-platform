# 共有AI Provider 次回原価予算Gate 実装報告

## 1. 調査した内容

main `d1e91667`（PR #1221）を基準に、共有Provider Runtimeの原価・予算判定を確認した。Runtimeは正の固定リクエスト原価を必須化した一方、日次・月次の使用済み額が予算以上の場合だけ停止していた。このため、残予算より固定リクエスト原価が大きい場合でも次の1回を許可し、既知の原価だけで予算超過が確定する経路が残っていた。

## 2. 変更したファイル

- `packages/application/src/ai-provider-configuration.ts`
- `packages/application/test/ai-provider-runtime-guard.test.ts`
- `docs/DECISION_LOG.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- 本報告

## 3. 主要な設計判断

Provider Runtime解決時に、日次・月次それぞれで`使用済み額 + 固定リクエスト原価`が予算を超える場合、Provider送信前に`CONFLICT`で停止する。合計が予算と完全一致する1回は許可し、その記録後は次回を停止する。

加算による安全な整数上限超過を避けるため、`使用済み額 > 予算 - 固定リクエスト原価`として比較する。固定原価が予算自体を超える場合は、使用済み0でも最初の1回を停止する。

schema、migration、価格値、予算値、Provider Adapter、本番設定は変更しない。判定と利用記録の間を原子的に予約する変更は含めない。

## 4. 実行した検証

- Provider Runtime関連テスト: 1 file / 11 tests成功
- Application全体テスト: 136 files / 905 tests成功
- Application型検査・lint成功
- リポジトリ全体の型検査・lint・build成功（Next.js compile、TypeScript、34 static pages生成を含む）
- 変更ファイルのPrettierと`git diff --check`成功

全体検証を最初に並列実行した際、3 processが同じPrisma Client生成先を競合し、型検査1回が生成途中の型を読んで失敗した。競合終了後に全体型検査を単独再実行し、25 tasksとLearning UI型検査が成功した。実装由来の型エラーとして扱わない。

## 5. 未解決事項

- 並行する複数Runtime解決は同じ残予算を同時に確認できるため、厳密な上限には送信前の原子的な費用予約が必要。
- 旧環境変数fallbackには共有Provider設定と同等の日次・月次Admissionがない。
- 管理画面の接続テスト費用、Provider側budget、請求照合、外部通知は別課題。

## 6. 次Phaseへ進める条件

PRレビューとCI成功後もproductionへ自動反映しない。共有Provider利用経路への影響を確認し、production release、設定変更、Provider送信、実課金、Pilot STARTはそれぞれ別承認とする。
