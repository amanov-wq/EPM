const topicsEl=document.getElementById('topics');
const modal=document.getElementById('modal');
const form=document.getElementById('topicForm');
const guestGate=document.getElementById('guestGate');
let current='Все';
let topics=[];
const token=()=>localStorage.getItem('epmToken');
const isLoggedIn=()=>Boolean(token());

function openAction(){
  modal.classList.add('show');
  const logged=isLoggedIn();
  guestGate.style.display=logged?'none':'block';
  form.style.display=logged?'block':'none';
}

async function load(){
  try{
    const r=await fetch('/api/topics');
    if(!r.ok) throw new Error();
    topics=await r.json();
    render();
  }catch{
    topicsEl.innerHTML='<div class="forum-empty">Не удалось загрузить форум.<br>Проверьте, запущен ли сервер.</div>';
  }
}

function render(){
  const list=current==='Все'?topics:topics.filter(t=>t.category===current);
  if(!list.length){
    topicsEl.innerHTML='<div class="forum-empty">В этом разделе пока нет тем.<br>Создай первую тему.</div>';
    return;
  }
  topicsEl.innerHTML=list.map(t=>`
    <a class="forum-topic" href="topic.html?id=${encodeURIComponent(t.id)}">
      <div>
        <h3>${t.pinned?'📌 ':''}${esc(t.title)}</h3>
        <p>${esc(t.category)} · ${esc(t.author)} · ${time(t.updatedAt||t.createdAt)}</p>
      </div>
      <div class="forum-topic-meta">
        <div><b>${t.repliesCount||0}</b> ответов</div>
        <div><b>${t.views||0}</b> просмотров</div>
      </div>
    </a>`).join('');
}

function esc(s=''){
  return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function time(v){
  if(!v) return '';
  return new Date(v).toLocaleDateString('ru-RU');
}

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
  if(!isLoggedIn()){openAction();return;}
  const titleValue=document.getElementById('title').value;
  const categoryValue=document.getElementById('category').value;
  const contentValue=document.getElementById('content').value;
  try{
    const r=await fetch('/api/topics',{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},
      body:JSON.stringify({title:titleValue,category:categoryValue,content:contentValue})
    });
    if(r.ok){form.reset();modal.classList.remove('show');load();}
    else alert((await r.json()).error||'Ошибка');
  }catch{alert('Не удалось соединиться с сервером.');}
};

load();
