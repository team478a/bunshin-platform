# Muse・外部AIとInstagram投稿の責務分離

作成日: 2026-11-03
更新日: 2026-11-14
再確認基準main: `11182aaf`（PR #1526マージ後）
状態: 設計文書。外部接続や投稿の実装・有効化は行わない。

## 1. 現在の正本と、この文書の役割

Muse Connectorの現状、未確認仕様、独立検証手順は [2026-11-13の監査](MUSE_CONNECTOR_GAP_AUDIT_2026-11-13.md) を参照する。本書は、外部AIの読取・制作支援とSNS投稿実行を重複させないための責務を補足する。

初版はPR #1443時点の調査であり、その後の本人向けGrant画面、OAuth資格検証、外部読取APIの追加を反映していなかった。初版の「本人同意UI・外部client認証が未実装」という記述を現在の停止理由として使わない。

初版にあったMuseの提供元・製品種別・公式Connectorガイドの断定は、このリポジトリの検証証拠では確認できないため取り下げる。特定のURLを公式認証仕様の根拠として扱わない。対象製品と公式資料は提供元へ確認する。

## 2. 実装済みと未検証を分ける

| 対象                       | 現在のコード                                                                                  | 未検証・未完了                                  |
| -------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 読取Coreと限定DTO          | `ExternalConnectionRead` / `ReadExternalMemberUsage`                                          | Museからの実機読取                              |
| 永続Grant                  | `PrismaExternalReadGrantRepository`、本人・Service・投稿パートナーscope、期限、解除、revision | 本番設定・本番利用の確認                        |
| 本人向け接続画面           | `/s/{slug}/bunshins/{id}/connections`、発行同意・一覧・解除                                   | 特定clientへのconnection ID受渡しと接続完了UX   |
| OAuth同意・資格検証        | 登録client/callback/scope照合、署名・issuer・subject・session・期限確認                       | Museとの認証互換性                              |
| 外部bind / usage API       | Bearer専用、対象scopeはGrantから解決                                                          | 接続先catalogが空のため利用停止中               |
| 外部AI向け制作指示         | PR #1526で生成・プレビュー・本人コピー／端末共有                                              | 外部AI上での実制作、スマホ・LINEでの通し確認    |
| Instagram公式API連携       | 専用のSNS資格・投稿承認・公開処理の境界がコードに存在                                         | 本文書は外部SNS公開成功や本番有効化を証明しない |
| Museからの生成・採否・公開 | この読取Grantの対象外                                                                         | 製品仕様、個別契約、本人承認、実機検証が必要    |

コードの存在、設定有効化、実機検証、本番反映は別の状態とする。

## 3. 既存資産を再利用する責務

1. Platformは、Mission、本人の採否、公式商品情報、素材、企業確認、投稿履歴の正本を既存CapabilityとUse Caseで保持する。
2. 外部読取は、本人が許可した特定Service・投稿パートナーの情報だけを返す。外部clientからUserやWorkspaceを指定させない。
3. 制作支援は本人が制作指示を確認してコピー／共有する。Museへの接続を必須にしない。
4. SNS資格情報は `SocialAccountConnection`、発信設定は `SocialProfile`、外部AI読取許可は `ExternalReadGrant` として既存の責務を維持する。
5. 投稿の本人承認と企業の広告確認を別の権限として維持する。OAuth同意や外部AI上の許可を投稿本文の承認へ読み替えない。
6. 公開処理は既存の投稿Intent・Provider Adapter・Jobの境界を再利用する。Muse用に別の予約・投稿履歴・ワークフロー基盤を作らない。

## 4. 読取と書込の境界

現行Grantのoperationは `member-usage:read` のみ。7日・30日の生成・採用・不採用・本人申告の投稿完了・活動日数を明示的DTOで返す。投稿本文、Memory、企業情報、素材、AI原価を含めない。

Missionや制作指示のAPI読取、投稿案生成、採否、公開・予約は現行Grantの許可範囲外である。必要な場合は、具体的な要求に対してDTO・operation・認可・本人同意を別途設計する。旧Grantの意味を拡張しない。

本人のコピー／共有は端末での明示操作であり、外部AIへの自動送信やSNSへの公開確認を意味しない。

## 5. SNS投稿の二重実行を防ぐ

将来Muse経由の投稿実行を検討する場合も、既存の投稿Intentを単一の実行正本にする。同じ内容をMuse自身とPlatformのworkerがそれぞれ公開する構成にしない。

再利用・確認する契約:

- 認可済みWorkspace / Service / Membership / User / Bunshin
- 承認済み本文・media・対象SNSアカウントとrevision
- 既存の冪等キー、Job再試行、Provider公開ID
- 期限切れ・変更後の旧承認の拒否
- Providerの失敗・不明・公開確認済みの状態分離

不明な公開結果を失敗と決めて再送しない。Providerで確認できる外部IDで照会するか、手動確認へ戻す。本人申告の `PostRecord` を公式API確認済みと同一視しない。未計測値を0へ置き換えない。

## 6. 必要最小限の制御

既存の認証・Grant・解除・Capability・Feature・業務上必要な監査を再利用する。一般的な将来リスクだけで、分散admission、専用読取監査台帳、追加承認画面、低い一律上限を新設しない。

利用計測ログの保存失敗だけで通常の読取を止めない。一方、所有境界・資格検証・本人解除・書込の冪等性・外部操作の明示承認は維持する。具体的な負荷や費用の問題が判明した場合は、既存機能で足りない点と通常利用への影響を説明して対象を絞る。

## 7. 次の進め方とGo / No-Go

- Go: 本人コピー／共有による制作、既存コードのローカル検証、対象製品と公式仕様の確認。
- No-Go: Muse client登録、catalog有効化、Muse実機接続、外部データ送信、本番変更。非本番環境・検証用client・仕様・費用発生の承認が必要。
- MuseがPlatformのOAuth clientになる方式と、PlatformがMuse APIを呼ぶ方式は方向が異なる。後者へ既存Grantをそのまま流用しない。
- 1企業・5人・1Campaignのスマホ／専用LINE通し確認は未実施。環境情報を得てから確認する。

新規DBテーブル、migration、汎用AIエージェント、SNS自動投稿基盤は本書の作業に含めない。

## 8. 参照

- [Muse Connector最新監査](MUSE_CONNECTOR_GAP_AUDIT_2026-11-13.md)
- [外部AI向け制作指示の実装](HASSY_EXTERNAL_AI_PRODUCTION_BRIEF_IMPLEMENTATION.md)
- [企業・グループ型SNS引き継ぎ](HASSY_GROUP_SNS_HANDOFF_2026-11-13.md)
- [責務分離ADR](adr/MUSE_INSTAGRAM_PUBLISHING_BOUNDARY_ADR.md)
- [開発規則](../AGENTS.md)
