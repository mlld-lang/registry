# LLM-Powered Registry Review System

This directory contains the mlld-based automated review system for the mlld module registry.

## Architecture

The system is built using mlld's orchestration philosophy:
- **Modules**: Reusable utilities for common operations
- **Templates**: Separation of content from logic
- **Scripts**: Orchestration workflows that combine modules and templates

```
llm/
├── modules/         # Reusable utility modules
├── templates/       # Content templates (prompts, formats)
└── scripts/         # Main workflows
```

## How It Works

1. **PR Created**: GitHub Actions triggers the workflow
2. **Allowlist Check**: `check-allowlist.mld` verifies if author is trusted
3. **Review Process**: `review-pr.mld` orchestrates the review:
   - Validates environment variables
   - Fetches PR data via GitHub CLI
   - Extracts and validates module JSON
   - Generates review prompt from template
   - Queries Claude for review
   - Formats response for GitHub

## Running Locally

### Test Environment Validation
```bash
mlld llm/scripts/review-pr.mld
```

### Test with Mock PR
```bash
PR_NUMBER=123 \
REPO_OWNER=mlld-lang \
REPO_NAME=registry \
GITHUB_TOKEN=$GITHUB_TOKEN \
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
mlld llm/scripts/review-pr.mld
```

### Check Allowlist
```bash
PR_AUTHOR=someuser mlld llm/scripts/check-allowlist.mld
```

## Modules

### env-utils
Environment variable validation and utilities
- `validateEnvironment(vars)` - Check if required env vars exist
- `getEnv(name, fallback)` - Get env var with fallback
- `isCI()` - Check if running in CI environment

### comparison-utils
Comparison functions for conditional logic
- `greaterThan(a, b)`, `lessThan(a, b)`, `equals(a, b)`
- `contains(str, substr)`, `matches(str, pattern)`
- `includes(arr, value)`, `isTruthy(value)`

### github-utils
GitHub API operations via CLI
- `getPRData(pr, repo)` - Fetch PR metadata
- `getPRDiff(pr, repo, paths)` - Get diff for specific paths
- `createReview(pr, repo, event, body)` - Post review

### registry-utils
Module validation and parsing
- `extractModuleContent(diff)` - Parse module JSON from git diff
- `validateModule(data)` - Validate module metadata
- `parseModulePath(path)` - Extract author/module from path

### claude-utils
Claude API integration
- `queryClaudeAPI(prompt, maxRetries)` - Query with retry logic
- `parseReviewResponse(response)` - Extract recommendation
- `createFallbackReview(validation)` - Fallback when API fails

## Templates

### review-prompt
Generates the prompt sent to Claude with:
- PR information
- Module content
- Review criteria
- Response format instructions

### github-review
Formats the review for GitHub comments with:
- Decision badge (✅/❌/💬)
- Review reasoning
- Metadata footer

### review-context
Builds structured context object from raw data

### summary-report
Creates human-readable summary of the review process

## Extending the System

### Adding New Validation Rules
Edit `llm/modules/registry-utils.mld`:
```mlld
// Add to validateModule function
if (moduleData.someField && !isValid(moduleData.someField)) {
  issues.push('New validation error message');
}
```

### Adding New Review Criteria
Edit `llm/templates/review-prompt.mld` to add new sections to the prompt.

### Creating New Utilities
1. Create new module in `llm/modules/`
2. Export functions via `@data module = { ... }`
3. Import in scripts with `@import { func } from [@./llm/modules/your-module.mld]`

## Troubleshooting

### Environment Variables Not Found
- Ensure `GITHUB_TOKEN` and `ANTHROPIC_API_KEY` are set
- Check GitHub Actions secrets configuration

### Claude API Failures
- Check API key validity
- Review rate limits
- System falls back to validation-only mode

### Module Parse Errors
- Verify JSON syntax in PR
- Check diff parsing logic in `registry-utils`

## Future Enhancements

1. **Direct API Integration**: Replace Claude CLI with API calls
2. **Parallel Reviews**: Review multiple modules concurrently
3. **Custom Validators**: Plugin system for validation rules
4. **Metrics**: Track review decisions and patterns
5. **Learning**: Improve prompts based on review outcomes