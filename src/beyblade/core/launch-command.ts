export interface LaunchCommand { power?: number; angle?: number; tilt?: number }
export type CommandResult = { ok: true; settings: LaunchCommand; summary: string } | { ok: false; message: string };
/** Deliberately limited grammar: never execute arbitrary recognized speech or guess a missing value. */
export function parseLaunchCommand(input: string): CommandResult {
  const text=input.normalize('NFKC').replace(/マイナス/g,'-');
  const settings: LaunchCommand={};const summaries:string[]=[];
  for(const [key,label,min,max] of [['power','パワー',20,100],['angle','角度',-50,50],['tilt','傾き',0,30]] as const){
    const matches=[...text.matchAll(new RegExp(`${label}(?:を|は)?\\s*([+-]?\\s*\\d+(?:\\.\\d+)?)`,'g'))];
    if(text.includes(label)&&matches.length!==1)return{ok:false,message:`${label}は数値を1つ指定してください。`};
    if(!matches.length)continue;
    const value=Number(matches[0][1].replace(/\s/g,''));
    if(!Number.isInteger(value)||value<min||value>max)return{ok:false,message:`${label}は${min}〜${max}の整数で指定してください。`};
    settings[key]=value;summaries.push(`${label} ${value}${key==='power'?'%':'°'}`);
  }
  if(!summaries.length)return{ok:false,message:'「パワー80、角度マイナス10、傾き5」のように指定してください。'};
  return{ok:true,settings,summary:summaries.join(' / ')};
}
