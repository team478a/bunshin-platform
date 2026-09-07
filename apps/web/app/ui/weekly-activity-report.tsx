import type { WeeklyActivityReport } from '@bunshin/application';

const items: Array<{ key: keyof WeeklyActivityReport; label: string }> = [
  { key: 'confirmed', label: '確認' },
  { key: 'copied', label: 'コピー' },
  { key: 'posted', label: '投稿完了' },
  { key: 'rested', label: 'お休み' },
  { key: 'materialsAdded', label: '素材追加' },
  { key: 'variantsUsed', label: '別案利用' },
];

export function WeeklyActivityReportCard({ report }: { report: WeeklyActivityReport }) {
  return (
    <section className="service-entry__card" id="weekly-report">
      <p className="eyebrow">今週の記録</p>
      <h2>活動レポート</h2>
      <p>
        {report.weekStart.replaceAll('-', '/')}〜{report.weekEnd.replaceAll('-', '/')}
      </p>
      <div className="weekly-activity-report__grid" aria-label="今週の活動件数">
        {items.map(({ key, label }) => (
          <div className="weekly-activity-report__item" key={key}>
            <span>{label}</span>
            <strong>{String(report[key])}件</strong>
          </div>
        ))}
      </div>
      <p>{report.message}</p>
    </section>
  );
}
