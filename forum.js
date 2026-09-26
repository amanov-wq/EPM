const topicsEl=document.getElementById('topics');
const modal=document.getElementById('modal');
const form=document.getElementById('topicForm');
const guestGate=document.getElementById('guestGate');
let topics=[],currentUser=null,profileCache=new Map();

const CATEGORY_NAMES={
 help:'Помощь',bugs:'Баг-репорты',knowledge:'База знаний',news:'Новости проекта',ideas:'Предложения по улучшению',
 team:'Команда проекта',server:'Информация о сервере',complaints_players:'Жалобы на игроков',
 complaints_team:'Жалобы на команду',punishments:'История Наказаний',blood:'Blood Shed World',
 grief:'EPM Grief',survival:'EPM Survival',creative:'EPM Creative'
};
const token=()=>typeof getToken==='function'?getToken():(localStorage.getItem('epmToken')||'');
async function refreshAuth(){try{currentUser=typeof restoreSession==='function'?await restoreSession():null}catch{currentUser=null}return currentUser}
async function getProfile(id){if(!id)return null;if(profileCache.has(String(id)))return profileCache.get(String(id));try{const r=await fetch('/api/profile/'+encodeURIComponent(id),{cache:'no-store'});if(!r.ok)return null;const d=await r.json();profileCache.set(String(id),d.user||null);return d.user||null}catch{return null}}
async function enrich(){await Promise.all([...new Set(topics.map(t=>t.authorId).filter(Boolean).map(String))].map(getProfile))}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function avatar(u){return u.avatar?'<img src="'+esc(u.avatar)+'" alt="">':esc((u.nickname||'EP').slice(0,2).toUpperCase())}
function time(v){if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('ru-RU',{day:'2-digit',month:'long',year:'numeric'})}
function userData(t){const u=t.authorId?profileCache.get(String(t.authorId)):null;return{nickname:u?.nickname||t.author||'Пользователь',role:u?.role||'Пользователь',avatar:u?.avatar||''}}
function render(){
 const params=new URLSearchParams(location.search); const key=params.get('category'); const selected=CATEGORY_NAMES[key]||null;
 let list=selected?topics.filter(t=>(t.category||'')===selected):topics;
 list=[...list].sort((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned))||new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0));
 document.getElementById('listTitle').textContent=selected?selected:'Последние темы';
 if(!list.length){topicsEl.innerHTML='<div class="forum-empty-new"><strong>'+esc(selected?('В разделе «'+selected+'» пока нет тем'):'Пока нет тем')+'</strong><span>Создай первую тему и начни обсуждение.</span></div>';return}
 topicsEl.innerHTML=list.map(t=>{const u=userData(t);return '<a class="forum-topic-new" href="topic.html?id='+encodeURIComponent(t.id)+'"><div class="forum-topic-avatar">'+avatar(u)+'</div><div class="forum-topic-main-new">'+(t.pinned?'<small style="color:#a99bd4">📌 Закреплено</small>':'')+'<strong>'+esc(t.title||'Без названия')+'</strong><small>'+esc(u.nickname)+' · '+esc(u.role)+' · '+time(t.updatedAt||t.createdAt)+'</small></div><div class="forum-topic-counts"><div><b>'+Number(t.repliesCount||0)+'</b><span>ОТВЕТОВ</span></div><div><b>'+Number(t.views||0)+'</b><span>ПРОСМОТРОВ</span></div></div></a>'}).join('');
}
function updateStats(){document.getElementById('topicCount').textContent=topics.length;document.getElementById('replyCount').textContent=topics.reduce((n,t)=>n+Number(t.repliesCount||0),0);document.getElementById('viewCount').textContent=topics.reduce((n,t)=>n+Number(t.views||0),0)}
async function load(){try{const r=await fetch('/api/topics',{cache:'no-store'});if(!r.ok)throw 0;const d=await r.json();topics=Array.isArray(d)?d:[];await enrich();updateStats();render()}catch{topicsEl.innerHTML='<div class="forum-empty-new"><strong>Не удалось загрузить форум</strong><span>Проверьте подключение к серверу.</span></div>'}}
async function openAction(){await refreshAuth();modal.classList.add('show');const logged=Boolean(currentUser);guestGate.style.display=logged?'none':'block';form.style.display=logged?'block':'none'}
document.getElementById('newTopic').onclick=openAction;
document.getElementById('closeGuest').onclick=()=>modal.classList.remove('show');
document.getElementById('cancel').onclick=()=>modal.classList.remove('show');
modal.onclick=e=>{if(e.target===modal)modal.classList.remove('show')};
form.onsubmit=async e=>{e.preventDefault();await refreshAuth();if(!currentUser){await openAction();return}const title=document.getElementById('title').value.trim(),category=document.getElementById('category').value,content=document.getElementById('content').value.trim();if(title.length<3||content.length<2)return;const btn=form.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Создание...';try{const r=await fetch('/api/topics',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},body:JSON.stringify({title,category,content})});const d=await r.json().catch(()=>({}));if(r.ok){form.reset();modal.classList.remove('show');await load()}else alert(d.error||'Ошибка создания темы')}catch{alert('Не удалось соединиться с сервером.')}finally{btn.disabled=false;btn.textContent='Создать тему'}};
(async()=>{await refreshAuth();await load()})();setInterval(load,30000);