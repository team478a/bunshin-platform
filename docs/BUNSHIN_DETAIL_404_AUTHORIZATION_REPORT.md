# BUNSHIN詳細404・所有権境界修正レポート

## 1. 調査した内容

本番ログで、一覧カードのクリック先が `/bunshins/6647dc9f-2a22-4c7e-b261-51f7e98258b4` であることを確認した。詳細要求はNext.jsのストリーミング応答としてHTTP 200を返していたが、画面内部では取得例外を一律 `notFound()` へ変換していた。

個人BUNSHINのRepositoryを確認すると、一覧と基本情報取得は同一WorkspaceのACTIVE MEMBERへ他User所有データも返す一方、人格・Memory・各SOCIAL設定は本人所有またはWorkspace OWNER / ADMINだけを許可していた。この不一致により、一般MEMBERには開けないカードが表示されていた。

## 2. 変更したファイル

- `packages/database/src/index.ts`
- `packages/database/test/database.integration.test.ts`
- `apps/web/app/(app)/bunshins/[bunshinId]/page.tsx`
- `docs/DECISION_LOG.md`
- 本レポート

## 3. 主要な設計判断

- 個人BUNSHINの一覧・詳細は本人所有を基準にする。
- Workspace OWNER / ADMINは既存の運営権限としてWorkspace内の個人BUNSHINを管理できる。
- 詳細画面は認可・不存在だけを404にし、予期しない内部障害は観測可能なエラーとして扱う。
- Service BunshinのService Membership境界は変更しない。

## 4. 実行する検証

- MEMBER本人のBUNSHINだけが一覧へ返ること
- MEMBERが別User所有のBUNSHINを取得できないこと
- Workspace ADMINが既存どおり管理対象を一覧・取得できること
- Database test、Web typecheck / lint / test / build

## 5. 未解決事項

GitHub Production Environmentの `DATABASE_URL` と `DIRECT_URL` は古い認証情報のため更新が必要。本番DB Migration自体はVercelの本番環境から適用済み。

## 6. 次へ進める条件

本変更のCI完了後に本番へ反映し、一般MEMBERの一覧に別User所有カードが表示されないことを確認する。
