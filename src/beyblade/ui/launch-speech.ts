import { parseLaunchCommand, type LaunchCommand } from '../core/launch-command';
interface Recognition {
  lang:string;continuous:boolean;interimResults:boolean;
  onresult:((event:{results:ArrayLike<ArrayLike<{transcript:string}>>})=>void)|null;
  onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;
  start():void;abort():void;
}
type RecognitionConstructor=new()=>Recognition;
export function setupLaunchSpeech(root:HTMLElement,apply:(settings:LaunchCommand)=>void,canEdit:()=>boolean,signal:AbortSignal){
  const get=<T extends HTMLElement>(id:string)=>root.querySelector<T>(`#${id}`)!;
  const input=get<HTMLInputElement>('spoken-command'),mic=get<HTMLButtonElement>('speech-start'),preview=get<HTMLButtonElement>('speech-preview'),confirm=get<HTMLButtonElement>('speech-apply'),status=get<HTMLElement>('speech-status');
  const browser=window as unknown as {SpeechRecognition?:RecognitionConstructor;webkitSpeechRecognition?:RecognitionConstructor};
  const Constructor=browser.SpeechRecognition??browser.webkitSpeechRecognition;
  let recognition:Recognition|null=null,pending:LaunchCommand|null=null,timer:ReturnType<typeof setTimeout>|undefined;
  function clear(){pending=null;confirm.disabled=true;}
  function review(){clear();const result=parseLaunchCommand(input.value);status.textContent=result.ok?`反映する設定: ${result.summary}。確認して「設定に反映」を押してください。`:result.message;if(result.ok&&canEdit()){pending=result.settings;confirm.disabled=false;}}
  function stop(){clearTimeout(timer);if(recognition){const old=recognition;recognition=null;old.onresult=null;old.onerror=null;old.onend=null;old.abort();}mic.textContent='音声入力';mic.setAttribute('aria-pressed','false');}
  mic.disabled=!Constructor;if(!Constructor)status.textContent='このブラウザーは音声認識に未対応です。下の欄に入力して反映できます。';
  input.addEventListener('input',clear,{signal});preview.addEventListener('click',()=>{stop();review();},{signal});
  confirm.addEventListener('click',()=>{if(pending&&canEdit()){apply(pending);status.textContent='シュート設定に反映しました。シュートはボタンで開始してください。';clear();}},{signal});
  mic.addEventListener('click',()=>{
    if(recognition){stop();status.textContent='音声入力を中止しました。';return;}if(!Constructor||!canEdit())return;
    clear();const current=new Constructor();recognition=current;current.lang='ja-JP';current.continuous=false;current.interimResults=false;
    current.onresult=event=>{if(recognition!==current||!canEdit())return;input.value=event.results[0]?.[0]?.transcript??'';stop();review();};
    current.onerror=()=>{stop();status.textContent='音声を取得できませんでした。マイクの許可を確認するか、文字で入力してください。';};
    current.onend=()=>{if(recognition===current){stop();status.textContent='認識できませんでした。もう一度話すか、文字で入力してください。';}};
    try{current.start();mic.textContent='音声入力を中止';mic.setAttribute('aria-pressed','true');status.textContent='聞き取り中… パワー・角度・傾きを話してください。';timer=setTimeout(()=>{stop();status.textContent='音声入力を終了しました。必要ならもう一度お試しください。';},15000);}catch{stop();status.textContent='音声入力を開始できません。文字で入力してください。';}
  },{signal});
  function cancel(){stop();clear();}
  window.addEventListener('blur',cancel,{signal});document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();},{signal});signal.addEventListener('abort',cancel,{once:true});
  return{lock(locked:boolean){if(locked)cancel();input.disabled=locked;preview.disabled=locked;mic.disabled=locked||!Constructor;},cancel};
}
