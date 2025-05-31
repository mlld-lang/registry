Update: Found the solution! JSON field access works perfectly with the import destructuring syntax:

```mlld
@import { pr_number, repo_owner, repo_name } from @input
```

This correctly extracts individual fields from JSON passed via stdin. Thanks for the quick help - this resolves our parsing issue!