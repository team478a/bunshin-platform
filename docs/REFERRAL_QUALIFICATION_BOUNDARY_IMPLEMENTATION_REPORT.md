# B3前半 紹介資格の共通判定・SNS証拠の分離

日付: 2026-11-02  
基点: origin/main `8d8f81b7`（#1429マージ後）  
ブランチ: `codex/referral-qualification-boundary`

## 1. 調査した内容

AGENTS、正本仕様、Architecture Principles、Decision Log、Roadmap、
責務分離設計と過去の資格・紹介・Credit・管理画面の報告を確認した。
package公開入口、全呼出し、schema・migration・登録transaction・報酬付与・ルール管理を照合した。

旧Applicationの資格評価器はテストだけから使われ、HTTP / Job / DBでは未接続だった。
今回その全利用箇所を移行した。既存ServiceReferral・報酬・口座・台帳を再利用する。
[保存先監査](REFERRAL_QUALIFICATION_STORAGE_AUDIT.md)に、実装と設計、テスト、本番未確認を分けて記録した。

## 2. 変更したファイル

| ファイル                                                                 | 変更                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------- |
| `packages/application/src/service-referral-qualification.ts`             | Service / Membershipの共通gateとPolicy正規化だけを残す  |
| `packages/application/test/service-referral-qualification.test.ts`       | Bunshinのないサービス会員で成立する共通判定38件         |
| `packages/capability-social/src/service-referral-qualification.ts`       | 既存の初期設定・本人生成・活動日とBunshin証拠検証を移設 |
| `packages/capability-social/test/service-referral-qualification.test.ts` | 旧66件を公開入口経由のSOCIALテストへ移設                |
| `packages/capability-social/src/index.ts`                                | 新しい公開exportを末尾に1行追加                         |
| `docs/adr/REFERRAL_QUALIFICATION_SOCIAL_BOUNDARY_ADR.md`                 | 実装前の境界・内部契約移行判断                          |
| `docs/REFERRAL_QUALIFICATION_STORAGE_AUDIT.md`と本書                     | 重複禁止・不足・後続接続条件と実装報告                  |

## 3. 主要な設計判断

Applicationは自己紹介拒否、帰属、一意性、登録、新規参加の不明、審査、停止を担当する。
共通gateの通過はCONTINUEであり、有効紹介QUALIFIEDでも認可の証明でもない。
Bunshin、投稿、生成、ハッシーを共通gateの必須条件にしない。
既存の紹介status型を再利用するが、上位statusからSNS条件達成を推論しない。

SOCIALは、そのgateと必要な初期設定・本人生成・活動日の証拠を照合して最終判定する。
v1の結果版・理由・優先順位・UNKNOWN・scope・実操作日unionを維持した。
停止や自己紹介であっても壊れたSNS入力を検査する旧挙動を維持している。
日時・ID等の小さな局所validationを、不要な汎用フレームワークへ広げていない。

ハッシーの3日・1/3/5/10件等の暗黙既定値は追加していない。
確定件数、特典、権限開放、ロードマップvalidReferralsには接続していない。
旧ApplicationのSNS型・関数はSOCIALの名前付き公開入口へ移行した。
ApplicationからSOCIALへの再export、package内部の迂回参照、循環依存はない。
HTTP / DBに旧関数の利用はなく、HTTP契約や保存形式は変わらない。

## 4. 検証

Node 24 / pnpm 10を使用。合成データのみで、外部AIや本番DBへ接続していない。

- Application: 149ファイル、1,105件成功（旧66件をSOCIALへ移設、新38件追加）。
- SOCIAL: 30ファイル、373件成功。旧66件の期待する結果は変えていない。
- 両packageのTypeScriptと変更TSの型付きlint、architecture check成功。
- 既存SNSテストは他OEM / User / Membership、矛盾するBunshin・時刻の重複、暦日・DST・旧生成、版変更、未知・審査を含む。
- 新共通テストはBunshin不要、CONTINUEとQUALIFIEDの分離、自己紹介、帰属・不明・停止の順序、壊れた入力、データ非公開・非変更を含む。

全体format / typecheck / lint / test / build、既存UI・SQL・readinessの最終結果は
最新HEADのCI verify / databaseを品質ゲートにし、PR本文へ記録する。
新SQLやUI操作は追加しておらず、既存SQLの成功を新資格の永続化検証とは扱わない。

## 5. 共有ファイルの変更

`packages/capability-social/src/index.ts`にexportを1行追加した。
Applicationのindexは既存のstar exportをそのまま維持する。
Decision Log / Roadmap、schema / migration、cron / Flag / 環境変数、依存関係に変更なし。

## 6. 未解決・次の条件

このPRでB3全体の有効紹介確定・付与が完了したとは扱わない。
保存先監査に示す新規参加の確証、資格Policy版と確定・調査・取消の保存、厳格な上限・版変更後の再付与防止、
設定変更監査、会員scopeの証拠Adapter、Hassyの紹介有効化は後続。
enumや作成者列が存在することと、運用フロー・監査が実装済みであることを区別する。

次のDB作業では既存ServiceReferralへ結び付く最小保存案・非遡及・認可・一意性・版固定を確定し、
必要なschema / migration範囲と使い捨てDBの並行SQLテストを揃える。
新しい紹介関係・報酬・Credit台帳を重複作成しない。

最終HEADのCI verify / database成功とレビュー・マージが次の作業への条件。
本番反映・デプロイ・本番設定変更は未実施。
