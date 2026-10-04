/// <reference lib="webworker" />
import { meshTransferables } from './mesh-preparation';
import type { TerrainRequest, TerrainResponse } from './terrain-protocol';
import { TerrainRuntime } from './terrain-runtime';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const runtime = new TerrainRuntime();
scope.onmessage = (event: MessageEvent<TerrainRequest>) => {
  const message = event.data;
  try {
    const result = runtime.handle(message);
    if (result) scope.postMessage(result, result.type === 'mesh' ? meshTransferables([result.mesh]) : []);
  } catch (error) {
    const response: TerrainResponse = { type: 'error', epoch: message.type === 'mesh' ? message.job.epoch : message.epoch, message: String(error) };
    scope.postMessage(response);
  }
};
