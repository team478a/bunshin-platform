# FREE SOCIAL MVP Rebaseline

作成日: 2026-08-19

基準: `team478a/bunshin-platform` main `6a325bf`

## 1. 現在の実装状況

実コード、Prisma schema、migration、既存実装報告を照合した結果は次のとおり。

| 領域                            | 状態     | 現在の範囲                                     |
| ------------------------------- | -------- | ---------------------------------------------- |
| Workspace / User / Membership   | 完了     | active membershipとtenant境界                  |
| Bunshin                         | 完了     | CRUD、Objective、Audience、Personality         |
| Owner Knowledge / Grant         | 完了     | 明示Grant、default deny                        |
| Bunshin Memory                  | 完了     | Bunshin単位、手動管理、soft delete             |
| Capability Assignment           | 完了     | SOCIAL assign/activate/suspendとACTIVE guard   |
| SocialProfile                   | 完了     | Core、API/UI、1 Bunshin/platform 1件           |
| ContentPillar                   | 完了     | Core、API/UI、手動管理                         |
| WeeklyPlan / Item               | 完了     | Core、API/UI、手動計画                         |
| DailyMission / MissionContent   | Core完了 | Persistence、strict content、lifecycle、1日1件 |
| Daily Mission API/UI            | 未実装   | Phase 4以降へ分離済み                          |
| Account Strategy                | 未実装   | 今回の追加方針                                 |
| MissionDecision / Activity      | 未実装   | 今回の追加方針                                 |
| PostRecord / MissionFeedback    | 未実装   | 今回の追加方針                                 |
| SOCIAL AI生成 / LINE / Provider | 未実装   | 後続Phase                                      |

現行定数:

```text
SocialPlatform:
  INSTAGRAM | TIKTOK | X | OTHER

SocialPreferredFormat:
  SLIDE | LIVE_ACTION | AI_VIDEO_PROMPT | IMAGE

DailyMissionStatus:
  GENERATED | VIEWED | STARTED | COMPLETED | SKIPPED | EXPIRED
```

既存のDailyMission lifecycle、通常Missionの`workspaceId + bunshinId + missionDate`一意性、MissionContent必須1対1aggregateは維持する。

## 2. 今回追加された事業方針

BUNSHIN SOCIAL FREEは、SNS制作・投稿の完全自動化サービスではない。ユーザー専用のSNS戦略を作り、毎日「今日はこれをしてください」と具体的に指示するAI企画担当である。

BUNSHINの担当:

- SNSアカウント設計と発信戦略
- Content Pillar / Weekly Plan / Daily Mission
- 投稿文、スライド構成、撮影台本、外部AI向け動画Prompt
- 採用/不採用、copy、投稿、本人らしさのRaw Event蓄積

ユーザーの担当:

- 必要に応じたCanva等での画像制作
- 必要に応じたGemini/Veo等での動画生成
- 内容のcopy、SNSへの手動投稿、投稿完了報告

FREEではSNS OAuth、自動投稿、自動画像/動画生成、高度Analytics、コメント自動返信を行わない。

## 3. FREEユーザーフロー

```text
登録
-> Bunshin作成
-> SOCIAL Capability有効化
-> SNS選択
-> Account Strategy Wizard
-> SNS戦略生成
-> ユーザー承認
-> Content Pillar
-> Weekly Plan
-> Daily Mission
-> 今日の投稿案
-> 採用 / 不採用
-> 採用後にcopy
-> ユーザー自身で制作・投稿
-> 投稿しました
-> 簡易Feedback
-> Raw Event蓄積
-> 後続Phaseで傾向学習
```

大量アンケートを避け、日々の採用・不採用・copy・投稿・Feedbackから自然にデータを蓄積する。

## 4. Account Strategy

SocialProfileは接続先と手動運用設定を表し、SocialAccountStrategyは「そのSNSアカウントをどう育てるか」を表す。

候補model:

```text
SocialAccountStrategy
  id UUID
  workspaceId
  bunshinId
  socialProfileId
  platform
  goal
  availableMinutes 3 | 5 | 10 | 20
  destinationType
  destinationDetail nullable
  concept
  positioning
  targetSummary
  profileDraft
  ctaStrategy
  postingPolicy
  version
  status DRAFT | PROPOSED | APPROVED | SUPERSEDED
  approvedAt nullable
  supersededAt nullable
  createdAt
  updatedAt
```

戦略を上書きせずversion管理する。同じSocialProfile内でversionを一意にし、現在のAPPROVED Strategyを最大1件にする。部分一意index等の具体的DB制約はStrategy Core指示書で確定する。

Wizardは最大7問程度とし、発信テーマ、Audience、目的、1日利用時間、誘導先を取得する。顔出し/声出しと雰囲気は既存Bunshin Personalityを正本とし、Strategyへ重複保存しない。

Strategy生成へ渡せるのは、対象BunshinのIdentity / Objective / Audience / Personality、同一BunshinのSocialProfile、Wizard回答、明示Grant済みOwnerKnowledgeだけである。Memory利用は後続Phaseとする。

## 5. SNS Platform追加

無料MVP候補:

```text
INSTAGRAM | TIKTOK | X | THREADS | YOUTUBE_SHORTS | OTHER
```

FREEでは原則1 Bunshin = 1 Primary SNSとする。ただし現行の`workspaceId + bunshinId + platform`一意制約と将来の複数SNS対応は維持する。

Primary SNSのDB表現候補:

1. `SocialProfile.isPrimary`とBunshin単位の部分一意index
2. BunshinまたはSOCIAL設定resourceからprimarySocialProfileIdを参照
3. APPROVED Strategyの対象ProfileをPrimary扱い

推奨は1だが、migration前に人間レビューで決定する。既存Profileが複数ある場合のbackfillルールを推測しない。

## 6. TEXT形式

`SocialPreferredFormat`へ`TEXT`を追加する。

```text
TEXT | SLIDE | LIVE_ACTION | AI_VIDEO_PROMPT | IMAGE
```

TEXT追加はTypeScript定数、Prisma enum、SocialProfile preferredFormats、WeeklyPlanItem、DailyMission、MissionContent複合FK、strict validation、API/UI、fixtureへ影響するため独立migration PRで扱う。

候補TEXT content:

```text
body
threadParts[]
cta nullable
caption nullable
hashtags[]
```

X用/Threads用Enumを増やさず、platform-awareな生成ルールとformat別schemaで表現する。

## 7. Daily Mission

既存lifecycleを維持する。

```text
GENERATED -> VIEWED -> STARTED -> COMPLETED
GENERATED | VIEWED | STARTED -> SKIPPED | EXPIRED
```

採用/不採用は進行状態ではないためDailyMissionStatusへ追加しない。MissionDecision、MissionActivity、PostRecord、MissionFeedbackを別resourceとして関連付ける。

通常Missionは引き続きWorkspace/Bunshin/local dateで1件とする。別案はContent Generator Phaseで設計し、既存一意性を黙って緩めない。

## 8. Mission Decision

候補model:

```text
MissionDecision
  id UUID
  workspaceId
  bunshinId
  dailyMissionId
  decision PENDING | ACCEPTED | REJECTED
  rejectionReason nullable
  rejectionDetail nullable
  decidedAt nullable
  createdAt
  updatedAt
```

1 Missionにつき現在判断1件とする。履歴はDecision rowを増やさずMissionActivityへ残す。

不採用理由候補:

```text
NOT_MY_STYLE | WRONG_TOPIC | TOO_DIFFICULT | TOO_MUCH_WORK
SIMILAR_TO_PAST | TOO_SALESY | NOT_TODAY | OTHER
```

OTHER以外はワンタップとし、文章入力を要求しない。OTHERだけ任意詳細を許可する。

未決事項: Mission作成transactionでPENDING Decisionを必ず作るか、Decision未作成をPENDINGと解釈するか。推奨は前者であり、Strategy/Decision Core指示書で確定する。

## 9. Mission Activity

Activityは現在状態ではなくappend-only Raw Eventである。

候補model:

```text
MissionActivity
  id UUID
  workspaceId
  bunshinId
  dailyMissionId
  actorUserId
  type
  occurredAt
  idempotencyKey nullable
  metadata Json nullable
  createdAt
```

候補type:

```text
VIEWED | ACCEPTED | REJECTED
COPIED_TEXT | COPIED_SLIDE | COPIED_VIDEO_PROMPT | COPIED_SCRIPT
REGENERATED | POSTED
FEEDBACK_GOOD | FEEDBACK_NEUTRAL | FEEDBACK_BAD
```

イベント時刻を必ず保存する。連打・network retry・ブラウザ再送を重複計上しないようidempotency境界を持つ。metadataはevent別strict schemaとし、Knowledge、Memory、投稿全文、credential、Provider payloadを保存しない。

DailyMission VIEWEDはlifecycle現在状態、Activity VIEWEDはRaw Eventとして責務を分ける。

## 10. Copy UX

Mission表示直後はcopyを主操作にせず、最初に次を表示する。

```text
[採用する]
[今回は使わない]
```

採用後にformat別copy操作を表示する。

- TEXT: 投稿文をコピー
- SLIDE: 全部コピー / 各スライドをコピー
- AI_VIDEO_PROMPT: 動画生成Prompt / 投稿文をコピー
- LIVE_ACTION: 撮影台本 / 投稿文をコピー
- IMAGE: 画像指示 / 投稿文をコピー

採用とcopyは別イベントで計測する。clipboard成功後にだけCOPY Activityを保存し、失敗を成功として記録しない。

## 11. PostRecord

FREEのPostRecordはユーザーの「投稿しました」という自己申告を保存する。

```text
PostRecord
  id UUID
  workspaceId
  bunshinId
  dailyMissionId
  platform
  postedAt
  postUrl nullable
  externalPostId nullable
  source MANUAL
  manualMetrics Json nullable
  createdAt
  updatedAt
```

通常Missionは1投稿を基本とする。POSTED Activity、DailyMission COMPLETED、PostRecordをどこまで同一transactionにするかは3.7指示書で確定する。SNS API投稿、外部Post ID取得、metrics自動取得は行わない。

## 12. Feedback

投稿後に本人らしさだけを簡単に聞く。

```text
GOOD | NEUTRAL | BAD
```

MissionFeedbackはMissionDecisionやPostRecordと別resourceにする。投稿したかどうかをFeedbackへ重複保存せず、PostRecordをOutcome事実の正本とする。

## 13. PreferenceとOutcomeの分離

Preference:

- accepted / rejected / rejection reason
- copy
- fit feedback

Outcome:

- posted
- manual views等
- 将来のprofile access / LINE registration / inquiry / conversion

採用率だけを成果と見なさず、好みと市場成果を別概念として保持する。不採用1件をそのままBunshinMemoryへ登録しない。FREEではRaw Eventを保存し、複数行動から傾向候補を生成する処理は後続Phaseへ延期する。

## 14. Share / Referral

Strategyは、ユーザーが明示操作した場合だけ、個人情報・Knowledge・Memoryを含まない共有カードへ変換できる将来設計とする。

Referral候補:

```text
referralCode
referrerUserId
referredUserId
source
createdAt
activatedAt nullable
```

Daily Mission MVPより優先しない。FREE継続率を確認したPhase 8以降に実装判断する。現金報酬、ランキング、代理店制度は実装しない。

## 15. Segmentationの将来方針

将来、Raw Activityから次のようなMarketing Segmentを生成できる境界を維持する。

```text
HIGH_SOCIAL_ENGAGEMENT
SIDE_HUSTLE_BEGINNER
BUSINESS_OWNER
VIDEO_INTEREST
BLOG_INTEREST
AUTOMATION_NEED
LEAD_GENERATION_INTENT
```

BunshinMemoryとMarketing Segmentを同じtableへ入れない。Segmentation、Need Detection、Offer Matching、Marketing利用は明示同意とプライバシー境界を承認した後に実装する。

## 16. 外部Providerを今実装しない理由

検証したいのは、BUNSHINの具体的な指示が利用者の継続行動を生むかであり、自動制作・自動投稿の技術成立ではない。Providerを先に導入すると費用、OAuth審査、障害、credential、再試行、規約対応が検証を遅らせる。

Research、Publishing、Design、Video、Voiceは将来も次の境界に限定する。

```text
Domain/Application Port
-> Provider Adapter
-> External Service
```

Core、MissionContent、Activity metadataへProvider SDK型やresponseを保存しない。

## 17. PR分割

1. Free SOCIAL MVP Rebaseline — 文書のみ
2. Social Platform / Format Expansion — THREADS、YOUTUBE_SHORTS、TEXT
3. Social Account Strategy Core — version、approval、repository/test
4. Account Strategy Wizard API/UI — AI生成なしでも入力・確認可能
5. Strategy Generator — structured AI、Grant済みKnowledge、Provider abstraction
6. Daily Mission API/UI — 既存Coreをverified sessionへ接続
7. Mission Decision / Activity — 採用、不採用、理由、copy event
8. PostRecord / Feedback — 投稿完了、GOOD/NEUTRAL/BAD
9. Daily Mission AI Generator — platform/format別生成
10. Share / Referral MVP — FREE継続率確認後

各PRでCore PersistenceとAPI/UIを必要に応じて分離する。実装前指示書を先にレビューし、複数機能を1PRへ混在させない。

## 18. DB変更候補

- `SocialPlatform`: THREADS / YOUTUBE_SHORTS追加
- `SocialPreferredFormat`: TEXT追加
- Primary SNS表現
- `SocialAccountStrategy`とversion/status制約
- `MissionDecision`とrejection enum
- append-only `MissionActivity`とidempotency制約
- `PostRecord`、source、manualMetrics
- `MissionFeedback`

この文書PRではschema/migrationを変更しない。各変更は既存データのbackfill、複合FK、unique/index、rollbackを独立レビューする。

## 19. Isolation Test

各resourceとAI contextで最低限次を実証する。

- Cross User / Cross Workspace / Cross Bunshinを拒否
- archive済みBunshin、inactive Workspace/Memberを拒否
- SOCIAL未割当、SUSPENDED、LOCKEDでmutationを拒否
- Assignment停止中も許可された履歴readを維持
- Strategyへ別BunshinのSocialProfileを指定できない
- MissionDecision/Activity/PostRecord/Feedbackへ別BunshinのMissionを指定できない
- Strategy Generatorが別User/Workspace/BunshinのMemoryを参照しない
- GrantされていないOwnerKnowledgeをAI入力へ含めない
- 通常Missionの日付一意性を維持
- event retryでKPIを二重計上しない

Platform Admin overrideを各resourceへ暗黙追加しない。

## 20. FREE MVP KPI

Funnel:

```text
Registration
-> Bunshin Creation
-> SOCIAL Activation
-> Strategy Completion
-> Strategy Approval
-> First Mission View
-> Mission Acceptance
-> Copy
-> Posted
-> D7 Active
```

最重要KPI:

> 7日間でBUNSHINの指示に従って3回以上実際に投稿したユーザー率

補助KPI:

- Strategy承認率
- Mission採用 / 不採用率と不採用理由
- Copy率、採用からCopy率、CopyからPosted率
- Mission完了率
- D1 / D7 / D30
- 別案率、Feedback GOOD率
- 1 Active User当たりAI原価

Share/Referral実装後はStrategy Share率、Referral Link Click、Registration、Bunshin Creation、D7を別funnelで測る。紹介人数だけを成功指標にしない。

## 21. 停止条件と人間レビュー

本PRは文書だけで停止する。次を承認するまでPlatform/Format migrationへ進まない。

- SocialAccountStrategyの型、version、approval
- Primary SNSのDB表現と既存Profile backfill
- THREADS / YOUTUBE_SHORTS / TEXT追加
- MissionDecisionのPENDING行
- Mission lifecycleとの責務分離
- MissionActivityのevent type、metadata、idempotency
- PostRecordとFeedbackの責務
- Referral着手条件
- FREE MVP範囲とKPI

成功条件はSNS完全自動化ではなく、BUNSHINの指示によりユーザーが継続して実際の行動を起こすことである。
