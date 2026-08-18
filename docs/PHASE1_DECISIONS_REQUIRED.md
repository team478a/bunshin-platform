# Phase 1開始前に決めること

## 目的

この文書は、Phase 0の調査結果を受けて、Phase 1（Platform Foundation）を開始する前に人間が決定する項目を整理する。

この時点ではPhase 1の実装、DB migration、SOCIAL機能、AI投稿生成、LINE配信、BLOG移行を開始しない。

## 決定が必要な項目

### 1. API構成

#### 推奨

Phase 1ではNext.jsを中心に開始し、domain packageをフレームワーク非依存にする。

NestJSは最初から導入せず、次の必要性が明確になった時点でAPIまたはworkerを切り出す。

- WebとAPIを独立してスケールする必要がある
- 長時間JobをWeb processから分離する必要がある
- 複数のFrontendや外部clientからAPIを利用する
- Next.js Route Handlerでは運用上の制約が生じる

#### 選択肢

| 選択肢               | 利点                                  | リスク                                   |
| -------------------- | ------------------------------------- | ---------------------------------------- |
| Next.jsから開始      | 既存知見を利用でき、MVPの構成が小さい | API/workerの分離が後から必要になる可能性 |
| NestJSを最初から導入 | APIとworkerの責務を明確に分離しやすい | Phase 1の構成・CI・デプロイ対象が増える  |

#### 決定欄

- [ ] Next.jsから開始する（推奨）
- [ ] NestJSを最初から導入する
- [ ] その他:

---

### 2. リポジトリとpackage管理

#### 推奨

`pnpm workspace + Turborepo`を採用する。

初期構成の候補:

```text
bunshin-platform/
├─ apps/
│  ├─ web/
│  └─ admin/
├─ packages/
│  ├─ bunshin-core/
│  ├─ capability-contract/
│  ├─ database/
│  ├─ shared/
│  └─ observability/
└─ docs/
```

`apps/api`を独立させるかはAPI構成の決定に合わせる。`capability-social`と`capability-blog`の本格実装は対象Phaseまで開始しない。

#### 選択肢

| 選択肢             | 利点                                  | リスク                                        |
| ------------------ | ------------------------------------- | --------------------------------------------- |
| pnpm + Turborepo   | package境界とtask cacheを管理しやすい | npmからの運用変更が必要                       |
| pnpm workspaceのみ | 構成が比較的単純                      | package増加時のtask orchestrationを別途整備   |
| npm workspace      | 既存ブログ版と同じnpmを維持           | 推奨仕様との差異、workspace運用の再検討が必要 |

#### 決定欄

- [ ] pnpm + Turborepo（推奨）
- [ ] pnpm workspaceのみ
- [ ] npm workspace
- [ ] その他:

Node.jsとpnpmの固定version:

- Node.js:
- pnpm:

---

### 3. Platform用データベース

#### 推奨

PostgreSQLを継続し、新Platform用DBと既存ブログDBを当面分離する。

既存ブログDBへ新PlatformのCore tableを直接追加しない。これにより次を守る。

- 既存ブログの稼働を壊さない
- Workspace/Bunshinの新しい所有境界を旧schemaに制約されず設計できる
- BLOG移行のrollbackを可能にする
- Phase 9まで旧ブログを独立して検証できる

#### Hostingの選択肢

| 選択肢              | 向いている条件                        | 主な懸念                           |
| ------------------- | ------------------------------------- | ---------------------------------- |
| Cloud SQL           | 既存GCP/Cloud Run運用を継続する       | pgvector、運用、backupを個別管理   |
| Supabase PostgreSQL | Storage、pgvector等をまとめて使いたい | 既存GCPとの二重運用、Auth採用範囲  |
| その他のPostgreSQL  | 組織標準が別にある                    | 接続、監視、backup、regionの再設計 |

#### 決定欄

- [ ] 新旧DBを分離する（推奨）
- [ ] 同一PostgreSQL内でschemaを分離する
- [ ] その他:

Hosting:

- [ ] Cloud SQL
- [ ] Supabase
- [ ] その他:

Region:

運用・backup責任者:

---

### 4. 既存ブログの移行方式

#### 推奨

既存ブログを稼働可能な状態で維持し、Strangler + Anti-Corruption Layer方式で段階移行する。

Phase 9まで既存コードとDBを大規模移動しない。将来の接続は次の形を基本とする。

```text
新Platform Bunshin
 → BLOG Capability Assignment
 → Legacy ID Mapping / Anti-Corruption Layer
 → 既存Blog
```

#### 避ける方式

- 既存ブログの全面rewrite
- 既存ブログDBへのPlatform Coreの直接追加
- 旧Personaを検証せず新Bunshinとして扱うこと
- Phase 1でWordPress、記事、ASP、SEO moduleを移動すること

#### 決定欄

- [ ] Strangler + Anti-Corruption Layer方式（推奨）
- [ ] 旧BLOGを恒久的な別serviceとして接続
- [ ] その他:

旧ブログの稼働継続予定期間:

許容停止時間:

---

### 5. IDと所有境界

#### 推奨

- 新Platformでは新しいWorkspace/User/Bunshin IDを発行する
- 既存User/Persona/Blog IDは変更しない
- Phase 9でlegacy ID mapping tableにより関連付ける
- User作成時にPERSONAL Workspaceを自動作成する
- Admin identity/Platform運営権限は一般UserのWorkspace roleと分離する

新旧IDを分離する理由:

- 旧Userと新Userでは所有境界が異なる
- 旧Personaと新Bunshinではprofile、Knowledge、Memory、Capabilityの意味が異なる
- mappingを残すことで移行の監査とrollbackが可能になる

#### 決定欄

- [ ] 新ID + legacy mapping方式（推奨）
- [ ] 既存UUIDを新Platformでも維持する
- [ ] その他:

PERSONAL Workspace自動作成:

- [ ] 採用する（推奨）
- [ ] 採用しない

Admin identity:

- [ ] Workspace Userと分離する（推奨）
- [ ] User roleとして管理する
- [ ] その他:

---

### 6. Job基盤

#### 推奨

100-user検証まではPostgreSQL-backed queueを候補とし、既存ブログのlease、retry、backoff、checkpoint、idempotencyの実装知見を再利用する。

ただし既存Job tableをそのまま共有せず、新Platformでは最低限次を持たせる。

- workspaceId
- bunshinId
- capabilityType
- jobType
- idempotencyKey
- attempt/status
- correlationId
- errorCode

Managed queueへの変更条件を先に定義する。

- DB pollingが負荷上の問題になる
- 長時間Jobの独立scaleが必要になる
- 配信保証やdead-letter queueが必要になる
- 複数worker間の運用が複雑になる

#### 決定欄

- [ ] PostgreSQL-backed queueから開始（推奨）
- [ ] Managed queueをPhase 1から採用
- [ ] Phase 1ではinterfaceだけ決め、実体は後続Phaseで決める
- [ ] その他:

---

### 7. デプロイ先

#### 推奨

既存GCP運用を活かす場合は、Phase 1ではCloud Runを第一候補とする。ただしWeb/API/workerを独立させる場合は、それぞれのdeploy unitと費用を明示する。

#### 決定欄

- [ ] GCP / Cloud Runを継続
- [ ] Vercel + 別API/worker
- [ ] その他:

Production、staging、development環境の分離方針:

---

## 推奨セット

Phase 1を小さく安全に開始する推奨セットは次の通り。

```text
API:        Next.jsから開始し、domainをframework非依存にする
Repository: pnpm workspace + Turborepo
Database:   新旧を分離したPostgreSQL
Migration:  Strangler + Anti-Corruption Layer
Identity:   新ID + legacy ID mapping
Workspace:  User作成時にPERSONAL Workspaceを自動作成
Admin:      一般Workspace Userと運営権限を分離
Job:        PostgreSQL-backed queueから開始
Deploy:     既存GCPを活かすならCloud Run
```

## 今は決めなくてよいこと

次は後続Phaseで決定できるため、Phase 1開始条件にはしない。

- SOCIAL画面の詳細デザイン
- Daily Missionの生成Promptと詳細ロジック
- 使用するAI modelの最終選定
- embedding modelと類似度threshold
- SNS API接続と自動投稿
- 動画生成、Canva連携
- 有料Planの価格と詳細制限値
- BLOGの個別データ移行script
- 高度な分析API
- 将来Capabilityの実装順序

## Phase 1開始Gate

最低限、次が決まればPhase 1を開始できる。

- [ ] API構成
- [ ] package manager / monorepo構成
- [ ] Platform DBのhostingと新旧分離方針
- [ ] 既存ブログの段階移行方針
- [ ] ID mappingとWorkspace作成方針
- [ ] Admin identityの扱い
- [ ] Phase 1のdeploy target

Phase 1開始後も、Bunshin domain、SOCIAL、LINE Mission配信、BLOG移行の本格実装は、それぞれのPhaseまで開始しない。
