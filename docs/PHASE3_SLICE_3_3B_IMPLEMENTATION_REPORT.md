# Phase 3 Slice 3.3-B 実装報告

## 結果

Weekly Plan Core Persistenceをverified sessionへ接続し、Bunshin scopeのPlan/Item APIと既存Bunshin詳細内の最小手動管理UIを実装した。

## 実装範囲

- Planの一覧・作成・詳細・strategy更新
- Itemの作成・更新・削除
- Planの明示的な確定・失効
- strict JSON、UUID、same-origin、Content-Type、DELETE body禁止
- verified session actor、Workspace/Bunshin管理境界、SOCIAL Assignment境界
- local date維持、ISO timestamp、Content Pillar表示名、no-store DTO
- Content Pillar直後のWeekly Planセクション
- browser timezone初期値とAsia/Tokyo fallback
- DRAFT編集、確定・失効確認、停止・ロック中read-only
- mobile向け折返し・全幅フォーム

## テスト

- Weekly Plan HTTP契約: 8件成功
- Web全体: 6 files / 37件成功
- Web typecheck: 成功
- Web lint: 成功
- Prettier: 変更対象へ適用

Production buildは、共有worktreeの依存関係junctionがTurbopackのfilesystem root外を指すためローカルでは完了できなかった。webpack fallbackも共有依存のPostCSS plugin解決制約で停止した。型・lint・testは成功しており、通常の独立依存環境を使うGitHub Actions/Vercelでbuildを最終確認する。

## セキュリティ境界

- actor、scope ID、resource ID、status、timestampをrequest bodyから受け付けない
- 未認証、cross-scope、archive済みBunshinを既存Core/Repository境界で拒否する
- SOCIAL未割当、停止、ロック中のmutationを拒否し、停止・ロック中もreadを許可する
- DRAFT以外の編集、重複、confirm条件不足を409へ変換する
- responseへcredential、token、Assignment config、Prisma modelを含めない

## 対象外の維持

AI planner、Daily Mission、scheduler、自動expire、Provider SDK、SNS投稿、LINE、BLOG、Job、bulk、drag-and-dropは実装していない。

## Production前の残作業

- GitHub ActionsとVercel Previewのbuild確認
- PreviewがProduction DB/Auth credentialを持たないことの確認
- Production migration前のbackup/rollback確認
- mobile browser smokeとhuman security review
