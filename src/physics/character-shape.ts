export const CHARACTER_RADIUS=.3;
export const CHARACTER_HEIGHT=1.45;
export const CROUCH_HEIGHT=1;
export function characterHeight(body:{crouching?:boolean}):number{return body.crouching===true?CROUCH_HEIGHT:CHARACTER_HEIGHT;}
