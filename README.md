# mlld registry

> **⚠️ PUBLIC REGISTRY**: All modules in this registry are PUBLIC and accessible to anyone. For private modules, use custom resolvers instead.

The module system uses GitHub DNS. 

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

### Step 2: Get the Raw URL

1. Click the "Raw" button on your gist
2. Copy the FULL URL including the commit hash

Example:
```
https://gist.githubusercontent.com/alice/8bb1c645c1cf0dd515bd8f834fb82fcf/raw/59d76372d3c4a93e7aae34cb98b13a8e99dfb95f/utils.mld
```

### Step 3: Generate Module Metadata

Use our helper tool:

```bash
./tools/publish.js @yourgithub/awesome-utils <raw-gist-url>
```

This will generate the metadata JSON and provide step-by-step instructions.

### Step 4: Submit Your Module

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
    "dependencies": {
      "@bob/helpers": "a8c3f2d4e5b6c7d8e9f0a1b2c3d4e5f6"
    },
    "keywords": ["utils", "helpers", "strings"],
    "mlldVersion": ">=0.5.0",
    "publishedAt": "2024-01-15T10:30:00Z",
    "stats": {
      "installs": 0,
      "stars": 0
    }
  }
}
```

### Field Descriptions

- **name** (required): Module identifier in format `@username/module-name`
- **description** (required): Clear description of what the module does
- **author** (required): Object with `name` and `github` fields
- **source** (required): Object with gist information
  - `type`: Always "gist" for now
  - `id`: The 32-character gist ID
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

### Publish Helper

Guides you through the publishing process:

```bash
node tools/publish.js @username/module-name <gist-raw-url>
```

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

When your PR is merged:
- GitHub Actions automatically validates all modules
- DNS records are created/updated via DNSimple API
- Changes are reflected at `public.mlld.ai` within 5-10 minutes
- No manual intervention needed!

For maintainers: See [docs/SETUP.md](docs/SETUP.md) for configuration details.

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
