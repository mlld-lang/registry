#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function buildRegistry() {
  console.log('Building registry from user directories...');
  
  const modulesDir = path.join(__dirname, '..', 'modules');
  const outputFile = path.join(__dirname, '..', 'modules.json');
  
  // Initialize registry structure
  const registry = {
    version: "1.0.0",
    updated: new Date().toISOString(),
    modules: {}
  };
  
  // Read all user directories
  const userDirs = fs.readdirSync(modulesDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  console.log(`Found ${userDirs.length} user directories: ${userDirs.join(', ')}`);
  
  // Process each user directory
  for (const username of userDirs) {
    const userRegistryPath = path.join(modulesDir, username, 'registry.json');
    
    if (!fs.existsSync(userRegistryPath)) {
      console.warn(`Warning: ${username}/registry.json not found, skipping`);
      continue;
    }
    
    try {
      const userRegistry = JSON.parse(fs.readFileSync(userRegistryPath, 'utf8'));
      
      // Validate user registry structure
      if (!userRegistry.author || !userRegistry.modules) {
        console.error(`Error: Invalid registry format for ${username}`);
        continue;
      }
      
      // Validate author matches directory name
      if (userRegistry.author !== username) {
        console.error(`Error: Author mismatch for ${username}: expected '${username}', got '${userRegistry.author}'`);
        continue;
      }
      
      let moduleCount = 0;
      
      // Add each module from user registry
      for (const [moduleId, moduleData] of Object.entries(userRegistry.modules)) {
        // Validate module ID format
        if (!moduleId.startsWith(`@${username}/`)) {
          console.error(`Error: Invalid module ID '${moduleId}' for user '${username}'. Must start with '@${username}/'`);
          continue;
        }
        
        // Check for duplicates
        if (registry.modules[moduleId]) {
          console.error(`Error: Duplicate module ID '${moduleId}' found in ${username}/registry.json`);
          continue;
        }
        
        // Validate module structure
        if (!moduleData.name || !moduleData.author || !moduleData.source) {
          console.error(`Error: Invalid module structure for '${moduleId}' in ${username}/registry.json`);
          continue;
        }
        
        // Validate author consistency
        if (moduleData.author.github !== username) {
          console.error(`Error: Module author mismatch for '${moduleId}': expected '${username}', got '${moduleData.author.github}'`);
          continue;
        }
        
        registry.modules[moduleId] = moduleData;
        moduleCount++;
      }
      
      console.log(`✅ Added ${moduleCount} modules from ${username}`);
      
    } catch (error) {
      console.error(`Error processing ${username}/registry.json: ${error.message}`);
    }
  }
  
  // Write combined registry
  fs.writeFileSync(outputFile, JSON.stringify(registry, null, 2));
  
  const totalModules = Object.keys(registry.modules).length;
  console.log(`\n🎉 Built registry with ${totalModules} total modules`);
  console.log(`📝 Output written to modules.json`);
  
  return registry;
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  buildRegistry().catch(error => {
    console.error('Build failed:', error);
    process.exit(1);
  });
}

export { buildRegistry };