# トレンド調査 Core Persistence 実装報告

## 1. 目的

外部検索Providerへ接続する前に、調査実行、根拠、企画候補を安全に保存・取得できるCoreを作る。

## 2. 実装内容

- `TrendResearchRun`、`TrendEvidence`、`TrendIdeaCandidate`、候補と根拠の関連
- 週・SNS設定・query version単位の重複防止
- HTTPS出典URL、取得日時、有効期限、短い要約、hashの検証
- 企画候補1件以上のEvidence必須化
- SNSと投稿形式の既存ルール再利用
- 鮮度、適合、実行可能性の0〜100整数検証
- Active SOCIAL Capabilityを必要とする作成Use Case
- 期限内・安全な候補だけを返す取得Use Case
- Prisma Repositoryで一括transaction保存

## 3. Isolation

- Workspace / User / Bunshin / SocialProfileを複合条件で検証する
- 別Workspace、別BunshinのProfileや候補を参照しない
- Candidateから別RunのEvidenceを関連付けられない
- 外部ID、個人情報、Knowledge、Provider raw responseを保存しない

## 4. 今回実装しないもの

- Exa、Firecrawl、YouTube等のProvider Adapter
- 検索処理、AI評価、週次Job
- Mission / Weekly Planへの接続
- 利用者画面、LINE通知、管理画面

## 5. 次のGate

MigrationとIsolation testを含む本PRの承認後、Provider比較spikeを別PRで実施する。比較段階では本番Providerを確定せず、日本語、鮮度、出典、原価、失敗分類を測る。
