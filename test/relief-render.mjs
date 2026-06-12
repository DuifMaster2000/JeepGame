/* CPU shaded-relief render of the generated island (no GPU needed).
   Writes an uncompressed BMP: hillshaded terrain with biome colours,
   the road network, hubs and POIs — a "satellite view" of the world. */
import {readFileSync,writeFileSync} from 'fs';

const html=readFileSync(new URL('../pine-ridge-island-v7.html',import.meta.url),'utf8');
const src=html.slice(html.indexOf('function mulberry32'),html.indexOf('/*<<ENDWORLDGEN>>*/'));
const seed=Number(process.argv[2]||11072026);
const W=new Function('location','Math','console',src+`
genRoads();indexRoads();
return {WORLD_R,baseHeight,biomeAt,groundHeight,roadQuery,ROADS,WORLD};
`)({search:'?seed='+seed},Math,console);

const S=1100,R=W.WORLD_R;
const px=new Uint8Array(S*S*3);
const sun=[-0.6,0.5,-0.62];                     // matches in-game sun direction-ish
const cell=2*R/S;

const lerp=(a,b,t)=>a+(b-a)*t;
for(let j=0;j<S;j++){
  for(let i=0;i<S;i++){
    const x=(i+0.5)*cell-R,z=(j+0.5)*cell-R;
    const h=W.baseHeight(x,z);
    let r,g,b;
    if(h<0){                                    // sea: depth-tinted
      const d=Math.min(1,-h/14);
      r=lerp(38,16,d);g=lerp(96,52,d);b=lerp(110,72,d);
    }else{
      const bi=W.biomeAt(x,z,h);
      r=108;g=128;b=70;                          // meadow
      r=lerp(r,62,bi.forest);g=lerp(g,92,bi.forest);b=lerp(b,52,bi.forest);
      r=lerp(r,128,bi.rocky);g=lerp(g,124,bi.rocky);b=lerp(b,116,bi.rocky);
      r=lerp(r,212,bi.beach);g=lerp(g,196,bi.beach);b=lerp(b,150,bi.beach);
      r=lerp(r,238,bi.snow);g=lerp(g,242,bi.snow);b=lerp(b,250,bi.snow);
      /* hillshade */
      const e=cell;
      const hx=W.baseHeight(x+e,z)-W.baseHeight(x-e,z);
      const hz=W.baseHeight(x,z+e)-W.baseHeight(x,z-e);
      let nx=-hx,ny=2*e,nz=-hz;
      const nl=Math.hypot(nx,ny,nz);
      const lit=Math.max(0,(nx*sun[0]+ny*sun[1]+nz*sun[2])/nl/Math.hypot(...sun));
      const sh=0.45+lit*0.75;
      r*=sh;g*=sh;b*=sh;
    }
    const o=(j*S+i)*3;
    px[o]=Math.min(255,r);px[o+1]=Math.min(255,g);px[o+2]=Math.min(255,b);
  }
}
/* roads stamped on top */
const stamp=(x,z,rr,cr,cg,cb)=>{
  const ci=Math.round((x+R)/cell-0.5),cj=Math.round((z+R)/cell-0.5);
  for(let dj=-rr;dj<=rr;dj++)for(let di=-rr;di<=rr;di++){
    if(di*di+dj*dj>rr*rr)continue;
    const ii=ci+di,jj=cj+dj;
    if(ii<0||jj<0||ii>=S||jj>=S)continue;
    const o=(jj*S+ii)*3;px[o]=cr;px[o+1]=cg;px[o+2]=cb;
  }
};
for(const s of W.ROADS.sections){
  const col=s.type==='a'?[40,40,42]:[150,118,82];
  for(let i=0;i<s.pts.length-1;i++){
    const a=s.pts[i],b=s.pts[i+1];
    const n=Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/cell);
    for(let k=0;k<=n;k++){
      stamp(a[0]+(b[0]-a[0])*k/n,a[2]+(b[2]-a[2])*k/n,s.type==='a'?2:1.5,...col);
    }
  }
}
for(const h of W.ROADS.hubs)stamp(h.x,h.z,5,232,180,82);
for(const p of W.ROADS.pois)stamp(p.x,p.z,4,220,220,210);

/* BMP out (bottom-up, BGR, rows padded to 4 bytes) */
const rowPad=(4-(S*3)%4)%4;
const dataSize=(S*3+rowPad)*S;
const buf=Buffer.alloc(54+dataSize);
buf.write('BM');buf.writeUInt32LE(54+dataSize,2);buf.writeUInt32LE(54,10);
buf.writeUInt32LE(40,14);buf.writeInt32LE(S,18);buf.writeInt32LE(S,22);
buf.writeUInt16LE(1,26);buf.writeUInt16LE(24,28);buf.writeUInt32LE(0,30);
buf.writeUInt32LE(dataSize,34);
let o=54;
for(let j=S-1;j>=0;j--){
  for(let i=0;i<S;i++){
    const p=(j*S+i)*3;
    buf[o++]=px[p+2];buf[o++]=px[p+1];buf[o++]=px[p];
  }
  o+=rowPad;
}
const out='/tmp/island-relief-'+seed+'.bmp';
writeFileSync(out,buf);
console.log('wrote',out,'island:',W.WORLD.name,'· roads:',W.ROADS.sections.length,'sections · hubs:',W.ROADS.hubs.length);
