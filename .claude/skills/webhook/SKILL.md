# /webhook — Manage Outbound Webhook Notifications

Configure and test webhook notifications to Slack, Teams, or custom endpoints.

## Usage
- `/webhook list` — Show registered webhooks
- `/webhook add <name> <url> <type>` — Register a new webhook (type: slack/teams/custom)
- `/webhook test <hook_id>` — Send a test notification
- `/webhook remove <hook_id>` — Remove a webhook

## Procedure

1. Import `WebhookManager` from `screening/lib/webhooks.mjs`
2. Initialize with config path `.screening/webhooks.json`
3. Based on command:
   - **list**: Show all hooks with name, URL (redacted), type, events, enabled, fail count
   - **add**: Call `register()` with name, URL, type, events (default: alert.critical)
   - **test**: Call `fire('test.ping', { message: 'Hawkeye-Sterling test notification' })`
   - **remove**: Call `remove(hookId)`
4. Available events: screening.high_risk, filing.state_change, audit.chain_break,
   source.stale, case.sla_breach, alert.critical, grade.degraded
5. All webhooks include HMAC-SHA256 signatures for verification

## Output Format
- Webhook table with status
- Delivery result for test (success/failure with HTTP status)
- Event subscription summary
