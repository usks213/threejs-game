import type {CampaignRow,CampaignCommand} from './campaign-ui';
import {inventoryCount} from './inventory-view';
export function createStorageTransfer(row:CampaignRow,drafts:Map<string,string>,send:(command:CampaignCommand)=>void,signal:AbortSignal){
 const model=row.transfer!,wrap=document.createElement('div');wrap.className='campaign-transfer';
 const label=document.createElement('label');label.textContent='移す数';const input=document.createElement('input');input.type='number';input.min='1';input.max=String(model.maxCount);input.step='1';input.inputMode='numeric';input.value=drafts.get(row.id)??'1';input.setAttribute('aria-label',row.label+'数');label.append(input);
 const message=document.createElement('p'),submit=document.createElement('button'),maximum=document.createElement('button');submit.type=maximum.type='button';submit.textContent='指定数を移す';submit.dataset.command='homestead';maximum.textContent='最大 '+model.maxCount;maximum.disabled=!model.maxCount||row.available===false;
 let submitted=false;
 const refresh=()=>{const count=inventoryCount(input.value,model.maxCount);input.setAttribute('aria-invalid',String(count===null));submit.disabled=submitted||count===null||row.available===false;message.textContent=row.reason||(!model.maxCount?'移せる品物がありません。':count===null?`1〜${model.maxCount}の整数を入力してください。`:`${count}個を移します。`);};
 input.addEventListener('input',()=>{drafts.set(row.id,input.value);refresh();},{signal});maximum.addEventListener('click',()=>{input.value=String(model.maxCount);drafts.set(row.id,input.value);refresh();},{signal});
 submit.addEventListener('click',()=>{const count=inventoryCount(input.value,model.maxCount);if(submitted||count===null||row.available===false)return;submitted=true;refresh();send({type:'storage',id:row.id,count,revision:model.revision,stored:model.stored});if(wrap.isConnected){submitted=false;refresh();}},{signal});
 wrap.append(label,maximum,submit,message);refresh();return wrap;
}
