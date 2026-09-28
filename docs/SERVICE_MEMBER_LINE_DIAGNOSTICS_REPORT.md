# サービス参加者別LINE配信診断 実装レポート

更新日: 2026-09-28

## 1. 調査した内容

- 千ノ国メディアではACTIVE参加者22人に対してLINE配信対象が18人であり、既存管理画面では対象外の4人と理由を識別できなかった。
- 共通LINEとサービス専用LINEで接続テーブルが異なることを確認した。
- 実配信は現在環境の有効な接続確認済み設定、サービス参加状態・同意、利用者状態、接続状態、通知同意、友だち状態、全体停止を配信資格に使用している。

## 2. 変更したファイル

- `apps/web/app/(app)/groups/[groupId]/members/group-member-line-status.ts`
- `apps/web/app/(app)/groups/[groupId]/members/group-members-data.ts`
- `apps/web/app/(app)/groups/[groupId]/members/group-members-view.tsx`
- `apps/web/test/service-member-line-status.test.ts`
- `apps/web/test/service-member-line-diagnostics-boundary.test.ts`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/DECISION_LOG.md`
- `docs/SERVICE_MEMBER_LINE_DIAGNOSTICS_REPORT.md`

## 3. 主要な設計判断

- 配信可否は表示専用の純粋関数へ分離し、参加者画面とテストで同じ分類を利用する。
- 共通LINEでは利用者単位の接続、専用LINEではサービス所属単位かつ現在の有効設定に結び付く接続を判定する。
- 管理画面には配信可能、参加・同意・接続・通知同意・友だち状態・サービス設定の各確認理由だけを表示する。
- Provider User IDや秘密値は取得せず、本人の回答内容や通知内容も追加表示しない。
- 状態を自動修復せず、サービス全体の問題はLINE設定画面、参加者固有の問題は本人への案内へ誘導する。

## 4. 実行した検証

- 配信可能、参加同意なし、接続なし、接続無効、通知同意なし、友だち状態不一致、全体停止の単体テスト。
- 現在環境と既存配信資格の判定材料を使用し、Provider User IDを画面実装で参照しない境界テスト。
- 関連テスト18件、Webアプリの型検査、全体lint、本番ビルドが成功した。

## 5. 未解決事項

- 本番反映後、千ノ国メディアの4人について表示される分類と実配信プレビューの人数一致を確認する必要がある。
- LINE接続や友だち状態の復旧は参加者本人の操作を含むため、管理者が代理で完了させる機能は追加していない。
- 画面は保存済みWebhook状態を表示するため、LINE Provider側の状態変化がWebhookへ到達していない場合は即時反映されない。

## 6. 次Phaseへ進める条件

- CIのtest、typecheck、lint、buildが成功すること。
- 本番反映後に対象人数が配信プレビューと一致すること。
- 対象外の参加者へ理由に応じた案内を行い、再接続後に配信対象へ変わることを実端末で確認すること。
