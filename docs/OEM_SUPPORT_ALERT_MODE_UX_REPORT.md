# OEM支援アラート 対応表示実装報告

## 1. 調査した内容

候補作成時の`handlingMode`はSnapshotへ保存されるが、管理画面の説明と対応ボタンは全モード共通だった。

## 2. 変更したファイル

- `apps/web/src/services/support-alert-mode-view-model.ts`
- `apps/web/app/s/[serviceSlug]/manage/personalization/page.tsx`
- `apps/web/test/support-alert-mode-view-model.test.ts`

## 3. 主要な設計判断

- 有料オプション、契約内支援、内部対応で説明と対応開始文言を分ける。
- 候補作成時のSnapshotを表示に使い、後日の設定変更で過去の判断を書き換えない。
- 旧候補は利用者へ案内しない内部対応として表示する。
- 表示と状態遷移のみを変更し、自動営業、契約変更、課金、利用者通知は行わない。

## 4. 未解決事項

本番Serviceの実候補における表示と状態変更は未確認。

## 5. 次Phaseへ進める条件

CI、Migration適用、対象Serviceの設定後に読み取り中心の本番確認を行う。
