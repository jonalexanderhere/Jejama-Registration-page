import {defaultGuidebookUrl,defaultTiers} from './event-defaults.mjs';
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
  '<option value="'+value+'"'+(value===category?' selected':'')+'>'+ (value==='media'?'Mitra Media':'Sponsor')+'</option>').join('');
const logoUrl = logo => logo.asset || '/api/sponsor-logo/'+logo.id;

const fields = {
  tagline: 'Subjudul utama', intro: 'Deskripsi utama', challenge: 'Pengumuman tantangan',
  prize: 'Pengumuman hadiah', sponsor: 'Deskripsi sponsorship', guidebook: 'Pengumuman buku panduan',
  closing: 'Judul penutup',
  stage1: 'Judul tahap 1', date1: 'Tanggal tahap 1',
  stage2: 'Judul tahap 2', date2: 'Tanggal tahap 2',
  stage3: 'Judul tahap 3', date3: 'Tanggal tahap 3',
  stage4: 'Judul tahap 4', date4: 'Tanggal tahap 4',
};

const headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'};
const escape = value => value.replace(/[&<>"']/g, ch => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[ch]);

async function readContent(db) {
  const row = await db.prepare('SELECT content FROM site_content WHERE id = ?').bind(1).first();
  return {guidebookUrl:defaultGuidebookUrl,sponsorshipTiers:defaultTiers,...(row ? JSON.parse(row.content) : {})};
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
        try { url = new URL(value); } catch { return new Response('Isi kedua tautan HTTPS.',{status:400,headers}); }
        if (url.protocol !== 'https:' || url.username || url.password || value.length > 2000) return new Response('Isi kedua tautan HTTPS.',{status:400,headers});
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
      if (typeof value !== 'string' || value.length > 1000) return new Response('Konten tidak valid.', {status:400,headers});
      if (value.trim()) content[key] = value.trim();
    }
    const proposal = String(body.get('proposalUrl') || '').trim();
    if (proposal) {
      let url;
      try { url = new URL(proposal); } catch { return new Response('Isi tautan proposal HTTPS yang valid.',{status:400,headers}); }
      if (url.protocol!=='https:' || url.username || url.password || proposal.length>2000) return new Response('Isi tautan proposal HTTPS yang valid.',{status:400,headers});
      content.proposalUrl=url.href;
    }
    const link = String(body.get('guidebookUrl') || '').trim();
    if (link) {
      let drive;
      try { drive = new URL(link); } catch { return new Response('Enter a valid Tautan Google Drive.',{status:400,headers}); }
      if (!['https://drive.google.com','https://docs.google.com'].includes(drive.origin) || drive.username || drive.password || link.length > 1000) return new Response('Enter a valid Tautan Google Drive.',{status:400,headers});
      content.guidebookUrl = drive.href;
    }
    for (let stage=1; stage<=4; stage++) {
      const key='scheduled'+stage;
      const value=String(body.get(key)||'');
      if (!value) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value) return new Response('Isi tanggal jadwal yang valid.',{status:400,headers});
      content[key]=value;
    }
    const logo=body.get('sponsorLogo');
    if (logo instanceof File && logo.size) {
      const name=String(body.get('sponsorName')||'').trim();
      const bytes=new Uint8Array(await logo.arrayBuffer());
      const signature=(prefix)=>prefix.every((b,i)=>bytes[i]===b);
      const type=signature([137,80,78,71,13,10,26,10])?'image/png':signature([255,216,255])?'image/jpeg':signature([82,73,70,70]) && [87,69,66,80].every((b,i)=>bytes[i+8]===b)?'image/webp':null;
      if (!type || bytes.length>2*1024*1024 || !name || name.length>100 || sponsors.length>=20) return new Response('Enter a sponsor name and select a PNG, JPEG or WebP maksimal 2 MB. Maximum 20 sponsors.',{status:400,headers});
      const id=crypto.randomUUID();
      await env.saveSponsor('sponsors/'+id,bytes,type);
      sponsors.push({id,name,category:category('sponsorKategori')});
    }
    content.sponsorshipTiers = defaultTiers.map((tier,i)=>{
      const amount=String(body.get('tierAmount'+i)||tier.amount).trim();
      const benefit=String(body.get('tierBenefit'+i)||tier.benefit).trim();
      if (!/^[0-9.]{1,16}$/.test(amount) || benefit.length>1000) throw new Error('Paket sponsorship tidak valid');
      return {...tier,amount,benefit};
    });
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
  const tiers = (content.sponsorshipTiers || defaultTiers).map((tier,i)=>'<fieldset><legend>'+tier.name+' · '+tier.position+'</legend><label>Kontribusi mulai dari (Rp)<input name="tierAmount'+i+'" required pattern="[0-9.]+" maxlength="16" value="'+escape(tier.amount)+'"></label><label>Manfaat<textarea name="tierBenefit'+i+'" maxlength="1000">'+escape(tier.benefit)+'</textarea></label></fieldset>').join('');
  const dates = [1,2,3,4].map(i=>'<fieldset><legend>Tahap '+i+'</legend>'+control('stage'+i,'Judul')+control('date'+i,'Keterangan tanggal')+
    '<label>Tanggal kegiatan<input type="date" name="scheduled'+i+'" value="'+escape(content['scheduled'+i]||'')+'"></label></fieldset>').join('');
  const sponsors = partners(content).map(logo => '<fieldset><legend>'+escape(logo.name)+'</legend><img width="110" height="70" src="'+logoUrl(logo)+'" alt=""><label>Kategori<select name="category-'+logo.id+'">'+categoryOptions(logo.category)+'</select></label><label><span><input type="checkbox" name="removeSponsor" value="'+logo.id+'"> Hapus saat diterbitkan</span></label></fieldset>').join('');
  return new Response('<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jejama CTF | Site Content</title><link rel="stylesheet" href="/admin-theme.css">'+
    '<main class="content-dashboard"><nav class="admin-nav" aria-label="Navigasi admin"><a class="admin-brand" href="/admin"><img src="/assets/logo.webp" width="36" height="36" alt=""> Jejama CTF</a><a href="/admin">Pendaftaran</a><a href="/admin/content" aria-current="page">Konten Situs</a><a class="view-site" href="/">Lihat situs ↗</a><form method="post" action="/admin/logout"><button>Keluar</button></form></nav>'+
    '<header class="workspace-heading"><h1>Konten Situs</h1><p>Kelola informasi kegiatan dan tautan email ketua tim.</p></header>'+
    '<div class="workspace-layout"><aside class="workspace-menu"><nav aria-label="Bagian konten"><a href="#page-text">Teks halaman</a><a href="#event-timeline">Jadwal</a><a href="#event-guidebook">Buku Panduan</a><a href="#event-partnership">Paket &amp; Mitra</a><a href="#verification-email">Email verifikasi</a></nav></aside><div class="workspace-body">'+
    (url.searchParams.has('saved')?'<p class="notice" role="status">Perubahan berhasil diterbitkan.</p>':'')+
    '<form method="post" enctype="multipart/form-data" class="content-form">'+
    '<section class="workspace-card" id="page-text"><h2>Teks halaman</h2><p class="muted">Kosongkan kolom untuk menggunakan teks bawaan situs.</p><div class="editor-grid">'+controls+'</div></section>'+
    '<section class="workspace-card" id="event-timeline"><h2>Jadwal</h2><p class="muted">Tentukan tanggal atau gunakan keterangan tanggal untuk setiap tahap.</p><div class="editor-grid">'+dates+'</div></section>'+
    '<section class="workspace-card" id="event-guidebook"><h2>Buku Panduan</h2><p class="muted">Panduan resmi peserta ditampilkan di situs dan email verifikasi.</p><label>Tautan Google Docs atau Drive<input type="url" name="guidebookUrl" value="'+escape(content.guidebookUrl||'')+'" placeholder="https://drive.google.com/…"></label></section>'+
    '<section class="workspace-card" id="event-partnership"><h2>Kemitraan</h2><div class="editor-grid">'+tiers+'</div><label>Tautan proposal sponsorship<input type="url" name="proposalUrl" maxlength="2000" value="'+escape(content.proposalUrl||'')+'"></label><div class="editor-grid partner-grid">'+(sponsors||'<p class="muted">Belum ada logo mitra.</p>')+'</div>'+
    '<fieldset><legend>Tambah mitra</legend><div class="editor-grid"><label>Kategori<select name="sponsorKategori">'+categoryOptions('sponsor')+'</select></label><label>Nama mitra<input name="sponsorName" maxlength="100"></label></div><label>Logo <span class="muted">PNG, JPEG or WebP · maksimal 2 MB</span><input type="file" name="sponsorLogo" accept="image/png,image/jpeg,image/webp"></label></fieldset></section>'+
    '<div class="publish-bar"><button>Terbitkan perubahan</button></div></form>'+
    '<section class="workspace-card" id="verification-email"><h2>Email verifikasi</h2><p class="muted">Tautan ini hanya dikirim kepada ketua tim.</p>'+
    (url.searchParams.has('emailLinksSaved')?'<p class="notice" role="status">Tautan email berhasil disimpan.</p>':'')+
    '<form method="post"><input type="hidden" name="action" value="email-links">'+
    '<label>Tautan Twibbon<input required type="url" name="twibbon" maxlength="2000" value="'+escape(emailLinks.twibbon||'')+'"></label>'+
    '<label>Tautan grup peserta<input required type="url" name="group" maxlength="2000" value="'+escape(emailLinks.group||'')+'"></label>'+
    '<button>Simpan tautan email</button></form></section></div></div></main></html>',{
      headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"},
    });
}
