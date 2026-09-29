# 非公開Serviceの専用URL・外部計測管理API 実装報告

日付: 2026-09-30。基準: main `0a785ba5`（PR #1023マージ後）。本番反映とは区別する。

## 1. 調査した内容

- Service管理画面は本人の`ADMINISTRATION`権限で非公開Serviceを扱う一方、対応するサービス配下APIはPublic Resolverを先に呼び、非公開Serviceの管理者を拒否していた。
- 対象APIは設定閲覧/CSV出力、外部システム・ドメイン・本人識別子・専用URLの管理、CSV取込、結果Token更新である。成果受信Webhookは別経路にある。
- 下層ではGroup ID照合、Workspace/Service限定Repository、MANAGER権限、同一Origin等を検証している。

## 2. 変更したファイル

- `apps/web/app/api/services/[serviceSlug]/external-tracking/[[...path]]/route.ts`: 本人管理権限のService解決と失敗応答へ変更。
- `apps/web/test/private-service-external-tracking-route.test.ts`、`service-external-tracking-boundary.test.ts`: 非公開管理者、匿名、他Service、障害、Workspace/Service伝播を検証。
- D-160、Roadmap、機能不足監査とこの報告。

## 3. 主要な設計判断

- `CONTENT`権限ではなく、既存管理画面と同じ`ADMINISTRATION`権限を使う。外部成果受信WebhookはService管理APIと混ぜない。
- Resolverの所属不存在だけ404へ変換し、未知障害は500として区別する。下層の入力・所有・Role検証を維持し、DB/Provider/本番データは変更しない。

## 4. 実行した検証

- 関連Web4ファイル24テスト、型検査、lint、format、アーキテクチャ検査と全体CIの結果をPRに記録する。

## 5. 未解決事項

- 本番反映と実端末の管理者操作・権限外拒否、既存専用URLの確認は別作業。

## 6. 次へ進める条件

- CI・レビュー・マージ後、本番で非公開Serviceの管理者による専用URL操作と他Service拒否を確認する。
