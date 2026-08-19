const BASE_KEY='epmBattlePass';
const PREMIUM_KEY='epmPremiumBattlePass';
const MAX_LEVEL=20;
const XP_PER_LEVEL=100;
const MAX_XP=MAX_LEVEL*XP_PER_LEVEL;
const rewards=[['1','🪙','Старт','10 монет'],['2','⛏️','Ресурсы','Набор ресурсов'],['3','🛡️','Защита','Защитный набор'],['4','💎','Кристалл','15 монет'],['5','🎁','Ящик','Обычный ящик'],['6','⚔️','Оружие','Боевой набор'],['7','🪙','Монеты','25 монет'],['8','🧱','Строитель','Набор строителя'],['9','💎','Кристалл','30 монет'],['10','👑','Elite','Особая награда'],['11','🔥','Огонь','Огненный набор'],['12','🎁','Ящик','Редкий ящик'],['13','🪙','Монеты','40 монет'],['14','⚡','Энергия','Энергия EPM'],['15','🏆','Champion','Особая награда'],['16','💎','Алмаз','Алмазный набор'],['17','🛡️','Страж','Награда стража'],['18','🪙','Монеты','60 монет'],['19','🎁','Ящик','Эпический ящик'],['20','👑','EPM Master','Финальная награда']];
const premiumRewards=[['1','💎','Premium Start','20 монет'],['5','👑','Royal Kit','Королевский набор'],['10','🔥','Fire Title','Огненный титул'],['15','⚡','EPM Energy','Энергия EPM'],['20','🏆','EPM Legend','Легендарная награда']];

function currentUser(){try{return JSON.parse(localStorage.getItem('epmUser')||localStorage.getItem('user')||'null')}catch{return null}}
function storageKey(base){const u=currentUser();return u?.id?`${base}:${u.id}`:`${base}:guest`}
function levelFromXP(xp){return xp>=MAX_XP?MAX_LEVEL:Math.min(MAX_LEVEL,Math.floor(Math.max(0,xp)/XP_PER_LEVEL)+1)}
function defaultState(){return {xp:0,level:1,claimed:[],premiumClaimed:[]}}
function getState(){
  try{
    const raw=JSON.parse(localStorage.getItem(storageKey(BASE_KEY))||'null');
    if(!raw||typeof raw!=='object')return defaultState();
    const xp=Math.min(MAX_XP,Math.max(0,Number(raw.xp)||0));
    return {xp,level:levelFromXP(xp),claimed:Array.isArray(raw.claimed)?raw.claimed.map(Number):[],premiumClaimed:Array.isArray(raw.premiumClaimed)?raw.premiumClaimed.map(Number):[]};
  }catch{return defaultState()}
}
function saveState(state){
  state.xp=Math.min(MAX_XP,Math.max(0,Number(state.xp)||0));
  state.level=levelFromXP(state.xp);
  state.claimed=[...new Set((state.claimed||[]).map(Number))];
  state.premiumClaimed=[...new Set((state.premiumClaimed||[]).map(Number))];
  localStorage.setItem(storageKey(BASE_KEY),JSON.stringify(state));
  return state;
}
function premiumActive(){return localStorage.getItem(storageKey(PREMIUM_KEY))==='true'}

function render(){
  const s=getState(),level=s.level,inside=level>=MAX_LEVEL?100:s.xp%XP_PER_LEVEL;
  const a=document.getElementById('levelText'),b=document.getElementById('xpText'),fill=document.getElementById('fill'),list=document.getElementById('rewards');
  if(a)a.textContent='Уровень '+level;
  if(b)b.textContent=inside+' / 100 XP';
  if(fill)fill.style.width=inside+'%';
  if(list)list.innerHTML=rewards.map(r=>{
    const n=Number(r[0]),open=n<=level,claimed=s.claimed.includes(n);
    return `<article class="reward ${[10,15,20].includes(n)?'premium ':''}${open?'':'locked'} ${claimed?'claimed':''}"><span class="reward-num">УРОВЕНЬ ${n}</span><div class="reward-icon">${r[1]}</div><b>${r[2]}</b><small>${claimed?'✓ Получено':open?'Доступно':'🔒 Заблокировано'}</small>${open&&!claimed?`<button class="reward-claim" data-level="${n}">Забрать</button>`:''}</article>`;
  }).join('');
  list?.querySelectorAll('.reward-claim').forEach(btn=>btn.onclick=()=>claimReward(Number(btn.dataset.level),false));
  renderPremium(s,level);
  syncPremium();
}

function renderPremium(s,level){
  const box=document.getElementById('premiumRewards');
  if(!box)return;
  if(!premiumActive()){box.style.display='none';box.innerHTML='';return}
  box.style.display='grid';
  box.innerHTML=premiumRewards.map(r=>{
    const n=Number(r[0]),open=n<=level,claimed=s.premiumClaimed.includes(n);
    return `<article class="reward premium ${open?'':'locked'} ${claimed?'claimed':''}"><span class="reward-num">PREMIUM · LVL ${n}</span><div class="reward-icon">${r[1]}</div><b>${r[2]}</b><small>${claimed?'✓ Получено':open?'Доступно':'🔒 Заблокировано'}</small>${open&&!claimed?`<button class="reward-claim" data-level="${n}" data-premium="1">Забрать</button>`:''}</article>`;
  }).join('');
  box.querySelectorAll('.reward-claim').forEach(btn=>btn.onclick=()=>claimReward(Number(btn.dataset.level),true));
}

function claimReward(level,premium=false){
  const s=getState();
  if(!Number.isInteger(level)||level<1||level>MAX_LEVEL||level>s.level)return false;
  if(premium&&!premiumActive())return false;
  const key=premium?'premiumClaimed':'claimed';
  if(s[key].includes(level))return false;
  s[key].push(level);saveState(s);render();return true;
}

function addXP(amount){
  const n=Number(amount);
  if(!Number.isFinite(n)||n<=0)return getBattlePass();
  const s=getState();
  const before=s.xp;
  s.xp=Math.min(MAX_XP,before+n);
  saveState(s);render();
  if(s.xp!==before)window.dispatchEvent(new CustomEvent('epm:battlepass',{detail:{xp:s.xp,level:s.level}}));
  return getBattlePass();
}

function getBattlePass(){const s=getState();return {...s,level:s.level,premium:premiumActive()}}
function syncPremium(){
  const btn=document.getElementById('premiumBuy'),status=document.getElementById('premiumStatus');
  const active=premiumActive();
  if(btn){btn.textContent=active?'Премиум активен':'Премиум';btn.disabled=active}
  if(status)status.style.display=active?'block':'none';
}

function activatePremium(){
  const user=currentUser();
  if(!user){location.href='login.html';return false}
  if(premiumActive())return true;
  /* До подключения Lava Premium не продаём и не списываем деньги. */
  return false;
}

function enablePremiumForTesting(){
  const user=currentUser();
  if(!user?.id)return false;
  localStorage.setItem(storageKey(PREMIUM_KEY),'true');render();return true;
}

document.addEventListener('DOMContentLoaded',()=>{
  render();
  const btn=document.getElementById('premiumBuy');
  if(btn)btn.onclick=activatePremium;
});
window.addEventListener('storage',render);
window.addEventListener('epm:battlepass',render);
window.EPMBattlePass={getState:getBattlePass,addXP,claimReward,activatePremium,enablePremiumForTesting,render};