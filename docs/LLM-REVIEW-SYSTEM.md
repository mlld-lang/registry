# LLM Review System

The mlld registry uses an LLM-powered review system to evaluate module submissions.

## Overview

Pull requests containing new modules are automatically reviewed by Claude AI. The system uses mlld scripts to analyze module submissions and provide review decisions.

## Process

### 1. Module Submission
Authors submit modules via:
- Manual: `node tools/publish.js` generates metadata and instructions
- Automated: `node tools/auto-publish.js` creates PR directly

### 2. Review Pipeline
On PR creation:
1. Validation workflow checks structure and metadata
2. LLM review workflow runs Claude analysis
3. Claude returns one of three decisions:
   - APPROVE - Module meets standards
   - REQUEST_CHANGES - Issues need addressing
   - COMMENT - Requires human review

### 3. Actions
- APPROVE: PR eligible for auto-merge when checks pass
- REQUEST_CHANGES: Author must address feedback
- COMMENT: Maintainers review Claude's analysis

## Technical Details

### Environment Variables
```
ANTHROPIC_API_KEY     # Claude API key
```

### Components

**LLM Review Script** (`tools/llm-review-claude-cli.mld`)
- Reads PR data from environment
- Fetches diff and changes
- Constructs review prompt
- Calls Claude via CLI
- Sets GitHub Actions variables

**Auto-Merge Script** (`tools/llm-auto-merge.mld`)
- Monitors approved PRs
- Waits for check completion
- Merges when conditions met
- Updates registry on merge

### Review Criteria

**Quality Standards**
- Correct module name format (@username/module-name)
- Documentation and examples included
- Solves real problems
- Valid mlld syntax

**Security Checks**
- No hardcoded secrets
- Safe command execution
- No malicious patterns
- Input validation present

**Registry Requirements**
- Valid source URL (gist or repository)
- Commit hash references
- Required metadata complete
- Suitable for public use

## Bot Identity

Reviews posted by GitHub Actions bot:
- Clear decision indicators
- Claude attribution in messages
- Actionable feedback provided

## Limitations

1. mlld exec output capture pending implementation
2. Some template interpolation edge cases
3. Uses github-actions[bot] instead of dedicated app

## Monitoring

System improvements through:
- Logged review decisions
- Prompt refinement based on outcomes
- Human override capability
- Community feedback integration

## Governance Model

The system provides:
- Decentralized operation
- Transparent public reviews
- Consistent evaluation
- Community-driven evolution