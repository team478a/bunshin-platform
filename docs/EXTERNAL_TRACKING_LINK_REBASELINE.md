# 外部成果計測URL連携 Rebaseline

## 1. 目的と名称

本機能の正式名称は「外部成果計測URL連携機能」とする。ワタシ企画室は、外部システムが発行した完全な専用URLを安全に登録し、正しい参加者・商品・キャンペーンの投稿案へ決定的に挿入する。

ワタシ企画室はクリック、申込み、購入、成約、承認、報酬、支払、代理店階層、顧客、不正成果を計測・判定・保存しない。独自短縮URL、リダイレクト、Cookie、自動投稿、外部API同期もMVPへ含めない。利用者は外部システムのURLへ直接遷移する。

## 2. 現行実装の監査

最新`main`には次が存在する。

- Organization Workspace所有の`Group`、`GroupMembership`
- 版管理された`ProductPack`、`ProductPackVersion`、Rule、Asset、Bunshin Assignment
- 任意参加の`Campaign`、`CampaignParticipation`
- Weekly Plan / Daily Missionの広告分類とCampaign参照
- 必須表記、禁止表現、本人Evidenceを検査するAdvertising Safety Gate
- Mission Content、Decision、Activity、PostRecord、Generation Context Snapshot
- Campaign類似検査、利用上限、管理KPI、LINEからWeb確認への導線

不足しているものは、外部システム定義、許可ドメイン、専用URL、参加者単位の外部ID、決定的URL選択、本文差し込み、使用Snapshot、CSV、URL監査、管理／本人UIである。

既存`ProductPackAsset(type=LINK)`は公式参考資料であり、成果帰属URLとして再利用しない。人格、Memory、Knowledge、商品説明、Mission Activity metadataへ専用URLを埋め込まない。

## 3. 所有権とID

- 設定所有者はOrganization Workspace配下のGroupとする。
- 参加者専用URLの内部参照先は`GroupMembership.id`とし、Bunshin IDを所有単位にしない。
- 同じUserが同じGroup内で複数Bunshinを使っても、同じMembershipのURLを解決する。
- `agency_id`等は外部システムの識別子であり、内部の所有権判定には使用しない。
- 商品は安定IDである`ProductPack.id`を参照する。生成時には実際に利用した`ProductPackVersion.id`も履歴へ固定する。
- キャンペーンは`Campaign.id`を参照する。
- 別Group、別Membership、別参加WorkspaceのURLを候補へ含めない。

保持可能な外部IDは`commonUserId`、`agencyId`、`referralToken`、`externalSystemId`、`externalMemberId`、`externalLinkId`とする。顧客ID、購入者ID、報酬額は保持しない。

## 4. 推奨データモデル

### 4.1 ExternalTrackingSystem

- id / workspaceId / groupId
- name / systemType / status
- externalSystemId nullable
- createdByUserId / updatedByUserId / createdAt / updatedAt

MVPでは秘密情報やAPI資格情報を持たない。将来Adapter設定が必要な場合も、秘密値は暗号化Configurationへ分離する。

### 4.2 ExternalTrackingAllowedDomain

- id / workspaceId / groupId / externalTrackingSystemId
- hostname / allowSubdomains / shortener / status
- createdByUserId / updatedByUserId / createdAt / updatedAt

許可ドメインをJSON設定へ埋めず、検索・一意制約・監査が可能な構造化resourceとする。

### 4.3 ExternalTrackingMemberIdentity

- id / workspaceId / groupId / externalTrackingSystemId / groupMembershipId
- commonUserId / agencyId / externalMemberId
- status / createdByUserId / updatedByUserId / createdAt / updatedAt

同じ参加者の外部IDをLinkごとに複製せず、外部システムとGroup Membershipの組に正規化する。`@@unique([externalTrackingSystemId, groupMembershipId])`を持つ。外部IDは照合情報であり、内部認可には使用しない。

### 4.4 ExternalTrackingLink

- id / workspaceId / groupId / externalTrackingSystemId
- scopeType: `GROUP | MEMBER | PRODUCT | CAMPAIGN | PRODUCT_MEMBER | CAMPAIGN_MEMBER`
- externalTrackingMemberIdentityId nullable
- productPackId nullable
- campaignId nullable
- name / referralToken / externalLinkId
- url
- status: `DRAFT | ACTIVE | SUSPENDED | EXPIRED | DELETED`
- startsAt / expiresAt / notes
- createdByUserId / updatedByUserId / createdAt / updatedAt / deletedAt

`scopeType`ごとに必要な外部キーの組み合わせをApplication層とDB CHECKで固定する。PostgreSQLではNULLを含む通常UNIQUEだけでは重複を防げないため、scope別の部分Unique Indexまたは正規化した`scopeKey`で同条件の重複ACTIVEを防ぐ。

状態は物理削除せず`DELETED`へ遷移する。期限到達時は検索条件で即時除外し、冪等Jobで`EXPIRED`へ追随させる。

### 4.5 ExternalLinkPlacementTemplate

- id / workspaceId / groupId
- productPackVersionId / platform / format / target
- template / urlLocked（常にtrue） / status / version
- createdByUserId / updatedByUserId / createdAt / updatedAt

テンプレートには`{{referral_url}}`を必ず1回だけ許可する。他の命令変数、HTML、script、URLそのものを保存・解釈しない。該当テンプレートがなければ`詳しくはこちら\n{{referral_url}}`を本文末尾へ使用する。プラットフォーム別文言を将来追加できるが、MVPで自由な実行コードにはしない。編集対象は`DRAFT`の商品パック版に限定し、公開済み版の差し込み設定を後から変更しない。

### 4.6 ContentLinkUsage

- id / workspaceId / bunshinId / dailyMissionId unique
- groupId / groupMembershipId / userId
- productPackId / productPackVersionId / campaignId nullable
- externalTrackingLinkId
- insertedUrlSnapshot / linkNameSnapshot / expiresAtSnapshot
- placementTemplateVersion nullable
- advertisingClassification / createdAt

Mission、Mission Content、Generation Context Snapshot、Advertising Safety Review、ContentLinkUsageは同一transactionで保存する。URL変更後も過去のSnapshotは変更しない。

### 4.7 ExternalLinkAudit

- id / workspaceId / groupId / externalTrackingLinkId
- action / beforeSummary / afterSummary / reason
- actorUserId / occurredAt

監査にはscope、状態、期間、host、URL fingerprint、末尾マスクを保存する。完全URLのqueryは保存しない。完全URLはLink本体と利用Snapshotだけに限定する。

### 4.8 Product Pack

商品情報と専用URLは別resourceのまま維持する。`ProductPackVersion`には次の例外方針を版ごとに固定する。

- `allowLinklessPosts` boolean default false

`allowLinklessPosts`は公開版へ固定する商品方針である。Campaignが商品版の禁止を勝手に緩和できない。専用URLはProduct Pack Versionの本文、facts、rules、assetsへ複製しない。

## 5. URL検証

登録時と使用直前の両方でサーバー検証する。

- HTTPSのみ
- username / password / fragmentを拒否
- 2,048文字以内
- hostnameを小文字・末尾dotなし・IDNA正規化して完全一致または明示的subdomain許可で照合
- IP literal、localhost、private／loopback／link-local hostを拒否
- 危険scheme、制御文字、改行、Unicode偽装hostを拒否
- 短縮URLは`shortener=true`の許可ドメインだけ受理
- query parameter名と値へメール、電話番号、氏名等の顧客個人情報を入れない。MVPでは既知の個人情報parameter名を拒否し、自由入力の顧客情報を設けない
- リダイレクト先をワタシ企画室が追跡・検査しない。登録されたhostが外部システムの許可hostであることを正とする

URLは公開用データだが参加者間では非共有である。ログ、エラー、LINE通知、管理KPIへ完全URLを出さない。

## 6. 決定的な選択規則

対象時刻で`ACTIVE`、開始済み、未期限切れ、許可Domain有効、Group一致の候補だけを扱い、次の優先順位で1件を選ぶ。

1. `CAMPAIGN_MEMBER`
2. `PRODUCT_MEMBER`
3. `MEMBER`
4. `CAMPAIGN`
5. `PRODUCT`
6. `GROUP`

同一優先順位で複数件を許さない。DB制約に加え、異常データを検出した場合は推測で選ばず`CONFLICT`として生成を止める。

商品関連投稿でURLがなければ、`ProductPackVersion.allowLinklessPosts=true`の場合だけURLなし生成を許可する。それ以外は「この商品に使用できる専用URLが設定されていません。管理者へお問い合わせください。」を返す。別商品・別Campaign・別参加者の共通URLへfallbackしない。

ORGANIC投稿にはURLを自動挿入しない。`PRODUCT_RELATED | ADVERTISEMENT`で、本人の有効なParticipation、Assignment、Group Membership、商品版、Campaignを再検証してから解決する。

## 7. 生成・保存順序

1. verified sessionからUser / Workspace / Bunshinを確定
2. Group Membership、Campaign Participation、Product Pack Assignmentを再検証
3. Product Pack VersionとCampaignを解決
4. 広告分類、必須表記、禁止表現、本人Evidenceを解決
5. 有効な専用URLを決定
6. AIへURL値を渡さず、本文を構造化生成
7. 品質検査、広告安全検査、類似検査を実行
8. 決定的Post Processorが`{{referral_url}}`を置換、または既定文をcaption／body末尾へ挿入
9. 挿入後にURL存在、必須表記、文字数上限を再検査
10. Mission一式とContentLinkUsageをatomic保存
11. Webで本人へ表示し、採用後だけ形式別コピーを許可

AIにURLの選択、書換え、短縮、parameter追加を任せない。再生成時は新しいMission生成として最新の有効URLを再解決し、過去MissionのSnapshotは変更しない。

形式別の挿入対象は`TEXT.body`、その他は投稿用`caption`を基本とする。スライド本文、撮影台本、動画生成Promptへ成果URLを混ぜない。

## 8. 利用者画面とLINE

Mission確認画面には次を日本語で表示する。

- 「あなた専用の紹介URLを入れました」
- 対象商品／Campaign、広告・PR表記、URL、有効期限
- 採用、使用しない、採用後のコピー、作り直し、投稿完了

URL部分を個別編集するUIは提供しない。コピー後のSNS手動投稿を制御できるとは表現しない。URL状態が表示時点で無効になった場合はコピーを止め、作り直しまたは管理者への連絡を案内する。

LINEには完全URLや投稿本文をPushせず、「専用URLを含む投稿案を用意しました」と安全な要約だけを送り、既存の署名付きWeb導線へ誘導する。Webで所有権とURL状態を再検証する。

## 9. 管理画面

Group OWNER／MANAGERは自Groupについて次を操作できる。

- 外部システム、許可Domain、専用URLの一覧・登録・変更・停止・論理削除
- 参加者別／商品別／Campaign別の設定状況
- 未設定、期限間近、期限切れ、停止、形式エラー、重複候補の警告
- Placement Templateの版管理
- CSV取込、行別結果、CSV出力
- URL利用履歴と変更監査

Platform SUPER_ADMINは全Groupの状態、host、エラー、監査を確認できるが、完全URLは障害調査で必要な場合に限定する。Group管理者は商品関連のURL使用履歴だけを確認し、通常投稿本文、個人Memory、Knowledge、Feedback本文を取得しない。

参加者は自分に現在適用されるURL、期限、対象商品だけを確認でき、登録・変更・停止はできない。他参加者の存在やURLを一覧・件数・エラーから推測できない応答にする。

## 10. CSV部分取込

UTF-8 CSVを受け、行番号、参加者IDまたはGroup内メール、外部参加者ID、agency_id、商品コード、Campaignコード、URL、開始、終了を扱う。

- 最初にheader、行数、ファイルサイズを制限する
- 行ごとにGroup内Membership、商品、Campaign、Domain、期間、scope重複を検証する
- 正常行は行単位transactionで保存し、異常行だけ`rowNumber + errorCode + 日本語説明`を返す
- CSV原文、メール、完全URLをJobログ・Auditへ保存しない
- 同じimport idempotency keyの再送で二重登録しない
- email照合は自GroupのMembershipに限定し、未存在と別Groupを同じエラーにする

初期上限候補は1ファイル1,000行、5MBとし、実測後に変更する。

## 11. 将来Adapter

Coreは将来の`ExternalTrackingProviderPort`に依存し、Provider別実装はAdapterへ隔離する。候補operationはlink同期と外部集計取得だが、MVPではPortを呼ばず手動／CSV登録だけを実装する。

将来集計を取得しても、外部の期間集計をSnapshotとして保存・表示するだけで再計算しない。報酬、支払、顧客個人情報は取得しない。

## 12. 必須Isolation／受入テスト

- 指定された6段階の優先順位
- 停止・期限切れ・開始前・削除済みURLの除外
- URLなし許可falseで生成停止、trueだけ継続
- 同一優先度重複時のfail closed
- 別Group、別Membership、別商品、別Campaignの混入防止
- 同じUserの複数BunshinでMembership URLを共有し、人格IDで帰属しない
- URL変更前後のUsage Snapshot不変
- 再生成時の最新URL再選択
- HTTPS、認証情報、危険scheme、IP、localhost、未許可／不正Domain拒否
- 一般参加者の登録・改ざん拒否
- CSV正常行の部分成功と異常行だけの報告
- Group管理者が通常投稿、個人Memory、他Group URLを取得できない
- LINEに完全URLを含めず、Webで所有権を再検証
- クリック、成約、報酬、顧客情報のtable／API／ログが存在しない

## 13. PR分割

1. Rebaseline／Decision／Roadmap（文書のみ）
2. External System／Allowed Domain／Tracking Link Core、migration、選択Policy、Isolation Test
3. 管理API、URL検証、監査、停止・期限切れ
4. Product Pack Version方針、Placement Template Core
5. Mission生成への解決・差し込み・atomic Usage Snapshot接続
6. 本人Mission画面、コピー前再検証、LINE安全要約
7. Group管理画面、設定漏れ、利用履歴
8. CSV部分取込・CSV出力・冪等性
9. End-to-End、スマートフォン、Production Gate

外部成果API、独自計測、報酬、顧客、短縮URL、自動投稿は別判断まで着手しない。

## 14. 人間レビュー事項

Core実装前に次を確定する。

1. `ProductPackVersion.allowLinklessPosts`を商品版の唯一の例外設定とするか
2. 初期に許可する外部システム名とDomain
3. 短縮URLをMVPで全面禁止するか、明示Allowlistを許すか
4. Platform SUPER_ADMINが完全URLを閲覧できる障害調査手順
5. CSV上限1,000行／5MB
6. URL利用Snapshotの保持期間と退会時の扱い
7. SNS別Placement Templateの初期文言

このレビューが終わるまでPrisma Schema、Migration、実装コードを変更しない。
