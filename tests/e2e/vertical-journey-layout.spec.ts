import {expect,test} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {caveBeaconGoal,skyBeaconGoal} from '../../src/game/adventure-goal';
import {journeyDistance,journeyHint} from '../../src/ui/journey-distance';
import {expectJourneyTextFits} from '../helpers/journey-layout';

const html=readFileSync('index.html','utf8').replace(/<script[^>]*src="\/src\/main.ts"[^>]*><\/script>/,'');
const css=readFileSync('src/ui/style.css','utf8');
test('voxel adventure vertical hints remain fully visible on compact phones and portrait rotation',async({page},info)=>{
 test.skip(info.project.name!=='android-chromium','Compact touch layout');
 const s=new GameSimulation().adventure.snapshot();
 const positions=[{x:10,y:17.5,z:-17},{x:18,y:25,z:-18},{x:22,y:3,z:8},{x:28,y:1,z:8},{x:28,y:-6,z:8}];
 for(const size of [{width:750,height:342},{width:342,height:750}]){
  // Geometry-only fixtures use the real HTML, CSS and production text formatters.
  // Gameplay/authority coverage is owned by the native continuation test.
  await page.setViewportSize(size);await page.setContent(html);await page.addStyleTag({content:css});
  await page.locator('#app').evaluate((app:HTMLElement,size)=>{app.dataset.state='running';app.dataset.rotated=String(size.height>size.width);app.style.setProperty('--game-width',Math.max(size.width,size.height)+'px');app.style.setProperty('--game-height',Math.min(size.width,size.height)+'px');},size);
  for(const [index,p] of positions.entries()){
   const goal=index===0?skyBeaconGoal(p):caveBeaconGoal(s,p),detail=journeyHint(goal,p),distance=journeyDistance(goal.target,p);
   await page.locator('#journey').evaluate((card,{title,detail,distance})=>{card.innerHTML='<span class="goal-kicker"></span><strong></strong><small></small>';card.querySelector('.goal-kicker')!.textContent='次の目標 · '+distance;card.querySelector('strong')!.textContent=title;card.querySelector('small')!.textContent=detail;},{title:goal.title,detail,distance});
   await expect(page.locator('.goal-kicker')).toBeHidden();await expect(page.locator('#journey small')).toBeVisible();
   await expect(page.locator('#journey small')).toHaveText(detail);expect(detail).toMatch(/^(上|下)\d+m · /);
   await expectJourneyTextFits(page,{completeText:true});
   await page.screenshot({path:info.outputPath(`vertical-hint-${size.width}x${size.height}-${index}.png`),scale:'css'});
  }
 }
});
