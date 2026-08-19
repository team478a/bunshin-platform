# Social Account Strategy Core 実装報告

## 結果

SocialProfileの上に、SNSアカウントの育成方針を上書きせずversion管理・承認できるCore Persistenceを追加した。

## 設計

- `SocialAccountStrategy`: SocialProfileごとの不変version
- status: `DRAFT | PROPOSED | APPROVED | SUPERSEDED`
- 同一SocialProfileのversionはDB transactionとadvisory lockで連番化
- 承認時は旧APPROVEDを同一transactionでSUPERSEDEDへ変更
- 部分unique indexにより現在のAPPROVEDを最大1件に制約
- `workspaceId + bunshinId + socialProfileId + platform`複合FKで別Bunshin/Profile混入をDBでも拒否
- 利用時間は`3 | 5 | 10 | 20`をapplication validationとDB CHECKの両方で制約

## 権限境界

- create/approveはACTIVEなSOCIAL Capabilityを要求
- repositoryはactive Workspace/member、非archive Bunshin、管理権限を検証
- readもWorkspace/Bunshin/Profile scopeを必須とする

## 対象外

Primary SNS、Wizard、API/UI、AI生成、Knowledge/Memory読込、Content Pillar自動生成は実装していない。

## 検証

- Prisma schema validate / generate
- 空PostgreSQLへ全11 migration適用
- strategy unit 3件
- database integration 14件（version、approval、cross-workspace isolationを含む）
- package typecheck / lint / build
