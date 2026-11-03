# ADR: 投稿案生成の起動元

## Status

Accepted for Phase 1-A3 implementation (2026-11-02).

## Decision

- 既存のDailyMissionGenerationとMissionContentVariantGenerationへgenerationTriggerを追加する。USER / SCHEDULER / SYSTEM / UNKNOWNに限定し、DB CHECKでも検証する。新しい行動イベントや集計テーブルは作らない。
- 既存行と未対応の内部呼び出しはUNKNOWNを初期値とする。actorUserId、idempotencyKey、STANDARD / PHOTO_FIRSTから起動元を推測しない。
- 本人操作の認証済みHTTP経路でUSER、定期生成Job HandlerでSCHEDULERを固定する。公開bodyから起動元を受け取らない。共有生成Serviceの引数は必須にし、将来の呼び出し元にも指定させる。
- 写真起点や通常別案という操作種別は既存initiatingSourceの責務を維持する。
- PENDING / COMPLETEDや別案の同一キー再送では保存済み起動元を変更しない。FAILEDなDaily生成を新しい試行として再取得するときだけ起動元を更新する。statusとupdatedAtの比較更新で再試行の二重取得を防ぐ。既存行は試行台帳ではないため、過去の失敗試行の起動元履歴を追加保存することはこのPRの範囲外。
- 利用実績Adapterは保存値を集計コアへ渡す。USERの成功生成だけが生成に由来する活動日となる。SCHEDULER / SYSTEMは生成件数に含むが活動日にはしない。UNKNOWNは不明件数も保持する。
- Schema migrationを先に適用し、その後対応アプリを配布する。旧コードによる追加行はUNKNOWNで安全側に倒れる。rollback時も列は残す。readinessの最新migration定義を更新する。

## Consequences

今後の生成から活動日数の根拠を保持できる。過去のUNKNOWN生成を活動日へ遡及算入しない。外部Agent、SNS投稿、追加AI呼び出し、公開API、画面は追加しない。
