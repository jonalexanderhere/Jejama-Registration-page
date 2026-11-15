import {readEmailLinks} from './verification-email.mjs';
const defaultPartners = [
  {id:'jogja', name:'Jogja Cyber Security', category:'media', asset:'/assets/jogja-cyber-security.webp'},
  {id:'csrelated', name:'CSRelated Competitions', category:'media', asset:'/assets/csrelated-competitions.webp'},
];
const partners = content => content.partners ?? [
  ...(content.sponsors ?? []).map(logo => ({...logo, category:'sponsor'})),
  ...defaultPartners,
];
const categoryOptions = category => ['sponsor','media'].map(value =>
  '<option value="'+value+'"'+(value===category?' selected':'')+'>'+ (value==='media'?'Media Partner':'Sponsor')+'</option>').join('');
const logoUrl = logo => logo.asset || '/api/sponsor-logo/'+logo.id;

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
    const content = await readContent(env.DB);
    return Response.json({...content, partners:partners(content)}, {headers});
  }
  if (url.pathname.startsWith('/api/sponsor-logo/') && request.method === 'GET') {
    const id = url.pathname.split('/').pop();
    if (!/^[a-f0-9-]{36}$/.test(id)) return new Response(null,{status:404});
    const content = await readContent(env.DB);
    if (!partners(content).some(sponsor => sponsor.id === id && !sponsor.asset)) return new Response(null,{status:404});
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
    if (body.get('action') === 'email-links') {
      const links = {};
      for (const key of ['twibbon','group']) {
        const value = String(body.get(key) || '').trim();
        let url;
        try { url = new URL(value); } catch { return new Response('Enter both HTTPS links.',{status:400,headers}); }
        if (url.protocol !== 'https:' || url.username || url.password || value.length > 2000) return new Response('Enter both HTTPS links.',{status:400,headers});
        links[key] = url.href;
      }
      await env.DB.prepare('INSERT INTO site_content (id, content) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content').bind(2,JSON.stringify(links)).run();
      return new Response(null,{status:303,headers:{...headers,Location:'/admin/content?emailLinksSaved=1#verification-email'}});
    }
    const previous = await readContent(env.DB);
    const content = {};
    const oldSponsors = partners(previous);
    const category = key => body.get(key) === 'media' ? 'media' : 'sponsor';
    const sponsors = oldSponsors.filter(sponsor => !body.getAll('removeSponsor').includes(sponsor.id))
      .map(sponsor => ({...sponsor, category:body.has('category-'+sponsor.id) ? category('category-'+sponsor.id) : sponsor.category}));
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
      sponsors.push({id,name,category:category('sponsorCategory')});
    }
    content.partners=sponsors;
    await env.DB.prepare('INSERT INTO site_content (id, content) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content')
      .bind(1, JSON.stringify(content)).run();
    await Promise.allSettled(oldSponsors.filter(old=>!old.asset && !sponsors.some(sponsor=>sponsor.id===old.id)).map(old=>env.deleteSponsor('sponsors/'+old.id)));
    return new Response(null,{status:303,headers:{...headers,Location:'/admin/content?saved=1'}});
  }
  if (request.method !== 'GET') return new Response(null,{status:405,headers});
  const content = await readContent(env.DB);
  const emailLinks = await readEmailLinks(env.DB);
  const control = (key,label) => '<label>'+label+'<textarea maxlength="1000" name="'+key+'">'+escape(content[key]||'')+'</textarea></label>';
  const controls = Object.entries(fields).filter(([key])=>! /^(stage|date)/.test(key)).map(([key,label])=>control(key,label)).join('');
  const dates = [1,2,3,4].map(i=>'<fieldset><legend>Stage '+i+'</legend>'+control('stage'+i,'Title')+control('date'+i,'Fallback date text')+
    '<label>Event date<input type="date" name="scheduled'+i+'" value="'+escape(content['scheduled'+i]||'')+'"></label></fieldset>').join('');
  const sponsors = partners(content).map(logo => '<fieldset><legend>'+escape(logo.name)+'</legend><img width="110" height="70" src="'+logoUrl(logo)+'" alt=""><label>Category<select name="category-'+logo.id+'">'+categoryOptions(logo.category)+'</select></label><label><span><input type="checkbox" name="removeSponsor" value="'+logo.id+'"> Remove on publish</span></label></fieldset>').join('');
  return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jejama CTF | Site Content</title><link rel="stylesheet" href="/admin-theme.css">'+
    '<main class="content-dashboard"><nav class="admin-nav" aria-label="Admin navigation"><a class="admin-brand" href="/admin"><img src="/assets/logo.webp" width="36" height="36" alt=""> Jejama CTF</a><a href="/admin">Registrations</a><a href="/admin/content" aria-current="page">Website Content</a><a class="view-site" href="/">View website ↗</a><form method="post" action="/admin/logout"><button>Sign out</button></form></nav>'+
    '<header class="workspace-heading"><h1>Website Content</h1><p>Update your event website and captain email links.</p></header>'+
    '<div class="workspace-layout"><aside class="workspace-menu"><nav aria-label="Content sections"><a href="#page-text">Page copy</a><a href="#event-timeline">Timeline</a><a href="#event-guidebook">Guidebook</a><a href="#event-partnership">Partnership</a><a href="#verification-email">Verification email</a></nav></aside><div class="workspace-body">'+
    (url.searchParams.has('saved')?'<p class="notice" role="status">Changes published.</p>':'')+
    '<form method="post" enctype="multipart/form-data" class="content-form">'+
    '<section class="workspace-card" id="page-text"><h2>Page copy</h2><p class="muted">Leave a field empty to use the original site copy.</p><div class="editor-grid">'+controls+'</div></section>'+
    '<section class="workspace-card" id="event-timeline"><h2>Timeline</h2><p class="muted">Set a calendar date or use custom date text for each stage.</p><div class="editor-grid">'+dates+'</div></section>'+
    '<section class="workspace-card" id="event-guidebook"><h2>Guidebook</h2><label>Google Drive link<input type="url" name="guidebookUrl" value="'+escape(content.guidebookUrl||'')+'" placeholder="https://drive.google.com/…"></label></section>'+
    '<section class="workspace-card" id="event-partnership"><h2>Partnership</h2><div class="editor-grid partner-grid">'+(sponsors||'<p class="muted">No partner logos yet.</p>')+'</div>'+
    '<fieldset><legend>Add partner</legend><div class="editor-grid"><label>Category<select name="sponsorCategory">'+categoryOptions('sponsor')+'</select></label><label>Partner name<input name="sponsorName" maxlength="100"></label></div><label>Logo <span class="muted">PNG, JPEG or WebP · up to 2 MB</span><input type="file" name="sponsorLogo" accept="image/png,image/jpeg,image/webp"></label></fieldset></section>'+
    '<div class="publish-bar"><button>Publish changes</button></div></form>'+
    '<section class="workspace-card" id="verification-email"><h2>Verification email</h2><p class="muted">These links are shared only with the team captain.</p>'+
    (url.searchParams.has('emailLinksSaved')?'<p class="notice" role="status">Email links saved.</p>':'')+
    '<form method="post"><input type="hidden" name="action" value="email-links">'+
    '<label>Twibbon link<input required type="url" name="twibbon" maxlength="2000" value="'+escape(emailLinks.twibbon||'')+'"></label>'+
    '<label>Participant group link<input required type="url" name="group" maxlength="2000" value="'+escape(emailLinks.group||'')+'"></label>'+
    '<button>Save email links</button></form></section></div></div></main></html>',{
      headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"},
    });
}
