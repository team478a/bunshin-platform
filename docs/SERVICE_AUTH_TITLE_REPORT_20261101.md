# サービス認証画面のタイトル修正

## 調査と設計

2026年11月1日の本番確認では、ハッシーのログイン見出しがワタシワークスだった。一方、最新mainの46e3a675にはサービス別見出し・ロゴと、サービスへの認証戻り先を保持する実装がすでに含まれている。旧作業フォルダの実装を上書きせず、最新mainから独立worktreeとブランチを作成した。

本変更では、既存の公開サービス解決処理・許可済み戻り先・承認済みブランドfallbackを再利用して、ログイン、メール確認、初期設定のブラウザタイトルをサービス名に合わせる。認証フロー、会員境界、DB、メール本文、デプロイ設定は変更しない。共有ファイルの変更はない。

## 変更ファイル

- `apps/web/src/services/service-auth-metadata.ts`
- `apps/web/app/login/page.tsx`
- `apps/web/app/login/confirm/page.tsx`
- `apps/web/app/s/[serviceSlug]/onboarding/page.tsx`
- `apps/web/test/service-auth-metadata.test.ts`

## 検証と公開条件

対象ファイルの整形と差分空白検査を実施した。追加テストはサービス名の分離、外部戻り先の拒否、既存fallbackの再利用、運用障害の伝播を確認する。

Node 24.19.0でservice-auth-metadata、brand-mark、line-login-routeの3ファイル28テストが成功した。旧作業フォルダで実行した検証とは別に、この独立worktreeの最新コードで実施した。

本番への反映は別状態として扱う。CIの成功とレビュー後に、mainとProductionの差分・migration適用状態を確認してデプロイし、ハッシーとマナベルのログイン見出しとタイトルを実画面で再確認する。動画はその後に再撮影する。
