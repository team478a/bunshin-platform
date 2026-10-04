# SOCIAL Decision ReBrief Input Contract

## 状態

2026-10-04 JST。PR #1115のmain反映（merge commit `8dacb4b913ecc052c2830e5a57bf7226471c7ba3`）を確認後、そのmainから開始した。実Provider接続の前に、reBriefへ渡せる入力と試行境界をpure contractで固定する。

新しいAgent、Memory、Analytics、テーブル、migration、UI、課金、画像・動画生成、SNS自動投稿は追加しない。Provider呼出し、quota消費、保存、merge、本番deploy、実課金API、実AIは実施しない。

## 1. 調査した内容

- #1115は `REBRIEF_REQUIRED` を決定できるが、再判断時に維持する値、変更可能な値、最大試行数をまだ持たない。
- 既存Briefは日付、Social Profile、Weekly item、format、Campaign、classificationを持つ。本文品質の問題を理由にこれらを黙って変更すると、承認済み計画と実行可能性の境界を越える。
- reBrief時も認可、Capability、ownership、安全・法的条件を再確認する必要があり、UNKNOWNを以前のPASSEDとして流用してはいけない。
- revision参照の永続化は既存Snapshotとの設計判断が残るため、本PRではProvider-safe入力契約だけを扱う。

## 2. 変更したファイル

- `packages/capability-social/src/social-decision-rebrief.ts`: 最大1回、安全境界、固定値、変更可能項目を定義するpure contract。
- `packages/capability-social/test/social-decision-rebrief.test.ts`: 合成fixture。
- `packages/capability-social/src/index.ts`: public export。
- `docs/DECISION_LOG.md`: 設計判断を記録。
- 本書。

## 3. 主要な設計判断

- 入力は `REBRIEF_REQUIRED` のみ。`REJECT_CONTENT` と `KEEP_DECISION` は受け付けない。
- reBriefは1回だけ。通信再試行や実Provider実行は別責務で、本契約は回数を消費しない。
- authorization、Capability、ownership、safety/legalの全てがPASSEDでなければfail-closed。
- Goal、Strategy version、Weekly goal/angle、日付、timezone、platform、format、利用可能時間、Campaign、classificationは固定する。
- topic、angle、reason、estimatedMinutes、personalization source/reasonだけを変更可能とする。
- 準備結果に内部識別子と生成本文を含めず、前Briefの判断要素とbounded issue codeだけを含める。

## 4. 実行した検証

- pure contract fixture: 1回目、4種のUNKNOWN境界、2回目、REJECT、日付・format・Campaign・classification不一致の11件。
- 初回の型検査でfixtureのCampaign分類値が既存enum外であることを検出し、正本の `ADVERTISEMENT` へ修正した。対象test、型検査、lintを再実行して成功した。
- `pnpm architecture:check`: 成功。
- `pnpm test:architecture`: 10件成功。
- `pnpm typecheck`: 25/25 tasks成功。
- `pnpm lint`: 25/25 tasks成功（既存の `apps/web/app/consent/page.tsx:61` のunused eslint-disable warningのみ）。
- `pnpm format:check`: 成功。
- `pnpm test`: 25/25 tasks成功（capability-social 284件、database 828件、web 2771件成功・2件skip）。
- `pnpm build`: Node.js 24.19.0で13/13 tasks成功。

実AI、実DB接続、Storage、通知、課金、本番deployは使用しない。

## 5. 未解決事項

- 実Provider adapterへ渡すPrompt表現とPrompt Version。
- 元decisionとのrevision参照を既存Generation Context Snapshotへ保存する方法。
- reBrief後のBrief／本文が再度REVISEまたは重複となった場合の最終失敗状態と運用通知。
- quota／Usageのidempotency suffixと通信再試行の扱い。

## 6. 次Phaseへ進める条件

1. 本PRの人間レビューとCI成功を確認する。自動mergeしない。
2. 実接続時のProvider入力に内部識別子や生成本文が混入しないことをadapter testで固定する。
3. 最大1回のreBrief後は本文repairへ戻らず、再失敗を保存前に拒否する経路を合意する。

## 停止・切り戻し

pure contract、export、fixture、文書だけをrevertできる。既存Daily Mission生成、本番データ、DB schemaへの影響はない。
