# マナベル PR-H 実装報告

状態: **Draft PR**。実モデル比較の実行・採点は未実施。本番DB・Provider設定・Program設定・Feature flag・Vercelには変更なし。

## 1. 調査した内容

- PR-G報告、評価パケット、AI Providerの既存暗号化設定・予算予約・利用量記録、Personal LearningのProvider/Admission経路を確認した。
- Provider秘密値は画面/APIの暗号化保存と既存の実行時復号を再利用し、新しい環境変数や秘密値の転記経路を追加しない方針とした。
- PR-Gが要求する実会話評価・LINE配信・独立した人手採点は未実施であり、PR-Hのコードテストや評価バッチの用意を実運用品質のPASSとは扱わない。

## 2. 変更したファイル

- `packages/application/src/ai-provider-configuration.ts`、`packages/application/src/learning-ai-provider.ts`、`packages/application/src/index.ts`: Providerモデル能力と学習生成ポートを定義し、Google Providerを追加。
- `packages/database/prisma/schema.prisma`、`packages/database/prisma/migrations/20261019120000_learning_provider_abstraction/migration.sql`、`packages/database/src/provider-configurations.ts`: Google enumとProvider別モデル能力の保存列を追加。既存OpenAI設定は旧来の能力値で埋め戻す追加型migration。
- `apps/web/src/ai/learning-provider-runtime.ts`、`apps/web/src/providers/google-learning-generation.ts`、`apps/web/src/providers/learning-provider-capabilities.ts`、`apps/web/src/providers/openai-learning-lesson.ts`: 学習AIのProvider共通実行経路、Google Gemini構造化出力アダプター、能力検査を追加。
- `apps/web/src/services/personal-learning-*`、`apps/web/src/jobs/personal-learning-evidence-review.ts`: 教材、会話、実践支援、声かけ、本人像推測、証拠レビューを共通Provider設定・予約・精算へ接続。
- `apps/web/app/(app)/admin/ai/provider-configuration-editor.tsx`、`apps/web/app/(app)/admin/connections/page.tsx`、`apps/web/src/http/ai-provider-configurations.ts`: Google Providerと能力設定・接続確認を管理画面/APIに追加。Googleは評価専用で本番実行を拒否する。
- `apps/web/src/ai/learning-model-evaluation.ts`、`apps/web/test/learning-model-evaluation.live.test.ts`、`apps/web/test/fixtures/learning-proposal-evaluation-set.ts`、関連Providerテスト: 任意実行の合成データ比較と回帰テストを追加。
- `docs/ai-training/model-evaluations/README.md`、本報告。

## 3. 主要な設計判断

- 既存Provider管理画面の暗号化済みAPIキー、日次/月次予算、リクエスト費用、予約・実績台帳を再利用する。キー値をソース、コマンド、出力、評価記録に保存しない。今回、実Provider呼び出しは行っていない。
- 既存のOpenAI・GoogleキーはそれぞれのProvider設定で保持する。評価バッチは本番環境で拒否され、専用の非本番Workspace/User UUID、明示確認トークン、上限、価格表、Reviewer labelが揃わない場合も開始しない。
- 比較は固定された架空20ケースをOpenAIとGoogleへ各1回送り、最大40呼び出しとする。各出力をProvider/model名から盲検化し、7観点を人が採点する。応答時間、token数、価格表版、推定費用は別manifestへ記録する。失敗・不明費用は既存ガードに残し、Provider予約を成功扱いで解放しない。
- 実行結果はOSの一時フォルダーにrun単位で作成する。本文を公開PRやCIログへ出さず、実評価の実施者がアクセス制限付きで証跡を保管する。評価実行は通常CIから除外。
- model capabilityをProvider設定へ保存し、機種名の文字列比較に依存しない。旧SNS/研修のOpenAI model allowlistはそのまま維持し、PR-Hの対象外の経路を変更しない。
- Googleは評価専用として本番で有効化・呼び出しできない。migrationを適用する場合も、コード反映より先に追加型migrationを適用し、readiness確認後にコードを反映する。本報告の作業ではmigration適用・本番反映をしていない。

## 4. 実行した検証

- `pnpm test`: 全24パッケージテストタスク成功。Web **514 files passed / 3 skipped、3,678 tests passed / 3 skipped**、Database **209 files / 1,037 tests passed**、Application **144 files / 1,015 tests passed**。テストスクリプトが除外するDatabase integration testは未実行。
- `pnpm typecheck`: 全25タスク成功（learning UI typecheckを含む）。
- `pnpm lint`: 全25タスク成功（architecture boundary、learning UI lintを含む）。
- `pnpm format:check`: 成功。
- `pnpm db:validate`: 成功。Prisma Client生成を実施した。DB URLはローカルdummy値であり、DBへの接続・操作には使っていない。
- migration readinessとDatabase integration testはDraft PRのCIで確認する。実DB・本番DBには接続していない。
- 実AI比較、LINE送信、人手採点、費用発生を伴うAPI呼び出しは未実施。

## 5. 未解決事項

- 実際に有効なOpenAI/Google Provider設定、接続可否、現行単価・上限の人間による確認。秘密値は閲覧・記録せず、保存済み設定を使う。
- 評価パケットに従う実AIの比較・独立採点と結果レビュー。PR-H評価バッチは初回教材提案の合成ケース比較であり、PR-GのWeb/LINE通し会話、人間による実会話評価、学習効果の検証を代替しない。
- Googleを通常利用に拡張する場合の本番Provider審査、秘密設定、費用承認、モデル機能の再確認。現状は本番ブロックを維持する。
- GitHub Actionsの `verify` / `database` 実行結果はPR作成後に追記する。

## 6. 次Phaseへ進める条件

1. Draft PRのコード・migration・本報告とCI結果を田中が確認する。
2. 実モデル比較を行う場合、承認済みの隔離検証環境・保存済みProviderキー・専用Workspace/User・実費上限・採点者・証跡保管先を確認し、評価専用バッチを明示実行する。
3. 比較結果を非公開の証跡と照合して別途報告し、既存のPR-G評価・外部公開Gateと併せてNO-GO/GOを判断する。
4. マージ、本番migration、プログラム反映、Provider設定・feature flagの変更は個別の承認後に行う。

## 7. 実装済み／検証済み／本番反映済み

- 実装済み: Provider共通ポート、評価用Googleアダプター、Provider能力設定、既存Admission/予約台帳との接続、明示実行の盲検比較バッチ。
- 検証済み: 合成ユニットテスト、web全体テスト、型チェック、書式チェック、architecture boundary check。
- 未検証: 実Provider疎通、実AI品質比較、人手採点、実際の費用・時間、LINEの通し評価。
- 本番反映済み: なし。
