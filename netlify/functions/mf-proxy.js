/**
 * Proxy Météo-France API
 * Garde la clé API côté serveur (variable d'environnement MF_API_KEY)
 * et transmet les requêtes au portail MF.
 *
 * Usage depuis le frontend :
 *   POST /.netlify/functions/mf-proxy
 *   Body JSON : { url, method?, payload? }
 */

const MF_BASE = 'https://public-api.meteofrance.fr/public/DPClim/v1';

// Sécurité : on n'autorise que le domaine MF officiel
function isAllowed(url) {
  return url && url.startsWith('https://public-api.meteofrance.fr/');
}

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  // Vérification de la clé
  const MF_KEY = process.env.MF_API_KEY;
  if (!MF_KEY) {
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'MF_API_KEY non définie dans les variables d\'environnement Netlify.' })
    };
  }

  // Lecture du body
  let params;
  try {
    params = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Body JSON invalide.' }) };
  }

  const { url, method = 'GET', payload } = params;

  if (!isAllowed(url)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'URL non autorisée.' }) };
  }

  // Appel à l'API MF
  try {
    const fetchOpts = {
      method,
      headers: {
        'Authorization': `Bearer ${MF_KEY}`,
        'accept': 'application/json'
      }
    };
    if (payload) {
      fetchOpts.headers['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify(payload);
    }

    const resp = await fetch(url, fetchOpts);
    const ct = resp.headers.get('content-type') || '';

    // Réponse JSON ou texte/CSV
    if (ct.includes('application/json')) {
      const data = await resp.json();
      return {
        statusCode: resp.status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      };
    } else {
      const text = await resp.text();
      return {
        statusCode: resp.status,
        headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' },
        body: text
      };
    }

  } catch (e) {
    return {
      statusCode: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Erreur proxy : ' + e.message })
    };
  }
};
