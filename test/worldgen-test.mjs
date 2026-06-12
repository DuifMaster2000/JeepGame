/* Headless test for the v7 island world generator.
   Extracts the pure-math block between the noise utils and <<ENDWORLDGEN>>
   from the game file and exercises terrain + road-network generation. */
import {readFileSync} from 'fs';

const html=readFileSync(new URL('../pine-ridge-island-v7.html',import.meta.url),'utf8');
const start=html.indexOf('function mulberry32');
const end=html.indexOf('/*<<ENDWORLDGEN>>*/');
if(start<0||end<0)throw new Error('extraction markers not found');
const src=html.slice(start,end);

const seed=Number(process.argv[2]||11072026);
const sandbox={
  location:{search:'?seed='+seed},
  Math,console,
};
const fn=new Function('location','Math','console',src+`
return {WORLD_SEED,WORLD_R,CHUNK,coastMask,baseHeight,biomeAt,genRoads,indexRoads,
  roadQuery,groundHeight,WORLD,ROADS,astar,RD_HALF};
`);
const W=fn(sandbox.location,Math,console);

let fails=0;
const check=(name,ok,info='')=>{
  console.log((ok?'  ok ':'FAIL ')+name+(info?'  ('+info+')':''));
  if(!ok)fails++;
};

console.log('--- seed '+W.WORLD_SEED+' ---');

/* terrain sanity */
let land=0,mtn=0,minH=1e9,maxH=-1e9,nan=0;
const S=120;
for(let j=0;j<S;j++)for(let i=0;i<S;i++){
  const x=(i+0.5)/S*2*W.WORLD_R-W.WORLD_R,z=(j+0.5)/S*2*W.WORLD_R-W.WORLD_R;
  const h=W.baseHeight(x,z);
  if(Number.isNaN(h))nan++;
  if(h>0)land++;
  if(h>120)mtn++;
  minH=Math.min(minH,h);maxH=Math.max(maxH,h);
}
const landFrac=land/(S*S);
check('no NaN heights',nan===0,nan+' NaN');
check('land fraction 0.25..0.75',landFrac>0.25&&landFrac<0.75,landFrac.toFixed(3));
check('has mountains (>120m)',mtn>0,mtn+' samples');
check('height range sane',minH>-40&&maxH<600,minH.toFixed(1)+'..'+maxH.toFixed(1));

/* biome sanity */
const b=W.biomeAt(0,0);
check('biome weights defined',['beach','forest','meadow','rocky','snow'].every(k=>typeof b[k]==='number'));

/* road network */
const t0=Date.now();
W.genRoads();
const tGen=Date.now()-t0;
W.indexRoads();
const tIdx=Date.now()-t0-tGen;
const R=W.ROADS;
check('hubs >= 8',R.hubs.length>=8,R.hubs.length+' hubs');
check('hub names unique',new Set(R.hubs.map(h=>h.name)).size===R.hubs.length);
check('every hub connected',R.hubs.every(h=>h.edges.length>0),
  R.hubs.map(h=>h.edges.length).join(','));
check('sections generated',R.sections.length>=R.hubs.length,R.sections.length+' sections');
let totalKm=0,aKm=0,gKm=0,badStep=0,maxGrade=0;
for(const s of R.sections){
  for(let i=0;i<s.pts.length-1;i++){
    const a=s.pts[i],c=s.pts[i+1];
    const d=Math.hypot(c[0]-a[0],c[2]-a[2]);
    totalKm+=d/1000;
    if(s.type==='a')aKm+=d/1000;else gKm+=d/1000;
    if(d>40||d<0.5)badStep++;
    maxGrade=Math.max(maxGrade,Math.abs(c[1]-a[1])/Math.max(d,0.1));
  }
}
check('total road length 40..260 km',totalKm>40&&totalKm<260,totalKm.toFixed(1)+' km');
check('asphalt and gravel both exist',aKm>5&&gKm>5,aKm.toFixed(1)+'km a / '+gKm.toFixed(1)+'km g');
check('segment steps sane',badStep===0,badStep+' bad');
check('max grade < 0.35',maxGrade<0.35,maxGrade.toFixed(3));
check('junctions (forks) found',R.juncs.length>0,R.juncs.length+' forks');
check('scenic POIs found',R.pois.length>=2,R.pois.length+' pois');
check('gen time < 6s',tGen<6000,tGen+' ms gen, '+tIdx+' ms index');

/* roadQuery + groundHeight consistency: every section vertex must be found
   on the road and groundHeight there must equal the road height */
let qMiss=0,hOff=0,probes=0;
for(const s of R.sections){
  for(let i=1;i<s.pts.length-1;i+=7){
    const p=s.pts[i];
    const q=W.roadQuery(p[0],p[2]);
    probes++;
    if(!q||q.d>0.6){qMiss++;continue;}
    const gh=W.groundHeight(p[0],p[2]);
    if(Math.abs(gh-p[1])>0.5)hOff++;
  }
}
check('roadQuery finds all road points',qMiss===0,qMiss+'/'+probes+' missed');
check('groundHeight flat on road',hOff===0,hOff+'/'+probes+' off');

/* spawn */
check('spawn defined on land',!!W.WORLD.spawn&&W.baseHeight(W.WORLD.spawn.x,W.WORLD.spawn.z)>0,
  W.WORLD.spawn?('x='+W.WORLD.spawn.x.toFixed(0)+' z='+W.WORLD.spawn.z.toFixed(0)):'none');
const sq=W.roadQuery(W.WORLD.spawn.x,W.WORLD.spawn.z);
check('spawn on a road',!!sq&&sq.d<sq.half+1,sq?sq.d.toFixed(2)+' m off centreline':'no road');

/* query performance */
const t1=Date.now();
let acc=0;
for(let i=0;i<200000;i++){
  acc+=W.groundHeight((i%449)*40-9000,(i%331)*55-9000);
}
const tQ=Date.now()-t1;
check('200k groundHeight < 2.5s',tQ<2500,tQ+' ms ('+(tQ/200).toFixed(1)+' ns each... us per 1k)');

console.log(fails?('--- '+fails+' FAILURES ---'):'--- all checks passed ---');
process.exit(fails?1:0);
