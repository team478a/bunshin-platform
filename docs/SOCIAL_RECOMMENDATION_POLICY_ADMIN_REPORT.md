# SNS支援提案の本部・OEM管理設定

2026-11-02 / 基点 main 4d332ca3（#1437）

## 1. 調査と今回の範囲

既存のSNS Barrier判定・Support・GroupFeaturePolicy.config・GroupFeatureAuditLog・Entitlement・管理メニューを確認した。設定用tableや新しい推薦エンジンを作らず、SNS支援の新規提案条件を編集できる機能単位を接続する。

今回の編集項目は、支援提案ルールの有効/停止、採用後未報告の判定件数（2〜100）、見送り後の抑制日数（30〜365）、新規提案対象の困りごと。観測窓は既存28日、他のBarrierルールの閾値は既存値のまま。成長ロードマップの達成条件編集は別作業であり、本PRで管理設定全体が完成したとは扱わない。

## 2. 変更ファイルと責務

| 責務                             | ファイル                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| SNS設定契約・上下限制約          | capability-social/src/recommendation-policy.ts                                                               |
| 認可・保存・監査・再送           | database/src/social-recommendation-policy.ts                                                                 |
| 通常の機能設定との整合           | database/src/group-feature-entitlement.ts                                                                    |
| 候補保存・本人表示/回答/支援開始 | social-activity-barrier-repository.ts、social-activity-barrier-confirmation-repository.ts                    |
| 設定API                          | Web/src/http/social-recommendation-policy.ts、既存service API配下のrecommendation-policy/route.ts            |
| 本部/OEM画面                     | /s/[serviceSlug]/manage/recommendationsのpage / editor / CSS、既存管理メニューと本部の機能詳細ページのリンク |
| 検証                             | policy純粋関数、API、既存SQL fixture、既存支援テスト、実コンポーネントのスマホharness                        |

共有ファイル: capability-social / databaseの公開indexへexportを追記。既存管理メニュー、e2e main/configへ項目を追加。認証戻り先の既存allowlistに管理画面の正規パスだけを追加し、クエリ・別名・外部URL拒否を維持した。DB schema・migration・Cron・環境変数は変更しない。通常の機能設定の保存処理は、専用namespaceの保護と同じGroupロックが必要なため変更した。

## 3. 設計判断

[ADR](adr/SOCIAL_RECOMMENDATION_POLICY_ADMIN_ADR.md)を実装前に記録した。

### 共通・SNS・ハッシー

既存のFeature Policyと監査ログを共通資産として使う。SNSの判定件数・困りごと・抑制の意味はSOCIALに置く。Hassyの5段階、紹介人数特典、MUSE、外部Providerを共通Applicationへ追加しない。設定scopeはWorkspace / Serviceで、会員やBunshinの情報を設定値へ混ぜない。

### 本部とOEM

ACTIVEなSUPER_ADMINがサービス単位の本部条件を保存する。ACTIVE SERVICE_OWNER / SERVICE_ADMINは、自サービスの本部設定が保存済みの場合だけ、件数/日数の増加・カテゴリの部分集合・停止を保存できる。本部が後から厳しくした場合も、実効値はmax / AND / 共通集合で制約する。権限・期間・原価上限の付与や緩和はしない。

未設定時は従来の2件・30日・全カテゴリを維持する。機能設定自体がない状態で本部条件を作成した場合、GroupFeaturePolicyはDISABLEDで作成し、自動的に利用権を与えない。本部用入口は既存のSOCIAL.ACTIVITY_SUPPORT機能詳細ページ、OEM用入口は既存サービス管理メニューに追加した。

### 最小保存・競合・監査

SOCIAL.ACTIVITY_SUPPORT.config._managedPolicies.socialRecommendationPolicyに版とrevision、本部/サービス条件、最後の要求receiptだけを保存する。他のconfig値は専用設定保存で保持する。

Group行ロック後に現在の管理権限を確認し、expectedRevisionで競合を拒否する。同じcommandId・正規化した同じ内容・同じactor/理由の再送だけを成功とする。古い要求が別の変更後に届いた場合は競合として扱い、再適用しない。変更ごとに既存GroupFeatureAuditLogへ前後値・理由・実行者を追記し、再送で監査ログを増やさない。

通常のFeature設定更新もGroupロックを取り、共通の保護領域_managedPoliciesを保持する。共通処理はSNS実装に依存せず、SNSの保存Adapterが共通Groupロックと保護領域を利用する。通常経路からのnamespace注入を拒否し、専用の本部権限を迂回させない。機能設定更新との同時実行で、本部条件が消失することを防ぐ。

### 判定と既存履歴

候補保存時と本人の質問表示/回答時に現在条件を確認する。設定前から保存されていた未回答Caseも、現在の件数やカテゴリで再確認する。設定版は新しいEvidenceに記録し、既存のEvidenceを上書きしない。

提供した支援の内容と抑制日数は既存Intervention snapshotに固定する。後の設定変更で確定特典・Credit・既存支援内容・抑制期間を変更しない。「当てはまらない」回答も保存時の抑制日数を使う。新規提案ルールの停止では質問・新しい回答/開始を止め、開始済み支援の表示・完了・見送りを維持する。未開始支援は停止中に表示しない。機能自体の停止や会員の権限失効は、既存Entitlement境界で別途適用する。

不正な保存設定は新規提案を停止し、ログへ記録する。開始済み支援の完了操作は維持する。破損値の自動消去・推測復旧はしない。管理画面は権限拒否で古い設定を消し、競合時は明示的な最新取得を要求する。正常な保存応答でも版と条件が一致しなければ保存済みと表示しない。

## 4. 検証

合成データだけを使用。ローカルで設定境界12件、既存支援6件、設定APIを含むWeb15件、スマホ3件、関連SQL14件と全356 SQL結合テストを成功確認。その後追加した破損設定の安全な停止・完了継続のケースを含め、最終SQL/CI結果はPR本文に記録する。

主なSQL: 同時更新、同一要求再送、payload衝突、旧revision、本部設定前のOEM変更拒否、緩和拒否、本部変更後の制約、一般会員/他OEM/失効の拒否、既存Evidenceの再照合、候補保存への接続、停止後の完了/見送り、抑制日数の固定、通常の機能設定更新との並行処理とnamespace保護。

ローカルlintの全変更一括実行はメモリ上限に達したため、検査ルールを変えずパッケージ別に再実行する。format / typecheck / lint / test / 全画面 / buildの最終結果はPR本文とCIへ記録する。

## 5. 未解決・本番状況

実装・合成データ検証と本番反映は別。本番DB、設定保存、Flag、有効化、デプロイは未実施。追加migrationはない。

成長ロードマップの定義/達成条件編集、他の提案ルール閾値、未回答提案の表示間隔、画像多用・複数SNS・人数特典の候補追加、紹介3/5/10人の期間体験、MUSE/外部接続は未実装。現在の無償支援以外を設定値だけで推奨・実行しない。

## 6. 次へ進む条件

本PRのレビューと最終CI通過後、ハッシー固有の成長条件編集を既存profile選択・共通評価器の境界を維持して接続する。人数特典はcatalog・期間・本部上限を確定してから既存Entitlementへ接続する。
