#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Build global indexes from all user registries
async function buildIndexes() {
  const rootDir = path.join(__dirname, '..');
  const indexDir = path.join(rootDir, '_index');
  
  // Ensure index directory exists
  fs.mkdirSync(indexDir, { recursive: true });
  
  // Collect all modules and servers
  const allModules = {};
  const allServers = {};
  const allAdvisories = [];
  
  // Read all user directories
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === '_index' || entry.name === 'scripts') {
      continue;
    }
    
    const username = entry.name;
    const userDir = path.join(rootDir, username);
    
    // Process registry.json
    const registryFile = path.join(userDir, 'registry.json');
    if (fs.existsSync(registryFile)) {
      const data = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
      
      // Process modules
      for (const [name, module] of Object.entries(data.modules || {})) {
        allModules[`${username}/${name}`] = {
          ...module,
          author: username,
          fullName: `${username}/${name}`
        };
      }
      
      // Process servers
      for (const [name, server] of Object.entries(data.servers || {})) {
        allServers[`${username}/${name}`] = {
          ...server,
          author: username,
          fullName: `${username}/${name}`
        };
      }
    }
    
    // Process advisories
    const advisoriesFile = path.join(userDir, 'advisories.json');
    if (fs.existsSync(advisoriesFile)) {
      const data = JSON.parse(fs.readFileSync(advisoriesFile, 'utf8'));
      for (const advisory of data.advisories || []) {
        allAdvisories.push({
          ...advisory,
          author: username
        });
      }
    }
  }
  
  // Write module index with full details
  fs.writeFileSync(
    path.join(indexDir, 'modules.json'),
    JSON.stringify({
      version: '1.0.0',
      generated: new Date().toISOString(),
      count: Object.keys(allModules).length,
      modules: allModules
    }, null, 2)
  );
  
  // Write server index with full details
  fs.writeFileSync(
    path.join(indexDir, 'servers.json'),
    JSON.stringify({
      version: '1.0.0',
      generated: new Date().toISOString(),
      count: Object.keys(allServers).length,
      servers: allServers
    }, null, 2)
  );
  
  // Write lightweight search index
  const searchIndex = {
    version: '1.0.0',
    generated: new Date().toISOString(),
    modules: {},
    servers: {}
  };
  
  // Add modules to search index (lightweight)
  for (const [name, module] of Object.entries(allModules)) {
    searchIndex.modules[name] = {
      description: module.description,
      tags: module.tags,
      author: module.author
    };
  }
  
  // Add servers to search index (lightweight)
  for (const [name, server] of Object.entries(allServers)) {
    searchIndex.servers[name] = {
      description: server.description,
      tags: server.tags,
      author: server.author,
      capabilities: server.capabilities
    };
  }
  
  fs.writeFileSync(
    path.join(indexDir, 'search.json'),
    JSON.stringify(searchIndex, null, 2)
  );
  
  // Write advisories index
  fs.writeFileSync(
    path.join(indexDir, 'advisories.json'),
    JSON.stringify({
      version: '1.0.0',
      generated: new Date().toISOString(),
      count: allAdvisories.length,
      advisories: allAdvisories
    }, null, 2)
  );
  
  console.log(`Built indexes: ${Object.keys(allModules).length} modules, ${Object.keys(allServers).length} servers, ${allAdvisories.length} advisories`);
}

buildIndexes().catch(console.error);