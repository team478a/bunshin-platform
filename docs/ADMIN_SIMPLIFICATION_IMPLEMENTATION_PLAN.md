# 管理運用簡素化の実装計画

作成日：2026-11-03 JST。基準SHA：`7d397821b144361dcf5643dc92ce4ac95ebcb334`。本書は監査後に着手可能な作業分割であり、実装・本番変更を行った報告ではない。

関連文書：[横断監査](ADMIN_UX_OPERATION_AUDIT.md)、[制限分類](ADMIN_RESTRICTION_SIMPLIFICATION_PLAN.md)、[画面再設計](ADMIN_UX_REDESIGN.md)。F01〜F28は監査所見の識別子。

## 1. 今回の提出範囲

今回作成するのは上記3文書と本書の計4文書だけ。Runtime、API、Prisma schema、migration、既存データ、Feature Flag、本番設定、メール/LINE送信、deploymentを変更しない。

最新mainを独立worktreeへ取得し、元の競合・作業中差分を含めない。監査時のroute在庫と、UI→HTTP/Server Action→Repositoryの主要経路を照合する。既存動作を確認するための合成データテストは実施するが、画面テストや本番回帰を実施済みとは報告しない。

## 2. 作業順とPR境界

大枠は依頼のPR-1〜5を維持し、独立レビューできる部分は小分割する。PR-0が本4文書。P0の未使用reason入力はPR-2Aとして小さく先行してもよい。UI整理と業務ルール変更を一つの巨大PRに混ぜない。

| PR                               | 対応所見                  | 主な成果                                                         | 着手・完了の条件                                                       |
| -------------------------------- | ------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| PR-1A 本部メニュー整理           | F01/F20/F23               | 既存23リンクを業務4〜5分類へ、詳細情報を退避                     | 既存URL・role別アクセス・深いリンクを維持。新DB/API不要                |
| PR-1B Service/OEMホーム整理      | F02/F03/F04/F26           | 要対応・会員・稼働優先、適用機能だけ取得/表示                    | 認可と補助集計の失敗を区別。Hassy/研修/占い/OEMの否定テスト            |
| PR-2A 通常保存の入力削減         | F05/F06/F07               | 未使用理由を撤廃、通常理由をサーバー自動記録                     | 旧client payloadを受理。重要操作の理由・監査は別判断                   |
| PR-2B 学習承認の来歴自動化       | F08/F09/F10の証跡入力部分 | SHA/証跡手入力0、1件の承認1回、状態取得の自動化                  | 内容承認とPilot開始を分離。CAS/冪等性/現在状態照合を維持               |
| PR-2C 配信・接続確認の集約       | F17/F18/F19/F25のUI部分   | 外部作用の最終確認を1つの差分画面へ                              | 秘密値更新・有料送信・二重配信の保護を維持                             |
| PR-3A 制限scopeと認可の整合      | F11/F12/F15               | Service/目的別の負荷制御、許可内の保存、承認済み初期policy再利用 | 別Service/非管理者/失効を拒否。契約・予算上限は変更しない              |
| PR-3B 商品方針と実損害制御の分離 | F13/F14/F16/F27/F28       | 調整可能な業務値・商品方針・契約値を明確化                       | 本部責任者が許可範囲・既存値の扱いを確認。勝手な有料生成/配信開始なし  |
| PR-4A 監査の書込合理化           | F20/F21                   | 無変更更新や不要snapshotの削減、既存履歴表示の整理               | 同一操作の実際の保存数を計測し、重要監査のatomicity/旧export互換を検証 |
| PR-4B 保持・障害回復の整理       | F22/F24/F25               | 既存保持処理とJobの再利用、停止範囲の局所化                      | 所有・本人削除・未確定費用・配信未知結果を維持。新台帳なし             |
| PR-5 共通化と通し検証            | 全体                      | 同じ操作ルールとPC/スマホ受け入れ、重複実装の最小整理            | 実装で確認された重複だけを共通化。全体回帰・比較測定完了               |

## 3. PR別の具体的なファイルと再利用

### PR-1A 本部

変更候補：

- `apps/web/app/ui/app-shell.tsx`
- `apps/web/app/(app)/admin/page.tsx`
- `apps/web/app/styles.css`
- 既存`apps/web/test`内のnavigation/管理画面テスト。業務分類の小さいテストを必要に応じて追加。

現在のdetailsによる分類、active判定、既存リンクを再利用する。audit画面やAPIは削除しない。権限・機能ごとの条件付き表示は、現在のrole情報が表示側へ渡せることを確認してから実装し、clientの推測で許可を決めない。

受け入れ：主要分類4〜5、通常業務の入口が分かる、監査やAPI情報を通常保存で開かない、既存deep linkが到達可能、ログイン/権限拒否が変わらない。

### PR-1B ServiceとOEM

変更候補：

- `apps/web/app/s/[serviceSlug]/manage/service-management-home-data.ts`
- `apps/web/app/s/[serviceSlug]/manage/service-management-home-repository.ts`
- `apps/web/app/s/[serviceSlug]/manage/service-management-home-view.tsx`
- `apps/web/app/s/[serviceSlug]/manage/service-management-view-model.ts`
- `apps/web/src/services/service-management-navigation.ts`
- `apps/web/src/services/service-launch-readiness.ts`
- `apps/web/app/(app)/organizations/[workspaceId]/manage/organization-manage-view.tsx`
- 対象pageの包括catch、既存Service context/エラー判別。

再利用：`buildServiceOperationActions`、`buildServiceLaunchReadiness`、`hasAiTrainingServiceProgram`、既存Feature/Program投影、OEM一括作成。まず不必要な集計を呼ばない。残る補助集計の失敗を局所化する場合は、allSettledで全エラーを無条件許容せず、認可済みscopeの補助結果だけを状態付きで扱う。

受け入れ：研修専用サービスにSNSの未達警告を必須表示しない、適用外機能のqueryを呼ばない、認可取得失敗は保護される、補助集計失敗時も許可済みの主要設定へ到達できる。

### PR-2A 通常保存

変更候補：

- `apps/web/app/(app)/organizations/[workspaceId]/manage/organization-manage-view.tsx`
- 同`organization-manage-actions.ts`のprofileSchema/saveProfile
- `apps/web/app/s/[serviceSlug]/manage/settings/service-settings-editor.tsx`
- `apps/web/src/http/service-settings.ts`
- `apps/web/app/s/[serviceSlug]/manage/weekly-report/weekly-report-delivery-editor.tsx`
- `apps/web/src/http/service-weekly-report-delivery.ts`

再利用：既存Foundation.saveとServiceConfigurationAudit。新しい監査tableや汎用承認middlewareを作らない。通常操作だけを自動reasonへ置き換え、旧clientが送るreasonは互換性を確認して受理する。重要操作に流用されるApplication層のreason必須制約を一括削除しない。

受け入れ：通常の文言・時刻・一般プロフィール更新は保存1回、理由欄0。自動記録にactor/対象/差分が残り、既存clientでも保存できる。料金・権限・秘密情報の経路は影響を受けない。

### PR-2B マナベルの学習設計

変更候補：

- `apps/web/app/s/[serviceSlug]/manage/programs/learning-definition-review/page.tsx`
- 同`card.tsx`、`client.ts`
- `apps/web/src/http/learning-definition-approval-admin.ts`
- `packages/database/src/learning-definition-approval-admin.ts`
- `apps/web/app/s/[serviceSlug]/manage/programs/personal-learning-preparation/pilot-operations-card.tsx`の証跡入力は独立分割も可。
- 既存ADR/実装報告の改訂は本実装PRで行う。今回の監査PRでは旧方針を消さない。

再利用：既存GET/POST、definitionの不変版・revision/reviewDigest、ProgramAuditLog、operationId、既存Repository transaction。GETの来歴を追加し、POSTはサーバーで対象を再照合して監査を作る。来歴を取得できないのに偽のSHAを入れて通さない。

受け入れ：SHA/証跡キー手入力0、内容承認1回、取得自動、通常成功後に再取得ボタンを押す必要0。未知結果は同一IDで回復し、古い対象版・別Service・権限失効は拒否。承認してもPilot開始/AI/通知/参加者登録は実行されない。

### PR-2C LINEと外部作用

変更候補：

- `apps/web/app/(app)/admin/groups/[groupId]/line/group-line-editor.tsx`
- `apps/web/app/s/[serviceSlug]/manage/line/{page,service-line-broadcast-editor}.tsx`
- `apps/web/src/http/group-line-configurations.ts`
- `apps/web/src/http/service-line-broadcasts.ts`
- `apps/web/src/http/service-line-delivery-retries.ts`

再利用：GroupLineEditor、接続テストAdapter、既存Audience preview、送信Job/Retry Repository。標準menuのconfirm＋promptを、対象と差分を見せる確認へ置換する。接続確認結果と次の操作を同じ画面に出し、資格情報の平文再表示はしない。

受け入れ：一斉配信/公開の最終確認1回、対象変更時の再照合、二重送信0。秘密情報更新は専用確認を維持。別Serviceへの送信/接続設定変更ができない。認可APIがadmin経路のままの場合も同じ権限で成立するかを検証する。

### PR-3A 設定の制限scope

変更候補：

- `apps/web/src/http/member-usage-read-limit.ts`
- `apps/web/src/http/managed-feature-policy.ts`と同singletonを使用するHTTP
- `apps/web/src/services/public-service.ts`
- `packages/database/src/service-foundation-save.ts`
- `packages/database/src/managed-feature-policy.ts`
- 承認済みpolicy初期化を追加する場合の既存`service-foundation-create.ts`/`service-create.ts`/OEM作成経路。

再利用：既存limiter、Feature policy configのnamespace、scope認可とrevision。小さな既存実装の適用範囲を直し、全管理操作のための新しい権限層を設けない。

受け入れ：同一管理者の異なるServiceの正当な保存/読取が互いにin-flight拒否されない。負荷上限を超えた同一対象操作は依然429。API/Repositoryのrole不一致fixtureで、許可内の更新は成功し、越権は拒否。本部未承認のFeatureは付与しない。

### PR-3B 業務policy

変更候補：

- `packages/capability-social/src/recommendation-policy.ts`
- `apps/web/app/s/[serviceSlug]/manage/recommendations/policy-editor.tsx`
- `apps/web/src/services/hassy-roadmap-settings.ts`
- `apps/web/app/s/[serviceSlug]/manage/roadmap/policy-editor.tsx`
- `apps/web/src/services/business-daily-service-settings.ts`と設定UI/HTTPの対応部分。
- `apps/web/app/(app)/admin/oem-onboarding/page.tsx`の承認済みテンプレート初期値。
- `onboarding/service-onboarding-form.tsx`と`src/http/service-onboarding.ts`の重複回答投影。

このPRで先に確定すること：提案抑制の許容日数、HQ/OEMの変更範囲、既存の事業profile有効サービスの互換挙動、契約上限の出所。答えが未確定なら数値を勝手に変更しない。

受け入れ：境界値・旧snapshot・既存設定の回帰。設定の保存だけで配信、画像/動画の課金実行、紹介報酬を開始しない。別Serviceの情報を初期回答へ混ぜない。

### PR-4 監査と障害回復

変更候補：

- `packages/database/src/service-foundation-save.ts`
- `packages/database/src/managed-feature-policy.ts`
- `packages/database/src/admin-audit-log.ts`と既存audit表示投影。
- 保持の要件が確認できた対象だけ`support-case-retention.ts`、`improvement-feedback-retention.ts`、`training-retention-*`の既存経路。
- 失敗分類と再送条件が確認できた対象だけ既存LINE/Jobの実装。

先に測ること：通常時刻変更1回での更新table/監査件数、snapshotの内容と個人/秘密情報の有無、同一変更の重複、log障害でrollbackする業務の種類。モデル数だけで重複と判断しない。

受け入れ：無変更送信で業務上不要な更新を増やさない、重要操作の更新と監査は両方成立または両方rollback、過去履歴/CSV互換を維持。非重要logの非同期化は既存Jobで回復できる具体例がある場合だけ。新table/outboxや監査の無条件無効化は対象外。

## 4. テスト計画

| 観点     | 正常系                                           | 必須の否定・障害系                                                                                        |
| -------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 通常設定 | 文言/時刻1回保存、旧payload、新payload、自動理由 | 別Service、失効、無効値、同時更新、通信結果不明、保存後読取失敗                                           |
| 学習設計 | 自動取得の同じ版を1回承認、現在状態を更新        | 古いrevision/digest、別actor/Service、来歴未確定、同一ID同内容/別内容再送、監査失敗、AI/STARTが呼ばれない |
| OEM      | 既存一括作成、許可内の連絡先/Service更新         | OWNER/ADMINと旧roleの組み合わせ、契約超過、停止、一般会員、他団体                                         |
| 制限     | 正当な複数Service/目的の操作が競合しない         | 同一対象の過負荷、予算超過、原価UNKNOWN、未承認Feature、期限外                                            |
| 配信     | 対象preview/確認、既存Jobへ一度enqueue           | 人数変更、宛先/本文変更、二重送信、既送信、結果不明、Provider一時/恒久障害                                |
| 監査     | 正しいscope、actor、差分、既存export             | tx内の監査失敗、重複要求、他tenant閲覧、秘密値の混入、既存ログ読取互換                                    |
| UI/端末  | 390×844/1280×800で主要task、320pxの最低表示      | 長い名前、キーボード、focus、保存中連打、error/statusの読み上げ、横幅overflow                             |

既存のテスト入口：

- Web：`service-management-{navigation,view-model,role-authorization}.test.ts`、`service-launch-readiness.test.ts`、`member-usage-read-limit.test.ts`。
- Web：`learning-definition-approval-admin.test.ts`、既存learning-definition-review UI/pageテスト、既存learning-ui harness。
- Web：`service-settings-update-schema.test.ts`、`business-daily-service-settings.test.ts`、`hassy-roadmap-settings.test.ts`、`social-recommendation-policy-http.test.ts`。
- Database：`learning-definition-approval-admin.test.ts`、`production-gate-evidence.test.ts`、`support-case-retention.test.ts`、既存DB integration fixture。
- Capability Social：`recommendation-policy.test.ts`。

実装時は既存テストを更新し、削除する必須入力の期待値を単に緩めるだけでなく、代わりの来歴・自動記録・認可の保証を追加する。小さな文言変更のための実装追従テストを大量追加しない。

## 5. 完了判定と比較記録

各PRで同じtask・同じ初期状態の改修前後を記録する。生の利用者情報や新しい個人追跡logは保存しない。

| 指標         | 目標                    | 判定の方法                                                    |
| ------------ | ----------------------- | ------------------------------------------------------------- |
| 通常保存     | 原則1回                 | 正常系のmutation送信/確定回数を記録                           |
| 主要分類     | 4〜5、空分類非表示      | 本部/Service/OEMのrole・機能別fixture                         |
| 技術入力     | 日常業務でSHA/証跡キー0 | フォームとAPI契約の双方を確認                                 |
| 承認         | 同じ内容の追加承認0     | 学習内容/費用/公開の独立したscopeを確認                       |
| 手動状態確認 | 通常成功後0             | receipt後の現在取得、競合/失敗時の表示                        |
| 画面遷移     | 主要taskで減少          | 静的下限ではなく同条件のPC/スマホ操作を比較                   |
| 安全性       | 既存保証を維持          | tenant、本人、金銭、冪等性、重要監査の負例                    |
| 回帰         | 対象と標準検証が成功    | format/typecheck/lint/test/build、必要なdisposable DB・UI検証 |

## 6. 互換性・ロールバック・公開

- 既存URL/APIは維持し、理由や技術fieldを変える場合は旧clientとの移行を先に設計する。旧clientの空/欠落値で既存設定を初期化しない。
- 段階的に表示整理→入力/契約→policy→書込最適化を進める。DB変更が必要なら本作業の範囲を拡張せず、理由・代替・移行・復旧を別レビューする。
- 旧履歴・費用・承認・同意・snapshotを消さない。rollbackは既存データとの互換性を確認したコードへ戻す。古いコードへ戻して新しい金銭/監査形式を読めなくしない。
- migration、deployment、本番Flag・予算・送信設定は、この指示に基づいて実行しない。将来の公開承認は差分と対象環境を示して別に扱う。

## 7. 今回の調査成果の検証

コード変更なし。Webの既存10ファイル89テストが成功した。対象は管理navigation/view-model/readiness、読取制限、Hassy目標、企業向け設定、管理ロール、学習承認API、設定schema、SNS支援policy API。合成テストであり、本番運用・実使用頻度・クリック数の測定ではない。

4文書の整形、引用ファイル/route在庫、所見IDの対応、差分の空白と変更範囲を確認する。全体build、DB integration、実PC/スマホ操作は、この文書だけの段階では実施済みとしない。

## 8. 次段階へ進める条件

本4文書をレビューし、通常/重要/重大の分類と、PR-1/PR-2Aの具体的な範囲を確定する。契約上限・許容抑制日数・本番Flagの廃止の判断はその後の対象PRまで保留できる。最初から全ルールの合意を待って低リスクの導線整理まで止めない。

レビュー後はPR-1Aまたは未使用reasonだけのPR-2Aから着手できる。実装は独立ブランチ/小さいPRで提出し、承認と本番反映を混同しない。
