# mlld registry

All modules in this registry are PUBLIC and accessible to anyone. For private modules, use the --private flag with `mlld publish`

## Publishing a Module

```bash
mlld publish my-module.mld.md
```

## How It Works

The mlld registry uses a modular architecture with GitHub for storage:

1. Each module has its own file at `modules/{author}/{module}.json`
2. GitHub Actions builds combined `modules.json` on merge
3. Modules stored as GitHub gists or in repositories
4. Content addressing via commit hashes
5. Local caching for offline access

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
3. Create module with `.mld.md` extension (`mlld init` will set this up)

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

## Module Format

### Individual Module File Structure

Each module is stored in `modules/{author}/{module}.json`:

```json
{
  "name": "utils",
  "author": "alice",
  "version": "1.0.0",
  "about": "Common utilities for mlld scripts",
  "needs": [],
  "license": "CC0",
  "source": {
    "type": "gist",
    "url": "https://gist.githubusercontent.com/alice/8bb1c645c1cf0dd515bd8f834fb82fcf/raw/59d76372d3c4a93e7aae34cb98b13a8e99dfb95f/utils.mld",
    "contentHash": "sha256:abcdef123456...",
    "gistId": "8bb1c645c1cf0dd515bd8f834fb82fcf"
  },
  "dependencies": {},
  "keywords": ["utils", "helpers", "strings"],
  "mlldVersion": ">=1.0.0",
  "publishedAt": "2024-01-15T10:30:00Z",
  "publishedBy": 123456
}
```

### Field Descriptions

- **name** (required): Module name (lowercase with hyphens)
- **author** (required): GitHub username
- **version** (optional): Semantic version
- **about** (required): Clear description of what the module does
- **needs** (required): Runtime dependencies array (e.g., ["js", "node"])
- **license** (required): Must be "CC0"
- **source** (required): Object with source information
  - `type`: Source type - "gist" or "github"
  - `url`: Full raw content URL
  - `contentHash`: SHA256 hash of the content
  - `gistId`: The gist ID (for gists)
  - `repository`: Repo details (for GitHub repos)
- **dependencies**: Map of module names to their commit hashes
- **keywords**: Array of lowercase keywords for discovery
- **mlldVersion**: Required mlld version (e.g., ">=1.0.0")
- **publishedAt**: ISO 8601 timestamp (set automatically)
- **publishedBy**: GitHub user ID (set automatically)

## Tools

### Build Script

Builds and validates the combined registry:

```bash
# Build registry from module files
node tools/build-registry.js
```

This script:
- Finds all module JSON files
- Validates structure and metadata
- Ensures path matches module content
- Generates `modules.json` and `modules.generated.json`

### Validation Script

Validates the entire registry:

```bash
# Validate all modules
node tools/validate.js

# Validate with detailed report
node tools/validate.js --save-report
```

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

All submissions are reviewed by Claude AI via Vercel webhook:
- Validates structure and metadata
- Checks for security issues
- Assesses code quality
- Posts review comments on PR
- Human maintainers make final merge decision

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
