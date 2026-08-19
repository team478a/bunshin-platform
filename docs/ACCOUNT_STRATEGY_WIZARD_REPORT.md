# Account Strategy Wizard API/UI 実装報告

## 結果

verified session配下でSocial Account Strategyの作成、一覧、承認を操作できるAPI/UIを追加した。AI生成は行わず、Wizard回答から確認可能なPROPOSED versionを保存する。

## Wizard

- 対象Social Profile / SNS
- 発信テーマ
- Audience
- SNS目的
- 1日に使える時間（3 / 5 / 10 / 20分）
- 最終誘導先

顔・声の方針と雰囲気は既存BunshinのFace Policy / Personalityを正本とし、Wizard回答として重複保存しない。

## API

- Strategy作成（PROPOSED）
- SocialProfile単位のversion一覧
- Strategy承認
- verified session、same-origin、strict JSON validation、no-store

## 対象外

AI Strategy Generator、Knowledge/Memory context、Primary SNS、Content Pillar生成、Daily Mission連携は実装していない。

## 検証

- Web typecheck
- HTTP contract 4件
- 対象file lint
- git diff check
