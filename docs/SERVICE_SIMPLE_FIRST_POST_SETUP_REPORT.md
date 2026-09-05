# Service Simple First Post Setup Report

## 調査した内容

- 従来は初回投稿までに、投稿テーマ、SNS詳細、発信戦略6項目、週間予定、日次投稿案を別々に設定する必要があった。
- 千ノ国メディアは高齢の利用者が多く、サービスの目的は利用者ごとのSNSコンテンツ提供である。
- 既存のサービス専用APIには、サービス・利用者・投稿パートナー単位の認可と生成時の安全確認が実装済みである。

## 変更したファイル

- `apps/web/app/s/[serviceSlug]/bunshins/[bunshinId]/simple-first-post-setup.tsx`
- `apps/web/app/s/[serviceSlug]/bunshins/[bunshinId]/page.tsx`
- `apps/web/app/styles.css`
- `apps/web/test/service-simple-first-post-setup.test.ts`

## 主要な設計判断

- 利用者が初回に選ぶ内容を「使うSNS」と「投稿ペース」の2点に限定する。
- 投稿テーマは参加時の回答から設定し、支援レベルは完成原稿を受け取れる `READY_TO_USE` とする。
- 発信方針、週間予定、当日の投稿案は既存APIを順番に呼び出して準備する。
- 途中で失敗しても完了済みデータを削除せず、画面更新後に未完了部分から再実行できる。
- 詳細設定は削除せず、必要な利用者向けの折りたたみ欄として維持する。
- SNSへの投稿操作は自動化しない。

## 実行した検証

- 専用境界テスト
- Web lint / typecheck / test / build

## 未解決事項

- 実際の千ノ国メディア本番アカウントで、AI生成時間を含む一括準備の操作確認が必要である。

## 次へ進める条件

- CI通過後に本番へ反映し、既存の投稿パートナーまたはテスト利用者で一括準備を1回確認する。
