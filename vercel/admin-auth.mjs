import {createHmac, createHash, timingSafeEqual} from 'node:crypto';

const equal = (a,b) => timingSafeEqual(...[a,b].map(value => createHash('sha256').update(value).digest()));
const cookie = 'jejama_admin';
const attributes = 'Path=/admin; HttpOnly; Secure; SameSite=Strict';
const sign = (expiry,password) => createHmac('sha256',password).update('jejama-admin:' + expiry).digest('hex');
const headers = {'Cache-Control':'no-store','Content-Type':'text/html; charset=utf-8','X-Frame-Options':'DENY'};
export function authorizeAdmin(request) {
  const password = process.env.JEJAMA_ADMIN_PASSWORD;
  const token = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(cookie+'='))?.slice(cookie.length+1);
  if (!password || !token) return false;
  const [expiry,signature] = token.split('.');
  return /^\d+$/.test(expiry) && Number(expiry)>Date.now() && !!signature && equal(signature,sign(expiry,password));
}
export async function adminLogin(request,url) {
  const redirect = (location,extra={}) => new Response(null,{status:303,headers:{...headers,Location:location,...extra}});
  if (request.method === 'POST') {
    if (request.headers.get('origin')!==url.origin) return new Response('Invalid origin',{status:403});
    if (url.pathname === '/admin/logout') return redirect('/admin/login',{'Set-Cookie':cookie+'=; Max-Age=0; '+attributes});
    const data = await request.formData();
    const password = process.env.JEJAMA_ADMIN_PASSWORD;
    const email = process.env.JEJAMA_ADMIN_EMAIL;
    if (password && email && equal(String(data.get('email')).trim().toLowerCase(),email.trim().toLowerCase()) && equal(String(data.get('password')),password)) {
      const expiry = Date.now()+8*3600000;
      return redirect('/admin',{'Set-Cookie':cookie+'='+expiry+'.'+sign(expiry,password)+'; Max-Age=28800; '+attributes});
    }
    return redirect('/admin/login?error=1');
  }
  if (request.method !== 'GET' || url.pathname !== '/admin/login') return new Response(null,{status:405});
  if (authorizeAdmin(request)) return redirect('/admin');
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Organizer Login | Jejama CTF</title><link rel="stylesheet" href="/admin-theme.css"><main class="login"><a class="admin-brand" href="/"><img src="/assets/logo.webp" width="38" height="38" alt=""> Jejama CTF</a><h1>Organizer Login</h1><p class="muted">Sign in to manage the competition.</p>${url.searchParams.has('error')?'<p role="alert">Email or password is incorrect.</p>':''}<form method="post"><label>Email<input type="email" name="email" autocomplete="username" required></label><label>Password<input type="password" name="password" autocomplete="current-password" required></label><button>Sign in</button></form></main></html>`,{headers});
}
