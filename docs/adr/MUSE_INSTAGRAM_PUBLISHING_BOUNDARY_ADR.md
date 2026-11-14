# ADR: 外部AIの要求とInstagram投稿実行を分離する

作成日: 2026-11-03
更新日: 2026-11-14
状態: Proposed。責務の設計であり、外部接続・投稿・本番公開の承認ではない。

## Context

初版はPR #1443時点の読取PoCを基準とした。その後、本人Grant管理画面、OAuth同意・資格検証、Bearer専用bind/usage API、本人コピー／共有の制作指示が実装された。現状と未検証事項は [最新監査](../MUSE_CONNECTOR_GAP_AUDIT_2026-11-13.md) を正本とする。

Museの製品・提供元・認証仕様・Instagram操作能力は確認前に断定しない。初版の外部製品・公式ガイドに関する未確認の断定を根拠に、接続や投稿機能を実装しない。

## Decision

1. Mission・生成・採否・企業確認・投稿履歴は、既存Application / SOCIAL Capability / Repository / Jobを正本とする。
2. Providerの認証・transport依存はAdapterへ限定する。
3. 現行外部Grantは `member-usage:read` のみ。Mission・投稿案・素材は別DTO・operation・認可・同意の検討対象とし、暗黙に追加しない。
4. 外部読取同意、SNS資格、本人の投稿承認、企業の広告確認を同一の権限として扱わない。
5. 制作指示は本人が確認してコピー／端末共有する。Museへの接続を必須にしない。
6. 将来の投稿実行にも既存Intentと冪等性を再利用し、Muse側実行とPlatform workerの二重公開を防ぐ。
7. 本文・media・対象アカウントが変わった場合、旧承認で公開しない。
8. 本人申告とProvider確認済み公開を区別する。UNKNOWNの公開結果を失敗と決めて再送しない。
9. 新規の汎用Agent、投稿・予約・履歴基盤、外部OSS全面移植を先回りして作らない。
10. 既存認証・Grant・解除・Feature・Capabilityを再利用し、抽象的なリスクだけで専用台帳・分散admission・承認画面を追加しない。

## Consequences

本人がコピー／共有する制作支援と、外部clientがAPIを読むConnectorは独立して進められる。接続先catalogは空のまま維持し、実機接続は公式仕様と非本番環境・承認が揃ってから検証する。

外部AIやSNS Providerに依存する実装をCoreへ混ぜず、Workspace / Service / User / Bunshin間の分離を保つ。本設計のマージは実機接続、本番DB変更、公開、課金の許可を意味しない。

## References

- [責務・現状と段階設計](../MUSE_INSTAGRAM_INTEGRATION_BOUNDARY_20261103.md)
- [Muse Connector監査](../MUSE_CONNECTOR_GAP_AUDIT_2026-11-13.md)
- [外部AI制作指示](../HASSY_EXTERNAL_AI_PRODUCTION_BRIEF_IMPLEMENTATION.md)
- [共通・SOCIAL・Service責務](HASSY_SHARED_CAPABILITY_BOUNDARY_ADR.md)
- [開発規則](../../AGENTS.md)
