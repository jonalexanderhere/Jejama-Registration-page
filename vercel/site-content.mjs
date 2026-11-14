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
  if (url.pathname.startsWith('/api/sponsor-logo/') && request.method === 'GET') {
    const id = url.pathname.split('/').pop();
    if (!/^[a-f0-9-]{36}$/.test(id)) return new Response(null,{status:404});
    const content = await readContent(env.DB);
    if (!content.sponsors?.some(sponsor => sponsor.id === id)) return new Response(null,{status:404});
    const image = await env.getSponsor('sponsors/' + id);
    return image?.stream ? new Response(image.stream,{headers:{...headers,'Content-Type':image.blob.contentType}}) : new Response(null,{status:404});
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
    const previous = await readContent(env.DB);
    const content = {};
    const oldSponsors = previous.sponsors || [];
    const sponsors = oldSponsors.filter(sponsor => !body.getAll('removeSponsor').includes(sponsor.id));
    for (const key of Object.keys(fields)) {
      const value = body.get(key);
      if (typeof value !== 'string' || value.length > 1000) return new Response('Invalid content.', {status:400,headers});
      if (value.trim()) content[key] = value.trim();
    }
    const link = String(body.get('guidebookUrl') || '').trim();
    if (link) {
      let drive;
      try { drive = new URL(link); } catch { return new Response('Enter a valid Google Drive link.',{status:400,headers}); }
      if (drive.origin !== 'https://drive.google.com' || drive.username || drive.password || link.length > 1000) return new Response('Enter a valid Google Drive link.',{status:400,headers});
      content.guidebookUrl = drive.href;
    }
    for (let stage=1; stage<=4; stage++) {
      const key='scheduled'+stage;
      const value=String(body.get(key)||'');
      if (!value) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value) return new Response('Enter a valid timeline date.',{status:400,headers});
      content[key]=value;
    }
    const logo=body.get('sponsorLogo');
    if (logo instanceof File && logo.size) {
      const name=String(body.get('sponsorName')||'').trim();
      const bytes=new Uint8Array(await logo.arrayBuffer());
      const signature=(prefix)=>prefix.every((b,i)=>bytes[i]===b);
      const type=signature([137,80,78,71,13,10,26,10])?'image/png':signature([255,216,255])?'image/jpeg':signature([82,73,70,70]) && [87,69,66,80].every((b,i)=>bytes[i+8]===b)?'image/webp':null;
      if (!type || bytes.length>2*1024*1024 || !name || name.length>100 || sponsors.length>=20) return new Response('Enter a sponsor name and select a PNG, JPEG or WebP up to 2 MB. Maximum 20 sponsors.',{status:400,headers});
      const id=crypto.randomUUID();
      await env.saveSponsor('sponsors/'+id,bytes,type);
      sponsors.push({id,name});
    }
    content.sponsors=sponsors;
    await env.DB.prepare('INSERT INTO site_content (id, content) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content')
      .bind(1, JSON.stringify(content)).run();
    await Promise.allSettled(oldSponsors.filter(old=>!sponsors.some(sponsor=>sponsor.id===old.id)).map(old=>env.deleteSponsor('sponsors/'+old.id)));
    return new Response(null,{status:303,headers:{...headers,Location:'/admin/content?saved=1'}});
  }
  if (request.method !== 'GET') return new Response(null,{status:405,headers});
  const content = await readContent(env.DB);
  const control = (key,label) => '<label>'+label+'<textarea maxlength="1000" name="'+key+'">'+escape(content[key]||'')+'</textarea></label>';
  const controls = Object.entries(fields).filter(([key])=>! /^(stage|date)/.test(key)).map(([key,label])=>control(key,label)).join('');
  const dates = [1,2,3,4].map(i=>'<fieldset><legend>Stage '+i+'</legend>'+control('stage'+i,'Title')+control('date'+i,'Fallback date text')+
    '<label>Event date<input type="date" name="scheduled'+i+'" value="'+escape(content['scheduled'+i]||'')+'"></label></fieldset>').join('');
  const sponsors = (content.sponsors||[]).map(({id,name})=>'<label><img width="110" height="70" src="/api/sponsor-logo/'+id+'" alt="">'+escape(name)+'<span><input type="checkbox" name="removeSponsor" value="'+id+'"> Remove</span></label>').join('');
  return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jejama CTF | Site Content</title><link rel="stylesheet" href="/admin-theme.css">'+
    '<main><nav><a href="/admin">Team registrations</a><a href="/">View website</a><form method="post" action="/admin/logout"><button>Sign out</button></form></nav><h1>Website Content</h1>'+
    (url.searchParams.has('saved')?'<p class="notice" role="status">Changes published.</p>':'')+
    '<form method="post" enctype="multipart/form-data"><fieldset><legend>Page text</legend>'+controls+'</fieldset><h2>Timeline</h2><div class="editor-grid">'+dates+'</div>'+
    '<fieldset><legend>Guidebook</legend><label>Google Drive link<input type="url" name="guidebookUrl" value="'+escape(content.guidebookUrl||'')+'" placeholder="https://drive.google.com/…"></label></fieldset>'+
    '<fieldset><legend>Sponsors</legend>'+sponsors+'<label>Sponsor name<input name="sponsorName" maxlength="100"></label><label>Logo · PNG, JPEG or WebP up to 2 MB<input type="file" name="sponsorLogo" accept="image/png,image/jpeg,image/webp"></label></fieldset>'+
    '<button>Publish changes</button></form></main></html>',{
      headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"},
    });
}
