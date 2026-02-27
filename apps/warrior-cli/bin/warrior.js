#!/usr/bin/env node
/* eslint-env node */
import('../dist/index.js').catch((e) => {
  process.stderr.write(String(e) + '\n');
  process.exit(1);
}); // eslint-disable-line no-undef
