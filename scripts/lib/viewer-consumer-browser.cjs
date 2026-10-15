const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
if(process.platform==='linux'){
  app.commandLine.appendSwitch('use-angle','swiftshader');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
}
const specPath=process.argv.find(value=>value.endsWith('browser.json'));
const spec=JSON.parse(require('node:fs').readFileSync(specPath,'utf8'));
const profile=path.join(path.dirname(specPath),'electron-profile');
require('node:fs').mkdirSync(profile,{recursive:true});
app.setPath('userData',profile);
app.setPath('sessionData',profile);
const exceptions=[];
let window;
app.whenReady().then(async()=>{
  // This disposable consumer never uses the user's desktop profile.
  window=new BrowserWindow({width:1100,height:720,show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  window.webContents.on('render-process-gone',(_,details)=>exceptions.push(details));
  const timer=setTimeout(()=>{fs.writeFile(path.join(spec.artifacts,'result.json'),JSON.stringify({ok:false,error:'Browser acceptance timed out'})).finally(()=>app.exit(1));},60000);
  let result;
  try{
    await window.loadURL(spec.url);
    window.showInactive();
    const session=window.webContents.debugger;session.attach('1.3');
    session.on('message',(_,method,params)=>{if(method==='Runtime.exceptionThrown')exceptions.push(params.exceptionDetails);});
    await session.sendCommand('Runtime.enable');
    const ready=Date.now()+15000;
    while(!await window.webContents.executeJavaScript('Boolean(window.consumerCheck)')){
      if(Date.now()>ready)throw Error('Consumer bundle did not start');await new Promise(resolve=>setTimeout(resolve,100));
    }
    result=await window.webContents.executeJavaScript('window.consumerCheck');
    if(exceptions.length)result={...result,ok:false,error:JSON.stringify(exceptions)};
    result.exports=spec.exports;
    const image=await window.webContents.capturePage();await fs.writeFile(path.join(spec.artifacts,'window.png'),image.toPNG());
    if(result.ok){
      // Run the shipped example as a second page from the installed tarball.
      // 同时验收分发的示例，避免文档示例与真实接口脱节。
      await window.loadURL(new URL('minimal/index.html',spec.url).href);
      const evaluate=expression=>window.webContents.executeJavaScript(expression);
      const until=async(expression,label)=>{const deadline=Date.now()+10000;while(!await evaluate(expression)){if(Date.now()>deadline)throw Error('Minimal example: '+label);await new Promise(resolve=>setTimeout(resolve,50));}result.checks.push('minimal example: '+label);};
      const file=async(selector,filePath)=>{const doc=await session.sendCommand('DOM.getDocument');const {nodeId}=await session.sendCommand('DOM.querySelector',{nodeId:doc.root.nodeId,selector});await session.sendCommand('DOM.setFileInputFiles',{nodeId,files:[filePath]});};
      await until("!!document.querySelector('#open')",'page loads from packed files');
      await file('#nav',spec.files.nav);await file('#replay',spec.files.invalid);
      await evaluate("document.querySelector('#open').click()");
      await until("document.querySelector('#status').textContent.includes('ZIP') && !document.querySelector('#open').disabled",'malformed package reports failure and allows retry');
      await file('#replay',spec.files.replay);
      await evaluate("document.querySelector('#open').click();document.querySelector('#close').click()");
      await until("document.querySelector('#status').textContent==='Closed.' && !document.querySelector('#open').disabled && !document.querySelector('#viewport canvas')",'cancelled open stays closed and can retry');
      await evaluate("document.querySelector('#input-preset').value='disabled';document.querySelector('#open').click()");
      await until("!document.querySelector('#controls').hidden && !!document.querySelector('#viewport canvas')",'retry opens real standard replay');
      const start=await evaluate("Number(document.querySelector('#seek').value)");
      await evaluate("document.querySelector('#play').click()");
      await until(`Number(document.querySelector('#seek').value)>${start}`,'replay advances through shipped controls');
      await evaluate("document.querySelector('#play').click();document.querySelector('#close').click()");
      await until("!document.querySelector('#viewport canvas') && document.querySelector('#controls').hidden && document.querySelector('#close').disabled",'close releases renderer and resets controls');
      await evaluate("document.querySelector('#input-preset').value='custom';document.querySelector('#open').click()");
      await until("!document.querySelector('#controls').hidden && !!document.querySelector('#viewport canvas')",'reopen with custom input succeeds');
      await fs.writeFile(path.join(spec.artifacts,'minimal.png'),(await window.webContents.capturePage()).toPNG());
      await evaluate("document.querySelector('#close').click()");
      if(exceptions.length)throw Error(JSON.stringify(exceptions));
    }
  }catch(error){result={ok:false,error:error.stack,exceptions};}
  finally{clearTimeout(timer);}
  await fs.writeFile(path.join(spec.artifacts,'result.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({ok:result.ok,checks:result.checks?.length,error:result.error}));
  window.destroy();
  app.exit(result.ok?0:1);
}).catch(error=>{console.error(error);app.exit(1);});
