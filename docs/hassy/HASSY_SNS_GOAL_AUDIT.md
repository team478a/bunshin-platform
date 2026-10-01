# ハッシー SNS運用目的対応監査

調査日: 2026-10-01（Asia/Tokyo）

調査ブランチ: `codex/hassy-sns-goal-audit`

調査基準: `origin/main` / `581bb1a2e57482c77cf943b6119b020ff732a9df`

対象: `team478a/bunshin-platform` の実コード、schema、既存テスト、新規characterization test

非対象: 本番DB、本番のハッシーService設定、実ユーザー、外部AI実生成、LINE実送信

## 1. Executive Summary

**結論: 現状を「主要GoalについてLEVEL 4対応済み」とは判定できない。主要Goalは概ねLEVEL 2、信頼形成・専門性は明示GoalとしてLEVEL 0である。**

目的情報を保持する場所が複数あり、正本と同期規則がない。

1. `ServiceMemberBusinessProfile.primaryPurpose`: `ATTRACT / RESERVATION / SALES / RECRUITING / AWARENESS / RETENTION`
2. `SocialAccountStrategy.goal`: `FOLLOWERS / LINE_REGISTRATION / INQUIRY / SALES / RECRUIT / BRAND_AWARENESS / BLOG_TRAFFIC / OTHER`
3. `SocialProfile.purpose`: 自由文
4. `Bunshin.objectiveSummary` と `BunshinObjective.primaryGoal`: Bunshin全体の目的
5. `WeeklyPlanItem.goal`: 生成された各投稿の自由文Goal

事業プロフィールの目的とSNS戦略Goalは名称も対象範囲も異なり、相互変換・同期が実装されていない。特にServiceの簡易初回設定は、事業プロフィールの`primaryPurpose`に関係なく、新規戦略を常に`BRAND_AWARENESS`で生成する。

`SocialAccountStrategy.goal`はStrategy生成Promptには明示的に渡る。一方、Weekly Plannerの入力にはGoalがなく、Strategyが生成した自由文（concept、CTA等）に目的差が残ることを暗黙に期待している。Daily/Contentでは、Goalは承認戦略の型付きフィールドではなくgenericなpersonalization signalとして渡り、別系統の`businessProfile.primaryPurpose`も渡る。目的別のテーマ、CTA、KPIを保証する規則や検証はない。

今回追加した外部通信なしのcharacterization testでは、同じ美容室・同じ生成済み戦略文で`SocialAccountStrategy.goal`だけを5種類変更しても、Weekly Plannerへ渡る入力が完全に同一になることを再現した。Daily/Content向けpersonalizationにはGoal文字列が残るが、目的別ルールはない。これは「Goalが保存されPromptの一部へ入る」ことの証拠であり、「戦略そのものが目的別に変わる」証拠ではない。

V1の最小修正方針は、SOCIAL capability内に正規化したSNS Goal snapshotと目的別方針を置き、既存2語彙を境界Adapterで変換し、Weekly/Daily/Content/CTAへ明示伝播することである。共通User、AI研修、占い、千ノ国メディアへハッシー固有ロジックを入れない。結果評価のGoal対応（LEVEL 5）は、LEVEL 4確立後に段階導入する。

## 2. 現在のSNS Goal実装

| 概念                    | 実フィールド・型                                              | 役割                                                              | 現状の問題                                                         |
| ----------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| Service参加者の発信目的 | `ServiceMemberBusinessProfile.primaryPurpose: String`         | ハッシーの事業プロフィール。Daily/Contentのbusiness contextへ入る | DBは自由文字列だがAPI/UIは6値。Strategy Goalと同期しない           |
| SNSアカウント戦略Goal   | `SocialAccountStrategy.goal: SocialAccountStrategyGoal`       | Strategy生成・承認版に保存                                        | 予約・来店・リピート・信頼形成がない。簡易初回設定では常に認知     |
| SNSプロフィール目的     | `SocialProfile.purpose: String`                               | SNS設定・personalization signal                                   | 自由文で上記2系統との正本関係なし                                  |
| Bunshin目的             | `Bunshin.objectiveSummary`、`BunshinObjective.primaryGoal`    | Bunshin全体の長期目的                                             | current SNS goalとの区別がない                                     |
| Weekly投稿Goal          | `WeeklyPlanItem.goal: String`                                 | 週内の各投稿の生成結果                                            | アカウントGoalのsnapshotではなくAI出力自由文                       |
| 登録プロフィール目的    | `UserRegistrationProfile.primaryPurpose`、`secondaryPurposes` | 共通登録                                                          | Service固有のハッシー目的正本には使えない。Service分離を維持すべき |

主なシンボル:

- `SOCIAL_ACCOUNT_STRATEGY_GOALS` / `SocialAccountStrategyGoal`
- `StrategyGeneratorInput.goal`
- `MissionBusinessProfileContext.primaryPurpose`
- `WeeklyPlannerInput.approvedStrategy`
- `DailyMissionPlannerProviderInput.approvedStrategy`
- `buildMissionPersonalizationContext`
- `BUSINESS_OUTCOME_KEYS`
- `POST_PERFORMANCE_METRIC_KEYS`

## 3. 現在選択可能なGoal

### 3.1 Service onboarding（ハッシー事業プロフィール系）

`service-onboarding-form.tsx` と `service-onboarding.ts` が受け付ける値:

| 値            | UI表示                 | A UI | B DB | 備考                                     |
| ------------- | ---------------------- | ---: | ---: | ---------------------------------------- |
| `ATTRACT`     | 集客                   |  Yes |  Yes | 来店・問い合わせのどちらかは特定しない   |
| `RESERVATION` | 予約                   |  Yes |  Yes | Strategy enumに対応値なし                |
| `SALES`       | 販売                   |  Yes |  Yes | Strategy側にも同名値はあるが自動同期なし |
| `RECRUITING`  | 採用                   |  Yes |  Yes | Strategy側は`RECRUIT`で値が異なる        |
| `AWARENESS`   | 認知                   |  Yes |  Yes | Strategy側は`BRAND_AWARENESS`            |
| `RETENTION`   | 既存顧客との関係づくり |  Yes |  Yes | Strategy enumに対応値なし                |

問い合わせ、信頼形成・専門性、その他自由目的はこのUIから明示選択できない。

### 3.2 Account Strategy UI

`account-strategy-section.tsx` が表示する値:

| 値                  | UI表示                   | A UI | B DB |
| ------------------- | ------------------------ | ---: | ---: |
| `FOLLOWERS`         | 見てくれる人を増やす     |  Yes |  Yes |
| `LINE_REGISTRATION` | LINEに登録してもらう     |  Yes |  Yes |
| `INQUIRY`           | 問い合わせを増やす       |  Yes |  Yes |
| `SALES`             | 商品を買ってもらう       |  Yes |  Yes |
| `RECRUIT`           | いっしょに働く人を探す   |  Yes |  Yes |
| `BRAND_AWARENESS`   | 名前や活動を知ってもらう |  Yes |  Yes |
| `BLOG_TRAFFIC`      | ブログを読んでもらう     |  Yes |  Yes |
| `OTHER`             | その他                   |  Yes |  Yes |

来店、予約、リピーター、信頼形成・専門性は独立した型付きGoalとして存在しない。`OTHER`には自由目的名や目的別方針を保存する別フィールドがない。

### 3.3 A〜H対応表

記号: `○` 明示対応、`△` 間接・generic Promptのみ、`×` 未対応、`?` 実生成未確認。

| 利用者が意図するGoal |                 A UI | B DB | C Context | D Weekly | E Daily | F CTA | G 結果評価 | H 次回提案 |
| -------------------- | -------------------: | ---: | --------: | -------: | ------: | ----: | ---------: | ---------: |
| 認知                 |           ○（2語彙） |    ○ |         ○ |        △ |       △ |     △ |          × |          △ |
| 来店                 |       △（`ATTRACT`） |    ○ |         ○ |        × |       △ |     △ |          × |          △ |
| 予約                 |   ○（`RESERVATION`） |    ○ |         ○ |        × |       △ |     △ |          × |          △ |
| 問い合わせ           |    ○（Strategyのみ） |    ○ |         ○ |        △ |       △ |     △ |          × |          △ |
| リピーター           |     ○（`RETENTION`） |    ○ |         ○ |        × |       △ |     △ |          × |          △ |
| 採用                 |           ○（2語彙） |    ○ |         ○ |        △ |       △ |     △ |          × |          △ |
| 販売                 |           ○（2語彙） |    ○ |         ○ |        △ |       △ |     △ |          × |          △ |
| 信頼形成・専門性     | ×（`OTHER`代用のみ） |    △ |         △ |        × |       △ |     △ |          × |          △ |

`H`の△は、最近のGOOD/BAD、事業成果、投稿指標が次週入力へ入るため。ただし「現在Goalに対する成果」として評価・選択されない。

## 4. DB / Schema

### 4.1 現在の保存構造

- `ServiceMemberBusinessProfile.primaryPurpose`: `String @db.VarChar(80)`。Service Membership単位でWorkspace/Group/Userを含む複合境界を持つ。
- `SocialAccountStrategy.goal`: Prisma enum。`socialProfileId + version`で版管理し、`APPROVED / SUPERSEDED`を持つ。
- `SocialProfile.purpose`: 自由文。
- `WeeklyPlanItem.goal`: 自由文。
- `GenerationContextSnapshot.payload.strategy`: strategyの`id`と`version`は保存するが、Goal値自体のsnapshotはない。
- `MissionFeedback.rating`: `GOOD / NEUTRAL / BAD`のみ。Goal、KPI、評価理由を持たない。
- `PostRecord.manualMetrics`: 投稿反応と事業成果をJSONで保持できるが、Goal snapshotとの関連を持たない。

### 4.2 Primary / Secondary / Weight / 期間

ハッシーServiceの正本候補である`ServiceMemberBusinessProfile`と`SocialAccountStrategy`はいずれも単一Goalのみ。secondary goals、weight、`effectiveFrom/effectiveUntil`はない。共通登録の`secondaryPurposes`は存在するが、Service境界と目的語彙が異なるため流用不可。

V1で数値設定UIを先行させる必要はない。最小案はStrategy versionに次をsnapshotすること:

```ts
type SocialGoalSnapshotV1 = {
  primary: SocialGoalKey;
  secondary: Array<{ goal: SocialGoalKey; weight: number }>;
  sourceBusinessPurpose: string | null;
  policyVersion: string;
};
```

初期V1は`primary`必須、`secondary=[]`でもよい。weightは内部既定値とし、合計100をvalidationする。期間指定はキャンペーン・求人期間の実要件が出るまで、Strategy versionの`approvedAt/supersededAt`を有効期間として再利用する方が過剰設計を避けられる。

## 5. Onboarding

Service onboardingは事業プロフィールをService Membership内へ保存し、User共通プロフィールへ混在させない点は適切である。しかし初回投稿設定への接続に欠落がある。

```text
Service onboarding primaryPurpose
  └─ ServiceMemberBusinessProfileへ保存
      ├─ Bunshin objectiveSummary生成へ利用
      ├─ Daily/Content businessProfileへ利用
      └─ × SimpleFirstPostSetupのSocialAccountStrategy.goalへ変換されない
           └─ 常に BRAND_AWARENESS
```

このため、採用・予約・販売を選んでも、最初に承認されるSNS戦略Goalは認知になる。後段には事業プロフィール目的と戦略Goalの矛盾した2 signalが渡り得る。

## 6. Goal Propagation Map

```text
Service Onboarding UI
  primaryPurpose (6値)
       │
       ├──────────────→ ServiceMemberBusinessProfile
       │                         │
       │                         ├─→ Daily planner businessProfile.primaryPurpose
       │                         ├─→ Content generator businessProfile.primaryPurpose
       │                         └─→ Quality checker businessProfile.primaryPurpose
       │
       └─×→ Simple first-post strategy mapping
               └─ fixed BRAND_AWARENESS

Account Strategy UI / API
  goal (8値)
       │
       ├─→ SocialAccountStrategy.goal + version/status
       ├─→ StrategyGeneratorInput.goal
       │     └─→ generated concept/positioning/ctaStrategy/postingPolicy
       │
       ├─×→ WeeklyPlannerInput.approvedStrategy.goal
       │     └─ only generated strategy text reaches Weekly
       │
       └─→ personalization ACCOUNT_STRATEGY signal as text
             ├─→ Daily planner
             ├─→ Content generator
             └─→ Quality checker

Weekly output free-text goal
  └─→ Daily weeklyItem.goal
       └─→ Content brief/theme/reason

Feedback / Result
  GOOD/NEUTRAL/BAD + manual metrics + business outcomes
       └─→ next Weekly recentPerformance
             └─× goal-specific KPI interpretation
```

現在は1本のGoal propagationではなく、`primaryPurpose`、typed strategy goal、generated weekly goalの3本が後段で合流する構造である。

## 7. Strategyへの反映

`OpenAIStrategyGenerator`は`StrategyGeneratorInput`全体をJSONで渡すため、typed goalはProviderへ届く。これはLEVEL 2の根拠になる。

ただしsystem instructionは目的別テーマ・CTA・禁止事項を定義していない。出力schemaもgenericな6項目のみで、Goal snapshotやKPIは出力しない。今回、有料Providerでの同条件比較を実行していないため、実生成結果の目的差は未確認。Goal文字列を渡しているだけでLEVEL 3とはしない。

## 8. Weekly Planへの反映

`WeeklyPlanGenerationService`は承認戦略から次だけをPlannerへ渡す。

- `concept`
- `positioning`
- `targetSummary`
- `ctaStrategy`
- `postingPolicy`

`strategy.goal`、`businessProfile.primaryPurpose`、Goal別KPIは渡さない。したがってStrategy生成文が同一または差が弱い場合、Weekly Planは目的を識別できない。

characterization testでは、同じ美容室情報・同じ戦略生成文を固定し、Goalだけを`BRAND_AWARENESS / INQUIRY / SALES / RECRUIT / FOLLOWERS`へ変更した。5回のWeekly Planner inputはbyte-equivalentで、`approvedStrategy.goal`が存在しないことを確認した。

## 9. Dailyへの反映

Dailyのtyped `approvedStrategy`入力からもGoalは除外される。一方、`buildMissionPersonalizationContext`が`ACCOUNT_STRATEGY` signalへ`目標: ${strategy.goal}`を入れる。またService利用時は`businessProfile.primaryPurpose`も別signal・専用fieldとして渡す。

Daily promptは`primaryPurpose`へ役立つtopic/reasonを要求するためLEVEL 2のPrompt接続はある。しかし、2系統が矛盾した場合の優先規則、目的別テーマpolicy、差分合格条件はない。

## 10. Themeへの反映

Weeklyの`WeeklyPlanItem.goal/angle`とDailyの`topic/angle/reason`は生成結果として存在する。業種、対象顧客、履歴、目的を使う一般指示もある。ただしGoal別のテーマ軸（採用なら職場・仕事内容、リピートならアフターケア等）をコードまたはversioned policyとして定義していない。

したがって「末尾CTAだけ違い、テーマは同じ」を自動的に不合格にする検査はない。現在のQuality checkerも事業プロフィールとの関連は見るが、Goal Differentialそのものは評価しない。

## 11. Contentへの反映

Content generatorにはDaily brief、戦略自由文、business profile、personalization、履歴等が渡る。`primaryPurpose`との関連、過去の低評価回避、反応の良かった読者価値の別角度展開は指示される。

一方、typed Goal別の内容構造はない。よって投稿本文に目的差が出る可能性はあるが、実コードで保証されず、外部AI実生成なしではLEVEL 3を確認できない。

## 12. Photo / Video Ideaへの反映

形式別出力は実装済み。

- TEXT: `photoInstruction`
- SLIDE / IMAGE: 各slideの`visualScene`
- LIVE_ACTION: `shootingInstruction`とscript
- AI_VIDEO_PROMPT: Provider非依存の動画Prompt

ただしこれらはBriefと本文に従うgeneric生成であり、Goal別の撮影方針はない。たとえば採用なら「働く人・職場・1日の仕事」、予約なら「入口・施術工程・メニュー」のような差を検査する仕組みは未実装。

## 13. CTAへの反映

Strategyには`destinationType/detail`と生成済み`ctaStrategy`があり、ContentはCTAを生成する。このためCTAへ影響する経路は存在する。

しかしGoalとdestinationの整合validationはない。簡易初回設定はGoal=`BRAND_AWARENESS`、destination=`PROFILE`に固定する。事業プロフィールで予約・採用・販売を選んでも自動変更されない。目的別CTA辞書や、生成CTAが承認Goalへ合致するかのQuality ruleもないため、現状は間接対応である。

## 14. Resultへの反映

### 14.1 現在取得できる結果

- 感覚評価: `GOOD / NEUTRAL / BAD`
- 事業成果: `inquiries / reservations / visits / orders / other`
- 投稿指標: `reach / impressions / likes / comments / saves / shares / profileViews / follows`
- 投稿済み記録、採用・不採用理由、最近の投稿・形式

これらは次週の`recentPerformance`へ渡されるため、一般的な改善loopは存在する。

### 14.2 Goal別評価の欠落

- 結果記録時点のGoal snapshotがない。
- GoalごとのKPI選択がない。
- `GOOD`はUI上「自分らしい」であり、目的達成を意味しない。
- 問い合わせGoalでreachだけが増えた場合などを区別しない。
- 次週Plannerは全事業成果を受け取るが、現在Goalに対する優先指標を知らない。

したがってLEVEL 5ではない。V1の最小拡張は「この投稿は今回の目的に役立ったか」を`YES / NO / UNKNOWN`で任意取得し、generation時のGoal snapshotへ紐付けること。自動取得できない来店・採用結果を取得済みと扱わない。

## 15. Goal Differential Test

### 15.1 実行条件

固定fixture: 同一の美容室、Instagram、同一対象顧客、同一商品、同一Pillar、同一戦略生成済み自由文。変数はGoalのみ。外部通信・有料AI・DBは不使用。

実行テスト:

`apps/web/test/hassy-sns-goal-propagation-characterization.test.ts`

### 15.2 比較結果

| 比較対象                    | Awareness                       | Visit/Reservation     | Inquiry        | Repeat      | Recruitment    | 判定                    |
| --------------------------- | ------------------------------- | --------------------- | -------------- | ----------- | -------------- | ----------------------- |
| Onboarding保存              | `AWARENESS`                     | `ATTRACT/RESERVATION` | 選択肢なし     | `RETENTION` | `RECRUITING`   | 語彙が不均一            |
| 初回Strategy Goal           | `BRAND_AWARENESS`固定           | 同左                  | 同左           | 同左        | 同左           | 差なし・不合格          |
| Strategy Prompt             | typed goalあり                  | typed値なし           | typed goalあり | typed値なし | typed goalあり | 一部のみ                |
| Weekly Plan入力             | Goalなし                        | Goalなし              | Goalなし       | Goalなし    | Goalなし       | Goal-only差なし・不合格 |
| Daily theme/reason入力      | generic signal + primaryPurpose | 同構造                | 同構造         | 同構造      | 同構造         | Prompt接続のみ          |
| Content / photo-video / CTA | generic signal依存              | 同構造                | 同構造         | 同構造      | 同構造         | 実出力差未確認          |
| recommendation reason       | Daily `reason`あり              | 同構造                | 同構造         | 同構造      | 同構造         | 目的別品質未確認        |

このテストは「現在の配線」を検証するcharacterizationであり、AI出力品質をfakeで作って合格扱いしていない。実ProviderによるStrategy、Weekly、Daily、本文、写真案、CTAの比較は未実行である。現在の配線に明示的な断絶があるため、先に契約を修正してから、固定seed相当の評価fixtureと人手rubricでLEVEL 4を検証すべきである。

## 16. Goal対応レベル

| Goal                | 現在Level | 根拠                                          | V1目標との差                                 |
| ------------------- | --------: | --------------------------------------------- | -------------------------------------------- |
| Awareness           |         2 | 2系統のUI/DB、Strategy・Daily Promptへ入る    | Weekly明示伝播、差分検証、CTA整合が不足      |
| Visit / Reservation |         2 | business primaryPurposeはDaily/Contentへ入る  | Strategy enumとWeeklyにない                  |
| Inquiry             |         2 | Strategy enum/Prompt、事業成果記録あり        | onboarding選択肢、Weekly、Goal-KPI評価がない |
| Repeat              |         2 | `RETENTION`がDaily/Contentへ入る              | Strategy enum、Weekly、repeat KPIがない      |
| Recruitment         |         2 | 2語彙で保存・Prompt接続                       | 値同期、テーマpolicy、CTA検査がない          |
| Sales               |         2 | 2語彙で保存・Prompt接続、orders記録           | 同期、Weekly、購入CTA検査がない              |
| Trust / Expertise   |         0 | 明示Goalなし。`OTHER`や自由文で代用可能なだけ | 正規Goal、policy、KPIが必要                  |

LEVEL 3（生成内容に目的差）も、今回の非課金テストでは確認できない。LEVEL 4達成の宣言にはStrategy→Weekly→Daily→Theme→Content→CTAを同一fixtureで比較する合格証跡が必要。

## 17. Goal変更時の挙動

新Strategyを作成・承認すると版履歴は維持され、過去を削除しない設計は良い。一方で、既に存在するWeekly Planはjob modeでそのまま返され、manual modeではconflictになる。既存Daily Missionも同様に再利用される。このためGoal変更が「次回生成」へ入っても、確定済みWeekly/Dailyを自動再生成しない。

望ましいV1規則:

1. 過去のStrategy、Weekly、Daily、結果は変更しない。
2. Goal変更時に新Strategy versionを作り、適用開始日時を記録する。
3. 未生成の次週から新Goalを使う。
4. 既に確認済み・採用済みの投稿を勝手に差し替えない。
5. 今週途中の再計画は利用者の明示操作で新revisionとして行う。

## 18. Goal × 履歴

現状はCompany Profile、Target、Strategy自由文、Weekly、Recent Posts、Accepted/Rejected、Posted、Feedback、Post Performance、Business Outcomesを広く収集する。Workspace/Service/User/Bunshin境界もRepositoryで維持されている。

不足は、履歴を「どのGoalのもとで作った投稿・結果か」と解釈するsnapshotである。Goal変更後も過去履歴は利用価値があるが、新Goalの成功例として無条件にランキングしてはいけない。`generationContext`にcanonical Goal snapshotとpolicy versionを残し、同Goalの履歴を優先しつつ、他Goal履歴は表現嗜好・禁止事項など目的非依存の学習に限定する。

## 19. Goal × Barrier

障壁発見は`SETUP / HOW_TO / TIME / EFFORT / CONTENT / MEDIA / CONFIDENCE / EFFECT / RESPONSE / LEAD / UNKNOWN`を持ち、Service/User/Bunshin単位で分離される。一方、支援内容は現在Goalを入力に取らない。

例として`EFFECT`は数字を一つ確認し、`LEAD`は予約・問い合わせ・購入から一つ選ぶgeneric案である。将来は`barrier + canonical goal`を支援policyへ渡せる境界を追加すべきだが、今回、大規模教育システムは追加しない。

## 20. Goal × KPI

現在取得できる範囲に限定した暫定対応候補:

| Goal              | 利用可能な一次指標候補                    | 現在未取得・手入力候補         |
| ----------------- | ----------------------------------------- | ------------------------------ |
| Awareness         | reach, impressions, profileViews, follows | ブランド想起                   |
| Visit/Reservation | reservations, visits                      | 予約経路・来店照合             |
| Inquiry           | inquiries                                 | LINE/form別問い合わせ          |
| Repeat            | reservations, visits                      | 再来店か新規かの区別           |
| Recruitment       | profileViews（弱いproxy）                 | 求人ページ閲覧、見学、応募     |
| Sales             | orders                                    | productViews、売上額、購入経路 |
| Trust/Expertise   | saves, shares, profileViews               | 相談理由、信頼度               |

proxyを成果として断定しない。KPI policyはGoalごとに`primary / supporting / unavailable`を区別する。

## 21. 「良かった」の意味

現UIの`GOOD`表示は「👍 自分らしい」である。これは文章・提案の適合評価で、認知・採用・予約などの成果評価ではない。`NEUTRAL`は「普通」、`BAD`は「違う」。現在の次週計画はこれを形式別の好悪として利用する。

V1では既存ratingを維持し、別の任意質問として「今回の目的に役立ったか」を追加する方が意味を壊さない。未投稿・結果待ちには`UNKNOWN`を許容する。

## 22. SNSプラットフォーム差

正式な型は`INSTAGRAM / TIKTOK / X / THREADS / YOUTUBE_SHORTS / OTHER`。Facebookは独立enumではなく`OTHER`扱いになる。

format選択はplatform別に実装され、Instagramはslide/image、TikTok・YouTube Shortsはlive action/video、X・Threadsはtextを優先する。したがって形式差はある。しかしGoal × PlatformのCTA・長さ・導線policyはない。今回、高度アルゴリズム最適化は提案しない。

## 23. Goal別テストマトリクス

全組合せ生成は不要。次の代表ケースでLEVEL 4を確認する。

| Case | Industry | Platform  | Goal               | 期待するテーマ差                       | 期待CTA          |
| ---- | -------- | --------- | ------------------ | -------------------------------------- | ---------------- |
| M1   | 美容室   | Instagram | Awareness          | カウンセリングの考え方・特徴           | フォロー/保存    |
| M2   | 美容室   | Instagram | Visit/Reservation  | 初回来店の流れ・不安解消               | 予約/空き確認    |
| M3   | 美容室   | Instagram | Repeat             | 自宅ケア・次回来店時期                 | 再予約           |
| M4   | 美容室   | Instagram | Recruitment        | スタッフの1日・職場・仕事              | 見学/採用情報    |
| M5   | 士業     | X         | Inquiry            | 課題・FAQ・相談条件                    | 問い合わせ/相談  |
| M6   | 士業     | Threads   | Trust/Expertise    | 実務プロセス・誤解・専門知識           | 保存/詳細/相談   |
| M7   | EC小売   | TikTok    | Sales              | 使用場面・比較・購入理由               | 商品を見る/購入  |
| M8   | 飲食店   | Instagram | Awareness vs Visit | ブランドストーリーと来店案内が分かれる | フォロー vs 来店 |

各caseでStrategy、Weekly、Daily topic/reason、本文、visual、CTAをsnapshotし、テーマカテゴリ・読者課題・行動がGoal policyと一致するかをrubricで判定する。単語置換だけは不合格。

## 24. Primary / Secondary / Business Goal / Current SNS Goal

- Company/Bunshinの長期目的とcurrent SNS goalは分離すべき。
- 正本はService + Bunshin + SocialProfile境界のStrategy versionに置く。
- Primaryは1つ。SecondaryはV1では最大2つ、内部既定weightでもよい。
- Weekly配分でPrimaryを中心にしつつSecondaryを混ぜる。
- OEMごとの候補追加・制限はService configurationでallowlist/label overrideを持たせ、enumそのものや共通UIへ会社名をハードコードしない。
- 任意Goalを許す場合も、未知GoalをそのままPromptへ投げるだけでLEVEL 4扱いしない。`OTHER`は説明文とCTA/KPI方針が必要。

## 25. 推奨する最小実装順

大規模変更を始める前提ではなく、レビュー可能な小さいPR単位とする。

1. **Canonical Goal contractとlegacy mappingの追加**: SOCIAL capability内に7主要Goal + OTHERを定義し、`primaryPurpose`と既存Strategy enumから明示変換する。DB変更はまだ行わず純粋関数と契約テストから開始。
2. **初回設定の固定Goal解消**: onboarding purposeからcanonical goal/destinationを導出し、矛盾を作らない。未知値は安全にレビュー要求。
3. **Goal snapshotの明示伝播**: Weekly/Daily/Content/Quality入力へprimary/secondary/policyVersionを追加。既存自由文戦略は維持。
4. **Goal policy v1**: テーマ軸、避ける単語置換、CTA候補、KPI候補をSOCIAL packageへ置く。
5. **Differential regression test**: M1〜M8のうち少なくとも美容室4件、士業2件、EC1件をProvider fakeではなく評価可能なfixtureで検証。外部AI品質試験は別途予算承認後。
6. **Goal-aware result**: generation snapshotへGoalを保存し、任意の目的達成feedbackを追加。既存GOOD/NEUTRAL/BADは意味を変えない。

次の最小タスクは **1のCanonical Goal contractとlegacy mappingだけを実装するPR**。DB、Prompt、UIは同PRで変更しない。

## 26. 実行した検証

成功:

```text
Node v24.19.0 / pnpm 10.10.0
pnpm --filter @bunshin/database db:generate
pnpm --filter web exec vitest run \
  test/hassy-sns-goal-propagation-characterization.test.ts \
  test/weekly-plan-generation.test.ts \
  test/daily-mission-personalization.test.ts
Test Files 3 passed (3)
Tests 15 passed (15)
pnpm --filter web typecheck
pnpm --filter web exec eslint test/hassy-sns-goal-propagation-characterization.test.ts
pnpm exec prettier --check docs/hassy/HASSY_SNS_GOAL_AUDIT.md \
  apps/web/test/hassy-sns-goal-propagation-characterization.test.ts
```

検証内容:

1. 簡易初回設定が`BRAND_AWARENESS`固定であること。
2. Strategy Goalだけを5種類変えてもWeekly Planner入力が同一で、Goal fieldを持たないこと。
3. Daily/Content personalizationにはGoalがgeneric signalとして入るが、目的別policyは含まれないこと。

未実行:

- OpenAI実APIによる生成（課金・非決定性を伴うため）。
- 本番DBのハッシー設定・既存参加者データ確認。
- 実LINE配信、本番E2E、実SNS投稿。
- Goal変更後の実運用スケジュールE2E。

## 27. 未確認事項と判定を変える条件

- 本番ハッシーServiceで`businessProfileEnabled`、MINIMAL/FULL、content mode等がどう設定されているか。
- 本番利用者がAccount Strategy UIを直接使う導線があるか。
- 現行Promptで偶発的にどの程度Goal差が出るか。差が観測されても明示伝播と回帰保証がなければLEVEL 4にはしない。
- Instagram等から取得する実指標の範囲。現在コード上は手入力/スクリーンショット由来が中心。
- OEM別Goal候補の具体要件。

LEVEL判定を上げる条件は、同一企業fixtureでGoalだけを変え、Strategy、Weekly、Daily、Theme、Content、visual、CTAのすべてが目的別rubricを満たす自動・人手評価証跡があること。保存またはPrompt文字列の存在だけでは上げない。

## 28. 変更範囲

今回の変更は本監査文書とcharacterization testのみ。本番アプリ、API、Provider、DB schema、migration、依存関係、lockfile、設定、LINE、デプロイは変更していない。
