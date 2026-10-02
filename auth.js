const STANDARD_NAV=[['index.html','Главная'],['server-info.html','⚔️ Сервер'],['forum.html','Форум'],['news.html','Новости'],['rules.html','Правила'],['donate.html','Донат'],['punishments.html','Блокировки'],['battlepass.html','🎟️ Battle Pass']];
function syncSiteNav(){const nav=document.querySelector('.topbar nav');if(!nav)return;const current=location.pathname.split('/').pop()||'index.html';nav.innerHTML=STANDARD_NAV.map(([href,label])=>'<a href="'+href+'"'+(current===href?' class="active"':'')+'>'+label+'</a>').join('')}
const TOKEN_KEY='epmToken',USER_KEY='epmUser';
function getToken(){return localStorage.getItem(TOKEN_KEY)||''}
function getUser(){try{return JSON.parse(localStorage.getItem(USER_KEY)||'null')}catch{return null}}
function saveSession(data){if(!data?.token||!data?.user)return;const user=data.user;localStorage.setItem(TOKEN_KEY,data.token);localStorage.setItem(USER_KEY,JSON.stringify(user));localStorage.setItem('user',JSON.stringify(user))}
function escapeHtml(s=''){return String(s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]))}
function logout(){const t=getToken();fetch('/api/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+t}}).catch(()=>{});localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(USER_KEY);localStorage.removeItem('user');location.href='index.html'}
function syncHeader(user){const box=document.querySelector('.account-links');if(!box)return;if(!user){box.innerHTML='<a href="login.html">Войти</a><a class="account-register" href="register.html">Регистрация</a>';return}box.innerHTML=`<a href="profile.html" class="profile-header-link">${escapeHtml(user.nickname||'Профиль')}</a><a class="account-register logout-header-link" href="#">Выйти</a>`;box.querySelector('.logout-header-link')?.addEventListener('click',e=>{e.preventDefault();logout()})}
async function restoreSession(){const token=getToken(),cached=getUser();if(!token){syncHeader(null);window.epmUser=null;return null}try{const r=await fetch('/api/auth/me',{headers:{Authorization:'Bearer '+token},cache:'no-store'});if(r.ok){const d=await r.json();const user=d.user;saveSession({token,user});syncHeader(user);window.epmUser=user;return user}if(r.status===401||r.status===403){localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(USER_KEY);localStorage.removeItem('user');syncHeader(null);window.epmUser=null;return null}}catch{}if(cached){saveSession({token,user:cached});syncHeader(cached);window.epmUser=cached;return cached}syncHeader(null);window.epmUser=null;return null}
async function setupAuth(mode){const form=document.getElementById('form'),error=document.getElementById('error');if(!form)return;form.onsubmit=async e=>{e.preventDefault();error.textContent='';const nickname=document.getElementById('nickname').value.trim(),password=document.getElementById('password').value;if(mode==='register'&&password!==document.getElementById('confirm').value){error.textContent='Пароли не совпадают';return}try{const r=await fetch('/api/auth/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname,password})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Произошла ошибка');saveSession(d);location.href='profile.html'}catch(err){error.textContent=err.message||'Сервер недоступен'}}}
async function setupGoogleAuth(buttonId='googleAuthButton'){
  const button=document.getElementById(buttonId); if(!button)return;
  try{
    const cfg=await fetch('/api/auth/google/config',{cache:'no-store'}).then(r=>r.json());
    if(!cfg.clientId){button.disabled=true;button.title='Вход через Google не настроен';return;}
    await new Promise((resolve,reject)=>{
      if(window.google?.accounts?.id)return resolve();
      const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;script.onload=resolve;script.onerror=reject;document.head.appendChild(script);
    });
    google.accounts.id.initialize({client_id:cfg.clientId,callback:async response=>{
      const error=document.getElementById('error');if(error)error.textContent='';
      button.disabled=true;button.textContent='Подключение Google...';
      try{
        const r=await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:response.credential})});
        const d=await r.json();if(!r.ok)throw new Error(d.error||'Ошибка Google');
        saveSession(d);location.href='profile.html';
      }catch(e){if(error)error.textContent=e.message||'Не удалось войти через Google';button.disabled=false;button.textContent='Продолжить с Google';}
    },auto_select:false});
    google.accounts.id.renderButton(button,{theme:'outline',size:'large',shape:'rectangular',width:360,text:'continue_with',logo_alignment:'left'});
  }catch{button.disabled=true}
}
document.addEventListener('DOMContentLoaded',()=>{syncSiteNav();restoreSession()});window.EPMAuth={getToken,getUser,saveSession,restoreSession,logout,syncHeader,syncSiteNav};