# Phase 1-B PR-1B3 Instagram接続画面 実装報告

## 1. 調査した内容

- Phase 1-BのPR-1B1 Core/DBとPR-1B2 Instagram Login公式OAuth adapterを基点にした。
- 既存の会員認可、SOCIAL entitlement、Bunshin capability、AES-GCM保存経路、LINE OAuthのsingle-use transactionパターンを確認した。
- `SocialProfile` は発信設定、`ExternalReadGrant` は外部AI読取許可であり、Instagram資格情報とは統合しない。

## 2. 変更したファイル

- Prisma: `SocialOAuthAttempt` と `20261104010000_social_oauth_attempts` migration、schema readiness。
- Database: 接続一覧と期限切れtoken破棄、所有権・RLS・single-use claimの統合テスト。
- Web: OAuth開始/callback、解除route、owner resolver、接続状態・解除・再接続UI、HTTP/UIテスト。
- 共通の接続画面にはInstagram資格情報と外部AI読取許可を別セクションとして表示する。

## 3. 主要な設計判断

- OAuth transactionは10分で失効し、stateのSHA-256だけをDBへ保存する。ブラウザ証明はHttpOnly・SameSite=Lax cookieで、callback時に現在の会員認可とSOCIAL capabilityを再評価する。
- callbackはproviderへ接続する前にstateを原子的に消費する。再送、期限切れ、別User、別Bunshin、権限失効はprovider token交換前に拒否する。
- callbackで得たtokenは既存のAES-GCM repository経由でのみ保存する。HTTPレスポンスと画面にはtokenを含めない。
- 接続一覧の読取時にも期限を確認し、期限切れtokenを破棄して `RECONNECT_REQUIRED` に遷移する。

## 4. 実行した検証

- Prisma validate、全274 migrationの使い捨てPostgreSQLへのfresh適用。
- 対象DB統合テスト6件、Instagram adapter/HTTP/UIテスト20件。
- Repository全体のtypecheck（25/25）とlint（25/25）、Database unit test（1,363件）、Web unit test（4,282件）、Build（13/13）を成功確認した。
- 全DB統合テストは421件中415件成功。無関係なPersonal Learning既存6件がローカル5秒timeoutとなったため、対象6件をfresh DBで分離再実行して成功を確認した。

## 5. 未解決事項

- Meta App ID/Secret、callback URL、Graph API version、暗号化鍵はデプロイ環境で設定する。本番設定・migration適用・デプロイはこのPRでは行わない。
- 実投稿、token定期更新、予約Job、Muse経由の投稿は対象外。

## 6. 次Phaseへ進める条件

- PRのreviewとCI `verify` / `database` が成功すること。
- 本番反映時はMeta redirect allowlistとserver-only環境変数をデプロイ専用手順で確認すること。
