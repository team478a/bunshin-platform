# 開発優先順位の再評価

新機能計画ではなく、[機能台帳](20261106_FUNCTION_INVENTORY.md)と[実運用導線](20261106_SERVICE_OPERATION_READINESS.md)の停止点を、既存実装の再利用を前提に並べた。

## 集計

| 優先度 | 件数 | 意味 |
| --- | ---: | --- |
| P0 | 3 | 現在の顧客利用・復旧判断を止める |
| P1 | 12 | 販売/先行提供の前に必要 |
| P2 | 14 | 利用しやすさ・運用負荷 |
| P3 | 6 | 将来拡張。今は着手しない |

## 最初に修正・確認すべき上位10項目

| 順位 | ID | 項目 | 根拠 |
| ---: | --- | --- | --- |
| 1 | P0-01 | Hassyの原価未確定記録を証拠付きで正しく精算し戦略生成を一回再実行 | 実利用が409で停止 |
| 2 | P0-02 | #1481/#1482を含む公開artifactを同定し、productionへ安全にrelease | main修正だけでは顧客へ届かない |
| 3 | P0-03 | Hassy一般参加者のLINE/SOCIAL権利を既存設定で整合 | 参加後も主要機能を実行できない記録 |
| 4 | P1-01 | Hassyの戦略→配信ON→LINE受信→投稿完了を一人で通す | 販売価値の最短導線 |
| 5 | P1-02 | Hassy固有法務文書・参加方式・専用menu状態を整合 | readiness未完了 |
| 6 | P1-03 | マナベル固定教材を一人で登録→回答→評価→完了 | 最小の販売可能範囲を確定できる |
| 7 | P1-04 | マナベル動的方式のWave0 Gateを最新本番で再監査 | 固定教材と混同した販売を防ぐ |
| 8 | P1-05 | 千ノ国で一Campaignだけ素材→投稿→成果まで検証 | 既存実装を最短で営業証拠へできる |
| 9 | P1-06 | Stripe test modeで購入/Webhook/返金/失効を通す | 金銭整合性の販売前条件 |
| 10 | P1-07 | Service/Group/Workspaceのrole判定不一致を一覧化 | 正常参加者の403/機能不可を防ぐ |

## P0

| ID | 問題 | 顧客価値/影響 | 再利用 | 規模 | 完了条件 |
| --- | --- | --- | --- | --- | --- |
| P0-01 | `PROVIDER_COST_UNKNOWN`でHassy戦略生成停止 | 配信開始不可、影響確認済み1名以上 | #1481の0円精算制約 | 小 | tokenなしFAILEDだけ精算、戦略生成200、重複生成なし |
| P0-02 | main修正と公開artifactの対応が未確定 | 修正済みでも顧客障害継続 | 既存release workflow/health | 小〜中 | SHA/DB head/health一致、rollback先記録 |
| P0-03 | 一般参加者のLINE/SOCIAL権利未付与 | 参加できても主要機能不可 | GroupFeature/MemberAssignment | 小 | 対象契約内だけ付与、別tenant/未契約拒否 |

## P1

| ID | 項目 | 根拠・完了条件 |
| --- | --- | --- |
| P1-01 | Hassy最短E2E | LINE一件受信、採否、copy、投稿完了、活動表示。外部SNS投稿は不要 |
| P1-02 | Hassy readiness 10項目の実運用整合 | 法務、参加方式、menuを実態に合わせる。不要条件の単純削除はしない |
| P1-03 | マナベル固定教材pilot | 一人の登録、課題、回答、評価、再開、完了、期間終了 |
| P1-04 | マナベル動的Wave0監査 | Definition、Pilot seat、AI価格/予算、実端末、停止手段を全て確認 |
| P1-05 | 千ノ国一Campaign pilot | 公式素材、投稿支援、実績、外部成果の一件照合 |
| P1-06 | 決済E2E | Stripe test、重複Webhook、返金、期限切れ、請求preview |
| P1-07 | 認可判定統一 | 同じService roleで画面/APIの結果が一致、権限拡大なし |
| P1-08 | 公開Service設定のread-only一覧 | 副業、占い、物販、千ノ国のslug/Program/Feature/LINE/AIを確定 |
| P1-09 | Cron/Job運用証拠 | 最終成功、滞留、retry、結果不明を機能別に確認 |
| P1-10 | 占い一件pilot | 承認知識版、reading、履歴、評価、保持、LINE |
| P1-11 | AI物販FREE_7D pilot | 7日Action、商品状態、Day7分類、Offerまで。先に実決済しない |
| P1-12 | OEM一社pilot | 二tenant分離、brand、member、利用量、請求preview。独自domainは別Gate |

## P2

1. 本部/Service/OEM管理navigationを主要業務へ集約。
2. 通常保存のreason手入力を差分から自動記録。
3. 学習承認のSHA/証跡キー転記を自動化。
4. 同一Serviceの初期profileを質問の初期値へ限定再利用。
5. LINE共通/専用/menu/本人接続のstatus表示を統合。
6. Feature/Capability/Product Pack/member assignmentの有効権利表示を一本化。
7. AI予算画面を月額中心と高度安全設定へ分ける。
8. Point/credit/badge/referralの利用者向け特典表示を統合。
9. 投稿活動の原記録とCampaign/Social projectionを明記。
10. 重複・無変更audit snapshotを計測して削減判断。
11. rate/concurrency制限をService/操作目的単位で再評価。
12. 404、403、409、Provider障害を利用者向けに区別。
13. Pilot/未契約/将来機能を通常navigationから退避。
14. スマートフォン/LINE起点で「今日やること」までの操作数を測定。

P2はセキュリティ、tenant、予算、決済、同意、冪等性を弱めない。

## P3（着手保留）

1. Muse連携。
2. 完全自動SNS投稿・追加SNS公式API。
3. 自前/高度動画生成と追加Provider。
4. 高度point/badge/gamification。
5. 汎用外部AIによる無承認操作・自動改善の本番反映。
6. 顧客アカウント移管/事業譲渡機能（法務・データ・決済要件確定前）。

## 次Phaseへ進める条件

- P0 3件がゼロ。
- Hassyまたはマナベル固定教材のどちらか一つで、利用者の開始から完了まで証拠が残る。
- 機能追加PRではなく、既存導線のrelease/smoke/運用証拠を先にレビューする。
- 動的学習、決済、外部投稿は各専用Gateを通し、healthやCI成功で代用しない。
- 本報告の監査PRがレビューされ、mainへmergeするかの判断を受ける。監査PR自体からproductionへ進めない。
