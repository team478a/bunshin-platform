# AI進化対応 Phase 1 後続実装計画案

基準main: `5b4957f1f2a983aa571ebd72d73ec4d67c3bbe84`。今回の成果物は監査・設計文書のみ。以下は人間承認後の別PR候補で、自動的に着手しない。

## 1. 優先順位・依存・工数

工数は1開発者の概算人日。既存unit/合成テスト中心で、仕様レビューを含む。実API費用、実環境権限待ち、移行、Pilot運用、外部製品契約は別。見積精度は中〜低で、PR着手時に再見積する。

| PR候補                 | 目的 / 変更範囲                                                                                         | 依存                             | 概算      | 受入条件 / 検証                                                                                                              | 禁止・停止条件                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| EVO-01 品質baseline    | Hassy Daily/Weekly、Manaberu Assessmentの固定合成fixture・task別Rubric比較report。test/scripts/docs中心 | 監査review                       | 2–3人日   | Prompt/Model/Rule/fixture版固定、境界/安全/事実/JSON/UNKNOWN試験、旧baseline再現。人間review欄。実API比較は未実施と明示      | 実課金、顧客本文転載、model自動切替不可                  |
| EVO-02 transport安全性 | Weekly/Strategyのtimeout/error分類から既存helper再利用。小PRに分離可                                    | EVO-01で回帰基準                 | 1–2人日   | timeout/429/5xx/未完了/不正JSON/Job重複retry、成否ログの回帰。呼出し上限/既存認可非変更                                      | 全Adapter一括移動、独自Gateway package、無制限retry不可  |
| EVO-03 task互換policy  | planner/assessmentの2用途を先行、設定modelに必要schema/modality/optionsを照合。既存resolver/Portを拡張  | EVO-01、EVO-02                   | 2–3人日   | 未検証model拒否、旧設定互換、pause/予算/seat/admission維持、他task不変、版固定rollback                                       | 全Provider自動Registry/自動価格Router不可                |
| EVO-04 原価信頼性      | AiUsageEventとPilot ai-callの同attempt対応表、集計正本、coverage/UNKNOWN。OEM配賦は先に契約検証         | EVO-01と独立可                   | 2–3人日   | 同attempt二重加算なし、再試行/失敗費用区別、cached/未計測/価格版、所属変更/複数Serviceで不明明示                             | 欠損0円化・請求変更・schema先行不可。保存不足は別PR提案  |
| EVO-05 サービス効果    | Hassy履歴反映と採用/再開の同母数比較、Manaberu3Definitionの本人再現確認の最小契約                       | EVO-01、EVO-04、サービス別review | 各2–4人日 | Hassy単発理由の恒久化なし。Manaberu自己申告/Assessment/Supportを分離、Level UNKNOWN保持、本文Core非保存、tenant/Pilot/V1回帰 | Definition大量追加・Teaching生成・自動Level・SNS代行不可 |
| EVO-06 改善指示draft   | 既存Observation/Triageから匿名化report/人間確認済み実装指示template、まず手動運用                       | export/privacy review、EVO-01    | 2–3人日   | REVIEWED≠APPROVED、source revision一致、scope/禁止/再現/検証固定、raw本文/secret不送信、review記録                           | Dots/Codex自動起動/merge/deployは不可                    |

最優先のEVO-01〜04は約7–11人日。サービス価値検証は別で約4–8人日、改善draftは約2–3人日。合計を固定納期と扱わず、最初のEVO-01終了時に実績から見直す。モデル導入そのものの実API比較・承認・releaseは別作業。

## 2. 短期ゴール

最初のゴールは「モデルを変更する前に、ハッシーとマナベルスタイルで守るべき品質を比較可能にする」。新modelや新Providerを導入することではない。

初期baseline候補はHassyの事実不足/不採用理由/元Goal変更/少数実績/再Brief不一致と、Manaberuの境界回避/評価欠損/誤PASS/前提不足/版不一致。全用途を網羅する巨大Eval Engineではなく、既存testsの失敗例を固定する。

## 3. 外部AI比較・権限・費用

実APIを使う比較は別途人間承認後。task、model ID、Prompt/Rule、匿名化dataset、call上限、timeout、推定費用、credential利用権、結果保管範囲を事前固定する。市場価格を今回変更せず、本番価格設定はUNKNOWNのまま扱う。

比較結果の受入は安全必須項目を全て満たした上で、task別品質/latency/原価/UNKNOWN率を人間が判断する。現行modelが高価すぎるという断定や、安価modelへの自動fallbackをしない。

Codex導入はまず手動の承認済み指示で十分。SDK/CI組込みを追加する場合はrepo限定read/write、隔離worktree/branch、network/secret/費用/timeout、artifact保管、停止、PR承認を別設計する。Dotsは製品特定と公開連携仕様の確認が必要。自社APIへの直接接続を前提とした見積はしない。

## 4. 回帰・release分離

各コードPRはarchitecture check、format、typecheck、lint、対象unitと関連Package回帰、必要に応じbuildを行う。build/MigrationはProduction credentialを使わない隔離環境に限定。今回の文書PRはformat/architecture・既存unitで証拠を残し、CIを別に報告する。

以下は全PRの不変条件: tenant隔離、Owner Knowledge/Memory分離、Scope確認、本人Goal/Plan確認、Definition承認/版、Plan CAS/履歴、Pilot Gate/Hard Cap/Wave/Call Admission、Provider前再認可、V1/LINE安全、OEMのFREE/PAID計測、UNKNOWN不正昇格なし。

#1176 OEMコードとMigration toolingがproduction未反映のため、main全体releaseとは分ける。後続PRがdocs/testsのみでも自動production連携がないことをrelease設定で確認する。文書PRのmergeはproduction Migration/Deploy/Pilot enableの承認ではない。

## 5. 段階ごとの完了・停止

各PRで基準SHA/変更ファイル/正本/認可/検証/UNKNOWN/rollbackを報告する。実装完了、品質承認、PR作成、merge、deploy、Pilot Wave拡大は別判断。まずこの監査PRで人間レビューを待つ。承認なしにEVO-01も開始しない。
