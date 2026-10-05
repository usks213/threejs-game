/** World-owned supplies for the four original adventure bosses. */
export const ADVENTURE_BOSS_REWARDS:Readonly<Record<string,readonly (readonly [string,number])[]>>={
 loadwarden:[['crystal',2]],echowarden:[['crystal',2]],sailwarden:[['crystal',2]],stormcore:[['star',4],['crystal',6]],
};
export const hasAdventureBossReward=(definition:string)=>Object.hasOwn(ADVENTURE_BOSS_REWARDS,definition);
