#!/usr/bin/env node
const { existsSync } = require('node:fs');
const { execSync } = require('node:child_process');

const nextBin = 'node_modules/.bin/next';

if (!existsSync(nextBin)) {
  console.warn('[ensure-next] next binary not found; running npm ci to install dependencies...');
  execSync('npm ci', { stdio: 'inherit' });
}
