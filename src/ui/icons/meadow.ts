/** Original UI glyphs. Paths use a shared 24-unit grid, never copied game textures. */
export const meadowIcons:Record<string,string>={
 mushroom:'M3 13C3 1 21 1 21 13H3Zm7 0v8h4v-8M7 9h.1M15 8h.1',
 honey:'M7 5h10l2 6v10H5V11l2-6Zm0-3h10M5 12h14m-10 4h6',
 queenBee:'M9 11c-9-8-8 5 1 4m4-4c9-8 8 5-1 4M9 10h6v10H9V10Zm0 3h6m-6 4h6m-5-7L8 5m6 5 2-5',
 meat:'M9 4c-7 0-8 13 0 13 6 1 13-6 10-10-2-3-7-4-10-3Zm-1 4c-3 0-3 5 0 5 3 0 4-5 0-5Zm8 6 4 5 2-2m-2 2-2 2',
 fish:'M5 12c5-8 11-8 16 0-5 8-11 8-16 0Zm0 0L1 7v10l4-5Zm7-5v10m5-6h.1',
 feather:'M5 22 18 3c-15 0-17 14-7 13M6 16l1-6m2 4 7-2m-5-1 1-5',
 hide:'m7 3 5 3 5-3 4 5-4 4 3 8-8-2-8 2 3-8-4-4 4-5Zm3 7h4m-4 3h4',
 tunic:'m8 3 4 2 4-2 6 5-4 4-2-2v12H8V10l-2 2-4-4 6-5Zm0 12h8',
 pants:'M6 3h12v18h-5l-1-11-1 11H6V3Zm0 4h12',
 helmet:'M4 15V9a8 8 0 0 1 16 0v6M3 15h18m-9-13v13M4 15v6h3m13-6v6h-3',
 cape:'M9 3h6l6 18H3L9 3Zm0 0 3 5 3-5m-3 5v13',
 antler:'M12 22V11m0 4L6 9V2m1 9-5-4V3m10 12 6-6V2m-1 9 5-4V3M6 7l4-3m8 3-4-3',
 seed:'M12 21C1 18 3 9 12 13c9-4 11 5 0 8Zm0-8V3m0 5 6-5m-6 5-5-3',
 coins:'M3 7a9 4 0 0 0 18 0 9 4 0 0 0-18 0Zm0 0v10a9 4 0 0 0 18 0V7M3 12a9 4 0 0 0 18 0',
 gem:'m7 3 10 0 5 7-10 12L2 10l5-7Zm-5 7h20M7 3l5 19 5-19',
 arrow:'M3 21 20 4m-1 5 2-7-7 2M3 16l5 1 1 5',
 spear:'M3 22 16 7m-3 0 8-6-2 10-6-4Z',
 knife:'M4 21 9 15m-3-3 6 6m-4-3L20 2c2 9-3 11-9 15',
 hoe:'M5 22 17 3m-8 3 10 8 3-4L12 2',
 pick:'M6 22 16 3M5 8c4-8 11-5 16 2M13 5l4 3',
 torch:'M9 22V11h6v11H9Zm0-11C3 3 12 8 12 1c0 4 10 5 3 10H9Z',
 coal:'m4 18 1-10 7-5 7 4 3 9-8 6-10-4Zm1-10 8 5 6-6m-6 6 1 9',
 fishingRod:'M4 22 13 2 19 7v13m-3-2a3 3 0 0 0 6 0M6 14l4 2',
 bone:'M8 7a3 3 0 1 0-4 3l10 10a3 3 0 1 0 4-4L8 7Z',
 dandelion:'M12 22V9m0 6-5-3m5 5 6-3M8 4l8 4m-8 0 8-4M12 2v8M6 6h12',
};
for(const id of ['boarMeat','deerMeat','neckTail','cookedBoar','cookedDeer','cookedNeck'])meadowIcons[id]=meadowIcons.meat;
for(const id of ['perch','pike','rawFish','cookedFish'])meadowIcons[id]=meadowIcons.fish;
for(const id of ['deerHide','leatherScraps'])meadowIcons[id]=meadowIcons.hide;
for(const id of ['ragTunic','leatherTunic'])meadowIcons[id]=meadowIcons.tunic;
for(const id of ['ragPants','leatherPants'])meadowIcons[id]=meadowIcons.pants;
for(const id of ['beechSeed','birchSeed','acorn','ancientSeed'])meadowIcons[id]=meadowIcons.seed;
for(const id of ['deerTrophy','stormTrophy','hardAntler'])meadowIcons[id]=meadowIcons.antler;
for(const id of ['woodArrow','fireArrow','flintArrow'])meadowIcons[id]=meadowIcons.arrow;
for(const id of ['amber','amberPearl','ruby','silverNecklace'])meadowIcons[id]=meadowIcons.gem;
Object.assign(meadowIcons,{feathers:meadowIcons.feather,leatherHelmet:meadowIcons.helmet,deerCape:meadowIcons.cape,antlerPickaxe:meadowIcons.pick,flintSpear:meadowIcons.spear,flintKnife:meadowIcons.knife});
