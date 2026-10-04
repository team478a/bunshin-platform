# SOCIAL Decision ReBrief Orchestration Contract

## 状態

2026-10-04 JST。PR #1118のmain反映（merge commit `91517835de5037d31ce8f9aead3fdb80f4d42753`）とCI成功を確認し、そのmainから開始した。reBriefの初回判断、最大1回の実行、再品質検査、最終fail-closedを一つのversioned pure state machineへまとめる。

新しいAgent、Memory、Analytics、テーブル、migration、UI、課金、画像・動画生成、SNS自動投稿は追加しない。本番Daily Mission経路からのreBrief Provider呼出し、quota／Usage消費、保存、merge、本番deploy、実課金API、実AIは実施しない。

## 1. 調査した内容

- 既存品質pipelineはDecision Context対象のREVISE／本文検査issueを検出すると、本文repair前に `DECISION_REBRIEF_REQUIRED` で停止する。
- reBriefの入力、専用adapter、finalize契約は揃ったが、再品質検査後の次動作と二回目を禁止する正本がなかった。
- repair dispositionは従来 `DAILY` stage固定で、reBrief後の検査結果を同じ型で正確に表現できなかった。
- 最大回数を呼出し側のif文だけに置くと、別経路で二度目のreBriefを開始できるため、stageとattemptの組をdomainで検証する必要がある。

## 2. 変更したファイル

- `packages/capability-social/src/social-decision-rebrief-orchestration.ts`: versioned pure state machine。
- `packages/capability-social/src/social-decision-repair.ts`: `DAILY`／`REVISED_BRIEF` stageをrepair結果へ保持。
- `packages/capability-social/src/index.ts`: public export。
- capability fixture: 初回受理／拒否、1回のreBrief、再検査受理／失敗、stage・attempt不整合を検証。
- `apps/web/src/services/daily-mission-quality-pipeline.ts`: 既存fail-closed guardの次動作判定をstate machineへ統一。
- web fixture、Decision Log、本書を更新。

## 3. 主要な設計判断

- `DAILY + attempt 0` と `REVISED_BRIEF + attempt 1` だけを有効な組合せとする。
- 初回PASSは `ACCEPT_BRIEF`、初回REVISE／本文検査issueは `RUN_REBRIEF`、初回REJECTは `FAIL_CLOSED` とする。
- reBrief後はPASSかつ本文検査issueなしだけ `ACCEPT_BRIEF`。REVISE、REJECT、重複、作成指示露出等は `REBRIEF_ATTEMPT_FAILED` で終端し、二回目を許可しない。
- state machineの入出力に生成本文、内部ID、Provider payloadを含めない。
- 既存web guardは引き続き停止するだけで、まだadapterを呼ばない。挙動を先に明示し、quota／保存／実接続は次の統合単位で扱う。

## 4. 実行した検証

- orchestration対象test: 9件成功。
- web quality pipeline対象test: 4件成功。
- architecture test: 10件成功。
- `pnpm typecheck`: 25 package成功。
- `pnpm lint`: 25 package成功。既存の未使用eslint-disable warning 1件のみ。
- `pnpm format:check`: 成功。
- `pnpm test`: 25 package成功。web 2,775件、database 828件を含む。実Providerを使うlive test 2件は既定どおりskip。
- `pnpm build`: 13 package成功。

実AI、実DB接続、Storage、通知、課金、本番deployは使用しない。

## 5. 未解決事項

- `RUN_REBRIEF` を受けてadapterを1回呼ぶweb orchestration。
- 通常Brief、本文、品質検査、reBriefのquota／Usage suffixと冪等性。
- 元Brief、reBrief result、最終品質結果のrevision metadataをSnapshotへ保存する方法。
- 最終fail-closedを既存生成失敗状態・運用通知へマッピングする方法。

## 6. 次Phaseへ進める条件

1. 本PRの人間レビューとCI成功を確認する。自動mergeしない。
2. quota／Usage、revision metadata、最終fail-closedを含むweb orchestrationをfake Provider／repositoryで原子的に検証する。
3. UNKNOWNのauthorization／Capability／ownership／safetyLegalをPASSEDへ補完せず、最初のtrusted precheck結果をreBriefでも再利用・再照合する。

## 停止・切り戻し

pure state machine、stage拡張、既存guardへの判定接続、fixture、文書だけをrevertできる。Provider呼出し、本番データ、DB schemaへの影響はない。
