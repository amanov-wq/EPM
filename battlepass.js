(()=>{
const KEY='epmBattlePassV2';
const rewards=[
{level:1,icon:'🪙',name:'Стартовый капитал',desc:'Игровая валюта для первых покупок.',kind:'$10,000',money:10000},
{level:2,icon:'🪵',name:'Набор строителя',desc:'Дубовые доски, камень и факелы.',kind:'Набор'},
{level:3,icon:'🥕',name:'Запас провизии',desc:'Еда для первых приключений.',kind:'Набор'},
{level:4,icon:'⛏️',name:'Железный инструмент',desc:'Железная кирка для шахты.',kind:'Предмет'},
{level:5,icon:'🪙',name:'Монеты шахтёра',desc:'Пополнение игрового баланса.',kind:'$15,000',money:15000},
{level:6,icon:'🛡️',name:'Щит исследователя',desc:'Защита для дальних вылазок.',kind:'Предмет'},
{level:7,icon:'💎',name:'Алмазная находка',desc:'Небольшой набор алмазов.',kind:'Ресурсы'},
{level:8,icon:'🧪',name:'Зелья скорости',desc:'Пара зелий для путешествий.',kind:'Зелья'},
{level:9,icon:'🪙',name:'Кошелёк авантюриста',desc:'Ещё немного валюты на рынке.',kind:'$20,000',money:20000},
{level:10,icon:'🔥',name:'Огненный след',desc:'Редкий декоративный титул профиля.',kind:'Титул'},
{level:11,icon:'🍯',name:'Мёд и сытость',desc:'Набор еды и полезных мелочей.',kind:'Набор'},
{level:12,icon:'🧱',name:'Набор строителя II',desc:'Материалы для уютной базы.',kind:'Набор'},
{level:13,icon:'🪙',name:'Клад искателя',desc:'Валюта для торговли.',kind:'$25,000',money:25000},
{level:14,icon:'🏹',name:'Лук следопыта',desc:'Лук и стрелы для приключений.',kind:'Предметы'},
{level:15,icon:'✨',name:'Чары путешественника',desc:'Опыт и расходники для зачарования.',kind:'Набор'},
{level:16,icon:'🐺',name:'Друг волка',desc:'Косметический значок покорителя лесов.',kind:'Значок'},
{level:17,icon:'🪙',name:'Золотой запас',desc:'Валюта для аукциона и магазинов.',kind:'$35,000',money:35000},
{level:18,icon:'🧭',name:'Компас искателя',desc:'Полезный предмет для исследований.',kind:'Предмет'},
{level:19,icon:'💠',name:'Аметистовый набор',desc:'Аметистовые блоки для декора.',kind:'Ресурсы'},
{level:20,icon:'👑',name:'Grief — мини-привилегия',desc:'Недорогая донат-награда режима EPM Grief.',kind:'Grief · Lite',donate:true},
{level:21,icon:'🪙',name:'Казна исследователя',desc:'Крупное пополнение баланса.',kind:'$50,000',money:50000},
{level:22,icon:'🐎',name:'Всадник',desc:'Косметический титул для профиля.',kind:'Титул'},
{level:23,icon:'🧰',name:'Редкий набор',desc:'Полезные материалы для базы.',kind:'Набор'},
{level:24,icon:'💎',name:'Алмазный запас',desc:'Ресурсы для продвинутого крафта.',kind:'Ресурсы'},
{level:25,icon:'🪙',name:'Богатство шахт',desc:'Валюта для крупных покупок.',kind:'$75,000',money:75000},
{level:26,icon:'🪽',name:'Крылья Энда',desc:'Косметическая награда сезона.',kind:'Косметика'},
{level:27,icon:'🧿',name:'Талисман исследователя',desc:'Коллекционный предмет.',kind:'Коллекция'},
{level:28,icon:'🪙',name:'Сундук сокровищ',desc:'Большое пополнение баланса.',kind:'$100,000',money:100000},
{level:29,icon:'🐉',name:'Покоритель дракона',desc:'Редкий титул финального этапа.',kind:'Титул'},
{level:30,icon:'🏆',name:'Легенда EPM',desc:'Финальная награда сезона и 150,000 игровой валюты.',kind:'$150,000 + титул',money:150000}
];
let state=load();
function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');return{xp:Math.max(0,Number(s.xp)||0),balance:Math.max(10000,Number(s.balance)||10000),claimed:Array.isArray(s.claimed)?s.claimed.map(Number):[]}}catch{return{xp:0,balance:10000,claimed:[]}}}
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function level(){return Math.min(30,1+Math.floor(state.xp/1000))}
function toast(s){const el=document.getElementById('toast');el.textContent=s;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2600)}
function render(){const lv=level(),within=lv===30?1000:state.xp%1000;document.getElementById('level').textContent=lv;document.getElementById('xpText').textContent=(lv===30?1000:within)+' / 1000 XP';document.getElementById('nextText').textContent=lv===30?'Максимальный уровень':'До уровня '+(lv+1);document.getElementById('progress').style.width=(lv===30?100:within/10)+'%';document.getElementById('balance').textContent='$'+state.balance.toLocaleString('en-US');document.getElementById('claimedCount').textContent=state.claimed.length;document.getElementById('rewards').innerHTML=rewards.map(r=>{const unlocked=lv>=r.level,claimed=state.claimed.includes(r.level);return '<article class="bp-reward '+(!unlocked?'locked ':'')+(claimed?'claimed':'')+'"><div class="bp-reward-top"><span class="bp-tier">УРОВЕНЬ '+String(r.level).padStart(2,'0')+'</span><div class="bp-icon">'+r.icon+'</div></div><h3>'+r.name+'</h3><p>'+r.desc+'</p><div class="bp-reward-foot"><strong>'+r.kind+'</strong><button class="bp-btn '+(unlocked&&!claimed?'primary':'')+'" data-claim="'+r.level+'" '+(!unlocked||claimed?'disabled':'')+'>'+(claimed?'Получено':unlocked?'Забрать':'🔒 Закрыто')+'</button></div></article>'}).join('');document.querySelectorAll('[data-claim]').forEach(b=>b.onclick=()=>claim(Number(b.dataset.claim)))}
function claim(lv){const r=rewards.find(x=>x.level===lv);if(!r||level()<lv||state.claimed.includes(lv))return;if(r.money)state.balance+=r.money;state.claimed.push(lv);save();render();toast(r.donate?'Награда отмечена. Для выдачи привилегии обратись к администрации.':'Награда получена!')}
document.getElementById('addXp').onclick=()=>{if(level()>=30){toast('У тебя максимальный уровень!');return}state.xp=Math.min(29000,state.xp+250);save();render();toast('+250 XP добавлено (демо)')};
document.getElementById('claimAll').onclick=()=>{let count=0;rewards.filter(r=>r.level<=level()&&!state.claimed.includes(r.level)).forEach(r=>{if(r.money)state.balance+=r.money;state.claimed.push(r.level);count++});save();render();toast(count?'Получено наград: '+count:'Пока нет новых наград')};
document.getElementById('resetPass').onclick=()=>{if(!confirm('Сбросить уровень, валюту и полученные награды?'))return;state={xp:0,balance:10000,claimed:[]};save();render();toast('Прогресс сброшен')};
render();
})();