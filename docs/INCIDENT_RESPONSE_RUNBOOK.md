# Incident Response Runbook

## Severity

- SEV-1: 全面停止、データ漏えい疑い、破壊的データ不整合
- SEV-2: 認証不能、Mission生成不能、継続的な5xx
- SEV-3: 一部機能劣化、回避策あり

## 初動

1. 発生時刻、Production SHA、症状、requestIdを記録する。本文・Knowledge・Secretは転記しない。
2. Vercel deployment/log、GitHub Actions、Supabase status/metricsを確認する。
3. 影響拡大がある場合は新規deployment・migrationを停止する。
4. 既知正常deploymentへのrollback、Provider機能停止、DB restoreの順に影響と不可逆性を評価する。

## 復旧確認

- `/api/health/live` と `/api/health/ready`
- Magic Link login/logout
- tenant isolationを壊していないこと
- 代表的なStrategy / Mission read
- DB migration status

## 事後対応

24時間以内を目標に、原因、影響範囲、時系列、復旧操作、再発防止を記録する。個人情報とSecretは含めない。
