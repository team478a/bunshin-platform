# Generation Context / Product Pack Boundary ADR

- 状態: Proposed
- 日付: 2026-08-25

## Context

既存Daily Mission生成はBunshin概要、Grant済みKnowledge、SNS戦略、Weekly Plan、Content Pillar、Trendを個別に組み立てる。詳細人格とMemoryは十分に反映されず、公式商品情報の共有モデルも存在しない。商品共有をKnowledge GrantやMemoryへ混ぜると、所有権、公開版、退出、監査、公式事実の優先順位が曖昧になる。

## Decision

1. Application層にProvider非依存のGeneration Context Builderを置く。
2. 人格・Memory・個人Knowledgeは本人Workspace / Bunshin所有のままにする。
3. Product PackはOrganization Workspaceが所有し、Userの明示参加とBunshin割当を別resourceで記録する。
4. AssignmentはPackを参照し、生成時の最新PUBLISHED Versionを解決する。使用VersionはSnapshotへ固定する。
5. 公式事実はProduct Pack Versionを優先し、個人Memoryで上書きしない。
6. Providerへ渡す前後でWorkspace / User / Bunshin / Grant / Participation / Assignmentを再検証する。
7. Snapshotへ使用resourceのID・Version・要約・品質結果を保存し、秘密値、raw response、思考過程を保存しない。
8. Learning Proposalは人格やMemoryを直接変更せず、本人承認後に新VersionまたはMemoryを作る。

## Consequences

- 同じ公式情報を複数参加者が安全に利用しながら、人格と個人体験を分離できる。
- 商品更新後も過去生成の根拠を追跡できる。
- BuilderとSnapshotの追加コストが生じるが、Provider・Product Pack・学習を生成Serviceへ直結する複雑性を避けられる。
- 参加・退出、Version公開、Bunshin割当の状態遷移とIsolation Testが必須になる。

## Rejected alternatives

### Product PackをOwnerKnowledgeとして複製する

公式版の更新、退出、必須表記、組織所有、利用指標を一貫して管理できないため採用しない。

### 本部Workspaceへ参加者Bunshinを所属させる

人格・Memory・Missionの所有権が本部へ漏れる危険があるため採用しない。

### AIに公式情報と個人Memoryの優先順位を任せる

価格・条件・必須表記を決定的に保証できないため採用しない。

### Feedbackから人格を直接更新する

誤学習、単発評価、取消不能、別Bunshin混入を防げないため採用しない。
