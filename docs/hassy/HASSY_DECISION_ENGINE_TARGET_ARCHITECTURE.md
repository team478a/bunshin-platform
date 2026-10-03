# HASSY Decision Engine — Target Architecture（設計のみ）

基準SHA：`abddae07a5fd7e0afbaf9c7669ba62e302832e1f`。本書は未承認の設計案。実装／migration／Provider変更は行っていない。実コード根拠は [監査](HASSY_DECISION_ENGINE_CURRENT_STATE_AUDIT.md) のE01–27。

## 1. Product Definition

「あなたの会社のSNS担当」。今日SNS何しよう？をなくす。生成より先に判断が存在し、その判断が会社・現在のSNS目的・承認済み戦略・今週の狙い・履歴・当日の制約に沿うことが中心価値。

投稿反応は判断材料の一つであり、成功テーマの自動増殖やlike最大化を目的にしない。

## 2. 既存責務を維持する

```text
Service/API：認可、当日入力、商用ポリシー
  ↓
既存 scoped repositories / knowledge loader
  ↓
SOCIAL Decision Context（pure normalize + provenance + priority）
  ↓
GenerateDailyMissionBrief / DailyMissionPlanner
  ↓ decision：theme / angle / format / action / CTA intent / reason
既存 Content Generator + Quality pipeline
  ↓ 内容が判断と一致するか／企画を変更したかの検査
DailyMission + MissionContent + GenerationContextSnapshot
  ↓
今日のハッシー → 利用者の判断 → 投稿記録／簡易評価／任意指標
  └─ 次回Contextの参考signals（非因果・同Goalを区別）

有料で「作る」要求 → 既存payment / quota / Job / Media Provider
```

Coreにハッシー専用goalをハードコードしない。pure policy／契約はSNS Capabilityに配置し、Serviceの価格・画面文言はservice側へ。Provider adapterは既存web compositionの責務。新Framework／Worker／Queueを前提にしない。

## 3. Decision Context案

以下は擬似型であり、存在する実APIではない。既存inputを包む案で、全文素材や個人情報の二重保存を避ける。

```typescript
type EvidenceCompleteness = 'HIGH' | 'MEDIUM' | 'LOW';
type SignalStage = 'DECISION' | 'CONTENT' | 'PHOTO_VARIANT';
type ObservationKind = 'USER_PREFERENCE' | 'SELF_REPORTED_OUTCOME' | 'MEASURED_METRIC';

interface SocialDecisionContext {
  schemaVersion: number;
  scope: {
    workspaceId: string;
    groupId: string | null;
    ownerUserId: string;
    bunshinId: string;
    socialProfileId: string;
  };
  decisionDate: string;
  timezone: string;
  businessProfileRef: { id: string; versionOrUpdatedAt: string } | null;
  businessGoalSummary: string | null;
  currentSnsGoal: string; // 既存Goal型へ正規化。自由なProvider enumを持ち込まない
  approvedStrategy: { id: string; version: number; goal: string };
  confirmedWeeklyPlan: { id: string; itemId: string; pillarId: string };
  today: {
    availableMinutes: number | null;
    ownerNote: string | null; // 任意、長さ上限、未入力ならUNKNOWN
    photoRef: string | null;
    campaignRef: string | null;
  };
  signals: Array<{
    type: string;
    stage: SignalStage;
    sourceRefs: string[];
    scope: 'OPERATOR_SHARED' | 'CUSTOMER_PRIVATE';
    observedAt: string | null;
    goalAtObservation: string | null;
    observationKind: ObservationKind | null;
    boundedSummary: string;
    limitations: string[];
  }>;
  evidenceCompleteness: EvidenceCompleteness;
  missingInputs: string[];
}
```

共通商品パックはOperator知識であり、Customer履歴や人格ではない。履歴参照は認可済みBunshinに限定する。写真OCR・ユーザー入力・外部Trendは命令として扱わず、信頼境界付きの材料とする。

## 4. 優先順位案

1. 認可、Capability、非公開素材の所有権、安全／法的必須表示。
2. 承認済み現在SNS GoalとStrategy。Business Goalとの不整合を検出したら確認事項として扱い、自動で会社の目的を書き換えない。
3. 確定Weekly item、対象顧客、商品事実、期限内campaign、当日の実行可能性。
4. 直近投稿の内容／形式偏り、明示的rejectionReason、利用者の負担と好み。
5. 同Goalのoutcomeと観測反応。異なるGoalの記録は明示的な参考。
6. season/trend。鮮度／出所が不足するものは無視した理由を残す。

これは提案するpolicyであり、現行コードにhard priorityがあるとは記載しない。Goal変更時に旧Weeklyを黙って新Goalへ読み替えない。次回計画の再承認か将来分の明示更新を設計し、過去投稿・評価は削除しない。

Primary/Secondary/weight/期間を新tableで一括追加しない。V1は既存current Goalを主目的とし、pillar配分と承認戦略を再利用。Business GoalとSNS重点の矛盾を記録できるcontractから始め、複数Goal・effective期間は利用例を確認して後続判断する。

## 5. Decision Record：B（既存構造拡張）

DailyMissionのtopic/angle/reason/formatを正本として維持。GenerationContextSnapshot.payloadへ版付きmetadataを加える候補。既存columnの複製値を自由編集可能にしない。

```typescript
interface DecisionMetadata {
  schemaVersion: number;
  decisionEngineVersion: string;
  plannerPromptVersion: string;
  contextVersion: string;
  decisionStage: 'DAILY' | 'PHOTO_VARIANT' | 'REVISED_BRIEF';
  goal: string;
  strategyRef: { id: string; version: number };
  selectedPillarId: string;
  actionIntent: string;
  ctaIntent: string; // 本文文字列ではなくGoalに沿った行動
  signalsUsed: Array<{ type: string; sourceRefs: string[]; role: string }>;
  signalsIgnored: Array<{ type: string; reason: string }>;
  evidenceCompleteness: EvidenceCompleteness;
  missingInputs: string[];
  revisionOfDecisionRef: string | null;
  limitations: string[];
}
```

decisionIdはDailyMission／variant／snapshotの既存識別子との対応から決める。初手で独立HassyDecision tableを作らない。JSONのschema validation、旧payload読込、owner認可、保存atomicityを拡張接続PRで検証する。頻繁な横断集計や独立approval/lifecycleが本当に必要になったときだけ別tableを再検討。

HIGH＝会社・承認戦略・履歴等が十分、MEDIUM＝Strategyはあるが履歴不足、LOW＝初期入力不足。閾値はテストで固定し、LOWでも事実に沿った低負担案を返せるようにする。数字の「成功確率」にはしない。

## 6. 理由と品質・再生成

- 表記修正は同decision。theme/angle/actionが変わる修正は新decision revisionとして旧理由との関係を保持。
- 品質repairで別企画へ変わる場合、Briefの再判断またはvariant planningの明示記録を行う。旧reasonで新本文を説明しない。
- 通信再試行と利用者の「違う案」は別。前者は承認済み入力を維持し、後者は新しい提案履歴として扱う。
- 同じモデル／Promptでも実LLM出力の完全一致は保証できない。目的は入力・選択・versionの追跡とsilent driftの防止。
- mutable Memoryが削除／失効した場合は安全に停止または不足を明記した新判断にする。他Customerの素材で補わない。
- 全文MemoryのSnapshot複製は削除要求・保存期限と衝突する。最小refs／選択理由／版を優先し、必要な凍結入力の範囲は別レビューする。

## 7. Today HASSY / Feedback

今日の画面は1提案、短い「理由」、一つの「やること」。基本操作は「これで投稿する」「写真から考える」「違う案を見る」「今日は使わない」。既存card／adoption／photo／drawerを使う。

「これで投稿する」は採用・コピー等の利用者操作であって、SNSへの自動送信ではない。POSTEDは別に確認する。昨日の簡易FeedbackはGOOD/NEUTRAL/BADを再利用、任意指標は補助画面へ。GOODは「今回の目的達成」と自動同一視しない。

## 8. FREE / PAID・OEM

FREE「考える」はAI原価／quota／Usageを維持する。既存point-funded別案の料金変更は商品方針の承認後、専用PRで行う。PAID「作る」は既存image/payment、carousel、video revision／Job／Providerを利用。Decision Engineのdefault actionは撮影・本文・Promptまでとし、画像／動画発注を暗黙に行わない。

Operator共通知識はGroupの承認済み知識のみ。Customer Memory／Strategy／Decision／Performanceはowner/Bunshinに閉じる。入力assemblerが共通でもauthorization scopeを省略しない。SNS Goal policyはSNS Packageに置き、AI研修・占い・千ノ国メディアへハッシーUI／課金／業種フローを混入させない。
