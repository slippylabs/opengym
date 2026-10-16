/* Single sign-on through the reverse proxy (the slippylabs fork). The proxy puts the name its own
   login vouches for in SSO_HEADER on /api/sso/* only. A profile is linked by `sso`, never by
   name: a profile someone else created under the same name must stay theirs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'http://localhost:8080';

async function startServer(t, env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-sso-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN, RP_ID: 'localhost', PASSWORD_LOGIN: '1', MEDIA_UPLOADS: '0', ...env }
  });
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  const port = await boundPort(child, () => log);
  const api = `http://127.0.0.1:${port}`;
  const post = (p, { who, cookie, body = {} } = {}) => fetch(api + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(who ? { 'X-SSO-User': who } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body)
  });
  return { api, post, dataDir };
}
const cookieOf = r => (r.headers.get('set-cookie') || '').split(';')[0];

test('off unless SSO_HEADER is set: the header is never read', async t => {
  const h = await startServer(t);
  const r = await h.post('/api/sso/login', { who: 'ada' });
  assert.equal(r.status, 404);
});

test('a first sign-in creates a linked profile, the next one opens the same', async t => {
  const h = await startServer(t, { SSO_HEADER: 'X-SSO-User' });
  assert.equal((await h.post('/api/sso/login')).status, 401);
  const a = await h.post('/api/sso/login', { who: 'ada' });
  assert.equal(a.status, 200);
  const ua = (await a.json()).user;
  assert.equal(ua.name, 'ada');
  assert.equal(ua.sso, 'ada');
  assert.match(cookieOf(a), /gymsid=/);
  const b = await h.post('/api/sso/login', { who: 'ada' });
  assert.equal((await b.json()).user.id, ua.id);
  const me = await fetch(h.api + '/api/me', { headers: { Cookie: cookieOf(b) } }).then(r => r.json());
  assert.equal(me.user.id, ua.id);
});

test('a profile with the same name is never taken over; linking is explicit', async t => {
  const h = await startServer(t, { SSO_HEADER: 'X-SSO-User' });
  const reg = await h.post('/api/register/password', { body: { name: 'bob', password: 'a long enough password 42' } });
  const own = (await reg.json()).user
  const sso = await (await h.post('/api/sso/login', { who: 'bob' })).json();
  assert.notEqual(sso.user.id, own.id, 'a stranger named bob gets a new profile, not this one');

  // The owner links their own profile; the site login then opens it.
  const other = await startServer(t, { SSO_HEADER: 'X-SSO-User' });
  const r2 = await other.post('/api/register/password', { body: { name: 'cy', password: 'a long enough password 42' } });
  const cy = (await r2.json()).user;
  const linked = await other.post('/api/sso/link', { who: 'cy', cookie: cookieOf(r2) });
  assert.equal(linked.status, 200);
  assert.equal((await linked.json()).user.sso, 'cy');
  const back = await (await other.post('/api/sso/login', { who: 'cy' })).json();
  assert.equal(back.user.id, cy.id);
});

test('a login already linked elsewhere is refused, and linking needs a session', async t => {
  const h = await startServer(t, { SSO_HEADER: 'X-SSO-User' });
  await h.post('/api/sso/login', { who: 'dee' });
  const reg = await h.post('/api/register/password', { body: { name: 'dee2', password: 'a long enough password 42' } });
  const r = await h.post('/api/sso/link', { who: 'dee', cookie: cookieOf(reg) });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).code, 'sso-taken');
  assert.equal((await h.post('/api/sso/link', { who: 'dee' })).status, 401);
});

test('a malformed name is no name, and a cross-site POST is refused', async t => {
  const h = await startServer(t, { SSO_HEADER: 'X-SSO-User' });
  assert.equal((await h.post('/api/sso/login', { who: 'a b<script>' })).status, 401);
  const r = await fetch(h.api + '/api/sso/login', { method: 'POST', headers: { Origin: 'https://evil.example', 'X-SSO-User': 'ada', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403);
});
