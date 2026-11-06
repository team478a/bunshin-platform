# サービス実運用導線・Go/No-Go

機能の正本は[機能台帳](20261106_FUNCTION_INVENTORY.md)。本書は「コード上の接続」「自動テスト」「本番実利用」を別列で判定する。本監査では本番の書込、送信、AI実行、決済を行っていない。

## 判定一覧

| サービス               | コード接続                     | 自動テスト                   | 本番実利用                                  | 判定               |
| ---------------------- | ------------------------------ | ---------------------------- | ------------------------------------------- | ------------------ |
| ハッシー               | 投稿生成直前まで接続           | 強い                         | 認証/初期設定/LINE接続まで成功。戦略生成409 | **NO-GO（P0）**    |
| マナベル固定教材       | 登録〜評価/進捗まで接続        | 強い                         | 完走不明                                    | **先行テストのみ** |
| マナベル動的学習       | 希望〜次課題まで接続           | 強いがmock/fixture中心を含む | 実AI・実端末完走不明                        | **NO-GO**          |
| 副業版                 | Training共通基盤へ接続         | あり                         | 専用本番Service不明                         | **NO-GO**          |
| 占い                   | 読み・履歴・評価・LINEまで接続 | あり                         | 公開・実利用不明                            | **NO-GO**          |
| AI物販                 | 無料7日〜有料90日部品は接続    | あり                         | 決済/完走不明                               | **NO-GO**          |
| メディア・アンバサダー | Campaign〜成果/特典まで接続    | 強い                         | 千ノ国通し不明                              | **先行テストのみ** |
| OEM                    | 登録〜契約/請求の部品は接続    | 強い                         | 1社通し不明                                 | **NO-GO**          |

サービス全体を「今すぐ販売可能」と確認できたものは0。これは機能不足というより、実利用の成功証拠と運用設定の不足による。

## ハッシー

| Step                   | コード           | テスト                   | 本番                        | 結論     |
| ---------------------- | ---------------- | ------------------------ | --------------------------- | -------- |
| 公開ページ→メールlogin | 接続             | あり                     | 新規Magic Link成功          | PASS     |
| 企業情報5項目          | 接続             | あり                     | 保存・表示成功              | PASS     |
| 専用LINE本人接続       | 接続             | あり                     | 接続完了表示                | PASS     |
| SNSプロフィール/テーマ | 接続             | あり                     | API保存確認                 | PASS     |
| AI発信戦略             | 接続             | Admission/原価テストあり | `PROVIDER_COST_UNKNOWN` 409 | **STOP** |
| 自動配信ON             | 戦略承認後へ接続 | あり                     | 未到達                      | BLOCKED  |
| 日次投稿案→LINE受信    | 接続             | 冪等/再試行あり          | 直近7日0件                  | 未確認   |
| 採否→コピー→投稿完了   | 接続             | 状態遷移あり             | 直近7日0件                  | 未確認   |
| 活動/成果/週次分析     | 接続             | 集計/privacyあり         | 実データなし                | 未確認   |

Go条件は、#1481/#1482を含むreleaseの同定、tokenなし失敗記録だけの0円精算、戦略生成1回成功、自動配信ON、LINE一件受信、採否/コピー/投稿完了の通し成功。予算・原価fail-closedは解除しない。

## マナベルスタイル

### 固定教材方式

`ProgramTemplate/Version → ServiceProgram → Enrollment → Assignment → Answer → Evaluation → Progress`が正本。動的希望がなくても定義済み教材を進められる設計である。

| Step                  | コード | テスト                  | 本番                                   |
| --------------------- | ------ | ----------------------- | -------------------------------------- |
| 登録/login/Enrollment | 接続   | あり                    | 公開設定workflowは成功、実参加は未確認 |
| 初期profile           | 接続   | 所有境界あり            | 未確認                                 |
| 固定課題表示          | 接続   | policy/runtimeあり      | 未確認                                 |
| 回答提出→非同期評価   | 接続   | Provider失敗/再試行あり | 未確認                                 |
| 次課題/再開/期間      | 接続   | lifecycle/expiryあり    | 未確認                                 |
| 完走/管理進捗         | 接続   | 集計/privacyあり        | 完走件数不明                           |

固定教材は内部少人数の先行テスト候補。販売Goには実参加者1名の登録、回答、評価、再login、完了、期限後表示まで必要。

### 動的学習方式

`自由希望 → 分類/追加質問 → 教材候補 → 本人確認 → Goal/Plan revision → 実践 → AI相談 → 結果確認 → 次課題候補`。固定教材へ暗黙変換せず、Definition approval、Pilot seat、費用Admission、本人確認版を要求する。

コードとテストは広いが、過去runbookはWave 0 NO-GO、実AI・実端末・人間承認・本番Gateの完了証拠なし。外部販売の説明では「動的カリキュラムを提供中」と断定しない。

## マナベルスタイル副業版

導線は`希望/条件 → 候補提案 → 選択 → 90日Roadmap → Training Assignment/Action → check-in → progress → revision`。物販専用ではなく、候補型と安全性ruleを持つ。

コード・テストはあるが専用Service/Program/料金/LINEの本番実体が確認できない。Training共通基盤へ統合されているため、新しい研修エンジンを作らず、既存Programを用いた先行テストを行う。

## 占い

導線は`参加 → 今日のカード → 標準知識 → AI個別化 → 結果 → 履歴 → 評価 → LINE`。card/knowledge/readings/feedback/retention/queueは存在する。

公開slug、`fortunePackageEnabled`、承認済みKnowledge version、AI設定、実reading、LINE受信が不明。全てをread-onlyで同定してから一件の先行テストを行う。現時点は販売NO-GO。

## AI物販

導線は`参加 → FREE_7D → 毎日Action/商品状態 → Day7評価/Offer → Checkout → PAID_90D → 期限/完了`。共通Program/Commerce/LINEを再利用する。

利用者画面の完整性、対象Service/Program、商品、Stripe mode/webhook、7日から有料移行、90日完走が未確認。決済を含むため本番販売前にtest modeの一連確認が必須。

## メディア・アンバサダー

導線は`Service参加 → 商品/公式素材 → Campaign → 投稿支援 → 投稿/活動 → 紹介URL/外部成果 → point/badge/特典`。機能部品は最も多いが、利用実績なしに全機能を営業説明へ載せると過大表現になる。

千ノ国を代表pilotとして、既存Serviceを変更せず設定・参加者・Campaign・成果のread-only監査を行い、その後一つのCampaignだけ先行テストする。point/badge高度化は実利用まで停止する。

## OEM・ホワイトラベル

導線は`Organization登録 → brand/domain → Service/Feature → LINE/email → member → free/paid product → usage → invoice/payment/refund`。コード・DB・テストは揃うが一社の通し証拠がない。

独自domain、Stripe、請求書、返金、顧客移管を一括で「提供済み」としない。最初のOEMは既存一括作成transactionと既存Serviceだけを使い、契約値と画面設定の照合を行う。顧客アカウント移管/事業譲渡は未実装。

## 後続smoke項目（今回は未実施）

1. 公開アプリSHA、production branch、DB migration headの三点照合。
2. ハッシー: 原価精算後に戦略生成を一回だけ実行し、LINE受信から投稿完了まで。
3. マナベル固定: 一人の登録、profile、課題、回答、評価、再login、完了。
4. マナベル動的: 人間承認済みDefinitionと費用枠で、希望から次課題まで一回。
5. 副業: 非物販候補を含む提案、選択、90日計画、check-in、revision。
6. 占い: 承認知識版で一回、履歴、評価、LINE。
7. 物販: test modeでFREE_7D→Offer→Checkout→PAID_90D、webhook重複。
8. 千ノ国: 既存Campaign一件、投稿支援、成果取込、point/badgeの必要最小範囲。
9. OEM: 二つのtenantでbrand/権限/データ分離、請求preview。
10. 共通: User A/B、Bunshin A/Bの越境拒否、Cron最終成功、失敗Job再試行。
