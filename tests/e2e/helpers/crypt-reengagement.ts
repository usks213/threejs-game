interface Position {x:number;z:number;y?:number}
export interface CryptWaypoint {x:number;z:number;jump?:true}
const TOLERANCE=.18;
const distance=(a:Position,b:Position)=>Math.hypot(a.x-b.x,a.z-b.z);
/** Recover around the outside walls, rather than mistaking the east basin or
 * western trees for the indoor aisle. A jump flag means an ordinary jump from
 * the current staging point, never a position/terrain change. */
function courtyardWaypoint(player:Position):CryptWaypoint|null {
 if(player.x>4.25&&player.z<1.48){
  // Stay on the same side of the basin's internal stone partition until its
  // southern end. Both recorded east-wall failures can use the western exit.
  const x=player.x<6||player.z>-.55?5.5:9;
  if(player.z<.32||Math.abs(player.x-x)>=TOLERANCE)return {x,z:.5};
  return {x,z:1.8,jump:true};
 }
 if(player.x<-4.25){
  // Approach from the western exterior below the wall's south end. A wider
  // diagonal goes around the rock at (-6,-3), then z2 misses tree0 and berries.
  if(player.z<1.82)return {x:player.x>-7.5&&player.z<-1.8?-9.5:Math.min(-8,player.x),z:2};
  if(player.z<2.18)return {x:-1.6,z:2};
  // The far western z5.3 lane is obstructed by berries and a low rock. Pass
  // north of them and west of the hearth before joining the central lane.
  if(player.z<3.82||player.z>4.18)return {x:player.x,z:4};
  return {x:-4.1,z:4};
 }
 if(player.x<-3.92&&player.z<5.12)return {x:-4.1,z:5.3};
 if(player.z>5.48)return {x:player.x,z:5.3};
 if(player.z>1.3){
  // A displaced fighter beside the open door must clear its southern tip
  // before crossing to x0. The narrow -1.6 lane also misses the broken arch.
  if(player.x<-.4&&player.z<3.32){
   if(Math.abs(player.x+1.6)>=TOLERANCE)return {x:-1.6,z:Math.max(1.9,player.z)};
   return {x:-1.6,z:3.5};
  }
  if(player.z<5.12&&Math.abs(player.x)>2.8)return {x:player.x,z:5.3};
  if(Math.abs(player.x)>=TOLERANCE)return {x:0,z:player.z<3.68?3.5:5.3};
  return {x:0,z:0};
 }
 return null;
}
/** The open leaf occupies x -1..-.65 through z3. Re-enter through the south
 * courtyard and clear doorway center, observing again at every waypoint. */
export function cryptReengagementWaypoint(player:Position,enemy:Position):CryptWaypoint {
 const courtyard=courtyardWaypoint(player);if(courtyard)return courtyard;
 // Just inside the west jamb, move north before crossing the open leaf.
 if(player.z>.18&&player.x<-.4)return {x:player.x,z:0};
 const center={x:0,z:Math.min(0,player.z)};
 if(distance(player,center)>=TOLERANCE)return center;
 // Stay south of the altar and reobserve each metre, so a chasing warden
 // cannot cross behind the player during one long walk to a stale position.
 return {x:0,z:Math.max(player.z-1,-8,Math.min(-3,enemy.z+1.4))};
}
/** Recover stamina along supported, prop-free lanes while the caller keeps
 * facing the enemy. These world-space targets must not become blind backsteps. */
export function cryptRetreatWaypoint(player:Position,enemy:Position):CryptWaypoint {
 if(player.x>4.25&&player.z<1.48||player.x<-3.92)return courtyardWaypoint(player)??{x:0,z:5.3};
 if(player.z<1.48){
  if(player.z>.18&&player.x<-.4)return {x:player.x,z:0};
  if(Math.abs(player.x)>=TOLERANCE)return {x:0,z:Math.min(0,player.z)};
  return {x:0,z:5.3};
 }
 // South of the material rack, going north would run into both the pursuing
 // sentry and solid metal. Stay on the bounded southern cross-lane instead.
 const z=player.z>6?Math.max(7.9,Math.min(8.4,player.z)):5.3;
 if(player.z<=6&&player.z<5.12){
  const approach=courtyardWaypoint(player);
  if(approach&&approach.z!==0)return approach;
  return {x:0,z:5.3};
 }
 const left={x:player.z>6?-.55:-3.8,z},right={x:4.8,z};
 // Keep a safe endpoint once reached instead of bouncing between endpoints
 // simply because a movement polling interval elapsed.
 return distance(left,enemy)>distance(right,enemy)?left:right;
}
