# マナベル PR-D-3b 実装報告：本人入力とAIによる学び方の推測

状態：Draft。田中の確認前にマージしない。本番migration適用・プログラム反映・`multiTopic`変更・保持Cron有効化は行っていない。

## 1. 調査した内容

- v4本線化指示書、決定記録（決定2・6）、AI進化方針書、PR-D-3b指示書、およびD-1〜D-4の既存実装を確認した。
- PR-D-3（#1334）の抑止記録、拒否状態保護、最大20件の本人像コンテキスト、決定6のExport・一括削除・保存期間処理、既存のAI Admission・価格台帳・暗号化Provider設定を再利用した。
- 保存済みOpenAI APIキーは新規発行・表示・ローカル保存せず、実行時に既存の暗号化Provider設定から解決する構成とした。ローカルから本番用のモデル・価格・Admission設定を確認できないため、実API呼び出しは行っていない。

## 2. 変更したファイル

- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/persona/page.tsx`、`persona/persona-card.tsx`、`learning-request/page.tsx`、`apps/web/src/services/personal-learning-persona-consent.ts`: 保存済み実践回答が初期値3回（環境設定`PERSONAL_LEARNING_PERSONA_INVITATION_AFTER_ANSWERS`で1〜100に変更可）に達した後、学習画面にオプトイン案内を表示。本人入力欄、同意状態、停止時の保持／削除選択、30日間の案内停止、本人像の確認・修正・拒否・削除を追加。文面と同意版は1か所に集約した。
- `apps/web/src/http/personal-learning-persona.ts`: 本人認証と同じサービス・ワークスペース・本人・受講の境界下で、同意、本人入力、案内停止、本人像の確認APIを接続した。
- `apps/web/src/providers/openai-learning-persona-inference.ts`、`apps/web/src/services/personal-learning-persona-inference.ts`、`apps/web/src/ai/openai-task-compatibility.ts`: 成功した相談・実践の後だけ、同意済み本人について新しい記録を最大5件まで処理するAI推測処理を追加した。保存済みAPIキー、既存モデル設定、Admission、価格台帳、使用量計測を再利用し、受講1件あたり1日1回の冪等キーを使用する。
- `packages/capability-training/src/personal-learning-persona-policy.ts`: AI推測キーを5項目に限定し、本人入力キーを別管理した。許可リストと敏感情報検査をRepositoryとProvider出力検証の両方で適用する。
- `packages/database/prisma/schema.prisma`、`packages/database/prisma/migrations/20261018100000_personal_learning_persona_opt_in/migration.sql`: オプトイン日時・同意文版・案内抑止・本人入力項目を同一Membershipに結び付けて保存するテーブルを追加した。
- `packages/database/src/personal-learning-d.ts`、`personal-learning-text-operation.ts`、`personal-learning-participant-admin.ts`: 同意がない間の読込・保存を拒否し、拒否済み属性と削除抑止を維持する。本人入力はAI推測で上書きできない。運営者向けには内容ではなくオプトイン状態・項目数だけを返す。
- `packages/database/src/training-personal-data-export.ts`、`training-personal-data-deletion.ts`、`training-retention-snapshot.ts`、`training-retention-execution.ts`、`packages/capability-training/src/personal-data-retention.ts`: D-4と同じく設定OFFでも、既存の本人像プロファイルがあればExport・本人一括削除・保存期限処理の対象に含める。
- 関連テスト：`apps/web/test/openai-learning-persona-inference.test.ts`、`personal-learning-persona-consent.test.ts`、本人像UI・既存Providerテスト、`packages/capability-training/test/personal-learning-persona-policy.test.ts`、`packages/database/test/personal-learning-d.integration-cases.ts`、運営者画面テスト。

## 3. 主要な設計判断

- 「使う」を選ぶ前は推測もAIへの記録送信も行わない。AI呼び出しは実践回答または相談への通常応答が成功した後に限定し、追加推測に失敗しても通常の研修応答を失敗させない。
- 許可する推測キーは `learning_purpose`、`explanation_style`、`learning_pace`、`stated_goal`、`ai_tool_familiarity` のみ。会社名・年代・業種職種キー、未知キー、空文字、長さ超過はRepositoryで拒否する。推測結果は未確認で保存し、根拠イベントID・種別・日時を付ける。
- 他人の個人情報、連絡先、健康・障害・診断、宗教・政治、民族・国籍、性的指向、収入・資産、住所、具体的な取引先名らしい値は、推測値と本人入力値の両方で保存前に拒否する。送信元記録も同じ検査で疑わしい記録全体をAI送信から除外する。通常語の部分一致では拒否しないようにし、「毎日がんばりたい」「取引先への提案資料を作りたい」は保存・AI送信対象となるテストを追加した。郵便番号は「〒」付きまたはハイフン形式のみ検知し、ハイフンなしの7桁数字や「〒」単独は拒否しない。取引先名は「取引先」だけでは拒否せず、法人格・会社種別を含む具体的名称が続く場合を対象とする。検査はパターンベースであり、辞書にない人名・住所表現や社名の見逃しがあり得る。公開前の専門家レビューを残課題とする。
- D-3のAI受け渡し取得は、拒否・削除抑止を除き、確認済み優先・新しい順、最大20件。本人入力情報も確認済みとして加えるが、入力項目の保存チェックが外れた場合は削除する。
- 依頼書の「オプトイン前に記録から作った推測例を表示」と「オプトイン前は推測処理もAIへの受け渡しも動かさない」は両立しないため、このDraftでは前者を実行せず、記録由来ではない汎用例を明示して表示する。記録由来の例をオプトイン前に生成するかは決定者の回答待ちであり、承認なしに有効化しない。
- 同意・本人入力データは同一Membershipの本人像プロファイルとして保持し、既存の決定6保持期間に従う。本人像項目自体は既存のD系列ルールで、本人利用から2年または受講終了から1年の早い方（有効な兄弟受講があればサービス単位の有効性を維持）で扱う。
- AI推測は入力記録1,000 UTF-8 bytes以下（1,000 tokensより保守的な上限）・出力300 tokens以下。全要求は既存Admissionの `maxRequestBytes` にも従う。AI本人像推測に限る追加月額上限は、受講者1人あたりUSD 1、サービス全体USD 5。上限到達、料金・キー・Admission不在、設定不一致、残高予約不能時は推測のみ停止し、研修本体は継続する。
- 実際のモデル名と入出力単価は、実行環境の `PERSONAL_LEARNING_LESSON_ADMISSION.model` と `PERSONAL_LEARNING_AI_PRICING` の有効な価格行から実行時に解決する。現在の作業環境では値を確認できず、架空価格を報告しない。CIで合成設定・実API呼び出しを使わない。
- `multiTopic` の初期状態はOFFのまま。本番順序は、承認後に既存のD-1〜D-4 migrationと本PRのmigrationを適用・検証し、その後にプログラムを反映する。cron・フラグ変更・Production適用は本PRの作業外。

## 4. 実行した検証

- `pnpm --filter web test`: 505ファイル・3,631テスト成功、2ファイル・2テストskip。本人像Provider/UI、既存の会話・教材Providerを含む。
- 対象Webテスト（本人像Provider/UI、既存会話・教材Provider）: 4ファイル23テスト成功。
- `personal-learning-persona-consent.test.ts`: 初期3回、範囲内の設定変更、無効設定時の安全な初期値を確認。
- `pnpm --filter web typecheck`: 成功。
- `pnpm --filter @bunshin/database test`: 208ファイル・1,026テスト成功。うち保持・Export・一括削除・新規RLS・最新migration readinessの対象テストを含む。
- `@bunshin/capability-training` の本人像ポリシーテスト：11テスト成功。通常語・社名の具体形・郵便番号の境界を追加確認。
- 本人像Providerの対象テスト：11テスト成功。「毎日がんばりたい」「取引先への提案資料を作りたい」が入力ソースとしてAI要求本文に残ること、個人情報らしい値が除外されることを確認。
- `pnpm --filter @bunshin/capability-training typecheck`: 成功。
- `pnpm --filter @bunshin/database exec prisma validate`: 非秘密のローカル placeholder URLを設定して成功。実DBへの接続・migration適用はしていない。
- `pnpm --filter @bunshin/database exec tsc --noEmit`: Prisma Client生成後に成功。非秘密のローカル placeholder URLのみ使用。
- GitHub Actions CI run `39084381337`：`verify` 成功（format/typecheck/lint/test/E2E/learning UI/build）、`database` 成功（Prisma validation、CI用DBへのmigration、schema readiness、DB統合テスト）。初回run `39083512243` ではDB統合テスト4件の不一致を検出し、削除件数・確認済み入力の優先順・台帳上のユーザー識別子を修正。次run `39083830420` ではDB統合テスト成功、lintで型アサーション1件を検出し修正。最終runで両checkが成功した。
- ローカルDB統合テストは実行せず、CI専用DBで実行した。本番DBへは接続していない。
- `git diff --check`、Prettier check、変更対象ESLint：成功。

## 5. 未解決事項・次の条件

- オプトイン前に表示する例は一般的な例のままとし、記録由来の例を作らない決定を反映した。
- 実行環境の具体的なモデル・価格、Admission設定値は運用管理者による確認が必要。未設定時はfail-closed。
- 敏感情報パターン検査は完全ではない。公開前に専門家による説明文レビューと運用テストが必要。
- CI `verify` / `database` を含むDraft PRの実装報告を田中が確認するまでマージしない。本番migration・プログラム反映・フラグ変更・cron有効化は個別の明示承認まで行わない。
