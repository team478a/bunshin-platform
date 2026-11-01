# ADR: 成長ロードマップの既存データ読み取り

## Status

Accepted for Phase 1-B2 implementation (2026-11-02).

## Decision

- DatabaseへMemberRoadmapContextRepositoryを実装する。既存のMemberUsage認可・request snapshotを内部helperへ抽出し、両Adapterが同じ現在の所属・同意・所有権検証を再利用する。ContextはRepeatable Readのread-only transaction内で再認可する。
- 過去のasOfは達成証拠の期限で、現在の認可・停止・利用権を迂回する手段ではない。日時・timezoneを検証し、本文・回答・SNS個別数値を選択しない。
- INITIAL_SETUPは本人のServiceOnboardingResponse完了記録と、対象Bunshinの保存済みSocialProfileの両方を確認できた場合だけtrue。会員の回答内容を他Bunshinへコピーしない。プロフィールの現在の停止は過去の保存実績を取り消さない。
- WEEKLY_PLANは対象BunshinのconfirmedAtを持つCONFIRMED / EXPIREDな計画、POST_PREPARATIONは本人のコピー操作、SNS_METRICSは本人が保存したMANUAL / SCREENSHOT数値記録でtrueにする。いずれもasOf以前だけ。SNS_METRICSは本人確認済みの記録で、公式SNS API接続・公開確認の証明ではない。
- 証拠がない項目はnull / UNKNOWNとし、未達成へ補完しない。単なるVIEWEDを投稿履歴画面やガイドの閲覧証拠へ流用しない。実際の予約投稿、分析の実行、改善反映、外部ガイド・接続は推測しない。
- 有効紹介を独立して確定する状態・版付き資格判定がまだない。REGISTERED / FIRST_POST_REPORTEDや特典付与件数を新しい有効紹介数へ読み替えず、validReferralsはnullを維持する。
- 利用可否は既存SOCIAL entitlement Resolverを同じtransactionで呼び、対象BunshinのSOCIAL Capability・稼働状態も確認する。ResolverのPolicy / Assignment検索にはWorkspace / Groupを明示する。読み取り用途なので権限付与・consumeAccess・利用台帳書き込みは行わない。
- このPRで公開するfeature stateは、AIを伴わないFIRST_DECISION、POST_HISTORY、SNS_METRICS。FIRST_DECISIONは対象Bunshinに現在PENDINGな判断行と保存済みcontentを持つ利用中のMissionがある場合だけ推奨可能とする。SNS_METRICSの操作前提は現在のACTIVEプロフィール。POST_HISTORYの閲覧自体は履歴0件でも可能。ただし達成証拠がUNKNOWNならCoreは優先候補にしない。
- SOCIALの明示的なPolicy / Assignmentがない場合も既存Resolverの拒否結果を維持し、利用可能を捏造しない。ロードマップのprojectionを既存APIの実行権限として使わず、基本機能へ新しい実行gateは追加しない。
- 生成・週間計画作成等のAI予算、コピーの安全審査・操作前提は未接続。featuresへ推測で追加せずPREPARINGを維持する。採否の権限や安全な実行は実際の操作時にも既存Use Caseで再検証する。既定定義factoryを再利用し、DB保存・編集権限・監査やHTTP/UIの接続は別タスク。
- schema/migration、Feature Definition / Flag、利用イベント、Credit、特典、外部操作を追加しない。
