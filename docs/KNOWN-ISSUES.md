# Known Issues and Workarounds

This document tracks known issues encountered while building the mlld registry.

## mlld Language Issues

### 1. Template Interpolation in @exec Commands

**Issue**: Using template variables inside `@exec` command definitions causes `ENAMETOOLONG` error.

**Example**:
```mlld
@text prompt = [[Some text]]
@exec call_api = @run [curl -d '{"content": "'"$prompt"'"}']  # Fails
```

**Workaround**: Use @ variable syntax in commands instead:
```mlld
@exec call_api = @run [curl -d '{"content": "@prompt"}']
```

**Status**: Reported as issue #105 in mlld repository

### 2. @data with @INPUT Parse Error

**Issue**: Parser fails on seemingly valid template syntax after @data assignment.

**Example**:
```mlld
@data input_data = @INPUT
@text result = [[Data: {{input_data}}]]  # Parse error at [[
```

**Workaround**: Use alternative syntax or restructure the code.

**Status**: Under investigation

### 3. Exec Output Capture

**Issue**: Cannot capture output from @exec commands into variables.

**Workaround**: Use @run directly with variable assignment:
```mlld
@text output = @run [command]
```

**Status**: Feature pending in mlld roadmap

## Registry-Specific Issues

### 1. GitHub Actions Bot Identity

**Issue**: Reviews appear from generic `github-actions[bot]` account.

**Workaround**: Enhanced messaging to identify as "mlld Registry Bot".

**Future**: Consider GitHub App for dedicated bot identity.

### 2. Environment Variable Passing

**Issue**: Initial confusion about @input vs @stdin for environment variables.

**Solution**: Use `@import { VAR } from @input` for environment variables.

### 3. JavaScript Execution

**Issue**: JavaScript in @exec requires specific syntax.

**Correct Syntax**:
```mlld
@exec name(params) = @run js (params) [
  // JavaScript code here
]
```

**Note**: Only vanilla JavaScript supported, no npm packages.