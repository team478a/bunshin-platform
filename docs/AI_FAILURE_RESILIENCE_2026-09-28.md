# AI処理失敗の調査と安定化（2026-09-28）

## 1. 調査した内容

千ノ国メディアの本番DB・Vercelログ・稼働版の実装を読み取り専用で照合した。直近7日間のAI失敗181件は試行記録であり、181人の配信失敗ではない。成功した中間処理と最終失敗が同時に計上される場合もある。

| 分類                                    | 件数 | 確認できた原因                                                                                |
| --------------------------------------- | ---: | --------------------------------------------------------------------------------------------- |
| OpenAI 日次生成 INTERNAL_ERROR          |   84 | 9月22〜26日の企画Providerエラー。古いログにはHTTP status/codeがないため全件の直接原因は未確定 |
| Grok TIMEOUT_OR_NETWORK                 |   60 | 9月28日、20対象のJobが各3回試行。平均30.185秒で既存30秒制限と一致                             |
| OpenAI 日次生成 AI_PROVIDER_UNAVAILABLE |   25 | HTTP 400 invalid_json_schemaと本文生成のtimeoutを確認。各原因への全件配分は未確定             |
| Grok INVALID_RESPONSE                   |    4 | 応答契約に不適合。実応答を保存していないためannotation欠落等の直接原因は未確定                |
| OpenAI 日次生成 NOT_FOUND               |    4 | 同じ1対象でactive content pillar not found                                                    |
| OpenAI 日次生成 VALIDATION_ERROR        |    2 | 品質審査のinvalid quality repair instruction                                                  |
| OpenAI 週間計画 VALIDATION_ERROR        |    1 | 入力検証の不適合。個別の直接原因は未確定                                                      |
| OpenAI 日次生成 CONTENT_REJECTED        |    1 | 品質Gate不合格                                                                                |

JSON SchemaのuniqueItems問題は既存PR #947 / #948で修正・反映済み。古い84件すべてがこの問題とは断定しない。

動画失敗3件は7日間の集計ではなく、9月7日の履歴。設定エラー2件、Creatomate応答不正1件。その後は成功履歴があり、この変更の対象外。

## 2. 変更したファイル

- `apps/web/src/providers/grok-x-trend-research.ts` と関連テスト
- `apps/web/src/providers/openai-mission-content-generator.ts`
- `apps/web/src/providers/openai-mission-quality-checker.ts`
- `apps/web/src/providers/mission-provider-response.ts` と関連テスト
- `apps/web/src/jobs/daily-mission-job-handler.ts` と関連テスト
- `apps/web/src/services/weekly-trend-research.ts` のQuery / Prompt Version
- `packages/application/src/mission-automation-jobs.ts` と関連テスト
- `docs/DECISION_LOG.md` D-128、Roadmap、本文書

DB schema、migration、APIキー、管理者のProvider選択、配信同意は変更しない。

## 3. 主要な設計判断

- Grokは2turn・60秒へ調整。RESTのoutput_text.annotationsのurl_citationと従来citationsを併用し、安全なHTTPS URLを検証・重複除去してから上限を適用する。本文だけからURLを推測しない。不完全・根拠なしの結果は拒否する。
- gpt-5-miniの本文生成・品質審査だけreasoning.effort=lowを明示し、45秒上限を維持。他モデルにはこの設定を送らない。品質・新規性のGateとQuotaを維持し、Prompt Versionを更新する。実品質・遅延の改善は本番観測が必要。
- 品質審査のscore、code、field、message、repairInstructionの制約をSchemaとPromptへ揃える。Domain検証を緩和しない。fine-tunedモデルへの変更はこのSchemaの対応性を別途評価する。
- 本文と品質審査のHTTP・JSON・応答読み取り・timeout/networkを安全に分類し、エラー本文・キー・例外内容を保持しない。未完了の応答から不完全な原稿を返さない。
- Mission Jobの恒久的な参照・入力・品質エラーを再試行しない。HTTP 408/429/5xxと通信障害は既存Backoffを維持するが、insufficient_quotaは429でも再試行しない。
- 代替原稿が品質不合格なら配信しない。ただし元のProvider障害をJob分類へ残し、一時障害の回復と恒久的HTTP 400の停止を正しく分ける。

参照: [OpenAI GPT-5 guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5)、[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)、[xAI citations](https://docs.x.ai/developers/tools/citations)、[xAI max_turns](https://docs.x.ai/developers/tools/tool-usage-details)。openai-platform-api-keyの確認で既存キー継続を承認済み。OpenAI Docs、openai-api-troubleshootingに沿って仕様・障害分類を確認した。実APIへの追加呼び出しなし。

## 4. 実行した検証

- 関連Provider / Pipeline / Diagnosticsテスト: 初回50件成功。Mission Job追加テスト: 最新19件成功。
- `pnpm typecheck`: 25 / 25成功。
- 初回`pnpm test`: Backend含む24 / 25タスク成功。Webは1,540件成功、日次生成の既存2件が5秒制限でtimeout。該当ファイルを制限変更なしで単独再実行し10 / 10成功。全Webの再実行は中断され、完了結果なし。
- 変更した15ファイルのPrettier check成功。
- ローカルlintは中断され、buildは負荷を抑えるため停止した。最終のformat / typecheck / lint / test / buildとDB統合検証は[PR #989のCI](https://github.com/team478a/bunshin-platform/pull/989/checks)を正本とする。未完了を成功として扱わない。
- `git diff --check`: 成功。

## 5. 未解決事項

- 過去84件の詳細原因、Grok4件の実応答、週間計画1件の個別原因は過去ログ不足により確定していない。
- 本番の既存Content Pillar参照切れは未修復。確定計画から参照されるPillarの削除・無効化防止は既に実装済み。古い対象のPillarと確定計画を同一Workspace/Bunshinで照合し、管理者が承認した復旧だけを行う。別のPillarへ自動置換しない。
- 既存DEAD Jobの再投入、LINE再送、失敗履歴の消去は行っていない。
- 本変更はコード修正であり、本番の受信・Provider品質改善の証拠ではない。

## 6. 本番確認へ進める条件

PRのverify/database成功、レビュー・マージ、Productionへの別Release PRとdeployment成功を確認する。その後の実運用でGrok成功率・遅延、本文生成timeout、品質出力validation、最終DEAD数、LINE受信を観測する。過去181件を削除して改善とみなさず、新しい期間と最終Job状態で比較する。
