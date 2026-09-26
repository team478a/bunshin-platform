# Capability Repository Isolation Guardrails V1

## 1. 調査した内容

Program共通層のRepository境界を固定した前段PRに続き、AI研修とAI物販の固有データ経路を確認した。

- AI研修
  - Runtime State取得時のWorkspace / Group / Enrollment / User / Participant境界
  - 初期診断保存時のParticipant Membership境界
  - 回答保存時のEnrollment所有者、Participant権限、Capability境界
- AI物販
  - 商品の参照・作成・更新時のWorkspace / Group / Enrollment境界
  - Participant本人とService管理者の権限差
  - Enrollment所有Membership不在時の書込み停止

既存テストは実装ソースに条件文字列が含まれることを主に確認していたため、今回はPrisma ClientをモックしたRepository実動作テストを追加した。

## 2. 変更したファイル

- `packages/database/src/training-answer.ts`
  - 回答保存対象のEnrollmentが開始済みであることを確認
  - 回答者が`PARTICIPANT`であることを確認
  - EnrollmentのService Programが`AI_TRAINING_V1`であることを確認
- `packages/database/test/ai-training-repository-isolation.test.ts`
  - AI研修固有Repositoryの越境拒否を挙動で検証
- `packages/database/test/ai-resale-repository-isolation.test.ts`
  - AI物販の商品Repositoryの越境拒否と管理者権限を挙動で検証

## 3. 主要な設計判断

### RepositoryでCapability境界を閉じる

APIやApplication層でAI研修の画面から呼ばれることだけを前提にせず、回答保存Repository自身が対象Programの`settings.moduleKey`を確認する。別CapabilityのAssignment IDが誤って渡されても、回答・Eventを保存しない。

### 認可失敗後の副作用を禁止する

テストでは戻り値だけでなく、認可失敗後に次のDB操作へ進まないことを確認する。

- State、Profile、Answerの参照・更新
- Mission Assignment参照
- Program Action Event作成
- Resale Itemの参照・作成・更新

### 既存の正本を維持する

新しい認可モデルや共通Repositoryは追加していない。既存のProgram Enrollment、Group Membership、Service Program設定を正本として利用し、AI研修・AI物販の既存Repositoryへテストガードを追加した。

## 4. 実行した検証

追加した挙動テストは次の8ケースである。

1. AI研修State取得で別UserのEnrollmentを拒否し、個別Stateへ到達しない
2. AI研修初期診断でParticipant Membership不在時にProfileとEventを保存しない
3. AI研修回答で非Participantを拒否し、AssignmentとAnswerへ到達しない
4. AI研修回答で別CapabilityのEnrollmentを拒否する
5. AI物販でParticipantが別Enrollmentの商品を参照できない
6. AI物販のService管理者は同一Scope内の商品を参照できる
7. AI物販でEnrollment所有Membership不在時に商品を作成しない
8. AI物販でEnrollmentアクセス拒否時に商品を更新しない

実行結果:

- changed files Prettier check: passed
- root typecheck: 25 tasks passed
- root lint + architecture check: 25 tasks passed
- root test: 25 tasks passed
- `@bunshin/database` test: 140 files / 437 tests passed
- `web` test: 332 files / 1,419 tests passed
- root build: 13 tasks passed

## 5. 未解決事項

- Fortune固有RepositoryのUser / Bunshin / Service境界は、次の優先監査対象
- LINE配信の送信対象・Deep Link先・配信履歴のWorkspace / Service / User境界は、外部Providerを含むため別PRで検証する
- AI研修の評価、Toolkit、Growth各Repositoryには静的境界テストがあるが、全経路の挙動テスト化は段階的に進める
- 実DBを使う統合テストは今回の高速なRepository単体テストに含めていない

## 6. 次Phaseへ進める条件

- format / typecheck / lint / test / buildが成功すること
- Draft PRのレビューでAI研修回答保存の追加条件が既存運用と整合すること
- 上記完了後、Fortune固有RepositoryのBunshin・Memory・Reading境界を挙動テストで固定する
