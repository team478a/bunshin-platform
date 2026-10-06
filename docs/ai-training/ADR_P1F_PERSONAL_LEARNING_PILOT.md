# P1-F Personal Learning Pilot composition

2026-10-06。基準main: e663bbc30f40c994c3f628ee8a14f08fde2afccc。

P1-Fは既存Scope / Consultation / Persistence / Router / Answer / AssessmentをWeb composition rootから接続する。新しいProvider、Definition、保存正本、一般Chatは作らない。

限定Pilotは専用ServiceProgram.settings.personalLearningPilotの存在で旧V1から隔離する。非本番APP_ENV、PERSONAL_LEARNING_PILOT=true、最大5件のEnrollment allowlist、既存notificationsEnabled=falseを必須とする。設定不正・flag停止時も旧Runtimeへfallbackしない。LINEコードは変更せず、専用Programでは既存通知停止設定を必須とする。旧Runtimeのstate / candidate / persistDecisionは予約済みProgramを拒否し、既存Personal Assignmentの誤配信も防ぐ。

本人の有効membership / Enrollment / Serviceをサーバーで解決し、保存Repositoryでも再認可する。相談はbounded replayとしてブラウザメモリだけに保持し、本文をDB/Event/logへ保存しない。Goalの確認とPlanの確認は別CTA。通信失敗後は保存済み正本から復元する。

3 review fixtureは未承認のまま。Migration適用、人間によるDefinition承認、専用Enrollment・既存Profile準備、既存評価Providerの利用/費用承認をPilot開始前の独立Gateとする。未準備は停止し、UNKNOWNを初心者・PASSに補完しない。

Mission / 回答UIと既存評価Jobを再利用する。Pilotでのみ回答送信時にSTARTED事実を同じAnswer transactionで確保し、ヒントを読んだという架空Eventを作らない。既存V1の保存挙動は維持する。

専用Programの回答・評価HTTP受付だけでなく、評価Job登録・実行・Provider呼出し直前にもPilot gateを再検証する。停止後の保留Jobから実評価を新規開始しない。既存Provider実装・設定・Promptは変更しない。

最小の固定codeイベントと選択式Feedbackだけを既存ProgramActionEventに保存する。Analytics基盤・管理画面・自由記述Feedbackは追加しない。管理者の個別相談閲覧や自動改善には接続しない。Pilot完了は研修修了・Goal達成・Enrollment終了を意味しない。

P1-Fだけで停止し、本番deploy、Migration、承認、次Phaseを自動開始しない。
