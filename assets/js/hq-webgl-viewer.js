(() => {
'use strict';
const TAU=Math.PI*2;
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function v3(x=0,y=0,z=0){return [x,y,z];}
function sub(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function add(a,b){return [a[0]+b[0],a[1]+b[1],a[2]+b[2]];}
function scale(a,s){return [a[0]*s,a[1]*s,a[2]*s];}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function norm(a){return Math.hypot(a[0],a[1],a[2]);}
function normalize(a){const n=norm(a)||1;return [a[0]/n,a[1]/n,a[2]/n];}
function m4Identity(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}
function m4Mul(a,b){
 const o=new Float32Array(16);
 for(let c=0;c<4;c++)for(let r=0;r<4;r++){
   o[c*4+r]=a[0*4+r]*b[c*4+0]+a[1*4+r]*b[c*4+1]+a[2*4+r]*b[c*4+2]+a[3*4+r]*b[c*4+3];
 }
 return o;
}
function m4Translate(x,y,z){const m=m4Identity();m[12]=x;m[13]=y;m[14]=z;return m;}
function m4Axis(axis,angle){
 let [x,y,z]=normalize(axis),c=Math.cos(angle),s=Math.sin(angle),t=1-c;
 return new Float32Array([
 x*x*t+c, y*x*t+z*s, z*x*t-y*s,0,
 x*y*t-z*s, y*y*t+c, z*y*t+x*s,0,
 x*z*t+y*s, y*z*t-x*s, z*z*t+c,0,
 0,0,0,1]);
}
function transformPoint(M,p){return [M[0]*p[0]+M[4]*p[1]+M[8]*p[2]+M[12],M[1]*p[0]+M[5]*p[1]+M[9]*p[2]+M[13],M[2]*p[0]+M[6]*p[1]+M[10]*p[2]+M[14]];}
function transformDir(M,p){return normalize([M[0]*p[0]+M[4]*p[1]+M[8]*p[2],M[1]*p[0]+M[5]*p[1]+M[9]*p[2],M[2]*p[0]+M[6]*p[1]+M[10]*p[2]]);}
function perspective(fovy,aspect,near,far){const f=1/Math.tan(fovy/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);}
function lookAt(eye,target,up){
 const z=normalize(sub(eye,target)),x=normalize(cross(up,z)),y=cross(z,x);
 return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
}
function compile(gl,type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'Shader compile failed');return s;}
function program(gl,vs,fs){const p=gl.createProgram();gl.attachShader(p,compile(gl,gl.VERTEX_SHADER,vs));gl.attachShader(p,compile(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'Program link failed');return p;}
async function fetchTimed(url,opts={},timeoutMs=45000){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
 try{return await fetch(url,{...opts,signal:ctrl.signal});}finally{clearTimeout(timer);}
}
async function ungzipFetch(url){
 const r=await fetchTimed(url,{cache:'force-cache'},45000);if(!r.ok)throw new Error(`${r.status} ${r.statusText}`);
 if(!('DecompressionStream' in window))throw new Error('This browser does not support gzip decompression. Please use a current browser.');
 const stream=r.body.pipeThrough(new DecompressionStream('gzip'));return await new Response(stream).arrayBuffer();
}
function format(c,v){if(c.display==='deg')return `${(v*180/Math.PI).toFixed(1)}°`;if(c.display==='mm')return `${(v*1000).toFixed(1)} mm`;return v.toFixed(3);}

class HQViewer{
 constructor(cfg){
   this.cfg=cfg;this.canvas=document.getElementById(cfg.canvas||'glcanvas');this.poster=document.getElementById(cfg.poster||'viewer-poster');this.busy=document.getElementById(cfg.busy||'viewer-busy');this.status=document.getElementById(cfg.status||'status');this.controlsRoot=document.getElementById(cfg.controls||'controls');
   this.gl=this.canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
   if(!this.gl)throw new Error('WebGL 2 is unavailable.');
   this.manifest=null;this.values=[];this.world=[];this.modelData=null;this.animating=false;this.demoStart=0;this.demoOn=false;this.needsRender=true;this.ink=[];this.inkBuffer=null;this.inkProgram=null;
   this.camera={target:[0,0,0],distance:1,yaw:-.8,pitch:.3};this.renderDprCap=2;this._setupGL();this._setupOrbit();this._resizeObserver=new ResizeObserver(()=>this.resize());this._resizeObserver.observe(this.canvas.parentElement);this.resize();
 }
 _setupGL(){
   const gl=this.gl;
   const vs=`#version 300 es
   precision highp float;
   layout(location=0) in vec3 aPosQ;layout(location=1) in vec3 aNormalQ;
   uniform mat4 uModel;uniform mat4 uViewProj;uniform vec3 uBBoxMin;uniform vec3 uBBoxSize;
   out vec3 vN;out vec3 vW;
   void main(){vec3 lp=uBBoxMin+aPosQ*uBBoxSize;vec4 w=uModel*vec4(lp,1.0);vW=w.xyz;vN=normalize(mat3(uModel)*aNormalQ);gl_Position=uViewProj*w;}`;
   const fs=`#version 300 es
   precision highp float;in vec3 vN;in vec3 vW;uniform vec4 uColor;uniform vec3 uEye;uniform float uMetal;uniform float uRough;out vec4 outColor;
   void main(){vec3 N=normalize(vN);vec3 V=normalize(uEye-vW);vec3 L1=normalize(vec3(-0.45,-0.6,1.0));vec3 L2=normalize(vec3(0.75,0.25,0.42));
     float d1=max(dot(N,L1),0.0),d2=max(dot(N,L2),0.0);vec3 H=normalize(L1+V);float sp=pow(max(dot(N,H),0.0),mix(64.0,18.0,uRough));
     float rim=pow(1.0-max(dot(N,V),0.0),2.5);vec3 base=uColor.rgb;vec3 c=base*(0.31+0.68*d1+0.20*d2)+vec3(sp*(0.12+0.42*uMetal))+base*rim*0.10;
     c=pow(max(c,vec3(0.0)),vec3(1.0/2.2));outColor=vec4(c,uColor.a);}`;
   this.prog=program(gl,vs,fs);this.u={model:gl.getUniformLocation(this.prog,'uModel'),vp:gl.getUniformLocation(this.prog,'uViewProj'),bmin:gl.getUniformLocation(this.prog,'uBBoxMin'),bsize:gl.getUniformLocation(this.prog,'uBBoxSize'),color:gl.getUniformLocation(this.prog,'uColor'),eye:gl.getUniformLocation(this.prog,'uEye'),metal:gl.getUniformLocation(this.prog,'uMetal'),rough:gl.getUniformLocation(this.prog,'uRough')};
   const lvs=`#version 300 es
   precision highp float;layout(location=0) in vec3 aPos;uniform mat4 uViewProj;void main(){gl_Position=uViewProj*vec4(aPos,1.0);}`;
   const lfs=`#version 300 es
   precision highp float;uniform vec4 uColor;out vec4 outColor;void main(){outColor=uColor;}`;
   this.inkProgram=program(gl,lvs,lfs);this.inkU={vp:gl.getUniformLocation(this.inkProgram,'uViewProj'),color:gl.getUniformLocation(this.inkProgram,'uColor')};this.inkBuffer=gl.createBuffer();
   gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
 }
 _setupOrbit(){
   const c=this.canvas;let active=false,button=0,last=[0,0];
   c.addEventListener('pointerdown',e=>{active=true;button=e.button;last=[e.clientX,e.clientY];c.setPointerCapture(e.pointerId);});
   c.addEventListener('pointerup',()=>active=false);c.addEventListener('pointercancel',()=>active=false);
   c.addEventListener('contextmenu',e=>e.preventDefault());
   c.addEventListener('pointermove',e=>{if(!active)return;const dx=e.clientX-last[0],dy=e.clientY-last[1];last=[e.clientX,e.clientY];
     if(button===0){this.camera.yaw-=dx*.006;this.camera.pitch=clamp(this.camera.pitch+dy*.006,-1.45,1.45);}else{
       const eye=this.eye(),f=normalize(sub(this.camera.target,eye)),right=normalize(cross(f,[0,0,1])),up=normalize(cross(right,f)),s=this.camera.distance*.0015;this.camera.target=add(this.camera.target,add(scale(right,-dx*s),scale(up,dy*s)));
     }this.requestRender();});
   c.addEventListener('wheel',e=>{e.preventDefault();this.camera.distance*=Math.exp(e.deltaY*.001);this.camera.distance=clamp(this.camera.distance,.05,30);this.requestRender();},{passive:false});
 }
 resize(){const dpr=Math.min(window.devicePixelRatio||1,this.renderDprCap||2);const r=this.canvas.getBoundingClientRect(),w=Math.max(2,Math.round(r.width*dpr)),h=Math.max(2,Math.round(r.height*dpr));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.requestRender();}}
 eye(){const c=Math.cos(this.camera.pitch),s=Math.sin(this.camera.pitch),cy=Math.cos(this.camera.yaw),sy=Math.sin(this.camera.yaw),d=this.camera.distance;return [this.camera.target[0]+d*c*cy,this.camera.target[1]+d*c*sy,this.camera.target[2]+d*s];}
 viewProj(){const eye=this.eye(),aspect=this.canvas.width/this.canvas.height;return {eye,vp:m4Mul(perspective(Math.PI/4.2,aspect,.001,100),lookAt(eye,this.camera.target,[0,0,1]))};}
 requestRender(){this.needsRender=true;if(!this.animating){this.animating=true;requestAnimationFrame(t=>this._loop(t));}}
 _loop(t){if(this.demoOn)this._demoFrame(t);if(this.needsRender||this.demoOn){this.needsRender=false;this.render();}if(this.demoOn||this.needsRender)requestAnimationFrame(x=>this._loop(x));else this.animating=false;}
 async load(manifestUrl){
   this._showBusy(true);const mr=await fetchTimed(manifestUrl,{cache:'no-store'},20000);if(!mr.ok)throw new Error(`${mr.status} ${mr.statusText}`);const mf=await mr.json();const base=new URL(manifestUrl,location.href);const du=new URL(mf.data,base);du.searchParams.set('v',mf.assetVersion||String(mf.gzipBytes||'3'));const data=await ungzipFetch(du.href);this.disposeModel();this.manifest=mf;this.values=(mf.controls||[]).map(c=>Number(c.value||0));
   const tri=mf.stats?.triangles||mf.stats?.trianglesUnique||0;this.renderDprCap=tri>1500000?1.25:tri>500000?1.5:2;this.resize();const gl=this.gl;this.vbo=gl.createBuffer();this.ibo=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.vbo);gl.bufferData(gl.ARRAY_BUFFER,new Uint8Array(data,0,mf.vertexBytes),gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint8Array(data,mf.vertexBytes),gl.STATIC_DRAW);
   const cam=mf.camera||{};this.camera.target=(cam.target||[0,0,0]).slice();this.camera.distance=cam.distance||1;this.camera.yaw=cam.yaw??-.8;this.camera.pitch=cam.pitch??.3;this.buildControls();this.worldMatrices();this._showBusy(false);this.requestRender();this.status&&(this.status.textContent=`${(mf.stats?.triangles||mf.stats?.trianglesUnique||0).toLocaleString()} triangles`);window.dispatchEvent(new CustomEvent('hqviewerready',{detail:this}));return this;
 }
 disposeModel(){const gl=this.gl;if(this.vbo)gl.deleteBuffer(this.vbo);if(this.ibo)gl.deleteBuffer(this.ibo);this.vbo=this.ibo=null;}
 _showBusy(on){if(this.busy)this.busy.classList.toggle('hide',!on);if(!on&&this.poster)this.poster.classList.add('hide');}
 buildControls(){if(!this.controlsRoot)return;this.controlsRoot.innerHTML='';(this.manifest.controls||[]).forEach((c,i)=>{const d=document.createElement('div');d.className='control';d.innerHTML=`<div class="control-head"><strong>${c.label}</strong><output>${format(c,this.values[i])}</output></div><input type="range" min="${c.min}" max="${c.max}" step="${c.step||.001}" value="${this.values[i]}">`;this.controlsRoot.appendChild(d);const r=d.querySelector('input'),o=d.querySelector('output');c._range=r;c._out=o;r.oninput=()=>{this.stopDemo();this.values[i]=Number(r.value);o.value=format(c,this.values[i]);this.requestRender();};});}
 syncControls(){(this.manifest.controls||[]).forEach((c,i)=>{if(c._range){c._range.value=this.values[i];c._out.value=format(c,this.values[i]);}});}
 jointMotion(j){if(!j||j.control<0)return m4Identity();const q=(this.values[j.control]||0)*(j.scale??1)+(j.offset||0)-(j.ref||0),a=j.axis||[0,0,1];if(j.type==='slide')return m4Translate(a[0]*q,a[1]*q,a[2]*q);const p=j.pos||[0,0,0];return m4Mul(m4Mul(m4Translate(p[0],p[1],p[2]),m4Axis(a,q)),m4Translate(-p[0],-p[1],-p[2]));}
 worldMatrices(values=null){if(values)this.values=values;const ns=this.manifest.nodes||[],W=new Array(ns.length);for(let i=0;i<ns.length;i++){const n=ns[i],p=n.parent>=0?W[n.parent]:m4Identity(),st=new Float32Array(n.static);W[i]=m4Mul(m4Mul(p,st),this.jointMotion(n.joint));}this.world=W;return W;}
 modelMatrix(d){const W=this.world[d.node]||m4Identity();return d.local?m4Mul(W,new Float32Array(d.local)):W;}
 render(){if(!this.manifest||!this.vbo)return;const gl=this.gl;this.resize();this.worldMatrices();const {eye,vp}=this.viewProj();gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(.035,.043,.055,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.prog);gl.uniformMatrix4fv(this.u.vp,false,vp);gl.uniform3fv(this.u.eye,eye);gl.bindBuffer(gl.ARRAY_BUFFER,this.vbo);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.ibo);
   const opaque=[],trans=[];(this.manifest.drawables||[]).forEach(d=>(d.color?.[3]??1)<.995?trans:opaque).push(d);
   const draw=(d)=>{const m=this.manifest.meshes[d.mesh];if(!m)return;const M=this.modelMatrix(d);gl.uniformMatrix4fv(this.u.model,false,M);gl.uniform3fv(this.u.bmin,m.bboxMin);gl.uniform3fv(this.u.bsize,m.bboxSize);gl.uniform4fv(this.u.color,d.color||[.7,.72,.75,1]);gl.uniform1f(this.u.metal,d.metalness??.1);gl.uniform1f(this.u.rough,d.roughness??.55);gl.enableVertexAttribArray(0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(0,3,gl.UNSIGNED_SHORT,true,12,m.vertexByteOffset);gl.vertexAttribPointer(1,3,gl.SHORT,true,12,m.vertexByteOffset+6);gl.drawElements(gl.TRIANGLES,m.indexCount,gl.UNSIGNED_INT,m.indexByteOffset);};
   gl.disable(gl.BLEND);gl.depthMask(true);opaque.forEach(draw);if(trans.length){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);trans.forEach(draw);gl.depthMask(true);gl.disable(gl.BLEND);}this.renderInk(vp);
 }
 renderInk(vp){if(!this.ink.length)return;const gl=this.gl,w=this.manifest?.writing?.inkWidth||.00075,verts=[];for(let i=0;i+5<this.ink.length;i+=6){const ax=this.ink[i],ay=this.ink[i+1],az=this.ink[i+2],bx=this.ink[i+3],by=this.ink[i+4],bz=this.ink[i+5],dx=bx-ax,dy=by-ay,n=Math.hypot(dx,dy)||1,px=-dy/n*w,py=dx/n*w;verts.push(ax+px,ay+py,az, ax-px,ay-py,az, bx+px,by+py,bz, bx+px,by+py,bz, ax-px,ay-py,az, bx-px,by-py,bz);}const arr=new Float32Array(verts);gl.useProgram(this.inkProgram);gl.uniformMatrix4fv(this.inkU.vp,false,vp);gl.uniform4f(this.inkU.color,.018,.020,.024,1);gl.bindBuffer(gl.ARRAY_BUFFER,this.inkBuffer);gl.bufferData(gl.ARRAY_BUFFER,arr,gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);gl.drawArrays(gl.TRIANGLES,0,arr.length/3);}
 clearInk(){this.ink=[];this.requestRender();}
 addInk(a,b){this.ink.push(a[0],a[1],a[2],b[0],b[1],b[2]);}
 reset(){this.stopDemo();this.values=(this.manifest.controls||[]).map(c=>Number(c.value||0));this.syncControls();const cam=this.manifest.camera||{};this.camera.target=(cam.target||[0,0,0]).slice();this.camera.distance=cam.distance||1;this.camera.yaw=cam.yaw??-.8;this.camera.pitch=cam.pitch??.3;this.clearInk();this.requestRender();}
 startDemo(){if(!this.manifest.demo?.length)return;this.demoOn=true;this.demoStart=performance.now();this.requestRender();}
 stopDemo(){this.demoOn=false;}
 _demoFrame(now){const seq=this.manifest.demo,total=seq.reduce((s,k)=>s+k.duration,0);let t=((now-this.demoStart)/1000)%total,prev=(this.manifest.controls||[]).map(c=>Number(c.value||0));for(const k of seq){if(t<=k.duration){let u=clamp(t/k.duration,0,1);u=u*u*(3-2*u);this.values=k.values.map((v,i)=>prev[i]+(v-prev[i])*u);this.syncControls();return;}t-=k.duration;prev=k.values;} }
 getNodeWorld(index,values=null){if(values){const old=this.values;this.values=values;const W=this.worldMatrices().map(x=>new Float32Array(x));this.values=old;return W[index];}this.worldMatrices();return this.world[index];}
}
window.HQViewer=HQViewer;window.HQMath={m4Mul,transformPoint,transformDir,clamp,sub,add,scale,norm,normalize};
})();
