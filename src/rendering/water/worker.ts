/// <reference lib="webworker" />
import { WaterSurfaceMesher } from './mesher';
import { waterBuffersTransferables, type WaterMeshRequest, type WaterMeshResponse } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const mesher = new WaterSurfaceMesher();
scope.onmessage = (event: MessageEvent<WaterMeshRequest>) => {
  const request = event.data;
  try {
    const result = mesher.build(request);
    scope.postMessage(result, [result.cells.buffer as ArrayBuffer, ...waterBuffersTransferables(result),...(result.field?[result.field.encoded.buffer as ArrayBuffer,result.field.lookup.buffer as ArrayBuffer]:[])]);
  } catch (error) {
    const result: WaterMeshResponse = { type: 'error', epoch: request.epoch, revision: request.revision,
      message: error instanceof Error ? error.message : String(error) };
    scope.postMessage(result);
  }
};
