# AI研修 法人管理画面 実装レポート

## 1. 調査した内容

- 既存のサービス管理画面と管理者認可
- AI研修のProgram、Enrollment、Participant Profile、Assignment、Progress Snapshot
- AI評価結果の構造と、回答本文を表示せず苦手領域だけを確認する方法
- Workspace、Service、Membership、Enrollmentの分離条件

## 2. 変更したファイル

- `apps/web/app/s/[serviceSlug]/manage/training/page.tsx`
- `apps/web/src/services/ai-training-admin-dashboard.ts`
- `apps/web/app/s/[serviceSlug]/manage/page.tsx`
- `apps/web/app/styles.css`
- `apps/web/test/ai-training-admin-dashboard.test.ts`

## 3. 主要な設計判断

- 新しい集計テーブルは作らず、既存のProfile、Progress Snapshot、Assignment、AI評価を参照する。
- 管理画面のクエリはWorkspace、Service、AI研修Program、Enrollmentを必須条件にする。
- 回答本文は取得せず、AI評価で構造化された苦手領域だけを表示する。
- 継続率は「受講中のうち、直近7日以内に研修を進めた人の割合」と定義する。
- 復習が必要な人、7日以上止まっている人、初期設定前の人を先に表示する。
- スマートフォンでは受講者情報を1列で確認できるカード表示にする。

## 4. 実行した検証

- Dashboard集計単体テスト
- Workspace、Service、Enrollment境界の静的テスト
- Web typecheck
- 変更対象のESLint
- Prettierの内容差分確認

## 5. 未解決事項

- 「困った」「後でやる」の受講者操作とAction Event
- 「困った」を担当者へ通知する経路
- AI研修通知の停止・再開、通知時刻、再通知設定
- 本番用Program Definitionと受講者を使った実機確認

## 6. 次Phaseへ進める条件

- CIのverifyとdatabaseが成功すること。
- 管理者が別サービスの受講者を閲覧できないことを本番相当データでも確認すること。
- 次Phaseでは「困った」「後でやる」と担当者への支援通知を実装する。
