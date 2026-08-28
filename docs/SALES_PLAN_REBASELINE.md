# ワタシワークス 販売プラン対応 再基準化

## 1. 目的

本書は、個人販売、パートナー販売、グループ一括契約を同じ基盤で安全に提供するための設計境界と実装順序を定める。将来の専用LINE、再販、OEMを追加できる構造を維持するが、現時点で先回り実装しない。

販売プラン名を画面や条件分岐へ直接埋め込まず、契約、利用権、料金の決定者、決済主体、API原価負担者、LINE運用主体を別の概念として扱う。

## 2. 現在の実装状況

再利用できる主な基盤は次のとおり。

- Workspace、User、Group、Membership、Invitation
- システム管理者、グループ管理者、参加者の権限境界
- Group Feature Catalog、Group Feature Policy、参加者別Assignment、利用上限、監査
- Product Pack、Version、Assignment、Campaign
- 外部成果計測URL連携とGroup／Member Isolation
- AI利用量、見積原価、日次・月次上限、緊急停止
- LINE設定、通知、配信履歴、環境分離、管理画面
- 画像・動画のGroup限定権限と利用履歴

一方、次の機能は未実装である。

- 契約と契約版の履歴
- 座席数の原子的な確保・解放
- 複数の根拠を合成する利用権
- 紹介インセンティブの追記型台帳
- 画像・動画等に使う共有Credit Poolと台帳
- 商品、価格、注文、支払、定期契約、Webhook
- 販売主体と法定表示のSnapshot
- Groupごとの専用LINE Channel
- Reseller／OEMの契約・ブランド境界

## 3. 既存方針との差分

現行ロードマップはFREE検証前の課金、決済、高度な紹介報酬を対象外としている。本指示は販売可能な複数プラン、Group Bundle、インセンティブ、Credit、決済を新たに求めるため、既存Phaseの単純な残作業ではなくスコープ変更である。

よって、コードやDBを先に変更せず、Phase 7-Kとして次の順に分離する。

1. 契約・座席・利用権
2. Creditとインセンティブ台帳
3. 商品・価格・注文・決済
4. 共通LINEでの販売プラン運用
5. 管理画面と利用者画面
6. 専用LINE、再販、OEM

## 4. 販売モデル

初期対象は次の3種類とする。

| 販売モデル   | 契約主体        | 料金の決定     | 決済主体       | 初期LINE | 主な利用権                        |
| ------------ | --------------- | -------------- | -------------- | -------- | --------------------------------- |
| 個人         | 個人            | ワタシワークス | ワタシワークス | 共通LINE | 個人購入                          |
| パートナー   | 個人またはGroup | ワタシワークス | ワタシワークス | 共通LINE | 紹介元付き個人購入またはGroup付与 |
| Group Bundle | Group           | ワタシワークス | ワタシワークス | 共通LINE | 契約Groupから参加者へ付与         |

将来候補は次のとおり。

- P1: Group専用LINE
- P2: Reseller。料金決定または請求主体をTenantへ移す
- P3: Private OEM。ブランド、販売主体、法定表示、LINE、運用境界をTenant単位で分離する

P1以降はP0の台帳とIsolationが安定してから実装する。

## 5. 分離して保持する属性

販売プラン名だけから挙動を決めない。少なくとも次を独立して保持する。

- `tenantId`
- `lineMode`: `SHARED | DEDICATED`
- `billingMode`: `PERSONAL | PARTNER | BUNDLE | RESELLER | OEM`
- `paymentOwner`: `WATASHI_WORKS | TENANT`
- `priceOwner`: `WATASHI_WORKS | TENANT`
- `apiCostOwner`: `WATASHI_WORKS | TENANT`
- `entitlementSource`: `FREE | PERSONAL_PURCHASE | PARTNER_GROUP | BUNDLE_GROUP | ADMIN_GRANT`
- `referrerTenantId`
- `creditPoolId`

これらは契約版へSnapshotし、後から設定が変わっても過去の注文、支払、付与、インセンティブの意味が変わらないようにする。

## 6. TenantとGroup

Tenantは契約、価格、請求、LINE、ブランド、原価負担の所有単位とする。Groupは参加者、商品配布、Campaign、利用機能の運用単位として維持する。

- 1 Tenantは複数Groupを所有できる将来性を持つ
- Group Membershipを販売契約そのものとして扱わない
- Bunshinや人格を成果帰属、請求、座席の所有単位にしない
- Workspace、Tenant、Group、Membership、Userの境界をサーバー側で毎回検証する
- Group管理者であっても個人Memory、通常投稿、秘密情報を閲覧できない

## 7. 契約と契約版

契約は少なくとも`DRAFT | ACTIVE | SUSPENDED | CANCELLED | EXPIRED`を持つ。契約条件は上書きせず版管理する。

契約版へ保存する候補は次のとおり。

- 販売モデルと各Owner
- 契約期間、更新周期、解約反映日
- 含まれる座席数
- Group機能セット
- 個人機能セット
- 含まれるCreditと追加購入可否
- LINE Mode
- 価格版、税、通貨
- 販売主体・法定表示版

変更は「即時反映」と「次回更新から反映」を区別し、誰が、なぜ、いつ、どの版から変更したかを監査する。

## 8. 座席管理

Group Bundleの参加可能数は、招待送信数ではなく同時に有効なMembership数で判定する。

- 座席確保とMembership有効化を同一Transactionで行う
- 同時参加でも上限を超えないDB制約またはlockを使用する
- 招待中、辞退、失効、取消は原則として使用中座席へ数えない
- 退会・除外時はGroup由来の権利と座席だけを解放する
- 個人購入、本人作成物、法令上保持が必要な履歴をGroup退会だけで削除しない
- Membership停止時はGroup由来機能を直ちにfail-closedにする

## 9. 利用権

利用権は、個人購入、Group付与、無料枠、管理者付与など複数のSourceを合成して判定する。

- どのSourceがどの機能を許可したか説明可能にする
- Group退会時は該当Group Sourceだけを失効させる
- 個人購入とGroup付与が重なっても二重消費しない
- 期限、停止、取消、契約失効を実行直前に再検証する
- 将来機能はFeature Catalogへ追加し、販売プラン固有のif文を各機能へ散らさない

## 10. インセンティブ台帳

紹介・パートナーインセンティブは残高の直接更新ではなく追記型Ledgerで記録する。

候補イベントは`PENDING | CONFIRMED | REVERSED | CANCELLED | EXPIRED | MANUAL_ADJUSTMENT`とする。

- 注文・支払・返金との因果関係を保持する
- 同じ売上に紹介インセンティブと卸差額を重複適用しない
- 返金、取消、Chargebackは反対仕訳で戻す
- 過去行を更新・削除しない
- 顧客個人情報、カード情報、Provider秘密値をLedgerへ保存しない
- 現金支払い、請求書、源泉・税務処理は別Phaseの判断とする

## 11. Credit Poolと台帳

画像・動画等の原価管理には、金額残高ではなく用途別Creditを使用する。Credit Poolの所有者は個人またはTenant／Groupとする。

候補イベントは次のとおり。

- `GRANT`
- `RESERVE`
- `CONSUME`
- `RELEASE`
- `REFUND`
- `EXPIRE`
- `MANUAL_ADJUSTMENT`

Provider実行前に予約し、完成物を安全に保存できた時点で一度だけ消費する。技術的失敗では予約を解放または返却し、安全拒否、利用者都合取消、完成後の不採用を返却対象にするかは事業判断として確定する。

Credit残高はLedgerから再計算可能にし、冪等KeyとDB一意制約でJob、Webhook、再試行による二重消費を防ぐ。

## 12. 商品・価格・注文・決済

商品と価格を分離し、価格は上書きせず版管理する。注文時には商品、価格、税、通貨、販売主体、契約条件をSnapshotする。

決済ProviderはPort／Adapter方式とし、Coreから直接呼ばない。

- Checkout作成は冪等にする
- Webhook署名を検証する
- Provider Event IDを一意にし、再送を重複処理しない
- 支払状態と契約状態を同一視しない
- 未払い、失敗、返金、取消、Chargebackを別状態として扱う
- Provider応答、カード情報、Secretをログや監査へ保存しない
- 管理画面で支払成功へ手動変更しない。必要な補正は理由付きの追記型操作にする

## 13. LINE運用

P0ではワタシワークス共通LINEを使用する。通知時にTenant、Group、契約、Membership、利用権、通知同意、配信上限を再検証する。

- LINE user IDと契約主体を同一視しない
- 通知本文へ価格、秘密情報、個人Memoryを含めない
- Deep Link先で所有権と利用権を再検証する
- Group退会・契約停止後に未送信通知を送らない
- 専用LINEが未設定または不正な場合に共通LINEへ黙ってfallbackしない

Group専用LINEの一般提供はP1とし、Channel、LIFF、Webhook、Rich Menu、Quota、AuditをTenant・環境ごとに分離する。共通LINEと専用LINEの選択は販売プラン名ではなく`lineMode`で行う。

ただし、システム管理者が明示許可したテストグループでは、`docs/GROUP_DEDICATED_LINE_PILOT.md`に従って専用LINEを先行検証できる。専用設定が不足・停止・接続未確認の場合は共通LINEへfallbackせず、送信を停止する。

## 14. 管理画面

システム管理者向けに次を段階実装する。

- Tenant、契約、契約版、状態
- Group、座席上限、利用中数、招待・参加状況
- 利用権のSourceと失効予定
- Credit付与、予約、消費、返却、期限、手動調整
- 商品、価格版、注文、支払状態、Webhook処理状況
- インセンティブの発生、確定、取消
- LINE Modeと設定状況
- 販売主体、法定表示版
- 変更理由、actor、before／afterを含む監査

Group管理者には自Groupの契約範囲、座席、参加者への機能付与、共有Credit利用状況だけを表示し、価格原価、他Group、個人Memory、個人通常投稿、秘密値を表示しない。

## 15. 利用者画面

専門用語を避け、次を明確に表示する。

- 今使える機能
- 個人で持っている機能とGroupから使える機能
- Groupを抜けると使えなくなるもの
- 画像・動画の残り利用回数と期限
- 追加購入の有無
- 契約・支払の状態と問い合わせ先

利用権Sourceや価格版などの内部語は説明用の日本語へ変換する。

## 16. 販売主体と法定表示

注文時に販売主体、問い合わせ先、利用規約、プライバシー、特定商取引法表示、返金条件の版をSnapshotする。Reseller／OEMでは表示主体が変わるため、画面上のロゴだけを差し替えて済ませない。

本番販売前に法務・税務・会計の人間確認を必須とする。

## 17. データ分離とセキュリティ

- Workspace／Tenant／Group／Membership／Userの全境界を自動テストする
- 別Tenant、別Group、別Userの契約、Credit、支払、紹介情報を参照できない
- 金額、Credit、座席の更新はDB Transactionと一意制約で守る
- 管理者操作には理由を必須にし、追記型Auditを残す
- APIキー、決済Secret、Webhook Secret、カード情報をDBの業務Tableやログへ保存しない
- 管理画面でSecretを平文再表示しない
- ProductionとPreview／Developmentの契約・決済設定を混在させない
- Provider障害時は権利付与や消費を推測で完了させない

## 18. 実装フェーズ

### K0: 再基準化

本書、ロードマップ、Decision Logを更新する。コード、Schema、Migrationは変更しない。

### K1: Tenant Contract / Seat / Entitlement Core

契約版、座席、利用権Source、状態遷移、Repository、Isolation、原子的な参加・離脱を実装する。決済、LINE専用化、画面は含めない。

### K2: Credit Pool / Ledger

予約、消費、解放、返却、期限、手動調整と画像・動画完了処理への接続を実装する。

### K3: Incentive Ledger

紹介帰属、発生、確定、取消、返金時反対仕訳を実装する。現金支払いは含めない。

### K4: Product / Price / Order Core

商品、価格版、注文Snapshot、状態遷移を実装する。外部決済接続は含めない。

### K5: Payment Provider

決済Port、初期Provider Adapter、Checkout、署名Webhook、冪等処理、返金・取消状態を実装する。

### K6: Shared LINE / Entitlement Connection

共通LINE通知にTenant／契約／Membership／利用権の実行直前確認を接続する。

### K7: Admin / User Experience

管理画面、Group管理画面、利用者向け利用権・Credit・契約表示を実装する。

### K8: Production Gate

法務、税務、価格、返金、Provider、Webhook、Isolation、復旧手順を確認し、証跡を保存する。

### K9以降

Group専用LINE、Reseller、Private OEMはP0の実運用後に別々のPhaseとして判断する。

## 19. 必須テスト

1. 同時参加でも座席上限を超えない
2. Group退会でGroup由来の権利だけが消える
3. 個人購入資産はGroup退会後も本人に残る
4. 返金時にインセンティブが反対仕訳される
5. 同じ売上にインセンティブと卸差額を重複適用しない
6. Creditが一度だけ予約・消費される
7. 技術的失敗で予約Creditが返る
8. Webhook再送で支払・契約・Credit・インセンティブが重複しない
9. 別Tenant／別Group／別Userのデータが混入しない
10. 管理者画面に個人Memory、秘密値、カード情報を表示しない
11. LINE通知が正しいTenant／Group／UserのContextで送られる
12. 通知停止、契約停止、上限到達後に新規送信しない
13. 価格変更後も過去注文の価格Snapshotが変わらない
14. Bundle付与と個人追加購入を区別できる
15. 管理操作にactor、理由、before／after、日時が残る

## 20. 実装前に確定する事項

| ID   | 確定事項                                 | 未確定のまま実装してはいけない範囲 |
| ---- | ---------------------------------------- | ---------------------------------- |
| D-01 | FREEで許可する機能と原価上限             | K4以降                             |
| D-02 | Partner価格、基本座席数、追加座席        | K1の本番値                         |
| D-03 | 紹介インセンティブ率・確定条件・取消条件 | K3                                 |
| D-04 | 申込確認、契約成立、決済時点             | K4・K5                             |
| D-05 | Bundle価格、含有Credit、追加購入         | K2・K4                             |
| D-06 | Credit返却対象となる技術的失敗           | K2                                 |
| D-07 | GroupとResellerの境界                    | K4以降                             |
| D-08 | 専用LINEの価格と提供条件                 | P1                                 |
| D-09 | Reseller卸価格と販売責任                 | P2                                 |
| D-10 | 1 Userの複数Group所属可否と優先規則      | K1                                 |

## 21. 停止条件

K0文書の人間レビューが完了するまでK1へ進まない。特に次を承認する。

- TenantとGroupの責務分離
- 契約版と利用権Source
- 座席の数え方
- Creditの予約・返却条件
- 紹介インセンティブと再販差益の分離
- P0で共通LINEを使う方針
- 決済Providerと販売主体
- D-01からD-10のうちK1に必要な判断

本番販売はK8の法務・税務・価格・返金・決済・Isolation確認が完了するまで開始しない。
