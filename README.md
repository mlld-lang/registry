# mlld registry

PUBLIC REGISTRY: All modules in this registry are PUBLIC and accessible to anyone. For private modules, use the --private flag with mlld publish.

## Quick Start

### Using a Module

```bash
mlld install @alice/utils
```

```mlld
@import { greet } from @alice/utils
@add [[{{greet("World")}}]]
```

### Publishing a Module

```bash
# Automated publishing (recommended)
mlld publish my-module.mld.md

# Manual publishing
See "Manual Publishing" section below
```

## How It Works

The mlld registry uses GitHub for storage and distribution:

1. Modules stored as GitHub gists or in repositories
2. Central registry (modules.json) maps names to URLs
3. Content addressing via commit hashes
4. Local caching for offline access

### Resolution Flow

```
@import @alice/utils
    ↓
Query registry/modules.json on GitHub
    ↓
Return module metadata with source URL
    ↓
Fetch content and cache by hash
    ↓
Module ready to use
```

## Publishing with CLI

The mlld CLI handles most publishing automatically.

### Prerequisites

1. Install mlld: `npm install -g mlld`
2. Authenticate: `mlld auth login`
3. Create module with `.mld.md` extension

### Module Requirements

Required frontmatter fields:
- `name` - Module identifier (lowercase, hyphens)
- `author` - Your GitHub username
- `about` - Brief description
- `needs` - Runtime dependencies (empty array for pure mlld)
- `license` - Must be "CC0"

Example:
```markdown
---
name: string-utils
author: alice
about: String manipulation utilities
needs: []
license: CC0
---

# String Utils

## Module

```mlld-run
@exec slugify(text) = @run js [(@text.toLowerCase().replace(/\s+/g, '-'))]
```
```

### Publish Command

```bash
mlld publish my-module.mld.md
```

The command:
1. Validates module syntax and metadata
2. Detects git repository or creates gist
3. Submits pull request to registry
4. Displays module URL when complete

Options:
- `--dry-run` - Preview without publishing
- `--force` - Publish with uncommitted changes
- `--message <msg>` - Custom PR message
- `--gist` - Force gist creation
- `--repo` - Force repository publishing

## Manual Publishing

If you cannot use the CLI:

### Step 1: Create Gist

Create a PUBLIC gist with your module code including required frontmatter.

### Step 2: Generate Metadata

```bash
node registry/tools/publish.js @username/module-name <gist-url>
```

### Step 3: Submit PR

1. Fork mlld-lang/registry
2. Add entry to modules.json
3. Run validation: `node tools/validate.js`
4. Submit pull request

## Module Format

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

## Tools

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

## Guidelines

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

## Security

### Content Integrity
- All modules are addressed by content hash
- Registry is versioned on GitHub
- Gist URLs include specific commit hashes
- Local verification of content hashes

### PUBLIC Nature
- All modules in this registry are PUBLIC
- Anyone can view and use your code
- Do not publish sensitive or proprietary code
- For private modules, use --private flag

### Reporting Issues
If you discover a security issue in a module:
1. Contact the module author first
2. If no response, open an issue here
3. For urgent issues, email security@mlld-lang.org

## Contributing

### Submission Requirements

1. Module must add value to the ecosystem
2. Code must be tested and documented
3. No duplicates of existing functionality
4. Responsive to maintainer feedback

### Automated Review

All submissions are reviewed by an LLM system that:
- Validates structure and metadata
- Checks for security issues
- Assesses code quality
- Auto-merges approved modules

See [docs/LLM-REVIEW-SYSTEM.md](docs/LLM-REVIEW-SYSTEM.md) for details.

### Additional Documentation

- [Setup Guide](docs/SETUP.md) - Configuration for maintainers
- [Self-Governance](docs/SELF-GOVERNANCE.md) - How the registry governs itself
- [LLM Review System](docs/LLM-REVIEW-SYSTEM.md) - Automated review details
- [Known Issues](docs/KNOWN-ISSUES.md) - Current limitations and workarounds

## Resources

- [mlld Documentation](https://mlld.ai/docs)
- [mlld GitHub](https://github.com/mlld-lang/mlld)
- [Registry Issues](https://github.com/mlld-lang/registry/issues)
- [Example Modules](https://github.com/mlld-lang/mlld/tree/main/examples)

## License

Registry infrastructure: MIT
Individual modules: Licensed by their authors (CC0 required for registry inclusion)
