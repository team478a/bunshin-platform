# 有効紹介 Phase 2-A 資格判定Core実装報告

作成日: 2026-11-02

基点: origin/main `d8f4ef75`（PR #1425マージ後）

ブランチ: `codex/hassy-referral-qualification`

## 1. 調査した内容

AGENTS、仕様正本、Architecture Principles、Roadmap、Decision Log、既存紹介・Credit・特典ルール管理・会員活動画面の報告、ロードマップの最新ADR / 実装報告、関連テストとpackage公開入口を確認した。

| 既存資産           | 実装ファイル                                                                        | 再利用 / 不足                                                                                                                     | 今回の扱い                                                         | 本番   |
| ------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------ |
| 紹介の登録・一意性 | database/src/service-participation-registration-repository.ts、prisma/schema.prisma | 被紹介Membership単位の一意性と自己紹介除外がある。Membership upsert後に紹介関係を作るため、REGISTEREDだけでは新規参加を断定しない | 現行処理を維持し、新規参加の確認可否を別の証拠契約にする           | 未確認 |
| 紹介成果           | ServiceReferral                                                                     | REGISTERED、ONBOARDING_COMPLETED、FIRST_CONTENT_VIEWED、FIRST_POST_REPORTED、REJECTEDと日時を持つ。新しい資格判定の確定版はない   | 既存enum / 状態を書き換えない                                      | 未確認 |
| 特典ルール         | service-referral-reward-rules.ts、service-referral-reward-rule-repository.ts        | 初期設定・本人の投稿報告に対するCredit数・期限・月間上限・受取人の版管理。初回本人生成・活動日数の資格条件はない                  | 独立した資格判定の入力契約を追加。保存先は重複を監査して次に決める | 未確認 |
| 付与 / 台帳        | service-referral-reward-repository.ts、ServiceReferralReward、ServiceCreditLedger   | 特典状態PENDING / GRANTED / REVOKEDと冪等な付与単位を持つ                                                                         | 新しい判定から付与を呼ばない。読取で旧成果・台帳を変更しない       | 未確認 |
| 実利用 / 日付      | application/src/member-usage.ts、database/src/member-usage-repository.ts            | 起動元・本人の実操作・スコープの正本を再利用可能。会員の複数Bunshinを跨ぐ資格用の許可付き証拠投影は未接続                         | メタデータの内部投影契約だけを追加。本文 / Memoryは共有しない      | 未確認 |
| ロードマップ       | member-roadmap.ts、member-roadmap-context.ts                                        | VALID_REFERRALSの条件は設計・実装済みだが、確定有効件数はnull                                                                     | null / 集計準備中の表示を維持する                                  | 未確認 |

上記はコード・schemaと既存テストの監査で、本番稼働の証明ではない。現行の初期設定 / 投稿報告特典を新しい有効紹介基準へ読み替えない。

## 2. 変更したファイル

- `packages/application/src/service-referral-qualification.ts`: 副作用のない版付きルール正規化・資格判定
- `packages/application/src/index.ts`: 公開exportを末尾へ追加のみ（共有ファイルの変更）
- `packages/application/test/service-referral-qualification.test.ts`: 新規66件
- `docs/adr/HASSY_REFERRAL_QUALIFICATION_ADR.md`: 実装前の判断・接続条件
- 本報告書

DB / schema / migration、HTTP / UI / Job、管理設定、依存・環境変数・Feature Flag、既存特典・台帳には変更がない。

## 3. 主要な設計判断

[ADR](adr/HASSY_REFERRAL_QUALIFICATION_ADR.md)を参照。

### ルールと入力

ルールはWorkspace / Service、ruleKey、正の整数version、ACTIVE / SUSPENDED、timezone、新規参加・初期設定・初回本人生成を必須にするか、最低活動日数を明示する。活動日数は0〜3,660で0は条件を課さない。暗黙の本番初期ルールや有効化を作らない。

紹介の一意性・新規参加はtrue / false / nullを区別する。REGISTERED、上位成果、報酬付与件数、Membership日時の推測差からtrueを捏造しない。調査状態はCLEAR / REQUIRED / UNKNOWN、証拠の完全性はCOMPLETE / PARTIALとする。

実利用は成功した本人操作の生成、採否、コピー、本人の投稿完了報告だけを投影する契約。各イベントに既存ID・MemberUsageScope・時刻を付け、同Workspace / Service / 被紹介Membership / Userを照合する。同じcanonical eventの矛盾した時刻・Bunshin、壊れた日時・種別、10,000件超・欠けた配列等はvalidation errorにする。

これは内部の投影契約で、実際の所有権を証明する認可処理ではない。Adapter接続では現在の所属・同意・所有権と元イベントの成功 / 起動元 / actorを必ず検証する。新しいイベントを重複保存しない。

### 判定

| 結果            | 意味                                                                       |
| --------------- | -------------------------------------------------------------------------- |
| QUALIFIED       | このルール版・評価時点で必要な条件を確認できた                             |
| PENDING         | 登録や必要な完了証拠・活動日数を待つ                                       |
| UNKNOWN         | 新規参加・紹介一意性・調査状態が未確認、部分取得、必要な旧生成起動元が不明 |
| REVIEW_REQUIRED | 紹介の競合や調査対象。自動的に多重登録不正と断定しない                     |
| REJECTED        | 自己紹介、既存REJECTED、必須の新規参加条件に反する確証                     |
| SUSPENDED       | ルール停止中。新規条件確認済みとして扱わない                               |

既存の自己紹介拒否helperと成果型を再利用する。登録前・asOf後の操作と初期設定は達成証拠に使わず、activityの時刻をルール版のtimezoneで暦日へ変換して重複を除く。同じ日の複数操作や同Serviceの本人所有Bunshinの日数を足し合わせない。旧生成だけで本人生成・活動日を推測しない。ただし、確認済みの実利用だけで全条件を満たす場合は、無関係な旧生成の存在で達成を取り消さない。

返すのは契約版・ルールキー / 版・評価時点・timezone・判定・固定理由のみ。紹介者へ被紹介者の個人情報や操作内容を返すAPIは追加しない。

### 確定と付与を分ける

QUALIFIEDはDB確定・特典付与・権限解放の命令ではない。繰返し評価は同じ結果を返すだけで、件数増加や書込みをしない。新しいルール版での再評価は別の結果になり、以前の返却値・入力・確定成果・特典を変更しない。永続状態の保護や付与の冪等性は、次の保存境界で既存の制約と台帳を再利用して検証する。

## 4. 実行した検証

Node 24.22.1 / pnpm 10.10.0。

- 新規資格判定66件成功
- 紹介Credit / 付与 / ルールとロードマップを含むApplication全体: 149ファイル1,168件成功
- Application TypeScript、変更TS lint、依存境界、変更format、git diff --check: 成功

自己紹介、旧成果の拒否・不明、調査待ち、部分取得、登録前・未来・深夜境界・夏時間・うるう日、同日・同一イベントの重複、複数Bunshinの暦日union、他OEM / 他User / 他Membershipの証拠、ルール版の変更を合成データで検証した。日時や最低日数などの不正な設定も拒否する。readonly配列のruntime検証でanyへ狭められていた型と、テストの不要なassertionは修正し、検証ルールを緩めていない。

本PRは認可Adapter・SQL更新を追加していない。新しいCoreのテストを本番DBや認可の通し検証とは扱わない。既存のSQL統合と特典・台帳テストはCIで再検証する。全体format / typecheck / lint / test / UI / build、DB統合 / readiness / native release / TLSは最終コミットのCI verify / databaseを品質ゲートとし、結果をPR本文に記録する。

## 5. 未解決事項

- 資格ルールと確定結果の保存 / 管理 / 監査・取消・再実行、認可付き証拠取得、重複排除した有効件数集計は未接続
- 新規参加の確証や旧データの確認方法を、既存登録処理の記録と照合して確定する必要がある。証明できないものを新規と推測しない
- ロードマップのvalidReferralsはnullのまま。紹介人数・ロードマップ特典は集計準備中の表示を維持する
- 初期設定 / 投稿報告に対する既存の特典付与は変更していない。新資格基準で遡及付与・取消・機能解放をしない
- 本番反映・本番DB接続・Flag変更・AI / SNS外部操作は未実施

## 6. 次へ進める条件

- 本PRのレビュー、最終コミットのCI verify / database成功、マージ
- 次は既存DBを再利用する資格ルール・確定状態の保存境界と、認可付き証拠Adapterを設計する。新規テーブルの重複を避け、必要なDB変更はその作業単位で許可・migration・統合テストを揃える
- ロードマップへ件数を渡す前に、同じ被紹介会員の一度限りの確定、他OEM / 他Userの分離、旧データの不明、版固定・既存特典の非遡及を検証する
