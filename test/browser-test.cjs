// Boot the island game headless, wait for world gen, drive a bit, screenshot.
const {chromium}=require('playwright');

(async()=>{
  const browser=await chromium.launch({
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],
  });
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  const errors=[];
  page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE: '+m.text());});

  await page.goto('http://localhost:8123/pine-ridge-island-v7.html',{waitUntil:'domcontentloaded'});

  // wait for world generation to finish (the start button appears)
  await page.waitForFunction(()=>window.__dbg&&window.__dbg.WORLD&&window.__dbg.WORLD.ready,null,{timeout:120000});
  const info=await page.evaluate(()=>({
    name:window.__dbg.WORLD.name,
    hubs:window.__dbg.ROADS.hubs.length,
    sections:window.__dbg.ROADS.sections.length,
    chunks:window.__dbg.chunks.size,
    spawn:window.__dbg.WORLD.spawn,
    farTrees:window.__dbg.FARTREES.full,
  }));
  console.log('WORLD READY:',JSON.stringify(info));

  await page.waitForTimeout(1500);
  await page.screenshot({path:'/tmp/shot-0-start.png',timeout:120000});

  // start the game
  await page.evaluate(()=>{document.getElementById('start').dispatchEvent(new PointerEvent('pointerdown'))});
  await page.waitForTimeout(2500);
  await page.screenshot({path:'/tmp/shot-1-spawn.png',timeout:120000});

  // drive forward for a while
  await page.keyboard.down('w');
  await page.waitForTimeout(9000);
  await page.screenshot({path:'/tmp/shot-2-driving.png',timeout:120000});
  await page.waitForTimeout(9000);
  await page.keyboard.up('w');
  await page.screenshot({path:'/tmp/shot-3-driving2.png',timeout:120000});

  // open the big map
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  await page.screenshot({path:'/tmp/shot-4-map.png',timeout:120000});
  await page.keyboard.press('Tab');

  // orbit camera for a scenic look
  await page.keyboard.press('c');
  await page.keyboard.press('c');
  await page.mouse.move(640,360);
  await page.mouse.down();
  await page.mouse.move(740,420,{steps:10});
  await page.mouse.up();
  await page.waitForTimeout(800);
  await page.screenshot({path:'/tmp/shot-5-orbit.png',timeout:120000});

  const stats=await page.evaluate(()=>({
    pos:{x:Math.round(window.__dbg.car.x),z:Math.round(window.__dbg.car.z)},
    odoKmh:document.getElementById('speed').textContent,
    fpsLine:document.getElementById('fps').textContent,
    chunks:window.__dbg.chunks.size,
    calls:window.__dbg.renderer.info.render.calls,
    tris:window.__dbg.renderer.info.render.triangles,
    surf:window.__dbg.car.surf,
  }));
  console.log('AFTER DRIVE:',JSON.stringify(stats));
  console.log(errors.length?('ERRORS:\n'+errors.join('\n')):'NO PAGE ERRORS');
  await browser.close();
  process.exit(errors.length?1:0);
})().catch(e=>{console.error('FATAL',e);process.exit(2);});
