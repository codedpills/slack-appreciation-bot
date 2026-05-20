import dotenv from 'dotenv';

dotenv.config();

interface RequiredVar {
  name: string;
  condition?: () => boolean;
  description: string;
}

const REQUIRED_VARS: RequiredVar[] = [
  { name: 'SLACK_SIGNING_SECRET', description: 'Slack webhook signature verification' },
  { name: 'DATABASE_URL', description: 'PostgreSQL connection string' },
  {
    name: 'SLACK_BOT_TOKEN',
    condition: () => !process.env.SLACK_CLIENT_ID,
    description: 'Bot token (required in single-workspace mode)'
  },
  {
    name: 'SLACK_CLIENT_ID',
    condition: () => !process.env.SLACK_BOT_TOKEN,
    description: 'OAuth client ID (required in multi-workspace mode)'
  },
  {
    name: 'SLACK_CLIENT_SECRET',
    condition: () => !process.env.SLACK_BOT_TOKEN,
    description: 'OAuth client secret (required in multi-workspace mode)'
  },
  {
    name: 'SLACK_STATE_SECRET',
    condition: () => !process.env.SLACK_BOT_TOKEN,
    description: 'OAuth state validation secret (required in multi-workspace mode)'
  },
  {
    name: 'SLACK_INSTALL_ENCRYPTION_KEY',
    condition: () => !process.env.SLACK_BOT_TOKEN,
    description: 'Token encryption key (required in multi-workspace mode)'
  },
  {
    name: 'BILLING_WEBHOOK_SECRET',
    condition: () => process.env.BILLING_ENABLED === 'true',
    description: 'Billing webhook signature secret (required when billing enabled)'
  }
];

export function validateConfig(): void {
  const missing: string[] = [];

  for (const v of REQUIRED_VARS) {
    const shouldCheck = v.condition ? v.condition() : true;
    if (shouldCheck && !process.env[v.name]) {
      missing.push(`  - ${v.name}: ${v.description}`);
    }
  }

  if (missing.length > 0) {
    const message = [
      '',
      '❌ Missing required environment variables:',
      ...missing,
      '',
      'The app cannot start without these. Check your .env file or deployment config.',
      ''
    ].join('\n');
    throw new Error(message);
  }
}

export function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return value.toLowerCase() === 'true';
}
