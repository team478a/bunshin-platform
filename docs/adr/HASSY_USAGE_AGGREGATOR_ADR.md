# ADR: ハッシー利用実績の読み取り契約

## Status

Accepted for Phase 1-A implementation (2026-11-01).

## Decision

- Phase 1-AはApplication層の集計関数、認可Port、Source Repository Port、取得Use Caseを実装する。DB AdapterとHTTP/UI接続は後続PRとする。
- 集計単位はWorkspace / Service / Membership / User / Bunshinの完全な組み合わせ。別Bunshinの履歴は合算しない。認証主体と集計対象Userは同一とする。
- 利用者の認可をSource読み取りより先に実施する。Repositoryも各Sourceの所有権とService配下のBunshinを検証する。返却Sourceのscopeが異なる場合は集計を拒否する。
- 7日・30日は指定IANA timezoneの当日を含む暦日。取得時刻より未来の記録を含めない。活動日には操作の発生日時を使い、Mission予定日や投稿の申告公開日時を使わない。
- USER起動が証明された生成成功、採用、不採用、コピー準備、投稿完了報告を活動とする。閲覧、ログイン、配信、Scheduler生成、Feedbackだけでは活動日を増やさない。
- 生成元UNKNOWNの旧記録は生成成功回数へ含め、活動日へ含めない。生成失敗は成功回数に含めない。生成回数は品質検査・永続化まで完了した生成操作単位とし、AI呼び出し回数とは分ける。
- 採用/不採用は各Missionごとの経験回数。Activity正本を優先し、Activityがないときだけ現在のDecisionから補完する。同じMissionを採用し、その後不採用とした場合はそれぞれ1回になる。
- PostRecordとPOSTED Activityは同一Missionにつき1件。Activity発生時刻を優先し、旧PostRecordだけの場合はcreatedAtを報告日時として使う。SNSの公開確認ではなく自己申告として返す。
- AI原価は成功・失敗の双方を含める。既知費用はBigIntで加算し、出力は10進文字列。NULLはunknown件数で返し、0円へ補完しない。
- 読み取りは完全なSource snapshotだけを受け付ける。部分取得や欠測を空の成功へ変換しない。新規イベント、集計table、migration、AI呼び出しは追加しない。

## Consequences

旧データから保守的に活動日を算出できる。生成元provenance追加、DB読み取り、API/UI、紹介・画像/動画・自動化利用指標は独立した後続PRで接続する。Port実装と本番確認前に、実利用者へ提供済みと扱わない。
