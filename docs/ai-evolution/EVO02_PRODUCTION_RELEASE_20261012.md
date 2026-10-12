# EVO-02 production限定release

## 1. 調査した内容

- production基準: `e5812090b6779a99c09b3ae9069df5dcc43e1798`。
- main上の対象: PR #1190、merge commit `dfcbe39b5ada8446bf36e5afe82f3d8b760d86d5`。
- 対象はSNS Strategy生成とWeekly Plan生成のOpenAI通信安全性であり、DB、Migration、認証、課金、モデル設定、Prompt、LINE、Pilotを変更しない。
- productionのVercel buildは既存の限定migration runnerを実行する。今回migration一覧は変更しないため、既存の232件・最新`20261010070000_personal_learning_call_cost_reservation`というpreflight条件を維持する。

## 2. 変更したファイル

- `apps/web/src/providers/openai-strategy-generator.ts`
- `apps/web/src/providers/openai-weekly-planner.ts`
- 上記Providerの通信失敗、timeout、保存抑止、retry分類を確認する既存・追加テスト
- `docs/ai-evolution/EVO02_DESIGN_DECISION.md`
- `docs/ai-evolution/EVO02_IMPLEMENTATION.md`
- EVO-02の合成評価結果
- 本報告

main全体は取り込まず、PR #1190のmerge commitだけをproduction基点へcherry-pickした。

## 3. 主要な設計判断

- StrategyとWeeklyのProvider呼び出しに55秒のtimeoutを設定する。
- HTTP失敗、timeout、network failure、本文読取失敗、空・不正・未完了応答を成功へ変換しない。
- Providerのraw responseや例外messageをcauseへ保持せず、statusと安全なbounded codeだけを残す。
- Adapter内の自動retryを追加しない。Weeklyは既存Jobの上限付きretryと冪等保存を再利用し、Strategyは自動retryしない。
- 既定モデル`gpt-5.2`、環境変数によるモデル指定、Prompt Version、入力、strict schema、`store:false`、usage欠損時nullを維持する。

## 4. 実行する検証

- 対象Provider、Strategy HTTP、Weekly生成、Mission Job分類のテスト。
- `pnpm format:check`、`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`git diff --check`。
- production向けPRのGitHub CI `verify` / `database`。
- マージ後、Vercel Production DeploymentのGit SHAがproduction merge SHAと一致すること。
- `/api/health/live`と`/api/health/ready`が成功し、readinessでDB schemaがcurrentであること。

実OpenAI生成は費用と利用者データを伴うため、このreleaseの自動smokeには含めない。Provider実査は対象、予算、入力、記録方法を確定した別の運用判断とする。

## 5. 未解決事項

- timeoutはクライアント側の待機・転送を停止するが、Provider側で既に開始した処理や課金の取消を保証しない。
- 実Providerのlatency、token、原価、生成品質は今回の公開確認だけでは検証しない。
- OEM登録課金V2の2 migrationは現productionのtransaction-local上限方式に未対応のため、本releaseへ含めない。
- 共有AI原価Admissionは、既存の当月OpenAI usageに原価UNKNOWNがある状態では全共有OpenAIをfail-closed停止し得るため、本releaseへ含めない。

## 6. rollbackと次の条件

- 障害時はproduction上の本release merge commitをrevertし、Vercelでrevert SHAの公開とhealthを確認する。DB rollbackは不要。
- rollbackするとStrategy / Weeklyのtimeoutと安全なerror分類も旧状態へ戻るため、health正常でもProvider障害時の安全性低下を明記する。
- 公開後は実利用のProvider失敗率、timeout、重複保存がないことを個人情報を含まない運用ログで観測する。
- OEM統合はbounded migration設計、共有原価制御は当月UNKNOWNの解消方法をそれぞれ別releaseとしてレビューする。
