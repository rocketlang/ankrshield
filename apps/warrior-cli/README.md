# @xshieldai/warrior

Self-host the xShield threat intelligence platform in one command.

## Quick Start

```bash
npx @xshieldai/warrior start
```

## Commands

| Command                 | Description                |
| ----------------------- | -------------------------- |
| `warrior start`         | Start the API server       |
| `warrior scan <domain>` | Scan a domain              |
| `warrior status`        | Check if server is running |
| `warrior setup`         | Interactive setup wizard   |

## Self-hosting

```bash
# With a database
warrior start --db postgresql://user:pass@localhost/xshield

# Custom port
warrior start --port 8080

# Scan from CLI
warrior scan example.com --key YOUR_API_KEY
```

Apache 2.0 · Built by ANKR Labs, Gurgaon

---
*Co-authored by Capt Anil Kumar Sharma, Powerp Box IT Solutions Pvt Ltd*
