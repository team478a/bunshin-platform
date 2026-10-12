# AI進化対応 EVO-01〜05 実装状況

基準mainは `31ea1d20…`、productionは `e5812090…`。#1189〜#1199はMERGEDかつverify/database SUCCESS。実API比較は今回実行していない。

## 完成・未完成

| EVO                          | 完成した範囲                                                                                                                             | 未完成・制限                                                                                                  | production                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| EVO-01 品質比較 (#1189)      | Daily 7 / Weekly 7 / Assessment 10の24固定ケース、validator/rubric、版・digest・model label・失敗/未測定・人間レビューを持つ比較レポート | 実API runner、実品質/時間/原価比較、候補採用判断は未実施。fixtureのFAILは不良例の検知で、モデル不良率ではない | 未配備                                              |
| EVO-02 通信安全 (#1190)      | Weekly/Strategyでtimeout、Abort、安全なHTTP分類、invalid JSON/未完出力拒否、失敗usage。Job側retry/backoff/冪等                           | 全Provider共通Gatewayではない。Retry-After/jitter、送信済みcallの取消、実障害試験は未完                       | 対象EVO差分は未配備                                 |
| EVO-03 互換性 (#1191)        | SOCIAL_PLANNER / TRAINING_ASSESSMENTのモデル・API形式・strict JSON・option allowlist。未知モデル/optionを拒否                            | Strategy/Content/vision等の全taskを覆わない。品質・価格・利用権の承認ではない。独立Model Routerではない       | 未配備                                              |
| EVO-04 原価 (#1192)          | exact usageKey/scopeで2台帳を照合、attempt重複防止、価格snapshot整数計算、UNKNOWN/CONFLICTを分離                                         | 当初は純粋契約のみ。Provider請求書、税/為替、両台帳欠落、OEM別完全配賦は未解決                                | 原価可視化とPersonal Learning Hard Stopのみ限定配備 |
| EVO-05 再現性 (#1193〜#1199) | 比較契約、Privacy、版付き題材、本人履歴projection、review assertion/CAS/audit/revoke                                                     | #1200管理HTTPはOPEN。Approved題材Reader、再実践Assignment Bridge、本人UI、実比較、転用評価は未接続            | 再現性機能は未配備                                  |

## #1199以降に進んだ原価安全性

mainでは#1220〜#1229により、原価UNKNOWN時の停止、次回呼出しの保守的予算判定、production OpenAIを管理設定へ限定、非課金接続確認、Trend/Weekly/Social Insight/商品提案、さらに主要OpenAI送信経路の原子的費用予約が追加された。

各外部callを個別予約し、usage保存後に精算する。保存/精算失敗時はOPENを残し、根拠なしに再送・解放しない。Personal Learningは専用日次Hard StopとProvider全体Admissionの別Gateを通す。

ただしこの共通Admissionはproduction未配備で、本番価格・予算・active設定・既存UNKNOWN/OPEN予約も未確認。Creatomate、FAL、Runwayは既存の動画費用Policyのまま。Provider請求額との照合は未実装である。

## 新モデル採用手順

1. 対象taskと利用者範囲を固定し、モデルID、API形式、schema/option、timeout、出力上限、価格版、アクセス条件を確認する。
2. 現行commit、Prompt/Rule/Dataset/sourceDigestを固定し、EVO-01で現行と候補を同条件比較する。比較不能、必須違反、UNKNOWNは採用保留。
3. EVO-02/03のtimeout、エラー分類、schema、option、未知モデル拒否をfakeで確認し、対象外taskへの波及を列挙する。
4. 人間が予算・データ取扱い・評価基準を承認した後だけ、合成入力の少量実API比較を別作業で実行する。token、latency、error、原価、人間品質評価を保存する。
5. 価格・予算・Admission、監視、停止条件、旧モデルへの切戻し設定を固定し、限定releaseを別承認する。
6. 欠損、創作、誤PASS、越境、費用異常があれば停止・切戻しする。旧比較記録を上書きしない。

今回は手順4以降を実施していない。新モデル採用、配備、自動切替、自動PR/merge/deployは完成範囲に含めない。

## 検証

- EVO-01 baseline/report: 2 files / 35 tests PASS、外部API呼出し0。
- Application原価/OEM/Admission selected: 3 files / 63 tests PASS。
- Web費用Admission/OEM selected: 7 files / 37 tests PASS。
- PR #1189〜#1199、#1220〜#1229のverify/databaseは各SUCCESS。

これらは契約回帰の証拠であり、実モデルの品質、実請求額、本番設定、本番障害時の復旧をPASSにしない。
