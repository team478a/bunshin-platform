# 本人の紹介資格証拠を既存履歴から取得する

日付: 2026-11-02 / 基点: main #1430

SOCIALの内部Repositoryとして、被紹介者本人だけの紹介関係と本人所有Bunshinの
メタデータを読み取る。actorUserId=userIdを必須とし、管理者による他人指定や
紹介者から被紹介者の履歴を取得する入口を作らない。HTTP / Jobへはまだ公開しない。

既存の利用履歴クエリと実操作の重複排除を再利用する。
認可・法的同意・所有権を各Bunshinについて検証し、同じREAD ONLY /
RepeatableRead transactionで取得する。Bunshinは20件、履歴は既存上限、
資格活動は合計10,000件を上限とし、超過はPARTIALで確定を禁止する。
本文・画像・Memoryは取得しない。失効・所有権不一致はnull、障害は例外とする。

登録監査は本人・同会員・scope・登録日時・APPROVED / REQUESTED・固定の登録理由・
beforeData / afterDataを照合する。欠測・矛盾・複数一致はnullのままで、
REGISTEREDやREGISTRATION_COMPLETEDだけでは新規登録とみなさない。
これは既存writerの契約に基づく投影であり、監査ログに新しい発生元の署名を追加するものではない。

審査状態は未保存のためUNKNOWN。帰属の一意性は既存ServiceReferralの一意制約を利用する。
資格確定・報酬付与・原価予約・設定変更・追加イベント保存を行わない。
Hassyの閾値や特典は注入しない。新しいDBテーブル・migrationは不要。
