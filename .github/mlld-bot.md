# mlld Registry Bot

The mlld Registry Bot is our automated reviewer that helps maintain quality standards for the mlld module registry.

## Bot Identity

- **Name**: mlld Registry Bot
- **Avatar**: 🤖
- **Powered by**: Claude AI (Anthropic)
- **Account**: Uses GitHub Actions bot (`github-actions[bot]`)

## Responsibilities

1. **Review new module submissions** - Analyzes PR content for quality and compliance
2. **Check registry requirements** - Validates module metadata and structure
3. **Security assessment** - Identifies potential security concerns
4. **Provide feedback** - Offers constructive suggestions for improvement

## Review Decisions

The bot can make three types of decisions:

- ✅ **APPROVE** - Module meets all requirements and is ready to merge
- ❌ **REQUEST_CHANGES** - Issues found that must be addressed
- 💬 **COMMENT** - Needs human review or has non-blocking suggestions

## Bot Messages

All bot messages follow this format:

```
🤖 **mlld Registry Bot**

[✅|❌|💬] **Decision: [APPROVED|CHANGES REQUESTED|COMMENT]**

[Detailed review feedback from Claude]

---
*I am an automated reviewer powered by Claude AI. I help maintain quality standards for the mlld module registry.*
```

## Future Enhancements

If you want a dedicated bot account instead of using github-actions[bot]:

### Option 1: GitHub App (Recommended)
- Create a GitHub App specifically for mlld registry
- Install it on the registry repository
- Use app authentication instead of GITHUB_TOKEN
- Benefits: Custom avatar, name, and better rate limits

### Option 2: Dedicated Bot Account
- Create a new GitHub account (e.g., `mlld-bot`)
- Generate a personal access token
- Store as `BOT_GITHUB_TOKEN` secret
- Update workflow to use bot token

For now, we're using the built-in github-actions bot with enhanced messaging to clearly identify it as the mlld Registry Bot.