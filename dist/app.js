const STORAGE={solved:"butterfly-cpp-solved",judgeUrl:"butterfly-judge-url",token:"butterfly-judge-token"};
const state={unit:1,current:null,solved:new Set(readJson(STORAGE.solved,[])),running:false};
const $=selector=>document.querySelector(selector);
const nav=$("#unit-nav"),grid=$("#problem-grid"),library=$("#library-view"),problemView=$("#problem-view");

function readJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback))}catch{return fallback}}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function normalize(value){return String(value??"").replace(/\r\n/g,"\n").trimEnd()}

function renderNav(){
  nav.replaceChildren(...COURSE_UNITS.map(unit=>{
    const button=document.createElement("button");
    const count=COURSE_PROBLEMS.filter(problem=>problem.unit===unit.id).length;
    button.className=`unit-button${state.unit===unit.id?" active":""}`;
    button.innerHTML=`<span class="unit-number">${String(unit.id).padStart(2,"0")}</span><small>${unit.title}</small><span class="unit-count">${count}</span>`;
    button.onclick=()=>{state.unit=unit.id;showLibrary();renderNav();renderLibrary()};
    return button;
  }));
}

function renderLibrary(){
  const unit=COURSE_UNITS.find(item=>item.id===state.unit);
  const items=COURSE_PROBLEMS.filter(problem=>problem.unit===state.unit);
  $(".library-heading h1").textContent=`Unit ${state.unit}: ${unit.title}`;
  $(".library-heading>div>p:last-child").textContent=`${items.length} original C++ exercises for ${unit.title.toLowerCase()}. Solve them in order or jump straight to the sharp edge.`;
  grid.replaceChildren(...items.map(problem=>{
    const button=document.createElement("button");
    button.className=`problem-card${state.solved.has(problem.id)?" solved":""}`;
    button.innerHTML=`<span class="problem-index">${problem.id.split("-")[1]}</span><span><h2>${escapeHtml(problem.title)}</h2><p>${escapeHtml(problem.summary)}</p><span class="card-meta"><span>${problem.difficulty}</span><span>·</span><span>${problem.tests.length} tests</span>${state.solved.has(problem.id)?"<span>· ✓ Solved</span>":""}</span></span>`;
    button.onclick=()=>openProblem(problem,true);
    return button;
  }));
  updateProgress();
}

function showLibrary(){state.current=null;problemView.hidden=true;library.hidden=false;$("#main-content").focus()}
function openProblem(problem,updateHistory=false){
  state.current=problem;state.unit=problem.unit;renderNav();library.hidden=true;problemView.hidden=false;
  $("#problem-unit").textContent=`Unit ${problem.unit}`;$("#problem-difficulty").textContent=problem.difficulty;
  $("#problem-title").textContent=problem.title;$("#problem-statement").textContent=problem.statement;
  $("#problem-input").textContent=problem.input;$("#problem-output").textContent=problem.output;
  $("#sample-input").textContent=problem.sampleInput;$("#sample-output").textContent=problem.sampleOutput;
  $("#problem-hint").textContent=problem.hint;$("#code-editor").value=localStorage.getItem(`code-${problem.id}`)||problem.starter;
  $("#custom-input").value=problem.sampleInput;renderEmptyResult();
  if(updateHistory)history.pushState({problem:problem.id},"",`?problem=${problem.id}`);
  $("#main-content").focus();
}
function updateProgress(){const count=state.solved.size;$("#solved-count").textContent=count;$("#progress-label").textContent=`${count} / ${COURSE_PROBLEMS.length} solved`;$("#progress-bar").style.width=`${count/COURSE_PROBLEMS.length*100}%`}
function renderEmptyResult(){$("#result-panel").innerHTML='<div class="empty-result"><span>&gt;_</span><p>Run your code or submit it against the tests.</p></div>'}

function encodeBase64(text){const bytes=new TextEncoder().encode(text);let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary)}
function decodeBase64(text){if(!text)return"";const binary=atob(text);const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));return new TextDecoder().decode(bytes)}
function judgeConfig(){return{url:(localStorage.getItem(STORAGE.judgeUrl)||"https://ce.judge0.com").replace(/\/+$/,""),token:localStorage.getItem(STORAGE.token)||""}}
function judgeHeaders(){const config=judgeConfig();const headers={"Content-Type":"application/json"};if(config.token)headers["X-Auth-Token"]=config.token;return headers}
async function responseJson(response){const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||data.message||`Judge service returned HTTP ${response.status}`);return data}
async function execute(code,stdin){
  const {url}=judgeConfig();
  const created=await responseJson(await fetch(`${url}/submissions?base64_encoded=true&wait=false`,{method:"POST",headers:judgeHeaders(),body:JSON.stringify({language_id:54,source_code:encodeBase64(code),stdin:encodeBase64(stdin),cpu_time_limit:2,wall_time_limit:5})}));
  if(!created.token)throw new Error("Judge service did not return a submission token.");
  for(let attempt=0;attempt<30;attempt+=1){
    await new Promise(resolve=>setTimeout(resolve,attempt<2?650:1000));
    const result=await responseJson(await fetch(`${url}/submissions/${created.token}?base64_encoded=true&fields=stdout,stderr,compile_output,message,time,memory,status`,{headers:judgeHeaders()}));
    if(result.status?.id>2)return{...result,stdout:decodeBase64(result.stdout),stderr:decodeBase64(result.stderr),compile_output:decodeBase64(result.compile_output),message:decodeBase64(result.message)};
  }
  throw new Error("The judge did not finish within 30 seconds.");
}
function verdict(result,expected){
  if(result.status?.id===6)return{status:"CE",detail:result.compile_output||result.stderr||"Compilation failed."};
  if(result.status?.id===5)return{status:"TLE",detail:result.message||"Time limit exceeded."};
  if(result.status?.id!==3)return{status:"RE",detail:result.stderr||result.message||result.status?.description||"Runtime failed."};
  if(expected!==undefined&&normalize(result.stdout)!==normalize(expected))return{status:"WA",detail:`Expected:\n${normalize(expected)}\n\nReceived:\n${normalize(result.stdout)}`};
  return{status:"AC",detail:result.stdout||"(no output)"};
}
function setBusy(busy,label="Running…"){state.running=busy;for(const button of [$("#run-button"),$("#submit-button")])button.disabled=busy;if(busy)$("#result-panel").innerHTML=`<div class="empty-result"><span>•••</span><p>${escapeHtml(label)}</p></div>`}
function renderRunResult(result,v){const ok=v.status==="AC";$("#result-panel").innerHTML=`<div class="result-head"><strong class="${ok?"ac":"fail"}">${v.status} · ${escapeHtml(result.status?.description||"")}</strong><span>${escapeHtml(result.time||"0")} s · ${escapeHtml(result.memory||"0")} KB</span></div><pre>${escapeHtml(v.detail)}</pre>`}
async function runCustom(){if(state.running||!state.current)return;setBusy(true,"Compiling C++17 and running your input…");try{const result=await execute($("#code-editor").value,$("#custom-input").value);renderRunResult(result,verdict(result))}catch(error){renderServiceError(error)}finally{setBusy(false)}}
async function submitSolution(){
  if(state.running||!state.current)return;const problem=state.current;const rows=[];setBusy(true,"Testing your solution…");
  try{
    for(let index=0;index<problem.tests.length;index+=1){
      $("#result-panel").innerHTML=`<div class="empty-result"><span>${index+1}/${problem.tests.length}</span><p>Compiling and running test ${index+1}…</p></div>`;
      const result=await execute($("#code-editor").value,problem.tests[index].input);const judged=verdict(result,problem.tests[index].output);rows.push({index:index+1,...judged,time:result.time});if(judged.status!=="AC")break;
    }
    const accepted=rows.length===problem.tests.length&&rows.every(row=>row.status==="AC");
    if(accepted){state.solved.add(problem.id);localStorage.setItem(STORAGE.solved,JSON.stringify([...state.solved]));updateProgress()}
    const firstFailure=rows.find(row=>row.status!=="AC");
    $("#result-panel").innerHTML=`<div class="result-head"><strong class="${accepted?"ac":"fail"}">${accepted?"Accepted":"Not accepted"}</strong><span>${rows.filter(row=>row.status==="AC").length} / ${problem.tests.length} tests</span></div>${rows.map(row=>`<div class="test-row"><span>Test ${row.index}</span><span class="${row.status==="AC"?"ac":"fail"}">${row.status} · ${escapeHtml(row.time||"0")} s</span></div>`).join("")}${firstFailure?`<pre>${escapeHtml(firstFailure.detail)}</pre>`:""}`;
  }catch(error){renderServiceError(error)}finally{setBusy(false)}
}
function renderServiceError(error){$("#result-panel").innerHTML=`<div class="result-head"><strong class="fail">Judge unavailable</strong></div><pre>${escapeHtml(error.message)}\n\nCheck Compiler settings. For a classroom, use your own Judge0 instance instead of relying on a public demo server.</pre>`}

function openSettings(){const config=judgeConfig();$("#judge-url").value=config.url;$("#judge-token").value=config.token;$("#settings-dialog").showModal()}
function saveSettings(event){const url=$("#judge-url").value.trim().replace(/\/+$/,"");if(!/^https?:\/\//i.test(url)){event.preventDefault();alert("Enter a complete http:// or https:// URL.");return}localStorage.setItem(STORAGE.judgeUrl,url);localStorage.setItem(STORAGE.token,$("#judge-token").value.trim())}
function route(){const id=new URLSearchParams(location.search).get("problem");const problem=COURSE_PROBLEMS.find(item=>item.id===id);if(problem)openProblem(problem,false);else{showLibrary();renderLibrary()}}
function registerWebMcp(){
  const context=document.modelContext;if(!context?.registerTool)return;
  const tools=[
    {name:"list_cpp_problems",title:"List C++ problems",description:"List exercises and whether each is solved on this device.",inputSchema:{type:"object",properties:{unit:{type:"integer",minimum:1,maximum:11}},additionalProperties:false},annotations:{readOnlyHint:true},execute:({unit}={})=>COURSE_PROBLEMS.filter(p=>!unit||p.unit===unit).map(p=>({id:p.id,title:p.title,unit:p.unit,solved:state.solved.has(p.id)}))},
    {name:"open_cpp_problem",title:"Open C++ problem",description:"Open a problem by its stable ID in the visible editor.",inputSchema:{type:"object",properties:{id:{type:"string"}},required:["id"],additionalProperties:false},annotations:{readOnlyHint:false},execute:({id})=>{const p=COURSE_PROBLEMS.find(x=>x.id===id);if(!p)throw new Error("Unknown problem ID");openProblem(p,true);return{id:p.id,title:p.title}}},
    {name:"set_cpp_code",title:"Set C++ code",description:"Replace the editor contents for the current problem and save it on this device.",inputSchema:{type:"object",properties:{code:{type:"string",minLength:1}},required:["code"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:({code})=>{if(!state.current)throw new Error("Open a problem first");$("#code-editor").value=code;localStorage.setItem(`code-${state.current.id}`,code);return{problem_id:state.current.id,saved:true}}}
  ];
  for(const tool of tools){try{void Promise.resolve(context.registerTool(tool)).catch(()=>{})}catch{}}
}

$("#back-button").onclick=()=>{showLibrary();history.pushState({},"",location.pathname);renderLibrary()};
$("#home-button").onclick=()=>{state.unit=1;showLibrary();history.pushState({},"",location.pathname);renderNav();renderLibrary()};
$("#settings-button").onclick=openSettings;$("#save-settings").onclick=saveSettings;$("#run-button").onclick=runCustom;$("#submit-button").onclick=submitSolution;
$("#code-editor").addEventListener("input",event=>{if(!state.current)return;localStorage.setItem(`code-${state.current.id}`,event.target.value);$("#save-state").textContent="Saved locally"});
$("#code-editor").addEventListener("keydown",event=>{if(event.key!=="Tab")return;event.preventDefault();const editor=event.target,start=editor.selectionStart,end=editor.selectionEnd;editor.setRangeText("    ",start,end,"end")});
window.addEventListener("popstate",route);renderNav();renderLibrary();route();registerWebMcp();
