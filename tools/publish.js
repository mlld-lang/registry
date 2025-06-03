#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// GitHub API helper
async function githubRequest(path, token = null) {
  const options = {
    hostname: 'api.github.com',
    port: 443,
    path: path,
    method: 'GET',
    headers: {
      'User-Agent': 'mlld-registry-publisher',
      'Accept': 'application/vnd.github.v3+json'
    }
  };

  if (token) {
    options.headers['Authorization'] = `token ${token}`;
  }

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(response);
          } else {
            reject(new Error(`GitHub API error: ${res.statusCode} - ${response.message || 'Unknown error'}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Parse different URL formats
function parseSourceUrl(url) {
  // Already a raw URL with commit hash
  const rawMatch = url.match(/^https:\/\/gist\.githubusercontent\.com\/([^\/]+)\/([a-f0-9]{32})\/raw\/([a-f0-9]{40})\/(.+\.mld)$/);
  if (rawMatch) {
    const [, username, gistId, commitHash, filename] = rawMatch;
    return {
      type: 'raw',
      username,
      gistId,
      commitHash,
      filename,
      url
    };
  }

  // Gist URL (friendly)
  const gistMatch = url.match(/^https:\/\/gist\.github\.com\/([^\/]+)\/([a-f0-9]{32})(?:\/([a-f0-9]{40}))?(?:#file-(.+))?$/);
  if (gistMatch) {
    const [, username, gistId, commitHash, filename] = gistMatch;
    return {
      type: 'gist',
      username,
      gistId,
      commitHash, // may be undefined
      filename // may be undefined
    };
  }

  // GitHub repo file URL
  const repoMatch = url.match(/^https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+\.mld)$/);
  if (repoMatch) {
    const [, owner, repo, ref, filepath] = repoMatch;
    return {
      type: 'repo',
      owner,
      repo,
      ref,
      filepath
    };
  }

  // Non-GitHub URL (pass through)
  if (url.startsWith('http')) {
    return {
      type: 'external',
      url
    };
  }

  throw new Error(`Unsupported URL format: ${url}`);
}

// Resolve gist to raw URL with latest commit
async function resolveGistUrl(parsed, token = null) {
  console.log(`Fetching gist information for ${parsed.gistId}...`);
  
  const gist = await githubRequest(`/gists/${parsed.gistId}`, token);
  
  // Get the latest commit SHA
  const latestCommit = gist.history[0];
  if (!latestCommit) {
    throw new Error('No commits found in gist');
  }
  
  const commitSha = latestCommit.version;
  
  // Find the .mld file
  const files = Object.keys(gist.files);
  let filename = parsed.filename;
  
  if (!filename) {
    // Find .mld file automatically
    const mldFiles = files.filter(f => f.endsWith('.mld'));
    if (mldFiles.length === 0) {
      throw new Error('No .mld files found in gist');
    }
    if (mldFiles.length > 1) {
      throw new Error(`Multiple .mld files found: ${mldFiles.join(', ')}. Please specify which one to use.`);
    }
    filename = mldFiles[0];
  }
  
  if (!gist.files[filename]) {
    throw new Error(`File ${filename} not found in gist. Available files: ${files.join(', ')}`);
  }
  
  const rawUrl = `https://gist.githubusercontent.com/${parsed.username}/${parsed.gistId}/raw/${commitSha}/${filename}`;
  
  return {
    type: 'gist',
    username: parsed.username,
    gistId: parsed.gistId,
    commitHash: commitSha,
    filename,
    url: rawUrl,
    gistInfo: gist
  };
}

// Resolve GitHub repo file to raw URL
async function resolveRepoUrl(parsed, token = null) {
  console.log(`Fetching repository information for ${parsed.owner}/${parsed.repo}...`);
  
  // Get the commit SHA for the ref
  const refData = await githubRequest(`/repos/${parsed.owner}/${parsed.repo}/git/refs/heads/${parsed.ref}`, token);
  const commitSha = refData.object.sha;
  
  // Check if file exists
  try {
    await githubRequest(`/repos/${parsed.owner}/${parsed.repo}/contents/${parsed.filepath}?ref=${parsed.ref}`, token);
  } catch (e) {
    throw new Error(`File ${parsed.filepath} not found in repository`);
  }
  
  const rawUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${commitSha}/${parsed.filepath}`;
  
  return {
    type: 'repo',
    owner: parsed.owner,
    repo: parsed.repo,
    ref: parsed.ref,
    commitHash: commitSha,
    filepath: parsed.filepath,
    url: rawUrl
  };
}

// Generate module metadata template
function generateModuleTemplate(moduleId, resolvedSource) {
  let author, sourceObj;
  
  if (resolvedSource.type === 'gist') {
    author = {
      name: "Your Name",
      github: resolvedSource.username
    };
    sourceObj = {
      type: "gist",
      id: resolvedSource.gistId,
      hash: resolvedSource.commitHash,
      url: resolvedSource.url
    };
  } else if (resolvedSource.type === 'repo') {
    author = {
      name: "Your Name", 
      github: resolvedSource.owner
    };
    sourceObj = {
      type: "github",
      repo: `${resolvedSource.owner}/${resolvedSource.repo}`,
      hash: resolvedSource.commitHash,
      url: resolvedSource.url
    };
  } else if (resolvedSource.type === 'external') {
    author = {
      name: "Your Name",
      github: "yourusername"
    };
    sourceObj = {
      type: "external",
      url: resolvedSource.url
    };
  } else if (resolvedSource.type === 'raw') {
    author = {
      name: "Your Name",
      github: resolvedSource.username
    };
    sourceObj = {
      type: "gist",
      id: resolvedSource.gistId,
      hash: resolvedSource.commitHash,
      url: resolvedSource.url
    };
  }

  return {
    name: moduleId,
    description: "Brief description of what your module does",
    author,
    source: sourceObj,
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
function generatePRTemplate(moduleId, metadata, resolvedSource) {
  let sourceInfo = '';
  if (resolvedSource.type === 'gist') {
    sourceInfo = `- Gist: https://gist.github.com/${resolvedSource.username}/${resolvedSource.gistId}`;
  } else if (resolvedSource.type === 'repo') {
    sourceInfo = `- Repository: https://github.com/${resolvedSource.owner}/${resolvedSource.repo}/blob/${resolvedSource.ref}/${resolvedSource.filepath}`;
  } else {
    sourceInfo = `- Source: ${resolvedSource.url}`;
  }

  return `## New Module: ${moduleId}

### Description
${metadata.description}

### Author
- Name: ${metadata.author.name}
- GitHub: @${metadata.author.github}

### Source
${sourceInfo}
- Raw URL: ${metadata.source.url}

### Dependencies
${Object.keys(metadata.dependencies).length > 0 ? 
  Object.entries(metadata.dependencies).map(([dep, hash]) => `- ${dep}: ${hash}`).join('\n') : 
  'None'}

### Keywords
${metadata.keywords.length > 0 ? metadata.keywords.map(k => `\`${k}\``).join(', ') : 'None'}

### Checklist
- [ ] Module name follows format: \`@username/module-name\`
- [ ] Source is public and contains valid mlld code
- [ ] Source includes required frontmatter
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
function showPublishInstructions(moduleId, metadata, resolvedSource) {
  console.log(`
📦 Module Publishing Guide for ${moduleId}
${'='.repeat(50)}

✅ Source Resolved Successfully!
${resolvedSource.type === 'gist' ? 
  `📁 Gist: https://gist.github.com/${resolvedSource.username}/${resolvedSource.gistId}` :
  resolvedSource.type === 'repo' ?
  `📁 Repository: https://github.com/${resolvedSource.owner}/${resolvedSource.repo}` :
  `🔗 Source: ${resolvedSource.url}`
}
🔗 Raw URL: ${metadata.source.url}
🆔 Commit Hash: ${metadata.source.hash || 'N/A'}

Step 1: Verify Your Source Content
----------------------------------
Your source should include this frontmatter:

---
author: ${metadata.author.github}
module: ${moduleId}
description: ${metadata.description}
---

@text your_export = "Your module code here"
# ... rest of your module

Step 2: Fork the Registry Repository
------------------------------------
1. Go to https://github.com/mlld-lang/registry
2. Click "Fork" button
3. Clone your fork locally:
   git clone https://github.com/YOUR_USERNAME/registry.git
   cd registry

Step 3: Add Your Module
-----------------------
Add this entry to modules.json:

${JSON.stringify({ [moduleId]: metadata }, null, 2)}

Step 4: Validate Your Module
-----------------------------
Run the validation script:
node tools/validate.js

Fix any errors before proceeding.

Step 5: Submit Pull Request
---------------------------
1. Commit your changes:
   git add modules.json
   git commit -m "Add module: ${moduleId}"
   git push origin main

2. Create PR at https://github.com/mlld-lang/registry
3. Use this PR description:

${generatePRTemplate(moduleId, metadata, resolvedSource)}

After Merge
-----------
Once your PR is merged:
1. The registry will be updated immediately
2. Your module will be available at: ${moduleId}
3. Users can import with: @import { your_export } from "${moduleId}"

`);
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2 || args.includes('--help')) {
    console.log(`
Usage: publish.js <module-id> <source-url> [options]

Arguments:
  module-id      Your module name (e.g., @username/module-name)
  source-url     URL to your module source (supports multiple formats)

Supported URL formats:
  - Gist URL: https://gist.github.com/username/gist-id
  - Gist file: https://gist.github.com/username/gist-id#file-utils-mld
  - GitHub file: https://github.com/owner/repo/blob/main/path/to/file.mld
  - Raw URL: https://gist.githubusercontent.com/username/gist-id/raw/hash/file.mld
  - External: Any other HTTP(S) URL

Options:
  --token        GitHub personal access token (for private sources)
  --help         Show this help message

Examples:
  ./publish.js @alice/utils https://gist.github.com/alice/abc123
  ./publish.js @bob/helpers https://github.com/bob/mlld-modules/blob/main/helpers.mld
`);
    process.exit(args.includes('--help') ? 0 : 1);
  }
  
  const [moduleId, sourceUrl] = args;
  const token = process.env.GITHUB_TOKEN || (args.includes('--token') ? args[args.indexOf('--token') + 1] : null);
  
  // Validate module ID format
  if (!moduleId.match(/^@[a-z0-9-]+\/[a-z0-9-]+$/)) {
    console.error('Error: Invalid module ID format. Must be @username/module-name');
    process.exit(1);
  }
  
  try {
    console.log(`Resolving source URL: ${sourceUrl}`);
    const parsed = parseSourceUrl(sourceUrl);
    
    let resolvedSource;
    
    switch (parsed.type) {
      case 'raw':
        resolvedSource = parsed;
        break;
        
      case 'gist':
        resolvedSource = await resolveGistUrl(parsed, token);
        break;
        
      case 'repo':
        resolvedSource = await resolveRepoUrl(parsed, token);
        break;
        
      case 'external':
        resolvedSource = parsed;
        break;
        
      default:
        throw new Error(`Unsupported source type: ${parsed.type}`);
    }
    
    const metadata = generateModuleTemplate(moduleId, resolvedSource);
    showPublishInstructions(moduleId, metadata, resolvedSource);
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    if (error.message.includes('API rate limit')) {
      console.error('Tip: Set GITHUB_TOKEN environment variable to increase rate limits');
    }
    process.exit(1);
  }
}

main();