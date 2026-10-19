# マナベルスタイル 声かけN-2 実装報告

## 1. 調査した内容

- N-1のLINE声かけ処理は、送信前に対象受講・V3同意・内部テスター席・停止/休止状態・LINE通知設定を再確認し、固定文面をoutboxへ保存してから送信する。
- Personal Learningには、Admission上限・料金表・冪等性・精算を備えた `PersonalLearningCallAdmission` がある。運用通知センターもこの台帳の未精算予約を集計する。
- AI Provider設定は既存の暗号化済み設定を `resolveOpenAiRuntimeConfiguration` で参照できる。N-2で資格情報の追加や別台帳は不要。

## 2. 変更したファイル

- `apps/web/src/ai/openai-task-compatibility.ts`
  - `LEARNING_NUDGE` のStructured Output互換性を追加。
- `apps/web/src/providers/openai-learning-nudge.ts`
  - 固定された状況・回数・N-1文面だけを使う短文生成、JSON Schema、URL/宛先・長さ制限を追加。
- `apps/web/src/services/personal-learning-nudge-ai.ts`
  - 受講V3同意を再確認し、既存Provider設定・Admission・価格表・共通費用台帳で1回分を予約し、結果を精算する。
- `apps/web/src/services/personal-learning-nudge-message.ts`
  - AI文面がない場合は保存済みN-1固定文面をそのまま使い、AI文面がある場合だけ研修リンクを付ける。
- `apps/web/src/http/personal-learning-nudges-cron.ts`
  - N-1の最終eligibility確認後にN-2生成を試し、利用不可・失敗時は保存済み固定文面を送る。送信記録には `AI_N2` / `FIXED_N1` の出所だけを残し、本文を操作ログへ複製しない。
- `packages/application/src/personal-learning-text-operation.ts`
  - `NUDGE_COPY` を追加。状況・回数・日付のみを許し、学習者の入力やトピックIDなど余分なフィールドを拒否する。
- `packages/database/src/personal-learning-text-operation.ts`
  - 有効受講・内部席・声かけ同意/有効状態・`learningNudges` を確認してから予約する。既存のAdmission台帳に保存し、既知の実費で精算する。
- `packages/database/src/personal-learning-operation-identity.ts`、`packages/database/src/personal-learning-persistence.ts`
  - 声かけ予約キーを受講・状況・判定日由来のIDに結び付け、複数テーマ設定でもテーマ非依存に一意化する。声かけ以外のテーマ別ID挙動は維持する。
- `apps/web/test/openai-learning-nudge.test.ts`、`apps/web/test/personal-learning-nudges-cron.test.ts`、`apps/web/test/personal-learning-nudge-message.test.ts`
- `packages/application/test/personal-learning-text-operation.test.ts`
- `packages/database/test/personal-learning-operation-identity.test.ts`、`packages/database/test/personal-learning-persistence.integration-cases.ts`
- 本報告書。

## 3. 主要な設計判断

- 予約の重複防止キーは、受講ID・状況・東京時間の判定日から生成する。同じ受講/状況/日付では、テーマや送信再試行が変わっても2回目のAI予約を通さない。
- 既存 `PERSONAL_LEARNING_LESSON_ADMISSION` の回数・同時実行・USD・モデル・token制限、および `PERSONAL_LEARNING_AI_PRICING` を再利用する。未設定・モデル不一致・価格不明・上限超過・V3同意不足の場合はAIを呼ばずN-1固定文面へ戻す。
- AIには状況、声かけ回数、既定の固定文面の意図だけを渡す。本人の自由記述、相談履歴、プロフィール、氏名、URLは渡さない。本文は150文字以内、URL/宛先情報なしの構造化出力に限定する。
- 予約後にProviderを1回だけ呼び、実費が判明したら予約額を実費へ更新する。既知のProvider失敗も実費を記録する。通信断などで要求完了・費用を確定できない場合は、過少計上を避けて未精算扱いを保持し、既存の運用通知センターに検知させる。
- AI生成文はLINE outboxへ送信本文として保存し、N-1で接続済みの書き出し・一括削除・保存期間処理の対象に含める。メッセージ本文やプロンプト内容をログ/操作記録へ出さない。
- `learningNudges` の既定値は引き続きOFF。Migration、本番Provider設定、環境変数、Program設定、cron、本番データの変更は行わない。

## 4. 実行した検証

- `pnpm --filter @bunshin/application exec vitest run test/personal-learning-text-operation.test.ts` — 10 tests passed。
- `pnpm --filter web exec vitest run test/openai-learning-nudge.test.ts test/personal-learning-nudges-cron.test.ts test/personal-learning-nudge-message.test.ts` — 3 files / 8 tests passed。
- `pnpm --filter @bunshin/database typecheck` — 成功。
- `pnpm --filter web typecheck` — 成功。
- DB統合ケースを追加した。ローカルの隔離Disposable PostgreSQLは利用できないため、統合テストはこの実行では開始していない。Draft PRの `CI / database` 成功を確認後、ここを実際のRun番号付きで更新する。
- GitHub Actions `CI / verify` / `CI / database` — Draft PR作成後に確認し、結果を追記する。
- 実Provider/API呼び出しなし。合成APIキーとモックfetchのみをテストで使用。

## 5. 未解決事項

- 外部公開の可否、実運用でのAI文面品質、Admission値・単価の妥当性は、内部テスターが承認済み設定で評価する必要がある。
- 不明費用を伴う通信断は予約を自動解放しない。運用通知センターで照合するまで同一プログラムの新規予約を保守的に止める既存安全動作を維持する。
- 本番でのMigration・反映・`learningNudges` 切替・運用cron設定は、このPRの対象外であり、別途田中の承認後に行う。

## 6. 次へ進む条件

- Draft PR上で `CI / verify` と `CI / database` が成功し、統合テストRun番号を本報告へ追記する。
- 田中のレビュー・マージ承認を受ける。マージ前に本番へ反映しない。
- 内部テスターによる声かけ品質・費用計上・固定文面フォールバックの確認と、外部公開条件の未完了項目を別途確認する。
