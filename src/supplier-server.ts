import { createSupplierApp } from './app';
import { config } from './config';
import { errorKind, log } from './log';

const server = createSupplierApp().listen(config.port, config.host);
server.once('listening', () => log('info', 'suppliers.listening', { port: config.port }));
server.once('error', (error) => {
  log('error', 'suppliers.startup_failed', { error: errorKind(error) });
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close());
}
