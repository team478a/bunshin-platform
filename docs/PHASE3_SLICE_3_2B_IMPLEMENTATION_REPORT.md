# Phase 3 Slice 3.2-B Authenticated Content Pillar API / Minimal UI 実装報告

## 1. 実装範囲

Slice 3.2-AのContent Pillar Core Persistenceをverified sessionへ接続し、list/detail/create/update/activate/deactivate/soft-delete APIと既存Bunshin詳細内の最小UIを追加した。AI、Weekly Plan、Mission、SNS Provider、投稿、LINE、BLOG、Jobは実装していない。

## 2. 変更内容

- Bunshin scopeのContent Pillar HTTP adapterと7つのrouteを追加した。
- strict JSON、UUID pillarId、same-origin、Content-Type、DELETE body禁止、`no-store`を実装した。
- createを201、それ以外の成功を200とし、状態変更とsoft-deleteの冪等性をCoreから維持した。
- 日時をISO 8601文字列へ変換し、秘密情報を含まない公開DTOを追加した。
- Bunshin詳細へ一覧、追加、編集、停止、再有効化、削除確認UIを追加した。
- Assignment未割当時は案内だけ、SUSPENDED/LOCKED時はread-onlyとした。
- 数値input、折り返し可能な操作列によりmobile viewportで横スクロールを生じにくくした。

## 3. セキュリティ境界

- actorはrequestから受け取らずverified sessionからだけ解決する。
- readはactive Workspace Member、mutationは既存Bunshin管理policyとACTIVE SOCIAL Assignmentを必須とする。
- cross-user、cross-workspace、cross-bunshin、archive済みBunshin、deleted Pillarは既存Core/Repository境界で拒否する。
- request supplied authority、ID、active、deletedAt、timestamp、unknown fieldを拒否する。
- responseへAssignment config、actor、credential、tokenを含めない。

## 4. 検証

- format / lint / typecheck
- unit / HTTP contract test
- production build
- GitHub Actions `verify` / `database`
- Vercel Preview

## 5. Production gate

Production migration前のbackup/rollback確認、authenticated mobile browser smoke、Auth/SMTP設定、human security reviewはProduction公開前の確認事項として残る。UIとAPIは外部AI/SNSへ通信しない。

## 6. 次のSlice

本PRのレビュー・merge後に次のSliceを別の実装指示書で承認する。AI、Weekly Plan、Mission、SNS Provider、投稿、LINE、BLOG、Jobは引き続き開始しない。
