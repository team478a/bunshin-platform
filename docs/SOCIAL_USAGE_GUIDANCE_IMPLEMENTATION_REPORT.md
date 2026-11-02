# SNS利用実績に応じた案内と未回答質問の抑制

## 1. 調査した内容

基準mainは`1bbb6cf0`（PR #1439）。AGENTS、仕様正本、Architecture Principles、Roadmap、Decision Log、既存の責務分離・提案設定管理のADR/報告、各packageの公開入口を確認した。

| 既存機能                                | 再利用・不足と対応                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 障壁の推測・本人確認・無償支援          | 質問/回答/採用/完了/見送りを再利用。従来の障壁推測を優先し、利用案内の根拠と支援キーを区別する              |
| Case/Evidence/Confirmation/Intervention | 同等の提案台帳を作らず再利用。表示済み根拠の照合を追加。過去の回答・提供済み内容は維持する                  |
| GroupFeaturePolicy / AuditLog           | 保護済みnamespaceと共通ManagedFeaturePolicy保存を再利用。本部/OEM・revision・同時更新・再送・理由監査を維持 |
| 画像生成成功記録                        | 成功requestを数える。1依頼の複数枚を重複計上しない                                                          |
| SNS利用記録                             | 採用/コピー/投稿報告があるSNSの種類を集計。登録プロフィール数だけでは利用としない                           |
| 有効紹介                                | 既存readConfirmedReferralCountを再利用。途中の登録成果と審査・確定済み紹介を分離                            |
| 表示・回答抑制                          | 支援閲覧の既存firstDisplayedAtを維持。未回答質問の表示後は既存nextEligibleAtで抑制する                      |
| 障壁改善/OEM/LINE                       | 利用案内を障壁の診断や有料支援へ流さず、対象から除外する                                                    |

実装済みと本番反映済みは区別する。本作業は合成データによる検証で、本番の稼働・利用効果は未確認。

## 2. 変更したファイル

- capability-social `usage-guidance.ts`: SNS共通の条件、独立設定、無料ガイド3種類、判定境界。
- `activity-barrier-projection.ts` / `activity-barrier-support.ts`: 既存推測を優先する候補選択、中立の質問、本人の選択によるガイド提供。新しい支援判断はv4、利用根拠はsocial-usage-guidance-v1。
- database `social-usage-guidance-policy.ts` / `social-activity-barrier-repository.ts`: 共通保存Port実装と既存原本の集計、既存候補保存への接続。
- `social-activity-barrier-confirmation-repository.ts`: 現在条件・所有権・表示根拠の再確認、質問表示POST、再表示の抑制、完了済み案内の再提案防止。
- Web `/manage/recommendations`に追加設定、`/api/services/[serviceSlug]/usage-guidance-policy`、本人用`activity-barrier/question-exposure`を追加。共通HTTP境界・フォーム制御を再利用。
- 既存本人カードとService詳細の導線: 画像作成回数、活動・紹介、手動投稿準備。表示後だけ記録する。
- 障壁集計、改善Adapter、OEM候補、障壁解決、LINE候補/配送時照合に利用案内の除外を追加。
- 関連unit/HTTP/SQL/390pxブラウザ検証。

共有ファイルはcapability-socialとdatabaseの公開入口へexportを追加。ブラウザharnessの入口・設定へ追加した。DB schema、migration、Cron、環境変数、Feature Flagは追加・変更していない。

## 3. 主要な設計判断

[ADR](adr/SOCIAL_USAGE_GUIDANCE_ADR.md)を参照。

### 条件と提案内容

初期値は28日内の画像生成成功5request、実際に操作したSNS2種類、累計の確定済み紹介3件。画像/SNSの期間は既存SchedulerのJST基準28日窓を利用する。画像は成功状態かつ期間内に生成mediaがあるrequest数であり、請求回数やページ枚数ではない。SNSは本人の採用・コピー・投稿完了報告を対象とし、投稿完了報告をSNSでの公開証明と扱わない。SNSプロフィール由来とPostRecord由来の媒体を重複排除する。

紹介は「直近に増えた」と断定せず、確定人数の閾値を満たす場合に確認ガイドを案内する。資格判定が未設定/不明、紹介機能が停止、現在の確定人数が条件未満なら表示/新しい回答を受け付けない。被紹介者の情報は取得・表示しない。

画像枠・複数媒体の準備・紹介状況の確認だけを案内する。自動化機能やSNS公開、OAuth接続、クレジット/Entitlement付与は実行しない。AI説明生成も呼ばず、追加AI原価は0。

### 保存と責務

新しい案内は独自evidenceCode/supportKey/selection.mode=USAGE_GUIDANCEで識別する。CaseのMEDIA/EFFORT/EFFECTは既存のルーティングを再利用する。本人が案内を希望しても「SNSの障壁が確定した」という集計に加えず、障壁解決・改善率・OEM支援候補から除外する。表示/詳細/採否/完了の原本は既存Interventionに残る。案内の効果を新しい改善率として推測表示しない。

未回答/対応中の従来障壁を利用案内で上書きしない。完了した同じガイドは同一scopeで再提案しない。案内完了はCaseをRESOLVEDにするが、障壁改善の証明には用いない。新しい障壁が生じた場合の既存処理は維持する。

### 管理と抑制

独立namespace `config._managedPolicies.socialUsageGuidancePolicy`を利用する。既存SNS提案設定v1の形式と冪等fingerprintを変更しない。初回の本部設定はSUPER_ADMIN、OEMは同じWorkspace/ServiceのACTIVEなOwner/Adminで、本部基準以上の閾値・間隔のみ許可する。本部停止を解除できない。既存カテゴリ・機能権限も適用する。

未回答質問は既定7日、設定可能範囲2–90日。画像閾値5–1000、SNS2–10種類、紹介3–1000件。質問が実際に見えた後、同一origin・本人認証・所有権・機能権限・現在設定を確認したPOSTで既存Case.nextEligibleAtを進める。GETや閉じたdrawerでは保存しない。抑制期間中の再送では期限を延ばさない。抑制後も、表示済みの同じ根拠への回答は受け付ける。

新しい質問はruleVersion・根拠code・観測窓・対象Caseで構成した照合キーを返し、表示/回答時に再照合する。これは認可tokenではない。認可は別途必須であり、旧障壁のキーなしクライアントは維持する一方、新しい利用案内は照合キーなしで確定しない。

利用案内の根拠は観測窓末尾から48時間以内のみ表示/回答可能とし、Schedulerが止まった古い候補を繰り返さない。既存の見送り日数と採用済みsnapshotは変更しない。設定停止では未開始ガイドの開始を止め、開始済みの完了・見送りを維持する。停止中の未開始ガイドで、従来の障壁支援を塞がない。

追加案内はLINE自動通知の対象外。既存の障壁通知も、配送前に未回答抑制と最新根拠を再確認する。

## 4. 実行した検証

- SNS全398テスト成功（追加の境界ケースを含む最終結果はCI参照）。
- 関連DB unit20件、関連Web/HTTP38件成功。追加後のHTTP/LINE対象32件成功。
- 使い捨てPostgreSQL 16へ既存全migrationを適用。最初の全367 SQL成功。その後の根拠照合・停止中の既存支援継続を含む関連37件成功（最終全件はCI参照）。
- 新規5件＋既存5件のスマートフォン390pxブラウザテスト成功。質問が見えるまで記録しないこと、案内から本人操作の導線、OEM条件保存を確認。スクリーンショットを目視し、横はみ出しなしを確認した。
- DB/Web/UIの型検査、依存境界検査を実施。標準のformat/typecheck/lint/test/全UI/build/databaseの最終HEAD結果はPR本文へ記録する。

## 5. 未解決事項と本番状況

本番DB、実ユーザー、Flag、設定保存、外部送信、デプロイは未操作。実利用による負担・継続率・原価改善は未検証。新ガイドの効果専用の集計は、指標を定義してから既存履歴を読み取る後続作業とする。

画像生成/自動化機能自体の解放、紹介3/5/10件による体験の付与、MUSE接続PoC、100社Pilotは今回の対象外。ハッシー固有の段階・特典や他サービスのブランドをSNS共通ルールへ追加していない。

## 6. 次の作業へ進む条件

最新mainとの整合、標準CI verify/database、既存SNS/紹介/支援/LINEの回帰を確認し、レビュー・マージする。本番公開は既存readinessと別の反映確認を要する。次の候補は、特典カタログ・期間・本部上限を確定した上で既存Entitlementへ接続すること、または新ガイドの効果指標を追加すること。
