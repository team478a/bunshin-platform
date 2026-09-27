# OEM支援アラート方針 実装報告

## 調査と変更

OEMの契約形態により支援候補の扱いが異なるため、料金設定とは分離したService単位の支援アラート方針を追加した。

## 設計判断

- `OPTIONAL_UPSELL`: 有料オプションの追加提案。
- `INCLUDED_SUPPORT`: 既存契約内のサポート。
- `INTERNAL_ESCALATION`: 担当者への内部対応依頼。既存Serviceの安全な既定値。
- `DISABLED`: 新しいOEM支援候補を作らない。
- 候補生成時の方針をSnapshotに残し、後の設定変更で過去の判断理由が変わらないようにする。
- 設定変更はManaged Service認可を使い、Service Configuration Auditへ保存する。

## 検証

- Prisma validate、Database build、Web typecheck。
- 方針別候補生成テスト4件成功。
- 管理画面と認可のテスト3件成功。

## 未確認

本番Serviceでの設定保存と、各方針で生成された候補Snapshotの実データ確認。
