import { setTimeout } from 'node:timers/promises';
import { errorKind, log } from './log';

export async function connectWithRetry<T>(service: string, connect: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await connect();
    } catch (error) {
      if (attempt === 10) throw error;
      log('error', 'startup.retry', { service, attempt, error: errorKind(error) });
      await setTimeout(1000);
    }
  }
}
