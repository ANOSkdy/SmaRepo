#!/usr/bin/env node

const { execSync } = require('node:child_process');

const blockedPatterns = [/^\.env($|\.)/, /^\.vercel(\/|$)/];

function getTrackedFiles() {
  const output = execSync('git ls-files', { encoding: 'utf8' });
  return output.split(/\r?\n/).filter(Boolean);
}

function isBlockedPath(filePath) {
  return blockedPatterns.some((pattern) => pattern.test(filePath));
}

function main() {
  const trackedFiles = getTrackedFiles();
  const blockedFiles = trackedFiles.filter(isBlockedPath);

  if (blockedFiles.length === 0) {
    console.log('OK: no tracked .env* or .vercel* files found.');
    return;
  }

  console.error('Blocked tracked files detected:');
  blockedFiles.forEach((filePath) => console.error(filePath));
  process.exit(1);
}

main();
