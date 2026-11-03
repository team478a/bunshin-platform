# SNS公式API共通基盤 Phase 1-B PR-1B1 実装報告

日付: 2026-11-03
対象: Instagram OAuth接続 Core・DB

## 1. 調査した内容

- Phase 1-A PR #1465の承認契約・Provider境界とGitHub Actions結果
- 既存の会員利用認可、Service単位のSOCIAL機能権限、Bunshin Capability、AES-256-GCM暗号化基盤
- `SocialProfile`（発信設定）と`ExternalReadGrant`（外部AI読取許可）の責務
- Meta公式Instagram Loginのscope、短期token交換、長期token更新仕様
- 複数Bunshin利用時の資格情報重複、Grant単位の解除、再接続・重複実行

## 2. 変更したファイル

- Prisma schemaと`20261103030000_social_account_connections` migration
- `packages/database/src/social-account-connections.ts`とdatabase package公開入口
- `apps/web/src/providers/social-account-token.ts`
- 暗号化unit test、PostgreSQL統合test、統合test登録
- 本ADRと実装報告

共有ファイルの変更: `packages/database/prisma/schema.prisma`、`packages/database/src/index.ts`、`packages/database/src/schema-readiness.ts`、`packages/database/test/database.integration.test.ts`。

## 3. 主要な設計判断

資格情報をBunshin行へ直接持たせず、Service会員所有の`SocialAccountConnection`とBunshin利用許可の`SocialAccountConnectionGrant`へ分離した。保存・利用・解除の全経路で既存の会員認可、SOCIAL機能権限、Bunshin Capabilityを再検証する。詳細は[ADR](adr/INSTAGRAM_CONNECTION_CORE_ADR.md)を参照。

## 4. 実行した検証

- Prisma schema validateと空のPostgreSQL 16への全migration適用
- 暗号文改ざん、AAD scope差替え、平文非露出のunit test
- 同一資格情報の複数Bunshin Grant、重複・並行再接続、Grant単位解除、最後の解除時token消去
- 別User / Service / Bunshin、Membership停止、SOCIAL権限失効、Capability停止、期限切れ、解除後の利用拒否
- RLS有効化と広いpolicyがないこと
- repository標準のformat / typecheck / lint / unit test / DB integration test / build

## 5. 未解決事項

- 公式OAuthの認可URL、code交換、長期token交換・更新、Provider error分類はPR-1B2。
- 接続・状態表示・解除・再接続のHTTP/UIはPR-1B3。
- 実投稿、予約Job、Muse経由投稿、本番migration・本番設定は対象外。

## 6. 次Phaseへ進める条件

PR-1B1の人間レビューとmigrationレビュー、積み重ね元PR #1465の取り込み方針確定後にPR-1B2へ進む。本番反映はデプロイ専用作業で行う。
