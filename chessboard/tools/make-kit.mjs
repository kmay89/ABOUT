import fs from 'fs';
import { decimate } from '../../hollow/decimate.js';
import path from 'path';
// Usage: node chessboard/tools/make-kit.mjs <kit>/STL/Standard <dir with layout.json + piece_*.stl from layout.py> [out]
const WORK = process.argv[3] || '.';
const STL = process.argv[2];
function readSTL(p){
  const b=fs.readFileSync(p); const n=b.readUInt32LE(80); const pos=[]; const idx=new Uint32Array(n*3);
  const map=new Map(); let o=84;
  for(let i=0;i<n;i++){ o+=12; for(let k=0;k<3;k++){ const x=b.readFloatLE(o),y=b.readFloatLE(o+4),z=b.readFloatLE(o+8); o+=12;
      const key=Math.round(x*1e4)+','+Math.round(y*1e4)+','+Math.round(z*1e4); let v=map.get(key);
      if(v===undefined){v=pos.length/3; pos.push(x,y,z); map.set(key,v);} idx[i*3+k]=v; } o+=2; }
  return {positions:Float32Array.from(pos), indices:idx};
}
const jobs = [
  ['lidLight', STL+'/2_board_two_colour/half_A_light.stl', 60000],
  ['lidDark',  STL+'/2_board_two_colour/half_A_dark.stl', 0],
  ['trayLight',STL+'/2_board_two_colour/half_B_light.stl', 60000],
  ['trayDark', STL+'/2_board_two_colour/half_B_dark.stl', 0],
  ['fitA', STL+'/1_fit_test/fit_test_A.stl', 14000],
  ['fitB', STL+'/1_fit_test/fit_test_B.stl', 14000],
  ['tiles', STL+'/3_board_single_colour/mono_inlay_tiles.stl', 0],
  ...['pawn','rook','knight','bishop','queen','king'].map(k=>[k,path.join(WORK,'piece_'+k+'.stl'),0]),
];
const header={meshes:{}}; const bufs=[]; let off=0;
for(const [name,p,max] of jobs){
  let m=readSTL(p); const t0=m.indices.length/3;
  if(max && t0>max) m=decimate(m,{tolerance:0.03,maxTriangles:max});
  const P=m.positions, n=P.length/3; const mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
  for(let i=0;i<n;i++) for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],P[i*3+k]); mx[k]=Math.max(mx[k],P[i*3+k]);}
  const q=new Uint16Array(n*3);
  for(let i=0;i<n;i++) for(let k=0;k<3;k++){ const s=(mx[k]-mn[k])||1; q[i*3+k]=Math.round((P[i*3+k]-mn[k])/s*65535); }
  const I = n<65536 ? Uint16Array.from(m.indices) : Uint32Array.from(m.indices);
  const pad=b=>{const r=(4-b.byteLength%4)%4; return r?Buffer.concat([b,Buffer.alloc(r)]):b;};
  const qb=pad(Buffer.from(q.buffer)), ib=pad(Buffer.from(I.buffer));
  header.meshes[name]={min:mn.map(v=>+v.toFixed(4)),max:mx.map(v=>+v.toFixed(4)),verts:n,tris:I.length/3,i32:I instanceof Uint32Array,pos:off,idx:off+qb.length};
  bufs.push(qb,ib); off+=qb.length+ib.length;
  console.log(name,t0,'->',I.length/3);
}
header.layout=JSON.parse(fs.readFileSync(path.join(WORK,'layout.json')));
let hj=Buffer.from(JSON.stringify(header)); hj=Buffer.concat([hj,Buffer.alloc((4-hj.length%4)%4,32)]);
const len=Buffer.alloc(4); len.writeUInt32LE(hj.length);
const OUT = process.argv[4] || 'kit.bin';
fs.writeFileSync(OUT,Buffer.concat([len,hj,...bufs]));
console.log('bytes',fs.statSync(OUT).size);
