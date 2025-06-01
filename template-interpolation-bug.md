# Template variable interpolation in @exec commands causes ENAMETOOLONG error

## Bug Description

When using template variables inside `@exec` command definitions, mlld attempts to interpret the template content as a file path, resulting in an `ENAMETOOLONG` error.

## Steps to Reproduce

1. Create an mlld file with a template variable and an @exec command that tries to use it:

```mlld
@import { PR_NUMBER, REPO_OWNER, REPO_NAME } from @input

@text review_prompt = [[
You are an expert code reviewer for the mlld PUBLIC module registry. Your job is to review pull requests that add new modules to ensure they:

1. **Add genuine value** to the mlld ecosystem
2. **Follow security best practices** (no secrets, safe commands)  
3. **Have proper module structure** and metadata
...
]]

@exec call_claude = @run [
  curl -s https://api.anthropic.com/v1/messages \
    -H "Content-Type: application/json" \
    -d '{
      "messages": [
        {
          "role": "user", 
          "content": "'"$review_prompt"'"
        }
      ]
    }'
]
```

2. Run with environment variables:
```bash
PR_NUMBER="2" REPO_OWNER="mlld-lang" REPO_NAME="registry" mlld file.mld
```

## Actual Behavior

mlld throws an ENAMETOOLONG error, attempting to use the template content as a file path:

```
Unexpected Error: ENAMETOOLONG: name too long, open '/Users/adam/dev/mlld-registry/registry/tools/[
You are an expert code reviewer for the mlld PUBLIC module registry. Your job is to review pull requests that add new modules to ensure they:

1. **Add genuine value** to the mlld ecosystem
2. **Follow security best practices** (no secrets, safe commands)  
3. **Have proper module structure** and metadata
4. **Use appropriate naming** and descriptions
5. **Don't duplicate existing functionality** without good reason
6. **Are actually useful** vs just demo/test modules'
```

Full stack trace:
```
Error: ENAMETOOLONG: name too long, open '/Users/adam/dev/mlld-registry/registry/tools/[
You are an expert code reviewer for the mlld PUBLIC module registry. Your job is to review pull requests that add new modules to ensure they:
...
    at async open (node:internal/fs/promises:634:25)
    at async Object.readFile (node:internal/fs/promises:1238:14)
    at async _NodeFileSystem.readFile (/Users/adam/dev/meld/dist/cli.cjs:26782:12)
    at async evaluateText (/Users/adam/dev/meld/dist/cli.cjs:22814:25)
    at async evaluate (/Users/adam/dev/meld/dist/cli.cjs:24191:24)
    at async interpret (/Users/adam/dev/meld/dist/cli.cjs:31707:3)
```

## Expected Behavior

The template variable should be interpolated into the command string, not interpreted as a file path.

## Analysis

The issue appears to be with the shell-style variable expansion syntax `"'"$review_prompt"'"` inside the @exec command. This syntax is being misinterpreted, causing mlld to:

1. Parse the template content incorrectly
2. Attempt to use it as a file path 
3. Trigger a filesystem operation with an extremely long "filename"

## Workaround

Currently, the only workaround is to hardcode the content instead of using template variables in @exec commands.

## Environment

- mlld version: 1.0.0-rc-1 (local development version)
- OS: macOS
- Node: v23.11.0

## Additional Context

This was discovered while building the self-governing LLM review system for the mlld registry, where we need to pass dynamic content to API calls within @exec commands.