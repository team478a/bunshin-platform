export default function HealthPage() {
  return (
    <main>
      <section className="card">
        <p className="status">Live</p>
        <h1>Application Health</h1>
        <p>Web processは応答しています。DB readinessはAPIで個別に確認できます。</p>
        <ul>
          <li>
            <a href="/api/health/live">Live API</a>
          </li>
          <li>
            <a href="/api/health/ready">Ready API</a>
          </li>
        </ul>
      </section>
    </main>
  );
}
