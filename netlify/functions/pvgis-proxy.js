const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc';

function reply(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': statusCode === 200
        ? 'public, max-age=86400'
        : 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    },
    body: JSON.stringify(body)
  };
}

function numberParam(params, name, min, max, fallback) {
  const raw = params[name];

  if (raw === undefined || raw === '') {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Paramètre ${name} invalide`);
  }

  return value;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return reply(204, {});
  }

  if (event.httpMethod !== 'GET') {
    return reply(405, {
      error: 'Méthode non autorisée'
    });
  }

  try {
    const q = event.queryStringParameters || {};

    const lat = numberParam(q, 'lat', -90, 90);
    const lon = numberParam(q, 'lon', -180, 180);
    const peakpower = numberParam(
      q,
      'peakpower',
      0.01,
      1000,
      0.9
    );
    const loss = numberParam(q, 'loss', 0, 100, 14);
    const angle = numberParam(q, 'angle', 0, 90, 10);
    const aspect = numberParam(
      q,
      'aspect',
      -180,
      180,
      0
    );

    if (lat === undefined || lon === undefined) {
      throw new Error('Latitude et longitude requises');
    }

    const url = new URL(PVGIS_URL);

    const params = {
      lat,
      lon,
      peakpower,
      loss,
      angle,
      aspect,
      outputformat: 'json',
      pvtechchoice: 'crystSi',
      mountingplace: 'free',
      raddatabase: 'PVGIS-SARAH3',
      browser: 0
    };

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response;

    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json'
        }
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch (_) {
      data = {
        error: text.slice(0, 500)
      };
    }

    if (!response.ok) {
      return reply(response.status, {
        error: 'Erreur PVGIS',
        details: data
      });
    }

    return reply(200, data);
  } catch (error) {
    const timeout = error && error.name === 'AbortError';

    return reply(timeout ? 504 : 400, {
      error: timeout
        ? 'Délai PVGIS dépassé'
        : error.message
    });
  }
};