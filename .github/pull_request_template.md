## Type of Change
- [ ] New module registration
- [ ] Module update
- [ ] Module removal
- [ ] Documentation update
- [ ] Other (please describe)

## Module Information (if applicable)
**Module ID**: `@username/module-name`
**Gist URL**: https://gist.github.com/...

## Checklist
### For New Modules
- [ ] Module name follows format: `@username/module-name`
- [ ] Gist is PUBLIC and accessible
- [ ] Gist includes required frontmatter with author, module, and description
- [ ] Raw URL includes specific commit hash (40 characters)
- [ ] Module entry added to `modules.json`
- [ ] Validation passes: `node tools/validate.js`
- [ ] Dependencies listed with commit hashes
- [ ] Keywords are relevant and lowercase

### For Updates
- [ ] New commit hash reflects latest changes
- [ ] URL updated with new hash
- [ ] Validation still passes
- [ ] Breaking changes documented (if any)

## Description
<!-- Describe your module and what it does -->

## Testing
<!-- Show how to test your module -->
```mlld
@import { ... } from "@username/module-name"
# Example usage
```

## Additional Notes
<!-- Any other information reviewers should know -->