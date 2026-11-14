const limit = 5 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const privateHeaders = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'};
const json = (data, status = 200) => Response.json(data, {status, headers: privateHeaders});
const badRequest = (error, status = 400) => json({error}, status);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

function proofType(bytes) {
  const startsWith = (signature) => signature.every((byte, index) => bytes[index] === byte);
  if (startsWith([255, 216, 255])) return 'image/jpeg';
  if (startsWith([137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png';
  if (startsWith([37, 80, 68, 70, 45])) return 'application/pdf';
  return null;
}

export async function register(request, env) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.startsWith('multipart/form-data;')) return badRequest('Submit the registration form with a payment proof.', 415);
  if (Number(request.headers.get('content-length')) > limit + 65536) return badRequest('Payment proof must be 5 MB or smaller.', 413);

  let data;
  try {
    const reader = request.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit + 65536) {
        reader.releaseLock();
        return badRequest('Payment proof must be 5 MB or smaller.', 413);
      }
      chunks.push(value);
    }
    data = await new Response(new Blob(chunks), {headers: {'Content-Type': contentType}}).formData();
  } catch {
    return badRequest('Could not read the registration form.');
  }

  const field = (key) => {
    const value = data.get(key);
    return typeof value === 'string' ? value.trim() : '';
  };
  const id = field('submissionId').toLowerCase();
  const team = field('team');
  const participants = ['captain', 'member2', 'member3'].map(role => ({
    name: field(role + 'Name'), email: field(role + 'Email').toLowerCase(),
  }));
  if (!uuid.test(id) || !team || team.length > 80 || participants.some(({name, email}) =>
    !name || name.length > 100 || email.length > 254 || !emailPattern.test(email))) {
    return badRequest('Enter a team name and valid names and emails for all three participants.');
  }
  if (new Set(participants.map(({email}) => email)).size !== 3) {
    return badRequest('Enter a different email address for each participant.');
  }
  const proof = env.readProof ? await env.readProof(id) : data.get('proof');
  if ((!env.readProof && data.getAll('proof').length !== 1) || !(proof instanceof File) || !proof.size || proof.size > limit) {
    return badRequest('Attach one JPEG, PNG, or PDF file up to 5 MB.');
  }
  const bytes = new Uint8Array(await proof.arrayBuffer());
  const type = proofType(bytes);
  if (!type || proof.type !== type) return badRequest('Payment proof must be a JPEG, PNG, or PDF.');

  const roster = JSON.stringify(participants);
  const fingerprint = await crypto.subtle.digest('SHA-256', await new Blob([JSON.stringify([team, roster]), bytes]).arrayBuffer());
  const hash = Array.from(new Uint8Array(fingerprint), byte => byte.toString(16).padStart(2, '0')).join('');
  const key = id + '/' + hash;
  const lookup = env.DB.prepare('SELECT proof_key FROM team_registrations WHERE id = ?').bind(id);
  const existing = await lookup.first();
  if (existing) return existing.proof_key === key ? json({id}) : badRequest('This registration code belongs to a different submission.', 409);

  await env.BUCKET.put(key, bytes, {httpMetadata: {contentType: type}});
  await env.DB.prepare('INSERT INTO team_registrations (id, team, participants, proof_key) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
    .bind(id, team, roster, key).run();
  const saved = await lookup.first();
  if (saved?.proof_key !== key) {
    await env.BUCKET.delete(key);
    return badRequest('This registration code belongs to a different submission.', 409);
  }
  return json({id}, 201);
}

export async function admin(request, env, url) {
  const user = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  const allowed = (env.ADMIN_EMAILS || '').toLowerCase().split(',').map(item => item.trim()).filter(Boolean);
  if (env.authorizeAdmin && !env.authorizeAdmin(request)) {
    return new Response('Organizer sign-in required.', {status: 401, headers: {...privateHeaders, 'WWW-Authenticate': 'Basic realm="Jejama Organizers", charset="UTF-8"'}});
  }
  if (!env.authorizeAdmin && !user && request.method === 'GET' && url.pathname === '/admin') {
    return new Response(null, {status: 302, headers: {...privateHeaders, Location: '/signin-with-chatgpt?returnTo=%2Fadmin'}});
  }
  if (!env.authorizeAdmin && (!user || !allowed.includes(email))) return badRequest('Organizer access required.', 403);

  if (url.pathname === '/admin' && request.method === 'GET') {
    const {results} = await env.DB.prepare('SELECT id, team, participants, status, created_at FROM team_registrations ORDER BY created_at DESC, id DESC LIMIT 51 OFFSET ?')
      .bind(50 * Math.min(100000, Math.max(0, Math.trunc(Number(url.searchParams.get('page')) || 0)))).all();
    const page = Math.min(100000, Math.max(0, Math.trunc(Number(url.searchParams.get('page')) || 0)));
    const rows = results.slice(0, 50).map(row => {
      const id = encodeURIComponent(row.id);
      const participants = JSON.parse(row.participants).map(({name, email}) =>
        '<li>' + escapeHtml(name) + ' · ' + escapeHtml(email) + '</li>').join('');
      return '<article><h2>' + escapeHtml(row.team) + '</h2><p>' + escapeHtml(row.id) + ' · ' + escapeHtml(row.created_at) +
        ' UTC · <strong>' + escapeHtml(row.status) + '</strong></p><ol>' + participants + '</ol><p><a href="/admin/proof/' + id +
        '">Download payment proof</a></p><form method="post" action="/admin/status/' + id +
        '"><button name="status" value="verified">Mark Verified</button> <button name="status" value="rejected">Mark Rejected</button></form></article>';
    }).join('');
    const editorLink = env.authorizeAdmin ? ' <a href="/admin/content">Edit website content</a><form method="post" action="/admin/logout"><button>Sign out</button></form>' : '';
    return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jejama CTF | Organizer Panel</title>' +
      '<style>body{font:1rem/1.5 system-ui;margin:2rem auto;padding:0 1rem;max-width:55rem;color:#0a2e46}article{border-top:1px solid #9db4c3;padding:1rem 0;overflow-wrap:anywhere}button{padding:.4rem .65rem}nav{display:flex;gap:1rem}</style>' +
      (env.authorizeAdmin ? '<link rel="stylesheet" href="/admin-theme.css">' : '') +
      '<main><nav><a href="/">Back to Jejama CTF</a>' + editorLink + '</nav><h1>Team Registrations</h1>' + (rows || '<p>No registrations on this page.</p>') + '<nav>' +
      (page ? '<a href="/admin?page=' + (page - 1) + '">Previous</a>' : '') +
      (results.length > 50 ? '<a href="/admin?page=' + (page + 1) + '">Next</a>' : '') + '</nav></main></html>',
    {headers: {...privateHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});
  }

  const route = /^\/admin\/(proof|status)\/([^/]+)$/.exec(url.pathname);
  if (!route || !uuid.test(route[2])) return badRequest('Not found.', 404);
  const [, action, id] = route;
  if (action === 'proof' && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT proof_key FROM team_registrations WHERE id = ?').bind(id).first();
    const proof = row && await env.BUCKET.get(row.proof_key);
    if (!proof) return badRequest('Payment proof not found.', 404);
    const extension = {'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf'}[proof.httpMetadata?.contentType] || 'bin';
    return new Response(proof.body, {headers: {...privateHeaders, 'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="payment-proof-' + id + '.' + extension + '"'}});
  }
  if (action === 'status' && request.method === 'POST') {
    if (request.headers.get('origin') !== url.origin) return badRequest('Invalid request origin.', 403);
    const {status} = Object.fromEntries(await request.formData());
    if (!['verified', 'rejected'].includes(status)) return badRequest('Choose Verified or Rejected.');
    const result = await env.DB.prepare('UPDATE team_registrations SET status = ? WHERE id = ?').bind(status, id).run();
    if (!result.meta.changes) return badRequest('Registration not found.', 404);
    return new Response(null, {status: 303, headers: {...privateHeaders, Location: '/admin'}});
  }
  return badRequest('Method not allowed.', 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/registrations') {
        if (request.method === 'POST') return await register(request, env);
        return badRequest('Method not allowed.', 405);
      }
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return await admin(request, env, url);
      const asset = assets[url.pathname === '/' ? '/index.html' : url.pathname];
      if (!asset || !['GET', 'HEAD'].includes(request.method)) return badRequest('Not found.', 404);
      const [type, encoded] = asset;
      return new Response(request.method === 'HEAD' ? null : Uint8Array.from(atob(encoded), char => char.charCodeAt(0)), {
        headers: {'Content-Type': type, 'X-Content-Type-Options': 'nosniff'},
      });
    } catch (error) {
      console.error('Jejama request failed:', error.name);
      return badRequest('The service is temporarily unavailable. Please try again.', 503);
    }
  },
};
