# Phase 6-G2a LINE理由付き限定再送 実装報告

## 完了範囲

- SUPER_ADMIN / OPERATORが、現在の実行環境に属する再試行可能なFAILED配信だけを理由付きで再Job化できる。
- 管理画面は再送可能な失敗を最大20件表示し、理由3〜500文字を必須にする。
- 管理APIはsame-origin、verified session、Platform Admin権限、runtime environmentを検証する。
- `LineDeliveryRetryRequest`へ環境、対象Delivery、失敗時attempt count、操作者、理由、生成Job、日時を保存する。
- `deliveryId + deliveryAttemptCount`のDB一意制約により、同じ失敗回への二重クリックと並行再送を防止する。
- 再送Jobは元の受信Userを`requestedBy`として維持し、既存のWorkspace / Bunshin / User / Mission所有権再検証を通す。

## 再送可能分類

- `CONFIGURATION_UNAVAILABLE`
- `RATE_LIMITED`
- `TIMEOUT`
- `PROVIDER_UNAVAILABLE`

停止、quota停止、認証情報不正、受信者不在、blocked、invalid recipientは対象外とする。原因を解消せず管理操作だけで回避しない。

## 非露出情報

管理API / UIへUser ID、Workspace ID、Bunshin ID、Mission ID、LINE user ID、Secret、Access Token、Provider response、監査理由を返さない。画面へ出す識別子は再送操作に必要なopaqueなDelivery IDだけとする。

## 検証結果

- Prisma Schema validation: 成功
- 新規DBへの全Migration適用: 成功（25件）
- Database Integration: 20件成功
- Unit / HTTP tests: 全266件成功
- TypeScript typecheck: 成功
- ESLint: 成功
- Production build: 成功
- `git diff --check`: 成功

Windows checkoutでは改行差によりリポジトリ全体の`prettier --check .`が未変更ファイルも検出するため、本変更ファイルを明示したPrettier checkを完了条件に用いる。CIのLinux checkoutでは通常の全体checkを実行する。

## 対象外

- LINE Loginと未ログイン復帰
- Production実送信
- 外部管理者警告
- LINE Funnel
- Production Smoke / Go-No-Go
