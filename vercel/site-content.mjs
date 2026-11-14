const fields = {
  tagline: 'Hero subtitle', intro: 'Hero description', challenge: 'Challenges announcement',
  prize: 'Prize Pool announcement', sponsor: 'Sponsorship description', guidebook: 'Guidebook announcement',
  closing: 'Closing headline',
  stage1: 'Stage 1 title', date1: 'Stage 1 date',
  stage2: 'Stage 2 title', date2: 'Stage 2 date',
  stage3: 'Stage 3 title', date3: 'Stage 3 date',
  stage4: 'Stage 4 title', date4: 'Stage 4 date',
};

const headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'};
const escape = value => value.replace(/[&<>"']/g, ch => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[ch]);

async function readContent(db) {
  const row = await db.prepare('SELECT content FROM site_content WHERE id = ?').bind(1).first();
  return row ? JSON.parse(row.content) : {};
}

export async function siteContent(request, env, url) {
  if (url.pathname === '/api/site-content' && request.method === 'GET') {
    return Response.json(await readContent(env.DB), {headers});
  }
  if (url.pathname !== '/admin/content') return new Response(null, {status:404});
  if (!env.authorizeAdmin(request)) {
    return new Response('Organizer sign-in required.', {
      status:401, headers:{...headers,'WWW-Authenticate':'Basic realm="Jejama Organizers", charset="UTF-8"'},
    });
  }
  if (request.method === 'POST') {
    if (request.headers.get('origin') !== url.origin) return new Response('Invalid origin.', {status:403,headers});
    const body = await request.formData();
    const content = {};
    for (const key of Object.keys(fields)) {
      const value = body.get(key);
      if (typeof value !== 'string' || value.length > 1000) return new Response('Invalid content.', {status:400,headers});
      if (value.trim()) content[key] = value.trim();
    }
    await env.DB.prepare('INSERT INTO site_content (id, content) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content')
      .bind(1, JSON.stringify(content)).run();
    return new Response(null,{status:303,headers:{...headers,Location:'/admin/content?saved=1'}});
  }
  if (request.method !== 'GET') return new Response(null,{status:405,headers});
  const content = await readContent(env.DB);
  const controls = Object.entries(fields).map(([key,label]) =>
    '<label>' + label + '<textarea maxlength="1000" name="' + key + '">' + escape(content[key] || '') + '</textarea></label>').join('');
  return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jejama CTF | Site Content</title>' +
    '<style>body{font:1rem/1.5 system-ui;color:#0b2848;max-width:50rem;margin:2rem auto;padding:0 1rem}label{display:grid;gap:.3rem;margin:1rem 0}textarea{font:inherit;padding:.5rem}button{font:inherit;padding:.6rem 1.3rem}</style>' +
    '<main><a href="/admin">Team registrations</a> · <a href="/">View website</a><h1>Website Content</h1><p>Leave a field blank to use the original website text.</p>' +
    (url.searchParams.has('saved') ? '<p role="status">Changes published.</p>' : '') +
    '<form method="post">' + controls + '<button>Publish changes</button></form></main></html>', {
      headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"},
    });
}
