# BUNSHIN AI・外部エージェント互換基盤 Rebaseline

## 1. 目的

BUNSHINの価値を特定のAI、検索会社、外部エージェントへ固定せず、利用者の目的、Bunshin、Knowledge、Memory、Mission、行動履歴を守ったまま交換・比較できる境界を定める。

「ワタシ企画室」はプロジェクトの仮称とし、コード、DB、API、監査記録の正式名称は`BUNSHIN`を継続する。名称変更を行う場合は、別途ブランド移行を決定する。

本書はPhase 7-E0の設計文書であり、実装コード、Prisma Schema、Migration、APIキー、外部接続を変更しない。

## 2. 現在の実装と再利用

| 目的         | 現在の資産                                                | 方針                                            |
| ------------ | --------------------------------------------------------- | ----------------------------------------------- |
| トレンド検索 | `TrendResearchProviderPort`、Exa／Firecrawl Adapter       | 再利用。実測後にProviderを決定                  |
| トレンド保存 | `TrendResearchRun`、`TrendEvidence`、`TrendIdeaCandidate` | 再利用。必要項目だけ後続PRで拡張                |
| 生成         | Mission Generator／Quality CheckerのPortとOpenAI Adapter  | 抽象化範囲を監査して共通Reasoning境界へ段階移行 |
| 行動         | `MissionActivity`、`PostRecord`、`MissionFeedback`        | 正本。新しい汎用Outcome tableを先に作らない     |
| 記憶         | `BunshinMemory`                                           | 正本。推定嗜好を直接ACTIVE Memoryへ書かない     |
| 通知         | LINE設定、Job、`NotificationPort`相当の境界               | AI・Agentから直接送信させない                   |
| 秘密情報     | 環境分離、暗号化設定、Audit方針                           | 共通化。親鍵は管理画面・DBへ保存しない          |

## 3. 境界

```text
BUNSHIN Domain / Application
  ├─ TrendResearchProviderPort
  ├─ ContentReasoningPort（後続実装候補）
  ├─ CandidateRankingPort（後続実装候補）
  ├─ AgentRuntimePort（後続実装候補）
  └─ NotificationPort
          ↓
Provider / Agent Adapter
          ↓
外部API・外部Agent
```

外部AgentはBUNSHINのApplication Use Caseを置き換えない。実行を依頼される一時的な作業者であり、DB、秘密情報、LINE、任意shell、本番設定を直接操作しない。

## 4. Port候補

### ContentReasoningPort

```text
execute(TypedReasoningRequest) -> StructuredReasoningResult
```

入力には`workflowKey`、`workflowVersion`、`schemaVersion`、許可済みcontext、timeout、最大予算、dataPolicyを含める。出力はJSON Schemaで検証し、不足項目、余分な項目、不正型、上限超過を拒否する。

### CandidateRankingPort

```text
rank(CandidateRankingRequest) -> RankedCandidate[]
```

決定的ルールを先に適用し、必要な場合だけAIを利用する。鮮度、適合、実行可能性、危険性、重複、配布数を別scoreとして保持し、「バズ確率」を生成しない。

### AgentRuntimePort

```text
getCapabilities() -> AgentCapability[]
healthCheck() -> AgentHealth
execute(AgentWorkOrder) -> AgentWorkResult
```

`AgentWorkOrder`候補:

- `requestId`、`workspaceId`、`bunshinId`
- `workflowKey`、`workflowVersion`、`schemaVersion`
- 目的と、明示的に許可された最小context
- 許可Skill、許可Tool、Toolごとのread／write
- timeout、最大費用、最大tool回数
- dataPolicy、出力schema、idempotencyKey

`AgentWorkResult`候補:

- status、構造化output、使用したcapability
- provider／modelの監査用識別子
- token／費用／遅延／tool回数
- 固定errorCategory、retryable
- workflow／schema version

DomainへProvider SDK型、会話全文、思考過程、raw responseを保存しない。

## 5. データ持ち出し区分

| 区分         | 例                                                        | 外部送信                             |
| ------------ | --------------------------------------------------------- | ------------------------------------ |
| PUBLIC       | 一般化した業種、公開トレンドquery                         | 許可                                 |
| INTERNAL     | workflowVersion、匿名化した評価条件                       | 必要最小限で許可                     |
| USER_PRIVATE | Objective、Audience、Personality、Grant済みKnowledge要約  | 対象Use Caseで明示許可された場合だけ |
| RESTRICTED   | メール、LINE user ID、未Grant Knowledge、別Bunshin Memory | 禁止                                 |
| SECRET       | API key、token、DB URL、暗号化親鍵                        | 禁止                                 |

同じWorkspaceであっても、対象外BunshinのMemoryや履歴を暗黙に送信しない。KnowledgeはGrantをサーバー側で再検証する。

## 6. Tool Policy

初期Agentは読み取り専用allowlistを基本とする。各Toolは入力schema、tenant検証、timeout、最大件数、監査、固定error分類を持つ。

禁止:

- 任意SQL、DB接続文字列、任意HTTP、任意shell、任意ファイル操作
- LINE直接送信、SNS直接投稿、本番設定変更
- 別Workspace／User／Bunshinの検索
- Secret取得、環境変数列挙
- Agent自身によるSkill／Prompt／Policyの有効化

更新操作を将来追加する場合は、BUNSHIN Use Caseを経由し、承認、冪等性、所有権再検証、Audit、rollbackを必須にする。

## 7. 実行制御

全AI／Agent実行に次を要求する。

- timeoutと最大再試行
- 1回・日次・月次予算
- provider／workflow単位のkill switch
- circuit breakerと安全なfallback
- environment一致
- schema検証後だけ永続化
- 不完全結果を利用者へ公開しないatomic commit
- logへ本文、個人情報、Secret、raw responseを出さない

## 8. 学習境界

PreferenceとOutcomeを分離する。

- Preference: 採用、不採用、コピー、本人らしさFeedback
- Outcome: 投稿完了、将来取得する閲覧・登録・問い合わせ等
- Explicit: 利用者が自分で設定した希望
- Inferred: 複数行動から推定した傾向

初期は既存Activity／PostRecord／Feedbackを正本とし、学習用Read Modelを作る。1件の不採用やGOODをMemoryへ自動反映しない。AIは変更案を提出できるだけで、承認前の設定・Memory・Skillを変更できない。

## 9. Golden Dataset

APIキーなしで先にfixtureを作成できる。個人情報や実利用者データを使わない合成データとする。

最低限のケース:

- 日本語の業種・対象者・SNS・作業時間・facePolicy
- `IDEA_ONLY | GUIDED | READY_TO_USE`
- 古い情報、根拠なし、重複、危険URL
- 医療・金融・災害等の高リスク例
- Prompt Injectionを含む外部文章
- schema欠損、余分な項目、不正型、長すぎる出力
- Provider timeout、rate limit、quota、認証失敗
- 別Workspace／User／Bunshin／未Grant Knowledgeへの越境要求
- 許可外Tool、予算超過、期限超過

評価は品質だけでなく、費用、遅延、失敗率、再試行、禁止結果率を含む。期待結果、許容結果、禁止結果は人間がversion固定する。

## 10. Provider Registry候補

Phase 7-E1で検討し、E0ではDBを作らない。

- environment、provider、model、capabilities、status
- priority、fallbackProviderId
- timeout、retry、rate limit、日次／月次予算
- dataPolicy、allowedDataClasses、toolPolicy
- encryptedSecret、secretVersion、lastVerifiedAt
- benchmarkVersion、品質、費用、遅延、errorRate
- version、変更理由、Audit、kill switch

秘密値を保存後に再表示せず、Production変更はSUPER_ADMIN、確認画面、変更理由を必須とする。親鍵は環境変数に残す。

## 11. トレンド収集方針の変更候補

従来の「SocialProfileごとに週1回検索」から、次へ変更する案を人間確認する。

```text
共通カテゴリ別トレンドを定期収集
  ↓
保存候補と利用者条件を日次照合
  ↓
Bunshin固有の企画へ変換
```

検索費用を利用者数に比例させない利点がある。一方、個別性を失わないため、カテゴリ、地域、言語、SNS、期限を持たせ、企画生成時には対象Bunshinの許可済みcontextだけを使う。頻度、カテゴリ粒度、配布上限はProvider実測後に確定する。

## 12. PR分割

1. **7-E0 文書**: 本書、ADR、Roadmap、Decision Log。コード・DB変更なし
2. **Golden Dataset Core**: fixture schema、評価器、禁止結果テスト。外部接続なし
3. **7-D3 実測**: APIキー準備後、日本語benchmarkとProvider決定
4. **7-D4 共有Research Job**: 冪等Job、予算、期限、fallback
5. **7-D5 評価・重複防止**: ranking、cluster、配布上限、安全性
6. **7-D6 Mission／LINE**: atomic生成、通常企画fallback、安全要約
7. **7-D7 KPI／運用**: 費用、品質、通知、実験指標
8. **7-E1 Provider Registry**: D3／D7の運用要件確定後

Preference Memory、Learning Proposal、Skill Registry、Agent Adapter、MCP Gatewayは、行動データと必要性を確認した後の独立PRとする。

## 13. 停止条件と人間確認

本PR後、次を確認する。

1. 共通トレンドプール方式へ変更するか
2. E0のPort責務と禁止Tool
3. raw response／本文全文を保存しない方針
4. OutcomeEventを新設せず既存イベントを正本にする方針
5. BunshinMemoryを正本とし、推定嗜好を直接ACTIVE化しない方針
6. APIキー未準備中はGolden Dataset Coreだけ先行するか
7. Hermes等のAgent Adapterは必要性と比較結果が出るまで実装しない方針

承認前にProvider Registry、Learning、Skill、Agent Runtime、MCPの実装へ進まない。
