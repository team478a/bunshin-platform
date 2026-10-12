# AI Provider原価Admission production限定release

更新日: 2026-10-12

対象branch: `codex/release-ai-cost-admission-20261012`

production基点: `898f7e7ed4b018bc503f8598109e99371da29801`

## 1. 目的

共有OpenAI Providerの実送信前に原価を原子的に予約し、既知原価の保存後だけ精算する仕組みを、main全体を取り込まずproductionへ限定統合する。

本番の現利用者は千ノ国メディアのみであり、原価不明・予算不足・管理設定不備によってAI機能が停止する可能性を運用判断として許容する。登録、管理、既存データ閲覧等の非AI機能を停止させる変更ではない。

## 2. 統合範囲

- Provider別の日次・月次予算へ次回固定原価とOPEN予約額を含める。
- productionではactiveな管理OpenAI設定を必須とし、旧環境変数fallbackを使用しない。
- 当月に原価不明の利用記録がある場合はProvider送信前に停止する。
- OpenAIの各実送信をcall単位で原子的に予約し、利用実績の厳格保存後に精算する。
- 未精算予約を管理Alertへ表示し、既知原価の利用記録と一致する場合だけSUPER_ADMINが理由付きで復旧できるようにする。
- `ai_provider_call_admissions`を追加し、RLSを有効化する。公開policyは追加しない。

Creatomate、FAL、Runwayの既存動画専用費用Policyは変更しない。mainのCI設定、Vercelの差分無視設定、既存production release用Migrationの内容は取り込まない。

## 3. production固有の安全対策

新Migrationは既存production releaseと同じく、次の制限を単一transaction内で適用する。

- lock timeout: 5秒
- statement timeout: 60秒
- idle in transaction timeout: 60秒
- Vercel migration runnerによる構造検査

Migrationは追加table・index・foreign key・check constraint・RLSだけで、既存行の更新やbackfillを行わない。

## 4. 検証

- Prisma schema validation: 成功
- Migration／Provider Database関連: 2 files / 37 tests成功
- Application原価Gate／Alert: 2 files / 24 tests成功
- Web主要経路: 8 files / 172 tests成功
- Web全体: 475 files成功、2 files skip / 3,338 tests成功、2 tests skip
- Application全体: 136 files / 913 tests成功
- Database全体: 200 files / 970 tests成功後、RLS検査1件が全体並列負荷で5秒timeout。該当fileを単独再実行し2 tests成功
- Architecture: 10 tests成功
- 型検査: 25 Turbo tasksとLearning UI成功
- lint: Architecture boundary、25 Turbo tasks、Learning UI成功
- format check、`git diff --check`: 成功
- build: 13 Turbo tasks、Next.js compile、TypeScript、35 static pages成功

本番DB、実Provider、利用者データ、実課金は使用していない。

## 5. release後の確認

1. Vercel Production deploymentとMigrationの成功を確認する。
2. `/api/health/live`と`/api/health/ready`を確認する。
3. 管理画面でactive Provider設定、正の固定原価、日次・月次予算、当月原価不明件数、OPEN予約を読み取り確認する。
4. AIが停止した場合は安全動作として扱い、停止理由を確認する。原価不明を推測で0円に変更せず、Provider送信証跡と確定原価に基づいて別途解消する。

本PRのmergeは、Provider設定変更、AI実送信、参加者登録、実課金、Pilot開始、原価不明履歴の変更を承認するものではない。
