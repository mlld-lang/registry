#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// GitHub API helper
async function githubRequest(method, path, data = null, token = null) {
  const options = {
    hostname: 'api.github.com',
    port: 443,
    path: path,
    method: method,
    headers: {
      'User-Agent': 'mlld-auto-publisher',
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
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
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Parse source URL (reuse from publish.js)
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

  throw new Error(`Unsupported URL format: ${url}`);
}

// Resolve gist to raw URL (simplified from publish.js)
async function resolveGistUrl(parsed, token = null) {
  const gist = await githubRequest('GET', `/gists/${parsed.gistId}`, null, token);
  
  const latestCommit = gist.history[0];
  if (!latestCommit) {
    throw new Error('No commits found in gist');
  }
  
  const commitSha = latestCommit.version;
  const files = Object.keys(gist.files);
  let filename = parsed.filename;
  
  if (!filename) {
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
  const refData = await githubRequest('GET', `/repos/${parsed.owner}/${parsed.repo}/git/refs/heads/${parsed.ref}`, null, token);
  const commitSha = refData.object.sha;
  
  // Check if file exists
  try {
    await githubRequest('GET', `/repos/${parsed.owner}/${parsed.repo}/contents/${parsed.filepath}?ref=${parsed.ref}`, null, token);
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

// Create module metadata
function createModuleMetadata(moduleId, resolvedSource, description = null, keywords = []) {
  let author, sourceObj;
  
  if (resolvedSource.type === 'gist') {
    author = {
      name: resolvedSource.gistInfo?.owner?.name || "Module Author",
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
      name: "Module Author",
      github: resolvedSource.owner
    };
    sourceObj = {
      type: "github",
      repo: `${resolvedSource.owner}/${resolvedSource.repo}`,
      hash: resolvedSource.commitHash,
      url: resolvedSource.url
    };
  }

  return {
    name: moduleId,
    description: description || "Module description",
    author,
    source: sourceObj,
    dependencies: {},
    keywords: keywords || [],
    mlldVersion: ">=0.5.0",
    publishedAt: new Date().toISOString()
  };
}

// Auto-publish module
async function autoPublish(moduleId, sourceUrl, options = {}) {
  const {
    token,
    description,
    keywords = [],
    dryRun = false
  } = options;
  
  if (!token) {
    throw new Error('GitHub token required for auto-publishing. Set GITHUB_TOKEN or use --token');
  }
  
  console.log(`🚀 Auto-publishing ${moduleId}...`);
  
  // 1. Resolve source URL
  console.log('📡 Resolving source URL...');
  const parsed = parseSourceUrl(sourceUrl);
  let resolvedSource;
  
  if (parsed.type === 'gist') {
    resolvedSource = await resolveGistUrl(parsed, token);
  } else if (parsed.type === 'repo') {
    resolvedSource = await resolveRepoUrl(parsed, token);
  } else if (parsed.type === 'raw') {
    resolvedSource = parsed;
  } else {
    throw new Error(`Auto-publish does not support source type: ${parsed.type}`);
  }
  
  console.log(`✅ Resolved to: ${resolvedSource.url}`);
  
  // 2. Create module metadata
  const moduleData = createModuleMetadata(moduleId, resolvedSource, description, keywords);
  const username = resolvedSource.username || resolvedSource.owner;
  
  // 3. Check if user already has modules
  const userRegistryPath = path.join(__dirname, '..', 'modules', username, 'registry.json');
  let userRegistry;
  
  if (fs.existsSync(userRegistryPath)) {
    userRegistry = JSON.parse(fs.readFileSync(userRegistryPath, 'utf8'));
    
    // Check for duplicate module
    if (userRegistry.modules[moduleId]) {
      throw new Error(`Module ${moduleId} already exists. Use update command instead.`);
    }
  } else {
    // Create new user registry
    userRegistry = {
      author: username,
      modules: {}
    };
    
    // Create user directory
    const userDir = path.dirname(userRegistryPath);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
  }
  
  // 4. Add module to user registry
  userRegistry.modules[moduleId] = moduleData;
  
  if (dryRun) {
    console.log('🔍 Dry run - would create this registry entry:');
    console.log(JSON.stringify({ [moduleId]: moduleData }, null, 2));
    return;
  }
  
  // 5. Fork registry repo (if not already forked)
  console.log('🍴 Checking for fork...');
  const forkRepo = await githubRequest('POST', '/repos/mlld-lang/registry/forks', {}, token);
  console.log(`✅ Fork available at: ${forkRepo.html_url}`);
  
  // 6. Create branch
  const branchName = `add-module-${username}-${moduleId.replace('@', '').replace('/', '-')}`;
  console.log(`🌿 Creating branch: ${branchName}`);
  
  // Get main branch SHA
  const mainRef = await githubRequest('GET', `/repos/${username}/registry/git/refs/heads/main`, null, token);
  const mainSha = mainRef.object.sha;
  
  // Create new branch
  await githubRequest('POST', `/repos/${username}/registry/git/refs`, {
    ref: `refs/heads/${branchName}`,
    sha: mainSha
  }, token);
  
  // 7. Update user registry file
  console.log('📝 Updating registry file...');
  const registryContent = JSON.stringify(userRegistry, null, 2);
  const encodedContent = Buffer.from(registryContent).toString('base64');
  
  // Check if file exists
  let existingFile = null;
  try {
    existingFile = await githubRequest('GET', `/repos/${username}/registry/contents/modules/${username}/registry.json?ref=${branchName}`, null, token);
  } catch (e) {
    // File doesn't exist, that's ok
  }
  
  const fileData = {
    message: `Add module: ${moduleId}`,
    content: encodedContent,
    branch: branchName
  };
  
  if (existingFile) {
    fileData.sha = existingFile.sha;
  }
  
  await githubRequest('PUT', `/repos/${username}/registry/contents/modules/${username}/registry.json`, fileData, token);
  
  // 8. Create pull request
  console.log('📬 Creating pull request...');
  const prData = {
    title: `Add module: ${moduleId}`,
    head: `${username}:${branchName}`,
    base: 'main',
    body: `## New Module: ${moduleId}

### Description
${moduleData.description}

### Author
- Name: ${moduleData.author.name}
- GitHub: @${moduleData.author.github}

### Source
- Gist: https://gist.github.com/${resolvedSource.username}/${resolvedSource.gistId}
- Raw URL: ${moduleData.source.url}

### Keywords
${keywords.length > 0 ? keywords.map(k => `\`${k}\``).join(', ') : 'None'}

---
*This PR was created automatically via \`mlld registry publish\`*`
  };
  
  const pr = await githubRequest('POST', '/repos/mlld-lang/registry/pulls', prData, token);
  
  console.log(`🎉 Pull request created: ${pr.html_url}`);
  console.log(`📋 PR #${pr.number}: ${pr.title}`);
  
  return {
    moduleId,
    prUrl: pr.html_url,
    prNumber: pr.number,
    branchName
  };
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2 || args.includes('--help')) {
    console.log(`
Usage: auto-publish.js <module-id> <source-url> [options]

Arguments:
  module-id      Your module name (e.g., @username/module-name)
  source-url     URL to your module source (gist URL supported)

Options:
  --token        GitHub personal access token (or set GITHUB_TOKEN)
  --description  Module description
  --keywords     Comma-separated keywords
  --dry-run      Show what would be done without making changes
  --help         Show this help message

Examples:
  ./auto-publish.js @alice/utils https://gist.github.com/alice/abc123 --description "Utility functions"
  ./auto-publish.js @bob/tools https://gist.github.com/bob/def456 --keywords "tools,helpers,cli"
`);
    process.exit(args.includes('--help') ? 0 : 1);
  }
  
  const [moduleId, sourceUrl] = args;
  const token = process.env.GITHUB_TOKEN || 
    (args.includes('--token') ? args[args.indexOf('--token') + 1] : null);
  
  const description = args.includes('--description') ? 
    args[args.indexOf('--description') + 1] : null;
  
  const keywords = args.includes('--keywords') ? 
    args[args.indexOf('--keywords') + 1].split(',').map(k => k.trim()) : [];
  
  const dryRun = args.includes('--dry-run');
  
  // Validate module ID format
  if (!moduleId.match(/^@[a-z0-9-]+\/[a-z0-9-]+$/)) {
    console.error('Error: Invalid module ID format. Must be @username/module-name');
    process.exit(1);
  }
  
  try {
    await autoPublish(moduleId, sourceUrl, {
      token,
      description,
      keywords,
      dryRun
    });
  } catch (error) {
    console.error(`❌ Auto-publish failed: ${error.message}`);
    process.exit(1);
  }
}

main();