#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Generate module metadata template
function generateModuleTemplate(moduleId, gistUrl) {
  const urlMatch = gistUrl.match(/^https:\/\/gist\.githubusercontent\.com\/([^\/]+)\/([a-f0-9]{32})\/raw\/([a-f0-9]{40})\/(.+\.mld)$/);
  
  if (!urlMatch) {
    throw new Error('Invalid gist URL format. URL must be the raw content URL with commit hash.');
  }
  
  const [, username, gistId, commitHash, filename] = urlMatch;
  
  return {
    name: moduleId,
    description: "Brief description of what your module does",
    author: {
      name: "Your Name",
      github: username
    },
    source: {
      type: "gist",
      id: gistId,
      hash: commitHash,
      url: gistUrl
    },
    dependencies: {},
    keywords: [],
    mlldVersion: ">=0.5.0",
    publishedAt: new Date().toISOString(),
    stats: {
      installs: 0,
      stars: 0
    }
  };
}

// Generate PR template
function generatePRTemplate(moduleId, metadata) {
  return `## New Module: ${moduleId}

### Description
${metadata.description}

### Author
- Name: ${metadata.author.name}
- GitHub: @${metadata.author.github}

### Source
- Gist: https://gist.github.com/${metadata.author.github}/${metadata.source.id}
- Raw URL: ${metadata.source.url}

### Dependencies
${Object.keys(metadata.dependencies).length > 0 ? 
  Object.entries(metadata.dependencies).map(([dep, hash]) => `- ${dep}: ${hash}`).join('\n') : 
  'None'}

### Keywords
${metadata.keywords.length > 0 ? metadata.keywords.map(k => `\`${k}\``).join(', ') : 'None'}

### Checklist
- [ ] Module name follows format: \`@username/module-name\`
- [ ] Gist is public and contains valid mlld code
- [ ] Gist includes required frontmatter
- [ ] Raw URL includes specific commit hash
- [ ] Description clearly explains module purpose
- [ ] Keywords are relevant and helpful
- [ ] All dependencies are listed with their hashes
- [ ] Tested locally with \`mlld\` CLI

### Testing
\`\`\`mlld
@import { your_export } from "${moduleId}"
# Test your module here
\`\`\`
`;
}

// Instructions for publishing
function showPublishInstructions(moduleId, metadata) {
  console.log(`
📦 Module Publishing Guide for ${moduleId}
${'='.repeat(50)}

Step 1: Prepare Your Gist
-------------------------
1. Create a PUBLIC gist at https://gist.github.com
2. Add your mlld code with this frontmatter:

---
author: ${metadata.author.github}
module: ${moduleId}
description: ${metadata.description}
---

@text your_export = "Your module code here"
# ... rest of your module


Step 2: Get the Raw URL with Commit Hash
-----------------------------------------
1. Click "Raw" button on your gist
2. Copy the FULL URL (it should include a 40-character hash)
   Example: https://gist.githubusercontent.com/username/gistid/raw/HASH/file.mld


Step 3: Fork the Registry Repository
------------------------------------
1. Go to https://github.com/mlld-lang/registry
2. Click "Fork" button
3. Clone your fork locally:
   git clone https://github.com/YOUR_USERNAME/registry.git
   cd registry


Step 4: Add Your Module
-----------------------
1. Create/update the modules.json file with your module entry
2. Your module metadata has been generated above

Save this to modules.json (merge with existing modules):
${JSON.stringify(metadata, null, 2)}


Step 5: Validate Your Module
-----------------------------
Run the validation script:
node tools/validate.js

Fix any errors before proceeding.


Step 6: Submit Pull Request
---------------------------
1. Commit your changes:
   git add modules.json
   git commit -m "Add module: ${moduleId}"
   git push origin main

2. Create PR at https://github.com/mlld-lang/registry
3. Use this PR description:

${generatePRTemplate(moduleId, metadata)}


After Merge
-----------
Once your PR is merged:
1. DNS records will be automatically created
2. Your module will be available at: ${moduleId}
3. Users can import with: @import { your_export } from "${moduleId}"

`);
}

// Main function
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2 || args.includes('--help')) {
    console.log(`
Usage: publish.js <module-id> <gist-raw-url>

Arguments:
  module-id      Your module name (e.g., @username/module-name)
  gist-raw-url   The raw GitHub gist URL with commit hash

Example:
  ./publish.js @alice/utils https://gist.githubusercontent.com/alice/abc123.../raw/def456.../utils.mld

Options:
  --help         Show this help message
`);
    process.exit(args.includes('--help') ? 0 : 1);
  }
  
  const [moduleId, gistUrl] = args;
  
  // Validate module ID format
  if (!moduleId.match(/^@[a-z0-9-]+\/[a-z0-9-]+$/)) {
    console.error('Error: Invalid module ID format. Must be @username/module-name');
    process.exit(1);
  }
  
  try {
    const metadata = generateModuleTemplate(moduleId, gistUrl);
    showPublishInstructions(moduleId, metadata);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();