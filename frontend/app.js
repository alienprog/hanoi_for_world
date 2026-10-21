/* Static application: all progress stays in this browser. */
(async function () {
  'use strict';
  const assets=new URL('.',document.currentScript.src);
  const app=document.querySelector('#app');
  app.innerHTML='<p role="status">Загрузка…</p>';
  let levels;
  try {const r=await fetch(new URL('levels.json',assets));if(!r.ok)throw new Error();levels=(await r.json()).map(([disks_count,pegs_count],i)=>({mode:'basic',level_id:i+1,disks_count,pegs_count}));}
  catch(e){app.textContent='Не удалось загрузить уровни. Запустите приложение через HTTP-сервер и обновите страницу.';return;}
  app.innerHTML=`
    <div class="session-bar"><span>Ханойские башни</span><span id="save-status" role="status"></span></div>
    <section data-screen="menu" class="screen menu" hidden>
      <h1 tabindex="-1">МЕНЮ</h1><nav class="menu__actions" aria-label="Главное меню">
        <button data-go="levels" type="button">выбор уровня</button><button id="random" type="button">генерация случайного уровня</button><button data-go="custom" type="button">создание своего уровня</button>
        <div class="menu__secondary"><button data-go="profile" type="button">профиль</button><button data-go="help" type="button">справка</button></div>
      </nav>
    </section>
    <section data-screen="levels" class="screen" hidden><button data-go="menu" type="button" class="back">Назад</button><h1 tabindex="-1">ВЫБЕРИТЕ УРОВЕНЬ</h1><div class="levels" aria-label="Базовые уровни"></div></section>
    <section data-screen="custom" class="screen" hidden><button data-go="menu" type="button" class="back">Назад</button><h1 tabindex="-1">СВОЯ ИГРА</h1>
      <form id="custom-form" class="custom-form" novalidate>
        <label for="disks">Количество дисков <span>от 3 до 8</span></label><input id="disks" type="number" min="3" max="8" step="1" required value="3" aria-describedby="disks-error"><p id="disks-error" class="field-error" aria-live="polite"></p>
        <label for="pegs">Количество стержней <span>от 3 до 5</span></label><input id="pegs" type="number" min="3" max="5" step="1" required value="3" aria-describedby="pegs-error"><p id="pegs-error" class="field-error" aria-live="polite"></p>
        <button type="submit">Создать игру</button>
      </form>
    </section>
    <section data-screen="game" class="screen game-screen" hidden>
      <header class="game-toolbar"><button data-go="menu" type="button" class="back">В меню</button><div class="counter"><span>Минимум ходов</span><strong id="minimum">7</strong></div><div class="counter"><span>Текущие ходы</span><strong id="moves">0</strong></div><button id="restart" type="button">Заново</button><button id="game-help" type="button" class="info-button" aria-label="Справка и управление" title="Справка и управление">ⓘ</button></header>
      <h1 id="game-title" tabindex="-1">ХАНОЙСКИЕ БАШНИ</h1><div id="board"></div>
      <section id="victory" class="victory" hidden aria-live="polite"><h2>Поздравляем! Вы решили головоломку!</h2><p id="result"></p><div class="victory__actions"><button data-go="levels" type="button">Выбор уровня</button><button id="retry" type="button">Повторить уровень</button><button data-go="menu" type="button">В меню</button></div></section>
    </section>
    <section data-screen="profile" class="screen profile" hidden>
      <button data-go="menu" type="button" class="back">Назад</button><h1 tabindex="-1">ПРОФИЛЬ</h1>
      <div class="profile__content"><div><div class="profile__avatar"><img id="avatar-image" alt="Ваш аватар" hidden><span id="avatar-empty">Нет аватара</span></div><button id="avatar-choose" type="button">Изменить аватар</button><input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Выбрать изображение для аватара" hidden><button id="avatar-remove" type="button" hidden>Удалить аватар</button></div><div class="profile__details"><p id="profile-name">Игрок</p></div></div>
      <p id="profile-error" class="error" role="alert"></p>
    </section>
    <section data-screen="help" class="screen help" hidden><button id="help-back" type="button" class="back">Назад</button><h1 tabindex="-1">СПРАВКА</h1><p class="help__intro">Перенесите пирамиду на целевой стержень за минимальное число ходов.</p><section class="help__rules"><h2>ПРАВИЛА ИГРЫ</h2><ol><li>Перемещается один верхний диск.</li><li>Больший диск нельзя класть на меньший.</li><li>Все диски на целевом стержне — победа.</li></ol></section><section class="help__rules"><h2>УПРАВЛЕНИЕ</h2><p>Мышь и касание: нажмите на верхний диск, затем на целевой стержень. Также можно перетащить диск. Повторное нажатие на исходный стержень или нажатие вне поля отменяет выбор.</p><p>Tab — выбрать стержень и его верхний диск; Shift+Tab — предыдущий стержень. ↑ — поднять диск; ← / → — перенести над башнями; ↓ — опустить; Escape — отменить перенос. Tab во время переноса возвращает диск на место. На границе поля Tab / Shift+Tab переводят фокус к остальным кнопкам. Подсветка показывает выбранный стержень, зелёный цвет — допустимую цель, красный — недопустимую. Кнопка «Заново» начинает текущий уровень сначала; «В меню» сохраняет партию; ⓘ открывает справку. Кнопка «Назад» возвращает из справки к игре без потери ходов.</p><p>Игра и аватар сохраняются в этом браузере. Очистка данных сайта удалит прогресс.</p></section></section>`;
  const $=selector=>app.querySelector(selector),screens=[...app.querySelectorAll('[data-screen]')];
  const game=new Hanoi.Game();let view=null,hasGame=false,screen='menu',ready=false,helpOrigin='menu';
  function status(text,error=false){$('#save-status').textContent=text;$('#save-status').classList.toggle('error',error);}
  const store=new HanoiSession.SessionStore({storage:()=>window.localStorage,key:'hanoi.pages.v1:'+assets.pathname,onStatus:status});
  function persist(){if(!ready||!['menu','levels','custom','game','profile','help'].includes(screen))return;try{store.save({...store.data,state:hasGame?game.getState():null,screen});}catch(e){status(e.message,true);}}
  function show(name,{save=true}={}){
    if(!screens.some(s=>s.dataset.screen===name))return;
    if(name==='help'&&screen!=='help')helpOrigin=screen==='game'?'game':'menu';
    if(view)game.cancelSelection();screen=name;
    for(const s of screens)s.hidden=s.dataset.screen!==name;
    $(`[data-screen="${name}"] h1`).focus();
    if(name==='game'&&hasGame){if(!view)view=Hanoi.mount($('#board'),game);else view.render();}
    refreshProfile();if(save)persist();
  }
  function unlocked(id){return id===1||Array.from({length:id-1},(_,i)=>i+1).every(i=>store.data.completed_levels.includes(i));}
  function refreshLevels(){
    [...$('.levels').children].forEach((b,i)=>{const id=i+1,done=store.data.completed_levels.includes(id);b.disabled=!unlocked(id);b.classList.toggle('level--complete',done);b.title=done?'Пройден':b.disabled?'Сначала пройдите предыдущий уровень':`${levels[i].disks_count} дисков, ${levels[i].pegs_count} стержня`;b.setAttribute('aria-label',`Уровень ${id}${done?', пройден':b.disabled?', закрыт':''}`);});
  }
  function refreshProfile(){
    $('#profile-name').textContent='Игрок';
    const avatar=store.data.avatar;$('#avatar-image').hidden=!avatar;$('#avatar-empty').hidden=!!avatar;$('#avatar-remove').hidden=!avatar;
    if(avatar)$('#avatar-image').src=avatar;else $('#avatar-image').removeAttribute('src');
  }
  function update(state){
    $('#minimum').textContent=state.min_moves;$('#moves').textContent=state.moves;
    $('#game-title').textContent=state.mode==='basic'?`УРОВЕНЬ ${state.level_id}`:state.mode==='random'?'СЛУЧАЙНАЯ ИГРА':'СВОЯ ИГРА';
    const won=state.status==='completed';$('#victory').hidden=!won;$('#result').textContent=won?`Ваш результат: ${state.moves} ходов. Минимум: ${state.min_moves}.`:'';
  }
  function start(parameters){if(parameters.mode==='basic'&&!unlocked(parameters.level_id))return;const r=game.newGame(parameters);if(r.ok){hasGame=true;show('game');}else status(r.error.message,true);}
  game.subscribe(event=>{
    if(!event.ok)return;update(event.state);
    if(!ready)return;
    if(['new_game','restart','move'].includes(event.type)){
      hasGame=true;
      if(event.victory && event.state.mode==='basic'){
        const done=store.data.completed_levels;if(!done.includes(event.state.level_id))done.push(event.state.level_id);done.sort((a,b)=>a-b);refreshLevels();
      }
      persist();
    }
  });
  function applySnapshot(data){
    ready=false;if(view){view.destroy();view=null;}hasGame=false;
    if(data.state){const r=game.restoreState(data.state);if(!r.ok)throw new Error(r.error.message);hasGame=true;}
    else game.newGame();
    refreshLevels();refreshProfile();ready=true;
    show(data.screen==='game'&&!hasGame?'menu':data.screen,{save:false});
  }
  for(const b of app.querySelectorAll('[data-go]'))b.onclick=()=>show(b.dataset.go);
  for(const level of levels){const b=document.createElement('button');b.type='button';b.textContent=level.level_id;b.onclick=()=>{const current=game.getState();if(hasGame&&current.mode==='basic'&&current.level_id===level.level_id&&current.status==='in_progress')show('game');else start(level);};$('.levels').append(b);}
  refreshLevels();
  $('#random').onclick=()=>start({mode:'random',disks_count:3+Math.floor(Math.random()*6),pegs_count:3+Math.floor(Math.random()*3)});
  $('#game-help').onclick=()=>show('help');
  $('#help-back').onclick=()=>show(helpOrigin);
  for(const id of ['restart','retry'])$('#'+id).onclick=()=>{game.restart();$('#game-title').focus();};
  $('#custom-form').onsubmit=e=>{
    e.preventDefault();let first=null;
    for(const [id,min,max,label] of [['disks',3,8,'дисков'],['pegs',3,5,'стержней']]){
      const input=$('#'+id),n=input.valueAsNumber,invalid=!Number.isInteger(n)||n<min||n>max;
      $('#'+id+'-error').textContent=invalid?`Укажите целое количество ${label} от ${min} до ${max}.`:'';
      input.setAttribute('aria-invalid',String(invalid));if(invalid&&!first)first=input;
    }
    if(first){first.focus();return;}start({mode:'custom',disks_count:$('#disks').valueAsNumber,pegs_count:$('#pegs').valueAsNumber});
  };
  async function avatarData(file){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Выберите PNG, JPEG или WebP до 5 МБ.');
    const image=await createImageBitmap(file);
    try{if(image.width>8192||image.height>8192)throw new Error('Изображение должно быть не больше 8192×8192.');const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d'),size=Math.min(image.width,image.height);c.fillStyle='white';c.fillRect(0,0,256,256);c.drawImage(image,(image.width-size)/2,(image.height-size)/2,size,size,0,0,256,256);return canvas.toDataURL('image/jpeg',.85);}finally{image.close();}
  }
  async function changeAvatar(value){await store.avatar(value);refreshProfile();}
  $('#avatar-choose').onclick=()=>$('#avatar-file').click();
  $('#avatar-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;$('#profile-error').textContent='';e.target.disabled=true;$('#avatar-choose').disabled=true;$('#avatar-choose').textContent='Загрузка…';try{const data=await avatarData(file);await changeAvatar(data);}catch(error){$('#profile-error').textContent=error.message;}finally{e.target.value='';e.target.disabled=false;$('#avatar-choose').disabled=false;$('#avatar-choose').textContent='Изменить аватар';}};
  $('#avatar-remove').onclick=async()=>{try{await changeAvatar(null);}catch(e){$('#profile-error').textContent=e.message;}};
  try{applySnapshot(store.load());}
  catch(error){applySnapshot(HanoiSession.empty());status(error.message,true);}
})();
