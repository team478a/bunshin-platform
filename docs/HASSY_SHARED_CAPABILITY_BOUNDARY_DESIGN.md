# ハッシーと共通基盤の責務分離・再監査

作成日: 2026-11-02
基点: origin/main `8271638dbc42b67dd4a8fdf16d2814513ec6e4e1`（#1426マージ後）
状態: コード再監査と設計。以下の配置変更・API最適化・DB変更は未実装。本番反映は未確認。

## 1. 結論と判断基準

「全サービス共通」「SNS Capability共通」「ハッシー固有」の3層へ分ける。ハッシー以外のSNSサービスでも使うロジックを、ハッシー専用または全サービス共通のどちらかへ無理に押し込まない。

- 全サービス共通: 認可、会員・サービス境界、紹介関係、Credit台帳、機能権限、予算、監査、ルール版やUNKNOWNの取り扱いなど、SNSやブランドを知らなくても成立する仕組み。
- SNS共通: Mission / PostRecordの解釈、採否・コピー・本人の投稿完了報告、SNSの継続障壁、投稿支援の選択。SOCIALを使うサービスで再利用する。
- ハッシー固有: 5段階の成長シナリオ、閾値の初期値、表示順、言葉遣い、紹介1 / 3 / 5 / 10件の特典案、MUSE / Zapier案内の採用、提供する操作導線。Service / OEMに紐づく版付きPolicyとして選ぶ。

共通化はコード・契約を再利用することを意味する。Workspace / Service / Membership / User / Bunshinのデータを暗黙に共有することを意味しない。1 User : N Bunshinと、Owner Knowledge / Bunshin Memoryの分離を維持する。

本書は、前の残タスク一覧で「未実装」と広く扱った質問・回答別支援・採用/見送り・抑制・効果観測を訂正する。既存機能の範囲を拡張する計画に置き換える。過去の実装報告は履歴として残す。

## 2. 現行コードとの照合

以下の「実装あり」はコードとテストが存在するという意味。本番有効化・稼働は別途確認する。

| 機能 / 現在のファイル                                                                                                                                                                                                                     | 現状                                                                                                        | 本来の責務                                                                                      | 整理方針                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [共通認可・Service解決](../apps/web/src/services/public-service.ts)、[読取認可](../packages/database/src/member-usage-authorization.ts)                                                                                                   | 実装あり。現時点の所属・同意・所有権を検証                                                                  | 全サービス共通の認可境界とDB実装                                                                | 維持。SNSの達成条件やHassy名を混ぜない。認可helperを別用途へ再利用する時も前提を確認                      |
| [Feature Entitlement](../packages/application/src/group-feature-entitlement.ts)、DB Resolver、既存AI原価制御                                                                                                                              | 実装あり                                                                                                    | 共通の利用可否・予算制御                                                                        | 再利用。紹介達成と利用権付与・実行を分離し、無料上限・停止を迂回させない                                  |
| [紹介・Credit Core](../packages/application/src/service-referral-credit.ts)、[付与Repository](../packages/database/src/service-referral-reward-repository.ts)                                                                             | 紹介関係、自己紹介拒否、特典・台帳と冪等付与が既存                                                          | 共通サービス会員基盤                                                                            | Hassy用の紹介・残高・付与テーブルを新設しない                                                             |
| [紹介特典ルール](../packages/application/src/service-referral-reward-rules.ts)、既存管理画面                                                                                                                                              | 初期設定 / 投稿報告Creditの版管理は既存。今回の資格・人数特典は未接続                                       | ルールの保存・認可・監査は共通、条件と特典内容はサービスPolicy                                  | 既存管理基盤を拡張。SNSのmilestoneを全サービス共通の必須条件にしない                                      |
| [有効紹介Core](../packages/application/src/service-referral-qualification.ts)                                                                                                                                                             | #1426追加。純粋評価だけ。requireFirstUserGenerationとDECISION / COPY / POST_REPORT、Bunshin scopeを直接保持 | 自己紹介・一意性・調査待ち・版は共通。本人生成・活動日の証拠選択はSNS側、必須条件はHassy Policy | 現在はSNS条件付きの評価器であり完全な汎用Coreとは呼ばない。共通判定と証拠bindingを分離してからDBへ接続    |
| [Mission進捗 / 活動段階](../packages/capability-social/src/mission-engagement.ts)、[継続ルール](../packages/application/src/activity-continuity-rules.ts)                                                                                 | 既存。Mission日を使う進捗、確認・休息を含む習慣4段階と管理がある                                            | SNS共通。閾値設定の適用範囲は要確認                                                             | 実操作日とは別metricとして維持。環境単位の既存設定をOEM別設定と誤認しない                                 |
| [利用実績集計](../packages/application/src/member-usage.ts)、[DB取得](../packages/database/src/member-usage-repository.ts)                                                                                                                | #1414以降追加。7/30日の実操作日・生成起動元・採否重複排除・原価                                             | Mission等の正本の解釈はSNS共通。スコープ検証・日付処理など再利用可能な部分は共通                | 現ファイル名が汎用でも内容はSOCIAL投影を含む。小さい共通処理とSNS投影に分け、旧進捗を同じ意味へ置換しない |
| [成長ロードマップ](../packages/application/src/member-roadmap.ts)                                                                                                                                                                         | #1422追加。hassy-roadmap-v1、5段階、固定SNS項目、MUSE / ZapierをApplicationへ固定                           | 状態比較・UNKNOWN・停止処理は共通化候補。固定項目と順序はHassy Policy                           | 共通に見える場所への固有定義の混在を修正する。共通評価器に5段階やSNS語彙を必須化しない                    |
| [ロードマップContext](../packages/database/src/member-roadmap-context.ts)                                                                                                                                                                 | #1423追加。SNS証拠取得とSOCIAL権限照合に加え、無条件でHassy定義を生成                                       | DBによるSNS証拠取得、WebによるサービスPolicy選択                                                | DBからHassy既定定義の選択を外す。明示選択されていないサービスにHassyの既定値を当てない                    |
| [ロードマップUI](../apps/web/app/ui/member-growth-roadmap/card.tsx)、[API読取](../apps/web/app/ui/member-growth-roadmap/data.ts)                                                                                                          | #1425追加。SNS文言、固定milestone、投稿案へのアンカーを持つ                                                 | 現状はHassy / SNS向けUI。枠だけは共通化候補                                                     | app/ui配置だけで汎用と判断しない。文言・項目・操作導線をPolicy側へ分離                                    |
| [困りごと・支援選択](../packages/capability-social/src/activity-barrier-support.ts)、[質問・応答・履歴Repository](../packages/database/src/social-activity-barrier-confirmation-repository.ts)                                            | 質問、回答別支援、ACCEPT / COMPLETE / SKIP、30日抑制が既存                                                  | SNS共通の支援。サービスごとの支援catalogや間隔はPolicy                                          | 別の質問・提案履歴・抑制テーブルやEngineを先に新設しない。既存状態と追加イベントの対応を決める            |
| [Barrier Scheduler](../packages/capability-social/src/activity-barrier-projection.ts)、[Scheduler接続](../apps/web/src/http/mission-scheduler.ts)、OEM支援選択                                                                            | Feature付き定期判定・優先順位・OEM支援候補が既存                                                            | 共通Jobの上で動くSNS評価処理                                                                    | 新しいHassy専用Queue / Cronを作らず、既存の対象・停止・冪等性を拡張する                                   |
| [Improvement観測共通](../packages/application/src/improvement-engine.ts)、[Hassy支援結果](../packages/capability-social/src/improvement-support-outcomes.ts)、[DB Adapter](../packages/database/src/hassy-improvement-support-adapter.ts) | 共通の認可付き観測・被覆・重複処理と、支援の採用/完了/見送り等の限定集計が既存                              | 観測契約は共通、SNS指標はSNS、Hassyの定義・cohortはサービス固有                                 | 観測基盤を再利用。固定期間での新提案の効果判定は不足分だけ追加。相関を負担軽減の因果証明と呼ばない        |
| [研修の実践・証拠](../packages/application/src/personal-learning-practice.ts)                                                                                                                                                             | SNSとは異なる語彙と状態で実装済み                                                                           | TRAININGの意味を持つApplication処理                                                             | 型名や配置だけで共通扱いしない。SNSの投稿完了・5段階を研修へ流用しない                                    |

## 3. 依存方向と配置の設計

Application層にあることと、全サービス共通であることは同義ではない。Capability固有のUse CaseをApplicationで扱う場合も、その語彙・適用範囲を明示する。フォルダの移動だけで共通化済みとせず、入力契約・定義・Policy選択と呼出し元の境界を確認する。

### 論理的な境界

| 層                               | 受け持つ内容                                                                                                                  | 固定しない内容                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 共通Domain / Application         | スコープ・認可Port、ルール版、状態・数値の比較、UNKNOWN、停止、期限、Entitlement / 予算、既存紹介・Credit・監査、既存観測契約 | SNSのイベント名、5段階、MUSE、Hassyの文言・人数閾値    |
| Capability（当面SOCIAL）         | 既存SNS正本から事実を投影、実操作の定義、習慣進捗、継続障壁・支援判定                                                         | 特定Serviceのブランド、全サービスの共通成長像          |
| Service Policy / Web composition | 認可済みServiceのPolicy選択、Hassyの定義・catalog・初期値・操作先、OEMで許された上書き、Use Caseの組み立て                    | 他Serviceを既定Hassyへ読み替えること、認可や予算の緩和 |
| Database / Provider Adapter      | 各Portの実装、条件付きSQL、トランザクション、最小投影、外部接続と承認確認                                                     | Hassy既定Policyの暗黙選択、共通CoreへのSDK混入         |

現行の `@bunshin/capability-social` は `@bunshin/application` に依存する。ApplicationからSOCIALへ直接importしてHassy定義を取りに行く変更は循環を作るため採用しない。Webのcomposition rootが公開exportsから両者を組み立て、Databaseは必要なPortを実装する。packageのsrc直参照で回避しない。

固定SNS評価器をSOCIALへ移す場合は、Repository / Web / テストのimportを同時に移し、ApplicationからSOCIALへの再exportを互換策として追加しない。内部importの移行と、公開HTTP DTO / 既存履歴の互換性を別々に確認する。

具体的なファイル分割候補（設計上の案。まだファイルは作らない）:

- Web: Hassyの定義とサービスPolicy registry。既存サービス設定を検証するselectorから選び、クライアントのslugや表示名だけで決定しない。
- SOCIAL: SNSの利用証拠投影、既存Barrier支援のcatalog binding、SNSの資格条件を満たす証拠。
- Application: 既存の共通紹介 / Credit / Entitlement / 観測を維持し、今回必要な小さな日付・状態比較の共通処理だけを切り出す。
- Database: SNSの正本取得をPortの実装に閉じ、Policy factoryはWebへ渡す。

新しい巨大な汎用Engine、空のPackage、全サービス統一イベント台帳は作らない。具体的な第2サービスで意味・責務が一致する部分だけを共通化する。現時点の抽象設計と、既に共通稼働している機能を区別する。

### Service / OEMでの選択

Policyは少なくともWorkspace / Service / profile key / revisionに束縛する。キーと保存先は既存設定の監査後に確定し、本書だけで新しい設定・DB列・Flagを追加しない。

Hassy用profileが明示選択されたServiceだけへHassyの5段階と文言を適用する。同じSNS機能を使う他Serviceは、自社で許可されたprofile / revisionを選ぶ。未知・未設定は未提供として扱い、Hassyへfallbackしない。既存Hassyの移行では対象scopeと適用版を先に確定し、基本SNS機能には新しいgateを追加しない。

本部は標準・上限・禁止機能を定義し、OEMはその内側だけを変更する。確定特典のルール版・内容を固定し、設定変更で過去の成果を再計算して取り消さない。設定変更と強制停止は既存の認可・監査境界で扱う。

## 4. データとmetricの境界

- 汎用部分へ渡すのは、許可されたscope・指標キー・値・証拠の完全性・基準日時・定義版。任意SQL、任意Provider名、投稿本文、Memoryを設定から指定させない。
- Service会員の紹介件数は会員scope、SNS投稿・履歴はBunshin scopeで扱う。TRAININGなどへ架空のBunshinを作ったり、bunshinId=nullを全Bunshin参照の意味にしたりしない。
- 同じ本人・同じServiceの複数Bunshinの活動日unionは、紹介資格など明示された会員集計の用途だけ。本文・Memory・別Serviceの活動は混ぜない。
- 既存の習慣進捗（Mission日・確認/休息を含む）と、新しい実利用（本人生成・採否・コピー・本人の投稿報告の発生日時）を別の版付きmetricとして残す。表示名だけを「活動日」で統一しない。
- 登録・初期設定・本人生成は確認できる正本と時刻から投影する。新規参加、旧生成の起動元、不完全取得を推測でtrue / 0へ変換しない。
- 共通Fact keyだけでは権限を付与しない。機能の現在の利用可否、停止、予算と操作前提は提案時・実行時の両方で既存境界へ照合する。
- MUSE / Zapier等の固有仕様・認証・URL・Tokenは外部Adapter / ガイドに閉じる。ユーザー承認なしに接続・投稿・設定変更へ進まない。

## 5. 重複の整理と互換性

### 二重集計

現UIはmember-roadmapとmember-usageを順に呼び、前者のGetMemberRoadmapでもGetMemberUsageSummaryを呼ぶ。同じ閲覧で同種の集計を2回実行している。

1回の認可済みsnapshot取得でusageとroadmapを組み立て、新UIはその結果を1回だけ取得する設計へ変更する。既存v1 APIは必要な利用者がいる間、同じ内部読取処理からの薄い投影として維持する。新しいレスポンスが必要なら明示的な契約版を用意し、現在のv1へ黙って別の意味を入れない。共有Rate Limit・no-store・scope固定・失効再検証を維持する。

### 既存の支援状態

既存のCase / Evidence / Confirmation / SupportProgressを正本にする。表示・詳細閲覧・設定開始・実利用・失敗・停止など追加要件については、既存状態・時刻・ログで再構築できるものを先に確認する。再構築できない事実だけを最小追加し、ACCEPT / COMPLETE / SKIPや30日抑制を別台帳へ二重保存しない。

### 3種類の進み方

習慣4段階、Hassy機能利用5段階、既存90日計画は評価目的が違う。単一の進捗率へ加算せず、名称・用途を分けて表示する。画面の主導線は「今日やること」と次のおすすめ1件を維持する。

## 6. 修正後の作業順序と品質ゲート

| 作業単位                      | 変更範囲                                                                                    | 通過条件                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| B0 本書とADR                  | 既存実装・境界・計画の再確認。本PR                                                          | リンク・文書整合性・CI。実装済みとは扱わない                                                          |
| B1 固有定義・Policy選択の分離 | Hassyの固定定義・文言・SNS evidence bindingを適切な層へ分離。認可済みServiceでprofileを選ぶ | HassyのDTO・達成実績維持。他ServiceへHassy既定値が出ない。循環依存なし。基本SNS権限の非変更           |
| B2 共通処理と集計呼出しの整理 | 日付 / 重複処理の一致部分を再利用し、UIの集計を1回へ。metricの異なる意味は維持              | 同一scope / asOfで結果一致、読取回数、深夜 / DST / 旧履歴 / 障害・Rate Limit / スマホ回帰             |
| B3 有効紹介の証拠・確定保存   | #1426の共通判定とSNS条件bindingを分離した上で、既存紹介・Credit・管理境界へ接続             | 保存先の重複監査、DB変更の作業範囲・migration承認、認可・確定の一意性・版固定・非遡及・個人情報非公開 |
| B4 支援提案の不足分           | 既存Barrier質問・選択・履歴・抑制・Schedulerを拡張し、権限・予算・人数特典等と接続          | 既存Case等の再利用、繰返し抑制、停止、AI障害時の基本動作、外部操作の明示承認                          |
| B5 観測・ガイド・運用         | 既存Improvementへ提案結果をbinding。Hassyのガイドcatalogと限定検証                          | 固定比較期間・欠測/少数の扱い、因果と相関の区別、原価、段階的Flag、有効化・本番SHAの証拠              |

各単位を独立PRにし、先の品質ゲート後に進む。コード変更では標準検証と該当unit / SQL / UIを実行する。全サービス共通化を理由にTRAINING等の新機能を先回りして追加しない。

## 7. 今回の変更・検証・未解決

今回変更するのは本設計・ADR・Decision LogとRoadmapへの追記だけ。Runtimeコード・DB・schema・migration・API・UI・Flag・依存・本番環境は変更しない。

### 共有ファイルの変更

- `docs/DECISION_LOG.md`: 今回の境界判断と既存支援の再利用を末尾に追記。
- `docs/IMPLEMENTATION_ROADMAP.md`: B1 / B2を優先する修正後の順序を末尾に追記。

ソースの読取、公開exports / package依存、関連テストの所在、既存報告を照合した。新しい製品動作のテストは追加しない。文書format / 相対リンク / git diff --checkとCIの結果はPR本文に記録する。

profileの具体的な保存キー・既存Serviceへの割当、追加証拠の保存先、共通化後の型・HTTP移行は後続の設計・実装事項。以前のマージ済みコードは動いている仕組みとして保護し、本書の設計だけで移動済み・本番反映済みとは扱わない。
