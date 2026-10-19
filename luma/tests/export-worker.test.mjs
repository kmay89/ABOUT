import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';

function runWorker(message) {
  const moduleURL=new URL('../export-worker.js',import.meta.url).href;
  return new Promise((resolve,reject)=>{
    const worker=new Worker(`
      const {parentPort,workerData}=require('node:worker_threads');
      global.self={postMessage:(message,transfer)=>parentPort.postMessage(message,transfer)};
      import(workerData).then(()=>{
        parentPort.on('message',data=>self.onmessage({data}));
        parentPort.postMessage({ready:true});
      });
    `,{eval:true,workerData:moduleURL});
    const progress=[];
    const timeout=setTimeout(()=>{worker.terminate();reject(new Error('Export worker timeout'));},20000);
    worker.on('error',error=>{clearTimeout(timeout);worker.terminate();reject(error);});
    worker.on('message',data=>{
      if(data.ready){worker.postMessage(message);return;}
      if(data.progress)progress.push(data.progress);
      if(data.buffer||data.error){clearTimeout(timeout);worker.terminate();resolve({...data,progressEvents:progress});}
    });
  });
}

test('export worker transfers a complete upright curved STL with monotonic progress',async()=>{
  const angleDeg=120,diameter=90,width=diameter/2*angleDeg*Math.PI/180,height=30;
  const result=await runWorker({id:7,settings:{shape:'curved',width,height,angleDeg,minThickness:0.8,maxThickness:3,border:3,resolution:0.5},values:new Float32Array([0,1,0,1]),nx:2,ny:2});
  assert.equal(result.id,7);assert.ok(result.buffer instanceof ArrayBuffer);
  assert.deepEqual(result.progressEvents,[15,70,100]);
  assert.equal(result.buffer.byteLength,84+result.triangleCount*50);
  const view=new DataView(result.buffer);
  assert.equal(view.getUint32(80,true),result.triangleCount);
  assert.ok(result.volume>0);
  assert.ok(Math.abs(result.bounds.min[2])<1e-6);
  assert.ok(Math.abs(result.bounds.max[2]-height)<1e-6);
  assert.ok(Math.abs(result.bounds.size[0]-2*(diameter/2+3)*Math.sin(Math.PI/3))<0.01);
  for(let i=0;i<result.triangleCount;i++){
    const offset=84+50*i;
    for(let j=0;j<12;j++)assert.ok(Number.isFinite(view.getFloat32(offset+4*j,true)));
  }
});

test('worker reports malformed grayscale data without producing a bogus file',async()=>{
  const result=await runWorker({id:9,settings:{width:30,height:30},values:new Float32Array([NaN]),nx:1,ny:1});
  assert.equal(result.id,9);assert.match(result.error,/luminance/i);assert.equal(result.buffer,undefined);
});
