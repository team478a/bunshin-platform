# 重複・過剰管理・簡素化監査

機能の実装状態は[機能台帳](20261106_FUNCTION_INVENTORY.md)。本書の`REMOVE_CANDIDATE`は削除承認ではない。実利用、依存、保持義務、互換性を確認するまで削除しない。

## 集計

| 種別 | 件数 |
| --- | ---: |
| 重複・統合候補 | 12 |
| 過剰管理・制限の改善候補 | 14 |
| 絶対維持する制御群 | 10 |

## 重複・統合候補

| ID | 現状 | 判断 | 対応 |
| --- | --- | --- | --- |
| D01 | Workspace版とService版のBunshin/SOCIAL APIが併存 | 互換層と現行入口を区別すべき | MERGE |
| D02 | Workspace/Service/Group別にDaily Mission、variant、decision、post-record routeが重複 | Domain/Applicationを正本にしrouteは薄いadapterへ | MERGE |
| D03 | 共通onboarding、Service onboarding、Training profile、Member product profileが似た質問を持つ | 目的・同意を越えない範囲で初期値投影 | MERGE |
| D04 | Owner Knowledge、Group Knowledge、Member Product、Product Pack assetに商品/素材が分散 | 所有者と配布物を区別し同一入力の複製を減らす | MERGE |
| D05 | Social実績、Campaign activity、Member Product activityが投稿活動を別投影 | 原記録と用途別projectionを定義 | MERGE |
| D06 | Service usage event、Feature usage event、AI usage、monthly usageに同じ活動が投影される | 請求/原価/利用分析の正本を明記 | MERGE |
| D07 | Point、Service credit、Badge entitlement、Referral rewardが特典残高を別々に表す | 権利種別を維持し利用者表示を一画面へ | SIMPLIFY |
| D08 | 共通LINE、Group専用LINE、Service link、通知設定の状態画面が分散 | 実チャネル別の統合status view | SIMPLIFY |
| D09 | 本部53画面、Service管理40画面、Organization5画面にmember/usage/billing/LINEが反復 | ロール別の主要業務入口へ集約 | SIMPLIFY |
| D10 | 固定教材と動的学習でprofile/current/progressが一部二重 | 教材方式は分離し、認証/Enrollment/回答/原価だけ共通化 | KEEP境界 + MERGE基盤 |
| D11 | Campaign、Content Pillar、Weekly Plan、Missionが「何を投稿するか」を別段階で保持 | 計画階層と版の関係を画面で一本化 | SIMPLIFY |
| D12 | 配信/動画/バッジ/外部成果ごとにretry管理画面と台帳が増加 | Job共通状態を利用し、業務固有の再送条件だけ残す | MERGE |

統合は巨大な新共通基盤を作る意味ではない。既存Application/Repositoryを正本にし、重複UIとadapterを減らす順で行う。

## 過剰管理・制限の改善候補

| ID | 所見 | 利用者への影響 | 判断 |
| --- | --- | --- | --- |
| S01 | 管理画面が本部53、Service40、OEM5 | 日常業務の入口が見つけにくい | SIMPLIFY |
| S02 | 通常設定にもreason入力を要求する経路がある | 保存回数と迷いが増える | 通常変更は差分から自動記録 |
| S03 | 学習承認でSHA/証跡キー/多数checkboxを人が入力 | 技術証跡の転記ミス | サーバー取得、承認意思だけ人が入力 |
| S04 | Hassy準備判定がLINE起点設計でもemail無効等を一律要求 | 実際に使わない経路が開始を止める | Service運用方式別に判定 |
| S05 | Feature、Capability、Product Pack、member assignmentの関係が画面上不透明 | 設定済みでも一般参加者だけ使えない | 有効権利の一画面projection |
| S06 | AI日額/月額/予約/未知原価を同じ強さで表示 | 正常処理の復旧判断が難しい | 月額中心、高度安全設定へ分離。制御は維持 |
| S07 | 同じ企業/商品/対象者を複数onboardingで再入力 | 離脱・不整合 | 同一Service内だけ初期値再利用 |
| S08 | 一部操作が管理者限定だが、日常参加者操作との線引きが不統一 | サポート依存 | role判定統一、権限拡大はしない |
| S09 | 同一actorに共有されたrate/concurrency制限 | 無関係な操作が429で巻き添え | Service/操作目的単位へ。DoS制御維持 |
| S10 | LINE menuの実公開状態と管理画面の公開済み判定がずれた | 正常なのに未準備表示 | Provider照合結果を正本へ反映 |
| S11 | 26種以上のaudit modelとsnapshot | 検索・保持・説明が複雑 | 重要監査を維持し、無変更snapshotを削減検討 |
| S12 | retention/preview/expiry画面が機能別に分散 | 運用漏れ | 保持目的別の一覧へ。保持期間自体は勝手に統一しない |
| S13 | 投稿承認を低リスク通常文と広告/商品内容で同じ扱いにし得る | 日常操作が重い | 既存policyでrisk別表示 |
| S14 | Pilot/実験/将来機能が通常管理navigationに見える | 利用中機能を判別しにくい | HOLD/未契約は詳細へ退避 |

## KEEPする制御

次は簡素化・削除候補にしない。

1. Workspace/User/Bunshin/Service/Groupの所有境界。
2. Server側の認証・session・same-origin・入力validation。
3. Capability/Feature未付与時の実行拒否。
4. 秘密情報の暗号化とProvider分離。
5. AI予算予約、既知価格、未確定原価fail-closed、同時実行上限。
6. 決済Webhook、配信、Mission/Jobの冪等性。
7. 契約・権限・決済・法務同意の重要監査とatomicity。
8. 承認対象revision/digestと公開直前の再検証。
9. 個人データ保持/削除、少人数privacy閾値。
10. 外部送信・大量配信・SNS投稿の明示確認と結果不明時の照合。

## REMOVE_CANDIDATEの扱い

現時点でコード削除を勧告する項目はない。候補は「未使用と確認できた後」に限定する。

- Muse連携の構想記述または古い導線（コード実体・契約・利用者を確認できない）。
- 旧Workspace routeのうちService routeへ完全移行済みで外部利用がないadapter。
- 無変更更新でだけ作られる重複snapshot。
- 通常navigationに残る終了済みPilot/実験画面。

依存検索、アクセスlog、契約、データ保持/export、後方互換を確認するまでは`HOLD`とする。
