# 次に実施する最小作業

## 優先順位: 開発より既存成果の利用確認

| 優先度 / 項目                     | 開発・検証・運用の区別             | 再利用 / 受入条件                                                                                                               | 目安・依存                                                                       |
| --------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| P0-1 本番適合証拠の確定           | Read-only監査・運用準備            | 公開SHAは確定済み。DB全Migration/RLS/role、復旧合否、Pilot設定/承認/Seat/Provider限度を確認。UNKNOWNを残して開始しない          | 実環境権限があれば半日〜1日、復旧検証は別見積。アクセス/実行者の確定に依存       |
| P0-2 既存縦フロー受入             | 人間承認後の限定実利用検証         | 少数ハッシー企業の3条件、マナベル内部1〜2人のGoal→Plan→実践→評価→次課題→First Success→復元。LINE照合/スマホ/旧V1/STOP・費用観測 | 1〜3日＋観測。実API費用/送信/Pilot開始は個別承認、既存Launch Runbook再利用       |
| P0-3 発見された利用不能点のみ修正 | 小さなバグ修正PR                   | 認証/越境/重複/保存復元/評価待ち/課金の重大不具合があれば優先。原因を再現テストで固定                                           | 原因次第。未確認を既知のバグ扱いして先行実装しない                               |
| P0 OEM課金V2 Release Gate         | 運用・別Release計画                | #1176のschema/復旧/正式登録/提供/契約履歴、shadow、将来cutover承認。内部Pilot開始の前提に無用に結合しない                       | 1〜3日以上、実履歴整合とDB権限依存。本監査は適用/課金しない                      |
| P1 ハッシー個別化・継続支援       | 品質受入→不足時の小拡張            | 既存History/Goal/Quality/Barrierを利用。企業差・日差・不採用理由の適切な反映を固定データで比較、本人採用/投稿を区別             | 1〜2日の評価設計から。全Memory新設や既存処理統合は不要                           |
| P1 マナベル再実践R3/R4            | 人間レビュー後の最小開発           | #1195〜#1199を再利用し、Approved題材Reader→本人明示の既存Assignment Bridge→本人UI、履歴比較UNKNOWNを適切に表示                  | 3〜6開発日を仮目安、レビュー/DB競合試験別。#1200と題材人間レビュー/Privacyに依存 |
| P1 初回操作・課題適合             | 実受講者フィードバック後の小UI改善 | 既存Profile/相談・Plan/Reason Mappingを再利用。大量質問を追加しない。Teachingの自由生成はまだ不要                               | 1〜3日、実離脱/つまずき証拠が前提                                                |
| P1 LINE学習通知（提供条件次第）   | 明示要求時のみ別設計/PR            | 会員LINE照合・LIFFは再利用、Personal Learning通知は別。旧V1通知をそのまま流さない。重複/対象取消/時間/停止を保証                | 未見積。Web限定Wave 0では後回し可、LINE通知込み提供では必須                      |
| P2 原価照合の読取接続             | 小さなReader/運用レポート候補      | EVO04 exact usageKey、原価不明/CONFLICT、取得範囲・OEM帰属限界を表示。料金請求は変えない                                        | 2〜4日仮目安。実usageの欠落状況を先に確認                                        |
| P2 候補モデル少量比較             | 別承認の検証                       | EVO01固定条件＋EVO02/03、合成入力/予算上限、実費用・品質の人間レビュー。公開仕様を確認してから                                  | 1〜2日＋review/費用。新Model採用とは別承認                                       |
| P2 改善候補/Dots/Codex            | 運用設計候補                       | 本文なし構造化report、人間承認→小PR→CI→人間確認。Dots公開仕様/API未確認を利用可能と仮定しない                                   | 後回し。自動merge/deployなし                                                     |
| P3 将来AI機能/OEM拡張             | 今回不要                           | 画像/音声/検索/高度自動化・新Package・巨大Gateway/Marketplaceを先行しない                                                       | 未見積                                                                           |

工数はコード調査からの概算であり見積確約でない。全EVO・再現性・通知・新課題を完成させてから利用検証、という順序にはしない。まず既存3Definitionと既存ハッシーで利用価値・障害を測る。

## 受入記録の最小形式

各検証に対象SHA/設定版/合成ケースIDまたは匿名参加ID、利用範囲、手順、期待結果、観測結果、PASS/FAIL/UNKNOWN、日時/実行者、停止/復旧方法、費用、未検証を記録。顧客名・相談/回答/成果物本文・Secretは共有監査文書へ入れない。

ハッシーは同じ合成企業条件から企業情報・日・拒否理由を一つずつ変えて比較。言い換え・random差だけで合格にしない。実投稿は本人操作し、採用と実施記録を別確認する。

マナベルは「何を学べばよいか不明」「CONTENT_REQUEST」「CONSULTING」「Definition Gap」「REVIEW/RETRY」「評価なし」「再ログイン/復元」を含める。再現機能は未承認Draft・旧履歴・片側削除・版不一致のUNKNOWNを維持する。

## 今回の再現コマンド（本番操作なし）

Node24 / pnpm10、基準mainで次を実行した。各 `vitest run` はAPI/DBをfake/mockで置換する。EVO01は出力先を指定せず実行し、新しいreportファイルを書かない。

```powershell
pnpm --filter web exec vitest run test/ai-evolution-baseline.test.ts test/ai-evolution-report.test.ts test/hassy-sns-goal-propagation-characterization.test.ts test/hassy-goal-differential-rubric.test.ts test/openai-weekly-planner.test.ts test/openai-task-compatibility.test.ts test/mission-provider-response.test.ts test/personal-learning-pilot-http.test.ts test/personal-learning-pilot-ui.test.tsx test/personal-learning-call-admission.test.ts test/personal-learning-ai-call-worker.test.ts test/personal-learning-ai-call-provider.test.ts test/personal-learning-line-isolation.test.ts test/personal-learning-pilot-operations.test.ts
pnpm --filter @bunshin/capability-social test
pnpm --filter @bunshin/capability-training test
pnpm --filter @bunshin/application exec vitest run test/ai-cost-reconciliation.test.ts test/oem-registration-billing.test.ts test/personal-learning-persistence.test.ts test/personal-learning-plan.test.ts test/personal-learning-call-admission.test.ts test/personal-learning-pilot-operations.test.ts
pnpm --filter web exec vitest run test/daily-mission-learning-history.test.ts test/social-activity-barrier-scheduler.test.ts test/social-activity-barrier-line-scheduler.test.ts test/oem-billing-policy.test.ts test/commercial-billing-export.test.ts test/personal-learning-pilot-profile.test.ts test/personal-learning-profile-preparation-ui.test.tsx test/personal-learning-ai-call-observability.test.ts
pnpm --filter @bunshin/database exec vitest run test/reproduction-history.test.ts test/reproduction-challenge-review-admin.test.ts test/personal-learning-internal-owner.test.ts test/personal-learning-pilot-profile.test.ts test/personal-learning-ai-call.test.ts test/social-activity-barrier-repository.test.ts test/commercial-billing.test.ts
pnpm --filter web exec vitest run test/openai-training-answer-evaluator.test.ts test/daily-mission-generation-error.test.ts test/daily-mission-generation-environment-boundary.test.ts test/service-member-line-status.test.ts test/service-member-line-diagnostics-boundary.test.ts test/ai-training-action-line-boundary.test.ts
```

結果は[統合監査](INTEGRATED_READINESS_AUDIT.md)。ブラウザー/実スマホE2E、実DB integration、実API品質/負荷、実送信は今回未実行。文書のみのため全体build/typecheck/lintを新たに実行せず、関連main/PR CI結果と文書format・architecture・diffを区別して記録する。buildやmigration runnerを本番確認の代わりに実行しない。

## 実利用へ移行する最小ゴール

1. 対象範囲のP0証拠を確定し、開始責任者が承認する。
2. 既存フローを少数で実完走し、誤PASS/越境/データ損失/課金異常/旧V1影響がないこと、復元・停止・費用観測を確認する。
3. 利用不能点だけ修正して再受入。ハッシー3条件、マナベル本人実践が成立した対象へ段階拡大する。

100社負荷や再現性保証を約束する場合だけ、対応する追加受入/開発を前提にする。今回の監査終了後は新実装・本番操作に進まず人間レビューを待つ。
