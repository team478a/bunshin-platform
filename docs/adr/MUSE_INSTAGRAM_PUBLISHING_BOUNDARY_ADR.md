# ADR: Museからの要求とInstagram投稿実行を分離する

日付: 2026-11-03
状態: Proposed。設計のみで、公開API、外部認証、SNS投稿の実装承認を意味しない。

## Context

Muse読取専用PoCは#1441で設計し、#1442で外部read Core、#1443で外部接続grantのDB保存/本人解除をmainへ追加した。現時点で外部clientの実認証とMuse実機接続は未完了。

ハッシーにはSOCIALのMission/投稿案・画像/動画生成、手動投稿完了・実績記録が存在する。Instagram Agent SkillやMoneyPrinterTurbo等の生成ロジック、Shoutrrr等の予約投稿OSSの採用を急ぐと、生成・認証・所有scope・投稿履歴・予約・原価の重複が生じる。

Meta Museの公式Connectorガイドはread/writeを分離し、送信・公開をreadへ隠さないよう要求する。Muse内の許可設定はハッシーにおける承認済み内容・期限の再検証を置き換えない。

## Decision

1. Museは外部からハッシーを操作する任意のAI窓口であり、Mission・生成・投稿予約・公開結果の正本にはしない。
2. BUNSHINのApplication / SOCIAL Capability / Repository / Job Runtimeを正本とし、Museの認証・transport依存を外部Adapterへ限定する。
3. 初期Museのoperationは既存の member-usage:read のみ。Missionと投稿案は別途DTO/operationを設計し、旧grantへ自動追加しない。
4. 接続grantの発行同意と、生成・採否・SNS公開の行為ごとの本人承認は別の記録とする。READ許可で書込操作を実行できない。
5. SNS投稿は本人が承認したcontent revision、media、target account、時刻で固定する。重要な情報が変更された場合は再承認。
6. 同一投稿Intentは単一のidempotencyKeyと予約状態で管理し、Muse側実行とハッシー内の公開workerによる二重実行を禁止する。
7. Muse自身のInstagram接続から公開できるかは実機検証事項であり、可否を推測しない。Muse直接投稿経路はProvider証明のない公開成功をハッシーへ確定保存しない。
8. Instagram直接API / ShoutrrrはMuse実機の公開能力と共通の予約・実績・承認要件を比較するまで採用を保留する。
9. MoneyPrinterTurbo/Instagram Agent Skillの全面移植を行わず、既存AI/Videoの不足が実測された場合のみ限定的に再利用する。
10. 既存のWorkspace/Service/User/Bunshin/OEM、現在のCapability/Feature Entitlement、AI原価・監査・本番Gateを緩めない。

## Security and status gates

- Museの外部read公開は本人OAuth等の認証・grant照合・停止/失効・分散rate/concurrency・本文なし監査と、実機テストが成功するまでNO-GO。
- 投稿作成/採否を行うwrite Connectorは別途仕様・承認・実装・審査を必要とする。
- 公開/予約については、対象と媒体を特定した本人承認、provider状態再照会、UNKNOWN時の保留、二重公開防止を必須とする。
- 本設計PRは実データ送信、実アカウント操作、migration、API、UI、Feature有効化をしない。

## Consequences

共通の投稿生成・投稿証跡・原価基盤を維持しながら、Museだけでなく別の外部AI窓口へも対応できる。短期は読取PoCを優先し、投稿の自動化は証拠がそろった段階で開発する。外部サービス単独の実行結果をハッシー内の確定公開記録と混同しない。

## References

- [実装順序・責務比較](../MUSE_INSTAGRAM_INTEGRATION_BOUNDARY_20261103.md)
- [Muse read PoC](../MUSE_READONLY_POC_READINESS_REPORT.md)
- [grant storage](../EXTERNAL_READ_GRANT_STORAGE_REPORT.md)
- [ハッシー責務分離](HASSY_SHARED_CAPABILITY_BOUNDARY_ADR.md)
- [Meta Muse Connectorガイド](https://platform.muse.ai/docs)
