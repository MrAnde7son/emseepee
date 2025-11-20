# Telemetry Implementation

Hakuna uses [PostHog](https://posthog.com/) for telemetry, similar to how n8n handles analytics. This allows the project to support both self-hosted (open source) and cloud-managed deployments.

## Features

- **Self-hosted mode (opt-in)**: Telemetry is disabled by default. Users must explicitly enable it.
- **Cloud-managed mode (opt-out)**: Telemetry is enabled by default but can be disabled.
- **Privacy-first**: No PII or sensitive data is collected. All data is anonymized.
- **PostHog integration**: Uses PostHog for analytics, which can be self-hosted or use PostHog Cloud.

## Configuration

### Environment Variables

```bash
# Telemetry mode: "self-hosted" or "cloud"
TELEMETRY_MODE=self-hosted

# Enable/disable telemetry (for self-hosted, defaults to false)
TELEMETRY_ENABLED=true

# PostHog API key (optional, can be set in UI)
POSTHOG_API_KEY=phc_...

# PostHog host URL (optional, defaults to PostHog Cloud)
POSTHOG_HOST=https://app.posthog.com
# For self-hosted: POSTHOG_HOST=https://your-posthog-instance.com
```

### Dashboard Settings

Telemetry can be configured via the Settings page in the dashboard:

1. Navigate to **Settings** → **Telemetry & Analytics**
2. Choose deployment mode (Self-Hosted or Cloud-Managed)
3. Enable/disable telemetry
4. Configure PostHog API key and host URL (if needed)

## What Gets Tracked

The following anonymous events are tracked:

- **Tool calls**: When tools are executed through the gateway
  - Tool name
  - Provider
  - Decision (allow/deny/log)
  - Risk level
  - Latency

- **System information** (anonymized):
  - Platform (OS, architecture)
  - Node.js version
  - Application version
  - Instance ID (hashed, anonymized)

## Privacy & Security

- **No PII**: No emails, usernames, or personal information
- **No sensitive data**: Passwords, tokens, secrets are never tracked
- **Anonymized IDs**: User and instance IDs are hashed
- **Configurable**: Can be completely disabled
- **Self-hostable**: PostHog can be self-hosted for complete data control

## Self-Hosting PostHog

If you want to self-host PostHog:

1. Follow the [PostHog self-hosting guide](https://posthog.com/docs/self-host)
2. Set `POSTHOG_HOST` to your PostHog instance URL
3. Set `POSTHOG_API_KEY` to your PostHog project API key

## API Endpoints

### Get Telemetry Status
```
GET /api/telemetry/status
```

Returns:
```json
{
  "enabled": true,
  "mode": "self-hosted",
  "config": { ... }
}
```

### Get Telemetry Config
```
GET /api/telemetry/config
```

Returns:
```json
{
  "mode": "self-hosted",
  "enabled": true,
  "apiKey": "***",
  "host": "https://app.posthog.com"
}
```

### Update Telemetry Config
```
POST /api/telemetry/config
Content-Type: application/json

{
  "enabled": true,
  "mode": "self-hosted",
  "apiKey": "phc_...",
  "host": "https://app.posthog.com"
}
```

## Implementation Details

### Backend

- **Location**: `src/telemetry/`
- **Service**: `src/telemetry/index.ts` - Main telemetry service
- **Config**: `src/telemetry/config.ts` - Configuration management
- **Integration**: Automatically tracks tool calls via `src/logger.ts`

### Frontend

- **Hook**: `dashboard/src/hooks/useTelemetry.ts` - PostHog initialization
- **Settings UI**: `dashboard/src/app/settings/page.tsx` - Telemetry settings component

### Dependencies

- **Backend**: `posthog-node` - PostHog Node.js SDK
- **Frontend**: `posthog-js` - PostHog JavaScript SDK

## Usage Example

```typescript
import { trackTelemetry } from "./telemetry/index.js";

// Track a custom event
await trackTelemetry("custom_event", {
  property1: "value1",
  property2: "value2",
});
```

## Disabling Telemetry

### For Self-Hosted Deployments

1. Set `TELEMETRY_ENABLED=false` in environment variables, OR
2. Disable via Settings UI in the dashboard

### For Cloud-Managed Deployments

1. Set `TELEMETRY_ENABLED=false` in environment variables, OR
2. Disable via Settings UI in the dashboard

## Benefits

- **Product insights**: Understand how features are used
- **Performance monitoring**: Track latency and errors
- **Feature adoption**: See which tools and features are popular
- **Bug detection**: Identify issues through error tracking
- **Privacy-respecting**: No PII, fully anonymized

