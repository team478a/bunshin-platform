# SNS公式API共通基盤 Phase 1-B PR-1B2 実装報告

日付: 2026-11-04
対象: Instagram Login公式OAuth Adapter

## 1. 調査した内容

- PR-1B1のSNS資格情報所有権、Bunshin Grant、暗号化保存境界
- Phase 1-AのInstagram公式投稿TransportとProvider分離方針
- Meta公式の認可URL、code交換、長期token交換、長期token更新、`/me` account確認仕様
- 初期scope `instagram_business_basic`と`instagram_business_content_publish`

## 2. 変更したファイル

- `apps/web/src/providers/instagram-login.ts`
- `apps/web/test/instagram-login.test.ts`
- `packages/config/src/index.ts`
- `packages/config/test/environment.test.ts`
- `.env.example`
- 本ADRと実装報告

DB schemaとmigrationの変更はない。

## 3. 主要な設計判断

OAuth Provider通信をWeb Adapterへ隔離し、認可URL生成、codeから短期tokenへの交換、長期tokenへの交換、professional account確認、長期token更新を実装した。state transaction、会員認可、暗号化保存、HTTP callback、UIはPR-1B3へ残し、Adapter単体では接続を成立させない。詳細は[ADR](adr/INSTAGRAM_LOGIN_ADAPTER_ADR.md)を参照。

## 4. 実行した検証

- 固定Meta origin、redirect URI、必須scope、stateの検証
- 短期・長期token交換とprofile account一致
- 長期token更新grantと有効期限計算
- scope不足、account不一致、不正応答、通信失敗、HTTP status分類
- single-use codeの非再試行、Provider error本文・secret・token非露出
- 環境変数4件一組、production HTTPS境界
- repository標準のformat / typecheck / lint / unit test / build

## 5. 未解決事項

- OAuth stateの短時間・single-use永続化、callback、会員認可、PR-1B1保存経路への接続はPR-1B3。
- 接続状態、解除、再接続の画面はPR-1B3。
- 自動token更新Job、実投稿、予約Job、Muse経由投稿、本番Meta App設定・審査は対象外。

## 6. 次Phaseへ進める条件

PR-1B2の人間レビュー、環境変数名・redirect URI・Meta App設定方針の確認後にPR-1B3へ進む。本番secret設定とredirect URI登録はデプロイ専用作業で行う。
