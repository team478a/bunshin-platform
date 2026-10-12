# EVO-03 task互換policy 実装報告

## 基準・設計

- main: `dfcbe39b5ada8446bf36e5afe82f3d8b760d86d5`（#1190 merge、main CI run37872993299成功）。
- branch: `codex/ai-evolution-evo03-task-compatibility`。実装commit/PR/最終CIはPRの追記証跡を参照。
- #1188監査はOPEN、参照commit `41daf16848308051baa548384855b8594eb2b8b2`。監査のEVO-03計画に沿い、既存resolverとAdapterを拡張。新Gateway/Registry/価格Routerを作らない。
- 実装前判断: [EVO03_DESIGN_DECISION.md](EVO03_DESIGN_DECISION.md)。

## 契約と正本

`apps/web/src/ai/openai-task-compatibility.ts`に`OPENAI_TASK_COMPATIBILITY_V1`を定義。`SOCIAL_PLANNER`（Daily/Weekly）と`TRAINING_ASSESSMENT`だけを扱う。

完全一致で扱うmodelは`gpt-5.2`、`gpt-5.2-2025-12-11`、`gpt-5-mini`、`gpt-5-mini-2025-08-07`。任意snapshot、新model、名前の大小文字や空白を自動補正・推測しない。これは公式仕様と合成requestの互換性確認であり、実モデル品質・利用権・原価の承認ではない。

既存`resolveOpenAiRuntimeConfiguration`の管理設定が正本。ACTIVE/環境/接続検査/停止/予算の既存検査後、taskに適合するmodelだけを復号する。不適合な管理設定を旧環境変数で迂回しない。管理設定が存在しない場合だけ旧`OPENAI_API_KEY`/`OPENAI_MODEL`/既定`gpt-5.2`を再利用し、同じtaskチェックを行う。taskを指定しない他用途は従来どおり。

送信時にも実際のrequestを検査する。Responses endpoint、文字列textのsystem/user入力、store:false、strict JSON object、既存schema名、既存optionsのみ許可する。画像/音声/tool/stream/temperature/reasoning等の未レビューoptionを拒否。Assessmentの既存Pilot `max_output_tokens`は維持する。schema本文の全面的な検証/生成は既存Adapter/Packageの責務で、名前だけでモデル品質を保証しない。

## 接続と影響

- Daily Runtime/Weekly Service/Assessment Jobだけがtaskを指定する。Strategy、Content、Quality、reBrief、画像、音声、他Serviceの設定解決は変更しない。
- Daily/Weekly/Assessment Adapterに送信前検査を追加。model/Prompt/schema本文、timeout、retry、usage UNKNOWNを維持。既存の許可済みrequestはJSON内容が同じ。
- 未登録modelや未対応optionsは`CONFIGURATION_ERROR`で停止。model値、回答、Prompt、schema、credentialを例外へコピーしない。Daily/WeeklyでこのエラーをNETWORK_ERRORへ変換しない。
- 既存scope認可、学習境界、AssessmentのPASS/Skill判定、Pilot execution/seat/allowlist、provider直前再認可、Admission、Quota、LINE、OEM課金、Memoryは非変更。
- 既存mockの架空modelは、送信側だけ登録modelへ変更。合成response、期待した評価・usage・失敗条件は維持。登録4modelごとに実Adapter＋注入fetchを通す。実APIなし。

## 検証

- 最初の対象9ファイル104件成功。architecture境界検査10件成功。
- 登録4modelの実Adapterケース追加後は対象9ファイル113件と用語チェック2件、計10ファイル115件成功。全体typecheck（25task＋Learning UI）も成功。lint/format/buildと最終CIはPRの検証追記を参照。
- 全体回帰初回は25task中24成功（24cache）。Web 463ファイル3,223件成功、実API2件skip。既存`posting-partner-terminology.test.ts`1件が5000ms timeout（同期ファイル走査40839ms）となった。タイムアウト値や既存テストを変更せず単独workerで再実行し2件成功（対象test全体の実処理872ms）。内容の不一致ではない。全体初回をPASSと書き換えず、再実行の証跡を分ける。
- 固定EVO-01 baselineテストも全体回帰内で成功。合成PASSを実モデル品質・本番認可の保証としない。

## 未確認・release前条件・rollback

- Production設定/本番model/課金/実API品質/latency/cost/accessは未確認。未登録の旧modelは意図的に拒否されるため、人間が本番設定とPolicyの一致をrelease前に確認する。互換性を理由に本番設定を書き換えない。
- aliasはProvider側で更新され得る。固定snapshotでも実品質、account access、利用停止/廃止状況は別検証。公式Miniページのdeprecated表示は運営確認事項で、自動model移行しない。
- Policyはローカルrequest契約を固定し、モデルの全機能やschema subsetの意味的保証、品質承認、Budget予約の厳密な金額上限を実装しない。
- DB/schema/migration/UI/Provider設定/本番model/Prompt変更なし、新key/実Provider/Production接続/merge/deployなし。
- rollbackは本PRのrevert（DB操作不要）。互換性検査も外れるためrelease/rollbackは人間判断。EVO-04や新model導入へ自動着手せずレビュー待ちで停止する。
