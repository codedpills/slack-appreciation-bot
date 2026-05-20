import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';

const transport =
  process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined;

export const logger = pino({
  level,
  ...(transport ? { transport } : {}),
  base: { service: 'slack-appreciation-bot' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['botToken', 'token', 'secret', '*.botToken', '*.token'],
    censor: '[REDACTED]'
  }
});

export type Logger = typeof logger;
