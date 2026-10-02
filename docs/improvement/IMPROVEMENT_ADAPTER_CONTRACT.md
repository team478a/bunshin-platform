# Improvement Adapter Contract 設計案

状態: Phase 1の非永続domain/収集契約を実装。2026-10-03にHassy Goal別支援結果の実読取Adapterを追加（`HASSY_SUPPORT_OUTCOMES_IMPLEMENTATION.md`）。HTTP API/管理UI/定期Jobは未接続、DB schema追加なし。Phase 1実装基準は`19f942b622df744f3c1141810a3fdabc39a94cef`（PR #1081 merge）、2026-10-02 JST。以下の擬似契約は設計案であり、実コードの型は各package公開入口を正本とする。

## Phase 1の実装

- `packages/platform-domain/src/improvement-engine.ts`: 共通分類・目的・scope・観測Envelope・Adapter定義・metric完全性・原価欠損・状態遷移・承認Revision照合。
- `packages/application/src/improvement-engine.ts`: `ImprovementScopeAuthorizationPort`、`ImprovementObservationAdapter`、`CollectImprovementObservations`。
- 認可Portが拒否するとAdapterを呼ばない。出力もtenant/Workspace/Service/Package/Adapter/環境を照合し、指定されたUser/Bunshinに限定する。
- source kind/IDで重複排除。同じ原本の内容が矛盾すると失敗。半開期間外、上限超過、未知subtype、矛盾する完全性は拒否する。
- metadataはAdapterが宣言したcode候補、非負整数上限、booleanだけ。未知keyは落とし、allowlist内でも型/値が違えば拒否する。返却は明示projectionで、追加のraw fieldsも落とす。
- 集計がPARTIAL/UNKNOWNまたは分母未取得/0ならrateはnull。確定費用と未確定件数を別保持し、費用のnullを0へ変換しない。
- 承認適格性は状態・scope・Candidate/Evidence revision一致だけの純粋関数。実管理者の権限、承認取消、永続履歴、Codex指示案生成は後続Use Caseで検証する。
- 初回は最大1,000件/90日間のbounded batch。cursorとページ間重複排除は実Adapterの読取PRで追加する。raw dataのprivacy分類はAdapterの責務で、allowlistだけでは匿名化や全秘密値の検出を保証しない。

架空Hassy品質と架空研修難易度のfixtureで契約を確認した。実サービスAdapterや本番DBの接続証拠ではない。

検証（2026-10-02 JST、Node v24.21.0）:

- platform-domain: 全5ファイル11テスト成功、typecheck/対象ESLint/build成功。
- application: 全120ファイル581テスト成功、typecheck/対象ESLint/build成功。
- 新規の契約テストはdomain 4件、application 23件。
- `pnpm architecture:check`成功、`pnpm test:architecture`10件成功。
- 対象Prettier、`git diff --check`成功。全体検証は通常PR CIへ接続する。
- 初回ルート検証は既定Node v22のengine条件で実行できず、既存Node v24へPATHを設定して再実行した。依存関係やlockfileは変更していない。
- 実Adapter、本番DB、実Provider、LINE、管理UI、実際のIssue承認と指示案生成は未実行。

## 責務と配置候補

共通の純粋な改善型・状態遷移を`platform-domain`、認可/読取/保存PortとUse Caseを`application`、DB実装を`database`へ置く。HassyのGoal/Photo First/Barrier変換はSOCIAL capability側の独立モジュールとし、Provider依存やPrismaを共通domainへ入れない。`apps/web`で組み立て、package exportsを使用する。Phase 1では依存追加・DB追加を行わず、この配置が現行境界検査と両立することを確認する。

Adapterは成功指標、イベントmapping、品質signal、Barrier、subtype、privacy hook、改善contextを提供する。Engineはその意味を文字列から推測しない。研修の難易度とハッシーのGoalは各Adapterに閉じる。

## 擬似契約

```typescript
type ImprovementScope = {
  workspaceId: string;
  serviceId: string;
  tenantRef: string; // 認可済み正本から解決。入力文字列を信用しない
  adapterKey: string;
  packageKey: string;
  environment: 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT';
};
type Observation = {
  scope: ImprovementScope;
  source: { kind: string; id: string; revision: string | null };
  eventId: string; // source kind + source ID。原本の重複を排除
  occurredAt: string;
  feature: string;
  action: string;
  eventType: string;
  status: string;
  errorCode: string | null;
  correlation: {
    kind: 'EXPLICIT_REFERENCE' | 'JOB' | 'UNAVAILABLE';
    key: string | null;
  };
  releaseSha: string | null;
  subjectRef: string | null; // scope内だけで有効、画面/指示案へ非公開
  entityRef: string | null;
  metadata: Record<string, string | number | boolean | null>; // Adapter allowlist
};
type MetricSnapshot = {
  scope: ImprovementScope;
  metricKey: string;
  definitionVersion: string;
  fromInclusive: string;
  toExclusive: string;
  numerator: number;
  denominator: number | null;
  distinctSubjects: number | null;
  completeness: 'COMPLETE' | 'PARTIAL' | 'UNKNOWN';
  missingCount: number | null;
  truncated: boolean;
  exclusions: Array<{ reasonCode: string; count: number }>;
  estimatedCost: number | null;
  confirmedCost: number | null;
  unresolvedCostCount: number | null;
};
```

session/operator/route/Bunshin/Generation参照は必要で確認可能な工程だけ追加する。欠損項目を日時の近さ、現在Goal、idempotency keyの文字列分解で推測補完しない。請求・Job再実行・イベント冪等のキーは別物として扱う。

`readObservations`は認可済みscope、半開期間、件数上限、cursorを受け、取得打切りと完全性を返す。privacy hookを通す前のデータをEngineへ渡さない。cursorもscopeと結び、他Serviceへの転用を拒否する。Engineへ任意SQL・URL・shell・raw Provider payloadを渡さない。

## Evidenceと検知

クラスタキー案: `scope + adapterVersion + ruleVersion + feature + issueSubtype + normalizedError + timeWindow`。個人IDや自由文をそのままクラスタキーにしない。

Evidenceは期間、件数、distinct影響人数、成功試行を含む分母、除外、完全性、匿名化sequence、source参照、metric定義、検知rule版を保持する。Confidenceは根拠とセットにし、測定していない再現率を生成しない。観測0と欠損は別状態。Quality検査失敗はQuality不良率の分母へ黙って混ぜない。

Issueには共通分類、Adapter subtype、目的、Evidence revisionを持たせる。Inferenceは事実から別フィールドへ分離する。優先度スコアは候補であり、人間の上書きと理由を記録する。

## 承認と修正後比較

承認はactor/role/scope、Candidate revision、Evidence revision、日時、理由を固定する。Evidenceや改善範囲が変わった場合は旧承認の適用を再確認する。APPROVEDで指示案を生成してもコード変更は開始しない。

修正前後は同じmetric定義・Adapter版・scope・期間長・除外条件で比較する。ルールや測定経路が変われば比較不能理由を出す。十分な観測がない場合はINCONCLUSIVE、観測上改善しない場合はREOPEN候補。改善相関を因果効果として表示しない。

## Privacyと第2Adapter追加

監査ログへ入力自由文・Token・写真を保存しない。scope認可と匿名化を別々に検証する。本部集計の権限をOEM権限から独立させ、少数セル抑止の値は運用決定後に版管理する。削除要求時は原本参照が消えることを許容し、Evidenceを不完全として再評価する。

第2AdapterはAI研修を候補とする。ProgramActionEvent、受講期間、教材版、反復失敗を研修固有の規則で変換し、SNS Goalを持たない入力で共通契約が動くことをfakeテストする。占いはセンシティブ情報の追加privacy hookを先に定義する。全Packageの同時実装は行わない。

Phase 1の完了条件: source重複排除、越境拒否、metadata allowlist、欠損/打切り、未知subtype、安全な状態遷移、承認前の指示案拒否を非課金テストで固定する。永続化設計とHTTP/UIは後続PRへ分ける。
