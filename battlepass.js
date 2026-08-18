const KEY='epmBattlePass';
const rewards=[
['1','🪙','Старт','Открыто'],['2','⛏️','Ресурсы','10 монет'],['3','🛡️','Защита','Награда'],['4','💎','Кристалл','15 монет'],['5','🎁','Ящик','Обычный'],
['6','⚔️','Оружие','Награда'],['7','🪙','Монеты','25 монет'],['8','🧱','Строитель','Награда'],['9','💎','Кристалл','30 монет'],['10','👑','Elite','Особая награда'],
['11','🔥','Огонь','Награда'],['12','🎁','Ящик','Редкий'],['13','🪙','Монеты','40 монет'],['14','⚡','Энергия','Награда'],['15','🏆','Champion','Особая награда'],
['16','💎','Алмаз','Награда'],['17','🛡️','Страж','Награда'],['18','🪙','Монеты','60 монет'],['19','🎁','Ящик','Эпический'],['20','👑','EPM Master','Финальная награда']
];
function getState(){try{return JSON.parse(localStorage.getItem(KEY))||{xp:0,level:1}}catch{return {xp:0,level:1}}}
function render(){const s=getState(),xp=Math.max(0,s.xp||0),level=Math.min(20,Math.floor(xp/100)+1),inside=level>=20?100:xp%100;document.getElementById('levelText').textContent='Уровень '+level;document.getElementById('xpText').textContent=(level>=20?100:inside)+' / 100 XP';document.getElementById('fill').style.width=(level>=20?100:inside)+'%';document.getElementById('rewards').innerHTML=rewards.map(r=>{const n=+r[0],open=n<=level;return `<article class="reward ${n===10||n===15||n===20?'premium ':''}${open?'':'locked'}"><span class="reward-num">УРОВЕНЬ ${n}</span><div class="reward-icon">${r[1]}</div><b>${r[2]}</b><small>${open?'✓ '+r[3]:'🔒 Заблокировано'}</small></article>`}).join('')}
render();