# Phase 2 Slice 2.4-B Authenticated Capability Assignment API / UI 実装報告

## 1. 調査した内容

既存のverified session、same-origin、JSON validation、`no-store` response、Bunshin詳細ページ、Memory API/UIの実装規約を確認した。Slice 2.4-AのRepository/use caseをそのまま利用し、SOCIAL処理を追加せずAssignment管理だけをHTTP/UIへ接続した。

## 2. 変更したファイル

- `apps/web/src/http/capabilities.ts`
- `apps/web/app/api/workspaces/[workspaceId]/bunshins/[bunshinId]/capabilities/**`
- `apps/web/app/(app)/bunshins/[bunshinId]/capability-section.tsx`
- `apps/web/app/(app)/bunshins/[bunshinId]/editor.tsx`
- `apps/web/app/(app)/bunshins/[bunshinId]/page.tsx`
- `apps/web/app/styles.css`
- `apps/web/test/capabilities.test.ts`
- `docs/DECISION_LOG.md`
- 本報告書

## 3. 主要な設計判断

- 公開mutationをSOCIALのassign、activate、suspendだけに固定した。
- actorはverified sessionからだけ解決し、request bodyから受け取らない。
- Assignment DTOから`config`と`assignedByUserId`を除外した。
- 正常な未割当は空配列、Workspace/Bunshin境界外は`NOT_FOUND`として区別した。
- assignと状態変更は新規・既存ともHTTP 200とし、Coreの冪等性を維持した。
- UIは既存Bunshin詳細内へ置き、投稿機能が後続Phaseであることを明記した。

## 4. 実行した検証

- format check
- lint
- typecheck
- unit / HTTP contract test
- production build
- GitHub Actions `verify` / `database`
- Vercel Preview

## 5. 未解決事項

- Production migrationとauthenticated browser smokeはProduction Gateとして残る。
- SOCIAL profile、投稿、Provider、AI、Jobは各後続Phaseまで実装しない。
- LOCKED操作、課金、entitlement、config編集は未提供。

## 6. 次Phaseへ進める条件

本PRをレビュー・マージし、Phase 2全体監査でtenant/Bunshin境界、Production migration、認証設定、対象外機能の非混在を確認する。監査承認まではPhase 3のMission/Job実装へ進まない。
