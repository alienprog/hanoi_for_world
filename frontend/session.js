(function(root){
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value));
  const empty=()=>({state:null,completed_levels:[],avatar:null,screen:'menu'});
  const screens=['menu','levels','custom','game','profile','help'];
  class SessionStore {
    constructor({storage,key,onStatus=()=>{}}){
      this.storage=storage;this.key=key;this.onStatus=onStatus;this.data=empty();
    }
    validate(raw){
      if(!raw||!screens.includes(raw.screen)||!Array.isArray(raw.completed_levels))throw new Error('Сохранение повреждено.');
      const done=raw.completed_levels;
      if(done.length>12||done.some((id,i)=>id!==i+1))throw new Error('Некорректный список пройденных уровней.');
      if(raw.state!==null){const result=new root.Hanoi.Game().restoreState(raw.state);if(!result.ok)throw new Error(result.error.message);}
      if(raw.avatar!==null&&(typeof raw.avatar!=='string'||!/^data:image\/(jpeg|png|webp);base64,/.test(raw.avatar)||raw.avatar.length>750000))throw new Error('Некорректный аватар.');
      return copy({state:raw.state,completed_levels:done,avatar:raw.avatar,screen:raw.screen});
    }
    load(){
      let saved;
      try{saved=this.storage().getItem(this.key);}
      catch(error){throw new Error('Браузер запретил сохранение. Игра доступна до закрытия страницы.');}
      if(!saved)return copy(this.data);
      try{this.data=this.validate(JSON.parse(saved));}
      catch(error){throw new Error('Не удалось восстановить игру: '+error.message);}
      return copy(this.data);
    }
    save(data){
      this.data=this.validate(data);
      try{this.storage().setItem(this.key,JSON.stringify(this.data));}
      catch(error){throw new Error('Не удалось сохранить игру. Разрешите хранение данных сайта или освободите место.');}
      this.onStatus('Сохранено на устройстве');
    }
    avatar(value){this.save({...this.data,avatar:value});return this.data.avatar;}
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={SessionStore,empty};
  else root.HanoiSession={SessionStore,empty};
})(globalThis);
