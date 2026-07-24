/* worker.js — the solving room's back office.
   Builds the solvers' tables off the main thread so the cube never
   stutters, then answers "solve" requests with move words. */
/* global PuzzleEngine, CubeSolver */
importScripts("puzzle.js?v=1", "solver.js?v=1");

var built = {};

function ensure(kind, report){
  if (built[kind]) return built[kind];
  var P = PuzzleEngine.build(kind);
  var S = CubeSolver, b;

  if (kind === "cube3"){
    var ops = [];
    ["U","R","F","D","L","B"].forEach(function(f, fi){
      [1,2,3].forEach(function(pow){
        var name = f + (pow===2 ? "2" : pow===3 ? "'" : "");
        var c = P.newColors();
        P.applyMove(c, P.namedMove(name));
        ops.push({ name:name, face:fi, power:pow,
                   state:S.analyze(P.cubies, c, P.faceOf) });
      });
    });
    var sv3 = S.Solver3(ops);
    sv3.init(P.cubies.edges.map(function(e){ return e.faces; }), P.faceOf, report);
    b = { P:P, sv:sv3, kind:kind };
  } else if (kind === "cube2"){
    var ops2 = [];
    ["U","R","F"].forEach(function(f){
      ["","2","'"].forEach(function(sfx){
        var name = f + sfx;
        var c = P.newColors();
        P.applyMove(c, P.namedMove(name));
        ops2.push({ name:name, state:S.analyze(P.cubies, c, P.faceOf) });
      });
    });
    var dblKey = [P.faceOf.D, P.faceOf.B, P.faceOf.L].sort().join(",");
    var dbl = -1;
    P.cubies.corners.forEach(function(cn, i){
      if (cn.faces.slice().sort().join(",") === dblKey) dbl = i;
    });
    var sv2 = S.Solver2(ops2, dbl);
    sv2.init(report);
    b = { P:P, sv:sv2, kind:kind };
  } else {
    throw new Error("no solver for " + kind);
  }
  built[kind] = b;
  return b;
}

onmessage = function(e){
  var d = e.data;
  try {
    var b = ensure(d.kind, function(pct, label){
      postMessage({ type:"progress", kind:d.kind, pct:pct, label:label });
    });
    if (d.cmd === "prep"){ postMessage({ type:"ready", kind:d.kind }); return; }
    if (d.cmd === "solve"){
      var colors = Uint8Array.from(d.colors);
      var st = CubeSolver.analyze(b.P.cubies, colors, b.P.faceOf);
      var moves = (d.kind === "cube3") ? b.sv.solve(st, 900) : b.sv.solve(st);
      if (!moves) throw new Error("search timed out");
      postMessage({ type:"solution", kind:d.kind, id:d.id, moves:moves });
    }
  } catch (err){
    postMessage({ type:"error", kind:d.kind, id:d.id,
                  message:String((err && err.message) || err) });
  }
};
