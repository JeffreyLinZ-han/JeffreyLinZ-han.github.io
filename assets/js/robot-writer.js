(() => {
'use strict';
const M=window.HQMath;
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function lerp(a,b,t){return a.map((x,i)=>x+(b[i]-x)*t);}
function smooth(t){return t*t*(3-2*t);}
function solve3(A,b){
 const m=[A[0].slice().concat(b[0]),A[1].slice().concat(b[1]),A[2].slice().concat(b[2])];
 for(let c=0;c<3;c++){let p=c;for(let r=c+1;r<3;r++)if(Math.abs(m[r][c])>Math.abs(m[p][c]))p=r;[m[c],m[p]]=[m[p],m[c]];let d=m[c][c];if(Math.abs(d)<1e-12)return [0,0,0];for(let j=c;j<4;j++)m[c][j]/=d;for(let r=0;r<3;r++)if(r!==c){let f=m[r][c];for(let j=c;j<4;j++)m[r][j]-=f*m[c][j];}}
 return [m[0][3],m[1][3],m[2][3]];
}
function dist(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);}
class RobotWriterWeb{
 constructor(viewer){this.v=viewer;this.cfg=viewer.manifest.writing;this.cancelToken=0;this.running=false;this.writeBtn=document.getElementById('write');this.stopBtn=document.getElementById('stop-write');this.clearBtn=document.getElementById('clear-ink');this.input=document.getElementById('write-text');this.msg=document.getElementById('write-status');this.bind();}
 bind(){if(this.writeBtn)this.writeBtn.onclick=()=>this.start(this.input?.value||'HELLO WORLD');if(this.stopBtn)this.stopBtn.onclick=()=>this.stop();if(this.clearBtn)this.clearBtn.onclick=()=>this.v.clearInk();}
 stop(){this.cancelToken++;this.running=false;if(this.msg)this.msg.textContent='Ready';if(this.writeBtn)this.writeBtn.disabled=false;}
 tipPose(q5){const vals=this.v.values.slice();for(let i=0;i<5;i++)vals[i]=q5[i];const old=this.v.values;this.v.values=vals;const W=this.v.worldMatrices();this.v.values=old;const s=this.cfg.penSite, NM=W[s.body], LM=new Float32Array(s.local), SM=M.m4Mul(NM,LM);return {p:[SM[12],SM[13],SM[14]],axis:M.transformDir(SM,[0,0,1])};}
 jacobian(q,p0){const eps=1e-4,J=[[],[],[]];for(let k=0;k<5;k++){const qq=q.slice();qq[k]+=eps;const p=this.tipPose(qq).p;for(let r=0;r<3;r++)J[r][k]=(p[r]-p0[r])/eps;}return J;}
 ik(target,seed){const C=this.cfg,pref=C.qPreferred,safeLo=C.safeLo,safeHi=C.safeHi;const starts=[seed.slice(),pref.slice(),[0,.40,-1.30,.05,.65],[0,.15,-1.65,.25,.85],[.35,.30,-1.45,.10,.75],[-.35,.30,-1.45,.10,.75]];let bestQ=seed.slice(),best=1e9;
   for(let si=0;si<starts.length;si++){let q=starts[si].slice(),maxIter=si===0?70:100;for(let it=0;it<maxIter;it++){const p=this.tipPose(q).p,e=[target[0]-p[0],target[1]-p[1],target[2]-p[2]],er=Math.hypot(...e);if(er<best){best=er;bestQ=q.slice();}if(er<.00065)return q;const J=this.jacobian(q,p),lam=.006,A=[[lam*lam,0,0],[0,lam*lam,0],[0,0,lam*lam]];for(let r=0;r<3;r++)for(let c=0;c<3;c++)for(let k=0;k<5;k++)A[r][c]+=J[r][k]*J[c][k];const y=solve3(A,e),dq=new Array(5).fill(0);for(let k=0;k<5;k++)for(let r=0;r<3;r++)dq[k]+=J[r][k]*y[r];
       const post=pref.map((x,k)=>x-q[k]),jp=[0,0,0];for(let r=0;r<3;r++)for(let k=0;k<5;k++)jp[r]+=J[r][k]*post[k];const yp=solve3(A,jp);for(let k=0;k<5;k++){let corr=0;for(let r=0;r<3;r++)corr+=J[r][k]*yp[r];dq[k]+=.022*(post[k]-corr);}let dn=Math.hypot(...dq);if(dn>.07)for(let k=0;k<5;k++)dq[k]*=.07/dn;for(let k=0;k<5;k++)q[k]=M.clamp(q[k]+dq[k],safeLo[k],safeHi[k]);}}
   if(best<.0015)return bestQ;throw new Error(`IK target outside web writing workspace (${(best*1000).toFixed(1)} mm residual)`);
 }
 chooseHeight(text){const C=this.cfg,lines=text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n'),longest=Math.max(1,...lines.map(x=>x.length)),lc=Math.max(1,lines.length),uw=2*C.drawHalfWidth-2*C.sideMargin,uh=2*C.drawHalfHeight-2*C.verticalMargin;return Math.max(.006,Math.min(C.maxTextHeight,uw/(longest*C.charWidthRatio),uh/(1+(lc-1)*C.linePitchRatio)));}
 layout(text){const C=this.cfg,h=this.chooseHeight(text),cw=h*C.charWidthRatio,pitch=h*C.linePitchRatio,F=C.font;let row=0,col=0,jobs=[];for(const ch0 of text.replace(/\r\n/g,'\n').replace(/\r/g,'\n')){if(ch0==='\n'){row++;col=0;continue;}const ch=ch0.toUpperCase();if(ch!==' '&&F[ch]){for(const stroke of F[ch])jobs.push(stroke.map(([x,y])=>[col*cw+x*cw,row*pitch+(1-y)*h]));}col++;}
   if(!jobs.length)return [];const pts=jobs.flat(),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys),ox=C.drawHalfWidth-(minx+maxx)/2,oy=C.drawHalfHeight-(miny+maxy)/2;return jobs.map(s=>s.map(([x,y])=>[x+ox,y+oy]));}
 worldTarget(x,y,down=true){const C=this.cfg,center=C.boardCenter,tl=[center[0]-C.drawHalfWidth,center[1]+C.drawHalfHeight,center[2]+C.surfaceOffset],z=C.contactClearance+(down?0:C.lift);return [tl[0]+x,tl[1]-y,tl[2]+z];}
 interpolate(a,b,spacing=.003){const d=dist(a,b),n=Math.max(2,Math.ceil(d/spacing)+1),out=[];for(let i=0;i<n;i++){let t=i/(n-1);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]);}return out;}
 async animateQ(q0,q1,dur,token){const start=performance.now();return new Promise(resolve=>{const step=(now)=>{if(token!==this.cancelToken)return resolve(false);let u=M.clamp((now-start)/(dur*1000),0,1),s=smooth(u);for(let i=0;i<5;i++){const q=q0[i]+(q1[i]-q0[i])*s;this.v.values[i]=q;this.v.targets[i]=q;}this.v.syncControls();this.v.requestRender();if(u<1)requestAnimationFrame(step);else resolve(true);};requestAnimationFrame(step);});}
 async start(text){text=(text||'').trim();if(!text||this.running)return;const strokes=this.layout(text);if(!strokes.length){this.msg.textContent='Use A–Z, 0–9, and supported punctuation.';return;}this.running=true;const token=++this.cancelToken;this.writeBtn.disabled=true;this.v.stopDemo();this.v.clearInk();if(this.msg)this.msg.textContent='Writing';let q=this.v.values.slice(0,5),plannedCount=0;
   try{
     for(const stroke of strokes){if(token!==this.cancelToken)break;const down=stroke.map(([x,y])=>this.worldTarget(x,y,true)),above=this.worldTarget(stroke[0][0],stroke[0][1],false);let phases=[{p:above,draw:false}];for(const p of this.interpolate(above,down[0]).slice(1))phases.push({p,draw:false});phases.push({p:down[0],draw:true});for(let i=0;i<down.length-1;i++)for(const p of this.interpolate(down[i],down[i+1]).slice(1))phases.push({p,draw:true});const lift=this.worldTarget(stroke[stroke.length-1][0],stroke[stroke.length-1][1],false);for(const p of this.interpolate(down[down.length-1],lift).slice(1))phases.push({p,draw:false});let prevInk=null;
       for(const ph of phases){if(token!==this.cancelToken)break;const qn=this.ik(ph.p,q),tip0=this.tipPose(q).p,d=dist(tip0,ph.p),dur=M.clamp(d/(ph.draw?.10:.16),.045,.18);const ok=await this.animateQ(q,qn,dur,token);if(!ok)break;if(ph.draw){const z=this.cfg.boardCenter[2]+this.cfg.surfaceOffset+.0007,ink=[ph.p[0],ph.p[1],z];if(prevInk)this.v.addInk(prevInk,ink);prevInk=ink;}else prevInk=null;q=qn;plannedCount++;if(plannedCount%12===0)await sleep(0);}
     }
     if(token===this.cancelToken&&this.msg)this.msg.textContent='Finished';
   }catch(e){console.error(e);if(this.msg)this.msg.textContent='Writing path could not be solved';}
   finally{if(token===this.cancelToken){this.running=false;this.writeBtn.disabled=false;this.v.requestRender();}}
 }
}
window.RobotWriterWeb=RobotWriterWeb;
})();
