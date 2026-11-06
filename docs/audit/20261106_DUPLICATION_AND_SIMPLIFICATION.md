# 重複・過剰管理・簡素化監査

機能状態の正本は[機能台帳](20261106_FUNCTION_INVENTORY.md)。新しい共通管理基盤を作らず、既存画面の再利用、導線整理、入力削減、既存API統合の順で扱う。

## 集計

| 状態                             |   件数 | 意味                                                |
| -------------------------------- | -----: | --------------------------------------------------- |
| 公開本番反映済み・実運用検証待ち |     10 | main実装と公開buildを確認。追加開発ではなく利用確認 |
| 部分実装                         |      7 | 既存基盤はあるが表示/正本/互換入口が未整理          |
| 未着手                           |      5 | 効果確認後に最小変更を判断                          |
| 保留                             |      4 | 利用実績/依存/契約が分かるまで変更しない            |
| **合計**                         | **26** | 重複12 + 簡素化14                                   |

「本番反映済み」は公開artifactへのコード反映であり、実運用で改善効果を確認した意味ではない。対応完了と判定した項目は0。

## 重複・統合候補 12件

| ID  | 問題の具体例                                                                | 対象画面・コード                                       | 状態                                            | 影響                         | 最小の改善方法                                                | 規模       | 既存機能への影響               | 優先 |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------- | ---------------------------- | ------------------------------------------------------------- | ---------- | ------------------------------ | ---- |
| D01 | Workspace版とService版のBunshin/SOCIAL APIが併存                            | `api/workspaces/*/bunshins`、`api/services/*/bunshins` | 部分実装                                        | 保守時に片側だけ修正しやすい | Application/Repositoryを正本と明記しrouteは互換adapter化      | 中         | 外部client互換を維持           | P2   |
| D02 | Daily Mission/variant/decision/post-recordがWorkspace/Serviceで反復         | 両API tree、`service-daily-missions.ts`                | 部分実装                                        | 挙動差とtest重複             | 既存service handlerへ内部委譲。route削除はしない              | 中         | idempotency/scopeを維持        | P2   |
| D03 | Onboarding、Training profile、Member product profileで同じ企業/目的を再入力 | onboarding/profile画面                                 | 未着手                                          | 離脱と値の不一致             | 同一Serviceの既存回答を初期値表示。自動同意/他Service流用なし | 小〜中     | 所有境界は不変                 | P2   |
| D04 | Owner Knowledge、Group Knowledge、Product Pack assetに同じ商品素材          | knowledge/product画面、各Repository                    | 部分実装                                        | 更新漏れ                     | 所有物と配布snapshotの関係を表示し既存Grantを再利用           | 中         | snapshot互換維持               | P2   |
| D05 | Social、Campaign、Member Product activityが同じ投稿を別記録                 | weekly report/campaign/member product                  | 未着手                                          | 集計差                       | 原記録IDを用途別projectionへ関連付ける。新台帳は作らない      | 中         | 過去行は変更しない             | P2   |
| D06 | Usage、Feature usage、AI usage、monthly usageに同じ行動を別投影             | usage/AI/billing画面                                   | 部分実装                                        | 人数・原価の説明が難しい     | 請求・原価・分析それぞれの正本と算出元を画面表示              | 中         | 請求snapshot維持               | P1   |
| D07 | Point、credit、badge entitlement、referral rewardが特典として並立           | points/badges/referrals                                | 保留                                            | 利用者が残高を理解しにくい   | 保存統合せず利用者向け一覧だけ統合                            | 中         | 金銭/権利台帳は統合しない      | P2   |
| D08 | 共通LINE、Group LINE、Service link、通知設定が分散                          | admin/manage LINE画面、line Repository群               | 部分実装                                        | 正常チャネルを異常表示       | channel別status projectionを既存読取から作る                  | 中         | secret/接続状態は不変          | P1   |
| D09 | 本部53、Service40、OEM5画面でmember/usage/billing導線が反復                 | admin/layout、manage home、organization home           | 公開本番反映済み・実運用検証待ち（#1449/#1451） | 日常入口が多い               | 実利用のクリック数を測り、残る重複linkだけ整理                | 小         | routeは削除しない              | P2   |
| D10 | 固定教材と動的学習でprofile/current/progressが一部重複                      | Training画面/API                                       | 保留                                            | 提供方式の誤説明             | Enrollment/回答/原価だけ共通、教材状態は分離維持              | 小（文書） | 動的Gateを固定教材で迂回しない | P1   |
| D11 | Campaign、Content Pillar、Weekly Plan、Missionの計画階層が見えにくい        | campaign/planning/mission画面                          | 保留                                            | どこを直すか迷う             | 新modelなしで親子/版リンクを表示                              | 中         | 既存計画履歴維持               | P2   |
| D12 | LINE配信の確認・取消・再送が別画面/操作だった                               | line broadcast管理、retry API                          | 公開本番反映済み・実運用検証待ち（#1457/#1458） | 再送重複の危険               | 実データで一画面操作を確認。新retry基盤不要                   | 小（確認） | 冪等性/宛先再照合維持          | P1   |

## 過剰管理・制限の改善候補 14件

| ID  | 問題の具体例                                                                  | 対象画面・コード                  | 状態                                            | 影響                            | 最小の改善方法                                       | 規模       | 既存機能への影響               | 優先   |
| --- | ----------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------- | ------------------------------- | ---------------------------------------------------- | ---------- | ------------------------------ | ------ |
| S01 | 本部/Service/OEM navigationで日常操作が埋もれる                               | admin layout/manage home          | 公開本番反映済み・実運用検証待ち（#1449/#1451） | 入口探索                        | 実利用で残る迷いだけ修正                             | 小         | route/権限維持                 | P2     |
| S02 | 通常保存にも理由入力を求める                                                  | routine settings forms            | 公開本番反映済み・実運用検証待ち（#1453）       | 保存負担                        | 通常変更は差分から理由を自動記録。重要操作は確認維持 | 小         | 重要監査維持                   | P2     |
| S03 | 学習承認でSHA/証跡キーを手入力                                                | learning definition review        | 公開本番反映済み・実運用検証待ち（#1454）       | 転記ミス                        | サーバー取得済み証跡を表示し承認意思だけ入力         | 小（確認） | revision/digest再検証維持      | P1     |
| S04 | LINE配信確認と失敗分再送が分散                                                | line broadcast history            | 公開本番反映済み・実運用検証待ち（#1457/#1458） | 重複予約                        | 実データで取消/再送を確認                            | 小（確認） | 宛先/費用/冪等性維持           | P1     |
| S05 | AI日額/月額/予約額が同列表示                                                  | admin AI provider editor          | 公開本番反映済み・実運用検証待ち（#1482）       | 通常判断が難しい                | 月額中心、高度安全設定へ分離済み。表示確認のみ       | 小（確認） | fail-closed維持                | P0支援 |
| S06 | 原価未確定を1行ずつ精算                                                       | AI cost reconciliation            | 公開本番反映済み・実運用検証待ち（#1481/#1482） | Hassy復旧が重い                 | 既存group一括入力でtokenなしFAILEDだけ精算           | 小（運用） | 成功/tokenあり0円拒否維持      | P0     |
| S07 | 設定操作の同時実行制限がServiceをまたいで競合                                 | managed policy load scope         | 公開本番反映済み・実運用検証待ち（#1461）       | 無関係Serviceが待つ             | Service scope化済み。429/競合を実運用確認            | 小（確認） | bounded retry/DoS制御維持      | P2     |
| S08 | Service設定画面ごとにrole判定が不一致                                         | settings API/UI                   | 公開本番反映済み・実運用検証待ち（#1460）       | 403/404と管理者依存             | 統一済み判定をrole fixtureと実運用で確認             | 小（確認） | 権限拡大なし                   | P1     |
| S09 | 同じ企業/商品/対象者を再入力                                                  | onboarding/profile                | 未着手                                          | 離脱                            | 同一Service内の初期値だけ再利用                      | 小〜中     | 同意/他Service分離             | P2     |
| S10 | Feature/Capability/Product Pack/member assignmentの有効権利が一画面で見えない | group features/member settings    | 部分実装                                        | 設定済みでも理由が分からない    | 既存4正本のread-only合成表示                         | 中         | 自動付与しない                 | P1     |
| S11 | Hassy readinessが運用方式と無関係な条件も一律評価                             | manage home/readiness             | 部分実装                                        | LINE起点でもemail条件が停止表示 | 運用方式ごとに説明を分ける。条件削除は別判断         | 小         | 法務/LINE必須条件維持          | P1     |
| S12 | 無変更audit snapshotが増える可能性                                            | audit/snapshot Repository群       | 未着手                                          | 保存量/検索負荷                 | まず件数と参照先を計測。効果未確認なら実装しない     | 小（調査） | 重要監査atomicity維持          | P2     |
| S13 | retention/expiry操作が機能別に分散                                            | training/assets/support retention | 未着手                                          | 運用漏れ                        | 既存状態の一覧化だけ検討。期間は統一しない           | 中         | 法務保持/本人削除維持          | P2     |
| S14 | Pilot/実験/将来機能が通常navigationに見える                                   | admin/service navigation          | 保留                                            | 提供中と誤認                    | 利用頻度を確認後、未契約項目を詳細へ退避             | 小         | feature flag/routeは削除しない | P2     |

## KEEPする制御

tenant/User/Bunshin分離、server認証、same-origin、Capability拒否、secret暗号化、AI予算/原価fail-closed、決済/配信の冪等性、重要監査のatomicity、revision/digest、法務同意/保持、外部送信の最終確認は維持する。

## REMOVE_CANDIDATE

現時点で削除承認は0。Muse構想、旧Workspace adapter、無変更snapshot、終了Pilot画面は、利用log、依存、契約、export、保持義務を確認するまで保留する。
