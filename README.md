# mlld Registry

A decentralized registry for mlld modules and MCP servers, with security advisories.

## What This Registry Contains

1. **mlld Modules** - Reusable prompt engineering components hosted on GitHub Gists
2. **MCP Servers** - Model Context Protocol servers that extend LLM capabilities
3. **Security Advisories** - Warnings about known vulnerabilities

## Registry Structure

Each GitHub user maintains their own registry:

```
{username}/
├── registry.json    # Modules and servers
└── advisories.json  # Security advisories (optional)
```

The CI system builds global indexes for searching:

```
_index/
├── modules.json     # All mlld modules
├── servers.json     # All MCP servers
├── search.json      # Lightweight search index
└── advisories.json  # All advisories
```

## Registering Your Items

### 1. Fork this repository
### 2. Create your user directory (if it doesn't exist)
### 3. Create or update `{username}/registry.json`:

```json
{
  "version": "1.0.0",
  "updated": "2024-05-28T00:00:00Z",
  "author": "yourusername",
  "modules": {
    "json-utils": {
      "gist": "gist-id-here",
      "description": "JSON formatting utilities",
      "tags": ["json", "utils", "formatting"],
      "created": "2024-05-28T00:00:00Z"
    }
  },
  "servers": {
    "github-mcp": {
      "repository": "https://github.com/yourusername/github-mcp-server",
      "description": "MCP server for GitHub API access",
      "capabilities": ["read", "write", "tool-use"],
      "tags": ["github", "api", "mcp"],
      "created": "2024-05-28T00:00:00Z"
    }
  }
}
```

### 4. Submit a Pull Request

## mlld Modules

Modules are reusable mlld scripts hosted as GitHub Gists.

### Module Entry Format

```json
"module-name": {
  "gist": "gist-id-here",
  "description": "Brief description",
  "tags": ["tag1", "tag2"],
  "created": "2024-05-28T00:00:00Z"
}
```

### Usage

```meld
@import { format_json } from "mlld://yourusername/json-utils"
```

## MCP Servers

Model Context Protocol servers extend LLM capabilities with tools and data access.

### Server Entry Format

```json
"server-name": {
  "repository": "https://github.com/user/repo",
  "description": "What the server does",
  "capabilities": ["read", "write", "tool-use", "query"],
  "tags": ["category", "feature"],
  "created": "2024-05-28T00:00:00Z"
}
```

### Capabilities

Standard MCP capabilities:
- `read` - Can read data/files
- `write` - Can modify data/files
- `tool-use` - Provides tools/functions
- `query` - Can execute queries
- `stream` - Supports streaming responses

## Security Advisories

Report vulnerabilities in your own modules/servers or submit general advisories.

### Creating Advisories

Create or update `{username}/advisories.json`:

```json
{
  "version": "1.0.0",
  "author": "yourusername",
  "advisories": [
    {
      "id": "2024-001",
      "created": "2024-05-28T00:00:00Z",
      "severity": "high|medium|low",
      "affects": ["module-name", "server-name"],
      "gists": ["affected-gist-ids"],
      "repositories": ["affected-repo-urls"],
      "type": "vulnerability-type",
      "description": "Detailed description of the issue",
      "recommendation": "How to fix or work around"
    }
  ]
}
```

### Advisory Types

Common types:
- `command-injection` - Unsafe command execution
- `data-exposure` - Leaks sensitive information
- `privilege-escalation` - Gains unauthorized access
- `denial-of-service` - Can crash or hang
- `insecure-default` - Unsafe default configuration

## Naming Guidelines

- Use lowercase with hyphens: `json-utils`, not `JsonUtils`
- Be descriptive but concise
- Avoid generic names like `utils` or `helper`
- No prefixes like `mlld-` or `mcp-`

## Searching

Once indexed, items can be searched via CLI:

```bash
# Search mlld modules
mlld registry search json

# Search MCP servers  
mlld registry search-servers github

# Get details
mlld registry info username/module-name
```

## Guidelines

1. **Only register items you own or maintain**
2. **Keep descriptions clear and accurate**
3. **Use relevant tags for discoverability**
4. **Update timestamps when you modify items**
5. **Report security issues responsibly**
6. **Test before registering**

## For MCP Server Users

While this registry tracks MCP servers, installation is handled by your LLM client:

- **Claude Desktop**: Add to `claude_desktop_config.json`
- **Other Tools**: Follow tool-specific instructions

The registry provides:
- Discovery of available servers
- Security advisory warnings
- Capability information
- Links to repositories

## Contributing

1. Fork the repository
2. Create your user directory
3. Add your modules/servers
4. Submit a PR
5. CI will validate and build indexes

## Getting Help

- Check existing entries for examples
- Open an issue for questions
- Email: registry@mlld-lang.org

## Future Plans

- Web interface for browsing
- API for programmatic access
- Integration with MCP tools
- Automated security scanning
- Download statistics