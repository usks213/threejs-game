import type {EnemyDefinition} from './catalog';
import type {AdventureRegion} from '../environment/adventure';
/** Original silhouettes and authority roles; existing walker/slime remain supported. */
export const ADVENTURE_ENEMIES:EnemyDefinition[]=[
 {id:'shellguard',name:'帆殻守',health:64,damage:9,speed:1.3,reach:1.7,color:'#b6a887',shape:'walker',element:'physical',resistance:'none'},
 {id:'reedspitter',name:'葦針吹き',health:30,damage:7,speed:1.9,reach:12,color:'#699f85',shape:'walker',element:'physical',resistance:'none'},
 {id:'cinderunner',name:'熾走り',health:42,damage:10,speed:2.1,reach:8,color:'#d18a68',shape:'boar',element:'fire',resistance:'fire'},
 {id:'veilray',name:'薄幕エイ',health:28,damage:7,speed:2.4,reach:9,color:'#9caad6',shape:'flyer',element:'frost',resistance:'frost'},
];
export const ADVENTURE_ENEMY_IDS=['walker','slime',...ADVENTURE_ENEMIES.map(e=>e.id)] as const;
export const REGION_RESOURCES:Record<AdventureRegion,readonly string[]>={
 windfield:['branch','stone','berry','mushroom','flint','resin','beech','boarMeat'],forest:['beech','branch','mushroom','berry','resin','honey','stone','amber'],rock:['stone','iron','copper','flint','branch','stone','resin','amber'],shore:['rawFish','branch','stone','dandelion','berry','resin','flint','amberPearl'],frost:['crystal','iron','stone','honey','mushroom','branch','resin','ruby'],cinder:['iron','coal','resin','crystal','stone','copper','ruby','mushroom'],cavern:['crystal','mushroom','stone','coal','resin','iron','amber','branch'],
};
export const REGION_ENEMIES:Record<AdventureRegion,readonly string[]>={windfield:['slime','walker','reedspitter'],forest:['shellguard','reedspitter','slime'],rock:['walker','shellguard','cinderunner'],shore:['reedspitter','slime','veilray'],frost:['veilray','shellguard','walker'],cinder:['cinderunner','walker','shellguard'],cavern:['slime','veilray','reedspitter']};
export const ADVENTURE_LOOT:Record<string,Record<string,number>>={walker:{stone:3,iron:1,coins:2},slime:{resin:2,mushroom:1,coins:1},shellguard:{wood:3,iron:2,coins:3},reedspitter:{feathers:2,boarMeat:1,coins:2},cinderunner:{resin:3,coal:1,coins:3},veilray:{crystal:1,rawFish:1,coins:3}};
