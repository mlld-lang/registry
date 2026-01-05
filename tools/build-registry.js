#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Get all versions for a module by scanning version files
 */
async function getAvailableVersions(modulePath) {
  const files = await fs.readdir(modulePath);
  const versions = [];
  
  for (const file of files) {
    // Match semantic version pattern (e.g., 1.0.0.json, 2.0.0-beta.json)
    if (file.match(/^\d+\.\d+\.\d+(-[\w.]+)?\.json$/)) {
      versions.push(file.replace('.json', ''));
    }
  }
  
  // Sort versions in descending order
  return versions.sort((a, b) => compareSemVer(b, a));
}

/**
 * Simple semver comparison
 */
function compareSemVer(a, b) {
  const parseVersion = (v) => {
    const [version, prerelease] = v.split('-');
    const [major, minor, patch] = version.split('.').map(Number);
    return { major, minor, patch, prerelease: prerelease || '' };
  };
  
  const va = parseVersion(a);
  const vb = parseVersion(b);
  
  if (va.major !== vb.major) return va.major - vb.major;
  if (va.minor !== vb.minor) return va.minor - vb.minor;
  if (va.patch !== vb.patch) return va.patch - vb.patch;
  
  // Handle prerelease versions
  if (!va.prerelease && vb.prerelease) return 1;
  if (va.prerelease && !vb.prerelease) return -1;
  if (va.prerelease && vb.prerelease) return va.prerelease.localeCompare(vb.prerelease);
  
  return 0;
}

/**
 * Get the latest version from available versions
 */
async function getLatestVersion(modulePath, tags) {
  // Check tags first
  if (tags?.latest) return tags.latest;
  
  // Otherwise get highest version
  const versions = await getAvailableVersions(modulePath);
  return versions[0]; // Already sorted descending
}

async function buildRegistry() {
  const rootDir = path.join(__dirname, '..');
  const modulesDir = path.join(rootDir, 'modules');
  const outputPath = path.join(rootDir, 'modules.json');
  const generatedPath = path.join(rootDir, 'modules.generated.json');
  
  console.log('🔨 Building module registry...\n');
  
  const registry = {
    version: "2.0",
    generated: new Date().toISOString(),
    modules: {}
  };
  
  const errors = [];
  
  try {
    // Scan all author directories
    const authorDirs = await fs.readdir(modulesDir);
    
    for (const author of authorDirs) {
      const authorPath = path.join(modulesDir, author);
      const stats = await fs.stat(authorPath);
      
      if (!stats.isDirectory()) continue;
      
      const moduleDirs = await fs.readdir(authorPath);
      
      for (const moduleName of moduleDirs) {
        const modulePath = path.join(authorPath, moduleName);
        const moduleStats = await fs.stat(modulePath);
        
        // Skip non-directories and hidden files
        if (!moduleStats.isDirectory() || moduleName.startsWith('.')) continue;
        
        // Skip backup files from migration
        if (moduleName.endsWith('.json.backup')) continue;
        
        const moduleKey = `@${author}/${moduleName}`;
        
        try {
          console.log(`📦 Processing ${moduleKey}...`);
          
          // Read metadata
          const metadataPath = path.join(modulePath, 'metadata.json');
          let metadata;
          try {
            metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
          } catch (error) {
            // Fallback for unmigrated modules
            const oldPath = path.join(authorPath, `${moduleName}.json`);
            try {
              const oldModule = JSON.parse(await fs.readFile(oldPath, 'utf8'));
              console.log(`  ⚠️  Using legacy format for ${moduleKey}`);
              registry.modules[moduleKey] = oldModule;
              continue;
            } catch {
              errors.push(`Missing metadata.json for ${moduleKey}`);
              continue;
            }
          }
          
          // Read tags
          let tags = {};
          try {
            tags = JSON.parse(await fs.readFile(path.join(modulePath, 'tags.json'), 'utf8'));
          } catch {
            // Tags file is optional
          }
          
          // Get latest version
          const latestVersion = await getLatestVersion(modulePath, tags);
          
          if (!latestVersion) {
            errors.push(`No versions found for ${moduleKey}`);
            continue;
          }
          
          // Read latest version data
          const versionPath = path.join(modulePath, `${latestVersion}.json`);
          const versionData = JSON.parse(await fs.readFile(versionPath, 'utf8'));
          
          // Get all available versions
          const availableVersions = await getAvailableVersions(modulePath);
          
          // Build registry entry (backward compatible structure)
          registry.modules[moduleKey] = {
            // Core fields from metadata
            name: metadata.name,
            author: metadata.author,
            about: metadata.about,
            
            // Version-specific fields from latest version
            version: latestVersion,
            needs: versionData.needs || [],
            license: versionData.license || 'CC0',
            mlldVersion: versionData.mlldVersion,
            source: versionData.source,
            dependencies: versionData.dependencies || {},
            keywords: versionData.keywords || [],
            repo: versionData.repo,
            bugs: versionData.bugs,
            homepage: versionData.homepage,
            publishedAt: versionData.publishedAt,
            publishedBy: versionData.publishedBy,
            
            // Version support fields
            availableVersions,
            tags,
            
            // Ownership info for access control
            owners: metadata.owners || [metadata.author],
            maintainers: metadata.maintainers || []
          };
          
          console.log(`  ✅ Added ${moduleKey} (${latestVersion}, ${availableVersions.length} versions)`);
          
        } catch (error) {
          errors.push(`Error processing ${moduleKey}: ${error.message}`);
        }
      }
    }
    
  } catch (error) {
    errors.push(`Error scanning modules directory: ${error.message}`);
  }
  
  // Check for errors
  if (errors.length > 0) {
    console.error('\n❌ Build completed with errors:\n');
    errors.forEach(err => console.error(`  - ${err}`));
    console.error('\nNote: The registry was still built with successful modules.');
  }
  
  // Sort modules for consistent output
  const sortedModules = Object.keys(registry.modules)
    .sort()
    .reduce((acc, key) => {
      acc[key] = registry.modules[key];
      return acc;
    }, {});
  
  registry.modules = sortedModules;
  
  // Write generated file (pretty printed)
  await fs.writeFile(
    generatedPath, 
    JSON.stringify(registry, null, 2) + '\n'
  );
  
  // Write distribution file (minified)
  await fs.writeFile(
    outputPath,
    JSON.stringify(registry)
  );
  
  console.log(`\n✅ Built registry with ${Object.keys(registry.modules).length} modules`);
  console.log(`📁 Output: ${outputPath} (minified)`);
  console.log(`📁 Output: ${generatedPath} (formatted)`);
  
  if (errors.length === 0) {
    console.log('\n🎉 Build completed successfully!');
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildRegistry().catch(error => {
    console.error('Build failed:', error);
    process.exit(1);
  });
}

export { buildRegistry };