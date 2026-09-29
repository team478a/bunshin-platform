# AI研修 受講者の終了状態表示 実装報告

## 調査

main `8a04feaf`（#997）を基準とした。受講詳細はCANCELLEDを404にし、COMPLETED/EXPIREDでもRuntime.currentを呼んでいた。RuntimeはACTIVEなProgram/公開版を必要とし、終了後のProgram停止で詳細も404になり得た。本人プログラム一覧は取消を除外し、終了研修ではExportだけを表示していた。

## 変更ファイル

- programs/[programEnrollmentId]/page.tsx: 本人のScope検証後、終了したAI研修をRuntimeより先に読み取り専用表示へ分岐。
- ai-training-ended-card.tsx: 終了/取消/期限終了、確定終了日時、運営への問い合わせ、課金/返金/データ復元とは別である旨を表示。
- programs/page.tsx: AI研修の取消を本人一覧に含め、状態確認の導線を追加。
- ai-training-ended-participant.test.tsx: 状態別表示、Active経路維持、所有境界、404、非AI取消、日時非推定、取消時権限維持を検証。
- D-136、ロードマップ、本報告。

## 設計判断

本人のACTIVEなService ParticipantだけをWorkspace/Group/User/Enrollmentで検証する。終了状態の案内は最低限のProgram名・状態・終了日時だけを読み、本文・評価・監査理由を取得しない。Runtime/課題生成/Job/回答/評価を呼ばない。再開操作や状態変更は追加しない。

COMPLETED/EXPIREDのToolkit/Export権限は既存どおり維持する。取消時に新しくそれらの権限を与えない。招待中、非AI研修の取消、他会員、所属失効は404を維持する。終了記録がなければ日時不明を明示し、EXPIREDで過去の予定終了日がある場合だけ既存ルールどおり補う。

## 検証

実際のPage関数をDB/Auth/Runtimeのテスト代替で実行し、返すHTMLと呼出内容を検証する。3終了状態でRuntime呼出ゼロ、Active経路、最小SELECT、所有Scope、欠落/失効/非AI/招待の拒否、日時非推定、閲覧権限・操作なしを確認。全体format/typecheck/lint/test/buildのCI結果はPRへ記録する。

## 未解決・次の条件

DB/Schema/Migration/API書込の変更なし。本番操作、通知、課金/返金、期限削除停止解除、データ復元を行わない。取消時のToolkit/Export閲覧は既存ポリシーのままで、権限拡張は別判断。終了後の成長詳細閲覧や所属自体が失効した場合のアクセスは対象外。人間レビューと全CI成功後にマージ可能。本番反映・実端末検証は別途証跡を確認する。
