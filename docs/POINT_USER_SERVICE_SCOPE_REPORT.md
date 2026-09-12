# ポイント利用者画面 サービス境界 実装報告

## 1. 調査した内容

ポイント・バッジ画面のサービス切替後も、ポイント利用者ダッシュボードは Workspace だけを条件に取得していました。そのため、同じ Workspace の別サービスにある付与ルール、投稿回数、履歴が混ざる可能性がありました。また「週3回投稿」の付与判定も Workspace 全体の投稿を合算し、既定ルールの1日・1週間単位の重複防止キーもサービスを区別していませんでした。

## 2. 変更したファイル

- `packages/application/src/point-core.ts`
- `packages/application/test/point-core.test.ts`
- `packages/database/src/index.ts`
- `packages/database/test/point-dashboard-service-scope.test.ts`
- `packages/database/test/point-activity-service-scope.test.ts`
- `apps/web/app/(app)/points/page.tsx`
- `apps/web/app/(app)/groups/[groupId]/images/page.tsx`
- `apps/web/app/api/workspaces/[workspaceId]/points/route.ts`
- `apps/web/test/rewards-pilot-boundary.test.ts`

## 3. 主要な設計判断

- 利用可能残高と30日以内の失効予定は、従来どおり Workspace 内の全サービスで共通としました。
- ポイントのため方、今週の投稿回数、最近の通常履歴は、選択中サービスの `groupId` で限定しました。
- 運営者による共通調整など、サービスを持たない履歴（`groupId = null`）は選択中サービスの履歴にも表示します。
- サービス固有ルールを優先しつつ、サービス固有ルールがない場合は共通ルールを利用します。他サービスの固有ルールは候補に含めません。
- 1日・1週間の付与済み判定にサービスIDを含め、同じ Workspace の別サービスで行った活動が互いの付与を妨げないようにしました。
- 切替直後に同じ活動へ重複付与しないよう、現在の期間については旧形式の付与済みキーも同じサービス内で確認します。

## 4. 実行した検証

- 関連テスト: Application 6件、Database 4件、Web 16件成功
- 型検査: Application、Database、Web 成功
- 全体テスト: Application 451件、Database 253件、Web 901件を含む全19タスク成功
- 全体lint: 全19タスク成功
- 本番ビルド: 全10タスク成功

## 5. 未解決事項

過去に `groupId` なしで記録された共通履歴はサービスを特定できないため、共通調整と同様に表示されます。既存データからサービスを安全に特定できないため、自動的な書き換えは行いません。

## 6. 次Phaseへ進める条件

関連テスト、型検査、lint、ビルド、およびGitHubの必須チェックが成功し、PRをレビューできる状態にすることです。
