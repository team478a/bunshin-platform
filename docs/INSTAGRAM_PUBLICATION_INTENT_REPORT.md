# SNS公式API共通基盤 Phase 1-C 実装報告

日付: 2026-11-04
対象: 投稿Intentの保存・本人承認・公開Job

## 1. 調査した内容

- 既存DailyMission、MissionContentVariant、選択履歴、SocialImageGeneratedMedia、Job、PostRecordの責務と一意制約
- PR-1B1のService会員所有資格情報とBunshin Grant、PR-1B2/1B3のInstagram Login接続経路
- Phase 1-AのInstagram画像Container作成、状態照会、公開Transportと`UNKNOWN_RESULT`分類
- Meta公式の単一画像Container、Container状態、`media_publish`の公開手順

参照したMeta公式資料:

- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started

## 2. 変更したファイル

- Prisma schemaと`20261104020000_social_publication_intents` migration
- `packages/database/src/social-publication-intents.ts`
- `packages/application/src/social-publication-job.ts`
- `apps/web/src/jobs/social-publication-job-handler.ts`
- `apps/web/src/http/social-publications.ts`とService API routes
- Job worker登録、PostSource、server環境設定、各単体・DB統合テスト
- `.env.example`、本ADR、本実装報告

## 3. 主要な設計判断

既存データを複製せず、Intentには承認Snapshotと状態遷移だけを保存する。承認と実行の双方で現在権限を照合し、`media_publish`直前に`UNKNOWN`を永続化してからProviderを呼ぶ。詳細は[ADR](adr/INSTAGRAM_PUBLICATION_INTENT_ADR.md)を参照。

## 4. 実行した検証

- Prisma validate、空DBへの全migration適用
- 本人・Workspace・Service・Bunshin・SOCIAL権限、接続Grant、期限、選択Variant、画像所有権・ハッシュの再照合
- 承認とJob enqueueの同一transaction、冪等な重複承認
- `UNKNOWN`のterminal扱い、外部状態照会のみ許可、自動再送禁止
- 公開成功時だけ`OFFICIAL_API` PostRecord作成
- TokenをIntent、Job payload、API responseへ含めないこと
- repository標準のformat / typecheck / lint / unit test / DB integration / build

## 5. 未解決事項

- 実Metaテストアカウントでの公開Smokeは、デプロイ環境のMeta App、暗号鍵、Supabase画像URL、allowlist設定後に行う。本PRではProviderをmockした自動検証と、実行をテストアカウントへ限定するfail-closed境界までを対象とする。
- `UNKNOWN`から外部投稿IDを自動確定する検索、カルーセル、Reels、実績同期はPhase 1-D。

## 6. 次Phaseへ進める条件

Phase 1-C PRの人間レビューとCI成功後、ステージングの専用テストアカウントで1画像・1承認・1投稿のSmokeを実施する。実績同期や媒体追加はその結果を確認してからPhase 1-Dで扱う。
