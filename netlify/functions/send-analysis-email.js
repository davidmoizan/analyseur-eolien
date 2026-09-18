const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const MAX_PDF_BYTES = 4 * 1024 * 1024;

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

function cleanText(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function safeFilename(value) {
  const base = cleanText(value, 140)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!base) return 'analyse-preliminaire-phileole.pdf';
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

function allowedOrigin(event) {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  if (!origin) return true;
  let host;
  try { host = new URL(origin).hostname; } catch (_) { return false; }
  const allowedHosts = new Set();
  if (process.env.URL) {
    try { allowedHosts.add(new URL(process.env.URL).hostname); } catch (_) {}
  }
  if (process.env.SITE_NAME) allowedHosts.add(`${process.env.SITE_NAME}.netlify.app`);
  if (allowedHosts.has(host)) return true;
  return Boolean(process.env.SITE_NAME && host.endsWith(`--${process.env.SITE_NAME}.netlify.app`));
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Méthode non autorisée' });
  if (!allowedOrigin(event)) return reply(403, { error: 'Origine non autorisée' });

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (_) {
    return reply(400, { error: 'Requête invalide' });
  }

  const recipientName = cleanText(data.recipientName, 120);
  const recipientEmail = cleanText(data.recipientEmail, 254).toLowerCase();
  const address = cleanText(data.address, 220) || 'Site analysé';
  const configuration = cleanText(data.configuration, 160);
  const production = cleanText(data.production, 80);
  const roi = cleanText(data.roi, 80);
  const filename = safeFilename(data.filename);
  const requestId = cleanText(data.requestId, 100);
  const pdfBase64 = String(data.pdfBase64 || '').replace(/\s/g, '');

  if (!recipientName || !validEmail(recipientEmail)) {
    return reply(400, { error: 'Nom ou adresse e-mail invalide' });
  }
  if (!pdfBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(pdfBase64)) {
    return reply(400, { error: 'Pièce jointe invalide' });
  }

  let pdfBuffer;
  try { pdfBuffer = Buffer.from(pdfBase64, 'base64'); } catch (_) {
    return reply(400, { error: 'Pièce jointe invalide' });
  }
  if (pdfBuffer.length < 5 || pdfBuffer.length > MAX_PDF_BYTES) {
    return reply(413, { error: 'Le PDF est trop volumineux pour être envoyé' });
  }
  if (pdfBuffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    return reply(400, { error: 'Le document joint n’est pas un PDF valide' });
  }

  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = cleanText(process.env.BREVO_SENDER_EMAIL || 'jlbodart@phileole.com', 254);
  const senderName = cleanText(process.env.BREVO_SENDER_NAME || 'Philéole', 120);
  const replyToEmail = cleanText(process.env.BREVO_REPLY_TO_EMAIL || 'jlbodart@phileole.com', 254);
  const replyToName = cleanText(process.env.BREVO_REPLY_TO_NAME || 'Jean-Luc Bodard', 120);
  if (!apiKey) {
    console.error('BREVO_API_KEY absente');
    return reply(503, { error: 'Le service d’envoi par e-mail n’est pas encore configuré' });
  }
  if (!validEmail(senderEmail) || !validEmail(replyToEmail)) {
    console.error('Adresse expéditeur ou réponse Brevo invalide');
    return reply(503, { error: 'Le service d’envoi par e-mail est mal configuré' });
  }

  const safeName = escapeHtml(recipientName);
  const safeAddress = escapeHtml(address);
  const details = [
    configuration ? `<li><strong>Configuration :</strong> ${escapeHtml(configuration)}</li>` : '',
    production ? `<li><strong>Production estimée :</strong> ${escapeHtml(production)}</li>` : '',
    roi ? `<li><strong>Temps de retour estimé :</strong> ${escapeHtml(roi)}</li>` : ''
  ].filter(Boolean).join('');
  const subjectAddress = address.slice(0, 90);
  const message = {
    sender: { name: senderName, email: senderEmail },
    to: [{ name: recipientName, email: recipientEmail }],
    replyTo: { name: replyToName, email: replyToEmail },
    subject: `Votre analyse préliminaire Philéole – ${subjectAddress}`,
    htmlContent: `<!doctype html><html lang="fr"><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:640px;margin:0 auto;padding:28px 18px"><div style="background:#0b2340;color:#fff;padding:22px 26px;border-radius:10px 10px 0 0"><div style="font-size:24px;font-weight:700">Philéole</div><div style="margin-top:5px;color:#dbe7f5">Votre analyse préliminaire</div></div><div style="background:#fff;padding:26px;border-radius:0 0 10px 10px"><p>Bonjour ${safeName},</p><p>Vous trouverez en pièce jointe l’analyse préliminaire réalisée pour <strong>${safeAddress}</strong>.</p>${details ? `<ul style="line-height:1.7">${details}</ul>` : ''}<p style="margin-top:22px;padding:16px;background:#f3f4f1;border-radius:8px;color:#686a5f">Cette simulation préalable et simplifiée ne remplace pas une étude de faisabilité. Les équipes Philéole doivent confirmer le potentiel réel du site avant tout projet.</p><p style="margin-top:24px">Pour approfondir votre projet :<br><strong>Jean-Luc Bodard</strong><br><a href="mailto:jlbodart@phileole.com">jlbodart@phileole.com</a><br>+32 (0)475 24 66 70</p></div></div></body></html>`,
    textContent: `Bonjour ${recipientName},\n\nVous trouverez en pièce jointe l’analyse préliminaire réalisée pour ${address}.\n\nCette simulation préalable et simplifiée ne remplace pas une étude de faisabilité. Les équipes Philéole doivent confirmer le potentiel réel du site avant tout projet.\n\nContact : Jean-Luc Bodard\njlbodart@phileole.com\n+32 (0)475 24 66 70`,
    attachment: [{ content: pdfBase64, name: filename }],
    tags: ['analyse-preliminaire'],
    headers: requestId ? { 'Idempotency-Key': requestId } : undefined
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let response;
  try {
    response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify(message),
      signal: controller.signal
    });
  } catch (error) {
    const timedOut = error && error.name === 'AbortError';
    console.error('Erreur réseau Brevo', timedOut ? 'timeout' : error);
    return reply(timedOut ? 504 : 502, { error: timedOut ? 'Délai d’envoi dépassé' : 'Service d’envoi indisponible' });
  } finally {
    clearTimeout(timeout);
  }

  let result = {};
  try { result = await response.json(); } catch (_) {}
  if (!response.ok) {
    console.error('Erreur Brevo', response.status, result);
    return reply(502, { error: 'Brevo a refusé l’envoi du message' });
  }
  return reply(200, { sent: true, messageId: result.messageId || '' });
};
