/* Hanoi: browser global and CommonJS, no dependencies or DOM required for core. */
(function (root) {
  'use strict';
  const clone = x => JSON.parse(JSON.stringify(x));
  const fields = ['mode','level_id','disks_count','pegs_count','source_peg','target_peg'];
  function reject(code, message) { const e = new Error(message); e.code = code; throw e; }
  function int(x, min, max, name) {
    if (!Number.isSafeInteger(x) || x < min || x > max) reject('invalid_state', `${name}: ожидается целое число ${min}–${max}.`);
  }
  function object(x) { if (!x || typeof x !== 'object' || Array.isArray(x)) reject('invalid_state', 'Ожидается объект.'); }
  function keys(x, allowed) {
    object(x);
    if (Object.keys(x).some(k => !allowed.includes(k))) reject('invalid_state', 'Неизвестные поля.');
  }
  function config(p) {
    keys(p, fields);
    const c = { mode:'custom', level_id:null, disks_count:3, pegs_count:3, source_peg:0, ...p };
    if (!Object.hasOwn(p, 'target_peg')) c.target_peg = c.pegs_count - 1;
    int(c.disks_count,3,8,'Диски'); int(c.pegs_count,3,5,'Стержни');
    int(c.source_peg,0,c.pegs_count-1,'Исходный стержень'); int(c.target_peg,0,c.pegs_count-1,'Целевой стержень');
    if (c.source_peg === c.target_peg) reject('invalid_state','Исходный и целевой стержни совпадают.');
    if (!['basic','random','custom'].includes(c.mode)) reject('invalid_state','Неизвестный режим.');
    if (c.level_id !== null) int(c.level_id,1,Number.MAX_SAFE_INTEGER,'Номер уровня');
    if (c.mode === 'basic' && c.level_id === null) reject('invalid_state','Для базового уровня нужен level_id.');
    return c;
  }
  function minimum(n,p) {
    const t = Array.from({length:n+1}, () => Array(p+1).fill(0));
    for (let k=3;k<=p;k++) for (let d=1;d<=n;d++) {
      t[d][k] = k===3 ? 2**d-1 : d===1 ? 1 : Infinity;
      if (k>3) for (let cut=1;cut<d;cut++) t[d][k]=Math.min(t[d][k],2*t[cut][k]+t[d-cut][k-1]);
    }
    return t[n][p];
  }
  function initial(c) {
    return {...c, pegs:Array.from({length:c.pegs_count},(_,id)=>({id,disks:id===c.source_peg?Array.from({length:c.disks_count},(_,i)=>i+1):[]})), moves:0, min_moves:minimum(c.disks_count,c.pegs_count), status:'in_progress'};
  }
  function validate(raw) {
    const all = [...fields,'pegs','moves','min_moves','status']; keys(raw,all);
    if (all.some(k=>!Object.hasOwn(raw,k))) reject('invalid_state','Сохранение содержит не все обязательные поля.');
    const c = config(Object.fromEntries(fields.map(k=>[k,raw[k]])));
    int(raw.moves,0,Number.MAX_SAFE_INTEGER,'Ходы');
    if (raw.min_moves !== minimum(c.disks_count,c.pegs_count)) reject('invalid_state','Неверное минимальное число ходов.');
    if (!Array.isArray(raw.pegs) || raw.pegs.length !== c.pegs_count) reject('invalid_state','Нужно описание всех стержней.');
    const ids=new Set(), disks=new Set(), pegs=[];
    for (const peg of raw.pegs) {
      keys(peg,['id','disks']); int(peg.id,0,c.pegs_count-1,'Стержень');
      if (ids.has(peg.id) || !Array.isArray(peg.disks)) reject('invalid_state','Неверное описание стержня.');
      ids.add(peg.id); let prev=0;
      for (const d of peg.disks) {
        int(d,1,c.disks_count,'Диск');
        if (disks.has(d) || d<=prev) reject('invalid_state','Диски повторяются или нарушен порядок сверху вниз.');
        disks.add(d); prev=d;
      }
      pegs.push({id:peg.id, disks:peg.disks.slice()});
    }
    if (disks.size !== c.disks_count) reject('invalid_state','В сохранении потеряны диски.');
    pegs.sort((a,b)=>a.id-b.id);
    const won=pegs[c.target_peg].disks.length===c.disks_count;
    if (raw.status !== (won?'completed':'in_progress')) reject('invalid_state','Статус не соответствует положению дисков.');
    if (raw.moves < c.disks_count-pegs[c.source_peg].disks.length || (won && raw.moves<raw.min_moves)) reject('invalid_state','Счётчик противоречит положению дисков.');
    return {...c,pegs,moves:raw.moves,min_moves:raw.min_moves,status:raw.status};
  }
  class Game {
    #state; #selected=null; #listeners=new Set(); #notifying=false;
    constructor(parameters={}) { this.#state=initial(config(parameters)); }
    getState() { return clone(this.#state); }
    getSelection() { return this.#selected; }
    subscribe(fn) { if (typeof fn!=='function') throw new TypeError('Нужна функция.'); this.#listeners.add(fn); return ()=>this.#listeners.delete(fn); }
    #command(type, action) {
      if (this.#notifying) return {ok:false,type:'error',error:{code:'reentrant_command',message:'Запланируйте команду после обработки события.'},state:this.getState(),selected_peg:this.#selected};
      let result;
      try { const detail=action() || {}; result={ok:true,type,...detail,state:this.getState(),selected_peg:this.#selected}; }
      catch (e) { if (!e.code) throw e; result={ok:false,type:'error',action:type,error:{code:e.code,message:e.message},state:this.getState(),selected_peg:this.#selected}; }
      this.#notifying=true;
      try { for (const fn of [...this.#listeners]) { try { fn(clone(result)); } catch(e) { console.error('Hanoi subscriber',e); } } }
      finally { this.#notifying=false; }
      return result;
    }
    #peg(id) { int(id,0,this.#state.pegs_count-1,'Стержень'); return this.#state.pegs[id].disks; }
    #active() { if (this.#state.status==='completed') reject('game_completed','Игра завершена. Начните новую игру.'); }
    newGame(parameters={}) { return this.#command('new_game',()=>{const s=initial(config(parameters)); this.#state=s; this.#selected=null;}); }
    restart() { return this.#command('restart',()=>{this.#state=initial(config(Object.fromEntries(fields.map(k=>[k,this.#state[k]]))));this.#selected=null;}); }
    restoreState(raw) { return this.#command('restore',()=>{const s=validate(raw);this.#state=s;this.#selected=null;}); }
    selectDisk(peg,disk) {
      return this.#command('selection',()=>{
        this.#active(); const stack=this.#peg(peg);
        if (!stack.length) reject('empty_peg','Стержень пуст.');
        if (disk!==undefined && disk!==stack[0]) reject('not_top','Недопустимый ход: можно перемещать только верхний диск');
        this.#selected=peg;
      });
    }
    cancelSelection() { return this.#command('selection',()=>{this.#selected=null;}); }
    moveSelected(to) { return this.moveDisk(this.#selected,to); }
    moveDisk(from,to,disk) {
      return this.#command('move',()=>{
        this.#active(); const a=this.#peg(from), b=this.#peg(to), d=a[0];
        if (!a.length) reject('empty_peg','Стержень пуст.');
        if (disk!==undefined && disk!==d) reject('not_top','Недопустимый ход: можно перемещать только верхний диск');
        if (from===to) reject('same_peg','Диск уже находится на этом стержне');
        if (b.length && d>b[0]) reject('larger_on_smaller','Недопустимый ход: нельзя класть диск большего диаметра на диск меньшего диаметра');
        if (this.#state.moves===Number.MAX_SAFE_INTEGER) reject('move_limit','Достигнут предел счётчика.');
        a.shift();b.unshift(d);this.#state.moves++;this.#selected=null;
        const victory=to===this.#state.target_peg && b.length===this.#state.disks_count;
        if (victory) this.#state.status='completed';
        return {from,to,disk:d,victory};
      });
    }
  }
  const mounted = new WeakMap();
  function mount(container, game, {interactive=true}={}) {
    if (!container || !container.ownerDocument) throw new TypeError('Нужен контейнер DOM.');
    if (mounted.has(container)) throw new Error('В контейнере уже подключено поле.');
    const doc=container.ownerDocument, win=doc.defaultView;
    const el=doc.createElement('section');el.className='hanoi';
    el.innerHTML='<p class="hanoi__score"></p><canvas class="hanoi__canvas" role="application" aria-label="Ханойские башни"></canvas><p class="hanoi__message" role="status" aria-live="polite"></p>';
    container.append(el);
    const canvas=el.querySelector('canvas'), ctx=canvas.getContext('2d'), score=el.querySelector('.hanoi__score'), message=el.querySelector('.hanoi__message');
    if (interactive) canvas.tabIndex=0;
    if (!ctx) {el.remove();throw new Error('Canvas 2D недоступен.');}
    let state=game.getState(), boxes=[], hover=null, gesture=null, carry=null, animation=null, frame=0, timer=0, width=1, height=320, disposed=false, cursor=0, dropOrigin=null;
    function animatedBox(time=win.performance.now()) {
      if(!animation)return carry?.box;
      const t=Math.min(1,Math.max(0,(time-animation.start)/(animation.duration||320))),ease=(1-Math.cos(Math.PI*t))/2;
      return {...animation.to,x:animation.from.x+(animation.to.x-animation.from.x)*ease,
        y:animation.from.y+(animation.to.y-animation.from.y)*ease-(animation.straight?0:40*Math.sin(Math.PI*ease))};
    }
    function flyTo(box) {
      const from=animatedBox()||carry.box;carry.box=box;
      win.cancelAnimationFrame(frame);
      animation=win.matchMedia('(prefers-reduced-motion: reduce)').matches?null:
        {from,to:box,disk:carry.disk,start:win.performance.now(),straight:true};
      draw();
    }
    function layout(s) {
      const slot=width/s.pegs_count, base=height-42, result=[];
      s.pegs.forEach(p=>p.disks.forEach((disk,i)=>{
        const w=slot*.82*disk/s.disks_count;
        result.push({peg:p.id,disk,x:slot*(p.id+.5)-w/2,y:base-(p.disks.length-i)*26,w,h:22});
      }));return result;
    }
    function disk(b, selected=false) {
      ctx.fillStyle=`hsl(${195+b.disk*19} 65% 38%)`;ctx.fillRect(b.x,b.y,b.w,b.h);
      if(selected){ctx.strokeStyle='#0f172a';ctx.lineWidth=3;ctx.strokeRect(b.x-2,b.y-2,b.w+4,b.h+4);}
      if(b.w>=14){ctx.fillStyle='white';ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillText(b.disk,b.x+b.w/2,b.y+16);}
    }
    function draw(time=win.performance.now()) {
      if(disposed)return;
      win.cancelAnimationFrame(frame);
      ctx.clearRect(0,0,width,height);boxes=layout(state);
      const slot=width/state.pegs_count, selected=game.getSelection();
      const focused=doc.activeElement===canvas?cursor:-1;
      const target=carry?carry.target:focused>=0?focused:hover;
      for(let id=0;id<state.pegs_count;id++){
        const x=slot*(id+.5);let color='#64748b';
        if(focused===id)color='#1d4ed8';
        if(target===id && selected!==null){const a=state.pegs[selected].disks[0],b=state.pegs[id].disks[0];color=id!==selected && (b===undefined||a<b)?'#15803d':'#b91c1c';}
        ctx.fillStyle=color;ctx.fillRect(x-3,30,6,height-72);ctx.fillRect(x-slot*.44,height-42,slot*.88,6);
        ctx.fillStyle='#0f172a';ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillText(`${id+1}${id===state.target_peg?' · цель':''}`,x,height-12);
      }
      let fraction=animation?Math.min(1,(time-animation.start)/(animation.duration||320)):1;
      for(const b of boxes){if(carry && b.disk===carry.disk)continue;if(animation && b.disk===animation.disk && fraction<1)continue;if(gesture?.dragging && b.disk===gesture.disk)continue;disk(b,(selected===b.peg||(!carry&&focused===b.peg))&&state.pegs[b.peg].disks[0]===b.disk);}
      if(animation && fraction<1){disk(animatedBox(time),true);frame=win.requestAnimationFrame(draw);}else {animation=null;if(carry)disk(carry.box,true);}
      if(gesture?.dragging)disk({...gesture.box,x:gesture.x-gesture.box.w/2,y:gesture.y-11},true);
    }
    function clearMessage(){message.textContent='';win.clearTimeout(timer);}
    message.onclick=clearMessage;
    function update(event) {
      const old=boxes,held=dropOrigin||(carry?animatedBox():null);dropOrigin=null;state=game.getState();
      const keepCarry=carry && event && !event.ok;
      if(!keepCarry)carry=null;
      if(!event || event.type!=='selection'){gesture=null;hover=null;}
      win.cancelAnimationFrame(frame);animation=null;
      if(event?.ok && event.type==='move' && !win.matchMedia('(prefers-reduced-motion: reduce)').matches){
        const from=held||old.find(b=>b.disk===event.disk),to=layout(state).find(b=>b.disk===event.disk);
        if(from&&to)animation={from,to,disk:event.disk,start:win.performance.now(),straight:!!held,duration:400};
      }
      const completed=state.status==='completed';el.classList.toggle('hanoi--completed',completed);
      score.textContent=`${completed?'Поздравляем! Вы решили головоломку!':'Игра в процессе'} Ходы: ${state.moves}. Минимум: ${state.min_moves}. Режим: ${{custom:'Своя игра',basic:'Базовый',random:'Случайный'}[state.mode]}.`;
      clearMessage();
      if(event && !event.ok){message.textContent=event.error.message;timer=win.setTimeout(clearMessage,5000);}
      cursor=Math.min(cursor,state.pegs_count-1);
      canvas.setAttribute('aria-label',`Ханойские башни. Стержень ${cursor+1}. Диски сверху вниз: ${state.pegs[cursor].disks.join(', ')||'нет'}. Ходы: ${state.moves}. ${completed?'Победа.':'Tab — выбрать стержень, вверх — поднять, влево и вправо — перенести, вниз — опустить.'}`);
      draw();
    }
    function resize(){
      const nextWidth=Math.max(1,el.clientWidth),dpr=win.devicePixelRatio||1;
      if(width===nextWidth && canvas.width===Math.round(nextWidth*dpr))return;
      width=nextWidth;height=320;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);animation=null;
      if(carry){const b=layout(state).find(b=>b.disk===carry.disk);carry.box={...b,x:width/state.pegs_count*(carry.target+.5)-b.w/2,y:3};}
      draw();
    }
    function point(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*width/r.width,y:(e.clientY-r.top)*height/r.height};}
    function pegAt(p){return p.x<0||p.x>=width||p.y<0||p.y>height?null:Math.floor(p.x/(width/state.pegs_count));}
    function activate(id){if(game.getSelection()===id)game.cancelSelection();else if(game.getSelection()===null)game.selectDisk(id);else game.moveSelected(id);}
    function down(e){
      if(!e.isPrimary||e.button!==0||gesture)return;
      if(carry)cancel();
      const p=point(e),peg=pegAt(p);if(peg===null)return;cursor=peg;canvas.focus({preventScroll:true});
      const box=boxes.find(b=>p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h);
      const selected=game.getSelection();
      if(selected===null){if(!box)return;const r=game.selectDisk(peg,box.disk);if(!r.ok)return;}
      gesture={pointer:e.pointerId,peg,disk:state.pegs[peg].disks[0],box:boxes.find(b=>b.peg===peg&&b.disk===state.pegs[peg].disks[0]),start:p,x:p.x,y:p.y,dragging:false,prior:selected};
      canvas.setPointerCapture(e.pointerId);
    }
    function move(e){const p=point(e);hover=pegAt(p);if(gesture?.pointer===e.pointerId){gesture.x=p.x;gesture.y=p.y;if(gesture.box && game.getSelection()===gesture.peg && Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)>7)gesture.dragging=true;}draw();}
    function up(e){
      if(!gesture||gesture.pointer!==e.pointerId)return;const g=gesture;gesture=null;const to=pegAt(point(e));
      if(to===null){game.cancelSelection();return;}
      if(g.dragging){dropOrigin={...g.box,x:g.x-g.box.w/2,y:g.y-11};game.moveDisk(g.peg,to,g.disk);}
      else if(g.prior!==null)activate(to);
      else draw();
    }
    function cancel(){gesture=null;game.cancelSelection();}
    function key(e){
      if(e.altKey||e.ctrlKey||e.metaKey)return;
      if(e.key==='Escape'){e.preventDefault();cancel();return;}
      if(e.target!==canvas||state.status==='completed')return;
      if(e.key==='Tab'){
        if(carry)cancel();const next=cursor+(e.shiftKey?-1:1);
        if(next>=0&&next<state.pegs_count){e.preventDefault();cursor=next;draw();canvas.setAttribute('aria-label',`Стержень ${cursor+1}. Диски: ${state.pegs[cursor].disks.join(', ')||'нет'}`);}
        return;
      }
      const index=cursor;
      if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
      e.preventDefault();
      if(e.key==='ArrowUp' && !carry){
        if(!game.selectDisk(index).ok)return;
        const b=boxes.find(b=>b.peg===index&&b.disk===state.pegs[index].disks[0]);
        carry={from:index,target:index,disk:b.disk,box:b};flyTo({...b,y:3});
      }else if(carry && (e.key==='ArrowLeft'||e.key==='ArrowRight')){
        carry.target=Math.max(0,Math.min(state.pegs_count-1,carry.target+(e.key==='ArrowRight'?1:-1)));
        flyTo({...carry.box,x:width/state.pegs_count*(carry.target+.5)-carry.box.w/2,y:3});
        canvas.setAttribute('aria-label',`Диск ${carry.disk} над стержнем ${carry.target+1}. Стрелка вниз — опустить.`);
      }else if(carry && e.key==='ArrowDown'){
        if(carry.from===carry.target)cancel();
        else game.moveDisk(carry.from,carry.target,carry.disk);
      }
    }
    canvas.addEventListener('focus',()=>draw());
    canvas.addEventListener('blur',()=>{if(carry)cancel();draw();});
    function outside(e){if(!el.contains(e.target)&&game.getSelection()!==null)cancel();}
    if(interactive){canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('pointerleave',()=>{if(!gesture){hover=null;draw();}});el.addEventListener('keydown',key);doc.addEventListener('pointerdown',outside);}
    else canvas.style.touchAction='auto';
    const off=game.subscribe(update),observer=new win.ResizeObserver(resize);observer.observe(el);resize();update();
    const view={render:()=>update(),destroy(){disposed=true;off();observer.disconnect();win.cancelAnimationFrame(frame);win.clearTimeout(timer);doc.removeEventListener('pointerdown',outside);el.remove();mounted.delete(container);}};
    mounted.set(container,view);return view;
  }

  const api={Game,mount};
  if (typeof module!=='undefined' && module.exports) module.exports=api;
  else root.Hanoi=api;
})(globalThis);
