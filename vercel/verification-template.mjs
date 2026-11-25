const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[char]);

function button(label, link, background, color) {
  const url = new URL(link);
  if (url.protocol !== 'https:') throw new Error('Email links must use HTTPS');
  return '<a href="'+escapeHtml(url.href)+'" style="display:inline-block;background:'+background+';color:'+color+';padding:13px 20px;border-radius:8px;font-weight:bold;text-decoration:none">'+label+'</a>';
}

export function verificationMessage({captain,team,twibbon,group}) {
  const text = [
    'JEJAMA CTF | Pendaftaran terverifikasi', '', 'Halo '+captain+',',
    'Pembayaran telah diverifikasi dan tim '+team+' resmi terdaftar sebagai peserta Jejama CTF.', '',
    'Gunakan Twibbon: '+twibbon, 'Gabung Grup Peserta: '+group, '',
    'Sampai bertemu di Jejama CTF,', 'Panitia Jejama CTF',
  ].join('\n');
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#edf4fa;color:#102e4c;font-family:Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#edf4fa"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #cfdae4;border-radius:16px">
<tr><td style="padding:28px 24px;background:#0b2b53;color:#fff7e5;border-radius:15px 15px 0 0;border-bottom:4px solid #ffd184">
<p style="margin:0 0 12px;color:#ffd184;font-size:13px;font-weight:bold;letter-spacing:2px">JEJAMA CTF</p>
<h1 style="margin:0;font-size:30px;line-height:1.2">Pendaftaran terverifikasi</h1></td></tr>
<tr><td style="padding:24px;line-height:1.6;font-size:16px">
<p style="margin:0 0 12px">Halo ${escapeHtml(captain)},</p>
<p style="margin:0 0 18px">Pembayaran Anda telah diverifikasi dan tim Anda resmi terdaftar sebagai peserta Jejama CTF.</p>
<p style="margin:0 0 24px;padding:14px 16px;background:#eef5fb;border-radius:8px;overflow-wrap:anywhere"><span style="color:#506579">Tim</span><br><strong>${escapeHtml(team)}</strong></p>
<h2 style="margin:0 0 14px;font-size:20px">Langkah selanjutnya</h2>
<p style="margin:0 0 10px">${button('Gunakan Twibbon',twibbon,'#ffd184','#102e4c')}</p>
<p style="margin:0 0 24px">${button('Gabung Grup Peserta',group,'#123d68','#ffffff')}</p>
<p style="margin:0">Sampai bertemu di Jejama CTF,<br><strong>Panitia Jejama CTF</strong></p>
</td></tr></table>
</td></tr></table></body></html>`;
  return {subject:'Pendaftaran Jejama CTF Anda telah terverifikasi',text,html};
}
