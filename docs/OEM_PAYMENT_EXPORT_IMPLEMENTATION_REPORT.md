# OEM決済台帳CSV 実装報告

## 1. 調査した内容

- OEM決済運用画面と ProgramPurchase の組織分離
- 既存のCSVエスケープ、UTF-8 BOM、ダウンロード処理
- 運営団体の所有者・管理者権限

## 2. 変更したファイル

- apps/web/src/http/organization-payment-export.ts
- apps/web/app/api/organizations/[workspaceId]/payments/export/route.ts
- apps/web/app/(app)/organizations/[workspaceId]/payment/page.tsx
- 関連テスト

## 3. 主要な設計判断

- 出力対象は選択された workspaceId の購入だけに限定する。
- 運営団体の所有者・管理者とシステム管理者だけに許可する。
- 決済額、返金額、差引額、購入者、サービス、状態、Stripe参照IDを出力する。
- Excel等で開いた際の文字化けを避けるためUTF-8 BOMを付ける。
- 数式として解釈される文字列を無害化し、CSVインジェクションを防ぐ。
- 1回の出力を最新10,000件までに制限する。

## 4. 実行する検証

- CSV金額、返金、差引額と日本語出力
- CSVインジェクション対策
- 組織権限・組織スコープ境界
- Web型検査、lint、本番ビルド

## 5. 未解決事項

- 10,000件を超える大規模運用では期間指定または非同期出力が必要。
- Stripe手数料、税、チャージバックは出力対象外。

## 6. 次Phaseへ進める条件

- 実データをiPhoneとPCの両方で保存し、Excelまたは表計算ソフトで開けることを確認する。
