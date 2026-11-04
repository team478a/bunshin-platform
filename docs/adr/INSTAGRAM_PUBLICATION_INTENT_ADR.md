# ADR: Instagram投稿Intent・UNKNOWN境界

日付: 2026-11-04
状態: Accepted

## Context

Phase 1-Cでは、既存のDailyMission、MissionContentVariant、生成画像、Job、PostRecordを再利用しつつ、本人が承認した宛先・本文・画像を予約時から公開完了まで追跡する最小の正本が必要である。Metaの`media_publish`は、送信後に応答を失うと成功・失敗を判定できず、自動再送は二重投稿を起こし得る。

## Decision

- `SocialPublicationIntent`を本人承認Snapshotと公開状態の正本にする。資格情報は保持せず、既存`SocialAccountConnection`を参照する。
- 1 DailyMissionにつき1 Intentとし、失敗時のみ新しい承認Snapshotで再設定できる。冪等keyと承認hashの両方で重複を防ぐ。
- 承認時とJob実行時に、会員、SOCIAL Feature、Bunshin Capability、SocialProfile、接続Grant、選択中Variant、画像所有権・ハッシュ・期限を再検証する。
- `media_publish`の直前に永続状態を`UNKNOWN`へ変更する。成功応答を受けた場合だけ`PUBLISHED`とPostRecordへ昇格する。プロセス停止・通信断・応答不正時は`UNKNOWN`のままとし、自動再送しない。
- `UNKNOWN`は専用reconcile操作でMetaのContainer状態だけを照会する。照会結果が`FINISHED`でも公開処理は再送しない。外部投稿IDを確定できない限りPostRecordを作らない。
- Phase 1の公開先は`INSTAGRAM_PUBLISH_TEST_ACCOUNT_IDS`に明示したアカウントだけとし、未設定時はfail closedにする。

## Consequences

二重投稿の回避を、公開成功の自動回復より優先する。応答を失った公開は運用確認が必要になるが、同じ承認からの無条件な再公開は発生しない。カルーセル、Reels、実績同期、外部投稿検索による自動確定はPhase 1-D以降で扱う。
