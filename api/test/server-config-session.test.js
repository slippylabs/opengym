/* GET /api/config carries the flags the login screen and the pre-login boot need (invite_only
   for the invite field, allow_guest for "continue without account"), which are public. A
   session also gets `session: true`, so the client can tell a copy made for it from one made
   before it signed in. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const UID = 'u_cfg_1';

const mint = uid => {
  const payload = `${uid}:${Date.now() + 86400000}:0`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
};

async function startServer(t, env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-config-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({
    users: [{ id: UID, name: 'C', created: new Date().toISOString() }], creds: [], subs: [], invites: []
  }));
  // MEDIA_UPLOADS=0: the answers below are compared whole, and they are about the login flags
  // and the session marker. The public media block has its own tests in server-media.test.js.
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN: 'http://localhost:8080', RP_ID: 'localhost', INVITE_ONLY: '1', ALLOW_GUEST: '0', MEDIA_UPLOADS: '0', ...env }
  });
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  const port = await boundPort(child, () => log);
  return { api: `http://127.0.0.1:${port}`, dataDir };
}

test('GET /api/config: the login flags are public, the session marker needs a session', async t => {
  const h = await startServer(t);
  const config = headers => fetch(`${h.api}/api/config`, headers ? { headers } : undefined).then(r => r.json());

  // Nobody signed in — what the login screen and boot() actually read, and nothing else.
  assert.deepEqual(await config(), { invite_only: true, allow_guest: false });

  // A session cookie gets the marker.
  assert.deepEqual(await config({ Cookie: `gymsid=${mint(UID)}` }), { invite_only: true, allow_guest: false, session: true });

  // The paired mobile app carries the same token in a header, and boot() reads this route with it.
  assert.equal((await config({ Authorization: `Bearer ${mint(UID)}` })).session, true);

  // A signature that does not verify is a stranger, not a session.
  const forged = await config({ Cookie: 'gymsid=u_cfg_1:99999999999999:0.notarealmac' });
  assert.deepEqual(forged, { invite_only: true, allow_guest: false });
});

test('GET /api/config: DEFAULT_LANG is public when set, absent when unset or malformed (#303)', async t => {
  const set = await startServer(t, { DEFAULT_LANG: 'pt-BR' });
  const anon = await fetch(`${set.api}/api/config`).then(r => r.json());
  assert.deepEqual(anon, { invite_only: true, allow_guest: false, default_lang: 'pt-BR' }, 'the sign-in screen can read it');

  const bad = await startServer(t, { DEFAULT_LANG: '<script>' });
  assert.equal('default_lang' in await fetch(`${bad.api}/api/config`).then(r => r.json()), false);

  const unset = await startServer(t, { DEFAULT_LANG: '' });
  assert.equal('default_lang' in await fetch(`${unset.api}/api/config`).then(r => r.json()), false);
});
