/* app.js — the solving room, on screen.
   Raw WebGL: every sticker is a little extruded prism; a twist is a
   rotation of one slab of prisms; the camera is a mass on a spring so
   the puzzle carries momentum when you fling it and rubber-bands back
   when you push it past the poles. No libraries. */
/* global PuzzleEngine, MapView */
(function(){
"use strict";
var REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- palettes (the desk's colours) ---------- */
var PLASTIC = [0.085, 0.070, 0.058];
var CUBE_PAL = ["#f2ead9","#ff5d5d","#3fc472","#f5b63f","#ff8a5c","#5aa2ff"]; /* U R F D L B */
/* ordered so the vivid colours land on the faces the default camera sees */
var MEGA_PAL = ["#b79cff","#ff8a5c","#ff9ec2","#3fc472","#f5b63f","#d9c79a",
                "#b7e07a","#9aa7b0","#35c4b5","#f2ead9","#ff5d5d","#5aa2ff"];
function hex2rgb(h){
  return [parseInt(h.slice(1,3),16)/255, parseInt(h.slice(3,5),16)/255, parseInt(h.slice(5,7),16)/255];
}

var KINDS = {
  cube2:{ label:"2×2", scramble:16, pal:CUBE_PAL,
    method:"God's algorithm — provably optimal",
    fact:"3,674,160 positions · God's number: 11 · solved by breadth-first search over every state" },
  cube3:{ label:"3×3", scramble:25, pal:CUBE_PAL,
    method:"Kociemba two-phase",
    fact:"43,252,003,274,489,856,000 positions · God's number: 20 · solved through the subgroup G1 = ⟨U,D,R²,L²,F²,B²⟩" },
  cube4:{ label:"4×4", scramble:45, pal:CUBE_PAL,
    method:"Ariadne's thread — the scramble, inverted",
    fact:"≈ 7.40 × 10⁴⁵ positions · no optimal solver fits in a browser tab, so it retraces its own thread" },
  cube5:{ label:"5×5", scramble:60, pal:CUBE_PAL,
    method:"Ariadne's thread — the scramble, inverted",
    fact:"≈ 2.83 × 10⁷⁴ positions · more states than atoms in the observable universe, squared wouldn't be far off" },
  mega:{ label:"Megaminx", scramble:70, pal:MEGA_PAL,
    method:"Ariadne's thread — the scramble, inverted",
    fact:"≈ 1.01 × 10⁶⁸ positions · twelve faces, and the same group theory as the cube" }
};

/* ---------- tiny mat4 kit ---------- */
function mIdentity(){ return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
function mMul(a,b){
  var o=new Array(16), r, c, k, s;
  for(c=0;c<4;c++) for(r=0;r<4;r++){
    s=0; for(k=0;k<4;k++) s+=a[k*4+r]*b[c*4+k];
    o[c*4+r]=s;
  }
  return o;
}
function mPersp(fovy,aspect,near,far){
  var f=1/Math.tan(fovy/2), nf=1/(near-far);
  return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0];
}
function mTranslate(x,y,z){ var m=mIdentity(); m[12]=x; m[13]=y; m[14]=z; return m; }
function mRotX(a){ var c=Math.cos(a),s=Math.sin(a);
  return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]; }
function mRotY(a){ var c=Math.cos(a),s=Math.sin(a);
  return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; }
function mAxisAngle(u,a){
  var c=Math.cos(a), s=Math.sin(a), t=1-c, x=u[0],y=u[1],z=u[2];
  return [ t*x*x+c,   t*x*y+s*z, t*x*z-s*y, 0,
           t*x*y-s*z, t*y*y+c,   t*y*z+s*x, 0,
           t*x*z+s*y, t*y*z-s*x, t*z*z+c,   0,
           0,0,0,1 ];
}

/* ---------- DOM ---------- */
var canvas=document.getElementById("stage");
var elStatus=document.getElementById("status");
var elFact=document.getElementById("fact");
var elTicker=document.getElementById("ticker");
var btnScramble=document.getElementById("btnScramble");
var btnSolve=document.getElementById("btnSolve");
var btnStop=document.getElementById("btnStop");
var btnMap=document.getElementById("btnMap");
var btnScan=document.getElementById("btnScan");
var mapCanvas=document.getElementById("map");
var mapCap=document.getElementById("mapCap");
var mapLive=document.getElementById("mapLive");
var teachBadge=document.getElementById("teachBadge");
var teachBar=document.getElementById("teachBar");
var btnTeachNext=document.getElementById("teachNext");
var btnTeachAuto=document.getElementById("teachAuto");
var btnTeachExit=document.getElementById("teachExit");
var pickers=Array.prototype.slice.call(document.querySelectorAll("[data-kind]"));

var gl=canvas.getContext("webgl",{antialias:true, alpha:true, premultipliedAlpha:true});
if(!gl){
  document.getElementById("nogl").hidden=false;
  return;
}

/* ---------- shaders ---------- */
function sh(type,src){
  var s=gl.createShader(type);
  gl.shaderSource(s,src); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s));
  return s;
}
var prog=gl.createProgram();
gl.attachShader(prog, sh(gl.VERTEX_SHADER, [
  "attribute vec3 aPos, aNrm, aCol;",
  "attribute float aTop;",
  "uniform mat4 uProj, uView, uModel;",
  "varying vec3 vN, vC, vP;",
  "varying float vT;",
  "void main(){",
  "  vec4 w = uModel * vec4(aPos,1.0);",
  "  gl_Position = uProj * uView * w;",
  "  vN = mat3(uModel) * aNrm;",
  "  vC = aCol; vT = aTop; vP = w.xyz;",
  "}"].join("\n")));
gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, [
  "precision mediump float;",
  "varying vec3 vN, vC, vP;",
  "varying float vT;",
  "uniform float uGlow;",
  "uniform vec3 uEye;",
  "void main(){",
  "  vec3 n = normalize(vN);",
  "  vec3 key = normalize(vec3(0.55, 0.85, 0.55));",
  "  vec3 fill = normalize(vec3(-0.62, 0.15, -0.45));",
  "  float dKey = max(dot(n,key), 0.0);",
  "  float dFill = max(dot(n,fill), 0.0);",
  "  vec3 lit = vC * (0.40 + 0.82*dKey*vec3(1.0,0.93,0.80) + 0.32*dFill*vec3(0.55,0.62,0.80));",
  "  vec3 v = normalize(uEye - vP);",
  "  vec3 h = normalize(key + v);",
  "  float spec = pow(max(dot(n,h),0.0), 60.0) * (0.10 + 0.30*vT);",
  "  lit += spec * vec3(1.0, 0.95, 0.85);",
  "  lit += vC * uGlow * vT * 0.9;",
  "  float fres = pow(1.0 - max(dot(n,v),0.0), 3.0);",
  "  lit += fres * vec3(0.09,0.07,0.05);",
  "  gl_FragColor = vec4(pow(lit, vec3(0.9)), 1.0);",
  "}"].join("\n")));
gl.linkProgram(prog);
if(!gl.getProgramParameter(prog,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);
gl.enable(gl.DEPTH_TEST);
gl.enable(gl.CULL_FACE);

var loc={
  aPos:gl.getAttribLocation(prog,"aPos"),
  aNrm:gl.getAttribLocation(prog,"aNrm"),
  aCol:gl.getAttribLocation(prog,"aCol"),
  aTop:gl.getAttribLocation(prog,"aTop"),
  uProj:gl.getUniformLocation(prog,"uProj"),
  uView:gl.getUniformLocation(prog,"uView"),
  uModel:gl.getUniformLocation(prog,"uModel"),
  uGlow:gl.getUniformLocation(prog,"uGlow"),
  uEye:gl.getUniformLocation(prog,"uEye")
};

var bufPos=gl.createBuffer(), bufNrm=gl.createBuffer(),
    bufCol=gl.createBuffer(), bufTop=gl.createBuffer(),
    idxStatic=gl.createBuffer(), idxMoving=gl.createBuffer();

/* ---------- puzzle & geometry ---------- */
var P=null, kind=null, colors=null, history=[];
var geo=null;         /* {stickerTopRange, stickerIdxRange, indexArr, vertexColors} */
var pal=null;

function buildGeometry(){
  var pos=[], nrm=[], col=[], top=[], idx=[];
  var topRanges=[], idxRanges=[];
  var i, j;
  for(i=0;i<P.stickers.length;i++){
    var st=P.stickers[i];
    var poly=st.poly, k=poly.length, n=st.normal, d=st.depth;
    var bot=poly.map(function(p){ return [p[0]-n[0]*d, p[1]-n[1]*d, p[2]-n[2]*d]; });
    var v0=pos.length/3, i0=idx.length;

    /* top fan (coloured) */
    var topStart=pos.length/3;
    for(j=0;j<k;j++){
      pos.push(poly[j][0],poly[j][1],poly[j][2]);
      nrm.push(n[0],n[1],n[2]);
      col.push(1,1,1); top.push(1);
    }
    for(j=1;j<k-1;j++) idx.push(v0, v0+j, v0+j+1);
    topRanges.push({start:topStart, count:k});

    /* sides (plastic) */
    for(j=0;j<k;j++){
      var a=poly[j], b=poly[(j+1)%k], a2=bot[j], b2=bot[(j+1)%k];
      var e1=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
      var e2=[a2[0]-a[0],a2[1]-a[1],a2[2]-a[2]];
      /* outward = e2 × e1 for a CCW-wound top polygon */
      var fn=[e2[1]*e1[2]-e2[2]*e1[1], e2[2]*e1[0]-e2[0]*e1[2], e2[0]*e1[1]-e2[1]*e1[0]];
      var l=Math.hypot(fn[0],fn[1],fn[2])||1;
      fn=[fn[0]/l,fn[1]/l,fn[2]/l];
      var vv=pos.length/3;
      [a,a2,b2,b].forEach(function(p){
        pos.push(p[0],p[1],p[2]); nrm.push(fn[0],fn[1],fn[2]);
        col.push(PLASTIC[0],PLASTIC[1],PLASTIC[2]); top.push(0);
      });
      idx.push(vv,vv+1,vv+2, vv,vv+2,vv+3);
    }
    /* bottom cap (plastic, reversed) */
    var vb=pos.length/3;
    for(j=0;j<k;j++){
      pos.push(bot[j][0],bot[j][1],bot[j][2]);
      nrm.push(-n[0],-n[1],-n[2]);
      col.push(PLASTIC[0],PLASTIC[1],PLASTIC[2]); top.push(0);
    }
    for(j=1;j<k-1;j++) idx.push(vb, vb+j+1, vb+j);

    idxRanges.push({start:i0, count:idx.length-i0});
  }

  geo={ topRanges:topRanges, idxRanges:idxRanges,
        indexArr:new Uint16Array(idx), colorArr:new Float32Array(col),
        vertexCount:pos.length/3 };

  gl.bindBuffer(gl.ARRAY_BUFFER, bufPos);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, bufNrm);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nrm), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, bufTop);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(top), gl.STATIC_DRAW);
  refreshColors();
  setIndexAll();
}

function refreshColors(){
  var i, j;
  for(i=0;i<P.stickers.length;i++){
    var c=pal[colors[i]];
    var r=geo.topRanges[i];
    for(j=0;j<r.count;j++){
      geo.colorArr[(r.start+j)*3]=c[0];
      geo.colorArr[(r.start+j)*3+1]=c[1];
      geo.colorArr[(r.start+j)*3+2]=c[2];
    }
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, bufCol);
  gl.bufferData(gl.ARRAY_BUFFER, geo.colorArr, gl.DYNAMIC_DRAW);
}

var staticCount=0, movingCount=0;
function setIndexAll(){
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxStatic);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.indexArr, gl.DYNAMIC_DRAW);
  staticCount=geo.indexArr.length; movingCount=0;
}
function splitIndex(members){
  var isM={}, i, j;
  for(i=0;i<members.length;i++) isM[members[i]]=1;
  var sArr=[], mArr=[];
  for(i=0;i<geo.idxRanges.length;i++){
    var r=geo.idxRanges[i], dst=isM[i]?mArr:sArr;
    for(j=0;j<r.count;j++) dst.push(geo.indexArr[r.start+j]);
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxStatic);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(sArr), gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxMoving);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mArr), gl.DYNAMIC_DRAW);
  staticCount=sArr.length; movingCount=mArr.length;
}

/* ---------- camera: a mass on a spring ---------- */
var cam={
  yaw:-0.62, pitch:0.44, dist:7.4,
  vyaw:0, vpitch:0, zoom:1, targetZoom:1, fit:1,
  dragging:false, lastX:0, lastY:0, lastT:0,
  idleAt:performance.now()
};
var PITCH_MAX=1.35, BASE_DIST=7.4;

function camTick(dt){
  if(!cam.dragging){
    cam.yaw += cam.vyaw*dt;
    cam.pitch += cam.vpitch*dt;
    var damp=Math.pow(0.14, dt);          /* momentum bleeding off */
    cam.vyaw*=damp; cam.vpitch*=damp;
    /* rubber band past the poles */
    if(cam.pitch>PITCH_MAX){ cam.pitch += (PITCH_MAX-cam.pitch)*Math.min(1,12*dt); cam.vpitch*=Math.pow(0.002,dt); }
    if(cam.pitch<-PITCH_MAX){ cam.pitch += (-PITCH_MAX-cam.pitch)*Math.min(1,12*dt); cam.vpitch*=Math.pow(0.002,dt); }
    /* idle: the puzzle turns itself to be admired */
    if(!REDUCED && performance.now()-cam.idleAt>5000 && queue.length===0 && !anim){
      cam.vyaw += (0.22-cam.vyaw)*Math.min(1,0.5*dt);
    }
  }
  cam.zoom += (cam.targetZoom-cam.zoom)*Math.min(1,10*dt);
  cam.dist = BASE_DIST*cam.fit*cam.zoom;
}

canvas.addEventListener("pointerdown", function(e){
  canvas.setPointerCapture(e.pointerId);
  cam.dragging=true; cam.lastX=e.clientX; cam.lastY=e.clientY;
  cam.lastT=performance.now(); cam.vyaw=0; cam.vpitch=0;
  cam.idleAt=performance.now();
});
canvas.addEventListener("pointermove", function(e){
  if(!cam.dragging) return;
  var now=performance.now(), dt=Math.max(1,now-cam.lastT)/1000;
  var dx=(e.clientX-cam.lastX)/canvas.clientHeight*3.2;
  var dy=(e.clientY-cam.lastY)/canvas.clientHeight*3.2;
  /* pushing past a pole meets rubber, not a wall */
  var give=(cam.pitch>PITCH_MAX||cam.pitch<-PITCH_MAX)?0.28:1;
  cam.yaw+=dx; cam.pitch+=dy*give;
  cam.vyaw=0.7*cam.vyaw+0.3*(dx/dt);
  cam.vpitch=0.7*cam.vpitch+0.3*(dy*give/dt);
  cam.lastX=e.clientX; cam.lastY=e.clientY; cam.lastT=now;
  cam.idleAt=now;
});
function endDrag(){
  cam.dragging=false; cam.idleAt=performance.now();
  if(REDUCED){ cam.vyaw=0; cam.vpitch=0; }
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("wheel", function(e){
  e.preventDefault();
  cam.targetZoom=Math.max(0.62, Math.min(1.6, cam.targetZoom*(1+e.deltaY*0.0012)));
  cam.idleAt=performance.now();
},{passive:false});
canvas.addEventListener("dblclick", function(){
  cam.targetZoom=1; cam.vyaw=0; cam.vpitch=0;
  cam.idleAt=performance.now();
});
/* pinch zoom */
var pinch=null;
canvas.addEventListener("touchstart", function(e){
  if(e.touches.length===2){
    pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,
                     e.touches[0].clientY-e.touches[1].clientY);
  }
},{passive:true});
canvas.addEventListener("touchmove", function(e){
  if(e.touches.length===2&&pinch){
    var d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,
                     e.touches[0].clientY-e.touches[1].clientY);
    cam.targetZoom=Math.max(0.62, Math.min(1.6, cam.targetZoom*pinch/d));
    pinch=d;
  }
},{passive:true});
canvas.addEventListener("touchend", function(){ pinch=null; },{passive:true});

/* ---------- move queue & animation ---------- */
var queue=[];         /* [{mv, dur}] */
var anim=null;        /* {mv, twist, t0, dur, target} */
var glow=0, playing=null; /* playing: {label, names, at, t0} for the ticker */
var teach=null;       /* {auto, armed} while the guided solve is on */

/* ---------- the map of everywhere ---------- */
var mapView=null, mapOpen=false, mapCloudKind=null;
var walkReqId=0, walkSteps=null, threadRadii=null;

var MAP_CAPTIONS={
  cube2:"every dot is a real position of the pocket cube · shells = exact turns from home (the God table)",
  cube3:"nebula: all 1,082,565 orientation×slice coordinates, shells = proven turns to G1 · nucleus: the corner-permutation space inside G1",
  other:"Ariadne's thread — the walk itself · shells = length of the simplified move word"
};

function mapStride(){
  var small=Math.min(innerWidth,innerHeight)<700;
  return kind==="cube2" ? (small?8:2) : (small?4:1);
}

function ensureMap(){
  if(!mapView){
    mapView=MapView(mapCanvas);
    if(!mapView){ setStatus("the map needs WebGL too — it stays rolled up"); return false; }
  }
  return true;
}

function requestCloud(){
  if(!mapView||!mapOpen) return;
  if(kind==="cube2"||kind==="cube3"){
    mapCap.textContent="charting the space…";
    if(mapCloudKind!==kind)
      getWorker().postMessage({cmd:"map", kind:kind, stride:mapStride()});
    else mapCap.textContent=MAP_CAPTIONS[kind];
  } else {
    mapView.clearClouds();
    mapView.setMaxR(KINDS[kind].scramble*1.02);
    mapCloudKind=null;
    mapCap.textContent=MAP_CAPTIONS.other;
  }
}

function requestWalk(moves){
  if(!mapView) return;
  walkSteps=null; threadRadii=null;
  if(kind==="cube2"||kind==="cube3"){
    var id=++walkReqId;
    getWorker().postMessage({cmd:"walk", kind:kind, id:id,
      colors:Array.prototype.slice.call(colors),
      names:moves.map(function(m){ return P.moveName(m); })});
  } else {
    var hist=history.slice(), radii=[simplifyWord(hist).length];
    for(var i=0;i<moves.length;i++){
      hist.push(moves[i]);
      radii.push(simplifyWord(hist).length);
    }
    threadRadii=radii;
    mapView.setWalk(mapView.threadWalk(radii));
    updateReadout();
  }
}

function updateReadout(){
  if(!mapOpen) return;
  var i=playing ? Math.max(0, playing.at+(anim?0:1)) : 0;
  if(walkSteps){
    var s=walkSteps[Math.min(i,walkSteps.length-1)];
    if(kind==="cube2")
      mapLive.textContent="exactly "+s.d+" turn"+(s.d===1?"":"s")+" from home";
    else
      mapLive.textContent= s.g
        ? (s.d2===0 ? "home — the centre of everything"
                    : "inside G1 · proven ≥ "+s.d2+" turns to home")
        : "outside G1 · proven ≥ "+s.d+" turns to reach it";
  } else if(threadRadii){
    var r=threadRadii[Math.min(i,threadRadii.length-1)];
    mapLive.textContent="thread length: "+r+" turn"+(r===1?"":"s");
  } else if(!playing){
    mapLive.textContent="";
  }
}

function easeOutBack(t){
  var c1=0.9, c3=c1+1;
  return 1 + c3*Math.pow(t-1,3) + c1*Math.pow(t-1,2);
}
function ease(t){ return t<0?0:t>1?1:easeOutBack(t); }

function pump(now){
  if(anim || queue.length===0) return;
  if(teach && !teach.auto && !teach.armed) return;  /* wait for "next" */
  if(teach) teach.armed=false;
  var next=queue.shift();
  var tw=P.twists[next.mv.t];
  var turns=next.mv.n>tw.order/2 ? next.mv.n-tw.order : next.mv.n; /* shortest arc */
  splitIndex(tw.members);
  anim={ mv:next.mv, twist:tw, t0:now, dur:REDUCED?80:next.dur,
         target:turns*tw.step };
  if(playing){
    playing.at++;
    renderTicker();
    if(teach) showTeachMove(playing.names[playing.at],
                            playing.at+1, playing.names.length);
    updateReadout();
  }
}

function animTick(now){
  if(!anim) return;
  var t=(now-anim.t0)/anim.dur;
  if(t>=1){
    P.applyMove(colors, anim.mv);
    history.push(anim.mv);
    anim=null;
    refreshColors();
    setIndexAll();
    updateReadout();
    if(queue.length===0) onProgramDone();
  }
}

/* ---------- the teacher's voice ---------- */
var FACE_WORDS={U:"top",D:"bottom",R:"right",L:"left",F:"front",B:"back"};
function moveDesc(name){
  var m=/^(\d*)([URFDLB])(2|')?$/.exec(name);
  if(!m) return "turn face "+name;
  var layer=m[1]?["","","second ","third "][+m[1]]+"layer from the ":"";
  var amt=m[3]==="2"?"a half turn":
          m[3]==="'"?"a quarter turn counter-clockwise":
          "a quarter turn clockwise";
  return "turn the "+layer+FACE_WORDS[m[2]].toUpperCase()+" face "+amt+
         (m[3]==="'"?" (that's what the ' mark means)":"");
}
function showTeachMove(name, at, total){
  teachBadge.hidden=false;
  teachBadge.innerHTML="<b>"+name+"</b><span>"+moveDesc(name)+
    "</span><i>turn "+at+" of "+total+"</i>";
}
function showTeachIntro(total){
  teachBadge.hidden=false;
  teachBadge.innerHTML="<b>ready</b><span>hold your cube exactly as you scanned it — "+
    "white on top, green facing you. press <em>next turn</em> and make each move "+
    "along with the screen.</span><i>"+total+" turns to home</i>";
}
btnTeachNext.addEventListener("click", function(){ if(teach) teach.armed=true; });
btnTeachAuto.addEventListener("click", function(){
  if(!teach) return;
  teach.auto=!teach.auto;
  btnTeachAuto.textContent="auto: "+(teach.auto?"on":"off");
});
btnTeachExit.addEventListener("click", function(){
  teach=null; teachBar.hidden=true; teachBadge.hidden=true;
});

function onProgramDone(){
  var wasSolving=playing&&playing.solving;
  var wasTeach=playing&&playing.teach;
  playing=null;
  if(wasTeach){
    teach=null; teachBar.hidden=true;
    teachBadge.innerHTML="<b>solved</b><span>and now your real cube is home too. "+
      "scramble it and come back any time.</span><i>🎉</i>";
    setTimeout(function(){ teachBadge.hidden=true; }, 5200);
  }
  setBusy(false);
  if(P.isSolved(colors)){
    history=[];
    if(wasSolving){
      glow=1.9;
      canvas.classList.add("solved");
      setTimeout(function(){ canvas.classList.remove("solved"); }, 2400);
      var dt=((performance.now()-wasSolvingT0)/1000).toFixed(1);
      setStatus("solved — "+wasSolving.count+" turns, "+dt+" s · "+KINDS[kind].method);
    } else {
      setStatus("home again");
    }
  } else if(wasSolving){
    setStatus("stopped mid-thought — press solve to finish");
  } else {
    setStatus("scrambled — "+history.length+" turns deep · press solve");
  }
  setTimeout(function(){ if(!playing) elTicker.classList.remove("show"); }, 1600);
}
var wasSolvingT0=0;

/* ---------- program helpers ---------- */
function enqueueProgram(moves, opts){
  var names=moves.map(function(m){ return P.moveName(m); });
  playing={ names:names, at:-1, teach:!!opts.teach,
            solving:opts.solving?{count:moves.length}:null };
  if(opts.solving) wasSolvingT0=performance.now();
  if(opts.teach){
    teach={auto:false, armed:false};
    teachBar.hidden=false;
    btnTeachAuto.textContent="auto: off";
    showTeachIntro(moves.length);
  }
  var total=moves.length;
  queue=moves.map(function(m,i){
    var dur;
    if(opts.teach){
      dur = 680;
    } else if(opts.solving){
      /* a performance: set off briskly, land the final turns with weight */
      var tail=total-1-i;
      dur = tail>6 ? Math.max(95, 240-18*Math.min(i,8)) : 180+40*(6-tail);
    } else {
      dur = 88;
    }
    return { mv:m, dur:dur };
  });
  renderTicker();
  elTicker.classList.add("show");
  setBusy(true);
  requestWalk(moves);
}

function simplifyWord(moves){
  var out=[];
  for(var i=0;i<moves.length;i++){
    var m=moves[i];
    if(out.length && out[out.length-1].t===m.t){
      var o=P.twists[m.t].order;
      var n=(out[out.length-1].n+m.n)%o;
      out.pop();
      if(n!==0) out.push({t:m.t,n:n});
    } else out.push({t:m.t,n:m.n});
  }
  return out;
}

/* ---------- ticker / status ---------- */
function renderTicker(){
  if(!playing){ elTicker.innerHTML=""; return; }
  var html="", from=Math.max(0, playing.at-4);
  var upto=Math.min(playing.names.length, playing.at+9);
  if(from>0) html+="<span class='dim'>…</span>";
  for(var i=from;i<upto;i++){
    html+="<span class='"+(i===playing.at?"now":i<playing.at?"done":"")+"'>"+playing.names[i]+"</span>";
  }
  if(upto<playing.names.length) html+="<span class='dim'>…</span>";
  elTicker.innerHTML=html;
}
function setStatus(t){ elStatus.textContent=t; }
function setBusy(b){
  btnScramble.disabled=b; btnSolve.disabled=b;
  btnStop.hidden=!b;
  pickers.forEach(function(p){ p.disabled=b; });
}

/* ---------- the solver in the back office ---------- */
var worker=null, solveId=0, pendingSolve=null, workerReady={};
var checkId=0, pendingChecks={};
function getWorker(){
  if(worker) return worker;
  worker=new Worker("worker.js?v=2");
  worker.onmessage=function(e){
    var d=e.data;
    if(d.type==="progress"){
      if(pendingSolve && pendingSolve.kind===d.kind)
        setStatus("preparing the mathematics — "+d.label+" ("+Math.round(d.pct*100)+"%)");
      else if(mapOpen && mapCloudKind!==kind && d.kind===kind)
        mapCap.textContent="charting the space — "+d.label+" ("+Math.round(d.pct*100)+"%)";
    } else if(d.type==="ready"){
      workerReady[d.kind]=true;
    } else if(d.type==="solution"){
      workerReady[d.kind]=true;
      if(pendingSolve && d.id===pendingSolve.id && d.kind===kind){
        var wasTeach=pendingSolve.teach;
        pendingSolve=null;
        var moves=d.moves.map(P.namedMove);
        setStatus(wasTeach
          ? "your cube's solution — "+moves.length+" turns, one at a time"
          : KINDS[kind].method+" · "+moves.length+" turns");
        enqueueProgram(moves,{solving:true, teach:wasTeach});
      }
    } else if(d.type==="map"){
      if(mapView && d.kind===kind){
        var list=[{pos:d.cloud.pos, dep:d.cloud.dep, n:d.cloud.n, maxd:d.cloud.maxd,
                   alpha:kind==="cube2"?0.22:0.28, ptScale:kind==="cube2"?34:44}];
        if(d.core) list.push({pos:d.core.pos, dep:d.core.dep, n:d.core.n,
                              maxd:d.core.maxd, alpha:0.5, ptScale:20, core:true});
        mapView.setClouds(list);
        mapCloudKind=d.kind;
        mapCap.textContent=MAP_CAPTIONS[d.kind]+" · "+d.cloud.n.toLocaleString()+" dots";
      }
    } else if(d.type==="walk"){
      if(mapView && d.id===walkReqId && d.kind===kind){
        walkSteps=d.steps;
        mapView.setWalk(d.steps.map(function(s){ return [s.x,s.y,s.z]; }));
        updateReadout();
      }
    } else if(d.type==="check"){
      var cb=pendingChecks[d.id];
      delete pendingChecks[d.id];
      if(cb) cb(d.ok, d.reason);
    } else if(d.type==="error"){
      pendingSolve=null;
      setBusy(false);
      setStatus("the solver lost the plot: "+d.message);
    }
  };
  return worker;
}

/* ---------- actions ---------- */
btnScramble.addEventListener("click", function(){
  var moves=P.scramble(KINDS[kind].scramble);
  setStatus("scrambling…");
  enqueueProgram(moves,{solving:false});
});

btnSolve.addEventListener("click", function(){
  if(P.isSolved(colors)){ setStatus("already home — scramble it first"); return; }
  if(kind==="cube2"||kind==="cube3"){
    setBusy(true);
    setStatus("reading the stickers…");
    var id=++solveId;
    pendingSolve={id:id, kind:kind};
    getWorker().postMessage({cmd:"solve", kind:kind, id:id,
                             colors:Array.prototype.slice.call(colors)});
  } else {
    var thread=simplifyWord(P.invertWord(history));
    setStatus(KINDS[kind].method+" · "+thread.length+" turns");
    enqueueProgram(thread,{solving:true});
  }
});

btnStop.addEventListener("click", function(){
  queue=[];
  if(playing){ playing.solving=null; playing.teach=false; }
  teach=null; teachBar.hidden=true; teachBadge.hidden=true;
});

btnMap.addEventListener("click", function(){
  if(!ensureMap()) return;
  mapOpen=!mapOpen;
  document.body.classList.toggle("map-on", mapOpen);
  btnMap.textContent=mapOpen?"roll up the map ✦":"the map ✦";
  if(mapOpen){ requestCloud(); updateReadout(); }
});

pickers.forEach(function(btn){
  btn.addEventListener("click", function(){ setKind(btn.dataset.kind); });
});

function setKind(k){
  kind=k;
  P=PuzzleEngine.build(k==="mega"?"mega":k);
  pal=KINDS[k].pal.map(hex2rgb);
  colors=P.newColors();
  history=[]; queue=[]; anim=null; playing=null; pendingSolve=null; glow=0;
  teach=null; teachBar.hidden=true; teachBadge.hidden=true;
  walkSteps=null; threadRadii=null;
  if(mapView) mapView.setWalk(null);
  btnScan.hidden = k!=="cube3";
  buildGeometry();
  pickers.forEach(function(p){ p.classList.toggle("on", p.dataset.kind===k); });
  elFact.textContent=KINDS[k].fact;
  if(mapOpen){ requestCloud(); mapLive.textContent=""; }
  setStatus(k==="mega"
    ? "the shape from the photographs — drag it, fling it, scramble it"
    : "drag to turn it · fling it and it keeps going");
  setBusy(false);
  elTicker.classList.remove("show");
  /* warm the solver while nobody's looking */
  if(k==="cube2"||k==="cube3") getWorker().postMessage({cmd:"prep", kind:k});
}

/* ---------- render loop ---------- */
function resize(){
  var dpr=Math.min(2, window.devicePixelRatio||1);
  var w=canvas.clientWidth*dpr, h=canvas.clientHeight*dpr;
  if(canvas.width!==w||canvas.height!==h){ canvas.width=w; canvas.height=h; }
  gl.viewport(0,0,w,h);
  /* on tall screens, step back so the puzzle fits the narrow side */
  var aspect=w/h;
  cam.fit=Math.min(1.9, Math.max(1, 0.92/aspect));
}

var lastFrame=performance.now();
function frame(now){
  requestAnimationFrame(frame);
  var dt=Math.min(0.05,(now-lastFrame)/1000);
  lastFrame=now;
  resize();
  camTick(dt);
  pump(now);
  animTick(now);
  if(glow>0) glow=Math.max(0, glow-dt*1.1);

  if(mapOpen&&mapView){
    if(playing&&playing.at>=0){
      var mt=anim?Math.max(0,Math.min(1,(now-anim.t0)/anim.dur)):1;
      mapView.setProgress(playing.at, mt);
    }
    mapView.frame(dt, true);
  }

  gl.clearColor(0,0,0,0);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);

  var aspect=canvas.width/canvas.height;
  var proj=mPersp(0.62, aspect, 0.1, 60);
  var view=mMul(mTranslate(0,0,-cam.dist), mMul(mRotX(cam.pitch), mRotY(cam.yaw)));
  /* eye position in world space (inverse of the two rotations) */
  var cy=Math.cos(cam.yaw), sy=Math.sin(cam.yaw);
  var cp=Math.cos(cam.pitch), sp=Math.sin(cam.pitch);
  var eye=[ -cam.dist*sy*cp, cam.dist*sp, cam.dist*cy*cp ];

  gl.uniformMatrix4fv(loc.uProj,false,proj);
  gl.uniformMatrix4fv(loc.uView,false,view);
  gl.uniform1f(loc.uGlow, Math.min(1,glow));
  gl.uniform3fv(loc.uEye, eye);

  [[bufPos,loc.aPos,3],[bufNrm,loc.aNrm,3],[bufCol,loc.aCol,3],[bufTop,loc.aTop,1]]
  .forEach(function(b){
    gl.bindBuffer(gl.ARRAY_BUFFER,b[0]);
    gl.enableVertexAttribArray(b[1]);
    gl.vertexAttribPointer(b[1],b[2],gl.FLOAT,false,0,0);
  });

  gl.uniformMatrix4fv(loc.uModel,false,mIdentity());
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxStatic);
  gl.drawElements(gl.TRIANGLES, staticCount, gl.UNSIGNED_SHORT, 0);

  if(anim && movingCount>0){
    var t=(now-anim.t0)/anim.dur;
    var a=anim.target*ease(t);
    gl.uniformMatrix4fv(loc.uModel,false,mAxisAngle(anim.twist.axis,a));
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxMoving);
    gl.drawElements(gl.TRIANGLES, movingCount, gl.UNSIGNED_SHORT, 0);
  }
}

/* ---------- maths panel ---------- */
var mathsBtn=document.getElementById("btnMaths");
var mathsPanel=document.getElementById("maths");
mathsBtn.addEventListener("click", function(){
  var open=!mathsPanel.classList.contains("show");
  mathsPanel.classList.toggle("show", open);
  mathsBtn.textContent=open?"back to the puzzle ×":"the mathematics ✦";
});

/* ---------- the scanner's doorway into the room ---------- */
window.RoomAPI={
  getKind:function(){ return kind; },
  palette:CUBE_PAL,
  ensureCube3:function(){ if(kind!=="cube3") setKind("cube3"); },
  check:function(cols, cb){
    var id=++checkId;
    pendingChecks[id]=cb;
    getWorker().postMessage({cmd:"check", kind:"cube3", id:id,
                             colors:Array.prototype.slice.call(cols)});
  },
  applyScan:function(cols){
    if(kind!=="cube3") setKind("cube3");
    colors.set(cols);
    history=[];
    refreshColors();
    setStatus("your cube, read from the stickers — press solve, or let it teach you");
  },
  teachSolve:function(){
    if(kind!=="cube3") return;
    if(P.isSolved(colors)){ setStatus("this cube is already home"); return; }
    setBusy(true);
    setStatus("reading the stickers…");
    var id=++solveId;
    pendingSolve={id:id, kind:kind, teach:true};
    getWorker().postMessage({cmd:"solve", kind:kind, id:id,
                             colors:Array.prototype.slice.call(colors)});
  }
};

setKind("mega");
requestAnimationFrame(frame);
})();
