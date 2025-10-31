import pino from 'pino';
import { config } from '../config/index.js';

/** Create application logger with Pino */
export const logger = pino({
  level: config.logging.level,
  transport: config.server.isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    env: config.server.nodeEnv,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/** Create child logger with additional context */
export const createLogger = (context: Record<string, unknown>) => {
  return logger.child(context);
};
