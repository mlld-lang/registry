#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function buildRegistry() {
  const rootDir = path.join(__dirname, '..');
  const modulesDir = path.join(rootDir, 'modules');
  const outputPath = path.join(rootDir, 'modules.json');
  const generatedPath = path.join(rootDir, 'modules.generated.json');
  
  console.log('🔨 Building module registry...\n');
  
  // Find all module JSON files
  const moduleFiles = await glob('modules/**/*.json', { cwd: rootDir });
  
  const registry = {
    version: "2.0.0",
    generated: new Date().toISOString(),
    modules: {}
  };
  
  const errors = [];
  
  // Process each module file
  for (const filePath of moduleFiles) {
    const fullPath = path.join(rootDir, filePath);
    
    try {
      const content = await fs.readFile(fullPath, 'utf8');
      const module = JSON.parse(content);
      
      // Extract expected author and name from path
      const pathParts = filePath.split('/');
      if (pathParts.length !== 3) {
        errors.push(`Invalid path structure: ${filePath}`);
        continue;
      }
      
      const [, pathAuthor, pathFile] = pathParts;
      const pathModuleName = path.basename(pathFile, '.json');
      
      // Validate path matches content
      if (module.author !== pathAuthor) {
        errors.push(`Author mismatch in ${filePath}: expected ${pathAuthor}, got ${module.author}`);
        continue;
      }
      
      if (module.name !== pathModuleName) {
        errors.push(`Module name mismatch in ${filePath}: expected ${pathModuleName}, got ${module.name}`);
        continue;
      }
      
      // Validate required fields
      const required = ['name', 'author', 'about', 'needs', 'license', 'source'];
      const missing = required.filter(field => !module[field]);
      if (missing.length > 0) {
        errors.push(`Missing required fields in ${filePath}: ${missing.join(', ')}`);
        continue;
      }
      
      // Validate license
      if (module.license !== 'CC0') {
        errors.push(`Invalid license in ${filePath}: must be CC0`);
        continue;
      }
      
      // Build the module key
      const moduleKey = `@${module.author}/${module.name}`;
      
      // Check for duplicates
      if (registry.modules[moduleKey]) {
        errors.push(`Duplicate module found: ${moduleKey} in ${filePath}`);
        continue;
      }
      
      // Add to registry
      registry.modules[moduleKey] = module;
      
      console.log(`✓ Added ${moduleKey}`);
    } catch (error) {
      errors.push(`Error processing ${filePath}: ${error.message}`);
    }
  }
  
  // Check for errors
  if (errors.length > 0) {
    console.error('\n❌ Build failed with errors:\n');
    errors.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
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
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildRegistry().catch(error => {
    console.error('Build failed:', error);
    process.exit(1);
  });
}

export { buildRegistry };