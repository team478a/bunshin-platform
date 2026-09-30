# 非公開サービスの動画配信参加者操作 修正報告

日付: 2026-09-30。基準: main `a44ef8a5`（PR #1016マージ後）。参加者API監査の第6作業単位。本番反映とは区別する。

## 1. 調査した内容

- 閲覧/採用/辞退/投稿完了とダウンロードは本人の参加者操作だが公開限定Service Resolverを使用していた。
- POSTEDはDeliveryの期限確認前に元Missionを投稿済みにし、本人Projectの取得失敗を元Missionなし手動動画と同じに扱っていた。
- ダウンロードはRender取得/署名URL準備前に履歴を記録し、失敗も履歴に残った。全例外を404へ変換し、Storage障害と所有拒否を区別できなかった。
- 既存動画配信/LINE添付/通知再試行報告、Application/DB受信者・状態条件、Storage正本キー、既存投稿テストを確認した。LINE通知の送信・再試行は今回の対象ではない。

## 2. 変更したファイル

- `apps/web/src/http/service-video-delivery-member.ts`: Member認可、不正IDの400、利用可能状態/本人Project・Render・Storage Key確認、履歴順序、APIエラーとCache/Referrer Policy。
- `apps/web/test/service-video-delivery-member-http.test.ts`: 認証/Service/本人/状態/元Mission/Storage/失敗/履歴順序の実行検証。実Application/SOCIAL Use Caseを使い、DB/Storage/認証/Resolverをmock。
- 既存投稿テストのResolver mockとHTTP静的境界を更新。
- D-153、Roadmap、機能不足監査、この報告。

## 3. 主要な設計判断

- 認証後にMember Serviceを解決し利用期間・ACTIVE Workspace/Group/本人所属を維持。リクエストBodyのWorkspace/Group/所有者を利用しない。既存Repositoryの本人受信者・状態検証を維持する。
- 投稿完了前にDeliveryの取消/期限を確認し、本人の未取消Projectがなければ拒否する。元Missionなしの手動動画は維持する。採用必須、POSTED再送、SOCIAL能力、元Mission本人所有、紹介Milestone/再送キーを維持する。
- ダウンロードは採用/投稿済みかつ利用可能なDeliveryと同じ本人Project/RenderのSUCCEEDED・未削除・期限内行を取得し、正本形式 `workspace/user/render.mp4` と完全一致するキーだけ署名する。
- URL準備後にRepositoryでDOWNLOADEDを再検証/記録し、拒否時はLocationを返さない。準備失敗を履歴にしない。履歴は引渡し準備であり端末保存完了の確認ではない。
- ダウンロードの全例外404を止め、既存APIエラー変換で401/400/403/404/500等を区別する。本人向けJSONとredirectはprivate no-store、署名URL redirectはno-referrerを付ける。
- 公開入口・専用LINE認証/通知・Snapshot/再試行、DB schema/migration、設定、本番データ、実Storage署名/AI/LINEは変更しない。

## 4. 実行した検証

- 関連Web3ファイル73テスト成功。公開Resolver不使用、各操作の匿名/異Origin/不正ID/所属拒否/Service切替、投稿状態/元Mission/能力、署名キー・準備失敗・最終拒否時URL非返却を確認。
- Web型検査、最終変更lint/format、アーキテクチャ境界と否定テスト10件、`git diff --check`成功。Project条件は既存CANCELLED状態へ合わせて型検査を再実行した。全Webと全package/実DB CIの結果はPRと作業報告へ記録する。

## 5. 未解決事項

- Program目標の管理者/参加者fallbackと画面の公開判定は別監査。全非公開Service対応完了とは報告しない。
- 新しい排他・跨る書込の原子性は追加しない。元Mission記録後にDelivery更新が失敗する場合は既存再送キーとRepository再確認で回復する。署名準備と最終記録の間に拒否される場合、URLは内部で発行済みだが利用者には返さない。
- 発行済み署名URLは既存5分期限のまま。後からの即時失効、実端末保存の確認は追加しない。Render状態/期限の新たな排他保証はない。
- 本番反映・非公開Serviceの実スマートフォン確認は別作業。

## 6. 次へ進める条件

- 本PRのCI成功・レビュー・マージを確認する。
- 残るAPI/画面の公開/参加者/管理者の意図を独立監査する。本番リリース・設定変更は別途扱う。
