/* Fast local 3D viewer for Jeffrey Lin portfolio v0.2.
   Uses locally hosted Plotly WebGL and preprocessed geometry derived from the project MJCF.
   No external CDN, MuJoCo WASM download, or browser-side mesh compilation is required. */
(() => {
  'use strict';
  const cfg = window.FAST_VIEWER_CONFIG || {};
  const plot = document.getElementById('plot');
  const status = document.getElementById('status');
  const loading = document.getElementById('loading');
  const loadText = document.getElementById('load-text');
  const controlsRoot = document.getElementById('controls');
  const demoBtn = document.getElementById('demo');
  const resetBtn = document.getElementById('reset');
  const fullBtn = document.getElementById('full');
  const backBtn = document.getElementById('back');

  let model = null;
  let values = [];
  let traceSegments = [];
  let demoOn = false;
  let demoStart = 0;
  let rafPending = false;
  let demoRaf = 0;

  const I4 = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  function mul(a,b){
    const o=new Array(16).fill(0);
    for(let r=0;r<4;r++)for(let c=0;c<4;c++){
      let s=0;for(let k=0;k<4;k++)s+=a[r*4+k]*b[k*4+c];o[r*4+c]=s;
    } return o;
  }
  function translate(x,y,z){const m=I4();m[3]=x;m[7]=y;m[11]=z;return m;}
  function axisRotation(axis, angle){
    let [x,y,z]=axis;const n=Math.hypot(x,y,z)||1;x/=n;y/=n;z/=n;
    const c=Math.cos(angle),s=Math.sin(angle),C=1-c;
    return [x*x*C+c,x*y*C-z*s,x*z*C+y*s,0,
            y*x*C+z*s,y*y*C+c,y*z*C-x*s,0,
            z*x*C-y*s,z*y*C+x*s,z*z*C+c,0,
            0,0,0,1];
  }
  function jointMatrix(j){
    if(!j)return I4();
    const q=(values[j.control]||0)*(j.sign ?? 1)+(j.offset||0);
    const a=j.axis||[0,0,1];
    if(j.type==='slide')return translate(a[0]*q,a[1]*q,a[2]*q);
    const p=j.pos||[0,0,0];
    return mul(mul(translate(p[0],p[1],p[2]),axisRotation(a,q)),translate(-p[0],-p[1],-p[2]));
  }
  function worldMatrices(){
    const W=new Array(model.segments.length);
    for(let i=0;i<model.segments.length;i++){
      const s=model.segments[i], parent=s.parent>=0?W[s.parent]:I4();
      W[i]=mul(mul(parent,s.static),jointMatrix(s.joint));
    } return W;
  }
  function transformVertices(M,V){
    const n=V.length,x=new Array(n),y=new Array(n),z=new Array(n);
    for(let i=0;i<n;i++){
      const v=V[i],vx=v[0],vy=v[1],vz=v[2];
      x[i]=M[0]*vx+M[1]*vy+M[2]*vz+M[3];
      y[i]=M[4]*vx+M[5]*vy+M[6]*vz+M[7];
      z[i]=M[8]*vx+M[9]*vy+M[10]*vz+M[11];
    } return [x,y,z];
  }
  function displayValue(c,v){
    if(c.display==='deg')return `${(v*180/Math.PI).toFixed(1)}°`;
    if(c.display==='mm')return `${(v*1000).toFixed(0)} mm`;
    return Number(v).toFixed(3);
  }
  function makeControls(){
    controlsRoot.innerHTML=''; values=model.controls.map(c=>Number(c.value||0));
    model.controls.forEach((c,i)=>{
      const d=document.createElement('div');d.className='control';
      d.innerHTML=`<div class="control-head"><strong>${c.label}</strong><output>${displayValue(c,values[i])}</output></div><input type="range" min="${c.min}" max="${c.max}" step="${c.step||0.001}" value="${values[i]}">`;
      controlsRoot.appendChild(d);
      const r=d.querySelector('input'),o=d.querySelector('output');
      r.addEventListener('input',()=>{demoOn=false;demoBtn.textContent='Showcase';values[i]=Number(r.value);o.value=displayValue(c,values[i]);scheduleUpdate();});
      c._range=r;c._out=o;
    });
  }
  function syncControls(){model.controls.forEach((c,i)=>{if(c._range){c._range.value=values[i];c._out.value=displayValue(c,values[i]);}});}
  function traceData(){
    const W=worldMatrices(), traces=[];traceSegments=[];
    for(let si=0;si<model.segments.length;si++){
      const m=model.segments[si].mesh;if(!m)continue;
      const [x,y,z]=transformVertices(W[si],m.v);const f=m.f;
      traces.push({type:'mesh3d',x,y,z,i:f.map(t=>t[0]),j:f.map(t=>t[1]),k:f.map(t=>t[2]),color:m.color||'#9aa2ad',flatshading:false,hoverinfo:'skip',showscale:false,lighting:{ambient:.6,diffuse:.75,specular:.15,roughness:.75,fresnel:.05},lightposition:{x:2,y:-3,z:5}});
      traceSegments.push(si);
    } return traces;
  }
  function updateModel(){
    rafPending=false;if(!model)return;
    const W=worldMatrices(),xs=[],ys=[],zs=[];
    for(const si of traceSegments){const [x,y,z]=transformVertices(W[si],model.segments[si].mesh.v);xs.push(x);ys.push(y);zs.push(z);}
    Plotly.restyle(plot,{x:xs,y:ys,z:zs},traceSegments.map((_,i)=>i));
  }
  function scheduleUpdate(){if(!rafPending){rafPending=true;requestAnimationFrame(updateModel);}}
  function layout(){
    const eye=cfg.eye||{x:1.45,y:-1.65,z:1.15};
    return {margin:{l:0,r:0,t:0,b:0},paper_bgcolor:'#0d0f13',plot_bgcolor:'#0d0f13',showlegend:false,uirevision:'keep-camera',scene:{bgcolor:'#0d0f13',aspectmode:'data',xaxis:{visible:false},yaxis:{visible:false},zaxis:{visible:false},camera:{eye,up:{x:0,y:0,z:1}},dragmode:'orbit'}};
  }
  function resetCamera(){Plotly.relayout(plot,{'scene.camera':{eye:cfg.eye||{x:1.45,y:-1.65,z:1.15},up:{x:0,y:0,z:1}}});}
  function reset(){demoOn=false;demoBtn.textContent='Showcase';values=model.controls.map(c=>Number(c.value||0));syncControls();updateModel();resetCamera();}
  function demoTargets(t){
    const seq=model.demo||[];if(!seq.length)return null;const total=seq.reduce((s,k)=>s+k.duration,0);let tt=t%total;let prev=model.controls.map(c=>Number(c.value||0));
    for(const k of seq){if(tt<=k.duration){const u=Math.max(0,Math.min(1,tt/k.duration)),s=u*u*(3-2*u);return k.values.map((v,i)=>prev[i]+(v-prev[i])*s);}tt-=k.duration;prev=k.values;}return prev;
  }
  function demoLoop(now){
    if(!demoOn)return;const v=demoTargets((now-demoStart)/1000);if(v){values=v;syncControls();updateModel();}demoRaf=requestAnimationFrame(demoLoop);
  }
  async function fetchJSONProgress(url, timeoutMs=30000){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const r=await fetch(url,{signal:controller.signal,cache:'force-cache'});if(!r.ok)throw new Error(`${r.status} ${r.statusText}`);
      const total=Number(r.headers.get('content-length'))||0;
      if(!r.body){loadText.textContent='Loading model data…';return await r.json();}
      const reader=r.body.getReader();let got=0;const chunks=[];
      while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);got+=value.length;loadText.textContent=total?`Loading model data… ${Math.min(100,Math.round(got/total*100))}%`:`Loading model data… ${(got/1048576).toFixed(1)} MB`;}
      const all=new Uint8Array(got);let p=0;for(const c of chunks){all.set(c,p);p+=c.length;}return JSON.parse(new TextDecoder().decode(all));
    } finally {clearTimeout(timer);}
  }
  function fail(err){console.error(err);loadText.innerHTML=`<div class="error"><strong>3D viewer could not load.</strong>\n${String(err)}\n\nThis v0.2 viewer is fully local. Try refreshing once; if it still fails, send the browser Console error.</div>`;status.textContent='Viewer error';}

  backBtn && (backBtn.onclick=()=>history.back());
  resetBtn && (resetBtn.onclick=()=>reset());
  fullBtn && (fullBtn.onclick=()=>document.documentElement.requestFullscreen?.());
  demoBtn && (demoBtn.onclick=()=>{demoOn=!demoOn;demoBtn.textContent=demoOn?'Stop demo':'Showcase';if(demoOn){demoStart=performance.now();cancelAnimationFrame(demoRaf);demoRaf=requestAnimationFrame(demoLoop);}});

  (async()=>{
    try{
      if(!window.Plotly)throw new Error('Local Plotly runtime was not found.');
      loadText.textContent='Loading local 3D model…';model=await fetchJSONProgress(cfg.data||'model-data.json',cfg.timeout||30000);
      loadText.textContent='Preparing WebGL geometry…';makeControls();
      const traces=traceData();await Plotly.newPlot(plot,traces,layout(),{responsive:true,displaylogo:false,scrollZoom:true,modeBarButtonsToRemove:['toImage','select2d','lasso2d','autoScale2d','hoverClosest3d','toggleSpikelines']});
      status.textContent=`Local interactive model · ${model.stats?.faces?.toLocaleString?.()||''} triangles · no CDN`;
      loading.classList.add('hide');
    }catch(e){fail(e);}
  })();
})();
