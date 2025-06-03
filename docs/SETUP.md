# Registry Setup Guide

This guide is for maintainers of the mlld registry.

## GitHub Secrets Setup

To enable automated module publishing and review features, you need to configure GitHub secrets:

1. Go to your repository settings on GitHub
2. Navigate to Settings → Secrets and variables → Actions
3. Add the following repository secrets:

### Required Secrets

#### `GITHUB_TOKEN`
A GitHub personal access token for automated PR operations.

To create a token:
1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Create a new token with `repo` and `workflow` permissions
3. Copy the token value

#### `ANTHROPIC_API_KEY` (Optional)
For automated LLM-powered module review.

To get an API key:
1. Sign up at anthropic.com
2. Go to API settings
3. Create a new API key

## GitHub Actions

The registry uses automated workflows:

### 1. Validation Workflow (`validate.yml`)
- **Triggers on**: Pull requests that modify `modules.json`
- **Purpose**: Validates module metadata and fetches content to verify
- **Comments**: Adds validation results as PR comments

### 2. Auto-merge Workflow (`auto-merge.yml`)
- **Triggers on**: PR approval or successful validation
- **Purpose**: Automatically merges approved module submissions
- **Requirements**: Requires proper branch protection rules

## Manual Operations

### Validating Modules

To validate modules locally:

```bash
cd registry
node tools/validate.js

# Skip content fetching (metadata only)
node tools/validate.js --skip-content

# Save detailed report
node tools/validate.js --save-report
```

### Publishing a Module

To help users publish modules:

```bash
# Generate module metadata
node tools/publish.js @username/module <gist-url>

# Auto-publish with PR creation
node tools/auto-publish.js @username/module <gist-url>
```

## Branch Protection

For security, configure branch protection for the `main` branch:

1. Go to Settings → Branches
2. Add rule for `main` branch
3. Enable:
   - Require pull request reviews
   - Dismiss stale pull request approvals
   - Require status checks to pass
   - Include administrators

## Registry Maintenance

### Adding Standard Library Modules

The `@mlld/*` namespace is reserved for official modules:

1. Add to `modules/mlld/registry.json`
2. Ensure thorough testing
3. Document in module frontmatter
4. Update `modules.json` via build script

### Monitoring

Keep an eye on:
- Failed validations in PRs
- Rate limiting from GitHub API
- Module quality and security
- Community feedback

## Security Considerations

1. All modules are PUBLIC - ensure no secrets in code
2. Validate all URLs point to legitimate sources
3. Monitor for malicious code submissions
4. Keep dependencies updated
5. Regular security audits

## Troubleshooting

### Common Issues

**Module validation fails**
- Check the gist/repo exists and is public
- Verify the URL includes the correct commit hash
- Ensure frontmatter has required fields

**Auto-merge not working**
- Check GitHub Actions are enabled
- Verify secrets are configured
- Check branch protection settings

**Rate limiting**
- Use authenticated requests where possible
- Implement caching for repeated fetches
- Consider GitHub App for higher limits

## Support

For registry issues:
- Open an issue on GitHub
- Check existing documentation
- Contact maintainers via Discord