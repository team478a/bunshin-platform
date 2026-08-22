# Phase 6-F1 Messaging / Mission Deep Link Core 実装報告

## ゴール

LINE Providerへ実送信する前段として、通知の重複を防ぐ配信履歴、送信試行履歴、安全なMission Deep Link stateを永続化する。LINE Push、Webhook、LINE Login、quota制御は本Sliceへ含めない。

## 実装範囲

- `LineMessageDelivery`: 実行環境、scope、Mission、通知用途、状態、idempotency keyを保存
- `LineMessageDeliveryAttempt`: attempt番号、成否、分類済みerror、latencyを保存
- `MissionDeepLinkState`: resource scopeをDB側へ保持し、短期・一回限りで消費
- Application Port / Use Case: 配信準備、Deep Link発行・消費をProviderやHTTPから独立
- PostgreSQL Repository: Workspace Membership、Bunshin所有・管理権限、Mission scopeを再検証
- HMAC Signer: HKDFによる環境・用途・version別の鍵分離とrotation

## Security境界

Tokenへ含める値はランダムstate ID、environment、key version、expiryだけである。Mission本文、User ID、Workspace ID、Bunshin ID、Knowledge、LINE user ID、秘密値を含めない。

署名が正しくても所有権の証明とは扱わない。消費時はverified sessionのUserを使い、DBでUser状態、Workspace Membership、Bunshin所有または管理権限、Mission relation、environment、key version、expiryを再検証する。条件付き更新に成功した最初の1回だけを許可する。

署名親鍵は管理画面・DBへ保存しない。環境別`ENCRYPTION_KEY`から、HKDFの用途文字列`line-mission-deep-link:hmac-sha256`と`LINE_DEEP_LINK_KEY_VERSION`を使って専用鍵を導出する。LINE Channel SecretおよびChannel Access Tokenは使用しない。

## データ最小化

配信履歴には通知本文とProvider responseを保存しない。試行履歴には分類済みerror categoryだけを保存し、Token、Secret、LINE user IDを保存しない。Deep Link stateは利用後も監査可能な消費日時だけを持つ。

## 後続Slice

Phase 6-F2でLINE Messaging API Adapter、Push実行、quota優先制御、retry policy、Missionへのクリック導線を接続する。接続時も本SliceのPortと永続化を正本とし、Bunshin CoreからProviderを直接呼ばない。
