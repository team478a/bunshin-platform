# ADR: 公式SNS投稿APIを自社管理し、Museの外部認証と分離する

日付: 2026-11-03  
状態: Proposed（Phase 1-A内部コードのみ）

## Context

ワタシワークス（bunshin）のハッシーは、100社無料検証・OEM販売・将来の他サービス提供を想定する。第三者SNS投稿APIのユーザー単位・アカウント単位の継続費用と依存を避け、各SNSの公式開発者アプリを運営側が契約・申請・管理する方針へ変更する。

既存のSocialProfileは編集用の媒体設定、PostRecordは本人自己申告であり、OAuth認証済みアカウントや投稿成功証跡の代替ではない。Muse連携の外部OAuthは、MuseがBUNSHINのデータを読むための別用途。

## Decision

1. SNS接続用の開発者アプリ/APIキー/審査は運営側が管理する。各利用者は自分のSNSアカウントへのログインと必要権限の許可だけを行う。
2. 公式APIを自社Provider Adapter経由で利用する。Shoutrrr等の全面導入や第三者SNS投稿APIの契約は初期対象外。
3. 初期媒体はInstagramプロアカウントと画像投稿一件に限定。Threads等は、同じ承認・証跡の意味が再利用できる場合だけ段階対応する。
4. SOCIAL CapabilityにProvider非依存の「投稿先・内容revision・媒体・予定時刻・承認・結果」の契約を置く。Meta固有HTTPとTokenはWeb側Adapterに閉じる。
5. 投稿への外部書込は本人が対象・内容・媒体・公開時刻を承認した後にのみ実行し、実行時点で認可・接続状態・素材利用権を再検証する。接続許可やMuseの一括許可は投稿そのものの承認ではない。
6. 他Bunshin/Service/OEMのSNS Account、投稿案、Memory、Tokenを暗黙共有しない。
7. 外部APIのContainer作成成功は投稿成功ではない。実Post IDが確認できた時だけ公式公開成功として保存する。未知の結果は自動再送せず照合する。
8. Phase 1-AではDB/schema/migration、API Route、OAuth、Feature Flag、Cron、Secrets、Provider実通信、本番設定を変更しない。既存システムの日常利用へ新しい確認・監査・低い回数上限を追加しない。
9. 将来のOEM移管では、アプリ所有権と接続済みユーザーの認可は別の手続きであり、必要に応じ再接続が発生する。移管可能と保証しない。
10. 旧RoadmapのPhase 10対象外という経緯は保持し、2026-11-03の事業方針に基づき最小実装を新たな独立Phase 1として扱う。これを既存Free MVPの完成とみなさない。

## Consequences

自社がSNS認証・公開・実績照合の接続資産を管理でき、ハッシー以外にも再利用できる。代わりにMeta等への申請、App Review、媒体API変更追従、Token/接続障害対応、利用規約・制限・原価管理を自社で担う。

今回のコードは承認PreflightとMeta HTTP通信Adapterであり、実OAuth・顧客アカウント連携・投稿をするには後続のUse Case/Repository/Job/API/UI/正式申請が必要。

## References

- [Phase 1-A実装計画](../SNS_OFFICIAL_API_FOUNDATION_PHASE1_A_20261103.md)
- [既存アーキテクチャ](../ARCHITECTURE_PRINCIPLES.md)
- [Muse読取PoC](../MUSE_READONLY_POC_READINESS_REPORT.md)
- [Meta公式Instagram content publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing)
