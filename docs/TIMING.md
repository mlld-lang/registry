# Module Availability Timing

This document explains when newly published modules become available to users.

## Quick Summary

- **Best case**: Instant (when using GitHub fallback)
- **Typical case**: 1-5 minutes (DNS propagation)
- **Worst case**: 10-15 minutes (ISP DNS caching)

## Resolution Strategy

The mlld client uses a multi-tier resolution strategy to minimize delays:

### 1. GitHub Registry (Primary)
- **Availability**: Instant after PR merge
- **How**: Direct fetch from `modules.json`
- **Use case**: New modules, updates

### 2. DNS Resolution (Secondary)
- **Availability**: 1-15 minutes after PR merge
- **TTL**: 60 seconds (1 minute)
- **Use case**: Decentralized resolution

### 3. Local Cache (Fallback)
- **Availability**: Instant for previously resolved modules
- **Use case**: Offline support, performance

## Timeline Breakdown

### T+0: PR Merged
- GitHub Actions validates modules
- DNS sync starts

### T+30s: DNS Updated
- DNSimple API updates TXT records
- 60-second TTL applied

### T+1min: Fast DNS Resolvers
- Cloudflare (1.1.1.1) sees updates
- Google (8.8.8.8) sees updates

### T+5min: Most Users
- ISP DNS servers refresh
- Module available globally

### T+15min: All Users
- Even aggressive caching cleared
- 100% availability

## Recommendations for Module Authors

### For Immediate Testing
After your PR is merged:
1. Use `--no-cache` flag: `mlld --no-cache your-script.mld`
2. Or specify DNS: `mlld --dns 1.1.1.1 your-script.mld`
3. Or wait 1-2 minutes for automatic propagation

### For Production Use
- Plan for 5-minute availability window
- Test locally before publishing
- Use lock files to pin versions

## Why Not Instant DNS?

While we use a 1-minute TTL, DNS has inherent delays:
- Multiple cache layers (resolver → ISP → local)
- Not all resolvers honor low TTLs
- Security features may enforce minimum cache times

## Future Improvements

1. **CDN Integration**: Edge servers for instant updates
2. **WebSocket Notifications**: Real-time module availability
3. **P2P Discovery**: DHT-based resolution
4. **IPFS Integration**: Content-addressed instant access

## Technical Details

### DNS Query Path
```
mlld client → OS resolver → ISP DNS → Root servers → .ai TLD → mlld.ai NS → TXT record
```

### Cache Layers
1. **OS Cache**: Usually honors TTL
2. **Router Cache**: May cache 5-30 minutes
3. **ISP Cache**: Varies widely (1-60 minutes)
4. **Public Resolvers**: Generally honor TTL

### Using Specific DNS Servers

To bypass ISP caching, users can configure their DNS:

```bash
# Linux/Mac
export MLLD_DNS_SERVERS="1.1.1.1,8.8.8.8"

# Or in mlld config
{
  "registry": {
    "dnsServers": ["1.1.1.1", "8.8.8.8"]
  }
}
```