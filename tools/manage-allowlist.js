#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALLOWLIST_PATH = path.join(__dirname, '..', 'allowlist.json');

function loadAllowlist() {
  try {
    return JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  } catch (error) {
    console.error('Error loading allowlist:', error.message);
    process.exit(1);
  }
}

function saveAllowlist(data) {
  try {
    fs.writeFileSync(ALLOWLIST_PATH, JSON.stringify(data, null, 2) + '\n');
    console.log('✅ Allowlist updated successfully');
  } catch (error) {
    console.error('Error saving allowlist:', error.message);
    process.exit(1);
  }
}

function addAuthor(username) {
  const allowlist = loadAllowlist();
  
  if (allowlist.trustedAuthors.includes(username)) {
    console.log(`ℹ️  ${username} is already in the allowlist`);
    return;
  }
  
  allowlist.trustedAuthors.push(username);
  allowlist.trustedAuthors.sort();
  allowlist.metadata.lastUpdated = new Date().toISOString().split('T')[0];
  
  saveAllowlist(allowlist);
  console.log(`✅ Added ${username} to allowlist`);
}

function removeAuthor(username) {
  const allowlist = loadAllowlist();
  
  const index = allowlist.trustedAuthors.indexOf(username);
  if (index === -1) {
    console.log(`ℹ️  ${username} is not in the allowlist`);
    return;
  }
  
  allowlist.trustedAuthors.splice(index, 1);
  allowlist.metadata.lastUpdated = new Date().toISOString().split('T')[0];
  
  saveAllowlist(allowlist);
  console.log(`✅ Removed ${username} from allowlist`);
}

function listAuthors() {
  const allowlist = loadAllowlist();
  
  console.log('\n📋 Trusted Authors:\n');
  allowlist.trustedAuthors.forEach(author => {
    console.log(`  • ${author}`);
  });
  console.log(`\n  Total: ${allowlist.trustedAuthors.length} authors`);
  console.log(`  Last updated: ${allowlist.metadata.lastUpdated}\n`);
}

function checkAuthor(username) {
  const allowlist = loadAllowlist();
  const isTrusted = allowlist.trustedAuthors.includes(username);
  
  if (isTrusted) {
    console.log(`✅ ${username} is in the allowlist`);
  } else {
    console.log(`❌ ${username} is not in the allowlist`);
  }
  
  process.exit(isTrusted ? 0 : 1);
}

// CLI
const [,, command, ...args] = process.argv;

switch (command) {
  case 'add':
    if (!args[0]) {
      console.error('Usage: manage-allowlist.js add <username>');
      process.exit(1);
    }
    addAuthor(args[0]);
    break;
    
  case 'remove':
    if (!args[0]) {
      console.error('Usage: manage-allowlist.js remove <username>');
      process.exit(1);
    }
    removeAuthor(args[0]);
    break;
    
  case 'list':
    listAuthors();
    break;
    
  case 'check':
    if (!args[0]) {
      console.error('Usage: manage-allowlist.js check <username>');
      process.exit(1);
    }
    checkAuthor(args[0]);
    break;
    
  default:
    console.log(`
mlld Registry Allowlist Manager

Commands:
  add <username>     Add a trusted author
  remove <username>  Remove a trusted author  
  list              Show all trusted authors
  check <username>   Check if author is trusted

Examples:
  ./manage-allowlist.js add alice
  ./manage-allowlist.js remove bob
  ./manage-allowlist.js list
  ./manage-allowlist.js check charlie
    `);
    process.exit(command ? 1 : 0);
}