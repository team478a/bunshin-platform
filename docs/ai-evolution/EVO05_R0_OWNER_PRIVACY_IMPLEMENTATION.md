# EVO-05 R0: 限定INTERNAL所有者本人のExport・削除互換

## 基準・範囲

- 日付: 2026-10-09。
- 基準main: `dea84defdb30ab59f8625fb0a9f8a9aa2979dc6f`（#1194 merge）。
- branch: `codex/ai-evolution-evo05-owner-privacy`。commitは本PR headで識別する（自己参照SHAは文書へ埋め込まない）。
- 正本: [EVO05B_REPRODUCTION_BRIDGE_DESIGN.md](EVO05B_REPRODUCTION_BRIDGE_DESIGN.md) R0。
- 既存個別学習データExport・ALL/ANSWER削除のRepository認可だけを補完する。学習Runtimeへの権限追加ではない。

## 調査・設計判断

既存`training-personal-data-export.ts/read`と`training-personal-data-deletion.ts/owned`はPARTICIPANTだけを許可していた。限定INTERNAL Seat付きSERVICE_OWNERの本人学習は可能であり、本人データ操作との不整合があった。`resolveMemberServiceContext`→`findMemberServiceFoundationBySlug`にはPARTICIPANT専用条件がなく、HTTPの認証・同一Origin・server解決Scope・validationは再利用できる。

内部DB helper `training-personal-data-privacy.ts/trainingPersonalDataRoleAllows`を共有する。Core/ApplicationへAI固有Seat/Prisma依存を移さず、既存Repositoryの所有権照合後に適用する。公開export/APIは増やさない。

| 条件                                                                          | 判定                                                                                                                  |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 従来PARTICIPANT本人                                                           | 従来条件のまま。Seatを追加要求しない                                                                                  |
| SERVICE_OWNER本人                                                             | 専用AI Training Pilot Program、同一Scope/Program/本人hash、INTERNAL/cohort INTERNAL履歴、本人Enrollmentへの参照が必要 |
| Pilot OFF / Program停止 / Seat取消                                            | 本人Privacyを継続できる。実行Gateは迂回せず、新規学習は従来通り拒否                                                   |
| SERVICE_ADMIN / CONTENT_EDITOR / INTERNAL履歴なし / EXTERNALのみ / 旧V1所有者 | 拒否。管理権限だけでは本人学習データ操作も許可しない                                                                  |
| 別Workspace / Service / User / Enrollment                                     | 既存Membership/Enrollment/Program照合とSeat scope/hashで拒否                                                          |
| ALL削除でSeat参照がnull                                                       | revokedAt必須＋同Scope/本人/Enrollmentの`TRAINING_PERSONAL_DATA_DELETED`・kind ALL監査必須。単なる過去参加は不可      |

### 維持する境界

- Membership/User/Group/WorkspaceはACTIVE、EnrollmentはACTIVE/COMPLETED/EXPIREDのみ。CANCELLED、退会・無効アカウントの経路を今回は拡張しない。
- HTTPのサービス利用期間条件も既存のまま。停止したProgramと、サービス全体の閉鎖・期間終了を同一視しない。閉鎖後の本人請求方法は別レビュー事項。
- ExportはRepeatableRead、削除previewはRepeatableRead、確定削除は既存Enrollment lock/CAS/revision監査を維持する。DBエラーは許可へ変換しない。
- ALLは既存の削除・Seat取消/参照解除・allowlist除去・監査・再書込拒否をそのまま利用。Seatは消さず、枠を再利用しない。ANSWERの本文/関連source Event削除、CAS conflict、再送も既存仕様。
- Exportは既存本人projectionのみ。新題材/再現成功Evidenceや全Event metadataを追加しない。既存account deletion等の別経路の完全性を保証する監査ではない。

## 変更ファイル

- `packages/database/src/training-personal-data-privacy.ts`: 共通の限定Privacy判定。
- `packages/database/src/training-personal-data-export.ts`: 本人所有権確認後に判定。
- `packages/database/src/training-personal-data-deletion.ts`: preview/確定削除のownedへ同じ判定。
- `packages/database/test/training-personal-data-privacy.test.ts`: 役割、取消/OFF、旧V1、参照欠損、ALL監査、DB例外。
- `packages/database/test/training-personal-data-export.test.ts`、`training-personal-data-deletion.test.ts`: 既存PARTICIPANT fixtureのrole明示。
- `packages/database/test/personal-learning-persistence.integration-cases.ts`: 既存所有者3Definition縦フローへ、停止/取消後の本人Export・ANSWER/ALL削除・再送・越境拒否・EXTERNAL拒否・学習再開拒否を追加。
- 本文書、`docs/DECISION_LOG.md`。

## 検証

- ローカル限定3 unit files: 20 tests成功。合成fakeであり本番検証ではない。
- 全体typecheck/lint/unit/build、format、architecture check、HTTP回帰、隔離PostgreSQL integrationの結果は検証追記/PR CIに記録する。実DB統合検証はCIのdisposable PostgreSQLのみ。Productionへ接続しない。
- 既存削除/評価競合・削除後書込拒否・保持・V1/LINE/Provider認可テストを変更せず回帰対象に含める。

## 未実装・引継ぎ・rollback

R1固定題材、R2履歴投影、R3明示再現Bridge、R4 UIは未着手。本人再現性の本番利用はまだNO-GO。退会/サービス閉鎖/CANCELLED時の本人請求、backup完全消去、retention本番定期実行は本PRで保証しない。

schema/migration・UI・モデル・Provider設定・課金・LINE・OEM・保持期間は変更なし。本番deploy/DB操作/Seat付与/Pilot enable/実APIなし。

rollbackは本PRコードのrevert。保存形式は変えないためDB rollback不要。ただしrevertすると限定所有者のこのExport/削除経路が再び利用不可になる。R0レビュー後停止し、次工程は別指示を待つ。
