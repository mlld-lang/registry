# mlld registry

> **⚠️ PUBLIC REGISTRY**: All modules in this registry are PUBLIC and accessible to anyone. For private modules, use custom resolvers instead. 

## 🚀 Quick Start

### Using a Module

```mlld
@import { greet } from @alice/utils
@add [[{{greet}}]]
```

### Publishing a Module

1. Create a PUBLIC gist with your mlld code
2. Get the raw URL with commit hash
3. Fork this repository
4. Add your module to `modules.json`
5. Submit a pull request

## 📦 How It Works

The mlld registry uses a decentralized approach:

1. **Modules are stored as GitHub Gists** - providing versioning and accessibility
2. **DNS TXT records at `public.mlld.ai`** - enable fast module resolution
3. **Content addressing via commit hashes** - ensures integrity and immutability
4. **Local caching** - for offline access and performance

### Resolution Flow

```
@import @alice/utils
    ↓
Query: alice-utils.public.mlld.ai TXT record
    ↓
Returns: v=mlld1;url=https://gist.githubusercontent.com/...
    ↓
Fetch content & cache by hash
    ↓
Module ready to use!
```

## 📝 Publishing Your Module

### Step 1: Create Your Gist

Create a PUBLIC gist at https://gist.github.com with your mlld code:

```mlld
---
author: yourgithub
module: @yourgithub/awesome-utils
description: Awesome utilities for mlld scripts
---

@text greet = [[Hello, {{name}}!]]
@text farewell = [[Goodbye, {{name}}!]]

@exec format_json(data) = @run [jq '.' <<< '{{data}}']
```

**Required Frontmatter Fields:**
- `author` - Your GitHub username
- `module` - Full module name (@username/module)
- `description` - What your module does

### Step 2: Generate Module Metadata

Use our helper tool with your source URL:

```bash
./tools/publish.js @yourgithub/awesome-utils <source-url>
```

**Supported URL formats:**
- **Gist URL**: `https://gist.github.com/username/gist-id`
- **GitHub file**: `https://github.com/owner/repo/blob/main/path/file.mld`
- **Raw URL**: `https://gist.githubusercontent.com/username/gist-id/raw/hash/file.mld`
- **External**: Any other HTTP(S) URL

The tool will automatically:
- Fetch the latest commit hash
- Find your `.mld` file
- Generate the precise raw URL
- Create module metadata

This generates the metadata JSON and provides step-by-step instructions.

### Step 3: Submit Your Module

1. Fork this repository
2. Add your module entry to `modules.json`
3. Run validation: `node tools/validate.js`
4. Submit a pull request

## 🔍 Module Format

### modules.json Structure

```json
{
  "@alice/utils": {
    "name": "@alice/utils",
    "description": "Common utilities for mlld scripts",
    "author": {
      "name": "Alice Johnson",
      "github": "alicej"
    },
    "source": {
      "type": "gist",
      "id": "8bb1c645c1cf0dd515bd8f834fb82fcf",
      "hash": "59d76372d3c4a93e7aae34cb98b13a8e99dfb95f",
      "url": "https://gist.githubusercontent.com/alicej/8bb1c645c1cf0dd515bd8f834fb82fcf/raw/59d76372d3c4a93e7aae34cb98b13a8e99dfb95f/utils.mld"
    },
    "dependencies": {},
    "keywords": ["utils", "helpers", "strings"],
    "mlldVersion": ">=0.5.0",
    "publishedAt": "2024-01-15T10:30:00Z"
  },
  "@bob/templates": {
    "name": "@bob/templates",
    "description": "Project templates and scaffolding",
    "author": {
      "name": "Bob Smith",
      "github": "bobsmith"
    },
    "source": {
      "type": "github",
      "repo": "bobsmith/mlld-templates",
      "hash": "a1b2c3d4e5f6789abcdef0123456789abcdef012",
      "url": "https://raw.githubusercontent.com/bobsmith/mlld-templates/a1b2c3d4e5f6789abcdef0123456789abcdef012/templates.mld"
    },
    "dependencies": {},
    "keywords": ["templates", "scaffolding"],
    "mlldVersion": ">=0.5.0",
    "publishedAt": "2024-01-16T14:30:00Z"
  }
}
```

### Field Descriptions

- **name** (required): Module identifier in format `@username/module-name`
- **description** (required): Clear description of what the module does
- **author** (required): Object with `name` and `github` fields
- **source** (required): Object with source information
  - `type`: Source type - "gist", "github", or "external"
  - `id`: The 32-character gist ID (for gists)
  - `repo`: Repository name "owner/repo" (for GitHub repos)
  - `hash`: The 40-character commit hash
  - `url`: Full raw content URL
- **dependencies**: Map of module names to their commit hashes
- **keywords**: Array of lowercase keywords for discovery
- **mlldVersion**: Required mlld version (e.g., ">=0.5.0")
- **publishedAt**: ISO 8601 timestamp
- **stats**: Usage statistics (maintained by system)

## 🛠️ Tools

### Validation Script

Validates all modules in the registry:

```bash
# Validate all modules
node tools/validate.js

# Skip content fetching (faster, metadata only)
node tools/validate.js --skip-content

# Save detailed report
node tools/validate.js --save-report
```

### DNS Sync Script

Updates DNS records (maintainers only):

```bash
# Requires DNSIMPLE_TOKEN and DNSIMPLE_ACCOUNT_ID env vars
node tools/dns-sync.js
```

### Publishing Tools

#### Manual Publish Helper

Guides you through the publishing process step-by-step:

```bash
node tools/publish.js @username/module-name <source-url>
```

This tool:
- Fetches metadata from your source (gist/repo)
- Generates the module JSON structure
- Provides detailed instructions for manual PR submission

#### Auto-Publish Tool

Automatically creates a pull request for your module:

```bash
# Set your GitHub token first
export GITHUB_TOKEN=your_github_token

# Auto-publish your module
node tools/auto-publish.js @username/module-name <source-url> --description "Your module description"

# Or use npm script
npm run publish:auto -- @username/module-name <source-url>
```

This tool:
- Automatically forks the registry (if needed)
- Creates a branch with your module
- Submits a pull request
- Triggers automated LLM review

Options:
- `--token` - GitHub personal access token (or set GITHUB_TOKEN)
- `--description` - Module description
- `--keywords` - Comma-separated keywords
- `--dry-run` - Preview without making changes

## 📋 Guidelines

### Module Naming
- Use format: `@username/module-name`
- Lowercase with hyphens only
- Be descriptive but concise
- Examples: `@alice/json-utils`, `@bob/git-helpers`

### Code Quality
- Include clear documentation
- Handle errors gracefully
- Test your module thoroughly
- Follow mlld best practices

### Security
- Never include secrets or API keys
- Be cautious with command execution
- Validate all inputs
- Document any security considerations

### Dependencies
- List all mlld module dependencies
- Use exact commit hashes
- Keep dependencies minimal
- Test with your dependencies

## 🔒 Security

### Content Integrity
- All modules are addressed by content hash
- DNS records are signed with DNSSEC
- Gist URLs include specific commit hashes
- Local verification of content hashes

### PUBLIC Nature
- **All modules in this registry are PUBLIC**
- Anyone can view and use your code
- Do not publish sensitive or proprietary code
- For private modules, use custom resolvers

### Reporting Issues
If you discover a security issue in a module:
1. Contact the module author first
2. If no response, open an issue here
3. For urgent issues, email security@mlld-lang.org

## 🤝 Contributing

We welcome contributions! Please:

1. Read the guidelines above
2. Ensure your module adds value
3. Test thoroughly before submitting
4. Be responsive to feedback
5. Help review other submissions

### Automated Processes

The registry uses **autonomous LLM-powered governance**:

1. **Automated Review**: Claude AI reviews all module submissions
2. **Quality Checks**: Validates structure, security, and usefulness
3. **Auto-merge**: Approved modules are merged automatically
4. **DNS Sync**: Records updated at `public.mlld.ai` post-merge

See [docs/LLM-REVIEW-SYSTEM.md](docs/LLM-REVIEW-SYSTEM.md) for details.

### Additional Documentation

- [Setup Guide](docs/SETUP.md) - Configuration for maintainers
- [Self-Governance](docs/SELF-GOVERNANCE.md) - How the registry governs itself
- [LLM Review System](docs/LLM-REVIEW-SYSTEM.md) - Automated review details
- [Known Issues](docs/KNOWN-ISSUES.md) - Current limitations and workarounds

## 📊 Registry Statistics

- Total Modules: See `modules.json`
- Authors: Check unique author count
- Categories: Browse by keywords
- Recent: Sort by publishedAt

## 🔗 Resources

- [mlld Documentation](https://mlld.ai/docs)
- [mlld GitHub](https://github.com/mlld-lang/mlld)
- [Registry Issues](https://github.com/mlld-lang/registry/issues)
- [Example Modules](https://github.com/mlld-lang/mlld/tree/main/examples)

## 📜 License

The registry infrastructure is MIT licensed.
Individual modules are licensed by their authors.
