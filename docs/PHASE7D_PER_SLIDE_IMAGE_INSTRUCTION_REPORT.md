# Phase 7-D 画像指示の1枚ずつコピー 実装報告

## 目的

SNSサポートの画像指示を5ページ分に分け、利用者が画像AIの同じ会話へ1ページずつ貼り付けられるようにする。コピー記録と各運営レポートでは、コピー操作回数ではなくコピーされた投稿案の件数を数える。

## 調査した内容

- 画像指示は`daily-mission-content.tsx`で生成され、サービス別の案内は`service-daily-mission-image-guide.tsx`で表示されていた。
- `COPIED_IMAGE_INSTRUCTION`は既存のMissionActivityで記録でき、メタデータは本文を保存しない許可リスト方式だった。
- 週次レポートは既に`dailyMissionId`の重複を除いていたが、サービス運営画面と運用レポートCSVはコピー操作を行単位で数えていた。
- ポイント処理の対象は閲覧と投稿完了であり、画像指示のコピーはポイント付与対象ではない。

## 変更内容

- 5つの独立した画像指示を生成し、各指示へ4:5・1080×1350、人物・配色・書体・余白の統一、文字の可読性、日本語の正確な表示、ロゴ・透かし禁止を含めた。
- ページごとに役割・見出し・本文・場面を含め、2〜5枚目には前画像との人物・色・書体・レイアウトの継続指示を付けた。
- スライド情報が不足しても、固定の5ページ構成と投稿文・切り口を材料に5指示を補う。
- `serviceContentTerminologyPolicy`の適用後のテーマ、本文、場面、および参加案内ルールを各指示へ適用する。
- サービスの画像ガイドに5つのコピー操作、コピー済み表示、次にコピーするページの強調を追加。案内を「ChatGPTなどの画像AIで、同じ会話の中に1枚目から順番に貼り付けてください。1回貼り付けると1枚できます」に統一し、「次」と送る案内を削除した。まとめてコピーは慣れた方向けの小さな操作として残した。
- 画像指示Activityの任意メタデータとして`slideIndex` 0〜5を受け付ける。個別コピーは1〜5、まとめコピーは0。未指定の旧リクエストも受け付け、指示本文や投稿文はメタデータに保存しない。
- サービス運営画面、週次レポート、運用レポートCSVのコピー集計を投稿案単位に統一した。同じ投稿案で5ページをコピーしても1件となる。
- 実装変更を千ノ国メディア固有にせず、サービス別用語方針を参照する共通経路に適用した。

## 主要な設計判断

- 既存のMissionActivity JSON metadataを使い、新しいDB migrationは追加していない。
- コピーした本文・プロンプトは保存せず、`slideIndex`だけを記録する。
- 個別コピーの進捗表示は画面内の一時状態とし、Activityを投稿案単位で重複排除して集計する。
- コピー活動はポイント処理候補に含めないため、5ページをコピーしてもポイントは追加付与されない。従来どおり閲覧・投稿完了のみがポイント候補になる。
- 外部画像AIへの送信、画像生成、SNS投稿の自動化は行わない。

## 変更した主なファイル

- `apps/web/app/(app)/bunshins/[bunshinId]/daily-mission-content.tsx`
- `apps/web/app/s/[serviceSlug]/bunshins/[bunshinId]/service-daily-mission-image-guide.tsx`
- `apps/web/app/s/[serviceSlug]/bunshins/[bunshinId]/service-daily-mission-controller.ts`
- `apps/web/src/http/mission-engagement.ts`
- `packages/capability-social/src/mission-engagement.ts`
- `apps/web/app/s/[serviceSlug]/manage/service-management-home-repository.ts`
- `apps/web/src/http/service-operations-report-export.ts`
- `apps/web/src/services/weekly-progress-report-data.ts`

## 検証

- `daily-mission-ux.test.ts`：5指示、各指示の1枚限定と共通デザイン条件、2〜5枚目の継続指示、情報不足時の5指示生成、サービス別用語方針を確認。
- `mission-engagement.test.ts`および`packages/capability-social/test/mission-engagement.test.ts`：slideIndex 0〜5、旧形式（指定なし）、範囲外拒否、指示本文を含むメタデータ拒否を確認。
- `mission-activity-counts.test.ts`：同一投稿案で5ページをコピーしても1件と数えることを確認。
- `point-activity-processor.test.ts`：画像指示コピーがポイント候補に含まれないことを確認。
- `pnpm --filter web typecheck` と`pnpm --filter @bunshin/database typecheck`はローカルで成功。
- 対象Vitest（Web 27件、capability-social 6件、database 3件）は成功。

## 未解決事項

- GitHub ActionsのDraft PR上のCI結果は作成後に確認する。
- 本番環境への変更・デプロイ・フラグ変更は行っていない。

## 次へ進める条件

Draft PR上でレビューと必須CIが成功し、田中が内容を確認した後にマージ判断を行う。マージ後の本番反映は別途承認を得るまで行わない。
