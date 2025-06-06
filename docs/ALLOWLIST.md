# mlld Registry Allowlist

## Overview

The allowlist is a mechanism to fast-track module publishing for trusted authors who have demonstrated they can publish useful, high-quality modules.

## Benefits

- **Faster Publishing**: PRs from allowlisted authors are auto-approved without LLM review
- **Cost Savings**: Reduces API calls to Claude AI  
- **Recognition**: Shows community trust in your contributions

## How to Get Added

1. **Publish a useful module** that demonstrates:
   - Clear purpose and good documentation
   - Proper mlld syntax and best practices
   - Value to the mlld community

2. **Maintain good standing**:
   - No malicious or spam modules
   - Responsive to issues/feedback
   - Following registry guidelines

3. **Get nominated** by:
   - Core team members
   - Other allowlisted authors
   - Community consensus

## Current Process

1. New authors go through standard LLM review
2. After publishing a useful module, authors can be added to `allowlist.json`
3. Future PRs skip LLM review and get auto-approved
4. Allowlist is reviewed periodically

## Removal

Authors can be removed from the allowlist for:
- Publishing malicious content
- Repeated low-quality submissions
- Violating community guidelines

## Technical Details

The allowlist is stored in `/allowlist.json` and checked by the GitHub Actions workflow before running LLM review. This saves on API costs and speeds up the publishing process for proven contributors.