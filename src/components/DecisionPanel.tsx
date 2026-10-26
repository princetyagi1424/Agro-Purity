import { buildSeedDecision, type DecisionInput } from '../lib/decision/seedDecision';

export function DecisionPanel(props: DecisionInput) {
  const decision = buildSeedDecision(props);
  const border =
    decision.severity === 'warning' ? '2px solid #ef4444' :
    decision.severity === 'caution' ? '2px solid #f59e0b' :
    decision.severity === 'blocked' ? '2px solid #8b5cf6' :
    '2px solid #22c55e';
  return (
    <div className="card" style={{ border }} role="region" aria-label="Farmer guidance">
      <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>{decision.title}</h2>
      <p style={{ margin: '0.5rem 0', color: 'var(--muted)' }}>{decision.summary}</p>
      <h3 style={{ fontSize: '0.95rem', marginBottom: '0.35rem' }}>What should the farmer do next?</h3>
      <ol style={{ margin: 0, paddingLeft: '1.2rem' }}>
        {decision.nextSteps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <details style={{ marginTop: '0.75rem' }}>
        <summary>Parameter status (observed vs lab-required)</summary>
        <ul style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          {decision.parameters.map((p) => (
            <li key={p.name}>
              <strong>{p.name}</strong> [{p.status}] — {p.detail}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
