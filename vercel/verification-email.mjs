export async function notifyCaptain(db,id) {
  const row = await db.prepare('SELECT team, participants, verification_email_id FROM team_registrations WHERE id = ? AND status = ?').bind(id,'verified').first();
  if (!row || row.verification_email_id) return;
  const {RESEND_API_KEY:key, JEJAMA_EMAIL_FROM:from, JEJAMA_TWIBBON_URL:twibbon, JEJAMA_GROUP_URL:group} = process.env;
  const validLink = value => {
    try { return new URL(value).protocol === 'https:'; } catch { return false; }
  };
  if (!key || !from || !validLink(twibbon) || !validLink(group)) throw new Error('Email configuration missing');
  const [captain] = JSON.parse(row.participants);
  const response = await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'verified/'+id},
    signal:AbortSignal.timeout(8000),
    body:JSON.stringify({
      from,to:[captain.email],subject:'Your Jejama CTF registration is verified',
      text:['Hi '+captain.name+',','','Your team, '+row.team+', has been verified.','','Twibbon: '+twibbon,'Participant group: '+group,'','See you at Jejama CTF!'].join('\n'),
    }),
  });
  if (!response.ok) throw new Error('Email service rejected request');
  const {id:emailId} = await response.json();
  if (!emailId) throw new Error('Email service did not confirm acceptance');
  await db.prepare('UPDATE team_registrations SET verification_email_id = ? WHERE id = ?').bind(emailId,id).run();
}
