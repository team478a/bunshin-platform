# SOCIAL Decision ReBrief 実装完了報告 2026-10-05

## 結論

SOCIAL Decision Context、品質判定の正規化、本文だけのrepair停止、最大1回のreBrief、改訂後の再品質検査、Generation Context Snapshotへのrevision記録、既存Generationへの固定失敗分類は、既存Daily Mission生成境界へ接続され、本番へ反映済みである。

現行実装の完了判定は「コード、契約、保存境界、品質Gate、CI、本番反映、反映直後の基盤監査まで完了。Hassy固有の発生率・品質率は実利用データ不足により未判定」とする。未判定値を0、成功、PASSEDへ補完しない。

本報告をもって現行SOCIAL Decision/reBrief実装の完結作業を停止する。Problem Contract、Feasibility Contract、Skill Registry、Skill Factory、Codex Adapter、Artifact Contract、Genspark Test等の次期構想は本作業へ含めない。

## 1. Branch Commit Deployment

- 報告作成branch: `codex/social-decision-rebrief-completion-report`
- 報告作成base: `origin/main` / `6eb26f85c4a034df2753134a58a7f161957e4e5e`
- 実装・運用準備: PR #1108、#1109、#1110、#1111〜#1122
- Production反映: PR #1124 / `87a4261cfff1c91458ac9b6a9e32bebdf95f33c8`
- Release履歴同期: PR #1125
- 反映後監査: PR #1126 / main `6eb26f85c4a034df2753134a58a7f161957e4e5e`

PR #1110は#1109をbaseとした積み重ねPRとしてマージされ、その内容は#1111でmainへ回収された。積み重ね元とmain向け回収を別実装として二重計上しない。

## 2. 完了したDecisionと要件

### Decision Context

- ハッシー対象判定、認可、ACTIVE SOCIAL Capability、所有権、Service参加、法的同意、安全条件をBrief生成前に確認する。
- `UNKNOWN`を`PASSED`へ補完しない。READYでない場合はProvider呼出し前にfail-closedで停止する。
- Goal、Strategy、Weekly Plan、Performanceの出所を区別し、旧Goal不明のPerformanceや別Goalの結果を根拠として暗黙利用しない。
- 対象外Serviceと旧SnapshotはDecision blockなしで従来経路を維持する。

### 品質判定とrepair境界

- 品質検査と既存本文検査を`KEEP_DECISION`、`REBRIEF_REQUIRED`、`REJECT_CONTENT`へ正規化する。
- Decision Context対象では、判断理由を固定したまま本文だけをrepairする経路を`CONTENT_REJECTED`で停止する。
- 初回REJECTはreBriefへ変換しない。対象外Serviceの既存本文repairは維持する。

### reBrief

- `REBRIEF_REQUIRED`の場合だけ、専用Provider契約を使って最大1回実行する。
- reBrief直前に認可、Capability、所有権、安全・法的条件を再照合し、すべて`PASSED`の場合だけProviderへ進む。
- 元Goal、Strategy、Weekly Plan等の固定条件は変更せず、topic、angle、personalization source等の変更可能範囲だけを改訂する。
- 改訂BriefからMemory選択、personalization、本文、品質入力を再構築する。初回Brief用の派生入力を流用しない。
- 改訂後は再品質検査を必須とし、REVISE、REJECT、重複、作成指示露出を二度目のreBriefなしでfail-closedにする。

### 保存と運用分類

- Missionとrevision metadataは既存transactionで同時保存する。最終品質失敗時はMissionとSnapshotを保存しない。
- Snapshotには元・改訂decisionの参照、policy、Prompt、model、trigger、最終品質を版付きで保存する。原文を重複保存しない。
- 通常Brief、初回本文、reBrief、改訂本文、改訂品質のquota operation keyとAI Usage idempotency keyを段階別suffixで分離する。
- `DECISION_CONTEXT_REVIEW_REQUIRED`、`DECISION_CONTEXT_BLOCKED`、`DECISION_REBRIEF_FAILED`を既存Daily Mission Generationへ固定分類として保存する。自由入力、本文、内部ID、確認回答は分類欄へ保存しない。

## 3. 変更した主なファイル

### Domain Contract

- `packages/capability-social/src/social-decision-context.ts`
- `packages/capability-social/src/social-decision-planner.ts`
- `packages/capability-social/src/social-decision-repair.ts`
- `packages/capability-social/src/social-decision-rebrief.ts`
- `packages/capability-social/src/social-decision-rebrief-orchestration.ts`

### Daily Mission接続

- `apps/web/src/services/daily-mission-decision-context.ts`
- `apps/web/src/services/daily-mission-decision-content-orchestration.ts`
- `apps/web/src/services/daily-mission-rebrief-runtime.ts`
- `apps/web/src/services/daily-mission-quality-pipeline.ts`
- `apps/web/src/services/daily-mission-generation.ts`

### Snapshotと記録

- `packages/application/src/generation-context.ts`
- 既存Generation Context Snapshot保存adapter
- 既存Daily Mission Generation失敗記録境界

### 文書

- `docs/DECISION_LOG.md`
- `docs/hassy/HASSY_DECISION_CONTEXT_BRIEF_PREPARATION.md`
- `docs/hassy/HASSY_DECISION_CONTEXT_BRIEF_CONNECTION.md`
- `docs/hassy/HASSY_DECISION_REPAIR_GUARD.md`
- `docs/hassy/HASSY_DECISION_REBRIEF_CONTRACT.md`
- `docs/hassy/HASSY_DECISION_REBRIEF_INPUT_CONTRACT.md`
- `docs/hassy/HASSY_DECISION_REBRIEF_ADAPTER.md`
- `docs/hassy/HASSY_DECISION_REBRIEF_FINALIZE.md`
- `docs/hassy/HASSY_DECISION_REBRIEF_ORCHESTRATION.md`
- `docs/hassy/HASSY_DECISION_REBRIEF_PRODUCTION_CONNECTION.md`
- `docs/hassy/HASSY_DECISION_REBRIEF_OPERATIONAL_READINESS.md`
- `docs/hassy/HASSY_POST_DEPLOY_OPERATIONAL_AUDIT_2026-10-05.md`

## 4. 主要な設計判断

- User、Workspace、Bunshin、Service、Capabilityの既存境界を維持し、Decision/reBrief専用の所有モデルを追加しない。
- SOCIAL固有の判断・品質PolicyをCoreへ押し込まず、Capability側のpure contractとWeb側のorchestrationを分離する。
- Provider固有処理をCoreへ混ぜず、通常BriefとreBriefも別のProvider契約として扱う。
- 成功時のDecision revisionは既存Generation Context Snapshot、失敗時の固定分類は既存Daily Mission Generationを正本とする。
- 新Agent、Memory、Analytics、テーブル、migration、UI、通知、画像・動画生成、SNS自動投稿を追加しない。
- revision digestは内容同一性の内部参照であり、匿名化、原文復元、法的証跡を保証するものではない。

## 5. 実行済み検証

接続完了時および運用準備PRでは、次を確認した。

- `pnpm format:check`: 成功
- `pnpm typecheck`: 25 / 25 task成功
- `pnpm lint`: architecture checkを含め25 / 25 task成功。既存`apps/web/app/consent/page.tsx`のunused eslint-disable warning 1件のみ
- `pnpm test`: architecture test 10件を含め25 / 25 task成功
- `pnpm build`: 13 / 13 task成功
- capability-social: 29ファイル、305件成功
- application Snapshot対象: 5件成功
- Web orchestration、runtime、品質、boundary対象: 12ファイル、36件成功
- Web Generation失敗分類対象: 1ファイル、7件成功
- database: 186ファイル、828件成功
- web: 434ファイル、2,791件成功。既存live test 2件はskip
- `git diff --check`: 成功

テストはfake Providerとin-memory fixtureを使用した。実Provider出力の品質や実課金APIをテスト成功から推測しない。

## 6. DB Provider Productionへの影響

### DB

- 新規テーブル、column、index、migrationはない。
- 既存Generation Context Snapshotの任意JSONと既存Daily Mission Generationの失敗分類を利用する。
- 旧Snapshot、Decision blockなしのSnapshot、対象外Serviceとの後方互換を維持する。

### Providerと課金

- 専用reBrief Provider契約と段階別quota／Usage keyを追加したが、ProviderをCoreへ直結していない。
- 実課金APIの呼出し、価格変更、自動Provider選択は行っていない。

### Production

- PR #1124でProductionへ反映済み。
- Deployment `dpl_2JrRCmSnE5x4erBURfmuUxkzj7me`はReadyで、正式ドメインのreadinessはconfiguration、authentication、databaseが`ok`、databaseSchemaが`current`だった。
- 監査時点のCron直近各50件はschedule、runともHTTP 200だった。デプロイ直後の手動疎通期間に各3件、合計6件の401があり、その事実は残す。

## 7. 未検証事項

- 本番Hassy Daily Missionの生成総数、成功数、Decision Context停止分類別件数。
- `DECISION_CONTEXT_REVIEW_REQUIRED`、`DECISION_CONTEXT_BLOCKED`、`DECISION_REBRIEF_FAILED`の実発生率。
- 実Provider出力における初回品質、reBrief後PASS率、最終不合格率、Prompt Version別傾向。
- 品質改善量、利用者成果、原価、長期安定性。
- 本番DBの集計値。監査環境では安全なDB接続経路がなく、SQLは実行していない。

Production runtime logで対象分類が0件だったことは、機能実行、Generation記録0件、安全条件PASSED、成功率100%の証拠ではない。

## 8. 残課題

現行実装を完了させるためのコード残課題はない。運用上は次が残る。

1. Deployment後24〜72時間のreadiness、Cron非200、固定失敗分類の継続観測。
2. 実利用が確認できた場合のみ、既存Service運用権限を再認可する集計経路の必要性を判断する。
3. 集計を追加する場合も、本文、写真、回答、個票IDを返さず、少数セルの再識別防止、監査期間、閲覧主体を先に決める。
4. 実Provider品質評価、通知、管理UI、課金変更は目的と安全条件を分けた別作業として承認を得る。

新しいAnalyticsテーブルや常時収集を、発生率が未確認であることだけを理由に追加しない。

## 9. 次期構想への引継ぎ注意

- 現行PlatformのPhase番号と、別途提示された長期事業ロードマップの段階名を混在させない。
- Capabilityはユーザーへ提供する仕事能力、Providerはその実現手段として区別する。Codex、LINE、画像・動画生成等をCoreの主体にしない。
- Context、Memory、Outcomeを共有する場合も、Workspace、User、Bunshin、Packageの所有境界と明示的な許可を必須とする。
- 「未検証AI生成物でDB更新しない」は、公開、配信、権威ある業務状態の確定を禁止する意味で扱う。Draft、監査ログ、失敗状態、Snapshotの安全な保存まで禁止しない。
- ハッシーのStories、動画、簡易ページ等は将来候補であり、現行SOCIAL完結範囲には含めない。
- 次のArchitecture Gap Analysisを開始する場合は、本報告を安定Baselineとして、人間レビュー済みの独立PRから開始する。

## 10. 完了判定

コード実装、既存生成への接続、安全境界、後方互換、テスト、Production反映、反映直後監査までを完了とする。実利用に基づく品質率・成果率は未判定のまま分離して保持する。

次期構想の設計・実装は、本報告のレビューとマージ後に別作業として開始する。
