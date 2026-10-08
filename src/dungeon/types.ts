import type {AttackKind,AttackPhase} from '../prototype/core/motion';
import type {Vec3} from '../prototype/core/voxel';
export const DUNGEON_PROTOCOL=1;
export const RAID_SECONDS=480;
export type QuestId='first-return'|'ore-delivery';
export interface QuestProgress {id:QuestId;progress:number;claimed:boolean}
export type SupplyKind='potion'|'bandage';
export type SupplyStock=Record<SupplyKind,number>;
export type BastionSkill='rush'|'brace';
export type BastionPerk='vigor'|'stride';
export interface BastionTraining {skill:BastionSkill|null;perk:BastionPerk|null}
export interface BastionSkillState {skill:BastionSkill;activeUntil:number;readyAt:number}
export type ClassId='bastion'|'ravager'|'shade'|'hunter'|'arcanist'|'keeper';
export type ItemKind='sword'|'greatsword'|'dagger'|'bow'|'staff'|'shield'|'potion'|'bandage'|'arrow'|'relic'|'ore'|'key';
export interface Item {id:string;kind:ItemKind;quality:number;count:number;x:number;y:number;rotated:boolean;found:boolean}
export interface Input {x:number;z:number;yaw:number;pitch:number;block:boolean;crouch:boolean}
export interface Actor {training?:BastionTraining;skillState?:BastionSkillState;id:string;name:string;classId:ClassId;team:number;position:Vec3;yaw:number;pitch:number;hp:number;maxHp:number;recoverable:number;phase:AttackPhase;time:number;kind:AttackKind;hit:string[];guard:number;status:'lobby'|'alive'|'dead'|'extracted';bag:Item[];weapon:ItemKind;arrows:number;spells:number;cast:number;extract:number;interaction:string|null;input:Input;inputAt:number;seq:number;kills:number;xp:number;damageTaken:number;ready:boolean;connected:boolean}
/** Missing pendingReturn is a legacy empty batch; a batch retains its bag-grid layout. */
export interface Profile {key:string;actor:Actor;stash:Item[];pendingReturn?:Item[];quests?:QuestProgress[];gold:number;raid:number;lastAction:number;result:string;receipt:string[]}
export interface Enemy extends Actor {home:Vec3;alert:number;lootClaimed:boolean}
export interface Container {id:string;name:string;position:Vec3;items:Item[];opened:boolean;locked:boolean;kind:'chest'|'corpse'}
export interface Door {id:string;position:Vec3;open:boolean}
export interface Exit {id:string;position:Vec3;opensAt:number;remaining:number}
export interface Shot {id:string;owner:string;position:Vec3;velocity:Vec3;life:number;damage:number;magic:boolean}
export interface RaidState {version:1;shop?:SupplyStock;raid:number;seed:number;phase:'lobby'|'raid'|'finished';elapsed:number;tick:number;serial:number;profiles:Profile[];enemies:Enemy[];containers:Container[];doors:Door[];exits:Exit[];shots:Shot[];events:string[]}
export interface Snapshot {protocol:1;you:string;raid:number;phase:RaidState['phase'];elapsed:number;tick:number;seed:number;actors:Omit<Actor,'input'|'inputAt'|'seq'|'hit'>[];enemies:Omit<Enemy,'input'|'inputAt'|'seq'|'hit'>[];containers:Container[];doors:Door[];exits:Exit[];shots:Shot[];stash:Item[];pendingReturn?:Item[];quests?:QuestProgress[];gold:number;shop:SupplyStock;trades:string[];result:string;events:string[];lastAction:number;lastInput:number}
export type Action = {kind:'configure-training';skill:BastionSkill|null;perk:BastionPerk|null}|{kind:'skill'}|{kind:'accept-quest';quest:QuestId}|{kind:'deliver-quest';quest:QuestId;item:string}|{kind:'claim-quest';quest:QuestId}|{kind:'claim-return';item:string;to:'bag'|'stash'}|{kind:'buy-supply';supply:SupplyKind}|{kind:'sell-treasure';item:string}|{kind:'ready'}|{kind:'start'}|{kind:'return'}|{kind:'class';classId:ClassId}|{kind:'attack';heavy?:boolean}|{kind:'cast'}|{kind:'shoot'}|{kind:'heal'}|{kind:'interact';target:string}|{kind:'loot';target:string;item:string}|{kind:'transfer';item:string;to:'bag'|'stash'}|{kind:'move-item';item:string;x:number;y:number;rotate:boolean};
export type ClientPacket={type:'hello';protocol:number;key:string;name:string}|{type:'input';sequence:number;input:Input}|{type:'action';sequence:number;action:Action};
