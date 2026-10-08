# マナベルスタイル Wave 0人数設定UI

## 基準・範囲

- 基準main: `6400027cd0e041d1fe732b178aeb502546df5aff`。
- branch: `codex/pilot-wave-configuration-ui`。commit / PR / CIは最終headとPRを正本とする。
- 既存Personal Learning準備ページへWave 0人数設定カードだけ追加。新API / schema / migration / Provider / Runtime変更なし。
- 元checkoutの未解決変更は編集しない。本番設定保存、deploy、参加者登録、Definition承認、START、実課金を行わない。

## 操作・境界

`/s/{serviceSlug}/manage/programs/personal-learning-preparation`。
管理者session・Service認可後、`PERSONAL_LEARNING_PARTICIPANT_PREPARATION=true`、両実行flag OFF、server-owned preparation authority完全一致で表示する。作成操作flagとは独立。未設定時は環境担当者向け案内だけ表示。ブラウザーから環境変数を変更しない。

1. 「現在の人数設定を確認」で既存`GET /api/services/{serviceSlug}/ai-training/pilot-participants`を明示実行。mount時の自動GET/POSTなし。
2. 未設定と保存済み設定を区別。未設定の場合、内部2人・外部100人は**未保存の初期候補**。内部上限は1〜2人、外部累計上限は0〜100人、Waveは0 / 外部受付0人固定。
3. 同じ台帳から取消済みを含む累計INTERNAL/EXTERNAL枠を表示。Enrollment等の識別子はUI stateに保持しない。既存外部枠 / 後続Waveがあれば変更UIを出さない。
4. human review識別子と未チェックの確認checkboxが必要。値変更で確認解除。最新revisionからCONFIGUREを作り、既存APIのsame-origin/session/authority/停止条件/DB lock/CAS/auditを再利用。
5. 操作UUID/bodyを固定。同時クリックはref lockで抑止。通信喪失・5xx・receipt不正・再読取失敗は不明扱い、同じ操作の明示再送のみ。内容変更とrefreshを止める。ページ離脱時の注意を表示。
6. 正常receiptの後にGETでrevision / cap / Wave完全一致を検証して成功表示。409等は自動再試行せず、再読取・人間確認を要求。実際には保存されていた可能性を消さない。

ADMIT / REVOKE / Wave昇格 / START / Definition承認 / Call Admission設定をこのUIに含めない。外部100人という初期候補は一般公開や募集の承認ではない。内部Domain名維持、旧V1 / LINE変更なし。

## 検証

新UI/clientと既存準備ページ/APIの関連6ファイル・79テスト成功（Vitest、maxWorkers=1）。Web typecheck、architecture check、変更ファイルPrettier、git diff --check成功。対象: authority一致/不一致、flag OFF/ON、未認証、未設定、不正snapshot、取消枠、本人確認、上限、Wave0、CAS、同body再送、receipt後再読取、HTTP拒否、本文非表示。

ローカルWeb全件testは既存terminology testで失敗表示が出た後、負荷が高く停止。並列数2の再実行も完了前に停止し、全件成功とは扱わない。全件lintもローカル完了未確認。変更箇所lint/buildと最終head CIの結果はPR本文・最終報告を正本とする。実ブラウザー保存・実DB・スマートフォン検証は未実施。

## 本番利用前Gate・残課題

本PRのマージは本番利用承認ではない。CIと人間レビュー後の別deploy承認、Production participant preparation flag設定の承認、専用停止Program・schema・RLS・台帳・allowlist整合確認が必要。値を表示して人間が承認してから保存する。人数設定完了はDefinition承認、参加者登録、費用設定、Pilot開始の承認ではない。

スマートフォン/実管理者/実DBでの保存は本番操作Gate後の別検証。広い管理UI・参加者選定・Wave昇格は未実装。

## Rollback

Pilot停止を維持し、準備flagをOFFにしてUI/APIを閉じる。UI変更をrevertする場合も保存済み台帳/人数設定/監査は削除しない。DB rollback不要。既存運用STOP経路を削除しない。
