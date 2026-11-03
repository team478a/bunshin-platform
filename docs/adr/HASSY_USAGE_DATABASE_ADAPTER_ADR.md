# ADR: ハッシー利用実績のDB読み取り

## Status

Accepted for Phase 1-A2 implementation (2026-11-01).

## Decision

- 既存のMemberUsage認可PortとSource Repository PortをDatabaseの1つのAdapterで実装する。HTTP/UIは次PRで接続する。
- 認可は現在時刻で検証する。過去のasOfを指定しても、現在の所属失効、ユーザー/Workspace/Service停止、提供期間外、未同意を迂回できない。
- 本人のACTIVEなWorkspace MembershipとService Membership、参加同意、最新有効規約への同意、Service配下のBunshin所有権を確認する。Platform Adminの暗黙overrideは設けない。BunshinはARCHIVED以外の本人履歴を読み取れる。
- 認可とSource取得をそれぞれRepeatable Readのread-only transactionで実行する。Source取得時にも認可を再検証する。
- 生成件数は、COMPLETEDなDailyMissionGenerationのうち実在する同scopeのDailyMissionへ結び付いたもの、および保存済みMissionContentVariantを正本とする。別案の生成記録がある場合はSUCCEEDEDだけを使い、生成記録のない旧別案も保存済み成果物として数える。初期Mission生成と別案を別操作として数える。原本のない完了Claimを数えない。
- 完了Claimのない旧DailyMissionは生成成功を推測しない。投稿・採否の旧記録は既存集計コアの補完規則で利用できる。
- 現行のinitiatingSourceはSTANDARD/PHOTO_FIRSTという操作種類でありUSER/SCHEDULERの証明ではない。既存生成はUNKNOWNとして返す。
- MissionContentVariantSelectionは実際の「この案を使う」操作なので、ACCEPTEDとして投影する。同じMissionのMissionActivityと既存コアで重複排除する。
- 投稿報告はPostRecord.createdAt、判断はdecidedAt、活動はoccurredAtを使う。本文・Memory・URL・手入力成果JSONを取得しない。時刻のない採否snapshotは不完全なSourceとして拒否し、日時を捏造しない。
- AI原価はAiUsageEventだけを使い、生成テーブル内の費用と合算しない。失敗原価とNULLを維持する。
- 1 Sourceあたり10,000行を上限とし、超過判定用に1行余分に取得する。超過はPARTIALとする。既存コアはPARTIALを拒否するので、切り捨てた累計を正常値として表示しない。将来の大量履歴対応はSQL集計またはページングを別PRで検討する。
- DB/schema/migration、行動ログ、lastUsedAt、監査ログへの書込み、Provider呼出しは追加しない。実DB検証は既存の使い捨てDB preflightの内側でのみ行う。

## Consequences

読み取り専用Use Caseへ実DBのAdapterを注入できる。既存データの起動元不足はUNKNOWNのまま残る。DBの認可確認と読取を完了しても、API/UI提供・本番反映済みとは扱わない。
