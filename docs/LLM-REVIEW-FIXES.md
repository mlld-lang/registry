# LLM Review System Fixes

## Issues Found and Fixed

### 1. Outdated mlld Version
- **Problem**: Workflow using `mlld@1.0.0-rc-3` 
- **Fix**: Updated to `mlld@latest` in workflow

### 2. Variable Interpolation in Bash Commands
- **Problem**: Variables like `@review.recommendation` and `@prompt` don't interpolate in bash commands
- **Fix**: 
  - Changed output strategy to use `@add` directives with markers that workflow can parse
  - Fixed parameter interpolation in bash using `${param}` syntax instead of `@param`

### 3. Module Parameter References
- **Problem**: Using `@param` syntax inside JavaScript exec functions
- **Fix**: Parameters are available as plain variables in JavaScript context

### 4. Claude CLI Package
- **Status**: Kept `@anthropic-ai/claude-code` package - it provides the `claude` CLI command used by the scripts

## Updated Files

### Workflow (.github/workflows/llm-review.yml)
- Updated mlld version to latest
- Removed non-existent claude-code package
- Added parsing logic for structured output

### Scripts (llm/scripts/)
- Fixed import paths in review-pr.mld and check-allowlist.mld
- Changed output format to use markers for GitHub Actions parsing

### Modules (llm/modules/)
- Fixed parameter references in all JavaScript exec functions
- Removed explicit module exports (using auto-export)

## Testing

To test the LLM review system locally:

```bash
cd registry
export PR_NUMBER=123
export REPO_OWNER=mlld-lang
export REPO_NAME=registry
export PR_AUTHOR=testuser
export ANTHROPIC_API_KEY=your-key
export GITHUB_TOKEN=your-token

mlld llm/scripts/review-pr.mld
```

## Next Steps

1. The system should now work when PRs are created
2. Monitor the first few PRs to ensure the workflow runs correctly
3. May need to adjust the parsing logic based on actual output