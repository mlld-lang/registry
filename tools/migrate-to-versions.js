#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Migrate registry from flat structure to versioned structure
 * 
 * FROM:
 * modules/{author}/{module}.json
 * 
 * TO:
 * modules/{author}/{module}/metadata.json
 * modules/{author}/{module}/{version}.json
 * modules/{author}/{module}/tags.json
 */
async function migrateRegistry() {
  console.log('🔄 Starting registry migration to versioned structure...\n');
  
  const modulesDir = path.join(__dirname, '..', 'modules');
  
  try {
    const authors = await fs.readdir(modulesDir);
    let migratedCount = 0;
    
    for (const author of authors) {
      const authorPath = path.join(modulesDir, author);
      const stats = await fs.stat(authorPath);
      
      if (!stats.isDirectory()) continue;
      
      const files = await fs.readdir(authorPath);
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const moduleName = file.replace('.json', '');
        const oldPath = path.join(authorPath, file);
        const moduleDir = path.join(authorPath, moduleName);
        
        console.log(`📦 Migrating @${author}/${moduleName}...`);
        
        // Read existing module data
        const moduleData = JSON.parse(await fs.readFile(oldPath, 'utf8'));
        
        // Create module directory
        await fs.mkdir(moduleDir, { recursive: true });
        
        // Extract metadata
        const metadata = {
          name: moduleData.name,
          author: moduleData.author,
          about: moduleData.about || '',
          owners: moduleData.ownerGithubUserIds ? 
            // For now, just use author as owner (we'll update this later)
            [moduleData.author] : [moduleData.author],
          maintainers: [],
          created: moduleData.publishedAt || new Date().toISOString(),
          createdBy: moduleData.publishedBy || null,
          firstPublishPR: null // We'll track this going forward
        };
        
        // Extract version data
        const version = moduleData.version || '1.0.0';
        const versionData = {
          version,
          needs: moduleData.needs || [],
          license: moduleData.license || 'CC0',
          mlldVersion: moduleData.mlldVersion || '>=1.0.0',
          source: moduleData.source,
          dependencies: moduleData.dependencies || {},
          keywords: moduleData.keywords || [],
          repo: moduleData.repo,
          bugs: moduleData.bugs,
          homepage: moduleData.homepage,
          publishedAt: moduleData.publishedAt || new Date().toISOString(),
          publishedBy: moduleData.publishedBy || null
        };
        
        // Create tags.json with current version as latest
        const tags = {
          latest: version,
          stable: version
        };
        
        // Write new files
        await fs.writeFile(
          path.join(moduleDir, 'metadata.json'),
          JSON.stringify(metadata, null, 2)
        );
        
        await fs.writeFile(
          path.join(moduleDir, `${version}.json`),
          JSON.stringify(versionData, null, 2)
        );
        
        await fs.writeFile(
          path.join(moduleDir, 'tags.json'),
          JSON.stringify(tags, null, 2)
        );
        
        // Create backup of original
        await fs.rename(oldPath, oldPath + '.backup');
        
        console.log(`  ✅ Created versioned structure`);
        console.log(`  📁 ${moduleDir}/`);
        console.log(`     ├── metadata.json`);
        console.log(`     ├── ${version}.json`);
        console.log(`     └── tags.json`);
        console.log(`  💾 Original backed up to ${file}.backup\n`);
        
        migratedCount++;
      }
    }
    
    console.log(`\n✨ Migration complete! Migrated ${migratedCount} modules.`);
    console.log('\nNext steps:');
    console.log('1. Run build-registry.js to generate new modules.json');
    console.log('2. Test with local imports');
    console.log('3. Remove .backup files once verified\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Check if running in registry directory
async function checkDirectory() {
  try {
    const registryPath = path.join(__dirname, '..');
    const files = await fs.readdir(registryPath);
    
    if (!files.includes('modules') || !files.includes('tools')) {
      console.error('❌ This script must be run from the registry repository');
      console.error('   Current directory:', process.cwd());
      process.exit(1);
    }
    
    // Check if already migrated
    const modulesDir = path.join(__dirname, '..', 'modules');
    const authors = await fs.readdir(modulesDir);
    
    for (const author of authors) {
      const authorPath = path.join(modulesDir, author);
      const stats = await fs.stat(authorPath);
      if (!stats.isDirectory()) continue;
      
      const files = await fs.readdir(authorPath);
      for (const file of files) {
        const filePath = path.join(authorPath, file);
        const fileStats = await fs.stat(filePath);
        
        // If we find a directory (not .git), assume already migrated
        if (fileStats.isDirectory() && !file.startsWith('.')) {
          console.log('⚠️  Registry appears to already be migrated.');
          console.log('   Found versioned structure in:', filePath);
          console.log('\n   To re-run migration:');
          console.log('   1. Remove existing module directories');
          console.log('   2. Restore .backup files to .json');
          console.log('   3. Run this script again\n');
          process.exit(0);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking directory:', error);
    process.exit(1);
  }
}

// Run migration
console.log('Registry Version Migration Tool\n');
await checkDirectory();
await migrateRegistry();