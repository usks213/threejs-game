import * as THREE from 'three';
import { buildingVoxels } from '../../game/voxel/model';
import { voxelGroup,disposeVoxelGroup } from '../voxel/object-mesh';
export function buildingKit(){const templates=new Map<string,THREE.Group>();return {make(id:string){let template=templates.get(id);if(!template){template=voxelGroup(buildingVoxels(id));templates.set(id,template);}return template.clone();},dispose(){for(const g of templates.values())disposeVoxelGroup(g);templates.clear();}};}
