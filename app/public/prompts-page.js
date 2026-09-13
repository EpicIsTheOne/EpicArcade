'use strict';
(()=>{
const app=document.getElementById('app'),search=document.getElementById('promptSearch'),count=document.getElementById('promptCount');
const REDUCED=matchMedia('(prefers-reduced-motion: reduce)').matches;
let entries=[];
function revealScan(){
  if(REDUCED||!('IntersectionObserver' in window))return;
  document.documentElement.classList.add('js-reveal');
  const targets=app.querySelectorAll('[data-reveal]:not(.is-in)');
  if(!targets.length)return;
  const io=new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){e.target.classList.add('is-in');io.unobserve(e.target);}},{threshold:.06});
  targets.forEach((el,i)=>{if(!el.style.getPropertyValue('--reveal-i'))el.style.setProperty('--reveal-i',Math.min(i,12));io.observe(el);});
}
function filter(){
  const before=new Map();
  if(!REDUCED)for(const {element} of entries)if(!element.hidden)before.set(element,element.getBoundingClientRect());
  const q=search.value.trim().toLowerCase();let visible=0;
  for(const {element,hay} of entries){element.hidden=!hay.includes(q);if(!element.hidden)visible++;}
  count.textContent=`${visible} of ${entries.length} prompts${visible===0?' — no matches.':''}`;
  if(REDUCED)return;
  requestAnimationFrame(()=>{
    let fresh=0;
    for(const {element} of entries){
      if(element.hidden)continue;
      const was=before.get(element);
      if(was){
        const dy=was.top-element.getBoundingClientRect().top;
        if(dy){element.style.transition='none';element.style.transform=`translateY(${dy}px)`;requestAnimationFrame(()=>requestAnimationFrame(()=>{element.style.transition='transform 240ms cubic-bezier(.2,.7,.3,1)';element.style.transform='';}));}
      }else{element.style.animation=`ebWipeIn 300ms cubic-bezier(.2,.7,.3,1) ${Math.min(fresh++*35,210)}ms both`;}
    }
  });
}
document.getElementById('searchButton').addEventListener('click',()=>{search.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});search.focus({preventScroll:true});});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();search.focus();}if(e.key==='Escape'&&document.activeElement===search){search.value='';filter();}});search.addEventListener('input',filter);
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
async function load(){try{const r=await fetch('prompts.json',{cache:'no-cache'});if(!r.ok)throw Error('Unable to load prompts.');const prompts=await r.json();if(!Array.isArray(prompts)||!prompts.every(p=>typeof p.text==='string'))throw Error('Prompt text is unavailable.');app.replaceChildren();entries=prompts.map((p,i)=>{const card=el('details','prompt-entry');card.id='prompt-'+p.id;if(!REDUCED){card.setAttribute('data-reveal','wipe');card.style.setProperty('--reveal-i',Math.min(i,12));card.addEventListener('toggle',()=>{if(card.open)card.classList.add('was-opened');});}const summary=el('summary');summary.append(el('span','prompt-name',String(p.id).padStart(2,'0')+' · '+p.title),el('span','difficulty-tag difficulty-'+p.difficulty.replace(/\s/g,''),p.difficulty));const content=el('div','prompt-content'),copy=el('button',null,'Copy prompt'),status=el('span','copy-status'),pre=el('pre',null,p.text);copy.type='button';copy.setAttribute('aria-label','Copy prompt: '+p.title);status.setAttribute('role','status');copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(p.text);status.textContent='Copied';}catch{const selection=getSelection(),range=document.createRange();range.selectNodeContents(pre);selection.removeAllRanges();selection.addRange(range);status.textContent='Copy unavailable — text selected. Press Ctrl+C or Cmd+C.';}});content.append(copy,status,pre);card.append(summary,content);app.append(card);return{element:card,hay:[p.id,p.title,p.difficulty,p.text].join(' ').toLowerCase()};});filter();revealScan();}catch(error){count.textContent=error.message;app.replaceChildren();const retry=el('button',null,'Retry loading prompts');retry.addEventListener('click',load);app.append(retry);}}
load();
})();
