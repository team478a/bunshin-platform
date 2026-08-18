# Phase 2 Slice 2.3-B 実装報告

## 1. 調査した内容

Slice 2.1-Bのverified session、same-origin防御、共通API error mappingと、Slice 2.2-BのKnowledge API/UI構成を確認した。Slice 2.3-AのMemory RepositoryがWorkspace/Bunshin scope、管理権限、inactive、soft deleteを強制していることを確認した。

## 2. 変更したファイル

- `apps/web/src/http/memories.ts`
- `apps/web/app/api/workspaces/[workspaceId]/bunshins/[bunshinId]/memories/**`
- `apps/web/app/(app)/bunshins/[bunshinId]/page.tsx`
- `apps/web/app/(app)/bunshins/[bunshinId]/editor.tsx`
- `apps/web/app/(app)/bunshins/[bunshinId]/memory-section.tsx`
- `apps/web/app/styles.css`
- `apps/web/test/memories.test.ts`
- `docs/DECISION_LOG.md`
- 本報告書

## 3. 主要な設計判断

- actorはverified sessionだけから解決し、request由来のUser IDを受け取らない。
- 通常一覧はactiveだけ、`status=inactive`はinactiveかつ未削除だけを返す。
- 公開DTOから`sourceId`と`deletedAt`を除外する。
- create/update/status mutationはJSONとsame-originを必須とし、DELETEはsame-originかつbodyなしとする。
- UIは既存Bunshin詳細内に限定し、Bunshin横断Memory画面を作らない。
- 削除はSlice 2.3-Aのsoft deleteだけを呼び出し、復元・物理削除を提供しない。

## 4. 実行した検証

- format check
- typecheck
- lint
- unit / HTTP contract test
- PostgreSQL integration test
- production build
- GitHub Actions `verify` / `database`

## 5. 未解決事項

- Production公開前のSupabase migration、backup確認、browser smoke、human security reviewは運用Gateとして残る。
- AI抽出、AI要約、embedding、類似検索、Mission feedback連携はPhase 6以降で判断する。

## 6. 次Phaseへ進める条件

本PRをレビュー・マージし、Slice 2.4 Capability Assignmentの実装指示書と状態遷移を承認する。SOCIAL/BLOG handlerやProvider接続はPhase 2へ含めない。
