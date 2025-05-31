## Bug Report

The mlld parser is throwing a parse error on what appears to be valid template syntax.

### Error
```
MlldParse: Parse error: Expected "@", "@add", "@run", Any path expression, Content with @var interpolation, Path starting with @variable context, Section extraction, String Literal, Wrapped template content, bracketed path with section, or whitespace but "[" found. at line 8, column 16
```

### Failing Code
```mlld
@data input_data = @INPUT

@text result = [[
Received input data:
{{input_data}}
]]

@add @result
```

The error points to the opening `[[` of the template block on line 8, column 16.

### Expected Behavior
This should parse successfully as it follows the documented template syntax pattern.

### Context
Discovered while working on the registry LLM review system. The `[[` template syntax with `{{variable}}` interpolation should be valid according to mlld syntax rules.

### Environment
- Working in mlld registry development
- Using latest published mlld version