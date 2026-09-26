# Repository Isolation Guardrails V1 実装報告

## 1. 調査した内容

- 基準main: `610bdec054dda9b4423a809b2bb37225768a5de6`
- 基準日時: 2026-09-26（Asia/Tokyo）
- 未マージPR: 0件
- 対象: `ProgramCoreRepository`、`ProgramRuntimeRepository`と関連テスト
- 確認した境界: Workspace、Service/Group、User、GroupMembership、ProgramEnrollment、MissionAssignment

Program RuntimeはAI物販とAI研修を含むProgram共通のAssignment、Event、Progressの正本である。既存実装にはWorkspace、Group、Enrollment、Actorの条件がある一方、既存テストは主にSchemaやソース文字列の確認だった。今回、実際のRepositoryメソッドをmock Prisma clientで実行し、越境要求を拒否した後に読み書きへ進まないことを検証対象にした。

## 2. 変更したファイル

- `packages/database/test/program-repository-isolation.test.ts`
  - Program Runtimeの利用者・管理者・System Event境界を挙動で検証
  - 別EnrollmentのAssignment更新とidempotency key再利用を拒否することを検証
  - Program Coreの他利用者Enrollment参照とEnrollment作成境界を検証
- `docs/REPOSITORY_ISOLATION_GUARDRAILS_V1_REPORT.md`
  - 調査範囲、判断、検証結果、残課題を記録

Runtime code、DB Schema、Migration、API、UI、Prompt、LINE、料金、本番設定は変更していない。

## 3. 主要な設計判断

### 3.1 ソース文字列テストを削除しない

既存のmodule boundaryテストはファイル分割やexport形状の退行検知に役割がある。今回の挙動テストはその代替ではなく、実際の認可分岐と「拒否後に副作用がないこと」を補完する。

### 3.2 外部DBを使わない

Repositoryへmock Prisma clientを注入し、検索条件と後続処理を検証する。共有DBや本番DBへの接続、fixtureの永続化、削除処理は行わない。

### 3.3 管理者例外も明示的にテストする

`SERVICE_OWNER` / `SERVICE_ADMIN`は同一Workspace・Group内で他参加者のProgramを管理できる。参加者の拒否だけでなく、この正当な経路が壊れないことも同時に守る。

### 3.4 null actorのSystem Eventを万能権限として扱わない

System Eventは利用者Membershipを要求しないが、Workspace・Group・Enrollment・ACTIVE statusの一致は必須である。この検索が失敗した場合にEventを作成しないことを固定した。

## 4. 実行した検証

追加した挙動テストは次を確認する。

1. 参加者は他MembershipのEnrollment進捗を参照できない。
2. 拒否時はProgress検索へ進まない。
3. Service管理者は同一Scope内で参加者Enrollmentを参照できる。
4. 別EnrollmentのMissionAssignmentを更新しない。
5. 拒否時はAssignment更新とAction Event作成を行わない。
6. 別Enrollmentで使用済みのidempotency keyを再利用できない。
7. System Eventも正確なACTIVE Enrollment Scopeがなければ作成しない。
8. 参加者は他MembershipのEnrollmentを参照できない。
9. Service管理者のEnrollment検索はWorkspace・Group・Membership・Programで限定される。
10. 対象Membershipが同一Scopeに存在しない場合、EnrollmentとAudit Logを作成しない。

追加した挙動テストは8件で、上記10項目を確認した。検証結果は次のとおり。

| 検証                                   | 結果                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| 変更ファイルのPrettier check           | 成功                                                                                |
| `pnpm --filter @bunshin/database test` | 成功、138 files / 429 tests                                                         |
| `pnpm typecheck`                       | 成功、25 Turbo tasks                                                                |
| `pnpm lint`                            | 成功、architecture checkを含む25 Turbo tasks                                        |
| `pnpm test`                            | 成功、architecture 9 tests、Database 429 tests、Web 1,419 testsを含む25 Turbo tasks |
| `pnpm build`                           | 成功、13 Turbo tasks                                                                |
| `git diff --check`                     | 成功                                                                                |

Windows worktreeでは前PRで確認済みのCRLF展開により、未変更ファイルを含む全体`pnpm format:check`をローカル成功判定に使えない。変更2ファイルはPrettier checkに成功している。Linux CIの全体`format:check`を必須の最終確認とする。

## 5. 未解決事項

今回のPRはProgram共通正本の最優先境界に限定する。次は別PRで扱う。

- AI研修固有のProfile、Answer、Toolkit、Growth Repositoryの挙動テスト
- AI物販のItem、Decision、Lifecycle Repositoryの挙動テスト
- FortuneのParticipant、History、Generation Repositoryの挙動テスト
- LINE Deliveryの管理者操作と利用者Scopeの追加監査
- null actorでEventを追加できるApplication Jobの呼び出し元監査
- 統合テスト対象固定と、共有DB・本番DBを拒否する安全判定の強化

既存の静的検査とSchemaテストが成功していても、上記Repositoryすべての越境防止を挙動で保証したことにはならない。

## 6. 次Phaseへ進める条件

- 追加したRepository isolationテストを含む`pnpm test`が成功する。
- `format:check`、`typecheck`、`lint`、`build`、`git diff --check`が成功する。
- Linux CIの`verify`と`database`が成功する。
- このPRにRuntime codeやDB変更が混入していないことを確認する。

条件を満たした後も、本番反映済みとは扱わない。次PRではAI研修・AI物販固有Repositoryのうち、利用者入力と個別Stateを扱う経路から挙動テストを追加する。
