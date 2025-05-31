# Registry Setup Guide

This guide is for maintainers of the mlld registry.

## GitHub Secrets Setup

To enable automatic DNS synchronization when modules are added, you need to configure GitHub secrets:

1. Go to your repository settings on GitHub
2. Navigate to Settings → Secrets and variables → Actions
3. Add the following repository secrets:

### Required Secrets

#### `DNSIMPLE_TOKEN`
Your DNSimple API token with write access to DNS records.

To create a token:
1. Log in to DNSimple
2. Go to Account → Access Tokens
3. Create a new token with "Manage zones" permission
4. Copy the token value

#### `DNSIMPLE_ACCOUNT_ID`
Your DNSimple account ID.

To find your account ID:
1. Log in to DNSimple
2. Go to Account → Settings
3. Find your Account ID (numeric value)

## GitHub Actions

The registry uses two automated workflows:

### 1. Validation Workflow (`validate.yml`)
- **Triggers on**: Pull requests that modify `modules.json`
- **Purpose**: Validates module metadata and fetches gist content to verify
- **Comments**: Adds validation results as PR comments

### 2. DNS Sync Workflow (`dns-sync.yml`)
- **Triggers on**: Pushes to main branch that modify `modules.json`
- **Purpose**: Updates DNS TXT records at `public.mlld.ai`
- **Requirements**: Needs DNSimple secrets configured

## Manual Operations

### Running DNS Sync Locally

If you need to run DNS sync manually:

```bash
export DNSIMPLE_TOKEN="your-token"
export DNSIMPLE_ACCOUNT_ID="your-account-id"
cd registry
node tools/dns-sync.js
```

### Validating Modules

To validate all modules:

```bash
cd registry
node tools/validate.js

# Skip content fetching (faster)
node tools/validate.js --skip-content

# Generate detailed report
node tools/validate.js --save-report
```

## Monitoring

### DNS Records
You can verify DNS records are created correctly:

```bash
# Check a specific module
dig TXT alice-utils.public.mlld.ai

# Should return something like:
# alice-utils.public.mlld.ai. 300 IN TXT "v=mlld1;url=https://gist.githubusercontent.com/..."
```

### GitHub Actions
- Check the Actions tab in GitHub for workflow runs
- DNS sync results are saved to `dns/records.json`
- Each sync creates a summary in the workflow run

## Troubleshooting

### DNS Sync Fails
1. Check GitHub secrets are set correctly
2. Verify DNSimple token has correct permissions
3. Check DNSimple API status
4. Review workflow logs in GitHub Actions

### Validation Fails
1. Module metadata format incorrect
2. Gist URL not accessible
3. Commit hash mismatch
4. Missing required frontmatter in gist

### Common Issues
- **Rate limits**: DNSimple has API rate limits (adjust sync frequency if needed)
- **DNS propagation**: New records take 5-10 minutes to propagate globally
- **Gist availability**: Ensure gists are PUBLIC, not secret