document.documentElement.classList.add('epm-auth-ready');
const STANDARD_NAV=[['index.html','Главная'],['forum.html','Форум'],['news.html','Новости'],['rules.html','Правила'],['donate.html','Донат'],['punishments.html','Блокировки'],['server-info.html','Сервер']];
const TOKEN_KEY='epmToken',USER_KEY='epmUser';
function getToken(){return localStorage.getItem(TOKEN_KEY)||''}
function getUser(){try{return JSON.parse(localStorage.getItem(USER_KEY)||'null')}catch{return null}}
function saveSession(data){if(!data?.token||!data?.user)return;const user=data.user;localStorage.setItem(TOKEN_KEY,data.token);localStorage.setItem(USER_KEY,JSON.stringify(user));localStorage.setItem('user',JSON.stringify(user))}
function escapeHtml(s=''){return String(s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]))}
function syncHeader(user){
  const box=document.querySelector('.account-links');if(!box)return;
  if(!user){box.innerHTML='<a href="login.html">Войти</a><a class="account-register" href="register.html">Регистрация</a>';return}
  box.innerHTML='<button type="button" class="epm-notify-button" id="epmNotifyButton" aria-label="Уведомления">🔔<span class="epm-notify-count" id="epmNotifyCount">0</span></button><a href="profile.html" class="profile-header-link">Профиль</a><a class="account-register logout-header-link" href="#">Выйти</a>';
  box.querySelector('.logout-header-link')?.addEventListener('click',e=>{e.preventDefault();logout()});setupNotifications();
}
function syncSiteNav(){
  const nav=document.querySelector('.topbar nav');if(!nav)return;const current=location.pathname.split('/').pop()||'index.html';
  nav.innerHTML=STANDARD_NAV.map(([href,label])=>'<a href="'+href+'"'+(current===href?' class="active"':'')+'>'+label+'</a>').join('');installMobileMenu();
}
function logout(){const t=getToken();fetch('/api/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+t}}).catch(()=>{});localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(USER_KEY);localStorage.removeItem('user');if(window.__epmPresenceTimer)clearInterval(window.__epmPresenceTimer);location.href='index.html'}
async function restoreSession(){const token=getToken(),cached=getUser();if(!token){syncHeader(null);window.epmUser=null;return null}try{const r=await fetch('/api/auth/me',{headers:{Authorization:'Bearer '+token},cache:'no-store'});if(r.ok){const d=await r.json();const user=d.user;saveSession({token,user});syncHeader(user);window.epmUser=user;startPresence();return user}if(r.status===401||r.status===403){localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(USER_KEY);localStorage.removeItem('user');syncHeader(null);window.epmUser=null;return null}}catch{}if(cached){saveSession({token,user:cached});syncHeader(cached);window.epmUser=cached;startPresence();return cached}syncHeader(null);window.epmUser=null;return null}
async function startPresence(){if(window.__epmPresenceTimer)return;const beat=async()=>{const t=getToken();if(!t)return;try{await fetch('/api/presence/heartbeat',{method:'POST',headers:{Authorization:'Bearer '+t},cache:'no-store',keepalive:true})}catch{}};await beat();window.__epmPresenceTimer=setInterval(beat,30000);window.addEventListener('pagehide',beat,{once:true})}
async function setupAuth(mode){const form=document.getElementById('form'),error=document.getElementById('error');if(!form)return;form.onsubmit=async e=>{e.preventDefault();error.textContent='';const nickname=document.getElementById('nickname').value.trim(),password=document.getElementById('password').value;if(mode==='register'&&password!==document.getElementById('confirm').value){error.textContent='Пароли не совпадают';return}try{const r=await fetch('/api/auth/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname,password})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Произошла ошибка');saveSession(d);startPresence();location.href='profile.html'}catch(err){error.textContent=err.message||'Сервер недоступен'}}}
function installMobileMenu(){
  const top=document.querySelector('.topbar'),nav=document.querySelector('.topbar nav');if(!top||!nav)return;let btn=document.getElementById('epmMobileToggle'),panel=document.getElementById('epmMobilePanel');
  if(!btn){btn=document.createElement('button');btn.id='epmMobileToggle';btn.className='epm-mobile-toggle';btn.type='button';btn.innerHTML='<span></span><span></span><span></span>';top.insertBefore(btn,nav);panel=document.createElement('div');panel.id='epmMobilePanel';panel.className='epm-mobile-panel';panel.innerHTML='<div class="epm-mobile-drawer"><div class="epm-mobile-panel-head"><b>EPM</b><button type="button" id="epmMobileClose">×</button></div><div class="epm-mobile-links"></div></div>';document.body.appendChild(panel);btn.onclick=()=>panel.classList.add('show');panel.querySelector('#epmMobileClose').onclick=()=>panel.classList.remove('show');panel.onclick=e=>{if(e.target===panel)panel.classList.remove('show')}}
  panel.querySelector('.epm-mobile-links').innerHTML=nav.innerHTML;panel.querySelectorAll('a').forEach(x=>x.onclick=()=>panel.classList.remove('show'));
}
function setupNotifications(){
  const btn=document.getElementById('epmNotifyButton');if(!btn||btn.dataset.ready)return;btn.dataset.ready='1';const wrap=document.createElement('div');wrap.id='epmNotifyPanel';wrap.className='epm-notify-panel';
  wrap.innerHTML='<div class="epm-notify-head"><b>Уведомления</b><button type="button" id="epmNotifyRead">Прочитать всё</button></div><div id="epmNotifyList" class="epm-notify-list"><div class="epm-notify-empty">Загрузка...</div></div>';document.body.appendChild(wrap);
  btn.onclick=async()=>{wrap.classList.toggle('show');if(wrap.classList.contains('show'))await loadNotifications()};wrap.querySelector('#epmNotifyRead').onclick=async()=>{try{await fetch('/api/notifications/read',{method:'POST',headers:{Authorization:'Bearer '+getToken()}});await loadNotifications()}catch{}};loadNotifications();
}
async function loadNotifications(){
  const list=document.getElementById('epmNotifyList'),count=document.getElementById('epmNotifyCount');if(!list)return;try{const r=await fetch('/api/notifications',{headers:{Authorization:'Bearer '+getToken()},cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error();if(count)count.textContent=String(d.unread||0);list.innerHTML=(d.notifications||[]).map(n=>'<a class="epm-notify-item '+(n.isRead?'':'unread')+'" href="'+escapeHtml(n.url||'#')+'"><span class="epm-notify-icon">'+(n.type==='topic_reply'?'💬':'👤')+'</span><span><b>'+escapeHtml(n.title||'Уведомление')+'</b><small>'+escapeHtml(n.body||'')+'</small><em>'+escapeHtml(new Date(n.createdAt).toLocaleString('ru-RU'))+'</em></span></a>').join('')||'<div class="epm-notify-empty">Уведомлений нет.</div>'}catch{if(count)count.textContent='0';list.innerHTML='<div class="epm-notify-empty">Уведомления временно недоступны.</div>'}
}

document.addEventListener('DOMContentLoaded',()=>{syncSiteNav();syncHeader(getUser());restoreSession()});if(document.readyState!=='loading'){syncSiteNav();syncHeader(getUser());restoreSession()}
window.EPMAuth={getToken,getUser,saveSession,restoreSession,logout,syncHeader,syncSiteNav};
