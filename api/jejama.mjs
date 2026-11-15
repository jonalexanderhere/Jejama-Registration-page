import {notifyCaptain} from '../vercel/verification-email.mjs';
import {authorizeAdmin,adminLogin} from '../vercel/admin-auth.mjs';
import {siteContent} from '../vercel/site-content.mjs';
import {neon} from '@neondatabase/serverless';
import {get, put, del} from '@vercel/blob';
import {generateClientTokenFromReadWriteToken} from '@vercel/blob/client';
import {register, admin} from '../worker/index.mjs';

const types = ['image/jpeg', 'image/png', 'application/pdf'];
const limit = 5 * 1024 * 1024;
const privateOptions = {access: 'private'};
const pendingPath = id => 'pending/' + id;
const savedPath = key => 'proofs/' + key;
let schema;

function database() {
  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  schema ??= Promise.all([sql.query(`CREATE TABLE IF NOT EXISTS team_registrations (
    id TEXT PRIMARY KEY, team TEXT NOT NULL, participants TEXT NOT NULL,
    proof_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected')),
    created_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')
  )`), sql.query('CREATE TABLE IF NOT EXISTS site_content (id INTEGER PRIMARY KEY, content TEXT NOT NULL)')]).then(() => sql.query('ALTER TABLE team_registrations ADD COLUMN IF NOT EXISTS verification_email_id TEXT')).catch(error => { schema = undefined; throw error; });
  return {
    prepare(query) {
      let index = 0;
      const statement = query.replace(/\?/g, () => '$' + ++index);
      return { bind(...args) {
        const run = async options => { await schema; return sql.query(statement, args, options); };
        return {
          first: async () => (await run())[0],
          all: async () => ({results: await run()}),
          run: async () => ({meta: {changes: (await run({fullResults: true})).rowCount}}),
        };
      }};
    },
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/proof-token' && request.method === 'POST') {
        if (request.headers.get('origin') !== url.origin) return new Response(null, {status: 403});
        const {submissionId, type} = await request.json();
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(submissionId) || !types.includes(type)) return new Response(null, {status: 400});
        const pathname = pendingPath(submissionId);
        const token = await generateClientTokenFromReadWriteToken({
          pathname, allowedContentTypes: [type], maximumSizeInBytes: limit,
          validUntil: Date.now() + 120000, allowOverwrite: true, addRandomSuffix: false,
        });
        return Response.json({token, pathname}, {headers: {'Cache-Control': 'no-store'}});
      }

      if (url.pathname === '/admin/login' || url.pathname === '/admin/logout') return await adminLogin(request,url);
      if ((url.pathname === '/admin' || url.pathname.startsWith('/admin/')) && !authorizeAdmin(request)) {
        return new Response(null,{status:303,headers:{Location:'/admin/login','Cache-Control':'no-store'}});
      }
      const env = {
        get DB() { return database(); },
        authorizeAdmin,
        async deletePendingProof(id) { await del(pendingPath(id)); },
        notifyCaptain(id) { return notifyCaptain(database(),id); },
        async saveSponsor(path, data, type) {
          await put(path, data, {...privateOptions, contentType:type});
        },
        async getSponsor(path) { return get(path, privateOptions); },
        async deleteSponsor(path) { await del(path); },
        async readProof(id) {
          const file = await get(pendingPath(id), privateOptions);
          if (!file?.stream || file.blob.size > limit) return null;
          const bytes = await new Response(file.stream).arrayBuffer();
          return new File([bytes], 'proof', {type: file.blob.contentType});
        },
        BUCKET: {
          async put(key, bytes, {httpMetadata}) {
            await put(savedPath(key), bytes, {...privateOptions, contentType: httpMetadata.contentType, allowOverwrite: true});
          },
          async get(key) {
            const result = await get(savedPath(key), privateOptions);
            return result?.stream && {body: result.stream, httpMetadata: {contentType: result.blob.contentType}};
          },
          async delete(key) { await del(savedPath(key)); },
        },
      };
      if (url.pathname === '/api/registrations' && request.method === 'POST') {
        return await register(request, env);
      }
      if (url.pathname === '/api/site-content' || url.pathname === '/admin/content' || url.pathname.startsWith('/api/sponsor-logo/')) return await siteContent(request, env, url);
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return await admin(request, env, url);
      return new Response('Not found', {status: 404});
    } catch (error) {
      console.error('Jejama request failed:', error.name);
      return Response.json({error: 'Service unavailable. Please try again.'}, {status: 503});
    }
  },
};

