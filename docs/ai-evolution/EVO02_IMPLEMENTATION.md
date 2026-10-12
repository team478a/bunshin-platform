# EVO-02 Weekly / Strategy transport safety 実装報告

## 基準と範囲

- 基準main: `d761d233d33274c3e1010a0bd15958d796b5e346`（EVO-01 #1189マージ）。
- branch: `codex/ai-evolution-evo02-transport-safety`。
- 実行コードcommit: `61f57a5ce16f4fac4135b3c490a0c069c38e7cd6`。後続は評価結果・文書・ログ取得assertionの補強のみ。
- PR: [#1190](https://github.com/team478a/bunshin-platform/pull/1190)。merge/deployはしない。
- #1188監査版: `41daf16848308051baa548384855b8594eb2b8b2`。着手時OPEN。監査文書を本PRへ複製しない。
- 実装前判断: [EVO02_DESIGN_DECISION.md](EVO02_DESIGN_DECISION.md)。最新mainとの差はEVO-01評価基盤の追加で、対象Providerの既存構造は監査と一致。

## 調査・再利用・変更

WeeklyとStrategyは直接fetchし、timeoutなし、HTTP失敗のraw errorまたはJSON.parse例外をcauseへ保持していた。Dailyは55秒のsignalを持ち、既存`mission-provider-response.ts`はstatus/body/JSON/未完了応答を安全に扱う。

変更した実行コードは`apps/web/src/providers/openai-weekly-planner.ts`と`openai-strategy-generator.ts`だけ。両Adapterで既存reader/transport failureを再利用し、55秒のsignalを追加した。共有helper、Daily、Assessment、Domain、Application Job、認可、quotaは変更しない。

HTTP失敗は`AI_PROVIDER_UNAVAILABLE`へ統一し、statusと安全なprovider codeだけ保持する。timeout/network/body read/空body/不正JSON/未完了status/出力不正を成功として返さない。messageは既存helperの汎用文言を使用し、raw message/bodyを渡さない。エラーcodeの変更は意図的（従来INTERNAL_ERROR→AI_PROVIDER_UNAVAILABLE、既存HTTP mappingでは503）。

モデル既定値`gpt-5.2`、設定モデルの受渡し、Prompt Version（Weekly `weekly-planner-v8-goal-outcomes`、Strategy `social-account-strategy-v1`）、Prompt本文、入力、strict schema、store:falseは維持。usage欠損はnullのまま。輸送層でDomain schema全体を再定義せず、既存Generate/Createの品質・構造・所有境界検査を維持する。

## 再試行・保存・ログ

Adapterは1試行1fetchで、内部retry/fallbackを追加しない。Weeklyは`ExecuteMissionAutomationJob`/`FailJob`のscope再検証、maxAttempts、指数backoffを再利用。401等は非再試行、429/5xx/timeoutは上限付き再試行、`insufficient_quota`は非再試行。上限到達時はnextRetryAt=null。

Weekly生成Serviceの失敗時は計画保存なし、FAILED usage（token不明=null）を記録する。成功済み週を同じJobから再実行すると既存計画を返し、Providerを呼ばない。Strategy HTTPは失敗時にPROPOSED Strategyを保存しない。既存成功/失敗計測処理を変更しない。

## テスト

追加/更新: 両Adapterテスト、共通テストcase helper、Weekly生成Service、Strategy HTTP、ApplicationのWeekly Job分類テスト。

- 400/401/403/408/429/500/503、HTML/空/不正JSONのHTTP error body。
- quota code、危険/長過ぎるerror code破棄、raw message非保持。
- incomplete/failed envelope、欠損output、不正output JSON/null/array。
- AbortError/TimeoutError/network、本文読取失敗。
- ヘッダー前/本文読取中の同じ55秒signalによる停止（注入fetch、待機をabortするテスト）。
- usage UNKNOWN、default model/store:false、既存strict schema/Prompt/context/usage回帰。
- 失敗出力の非保存、本文なしFAILED usage、Strategy失敗の非保存。
- Weekly分類・scope再検証・retry上限、既存週の重複生成防止。

検証結果:

- 全体回帰: `pnpm test:architecture`（10件）と`turbo run test --concurrency=1 -- --maxWorkers=2`成功、25/25 tasks。Web 463ファイル3,186件成功・実API用2件skip、Application 135ファイル867件、DB unit 192ファイル909件。研修Package 25ファイル288件。既存認可/Pilot/Provider Gate/LINE隔離/quota/生成/評価/冪等性を含む。
- ログsinkがconsole.errorであることを確認し、取得assertionを補強した最終Weekly Serviceテスト16件も別実行成功。空のmockを根拠に非漏洩と判定しない。
- 固定評価2ファイル35件成功。24ケース観測PASS/FAIL/UNKNOWN=10/13/1、期待外れ0、externalCalls=0、COMPARABLE/判定変更0、model/Prompt変更なし、品質/原価UNKNOWN。
- 保存結果: [report](evo02-results/evo01-dff740ed-fce7-40c8-b4e7-cc6547c390bd/report.md)、[JSON](evo02-results/evo01-dff740ed-fce7-40c8-b4e7-cc6547c390bd/report.json)、[比較](evo02-results/evo01-dff740ed-fce7-40c8-b4e7-cc6547c390bd/comparison.json)。コードcommitは上記61f57a5c、dirty=false。ID/Ruleは既存EVO-01 runnerの版を維持。旧baselineは上書きしない。
- architecture:check、全体format:checkと追加結果/最終テストのformat検査成功。
- [GitHub CI run 37871154096](https://github.com/team478a/bunshin-platform/actions/runs/37871154096): verify成功（8m38s）、database成功（1m26s）。typecheck/lint/test/既存Learning UI E2E/build、使い捨てPostgreSQL serviceによるDB統合を含む。このrunは`cd275139`時点（実行コードは最終版と同一、最終ログassertion/報告追記前）。最終HEADのCIはPR checkを別確認する。

初回変更ファイルlintではテストの型指摘2件を検出し、typed inputとError rejectionで修正した。既存timeoutを延長せず、テスト並列数を制限した。合成テストを実Provider品質・実認証・本番安全性の保証にしない。

## 未解決・次工程の条件

- 実Providerのlatency、token、原価、モデル品質、Productionでの動作は未測定。本番反映なし。
- Abortはクライアント待機/転送の停止で、送信済みリクエストのProvider側処理/課金の取消保証ではない。既存Organization quotaは失敗時予約をRELEASEDにする仕様であり、実課金額の上限とは異なる。本PRでは変更しない。
- 既存JobはRetry-After/jitterを扱わず、quota codeは`insufficient_quota`のみ特別扱いする。公式の新しいcredit/spend/usage error codeへの追加対応は未実装で、現状は429のbounded retryになる。共有Job/課金制御を広げる場合は別レビュー。
- 既存fetchを無視する独自transportを注入した場合のtimeout保証は対象外。productionは標準fetch。
- EVO-03モデル互換性/config正本の整理は次候補。人間レビュー後の別指示まで着手しない。

## 影響・rollback

DB/schema/migration、UI、Provider設定、本番モデル、Prompt、OEM課金、Memory、Pilot/Call Admission、LINE、V1には変更なし。新Gateway/packageなし。実API、キー作成、Production接続、merge/deployなし。

rollbackは本PRをrevertして旧Adapterへ戻す。DB操作不要。ただし旧版はtimeoutなし/raw error保持に戻るため、本番適用/rollbackは別の人間判断。
