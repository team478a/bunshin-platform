# HASSY SNS活動障壁 本人確認UI 実装報告

## 1. 調査した内容

- 投稿パートナーホームの認証、Service参加、Bunshin所有権の検証経路を確認した。
- H3-Aの質問・回答Repositoryを既存画面とAPIへ接続する最小範囲を確認した。
- 内部Category、Evidence、Rule Versionを本人画面へ表示しないことを確認した。

## 2. 変更したファイル

- `apps/web/src/http/service-social-activity-barrier.ts`
- `apps/web/app/api/services/[serviceSlug]/bunshins/[bunshinId]/activity-barrier/route.ts`
- `apps/web/app/s/[serviceSlug]/bunshins/[bunshinId]/activity-barrier-card.tsx`
- 投稿パートナーホームのdata / view / stylesheet
- `apps/web/test/social-activity-barrier-participant-ui.test.ts`

## 3. 主要な設計判断

- 未回答候補がある本人にだけ、一つの質問カードを表示する。
- POSTはSame Originを必須とし、Service参加とBunshin所有権をAPIで再検証する。
- 同一操作の通信再試行では同じ冪等キーを維持する。
- 回答後は確定Category名ではなく、今すぐ行える無償支援の理由と手順だけを表示する。

## 4. 実行した検証

- Web typecheck / lint / test。
- 本人向け文言、内部用語非表示、冪等キー、Same Origin、Membership / User / Bunshin境界の静的テスト。
- root format checkとbuildはPR前に実行する。

## 5. 未解決事項

- 支援の完了・スキップ操作は後続PR。
- 確定障壁の管理者集計画面は後続PR。
- 本人へ質問を表示するためのBarrier推定定期Job接続は別作業。

## 6. 次Phaseへ進める条件

- 本PRの本人認可、スマートフォン表示、API応答をレビューする。
- 実運用前にテストServiceでSUSPECTED Caseを作り、回答から支援表示までを画面確認する。
