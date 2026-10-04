# SOCIAL Decision Metadata Snapshot

## 状態

2026-10-04 JST。PR #1112のmain反映（merge commit `5d82d40ad2d70414871d6ce0783aed01677d50ec`）を確認後、そのmainから開始した。Brief直前へ接続済みのDecision Contextについて、既存Generation Context Snapshotへ監査用の最小metadataを同一transactionで保存する。

新しいAgent、Memory、Analytics、テーブル、migration、UI、課金、画像・動画生成、SNS自動投稿は追加しない。merge、本番deploy、実課金APIは実施しない。

## 1. 調査した内容

- Daily Missionと `GenerationContextSnapshot` は既存repositoryで同一transaction保存される。
- 既存SnapshotはStrategy Goal、Weekly、Pillar、Prompt/model、品質、personalization source種別と参照IDを保持する。
- Brief Providerが返した `personalizationReason` は500文字以内に検証されるが、Snapshotには保存されていなかった。
- 既存 `promptVersion` は本文生成Providerの版であり、Brief PlannerのPrompt版ではない。Decision metadataでは両者を混同しない。
- Context全体を保存するとactor、履歴行ID、観測値、自由文を複製するため、最小projectionが必要。

## 2. 変更したファイル

- `packages/application/src/generation-context.ts`: 任意・版付きのDecision metadata契約とvalidation、personalization理由を追加。
- `apps/web/src/services/daily-mission-decision-context.ts`: READY Contextから秘密情報を除いたmetadataを構成。
- `apps/web/src/services/daily-mission-generation.ts`: 接続済みContextを既存保存境界へ渡す。
- `apps/web/src/services/daily-mission-result-persistence.ts`: Brief Planner版とContext metadata、personalization理由をEvidenceへ接続。
- `apps/web/src/services/daily-mission-persistence.ts`: 既存Snapshot payloadへ任意blockとして保存。
- 対応するapplication / webテスト、Decision Log、本書を更新。

## 3. 主要な設計判断

- top-level Snapshot schemaは変更せず、`decision.schemaVersion = 1` の任意・加算的blockとする。旧Snapshotはそのまま読め、backfillしない。
- 保存対象は版、stage、READY、材料充足度、利用可能signal種別、無視理由の種別別件数、missing inputs、制約だけ。履歴本文、内部ID、actor、URL、観測値を保存しない。
- Providerが実際に使用したと申告したsource種別は既存 `personalization.sourceTypes`、理由は同blockの `reason` に保存する。利用可能だった材料と実使用申告を混同しない。
- metadata保存はDecision ContextがREADYとなった対象ServiceのAI経路だけ。対象外Serviceやdeterministic fallbackの挙動を変更しない。
- 本変更は生成時判断の監査であり、品質repairが企画自体を変えた場合のreason再生成・revisionは含めない。

## 4. 実行した検証

- applicationのSnapshot契約・旧payload互換・不正metadata拒否テスト。
- webのDecision metadata projection、秘密情報非保存、Snapshot組立て、保存境界テスト。
- `pnpm architecture:check`: 成功。
- `pnpm test:architecture`: 10件成功。
- `pnpm typecheck`: 25/25 task成功。
- `pnpm lint`: 25/25 task成功。既存の `apps/web/app/consent/page.tsx:61` にunused eslint-disable warningが1件あるが、errorはない。
- `pnpm format:check`: 成功。
- `pnpm test`: 25/25 task成功。application 693件成功、web 2769件成功・live 2件skipを含む。
- `pnpm build`: Node 24.19.0で13/13 task成功。初回は端末既定のNode 22.15.0がリポジトリ要件 `>=24 <25` を満たさず実行前に停止したため、同端末のNode 24へ切り替えて再実行した。
- `git diff --check`: 成功。

実AI、実DB接続、Storage、通知、課金、本番deployは使用しない。

## 5. 未解決事項

- Decision Context対象の本文品質repairは、後続の `HASSY_DECISION_REPAIR_GUARD.md` でreBrief未実装時のfail-closed guardを扱う。自動reBriefまたはdecision revision自体は引き続き未解決。
- Photo Firstや別案生成を `DAILY` と異なるdecision stageとして保存する契約。
- 運営画面での表示は追加していない。metadataに自由文や個人データを増やさず別途レビューする。

## 6. 次Phaseへ進める条件

1. 本PRの人間レビューとCI成功を確認する。自動mergeしない。
2. repair前後の意味変更検出方法と、reBriefまたはrevisionの正本を合意する。
3. UI、Photo First、別案へ進む場合は本PRへ混ぜず独立した小PRにする。

## 停止・切り戻し

`decision` と `personalization.reason` は任意JSONであり、読取側に必須化しない。保存接続をrevertしても旧SnapshotとDaily Missionは変更不要で、DB migrationの切り戻しは発生しない。
