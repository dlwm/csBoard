import { decodeStoredValue } from '../../shared/storage-codec.js';
import { seedGuideExample } from './guide-example-fixture.js';

// Use real UI actions for navigation/saving; query the public viewer for scene
// outcomes and native storage for durability. Never read React internals.
// 导航与保存走真实界面，场景结果用公共接口，持久化结果用原生存储验证。
export async function checkDesktopWorkflow({ root, evaluate, call, capture, results }) {
  const wait = async (expression, label) => {
    const deadline = Date.now() + 30000;
    while (!await evaluate(expression)) {
      if (Date.now() > deadline) throw Error(`Workflow timed out: ${label}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };
  const click = async (selector, text) => {
    await evaluate(`(()=>{const buttons=[...document.querySelectorAll(${JSON.stringify(selector)})];const e=buttons.find(e=>e.getClientRects().length${text ? ` && e.textContent.trim()===${JSON.stringify(text)}` : ''});if(!e||e.disabled)throw Error('Unavailable workflow control: '+${JSON.stringify(selector + ' ' + (text || ''))});e.click()})()`);
  };
  const pointerClick = async selector => {
    const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e?.scrollIntoView({block:'nearest'});const r=e?.getBoundingClientRect();if(!r||!e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)))throw Error('Control is obscured: '+${JSON.stringify(selector)});return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await call('Input.dispatchMouseEvent', {type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});
    await call('Input.dispatchMouseEvent', {type:'mouseReleased',button:'left',buttons:0,clickCount:1,...point});
  };
  const menuVisible = async (selector, label) => {
    await expect(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e?.matches(':popover-open'))return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&[.1,.5,.9].every(x=>[.1,.5,.9].every(y=>e.contains(document.elementFromPoint(r.left+r.width*x,r.top+r.height*y))))})()`, label);
  };
  const expect = async (expression, label) => { await wait(expression, label); results.push(label); };
  const read = async key => {
    const record = await evaluate(`window.csboardDesktop.native.storage('record.get',{key:${JSON.stringify(key)}})`);
    const value = record?.value ? decodeStoredValue(record.value) : [];
    return Array.isArray(value) ? value : value.notes || [];
  };
  const input = (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await seedGuideExample(root, evaluate);
  await call('Page.reload');
  await wait('!!window.csboardAutomation?.getState().ready', 'public viewer ready');
  await evaluate("document.querySelector('.operation-offer footer button')?.click()");
  if (await evaluate("document.querySelector('.language-switch')?.textContent.trim()==='中'")) await click('.language-switch');
  await wait("document.querySelector('.language-switch')?.textContent.trim()==='EN'", 'English interface');
  await wait("!!document.querySelector('.demo-cache-picker > button')", 'replay controls');
  await pointerClick('.demo-cache-picker > button');
  await wait("!!document.querySelector('.demo-cache-open')", 'seeded replay catalogue');
  await menuVisible('.demo-cache-list', 'replay catalogue escapes the scrollable footer and remains hit-testable');
  await capture('replay-library-open');
  await call('Emulation.setDeviceMetricsOverride', {width:960,height:620,deviceScaleFactor:1,mobile:false});
  await menuVisible('.demo-cache-list', 'replay catalogue follows a narrower desktop viewport');
  await evaluate("document.querySelector('.workspace-bottom-bar').scrollTop=1000");
  await menuVisible('.demo-cache-list', 'replay catalogue remains above the view after footer scrolling');
  await evaluate("document.documentElement.style.setProperty('--ui-font-scale','1.5')");
  await menuVisible('.demo-cache-list', 'replay catalogue remains reachable with enlarged text');
  await call('Emulation.setDeviceMetricsOverride', {width:844,height:390,deviceScaleFactor:1,mobile:false});
  await menuVisible('.demo-cache-list', 'replay catalogue remains within a short landscape viewport');
  await capture('replay-library-compact');
  await evaluate("document.documentElement.style.setProperty('--ui-font-scale','1')");
  await call('Emulation.clearDeviceMetricsOverride');
  await menuVisible('.demo-cache-list', 'replay catalogue realigns after restoring viewport and text size');
  await pointerClick('.brand');
  await expect("!document.querySelector('.demo-cache-list')", 'outside pointer dismisses the replay catalogue');
  await pointerClick('.demo-cache-picker > button');
  await menuVisible('.demo-cache-list', 'replay catalogue reopens after outside dismissal');
  await call('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await call('Input.dispatchKeyEvent', {type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await expect("!document.querySelector('.demo-cache-list')", 'Escape dismisses the replay catalogue');
  await pointerClick('.demo-cache-picker > button');
  await pointerClick('.demo-cache-open');
  await expect("!!document.querySelector('.demo-timeline:not(:disabled)')", 'selected replay has loaded position data');
  await pointerClick('.demo-round-picker > button');
  await menuVisible('.demo-round-list', 'round picker escapes footer clipping and receives pointer input');
  await capture('replay-rounds-open');
  await evaluate("[...document.querySelectorAll('.demo-round-list button')].find(e=>e.querySelector('strong')?.textContent==='22')?.setAttribute('data-target-round','true')");
  await pointerClick('.demo-round-list button[data-target-round]');
  await expect("document.querySelector('.demo-round-picker > button')?.textContent.includes('22') && !!document.querySelector('.demo-timeline:not(:disabled)')", 'round switching finishes and enables seeking');
  const seek = await evaluate("(()=>{const e=document.querySelector('.demo-timeline');return Math.min(Number(e.max)-64,Number(e.min)+2700)})()");
  await input('.demo-timeline', seek);
  await expect(`Number(document.querySelector('.demo-timeline').value)===${seek}`, 'timeline seek retains selected tick');
  await click('.demo-play');
  await expect(`Number(document.querySelector('.demo-timeline').value)>${seek}`, 'real replay clock advances');
  await click('.demo-play');
  await capture('replay');
  await click('.demo-save-frame');
  await wait("!!document.querySelector('.save-archive-dialog')", 'save dialog');
  await click('.save-archive-actions button', 'Cancel');
  if ((await read('workspace-archives')).length) throw Error('Cancelling frame save wrote an archive');
  results.push('cancelled frame save does not create an archive');
  await click('.demo-save-frame');
  await input('.save-archive-dialog input', 'Acceptance · Round 22');
  await click('.save-archive-actions button', 'Save');
  await wait("!document.querySelector('.save-archive-dialog')", 'frame save complete');
  await click('.topbar-panels button', 'Collaboration');
  await expect("[...document.querySelectorAll('.archive-restore')].some(e=>e.textContent.includes('Acceptance · Round 22'))", 'saved replay frame appears in collaboration');
  await click('.archive-restore');
  await expect('window.csboardAutomation.getWorkspace().players.length===10', 'restored frame contains ten recorded players');
  const layout = await evaluate('window.csboardAutomation.getWorkspace()');
  const stale = await evaluate(`window.csboardAutomation.execute({type:'workspace.players',players:[]},{expectedRevision:${layout.revision - 1}})`);
  if (stale.status !== 'failed' || stale.error?.code !== 'revision_conflict') throw Error('Stale edit was not rejected');
  await expect('window.csboardAutomation.getWorkspace().players.length===10', 'rejected stale edit preserves scene');
  const first = layout.players[0];
  const moved = first.position.map((value, index) => value + (index === 0 ? 1 : 0));
  const movement = await evaluate(`window.csboardAutomation.execute({type:'player.move',id:${JSON.stringify(first.id)},position:${JSON.stringify(moved)}})`);
  if (movement.status !== 'succeeded') throw Error('Public player movement failed: ' + JSON.stringify(movement));
  await expect(`JSON.stringify(window.csboardAutomation.getWorkspace().players.find(p=>p.id===${JSON.stringify(first.id)}).position)===${JSON.stringify(JSON.stringify(moved))}`, 'public movement updates the live collaboration scene');
  await evaluate("window.csboardAutomation.execute({type:'board.undo'})");
  await expect(`JSON.stringify(window.csboardAutomation.getWorkspace().players.find(p=>p.id===${JSON.stringify(first.id)}).position)===${JSON.stringify(JSON.stringify(first.position))}`, 'movement undo restores the pre-operation position');
  const style = await evaluate("window.csboardAutomation.execute({type:'model.style',opacity:.42,range:.63,focus:'pointer'})");
  if (style.status !== 'succeeded') throw Error('Public model style failed');
  await expect("window.csboardAutomation.getState().modelStyle.opacity===.42 && [...document.querySelectorAll('.model-opacity input')].some(e=>Number(e.value)===.42)", 'public model styling updates both scene state and UI');
  await evaluate('window.csboardAutomation.drainEvents()');
  const viewport = await evaluate("(()=>{document.activeElement?.blur();const r=document.querySelector('.three-board canvas').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()");
  // Locate a real NAV surface through pointer input; empty map space must not
  // create players. 中文：通过真实指针寻找 NAV，空白处不应生成棋子。
  for (const [u, v] of [[.5,.5],[.5,.7],[.3,.5],[.7,.5],[.5,.3],[.3,.7],[.7,.7],[.3,.3],[.7,.3]]) {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: viewport.x+viewport.width*u, y: viewport.y+viewport.height*v });
    await call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'e', code: 'KeyE', windowsVirtualKeyCode: 69 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'e', code: 'KeyE', windowsVirtualKeyCode: 69 });
    if (await evaluate('window.csboardAutomation.getWorkspace().players.length===11')) break;
  }
  await expect('window.csboardAutomation.getWorkspace().players.length===11', 'keyboard placement commits a new player');
  const gestures = await evaluate('window.csboardAutomation.drainEvents()');
  if (!gestures.some(e => e.type === 'operation.succeeded' && e.origin === 'ui' && e.payload.type === 'board.apply')) throw Error('Keyboard placement bypassed the command interface');
  results.push('keyboard placement exposes a correlated public operation');
  await evaluate("window.csboardAutomation.execute({type:'board.undo'})");
  await expect('window.csboardAutomation.getWorkspace().players.length===10', 'keyboard placement undo restores the original frame');
  await evaluate("window.csboardAutomation.execute({type:'model.visibility',visible:true})");
  await expect("window.csboardAutomation.getState().resources.some(r=>r.key==='world-model' && r.status==='ready')", 'public model toggle lazily loads the real GLB resource');
  const catalogue = await evaluate('window.csboardAutomation.getModelObjects()');
  const object = catalogue.objects[0];
  if (!object) throw Error('Model catalogue is empty');
  await evaluate(`window.csboardAutomation.execute({type:'model.objectsVisibility',ids:[${object.id}],signature:${JSON.stringify(catalogue.signature)},visible:false})`);
  await expect('window.csboardAutomation.getModelObjects().objects.every(o=>!o.visible)', 'public model object visibility changes the loaded scene');
  await click('.topbar-panels button', 'Match Replay');
  await click('.topbar-panels button', 'Collaboration');
  await expect('window.csboardAutomation.getModelObjects().objects.every(o=>!o.visible)', 'model object visibility survives menu changes');
  await evaluate(`window.csboardAutomation.execute({type:'model.objectsVisibility',ids:[${object.id}],signature:${JSON.stringify(catalogue.signature)},visible:true})`);
  await evaluate("window.csboardAutomation.execute({type:'workspace.players',players:window.csboardAutomation.getWorkspace().players.slice(1)})");
  await expect('window.csboardAutomation.getWorkspace().players.length===9', 'public player removal updates the live scene');
  await evaluate("window.csboardAutomation.execute({type:'board.undo'})");
  await expect('window.csboardAutomation.getWorkspace().players.length===10', 'player removal undo restores the frame');
  await capture('collaboration');
  await click('.topbar-panels button', 'Analysis');
  await wait("!!document.querySelector('.analysis-player-combobox input:not(:disabled)')", 'player catalogue');
  await evaluate("document.querySelector('.analysis-player-combobox input').focus()");
  await wait("document.querySelectorAll('.analysis-player-results button').length===10", 'rendered player choices');
  // Select one entry at a time so every toggle goes through React's real handler.
  for (let remaining = 20; remaining > 0; remaining--) {
    if (!await evaluate("!!document.querySelector('.analysis-player-results button[aria-selected=false]')")) break;
    const selected = await evaluate("document.querySelectorAll('.analysis-player-results button[aria-selected=true]').length");
    await click('.analysis-player-results button[aria-selected=false]');
    await wait(`document.querySelectorAll('.analysis-player-results button[aria-selected=true]').length===${selected+1}`, 'player selection render');
  }
  await expect("document.querySelectorAll('.analysis-player-results button[aria-selected=true]').length===10", 'all ten players selected for recommendations');
  await evaluate("document.querySelector('.analysis-player-combobox input').blur()");
  await click('.analysis-type-tabs button', 'UTILITY');
  await expect("document.querySelector('.utility-recommendations')?.getAttribute('aria-busy')==='false' && document.querySelectorAll('.utility-recommendation-list article').length>0", 'utility analysis produces repeated-throw recommendations');
  await click('.recommendation-actions button:first-child');
  await expect("!!document.querySelector('.utility-recommendation-list article[data-focused=true]')", 'recommendation focus selects a group');
  await click('.recommendation-actions button:nth-child(2)');
  await expect("document.querySelector('.recommendation-actions button:nth-child(2)')?.textContent==='Added'", 'representative utility is saved');
  await capture('analysis');
  await click('.topbar-panels button', 'Utility Notes');
  await expect("!!document.querySelector('.utility-folder-entry.replayable')", 'saved utility is available with recorded replay');
  await click('.utility-folder-entry.replayable');
  await expect("!!document.querySelector('[data-tour=getpos]')", 'saved utility exposes getpos details');
  await capture('utility');
  const notes = await read('utility-notes'), archives = await read('workspace-archives');
  if (notes.length !== 1 || !notes[0].replay || !archives.some(archive => archive.name === 'Acceptance · Round 22')) throw Error('Saved workflow records are missing from native storage');
  results.push('native storage contains the recorded utility and saved frame');
  await call('Page.reload');
  await wait('!!window.csboardAutomation?.getState().ready', 'viewer after reload');
  await click('.topbar-panels button', 'Utility Notes');
  await expect("!!document.querySelector('.utility-folder-entry.replayable')", 'saved utility survives renderer reload');
  await click('.topbar-panels button', 'Collaboration');
  await expect("[...document.querySelectorAll('.archive-restore')].some(e=>e.textContent.includes('Acceptance · Round 22'))", 'saved frame survives renderer reload');
  return { checks: results, utilityId: notes[0].id, archiveName: archives[0].name };
}
