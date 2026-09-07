# 本人商品 投稿活動集計 実装報告

## 1. 調査した内容

本人商品プロフィールと承認済み専用URLからAI投稿案を3案作成できる一方、生成結果はブラウザに返すだけで、作成、コピー、投稿完了を商品別に確認できなかった。既存のDaily Mission用`ContentLinkUsage`は別の生成経路を記録するため、本人商品投稿へ流用せず独立した活動境界を追加した。

## 2. 変更したファイル

- `packages/application/src/member-product-activity.ts`: 活動Repository契約、入力検証、本人・運営集計Service
- `packages/database/prisma/schema.prisma`: 生成単位と追記イベント
- `packages/database/prisma/migrations/20260907190000_add_member_product_content_activity/migration.sql`: enum、table、所有境界、重複防止制約
- `packages/database/src/index.ts`: 本人・サービス・商品・分身を再検証するRepository
- `apps/web/src/http/member-product-suggestions.ts`: AI生成成功時の生成単位記録
- `apps/web/src/http/member-product-activity.ts`: コピー・投稿完了API
- `apps/web/app/s/[serviceSlug]/tracking-link`: 本人向け操作と商品別集計
- `apps/web/app/s/[serviceSlug]/manage/product-packs/page.tsx`: 運営者向け匿名集計

## 3. 主要な設計判断

- 投稿本文とURL本文は活動台帳へ保存しない。既存の本人商品プロフィールと専用URLを正本として参照する。
- 生成1回を`MemberProductContentRun`、コピーと投稿完了を`MemberProductContentEvent`へ保存する。
- 同じ生成・候補・操作種別は一度だけ計上し、API再送や連打で数字を増やさない。
- 本人集計はACTIVEな本人Membershipへ固定する。運営集計は同じServiceの`SERVICE_OWNER / SERVICE_ADMIN / CONTENT_EDITOR`だけに許可する。
- 「専用URL使用」は承認済みURLを投稿案へ含めた回数を表す。外部サイトのクリック、購入、成果承認は外部計測値が接続されるまで表示しない。

## 4. 実行した検証

- Prisma Client生成
- Prisma schema validate
- Application活動Serviceテスト
- Database schema・所有境界テスト
- Web UI・API境界テスト
- Application、Database、WebのTypeScript型検査

## 5. 未解決事項

- Production migration適用と、実端末での作成、コピー、投稿完了、本人集計、運営集計の確認。
- 外部成果計測サービスからクリック、購入、承認成果を取得するProvider接続。今回の「専用URL使用」には含めない。

## 6. 次Phaseへ進める条件

Migration適用後、別参加者・別サービスの活動IDを送っても404となること、同じ候補のコピー・投稿完了が重複計上されないこと、運営画面に投稿本文が表示されないことを本番相当環境で確認する。
