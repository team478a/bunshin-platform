# BUNSHIN 投稿支援レベル・SNS別投稿セット実装計画

## 1. 目的

BUNSHINが、利用者の選んだSNSだけでなく、顔・声・作業時間と「どこまで作ってほしいか」に合わせて、その日に必要な内容を分かりやすく提示できるようにする。

利用者へ内部用語や複雑な投稿形式を選ばせず、次の体験を成立させる。

```text
SNSを選ぶ
  ↓
顔・声・作業時間を確認する
  ↓
BUNSHINにどこまで作ってほしいかを選ぶ
  ↓
今日の投稿方法をBUNSHINが決める
  ↓
企画・作り方・完成版から必要な内容を見る
  ↓
採用・コピー・手動投稿・Feedback
```

本計画はFREE SOCIAL MVPの改善であり、SNS自動投稿、画像・動画本体の生成、SNS OAuthを追加しない。

## 2. 最新mainの確認結果

現在、次の基盤は実装済みである。

- `SocialPlatform`: `INSTAGRAM | TIKTOK | X | THREADS | YOUTUBE_SHORTS | OTHER`
- `SocialPreferredFormat`: `TEXT | SLIDE | IMAGE | LIVE_ACTION | AI_VIDEO_PROMPT`
- SocialProfileの希望形式
- Weekly Planの推奨形式
- DailyMission / MissionContentの必須1対1aggregate
- SNSと形式の組み合わせ検証
- 形式別のstrict MissionContent validation
- OpenAI Adapterによる構造化生成
- 採用、不採用、形式別コピー、手動投稿完了、Feedback
- LINE Daily Mission通知と短期Deep Link

現在のSNS別許可形式は次のとおりである。

| SNS             | 現在許可されている形式                                 |
| --------------- | ------------------------------------------------------ |
| Instagram       | 文章、スライド、画像、自分で撮る動画、AI動画用の指示文 |
| TikTok          | 自分で撮る動画、AI動画用の指示文、画像                 |
| X               | 文章、画像                                             |
| Threads         | 文章、画像                                             |
| YouTubeショート | 自分で撮る動画、AI動画用の指示文                       |
| その他          | すべて                                                 |

不足しているのは次の点である。

- 「投稿先」「投稿方法」「BUNSHINが作る範囲」が利用者画面で十分に分離されていない
- 自分で生成できる利用者と、完成した指示文が必要な利用者を区別できない
- SNS別に必要な成果物一式を明示した共通ルールがない
- 作成支援レベル別の利用率、コピー率、投稿完了率を計測できない
- LINE通知はMission完成通知と入口に限定され、SNS・形式・目安時間の安全な要約をまだ表示しない

## 3. 用語と責務

次の3概念を分離する。

### 3.1 投稿先

どこへ投稿するかを表す。既存の`SocialPlatform`を継続利用する。

### 3.2 投稿方法

何を作るかを表す。既存の`SocialPreferredFormat`を継続利用する。

画面では内部名を表示せず、次のやさしい日本語を使う。

| 内部値            | 利用者向け表示     |
| ----------------- | ------------------ |
| `TEXT`            | 文章               |
| `SLIDE`           | ページをめくる投稿 |
| `IMAGE`           | 画像               |
| `LIVE_ACTION`     | 自分で撮る動画     |
| `AI_VIDEO_PROMPT` | AIで作る動画       |

### 3.3 作成支援レベル

BUNSHINがどこまで作るかを表す新しい概念とする。

```text
ContentAssistanceLevel

IDEA_ONLY
GUIDED
READY_TO_USE
```

| 内部値         | 利用者向け表示                   | 内容                                       |
| -------------- | -------------------------------- | ------------------------------------------ |
| `IDEA_ONLY`    | 企画だけ教えてほしい             | テーマ、ねらい、伝える要点                 |
| `GUIDED`       | 作り方も教えてほしい             | 企画に加えて順番、構成、作業手順           |
| `READY_TO_USE` | そのまま使えるものを作ってほしい | 完成文、台本、画像・動画を作るための指示文 |

初回の推奨値は`READY_TO_USE`とする。ただし選択を強制せず、利用者はその日のMissionでも変更できる。

## 4. 利用者への質問

「プロンプトが必要ですか」「生成レベルを選んでください」のような言葉を使わない。

初期設定では次の1問を表示する。

> BUNSHINにどこまで作ってほしいですか？

- 企画だけ教えてほしい
- 作り方も教えてほしい
- そのまま使えるものを作ってほしい（おすすめ）

各選択肢には具体例を表示する。今日のMission画面では保存済みの初期値を選択した状態で表示し、今回だけ変更できるようにする。

## 5. SNS別投稿セット

形式だけでなく、投稿に必要な成果物一式をSNS別投稿セットとして定義する。

| SNS               | BUNSHINが用意する主な内容                                        |
| ----------------- | ---------------------------------------------------------------- |
| X                 | 本文、必要な場合の連続投稿、最後の案内                           |
| Threads           | 会話調本文、共感・意見・体験談、最後の案内                       |
| Instagram画像     | 画像の作り方、画像内の文字、投稿文、ハッシュタグ                 |
| Instagramスライド | 表紙、各ページの見出しと本文、最後のページ、投稿文、ハッシュタグ |
| Instagram動画     | 最初のつかみ、台本、撮影方法または外部動画AI用の指示文、投稿文   |
| TikTok            | 最初のつかみ、短い台本、場面構成、画面内の文字、投稿文           |
| YouTubeショート   | タイトル、30〜60秒の台本、場面構成、説明文、最後の案内           |

投稿セットはCoreへProvider固有の型を持ち込まず、既存MissionContentの形式別schemaで表現する。SNS固有の必須項目・文字数・動画時間・ハッシュタグ上限はDomainで再検証する。

## 6. 支援レベル別の出力

### 6.1 文章

- 企画だけ: テーマ、ねらい、話す要点
- 作り方まで: 書き出し、本文の順番、最後の案内
- 完成版: 投稿本文、必要な連続投稿、最後の案内

### 6.2 ページをめくる投稿

- 企画だけ: テーマ、対象読者、伝える結論
- 作り方まで: 表紙から最後までのページ構成
- 完成版: 各ページの見出しと本文、投稿文、ハッシュタグ

### 6.3 画像

- 企画だけ: 画像のテーマと目的
- 作り方まで: 構図、色、雰囲気、画像内の文字
- 完成版: 外部画像AIへ渡せる指示文、画像内の文字、投稿文、ハッシュタグ

### 6.4 自分で撮る動画

- 企画だけ: 動画のテーマと結論
- 作り方まで: 撮影順、必要な場面、目安時間
- 完成版: 最初のつかみ、撮影指示、台本、画面内の文字、投稿文

### 6.5 AIで作る動画

- 企画だけ: 動画のテーマと目的
- 作り方まで: 場面構成、長さ、雰囲気
- 完成版: Provider非依存の動画生成指示文、ナレーション、画面内の文字、投稿文

利用者画面では「Prompt」を原則使わず、「画像を作るための指示文」「動画を作るための指示文」と表示する。

## 7. 投稿方法の自動選択

利用者へ毎日すべての形式を選ばせず、次を入力としてBUNSHINが実行可能な形式を決める。

- Primary SNS
- SocialProfileの希望形式
- BunshinのfacePolicy
- 声を利用できるか
- 1日に使える時間
- 外部画像・動画AIを利用できるか
- 承認済みAccount StrategyとWeekly Plan
- 最近使用した形式
- 採用・不採用と不採用理由

初期ルールは決定的なDomain Policyとしてコード管理する。管理画面から本番ルールを自由入力させない。

例:

- X / Threadsは文章を優先する
- 顔も声も使わず短時間の場合、画像または短いスライドを優先する
- 顔を出せて時間が十分な場合、自分で撮る動画を候補にできる
- 外部動画AIを利用できる場合だけ、AIで作る動画を優先候補にできる
- 同じ形式の連続を避ける。ただし利用者が明示希望した形式を不必要に除外しない
- facePolicy、作業時間、SNS別許可形式に違反するMissionを生成しない

## 8. Persistence候補

実装PR前にPrisma名とmigration互換性を確定する。現時点の候補は次のとおりである。

### SocialProfile

```text
defaultAssistanceLevel ContentAssistanceLevel
```

SNSごとに希望が異なる可能性があるため、UserやBunshin本体ではなくSocialProfileへ置く。

### DailyMission

```text
assistanceLevel ContentAssistanceLevel
```

生成時の選択をsnapshotとして保持し、後日の初期設定変更で過去Missionの意味を変えない。

### MissionActivity

追加候補:

```text
VIEWED_IDEA
REQUESTED_GUIDE
REQUESTED_READY_CONTENT
COPIED_IMAGE_INSTRUCTION
COPIED_VIDEO_INSTRUCTION
```

既存の`COPIED_TEXT`、`COPIED_SLIDE`、`COPIED_VIDEO_PROMPT`、`COPIED_SCRIPT`との重複を実装前に整理する。過去イベントの意味を変更せず、必要最小限だけ追加する。

## 9. MissionContentの移行方針

現在のDailyMissionはMissionContent必須1対1aggregateであり、AI生成は品質合格後にMission、Content、Decisionをatomic保存する。この安全性を最初のPRで崩さない。

### 第1段階: 表示の段階化

- 既存の完全なMissionContentを生成・保存する
- 企画、作り方、完成版のView Modelを作る
- 利用者が選んだ支援レベルまでを画面に表示する
- 上位レベルを開いた行動をActivityへ保存する
- 既存の形式別コピーと投稿完了を再利用する

この段階ではAI原価は大きく下がらないが、Coreの全面変更なしで利用者ニーズと行動を検証できる。

### 第2段階: 段階生成

利用状況とAI原価を確認した後、次を別設計・別PRで検討する。

```text
企画を生成
  ↓ 利用者が希望した場合
作り方を追加生成
  ↓ 利用者が希望した場合
完成版を追加生成
```

段階生成では、既存の必須1対1aggregate、再生成履歴、version、Quality Check、同時生成、失敗時の公開境界を再設計する。第1段階の実装と同じPRへ混ぜない。

## 10. 今日のMission画面

Mission画面の上部に次を表示する。

> 今日はどこまで作りますか？

- 企画を見る
- 作り方を見る
- 完成版を見る

保存済み初期値を選択済みにする。完成版では形式に応じて次の操作だけを表示する。

- 投稿文をコピー
- ページをすべてコピー
- ページごとにコピー
- 画像を作るための指示文をコピー
- 動画を作るための指示文をコピー
- 撮影台本をコピー

採用前にコピーボタンを前面へ出さない既存方針を維持する。

## 11. LINE通知

LINEは通知と安全な入口に限定する。長い投稿本文、画像・動画の指示文、Knowledge、Memory、個人情報をPushしない。

安全な要約候補:

```text
今日やることが決まりました

Instagram用の5枚の投稿です。
テーマ: 初心者が最初に気をつけること
目安時間: 10分

[今日の内容を見る]
```

送信可能な値は、公開しても問題がない短いMission要約、SNS、やさしい形式名、目安時間、短期Deep Linkに限定する。Mission本文や指示文をDelivery、Job payload、logへ複製しない。

LINE上の「企画を見る」「完成版を作る」postbackは、LINE Identity、verified session、所有権、single-use state、Activity冪等性を設計できるまで後続候補とする。

## 12. 管理画面

初期段階では次を読み取り専用で表示する。

- SNS別に利用できる投稿方法
- 支援レベル別の利用者数
- 企画から作り方、完成版へ進んだ割合
- 支援レベル別の採用率、コピー率、投稿完了率
- SNS・形式・支援レベル別のAI使用量と見積原価

SNS別生成ルールやPromptを管理画面から直接編集する機能は初期範囲外とする。将来追加する場合は、環境分離、下書き、テスト生成、承認、version、有効化、rollback、Auditを必須にする。

## 13. Isolation・Security

最低限、次を自動テストする。

- 別WorkspaceのSocialProfile、Mission、Activityを参照・変更できない
- 別Userの支援レベルを利用できない
- 別Bunshinの初期値、Mission、履歴を暗黙利用しない
- Primary SNSと異なるSocialProfileの初期値を利用しない
- Capability未割当のBunshinは生成・表示・変更できない
- GrantされていないKnowledgeを生成へ渡さない
- SNSと形式の不正な組み合わせを生成・保存できない
- facePolicyと作業時間に違反する形式を選ばない
- Activityの冪等keyで二重計測しない
- LINE Push、Job、log、Auditへ投稿本文・指示文・秘密値を保存しない

## 14. KPI

既存FREE MVP Funnelへ次を追加する。

- 初期支援レベルの選択率
- 企画閲覧率
- 企画から作り方へ進んだ率
- 作り方から完成版へ進んだ率
- 支援レベル別Mission採用率
- 支援レベル別Copy率
- 支援レベル別CopyからPosted率
- 画像・動画指示文のCopy率
- SNS・形式・支援レベル別Feedback GOOD率
- 支援レベル別1 Active User当たりAI原価

最適化目標は完成版の利用率を最大化することではない。利用者が必要とする支援量で、継続的に実際の投稿を行えることを成功条件とする。

## 15. PR分割

### PR 1: Rebaseline（本計画）

- 本文書
- Roadmap更新
- Decision Log更新
- コード、Prisma Schema、Migration変更なし

### PR 2: Assistance Level Core

- enumとDomain validation
- SocialProfileの初期値
- DailyMission snapshot
- Repository / Use Case / Migration
- tenant / User / Bunshin isolation test

### PR 3: 初期設定UI

- やさしい日本語の3択
- 具体例とおすすめ表示
- verified session API
- Primary SNSごとの保存・変更

### PR 4: Mission段階表示

- 企画、作り方、完成版View Model
- 当日だけの切替
- 既存採用・コピー・投稿完了UXとの接続
- 支援レベルActivity

### PR 5: SNS別投稿セット強化

- SNS・形式別必須成果物
- 自動選択Domain Policy
- facePolicy、時間、最近の形式の判定
- Generator schema / Quality Checker / UI

### PR 6: LINE安全要約

- SNS、やさしい形式名、目安時間、短いテーマ
- 既存短期Deep Link
- 長文・指示文・KnowledgeをPushしないテスト

### PR 7: 管理指標

- 支援レベル別Funnel
- Copy / Posted / Feedback
- AI使用量・見積原価
- 個人情報を返さない集計API/UI

### PR 8: 段階生成の再設計

第1段階の利用率と原価を確認してから着手可否を人間判断する。

## 16. 今回実装しないもの

- 画像・動画本体の生成
- SNS自動投稿、SNS OAuth
- Provider固有PromptやSDK型のCore保存
- LINE本文への完成投稿・指示文のPush
- LINE上だけでのMission完結
- 管理画面からの本番Prompt自由編集
- 段階生成Persistenceの先行実装
- 課金・Plan別生成回数
- Memoryへの自動反映

## 17. 人間確認事項

PR 2へ進む前に次を確認する。

1. 3段階の名称と初期推奨値を採用するか
2. 初期値をSocialProfileへ保存するか
3. DailyMissionへ支援レベルsnapshotを持たせるか
4. 第1段階は完全内容を生成したまま表示だけを分けるか
5. SNS別投稿セットの必須項目
6. LINEへ送る安全な要約の範囲
7. Activity追加値と既存Copy Eventの重複整理
8. 段階生成へ進むための利用率・原価基準

承認前にPR 2のPrisma Schema、Migration、実装コードへ進まない。
