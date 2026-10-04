import { SdfWorld } from './density';
import { prepareTerrainMesh } from './mesh-preparation';
import { meshBrick } from './mesher';
import type { TerrainRequest, TerrainResponse } from './terrain-protocol';

/** Stateful, DOM-free meshing endpoint, also exercised by the Node responsiveness benchmark. */
export class TerrainRuntime {
  private world: SdfWorld | null = null;
  private epoch = 0;
  handle(message: TerrainRequest): TerrainResponse | null {
    if (message.type === 'init') {
      this.epoch = message.epoch;
      this.world = new SdfWorld(message.bounds, message.generator);
      for (const edit of message.edits) this.world.apply(edit);
      return null;
    }
    const epoch = message.type === 'mesh' ? message.job.epoch : message.epoch;
    if (!this.world || epoch !== this.epoch) return null;
    if (message.type === 'edits') {
      if (message.base !== this.world.edits.length) throw new Error('Terrain edit stream is out of sequence');
      for (const edit of message.edits) this.world.apply(edit);
      return null;
    }
    if (message.job.editCount !== this.world.edits.length) throw new Error('Terrain job has an outdated world revision');
    const started = performance.now();
    const mesh = prepareTerrainMesh(meshBrick(this.world, message.job.brick), message.job.brick);
    mesh.milliseconds = performance.now() - started;
    return { type: 'mesh', job: message.job, mesh };
  }
}
