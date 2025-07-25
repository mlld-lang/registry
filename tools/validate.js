#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Validation rules
const MODULE_NAME_REGEX = /^@[a-z0-9-]+\/[a-z0-9-]+$/;
const GIST_ID_REGEX = /^[a-f0-9]{32}$/;
const COMMIT_HASH_REGEX = /^[a-f0-9]{40}$/;
const GIST_URL_REGEX = /^https:\/\/gist\.githubusercontent\.com\/([^\/]+)\/([a-f0-9]{32})\/raw\/([a-f0-9]{40})\/(.+\.mld)$/;

// Required metadata fields
const REQUIRED_FIELDS = ['name', 'about', 'author', 'source', 'publishedAt', 'mlldVersion', 'ownerGithubUserIds'];
const VALID_CATEGORIES = [
  'prompts', 'utilities', 'when', 'filters', 'formatters', 
  'commands', 'apis', 'clis', 'templates', 'integrations', 'generators',
  'validators', 'transformers', 'workflows', 'dev', 'tests', 
  'context'
];
const REQUIRED_SOURCE_FIELDS = ['type', 'hash', 'url'];

// Fetch URL content
async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        return;
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Parse frontmatter from mlld content
function parseFrontmatter(content) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return null;
  }
  
  const frontmatter = {};
  const lines = frontmatterMatch[1].split('\n');
  
  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (match) {
      frontmatter[match[1].trim()] = match[2].trim();
    }
  }
  
  return frontmatter;
}

// Validate module metadata
function validateMetadata(moduleId, metadata) {
  const errors = [];
  
  // Check module name format
  if (!MODULE_NAME_REGEX.test(moduleId)) {
    errors.push(`Invalid module name format: ${moduleId}. Must be @username/module-name`);
  }
  
  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!metadata[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Validate name matches moduleId
  if (metadata.name && metadata.name !== moduleId) {
    errors.push(`Module name mismatch: ${metadata.name} !== ${moduleId}`);
  }
  
  // Validate author field (now a string, not object)
  if (metadata.author) {
    if (typeof metadata.author !== 'string') {
      errors.push('Author must be a string');
    } else if (!metadata.author.match(/^[a-z0-9-]+$/)) {
      errors.push(`Invalid author format: ${metadata.author}. Must be lowercase alphanumeric with hyphens`);
    }
  }
  
  // Validate source object
  if (metadata.source) {
    if (typeof metadata.source !== 'object') {
      errors.push('Source must be an object');
    } else {
      for (const field of REQUIRED_SOURCE_FIELDS) {
        if (!metadata.source[field]) {
          errors.push(`Missing required source field: ${field}`);
        }
      }
      
      // Validate source type
      const validTypes = ['gist', 'github', 'external'];
      if (!validTypes.includes(metadata.source.type)) {
        errors.push(`Invalid source type: ${metadata.source.type}. Must be one of: ${validTypes.join(', ')}`);
      }
      
      // Type-specific validation
      if (metadata.source.type === 'gist') {
        // Validate gist ID
        if (metadata.source.id && !GIST_ID_REGEX.test(metadata.source.id)) {
          errors.push(`Invalid gist ID format: ${metadata.source.id}`);
        }
        
        // Validate content hash (SHA256)
        if (metadata.source.contentHash && !metadata.source.contentHash.match(/^[a-f0-9]{64}$/)) {
          errors.push(`Invalid content hash format: ${metadata.source.contentHash}`);
        }
        
        // Legacy: Validate commit hash (SHA1) if present
        if (metadata.source.hash && !COMMIT_HASH_REGEX.test(metadata.source.hash)) {
          errors.push(`Invalid commit hash format: ${metadata.source.hash}`);
        }
        
        // Validate gist URL format
        if (metadata.source.url) {
          const urlMatch = metadata.source.url.match(GIST_URL_REGEX);
          if (!urlMatch) {
            errors.push(`Invalid gist URL format: ${metadata.source.url}`);
          } else {
            // Check URL components match
            const [, username, gistId, hash, filename] = urlMatch;
            if (metadata.source.id && gistId !== metadata.source.id) {
              errors.push(`Gist ID mismatch in URL: ${gistId} !== ${metadata.source.id}`);
            }
            if (metadata.source.hash && hash !== metadata.source.hash) {
              errors.push(`Commit hash mismatch in URL: ${hash} !== ${metadata.source.hash}`);
            }
          }
        }
      } else if (metadata.source.type === 'github') {
        // Validate repo format (legacy)
        if (metadata.source.repo && !metadata.source.repo.match(/^[^\/]+\/[^\/]+$/)) {
          errors.push(`Invalid repo format: ${metadata.source.repo}. Must be owner/repo`);
        }
        
        // Validate content hash (SHA256)
        if (metadata.source.contentHash && !metadata.source.contentHash.match(/^[a-f0-9]{64}$/)) {
          errors.push(`Invalid content hash format: ${metadata.source.contentHash}`);
        }
        
        // Validate repository object (new format)
        if (metadata.source.repository) {
          if (!metadata.source.repository.url) {
            errors.push('Missing repository.url');
          }
          if (!metadata.source.repository.commit) {
            errors.push('Missing repository.commit');
          } else if (!COMMIT_HASH_REGEX.test(metadata.source.repository.commit)) {
            errors.push(`Invalid repository commit hash: ${metadata.source.repository.commit}`);
          }
          if (!metadata.source.repository.path) {
            errors.push('Missing repository.path');
          }
        }
        
        // Legacy: Validate commit hash (SHA1)
        if (metadata.source.hash && !COMMIT_HASH_REGEX.test(metadata.source.hash)) {
          errors.push(`Invalid commit hash format: ${metadata.source.hash}`);
        }
        
        // Validate GitHub raw URL format
        if (metadata.source.url && !metadata.source.url.match(/^https:\/\/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/[a-f0-9]{40}\/.+\.mld$/)) {
          errors.push(`Invalid GitHub raw URL format: ${metadata.source.url}`);
        }
      } else if (metadata.source.type === 'external') {
        // Just validate URL format for external sources
        if (metadata.source.url && !metadata.source.url.match(/^https?:\/\/.+/)) {
          errors.push(`Invalid external URL format: ${metadata.source.url}`);
        }
      }
    }
  }
  
  // Validate dependencies (runtime dependencies, not module dependencies)
  if (metadata.dependencies) {
    if (typeof metadata.dependencies !== 'object') {
      errors.push('Dependencies must be an object');
    } else {
      const validRuntimes = ['js', 'py', 'sh', 'node', 'python', 'bash'];
      for (const [runtime, deps] of Object.entries(metadata.dependencies)) {
        if (!validRuntimes.includes(runtime)) {
          errors.push(`Invalid dependency runtime: ${runtime}. Must be one of: ${validRuntimes.join(', ')}`);
        }
        if (typeof deps !== 'object') {
          errors.push(`Dependencies for ${runtime} must be an object`);
        } else {
          // Validate specific dependency types
          if (runtime === 'js' || runtime === 'node') {
            if (deps.packages && !Array.isArray(deps.packages)) {
              errors.push(`Dependencies.${runtime}.packages must be an array`);
            }
          }
          if (runtime === 'sh' || runtime === 'bash') {
            if (deps.commands && !Array.isArray(deps.commands)) {
              errors.push(`Dependencies.${runtime}.commands must be an array`);
            }
          }
          if (runtime === 'py' || runtime === 'python') {
            if (deps.packages && !Array.isArray(deps.packages)) {
              errors.push(`Dependencies.${runtime}.packages must be an array`);
            }
          }
        }
      }
    }
  }
  
  // Validate keywords
  if (metadata.keywords) {
    if (!Array.isArray(metadata.keywords)) {
      errors.push('Keywords must be an array');
    } else {
      for (const keyword of metadata.keywords) {
        if (typeof keyword !== 'string' || !keyword.match(/^[a-z0-9-]+$/)) {
          errors.push(`Invalid keyword: ${keyword}. Must be lowercase alphanumeric with hyphens`);
        }
      }
    }
  }
  
  // Validate mlldVersion
  if (metadata.mlldVersion && !metadata.mlldVersion.match(/^(>=|>|=|<|<=)?\d+\.\d+\.\d+$/)) {
    errors.push(`Invalid mlldVersion format: ${metadata.mlldVersion}`);
  }
  
  // Validate publishedAt
  if (metadata.publishedAt) {
    const date = new Date(metadata.publishedAt);
    if (isNaN(date.getTime())) {
      errors.push(`Invalid publishedAt date: ${metadata.publishedAt}`);
    }
  }
  
  // Validate category
  if (metadata.category) {
    if (!VALID_CATEGORIES.includes(metadata.category)) {
      errors.push(`Invalid category: ${metadata.category}. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }
  }
  
  // Validate version
  if (metadata.version && !metadata.version.match(/^\d+\.\d+\.\d+$/)) {
    errors.push(`Invalid version format: ${metadata.version}. Must be semver (x.y.z)`);
  }
  
  // Validate license
  if (metadata.license && typeof metadata.license !== 'string') {
    errors.push('License must be a string');
  }
  
  // Validate needs array
  if (metadata.needs) {
    if (!Array.isArray(metadata.needs)) {
      errors.push('Needs must be an array');
    } else {
      const validNeeds = ['js', 'py', 'sh', 'node', 'python', 'bash'];
      for (const need of metadata.needs) {
        if (typeof need !== 'string' || !validNeeds.includes(need)) {
          errors.push(`Invalid need: ${need}. Must be one of: ${validNeeds.join(', ')}`);
        }
      }
    }
  }
  
  // Validate ownerGithubUserIds array
  if (metadata.ownerGithubUserIds) {
    if (!Array.isArray(metadata.ownerGithubUserIds)) {
      errors.push('ownerGithubUserIds must be an array');
    } else {
      for (const userId of metadata.ownerGithubUserIds) {
        if (!Number.isInteger(userId) || userId <= 0) {
          errors.push(`Invalid GitHub user ID: ${userId}. Must be a positive integer`);
        }
      }
    }
  } else {
    errors.push('Missing required field: ownerGithubUserIds');
  }
  
  return errors;
}

// Validate source content
async function validateSourceContent(metadata) {
  const errors = [];
  
  try {
    console.log(`Fetching content from ${metadata.source.url}...`);
    const content = await fetchUrl(metadata.source.url);
    
    // Validate content hash if present (SHA256)
    if (metadata.source.contentHash) {
      const actualHash = crypto.createHash('sha256').update(content).digest('hex');
      if (actualHash !== metadata.source.contentHash) {
        errors.push(`Content hash mismatch: expected ${metadata.source.contentHash}, got ${actualHash}`);
      }
    }
    
    // Legacy: For old gists, verify SHA1 hash
    if (metadata.source.type === 'gist' && metadata.source.hash && !metadata.source.contentHash) {
      const actualHash = crypto.createHash('sha1').update(content).digest('hex');
      if (actualHash !== metadata.source.hash) {
        errors.push(`Legacy hash mismatch: expected ${metadata.source.hash}, got ${actualHash}`);
      }
    }
    
    // Parse frontmatter
    const frontmatter = parseFrontmatter(content);
    if (!frontmatter) {
      errors.push('Gist content missing required frontmatter');
    } else {
      // Validate frontmatter matches metadata
      if (frontmatter.author !== metadata.author) {
        errors.push(`Frontmatter author mismatch: ${frontmatter.author} !== ${metadata.author}`);
      }
      if (frontmatter.name !== metadata.name.split('/')[1]) {
        errors.push(`Frontmatter name mismatch: ${frontmatter.name} !== ${metadata.name.split('/')[1]}`);
      }
    }
    
    // Basic mlld syntax check (very simple)
    if (!content.includes('@')) {
      errors.push('Gist content appears to be missing mlld directives');
    }
    
  } catch (error) {
    errors.push(`Failed to fetch gist content: ${error.message}`);
  }
  
  return errors;
}

// Validate a single module entry
async function validateModule(moduleId, metadata, options = {}) {
  console.log(`\nValidating ${moduleId}...`);
  
  const allErrors = [];
  
  // Validate metadata
  const metadataErrors = validateMetadata(moduleId, metadata);
  allErrors.push(...metadataErrors);
  
  // Validate source content if not skipped
  if (!options.skipContent && metadata.source?.url) {
    const contentErrors = await validateSourceContent(metadata);
    allErrors.push(...contentErrors);
  }
  
  if (allErrors.length === 0) {
    console.log(`✅ ${moduleId} is valid`);
  } else {
    console.log(`❌ ${moduleId} has ${allErrors.length} error(s):`);
    allErrors.forEach(err => console.log(`   - ${err}`));
  }
  
  return allErrors;
}

// Main validation function
async function validateRegistry(options = {}) {
  const modulesPath = path.join(__dirname, '..', 'modules.json');
  
  if (!fs.existsSync(modulesPath)) {
    console.error('Error: modules.json not found');
    process.exit(1);
  }
  
  const registry = JSON.parse(fs.readFileSync(modulesPath, 'utf8'));
  const modules = registry.modules || {};
  
  console.log(`Validating ${Object.keys(modules).length} modules...`);
  
  let totalErrors = 0;
  const validationResults = {};
  
  for (const [moduleId, metadata] of Object.entries(modules)) {
    const errors = await validateModule(moduleId, metadata, options);
    validationResults[moduleId] = {
      valid: errors.length === 0,
      errors: errors
    };
    totalErrors += errors.length;
  }
  
  // Generate validation report
  const report = {
    timestamp: new Date().toISOString(),
    modules: Object.keys(modules).length,
    valid: Object.values(validationResults).filter(r => r.valid).length,
    invalid: Object.values(validationResults).filter(r => !r.valid).length,
    totalErrors: totalErrors,
    results: validationResults
  };
  
  // Save report if requested
  if (options.saveReport) {
    const reportPath = path.join(__dirname, '..', 'validation-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nValidation report saved to ${reportPath}`);
  }
  
  // Summary
  console.log('\n=== Validation Summary ===');
  console.log(`Total modules: ${report.modules}`);
  console.log(`Valid: ${report.valid}`);
  console.log(`Invalid: ${report.invalid}`);
  console.log(`Total errors: ${report.totalErrors}`);
  
  // Exit with error if any modules are invalid
  if (report.invalid > 0) {
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  skipContent: args.includes('--skip-content'),
  saveReport: args.includes('--save-report')
};

if (args.includes('--help')) {
  console.log(`
Usage: validate.js [options]

Options:
  --skip-content    Skip fetching and validating gist content
  --save-report     Save detailed validation report to file
  --help           Show this help message
`);
  process.exit(0);
}

// Run validation
validateRegistry(options).catch(error => {
  console.error('Validation failed:', error);
  process.exit(1);
});