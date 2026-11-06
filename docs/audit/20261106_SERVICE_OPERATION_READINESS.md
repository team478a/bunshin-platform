# サービス実運用導線・Go/No-Go

機能の正本は[機能台帳](20261106_FUNCTION_INVENTORY.md)。本書はコード接続、本番反映、実利用、販売判断を分離する。本監査では本番の書込、送信、AI実行、決済を行っていない。

## 判定一覧

| サービス               | コード実装                  | 公開本番反映 | 実利用                    | 営業説明/デモ | 先行モニター   | 一般販売  |
| ---------------------- | --------------------------- | ------------ | ------------------------- | ------------- | -------------- | --------- |
| ハッシー               | 完了範囲が広い              | 限定確認     | 認証等は成功、戦略生成409 | 可            | P0復旧後       | **NO-GO** |
| マナベル固定教材       | 登録〜評価/再開を実装       | 限定確認     | 完走未確認                | 可            | 条件付き可     | **NO-GO** |
| マナベル動的学習       | 希望〜次課題を実装          | 限定確認     | 実AI/実端末完走未確認     | 限定デモ可    | Gate確認後     | **NO-GO** |
| 副業版                 | Training共通基盤へ実装      | 限定確認     | 専用Service/Program未確認 | コードデモ可  | 設定確認後     | **NO-GO** |
| 占い                   | reading/履歴/LINEを実装     | 限定確認     | 公開設定/利用不明         | コードデモ可  | 設定確認後     | **NO-GO** |
| AI物販                 | FREE_7D〜PAID_90D部品を実装 | 限定確認     | 決済/完走未確認           | コードデモ可  | 決済前範囲のみ | **NO-GO** |
| メディア・アンバサダー | Campaign〜成果/特典を実装   | 限定確認     | 千ノ国通し未確認          | 可            | 一Campaign可   | **NO-GO** |
| OEM                    | 登録〜契約/請求を実装       | 限定確認     | 一社通し未確認            | 可            | 一社pilot可    | **NO-GO** |

一般販売GOは0。ただし説明・デモ・モニター準備まで全面禁止する結論ではない。外部送信、決済、AI課金を伴うデモは別の実行承認を要する。

## 公開環境の確認

| 項目              | 確認結果                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Vercel deployment | `dpl_J2gYTWu8YsoQPZSBzSCpMsj5XZRb`、READY                                                        |
| metadata SHA      | `1d09ba05`（#1482 head、#1481を含む）                                                            |
| main              | `d884d7c6`。公開SHAとGit tree同一                                                                |
| production branch | `9473b429`。公開deploymentとは別                                                                 |
| schema            | `20261104020000_social_publication_intents`、health=`current`                                    |
| health            | live=`ok`、ready=`ready`                                                                         |
| 留意              | Vercel metadataは`gitDirty=1`。優先routeのbuild outputは確認したがartifact全体のbyte一致は未証明 |

これにより旧「#1481/#1482の本番未反映」は解消済みと判定した。ただし「限定確認」は公開コードの存在を示すだけで、全route、Service設定、Feature Flag、権限、Worker、外部Providerの有効化や利用成功を示さない。

## ハッシー

| Step                   | コード/テスト             | 公開本番                  | 実利用                                 | 結論        |
| ---------------------- | ------------------------- | ------------------------- | -------------------------------------- | ----------- |
| 公開ページ→メールlogin | auth route/test           | 反映済み                  | Magic Link成功                         | PASS        |
| 企業情報5項目          | onboarding API/test       | 反映済み                  | 保存・表示成功                         | PASS        |
| 専用LINE本人接続       | service-line flow/test    | 反映済み                  | 接続完了                               | PASS        |
| SNSプロフィール/テーマ | profile/content API/test  | 反映済み                  | 保存成功                               | PASS        |
| AI発信戦略             | H-07のsource/test         | #1481/#1482を含み反映済み | 07:44 JSTに`PROVIDER_COST_UNKNOWN` 409 | **P0 STOP** |
| 証跡付き原価精算       | #1481/#1482、対象test成功 | 反映済み                  | 実データ精算未実施                     | P0残作業    |
| 自動配信ON             | 戦略承認後へ接続          | 反映済み                  | 未到達                                 | BLOCKED     |
| 日次投稿案→LINE受信    | 冪等/再試行test           | 反映済み                  | 0件                                    | 未実施      |
| 採否→copy→投稿完了     | 状態遷移test              | 反映済み                  | 0件                                    | 未実施      |
| 活動/成果/週次分析     | 集計/privacy test         | 反映済み                  | 実データなし                           | 未確認      |

残るP0は追加開発ではない。`/admin/ai`で、成功4件はtoken数と承認済み価格証跡に基づく正数、失敗8件はFAILED・両token null・Provider未送信logを再確認したうえで0円として精算する。12件すべてが原価未確定一覧から消えた後に、戦略生成を一回だけ再実行する。その後、自動配信ON、LINE一件受信、採否/copy/投稿完了までを一人で確認する。予算・原価fail-closedは緩和しない。

### 原価精算から戦略再実行までの最小手順（今回は未実施）

1. SUPER_ADMINが`/admin/ai`を開き、PRODUCTION/OPENAIの原価未確定12件をevent ID・日時・model・status・tokenで照合する。
2. SUCCESS 4件（`gpt-5-mini-2025-08-07`）は正確な入力/output tokenと適用価格版を確認し、承認済み価格表またはProvider請求証跡に基づくUSD micro原価を個別入力する。0円・推測額は入力しない。
3. FAILED 8件（`gpt-5.2`）は両tokenがnullで、対応logがProvider呼出前停止を示すことを確認する。証跡参照を入力し、既存の8件一括0円入力を使用する。
4. 理由・証跡参照・対象12件を最終確認して精算する。再読込後に未確定12件が消え、監査記録の更新件数が一致することを確認する。
5. Hassy利用者画面へ戻り、既存テーマ/SNSプロフィールを再作成せず、「LINE配信を始める」を一回だけ実行する。戦略生成、提案表示、承認、自動配信ONを順に確認する。
6. 409が再発した場合は、未精算event、価格版、Provider設定、日次/月次予算、実行予約競合、API/Vercel logの固定分類を確認する。同じ操作を連続実行しない。

一般参加者の権限は、設定上の未付与記録がある一方、権限不足による実操作失敗を確認できない。P0から外し、契約資格、Service Membership、Group Feature、Capability、Member Assignment、LINE接続を変更なしでread-only照合するP1とする。

## マナベルスタイル

### 固定教材方式

`ProgramTemplate/Version → ServiceProgram → Enrollment → Assignment → Answer → Evaluation → Progress`が正本。

| Step                  | 具体的証拠                                           | 公開本番                | 実利用         |
| --------------------- | ---------------------------------------------------- | ----------------------- | -------------- |
| 登録/login/Enrollment | #1466/#1467/#1469/#1471、service participation tests | 反映済み/schema current | 実参加未確認   |
| 初期profile           | `training-profile.ts`、profile boundary test         | 反映済み                | 本人保存未確認 |
| 固定課題              | `training-runtime.ts`、runtime tests                 | 反映済み                | 未確認         |
| 回答提出              | `training-answer.ts`、answer/persistence tests       | 反映済み                | 未確認         |
| AI評価                | evaluator/job、Provider失敗test                      | 反映済み                | 実AI成功未確認 |
| 次課題/再開           | enrollment lifecycle tests                           | 反映済み                | 再login未確認  |
| 完走/進捗             | progress/admin projection                            | 反映済み                | 完走件数不明   |

固定教材は先行モニター候補。一般登録、profile、課題、回答、AI評価、次課題、再login/再開を一人で確認するまで一般販売NO-GO。

### 動的学習方式

`自由希望 → 分類/追加質問 → 教材候補 → 本人確認 → Goal/Plan revision → 実践 → AI相談 → 結果確認 → 次課題`。

公開コードは確認済みだが、Definition approval、Pilot seat、価格/予算Admission、本人確認版、実端末、停止手段の通し証拠がない。固定教材の成功を動的方式へ流用しない。説明・画面デモは可能だが、提供契約はNO-GO。

## OEM・ホワイトラベル

`Organization → tenant/brand → Service/Feature → member → usage → invoice/payment`の部品は公開済み。

P1の最小検証は、既存一括作成入口で一社を準備し、二tenant分離、Service設定、利用者登録、登録人数/実利用人数の計上、請求previewまで。Stripe実決済、独自domain、返金は別Gateとする。新しいOEM管理基盤は作らない。

## その他サービス

- 副業版: 非物販候補を含む提案、選択、90日計画、check-in、revisionを既存Training Programで一回確認。
- 占い: 公開slug、`fortunePackageEnabled`、承認Knowledge版をread-only確認後、reading/履歴/評価/LINEを一件。
- AI物販: FREE_7D ActionとDay7 Offerまで先行。Stripeはtest modeの別Gate。
- メディア: 千ノ国の既存設定を使い、一Campaign、素材、投稿支援、成果取込だけを先行。point/badge拡張は保留。

## 後続smoke（今回は未実施）

1. Hassy: 証跡付き精算→戦略生成→配信ON→LINE受信→投稿完了。
2. マナベル固定: 登録→profile→課題→回答→評価→次課題→再login。
3. OEM: tenant作成→Service/member→人数集計→請求preview。
4. マナベル動的、副業、占い、物販、千ノ国は上記3件の後に既存設定をread-only確認して一導線ずつ行う。

本番操作は各実行承認の範囲で行い、本監査PRは実行・設定変更を承認しない。
