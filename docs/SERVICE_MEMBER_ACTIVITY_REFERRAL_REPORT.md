# サービス参加者向け「活動・紹介」画面 実装報告

## 調査した内容

- 紹介コード、紹介クリック・成果、サービス別画像クレジット、ポイント、バッジの永続化基盤は実装済みだった。
- 紹介コードを参加者本人が発行し、共有・実績確認するサービス専用画面がなかった。
- 画像クレジットはサービス所属単位、ワタシポイントはWorkspaceの利用者単位、バッジはGroupを持つ記録だけをサービス画面へ表示する必要がある。

## 変更したファイル

- `apps/web/src/http/service-referral-code.ts`
- `apps/web/app/api/services/[serviceSlug]/referral-code/route.ts`
- `apps/web/app/s/[serviceSlug]/activity/page.tsx`
- `apps/web/app/s/[serviceSlug]/activity/service-referral-share.tsx`
- `apps/web/app/s/[serviceSlug]/home/page.tsx`
- `apps/web/app/styles.css`
- `apps/web/test/service-member-activity-referral.test.ts`

## 主要な設計判断

- 千ノ国メディアと副業向けサービスで共通利用し、サービス名をコードへ固定しない。
- 紹介制度が有効なサービスだけ紹介欄を表示する。
- 紹介コードはACTIVEな本人のサービス所属を再確認し、所属単位で冪等に発行する。
- 紹介先の氏名・メール・LINE識別子は本人画面へ表示せず、段階と日付だけを表示する。
- QRコードは外部APIへURLを送らず、サーバー内で生成する。
- サービス別画像クレジットとWorkspace共通のワタシポイントを別の残高として明示する。
- バッジ概要は対象Service IDを持つ進捗・獲得記録だけに限定する。

## 実行した検証

- サービス境界・共有操作の専用テスト
- Web lint、typecheck、test、build

## 未解決事項

- 紹介人数が多い場合の期間別集計・CSVは管理者向けの別作業単位とする。
- 本番スマートフォンでLINE共有とQR読み取りを確認する必要がある。

## 次Phaseへ進める条件

- CI通過後、千ノ国メディアの紹介制度を有効にした状態で参加者本人のURL発行と共有を確認する。
