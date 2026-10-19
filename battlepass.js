(()=>{
const rewards=[
{level:1,icon:'🪙',name:'Стартовый капитал',desc:'10 000 игровой валюты на выбранном режиме.',kind:'$10,000'},
{level:2,icon:'🪵',name:'Набор строителя',desc:'Доски, камень и факелы.',kind:'Набор'},
{level:3,icon:'🥕',name:'Запас провизии',desc:'Еда для первых приключений.',kind:'Набор'},
{level:4,icon:'⛏️',name:'Железный инструмент',desc:'Железная кирка для шахты.',kind:'Предмет'},
{level:5,icon:'🪙',name:'Монеты шахтёра',desc:'15 000 игровой валюты.',kind:'$15,000'},
{level:6,icon:'🛡️',name:'Щит исследователя',desc:'Щит для дальних вылазок.',kind:'Предмет'},
{level:7,icon:'💎',name:'Алмазная находка',desc:'Два алмаза.',kind:'Ресурсы'},
{level:8,icon:'🧪',name:'Зелья скорости',desc:'Золотые яблоки для путешествий.',kind:'Предметы'},
{level:9,icon:'🪙',name:'Кошелёк авантюриста',desc:'20 000 игровой валюты.',kind:'$20,000'},
{level:10,icon:'🔥',name:'Огненный след',desc:'Фейерверки для приключений.',kind:'Предметы'},
{level:11,icon:'🍯',name:'Мёд и сытость',desc:'Бутылочки мёда.',kind:'Набор'},
{level:12,icon:'🧱',name:'Набор строителя II',desc:'Материалы для базы.',kind:'Набор'},
{level:13,icon:'🪙',name:'Клад искателя',desc:'25 000 игровой валюты.',kind:'$25,000'},
{level:14,icon:'🏹',name:'Лук следопыта',desc:'Лук и стрелы.',kind:'Предметы'},
{level:15,icon:'✨',name:'Чары путешественника',desc:'Бутылочки опыта.',kind:'Набор'},
{level:16,icon:'🐺',name:'Друг волка',desc:'Кости для приручения.',kind:'Предметы'},
{level:17,icon:'🪙',name:'Золотой запас',desc:'35 000 игровой валюты.',kind:'$35,000'},
{level:18,icon:'🧭',name:'Компас искателя',desc:'Компас для исследований.',kind:'Предмет'},
{level:19,icon:'💠',name:'Аметистовый набор',desc:'Аметистовые осколки.',kind:'Ресурсы'},
{level:20,icon:'👑',name:'Grief — мини-привилегия',desc:'Привилегия группы Lite, если она настроена на сервере.',kind:'Привилегия'},
{level:21,icon:'🪙',name:'Казна исследователя',desc:'50 000 игровой валюты.',kind:'$50,000'},
{level:22,icon:'🐎',name:'Всадник',desc:'Седло для путешествий.',kind:'Предмет'},
{level:23,icon:'🧰',name:'Редкий набор',desc:'Сундуки и железо.',kind:'Набор'},
{level:24,icon:'💎',name:'Алмазный запас',desc:'Восемь алмазов.',kind:'Ресурсы'},
{level:25,icon:'🪙',name:'Богатство шахт',desc:'75 000 игровой валюты.',kind:'$75,000'},
{level:26,icon:'🪽',name:'Крылья Энда',desc:'Элитры.',kind:'Предмет'},
{level:27,icon:'🧿',name:'Талисман исследователя',desc:'Око Эндера.',kind:'Предметы'},
{level:28,icon:'🪙',name:'Сундук сокровищ',desc:'100 000 игровой валюты.',kind:'$100,000'},
{level:29,icon:'🐉',name:'Покоритель дракона',desc:'Привилегия группы Legend, если она настроена.',kind:'Привилегия'},
{level:30,icon:'🏆',name:'Легенда EPM',desc:'150 000 игровой валюты.',kind:'$150,000'}
];
const premiumRewards=[
{level:3,icon:'✨',name:'Аура незера',desc:'Звезда Незера.',kind:'Предмет'},
{level:6,icon:'🪙',name:'Золотой запас',desc:'10 000 игровой валюты.',kind:'$10,000'},
{level:9,icon:'🛡️',name:'Реликтовый комплект',desc:'Зачарованные золотые яблоки.',kind:'Набор'},
{level:12,icon:'💜',name:'Премиум-привилегия',desc:'Привилегия группы Premium.',kind:'Привилегия'},
{level:15,icon:'💎',name:'Кристаллы сезона',desc:'Шестнадцать алмазов.',kind:'Ресурсы'},
{level:18,icon:'🔥',name:'Пламенный след',desc:'Порошок ифрита.',kind:'Предметы'},
{level:21,icon:'👑',name:'Королевский набор',desc:'Тотем бессмертия.',kind:'Предмет'},
{level:24,icon:'🌌',name:'Звёздный эффект',desc:'Шалкеровый ящик.',kind:'Предмет'},
{level:27,icon:'🐉',name:'Драконий титул',desc:'Привилегия группы Dragon.',kind:'Привилегия'},
{level:30,icon:'🏆',name:'EPM Premium Legend',desc:'Привилегия Premium Legend.',kind:'Привилегия'}
];
const state={xp:0,level:1,premium:false,claims:[]};
const modeEl=document.getElementById('rewardMode');
const token=()=>localStorage.getItem('epmToken')||'';
const claimed=(track,level)=>state.claims.some(c=>c.track===track&&Number(c.level)===level&&c.mode===modeEl.value&&c.status!=='failed');
function toast(s){const el=document.getElementById('toast');el.textContent=s;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),3200)}
async function loadState(){
 if(!token()){toast('Войди в аккаунт EPM, чтобы получать награды.');render();return}
 try{
  const response=await fetch('/api/battlepass/state',{headers:{Authorization:'Bearer '+token()},cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Не удалось загрузить прогресс');
  state.xp=Number(data.xp)||0;state.level=Number(data.level)||1;state.premium=Boolean(data.premium);state.claims=Array.isArray(data.claims)?data.claims:[];
  render();
 }catch(error){toast(error.message||'Ошибка загрузки Battle Pass');render()}
}
function render(){
 const lv=state.level,within=lv===30?1000:state.xp%1000;
 document.getElementById('level').textContent=lv;
 document.getElementById('xpText').textContent=within+' / 1000 XP';
 document.getElementById('nextText').textContent=lv===30?'Максимальный уровень':'До уровня '+(lv+1);
 document.getElementById('progress').style.width=(lv===30?100:within/10)+'%';
 document.getElementById('balance').textContent='В игре';
 document.getElementById('claimedCount').textContent=state.claims.length;
 document.getElementById('rewards').innerHTML=rewards.map(r=>{
  const unlocked=lv>=r.level,wasClaimed=claimed('free',r.level);
  return '<article class="bp-reward '+(!unlocked?'locked ':'')+(wasClaimed?'claimed':'')+'"><div class="bp-reward-top"><span class="bp-tier">УРОВЕНЬ '+String(r.level).padStart(2,'0')+'</span><div class="bp-icon">'+r.icon+'</div></div><h3>'+r.name+'</h3><p>'+r.desc+'</p><div class="bp-reward-foot"><strong>'+r.kind+'</strong><button class="bp-btn '+(unlocked&&!wasClaimed?'primary':'')+'" data-claim="'+r.level+'" '+(!unlocked||wasClaimed?'disabled':'')+'>'+(wasClaimed?'В очереди / получено':unlocked?'Забрать':'🔒 Закрыто')+'</button></div></article>'
 }).join('');
 document.querySelectorAll('[data-claim]').forEach(b=>b.onclick=()=>claim('free',Number(b.dataset.claim)));
 document.getElementById('claimAll').disabled=!token();
 const premiumRoot=document.getElementById('premiumRewards');
 premiumRoot.innerHTML=premiumRewards.map(r=>{
  const unlocked=lv>=r.level,wasClaimed=claimed('premium',r.level),disabled=!state.premium||!unlocked||wasClaimed;
  const label=!state.premium?'После активации':wasClaimed?'В очереди / получено':unlocked?'Забрать':'🔒 Закрыто';
  return '<article class="bp-premium-reward"><div class="bp-reward-top"><span class="bp-tier">УРОВЕНЬ '+String(r.level).padStart(2,'0')+'</span><div class="bp-icon">'+r.icon+'</div></div><h3>'+r.name+'</h3><p>'+r.desc+'</p><div class="bp-reward-foot"><strong>'+r.kind+'</strong><button class="bp-btn '+(!disabled?'primary':'')+'" data-premium-claim="'+r.level+'" '+(disabled?'disabled':'')+'>'+label+'</button></div></article>'
 }).join('');
 document.querySelectorAll('[data-premium-claim]').forEach(b=>b.onclick=()=>claim('premium',Number(b.dataset.premiumClaim)));
}
async function claim(track,level){
 if(!token()){toast('Сначала войди в аккаунт EPM.');return}
 const button=document.querySelector((track==='free'?'[data-claim="':'[data-premium-claim="')+level+'"]');
 if(button){button.disabled=true;button.textContent='Отправка…'}
 try{
  const response=await fetch('/api/battlepass/claim',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},body:JSON.stringify({track,level,mode:modeEl.value}),cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Не удалось запросить награду');
  state.claims.push({track,level,mode:modeEl.value,status:'queued'});
  render();toast('Награда поставлена в очередь. Зайди на '+modeEl.value+'.');
 }catch(error){if(button){button.disabled=false;button.textContent='Забрать'}toast(error.message||'Ошибка выдачи награды');await loadState()}
}
document.getElementById('claimAll').addEventListener('click',async()=>{
 const available=rewards.filter(r=>r.level<=state.level&&!claimed('free',r.level));
 if(!available.length){toast('Нет новых наград на выбранном режиме.');return}
 for(const reward of available)await claim('free',reward.level);
});
modeEl.addEventListener('change',render);
render();
loadState();
function renderPremiumModal(){
 const buyPremium=document.getElementById('buyPremium'),modal=document.getElementById('premiumModal'),close=document.getElementById('closePremiumModal');
 function open(){if(!modal)return;modal.hidden=false;document.body.style.overflow='hidden';close?.focus()}
 function hide(){if(!modal)return;modal.hidden=true;document.body.style.overflow='';buyPremium?.focus()}
 buyPremium?.addEventListener('click',open);close?.addEventListener('click',hide);
 document.getElementById('premiumNotReady')?.addEventListener('click',hide);
 modal?.addEventListener('click',e=>{if(e.target===modal)hide()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal&&!modal.hidden)hide()});
}
renderPremiumModal();
})();