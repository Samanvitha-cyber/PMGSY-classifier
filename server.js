const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    const err = new Error(`Missing required environment variable: ${name}`);
    err.statusCode = 500;
    throw err;
  }
  return val;
}

app.post('/api/predict', async (req, res) => {
  try {
    const API_KEY = requireEnv('IBM_CLOUD_API_KEY');

    // Accept either already-formatted payload or raw 14-field object.
    const body = req.body || {};
    const payload = body?.input_data ? body : { input_data: [body] };

    // 1) Get IAM token
    const tokenResp = await fetch(
      'https://iam.cloud.ibm.com/identity/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
          apikey: API_KEY
        })
      }
    );

    if (!tokenResp.ok) {
      const text = await tokenResp.text().catch(() => '');
      return res.status(502).json({
        error: 'Failed to retrieve IBM access token',
        status: tokenResp.status,
        details: text
      });
    }

    const tokenJson = await tokenResp.json();
    const access_token = tokenJson?.access_token;
    if (!access_token) {
      return res.status(502).json({
        error: 'IBM token response missing access_token',
        details: tokenJson
      });
    }

    // 2) Score with Watsonx deployment
    const scoringUrl =
      'https://au-syd.ml.cloud.ibm.com/ml/v4/deployments/019e930f-9458-7495-a8be-b406b4062463/predictions?version=2021-05-01';

    const scoreResp = await fetch(scoringUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${access_token}`
      },
      body: JSON.stringify(payload)
    });

    if (!scoreResp.ok) {
      const text = await scoreResp.text().catch(() => '');
      return res.status(502).json({
        error: 'Failed to score using IBM Watsonx',
        status: scoreResp.status,
        details: text
      });
    }

    const predictionJson = await scoreResp.json();
    return res.json(predictionJson);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      error: err.message || 'Internal Server Error'
    });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

