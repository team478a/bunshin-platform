# Fortune Repository Isolation Guardrails V1

## 1. 調査した内容

Fortuneの参加、Reading生成、AI生成状態遷移、履歴、閲覧、Feedback、削除の各Repository経路を確認した。

- Serviceは`serviceSlug`から`FortuneServiceSetting`を解決する
- 利用者は対象Groupの同意済みActive Membershipであることを確認する
- 対象BunshinはActiveかつFORTUNE CapabilityがActiveであることを確認する
- Readingは`serviceSettingId`と`memberUserId`で利用者境界を維持する
- AI生成Claimの`workspaceId`、`groupId`、`bunshinId`は解決済みService設定から返す
- Feedbackは本人の閲覧済みReadingだけを更新する

既存のDatabaseテストはSchemaとモジュール分割の確認が中心だったため、Prisma ClientをモックしたRepository実動作テストを追加した。

## 2. 変更したファイル

- `packages/database/src/fortune-generation-repository.ts`
  - AI fallbackの状態遷移が1件に適用されなかった場合、古いReadingを成功結果として返さない
- `packages/database/test/fortune-repository-isolation.test.ts`
  - Service、User、Bunshin、Reading、Feedbackの境界を挙動で検証

## 3. 主要な設計判断

### Service設定をBunshin境界の正本として維持する

利用者から`workspaceId`、`groupId`、`bunshinId`を受け取らず、認証済みUserと`serviceSlug`から利用可能なFortune Service設定を解決する。AI Usageへ渡すBunshinもこのScopeから取得する。

### Reading操作をServiceとUserの両方で制限する

Reading IDだけでは更新しない。参照、Feedback、AI完了、fallback、削除は`serviceSettingId`と`memberUserId`を併用する。

### 状態遷移に失敗したfallbackを成功扱いしない

別User、別Service、既に別状態へ移ったReadingでは`updateMany`が0件になる。この場合にReadingを再読込すると、遷移していない古い内容をfallback成功として返すため、更新件数が1件でない場合は即時に`null`を返す。

## 4. 実行した検証

追加した挙動テストは次の8ケースである。

1. 利用可能なFortune Service Scopeがない場合、Participantを参照しない
2. 解決したServiceに本人Membershipがない場合、Participantを作成しない
3. Reading参照をService設定と認証済みUserへ限定する
4. 本人Participantがない場合、KnowledgeとReadingを作成しない
5. AI生成Claimが解決済みServiceのWorkspace、Group、Bunshinだけを返す
6. 別Userまたは別ServiceのReadingへFeedbackを保存しない
7. Scope内のAI完了遷移が失敗した場合、Readingを返さない
8. Scope内のfallback遷移が失敗した場合、古いReadingを返さない

実行結果:

- changed files Prettier check: passed
- root typecheck: 25 tasks passed
- root lint + architecture check: 25 tasks passed
- root test: 25 tasks passed
- `@bunshin/database` test: 141 files / 445 tests passed
- `web` test: 332 files / 1,419 tests passed
- root build: 13 tasks passed

## 5. Memory個別化の現状

Fortune AI生成は現在、次の承認済みReading情報だけをProviderへ渡している。

- theme
- card
- orientation
- approvedBasic title / body / actionStep

`bunshinId`はAI Usage記録には利用されるが、Bunshinプロフィール、User固有Memory、過去Reading、過去Feedbackは生成入力へ接続されていない。したがって、現状はデータ越境のあるMemory選択経路自体がなく、安全側ではあるが、利用者ごとの継続的な個別化は未実装である。

このPRではRepository境界の固定を目的とし、Promptや生成仕様は変更しない。個別化を追加する場合は、既存`memory-selector`をBunshin・Workspace・Service Scope付きで利用し、参照Memory IDと過去Reading IDを安全に監査できる別PRとする。

## 6. 未解決事項

- Fortune生成へのBunshinプロフィールとMemoryの接続
- 過去ReadingとFeedbackを次回生成へ反映する選定ルール
- Provider入力に渡したContext IDの監査記録
- 実DBを使うRLS・Unique制約込みの統合テスト
- LINE配信先とReading Deep LinkのService / User境界の挙動テスト

## 7. 次Phaseへ進める条件

- format / typecheck / lint / test / buildが成功すること
- Draft PRレビューでfallbackの厳格化が既存運用と整合すること
- 上記完了後、LINE配信の送信対象・Deep Link・配信履歴の越境防止を挙動テストで固定する
