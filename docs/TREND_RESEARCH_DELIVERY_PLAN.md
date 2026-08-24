# BUNSHIN トレンド調査・動画企画定期配信 実装計画

## 1. 目的

利用者のSNS、仕事、対象者、顔・声、作業時間に合う「今使う理由のある動画企画」を調査し、毎日または定期的に提案できるようにする。

利用者向けには「必ずバズる」と断定せず、次の価値を約束する。

> 最新の話題や伸びている投稿を調べ、あなたが実行できる動画企画を提案します。

成功条件は再生数の保証ではなく、根拠の新しい企画が採用・投稿され、継続行動につながることである。

## 2. 現在の実装と追加点

現在は承認済みSNS戦略、週間予定、Grant済みKnowledgeからDaily Missionと形式別内容を生成し、LINEで準備完了を通知できる。外部検索結果をMission生成へ渡すResearch層は未実装である。

追加する責務は次に限定する。

- 許可された情報源から候補を検索する
- URL、公開日時、取得日時、短い根拠を保持する
- 鮮度、安全性、利用者との適合度、実行可能性を評価する
- 採用候補だけをWeekly Plan / Daily Missionの入力へ渡す
- 利用者には出典と「なぜ今おすすめか」を表示する

## 3. 提供方法

初期検証は週次調査を採用する。

```text
週1回、SNS戦略ごとに調査
  ↓
重複・古い情報・危険な情報を除外
  ↓
利用者に合う候補を最大3件保存
  ↓
毎日のMissionで最適な1件を利用
  ↓
採用・不採用・投稿・Feedbackを計測
```

毎日外部検索する方式は、週次方式で採用率と原価を確認した後の有料候補とする。速報性が必要なテーマだけ、期限の短い追加調査を将来検討する。

### 初期商品候補

| 区分     | 調査  | 提案                                              |
| -------- | ----- | ------------------------------------------------- |
| FREE検証 | 週1回 | 今週使える候補を最大3件、毎日1件までMissionへ利用 |
| 将来PRO  | 毎日  | 最新候補、競合差分、完成台本まで                  |

Plan / Billingは本計画では実装しない。

## 4. アーキテクチャ

Coreは外部検索SDK、検索会社の型、SNSのHTMLへ依存しない。

```text
TrendResearchUseCase
  ↓
TrendResearchPort
  ↓
Provider Adapter
  ├─ Web Search Adapter
  ├─ YouTube Data Adapter
  └─ 将来の規約適合済みSNS Data Adapter
```

検索結果は信頼できない外部データとして扱う。ページ内の命令文をPromptへの指示として実行せず、引用候補データとしてのみ解析する。

### Provider選定方針

- Web検索の初期候補はExaまたはFirecrawlとし、spikeで鮮度、出典品質、日本語、費用、失敗分類を比較する。
- YouTubeは公式Data APIの検索・動画統計を優先する。
- TikTok Research APIは非営利研究者向けの資格制限とデータ遅延があるため、商用MVPの標準Providerにしない。
- Instagram / TikTok / X等を無断スクレイピングしない。公式APIや許諾済みProviderがないSNSでは、公開Web情報と一般トレンドを根拠に企画し、SNS内での「急上昇」を断定しない。
- Providerを管理画面から自由なURLとして追加しない。

## 5. データ構造候補

正式名はCore PR前に確定する。

### TrendResearchRun

```text
id
workspaceId
bunshinId
socialProfileId
periodStart
periodEnd
status: PENDING | RUNNING | COMPLETED | FAILED | EXPIRED
queryVersion
providerKey
startedAt
completedAt
expiresAt
failureCategory nullable
createdAt
updatedAt
```

### TrendEvidence

```text
id
workspaceId
bunshinId
researchRunId
sourceType: OFFICIAL_API | PUBLIC_WEB | NEWS | OTHER
sourceUrl
sourceTitle
publishedAt nullable
retrievedAt
summary
evidenceHash
status: ACTIVE | EXPIRED | REJECTED
expiresAt
createdAt
```

本文全文、動画ファイル、画像、コメント、個人プロフィール、Provider raw responseは保存しない。短い要約と出典だけを保存する。

### TrendIdeaCandidate

```text
id
workspaceId
bunshinId
socialProfileId
researchRunId
platform
topic
hook
whyNow
fitReason
suggestedFormat
estimatedMinutes
freshnessScore
fitScore
feasibilityScore
safetyStatus
status: PROPOSED | SELECTED | REJECTED | EXPIRED
expiresAt
createdAt
updatedAt
```

候補とEvidenceは中間relationで複数対複数にする。Weekly Plan / Daily Missionには選ばれた候補IDを任意参照としてsnapshotし、後日のEvidence期限切れで過去Missionの意味を変えない。

## 6. 調査入力とIsolation

利用可能:

- 対象BunshinのObjective、Audience、Personality、facePolicy
- 対象SocialProfile、承認済みStrategy、Active Content Pillar
- 作業時間、希望形式、作成支援レベル
- 対象Bunshinの採用・不採用・投稿・Feedback集計
- Grant済みOwnerKnowledge

禁止:

- 別Workspace、別User、別Bunshinのデータ
- GrantされていないKnowledge
- LINE user ID、メールアドレス、秘密値
- 投稿本文やKnowledgeを検索queryへそのまま送ること
- 別利用者の成果を個別に見せること

検索queryには識別子を含めず、業種、対象者、地域、目的等の必要最小限の一般化した語だけを使う。

## 7. 評価ルール

「再生数が多い」だけで選ばない。

```text
総合候補 = 鮮度 + 利用者との適合 + 実行可能性 + 根拠品質 - リスク - 重複
```

- 鮮度: 公開日時・取得日時・テーマ別有効期限
- 適合: Objective、Audience、Personality、Content Pillar
- 実行可能性: facePolicy、声、作業時間、利用可能形式
- 根拠品質: 公式情報、複数出典、出典日時
- リスク: 医療、金融、災害、政治、未確認情報、権利侵害
- 重複: 最近のMission、過去の投稿、却下済みテーマ

市場成果と本人の好みは分離する。採用・GOODはPreference、投稿後の再生・反応は将来のOutcomeとして別に扱う。

## 8. 利用者画面とLINE

今日の画面では次を短く表示する。

- 今日の動画企画
- なぜ今おすすめか
- どこで確認したか
- 情報を確認した日時
- 目安時間
- 「企画」「作り方」「完成版」

「バズ確定」「必ず伸びる」は表示しない。出典リンクはHTTPSかつ許可されたschemeだけを開き、open redirectを使わない。

LINEは通知と安全な入口に限定する。

```text
今日の動画企画を用意しました
テーマ: 〇〇
目安: 10分
[企画を見る]
```

検索結果全文、完成台本、Knowledge、Memory、Provider response、外部追跡URLをLINE Push / Job / logへ保存しない。

## 9. Job・鮮度・失敗

- 調査Jobは`workspaceId + bunshinId + socialProfileId + periodStart + queryVersion`で冪等にする。
- 同じ対象期間の同時実行をDB claimで防ぐ。
- 期限切れEvidenceを新しいMissionへ使わない。
- Provider timeout、rate limit、quota、認証、invalid responseを固定分類する。
- Provider障害時は古い候補を「最新」として再利用せず、通常の非トレンドMissionへ安全にフォールバックする。
- 失敗時に不完全候補を利用者へ公開しない。

## 10. 原価制御

- 週次でまとめて調査し、複数日のMissionで再利用する。
- Provider呼び出し前にCapability、Active Profile、承認済みStrategy、対象期間重複を検証する。
- 検索件数、抽出文字数、AI候補数へ上限を設ける。
- 全文ではなく関連箇所の短い抜粋を優先する。
- Provider、model、queryVersion、件数、使用量、見積原価、処理時間、成否を本文なしで記録する。
- Workspace / Bunshin単位の週次上限と全体停止を用意する。

## 11. 安全性・権利・品質

- 他者の投稿本文、台本、画像、動画をそのまま複製しない。
- 共通するテーマ・構成・公開事実を抽象化し、Bunshin独自の企画へ変換する。
- 引用が必要な事実には出典を関連付ける。
- 根拠のない数値、人物発言、商品効果を生成しない。
- 医療・金融等の高リスク領域は公式情報を必須にし、人間確認なしの断定を拒否する。
- 検索本文のPrompt Injectionを無効化し、外部ページの命令を実行しない。
- robots、利用規約、API規約、削除要求に従う。

## 12. KPI

- 調査候補の表示率
- 候補採用率 / 不採用理由
- 企画から完成版を開いた率
- Copy率、Posted率
- 7日間で3回以上投稿した率
- トレンド企画と通常企画の投稿完了率差
- Evidence期限切れ率
- Provider失敗率
- 1 Active User当たり調査・AI原価

再生数はSNS Analytics連携前には自己申告または未取得とし、推定値を実績として扱わない。

## 13. PR分割

### PR 1: 設計（本PR）

- 本計画
- ADR
- Roadmap / Decision Log
- コード、Schema、Migration変更なし

### PR 2: Research Core Persistence

- Run / Evidence / Candidate
- Port / Repository / Use Case
- Isolation、冪等性、期限、重複テスト

### PR 3: Provider Spike

- Exa / Firecrawl等を本番採用せず比較できるAdapter試験
- 日本語、鮮度、出典、費用、失敗分類の評価
- 人間レビュー後にProviderを1つ採用

### PR 4: Weekly Research Job

- 週次Scheduler / Handler
- quota、停止、retry、fallback

### PR 5: Candidate Ranking / Mission Integration

状態: Core接続と採用根拠snapshot保存を完了。SAFE、期限内、SNS・形式一致、Evidenceあり、利用可能時間内の候補だけを決定的に順位付けし、最上位1件をDaily Mission Plannerへ任意入力する。AIが実際に採用した場合だけ、候補とEvidenceの安全なsnapshotをMissionと同一transactionで保存する。候補がない場合は従来生成へfallbackする。画面表示は後続UI PRで扱う。

- 決定的な前処理と構造化AI評価
- Weekly Plan / Daily Missionへの任意入力
- Evidence snapshot

### PR 6: User UI / LINE Safe Summary

状態: 完了。Mission画面では「今おすすめする理由」「利用者に合う理由」、出典名、公開日、確認日をログイン後だけ表示する。LINEはトレンド利用有無だけを安全な固定文へ反映し、出典、本文、Knowledge、Memory、個人情報は送らず、署名付きMission入口へ誘導する。

- 根拠、日時、企画表示
- LINEは短い要約と署名付き入口だけ

### PR 7: Metrics / Admin

状態: 完了。管理者専用画面で期間別の調査成功・失敗、候補、安全性、鮮度、Mission採用、コピー、投稿、Provider別失敗を本文・個人情報なしで集計する。調査実費はRaw Event未接続のため未計測と明示し、Provider比較テストの参考原価と分離する。

- 原価、採用、投稿、失敗、鮮度
- 本文・個人情報なしの運用画面

## 14. 今回実装しないもの

- 「必ずバズる」の保証やスコア表示
- SNSの無断スクレイピング
- TikTok Research APIを商用標準Providerとして使うこと
- SNS自動投稿、SNS OAuth、コメント自動返信
- 画像・動画本体生成
- 競合投稿のコピー
- 高度SNS Analytics
- 課金、Plan制限
- 自動Memory化

## 15. 人間確認Gate

PR 2へ進む前に次を確認する。

1. FREEは週1回・最大3候補で開始するか
2. 「バズる」ではなく「最新情報を調べた企画」と表現するか
3. Evidence保持期間と削除方針
4. 高リスク領域を初期対象外にするか
5. Provider spikeの月額・1回当たり上限
6. ユーザーへ表示する出典情報の範囲
7. PR #104の段階表示がマージ済みであること
