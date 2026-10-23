# AI使用量の原価未確定を証跡付きで精算する実装報告

## 1. 調査した内容

2026-10-23に本番Supabaseを読み取り集計し、当月のOpenAI `estimated_cost_usd_micros IS NULL` を確認した。合計は1,569件で、トークンあり1,237件、トークンなし332件だった。成功記録にも原価未設定があり、失敗種別やトークンの有無だけでProvider送信や費用発生なしを証明できない。

Runtimeの既存ガードは同じUTC月・Provider単位で原価NULLを1件でも検出すると停止する。既存のAdmission復旧は、既知原価の使用量記録とoperation hashが一致するOPEN予約だけが対象で、今回の履歴イベントは修復しない。

## 2. 変更したファイル

- `packages/application/src/ai-usage-cost-reconciliation.ts`
  - 原価未確定の一覧と、証跡付き精算のPort／UseCaseを追加。
- `packages/application/src/index.ts`
  - 公開入口へ追加。
- `packages/database/src/ai-usage-cost-reconciliation.ts`
  - 管理者権限、当月・Provider・原価NULLの範囲確認、原子更新、Provider設定監査を追加。
- `packages/database/src/index.ts`
  - Prisma実装を公開。
- `apps/web/src/http/ai-usage-cost-reconciliation.ts`
- `apps/web/app/api/admin/ai-usage-cost-reconciliation/route.ts`
  - GETの確認とPOSTの精算APIを追加。
- `apps/web/app/(app)/admin/ai/ai-usage-cost-reconciliation.tsx`
- `apps/web/app/(app)/admin/ai/page.tsx`
  - 管理画面に最大100件の確認・手入力精算を追加。
- `packages/application/test/ai-usage-cost-reconciliation.test.ts`
- `apps/web/test/ai-usage-cost-reconciliation.test.ts`
  - 0円、重複、証跡なしを拒否し、APIが秘密値を返さないことを検証。
- `docs/ai-training/AI_USAGE_COST_RECONCILIATION_IMPLEMENTATION.md`
- `docs/DECISION_LOG.md`

## 3. 主要な設計判断

- 原価はAIの出力やトークン数から推測しない。課金証跡または承認済み価格表を運用者が確認し、正の整数値と価格版を入力する。
- 1回の精算は最大100件。対象は当月UTC・指定Provider・`estimated_cost_usd_micros`がNULLのイベントだけで、本文・画像・Promptは読み出さない。
- SUPER_ADMINと証跡参照、理由を必須にする。更新はProvider設定の監査へ件数と理由を記録する。
- 同じ値・価格版で再実行した場合だけ既反映として成功させる。異なる値への上書き、対象外イベント、競合更新は拒否する。
- migration、schema、既存のfail-closedガード、Provider設定、本番DB、本番フラグは変更しない。

## 4. 実行した検証

- Application関連テスト: 1ファイル / 3テスト成功。
- Web関連テスト: 1ファイル / 3テスト成功。
- Database typecheck: 成功。
- Web typecheck: 成功。
- Prettier整形済み。

## 5. 未解決事項

- 課金証跡の内容と正しい原価・価格版は運用者の確認が必要であり、このPRは値を自動入力しない。
- 本番で精算APIを実行していない。精算後に当月UNKNOWN件数が0になること、予算と請求の照合、AI処理再開の確認が別途必要。
- 1,569件を一括更新せず、証跡を確認したバッチごとに実行する。

## 6. 次Phaseへ進める条件

Draft PRのレビュー後、田中が証跡と入力値を承認する。本番でのPOST、AI処理の再開、Provider設定変更、デプロイは別途明示承認を待つ。
