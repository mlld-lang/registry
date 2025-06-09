# Registry Review System Transition Plan

## Overview

This document outlines the transition from the current bash-heavy review system to a clean, modular mlld-based approach.

## Phase 1: Local Implementation (Immediate)

### 1.1 Create Directory Structure
```
registry/
├── llm/
│   ├── modules/
│   │   ├── env-utils.mld
│   │   ├── github-utils.mld
│   │   ├── registry-utils.mld
│   │   ├── claude-utils.mld
│   │   └── comparison-utils.mld
│   ├── templates/
│   │   ├── review-prompt.mld
│   │   ├── github-review.mld
│   │   ├── review-context.mld
│   │   └── summary-report.mld
│   └── scripts/
│       ├── review-pr.mld
│       └── check-allowlist.mld
```

### 1.2 Files to Remove
- `tools/llm-review-claude-cli.mld` - replaced by `llm/scripts/review-pr.mld`
- `tools/llm-review-debug.mld` - functionality integrated into main workflow

### 1.3 Update GitHub Actions
Update `.github/workflows/llm-review.yml` to use new scripts:
- Change `mlld tools/llm-review-claude-cli.mld` to `mlld llm/scripts/review-pr.mld`
- Remove debug script execution
- Simplify environment variable handling

## Phase 2: Testing (Days 1-3)

### 2.1 Local Testing
```bash
# Test environment validation
PR_AUTHOR="testuser" mlld llm/scripts/check-allowlist.mld

# Test with mock data (no API calls)
PR_NUMBER=123 \
REPO_OWNER=mlld-lang \
REPO_NAME=registry \
GITHUB_TOKEN=mock \
ANTHROPIC_API_KEY=mock \
mlld llm/scripts/review-pr.mld
```

### 2.2 Integration Testing
- Create test PRs in a fork
- Verify GitHub Actions workflow
- Test both trusted and untrusted author flows

## Phase 3: Module Publishing (Week 2)

### 3.1 Prepare Modules for Publishing
Add proper metadata to each module:
```mlld
---
module: env-utils
author: mlld-dev
version: 1.0.0
description: Environment variable validation utilities
mlld-version: ">=1.0.0-rc"
source:
  url: https://github.com/mlld-lang/registry/tree/v1.0.0/llm/modules/env-utils.mld
---
```

### 3.2 Publish Modules
```bash
# Publish general-purpose utilities
mlld publish llm/modules/env-utils.mld
mlld publish llm/modules/comparison-utils.mld

# Publish GitHub-specific utilities (might stay local)
mlld publish llm/modules/github-utils.mld
mlld publish llm/modules/registry-utils.mld
```

### 3.3 Create Registry Entries
Create JSON entries in `modules/mlld-dev/`:
- `modules/mlld-dev/env-utils/module.json`
- `modules/mlld-dev/comparison-utils/module.json`
- etc.

## Phase 4: Import Migration (Week 3)

### 4.1 Update Import Statements
Search and replace in all `.mld` files:

```mlld
# Before:
@import { validateEnvironment } from [@./llm/modules/env-utils.mld]

# After:
@import { validateEnvironment } from @mlld-dev/env-utils
```

### 4.2 Verification
- Run all workflows with new imports
- Ensure module resolution works correctly
- Test in CI/CD environment

## Phase 5: Documentation (Week 3)

### 5.1 Update README
- Document the new LLM review system
- Add examples of extending the system
- Document available modules

### 5.2 Create Module Documentation
For each published module:
- API documentation
- Usage examples
- Best practices

## Benefits of New System

1. **Modularity**: Each component can be tested/updated independently
2. **Readability**: Workflows read like documentation
3. **Reusability**: Modules can be used in other projects
4. **Testability**: Each module has clear inputs/outputs
5. **Maintainability**: Clear separation of concerns
6. **Extensibility**: Easy to add new validation rules or review criteria

## Rollback Plan

If issues arise:
1. Keep old files in a `legacy/` directory initially
2. GitHub Actions can be reverted by changing the script path
3. Local imports can coexist with registry imports

## Success Criteria

- [ ] All PRs are reviewed successfully
- [ ] Trusted authors are auto-approved
- [ ] Non-trusted authors get Claude reviews
- [ ] Error handling works properly
- [ ] Modules are published and resolvable
- [ ] Documentation is complete

## Timeline

- **Day 1**: Implement local version
- **Days 2-3**: Test thoroughly
- **Week 2**: Publish modules
- **Week 3**: Migrate imports and document
- **Week 4**: Monitor and optimize

## Notes

- Start with local imports to avoid bootstrapping issues
- Keep Claude API calls in a single module for easy updates
- Consider rate limiting and cost management
- Monitor for edge cases in PR parsing