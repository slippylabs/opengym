/* The web image runs as uid 101. Docker lets it bind port 80 (ip_unprivileged_port_start=0 in
   the container); most Kubernetes runtimes do not, and nginx then dies on bind(). The image's
   own default stays 80 so compose setups keep working, and the Helm chart and the example
   manifests set an unprivileged port themselves — the container port, the probes and the
   Service following it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('the image keeps NGINX_PORT=80 for Docker', () => {
  assert.match(read('web/Dockerfile'), /^ENV NGINX_PORT=80$/m);
});
