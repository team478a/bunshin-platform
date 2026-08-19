# Phase 2 Completion Audit

監査日: 2026-08-19  
対象commit: `6baa70af40f223d8d4be9d92fb040c5a792e3488`（PR #20 merge）

## 1. 結論

Phase 2「Multi-Bunshin Core」のコード実装は完了している。User／Workspace、Bunshin Identity、Owner Knowledge／Grant、Bunshin Memory、Capability Assignmentが独立modelとWorkspace/Bunshin scopeを持ち、認証済みAPIと最小UIまで接続されている。

Phase 2をProductionで利用開始するGateは未完了である。特に、最新5 migrationのProduction適用確認、Supabase Auth本番設定、custom SMTP、認証済みbrowser smoke、backup/restore確認、人間によるsecurity reviewが必要である。

したがって判定は次のとおりとする。

- Phase 2コード完了: **PASS**
- Phase 2設計境界: **PASS**
- Production利用開始: **BLOCKED（運用Gate未完了）**
- Phase 3設計開始: **本監査PRの承認後に可**
- Phase 3本格実装: **Phase 3指示書とADRの事前承認が必要**

## 2. Scope監査

| 項目                               | 状態 | 根拠                                                                  |
| ---------------------------------- | ---- | --------------------------------------------------------------------- |
| User / Workspace                   | PASS | Phase 1 model、membership、verified sessionを継続利用                 |
| Bunshin CRUD                       | PASS | PR #6、#8。create/list/detail/update/archive API/UI                   |
| Objective / Audience / Personality | PASS | Bunshin配下の独立modelとaggregate                                     |
| Owner Knowledge                    | PASS | PR #10、#12。所有者scopeとsoft archive                                |
| Bunshin Knowledge Grant            | PASS | default DENY、grant/revoke、Workspace/Bunshin制約                     |
| Bunshin Memory                     | PASS | PR #14、#16。active/inactive/soft delete、Bunshin scope               |
| Capability Contract / Assignment   | PASS | PR #18、#20。明示割当、ACTIVE/SUSPENDED/LOCKED、Core guard            |
| 認証済みAPI                        | PASS | Supabase verified userからCurrentUserを解決し、request由来actorを拒否 |
| 最小UI                             | PASS | Bunshin詳細内のKnowledge、Memory、SOCIAL Assignment管理               |
| Cross-user / Cross-bunshin test    | PASS | PostgreSQL integration testとHTTP contract test                       |

## 3. Architecture監査

### PASS

- UserとBunshinは別entityであり、1 User : N Bunshinを維持している。
- Objective、Audience、Personality、Knowledge Grant、Memory、Capability AssignmentはBunshin単位で分離されている。
- Repository queryはWorkspace/Bunshin scopeを使用し、境界外を`NOT_FOUND`へ変換する。
- Knowledgeはdefault DENYで、明示grantなしにBunshinへ渡らない。
- Memoryは別Bunshinへ暗黙共有されず、inactive/deletedを通常contextから除外できる。
- CapabilityはBunshinのboolean fieldへ直書きされず、Assignmentと実行前guardで管理される。
- Provider依存、AI、LINE、BLOG、JobはCoreへ混入していない。
- Platform Admin overrideは一般Bunshin APIへ追加されていない。

### 注意事項

- Supabase RLSは未採用であり、tenant分離の正本はapplication/repositoryである。Production DB接続権限の最小化を継続する。
- Capability API/UIが公開するmutationはSOCIALだけだが、SOCIAL実行機能は存在しない。UIにも後続Phaseである旨を表示している。
- HTTP/UIの認証済み実ブラウザ検証はProduction Auth設定後に必要である。

## 4. Database監査

現在のmigrationは次の5件である。

1. `20260818000000_platform_foundation`
2. `20260818170000_bunshin_identity`
3. `20260818200000_owner_knowledge_grants`
4. `20260818220000_bunshin_memory`
5. `20260819090000_bunshin_capability_assignments`

CIでは空のPostgreSQLへ全migrationを順番に適用し、integration testが成功している。Productionへ何件適用済みかはこのリポジトリから確定できないため、`prisma migrate status`で確認するまで未確認とする。

Production migrationは`.github/workflows/production-migrate.yml`を`main`から手動実行し、GitHub Environment `production`の承認を必須とする。Vercel buildから自動適用しない。

## 5. Test監査

PR #20時点で次が成功している。

- GitHub Actions `verify`
- GitHub Actions `database`
- Vercel Preview build
- format / typecheck / lint / unit test / production build
- PostgreSQL migration deploy / integration test
- Bunshin、Knowledge、Memory、CapabilityのCross Workspace/Cross Bunshin境界test

未実施またはリポジトリから確認不能:

- Production Supabaseに対するmigration status
- Production Magic Linkの送受信
- logout後の実ブラウザaccess拒否
- mobile実機またはbrowserでの主要操作
- backup restore rehearsal
- 人間によるsecurity/privacy review

## 6. Production Gate

詳細は`docs/PHASE2_PRODUCTION_GATE.md`を正本とする。Gate完了前に一般ユーザーへPhase 2画面を案内しない。

Staging専用Supabaseは現方針どおり、実運用開始までは作成しない。PreviewへProduction DB credentialを設定せず、DB検証はlocal PostgreSQLとGitHub Actionsの一時PostgreSQLで行う。Production相当のmigration/Auth検証が必要になった時点でstaging追加を再判断する。

## 7. Phase 3 Gate

Phase 3はSOCIAL Foundationであり、Social Profile、Content Pillar、Weekly Plan、Daily Mission、Mission Content、Post Record、Feedbackを扱う。実装前に少なくとも次を別指示書またはADRで決める。

- Phase 3の最初の縦切りと対象model
- Daily Missionの一意性と冪等性
- Capability ACTIVE guardを呼ぶ境界
- 投稿生成と公開を分離する状態機械
- Provider非依存portと失敗記録
- AIをまだ導入しない範囲
- Jobをまだ導入しない範囲
- Productionへ公開しない開発順序

本監査の承認だけでPhase 3全体実装を一括開始しない。
