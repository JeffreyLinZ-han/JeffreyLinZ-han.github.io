(() => {
'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const scale=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(a[0],a[1],a[2]);
const normalize=a=>{const n=norm(a)||1;return[a[0]/n,a[1]/n,a[2]/n];};
const lerp=(a,b,t)=>a+(b-a)*t;
const lerp3=(a,b,t)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];
function m4Identity(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}
function m4Mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
function m4Translate(x,y,z){const m=m4Identity();m[12]=x;m[13]=y;m[14]=z;return m;}
function m4Axis(axis,angle){let[x,y,z]=normalize(axis),c=Math.cos(angle),s=Math.sin(angle),t=1-c;return new Float32Array([x*x*t+c,y*x*t+z*s,z*x*t-y*s,0,x*y*t-z*s,y*y*t+c,z*y*t+x*s,0,x*z*t+y*s,y*z*t-x*s,z*z*t+c,0,0,0,0,1]);}
function perspective(fovy,aspect,near,far){const f=1/Math.tan(fovy/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);}
function lookAt(eye,target,up){const z=normalize(sub(eye,target)),x=normalize(cross(up,z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}
function transformPoint(M,p){return[M[0]*p[0]+M[4]*p[1]+M[8]*p[2]+M[12],M[1]*p[0]+M[5]*p[1]+M[9]*p[2]+M[13],M[2]*p[0]+M[6]*p[1]+M[10]*p[2]+M[14]];}
function transformDir(M,p){return normalize([M[0]*p[0]+M[4]*p[1]+M[8]*p[2],M[1]*p[0]+M[5]*p[1]+M[9]*p[2],M[2]*p[0]+M[6]*p[1]+M[10]*p[2]]);}
function shader(gl,type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'Shader error');return s;}
function link(gl,vs,fs){const p=gl.createProgram();gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'Program error');return p;}
async function fetchTimed(url,timeout=45000,cache='no-cache'){const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),timeout);try{const r=await fetch(url,{cache,signal:ctl.signal});if(!r.ok)throw new Error(`${r.status} ${r.statusText}`);return r;}finally{clearTimeout(tm);}}
async function ungzip(url){const r=await fetchTimed(url,45000,'force-cache');if(!('DecompressionStream'in window))throw new Error('Please use a current browser.');const s=r.body.pipeThrough(new DecompressionStream('gzip'));return await new Response(s).arrayBuffer();}
function format(c,v){if(c.display==='deg')return`${(v*180/Math.PI).toFixed(1)}°`;if(c.display==='mm')return`${(v*1000).toFixed(1)} mm`;return v.toFixed(3);}

class HQViewer{
 constructor(cfg={}){
  this.cfg=cfg;this.canvas=document.getElementById(cfg.canvas||'glcanvas');this.poster=document.getElementById(cfg.poster||'viewer-poster');this.busy=document.getElementById(cfg.busy||'viewer-busy');this.status=document.getElementById(cfg.status||'status');this.controlsRoot=cfg.controls===null?null:document.getElementById(cfg.controls||'controls');
  this.gl=this.canvas.getContext('webgl',{antialias:true,alpha:true,premultipliedAlpha:true,powerPreference:'high-performance'});if(!this.gl)throw new Error('3D graphics are unavailable in this browser.');
  this.uintExt=this.gl.getExtension('OES_element_index_uint');if(!this.uintExt)throw new Error('This browser does not support large 3D models.');
  this.meshGPU=[];this.values=[];this.targets=[];this.world=[];this.manifest=null;this.animating=false;this.demoOn=false;this.demoStart=0;this.needsRender=true;this.lastTime=performance.now();this.derivExt=this.gl.getExtension('OES_standard_derivatives');
  this.camera={target:[0,0,0],distance:1,yaw:-.8,pitch:.3};this.cameraGoal={target:[0,0,0],distance:1,yaw:-.8,pitch:.3};this.renderDprCap=2;this.ink=[];this._firstFrame=false;this.autoOrbit=false;this.hiddenGroups=new Set();this.loadId=0;this.fitState=null;this.sceneRadius=1;
  this._setupGL();this._setupOrbit();this.resize();this.ro=new ResizeObserver(()=>this.resize());this.ro.observe(this.canvas.parentElement);
 }
 _setupGL(){
  const gl=this.gl;
  const vs=`precision highp float;
   attribute vec3 aPos; attribute vec3 aNormal;
   uniform mat4 uModel; uniform mat4 uViewProj;
   varying vec3 vN; varying vec3 vW;
   void main(){vec4 w=uModel*vec4(aPos,1.0);vW=w.xyz;vN=normalize(mat3(uModel)*aNormal);gl_Position=uViewProj*w;}`;
  const deriv=this.derivExt?'#extension GL_OES_standard_derivatives : enable\n':'';
  const fs=deriv+`precision highp float;
   varying vec3 vN; varying vec3 vW;
   uniform vec4 uColor; uniform vec3 uEye;
   uniform float uMetal; uniform float uRough; uniform float uSharp;
   vec3 toLinear(vec3 c){return mix(c/12.92,pow((c+0.055)/1.055,vec3(2.4)),step(vec3(0.04045),c));}
   vec3 toSRGB(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));}
   void main(){
    vec3 V=normalize(uEye-vW),N=normalize(vN);
    if(!gl_FrontFacing)N=-N;
    ${this.derivExt?'vec3 F=normalize(cross(dFdx(vW),dFdy(vW)));if(dot(F,V)<0.0)F=-F;N=normalize(mix(N,F,clamp(uSharp,0.0,1.0)));':''}
    float rough=clamp(uRough,0.08,1.0),metal=clamp(uMetal,0.0,1.0);
    vec3 base=toLinear(clamp(uColor.rgb,0.0,1.0));
    vec3 key=normalize(vec3(-0.4,-0.65,1.0)),fill=normalize(vec3(0.7,0.3,0.5));
    float ndv=max(dot(N,V),0.0),keyLit=max(dot(N,key),0.0),fillLit=max(dot(N,fill),0.0);
    vec3 ambient=mix(vec3(0.25,0.27,0.31),vec3(0.57,0.59,0.64),N.z*0.5+0.5);
    vec3 diffuse=base*(ambient+0.48*keyLit+0.18*fillLit);
    vec3 fresnel=mix(vec3(0.035),base,metal);
    float gloss=mix(110.0,9.0,rough*rough);
    float spec=pow(max(dot(N,normalize(V+key)),0.0),gloss);
    float fillSpec=pow(max(dot(N,normalize(V+fill)),0.0),gloss*0.65);
    vec3 color=diffuse*(1.0-metal*0.2)+fresnel*(spec*1.1+fillSpec*0.35)*(1.0-rough*0.5);
    color+=fresnel*(0.18+0.12*max(N.z,0.0))*(1.0-rough*0.3);
    float rim=pow(1.0-ndv,4.0);
    color+=fresnel*rim*0.13;
    float alpha=uColor.a;
    if(alpha<0.995){color=mix(color,vec3(0.55,0.62,0.7),rim*0.32);alpha=min(0.85,alpha+rim*0.18);}
    gl_FragColor=vec4(toSRGB(clamp(color,0.0,1.0)),alpha);
   }`;
  this.prog=link(gl,vs,fs);
  this.loc={pos:gl.getAttribLocation(this.prog,'aPos'),nor:gl.getAttribLocation(this.prog,'aNormal'),model:gl.getUniformLocation(this.prog,'uModel'),vp:gl.getUniformLocation(this.prog,'uViewProj'),color:gl.getUniformLocation(this.prog,'uColor'),eye:gl.getUniformLocation(this.prog,'uEye'),metal:gl.getUniformLocation(this.prog,'uMetal'),rough:gl.getUniformLocation(this.prog,'uRough'),sharp:gl.getUniformLocation(this.prog,'uSharp')};
  const ivs='precision highp float;attribute vec3 aPos;uniform mat4 uViewProj;void main(){gl_Position=uViewProj*vec4(aPos,1.0);}';
  const ifs='precision mediump float;uniform vec4 uColor;void main(){gl_FragColor=uColor;}';
  this.inkProg=link(gl,ivs,ifs);this.inkLoc={pos:gl.getAttribLocation(this.inkProg,'aPos'),vp:gl.getUniformLocation(this.inkProg,'uViewProj'),color:gl.getUniformLocation(this.inkProg,'uColor')};this.inkBuffer=gl.createBuffer();
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
 }
 _setupOrbit(){
  const c=this.canvas,points=new Map();
  const pan=(dx,dy)=>{
   const f=normalize(sub(this.cameraGoal.target,this.eye(this.cameraGoal))),right=normalize(cross(f,[0,0,1])),up=normalize(cross(right,f));
   const s=2*this.cameraGoal.distance*Math.tan(Math.PI/9)/Math.max(c.clientHeight,1);
   this.cameraGoal.target=add(this.cameraGoal.target,add(scale(right,-dx*s),scale(up,dy*s)));
  };
  c.addEventListener('pointerdown',e=>{this.setOrbit(false);this.fitState=null;points.set(e.pointerId,{x:e.clientX,y:e.clientY,button:e.button});c.setPointerCapture?.(e.pointerId);c.focus({preventScroll:true});});
  const finish=e=>points.delete(e.pointerId);
  c.addEventListener('pointerup',finish);c.addEventListener('pointercancel',finish);c.addEventListener('lostpointercapture',finish);
  c.addEventListener('contextmenu',e=>e.preventDefault());
  c.addEventListener('pointermove',e=>{
   const old=points.get(e.pointerId);if(!old)return;
   const next={...old,x:e.clientX,y:e.clientY},dx=next.x-old.x,dy=next.y-old.y;
   if(points.size>1){
    const other=[...points].find(([id])=>id!==e.pointerId)?.[1];
    if(other){const before=Math.hypot(old.x-other.x,old.y-other.y),after=Math.hypot(next.x-other.x,next.y-other.y);if(before>4&&after>4)this.cameraGoal.distance=clamp(this.cameraGoal.distance*before/after,this.sceneRadius*.03,this.sceneRadius*40);pan(dx*.5,dy*.5);}
   }else if(old.button===0&&!e.shiftKey){this.cameraGoal.yaw-=dx*.006;this.cameraGoal.pitch=clamp(this.cameraGoal.pitch+dy*.006,-1.48,1.48);}
   else pan(dx,dy);
   points.set(e.pointerId,next);this.requestRender();
  });
  c.addEventListener('wheel',e=>{e.preventDefault();this.zoom(Math.exp(e.deltaY*.001));},{passive:false});
  c.addEventListener('keydown',e=>{
   if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(e.key))return;
   e.preventDefault();this.setOrbit(false);this.fitState=null;
   if(e.key==='Home'){this.fit();return;}if(e.key==='+'||e.key==='='){this.zoom(.85);return;}if(e.key==='-'){this.zoom(1.18);return;}
   if(e.key==='ArrowLeft')this.cameraGoal.yaw+=.12;if(e.key==='ArrowRight')this.cameraGoal.yaw-=.12;
   if(e.key==='ArrowUp')this.cameraGoal.pitch=clamp(this.cameraGoal.pitch+.1,-1.48,1.48);if(e.key==='ArrowDown')this.cameraGoal.pitch=clamp(this.cameraGoal.pitch-.1,-1.48,1.48);
   this.requestRender();
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.requestRender();});
 }
 zoom(factor){this.fitState=null;this.cameraGoal.distance=clamp(this.cameraGoal.distance*factor,Math.max(.002,this.sceneRadius*.03),this.sceneRadius*40);this.requestRender();}
 setOrbit(on){this.autoOrbit=Boolean(on);this.canvas.dispatchEvent(new CustomEvent('viewerorbit',{detail:this.autoOrbit}));this.requestRender();}
 resize(){
  const dpr=Math.min(window.devicePixelRatio||1,this.renderDprCap),r=this.canvas.getBoundingClientRect(),w=Math.max(2,Math.round(r.width*dpr)),h=Math.max(2,Math.round(r.height*dpr));
  if(this.canvas.width===w&&this.canvas.height===h)return;
  this.canvas.width=w;this.canvas.height=h;
  if(this.fitState&&this.manifest)this.fit({...this.fitState,instant:true});
  this.requestRender();
 }
 eye(cam=this.camera){const c=Math.cos(cam.pitch),s=Math.sin(cam.pitch),cy=Math.cos(cam.yaw),sy=Math.sin(cam.yaw),d=cam.distance;return[cam.target[0]+d*c*cy,cam.target[1]+d*c*sy,cam.target[2]+d*s];}
 viewProj(){
  const eye=this.eye(),near=Math.max(.0001,Math.min(this.sceneRadius*.01,this.camera.distance*.03)),far=Math.max(this.sceneRadius*80,this.camera.distance+this.sceneRadius*8);
  return{eye,vp:m4Mul(perspective(Math.PI/4.5,this.canvas.width/this.canvas.height,near,far),lookAt(eye,this.camera.target,[0,0,1]))};
 }
 async load(manifestUrl){
  const loadId=++this.loadId;this.stopDemo();this.setOrbit(false);this._busy(true);if(this.status)this.status.textContent='Loading model…';
  const mr=await fetchTimed(manifestUrl,20000),mf=await mr.json(),base=new URL(manifestUrl,location.href),du=new URL(mf.data,base);
  du.searchParams.set('v',mf.assetVersion||'premium');const raw=await ungzip(du.href);
  if(loadId!==this.loadId)return this;
  this.disposeModel();this.fitState=null;this.manifest=mf;this.hiddenGroups.clear();this._firstFrame=false;this.ink=[];
  this.values=(mf.controls||[]).map(c=>Number(c.value||0));this.targets=this.values.slice();
  const tri=mf.stats?.triangles||mf.stats?.trianglesUnique||0;this.renderDprCap=tri>2200000?1.35:tri>800000?1.6:2;
  this.meshGPU=this._decodeMeshes(raw,mf);this.buildControls();this.worldMatrices();this.resize();this._fitCamera();this.render();
  if(this.gl.getError()!==this.gl.NO_ERROR)throw new Error('3D renderer initialization failed.');
  if(this.status)this.status.textContent='Ready';window.dispatchEvent(new CustomEvent('hqviewerready',{detail:this}));return this;
 }
 _decodeMeshes(raw,mf){const gl=this.gl,dv=new DataView(raw),out=[];for(const m of mf.meshes){const v=new Float32Array(m.vertexCount*6),bmin=m.bboxMin,bsize=m.bboxSize;let o=m.vertexByteOffset;for(let i=0;i<m.vertexCount;i++,o+=12){const k=i*6;v[k]=bmin[0]+dv.getUint16(o,true)/65535*bsize[0];v[k+1]=bmin[1]+dv.getUint16(o+2,true)/65535*bsize[1];v[k+2]=bmin[2]+dv.getUint16(o+4,true)/65535*bsize[2];v[k+3]=clamp(dv.getInt16(o+6,true)/32767,-1,1);v[k+4]=clamp(dv.getInt16(o+8,true)/32767,-1,1);v[k+5]=clamp(dv.getInt16(o+10,true)/32767,-1,1);}const idx=new Uint32Array(m.indexCount);let io=mf.vertexBytes+m.indexByteOffset;for(let i=0;i<m.indexCount;i++,io+=4)idx[i]=dv.getUint32(io,true);const vb=gl.createBuffer(),ib=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,v,gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);out.push({vb,ib,count:m.indexCount});}return out;}
 disposeModel(){const gl=this.gl;for(const m of this.meshGPU||[]){gl.deleteBuffer(m.vb);gl.deleteBuffer(m.ib);}this.meshGPU=[];}
 _busy(on){if(this.busy)this.busy.classList.toggle('hide',!on);if(this.status)this.status.hidden=!on;}
 bounds(filter=null){
  if(!this.manifest)return null;
  this.worldMatrices();const points=[],lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const d of this.manifest?.drawables||[]){
   if(this.hiddenGroups.has(d.group)||(filter&&!filter(d)))continue;
   const m=this.manifest.meshes[d.mesh];if(!m)continue;
   const M=this.modelMatrix(d),mn=m.bboxMin,mx=mn.map((v,k)=>v+m.bboxSize[k]);
   for(const x of [mn[0],mx[0]])for(const y of [mn[1],mx[1]])for(const z of [mn[2],mx[2]]){
    const p=transformPoint(M,[x,y,z]);points.push(p);for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k]);}
   }
  }
  if(!points.length)return null;
  return{lo,hi,points,center:lo.map((v,k)=>(v+hi[k])*.5),radius:Math.max(.001,norm(sub(hi,lo))*.5)};
 }
 fit(options={}){
  const b=this.bounds(options.filter);if(!b)return;
  const authored=this.manifest.camera||{},yaw=options.yaw??authored.yaw??-.85,pitch=options.pitch??authored.pitch??.32;
  const center=b.center,cam={target:center,distance:1,yaw,pitch},out=normalize(sub(this.eye(cam),center)),right=normalize(cross([0,0,1],out)),up=normalize(cross(out,right));
  const tanY=Math.tan(Math.PI/9),aspect=this.canvas.width/this.canvas.height,tanX=tanY*aspect;
  let distance=0;
  for(const p of b.points){const q=sub(p,center),depth=dot(q,out);distance=Math.max(distance,depth+Math.abs(dot(q,right))/tanX,depth+Math.abs(dot(q,up))/tanY);}
  distance=Math.max(distance*(options.padding??1.18),b.radius*.8);
  this.sceneRadius=this.bounds()?.radius||b.radius;
  this.fitState={...options,yaw,pitch};this.cameraGoal={target:center.slice(),distance,yaw,pitch};
  if(options.instant!==false)this.camera={target:center.slice(),distance,yaw,pitch};
  this.requestRender();
 }
 _fitCamera(){const groups=this.manifest.camera?.fitGroups;this.fit({instant:true,filter:groups?d=>groups.includes(d.group):null});}
 setGroupVisible(group,visible){if(visible)this.hiddenGroups.delete(group);else this.hiddenGroups.add(group);this.requestRender();}
 buildControls(){
  if(!this.controlsRoot)return;this.controlsRoot.replaceChildren();
  const groups=new Map();
  (this.manifest.controls||[]).forEach((c,i)=>{
   let root=this.controlsRoot;
   if(c.group){
    if(!groups.has(c.group)){const details=document.createElement('details'),heading=document.createElement('summary'),content=document.createElement('div');details.className='control-group';details.open=groups.size===0;heading.textContent=c.group;details.append(heading,content);root.append(details);groups.set(c.group,content);}
    root=groups.get(c.group);
   }
   const d=document.createElement('div'),head=document.createElement('div'),label=document.createElement('label'),out=document.createElement('output'),range=document.createElement('input');
   d.className='control';head.className='control-head';range.type='range';range.id=`joint-control-${i}`;label.htmlFor=range.id;label.textContent=c.label;out.htmlFor=range.id;out.value=format(c,this.targets[i]);
   range.min=c.min;range.max=c.max;range.step=c.step||.001;range.value=this.targets[i];range.setAttribute('aria-valuetext',format(c,this.targets[i]));
   head.append(label,out);d.append(head,range);root.append(d);c._range=range;c._out=out;
   range.addEventListener('input',()=>{if(this.demoOn){this.stopDemo();}this.targets[i]=Number(range.value);this.syncControls();this.requestRender();});
  });
 }
 syncControls(){(this.manifest?.controls||[]).forEach((c,i)=>{if(c._range){c._range.value=this.targets[i];c._out.value=format(c,this.targets[i]);c._range.setAttribute('aria-valuetext',format(c,this.targets[i]));}});}
 jointMotion(j){if(!j||j.control<0)return m4Identity();let raw=(this.values[j.control]||0),mapped=raw*(j.scale??1);if(j.curve?.x?.length&&j.curve?.y?.length){const xs=j.curve.x,ys=j.curve.y;if(raw<=xs[0])mapped=ys[0];else if(raw>=xs[xs.length-1])mapped=ys[ys.length-1];else{let lo=0,hi=xs.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(xs[m]<=raw)lo=m;else hi=m}const u=(raw-xs[lo])/(xs[hi]-xs[lo]||1);mapped=ys[lo]+(ys[hi]-ys[lo])*u;}}const q=mapped+(j.offset||0)-(j.ref||0),a=j.axis||[0,0,1];if(j.type==='slide')return m4Translate(a[0]*q,a[1]*q,a[2]*q);const p=j.pos||[0,0,0];return m4Mul(m4Mul(m4Translate(p[0],p[1],p[2]),m4Axis(a,q)),m4Translate(-p[0],-p[1],-p[2]));}
 worldMatrices(values=null){if(values)this.values=values;const ns=this.manifest.nodes||[],W=new Array(ns.length);for(let i=0;i<ns.length;i++){const n=ns[i],p=n.parent>=0?W[n.parent]:m4Identity(),st=new Float32Array(n.static);W[i]=m4Mul(m4Mul(p,st),this.jointMotion(n.joint));}this.world=W;return W;}
 modelMatrix(d){const W=this.world[d.node]||m4Identity();return d.local?m4Mul(W,new Float32Array(d.local)):W;}
 _stepDamping(dt){const camA=1-Math.exp(-dt*6.2),jointA=1-Math.exp(-dt*5.2);this.camera.yaw=lerp(this.camera.yaw,this.cameraGoal.yaw,camA);this.camera.pitch=lerp(this.camera.pitch,this.cameraGoal.pitch,camA);this.camera.distance=lerp(this.camera.distance,this.cameraGoal.distance,camA);this.camera.target=lerp3(this.camera.target,this.cameraGoal.target,camA);let moving=false;for(let i=0;i<this.values.length;i++){const old=this.values[i];this.values[i]=lerp(old,this.targets[i],jointA);if(Math.abs(this.values[i]-this.targets[i])>1e-5)moving=true;}if(Math.abs(this.camera.yaw-this.cameraGoal.yaw)>.0001||Math.abs(this.camera.pitch-this.cameraGoal.pitch)>.0001||Math.abs(this.camera.distance-this.cameraGoal.distance)>.0001||norm(sub(this.camera.target,this.cameraGoal.target))>.00001)moving=true;return moving;}
 render(){
  if(!this.manifest||!this.meshGPU.length)return;
  const gl=this.gl;this.resize();this.worldMatrices();const{eye,vp}=this.viewProj();
  gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(.055,.052,.065,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(this.prog);gl.uniformMatrix4fv(this.loc.vp,false,vp);gl.uniform3fv(this.loc.eye,eye);gl.enableVertexAttribArray(this.loc.pos);gl.enableVertexAttribArray(this.loc.nor);
  const opaque=[],transparent=[];
  for(const d of this.manifest.drawables||[]){
   if(this.hiddenGroups.has(d.group))continue;
   const model=this.modelMatrix(d),m=this.manifest.meshes[d.mesh];if(!m)continue;
   const center=transformPoint(model,m.bboxMin.map((v,k)=>v+m.bboxSize[k]*.5));
   const record={d,model,distance:dot(sub(center,eye),sub(center,eye))};
   ((d.color?.[3]??1)<.995?transparent:opaque).push(record);
  }
  const draw=({d,model})=>{
   const g=this.meshGPU[d.mesh];if(!g)return;
   gl.bindBuffer(gl.ARRAY_BUFFER,g.vb);gl.vertexAttribPointer(this.loc.pos,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(this.loc.nor,3,gl.FLOAT,false,24,12);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,g.ib);
   gl.uniformMatrix4fv(this.loc.model,false,model);gl.uniform4fv(this.loc.color,d.color||[.7,.72,.75,1]);gl.uniform1f(this.loc.metal,d.metalness??.1);gl.uniform1f(this.loc.rough,d.roughness??.55);gl.uniform1f(this.loc.sharp,d.sharpness??this.manifest.shadingSharpness??0);gl.drawElements(gl.TRIANGLES,g.count,gl.UNSIGNED_INT,0);
  };
  gl.disable(gl.BLEND);gl.depthMask(true);opaque.forEach(draw);
  if(transparent.length){transparent.sort((a,b)=>b.distance-a.distance);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);transparent.forEach(draw);gl.depthMask(true);gl.disable(gl.BLEND);}
  this.renderInk(vp);
  if(!this._firstFrame){this._firstFrame=true;this._busy(false);if(this.poster)this.poster.classList.add('hide');}
 }
 renderInk(vp){if(!this.ink.length)return;const gl=this.gl,w=this.manifest?.writing?.inkWidth||.0008,verts=[];for(let i=0;i+5<this.ink.length;i+=6){const ax=this.ink[i],ay=this.ink[i+1],az=this.ink[i+2],bx=this.ink[i+3],by=this.ink[i+4],bz=this.ink[i+5],dx=bx-ax,dy=by-ay,n=Math.hypot(dx,dy)||1,px=-dy/n*w,py=dx/n*w;verts.push(ax+px,ay+py,az,ax-px,ay-py,az,bx+px,by+py,bz,bx+px,by+py,bz,ax-px,ay-py,az,bx-px,by-py,bz);}const arr=new Float32Array(verts);gl.useProgram(this.inkProg);gl.uniformMatrix4fv(this.inkLoc.vp,false,vp);gl.uniform4f(this.inkLoc.color,.01,.012,.016,1);gl.bindBuffer(gl.ARRAY_BUFFER,this.inkBuffer);gl.bufferData(gl.ARRAY_BUFFER,arr,gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(this.inkLoc.pos);gl.vertexAttribPointer(this.inkLoc.pos,3,gl.FLOAT,false,12,0);gl.drawArrays(gl.TRIANGLES,0,arr.length/3);}
 requestRender(){this.needsRender=true;if(!this.animating){this.animating=true;this.lastTime=performance.now();requestAnimationFrame(t=>this._loop(t));}}
 _loop(t){
  if(document.hidden){this.animating=false;return;}
  const dt=Math.min(.05,Math.max(.001,(t-this.lastTime)/1000));this.lastTime=t;
  if(this.demoOn)this._demoFrame(t);
  if(this.autoOrbit){this.cameraGoal.yaw+=dt*.22;this.fitState=null;}
  const damping=this._stepDamping(dt);
  if(this.needsRender||this.demoOn||this.autoOrbit||damping){this.needsRender=false;this.render();}
  if(this.demoOn||this.autoOrbit||damping||this.needsRender)requestAnimationFrame(x=>this._loop(x));else this.animating=false;
 }
 reset(){this.stopDemo();this.setOrbit(false);this.targets=(this.manifest.controls||[]).map(c=>Number(c.value||0));this.syncControls();this.values=this.targets.slice();this.clearInk();this.worldMatrices();this._fitCamera();this.requestRender();}
 startDemo(){if(!this.manifest?.demo?.length)return;this.demoOn=true;this.demoStart=performance.now();this.requestRender();}
 stopDemo(){this.demoOn=false;this.targets=this.values.slice();this.syncControls();}
 _demoFrame(now){const seq=this.manifest.demo,total=seq.reduce((s,k)=>s+k.duration,0);let t=((now-this.demoStart)/1000)%total,prev=(this.manifest.controls||[]).map(c=>Number(c.value||0));for(const k of seq){if(t<=k.duration){let u=clamp(t/k.duration,0,1);u=u*u*u*(u*(u*6-15)+10);this.targets=k.values.map((v,i)=>prev[i]+(v-prev[i])*u);this.syncControls();return;}t-=k.duration;prev=k.values;}}
 clearInk(){this.ink=[];this.requestRender();}addInk(a,b){this.ink.push(a[0],a[1],a[2],b[0],b[1],b[2]);}
 getNodeWorld(index,values=null){if(values){const old=this.values.slice(),W=this.worldMatrices(values).map(x=>new Float32Array(x));this.values=old;this.worldMatrices();return W[index];}this.worldMatrices();return this.world[index];}
}
window.HQViewer=HQViewer;window.HQMath={m4Mul,transformPoint,transformDir,clamp,sub,add,scale,norm,normalize};
window.HQDemo={
 bind(viewer,options={}){
  const bind=(id,fn)=>{const el=document.getElementById(id);if(el)el.addEventListener('click',fn);};
  bind('reset',()=>{if(!viewer.manifest)return;options.onReset?.();viewer.reset();});
  bind('fit',()=>viewer.fit());
  bind('orbit',()=>viewer.setOrbit(!viewer.autoOrbit));
  bind('zoom-in',()=>viewer.zoom(.8));bind('zoom-out',()=>viewer.zoom(1.25));
  bind('full',async()=>{
   try{if(document.fullscreenElement)await document.exitFullscreen();else await document.getElementById('viewport').requestFullscreen();}
   catch{if(viewer.status){viewer.status.hidden=false;viewer.status.textContent='Fullscreen is unavailable in this browser.';}}
  });
  const full=document.getElementById('full');
  if(full&&!document.fullscreenEnabled)full.hidden=true;
  document.addEventListener('fullscreenchange',()=>{if(full)full.textContent=document.fullscreenElement?'Exit fullscreen':'Fullscreen';});
  viewer.canvas.addEventListener('viewerorbit',e=>{const b=document.getElementById('orbit');if(b){b.setAttribute('aria-pressed',String(e.detail));b.textContent=e.detail?'Stop orbit':'Orbit';}});
 },
 error(error){
  console.error(error);document.getElementById('viewer-busy')?.classList.add('hide');
  const banner=document.getElementById('error'),message=document.getElementById('error-message'),status=document.getElementById('status');
  if(message)message.textContent='The model could not load. Check your connection and try again.';
  banner?.classList.add('show');if(status){status.hidden=false;status.textContent='Unable to load model';}
 }
};
})();
