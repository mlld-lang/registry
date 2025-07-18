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
└── run/             # Main workflows
```

## How It Works

1. **PR Created**: GitHub webhook sent to Vercel service
2. **Vercel Service**: Fetches and runs `review-pr.mld`
3. **Review Process**: Script orchestrates the review:
   - Validates environment variables
   - Fetches PR data via GitHub API
   - Extracts module from new file structure
   - Generates review prompt from template
   - Queries Claude for review
   - Posts review comment on PR

## Running Locally

### Test Environment Validation
```bash
mlld llm/run/review-pr.mld
```

### Test with Mock PR
```bash
PR_NUMBER=123 \
REPO_OWNER=mlld-lang \
REPO_NAME=registry \
GITHUB_TOKEN=$GITHUB_TOKEN \
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
mlld llm/run/review-pr.mld
```


## Modules

Note: The following core modules are imported from @mlld:
- **@mlld/env** - Environment variable utilities
- **@mlld/github** - GitHub API operations

### registry-utils
Module validation and parsing
- `extractModuleFromPR(prFiles, diff)` - Extract module from PR files
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
