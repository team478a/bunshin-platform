# AI Training Adaptive Difficulty ADR

Date: 2026-09-21

## Decision

AI研修の復習先と難易度は、AIの自由判断ではなく`AiTrainingV1Policy`の決定的なDomain Ruleで選ぶ。

- 回答がREVIEWになった場合は、前回課題のVersioned Definitionにある`reviewMissionKey`を優先する。
- 復習と再開はEASY、基礎課題はEASY、実務課題はSTANDARDを基本とする。
- 3回以上の連続成功があり、課題の対象Skillがすべて80以上の場合だけCHALLENGEへ進める。
- 確定した難易度と理由は、既存`ProgramMissionAssignment.displaySnapshot`と`MISSION_ASSIGNED`イベントへ保存する。

## Reasons

同じ状態から同じ判定を再現でき、課題が選ばれた理由を運営者が追跡できる必要がある。既存の回答評価、Skill State、Assignment、Action Eventで必要な情報を表現できるため、新しい状態テーブルは追加しない。

## Compatibility

過去の表示Snapshotは、Versioned Mission Catalogの基準難易度と案内文で不足項目を補う。進行中Enrollmentと既存のAI物販Program Runtimeは変更しない。
