# ワタシポイント P-4A 交換Core 実装報告

## 1. 調査した内容

- P-1の追記型Transaction、消費元Link、同時消費保護
- P-3の本人限定Workspace認可
- SNS画像生成の本人操作、実行直前Gate、Provider Job境界
- 追加企画生成を後から同じ交換Coreへ接続するための共通化範囲

## 2. 変更した機能

- 版管理された共通交換カタログ
- 画像生成1回50 WP、追加企画生成1回30 WPの初期Catalog Item
- ポイント交換予約と`RESERVED / CONFIRMED / RELEASED / REFUNDED`状態
- 予約・残高減算・消費履歴を不可分に保存するRepository
- Provider受付前の解放と最終失敗時の返却Use Case
- 再送、本人スコープ、遷移、理由入力のApplication Test

## 3. 主要な設計判断

- 交換価格をProvider処理へハードコードせずCatalogの版へ保存する。
- 予約は既定15分、Use Caseとして1〜60分の範囲だけを許可する。
- 解放・返却には理由を必須とし、追記型REFUNDで残高へ戻す。
- 同一idempotency keyの再送は同じ予約を返し、異なる交換内容への流用を拒否する。
- 予約を確定できるのは有効期限内だけとする。

## 4. 検証

- Prisma format / validate: 成功
- Application test: 265件成功
- Application / Database typecheck: 成功
- Prettier / lint / `git diff --check`

## 5. 未解決事項

- 期限切れ予約を自動解放するJobはP-4Bで追加する。
- SNS画像生成と追加企画生成への実接続はP-4Bで追加する。
- 利用者向け交換確認UI/APIはProvider接続と同時に追加する。
- Catalog管理画面と緊急停止はP-6で追加する。

## 6. 次Phaseへ進める条件

- Catalog構造、交換価格、予約状態、返却境界をレビューする。
- 承認後、P-4Bで画像生成・追加企画生成と期限切れ予約Jobへ接続する。
