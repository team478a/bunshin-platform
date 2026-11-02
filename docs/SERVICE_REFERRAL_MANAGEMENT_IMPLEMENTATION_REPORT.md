# 紹介の審査・確定・本人表示・既存特典連携

日付: 2026-11-02 / 基点: main e6dcfc61（#1432）

## 1. 調査した内容

- #1431の本人専用SOCIAL証拠Readerと、#1432の共通状態遷移を再利用した。資格の保存とHTTP/UI接続は未実装だった。
- 紹介関係・被紹介会員の一意性はServiceReferral、画像クレジットの付与は既存Reward / Account / Ledgerを正本にする。
- 旧特典はruleIdごとの冪等性だったため、版を変えると同じ紹介へ再付与できた。また月間上限と版作成にはサービス単位の排他がなかった。
- Hassyの公開登録はreferralEnabled=false。今回この設定、既存の画像提供方針、Feature Entitlement、AI予算を変更しない。

## 2. 変更したファイル

| 責務                       | 主なファイル                                                                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 共通管理Port・確定結果     | packages/application/src/service-referral-management.ts、member-roadmap.ts                                                                           |
| 認可と純粋な証拠射影の分離 | packages/application/src/member-usage.ts、packages/capability-social/src/service-referral-evidence.ts                                                |
| 最小保存・不変性           | packages/database/prisma/schema.prisma、20261102120000_service_referral_qualification/migration.sql                                                  |
| 保存・認可・排他・監査     | packages/database/src/service-referral-management.ts                                                                                                 |
| 集計・証拠取得再利用       | service-referral-count.ts、member-roadmap-context.ts、social-service-referral-evidence.ts、member-usage-authorization.ts、member-usage-repository.ts |
| 既存特典・月間上限         | service-referral-reward-repository.ts、service-referral-reward-rule-repository.ts                                                                    |
| 管理API                    | apps/web/src/http/service-referral-management.ts、app/api/services/[serviceSlug]/referral-management/route.ts                                        |
| 管理画面                   | app/s/[serviceSlug]/manage/referrals/*、既存紹介特典画面・管理ナビゲーション                                                                         |
| 本人表示                   | app/ui/member-growth-roadmap/*、src/http/service-member-roadmap.ts、app/s/[serviceSlug]/activity/page.tsx                                            |
| 検証                       | DB結合ケース、管理APIテスト、既存ロードマップテスト、scripts/test/learning-ui/referral-*                                                             |

共有ファイルの変更: application / databaseのsrc/index.tsはexport追記のみ、
database.integration.test.tsはimportとケース登録の追加のみ。
e2e.config.tsとmain.tsxは新しい画面テストの登録を追加。
既存ADRはユーザーの作業単位変更に合わせて末尾へ追記した。
schema-readiness.tsは新しいmigration名へ更新した。

## 3. 主要な設計判断

### 共通・SOCIAL・Hassyの境界

共通Applicationは管理scope・状態遷移・Policy版・不透明な条件データ・本人の確定人数を扱う。
SNSの活動や条件の意味を持たない。SOCIALの既存normalizer / evaluatorが
新規登録・初期設定・本人の投稿案生成・実活動日を解釈する。
初版の保存profileは明示的なSOCIAL_REFERRALのみ。未知のprofileや実行指示を受け付けない。
Hassyの固定5段階・文言・特典人数の既定値を共通層へ移さない。

管理者は本人用Readerのactorを差し替えない。transaction内で管理権限を確認した上で、
scopeだけを受け取るpackage内部の証拠取得を呼ぶ。
純粋な共通射影とSOCIAL射影もactorを持たない形へ分離し、
既存本人向け入口のownerチェックは維持した。
新規登録だけを条件にする管理用評価では、Bunshin作成前でも所属・同意を検証して登録証拠を評価する。
生成や活動を必要とする条件は、実際のSOCIAL証拠がなければ未達とする。
管理APIは対象を識別する会員IDと状態だけを返し、Memory・投稿本文・画像・氏名・連絡先を返さない。
管理者は既存の会員管理画面で調査し、理由を付けて要確認・問題なしを記録する。
紹介者の人数表示には個人別情報を含めない。

### 最小保存と確定

既存ServiceReferralに資格state / review / revision / 確定版・日時・取消日時を追加。
新規2モデルは再構築不能な資格Policy版と、理由付き管理操作の監査だけを保存する。
活動、登録、紹介、残高の別台帳は作らない。旧データはUNASSESSED / UNKNOWNのまま。

Group→ServiceReferralの順にロックし、最新Policy・権限・保存review・本人の現在の所属と同意・証拠を確認。
CLEARかつQUALIFIEDだけをCASで確定し、変更前後の状態・審査を含む監査と既存特典照合を同じtransactionで行う。
書込みもRepeatableReadとし、Policy変更ではロック済みGroupの更新日時を進める。
待機中の古いsnapshotはserialization conflictから最大2回だけ再試行し、
再試行では現在の権限・最新版・保存済みcommandを再確認する。
既存Credit特典の版作成も同じGroup更新を行い、待機中の確定が古い付与額・月間上限を使わないようにする。
証拠は既存の新規登録監査と利用実績の射影を使う。上限超過・不明・条件未達は確定しない。
所有Bunshin20件、登録監査100件、活動10,000件の既存上限を引き継ぐ。

要求のcommandIdと許可フィールドのSHA-256を保存する。
認可後、同一要求の再送を評価より先に照合する。異なるpayloadの使い回しは競合にする。
取消後の古い成功応答の再送は歴史的な応答を返すだけで、人数・資格・Creditを復活させない。
確定した版・日時はDBのCHECK / UPDATE guardで保持する。条件変更と取消は別操作。

### 本部とOEM

本部SUPER_ADMINが対象サービス単位でHEADQUARTERS版を保存する。
OEMのACTIVEなSERVICE_OWNER / SERVICE_ADMINは、承認済み本部版以上の条件に限り
SERVICE版を保存できる。必須条件を外す、必要日数を減らす、タイムゾーンを変える操作は拒否する。
本部版の未設定・停止では新しい確定と新制度の付与を停止する。停止も追記版で監査する。
管理APIはsame-origin、strict validation、private no-store、ユーザー単位の既存process内Rate Limitを使う。
一覧はscopeを検証するcursorで100件ずつ取得する。

### 既存特典との接続

資格Policy未設定のサービスでは旧成果による付与を維持する。
設定後は最新Policyと本部がACTIVE、かつ紹介がCONFIRMEDであることを旧成果付与にも要求する。
確定時には保存済みの初期設定完了・投稿完了報告だけを照合する。
確定操作から成果日時を作らず、実際のSNS公開を証明したとも扱わない。

既存Reward / Account / Ledgerだけを使い、同じ紹介・論理ruleKeyの特典を版や受益者の変更で再付与しない。
既存の月間付与件数上限はruleKeyと受益会員で版を越えて照合し、Groupロックで並行処理を直列化する。
既存の付与額・期限・月間上限の設定画面を再利用する。取消は人数から除外するだけで、
付与済みCreditの回収・過去台帳の修正はしない。
画像生成自体の利用権・予算管理は既存の消費境界に残す。新たなAI呼び出しはない。

### 本人表示

owner確認済みのロードマップにvalidReferralsを追加し、既存DTOのフィールドは維持する。
クライアントは旧応答でフィールドがなければ未確認として表示する。
未設定はnull、設定済みの確定0件は0と区別する。取消日時もasOfに照合する。
活動・紹介画面も本人の紹介コードに結び付く確定人数だけを表示する。
紹介によってSNSの基本機能を制限しない。

## 4. 検証

- 使い捨てPostgreSQL 16: 全268 migration適用、schema readiness確認、全330 SQL結合テスト成功。
- 最終追加SQL19件の単独実行も成功（全体332件）。旧データ、同時確定、再送・payload衝突、取消後の再確定拒否、
  不明審査・証拠欠落・停止・旧版拒否、版作成競合、確定不変性、
  一般会員・他OEM・停止ユーザー拒否、OEM下限、自己紹介、scope付きcursor、
  既存特典接続、版を越える再付与防止、月間上限の並行処理、asOfと複合FK、
  同意・所属・対象Userの再確認、Bunshin作成前の登録条件、匿名DB roleのRLS、
  本部停止・既存特典版変更と待機snapshotの競合。
- API・モバイル・標準検証の最終結果はPR本文とCIで記録する。

## 5. 未解決事項・本番運用状況

コード実装・合成データ検証の段階。本番migration、サービス設定変更、デプロイ、実ユーザーへの付与は未実施。
本番公開には対象SHAのPreview、migrationの別途承認・適用・readiness、サービス単位の本部設定確認が必要。
Hassyの紹介受付を公開する場合は、現行のreferralEnabled=falseと事業者プロフィール画面の方針を
別途確認する。今回の資格Policy保存を紹介受付や有料画像生成の自動有効化にしない。

3/5/10人による期間限定機能体験、MUSE実接続、現金・換金・多段紹介は追加していない。
設定がない機能をロードマップで利用可能と表示しない。
不正な複数アカウントの自動断定はせず、管理者のREQUIRED / CLEAR審査を残す。

## 6. 次へ進む条件

本PRのCI・レビューを通し、次は既存Barrier / Support / Entitlement / Budgetを使う
「自動化提案」の機能単位へ進む。質問・回答・見送り台帳を別に作り直さない。
