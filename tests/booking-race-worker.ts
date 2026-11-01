import { parentPort, workerData } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { ModularSaasService } from '../src/modular/service.js';
import { SqliteStore } from '../src/modular/stores.js';
const store = new SqliteStore(workerData.file);
try {
  await new ModularSaasService(store, { now: () => workerData.now as string })
    .run(workerData.owner, 'POST', '/api/rentals', workerData.data, randomUUID());
  parentPort!.postMessage({ status: 200 });
} catch (error) { parentPort!.postMessage({ status: (error as { status?: number }).status ?? 500 }); }
finally { store.close(); }
