# AI進化対応 共通基盤の最小改善設計案

基準main: `5b4957f1f2a983aa571ebd72d73ec4d67c3bbe84`。**人間レビュー待ちの提案**。既存Architecture Principles/Decisionを上書きせず、今回は実装しない。

## 1. 設計判断案

独自汎用AIや巨大Gatewayではなく、既存Port/Adapter/Program Runtimeに不足契約を小さく足す。「外部AIが改善するとサービス能力が改善する」を目指すが、model文字列の更新だけで良くなったとは判断しない。

Outcome First、AI is Replaceable、MVP First、Capability/Provider分離、Owner KnowledgeとBunshin Memory分離、1 User:N Bunshin、Workspace/User/Bunshin/Service/Package Isolationを維持する。Genspark Testは既存Principlesにある人間レビューGateを使い、自動採点しない。採用後の詳細Decisionは後続PRで `DECISION_LOG.md` へ記録する。本案そのものは承認済みDecisionではない。

## 2. 責務の対応

| 責務                          | 置き場所/再利用                                 | 追加候補                                                   | 置かないもの                                               |
| ----------------------------- | ----------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| 利用者/Service/Capability認可 | Application use case、scoped DB、既存Pilot Gate | 対象taskへの明示scope、既存gate receiptの再検証            | Providerが認可を代行、model availabilityを利用権にすること |
| 何を要求するか                | SOCIAL/AI_TRAININGの既存Port/契約               | taskと必要な機能の小さいenvelope                           | vendor名・Prompt本文をCore Domainへ混在                    |
| model/configを選ぶ            | runtime resolver + Provider Configuration       | 検証済みtask→model/parameter policy。最初は2taskの静的対応 | 未使用plugin SDK、動的Schema Engine、全model自動Discovery  |
| HTTPを実行                    | web Provider Adapter/mission response helper    | timeout/エラー/usage抽出の再利用helper                     | Provider前のAdmission/Gateをhelperで削除                   |
| 出力を検証                    | Package validator/品質/Rubric                   | task別比較dataset、schemaと意味の独立合否                  | 万能評価基準、modelの自己評価だけで合格                    |
| 計測                          | AiUsageEvent/Pilot ai-call、pricing registry    | 同attemptの集計正本、coverage、scope帰属                   | Prompt/回答/成果物本文のAnalytics複製、UNKNOWNを0円化      |
| 改善                          | Observation/Feedback/Triage                     | 匿名化した承認指示draft、修正前後比較                      | raw log→Codex自動実行→merge/deploy                         |

既存のLearning Routerは「次に学ぶDefinition」の選択。提案するmodel policyは「評価等の処理にどの外部能力を使うか」の選択。Capability Contractは業務機能の付与。model modality表は別責務で、同じ名前に統合しない。

## 3. 実行境界

既存入口で認証/tenant/Service/契約/Capabilityを検証し、Packageが最小入力を組み立てる。検証済みtask policyでProvider設定を解決し、予算・停止・Pilot seat/Call Admissionを実行直前にも再検証する。Adapterが送信し、schema→Package意味/安全検証→利用可能な結果、という順序を保つ。失敗/不足はUNKNOWNまたは既存失敗状態で止める。

transport共通化後も、Hassyは「考える支援と本人採用」、Manaberuは「本人がCreator、Teacherは代行しない」というDomain判断を保持する。共通化対象は通信・計測の機械的責務で、Service目的や評価の意味ではない。

model policyの候補項目はtask、Provider reference、model、必要modality/schema、許可options、timeout/入力/出力上限、policy version。用途が証明できないfieldやService/OEM別overrideは初期実装しない。既存model設定との優先順は後続PRで固定し、scope不明時に全体設定へ危険にfallbackしない。

既存環境変数fallbackとの互換は明示的に試験する。停止/予算超過/Admission拒否の場合の別Provider fallbackは禁止する。料金・model IDは外部仕様を確認し、人間がreviewした版固定設定を正本にする。新modelの自動承認はしない。

## 4. モデル切替のGate

1. 旧model/Prompt/設定版、対象task、匿名化dataset、baselineを固定。
2. schema/parameter/modality/timeout/error/未知出力の互換試験。合成試験は実model品質の代替ではない。
3. 実API比較をする場合は別途実課金・データ送信・費用上限の人間承認。利用ログ全文をdatasetへコピーしない。
4. Hassy: 未確認事実/誇大表現/不採用理由の誤利用なし、利用者採用を支援。Manaberu: boundary bypassなし、Rubric妥当、本人能力の誤確定なし。
5. 品質、価格版付き原価、latency、失敗率、欠損率を別集計。安全条件を品質平均で相殺しない。
6. 人間がtask単位で承認、別releaseで限定切替。rollbackは旧設定版へ戻す。schema変更/本番Migrationは別Gate。

## 5. MemoryとOEM

共通化するのはscope付き参照/projectionであってMemory本体の統合ではない。利用者の会社情報、Bunshin履歴、研修回答、Owner Knowledgeは各正本を維持し、許可された必要項目だけ利用する。

OEM請求とAI原価は分離する。Hassy FREE=実測利用、PAID=登録、Manaberu=PAID登録のみを維持する。原価の帰属は呼出し時点のService/Enrollment/Workspace関係と期間に基づく。後から所属が変わっても過去原価の付替えをしない。現行usageに足りない参照を調べてから保存拡張を審査し、Event payloadへ全業務本文を押し込まない。

## 6. Dots / Codex運用案

Dots製品は未確定。OpenAI dotsである場合の公開資料は [現状監査の外部仕様](CURRENT_STATE_AUDIT.md#7-dots--codexと公開仕様) を参照する。自社APIから直接利用可能と仮定しない。最初は人間が匿名化reportを渡して整理結果をreviewする運用で十分。

最小handoff draft: 問題分類/重要度、集計母数・期間、source rule/revision、匿名の再現fixture、期待値、許可repo/base SHA/branch/変更範囲、禁止操作、検証、完了条件。個人ID/会社名/自由文/秘密値/Provider responseは外部成果物へ入れない。内部の証拠参照は権限付きで保管する。

既存loggerのsecret-key redactionだけでは一般の業務秘密を消せない。外部exportはallowlist projectionと人間の内容確認を必須にする。ログ中の命令をシステム指示と扱わず、不具合再現データとして分離する。

| 段階             | 自動化候補                     | 人間判断/別権限                                               |
| ---------------- | ------------------------------ | ------------------------------------------------------------- |
| 観測の集計       | 既存scoped collector、分類候補 | 個人情報/外部送信可否、分類の確定                             |
| 改善指示draft    | templateへ再現・検証を整理     | APPROVED evidence/revision、実装着手承認。REVIEWEDでは不可    |
| Codex実装/テスト | 承認scope内の隔離branch、CI    | repository permission、secret/network/費用上限、例外scope変更 |
| PR/結果確認      | diff/test report/比較draft     | PR作成の許可、実装review、価値/失敗の判断                     |
| merge/deploy     | 今回対象外                     | 必ず別承認、production release/backup/migrationのGate         |

アカウント権限・利用枠・料金は導入前に確認する。Codex SDKが存在することと、Repositoryから自律運用する必要性は別。初期フェーズでSDK接続を前提にしない。

## 7. 非採用・延期

万能Chat、統合Memory、独自汎用AI、動的plugin Marketplace、全Provider対応、Level自動判定、Teaching自由生成、自動改善/merge/deploy、新画像/動画学習Definition、旧repo再利用は今回行わない。実装順序は [Implementation Plan](IMPLEMENTATION_PLAN.md)。
