# ハッシー利用実績集計 Phase 1-A2 DB Adapter 実装報告

作成日: 2026-11-01

基点: `origin/main` `d6521f5ea79c059ab4c2c17ab5afddb33c12e916`（PR #1414・#1415マージ後）

ブランチ: `codex/hassy-usage-database-adapter`

## 1. 調査した内容

前PRのMemberUsage契約と既存のサービス参加・規約同意・Bunshin所有権・生成・採否・投稿・AI原価のRepository、Schema、migration、テストを確認した。

既存の`MissionContentVariantGeneration.initiatingSource`はSTANDARD/PHOTO_FIRSTであり、USER/SCHEDULERを証明する値ではない。`DailyMissionGeneration.dailyMissionId`にはMission FKがないため、完了Claimの参照先を別途照合する必要があった。

## 2. 変更したファイル

- `packages/database/src/member-usage-repository.ts`: 既存認可PortとSource Repository Portの読み取り専用実装
- `packages/database/test/member-usage-repository.test.ts`: 境界、投影、上限、障害のunitテスト
- `packages/database/test/member-usage.integration-cases.ts`: 合成データによるPostgreSQL統合テスト
- `packages/database/test/database.integration.test.ts`: 既存disposable DB preflight内へのテスト登録
- `packages/database/src/index.ts`: 公開export追加（共有ファイルの変更）
- `docs/adr/HASSY_USAGE_DATABASE_ADAPTER_ADR.md`: 認可・Source・旧データ・上限の判断
- 本報告書

Schema/migration、Applicationの集計規則、HTTP/UI、Provider実装は変更していない。

## 3. 主要な設計判断

### 所有権と読み取り

本人の有効なWorkspace Membership、Service Membership、参加同意、最新有効規約への同意、Service配下のBunshin所有権を現在時刻で確認する。管理者の暗黙overrideは認めない。過去のasOfはデータの集計期限であり、現在の停止・失効・提供期間を迂回する手段にはしない。

認可とSource取得をそれぞれ`RepeatableRead`のread-only transactionで行い、Source取得内でも認可を再確認する。本文・Memory・URL・手入力成果JSONは選択しない。lastUsedAt、行動ログ、AI使用量などへの書込みも行わない。

5つのscope IDを明示的に組み立ててUUID検証する。未指定のIDがPrismaのundefined条件省略によって広い検索へ変わることを、DB到達前に拒否する。

### 既存正本との対応

| 正本                              | 投影                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| DailyMissionGeneration            | COMPLETEDかつ同scopeの実在Missionに結び付いたClaimだけを成功生成へ投影。同じMissionのClaimを重複計上しない |
| MissionContentVariant             | SUCCEEDEDに結び付く保存済み成果物を投影。生成記録がない旧別案も保存済み成果物として利用                    |
| MissionActivity / MissionDecision | 活動の発生時刻・判断時刻を維持し、既存集計コアの優先規則で補完                                             |
| MissionContentVariantSelection    | 実際の採用操作としてACCEPTEDへ投影。同じMissionのActivity・Decisionと重複排除                              |
| PostRecord                        | MANUALかつ本人の記録だけを、createdAtを報告時刻として投影。投稿公開の証明と混同しない                      |
| AiUsageEvent                      | 成功・失敗の原価を使用。NULLは不明件数を維持し、生成テーブル内の原価を重ねて加算しない                     |

生成起動元はUNKNOWNを維持する。旧DailyMissionの完了Claimが欠落している場合や、参照先が別Bunshinまたは欠落している場合に、生成成功を推測して補わない。

1 Sourceあたり10,000行と超過判定1行を取得する。超過または採否の日時欠落があればPARTIALとし、既存コアが不完全な累計の表示を拒否する。

### 接続方法

```ts
const adapter = new PrismaMemberUsageRepository(prisma);
const summary = await new GetMemberUsageSummary(adapter, adapter).execute(request);
```

## 4. 実行した検証

Node `24.22.1`、pnpm `10.10.0`、PostgreSQL 16で実施。

- Prisma Client生成: 成功
- 新規DB Adapter unitテスト: 19件成功
- 関連規約テストと合わせたDatabase unitテスト: 27件成功
- 既存Application集計テスト: 23件成功
- Database全体のTypeScript型チェック: 成功
- 変更TypeScriptファイルのESLint、依存境界検査: 成功
- 新規PostgreSQL統合テスト: 14件成功

ローカルDBは今回作成した`bunshin_disposable_0461e83e7c7646a4`、127.0.0.1:18998のみを使用した。Container ID・task label・run ID・portを照合し、DB名とcomment markerを確認する既存preflightの後でfixtureを書き込んだ。既存266 migrationをこのDBだけに適用した。

初回の新規統合テストはfixture 2件が既存state CHECKに不一致だった。REVOKEDにはrevokedAtを設定し、未同意はINVITEDとして表現するようfixtureを修正して、14件全成功を確認した。DB制約・本番ロジックは緩和していない。

ローカルのDB統合テスト全体は、標準の5秒制限で271件成功・11件タイムアウトとなった。新規ケースと既存ケースの両方を含み、期待値不一致はなかった。後続実行では既存の共通準備hookも10秒制限に達した。これらを全体成功と扱わず、CIの標準条件を最終ゲートとする。リポジトリのtestTimeout/hookTimeoutは変更していない。

リポジトリ全体のformat / typecheck / lint / test / build、migration readiness、全DB統合・release・TLS検証はPRのCIを品質ゲートとする。CIの最終結果はPRのチェック画面で確認する。

## 5. 未解決事項

- HTTP/UIのcomposition rootは次の作業単位。実会員向け画面はまだ提供していない。
- 既存生成のUSER/SCHEDULER provenanceは不足している。生成起動元の記録追加は別migration PRとする。
- 大量履歴は上限超過で拒否する。SQL集計やページングによる対応は別途必要。
- 原価はasOfまでに発生したイベントの現在の推定値であり、原価精算前の過去状態を復元する会計スナップショットではない。
- 本番DBへの接続、データ更新、Feature有効化、デプロイは行っていない。

## 6. 次へ進める条件

- 本PRのレビューとCIが通過すること。
- 生成起動元の記録を独立PRで追加し、UNKNOWNの旧行を推測backfillしないこと。
- 本人向けHTTP/API・ロードマップ表示へ進む際は、既存のサービス認証・rate limitへ接続し、timezoneとasOfをサーバー側で解決すること。
