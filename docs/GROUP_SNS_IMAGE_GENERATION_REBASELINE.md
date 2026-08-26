# グループ限定SNS画像生成 Rebaseline

## 1. 目的

Daily Missionの`IMAGE`投稿から、Instagramへ手動投稿できる1080×1350pxの文字入り完成画像を生成する。一般ユーザーへ公開せず、既存のグループ運用基盤を利用した特定グループ限定の本番パイロットとして検証する。

成功条件は画像生成機能の提供ではなく、参加者が安全な完成画像を採用し、実際の投稿行動へ進むことである。SNS自動投稿、動画生成、自由編集、成果・報酬管理は含めない。

## 2. 現行方針との関係

- FREE SOCIAL MVPの標準動作は、画像制作指示と文字案までとし、画像本体を生成しない。
- Phase 10の一般向け画像・動画Providerは、100人検証後に再評価する方針を維持する。
- 本PhaseはPhase 7-Gのグループ先行テストに含める限定実験であり、一般公開の前倒しではない。
- 本番環境を使用するが、全体機能は既定で停止し、明示的に許可したグループと参加者だけ利用できる。
- Stagingは新設せず、本番の限定公開、緊急停止、追記型確認記録で保護する。

## 3. 流用する実装

- `SocialPreferredFormat.IMAGE`
- `MissionContent.imageInstruction` / `overlayText`
- Daily Mission、Mission Decision / Activity、PostRecord / Feedback
- Group、Membership、Invitation、Consent、Campaign Participation
- Product Pack Version、Rule、Asset、Assignment
- Generation Context Snapshot、広告安全Gate、外部成果計測URL連携
- Job / Worker、AI Provider設定、暗号化、接続確認、緊急停止
- `AiUsageEvent`、日次・月次予算、管理画面の運用通知
- LINE通知と署名付きDaily Mission導線
- Supabase Storage接続基盤

投稿コンテンツ生成は画像制作指示までを担当し、画像本体は新しい画像生成Capabilityが担当する。OpenAI固有処理をSOCIAL Core、Domain、Applicationへ混ぜない。

## 4. パイロット利用条件

画像生成開始時とJob実行直前の両方で、サーバー側が次を検証する。

1. Production環境である。
2. Platform Adminが対象Groupをパイロットへ明示登録している。
3. Pilot、Group、Campaignが停止中でない。
4. Userが有効で、対象Groupの同意済みACTIVE Membershipを持つ。
5. Bunshinが本人Workspaceに属し、SOCIAL Capabilityを割り当て済みである。
6. Daily Missionが本人Bunshinに属し、形式が`IMAGE`である。
7. 商品投稿ではCampaign参加、Product Pack Assignment、公開Version、広告安全Gateが有効である。
8. Group、Workspace、Userの利用上限内である。

Group、Membership、同意、Campaign参加、商品割当のいずれかが失効した場合、新規生成と再生成を停止する。生成済み画像の閲覧・保存可否は本人データ保持方針に従い、企業管理者へ本文や画像を新たに開示しない。

## 5. 初期範囲

- Instagram縦型4:5、1080×1350px
- Daily Missionごとに採用中の完成画像は最大1件
- 生成履歴は上書きせず、テンプレート変更と素材再生成を別Request / Mediaとして保存
- 初期テンプレート5種類
  - `PERSON_HEADLINE`
  - `PROBLEM_CHECKLIST`
  - `THREE_POINTS`
  - `EMPATHY_QUOTE`
  - `CTA`
- OpenAI Image APIによる人物または背景素材
- Satori + `@resvg/resvg-js` + Sharpによる日本語文字・図形合成
- 非公開Supabase Storage、署名付き短期URL
- 非同期Job、進行状態、失敗理由の安全な日本語表示
- 採用、不採用、テンプレート変更、AI素材再生成、保存、投稿文コピー、投稿済み記録

Canva風編集、複数ページ、他の縦横比、動画、自動投稿、顔の同一性保証、決済は実装しない。

## 6. 画像生成方式

標準方式は、AIが文字なしの人物・背景素材を生成し、管理されたReactテンプレートで日本語文字を合成するハイブリッド方式とする。

- AIへ任意HTMLを生成させない。
- AI出力へ日本語見出しの正確性を依存しない。
- 入力は検証済み`SocialImageLayout`だけとする。
- テンプレートごとに最大文字数、改行、最小文字サイズ、画像領域、文字領域、余白、セーフゾーンを固定する。
- はみ出し時は極端な縮小をせず、描画前の文章短縮処理へ戻す。
- AI素材は顔や主要被写体を保護して切り抜き、最終画像を1080×1350pxへ変換する。
- 元素材、完成画像、サムネイルを別objectとして保持する。

画像ProviderはPort / Adapter方式とし、初期Adapterは`gpt-image-2`を候補とする。モデルaliasをDomain enumへ固定せず、管理設定と検証済み許可リストで切り替える。

## 7. データモデル候補

### Image Generation Pilot

対象Group、状態、開始・終了、日次・月次上限、参加者別月間上限、標準モデル・品質、緊急停止、変更理由、作成者・更新者を保持する。GroupごとのACTIVE Pilotは最大1件とする。

### Image Generation Profile

Workspace / Bunshinごとの色、雰囲気、人物方針、文字量、標準テンプレート、同意済み参考素材を保持する。Group所有の公式素材と本人所有の参考素材を同じ所有権として扱わない。

### Image Generation Request

既存指示書の項目に加え、`groupId`、`groupMembershipId`、`campaignId`、`productPackVersionId`、`generationContextSnapshotId`、`pilotEnrollmentId`を候補とする。将来の通常投稿を妨げないようGroup関連はnullableとするが、本パイロットでは必須検証する。

同一Missionの処理中RequestをDB制約とidempotency keyで重複防止する。Providerへ渡す値だけに依存せず、課金前に内部Requestの所有権と状態を確定する。

### Generated Media / Feedback

- 生成物は上書きせず、RequestごとにMediaを作る。
- 同一Missionで`ADOPTED`は最大1件とする。
- 採用変更はtransactionで旧Mediaと新Mediaを更新する。
- Feedbackは追記型履歴とし、現在判断はMedia statusから取得する。
- Group管理者向け集計に画像、投稿本文、個人Memory、Knowledge、自由記述Feedbackを含めない。

Prisma Schema、Migration、一意制約、状態遷移は専用PRで人間レビューする。本PRでは変更しない。

## 8. 人物・参考素材

- 本人画像の利用は目的、保存期間、生成Providerへの送信を明示し、個別同意を必須とする。
- `Bunshin.facePolicy`と矛盾する人物生成を行わず、二重の顔出し方針を作らない。
- 同意取消後は新規生成に利用せず、保持期限と退会削除処理へ接続する。
- 他のUser、Bunshin、Workspace、Groupの参考素材を利用しない。
- Group公式素材は公開中Product Pack VersionとCampaignの許可範囲だけ利用する。
- 本人画像、Base64、署名URLを通常ログ、監査ログ、Providerエラーへ保存しない。

## 9. Storageと削除

- 非公開bucketを使用し、Workspace権限確認後だけ短期署名URLを発行する。
- object keyはサーバー生成IDから組み立て、ユーザー入力を含めない。
- MIME、byte数、画像寸法、content hashを検証する。
- 失敗途中のobjectは24時間以内、不採用画像は原則30日後に削除する。
- 採用画像の保持期間はパイロット開始前に確定する。
- DBの論理削除とStorage実体削除をJobで分離し、失敗を再試行・運用通知できるようにする。
- アカウント削除、Group退出、同意取消の各保持方針を混同しない。

## 10. 原価と利用制限

- 文章生成と画像生成のUsageを分ける。
- User、Workspace、Group、Pilot単位で成功、失敗、システム再試行、ユーザー再生成、採用、原価を記録する。
- Provider / model / quality / size / latency / request IDを秘密情報なしで記録する。
- システム失敗は利用者の再生成回数へ含めない。
- 課金が発生したProvider失敗は実原価へ含めるが、利用者Allowanceを消費しない。
- 上限到達、安全BLOCK、不正入力は自動再試行しない。
- 管理画面からGroup全体、参加者別、日次・月次上限と緊急停止を操作できる設計とする。
- 「1採用画像20円以内」は固定仕様ではなく、実測するGo / No-Go指標とする。

## 11. 管理者の可視範囲

Platform AdminはProvider状態、全体原価、エラー分類、Pilot状態、緊急停止、Isolation監査を確認できる。

Group管理者は自Groupについて、参加人数、生成数、成功率、採用率、再生成率、投稿済み率、集計原価、上限、設定漏れを確認できる。ただし次は閲覧できない。

- 個人Memory / Knowledge / Personalityの非公開内容
- 通常投稿とグループ外Daily Mission
- 投稿本文、生成Prompt、参考人物画像、完成画像の一括閲覧
- 他Group、他Workspace、他参加者のデータ
- Provider API Key、raw response、署名URL

商品投稿の画像確認が法務監査上必要な場合は、参加前同意、対象項目、保持期間、閲覧者、監査理由を別Phaseで確定する。本パイロットの集計権限から暗黙に許可しない。

## 12. LINEと利用者UX

- LINEは「今日の投稿画像を作れます」という安全な案内と署名付きDaily Mission導線だけを送る。
- LINEボタンだけで画像生成を開始しない。
- 画面では「画像を作る」「画像を作っています」「この画像を使う」「デザインを変える」「写真を作り直す」「今回は使わない」「画像を保存」と表示する。
- Provider名、モデル、Prompt、レンダリング、内部エラーなどの専門用語を利用者へ表示しない。
- 画面を閉じてもJobが継続すること、ボタンを再度押す必要がないことを説明する。
- スマートフォンのSafari / Chromeで画像保存と投稿文コピーを確認する。

## 13. 50テーマ比較検証

実装前にすべてを一括実行せず、二段階で進める。

### Pilot 0: 10テーマ

Provider接続、原価、出力サイズ、人物の自然さ、文字合成、処理時間、評価票を確認する。異常な費用、重大な安全問題、文字誤り、Isolation問題があれば停止する。

実行手順、入力CSV、評価CSV、停止条件は`docs/GROUP_IMAGE_PILOT_VALIDATION_PLAN.md`を正本とする。

### Pilot 1: 50テーマ

指示書の4方式を比較し、生成成功率、初回採用率、再生成率、文字正確性、人物自然さ、Instagram視認性、平均時間、1回原価、1採用原価を記録する。評価者、テーマ、方式の割当、評価順を固定し、API Key、Prompt全文、人物画像を評価資料へ含めない。

50テーマの実行には、検証予算、同意済み素材、評価担当者、評価期間の人間承認を必須とする。

## 14. Go / No-Go

限定パイロット開始条件:

- 対象Group、参加者、商品またはCampaignを確定
- OpenAI画像モデルの利用権限・接続・予算を確認
- Storage bucket、保持・削除、退会処理を確認
- Group / Workspace / Bunshin / Membership Isolation自動テスト成功
- 全体・Group・参加者上限と緊急停止を確認
- Production対象commitでスマートフォンE2E成功
- 追記型Production Gateへ確認者・日時・結果を保存

一般ユーザーには公開しない。Groupパイロット継続のGo基準は、生成成功率98%以上、初回採用率70%以上、再生成率30%以下、文字誤り0件、平均60秒以内目標、1採用20円以内目標、画像から投稿した割合50%以上、越境0件、重大障害0件とする。

1件でも越境、秘密漏えい、二重課金、重大な広告安全違反があれば即時No-Goとし、全体停止する。

## 15. 実装PR

1. Domain、状態遷移、Port、Isolation policy
2. Prisma Schema / Migration / rollback手順
3. テンプレートschema、フォントライセンス、5テンプレート
4. Satori / resvg / Sharp描画基盤
5. 非公開Storage、署名URL、Cleanup
6. OpenAI Image Adapter、エラー分類、Usage
7. Job / Worker、idempotency、再試行、上限
8. 利用者API、採否、再生成、download
9. 画像設定とDaily Mission UI
10. Group / Platform管理画面、緊急停止、運用通知
11. LINE導線
12. Isolation / Security / E2E / Production Gate

DB、外部API、描画、UIを巨大PRへまとめない。各PRのCI成功と人間レビュー後に次へ進む。

## 16. 停止条件と未確定事項

本書のレビュー完了まで、コード、Prisma Schema、Migration、Storage bucket、外部API呼び出しを変更しない。

実装開始前に人間が次を確定する。

- パイロット対象Group
- 対象人数、商品、Campaign、期間
- 10テーマ／50テーマの検証予算と評価者
- 採用画像の保持期間
- 本人参考画像を初期パイロットへ含めるか
- Group管理者による商品画像監査を含めるか
- 初期の日次・月次・参加者別上限
- `gpt-image-2`の利用可能qualityと実測原価
- 外部表示名を「ワタシワークス」で確定するか

承認後も最初はDomain / DB PRまでとし、Provider実呼び出しは予算・Storage・緊急停止の設計レビュー後に開始する。
