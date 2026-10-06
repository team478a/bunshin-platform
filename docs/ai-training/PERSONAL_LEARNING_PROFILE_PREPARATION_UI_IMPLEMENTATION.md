# Personal Learning 本人Profile準備UI実装報告

## 範囲と基準

基準main `4789eb6d740da91be456cd6d345e0aa9f1aa0b3a`（#1163）。branch `feat/personal-learning-profile-preparation-ui`。commit/PR/CIはこの報告を含むPRの最終headとChecksを正本とする。

停止中の限定Pilot参加者が、既存Profile APIへ自分の最小回答を送るUIのみ。Goal/Plan/Assignment/Providerの開始や本番設定を行わない。UI実装完了はWave 0開始承認ではなく、[Final Readiness](PERSONAL_LEARNING_PRODUCTION_WAVE0_FINAL_READINESS.md)の本番Gateは維持する。

## 本人導線と表示認可

URLは既存 `/s/{serviceSlug}/programs/{programEnrollmentId}`。既存のログイン・Service所属・本人ACTIVE PARTICIPANT・Enrollment照会を利用し、reserved Pilot分岐内だけで準備画面を表示する。旧30日V1のsetupやRuntimeを変更しない。一般公開導線・管理者代入フォームは追加しない。

`PERSONAL_LEARNING_PROFILE_PREPARATION=true`が入口。表示前に既存準備accessとProfile repository.readを呼び、固定authority・停止中Program・通知off・Enrollment期間・所有者・削除履歴・seat・旧Goal/Assignmentなしを既存repositoryが照合する。未知設定は拒否。本番はserver-owned authority必須、両実行flag offを表示前後に要求する。準備flagと実行flagの同時有効化は正常運用にしない。

GET表示は保存しない。read後にも設定の失効を再確認する。Profile ID/updater identityをclientへ渡さず、3項目だけ投影する。不正な既存値をdefaultで修復しない。POSTも既存APIがsession/Origin/厳格入力とtransaction内再認可を行い、ページを開いた事実だけでは保存を許可しない。

## フォームと確認

仕事の種類、今のAI利用経験、1回の学習時間の3選択と本人確認。すべて未選択から開始し、3項目と確認が揃わない限り送信不可。既存enumに対応し、BEGINNERは未経験の断定ではない。UNKNOWNを勝手にBEGINNER/NONEへ変換せず、答えられない場合は保存しない案内を表示する。

既存Profileがあれば保存済み表示のみで編集しない。保存後も「開始の案内をお待ちください」と表示し、Goal/Plan/Pilotを自動開始しない。ブランド表示はマナベルスタイル、内部Domain名は変更しない。既存UIの縦レイアウト・大きなCTAを再利用し、新しいテーマや依存ライブラリは導入しない。

## APIと再送

既存 `POST /api/services/{serviceSlug}/ai-training/enrollments/{enrollmentId}/personal-learning/profile`だけを利用する。bodyは3回答、operationId、CONFIRM_MY_LEARNING_PROFILE、expectedAbsent=true。User/Workspace/Service/Program IDをbodyへ追加しない。同一origin credentials/no-storeで送る。

操作IDは送信時に一度だけ作り、回答とともに現在の画面内で固定。送信中の二重クリックをrefでも防ぎ、通信例外/5xx/不完全receiptでは入力をロックし、同じbodyとIDで手動再送する。自動retryなし。INITIALIZED/ALREADY_INITIALIZEDと一致するProfileが揃って初めて保存済みにする。

401/403/404は利用不可、409/400/413は更新確認が必要として送信を止める。内部エラー本文は表示しない。ブラウザ更新ではserverが再読取し、既存Profileなら再作成しない。操作IDはlocalStorage/sessionStorageや長期履歴へ保存しないため、画面を閉じた後の同ID再送を保証しない。既存absence CASとuniqueで別IDからの上書きも拒否する。

## 変更ファイルと検証

- 既存受講者pageのreserved分岐。
- 新しいread-only page helper、準備Card、client command/receipt処理。
- page/client表示テスト2 files、合成ブラウザfixtureとloopback test server。
- Decision Log、本報告、Runbook参照。

ローカル関連5 files/58 tests成功（新規UI/page、旧Pilot UI、本人Profile API、preparation access）。未回答/確認なし拒否、保存済み非編集、応答喪失と同body再送、失効/競合/不完全receipt、scope/authority/flag/repository拒否を検証する。ローカルtypecheck/lintは長時間未完で停止し成功扱いにしない。型・lint・全体回帰/build/DB統合の最終結果はPR Checksへ記録する。

合成ブラウザfixtureはDB/認証/Providerなし、fetchを限定mockへ置換し、実API通信を拒否する。`node scripts/test/profile-preparation-browser-server.mjs`で127.0.0.1:18998だけ起動。ブラウザ接続は2回timeoutのため実画面操作・mobile layoutは未検証。SSR/純粋契約の成功を実React操作・実認証E2E成功とみなさない。サーバーは確認後停止済み。

## 非変更と残Gate

DB/schema/migration/API保存契約/Provider/model/価格/LINE/既存V1処理を変更しない。本番DB接続、Migration、deploy、flag設定、Definition承認、参加者/実Profile登録、実課金、Pilot開始なし。

残作業は実画面とスマートフォンの確認、実本人session/権限失効/再送のE2E、本番Migration/RLS/backup、内部人数、Definition教育レビューと承認、Provider数値・費用・監視・停止/drain、全Release Gate。本人UIの存在だけでGate G/IをPASSにしない。

rollbackは準備flag offと全instance反映確認。既存Profile/Eventを削除せず、必要ならUI変更をrevertする。旧V1 setupへfallbackしない。本変更後は停止し、本番読取監査・release・実登録・実課金・Wave 0開始は別指示を待つ。
