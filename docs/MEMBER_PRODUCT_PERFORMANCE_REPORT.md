# 保存商品別 利用状況集計 実装レポート

## 1. 調査した内容

保存商品の登録、非表示、公式商品との関連付け、AI投稿3案の作成までは実装済みだった。一方、投稿案作成後のコピーと投稿完了はブラウザー内だけの操作で、運営者は商品ごとの利用状況を確認できなかった。

## 2. 変更したファイル

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260907210000_add_member_product_content_activities/migration.sql`
- `packages/database/src/index.ts`
- `packages/application/src/member-product-content.ts`
- `apps/web/src/http/member-product-suggestions.ts`
- `apps/web/src/http/member-product-activities.ts`
- `apps/web/app/api/services/[serviceSlug]/member-products/generations/[generationId]/activities/route.ts`
- `apps/web/app/s/[serviceSlug]/tracking-link/member-product-content-form.tsx`
- `apps/web/app/s/[serviceSlug]/manage/member-products/page.tsx`
- 関連テスト、管理メニュー、残機能計画

## 3. 主要な設計判断

- 投稿文本文や編集内容は保存せず、`GENERATED / COPIED / POSTED`の追記履歴だけを保存する。
- 履歴はWorkspace、Service、Membership、User、保存商品、Bunshin、承認済み専用URLへ固定する。
- コピーと投稿完了は、同じ生成につき各1回だけ集計する。二重タップや再送で件数を重複させない。
- 非表示の商品、停止した専用URL、無効な参加者では新しい操作履歴を保存しない。
- 運営画面は直近28日の件数と専用URLの現在状態を表示し、投稿本文や分身設定を表示しない。
- クリック、購入、成約、報酬は外部システムの責任範囲とし、本集計へ含めない。

## 4. 実行した検証

- Prisma schema validation
- Application、Database、Webのtypecheck
- Applicationの入力・fail-closedテスト
- Database schema、複合外部キー、重複防止テスト
- Webの本人操作、Same-Origin、管理画面の非本文表示テスト

## 5. 未解決事項

- 本番Migration適用後の、実アカウントによる作成・コピー・投稿完了の確認
- Production Gateへの端末smoke証跡登録
- 外部システム側のクリック・申込み・購入・成約集計との接続はMVP対象外

## 6. 次Phaseへ進める条件

本番で同じ生成を複数回操作してもコピー・投稿完了が各1件だけ集計され、別サービスの管理者から参照できないことを確認する。その後、R2のDaily Mission別案生成へ進む。
