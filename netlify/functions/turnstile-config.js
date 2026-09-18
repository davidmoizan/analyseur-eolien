function reply(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return reply(405, { error: 'Methode non autorisee' });
  }

  const siteKey = String(process.env.TURNSTILE_SITE_KEY || '').trim();
  if (!siteKey) {
    console.error('TURNSTILE_SITE_KEY absente');
    return reply(503, { error: 'La verification anti-robot n\u2019est pas configuree' });
  }

  return reply(200, { siteKey });
};
