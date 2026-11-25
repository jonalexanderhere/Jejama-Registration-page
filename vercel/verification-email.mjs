import {defaultGuidebookUrl} from './event-defaults.mjs';
import nodemailer from 'nodemailer';
import {verificationMessage} from './verification-template.mjs';

export async function readEmailLinks(db) {
  const row = await db.prepare('SELECT content FROM site_content WHERE id = ?').bind(2).first();
  return row ? JSON.parse(row.content) : {};
}

export async function notifyCaptain(db,id) {
  const row = await db.prepare('SELECT team, participants, verification_email_id FROM team_registrations WHERE id = ? AND status = ?').bind(id,'verified').first();
  if (!row) throw new Error('Registration is not verified');
  if (row.verification_email_id && row.verification_email_id !== 'sending') return;
  const {JEJAMA_SMTP_USER:user, JEJAMA_SMTP_PASSWORD:password} = process.env;
  const {twibbon,group} = await readEmailLinks(db);
  if (!user || !password || !twibbon || !group) throw new Error('Email configuration missing');

  const [captain] = JSON.parse(row.participants);
  const settings = await db.prepare('SELECT content FROM site_content WHERE id = ?').bind(1).first();
  const guidebook = JSON.parse(settings?.content || '{}').guidebookUrl || defaultGuidebookUrl;
  const message = verificationMessage({captain:captain.name,team:row.team,twibbon,group,guidebook});
  const claim = await db.prepare("UPDATE team_registrations SET verification_email_id = 'sending' WHERE id = ? AND status = 'verified' AND verification_email_id IS NULL").bind(id).run();
  if (!claim.meta.changes) throw new Error('Email already processing');
  const smtp = nodemailer.createTransport({
    host:'smtp.gmail.com',port:587,secure:false,requireTLS:true,
    auth:{user,pass:password},connectionTimeout:6000,greetingTimeout:6000,socketTimeout:9000,
  });
  let info;
  try {
    info = await smtp.sendMail({
      from:{name:'Jejama CTF',address:user},to:captain.email,
      ...message,
    });
  } catch (error) {
    await db.prepare("UPDATE team_registrations SET verification_email_id = NULL WHERE id = ? AND verification_email_id = 'sending'").bind(id).run();
    throw error;
  }
  await db.prepare('UPDATE team_registrations SET verification_email_id = ? WHERE id = ?').bind(info.messageId,id).run();
}
