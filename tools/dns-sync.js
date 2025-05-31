#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DNSimple API configuration
const DNSIMPLE_TOKEN = process.env.DNSIMPLE_TOKEN;
const DNSIMPLE_ACCOUNT_ID = process.env.DNSIMPLE_ACCOUNT_ID;
const DOMAIN = 'mlld.ai';
const SUBDOMAIN = 'public';

if (!DNSIMPLE_TOKEN || !DNSIMPLE_ACCOUNT_ID) {
  console.error('Error: DNSIMPLE_TOKEN and DNSIMPLE_ACCOUNT_ID environment variables required');
  process.exit(1);
}

// DNSimple API helper
async function dnsimpleRequest(method, endpoint, data = null) {
  const options = {
    hostname: 'api.dnsimple.com',
    port: 443,
    path: `/v2/${DNSIMPLE_ACCOUNT_ID}${endpoint}`,
    method: method,
    headers: {
      'Authorization': `Bearer ${DNSIMPLE_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  };

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
            reject(new Error(`DNSimple API error: ${res.statusCode} - ${JSON.stringify(response)}`));
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

// Convert module name to DNS subdomain
// @alice/utils -> alice-utils
function moduleToDnsName(moduleName) {
  return moduleName
    .replace('@', '')
    .replace('/', '-')
    .toLowerCase();
}

// Parse mlld TXT record format
function parseMlldRecord(content) {
  const match = content.match(/^v=mlld1;url=(.+)$/);
  return match ? match[1] : null;
}

// Create mlld TXT record content
function createMlldRecord(url) {
  return `v=mlld1;url=${url}`;
}

async function syncDnsRecords() {
  console.log('Starting DNS sync...');
  
  // Load modules data
  const modulesPath = path.join(__dirname, '..', 'modules.json');
  const recordsPath = path.join(__dirname, '..', 'dns', 'records.json');
  
  if (!fs.existsSync(modulesPath)) {
    console.error('Error: modules.json not found');
    process.exit(1);
  }
  
  const modules = JSON.parse(fs.readFileSync(modulesPath, 'utf8'));
  const recordsManifest = JSON.parse(fs.readFileSync(recordsPath, 'utf8'));
  
  // Get existing DNS records
  console.log('Fetching existing DNS records...');
  const existingRecordsResponse = await dnsimpleRequest('GET', `/zones/${DOMAIN}/records?type=TXT`);
  const existingRecords = existingRecordsResponse.data || [];
  
  // Build map of existing mlld records
  const existingMlldRecords = new Map();
  for (const record of existingRecords) {
    if (record.name.startsWith(`${SUBDOMAIN}.`) && record.content.startsWith('v=mlld1;')) {
      const moduleName = record.name.replace(`${SUBDOMAIN}.`, '').replace(`.${DOMAIN}`, '');
      existingMlldRecords.set(moduleName, record);
    }
  }
  
  // Process each module
  const updatedRecords = [];
  
  for (const [moduleId, moduleData] of Object.entries(modules.modules)) {
    const dnsName = moduleToDnsName(moduleId);
    const fullDnsName = `${dnsName}.${SUBDOMAIN}`;
    const recordContent = createMlldRecord(moduleData.source.url);
    
    const existingRecord = existingMlldRecords.get(dnsName);
    
    if (existingRecord) {
      // Check if record needs updating
      if (existingRecord.content !== recordContent) {
        console.log(`Updating record for ${moduleId} (${fullDnsName})...`);
        await dnsimpleRequest('PATCH', `/zones/${DOMAIN}/records/${existingRecord.id}`, {
          content: recordContent
        });
        updatedRecords.push({
          module: moduleId,
          dns: fullDnsName,
          action: 'updated',
          url: moduleData.source.url
        });
      } else {
        console.log(`Record for ${moduleId} is up to date`);
        updatedRecords.push({
          module: moduleId,
          dns: fullDnsName,
          action: 'unchanged',
          url: moduleData.source.url
        });
      }
    } else {
      // Create new record
      console.log(`Creating record for ${moduleId} (${fullDnsName})...`);
      await dnsimpleRequest('POST', `/zones/${DOMAIN}/records`, {
        type: 'TXT',
        name: fullDnsName,
        content: recordContent,
        ttl: 300 // 5 minutes for quick updates
      });
      updatedRecords.push({
        module: moduleId,
        dns: fullDnsName,
        action: 'created',
        url: moduleData.source.url
      });
    }
  }
  
  // Update records manifest
  recordsManifest.updated = new Date().toISOString();
  recordsManifest.records = updatedRecords;
  fs.writeFileSync(recordsPath, JSON.stringify(recordsManifest, null, 2));
  
  console.log('\nDNS sync complete!');
  console.log(`- Created: ${updatedRecords.filter(r => r.action === 'created').length}`);
  console.log(`- Updated: ${updatedRecords.filter(r => r.action === 'updated').length}`);
  console.log(`- Unchanged: ${updatedRecords.filter(r => r.action === 'unchanged').length}`);
}

// Run sync
syncDnsRecords().catch(error => {
  console.error('DNS sync failed:', error);
  process.exit(1);
});