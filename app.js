import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';
import {extractPageText,cleanPages,buildUnits,chunkUnits,buildAudit,buildBlockEnvelope} from './pdf-tools.js';
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
const $=id=>document.getElementById(id),DB_NAME='resumos-pro-central',DB_VERSION=1,defaults={min:15000,target:20000,max:28000,overlap:2000};
const state={db:null,projects:[],documents:[],activeProject:null,activeDocument:null,file:null,pages:[],cleanedPages:[],units:[],blocks:[],audit:null,totalPages:0,selectedPage:null,currentBlock:0,completed:new Set(),sourceToken:'',documentId:null};
const E={brandBtn:$('brandBtn'),dashboardView:$('dashboardView'),projectView:$('projectView'),newProjectBtn:$('newProjectBtn'),emptyNewProjectBtn:$('emptyNewProjectBtn'),dashboardStats:$('dashboardStats'),projectSearch:$('projectSearch'),projectFilter:$('projectFilter'),projectGrid:$('projectGrid'),emptyProjects:$('emptyProjects'),exportWorkspaceBtn:$('exportWorkspaceBtn'),importWorkspaceInput:$('importWorkspaceInput'),projectDialog:$('projectDialog'),projectForm:$('projectForm'),editingProjectId:$('editingProjectId'),projectDialogEyebrow:$('projectDialogEyebrow'),projectDialogTitle:$('projectDialogTitle'),projectNameInput:$('projectNameInput'),projectSubjectInput:$('projectSubjectInput'),projectExamInput:$('projectExamInput'),projectStatusInput:$('projectStatusInput'),projectNoteInput:$('projectNoteInput'),cancelProjectDialog:$('cancelProjectDialog'),backDashboardBtn:$('backDashboardBtn'),projectCrumb:$('projectCrumb'),projectStatusEyebrow:$('projectStatusEyebrow'),activeProjectTitle:$('activeProjectTitle'),activeProjectMeta:$('activeProjectMeta'),projectStats:$('projectStats'),projectProgressText:$('projectProgressText'),editProjectBtn:$('editProjectBtn'),addPdfBtn:$('addPdfBtn'),emptyAddPdfBtn:$('emptyAddPdfBtn'),emptyDocuments:$('emptyDocuments'),documentList:$('documentList'),extractorArea:$('extractorArea'),cancelExtractorBtn:$('cancelExtractorBtn'),pdfInput:$('pdfInput'),dropZone:$('dropZone'),fileMeta:$('fileMeta'),processBtn:$('processBtn'),progressWrap:$('progressWrap'),progressBar:$('progressBar'),progressText:$('progressText'),minChars:$('minChars'),targetChars:$('targetChars'),maxChars:$('maxChars'),overlapChars:$('overlapChars'),preferHeadings:$('preferHeadings'),preferPageBreaks:$('preferPageBreaks'),removeRepeated:$('removeRepeated'),resetSettings:$('resetSettings'),resultSection:$('resultSection'),documentName:$('documentName'),documentDetails:$('documentDetails'),statsGrid:$('statsGrid'),scanWarning:$('scanWarning'),integrityBadge:$('integrityBadge'),auditGrid:$('auditGrid'),coverageSummary:$('coverageSummary'),coverageMap:$('coverageMap'),pageInspector:$('pageInspector'),pageInspectorTitle:$('pageInspectorTitle'),pageInspectorMeta:$('pageInspectorMeta'),pageBlocks:$('pageBlocks'),pagePreview:$('pagePreview'),copyPageBtn:$('copyPageBtn'),blockCountTitle:$('blockCountTitle'),blockList:$('blockList'),currentBlockKicker:$('currentBlockKicker'),currentBlockTitle:$('currentBlockTitle'),currentBlockMeta:$('currentBlockMeta'),blockText:$('blockText'),doneCheckbox:$('doneCheckbox'),prevBtn:$('prevBtn'),nextBtn:$('nextBtn'),copyBlockBtn:$('copyBlockBtn'),copyFullBtn:$('copyFullBtn'),downloadFullBtn:$('downloadFullBtn'),downloadBlockBtn:$('downloadBlockBtn'),copyFeedback:$('copyFeedback')};
boot();async function boot(){state.db=await openDB();try{await navigator.storage?.persist?.()}catch{}bindEvents();await showDashboard()}
function bindEvents(){E.brandBtn.onclick=showDashboard;E.backDashboardBtn.onclick=showDashboard;E.newProjectBtn.onclick=()=>openProjectDialog();E.emptyNewProjectBtn.onclick=()=>openProjectDialog();E.cancelProjectDialog.onclick=()=>E.projectDialog.close();E.projectForm.addEventListener('submit',saveProjectFromDialog);E.projectSearch.addEventListener('input',renderProjectGrid);E.projectFilter.addEventListener('change',renderProjectGrid);E.editProjectBtn.onclick=()=>openProjectDialog(state.activeProject);E.addPdfBtn.onclick=openExtractor;E.emptyAddPdfBtn.onclick=openExtractor;E.cancelExtractorBtn.onclick=closeExtractor;E.exportWorkspaceBtn.onclick=exportWorkspace;E.importWorkspaceInput.onchange=e=>importWorkspace(e.target.files?.[0]);E.resetSettings.onclick=()=>{E.minChars.value=defaults.min;E.targetChars.value=defaults.target;E.maxChars.value=defaults.max;E.overlapChars.value=defaults.overlap;E.preferHeadings.checked=true;E.preferPageBreaks.checked=true;E.removeRepeated.checked=true};E.pdfInput.onchange=e=>setFile(e.target.files?.[0]);['dragenter','dragover'].forEach(n=>E.dropZone.addEventListener(n,e=>{e.preventDefault();E.dropZone.classList.add('dragging')}));['dragleave','drop'].forEach(n=>E.dropZone.addEventListener(n,e=>{e.preventDefault();E.dropZone.classList.remove('dragging')}));E.dropZone.addEventListener('drop',e=>setFile([...e.dataTransfer.files].find(f=>f.type==='application/pdf'||f.name.toLowerCase().endsWith('.pdf'))));E.processBtn.onclick=processPDF;E.prevBtn.onclick=()=>showBlock(state.currentBlock-1);E.nextBtn.onclick=()=>showBlock(state.currentBlock+1);E.doneCheckbox.onchange=toggleCurrentBlockDone;E.copyBlockBtn.onclick=async()=>{const b=state.blocks[state.currentBlock];if(b){await copyText(b.content);flashCopy('Bloco copiado.')}};E.copyFullBtn.onclick=async()=>{await copyText(buildFullCleanText());flashCopy('Texto completo copiado.')};E.copyPageBtn.onclick=async()=>{const p=state.cleanedPages.find(x=>x.page===state.selectedPage);if(p){await copyText(p.text);flashCopy(`Página ${p.page} copiada.`)}};E.downloadFullBtn.onclick=()=>downloadText(`${safeName(currentDocumentLabel())}_TEXTO_LIMPO.txt`,buildFullCleanText());E.downloadBlockBtn.onclick=()=>{const b=state.blocks[state.currentBlock];if(b)downloadText(`${safeName(currentDocumentLabel())}_BLOCO_${String(b.number).padStart(3,'0')}_P${b.startPage}-${b.endPage}.txt`,b.content)}}
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('projects'))db.createObjectStore('projects',{keyPath:'id'});if(!db.objectStoreNames.contains('documents')){const s=db.createObjectStore('documents',{keyPath:'id'});s.createIndex('projectId','projectId',{unique:false})}if(!db.objectStoreNames.contains('payloads'))db.createObjectStore('payloads',{keyPath:'id'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function dbGet(store,key){return new Promise((resolve,reject)=>{const r=state.db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}function dbAll(store){return new Promise((resolve,reject)=>{const r=state.db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}function dbPut(store,value){return new Promise((resolve,reject)=>{const tx=state.db.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error)})}function dbDelete(store,key){return new Promise((resolve,reject)=>{const tx=state.db.transaction(store,'readwrite');tx.objectStore(store).delete(key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
async function showDashboard(){closeExtractor();E.resultSection.classList.add('hidden');E.projectView.classList.add('hidden');E.dashboardView.classList.remove('hidden');state.activeProject=null;state.activeDocument=null;state.projects=await dbAll('projects');state.documents=await dbAll('documents');renderDashboardStats();renderProjectGrid();window.scrollTo({top:0,behavior:'smooth'})}
function renderDashboardStats(){const totalProjects=state.projects.length,active=state.projects.filter(p=>p.status==='production').length,totalDocs=state.documents.length,totals=state.documents.reduce((a,d)=>{a.blocks+=d.totalBlocks||0;a.done+=d.completedBlocks||0;return a},{blocks:0,done:0}),pct=totals.blocks?Math.round(totals.done/totals.blocks*100):0;E.dashboardStats.innerHTML=[[totalProjects,'Resumos cadastrados'],[active,'Em produção'],[totalDocs,'PDFs / aulas'],[pct+'%','Progresso geral']].map(([v,l])=>`<div class="dash-stat"><strong>${escapeHtml(String(v))}</strong><span>${escapeHtml(l)}</span></div>`).join('')}
function renderProjectGrid(){const q=E.projectSearch.value.trim().toLowerCase(),filter=E.projectFilter.value,list=state.projects.filter(p=>(filter==='all'||p.status===filter)&&(!q||[p.name,p.subject,p.exam,p.note].join(' ').toLowerCase().includes(q))).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));E.emptyProjects.classList.toggle('hidden',state.projects.length>0);E.projectGrid.innerHTML='';for(const p of list){const docs=state.documents.filter(d=>d.projectId===p.id),tot=docs.reduce((n,d)=>n+(d.totalBlocks||0),0),done=docs.reduce((n,d)=>n+(d.completedBlocks||0),0),pct=tot?Math.round(done/tot*100):0,card=document.createElement('article');card.className='project-card';card.innerHTML=`<div class="project-card-top"><div><p class="eyebrow">${escapeHtml((p.subject||'RESUMO').toUpperCase())}</p><h3>${escapeHtml(p.name)}</h3><div class="meta-line">${escapeHtml([p.exam,p.subject].filter(Boolean).join(' • ')||'Sem classificação')}</div></div><span class="status-chip ${p.status}">${statusLabel(p.status)}</span></div>${p.note?`<div class="project-note">${escapeHtml(p.note)}</div>`:''}<div><div class="project-card-actions"><span class="muted" style="font-size:10px">${pct}% concluído</span><span class="last-seen">${formatDateRelative(p.updatedAt)}</span></div><div class="progress-line"><i style="width:${pct}%"></i></div></div><div class="project-card-stats"><div class="mini-stat"><strong>${docs.length}</strong><span>PDFs</span></div><div class="mini-stat"><strong>${done}/${tot||0}</strong><span>blocos</span></div><div class="mini-stat"><strong>${pct}%</strong><span>progresso</span></div></div><div class="project-card-actions"><button class="btn btn-primary btn-small" data-open>Continuar</button><div class="project-menu"><button class="btn btn-ghost btn-small" data-edit>Editar</button><button class="btn btn-ghost btn-small danger-btn" data-delete>Excluir</button></div></div>`;card.querySelector('[data-open]').onclick=()=>openProject(p.id);card.querySelector('[data-edit]').onclick=()=>openProjectDialog(p);card.querySelector('[data-delete]').onclick=()=>deleteProject(p.id);E.projectGrid.appendChild(card)}}
function openProjectDialog(project=null){E.editingProjectId.value=project?.id||'';E.projectDialogEyebrow.textContent=project?'EDITAR RESUMO':'NOVO RESUMO';E.projectDialogTitle.textContent=project?'Editar projeto':'Cadastrar projeto';E.projectNameInput.value=project?.name||'';E.projectSubjectInput.value=project?.subject||'';E.projectExamInput.value=project?.exam||'';E.projectStatusInput.value=project?.status||'production';E.projectNoteInput.value=project?.note||'';E.projectDialog.showModal();setTimeout(()=>E.projectNameInput.focus(),50)}
async function saveProjectFromDialog(e){e.preventDefault();const id=E.editingProjectId.value||uuid(),old=E.editingProjectId.value?await dbGet('projects',id):null,now=Date.now(),p={id,name:E.projectNameInput.value.trim(),subject:E.projectSubjectInput.value.trim(),exam:E.projectExamInput.value.trim(),status:E.projectStatusInput.value,note:E.projectNoteInput.value.trim(),createdAt:old?.createdAt||now,updatedAt:now};if(!p.name)return;await dbPut('projects',p);E.projectDialog.close();if(state.activeProject?.id===id)await openProject(id);else await showDashboard()}
async function deleteProject(id){const p=await dbGet('projects',id);if(!p||!confirm(`Excluir "${p.name}" e todos os PDFs/blocos salvos dentro dele?\n\nEssa ação não pode ser desfeita sem um backup.`))return;const docs=(await dbAll('documents')).filter(d=>d.projectId===id);for(const d of docs){await dbDelete('payloads',d.id);await dbDelete('documents',d.id)}await dbDelete('projects',id);await showDashboard()}
async function openProject(id){const p=await dbGet('projects',id);if(!p)return showDashboard();state.activeProject=p;state.documents=(await dbAll('documents')).filter(d=>d.projectId===id).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));E.dashboardView.classList.add('hidden');E.projectView.classList.remove('hidden');E.projectCrumb.textContent=p.name;E.projectStatusEyebrow.textContent=statusLabel(p.status).toUpperCase();E.activeProjectTitle.textContent=p.name;E.activeProjectMeta.textContent=[p.subject,p.exam,p.note].filter(Boolean).join(' • ')||'Projeto sem classificação';renderProjectDocuments();window.scrollTo({top:0,behavior:'smooth'})}
function renderProjectDocuments(){const docs=state.documents,tot=docs.reduce((n,d)=>n+(d.totalBlocks||0),0),done=docs.reduce((n,d)=>n+(d.completedBlocks||0),0),pct=tot?Math.round(done/tot*100):0,pages=docs.reduce((n,d)=>n+(d.totalPages||0),0);E.projectStats.innerHTML=[[docs.length,'PDFs / aulas'],[pages,'Páginas processadas'],[`${done}/${tot}`,'Blocos concluídos'],[pct+'%','Progresso do resumo']].map(([v,l])=>`<div class="stat"><strong>${escapeHtml(String(v))}</strong><span>${escapeHtml(l)}</span></div>`).join('');E.projectProgressText.textContent=docs.length?`${pct}% do projeto concluído`:'Aguardando primeiro PDF';E.emptyDocuments.classList.toggle('hidden',docs.length>0);E.documentList.innerHTML='';for(const d of docs){const dp=d.totalBlocks?Math.round((d.completedBlocks||0)/d.totalBlocks*100):0,row=document.createElement('div');row.className='document-row';row.innerHTML=`<div><div class="doc-name">${escapeHtml(d.label||stripPdfExtension(d.fileName))}</div><div class="doc-sub">${escapeHtml(d.fileName)} • ${d.totalPages} páginas • ${formatDateRelative(d.updatedAt)}</div></div><div class="doc-status ${dp===100?'done':'progress'}">${dp===100?'Concluído':'Em produção'}</div><div class="doc-progress"><strong>${d.completedBlocks||0}/${d.totalBlocks||0} blocos • ${dp}%</strong><div class="progress-line" style="margin-top:6px"><i style="width:${dp}%"></i></div><span>${d.currentBlock!=null&&dp<100?`retomar no bloco ${Math.min((d.currentBlock||0)+1,d.totalBlocks||1)}`:'processado'}</span></div><div class="doc-actions"><button class="btn btn-primary btn-small" data-open>${dp===100?'Abrir':'Continuar'}</button><button class="btn btn-ghost btn-small danger-btn" data-delete>Excluir</button></div>`;row.querySelector('[data-open]').onclick=()=>openDocument(d.id);row.querySelector('[data-delete]').onclick=()=>deleteDocument(d.id);E.documentList.appendChild(row)}}
async function deleteDocument(id){const d=await dbGet('documents',id);if(!d||!confirm(`Excluir o PDF/aula "${d.label||d.fileName}" deste resumo?`))return;await dbDelete('documents',id);await dbDelete('payloads',id);if(state.activeDocument?.id===id)E.resultSection.classList.add('hidden');await touchProject(state.activeProject.id);await openProject(state.activeProject.id)}function statusLabel(s){return s==='done'?'Concluído':s==='paused'?'Pausado':'Em produção'}
function openExtractor(){E.extractorArea.classList.remove('hidden');E.resultSection.classList.add('hidden');state.file=null;E.pdfInput.value='';E.fileMeta.classList.add('hidden');E.processBtn.disabled=true;E.extractorArea.scrollIntoView({behavior:'smooth',block:'start'})}function closeExtractor(){E.extractorArea.classList.add('hidden');E.progressWrap.classList.add('hidden');state.file=null;E.pdfInput.value='';E.fileMeta.classList.add('hidden');E.processBtn.disabled=true}function setFile(file){if(!file)return;if(!(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')))return alert('Selecione um PDF.');state.file=file;state.sourceToken=buildSourceToken(state.activeProject,file);E.fileMeta.classList.remove('hidden');E.fileMeta.textContent=`${file.name} • ${formatBytes(file.size)}`;E.processBtn.disabled=false}function getSettings(){return{min:+E.minChars.value,target:+E.targetChars.value,max:+E.maxChars.value,overlap:+E.overlapChars.value,preferHeadings:E.preferHeadings.checked,preferPageBreaks:E.preferPageBreaks.checked}}function validateSettings(){const c=getSettings();if(!(c.min>0&&c.min<=c.target&&c.target<=c.max))throw Error('Use Mínimo ≤ Ideal ≤ Máximo.');if(c.overlap<0||c.overlap>=c.min)throw Error('A sobreposição deve ser menor que o mínimo.')}function setBusy(b){E.processBtn.disabled=b||!state.file;E.pdfInput.disabled=b}function updateProgress(v,t){E.progressWrap.classList.remove('hidden');E.progressBar.style.width=`${v}%`;E.progressText.textContent=t}
async function processPDF(){if(!state.file||!state.activeProject)return;try{validateSettings();setBusy(true);state.pages=[];state.cleanedPages=[];state.units=[];state.blocks=[];state.audit=null;state.selectedPage=null;state.currentBlock=0;state.completed=new Set();const existing=state.documents.find(d=>d.fileName===state.file.name&&d.fileSize===state.file.size);if(existing&&!confirm('Este PDF já está cadastrado neste resumo. Deseja reprocessá-lo e substituir os blocos salvos?'))return;state.documentId=existing?.id||uuid();updateProgress(2,'Abrindo PDF...');const pdf=await pdfjsLib.getDocument({data:await state.file.arrayBuffer()}).promise;state.totalPages=pdf.numPages;for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),text=await extractPageText(p);state.pages.push({page:i,text});updateProgress(Math.round(5+i/pdf.numPages*50),`Extraindo página ${i} de ${pdf.numPages}...`);if(i%8===0)await nextFrame()}updateProgress(60,'Limpando ruído e notas técnicas...');state.cleanedPages=cleanPages(state.pages,E.removeRepeated.checked);updateProgress(72,'Construindo pontos seguros...');state.units=buildUnits(state.cleanedPages);updateProgress(82,'Dividindo em blocos...');state.blocks=chunkUnits(state.units,getSettings(),blockMeta());state.audit=buildAudit(pdf.numPages,{blocks:state.blocks,units:state.units,pages:state.pages,cleanedPages:state.cleanedPages});updateProgress(92,'Salvando no projeto...');await saveProcessedDocument(existing);closeExtractor();await openProject(state.activeProject.id);await openDocument(state.documentId)}catch(err){console.error(err);alert(`Não foi possível processar o PDF.\n\n${err.message||err}`)}finally{setBusy(false)}}
async function saveProcessedDocument(existing){const now=Date.now(),label=stripPdfExtension(state.file.name),doc={id:state.documentId,projectId:state.activeProject.id,label,fileName:state.file.name,fileSize:state.file.size,fileLastModified:state.file.lastModified,sourceToken:state.sourceToken,totalPages:state.totalPages,totalBlocks:state.blocks.length,completedBlocks:0,currentBlock:0,createdAt:existing?.createdAt||now,updatedAt:now,processedAt:now},payload={id:state.documentId,cleanedPages:state.cleanedPages,blocks:state.blocks,audit:state.audit,settings:getSettings()};await dbPut('payloads',payload);await dbPut('documents',doc);await touchProject(state.activeProject.id);state.activeDocument=doc}
async function openDocument(id){const doc=await dbGet('documents',id),payload=await dbGet('payloads',id);if(!doc||!payload)return;state.activeDocument=doc;state.documentId=id;state.sourceToken=doc.sourceToken;state.file=null;state.totalPages=doc.totalPages;state.cleanedPages=payload.cleanedPages||[];const savedBlocks=payload.blocks||[];state.blocks=savedBlocks.map(b=>({...b,content:buildBlockEnvelope({...b,totalBlocks:savedBlocks.length},blockMeta(doc))}));state.audit=payload.audit;state.units=[];state.completed=new Set((await dbGet('documents',doc.id))?.completedIndices||[]);state.currentBlock=Math.max(0,Math.min(doc.currentBlock||0,Math.max(0,state.blocks.length-1)));E.extractorArea.classList.add('hidden');renderResults(doc.totalPages);showBlock(state.currentBlock);E.resultSection.scrollIntoView({behavior:'smooth',block:'start'})}
async function persistDocumentProgress(){if(!state.activeDocument)return;const d=await dbGet('documents',state.activeDocument.id);if(!d)return;d.completedIndices=[...state.completed];d.completedBlocks=state.completed.size;d.currentBlock=state.currentBlock;d.updatedAt=Date.now();await dbPut('documents',d);state.activeDocument=d;await touchProject(d.projectId)}async function touchProject(id){const p=await dbGet('projects',id);if(p){p.updatedAt=Date.now();await dbPut('projects',p);if(state.activeProject?.id===id)state.activeProject=p}}function blockMeta(doc=state.activeDocument){return{projectName:state.activeProject?.name||'—',projectId:state.activeProject?.id||'—',fileName:state.file?.name||doc?.fileName||'—',sourceToken:state.sourceToken}}
function renderResults(totalPages){E.resultSection.classList.remove('hidden');E.documentName.textContent=currentDocumentLabel();E.documentDetails.textContent=`${state.activeDocument?.fileName||state.file?.name||''} • ${totalPages} páginas • vinculado a ${state.activeProject?.name||''}`;const full=buildFullCleanText(),normal=state.audit?.pageInfo.filter(p=>p.status==='ok').length||0,problem=totalPages-normal;E.statsGrid.innerHTML=[['Páginas',totalPages],['Blocos',state.blocks.length],['Texto limpo',formatCompact(full.length)],['Concluídos',`${state.completed.size}/${state.blocks.length}`]].map(([l,v])=>`<div class="stat"><strong>${escapeHtml(String(v))}</strong><span>${escapeHtml(l)}</span></div>`).join('');if(totalPages&&problem/totalPages>=.25){E.scanWarning.classList.remove('hidden');E.scanWarning.textContent=`Atenção: ${problem} de ${totalPages} páginas merecem conferência. Podem ser capas, imagens, páginas escaneadas ou páginas com pouco texto.`}else E.scanWarning.classList.add('hidden');renderAudit();E.blockCountTitle.textContent=`${state.blocks.length} ${state.blocks.length===1?'bloco':'blocos'}`;renderBlockList();showBlock(state.currentBlock,false)}
function renderAudit(){const a=state.audit;if(!a)return;const pct=Math.min(100,Math.max(0,a.integrity)),ok=a.pageInfo.filter(p=>p.status==='ok').length,low=a.pageInfo.filter(p=>p.status==='low').length,empty=a.pageInfo.filter(p=>p.status==='empty').length,unassigned=a.pageInfo.filter(p=>p.status==='unassigned').length,removed=Math.max(0,a.rawChars-a.cleanChars);E.integrityBadge.className=`integrity-badge ${pct>=99.99?'good':pct>=98?'warn':'bad'}`;E.integrityBadge.innerHTML=`<strong>${pct.toFixed(pct>=99.95?0:1)}%</strong> do texto distribuído`;E.auditGrid.innerHTML=[[formatCompact(a.coveredChars),'Texto coberto',`de ${formatCompact(a.sourceChars)} extraídos`],[formatCompact(removed),'Ruído removido','cabeçalhos, notas e artefatos'],[formatCompact(a.overlapChars),'Contexto repetido','overlap intencional'],[`${ok}/${a.totalPages}`,'Páginas normais',`${low} pouco texto • ${empty} vazias`]].map(([v,l,n])=>`<div class="audit-stat"><strong>${escapeHtml(v)}</strong><span>${escapeHtml(l)}</span><em>${escapeHtml(n)}</em></div>`).join('');E.coverageSummary.textContent=unassigned?`${unassigned} página(s) com texto fora dos blocos — revisar`:`${a.totalPages} páginas auditadas • nenhum trecho extraído ficou fora`;E.coverageMap.innerHTML='';a.pageInfo.forEach(info=>{const b=document.createElement('button');b.className=`page-cell ${info.status}`;b.textContent=info.page;b.title=`Página ${info.page}: ${info.clean.toLocaleString('pt-BR')} car. limpos • ${info.blocks.length?'blocos '+info.blocks.map(i=>i+1).join(', '):'sem bloco'}`;b.onclick=()=>inspectPage(info.page);E.coverageMap.appendChild(b)})}
function inspectPage(n){state.selectedPage=n;const info=state.audit?.pageInfo.find(p=>p.page===n),p=state.cleanedPages.find(p=>p.page===n);if(!info||!p)return;[...E.coverageMap.children].forEach((c,i)=>c.classList.toggle('active',i+1===n));E.pageInspector.classList.remove('hidden');E.pageInspectorTitle.textContent=`Página ${n}`;const status=info.status==='ok'?'extração normal':info.status==='low'?'pouco texto':info.status==='empty'?'sem texto extraível':'texto fora dos blocos';E.pageInspectorMeta.textContent=`${info.clean.toLocaleString('pt-BR')} caracteres limpos • ${info.raw.toLocaleString('pt-BR')} antes da limpeza • ${status}`;E.pagePreview.textContent=p.text||'[Nenhum texto extraível]';E.pageBlocks.innerHTML=info.blocks.length?info.blocks.map(i=>`<button class="page-block-chip" data-block="${i}">Bloco ${String(i+1).padStart(2,'0')}</button>`).join(''):'<span class="muted">Sem bloco associado.</span>';E.pageBlocks.querySelectorAll('[data-block]').forEach(b=>b.onclick=()=>{showBlock(+b.dataset.block);document.querySelector('.workspace-grid')?.scrollIntoView({behavior:'smooth'})})}
function renderBlockList(){E.blockList.innerHTML='';state.blocks.forEach((b,i)=>{const x=document.createElement('button');x.className=`block-item ${i===state.currentBlock?'active':''} ${state.completed.has(i)?'done':''}`;x.innerHTML=`<span class="block-number">Bloco ${String(b.number).padStart(2,'0')}</span><span class="block-pages">Páginas ${b.startPage}${b.endPage!==b.startPage?'–'+b.endPage:''}</span><span class="block-size">${b.content.length.toLocaleString('pt-BR')} caracteres</span>`;x.onclick=()=>showBlock(i);E.blockList.appendChild(x)})}function showBlock(i,persist=true){if(!state.blocks.length)return;state.currentBlock=Math.max(0,Math.min(i,state.blocks.length-1));const b=state.blocks[state.currentBlock];E.currentBlockKicker.textContent=`BLOCO ${String(b.number).padStart(2,'0')} DE ${String(state.blocks.length).padStart(2,'0')}`;E.currentBlockTitle.textContent=`Páginas ${b.startPage}${b.endPage!==b.startPage?'–'+b.endPage:''}`;E.currentBlockMeta.textContent=`${b.content.length.toLocaleString('pt-BR')} caracteres • ${state.activeProject?.name||''}`;E.blockText.value=b.content;E.doneCheckbox.checked=state.completed.has(state.currentBlock);E.prevBtn.disabled=state.currentBlock===0;E.nextBtn.disabled=state.currentBlock===state.blocks.length-1;renderBlockList();if(persist&&state.activeDocument)persistDocumentProgress().catch(console.error)}
async function toggleCurrentBlockDone(){if(E.doneCheckbox.checked)state.completed.add(state.currentBlock);else state.completed.delete(state.currentBlock);renderBlockList();updateCompletedStat();await persistDocumentProgress();state.documents=(await dbAll('documents')).filter(d=>d.projectId===state.activeProject.id);renderProjectDocuments()}function updateCompletedStat(){const stat=[...E.statsGrid.querySelectorAll('.stat')].at(-1)?.querySelector('strong');if(stat)stat.textContent=`${state.completed.size}/${state.blocks.length}`}function buildFullCleanText(){return state.cleanedPages.map(({page,text})=>`========== PÁGINA ${page} ==========\n\n${text}`.trim()).filter(Boolean).join('\n\n')}
async function exportWorkspace(){const data={app:'Resumos Pro Central',version:2,exportedAt:new Date().toISOString(),projects:await dbAll('projects'),documents:await dbAll('documents'),payloads:await dbAll('payloads')};downloadText(`ResumosPro_Backup_${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(data,null,2),'application/json')}async function importWorkspace(file){if(!file)return;try{const data=JSON.parse(await file.text());if(!Array.isArray(data.projects)||!Array.isArray(data.documents)||!Array.isArray(data.payloads))throw Error('Backup inválido.');if(!confirm(`Importar ${data.projects.length} projeto(s) e ${data.documents.length} PDF(s)?\n\nItens com o mesmo ID serão atualizados.`))return;for(const p of data.projects)await dbPut('projects',p);for(const d of data.documents)await dbPut('documents',d);for(const p of data.payloads)await dbPut('payloads',p);E.importWorkspaceInput.value='';await showDashboard();alert('Backup importado com sucesso.')}catch(e){alert(`Não foi possível importar o backup.\n\n${e.message||e}`)}}
function currentDocumentLabel(){return state.activeDocument?.label||stripPdfExtension(state.file?.name||'PDF')}function buildSourceToken(project,file){const p=slug(project?.name||'RESUMO').slice(0,28),f=slug(stripPdfExtension(file.name)).slice(0,24),h=Math.abs(simpleHash(`${file.name}|${file.size}|${file.lastModified}`)).toString(36).toUpperCase().slice(0,6);return`${p}_${f}_${h}`}function slug(s){return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'')||'ITEM'}function uuid(){return crypto.randomUUID?crypto.randomUUID():`id_${Date.now()}_${Math.random().toString(36).slice(2)}`}function simpleHash(str){let h=0;for(let i=0;i<str.length;i++)h=((h<<5)-h+str.charCodeAt(i))|0;return h}function nextFrame(){return new Promise(r=>requestAnimationFrame(r))}async function copyText(text){try{await navigator.clipboard.writeText(text)}catch{const a=document.createElement('textarea');a.value=text;document.body.appendChild(a);a.select();document.execCommand('copy');a.remove()}}function flashCopy(msg){E.copyFeedback.textContent=msg;setTimeout(()=>E.copyFeedback.textContent='',1300)}function downloadText(name,text,type='text/plain;charset=utf-8'){const u=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}function stripPdfExtension(s=''){return s.replace(/\.pdf$/i,'')}function safeName(s){return s.replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').slice(0,120)}function formatBytes(n){if(!n)return'0 B';const u=['B','KB','MB','GB'],i=Math.min(Math.floor(Math.log(n)/Math.log(1024)),3);return`${(n/1024**i).toFixed(i?1:0)} ${u[i]}`}function formatCompact(n){if(n>=1e6)return`${(n/1e6).toFixed(2).replace('.',',')} mi car.`;if(n>=1e3)return`${Math.round(n/1e3).toLocaleString('pt-BR')} mil car.`;return`${n.toLocaleString('pt-BR')} car.`}function formatDateRelative(ts){if(!ts)return'—';const d=Math.max(0,Date.now()-ts),day=86400000;if(d<60000)return'agora';if(d<3600000)return`há ${Math.max(1,Math.floor(d/60000))} min`;if(d<day)return`há ${Math.floor(d/3600000)} h`;if(d<day*2)return'ontem';if(d<day*7)return`há ${Math.floor(d/day)} dias`;return new Date(ts).toLocaleDateString('pt-BR')}function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

/* === RESUMOS PRO V2: seleção em lote + detector local de questões === */
Object.assign(state,{
  selected:new Set(),
  classifications:new Map(),
  lastSelectedIndex:null,
  blockSearch:'',
  statusFilter:'all',
  typeFilter:'all',
  __classDocId:null
});
Object.assign(E,{
  blockSearch:$('blockSearch'),
  statusFilter:$('statusFilter'),
  typeFilter:$('typeFilter'),
  selectVisibleBtn:$('selectVisibleBtn'),
  selectPendingBtn:$('selectPendingBtn'),
  selectQuestionsBtn:$('selectQuestionsBtn'),
  clearSelectionBtn:$('clearSelectionBtn'),
  questionSummary:$('questionSummary'),
  classificationSelect:$('classificationSelect'),
  batchBar:$('batchBar'),
  batchCount:$('batchCount'),
  batchChars:$('batchChars'),
  copySelectedBtn:$('copySelectedBtn'),
  prepareBatchBtn:$('prepareBatchBtn')
});

function rpNormalize(s=''){return String(s).replace(/\r/g,'').replace(/[ \t]+/g,' ').trim()}
function rpExtractBody(content=''){const m=String(content).match(/\[\[CONTEUDO_FONTE\]\]\n?([\s\S]*?)\n?\[\[FIM_CONTEUDO_FONTE\]\]/);return m?m[1]:content}
function rpBody(b){return (b?.body||rpExtractBody(b?.content||'')||'').trim()}
function rpClassify(b){
  const t=rpNormalize(rpBody(b)),low=t.toLowerCase();
  const alt=(t.match(/(?:^|\n)\s*(?:[A-Ea-e][)\].:-]|\([A-Ea-e]\))\s+/gm)||[]).length;
  const nums=(t.match(/(?:^|\n)\s*(?:quest[aã]o\s*)?\d{1,4}[.)-]\s+/gim)||[]).length;
  const ce=(low.match(/\b(?:certo|errado|certa|errada)\b/g)||[]).length;
  const stems=(low.match(/\b(?:assinale|julgue|considere|é correto afirmar|é incorreto afirmar|com relação|a respeito|de acordo com|analise as|analise os|marque)\b/g)||[]).length;
  const banca=(t.match(/\b(?:FCC|FGV|CEBRASPE|CESPE|VUNESP|IBFC|AOCP|QUADRIX|IDECAN|FUNDATEC|CONSULPLAN|IADES|banca|cargo|prova|ano)\b/gi)||[]).length;
  const gab=(low.match(/\b(?:gabarito|resposta correta|alternativa correta|coment[aá]rio da quest[aã]o|coment[aá]rio)\b/g)||[]).length;
  const legal=(low.match(/\b(?:art\.?|artigo|lei|decreto|princ[ií]pio|conceito|compet[eê]ncia|classifica[cç][aã]o|caracter[ií]stica|administra[cç][aã]o|gest[aã]o)\b/g)||[]).length;
  const q=alt*3+Math.min(nums,12)*2+ce+stems*2+banca;
  const g=gab*5+(gab&&alt?3:0);
  const theory=Math.min(legal,15)+((t.length>5000&&alt<2)?5:0);
  let type='uncertain',confidence=45;
  if(g>=8&&q>=5){type='answers';confidence=Math.min(98,60+g*3)}
  else if(q>=12&&theory>=6){type='mixed';confidence=Math.min(96,58+q)}
  else if(q>=10||alt>=5||(nums>=4&&stems>=2)){type='questions';confidence=Math.min(98,60+q*2)}
  else if(theory>=5&&q<7){type='theory';confidence=Math.min(96,62+theory*2)}
  else if(q>=6){type='mixed';confidence=Math.min(84,52+q*2)}
  return {type,confidence,manual:false,signals:{alternatives:alt,numbered:nums,certoErrado:ce,stems,banca,gabarito:gab}};
}
function rpEnsureClassifications(){
  state.blocks.forEach((b,i)=>{if(!state.classifications.has(i))state.classifications.set(i,rpClassify(b))});
}
function rpGetClass(i){if(!state.classifications.has(i))state.classifications.set(i,rpClassify(state.blocks[i]||{}));return state.classifications.get(i)}
function rpClassLabel(type){return ({theory:'Teoria',questions:'Questões',mixed:'Teoria + questões',answers:'Gabarito / comentários',uncertain:'Incerto'})[type]||'Incerto'}
function rpVisible(){
  const q=state.blockSearch;
  return state.blocks.map((b,i)=>({b,i,c:rpGetClass(i)})).filter(({b,i,c})=>{
    if(state.statusFilter==='pending'&&state.completed.has(i))return false;
    if(state.statusFilter==='sent'&&!state.completed.has(i))return false;
    if(state.typeFilter!=='all'&&c.type!==state.typeFilter)return false;
    const hay=(rpBody(b)+' bloco '+(i+1)+' páginas '+b.startPage+' '+b.endPage).toLowerCase();
    if(q&&!hay.includes(q))return false;
    return true;
  }).map(x=>x.i);
}
function rpSelect(indices){indices.forEach(i=>state.selected.add(i));if(indices.length)state.lastSelectedIndex=indices.at(-1);renderBlockList();rpUpdateBatch()}
function rpToggle(i,shift=false){
  if(shift&&state.lastSelectedIndex!=null){
    const a=Math.min(state.lastSelectedIndex,i),b=Math.max(state.lastSelectedIndex,i),on=!state.selected.has(i);
    for(let n=a;n<=b;n++) on?state.selected.add(n):state.selected.delete(n);
  }else state.selected.has(i)?state.selected.delete(i):state.selected.add(i);
  state.lastSelectedIndex=i;renderBlockList();rpUpdateBatch();
}
function rpUpdateBatch(){
  const ids=[...state.selected].sort((a,b)=>a-b),chars=ids.reduce((n,i)=>n+rpBody(state.blocks[i]).length,0);
  E.batchBar?.classList.toggle('hidden',!ids.length);
  if(E.batchCount)E.batchCount.textContent=ids.length+' '+(ids.length===1?'bloco selecionado':'blocos selecionados');
  if(E.batchChars)E.batchChars.textContent=chars.toLocaleString('pt-BR')+' caracteres';
}
function rpQuestionSummary(){
  rpEnsureClassifications();
  const qs=state.blocks.map((b,i)=>({b,c:rpGetClass(i)})).filter(x=>['questions','mixed'].includes(x.c.type));
  const pages=new Set(qs.flatMap(x=>x.b.pages||Array.from({length:Math.max(1,(x.b.endPage||x.b.startPage)-(x.b.startPage||1)+1)},(_,k)=>(x.b.startPage||1)+k)));
  if(E.questionSummary)E.questionSummary.textContent=pages.size+' página(s) • '+qs.length+' bloco(s) com questões detectadas';
}
function rpBatchText(indices){
  return indices.slice().sort((a,b)=>a-b).map(i=>{
    const b=state.blocks[i];
    return '[[BLOCO '+String(b.number).padStart(2,'0')+' • PÁGINAS '+b.startPage+(b.endPage!==b.startPage?'–'+b.endPage:'')+']]\n'+rpBody(b);
  }).join('\n\n');
}
async function rpCopySelected(prepare){
  const ids=[...state.selected].sort((a,b)=>a-b);if(!ids.length)return;
  const text=rpBatchText(ids);
  if(text.length>180000&&!confirm('Este lote tem '+text.length.toLocaleString('pt-BR')+' caracteres. Copiar mesmo assim?'))return;
  await copyText(text);
  ids.forEach(i=>state.completed.add(i));
  state.selected.clear();state.lastSelectedIndex=null;
  await persistDocumentProgress();
  updateCompletedStat();rpUpdateBatch();rpQuestionSummary();renderBlockList();
  const next=state.blocks.findIndex((_,i)=>i>ids.at(-1)&&!state.completed.has(i));
  if(prepare&&next>=0)showBlock(next);
  flashCopy(ids.length+' bloco(s) copiado(s) e marcado(s) como enviados.');
  state.documents=(await dbAll('documents')).filter(d=>d.projectId===state.activeProject.id);renderProjectDocuments();
}
function rpShortcuts(e){
  if(E.resultSection.classList.contains('hidden'))return;
  const tag=document.activeElement?.tagName;
  if(['INPUT','SELECT'].includes(tag))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'&&state.selected.size){e.preventDefault();rpCopySelected(false);return}
  if(tag==='TEXTAREA'&&document.activeElement!==E.blockText)return;
  if(e.key===' '&&!e.ctrlKey&&!e.metaKey){e.preventDefault();rpToggle(state.currentBlock,e.shiftKey);return}
  if(e.key.toLowerCase()==='j'){e.preventDefault();showBlock(Math.min(state.currentBlock+1,state.blocks.length-1));return}
  if(e.key.toLowerCase()==='k'){e.preventDefault();showBlock(Math.max(state.currentBlock-1,0));return}
}

const __rpBindEvents=bindEvents;
bindEvents=function(){
  __rpBindEvents();
  if(E.blockSearch)E.blockSearch.oninput=()=>{state.blockSearch=E.blockSearch.value.trim().toLowerCase();renderBlockList()};
  if(E.statusFilter)E.statusFilter.onchange=()=>{state.statusFilter=E.statusFilter.value;renderBlockList()};
  if(E.typeFilter)E.typeFilter.onchange=()=>{state.typeFilter=E.typeFilter.value;renderBlockList()};
  if(E.selectVisibleBtn)E.selectVisibleBtn.onclick=()=>rpSelect(rpVisible());
  if(E.selectPendingBtn)E.selectPendingBtn.onclick=()=>rpSelect(rpVisible().filter(i=>!state.completed.has(i)));
  if(E.selectQuestionsBtn)E.selectQuestionsBtn.onclick=()=>rpSelect(rpVisible().filter(i=>['questions','mixed'].includes(rpGetClass(i).type)));
  if(E.clearSelectionBtn)E.clearSelectionBtn.onclick=()=>{state.selected.clear();state.lastSelectedIndex=null;renderBlockList();rpUpdateBatch()};
  if(E.copySelectedBtn)E.copySelectedBtn.onclick=()=>rpCopySelected(false);
  if(E.prepareBatchBtn)E.prepareBatchBtn.onclick=()=>rpCopySelected(true);
  if(E.classificationSelect)E.classificationSelect.onchange=async()=>{const c=rpGetClass(state.currentBlock);state.classifications.set(state.currentBlock,{...c,type:E.classificationSelect.value,manual:true,confidence:100});renderBlockList();rpQuestionSummary();await persistDocumentProgress()};
  document.addEventListener('keydown',rpShortcuts);
};

const __rpPersist=persistDocumentProgress;
persistDocumentProgress=async function(){
  await __rpPersist();
  if(!state.activeDocument)return;
  const d=await dbGet('documents',state.activeDocument.id);if(!d)return;
  d.blockClassifications=state.blocks.map((_,i)=>rpGetClass(i));
  await dbPut('documents',d);state.activeDocument=d;
};

const __rpRenderResults=renderResults;
renderResults=function(totalPages){
  const docId=state.activeDocument?.id||state.documentId||'new';
  if(state.__classDocId!==docId){
    state.__classDocId=docId;state.selected=new Set();state.lastSelectedIndex=null;
    state.classifications=new Map((state.activeDocument?.blockClassifications||[]).map((c,i)=>[i,c]));
  }
  rpEnsureClassifications();
  __rpRenderResults(totalPages);
  rpQuestionSummary();rpUpdateBatch();
};

renderBlockList=function(){
  rpEnsureClassifications();
  const visible=new Set(rpVisible());
  E.blockList.innerHTML='';
  state.blocks.forEach((b,i)=>{
    if(!visible.has(i))return;
    const c=rpGetClass(i),x=document.createElement('div');
    x.className='block-item '+(i===state.currentBlock?'active ':'')+(state.completed.has(i)?'done ':'')+(state.selected.has(i)?'selected':'');
    x.innerHTML='<label class="block-select" title="Selecionar"><input type="checkbox" '+(state.selected.has(i)?'checked':'')+'></label><button class="block-open"><span class="block-number">Bloco '+String(b.number).padStart(2,'0')+'</span><span class="block-pages">Páginas '+b.startPage+(b.endPage!==b.startPage?'–'+b.endPage:'')+'</span><span class="block-size">'+rpBody(b).length.toLocaleString('pt-BR')+' caracteres</span><span class="class-chip '+c.type+'">'+rpClassLabel(c.type)+' • '+c.confidence+'%</span></button>';
    x.querySelector('input').onclick=e=>{e.stopPropagation();rpToggle(i,e.shiftKey)};
    x.querySelector('.block-open').onclick=()=>showBlock(i);
    E.blockList.appendChild(x);
  });
  rpUpdateBatch();
};

showBlock=function(i,persist=true){
  if(!state.blocks.length)return;
  state.currentBlock=Math.max(0,Math.min(i,state.blocks.length-1));
  const b=state.blocks[state.currentBlock],c=rpGetClass(state.currentBlock);
  E.currentBlockKicker.textContent='BLOCO '+String(b.number).padStart(2,'0')+' DE '+String(state.blocks.length).padStart(2,'0');
  E.currentBlockTitle.textContent='Páginas '+b.startPage+(b.endPage!==b.startPage?'–'+b.endPage:'');
  E.currentBlockMeta.textContent=rpBody(b).length.toLocaleString('pt-BR')+' caracteres • '+rpClassLabel(c.type)+' ('+c.confidence+'%'+(c.manual?' • manual':'')+') • '+(state.activeProject?.name||'');
  E.blockText.value=b.content;E.doneCheckbox.checked=state.completed.has(state.currentBlock);
  if(E.classificationSelect)E.classificationSelect.value=c.type;
  E.prevBtn.disabled=state.currentBlock===0;E.nextBtn.disabled=state.currentBlock===state.blocks.length-1;
  renderBlockList();if(persist&&state.activeDocument)persistDocumentProgress().catch(console.error);
};
