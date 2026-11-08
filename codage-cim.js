/* Codage CIM — recherche locale, favoris propres à chaque classification. */
(function () {
 'use strict';
 const dataURL=new URL('./codage-cim-data.js',document.currentScript?.src||document.baseURI).href;
 const favoriteKey='cmp.codage-cim.favorites.v1', preferenceKey='cmp.codage-cim.scheme.v1';
 const state={scheme:'10',favoritesOpen:false,views:{'10':{query:'',filter:'',limit:40},'11':{query:'',filter:'',limit:40}}};
 let data,indices,loading,favorites=[],storageMessage='';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const normalize=text=>String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/œ/g,'oe').replace(/æ/g,'ae').replace(/[^a-z0-9]+/g,' ').trim();
 const variants={depression:'depress',depressif:'depress',depressive:'depress',bipolarite:'bipolair',schizophrenie:'schizophren',addictologie:'addict',addictions:'addict'};
 // Local search shortcuts, not equivalence tables between classifications.
 const shortcuts={
  '10':{tdah:['F90'],tda:['F90'],tsa:['F84'],autisme:['F84'],toc:['F42'],tag:['F41.1'],tspt:['F43.1'],espt:['F43.1'],ptsd:['F43.1']},
  '11':{tdah:['6A05'],tda:['6A05'],tsa:['6A02'],autisme:['6A02'],toc:['6B20'],tag:['6B00'],tspt:['6B40','6B41'],espt:['6B40','6B41'],ptsd:['6B40','6B41']}
 };
 const isDescendantCode=(code,prefix)=>code===prefix||code.startsWith(prefix+(prefix.includes('.')?'':'.'));
 function createIndex(scheme,key){
  const byID=new Map(scheme.nodes.map(n=>[n.id,n])),byCode=new Map(scheme.nodes.filter(n=>n.code).map(n=>[n.code,n]));
  const children=new Map();
  scheme.nodes.forEach(n=>{if(!children.has(n.parent))children.set(n.parent,[]);children.get(n.parent).push(n);});
  const ancestors=node=>{const result=[],seen=new Set([node.id]);while(node.parent&&byID.has(node.parent)&&!seen.has(node.parent)){node=byID.get(node.parent);seen.add(node.id);result.unshift(node);}return result;};
  const groups=scheme.nodes.filter(n=>n.kind==='block'&&scheme.nodes.some(c=>c.group===n.id));
  const entries=scheme.nodes.filter(n=>n.code).map((node,order)=>{
   const local=Object.entries(shortcuts[key]).filter(([,codes])=>codes.some(code=>isDescendantCode(node.code,code))).map(([alias])=>alias);
   if(key==='10'&&node.code.startsWith('F1')||key==='11'&&node.code.startsWith('6C4')||key==='11'&&node.code.startsWith('6C5'))local.push('addict');
   return {node,order,title:normalize(node.title),local,aliases:normalize([...(node.aliases||[]),...local].join(' '))};
  });
  return {scheme,key,byID,byCode,children,ancestors,groups,entries};
 }
 function search(index,query,filter=''){
  const code=String(query).trim().toUpperCase().replace(/\s/g,'');
  const codeQuery=/^[A-Z0-9]+(?:\.[A-Z0-9]*)?$/.test(code)&&(index.key==='10'?/^[FZ](?:\d|$)/.test(code):/^(?:6(?:[A-Z]|$)|Q[A-Z](?:\d|$))/.test(code));
  const bareCode=code.replace(/\./g,'');
  const normal=normalize(query),tokens=normal.split(' ').filter(Boolean).map(t=>variants[t]||t);
  return index.entries.filter(e=>!filter||filter==='psy'&&e.node.scope==='psy'||filter==='contact'&&e.node.scope==='contact'||filter.startsWith('g:')&&e.node.group===filter.slice(2))
   .map(e=>{
    let score=0;
    if(normal){
     if(codeQuery){const candidate=e.node.code.replace(/\./g,'');score=candidate===bareCode?-100:candidate.startsWith(bareCode)?candidate.length:Infinity;}
     else if(!tokens.every(t=>shortcuts[index.key][t]?e.local.includes(t):(e.title+' '+e.aliases).includes(t)))score=Infinity;
     else score=(e.title===normal?0:e.title.startsWith(normal)?10:tokens.every(t=>e.title.includes(t))?20:30)+(e.node.code.includes('.')?2:0);
    }
    return {node:e.node,order:e.order,score};
   }).filter(e=>Number.isFinite(e.score)).sort((a,b)=>a.score-b.score||a.order-b.order).map(e=>e.node);
 }
 function parseFavorites(value){
  const obj=JSON.parse(value||'{"version":1,"entries":[]}');
  if(obj.version!==1||!Array.isArray(obj.entries))throw Error('Format de favoris inconnu');
  const unique=new Map();
  obj.entries.slice(0,10000).forEach(e=>{if(e&&['10','11'].includes(e.scheme)&&typeof e.code==='string'&&/^[A-Z0-9]+(?:\.[A-Z0-9]+)?$/.test(e.code))unique.set(e.scheme+':'+e.code,{scheme:e.scheme,code:e.code});});
  return [...unique.values()];
 }
 function toggleFavorite(list,scheme,code){
  const exists=list.some(e=>e.scheme===scheme&&e.code===code);
  return exists?list.filter(e=>e.scheme!==scheme||e.code!==code):[...list,{scheme,code}];
 }
 try{
  favorites=parseFavorites(localStorage.getItem(favoriteKey));
  const preferred=localStorage.getItem(preferenceKey);if(['10','11'].includes(preferred))state.scheme=preferred;
 }catch(_){storageMessage='La sauvegarde des favoris n’est pas disponible. Les changements resteront dans cette page tant qu’elle est ouverte.';}
 function saveFavorites(){
  try{localStorage.setItem(favoriteKey,JSON.stringify({version:1,entries:favorites}));storageMessage='';}
  catch(_){storageMessage='Ces favoris restent disponibles pendant cette ouverture, mais le navigateur ne permet pas de les enregistrer durablement.';}
 }
 function favoriteRows(){return favorites.filter(f=>f.scheme===state.scheme).map(f=>indices[state.scheme].byCode.get(f.code)).filter(Boolean);}
 const isFavorite=code=>favorites.some(f=>f.scheme===state.scheme&&f.code===code);
 function effectiveNotes(node){
  const entries=[],seen=new Set();
  for(const n of [node,...indices[state.scheme].ancestors(node).reverse()]){
   for(const note of n.notes||[]){const key=note.label+'\n'+note.text;if(!seen.has(key)){seen.add(key);entries.push({...note,origin:n.id===node.id?'':n.code||n.title});}}
  }
  return entries;
 }
 const copyIcon='<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="6" width="10" height="11" rx="2"/><path d="M12 6V3H3v10h3"/></svg>';
 function resultRow(node,location){
  const favorite=isFavorite(node.code),children=indices[state.scheme].children.get(node.id)||[],notes=effectiveNotes(node);
  const whoParent=state.scheme==='10'&&node.whoCode!==node.code;
  return `<li class="cc-row" data-code="${esc(node.code)}"><div class="cc-result-main"><span class="cc-code">${esc(node.code)}</span><div class="cc-title"><strong>${esc(node.title)}</strong><div class="cc-row-meta">${children.length?`<button type="button" data-cc-subcodes="${esc(node.code)}">${children.length} sous-code${children.length>1?'s':''}</button>`:''}${node.primary===false?'<span class="cc-complement">Code complémentaire</span>':''}</div></div><div class="cc-row-actions"><button type="button" class="cc-star${favorite?' on':''}" data-cc-favorite="${esc(node.code)}" data-location="${location}" aria-pressed="${favorite}" aria-label="${favorite?'Retirer':'Ajouter'} ${esc(node.code)} ${favorite?'des':'aux'} favoris" title="${favorite?'Retirer des favoris':'Ajouter aux favoris'}">${favorite?'★':'☆'}</button><button type="button" data-cc-copy="code" data-cc-code="${esc(node.code)}" aria-label="Copier le code ${esc(node.code)}" title="Copier le code">${copyIcon}Code</button><button type="button" data-cc-copy="full" data-cc-code="${esc(node.code)}" aria-label="Copier ${esc(node.code)} et son libellé">Code + libellé</button><a href="${esc(node.url)}" target="_blank" rel="noopener noreferrer" title="${state.scheme==='10'?'OMS 2019, anglais'+(whoParent?' : catégorie parente '+node.whoCode:''):'Fiche OMS en français'}">OMS${whoParent?' · parent':''}<span aria-hidden="true"> ↗</span></a></div></div>${notes.length?`<details class="cc-notes"><summary>Notes de codage${notes.some(n=>n.label==='À exclure')?' et exclusions':''}</summary><div>${notes.map(n=>`<p><b>${esc(n.label)}${n.origin?' · '+esc(n.origin):''}</b><br>${esc(n.text)}</p>`).join('')}</div></details>`:''}</li>`;
 }
 function renderFavorites(root){
  const rows=favoriteRows(),button=root.querySelector('[data-cc-toggle-favorites]'),panel=root.querySelector('#cc-favorites-panel');
  button.innerHTML=`<span aria-hidden="true">★</span> Favoris <span class="cc-count">${rows.length}</span><span aria-hidden="true">${state.favoritesOpen?'▴':'▾'}</span>`;
  button.setAttribute('aria-expanded',String(state.favoritesOpen));panel.hidden=!state.favoritesOpen;
  if(state.favoritesOpen)panel.innerHTML=`<div class="cc-panel-heading"><h2>Favoris ${data.schemes[state.scheme].name}</h2><span>Retirez une étoile pour modifier la liste.</span></div>${rows.length?`<ul class="cc-results cc-favorite-list">${rows.map(n=>resultRow(n,'favorites')).join('')}</ul>`:'<p class="cc-empty-favorites">Aucun favori dans cette classification. Cliquez sur ☆ à côté d’un résultat pour l’ajouter.</p>'}<p class="cc-favorite-help">Conservés dans ce navigateur, indépendamment pour chaque CIM. Ils ne sont pas partagés avec un autre appareil.</p>`;
  root.querySelector('[data-cc-storage]').textContent=storageMessage;
 }
 function renderResults(root){
  const index=indices[state.scheme],view=state.views[state.scheme],rows=search(index,view.query,view.filter);
  root.querySelector('[data-cc-result-count]').textContent=`${rows.length} résultat${rows.length>1?'s':''}`;
  root.querySelector('[data-cc-list]').innerHTML=rows.length?`<ul class="cc-results">${rows.slice(0,view.limit).map(n=>resultRow(n,'results')).join('')}</ul>${rows.length>view.limit?`<div class="cc-more"><span>${view.limit} sur ${rows.length}</span><button type="button" data-cc-more>Afficher 40 résultats de plus</button></div>`:''}`:'<div class="cc-empty"><b>Aucun résultat dans cette sélection.</b><p>Essayez un mot plus court, un code ou une autre famille.</p></div>';
  root.querySelector('[data-cc-clear]').disabled=!view.query&&!view.filter;
 }
 function sourcePanel(){
  return `<details class="cc-sources"><summary>Sources, périmètre et versions</summary><div><p><b>CIM-10 :</b> ${esc(data.schemes['10'].attribution)} ${data.schemes['10'].psyCount} codes F (psychiatrie / addictologie) et ${data.schemes['10'].contactCount} codes Z (tous les motifs de recours, facteurs de santé et antécédents du chapitre XXI). Les libellés et notes sont reproduits depuis le référentiel français, sans reformulation. <a href="${esc(data.schemes['10'].sourcePage)}" target="_blank" rel="noopener noreferrer">Source ANS / ATIH</a> · <a href="${data.schemes['10'].licenseURL}" target="_blank" rel="noopener noreferrer">${data.schemes['10'].license}</a>.</p><p>Les liens OMS en CIM-10 ouvrent la version internationale 2019, en anglais. Pour les codes à plus de quatre caractères, le lien « OMS · parent » ouvre la catégorie internationale parente ; les détails et extensions français relèvent du référentiel ANS / ATIH.</p><p><b>CIM-11 :</b> ${esc(data.schemes['11'].attribution)} Chapitre 06 (${data.schemes['11'].psyCount} codes) et chapitre 24 « Facteurs influant sur l’état de santé ou motifs de recours aux services de santé » (${data.schemes['11'].contactCount} codes). Les motifs de recours n’y portent pas les codes Z de la CIM-10. <a href="${data.schemes['11'].source}" target="_blank" rel="noopener noreferrer">Export OMS</a> · <a href="${data.schemes['11'].licenseURL}" target="_blank" rel="noopener noreferrer">${data.schemes['11'].license}</a>.</p><p>Les classifications restent distinctes : le sélecteur ne réalise aucune conversion automatique. Les acronymes (TDAH, TSA, TOC, TAG, TSPT…) sont des aides de recherche ajoutées localement, pas des équivalences diagnostiques. Vérifiez les critères, exclusions et règles de codage applicables ; aucune situation « sans diagnostic » ne sélectionne automatiquement un code Z.</p><p>Recherche locale, sans transmission de la saisie. Les favoris contiennent uniquement la classification et les codes ; ils sont conservés dans ce navigateur. Les données de référence ne se mettent pas à jour automatiquement. Import du 08/11/2026. Outil indépendant de l’OMS, de l’ATIH et de l’ANS.</p></div></details>`;
 }
 function renderBody(root){
  const scheme=data.schemes[state.scheme],index=indices[state.scheme],view=state.views[state.scheme];
  root.innerHTML=`<div class="codage-cim"><header class="cc-header"><h1>Codage CIM</h1><div class="cc-switch" role="group" aria-label="Classification">${['10','11'].map(key=>`<button type="button" data-cc-scheme="${key}" aria-pressed="${state.scheme===key}"${state.scheme===key?' class="active"':''}>CIM-${key}</button>`).join('')}</div></header><section class="cc-search" aria-label="Recherche de codes"><div class="cc-search-line"><label class="cc-sr" for="cc-query">Diagnostic ou code</label><input type="search" id="cc-query" placeholder="Diagnostic, mot-clé ou code…" autocomplete="off" spellcheck="false" maxlength="180" value="${esc(view.query)}"><label class="cc-sr" for="cc-filter">Famille de codes</label><select id="cc-filter"><option value="">Toutes les familles</option><option value="psy">Psychiatrie / addictologie</option><option value="contact">${state.scheme==='10'?'Codes Z · examens et motifs de recours':'Examens et motifs de recours'}</option>${['psy','contact'].map(scope=>`<optgroup label="${scope==='psy'?'Psychiatrie':'Motifs de recours'}">${index.groups.filter(n=>n.scope===scope).map(n=>`<option value="g:${esc(n.id)}">${esc(n.title)}</option>`).join('')}</optgroup>`).join('')}</select><button type="button" class="cc-clear" data-cc-clear>Effacer</button></div><div class="cc-toolbar"><button type="button" class="cc-favorites-toggle" data-cc-toggle-favorites aria-controls="cc-favorites-panel" aria-expanded="${state.favoritesOpen}"></button><span class="cc-version">${esc(scheme.version)}</span></div></section><p class="cc-storage" role="status" data-cc-storage></p><section id="cc-favorites-panel" class="cc-favorites" aria-label="Liste des favoris" hidden></section><div class="cc-results-heading"><h2>Résultats</h2><span role="status" aria-live="polite" data-cc-result-count></span></div><div data-cc-list></div><div class="cc-copy-feedback" role="status" aria-live="polite" data-cc-copy-status></div>${sourcePanel()}</div>`;
  root.querySelector('#cc-filter').value=view.filter;
  renderFavorites(root);renderResults(root);
  root.querySelector('#cc-query').oninput=event=>{view.query=event.target.value;view.limit=40;renderResults(root);};
  root.querySelector('#cc-filter').onchange=event=>{view.filter=event.target.value;view.limit=40;renderResults(root);};
  root.querySelector('.cc-switch').onkeydown=event=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
   event.preventDefault();const key=event.key==='ArrowLeft'||event.key==='Home'?'10':'11';changeScheme(key,root);root.querySelector(`[data-cc-scheme="${key}"]`).focus();
  };
  root.onclick=event=>{
   const button=event.target.closest('button');if(!button||!root.contains(button))return;
   const has=name=>button.hasAttribute('data-cc-'+name);
   if(has('scheme')){changeScheme(button.dataset.ccScheme,root);}
   else if(has('toggle-favorites')){state.favoritesOpen=!state.favoritesOpen;renderFavorites(root);}
   else if(has('favorite')){
    const code=button.dataset.ccFavorite,location=button.dataset.location;
    favorites=toggleFavorite(favorites,state.scheme,code);saveFavorites();renderFavorites(root);renderResults(root);
    const targets=[...root.querySelectorAll('[data-cc-favorite]')];
    const next=targets.find(b=>b.dataset.ccFavorite===code&&b.dataset.location===location)||targets.find(b=>b.dataset.ccFavorite===code)||root.querySelector('[data-cc-toggle-favorites]');
    next.focus({preventScroll:true});
   }else if(has('copy')){const node=index.byCode.get(button.dataset.ccCode);if(node)copy(button.dataset.ccCopy==='code'?node.code:node.code+' — '+node.title,root);}
   else if(has('clear')){view.query='';view.filter='';view.limit=40;root.querySelector('#cc-query').value='';root.querySelector('#cc-filter').value='';renderResults(root);root.querySelector('#cc-query').focus();}
   else if(has('subcodes')){view.query=button.dataset.ccSubcodes;view.filter='';view.limit=40;root.querySelector('#cc-query').value=view.query;root.querySelector('#cc-filter').value='';renderResults(root);root.querySelector('#cc-query').focus();}
   else if(has('more')){const old=view.limit;view.limit+=40;renderResults(root);root.querySelectorAll('[data-cc-list] .cc-star')[old]?.focus({preventScroll:true});}
  };
 }
 function changeScheme(key,root){
  if(!['10','11'].includes(key)||key===state.scheme)return;
  state.scheme=key;try{localStorage.setItem(preferenceKey,key);}catch(_){}renderBody(root);
 }
 async function copy(value,root){
  const feedback=root.querySelector('[data-cc-copy-status]');let ok=false;
  try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);ok=true;}}catch(_){}
  if(!ok){const area=document.createElement('textarea');area.value=value;area.className='cc-copy-fallback';root.appendChild(area);area.select();try{ok=document.execCommand('copy');}catch(_){}area.remove();}
  if(!root.isConnected)return;
  clearTimeout(copy.timer);
  if(ok){feedback.textContent='Copié : '+value;feedback.classList.add('show');copy.timer=setTimeout(()=>{feedback.classList.remove('show');feedback.textContent='';},2800);}
  else{feedback.innerHTML='<label>Copie automatique indisponible. Copiez ce texte :<textarea readonly rows="3"></textarea></label><button type="button">Fermer</button>';feedback.querySelector('textarea').value=value;feedback.classList.add('show');feedback.querySelector('textarea').select();feedback.querySelector('button').onclick=()=>feedback.classList.remove('show');}
 }
 function ensureData(){
  if(indices)return Promise.resolve();
  const initialize=()=>{data=window.CODAGE_CIM_DATA;if(data?.schema!==2)throw Error('Base incorrecte');indices=Object.fromEntries(['10','11'].map(key=>[key,createIndex(data.schemes[key],key)]));};
  if(window.CODAGE_CIM_DATA){try{initialize();return Promise.resolve();}catch(e){return Promise.reject(e);}}
  if(loading)return loading;
  loading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=dataURL;script.onload=()=>{try{initialize();resolve();}catch(e){loading=null;reject(e);}};script.onerror=()=>{script.remove();loading=null;reject(Error('Base absente'));};document.head.appendChild(script);});return loading;
 }
 async function render(root){
  root.innerHTML='<div class="codage-cim cc-loading" role="status">Chargement des bases CIM locales…</div>';
  try{await ensureData();if(root.isConnected)renderBody(root);}catch(_){if(root.isConnected){root.innerHTML='<div class="codage-cim"><h2>Base de codage indisponible</h2><p>Gardez codage-cim-data.js dans le même dossier que l’index.</p><button type="button">Réessayer</button></div>';root.querySelector('button').onclick=()=>render(root);}}
 }
 window.CodageCIM={render,createIndex,search,parseFavorites,toggleFavorite};
})();
