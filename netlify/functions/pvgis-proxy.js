/**
 * Proxy PVGIS API — contourne la restriction CORS de PVGIS
 * Aucune clé API requise, PVGIS est totalement gratuit
 */
exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  /* Paramètres transmis depuis le frontend */
  const p = event.queryStringParameters || {};
  const required = ['lat','lon','peakpower'];
  for (const r of required) {
    if (!p[r]) {
      return {
        statusCode: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Paramètre manquant : ${r}` })
      };
    }
  }

  /* Construction URL PVGIS v5.3 — PVcalc */
  const pvgisParams = new URLSearchParams({
    lat:          p.lat,
    lon:          p.lon,
    peakpower:    p.peakpower,
    loss:         p.loss        || '14',
    angle:        p.angle       || '10',
    aspect:       p.aspect      || '0',
    raddatabase:  'PVGIS-SARAH3',
    pvtechchoice: 'crystSi',
    mountingplace:'free',
    outputformat: 'json',
    browser:      '0'
  });

  const url = `https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?${pvgisParams}`;

  try {
    const resp = await fetch(url);
    const data = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: resp.status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Erreur PVGIS', detail: data })
      };
    }

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };

  } catch (e) {
    return {
      statusCode: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Erreur proxy PVGIS : ' + e.message })
    };
  }
};
