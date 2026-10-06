interface Position {x:number;z:number}
/** The open leaf occupies x -1..-.65 through z3; cross the south wall only
 * from the clear doorway center. All destinations use ordinary walk input. */
export function cryptReengagementWaypoint(player:Position,enemy:Position):Position {
 if(player.z>1.3){
  // Clear the courtyard props along the established z5.3 lane before
  // approaching the broken arch. Combat retreats can finish far to either side.
  if(player.z>5.48)return {x:player.x,z:5.3};
  if(player.z>3.38&&Math.abs(player.x)>=.18)return {x:0,z:5.3};
  if(Math.hypot(player.x,player.z-3.2)>=.18)return {x:0,z:3.2};
  return {x:0,z:0};
 }
 const center={x:0,z:Math.min(0,player.z)};
 if(Math.hypot(player.x-center.x,player.z-center.z)>=.18)return center;
 // Stay in the clear central aisle, south of the altar, while closing sight
 // and attack distance to a warden that returned to its authored home.
 // Reobserve after each metre so a chasing enemy cannot cross behind us
 // during one long walk to its stale position.
 return {x:0,z:Math.max(player.z-1,-8,Math.min(-3,enemy.z+1.4))};
}
