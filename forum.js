const topicsEl=document.getElementById('topics');
const modal=document.getElementById('modal');
const form=document.getElementById('topicForm');
const guestGate=document.getElementById('guestGate');
let current='Все',topics=[],currentUser=null;
const token=()=>typeof getToken==='function'?getToken():localStorage.getItem('epmToken')||'';

async function refreshAuth(){
  try{currentUser=typeof restoreSession==='function'?await restoreSession():(token()&&typeof getUser==='function'?getUser():null)}catch{currentUser=null}
  return currentUser;
}

async function openAction(){
  await refreshAuth();
  modal.classList.add('show');
  const logged=Boolean(currentUser);
  guestGate.style.display=logged?'none':'block';
  form.style.display=logged?'block':'none';
}

function updateStats(){
  document.getElementById('topicCount').textContent=topics.length;
  document.getElementById('replyCount').textContent=topics.reduce((n,t)=>n+Number(t.repliesCount||0),0);
  document.getElementById('viewCount').textContent=topics.reduce((n,t)=>n+Number(t.views||0),0);
}

async function load(){
  try{
    const r=await fetch('/api/topics',{cache:'no-store'});
    if(!r.ok)throw new Error();
    const data=await r.json();
    topics=Array.isArray(data)?data:[];
    updateStats();
    render();
  }catch{
    topicsEl.innerHTML='<div class="forum-empty"><strong>Не удалось загрузить форум</strong><span>Проверьте подключение к серверу.</span></div>';
  }
}

function render(){
  let list=current==='Все'?topics:topics.filter(t=>(t.category||'')===current);
  list=[...list].sort((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned))||new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0));
  document.getElementById('listTitle').textContent=current==='Все'?'Последние обсуждения':current;
  if(!list.length){topicsEl.innerHTML='<div class="forum-empty"><strong>В этом разделе пока нет тем</strong><span>Создай первую тему и начни обсуждение.</span></div>';return}
  topicsEl.innerHTML=list.map(t=>`<a class="forum-topic" href="topic.html?id=${encodeURIComponent(t.id)}"><div class="forum-topic-main"><div class="forum-topic-badges">${t.pinned?'<span class="topic-badge pinned">📌 Закреплено</span>':''}${t.closed?'<span class="topic-badge closed">Закрыто</span>':''}<span class="topic-badge">${esc(t.category||'Обсуждение')}</span></div><h3>${esc(t.title)}</h3><p>${esc(t.author||'Пользователь')} · ${time(t.updatedAt||t.createdAt)}</p></div><div class="forum-topic-meta"><div><b>${Number(t.repliesCount||0)}</b>ответов</div><div><b>${Number(t.views||0)}</b>просмотров</div></div></a>`).join('');
}

function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function time(v){if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('ru-RU')}

document.getElementById('newTopic').onclick=openAction;
document.getElementById('closeGuest').onclick=()=>modal.classList.remove('show');
document.getElementById('cancel').onclick=()=>modal.classList.remove('show');
modal.onclick=e=>{if(e.target===modal)modal.classList.remove('show')};

document.querySelectorAll('.forum-category').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.forum-category').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  current=b.dataset.category;
  render();
});

form.onsubmit=async e=>{
  e.preventDefault();
  await refreshAuth();
  if(!currentUser){await openAction();return}
  const titleValue=document.getElementById('title').value.trim();
  const categoryValue=document.getElementById('category').value;
  const contentValue=document.getElementById('content').value.trim();
  if(titleValue.length<3||contentValue.length<2)return;
  const button=form.querySelector('button[type="submit"]');
  if(button){button.disabled=true;button.textContent='Создание...'}
  try{
    const r=await fetch('/api/topics',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},body:JSON.stringify({title:titleValue,category:categoryValue,content:contentValue})});
    const d=await r.json().catch(()=>({}));
    if(r.ok){form.reset();modal.classList.remove('show');await load()}
    else if(r.status===401||r.status===403)alert(d.error||'Недостаточно прав для создания темы');
    else alert(d.error||'Ошибка создания темы');
  }catch{alert('Не удалось соединиться с сервером.')}finally{if(button){button.disabled=false;button.textContent='Создать тему'}}
};

(async()=>{await refreshAuth();await load()})();
setInterval(load,30000);