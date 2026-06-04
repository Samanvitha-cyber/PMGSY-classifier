const FEATURES = [
  'STATE_NAME',
  'DISTRICT_NAME',
  'NO_OF_ROAD_WORK_SANCTIONED',
  'LENGTH_OF_ROAD_WORK_SANCTIONED',
  'NO_OF_BRIDGES_SANCTIONED',
  'COST_OF_WORKS_SANCTIONED',
  'NO_OF_ROAD_WORKS_COMPLETED',
  'LENGTH_OF_ROAD_WORK_COMPLETED',
  'NO_OF_BRIDGES_COMPLETED',
  'EXPENDITURE_OCCURED',
  'NO_OF_ROAD_WORKS_BALANCE',
  'LENGTH_OF_ROAD_WORK_BALANCE',
  'NO_OF_BRIDGES_BALANCE',
  'COLUMN15'
];

const NUMERIC_FEATURES = new Set(FEATURES.filter(f => !['STATE_NAME', 'DISTRICT_NAME'].includes(f)));

function toNumberOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function getFormValues(form) {
  const values = {};
  for (const key of FEATURES) {
    const el = form.elements.namedItem(key);
    if (!el) continue;
    const raw = el.value;
    if (NUMERIC_FEATURES.has(key)) {
      const n = toNumberOrNull(raw);
      if (n === null) throw new Error(`Invalid number for ${key}`);
      values[key] = n;
    } else {
      const s = (raw || '').trim();
      if (!s) throw new Error(`Missing value for ${key}`);
      values[key] = s;
    }
  }
  return values;
}

function renderPrediction(predictionJson) {
  const resultArea = document.getElementById('resultArea');
  const errorArea = document.getElementById('errorArea');
  errorArea.textContent = '';

  // Attempt to normalize common Watson ML response shapes.
  // Typical: { predictions: [ { label: ..., score: ... } ] }
  // Or: { predictions: [ [..] ] }
  let label = null;
  let raw = predictionJson;
  let score = null;

  try {
    const preds = predictionJson?.predictions;
    if (Array.isArray(preds) && preds.length > 0) {
      const p0 = preds[0];
      if (p0 && typeof p0 === 'object') {
        label = p0.label ?? p0.class ?? null;
        score = p0.score ?? p0.probability ?? null;
      } else {
        label = p0;
      }
    }
  } catch {
    // ignore
  }

  if (label === null && score === null) {
    label = '—';
  }

  resultArea.innerHTML = `
    <div class="pred-card">
      <div class="pred-top">
        <div>
          <div class="pred-label">Predicted Value</div>
          <div class="pred-value">${String(label)}</div>
        </div>
        <div class="pred-label">Model</div>
      </div>
      <div class="pred-meta">
        <div class="kv"><b>Raw IBM Response</b><code>${escapeHtml(JSON.stringify(raw, null, 2))}</code></div>
        ${score === null ? '' : `<div class="kv"><b>Score</b><code>${escapeHtml(String(score))}</code></div>`}
      </div>
    </div>
  `;
}

function renderError(message) {
  const resultArea = document.getElementById('resultArea');
  const errorArea = document.getElementById('errorArea');
  resultArea.innerHTML = `<div class="empty">Prediction failed.</div>`;
  errorArea.textContent = message;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '<')
    .replaceAll('>', '>')
    .replaceAll('"', '"')
    .replaceAll("'", '&#039;');
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('predictForm');
  const submitBtn = document.getElementById('submitBtn');
  const statusText = document.getElementById('statusText');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.classList.add('loading');
    statusText.textContent = 'Requesting access token and scoring...';
    document.getElementById('errorArea').textContent = '';

    try {
      const values = getFormValues(form);

      // Required payload format
      const payload = {
        input_data: [
          {
            fields: FEATURES,
            values: [[
              FEATURES.map(k => values[k])
            ]]
          }
        ]
      };

      const resp = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        let details = '';
        try {
          const j = await resp.json();
          details = j?.error ? JSON.stringify(j, null, 2) : JSON.stringify(j);
        } catch {
          details = await resp.text().catch(() => '');
        }
        throw new Error(`Backend error (${resp.status}): ${details || 'Unknown error'}`);
      }

      const predictionJson = await resp.json();
      renderPrediction(predictionJson);
      statusText.textContent = 'Prediction complete.';
    } catch (err) {
      renderError(err?.message || 'Request failed');
      statusText.textContent = 'Prediction failed.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
    }
  });
});

