# ハッシー SNSサポート V1 現状監査

- 対象リポジトリ: `team478a/bunshin-platform`
- 基準ブランチ: `main`
- 基準コミット: `547380b3988407bd35171cd842b0bd5ceacce454`
- 調査日: 2026-09-26
- 調査範囲: H0（現状監査のみ）
- コード・DB変更: なし

## 1. Executive Summary

ハッシー SNSサポート V1は、既存のサービス用SOCIAL、オンボーディング、Daily Mission、行動履歴、LINE、90日集客表示、Personalization Audit、Service Roleを大部分再利用できる。

一方、V1の中核である「SNS活動障壁の推定」「本人への1問確認」「無料支援の実施」「改善確認」「OEM支援候補化」は現行の正本として存在しない。既存イベントを再利用して判定できるが、障壁の状態・Evidence・確認抑制・支援履歴・OEM対応状態には新しい永続化が必要になる可能性が高い。

現行の90日Business Growthは、Business Profile作成日と曜日から表示用Actionを決める決定的ロジックである。利用者の障壁、支援、改善結果を追跡するRuntimeではないため、そのままBarrier Coreの正本にはできない。

H1以降へ進む前に必要な判断は次の4点である。

1. ハッシー対象サービスを文字列ではなく、Service設定またはFeature Policyで識別する。
2. 初期設定5項目から既存の必須Business Profileを安全に補完する規則を決める。
3. システム障害期間を障壁集計から除外する正本を決める。
4. 障壁状態とOEM対応状態を別のライフサイクルとして保持する。

## 2. 調査方法と制約

READMEだけを根拠にせず、Prisma schema、Application/Capability、Repository、HTTP、画面、テスト、最新の設計文書を追跡した。

今回、Production DBの特定サービス設定や実データは変更・参照していない。そのため「ハッシー」という表示名・slugの本番Serviceがどの設定値を持つかはコードだけでは確定できない。リポジトリ内にも`HASSY`または`ハッシー`を固定識別子とする現行実装は見つからない。

## 3. 分類基準

| 分類         | 意味                                               |
| ------------ | -------------------------------------------------- |
| 再利用       | 現行の正本・認可・APIを原則そのまま利用できる      |
| UI変更       | 正本は再利用し、表示・入力・導線を変更する         |
| ロジック拡張 | 既存データを読み、新しい判定・Projectionを追加する |
| 新規実装     | 新しい状態・監査・API等が必要                      |
| 対象外       | HASSY V1では実装しない                             |

## 4. Gap Overview

| 領域                  | 現状                                                      | 分類                  | HASSY V1の差分                        |
| --------------------- | --------------------------------------------------------- | --------------------- | ------------------------------------- |
| Service onboarding    | 質問回答とBusiness ProfileをService Membership単位で保存  | 再利用 + UI変更       | 初回項目削減と後続1問補完             |
| Bunshin自動作成       | Business Profile保存時に既存Bunshinを再利用、なければ作成 | 再利用                | 初期値補完後も作成条件を維持          |
| Progressive Profiling | `nextOnboardingRefinement()`が低情報回答を1問返す         | ロジック拡張          | cooldown、dismiss、優先順位、完了履歴 |
| Social設定            | SocialProfile、Strategy、Pillar、Weekly Planが存在        | 再利用                | 初回自動設定と利用者向け用語整理      |
| Daily Mission         | Bunshin/日単位の生成、個別化、品質検査、履歴照合          | 再利用                | Barrier支援による行動量・支援内容調整 |
| 行動履歴              | VIEWED、採否、コピー、POSTED、実行結果、Feedback          | 再利用                | 集計用Read Modelと誤判定防止          |
| 投稿結果              | PostRecord、投稿別Performance、SocialInsightSnapshot      | 再利用                | 欠損を「効果なし」と扱わない          |
| Activity Continuity   | 週目標・休眠日数のActive rule                             | 再利用 + ロジック拡張 | Barrier候補と復帰支援へ接続           |
| 90日Business Growth   | 日付・曜日・PhaseからAction表示                           | 再利用（表示素材）    | 障壁別支援の正本にはしない            |
| LINE                  | 配信、Deep Link、Delivery/Attempt、再試行                 | 再利用                | 通知成功と閲覧を区別してEvidence化    |
| Personalization Audit | 生成根拠と品質状態を管理者が確認可能                      | 再利用                | CONTENT候補の事前品質判定に利用       |
| Barrier推定           | 未実装                                                    | 新規実装              | ルール、観測窓、閾値、ruleVersion     |
| Barrier確認           | 未実装                                                    | 新規実装 + UI変更     | 1問、CONFIRMED/DISMISSED、再表示抑制  |
| 無料支援              | 汎用Business Growth Actionは存在                          | ロジック拡張          | 障壁別支援、実施履歴、改善再判定      |
| OEM支援候補           | 未実装                                                    | 新規実装 + UI変更     | 候補生成、状態、監査、KPI             |
| CRM・自動営業         | 未実装                                                    | 対象外                | V1では作らない                        |

## 5. Service Onboarding / Business Profile

### 現在の正本

- `ServiceOnboardingResponse`
  - `workspaceId + groupId + groupMembershipId + userId`を保持する。
  - 質問Snapshot、回答、完了日時を保持する。
- `ServiceMemberBusinessProfile`
  - Service Membershipに結び付き、業種、事業名、地域、商品、目的、対象顧客、特徴、価格、Tone、必須・禁止内容を保持する。
- 保存API: `apps/web/src/http/service-onboarding.ts`
- 設定読取: `apps/web/src/services/service-onboarding-settings.ts`
- 利用者画面: `apps/web/app/s/[serviceSlug]/onboarding/page.tsx`
- 入力画面: `apps/web/app/s/[serviceSlug]/onboarding/service-onboarding-form.tsx`

### 現行必須条件

`businessProfileEnabled`のServiceでは、API schema上、次が必須である。

- 業種
- 事業名
- 商品・サービス
- SNS目的
- 対象顧客
- 事業の特徴
- 投稿Tone

地域、Webサイト、価格、必須内容、禁止内容はnullableである。

HASSY指示書の最小5項目は「業種、会社名、商品、対象顧客、目的」であり、現行必須の`businessFeatures`と`preferredTone`が不足する。H1で単にvalidationを削除すると、`defaultBusinessPartner()`がBunshin人格を作れず、既存生成品質も下がる。

### 最小変更案

- 初回UIでは5項目を必須とする。
- `businessFeatures`と`preferredTone`は、明示された安全な初期値をサーバー側で保存する。
- 初期値であることを区別し、Progressive Profilingの優先対象にする。
- 後から本人が回答した値だけで上書きする。
- 既存Business Profile利用者には再入力を要求しない。

分類: **UI変更 + 小規模ロジック拡張**。

## 6. Bunshin自動作成

`saveServiceOnboardingResponse()`はBusiness Profile保存後、同Serviceに既存Bunshinがあれば先頭の1件を再利用し、なければ`CreateBunshin`を実行する。`defaultBusinessPartner()`は事業名、商品、目的、対象顧客、特徴、Toneから次を作る。

- Bunshin名
- Objective
- Audience
- Personality

Workspace、Service Group、User所有境界はRepository/Applicationで検証される。

注意点:

- 同一Serviceで複数Bunshinがある場合に「先頭の1件」を利用するため、HASSYがどのBunshinを対象にするかを暗黙順序に依存させない。
- H1では既存の作成処理を維持し、対象Bunshin選択規則だけを監査・固定する。

分類: **再利用**。

## 7. Progressive Profiling

`nextOnboardingRefinement()`は現在の質問群から、空または低情報回答を最初の1件だけ返す。Serviceホームとオンボーディング編集画面から利用され、スマートフォンで1問ずつ補完する構造はすでにある。

現状で不足するもの:

- 前回表示日時
- 次回表示可能日時
- dismiss状態
- 質問ごとの優先順位
- 同一質問の短期再表示防止
- 初期値と本人回答の区別
- 回答がDaily Mission生成へ反映されたことの監査

既存回答を別テーブルへ複製せず、質問表示制御に必要な最小状態だけを追加するべきである。

分類: **ロジック拡張**。表示制御状態の永続化が必要なら一部**新規実装**。

## 8. Social Setup / Daily Mission

既存サービス用SOCIALには次がある。

- SocialProfile
- SocialAccountStrategy
- ContentPillar
- WeeklyPlan / WeeklyPlanItem
- DailyMission
- サービス承認済みKnowledge
- Campaign / Product Pack
- Memoryと最近のMission履歴を含む個別化Context
- Quality / Novelty Gate

Daily Mission生成の中心は`apps/web/src/services/daily-mission-generation.ts`であり、個別化は`daily-mission-personalization.ts`、保存時の根拠は`daily-mission-persistence.ts`等へ分離されている。

HASSY用に新しい投稿生成基盤を作る必要はない。障壁対応は、既存Mission候補またはBusiness Growth Actionの支援強度を調整する入力として接続する。

分類: **再利用**。

## 9. 行動データの意味

### 利用できるイベント

`MissionActivity`には次がある。

- `VIEWED`
- `CONFIRMED`
- `RESTED`
- `EXECUTION_COMPLETED`
- `EXECUTION_PARTIAL`
- `EXECUTION_NOT_COMPLETED`
- `EXECUTION_HELP_NEEDED`
- `ACCEPTED` / `REJECTED`
- 各種`COPIED_*`
- `POSTED`
- Feedback系

`MissionDecision`は採用・不採用理由を保持し、`PostRecord`は投稿日時、URL、外部ID、手入力指標を保持する。`MissionFeedback`は本人らしさ評価を保持する。

### 誤判定を防ぐ条件

1. `VIEWED`はWeb上でMissionを開いた時に記録される。LINEメッセージ自体の既読ではない。
2. LINE配信成功は到達を表し、Web閲覧を表さない。
3. `COPIED_*`後に`POSTED`がない場合も、外部SNSへ投稿したが完了報告していない可能性がある。
4. `SocialInsight`がない場合は「効果なし」ではなく「計測情報なし」である。
5. Feedback `BAD`だけでCONTENT障壁を確定せず、不採用理由とPersonalization Auditを併用する。

したがって行動ログだけで作れるのは`SUSPECTED`までであり、`CONFIRMED`には本人回答が必要である。

分類: **再利用 + ロジック拡張**。

## 10. SocialInsight / Post Performance

以下が実装済みである。

- アカウント単位の`SocialInsightSnapshot`
- 投稿単位のPerformanceを`PostRecord.manualMetrics`へ保存
- スクリーンショットAI読取と手入力
- likes、comments、saves、shares、profileViews、follows等
- Service、Membership、User、Bunshin、SocialProfileの再検証

Performance入力は利用者の明示操作に依存する。Barrier判定では次の3状態を分ける。

- データあり・反応あり
- データあり・反応が閾値未満
- データなし

分類: **再利用**。

## 11. LINE

既存LINE基盤には次がある。

- サービス共通/専用Channel設定
- 接続確認と有効化
- Mission通知
- 署名付きDeep Link
- Delivery / Attempt / Retry / Dead状態
- DeliveryとMissionを結ぶidempotency
- Deep Link消費日時

`PrismaLineMissionNotificationSummaryRepository`はMission、Bunshin、SocialProfile、Campaign、Business Profileをスコープ付きで解決する。

Barrier Evidenceでは次を分離する。

- Delivery `SENT`: LINE Providerへの送信成功
- Deep Link consumed: LINE等からWeb導線を開いた
- Mission `VIEWED`: WebでMission表示を記録した

`SENT`だけを「利用者が見た」と扱わない。

分類: **再利用**。

## 12. Activity Continuity

`ActivityContinuityRule`は環境別のActive Versionとして、週間目標や休眠日数を保持する。Serviceホーム、Daily Mission Job、進捗表示で再利用される。

これは休眠候補の閾値に使えるが、障壁カテゴリーやEvidence、確認結果は保持しない。PAUSED相当の候補抽出に利用し、Barrier状態をこのRuleへ詰め込まない。

分類: **再利用 + ロジック拡張**。

## 13. 90日Business Growth Program

現行`business-growth-program.ts`はBusiness Profile作成日から90日サイクル、日数、Phaseを算出する。`business-growth-actions.ts`はPhaseと曜日から次の表示用Actionを決める。

- POST
- PHOTO
- COMMENT_REPLY
- CUSTOMER_QUESTION
- PROFILE_IMPROVEMENT
- RESULT_REVIEW
- REST

この仕組みは無料支援の説明・小さい行動の候補として再利用できる。ただし次を持たない。

- 障壁状態
- Evidence
- 本人確認
- 支援実施履歴
- 改善判定
- OEM候補

したがってBarrier Coreの正本ではなく、無料支援カタログの一部として利用する。

分類: **部分再利用 + ロジック拡張**。

## 14. SNS Readiness / Service Manager / OEM

Service管理ホームは既に次を集計・表示する。

- 参加者数
- Mission生成数
- 採用・不採用・コピー・投稿数
- LINE送信数・失敗数
- AI成功・失敗数
- 直近7日の閲覧/Deep Link
- Business Pilot Metrics
- 投稿結果
- Launch Readiness

Service管理認可は`SERVICE_OWNER / SERVICE_ADMIN`を基準とし、Service Slug、Workspace、Group、Active Membershipを再検証する。HASSY支援候補一覧はこの管理境界へ追加できる。

既存管理画面にはBarrier、確認待ち、支援中、支援候補、解決済みの状態はない。

分類: 基盤は**再利用**、候補画面は**新規実装 + UI変更**。

## 15. Personalization Auditとの連携

サービス管理者向け`/s/[serviceSlug]/manage/personalization`は、Missionごとの生成状態、個別化根拠、AI/品質問題を確認する入口を持つ。

CONTENT候補を作る前に最低限、次を確認する。

1. 当該期間に生成障害・Fallback停止がない。
2. Business Profile、Strategy、Weekly Plan、本人履歴等の利用可能なContextが生成へ渡っている。
3. 不採用理由がCONTENTに関係する。
4. 同内容反復等のプラットフォーム品質問題ではない。

システム側の個別化不足ならBarrier/OEM候補にせず、運用障害として扱う。

分類: **再利用 + ロジック拡張**。

## 16. System Incident Exclusion

現行にはAI Usage、Job、LINE Delivery、生成失敗等のログがあるが、Barrier集計から除外するための統一された「利用不能期間」Projectionは確認できなかった。

H2では、少なくとも次を除外条件にする。

- 対象Missionの生成失敗・品質却下・配信停止
- LINE Delivery失敗
- Deep Link障害
- Scheduler/Worker未実行
- Content Pillar等のデータ整合性エラー
- Provider障害

障害ログをBarrier専用テーブルへ複製せず、既存ログから判定するRead Adapterを先に検討する。集計時に確実に再現できない場合だけ、小さいService Availability Projectionを提案する。

分類: **ロジック拡張**。必要な場合のみ最小の**新規実装**。

## 17. Barrier Core Gap

現行コードに次の正本はない。

- `SETUP / HOW_TO / TIME / EFFORT / CONTENT / MEDIA / CONFIDENCE / EFFECT / RESPONSE / LEAD / UNKNOWN`
- `SUSPECTED / CONFIRMED / RESOLVED / DISMISSED`
- Evidenceの観測窓、件数、閾値、ruleVersion
- 確認質問の表示間隔・回答・dismiss
- 無料支援の実施と改善確認
- Barrierの再発抑制

### 推奨境界

SNS Capability内でまず実装・検証する。DBモデル名は特定ブランド名を含めず、Service/Member/Bunshinを必須スコープとする。万能な全Capability Frameworkは作らない。

最低限の概念候補:

- Member Barrier Case
- Barrier Evidence Snapshot
- Barrier Confirmation
- Support Intervention

Evidenceは本文やPromptを保存せず、イベント種別、観測期間、件数、閾値、ruleVersion、参照IDの最小情報にする。

分類: **新規実装**。

## 18. OEM Support Candidate Gap

現行には障壁からOEM支援候補を生成し、対応状態を追跡する機能はない。

障壁状態とOEM対応状態は分離する。

- Barrier: `SUSPECTED / CONFIRMED / RESOLVED / DISMISSED`
- OEM対応: `OPEN / ACCEPTED / DISMISSED / COMPLETED`

候補生成条件:

1. 障壁がCONFIRMEDである。
2. 無料支援が実施済みである。
3. 再観測期間後も改善していない。
4. システム障害またはCONTENT品質問題ではない。
5. 同一Evidence/Ruleで未完了候補が存在しない。

Coreへ商品名・価格を固定せず、V1はカテゴリーと推奨支援種別までに留める。

分類: **新規実装 + UI変更**。

## 19. Security / Privacy

維持すべき既存境界:

- Workspace
- Service Group
- Group Membership
- User
- Bunshin
- Daily Mission

Service Adminが参照できるのは自Serviceの候補だけとする。候補一覧には次だけを表示する。

- 会社・店舗の表示名
- 障壁カテゴリー
- 集計Evidence
- 推奨支援
- 検知日時
- 対応状態

投稿本文全文、Memory、Prompt、Knowledge本文、LINE User ID、秘密値、AI内部推論を表示・Evidenceへ保存しない。

## 20. 推奨PR分割

### H0 — Current State Audit

- 本文書のみ
- DB/コード変更なし

### H1 — Minimal Onboarding

- 5項目の初回UI
- 安全な初期値
- 既存利用者互換
- Progressive Profilingの表示抑制
- ハッシーFeature適用境界

### H2-A — Barrier Contracts / Rules

- カテゴリー、状態、Evidence DTO
- ruleVersion
- 障害期間除外
- 決定的ルールのテスト

### H2-B — Barrier Persistence / Projection

- 最小Migration
- 冪等性
- Scope付きRepository
- 重複・再発抑制

### H3 — Confirmation / Free Support

- 1問UI
- CONFIRMED/DISMISSED
- 既存Business Growth Actionを使う無料支援
- 改善再判定とRESOLVED

### H4 — OEM Support Candidates

- 候補生成
- Service Admin一覧・状態変更
- 最小KPI
- 監査履歴

## 21. テスト計画

### 初期設定

- 最小5項目でBunshinと必要なSNS初期状態を作れる。
- 補完値が本人回答を上書きしない。
- Progressive Profiling未回答でもMissionを利用できる。
- 既存Business Profile利用者へ再入力を要求しない。
- ハッシー対象外Serviceへ適用しない。

### Barrier

- 代表パターンがSUSPECTEDまで進む。
- 行動だけではCONFIRMEDにならない。
- 同じEvidence/ruleVersionで重複しない。
- dismiss/resolved直後に再作成しない。
- LINE送信成功をMission閲覧に置き換えない。
- POSTED未報告を確定的未投稿にしない。
- SocialInsight欠損を効果なしにしない。
- システム障害期間を除外する。

### Isolation

- 他Workspace/Service/User/BunshinのEventを集計しない。
- Service Adminは自Serviceだけを閲覧・更新できる。
- Evidence参照IDを別Serviceへ差し替えても取得できない。

### OEM候補

- 無料支援前に作らない。
- 未確認障壁から作らない。
- CONTENT品質問題から作らない。
- 状態変更を監査できる。

## 22. Risks

| リスク                         | 影響                     | 対策                                      |
| ------------------------------ | ------------------------ | ----------------------------------------- |
| 自己申告イベントの欠損         | 未投稿・効果なしの誤判定 | UNKNOWN/確認質問を優先                    |
| LINE送信と閲覧の混同           | TIME等の誤判定           | Delivery、Deep Link、VIEWEDを分離         |
| 初期項目削減による生成品質低下 | 汎用投稿が増える         | 安全な初期値と早期Progressive Profiling   |
| 障害期間の営業候補化           | 信頼毀損                 | Availability除外をBarrier判定より先に実行 |
| BarrierとOEM状態の混在         | 監査不能                 | 別ライフサイクルで保持                    |
| 汎用化しすぎる                 | 実装肥大化               | SNSのみでPilot、実績後に共通化            |

## 23. Human Decisions Required

1. ハッシー対象Serviceを識別するFeature Keyまたは設定項目。
2. `businessFeatures`と`preferredTone`の初期補完値。
3. 各Barrierの初期観測期間・閾値。
4. 本人確認質問の最短再表示間隔。
5. 無料支援後の再観測期間。
6. OEM候補を閲覧できるService Role。
7. OEMごとの支援カテゴリー設定をH4でコード設定にするか、Versioned設定にするか。

## 24. H1へ進める条件

- 本監査内容の確認が完了している。
- ハッシー適用境界が決まっている。
- 初期5項目から不足項目を補完する方針が決まっている。
- 既存利用者を再オンボーディングさせないことに合意している。
- 千ノ国メディア等、他ServiceへHASSY UI/Ruleを適用しないテスト方針が承認されている。
