document.documentElement.classList.add('epm-auth-ready');
const STANDARD_NAV=[['index.html','Главная'],['forum.html','Форум'],['news.html','Новости'],['rules.html','Правила'],['donate.html','Донат'],['punishments.html','Блокировки'],['server-info.html','Сервер'],['battlepass.html','Battle Pass'],['search.html','Поиск']];
const TOKEN_KEY='epmToken',USER_KEY='epmUser';
function getToken(){return localStorage.getItem(TOKEN_KEY)||''}
function getUser(){try{return JSON.parse(localStorage.getItem(USER_KEY)||'null')}catch{return null}}
function saveSession(d){if(d?.token&&d?.user){localStorage.setItem(TOKEN_KEY,d.token);localStorage.setItem(USER_KEY,JSON.stringify(d.user));localStorage.setItem('user',JSON.stringify(d.user))}}
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function syncHeader(u){const b=document.querySelector('.account-links');if(!b)return;if(!u){b.innerHTML='<a href="login.html">Войти</a><a class="account-register" href="register.html">Регистрация</a>';return}b.innerHTML='<button type="button" class="epm-notify-button" id="epmNotifyButton" aria-label="Уведомления">🔔<span class="epm-notify-count" id="epmNotifyCount">0</span></button><a href="profile.html" class="profile-header-link">Профиль</a><a class="account-register logout-header-link" href="#">Выйти</a>';b.querySelector('.logout-header-link').onclick=e=>{e.preventDefault();logout()};setupNotifications()}
function syncSiteNav(){const n=document.querySelector('.topbar nav');if(!n)return;const c=location.pathname.split('/').pop()||'index.html';n.innerHTML=STANDARD_NAV.map(x=>'<a href="'+x[0]+'"'+(c===x[0]?' class="active"':'')+'>'+x[1]+'</a>').join('');installMobileMenu()}
function logout(){fetch('/api/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+getToken()}}).catch(()=>{});localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(USER_KEY);localStorage.removeItem('user');clearInterval(window.__epmPresenceTimer);clearInterval(window.__epmNotifyTimer);location.href='index.html'}
async function restoreSession(){const t=getToken(),cached=getUser();if(!t){syncHeader(null);window.epmUser=null;return null}try{const r=await fetch('/api/auth/me',{headers:{Authorization:'Bearer '+t},cache:'no-store'});if(r.ok){const d=await r.json();saveSession({token:t,user:d.user});syncHeader(d.user);window.epmUser=d.user;startPresence();return d.user}if(r.status===401||r.status===403){localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(USER_KEY);localStorage.removeItem('user');syncHeader(null);window.epmUser=null;return null}}catch{}if(cached){syncHeader(cached);window.epmUser=cached;startPresence();return cached}syncHeader(null);window.epmUser=null;return null}
async function startPresence(){if(window.__epmPresenceTimer)return;const beat=async()=>{try{await fetch('/api/presence/heartbeat',{method:'POST',headers:{Authorization:'Bearer '+getToken()},cache:'no-store',keepalive:true})}catch{}};await beat();window.__epmPresenceTimer=setInterval(beat,30000)}
async function setupAuth(mode){
  const form=document.getElementById('form'),error=document.getElementById('error');
  if(!form)return;
  const submit=form.querySelector('[type="submit"]');
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(submit?.disabled)return;
    error.textContent='';
    const nickname=document.getElementById('nickname').value.trim();
    const password=document.getElementById('password').value;
    if(mode==='register'&&password!==document.getElementById('confirm').value){error.textContent='Пароли не совпадают';document.getElementById('confirm').focus();return;}
    if(!nickname||!password){error.textContent='Заполни ник и пароль.';return;}
    if(mode==='register'&&(password.length<6||password.length>128)){error.textContent='Пароль должен содержать от 6 до 128 символов.';return;}
    if(submit){submit.disabled=true;submit.dataset.originalText=submit.textContent;submit.textContent=mode==='login'?'Входим…':'Создаём аккаунт…';}
    form.setAttribute('aria-busy','true');
    try{
      const response=await fetch('/api/auth/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname,password,confirmPassword:mode==='register'?document.getElementById('confirm').value:undefined}),cache:'no-store'});
      let data={};try{data=await response.json()}catch{}
      if(!response.ok)throw new Error(data.error||'Не удалось выполнить запрос.');
      if(!data.token||!data.user)throw new Error('Сервер вернул некорректный ответ. Попробуй ещё раз.');
      saveSession(data);
      await startPresence();
      location.replace('profile.html');
    }catch(err){
      error.textContent=err.message||'Сервер недоступен. Проверь соединение и попробуй ещё раз.';
      if(submit){submit.disabled=false;submit.textContent=submit.dataset.originalText|| (mode==='login'?'Войти в EPM':'Создать аккаунт');}
      form.removeAttribute('aria-busy');
    }
  });
}

async function setupGoogleAuth(buttonId='googleAuthButton') {
  const button = document.getElementById(buttonId);
  if (!button || button.dataset.ready === '1') return;
  button.dataset.ready = '1';
  const error = document.getElementById('error');
  try {
    const configResponse = await fetch('/api/auth/google/config', { cache: 'no-store' });
    const config = await configResponse.json();
    if (!configResponse.ok || !config.clientId) {
      button.textContent = 'Вход через Google временно недоступен';
      if (error) error.textContent = 'На сервере не настроен вход через Google.';
      return;
    }
    await new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) return resolve();
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Не удалось загрузить Google Sign-In'));
      document.head.appendChild(script);
    });
    window.google.accounts.id.initialize({
      client_id: config.clientId,
      callback: async response => {
        if (error) error.textContent = '';
        button.setAttribute('aria-busy', 'true');
        try {
          const result = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential }),
            cache: 'no-store'
          });
          const data = await result.json().catch(() => ({}));
          if (!result.ok) throw new Error(data.error || 'Не удалось войти через Google');
          if (!data.token || !data.user) throw new Error('Сервер вернул некорректный ответ.');
          saveSession(data);
          await startPresence();
          location.replace('profile.html');
        } catch (e) {
          if (error) error.textContent = e.message || 'Не удалось войти через Google';
        } finally {
          button.removeAttribute('aria-busy');
        }
      },
      auto_select: false
    });
    window.google.accounts.id.renderButton(button, {
      theme: 'outline', size: 'large', shape: 'rectangular',
      width: Math.min(360, Math.max(240, Math.floor(button.getBoundingClientRect().width || 360))),
      text: 'continue_with', logo_alignment: 'left'
    });
  } catch (e) {
    button.textContent = 'Не удалось загрузить вход через Google';
    if (error) error.textContent = e.message || 'Проверь соединение и попробуй ещё раз.';
  }
}

function installMobileMenu(){const t=document.querySelector('.topbar'),n=document.querySelector('.topbar nav');if(!t||!n)return;let b=document.getElementById('epmMobileToggle'),p=document.getElementById('epmMobilePanel');if(!b){b=document.createElement('button');b.id='epmMobileToggle';b.className='epm-mobile-toggle';b.type='button';b.innerHTML='<span></span><span></span><span></span>';t.insertBefore(b,n);p=document.createElement('div');p.id='epmMobilePanel';p.className='epm-mobile-panel';p.innerHTML='<div class="epm-mobile-drawer"><div class="epm-mobile-panel-head"><b>EPM</b><button id="epmMobileClose" type="button">×</button></div><div class="epm-mobile-links"></div></div>';document.body.appendChild(p);b.onclick=()=>p.classList.add('show');p.querySelector('#epmMobileClose').onclick=()=>p.classList.remove('show');p.onclick=e=>{if(e.target===p)p.classList.remove('show')}}p.querySelector('.epm-mobile-links').innerHTML=n.innerHTML;p.querySelectorAll('a').forEach(a=>a.onclick=()=>p.classList.remove('show'))}
function setupNotifications(){const b=document.getElementById('epmNotifyButton');if(!b||b.dataset.ready)return;b.dataset.ready='1';const p=document.createElement('div');p.id='epmNotifyPanel';p.className='epm-notify-panel';p.innerHTML='<div class="epm-notify-head"><b>Уведомления</b><button id="epmNotifyRead" type="button">Прочитать всё</button></div><div id="epmNotifyList" class="epm-notify-list"><div class="epm-notify-empty">Уведомлений нет.</div></div>';document.body.appendChild(p);b.onclick=async e=>{e.stopPropagation();p.classList.toggle('show');if(p.classList.contains('show'))await loadNotifications()};p.querySelector('#epmNotifyRead').onclick=async()=>{await fetch('/api/notifications/read',{method:'POST',headers:{Authorization:'Bearer '+getToken()}}).catch(()=>{});loadNotifications()};loadNotifications();clearInterval(window.__epmNotifyTimer);window.__epmNotifyTimer=setInterval(loadNotifications,30000)}
let epmNotifyRequest=0;async function loadNotifications(){const l=document.getElementById('epmNotifyList'),c=document.getElementById('epmNotifyCount');if(!l)return;const t=typeof getToken==='function'?getToken():'';if(!t){l.innerHTML='<div class="epm-notify-empty">Войдите в аккаунт, чтобы увидеть уведомления.</div>';if(c)c.textContent='0';return}const request=++epmNotifyRequest;try{const r=await fetch('/api/notifications',{headers:{Authorization:'Bearer '+t},cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();if(request!==epmNotifyRequest)return;if(!d||!Array.isArray(d.notifications))throw new Error('Некорректный ответ');const items=d.notifications;const visibleUnread=items.filter(n=>!n.isRead).length;if(c)c.textContent=String(visibleUnread);l.innerHTML=items.map(n=>{const i=n.type==='topic_reply'?'💬':n.type==='mention'?'@':n.type==='admin_action'?'🛡️':n.type==='punishment'?'🔨':'👤';return '<a class="epm-notify-item '+(n.isRead?'':'unread')+'" href="'+escapeHtml(n.url||'#')+'"><span class="epm-notify-icon">'+i+'</span><span><b>'+escapeHtml(n.title||'Уведомление')+'</b><small>'+escapeHtml(n.body||'')+'</small><em>'+escapeHtml(new Date(n.createdAt).toLocaleString('ru-RU'))+'</em></span></a>'}).join('')||'<div class="epm-notify-empty">Уведомлений нет.</div>'}catch{if(request!==epmNotifyRequest)return;if(c)c.textContent='—';l.innerHTML='<div class="epm-notify-empty">Не удалось загрузить уведомления. Попробуйте ещё раз.</div>'}}
function ensureSocialsButton(){const h=document.querySelector('.topbar');if(!h||h.querySelector('.socials-nav-standalone'))return;const a=document.createElement('a');a.className='socials-nav-standalone';a.href='socials.html';a.textContent='Соцсети';const account=h.querySelector('.account-links');if(account)h.insertBefore(a,account);else h.appendChild(a)}
document.addEventListener('DOMContentLoaded',()=>{ensureSocialsButton();syncSiteNav();syncHeader(getUser());restoreSession()});if(document.readyState!=='loading'){ensureSocialsButton();syncSiteNav();syncHeader(getUser());restoreSession()}window.EPMAuth={getToken,getUser,saveSession,restoreSession,logout,syncHeader,syncSiteNav,startPresence};