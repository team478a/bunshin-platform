# Phase 2 Slice 2.2-B 実装報告

## 調査・変更

Slice 2.2-AのOwner Knowledge / Grantをverified sessionへ接続し、Knowledge CRUD、archive、Bunshinへのgrant/revoke APIと最小UIを追加した。

## 主要判断

- actorは`CurrentUserProvider`だけから解決する。
- mutationはsame-origin、JSON、strict schemaを必須とする。
- 公開DTOから`ownerUserId`と`grantedByUserId`を除外する。
- Bunshin画面には本人所有Knowledgeだけを候補表示する。
- Grant不在時は空配列とし、Workspace全Knowledgeへfallbackしない。

## 対象外

AI、embedding、RAG、import、file upload、Memory、Capability、SOCIAL、LINE、BLOG、Jobは実装していない。

## 検証

lint、typecheck、unit test、production buildを実行する。Production公開前にSupabase Auth設定、migration、browser smoke、human security reviewを確認する。

## 次の条件

本PRをレビューし、Production gateを満たす。次Sliceへ進む場合はSlice 2.3 Bunshin Memoryの実装指示書を先に承認する。
