# マナベルスタイル — 停止状態の専用Program準備UI

基準main: `74648667d788ae3498f7b97a42eb2d0d5ac66935`。
branch: `codex/personal-learning-program-preparation-ui`。commitは本PR headを参照。

## 範囲と判断

人間の承認「最小の管理画面を独立PRで追加」に基づく。既存CREATE_PROGRAM APIを利用し、期限なし・無料・招待制・GUIDEDのみの専用Programを停止状態で準備する導線だけを追加する。汎用運用管理UIや完成品代行モードは作らない。

本番準備設定が未登録である監査結果を、本番設定変更の承認とは扱わない。元checkoutの未解決変更を上書きせず、独立作業checkoutを使用した。

## 画面・認可

`/s/{serviceSlug}/manage/programs/personal-learning-preparation`。serverで現認証と既存resolveManagedServiceContextのService管理権限を確認する。未認証はloginへ、権限なしは404。APIの同origin・現在管理権限・Repository内再認可・tenant lock・CASは変更しない。

表示gateはAPP_ENVがproduction/staging/development、PERSONAL_LEARNING_PILOT_OPERATIONS=true、厳密なPERSONAL_LEARNING_PRODUCTION_PREPARATION authorityのWorkspace/Service一致、両実行flag OFF。別Serviceのauthority IDは表示しない。missing/malformed/不一致では設定名の案内のみ。既存Program管理のリンクも一致する準備対象だけに表示する。

GET描画でAPI呼出し・DB作成はしない。「現在の状態を確認」だけが既存API GETを実行する。未存在/ABSENT/enabled=falseのみ作成を提示する。対象Service/Program ID、期限なし、停止・通知OFF、本人支援、別承認事項を表示し、reviewEvidenceKeyと未チェックの明示確認を必須にする。

## 再送と結果確認

POSTはCREATE_PROGRAM、operation UUID、GET stateToken、固定confirmation、bounded reviewEvidenceKeyのみ。Clientはauthority/settings/期間を送らない。Provider/環境設定変更は行わない。

応答喪失・5xx・不正receiptは結果不明。同じcommandをメモリ内で固定し、再送時にUUID/bodyを再生成しない。操作中はref lockで連続実行を防ぎ、再送待ちは編集/GETを閉じる。成功はSUSPENDED/enabled=falseとOffering UUIDを持つreceiptだけ。4xxは作成成功と表示せず、最新状態を再確認する。

ページを離れると再送commandは消える。再読取で既存Programを認めても、その操作の成功receiptとは断定せず変更しない。既存ProgramにはINITIALIZE/START/STOP/Participant/承認操作を提供しない。

## 変更・非変更

追加: server表示gate、server page、client card/純粋command helper、2 test files、本報告。更新: Program管理の対象限定リンク、Wave 0 Runbook、Decision Log。

DB/schema/migration/Application Domain/API/Provider/LINE/旧30日V1 Runtime変更なし。本番deploy・flag設定・Program作成・Definition承認・Participant登録・Pilot enable・実課金なし。

## 検証

新UI/client gateと既存operations/preparation/program-management回帰: 4 files / 43 tests PASS。認証server page否定試験: 1 file / 4 tests PASS。Web全体typecheck、architecture check / 10 tests、git diff --check PASS。変更ファイルlintと全CI結果はPRの検証記録に対応させる。

React静的描画・純粋client送信試験であり、実ブラウザ・実session・スマートフォンE2Eとは区別する。実画面から既存API/DBまでの通し確認はリリース前の残Gate。全build/回帰はCIで確認し、未成功の状態を完了済みにしない。

## 残作業とrollback

人間PRレビュー→CI確認→別承認のdeploy→準備authority/flag設定→実認証で状態確認→別承認の停止Program作成。環境設定未登録の間は作成不可。Wave 0開始や後続登録/承認へ自動で進まない。

UI rollbackは本PRをrevertしてPR化。schema rollback不要。将来作成済みデータがある場合も削除しない。既存緊急停止APIの到達性と停止/drainは別Runbookに従う。
