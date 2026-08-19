# Phase 3 Slice 3.1-B Authenticated Social Profile API / Minimal UI 実装報告

## 1. 実装範囲

Slice 3.1-Aの手動Social Profileをverified sessionへ接続し、list/create/update/activate/deactivate APIと既存Bunshin詳細内の最小UIを追加した。SNS Provider、投稿、AI、Mission、Jobは実装していない。

## 2. 変更内容

- Social Profile HTTP adapterと5つのrouteを追加した。
- strict JSON input、same-origin、Content-Type、verified session、`no-store`を既存規約に合わせた。
- Profile IDをpathに使わず`workspaceId + bunshinId + platform`で識別した。
- 日時をISO文字列へ変換する公開DTOを追加した。
- Bunshin詳細へProfile一覧、追加、編集、停止、再有効化UIを追加した。
- Assignment未割当時は案内だけ、SUSPENDED/LOCKED時はread-onlyとした。
- HTTP contract testとmobile対応styleを追加した。

## 3. セキュリティ境界

- actorはrequestから受け取らずverified sessionから解決する。
- readはactive Workspace Member、mutationは既存Bunshin管理policyとACTIVE SOCIAL Assignmentを必須とする。
- cross-user、cross-workspace、cross-bunshin、archive済みBunshinは既存Core/Repository境界で拒否する。
- request supplied authority、status、ID、platform update、unknown fieldを拒否する。
- responseへAssignment config、actor、credential、tokenを含めない。

## 4. 検証

- format / lint / typecheck
- unit / HTTP contract test
- production build
- GitHub Actions `verify` / `database`
- Vercel Preview

## 5. Production gate

Production migration、authenticated mobile browser smoke、Auth/SMTP設定、human security reviewはProduction公開前の確認事項として残る。UIとAPIは外部SNSへ通信しない。

## 6. 次のSlice

本PRのレビュー・merge後、Slice 3.2 Content Pillarの実装指示書を別PRで承認する。SNS接続、投稿、AI、Mission、Jobは引き続き開始しない。
