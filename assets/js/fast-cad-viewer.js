/* Local pre-tessellated CAD viewer. STEP conversion is done once at build time, not in the visitor's browser. */
(() => {
  'use strict';
  const plot=document.getElementById('plot'),status=document.getElementById('status'),loading=document.getElementById('loading'),loadText=document.getElementById('load-text');
  const back=document.getElementById('back'),reset=document.getElementById('reset'),full=document.getElementById('full');
  let current='models/full-assembly.json';
  const eye={x:1.45,y:-1.75,z:1.2};
  function layout(){return {margin:{l:0,r:0,t:0,b:0},paper_bgcolor:'#0d0f13',plot_bgcolor:'#0d0f13',showlegend:false,uirevision:'cad-camera',scene:{bgcolor:'#0d0f13',aspectmode:'data',xaxis:{visible:false},yaxis:{visible:false},zaxis:{visible:false},camera:{eye,up:{x:0,y:0,z:1}},dragmode:'orbit'}};}
  async function fetchJSONProgress(url,timeoutMs=30000){
    const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeoutMs);
    try{const r=await fetch(url,{signal:c.signal,cache:'force-cache'});if(!r.ok)throw new Error(`${r.status} ${r.statusText}`);const total=Number(r.headers.get('content-length'))||0;
      if(!r.body)return await r.json();const reader=r.body.getReader();let got=0;const chunks=[];while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);got+=value.length;loadText.textContent=total?`Loading CAD mesh… ${Math.min(100,Math.round(got/total*100))}%`:`Loading CAD mesh… ${(got/1048576).toFixed(1)} MB`;}
      const all=new Uint8Array(got);let p=0;for(const x of chunks){all.set(x,p);p+=x.length;}return JSON.parse(new TextDecoder().decode(all));
    }finally{clearTimeout(timer);}
  }
  async function load(url,label){
    try{loading.classList.remove('hide');loadText.textContent=`Loading ${label}…`;const d=await fetchJSONProgress(url);const V=d.v,F=d.f;
      const trace={type:'mesh3d',x:V.map(v=>v[0]),y:V.map(v=>v[1]),z:V.map(v=>v[2]),i:F.map(t=>t[0]),j:F.map(t=>t[1]),k:F.map(t=>t[2]),color:d.color||'#aeb7c4',hoverinfo:'skip',flatshading:false,lighting:{ambient:.55,diffuse:.8,specular:.22,roughness:.7,fresnel:.08},lightposition:{x:2,y:-3,z:5}};
      await Plotly.react(plot,[trace],layout(),{responsive:true,displaylogo:false,scrollZoom:true,modeBarButtonsToRemove:['toImage','select2d','lasso2d','autoScale2d','hoverClosest3d','toggleSpikelines']});status.textContent=`Interactive CAD · ${label} · ${d.stats?.faces?.toLocaleString?.()||''} triangles · local`;loading.classList.add('hide');current=url;
    }catch(e){console.error(e);loadText.innerHTML=`<div class="error"><strong>CAD viewer could not load.</strong>\n${String(e)}\n\nThe v0.2 viewer is local and does not need OpenCascade or a CDN.</div>`;status.textContent='Viewer error';}
  }
  back.onclick=()=>history.back();reset.onclick=()=>Plotly.relayout(plot,{'scene.camera':{eye,up:{x:0,y:0,z:1}}});full.onclick=()=>document.documentElement.requestFullscreen?.();
  document.querySelectorAll('[data-model]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-model]').forEach(x=>x.classList.remove('active'));b.classList.add('active');load(b.dataset.model,b.dataset.label||b.textContent.trim());});
  if(!window.Plotly){loadText.innerHTML='<div class="error"><strong>Local 3D runtime missing.</strong></div>';return;}load(current,'Full assembly');
})();
