# EVO-04 原価信頼性・照合契約

## 基準と範囲

- 基準main: `b4743ef7a8b2648a1e985c32cf14a1a995aacfca`（#1191 merge、main CI run37875851588成功）。
- branch: `codex/ai-evolution-evo04-cost-reliability`。commit/PR/最終CIはPRの検証追記を参照。
- #1188は監査案として参照（`41daf16848308051baa548384855b8594eb2b8b2`）。最新コードを優先し、原価集計の正本と同attempt対応を調査した。
- 設計判断: [EVO04_DESIGN_DECISION.md](EVO04_DESIGN_DECISION.md)。新Gateway、請求方式、価格Routerを作らない。

## 現在の正本と対応表

| 記録                                               | 根拠                                                                   | 同attempt参照 / 費用の意味                                                                                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AiUsageEvent`                                     | `packages/database/src/ai-usage.ts` / schema `AiUsageEvent`            | workspace/actor/idempotencyKey一意。共通利用履歴。token、推定額、pricingVersion。cached内訳、Service実行時snapshotはない                                                           |
| `ProgramActionEvent` / `PERSONAL_LEARNING_AI_CALL` | `packages/database/src/personal-learning-ai-call.ts`                   | workspace/group/idempotencyKey一意。key=`personal-learning-ai-call:${usageKey}`。metadata.usageKey、measurement、cost/pricing snapshot、実行時group/enrollment/Plan/Definition参照 |
| Assessment writer                                  | `apps/web/src/jobs/training-answer-evaluation-job-handler.ts`          | 両記録へ`training-evaluation:${answer.id}:${jobId}:attempt:${attemptCount}`を渡す。再試行は別key、二つの台帳は同じcallであり二つの費用ではない                                     |
| Pilot価格計算                                      | `packages/application/src/ai-call-observability.ts`                    | cached/uncachedの整数micro-USD、時点別価格版、欠測UNKNOWNを既存計算で維持                                                                                                          |
| 現行OEM利益集計                                    | `packages/database/src/commercial-usage.ts` / `profitabilityDashboard` | workspace単位のAiUsageEventだけをsum、priced/unpriced件数を分離。現在はPilot額を追加しておらず、既存集計に二重加算があるとは断定しない。空subtotalは0n。今回変更しない             |

`recordAiUsageSafely`とPilot recordはbest-effortで別保存。両方欠損した実callや送信前の失敗を費用台帳だけで判定できない。Admission ledgerは停止/同時実行の正本であり、実費やgroup/OEM配賦の正本ではない。

## 追加した契約

`packages/application/src/ai-cost-reconciliation.ts`を既存公開入口からexportする。`reconcileAiCosts`は明示scope（workspace/actor）と本文なしprojection二種を受け取り、`AI_COST_RECONCILIATION_V1`のJSON化可能なimmutable結果を返す。Repository取得/管理権限は呼出し側の別責務。今回DB読取API、集計画面、Jobへ接続しない。

- scope完全一致を再確認。他ユーザー/Workspaceを拒否。Bunshin参照も共通projectionに保持し、Pilot AssessmentへBunshin付きを混ぜない。
- usageKey完全一致だけで照合。時刻の近さ/model/回答の類似から推定しない。
- 同じid・同じ内容の再取得は1件。矛盾duplicateや別Serviceの同keyはCONFLICT。idの別attemptへの再利用は拒否。
- Pilotがあればその保存済み価格snapshotから既存計算で検証。最新価格や環境registryで過去を再計算しない。価格版/cached情報を結果へ残す。
- 共通履歴とmodel/token/額/価格版が矛盾すれば選択せずnull。PilotがUNKNOWNなら共通推定額で補完しない。共通履歴だけならversion付きの記録済み推定額として扱い、cachedやServiceを復元しない。
- workerのSUCCESS/FAILEDとProvider観測のsuccessは別欄。Provider後の保存/評価処理失敗を同一状態に潰さない。失敗で観測されたtoken費用は残す。
- 取得上限は合計10,000行、未知fieldを拒否。未読/打切りは`readsComplete=false`。空/UNKNOWN/CONFLICT/overflowの総額はnull、既知subtotalと件数を分離。
- `recordedCostCoverage`は取得完了時の既知費用件数/記録済みattempt数。全実callの捕捉率ではない。`actualCallCoverage=UNKNOWN`、`population=RECORDED_ATTEMPTS_ONLY`、`billingUse=NOT_APPROVED`を固定。

## OEM・Privacy・境界

現在の所属やBunshinの現在groupから過去Serviceを補完しない。単独Serviceに見えても実行時証拠なしならUNKNOWN。Pilotのgroup/enrollment参照を残しても、apiCostOwner/契約/所属変更履歴の証明とはしない。`oemAllocation=UNKNOWN`を固定し、FREE実測/PAID登録課金とマナベル有料登録の既存ルールは変更しない。

projectionは相談、回答、成果物、Prompt、Provider response、secretを受け付けない。usageKey/参照IDは仮名識別子であり匿名とは主張しない。実データの公開export、取得権限・保持・削除・金額利用のレビューは別工程。合成fixtureだけで検証する。

## 検証と未確認

初回の原価照合/既存pricing/usageの3ファイル39件成功。Bunshin境界・外部API非呼出しを追加後は3ファイル41件成功、Application全体136ファイル895件成功。WebのPilot worker/provider/observability・固定baseline/report 5ファイル60件成功、DB Repository 2ファイル10件成功、architecture 10件成功。format/typecheck/lint/build・CIの最終確定結果はPR追記に記録する。新規テストは二重加算、順序再現性、retry/失敗、cached/価格版/UNKNOWN/明示zero、矛盾、部分取得、cross-scope、本文拒否、整数overflowを含む。

本番model/設定/DB/schema/migration/Provider/OEM課金/UI/学習/LINE/Pilot Gateは変更なし。実APIと本番DBを利用していない。合成テストは本番原価、欠測率、請求正当性、実tenant認可の検証ではない。

## 引継ぎ・rollback

保存不足を本PRのschema追加で埋めない。実callの完全coverage、実行時Service/apiCostOwnerと複数Service配賦、二台帳の保存不一致検知を本番の認可済みbounded readerへつなぐ設計は別PR候補。既存OEM/dashboardの集計を切り替える前に正本・権限・母集団・保持/削除・請求非影響を人間レビューする。

rollbackは本PRのrevert（永続データ移行なし、既存Runtime非接続）。EVO-05/本番読取/モデル変更/請求/merge/deployへ進まず、人間レビューで停止する。
