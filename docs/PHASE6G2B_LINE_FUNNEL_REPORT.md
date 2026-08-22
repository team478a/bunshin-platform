# Phase 6-G2b1 LINE Funnel 実装報告

## 完了範囲

- runtime environmentと期間で固定したPlatform Admin向けLINE Funnel Read Model
- 友だち追加、通知送信、Mission Open、採用、Copy、投稿完了のユニークユーザー集計
- 送信件数、Open件数、投稿完了件数、Open率、通知→投稿完了率、解除・ブロック相当率
- 最大5,000件の集計上限と`truncated`時の率非表示
- 期間指定可能な管理APIとLINE管理画面

## 帰属ルール

期間内に送信成功したDeliveryをコホートとする。同一環境のsingle-use Mission Deep Link stateを送信後・期間終了前に消費した場合だけOpenとし、採用・Copy・投稿完了もOpen通過後の行動だけを数える。

この順序により、同じUser / Missionが複数環境に存在しても、Productionのクリックや行動をStagingへ帰属させない。

## プライバシー

API/UIへ返すのは集計値だけとし、User ID、Workspace ID、Bunshin ID、Mission ID、Delivery ID、LINE user ID、Secret、Provider responseを返さない。

## 対象外

- Provider契約に基づくLINE原価
- 外部管理者警告
- LINE Login
- Production実送信
- Production Smoke / Go-No-Go
