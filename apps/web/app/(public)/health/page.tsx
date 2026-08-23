export default function HealthPage() {
  return (
    <main>
      <section className="card">
        <p className="status">動作中</p>
        <h1>システムの動作確認</h1>
        <p>画面を表示する仕組みは動いています。データベースは別の確認画面で調べられます。</p>
        <ul>
          <li>
            <a href="/api/health/live">画面の動作を確認</a>
          </li>
          <li>
            <a href="/api/health/ready">全体の準備を確認</a>
          </li>
        </ul>
      </section>
    </main>
  );
}
