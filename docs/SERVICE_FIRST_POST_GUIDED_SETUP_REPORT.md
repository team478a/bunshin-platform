# Service First Post Guided Setup Report

## 調査した内容

- サービス参加時の質問回答は、投稿パートナー候補3案の生成にすでに利用されている。
- 従来は回答保存後にホームへ戻り、候補生成ボタンを押し、作成後に一覧から対象を開く必要があった。
- 投稿案の生成には、発信テーマ、SNSプロフィール、投稿方針、週間予定の設定が必要である。

## 変更したファイル

- `apps/web/app/s/[serviceSlug]/onboarding/service-onboarding-form.tsx`
- `apps/web/app/s/[serviceSlug]/bunshins/new/service-bunshin-proposals.tsx`
- `apps/web/app/s/[serviceSlug]/bunshins/[bunshinId]/page.tsx`
- `apps/web/app/styles.css`
- `apps/web/test/service-first-post-guided-setup.test.ts`

## 主要な設計判断

- 回答保存後は候補画面へ直接遷移し、候補3案を自動生成する。
- 投稿パートナー作成後は一覧を経由せず、その投稿パートナーの設定画面を開く。
- 最初の投稿案までに必要な5段階を、保存済みデータから自動判定して表示する。
- SNSの選択や投稿方針は利用者本人の意思が必要なため自動確定しない。
- SNSへの完全自動投稿はMVP対象外のため追加せず、投稿は利用者本人が行うことを明示する。

## 実行した検証

- 専用境界テスト
- Web lint / typecheck / test / build

## 未解決事項

- 各設定フォーム自体の高齢利用者向け簡略化は次の作業単位とする。

## 次へ進める条件

- CIが通過し、本導線が本番へ反映されること。
