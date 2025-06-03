# 🤖 LLM Review System

The mlld registry uses an autonomous LLM-powered review system to evaluate module submissions.

## Overview

The registry achieves **self-governance** by using mlld scripts to review mlld modules - a true meta achievement! When modules are submitted via pull request, Claude AI automatically reviews them for quality, security, and usefulness.

## How It Works

### 1. Module Submission
Authors can submit modules using either:
- **Manual process**: `node tools/publish.js` provides instructions
- **Automated process**: `node tools/auto-publish.js` creates PR automatically

### 2. Automated Review Pipeline
When a PR is created:
1. **Validation workflow** checks module structure and metadata
2. **LLM review workflow** runs Claude AI review using mlld
3. Claude provides one of three decisions:
   - ✅ **APPROVE** - Module meets all quality standards
   - ❌ **REQUEST_CHANGES** - Issues must be addressed
   - 💬 **COMMENT** - Needs human review

### 3. Automated Actions
Based on Claude's decision:
- **APPROVE**: PR can be auto-merged when all checks pass
- **REQUEST_CHANGES**: Author must address feedback
- **COMMENT**: Maintainers review Claude's analysis

## Technical Implementation

### Environment Variables
The system requires these GitHub secrets:
```
ANTHROPIC_API_KEY     # Claude API key for reviews
```

### Key Components

#### LLM Review Script (`tools/llm-review-claude-cli.mld`)
- Imports PR data from environment variables
- Fetches PR diff and file changes
- Constructs review prompt with registry requirements
- Calls Claude via CLI for analysis
- Sets GitHub Actions environment variables

#### Auto-Merge Script (`tools/llm-auto-merge.mld`)
- Monitors approved PRs
- Waits for all checks to pass
- Auto-merges when conditions are met
- Registry updated immediately on merge

### Review Criteria

Claude evaluates modules based on:

#### Quality Standards
- Clear, descriptive module names (@username/module-name format)
- Comprehensive documentation and examples
- Real utility - solves actual problems
- Proper mlld syntax and best practices

#### Security Checks
- No hardcoded secrets or API keys
- Safe command execution practices
- No malicious code patterns
- Proper input validation

#### Registry Requirements
- Valid source (GitHub gist or repository)
- Immutable references (commit hashes)
- Required metadata fields
- Appropriate for PUBLIC distribution

## Bot Identity

Reviews are posted by the **mlld Registry Bot**:
- Uses GitHub Actions bot account
- Clear visual indicators for decisions
- Professional messaging with Claude attribution
- Helpful feedback for improvements

## Current Limitations

1. **Output Capture**: mlld exec output capture pending
2. **Template Interpolation**: Some edge cases in command templates
3. **Bot Account**: Currently uses github-actions[bot]
   - Future: Dedicated GitHub App for better identity

## Monitoring and Improvement

The system is designed to learn and improve:
1. Review decisions are logged for analysis
2. Prompts can be refined based on outcomes
3. Human maintainers can override when needed
4. Community feedback shapes review criteria

## Self-Governance Philosophy

The registry embodies mlld's philosophy:
- **Decentralized**: No central authority needed
- **Transparent**: All reviews are public
- **Fair**: Consistent automated evaluation
- **Evolving**: Improves through community input

By using mlld to review mlld modules, we demonstrate the language's capability while building a sustainable, self-governing ecosystem.