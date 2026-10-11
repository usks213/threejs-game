import {GameSimulation} from '../simulation/game-simulation';
import {validateSave,type WorldSave} from './format';
import {newProgression} from '../game/progression-state';
/** Produces a detached next voyage. Persistence must archive+replace atomically;
 * this pure preparation never touches the current world or its storage. */
export function prepareNextAdventureCycle(previous:WorldSave):WorldSave{
 const old=validateSave(structuredClone(previous));if(old.generator!==4||!old.adventure?.defeated.includes('stormcore'))throw Error('嵐心を鎮めた個人ワールドから次の航路へ進めます');
 const cycle=(old.adventure.siteWorld?.regional?.cycle??0)+1;if(cycle>99)throw Error('航路の記録上限です。通常の新規ワールドを選んでください');
 const next=new GameSimulation(undefined,4).save(),s=next.adventure!,oldProgress=old.adventure.progression,records=[...new Set([...(oldProgress?.records??[]),...(oldProgress?.heritage?.records??[])])],best=[old.adventure.race?.best,oldProgress?.heritage?.bestRace].filter((v):v is number=>v!==undefined);
 s.progression={...newProgression(),heritage:{cycles:cycle,records,...(old.adventure.siteWorld?.regional?.epilogue.length===3||oldProgress?.heritage?.memorial?{memorial:true}:{}),...(best.length?{bestRace:Math.min(...best)}:{})}};
 s.siteWorld!.regional!.cycle=cycle;s.seconds=cycle%3*240;
 // World geometry is the authored seed, while branch weights, circuit routes and
 // initial time differ. Collection recipes and former best time survive as records.
 return validateSave(next);
}
