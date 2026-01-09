#!/usr/bin/env node

import fs from 'fs';

function pad(n) {
  return String(n).padStart(2, '0');
}

const d = new Date();

const build =
  d.getFullYear() +
  pad(d.getMonth() + 1) +
  pad(d.getDate()) +
  pad(d.getHours()) +
  pad(d.getMinutes()) +
  pad(d.getSeconds());

const version = {
  version: process.env.npm_package_version,
  build,
  generatedAt: d.toISOString()
};

fs.mkdirSync('public', { recursive: true });
fs.writeFileSync(
  'public/version.json',
  JSON.stringify(version, null, 2) + '\n'
);

console.log(`✔ Version ${version.version} · build ${build}`);

