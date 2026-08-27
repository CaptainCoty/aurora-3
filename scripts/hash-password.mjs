#!/usr/bin/env node
// Usage: npm run hash-password -- "your-password-here"
// Prints a bcrypt hash to put in the AURORA_PASSWORD_HASH env var.

import bcrypt from "bcryptjs";

const password = process.argv[2];

if (!password) {
  console.error('Usage: npm run hash-password -- "your-password-here"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log(hash);
