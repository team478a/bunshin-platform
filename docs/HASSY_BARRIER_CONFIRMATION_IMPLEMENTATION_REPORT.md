# HASSY SNS活動障壁 確認・支援永続化 実装報告

## 1. 調査した内容

- H2-Bで追加した`SocialActivityBarrierCase`とEvidenceの境界、状態、再発抑止を確認した。
- 行動証拠だけでは要因を確定できないため、同じEvidenceに属する候補を本人へ一問で確認する境界を設計した。
- 既存の投稿本文、回答本文、Memory本文を新しい監査データへ複製しない方針を維持した。

## 2. 変更したファイル

- `packages/capability-social/src/activity-barrier-support.ts`
- `packages/capability-social/test/activity-barrier-support.test.ts`
- `packages/database/src/social-activity-barrier-confirmation-repository.ts`
- `packages/database/test/social-activity-barrier-confirmation-repository.test.ts`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260926230000_add_social_activity_barrier_confirmation/migration.sql`
- `packages/database/src/schema-readiness.ts`
- 各packageの公開export、schema test、Decision Log

## 3. 主要な設計判断

- 同じEvidenceの候補は最大5件を一問にまとめる。
- 選択された候補だけを`CONFIRMED`、兄弟候補を`DISMISSED`へ変更する。
- 「どれにも当てはまらない」は全候補を`DISMISSED`へ変更する。
- `DISMISSED`は30日間再質問しない。
- 確定後の支援はCategory別のVersioned定義から一件だけ作り、回答と支援を別々の冪等キーで保護する。
- 再送時もWorkspace / Service / Membership / User / Bunshinの全スコープを照合する。

## 4. 実行した検証

- 同一Evidenceの候補だけが一問にまとまるDomain test。
- 別Scopeや別Evidenceの混在を拒否するDomain test。
- 選択した候補だけを確定し、兄弟候補を抑止し、支援を一件作るRepository test。
- 別Workspaceの冪等レコードを返さないIsolation test。
- schema、migration、RLS有効化、冪等indexの静的test。
- capability-socialのtypecheck / lint / test。
- databaseのbuild / lint / test。

## 5. 未解決事項

- 本PRはDomainと永続化までで、本人向けAPI・スマートフォンUI・支援完了操作は含まない。
- DB migrationはproduction反映前に通常のmigration reviewとdeployが必要。
- 管理者集計では確定結果だけを扱うAPIを後続で追加する。

## 6. 次Phaseへ進める条件

- 依存PRのSNS活動障壁Case永続化を先にmergeする。
- 本PRのmigrationとIsolation reviewを完了する。
- 後続PRで認証済み本人だけが質問取得・回答できるAPIと、内部用語を出さないスマートフォンUIを接続する。
