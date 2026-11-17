
const SU={S:'♠',C:'♣',H:'♥',D:'♦'},RED={H:1,D:1};
const NM=r=>({1:'A',11:'J',12:'Q',13:'K'}[r]||r);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cs=c=>c==='B0'?'💣 炸彈':c==='R0'?'0・復活':c==='P0'?'0・淨化':SU[c[0]]+NM(+c.slice(1));
let db,uid,code=null,room=null,joins=[],moves={},unsubs=[],sel=null,myName='';
try{myName=localStorage.getItem('d25name')||''}catch(e){}

const CHARS={yoshi:{n:'良秀',t:'天殺星',d:'主動技【天殺】（冷卻1回合，手牌≥2張時可用）：本回合出牌視為特殊攻擊，傷害等於該牌點數，對手的牌效果全部無效（對手出方塊則不受傷害也無法反擊）。攻擊命中（對手沒出方塊）才會永久刪除對手該牌的卡牌槽（明/暗槽對應）；自己無論是否命中都失去此次使用的卡牌槽（持有【血缘】則不消除自己的卡牌槽）。優先於一切效果。25絕技：【天殺-斷】（消除除自己外全體3張手牌，優先明牌）、【血缘【けつえん】】（手牌補滿上限，天殺不再消除自己的卡牌）。',
  d25Skills:[
    {id:1,name:'天殺-斷',type:'進攻型',desc:'將除自己以外所有玩家的手牌消除3張（優先明牌，最低保留1張）',
      instantFx:(r,i,o)=>{
        const msgs=[];
        r.seats.forEach((seat,sIdx)=>{
          if(sIdx===i)return;
          if(!r.hands[sIdx]||r.hands[sIdx].length<=1){
            msgs.push(`${seat.name} 手牌僅剩 ${r.hands[sIdx]?r.hands[sIdx].length:0} 張，無法消除`);
            return;
          }
          const canRemove=Math.min(3,r.hands[sIdx].length-1);
          const removed=[];
          for(let k=0;k<canRemove;k++){
            const upCand=r.hands[sIdx].find(c=>r.up[sIdx]&&r.up[sIdx].includes(c));
            const card=upCand||r.hands[sIdx][0];
            r.hands[sIdx]=r.hands[sIdx].filter((c,idx)=>c!==card||idx!==r.hands[sIdx].indexOf(card));
            if(r.up[sIdx])r.up[sIdx]=r.up[sIdx].filter((c,idx)=>c!==card||idx!==r.up[sIdx].indexOf(card));
            removed.push(cs(card));
          }
          while(r.up[sIdx]&&r.oc[sIdx]&&r.up[sIdx].length<Math.min(r.oc[sIdx],r.hands[sIdx].length)){
            const hid=r.hands[sIdx].find(c=>!r.up[sIdx].includes(c));
            if(hid)r.up[sIdx].push(hid);else break;
          }
          if(typeof moves!=='undefined'&&moves[r.round+'_'+sIdx]){
            try{db.doc(`rooms/${code}/moves/${r.round}_${sIdx}`).set(null)}catch(e){}
          }
          msgs.push(`${seat.name} 失去 ${canRemove} 張手牌（${removed.join('、')}，剩 ${r.hands[sIdx].length} 張）`);
        });
        return `【天殺-斷】斬裂全場！`+msgs.join('；');
      }
    },
    {id:2,name:'血缘【けつえん】',type:'輔助型',desc:'獲得被動血缘，手牌補至上限，且天殺不再消除自己的卡牌',
      instantFx:(r,i,o)=>{
        r.st[i].ketsuen=1;
        const targetCount=r.cfg.hand||5;
        const curCount=r.hands[i]?r.hands[i].length:0;
        const need=Math.max(0,targetCount-curCount);
        let drawn=[];
        if(need>0){
          if(!r.deck||r.deck.length<need){
            const allOtherCards=Object.values(r.hands).flat();
            r.deck=newDeck(allOtherCards);
          }
          drawn=r.deck.splice(0,need);
          r.hands[i]=[...(r.hands[i]||[]),...drawn];
        }
        if(r.oc[i]<(r.cfg.open||0))r.oc[i]=r.cfg.open;
        while(r.up[i]&&r.oc[i]&&r.up[i].length<Math.min(r.oc[i],r.hands[i].length)){
          const hid=r.hands[i].find(c=>!r.up[i].includes(c));
          if(hid)r.up[i].push(hid);else break;
        }
        return `獲得被動【血缘【けつえん】】！手牌補滿至 ${targetCount} 張（補充 ${need} 張），此後天殺不再消除自身卡牌！`;
      }
    }
  ]}};
CHARS.umb={n:'傘神',t:'',d:'被動：每次受到攻擊疊加1層神罰，滿3層進入【神怒】（你的攻擊被方塊反擊成功時也會疊1層），持續2場自己參與的戰鬥（旁觀回合不扣）：出牌點數皆以K（13）計算；結束後神罰歸零重新累積。25絕技：【神雷】（全場敵人含後備獲得2回合麻痺，最終出牌點數固定為1）、【神滅】（自身獲得2回合神滅，最終出牌點數固定為24）。麻痺與神滅在角色參與戰鬥後扣除回合數，旁觀與後備期間不扣；兩者同時存在時麻痺優先。',
  d25Skills:[
    {id:1,name:'神雷',type:'進攻型',desc:'使全場敵人（含後備）獲得2回合麻痺，任何牌的最終點數固定為1；旁觀與後備期間不扣回合',
      instantFx:(r,i,o)=>{
        r.seats.forEach((_,j)=>{if(j===i||(r.cfg.boss&&(i===1?j===1:j!==1)))return;
          if(r.hp[j]>0)r.st[j].paralysis=Math.max(r.st[j].paralysis||0,2);
          if(r.team)r.team[j].forEach((m,k)=>{if(k!==r.act[j]&&!m.dead&&m.hp>0)m.st.paralysis=Math.max(m.st.paralysis||0,2)});
        });
        return '全場敵人（含後備）獲得【麻痺】2回合，任何牌的最終點數固定為1；旁觀與後備期間不扣回合！';
      }},
    {id:2,name:'神滅',type:'輔助型',desc:'自身獲得2回合神滅，任何牌的最終點數固定為24；旁觀與後備期間不扣回合，麻痺優先',
      instantFx:(r,i,o)=>{r.st[i].divineAnnihilation=Math.max(r.st[i].divineAnnihilation||0,2);return '獲得【神滅】2回合，任何牌的最終點數固定為24；旁觀與後備期間不扣回合！';}}
  ]};
CHARS.val={n:'瓦倫希娜',t:'',d25BgmFile:'bgm.mp3',d:'擁有6層預知眼。與你同時出攻擊牌（♠/♣）時拼點：你的點數＋預知眼層數，點大者才能攻擊，平手算你贏，輸的一方攻擊無效。拼點成功：預知眼-1並獲得1層巴勒莫劍術（等效1層強壯：出牌點數永久+1，可疊加，可超過13點）。受到黑牌攻擊傷害時，若至少有2層預知眼且剩餘手牌中最大方塊的原始點數≥對方黑牌的原始點數，自動消耗2層預知眼及該方塊，閃避該次傷害並補抽一張手牌；每回合只消耗一張方塊與2層預知眼，該回合持續以該牌原始點數判定閃避，即使預知眼耗盡也能連閃，閃避不反擊，梅花斷補仍生效。被攻擊命中時預知眼-2。預知眼歸零後進入過熱3層：不再拼點或啟動新的閃避（本回合已啟動的閃避仍持續），並獲得2層虛弱（出牌點數-2）；每場自己參與的戰鬥-1層，歸零時恢復6層預知眼。優先級低於天殺。25絕技：【處置】（黑牌點數+5*巴勒莫層數與敵方黑牌拼點，勝時銷毀對方黑牌槽並造成1*5單方面攻擊）、【心-瓦倫希娜】（預知眼不再過熱，且每回合結束回復1層預知眼）。',
  d25Skills:[
    {id:1,name:'處置',type:'進攻型',desc:'黑牌點數+5*巴勒莫層數與敵方黑牌拼點，勝時銷毀對方黑牌槽並造成1*5單方面攻擊',
      instantFx:(r,i,o)=>{
        const msgs=[],damage=[];
        const myHand=r.hands[i]||[];
        let landed=false;
        const myBlackCards=myHand.filter(c=>'SC'.includes(c[0]));
        const myBlackPts=myBlackCards.reduce((acc,c)=>acc+(+c.slice(1)),0);
        const palermo=r.st[i].sw||0;
        const myScore=myBlackPts+5*palermo;
        const enemies=r.seats.map((_,idx)=>idx).filter(idx=>{
          if(idx===i)return false;
          if(r.hp&&r.hp[idx]<=0)return false;
          if(r.cfg.boss&&((i===0&&idx===2)||(i===2&&idx===0)))return false;
          if(r.team&&r.team[i]&&r.team[idx]&&r.team[i]===r.team[idx])return false;
          return true;
        });
        if(!enemies.length)return `【處置】發動，但場上沒有存活的敵方玩家！`;
        const hitOpp=(targetIdx,rawDmg)=>{
          const B_atk=calcBuffs(r.chars[i],r.st[i]);
          const B_def=calcBuffs(r.chars[targetIdx],r.st[targetIdx]);
          let v=Math.max(0,rawDmg+B_atk.strong-B_atk.weak);if(v>0&&envBlood(r))v+=2;
          (r.st[i].fx||[]).forEach(x=>{if(x.k==='dm')v*=1+x.n});
          v=Math.max(0,v+B_def.vuln-B_def.guard);
          (r.st[targetIdx].fx||[]).forEach(x=>{if(x.k==='rd')v*=1-x.n});
          v=prepareDamage(r,r.chars[targetIdx],r.st[targetIdx],v);const shield=absorbShield(r.st[targetIdx],v);
          addDamageFx(damage,r,targetIdx,shield.absorbed,undefined,true);
          if(shield.absorbed>0)landed=true;
          const beforeHp=r.hp[targetIdx];
          r.hp[targetIdx]=Math.max(0,damagedHp(beforeHp,characterMaxHp(r,targetIdx,r.chars[targetIdx],r.st[targetIdx]),shield.remaining,r.chars[targetIdx],r.st[targetIdx],[],r.seats[targetIdx].name,true));
          recordHpLoss(r.chars[targetIdx],r.st[targetIdx],beforeHp,r.hp[targetIdx]);
          addDamageFx(damage,r,targetIdx,beforeHp-r.hp[targetIdx]);
          if(r.hp[targetIdx]<beforeHp)landed=true;
          const actual=beforeHp-r.hp[targetIdx];if(r.st[targetIdx].xichnExitPending){Object.assign(r,settleCharacters(r,{hp:r.hp,st:r.st,cp:r.cp,team:r.team,log:msgs,damage,instant:true}))}return {dmg:v,actual,shieldAbs:shield.absorbed};
        };
        enemies.forEach(eIdx=>{
          const eName=r.seats[eIdx].name;
          const oppHand=r.hands[eIdx]||[];
          const oppBlackCards=oppHand.filter(c=>'SC'.includes(c[0]));
          const oppScore=oppBlackCards.reduce((acc,c)=>acc+(+c.slice(1)),0);
          if(myScore>=oppScore){
            const removed=[];
            oppBlackCards.forEach(c=>{
              r.hands[eIdx]=removeCardOnce(r.hands[eIdx],c);
              if(r.up[eIdx]&&r.up[eIdx].includes(c)){
                r.up[eIdx]=removeCardOnce(r.up[eIdx],c);
                if(r.oc[eIdx]>0)r.oc[eIdx]--;
              }
              removed.push(cs(c));
            });
            while(r.up[eIdx]&&r.oc[eIdx]&&r.up[eIdx].length<Math.min(r.oc[eIdx],r.hands[eIdx].length)){
              const hid=subtractCards(r.hands[eIdx],r.up[eIdx])[0];
              if(hid)r.up[eIdx].push(hid);else break;
            }
            if(typeof moves!=='undefined'&&moves[r.round+'_'+eIdx]){
              try{db.doc(`rooms/${code}/moves/${r.round}_${eIdx}`).set(null)}catch(e){}
            }
            let totalDmg=0,hitLogs=[];
            for(let k=1;k<=5;k++){
              if(r.hp[eIdx]<=0)break;
              const res=hitOpp(eIdx,1);
              totalDmg+=res.actual;
              hitLogs.push(res.dmg+(res.shieldAbs?`[盾擋${res.shieldAbs}]`:''));
            }
            msgs.push(`⚔ vs ${eName}：瓦倫希娜 ${myScore}點（黑牌${myBlackPts}+巴勒莫${palermo}×5） vs ${oppScore}點 → 獲勝！銷毀其黑牌卡槽×${removed.length}（${removed.length?removed.join('、'):'無黑牌'}），並連擊5次造成共 ${totalDmg} 點傷害（單擊：${hitLogs.join('、')}，剩餘血量 ${r.hp[eIdx]}）`);
          }else{
            msgs.push(`⚔ vs ${eName}：瓦倫希娜 ${myScore}點 vs ${oppScore}點 → 失敗，無事發生`);
          }
        });
        return {log:[`【處置】發動！`+msgs.join('；')],hits:landed?[i]:[],damage};
      }
    },
    {id:2,name:'心-瓦倫希娜',type:'輔助型',desc:'獲得被動心-瓦倫希娜：預知眼不再過熱（若當前過熱則回復為3層），且每回合回復1層預知眼',
      instantFx:(r,i,o)=>{
        r.st[i].xinVal=1;
        let note='';
        if((r.st[i].heat||0)>0){
          r.st[i].heat=0;
          r.st[i].eye=3;
          note='（已解除過熱，預知眼回復為 3 層）';
        }
        return `獲得被動【心-瓦倫希娜】！預知眼將不再進入過熱${note}，且此後每回合結束時自動回復 1 層預知眼！`;
      }
    }
  ]};
CHARS.rien={n:'里恩',t:'',d:'每場自己有參戰的戰鬥開始時（兩人戰即每回合），隨機標記一張手牌為【指令牌】（明牌模式只標記明牌，所有人可見，淺藍色外框），指令牌點數+1。使用指令牌：♠/♣擊中、♦反擊成功、♥成功治療→獲得3層指令加護，失敗→1層（上限9）。沒用指令牌→業【福爾圖娜】+1：每2層獲得1層易損（受到傷害+1）、每3層獲得1層虛弱（出牌點數-1）。指令加護3/6/9層→解放1/2/3（不並存）：解放1獲得1層守護；解放2獲得1層強壯、1層守護；解放3獲得2層強壯、2層守護，並可在自己參戰的戰鬥發動【Furioso-Replica】（整場遊戲只能發動一次）：不出牌、直接結束回合，基礎傷害1的攻擊連擊9次（廣域亂射：每擊隨機選目標——三人戰隨機選對手，3v3隨機選敵方一名角色，含後備；受被動影響）；發動後清除業、不再累積業，指令加護與解放保留。25絕技：【指令成癮】（指令牌對其他玩家隱藏，且指令牌點數增幅改為+8）、【心-里恩】（解除所有業，額外獲得等同當前解放層數的強壯與守護）。',
  d25Skills:[
    {id:1,name:'指令成癮',type:'進攻型',desc:'指令牌將不再顯示給其他玩家知曉，且指令牌獲得的點數增幅從+1改為+8',
      instantFx:(r,i,o)=>{
        r.st[i].cmdAddict=1;
        return `獲得被動【指令成癮】！指令牌將不再對其他玩家顯示，且指令牌點數增幅從 +1 提升為 +8！`;
      }
    },
    {id:2,name:'心-里恩',type:'輔助型',desc:'獲得被動心-里恩，解除自身所有業，額外獲得等同於當前解放層數同等的強壯和守護',
      instantFx:(r,i,o)=>{
        r.st[i].xinRien=1;
        const beforeK=r.st[i].karma||0;
        r.st[i].karma=0;
        const g=r.st[i].grace||0;
        const libLv=g>=9?3:g>=6?2:g>=3?1:0;
        r.st[i].xinStrong=(r.st[i].xinStrong||0)+libLv;
        r.st[i].xinGuard=(r.st[i].xinGuard||0)+libLv;
        return `獲得被動【心-里恩】！解除自身所有業（${beforeK}層業清除），當前解放為 ${libLv}，額外獲得強壯 +${libLv}、守護 +${libLv}！`;
      }
    }
  ]};
CHARS.ring={n:'卡利斯托',t:'',d:'任何攻擊（含反擊）實際造成傷害時，敵方最大生命值-1，並獲得等量活體材料；活體材料達5層後，任何攻擊成功使敵方最大生命值-2。梅花攻擊的最大生命降低量加倍；成功梅花斷補時固定使敵方最大生命值-5。每3層活體材料獲得1層強壯（出牌點數+1）。最大生命最低為1，現有生命會被壓到新上限以下。25絕技：【人體觀測】（敵方玩家最大生命值直接砍半，不獲得活體材料）、【在現場獲取並加工材料的美學】（活體材料除每3層給1層強壯外，同時根據活體材料數量提升自身最大生命值，且增加時當前生命也一起增加）。',
  d25Skills:[
    {id:1,name:'人體觀測',type:'進攻型',desc:'使所有敵方玩家的當前最大生命值砍半（不獲得活體材料）',
      instantFx:(r,i,o)=>{
        const msgs=[];
        r.seats.forEach((seat,sIdx)=>{
          if(sIdx===i||r.hp[sIdx]<=0)return;
          // 計算當前最大生命（含mdec）
          const baseMx=Math.max(1,Math.round(r.cfg.hp*(r.chars[sIdx]==='san'?1.2:1)*(bossHealthFactor(r.cfg,sIdx)))+(r.chars[sIdx]==='leoc'?5-r.cfg.hp:0));
          const curMx=Math.max(1,baseMx-(r.st[sIdx].mdec||0));
          const reduction=Math.floor(curMx/2);
          if(reduction>0){
            r.st[sIdx].mdec=(r.st[sIdx].mdec||0)+reduction;
            // 當前血量不超過新上限
            const newMx=Math.max(1,baseMx-(r.st[sIdx].mdec));
            if(r.hp[sIdx]>newMx){const before=r.hp[sIdx];r.hp[sIdx]=newMx;recordHpLoss(r.chars[sIdx],r.st[sIdx],before,newMx)}
            msgs.push(`${seat.name} 最大生命值 -${reduction}（現上限 ${newMx}）`);
          }
        });
        return `【人體觀測】發動！`+msgs.join('；');
      }
    },
    {id:2,name:'在現場獲取並加工材料的美學',type:'輔助型',desc:'活體材料除每3層給1層強壯外，同時根據活體材料數量提升自身最大生命值（增加時當前生命也一起增加）',
      instantFx:(r,i,o)=>{
        r.st[i].ringAesthetic=1;
        // 立即根據現有活體材料計算初始加成
        const lm=r.st[i].lm||0;
        r.st[i].ringMdecBonus=-(lm); // 用負mdec來提升上限（ringMdecBonus存儲加成量）
        const bonus=lm;
        const hpGain=envHeal(r,healingGain(r.st[i],bonus));
        const beforeHp=r.hp[i],healing=[];if(hpGain>0)r.hp[i]=healedHp(beforeHp,characterMaxHp(r,i,r.chars[i],r.st[i]),hpGain,r.chars[i],r.st[i]);addHealingFx(healing,r,i,r.hp[i]-beforeHp);
        return {log:[`獲得被動【在現場獲取並加工材料的美學】！當前活體材料 ${lm} 層，最大生命值立即 +${bonus}，當前生命增加 ${hpGain}${healingNote(r.st[i])}！此後活體材料每增加，最大生命提升，當前生命回復仍受禁療影響！`],healing};
      }
    }
  ]};
CHARS.san={n:'桑丘',t:'',d:'最大生命上限為設定基礎生命值的1.2倍，開場當前生命值仍為設定值。攻擊（含反擊）附帶傷害30%（向上取整，至少1）的吸血；任何回血都會獲得等量血宴。血宴≥5可發動主動技【血宴強化】：不足10層為一階（消耗5層），10層以上自動為二階（消耗10層），發動回合不累積血宴。一階：♠吸血雙倍；♣被阻止的回復量改為回復自己；♥治療量×1.5，若被梅花斷補則改為回復原治療量×0.4（向上取整）；♦獲得5點護盾（到自己下一個回合結束）。二階：♠吸血3倍；♣傷害不減半，並同樣吸走被阻止的回復；♥治療量×1.5，梅花斷補不會阻止治療且以原點數計算；♦護盾額外多撐2場自己的戰鬥，並獲得3場戰鬥的硬血盾（等效2層守護：受到傷害-2，最低0）。25絕技：【La Sangre】（對當前敵人造成自身血宴層數×1.5的固定傷害，三人戰時隨機選擇敵人）、【滿足壓抑許久的飢餓吧】（獲得10層血宴，且接下來獲得的血宴×1.5倍）。',
  d25Skills:[
    {id:1,name:'La Sangre',type:'進攻型',desc:'對當前敵人（三人戰時為隨機敵人）造成自身血宴層數×1.5的固定傷害',
      instantFx:(r,i,o)=>{
        const f=r.st[i].feast||0;
        const dmg=Math.floor(f*1.5);
        let target=o;
        if(r.seats.length===3&&!r.team){
          const aliveEnemies=r.seats.map((_,idx)=>idx).filter(idx=>idx!==i&&r.hp[idx]>0);
          if(aliveEnemies.length)target=rnd(aliveEnemies);
        }
        if(target===undefined||target===null||r.hp[target]<=0){
          return `【La Sangre】發動，但沒有存活的目標！`;
        }
        const tNm=r.seats[target].name;
        const before=r.hp[target];
        r.hp[target]=Math.max(0,damagedHp(before,characterMaxHp(r,target,r.chars[target],r.st[target]),dmg,r.chars[target],r.st[target]));
        recordHpLoss(r.chars[target],r.st[target],before,r.hp[target]);
        const actual=before-r.hp[target];
        const damage=[];addDamageFx(damage,r,target,actual);
        return {log:[`發動【La Sangre】！根據當前血宴 ${f} 層，對 ${tNm} 造成 ${dmg} 點固定傷害（實際扣除 ${actual} 點生命，剩餘血量 ${r.hp[target]}）！`],hits:actual>0?[i]:[],damage};
      }
    },
    {id:2,name:'滿足壓抑許久的飢餓吧',type:'輔助型',desc:'獲得10層血宴，且接下來獲得的血宴×1.5倍',
      instantFx:(r,i,o)=>{
        r.st[i].feastBoost=1;
        const add=Math.round(10*1.5);
        r.st[i].feast=(r.st[i].feast||0)+add;
        return `發動【滿足壓抑許久的飢餓吧】！獲得被動【飢餓滿足】（接下來獲得的血宴×1.5倍）並獲得 10×1.5 = ${add} 層血宴（現有 ${r.st[i].feast} 層）！`;
      }
    }
  ]};
CHARS.mat={n:'馬蒂亞斯',t:'',middleFinger:true,d:'【中指】受到黑牌單方面傷害時，對攻擊者施加1層復仇對象；友方中指共用，層數上限為存活友方中指人數×2（含後備）。復仇對象受到中指的非固定傷害時，額外增加對應層數。方塊反擊成功獲得1層拆開的包裝紙，集滿3層擁有1層毅力：受到致命傷害時生命固定為1（僅一次，萊萬汀的斬殺無法擋）。可發動主動技【萊萬汀】：直接擊殺復仇對象層數最高的目標（清除該目標的友方復仇層數）。25絕技：【地獄之火】（全體敵方玩家每回合初獲得3層炎傷）、【超毅力】（毅力改為超毅力：受到致命傷害後3回合內血量不低於1，全場僅限發動一次）。',
  d25Skills:[
    {id:1,name:'地獄之火',type:'進攻型',desc:'全體敵方玩家每回合開始時獲得3層炎傷',
      instantFx:(r,i,o)=>{
        r.st[i].hellFire=1;
        return `獲得被動【地獄之火】！此後每回合開始，所有敵方玩家將獲得 3 層炎傷！`;
      }
    },
    {id:2,name:'超毅力',type:'輔助型',desc:'將毅力改為超毅力：受到致命傷害後3回合內血量不低於1（全場僅限發動一次）',
      instantFx:(r,i,o)=>{
        r.st[i].superRes=1;
        r.st[i].superResTimer=0; // 0=未激活，>0=剩餘保護回合數
        r.st[i].superResUsed=0;  // 全場只能觸發一次
        return `獲得被動【超毅力】！毅力改為超毅力：受到致命傷害後3回合內血量不低於1（全場僅限發動一次）！`;
      }
    }
  ]};
CHARS.spider={n:'良秀•赤曈 懺悔',t:'',f:'bus',img:'spider',sfx:'spider1',d:'【赤曈】黑牌成功時獲得等同最終牌點數的層數，失敗獲得一半。【懺悔】紅牌成功觸發時獲得等同最終牌點數的層數，失敗獲得一半。出牌可自行選擇消耗對應資源（以5層為單位）：每5層赤曈使本張黑牌點數+1；每5層懺悔立即獲得1點護盾，牌效失敗也不退還消耗。【蛛•頭／骷•頭】各自累計消耗每滿15層，額外獲得5層對應資源。25絕技：【該吃飽睡覺了】（各獲得30層赤曈、懺悔，後續所有獲取倍率×1.5）、【動真格地碎顱】（消耗目前全部赤曈與懺悔，對場上敵方出戰單位造成消耗總層數×0.33基礎傷害）。層數與基礎傷害的小數均捨去。',
  d25Skills:[
    {id:1,name:'該吃飽睡覺了',type:'輔助型',desc:'各獲得30層赤曈與懺悔，此後所有層數獲取倍率×1.5，小數捨去',instantFx:(r,i)=>{const st=r.st[i];st.spiderEye=(st.spiderEye||0)+30;st.spiderPenitence=(st.spiderPenitence||0)+30;st.spiderGain=(st.spiderGain||1)*1.5;return '【該吃飽睡覺了】赤曈、懺悔各+30層，後續獲取倍率×1.5。';}},
    {id:2,name:'動真格地碎顱',type:'進攻型',desc:'消耗目前全部赤曈及懺悔，對場上所有存活敵方出戰單位造成消耗總層數×0.33基礎傷害，小數捨去',instantFx:(r,i)=>{const next=resolve(r,{},null,null,null,{spiderUltimate:i}),result=next.instantResult;delete next.instantResult;Object.assign(r,next);return result;}}
  ]};
const spiderSoundFile=n=>`assets/audio/sfx/characters/attack_spider${n}.mp3`;
const spiderArt=st=>(st?.spiderEyeSpent||0)>=15&&(st?.spiderPenitenceSpent||0)>=15?'spider3':(st?.spiderEyeSpent||0)>=15||(st?.spiderPenitenceSpent||0)>=15?'spider2':'spider1';
const spiderResource=suit=>'SC'.includes(suit)?'spiderEye':'HD'.includes(suit)?'spiderPenitence':null;
const spiderGain=(st,n)=>Math.floor(Math.max(0,n)*(st.spiderGain||1)+1e-9);
function spendSpider(st,key,n){const amount=Math.min(Math.max(0,st[key]||0),Math.max(0,n)),spent=key+'Spent',before=st[spent]||0;st[key]=(st[key]||0)-amount;st[spent]=before+amount;const heads=Math.floor(st[spent]/15)-Math.floor(before/15),refund=heads*spiderGain(st,5);st[key]+=refund;return {amount,refund};}
const spiderSpendAmount=(st,suit,n)=>{const key=spiderResource(suit);return key&&Number.isFinite(n)?Math.min(Math.floor(Math.max(0,st[key]||0)/5)*5,Math.floor(Math.max(0,n)/5)*5):0};
CHARS.lkd={n:'里卡多',t:'',f:'bus',img:'lkd',sfx:'lkd',middleFinger:true,d:'【Limbus陣營】【中指】受到黑牌單方面傷害時，對攻擊者施加1層復仇對象；友方中指共用，上限為存活友方中指人數×2（含後備）。復仇對象受到中指的非固定傷害額外增加層數。【全體集合】開局友方含後備有其他中指時，自身獲得5點護盾，每名其他中指提供該玩家1次免費「我牌太爛啦！」，整隊角色共用，換人或里卡多倒下仍保留；不增加付費換牌消耗。【償還】受到黑牌單方面傷害時，對攻擊者造成基礎2點傷害，受威力及防護影響。【我的理髮卷！！！！！！！】每反擊成功兩次取得1次使用資格，立即對目前敵人造成10點固定傷害，不推進回合。25絕技：【全員處刑】（所有存活敵人含後備各受到基礎15點傷害）、【大哥的仁慈】（所有存活友方中指含後備回復全場存活角色的復仇對象總層數×3生命）。',
  ss:{n:'我的理髮卷！！！！！！！',cost:0,repeat:true,can:(r,i)=>r.chars[i]==='lkd'&&r.pair.includes(i)&&r.hp[i]>0&&(r.st[i].lkdHaircuts||0)>0,
    fx:(r,i)=>{const next=resolve(r,{},null,null,null,{lkdHaircut:i}),result=next.instantResult;delete next.instantResult;Object.assign(r,next);r.instantFx={id:(r.instantFx?.id||0)+1,seat:i,...result};return result.log.join('；');}},
  d25Skills:[
    {id:1,name:'全員處刑',type:'進攻型',desc:'所有存活敵人含後備各受到基礎15點傷害，照常計算威力、復仇增傷及防護',instantFx:(r,i)=>{const next=resolve(r,{},null,null,null,{lkdExecution:i}),result=next.instantResult;delete next.instantResult;Object.assign(r,next);return result;}},
    {id:2,name:'大哥的仁慈',type:'輔助型',desc:'所有存活友方中指含後備回復全場存活角色的復仇對象總層數×3生命',instantFx:(r,i)=>{const log=[],healing=[],members=environmentMembers(r),total=members.reduce((n,m)=>n+Object.entries(m.st.fingerRevenge||{}).reduce((a,[side,v])=>a+Math.min(v,middleFingerCount(r,+side)*2),0),0);middleFingerMembers(r,i).forEach(m=>{const gain=envHeal(r,healingGain(m.st,total*3)),after=healedHp(m.hp,m.max,gain,m.c,m.st,log,r.seats[m.i].name);setEnvironmentHp(r,m,after);addHealingFx(healing,r,m.i,after-m.hp,m.k<0?undefined:m.k,i);if(m.k<0)shareEnvironmentHealing(r,m.i,after-m.hp,log,healing)});syncEnvironmentTeam(r);return {log:[`【大哥的仁慈】全場復仇對象共${total}層，友方中指各回復${total*3}點生命。`,...log],healing};}}
  ]};
CHARS.kira={n:'綺羅',t:'',f:'bus',img:'kira',sfx:'kira',middleFinger:true,d:'【Limbus陣營】【中指】受到黑牌單方面傷害時，對攻擊者施加1層共用復仇對象，上限為存活友方中指人數×2（含後備）；中指非固定傷害額外增加對應層數。【這樣做就可以了吧，老爸】每反擊成功兩次取得1次資格，立即對目前對手造成固定5點傷害，只受護盾與毅力影響；有其他存活後備中指時，對手本回合無法出牌，並隨機換上其中一名，不消耗換人次數。換上的成員本回合造成任何傷害時，綺羅一併承受等量傷害，技能本身5點不反傷。【熱絲】對帶有友方復仇對象的敵人實際造成傷害時，獲得1層永久強壯，上限2層。25絕技：【紫羅蘭破壞猛擊】（對目前對手造成全場復仇對象總層數×6的基礎傷害）、【嗚哇...好像超不妙的？】（隊伍有存活馬蒂亞斯才可用，馬蒂亞斯以萊萬汀同時斬殺綺羅與目前對手，永久獲得1＋熱絲層數的強壯）。',
  ss:{n:'這樣做就可以了吧，老爸',cost:0,repeat:true,can:(r,i)=>r.chars[i]==='kira'&&r.pair.includes(i)&&r.hp[i]>0&&(r.st[i].kiraDadUses||0)>0,
    fx:(r,i)=>{const result=runKiraInstant(r,i,'kiraDad');r.instantFx={id:(r.instantFx?.id||0)+1,seat:i,...result};return result.log.join('；');}},
  d25Skills:[
    {id:1,name:'紫羅蘭破壞猛擊',type:'進攻型',desc:'對目前對手造成全場存活角色含後備的復仇對象總層數×6基礎傷害',instantFx:(r,i)=>runKiraInstant(r,i,'kiraViolet')},
    {id:2,name:'嗚哇...好像超不妙的？',type:'進攻型',desc:'需隊伍有存活馬蒂亞斯（含後備）：以萊萬汀同時斬殺綺羅與目前對手，馬蒂亞斯永久獲得1＋熱絲層數的強壯',can:(r,i)=>!!kiraMatMember(r,i),instantFx:(r,i)=>runKiraInstant(r,i,'kiraSacrifice')}
  ]};
function runKiraInstant(r,i,key){const next=resolve(r,{},null,null,null,{[key]:i}),result=next.instantResult;delete next.instantResult;Object.assign(r,next);return result}
const kiraMatMember=(r,i)=>environmentMembers(r).find(m=>m.i===i&&m.c==='mat');
const fingerRevengeTotal=r=>environmentMembers(r).reduce((n,m)=>n+Object.entries(m.st.fingerRevenge||{}).reduce((a,[side,v])=>a+Math.min(v,middleFingerCount(r,+side)*2),0),0);
const kiraSoundFile=n=>`assets/audio/sfx/characters/attack_kira${n}.mp3.MP3`;
const kiraArt=s=>(s?.kiraHeat||0)>=2?'kira3':s?.kiraArtTurns>0?'kira2':'kira1';
CHARS.teaflower={n:'冬柏',t:'',f:'bus',img:'teaflower',sfx:'teaflower',d:'【綻放E.G.O::山茶花】每隔一次自身參戰回合，可將本次出牌轉為同點數梅花。梅花攻擊命中，或成功反擊敵方梅花時，在對方一張尚未標記的梅花牌上施加1層〔開花〕；每張牌限一次、每名對手最多5層，無可用梅花時隨機將一張未標記手牌轉成梅花。標記牌消耗（包含出牌、換牌）而未造成傷害時，標記轉移；成功造成傷害則移除，冬柏獲得1層【落英繽紛】（上限6，每2層虛弱1）。【春風爛漫】出牌前主動引爆目前對手所有開花，當回合：1層虛弱2；2層再易損2；3層另受最低標記牌點數+2固定傷害；4層改為最高點數+5固定傷害；5層受固定5點傷害並進入〔盛放〕，本回合空過且任何傷害保留至少1血。【九人會】開局同隊李箱（鏡世界觀測）取得〔九人會-冬柏〕，所有正常治療額外回復2血。25絕技：【盛開的內心】（任何傷害皆可標記；標記牌失敗消耗另受該牌牌面點數傷害，此追加傷害不再疊開花）、【馥郁芬芳】（3層以上引爆傷害改為所有標記牌牌面點數總和，其他狀態照常）。所有引爆傷害皆固定，不受強壯、虛弱、易損、守護或減傷等數值增減影響；護盾及保命照常。',
  ss:{n:'春風爛漫',cost:0,repeat:true,can:(r,i)=>r.chars[i]==='teaflower'&&r.pair.includes(i)&&r.hp[i]>0&&!moves[r.round+'_'+i]&&teaBlooms(r,battleOpponent(r,i)).length>0,
    fx:(r,i)=>{const next=resolve(r,{},null,null,null,{teaflowerSpring:i}),result=next.instantResult;delete next.instantResult;Object.assign(r,next);r.instantFx={id:(r.instantFx?.id||0)+1,seat:i,chars:[...r.chars],...result};return result.log.join('；');}},
  d25Skills:[
    {id:1,name:'盛開的內心',type:'輔助型',desc:'任何傷害都能新增1層開花；標記牌未造成傷害時另受其牌面點數傷害，此追加不再新增開花',instantFx:(r,i)=>{r.st[i].teaInner=1;return '【盛開的內心】任何傷害皆能新增開花，標記牌失敗消耗追加該牌牌面點數傷害（不再疊開花）。';}},
    {id:2,name:'馥郁芬芳',type:'輔助型',desc:'春風爛漫引爆3層以上時，固定傷害改為所有標記梅花牌的牌面點數總和；虛弱、易損、盛放照常',instantFx:(r,i)=>{r.st[i].teaFragrance=1;return '【馥郁芬芳】3層以上引爆固定傷害改為所有標記牌的牌面點數總和，其他狀態保留。';}}
  ]};
const teaBlooms=(r,i)=>r?.teaflower?.blooms?.[i]||[];
const teaSourceState=(r,m)=>m.sourceMember<0||m.sourceMember===r.act?.[m.sourceSeat]?r.st?.[m.sourceSeat]:r.team?.[m.sourceSeat]?.[m.sourceMember]?.st;
const teaSourceEnabled=(r,m)=>!envSilent(r)&&!(teaSourceState(r,m)?.sealT>0)&&!(r.teaSealed?.includes(`${m.sourceSeat}:${m.sourceMember}`));
function initTeaflower(r){
  if(!r?.st||!r.hands)return r;
  const members=environmentMembers(r),winters=members.filter(m=>m.c==='teaflower');
  if(!winters.length&&!r.teaflower)return r;
  if(!r.teaflower)r.teaflower={seq:0,cards:r.seats.map(()=>[]),blooms:r.seats.map(()=>[])};
  members.forEach(m=>{if(m.st.teaBloomRound!==r.round){m.st.teaBloomSafe=0;m.st.teaSkipRound=0}m.st.fx=(m.st.fx||[]).filter(f=>f.source!=='teaflower'||f.round===r.round);if(m.c==='yisang'&&winters.some(w=>middleFingerSide(r,w.i)===middleFingerSide(r,m.i)))m.st.nineTea=1});
  syncEnvironmentTeam(r);syncTeaCards(r);return r;
}
// 卡牌識別只在冬柏存在時啟用；相同牌面仍保留各自的實體紀錄。
function syncTeaCards(r,removed={}){
  const Q=r.teaflower;if(!Q)return;
  r.seats.forEach((_,i)=>{
    const old=Q.cards[i]||[],excluded=new Set(removed[i]||[]),used=new Set(),hand=r.hands[i]||[];
    const next=hand.map(card=>{const index=old.findIndex((c,k)=>!c.sunId&&!used.has(k)&&!excluded.has(c.id)&&c.card===card);if(index<0)return null;used.add(index);return old[index]});
    next.forEach((c,k)=>{if(c)return;const same=old[k];if(old.filter(c=>!c.sunId).length===hand.length&&same&&!same.sunId&&!used.has(k)&&!excluded.has(same.id)){used.add(k);next[k]={...same,card:hand[k]}}else next[k]={id:++Q.seq,card:hand[k],bloomed:false}});
    (hostSunCards[i]||[]).filter(c=>c.expires>=r.round).forEach(s=>{const c=old.find(c=>c.sunId===s.id&&!excluded.has(c.id));next.push(c?{...c,card:s.card}:{id:++Q.seq,card:s.card,sunId:s.id,bloomed:false})});
    Q.cards[i]=next;
    // 開花牌在場地改牌後仍為梅花，但牌面點數跟隨改牌結果。
    next.forEach(c=>{if(teaBlooms(r,i).some(m=>m.id===c.id)&&c.card[0]!=='C')teaConvertCard(r,i,c)});
  });
}
function teaConvertCard(r,i,c){
  const old=c.card,next='C'+old.slice(1);if(old===next)return;
  if(c.sunId){const sun=(hostSunCards[i]||[]).find(s=>s.id===c.sunId);if(sun){sun.card=next;if(test||r.seats[i].id===uid)privateSunCards=privateSunCards.map(x=>x.id===sun.id?{...sun}:x);else sendPrivateTo(r.seats[i].id,{sunCardUpdate:{...sun}})}(r.env?.publicSun?.[i]||[]).forEach(s=>{if(s.id===c.sunId)s.card=next})}
  else{const cards=r.teaflower.cards[i].filter(c=>!c.sunId),slot=cards.findIndex(x=>x.id===c.id);r.hands[i]=[...r.hands[i]];r.hands[i][slot]=next;const prior=cards.slice(0,slot).filter(x=>x.card===old).length,visible=(r.up[i]||[]).map((v,k)=>v===old?k:-1).filter(k=>k>=0)[prior]??-1;if(visible>=0){r.up[i]=[...r.up[i]];r.up[i][visible]=next}if(r.st[i].cmd===old)r.st[i].cmd=next;if(visible>=0&&r.env?.ultimatums?.[i]?.card===old)r.env.ultimatums[i].card=next}
  c.card=next;teaBlooms(r,i).forEach(m=>{if(m.id===c.id)m.card=next});
}
function placeTeaBloom(r,i,mark,log=[],exclude=[]){
  const Q=r.teaflower;if(!Q||i===undefined)return false;
  const taken=new Set(teaBlooms(r,i).map(m=>m.id)),blocked=new Set(exclude),free=(Q.cards[i]||[]).filter(c=>!taken.has(c.id)&&!c.bloomed&&!blocked.has(c.id));
  const clubs=free.filter(c=>c.card[0]==='C'),pool=clubs.length?clubs:free;if(!pool.length)return false;
  const c=rnd(pool);teaConvertCard(r,i,c);c.bloomed=true;Q.blooms[i].push({...mark,id:c.id,card:c.card,privateCard:!!c.sunId,pending:false});log.push(`${r.seats[i].name} 的梅花牌獲得1層〔開花〕（共${Q.blooms[i].length}/5；每張牌限一次）`);return true;
}
function addTeaBloom(r,i,sourceSeat,sourceMember,log=[],exclude=[]){if(!r.teaflower||teaBlooms(r,i).length>=5)return false;return placeTeaBloom(r,i,{sourceSeat,sourceMember},log,exclude)}
function teaPlayedRecord(r,i,card,sunId,visible,cardId){const all=r.teaflower?.cards[i]||[];if(cardId){const exact=all.find(c=>c.id===cardId&&!c.sunId&&c.card===card);if(exact)return exact}if(sunId)return all.find(c=>c.sunId===sunId);const cards=all.filter(c=>!c.sunId),up=r.up[i]||[];let allowed=[...up];return cards.find(c=>{const index=allowed.indexOf(c.card),isUp=index>=0;if(isUp)allowed.splice(index,1);return c.card===card&&(visible===undefined||visible===null||isUp===visible)})||cards.find(c=>c.card===card)}
function settleTeaCards(r,before,actions,damageCard,redraws,fail,log=[]){
  if(!r.teaflower)return;
  const old=JSON.parse(JSON.stringify(before.teaflower?.cards||r.teaflower.cards)),removed={},played={};
  r.seats.forEach((_,i)=>{if(redraws.includes(i))removed[i]=old[i].map(c=>c.id);else if(actions[i]){const a=actions[i],c=teaPlayedRecord(before,i,a.card,a.sunId,a.visible,a.cardId);if(c){played[i]=c;removed[i]=a.retained?[]:[c.id]}}});
  syncTeaCards(r,removed);
  r.seats.forEach((_,i)=>{
    const ids=new Set(r.teaflower.cards[i].map(c=>c.id)),moving=teaBlooms(r,i).filter(m=>m.pending||!ids.has(m.id)||played[i]?.id===m.id);r.teaflower.blooms[i]=teaBlooms(r,i).filter(m=>!moving.includes(m));
    for(const m of moving){const card=(old[i].find(c=>c.id===m.id)||m).card,success=!m.pending&&played[i]?.id===m.id&&!!damageCard[i]&&!redraws.includes(i),source=teaSourceState(r,m),enabled=teaSourceEnabled(r,m);
      if(success){if(source&&enabled){source.teaPetals=Math.min(6,(source.teaPetals||0)+1);log.push(`冬柏獲得1層【落英繽紛】（${source.teaPetals}/6）`)}continue}
      if(!m.pending&&!success&&enabled&&source?.teaInner)fail(i,+card.slice(1),m);
      if(!placeTeaBloom(r,i,m,log))r.teaflower.blooms[i].push({...m,id:null,card,pending:true});
    }
  });
}
function teaCardRecord(r,i,card,up=true,slot=null,sunId=null){if(!r?.teaflower||i===undefined)return null;let c;if(sunId)c=r.teaflower.cards[i]?.find(c=>c.sunId===sunId);else{const regular=(r.teaflower.cards[i]||[]).filter(c=>!c.sunId);if(slot===null)c=teaPlayedRecord(r,i,card,null,up);else{let visible=[...(r.up[i]||[])];const records=regular.filter(c=>{const index=visible.indexOf(c.card),isUp=index>=0;if(isUp)visible.splice(index,1);return isUp===!!up});c=records[slot]}}return c}
const teaClubAvailable=(r,i)=>r.chars[i]==='teaflower'&&!envSilent(r)&&!(r.st[i].sealT>0)&&!(r.st[i].teaClubCd>0);

const teaCardMark=(r,i,card,up=true,slot=null,sunId=null)=>{const c=teaCardRecord(r,i,card,up,slot,sunId);return !!c&&teaBlooms(r,i).some(m=>m.id===c.id)};

const kiraCardLocked=(r,i)=>r?.kiraNoPlay?.[i]===r?.round||!!(r?.st?.[i]?.teaSkipRound&&r.st[i].teaBloomRound===r.round);
const d25SkillAvailable=(r,i,id)=>{if(r.cfg.warden)return false;const skill=CHARS[r.chars[i]]?.d25Skills?.find(s=>s.id===id);return !skill?.can||skill.can(r,i)};
const isMiddleFinger=c=>!!CHARS[c]?.middleFinger;
const middleFingerSide=(r,i)=>r.cfg.boss&&i!==1?0:i;
const middleFingerMembers=(r,i)=>environmentMembers(r).filter(m=>isMiddleFinger(m.c)&&middleFingerSide(r,m.i)===middleFingerSide(r,i));
const middleFingerCount=(r,i)=>middleFingerMembers(r,i).length;
const revengeStacks=(r,i,s)=>Math.min(s?.fingerRevenge?.[middleFingerSide(r,i)]||0,middleFingerCount(r,i)*2);
function normalizeFingerRevenge(r){environmentMembers(r).forEach(m=>{Object.keys(m.st.fingerRevenge||{}).forEach(side=>m.st.fingerRevenge[side]=Math.min(m.st.fingerRevenge[side],middleFingerCount(r,+side)*2))});syncEnvironmentTeam(r);return r}
function initMiddleFinger(r){r.lkdRedraws=r.seats.map((_,i)=>lkdRedrawRemaining(r,i));environmentMembers(r).forEach(m=>{if(m.c!=='lkd'||m.st.lkdAssembled)return;m.st.lkdAssembled=1;const others=middleFingerCount(r,m.i)-1;if(others>0){m.st.shield=(m.st.shield||0)+5;m.st.shieldPersistent=(m.st.shieldPersistent||0)+5;r.lkdRedraws[m.i]+=others}});syncEnvironmentTeam(r);return r}
const lkdSoundFile=n=>`assets/audio/sfx/characters/attack_lkd${n}.MP3`;
const lkdArt=s=>s?.lkdArtTurns>0?'lkd2':'lkd1';
CHARS.drunk={n:'醉手夜客',t:'',f:'bus',img:'drunk',sfx:'drunk',d:'【與酒協行 心無所畏】小酌上限10層，各階段累積：1層守護1；2層暗牌槽+1，自己的暗牌與蓋牌選項隱藏；3層強壯1；4層再加1暗牌槽並隨機蓋牌；5層若本回合未醒酒，下次上場取得覺醒（強壯1、守護1、看見全場所有暗牌），持續2次上場回合，結束後才能再次觸發。6層以上爛醉：超過5的每2層強壯1、易損1，所有牌面不可見；覺醒優先解除視野限制。整次連擊實際傷害（含扣盾）≥6時醒酒，小酌-1，每回合最多一次。【酌酒】出牌勾選，跳過下一次自身上場回合；依原始牌面A減1、2～Q加1、K加2，不需命中。自身紅心實際回復>6時，未酌酒也可無視冷卻加1層。10層可立即發動【真鎮終斬】，對目前對手連擊10次各基礎1點傷害，永久刪除目標1個暗牌槽，最低0，不消耗小酌、無冷卻。25絕技：【無形 無音 無念】（覺醒永久持續，5層以上皆可觸發未醒酒條件）、【真•真鎮終斬】（小酌×2基礎群體傷害，含敵方後備，單敵翻倍，每名敵方玩家永久失去1個暗牌槽）。',
  ss:{n:'真鎮終斬',cost:0,repeat:true,can:(r,i)=>(r.st[i].drunkSip||0)>=10,fx:(r,i)=>{const result=runDrunkInstant(r,i,false);r.instantFx={id:(r.instantFx?.id||0)+1,seat:i,chars:[...r.chars],...result};return result.log.join('；')}},
  d25Skills:[
    {id:1,name:'無形 無音 無念',type:'輔助型',desc:'覺醒永久持續，5層以上且本回合未醒酒，下次上場可觸發；已有覺醒立即改為永久',instantFx:(r,i)=>{r.st[i].drunkEndless=1;if(r.st[i].drunkAwake>0)r.st[i].drunkAwake=-1;return '【無形 無音 無念】覺醒不再限時，5層以上皆可觸發覺醒條件。'}},
    {id:2,name:'真•真鎮終斬',type:'進攻型',desc:'敵人含後備各受到小酌×2基礎傷害，單敵翻倍；每名敵方玩家永久失去1個暗牌槽',instantFx:(r,i)=>runDrunkInstant(r,i,true)}
  ]};
const drunkAwake=s=>!!s&&((s.drunkAwake||0)>0||s.drunkAwake===-1);
const drunkExtra=s=>Math.floor(Math.max(0,(s?.drunkSip||0)-5)/2);
const drunkSlots=s=>((s?.drunkSip||0)>=2?1:0)+((s?.drunkSip||0)>=4?1:0);
const drunkActive=(r,i)=>r?.chars?.[i]==='drunk'&&!(r.st[i].sealT>0)&&!envSilent(r);
function drunkCanSee(r,viewer,owner,up=false,concealPhase=false){
  if(!drunkActive(r,viewer))return viewer===owner||up||wardenAllies(r,viewer,owner);
  const st=r.st[viewer];if(drunkAwake(st))return true;
  if(st.drunkSip>=6)return false;
  if(viewer===owner&&st.drunkSip>=2&&(!up||concealPhase))return false;
  return viewer===owner||up||wardenAllies(r,viewer,owner);
}
function beginDrunkTurn(r){if(envSilent(r))return r;r.pair.forEach(i=>{
  const st=r.st[i];if(!drunkActive(r,i)||r.hp[i]<=0||!st.drunkAwakePending||st.drunkAwakePending>=r.round)return;
  st.drunkAwake=st.drunkEndless?-1:2;st.drunkAwakePending=0;r.sLog=[...(r.sLog||[]),`${r.seats[i].name} 獲得【覺醒】（${st.drunkEndless?'永久':'2次上場回合'}），看見全場所有暗牌`];
});syncEnvironmentTeam(r);return r}
// 依每次結算的同來源、同種類傷害合計連擊；立即技能也計入本回合的醒酒限制。
function soberDrunk(r,damage,combat,log){if(envSilent(r))return;const totals=new Map();(damage||[]).forEach((e,index)=>{
  const member=r.team?(e.member??r.act[e.seat]):-1,active=!r.team||member===r.act[e.seat],m=active?{c:r.chars[e.seat],st:r.st[e.seat]}:r.team[e.seat]?.[member];
  if(m?.c!=='drunk'||m.st.sealT>0||m.st.drunkWakeRound===r.round||!(e.amount>0))return;
  const hit=(combat||[]).find(c=>c.damageIndex===index),key=`${e.seat}:${member}:${hit?hit.source+':'+hit.sourceMember+':'+hit.attackKind:'effect:'+(e.environment||'damage')}`;
  const row=totals.get(key)||{st:m.st,seat:e.seat,amount:0};row.amount+=e.amount;totals.set(key,row);
});for(const row of totals.values()){if(row.amount<6||row.st.drunkWakeRound===r.round)continue;row.st.drunkWakeRound=r.round;row.st.drunkSip=Math.max(0,(row.st.drunkSip||0)-1);log.push(`${r.seats[row.seat].name} 的醉手夜客受到整次${tidyHp(row.amount)}點傷害，醒酒，小酌剩${row.st.drunkSip}層（本回合最多一次）`)}}
function finishDrunkTurn(r,mv,sk,heart,log,soundCues){if(envSilent(r))return;r.pair.forEach(i=>{
  if(!drunkActive(r,i)||r.hp[i]<=0)return;const st=r.st[i],hadAwake=drunkAwake(st),card=mv[i],drink=!!card&&!!sk?.[i]&&!(st.drunkCd>0),auto=card?.[0]==='H'&&(heart[i]||0)>6;
  if(drink||auto){const delta=drink?(+card.slice(1)===1?-1:+card.slice(1)===13?2:1):1;st.drunkSip=Math.max(0,Math.min(10,(st.drunkSip||0)+delta));if(drink)st.drunkCd=2;log.push(`${r.seats[i].name} 發動【${drink?'酌酒':'紅心飲酒'}】，小酌${delta>0?'+':''}${delta}（${st.drunkSip}/10）`);soundCues.push({seat:i,file:'assets/audio/sfx/characters/drink_drunk.mp3'})}
  if(st.drunkCd>0)st.drunkCd--;if(st.drunkAwake>0)st.drunkAwake--;
  if(!hadAwake&&!st.drunkAwakePending&&st.drunkWakeRound!==r.round&&(st.drunkEndless?st.drunkSip>=5:st.drunkSip===5))st.drunkAwakePending=r.round;
})}
function syncDrunkHands(r){if(!r.hands)return r;r.drunkSlots={...(r.drunkSlots||{})};r.drunkSlotDebt={...(r.drunkSlotDebt||{})};r.hands={...r.hands};r.up={...r.up};r.deck=[...r.deck];r.pend=[...(r.pend||[])];
  r.seats.forEach((_,i)=>{const want=r.chars[i]==='drunk'?drunkSlots(r.st[i]):0,old=r.drunkSlots[i]||0,delta=want-old;r.drunkSlots[i]=want;if(!delta&&!r.pend.includes(i))return;
    r.hands[i]=[...r.hands[i]];r.up[i]=[...r.up[i]];
    if(delta){const floor=Math.max(r.oc[i],r.up[i].length),capacity=r.hands[i].length+delta-(r.drunkSlotDebt[i]||0),target=Math.max(floor,capacity);r.drunkSlotDebt[i]=Math.max(0,floor-capacity);
      while(r.hands[i].length<target){if(!r.deck.length)r.deck=newDeck(Object.values(r.hands).flat());r.hands[i].push(r.deck.shift())}
      while(r.hands[i].length>target){const hidden=subtractCards(r.hands[i],r.up[i]);if(!hidden.length)break;r.hands[i]=removeCardOnce(r.hands[i],rnd(hidden))}
    }
    r.pend=r.pend.filter(j=>j!==i);const short=r.oc[i]-r.up[i].length;if(!(short>0)||r.hp[i]<=0)return;
    const hidden=subtractCards(r.hands[i],r.up[i]);if(hidden.length<=short)r.up[i].push(...hidden);
    else if(drunkActive(r,i)&&r.st[i].drunkSip>=4){const shuffled=hidden.slice();for(let n=shuffled.length-1;n>0;n--){const j=Math.floor(Math.random()*(n+1));[shuffled[n],shuffled[j]]=[shuffled[j],shuffled[n]]}r.up[i].push(...shuffled.slice(0,short))}
    else r.pend.push(i);
  });return r}
function removeDrunkDarkSlot(r,i,log){const hidden=subtractCards(r.hands[i]||[],r.up[i]||[]);if(!hidden.length){log.push(`${r.seats[i].name} 沒有可刪除的暗牌槽`);return}r.hands={...r.hands,[i]:removeCardOnce(r.hands[i],rnd(hidden))};log.push(`${r.seats[i].name} 永久失去1個暗牌槽`)}
function runDrunkInstant(r,i,group){const next=resolve(r,{},null,null,null,{drunkSlash:i,drunkGroup:group}),result=next.instantResult;delete next.instantResult;Object.assign(r,next);return result}
CHARS.warden={n:'看守',t:'',f:'bus',hidden:true,v3only:true,img:'warden',d:'所有階段受到斬殺時，改為承受基礎設定生命×1.2的固定傷害，護盾與大地之牆仍生效；第一階段挑戰者理智不低於-30，二階段起恢復一般-45下限；挑戰者可不限次數換人，每階段開始各增加2次免費換牌，可累積並隨隊伍保留。第一階段【神之代理人】：理智不低於0，初始持有3層不穩定展現；每回合隨機賦予一名挑戰者搏動或停止。可消耗10／20／30層保存，使本回合兩張牌各+1／2／3點。【神聖刑罰燭台】：不穩定展現消失後生成兩隻燭台；全滅後空過3回合再生成。燭台每兩回合降低挑戰者手牌點數，並準備懲罰。懲罰使出牌化為不可被方塊阻擋的15點固定特殊攻擊。【完美保存】：出牌原始點數累積保存（上限100），累計每消耗30層增加1層完美保存（上限10），每回合依奇數／偶數層重新獲得強壯／守護。進入第二階段只保留保存、完美保存與理智，清除燭台，理智至少30。第二階段【審判之日】：理智不低於30，分別為不同挑戰者施加搏動／停止；保存10／20／30層加兩張牌點數，50層暫停下兩回合施加。保存消耗等量累積漆黑之神的聲音，到100轉為100層權能、獲得1層西西弗刑的看守及死刑預告。權能回合末-10，受傷量×2扣層，每20層回合初獲得1強壯，耗盡轉回聲音；西西弗每層提供1守護。死刑預告下一回合依5～20的指定數字±2，合計兩名挑戰者原牌，達標各獲得基礎生命×1.2護盾，再各承受基礎生命×1固定傷害，所有敵方牌效無效。告解工具依失敗／成功／成功且原牌10以上施加1／2／3層告解證據，上限9、最後花色覆蓋種類並累加層數；存活挑戰者與後備每層證據令牧師傷害+1%，向下取整，死刑除外。黑桃定罪：3／6層虛弱1／3，9層禁方塊且受傷雙倍；梅花審判：回合初floor(層數/2)固定傷害，9層10點；方塊刑罰：回合末降等量理智，9層回合初設為-45；紅心贖罪：超過4層回合初全部手牌-1，9層-5，最低A。後備回合末減1、上場紅心成功減2；9層不能減層，須上場觸發後清零。'};
CHARS.nut={n:'高堅果',t:'',f:'pvz',v3only:true,d:'【PVZ陣營】3v3專用角色，不可出陣，只能永久待在後備。血量上限及基礎血量為設定值×1.2。此角色存活時，我方任何角色受到傷害時，傷害（已計算完易損、守護、護盾等後的最終傷害）將轉移到高堅果身上（包括斬殺）；高堅果倒下後不再保護。'};
CHARS.wood={n:'火炬樹樁',t:'',f:'pvz',v3only:true,img:'wood',sfx:'wood',d:'【PVZ陣營】3v3專用後備植物，不可上場。遊戲開始時一次性給予首發角色10點護盾，並提供主動技能【火炬】4次：本回合出牌點數×2；若對手已出牌，會退還對手的牌。護盾只吸收現有盾量，溢出傷害會扣除生命。'};
CHARS.sunflower={n:'向日葵',t:'',f:'pvz',v3only:true,img:'sunflower',sfx:'sunflower',d:'【PVZ陣營】3v3專用後備植物，不可上場。遊戲開始時給予首發角色1層永久守護。每回合開始隨機獲得1～3點陽光；可消耗4點陽光選擇花色，獲得一張點數7的暫時手牌，可於當回合或下回合打出，之後消失。'};
CHARS.rean={n:'黎恩',t:'舒華澤',f:'trails',d:'【軌跡陣營】使用CP（隊伍共用）施放技能。主動技（皆為戰技，出牌後於下個回合開始時生效，擇一）：①緋葉剣（30CP）：封鎖敵方技能（含被動）1回合，並給與1層炎傷（回合結束受到炎傷層數的傷害，接著層數-1）。②六連疾風（60CP）：本回合造成的傷害不會被方塊消掉，改為傷害減半（對方出方塊依然會受到反擊傷害），且為群體攻擊（對方只剩一人或一般模式時，改為傷害不減半）。③火紋之太刀（50CP）：本回合點數倍率+50%（向下取整），回合結束時給與敵方2層易損及2層虛弱，持續2回合。④【S技】神氣合一（100CP）：立即給與自己5回合的神氣合一狀態：造成傷害+50%（點數倍率）、受到傷害-50%，戰技強化：烈・緋葉剣（封鎖2回合、2層炎傷）、烈・六連疾風（點數倍率+30%）、火紋之太刀・淺蔥（點數倍率+70%，改為2回合4層易損及4層虛弱）；神氣合一狀態不能再開神氣合一。25絕技：【無想神氣合一】（永久獲得神氣合一全部效果，傷害倍率由1.5改為1.8，仍減傷50%並強化戰技）、【柒型-無】（永久使戰技CP消耗減半，三種戰技分別消耗15／30／25CP；S技仍消耗100CP）。',
 arts:[{id:'hiba',n:'緋葉剣',n2:'烈・緋葉剣',cost:30},{id:'roku',n:'六連疾風',n2:'烈・六連疾風',cost:60,carry:true},{id:'karyu',n:'火紋之太刀',n2:'火紋之太刀・淺蔥',cost:50,carry:true}],
 ss:{n:'神氣合一',cost:100,can:(r,i)=>!shinActive(r.st[i]),fx:(r,i)=>{r.st[i].shin=5;return '進入神氣合一狀態（5回合）'}},
 d25Skills:[
   {id:1,name:'無想神氣合一',type:'進攻型',desc:'永久獲得神氣合一全部效果：傷害倍率1.8、減傷50%，並強化三種戰技',
     instantFx:(r,i,o)=>{r.st[i].musouShin=1;r.st[i].shin=1;return '進入永久【無想神氣合一】：傷害倍率1.8、受到傷害減少50%，並強化所有戰技！';}},
   {id:2,name:'柒型-無',type:'輔助型',desc:'永久使戰技CP消耗減半：緋葉剣15CP、六連疾風30CP、火紋之太刀25CP；S技仍消耗100CP',
     instantFx:(r,i,o)=>{r.st[i].artCpHalf=1;return '獲得永久被動【柒型-無】：戰技CP消耗減半（15／30／25CP），S技仍消耗100CP！';}}
 ]};
CHARS.estelle={n:'艾斯蒂爾',t:'布萊特',f:'trails',d:'【軌跡陣營】戰技（出牌後，於下個回合開始時生效，擇一）：①旋風輪（30CP）：給與敵方群體1回合1層易損及1層虛弱。②金剛擊（50CP）：給與敵方2回合造成傷害減半。③鼓舞（50CP）：給與自己2回合被動CP上升（回合開始時+10CP），並給與我方群體2回合傷害增加30%及受到傷害減少20%（只有自己時，改為回合數翻倍）。④【S技】太極輪（100CP）：強制暈眩敵方2回合。25絕技：【鳳凰烈波】（所有存活敵人含後備獲得1回合暈眩及4層炎傷）、【太陽】（我方全體存活角色含自己及後備，立即回復各自最大生命的一半，並獲得3回合60%減傷；回合數不翻倍，減傷在所屬隊伍參戰後扣除）。',
 arts:[{id:'whirl',n:'旋風輪',cost:30},{id:'kongo',n:'金剛擊',cost:50},{id:'inspire',n:'鼓舞',cost:50}],
 ss:{n:'太極輪',cost:100,fx:(r,i,o)=>{r.st[o].stun=Math.max(r.st[o].stun||0,2);return `${r.seats[o].name} 被強制暈眩 2 回合`}},
 d25Skills:[
   {id:1,name:'鳳凰烈波',type:'進攻型',desc:'所有存活敵人（含後備）獲得1回合暈眩，同時附加4層炎傷',
     instantFx:(r,i,o)=>{forD25Side(r,i,false,(j,k,c,s0)=>{s0.stun=Math.max(s0.stun||0,1);s0.burn=(s0.burn||0)+4});return '【鳳凰烈波】使所有敵人（含後備）獲得1回合暈眩及4層炎傷！';}},
   {id:2,name:'太陽',type:'輔助型',desc:'我方全體存活角色（含自己及後備）回復各自最大生命的一半，並獲得3回合60%減傷；所屬隊伍參戰後扣除減傷回合數',
     instantFx:(r,i,o)=>{const log=[],healing=[];forD25Side(r,i,true,(j,k,c,s0)=>{
       const m=k<0?null:r.team[j][k],before=m?m.hp:r.hp[j],limit=characterMaxHp(r,j,c,s0),after=healedHp(before,limit,envHeal(r,Math.ceil(limit*.5*healingFactor(s0))),c,s0,[],r.seats[j].name);
       if(m)m.hp=after;else r.hp[j]=after;addHealingFx(healing,r,j,after-before,k,i);if(c==='san'&&after>before)s0.feast=(s0.feast||0)+(s0.feastBoost?Math.round((after-before)*1.5):after-before);s0.fx=(s0.fx||[]).filter(x=>x.source!=='sun');s0.fx.push({k:'rd',n:.6,t:3,source:'sun'});
       log.push(`${r.seats[j].name}${m?' 的後備 '+CHARS[c].n:''} 回復 ${after-before} 點生命${healingNote(s0)}，獲得3回合60%減傷`);
     });return {log,healing};}}
 ]};
const leoArts=[{id:'smash',n:'滅碎劍',cost:40},{id:'zero',n:'零式風暴',cost:40},{id:'clone',n:'分身',cost:50,can:(r,i)=>!(r.team&&r.team[i].some(m=>m.c==='leoc'&&!m.dead))},{id:'wall',n:'大地之牆',cost:60}];
const leoSS={n:'冥皇劍',cost:100,fx:(r,i,o)=>{const targets=r.team?(r.cfg.boss?(i===1?[0,2]:[1]):r.seats.map((_,j)=>j).filter(j=>j!==i)):[o],alive=targets.reduce((n,j)=>n+(r.team?r.team[j].filter((m,k)=>canDeploy(m.c)&&(k===r.act[j]?r.hp[j]>0:!m.dead&&m.hp>0)).length:r.hp[j]>0?1:0),0),n=alive<2?2:1;
  targets.forEach(j=>{if(r.hp[j]>0)r.st[j].stun=Math.max(r.st[j].stun||0,n);if(r.team)r.team[j].forEach((m,k)=>{if(k!==r.act[j]&&!m.dead&&m.hp>0&&m.c!=='nut')m.st.stun=Math.max(m.st.stun||0,n)})});
  return `${targets.map(j=>r.seats[j].name).join('、')} 的${r.team?'全體角色':'角色'}被暈眩 ${n} 回合`}};
CHARS.leo={n:'劍帝萊維',t:'',f:'trails',v3only:true,d:'【軌跡陣營】3v3專用角色，佔用三格角色格（只能首選，消耗全部角色格，整隊只有他一人；分身除外）。被動【劍帝】：獲得的CP×1.5；死亡時以最大生命值×0.6復活（一次），並獲得【修羅之炎】（立即獲得100CP、受到傷害減少50%並持續1回合，永久獲得2層強壯）。戰技（出牌後於下個回合開始時生效）：①滅碎劍（40CP）：給與敵人6層易損，1回合。②零式風暴（40CP）：解除自己身上的易損及虛弱，使對方的強壯無效2回合。③分身（50CP）：創造5點生命的分身（沒有劍帝被動），下回合自動切換操縱角色為分身。④大地之牆（60CP）：給與己方群體一次抵擋任何傷害的效果（包括斬殺）；只剩1人時也只有一次，不會翻倍。⑤【S技】絕技・冥皇劍（100CP）：給與敵方群體1回合暈眩。25絕技：【鬼炎斬】（敵方全體含後備附加6層炎傷）、【劍帝】（立即額外召喚3個5點生命的分身，己方全體含自己、分身及後備永久獲得1層強壯；不自動換人）。',arts:leoArts,ss:leoSS,
 d25Skills:[
   {id:1,name:'鬼炎斬',type:'進攻型',desc:'給予敵方全體存活角色（含後備）6層炎傷',
     instantFx:(r,i,o)=>{forD25Side(r,i,false,(j,k,c,s0)=>{s0.burn=(s0.burn||0)+6});return '【鬼炎斬】對敵方全體角色（含後備）附加6層炎傷！';}},
   {id:2,name:'劍帝',type:'輔助型',desc:'立即額外召喚3個5點生命的分身，並給予己方全體存活角色（含自己、分身及後備）1層永久強壯；不自動換人',
     instantFx:(r,i,o)=>{if(r.team)for(let n=0;n<3;n++)r.team[i].push({c:'leoc',hp:5,st:newSt(),dead:false});forD25Side(r,i,true,(j,k,c,s0)=>{s0.asuraStrong=(s0.asuraStrong||0)+1});return `${r.team?'立即召喚3個5點生命的劍帝分身；':''}己方全體角色（含自己及分身）獲得1層永久強壯！`;}}
 ]};
CHARS.leoc={n:'劍帝分身',t:'',f:'trails',hidden:true,v3only:true,img:'leo',sfx:'leo',d:'劍帝萊維的分身，5點生命，沒有劍帝被動，可使用其餘戰技與S技。',arts:leoArts.filter(a=>a.id!=='clone'),ss:leoSS};
CHARS.shi_faust={n:'浮士德',t:'四協',d:'【Limbus陣營】主動技能【拉弓】：按下後，下回合開始進入拉弓模式。拉弓模式下，除紅心外所有牌的點數減少70%（最低為1）；每回合結束時獲得1層矢（最多4層）。拉弓模式下再按一次技能（【放矢】），會在下回合取消拉弓，並依身上的矢層數對敵方產生效果（持續2回合）：1層－1層易損；2層－3層易損、1層虛弱；3層－4層易損、4層虛弱；4層－5層易損、5層虛弱，並使自己獲得1層紅矢。放矢後矢歸零。紅矢：下一張黑桃點數×3，或下一張梅花點數×5（每次發動消耗1層）。25絕技：【立即矢裝填】（立即獲得2層紅矢）、【高速矢裝填】（永久使拉弓每回合獲得4層矢，仍以4層為上限）。',
  d25Skills:[
    {id:1,name:'立即矢裝填',type:'進攻型',desc:'立即獲得2層紅矢；每張黑桃或梅花牌消耗1層，分別使點數×3或×5',
      instantFx:(r,i,o)=>{r.st[i].rarrow=(r.st[i].rarrow||0)+2;return `立即獲得2層紅矢（共${r.st[i].rarrow}層），每張黑桃或梅花牌消耗1層！`;}},
    {id:2,name:'高速矢裝填',type:'輔助型',desc:'永久使拉弓每回合獲得4層矢，矢層數上限仍為4；沿用原本拉弓與放矢時機',
      instantFx:(r,i,o)=>{r.st[i].fastBow=1;return '獲得永久被動【高速矢裝填】：拉弓每回合獲得4層矢（上限4層）！';}}
  ]};
CHARS.lei={n:'雷橫',t:'',d:'【Limbus陣營】登場後的第一個回合開始時獲得8層虎標彈（之後不會再裝填）。每次出牌可選擇消耗0~3枚虎標彈，每消耗1枚，該牌點數+1。若本次消耗完後虎標彈=0，獲得5層猛虎標彈。擁有猛虎標彈時，每次出牌必須消耗1~5枚猛虎標彈：消耗1/2/3/4枚，該牌點數+1/3/5/7；一次消耗5枚時，本次攻擊轉換為特殊攻擊【快刀亂麻】：出牌視為黑桃並獲得+8點數，同時造成最終傷害×0.6的群體攻擊（對方只剩一人或一般模式時效果翻倍，即×1.2；Boss挑戰賽Boss方的群體攻擊會攻擊兩位挑戰者且不翻倍；若被方塊擋下，後備不會受傷）。猛虎標彈用完時獲得【過熱】：獲得3層虛弱（永久）；用完後沒有標彈，不會再裝填。25絕技：【超絕猛虎殺擊亂斬】（對全場敵人含後備連擊6次，每擊隨機1～3點固定傷害，不受威力增減或減傷影響）、【心-雷橫】（從戰鬥第一回合累積自身實際生命損失，每損失5點獲得1層永久強壯；回血不抵銷，護盾損失不計）。',
  d25Skills:[
    {id:1,name:'超絕猛虎殺擊亂斬',type:'進攻型',desc:'對全場敵人（含後備）連擊6次，每擊隨機1～3點固定傷害，不受威力增減或減傷影響，仍可被護盾、高堅果或大地之牆抵擋',
      instantFx:(r,i,o)=>{
        const next=resolve(r,{},null,null,null,{leiUltimate:i}),result=next.instantResult;
        delete next.instantResult;Object.assign(r,next);return result;
      }},
    {id:2,name:'心-雷橫',type:'輔助型',desc:'獲得永久被動心-雷橫：從戰鬥第一回合累積自身實際生命損失，每5點獲得1層強壯，回血不抵銷，護盾損失不計',
      instantFx:(r,i,o)=>{
        r.st[i].xinLei=1;const lost=r.st[i].leiHpLost||0;
        return `獲得永久被動【心-雷橫】！已累積損失 ${lost} 點生命，立即獲得 ${Math.floor(lost/5)} 層強壯；此後每累積損失5點生命再獲得1層，回血不抵銷累積值，護盾損失不計！`;
      }}
  ]};
CHARS.dihui={n:'地彗星',t:'',f:'bus',d:'【Limbus陣營】順行－憐憫：使用紅色牌（♥/♦）時獲得1層；逆行－憎惡：使用黑色牌（♠/♣）時獲得1層。可在回合中選擇下回合啟用順行或逆行效果；順行每層獲得1層虛弱及守護；逆行每層獲得1層易損及強壯。每2層順行與逆行總和，對手獲得1層「已確定的對手」：每回合隨機標記對手手牌，標記數＝最大手牌數－此層數，至少標記1張。對手使用未被標記的牌時，地彗星獲得1層「殘像糾纏」。每層殘像糾纏使地彗星每次造成傷害後追加真實追擊，傷害為該次實際造成傷害的20%×殘像糾纏層數，向下取整、至少1點；追擊傷害不受任何增傷或減傷影響。25絕技：【殘像暴走】（自身獲得3層殘像糾纏，敵人若未出標記牌則受到該牌點數×(20%×殘像糾纏層數)的固定傷害）、【心-地慧星】（獲得心-地慧星：順行與逆行不再有負面效果，順行不獲得虛弱，逆行不獲得易損）。',
  d25Skills:[
    {id:1,name:'殘像暴走',type:'進攻型',desc:'自身獲得3層殘像糾纏，且敵人若未出標記牌則受到該牌點數×(20%×殘像糾纏層數)的固定傷害',
      instantFx:(r,i,o)=>{
        r.st[i].afterimage=(r.st[i].afterimage||0)+3;
        r.st[i].afterimageRampage=1;
        return `發動【殘像暴走】！自身獲得 3 層殘像糾纏（共 ${r.st[i].afterimage} 層）！此後敵人若使用未被標記的牌，將直接受到該牌點數 × (20% × 殘像糾纏層數) 的固定傷害！`;
      }
    },
    {id:2,name:'心-地慧星',type:'輔助型',desc:'獲得被動心-地慧星：順行與逆行不再有負面效果，順行不獲得虛弱，逆行不獲得易損',
      instantFx:(r,i,o)=>{
        r.st[i].xinDihui=1;
        if(r.st[i].dihuiBuff){
          if(r.st[i].dihuiBuff.weak)delete r.st[i].dihuiBuff.weak;
          if(r.st[i].dihuiBuff.vuln)delete r.st[i].dihuiBuff.vuln;
        }
        return `獲得被動【心-地慧星】！自身的順行與逆行將不再有負面效果（順行不獲得虛弱，逆行不獲得易損）！`;
      }
    }
  ]};
CHARS.ailan={n:'艾蘭',t:'夜錐組組長',f:'bus',img:'bug',sfx:'bug',d:'【Limbus陣營】造成單次實際傷害大於5時，給予目標1層創傷；創傷達2層後，於目標下回合開始轉為深度創傷，之後不再累積創傷。創傷使目標獲得的治療量×0.66（向上取整）；深度創傷使治療量×0.33（向上取整）。目標生命低於最大生命的20%時，回合結束對其發動1～3點單方面攻擊；目標有深度創傷或超深度創傷時，不論生命值皆會觸發。25絕技：【超追擊】（夜錐追擊最終傷害固定為5，不受增減傷影響，仍可被護盾、高堅果或大地之牆抵擋）、【超深度創傷】（全場敵方角色永久禁療，覆蓋創傷及深度創傷）。',
  d25Skills:[
    {id:1,name:'超追擊',type:'進攻型',desc:'夜錐追擊最終傷害固定為5，不受增減傷影響，仍可被護盾、高堅果或大地之牆抵擋',
      instantFx:(r,i,o)=>{r.st[i].superChase=1;return '獲得永久被動【超追擊】！夜錐追擊最終傷害固定為5，不受增減傷影響，仍可被護盾、高堅果或大地之牆抵擋！'}},
    {id:2,name:'超深度創傷',type:'輔助型',desc:'給予全場敵方角色（含後備）超深度創傷，覆蓋創傷與深度創傷，本局永久無法回復生命',
      instantFx:(r,i,o)=>{
        const targets=r.seats.map((_,j)=>j).filter(j=>j!==i&&(!r.cfg.boss||i===1||j===1)),names=[];
        const apply=s0=>{s0.superDeepTrauma=1;s0.trauma=0;s0.traumaPending=0;s0.deepTrauma=0};
        targets.forEach(j=>{apply(r.st[j]);if(r.team)r.team[j].forEach(m=>apply(m.st));names.push(r.seats[j].name)});
        return `【超深度創傷】覆蓋全場敵方角色（含後備）：${names.join('、')}。本局永久禁療，紅心、吸血、絕技及其他生命回復均無效，換人或艾蘭離場也不會解除！`;
      }}
  ]};
CHARS.firefu={n:'浮士德',t:'紅艷煞',f:'bus',img:'firefu1',sfx:'firefu',d25Bgm:'firefu',d:'【Limbus陣營】開局自帶1層毅力。從第2次自己上場的出牌階段起，每隔一次上場隨機燒毀1張手牌及其卡槽，最大生命值-2（最低1），獲得永久強壯2。卡牌燒完後獲得唯一手牌【渴火】：每次補回隨機花色、牌面固定10點，仍受點數加成，永久保持暗牌；僅剩渴火時停止燒牌。25絕技：【紅艷煞】（恢復開局卡槽數、補滿手牌及最大生命，額外毅力1；保留永久強壯）、【最大感應-[劣化侵蝕]】（全體存活角色含自己及後備受到基礎20點傷害，照常計算減傷、護盾與毅力）。',
  d25Skills:[
    {id:1,name:'紅艷煞',type:'輔助型',desc:'恢復開局卡槽數並補滿手牌，恢復最大生命，額外獲得1層毅力；保留永久強壯，不回復當前生命',instantFx:(r,i)=>restoreFirefu(r,i)},
    {id:2,name:'最大感應-[劣化侵蝕]',type:'進攻型',desc:'全體存活角色（含自己及後備）受到基礎20點傷害，逐一計算減傷、護盾、毅力、復活及換人',instantFx:(r,i)=>{r.st[i].firefu25=1;const next=resolve(r,{},null,null,null,{firefuUltimate:i}),result=next.instantResult;delete next.instantResult;Object.assign(r,next);return result;}}
  ]};
CHARS.lucio={n:'盧西奧',t:'',f:'bus',img:'lucio',sfx:'lucio',d25BgmFile:'bgm.mp3',d:'【Limbus陣營】搖搖欲墜的姿勢：雙方出黑牌時拼點，盧西奧的點數須至少5；平手算盧西奧贏，遇瓦倫希娜平手則預知眼優先。觸發時給目標1層決鬥高潮（上限6，永久保留於該角色），本次新增層數不計入本次拼點或強壯。拼點點數額外增加目標原有高潮層數；當回合獲得目標原有高潮÷2的強壯（向上取整）。逐漸完備的教材：與帶有高潮的目標拼點獲勝，教材+1（上限3）。有教材時，基礎點數不足5的牌出牌時改為5+教材層數，轉換後可拼點。絕望的決鬥：友軍含後備有瓦倫希娜時，初始生命與上限×0.8，獲得1層教材與3次自己上場的虛弱1；盧西奧真正倒下後，所有友軍瓦倫希娜獲得永久心-不光彩（強壯1）。25絕技：【解鹿】（全體帶高潮的敵人含後備受到4×高潮層數的基礎傷害，不吃攻擊方增減，照常計算易損、守護、減傷、護盾與毅力）、【盧西奧！瞄準心臟！】（立即教材+1，轉換改為8+教材層數，教材無上限）。任一25技後切換立繪2。',
  d25Skills:[
    {id:1,name:'解鹿',type:'進攻型',desc:'全體帶決鬥高潮的敵人（含後備）受到4×高潮層數的基礎傷害，不吃攻擊方加成；照常計算受擊方防護',instantFx:(r,i)=>{r.st[i].lucio25=1;const next=resolve(r,{},null,null,null,{lucioUltimate:i}),result=next.instantResult;delete next.instantResult;Object.assign(r,next);return result;}},
    {id:2,name:'盧西奧！瞄準心臟！',type:'輔助型',desc:'立即教材+1，基礎點數不足5的牌改為8+教材層數，教材不再有上限',instantFx:(r,i)=>{const s=r.st[i];s.lucio25=1;s.lucioHeart=1;addLucioLesson(s);return `【盧西奧！瞄準心臟！】教材+1（共${s.lucioLesson}），無上限；低點牌轉換為8+教材＝${8+s.lucioLesson}點！`;}}
  ]};
CHARS.xichn={n:'賈惜春',t:'',f:'bus',img:'xichun',sfx:'xichun',d:'【Limbus陣營】【余桓】有存活且可上場的後備時，受到非斬殺傷害後生命低於目前最大生命50%，本次生命固定為50%（向上取整），立即隨機換上後備，不耗換人次數，每場一次；連擊後續打到接替角色。【始動】3v3中，玩家參與戰鬥的回合結束時，後備惜春獲得1層待，上限5。登場消耗全部待，對目前對手發動一次min(待,3)點固定傷害單方面攻擊，不受威力增減影響；5層改攻擊全體敵人含後備，只剩一名敵人時沿用群攻翻倍。【切磋琢春】初始虛弱3、易損3、自身紅心治療衰減5，生命上限為基礎血量0.7倍。場上黑牌整次實際傷害總和>5、紅心成功回血、成功反擊整次傷害>5、成功斷補，分別推進威力、紅心治療、防護、生命路線。每條路線每回合他人達成最多1階，自己達成共2階，後備也能成長；各路最高6階。生命倍率依序0.7／0.8／0.9／1／1.1／1.2／1.3，向上取整，增加上限時同步增加目前生命差額。25絕技：【醉睡浪浪春】（對目前對手造成基礎15點傷害，施加1回合麻痺）、【智 勇 仁】（四條成長路線各前進3階）。',
  d25Skills:[
    {id:1,name:'醉睡浪浪春',type:'進攻型',desc:'對目前對手造成基礎15點傷害並施加1回合麻痺',instantFx:(r,i)=>{const next=resolve(r,{},null,null,null,{xichnUltimate:i}),result=next.instantResult;delete next.instantResult;Object.assign(r,next);return result;}},
    {id:2,name:'智 勇 仁',type:'輔助型',desc:'切磋琢春四條路線各前進3階；生命上限提升時同步增加目前生命差額',instantFx:(r,i)=>{const log=[];xichnAdvance(r,i,r.act?.[i]??-1,[3,3,3,3],log);syncEnvironmentTeam(r);return {log};}}
  ]};
const XICHN_ROUTES=['威力','紅心治療','防護','生命'];
const xichnStages=s=>(s.xichnStages||[0,0,0,0]).map(n=>Math.min(6,Math.max(0,n||0)));
const xichnHealBonus=s=>[-5,-3,-1,0,1,3,5][xichnStages(s)[1]];
const xichnHeartGain=(c,s,n)=>c==='xichn'&&!(s.sealT>0)&&n>0?Math.max(0,n+xichnHealBonus(s)):n;
function armXichn(r){if(!r?.st)return r;r.st.forEach((s,i)=>{s.xichnCanExit=r.chars[i]==='xichn'&&!!r.team&&r.team[i].some((m,k)=>k!==r.act[i]&&!m.dead&&m.hp>0&&canDeploy(m.c));if(r.team)r.team[i].forEach((m,k)=>m.st.xichnCanExit=k===r.act[i]&&s.xichnCanExit)});return r}
function initXichn(r){const apply=(i,c,s,hp)=>{if(c!=='xichn'||s.xichnInit)return hp;s.xichnInit=1;s.xichnStages=[0,0,0,0];return characterMaxHp(r,i,c,s)};if(r.team)r.team.forEach((t,i)=>t.forEach(m=>m.hp=apply(i,m.c,m.st,m.hp)));r.seats.forEach((_,i)=>{if(r.team){const m=r.team[i][r.act[i]];r.hp[i]=m.hp;r.st[i]=JSON.parse(JSON.stringify(m.st))}else r.hp[i]=apply(i,r.chars[i],r.st[i],r.hp[i])});return armXichn(r)}
function xichnAdvance(r,i,k,steps,log){const active=k<0||k===r.act?.[i],m=active?null:r.team[i][k],s=active?r.st[i]:m.st,c=active?r.chars[i]:m.c;if(c!=='xichn')return;const beforeMax=characterMaxHp(r,i,c,s),before=xichnStages(s);s.xichnStages=before.map((n,j)=>Math.min(6,n+(steps[j]||0)));const delta=characterMaxHp(r,i,c,s)-beforeMax;if(delta>0){if(active)r.hp[i]+=delta;else m.hp+=delta}const changed=s.xichnStages.map((n,j)=>n>before[j]?`${XICHN_ROUTES[j]}${before[j]}→${n}`:'').filter(Boolean);if(changed.length)log.push(`${r.seats[i].name} 的賈惜春【切磋琢春】：${changed.join('、')}${delta>0?`，最大及目前生命+${delta}`:''}`)}
function learnXichn(r,events,log,blocked=[]){if(envSilent(r)||!events.length)return;const members=environmentMembers(r).filter(m=>m.c==='xichn'&&!(m.st.sealT>0)&&!blocked.includes(`${m.i}:${m.k<0?r.act?.[m.i]??-1:m.k}`));members.forEach(m=>{const quota=m.st.xichnGrowth||{};events.forEach(e=>{const old=quota[e.route]?.round===r.round?quota[e.route].earned:0,wanted=e.seat===m.i&&e.member===(m.k<0?r.act?.[m.i]??-1:m.k)?2:1;if(wanted<=old)return;const steps=[0,0,0,0];steps[e.route]=wanted-old;xichnAdvance(r,m.i,m.k,steps,log);quota[e.route]={round:r.round,earned:wanted}});m.st.xichnGrowth=quota})}
function waitXichn(r,pair,round,log,blocked=[]){if(!r.team||envSilent(r))return;r.team.forEach((t,i)=>{if(!pair.includes(i))return;t.forEach((m,k)=>{if(k===r.act[i]||m.c!=='xichn'||m.dead||m.hp<=0||m.st.sealT>0||m.st.xichnWaitRound===round||blocked.includes(`${i}:${k}`))return;m.st.xichnWaitRound=round;m.st.xichnWait=Math.min(5,(m.st.xichnWait||0)+1);log.push(`${r.seats[i].name} 的後備賈惜春獲得1層〔待〕（${m.st.xichnWait}/5）`)})})}
// 所有換人共用登場結算；使用即時傷害流程，不額外推進回合。
function enterXichn(before,state,options){if(!state.team||before.d25Batch||options.silent)return state;let next={...before,...state};const arrivals=next.seats.map((_,i)=>i).filter(i=>next.act[i]!==before.act[i]&&next.chars[i]==='xichn'&&next.hp[i]>0&&next.st[i].xichnWait>0&&!(next.st[i].sealT>0)&&!envSilent(next));for(const i of arrivals){if(next.chars[i]!=='xichn'||next.hp[i]<=0)continue;const out=resolve(next,{},null,null,null,{xichnEntry:i}),fx=out.instantResult;delete out.instantResult;next=out;const offset=options.damage?.length||0;if(fx?.soundCues&&options.hits?.includes(i))fx.soundCues.forEach(e=>e.replaceAttack=false);if(fx?.combat)fx.combat.forEach(e=>{if(Number.isInteger(e.damageIndex))e.damageIndex+=offset});options.log.push(...(fx?.log||[]));for(const key of ['damage','combat','healing','hits','soundCues'])if(options[key])options[key].push(...(fx?.[key]||[]))}next.hp.forEach((v,i)=>options.hp[i]=v);next.st.forEach((v,i)=>options.st[i]=v);next.cp.forEach((v,i)=>options.cp[i]=v);return {team:next.team,act:next.act,swapsLeft:next.swapsLeft,chars:next.chars,hp:options.hp,st:options.st,cp:options.cp}}
const lucioAllies=(r,i)=>r.cfg.boss&&i!==1?[0,2]:[i];
const lucioBase=(s,card)=>+card.slice(1)<5&&(s.lucioLesson||0)>0?(s.lucioHeart?8:5)+s.lucioLesson:+card.slice(1);
const lucioCard=(c,s,card)=>c==='lucio'?card[0]+lucioBase(s,card):card;
const addLucioLesson=s=>s.lucioLesson=s.lucioHeart?(s.lucioLesson||0)+1:Math.min(3,(s.lucioLesson||0)+1);
// 在選角完成後初始化所有實例，後備與Boss友軍也套用；換人不重複初始化。
function initLucio(r){
  const apply=(i,c,s,hp)=>{if(c!=='lucio'||s.lucioInit)return hp;s.lucioInit=1;
    const hasVal=lucioAllies(r,i).some(j=>r.team?r.team[j].some(m=>m.c==='val'):r.chars[j]==='val');
    if(!hasVal)return hp;s.lucioDespair=1;s.lucioLesson=1;s.fx.push({k:'w',n:1,t:3,source:'lucioDespair'});return characterMaxHp(r,i,c,s);
  };
  if(r.team)r.team.forEach((t,i)=>t.forEach(m=>m.hp=apply(i,m.c,m.st,m.hp)));
  r.seats.forEach((_,i)=>{if(r.team){const m=r.team[i][r.act[i]];r.hp[i]=m.hp;r.st[i]=JSON.parse(JSON.stringify(m.st))}else r.hp[i]=apply(i,r.chars[i],r.st[i],r.hp[i])});return r;
}
// 強壯只屬於盧西奧本回合，取本回合對手原有層數；新增高潮留待下次使用。
function beginLucioTurn(r){
  if(envSilent(r))return r;
  r.st.forEach((s,i)=>{if(r.chars[i]!=='lucio')return;const o=battleOpponent(r,i);
    s.lucioStrong=r.pair.includes(i)&&r.hp[i]>0&&!(s.sealT>0)&&o!==undefined?Math.ceil((r.st[o].duelClimax||0)/2):0;
    if(r.team)r.team[i][r.act[i]].st=JSON.parse(JSON.stringify(s));
  });return r;
}
// 只在真正倒下後授予被動。先讀取倒下實例，再同步主動與後備，避免換人覆蓋。
function rewardLucioDeath(r,log){
  const deaths=[];
  if(r.team)r.team.forEach((t,i)=>t.forEach((m,k)=>{if(m.c==='lucio'&&m.hp<=0&&!m.st.lucioDeathGiven)deaths.push({i,s:m.st})}));
  else r.chars.forEach((c,i)=>{if(c==='lucio'&&r.hp[i]<=0&&!r.st[i].lucioDeathGiven)deaths.push({i,s:r.st[i]})});
  deaths.forEach(({i,s})=>{s.lucioDeathGiven=1;lucioAllies(r,i).forEach(j=>{
    const give=(c,s0)=>{if(c!=='val'||s0.valDishonor)return;s0.valDishonor=1;log.push(`${r.seats[j].name} 的瓦倫希娜因友軍盧西奧倒下，獲得永久【心-不光彩】：強壯1`)};
    give(r.chars[j],r.st[j]);if(r.team)r.team[j].forEach(m=>give(m.c,m.st));
  })});
  if(r.team)r.seats.forEach((_,i)=>{const m=r.team[i][r.act[i]];if(m.c==='lucio'&&m.st.lucioDeathGiven)r.st[i].lucioDeathGiven=1;m.st=JSON.parse(JSON.stringify(r.st[i]))});
}
const firefuArt=s=>s?.firefu25?'firefu3':s?.firefuThirst?'firefu2':'firefu1';
const firefuAttackFile=s=>'assets/audio/sfx/characters/'+(s?.firefuThirst?'attack_fire2.mp3':'attack_firefu.mp3');
const firefuSoundSnapshot=r=>r.chars.map((c,i)=>c==='firefu'?firefuAttackFile(r.st[i]):null);
const firefuThirstCard=(r,i,c)=>r.chars[i]==='firefu'&&r.st[i]?.firefuThirst&&r.hands[i]?.length===1&&r.st[i].firefuCard===c;
// 渴火保留唯一暗槽；補牌、換牌及環境改牌之後仍維持10點牌面。
function enforceFirefuHands(r){
  r.seats.forEach((_,i)=>{const s=r.st[i];if(r.chars[i]!=='firefu'||!s.firefuThirst||r.hp[i]<=0||r.hands[i].length>1)return;
    const card=(r.hands[i][0]?.[0]||rnd(['S','C','H','D']))+'10';r.hands[i]=[card];r.up[i]=[];r.oc[i]=0;s.firefuCard=card;
    if(r.team)r.team[i][r.act[i]].st=JSON.parse(JSON.stringify(s));
  });return r;
}
function beginFirefuTurn(rm){
  if(!rm.chars.includes('firefu')||envSilent(rm))return enforceFirefuHands(rm);
  const r=JSON.parse(JSON.stringify(rm)),log=[];enforceFirefuHands(r);
  r.pair.forEach(i=>{const s=r.st[i];if(r.chars[i]!=='firefu'||r.hp[i]<=0||s.sealT>0||s.firefuRound===r.round)return;
    s.firefuRound=r.round;s.firefuTurns=(s.firefuTurns||0)+1;
    if(s.firefuTurns%2||firefuThirstCard(r,i,r.hands[i][0]))return;
    const cards=r.hands[i];if(!cards.length)return;const index=Math.floor(Math.random()*cards.length),card=cards[index];
    // 同點同花色可能有明暗兩張，依實際抽中的槽決定明槽是否消耗。
    const occurrence=cards.slice(0,index+1).filter(c=>c===card).length,visible=occurrence<=(r.up[i].filter(c=>c===card).length);
    cards.splice(index,1);if(visible){r.up[i]=removeCardOnce(r.up[i],card);r.oc[i]=Math.max(0,r.oc[i]-1)}
    const loss=Math.min(2,characterMaxHp(r,i,'firefu',s)-1);s.mdec=(s.mdec||0)+loss;s.asuraStrong=(s.asuraStrong||0)+2;s.firefuBurned=(s.firefuBurned||0)+1;
    const before=r.hp[i];r.hp[i]=Math.min(before,characterMaxHp(r,i,'firefu',s));recordHpLoss('firefu',s,before,r.hp[i]);
    log.push(`${r.seats[i].name} 的紅艷煞燒毀${cs(card)}及1個${visible?'明':'暗'}牌槽；最大生命-${loss}，永久強壯+2`);
    if(!cards.length){s.firefuThirst=1;enforceFirefuHands(r);log.push(`${r.seats[i].name} 的卡牌全部燒完，獲得唯一暗牌【渴火】（隨機花色、牌面10點）`)}
  });
  if(r.team)r.seats.forEach((_,i)=>{if(r.chars[i]==='firefu'){r.team[i][r.act[i]].hp=r.hp[i];r.team[i][r.act[i]].st=JSON.parse(JSON.stringify(r.st[i]))}});
  if(log.length)r.sLog=[...(r.sLog||[]),...log];return r;
}
function restoreFirefu(r,i){
  const s=r.st[i],target=r.cfg.hand,need=Math.max(0,target-r.hands[i].length);s.firefu25=1;s.firefuThirst=0;s.firefuCard=null;s.mdec=0;s.res=(s.res||0)+1;
  for(let k=0;k<need;k++){if(!r.deck.length)r.deck=newDeck(Object.values(r.hands).flat());r.hands[i].push(r.deck.shift())}
  r.oc[i]=Math.min(r.cfg.open||0,r.hands[i].length);r.up[i]=r.hands[i].slice(0,r.oc[i]);
  return `【紅艷煞】恢復${target}個手牌槽、補充${need}張手牌，最大生命恢復至${characterMaxHp(r,i,'firefu',s)}；額外毅力1（共${s.res}層），永久強壯保留。`;
}
const healingBlocked=s0=>!!(s0&&s0.superDeepTrauma);
const healingGain=(s0,n)=>healingBlocked(s0)?0:n;
const healingFactor=s0=>healingBlocked(s0)?0:(s0&&s0.deepTrauma?0.33:s0&&s0.trauma?0.66:1);
const healingNote=s0=>healingBlocked(s0)?'（超深度創傷：永久禁療）':s0&&s0.deepTrauma?'（深度創傷減療）':s0&&s0.trauma?'（創傷減療）':'';
// 逐次記錄雷橫實際失去的生命；治療、護盾與換人均不改寫累積值。
function recordHpLoss(c,s0,before,after){const lost=Math.max(0,Math.max(0,before)-Math.max(0,after));if(c==='lei'&&s0&&lost>0)s0.leiHpLost=(s0.leiHpLost||0)+lost;if(c==='tkt'&&s0?.tktUnit>0)s0.tktBars=tktHealth(after,s0.tktUnit*5,s0).bars;return lost}
CHARS.sinclair={n:'辛克萊',t:'赤紅之神',f:'bus',v3only:true,img:'rouge',sfx:'rouge',d:'【Limbus陣營】3v3專用，佔用2格角色槽。遊戲開始時使全隊（含自己）獲得【迫切的飢餓】：每次出牌若生命值不低於最大生命值30%，消耗當前生命值10%（向上取整），該牌點數+消耗血量+1，並使辛克萊獲得等量【無盡的飢餓】。隊友陣亡時，辛克萊獲得其最大生命值一半（向上取整）的【無盡的飢餓】。無盡的飢餓每20層額外增加1層強壯；達20層時獲得【高貴的品格】：獲得1層毅力及永久3層強壯。達40層時可發動一次【La Castration】：本次出牌視為♦，對敵方全體單方面造成15點傷害。25絕技：【la demande】（永久使自身出戰且存活時，每回合結束對目前對戰的敵方角色追加基礎3點單方面追擊，並隨機附加1層虛弱或易損，每層分別持續3回合）、【l\'appétit】（立即獲得15層無盡的飢餓，照常觸發強壯、高貴的品格及La Castration門檻）。',
 d25Skills:[
   {id:1,name:'la demande',type:'進攻型',desc:'永久使自身出戰且存活時，在每回合結束對目前對戰的敵方角色追加基礎3點追擊，並隨機給予1層虛弱或易損；每層各自持續3回合',
     instantFx:(r,i,o)=>{r.st[i].laDemande=1;return '獲得永久被動【la demande】：每回合結束追擊目前對戰的敵方角色，基礎傷害3點，隨機附加1層虛弱或易損（各自持續3回合）！';}},
   {id:2,name:"l'appétit",type:'輔助型',desc:'立即獲得15層無盡的飢餓，照常觸發強壯、高貴的品格及La Castration門檻',
     instantFx:(r,i,o)=>{const s0=r.st[i];s0.endlessHunger=(s0.endlessHunger||0)+15;let msg=`立即獲得15層無盡的飢餓（共${s0.endlessHunger}層）！`;if(s0.endlessHunger>=20&&!s0.noble){s0.noble=1;s0.resolve=1;s0.asuraStrong=(s0.asuraStrong||0)+3;msg+='獲得【高貴的品格】：毅力×1、永久強壯×3！'}return msg;}}
 ]};
CHARS.jia_qiu={n:'賈丘',t:'',f:'bus',v3only:true,img:'jia_qiu',sfx:'jia_qiu',d:'【Limbus陣營】3v3專用，佔3格角色槽，並攜帶後備子路。開局獲得等同基礎生命值的永久護盾及3層期待。特殊技能【問】：每兩回合可在出牌前詢問對手「你的某花色有幾張」或「你最大的點數是多少」；回答錯誤時期待-1，降至0時轉為【不再期待】，獲得20層強壯。受到斬殺改為承受最大生命值傷害。護盾被擊破時獲得【綻放EGO：而立】（強壯+1；對指定花色的單方面攻擊傷害+2），並在子路存活時自動換上子路。25絕技：【時間到】（立即獲得3回合不再期待，期間強壯+20，結束後恢復3層期待；隊伍參戰後扣回合，含後備）、【心-天罡星】（問改為每回合可用一次；發動時若沒有不再期待，期待降為1層）。',
 d25Skills:[
   {id:1,name:'時間到',type:'進攻型',desc:'立即獲得3回合不再期待（強壯+20），結束後恢復3層期待；隊伍參戰後扣回合，包含後備期間',
     instantFx:(r,i,o)=>{r.st[i].notExpecting=1;r.st[i].expectation=0;r.st[i].timeUpTurns=3;return '獲得【不再期待】3回合（強壯+20），結束後恢復3層期待！';}},
   {id:2,name:'心-天罡星',type:'輔助型',desc:'永久使問每回合可用一次；發動時若沒有不再期待，期待層數降為1',
     instantFx:(r,i,o)=>{const s0=r.st[i],last=s0.askLastRound||Math.max(0,(s0.askReadyRound||r.round)-2);s0.xinTiangang=1;s0.askReadyRound=Math.min(s0.askReadyRound||r.round,last+1);if(!s0.notExpecting)s0.expectation=1;return `獲得永久被動【心-天罡星】：問每回合可用一次！${s0.notExpecting?'保留不再期待狀態。':'期待降為1層。'}`;}}
 ]};
CHARS.zilu={n:'子路',t:'賈丘專屬',f:'bus',v3only:true,hidden:true,img:'zilu',sfx:'zilu',d:'賈丘專屬後備角色。造成傷害時給目標1層破裂；目標受到傷害時額外承受破裂層數傷害，並消耗1層。若子路出牌點數比對手小，這次傷害不會消耗破裂。出牌後對手超過10秒未出牌，子路獲得1層強壯。25絕技：【雲解顯現】（敵方全體含後備立即獲得4層破裂）、【超高速】（永久使自身早於目前對手出牌時立即獲得2層強壯，每回合一次，當回合出牌也受益；原本等待10秒的效果保留）。',
 d25Skills:[
   {id:1,name:'雲解顯現',type:'進攻型',desc:'使敵方全體存活角色（含後備）獲得4層破裂',
     instantFx:(r,i,o)=>{forD25Side(r,i,false,(j,k,c,s0)=>{s0.rupture=(s0.rupture||0)+4});return '【雲解顯現】使敵方全體角色（含後備）獲得4層破裂！';}},
   {id:2,name:'超高速',type:'輔助型',desc:'永久使自身早於目前對手出牌時立即獲得2層強壯，每回合一次；保留原本等待10秒獲得1層強壯的效果',
     instantFx:(r,i,o)=>{r.st[i].ziluFast=1;return '獲得永久被動【超高速】：先於目前對手出牌時立即獲得2層強壯，每回合一次！';}}
 ]};
CHARS.rufo={n:'羅佳',t:'環指野獸派',f:'bus',img:'rufo',sfx:'rufo',d:'【Limbus陣營】四種花色任務：♠攻擊命中、♦反擊成功、♥實際回復生命、♣成功封鎖治療。完成其中任意三項獲得1層【野獸派－狼面】（強壯+1、攻擊命中附加1層流血），立繪改為rufo2並解鎖【爆裂呈現】。發動後在本次戰鬥開始時先進行4連擊廣域亂射，每擊基礎傷害等於累計發動次數，總基礎傷害為「累計發動次數×4」，傷害受威力增減影響；接著隨機取得一項花色任務，完成即可再次發動。流血：持有者使用黑色牌時受到等同流血層數的傷害，之後流血-1。25絕技：【展現】（爆裂呈現已使用次數立即+3，仍須依原本任務解鎖使用）、【著色】（永久將爆裂呈現的4連擊改為群體攻擊，每擊攻擊所有敵人含後備；一般模式或敵方只剩一名可出戰角色時，沿用群體效果翻倍規則）。',
  d25Skills:[
    {id:1,name:'展現',type:'進攻型',desc:'爆裂呈現的已使用次數立即增加3，仍須依原本任務解鎖使用',
      instantFx:(r,i,o)=>{r.st[i].rufoSkillUses=(r.st[i].rufoSkillUses||0)+3;return `【展現】使爆裂呈現的已使用次數+3（累計${r.st[i].rufoSkillUses}次，下次發動為第${r.st[i].rufoSkillUses+1}次）！`; }},
    {id:2,name:'著色',type:'輔助型',desc:'永久使爆裂呈現由4連擊廣域亂射改為4連擊群體攻擊，含敵方後備；沿用群體效果翻倍規則',
      instantFx:(r,i,o)=>{r.st[i].rufoColor=1;return '獲得永久被動【著色】！爆裂呈現改為4連擊群體攻擊，每擊攻擊所有敵人（含後備），沿用群體效果翻倍規則！';}}
  ]};
CHARS.sad={n:'羅佳',t:'淚鋒之劍',f:'bus',img:'sad',sfx:'sad',d:'【Limbus陣營】被動【淚鋒】：不受連續空防的方塊禁用懲罰。初始虛弱1；每打出一張方塊（不要求反擊成功），結算後獲得1層淚鋒。1層解除自身淚鋒被動的虛弱；2層獲得強壯1；3層消耗全部淚鋒，恢復初始虛弱1、移除淚鋒的強壯，並使下一張牌點數+6，該牌攻擊或反擊命中時使對方理智-20（沒有可變理智則追加3點固定傷害）。下一張牌即消耗加成，未命中不保留。25絕技：【阿卡納裂淚穿刺】（對目前單一敵人造成「自身本局已出的方塊張數＋對手目前手牌方塊張數」×3的基礎傷害）、【磨滅的自尊】（淚鋒不再消耗，上限固定3層；達3層後每張牌點數+6並附帶命中效果；方塊反擊點數×1.5，向下取整）。',
  d25Skills:[
    {id:1,name:'阿卡納裂淚穿刺',type:'進攻型',desc:'立即對單一敵人造成（自身本局已出方塊張數＋對手目前手牌方塊張數）×3的基礎傷害，沿用威力、減傷與防護結算',
      instantFx:(r,i,o)=>{const next=resolve(r,{},null,null,null,{sadUltimate:i}),result=next.instantResult;delete next.instantResult;Object.assign(r,next);return result;}},
    {id:2,name:'磨滅的自尊',type:'輔助型',desc:'淚鋒不再消耗且上限固定3層，達3層後每張牌皆享有+6及命中效果；方塊反擊點數×1.5（向下取整）',
      instantFx:(r,i,o)=>{r.st[i].sadPride=1;r.st[i].sadTears=Math.min(3,r.st[i].sadTears||0);return '獲得永久被動【磨滅的自尊】：淚鋒上限固定3層且不消耗，達3層後每張牌點數+6並附帶命中效果；方塊反擊點數×1.5！';}}
  ]};
const sadEmpowered=s=>!!(s.sadNext||s.sadPride&&(s.sadTears||0)>=3);
const sadArt=s=>s?.sadArtTurns>0?'sad2':'sad1';
const sadSoundFile=n=>`assets/audio/sfx/characters/attack_sad${n}.mp3.mp3`;
// 沉默及技能封鎖期間沿用一般空防規則；既有禁用狀態不影響淚鋒被動生效時出牌。
const diamondBanned=(r,i)=>!!(r?.st?.[i]?.wardenCondemned||r?.st?.[i]?.noD&&!(r.chars[i]==='sad'&&!envSilent(r)&&!(r.st[i].sealT>0)));
CHARS.heathcliff={n:'魔王希斯克利夫',t:'Erlking',f:'bus',img:'heathcliff',sfx:'heathcliff',d:'【Limbus陣營】每回合開始隨機獲得一種花色盾：♣盾使本回合被梅花斷補時仍可恢復原治療量的一半；♠盾使本回合受到的黑桃傷害減半；♦盾使本回合受到的反擊傷害減半；♥盾使對手本回合的治療量減半。對手本回合沒有打出與盾相同花色的牌時，獲得1層棺；每7層棺獲得1層毅力。受到一般致命傷害時消耗1層毅力並鎖血至1點，斬殺無法阻擋。25絕技：【魔王所經之處，唯余悲傷與哀鳴】（消耗所有棺，對單一敵人造成棺層數×4的基礎傷害）、【杜拉罕】（永久使自身對敵人的攻擊傷害成為群體攻擊，含方塊反擊與敵方後備，立繪切換為杜拉罕形態）。',
  d25Skills:[
    {id:1,name:'魔王所經之處，唯余悲傷與哀鳴',type:'進攻型',desc:'消耗自身所有棺，對單一敵人造成棺層數×4的基礎傷害；沿用理智、易損、減傷與護盾結算',
      instantFx:(r,i,o)=>{const next=resolve(r,{},null,null,null,{heathcliffUltimate:i}),result=next.instantResult;delete next.instantResult;Object.assign(r,next);return result;}},
    {id:2,name:'杜拉罕',type:'輔助型',desc:'獲得永久被動杜拉罕，自身對敵人的攻擊傷害成為群體攻擊（含反擊及敵方後備），立繪切換為杜拉罕形態',
      instantFx:(r,i,o)=>{r.st[i].dullahan=1;return '獲得永久被動【杜拉罕】！自身對敵人的攻擊傷害改為群體攻擊（含反擊及敵方後備），立繪切換為杜拉罕形態！';}}
  ]};
CHARS.verg={n:'維吉里烏斯',t:'',f:'bus',v3only:true,img:'verg',sfx:'verg',d:'【Limbus陣營】3v3專用。理智固定顯示為「?」，不受共通理智效果影響；攻擊傷害額外增加隨機1～3點。第一回合開始時獲得常駐效果【超高溫羅馬短劍】，不會消失；並獲得基礎生命值×0.6護盾。受到斬殺時改為承受基礎生命值傷害。短劍：黑牌命中時使目標獲得⌈出牌點數×0.3⌉層炎傷（回合結束受到等同層數的傷害，然後炎傷-1）。護盾首次被擊破時進入【綻放EGO：血之洗禮】，立繪轉為verg2、BGM切換至verg2.mp3；立即獲得基礎生命值×0.2護盾及3層強壯。此後每3回合護盾刷新為固定5點，不疊加；反擊命中時使攻擊者獲得3層流血。25絕技：【為死去的血魔哀悼】（對所有敵人含後備連擊5次，每擊基礎傷害2點，分開結算威力、減傷及護盾）、【血幕-極】（永久使血之洗禮後每3回合的5點護盾改為可疊加）。',
 d25Skills:[
   {id:1,name:'為死去的血魔哀悼',type:'進攻型',desc:'對所有敵人（含後備）造成5次各基礎2點傷害，逐擊結算威力、減傷及護盾',
     instantFx:(r,i,o)=>{const next=resolve(r,{},null,null,null,{vergUltimate:i}),result=next.instantResult;delete next.instantResult;Object.assign(r,next);return result;}},
   {id:2,name:'血幕-極',type:'輔助型',desc:'永久使血之洗禮後每3回合獲得的固定5點護盾可以疊加',
     instantFx:(r,i,o)=>{r.st[i].vergShieldStack=1;return '獲得永久被動【血幕-極】：血之洗禮後每3回合累加5點護盾！';}}
 ]};
CHARS.card_ish={n:'以實瑪利',t:'定事務所',f:'bus',img:'card_ish',sfx:'card_ish',d25Bgm:'card',d:'【Limbus陣營】第一回合開始時，依照手牌最多的花色獲得【組札－花色】（平手時隨機選擇）。打出組札花色時獲得1層【光】（上限5層）；打出其他花色時，組札改為該花色。光達5層可發動【光斬】：消耗5層光，回合結束對敵方目前出戰角色連擊5次，每擊基礎傷害4點，逐擊結算理智、減傷、護盾與毅力。25絕技：【作弊】（立即獲得3層光，上限5層）、【雙色】（永久在每回合額外隨機一種與原組札不同的花色；兩種組札花色皆可獲得光）。',
  d25Skills:[
    {id:1,name:'作弊',type:'進攻型',desc:'立即獲得3層光，光的上限為5層',
      instantFx:(r,i,o)=>{const before=r.st[i].light||0;r.st[i].light=Math.min(5,before+3);return `作弊獲得${r.st[i].light-before}層光（共${r.st[i].light}/5層）！`;}},
    {id:2,name:'雙色',type:'輔助型',desc:'每回合額外隨機一種與原組札不同的花色，兩種花色皆可獲得光；立即套用本回合',
      instantFx:(r,i,o)=>{r.st[i].dualColor=1;rollIshExtra(r.st[i],r.round);return `獲得永久被動【雙色】！本回合額外組札為${SU[r.st[i].ishExtra]}，之後每回合重新隨機！`;}}
  ]};
CHARS.yisang={n:'李箱',t:'',f:'bus',img:'yisang',sfx:'yisang',d:'【Limbus陣營】被動【鏡世界觀測】：全局第3、6、9…回合出牌前，從4個不同的隨機場地事件中選擇1個，作為額外事件發動，與一般場地並存；李箱存活即可觸發，包含後備及旁觀，房主關閉一般場地事件也可使用。選擇期間所有玩家不可行動，倒數暫停；沉默或李箱技能封鎖時不觸發。25絕技：【強制平等】（全場所有存活角色含後備，血量設為發動時李箱的血量，可超過各自生命上限；再對全體存活敵人含後備造成基礎3點傷害）、【鏡子技術】（永久將被動改為鏡世界搜索，每三回合從完整可用事件清單自選）。',
  d25Skills:[
    {id:1,name:'強制平等',type:'進攻型',desc:'全場所有存活角色（含友軍及後備）血量設為李箱目前血量，允許超過生命上限；再對所有存活敵人含後備造成基礎3點傷害',
      instantFx:(r,i,o)=>{const target=r.hp[i],members=environmentMembers(r);members.forEach(m=>{recordHpLoss(m.c,m.st,m.hp,target);m.st.mirrorHp=1;setEnvironmentHp(r,m,target)});syncEnvironmentTeam(r);const next=resolve(r,{},null,null,null,{yisangUltimate:i}),result=next.instantResult;delete next.instantResult;Object.assign(r,next);return {...result,log:[`【強制平等】全場${members.length}名存活角色血量設為${target}，不改生命上限、不復活倒下角色。`,...result.log]};}},
    {id:2,name:'鏡子技術',type:'輔助型',desc:'永久將鏡世界觀測改為鏡世界搜索，每三個全局回合可從完整可用事件清單自由選擇',
      instantFx:(r,i,o)=>{r.st[i].mirrorSearch=1;return '【鏡子技術】鏡世界觀測永久改為鏡世界搜索：每三個全局回合從完整可用事件清單自選！';}}
  ]};
CHARS.bamboo={n:'金笠',t:'',f:'bus',img:'bamboo',sfx:'bamboo',d:'【Limbus陣營】基礎點數10以上的黑牌可選擇以特殊攻擊【捨吾皮肉】打出：取代原黑牌效果，命中固定造成3點傷害，不附帶斷補等花色功能；仍可被牆、護盾及高堅果攔截。被方塊成功反擊且存活時，立即發動【斷汝筋骨】，對反擊者單方面連斬4次，每擊基礎傷害4點，逐擊計算增減傷與防護。斷汝筋骨不限次；開局持有1層毅力，受到一般致命傷害時消耗1層並保留1點生命，斬殺無法阻擋。25絕技：【大爆捨】（永久使任何黑牌皆能以捨吾皮肉打出）、【綻放ego::金笠】（斷汝筋骨改為敵方全體含後備的群體攻擊，並獲得常駐強壯1）。',
  d25Skills:[
    {id:1,name:'大爆捨',type:'進攻型',desc:'永久解除捨吾皮肉的點數限制，任何黑牌皆可使用',
      instantFx:(r,i,o)=>{r.st[i].bambooAny=1;return '【大爆捨】永久使任何黑牌都能以【捨吾皮肉】打出！';}},
    {id:2,name:'綻放ego::金笠',type:'輔助型',desc:'斷汝筋骨永久改為群體攻擊，命中全體敵人含後備；獲得常駐強壯1',
      instantFx:(r,i,o)=>{r.st[i].bambooEgo=1;return '【綻放ego::金笠】斷汝筋骨改為全體敵人含後備的群體攻擊，並獲得常駐強壯1！';}}
  ]};
CHARS.moses={n:'摩西',t:'',f:'bus',img:'moses',sfx:'moses',d:'【Limbus陣營】只要出牌就累積煙霧：♠與♣累積紅、♦累積紫、♥累積白；不要求攻擊、反擊、斷補或回血成功，每次獲得出牌基本點數的層數，不含強壯、虛弱與倍率變化，也不依實際傷害或回血量計算，各色上限6。每回合開始，存活的出戰角色各色自動增加1層（包含旁觀回合）；紅點期間只增加深紅1層，深紅上限20。出牌前可消耗所選每色各6層發動吐息：紅＝自身強壯2（1回合）；紫＝對手虛弱2（1回合）；白＝自身回血3、理智+10；紅＋紫＝強壯2與虛弱2皆持續2回合；紅＋白＝自身理智+30、強壯3（1回合）；紫＋白＝對手理智-20、虛弱2（2回合）；紅＋白＋紫＝同時獲得紅白及紫白效果。吐息使用後退回對手已出的牌。25絕技：【紅點】（現有煙霧合併為深紅，之後只累積深紅，上限20；消耗20層準備吐息-深紅，本回合先於萊萬汀斬殺對手）、【青煙】（添加5回合的青煙環境；每回合結束，該回合對戰的兩名玩家受到5點環境傷害；自身被抽為對手的機率直接減少30個百分點，最低0%）。',
  d25Skills:[
    {id:1,name:'紅點',type:'進攻型',desc:'現有及之後累積的煙霧統一為深紅，上限20；消耗20層使用吐息-深紅，本回合結算時先於萊萬汀斬殺對手',
      instantFx:(r,i,o)=>{const s=r.st[i],sm=s.smoke||(s.smoke=newSmoke());sm.crimson=Math.min(20,sm.crimson+sm.red+sm.purple+sm.white);sm.red=sm.purple=sm.white=0;s.smokeCrimson=1;return `【紅點】全部煙霧轉為深紅（${sm.crimson}/20），之後只累積煙霧-深紅！`;}},
    {id:2,name:'青煙',type:'輔助型',desc:'添加包含本回合在內的5回合青煙環境；每回合結束，出戰雙方受到5點環境傷害；自身被抽為對手的機率減少30個百分點，最低0%',
      instantFx:(r,i,o)=>{r.env=r.env||newEnvironment(r.seats.length);r.env.skillEvents=[...(r.env.skillEvents||[]).filter(e=>e.id!=='blueSmoke'),{id:'blueSmoke',source:'skill',caster:i,round:r.round,until:r.round+4,startedAt:Date.now()}];queueEnvironmentFx(r,'blueSmoke','arrival',[],[],{source:'skill',caster:i,detail:r.seats[i].name+'・青煙展開'});return '【青煙】環境持續5回合，與原場地並存；每回合結束，出戰雙方受到5點環境傷害；自身被抽為對手的機率減少30個百分點，最低0%！';}}
  ]};
CHARS.tkt={n:'時間殺人魔',t:'',f:'bus',img:'tkt',sfx:'tkt',d:'【Limbus陣營】生命分為5段血條，分段邊界向下取整為整數，單次傷害打破當前血條後，溢出傷害清除。剩餘5／4／3／2／1條時，分別獲得強壯4、強壯2、無加減成、虛弱2、虛弱4。治療只補滿當前血條；若治療前當前血條已滿且不足5條，該次治療改為補回1條、該條生命為1，不繼續使用多餘治療量。斬殺與直接死亡不受血條分段保護。25絕技：【時間殺人魔】（對當前敵方單體造成等同目前回合數的固定傷害）、【閉嘴，時間由我分配】（永久使所有敵方玩家每次出牌階段只有5秒；未及時出牌則出戰角色直接死亡，出牌完成即停止倒數；旁觀、暈眩與不可出牌期間不計時）。',
  d25Skills:[
    {id:1,name:'時間殺人魔',type:'進攻型',desc:'立即對當前敵方單體造成等同目前回合數的固定傷害，不受增減傷影響',
      instantFx:(r,i,o)=>{const next=resolve(r,{},null,null,null,{tktUltimate:i}),result=next.instantResult;delete next.instantResult;Object.assign(r,next);return result;}},
    {id:2,name:'閉嘴，時間由我分配',type:'輔助型',desc:'永久使所有敵方玩家每次出牌限時5秒；逾時未出牌的出戰角色直接死亡，已出的牌會退回',
      instantFx:(r,i,o)=>{r.timeTargets=[...new Set([...(r.timeTargets||[]),...environmentEnemies(r,i)])];return '【閉嘴，時間由我分配】所有敵方玩家每次出牌限時5秒；逾時未出牌，出戰角色直接死亡！';}}
  ]};
const newSmoke=()=>({red:0,purple:0,white:0,crimson:0});
function addMosesSmoke(s,color,n,log=[],name='摩西',reason=''){
  const smoke=s.smoke||(s.smoke=newSmoke()),key=s.smokeCrimson?'crimson':color,cap=key==='crimson'?20:6,before=smoke[key]||0;smoke[key]=Math.min(cap,before+n);
  if(smoke[key]>before)log.push(`${name} 獲得${smoke[key]-before}層煙霧-${SMOKE_NAMES[key]}（${reason?reason+'；':''}${smoke[key]}/${cap}）`);
}
const SMOKE_NAMES={red:'紅',purple:'紫',white:'白',crimson:'深紅'};
const MOSES_BREATHS={
  red:{n:'吐息-紅',colors:['red'],strong:2,strongTurns:1,d:'自身獲得強壯2，持續1回合。'},
  purple:{n:'吐息-紫',colors:['purple'],weak:2,weakTurns:1,d:'對手獲得虛弱2，持續1回合。'},
  white:{n:'吐息-白',colors:['white'],heal:3,selfSan:10,d:'自身回復3點生命，理智+10。'},
  redPurple:{n:'混合吐息-紅＋紫',colors:['red','purple'],strong:2,strongTurns:2,weak:2,weakTurns:2,d:'自身強壯2、對手虛弱2，皆持續2回合。'},
  redWhite:{n:'混合吐息-紅＋白',colors:['red','white'],strong:3,strongTurns:1,selfSan:30,d:'自身理智+30，獲得強壯3，持續1回合。'},
  purpleWhite:{n:'混合吐息-紫＋白',colors:['purple','white'],weak:2,weakTurns:2,enemySan:-20,d:'對手理智-20，獲得虛弱2，持續2回合。'},
  all:{n:'混合吐息-紅＋白＋紫',colors:['red','white','purple'],strong:3,strongTurns:1,selfSan:30,weak:2,weakTurns:2,enemySan:-20,d:'自身理智+30、強壯3（1回合）；對手理智-20、虛弱2（2回合）。'},
  crimson:{n:'吐息-深紅',colors:['crimson'],d:'消耗20層深紅煙霧，本回合結算時先於萊萬汀斬殺對手。'}
};
CHARS.iso={n:'離索',t:'',f:'valorant',img:'iso',d:'【Valorant陣營】三人模式（含3v3v3）自身旁觀的回合不獲得經濟。可於商店購買雙源（2000）、削減（900）、應變（900），各技能最多儲存1次，出牌前使用。雙源抵擋一次傷害；雙方同時出黑牌攻擊時，回合結束刷新護盾，每次技能最多刷新一次，不可疊加。削減使當前敵人本回合受傷×1.5。應變使本回合雙方黑牌攻擊傷害固定為0，不影響方塊反擊及技能追擊。25絕技：【決滅】（選擇一名敵方玩家的出戰角色單挑；雙方暫時1血，每回合固定♠K、♦K，每人有3次方塊額度，抵擋成功不消耗，用完只能出黑桃；禁用所有技能、槍械與環境效果，離索例外獲得1層雙源；勝者恢復單挑前狀態，敗者倒下；離索勝出再獲得1層雙源，均不可疊加）、【我要買大裝！】（三個技能填充至各1次，獲得3000經濟）。',
  d25Skills:[{id:1,name:'決滅',type:'進攻型',desc:'選擇敵人進行1血單挑，每回合固定♠K、♦K，每人有3次方塊額度，抵擋成功不消耗，用完只能出黑桃；離索獲得1層雙源，其他效果禁用。勝者恢復原狀，離索勝出再獲得1層雙源。'},
    {id:2,name:'我要買大裝！',type:'輔助型',desc:'三個技能填充至各1次，獲得3000經濟',instantFx:(r,i)=>{r.st[i].isoSkills={dual:1,cut:1,adapt:1};r.valorantEconomy=r.seats.map((_,j)=>r.valorantEconomy?.[j]||newValorantEconomy());r.valorantEconomy[i].credits+=3000;return '【我要買大裝！】雙源、削減、應變各填充1次，獲得3000經濟！';}}]};
const ISO_SKILLS={dual:{n:'雙源',cost:2000,d:'抵擋一次傷害；雙方互攻時刷新一次，不可疊加。'},cut:{n:'削減',cost:900,d:'當前敵人本回合受到的傷害×1.5。'},adapt:{n:'應變',cost:900,d:'本回合雙方黑牌攻擊傷害為0，反擊及技能追擊照常。'}};
const newIsoSkills=()=>({dual:0,cut:0,adapt:0});
const isoPending=(r=room)=>!!(r&&r.status==='playing'&&(r.phase==='isoTarget'&&r.isoTarget||r.phase==='isoDuel'&&r.isoDuel));
const isoDiamondsLeft=(D,i)=>Math.max(0,3-(D.diamonds?.[i]||0));
const grantIsoDual=s=>{s.isoDual=1;s.isoDualRefresh=1};
function isoDamage(c,s,n,log=[],name='離索',fixedNumeric=false){
  if(!fixedNumeric&&n>0&&s?.wardenCompleteStop){n=tidyHp(n*.2);log.push(`${name} 的【完整停止】使受到傷害減少80%`)}
  if(!fixedNumeric&&n>0&&s?.wardenStop){n/=2;log.push(`${name} 的【停止】使受到傷害減半`)}
  if(!(n>0)||!s||s.sealT>0||!c||c==='_')return n;
  if(c==='iso'&&s.isoDual){s.isoDual=0;log.push(`${name} 的【雙源】抵擋了這次傷害`);return 0}
  return !fixedNumeric&&s.isoCut?tidyHp(n*1.5):n;
}
function canIsoSkill(r,i,kind){return!!(Object.hasOwn(ISO_SKILLS,kind)&&r?.status==='playing'&&r.phase==='play'&&!isoPending(r)&&!valorantShopPending(r)&&!mirrorPending(r)&&!environmentTradePending(r)&&!d25DrawPending(r)&&!envSilent(r)&&r.chars[i]==='iso'&&r.pair.includes(i)&&r.hp[i]>0&&!(r.st[i].sealT>0)&&!(r.st[i].stun>0)&&(r.st[i].isoSkills?.[kind]||0)>0&&!moves[r.round+'_'+i]&&timeActionOpen(r,i))}
function useIsoSkill(kind){const seat=rd();if(!canIsoSkill(room,seat,kind))return;const req={type:'isoSkill',uid,seat,kind,round:room.round,roundBase:room.roundBase,seq:room.st[seat].isoSeq||0};if(test||isHost)acceptIsoSkill(null,req);else if(hostConn)hostConn.send({privateRequest:req})}
function acceptIsoSkill(cn,req){
  if((!isHost&&!test)||!req||!Number.isInteger(req.seat)||!canIsoSkill(room,req.seat,req.kind))return false;
  const i=req.seat;if((test?!!cn:(cn?cn.uid:uid)!==req.uid||room.seats[i]?.id!==req.uid)||req.round!==room.round||req.roundBase!==room.roundBase||req.seq!==(room.st[i].isoSeq||0)||busy.startsWith('instant_')||busy.startsWith('u25_')||busy===room.phase+room.round)return false;
  const r=JSON.parse(JSON.stringify(room)),s=r.st[i],o=battleOpponent(r,i),log=[`${r.seats[i].name} 發動【${ISO_SKILLS[req.kind].n}】`];s.isoSkills[req.kind]=0;s.isoSeq=(s.isoSeq||0)+1;
  if(req.kind==='dual')grantIsoDual(s);else if(req.kind==='cut')r.st[o].isoCut=1;else s.isoAdapt=1;
  const lock=`instant_iso_${r.round}_${i}`;busy=lock;try{returnBattleMoves(r,i,log);syncEnvironmentTeam(r);r.sLog=[...(r.sLog||[]),...log];save(r)}finally{if(busy===lock)busy=''}tick();return true;
}
function isoSkillsUI(i){if(room.chars[i]!=='iso'||isoPending())return'';return`<div class="row" style="justify-content:center">${Object.entries(ISO_SKILLS).map(([k,S])=>`<button type="button" ${canIsoSkill(room,i,k)?'':'disabled'} onclick="useIsoSkill('${k}')" title="${esc(S.d)}">${S.n} · ${room.st[i].isoSkills?.[k]||0}/1</button>`).join('')}</div>`}
function beginIsoDuel(r,i,target,log){
  const snapshot=JSON.parse(JSON.stringify(r));delete snapshot.isoTarget;snapshot.phase='play';
  r.isoDuel={id:`${r.roundBase||1}:${r.round}:${i}:${r.st[i].isoSeq||0}`,by:i,target,seats:[i,target],round:1,hp:{[i]:1,[target]:1},diamonds:{[i]:0,[target]:0},shield:1,refresh:1,cards:{},snapshot};delete r.isoTarget;r.phase='isoDuel';r.deadline=0;r.timeClocks={};r.sLog=[...(r.sLog||[]),...log,`${r.seats[i].name} 與 ${r.seats[target].name} 進入【決滅】：1血、♠K與♦K，每人有3次方塊額度，抵擋成功不消耗；離索獲得1層雙源，其他效果暫停`];return r;
}
function beginIsoUltimate(r,i,log,write=true){
  const targets=environmentEnemies(r,i).filter(j=>r.hp[j]>0);if(!targets.length)return false;
  returnBattleMoves(r,-1,log,r.seats.map((_,j)=>j));r.deadline=0;r.timeClocks={};
  r.seats.forEach((_,j)=>{['g','q','a','s','t','h','w','u','u25_'].forEach(prefix=>{const key=prefix+r.round+'_'+j,action=moves[key];if(prefix==='u'&&action?.requestId)delete hostSunRequests[action.requestId];if(action)db.doc(`rooms/${code}/moves/${key}`).set(null)})});
  if(targets.length===1)beginIsoDuel(r,i,targets[0],log);
  else{r.isoTarget={id:`${r.roundBase||1}:${r.round}:${i}`,by:i,targets};r.phase='isoTarget';r.sLog=[...(r.sLog||[]),...log]}
  if(write)save(r);return true;
}
function chooseIsoTarget(target){if(battleObservationActive()||!isoPending()||room.phase!=='isoTarget'||rd()!==room.isoTarget.by)return;const req={type:'isoTarget',uid,seat:rd(),round:room.round,id:room.isoTarget.id,target};if(test||isHost)acceptIsoTarget(null,req);else if(hostConn)hostConn.send({privateRequest:req})}
function acceptIsoTarget(cn,req){
  if((!isHost&&!test)||!isoPending()||room.phase!=='isoTarget'||!req)return false;const Q=room.isoTarget;
  if(req.seat!==Q.by||req.round!==room.round||req.id!==Q.id||!Q.targets.includes(req.target)||room.hp[req.target]<=0||(test?!!cn:(cn?cn.uid:uid)!==req.uid||room.seats[Q.by]?.id!==req.uid))return false;
  const r=JSON.parse(JSON.stringify(room));save(beginIsoDuel(r,Q.by,req.target,[]));return true;
}
function playIsoCard(card){if(!isoPending()||room.phase!=='isoDuel')return;const D=room.isoDuel,seat=rd();if(!D.seats.includes(seat)||D.cards[seat]||!['S13','D13'].includes(card)||card==='D13'&&!isoDiamondsLeft(D,seat))return;const req={type:'isoCard',uid,seat,round:room.round,id:D.id,duelRound:D.round,card};if(test||isHost)acceptIsoCard(null,req);else if(hostConn)hostConn.send({privateRequest:req})}
function acceptIsoCard(cn,req){
  if((!isHost&&!test)||!isoPending()||room.phase!=='isoDuel'||!req)return false;const D=room.isoDuel;
  if(req.round!==room.round||req.id!==D.id||req.duelRound!==D.round||!D.seats.includes(req.seat)||D.cards[req.seat]||!['S13','D13'].includes(req.card)||req.card==='D13'&&!isoDiamondsLeft(D,req.seat)||(test?!!cn:(cn?cn.uid:uid)!==req.uid||room.seats[req.seat]?.id!==req.uid))return false;
  const r=JSON.parse(JSON.stringify(room));r.isoDuel.cards[req.seat]=req.card;save(r.isoDuel.seats.every(i=>r.isoDuel.cards[i])?resolveIsoRound(r):r);return true;
}
function resolveIsoRound(r){
  const D=r.isoDuel,[a,b]=D.seats,ca=D.cards[a],cb=D.cards[b],log=[],damage=[],combat=[],hits=[];
  const hit=(target,source,kind)=>{if(target===D.by&&D.shield){D.shield=0;log.push(`${r.seats[target].name} 的【雙源】抵擋決滅中的一次${kind==='counter'?'反擊':'攻擊'}`);return}D.hp[target]=0;hits.push(source);const start=damage.length;addDamageFx(damage,r,target,1);addCombatDamage(combat,r,source,damage,start,kind);log.push(`${r.seats[source].name} 的${kind==='counter'?'♦K反擊':'♠K攻擊'}使 ${r.seats[target].name} 倒下`)};
  if(ca==='S13'&&cb==='S13'){hit(a,b,'spade');hit(b,a,'spade');if(D.hp[D.by]>0&&D.refresh){D.shield=1;D.refresh=0;log.push('雙方同時攻擊，離索的雙源刷新一次')}}
  else if(ca==='S13'&&cb==='D13'){log.push(`${r.seats[b].name} 的方塊抵擋成功，不消耗使用次數`);hit(a,b,'counter')}
  else if(cb==='S13'&&ca==='D13'){log.push(`${r.seats[a].name} 的方塊抵擋成功，不消耗使用次數`);hit(b,a,'counter')}
  else{D.diamonds=D.diamonds||{};D.seats.forEach(i=>{D.diamonds[i]=(D.diamonds[i]||0)+1});log.push('雙方都出♦K，各消耗1次方塊額度，單挑繼續；不套用連續防守懲罰')}
  const result={round:D.round,chars:[...r.chars],weapons:valorantWeaponSnapshot(r),plays:[{i:a,card:ca},{i:b,card:cb}],hits:[...new Set(hits)],damage,combat,healing:[],log};
  if(D.seats.some(i=>D.hp[i]<=0))return finishIsoDuel(r,result);
  D.round++;D.cards={};D.last=result;r.instantFx={id:(r.instantFx?.id||0)+1,...result};return r;
}
function finishIsoDuel(r,result){
  const D=r.isoDuel,next=JSON.parse(JSON.stringify(D.snapshot)),losers=D.seats.filter(i=>D.hp[i]<=0),winner=D.seats.find(i=>D.hp[i]>0),log=[...result.log];delete next.isoDuel;delete next.isoTarget;
  losers.forEach(i=>{next.hp[i]=0});if(winner!==undefined){log.push(`${next.seats[winner].name} 勝出決滅，恢復單挑前的生命、手牌與裝備`);if(winner===D.by){grantIsoDual(next.st[winner]);log.push('離索勝出，獲得1層雙源，不可疊加')}}else log.push('決滅雙方同時倒下');
  const spk=Object.fromEntries(losers.map(i=>[i,1])),passChars=next.chars.map((c,i)=>losers.includes(i)?'_':c);
  Object.assign(next,settleCharacters(next,{hp:next.hp,st:next.st,cp:next.cp,team:next.team,spk,passChars,log,instant:true,silent:true}));
  if(next.hp.every(h=>h<=0)){next.status='over';next.winner=-1;log.push('場上無人存活，平手！')}else settleInstantBattle(next,log,true);
  next.phase='play';beginQueuedIsoUltimate(next,log);next.deadline=next.status==='playing'&&!isoPending(next)&&next.cfg.time?Date.now()+next.cfg.time*1000:0;next.timeClocks={};next.sLog=[...(next.sLog||[]),...log];next.instantFx={id:(r.instantFx?.id||0)+1,...result,log};returnBattleMoves(next,-1,log,next.seats.map((_,j)=>j));return next;
}
function isoDuelUI(i){
  if(room.phase==='isoTarget'){const Q=room.isoTarget;return`<section class="box iso-duel">${environmentNoticeUI()}<h1>決滅 · 選擇單挑對手</h1><p>原戰局與倒數暫停，單挑對象為敵方玩家目前的出戰角色。</p>${i===Q.by?Q.targets.map(j=>`<button type="button" onclick="chooseIsoTarget(${j})">${esc(room.seats[j].name)}【${esc(CHARS[room.chars[j]].n)}】</button>`).join(' '):'<p>等待離索選擇對手…</p>'}</section>`}
  const D=room.isoDuel,mine=D.seats.includes(i),submitted=D.cards[i];return`<section class="box iso-duel">${environmentNoticeUI()}<h1>決滅 · 第 ${D.round} 回合</h1><p>雙方1血，每回合固定♠K、♦K；每人有3次方塊額度，抵擋成功不消耗，用完只能出黑桃。只有離索的雙源生效，其他技能、裝備與環境效果暫停。</p><div class="iso-duel-players">${D.seats.map(j=>`<div data-damage-target="${j}:${room.act?.[j]??-1}"><b>${esc(room.seats[j].name)}【${esc(CHARS[room.chars[j]].n)}】</b><p>生命 ${D.hp[j]} / 1${j===D.by?` · 雙源 ${D.shield}/1`:''} · 方塊剩餘 ${isoDiamondsLeft(D,j)}/3</p><span>${D.cards[j]?'已出牌':'選牌中'}</span>${d25AuraOf(j)?.crisis?d25AuraUI(j,true):''}</div>`).join('')}</div>${mine?submitted?'<p>已出牌，等待對手…</p>':`<div class="hand">${['S13','D13'].map(c=>`<button type="button" class="c ${c[0]==='D'?'r':''}" ${c==='D13'&&!isoDiamondsLeft(D,i)?'disabled title="方塊3次已用完"':''} onclick="playIsoCard('${c}')">${cardFace(c)}</button>`).join('')}</div>`:'<p>你正在旁觀決滅，原戰局與回合效果暫停。</p>'}${D.last?`<div class="log">${D.last.log.map(t=>`<div>${esc(t)}</div>`).join('')}</div>`:''}</section>`;
}
// Valorant共通裝備；sfx使用對應槍聲，缺素材時沿用合成音效。
const VALORANT_GUNS={
  classic:{n:'制式手槍',cost:0,weak:2,d:'虛弱2。',sfx:'assets/audio/sfx/weapons/attack_gun_classic.mp3'},
  ghost:{n:'鬼魅',cost:400,d:'無額外效果。',sfx:'assets/audio/sfx/weapons/attack_gun_ghost.mp3'},
  shorty:{n:'短管',cost:300,weak:1,d:'虛弱1；基本點數小於5的牌點數+2。',sfx:'assets/audio/sfx/weapons/attack_gun_shorty.mp3'},
  sheriff:{n:'神射',cost:700,weak:2,d:'虛弱2；黑牌點數+5。',sfx:'assets/audio/sfx/weapons/attack_gun_sheriff.mp3'},
  spectre:{n:'惡靈',cost:1500,d:'基本點數小於4的牌觸發3次，各次分開結算。',sfx:'assets/audio/sfx/weapons/attack_gun_spectre.mp3'},
  judge:{n:'判官',cost:1300,d:'反擊傷害×2。',sfx:'assets/audio/sfx/weapons/attack_gun_judge.mp3'},
  guardian:{n:'捍衛者',cost:1600,strong:1,d:'強壯1；梅花斷補成功時追加5點傷害。',sfx:'assets/audio/sfx/weapons/attack_gun_guardian.mp3'},
  phantom:{n:'幻象',cost:2000,strong:3,d:'強壯3。',sfx:'assets/audio/sfx/weapons/attack_gun_phantom.mp3'},
  vandal:{n:'暴徒',cost:2000,strong:2,d:'強壯2；黑牌點數額外+2。',sfx:'assets/audio/sfx/weapons/attack_gun_vandal.mp3'},
  odin:{n:'奧丁',cost:2000,strong:1,d:'每次效果基本值為1，依基本點數連續觸發；1～6點觸發同點數次，7～13點對應6／7／7／8／8／9／9次。',sfx:'assets/audio/sfx/weapons/attack_gun_odin.mp3'},
  marshal:{n:'警長',cost:1000,d:'基本點數7或8的牌，點數×2。',sfx:'assets/audio/sfx/weapons/attack_gun_marshal.mp3'},
  operator:{n:'間諜',cost:4000,strong:10,d:'強壯10；持有時不可獲得槍護盾。',sfx:'assets/audio/sfx/weapons/attack_gun_operator.mp3'}
};
const VALORANT_CATEGORIES=[{n:'手槍類',guns:['ghost','shorty','sheriff']},{n:'功能槍',guns:['spectre','judge','guardian']},{n:'大槍',guns:['phantom','vandal','odin']},{n:'狙擊',guns:['marshal','operator']}];
const isValorant=c=>CHARS[c]?.f==='valorant';
const valorantGun=(c,s)=>isValorant(c)?VALORANT_GUNS[s?.gun]||null:null;
const valorantWeaponSnapshot=r=>r.chars.map((c,i)=>isValorant(c)?r.st[i].gun||null:null);
const newValorantEconomy=()=>({credits:0,lossStreak:0,nextIncome:null,outcomeRound:0,incomeRound:0});
function valorantTriggers(c,s,card){if(!card)return 1;const raw=+card.slice(1),g=valorantGun(c,s);return g===VALORANT_GUNS.odin?raw<=6?Math.max(1,raw):[6,7,7,8,8,9,9][raw-7]||1:g===VALORANT_GUNS.spectre&&raw<4?3:1}
function valorantBase(c,s,card){const raw=+card.slice(1),g=valorantGun(c,s),black='SC'.includes(card[0]);if(!g)return raw;if(g===VALORANT_GUNS.odin)return 1;if(g===VALORANT_GUNS.shorty&&raw<5)return raw+2;if(g===VALORANT_GUNS.sheriff&&black)return raw+5;if(g===VALORANT_GUNS.vandal&&black)return raw+2;if(g===VALORANT_GUNS.marshal&&(raw===7||raw===8))return raw*2;return raw}
const valorantShopPending=(r=room)=>!!(r&&r.status==='playing'&&r.phase==='shop'&&r.valorantShop?.round===r.round);
const valorantShopVisible=(i=rd())=>valorantShopPending()&&room.hp[i]>0&&isValorant(room.chars[i]);
function prepareValorantShop(r){
  if(isoPending(r)||r.status!=='playing'||r.valorantShop?.round===r.round)return r;
  const seats=r.seats.map((_,i)=>i).filter(i=>r.hp[i]>0&&isValorant(r.chars[i]));if(!seats.length)return r;
  // 離索的旁觀收入須先確定本回合配對；商店確認後沿用同一次抽選。
  if(r.cfg.n===3&&!r.cfg.boss&&seats.some(i=>r.chars[i]==='iso')){const picked=spinPick(r.hp,r.turn,r);r={...r,...picked,shopPair:{...picked,round:r.round,turn:r.turn,alive:r.hp.map(h=>h>0).join(',')}}}
  const next=JSON.parse(JSON.stringify(r)),log=[...(next.sLog||[])];next.valorantEconomy=next.seats.map((_,i)=>next.valorantEconomy?.[i]||newValorantEconomy());
  seats.forEach(i=>{const e=next.valorantEconomy[i];if(e.incomeRound!==r.round){const previous=e.outcomeRound===r.round-1,watching=r.chars[i]==='iso'&&r.cfg.n===3&&!r.cfg.boss&&!r.pair.includes(i),income=watching?0:previous?e.nextIncome??500:500;if(!previous||watching)e.lossStreak=0;e.credits+=income;e.nextIncome=null;e.incomeRound=r.round;log.push(watching?`${r.seats[i].name} 本回合旁觀，不獲得經濟（餘額 ${e.credits}）`:`${r.seats[i].name} 獲得經濟 ${income}（餘額 ${e.credits}）`)}
    if(!VALORANT_GUNS[next.st[i].gun]){next.st[i].gun='classic';log.push(`${r.seats[i].name} 沒有槍械，獲得制式手槍`)}
    if(next.team)next.team[i][next.act[i]].st=JSON.parse(JSON.stringify(next.st[i]));
  });
  next.valorantShop={id:`${r.roundBase||1}:${r.round}`,round:r.round,seats,confirmed:[],seq:Object.fromEntries(seats.map(i=>[i,0]))};next.phase='shop';next.pend=[];next.deadline=0;next.timeClocks={};next.sLog=log;return next;
}
function recordValorantIncome(r,economy,P,cblk,cntd,refl,effd,log){
  if(!economy)return;
  r.pair.forEach(i=>{if(!isValorant(r.chars[i]))return;const p=P[i],q=P[p?.o];if(!p||!q)return;
    const attacks=a=>!!a&&!a.none&&'SCN'.includes(a.s)&&!!effd[a.i],own=attacks(p),enemy=attacks(q),loss=!!cblk[q.i]||!!refl[i]||enemy&&!own;
    let income=500,reason='基本經濟';const e=economy[i];
    if(cntd[i]){income=1000;reason='反擊成功'}
    else if(own&&enemy){income=800;reason='雙方互相攻擊'}
    else if(p.s==='H'&&q.s==='H'&&effd[i]&&effd[q.i]){income=800;reason='雙方補血'}
    else if(own||cblk[i]){income=1000;reason='單方面攻擊成功'}
    else if(loss){e.lossStreak=Math.min(4,(e.lossStreak||0)+1);income=Math.min(1000,400+(e.lossStreak-1)*200);reason=`被斷補或單方面攻擊，連續${e.lossStreak}回合`}
    if(!loss||cntd[i]||own||cblk[i])e.lossStreak=0;
    e.nextIncome=income;e.outcomeRound=r.round;log.push(`${r.seats[i].name} ${reason}，下回合經濟 ${income}`);
  });
}
function loseValorantGun(c,s,dealt,kind,log,name){
  if(!isValorant(c)||!s.gun||!(dealt>0)||!['spade','club','counter'].includes(kind))return;
  if(s.gunShield&&s.gun!=='operator'){s.gunShield=0;log.push(`${name} 的槍護盾消耗，本次受擊保留${VALORANT_GUNS[s.gun]?.n||'槍械'}`);return}
  log.push(`${name} 受到${kind==='counter'?'方塊':kind==='club'?'梅花':'黑桃'}傷害，失去${VALORANT_GUNS[s.gun]?.n||'槍械'}`);s.gun=null;
}
function requestValorantShop(action,item=null){if(battleObservationActive())return;
  if(!valorantShopPending())return;const seat=rd(),Q=room.valorantShop;if(!Q.seats.includes(seat)||Q.confirmed.includes(seat))return;
  const req={type:'valorantShop',uid,seat,round:room.round,shopId:Q.id,seq:Q.seq[seat],action,item};if(test||isHost)acceptValorantShop(null,req);else if(hostConn)hostConn.send({privateRequest:req});
}
function acceptValorantShop(cn,req){
  if((!isHost&&!test)||!valorantShopPending()||!req||!Number.isInteger(req.seat))return false;
  const Q=room.valorantShop,i=req.seat,owner=test?i:room.seats.findIndex(p=>p.id===req.uid);
  if(owner!==i||cn&&cn.uid&&cn.uid!==req.uid||req.round!==room.round||req.shopId!==Q.id||req.seq!==Q.seq[i]||!Q.seats.includes(i)||Q.confirmed.includes(i)||!isValorant(room.chars[i])||room.hp[i]<=0)return false;
  if(cn)cn.uid=req.uid;const r=JSON.parse(JSON.stringify(room)),e=r.valorantEconomy[i],s=r.st[i],log=[...(r.sLog||[])];
  if(req.action==='buy'){
    const key=typeof req.item==='string'&&req.item.startsWith('skill_')?req.item.slice(6):null,skill=key&&Object.hasOwn(ISO_SKILLS,key)?ISO_SKILLS[key]:null;
    const shield=req.item==='gunShield',g=Object.hasOwn(VALORANT_GUNS,req.item)?VALORANT_GUNS[req.item]:null,cost=skill?skill.cost:shield?1000:g?.cost;
    if(skill?(r.chars[i]!=='iso'||(s.isoSkills?.[key]||0)>=1):(!shield&&(!g||req.item==='classic')||shield&&(s.gunShield||s.gun==='operator')))return false;
    if(!(e.credits>=cost))return false;e.credits-=cost;
    if(skill){s.isoSkills=s.isoSkills||newIsoSkills();s.isoSkills[key]=1}else if(shield)s.gunShield=1;else{s.gun=req.item;if(s.gun==='operator')s.gunShield=0}
    log.push(`${r.seats[i].name} 購買${skill?skill.n:shield?'槍護盾':g.n}（-${cost}，餘額 ${e.credits}）`);
  }else if(req.action==='confirm'){r.valorantShop.confirmed.push(i);log.push(`${r.seats[i].name} 已確認裝備`)}else return false;
  r.valorantShop.seq[i]++;r.sLog=log;if(r.team)r.team[i][r.act[i]].st=JSON.parse(JSON.stringify(s));
  const done=r.valorantShop.seats.every(j=>r.valorantShop.confirmed.includes(j));if(done)r.phase='play';save(done?beginRound(r):r);return true;
}
function valorantShopUI(i){
  if(!valorantShopVisible(i))return'';
  const Q=room.valorantShop,mine=Q.seats.includes(i),done=Q.confirmed.includes(i),e=room.valorantEconomy?.[i],s=room.st[i],credits=e?.credits||0;
  const buy=(id,g)=>{const shield=id==='gunShield',owned=shield?!!s?.gunShield:s?.gun===id,disabled=!mine||done||credits<g.cost||shield&&(owned||s?.gun==='operator');return`<button type="button" class="valorant-item ${owned?'equipped':''}" ${disabled?'disabled':''} onclick="requestValorantShop('buy','${id}')"><img src="assets/images/ui/valorant-shop/${id}.png" alt=""><span class="valorant-item-title">${g.n}<b>${g.cost}</b></span><span class="valorant-item-desc">${esc(g.d)}</span>${owned?'<span class="valorant-owned">已裝備</span>':''}</button>`};
  return`<section class="valorant-shop"><header class="valorant-shop-head"><h1>商店</h1><div>${mine?`經濟 <b>${credits}</b>　裝備：${VALORANT_GUNS[s?.gun]?.n||'無槍械'}${s?.gunShield?'・槍護盾':''}`:'等待 Valorant 玩家購買裝備'}</div></header><div class="valorant-shop-status">${Q.seats.map(j=>`${esc(room.seats[j].name)}：${Q.confirmed.includes(j)?'已確認':'購買中'}`).join(' ｜ ')}</div><div class="valorant-shop-grid">${VALORANT_CATEGORIES.map((category,k)=>`<section class="valorant-category"><h2>${category.n}</h2>${category.guns.map(id=>buy(id,VALORANT_GUNS[id])).join('')}${k===3?`<h2>護盾</h2>${buy('gunShield',{n:'槍護盾',cost:1000,d:'抵擋一次槍械掉落；持有間諜時不可購買。'})}`:''}</section>`).join('')}</div><div class="valorant-shop-footer"><div class="valorant-skills">${room.chars[i]==='iso'?Object.entries(ISO_SKILLS).map(([key,S])=>`<button type="button" ${!mine||done||credits<S.cost||(s.isoSkills?.[key]||0)>=1?'disabled':''} onclick="requestValorantShop('buy','skill_${key}')"><b>${S.n} · ${S.cost}</b><small>儲存 ${s.isoSkills?.[key]||0}/1</small><span>${esc(S.d)}</span></button>`).join(''):[1,2,3].map(n=>`<div>技能${n}<small>尚未開放</small></div>`).join('')}</div>${mine?`<button type="button" class="pri" ${done?'disabled':''} onclick="requestValorantShop('confirm')">${done?'已確認，等待其他玩家':'確定裝備'}</button>`:''}<p>所有玩家確認後開始回合，商店期間出牌與倒數暫停。新槍會覆蓋原本的槍械。</p></div></section>`;
}
const bambooCanSkin=(st,card)=>!!(card&&'SC'.includes(card[0])&&(st.bambooAny||+card.slice(1)>=10));
const baseImgK=k=>k==='heathcliff'&&room&&((room.chars&&room.st&&room.chars.some((c,i)=>c==='heathcliff'&&room.st[i].dullahan))||(room.team&&room.team.some(t=>t.some(m=>m.c==='heathcliff'&&m.st&&m.st.dullahan))))?'heathcliff2':(k==='rufo'&&room&&room.chars&&room.st&&room.chars.some((c,i)=>c==='rufo'&&room.st[i]&&(room.st[i].rufoWolf||0)>0)?'rufo2':(k==='verg'&&room&&((room.chars&&room.st&&room.chars.some((c,i)=>c==='verg'&&room.st[i].vergEgo))||(room.team&&room.team.some(t=>t.some(m=>m.c==='verg'&&m.st&&m.st.vergEgo))))?'verg2':(k==='sinclair'&&room&&room.team&&room.team.some(t=>t.some(m=>m.c==='sinclair'&&m.st&&m.st.noble))?'rouge2':(k&&CHARS[k]&&CHARS[k].img)||k||'default')));
const imgK=(k,s)=>k==='spider'?spiderArt(s||room?.st?.[room.chars?.indexOf('spider')]):k==='warden'?((s||room?.st?.[1])?.wardenStage>=2?'warden2':'warden'):k==='kira'?kiraArt(s||room?.st?.[room.chars?.indexOf('kira')]):k==='lkd'?lkdArt(s||room?.st?.[room.chars?.indexOf('lkd')]):k==='sad'?sadArt(s||room?.st?.[room.chars?.indexOf('sad')]):k==='firefu'?firefuArt(s||room?.st?.[room.chars?.indexOf('firefu')]):k==='lucio'?(s||room?.st?.[room.chars?.indexOf('lucio')])?.lucio25?'lucio2':'lucio':baseImgK(k);
function rollIshExtra(s0,round){s0.ishExtra=rnd(['S','C','H','D'].filter(s=>s!==s0.ishSet));s0.ishExtraRound=round}
const charArtDir=k=>`assets/images/characters/${({spider1:'spider',spider2:'spider',spider3:'spider',warden2:'warden',kira1:'kira',kira2:'kira',kira3:'kira',lkd1:'lkd',lkd2:'lkd',sad1:'sad',sad2:'sad',heathcliff2:'heathcliff',rouge2:'rouge',rufo2:'rufo',verg2:'verg',firefu1:'firefu',firefu2:'firefu',firefu3:'firefu',lucio2:'lucio'})[k]||k}`;
const charArtSrc=(k,pos)=>/^spider[123]?$/.test(k)?`${charArtDir(k)}/char_spider_${pos||'left'}${k==='spider3'?3:k==='spider2'?2:1}.${k==='spider3'?'gif':'png'}`:k==='warden2'?'assets/images/characters/warden/2.gif':k==='warden'?'assets/images/characters/warden/The_Warden_Idle_Animation.gif':/^kira[123]?$/.test(k)?`${charArtDir(k)}/char_kira_${pos||'left'}${k==='kira3'?3:k==='kira2'?2:1}.png`:/^lkd[12]?$/.test(k)?`${charArtDir(k)}/char_lkd_${pos||'left'}${k==='lkd2'?2:1}.png`:/^sad[12]?$/.test(k)?`${charArtDir(k)}/char_sad_${pos||'left'}${k==='sad2'?2:1}.png`:k==='firefu1'?`${charArtDir(k)}/char_firefu1_${pos||'left'}.gif`:`${charArtDir(k)}/char_${k}${pos?'_'+pos:''}.png`;
const isPvz=c=>!!(CHARS[c]&&CHARS[c].f==='pvz');
const canDeploy=c=>!!CHARS[c]&&!isPvz(c);
function rufoGroupFactor(r,i){if(!r.team)return 2;const targets=r.cfg.boss?(i===1?[0,2]:[1]):r.seats.map((_,j)=>j).filter(j=>j!==i),alive=targets.reduce((n,j)=>n+r.team[j].filter((m,k)=>canDeploy(m.c)&&(k===r.act[j]?r.hp[j]>0:!m.dead&&m.hp>0)).length,r.cfg.warden&&i!==1?wardenCandleAlive(r).length:0);return alive>=2?1:2}
const dwt=c=>c==='warden'||c==='leo'||c==='jia_qiu'||c==='verg'?3:c==='sinclair'?2:1;
const singleSlotDraftAllowed=(r,c)=>!r?.cfg.singleSlotDraft||!r.cfg.v3||r.cfg.n!==3||r.cfg.boss||dwt(c)===1;
const dwtSum=(D,i)=>D.picks[i].reduce((a,c)=>a+dwt(c),0);
const dfull=(D,i)=>dwtSum(D,i)>=3||!!(D.pass&&D.pass[i]);
const draftLastReserved=(D,i)=>D.lastSeat===i&&D.picks.some((_,j)=>j!==i&&!dfull(D,j));
const draftCanPick=(D,c,i)=>!!CHARS[c]&&!CHARS[c].hidden&&singleSlotDraftAllowed(room,c)&&!(room.bans||[]).includes(c)&&(!room||!room.cfg||!room.cfg.factions||room.cfg.factions[CHARS[c].f]!==false)&&!D.picks.flat().includes(c)&&!dfull(D,i)&&dwtSum(D,i)+dwt(c)<=3&&(!draftLastReserved(D,i)||dwtSum(D,i)+dwt(c)<3)&&(!isPvz(c)||D.picks[i].filter(isPvz).length<2);
const draftWaitsForLast=(D,i)=>draftLastReserved(D,i)&&!Object.keys(CHARS).some(c=>draftCanPick(D,c,i));
function matTarget(rm,m,hp){if(rm.cfg.warden&&[0,2].includes(m))return hp[1]>0?1:-1;let best=-1,bn=0;const rv=Object.fromEntries(rm.seats.map((_,i)=>[i,environmentEnemies(rm,m).includes(i)?revengeStacks(rm,m,rm.st[i]):0]));
  Object.keys(rv).forEach(k=>{const j=+k,n=rv[k];if(hp[j]>0&&n>bn){best=j;bn=n}});return best}
const cmdCard=c=>room&&!envSilent(room)&&room.status==='playing'&&room.chars&&room.chars.some((k,i)=>k==='rien'&&room.st[i].cmd===c&&(!room.st[i].cmdAddict||rd()===i));
const handCount=i=>(room.hands[i]||[]).length+(i===rd()?privateSunCards.length:(isHost?(hostSunCards[i]||[]).length:0));
const repOk=s=>!envSilent(room)&&room.chars[s]==='rien'&&(room.st[s].grace||0)>=9&&!room.st[s].repUsed&&!(room.st[s].sealT>0);
function playRep(){if(wardenPaused()||isoPending()||valorantShopPending()||mirrorPending()||environmentTradePending())return;db.doc(`rooms/${code}/moves/${room.round}_${rd()}`).set({rep:true});sel=null;}
function bossDraftUsed(D,i){return D.picks[i].reduce((n,c)=>n+dwt(c),0)}
function bossDraftFull(D,i){return bossDraftUsed(D,i)>=(i===1?3:1)}
function bossDraftCanPick(D,c,i){const pvzN=D.picks[i].filter(isPvz).length;return !!CHARS[c]&&!CHARS[c].hidden&&(!isPvz(c)||i===1&&pvzN<2&&D.picks[i].some(canDeploy))&&(!room.cfg.factions||room.cfg.factions[CHARS[c].f]!==false)&&!D.picks.flat().includes(c)&&!bossDraftFull(D,i)&&bossDraftUsed(D,i)+dwt(c)<=(i===1?3:1)&&!(i!==1&&D.picks[i].length>0)}
function bossDraftUI(s){const D=room.draft,nm=room.seats.map(p=>esc(p.name)),step=D.step||0,cur=D.order[step],mine=s===cur,taken=D.picks.flat(),done=step>=D.order.length,opts=Object.keys(CHARS).filter(c=>!CHARS[c].hidden&&(!room.cfg.factions||room.cfg.factions[CHARS[c].f]!==false)).map(c=>{const locked=taken.includes(c),ok=mine&&!done&&bossDraftCanPick(D,c,cur),status=locked?'已選':isPvz(c)?cur===1?'Boss後備植物（最多2名）':'挑戰者僅1槽':cur===1?'Boss可選':'挑戰者首發';return `<button class="draft-option ${locked?'picked':''}" ${ok?'':'disabled'} onclick="pickBossChar('${c}')" title="${esc(CHARS[c].d)}"><div class="draft-art"><img src="${charArtSrc(imgK(c),'left')}" data-k="${imgK(c)}" data-p="left" data-s="0" onerror="imgFb(this)"></div><div class="draft-card-info"><span class="draft-card-name">${esc(CHARS[c].n)}</span><div class="draft-card-tag"><span class="draft-badge">${esc(FAC[CHARS[c].f]||'其他')}陣營</span><span class="draft-badge">${status}</span></div><span class="draft-desc">${esc(CHARS[c].d)}</span></div></button>`}).join(''),order=D.order.map((x,k)=>`<span class="chip ${k===step?'cmd':''}">${k+1}. ${nm[x]}</span>`).join('');return `<div class="box draft-box"><div class="draft-head"><div><div class="draft-title">Boss 挑戰賽選角</div><div class="mut">挑戰者（1槽）→ Boss（3槽）→ 挑戰者（1槽）→ Boss 選滿3槽</div><div class="draft-order">${order}</div></div><div class="draft-turn">${done?'選角完成，準備開戰':mine?'👉 輪到你選角':'等待 '+nm[cur]+' 選角'}</div></div><div class="draft-teams">${room.seats.map((p,i)=>`<section class="draft-team ${i===cur&&!done?'active':''}"><div class="draft-team-name"><span>${i===1?'Boss':'挑戰者'}：${esc(p.name)}${i===s?'（你）':''}</span><span class="mut">已選 ${bossDraftUsed(D,i)}/${i===1?3:1} 槽　${i===1?'PVZ '+D.picks[i].filter(isPvz).length+'/2':''}</span></div><div class="draft-team-slots">${D.picks[i].map(c=>`<div class="draft-pick"><img src="${charArtSrc(imgK(c),'left')}" data-k="${imgK(c)}" data-p="left" data-s="0" onerror="imgFb(this)"><div class="draft-pick-name">${esc(CHARS[c].n)}<span class="draft-pick-role">${isPvz(c)?'後備植物':i===1?'Boss':'挑戰者'}</span></div></div>`).join('')||'<div class="draft-empty">尚未選擇角色</div>'}</div></section>`).join('')}</div><div class="draft-section-title"><span>選擇角色</span><span class="mut">挑戰者固定1槽；Boss可將植物作為後備，最多2名</span></div><div class="draft-grid">${opts}</div></div>`}
function pickBossChar(c){const D=room.draft,step=D.step||0,s=rd(),cur=D.order[step];if(s!==cur||!bossDraftCanPick(D,c,s))return;db.doc(`rooms/${code}/moves/d${room.roundBase}_${step}_${s}`).set({char:c})}
function draftUI(s){if(room.cfg.boss)return bossDraftUI(s);const D=room.draft,nm=room.seats.map(p=>esc(p.name)),taken=D.picks.flat(),step=D.step||0,cur=D.order[step%D.order.length],done=D.picks.every((_,x)=>dfull(D,x)),mine=s===cur,available=c=>!CHARS[c].hidden&&singleSlotDraftAllowed(room,c)&&!(room.bans||[]).includes(c)&&(!room.cfg.factions||room.cfg.factions[CHARS[c].f]!==false),charArt=c=>`<img src="${charArtSrc(imgK(c),'left')}" data-k="${imgK(c)}" data-p="left" data-s="0" onerror="imgFb(this)" alt="${esc(CHARS[c].n)}">`;
  const ord=D.order.map((x,k)=>`<span class="chip ${k===step%D.order.length?'cmd':''}">${k+1}. ${nm[x]}</span>`).join('');
  const teams=D.picks.map((_,i)=>`<section class="draft-team ${i===cur&&!done?'active':''}"><div class="draft-team-name"><span>${nm[i]}${i===s?'（你）':''}</span><span class="mut">已選 ${dwtSum(D,i)}/3 槽　PVZ ${D.picks[i].filter(isPvz).length}/2</span></div><div class="draft-team-slots">${D.picks[i].map(c=>{const role=isPvz(c)?'後備植物':c==='leo'?'首發・佔滿3槽':D.picks[i].findIndex(x=>canDeploy(x))===D.picks[i].indexOf(c)?'首發':'後備';return`<div class="draft-pick">${charArt(c)}<div class="draft-pick-name">${esc(CHARS[c].n)}<span class="draft-pick-role">${role}</span></div></div>`}).join('')||'<div class="draft-empty">尚未選擇角色</div>'}</div></section>`).join('');
  const options=Object.keys(CHARS).filter(available).map(c=>{const t=taken.includes(c),pvzFull=isPvz(c)&&D.picks[cur].filter(isPvz).length>=2,canPick=mine&&!done&&draftCanPick(D,c,cur),slots=dwt(c),status=t?'已選':pvzFull?'PVZ最多2名':slots>3-dwtSum(D,cur)?`需 ${slots} 槽`:`佔用 ${slots} 槽`;return`<button class="draft-option ${t?'picked':''}" ${canPick?'':'disabled'} onclick="pickChar('${c}')" title="${esc(CHARS[c].d)}"><div class="draft-art">${charArt(c)}</div><div class="draft-card-info"><span class="draft-card-name">${esc(CHARS[c].n)}${CHARS[c].t?`・${esc(CHARS[c].t)}`:''}</span><div class="draft-card-tag"><span class="draft-badge">${esc(FAC[CHARS[c].f]||'其他')}陣營</span><span class="draft-badge">${status}</span></div><span class="draft-desc">${esc(CHARS[c].d)}</span></div>${t?'<span class="draft-picked-label">已選取</span>':''}</button>`}).join('');
  return`<div class="box draft-box"><div class="draft-head"><div><div class="draft-title">${room.cfg.n===3?'3v3v3':'3v3'} 角色選角</div><div class="mut">選角順序</div><div class="draft-order">${ord}</div></div><div class="draft-turn">${done?'選角完成，準備開戰':mine?(options.includes('draft-option')&&options.split('<button').slice(1).some(b=>!/disabled/.test(b.split('>')[0]))?'👉 輪到你選角':'⚠ 沒有可選的角色，系統即將自動結束你的選角'):'等待 '+nm[cur]+' 選角'}</div></div>
  <div class="draft-teams">${teams}</div><div class="draft-section-title"><span>選擇角色</span><span class="mut">每局禁用：${(room.bans||[]).map(c=>esc(CHARS[c].n)).join('、')||'無'}｜每隊最多 3 槽</span></div><div class="draft-grid">${options}</div>
  <details style="margin-top:16px"><summary>角色技能說明</summary>${Object.keys(CHARS).filter(available).map(c=>`<div class="mut"><b>${esc(CHARS[c].n)}</b>：${esc(CHARS[c].d)}</div>`).join('')}</details></div>`}
// 僅整場最後一個選角槽的操作者可使用；不加入模式或角色選單。
function wardenDraftReady(r,i){const D=r?.draft;if(r?.status!=='draft'||!r.cfg.v3||r.cfg.n!==3||r.cfg.boss||r.cfg.warden||r.seats.length!==3||!D?.order?.length||!Number.isInteger(i))return false;
  const current=D.order[(D.step||0)%D.order.length];return i===current&&!dfull(D,i)&&dwtSum(D,i)===2&&D.picks.every((_,j)=>j===i||dfull(D,j));
}
function wardenDraftUI(i){return wardenDraftReady(room,i)?'<button type="button" class="draft-corner" onclick="openDraftCorner()"></button>':''}
function openDraftCorner(){const seat=rd();if(!wardenDraftReady(room,seat)||moves[`d${room.roundBase}_${room.draft.step}_${seat}`])return;const value=prompt('','');if(value===null||String(value).trim()!=='4134')return;
  const req={type:'wardenDraft',uid,seat,roundBase:room.roundBase,step:room.draft.step,value:String(value).trim()};if(test||isHost)acceptWardenDraft(null,req);else if(hostConn)hostConn.send({privateRequest:req});
}
const WARDEN_INTRO_MS=1800;
const WARDEN_OPENING={file:'assets/audio/sfx/warden/S1003V-169.ogg',voiceMs:8214,text:'罪人阿......怎敢抗拒懲罰',typeDelay:200,typeMs:4200,holdMs:400};
const WARDEN_ENTRY_MS=WARDEN_INTRO_MS+WARDEN_OPENING.voiceMs+WARDEN_OPENING.holdMs;
const WARDEN_NAIL={src:'assets/images/effects/warden/6055fd30-4c93-44a3-8d02-d3215125bf6f (1).png',fallMs:160,holdMs:1500,damageLag:70};
const wardenIntroPending=(r=room)=>!!(r?.cfg.warden&&r.status==='wardenIntro');
const WARDEN_SHIFT_MS=4200;
const WARDEN_FINAL={holdMs:5000,tearMs:900,warpMs:1000,noiseMs:1300,riseMs:1800,dead:'assets/images/characters/warden/1487-Dead.png',lux:'assets/images/effects/warden/lux.png',frame:'assets/images/effects/warden/下載.png',skill:'assets/audio/sfx/warden/skill.mp3',skillMs:10944};
const WARDEN_FINAL_REVEAL_MS=WARDEN_FINAL.holdMs+WARDEN_FINAL.tearMs+WARDEN_FINAL.warpMs+WARDEN_FINAL.noiseMs;
const WARDEN_GROWTH={leadMs:600,intervals:[1000,800,650,530,430,350,280,230,185,150,120,96,76,60,48],holdMs:495,factors:Array.from({length:16},(_,i)=>i+1)};
const WARDEN_GROWTH_AT=[WARDEN_GROWTH.leadMs,...WARDEN_GROWTH.intervals].reduce((times,ms)=>{times.push((times.at(-1)||0)+ms);return times},[]);
const WARDEN_FINAL_SHIFT_MS=WARDEN_FINAL_REVEAL_MS+WARDEN_GROWTH_AT.at(-1)+WARDEN_GROWTH.holdMs;
const wardenGrowthStep=age=>WARDEN_GROWTH_AT.reduce((step,at,i)=>age>=at?i:step,-1);
function wardenGrowthNoise(age){const step=wardenGrowthStep(age),next=step+1;if(next>=WARDEN_GROWTH_AT.length)return false;const start=step<0?0:WARDEN_GROWTH_AT[step];return age>=start&&age-start<Math.min(600,Math.floor((WARDEN_GROWTH_AT[next]-start)*.6))}
const WARDEN_TIPHERETH={file:'assets/audio/sfx/warden/tiphereth.mp3',text:'只要存在，我們就一定擁有各自的價值和意義',voiceMs:6110,holdMs:800};
const WARDEN_JUDGMENT={shatterAt:1400,rainAt:1900,epsilonAt:5000,epsilonMs:500,choiceAt:7000,cross:'assets/images/effects/warden/-22the-radiant-symbol-of-faith-glowing-gold-cross-22_11011493.png',rocks:72,shockwaves:48};
const WARDEN_STAGES={1:{n:'看守',factor:2.4,fill:1,bg:'assets/images/backgrounds/warden/1.png',bgm:'assets/audio/bgm/warden/1.mp3'},2:{n:'牧師',factor:4,fill:1,bg:'assets/images/backgrounds/warden/2.png',bgm:'assets/audio/bgm/warden/2.mp3'},3:{n:'牧師',factor:16,fill:1,bg:'assets/images/backgrounds/warden/3.png',bgm:'assets/audio/bgm/warden/3.mp3'}};
const WARDEN_SOUND={attack:'assets/audio/sfx/warden/普通攻擊.mp3',punishment:'assets/audio/sfx/warden/看守階段使用特殊攻擊.mp3',growth:'assets/audio/sfx/warden/血量暴增轉場.mp3',rain:'assets/audio/sfx/warden/無數釘子降落.mp3',fate:'assets/audio/sfx/warden/FateLost.mp3',revive:'assets/audio/sfx/warden/復活.mp3'};
Object.assign(WARDEN_SOUND,{finalPlay:'assets/audio/sfx/warden/第三階段出牌階段開始.mp3',shiftDelete:'assets/audio/sfx/warden/使用shift+delete.mp3',forcedExit:'assets/audio/sfx/warden/使用強制退場時.mp3',console:'assets/audio/sfx/warden/點到被console標記的牌.mp3'});
const WARDEN_FINAL_VOICE_MS={finalPlay:7397,shiftDelete:7945,forcedExit:5705,console:5568};
function markWardenFinalPlay(r){if(wardenFinalPriest(r)&&r.wardenFinalVoiceAt===undefined)r.wardenFinalVoiceAt=Date.now();return r}
const WARDEN_CONTINUE={crackMs:1000,introMs:3507,reviveMs:5266,images:['assets/images/effects/warden/fatelost1.png','assets/images/effects/warden/fatelost2.png','assets/images/effects/warden/復活.png']};
const wardenStage=r=>Math.min(3,Math.max(1,r?.st?.[1]?.wardenStage||1));
const unlimitedWardenSwaps=(r,i)=>!!(r?.cfg.warden&&[0,2].includes(i));
function grantWardenStageRedraws(r){if(!r.cfg.warden||r.wardenRedrawStage===wardenStage(r))return r;r.wardenRedrawStage=wardenStage(r);r.wardenRedraws=r.seats.map((_,i)=>unlimitedWardenSwaps(r,i)?(r.wardenRedraws?.[i]||0)+2:0);return r}
const WARDEN_PASSIVE_ART={unstable:'assets/images/effects/warden/不稳定显现.png',pulse:'assets/images/effects/warden/搏动（权能）.png',stop:'assets/images/effects/warden/停止（权能）.png',save:'assets/images/effects/warden/保存.png',candle:'assets/images/characters/warden/燭台.png',evidence:'assets/images/effects/warden/告解的证据.png',evidenceS:'assets/images/effects/warden/锤之钉【定罪】.png',evidenceC:'assets/images/effects/warden/锤之钉【审判】.png',evidenceD:'assets/images/effects/warden/钉【刑罚】.png',evidenceH:'assets/images/effects/warden/钉【赎罪】.png',power:'assets/images/effects/warden/漆黑之神的权能.png',voice:'assets/images/effects/warden/漆黑之神的声音.png',sisyphus:'assets/images/effects/warden/西西弗刑的看守.png'};
Object.assign(WARDEN_PASSIVE_ART,{Exception:'assets/images/effects/warden/钉【Exception】.png',Breakpoint:'assets/images/effects/warden/钉【Breakpoint】.png',Console:'assets/images/effects/warden/钉【Console】.png',system:'assets/images/effects/warden/保存西西弗系统.png'});
const STATUS_ART={strong:'assets/images/effects/status/強壯.png',guard:'assets/images/effects/status/守护.png',vuln:'assets/images/effects/status/易损.png',weak:'assets/images/effects/status/虛弱.png'};
const statusIcon=k=>`<img class="status-icon" src="${STATUS_ART[k]}" alt="">`;
const WARDEN_BOON_ART={tiphereth:'assets/images/effects/warden/Tiphereth的期待.png',gebura:'assets/images/effects/warden/Gebura之刃.png'};
function grantWardenTiphereth(r,at){if(!r.cfg.warden||r.wardenTipherethGranted)return r;r.wardenTipherethGranted=true;r.wardenTipherethAt=at;for(const i of [0,2]){r.st[i].shield=(r.st[i].shield||0)+25;r.st[i].shieldPersistent=(r.st[i].shieldPersistent||0)+25;r.st[i].wardenTiphereth=1;r.team[i].forEach((m,k)=>{if(k===r.act[i])m.st=JSON.parse(JSON.stringify(r.st[i]));else m.st.wardenTiphereth=1})}return syncWardenState(r)}
function wardenGeburaLife(s,hp,name,log){if(!s?.wardenGeburaEligible)return hp;if(s.wardenGeburaPending||s.wardenGebura){if(hp<1){log.push(`${name} 的【Gebura之刃】保留1點生命`);return 1}return hp}if(hp<=0&&!s.wardenGeburaUsed){s.wardenGeburaUsed=1;s.wardenGeburaPending=1;log.push(`${name} 的首次致命傷害被阻止，保留1點生命；下回合獲得【Gebura之刃】`);return 1}return hp}
const wardenGod=(r,i=1)=>!!(r?.cfg.warden&&i===1&&wardenStage(r)===1&&r.st?.[1]?.wardenGod);
const wardenPriest=r=>!!(r?.cfg.warden&&wardenStage(r)===2&&r.st?.[1]?.wardenDay);
function wardenFinalPriest(r){return !!(r?.cfg.warden&&wardenStage(r)===3)}
const wardenTipherethActive=s=>!!(s?.wardenTiphereth&&!s.wardenTipherethDisabled);
const wardenForcedExit=r=>!!(wardenFinalPriest(r)&&r.st[1].wardenForcedExit);
const wardenFinalSpecial=r=>!!(wardenForcedExit(r)||wardenFinalPriest(r)&&r.st[1].wardenShiftDelete);
function clearWardenSecondStage(r){
  if(!r.cfg.warden||wardenStage(r)!==2)return r;const s=r.st[1];
  s.wardenVoice=0;s.wardenPower=0;s.wardenFinalSisyphus=s.wardenSisyphus||0;s.wardenSisyphus=0;
  for(const k of ['wardenDay','wardenExecution','wardenExecutionPending','wardenEvidencePending','wardenCalmUntil'])delete s[k];
  r.st.forEach((state,i)=>{delete state.wardenEvidence;if(state.wardenPulse)state.wardenPulse=0;if(state.wardenStop)state.wardenStop=0;if(state.wardenCondemned)state.wardenCondemned=0;state.fx=state.fx.filter(f=>!['wardenRound','wardenEvidence'].includes(f.source));r.team[i].forEach(m=>{delete m.st.wardenEvidence;if(m.st.wardenPulse)m.st.wardenPulse=0;if(m.st.wardenStop)m.st.wardenStop=0;if(m.st.wardenCondemned)m.st.wardenCondemned=0;m.st.fx=m.st.fx.filter(f=>!['wardenRound','wardenEvidence'].includes(f.source))})});
  return syncWardenState(r);
}
// 復活清除該階段的證據／維護工具及已觸發效果，保留其餘角色狀態。
function clearWardenRevivalEffects(r,s){
  if(!r?.cfg.warden||!s)return;
  if(wardenStage(r)===2){if(s.wardenEvidence)s.wardenEvidence={kind:null,n:0};if(s.wardenCondemned)s.wardenCondemned=0;s.fx=(s.fx||[]).filter(f=>f.source!=='wardenEvidence')}
  if(wardenStage(r)===3){if(s.wardenMaintenance)clearWardenMaintenance(s);for(const k of ['wardenException','wardenBreakpointVuln','wardenTipherethDisabled'])if(s[k])s[k]=0}
}
const wardenCandleAlive=r=>(r?.wardenCandles||[]).filter(c=>!c.dead&&c.hp>0);
const wardenCandle=r=>id=>wardenCandleAlive(r).find(c=>c.id===id);
const sanityMin=(r,i)=>r?.cfg.warden&&wardenStage(r)===1&&[0,2].includes(i)?-30:r?.cfg.warden&&wardenStage(r)===3&&i===1?45:r?.cfg.warden&&wardenStage(r)===2&&i===1?30:wardenGod(r,i)?0:-45;
const wardenSlayDamage=r=>damageAmount(r.cfg.hp*1.2);
function syncWardenState(r){if(!r?.cfg.warden||!r.st?.[1])return r;syncWardenConsoleCards(r);r.st.forEach((s,i)=>{const min=sanityMin(r,i);if(min>-45)s.san=Math.max(min,s.san||0);if(r.wardenTipherethGranted&&[0,2].includes(i))s.wardenGeburaEligible=1;if(r.team){r.team[i].forEach((m,k)=>{if(min>-45)m.st.san=Math.max(min,m.st.san||0);if(r.wardenTipherethGranted&&[0,2].includes(i))m.st.wardenGeburaEligible=k===r.act[i]?1:0});r.team[i][r.act[i]].st=JSON.parse(JSON.stringify(s))}});return r}
function initWarden(r){if(!r.cfg.warden)return r;Object.assign(r.st[1],{wardenGod:1,wardenUnstable:3,wardenSave:0,wardenPerfect:0,wardenSpent:0});r.wardenCandles=[];grantWardenStageRedraws(r);return syncWardenState(r)}
function clearWardenFirstStage(r){
  if(!r.cfg.warden||!r.st?.[1])return r;const s=r.st[1];
  r.st[1]={...newSt(),wardenStage:2,wardenBroken:0,wardenDay:1,wardenVoice:0,wardenPower:0,wardenSisyphus:0,wardenCalmUntil:0,wardenSave:s.wardenSave||0,wardenPerfect:s.wardenPerfect||0,wardenSpent:s.wardenSpent||0,san:Math.max(30,s.san||0)};
  r.wardenCandles=[];delete r.wardenCandleTurns;delete r.wardenCandleNext;delete r.wardenRoundStarted;delete r.wardenRoundFinished;
  r.team[1][r.act[1]].st=JSON.parse(JSON.stringify(r.st[1]));return r;
}
// 所有專屬被動以完整回合為單位，兩場交鋒、即時技能和重繪不重複觸發。
function beginWardenTurn(r){
  if(!r.cfg.warden||r.status!=='playing'||wardenJudgmentArmed(r)||r.wardenRoundStarted===r.round||!r.st?.[1])return r;
  r.wardenRoundStarted=r.round;const s=r.st[1],log=[];if(wardenFinalPriest(r))beginWardenFinalTurn(r,log);
  if(wardenStage(r)===3&&r.wardenTipherethGranted)for(const i of [0,2]){const state=r.st[i];if(state.wardenGeburaPending&&r.hp[i]>0){state.wardenGeburaPending=0;state.wardenGebura=1;log.push(`${r.seats[i].name} 的【Gebura之刃】本回合發動`)}}
  const buff=(k,n,t=1,source='wardenRound')=>{if(n)s.fx.push({k,n,t,source})};
  const perfect=Math.min(10,s.wardenPerfect||0);buff('s',Math.ceil(perfect/2));buff('g',Math.floor(perfect/2));
  if(wardenPriest(r)){
    if(s.wardenExecutionPending?.round<=r.round){s.wardenExecution=s.wardenExecutionPending.number;delete s.wardenExecutionPending;log.push(`【死刑執行】本回合範圍為${s.wardenExecution}正負2`)}
    if(!(s.wardenPower>0)&&s.wardenVoice>=100){s.wardenVoice=0;s.wardenPower=100;s.wardenSisyphus=(s.wardenSisyphus||0)+1;s.wardenExecutionPending={round:r.round+1,number:5+Math.floor(Math.random()*16)};log.push('【漆黑之神的聲音】回合開始轉為100層權能，獲得西西弗刑的看守及死刑預告')}
    buff('s',Math.floor((s.wardenPower||0)/20));
    if(r.round>(s.wardenCalmUntil||0)){const targets=wardenTargets(r),first=rnd(targets);if(first!==undefined){const other=targets.find(i=>i!==first),kind=other===undefined?rnd(['pulse','stop']):'pulse';r.st[first][kind==='pulse'?'wardenPulse':'wardenStop']=1;log.push(`【審判之日】${r.seats[first].name} 本回合獲得【${kind==='pulse'?'搏動':'停止'}】`);if(other!==undefined){r.st[other].wardenStop=1;log.push(`【審判之日】${r.seats[other].name} 本回合獲得【停止】`)}}}
    else log.push('【審判之日】本回合暫停施加搏動與停止');
  }
  if(wardenFinalPriest(r)){
    buff('s',Math.floor((s.wardenPower||0)/20));
  }
  if(wardenGod(r)){
    if(s.wardenUnstable>0){const n=s.wardenUnstable*2;buff('v',n);buff('w',n);log.push(`【不穩定展現】${s.wardenUnstable}層：本回合易損與虛弱各${n}層`)}
    if(s.wardenCandleLossPending){const n=s.wardenCandleLossPending*2;buff('w',n,3,'wardenCandleLoss');buff('v',n,3,'wardenCandleLoss');s.wardenCandleLossPending=0;log.push(`燭台被擊殺：看守獲得${n}層虛弱與易損（3回合）`)}
    if(!(s.wardenUnstable>0)&&!wardenCandleAlive(r).length&&(r.wardenCandleNext===undefined||r.round>=r.wardenCandleNext)){
      const hp=Math.ceil(r.cfg.hp*.6);r.wardenCandles=[0,1].map(k=>({id:`${r.round}:${k}`,hp,max:hp,dead:false,st:newSt()}));r.wardenCandleTurns=0;delete r.wardenCandleNext;log.push(`【神聖刑罰燭台】生成兩隻刑罰之燭台（各${hp}血）`);
    }
    const alive=wardenCandleAlive(r).length;buff('s',alive*2);buff('g',alive);
    s.wardenPrep=!!s.wardenPrepPending;s.wardenPrepPending=0;s.wardenPunish=!!s.wardenPunishPending;s.wardenPunishPending=0;
    const targets=wardenTargets(r);if(targets.length){const i=rnd(targets),kind=rnd(['pulse','stop']);r.st[i][kind==='pulse'?'wardenPulse':'wardenStop']=1;log.push(`【神之代理人】${r.seats[i].name} 本回合獲得【${kind==='pulse'?'搏動':'停止'}】`)}
  }
  if(wardenPriest(r)&&s.wardenEvidencePending?.round<=r.round){
    const grants=s.wardenEvidencePending.count||1;delete s.wardenEvidencePending;
    for(const i of [0,2])r.team[i].forEach((m,k)=>{const active=k===r.act[i],state=active?r.st[i]:m.st;if(active?!(r.hp[i]>0):m.dead||!(m.hp>0))return;const e=wardenEvidence(state);addWardenEvidence(state,e.n?e.kind:rnd(['S','C','D','H']),3*grants,log,`${r.seats[i].name} 的${CHARS[m.c].n}`)});
  }
  r.sLog=[...(r.sLog||[]),...log];if(wardenPriest(r))r=beginWardenEvidence(r);if(wardenFinalPriest(r))r=beginWardenMaintenance(r);return syncWardenState(r);
}
function wardenCardDowngrade(r,targets=[0,2],amount=1){
  const lower=c=>'SCHD'.includes(c?.[0])?c[0]+Math.max(1,+c.slice(1)-amount):c;
  for(const i of targets){r.hands[i]=r.hands[i].map(lower);r.up[i]=r.up[i].map(lower);hostSunCards[i]=(hostSunCards[i]||[]).map(x=>({...x,card:lower(x.card)}));hostSunCards[i].forEach(c=>{if(test||r.seats[i].id===uid)privateSunCards=privateSunCards.map(p=>p.id===c.id?{...c}:p);else sendPrivateTo(r.seats[i].id,{sunCardUpdate:{...c}})});if(r.env?.publicSun?.[i])r.env.publicSun[i]=r.env.publicSun[i].map(x=>({...x,card:lower(x.card)}));const s=r.st[i];if(r.chars[i]==='firefu'&&s.firefuThirst)s.firefuCard=lower(s.firefuCard)}
}
function finishWardenTurn(r,round){
  if(!r.cfg.warden||r.wardenRoundFinished===round||!r.st?.[1])return r;r.wardenRoundFinished=round;const s=r.st[1],log=r.last?.log||[];
  // 保命只記錄當回合觸發；完整收尾就授予之刃，下一次出牌與明暗牌整理都直接顯示。
  if(wardenStage(r)===3&&r.wardenTipherethGranted)for(const i of [0,2]){
    const state=r.st[i];if(state.wardenGeburaPending&&r.hp[i]>0){state.wardenGeburaPending=0;state.wardenGebura=1;log.push(`${r.seats[i].name} 保留至少1血，下一次出牌直接獲得【Gebura之刃】`)}
    else{if(state.wardenGebura)log.push(`${r.seats[i].name} 的【Gebura之刃】回合結束消失`);state.wardenGebura=0}
    r.team[i].forEach((m,k)=>{if(k!==r.act[i])m.st.wardenGebura=0});
  }
  if(wardenPriest(r)){drainWardenPower(r,10,log,'回合結束');delete s.wardenExecution;finishWardenEvidence(r,log)}
  if(wardenFinalPriest(r)){
    drainWardenPower(r,10,log,'回合結束');delete s.wardenForcedExit;delete s.wardenShiftDelete;s.wardenSystem=0;
    const spent=Math.min(10,s.wardenSave||0);if(spent)consumeWardenSave(r,spent);s.wardenSystemPending={round:round+1,n:spent};if(spent)log.push(`【好，該下班了】回合結束消耗${spent}保存，下回合獲得${spent}層保存西西弗系統`);
    for(const i of [0,2])r.team[i].forEach((m,k)=>{const state=k===r.act[i]?r.st[i]:m.st;if(k!==r.act[i]&&!m.dead&&m.hp>0)reduceWardenMaintenance(state,1);state.wardenRapidPulse=0;state.wardenCompleteStop=0;state.wardenException=0;state.wardenTipherethDisabled=Math.max(0,(state.wardenTipherethDisabled||0)-1);state.wardenBreakpointVuln=Math.max(0,(state.wardenBreakpointVuln||0)-1)});
    if(s.wardenShiftVulnRound===round)delete s.wardenShiftVulnRound;
  }
  if(wardenGod(r)){
    if(s.wardenUnstable>0)s.wardenUnstable--;
    if(s.wardenPrep){s.wardenPunishPending=wardenCandleAlive(r).length>0?1:0;log.push(s.wardenPunishPending?'【懲罰預備】燭台仍存活，下回合發動懲罰':'【懲罰預備】燭台已全滅，被動消失')}
    s.wardenPrep=0;s.wardenPunish=0;
    if(r.wardenCandles?.length){r.wardenCandleTurns=(r.wardenCandleTurns||0)+1;if(r.wardenCandleTurns%2===0&&wardenCandleAlive(r).length){wardenCardDowngrade(r);s.wardenPrepPending=1;log.push('刑罰之燭台：所有挑戰者手牌點數−1（最低A），下回合獲得【懲罰預備】')}}
  }
  r.st.forEach((state,i)=>{state.wardenPulse=0;state.wardenStop=0;state.wardenCondemned=0;state.fx=(state.fx||[]).filter(f=>!['wardenRound','wardenEvidence'].includes(f.source));r.team?.[i].forEach(m=>{m.st.wardenPulse=0;m.st.wardenStop=0;m.st.wardenCondemned=0;m.st.fx=(m.st.fx||[]).filter(f=>!['wardenRound','wardenEvidence'].includes(f.source))})});return syncWardenState(r);
}
function wardenSpendOptions(r){return wardenFinalPriest(r)?[0,20,40,60,90]:wardenPriest(r)?[0,10,20,30,50,60]:[0,10,20,30]}
function wardenSpendValid(r,n){return Number.isInteger(n)&&wardenSpendOptions(r).includes(n)&&(!n||(wardenGod(r)||wardenPriest(r)||wardenFinalPriest(r))&&n<=(r.st[1].wardenSave||0))}
function wardenSpendLabel(r,n){return wardenFinalPriest(r)?({0:'不消耗',20:'兩張牌各＋3',40:'敵人含後備維護工具＋1',60:'下回合手牌統一數字',90:'下回合shift+delete'})[n]:n===50?'下兩回合停止施加搏動／停止':n===60?'下回合所有存活敵人含後備證據＋3':'兩張牌各＋'+n/10}
let wardenSaveSpend=0,wardenCandleTarget=null;
function setWardenSaveSpend(n){if(!wardenPaused()&&rd()===1&&room.phase==='play'&&!moves[room.round+'_1']&&wardenSpendValid(room,n)){wardenSaveSpend=n;render()}}
function consumeWardenSave(r,n){const s=r.st[1],total=(s.wardenSpent||0)+n;s.wardenSave-=n;s.wardenPerfect=Math.min(10,(s.wardenPerfect||0)+Math.floor(total/30));s.wardenSpent=total%30;if((wardenPriest(r)||wardenFinalPriest(r))&&!(s.wardenPower>0))s.wardenVoice=Math.min(100,(s.wardenVoice||0)+n)}
function spendWardenSave(r,n){
  if(!n||!wardenSpendValid(r,n))return 0;const s=r.st[1];consumeWardenSave(r,n);
  if(wardenFinalPriest(r)){
    if(n===40)forEachWardenChallenger(r,(state,i,k)=>{const e=wardenMaintenance(state);applyWardenMaintenance(r,state,e.n?e.kind:rnd(Object.keys(WARDEN_MAINTENANCE)),1,[],`${r.seats[i].name} 的${CHARS[r.team[i][k].c].n}`)});
    if(n===60)s.wardenRewritePending={round:r.round+1};
    if(n===90)s.wardenShiftDeletePending={round:r.round+1};
    syncWardenState(r);return n===20?3:0;
  }
  if(wardenPriest(r)){if(n===50)s.wardenCalmUntil=Math.max(s.wardenCalmUntil||0,r.round+2);if(n===60)s.wardenEvidencePending={round:r.round+1,count:(s.wardenEvidencePending?.count||0)+1}}
  return n>=50?0:n/10;
}
function wardenSaveMultiplier(r){if(!wardenFinalPriest(r))return 1;const ratio=r.hp[1]/characterMaxHp(r,1,'warden',r.st[1]);return ratio<=.25?2:ratio<=.5?1.5:ratio<=.75?1.25:1}
function gainWardenSave(r,cards){if(!r.cfg.warden||r.st[1].wardenSave===undefined)return;const multiplier=wardenSaveMultiplier(r),gain=cards.filter(Boolean).reduce((n,c)=>n+Math.floor((+c.slice(1)||0)*multiplier+1e-9),0);r.st[1].wardenSave=Math.min(100,(r.st[1].wardenSave||0)+gain);if(gain)r.last?.log.push(`【保存】打出原始牌面${multiplier>1?'×'+multiplier+'（各張向下取整）':''}累積${gain}層（共${r.st[1].wardenSave}/100）`);syncWardenState(r)}
const WARDEN_EVIDENCE={S:'錘之釘-定罪',C:'錘之釘-審判',D:'釘-刑罰',H:'釘-贖罪'};
const WARDEN_EVIDENCE_DESC={S:'3層虛弱1、6層虛弱3；9層回合開始禁出方塊並受到傷害雙倍，觸發後清零。',C:'回合開始受到floor(層數/2)點固定傷害；9層受到10點固定傷害，觸發後清零。',D:'回合結束理智降低等同層數；9層回合開始將理智設為-45，觸發後清零。',H:'回合開始超過4層時全部手牌點數-1；9層全部手牌點數-5（最低A），觸發後清零。'};
const wardenEvidence=s=>s?.wardenEvidence||{kind:null,n:0};
function addWardenEvidence(s,kind,n,log,name){if(!WARDEN_EVIDENCE[kind]||!n)return;const before=wardenEvidence(s).n;s.wardenEvidence={kind,n:Math.min(9,before+n)};log.push(`【告解工具】${name} 獲得${n}層${WARDEN_EVIDENCE[kind]}（${s.wardenEvidence.n}/9；覆蓋前一種類，保留層數）`)}
function reduceWardenEvidence(s,n){const e=wardenEvidence(s);if(!e.n||e.n>=9)return 0;const lost=Math.min(e.n,n);s.wardenEvidence={kind:e.kind,n:e.n-lost};return lost}
function wardenEvidenceTotal(r){if(!wardenPriest(r))return 0;let n=0;for(const i of [0,2]){if(!r.team){if(r.hp[i]>0)n+=wardenEvidence(r.st[i]).n;continue}r.team[i].forEach((m,k)=>{if(k===r.act[i]){if(r.hp[i]>0)n+=wardenEvidence(r.st[i]).n}else if(!m.dead&&m.hp>0)n+=wardenEvidence(m.st).n})}return n}
function wardenEvidenceDamage(r,source,v,kind){if(!wardenPriest(r)||source!==1||kind==='wardenExecution')return v;const n=wardenEvidenceTotal(r);return n?v*(100+n)/100:v}
function drainWardenPower(r,n,log,reason){if(!(wardenPriest(r)||wardenFinalPriest(r))||!(r.st[1].wardenPower>0)||!(n>0))return;const s=r.st[1],lost=Math.min(s.wardenPower,n);s.wardenPower=tidyHp(Math.max(0,s.wardenPower-lost));log.push(`【漆黑之神的權能】${reason}：減少${lost}層（剩${s.wardenPower}）`);if(!s.wardenPower){s.wardenVoice=0;log.push('【漆黑之神的權能】耗盡，轉回漆黑之神的聲音（0/100）')}}
function beginWardenEvidence(r){
  const log=[],ticks=[];
  for(const i of [0,2]){if(!(r.hp[i]>0))continue;const s=r.st[i],e=wardenEvidence(s);if(!e.n)continue;
    if(e.kind==='S'&&e.n===9){s.wardenCondemned=1;s.fx.push({k:'w',n:3,t:1,source:'wardenEvidence'});log.push(`【${WARDEN_EVIDENCE.S}】${r.seats[i].name} 本回合禁出方塊、受到傷害雙倍，9層觸發後清零`)}
    if(e.kind==='C'){const amount=e.n===9?10:Math.floor(e.n/2);if(amount)ticks.push({seat:i,amount});log.push(`【${WARDEN_EVIDENCE.C}】${r.seats[i].name} 回合開始受到${amount}點固定傷害${e.n===9?'，9層觸發後清零':''}`)}
    if(e.kind==='D'&&e.n===9){s.san=-45;log.push(`【${WARDEN_EVIDENCE.D}】${r.seats[i].name} 理智設為-45，9層觸發後清零`)}
    if(e.kind==='H'&&e.n>4){const amount=e.n===9?5:1;wardenCardDowngrade(r,[i],amount);log.push(`【${WARDEN_EVIDENCE.H}】${r.seats[i].name} 全部手牌點數-${amount}（最低A）${e.n===9?'，9層觸發後清零':''}`)}
    if(e.n===9)s.wardenEvidence={kind:null,n:0};
  }
  r.sLog=[...(r.sLog||[]),...log];syncWardenState(r);
  if(ticks.length){const next=resolveBattle(r,{},null,{},null,{wardenEvidenceTick:ticks}),result=next.instantResult;delete next.instantResult;next.sLog=[...(next.sLog||[]),...result.log];next.instantFx={id:(r.instantFx?.id||0)+1,seat:1,chars:[...r.chars],...result};r=next}
  return r;
}
function finishWardenEvidence(r,log){
  for(const i of [0,2]){const s=r.st[i],e=wardenEvidence(s);if(r.hp[i]>0&&e.kind==='D'&&e.n){const before=s.san||0;s.san=Math.max(-45,before-e.n);log.push(`【${WARDEN_EVIDENCE.D}】${r.seats[i].name} 理智-${before-s.san}（${s.san}）`)}
    r.team[i].forEach((m,k)=>{if(k===r.act[i]||m.dead||!(m.hp>0))return;const lost=reduceWardenEvidence(m.st,1);if(lost)log.push(`${r.seats[i].name} 的後備 ${CHARS[m.c].n} 告解證據-${lost}（剩${wardenEvidence(m.st).n}層）`)});
  }
}
const WARDEN_MAINTENANCE={Exception:'釘-Exception',Breakpoint:'釘-Breakpoint',Console:'釘-Console'};
const WARDEN_MAINTENANCE_DESC={Exception:'回合初受到層數等量傷害；9層回合初清空，本回合所有牌0點無花色且受傷翻倍。',Breakpoint:'出黑牌時受到層數×2固定傷害；9層回合初受到10點固定傷害並清空，本回合及下回合受傷＋50%。',Console:'點選標記牌施加3層及加成；9層立即清空，使Tiphereth的期待失效三回合。'};
CHARS.warden.d+='第三階段【媽的，你們怎麼找到這個故障的】：理智最低45，回合初對不同挑戰者施加急遽搏動（攻擊傷害＋10）與完整停止（受傷−80%）。保存20使雙牌各＋3、40使敵人含後備維護工具＋1、60下回合雜訊後手牌統一數字、90下回合shift+delete。shift+delete要求挑戰者原牌總和2或26，失敗各受1點×基礎生命×2次固定傷害，成功使牧師下回合受傷翻倍。維護工具共用9層，最後種類覆蓋：黑牌Exception、紅牌Breakpoint；失敗1／成功2／原牌6以上3／10以上4層。每層使該角色受傷＋5%，低於半血與西西弗牧師3層以上各使施加量＋1。Console每回合隨機標記1～3張牌，點選施加3層及加成。Exception回合初受等量傷害，9層清空並使本回合0點無花色、受傷翻倍；Breakpoint出黑牌受層數×2固定傷害，9層回合初清空、受10點固定傷害並受傷＋50%兩回合；Console9層立即清空、停用期待三回合。後備回合末−1、紅心成功−2、淨化−3，9層未觸發前不能減少。聲音轉權能增加1層西西弗刑的牧師（等量強壯與守護），預告下一回合強制退場：指定2～26±1內各先得基礎生命×2.5護盾，再各受1點×基礎生命×2次固定傷害，全員不可換牌；與shift+delete撞期時後者順延。【好，該下班了】回合結束自動消耗最多10保存，照常累積完美保存與聲音，下回合獲得等量保存西西弗系統，強壯與易損各為層數／2。依目前血量75%／50%／25%以下，保存獲取量分別×1.25／1.5／2，回血超過門檻倍率降低，各張原牌向下取整後相加。看守戰復活清除對應階段的告解或維護工具及已觸發效果。二轉三清空告解、聲音與權能，西西弗看守層數轉為牧師。';
const wardenMaintenance=s=>s?.wardenMaintenance||{kind:null,n:0};
function wardenMaintenanceBonus(r){return wardenFinalPriest(r)?(r.hp[1]<characterMaxHp(r,1,'warden',r.st[1])/2?1:0)+((r.st[1].wardenFinalSisyphus||0)>=3?1:0):0}
function wardenMaintenanceCardLayers(card,success){const raw=+card.slice(1)||0;return success?(raw>=10?4:raw>=6?3:2):1}
// 三種維護工具共用層數，最後施加的種類覆蓋舊種類；未觸發的9層不能減少。
function addWardenMaintenance(s,kind,n,log=[],name='挑戰者'){
  if(!WARDEN_MAINTENANCE[kind]||!(n>0))return false;const before=wardenMaintenance(s).n;
  s.wardenMaintenance={kind,n:Math.min(9,before+n)};log.push(`【西西弗系維護工具】${name} 獲得${n}層${WARDEN_MAINTENANCE[kind]}（${s.wardenMaintenance.n}/9；覆蓋前一種類，保留層數）`);return s.wardenMaintenance.n===9;
}
function reduceWardenMaintenance(s,n){const e=wardenMaintenance(s);if(!e.n||e.n>=9)return 0;const lost=Math.min(e.n,n);s.wardenMaintenance={kind:e.kind,n:e.n-lost};return lost}
function clearWardenMaintenance(s){s.wardenMaintenance={kind:null,n:0}}
function applyWardenMaintenance(r,s,kind,n,log=[],name='挑戰者'){
  addWardenMaintenance(s,kind,n,log,name);
  if(kind==='Console'&&wardenMaintenance(s).n===9){clearWardenMaintenance(s);s.wardenTipherethDisabled=3;log.push(`【釘-Console】${name} 的Tiphereth的期待失效三回合，9層觸發後清零`)}
}
function forEachWardenChallenger(r,fn){for(const i of [0,2])r.team[i].forEach((m,k)=>{const active=k===r.act[i];if(active?r.hp[i]>0:!m.dead&&m.hp>0)fn(active?r.st[i]:m.st,i,k)})}
function wardenMaintenanceDamage(r,s,v,kind){
  if(!wardenFinalPriest(r)||!(v>0)||['wardenExecution','wardenForcedExit'].includes(kind))return v;
  const multiplier=(1+wardenMaintenance(s).n*.05)*(s?.wardenException?2:1)*(s?.wardenBreakpointVuln?1.5:1);
  return tidyHp(v*multiplier);
}
function beginWardenFinalTurn(r,log){
  markWardenFinalPlay(r);
  const s=r.st[1];s.wardenSystem=0;if(s.wardenSystemPending?.round<=r.round){s.wardenSystem=s.wardenSystemPending.n;delete s.wardenSystemPending;if(s.wardenSystem)log.push(`【保存西西弗系統】本回合獲得${s.wardenSystem}層`)}
  if(s.wardenForcedExitPending?.round<=r.round){s.wardenForcedExit=s.wardenForcedExitPending.number;delete s.wardenForcedExitPending;log.push(`【強制退場】本回合指定${s.wardenForcedExit}正負1`)}
  if(s.wardenShiftDeletePending?.round<=r.round){if(s.wardenForcedExit)s.wardenShiftDeletePending.round=r.round+1;else{s.wardenShiftDelete=1;delete s.wardenShiftDeletePending;log.push('【shift+delete】本回合發動特殊攻擊')}}
  if(!(s.wardenPower>0)&&s.wardenVoice>=100){s.wardenVoice=0;s.wardenPower=100;s.wardenFinalSisyphus=(s.wardenFinalSisyphus||0)+1;s.wardenForcedExitPending={round:r.round+1,number:2+Math.floor(Math.random()*25)};log.push('【漆黑之神的聲音】轉為100權能，獲得西西弗刑的牧師與預告-強制退場')}
  const targets=wardenTargets(r),first=rnd(targets);if(first!==undefined){const other=targets.find(i=>i!==first),pulse=other!==undefined||Math.random()<.5;r.st[first][pulse?'wardenRapidPulse':'wardenCompleteStop']=1;if(other!==undefined)r.st[other].wardenCompleteStop=1;log.push('【媽的，你們怎麼找到這個故障的】施加急遽搏動與完整停止')}
  if(s.wardenRewritePending?.round<=r.round){delete s.wardenRewritePending;const numbers={};for(const i of targets)numbers[i]=1+Math.floor(Math.random()*13);r.wardenRewrite={id:`${r.roundBase}:${r.round}`,startedAt:Date.now(),endsAt:Date.now()+900,numbers};log.push('【保存】手牌雜訊後，各挑戰者的全部手牌轉為各自的一個隨機數字')}
  initWardenConsole(r);
}
// Console只同步實體牌ID；暫時暗牌只保存sunId，不把私有牌面寫入房間。
function syncWardenConsoleCards(r){
  if(!wardenFinalPriest(r))return;const Q=r.wardenConsoleCards||(r.wardenConsoleCards={seq:0,cards:r.seats.map(()=>[])});
  for(const i of [0,2]){const old=Q.cards[i]||[],used=new Set();Q.cards[i]=(r.hands[i]||[]).map(card=>{const index=old.findIndex((c,k)=>!used.has(k)&&c.card===card);if(index<0)return{id:++Q.seq,card};used.add(index);return old[index]})}
}
function wardenConsoleRecord(r,i,c,visible,slot=null){
  const records=r.wardenConsoleCards?.cards[i]||[];let up=[...(r.up[i]||[])];const pool=records.filter(record=>{const at=up.indexOf(record.card),isUp=at>=0;if(isUp)up.splice(at,1);return isUp===!!visible});
  return slot===null?pool.find(record=>record.card===c):pool[slot]?.card===c?pool[slot]:null;
}
function initWardenConsole(r){
  syncWardenConsoleCards(r);r.wardenConsole={round:r.round,marks:r.seats.map(()=>[])};
  for(const i of wardenTargets(r)){const pool=[...(r.wardenConsoleCards.cards[i]||[]).map(c=>({cardId:c.id})),...(hostSunCards[i]||[]).filter(c=>c.expires>=r.round).map(c=>({sunId:c.id}))],count=Math.min(pool.length,1+Math.floor(Math.random()*3));for(let k=0;k<count;k++)r.wardenConsole.marks[i].push({id:`${r.roundBase}:${r.round}:${i}:${k}`,...pool.splice(Math.floor(Math.random()*pool.length),1)[0]})}
}
function wardenConsoleMark(r,i,c,visible,slot=null,sunId=null){
  if(!wardenFinalPriest(r)||r.wardenConsole?.round!==r.round)return null;const record=!sunId&&wardenConsoleRecord(r,i,c,visible,slot);
  return r.wardenConsole.marks[i]?.find(m=>!m.used&&(sunId?m.sunId===sunId:record&&m.cardId===record.id));
}
function wardenConsoleIcon(mark){return mark?`<img class="warden-console-mark" src="${WARDEN_PASSIVE_ART.Console}" alt="釘-Console" title="點選此牌會獲得釘-Console">`:''}
function acceptWardenConsole(cn,req){
  const r=room,i=req?.seat;if(!isHost||!wardenFinalPriest(r)||r.status!=='playing'||r.phase!=='play'||wardenPaused(r)||wardenJudgmentArmed(r)||!r.pair.includes(i)||![0,2].includes(i)||!(r.hp[i]>0)||r.st[i].stun>0||kiraCardLocked(r,i)||moves[r.round+'_'+i]||req.round!==r.round||req.roundBase!==r.roundBase||(test?i!==rd():(cn?cn.uid:uid)!==r.seats[i].id)||req.uid!==r.seats[i].id)return false;
  const mark=r.wardenConsole?.marks[i]?.find(m=>m.id===req.markId&&!m.used);if(!mark||r.wardenConsole.round!==r.round)return false;
  if(mark.sunId?!(hostSunCards[i]||[]).some(c=>c.id===mark.sunId&&c.expires>=r.round):!r.wardenConsoleCards.cards[i].some(c=>c.id===mark.cardId))return false;
  const next=JSON.parse(JSON.stringify(r)),selected=next.wardenConsole.marks[i].find(m=>m.id===mark.id),log=[];selected.used=true;
  applyWardenMaintenance(next,next.st[i],'Console',3+wardenMaintenanceBonus(next),log,next.seats[i].name);next.sLog=[...(next.sLog||[]),...log];
  const now=Date.now();next.wardenConsoleFx=[...(next.wardenConsoleFx||[]).filter(e=>now<e.at+WARDEN_FINAL_VOICE_MS.console),{id:mark.id,at:now,seat:i,member:next.act[i]}];save(next);return true;
}
function clickWardenConsole(markId){const i=rd(),req={type:'wardenConsole',uid:test?room.seats[i].id:uid,seat:i,round:room.round,roundBase:room.roundBase,markId};if(test||isHost)acceptWardenConsole(null,req);else hostConn?.send({privateRequest:req})}
function pickWardenMarkedCard(c,visible,slot,cardId=null){const mark=wardenConsoleMark(room,rd(),c,visible,slot);if(mark)clickWardenConsole(mark.id);pick(c,visible,cardId)}
function beginWardenMaintenance(r){
  const log=[],ticks=[];
  for(const i of [0,2]){if(!(r.hp[i]>0))continue;const s=r.st[i],e=wardenMaintenance(s);
    if(e.kind==='Exception'&&e.n){ticks.push({seat:i,amount:e.n});if(e.n===9){s.wardenException=1;clearWardenMaintenance(s);log.push(`【釘-Exception】${r.seats[i].name} 本回合0點無花色、受傷翻倍，9層觸發後清零`)}}
    if(e.kind==='Breakpoint'&&e.n===9){s.wardenBreakpointVuln=2;clearWardenMaintenance(s);ticks.push({seat:i,amount:10});log.push(`【釘-Breakpoint】${r.seats[i].name} 受到10點固定傷害，本回合及下回合受傷增加50%，9層觸發後清零`)}
  }
  r.sLog=[...(r.sLog||[]),...log];syncWardenState(r);
  if(ticks.length){const next=resolveBattle(r,{},null,{},null,{wardenEvidenceTick:ticks}),result=next.instantResult;delete next.instantResult;next.sLog=[...(next.sLog||[]),...result.log];next.instantFx={id:(r.instantFx?.id||0)+1,seat:1,chars:[...r.chars],...result};r=next}
  return r;
}
function rewriteWardenHand(r,i,number){
  const convert=c=>'SCHD'.includes(c?.[0])?c[0]+number:c;
  r.hands[i]=r.hands[i].map(convert);r.up[i]=r.up[i].map(convert);
  hostSunCards[i]=(hostSunCards[i]||[]).map(c=>({...c,card:convert(c.card)}));
  hostSunCards[i].forEach(c=>{if(test||r.seats[i].id===uid)privateSunCards=privateSunCards.map(p=>p.id===c.id?{...c}:p);else sendPrivateTo(r.seats[i].id,{sunCardUpdate:{...c}})});
  if(r.env?.publicSun?.[i])r.env.publicSun[i]=r.env.publicSun[i].map(c=>({...c,card:convert(c.card)}));
  if(r.teaflower){(r.teaflower.cards[i]||[]).forEach(c=>c.card=convert(c.card));teaBlooms(r,i).forEach(c=>c.card=convert(c.card))}
  if(r.chars[i]==='firefu'&&r.st[i].firefuThirst)r.st[i].firefuCard=convert(r.st[i].firefuCard);
  (r.wardenConsoleCards?.cards[i]||[]).forEach(c=>c.card=convert(c.card));
  return r;
}
function hitWardenCandle(r,id,v,source,damage,combat,log,kind='spade'){
  const c=wardenCandle(r)(id);v=damageAmount(v);if(!c||!v)return 0;const before=c.hp;c.hp=Math.max(0,before-v);const dealt=before-c.hp,index=damage.length,member='candle-'+c.id;
  damage.push({seat:1,member,amount:dealt,shield:false,candle:c.id});combat.push({seat:1,member,source,sourceMember:r.act?.[source]??-1,amount:dealt,shield:false,kind:'strike',attackKind:kind,power:Math.min(1,dealt/c.max),damageIndex:index,candle:c.id});
  log.push(`${r.seats[source].name} 攻擊刑罰之燭台，造成${dealt}點傷害（剩${c.hp}）`);
  if(c.hp<=0){c.dead=true;r.st[1].wardenCandleLossPending=(r.st[1].wardenCandleLossPending||0)+1;log.push('刑罰之燭台被擊殺，下回合施加2層虛弱與易損（3回合）');if(!wardenCandleAlive(r).length)r.wardenCandleNext=r.round+4}return dealt;
}
function wardenCandleTargetValid(r,i,card,id){return id===undefined||id===null||wardenGod(r)&&[0,2].includes(i)&&'SC'.includes(card?.[0])&&!!wardenCandle(r)(id)}
function dragWardenCandleCard(e,card,visible,sunId=null){const i=rd();if(!wardenGod(room)||!['S','C'].includes(card[0])||i===1||room.phase!=='play'||wardenPaused()||moves[room.round+'_'+i]||!drunkCanSee(room,i,i,visible)){e.preventDefault();return}e.dataTransfer.setData('application/x-d25-candle',JSON.stringify({card,visible,sunId,seat:i,round:room.round}));e.dataTransfer.effectAllowed='copy'}
function wardenCardDragAttrs(card,visible,owner,sunId=null){if(!room?.cfg.warden||owner===1)return'';const sun=sunId?`, '${sunId}'`:'';if(card[0]==='H')return `draggable="true" ondragstart="dragWardenHeart(event,'${card}',${!!visible}${sun})"`;if(wardenGod(room)&&'SC'.includes(card[0])&&wardenCandleAlive(room).length)return `draggable="true" ondragstart="dragWardenCandleCard(event,'${card}',${!!visible}${sun})"`;return''}
function dropWardenCandle(e,id){e.preventDefault();e.stopPropagation?.();let a;try{a=JSON.parse(e.dataTransfer.getData('application/x-d25-candle'))}catch(err){return}const i=rd();if(!a||a.seat!==i||a.round!==room.round||wardenPaused()||battleObservationActive()||moves[room.round+'_'+i]||!wardenCandleTargetValid(room,i,a.card,id))return;const pool=a.visible?room.up[i]:subtractCards(room.hands[i],room.up[i]),sun=a.sunId&&privateSunCards.find(c=>c.id===a.sunId&&c.card===a.card);if((a.sunId?!sun:!pool.includes(a.card))||!drunkCanSee(room,i,i,a.visible))return;sel=a.card;selUp=a.visible;sunCardSel=a.sunId||null;wardenHeartTarget=null;wardenCandleTarget=id;render()}
function wardenCandleTargetUI(i){if(!wardenGod(room)||i===1||!sel||!'SC'.includes(sel[0])||!wardenCandle(room)(wardenCandleTarget))return'';return `<div class="warden-candle-target">黑牌指向：刑罰之燭台 <button onclick="wardenCandleTarget=null;render()">改回看守</button><small>梅花對燭台不減傷；看守仍會攻擊你。按出牌才提交。</small></div>`}
function wardenCandlesUI(){if(!wardenGod(room)||!room.wardenCandles?.length)return'';return `<div class="warden-candles" aria-label="刑罰之燭台">${room.wardenCandles.map(c=>`<div class="warden-candle ${c.dead?'dead':''} ${wardenCandleTarget===c.id?'targeted':''}" data-warden-candle="${c.id}" data-damage-target="1:candle-${c.id}" ondragover="event.preventDefault()" ondrop="dropWardenCandle(event,'${c.id}')"><img src="${WARDEN_PASSIVE_ART.candle}" alt="刑罰之燭台"><b>${c.dead?'已擊殺':c.hp+' / '+c.max}</b><div class="bar"><i style="width:${Math.max(0,c.hp/c.max*100)}%"></i></div></div>`).join('')}</div>`}
function wardenChallengerPassiveTxt(r=room){
  const later=wardenStage(r)>=2,tool=wardenFinalPriest(r)?'維護工具':'告解證據';
  return[
    '你與另一名挑戰者並肩作戰，共同對抗看守。此戰適用以下專屬規則：',
    '• 協力視野：可看見隊友的暗牌與已提交的牌；醉酒等視野限制仍生效。',
    '• 同色連攜：兩名挑戰者打出的原始牌花色相同時，各獲得點數＋3，適用於攻擊、反擊及治療。',
    '• 紅心支援：可將紅心牌拖至隊友角色，改為治療隊友；仍與看守對你打出的牌交鋒。',
    `• ${later?'救援與淨化':'救援'}：隊友全隊倒下時，可花一回合復活其中一名角色至5血，不超過其生命上限。${later?`${wardenFinalPriest(r)?'':'第二階段起，'}可花一回合替另一名上場隊友減少3層${tool}；9層${wardenFinalPriest(r)?'維護工具':'證據'}無法減少。兩種動作皆`:'此動作'}不消耗手牌，看守仍會攻擊你。`,
    '• 自由換人：換人次數不限，每回合最多一次，於回合結束時換上存活角色。',
    '• 換牌補給：獲得兩次免費換牌機會。',
    `• 最後的機會：首次兩隊全滅時，兩人皆同意即可接關一次。全隊恢復至目前生命上限，清除${wardenFinalPriest(r)?'維護工具':'告解證據'}及其已觸發效果，其餘狀態保留。`,
    `• 特殊戰場：停用所有環境事件及25絕技。目前你的理智最低為${later?'－45':'－30'}；對看守的斬殺改為造成設定生命值×1.2的固定傷害。`
  ].join('\n');
}
function wardenFinalStatusTxt(i,tip,icon){
  const s=room.st[i],parts=[],red=(label,detail,art='⚠')=>parts.push(tip(art,label,detail,'warden-passive-red'));
  if(i===1){
    parts.push(tip('✦','媽的，你們怎麼找到這個故障的','理智最低45；每回合對不同挑戰者隨機施加急遽搏動與完整停止。保存20使兩張牌各＋3；40使所有存活敵人含後備維護工具＋1；60下回合手牌雜訊後統一數字；90下回合發動shift+delete。'));
    parts.push(tip(icon('Console'),'西西弗系維護工具','三種工具共用9層、最後種類覆蓋。黑牌施加Exception，紅牌施加Breakpoint；失敗1、成功2、原牌6以上3、10以上4層。低於半血及西西弗牧師3層以上各使施加量＋1。40保存固定＋1。Console每回合隨機標記1～3張牌，點選施加3層及加成。每層工具使該角色受傷＋5%；後備回合末−1、紅心成功−2、淨化−3，9層觸發前不能減少。'));
    parts.push(tip(icon(s.wardenPower>0?'power':'voice'),s.wardenPower>0?`漆黑之神的權能 ${s.wardenPower}/100`:`漆黑之神的聲音 ${s.wardenVoice||0}/100`,'消耗保存等量累積聲音；100於回合初轉成100權能，增加1層西西弗刑的牧師並預告強制退場。權能每20層提供1強壯，回合末−10，受傷含扣盾×2扣層，耗盡回到聲音0。'));
    if(s.wardenFinalSisyphus)parts.push(tip(icon('sisyphus'),`西西弗刑的牧師 ${s.wardenFinalSisyphus}`,'每層提供1強壯及1守護；3層以上所有維護工具施加量＋1。'));
    parts.push(tip(icon('system'),'好，該下班了','回合結束自動消耗最多10保存，下回合獲得等量保存西西弗系統，照常累積完美保存與聲音。'));
    if(s.wardenSystemPending?.n)parts.push(tip(icon('system'),`保存西西弗系統・預備 ${s.wardenSystemPending.n}`,'下回合獲得對應層數的保存西西弗系統。'));
    parts.push(tip(icon('save'),`保存獲取 ×${wardenSaveMultiplier(room)}`,'依目前生命比例：75%以下×1.25、50%以下×1.5、25%以下×2。回血超過門檻時降低倍率；各張原牌向下取整後相加。'));
    if(s.wardenSystem)parts.push(tip(icon('system'),`保存西西弗系統 ${s.wardenSystem}`,`本回合強壯與易損各＋${s.wardenSystem/2}，回合結束消失。`));
    if(s.wardenForcedExitPending)red('預告-強制退場',`下回合將發動特殊攻擊-強制退場，此次執行數字為${s.wardenForcedExitPending.number}正負1。`);
    if(s.wardenForcedExit)red(`強制退場・${s.wardenForcedExit}±1`,'兩隊原牌總和落在範圍內，各獲得基礎生命×2.5護盾；無論達成與否各受到1點×基礎生命×2次固定傷害。全員本回合不可換牌。');
    if(s.wardenShiftDelete||s.wardenShiftDeletePending)red(s.wardenShiftDelete?'shift+delete':'shift+delete・下回合','兩隊原牌總和須為2或26；未達成各受到1點×基礎生命×2次固定傷害；達成則牧師下回合受傷＋100%。與強制退場撞期時順延。','⌫');
    if(s.wardenShiftVulnRound===room.round)red('shift+delete・故障','本回合受到傷害增加100%。');
  }else{
    if(s.wardenRapidPulse)parts.push(tip(icon('pulse'),'急遽搏動','本回合攻擊造成傷害＋10。','warden-passive-gold'));
    if(s.wardenCompleteStop)parts.push(tip(icon('stop'),'完整停止','本回合受到傷害減少80%。','warden-passive-gold'));
    const e=wardenMaintenance(s);if(e.n)red(`${WARDEN_MAINTENANCE[e.kind]} ${e.n}/9`,`${e.n}層使受傷增加${e.n*5}%。${WARDEN_MAINTENANCE_DESC[e.kind]}`,icon(e.kind));
    if(s.wardenException)red('釘-Exception・故障','本回合所有牌0點無花色，受到傷害翻倍。',icon('Exception'));
    if(s.wardenBreakpointVuln)red(`釘-Breakpoint・易傷 ${s.wardenBreakpointVuln}回合`,'受到傷害增加50%。',icon('Breakpoint'));
    if(s.wardenTipherethDisabled)red(`Tiphereth的期待・失效 ${s.wardenTipherethDisabled}回合`,'基礎15點與期待光暈暫時失效；既有護盾與Gebura之刃資格保留。',icon('Console'));
  }return parts.join('　');
}
function wardenStatusTxt(i){
  if(!room.cfg.warden)return'';const s=room.st[i],parts=[],icon=k=>`<img class="warden-passive-icon" src="${WARDEN_PASSIVE_ART[k]||WARDEN_BOON_ART[k]}" alt="">`,tip=(art,label,detail,color='')=>`<span class="${color}" title="${esc(detail)}">${art}${label}</span>`;
  if([0,2].includes(i))parts.push(tip('✦','挑戰者-看守戰',wardenChallengerPassiveTxt(room),'warden-passive-orange'));
  if(wardenFinalPriest(room))parts.push(wardenFinalStatusTxt(i,tip,icon));
  if([0,2].includes(i)&&wardenTipherethActive(s))parts.push(tip(icon('tiphereth'),'Tiphereth的期待','所有卡牌的基礎出牌點數改為15；傘神處於神怒時改為28。再套用原本加減及倍率。初次獲得時，玩家目前上場角色獲得25護盾，後備不獲得此護盾。','warden-passive-gold'));
  if([0,2].includes(i)&&s.wardenGebura)parts.push(tip(icon('gebura'),'Gebura之刃','本回合任何牌皆視為特殊攻擊，傷害翻倍，並回復實際造成傷害（含扣盾）的一半，向上取整。穿透敵人方塊造成一半傷害，方塊不可反擊；對方其他牌效果照常。持有時生命不會低於1。','warden-passive-gebura'));
  if(i===1)parts.push(tip('🛡','斬殺轉換',`所有階段受到斬殺時，改為承受基礎設定生命×1.2（${wardenSlayDamage(room)}點）固定傷害；護盾與大地之牆仍生效。`));
  if(wardenGod(room)){if(i===1){parts.push(tip('✦','神之代理人','理智不低於0。每回合隨機為一名挑戰者施加搏動或停止；可消耗10／20／30層保存，使兩張牌各+1／2／3點。'));if(s.wardenUnstable>0)parts.push(tip(icon('unstable'),`不穩定展現 ${s.wardenUnstable}`,'回合開始獲得層數×2的易損及虛弱（1回合），回合結束減1層，耗盡消失。'));parts.push(tip('🕯','神聖刑罰燭台','不穩定展現耗盡後，回合開始生成兩隻燭台；全滅後空過3回合，第4回合重新生成。每隻存活燭台每回合提供2強壯、1守護。'));if(s.wardenPrep)parts.push(tip('⚠','懲罰預備','如果回合結束時場上有刑罰之燭台存活，則下回合轉換為懲罰，否則該被動消失。','warden-passive-red'));if(s.wardenPunish)parts.push(tip('✝','懲罰','本回合出牌視為特殊攻擊，固定造成15點傷害，使敵方出牌無效，且不可被方塊阻擋；護盾及毅力仍生效。','warden-passive-red'))}if(s.wardenPulse)parts.push(tip(icon('pulse'),'搏動','本回合黑牌傷害+5，回合結束消失。','warden-passive-gold'));if(s.wardenStop)parts.push(tip(icon('stop'),'停止','本回合受到傷害減半，回合結束消失。','warden-passive-gold'))}
  if(wardenPriest(room)){
    if(i===1){parts.push(tip('✦','審判之日','理智不低於30。每回合隨機將搏動與停止施加給不同挑戰者；10／20／30層保存使兩張牌各+1／2／3，50層停止下兩回合施加搏動與停止，60層使下回合所有存活敵人（含後備）告解證據+3，已有證據保留種類，沒有則隨機施加一種。保存消耗照常轉換完美保存，並等量轉換漆黑之神的聲音。'));
      parts.push(tip(icon('evidence'),`告解工具・增傷${wardenEvidenceTotal(room)}%`,'出牌失敗施加1層告解證據，成功2層，成功且原牌點數10以上3層。黑桃定罪、梅花審判、方塊刑罰、紅心贖罪；只保留最後種類，層數累加。每層存活挑戰者及後備的證據使傷害+1%，向下取整；死刑執行不受影響。'));
      if(s.wardenPower>0)parts.push(tip(icon('power'),`漆黑之神的權能 ${s.wardenPower}/100`,'轉換時獲得1層西西弗刑的看守及預告-死刑執行；每回合開始每20層獲得1強壯，結束減10層，每點實際受傷或扣盾再減2層。期間不獲得聲音；耗盡轉回聲音0層。'));
      else parts.push(tip(icon('voice'),`漆黑之神的聲音 ${s.wardenVoice||0}/100`,'第二階段消耗保存等量累積，上限100；達100後於下回合開始轉為100層漆黑之神的權能。'));
      if(s.wardenSisyphus)parts.push(tip(icon('sisyphus'),`西西弗刑的看守 ${s.wardenSisyphus}`,'每層獲得等量守護；每次聲音轉為權能增加1層。'));
      if(s.wardenExecutionPending)parts.push(tip('⚠','預告-死刑執行',`下回合將發動特殊攻擊-死刑執行，此次執行範圍為${s.wardenExecutionPending.number}正負2`,'warden-passive-red'));
      if(s.wardenExecution)parts.push(tip('✝',`死刑執行・${s.wardenExecution}±2`,`本回合所有牌視為特殊攻擊，使敵方出牌無效。兩名挑戰者原牌點數合計位於${s.wardenExecution}正負2內時，各獲得基礎生命×1.2護盾；隨後各受到1點×設定基礎血量次固定傷害，可被護盾阻擋，不受增減傷影響。`,'warden-passive-red'));
      if(room.round<=(s.wardenCalmUntil||0))parts.push(tip('◷',`暫停施加・剩${s.wardenCalmUntil-room.round+1}回合`,'本回合不施加搏動與停止。'));
    }else{if(s.wardenPulse)parts.push(tip(icon('pulse'),'搏動','本回合黑牌傷害+5，回合結束消失。','warden-passive-gold'));if(s.wardenStop)parts.push(tip(icon('stop'),'停止','本回合受到傷害減半，回合結束消失。','warden-passive-gold'))}
  }
  const evidence=wardenEvidence(s);if(i!==1&&evidence.n)parts.push(tip(icon('evidence'+evidence.kind),`告解的證據・${WARDEN_EVIDENCE[evidence.kind]} ${evidence.n}/9`,`${WARDEN_EVIDENCE_DESC[evidence.kind]}後備每回合結束減1層；上場紅心成功減2層。9層鎖定，任何減層均無效，必須上場觸發後才歸零。`,'warden-passive-red'));
  if(s.wardenCondemned)parts.push(tip('⚠','定罪・禁方塊／受傷雙倍','9層定罪已觸發並清零；本回合禁出方塊、受到傷害雙倍。','warden-passive-red'));
  if(i===1&&s.wardenSave!==undefined){parts.push(tip(icon('save'),`保存 ${s.wardenSave}/100`,'每張打出的牌按原始點數獲得保存，上限100；可消耗保存發動技能。'));parts.push(tip(icon('save'),`完美保存 ${s.wardenPerfect||0}/10`,`累計每消耗30層保存獲得1層，上限10。每回合依層數重新獲得強壯${Math.ceil((s.wardenPerfect||0)/2)}、守護${Math.floor((s.wardenPerfect||0)/2)}（1回合）。距離下一層尚需${30-(s.wardenSpent||0)}層消耗。`))}return parts.join('　');
}
const wardenVisualStage=(r=room)=>r?.wardenJudgment&&!['rise','done'].includes(r.wardenJudgment.phase)?2:wardenStage(r);
const wardenJudgmentArmed=(r=room)=>!!(r?.cfg.warden&&r.status==='playing'&&r.wardenJudgment?.phase==='armed');
const wardenJudgmentPending=(r=room)=>!!(r?.cfg.warden&&r.status==='wardenJudgment');
const wardenShiftPending=(r=room)=>!!(r?.cfg.warden&&r.status==='wardenShift');
const wardenContinuePending=(r=room)=>!!(r?.cfg.warden&&r.status==='wardenContinue'&&r.wardenContinue);
const wardenRewritePending=(r=room)=>!!(wardenFinalPriest(r)&&r.wardenRewrite&&r.status==='playing');
const wardenPaused=(r=room)=>wardenIntroPending(r)||wardenShiftPending(r)||wardenJudgmentPending(r)||wardenContinuePending(r)||wardenRewritePending(r)||wardenEndingPending(r);
let wardenRewriteTimer=null;
function syncWardenRewrite(){
  document.body?.classList.toggle('warden-rewriting',wardenRewritePending());
  if(!wardenRewritePending()){clearTimeout(wardenRewriteTimer);wardenRewriteTimer=null;return}
  document.body.style.setProperty('--warden-rewrite-age',`${-Math.max(0,d25Now()-room.wardenRewrite.startedAt)}ms`);
  if((test||isHost)&&wardenRewriteTimer===null)wardenRewriteTimer=setTimeout(()=>{wardenRewriteTimer=null;tick()},Math.max(1,room.wardenRewrite.endsAt-Date.now()));
}
function finishWardenRewrite(r,now=Date.now()){
  if(!wardenRewritePending(r)||now<r.wardenRewrite.endsAt)return r;
  for(const [seat,number] of Object.entries(r.wardenRewrite.numbers))rewriteWardenHand(r,+seat,number);
  delete r.wardenRewrite;if(r.cfg.time)r.deadline=now+r.cfg.time*1000;return syncWardenState(r);
}
const wardenImagePreloads=new Map();
function preloadWardenStage(stage){if(stage===3)for(const key of Object.keys(WARDEN_FINAL_VOICE_MS))preloadWardenCue(WARDEN_SOUND[key]);const Img=window.Image;if(!Img)return;const s=WARDEN_STAGES[stage];for(const src of [...(stage===1?[...Object.values(WARDEN_PASSIVE_ART),...WARDEN_CONTINUE.images]:[]),...(stage===2?[WARDEN_FINAL.dead,...Object.values(WARDEN_BOON_ART)]:[]),s.bg,charArtSrc(stage===1?'warden':'warden2'),WARDEN_NAIL.src,...(stage===3?[WARDEN_FINAL.lux,WARDEN_FINAL.frame,WARDEN_JUDGMENT.cross]:[])]){if(wardenImagePreloads.has(src))continue;const img=new Img();img.decoding='async';img.src=src;wardenImagePreloads.set(src,img)}}
const wardenCanContinue=r=>!!(r?.cfg.warden&&r.chars?.[1]==='warden'&&wardenStage(r)<3);
const wardenSeatAlive=(r,i)=>i===1&&wardenEndingPending(r)&&!wardenEndingCorpse(r)||r.hp[i]>0||i===1&&wardenCanContinue(r)&&!!r.st[1].wardenBroken;
function offerWardenContinue(r){
  if(!r.cfg.warden||r.status!=='over'||r.winner!==1||r.wardenContinueUsed||!r.team||[0,2].some(i=>r.hp[i]>0||r.team[i].some((m,k)=>k!==r.act[i]&&!m.dead&&m.hp>0)))return r;
  const now=Date.now();r.wardenContinueUsed=true;r.wardenContinue={id:`${r.roundBase}_${r.round}_${now}`,phase:'choice',startedAt:now};r.status='wardenContinue';r.winner=null;r.deadline=0;r.timeClocks={};return r;
}
const wardenContinueMoveKey=(r,i)=>`wardenContinue_${r.wardenContinue.id}_${i}`;
function wardenContinueVoteValid(r,i,m,now=Date.now()){return !!(wardenContinuePending(r)&&r.wardenContinue.phase==='choice'&&[0,2].includes(i)&&now>=r.wardenContinue.startedAt+WARDEN_CONTINUE.crackMs&&m?.id===r.wardenContinue.id&&typeof m.yes==='boolean'&&Object.keys(m).every(k=>['id','yes'].includes(k)))}
function wardenContinueMoveAllowed(path,m,owner){if(!wardenContinuePending())return false;const i=[0,2].find(i=>path===`rooms/${code}/moves/${wardenContinueMoveKey(room,i)}`);return i!==undefined&&wardenContinueVoteValid(room,i,m)&&!moves[wardenContinueMoveKey(room,i)]&&(test&&owner===undefined||room.seats[i].id===(owner??uid))}
function voteWardenContinue(yes){if(!wardenContinuePending())return;const i=rd(),m={id:room.wardenContinue.id,yes};if(!wardenContinueVoteValid(room,i,m,d25Now())||moves[wardenContinueMoveKey(room,i)])return;db.doc(`rooms/${code}/moves/${wardenContinueMoveKey(room,i)}`).set(m)}
function restoreWardenContinue(r){
  for(const i of [0,2]){r.team[i][r.act[i]].st=JSON.parse(JSON.stringify(r.st[i]));r.team[i].forEach(m=>{m.st.wardenEvidence={kind:null,n:0};clearWardenRevivalEffects(r,m.st);m.dead=false;m.hp=characterMaxHp(r,i,m.c,m.st)});const m=r.team[i][r.act[i]];r.chars[i]=m.c;r.hp[i]=m.hp;r.st[i]=JSON.parse(JSON.stringify(m.st))}
  delete r.wardenContinue;r.status='playing';r.winner=null;r.last?.log.push(`【接關復活】全體挑戰者恢復至各角色生命上限，清除${wardenFinalPriest(r)?'維護工具':'告解證據'}及其已觸發效果，其他狀態保留`);
  if(r.hp[1]<=0&&wardenCanContinue(r))return finishWardenStage(r);
  if(r.wardenRoundStarted===r.round){r.pair=wardenParticipants(r);r.spin=null;r.pend=r.seats.map((_,i)=>i).filter(i=>r.hp[i]>0&&r.oc[i]>r.up[i].length&&subtractCards(r.hands[i],r.up[i]).length>r.oc[i]-r.up[i].length);r.phase=r.pend.length?'reveal':'play';r.deadline=r.cfg.time?Date.now()+r.cfg.time*1000:0;return r}
  return resumeWardenRound(r);
}
function advanceWardenContinue(r,now=Date.now()){
  const C=r.wardenContinue;if(!wardenContinuePending(r))return r;
  if(C.phase==='revive')return now>=C.endsAt?restoreWardenContinue(r):r;
  const votes=[0,2].map(i=>moves[wardenContinueMoveKey(r,i)]).filter((m,k)=>wardenContinueVoteValid(r,[0,2][k],m,now));
  if(votes.some(m=>!m.yes)){delete r.wardenContinue;r.status='over';r.winner=1;r.last?.log.push('挑戰者選擇不接關，看守方獲勝');return r}
  if(votes.length===2&&now>=C.startedAt+WARDEN_CONTINUE.introMs)r.wardenContinue={...C,phase:'revive',startedAt:now,endsAt:now+WARDEN_CONTINUE.reviveMs};return r;
}
function markWardenBreak(r,hp=r.hp,st=r.st){if(!wardenCanContinue(r)||!st?.[1]||hp[1]>0&&!st[1].wardenBroken)return false;st[1].wardenBroken=1;hp[1]=0;return true}
function promoteWarden(r,to){const previous=wardenStage(r);if(to===2&&previous===1)clearWardenFirstStage(r);if(to===3&&previous===2)clearWardenSecondStage(r);if(to!==previous)r.st[1].mdec=0;r.st[1].wardenStage=to;grantWardenStageRedraws(r);r.st[1].wardenBroken=0;r.hp[1]=Math.ceil(characterMaxHp(r,1,'warden',r.st[1])*WARDEN_STAGES[to].fill);if(to===3)r.wardenFinalAt=r.wardenShift?.startedAt+WARDEN_FINAL_REVEAL_MS||Date.now();if(r.team){const m=r.team[1][r.act[1]];m.hp=r.hp[1];m.dead=false;m.st=JSON.parse(JSON.stringify(r.st[1]))}r.status='playing';r.winner=null;return syncWardenState(r)}
function resumeWardenRound(r){r.pair=wardenParticipants(r);r.spin=null;r.pend=r.seats.map((_,i)=>i).filter(i=>r.hp[i]>0&&r.oc[i]>r.up[i].length&&subtractCards(r.hands[i],r.up[i]).length>r.oc[i]-r.up[i].length);enforceWardenHands(r);return r.pend.length?{...r,phase:'reveal',deadline:r.cfg.time?Date.now()+r.cfg.time*1000:0}:advance(r)}
function finishWardenStage(r){if(!markWardenBreak(r)||r.hp[0]<=0&&r.hp[2]<=0)return r;const from=wardenStage(r),to=from+1;r.last?.log.push(`${WARDEN_STAGES[from].n} 的第${from}階段生命歸零，進入第${to}階段`);const now=Date.now();return{...r,status:'wardenShift',winner:null,deadline:0,timeClocks:{},wardenShift:{id:`${r.roundBase}:${r.round}:${now}`,from,to,startedAt:now,endsAt:now+(from===2?WARDEN_FINAL_SHIFT_MS:WARDEN_SHIFT_MS)}}}
const canTestWardenBreak=()=>!!(test&&room?.cfg.warden&&room.status==='playing'&&room.chars?.[1]==='warden'&&room.hp[1]>0&&!wardenJudgmentArmed()&&['play','reveal'].includes(room.phase)&&!busy.startsWith('instant_')&&!isoPending()&&!valorantShopPending()&&!mirrorPending()&&!environmentTradePending());
function wardenTestUI(){if(!test||!room?.cfg.warden||room.status!=='playing')return'';return `<button type="button" class="warden-test-break" ${canTestWardenBreak()?'':'disabled'} onclick="testWardenBreak()">🧪 清空看守血條</button>`}
function testWardenBreak(){
  if(!canTestWardenBreak())return;const r=JSON.parse(JSON.stringify(room)),stage=wardenStage(r),log=[...(r.sLog||[]),`🧪 清空${WARDEN_STAGES[stage].n}第${stage}階段血條`],lock=`instant_${r.round}_wardenTest`;busy=lock;
  r.hp[1]=0;markWardenBreak(r);const keeper=r.team?.[1]?.[r.act[1]];if(keeper){keeper.hp=0;keeper.st=JSON.parse(JSON.stringify(r.st[1]))}
  r.sLog=log;if(stage===3)settleInstantBattle(r,log);const next=stage<3?finishWardenStage(r):r;
  hpAnim[1]={v:0,to:0,m:characterMaxHp(next,1,'warden',next.st[1]),c:'warden'};
  save(next).finally(()=>{if(busy===lock)busy=''});
}
// 最終連點由房主逐次接受；歸零後保持實際0血，最後100擊只用於收尾演出。
const WARDEN_ENDING={lead:50,mergeMs:600,travelMs:360,hits:100,hitMs:24,fadeMs:420,corpseMs:1400,attackMs:2944};
const wardenEndingPending=(r=room)=>!!(r?.cfg.warden&&r.status==='wardenEnding'&&r.wardenEnding);
const wardenEndingCorpse=(r=room)=>!!(r?.cfg.warden&&['corpse','done'].includes(r.wardenEnding?.phase));
const wardenEndingLead=r=>(r.wardenEnding.clicks[0]||0)+(r.wardenEnding.clicks[2]||0)-(r.wardenEnding.clicks[1]||0);
function startWardenEnding(r,now=Date.now()){
  if(!wardenFinalPriest(r)||r.hp[1]>0||r.wardenEnding||!['playing','over'].includes(r.status)||wardenJudgmentArmed(r))return r;
  r.wardenEnding={id:`${r.roundBase}:${r.round}:${now}`,phase:'click',startedAt:now,clicks:[0,0,0],seq:[0,0,0],active:[...r.act],hitsDone:0};
  r.status='wardenEnding';r.winner=null;r.deadline=0;r.timeClocks={};r.timeTargets=[];r.pend=[];r.hp[1]=0;
  const keeper=r.team?.[1]?.[r.act[1]];if(keeper){keeper.hp=0;keeper.dead=false}
  const log=r.last?.log||r.sLog||(r.sLog=[]);log.push('牧師生命歸零，三道光束交會；挑戰者合計連點領先50次即可合束！');return r;
}
function finishWardenEndingClicks(r,now=Date.now()){
  const E=r.wardenEnding;if(!wardenEndingPending(r)||E.phase!=='click'||wardenEndingLead(r)<WARDEN_ENDING.lead)return r;
  E.phase='finish';E.finishAt=now;E.hitAt=now+WARDEN_ENDING.mergeMs+WARDEN_ENDING.travelMs;E.lastHitAt=E.hitAt+(WARDEN_ENDING.hits-1)*WARDEN_ENDING.hitMs;
  E.corpseAt=E.lastHitAt+WARDEN_ENDING.fadeMs;E.wonAt=E.corpseAt+WARDEN_ENDING.corpseMs;E.soundEndAt=E.lastHitAt+WARDEN_ENDING.attackMs;E.cinematicHp=WARDEN_ENDING.hits;
  (r.last?.log||r.sLog||(r.sLog=[])).push('挑戰者連點領先50次，雙光束合一貫穿牧師，發動100次每擊1點的收尾連擊！');return r;
}
function nextWardenEndingAt(r){const E=r.wardenEnding;if(E.phase==='click')return Infinity;if(E.phase==='corpse')return E.wonAt;return E.hitsDone<WARDEN_ENDING.hits?E.hitAt+E.hitsDone*WARDEN_ENDING.hitMs:E.corpseAt}
function advanceWardenEnding(r,now=Date.now()){
  if(!wardenEndingPending(r)||r.wardenEnding.phase==='click')return r;const E=r.wardenEnding;
  E.hitsDone=Math.max(E.hitsDone,Math.min(WARDEN_ENDING.hits,Math.max(0,Math.floor((now-E.hitAt)/WARDEN_ENDING.hitMs)+1)));E.cinematicHp=WARDEN_ENDING.hits-E.hitsDone;
  if(now>=E.corpseAt){E.phase='corpse';const keeper=r.team?.[1]?.[E.active[1]];if(keeper){keeper.hp=0;keeper.dead=true}}
  if(now>=E.wonAt){E.phase='done';r.status='over';r.winner=0;(r.last?.log||r.sLog||(r.sLog=[])).push('🏆 挑戰者方獲勝！')}
  return r;
}
let wardenEndingTimer=null,wardenEndingTimerKey='',wardenEndingFx=null;
const wardenEndingLocalSeq={};
function clickWardenEnding(seat=rd()){
  if(!wardenEndingPending()||room.wardenEnding.phase!=='click'||![0,1,2].includes(seat)||(!test&&room.seats[seat]?.id!==uid))return;
  const E=room.wardenEnding,key=E.id+':'+seat,seq=Math.max(wardenEndingLocalSeq[key]||0,E.seq[seat]||0)+1;wardenEndingLocalSeq[key]=seq;
  const req={type:'wardenEndingClick',uid:test?room.seats[seat].id:uid,seat,roundBase:room.roundBase,id:E.id,seq};
  if(test||isHost)acceptWardenEndingClick(null,req);else if(hostConn)hostConn.send({privateRequest:req});
}
function acceptWardenEndingClick(cn,req){
  if(!(test||isHost)||!wardenEndingPending()||room.wardenEnding.phase!=='click'||!req||![0,1,2].includes(req.seat)||!Number.isSafeInteger(req.seq)||req.seq<1)return false;
  const E=room.wardenEnding,i=req.seat;if(req.id!==E.id||req.roundBase!==room.roundBase||req.uid!==room.seats[i].id||(test?!!cn:(cn?cn.uid:uid)!==req.uid)||req.seq<=(E.seq[i]||0))return false;
  const next=JSON.parse(JSON.stringify(room));next.wardenEnding.seq[i]=req.seq;next.wardenEnding.clicks[i]++;finishWardenEndingClicks(next);
  // 先更新房主記憶體，連續點擊與同步回呼皆以最新計數結算。
  room=next;save(next);return true;
}
function scheduleWardenEndingTick(r){
  const at=nextWardenEndingAt(r),id=r.wardenEnding.id,key=id+':'+at;if(wardenEndingTimer!==null&&wardenEndingTimerKey===key)return;
  clearTimeout(wardenEndingTimer);wardenEndingTimer=null;wardenEndingTimerKey=key;if(!Number.isFinite(at))return;
  wardenEndingTimer=setTimeout(()=>{wardenEndingTimer=null;if(wardenEndingPending()&&room.wardenEnding.id===id)tick()},Math.max(1,at-Date.now()));
}
function wardenEndingSwords(){return '<svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="wardenEndingSword" x2="1" y2="1"><stop stop-color="#fff"/><stop offset=".5" stop-color="#a9ecff"/><stop offset="1" stop-color="#4e9dff"/></linearGradient></defs><g fill="url(#wardenEndingSword)" stroke="#d7f5ff" stroke-width="2"><path d="M22 12L29 15L86 72L79 79L22 22Z"/><path d="M98 12L91 15L34 72L41 79L98 22Z"/></g><g fill="none" stroke="#ffe39f" stroke-width="7" stroke-linecap="round"><path d="M69 86L93 62M83 82L100 99M34 62L58 86M41 82L24 99"/></g></svg>'}
function wardenEndingUI(){
  const E=room.wardenEnding,i=rd(),mine=[0,1,2].includes(i),click=E.phase==='click';
  return `<div class="warden-ending-beams" aria-hidden="true"></div><i class="warden-ending-core" aria-hidden="true"></i><div class="warden-ending-control"><p class="warden-ending-call">${click?'連點!!!':'貫穿!!!'}</p><button type="button" class="warden-ending-swords" aria-label="連點雙劍" ${click&&mine?'':'disabled'} onpointerdown="if(event.button===0){event.preventDefault();clickWardenEnding()}" onclick="if(event.detail===0)clickWardenEnding()" oncontextmenu="event.preventDefault()">${wardenEndingSwords()}</button><div class="warden-ending-score"><span>挑戰者 <b data-ending-challengers>${E.clicks[0]+E.clicks[2]}</b></span><span>牧師 <b data-ending-priest>${E.clicks[1]}</b></span><small data-ending-lead>領先 ${wardenEndingLead(room)} / 50</small></div>${test?`<div class="warden-ending-test">${[0,1,2].map(k=>`<button onclick="testSeat=${k};render()">${esc(room.seats[k].name)}</button>`).join('')}</div>`:''}${mine?'':'<small>觀看最終交鋒</small>'}</div><button class="warden-ending-leave" onclick="leave()">離開房間</button>`;
}
function makeWardenEndingBeam(fx,seat,through=false){
  const beam=document.createElement('div');beam.className='warden-beam warden-ending-beam contact'+(seat!==1?' warden-ending-blue':' warden-ending-gold')+(through?' warden-ending-through':'');
  beam.setAttribute('data-ending-source',through?'merged':String(seat));beam.innerHTML=`<div class="warden-beam-wave">${wardenBeamArt()}</div>`;fx.beamLayer.appendChild(beam);return beam;
}
function wardenEndingPositions(){
  const rect=i=>judgmentRect(`[data-damage-target="${i}:${room.wardenEnding.active[i]}"]`,{x:i===1?.70:.06,y:i===0?.16:i===2?.46:.22,w:i===1?.24:.28,h:i===1?.40:.24}),points=[0,1,2].map(i=>{const r=rect(i);return{x:r.x+r.w*.5,y:r.y+r.h*.5}});
  const stage=judgmentRect('.warden-stage',{x:0,y:0,w:1,h:.75}),w=window.innerWidth||1280,h=window.innerHeight||720;
  return{points,center:{x:Math.min(w*.7,Math.max(w*.3,stage.x+stage.w*.51)),y:Math.min(h*.6,Math.max(h*.2,stage.y+stage.h*.49))}};
}
function positionWardenEndingBeam(beam,from,to,thickness){const dx=to.x-from.x,dy=to.y-from.y;beam.style.left=from.x+'px';beam.style.top=from.y+'px';beam.style.width=Math.max(1,Math.hypot(dx,dy))+'px';beam.style.height=thickness+'px';beam.style.setProperty('--beam-angle',Math.atan2(dy,dx)+'rad');beam.style.setProperty('--beam-pitch','160px');beam.style.setProperty('--beam-travel','360ms')}
function drawWardenEndingFx(fx){
  if(wardenEndingFx!==fx||room?.wardenEnding?.id!==fx.id)return;const E=room.wardenEnding,now=d25Now(),{points,center}=wardenEndingPositions(),quiet=!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(E.phase==='done'&&now>=E.soundEndAt){stopWardenEndingFx();return}
  fx.layer.style.setProperty('--ending-x',center.x+'px');fx.layer.style.setProperty('--ending-y',center.y+'px');fx.layer.setAttribute('data-ending-phase',E.phase);
  fx.beams.forEach((b,i)=>positionWardenEndingBeam(b,points[i],center,E.phase==='click'?58:76));
  if(fx.through){const dx=points[1].x-center.x,dy=points[1].y-center.y,len=Math.max(1,Math.hypot(dx,dy));positionWardenEndingBeam(fx.through,center,{x:points[1].x+dx/len*180,y:points[1].y+dy/len*180},118)}
  document.body?.setAttribute('data-warden-ending-quake',!quiet&&E.hitAt!=null&&now>=E.hitAt&&now<=E.lastHitAt+180?'on':'');
  if(!fx.visualClosed&&['corpse','done'].includes(E.phase)){fx.visualClosed=true;fx.layer.hidden=true;document.body?.setAttribute('data-warden-ending-quake','')}
  fx.raf=requestAnimationFrame(()=>drawWardenEndingFx(fx));
}
function queueWardenEndingFinisher(fx,E){
  if(E.finishAt==null||fx.finisherQueued)return;fx.finisherQueued=true;fx.through=makeWardenEndingBeam(fx,0,true);fx.through.style.setProperty('--ending-through-delay',(E.finishAt+WARDEN_ENDING.mergeMs-d25Now())+'ms');
  for(let hit=0;hit<WARDEN_ENDING.hits;hit++){
    const at=E.hitAt+hit*WARDEN_ENDING.hitMs;queueWardenCue(fx,WARDEN_SOUND.attack,at,WARDEN_ENDING.attackMs,hit===0?.55:.14);
    if(at<d25Now())continue;queueWardenFinalTimer(fx,()=>{if(room?.wardenEnding?.id!==E.id)return;fx.hitEvents++;damageFx.pending.push({seat:1,member:E.active[1],amount:1,cinematic:true});flushDamageFx();const wave=document.createElement('i');wave.className='warden-ending-impact';const r=wardenEndingPositions().points[1];wave.style.left=r.x+'px';wave.style.top=r.y+'px';fx.layer.appendChild(wave);queueWardenFinalTimer(fx,()=>wave.remove(),400)},at-d25Now());
  }
}
function updateWardenEndingControls(fx){
  const E=room.wardenEnding,lead=wardenEndingLead(room),click=E.phase==='click';
  for(const [selector,value] of [['[data-ending-challengers]',E.clicks[0]+E.clicks[2]],['[data-ending-priest]',E.clicks[1]],['[data-ending-lead]',`領先 ${lead} / 50`],['.warden-ending-call',click?'連點!!!':'貫穿!!!']]){const el=fx.layer.querySelector?.(selector);if(el)el.textContent=String(value)}
  const button=fx.layer.querySelector?.('.warden-ending-swords');if(button)button.disabled=!click||![0,1,2].includes(rd());
  for(let i=0;i<3;i++){const gained=Math.max(0,E.clicks[i]-fx.clicks[i]);for(let n=0;n<gained;n++)playWardenCue(fx,WARDEN_SOUND.attack,0,.3)}fx.clicks=[...E.clicks];queueWardenEndingFinisher(fx,E);
}
function stopWardenEndingFx(){
  clearTimeout(wardenEndingTimer);wardenEndingTimer=null;wardenEndingTimerKey='';if(wardenEndingFx){const fx=wardenEndingFx;wardenEndingFx=null;cancelAnimationFrame(fx.raf);stopWardenCues(fx);fx.layer.remove()}
  document.body?.classList.toggle('warden-ending',false);
  document.body?.setAttribute('data-warden-ending-quake','');
}
function syncWardenEndingFx(){
  if(!room?.cfg.warden||!room.wardenEnding){stopWardenEndingFx();return null}const E=room.wardenEnding;
  if(E.phase==='done'&&d25Now()>=E.soundEndAt){stopWardenEndingFx();return null}
  if(wardenEndingFx?.id!==E.id){stopWardenEndingFx();const layer=document.createElement('div');layer.id='wardenEndingLayer';layer.className='warden-ending-layer';layer.innerHTML=wardenEndingUI();document.body.appendChild(layer);const beamLayer=document.createElement('div');beamLayer.className='warden-ending-beams';layer.appendChild(beamLayer);const fx={id:E.id,layer,beamLayer,beams:[],clicks:[...E.clicks],soundTimers:new Set(),raf:null,hitEvents:0,arenaKey:''};wardenEndingFx=fx;fx.beams=[0,1,2].map(i=>makeWardenEndingBeam(fx,i));preloadWardenCue(WARDEN_SOUND.attack)}
  const fx=wardenEndingFx;document.body?.classList.toggle('warden-ending',wardenEndingPending());updateWardenEndingControls(fx);cancelAnimationFrame(fx.raf);drawWardenEndingFx(fx);if(wardenEndingPending()&&(test||isHost))scheduleWardenEndingTick(room);return fx;
}
function startWardenBattle(r,seat){const hostId=r.hostId||r.cfg.hostId||r.seats[0].id,others=r.seats.map((_,i)=>i).filter(i=>i!==seat),order=[others[0],seat,others[1]],picks=order.map(i=>i===seat?['warden']:[...r.draft.picks[i]]),now=Date.now();
  // 共用協力戰的0、2友軍／1敵軍契約，保留玩家ID與兩隊選角。
  return {status:'wardenIntro',cfg:{...r.cfg,hostId,n:3,v3:true,boss:true,warden:true,wardenEvents:r.cfg.events,events:false},seats:order.map(i=>({...r.seats[i]})),draft:{picks,order:[],step:0},hostId,round:r.round,roundBase:r.roundBase,wardenIntro:{id:`${r.roundBase}:${now}`,startedAt:now,endsAt:now+WARDEN_ENTRY_MS}};
}
function acceptWardenDraft(cn,req){if(!isHost||busy==='wardenDraft'||!req||req.value!=='4134'||req.roundBase!==room?.roundBase||req.step!==room?.draft?.step||!wardenDraftReady(room,req.seat))return false;
  if(test?!!cn:(room.seats[req.seat].id!==req.uid||(cn?cn.uid:uid)!==req.uid))return false;
  if(moves[`d${room.roundBase}_${room.draft.step}_${req.seat}`])return false;
  busy='wardenDraft';const next=startWardenBattle(room,req.seat);save(next).finally(()=>{if(busy==='wardenDraft')busy=''});return true;
}
const bossHealthFactor=(cfg,i)=>cfg.boss&&!cfg.warden&&i!==1?1.5:1;
const bossRole=(cfg,i)=>i===1?(cfg.warden?'看守':'Boss'):'挑戰者';
const bossSideName=(cfg,i)=>i===1?(cfg.warden?'看守方':'Boss方'):'挑戰者方';
const wardenTargets=r=>[0,2].filter(i=>r.hp[i]>0);
const wardenAllies=(r,i,j)=>!!r?.cfg.warden&&[0,2].includes(i)&&[0,2].includes(j);
const wardenFriend=i=>i===0?2:0;
function wardenHeartValid(r,i,card,target){return target===undefined||target===i||wardenAllies(r,i,target)&&card?.[0]==='H'&&r.hp[target]>0}
function wardenReviveChoices(r,i){const target=wardenFriend(i);if(!wardenAllies(r,i,target)||r.hp[target]>0||r.team[target].some(m=>!m.dead&&m.hp>0))return[];return r.team[target].flatMap((m,k)=>canDeploy(m.c)&&(m.dead||m.hp<=0)?[k]:[])}
function wardenReviveValid(r,i,m){return !!(r?.cfg.warden&&r.status==='playing'&&r.phase==='play'&&!wardenPaused(r)&&!wardenJudgmentArmed(r)&&r.pair.includes(i)&&r.hp[i]>0&&!(r.st[i].stun>0)&&!kiraCardLocked(r,i)&&m?.round===r.round&&m.revive?.target===wardenFriend(i)&&wardenReviveChoices(r,i).includes(m.revive.member)&&!m.card&&!m.hidden&&!m.cards&&!m.redraw&&!m.rep&&!m.skill&&!m.art&&!m.lei)}
const wardenParticipants=r=>[...wardenTargets(r).slice(0,1),...(wardenSeatAlive(r,1)?[1]:[]),...wardenTargets(r).slice(1)];
const battleOpponent=(r,i)=>r.cfg.warden?(i===1?wardenTargets(r)[wardenLane]??wardenTargets(r)[0]:1):r.pair.find(j=>j!==i);
function enforceWardenHands(r){if(!r.cfg.warden||!r.hands?.[1]||!wardenSeatAlive(r,1))return r;while(r.hands[1].length<2){if(!r.deck.length)r.deck=newDeck(Object.values(r.hands).flat());r.hands[1]=[...r.hands[1],r.deck.shift()]}return r}
let wardenSelections=[],wardenLane=0,wardenHeartTarget=null;
function playWardenRevive(member){const i=rd(),m={round:room.round,revive:{target:wardenFriend(i),member}};if(moves[room.round+'_'+i]||battleObservationActive()||!wardenReviveValid(room,i,m)||!timeActionOpen(room,i))return;db.doc(`rooms/${code}/moves/${room.round}_${i}`).set(m);sel=null;sunCardSel=null;wardenHeartTarget=null;skOn=false;artPick='';leiPick=0}
function wardenReviveUI(i){if(wardenJudgmentArmed())return'';return wardenReviveChoices(room,i).map(k=>`<button class="warden-revive" onclick="playWardenRevive(${k})">花一回合復活 ${esc(room.seats[wardenFriend(i)].name)} 的${esc(CHARS[room.team[wardenFriend(i)][k].c].n)}（5血）</button>`).join('')}
function wardenPurifyValid(r,i,m){return !!(r?.cfg.warden&&wardenStage(r)>=2&&r.status==='playing'&&r.phase==='play'&&!wardenPaused(r)&&!wardenJudgmentArmed(r)&&[0,2].includes(i)&&r.pair.includes(i)&&r.hp[i]>0&&r.hp[wardenFriend(i)]>0&&!(r.st[i].stun>0)&&!kiraCardLocked(r,i)&&m?.round===r.round&&m.purify?.target===wardenFriend(i)&&Object.keys(m).every(k=>['round','purify'].includes(k))&&Object.keys(m.purify).every(k=>k==='target'))}
function playWardenPurify(){const i=rd(),m={round:room.round,purify:{target:wardenFriend(i)}};if(moves[room.round+'_'+i]||battleObservationActive()||!wardenPurifyValid(room,i,m)||!timeActionOpen(room,i))return;db.doc(`rooms/${code}/moves/${room.round}_${i}`).set(m);sel=null;sunCardSel=null;wardenHeartTarget=null;wardenCandleTarget=null;skOn=false;artPick='';leiPick=0}
function wardenPurifyUI(i){if(!wardenPurifyValid(room,i,{round:room.round,purify:{target:wardenFriend(i)}}))return'';return `<button class="warden-purify" onclick="playWardenPurify()" title="視為出一張0點無花色牌，不消耗手牌；9層${wardenFinalPriest(room)?'維護工具':'證據'}不能減少。">淨化 ${esc(room.seats[wardenFriend(i)].name)}（${wardenFinalPriest(room)?'維護工具':'證據'}−3）</button>`}
function dragWardenHeart(e,card,visible,sunId=null){const i=rd();if(!room?.cfg.warden||i===1||room.phase!=='play'||wardenPaused()||moves[room.round+'_'+i]||card[0]!=='H'||!drunkCanSee(room,i,i,visible)){e.preventDefault();return}e.dataTransfer.setData('application/x-d25-heart',JSON.stringify({card,visible,sunId,seat:i,round:room.round}));e.dataTransfer.effectAllowed='copy'}
function dropWardenAction(e,target){const data=e.dataTransfer.getData('application/x-d25-heart');if(!data){dropSw(e,target);return}e.preventDefault();let a;try{a=JSON.parse(data)}catch(err){return}const i=rd();if(a.seat!==i||a.round!==room.round||target===i||!wardenHeartValid(room,i,a.card,target)||wardenPaused()||battleObservationActive()||moves[room.round+'_'+i])return;const sun=a.sunId&&privateSunCards.find(c=>c.id===a.sunId&&c.card===a.card),pool=a.visible?room.up[i]:subtractCards(room.hands[i],room.up[i]);if(a.sunId?!sun:!pool.includes(a.card))return;if(!drunkCanSee(room,i,i,a.visible))return;sel=a.card;selUp=a.visible;sunCardSel=a.sunId||null;wardenHeartTarget=target;wardenCandleTarget=null;render()}
function wardenHeartUI(i){if(!room.cfg.warden||i===1||sel?.[0]!=='H'||!drunkCanSee(room,i,i,!!selUp))return'';const target=wardenHeartTarget??i;return `<div class="warden-heart-target">紅心指向：${esc(room.seats[target].name)}${target===i?'（自己）':`（隊友） <button onclick="wardenHeartTarget=null;render()">改回自己</button>`}<small>可將紅心拖到隊友角色上，選好後按出牌。</small></div>`}
function setWardenLane(lane){if(wardenPaused()||!room?.cfg.warden||rd()!==1)return;wardenLane=lane;sel=wardenSelections[lane]?.card||null;selUp=wardenSelections[lane]?.visible??null;render()}
function setWardenCard(card,visible){
  if(wardenPaused())return;
  const entry={card,visible,target:wardenTargets(room)[wardenLane]},next=[...wardenSelections];next[wardenLane]=entry;
  const chosen=next.filter(Boolean),shown=chosen.filter(x=>x.visible===true).map(x=>x.card),hidden=chosen.filter(x=>x.visible===false).map(x=>x.card);
  if(!containsCards(room.hands[1],chosen.map(x=>x.card))||!containsCards(room.up[1],shown)||!containsCards(subtractCards(room.hands[1],room.up[1]),hidden))return;
  wardenSelections=next;sel=card;selUp=visible;sunCardSel=null;render();
}
function playWardenCards(){
  if(!room?.cfg.warden||room.status!=='playing'||room.phase!=='play'||battleObservationActive()||rd()!==1||moves[room.round+'_1'])return;
  const targets=wardenTargets(room),cards=targets.map((target,k)=>({...wardenSelections[k],target})),saveSpend=wardenSpendValid(room,wardenSaveSpend)?wardenSaveSpend:0;
  if(cards.some(x=>!x.card)||!containsCards(room.hands[1],cards.map(x=>x.card))||cards.some(x=>!wardenJudgmentArmed()&&diamondBanned(room,1)&&x.card[0]==='D'))return;
  db.doc(`rooms/${code}/moves/${room.round}_1`).set({card:cards[0].card,cards,saveSpend});wardenSaveSpend=0;wardenSelections=[];wardenLane=0;sel=null;selUp=null;
}
function collectWardenMoves(r,late){
  if(wardenJudgmentArmed(r))return collectWardenJudgmentMoves(r,late);
  const mv={},sk={},extra={sunUsed:{},visibility:{},redraws:{},wardenHeartTargets:{},wardenRevives:{},wardenPurifies:{},wardenCandleTargets:{}};
  for(const i of r.pair){
    if(kiraCardLocked(r,i)||r.st[i].stun>0)continue;
    const m=moves[r.round+'_'+i];
    if(!m){if(!late)return null;const hand=diamondBanned(r,i)?r.hands[i].filter(c=>c[0]!=='D'):r.hands[i];
      if(i===1){const pool=[...(hand.length?hand:r.hands[i])];mv[i]=wardenTargets(r).map(target=>({target,card:pool.splice(Math.floor(Math.random()*pool.length),1)[0]}));if(mv[i].some(x=>!x.card))return null}
      else mv[i]=rnd(hand.length?hand:r.hands[i]);continue;
    }
    if(m.purify){if(!wardenPurifyValid(r,i,m))return null;extra.wardenPurifies[i]={...m.purify};mv[i]=null;continue}
    if(m.revive){if(!wardenReviveValid(r,i,m))return null;extra.wardenRevives[i]={...m.revive};mv[i]=null;continue}
    if(m.redraw){if(wardenForcedExit(r))return null;extra.redraws[i]=true;continue}
    if(m.rep&&i!==1){sk[i]=true;continue}
    if(i===1){const targets=wardenTargets(r);if(!Array.isArray(m.cards)||m.cards.length!==targets.length||m.cards.some((x,k)=>!x||x.target!==targets[k]||typeof x.card!=='string'||diamondBanned(r,1)&&x.card[0]==='D')||!containsCards(r.hands[i],m.cards.map(x=>x.card)))return null;if(!wardenSpendValid(r,m.saveSpend??0))return null;extra.wardenSaveSpend=m.saveSpend??0;mv[i]=m.cards.map(x=>({...x}));continue}
    const privateMove=m.hidden&&hostPrivateMoves[r.round+'_'+i],sun=privateMove&&(hostSunCards[i]||[]).find(x=>x.id===privateMove.id&&x.card===privateMove.card&&x.expires>=r.round),action=privateMove||m;
    if(m.hidden&&!sun)return null;
    if(!wardenHeartValid(r,i,action.card,action.target)||!wardenCandleTargetValid(r,i,action.card,action.candleTarget))return null;
    if(!sun&&!containsCards(r.hands[i],[action.card])||diamondBanned(r,i)&&action.card?.[0]==='D')return null;
    mv[i]=action.card;sk[i]=r.chars[i]==='spider'?{spiderSpend:action.spiderSpend||0}:action.lei!==undefined&&action.lei!==null?{lei:action.lei}:action.art||!!action.skill;
    (extra.teaCardIds=extra.teaCardIds||{})[i]=action.teaCardId;extra.visibility[i]=action.visible;if(sun)extra.sunUsed[i]=sun.id;
    if(action.card[0]==='H'&&action.target!==undefined)extra.wardenHeartTargets[i]=action.target;if(action.candleTarget)extra.wardenCandleTargets[i]=action.candleTarget;
  }
  return {mv,sk,extra};
}
// 同回合的兩場交鋒共享護盾及狀態；延後一般倒下換人、燒傷及回合遞減，全部收尾後才推進。
function resolveWardenBattle(rm0,mv,sk={},swaps=null,extra={}){
  if(wardenEndingPending(rm0))return rm0;
  if(wardenRewritePending(rm0))return rm0;
  if(wardenJudgmentArmed(rm0))return startWardenJudgment(rm0,mv,extra);
  armXichn(rm0);const participants=[...rm0.pair],targets=wardenTargets(rm0),raw=mv[1]||[],cards=targets.map((target,k)=>typeof raw[k]==='string'?{target,card:raw[k]}:raw.find(x=>x.target===target)||{target,card:null});
  let r=JSON.parse(JSON.stringify(rm0));const batch={spk:{},autoZilu:{}},results=[],pending=new Set(),revivePlays=[],reviveLog=[],joint=targets.length===2&&targets.every(i=>mv[i]&&'SCHD'.includes(mv[i][0])&&!extra.redraws?.[i]&&!extra.wardenRevives?.[i]&&!(rm0.st[i].stun>0)&&!kiraCardLocked(rm0,i))&&mv[0][0]===mv[2][0];
  const saveBonus=spendWardenSave(r,extra.wardenSaveSpend||0),punishment=wardenGod(rm0)&&!!rm0.st[1].wardenPunish,forced=wardenForcedExit(rm0),execution=forced?rm0.st[1].wardenForcedExit:wardenPriest(rm0)&&rm0.st[1].wardenExecution,shift=wardenFinalPriest(rm0)&&!!rm0.st[1].wardenShiftDelete,executionSum=targets.reduce((n,i)=>n+(!extra.redraws?.[i]&&!extra.wardenRevives?.[i]&&!(rm0.st[i].stun>0)&&!kiraCardLocked(rm0,i)&&'SCHD'.includes(mv[i]?.[0])?(+mv[i].slice(1)||0):0),0);
  extra={...extra,wardenSaveBonus:saveBonus,wardenPunishment:punishment,wardenExecution:execution?{number:execution,sum:executionSum,success:Math.abs(executionSum-execution)<=(forced?1:2),final:forced}:null,wardenShiftDelete:shift?{sum:executionSum,success:[2,26].includes(executionSum)}:null,wardenJointBonus:joint?{0:3,2:3}:{}};
  if(shift&&extra.wardenShiftDelete.success)r.st[1].wardenShiftVulnRound=rm0.round+1;
  Object.entries(extra.wardenRevives||{}).forEach(([seat,a])=>{const i=+seat;if(!wardenReviveValid(rm0,i,{round:rm0.round,revive:a}))return;const m=r.team[a.target][a.member];clearWardenRevivalEffects(r,m.st);m.hp=Math.min(5,characterMaxHp(r,a.target,m.c,m.st));m.dead=false;r.act[a.target]=a.member;r.chars[a.target]=m.c;r.hp[a.target]=m.hp;r.st[a.target]=JSON.parse(JSON.stringify(m.st));revivePlays.push({i,card:'R0',rank:0,revive:true,target:a.target,member:a.member,eff:true});reviveLog.push(`${r.seats[i].name} 花費本回合復活 ${r.seats[a.target].name} 的${CHARS[m.c].n}，恢復${m.hp}血量`)});
  Object.entries(extra.wardenPurifies||{}).forEach(([seat,a])=>{const i=+seat;if(!wardenPurifyValid(rm0,i,{round:rm0.round,purify:a}))return;mv={...mv,[i]:null};const invalid=execution||shift,lost=invalid?0:wardenFinalPriest(r)?reduceWardenMaintenance(r.st[a.target],3):reduceWardenEvidence(r.st[a.target],3);revivePlays.push({i,card:'P0',rank:0,purify:true,target:a.target,eff:!invalid});reviveLog.push(invalid?`【特殊攻擊】${r.seats[i].name} 的淨化無效`:`【淨化】${r.seats[i].name} 花費本回合為 ${r.seats[a.target].name} 減少${lost}層${wardenFinalPriest(r)?'維護工具':'告解的證據'}（9層無法降低）`);syncWardenState(r)});
  for(const [k,target] of targets.entries()){
    const action=cards[k],legMoves={[target]:mv[target],1:action.card},redraw=extra.redraws?.[1]?k===0?1:undefined:extra.redraws?.[target]?target:undefined;
    if(!punishment&&!execution&&!shift&&extra.redraws?.[1]){legMoves[1]=null;legMoves[target]=null}
    else if(!punishment&&!execution&&!shift&&extra.redraws?.[target])legMoves[1]=null;
    r={...r,pair:[target,1],round:rm0.round,status:'playing',winner:null,d25Batch:batch};
    r=resolveBattle(r,legMoves,null,sk,null,{...extra,redraw,wardenLeg:true,wardenSan:rm0.st[1].san||0,noD25:true,deferAdvance:true,visibility:{...extra.visibility,1:action.visible}});
    results.push({...r.last,plays:r.last.plays.map(p=>({...p,target:p.i===1?target:p.healTarget??1,opponent:p.i===1?target:1,...(joint&&p.i!==1?{joint:3}:{}),...(extra.wardenCandleTargets?.[p.i]?{candleTarget:extra.wardenCandleTargets[p.i]}:{})}))});r.pend.forEach(i=>pending.add(i));
  }
  delete r.d25Batch;
  r={...r,pair:[],round:rm0.round,status:'playing',winner:null};
  r=resolveBattle(r,{},null,{},swaps,{wardenFinish:true,noD25:true,deferAdvance:true,upkeepPair:participants,spk:batch.spk,autoZilu:batch.autoZilu});
  results.push(r.last);
  const log=[...(rm0.sLog||[]),...reviveLog,...(joint?['挑戰者同花色連攜：兩張牌點數各＋3']:[])],damage=[],combat=[],healing=[],plays=[...revivePlays],soundCues=[],hits=new Set();
  results.forEach(L=>{const offset=damage.length;damage.push(...L.damage);combat.push(...L.combat.map(e=>({...e,...(Number.isInteger(e.damageIndex)?{damageIndex:e.damageIndex+offset}:{})})));healing.push(...L.healing.map(e=>({...e,afterDamage:e.afterDamage+offset})));plays.push(...L.plays);soundCues.push(...L.soundCues);L.hits.forEach(i=>hits.add(i));log.push(...L.log.filter(x=>x!=='本回合沒有造成影響'))});
  r.last={...r.last,round:rm0.round,pair:participants,chars:[...rm0.chars],plays,damage,combat,healing,soundCues,hits:[...hits],log:log.length?log:['本回合沒有造成影響']};
  if(punishment||shift||forced)r.last.soundCues.push({seat:1,file:forced?WARDEN_SOUND.forcedExit:shift?WARDEN_SOUND.shiftDelete:WARDEN_SOUND.punishment,replaceAttack:true});
  gainWardenSave(r,plays.filter(p=>p.i===1).map(p=>p.originalCard||p.card));finishWardenTurn(r,rm0.round);startWardenEnding(r);
  if(wardenEndingPending(r))return r;
  if(wardenContinuePending(r))return r;
  if(r.status!=='over')r=finishWardenStage(r);
  if(wardenShiftPending(r))return r;
  if(r.status!=='over'&&wardenStage(r)!==wardenStage(rm0))return resumeWardenRound(r);
  r.pair=wardenParticipants(r);r.spin=null;r.pend=[...new Set([...pending,...r.pend])].filter(i=>r.hp[i]>0&&r.oc[i]>r.up[i].length&&subtractCards(r.hands[i],r.up[i]).length>r.oc[i]-r.up[i].length);
  if(r.status==='over')return r;
  if(r.pend.length)return {...r,phase:'reveal',deadline:r.cfg.time?Date.now()+r.cfg.time*1000:0};
  return advance(r);
}
// 實際倍率先升到16倍；背景、音樂與光印等特殊攻擊復活後才切第三階段。
function setWardenGrowth(r,step){
  clearWardenSecondStage(r);r.st[1].mdec=0;r.st[1].wardenStage=3;grantWardenStageRedraws(r);r.st[1].wardenBroken=0;r.st[1].wardenFactor=step<0?4:WARDEN_GROWTH.factors[step];r.hp[1]=step<0?1:characterMaxHp(r,1,'warden',r.st[1]);r.wardenJudgment={phase:'growth',growthStep:step};
  const m=r.team[1][r.act[1]];m.hp=r.hp[1];m.dead=false;m.st=JSON.parse(JSON.stringify(r.st[1]));delete r.wardenFinalAt;return syncWardenState(r);
}
function nextWardenShiftAt(r){const S=r.wardenShift;if(S.from!==2)return S.endsAt;if(wardenStage(r)===2)return S.startedAt+WARDEN_FINAL_REVEAL_MS;const next=(r.wardenJudgment?.growthStep??-1)+1;return next<WARDEN_GROWTH_AT.length?S.startedAt+WARDEN_FINAL_REVEAL_MS+WARDEN_GROWTH_AT[next]:S.endsAt}
function advanceWardenGrowth(r,now){const S=r.wardenShift,age=now-S.startedAt,step=wardenGrowthStep(age-WARDEN_FINAL_REVEAL_MS);setWardenGrowth(r,step);
  if(now>=S.endsAt){delete r.wardenShift;delete r.st[1].wardenFactor;r.team[1][r.act[1]].st=JSON.parse(JSON.stringify(r.st[1]));r.status='playing';r.wardenJudgment={phase:'armed',timeTargets:[...(r.timeTargets||[])]};r.timeTargets=[];r.timeClocks={};r=resumeWardenRound(r)}return r;
}
function collectWardenJudgmentMoves(r,late){const mv={},extra={sunUsed:{},visibility:{}};
  for(const i of r.pair){const m=moves[r.round+'_'+i];if(i===1){const targets=wardenTargets(r),cards=m?.cards;
      if(Array.isArray(cards)&&cards.length===targets.length&&cards.every((x,k)=>x&&x.target===targets[k]&&typeof x.card==='string')&&containsCards(r.hands[1],cards.map(x=>x.card)))mv[1]=cards.map(x=>({...x}));
      else if(late){const pool=[...r.hands[1]];mv[1]=targets.map(target=>({target,card:pool.shift()}));if(mv[1].some(x=>!x.card))return null}else return null;
    }else{const privateMove=m?.hidden&&hostPrivateMoves[r.round+'_'+i],action=privateMove||m,card=action?.card,sun=privateMove&&(hostSunCards[i]||[]).find(x=>x.id===privateMove.id&&x.card===card&&x.expires>=r.round);if(card&&(m.hidden?sun:containsCards(r.hands[i],[card]))){mv[i]=card;extra.visibility[i]=action.visible;if(sun)extra.sunUsed[i]=sun.id}else if(late)mv[i]=r.hands[i][0];else return null;if(!mv[i])return null}
  }return{mv,sk:{},extra};
}
// 專屬演出只消耗及補回出牌，不進入普通傷害、治療、反擊或死亡被動結算。
function startWardenJudgment(rm,mv,extra={}){
  const r=JSON.parse(JSON.stringify(rm)),now=Date.now(),targets=wardenTargets(r),cards=mv[1]||[],plays=[];
  for(const i of targets){if(mv[i])plays.push({i,target:1,card:mv[i],eff:false,...(extra.sunUsed?.[i]?{sunId:extra.sunUsed[i]}:{})})}
  targets.forEach((target,k)=>{const action=typeof cards[k]==='string'?{card:cards[k]}:cards.find(x=>x.target===target)||cards[k];if(action?.card)plays.push({i:1,target,card:action.card,eff:true,judgment:true})});
  for(const i of r.pair){const used=plays.filter(p=>p.i===i&&!p.sunId).map(p=>p.card);r.hands[i]=subtractCards(r.hands[i],used);r.up[i]=subtractCards(r.up[i],used);for(let k=0;k<used.length;k++){if(!r.deck.length)r.deck=newDeck(Object.values(r.hands).flat());r.hands[i].push(r.deck.shift())}if(extra.sunUsed?.[i])hostSunCards[i]=(hostSunCards[i]||[]).filter(x=>x.id!==extra.sunUsed[i]);const m=r.team[i][r.act[i]];m.hp=r.hp[i];m.st=JSON.parse(JSON.stringify(r.st[i]))}
  r.last={round:r.round,pair:[...r.pair],chars:[...r.chars],plays,damage:[],combat:[],healing:[],soundCues:[],hits:[],log:['牧師發動特殊攻擊']};
  r.wardenJudgment={phase:'attack',id:`${r.roundBase}:${r.round}:${now}`,startedAt:now,endsAt:null,step:-1,timeTargets:[...(rm.wardenJudgment.timeTargets||[])],active:[...r.act]};r.status='wardenJudgment';r.deadline=0;r.timeClocks={};r.winner=null;return r;
}
const wardenJudgmentChoicePending=(r=room)=>!!(wardenJudgmentPending(r)&&r.wardenJudgment?.phase==='choice');
const wardenJudgmentVoteKey=(r,i)=>`wardenJudgment_${r.wardenJudgment.id}_${i}`;
function wardenJudgmentVoteValid(r,i,m,now=Date.now()){return !!(wardenJudgmentChoicePending(r)&&[0,2].includes(i)&&now>=r.wardenJudgment.startedAt+WARDEN_JUDGMENT.choiceAt&&m?.id===r.wardenJudgment.id&&typeof m.yes==='boolean'&&Object.keys(m).every(k=>['id','yes'].includes(k)))}
function wardenJudgmentMoveAllowed(path,m,owner,now=Date.now()){if(!wardenJudgmentChoicePending())return false;const i=[0,2].find(i=>path===`rooms/${code}/moves/${wardenJudgmentVoteKey(room,i)}`);if(i===undefined||!wardenJudgmentVoteValid(room,i,m,now)||!(test&&owner===undefined||room.seats[i].id===(owner??uid)))return false;const previous=moves[wardenJudgmentVoteKey(room,i)];return !previous||previous.yes===true&&m.yes===false}
function voteWardenJudgment(yes){if(!wardenJudgmentChoicePending())return;const i=rd(),m={id:room.wardenJudgment.id,yes},path=`rooms/${code}/moves/${wardenJudgmentVoteKey(room,i)}`;if(!wardenJudgmentVoteValid(room,i,m,d25Now())||!wardenJudgmentMoveAllowed(path,m,undefined,d25Now()))return;db.doc(path).set(m)}
const wardenJudgmentRefused=(r,now=Date.now())=>[0,2].every(i=>{const m=moves[wardenJudgmentVoteKey(r,i)];return wardenJudgmentVoteValid(r,i,m,now)&&m.yes===false});
function nextWardenJudgmentAt(r){const J=r.wardenJudgment;if(J.phase==='choice')return Infinity;if(J.phase==='rise')return J.endsAt;if(J.phase==='speech')return J.restoreAt;const next=(J.step??-1)+1;return J.startedAt+WARDEN_JUDGMENT.epsilonAt+Math.min(4,next)*WARDEN_JUDGMENT.epsilonMs}
function advanceWardenJudgment(r,now=Date.now()){if(!wardenJudgmentPending(r))return r;const J=r.wardenJudgment,age=now-J.startedAt;
  if(J.phase==='attack'&&age>=WARDEN_JUDGMENT.epsilonAt){const step=Math.min(4,Math.floor((age-WARDEN_JUDGMENT.epsilonAt)/WARDEN_JUDGMENT.epsilonMs)),hp=[1,.1,.01,.001,.0001][step];J.step=step;if(step===4)J.phase='choice';
    for(const i of [0,2]){r.team[i].forEach((m,k)=>{if(k!==r.act[i]){m.hp=0;m.dead=true}});r.hp[i]=hp;r.team[i][r.act[i]].hp=hp;r.team[i][r.act[i]].dead=false}
  }
  if(J.phase==='choice'&&wardenJudgmentRefused(r,now)){J.phase='speech';J.speechAt=now;J.restoreAt=now+WARDEN_TIPHERETH.voiceMs+WARDEN_TIPHERETH.holdMs;J.endsAt=J.restoreAt+WARDEN_FINAL.riseMs}
  if(J.phase==='speech'&&now>=J.restoreAt){
    for(const i of [0,2]){r.team[i].forEach(m=>{clearWardenRevivalEffects(r,m.st);m.dead=false;m.hp=Math.min(r.cfg.hp,characterMaxHp(r,i,m.c,m.st))});const m=r.team[i][r.act[i]];r.hp[i]=m.hp;r.st[i]=JSON.parse(JSON.stringify(m.st))}
    J.phase='rise';J.step=5;r.wardenFinalAt=J.restoreAt;grantWardenTiphereth(r,J.restoreAt);
  }
  if(J.phase==='rise'&&now>=J.endsAt){J.phase='done';r.timeTargets=[...J.timeTargets];r.round++;hostSunCards=Object.fromEntries(Object.entries(hostSunCards).map(([i,a])=>[i,a.filter(x=>x.expires>=r.round)]));r.status='playing';r.phase='play';r.winner=null;r.pair=wardenParticipants(r);r.spin=null;r.pend=[];enforceWardenHands(r);r=resumeWardenRound(r)}return r;
}
function pickChar(c){const D=room.draft,step=D.step||0,s=rd(),cur=D.order[step%D.order.length];if(s!==cur||!draftCanPick(D,c,s))return;db.doc(`rooms/${code}/moves/d${room.roundBase}_${step}_${s}`).set({char:c})}
function banUI(s){const B=room.ban,step=B.step||0,cur=B.order[step],mine=s===cur,chosen=B.picks.filter(Boolean),nm=room.seats.map(p=>esc(p.name)),order=B.order.map((x,k)=>`<span class="chip ${k===step?'cmd':''}">${k+1}. ${nm[x]}</span>`).join(''),available=c=>canBanChar(room,c),cards=Object.keys(CHARS).filter(available).map(c=>`<button class="draft-option" ${mine?'':'disabled'} onclick="banChar('${c}')" title="${esc(CHARS[c].d)}"><div class="draft-art"><img src="${charArtSrc(imgK(c),'left')}" data-k="${imgK(c)}" data-p="left" data-s="0" onerror="imgFb(this)" alt="${esc(CHARS[c].n)}"></div><div class="draft-card-info"><span class="draft-card-name">${esc(CHARS[c].n)}${CHARS[c].t?'・'+esc(CHARS[c].t):''}</span><div class="draft-card-tag"><span class="draft-badge">${esc(FAC[CHARS[c].f]||'其他')}陣營</span><span class="draft-badge">可禁用</span></div><span class="draft-desc">${esc(CHARS[c].d)}</span></div></button>`).join('');return`<div class="box draft-box"><div class="draft-head"><div><div class="draft-title">${room.cfg.v3?(room.cfg.n===3?'3v3v3 ':'3v3 '):''}角色禁用</div><div class="mut">每位玩家各禁用一名角色，順序隨機；禁用角色本局全場都不能選</div><div class="draft-order">${order}</div></div><div class="draft-turn">${mine?'👉 輪到你選擇禁用角色':'等待 '+nm[cur]+' 禁用角色'}</div></div><div class="draft-teams">${room.seats.map((p,i)=>`<section class="draft-team ${i===cur?'active':''}"><div class="draft-team-name"><span>${esc(p.name)}${i===s?'（你）':''}</span></div><div class="draft-team-slots">${B.picks[i]?`<div class="draft-pick"><img src="${charArtSrc(imgK(B.picks[i]),'left')}" data-k="${imgK(B.picks[i])}" data-p="left" data-s="0" onerror="imgFb(this)"><div class="draft-pick-name">${esc(CHARS[B.picks[i]].n)}<span class="draft-pick-role">已禁用</span></div></div>`:'<div class="draft-empty">尚未選擇</div>'}</div></section>`).join('')}</div><div class="draft-section-title"><span>選擇要禁用的角色</span><span class="mut">禁用名單：${chosen.map(c=>esc(CHARS[c].n)).join('、')||'尚無'}</span></div><div class="draft-grid">${cards}</div></div>`}
function banChar(c){const B=room.ban,step=B.step||0,s=rd();if(s!==B.order[step]||!canBanChar(room,c))return;db.doc(`rooms/${code}/moves/b${room.roundBase}_${step}_${s}`).set({char:c})}
function normalPickUI(s){const P=room.selection,step=P.step||0,cur=P.order[step],mine=s===cur,chosen=P.picks.filter(Boolean),nm=room.seats.map(p=>esc(p.name)),order=P.order.map((x,k)=>`<span class="chip ${k===step?'cmd':''}">${k+1}. ${nm[x]}</span>`).join(''),available=c=>!CHARS[c].v3only&&!CHARS[c].hidden&&!(room.bans||[]).includes(c)&&!chosen.includes(c)&&(!room.cfg.factions||room.cfg.factions[CHARS[c].f]!==false),cards=Object.keys(CHARS).filter(available).map(c=>`<button class="draft-option" ${mine?'':'disabled'} onclick="pickNormalChar('${c}')" title="${esc(CHARS[c].d)}"><div class="draft-art"><img src="${charArtSrc(imgK(c),'left')}" data-k="${imgK(c)}" data-p="left" data-s="0" onerror="imgFb(this)" alt="${esc(CHARS[c].n)}"></div><div class="draft-card-info"><span class="draft-card-name">${esc(CHARS[c].n)}${CHARS[c].t?'・'+esc(CHARS[c].t):''}</span><div class="draft-card-tag"><span class="draft-badge">${esc(FAC[CHARS[c].f]||'其他')}陣營</span><span class="draft-badge">可選</span></div><span class="draft-desc">${esc(CHARS[c].d)}</span></div></button>`).join('');return`<div class="box draft-box"><div class="draft-head"><div><div class="draft-title">角色選角</div><div class="mut">每位玩家選擇一名角色，不可重複</div><div class="draft-order">${order}</div></div><div class="draft-turn">${mine?'👉 輪到你選角':'等待 '+nm[cur]+' 選角'}</div></div><div class="draft-teams">${room.seats.map((p,i)=>`<section class="draft-team ${i===cur?'active':''}"><div class="draft-team-name"><span>${esc(p.name)}${i===s?'（你）':''}</span></div><div class="draft-team-slots">${P.picks[i]?`<div class="draft-pick"><img src="${charArtSrc(imgK(P.picks[i]),'left')}" data-k="${imgK(P.picks[i])}" data-p="left" data-s="0" onerror="imgFb(this)"><div class="draft-pick-name">${esc(CHARS[P.picks[i]].n)}<span class="draft-pick-role">已選擇</span></div></div>`:'<div class="draft-empty">尚未選擇</div>'}</div></section>`).join('')}</div><div class="draft-section-title"><span>選擇角色</span><span class="mut">本局禁用：${(room.bans||[]).map(c=>esc(CHARS[c].n)).join('、')||'無'}</span></div><div class="draft-grid">${cards}</div></div>`}
function pickNormalChar(c){const P=room.selection,step=P.step||0,s=rd();if(s!==P.order[step]||!CHARS[c]||CHARS[c].v3only||CHARS[c].hidden||(room.bans||[]).includes(c)||P.picks.includes(c)||room.cfg.factions&&room.cfg.factions[CHARS[c].f]===false)return;db.doc(`rooms/${code}/moves/p${room.roundBase}_${step}_${s}`).set({char:c})}
const canSw=(i,k)=>!wardenJudgmentArmed()&&!room.st?.[i]?.wardenGeburaPending&&!battleObservationActive()&&room.status==='playing'&&room.phase==='play'&&!mirrorPending()&&!environmentTradePending()&&room.team&&(unlimitedWardenSwaps(room,i)||room.swapsLeft[i]>0)&&k!==room.act[i]&&!room.team[i][k].dead&&canDeploy(room.team[i][k].c)&&room.hp[i]>0&&(test||i===rd());
const pendSw=i=>{const w=moves['w'+room.round+'_'+i];return !room.st?.[i]?.wardenGeburaPending&&w&&w.to>=0&&w.to!==room.act[i]?w:null};
const nutOf=i=>room.team?room.team[i].find(m=>m.c==='nut'):null;
const nutMax=()=>Math.round(room.cfg.hp*1.2);
const canCancel=i=>!battleObservationActive()&&room.status==='playing'&&room.phase==='play'&&!mirrorPending()&&!environmentTradePending()&&!!room.team&&!!pendSw(i)&&room.hp[i]>0&&(test||i===rd());
function cancelSw(i){if(canCancel(i))db.doc(`rooms/${code}/moves/w${room.round}_${i}`).set({to:-1})}
function resv(i,pos){if(!room.team)return'';const pend=pendSw(i);
  return`<div class="resv ${pos}">${room.team[i].map((m,k)=>k===room.act[i]?'':`<div data-damage-target="${i}:${k}" class="rchip ${m.dead?'dead':''} ${m.c==='nut'?'nutc':''} ${pend&&pend.to===k?'pend':''}" title="${esc(CHARS[m.c].n)}${m.dead?'（已倒下）':'｜HP '+m.hp+(m.c==='nut'?' / '+nutMax():'')}${m.c==='jia_qiu'?'｜'+(m.st.notExpecting?'不再期待（強壯+20）'+(m.st.timeUpTurns>0?'｜剩'+m.st.timeUpTurns+'回合':''):'期待×'+(m.st.expectation||0))+(m.st.egoStanding?'｜綻放EGO：而立（強壯+1、指定單方面攻擊+2）':'')+(m.st.shield?'｜護盾×'+m.st.shield:''):''}${m.c==='xichn'?'｜待×'+(m.st.xichnWait||0)+'｜切磋琢春 '+xichnStages(m.st).join('／')+'｜余桓'+(m.st.xichnYuhuanUsed?'已使用':'可用'):''}${(m.st.rupture||0)?'｜破裂×'+m.st.rupture:''}${m.c==='zilu'&&(m.st.ziluStrong||0)?'｜強壯×'+m.st.ziluStrong:''}${pend&&pend.to===k&&canCancel(i)?'｜點擊取消換人':''}" ${canSw(i,k)?`draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${k}')"`:''} ${(canSw(i,k)||(pend&&pend.to===k&&canCancel(i)))?`onclick="clickSw(${i},${k})"`:''}><img src="${charArtSrc(imgK(m.c,m.st),pos)}" data-k="${imgK(m.c,m.st)}" data-p="${pos}" data-s="0" onerror="imgFb(this)"><span>${CHARS[m.c].n}${m.c==='nut'?'<br>❤'+Math.max(0,m.hp)+'/'+nutMax():''}</span>${environmentTargetFxUI(i,k)}</div>`).join('')}</div>`}
function teamInfo(i){if(!room.team)return'';const pend=pendSw(i),nt=nutOf(i),pvz=room.team[i].filter(m=>isPvz(m.c)).map(m=>m.c==='wood'?`🔥火炬×${m.st.torchUses||0}`:m.c==='sunflower'?`☀陽光×${m.st.sun||0}`:`🥜高堅果 ${m.dead?'倒下':'守護中 '+Math.max(0,m.hp)+'/'+nutMax()}`).join('｜');
  return`<div class="mut">換人 ${unlimitedWardenSwaps(room,i)?'∞':room.swapsLeft[i]+'/2'}${pend?'｜⏳下回合換上 '+CHARS[room.team[i][pend.to].c].n+(canCancel(i)?'（點擊出戰角色可取消）':''):''}｜存活 ${room.team[i].filter(m=>!m.dead).length}/${room.team[i].length}${pvz?'｜'+pvz:''}</div>`}
function dropSw(e,i){e.preventDefault();const k=+e.dataTransfer.getData('text/plain');if(canSw(i,k))requestSwap(i,k)}
function clickSw(i,k){const p=pendSw(i);if(p&&p.to===k){cancelSw(i);return}if(canSw(i,k))showBattleConfirm('確認換人','下回合換上「'+CHARS[room.team[i][k].c].n+'」？（'+(unlimitedWardenSwaps(room,i)?'不限次數':'剩餘 '+room.swapsLeft[i]+' 次')+'）',()=>{if(canSw(i,k))requestSwap(i,k)})}
function requestSwap(i,k){db.doc(`rooms/${code}/moves/w${room.round}_${i}`).set({to:k})}
let hideSel=[],hideSlots=[],selUp=null,artPick='',sunSuitPick='S',sunCardSel=null,privateSunCards=[],sunPending=false;
let spiderPick=0;
function spiderSel(i){if(room.chars[i]!=='spider'||envSilent(room)||room.st[i].sealT>0)return'';const card=sunCardSel?privateSunCards.find(x=>x.id===sunCardSel)?.card:sel,key=card&&spiderResource(card[0]);if(!key)return'';const max=Math.floor((room.st[i][key]||0)/5)*5,n=spiderSpendAmount(room.st[i],card[0],spiderPick),black=key==='spiderEye';return `<label class="spider-spend">${black?'👁赤曈':'💀懺悔'} ${room.st[i][key]||0}層：消耗 <input type="number" min="0" max="${max}" step="5" value="${n}" aria-label="消耗${black?'赤曈':'懺悔'}層數" onchange="spiderPick=spiderSpendAmount(room.st[rd()],sel?.[0]||privateSunCards.find(x=>x.id===sunCardSel)?.card?.[0]||'',+this.value);render()"> 層（每5層${black?'黑牌點數+1':'護盾+1'}）</label>`}
let leiPick=0;spiderPick=0;
function leiVal(s){const st=room.st[s],m=st.mhu||0,h=st.hu||0;return m>0?Math.max(1,Math.min(5,m,leiPick||1)):Math.max(0,Math.min(3,h,leiPick))}
function leiInfo(s){const st=room.st[s],n=leiVal(s);if((st.mhu||0)>0)return{n,quick:n===5,bonus:n===5?8:[0,1,3,5,7][n]};return{n,quick:false,bonus:n}}
function leiSel(s){if(envSilent(room)||room.chars[s]!=='lei'||(room.st[s].sealT||0)>0||(room.st[s].stun||0)>0)return'';const st=room.st[s],m=st.mhu||0,h=st.hu||0,v=leiVal(s);
  if(m>0){const mx=Math.min(5,m);return`<label>🐅 猛虎標彈 ${m}：必須消耗 <select onchange="leiPick=+this.value;render()">${Array.from({length:mx},(_,k)=>k+1).map(n=>`<option value="${n}" ${n===v?'selected':''}>${n}（${n===5?'快刀亂麻：視為♠+8、群體×0.6':'點數+'+[0,1,3,5,7][n]}）</option>`).join('')}</select></label>`}
  const mx=Math.min(3,h);return`<label>🐅 虎標彈 ${h}：消耗 <select onchange="leiPick=+this.value;render()">${Array.from({length:mx+1},(_,k)=>k).map(n=>`<option value="${n}" ${n===v?'selected':''}>${n}（點數+${n}）</option>`).join('')}</select></label>`}
const shinActive=s0=>!!(s0&&(s0.musouShin||(s0.shin||0)>0));
const artCost=(r,i,a)=>a.cost*(r.chars[i]==='rean'&&r.st[i].artCpHalf?.5:1);
function artSel(s){const C=CHARS[room.chars[s]];if(envSilent(room)||!C||!C.arts||(room.st[s].sealT||0)>0||(room.st[s].stun||0)>0)return'';const cp=cpOf(s),en=shinActive(room.st[s]),ok=a=>cp>=artCost(room,s,a)&&(!a.can||a.can(room,s)),ap=C.arts.some(a=>a.id===artPick&&ok(a))?artPick:'';
  return`<label>戰技（下回合開始時生效） <select onchange="artPick=this.value;render()"><option value="">不使用</option>${C.arts.map(a=>`<option value="${a.id}" ${ok(a)?'':'disabled'} ${ap===a.id?'selected':''}>${(en&&a.n2)||a.n}（-${artCost(room,s,a)}CP）</option>`).join('')}</select></label>`}
function toggleHide(c,index){if(wardenPaused())return;const s=rd(),up=room.up[s],hid=subtractCards(room.hands[s],up),need=hid.length-Math.max(0,room.oc[s]-up.length),at=index===undefined?hid.indexOf(c):index;
  if(at<0||hid[at]!==c)return;hideSlots=hideSlots.includes(at)?hideSlots.filter(i=>i!==at):[...hideSlots,at];hideSel=hideSlots.map(i=>hid[i]);
  if(hideSel.length===need){db.doc(`rooms/${code}/moves/v${room.round}_${s}`).set({hide:hideSel});hideSel=[];hideSlots=[]}else render()}
function playRedraw(){if(wardenPaused()||wardenJudgmentArmed()||wardenForcedExit(room))return;const s=rd(),d=redrawCost(room,s);if(kiraCardLocked(room,s))return;
  if(isoPending()||valorantShopPending()||mirrorPending()||environmentTradePending())return;
  showBattleConfirm('確認換牌','「我牌太爛啦！」：立即結束本回合，你將受到 '+d+' 點傷害並重新抽取手牌'+(freeWardenRedraw(room,s)?'（階段免費・剩'+room.wardenRedraws[s]+'次；使用一次，不增加付費消耗）。':freeLkdRedraw(room,s)?'（使用一次免費次數，不增加付費消耗）。':'（可無限使用，每次增加5點傷害）。')+'確定嗎？',()=>{if(!moves[room.round+'_'+s]&&!isoPending()&&!valorantShopPending()&&!mirrorPending()&&!environmentTradePending()&&!d25DrawPending())db.doc(`rooms/${code}/moves/${room.round}_${s}`).set({redraw:true})})}
function prevMult(c,s0,suit){let m=1;const atk='SCD'.includes(suit),C0=CHARS[c],a=(C0&&C0.arts&&s0.artOn)?s0.art:null,en=shinActive(s0);
  if(atk){if(c==='rean'&&en)m+=s0.musouShin?.8:.5;(s0.fx||[]).forEach(x=>{if(x.k==='dm')m+=x.n})}
  if(c==='rean'){if(a==='karyu')m+=en?.7:.5;if(a==='roku'&&en)m+=.3}
  return Math.max(0,m)}
/* 卡牌預覽：計算最終傷害（點數倍率、強壯/虛弱、易損/守護、減傷%、護盾、大地之牆、本回合生效的戰技） */
function estimate(c,h){const result=estimateCard(c,h);if(h!=='pick'||!room?.teaflower)return result;const i=rd();if(i<0||!drunkCanSee(room,i,i,sunCardSel?publicTemporaryCards(room,i).some(x=>x.id===sunCardSel):sel===c?!!selUp:room.up[i]?.includes(c)))return result;const card=teaPlayedRecord(room,i,c,sunCardSel,sel===c?selUp:null,sel===c?teaSelId:null),mark=card&&teaBlooms(room,i).find(m=>m.id===card.id);if(!mark)return result;return result+' 🌺〔開花〕：本牌造成傷害會移除標記並使冬柏落英+1；失敗消耗會轉移標記。'+(teaSourceEnabled(room,mark)&&teaSourceState(room,mark)?.teaInner?'失敗另受牌面'+(+c.slice(1))+'點基礎傷害（不再疊開花）。':'')}
function estimateCard(c,h){if(h==='pick'&&room?.st&&rd()>=0&&!drunkCanSee(room,rd(),rd(),sel===c?!!selUp:room.up[rd()]?.includes(c)))return'牌面隱藏，出牌時依實際卡牌結算。';if(h!=='pick'||!room||!room.pair||!room.st)return'';if(wardenGod(room)&&room.st[1].wardenPunish)return rd()===1?'本回合出牌視為特殊攻擊：固定15點，敵方牌無效，方塊不可阻擋。':'看守本回合發動懲罰，你的牌效果無效；護盾與毅力仍可生效。';if(wardenPriest(room)&&room.st[1].wardenExecution)return `死刑執行：兩名挑戰者原牌點數合計需在${room.st[1].wardenExecution}正負2內，達成時各獲得${wardenSlayDamage(room)}護盾；隨後各受到1點×${room.cfg.hp}次固定傷害，所有挑戰者牌效無效，減傷不生效。`;if(wardenForcedExit(room))return `強制退場：兩隊原牌合計須在${room.st[1].wardenForcedExit}正負1內；達標各獲得${damageAmount(room.cfg.hp*2.5)}護盾，隨後各受到1點×${room.cfg.hp*2}次固定傷害，本回合全員不可換牌。`;if(wardenFinalPriest(room)&&room.st[1].wardenShiftDelete)return `shift+delete：兩隊原牌合計須等於2或26；失敗各受到1點×${room.cfg.hp*2}次固定傷害，成功則牧師下回合受傷翻倍。`;if(room.st[rd()]?.wardenException)return '釘-Exception：本回合所有牌為0點無花色，受到傷害翻倍。';if(wardenJudgmentArmed())return rd()===1?'本次出牌必定發動特殊攻擊。':'出牌後等待牧師的特殊攻擊。';const s=rd(),o=room.cfg.warden?(s===1?wardenTargets(room)[wardenLane]:1):room.pair.find(x=>x!==s);if(o===undefined||s<0)return'';if(envActive(room,'confusion'))return'❔ 混亂：結算時才會隨機決定花色；點數不變，可能造成攻擊、斷補、治療或反擊，無法提前預測結果。';
  if(envActive(room,'invertedStage'))return'🔀 倒錯舞台：揭牌後交換雙方花色，原始點數不變；效果依對手花色結算。'+(envActive(room,'assassin')?'🗡️ 刺客：J／Q／K點數+5；遇到對手A／2／3，最終點數歸零。':'');
  const cl=x=>JSON.parse(JSON.stringify(x)),id=[s,o],S=id.map(i=>envSilent(room)?newSt():cl(room.st[i]));
  const sealed=j=>(room.st[id[j]].sealT||0)>0;
  const C=id.map((i,j)=>envSilent(room)||sealed(j)?'_':room.chars[i]);
  const originalCard=c;if(C[0]==='teaflower'&&skOn&&teaClubAvailable(room,s))c='C'+c.slice(1);c=lucioCard(C[0],S[0],c);const spiderPreview=C[0]==='spider'?spiderSpendAmount(S[0],c[0],spiderPick):0,spiderNote=C[0]==='spider'?`（消耗${spiderPreview}層${'SC'.includes(c[0])?'赤曈：黑牌點數+'+spiderPreview/5:'懺悔：出牌立即獲得'+spiderPreview/5+'盾'}；牌效成功獲得最終點數×${S[0].spiderGain||1}層，失敗減半，小數捨去）`:'';
  if(s!==1&&'SC'.includes(c[0])&&wardenCandle(room)(wardenCandleTarget)){const rank=effRank(C[0],S[0],c,prevMult(C[0],S[0],c[0]),wardenPreviewJoint(s,originalCard)+spiderPreview/5),pulse=S[0].wardenPulse?5:0,sanity=S[0].san||0;return cs(originalCard)+'：攻擊刑罰之燭台，'+`基礎傷害${rank+pulse}點（梅花不減傷；理智與角色攻擊加成照常）`+`；看守仍會攻擊你。${sanity>=45?'理智45傷害＋2。':''}`}

  const lucioConversionNote=C[0]==='lucio'&&originalCard!==c?`（教材${S[0].lucioLesson}：原牌基礎${+originalCard.slice(1)}轉為${+c.slice(1)}）`:'';
  id.forEach((i,j)=>syncTktState(C[j],S[j],room.hp[i],maxHp(i)));
  const fastPreview=C[0]==='zilu'&&S[0].ziluFast&&S[0].ziluFastRound!==room.round&&!(S[0].stun>0)&&!moves[room.round+'_'+s]&&!moves[room.round+'_'+o];if(fastPreview)S[0].ziluStrong=(S[0].ziluStrong||0)+2;
  const halved=()=>!!room.team&&(room.cfg.boss&&s===1||rufoGroupFactor(room,s)===1);
  const lp=(C[0]==='lei')?leiInfo(s):null,suit=lp&&lp.quick?'S':c[0],hungerBonus=room.team&&S[0].urgentHunger&&room.hp[s]>=maxHp(s)*.3&&room.team[s].some(m=>m.c==='sinclair')?Math.ceil(room.hp[s]*.1)+1:0,torchMul=room.team&&S[0].torchRound===room.round?2:1,r=envRank(room,S[0],c,(effRank(C[0],S[0],c,prevMult(C[0],S[0],suit),(lp?lp.bonus:0)+('SC'.includes(suit)?spiderPreview/5:0)+wardenPreviewJoint(s,originalCard)+(s===1&&wardenSaveSpend!==50&&wardenSpendValid(room,wardenSaveSpend)?wardenSaveSpend/10:0))+hungerBonus)*torchMul),bo=calcBuffs(C[1],S[1]),adj=bo.vuln-bo.guard,rdv=redSt(C[1],S[1]),sh=S[1].shield||0,rv=!isMiddleFinger(C[0])?0:revengeStacks(room,s,S[1]);
  const xichnProtection=C[1]==='xichn'&&!S[1].xichnYuhuanUsed&&room.team&&room.team[o].some((m,k)=>k!==room.act[o]&&!m.dead&&m.hp>0&&canDeploy(m.c));
  const a0=(CHARS[C[0]]&&CHARS[C[0]].arts&&S[0].artOn)?S[0].art:null,rk=C[0]==='rean'&&a0==='roku'&&'SC'.includes(suit)&&halved(),wall=(S[1].wall||0)>0;
  const fin=(v0,half,fm,kind)=>{if(wall||C[1]==='iso'&&S[1].isoDual)return 0;let v=v0;if(half)v/=2;v+=((!envSilent(room)&&C[0]!=='verg'&&(room.st[s].san||0)>=45)?2:0)+rv+(envBlood(room)&&v>0?2:0);v=envBlackDamage(room,v,suit);if('SC'.includes(suit)&&S[0].wardenPulse)v+=5;if(S[0].wardenRapidPulse&&v>0)v+=10;if(v>0){v=Math.max(0,v+adj);if(v>0&&rdv>0)v*=1-Math.min(.9,rdv);if(v>0&&fm)v*=fm;if(v>0&&kind==='spade'&&C[1]==='heathcliff'&&S[1].shieldSuit==='S')v/=2;if(S[1].isoCut)v=tidyHp(v*1.5);if(S[1].wardenStop)v/=2;if(S[1].wardenCompleteStop)v=tidyHp(v*.2);v=wardenEvidenceDamage(room,s,v,kind);v=wardenMaintenanceDamage(room,S[1],v,kind);if(o===1&&S[1].wardenShiftVulnRound===room.round)v*=2;if(S[1].wardenCondemned)v*=2;v=damageAmount(v);if(v>0&&sh>0)v=Math.max(0,v-Math.floor(sh))}if(C[1]==='tkt')v=Math.min(v,tktHealth(room.hp[o],maxHp(o),S[1]).current);if(xichnProtection&&v>0&&room.hp[o]-v<maxHp(o)/2)v=Math.max(0,room.hp[o]-Math.ceil(maxHp(o)/2));return tidyHp(v)},finText=(v0,half,fm,kind)=>{const lo=fin(v0+(C[0]==='verg'?1:0),half,fm,kind),hi=fin(v0+(C[0]==='verg'?3:0),half,fm,kind);return lo===hi?lo:`${lo}～${hi}`};
  const valEvasionNote=C[1]==='val'&&S[1].eye>=2&&!(S[1].heat>0)&&'SC'.includes(suit)?`（預知眼：若對方剩餘手牌中最大方塊原始點數≥${+c.slice(1)}，可消耗2層及該牌，該回合持續閃避符合點數的傷害；每回合只消耗並補抽一次，梅花斷補仍生效）`:'';
  const sadNote=C[0]==='sad'?(sadEmpowered(S[0])?`（淚鋒+6已計入；${S[0].sadPride&&S[0].sadTears>=3?'固定3層，持續生效':'本張牌後消耗加成'}，攻擊或反擊命中使對方${CHARS[room.chars[o]]?.f==='bus'&&room.chars[o]!=='verg'?'理智-20':'追加3點固定傷害'}）`:'')+(suit==='D'?`（出牌後淚鋒+1，不要求反擊成功；${S[0].sadPride?'上限3層且不消耗，反擊點數×1.5已計入':S[0].sadTears>=2?'消耗3層並準備下一張牌+6':'累積至3層時消耗'}；免空防禁止）`:''):'';
  const sn=(!envSilent(room)&&room.chars[s]&&CHARS[room.chars[s]]&&CHARS[room.chars[s]].f==='bus')?(room.st[s].san||0):0,
    note=spiderNote+valEvasionNote+sadNote+(xichnProtection?'（余桓：本次可保留50%生命並隨機免費換人，後續連擊依接替角色結算）':'')+(C[0]==='lucio'?lucioConversionNote+('SC'.includes(suit)?`（雙方出黑牌且盧西奧點數≥5時拼點；目標原有高潮${S[1].duelClimax||0}提供拼點+${S[1].duelClimax||0}，本回合強壯${S[0].lucioStrong||0}已計入；本次新增高潮不計加成）`:''):'')+(envActive(room,'assassin')?'（刺客：J／Q／K點數+5；若對手出A／2／3，自己的最終點數歸零）':'')+(C[0]==='moses'?`（出牌即累積${+c.slice(1)}層煙霧-${SMOKE_NAMES[S[0].smokeCrimson?'crimson':'SC'.includes(suit)?'red':suit==='D'?'purple':'white']}，上限${S[0].smokeCrimson?20:6}）`:'')+(C[1]==='tkt'?'（時間殺人魔：單次傷害不跨血條）':'')+(wall?'（對方有大地之牆，將抵擋這次傷害）':'')+(sh>0?`（護盾吸收最多${sh}點，溢出扣生命）`:'')+(envActive(room,'allIn')&&+c.slice(1)>=10?'（孤注一擲：點數×1.5，回合結束失去5血）':'')+(envActive(room,'peace')&&'SC'.includes(suit)?'（和平鐘聲：黑牌傷害−4）':'')+(torchMul>1?'（火炬：點數×2）':'')+(C[0]==='verg'?'（維吉里烏斯：攻擊額外隨機+1～3）':'')+(sn>=45?'（理智45：傷害+2）':sn<=-45?'（理智-45：侵蝕，系統隨機出牌；下回合理智重置為0）':sn?`（理智${sn}：${50+Math.abs(sn)}%機率${sn>0?'+1':'-1'}）`:''),
    nm=SU[suit]+NM(+c.slice(1))+'（點數 '+r+'）'+(fastPreview?'（超高速：先出牌強壯+2）':'')+(C[0]==='sinclair'&&S[0].laDemande?'【la demande】回合結束追加基礎3點追擊，並隨機附加1層虛弱或易損（各3回合）；本牌':'')+(C[0]==='rufo'&&skOn&&S[0].rufoReady?`【爆裂呈現】先進行4連擊${S[0].rufoColor?'群體攻擊（含後備）':'廣域亂射'}，每擊基礎傷害${(S[0].rufoSkillUses||0)+1}${S[0].rufoColor&&rufoGroupFactor(room,s)===2?'（群體效果×2）':''}；接著本牌`:'');
  if('SC'.includes(suit)&&id.some((i,j)=>C[j]==='iso'&&S[j].isoAdapt))return nm+'【應變】本回合雙方黑牌攻擊傷害固定為0；反擊與技能追擊照常。';
  if(room.cfg.warden&&s!==1&&S[0].wardenGebura)return nm+'【Gebura之刃】本牌視為特殊攻擊，預計傷害 '+finText(r,false,2,'gebura')+'；對方塊傷害減半且不可反擊。回復實際傷害（含扣盾）的一半，向上取整；本回合生命不低於1。'+note;
  if(suit==='H'&&room.cfg.warden&&s!==1&&wardenHeartTarget!==null&&wardenHeartTarget!==s){const t=wardenHeartTarget,ts=room.st[t],tc=room.chars[t],base=r,raw=Math.ceil(base*healingFactor(ts)),v=tc==='heathcliff'&&ts.shieldSuit==='H'?Math.ceil(raw/2):raw,count=isValorant(C[0])?valorantTriggers(C[0],S[0],c):1;let after=room.hp[t];for(let n=0;n<count;n++)after=healedHp(after,maxHp(t),v,tc,ts);return nm+'：替 '+room.seats[t].name+' 預計回復 '+tidyHp(after-room.hp[t])+' 點血量'+healingNote(ts)+'（看守梅花打中你時，此治療會被阻止）'}
  if(isValorant(C[0])){const gun=valorantGun(C[0],S[0]),count=valorantTriggers(C[0],S[0],c),extra=gun===VALORANT_GUNS.guardian&&suit==='C'?'；斷補成功追加5點傷害':'';let detail;if(suit==='S')detail='每次預計傷害 '+finText(r,false,0,'spade');else if(suit==='C')detail='每次預計傷害 '+finText(gun===VALORANT_GUNS.odin?r:r/2,false)+extra+'，使對方治療無效';else if(suit==='H'){const v=envHeal(room,Math.ceil(r*healingFactor(S[0])));detail=(envActive(room,'emergency')?'每次獲得護盾 ':'每次治療量 ')+v+healingNote(S[0])}else detail='被攻擊時反擊，每次預計傷害 '+finText(r*(gun===VALORANT_GUNS.judge?2:1),false);return nm+'【'+(gun?.n||'無槍械')+'】'+count+'次效果，'+detail+'；各次分開計算狀態，對方方塊只反擊一次。'+note}
  if(C[0]==='moses'&&S[0].crimsonBreathRound===room.round)return nm+'【吐息-深紅已準備】本回合先於萊萬汀斬殺對手；'+(room.cfg.warden&&o===1?`對看守改為基礎設定生命×1.2＝${wardenSlayDamage(room)}點固定傷害，護盾與大地之牆仍生效。`:'仍遵守天殺及斬殺防護規則。');
  if(room.cfg.warden&&s!==1&&C[0]==='mat'&&skOn&&S[0].wrap>=3&&matTarget(room,s,room.hp)===1)return nm+`【萊萬汀】對看守改為基礎設定生命×1.2＝${wardenSlayDamage(room)}點固定傷害，護盾與大地之牆仍生效；隨後結算本張牌。`;
  if(C[0]==='bamboo'&&skOn&&bambooCanSkin(S[0],c))return nm+'【捨吾皮肉】命中固定3點傷害，不附原黑牌效果；牆、護盾及高堅果仍可攔截。被方塊成功反擊且存活後，發動【斷汝筋骨】4連斬，每擊基礎4點，逐擊計算增減傷'+(S[0].bambooEgo?'，群體攻擊全體敵人含後備':'，攻擊反擊者')+'。'+((S[0].res||0)>0?`毅力×${S[0].res}：一般致命傷害消耗1層，保留1點生命。`:'毅力已耗盡。');
  if(C[0]==='card_ish'&&skOn&&(S[0].light||0)>=5)return nm+'【光斬】回合結束對敵方出戰角色連擊5次，每擊基礎傷害4點，逐擊結算';
  if(C[0]==='sinclair'&&skOn&&((S[0].endlessHunger||0)>=40)&&!S[0].laCastrationUsed)return nm+'【La Castration】單方面群體攻擊，預計造成'+envAttack(room,15)+'點傷害';
  if(suit==='S')return nm+(lp&&lp.quick?'【快刀亂麻】':'')+'：預計造成最終傷害 '+finText(r,rk,lp&&lp.quick?(halved()?.6:1.2):0,'spade')+' 點（已計算易損、守護、減傷、護盾）'+(C[1]==='heathcliff'&&S[1].shieldSuit==='S'?'（希斯克利夫♠盾減半）':'')+(hungerBonus?`（迫切的飢餓：點數 +${hungerBonus}）`: '')+(lp&&lp.quick?(room.cfg.boss&&s===1?'，並群體攻擊兩位挑戰者':halved()?'，並群體攻擊敵方後備':''):'')+note;
  if(suit==='C')return nm+'：預計造成最終傷害 '+finText(r/2,rk)+' 點（已計算易損、守護、減傷、護盾），並使其本回合治療無效'+(C[1]==='heathcliff'&&S[1].shieldSuit==='C'?'（希斯克利夫♣盾仍可恢復一半治療量）':'')+note;
if(suit==='H'&&envActive(room,'emergency'))return nm+'：預計獲得 '+envHeal(room,healingGain(S[0],xichnHeartGain(C[0],S[0],r)))+' 點護盾（急救運轉；可被梅花斷補）'+lucioConversionNote;
if(suit==='H'){const traumaMul=healingFactor(S[0]),raw=envHeal(room,Math.ceil(xichnHeartGain(C[0],S[0],r)*traumaMul)),heartShield=C[1]==='heathcliff'&&S[1].shieldSuit==='H',heal=tidyHp(healedHp(room.hp[s],maxHp(s),heartShield?Math.ceil(raw/2):raw,C[0],S[0])-room.hp[s]);return nm+'：預計回復 '+heal+' 點血量'+(C[0]==='tkt'?'（只補當前血條；原本滿條時改為補回1條、該條1血）':'')+(traumaMul<1?healingNote(S[0])+`（原始 ${r}）`:'')+(heartShield?'（希斯克利夫♥盾減半）':'')+(envActive(room,'allIn')&&+c.slice(1)>=10?'（孤注一擲：回合結束失去5血）':'')+(envActive(room,'kindness')&&heal>0?'（善意：敵方同步回復一半，遵守治療限制）':'')+lucioConversionNote+spiderNote}
  return nm+'：免疫攻擊；若被攻擊，反擊最終傷害 '+finText(r,false)+' 點'+note}
// 每次結算只記錄視覺事件，與血量、命中及回合規則分開。
function addDamageFx(list,rm,seat,amount,member,shield=false){
  amount=tidyHp(amount);if(!Number.isFinite(amount)||amount<=0)return;
  list.push({seat,member:member??(rm.team?rm.act[seat]:-1),amount,shield});
}
const damageFx={pending:[]};
// 回血在實際治療時記錄，保留受傷後補回的生命，不以回合淨增減推測。
function addHealingFx(list,rm,seat,amount,member,source=seat,kind='heal',afterDamage=-1){
  amount=tidyHp(amount);if(!Number.isFinite(amount)||amount<=0)return;
  list.push({seat,member:member===undefined||member<0?(rm.team?rm.act[seat]:-1):member,amount,source,kind,afterDamage});
}
function scheduleHealingFx(events,combat=[]){const counts={};return(events||[]).map(e=>{const key=e.seat+':'+e.member,n=counts[key]||0;counts[key]=n+1;const after=combat.filter(c=>Number.isInteger(c.damageIndex)&&c.damageIndex<=e.afterDamage).reduce((t,c)=>Math.max(t,combatDamageDelay(c)+160),0);return{...e,delay:after+Math.min(600,n*120)}})}
const healingFx={pending:[]};
function flushHealingFx(){
  const events=healingFx.pending.splice(0);if(!events.length)return;
  const targets=Array.from(document.querySelectorAll('[data-damage-target]')),quiet=!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;let layer=document.getElementById('healingFxLayer');
  events.forEach(e=>{const target=targets.find(el=>el.dataset.damageTarget===`${e.seat}:${e.member}`)||targets.find(el=>el.dataset.damageTarget===`${e.seat}:summary`);if(!target)return;
    const rect=target.getBoundingClientRect();if(!rect.width||!rect.height||rect.bottom<0||rect.top>window.innerHeight)return;
    if(!layer){layer=document.createElement('div');layer.id='healingFxLayer';layer.setAttribute('aria-hidden','true');document.body.appendChild(layer)}
    const compact=!target.classList.contains('art-wrap'),size=compact?54:Math.min(window.innerWidth<=650?125:185,rect.width*.88),fx=document.createElement('div');fx.className='healing-pulse'+(compact?' compact':'')+(e.kind==='drain'?' drain':'');
    if(e.kind==='kindness')fx.classList.add('kindness');
    fx.style.cssText=`left:${rect.left+rect.width*.5}px;top:${rect.top+rect.height*(compact?.5:.48)}px;width:${size}px;height:${size}px;--heal-delay:${e.delay}ms`;
    ['healing-bloom','healing-wave','healing-wave second','healing-heart'].forEach(name=>{const node=document.createElement('i');node.className=name;fx.appendChild(node)});
    if(!quiet)for(let n=0;n<(compact?4:window.innerWidth<=650?6:10);n++){const spark=document.createElement('i');spark.className='healing-spark';spark.style.cssText=`--heal-x:${12+n*29%77}%;--heal-y:${38+n*17%49}%;--heal-drift:${(n%2?1:-1)*(6+n%3*5)}px;--heal-rise:${compact?20:35+n%4*12}px;--heal-spark-delay:${n%4*65}ms`;fx.appendChild(spark)}
    layer.appendChild(fx);setTimeout(()=>fx.remove(),e.delay+1150);
  });
}
// 攻擊動畫使用實際傷害紀錄與原角色索引；不從扣血浮字推測攻擊來源。
function addCombatDamage(list,rm,source,damage,start=0,kind='',shieldBefore=0){
  if(!Number.isInteger(source))return;
  damage.slice(start).forEach((e,n)=>{if(e.seat===source)return;const m=rm.team&&rm.team[e.seat]?.[e.member],c=m?m.c:rm.chars[e.seat],s=m?m.st:rm.st[e.seat],max=characterMaxHp(rm,e.seat,c,s);
    list.push({...e,source,sourceMember:rm.team?rm.act[source]:-1,kind:kind==='counter'?'counter':'strike',attackKind:kind,broken:e.shield&&shieldBefore>0&&e.amount>=shieldBefore,power:Math.min(1,e.amount/Math.max(1,max)),damageIndex:start+n});
  });
}
function addCounterGuard(list,rm,source,seat){list.push({source,sourceMember:rm.team?rm.act[source]:-1,seat,member:rm.team?rm.act[seat]:-1,kind:'block',shield:true,amount:0,power:0,broken:false})}
function scheduleCombatFx(events,chars=room?.chars){
  const counts={},returns={},out=[],executions=new Set();
  for(const e of events||[]){
    if(room?.cfg.warden&&e.attackKind==='wardenExecution'){
      const key=e.seat+':'+e.member,beam=!!e.wardenBeam,step=beam?wardenBeamStep(e.executionCount):wardenExecutionStep(e.executionCount),part=executions.has(key);executions.add(key);out.push({...e,fx:beam?'wardenBeam':'wardenExecution',delay:(e.executionHit||0)*step,executionStep:step,executionPart:part});continue;
    }
    const key=e.seat+':'+e.member,nail=!!(room?.cfg.warden&&chars?.[e.source]==='warden'&&e.kind!=='block'&&e.amount>0),previous=out.at(-1);
    // 同一次命中的扣盾與溢出損血共用一根釘子，保留兩筆傷害浮字。
    if(nail&&previous?.fx==='wardenNail'&&previous.source===e.source&&previous.seat===e.seat&&previous.member===e.member&&previous.attackKind===e.attackKind&&previous.shield&&!e.shield&&Number.isInteger(e.damageIndex)&&e.damageIndex===previous.damageIndex+1){out.push({...e,delay:previous.delay,fx:'wardenNail',nailPart:true});continue}
    const n=counts[key]||0;counts[key]=n+1;const delay=Math.max(Math.min(880,n*110),e.kind==='counter'?(returns[e.source+':'+e.seat]||0):0);if(e.kind==='block')returns[e.seat+':'+e.source]=delay+300;
    out.push({...e,delay,...(nail?{fx:'wardenNail'}:{})});
  }
  return out;
}
const WARDEN_EXECUTION={igniteMs:650,fadeMs:500};
const WARDEN_BEAM={travelMs:360,fadeMs:420};
const wardenExecutionStep=count=>Math.max(16,Math.min(80,Math.floor(2400/Math.max(1,count||1))));
const wardenBeamStep=count=>Math.max(8,Math.min(60,Math.floor(2400/Math.max(1,count||1))));
const combatImpactDelay=e=>e.delay+(e.fx==='wardenBeam'?WARDEN_BEAM.travelMs:e.fx==='wardenExecution'?WARDEN_EXECUTION.igniteMs:e.fx==='wardenNail'?WARDEN_NAIL.fallMs:160);
const combatDamageDelay=e=>combatImpactDelay(e)+(e.fx==='wardenNail'?WARDEN_NAIL.damageLag:0);
const combatFx={pending:[],recoils:[],seq:0,beams:new Map(),beamCues:new Map(),beamCueSeen:new Set()};
const combatRecoilFrames=force=>[{translate:'0px 0px'},{translate:`${force}px -1px`,offset:.2},{translate:`${-force*.35}px 0px`,offset:.5},{translate:'0px 0px'}];
function syncCombatRecoil(){const now=Date.now();combatFx.recoils=combatFx.recoils.filter(e=>now<e.at+280);if(!combatFx.recoils.length)return;
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){combatFx.recoils=[];return}
  const targets=Array.from(document.querySelectorAll('[data-damage-target]'));
  combatFx.recoils.forEach(e=>{const target=targets.find(el=>el.dataset.damageTarget===`${e.seat}:${e.member}`),art=target&&(target.querySelector('.fighter-art')||target.querySelector('img'));if(!art?.animate)return;
    const seen=art._combatRecoils||(art._combatRecoils=new Set());if(seen.has(e.id))return;seen.add(e.id);const elapsed=now-e.at,frames=e.nail?[{translate:'0px 0px'},{translate:'0px 5px',offset:.2},{translate:'-2px -1px',offset:.5},{translate:'0px 0px'}]:combatRecoilFrames(e.force),animation=art.animate(frames,{duration:280,delay:Math.max(0,-elapsed),easing:'ease-out'});if(elapsed>0)animation.currentTime=elapsed;
  });
  const quake=combatFx.recoils.find(e=>e.nail&&now<e.at+180),shell=quake&&document.getElementById('app').querySelector?.('.warden-shell');
  if(shell?.animate){const seen=shell._wardenQuakes||(shell._wardenQuakes=new Set());if(!seen.has(quake.at)){seen.add(quake.at);const elapsed=now-quake.at,animation=shell.animate([{translate:'0px 0px'},{translate:'2px 1px',offset:.2},{translate:'-2px -1px',offset:.4},{translate:'1px -1px',offset:.6},{translate:'-1px 0px',offset:.8},{translate:'0px 0px'}],{duration:180,delay:Math.max(0,-elapsed),easing:'ease-out'});if(elapsed>0)animation.currentTime=elapsed}}
}
function flushCombatFx(){
  const events=combatFx.pending.splice(0);if(!events.length)return;
  holdWardenNailHp(events);
  const targets=Array.from(document.querySelectorAll('[data-damage-target]')),find=(seat,member)=>targets.find(el=>el.dataset.damageTarget===`${seat}:${member}`)||targets.find(el=>el.dataset.damageTarget===`${seat}:summary`),quiet=!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let layer=document.getElementById('combatFxLayer');
  events.forEach(e=>{const target=find(e.seat,e.member),source=find(e.source,e.sourceMember);if(!target)return;
    const rect=target.getBoundingClientRect(),sr=source?.getBoundingClientRect();if(!rect.width||!rect.height||rect.bottom<0||rect.top>window.innerHeight)return;
    if(!layer){layer=document.createElement('div');layer.id='combatFxLayer';layer.setAttribute('aria-hidden','true');document.body.appendChild(layer)}
    if(e.fx==='wardenBeam'){if(!e.executionPart)flushWardenBeam(e,layer,rect,sr,quiet);return}
    if(e.fx==='wardenExecution'){if(!e.executionPart)flushWardenExecution(e,layer,rect,target,quiet);return}
    if(e.fx==='wardenNail'){if(!e.nailPart)flushWardenNail(e,layer,rect,target,quiet);return}
    const compact=target.classList.contains('rchip')||!target.classList.contains('art-wrap'),x=rect.left+rect.width*.5,y=rect.top+rect.height*(compact?.5:.46),sx=sr?sr.left+sr.width*.5:x-40,sy=sr?sr.top+sr.height*.46:y,dx=x-sx,dy=y-sy,flight=!quiet&&sr&&sr.bottom>0&&sr.top<window.innerHeight&&Math.hypot(dx,dy)>30,impactAt=e.delay+160,power=e.power>=.22?2:e.power>=.1?1:0,size=compact?48:Math.min(window.innerWidth<=650?112:160,rect.width*.85),color=e.kind==='counter'?'#edd6a0':e.shield?'#a5dcf1':'#f0ead8';
    if(flight){const trail=document.createElement('div');trail.className='combat-flight'+(e.kind==='counter'?' counter':'');trail.style.cssText=`left:${sx}px;top:${sy}px;width:${Math.hypot(dx,dy)}px;--flight-angle:${Math.atan2(dy,dx)}rad;--combat-color:${color};animation-delay:${e.delay}ms`;layer.appendChild(trail);setTimeout(()=>trail.remove(),e.delay+230)}
    const hit=document.createElement('div');hit.className='combat-impact '+(e.shield?'shield-hit':'slash-hit')+(e.broken?' shield-break':'')+(e.kind==='block'?' counter-guard':'')+(e.kind==='counter'?' counter-hit':'')+(compact?' compact':'')+` power-${power}`;
    hit.style.cssText=`left:${x}px;top:${y}px;width:${size}px;height:${size}px;--combat-color:${color};--combat-dir:${dx>=0?1:-1};--impact-delay:${impactAt}ms`;
    const shape=document.createElement('i');shape.className=e.shield?'combat-shield-face':'combat-slash';hit.appendChild(shape);
    const flash=document.createElement('i');flash.className='combat-hit-flash';hit.appendChild(flash);
    if(e.broken){const crack=document.createElement('i');crack.className='combat-shield-crack';hit.appendChild(crack)}
    if(e.kind==='block'){const mark=document.createElement('b');mark.className='combat-counter-mark';mark.textContent='♦';hit.appendChild(mark)}
    if(!quiet)for(let n=0;n<(compact?4:power===2?10:6);n++){const spark=document.createElement('i'),angle=(n*137+23)*Math.PI/180,reach=(compact?18:28+power*12)*(1+n%3*.22);spark.className='combat-hit-spark';spark.style.cssText=`--spark-x:${Math.cos(angle)*reach}px;--spark-y:${Math.sin(angle)*reach}px;--spark-angle:${angle}rad`;hit.appendChild(spark)}
    layer.appendChild(hit);setTimeout(()=>hit.remove(),impactAt+650);
    if(!quiet&&e.kind!=='block')combatFx.recoils.push({id:++combatFx.seq,seat:e.seat,member:e.member,at:Date.now()+impactAt,force:(compact?2:3+power*2)*(dx>=0?1:-1)});
  });
}
function flushWardenNail(e,layer,rect,target,quiet){
  const compact=target.classList.contains('rchip')||!target.classList.contains('art-wrap'),x=rect.left+rect.width*.5,y=rect.top+rect.height*(compact?.5:.62),size=compact?48:Math.min(180,Math.max(100,rect.width*.55),rect.height*.9),impactAt=combatImpactDelay(e),life=WARDEN_NAIL.fallMs+WARDEN_NAIL.holdMs,fx=document.createElement('div');
  fx.className='warden-nail'+(quiet?' quiet':'')+(compact?' compact':'');fx.setAttribute('data-nail-target',`${e.seat}:${e.member}`);
  fx.style.cssText=`left:${x}px;top:${y}px;width:${size}px;height:${size}px;--nail-drop:${y+size+90}px;--nail-start:${e.delay}ms;--nail-impact:${impactAt}ms;--nail-fall:${WARDEN_NAIL.fallMs}ms;--nail-life:${life}ms`;
  fx.innerHTML=`<div class="warden-nail-motion"><div class="warden-nail-angle"><i class="warden-nail-speed"></i><i class="warden-nail-glow"></i><i class="warden-nail-fire"></i><img class="warden-nail-art" src="${esc(WARDEN_NAIL.src)}" alt=""></div></div><i class="warden-nail-wave"></i><i class="warden-nail-wave second"></i><i class="warden-nail-flash"></i>${Array.from({length:quiet?0:8},(_,n)=>`<i class="warden-nail-ember" style="--ember-x:${32+n*13%40}%;--ember-drift:${(n%2?1:-1)*(16+n%3*9)}px;--ember-rise:${32+n%4*13}px;--ember-delay:${n%4*60}ms"></i>`).join('')}`;
  layer.appendChild(fx);setTimeout(()=>fx.remove(),e.delay+life);
  if(!quiet)combatFx.recoils.push({id:++combatFx.seq,seat:e.seat,member:e.member,at:Date.now()+impactAt,nail:true});
}
function flushWardenExecution(e,layer,rect,target,quiet){
  const compact=target.classList.contains('rchip')||!target.classList.contains('art-wrap'),size=compact?54:Math.min(210,rect.width*.8,rect.height*.85),life=WARDEN_EXECUTION.igniteMs+Math.max(0,(e.executionCount||1)-1)*e.executionStep+WARDEN_EXECUTION.fadeMs,fx=document.createElement('div');
  fx.className='warden-execution-cross'+(quiet?' quiet':'');fx.setAttribute('data-execution-target',`${e.seat}:${e.member}`);
  fx.style.cssText=`left:${rect.left+rect.width*.5}px;top:${rect.top+rect.height*(compact?.5:.5)}px;width:${size}px;height:${size*1.4}px;--execution-life:${life}ms;--execution-ignite:${WARDEN_EXECUTION.igniteMs}ms`;
  fx.innerHTML=`<svg class="warden-black-cross" viewBox="0 0 100 140" aria-hidden="true"><path d="M39 8H61V39H91V62H61V132H39V62H9V39H39Z" fill="#02040a" stroke="#244b72" stroke-width="2"/><path d="M47 13H53V46H84V54H53V127H47V54H16V46H47Z" fill="#080e1d"/></svg><div class="warden-blue-flames">${Array.from({length:quiet?4:14},(_,n)=>`<i style="--flame-x:${n<8?40+n%3*7:10+(n-8)*14}%;--flame-y:${n<8?15+Math.floor(n/3)*28:39}%;--flame-delay:${-n*83}ms;--flame-turn:${n%2?12:-12}deg"></i>`).join('')}</div><i class="warden-execution-burst"></i>`;
  layer.appendChild(fx);setTimeout(()=>fx.classList.add('ignited'),WARDEN_EXECUTION.igniteMs);setTimeout(()=>fx.remove(),life);
}
// 兩條相位相反的螺旋依前後深度分段，讓橘紅射線交錯繞過金色光束。
function wardenBeamHelix(front){
  const paths=[[],[]],pitch=160;
  for(let strand=0;strand<2;strand++){let drawing=false;for(let x=-pitch;x<=1160;x+=4){const angle=x/pitch*Math.PI*2+strand*Math.PI,on=(Math.cos(angle)>=0)===front,y=90+Math.sin(angle)*66;
    if(on){paths[strand].push(`${drawing?'L':'M'}${x},${y.toFixed(2)}`);drawing=true}else drawing=false}}
  return paths;
}
function wardenBeamArt(){
  const gradient=`wardenBeamGold${++combatFx.seq}`;
  const rays=front=>wardenBeamHelix(front).map((d,n)=>`<path class="warden-beam-ray strand-${n}" d="${d.join(' ')}"/>`).join('');
  return `<svg class="warden-beam-art" viewBox="0 0 1000 180" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${gradient}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ee9d0d"/><stop offset=".25" stop-color="#ffda32"/><stop offset=".5" stop-color="#fff9bd"/><stop offset=".75" stop-color="#ffd92d"/><stop offset="1" stop-color="#ef9b0b"/></linearGradient></defs><g class="warden-beam-helix behind">${rays(false)}</g><rect class="warden-beam-gold" x="0" y="53" width="1000" height="74" rx="37" fill="url(#${gradient})"/><path class="warden-beam-core" d="M18 90H1000"/><g class="warden-beam-helix front">${rays(true)}</g></svg><i class="warden-beam-tip"></i>`;
}
function flushWardenBeam(e,layer,rect,sr,quiet){
  const tx=rect.left+rect.width*.5,ty=rect.top+rect.height*.5,sx=sr?sr.left+sr.width*.5:tx+(tx<window.innerWidth/2?240:-240),sy=sr?sr.top+sr.height*.5:ty,dx=tx-sx,dy=ty-sy,length=Math.max(40,Math.hypot(dx,dy)),thickness=Math.min(160,Math.max(80,rect.height*.45)),life=WARDEN_BEAM.travelMs+Math.max(0,(e.executionCount||1)-1)*e.executionStep+WARDEN_BEAM.fadeMs,fx=document.createElement('div');
  fx.className='warden-beam'+(quiet?' quiet':'');fx.setAttribute('data-beam-target',`${e.seat}:${e.member}`);fx.setAttribute('data-beam-skill',e.wardenBeam);
  fx.style.cssText=`left:${sx}px;top:${sy}px;width:${length}px;height:${thickness}px;--beam-angle:${Math.atan2(dy,dx)}rad;--beam-life:${life}ms;--beam-travel:${WARDEN_BEAM.travelMs}ms;--beam-pitch:160px`;
  const waves=Math.min(16,e.executionCount||1),span=Math.max(0,(e.executionCount||1)-1)*e.executionStep;
  const shocks=Array.from({length:waves},(_,n)=>{const delay=WARDEN_BEAM.travelMs+(waves>1?Math.round(n*span/(waves-1)):0);return `<i class="warden-beam-shock" style="--beam-shock-delay:${delay}ms"></i><i class="warden-beam-shock echo" style="--beam-shock-delay:${delay+55}ms"></i>`}).join('');
  fx.innerHTML=`<div class="warden-beam-wave">${wardenBeamArt()}</div><div class="warden-beam-shocks" style="--beam-shock-size:${thickness*1.25}px">${shocks}</div>`;layer.appendChild(fx);
  const timers=new Set(),later=(fn,ms)=>{const timer=setTimeout(()=>{timers.delete(timer);fn()},ms);timers.add(timer)};combatFx.beams.set(fx,timers);
  later(()=>fx.classList.add('contact'),WARDEN_BEAM.travelMs);later(()=>{fx.remove();combatFx.beams.delete(fx)},life);
}
function syncWardenBeamQuake(){
  const now=Date.now(),quiet=!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,fx=quiet?null:Array.from(combatFx.beamCues.values()).find(f=>now>=f.contactAt&&now<f.quakeUntil);
  document.body?.setAttribute('data-warden-beam-quake',fx?'on':'');if(fx)document.body?.style.setProperty('--beam-shake-age',`${fx.contactAt-now}ms`);
}
function startWardenBeamCues(combat,L){
  const e=combat.find(e=>e.fx==='wardenBeam');if(!e)return;
  const key=`${code}:${room.roundBase||1}:${L.round??room.round}:${e.wardenBeam}`;if(combatFx.beamCueSeen.has(key))return;combatFx.beamCueSeen.add(key);
  const count=e.executionCount||1,contactAt=Date.now()+WARDEN_BEAM.travelMs,span=Math.max(0,count-1)*e.executionStep,fx={contactAt,quakeUntil:contactAt+span+180,soundTimers:new Set()};combatFx.beamCues.set(key,fx);preloadWardenCue(WARDEN_SOUND.attack);
  const bursts=Math.min(24,count);for(let n=0;n<bursts;n++){const hit=bursts>1?Math.round(n*(count-1)/(bursts-1)):0;queueWardenCue(fx,WARDEN_SOUND.attack,contactAt+hit*e.executionStep,2944,n===0?.55:.18)}
  queueWardenFinalTimer(fx,syncWardenBeamQuake,WARDEN_BEAM.travelMs);queueWardenFinalTimer(fx,syncWardenBeamQuake,WARDEN_BEAM.travelMs+span+180);
  queueWardenFinalTimer(fx,()=>{stopWardenCues(fx);combatFx.beamCues.delete(key);syncWardenBeamQuake()},WARDEN_BEAM.travelMs+span+3000);
}
function stopWardenBeams(){combatFx.beams.forEach((timers,fx)=>{timers.forEach(clearTimeout);fx.remove()});combatFx.beams.clear();combatFx.beamCues.forEach(stopWardenCues);combatFx.beamCues.clear();combatFx.beamCueSeen.clear();document.body?.setAttribute('data-warden-beam-quake','')}
function flushDamageFx(){
  const events=damageFx.pending.splice(0);if(!events.length)return;
  const targets=Array.from(document.querySelectorAll('[data-damage-target]')),counts={};
  events.forEach(e=>{
    const key=`${e.seat}:${e.member}`,target=targets.find(el=>el.dataset.damageTarget===key)||targets.find(el=>el.dataset.damageTarget===`${e.seat}:summary`);
    if(!target)return;const rect=target.getBoundingClientRect();if(!rect.height||(!rect.width&&!target.classList.contains('art-wrap')))return;
    let layer=document.getElementById('damageFxLayer');
    if(!layer){layer=document.createElement('div');layer.id='damageFxLayer';layer.setAttribute('aria-hidden','true');document.body.appendChild(layer)}
    const n=counts[key]||0;counts[key]=n+1;
    const pop=document.createElement('div');pop.className='damage-pop'+(e.healing?' healing':e.shield?' shield':'')+(target.classList.contains('rchip')?' compact':'');
    pop.textContent=(e.healing?'＋':'−')+e.amount;
    if(e.healing){const label=document.createElement('small');label.textContent=e.kind==='drain'?'吸血':e.kind==='kindness'?'善意':'回血';pop.appendChild(label)}
    if(e.environment){const label=document.createElement('small');label.textContent=environmentInfo(e.environment).n;pop.appendChild(label)}
    if(e.shield){const label=document.createElement('small');label.textContent='護盾';pop.appendChild(label)}
    pop.style.left=Math.max(30,Math.min(window.innerWidth-30,rect.left+rect.width*.5+(n%3-1)*28))+'px';
    pop.style.top=Math.max(70,rect.top+rect.height*.42)+'px';
    const delay=Number.isFinite(e.delay)?e.delay:n*160;pop.style.animationDelay=delay+'ms';
    if(['thorns','allIn'].includes(e.environment)){const pulse=document.createElement('div');pulse.className='environment-cost-pulse env-cost-'+e.environment;pulse.style.cssText=`left:${rect.left+rect.width*.5}px;top:${rect.top+rect.height*.5}px;width:${Math.min(170,rect.width)}px;height:${Math.min(170,rect.height)}px;--cost-delay:${delay}ms`;pulse.innerHTML=e.environment==='thorns'?'<svg viewBox="0 0 100 100"><path d="M15 55Q18 15 50 22T82 55T45 80T15 55 M24 35l-8-13m34 0 6-12m24 35 13-6M65 78l5 13m-41-19-10 9"/></svg>':environmentEmblem('allIn');layer.appendChild(pulse);setTimeout(()=>pulse.remove(),1100+delay)}
    layer.appendChild(pop);if(e.cinematic&&wardenEndingFx)queueWardenFinalTimer(wardenEndingFx,()=>pop.remove(),1200+delay);else setTimeout(()=>pop.remove(),1200+delay);
  });
}
const hpAnim={};
function holdWardenNailHp(combat){
  holdWardenExecutionHp(combat);
  if(!room?.cfg.warden)return;const targets=new Map();
  for(const e of combat){if(e.fx!=='wardenNail'||e.shield||room.team&&room.act[e.seat]!==e.member)continue;const t=targets.get(e.seat)||{amount:0,delay:0};t.amount+=e.amount;t.delay=Math.max(t.delay,combatDamageDelay(e));targets.set(e.seat,t)}
  targets.forEach((t,i)=>{const c=room.chars[i],m=maxHp(i),to=Math.max(0,room.hp[i]);if(!hpAnim[i]||hpAnim[i].c!==c)hpAnim[i]={v:Math.min(m,to+t.amount),to,m,c};hpAnim[i].waitUntil=Math.max(hpAnim[i].waitUntil||0,Date.now()+t.delay)});
}
function holdWardenExecutionHp(combat){
  if(!room?.cfg.warden)return;const targets=new Map(),shields=new Map(),now=Date.now();
  for(const e of combat){if(!['wardenExecution','wardenBeam'].includes(e.fx)||e.hpScheduled)continue;e.hpScheduled=true;if(!e.amount||room.team&&room.act[e.seat]!==e.member)continue;const list=e.shield?e.fx==='wardenBeam'?shields:null:targets;if(!list)continue;const steps=list.get(e.seat)||[];steps.push({at:now+combatDamageDelay(e),amount:e.amount});list.set(e.seat,steps)}
  targets.forEach((steps,i)=>{const c=room.chars[i],m=maxHp(i),to=Math.max(0,room.hp[i]),before=to+steps.reduce((n,e)=>n+e.amount,0),a=hpAnim[i];if(!a||a.c!==c)hpAnim[i]={v:before,to,m,c};const state=hpAnim[i];state.v=before;state.to=to;state.executionSteps=steps.sort((a,b)=>a.at-b.at);delete state.waitUntil});
  shields.forEach((steps,i)=>{const c=room.chars[i],to=room.st[i].shield||0;if(!hpAnim[i]||hpAnim[i].c!==c)hpAnim[i]={v:room.hp[i],to:room.hp[i],m:maxHp(i),c};hpAnim[i].beamShield={member:room.act[i],v:to+steps.reduce((n,e)=>n+e.amount,0),to,steps:steps.sort((a,b)=>a.at-b.at)}});
}
function wardenShownShield(i){const shield=hpAnim[i]?.beamShield;return shield&&shield.member===room.act[i]?shield.v:room.st[i].shield||0}
function applyHp(){document.querySelectorAll('[data-bar]').forEach(el=>{const a=hpAnim[+el.dataset.bar];if(a)el.style.width=Math.min(100,a.v/a.m*100)+'%'});
  document.querySelectorAll('[data-hptext]').forEach(el=>{const i=+el.dataset.hptext,a=hpAnim[i];if(a)el.textContent=(wardenJudgmentPending()&&i!==1?Number(a.v.toFixed(4)):a.c==='tkt'?tidyHp(a.v===a.to?a.v:Math.round(a.v*10)/10):Math.round(a.v))+' / '+a.m});
  if(room?.cfg.warden)document.querySelectorAll('[data-beam-shield]').forEach(el=>{const shield=wardenShownShield(+el.dataset.beamShield);el.hidden=shield<=0;const value=el.querySelector('strong');if(value)value.textContent=shield})}
function stepHp(){hpAnim.raf=0;let go=false;Object.keys(hpAnim).forEach(k=>{const a=hpAnim[k];if(typeof a!=='object')return;const d=a.to-a.v;
  if(a.beamShield){const shield=a.beamShield;if(shield.member!==room?.act?.[k])delete a.beamShield;else{while(shield.steps.length&&shield.steps[0].at<=Date.now())shield.v=Math.max(shield.to,shield.v-shield.steps.shift().amount);if(shield.steps.length)go=true;else delete a.beamShield}}
  if(a.executionSteps){while(a.executionSteps.length&&a.executionSteps[0].at<=Date.now())a.v=Math.max(a.to,a.v-a.executionSteps.shift().amount);if(a.executionSteps.length){go=true;return}delete a.executionSteps;go=true;return}
  if(a.waitUntil&&Date.now()<a.waitUntil){go=true;return}delete a.waitUntil;
  if(Math.abs(d)>0.05){a.v+=Math.sign(d)*Math.max(0.12,Math.abs(d)*0.06);if((a.to-a.v)*d<0)a.v=a.to;go=true}else a.v=a.to});
  applyHp();if(go)hpAnim.raf=requestAnimationFrame(stepHp)}
function animHp(){if(!room||!room.hp)return;room.hp.forEach((h,i)=>{const to=Math.max(0,h),m=maxHp(i),c=room.chars&&room.chars[i],a=hpAnim[i];
  if(!a||a.c!==c)hpAnim[i]={v:to,to,m,c};else{a.to=to;a.m=m}});applyHp();if(!hpAnim.raf)hpAnim.raf=requestAnimationFrame(stepHp)}
function skillLabel(s){const c=room.chars[s];if(envSilent(room)||(room.st[s].sealT||0)>0)return'';if(teaClubAvailable(room,s))return'綻放E.G.O::山茶花（轉為梅花）';if(c==='drunk'&&!(room.st[s].drunkCd>0))return'酌酒';if(c==='card_ish'&&(room.st[s].light||0)>=5)return'光斬';if(c==='rufo'&&room.st[s].rufoReady)return`爆裂呈現（第${(room.st[s].rufoSkillUses||0)+1}次）`;if(c==='sinclair'&&(room.st[s].endlessHunger||0)>=40&&!room.st[s].laCastrationUsed)return'La Castration';if(c==='yoshi'&&handCount(s)>=2&&!(room.st[s].yoshiCd>0))return'天殺';
  if(c==='bamboo'){const card=sunCardSel?privateSunCards.find(x=>x.id===sunCardSel)?.card:sel;return bambooCanSkin(room.st[s],card)?'捨吾皮肉':''}
  if(c==='shi_faust')return room.st[s].bow?'放矢（取消拉弓）':'拉弓';
  if(c==='san'&&room.st[s].feast>=5)return'血宴強化'+(room.st[s].feast>=10?'・二階':'・一階');
  if(c==='mat'&&room.st[s].wrap>=3&&matTarget(room,s,room.hp)>=0)return'萊萬汀';return''}
function plantsUI(s){if(envSilent(room)||!room.team||!room.pair.includes(s)||(room.st[s].stun||0)>0||(room.st[s].sealT||0)>0)return'';const w=room.team[s].find(m=>m.c==='wood'&&!m.dead),sun=room.team[s].find(m=>m.c==='sunflower'&&!m.dead),out=[];
  if(w&&(w.st.torchUses||0)>0&&room.st[s].torchRound!==room.round)out.push(`<button onclick="activateTorch()">🔥 火炬（剩${w.st.torchUses}次，本回合點數×2）</button>`);
  if(sun&&(sun.st.sun||0)>=4)out.push(`<label>☀ 陽光×${sun.st.sun} <select onchange="sunSuitPick=this.value">${['S','C','H','D'].map(x=>`<option value="${x}" ${x===sunSuitPick?'selected':''}>${SU[x]}</option>`).join('')}</select><button ${sunPending?'disabled':''} onclick="activateSun()">${sunPending?'取得中…':'消耗4陽光，取得7點暫時手牌'}</button></label>`);
  return out.length?`<div class="row" style="justify-content:center">${out.join('')}</div>`:''}
const askGap=s0=>s0.xinTiangang?1:2;
function askUI(s){if(envSilent(room)||room.chars[s]!=='jia_qiu'||room.round<(room.st[s].askReadyRound||0)||!room.pair.includes(s)||(room.st[s].stun||0)>0||(room.st[s].sealT||0)>0)return'';return`<div class="row" style="justify-content:center"><span>賈丘【問】：</span>${['S','C','H','D'].map(x=>`<button onclick="askJia('${x}')">問對方 ${SU[x]} 有幾張</button>`).join('')}<button onclick="askJia('max')">問對方最大點數</button></div>`}
function askJia(kind){if(isoPending()||valorantShopPending()||mirrorPending()||environmentTradePending())return;const s=rd();db.doc(`rooms/${code}/moves/q${room.round}_${s}`).set({kind})}
function answerJia(){if(isoPending()||valorantShopPending()||mirrorPending())return;const s=rd(),v=document.getElementById('jiaAnswer')?.value;if(v!==undefined)db.doc(`rooms/${code}/moves/a${room.round}_${s}`).set({answer:String(v).trim()})}
function dihuiUI(s){if(envSilent(room)||room.chars[s]!=='dihui'||!room.pair.includes(s))return'';const v=room.st[s].dihuiNext;return`<div class="row" style="justify-content:center"><span>選擇下回合效果：</span><button class="${v==='forward'?'sel':''}" onclick="chooseDihui('forward')">➡️ 順行－憐憫</button><button class="${v==='reverse'?'sel':''}" onclick="chooseDihui('reverse')">⬅️ 逆行－憎惡</button>${v?'<span class="mut">已設定</span>':''}</div>`}
function chooseDihui(kind){if(isoPending()||valorantShopPending()||mirrorPending())return;const s=rd();db.doc(`rooms/${code}/moves/h${room.round}_${s}`).set({kind})}
function canMosesBreath(r,i,kind){const B=MOSES_BREATHS[kind],s=r?.st?.[i];
  if(!Object.hasOwn(MOSES_BREATHS,kind)||!B||!s||r.status!=='playing'||r.phase!=='play'||r.chars[i]!=='moses'||!r.pair.includes(i)||r.pair.some(j=>r.hp[j]<=0)||r.hp[i]<=0||s.sealT>0||s.stun>0||s.san<=-45||envSilent(r)||mirrorPending(r)||environmentTradePending(r)||d25DrawPending(r)||!timeActionOpen(r,i))return false;
  if((kind==='crimson')!==!!s.smokeCrimson||s.crimsonBreathRound===r.round)return false;
  const smoke=s.smoke||newSmoke();return B.colors.every(color=>(smoke[color]||0)>=(color==='crimson'?20:6));
}
function mosesBreathUI(i){if(room.chars[i]!=='moses'||!room.pair.includes(i)||envSilent(room)||room.st[i].sealT>0||room.st[i].stun>0)return'';
  const s=room.st[i],smoke=s.smoke||newSmoke(),colors=s.smokeCrimson?['crimson']:['red','purple','white'],options=Object.entries(MOSES_BREATHS).filter(([kind])=>canMosesBreath(room,i,kind));
  return`<div class="moses-breaths"><div class="moses-smoke">${colors.map(color=>`<span data-smoke="${color}">煙霧-${SMOKE_NAMES[color]} <b>${smoke[color]}/${color==='crimson'?20:6}</b></span>`).join('')}</div><div class="row">${options.map(([kind,B])=>`<button type="button" onclick="useMosesBreath('${kind}')" title="${esc(B.d)}">${B.n}</button>`).join('')}</div><small class="mut">${s.crimsonBreathRound===room.round?'吐息-深紅已準備：本回合先於萊萬汀斬殺對手。':options.length?'選擇吐息；混合吐息每色各消耗6層。對手已出牌時會退回。':s.smokeCrimson?'累積20層深紅煙霧後可準備斬殺。':'各色集滿6層可使用吐息，可同時消耗多色發動混合吐息。'}</small></div>`;
}
function useMosesBreath(kind){const seat=rd();if(!canMosesBreath(room,seat,kind)||moves[room.round+'_'+seat])return;
  const req={type:'mosesBreath',uid,seat,round:room.round,roundBase:room.roundBase,seq:room.st[seat].smokeSeq||0,kind};
  if(test||isHost)acceptMosesBreath(null,req);else if(hostConn)hostConn.send({privateRequest:req});
}
function acceptMosesBreath(cn,req){
  if(!isHost||!room||!req||!Number.isInteger(req.seat)||!canMosesBreath(room,req.seat,req.kind))return false;
  if(test?!!cn:((cn?cn.uid:uid)!==req.uid||room.seats[req.seat]?.id!==req.uid))return false;
  const i=req.seat;if(req.round!==room.round||req.roundBase!==room.roundBase||req.seq!==(room.st[i].smokeSeq||0)||moves[room.round+'_'+i]||busy===room.phase+room.round||busy.startsWith('instant_')||busy.startsWith('u25_'))return false;
  const r=JSON.parse(JSON.stringify(room)),s=r.st[i],B=MOSES_BREATHS[req.kind],o=battleOpponent(r,i),L=[`${r.seats[i].name} 發動【${B.n}】`],healing=[];
  s.smoke=s.smoke||newSmoke();B.colors.forEach(color=>s.smoke[color]-=color==='crimson'?20:6);s.smokeSeq=(s.smokeSeq||0)+1;
  const buff=(seat,k,n,t)=>{r.st[seat].fx=(r.st[seat].fx||[]).concat({k,n,t,source:'moses'});L.push(`${r.seats[seat].name} 獲得${n}層${k==='s'?'強壯':'虛弱'}（${t}回合）`)};
  const sanity=(seat,n)=>{if(CHARS[r.chars[seat]]?.f!=='bus'||r.chars[seat]==='verg')return;const before=r.st[seat].san||0;r.st[seat].san=Math.max(sanityMin(r,seat),Math.min(45,before+n));L.push(`${r.seats[seat].name} 理智${n>0?'+':''}${r.st[seat].san-before}（${r.st[seat].san}）`)};
  if(B.strong)buff(i,'s',B.strong,B.strongTurns);if(B.weak)buff(o,'w',B.weak,B.weakTurns);
  if(B.selfSan)sanity(i,B.selfSan);if(B.enemySan)sanity(o,B.enemySan);
  if(B.heal){const before=r.hp[i],n=envHeal(r,healingGain(s,B.heal));r.hp[i]=healedHp(before,characterMaxHp(r,i,'moses',s),n,'moses',s,L,r.seats[i].name);addHealingFx(healing,r,i,r.hp[i]-before);shareEnvironmentHealing(r,i,r.hp[i]-before,L,healing);L.push(`${r.seats[i].name} 回復${r.hp[i]-before}點生命${healingNote(s)}`)}
  if(req.kind==='crimson'){s.crimsonBreathRound=r.round;L.push('【吐息-深紅】已準備，本回合結算時先於萊萬汀斬殺對手')}
  const lock=`instant_${r.round}_${i}`;busy=lock;
  try{returnBattleMoves(r,i,L);syncEnvironmentTeam(r);r.sLog=[...(r.sLog||[]),...L];r.instantFx={id:(r.instantFx?.id||0)+1,seat:i,hits:[],chars:[...r.chars],damage:[],combat:[],healing,log:L};save(r)}finally{if(busy===lock)busy=''}
  tick();return true;
}
const rufoTaskSuit={S:'♠擊中',D:'♦反擊',H:'♥回血',C:'♣斷補'};
const cpOf=i=>(room.cp&&room.cp[i])||0;
// 絕技群體效果依模式分辨敵我，並涵蓋存活的出戰與後備角色。
function forD25Side(r,i,allied,apply){const allies=r.cfg.boss&&i!==1?[0,2]:[i],seats=r.seats.map((_,j)=>j).filter(j=>allied?allies.includes(j):!allies.includes(j));
  seats.forEach(j=>{if(r.hp[j]>0)apply(j,-1,r.chars[j],r.st[j]);if(r.team)r.team[j].forEach((m,k)=>{if(k!==r.act[j]&&!m.dead&&m.hp>0)apply(j,k,m.c,m.st)})})}
function cpBar(i){const k=room.chars&&room.chars[i];if(!k||!CHARS[k]||!room.st)return'';
  const has=CHARS[k].f==='trails'||(room.team&&room.team[i].some(m=>!m.dead&&CHARS[m.c].f==='trails'));if(!has)return'';
  const cp=Math.min(200,cpOf(i));return`<div class="cpt">CP ${cp} / 200${CHARS[k].f==='trails'?'':'（隊伍保留）'}</div><div class="bar cpbar"><i style="width:${cp/2}%"></i></div>`}
function environmentStatusTxt(i){const s=room.st?.[i],U=room.env?.ultimatums?.[i];if(!s)return'';return (room.env?.advances?.[i]||[]).map(a=>`<span title="自己出戰三次後回復10點生命；換人保留，旁觀不倒數。">🩸預支・剩${a.left}次出戰</span>`).join('　')+(s.bombs||[]).map(b=>`<span title="持有角色出戰才倒數，後備及旁觀暫停；傳遞不重置倒數。">💣炸彈剩${b.left}次出戰</span>`).join('　')+(U?`<span title="兩次自己出戰內未打出標記牌，失去4點生命。">📜最後通牒 ${cs(U.card)}・剩${U.left}次出戰</span>`:'')}
function stTxt(i){if(!room.st)return'';if(envSilent(room))return environmentStatusTxt(i)+'<span title="主動技、被動、陣營與附加狀態暫停；既有狀態保留，持續時間不扣減，仍可正常出牌。">🔇沉默：特殊效果暫停</span>';const c=room.chars[i],st=room.st[i],o=[],tip=(icon,label,detail)=>`<span title="${esc(detail)}">${icon}${label}</span>`;
  if(environmentStatusTxt(i))o.push(environmentStatusTxt(i));if(wardenStatusTxt(i))o.push(wardenStatusTxt(i));
  if(c==='iso'){o.push(tip('🎯','離索技能',Object.entries(ISO_SKILLS).map(([k,S])=>`${S.n} ${st.isoSkills?.[k]||0}/1`).join('；')));if(st.isoDual)o.push(tip('🛡️','雙源1',`抵擋一次傷害，不可疊加。${st.isoDualRefresh?'雙方互攻後仍可刷新一次。':'本次技能的刷新已使用。'}`));else if(st.isoDualRefresh)o.push(tip('🔄','雙源待刷新','雙方同時攻擊且存活時，回合結束補回一層；每次技能最多一次。'));if(st.isoAdapt)o.push(tip('🕊️','應變','本回合雙方黑牌攻擊傷害為0，反擊及技能追擊照常。'))}
  if(st.isoCut)o.push(tip('🎯','削減','本回合受到傷害×1.5。'));
  if(isValorant(c)){const g=valorantGun(c,st);o.push(tip('💰',`經濟 ${room.valorantEconomy?.[i]?.credits||0}`,'經濟可於回合開始前的商店購買槍械與槍護盾。')+tip('🔫',g?g.n:'無槍械',g?g.d:'下回合開始獲得制式手槍。')+(st.gunShield?tip('🛡️','槍護盾×1','下次受到黑桃、梅花或方塊傷害時，消耗護盾保留槍械；不減少傷害。'):''))}
  if(c==='moses'){const smoke=st.smoke||newSmoke();(st.smokeCrimson?['crimson']:['red','purple','white']).forEach(color=>o.push(tip('🌫️',`煙霧-${SMOKE_NAMES[color]} ${smoke[color]}/${color==='crimson'?20:6}`,color==='crimson'?'任何花色出牌時依基本點數累積，無須成功；每回合開始增加1層，上限20；不含點數加成或倍率。消耗20層準備吐息-深紅，本回合先於萊萬汀斬殺。':`對應花色只要出牌即依基本點數累積，每回合開始再增加1層，不含點數加成或倍率，上限6；吐息消耗此色6層，混合吐息每色各消耗6層。${color==='red'?'對應♠與♣出牌。':color==='purple'?'對應♦出牌。':'對應♥出牌。'}`)));if(st.crimsonBreathRound===room.round)o.push(tip('🔴','吐息-深紅已準備','本回合結算時先於萊萬汀斬殺對手，仍遵守天殺與斬殺防護規則。'))}
  if(c==='bamboo')o.push(tip('⚔️','捨吾皮肉',`${st.bambooAny?'任何黑牌':'基礎點數10以上的黑牌'}可選擇特殊攻擊，命中固定3點，不附原黑牌效果；被方塊成功反擊且存活時，斷汝筋骨連斬4次，每擊基礎4點，逐擊結算，不限次。`)+tip('🛡️',`毅力×${st.res||0}`,'開局持有1層毅力；受到一般致命傷害時消耗1層，生命保留1點。斬殺無法阻擋，耗盡後不再保命。')+(st.bambooAny?tip('💥','大爆捨','永久解除捨吾皮肉的黑牌點數限制。'):'')+(st.bambooEgo?tip('🌸','綻放ego::金笠','斷汝筋骨永久改為全體敵人含後備的群體攻擊，常駐強壯1。'):''));
  if(c==='firefu')o.push(tip('🔥',st.firefuThirst?'渴火・唯一暗牌':`紅艷煞・第${st.firefuTurns||0}次上場`,st.firefuThirst?'牌面固定10點，仍吃點數加成；每次補回隨機花色，永久暗牌，停止燒牌。':'從第2次自己上場開始，每隔一次上場燒掉1張手牌及卡槽，最大生命-2、永久強壯+2；後備及旁觀不計次數。')+tip('💪',`毅力×${st.res||0}`,'致命傷害消耗1層並保留1點生命；開局1層，紅艷煞絕技額外1層，斬殺無法阻擋。')+tip('♨️',`已燒牌${st.firefuBurned||0}次`,'燒牌所得永久強壯保留；紅艷煞絕技恢復卡槽與最大生命。'));
  if(c==='lucio')o.push(tip('📚',`教材${st.lucioLesson||0}${st.lucioHeart?'（無上限）':'/3'}`,`有教材時，基礎點數不足5的牌轉為${st.lucioHeart?8:5}+教材層數；轉換後可拼點。`)+tip('⚔️',`搖搖欲墜的姿勢・強壯${st.lucioStrong||0}`, '雙方出黑牌且盧西奧點數至少5時拼點；拼點+目標原有高潮，當回合強壯為原有高潮÷2向上取整；本次新增不計加成。')+(st.lucioDespair?tip('🤝','絕望的決鬥','友軍含後備有瓦倫希娜：初始生命及上限×0.8、教材1、自己上場3回合的虛弱1；真正倒下後友軍瓦倫希娜獲得心-不光彩。'):''));
  if(st.duelClimax>0)o.push(tip('🔥',`決鬥高潮${st.duelClimax}/6`,'永久保留於此角色，換人不消失；盧西奧對你拼點時獲得點數與當回合強壯，解鹿對你造成4×此層數的基礎傷害。'));
  if(c==='val'&&st.valDishonor)o.push(tip('💔','心-不光彩','友軍盧西奧真正倒下後獲得的永久被動：強壯1。'));
  if(c==='yisang')o.push(tip('🪞',st.mirrorSearch?'鏡世界搜索':'鏡世界觀測',`每三個全局回合出牌前${st.mirrorSearch?'從完整可用事件清單自選':'從4個不同的隨機場地事件中選1個'}；存活的後備及旁觀李箱也會觸發，選擇期間全員停止行動與倒數。`));
  if(st.mirrorHp&&room.hp[i]>maxHp(i))o.push(tip('🪞','強制平等・超額生命','目前血量可超過生命上限；超額生命保留至受到傷害，普通治療不增加或削減超額生命。'));
  if(c==='leo'&&room.team)o.push(tip('👥',`存活分身×${room.team[i].filter((m,k)=>m.c==='leoc'&&(k===room.act[i]?room.hp[i]>0:!m.dead&&m.hp>0)).length}`,'分身各有5點生命，不具劍帝被動；可換上作戰。'));
  if(st.laDemande)o.push(tip('🔥','la demande（永久）','自身出戰且存活時，每回合結束對目前對戰的敵方角色追加基礎3點單方面追擊；並隨機附加1層虛弱或易損，每層各自持續3回合。'));
  if(diamondBanned(room,i))o.push(tip('🚫','禁出方塊','連續兩回合出方塊且未反擊成功，本回合無法出方塊牌！'));
  else if(st.dDefFail===1&&!(c==='sad'&&!(st.sealT>0)))o.push(tip('🛡️','空防×1','已連續 1 回合出方塊未反擊成功；若本回合再次出方塊未反擊，下回合無法出方塊牌！'));
  if(room.cfg.boss&&i!==1)o.push(tip('🤝','挑戰者',room.cfg.warden?'與另一位挑戰者互為友軍。':'與另一位挑戰者互為友軍；基礎生命值為房主設定生命值的1.5倍。'));
  if(c==='heathcliff'&&st.shieldSuit)o.push(tip('🛡',`${SU[st.shieldSuit]}盾`,`本回合的${SU[st.shieldSuit]}盾：${{C:'被梅花斷補時仍恢復原治療量的一半。',S:'受到黑桃傷害減半。',D:'受到方塊反擊傷害減半。',H:'對手的治療量減半。'}[st.shieldSuit]}`));if(c==='heathcliff')o.push(tip('⚰',`棺×${st.coffin||0}/7`,'對手未打出與本回合盾相同花色的牌時，棺+1；每滿7層獲得1層毅力。')+'　'+tip('💪',`毅力×${st.will||0}`,'受到一般致命傷害時消耗1層毅力並鎖血至1點；斬殺無法阻擋。')+(st.dullahan?tip('🐎','杜拉罕','永久使自身對敵人的攻擊傷害成為群體攻擊，含反擊與敵方後備；各目標分別結算護盾與減傷。'):''));
  if(c==='jia_qiu')o.push(tip('🧠',st.notExpecting?'不再期待'+(st.timeUpTurns>0?`（剩${st.timeUpTurns}回合）`:''):'期待×'+(st.expectation||0),st.notExpecting?'獲得20層強壯。'+(st.timeUpTurns>0?'時間到結束後解除此狀態並恢復3層期待。':''):'回答賈丘問題錯誤時期待減少1；降至0時轉為不再期待並獲得20層強壯。')+(st.egoStanding?tip('🌸','綻放EGO：而立','強壯+1；♠/♣攻擊♥，或♦攻擊♠/♣時，單方面傷害+2。'):'')+tip('❓',(st.sealT>0||st.stun>0)?'問不可用':room.round>=(st.askReadyRound||0)?'問可用':'問冷卻',`每${askGap(st)===1?'':'兩'}回合可在雙方出牌前詢問一次對手手牌中的花色張數或最大點數。`)+(st.xinTiangang?tip('💖','心-天罡星','永久使問每回合可用一次；發動時若沒有不再期待，期待降為1層。'):''));
  if(c==='card_ish')o.push(tip('🔷',`組札－${SU[st.ishSet]||'待設定'}${st.dualColor&&st.ishExtra?'／'+SU[st.ishExtra]:''}`,`第一回合以最多的手牌花色設定。出任一組札花色獲得1層光；出其他花色時原組札改為該花色。`)+(st.dualColor?tip('🎨','雙色','每回合額外隨機一種與原組札不同的花色；兩種組札花色皆可獲得光。'):'')+tip('✨',`光×${st.light||0}/5`,'光最多5層；光斬消耗5層光，回合結束連擊5次，每擊基礎傷害4點，逐擊結算。')+(st.ishSlashPending?tip('⚡','光斬待發','本回合結束對敵方出戰角色連擊5次，每擊基礎傷害4點。'):''));
  if(c==='rufo'){const tasks=st.rufoTasks||{},taskTxt=st.rufoQuest?`重啟任務：${rufoTaskSuit[st.rufoQuest]}（${tasks[st.rufoQuest]?'完成':'待完成'}）`:st.rufoReady?'任務完成':Object.keys(rufoTaskSuit).map(k=>`${rufoTaskSuit[k]}${tasks[k]?'✓':'○'}`).join('、');o.push(tip('🐺',`野獸派－狼面×${st.rufoWolf||0}`,'每層狼面提供1層強壯；攻擊命中時使目標獲得1層流血。')+'　'+tip('🎭',st.rufoReady?`爆裂呈現可用（第${(st.rufoSkillUses||0)+1}次）`:taskTxt,`花色任務：${taskTxt}。首次完成任意三項後獲得狼面並解鎖爆裂呈現；使用後會隨機指定一項任務，完成後重新解鎖。`)+tip('🔢',`爆裂呈現已使用${st.rufoSkillUses||0}次`,'爆裂呈現每擊基礎傷害依累計使用次數計算；展現可直接增加3次。')+(st.rufoColor?tip('🎨','著色（群體攻擊）','永久使爆裂呈現的每一擊攻擊全體敵人與後備；一般模式或敵方只剩一名可出戰角色時效果翻倍。'):'')+(st.rufoBlastPending?tip('💥','爆裂呈現待發',`本次戰鬥開始時先造成4連擊${st.rufoColor?'群體攻擊':'廣域亂射'}傷害。`):'') )}
  if((st.rufoBleed||0)>0)o.push(tip('🩸',`流血×${st.rufoBleed}`,'使用黑色牌時受到等同流血層數的傷害，然後流血層數-1。'));
  if((st.rupture||0)>0)o.push(tip('🩸',`破裂×${st.rupture}`,'受到傷害時額外受到破裂層數的傷害，然後消耗1層。'));
  if(c==='zilu'&&(st.ziluStrong||0)>0)o.push(tip('💪',`子路強壯×${st.ziluStrong}`,'子路先出牌時，超高速立即給予2層強壯；原本等待對手10秒的效果另給1層強壯。'));
  if(st.ziluFast)o.push(tip('⚡','超高速（永久）','早於目前對手出牌時立即獲得2層強壯，每回合一次，當回合出牌也受益。'));
  if(st.urgentHunger)o.push(tip('🩸','迫切的飢餓','生命值不低於30%時出牌，消耗當前生命值10%（向上取整），該牌點數增加消耗生命值+1；消耗量增加辛克萊的無盡飢餓。'));if(c==='sinclair')o.push(tip('🍖',`無盡的飢餓×${st.endlessHunger||0}`,'由迫切的飢餓消耗生命或隊友陣亡累積。每20層額外獲得1層強壯；20層獲得高貴的品格；40層可發動一次 La Castration。')+(st.noble?tip('👑','高貴的品格','獲得毅力；永久增加3層強壯。'):'' )+((st.resolve||0)>0?tip('💪',`毅力×${st.resolve||0}`,'受到一般致命傷害時消耗1層毅力並鎖血至1點；斬殺無法阻擋。'):'')+((st.endlessHunger||0)>=40?tip('⚡',st.laCastrationUsed?'La Castration已使用':'La Castration可用',st.laCastrationUsed?'本場已發動過一次，不能再次使用。':'無盡的飢餓達40層時可發動一次，對敵方全體造成15點單方面傷害。'):''));
  if(c==='verg')o.push(tip('🧠','理智 ?', '維吉里烏斯的理智值固定顯示為「?」，不套用Limbus共通理智加減傷、侵蝕或理智變化。')+(st.vergSword?tip('🗡','超高溫羅馬短劍','黑牌攻擊命中時，目標獲得⌈出牌點數×0.3⌉層炎傷；回合結束受到等同炎傷層數的傷害，然後炎傷-1。'):'' )+(st.vergEgo?tip('🌹','綻放EGO：血之洗禮','獲得3層強壯；反擊命中時使攻擊者獲得3層流血。首次護盾破裂時獲得基礎生命值×0.2護盾。')+tip('🛡',`血之洗禮護盾計時 ${st.vergEgoTurns||0}/3`,st.vergShieldStack?'每完成3回合，累加固定5點護盾。':'每完成3回合，護盾刷新為固定5點，不疊加。'):'')+(st.vergShieldStack?tip('🩸','血幕-極','永久使血之洗禮後每3回合獲得的5點護盾可疊加。'):'') );
  else if(c&&CHARS[c]&&CHARS[c].f==='bus')o.push(tip('🧠',`理智 ${st.san||0}`,`理智影響Limbus陣營的傷害加減機率，也會依角色規則在攻擊、反擊及擊殺時變化。${room.cfg.warden&&wardenStage(room)===1&&i!==1?'第一階段挑戰者的理智不低於-30。':room.cfg.warden&&wardenStage(room)===2&&i===1?'審判之日：理智不低於30。':''}${st.san>=45?'理智45：造成傷害額外+2。':st.san<=-45?'理智-45：本回合進入侵蝕，系統隨機出牌；黑牌70%攻擊自己、♦牌70%失效、♥牌70%治療敵人。本回合結算後，下回合理智重置為0。':''}`));
  if(c==='teaflower'){o.push(tip('🌺','落英繽紛'+(st.teaPetals||0)+'/6','每2層獲得1虛弱；上限6層'));o.push(tip('♣',st.teaClubCd>0?'轉梅花冷卻1次參戰':'轉梅花可用','使用後跳過一次自身參戰回合'));if(st.teaInner)o.push(tip('🌸','盛開的內心','所有傷害皆可加開花；失敗消耗追加牌面傷害，不再疊開花'));if(st.teaFragrance)o.push(tip('🌸','馥郁芬芳','3層以上引爆固定傷害改為所有標記牌點數總和，不受傷害增減影響'))}if(st.nineTea)o.push(tip('🌺','九人會-冬柏','正常治療額外回復2血'));if(teaBlooms(room,i).length)o.push(tip('🌺','開花'+teaBlooms(room,i).length+'/5','標記牌失敗消耗會轉移；成功造成傷害使冬柏獲得落英繽紛'));if(st.teaBloomSafe&&st.teaBloomRound===room.round)o.push(tip('🌺','盛放','本回合空過，所有傷害保留至少1血'));
  {const B=calcBuffs(c,st),bt=[B.strong&&tip(statusIcon('strong'),`強壯${B.strong}`,'出牌點數增加對應層數，可超過13點；麻痺與神滅的固定點數優先。'),B.weak&&tip(statusIcon('weak'),`虛弱${B.weak}`,'出牌點數減少對應層數。'),B.vuln&&tip(statusIcon('vuln'),`易損${B.vuln}`,'受到傷害增加對應層數。'),B.guard&&tip(statusIcon('guard'),`守護${B.guard}`,'受到傷害減少對應層數，最低為0。')].filter(Boolean);if(bt.length)o.push(bt.join('　'))}
  if(st.paralysis>0)o.push(tip('⚡',`麻痺（剩${st.paralysis}回合）`,'任何牌的最終點數固定為1，優先於神滅與其他點數增減；參與戰鬥後扣除回合，旁觀與後備期間不扣。'));
  if(st.divineAnnihilation>0)o.push(tip('🌩',`神滅（剩${st.divineAnnihilation}回合）`,'任何牌的最終點數固定為24；參與戰鬥後扣除回合，旁觀與後備期間不扣，麻痺優先。'));
  if(c==='umb')o.push(st.rage>0?tip('🌩',`神怒（剩${st.rage}場戰鬥）`,room.cfg.warden&&wardenTipherethActive(st)?'神怒與Tiphereth的期待同時生效，基礎出牌點數為28，再套用原本加減及倍率；結束後神罰歸零。':'神怒期間出牌點數皆視為K（13）；結束後神罰歸零。'):tip('','神罰 '+st.stack+'/3','每次受到攻擊累積1層；達3層進入神怒。'));
  if(c==='val')o.push(tip('👁',st.eye>0?`預知眼×${st.eye}`:st.xinVal?'預知眼×0':`預知眼過熱（剩${st.heat||0}場，傷害-2）`,'預知眼參與攻擊拼點；拼點成功消耗1層並獲得巴勒莫劍術。至少2層時，若剩餘手牌中最大方塊的原始點數≥對方黑牌，自動消耗2層及該方塊閃避該次傷害並補抽一張手牌；每回合只消耗一張方塊與2層預知眼，該回合持續以該牌原始點數判定閃避，即使預知眼耗盡也能連閃，梅花斷補仍生效。預知眼歸零後過熱，恢復時重置為6層；心-瓦倫希娜不會過熱。')+(st.sw?tip('🗡',`巴勒莫×${st.sw}`,'永久增加等量出牌點數。'):'')+(st.xinVal?tip('💖','心-瓦倫希娜','獲得被動【心-瓦倫希娜】：預知眼不再過熱，且每回合結束自動回復 1 層預知眼。'):''));
  if(st.shield>0&&c!=='san')o.push(tip('🛡',`護盾${st.shield}`,'護盾只吸收現有盾量，溢出傷害會繼續扣除生命。實際扣盾算攻擊命中，會觸發音效及命中效果。'));
  if(c==='san')o.push(tip('🍷',`血宴×${st.feast}`,'血宴由治療或吸血累積；達5層可發動血宴強化。')+(st.feastBoost?tip('🩸','飢餓滿足','【25絕技被動】接下來獲得的血宴提升為 1.5 倍。'):'')+(st.shield?tip('🛡',`護盾${st.shield}`,'護盾只吸收現有盾量，溢出傷害會繼續扣除生命。實際扣盾算攻擊命中，會觸發音效及命中效果。'):'')+(st.hard?tip('🔰',`硬血盾×${st.hard}`,'持續期間受到傷害減少2點，最低為0。'):''));
  if(c==='rien'){const g=st.grace||0,lv=g>=9?3:g>=6?2:g>=3?1:0,hidden=st.cmdAddict&&rd()!==i;o.push(tip('✨',`加護×${g}${lv?`（解放${lv}）`:''}`,'指令牌成功獲得3層、失敗獲得1層；3/6/9層分別解放，提供守護、強壯與守護，或可發動Replica。')+'　'+tip('☯',`業×${st.karma||0}${st.noKarma?'（停止累積）':''}`,'未使用指令牌時累積；每2層增加1易損，每3層增加1虛弱。')+(st.repUsed?tip('⚡','Replica已使用','Furioso-Replica 每場遊戲只能發動一次。'):'')+(st.cmd?`　${tip('🔷',hidden?'指令牌已隱藏':`指令牌 ${cs(st.cmd)}`,hidden?'指令成癮：指令牌僅持有者可見。':'使用這張牌會依效果成功或失敗累積指令加護。')}`:''))}
  if(st.cmdAddict)o.push(tip('🕵️','指令成癮','【25絕技被動】指令牌對其他玩家隱藏，且指令牌點數增幅+8。'));
  if(st.xinRien)o.push(tip('💖','心-里恩','【25絕技被動】業已清除；額外強壯×'+(st.xinStrong||0)+'、守護×'+(st.xinGuard||0)+'。'));
  if(c==='ring'){o.push(tip('🧬',`活體材料×${st.lm||0}`,'每3層提供1層強壯；任何攻擊命中時降低目標最大生命1，達5層後改為2；梅花攻擊效果加倍，成功梅花斷補固定降低5。')+(st.mdec?tip('','最大生命-'+st.mdec,'最大生命上限已降低。'):''));
    if(st.ringAesthetic)o.push(tip('🔬','在現場獲取並加工材料的美學','【25絕技被動】活體材料同時提升自身最大生命值與當前生命值。'));
  }
  if(c==='tkt'){const H=tktHealth(room.hp[i],maxHp(i),st);o.push(tip('⏳',`血條 ${H.bars}/5・當前 ${H.current}/${Math.max(0,H.cap-Math.floor((H.bars-1)*H.unit+1e-9))}`,'單次傷害最多打掉當前血條。治療只補當前血條；原本滿條時可補回1條、該條1血。剩餘5／4／3／2／1條對應強壯4／強壯2／無加減成／虛弱2／虛弱4。'))}
  if(c==='mat'){o.push(tip('🎁',`包裝紙×${st.wrap}`,room.cfg.warden?'方塊反擊成功時獲得；集滿3層獲得毅力，可搭配出牌對看守發動萊萬汀，不要求復仇層數。':'方塊反擊成功時獲得；集滿3層獲得毅力並可發動萊萬汀。')+'　'+(st.superRes?tip('💪','超毅力'+((st.superResTimer||0)>0?`（保護中 剩${st.superResTimer}回合）`:st.superResUsed?'（已生效過）':'（待觸發）'),'【25絕技被動】受到致命傷害後3回合內血量不低於1，全場僅限發動一次。'):tip('💪',`毅力×${st.res}`,'受到致命傷害時消耗1層並將生命固定為1；部分斬殺效果無法阻擋。')));
    if(st.hellFire)o.push(tip('🔥','地獄之火','【25絕技被動】每回合初對所有敵方施加3層炎傷。'));
  }
  if(c==='lei'){o.push(tip('🐅',st.mhu>0?'猛虎標彈 ×'+st.mhu:'虎標彈 ×'+(st.hu||0),'消耗彈藥可提高出牌點數；消耗5枚猛虎標彈會發動快刀亂麻。'));o.push(tip('🩸',`累積生命損失 ${st.leiHpLost||0}`,'從戰鬥第一回合記錄實際扣除的生命，包含自損與後備受傷；回血不抵銷，護盾損失不計。'));if(st.xinLei)o.push(tip('💖',`心-雷橫（強壯×${Math.floor((st.leiHpLost||0)/5)}）`,'每累積損失5點生命獲得1層永久強壯，包含發動絕技前的損失；換人保留。'))}
  if(isMiddleFinger(c))o.push(tip('🖕','中指',`受到黑牌單方面傷害，對攻擊者施加復仇對象；友方共用，上限${middleFingerCount(room,i)*2}層（存活中指${middleFingerCount(room,i)}人，含後備）。`));
  if(c==='kira')o.push(tip('🔥',`熱絲${st.kiraHeat||0}/2`,'對有友方復仇對象的敵人實際造成傷害時獲得1層永久強壯，最大2層。')+tip('👊',`反擊累積${st.kiraCounters||0}/2・老爸技${st.kiraDadUses||0}次`,'每反擊成功兩次獲得一次資格；立即造成固定5點傷害，只受護盾與毅力影響；有後備中指則免費自動換人並使對手本回合無法出牌；換上的成員本回合造成的傷害會等量反傷綺羅。'));
  if((room.kiraRelays||[]).some(x=>x.round===room.round&&x.seat===i&&x.member===room.act?.[i]&&!room.team[i][x.kira].dead))o.push(tip('🔗','綺羅連動','本回合自己造成的實際傷害，會同步對後備綺羅造成等量傷害。'));
  if(kiraCardLocked(room,i))o.push(tip('🚫','本回合無法出牌','受到綺羅的老爸技能影響，該回合不能出牌。'));
  if(lkdRedrawRemaining(room,i)>0)o.push(tip('🃏',`全體集合・免費換牌${lkdRedrawRemaining(room,i)}次`,'玩家整隊共用，換人或里卡多倒下仍保留；封鎖及沉默時暫停，不增加付費次數、不消耗補給。'));
  if(c==='spider')o.push(tip('👁',`赤曈${st.spiderEye||0}`,`黑牌成功按最終點數獲得，失敗一半；獲取倍率×${st.spiderGain||1}。每5層使本張黑牌點數+1。`)+tip('💀',`懺悔${st.spiderPenitence||0}`,'紅牌成功按最終點數獲得，失敗一半；每5層立即獲得1點護盾。')+tip('🕷',`蛛•頭 ${st.spiderEyeSpent||0}／骷•頭 ${st.spiderPenitenceSpent||0}`,'各自累計消耗每滿15層額外獲得5層對應資源，受獲取倍率影響；各滿15層後永久切換對應立繪。'));
  if(c==='lkd')o.push(tip('👊',`反擊累積${st.lkdCounters||0}/2・理髮卷${st.lkdHaircuts||0}次`,'每反擊成功兩次獲得一次理髮卷資格，立即造成10點固定傷害。')+tip('🛡','全體集合','開局有其他友方中指時自身獲得5盾；每名其他中指提供玩家1次免費換牌，整隊共用。')+tip('↩','償還','受到黑牌單方面傷害時，對攻擊者造成基礎2點傷害，受威力與復仇增傷及防護影響。'));
  if(c==='sad'){o.push(tip('💧',`淚鋒×${st.sadTears||0}/3`,'每打出一張方塊就累積1層，不要求反擊成功；1層解除本被動的虛弱，2層強壯1，3層消耗後回到虛弱1並準備下一張牌+6；免空防禁止。')+'　'+tip('♦',`已出反擊牌 ${st.sadCounters||0}張`,'本局羅佳已出的方塊張數，換人保留，淚鋒消耗不會重置；阿卡納裂淚穿刺用此數量加上對手手牌方塊張數，再乘3。'));if(st.sadNext)o.push(tip('⚔','下一張牌+6','下一張牌點數+6，攻擊或反擊命中使對方理智-20；沒有可變理智則追加3點固定傷害。出牌即消耗，未命中不保留。'));if(st.sadPride)o.push(tip('🗡','磨滅的自尊','淚鋒上限固定3層且不再消耗；達3層後每張牌點數+6並附帶命中效果。反擊點數×1.5，向下取整。'))}
  if(c==='dihui'){const fw=st.shunxing||0,rv=st.nixing||0,tot=fw+rv;o.push(tip('➡️',`順行－憐憫×${fw}`,'使用紅色牌時累積；可選擇於下回合每層轉成1層虛弱（持有心-地慧星則無）及1層守護。')+'　'+tip('⬅️',`逆行－憎惡×${rv}`,'使用黑色牌時累積；可選擇於下回合每層轉成1層易損（持有心-地慧星則無）及1層強壯。')+(st.dihuiNext?`　${tip('🔮',`下回合啟用${st.dihuiNext==='forward'?'順行':'逆行'}`,`下回合將按${st.dihuiNext==='forward'?fw:rv}層累積值（每層換算1層）計算效果。`)}`:'')+'　'+tip('🎯',`已確定的對手×${Math.floor(tot/2)}`,'每2層順逆行總和增加1層，會標記對手手牌。')+'　'+tip('🌀',`殘像糾纏×${st.afterimage||0}`,'對手使用未被標記的手牌時累積；每次造成傷害後追加真實追擊。'));
    if(st.afterimageRampage)o.push(tip('🌀','殘像暴走','【25絕技被動】敵方若出未被標記的牌，直接受到該牌點數×(20%×殘像糾纏層數)的固定傷害。'));
    if(st.xinDihui)o.push(tip('🌌','心-地慧星','【25絕技被動】順行與逆行不再有負面效果（順行不獲得虛弱，逆行不獲得易損）。'));
    if(st.markTarget!==null&&st.markTarget!==undefined)o.push(tip('🎯',`本回合標記手牌 ${((st.markedCards)||[]).length} 張`,'被標記的牌會顯示標記提示。'))}
  if(c==='ailan'&&st.superChase)o.push(tip('⚔','超追擊','【25絕技被動】夜錐追擊最終傷害固定5；不受增減傷影響，仍可被護盾、高堅果或大地之牆抵擋。'));
  if(st.superDeepTrauma)o.push(tip('🚫','超深度創傷（永久禁療）','本局永久無法回復生命，包含紅心、吸血與絕技；換人、復活或艾蘭離場皆不會解除。'));else if(st.deepTrauma)o.push(tip('🩸','深度創傷（治療×0.33）','獲得治療量乘以0.33，向上取整。'));else if(st.trauma>0)o.push(tip('🩸',`創傷×${st.trauma}（治療×0.66）${st.traumaPending?'→下回合轉為深度創傷':''}`,'獲得治療量乘以0.66，向上取整；創傷達2層後於下回合開始轉為深度創傷。'));
  room.seats.forEach((_,m)=>{if(room.chars[m]==='dihui'&&room.st[m].markTarget===i){const n=Math.floor(((room.st[m].shunxing||0)+(room.st[m].nixing||0))/2);o.push(tip('🎯',`被地彗星標記：已確定的對手×${n}`,'你本回合手牌正受到地彗星標記效果影響。'))}});
  if(c==='shi_faust')o.push(tip('🏹',st.bow?'拉弓中（非紅心點數-70%）':'未拉弓','拉弓期間非紅心牌點數降低70%，回合結束累積矢；放矢依層數施加易損、虛弱。')+'　'+tip('➶',`矢×${st.arrow||0}`,`拉弓期間每回合結束累積${st.fastBow?4:1}層，最多4層。`)+(st.fastBow?tip('⚡','高速矢裝填（每回合矢+4）','永久使拉弓每回合獲得4層矢，上限仍為4層。'):'')+(st.rarrow>0?tip('🔴',`紅矢×${st.rarrow}（下一張♠×3／♣×5）`,'下一張黑桃或梅花牌分別獲得3倍或5倍點數，每次發動消耗1層。'):''));
  {const ex2=[],fx=st.fx||[],dmS=fx.filter(x=>x.k==='dm').reduce((a,x)=>a+x.n,0),rdS=fx.filter(x=>x.k==='rd').reduce((a,x)=>a+x.n,0)+(st.asura>0?.5:0);
    if(st.burn)ex2.push(tip('🔥',`炎傷×${st.burn}`,'回合結束時受到等同層數的傷害，之後層數減1。'));if(st.sealT>0)ex2.push(tip('🚫',`技能封鎖（剩${st.sealT}回合）`,'期間無法使用主動技能，被動效果也會被封鎖。'));if(shinActive(st))ex2.push(tip('🌀',st.musouShin?'無想神氣合一（永久）':`神氣合一（剩${st.shin}回合）`,`${st.musouShin?'造成傷害倍率1.8':'造成傷害增加50%'}，受到傷害減少50%，並強化軌跡戰技。`));
    if(st.artCpHalf)ex2.push(tip('⚔','柒型-無（戰技CP減半）','永久使緋葉剣／六連疾風／火紋之太刀消耗15／30／25CP；S技仍消耗100CP。'));
    const solar=fx.find(x=>x.source==='sun');if(solar)ex2.push(tip('☀',`太陽（剩${solar.t}回合）`,'受到傷害減少60%；所屬隊伍參戰後扣除回合，包含後備期間。'));
    fx.filter(x=>x.source==='laDemande').forEach(x=>ex2.push(tip(x.k==='w'?'💔':'🔻',`la demande：${x.k==='w'?'虛弱':'易損'}×${x.n}（剩${x.t}回合）`,'此層獨立持續3回合，參戰後扣除回合；後續施加的層數不會延長此層期限。')));
    if(st.stun>0)ex2.push(tip('😵',`暈眩（剩${st.stun}回合）`,'暈眩期間無法出牌或行動。'));if(st.wall>0)ex2.push(tip('🧱',`大地之牆×${st.wall}`,'抵擋一次傷害，包括斬殺。'));if(st.asura>0)ex2.push(tip('🔥','修羅之炎','受到傷害減少50%。'));if(st.cpg>0)ex2.push(tip('⚡',`每回合+10CP（剩${st.cpg}回合）`,'回合開始時獲得10 CP。'));
    if(dmS)ex2.push(tip('⚔',`傷害${dmS>0?'+':''}${Math.round(dmS*100)}%`,'造成的傷害倍率變化，按顯示百分比計算。'));if(rdS)ex2.push(tip('🛡',`受傷-${Math.round(rdS*100)}%`,'受到傷害依顯示比例減少。'));if(fx.some(x=>x.k==='ns'))ex2.push(tip('🚫','強壯無效','強壯層數在此效果期間不會提供點數。'));
    const AA=CHARS[c]&&CHARS[c].arts;if(st.artOn&&AA){const a=AA.find(x=>x.id===st.art);if(a)ex2.push(tip('✨',`戰技【${(shinActive(st)&&a.n2)||a.n}】本回合生效`,'本回合生效中的角色戰技效果。'))}
    if(ex2.length)o.push(ex2.join('　'))}
  if(c==='drunk'){o.push(tip('🍶','小酌×'+(st.drunkSip||0),'1層守護1；2／4層各加1暗牌槽；3層強壯1；每階段累積'));if(st.drunkCd>0)o.push(tip('⏳','酌酒冷卻','下次自身上場回合不能勾選酌酒，紅心回復>6仍可飲酒'));if(drunkAwake(st))o.push(tip('✨','覺醒'+(st.drunkAwake===-1?'・永久':'×'+st.drunkAwake),'強壯1、守護1，看見全場所有暗牌，優先於爛醉'));else if(st.drunkAwakePending)o.push(tip('✨','下次覺醒','下次自身上場回合取得覺醒'));if(st.drunkSip>=6)o.push(tip('🥴','爛醉','所有牌面隱藏；額外強壯'+drunkExtra(st)+'、易損'+drunkExtra(st)))}
  if(c==='xichn'){const a=xichnStages(st);o.push(tip('🌱',`切磋琢春 ${a.join('／')}`,`威力、紅心治療、防護、生命路線階段，上限各6；自身紅心治療${xichnHealBonus(st)>=0?'+':''}${xichnHealBonus(st)}，生命倍率${(70+10*a[3])/100}。`));o.push(tip('⌛',`待×${st.xichnWait||0}`, '後備且玩家參戰的回合結束累積，登場消耗；一次固定傷害最多3點，不受威力增減影響，5層對群，單一敵人翻倍。'));o.push(tip('🌿',`余桓${st.xichnYuhuanUsed?'已使用':'可用'}`, '有可上場後備時，非斬殺傷害將生命降至50%以下則保留50%並隨機免費換人，每場一次。'))}
  if(c==='yoshi'){
    if(st.ketsuen)o.push(tip('🩸','血缘【けつえん】','獲得被動【血缘】：天殺不再消除自身手牌與卡牌槽。'));
    if(st.yoshiCd>0)o.push(tip('⏳','天殺冷卻','天殺冷卻中，下回合方可使用。'));
  }
  Object.entries(st.fingerRevenge||{}).forEach(([side])=>{const n=revengeStacks(room,+side,st);if(n)o.push(tip('🎯',`復仇對象×${n}`,`受到玩家${+side+1}方中指成員的非固定傷害時，額外增加${n}點傷害。`))});
  return o.length?`<div class="mut">${o.join('　')}</div>`:''}
const characterMaxHp=(r,i,c,s0)=>r.silentMax?r.silentMax[i]:Math.max(1,(c==='leoc'?5:c==='warden'?Math.ceil(r.cfg.hp*(s0?.wardenFactor||WARDEN_STAGES[Math.min(3,Math.max(1,s0?.wardenStage||1))].factor)):(c==='xichn'?Math.ceil(r.cfg.hp*(70+10*xichnStages(s0||{})[3])/100*(bossHealthFactor(r.cfg,i))):Math.round(r.cfg.hp*(c==='san'||c==='nut'?1.2:1)*(bossHealthFactor(r.cfg,i))*(c==='lucio'&&s0?.lucioDespair?0.8:1))))-((s0&&s0.mdec)||0)+(c==='ring'&&s0&&s0.ringAesthetic?(s0.lm||0):0));
const maxHp=i=>characterMaxHp(room,i,room.chars&&room.chars[i],room.st&&room.st[i]);
const AUDIO_VOLUME_KEY='d25-audio-volumes';
const validAudioLevel=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?Math.min(100,Math.max(0,value)):fallback;
function loadAudioVolumes(){try{const saved=JSON.parse(localStorage.getItem(AUDIO_VOLUME_KEY)||'{}');return{bgm:validAudioLevel(saved?.bgm,65),sfx:validAudioLevel(saved?.sfx,80)}}catch(e){return{bgm:65,sfx:80}}}
const savedAudioVolumes=loadAudioVolumes();
let teaSelId=null,skOn=false,bgm=null,bgmOn=false,sfxOn=true,bgmVol=savedAudioVolumes.bgm/100,sfxVol=savedAudioVolumes.sfx/100,lastR=0,lastInstantFxKey='',bgmSrc=null,d25Bgm=null,bgmMatchKey=null;
const wardenAudioLocked=()=>!!(room?.cfg.warden&&['wardenIntro','wardenShift','wardenJudgment','wardenContinue','wardenEnding','playing','over'].includes(room.status));
let wardenAudioState=null;
function syncWardenAudio(){
  if(wardenAudioLocked()){
    if(!wardenAudioState)wardenAudioState={bgmOn,sfxOn};
    bgmOn=true;sfxOn=true;if(bgmVol<=0)bgmVol=.65;if(sfxVol<=0)sfxVol=.8;
  }else if(wardenAudioState){
    ({bgmOn,sfxOn}=wardenAudioState);wardenAudioState=null;
    if(!bgmOn){if(bgm)bgm.pause();if(d25Bgm)d25Bgm.audio.pause()}
  }else return;
  updateSfxVolume();updAud();
}
// 每場由房主開局時選定一首，保存於room.battleBgm並同步；回合更新與重繪不重新抽選。
const BATTLE_BGM=["assets/audio/bgm/battle/random/bgm.mp3","assets/audio/bgm/battle/random/仙侶宮 哪吒令 龍遊淺水 (Xian Lv Gong Ne Zha Ling Long You Qi) - tamhowai 000.mp3","assets/audio/bgm/battle/random/活俠傳原聲帶 09 赦召乾坤英雄令 Gathering of the Brave    OST BGM 配樂 - 前忍豆風雲.mp3","assets/audio/bgm/battle/random/活俠傳原聲帶 11 傳說之下 Unsung Below    OST BGM 配樂 - 前忍豆風雲.mp3","assets/audio/bgm/battle/random/活俠傳原聲帶 12 最崎嶇的路 The Most Treacherous Path    OST BGM 配樂 - 前忍豆風雲.mp3","assets/audio/bgm/battle/random/活俠傳原聲帶 13 千里不留行 Ever Onward    OST BGM 配樂 - 前忍豆風雲.mp3"];
const D25_BGM=Object.fromEntries(Object.entries(CHARS).filter(([k,c])=>c.d25Skills&&c.d25Skills.length).map(([k,c])=>[k,{src:`assets/audio/bgm/ultimate/${c.d25BgmFile||((c.d25Bgm||c.img||k)+'ex.mp3')}`,priority:2,loop:false}]));
const D25_BGM_DONE=new Set();
/* 校正值預先量測，從第一次播放即生效；保留原始素材。 */
/* AUDIO_LEVELS_START */
const AUDIO_LEVELS={"assets/audio/sfx/characters/attack_bamboo.mp3":{"gain":0.444324},"assets/audio/sfx/characters/attack_card_ish.mp3":{"gain":0.403506},"assets/audio/sfx/characters/attack_dihui.mp3":{"gain":0.567022},"assets/audio/sfx/characters/attack_estelle.mp3":{"gain":0.848203},"assets/audio/sfx/weapons/attack_gun_classic.mp3":{"gain":0.987416,"src":"assets/audio/normalized/attack_gun_classic.mp3"},"assets/audio/sfx/weapons/attack_gun_ghost.mp3":{"gain":0.985372,"src":"assets/audio/normalized/attack_gun_ghost.mp3"},"assets/audio/sfx/weapons/attack_gun_guardian.mp3":{"gain":0.990946,"src":"assets/audio/normalized/attack_gun_guardian.mp3"},"assets/audio/sfx/weapons/attack_gun_judge.mp3":{"gain":0.787227},"assets/audio/sfx/weapons/attack_gun_marshal.mp3":{"gain":0.990604,"src":"assets/audio/normalized/attack_gun_marshal.mp3"},"assets/audio/sfx/weapons/attack_gun_odin.mp3":{"gain":0.744561},"assets/audio/sfx/weapons/attack_gun_operator.mp3":{"gain":0.898566},"assets/audio/sfx/weapons/attack_gun_phantom.mp3":{"gain":0.92619},"assets/audio/sfx/weapons/attack_gun_sheriff.mp3":{"gain":0.989806,"src":"assets/audio/normalized/attack_gun_sheriff.mp3"},"assets/audio/sfx/weapons/attack_gun_shorty.mp3":{"gain":0.980731},"assets/audio/sfx/weapons/attack_gun_spectre.mp3":{"gain":0.982992,"src":"assets/audio/normalized/attack_gun_spectre.mp3"},"assets/audio/sfx/weapons/attack_gun_vandal.mp3":{"gain":0.63797},"assets/audio/sfx/characters/attack_heathcliff.mp3":{"gain":0.536661},"assets/audio/sfx/characters/attack_jia_qiu.mp3":{"gain":0.413143},"assets/audio/sfx/characters/attack_lei.mp3":{"gain":0.372177},"assets/audio/sfx/characters/attack_leo.mp3":{"gain":0.704125},"assets/audio/sfx/characters/attack_mat.mp3":{"gain":0.990604,"src":"assets/audio/normalized/attack_mat.mp3"},"assets/audio/sfx/characters/attack_moses.mp3":{"gain":0.432514},"assets/audio/sfx/characters/attack_rean.mp3":{"gain":0.412667},"assets/audio/sfx/characters/attack_rien.mp3":{"gain":0.424326},"assets/audio/sfx/characters/attack_ring.mp3":{"gain":0.403831},"assets/audio/sfx/characters/attack_rufo.mp3":{"gain":0.582908},"assets/audio/sfx/characters/attack_san.mp3":{"gain":0.993116},"assets/audio/sfx/characters/attack_shi_faust.mp3":{"gain":0.439896},"assets/audio/sfx/characters/attack_tkt.mp3":{"gain":0.39414},"assets/audio/sfx/characters/attack_umb.mp3":{"gain":0.988325,"src":"assets/audio/normalized/attack_umb.mp3"},"assets/audio/sfx/characters/attack_val.mp3":{"gain":0.787771},"assets/audio/sfx/characters/attack_verg.mp3":{"gain":0.603045},"assets/audio/sfx/characters/attack_yisang.mp3":{"gain":0.625317},"assets/audio/sfx/characters/attack_yoshi.mp3":{"gain":0.429833},"assets/audio/sfx/characters/attack_zilu.mp3":{"gain":0.470869},"assets/audio/bgm/ultimate/bambooex.mp3":{"gain":0.323221},"assets/audio/bgm/ultimate/bugex.mp3":{"gain":0.595114},"assets/audio/bgm/ultimate/cardex.mp3":{"gain":0.659781},"assets/audio/bgm/ultimate/dihuiex.mp3":{"gain":0.626542},"assets/audio/bgm/battle/enforcer.mp3":{"gain":0.700084},"assets/audio/bgm/ultimate/estelleex.mp3":{"gain":0.5392},"assets/audio/bgm/ultimate/heathcliffex.mp3":{"gain":0.518621},"assets/audio/bgm/battle/jia_qiu.mp3":{"gain":0.361576},"assets/audio/bgm/ultimate/leiex.mp3":{"gain":0.711377},"assets/audio/bgm/ultimate/matex.mp3":{"gain":0.655466},"assets/audio/bgm/ultimate/mosesex.mp3":{"gain":0.655466},"assets/audio/bgm/ultimate/reanex.mp3":{"gain":0.490174},"assets/audio/bgm/battle/red_god.mp3":{"gain":0.340957},"assets/audio/bgm/ultimate/rienex.mp3":{"gain":0.566435},"assets/audio/bgm/ultimate/ringex.mp3":{"gain":0.646696},"assets/audio/bgm/ultimate/rufoex.mp3":{"gain":0.282651},"assets/audio/bgm/ultimate/sanex.mp3":{"gain":0.754484},"assets/audio/bgm/ultimate/shi_faustex.mp3":{"gain":0.88369},"assets/audio/bgm/battle/silverwill.mp3":{"gain":0.549351},"assets/audio/bgm/ultimate/tktex.mp3":{"gain":0.306126},"assets/audio/bgm/ultimate/umbex.mp3":{"gain":0.842073},"assets/audio/bgm/battle/verg.mp3":{"gain":0.381681},"assets/audio/bgm/battle/verg2.mp3":{"gain":0.356739},"assets/audio/bgm/ultimate/yisangex.mp3":{"gain":0.625749},"assets/audio/bgm/ultimate/yoshiex.mp3":{"gain":0.678969},"assets/audio/sfx/characters/attack_firefu.mp3":{"gain":0.563248},"assets/audio/sfx/characters/attack_fire2.mp3":{"gain":0.67811},"assets/audio/sfx/characters/attack_firefu3.mp3":{"gain":0.353102},"assets/audio/sfx/characters/attack_lucio.mp3":{"gain":0.594155},"assets/audio/bgm/ultimate/bgm.mp3":{"gain":0.643132},"assets/audio/bgm/battle/random/bgm.mp3":{"gain":0.409921},"assets/audio/bgm/battle/random/\u4ed9\u4fb6\u5bae \u54ea\u5412\u4ee4 \u9f8d\u904a\u6dfa\u6c34 (Xian Lv Gong Ne Zha Ling Long You Qi) - tamhowai 000.mp3":{"gain":0.448023},"assets/audio/bgm/battle/random/\u6d3b\u4fe0\u50b3\u539f\u8072\u5e36 09 \u8d66\u53ec\u4e7e\u5764\u82f1\u96c4\u4ee4 Gathering of the Brave    OST BGM \u914d\u6a02 - \u524d\u5fcd\u8c46\u98a8\u96f2.mp3":{"gain":0.320848},"assets/audio/bgm/battle/random/\u6d3b\u4fe0\u50b3\u539f\u8072\u5e36 11 \u50b3\u8aaa\u4e4b\u4e0b Unsung Below    OST BGM \u914d\u6a02 - \u524d\u5fcd\u8c46\u98a8\u96f2.mp3":{"gain":0.397375},"assets/audio/bgm/battle/random/\u6d3b\u4fe0\u50b3\u539f\u8072\u5e36 12 \u6700\u5d0e\u5d87\u7684\u8def The Most Treacherous Path    OST BGM \u914d\u6a02 - \u524d\u5fcd\u8c46\u98a8\u96f2.mp3":{"gain":0.490851},"assets/audio/bgm/battle/random/\u6d3b\u4fe0\u50b3\u539f\u8072\u5e36 13 \u5343\u91cc\u4e0d\u7559\u884c Ever Onward    OST BGM \u914d\u6a02 - \u524d\u5fcd\u8c46\u98a8\u96f2.mp3":{"gain":0.382957},"assets/audio/sfx/characters/attack_sad1.mp3.mp3":{"gain":0.541128},"assets/audio/sfx/characters/attack_sad2.mp3.mp3":{"gain":0.568984},"assets/audio/sfx/characters/attack_sad3.mp3.mp3":{"gain":0.332162},"assets/audio/sfx/characters/attack_sad4.mp3.mp3":{"gain":0.331589},"assets/audio/sfx/characters/attack_lkd1.MP3":{"gain":0.370126},"assets/audio/sfx/characters/attack_lkd2.MP3":{"gain":0.397786},"assets/audio/sfx/characters/attack_lkd3.MP3":{"gain":0.547205},"assets/audio/sfx/characters/attack_lkd4.MP3":{"gain":0.37424},"assets/audio/bgm/ultimate/lkdex.mp3":{"gain":0.303005},"assets/audio/sfx/characters/attack_kira1.mp3.MP3":{"gain":0.469732},"assets/audio/sfx/characters/attack_kira2.mp3.MP3":{"gain":0.540319},"assets/audio/sfx/characters/attack_kira3.mp3.MP3":{"gain":0.443149},"assets/audio/sfx/characters/attack_kira4.mp3.MP3":{"gain":0.416869},"assets/audio/bgm/ultimate/kiraex.mp3":{"gain":0.330941},"assets/audio/sfx/characters/attack_xichun.mp3":{"gain":0.578895},"assets/audio/sfx/characters/attack_drunk.mp3":{"gain":0.949074},"assets/audio/sfx/characters/drink_drunk.mp3":{"gain":0.987643,"src":"assets/audio/normalized/drink_drunk.mp3"},"assets/audio/bgm/warden/1.mp3":{"gain":0.343202},"assets/audio/bgm/warden/2.mp3":{"gain":0.308958},"assets/audio/bgm/warden/3.mp3":{"gain":0.294408},"assets/audio/sfx/warden/S1003V-169.ogg":{"gain":0.496249},"assets/audio/sfx/warden/\u666e\u901a\u653b\u64ca.mp3":{"gain":0.408272},"assets/audio/sfx/warden/\u770b\u5b88\u968e\u6bb5\u4f7f\u7528\u7279\u6b8a\u653b\u64ca.mp3":{"gain":0.506874},"assets/audio/sfx/warden/\u8840\u91cf\u66b4\u589e\u8f49\u5834.mp3":{"gain":0.501707},"assets/audio/sfx/warden/\u7121\u6578\u91d8\u5b50\u964d\u843d.mp3":{"gain":0.440859},"assets/audio/sfx/warden/FateLost.mp3":{"gain":0.384548},"assets/audio/sfx/warden/\u5fa9\u6d3b.mp3":{"gain":0.675694},"assets/audio/sfx/warden/tiphereth.mp3":{"gain":0.990376,"src":"assets/audio/normalized/tiphereth.mp3"},"assets/audio/sfx/warden/skill.mp3":{"gain":1.0,"src":"assets/audio/normalized/skill.mp3"},"assets/audio/sfx/characters/attack_spider1.mp3":{"gain":0.987416,"src":"assets/audio/normalized/attack_spider1.mp3"},"assets/audio/sfx/characters/attack_spider2.mp3":{"gain":0.99049,"src":"assets/audio/normalized/attack_spider2.mp3"},"assets/audio/sfx/characters/attack_spider3.mp3":{"gain":0.990148,"src":"assets/audio/normalized/attack_spider3.mp3"},"assets/audio/sfx/characters/attack_spider4.mp3":{"gain":0.988439,"src":"assets/audio/normalized/attack_spider4.mp3"},"assets/audio/sfx/characters/attack_teaflower.mp3":{"gain":0.50136},"assets/audio/bgm/ultimate/teaflowerex.mp3":{"gain":0.356533},"assets/audio/sfx/warden/\u7b2c\u4e09\u968e\u6bb5\u51fa\u724c\u968e\u6bb5\u958b\u59cb.mp3":{"gain":0.359253},"assets/audio/sfx/warden/\u4f7f\u7528shift+delete.mp3":{"gain":0.369488},"assets/audio/sfx/warden/\u4f7f\u7528\u5f37\u5236\u9000\u5834\u6642.mp3":{"gain":0.392238},"assets/audio/sfx/warden/\u9ede\u5230\u88abconsole\u6a19\u8a18\u7684\u724c.mp3":{"gain":0.336202}};
/* AUDIO_LEVELS_END */
const LOUD={g:Object.fromEntries(Object.entries(AUDIO_LEVELS).map(([u,x])=>[u,x.gain]))};
const audGain=u=>Number.isFinite(LOUD.g[u])?Math.min(1,Math.max(0,LOUD.g[u])):1;
const audioSource=u=>AUDIO_LEVELS[u]?.src||u;
const activeSfx=new Map(),activeSynth=new Set(),wardenCuePreloads=new Map();
function preloadWardenCue(file){if(wardenCuePreloads.has(file))return;try{const a=new Audio(audioSource(file));a.preload='auto';a.load();wardenCuePreloads.set(file,a)}catch(e){}}
function clearWardenCuePreloads(){wardenCuePreloads.forEach(a=>a.pause());wardenCuePreloads.clear()}
function playSfxAudio(file,fallback){
  if(!sfxOn||sfxVol<=0)return;
  try{const a=new Audio(audioSource(file));let failed=false;activeSfx.set(a,file);a.volume=sfxVol*audGain(file);
    const fail=()=>{if(failed)return;failed=true;activeSfx.delete(a);try{a.pause()}catch(e){}if(fallback&&sfxOn&&sfxVol>0)fallback()};
    a.onended=()=>activeSfx.delete(a);a.onerror=fail;a.play().catch(fail);
  }catch(e){if(fallback&&sfxOn&&sfxVol>0)fallback()}
}
function playWardenCue(fx,file,offset=0,scale=1){
  if(fx.closed||!sfxOn||sfxVol<=0)return;try{const cached=wardenCuePreloads.get(file),a=cached?.cloneNode?cached.cloneNode(true):new Audio(audioSource(file));a.wardenScale=scale;activeSfx.set(a,file);(fx.voices||(fx.voices=new Set())).add(a);a.volume=sfxVol*audGain(file)*scale;
    const startedAt=d25Now()-offset,release=()=>{activeSfx.delete(a);fx.voices.delete(a)},seek=()=>{try{a.currentTime=Math.max(0,d25Now()-startedAt)/1000}catch(e){}};a.onloadedmetadata=seek;seek();a.onended=release;a.onerror=()=>{release();a.pause()};a.play().catch(()=>{release();a.pause()});return a;
  }catch(e){}
}
function queueWardenCue(fx,file,at,duration,scale=1){const now=d25Now();if(now>=at+duration)return;if(now>=at){playWardenCue(fx,file,now-at,scale);return}const timer=setTimeout(()=>{fx.soundTimers.delete(timer);const elapsed=d25Now()-at;if(elapsed<duration)playWardenCue(fx,file,Math.max(0,elapsed),scale)},at-now);(fx.soundTimers||(fx.soundTimers=new Set())).add(timer)}
function stopWardenCues(fx){if(!fx)return;fx.closed=true;fx.soundTimers?.forEach(clearTimeout);fx.soundTimers?.clear();fx.voices?.forEach(a=>{a.onended=null;a.onerror=null;a.onloadedmetadata=null;a.pause();activeSfx.delete(a)});fx.voices?.clear()}
// Console演出由房主的接受事件驅動；私有請求、同步及重繪不重播。
let wardenFinalCuesFx=null;
function stopWardenFinalCues(){
  const fx=wardenFinalCuesFx;wardenFinalCuesFx=null;if(fx){stopWardenCues(fx);fx.layers.forEach(layer=>layer.remove());fx.layers.clear();fx.impacts.clear()}
  document.body?.setAttribute('data-warden-console-quake','');
}
function queueWardenFinalTimer(fx,fn,ms){const timer=setTimeout(()=>{fx.soundTimers.delete(timer);if(!fx.closed)fn()},Math.max(0,ms));fx.soundTimers.add(timer)}
function syncWardenConsoleQuake(fx){
  const now=d25Now(),quiet=!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const impact=quiet?null:Array.from(fx.impacts.values()).find(at=>now>=at&&now<at+240);
  document.body?.setAttribute('data-warden-console-quake',impact===undefined||impact===null?'':'on');
  if(impact!==undefined&&impact!==null)document.body?.style.setProperty('--console-shake-age',`${impact-now}ms`);
}
function showWardenConsoleNail(fx,e){
  const age=Math.max(0,d25Now()-e.at);if(age>=700)return;
  const target=Array.from(document.querySelectorAll('[data-damage-target]')).find(el=>el.dataset.damageTarget===`${e.seat}:${e.member}`);
  if(!target)return;const rect=target.getBoundingClientRect();if(!rect.width||!rect.height)return;
  const quiet=!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,layer=document.createElement('div'),size=Math.min(180,Math.max(90,rect.width*.6),rect.height*.9),x=rect.left+rect.width*.5,y=rect.top+rect.height*.62;
  layer.className='warden-console-hit'+(quiet?' quiet':'');layer.setAttribute('aria-hidden','true');layer.setAttribute('data-console-target',`${e.seat}:${e.member}`);layer.style.setProperty('--judgment-age',`${-age}ms`);
  layer.innerHTML=judgmentNail(x,y,size,0,0,-y-size-100);document.body.appendChild(layer);fx.layers.add(layer);
  queueWardenFinalTimer(fx,()=>{layer.remove();fx.layers.delete(layer)},700-age);
  if(!quiet){const at=e.at+120;fx.impacts.set(e.id,at);syncWardenConsoleQuake(fx);if(age<120)queueWardenFinalTimer(fx,()=>syncWardenConsoleQuake(fx),120-age);queueWardenFinalTimer(fx,()=>{fx.impacts.delete(e.id);syncWardenConsoleQuake(fx)},360-age)}
}
function syncWardenFinalCues(){
  if(!room?.cfg.warden){if(wardenFinalCuesFx)stopWardenFinalCues();return}
  const key=`${code}:${room.roundBase||1}`;if(wardenFinalCuesFx?.key!==key){stopWardenFinalCues();wardenFinalCuesFx={key,seen:new Set(),layers:new Set(),impacts:new Map(),soundTimers:new Set()}}
  const fx=wardenFinalCuesFx;
  if(room.wardenFinalVoiceAt!==undefined&&!fx.seen.has('finalPlay')){fx.seen.add('finalPlay');const age=Math.max(0,d25Now()-room.wardenFinalVoiceAt);if(age<WARDEN_FINAL_VOICE_MS.finalPlay)playWardenCue(fx,WARDEN_SOUND.finalPlay,age)}
  for(const e of room.wardenConsoleFx||[]){if(fx.seen.has(e.id))continue;fx.seen.add(e.id);const age=Math.max(0,d25Now()-e.at);if(age>=WARDEN_FINAL_VOICE_MS.console)continue;playWardenCue(fx,WARDEN_SOUND.console,age);if(age<700)playWardenCue(fx,WARDEN_SOUND.attack,age);showWardenConsoleNail(fx,e)}
}
let wardenContinueFx=null,wardenContinueTimer=null,wardenContinueTimerKey='';
function stopWardenContinueFx(){clearTimeout(wardenContinueTimer);wardenContinueTimer=null;wardenContinueTimerKey='';if(wardenContinueFx){const fx=wardenContinueFx;wardenContinueFx=null;if(fx.raf!==null)cancelAnimationFrame(fx.raf);stopWardenCues(fx);fx.layer.remove()}}
function scheduleWardenContinueTick(r){const C=r.wardenContinue,at=C.phase==='revive'?C.endsAt:C.startedAt+WARDEN_CONTINUE.introMs,key=`${C.id}:${C.phase}:${at}`;if(at<=Date.now()||wardenContinueTimerKey===key)return;clearTimeout(wardenContinueTimer);wardenContinueTimerKey=key;wardenContinueTimer=setTimeout(()=>{wardenContinueTimer=null;if(wardenContinuePending()&&room.wardenContinue.id===C.id)tick()},at-Date.now())}
function wardenContinueUI(){const C=room.wardenContinue,age=Math.max(0,d25Now()-C.startedAt),i=rd(),revive=C.phase==='revive',src=WARDEN_CONTINUE.images[revive?2:age<WARDEN_CONTINUE.crackMs?0:1],votes=[0,2].map(i=>moves[wardenContinueMoveKey(room,i)]),ready=age>=WARDEN_CONTINUE.crackMs,mine=[0,2].includes(i),chosen=mine&&moves[wardenContinueMoveKey(room,i)];return `<div class="warden-continue-content"><img class="warden-continue-art ${revive?'reviving':''}" src="${esc(src)}" alt="${revive?'復活':'Fate Lost'}">${revive?'':`<div class="warden-continue-choice">${ready?`<p>是否接關？</p><div class="warden-continue-votes">${[0,2].map((seat,k)=>`<span>${esc(room.seats[seat].name)}：${votes[k]?votes[k].yes?'接關':'不接關':'選擇中'}</span>`).join('')}</div>${mine&&!chosen?'<div class="row"><button class="pri" onclick="voteWardenContinue(true)">是，接關</button><button onclick="voteWardenContinue(false)">否</button></div>':`<p>${mine?'已送出選擇，等待另一位挑戰者':'等待兩位挑戰者選擇'}</p>`}`:'<p>挑戰者方全滅</p>'}</div>`}</div>`}
function drawWardenContinueFx(fx){if(wardenContinueFx!==fx||!wardenContinuePending())return;const C=room.wardenContinue,key=`${C.phase}:${Math.max(0,d25Now()-C.startedAt)>=WARDEN_CONTINUE.crackMs}:${rd()}:${[0,2].map(i=>moves[wardenContinueMoveKey(room,i)]?.yes).join(',')}`;if(fx.view!==key){fx.view=key;fx.layer.innerHTML=wardenContinueUI()}fx.raf=requestAnimationFrame(()=>drawWardenContinueFx(fx))}
function syncWardenContinueFx(){if(!wardenContinuePending()){stopWardenContinueFx();return}const C=room.wardenContinue,key=`${code}:${C.id}:${C.phase}`;if(test||isHost)scheduleWardenContinueTick(room);if(wardenContinueFx?.key===key){wardenContinueFx.layer.innerHTML=wardenContinueUI();return}stopWardenContinueFx();const layer=document.createElement('div');layer.id='wardenContinueLayer';layer.className='warden-continue-layer';document.body.appendChild(layer);const fx={key,layer,raf:null};wardenContinueFx=fx;queueWardenCue(fx,C.phase==='revive'?WARDEN_SOUND.revive:WARDEN_SOUND.fate,C.startedAt,C.phase==='revive'?WARDEN_CONTINUE.reviveMs:WARDEN_CONTINUE.introMs);drawWardenContinueFx(fx);if(test||isHost)scheduleWardenContinueTick(room)}
function sfx(n){playSfxAudio('assets/audio/sfx/system/sfx_'+n+'.mp3')}
function applySynthVolume(s){const now=s.ctx.currentTime,left=s.end-now;s.gain.gain.cancelScheduledValues(now);if(!sfxOn||sfxVol<=0||left<=0){s.gain.gain.setValueAtTime(0,now);return}const peak=sfxVol*s.base;if(s.steady){s.gain.gain.setValueAtTime(peak*Math.min(1,left/.06),now);if(left>.06)s.gain.gain.setValueAtTime(peak,s.end-.06);s.gain.gain.linearRampToValueAtTime(0,s.end);return}const elapsed=Math.max(0,now-s.start)/(s.end-s.start);s.gain.gain.setValueAtTime(Math.max(1e-5,peak*Math.pow(1e-4,elapsed)),now);s.gain.gain.exponentialRampToValueAtTime(Math.max(1e-5,peak*1e-4),s.end)}
function updateSfxVolume(){activeSfx.forEach((file,a)=>{a.volume=sfxOn?sfxVol*audGain(file)*(a.wardenScale??1):0});activeSynth.forEach(applySynthVolume)}
function attackSfx(charId,weapon,customFile){if(!sfxOn)return;const val=isValorant(charId),id=val?weapon||'default':(charId&&CHARS[charId]&&CHARS[charId].sfx)||charId||'default',file=customFile||(charId==='warden'&&room?.cfg.warden?WARDEN_SOUND.attack:null)||(charId==='kira'?kiraSoundFile(1):null)||(charId==='lkd'?lkdSoundFile(1):null)||(charId==='sad'?sadSoundFile(1):null)||(charId==='firefu'?firefuAttackFile(room?.st?.[room.chars?.indexOf('firefu')]):null)||(val?VALORANT_GUNS[weapon]?.sfx:'assets/audio/sfx/characters/attack_'+id+'.mp3');
  const synth=()=>{if(!sfxOn||sfxVol<=0)return;try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;const ctx=new AC(),cfg={yoshi:[180,'sawtooth',.18],umb:[75,'square',.28],val:[620,'triangle',.16],san:[330,'sine',.22],mat:[240,'square',.2],rien:[520,'triangle',.18],ring:[150,'sawtooth',.24],nut:[110,'square',.2],rean:[700,'sawtooth',.14],shi_faust:[560,'triangle',.15],heathcliff:[95,'sawtooth',.3],default:[440,'triangle',.15]}[id]||[440,'triangle',.15],osc=ctx.createOscillator(),gain=ctx.createGain(),now=ctx.currentTime,voice={ctx,gain,start:now,end:now+cfg[2],base:.28};osc.type=cfg[1];osc.frequency.setValueAtTime(cfg[0],now);osc.frequency.exponentialRampToValueAtTime(Math.max(40,cfg[0]*.42),now+cfg[2]);osc.connect(gain);gain.connect(ctx.destination);activeSynth.add(voice);applySynthVolume(voice);osc.start(now);osc.stop(now+cfg[2]);osc.onended=()=>{activeSynth.delete(voice);ctx.close()}}catch(e){}};
  if(file)playSfxAudio(file,synth);else synth()}
function updAud(){const locked=wardenAudioLocked(),music=document.getElementById('b1'),effects=document.getElementById('b2');music.textContent='🎵 BGM：'+(bgmOn?'開':'關');effects.textContent='🔊 音效：'+(sfxOn?'開':'關');music.disabled=locked;effects.disabled=locked;[['bgm',bgmVol],['sfx',sfxVol]].forEach(([kind,v])=>{const input=document.getElementById(kind+'Volume'),output=document.getElementById(kind+'VolumeValue');if(input){input.min=locked?'1':'0';input.value=Math.round(v*100)}if(output)output.textContent=Math.round(v*100)+'%'})}
function toggleBgm(){bgmOn=wardenAudioLocked()?true:!bgmOn;if(!bgmOn){if(bgm)bgm.pause();if(d25Bgm)d25Bgm.audio.pause()}else syncBgm();updAud()}
function toggleSfx(){sfxOn=wardenAudioLocked()?true:!sfxOn;updateSfxVolume();updAud()}
function updateBgmVolume(){if(bgm)bgm.volume=bgmVol*audGain(bgmSrc);if(d25Bgm)d25Bgm.audio.volume=bgmVol*audGain(d25Bgm.src)}
function saveAudioVolumes(){try{localStorage.setItem(AUDIO_VOLUME_KEY,JSON.stringify({bgm:Math.round(bgmVol*100),sfx:Math.round(sfxVol*100)}))}catch(e){}}
function setBgmVol(v){bgmVol=Math.max(wardenAudioLocked()?1:0,validAudioLevel(Number(v),bgmVol*100))/100;updateBgmVolume();if(wardenAudioLocked())playBgmAudio();saveAudioVolumes();updAud()}
function setSfxVol(v){sfxVol=Math.max(wardenAudioLocked()?1:0,validAudioLevel(Number(v),sfxVol*100))/100;updateSfxVolume();saveAudioVolumes();updAud()}
/* BGM 優先度：看守戰固定0最高；一般角色最高1。25絕技為2，播放一次後恢復戰鬥BGM。 */
const BGM_PRIORITY={'assets/audio/bgm/battle/silverwill.mp3':1,'assets/audio/bgm/battle/verg2.mp3':1,'assets/audio/bgm/battle/jia_qiu.mp3':1,'assets/audio/bgm/battle/red_god.mp3':2,'assets/audio/bgm/battle/enforcer.mp3':2,'assets/audio/bgm/battle/verg.mp3':2,...Object.fromEntries(Object.values(WARDEN_STAGES).map(s=>[s.bgm,0])),...Object.fromEntries(BATTLE_BGM.map(src=>[src,3])),...Object.fromEntries(Object.values(D25_BGM).map(x=>[x.src,x.priority]))};
const BGM_FAILED={};
const bgmPri=u=>BGM_PRIORITY[u]??(u&&u.includes('ex.mp3')?2:3);
function bgmTrack(){if(!room||!['playing','wardenShift','wardenJudgment','wardenContinue','wardenEnding'].includes(room.status)||!room.chars||!room.st)return null;if(room.cfg.warden){if(wardenJudgmentPending()&&wardenJudgmentStep(d25Now()-room.wardenJudgment.startedAt)==='speech')return null;return WARDEN_STAGES[wardenVisualStage(room)].bgm}let t=BATTLE_BGM.includes(room.battleBgm)?room.battleBgm:BATTLE_BGM[0],p=3;const offer=(u,n)=>{if(n<=p){t=u;p=n}};
  room.chars.forEach((c,i)=>{if(c!=='leo'&&c!=='leoc')return;const lm=c==='leo'?null:(room.team&&room.team[i]&&room.team[i].find(m=>m.c==='leo')),
    rev=c==='leo'?room.st[i].revived:!!(lm&&lm.st&&lm.st.revived);if(rev)offer('assets/audio/bgm/battle/silverwill.mp3',1);else offer('assets/audio/bgm/battle/enforcer.mp3',2)});
  if(room.team){const v=room.team.flat().find(m=>m.c==='verg');if(v)offer(v.st&&v.st.vergEgo?'assets/audio/bgm/battle/verg2.mp3':'assets/audio/bgm/battle/verg.mp3',v.st&&v.st.vergEgo?1:2)}
  if(room.chars&&room.st){const i=room.chars.findIndex(c=>c==='verg');if(i>=0)offer(room.st[i].vergEgo?'assets/audio/bgm/battle/verg2.mp3':'assets/audio/bgm/battle/verg.mp3',room.st[i].vergEgo?1:2)}
  if(room.team&&room.team.some(team=>team.some(m=>m.c==='sinclair'&&m.st&&m.st.noble)))offer('assets/audio/bgm/battle/red_god.mp3',2);
  if(room.team&&room.team.some(team=>team.some(m=>m.c==='jia_qiu')&&team.some(m=>m.c==='zilu'&&m.dead)))offer('assets/audio/bgm/battle/jia_qiu.mp3',1);return t}
function crisisBgmEvent(){
  if(room?.cfg.warden)return null;
  const crisisSeat=Number.isInteger(room?.env?.frenzyBgmSeat)?room.env.frenzyBgmSeat:(room?.d25||[]).findIndex(d=>d.used&&d.aura?.crisis);
  if(['playing','over'].includes(room?.status)&&crisisSeat>=0){const aura=room.d25[crisisSeat].aura,track=D25_BGM[aura.char];if(track)return{...track,crisis:true,key:`${code}:${room.roundBase||1}:${crisisSeat}:crisis:${aura.start}`}}return null;
}
function d25BgmEvent(){
  if(room?.cfg.warden)return null;
  const crisis=crisisBgmEvent();if(crisis)return crisis;
  if(!room||isoPending()||valorantShopPending()||mirrorPending()||envSilent(room)||room.status!=='playing'||d25DrawPending())return null;
  const seat=room.d25Banner&&room.d25Banner.round===room.round?room.d25Banner.seat:(room.d25||[]).findIndex(d=>d&&d.ready&&!d.used);
  if(seat<0)return null;
  const track=D25_BGM[room.chars&&room.chars[seat]];
  return track?{...track,key:`${code}:${room.roundBase||1}:${seat}`}:null;
}
function resetBgm(){
  if(bgm)try{bgm.pause()}catch(e){}
  if(d25Bgm){d25Bgm.audio.onended=null;d25Bgm.audio.onerror=null;try{d25Bgm.audio.pause()}catch(e){}}
  bgm=null;bgmSrc=null;d25Bgm=null;bgmMatchKey=null;D25_BGM_DONE.clear();
}
function finishD25Bgm(playback,failed=false,resume=true){
  if(d25Bgm!==playback)return;
  if(failed)BGM_FAILED[playback.src]=true;
  playback.audio.onended=null;playback.audio.onerror=null;try{playback.audio.pause()}catch(e){}
  d25Bgm=null;if(resume)syncBgm();
}
function playBgmAudio(){
  updateBgmVolume();const audio=d25Bgm?d25Bgm.audio:bgm;
  if(!bgmOn||!audio||!audio.paused)return;
  audio.play().catch(e=>{if(e&&e.name==='NotSupportedError'&&d25Bgm&&d25Bgm.audio===audio)finishD25Bgm(d25Bgm,true)});
}
function syncBgm(){
  const t=bgmTrack();if(!t&&!crisisBgmEvent()){resetBgm();return}
  const matchKey=`${code}:${room.roundBase||1}`;
  if(bgmMatchKey!==matchKey){resetBgm();bgmMatchKey=matchKey}
  if(t&&t!==bgmSrc&&(!bgmSrc||bgmPri(t)<=bgmPri(bgmSrc))){
    if(bgm)try{bgm.pause()}catch(e){}
    bgmSrc=t;bgm=new Audio(audioSource(t));bgm.loop=true;
  }
  if(!t&&bgm)bgm.pause();
  if(d25Bgm&&bgmPri(bgmSrc)<d25Bgm.priority)finishD25Bgm(d25Bgm,false,false);
  const event=d25BgmEvent();
  if(d25Bgm&&event?.crisis&&d25Bgm.key!==event.key&&!D25_BGM_DONE.has(event.key)){
    if(d25Bgm.src===event.src){D25_BGM_DONE.add(event.key);d25Bgm.key=event.key}else finishD25Bgm(d25Bgm,false,false);
  }
  if(!d25Bgm&&event&&!D25_BGM_DONE.has(event.key)){
    D25_BGM_DONE.add(event.key);
    if(!BGM_FAILED[event.src]&&bgmPri(bgmSrc)>=event.priority){
      try{
        const audio=new Audio(audioSource(event.src)),playback={...event,audio};
        audio.loop=event.loop;audio.onended=()=>finishD25Bgm(playback);audio.onerror=()=>finishD25Bgm(playback,true);
        if(bgm)bgm.pause();d25Bgm=playback;
      }catch(e){BGM_FAILED[event.src]=true}
    }
  }
  if(t||d25Bgm)playBgmAudio();
}
function playFx(L){const cues=L.soundCues||[],combat=scheduleCombatFx(L.combat,L.chars||room?.chars),healing=scheduleHealingFx(L.healing,combat);startWardenBeamCues(combat,L);holdWardenNailHp(combat);combatFx.pending.push(...combat);healingFx.pending.push(...healing);damageFx.pending.push(...(L.damage||[]).map((e,n)=>{if(e.environment==='allIn')return{...e,delay:Math.max(300,...combat.map(c=>combatDamageDelay(c)+160),...healing.map(h=>h.delay+600))};const hit=combat.find(c=>c.damageIndex===n);return hit?{...e,delay:combatDamageDelay(hit)}:e}),...healing.map(e=>({...e,healing:true})));(L.hits||[]).forEach(i=>{const k=(L.chars&&L.chars[i])||(room.chars&&room.chars[i]);if(i===1&&room?.cfg.warden&&combat.some(e=>e.attackKind==='wardenExecution')||cues.some(e=>e.seat===i&&(e.replaceAttack||k==='sad'&&e.file!==sadSoundFile(2))))return;attackSfx(k||'default',L.weapons?L.weapons[i]:room.st?.[i]?.gun,L.firefuSounds?.[i])});cues.forEach(e=>playSfxAudio(e.file));if((L.log||[]).some(x=>x.includes('發動')))sfx('skill')}
function d25AuraOf(i){
  const d=room&&room.d25&&room.d25[i];if(!d||!d.used)return null;
  const a=d.aura,e=room.instantFx;
  const char=a?a.char:(e&&e.seat===i&&e.chars?e.chars[i]:room.chars[i]);
  return{key:`${code}:${room.roundBase||1}:${i}`,seat:i,char,start:a&&a.start||0,crisis:!!a?.crisis};
}
function d25AuraUI(i,compact=false){
  const f=d25AuraOf(i);if(!f)return'';
  const elapsed=Math.max(0,Date.now()-f.start),delay=`--aura-delay:-${elapsed}ms`,marker=`data-d25-aura-key="${esc(f.key)}" data-d25-caster="${i}" aria-hidden="true"`;
  const particles=Array.from({length:24},(_,n)=>{const angle=n*Math.PI/12,dx=Math.cos(angle),dy=Math.sin(angle),duration=2200+n%5*400;return`<i class="d25-spark" style="--x:${(50+dx*(16+n%3*4)).toFixed(1)}%;--y:${(54+dy*(16+n%4*3)).toFixed(1)}%;--size:${2+n%3}px;--drift-x:calc(var(--spread-x) * ${dx.toFixed(3)});--drift-y:calc(var(--spread-y) * ${dy.toFixed(3)});--duration:${duration}ms;--spark-delay:-${(elapsed+n*431)%duration}ms"></i>`}).join('');
  const embers=f.crisis?Array.from({length:20},(_,n)=>{const dx=(n%2?1:-1)*(.25+n%5*.17),duration=1900+n%6*280;return`<i class="d25-spark crisis-ember" style="--x:${26+n*17%49}%;--y:${46+n*13%39}%;--size:${2+n%3}px;--drift-x:calc(var(--spread-x) * ${dx.toFixed(2)});--drift-y:calc(var(--spread-y) * -${1+n%4*.28});--duration:${duration}ms;--spark-delay:-${(elapsed+n*307)%duration}ms"></i>`}).join(''):'';
  const aura=`<div class="d25-aura${f.crisis?' d25-crisis-aura':''}" ${compact?'':marker} style="${delay}">${particles}${embers}</div>`;
  if(!compact)return f.char===room.chars[i]?aura:'';
  const k=imgK(f.char||'default'),name=CHARS[f.char]?CHARS[f.char].n:'角色';
  return`<div class="d25-caster-preview" ${marker} style="${delay}"><div class="d25-mini-portrait"><img data-k="${k}" data-p="left" data-s="0" src="${charArtSrc(k,'left')}" onerror="imgFb(this)">${aura}</div><span>${esc(name)}・25絕技已發動</span></div>`;
}
function wardenBoonsUI(i){if(!room.cfg.warden||i===1||!wardenTipherethActive(room.st[i])||room.hp[i]<=0)return'';const elapsed=Math.max(0,d25Now()-(room.wardenTipherethAt||0)),sparks=Array.from({length:16},(_,n)=>{const a=n*Math.PI/8;return `<i class="d25-spark" style="--x:${50+Math.cos(a)*22}%;--y:${54+Math.sin(a)*26}%;--size:${2+n%3}px;--drift-x:calc(var(--spread-x) * ${Math.cos(a)});--drift-y:calc(var(--spread-y) * ${Math.sin(a)});--duration:${2200+n%5*400}ms;--spark-delay:-${elapsed+n*431}ms"></i>`}).join('');return `<div class="d25-aura warden-tiphereth-aura" aria-hidden="true" style="--aura-delay:-${elapsed}ms">${sparks}</div>${room.st[i].wardenGebura?`<img class="warden-gebura-mark" src="${WARDEN_BOON_ART.gebura}" alt="Gebura之刃">`:''}`}
function syncInstantFx(){const e=room&&room.instantFx;if(!e)return;const key=`${code}:${room.roundBase||1}:${e.id}`;if(key===lastInstantFxKey)return;lastInstantFxKey=key;playFx(e)}
function shownRound(n=room.round){return n-(room.roundBase||1)+1}
// 先使用角色自己的方向／共用圖，缺圖統一使用test；素材代號與角色／音樂資料分開。
function imgFb(im){const k=im.dataset.k,p=im.dataset.p,own=[charArtSrc(k,p),charArtSrc(k)];
  if(k==='heathcliff2')own.push(charArtSrc('heathcliff',p),charArtSrc('heathcliff'));
  const paths=[...new Set([...own,charArtSrc('test')])],n=+im.dataset.s+1;
  if(n<paths.length){im.dataset.s=n;im.src=paths[n]}else im.style.display='none';
}
/* ---------- 二十五之刻 & 25絕技 UI ---------- */
let lastSeenD25Round = -1,lastSeenD25Key='',d25BannerSeq=0,d25BannerDismissed = false,hostClockOffset=0;
const d25ClickSeq={},d25ClickWindows={};
const D25_CONTEST_BASE=5,D25_CLICK_LIMIT=15;
const d25Now=()=>Date.now()+((test||isHost)?0:hostClockOffset);
// 花屏採房主時間軸；本機只維護遮罩與音訊，不推進戰鬥狀態。
let wardenIntroFx=null,wardenIntroSeen='',wardenSpeechSeen='',wardenIntroTimer=null,wardenIntroTimerKey='';
function scheduleWardenIntroTick(r){const key=`${code}:${r.wardenIntro.id}`;if(wardenIntroTimer!==null&&wardenIntroTimerKey===key)return;clearTimeout(wardenIntroTimer);wardenIntroTimerKey=key;wardenIntroTimer=setTimeout(()=>{wardenIntroTimer=null;if(wardenIntroPending()&&`${code}:${room.wardenIntro.id}`===key)tick()},Math.max(1,r.wardenIntro.endsAt-Date.now()))}
function wardenNoise(seed){let n=seed||1;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296}}
function stopWardenIntroFx(reset=false){
  clearTimeout(wardenIntroTimer);wardenIntroTimer=null;wardenIntroTimerKey='';
  if(wardenIntroFx){const fx=wardenIntroFx;wardenIntroFx=null;if(fx.raf!==null&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(fx.raf);stopWardenCues(fx);fx.layer?.remove();fx.voice?.dispose();stopWardenIntroSpeech(fx)}
  if(reset){wardenIntroSeen='';wardenSpeechSeen=''}
}
function stopWardenIntroSpeech(fx){const a=fx.speech;if(!a)return;fx.speech=null;a.onended=a.onerror=a.onloadedmetadata=null;activeSfx.delete(a);try{a.pause()}catch(e){}}
function prepareWardenIntroSpeech(fx,intro){
  if(d25Now()>=intro.startedAt+WARDEN_INTRO_MS+WARDEN_OPENING.voiceMs||wardenSpeechSeen===fx.key)return;
  try{const a=new Audio(audioSource(WARDEN_OPENING.file));fx.speech=a;a.preload='auto';a.onerror=()=>stopWardenIntroSpeech(fx);a.onended=()=>stopWardenIntroSpeech(fx);a.load?.()}catch(e){stopWardenIntroSpeech(fx)}
}
function playWardenIntroSpeech(fx,intro){
  if(fx.speechStarted)return;fx.speechStarted=true;
  if(wardenSpeechSeen===fx.key||!sfxOn||sfxVol<=0){stopWardenIntroSpeech(fx);return}wardenSpeechSeen=fx.key;
  const a=fx.speech;if(!a)return;
  // 預載與延遲加入都依房主時鐘定位；語音結束或載入失敗不影響開局時間。
  const align=()=>{const elapsed=d25Now()-intro.startedAt-WARDEN_INTRO_MS;if(wardenIntroFx!==fx||elapsed<0||elapsed>=WARDEN_OPENING.voiceMs){stopWardenIntroSpeech(fx);return false}try{a.currentTime=elapsed/1000}catch(e){}return true};
  a.onloadedmetadata=align;if(!align())return;activeSfx.set(a,WARDEN_OPENING.file);a.volume=sfxVol*audGain(WARDEN_OPENING.file);
  try{a.play().catch(()=>stopWardenIntroSpeech(fx))}catch(e){stopWardenIntroSpeech(fx)}
}
function wardenIntroSound(intro){
  const elapsed=Math.max(0,d25Now()-intro.startedAt),left=intro.endsAt-d25Now()-160;if(!sfxOn||sfxVol<=0||left<=0)return null;
  let ctx=null,voice=null;try{
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;ctx=new AC();
    const duration=left/1000,buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),samples=buffer.getChannelData(0),noise=wardenNoise(4134),source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),now=ctx.currentTime;
    // 同步脈衝白雜訊：短暫斷續、低頻電流底噪，結尾收音後黑屏。
    for(let i=0;i<samples.length;i++){const t=i/ctx.sampleRate+elapsed/1000,pulse=t%.23<.14?1:.12;samples[i]=((noise()*2-1)*.72+Math.sin(t*2*Math.PI*90)*.18)*pulse}
    source.buffer=buffer;filter.type='bandpass';filter.frequency.setValueAtTime(1800,now);filter.Q.setValueAtTime(.65,now);source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);
    let disposed=false;voice={ctx,gain,start:now,end:now+duration,base:.22,steady:true,dispose(){if(disposed)return;disposed=true;activeSynth.delete(voice);source.onended=null;try{source.stop()}catch(e){}try{ctx.close()?.catch(()=>{})}catch(e){}}};
    activeSynth.add(voice);applySynthVolume(voice);source.onended=()=>voice.dispose();source.start(now);source.stop(voice.end);
    if(ctx.state==='suspended')ctx.resume().catch(()=>voice.dispose());return voice;
  }catch(e){if(voice)voice.dispose();else if(ctx)try{ctx.close()?.catch(()=>{})}catch(ignore){}return null}
}
function drawWardenIntro(fx){
  if(wardenIntroFx!==fx||!wardenIntroPending()||`${code}:${room.wardenIntro.id}`!==fx.key)return;
  const elapsed=Math.max(0,d25Now()-room.wardenIntro.startedAt),black=elapsed>=WARDEN_INTRO_MS-160,frame=Math.floor(elapsed/50);fx.layer?.classList.toggle('blackout',black);
  if(black){fx.voice?.dispose();fx.voice=null}
  if(elapsed>=WARDEN_INTRO_MS)playWardenIntroSpeech(fx,room.wardenIntro);
  if(elapsed>=WARDEN_INTRO_MS+WARDEN_OPENING.voiceMs)stopWardenIntroSpeech(fx);
  if(fx.caption){const age=elapsed-WARDEN_INTRO_MS-WARDEN_OPENING.typeDelay,chars=Array.from(WARDEN_OPENING.text),count=age<0?0:Math.min(chars.length,1+Math.floor(age/WARDEN_OPENING.typeMs*(chars.length-1)));fx.caption.textContent=chars.slice(0,count).join('');fx.caption.classList.toggle('typing',count>0&&count<chars.length)}
  if(!black&&fx.ctx&&frame!==fx.frame){try{
    fx.frame=frame;const ctx=fx.ctx,noise=wardenNoise(4134+frame*7919),pixels=ctx.createImageData(320,180);
    for(let i=0;i<pixels.data.length;i+=4){const value=Math.floor(noise()*86);pixels.data[i]=value;pixels.data[i+1]=value+5;pixels.data[i+2]=value+9;pixels.data[i+3]=255}ctx.putImageData(pixels,0,0);
    // 水平撕裂與錯位色帶，隨時間而非遊戲亂數變動。
    for(let i=0;i<12;i++){const y=Math.floor(noise()*180),h=1+Math.floor(noise()*9),x=Math.floor(noise()*70)-35;ctx.fillStyle=i%3===0?'#69a9a866':i%3===1?'#943c6666':'#c4d0c066';ctx.fillRect(x,y,320,h);ctx.fillStyle='#03090ce0';ctx.fillRect(0,y+h,320,1)}
  }catch(e){fx.ctx=null}}
  fx.raf=requestAnimationFrame(()=>drawWardenIntro(fx));
}
function syncWardenIntroFx(){
  if(!wardenIntroPending()){stopWardenIntroFx();return}
  const intro=room.wardenIntro,key=`${code}:${intro.id}`;if(wardenIntroFx?.key===key)return;
  stopWardenIntroFx();const fx={key,layer:null,caption:null,ctx:null,raf:null,frame:-1,voice:null,speech:null,speechStarted:false};wardenIntroFx=fx;
  if(document.body&&document.createElement){const layer=document.createElement('div'),canvas=document.createElement('canvas'),caption=document.createElement('div');layer.id='wardenIntroLayer';layer.className='warden-intro';canvas.setAttribute('aria-hidden','true');canvas.width=320;canvas.height=180;caption.className='warden-intro-caption';layer.appendChild(canvas);layer.appendChild(caption);document.body.appendChild(layer);fx.layer=layer;fx.caption=caption;try{fx.ctx=canvas.getContext('2d',{alpha:false})}catch(e){}}
  prepareWardenIntroSpeech(fx,intro);
  if(wardenIntroSeen!==key){wardenIntroSeen=key;fx.voice=wardenIntroSound({...intro,endsAt:intro.startedAt+WARDEN_INTRO_MS})}drawWardenIntro(fx);
  if(test||isHost)scheduleWardenIntroTick(room);
}
let wardenShiftFx=null,wardenShiftSeen='',wardenShiftTimer=null,wardenShiftTimerKey='';
function scheduleWardenShiftTick(r){const shift=r.wardenShift,id=`${code}:${shift.id}`,at=nextWardenShiftAt(r),key=`${id}:${at}`;if(wardenShiftTimer!==null&&wardenShiftTimerKey===key)return;clearTimeout(wardenShiftTimer);wardenShiftTimerKey=key;wardenShiftTimer=setTimeout(()=>{wardenShiftTimer=null;if(wardenShiftPending()&&`${code}:${room.wardenShift.id}`===id)tick()},Math.max(1,at-Date.now()))}
function stopWardenShiftFx(reset=false){clearTimeout(wardenShiftTimer);wardenShiftTimer=null;wardenShiftTimerKey='';document.body?.setAttribute('data-warden-shift-step','');if(wardenShiftFx){const fx=wardenShiftFx;wardenShiftFx=null;if(fx.raf!==null&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(fx.raf);stopWardenCues(fx);fx.layer?.remove();fx.voice?.dispose()}if(reset)wardenShiftSeen=''}
function wardenShiftStep(age){return age>=WARDEN_SHIFT_MS-160?'blackout':age>=2400?'screen':age>=1700?'characters':age>=900?'hand':'health'}
function wardenFinalShiftStep(age){return age>=WARDEN_FINAL_REVEAL_MS?'growth':age>=6900?'noise':age>=5900?'warp':age>=WARDEN_FINAL.holdMs?'tear':'victory'}
function wardenFalseVictoryUI(){const winner=room.hp[0]>0?0:2,label=`🏆 挑戰者方（${room.seats[winner].name}）獲勝！`,content=`<div class="warden-false-content"><div class="mut">${test?'🧪 目前操作：'+esc(room.seats[rd()]?.name||''):''}</div><b class="warden-false-title" data-label="${esc(label)}">${esc(label)}</b><div class="row"><button class="pri" disabled>再來一場</button><button disabled>離開房間</button></div></div>`;return `<div class="warden-false-victory">${wardenArena(content,true).replace(/\s(?:onclick|ondrop|ondragover|ondragstart|oninput|onchange)="[^"]*"/g,'')}</div>`}
function wardenNoiseRect(selector,fallback){const el=document.getElementById('app').querySelector?.(selector),rect=el?.getBoundingClientRect(),w=window.innerWidth||1280,h=window.innerHeight||720;return rect&&rect.width>0&&rect.height>0?{x:rect.left/w,y:rect.top/h,w:rect.width/w,h:rect.height/h}:fallback}
function wardenShiftMask(){
  // 每塊的位置與出現時間只建立一次；重繪、跳幀與延遲同步都保留同一覆蓋次序。
  const times=new Float32Array(320*180).fill(Infinity),noise=wardenNoise(4134),zones=[
    [wardenNoiseRect('.warden-keeper .bar',{x:.63,y:.6,w:.31,h:.014}),0,900],
    [wardenNoiseRect('.combat-actions',{x:0,y:.75,w:1,h:.25}),900,1700],
    ...[0,2,1].map(i=>[wardenNoiseRect(`[data-warden-seat="${i}"] .art-wrap`,i===1?{x:.63,y:.09,w:.31,h:.48}:{x:.03,y:i===0?.09:.42,w:.29,h:.25}),1700,2400]),
    [{x:0,y:0,w:1,h:1},2400,3800]
  ];
  for(const [rect,start,end] of zones){
    const left=Math.max(0,Math.floor(rect.x*320+1e-7)),top=Math.max(0,Math.floor(rect.y*180+1e-7)),right=Math.min(320,Math.ceil((rect.x+rect.w)*320-1e-7)),bottom=Math.min(180,Math.ceil((rect.y+rect.h)*180-1e-7)),tiles=[];
    for(let y=Math.floor(top/10)*10;y<bottom;y+=10)for(let x=Math.floor(left/16)*16;x<right;x+=16)tiles.push({x,y});
    for(let i=tiles.length-1;i>0;i--){const j=Math.floor(noise()*(i+1));[tiles[i],tiles[j]]=[tiles[j],tiles[i]]}
    tiles.forEach(({x,y},i)=>{const at=start+i/tiles.length*(end-start);for(let py=Math.max(top,y);py<Math.min(bottom,y+10);py++)for(let px=Math.max(left,x);px<Math.min(right,x+16);px++){const p=py*320+px;times[p]=Math.min(times[p],at)}});
  }
  return times;
}
function drawWardenShift(fx){
  if(wardenShiftFx!==fx||!wardenShiftPending()||`${code}:${room.wardenShift.id}`!==fx.key)return;
  if(room.wardenShift.from===2){drawWardenFinalShift(fx);return}
  const age=Math.max(0,d25Now()-room.wardenShift.startedAt),step=wardenShiftStep(age),frame=Math.floor(age/50);fx.layer?.classList.toggle('blackout',step==='blackout');fx.layer?.setAttribute('data-noise-step',step);
  if(step!=='blackout'&&fx.ctx&&frame!==fx.frame){try{
    fx.frame=frame;const noise=wardenNoise(4134+frame*7919),ctx=fx.ctx,pixels=ctx.createImageData(320,180),mask=fx.mask||(fx.mask=wardenShiftMask());
    for(let y=0;y<180;y++)for(let x=0;x<320;x++){const p=y*320+x,offset=p*4,v=Math.floor(noise()*172);pixels.data[offset]=v;pixels.data[offset+1]=v+(y%9===0?45:5);pixels.data[offset+2]=v+10;pixels.data[offset+3]=age>=mask[p]?255:0}ctx.putImageData(pixels,0,0);
  }catch(e){fx.ctx=null}}
  fx.raf=requestAnimationFrame(()=>drawWardenShift(fx));
}
function drawWardenFinalShift(fx){
  const age=Math.max(0,d25Now()-room.wardenShift.startedAt),step=wardenFinalShiftStep(age),frame=`${Math.floor(age/50)}:${step==='growth'?wardenGrowthStep(age-WARDEN_FINAL_REVEAL_MS)+':'+Number(wardenGrowthNoise(age-WARDEN_FINAL_REVEAL_MS)):step}`,quiet=!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  fx.layer?.setAttribute('data-noise-step',step);document.body?.setAttribute('data-warden-shift-step',step);
  // 假勝利五秒後才有電流聲與撕裂；延遲接入只播放剩餘片段。
  if(age>=WARDEN_FINAL.holdMs&&age<WARDEN_FINAL_REVEAL_MS&&!fx.soundStarted){fx.soundStarted=true;if(wardenShiftSeen!==fx.key){wardenShiftSeen=fx.key;fx.voice=wardenIntroSound({...room.wardenShift,startedAt:room.wardenShift.startedAt+WARDEN_FINAL.holdMs,endsAt:room.wardenShift.startedAt+WARDEN_FINAL_REVEAL_MS})}}
  if(age>=WARDEN_FINAL_REVEAL_MS&&fx.voice){fx.voice.dispose();fx.voice=null}
  if(fx.ctx&&frame!==fx.frame){try{
    fx.frame=frame;const ctx=fx.ctx,pixels=ctx.createImageData(320,180),noise=wardenNoise(4134+frame*7919),progress=Math.min(1,Math.max(0,(age-6900)/1050));
    const bar=step==='growth'&&wardenGrowthNoise(age-WARDEN_FINAL_REVEAL_MS)?wardenNoiseRect('.warden-keeper .bar',{x:.63,y:.6,w:.31,h:.014}):null;if(bar){bar.y-=1/180;bar.h+=2/180}
    for(let y=0;y<180;y++){const stripe=noise(),shift=Math.floor(noise()*80);for(let x=0;x<320;x++){const p=(y*320+x)*4,v=Math.floor(noise()*190);pixels.data[p]=v+((y+shift)%13===0?65:0);pixels.data[p+1]=v;pixels.data[p+2]=v+30;pixels.data[p+3]=bar&&x/320>=bar.x&&x/320<=bar.x+bar.w&&y/180>=bar.y&&y/180<=bar.y+bar.h?255:step==='noise'?(quiet?Math.round(progress*255):noise()<progress?255:0):!quiet&&step==='warp'&&stripe>.76?150:!quiet&&step==='tear'&&y<28&&stripe>.86?170:0}}
    ctx.putImageData(pixels,0,0);
  }catch(e){fx.ctx=null}}
  fx.raf=requestAnimationFrame(()=>drawWardenShift(fx));
}
function syncWardenShiftFx(){
  if(!wardenShiftPending()){stopWardenShiftFx();return}const shift=room.wardenShift,key=`${code}:${shift.id}`;if(test||isHost)scheduleWardenShiftTick(room);if(wardenShiftFx?.key===key){drawWardenShiftState();return}
  stopWardenShiftFx();const fx={key,layer:null,ctx:null,raf:null,frame:-1,voice:null};wardenShiftFx=fx;
  if(document.body&&document.createElement){const layer=document.createElement('div'),canvas=document.createElement('canvas');layer.id='wardenShiftLayer';layer.className='warden-intro warden-shift-noise';layer.setAttribute('aria-hidden','true');canvas.width=320;canvas.height=180;layer.appendChild(canvas);document.body.appendChild(layer);fx.layer=layer;try{fx.ctx=canvas.getContext('2d')}catch(e){}}
  if(shift.from===2){preloadWardenCue(WARDEN_SOUND.rain);preloadWardenCue(WARDEN_TIPHERETH.file);preloadWardenCue(WARDEN_FINAL.skill);fx.layer?.classList.add('warden-final-shift');queueWardenCue(fx,WARDEN_SOUND.growth,shift.startedAt+WARDEN_FINAL_REVEAL_MS,3375)}else if(wardenShiftSeen!==key){wardenShiftSeen=key;fx.voice=wardenIntroSound(shift)}drawWardenShift(fx);if(test||isHost)scheduleWardenShiftTick(room);
}
function drawWardenShiftState(){if(room.wardenShift.from===2)document.body?.setAttribute('data-warden-shift-step',wardenFinalShiftStep(Math.max(0,d25Now()-room.wardenShift.startedAt)))}
// 第三階段首次登場時定位於兩組VS中心；移回新場地時接續原動畫時間。
let wardenFinalFx=null;
function stopWardenFinalFx(){if(!wardenFinalFx)return;const fx=wardenFinalFx;wardenFinalFx=null;if(fx.raf!==null)cancelAnimationFrame(fx.raf);stopWardenCues(fx);fx.lightLayer?.remove();fx.layer?.remove()}
function mountWardenFinalLight(){
  const fx=wardenFinalFx,light=fx?.lightLayer,shell=document.getElementById('app').querySelector?.('.warden-shell');if(!light||!shell)return;
  if(!fx.anchor){const rect=wardenNoiseRect('.warden-clashes',{x:.36,y:.18,w:.25,h:.42});fx.anchor={x:(rect.x+rect.w*.5)*100,y:(rect.y+rect.h*.5)*100};light.style.setProperty('--lux-x',`${fx.anchor.x}vw`);light.style.setProperty('--lux-y',`${fx.anchor.y}vh`)}
  if(light.parentNode!==shell){
    // 移除、重插DOM會重新啟動CSS動畫；以負延遲回到目前進度，不再從零縮放登場。
    light.style.setProperty('--final-age',`${-Math.max(0,d25Now()-fx.at)}ms`);light.remove();shell.appendChild(light);
  }
}
function drawWardenFinalFx(fx){
  if(wardenFinalFx!==fx)return;const age=Math.max(0,d25Now()-fx.at);
  const step=age<900?'lux':age<2700?'burst':'steady';fx.layer.setAttribute('data-final-step',step);fx.lightLayer.setAttribute('data-final-step',step);mountWardenFinalLight();fx.raf=requestAnimationFrame(()=>drawWardenFinalFx(fx));
}
function syncWardenFinalFx(){
  if(!room?.cfg.warden||!room.st||wardenVisualStage(room)!==3||!['playing','over','wardenShift','wardenJudgment','wardenEnding'].includes(room.status)){stopWardenFinalFx();return}
  const at=room.wardenFinalAt||0,key=`${code}:${room.roundBase}:${at}`;if(wardenFinalFx?.key===key)return;stopWardenFinalFx();
  const layer=document.createElement('div'),light=document.createElement('div');layer.id='wardenFinalLayer';layer.className='warden-final-fx';light.id='wardenFinalLightLayer';light.className='warden-light-fx';for(const el of [layer,light]){el.setAttribute('aria-hidden','true');el.style.setProperty('--final-age',`${-Math.max(0,d25Now()-at)}ms`)}
  const frame=`<img src="${esc(WARDEN_FINAL.frame)}" alt="">`;
  light.innerHTML=`<div class="warden-lux-glory"><i class="warden-lux-halo"></i><img class="warden-lux" src="${esc(WARDEN_FINAL.lux)}" alt="">${Array.from({length:18},(_,n)=>`<i class="warden-lux-ray" style="--ray-angle:${n*20-8}deg;--ray-width:${n%3===0?26:8}px;--ray-length:${n%4===0?110:74}vmax"></i>`).join('')}</div>`;
  layer.innerHTML=`<div class="warden-gold-frame">${frame}${Array.from({length:12},(_,n)=>`<div class="warden-frame-tear" style="--frame-cut:${n<4?`${n%2?88:2}% ${n%2?4:79}% ${n%2?2:88}% ${n%2?79:4}%`:n<8?`${n%2?0:92}% ${15+(n-4)*17}% ${n%2?92:0}% ${64-(n-4)*17}%`:`${15+(n-8)*18}% ${n%2?92:0}% ${64-(n-8)*18}% ${n%2?0:92}%`};--frame-cycle:${7100+n*530}ms;--frame-delay:${900+n*211}ms;--frame-offset:${n%2?9:-9}px">${frame}</div>`).join('')}</div>`;
  document.body.appendChild(layer);document.body.appendChild(light);const fx={key,at,layer,lightLayer:light,raf:null};wardenFinalFx=fx;preloadWardenCue(WARDEN_FINAL.skill);queueWardenCue(fx,WARDEN_FINAL.skill,at,WARDEN_FINAL.skillMs);drawWardenFinalFx(fx);
}
let wardenJudgmentFx=null,wardenJudgmentTimer=null,wardenJudgmentTimerKey='';
function scheduleWardenJudgmentTick(r){const J=r.wardenJudgment,at=nextWardenJudgmentAt(r),key=`${code}:${J.id}:${at}`;if(wardenJudgmentTimer!==null&&wardenJudgmentTimerKey===key)return;clearTimeout(wardenJudgmentTimer);wardenJudgmentTimer=null;wardenJudgmentTimerKey=key;if(!Number.isFinite(at))return;wardenJudgmentTimer=setTimeout(()=>{wardenJudgmentTimer=null;if(wardenJudgmentPending()&&room.wardenJudgment.id===J.id)tick()},Math.max(1,at-Date.now()))}
function stopWardenJudgmentFx(){clearTimeout(wardenJudgmentTimer);wardenJudgmentTimer=null;wardenJudgmentTimerKey='';if(wardenJudgmentFx){const fx=wardenJudgmentFx;wardenJudgmentFx=null;if(fx.raf!==null)cancelAnimationFrame(fx.raf);stopWardenCues(fx);fx.layer.remove();fx.meaningLayer.remove();fx.choiceLayer.remove()}document.body?.setAttribute('data-warden-judgment-step','');document.body?.style.setProperty('--judgment-shake-age','0ms')}
function wardenJudgmentStep(age,J=room?.wardenJudgment){return J?.speechAt!=null?J.startedAt+age>=J.restoreAt?'rise':'speech':age>=WARDEN_JUDGMENT.choiceAt?'choice':age>=WARDEN_JUDGMENT.epsilonAt?'epsilon':age>=WARDEN_JUDGMENT.rainAt?'rain':age>=WARDEN_JUDGMENT.shatterAt?'shatter':'cards'}
function wardenJudgmentChoiceUI(){const i=rd(),mine=[0,2].includes(i),vote=mine&&moves[wardenJudgmentVoteKey(room,i)],refused=vote?.yes===false,broken=vote?.yes===true;
  const shards=Array.from({length:8},(_,n)=>`<span class="warden-choice-shard" style="--choice-cut:${Math.floor(n/4)*50}% ${(3-n%4)*25}% ${(1-Math.floor(n/4))*50}% ${n%4*25}%;--choice-x:${(n%4-1.5)*42}px;--choice-y:${Math.floor(n/4)?100:-35}px;--choice-turn:${(n-3.5)*13}deg">是</span>`).join('');
  return `<div class="warden-judgment-choice"><p id="wardenJudgmentQuestion">就此放棄嗎...?</p>${mine&&!refused?`<div class="warden-choice-actions">${broken?`<span class="warden-choice-broken" aria-hidden="true">${shards}</span>`:'<button onclick="voteWardenJudgment(true)">是</button>'}<button onclick="voteWardenJudgment(false)">否</button></div>`:`<small>${mine?'等待另一位挑戰者':'等待兩位挑戰者選擇'}</small>`}</div>`;
}
function updateWardenJudgmentChoice(fx){const J=room.wardenJudgment;fx.choiceLayer.hidden=!wardenJudgmentChoicePending();if(!fx.choiceLayer.hidden){const i=rd(),key=JSON.stringify([i,[0,2].includes(i)?moves[wardenJudgmentVoteKey(room,i)]?.yes:null]);if(fx.choiceKey!==key){fx.choiceKey=key;fx.choiceLayer.innerHTML=wardenJudgmentChoiceUI()}}if(J.speechAt!=null&&!fx.speechQueued){fx.speechQueued=true;queueWardenCue(fx,WARDEN_TIPHERETH.file,J.speechAt,WARDEN_TIPHERETH.voiceMs)}}
function judgmentRect(selector,fallback){const rect=wardenNoiseRect(selector,fallback);return{x:rect.x*(window.innerWidth||1280),y:rect.y*(window.innerHeight||720),w:rect.w*(window.innerWidth||1280),h:rect.h*(window.innerHeight||720)}}
function judgmentNail(x,y,size,at,dx,dy){const angle=Math.atan2(-dx,-dy)*180/Math.PI;return `<div class="warden-judgment-nail" style="left:${x}px;top:${y}px;width:${size}px;height:${size}px;--j-at:calc(var(--judgment-age) + ${at}ms);--j-impact:calc(var(--judgment-age) + ${at+120}ms);--j-dx:${dx}px;--j-dy:${dy}px;--j-angle:${angle}deg"><div class="warden-judgment-flight"><div class="warden-judgment-angle"><i class="warden-nail-speed"></i><i class="warden-nail-glow"></i><img class="warden-nail-art" src="${esc(WARDEN_NAIL.src)}" alt=""></div></div><i class="warden-judgment-wave"></i><i class="warden-judgment-wave echo"></i><i class="warden-judgment-flash"></i></div>`}
function judgmentRock(x,y,size,at,fall,dx,turn){return `<div class="warden-judgment-rock" style="left:${x}px;top:${y}px;width:${size}px;height:${size}px;--j-at:calc(var(--judgment-age) + ${at}ms);--j-impact:calc(var(--judgment-age) + ${at+fall}ms);--rock-fall:${fall}ms;--rock-dx:${dx}px;--rock-dy:${-y-size*4}px;--rock-turn:${turn}deg"><div class="warden-rock-flight"><i class="warden-rock-trail"></i><i class="warden-rock-stone"></i></div><i class="warden-judgment-wave"></i><i class="warden-judgment-wave echo"></i><i class="warden-rock-burst"></i></div>`}
function buildWardenJudgmentFx(J){
  const noise=wardenNoise(4134+J.startedAt),out=[];
  for(const i of [0,2]){const rect=judgmentRect(`.clash-slot[data-clash-seat="${i}"] .pc`,{x:.39,y:i===0?.2:.5,w:.05,h:.1}),count=3+Math.floor(noise()*3),card=room.last?.plays.find(p=>p.i===i)?.card;
    if(card){for(let n=0;n<count;n++)out.push(judgmentNail(rect.x+rect.w*(.2+noise()*.6),rect.y+rect.h*.55,80,260+n*160,(noise()-.5)*260,-rect.y-160));
      for(let n=0;n<12;n++){const cx=n%3,cy=Math.floor(n/3);out.push(`<div class="warden-judgment-shard ${RED[card[0]]?'r':''}" style="left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;--shard-cut:${cy*25}% ${(2-cx)*100/3}% ${(3-cy)*25}% ${cx*100/3}%;--shard-x:${(cx-1)*120+(noise()-.5)*90}px;--shard-y:${(cy-1.5)*80}px;--shard-turn:${(noise()-.5)*200}deg;--j-at:calc(var(--judgment-age) + ${WARDEN_JUDGMENT.shatterAt}ms)">${cardFace(card)}</div>`)}
    }
    room.team[i].forEach((m,k)=>{const rect=judgmentRect(`[data-damage-target="${i}:${k}"]`,{x:k===J.active[i]?.06:.04,y:(i===0?.17:.48)+k*.018,w:k===J.active[i]?.24:.055,h:k===J.active[i]?.23:.07});
      for(let n=0;n<16;n++){const x=rect.x+rect.w*(.18+noise()*.64),y=rect.y+rect.h*(.32+noise()*.5);out.push(judgmentNail(x,y,k===J.active[i]?100:54,WARDEN_JUDGMENT.rainAt+n*155+noise()*90,(noise()-.5)*520,-y-200))}
    });
  }
  // 密集落石與大範圍衝擊波共用演出種子，始終從上方落下，不參與傷害結算。
  const w=window.innerWidth||1280,h=window.innerHeight||720;
  for(let n=0;n<WARDEN_JUDGMENT.rocks;n++){const size=18+noise()*54,at=WARDEN_JUDGMENT.rainAt+n/WARDEN_JUDGMENT.rocks*2600+noise()*35;out.push(judgmentRock(noise()*w,h*(.16+noise()*.78),size,at,120+noise()*90,(noise()-.5)*w*.32,(noise()-.5)*720))}
  for(let n=0;n<WARDEN_JUDGMENT.shockwaves;n++){const size=120+noise()*260,at=WARDEN_JUDGMENT.rainAt+120+n/WARDEN_JUDGMENT.shockwaves*2700+noise()*30;out.push(`<div class="warden-judgment-shockwave" style="left:${w*(.02+noise()*.82)}px;top:${h*(.16+noise()*.78)}px;width:${size}px;height:${size*.38}px;--j-at:calc(var(--judgment-age) + ${at}ms)"><i></i><i></i></div>`)}
  return out.join('');
}
function drawWardenJudgmentFx(fx){if(wardenJudgmentFx!==fx||!wardenJudgmentPending()||room.wardenJudgment.id!==fx.id)return;const age=Math.max(0,d25Now()-room.wardenJudgment.startedAt),step=wardenJudgmentStep(age);if(step==='rain'&&fx.step!==step)document.body.style.setProperty('--judgment-shake-age',`${WARDEN_JUDGMENT.rainAt-age}ms`);if(fx.step!==step&&(step==='speech'||fx.step==='speech'))try{syncBgm()}catch(e){}updateWardenJudgmentChoice(fx);fx.meaningLayer.hidden=step!=='speech';if(step==='speech'){const elapsed=Math.max(0,d25Now()-room.wardenJudgment.speechAt),count=Math.min(WARDEN_TIPHERETH.text.length,Math.floor(elapsed/Math.max(1,WARDEN_TIPHERETH.voiceMs-500)*WARDEN_TIPHERETH.text.length));fx.caption.textContent=WARDEN_TIPHERETH.text.slice(0,count)}fx.step=step;fx.layer.setAttribute('data-judgment-step',step);document.body.setAttribute('data-warden-judgment-step',step);fx.raf=requestAnimationFrame(()=>drawWardenJudgmentFx(fx))}
function syncWardenJudgmentFx(){
  if(!wardenJudgmentPending()){stopWardenJudgmentFx();return}const J=room.wardenJudgment;if(test||isHost)scheduleWardenJudgmentTick(room);if(wardenJudgmentFx?.id===J.id){cancelAnimationFrame(wardenJudgmentFx.raf);drawWardenJudgmentFx(wardenJudgmentFx);return}stopWardenJudgmentFx();
  preloadWardenCue(WARDEN_FINAL.skill);
  preloadWardenCue(WARDEN_SOUND.rain);preloadWardenCue(WARDEN_TIPHERETH.file);const layer=document.createElement('div');layer.id='wardenJudgmentLayer';layer.className='warden-judgment-fx';layer.setAttribute('aria-hidden','true');layer.style.setProperty('--judgment-age',`${-Math.max(0,d25Now()-J.startedAt)}ms`);layer.innerHTML=buildWardenJudgmentFx(J);document.body.appendChild(layer);const meaningLayer=document.createElement('div');meaningLayer.id='wardenMeaningLayer';meaningLayer.className='warden-meaning-layer';meaningLayer.hidden=true;const caption=document.createElement('p');caption.className='warden-meaning-caption';meaningLayer.appendChild(caption);document.body.appendChild(meaningLayer);const choiceLayer=document.createElement('div');choiceLayer.id='wardenJudgmentChoiceLayer';choiceLayer.className='warden-judgment-choice-layer';choiceLayer.hidden=true;choiceLayer.setAttribute('role','dialog');choiceLayer.setAttribute('aria-modal','true');choiceLayer.setAttribute('aria-labelledby','wardenJudgmentQuestion');document.body.appendChild(choiceLayer);const fx={id:J.id,layer,meaningLayer,caption,choiceLayer,raf:null};wardenJudgmentFx=fx;for(let n=0;n<39;n++)queueWardenCue(fx,WARDEN_SOUND.rain,J.startedAt+WARDEN_JUDGMENT.rainAt+n*80,1726,n===0?1:.25);drawWardenJudgmentFx(fx);if(test||isHost)scheduleWardenJudgmentTick(room);
}
const d25Of = i => (room && room.d25 && room.d25[i]) || { val: 0, bust: false, ready: false, used: false };
const d25PopupSeat = () => test && room && room.d25Banner && room.d25Banner.round === room.round && !d25DrawPending() ? room.d25Banner.seat : rd();
const d25DrawPending=(r=room)=>!!(r&&!envSilent(r)&&r.status==='playing'&&r.d25Banner&&r.d25Banner.round===r.round&&r.d25Banner.draw&&!r.d25Banner.draw.settled);
const D25_PLAYER_COLORS=['#76bfce','#df927d','#b69cda'];
function claimD25(r,list,candidates){
  const eligible=[...new Set(candidates)].filter(i=>r.hp[i]>0&&list[i]&&list[i].val===25&&!list[i].bust&&!list[i].used);
  if(r.d25Claimed||!eligible.length)return null;
  const seat=eligible.length===1?eligible[0]:-1;
  eligible.forEach(i=>{list[i].ready=i===seat});
  const startedAt=Date.now(),banner={id:`${r.roundBase||1}:${r.round+1}:${startedAt}:${++d25BannerSeq}`,seat,name:seat>=0?r.seats[seat].name:'',round:r.round+1};
  if(eligible.length>1){banner.draw={id:banner.id,phase:'announce',candidates:eligible.map(i=>({seat:i,name:r.seats[i].name,char:r.chars[i],clicks:0})),startedAt,endsAt:startedAt+5000,settled:false}}
  return banner;
}
function d25DrawShares(D){const total=D.candidates.reduce((n,p)=>n+D25_CONTEST_BASE+(p.clicks||0),0);let cursor=0;
  return D.candidates.map(p=>{const weight=D25_CONTEST_BASE+(p.clicks||0),from=cursor/total*100;cursor+=weight;return{...p,weight,from,to:cursor/total*100,chance:weight/total*100}})}
function advanceD25Draw(r,now=Date.now()){
  if(mirrorPending(r)||!d25DrawPending(r)||now<r.d25Banner.draw.endsAt)return null;
  const B=r.d25Banner,D=B.draw,phase=D.phase||'spin';
  if(phase==='announce')return{...r,d25Banner:{...B,draw:{...D,phase:'click',startedAt:now,endsAt:now+5000}}};
  if(phase==='click'){
    const shares=d25DrawShares(D),total=shares.reduce((n,p)=>n+p.weight,0);let roll=Math.random()*total;
    const winner=shares.find(p=>{roll-=p.weight;return roll<0})||shares[shares.length-1],d25=r.d25.map((d,i)=>({...d,ready:i===winner.seat}));
    return{...r,d25,d25Banner:{...B,seat:winner.seat,name:winner.name,draw:{...D,phase:'spin',startedAt:now,endsAt:now+3600}},sLog:[...(r.sLog||[]),`🎯【命運爭奪】${shares.map(p=>`P${p.seat+1} ${p.name}：${p.clicks||0}次，機率${p.chance.toFixed(1)}%`).join('；')}`]};
  }
return{...r,d25Banner:{...B,draw:{...D,settled:true}},deadline:r.cfg.time?now+r.cfg.time*1000:0,sLog:[...(r.sLog||[]),`🎡【完美決鬥抽選】P${B.seat+1} ${B.name} 取得本次唯一的絕技資格！`]};
}
function clickD25(seat){if(battleObservationActive())return;
  if(isoPending()||valorantShopPending()||mirrorPending()||!d25DrawPending())return;const D=room.d25Banner.draw;
  if(D.phase!=='click'||d25Now()>=D.endsAt||!D.candidates.some(p=>p.seat===seat)||(!test&&room.seats[seat]?.id!==uid))return;
  const key=D.id+':'+seat,req={type:'d25Click',uid,seat,round:room.round,drawId:D.id,seq:d25ClickSeq[key]=(d25ClickSeq[key]||0)+1};
  if(test||isHost)acceptD25Click(null,req);else if(hostConn)hostConn.send({privateRequest:req});
}
function acceptD25Click(cn,req){
  if(isoPending()||valorantShopPending()||mirrorPending()||!isHost||!req||!d25DrawPending()||!Number.isInteger(req.seat)||!Number.isSafeInteger(req.seq)||req.seq<1)return false;
  if(test?!!cn:((cn?cn.uid:uid)!==req.uid||room.seats[req.seat]?.id!==req.uid))return false;
  const B=room.d25Banner,D=B.draw,now=Date.now(),candidate=D.candidates.find(p=>p.seat===req.seat);
  if(D.phase!=='click'||req.drawId!==D.id||req.round!==room.round||now<D.startedAt||now>=D.endsAt||!candidate||room.hp[req.seat]<=0)return false;
  const key=D.id+':'+req.seat,window=d25ClickWindows[key]||(d25ClickWindows[key]={seq:0,times:[]});
  if(req.seq<=window.seq)return false;window.seq=req.seq;window.times=window.times.filter(t=>t>now-1000);
  if(window.times.length>=D25_CLICK_LIMIT)return false;window.times.push(now);
  save({...room,d25Banner:{...B,draw:{...D,candidates:D.candidates.map(p=>p.seat===req.seat?{...p,clicks:(p.clicks||0)+1}:p)}}});return true;
}
function syncD25DrawUI(){
  if(!d25DrawPending())return false;const D=room.d25Banner.draw,modal=document.getElementById('pdModal');
  if(!modal?.dataset||!modal.querySelector||modal.dataset.drawId!==(D.id||'legacy')||modal.dataset.drawPhase!==(D.phase||'spin'))return false;
  const countdown=modal.querySelector('[data-d25-countdown]');if(countdown)countdown.textContent=(Math.max(0,D.endsAt-d25Now())/1000).toFixed(1);
  d25DrawShares(D).forEach(p=>{const card=modal.querySelector(`[data-d25-candidate="${p.seat}"]`);if(!card)return;card.querySelector('[data-d25-clicks]').textContent=p.clicks||0;card.querySelector('[data-d25-chance]').textContent=p.chance.toFixed(1)+'%';card.style.setProperty('--share',p.chance+'%');const button=card.querySelector('.d25-tap');if(button)button.disabled=d25Now()>=D.endsAt});return true;
}
function perfectDuelDrawUI(){
  const B=room.d25Banner,D=B.draw,phase=D.phase||'spin',shares=d25DrawShares(D),winner=shares.find(p=>p.seat===B.seat),rotation=1800+360-(winner?(winner.from+winner.to)/2*3.6:0),elapsed=Math.max(0,d25Now()-D.startedAt);
  const roster=`<div class="d25-contest-roster" style="--candidates:${shares.length}">${shares.map(p=>`<div class="d25-candidate-stat" data-d25-candidate="${p.seat}" style="--candidate-color:${D25_PLAYER_COLORS[p.seat]||D25_PLAYER_COLORS[0]};--share:${p.chance}%"><b>P${p.seat+1}</b><span class="d25-candidate-name">${esc(p.name)}</span><small class="d25-candidate-char">${esc(CHARS[p.char]?.n||'決鬥者')}</small><div class="d25-candidate-count"><strong data-d25-clicks>${p.clicks||0}</strong>次</div><span class="d25-candidate-chance">機率 <b data-d25-chance>${p.chance.toFixed(1)}%</b></span><div class="d25-share-bar" aria-hidden="true"><i></i></div>${phase==='click'&&(test||room.seats[p.seat]?.id===uid)?`<button type="button" class="d25-tap" aria-label="替P${p.seat+1} ${esc(p.name)}點擊爭奪" onpointerdown="if(event.button===0){event.preventDefault();clickD25(${p.seat})}" onclick="if(event.detail===0)clickD25(${p.seat})" oncontextmenu="event.preventDefault()">${test?'替 P'+(p.seat+1)+' 點擊':'點擊搶命運'}</button>`:''}</div>`).join('')}</div>`;
  let body;if(phase==='spin'){
    const segments=shares.map(p=>`${D25_PLAYER_COLORS[p.seat]||D25_PLAYER_COLORS[0]} ${p.from}% ${p.to}%`).join(','),labels=shares.map(p=>{const angle=(p.from+p.to)/2/100*Math.PI*2;return`<span class="d25-wheel-label" style="left:${50+Math.sin(angle)*31}%;top:${50-Math.cos(angle)*31}%">P${p.seat+1}</span>`}).join('');
    body=`<p>點擊已結束，依「5＋有效點擊數」鎖定抽選機率。</p><div class="d25-wheel-wrap"><i class="d25-wheel-pointer" aria-hidden="true"></i><div class="d25-wheel" style="background:conic-gradient(${segments});--wheel-stop:${rotation}deg;animation-delay:-${elapsed}ms">${labels}</div><div class="d25-wheel-hub" aria-hidden="true">25</div></div>${roster}<div class="d25-draw-result" style="animation-delay:${3000-elapsed}ms"><span>抽選結果</span><strong>P${B.seat+1} · ${esc(B.name)}</strong><small>取得本次唯一的絕技資格</small></div>`;
}else body=`<p>${phase==='announce'?'這些玩家同時集滿25點！準備爭奪唯一的絕技資格。':'連點下方按鈕，提高你的輪盤機率！'}</p>${phase==='announce'?'<div class="d25-stage-mark" aria-hidden="true">25</div>':''}<div class="d25-countdown">${phase==='announce'?'點擊開始倒數':'剩餘點擊時間'}<strong data-d25-countdown>${(Math.max(0,D.endsAt-d25Now())/1000).toFixed(1)}</strong>秒</div>${roster}<p class="d25-contest-note">${test?'單人測試：每位達成者都有獨立按鈕，可分別替各方點擊。':shares.some(p=>room.seats[p.seat]?.id===uid)?'僅達成完美決鬥的玩家可參與點擊。':'你正在旁觀本次命運爭奪。'}<br>每人每秒最多計入${D25_CLICK_LIMIT}次；權重為5＋有效點擊數，零次也保有機會。</p>`;
  return presentBattlePopup(`<div id="pdModal" class="perfect-duel-modal d25-draw-modal" data-draw-id="${esc(D.id||'legacy')}" data-draw-phase="${phase}" role="dialog" aria-modal="true" aria-labelledby="pdTitle" tabindex="-1" onkeydown="d25DialogKey(event)"><div class="d25-draw-content d25-contest-content"><div class="pd-sub">二十五之刻 · ${phase==='announce'?'完美決鬥公告':phase==='click'?'命運爭奪':'加權輪盤'}</div><h2 id="pdTitle">${phase==='announce'?'完美決鬥的交會':phase==='click'?'點擊，搶下命運':'命運正在轉動'}</h2>${body}</div></div>`,'draw');
}
function canTestD25Contest(){return!!(test&&room?.status==='playing'&&room.phase==='play'&&!envSilent(room)&&!d25DrawPending()&&!mirrorPending()&&!environmentTradePending()&&(!room.d25.some(d=>d.used)||!room.d25Claimed)&&room.d25.filter((d,i)=>!d.used&&room.hp[i]>0).length>1&&!Object.keys(moves).some(k=>k.startsWith(room.round+'_')&&moves[k]))}
function testD25ContestUI(){if(!test||room?.status!=='playing')return'';return`<div class="d25-test-entry"><button type="button" ${canTestD25Contest()?'':'disabled'} onclick="testD25Contest()">🧪 測試多人完美決鬥</button><small>將存活玩家填滿25點，測試公告、點擊與輪盤。</small></div>`}
function testD25Contest(){if(!canTestD25Contest())return;const r=JSON.parse(JSON.stringify(room));r.d25.forEach((d,i)=>{if(r.hp[i]>0&&!d.used){d.val=25;d.bust=false;d.ready=false}});r.d25Claimed=false;claimEnvironmentD25(r,r.seats.map((_,i)=>i));save(r)}

function dismissD25Banner(){
  if(isoPending()||valorantShopPending()||mirrorPending()||d25DrawPending())return;
  d25BannerDismissed = true;
  const el = document.getElementById('pdModal');
  if (el) el.remove();
  if(document.body)document.body.classList.remove('d25-dialog-open');
}

function triggerD25(sid){
  if(battleObservationActive())return;
  const s = d25PopupSeat();
  if (!room || isoPending() || valorantShopPending() || mirrorPending() || envSilent(room) || s < 0 || d25DrawPending() || environmentTradePending()) return;
  if(!d25SkillAvailable(room,s,sid))return;
  dismissD25Banner();
  db.doc(`rooms/${code}/moves/u25_${room.round}_${s}`).set({ skill: sid });
}

function perfectDuelBannerUI(){
  if(!room||isoPending()||valorantShopPending()||mirrorPending()||envSilent(room)||environmentTradePending()||!room.d25Banner||room.status!=='playing'||room.d25Banner.round!==room.round)return'';
  if(d25DrawPending())return perfectDuelDrawUI();
  const mySeat=d25PopupSeat(),caster=room.d25Banner.seat,isMe=caster===mySeat,d=isMe?d25Of(mySeat):null,canUseNow=isMe&&d&&d.ready&&!d.used;
  const bannerKey=room.d25Banner.draw?.id||room.d25Banner.id||`${room.round}:${caster}`;
  if(lastSeenD25Round!==room.round||lastSeenD25Key!==bannerKey){lastSeenD25Round=room.round;lastSeenD25Key=bannerKey;d25BannerDismissed=false;try{sfx('skill')}catch(e){}if(!canUseNow)setTimeout(()=>{if(lastSeenD25Key===bannerKey&&!battleObservationActive())dismissD25Banner()},5000)}
  if(d25BannerDismissed)return'';
  const c=room.chars&&room.chars[caster],C=CHARS[c],art=imgK(c),charSkills=C&&C.d25Skills||[{id:1,name:'崩滅之刃',type:'進攻型',desc:'對敵方造成15點直接傷害'},{id:2,name:'天命之泉',type:'輔助型',desc:'自身回復15點生命'}];
  return presentBattlePopup(`<div id="pdModal" class="perfect-duel-modal combat-ultimate" role="dialog" aria-modal="true" aria-labelledby="pdTitle" onkeydown="d25DialogKey(event)" onclick="${canUseNow?'':'dismissD25Banner()'}"><div class="pd-content" onclick="event.stopPropagation()"><div class="ultimate-portrait"><img alt="${esc(C?C.n:'決鬥者')}" data-k="${art}" data-p="left" data-s="0" src="${charArtSrc(art,'left')}" onerror="imgFb(this)"><div class="ultimate-owner">${C?esc(C.n)+' · ':''}${esc(room.d25Banner.name)}</div></div><div class="ultimate-body"><button type="button" class="ultimate-close" aria-label="不發動絕技，關閉彈窗" onclick="dismissD25Banner()">×</button><div class="pd-sub">二十五之刻 · 25 / 25</div><h2 id="pdTitle" class="pd-title">完美決鬥</h2><div class="pd-desc"><b>${esc(room.d25Banner.name)}</b> 的二十五之刻剛好集滿25點。<br>${canUseNow?'選擇一項專屬絕技，立即發動。':'全場唯一的絕技資格已達成。'}</div>${canUseNow?`<div class="ultimate-options">${charSkills.map((sk,idx)=>`<button type="button" class="pd-btn" ${d25SkillAvailable(room,caster,sk.id||idx+1)?'':'disabled'} onclick="triggerD25(${sk.id||idx+1})"><span class="ultimate-type ${sk.type==='輔助型'?'support':''}">${esc(sk.type||(idx?'輔助型':'進攻型'))}</span><b>${esc(sk.name)}</b><span class="ultimate-effect">${esc(sk.desc)}</span><span class="ultimate-activate">發動絕技 →</span></button>`).join('')}</div><div class="ultimate-footer"><button type="button" class="ultimate-skip" onclick="dismissD25Banner()">不發動絕技，直接出牌</button><span class="ultimate-note">絕技僅限於此彈窗出現時發動，關閉後出牌階段將無法再使用。</span></div>`:'<button type="button" class="pd-btn pd-enter" onclick="dismissD25Banner()">進入決鬥 →</button>'}</div></div></div>`,'ultimate');
}
function focusD25Dialog(){
  const modal=battleObservationActive()?null:battleConfirm?document.getElementById('battleConfirmModal'):mirrorPending()?document.getElementById('mirrorModal'):document.getElementById('pdModal');if(document.body)document.body.classList.toggle('d25-dialog-open',!!modal);
  if(modal&&modal.querySelector&&!modal.contains(document.activeElement)){const button=modal.querySelector('.mirror-option:not(:disabled)')||modal.querySelector('.d25-tap:not(:disabled)')||modal.querySelector('.pd-btn')||modal.querySelector('.pri')||modal;if(button)button.focus({preventScroll:true})}
}
function d25DialogKey(event){
  if(battleObservationActive()){if(event.key==='Escape'){event.preventDefault();returnBattlePopup()}return}
  if(battleConfirm&&event.key==='Escape'){event.preventDefault();closeBattleConfirm();return}
  if((mirrorPending()||d25DrawPending())&&event.key==='Escape'){event.preventDefault();return}
  if(event.key==='Escape'){event.preventDefault();dismissD25Banner();return}
  if(event.key!=='Tab')return;const modal=battleConfirm?document.getElementById('battleConfirmModal'):mirrorPending()?document.getElementById('mirrorModal'):document.getElementById('pdModal'),buttons=modal&&Array.from(modal.querySelectorAll('button:not(:disabled)'));if(!buttons||!buttons.length){if(isoPending()||valorantShopPending()||mirrorPending()||d25DrawPending())event.preventDefault();return}
  const first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
}

// 觀察狀態只存在目前的瀏覽器，不修改房間、資格、選擇或房主的計時。
let battleObservationKey='',battleConfirm=null,battleConfirmSeq=0;
const popupEyeIcon=()=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
function activeBattlePopup(){
  if(!room||room.status!=='playing')return null;const base=`${code}:${room.roundBase||1}:${room.round}`;
  if(isoPending())return room.phase==='isoTarget'?{kind:'isoTarget',key:`${base}:iso:${room.isoTarget.id}`,title:'決滅・選擇對手'}:null;
  if(valorantShopPending())return valorantShopVisible()?{kind:'shop',key:`${base}:shop:${room.valorantShop.id||room.valorantShop.round}`,title:'商店'}:null;
  if(mirrorPending())return{kind:'mirror',key:`${base}:mirror:${room.mirrorChoice.id}`,title:room.mirrorChoice.search?'鏡世界搜索':'鏡世界觀測'};
  if(battleConfirm)return{kind:'confirm',key:`${base}:confirm:${battleConfirm.id}`,title:battleConfirm.title};
  const B=room.d25Banner;if(!B||B.round!==room.round||envSilent(room)||environmentTradePending())return null;
  if(d25DrawPending())return{kind:'draw',key:`${base}:draw:${B.draw.id||'legacy'}`,title:'完美決鬥爭奪'};
  const id=B.draw?.id||B.id||`${room.round}:${B.seat}`;if(d25BannerDismissed&&lastSeenD25Round===room.round&&lastSeenD25Key===id)return null;
  return{kind:'ultimate',key:`${base}:ultimate:${id}`,title:'25絕技選擇'};
}
function battleObservationActive(){const P=activeBattlePopup();return!!(P&&battleObservationKey===P.key)}
function observeBattlePopup(){const P=activeBattlePopup();if(!P)return;battleObservationKey=P.key;render();document.getElementById('observationReturn')?.focus?.({preventScroll:true})}
function returnBattlePopup(){battleObservationKey='';render();focusD25Dialog()}
function popupEyeUI(){return`<button type="button" class="popup-eye" aria-label="查看戰場，保留目前選擇" title="查看戰場" onclick="event.stopPropagation();observeBattlePopup()">${popupEyeIcon()}</button>`}
function presentBattlePopup(html,kind){const P=activeBattlePopup();if(P?.kind===kind&&battleObservationActive())return'';return html.replace(/(<div class="(?:pd-content|d25-draw-content d25-contest-content|mirror-content|battle-confirm-content)"[^>]*>)/,'$1'+popupEyeUI())}
function battleObservationUI(){const P=activeBattlePopup();if(!battleObservationActive())return'';return`<aside class="battle-observation-bar" role="status"><div><b>正在查看戰場</b><small>保留${esc(P.title)}；查看不會更改原本的倒數規則。</small></div><button id="observationReturn" type="button" class="observation-return" onclick="returnBattlePopup()">${popupEyeIcon()}返回${esc(P.title)}</button></aside>`}
function observationHandUI(s){return s>=0?`<div>你的手牌（僅供查看）</div><div class="observation-hand">${(room.hands[s]||[]).map(c=>chip(c,s,room.up[s].includes(c))).join('')}${(s===rd()?privateSunCards:[]).map(c=>chip(c.card,s,publicTemporaryCards(room,s).some(x=>x.id===c.id))).join('')}</div>`:'<p>查看公開手牌、狀態與戰鬥紀錄。</p>'}
function showBattleConfirm(title,message,onConfirm){if(!room||battleObservationActive())return;battleConfirm={id:++battleConfirmSeq,title,message,onConfirm,code,round:room.round,roundBase:room.roundBase,phase:room.phase,seat:rd()};battleObservationKey='';render()}
function closeBattleConfirm(){battleConfirm=null;battleObservationKey='';render()}
function acceptBattleConfirm(){const C=battleConfirm;if(!C||battleObservationActive())return;battleConfirm=null;battleObservationKey='';if(room?.status==='playing'&&code===C.code&&room.round===C.round&&room.roundBase===C.roundBase&&room.phase===C.phase&&rd()===C.seat)C.onConfirm();render()}
function battleConfirmUI(){if(!battleConfirm)return'';return presentBattlePopup(`<div id="battleConfirmModal" class="perfect-duel-modal battle-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="battleConfirmTitle" onkeydown="d25DialogKey(event)"><div class="battle-confirm-content"><h2 id="battleConfirmTitle">${esc(battleConfirm.title)}</h2><p>${esc(battleConfirm.message)}</p><div class="row"><button type="button" onclick="closeBattleConfirm()">取消</button><button type="button" class="pri" onclick="acceptBattleConfirm()">確認</button></div></div></div>`,'confirm')}

function d25SkillUI(s){
  return '';
}

function clock25UI(seat){
  if (!room || seat === undefined || seat < 0 || !room.seats[seat]) return '';
  const d = d25Of(seat);
  const val = d.val || 0;
  const pct = Math.min(100, Math.max(0, (val / 25) * 100));
  const isBust = !!d.bust;
  const isReady = !!d.ready;
  const isUsed = !!d.used;
  const isLocked = !isReady && !isBust && !!room.d25Claimed;

  let stateClass = '';
  let statusText = '';
  let tip = `二十五之刻：${val} / 25 點。\n♠攻擊命中、♣斷補成功、♦反擊成功時增加卡牌原始點數；♥以實際回復自身的生命量累積。\n剛好 25 點達成完美決鬥，超過則爆牌崩壞！`;

  if (isBust) {
    stateClass = 'bust';
    statusText = '崩壞';
    tip = `【二十五之刻・爆牌崩壞】\n點數已達 ${val} 點（超過 25 點），本局無法發動完美決鬥。`;
  } else if (isReady) {
    stateClass = 'ready';
    statusText = '完美';
    tip = '【完美決鬥達成！】\n剛好集滿 25 點！可在出牌階段選擇發動 25 絕技！';
  } else if (isUsed) {
    stateClass = 'used';
    statusText = '已發動';
    tip = '【二十五之刻】本場已發動過 25 絕技。';
  } else if (d25DrawPending()&&room.d25Banner.draw.candidates.some(p=>p.seat===seat)) {
    stateClass = 'ready';statusText = '爭奪中';tip = '【完美決鬥】同時達成25點，正在爭奪本次唯一的絕技資格。';
  } else if (isLocked) {
    stateClass = 'locked';
    statusText = '已鎖定';
    tip = `【二十五之刻】目前 ${val} 點。\n全場已由其他玩家達成完美決鬥，本局無法再達成。`;
  }
  if(envSilent(room)){statusText='暫停';tip+='\n沉默：本回合不累積點數，不能發動絕技。'}
  const C=CHARS[room.chars&&room.chars[seat]],name=C?C.n:room.seats[seat].name;
  const watching=room.status==='playing'&&room.pair&&!room.pair.includes(seat);
  const role=room.hp[seat]<=0?'倒下':watching?'旁觀':'';
  return`<div class="clock25-row player-${seat+1} ${stateClass}" data-clock-seat="${seat}" title="${esc(tip)}">${environmentClockFxUI(seat)}<div class="clock25-identity"><b>P${seat+1}</b><span class="clock25-name">${esc(name)}</span>${role?`<small>${role}</small>`:''}</div><div class="clock25-meter" role="progressbar" aria-label="${esc(`P${seat+1} ${name} 的二十五之刻`)}" aria-valuemin="0" aria-valuemax="25" aria-valuenow="${Math.min(25,Math.max(0,val))}" aria-valuetext="${esc(`${val} / 25${statusText?'，'+statusText:''}`)}"><i class="clock25-progress" style="width:${pct}%"></i><span class="clock25-ticks" aria-hidden="true">${[20,40,60,80].map(n=>`<i style="left:${n}%"></i>`).join('')}</span></div><div class="clock25-readout"><strong>${val}<small> / 25</small></strong>${statusText?`<span>${statusText}</span>`:''}</div></div>`;
}
function clock25PanelUI(){
  if(!room||!room.seats)return'';
  return`<section class="clock25-panel" aria-label="全場二十五之刻"><div class="clock25-title"><span>二十五之刻${envSilent(room)?' · 暫停':''}</span><small>25</small></div><div class="clock25-rows">${room.seats.map((_,i)=>clock25UI(i)).join('')}</div></section>`;
}

function combatStatusUI(i){
  const rows=Array.from(stTxt(i).matchAll(/<span(?: class="([^"]*)")? title="([^"]*)">([\s\S]*?)<\/span>/g));
  return`<div class="status-items" aria-label="狀態與被動">${rows.length?rows.map(m=>`<details class="status-item ${m[1]||''}"><summary>${m[3]}</summary><div class="status-description">${m[2]}</div></details>`).join(''):'<span class="status-empty">狀態正常</span>'}</div>`;
}
function healthBarUI(i,animated=false){const hp=Math.max(0,room.hp[i]),limit=maxHp(i),tkt=room.chars[i]==='tkt',unit=tkt?tktHealth(hp,limit,room.st[i]).unit:0;return`<div class="bar ${tkt?'tkt-bar':''}"><i ${animated?`data-bar="${i}"`:''} style="width:${Math.min(100,hp/limit*100)}%"></i>${tkt?[1,2,3,4].filter(n=>n*unit<limit).map(n=>`<span class="tkt-divider" style="left:${Math.floor(n*unit+1e-9)/limit*100}%" aria-hidden="true"></span>`).join(''):''}</div>`}
function wardenFighter(i,pos,fallen=false){
  const viewer=rd(),k=room.chars[i],C=CHARS[k],name=k==='warden'?WARDEN_STAGES[wardenStage(room)].n:C.n,hp=Math.max(0,room.hp[i]),maximum=maxHp(i),shield=wardenShownShield(i),noise=i===1&&wardenEndingPending(room),art=i===1&&k==='warden'&&(wardenEndingCorpse(room)||fallen&&wardenStage(room)===2)?WARDEN_FINAL.dead:charArtSrc(imgK(k,room.st[i]),pos);
  return `<section class="fighter warden-fighter ${i===1?'warden-keeper':'warden-ally'} ${fallen||!wardenSeatAlive(room,i)?'dead':''} ${i===viewer?'mine':'enemy'}" data-warden-seat="${i}"><div class="warden-public"><span>${esc(room.seats[i].name)}${i===viewer?'（你）':''}</span><div>${visibleHandUI(i)}</div></div><div data-damage-target="${i}:${room.act[i]}" class="art-wrap v3 ${pos}" ondragover="event.preventDefault()" ondrop="dropWardenAction(event,${i})">${i===1?wardenCandlesUI():resv(i,pos)}<img class="fighter-art ${pos}${room.st[i].wardenPulse?' warden-pulse-aura':''}${room.st[i].wardenStop||room.st[i].wardenCompleteStop?' warden-stop-aura':''}${room.st[i].wardenRapidPulse?' warden-rapid-pulse-aura':''}" alt="${esc(name)}" ${canCancel(i)?`onclick="cancelSw(${i})" title="點擊取消換人"`:''} data-k="${imgK(k,room.st[i])}" data-p="${pos}" data-s="0" src="${art}" onerror="imgFb(this)">${room.st[i].wardenCompleteStop?'<span class="warden-complete-stop-noise" aria-hidden="true"></span>':''}${wardenBoonsUI(i)}</div><div class="fighter-info"><div class="fighter-identity"><span class="fighter-name">${esc(name)}</span><strong class="fighter-hp${noise?' warden-ending-hp-noise':''}" ${noise?'aria-label="生命訊號受干擾"':`data-hptext="${i}"`}>${noise?'??? / ???':hp+' / '+maximum}</strong></div>${noise?'<div class="bar warden-ending-hp-noise" aria-label="生命訊號受干擾"></div>':healthBarUI(i,true)}${shield?`<div class="shield-readout" data-beam-shield="${i}"><span>護盾</span><strong>${shield}</strong></div>`:''}${cpBar(i)}${timeClockUI(i)}${combatStatusUI(i)}${i===1?'':teamInfo(i)}</div></section>`;
}
function wardenArena(act,fakeVictory=false){
  const L=room.last,viewer=rd(),phase=fakeVictory||room.status==='over'?'對戰結束':wardenEndingPending()?'最終交鋒':room.phase==='reveal'?'公開暗牌':room.phase==='answer'?'問答中':'出牌階段';
  const slot=(i,target)=>{const m=room.status==='playing'&&room.phase==='play'&&moves[room.round+'_'+i],old=L?.plays.find(p=>p.i===i&&(i!==1||p.target===target)),submitted=wardenSubmitted(room,i,viewer),hidden=old?.card&&!drunkCanSee(room,viewer,i,true),face=submitted||(!m&&!hidden?old:null),joint=submitted?wardenPreviewJoint(i,submitted.card):old?.joint||0;
    if(i===1&&(old?.judgment||wardenJudgmentArmed()&&m))return `<div class="clash-slot" data-clash-seat="${i}" data-clash-target="${target}"><div class="pc warden-cross-card"><img src="${esc(WARDEN_JUDGMENT.cross)}" alt="金光十字架"></div><small>特殊攻擊</small></div>`;
    return `<div class="clash-slot" data-clash-seat="${i}" data-clash-target="${target}">${face?.card?`<div class="pc ${old?.eff&&!m?'glow':'old'} ${RED[face.card[0]]?'r':''}">${cardFace(face.card)}${joint?'<b class="warden-joint-bonus">＋3</b>':''}</div>`:m?'<div class="pc back" aria-label="已出牌，尚未揭曉">🂠</div>':hidden?'<div class="pc back" aria-label="牌面隱藏">🂠</div>':'<div class="pc empty">—</div>'}<small>${m?'已提交':old?.card?(old.gebura?'特殊攻擊':'上回合'):'等待出牌'}${face?.candleTarget?' → 刑罰之燭台':face?.target!==undefined?' → '+esc(room.seats[face.target].name):''}</small></div>`};
  const notes=[...(room.sLog||[]),...(L?.log||[])];
  return `<main class="combat-shell warden-shell" style="background-image:linear-gradient(#0b131a66,#0b131aa8),url('${WARDEN_STAGES[wardenVisualStage(room)].bg}')"><section class="warden-stage"><div class="warden-round"><span>回合 ${String(shownRound()).padStart(2,'0')} · ${phase}</span><button onclick="leave()" aria-label="離開房間">離開</button></div><div class="warden-allies">${wardenFighter(0,'left')}${wardenFighter(2,'left')}</div><div class="warden-clashes">${[0,2].map(i=>`<div class="warden-clash ${room.hp[i]<=0?'inactive':''}"><span class="warden-clash-name">${esc(room.seats[i].name)}</span><div class="battle-mid">${slot(i,1)}<span class="versus">VS</span>${slot(1,i)}</div></div>`).join('')}</div>${wardenFighter(1,'right',fakeVictory)}</section><div class="combat-actions"><div class="act">${act||''}</div></div>${notes.length?`<details class="warden-record"><summary>戰鬥紀錄</summary><div>${notes.map(x=>`<p>${esc(drunkLogText(x))}</p>`).join('')}</div></details>`:''}</main>${!fakeVictory&&battleConfirm?battleConfirmUI():''}`;
}
function wardenHandUI(s,mine,up){
  const targets=wardenTargets(room),chosen=targets.map((target,k)=>wardenSelections[k]),ready=chosen.every(x=>x?.card);
  const lanes=targets.map((target,k)=>`<button type="button" class="warden-lane ${wardenLane===k?'active':''}" onclick="setWardenLane(${k})"><span>對 ${esc(room.seats[target].name)}</span><b>${chosen[k]?.card?cs(chosen[k].card):'選擇手牌'}</b></button>`).join('');
  return `<div class="hand-workspace warden-hand" style="--warden-hand-count:${mine.length}"><div class="hand-cards"><div class="hand-heading"><h3>你的手牌</h3><span>選擇對手後選牌</span></div><div class="warden-lanes">${lanes}</div><div class="hand">${up.map((c,k)=>cardBtn(c,'pick',true,s,k)).join('')}${subtractCards(mine,up).map((c,k)=>cardBtn(c,'pick',false,s,k)).join('')}</div></div><div class="selection-row">${wardenJudgmentArmed()?'':`<div class="skill-controls"><button class="redraw-button" ${wardenForcedExit(room)?'disabled':''} onclick="playRedraw()">我牌太爛啦！（扣 ${redrawCost(room,s)} 血）</button></div>`}${wardenGod(room)||wardenPriest(room)||wardenFinalPriest(room)?`<label class="warden-save-control">消耗保存 <select onchange="setWardenSaveSpend(+this.value)">${wardenSpendOptions(room).map(n=>`<option value="${n}" ${wardenSaveSpend===n?'selected':''} ${wardenSpendValid(room,n)?'':'disabled'}>${n}層 · ${wardenSpendLabel(room,n)}</option>`).join('')}</select></label>`:''}${handSelectionUI(s)}<button class="pri commit-card" ${ready?'':'disabled'} onclick="play()">${targets.length===2?'兩張牌一起出牌':'出牌'} →</button></div></div>`;
}
function arena(act){if(room.cfg.warden)return wardenArena(act);
  const Q=recentEnvironmentFx().filter(e=>e.event==='quake').at(-1);
  const L=room.last,pr=room.pair||[0,1],viewer=rd(),lastPair=L&&(L.pair||L.plays.map(p=>p.i));
const phase=room.status!=='playing'?'對戰結束':valorantShopPending()?'購買裝備':mirrorPending()?'鏡世界選擇':environmentTradePending()?'環境選擇':room.phase==='answer'?'問答中':room.phase==='reveal'?'公開暗牌':'出牌階段';
  const mode=battleModeName(room.cfg);
  const slot=(i,sideIndex)=>{
    const m=room.phase==='play'&&room.status==='playing'&&moves[room.round+'_'+i],oldSeat=lastPair&&lastPair[sideIndex]!==undefined?lastPair[sideIndex]:i,lc=L&&L.plays.find(p=>p.i===oldSeat);
    const label=m?'已出牌':lc&&lc.card?'上一回合':'等待出牌';
    const hiddenLast=lc&&lc.card&&!drunkCanSee(room,viewer,oldSeat,true);
    const face=m?'<div class="pc back" aria-label="已出牌，尚未揭曉">25</div>':hiddenLast?'<div class="pc back" aria-label="牌面隱藏">🂠</div>':lc&&lc.card?`<div class="pc ${lc.eff?'glow':'old'} ${RED[lc.card[0]]?'r':''}" title="${esc(room.seats[oldSeat].name)} 上回合：${cs(lc.card)}${lc.eff?'，效果已發動':'，效果未發動'}">${cardFace(lc.card)}</div>`:'<div class="pc empty"><span>等待出牌</span></div>';
    return`<div class="clash-slot">${face}<small>${label}</small></div>`;
  };
  const side=(i,pos)=>{
    const k=room.chars[i],C=CHARS[k],hp=Math.max(0,room.hp[i]),maximum=maxHp(i),shield=room.st[i].shield||0;
    const temporary=drunkTemporaryCards(i),publicCards=visibleHandUI(i),hidden=Math.max(0,(room.hands[i]||[]).length+(i===viewer?privateSunCards.length:temporary.length)-(room.up[i]||[]).length-temporary.length);
    const role=room.cfg.boss?bossRole(room.cfg,i):i===viewer?'你':'對手';
    return`<section class="fighter ${hp<=0?'dead':''} ${i===viewer?'mine':'enemy'}"><div class="fighter-label"><span>玩家 ${String(i+1).padStart(2,'0')}</span><span class="fighter-role">${role}</span></div><div data-damage-target="${i}:${room.team?room.act[i]:-1}" class="art-wrap ${room.team?'v3':''} ${pos}" ondragover="event.preventDefault()" ondrop="dropSw(event,${i})">${resv(i,pos)}<img class="fighter-art ${pos}" alt="${esc(C?C.n:'角色')}" ${canCancel(i)?`onclick="cancelSw(${i})" title="點擊取消換人"`:''} data-k="${imgK(k,room.st[i])}" data-p="${pos}" data-s="0" src="${charArtSrc(imgK(k,room.st[i]),pos)}" onerror="imgFb(this)">${d25AuraUI(i)}${environmentTargetFxUI(i,room.team?room.act[i]:-1)}</div><div class="fighter-info"><div class="fighter-identity"><div><div class="fighter-name">${C?esc(C.n):'決鬥者'}</div><span class="fighter-owner">${esc(room.seats[i].name)}${i===viewer?'（你）':''}</span></div><span class="fighter-faction">${C?FAC[C.f]:''}</span></div><div class="vital-row"><span>生命</span><div class="fighter-hp" data-hptext="${i}">${hp} / ${maximum}</div></div>${healthBarUI(i,true)}${timeClockUI(i)}${shield?`<div class="shield-readout"><span>護盾</span><strong>${shield}</strong><div class="shield-meter"><i style="width:${Math.min(100,shield/maximum*100)}%"></i></div></div>`:''}${cpBar(i)}${combatStatusUI(i)}${teamInfo(i)}<div class="fighter-cards"><span>明牌</span>${publicCards||'<span>—</span>'}<span class="hand-count">暗牌 ${hidden} 張</span></div></div></section>`;
  };
  const notes=[...(room.sLog||[]),...(room.spin&&room.status==='playing'?[`${room.seats[room.spin.t].name} 的輪盤選中 ${room.seats[room.spin.pick].name}`]:[]),...(L?L.log:[])];
  const record=notes.length?`<details class="table-record"><summary>戰鬥紀錄<span>${esc(drunkLogText(notes[0]).slice(0,62))}${notes[0].length>62?'…':''}</span></summary><div class="record-body">${notes.map(x=>`<div>${esc(drunkLogText(x))}</div>`).join('')}</div></details>`:'';
  return`<div class="combat-shell ${environmentAtmosphere()?'env-atmosphere-'+environmentAtmosphere():''}"><div class="battlefield ${Q?'env-board-quake':''}" ${Q?`style="--quake-age:-${Math.max(0,Date.now()-Q.at)}ms"`:''}>${environmentBackdropUI()}${environmentFieldFxUI()}${environmentNoticeUI()}<header class="table-heading"><div class="table-brand-block"><div class="table-brand-line"><div class="table-brand">決鬥25點</div>${environmentUI()}</div><span class="table-mode">${mode} · ${room.cfg.open?'明牌模式':'暗牌模式'}</span></div><div class="round-label"><span>回合</span><b>${String(shownRound()).padStart(2,'0')}</b><span class="round-phase">${phase}</span></div></header>${side(pr[0],'left')}<div class="battle-core">${clock25PanelUI()}<div class="clash-eyebrow">${phase==='出牌階段'?'本回合交鋒':phase}</div><div class="battle-mid">${slot(pr[0],0)}<span class="versus">VS</span>${slot(pr[1],1)}</div><div class="clash-note">${room.status!=='playing'?'勝負已定':room.phase==='answer'?'等待回答，完成後繼續出牌':room.phase==='reveal'?'選擇保持暗牌的卡片，其餘公開':'雙方各選一張牌，揭曉後結算'}</div><div class="suit-guide"><span><b>♠</b>進攻</span><span><b>♣</b>干擾</span><span class="red"><b>♥</b>回復</span><span class="red"><b>♦</b>反擊</span></div></div>${side(pr[1],'right')}</div><div class="combat-actions"><div class="act">${act||''}</div></div>${record}</div>${battleConfirm?battleConfirmUI():mirrorPending()?mirrorChoiceUI():perfectDuelBannerUI()}`;
}
/* ---------- 規則 ---------- */
const rnd=a=>a[Math.floor(Math.random()*a.length)];
function newDeck(ex=[]){const d=[];for(const s of 'SCHD')for(let r=1;r<=13;r++)if(!ex.includes(s+r))d.push(s+r);
  for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]]}return d}
function spinPick(hp,t,rm=null){const o=hp.map((h,i)=>i).filter(i=>i!==t&&hp[i]>0),tot=o.reduce((s,i)=>s+hp[i],0),weights=Object.fromEntries(o.map(i=>[i,hp[i]])),caster=rm&&envEvent(rm,'blueSmoke')?.caster;
  if(o.length>1&&o.includes(caster)){const reduction=Math.min(weights[caster],tot*.3),other=tot-weights[caster];weights[caster]-=reduction;o.forEach(i=>{if(i!==caster)weights[i]+=reduction*hp[i]/other})}
  let r=Math.random()*tot,pick=o[o.length-1];for(const i of o){if(r<weights[i]){pick=i;break}r-=weights[i]}
  return{pair:[t,pick],spin:{t,pick,odds:o.map(i=>({i,p:Math.round(weights[i]/tot*1000)/10}))}}}
const ENV_EVENTS={
  blood:{n:'血月',icon:'🌘',d:'攻擊傷害+2，治療量減少30%（向上取整），持續本回合及下回合。'},
  spring:{n:'生命之泉',icon:'💧',d:'全場存活角色（含後備）立即回復5點生命，遵守減療、禁療及生命上限。'},
  quake:{n:'地脈震動',icon:'🪨',d:'全場存活角色（含後備）立即獲得3點護盾，保留至被消耗。'},
  sun:{n:'烈日',icon:'☀️',d:'下回合開始，全場存活角色（含後備）受到3點固定環境傷害；護盾、牆與高堅果仍可攔截。'},
  supply:{n:'補給空投',icon:'📦',d:'每位存活玩家獲得一次換牌折抵：下次「我牌太爛啦！」的生命消耗-5，最低0；次數照常累加。'},
  commune:{n:'共產',icon:'⚖️',d:'下回合開始，所有存活角色（含後備）的生命平均重新分配；保留總生命、不超過各自上限，不視為治療。'},
  chaos:{n:'混沌',icon:'🌀',d:'各存活玩家的二十五之刻隨機增加或減少1～10點，最低0；超過25點會崩壞，已使用絕技者不再變動。'},
  duel:{n:'決鬥之時',icon:'🎡',d:'所有存活且未使用絕技的玩家直接達到25點並解除崩壞；多人達成時先公告5秒、點擊爭奪5秒，再依5＋有效點擊數轉加權輪盤。本局已有絕技使用者時不再出現。'},
  fate:{n:'命運',icon:'✨',d:'隨機指定一種花色，本回合該花色的最終點數+5；二十五之刻的♠、♣、♦仍以卡牌原始點數累積，♥以實際回血量累積。'},
  silence:{n:'沉默',icon:'🔇',d:'本回合停用角色主動技、被動、陣營、植物與附加狀態，暫停25點累積及絕技；四種花色基本效果與環境事件保留。'},
  thorns:{n:'荊棘叢生',icon:'🌿',d:'本回合角色（含後備）受到攻擊而實際失去生命時，攻擊者直接失去2點生命；每次受傷都生效，反傷不連鎖。'},
  peace:{n:'和平鐘聲',icon:'🔔',d:'本回合黑桃與梅花卡牌造成的傷害減少4，最低0；反擊與獨立技能傷害不受影響。'},
  allIn:{n:'孤注一擲',icon:'🎲',d:'本回合基礎點數10以上的牌，點數×1.5（向下取整，固定點數仍優先）；使用者在回合結束時直接失去5點生命，即使牌效果未成功仍須付出代價。'},
  fallenCrown:{n:'王權殞落',icon:'👑',d:'所有存活玩家手中的J、Q、K，立即變成相同花色的3、2、A；變換後保留至使用。'},
  uprising:{n:'小人物的逆襲',icon:'✊',d:'所有存活玩家手中的A、2、3，立即變成相同花色的K、Q、J；變換後保留至使用。'},
  kindness:{n:'善意',icon:'🤍',d:'本回合任何實際回血，都讓所有存活敵方玩家的出戰角色回復一半（向上取整）；遵守減療、禁療及生命上限，分享回血不再次連鎖，也不計入二十五之刻。'},
  confusion:{n:'混亂',icon:'❔',d:'本回合打出的牌在結算時隨機變換花色，點數不變；結算前不揭露結果，技能與花色效果以結算花色為準。'},
  resonance:{n:'臨界共鳴',icon:'⏳',d:'所有存活玩家的二十五之刻立即設為24點並解除崩壞；已發動絕技者仍不能再次發動。'},
  trade:{n:'命運交易',icon:'🩸',d:'出牌前所有存活玩家（包含旁觀者）先選擇不交易，或消耗1～5點生命來增加等量二十五之刻；全部選完後同時生效，可能達到完美決鬥或崩壞。'},
  secondChance:{n:'二次機會',icon:'🔄',d:'所有尚未發動過絕技的玩家，二十五之刻重設為0並解除崩壞，重新開放完美決鬥資格；已發動者的量表、技能及效果保留，不能再次發動。'},
  unity:{n:'萬物歸一',icon:'🂠',d:'每位存活玩家各自隨機抽一個5～9的點數，該玩家整手牌統一變成該點數，花色不變；各玩家分開抽選，變換後保留至使用。'},
  colorShift:{n:'色彩流轉',icon:'🌈',d:'所有存活玩家的手牌花色立即輪替一次：♠→♥→♣→♦→♠，點數不變；變換後保留至使用。'},
  blessing:{n:'弱者的祝福',icon:'🍀',d:'當前生命最少的存活玩家立即回復5點生命，本回合出戰角色獲得2層強壯；並列者都生效，遵守治療限制。'},
  price:{n:'強者的代價',icon:'⚔️',d:'全場當前生命最高的存活角色（含後備）直接失去5點生命，並在本回合獲得2層虛弱；並列者都生效。'},
  mirrorResonance:{n:'鏡像共鳴',icon:'🪞',d:'本回合雙方出牌的結算花色相同時，結算後各獲得3點護盾；保留至被消耗。'},
  assassin:{n:'刺客',icon:'🗡️',d:'本回合J、Q、K點數+5；但對手打出原始點數A、2、3任一張時，自己的最終點數歸零（優先於固定點數）。'},
  invertedStage:{n:'倒錯舞台',icon:'🔀',d:'持續本回合及下回合；揭牌後雙方交換出牌花色，原始點數不變，再結算。'},
  ultimatum:{n:'最後通牒',icon:'📜',d:'每位存活玩家最高點數的一張手牌被公開標記；同點數只隨機選一張。接下來兩次自己出戰內未打出該牌，直接失去4點生命並解除標記。'},
  bomb:{n:'炸彈!!',icon:'💣',d:'隨機一位存活玩家的出戰角色持有炸彈；持有者出戰才倒數，5次出戰後爆炸造成15點固定傷害。主動「傳遞炸彈」取代出牌，不耗手牌；對手出♦或♥便接收炸彈，倒數不重置，出黑牌則傳遞失敗。'},
  crisis:{n:'危機就是轉機',icon:'🌟',d:'低機率事件（一般事件的1/10抽選權重）；存活玩家中生命最低者立即啟用該角色兩種25絕技，並列隨機一人。本局有人發動過25絕技後不再出現。'},
  publicTrade:{n:'公開交易',icon:'👁️',d:'所有存活玩家立即公開手牌中的全部暗牌，每公開一張回復3點生命；遵守減療、禁療與生命上限，已公開的牌不重複回血。'},
  cheer:{n:'上阿上阿我的朋友!',icon:'📣',d:'僅三人戰出現。本回合旁觀者改為支持一名出戰玩家，給予5層強壯；被支持者實際造成攻擊傷害（含護盾）時，自己與支持者各獲得5點護盾，否則各失去5點生命。強壯只持續本回合。'},
  bloodAdvance:{n:'預支血量',icon:'🩸',d:'出牌前各存活玩家可選擇支付5點生命，接下來自己出戰3次後回復10點生命；旁觀與立即技能不倒數，換人保留期限，回復遵守治療限制。'},
  woundCrystal:{n:'傷口結晶',icon:'💎',d:'持續本回合；角色每次實際受傷後獲得等量護盾，單次最多5點，護盾保留至被消耗。'},
  emergency:{n:'急救運轉',icon:'🚑',d:'本回合治療改為獲得等量護盾，仍遵守減療與禁療，紅心仍可被梅花斷補；護盾保留至被消耗。'},
  handRecycle:{n:'手牌回收',icon:'♻️',d:'本回合正常打出的牌返回手牌，不補新牌；保留原明暗狀態。主動技能銷毀的牌及卡牌槽仍正常消失，向日葵暫時手牌仍依原期限消失。'},
  prisoner:{n:'囚徒協議',icon:'🤝',d:'出牌前雙方秘密選擇合作或背叛，同時揭曉。雙方合作各回復4點生命；一人背叛時背叛者獲得4點護盾，合作者失去3點生命；雙方背叛各失去3點生命。'},
  frenzy:{n:'發瘋啦!!',icon:'🔥',d:'低機率事件（一般事件的1/10抽選權重）；所有存活玩家立即啟用目前角色的兩項25絕技，隨機選一人的絕技音樂，角色獲得金光與橘紅粒子。本局有人發動過25絕技後不再出現。'},
  skyfall:{n:'天降事件',icon:'🌠',d:'隨機觸發3個不同且符合當前條件的場地事件，各自保留原效果與持續時間；不會抽到天降事件本身。需出牌前選擇的事件依序處理。'}
};
const SKILL_ENV_EVENTS={blueSmoke:{n:'青煙',icon:'🌫️',d:'摩西的絕技環境，持續5回合並與原場地並存；每回合結束，該回合出戰的兩名玩家受到5點固定環境傷害，牆、護盾及高堅果仍可攔截。施放者被抽為對手的機率減少30個百分點，最低0%；只有一名可選對手時仍正常配對。'}};
const environmentInfo=id=>ENV_EVENTS[id]||SKILL_ENV_EVENTS[id];
const newEnvironment=n=>({processedRound:0,nextRound:null,lastId:null,event:null,extraEvents:[],skillEvents:[],pending:[],supply:Array(n).fill(0),deferredD25:null,fxSeq:0,fx:[]});
const environmentGap=()=>3+Math.floor(Math.random()*3);
// 視覺紀錄只保存房主已結算的結果，不在畫面中抽亂數或修改遊戲狀態。
const ENV_FX_MS=2200;
const ENV_NOTICE_MS=2800;
const environmentBuffCount=(st,k)=>(st.fx||[]).filter(f=>f.source==='environment'&&f.k===k).reduce((n,f)=>n+f.n,0);
function environmentFxSnapshot(r){return environmentMembers(r).map(m=>({seat:m.i,member:m.k<0?(r.team?r.act[m.i]:-1):m.k,char:m.c,hp:m.hp,shield:m.st.shield||0,strong:environmentBuffCount(m.st,'s'),weak:environmentBuffCount(m.st,'w')}))}
function queueEnvironmentFx(r,id,stage='arrival',before=[],clocks=[],options={}){
  if(!environmentInfo(id))return;r.env=r.env||newEnvironment(r.seats.length);const now=d25Now(),targets=before.map(t=>{const m=r.team?r.team[t.seat][t.member]:null,hp=m?m.hp:r.hp[t.seat],st=m?m.st:r.st[t.seat];return{...t,hpAfter:Math.max(0,hp),delta:Math.max(0,hp)-t.hp,shieldAfter:st.shield||0,strongDelta:environmentBuffCount(st,'s')-(t.strong||0),weakDelta:environmentBuffCount(st,'w')-(t.weak||0)}});
  r.env.fxSeq=(r.env.fxSeq||0)+1;
  const E=envEvent(r,id),last=(r.env.fx||[]).at(-1),noticeAt=Math.max(now,(last?.noticeAt??last?.at??-ENV_NOTICE_MS)+ENV_NOTICE_MS);
  const fx={id:r.env.fxSeq,event:id,stage,at:now,noticeAt,targets,clocks,suit:E?.suit||null,source:options.source||E?.source||'normal',...options};
  r.env.fx=[...(r.env.fx||[]).filter(e=>now-(e.noticeAt??e.at)<ENV_NOTICE_MS),fx].slice(-16);
}
function recentEnvironmentFx(r=room,now=d25Now()){return r?(r.env?.fx||[]).filter(e=>environmentInfo(e.event)&&Number.isFinite(e.at)&&now>=e.at&&now-e.at<ENV_FX_MS):[]}
function environmentNoticeUI(){const now=d25Now();return(room?.env?.fx||[]).filter(e=>environmentInfo(e.event)&&Number.isFinite(e.at)&&now-(e.noticeAt??e.at)<ENV_NOTICE_MS).map(e=>{const info=environmentInfo(e.event),label=e.source==='skyfall'?'天降・環境事件':e.source==='mirror'?'鏡世界・環境事件':e.source==='skill'?'角色環境事件':e.stage==='arrival'?'環境事件':e.stage==='redeem'?'環境補給生效':'環境效果觸發';return`<div class="environment-notice env-notice-${e.event}" data-env-notice="${e.id}" style="--notice-delay:${(e.noticeAt??e.at)-now}ms"><div class="environment-notice-card" role="status" aria-live="polite"><small>${label}</small><strong><span aria-hidden="true">${info.icon}</span>${esc(info.n)}</strong>${e.detail?`<span class="environment-notice-detail">${esc(e.detail)}</span>`:''}</div></div>`}).join('')}
const environmentAtmosphere=()=>room&&room.status==='playing'&&['blood','sun','fate','silence','thorns','peace','allIn','kindness','confusion','trade'].find(id=>envActive(room,id)&&(id!=='trade'||environmentTradePending()))||'';
const environmentFateCard=c=>!!(room&&room.status==='playing'&&c&&environmentEvents(room).some(e=>e.id==='fate'&&c[0]===e.suit));
const environmentCardMark=c=>environmentFateCard(c)?'<span class="fate-card-mark" aria-hidden="true">命運＋5</span>':envActive(room,'allIn')&&+c.slice(1)>=10?'<span class="fate-card-mark env-risk-mark" aria-hidden="true">×1.5</span>':'';
// 只放在玩家可見的手牌上；裝飾不保存暗牌，也不預先揭露混亂的花色。
function environmentHandFxUI(c,seat,marked=false){return recentEnvironmentFx().filter(e=>(['fallenCrown','uprising','unity','colorShift','confusion','handRecycle','publicTrade'].includes(e.event)||e.event==='assassin'&&+c.slice(1)>=11||e.event==='ultimatum'&&marked)&&(e.focus||e.targets).some(t=>t.seat===seat)).map(e=>`<span class="environment-card-fx env-card-${e.event}" style="--fx-age:-${Math.max(0,d25Now()-e.at)}ms" aria-hidden="true"><i></i><b>${e.event==='handRecycle'?'↩':e.event==='publicTrade'?'明':e.event==='assassin'?'+5':e.event==='ultimatum'?'!':e.event==='unity'?NM(+c.slice(1)):e.event==='colorShift'?'↻':e.event==='confusion'?'?':e.event==='fallenCrown'?'↓':'↑'}</b></span>`).join('')}
function environmentEmblem(id){const paths={
  woundCrystal:'<path d="M50 15l30 35-30 35-30-35z M20 50h60 M50 15L36 50l14 35 14-35z"/>',
  emergency:'<path d="M40 20h20v20h20v20H60v20H40V60H20V40h20z"/>',
  handRecycle:'<path d="M22 38a30 30 0 1 1 0 30 M22 20v18h18 M40 43h22v30H40z"/>',
  prisoner:'<path d="M15 44l18-14 17 9 17-9 18 14-20 27-15-7-15 7z M33 30l-3 17 20 17 20-17-3-17 M39 41l11-2 12 9"/>',
  publicTrade:'<path d="M12 50q38-42 76 0-38 42-76 0z"/><circle cx="50" cy="50" r="12"/>',
  cheer:'<path d="M18 42h20l28-18v52L38 58H18z M30 58l5 23h12l-7-23 M76 36q15 14 0 28"/>',
  bloodAdvance:'<circle cx="50" cy="50" r="33"/><path d="M50 28v24l16 11 M50 7v10 M30 85h40"/>',
  frenzy:'<path d="M50 12q2 25 17 28l-2-15q30 40 7 57H28Q5 55 30 30l-1 24q16-13 21-42z"/>',
  mirrorResonance:'<path d="M19 25h24v50H19z M57 25h24v50H57z M24 65l14-28 M62 65l14-28 M45 50h10 M50 40v20"/>',
  assassin:'<path d="M22 80l23-23 M38 53l9 9 M45 55l29-36 6 2-2 7-29 32z M28 69l4 4"/>',
  invertedStage:'<path d="M18 36h62l-12-12 M82 64H20l12 12 M24 24v12 M76 76V64"/>',
  ultimatum:'<path d="M29 17h35l10 12v54H29z M63 17v15h11 M39 42h25 M39 51h19 M50 61v10 M50 77h.1"/>',
  bomb:'<circle cx="49" cy="58" r="25"/><path d="M44 32l3-9 15 4-2 10 M57 26q7-17 19-10 M76 9v12 M70 14l12 2"/>',
  crisis:'<path d="M20 71l12-31 18 16 18-16 12 31z M30 78h40 M50 15v17 M24 22l9 10 M76 22l-9 10"/>',
  peace:'<path d="M31 66h38l-6-9V41c0-17-26-17-26 0v16z M43 73q7 10 14 0 M47 22h6"/>',
  allIn:'<rect x="27" y="27" width="46" height="46" rx="7"/><path d="M37 37h2m22 0h2M49 49h2M37 61h2m22 0h2" stroke-width="5"/>',
  fallenCrown:'<path d="M20 35l8 34h18l-7-16 12-10-12-12-5 13z M57 32l-5 12 11 8-10 17h19l8-34-14 9z M28 76h44"/>',
  uprising:'<path d="M23 64V44l12-12 12 12v20 M53 64V34l12-12 12 12v30 M24 73h52"/>',
  kindness:'<path d="M50 72L28 51C7 26 43 19 50 37c7-18 43-11 22 14z"/>',
  trade:'<path d="M35 23c0 0-16 22-16 32a16 16 0 0 0 32 0c0-10-16-32-16-32z M54 41h15m-6-6 6 6-6 6"/><circle cx="78" cy="65" r="13"/><path d="M78 57v9l6 4"/>',
  secondChance:'<path d="M24 42a29 29 0 1 1 0 24 M24 24v18h18 M51 33v21l-13 9"/>',
  blessing:'<path d="M50 78V26m-13 13 13-13 13 13 M47 62Q18 63 24 40q25 3 23 22 M53 70q29 1 23-22-25 3-23 22"/>',
  price:'<path d="M50 25v49m-13-13 13 13 13-13 M25 20v17m0 13v17m50-47v17m0 13v17"/><rect x="18" y="32" width="14" height="23" rx="7"/><rect x="68" y="32" width="14" height="23" rx="7"/>'
};return `<svg class="env-emblem" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${paths[id]||''}</svg>`}
function environmentSuitWheel(){return '<div class="env-suit-wheel">'+['S','H','C','D'].map((s,n)=>`<i style="--suit-angle:${n*90}deg" class="${RED[s]?'red':''}">${SU[s]}</i>`).join('')+'</div>'}
function environmentNewField(id,stage='arrival'){
  if(id==='skyfall')return Array.from({length:3},(_,n)=>`<i class="env-skyfall-star" style="--star-x:${26+n*20}%;--star-delay:${n*180}ms">✦</i>`).join('')+'<i class="env-skyfall-ring"></i>';
  if(id==='woundCrystal')return '<i class="env-crystal-facet"></i><i class="env-crystal-facet second"></i>'+environmentEmblem(id);
  if(id==='emergency')return '<div class="env-aid-cross">＋</div>'+Array.from({length:3},(_,n)=>`<i class="env-echo" style="--ring-delay:${n*180}ms"></i>`).join('');
  if(id==='handRecycle')return '<div class="env-recycle-loop"><i>♻</i></div>'+environmentEmblem(id);
  if(id==='publicTrade')return '<div class="env-public-fan">'+['♠','♥','♣','♦'].map((s,n)=>`<i style="--card-x:${(n-1.5)*40}px;--card-angle:${(n-1.5)*15}deg;--card-delay:${n*80}ms">${s}</i>`).join('')+'</div>'+environmentEmblem(id);
  if(id==='prisoner')return '<i class="env-pact-chain"></i>'+environmentEmblem(id);
  if(id==='cheer')return environmentEmblem(id)+Array.from({length:3},(_,n)=>`<i class="env-cheer-wave" style="--ring-delay:${n*160}ms"></i>`).join('');
  if(id==='bloodAdvance')return `<div class="env-loan-dial">${stage==='redeem'?'+10':'3'}</div>`;
  if(id==='mirrorResonance')return '<div class="env-mirror-pane left"></div><div class="env-mirror-pane right"></div><div class="env-mirror-link"></div>'+environmentEmblem(id);
  if(id==='assassin')return '<div class="env-assassin-slash"></div><div class="env-assassin-slash second"></div><div class="env-assassin-cards"><i>J</i><i>Q</i><i>K</i></div>'+environmentEmblem(id);
  if(id==='invertedStage')return '<div class="env-inverted-card left">♠</div><div class="env-inverted-card right">♥</div>'+environmentEmblem(id);
  if(id==='ultimatum')return '<div class="env-ultimatum-paper"><i></i><i></i><i></i><b>!</b></div>'+environmentEmblem(id);
  if(id==='bomb')return '<div class="env-bomb-core">💣<i class="env-bomb-fuse"></i></div>'+Array.from({length:3},(_,n)=>`<i class="env-bomb-wave" style="--ring-delay:${n*140}ms"></i>`).join('')+(stage==='explode'?'<div class="env-bomb-flare"></div>':'');
  if(['crisis','frenzy'].includes(id))return '<div class="env-crisis-dawn"></div><div class="env-crisis-rays"></div><div class="env-crisis-sigil">25</div>'+Array.from({length:3},(_,n)=>`<i class="env-crisis-ring" style="--ring-delay:${n*160}ms"></i>`).join('');
  if(id==='blueSmoke')return '<div class="env-blue-smoke"></div><div class="env-blue-smoke second"></div>';
  if(id==='thorns')return '<svg class="env-vines" viewBox="0 0 800 520" preserveAspectRatio="none"><path d="M0 480Q130 470 150 380T260 460T420 450T590 470T800 410 M20 520Q80 410 15 310 M780 520Q720 440 795 320 M90 455l-12-28m80-20 28-18m115 70 9-31m135 13 18-28m101 36 20-25m104-39-20-25"/></svg>';
  if(['peace','resonance'].includes(id))return (id==='peace'?environmentEmblem(id):'<b class="env-resonance-number">24</b>')+Array.from({length:3},(_,n)=>`<i class="env-echo" style="--ring-delay:${n*210}ms"></i>`).join('');
  if(['confusion','colorShift'].includes(id))return environmentSuitWheel();
  if(id==='unity')return '<div class="env-card-gather">'+Array.from({length:5},(_,n)=>`<i style="--gather-x:${(n-2)*42}px;--gather-turn:${(n-2)*12}deg">${n+5}</i>`).join('')+'<b>＝</b></div>';
  return environmentEmblem(id)+(id==='kindness'?'<svg class="env-life-links" viewBox="0 0 800 520" preserveAspectRatio="none"><path d="M80 240Q400 500 720 240 M80 360Q400 130 720 360"/></svg>':'')+(id==='secondChance'?'<i class="env-restart-ring"></i>':'');
}
function environmentParticles(suit='',ambient=false){return Array.from({length:18},(_,n)=>`<i class="env-particle ${suit?'env-suit-particle':''}" style="--px:${6+n*37%89}%;--py:${18+n*23%70}%;--drift:${(n%2?1:-1)*(12+n%5*8)}px;--particle-delay:${n%6*90}ms;--particle-size:${2+n%3}px;--particle-period:${3500+n%5*600}ms;--particle-age:-${ambient?(Math.max(0,Date.now()-(Number.isFinite(envEvent(room,environmentAtmosphere())?.startedAt)?envEvent(room,environmentAtmosphere()).startedAt:Date.now()))+n*347)%(3500+n%5*600):0}ms">${suit?SU[suit]:''}</i>`).join('')}
function environmentBackdropUI(){const id=environmentAtmosphere();if(!id)return'';let body='';const age=Math.max(0,d25Now()-(Number.isFinite(envEvent(room,id)?.startedAt)?envEvent(room,id).startedAt:d25Now()));
  if(id==='blood')body='<div class="env-moon"></div><div class="env-fog"></div><div class="env-fog second"></div>';
  if(id==='sun')body='<div class="env-sun-disc"></div><div class="env-sun-rays"></div><div class="env-heat"></div>';
  if(id==='fate')body=environmentParticles(envEvent(room,id).suit,true)+'<div class="env-fate-seal">'+SU[envEvent(room,id).suit]+'</div>';
  if(id==='silence')body='<div class="env-fog"></div><div class="env-silence-lines"></div>';
  if(id==='thorns')body=environmentNewField(id);
  if(['peace','allIn','kindness','trade'].includes(id))body=environmentEmblem(id);
  if(id==='confusion')body=environmentSuitWheel();
  return`<div class="environment-backdrop env-bg-${id}" style="--env-age:-${age}ms" aria-hidden="true">${body}</div>`;
}
function environmentFieldFxUI(){return recentEnvironmentFx().map(e=>{const age=Math.max(0,d25Now()-e.at),id=e.event;let body='';
  if(id==='blood')body='<div class="env-blood-wave"></div>';
  if(id==='spring')body='<div class="env-water-core"></div>'+Array.from({length:3},(_,n)=>`<i class="env-water-ring" style="--ring-delay:${n*200}ms"></i>`).join('')+environmentParticles();
  if(id==='quake')body='<svg class="env-cracks" viewBox="0 0 800 520" preserveAspectRatio="none"><path d="M0 455 L170 400 215 440 295 380 340 415 420 355 475 390 580 330 645 360 800 285 M295 380 L260 290 305 265 M475 390 L450 480 490 520 M170 400 L120 330 20 350 M580 330 L550 250 610 215"/></svg>'+environmentParticles();
  if(id==='sun')body='<div class="env-solar-wave"></div>'+environmentParticles();
  if(id==='supply')body='<div class="env-airdrop"><div class="env-parachute"></div><div class="env-parachute-cords"></div><div class="env-crate"><span>＋</span></div></div>'+environmentParticles();
  if(id==='commune')body='<svg class="env-life-links" viewBox="0 0 800 520" preserveAspectRatio="none"><path d="M80 160 Q400 430 720 160 M100 300 Q400 180 700 300 M210 400 Q400 120 590 400"/></svg><div class="env-life-core"></div>'+environmentParticles();
  if(id==='chaos')body='<div class="env-chaos-orbit"></div><div class="env-chaos-orbit second"></div>'+environmentParticles();
  if(id==='duel')body='<div class="env-duel-rays"></div><div class="env-duel-ring"></div>'+environmentParticles();
  if(id==='fate')body='<div class="env-fate-reveal">'+SU[e.suit||'S']+'</div>'+environmentParticles(e.suit||'S');
  if(id==='silence')body='<div class="env-silence-wave"></div>';
  if(['thorns','peace','allIn','fallenCrown','uprising','kindness','confusion','resonance','trade','secondChance','unity','colorShift','blessing','price','mirrorResonance','assassin','invertedStage','ultimatum','bomb','crisis','blueSmoke','woundCrystal','emergency','handRecycle','prisoner','publicTrade','cheer','bloodAdvance','frenzy','skyfall'].includes(id))body=environmentNewField(id,e.stage)+environmentParticles();
  return`<div class="environment-field-fx env-fx-${id} env-stage-${e.stage} ${e.reverse?'env-pass-reverse':''}" data-env-fx="${e.id}" style="--fx-age:-${age}ms" aria-hidden="true">${body}</div>`;
}).join('')}
function environmentTargetFxUI(seat,member){return recentEnvironmentFx().map(e=>{const t=(e.focus||e.targets).find(t=>t.seat===seat&&t.member===member);if(!t)return'';const id=e.event;
  if(['woundCrystal','emergency','handRecycle','prisoner','publicTrade','cheer','bloodAdvance','frenzy'].includes(id)){const label=id==='frenzy'?'雙25絕技':id==='handRecycle'?'手牌回收':id==='cheer'?e.stage==='support'?'強壯＋5':e.stage==='failed'?'生命−5':'護盾＋5':id==='bloodAdvance'?e.stage==='redeem'?'回復10生命':'預支血量':id==='publicTrade'?'公開暗牌':id==='prisoner'?'協議揭曉':'護盾結晶';return `<div class="environment-target-fx env-target-${id} env-stage-${e.stage}" style="--fx-age:-${Math.max(0,d25Now()-e.at)}ms" aria-hidden="true"><i class="env-target-halo"></i>${environmentEmblem(id)}<span class="env-target-number">${e.detail&&['woundCrystal','emergency'].includes(id)?esc(e.detail):label}</span></div>`}
  if(['mirrorResonance','assassin','invertedStage','ultimatum','bomb','crisis'].includes(id)){const age=Math.max(0,d25Now()-e.at);return`<div class="environment-target-fx env-target-${id} env-stage-${e.stage}" style="--fx-age:-${age}ms" aria-hidden="true"><i class="env-target-halo"></i>${environmentEmblem(id)}<span class="env-target-number">${id==='assassin'?'刺客・點數歸零':id==='mirrorResonance'&&e.stage==='impact'?'護盾＋3':id==='ultimatum'?e.stage==='fulfilled'?'通牒解除':e.stage==='impact'?'通牒到期':'最後通牒':id==='crisis'?'雙25絕技':id==='bomb'?e.stage==='explode'?'爆炸！':e.stage==='pass'?'傳遞炸彈':e.stage==='failed'?'傳遞失敗':'炸彈！':'花色交換'}</span></div>`}
  if(!['spring','quake','sun','commune','blessing','price','trade'].includes(id)||(['sun','commune','trade'].includes(id)&&e.stage!=='impact'))return'';
  if(id==='spring'&&t.delta<=0||id==='quake'&&t.shieldAfter<=t.shield)return'';
  if(id==='blessing'&&!(t.strongDelta>0)||id==='price'&&!(t.weakDelta>0)||id==='trade'&&t.delta>=0)return'';
  const delta=id==='quake'?t.shieldAfter-t.shield:t.delta,text=id==='sun'?'':id==='quake'?'護盾＋'+delta:id==='blessing'?(delta>0?'＋'+delta+' · ':'')+'強壯＋2':id==='price'?(delta<0?'−'+Math.abs(delta)+' · ':'')+'虛弱＋2':(delta>0?'＋':'−')+Math.abs(delta),age=Math.max(0,d25Now()-e.at);
  return`<div class="environment-target-fx env-target-${id} ${delta<0?'env-loss':''}" data-env-target-fx="${e.id}" style="--fx-age:-${age}ms" aria-hidden="true"><i class="env-target-light"></i><i class="env-target-stream"></i>${['blessing','price','trade'].includes(id)?environmentEmblem(id):''}${text?`<span class="env-target-number">${text}</span>`:''}</div>`;
}).join('')}
function environmentClockFxUI(seat){return recentEnvironmentFx().map(e=>{if(!['chaos','duel','resonance','secondChance','trade'].includes(e.event))return'';const c=e.clocks.find(c=>c.seat===seat);if(!c)return'';const age=Math.max(0,d25Now()-e.at),text=e.event==='duel'?'25':e.event==='resonance'?'24':e.event==='secondChance'?'↺ 0':(c.delta>0?'＋':'−')+Math.abs(c.delta);
  return`<div class="environment-clock-fx env-clock-${e.event} ${c.delta<0?'env-loss':''}" style="--fx-age:-${age}ms" aria-hidden="true"><i></i><b>${text}</b></div>`;
}).join('')}
const environmentEvents=r=>!r?.cfg.warden&&r&&r.env?[r.env.event,...(r.env.extraEvents||[]),...(r.env.skillEvents||[])].filter(e=>e&&r.round>=e.round&&r.round<=e.until):[];
const envEvent=(r,id)=>environmentEvents(r).find(e=>e.id===id);
const envActive=(r,id)=>!!envEvent(r,id);
// 血條以開場生命上限五等分；最大生命降低不會重新分段、憑空補回血條。
const tidyHp=n=>Math.round(n*1e6)/1e6;
// 傷害與新獲得的護盾最後才取整；正值最低1，免疫、抵擋及零值保持0。
function damageAmount(n){return Number.isFinite(n)&&n>0?Math.max(1,Math.floor(n+1e-9)):0}
function normalizeShield(s){s.shield=Math.max(0,Math.floor((s.shield||0)+1e-9));s.shieldPersistent=Math.min(s.shield,Math.max(0,Math.floor((s.shieldPersistent||0)+1e-9)));return s}
function addShield(s,n,persistent=false){normalizeShield(s);const gain=damageAmount(n);s.shield+=gain;if(persistent)s.shieldPersistent+=gain;return gain}
function prepareDamage(r,c,s,n,log=[],name='角色'){n=isoDamage(c,s,n,log,name);n=wardenMaintenanceDamage(r,s,n);if(s?.wardenCondemned)n*=2;if(s?.wardenStage===3&&s.wardenShiftVulnRound===r?.round)n*=2;return damageAmount(n)}
function tktHealth(hp,limit,s0={}){const unit=s0.tktUnit||Math.max(1,limit+(s0.mdec||0))/5,bars=hp>0?Math.min(5,Math.max(1,Math.ceil((hp-1e-7)/unit))):0;return{unit,bars,current:bars?tidyHp(hp-Math.floor((bars-1)*unit+1e-9)):0,cap:Math.min(limit,Math.floor(bars*unit+1e-9))}}
function syncTktState(c,s0,hp,limit){if(c!=='tkt'||!s0)return;const H=tktHealth(hp,limit,s0);s0.tktUnit=H.unit;s0.tktBars=H.bars}
function syncTktHealth(r){if(!r?.hp||!r.st)return r;r.seats.forEach((_,i)=>{normalizeShield(r.st[i]);syncTktState(r.chars[i],r.st[i],r.hp[i],characterMaxHp(r,i,r.chars[i],r.st[i]));if(r.team)r.team[i].forEach((m,k)=>{normalizeShield(m.st);if(k===r.act[i]){if(m.c==='tkt'){m.st.tktUnit=r.st[i].tktUnit;m.st.tktBars=r.st[i].tktBars}}else syncTktState(m.c,m.st,m.hp,characterMaxHp(r,i,m.c,m.st))})});return r}
function absorbShield(s0,amount){normalizeShield(s0);amount=damageAmount(amount);const before=s0.shield,absorbed=Math.min(before,amount);if(absorbed>0){s0.shield=before-absorbed;s0.shieldPersistent=Math.max(0,s0.shieldPersistent-absorbed)}return{before,absorbed,remaining:amount-absorbed}}
function damagedHp(current,limit,amount,c,s0,log=[],name='時間殺人魔',prepared=false){
  amount=!prepared&&current>0?prepareDamage(room,c,s0,amount,log,name):damageAmount(amount);
  const finish=after=>{if(s0?.teaBloomSafe&&current>0)after=Math.max(1,after);if(current>0&&amount>0)after=wardenGeburaLife(s0,after,name,log);if(s0?.wardenStage<3&&(s0.wardenBroken||after<=0)){s0.wardenBroken=1;after=0}const lost=Math.max(0,Math.max(0,current)-Math.max(0,after));if(lost>0&&s0?.fx?.some(f=>f.k==='crystal'&&f.source==='environment')){const n=Math.min(5,lost);s0.shield=(s0.shield||0)+n;s0.shieldPersistent=(s0.shieldPersistent||0)+n;s0.envCrystalGained=(s0.envCrystalGained||0)+n;log.push(`💎【傷口結晶】${name} 受傷後獲得${n}點護盾`)}return after};
  let after=current-amount;if(c==='xichn'&&s0?.xichnCanExit&&!s0.xichnYuhuanUsed&&!(s0.sealT>0)&&current>0&&amount>0&&after<limit/2){after=Math.ceil(limit/2);s0.xichnYuhuanUsed=1;s0.xichnExitPending=1;log.push(`${name} 的【余桓】發動，本次生命固定為${after}（每場一次）`)}if(c!=='tkt'||!s0||s0.sealT>0||!(current>0)||!(amount>0))return finish(after);
  const H=tktHealth(current,limit,s0),floor=Math.floor((H.bars-1)*H.unit+1e-9);
  if(after<=floor){const cleared=tidyHp(Math.max(0,floor-after));after=floor;log.push(`${name} 失去1條血條（剩${H.bars-1}/5）${cleared?`，清除${cleared}點溢出傷害`:''}`)}
  after=tidyHp(after);syncTktState(c,s0,after,limit);return finish(after);
}
// 強制平等只改目前生命；普通回血不能把超額生命截回上限。
function healedHp(current,limit,amount,c,s0,log=[],name='時間殺人魔'){
  if(s0?.wardenStage<3&&s0.wardenBroken)return 0;
  if(c==='yisang'&&s0?.nineTea&&!(s0.sealT>0)&&!healingBlocked(s0)&&current>0&&amount>0)amount+=2;
  if(current>0&&amount>0&&s0?.fx?.some(f=>f.k==='aid'&&f.source==='environment')){const gain=addShield(s0,amount,true);s0.envAidGained=(s0.envAidGained||0)+gain;log.push(`🚑【急救運轉】${name} 的治療改為${gain}點護盾`);return current}
  let cap=limit,restore=false;
  if(c==='tkt'&&s0&&!(s0.sealT>0)){if(!(current>0)||!(amount>0))return current;const H=tktHealth(current,limit,s0);restore=H.bars<5&&current>=H.cap-1e-7&&current<limit;cap=restore?Math.min(limit,current+1):H.cap}
  const after=tidyHp(Math.max(current,Math.min(cap,current+(restore?1:amount))));if(!(current>0)&&after>0)clearWardenRevivalEffects(room,s0);syncTktState(c,s0,after,limit);
  if(restore&&after>current)log.push(`${name} 補回1條血條，新血條生命${tidyHp(after-current)}（共${s0.tktBars}/5）`);return after;
}
const envSilent=(r=room)=>envActive(r,'silence');
const envBlood=(r=room)=>envActive(r,'blood');
const envHeal=(r,n)=>envBlood(r)?Math.ceil(n*.7):n;
const envAttack=(r,n)=>envBlood(r)&&n>0?n+2:n;
const assassinZero=(r,opponent)=>envActive(r,'assassin')&&!!opponent&&+opponent.slice(1)<=3;
const envRank=(r,s0,card,value,opponent=null)=>assassinZero(r,opponent)?0:fixedCardRank(s0,(envActive(r,'allIn')&&+card.slice(1)>=10?Math.floor(value*1.5+1e-9):value)+(environmentEvents(r).filter(e=>e.id==='fate'&&e.suit===card[0]).length*5)+(envActive(r,'assassin')&&+card.slice(1)>=11?5:0));
const environmentEligible=(r,id)=>(id!=='cheer'||r.cfg.n===3&&!r.cfg.boss)&&(!['duel','crisis','frenzy'].includes(id)||!r.d25.some(d=>d.used));
function pickEnvironment(pool){const weight=id=>['crisis','frenzy'].includes(id)?.1:1,total=pool.reduce((n,id)=>n+weight(id),0);let roll=Math.random()*total;for(const id of pool){roll-=weight(id);if(roll<0)return id}return pool[pool.length-1]}
const envBlackDamage=(r,n,suit)=>envActive(r,'peace')&&'SC'.includes(suit)?Math.max(0,n-4):n;
const environmentEnemies=(r,i)=>r.cfg.boss?(i===1?[0,2]:[1]):r.seats.map((_,j)=>j).filter(j=>j!==i);
const removeCardOnce=(cards,c)=>{const out=[...cards],at=out.indexOf(c);if(at>=0)out.splice(at,1);return out};
const subtractCards=(cards,removed)=>(removed||[]).reduce((out,c)=>removeCardOnce(out,c),[...cards]);
const containsCards=(cards,wanted)=>{let left=[...cards];return wanted.every(c=>{if(!left.includes(c))return false;left=removeCardOnce(left,c);return true})};
function environmentLoseLife(r,i,n,log,damage=[],hp=r.hp,st=r.st){if(!(hp[i]>0))return 0;const before=hp[i];hp[i]=Math.max(0,damagedHp(before,characterMaxHp(r,i,r.chars[i],st[i]),n,envSilent(r)?null:r.chars[i],st[i],log,r.seats[i].name));const lost=recordHpLoss(r.chars[i],st[i],before,hp[i]);addDamageFx(damage,r,i,lost);return lost}
function environmentThorns(r,by,events,log,damage,hp=r.hp,st=r.st){
  if(!envActive(r,'thorns')||!Number.isInteger(by))return;
  events.filter(e=>!e.shield&&e.amount>0&&e.seat!==by).forEach(()=>{const lost=environmentLoseLife(r,by,2,log,damage,hp,st);if(lost){damage[damage.length-1].environment='thorns';log.push(`🌿【荊棘叢生】${r.seats[by].name} 因攻擊造成生命傷害，失去${lost}點生命`)}});
}
function shareEnvironmentHealing(r,seat,amount,log,healing,hp=r.hp,st=r.st,blockedFeast={}){
  if(!envActive(r,'kindness')||!(amount>0))return;
  environmentEnemies(r,seat).forEach(i=>{if(!(hp[i]>0))return;const before=hp[i],gain=healingGain(st[i],Math.ceil(amount/2)),limit=characterMaxHp(r,i,r.chars[i],st[i]);hp[i]=healedHp(before,limit,gain,envSilent(r)?null:r.chars[i],st[i],log,r.seats[i].name);const actual=hp[i]-before;if(actual<=0)return;
    if(r.chars[i]==='san'&&!blockedFeast[i])st[i].feast=(st[i].feast||0)+(st[i].feastBoost?Math.round(actual*1.5):actual);
    addHealingFx(healing,r,i,actual,undefined,seat,'kindness');log.push(`🤍【善意】${r.seats[seat].name} 實際回復${amount}點，${r.seats[i].name} 同步回復${actual}點生命${healingNote(st[i])}`);
  });
}
const environmentCardTransform=(id,c,rank)=>{const n=+c.slice(1);return id==='fallenCrown'&&n>=11?c[0]+(14-n):id==='uprising'&&n<=3?c[0]+(14-n):id==='unity'&&Number.isInteger(rank)?c[0]+rank:id==='colorShift'?({S:'H',H:'C',C:'D',D:'S'}[c[0]])+n:c};
function transformEnvironmentHands(r,id,E=envEvent(r,id)){if(id==='unity')E.ranks=r.seats.map((_,i)=>r.hp[i]>0?5+Math.floor(Math.random()*5):null);r.seats.forEach((_,i)=>{if(r.hp[i]<=0)return;let visible=[...r.up[i]];const mappings={};r.up[i]=[];r.hands[i]=r.hands[i].map(c=>{const next=environmentCardTransform(id,c,E.ranks?.[i]);mappings[c]=next;if(visible.includes(c)){visible=removeCardOnce(visible,c);r.up[i].push(next)}return next});
  if(r.env?.publicSun?.[i])r.env.publicSun[i]=r.env.publicSun[i].map(c=>({...c,card:environmentCardTransform(id,c.card,E.ranks?.[i])}));
  if(r.env?.ultimatums?.[i])r.env.ultimatums[i].card=environmentCardTransform(id,r.env.ultimatums[i].card,E.ranks?.[i]);
  if(r.st[i].cmd&&mappings[r.st[i].cmd])r.st[i].cmd=mappings[r.st[i].cmd];r.st.forEach(s=>{if(s.markTarget===i)s.markedCards=(s.markedCards||[]).map(c=>mappings[c]||c)});
});}
function resetEnvironmentD25Banner(r){r.d25Banner=null;r.env.deferredD25=null;r.d25.forEach(d=>{if(!d.used)d.ready=false})}
function environmentRoundBuff(r,m,k,n=2){m.st.fx=m.st.fx||[];m.st.fx.push({k,n,t:1,source:'environment',round:r.round})}
function clearEnvironmentRoundBuffs(r){r.st.forEach(s=>s.fx=(s.fx||[]).filter(f=>f.source!=='environment'||f.round>=r.round));if(r.team)r.team.forEach(t=>t.forEach(m=>m.st.fx=(m.st.fx||[]).filter(f=>f.source!=='environment'||f.round>=r.round)))}
const environmentTradePending=(r=room)=>!!(r&&r.status==='playing'&&r.env?.trade&&r.env.trade.round===r.round&&!r.env.trade.settled);
let hostEnvironmentChoices={};
function queueEnvironmentChoice(r,id,E){const T={kind:id,id:`${r.roundBase||1}:${r.round}:${E.startedAt}:${id}:${r.env.fxSeq||0}`,round:r.round,seats:id==='prisoner'?[...r.pair]:r.seats.map((_,i)=>i),choices:{},settled:false};if(environmentTradePending(r)){if(r.env.trade.kind!==id){r.env.choiceQueue=r.env.choiceQueue||[];r.env.choiceQueue.push(T)}return}r.env.trade=T;T.seats=T.seats.filter(i=>r.hp[i]>0);r.deadline=0;if(r.d25Banner){T.banner=r.d25Banner;r.d25Banner=null}}
function beginNextEnvironmentChoice(r){if(r.status!=='playing'||!r.env.trade?.settled||!r.env.choiceQueue?.length)return;const T=r.env.choiceQueue.shift();T.seats=T.kind==='prisoner'?[...r.pair]:T.seats.filter(i=>r.hp[i]>0);T.banner=r.d25Banner||r.env.trade.banner;r.d25Banner=null;r.env.trade=T;r.deadline=0}
function flushEnvironmentConversions(r){for(const [key,id] of [['envCrystalGained','woundCrystal'],['envAidGained','emergency']]){const focus=[];let amount=0;r.st.forEach((s,i)=>{if(s[key]>0){amount+=s[key];focus.push({seat:i,member:r.act?.[i]??-1});delete s[key]}});if(r.team)r.team.forEach((t,i)=>t.forEach((m,k)=>{if(k!==r.act[i]&&m.st[key]>0){amount+=m.st[key];focus.push({seat:i,member:k})}delete m.st[key]}));if(focus.length)queueEnvironmentFx(r,id,'impact',[],[],{focus,detail:`護盾＋${amount}`})}}
function environmentChoiceUI(s){const T=room.env.trade,info=environmentInfo(T.kind),chosen=T.choices[s];return`<div class="environment-trade"><b>${info.icon} ${esc(info.n)}・出牌前選擇</b><p>${esc(info.d)}</p><div class="mut">${T.seats.map(i=>`P${i+1} ${esc(room.seats[i].name)}：${T.choices[i]===undefined?'選擇中':'已確認'}`).join('｜')}</div>${!T.seats.includes(s)?'<p>等待出戰雙方選擇…</p>':chosen!==undefined?'<p>已確認，等待其他玩家選擇…</p>':T.kind==='prisoner'?'<div class="row"><button onclick="chooseEnvironmentTrade(0)">合作</button><button onclick="chooseEnvironmentTrade(1)">背叛</button></div>':`<div class="row"><button onclick="chooseEnvironmentTrade(0)">不預支</button><button ${room.hp[s]<5?'disabled':''} onclick="chooseEnvironmentTrade(5)">支付5血 → 3次出戰後回10血</button></div>`}</div>`}
function settleEnvironmentChoice(r,T){
  const id=T.kind,log=[],damage=[],healing=[],before=environmentFxSnapshot(r),choices=id==='prisoner'?hostEnvironmentChoices[T.id]:T.choices;T.settled=true;
  const heal=(i,n)=>{const old=r.hp[i],gain=envHeal(r,healingGain(r.st[i],n));r.hp[i]=healedHp(old,characterMaxHp(r,i,r.chars[i],r.st[i]),gain,envSilent(r)?null:r.chars[i],r.st[i],log,r.seats[i].name);const actual=r.hp[i]-old;addHealingFx(healing,r,i,actual);if(r.chars[i]==='san'&&actual>0)r.st[i].feast=(r.st[i].feast||0)+(r.st[i].feastBoost?Math.round(actual*1.5):actual);shareEnvironmentHealing(r,i,actual,log,healing)};
  if(id==='bloodAdvance')T.seats.forEach(i=>{if(choices[i]===5){environmentLoseLife(r,i,5,log,damage);r.env.advances=r.env.advances||{};r.env.advances[i]=[...(r.env.advances[i]||[]),{left:3,lastRound:0}];log.push(`🩸【預支血量】${r.seats[i].name} 支付5點生命，3次自己出戰後回復10點生命`)}else log.push(`🩸 ${r.seats[i].name} 不預支血量`)});
  if(id==='prisoner'){
    const betrayed=T.seats.filter(i=>choices[i]===1);T.seats.forEach(i=>{if(!betrayed.length)heal(i,4);else if(betrayed.length===1&&choices[i]===1){r.st[i].shield=(r.st[i].shield||0)+4;r.st[i].shieldPersistent=(r.st[i].shieldPersistent||0)+4}else environmentLoseLife(r,i,3,log,damage)});
    log.push(`🤝【囚徒協議】${T.seats.map(i=>r.seats[i].name+'：'+(choices[i]===1?'背叛':'合作')).join('、')}；${!betrayed.length?'各回復4點生命':betrayed.length===1?'背叛者護盾＋4，合作者生命−3':'各失去3點生命'}`);delete hostEnvironmentChoices[T.id];
  }
  syncEnvironmentTeam(r);settleInstantBattle(r,log);queueEnvironmentFx(r,id,'impact',before,[],{detail:id==='prisoner'?log.at(-1):'預支選擇完成'});
  if(r.status==='playing'&&T.banner){r.d25Banner={...T.banner,round:r.round};if(r.d25Banner.draw&&!r.d25Banner.draw.settled){const now=Date.now();r.d25Banner.draw={...r.d25Banner.draw,startedAt:now,endsAt:now+3600}}}
  if(envSilent(r)&&r.d25Banner){r.env.deferredD25=r.d25Banner;r.d25Banner=null}
  r.sLog=[...(r.sLog||[]),...log];r.instantFx={id:(r.instantFx?.id||0)+1,seat:-1,chars:[...r.chars],hits:[],damage,healing,log};r.deadline=r.status==='playing'&&r.cfg.time?Date.now()+r.cfg.time*1000:0;
}
function chooseEnvironmentTrade(amount){const seat=rd();if(isoPending()||valorantShopPending()||mirrorPending()||!environmentTradePending()||seat<0)return;const req={type:'environmentTrade',uid,seat,round:room.round,tradeId:room.env.trade.id,amount};if(test||isHost)acceptEnvironmentTrade(null,req);else if(hostConn)hostConn.send({privateRequest:req})}
function acceptEnvironmentTrade(cn,req){
  if(isoPending()||valorantShopPending()||mirrorPending()||!isHost||!environmentTradePending()||!req||!Number.isInteger(req.seat)||!Number.isInteger(req.amount)||req.amount<0||req.amount>5)return false;
  if(test?!!cn:((cn?cn.uid:uid)!==req.uid||room.seats[req.seat]?.id!==req.uid))return false;
  const T=room.env.trade,i=req.seat;if(req.tradeId!==T.id||req.round!==room.round||!T.seats.includes(i)||T.choices[i]!==undefined)return false;
  if(T.kind==='prisoner'){if(![0,1].includes(req.amount))return false}
  else if(req.amount>room.hp[i]||T.kind==='bloodAdvance'&&![0,5].includes(req.amount)||!T.kind&&room.d25[i].used&&req.amount>0)return false;
  const r=JSON.parse(JSON.stringify(room)),trade=r.env.trade;trade.choices[i]=req.amount;
  if(T.kind==='prisoner'){hostEnvironmentChoices[T.id]=hostEnvironmentChoices[T.id]||{};hostEnvironmentChoices[T.id][i]=req.amount;trade.choices[i]=true}
  if(T.kind){if(trade.seats.every(j=>trade.choices[j]!==undefined)){settleEnvironmentChoice(r,trade);beginNextEnvironmentChoice(r)}save(r);return true}
  if(trade.seats.every(j=>trade.choices[j]!==undefined)){
    const log=[],damage=[],before=environmentFxSnapshot(r),clockBefore=r.d25.map(d=>d.val);trade.settled=true;
    trade.seats.forEach(j=>{const n=trade.choices[j],d=r.d25[j];if(n>0){environmentLoseLife(r,j,n,log,damage);if(!d.used){d.val+=n;d.ready=false;if(d.val>25)d.bust=true}}log.push(`🩸【命運交易】${r.seats[j].name} ${n?'消耗'+n+'點生命，二十五之刻'+(d.bust?'崩壞（'+d.val+'點）':d.val+'點'):'選擇不交易'}`)});
    syncEnvironmentTeam(r);settleInstantBattle(r,log);
    queueEnvironmentFx(r,'trade','impact',before,trade.seats.filter(j=>trade.choices[j]>0).map(seat=>({seat,delta:r.d25[seat].val-clockBefore[seat]})));
    if(trade.banner){const D=trade.banner.draw;if(D&&!D.settled&&(!D.phase||D.phase!=='spin')){r.d25Claimed=false;resetEnvironmentD25Banner(r)}else{r.d25Banner={...trade.banner,round:r.round};if(D&&!D.settled){const now=Date.now();r.d25Banner.draw={...D,startedAt:now,endsAt:now+3600}}}}
    if(r.status==='playing'&&!r.d25Claimed)claimEnvironmentD25(r,r.seats.map((_,j)=>j));
    if(envSilent(r)&&r.d25Banner){r.env.deferredD25=r.d25Banner;r.d25Banner=null}
    r.sLog=[...(r.sLog||[]),...log];r.instantFx={id:(r.instantFx?.id||0)+1,seat:-1,hits:[],chars:[...r.chars],damage,log};r.deadline=r.cfg.time?Date.now()+r.cfg.time*1000:0;
  }
  beginNextEnvironmentChoice(r);save(r);return true;
}
function environmentTradeUI(s){if(room.env.trade.kind)return environmentChoiceUI(s);const T=room.env.trade,chosen=T.choices[s],d=room.d25[s],max=Math.min(5,room.hp[s]);return`<div class="environment-trade"><b>🩸 命運交易・出牌前選擇</b><p class="mut">所有存活玩家先選完，再同時扣血與填充二十五之刻。旁觀者也能交易。</p><div class="mut">${T.seats.map(i=>`P${i+1} ${esc(room.seats[i].name)}：${T.choices[i]===undefined?'選擇中':'已確認'}`).join('｜')}</div>${chosen!==undefined?'<p>已確認，等待其他玩家選擇…</p>':`<p>你的生命 ${room.hp[s]}｜二十五之刻 ${d.val} / 25${d.bust?'（已崩壞，交易不解除崩壞）':''}${d.used?'（已發動絕技，本局不能再交易填充）':''}</p><div class="row trade-options"><button type="button" onclick="chooseEnvironmentTrade(0)">不交易</button>${d.used?'':Array.from({length:max},(_,i)=>i+1).map(n=>`<button type="button" onclick="chooseEnvironmentTrade(${n})">消耗 ${n} 血 → ＋${n} 點</button>`).join('')}</div>`}</div>`}
function syncEnvironmentSunCards(){environmentEvents(room).filter(E=>['fallenCrown','uprising','unity','colorShift'].includes(E.id)).forEach(E=>{const key=`${room.roundBase}:${E.round}:${E.startedAt}:${E.id}:${E.source||'normal'}`;
  Object.entries(hostSunCards).forEach(([seat,cards])=>{if(room.hp[seat]<=0)return;cards.forEach(c=>{if((c.environmentKeys||[]).includes(key)||c.environmentKey===key||c.expires<E.round)return;c.card=environmentCardTransform(E.id,c.card,E.ranks?.[seat]);c.environmentKeys=[...(c.environmentKeys||[]),key];c.environmentKey=key;if(test||room.seats[seat].id===uid){privateSunCards=privateSunCards.map(p=>p.id===c.id?{...c}:p)}else sendPrivateTo(room.seats[seat].id,{sunCardUpdate:{...c}})})});
});}
const publicTemporaryCards=(r,i)=>(r.env?.publicSun?.[i]||[]).filter(c=>c.expires>=r.round);
const lkdRedrawRemaining=(r,i)=>r.lkdRedraws?.[i]??(r.team?.[i]?r.team[i].reduce((n,m,k)=>n+((k===r.act[i]?r.st[i]:m.st).lkdRedraws||0),0):r.st[i].lkdRedraws||0);
const freeLkdRedraw=(r,i)=>!envSilent(r)&&!(r.st[i].sealT>0)&&lkdRedrawRemaining(r,i)>0;
const freeWardenRedraw=(r,i)=>unlimitedWardenSwaps(r,i)&&(r.wardenRedraws?.[i]||0)>0;
const redrawCost=(r,i)=>freeWardenRedraw(r,i)||freeLkdRedraw(r,i)?0:Math.max(0,5*((r.rdw&&r.rdw[i]||0)+1)-(r.env&&r.env.supply[i]>0?5:0));
const redrawLabel=(r,i)=>freeWardenRedraw(r,i)?'階段免費・剩'+r.wardenRedraws[i]+'次':freeLkdRedraw(r,i)?'免費・剩'+lkdRedrawRemaining(r,i)+'次':'扣 '+redrawCost(r,i)+' 血';
function environmentMembers(r){const out=[];r.seats.forEach((_,i)=>{
  if(r.hp[i]>0)out.push({i,k:-1,c:r.chars[i],st:r.st[i],hp:r.hp[i],max:characterMaxHp(r,i,r.chars[i],r.st[i])});
  if(r.team)r.team[i].forEach((m,k)=>{if(k!==r.act[i]&&!m.dead&&m.hp>0)out.push({i,k,c:m.c,st:m.st,hp:m.hp,max:characterMaxHp(r,i,m.c,m.st)})});
});return out}
function setEnvironmentHp(r,m,hp){syncTktState(m.c,m.st,hp,m.max);if(m.k<0)r.hp[m.i]=hp;else r.team[m.i][m.k].hp=hp}
function syncEnvironmentTeam(r){flushEnvironmentConversions(r);syncTktHealth(r);if(r.team)r.team.forEach((t,i)=>{const m=t[r.act[i]];if(m){m.hp=r.hp[i];m.st=JSON.parse(JSON.stringify(r.st[i]))}})}
function claimEnvironmentD25(r,candidates){const B=claimD25({...r,round:r.round-1},r.d25,candidates);if(B){r.d25Claimed=true;r.d25Banner=B}return B}
function shareEnvironmentHp(r,log){const members=environmentMembers(r).sort((a,b)=>a.max-b.max);if(!members.length)return;
  let remaining=members.reduce((n,m)=>n+m.hp,0),left=members.length,split=0;
  while(split<members.length&&members[split].max<=Math.floor(remaining/left)){const m=members[split++];m.next=m.max;remaining-=m.next;left--}
  if(left){const base=Math.floor(remaining/left),extra=remaining%left,offset=Math.floor(Math.random()*left);members.slice(split).forEach((m,j)=>m.next=base+((j-offset+left)%left<extra?1:0))}
  members.forEach(m=>{recordHpLoss(m.c,m.st,m.hp,m.next);setEnvironmentHp(r,m,m.next)});
  log.push(`【共產】${members.length}名存活角色平均分配生命（總生命${members.reduce((n,m)=>n+m.hp,0)}；保留各自上限，餘數隨機分配）`);
  syncEnvironmentTeam(r);
}
function applyEnvironmentEvent(rm,id,extra=false,source=null){if(rm.cfg.warden)return rm;if(isoPending(rm))return rm;if(!ENV_EVENTS[id]||!environmentEligible(rm,id))return rm;const r=JSON.parse(JSON.stringify(rm));r.env=r.env||newEnvironment(r.seats.length);
  const before=environmentFxSnapshot(r),clockBefore=r.d25.map((d,i)=>({val:d.val,alive:r.hp[i]>0,used:d.used}));
  const E={id,round:r.round,until:r.round+(['blood','invertedStage'].includes(id)?1:0),startedAt:Date.now()},log=[`${ENV_EVENTS[id].icon}【環境事件・${ENV_EVENTS[id].n}】${ENV_EVENTS[id].d}`];
  if(extra){E.source=source||'mirror';r.env.extraEvents=[...(r.env.extraEvents||[]),E]}else{r.env.event=E;r.env.lastId=id}
  if(id==='skyfall'){
    const selected=[];while(selected.length<3){const hasUltimate=selected.some(k=>['crisis','frenzy'].includes(k)),pool=Object.keys(ENV_EVENTS).filter(k=>k!=='skyfall'&&!selected.includes(k)&&environmentEligible(r,k)&&(!hasUltimate||!['duel','crisis','frenzy'].includes(k)));if(!pool.length)break;selected.push(pickEnvironment(pool))}
    E.children=selected;r.sLog=[...(r.sLog||[]),...log,`🌠【天降事件】${selected.map(k=>ENV_EVENTS[k].n).join('、')}`];queueEnvironmentFx(r,id,'arrival',before,[],{source:E.source||'normal',detail:selected.map(k=>ENV_EVENTS[k].n).join('・')});
    // 決滅會暫停原戰局；先啟動其餘場地，再施放直接啟用25絕技的事件。
    return [...selected.filter(k=>!['crisis','frenzy'].includes(k)),...selected.filter(k=>['crisis','frenzy'].includes(k))].reduce((next,k)=>applyEnvironmentEvent(next,k,true,'skyfall'),r);
  }
  if(id==='fate')E.suit=rnd(['S','C','H','D']);
  if(id==='ultimatum')r.seats.forEach((_,i)=>{if(r.hp[i]<=0)return;const cards=[...r.hands[i].map(card=>({card})),...(hostSunCards[i]||[]).filter(c=>c.expires>=r.round).map(c=>({card:c.card,sunId:c.id}))];if(!cards.length)return;const high=Math.max(...cards.map(c=>+c.card.slice(1))),chosen=rnd(cards.filter(c=>+c.card.slice(1)===high));(r.env.ultimatums=r.env.ultimatums||{})[i]={...chosen,left:2,lastRound:0};if(!chosen.sunId&&!firefuThirstCard(r,i,chosen.card)&&!r.up[i].includes(chosen.card))r.up[i].push(chosen.card);log.push(`📜 ${r.seats[i].name} 的最後通牒：${cs(chosen.card)}${chosen.sunId?'（暫時手牌）':''}，須在兩次出戰內打出`)});
  if(id==='bomb'){const alive=r.seats.map((_,i)=>i).filter(i=>r.hp[i]>0),i=rnd(alive);if(i!==undefined){E.holder=i;r.st[i].bombs=[...(r.st[i].bombs||[]),{id:`${r.roundBase||1}:${r.round}:${E.startedAt}:${extra?'mirror':'normal'}:${(r.st[i].bombs||[]).length}`,left:5,lastRound:0}];log.push(`💣 ${r.seats[i].name} 獲得炸彈，剩5次持有者出戰`)}}
  if(id==='crisis')E.caster=activateCrisis(r,log);
  if(id==='frenzy')E.caster=activateFrenzy(r,log);
  if(id==='woundCrystal'||id==='emergency')environmentMembers(r).forEach(m=>environmentRoundBuff(r,m,id==='woundCrystal'?'crystal':'aid',1));
  if(id==='publicTrade')r.seats.forEach((_,i)=>{if(r.hp[i]<=0)return;const hidden=subtractCards(r.hands[i],r.up[i]),known=publicTemporaryCards(r,i),temporary=(hostSunCards[i]||[]).filter(c=>c.expires>=r.round&&!known.some(x=>x.id===c.id));r.up[i]=r.hands[i].filter(c=>!firefuThirstCard(r,i,c));r.env.publicSun=r.env.publicSun||{};r.env.publicSun[i]=[...known,...temporary.map(c=>({id:c.id,card:c.card,expires:c.expires}))];const count=hidden.filter(c=>!firefuThirstCard(r,i,c)).length+temporary.length;if(!count)return;const beforeHp=r.hp[i],n=envHeal(r,healingGain(r.st[i],count*3));r.hp[i]=healedHp(beforeHp,characterMaxHp(r,i,r.chars[i],r.st[i]),n,envSilent(r)?null:r.chars[i],r.st[i],log,r.seats[i].name);if(r.chars[i]==='san'&&r.hp[i]>beforeHp)r.st[i].feast=(r.st[i].feast||0)+(r.st[i].feastBoost?Math.round((r.hp[i]-beforeHp)*1.5):r.hp[i]-beforeHp);log.push('👁️【公開交易】'+r.seats[i].name+' 公開'+count+'張暗牌，回復'+(r.hp[i]-beforeHp)+'點生命')});
  if(['bloodAdvance','prisoner'].includes(id))queueEnvironmentChoice(r,id,E);
  if(id==='sun'||id==='commune')r.env.pending.push({id,at:r.round+1,...(extra?{source:E.source}:{})});
  if(id==='spring')environmentMembers(r).forEach(m=>{const gain=envHeal(r,Math.ceil(5*healingFactor(m.st))),after=healedHp(m.hp,m.max,gain,envSilent(r)?null:m.c,m.st,log,r.seats[m.i].name);setEnvironmentHp(r,m,after);if(m.c==='san'&&after>m.hp)m.st.feast=(m.st.feast||0)+(m.st.feastBoost?Math.round((after-m.hp)*1.5):after-m.hp);log.push(`${r.seats[m.i].name}${m.k>=0?' 的後備 '+CHARS[m.c].n:''} 回復${after-m.hp}點生命${healingNote(m.st)}`)});
  if(id==='quake')environmentMembers(r).forEach(m=>{m.st.shield=(m.st.shield||0)+3;m.st.shieldPersistent=(m.st.shieldPersistent||0)+3});
  if(id==='supply')r.seats.forEach((_,i)=>{if(r.hp[i]>0)r.env.supply[i]++});
  if(id==='chaos'){
    const used=r.d25.some(d=>d.used);r.d25.forEach((d,i)=>{if(r.hp[i]<=0||d.used)return;const delta=(Math.random()<.5?-1:1)*(1+Math.floor(Math.random()*10));d.val=Math.max(0,d.val+delta);d.ready=false;if(d.val>25)d.bust=true;log.push(`${r.seats[i].name} 二十五之刻${delta>0?'+':''}${delta}，目前${d.val}點${d.bust?'（崩壞）':''}`)});
    if(!used){r.d25Claimed=false;r.d25Banner=null;r.env.deferredD25=null;claimEnvironmentD25(r,r.seats.map((_,i)=>i))}
  }
  if(id==='duel'&&!r.d25.some(d=>d.used)){
    r.d25Claimed=false;r.d25Banner=null;r.env.deferredD25=null;
    r.d25.forEach((d,i)=>{if(r.hp[i]>0&&!d.used){d.val=25;d.bust=false;d.ready=false}});
    claimEnvironmentD25(r,r.seats.map((_,i)=>i));
  }
  if(id==='fate')log.push(`【命運】本回合${SU[E.suit]}最終點數+5`);
  if(id==='silence'&&r.d25Banner){r.env.deferredD25=r.d25Banner;r.d25Banner=null;log.push('25絕技資格保留，沉默結束後再開啟彈窗')}
  if(['fallenCrown','uprising','unity','colorShift'].includes(id))transformEnvironmentHands(r,id,E);
  if(id==='resonance'){resetEnvironmentD25Banner(r);r.d25.forEach((d,i)=>{if(r.hp[i]>0){d.val=24;d.bust=false}});if(!r.d25.some(d=>d.used))r.d25Claimed=false}
  if(id==='secondChance'){resetEnvironmentD25Banner(r);r.d25.forEach(d=>{if(!d.used){d.val=0;d.bust=false}});r.d25Claimed=false}
  if(id==='trade'&&environmentTradePending(r)&&r.env.trade.kind){r.env.choiceQueue=r.env.choiceQueue||[];r.env.choiceQueue.push({id:`${r.roundBase||1}:${r.round}:${E.startedAt}:trade`,round:r.round,seats:r.seats.map((_,i)=>i).filter(i=>r.hp[i]>0),choices:{},settled:false})}
  if(id==='trade'&&!environmentTradePending(r)){
    const seats=r.seats.map((_,i)=>i).filter(i=>r.hp[i]>0);r.env.trade={id:`${r.roundBase||1}:${r.round}:${E.startedAt}`,round:r.round,seats,choices:{},settled:false};r.deadline=0;
    if(r.d25Banner){r.env.trade.banner=r.d25Banner;r.d25Banner=null}
  }
  if(id==='blessing'){const alive=r.seats.map((_,i)=>i).filter(i=>r.hp[i]>0),low=Math.min(...alive.map(i=>r.hp[i]));alive.filter(i=>r.hp[i]===low).forEach(i=>{const m=environmentMembers(r).find(m=>m.i===i&&m.k<0),gain=healingGain(m.st,5),after=healedHp(m.hp,m.max,gain,envSilent(r)?null:m.c,m.st,log,r.seats[m.i].name);setEnvironmentHp(r,m,after);if(m.c==='san'&&after>m.hp)m.st.feast=(m.st.feast||0)+(m.st.feastBoost?Math.round((after-m.hp)*1.5):after-m.hp);environmentRoundBuff(r,m,'s');log.push(`${r.seats[i].name} 獲得弱者的祝福：回復${after-m.hp}點生命，本回合強壯+2`)});}
  if(id==='price'){const members=environmentMembers(r),high=Math.max(...members.map(m=>m.hp));members.filter(m=>m.hp===high).forEach(m=>{const after=Math.max(0,damagedHp(m.hp,m.max,5,envSilent(r)?null:m.c,m.st,log,r.seats[m.i].name,true));recordHpLoss(m.c,m.st,m.hp,after);setEnvironmentHp(r,m,after);environmentRoundBuff(r,m,'w');log.push(`${r.seats[m.i].name}${m.k>=0?' 的後備 '+CHARS[m.c].n:''} 付出強者的代價：失去${m.hp-after}點生命，本回合虛弱+2`)});syncEnvironmentTeam(r);settleInstantBattle(r,log);}
  // 鏡世界可與命運交易同回合並存；量表重設後不恢復交易前的舊資格。
  if(environmentTradePending(r)&&id!=='trade'){
    if(['chaos','duel','resonance','secondChance'].includes(id))delete r.env.trade.banner;
    if(envSilent(r)){const banner=r.d25Banner||r.env.trade.banner;if(banner)r.env.deferredD25=banner;r.d25Banner=null;delete r.env.trade.banner}
    else if(r.d25Banner){r.env.trade.banner=r.d25Banner;r.d25Banner=null}
  }
  syncEnvironmentTeam(r);r.sLog=[...(r.sLog||[]),...log];
  const clocks=['chaos','duel','resonance','secondChance'].includes(id)?r.d25.map((d,seat)=>({seat,delta:d.val-clockBefore[seat].val})).filter(c=>{
    const old=clockBefore[c.seat];if(!old.alive)return false;if(id==='resonance')return true;if(old.used)return false;
    return id==='secondChance'||(id==='duel'?!r.d25.some(d=>d.used):c.delta!==0);
  }):[];
  if(!['crisis','frenzy'].includes(id)){const focus=id==='bomb'?(E.holder===undefined?[]:[E.holder]):['mirrorResonance','invertedStage'].includes(id)?r.pair:id==='ultimatum'?r.seats.map((_,i)=>i).filter(i=>r.hp[i]>0):null;queueEnvironmentFx(r,id,'arrival',before,clocks,{source:E.source||'normal',...(focus?{focus:focus.map(seat=>({seat,member:r.act?.[seat]??-1}))}:{}),...(id==='bomb'&&E.holder!==undefined?{detail:r.seats[E.holder].name+' 取得炸彈'}:{})})}return r;
}
function beginEnvironment(rm){if(rm.cfg.warden)return {...rm,cfg:{...rm.cfg,events:false},env:newEnvironment(rm.seats.length),d25Banner:null};if(isoPending(rm))return rm;let r=JSON.parse(JSON.stringify(rm));r.env=r.env||newEnvironment(r.seats.length);
  // 間隔只由房主在開局及事件發生後抽選，保存在房間，重繪與訂閱不重抽。
  if(r.cfg.events&&!Number.isFinite(r.env.nextRound))r.env.nextRound=r.round+environmentGap()-1;
  if(r.env.processedRound===r.round)return r;
  r.env.processedRound=r.round;if(r.env.support?.round!==r.round)delete r.env.support;clearEnvironmentRoundBuffs(r);if(r.env.event&&r.env.event.until<r.round)r.env.event=null;r.env.extraEvents=(r.env.extraEvents||[]).filter(e=>e.until>=r.round);r.env.skillEvents=(r.env.skillEvents||[]).filter(e=>e.until>=r.round);
  const due=r.env.pending.filter(e=>e.at<=r.round);r.env.pending=r.env.pending.filter(e=>e.at>r.round);
  due.forEach(e=>{if(r.status!=='playing')return;const before=environmentFxSnapshot(r);if(e.id==='commune'){const log=[];shareEnvironmentHp(r,log);r.sLog=[...(r.sLog||[]),...log];queueEnvironmentFx(r,'commune','impact',before)}
    if(e.id==='sun'){const next=resolve(r,{},null,null,null,{environmentDamage:3}),result=next.instantResult;delete next.instantResult;r=next;r.sLog=[...(r.sLog||[]),...result.log];r.instantFx={id:(r.instantFx?.id||0)+1,seat:-1,hits:[],chars:[...r.chars],damage:result.damage,log:result.log};queueEnvironmentFx(r,'sun','impact',before)}
  });
  if(r.status!=='playing')return r;
  const deferred=r.env.deferredD25;if(deferred&&!envSilent(r)){r.env.deferredD25=null;const d=r.d25[deferred.seat],D=deferred.draw;
    if(D&&!D.settled&&(!D.phase||D.phase==='spin')&&r.hp[deferred.seat]>0&&d?.ready&&!d.used){const now=Date.now();r.d25Banner={...deferred,round:r.round,draw:{...D,id:`${r.roundBase||1}:${r.round}:${now}`,startedAt:now,endsAt:now+3600,settled:false}}}
    else if(D&&!D.settled)r.d25Banner=claimD25({...r,d25Claimed:false,round:r.round-1},r.d25,D.candidates.map(p=>p.seat));
    else if(r.hp[deferred.seat]>0&&d?.ready&&!d.used)r.d25Banner={...deferred,round:r.round};
  }
  if(r.cfg.events&&r.round>=r.env.nextRound){const pool=Object.keys(ENV_EVENTS).filter(id=>id!==r.env.lastId&&environmentEligible(r,id));r=applyEnvironmentEvent(r,pickEnvironment(pool));r.env.nextRound=r.round+environmentGap()}
  return r;
}
function environmentUI(){
  const events=environmentEvents(room).filter(e=>room.cfg.events||e.source==='mirror'||e.source==='skyfall'||e.source==='skill'),pending=(room.env?.pending||[]).filter(e=>room.cfg.events||e.source==='mirror'||e.source==='skyfall').map(e=>`${ENV_EVENTS[e.id].n}：第${shownRound(e.at)}回合生效`).join('；');
  if(!room.cfg.events&&!events.length&&!pending)return'';
  const timing=E=>['blood','blueSmoke','invertedStage'].includes(E.id)?'剩'+(E.until-room.round+1)+'回合':['bomb','ultimatum'].includes(E.id)?'狀態依出戰倒數':['crisis','frenzy','publicTrade'].includes(E.id)?'立即生效':E.id==='sun'||E.id==='commune'?'下回合生效':'本回合';
  return`<details class="environment-panel" aria-label="環境事件"><summary>${events.length?events.map(E=>`<b>${E.source==='mirror'?'🪞 ':''}${environmentInfo(E.id).icon} ${esc(environmentInfo(E.id).n)}${E.suit?' '+SU[E.suit]:''}</b><small>${timing(E)}</small>`).join(' · '):'<b>🌌 環境平靜</b>'}</summary><div class="environment-description">${events.map(E=>`<p><b>${E.source==='skyfall'?'天降額外事件・':E.source==='mirror'?'鏡世界額外事件・':E.source==='skill'?'角色環境・':''}${esc(environmentInfo(E.id).n)}</b>：${esc(environmentInfo(E.id).d)}${E.suit?' 本回合指定：'+SU[E.suit]+'。':''}</p>`).join('')||'<p>一般場地事件每隔3～5回合隨機發生。</p>'}${pending?`<small>${esc(pending)}</small>`:''}</div></details>`;
}
function environmentTestUI(){if(!test||!room.cfg.events||room.status!=='playing')return'';const allowed=room.phase==='play'&&!d25DrawPending()&&!mirrorPending()&&!environmentTradePending()&&!Object.keys(moves).some(k=>k.startsWith(room.round+'_')&&moves[k]);
  return`<div class="environment-test"><label>🧪 測試事件 <select id="testEvent">${Object.entries(ENV_EVENTS).map(([id,e])=>`<option value="${id}">${e.icon} ${e.n}</option>`).join('')}</select></label><button ${allowed?'':'disabled'} onclick="testEnvironment()">觸發事件</button><small class="mut">雙方出牌前可測試；正式對戰由房主自動抽選。</small></div>`}
function testEnvironment(){if(!test||!room?.cfg.events||room.status!=='playing'||room.phase!=='play'||mirrorPending()||d25DrawPending()||environmentTradePending()||Object.keys(moves).some(k=>k.startsWith(room.round+'_')&&moves[k]))return;
  const id=document.getElementById('testEvent').value;if(!ENV_EVENTS[id]||!environmentEligible(room,id))return;
  busy='';save(applyEnvironmentEvent(room,id));
}
const mirrorPending=(r=room)=>!!(r&&r.status==='playing'&&r.mirrorChoice&&r.mirrorChoice.round===r.round);
const mirrorEventPool=r=>Object.keys(ENV_EVENTS).filter(id=>environmentEligible(r,id));
function prepareMirror(r){if(r.cfg.warden)return r;if(envSilent(r)||r.mirrorRound===r.round||(r.round-(r.roundBase||1)+1)%3!==0)return r;
  const member=environmentMembers(r).find(m=>m.c==='yisang'&&!(m.st.sealT>0));if(!member)return r;
  const pool=mirrorEventPool(r),search=!!member.st.mirrorSearch,options=search?pool:[...pool];
  if(!search){options.length=0;const left=[...pool];while(options.length<4&&left.length){const id=pickEnvironment(left);options.push(id);left.splice(left.indexOf(id),1)}}
  r.mirrorRound=r.round;r.mirrorChoice={id:`${r.roundBase||1}:${r.round}:${member.i}:${Date.now()}`,round:r.round,seat:member.i,member:member.k,search,options,startedAt:Date.now()};r.phase='play';r.deadline=0;return r;
}
function chooseMirror(event){if(battleObservationActive())return;if(!mirrorPending()||rd()!==room.mirrorChoice.seat)return;const Q=room.mirrorChoice,req={type:'mirrorChoice',uid,seat:Q.seat,round:room.round,choiceId:Q.id,event};if(test||isHost)acceptMirrorChoice(null,req);else if(hostConn)hostConn.send({privateRequest:req})}
function acceptMirrorChoice(cn,req){
  if(!isHost||!mirrorPending()||!req||!Number.isInteger(req.seat))return false;
  const Q=room.mirrorChoice;if(req.round!==room.round||req.choiceId!==Q.id||req.seat!==Q.seat||!Q.options.includes(req.event)||!mirrorEventPool(room).includes(req.event))return false;
  if(test?!!cn:((cn?cn.uid:uid)!==req.uid||room.seats[req.seat]?.id!==req.uid))return false;
  const member=environmentMembers(room).find(m=>m.i===Q.seat&&m.k===Q.member&&m.c==='yisang');if(!member||member.st.sealT>0||envSilent(room))return false;
  let r=JSON.parse(JSON.stringify(room));r.mirrorChoice=null;const D=r.d25Banner?.draw;if(D&&!D.settled){const paused=Math.max(0,Date.now()-Q.startedAt);D.startedAt+=paused;D.endsAt+=paused}
  r=applyEnvironmentEvent(r,req.event,true);r.sLog=[...(r.sLog||[]),`🪞 ${r.seats[Q.seat].name} 的【${Q.search?'鏡世界搜索':'鏡世界觀測'}】選擇額外事件【${ENV_EVENTS[req.event].n}】`];
  busy='';save(beginRound(r));return true;
}
function mirrorChoiceUI(){if(!mirrorPending())return'';const Q=room.mirrorChoice,mine=rd()===Q.seat,title=Q.search?'鏡世界搜索':'鏡世界觀測';
  return presentBattlePopup(`<div id="mirrorModal" class="perfect-duel-modal mirror-modal" tabindex="-1" onkeydown="d25DialogKey(event)" role="dialog" aria-modal="true" aria-labelledby="mirrorTitle"><div class="mirror-content"><div class="mirror-heading"><img src="${charArtSrc('yisang','left')}" data-k="yisang" data-p="left" data-s="0" onerror="imgFb(this)" alt="李箱"><div><small>李箱 · 第${shownRound()}回合</small><h2 id="mirrorTitle">${title}</h2><p>${mine?Q.search?'從完整可用事件清單選擇一個鏡世界。':'從四個鏡世界中選擇一個額外事件。':`等待 ${esc(room.seats[Q.seat].name)} 選擇鏡世界…`}</p></div></div><div class="mirror-options">${Q.options.map(id=>`<button type="button" class="mirror-option" ${mine?'':'disabled'} onclick="chooseMirror('${id}')"><b>${ENV_EVENTS[id].icon} ${esc(ENV_EVENTS[id].n)}</b><span>${esc(ENV_EVENTS[id].d)}</span></button>`).join('')}</div><p class="mirror-note">選擇期間全員行動與倒數暫停。選定事件與原場地並存。</p></div></div>`,'mirror');
}
function beginRound(rm){initTeaflower(rm);if(rm.kiraRelays)rm={...rm,kiraRelays:rm.kiraRelays.filter(x=>x.round===rm.round),kiraNoPlay:Object.fromEntries(Object.entries(rm.kiraNoPlay||{}).filter(([i,round])=>round===rm.round))};if(isoPending(rm))return rm;rm=prepareValorantShop(rm);if(valorantShopPending(rm))return rm;return initTeaflower(refreshTimeClocks(syncDrunkHands(beginDrunkTurn(syncTktHealth(beginWardenTurn(beginRoundState(rm)))))))}
function beginRoundState(rm){if(valorantShopPending(rm)||mirrorPending(rm))return rm;rm=beginEnvironment(rm);if(rm.status!=='playing'||isoPending(rm))return rm;
  // 延遲烈日可能殺死剛選好的輪值玩家，即使舊配對仍存活也須先更新輪值。
  if(!(rm.hp[rm.turn]>0)){let turn=rm.turn;
    if(rm.cfg.boss)turn=rm.hp[0]>0?0:2;
    else for(let k=1;k<=rm.seats.length;k++){const i=(rm.turn+k)%rm.seats.length;if(rm.hp[i]>0){turn=i;break}}
    rm={...rm,turn};
  }
  rm=prepareMirror(rm);if(mirrorPending(rm))return rm;let pair=[0,1],spin=null;
  if(rm.cfg.warden){pair=wardenParticipants(rm);spin=null}
  else if(rm.cfg.boss){let challenger=rm.turn===2?2:0;if(rm.hp[challenger]<=0)challenger=rm.hp[1]>0?(rm.hp[0]>0?0:2):challenger;pair=[challenger,1];spin=null}
  else if(rm.seats.length===3){const Q=rm.shopPair,s=Q?.round===rm.round&&Q.turn===rm.turn&&Q.alive===rm.hp.map(h=>h>0).join(',')?Q:spinPick(rm.hp,rm.turn,rm);pair=s.pair;spin=s.spin}
  let st=rm.st;
  if(envSilent(rm))return{...rm,phase:'play',pair,spin,pend:[],deadline:!environmentTradePending(rm)&&rm.cfg.time?Date.now()+rm.cfg.time*1000:0};
  if(rm.chars&&rm.chars.includes('rien')){st=rm.st.map(x=>({...x,cmd:null}));
    pair.forEach(t=>{if(rm.chars[t]==='rien'&&rm.hp[t]>0&&!(rm.st[t].sealT>0)){const pool=rm.cfg.open>0?rm.up[t]:rm.hands[t];if(pool&&pool.length)st[t].cmd=rnd(pool)}})}
  if(rm.chars&&rm.chars.includes('lei')){st=st.map(x=>({...x}));pair.forEach(t=>{if(rm.chars[t]==='lei'&&rm.hp[t]>0&&!(st[t].sealT>0)&&!st[t].leiInit){st[t].hu=8;st[t].leiInit=1}})}
  const dhLog=[];let team=rm.team;
  if(rm.chars?.includes('moses')){st=JSON.parse(JSON.stringify(st));rm.seats.forEach((_,i)=>{const s=st[i];if(rm.chars[i]!=='moses'||rm.hp[i]<=0||s.sealT>0||s.smokeRound===rm.round)return;s.smokeRound=rm.round;(s.smokeCrimson?['crimson']:['red','purple','white']).forEach(color=>addMosesSmoke(s,color,1,dhLog,rm.seats[i].name,'回合開始'))})}
  if(rm.team){team=JSON.parse(JSON.stringify(rm.team));team.forEach((t,i)=>{const m=t.find(x=>x.c==='sunflower'&&!x.dead);if(!m)return;const gain=1+Math.floor(Math.random()*3);m.st.sun=(m.st.sun||0)+gain;dhLog.push(`${rm.seats[i].name} 的向日葵獲得 ${gain} 點陽光（共 ${m.st.sun}）`)})}
  if(rm.chars&&rm.chars.includes('heathcliff')){st=st.map(x=>({...x}));pair.forEach(i=>{if(rm.chars[i]!=='heathcliff'||rm.hp[i]<=0||(st[i].sealT||0)>0)return;st[i].shieldSuit=rnd(['S','C','D','H']);dhLog.push(`${rm.seats[i].name} 獲得隨機花色盾：${SU[st[i].shieldSuit]}`)})}
  if(rm.chars&&rm.chars.includes('card_ish')&&rm.round===rm.roundBase){st=st.map(x=>({...x}));pair.forEach(i=>{if(rm.chars[i]!=='card_ish'||st[i].ishSet)return;const counts={S:0,C:0,H:0,D:0};(rm.hands[i]||[]).forEach(c=>counts[c[0]]++);const top=Math.max(...Object.values(counts)),choices=Object.keys(counts).filter(s=>counts[s]===top);st[i].ishSet=rnd(choices);dhLog.push(`${rm.seats[i].name} 依手牌最多的花色獲得【組札－${SU[st[i].ishSet]}】`)})}
  if(rm.chars&&rm.chars.includes('card_ish')){st=st.map(x=>({...x}));rm.seats.forEach((_,i)=>{if(rm.chars[i]!=='card_ish'||rm.hp[i]<=0||st[i].sealT>0||!st[i].dualColor||st[i].ishExtraRound===rm.round)return;rollIshExtra(st[i],rm.round);dhLog.push(`${rm.seats[i].name} 的【雙色】本回合額外組札為${SU[st[i].ishExtra]}`)})}
  if(st.some(x=>x.traumaPending)){st=st.map((x,i)=>{if(x.superDeepTrauma)return{...x,trauma:0,traumaPending:0,deepTrauma:0};if(!x.traumaPending)return x;dhLog.push(`${rm.seats[i].name} 的創傷轉為深度創傷`);return{...x,deepTrauma:1,trauma:0,traumaPending:0}})}
  // 地獄之火：馬蒂亞斯的25絕技，對所有敵方每回合初施加3層炎傷
  if(rm.chars&&rm.chars.some((c,i)=>c==='mat'&&rm.st[i].hellFire&&rm.hp[i]>0)){
    st=st.map(x=>({...x}));
    rm.chars.forEach((c,i)=>{
      if(c!=='mat'||!(rm.st[i].hellFire)||rm.hp[i]<=0)return;
      rm.seats.forEach((_,eIdx)=>{
        if(eIdx===i||rm.hp[eIdx]<=0)return;
        st[eIdx].burn=(st[eIdx].burn||0)+3;st[eIdx].matBurnSources=[...(st[eIdx].matBurnSources||[]),{seat:i,member:rm.act?.[i]??-1,n:3}];
        dhLog.push(`${rm.seats[eIdx].name} 被【地獄之火】附加 3 層炎傷（共 ${st[eIdx].burn}）`);
      });
    });
  }
  if(rm.chars&&rm.chars.includes('dihui')){st=st.map(x=>({...x}));pair.forEach(t=>{
    if(rm.chars[t]!=='dihui')return;
    st[t].dihuiBuff=null;st[t].markedCards=[];st[t].markTarget=null;
    const kind=st[t].dihuiNext;st[t].dihuiNext=null;
    if(rm.hp[t]<=0||(st[t].sealT||0)>0||!kind)return;
    const fw=st[t].shunxing||0,rv=st[t].nixing||0;
    const layers=kind==='forward'?fw:rv;
    if(layers>0){
      if(st[t].xinDihui){
        st[t].dihuiBuff=kind==='forward'?{guard:layers}:{strong:layers};
      }else{
        st[t].dihuiBuff=kind==='forward'?{weak:layers,guard:layers}:{vuln:layers,strong:layers};
      }
    }
    const target=rm.cfg.warden?1:pair.find(x=>x!==t);
    if(target!==undefined&&rm.hp[target]>0){
      const stacks=Math.floor((fw+rv)/2),hand=(rm.hands[target]||[]).slice(),maxCards=Math.max(1,rm.cfg.hand||hand.length||1);
      const markN=Math.min(hand.length,Math.max(1,maxCards-stacks));
      for(let q=hand.length-1;q>0;q--){const j=Math.floor(Math.random()*(q+1));[hand[q],hand[j]]=[hand[j],hand[q]]}
      st[t].markedCards=hand.slice(0,markN);st[t].markTarget=target;st[t].dihuiMarkedRound=rm.round;
      dhLog.push(`地彗星的「已確定的對手」×${stacks}：標記 ${rm.seats[target].name} 手牌 ${markN} 張`);
    }
    if(layers>0)dhLog.push(`地彗星啟用${kind==='forward'?'順行－憐憫':'逆行－憎惡'}${st[t].xinDihui?'（心-地慧星無負面）':''}，獲得 ${layers} 層${kind==='forward'?(st[t].xinDihui?'守護':'虛弱及守護'):(st[t].xinDihui?'強壯':'易損及強壯')}`);
  })}
  if(team)rm.seats.forEach((_,i)=>{if(rm.chars[i]==='moses')team[i][rm.act[i]].st=JSON.parse(JSON.stringify(st[i]))});
  return beginLucioTurn(beginFirefuTurn({...rm,...(team?{team}:{}),st,sLog:dhLog.length?[...(rm.sLog||[]),...dhLog]:rm.sLog,phase:'play',pair,spin,pend:[],deadline:!environmentTradePending(rm)&&rm.cfg.time?Date.now()+rm.cfg.time*1000:0}))}
function advance(rm){if(wardenJudgmentArmed(rm))return markWardenFinalPlay({...rm,turn:0,phase:'play',deadline:rm.cfg.time?Date.now()+rm.cfg.time*1000:0});if(rm.cfg.warden)return beginRound({...rm,turn:0});if(rm.cfg.boss){let t=rm.turn===0?2:0;if(rm.hp[t]<=0)t=rm.hp[0]>0?0:2;return beginRound({...rm,turn:t})}let t=rm.turn;for(let k=1;k<=rm.seats.length;k++){const j=(rm.turn+k)%rm.seats.length;if(rm.hp[j]>0){t=j;break}}
  return beginRound({...rm,turn:t})}
const newSt=()=>({teaPetals:0,teaClubCd:0,teaClubUsedRound:0,teaClubTickRound:0,teaInner:0,teaFragrance:0,nineTea:0,teaBloomRound:0,teaBloomSafe:0,teaSkipRound:0,spiderEye:0,spiderPenitence:0,spiderEyeSpent:0,spiderPenitenceSpent:0,spiderGain:1,drunkSip:0,drunkCd:0,drunkWakeRound:0,drunkAwake:0,drunkAwakePending:0,drunkEndless:0,artOn:0,art:null,sRound:0,sealT:0,burn:0,shin:0,musouShin:0,artCpHalf:0,fx:[],stun:0,wall:0,cpg:0,asura:0,revived:0,stack:0,rage:0,eye:6,heat:0,sw:0,grace:0,karma:0,noKarma:false,cmd:null,lm:0,mdec:0,wrap:0,rv:{},res:1,superRes:0,superResTimer:0,superResUsed:0,hellFire:0,feast:0,feastBoost:0,shield:0,shieldPersistent:0,shNew:false,san:0,bow:0,arrow:0,rarrow:0,fastBow:0,paralysis:0,divineAnnihilation:0,hu:0,mhu:0,leiInit:0,xinLei:0,leiHpLost:0,cl:0,shunxing:0,nixing:0,dihuiNext:null,afterimage:0,afterimageRampage:0,xinDihui:0,markedCards:[],markTarget:null,dihuiBuff:null,dihuiMarkedRound:0,trauma:0,traumaPending:0,deepTrauma:0,superDeepTrauma:0,superChase:0,shieldSuit:null,coffin:0,will:0,dullahan:0,endlessHunger:0,laDemande:0,resolve:0,asuraStrong:0,noble:0,laCastrationUsed:false,torchUses:0,sun:0,torchRound:0,expectation:0,notExpecting:0,timeUpTurns:0,xinTiangang:0,egoStanding:0,rupture:0,ziluStrong:0,ziluFast:0,ziluFastRound:0,askReadyRound:0,askLastRound:0,ishSet:null,ishExtra:null,ishExtraRound:0,dualColor:0,light:0,ishSlashPending:false,vergSword:0,vergEgo:0,vergEgoTurns:0,vergShieldStack:0,rufoTasks:{S:false,C:false,H:false,D:false},rufoQuest:null,rufoWolf:0,rufoReady:false,rufoSkillUses:0,rufoColor:0,rufoBlastPending:false,rufoBleed:0,fingerRevenge:{},xichnInit:0,xichnStages:[0,0,0,0],xichnGrowth:{},xichnWait:0,xichnWaitRound:0,xichnYuhuanUsed:0,xichnExitPending:0,xichnCanExit:false,kiraHeat:0,kiraCounters:0,kiraDadUses:0,kiraArtTurns:0,lkdCounters:0,lkdHaircuts:0,lkdRedraws:0,lkdAssembled:0,lkdArtTurns:0,sadTears:0,sadNext:0,sadArtTurns:0,sadCounters:0,sadPride:0,mirrorSearch:0,mirrorHp:0,bambooAny:0,bambooEgo:0,smoke:newSmoke(),smokeRound:0,smokeCrimson:0,smokeSeq:0,crimsonBreathRound:0,tktBars:5,tktUnit:0,gun:null,gunShield:0,isoSkills:newIsoSkills(),isoSeq:0,isoDual:0,isoDualRefresh:0,isoCut:0,isoAdapt:0});
function shuffledSeats(seats){const order=seats.map((_,i)=>i);for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]]}return order}
function startNormalPick(rm,bans=[]){return{...rm,status:'pick',bans:bans.filter(Boolean),selection:{order:shuffledSeats(rm.seats),step:0,picks:rm.seats.map(()=>null)}}}
function finishBan(rm){return rm.cfg.v3?startDraft(rm,rm.ban.picks):startNormalPick(rm,rm.ban.picks)}
function canBanChar(rm,c){return !!CHARS[c]&&!CHARS[c].hidden&&singleSlotDraftAllowed(rm,c)&&(rm.cfg.v3||!CHARS[c].v3only)&&!(rm.ban.picks||[]).includes(c)&&(!rm.cfg.factions||rm.cfg.factions[CHARS[c].f]!==false)}
function startRoom(seats,cfg,roundBase=1){if(cfg.warden){seats=[...seats].sort((a,b)=>Number(b.id===cfg.hostId)-Number(a.id===cfg.hostId));cfg={...cfg,boss:false,warden:false,events:cfg.wardenEvents??cfg.events};delete cfg.wardenEvents}
  if(cfg.boss){const shuffled=[...seats];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]]}return{status:'bossDraft',cfg,seats:shuffled,hostId:cfg.hostId||seats[0].id,roundBase,round:roundBase,draft:{order:[0,1,2,1,1],step:0,picks:seats.map(()=>[])}}}
  if(cfg.v3)return{status:'ban',cfg,seats,roundBase,round:roundBase,ban:{order:shuffledSeats(seats),step:0,picks:seats.map(()=>null)}};
  if(cfg.chars){const rm={cfg,seats,roundBase,round:roundBase};if(cfg.ban)return{...rm,status:'ban',ban:{order:shuffledSeats(seats),step:0,picks:seats.map(()=>null)}};return startNormalPick(rm)}
  return startStandardBattle({cfg,seats,roundBase,round:roundBase},seats.map(()=>null))}
function startStandardBattle(rm,selected){const cfg=rm.cfg,seats=rm.seats,deck=newDeck(),hands={},up={},chars=selected?[...selected]:seats.map(()=>null);
  const bans=rm.bans||[],pool=Object.keys(CHARS).filter(x=>!bans.includes(x)&&!CHARS[x].v3only&&!CHARS[x].hidden&&(!cfg.factions||cfg.factions[CHARS[x].f]!==false)).sort(()=>Math.random()-.5);if(cfg.chars){chars.forEach((c,i)=>{if(bans.includes(c))chars[i]=null});const rest=pool.filter(c=>!chars.includes(c));chars.forEach((c,i)=>{if(!c)chars[i]=rest.shift()||null})}else chars.fill(null);
  seats.forEach((_,i)=>{hands[i]=deck.splice(0,cfg.hand);up[i]=hands[i].slice(0,cfg.open)});
  return beginRound(initXichn(initMiddleFinger(initLucio({status:'playing',battleBgm:rnd(BATTLE_BGM),cfg,seats,env:newEnvironment(seats.length),oc:Object.fromEntries(seats.map((_,i)=>[i,cfg.open])),chars,st:seats.map(newSt),rdw:seats.map(()=>0),cp:seats.map(()=>0),hp:seats.map(()=>cfg.hp),bans:[...bans],d25:seats.map(()=>({val:0,bust:false,ready:false,used:false})),d25Claimed:false,d25Banner:null,hands,up,deck,round:rm.roundBase,roundBase:rm.roundBase,turn:0,last:null,winner:null}))))}
function startDraft(rm,bans){const lastSeat=rm.cfg.hostLastDraft&&rm.cfg.n===3&&rm.cfg.v3&&!rm.cfg.boss?rm.seats.findIndex(s=>s.id===(rm.hostId||rm.cfg.hostId||rm.seats[0].id)):-1,order=lastSeat>=0?[...rm.ban.order.filter(i=>i!==lastSeat),lastSeat]:rm.ban.order,[a,b,c]=order;return{...rm,status:'draft',bans:bans.filter(Boolean),draft:{order:rm.seats.length===3?[a,b,c,c,b,a,a,b,c]:[a,b,b,a,a,b],...(lastSeat>=0?{lastSeat}:{}),step:0,picks:rm.seats.map(()=>[])}}}
function startBattle(rm){hostSunCards={};hostPrivateMoves={};hostSunRequests={};hostZiluWaits={};privateSunCards=[];sunPending=false;const cfg=rm.cfg,seats=rm.seats,deck=newDeck(),hands={},up={};
  seats.forEach((_,i)=>{hands[i]=deck.splice(0,cfg.hand+(cfg.warden&&i===1?4:0));up[i]=hands[i].slice(0,cfg.open+(cfg.warden&&i===1?3:0))});
  const team=rm.draft.picks.map((p,i)=>(p.includes('warden')?['warden']:p).map(c=>({c,hp:c==='nut'?Math.round(cfg.hp*(bossHealthFactor(cfg,i))*(c==='san'?1.2:1)*1.2):Math.ceil(cfg.hp*(bossHealthFactor(cfg,i))*(c==='warden'?WARDEN_STAGES[1].factor:c==='san'?1.2:1)),st:c==='warden'?{...newSt(),wardenStage:1,wardenBroken:0}:newSt(),dead:false}))),act0=team.map(t=>Math.max(0,t.findIndex(m=>canDeploy(m.c))));
  team.forEach(t=>{if(t.some(m=>m.c==='jia_qiu'))t.push({c:'zilu',hp:cfg.hp,st:newSt(),dead:false})});
  team.forEach(t=>{if(t.some(m=>m.c==='sinclair'))t.forEach(m=>{if(canDeploy(m.c))m.st.urgentHunger=1})});
  if(cfg.boss&&[0,2].some(i=>team[i].some(m=>m.c==='sinclair')))[0,2].forEach(i=>team[i].forEach(m=>{if(canDeploy(m.c))m.st.urgentHunger=1}));
  team.forEach((t,i)=>{const lead=t[act0[i]],wood=t.find(m=>m.c==='wood'),sun=t.find(m=>m.c==='sunflower');t.forEach(m=>{if(m.c==='verg'){m.st.shield=damageAmount(cfg.hp*.6);m.st.vergInitialShield=1;m.st.vergSword=1}});if(lead&&lead.c==='jia_qiu'){lead.st.expectation=3;lead.st.shield=(lead.st.shield||0)+cfg.hp;lead.st.shieldPersistent=(lead.st.shieldPersistent||0)+cfg.hp;lead.st.askReadyRound=rm.round}
    if(wood){wood.st.torchUses=4;if(lead){lead.st.shield=(lead.st.shield||0)+10;lead.st.shieldPersistent=(lead.st.shieldPersistent||0)+10}}if(sun){sun.st.sun=0;if(lead)lead.st.fx=(lead.st.fx||[]).concat([{k:'g',n:1,t:99999}])}});
  if(cfg.boss)team.forEach((t,i)=>{if(i!==1)t[act0[i]].st.challenger=1});
  return beginRound(initWarden(initXichn(initMiddleFinger(initLucio({status:'playing',battleBgm:rnd(BATTLE_BGM),cfg,seats,env:newEnvironment(seats.length),oc:Object.fromEntries(seats.map((_,i)=>[i,cfg.open+(cfg.warden&&i===1?3:0)])),chars:team.map((t,i)=>t[act0[i]].c),st:team.map((t,i)=>JSON.parse(JSON.stringify(t[act0[i]].st))),cp:seats.map(()=>0),hp:seats.map((_,i)=>Math.ceil(cfg.hp*(team[i][act0[i]].c==='warden'?WARDEN_STAGES[1].factor:team[i][act0[i]].c==='san'?1.2:1)*(bossHealthFactor(cfg,i)))),d25:seats.map(()=>({val:0,bust:false,ready:false,used:false})),d25Claimed:false,d25Banner:null,hands,up,deck,round:rm.round,roundBase:rm.roundBase,turn:0,last:null,winner:null,team,act:act0,swapsLeft:seats.map(()=>2),rdw:seats.map(()=>0),draft:rm.draft})))))}
Object.values(CHARS).forEach(c=>{if(!c.f)c.f='bus'});const FAC={bus:'Limbus',pvz:'PVZ',trails:'軌跡',valorant:'Valorant'};
const FACD={valorant:'第一回合經濟500（離索在三人模式旁觀時不獲得經濟）；商店僅顯示給出戰角色屬於Valorant的玩家。單方面攻擊或反擊成功，下回合1000；互相攻擊或雙方補血800；被斷補或單方面攻擊400，連續時每回合+200，最高1000，其他結果重置連續計數。未符合上述條件時為基本經濟500。每回合先進商店，確認後才發動任何回合開始效果。沒有槍時獲得制式手槍（虛弱2），同時只能裝備一把，新槍覆蓋舊槍。受到黑桃、梅花、方塊傷害時失去槍械；槍護盾保留一次受擊的槍。多次觸發各自計算強壯、虛弱、守護與易損；對方反擊只發動一次。',bus:'理智值 -45～45（初始0）。出牌點數比對方大+5、小-5；反擊成功+10、被反擊-10；擊殺敵人+15；瓦倫希娜／盧西奧拼點勝利+15（取代比點數）；天殺不增減。一般正理智時有(50+理智)%機率攻擊傷害+1；一般負理智時有(50+|理智|)%機率傷害-1。理智45時傷害固定+2；理智-45時進入侵蝕並由系統隨機出牌：黑牌70%反噬自身、方塊70%失效、紅心70%改為治療敵人。侵蝕回合結算後，下回合理智重置為0；即使未觸發70%的負面效果也會重置。3v3中換人時會繼承全部理智；角色倒下換上下一位時，若理智&lt;0則重置為0，否則繼承。',
 pvz:'僅限3v3，PVZ角色皆為後備植物且不可上場，每隊最多選2名。高堅果會吸收全隊傷害；火炬樹樁提供10點首發護盾及4次火炬；向日葵提供首發永久守護與每回合陽光。護盾只吸收現有盾量，超出護盾量的部分會繼續扣除生命。',
 trails:'CP值（血量下方綠條）：初始0，上限200。3v3中全隊共用同一條CP：軌跡角色換成軌跡角色時CP累積，換成其他陣營角色再換回軌跡角色時，也保留換下時的CP（無論倒下或換人）。造成傷害+15、受到傷害+10，另有特定CP增幅技能。戰技：消耗CP使用，於下個回合開始時（所有玩家出牌前）生效。S技：消耗CP的大招，使用時立即生效；若對手已出牌，會退還對手的卡片讓其重新出牌。'};
function calcBuffs(c,s0){const o={strong:0,weak:0,vuln:0,guard:0};if(!s0)return o;const evidence=wardenEvidence(s0);if(evidence.kind==='S')o.weak+=evidence.n>=6?3:evidence.n>=3?1:0;o.guard+=(s0.wardenSisyphus||0)+(s0.wardenFinalSisyphus||0);o.strong+=(s0.wardenFinalSisyphus||0)+(s0.wardenSystem||0)/2;o.vuln+=(s0.wardenSystem||0)/2;
  if(c==='teaflower')o.weak+=Math.floor(Math.min(6,s0.teaPetals||0)/2);
  const gun=valorantGun(c,s0);if(gun){o.strong+=gun.strong||0;o.weak+=gun.weak||0}
  if(c==='rien'){const g=s0.grace||0,l=g>=9?3:g>=6?2:g>=3?1:0;o.guard+=l===3?2:l>=1?1:0;o.strong+=l===3?2:l===2?1:0;const k=s0.karma||0;o.vuln+=Math.floor(k/2);o.weak+=Math.floor(k/3);o.strong+=(s0.xinStrong||0);o.guard+=(s0.xinGuard||0)}
  if(c==='val'){o.strong+=(s0.sw||0)+(s0.valDishonor?1:0);if((s0.heat||0)>0)o.weak+=2}
  if(c==='lucio')o.strong+=s0.lucioStrong||0;
  if(c==='drunk'){const n=s0.drunkSip||0,awake=drunkAwake(s0),extra=drunkExtra(s0);o.guard+=(n>=1?1:0)+(awake?1:0);o.strong+=(n>=3?1:0)+(awake?1:0)+extra;o.vuln+=extra}
  if(c==='kira')o.strong+=Math.min(2,s0.kiraHeat||0);
  if(c==='xichn'){const a=xichnStages(s0),power=a[0]-3,def=[-3,-2,-1,0,1,3,5][a[2]];o.strong+=Math.max(0,power);o.weak+=Math.max(0,-power);o.guard+=Math.max(0,def);o.vuln+=Math.max(0,-def)}
  if(c==='ring')o.strong+=Math.floor((s0.lm||0)/3);
  if(c==='lei'&&s0.xinLei)o.strong+=Math.floor((s0.leiHpLost||0)/5);
  if(c==='sinclair')o.strong+=Math.floor((s0.endlessHunger||0)/20);
  if(c==='rufo')o.strong+=s0.rufoWolf||0;
  if(c==='sad'){if(!(s0.sadTears>0))o.weak+=1;if(s0.sadTears>=2)o.strong+=1}
  if(c==='bamboo'&&s0.bambooEgo)o.strong+=1;
  if(c==='tkt'){const n=2*(s0.tktBars??5)-6;o.strong+=Math.max(0,n);o.weak+=Math.max(0,-n)}
  if(c==='jia_qiu'&&s0.egoStanding)o.strong+=1;
  if(c==='jia_qiu'&&s0.notExpecting)o.strong+=20;
  if(c==='zilu')o.strong+=s0.ziluStrong||0;
  if(c==='san'&&(s0.hard||0)>0)o.guard+=2;
  if(c==='dihui'&&s0.dihuiBuff){o.strong+=s0.dihuiBuff.strong||0;o.weak+=s0.dihuiBuff.weak||0;o.vuln+=s0.dihuiBuff.vuln||0;o.guard+=s0.dihuiBuff.guard||0}
  o.strong+=s0.asuraStrong||0;
  (s0.fx||[]).forEach(x=>{if(x.k==='v')o.vuln+=x.n;else if(x.k==='w')o.weak+=x.n;else if(x.k==='s')o.strong+=x.n;else if(x.k==='g')o.guard+=x.n});
  if((s0.fx||[]).some(x=>x.k==='ns'))o.strong=0;
  return o}
const fixedCardRank=(s0,r)=>(s0.paralysis||0)>0?1:(s0.divineAnnihilation||0)>0?24:r;
function effRank(c,s0,card,mult,bonus){mult=mult===undefined?1:mult;bonus=bonus||0;const raw=+card.slice(1),b=calcBuffs(c,s0);let base=wardenTipherethActive(s0)?(c==='umb'&&(s0.rage||0)>0?28:15):c==='lucio'?lucioBase(s0,card):(c==='umb'&&(s0.rage||0)>0)?13:valorantBase(c,s0,card);if(c==='rien'&&s0.cmd===card)base+=(s0.cmdAddict?8:1);
  if(bonus>0)base+=bonus;if(c==='shi_faust'&&(s0.rarrow||0)>0){if(card[0]==='S')base*=3;else if(card[0]==='C')base*=5}
  let r=Math.max(0,Math.floor(base*mult+1e-9)+b.strong-b.weak);
  if(c==='sad'){if(sadEmpowered(s0))r+=6;if(s0.sadPride&&card[0]==='D')r=Math.floor(r*1.5+1e-9)}
  if(c==='shi_faust'&&s0.bow&&card[0]!=='H')r=Math.max(1,Math.floor(r*0.3+1e-9));
  return s0.wardenException?0:fixedCardRank(s0,r)}
function redSt(c,s0){let r=0;if(c==='rean'&&shinActive(s0))r+=.5;if((s0.asura||0)>0)r+=.5;(s0.fx||[]).forEach(x=>{if(x.k==='rd')r+=x.n});return r}
function sealPass(rm){const st=JSON.parse(JSON.stringify(rm.st)),pre=rm.seats.map((_,i)=>(st[i].sealT||0)>0);
  return{...rm,st,chars:rm.chars.map((c,i)=>(st[i].sealT||0)>0?'_':c)}}
function protectLife(c,s0,hp,name,log){if(s0?.teaBloomSafe&&hp<=0){log.push(`${name} 的〔盛放〕保留1點生命`);return 1}hp=wardenGeburaLife(s0,hp,name,log);if(hp>0)return hp;
  const inSuper=c==='mat'&&s0.superRes&&(s0.superResTimer||0)>0,canSuper=c==='mat'&&s0.superRes&&!s0.superResUsed,normalRes=(c==='mat'&&!inSuper||c==='bamboo'||c==='firefu')&&(s0.res||0)>0,sinclair=c==='sinclair'&&s0.noble&&s0.resolve>0,heathcliff=c==='heathcliff'&&s0.will>0;
  if(!(inSuper||canSuper||normalRes||sinclair||heathcliff))return hp;
  if(inSuper)log.push(`${name} 的【超毅力】發動，生命值固定為 1（保護剩 ${s0.superResTimer} 回合）！`);
  else if(canSuper){s0.superResTimer=3;s0.superResUsed=1;log.push(`${name} 的【超毅力】觸發，生命值固定為 1，接下來 3 回合持續受到保護（全場僅限一次）！`)}
  else{if(normalRes)s0.res--;else if(sinclair)s0.resolve--;else s0.will--;log.push(`${name} 的毅力發動，生命值固定為 1！`)}
  return 1
}
// 共用倒下、復活及換人結算，立即絕技不推進回合或觸發回合開始效果。
function settleCharacters(rm0,options){if(rm0.cfg.warden)options.st.forEach((s,i)=>{const min=sanityMin(rm0,i);if(min>-45)s.san=Math.max(min,s.san||0)});let {hp,st,cp,team:tcl,rres={},nut={},spk={},autoZilu={},log=[],passChars=rm0.chars,swaps=null,forcedSwaps={},instant=false,silent=false}=options;
  if(rm0.cfg.warden&&rm0.wardenTipherethGranted)for(const i of [0,2]){hp[i]=wardenGeburaLife(st[i],hp[i],rm0.seats[i].name,log);if(st[i].wardenGeburaPending||st[i].wardenGebura){hp[i]=Math.max(1,hp[i]);delete spk[i];if(rm0.d25Batch?.spk)delete rm0.d25Batch.spk[i]}if(st[i].wardenGeburaPending){if(swaps?.[i]!==undefined||forcedSwaps[i]!==undefined)log.push(`${rm0.seats[i].name} 的Gebura之刃已取消本次預定換人`);swaps={...swaps};delete swaps[i];forcedSwaps={...forcedSwaps};delete forcedSwaps[i];delete autoZilu[i];st[i].cl=0}}
  st.forEach((s,i)=>{if(s.teaBloomSafe&&s.teaBloomRound===rm0.round){hp[i]=Math.max(1,hp[i]);delete spk[i];if(rm0.d25Batch?.spk)delete rm0.d25Batch.spk[i]}});if(tcl)tcl.forEach((t,i)=>t.forEach((m,k)=>{if(m.st.teaBloomSafe&&m.st.teaBloomRound===rm0.round){m.hp=Math.max(1,m.hp);if(rres[i]?.[k]!==undefined)rres[i][k]=Math.max(1,rres[i][k]);m.dead=false}}));
  const wardenBroken=markWardenBreak(rm0,hp,st);if(wardenBroken&&tcl)tcl[1][rm0.act[1]].dead=false;
  if(instant&&rm0.d25Batch){rm0.d25Batch.spk={...(rm0.d25Batch.spk||{}),...spk};rm0.d25Batch.autoZilu={...(rm0.d25Batch.autoZilu||{}),...autoZilu};if(tcl){Object.keys(rres).forEach(i=>Object.keys(rres[i]).forEach(k=>tcl[i][k].hp=rres[i][k]));Object.keys(nut).forEach(i=>tcl[i][nut[i].k].hp=nut[i].hp);tcl.forEach((t,i)=>{t[rm0.act[i]].hp=hp[i];t[rm0.act[i]].st=JSON.parse(JSON.stringify(st[i]))})}return{team:tcl,act:rm0.act,swapsLeft:rm0.swapsLeft,chars:rm0.chars,hp,st,cp}}
  if(!silent&&tcl){forcedSwaps={...forcedSwaps};st.forEach((s,i)=>{if(!s.xichnExitPending||rm0.chars[i]!=='xichn'||hp[i]<=0)return;s.xichnExitPending=0;const choices=tcl[i].map((m,k)=>({m,k})).filter(({m,k})=>k!==rm0.act[i]&&!m.dead&&(rres[i]?.[k]??m.hp)>0&&canDeploy(m.c));if(choices.length)forcedSwaps[i]=rnd(choices).k})}
  const rm={...rm0,chars:passChars},nm=i=>rm0.seats[i].name,max=rm0.cfg.hp;
  const mx=i=>characterMaxHp(rm0,i,rm0.chars[i],st[i]);
  let nteam=rm.team,nact=rm.act,nsw=rm.swapsLeft,nchars=rm0.chars;
  if(rm.team){nteam=tcl;nact=[...rm.act];nsw=[...rm.swapsLeft];nchars=[...rm0.chars];
    const fallen=rm.seats.map((_,i)=>hp[i]<=0&&!rm.team[i][rm.act[i]].dead&&!(i===1&&wardenBroken));
    Object.keys(rres).forEach(es=>Object.keys(rres[es]).forEach(k=>{const m=nteam[es][k];m.hp=rres[es][k];if(m.hp<=0)m.dead=true}));
    Object.keys(nut).forEach(i=>{const m=nteam[i][nut[i].k];m.hp=nut[i].hp;if(m.hp<=0)m.dead=true});
    const save=i=>{nteam[i][nact[i]].hp=hp[i];nteam[i][nact[i]].st=JSON.parse(JSON.stringify(st[i]))};
    const load=(i,k,keepSan)=>{const sn0=st[i].san||0;nact[i]=k;const m=nteam[i][k];hp[i]=m.hp;st[i]=JSON.parse(JSON.stringify(m.st));nchars[i]=m.c;if(keepSan&&!silent)st[i].san=sn0};
    rm.seats.forEach((_,i)=>{if(silent||!fallen[i]||hp[i]>0||spk[i]||nchars[i]==='sinclair')return;const si=nteam[i].findIndex(m=>m.c==='sinclair');if(si<0)return;const s0=nteam[i][si].st,gain=Math.ceil(mx(i)/2);s0.endlessHunger=(s0.endlessHunger||0)+gain;log.push(`${nm(i)} 的隊友陣亡，辛克萊獲得 ${gain} 層無盡的飢餓（共 ${s0.endlessHunger}）`);if(s0.endlessHunger>=20&&!s0.noble){s0.noble=1;s0.resolve=1;s0.asuraStrong=(s0.asuraStrong||0)+3;log.push(`${nm(i)} 的辛克萊獲得【高貴的品格】：毅力×1、永久強壯×3`)}});
    if(!silent&&rm.cfg.boss)rm.seats.forEach((_,dead)=>{if(!fallen[dead]||dead===1||hp[dead]>0)return;const ally=dead===0?2:0;if(hp[ally]<=0)return;const si=nteam[ally].findIndex(m=>m.c==='sinclair');if(si<0)return;const s0=si===nact[ally]?st[ally]:nteam[ally][si].st,gain=Math.ceil(mx(dead)/2);s0.endlessHunger=(s0.endlessHunger||0)+gain;log.push(`${nm(dead)} 陣亡，盟友 ${nm(ally)} 的辛克萊獲得 ${gain} 層無盡的飢餓（共 ${s0.endlessHunger}）`);if(s0.endlessHunger>=20&&!s0.noble){s0.noble=1;s0.resolve=1;s0.asuraStrong=(s0.asuraStrong||0)+3;log.push(`${nm(ally)} 的辛克萊獲得【高貴的品格】：毅力×1、永久強壯×3`)}});
    rm.seats.forEach((_,i)=>{if(!silent&&fallen[i]&&hp[i]<=0&&rm.chars[i]==='leo'&&!st[i].revived){clearWardenRevivalEffects(rm0,st[i]);st[i].revived=1;hp[i]=Math.max(1,Math.floor(mx(i)*.6));st[i].fx=(st[i].fx||[]).filter(x=>!['v','w','dm','rd','ns'].includes(x.k));st[i].burn=0;st[i].matBurnSources=[];st[i].stun=0;st[i].sealT=0;st[i].trauma=0;st[i].traumaPending=0;st[i].deepTrauma=0;st[i].asura=1;st[i].asuraStrong=(st[i].asuraStrong||0)+2;cp[i]=Math.min(200,cp[i]+100);
      log.push(`${nm(i)} 的劍帝萊維以 ${hp[i]} 點生命復活，獲得修羅之炎（+100CP、受到傷害-50%，1回合；永久獲得2層強壯）`)}});
    const died={};
    rm.seats.forEach((_,i)=>{if(!fallen[i]||hp[i]>0)return;died[i]=1;const dc=nchars[i],sn=st[i].san||0;save(i);nteam[i][nact[i]].dead=true;
      const k=nteam[i].findIndex(m=>!m.dead&&m.hp>0&&canDeploy(m.c));
      if(k>=0){load(i,k);if(!silent)st[i].san=sn<0?0:sn;log.push(`${nm(i)} 的 ${CHARS[dc].n} 倒下，${CHARS[nchars[i]].n} 上場（理智${sn<0?'由 '+sn+' 重置為 0':'繼承 '+sn}）`)}
      else log.push(`${nm(i)} 的角色全數倒下`)});
    rm.seats.forEach((_,i)=>{if(silent||!autoZilu[i]||died[i]||hp[i]<=0||nchars[i]!=='jia_qiu')return;const k=nteam[i].findIndex(m=>m.c==='zilu'&&!m.dead&&m.hp>0);if(k<0)return;save(i);load(i,k);log.push(`${nm(i)} 的賈丘護盾破裂，自動換上子路`)});
    rm.seats.forEach((_,i)=>{const k=forcedSwaps[i];if(k===undefined||died[i]||hp[i]<=0||st[i].wardenGeburaPending||k===nact[i]||!nteam[i][k]||nteam[i][k].dead||!(nteam[i][k].hp>0)||!canDeploy(nteam[i][k].c))return;save(i);const before=nchars[i];load(i,k,true);log.push(`${nm(i)} 免費自動換人：${CHARS[before].n} → ${CHARS[nchars[i]].n}（繼承理智${st[i].san||0}）`)});
    rm.seats.forEach((_,i)=>{const k=swaps&&swaps[i];if(k===undefined||died[i]||hp[i]<=0||st[i].wardenGeburaPending)return;
      if((unlimitedWardenSwaps(rm,i)||nsw[i]>0)&&k!==nact[i]&&nteam[i][k]&&!nteam[i][k].dead&&canDeploy(nteam[i][k].c)){save(i);const o=nchars[i];load(i,k,true);if(!unlimitedWardenSwaps(rm,i))nsw[i]--;log.push(`${nm(i)} 換人：${CHARS[o].n} → ${CHARS[nchars[i]].n}（${unlimitedWardenSwaps(rm,i)?'不限次數':'剩 '+nsw[i]+' 次'}，繼承理智 ${st[i].san||0}）`)}});
    rm.seats.forEach((_,i)=>{const k=instant?-1:(rm.st[i].cl||0)-1;if(k<0||died[i]||hp[i]<=0||nact[i]!==rm.act[i]||!nteam[i][k]||nteam[i][k].dead)return;st[i].cl=0;save(i);const o=nchars[i];load(i,k,true);log.push(`${nm(i)} 自動切換：${CHARS[o].n} → ${CHARS[nchars[i]].n}`)});
    if(!silent)rm.seats.forEach((_,i)=>{const enemy=rm.seats.some((__,j)=>j!==i&&nchars[j]==='ailan'&&hp[j]>0);if(enemy)return;const clear=s0=>{s0.trauma=0;s0.traumaPending=0;s0.deepTrauma=0};clear(st[i]);nteam[i].forEach(m=>clear(m.st))});
    rm.seats.forEach((_,i)=>save(i))}
  const result={team:nteam,act:nact,swapsLeft:nsw,chars:nchars,hp,st,cp};rewardLucioDeath({...rm0,...result},log);syncTktHealth({...rm0,...result});const settled=armXichn(enterXichn(rm0,result,options));syncWardenState({...rm0,...settled});return settled;
}
// 即時絕技結束後先結算角色生死，再以存活玩家更新當前配對。
function settleInstantBattle(r,log,charactersSettled=false,effects={}){
  if(wardenContinuePending(r)||wardenEndingPending(r))return;armXichn(r);
  if(r.d25Batch)return;if(!charactersSettled)soberDrunk(r,effects.damage,effects.combat,log);enforceFirefuHands(r);enforceWardenHands(r);
  if(!charactersSettled){
    r.cp=r.cp||r.seats.map(()=>0);
    const passChars=r.chars.map((c,i)=>r.st[i].sealT>0?'_':c);
    r.seats.forEach((_,i)=>{if(!r.team||!r.team[i][r.act[i]].dead)r.hp[i]=protectLife(passChars[i],r.st[i],r.hp[i],r.seats[i].name,log)});
    if(r.team)Object.assign(r,settleCharacters(r,{hp:r.hp,st:r.st,cp:r.cp,team:r.team,log,passChars,instant:true,...effects}));
  }
  markWardenBreak(r);r.hp=r.hp.map(h=>Math.max(0,h));
  rewardLucioDeath(r,log);beginLucioTurn(r);beginDrunkTurn(r);Object.assign(r,syncDrunkHands(r));
  startWardenEnding(r);if(wardenEndingPending(r))return;
  const alive=r.seats.map((_,i)=>i).filter(i=>r.hp[i]>0),wasOver=r.status==='over';
  const winner=r.cfg.boss?(r.hp[1]<=0&&!wardenCanContinue(r)?0:r.hp[0]<=0&&r.hp[2]<=0?1:null):(alive.length<=1?(alive[0]??-1):null);
  if(winner!==null){r.status='over';r.winner=winner;offerWardenContinue(r);if(wardenContinuePending(r)){log.push('挑戰者首次全滅，等待兩位玩家選擇是否接關');return}if(!wasOver)log.push(winner<0?'本次絕技後全員倒下，平手！':`🏆 ${r.cfg.boss?bossSideName(r.cfg,winner):r.seats[winner].name} 獲勝！`);return}
  if(r.cfg.warden){r.pair=wardenParticipants(r);r.spin=null;return}
  if(r.pair.length!==2||new Set(r.pair).size!==2||r.pair.some(i=>!(r.hp[i]>0))){
    if(r.cfg.boss){const preferred=r.turn===2?2:0;r.turn=r.hp[preferred]>0?preferred:(r.hp[0]>0?0:2);r.pair=[r.turn,1];r.spin=null}
    else{if(!(r.hp[r.turn]>0))r.turn=alive[0];const next=spinPick(r.hp,r.turn,r);r.pair=next.pair;r.spin=next.spin}
    log.push(`本回合改由 ${r.pair.map(i=>r.seats[i].name).join(' 與 ')} 繼續出牌`);
  }
}
// 沉默使用普通四花色結算快照；特殊狀態留在原角色，持續時間不消耗。
function resolveSilent(rm0,mv,gs,swaps,extra){
  const original=JSON.parse(JSON.stringify(rm0)),plain={...original,team:null,chars:original.seats.map(()=>null),
    silentMax:original.seats.map((_,i)=>characterMaxHp(original,i,original.chars[i],original.st[i])),
    st:original.st.map(s=>({...newSt(),fx:(s.fx||[]).filter(f=>f.source==='environment'),noD:s.noD||0,dDefFail:s.dDefFail||0,mirrorHp:s.mirrorHp||0,bombs:JSON.parse(JSON.stringify(s.bombs||[]))})),env:JSON.parse(JSON.stringify(original.env))};
  const next=resolve(plain,mv,gs,{},null,{...extra,silentPlain:true,noD25:true,deferAdvance:true});
  const log=['🔇【沉默】本回合只結算四花色基本效果，特殊狀態及二十五之刻暫停。',...next.last.log];
  const st=original.st.map((s,i)=>({...s,kiraArtTurns:original.chars[i]==='kira'&&original.pair.includes(i)&&mv[i]?0:s.kiraArtTurns||0,lkdArtTurns:original.chars[i]==='lkd'&&original.pair.includes(i)&&mv[i]?0:s.lkdArtTurns||0,sadArtTurns:original.chars[i]==='sad'&&original.pair.includes(i)&&mv[i]?0:s.sadArtTurns||0,isoCut:0,isoAdapt:0,noD:next.st[i].noD||0,dDefFail:next.st[i].dDefFail||0,bombs:next.st[i].bombs,shield:(s.shield||0)+(next.st[i].shield||0),shieldPersistent:(s.shieldPersistent||0)+(next.st[i].shieldPersistent||0)}));
  const state=settleCharacters(original,{hp:next.hp,st,cp:original.cp,team:original.team,log,swaps,instant:true,silent:true});
  const result={...original,...next,...state,d25:original.d25,d25Claimed:original.d25Claimed,d25Banner:null,status:'playing',winner:null,
    last:{...next.last,chars:original.chars,weapons:valorantWeaponSnapshot(original),damage:next.last.damage.map(e=>({...e,member:original.team?original.act[e.seat]:-1})),combat:(next.last.combat||[]).map(e=>({...e,member:original.team?original.act[e.seat]:-1,sourceMember:original.team?original.act[e.source]:-1})),healing:(next.last.healing||[]).map(e=>({...e,member:original.team?original.act[e.seat]:-1})),log}};
  delete result.silentMax;
  settleInstantBattle(result,log,true);
  result.pend=result.pend.filter(i=>result.hp[i]>0);
  if(result.status==='over')return result;
  if(result.pend.length)return{...result,phase:'reveal'};
  return advance(result);
}
function markEnvironmentSupportDamage(r,result){const S=r.env?.support;if(!S||S.round!==r.round||!result)return;if((result.combat||[]).some(e=>e.source===S.to&&e.seat!==S.to&&e.amount>0)||(result.hits||[]).includes(S.to)&&(result.damage||[]).some(e=>e.seat!==S.to&&e.amount>0&&!e.environment))S.damage=true}
function resolve(rm0,mv,gs,sk,swaps,extra){if(wardenEndingPending(rm0))return rm0;initTeaflower(rm0);armXichn(rm0);if(rm0.cfg.warden&&!extra?.wardenLeg&&!extra?.wardenFinish&&!extra)return resolveWardenBattle(rm0,mv,sk,swaps);const r=resolveBattle(rm0,mv,gs,sk,swaps,extra);markEnvironmentSupportDamage(r,r.instantResult);return r}
function resolveBattle(rm0,mv,gs,sk,swaps,extra){if(wardenEndingPending(rm0))return rm0;if(wardenContinuePending(rm0))return rm0;if(isoPending(rm0))return rm0;if(valorantShopPending(rm0)||mirrorPending(rm0)||environmentTradePending(rm0))return rm0;if(envSilent(rm0)&&!extra?.silentPlain&&!extra?.environmentDamage)return resolveSilent(rm0,mv,gs,swaps,extra);const rm=sealPass(rm0),upkeepPair=extra?.upkeepPair||rm.pair,sanAtStart=i=>extra?.wardenLeg&&i===1?extra.wardenSan||0:rm.st[i].san||0,submittedMv={...mv};mv={...mv};rm.pair.forEach(i=>{if(kiraCardLocked(rm0,i)){delete mv[i];delete submittedMv[i]}});if(rm.teaflower)rm.teaflower=JSON.parse(JSON.stringify(rm.teaflower));if(rm.env)rm.env=JSON.parse(JSON.stringify(rm.env));if(rm.wardenCandles)rm.wardenCandles=JSON.parse(JSON.stringify(rm.wardenCandles));if(extra?.wardenPunishment||extra?.wardenExecution||extra?.wardenShiftDelete)sk={};
  if(rm.env?.support?.round===rm.round)gs={seat:rm.env.support.by,support:rm.env.support.to};
  const valorantEconomy=rm.valorantEconomy?JSON.parse(JSON.stringify(rm.valorantEconomy)):null,attackWeapons={},isoAdapt=rm.pair.some(i=>rm.chars[i]==='iso'&&rm.st[i].isoAdapt);
  const hp=[...rm.hp],nm=i=>rm.seats[i].name,log=[],damage=[],combat=[],healing=[],soundCues=[],P={},leiU={},ohNew={},max=rm.cfg.hp,ex={},hits=[],refl={},cntd={},effd={};const teaEvents=[],teaDamageCard={};const cblk={},mx=i=>characterMaxHp(rm0,i,rm0.chars[i],st[i]),hd=a=>0;
  const recordHeal=(seat,amount,source=seat,kind='heal',arr=hp)=>{amount=tidyHp(amount);addHealingFx(healing,rm0,seat,amount,undefined,source,kind,damage.length-1);shareEnvironmentHealing(rm0,seat,amount,log,healing,arr,st,lock)};
  const d25Success={},d25HeartGain={},d25List=JSON.parse(JSON.stringify(rm.d25||rm.seats.map(()=>({val:0,bust:false,ready:false,used:false}))));
  const recordHeartHeal=(seat,amount,source=seat)=>{amount=tidyHp(amount);recordHeal(seat,amount,source);if(amount>0)xichnLearning.push({route:1,seat:source,member:rm.act?.[source]??-1});if(seat===source&&amount>0)d25HeartGain[source]=tidyHp((d25HeartGain[source]||0)+amount)};
  let d25Claimed=!!rm.d25Claimed,d25JustTriggered=null;const d25Candidates=[];
  const st=JSON.parse(JSON.stringify(rm.st)),got={},guessOnly={},wrapUp={},spk={...extra?.spk},boost={},lock={},autoZilu={...extra?.autoZilu},rufoTaskEvents=Object.fromEntries(rm.pair.map(i=>[i,{S:false,C:false,H:false,D:false}])),rufoUsed={},aceOn=false;
  const xichnExits={},xichnPrimary={},xichnLearning=[],xichnBlocked=rm0.team?rm0.team.flatMap((t,i)=>t.flatMap((m,k)=>(k===rm0.act[i]?rm0.st[i]:m.st).sealT>0?[`${i}:${k}`]:[])):rm0.st.flatMap((s,i)=>s.sealT>0?[`${i}:-1`]:[]);
  const registerXichnExit=(i,arr=hp)=>{if(!st[i].xichnExitPending||xichnExits[i]||!tcl)return;st[i].xichnExitPending=0;const choices=tcl[i].map((m,k)=>({m,k})).filter(({m,k})=>k!==rm.act[i]&&!m.dead&&(rres[i]?.[k]??m.hp)>0&&canDeploy(m.c));if(!choices.length)return;const {k,m}=rnd(choices);xichnExits[i]={from:rm.act[i],to:k};m.st.san=st[i].san||0;if(rm.wardenTipherethGranted)m.st.wardenGeburaEligible=1;log.push(`${nm(i)} 的賈惜春立即免費換下，${CHARS[m.c].n} 上場；後續連擊改由接替角色承受`)};
  const teaView=()=>({...rm,hp,st,team:tcl,teaSealed:rm0.team?rm0.team.flatMap((t,i)=>t.flatMap((m,k)=>(k===rm0.act[i]?rm0.st[i]:m.st).sealT>0?[`${i}:${k}`]:[])):rm0.st.flatMap((s,i)=>s.sealT>0?[`${i}:-1`]:[])});
  const teaHit=(source,target,kind,amount,profile)=>{if(!(amount>0)||source===undefined||source===null||source===target||!enemies(source).includes(target))return;if(['spade','club','counter'].includes(kind)&&!profile)teaDamageCard[source]=true;const c=profile?.c||rm.chars[source],state=profile?.s||st[source];if(c!=='teaflower'||envSilent(rm)||state.sealT>0||kind==='teaFailure')return;if(state.teaInner||kind==='club'||kind==='counter'&&P[target]?.s==='C')teaEvents.push({target,source,member:profile?.member??rm.act?.[source]??-1})};
  const flushTea=()=>{if(!rm.teaflower)return;const view=teaView();for(const e of teaEvents.splice(0))addTeaBloom(view,e.target,e.source,e.member,log);};
  const settleResolved=options=>{flushTea();drainWardenPower({...rm0,st},damage.filter(e=>e.seat===1&&!e.candle).reduce((n,e)=>n+e.amount*2,0),log,'受到傷害×2');rm.seats.forEach((_,i)=>registerXichnExit(i));const view={...rm0,hp,st,team:tcl,chars:rm.chars};soberDrunk(view,damage,combat,log);if(tcl)tcl.forEach((t,i)=>t.forEach((m,k)=>{if(k!==rm.act[i]&&rres[i]?.[k]!==undefined)m.hp=rres[i][k]}));learnXichn(view,xichnLearning,log,xichnBlocked);let base=rm0;const pass=[...rm.chars];if(Object.keys(xichnExits).length){base={...rm0,chars:[...rm0.chars],act:[...rm0.act],st:[...rm0.st],team:tcl};Object.entries(xichnExits).forEach(([seat,x])=>{const i=+seat,old=tcl[i][x.from],incoming=tcl[i][x.to];old.hp=hp[i];old.dead=old.hp<=0;incoming.st.san=st[i].san||0;old.st=JSON.parse(JSON.stringify(st[i]));hp[i]=rres[i]?.[x.to]??incoming.hp;st[i]=JSON.parse(JSON.stringify(incoming.st));delete (rres[i]||{})[x.to];base.act[i]=x.to;base.chars[i]=incoming.c;base.st[i]=st[i];pass[i]=st[i].sealT>0?'_':incoming.c;incoming.hp=hp[i];incoming.dead=false;if(!x.slain)delete spk[i]})}return {...settleCharacters(base,{...options,hp,st,cp,team:tcl,rres,nut,spk,autoZilu,log,passChars:pass,damage,combat,healing,hits,soundCues}),...(rm.teaflower?{teaflower:rm.teaflower,hands:rm.hands,up:rm.up}:{}),...(rm.wardenCandles?{wardenCandles:rm.wardenCandles,wardenCandleNext:rm.wardenCandleNext}:{})}};
  const support=envActive(rm,'cheer')&&rm.cfg.n===3&&!rm.cfg.boss&&gs&&hp[gs.seat]>0&&!rm.pair.includes(gs.seat)&&rm.pair.includes(gs.support)?{by:gs.seat,to:gs.support}:null;
  if(support&&!st[support.to].fx.some(f=>f.cheer===rm.round)){st[support.to].fx.push({k:'s',n:5,t:1,source:'environment',round:rm.round,cheer:rm.round});log.push(`📣 ${nm(support.by)} 支持 ${nm(support.to)}，本回合強壯＋5`)}
  const cueEnvironment=(id,stage,seats,detail,options={})=>queueEnvironmentFx(rm,id,stage,[],[],{focus:seats.map(seat=>({seat,member:rm.act?.[seat]??-1})),detail,...options});
  const guard=()=>{rm.seats.forEach((_,i)=>{if(hp[i]>mx(i)&&!st[i].mirrorHp){const before=hp[i];hp[i]=mx(i);recordHpLoss(rm0.chars[i],st[i],before,hp[i])}});guard0()},guard0=(arr=hp)=>rm.seats.forEach((_,i)=>{arr[i]=wardenGeburaLife(st[i],arr[i],nm(i),log);if(st[i].wardenGeburaPending||st[i].wardenGebura){delete spk[i];if(rm0.d25Batch?.spk)delete rm0.d25Batch.spk[i]}if(!spk[i]&&!rm0.d25Batch?.spk?.[i])arr[i]=protectLife(rm.chars[i],st[i],arr[i],nm(i),log)});
  const lib=i=>{const g=(rm.chars[i]==='rien'&&rm.st[i].grace)||0;return g>=9?3:g>=6?2:g>=3?1:0};
  const rk=i=>(rm.chars[i]==='rien'&&rm.st[i].karma)||0;
  const takenMod=i=>{const b=calcBuffs(rm.chars[i],st[i]);return b.vuln-b.guard};
  const dm=(i,v)=>sanFx(i,envAttack(rm,v))+(st[i].wardenRapidPulse&&v>0?10:0),blackDm=(i,v)=>dm(i,v)+(st[i].wardenPulse?5:0);
  let candleRouting=true;
  const candleHit=(by,v,kind,id=extra?.wardenCandleTargets?.[by],fm)=>{const view={...rm,st},dealt=hitWardenCandle(view,id,fm?v*fm:v,by,damage,combat,log,kind);if(view.wardenCandleNext!==undefined)rm.wardenCandleNext=view.wardenCandleNext;if(dealt>0){hits.push(by);cpAdd(by,15)}return dealt};
  const facOk=i=>rm.chars[i]&&CHARS[rm.chars[i]]&&CHARS[rm.chars[i]].f==='bus'&&rm.chars[i]!=='verg';
  const addSan=(i,n)=>{if(!facOk(i)||!n)return;const b=st[i].san||0;st[i].san=Math.max(sanityMin(rm0,i),Math.min(45,b+n));const d=st[i].san-b;if(d)log.push(`${nm(i)} 理智 ${d>0?'+':''}${d}（${st[i].san}）`)};
  const vergBreak=(c,s0,previous,seat,where)=>{if(c!=='verg'||!(previous>0)||s0.shield>0||s0.vergEgo)return;s0.vergEgo=1;s0.vergEgoTurns=0;s0.shield=damageAmount(rm.cfg.hp*.2);s0.asuraStrong=(s0.asuraStrong||0)+3;log.push(`${nm(seat)} 的維吉里烏斯護盾首次破裂${where?'（'+where+'）':''}，進入【綻放EGO：血之洗禮】；獲得護盾 ${s0.shield} 及強壯×3`)};
  const tickVerg=(s0,seat)=>{if(!s0.vergEgo)return;s0.vergEgoTurns=(s0.vergEgoTurns||0)+1;if(s0.vergEgoTurns>=3){s0.vergEgoTurns=0;s0.shield=s0.vergShieldStack?(s0.shield||0)+5:5;s0.shieldPersistent=Math.min(s0.shieldPersistent||0,s0.shield);log.push(`${nm(seat)} 的【${s0.vergShieldStack?'血幕-極':'血之洗禮'}】每3回合${s0.vergShieldStack?'累加5點護盾':'護盾刷新為5點，不疊加'}（共${s0.shield}）`)}};
  const tickTimeUp=(s0,seat)=>{if(!(s0.timeUpTurns>0))return;s0.timeUpTurns--;if(!s0.timeUpTurns){s0.notExpecting=0;s0.expectation=3;log.push(`${nm(seat)} 的【時間到】結束，不再期待解除，恢復3層期待`)}};
  const sanFx=(i,v)=>{if(v<=0)return v;if(rm.chars[i]==='verg'){const bonus=rnd([1,2,3]);log.push(`${nm(i)} 的維吉里烏斯威力加成 +${bonus}`);return v+bonus}if(!facOk(i))return v;const sn=sanAtStart(i);if(sn>=45){log.push(`${nm(i)} 理智達45，傷害+2`);return v+2}if(sn<=-45)return v;if(!sn)return v;
    if(Math.random()<(50+Math.abs(sn))/100){log.push(`${nm(i)} 的理智（${sn}）使傷害 ${sn>0?'+1':'-1'}`);return sn>0?v+1:Math.max(0,v-1)}return v};
  const shrink=(t,n)=>{const a=Math.min(n,mx(t)-1);if(a>0)st[t].mdec=(st[t].mdec||0)+a;return Math.max(0,a)};
  const ringHit=(a,t,dealt,club)=>{if(extra?.wardenCandleTargets?.[a]&&t===1)return;if(rm.chars[a]!=='ring'||dealt<=0)return;const stacks=rm.st[a].lm||0;let n=club&&cblk[a]?5:(stacks>=5?2:1)*(club?2:1);n=shrink(t,n);if(n>0){const oldLm=st[a].lm||0;st[a].lm=oldLm+n;log.push(`${nm(t)} 的最大生命 -${n}（剩 ${mx(t)}），${nm(a)} 獲得 ${n} 層活體材料`);// 美學被動：活體材料增加時最大生命與當前生命同步提升
    if(st[a].ringAesthetic){const gain=envHeal(rm,healingGain(st[a],n)),before=hp[a];hp[a]=healedHp(hp[a],mx(a),gain,rm.chars[a],st[a],log,nm(a));recordHeal(a,hp[a]-before);log.push(`${nm(a)} 的【美學】：活體材料+${n}，最大生命+${n}、當前生命+${gain}${healingNote(st[a])}`)}}};
  const cp=[...(rm.cp||rm.seats.map(()=>0))],chO=rm0.chars,rres={},tcl=rm.team?JSON.parse(JSON.stringify(rm.team)):null;st.forEach((s0,i)=>syncTktState(rm0.chars[i],s0,hp[i],mx(i)));if(tcl)tcl.forEach((t,i)=>t.forEach(m=>syncTktState(m.c,m.st,m.hp,characterMaxHp(rm0,i,m.c,m.st))));const nut={};if(rm.team)rm.team.forEach((t,i)=>{const k=t.findIndex(m=>m.c==='nut'&&!m.dead&&m.hp>0);if(k>=0)nut[i]={k,hp:t[k].hp}});
  const nutTake=(i,v)=>{const n=nut[i];if(!n||n.hp<=0||v<=0)return null;const b=n.hp;n.hp=Math.max(0,b-v);
    addDamageFx(damage,rm0,i,b-n.hp,n.k);
    log.push(`${nm(i)} 受到的傷害由高堅果承受 ${v} 點（高堅果剩 ${n.hp}）`+(n.hp<=0?'，高堅果倒下！':''));return b-n.hp};
  const cpAdd=(j,n)=>{if(j===undefined||j===null)return;const active=rm.team&&rm.team[j][rm.act[j]]?rm.team[j][rm.act[j]].c:chO[j],C=CHARS[active];if(C&&C.f==='trails'){if(n>0&&active==='leo')n=Math.floor(n*1.5);cp[j]=Math.min(200,Math.max(0,cp[j]+n))}};
  const shin=i=>i!==undefined&&rm.chars[i]==='rean'&&shinActive(st[i]);
  const recordWeapon=by=>{if(Number.isInteger(by)&&isValorant(rm0.chars[by])&&!Object.hasOwn(attackWeapons,by))attackWeapons[by]=st[by].gun||null};
  const valDodgeCards={},valDodgeSun={},valDodged={},valEvasions={};
  // 只有黑牌本身的傷害傳入原始點數；技能、反擊、斬殺與環境傷害不觸發。
  const valDodge=(i,c,s0,by,blackRank,member)=>{
    if(c!=='val'||s0.sealT>0||!Number.isFinite(blackRank)||by===undefined||by===i||!enemies(by).includes(i))return false;
    const key=i+'_'+(member===undefined?'active':member),name=member===undefined?nm(i):`${nm(i)} 的後備 ${CHARS[c].n}`,previous=valEvasions[key];
    if(previous){
      if(+previous.card.slice(1)<blackRank)return false;
      if(member===undefined)valDodged[i]=(valDodged[i]||0)+1;
      log.push(`${name} 延續本回合的${cs(previous.card)}預知眼閃避（原始點數${+previous.card.slice(1)} ≥ ${blackRank}），不再次消耗方塊或預知眼`);
      return true;
    }
    if((s0.eye||0)<2||s0.heat>0)return false;
    const played=extra?.sunUsed?.[i]?[]:submittedMv[i]?[submittedMv[i]]:[],spent=valDodgeCards[i]||[],sunSpent=valDodgeSun[i]||[];
    const cards=subtractCards(rm.hands[i]||[],[...played,...spent]).map(card=>({card}));
    cards.push(...(hostSunCards[i]||[]).filter(x=>x.expires>=rm.round&&x.id!==extra?.sunUsed?.[i]&&!sunSpent.includes(x.id)));
    const best=cards.filter(x=>x.card[0]==='D').reduce((top,x)=>!top||+x.card.slice(1)>+top.card.slice(1)?x:top,null);
    if(!best||+best.card.slice(1)<blackRank)return false;
    if(best.id)(valDodgeSun[i]||(valDodgeSun[i]=[])).push(best.id);else(valDodgeCards[i]||(valDodgeCards[i]=[])).push(best.card);
    valEvasions[key]=best;s0.eye-=2;if(member===undefined)valDodged[i]=(valDodged[i]||0)+1;
    log.push(`${name} 以預知眼消耗2層及${cs(best.card)}（原始點數${+best.card.slice(1)} ≥ ${blackRank}），閃避這次黑牌傷害；本回合持續以該方塊判定閃避（預知眼剩${s0.eye}層）`);
    if(!s0.eye&&!s0.xinVal){s0.heat=3;log.push(`${name} 預知眼耗盡，進入過熱（3場戰鬥：傷害-2）`)}
    return true;
  };
  const fingerRoom=arr=>({...rm0,hp:arr,st,team:tcl});
  const fingerBonus=(arr,target,by,c)=>by!==undefined&&by!==null&&isMiddleFinger(c)&&enemies(by).includes(target)?revengeStacks(fingerRoom(arr),by,st[target]):0;
  const kiraHit=(arr,by,target,dealt,targetSt,profile)=>{const c=profile?.c||rm.chars[by],s0=profile?.s||st[by];if(c!=='kira'||!(dealt>0)||s0.sealT>0||envSilent(rm0)||!enemies(by).includes(target)||!revengeStacks(fingerRoom(arr),by,targetSt)||(s0.kiraHeat||0)>=2)return;s0.kiraHeat=(s0.kiraHeat||0)+1;log.push(`${nm(by)} 的【熱絲】獲得1層永久強壯（${s0.kiraHeat}/2）`)};
  // 只追蹤老爸技能實際換上的成員；反傷沒有攻擊來源，不會再反傷或施加復仇。
  const kiraRelayDamage=events=>{if(envSilent(rm0))return;for(const link of rm0.kiraRelays||[]){if(link.round!==rm0.round)continue;const amount=events.reduce((n,e)=>n+(e.source===link.seat&&e.sourceMember===link.member&&e.amount>0?e.amount:0),0);if(!(amount>0)||!tcl)continue;const m=tcl[link.seat]?.[link.kira];if(!m||m.c!=='kira'||m.dead)continue;const active=rm0.act[link.seat]===link.kira,current=active?hp[link.seat]:(rres[link.seat]?.[link.kira]??m.hp);if(!(current>0))continue;const actual=active?takeOne(hp,link.seat,amount,undefined,undefined,'fixed'):hitRes(link.seat,link.kira,amount,undefined,'老爸技能等量反傷',undefined,undefined,'fixed');log.push(`${nm(link.seat)} 換上的${CHARS[tcl[link.seat][link.member].c].n}造成${amount}點傷害，綺羅一併承受等量反傷（實際${actual}）`)}};
  const matBurnRelay=(s0,b,dealt)=>{const sources=s0.matBurnSources||[];let remaining=b;const events=sources.map(x=>{const n=Math.min(remaining,x.n);remaining-=n;return{source:x.seat,sourceMember:x.member,amount:tidyHp(dealt*n/b)}});kiraRelayDamage(events);if(!remaining&&sources.length)sources[0].n--;s0.matBurnSources=sources.filter(x=>x.n>0)};
  const fingerHit=(c,s0,seat,by,dealt,kind,arr,reserve=false,alive=true,member=-1)=>{
    if(!(dealt>0)||!isMiddleFinger(c)||s0.sealT>0||envSilent(rm0)||by===undefined||by===null||!enemies(seat).includes(by)||!['spade','club'].includes(kind)||!reserve&&P[seat]&&'SC'.includes(P[seat].s)&&!P[seat].v)return;
    const side=middleFingerSide(rm0,seat),cap=middleFingerCount(fingerRoom(arr),seat)*2,target=st[by];target.fingerRevenge=target.fingerRevenge||{};target.fingerRevenge[side]=Math.min(cap,(target.fingerRevenge[side]||0)+1);
    log.push(`${nm(by)} 被【中指】施加復仇對象（玩家${side+1}方共用，${target.fingerRevenge[side]}/${cap}層）`);
    if(c!=='lkd'||!alive||arr[by]<=0)return;
    const b=calcBuffs(c,s0);let v=envAttack(rm,Math.max(0,Math.floor(2*prevMult(c,s0,'S')+1e-9)+b.strong-b.weak)),san=s0.san||0;
    if(v>0){if(san>=45)v+=2;else if(san>-45&&san&&Math.random()<(50+Math.abs(san))/100)v=Math.max(0,v+(san>0?1:-1))}
    const profile=reserve?{c,s:s0,member}:null,n=takeOne(arr,by,v,seat,undefined,'payback',undefined,profile);
    log.push(`${nm(seat)} 的${reserve?'後備里卡多':''}【償還】對 ${nm(by)} 造成基礎2點傷害（實際${n}）`);
  };
  const takeOne=(arr,i,v,by,fm,kind,blackRank,profile)=>{if(candleRouting&&i===1&&extra?.wardenCandleTargets?.[by]&&'SC'.includes(submittedMv[by]?.[0])&&kind!=='counter'&&kind!=='burn')return candleHit(by,fm?v*fm:v,kind);if(kind!=='wardenExecution')registerXichnExit(i,arr);xichnPrimary[i]=xichnExits[i]?.to??rm.act?.[i];if(xichnExits[i]&&kind!=='burn'&&kind!=='wardenExecution'){const k=xichnExits[i].to;return hitRes(i,k,v,fm,'余桓換人後的攻擊',undefined,by,kind,arr,blackRank)}const source=by,execution=kind==='wardenExecution',fixedDamage=kind==='fixed'||kind==='teaSpring',shieldResolveOnly=kind==='kiraFixed'||execution;if(profile)by=undefined;recordWeapon(by);if(!shieldResolveOnly&&v>0&&(st[i].wall||0)>0){st[i].wall--;log.push(`${nm(i)} 的大地之牆抵擋了這次傷害`);return 0}
    if(rm.chars[i]==='xichn')st[i].xichnCanExit=!!tcl&&tcl[i].some((m,k)=>k!==rm.act[i]&&!m.dead&&(rres[i]?.[k]??m.hp)>0&&canDeploy(m.c));
    const ruptureBefore=st[i].rupture||0;
    // 綺羅老爸技只允許護盾與毅力影響；一般固定傷害仍保留牆、代受等防護。
    if(!fixedDamage&&!shieldResolveOnly){
    const revenge=fingerBonus(arr,i,source,profile?.c||rm.chars[by]);if(v>0&&revenge){v+=revenge;log.push(`${nm(i)} 的復仇對象使中指傷害+${revenge}`)}
    const fasterZilu=by!==undefined&&rm.chars[by]==='zilu'&&P[by]&&P[i]&&P[by].r<P[i].r;
    if(v>0&&(st[i].rupture||0)>0){const n=st[i].rupture;v+=n;if(!fasterZilu)st[i].rupture--;log.push(`${nm(i)} 的破裂追加 ${n} 點傷害${fasterZilu?'（子路出牌較快，破裂不消耗）':''}`)}
    if(by!==undefined&&rm.chars[by]==='jia_qiu'&&st[by].egoStanding&&P[by]&&P[i]&&((P[by].s==='S'||P[by].s==='C')&&P[i].s==='H'||P[by].s==='D'&&'SC'.includes(P[i].s))){v+=2;log.push(`${nm(by)} 的綻放EGO：而立使單方面傷害+2`)}
    if(v>0)v=Math.max(0,v+takenMod(i));const rdv=redSt(rm.chars[i],st[i]);if(v>0&&rdv>0)v*=1-Math.min(.9,rdv);if(v>0&&fm)v*=fm;
    if(v>0&&rm.chars[i]==='heathcliff'&&((kind==='spade'&&st[i].shieldSuit==='S')||(kind==='counter'&&st[i].shieldSuit==='D'))){v/=2;log.push(`${nm(i)} 的${SU[st[i].shieldSuit]}盾使${kind==='spade'?'黑桃傷害':'反擊傷害'}減半`) }
    }
    if(!shieldResolveOnly&&v>0&&arr[i]>0&&valDodge(i,rm.chars[i],st[i],by,blackRank)){st[i].rupture=ruptureBefore;return 0}
    if(!shieldResolveOnly)v=isoDamage(rm.chars[i],st[i],v,log,nm(i),kind==='teaSpring');if(kind!=='teaSpring'){v=wardenEvidenceDamage({...rm,st,team:tcl,hp:arr},source,v,kind);v=wardenMaintenanceDamage(rm,st[i],v,kind);if(v>0&&!execution&&st[i].wardenCondemned)v*=2;if(v>0&&i===1&&st[i].wardenShiftVulnRound===rm.round)v*=2;}
    const fxStart=damage.length,shield=absorbShield(st[i],v),beforeShield=shield.before,a=shield.absorbed;v=shield.remaining;if(a>0){log.push(`${nm(i)} 的護盾吸收 ${a} 點傷害`+(v>0?`，剩餘 ${v} 點傷害繼續結算`:''));vergBreak(rm.chars[i],st[i],beforeShield,i,'護盾');if(rm.chars[i]==='jia_qiu'&&st[i].shield<=0&&!st[i].egoStanding){st[i].egoStanding=1;autoZilu[i]=1;log.push(`${nm(i)} 的賈丘護盾破裂，獲得【綻放EGO：而立】`) }}
    addDamageFx(damage,rm0,i,a,undefined,true);
    let dealt;const nt=shieldResolveOnly?null:nutTake(i,v);
    if(nt!==null)dealt=nt;else{const before=arr[i];
      arr[i]=damagedHp(before,mx(i),v,shieldResolveOnly?null:rm.chars[i],st[i],log,nm(i),true);
      if(execution)arr[i]=protectLife(rm.chars[i],st[i],arr[i],nm(i),log);
      addDamageFx(damage,rm0,i,recordHpLoss(rm0.chars[i],st[i],before,arr[i]));dealt=Math.max(0,before-arr[i])}
    const combatStart=combat.length;addCombatDamage(combat,rm0,source,damage,fxStart,kind,beforeShield);if(profile)combat.slice(combatStart).forEach(e=>e.sourceMember=profile.member);
    environmentThorns(rm0,source,damage.slice(fxStart),log,damage,arr,st);
    if(!execution)registerXichnExit(i,arr);dealt+=a;loseValorantGun(rm.chars[i],st[i],nt===null?dealt:a,kind,log,nm(i)); // 護盾是臨時生命；實際扣盾亦算攻擊命中。
    if(dealt>0){if(source!==undefined&&source!==null)hits.push(source);cpAdd(source,15);cpAdd(i,10);
      if(by!==undefined&&rm.chars[by]==='verg'&&st[by].vergSword&&P[by]&&'SC'.includes(P[by].s)){const n=Math.ceil(P[by].r*.3);st[i].burn=(st[i].burn||0)+n;log.push(`${nm(i)} 被【超高溫羅馬短劍】附加 ${n} 層炎傷（共${st[i].burn}）`)}
      if(by!==undefined&&rm.chars[by]==='verg'&&kind==='counter'&&st[by].vergEgo){st[i].rufoBleed=(st[i].rufoBleed||0)+3;log.push(`${nm(i)} 被【血之洗禮】反擊命中，獲得3層流血（共${st[i].rufoBleed}）`)}
      if(by!==undefined&&rm.chars[by]==='ailan'&&dealt>5&&!st[i].superDeepTrauma&&!st[i].deepTrauma&&!st[i].traumaPending){st[i].trauma=(st[i].trauma||0)+1;log.push(`${nm(i)} 獲得1層創傷（共${st[i].trauma}層）`);if(st[i].trauma>=2){st[i].traumaPending=1;log.push(`${nm(i)} 的創傷將於下回合轉為深度創傷`)}}
      if(by!==undefined&&rm.chars[by]==='zilu'){st[i].rupture=(st[i].rupture||0)+1;log.push(`${nm(i)} 獲得1層破裂（共${st[i].rupture}層）`)}
      if(by!==undefined&&rm.chars[by]==='rufo'&&(st[by].rufoWolf||0)>0){st[i].rufoBleed=(st[i].rufoBleed||0)+1;log.push(`${nm(i)} 獲得1層流血（共${st[i].rufoBleed}層）`)}
      if(by!==undefined&&by!==null&&rm.chars[by]==='dihui'&&(st[by].afterimage||0)>0&&arr[i]>0){
        const wanted=Math.max(1,Math.floor(dealt*0.2*(st[by].afterimage||0))),before=arr[i],extraTrue=Math.max(0,before-damagedHp(before,mx(i),Math.min(before,wanted),rm.chars[i],st[i],log,nm(i)));
        arr[i]=Math.max(0,before-extraTrue);recordHpLoss(rm0.chars[i],st[i],before,arr[i]);if(arr[i]<=0)spk[i]=1;
        const extraFxStart=damage.length;addDamageFx(damage,rm0,i,extraTrue);addCombatDamage(combat,rm0,by,damage,extraFxStart);environmentThorns(rm0,by,damage.slice(extraFxStart),log,damage,arr,st);
        if(extraTrue>0)log.push(`${nm(by)} 的殘像糾纏追擊 ${nm(i)} ${extraTrue} 點真實傷害（${st[by].afterimage}層；不受增減傷影響）`);
      }
      if(by!==undefined&&by!==i&&rm.chars[by]==='sad'&&P[by]?.sadEmpowered&&['spade','club','counter'].includes(kind)&&!P[by].sadHit){
        P[by].sadHit=true;
        if(CHARS[rm0.chars[i]]?.f==='bus'&&rm0.chars[i]!=='verg'){const before=st[i].san||0;st[i].san=Math.max(sanityMin(rm0,i),before-20);log.push(`${nm(by)} 的淚鋒命中，${nm(i)} 理智 ${st[i].san-before}（${st[i].san}）`)}
        else if(arr[i]>0){const extra=takeOne(arr,i,3,by,undefined,'fixed');log.push(`${nm(by)} 的淚鋒命中，${nm(i)} 沒有可變理智，追加3點固定傷害（實際${extra}）`)}
      }
    }teaHit(source,i,kind,dealt,profile);kiraHit(arr,source,i,dealt,st[i],profile);kiraRelayDamage(combat.slice(combatStart));if(!profile)fingerHit(rm.chars[i],st[i],i,by,dealt,kind,arr,false,arr[i]>0);return dealt};
  const allies=es=>rm.cfg.boss&&es!==1?[0,2]:[es],enemies=es=>rm.cfg.boss?(es===1?[0,2]:[1]):rm.seats.map((_,j)=>j).filter(j=>j!==es);
  const teamAlive=es=>rm.team?rm.team[es].filter((m,k)=>canDeploy(m.c)&&(k===rm.act[es]?hp[es]>0:(rres[es]&&rres[es][k]!==undefined?rres[es][k]>0:!m.dead&&m.hp>0))).length:1;
  const halvedFor=es=>!!rm.team&&allies(es).reduce((n,j)=>n+teamAlive(j),0)>=2;
  const enemyCandles=i=>rm.cfg.warden&&i!==1?wardenCandleAlive(rm):[];
  const enemyGroup=i=>!!rm.team&&enemies(i).reduce((n,j)=>n+teamAlive(j),enemyCandles(i).length)>=2;
  // 明確的群攻／隨機目標繞過單張牌的燭台指向，避免同一燭台重複受傷。
  const takeBody=(...args)=>{const prior=candleRouting;candleRouting=false;try{return takeOne(...args)}finally{candleRouting=prior}};
  const hitAllCandles=(by,v,kind,fm,skip)=>{let count=0;enemyCandles(by).forEach(c=>{if(c.id!==skip&&candleHit(by,v,kind,c.id,fm)>0)count++});return count};
  const stAt=(es,k)=>(k<0||!rm.team||k===rm.act[es])?st[es]:tcl[es][k].st;
  const fxAdd=(es,k,f)=>{const s0=stAt(es,k);s0.fx=s0.fx||[];const old=s0.fx.find(x=>x.k===f.k&&x.n===f.n&&x.source===f.source);if(old)old.t=Math.max(1,old.t||0)+Math.max(1,f.t||0);else s0.fx.push({...f})};
  const forTeam=(es,f)=>{if(!rm.team){f(es,-1);return}allies(es).forEach(target=>tcl[target].forEach((m,k)=>{if(m.c==='nut'||m.dead)return;
    if(k===rm.act[target]){if(hp[target]>0)f(target,-1)}else{const c0=rres[target]&&rres[target][k]!==undefined?rres[target][k]:m.hp;if(c0>0)f(target,k)}}))};
  const hitRes=(es,k,v0,fm,tag,suit,by,kind,arr=hp,blackRank)=>{recordWeapon(by);const m=tcl[es][k];if(!m||k===rm.act[es]||m.dead||m.hp<=0)return 0;
    if(m.c==='nut'&&!(nut[es]&&nut[es].hp>0))return 0;
    const cur=rres[es]&&rres[es][k]!==undefined?rres[es][k]:m.hp;if(cur<=0&&m.c!=='nut')return 0;
    if(v0>0&&(m.c!=='nut'||extra?.environmentDamage)&&(m.st.wall||0)>0){m.st.wall--;log.push(`${nm(es)} 的後備 ${CHARS[m.c].n} 的大地之牆抵擋了傷害`);return 0}
    let v=v0;const fixedDamage=kind==='fixed'||kind==='teaSpring',ruptureBefore=m.st.rupture||0;const revenge=by!==undefined&&isMiddleFinger(rm.chars[by])&&enemies(by).includes(es)?revengeStacks(fingerRoom(arr),by,m.st):0;if(!fixedDamage&&v>0&&revenge){v+=revenge;log.push(`${nm(es)} 的後備復仇對象使中指傷害+${revenge}`)}
    if(!fixedDamage){
    const fasterZilu=by!==undefined&&rm.chars[by]==='zilu'&&P[by]&&P[es]&&P[by].r<P[es].r;if((m.st.rupture||0)>0&&v>0){const n=m.st.rupture;v+=n;if(!fasterZilu)m.st.rupture--;log.push(`${nm(es)} 的後備 ${CHARS[m.c].n} 破裂追加 ${n} 點傷害${fasterZilu?'（子路出牌較快，破裂不消耗）':''}`)}if(m.c!=='nut'){const b=calcBuffs(m.c,m.st);v=Math.max(0,v+b.vuln-b.guard);const rdv=redSt(m.c,m.st);if(v>0&&rdv>0)v*=1-Math.min(.9,rdv)}
    if(v>0&&fm)v*=fm;if(v>0&&m.c==='heathcliff'&&((m.st.shieldSuit==='S'&&(suit==='S'||kind==='spade'))||(m.st.shieldSuit==='D'&&kind==='counter'))){v/=2;log.push(`${nm(es)} 的後備希斯克利夫${SU[m.st.shieldSuit]}盾使${kind==='counter'?'反擊':'黑桃'}傷害減半`)}
    }
    if(v>0&&!envSilent(rm0)&&valDodge(es,m.c,m.st,by,blackRank,k)){m.st.rupture=ruptureBefore;return 0}
    v=isoDamage(m.st.sealT>0||envSilent(rm0)?null:m.c,m.st,v,log,`${nm(es)} 的後備 ${CHARS[m.c].n}`,kind==='teaSpring');
    if(kind!=='teaSpring'){v=wardenEvidenceDamage({...rm,st,team:tcl,hp:arr},by,v,kind);v=wardenMaintenanceDamage(rm,m.st,v,kind);if(v>0&&m.st.wardenCondemned)v*=2;}const fxStart=damage.length,shield=absorbShield(m.st,v),beforeShield=shield.before,sh=shield.absorbed;v=shield.remaining;if(sh>0){log.push(`${nm(es)} 的後備 ${CHARS[m.c].n} 護盾吸收 ${sh} 點傷害`+(v>0?`，剩餘 ${v} 點傷害繼續結算`:''));vergBreak(m.c,m.st,beforeShield,es,'後備護盾')}
    addDamageFx(damage,rm0,es,sh,k,true);
    let dealt=sh;const redirected=!!(nut[es]&&nut[es].hp>0&&v>0);
    if(v>0){if(nut[es]&&nut[es].hp>0)dealt+=nutTake(es,v)||0;else{rres[es]=rres[es]||{};rres[es][k]=Math.max(0,damagedHp(cur,characterMaxHp(rm0,es,m.c,m.st),v,envSilent(rm0)?null:m.c,m.st,log,`${nm(es)} 的後備 ${CHARS[m.c].n}`,true));const lost=recordHpLoss(m.c,m.st,cur,rres[es][k]);rres[es][k]=protectLife(m.st.sealT>0?'_':m.c,m.st,rres[es][k],`${nm(es)} 的後備 ${CHARS[m.c].n}`,log);addDamageFx(damage,rm0,es,cur-rres[es][k],k);dealt+=lost;log.push(`${nm(es)} 的後備 ${CHARS[m.c].n} 受到${tag||'群體攻擊'} ${v} 點傷害`+(rres[es][k]<=0?'，倒下！':''))}}
    const combatStart=combat.length;addCombatDamage(combat,rm0,by,damage,fxStart,kind,beforeShield);
    environmentThorns(rm0,by,damage.slice(fxStart),log,damage,arr,st);
    loseValorantGun(m.c,m.st,redirected?sh:dealt,kind,log,`${nm(es)} 的後備 ${CHARS[m.c].n}`);
    if(dealt<=0)return 0;
    if(by!==undefined&&by!==null){hits.push(by);cpAdd(by,15);cpAdd(es,10)}
    if(by!==undefined&&rm.chars[by]==='zilu'){m.st.rupture=(m.st.rupture||0)+1;log.push(`${nm(es)} 的後備 ${CHARS[m.c].n} 獲得1層破裂（共${m.st.rupture}層）`)}if(by!==undefined&&rm.chars[by]==='rufo'&&(st[by].rufoWolf||0)>0){m.st.rufoBleed=(m.st.rufoBleed||0)+1;log.push(`${nm(es)} 的後備 ${CHARS[m.c].n} 獲得1層流血（共${m.st.rufoBleed}層）`)}if(by!==undefined&&rm.chars[by]==='verg'&&st[by].vergSword&&P[by]&&'SC'.includes(P[by].s)){const n=Math.ceil(P[by].r*.3);m.st.burn=(m.st.burn||0)+n;log.push(`${nm(es)} 的後備 ${CHARS[m.c].n} 被【超高溫羅馬短劍】附加 ${n} 層炎傷（共${m.st.burn}）`)}
    teaHit(by,es,kind,dealt);kiraHit(arr,by,es,dealt,m.st);kiraRelayDamage(combat.slice(combatStart));fingerHit(m.c,m.st,es,by,redirected?sh:dealt,kind,arr,true,(rres[es]?.[k]??m.hp)>0,k);return dealt};
  const take=(arr,i,v,by,fm,kind,blackRank)=>{
    const dealt=takeOne(arr,i,v,by,fm,kind,blackRank);
    if(v>0&&by!==undefined&&by!==null&&by!==i&&rm.chars[by]==='heathcliff'&&st[by].dullahan&&enemies(by).includes(i)){
      enemies(by).forEach(es=>{
        if((es!==i||extra?.wardenCandleTargets?.[by])&&arr[es]>0){const n=takeBody(arr,es,v,by,fm,kind,blackRank);if(n>0)got[es]=by;log.push(`${nm(by)} 的【杜拉罕】群體攻擊 ${nm(es)}：${v} 點（實際${n}）`)}
        if(tcl)tcl[es].forEach((m,k)=>{if(es===i&&k===xichnPrimary[i])return;hitRes(es,k,v,fm,'杜拉罕群體攻擊',kind==='spade'?'S':undefined,by,kind,arr,blackRank)});
      });
      hitAllCandles(by,v,kind,fm,extra?.wardenCandleTargets?.[by]);
    }
    return dealt;
  };
  const playedBlackRank=i=>rm.chars[i]==='lucio'?P[i].base:+submittedMv[i].slice(1);
  const groupRes=(a,v0,fm,arr=hp)=>{if(!rm.team)return;const kind=a.s==='S'?'spade':'club',blackRank=playedBlackRank(a.i),target=extra?.wardenCandleTargets?.[a.i];enemies(a.i).forEach(es=>{if((es!==a.o||target)&&arr[es]>0)takeBody(arr,es,v0,a.i,fm,kind,blackRank);tcl[es].forEach((m,k)=>{if(es===a.o&&k===xichnPrimary[a.o])return;hitRes(es,k,v0,fm,'群體攻擊',a.s,a.i,kind,arr,blackRank)})});hitAllCandles(a.i,v0,kind,fm,target)};
  const slay=(t,by,profile)=>{if(t===1&&extra?.wardenCandleTargets?.[by])return candleHit(by,wardenCandle(rm)(extra.wardenCandleTargets[by])?.hp||0,'slay')>0;
    if(rm.cfg.warden&&t===1){const v=wardenSlayDamage(rm),dealt=takeOne(hp,t,v,by,undefined,'fixed',undefined,profile);log.push(`${nm(t)} 受到斬殺，改為承受基礎設定生命×1.2＝${v}點固定傷害（實際${dealt}）`);return false}
    registerXichnExit(t);if(xichnExits[t]){const x=xichnExits[t],k=x.to,m=tcl[t][k],before=rres[t]?.[k]??m.hp;if(before<=0)return false;
    if(m.c==='verg'||m.c==='jia_qiu'){hitRes(t,k,envAttack(rm,m.c==='verg'?rm.cfg.hp:characterMaxHp(rm0,t,m.c,m.st)),undefined,'斬殺轉為傷害',undefined,by,'skill');return false}
    if(m.st.wall>0){m.st.wall--;log.push(`${nm(t)} 的接替角色大地之牆抵擋斬殺`);return false}
    const start=damage.length,n=nut[t];if(n?.hp>0){addDamageFx(damage,rm0,t,n.hp,n.k);n.hp=0}else{rres[t]=rres[t]||{};rres[t][k]=wardenGeburaLife(m.st,0,`${nm(t)} 的接替角色 ${CHARS[m.c].n}`,log);recordHpLoss(m.c,m.st,before,rres[t][k]);addDamageFx(damage,rm0,t,before-rres[t][k],k);if(rres[t][k]<=0){spk[t]=1;x.slain=true}}
    const combatStart=combat.length;addCombatDamage(combat,rm0,by,damage,start);if(profile)combat.slice(combatStart).forEach(e=>e.sourceMember=profile.member);environmentThorns(rm0,by,damage.slice(start),log,damage,hp,st);kiraHit(hp,by,t,damage.slice(start).reduce((n,e)=>n+e.amount,0),m.st,profile);kiraRelayDamage(combat.slice(combatStart));return !!x.slain;
  }if(rm.chars[t]==='verg'){log.push(`${nm(t)} 受到斬殺效果，改為承受基礎生命值傷害（【超高溫羅馬短劍】常駐）`);const dealt=profile?takeOne(hp,t,envAttack(rm,rm.cfg.hp),by,undefined,undefined,undefined,profile):take(hp,t,envAttack(rm,rm.cfg.hp),by);if(dealt>0)log.push(`${nm(t)} 受到斬殺效果，承受基礎生命值 ${rm.cfg.hp} 點傷害`);return false}if(rm.chars[t]==='jia_qiu'){const dealt=profile?takeOne(hp,t,envAttack(rm,mx(t)),by,undefined,undefined,undefined,profile):take(hp,t,envAttack(rm,mx(t)),by);if(dealt>0)log.push(`${nm(t)} 受到斬殺效果，改為承受最大生命值傷害`);return false}if((st[t].wall||0)>0){st[t].wall--;log.push(`${nm(t)} 的大地之牆抵擋了斬殺`);return false}
const fxStart=damage.length,combatStart=combat.length,n=nut[t];const finish=()=>{const events=combat.slice(combatStart);if(profile)events.forEach(e=>e.sourceMember=profile.member);kiraHit(hp,by,t,events.reduce((n,e)=>n+e.amount,0),st[t],profile);kiraRelayDamage(events)};if(n&&n.hp>0){addDamageFx(damage,rm0,t,n.hp,n.k);addCombatDamage(combat,rm0,by,damage,fxStart);environmentThorns(rm0,by,damage.slice(fxStart),log,damage,hp,st);n.hp=0;log.push(`${nm(t)} 受到的斬殺由高堅果承受，高堅果倒下！`);finish();return false}const before=hp[t];hp[t]=wardenGeburaLife(st[t],0,nm(t),log);recordHpLoss(rm0.chars[t],st[t],before,hp[t]);addDamageFx(damage,rm0,t,before-hp[t]);addCombatDamage(combat,rm0,by,damage,fxStart);environmentThorns(rm0,by,damage.slice(fxStart),log,damage,hp,st);if(hp[t]<=0)spk[t]=1;finish();return hp[t]<=0};
  const ls=(a,v,arr)=>{if(!(arr[a.i]>0))return;if(healingBlocked(st[a.i])){log.push(`${nm(a.i)} 的吸血無效（超深度創傷：永久禁療）`);return}let amt=Math.max(1,Math.ceil(v*0.3));if(boost[a.i]&&a.s==='S')amt*=boost[a.i]===2?3:2;
    amt=envHeal(rm,amt);const g=healedHp(arr[a.i],mx(a.i),amt,rm.chars[a.i],st[a.i],log,nm(a.i))-arr[a.i];if(g<=0)return;arr[a.i]+=g;recordHeal(a.i,g,a.i,'drain',arr);if(!lock[a.i]){const add=st[a.i].feastBoost?Math.round(g*1.5):g;st[a.i].feast+=add}log.push(`${nm(a.i)} 吸血 +${g}`)};
  if(Number.isInteger(extra?.drunkSlash)){
    const a=extra.drunkSlash,group=!!extra.drunkGroup,target=rm.pair.find(j=>j!==a&&enemies(a).includes(j)&&hp[j]>0)??enemies(a).find(j=>hp[j]>0);
    if(rm.chars[a]!=='drunk'||hp[a]<=0||!group&&st[a].drunkSip<10)return {...rm0,instantResult:{log:['小酌需達10層。'],hits:[],damage:[],combat:[],healing:[],soundCues:[]}};
    const b=calcBuffs('drunk',st[a]),raw=group?(st[a].drunkSip||0)*2*(environmentMembers({...rm0,hp,st,team:tcl}).filter(m=>enemies(a).includes(m.i)).length+enemyCandles(a).length<=1?2:1):1,targets=group?enemies(a):target===undefined?[]:[target],v=raw>0?dm(a,Math.max(0,Math.floor(raw*prevMult('drunk',st[a],'S')+1e-9)+b.strong-b.weak)):0;
    for(let n=0;n<(group?1:10);n++){targets.forEach(es=>{if(hp[es]>0)(group?takeBody:take)(hp,es,v,a,undefined,'drunkSlash');if(group&&tcl)tcl[es].forEach((m,k)=>hitRes(es,k,v,undefined,'真•真鎮終斬',undefined,a,'drunkSlash'))});if(group)hitAllCandles(a,v,'drunkSlash');guard()}
    log.push(`${nm(a)} 發動【${group?'真•真鎮終斬':'真鎮終斬'}】（${group?'小酌×2群體傷害':'基礎1點連擊10次'}），不消耗小酌。`);
    const state=settleResolved({instant:true}),next={...rm0,...state,hands:{...rm0.hands},up:{...rm0.up}};Object.assign(next,syncDrunkHands(next));targets.forEach(es=>removeDrunkDarkSlot(next,es,log));settleInstantBattle(next,log,true);
    return {...next,instantResult:{log,hits:[...new Set(hits)],damage,combat,healing,soundCues,charactersSettled:true}};
  }
  if(Array.isArray(extra?.wardenEvidenceTick)){extra.wardenEvidenceTick.forEach(({seat,amount})=>{if(hp[seat]>0)takeBody(hp,seat,amount,undefined,undefined,'fixed')});guard();const state=settleResolved({instant:true}),next={...rm0,...state};settleInstantBattle(next,log,true);return {...next,instantResult:{log,hits:[...new Set(hits)],damage,combat,healing,soundCues,charactersSettled:true}}}
  if(Number.isInteger(extra?.xichnEntry)||Number.isInteger(extra?.xichnUltimate)){
    const entry=Number.isInteger(extra.xichnEntry),a=entry?extra.xichnEntry:extra.xichnUltimate,target=rm.pair.find(j=>j!==a&&enemies(a).includes(j)&&hp[j]>0)??enemies(a).find(j=>hp[j]>0);
    if(rm.chars[a]!=='xichn'||hp[a]<=0)return {...rm0,instantResult:{log:[],damage:[],combat:[],healing:[],hits:[]}};
    const waits=st[a].xichnWait||0,group=entry&&waits>=5,base=entry?Math.min(3,waits):15,b=calcBuffs('xichn',st[a]);if(entry)st[a].xichnWait=0;
    const raw=base*(group&&!enemyGroup(a)?2:1),v=entry?raw:base>0?dm(a,Math.max(0,Math.floor(raw*prevMult('xichn',st[a],'S')+1e-9)+b.strong-b.weak)):0;
    const targets=group?enemies(a):target===undefined?[]:[target];targets.forEach(es=>{if(hp[es]>0)(group?takeBody:take)(hp,es,v,a,undefined,entry?'fixed':'ultimate');if(group&&tcl)tcl[es].forEach((m,k)=>hitRes(es,k,v,undefined,'始動',undefined,a,'fixed'));if(!entry&&hp[es]>0)st[es].paralysis=Math.max(st[es].paralysis||0,1)});if(group)hitAllCandles(a,v,'fixed');
    if(hits.includes(a))soundCues.push({seat:a,file:'assets/audio/sfx/characters/attack_xichun.mp3',replaceAttack:true});
    log.push(`${nm(a)} 發動【${entry?'始動':'醉睡浪浪春'}】${entry?`，消耗${waits}層待，一次固定${raw}點${group?'群體':''}單方面攻擊`:'，目前對手受到基礎15點傷害並獲得1回合麻痺'}。`);
    guard();const state=settleResolved({instant:true}),next={...rm0,...state};settleInstantBattle(next,log,true);return {...next,instantResult:{log,hits:[...new Set(hits)],damage,combat,healing,soundCues,charactersSettled:true}};
  }
  if(['kiraDad','kiraViolet','kiraSacrifice'].some(key=>Number.isInteger(extra?.[key]))){
    const key=['kiraDad','kiraViolet','kiraSacrifice'].find(key=>Number.isInteger(extra?.[key])),a=extra[key],empty=message=>({...rm0,instantResult:{log:[message],hits:[],damage:[],combat:[],healing:[],soundCues:[]}});
    if(rm.chars[a]!=='kira'||!(hp[a]>0)||!rm.pair.includes(a))return empty('綺羅需存活且正在出戰才可發動。');
    if(key==='kiraDad'&&!(st[a].kiraDadUses>0))return empty('老爸技能尚未取得使用資格。');
    const target=rm.pair.find(j=>j!==a&&enemies(a).includes(j)&&hp[j]>0);if(target===undefined)return empty('沒有目前對戰的存活對手。');
    const forcedSwaps={},relays=JSON.parse(JSON.stringify(rm0.kiraRelays||[])),noPlay={...(rm0.kiraNoPlay||{})};
    if(key==='kiraSacrifice'){
      const member=kiraMatMember(fingerRoom(hp),a);if(!member)return empty('隊伍需有存活馬蒂亞斯才可發動此技能。');
      const matSt=member.k<0?st[a]:tcl[a][member.k].st,heat=st[a].kiraHeat||0;matSt.asuraStrong=(matSt.asuraStrong||0)+1+heat;matSt.wrap=0;
      const profile=member.k<0?null:{c:'mat',s:matSt,member:member.k};slay(target,a,profile);(st[target].fingerRevenge||{})[middleFingerSide(rm0,a)]=0;slay(a,a,profile);
      log.push(`${nm(a)} 發動【嗚哇...好像超不妙的？】，馬蒂亞斯以【萊萬汀】同時斬殺綺羅與目前對手，永久強壯+${1+heat}。`);
    }else{
      const total=key==='kiraViolet'?fingerRevengeTotal(fingerRoom(hp)):0,base=key==='kiraDad'?5:total*6,b=calcBuffs(rm.chars[a],st[a]),v=key==='kiraDad'?5:base>0?dm(a,Math.max(0,Math.floor(base*prevMult(rm.chars[a],st[a],'S')+1e-9)+b.strong-b.weak)):0;
      if(key==='kiraDad')st[a].kiraDadUses--;
      soundCues.push({seat:a,file:kiraSoundFile(key==='kiraDad'?4:3),replaceAttack:true});const dealt=takeOne(hp,target,v,a,undefined,key==='kiraDad'?'kiraFixed':'skill');
      log.push(`${nm(a)} 發動【${key==='kiraDad'?'這樣做就可以了吧，老爸':'紫羅蘭破壞猛擊'}】，${key==='kiraDad'?'固定5點':`復仇對象總和${total}×6＝${base}點基礎`}傷害（實際${dealt}）。`);
      if(key==='kiraDad'&&tcl){const choices=tcl[a].map((m,k)=>({m,k})).filter(({m,k})=>k!==rm.act[a]&&isMiddleFinger(m.c)&&canDeploy(m.c)&&!m.dead&&(rres[a]?.[k]??m.hp)>0);if(choices.length){const pick=rnd(choices);forcedSwaps[a]=pick.k;noPlay[target]=rm0.round;relays.push({round:rm0.round,seat:a,member:pick.k,kira:rm.act[a]});log.push(`${nm(target)} 本回合無法出牌；綺羅換上${CHARS[pick.m.c].n}，該成員本回合造成的傷害會等量反傷綺羅。`)}}
    }
    guard();const state=settleResolved({hp,st,cp,team:tcl,rres,nut,spk,autoZilu,forcedSwaps,log,passChars:rm.chars,instant:true}),next={...rm0,...state,kiraRelays:relays,kiraNoPlay:noPlay};settleInstantBattle(next,log,true);normalizeFingerRevenge(next);
    return {...next,instantResult:{log,hits:[...new Set(hits)],damage,combat,healing,soundCues,charactersSettled:true}};
  }
  if(Number.isInteger(extra?.teaflowerSpring)){
    const a=extra.teaflowerSpring,target=battleOpponent(rm,a),marks=[...teaBlooms(rm,target)],n=marks.length;
    if(rm.chars[a]!=='teaflower'||envSilent(rm)||st[a].sealT>0||!rm.pair.includes(a)||!(hp[a]>0)||!n)return {...rm0,instantResult:{log:['春風爛漫目前無法發動。'],hits:[],damage:[],combat:[],healing:[],soundCues:[]}};
    const ranks=marks.map(m=>+(rm.teaflower.cards[target].find(c=>c.id===m.id)?.card||m.card).slice(1));rm.teaflower.blooms[target]=[];
    st[target].fx.push({k:'w',n:2,t:1,source:'teaflower',round:rm.round});if(n>=2)st[target].fx.push({k:'v',n:2,t:1,source:'teaflower',round:rm.round});
    if(n>=5){st[target].teaBloomRound=rm.round;st[target].teaBloomSafe=1;st[target].teaSkipRound=1}
    const base=n>=3?(st[a].teaFragrance?ranks.reduce((x,y)=>x+y,0):n===3?Math.min(...ranks)+2:n===4?Math.max(...ranks)+5:5):0;
    const dealt=base?takeBody(hp,target,base,a,undefined,'teaSpring'):0;
    log.push(`${nm(a)} 發動【春風爛漫】，引爆${n}層〔開花〕：本回合虛弱2${n>=2?'、易損2':''}${base?'，固定傷害'+base+'（實際'+dealt+'）':''}${n>=5?'，〔盛放〕空過且保留至少1血':''}`);
    guard();const state=settleResolved({instant:true}),next={...rm0,...state};settleInstantBattle(next,log,true);
    return {...next,instantResult:{log,hits:[...new Set(hits)],damage,combat,healing,soundCues,charactersSettled:true}};
  }
  if(Number.isInteger(extra?.spiderUltimate)){
    const a=extra.spiderUltimate,eye=st[a].spiderEye||0,penitence=st[a].spiderPenitence||0,base=Math.floor((eye+penitence)*.33+1e-9),before=spiderArt(st[a]);
    const spentEye=spendSpider(st[a],'spiderEye',eye),spentPenitence=spendSpider(st[a],'spiderPenitence',penitence);
    soundCues.push({seat:a,file:spiderSoundFile(4),replaceAttack:true});if(before!==spiderArt(st[a]))soundCues.push({seat:a,file:spiderSoundFile(2)});
    const b=calcBuffs(rm.chars[a],st[a]),v=base>0?dm(a,Math.max(0,Math.floor(base*prevMult(rm.chars[a],st[a],'S')+1e-9)+b.strong-b.weak)):0;
    enemies(a).forEach(j=>{if(hp[j]>0)takeBody(hp,j,v,a,undefined,'ultimate')});
    log.push(`${nm(a)} 發動【動真格地碎顱】，消耗赤曈${eye}層＋懺悔${penitence}層，場上敵方出戰單位各受到基礎${base}點傷害；蛛•頭返還${spentEye.refund}層，骷•頭返還${spentPenitence.refund}層。`);
    guard();const state=settleResolved({hp,st,cp,team:tcl,rres,nut,spk,autoZilu,log,passChars:rm.chars,instant:true}),next={...rm0,...state};settleInstantBattle(next,log,true);
    return {...next,instantResult:{log,hits:[...new Set(hits)],damage,combat,healing,soundCues,charactersSettled:true}};
  }
  if(Number.isInteger(extra?.lkdHaircut)||Number.isInteger(extra?.lkdExecution)){
    const haircut=Number.isInteger(extra.lkdHaircut),a=haircut?extra.lkdHaircut:extra.lkdExecution;
    if(haircut&&!(st[a].lkdHaircuts>0))return {...rm0,instantResult:{log:['理髮卷尚未取得使用資格。'],hits:[],damage:[],combat:[],healing:[],soundCues:[]}};
    const targets=enemies(a).filter(j=>hp[j]>0),target=rm.pair.find(j=>j!==a&&targets.includes(j))??targets[0];
    if(haircut){st[a].lkdHaircuts--;soundCues.push({seat:a,file:lkdSoundFile(3),replaceAttack:true});if(target!==undefined){const n=take(hp,target,10,a,undefined,'fixed');log.push(`${nm(a)} 發動【我的理髮卷！！！！！！！】，對 ${nm(target)} 造成10點固定傷害（實際${n}）`)}}
    else{const b=calcBuffs(rm.chars[a],st[a]),v=dm(a,Math.max(0,Math.floor(15*prevMult(rm.chars[a],st[a],'S')+1e-9)+b.strong-b.weak));enemies(a).forEach(es=>{if(hp[es]>0)takeBody(hp,es,v,a,undefined,'ultimate');if(tcl)tcl[es].forEach((m,k)=>hitRes(es,k,v,undefined,'全員處刑',undefined,a,'ultimate'))});hitAllCandles(a,v,'ultimate');log.push(`${nm(a)} 發動【全員處刑】，所有存活敵人含後備各受到基礎15點傷害。`)}
    guard();const state=settleResolved({hp,st,cp,team:tcl,rres,nut,spk,autoZilu,log,passChars:rm.chars,instant:true}),next={...rm0,...state};settleInstantBattle(next,log,true);normalizeFingerRevenge(next);
    return {...next,instantResult:{log,hits:[...new Set(hits)],damage,combat,healing,soundCues,charactersSettled:true}};
  }
  if(Number.isInteger(extra?.lucioUltimate)){
    const a=extra.lucioUltimate;st[a].lucio25=1;let count=0;
    const strike=(es,k,s0)=>{const stacks=s0.duelClimax||0;if(!stacks)return;const base=4*stacks,dealt=k===undefined?take(hp,es,base,a,undefined,'skill'):hitRes(es,k,base,undefined,'解鹿',undefined,a,'skill');count++;log.push(`${nm(es)}${k===undefined?'':` 的後備 ${CHARS[tcl[es][k].c].n}`} 受到【解鹿】：4×${stacks}＝${base}點基礎傷害（實際${dealt}）`)};
    // 基礎傷害不走攻擊方威力／環境加成；take及hitRes保留受擊方防護。
    enemies(a).forEach(es=>{if(hp[es]>0)strike(es,undefined,st[es]);if(tcl)tcl[es].forEach((m,k)=>{if(k!==rm.act[es]&&!m.dead&&m.hp>0&&m.c!=='nut')strike(es,k,m.st)});if(tcl&&nut[es]?.hp>0)strike(es,nut[es].k,tcl[es][nut[es].k].st)});
    if(!count)log.push('【解鹿】沒有帶有決鬥高潮的存活敵人');
    guard();const state=settleResolved({hp,st,cp,team:tcl,rres,nut,spk,autoZilu,log,passChars:rm.chars,instant:true}),next={...rm0,...state};
    settleInstantBattle(next,log,true);return{...next,instantResult:{log,hits:[...new Set(hits)],damage,combat,healing,charactersSettled:true}};
  }
  if(Number.isInteger(extra?.sadUltimate)){
    const a=extra.sadUltimate,target=rm.pair.find(j=>j!==a&&enemies(a).includes(j)&&hp[j]>0)??enemies(a).find(j=>hp[j]>0),used=st[a].sadCounters||0;
    if(target!==undefined){const held=(rm.hands[target]||[]).filter(c=>c[0]==='D').length+(hostSunCards[target]||[]).filter(c=>c.expires>=rm.round&&c.card[0]==='D').length,base=(used+held)*3,v=dm(a,base),dealt=take(hp,target,v,a);if(dealt>0)got[target]=a;log.push(`${nm(a)} 發動【阿卡納裂淚穿刺】：已出方塊${used}張＋對手手牌方塊${held}張，基礎傷害（${used}＋${held}）×3＝${base}，實際${dealt}`)}
    else log.push('【阿卡納裂淚穿刺】沒有存活的敵方目標');
    guard();const state=settleResolved({hp,st,cp,team:tcl,rres,nut,spk,autoZilu,log,passChars:rm.chars,instant:true}),next={...rm0,...state};
    settleInstantBattle(next,log,true);return{...next,instantResult:{log,hits:[...new Set(hits)],damage,combat,healing,charactersSettled:true}};
  }
  if(Number.isInteger(extra?.tktUltimate)){
    const a=extra.tktUltimate,target=rm.pair.find(j=>j!==a&&enemies(a).includes(j)&&hp[j]>0)??enemies(a).find(j=>hp[j]>0),n=Math.max(1,rm.round-(rm.roundBase||1)+1);
    if(target!==undefined){const dealt=take(hp,target,n,a,undefined,'fixed');log.push(`${nm(a)} 發動【時間殺人魔】：第${n}回合，對 ${nm(target)} 造成${n}點固定傷害（實際${dealt}）`)}else log.push('【時間殺人魔】沒有存活的敵方目標');
    guard();const state=settleResolved({hp,st,cp,team:tcl,rres,nut,spk,autoZilu,log,passChars:rm.chars,instant:true}),next={...rm0,...state};
    settleInstantBattle(next,log,true);return{...next,instantResult:{log,hits:[...new Set(hits)],damage,combat,healing,charactersSettled:true}};
  }
  if(Number.isInteger(extra?.firefuUltimate)){
    const a=extra.firefuUltimate;st[a].firefu25=1;log.push('【最大感應-[劣化侵蝕]】全體存活角色含自己及後備，逐一結算基礎20點傷害。');
    rm.seats.forEach((_,i)=>{if(hp[i]>0)take(hp,i,20,a,undefined,'skill');
      if(tcl)tcl[i].forEach((m,k)=>{if(k!==rm.act[i]&&!m.dead&&m.hp>0&&m.c!=='nut')hitRes(i,k,20,undefined,'最大感應-[劣化侵蝕]',undefined,a,'skill')});
      if(nut[i]?.hp>0)hitRes(i,nut[i].k,20,undefined,'最大感應-[劣化侵蝕]',undefined,a,'skill');
    });guard();const state=settleResolved({hp,st,cp,team:tcl,rres,nut,spk,autoZilu,log,passChars:rm.chars,instant:true}),next={...rm0,...state};
    settleInstantBattle(next,log,true);return{...next,instantResult:{log,hits:[...new Set(hits)],damage,combat,healing,charactersSettled:true}};
  }
  if(Array.isArray(extra?.timeExpired)){
    extra.timeExpired.forEach(i=>{if(!rm.pair.includes(i)||!(hp[i]>0))return;const before=hp[i];hp[i]=0;spk[i]=1;recordHpLoss(rm0.chars[i],st[i],before,0);addDamageFx(damage,rm0,i,before);log.push(`⌛【閉嘴，時間由我分配】${nm(i)} 未在5秒內出牌，出戰角色直接死亡！`)});
    const state=settleResolved({hp,st,cp,team:tcl,rres,nut,spk,autoZilu,log,passChars:rm.chars,instant:true}),next={...rm0,...state};
    settleInstantBattle(next,log,true);return{...next,instantResult:{log,hits:[],damage,combat:[],healing:[],charactersSettled:true}};
  }
  if(extra?.environmentDamage){
    const n=extra.environmentDamage;log.push(`☀️【烈日】全場存活角色（含後備）受到${n}點固定環境傷害。`);
    rm.seats.forEach((_,i)=>{if(hp[i]>0){take(hp,i,n,undefined,undefined,'fixed');log.push(`${nm(i)} 的出戰角色受到烈日傷害`)}
      if(tcl)tcl[i].forEach((m,k)=>{if(k===rm.act[i]||m.dead||m.hp<=0||m.c==='nut')return;hitRes(i,k,n,undefined,'烈日',undefined,undefined,'fixed')});
      // 高堅果先承受隊友傷害，再承受自身的一次烈日，避免重複扣同一角色。
      if(nut[i]&&nut[i].hp>0){hitRes(i,nut[i].k,n,undefined,'烈日',undefined,undefined,'fixed')}
    });guard();
    const state=settleResolved({hp,st,cp,team:tcl,rres,nut,spk,autoZilu,log,passChars:rm.chars,instant:true}),next={...rm0,...state};
    settleInstantBattle(next,log,true);return{...next,instantResult:{log,hits:[],damage,combat,healing,charactersSettled:true}};
  }
  if(extra&&extra.heathcliffUltimate!==undefined){
    const a=extra.heathcliffUltimate,coffins=st[a].coffin||0,target=rm.pair.find(j=>j!==a&&enemies(a).includes(j)&&hp[j]>0)??enemies(a).find(j=>hp[j]>0);
    st[a].coffin=0;log.push(`${nm(a)} 消耗所有${coffins}層棺，單體基礎傷害${coffins}×4＝${coffins*4}`);
    if(target!==undefined){const v=dm(a,coffins*4),dealt=take(hp,target,v,a);if(dealt>0)got[target]=a;log.push(`對 ${nm(target)} 造成${v}點傷害（實際${dealt}）`);guard()}
    else log.push('沒有存活的敵方目標');
    const state=settleResolved({hp,st,cp,team:tcl,rres,nut,spk,autoZilu,log,passChars:rm.chars,instant:true}),next={...rm0,...state};
    settleInstantBattle(next,log,true);return{...next,instantResult:{log,hits:[...new Set(hits)],damage,combat,healing,charactersSettled:true}};
  }
  if(extra&&extra.yisangUltimate!==undefined){
    const a=extra.yisangUltimate;log.push('【強制平等】對全體存活敵人（含後備）造成基礎3點傷害，逐一結算威力、減傷、護盾及毅力。');
    enemies(a).forEach(es=>{if(hp[es]>0){const raw=dm(a,3),dealt=take(hp,es,raw,a);if(dealt>0)got[es]=a;log.push(`對 ${nm(es)} 造成${raw}點傷害（實際${dealt}）`)}
      if(tcl)tcl[es].forEach((m,k)=>{if(k===rm.act[es]||m.dead||m.c==='nut')return;const cur=rres[es]?.[k]??m.hp;if(cur>0)hitRes(es,k,dm(a,3),undefined,'強制平等',undefined,a)});
      if(tcl&&nut[es]?.hp>0)hitRes(es,nut[es].k,dm(a,3),undefined,'強制平等',undefined,a);
    });guard();
    const state=settleResolved({hp,st,cp,team:tcl,rres,nut,spk,autoZilu,log,passChars:rm.chars,instant:true}),next={...rm0,...state};
    settleInstantBattle(next,log,true);return{...next,instantResult:{log,hits:[...new Set(hits)],damage,combat,healing,charactersSettled:true}};
  }
  if(extra&&(extra.leiUltimate!==undefined||extra.vergUltimate!==undefined)){
    const fixed=extra.leiUltimate!==undefined,a=fixed?extra.leiUltimate:extra.vergUltimate,count=fixed?6:5,label=fixed?'超絕猛虎殺擊亂斬':'為死去的血魔哀悼',roll=()=>fixed?rnd([1,2,3]):dm(a,2),kind=fixed?'fixed':undefined;
    log.push(fixed?'【超絕猛虎殺擊亂斬】對全場敵人（含後備）分六次結算；每擊隨機1～3點固定傷害。':'【為死去的血魔哀悼】對全場敵人（含後備）分五次結算；每擊基礎2點，逐擊結算威力、減傷及護盾。');
    for(let hit=1;hit<=count;hit++){
      enemies(a).forEach(es=>{
        if(hp[es]>0){const raw=roll(),dealt=take(hp,es,raw,a,undefined,kind);if(dealt>0)got[es]=a;log.push(`　第${hit}擊 → ${nm(es)}（${CHARS[rm0.chars[es]]?.n||'角色'}）：${fixed?'固定':''}${raw}，實際傷害${dealt}`);guard()}
        if(tcl)tcl[es].forEach((m,k)=>{if(k===rm.act[es]||k===xichnPrimary[es]||m.dead)return;const cur=m.c==='nut'?(nut[es]?.hp||0):(rres[es]?.[k]??m.hp);if(cur<=0)return;const raw=roll(),dealt=hitRes(es,k,raw,undefined,label,undefined,a,kind);log.push(`　第${hit}擊 → ${nm(es)} 的後備 ${CHARS[m.c].n}：${fixed?'固定':''}${raw}，實際傷害${dealt}`)})
      });
    }
    const state=settleResolved({hp,st,cp,team:tcl,rres,nut,spk,autoZilu,log,passChars:rm.chars,instant:true}),next={...rm0,...state};
    settleInstantBattle(next,log,true);
    return{...next,instantResult:{log,hits:[...new Set(hits)],damage,combat,healing,charactersSettled:true}};
  }
  if(wardenFinalPriest(rm0)&&extra?.wardenLeg)rm.pair.forEach(i=>{const e=wardenMaintenance(st[i]);if(i!==1&&e.kind==='Breakpoint'&&e.n&&'SC'.includes(submittedMv[i]?.[0])&&!(extra.wardenExecution||extra.wardenShiftDelete)){const dealt=takeBody(hp,i,e.n*2,undefined,undefined,'fixed');log.push(`【釘-Breakpoint】${nm(i)} 出黑牌，受到${e.n*2}點固定傷害（實際${dealt}）`);guard0();if(hp[i]<=0){mv[i]=null;sk={...sk,[i]:false}}}});
  rm.pair.forEach(i=>{if(!mv[i])return;const card=lucioCard(rm.chars[i],st[i],mv[i]);if(card!==mv[i]){log.push(`${nm(i)} 的教材${st[i].lucioLesson}使${cs(mv[i])}基礎點數轉換為${lucioBase(st[i],mv[i])}`);mv[i]=card}});
  if(envActive(rm,'confusion'))rm.pair.forEach(i=>{if(mv[i]){const original=mv[i];mv[i]=rnd(['S','H','C','D'])+mv[i].slice(1);
    if(rm.st[i].cmd===original){rm.st[i].cmd=mv[i];st[i].cmd=mv[i]}
    rm.st.forEach((s,j)=>{if(s.markTarget===i){s.markedCards=(s.markedCards||[]).map(c=>c===original?mv[i]:c);st[j].markedCards=[...s.markedCards]}});
    log.push(`❔【混亂】${nm(i)} 的${cs(submittedMv[i])} 在結算時變為${cs(mv[i])}`)}});
  if(envActive(rm,'invertedStage')&&rm.pair.every(i=>mv[i])){const [a,b]=rm.pair,ca=mv[a],cb=mv[b];mv[a]=cb[0]+ca.slice(1);mv[b]=ca[0]+cb.slice(1);
    rm.pair.forEach(i=>{if(rm.st[i].cmd===submittedMv[i]){rm.st[i].cmd=mv[i];st[i].cmd=mv[i]}rm.st.forEach((s,j)=>{if(s.markTarget===i){s.markedCards=(s.markedCards||[]).map(c=>c===submittedMv[i]?mv[i]:c);st[j].markedCards=[...s.markedCards]}})});
    log.push(`🔀【倒錯舞台】雙方交換花色：${nm(a)} ${cs(mv[a])}；${nm(b)} ${cs(mv[b])}`)}
  if(envActive(rm,'invertedStage')&&rm.pair.every(i=>mv[i]))cueEnvironment('invertedStage','impact',rm.pair,'雙方花色交換');
  rm.pair.forEach(i=>{if(mv[i]&&sk?.[i]&&teaClubAvailable(rm,i)){mv[i]='C'+mv[i].slice(1);st[i].teaClubCd=1;st[i].teaClubUsedRound=rm.round;log.push(`${nm(i)} 發動【綻放E.G.O::山茶花】，本張牌轉為同點數梅花`)}});
  rm.pair.forEach(i=>{const c=mv[i];if(!c){P[i]={i,s:'N',r:0,none:1,o:rm.pair.find(x=>x!==i)};return}const raw=+c.slice(1),rg=rm.chars[i]==='umb'&&rm.st[i].rage>0;
    P[i]={i,s:c[0],base:raw,r:effRank(rm.chars[i],st[i],c),o:rm.pair.find(x=>x!==i)};if((extra?.wardenPunishment||extra?.wardenExecution||extra?.wardenShiftDelete)&&i!==1){P[i].s='N';P[i].v=true;P[i].none=1;return}if(st[i].wardenException){P[i].s='N';P[i].r=0;P[i].none=1;return}if(facOk(i)&&sanAtStart(i)<=-45){P[i].corrosion=true;P[i].corrodeBlack='SC'.includes(P[i].s)&&Math.random()<.7;P[i].corrodeDiamond=P[i].s==='D'&&Math.random()<.7;P[i].corrodeHeart=P[i].s==='H'&&Math.random()<.7;if(P[i].corrodeBlack){P[i].v=1;log.push(`${nm(i)} 侵蝕：黑牌反噬，將攻擊自己`)}if(P[i].s==='D')log.push(`${nm(i)} 侵蝕：方塊${P[i].corrodeDiamond?'失效':'正常生效'}`);if(P[i].s==='H'&&P[i].corrodeHeart)log.push(`${nm(i)} 侵蝕：紅心治療轉而治療敵人`)}
    if(rm.chars[i]==='spider'){const key=spiderResource(c[0]),n=spiderSpendAmount(st[i],c[0],sk?.[i]?.spiderSpend),before=spiderArt(st[i]);if(n>0){const spent=spendSpider(st[i],key,n);if(key==='spiderEye')P[i].spiderBonus=n/5;else{st[i].shield=(st[i].shield||0)+n/5;st[i].shieldPersistent=(st[i].shieldPersistent||0)+n/5}if(before!==spiderArt(st[i]))soundCues.push({seat:i,file:spiderSoundFile(2)});log.push(`${nm(i)} 消耗${key==='spiderEye'?'赤曈':'懺悔'}${n}層，${key==='spiderEye'?'黑牌點數':'護盾'}+${n/5}${spent.refund?'；頭部返還'+spent.refund+'層':''}`)}}
    if(rm.chars[i]==='bamboo'&&sk&&sk[i]&&bambooCanSkin(st[i],submittedMv[i])&&'SC'.includes(c[0])){P[i].bambooSkin=true;P[i].s='S';log.push(`${nm(i)} 以【捨吾皮肉】打出${cs(submittedMv[i])}：取代原花色功能，命中固定3點傷害`)}
    if(rm.chars[i]==='lei'){const s0=st[i],q=sk&&sk[i]&&typeof sk[i]==='object'?(+sk[i].lei||0):0;let n,mode;
      if((s0.mhu||0)>0){mode='mhu';n=Math.max(1,Math.min(5,s0.mhu,q||1))}else{mode='hu';n=Math.max(0,Math.min(3,s0.hu||0,q))}
      const u=leiU[i]={mode,n,bonus:0,quick:false};
      if(mode==='mhu'){s0.mhu-=n;if(n===5){u.quick=true;u.bonus=8;P[i].s='S';log.push(`${nm(i)} 消耗 5 枚猛虎標彈，發動特殊攻擊【快刀亂麻】：視為♠，點數+8，群體攻擊`)}else{u.bonus=[0,1,3,5,7][n];log.push(`${nm(i)} 消耗 ${n} 枚猛虎標彈，點數 +${u.bonus}`)}
        if(s0.mhu<=0){log.push(`${nm(i)} 的猛虎標彈用盡，不會再裝填標彈`);if(!(s0.fx||[]).some(x=>x.oh))ohNew[i]=1}}
      else{u.bonus=n;if(n>0){s0.hu-=n;log.push(`${nm(i)} 消耗 ${n} 枚虎標彈，點數 +${n}`)}
        if(n>0&&(s0.hu||0)<=0){s0.hu=0;s0.mhu=5;log.push(`${nm(i)} 的虎標彈耗盡，獲得 5 層猛虎標彈`)}}}});
  // 地彗星：出牌後累積順行／逆行；本回合對手出未標記牌時獲得殘像糾纏。
  rm.pair.forEach(i=>{if(rm.chars[i]!=='dihui'||!mv[i]||!P[i]||P[i].none)return;
    if('HD'.includes(mv[i][0])){st[i].shunxing=(st[i].shunxing||0)+1;log.push(`${nm(i)} 使用紅色牌，獲得1層順行－憐憫（共${st[i].shunxing}）`)}
    else if('SC'.includes(mv[i][0])){st[i].nixing=(st[i].nixing||0)+1;log.push(`${nm(i)} 使用黑色牌，獲得1層逆行－憎惡（共${st[i].nixing}）`)}
  });
  rm.pair.forEach(i=>{if(rm.chars[i]!=='dihui')return;const target=st[i].markTarget;
    if(target===undefined||target===null||!rm.pair.includes(target)||!mv[target])return;
    if(!(st[i].markedCards||[]).includes(mv[target])){
      st[i].afterimage=(st[i].afterimage||0)+1;
      log.push(`${nm(target)} 使用未被標記的牌，${nm(i)} 獲得1層殘像糾纏（共${st[i].afterimage}）`);
      if(st[i].afterimageRampage){
        const cardRaw=+mv[target].slice(1)||0;
        const rampDmg=Math.max(1,Math.floor(cardRaw*0.2*(st[i].afterimage||0)));
        const before=hp[target];
        hp[target]=Math.max(0,damagedHp(before,mx(target),rampDmg,rm.chars[target],st[target],log,nm(target)));
        recordHpLoss(rm0.chars[target],st[target],before,hp[target]);
        const thornStart=damage.length;addDamageFx(damage,rm0,target,before-hp[target]);environmentThorns(rm0,i,damage.slice(thornStart),log,damage,hp,st);
        if(hp[target]<=0)spk[target]=1;
        log.push(`【殘像暴走】${nm(target)} 未出標記牌（${cs(mv[target])}），受到點數 ${cardRaw} × (20% × ${st[i].afterimage}層) = ${rampDmg} 點固定傷害（剩餘血量 ${hp[target]}）！`);
        guard();
      }
    }
  });
  const ps=Object.values(P),heal={},healAlive={},isA=p=>aceOn&&p.r===1&&valorantGun(rm.chars[p.i],st[p.i])!==VALORANT_GUNS.odin,handCount=i=>(rm.hands[i]||[]).length+(hostSunCards[i]||[]).length;
  const T=ps.filter(p=>sk&&sk[p.i]&&!st[p.i].wardenGebura&&rm.chars[p.i]==='yoshi'&&handCount(p.i)>=2&&!(rm.st[p.i].yoshiCd>0)),cut={};
  const rep=sk?rm.pair.find(i=>sk[i]&&rm.chars[i]==='rien'&&!mv[i]&&(rm.st[i].grace||0)>=9&&!rm.st[i].repUsed):undefined;
  const artNow={},enhA={},cloneSw={}; // artNow：本回合生效的戰技id；本回合新使用的戰技下回合才生效
  const multOf=(i,suit)=>{let m=1;const atk='SCD'.includes(suit),a=artNow[i];
    if(atk){if(shin(i))m+=st[i].musouShin?.8:.5;(st[i].fx||[]).forEach(x=>{if(x.k==='dm')m+=x.n})}
    if(rm.chars[i]==='rean'){if(a==='karyu')m+=enhA[i]?.7:.5;if(a==='roku'&&enhA[i])m+=.3}
    return Math.max(0,m)};
  const usedArt={}; // 本回合按下的戰技：扣CP後，於本回合結算完畢時（＝下個回合開始、所有玩家出牌前）生效
  rm.pair.forEach(i=>{enhA[i]=shinActive(rm.st[i]);const C0=CHARS[rm.chars[i]];artNow[i]=(C0&&C0.arts&&rm.st[i].artOn)?rm.st[i].art:null;if((extra?.wardenPunishment||extra?.wardenExecution||extra?.wardenShiftDelete)&&i!==1)artNow[i]=null;st[i].artOn=0;st[i].art=null;
    const A=C0&&C0.arts&&C0.arts.find(x=>x.id===(sk&&sk[i])),cost=A?artCost(rm0,i,A):0;
    if(A&&cp[i]>=cost&&(!A.can||A.can(rm0,i))){cp[i]-=cost;usedArt[i]=A.id;if(A.carry){st[i].artOn=1;st[i].art=A.id}log.push(`${nm(i)} 發動戰技【${(enhA[i]&&A.n2)||A.n}】（-${cost} CP，這回合生效）`)}});
  rm.pair.forEach(i=>{if(rm.chars[i]!=='rufo'||!sk||!sk[i]||!st[i].rufoReady)return;st[i].rufoReady=false;st[i].rufoBlastPending=true;st[i].rufoSkillUses=(st[i].rufoSkillUses||0)+1;st[i].rufoQuest=rnd(['S','C','H','D']);st[i].rufoTasks={S:false,C:false,H:false,D:false};rufoUsed[i]=true;log.push(`${nm(i)} 發動【爆裂呈現】第${st[i].rufoSkillUses}次，戰鬥開始造成4連擊${st[i].rufoColor?'群體攻擊':'廣域亂射'}（基礎傷害共 ${st[i].rufoSkillUses*4}）；取得任務：${rufoTaskSuit[st[i].rufoQuest]}`)});
  rm.pair.forEach(i=>{
    if(rm.chars[i]!=='rufo'||!st[i].rufoBlastPending||(extra?.wardenPunishment||extra?.wardenExecution||extra?.wardenShiftDelete)&&i!==1)return;
    st[i].rufoBlastPending=false;const per=Math.max(0,st[i].rufoSkillUses||0),total=Math.floor(per*4*multOf(i,'S')+1e-9),base=Math.floor(total/4),extraHits=total%4,colored=!!st[i].rufoColor,factor=colored&&!enemyGroup(i)?2:1;
    for(let k=0;k<4;k++){
      let target=null,dealt=0;const raw=base+(k<extraHits?1:0),v=dm(i,raw);
      if(colored){
        let count=0;enemies(i).forEach(es=>{
          if(hp[es]>0){const n=takeBody(hp,es,v,i,factor);if(v>0)got[es]=i;count++;log.push(`　【爆裂呈現】第${k+1}擊 → ${nm(es)}（群體×${factor}）：${v} 點，實際${n}`)}
          if(tcl)tcl[es].forEach((m,j)=>{const cur=m.c==='nut'?(nut[es]?.hp||0):(rres[es]?.[j]??m.hp);if(j===rm.act[es]||j===xichnPrimary[es]||m.dead||cur<=0)return;const n=hitRes(es,j,v,factor,'爆裂呈現・群體攻擊','S',i);count++;log.push(`　【爆裂呈現】第${k+1}擊 → ${nm(es)} 的後備 ${CHARS[m.c].n}（群體×${factor}）：${v} 點，實際${n}`)});
        });
        count+=hitAllCandles(i,v,'skill',factor);
        if(!count)log.push(`　【爆裂呈現】第${k+1}擊：沒有存活的敵方目標`);
        guard();continue;
      }
      if(rm.team){const cands=[];enemies(i).forEach(e=>{if(hp[e]>0)cands.push({e,k:-1});tcl[e].forEach((m,j)=>{const cur=rres[e]?.[j]??m.hp;if(j===rm.act[e]||m.dead||cur<=0||m.c==='nut'&&!(nut[e]&&nut[e].hp>0))return;cands.push({e,k:j})})});enemyCandles(i).forEach(c=>cands.push({e:1,candle:c.id}));if(cands.length){const chosen=rnd(cands),e=chosen.e;if(chosen.candle){target='刑罰之燭台';dealt=candleHit(i,v,'skill',chosen.candle)}else if(chosen.k===-1){target=nm(e);dealt=takeBody(hp,e,v,i);if(v>0)got[e]=i}else{target=`${nm(e)} 的後備 ${CHARS[tcl[e][chosen.k].c].n}`;dealt=hitRes(e,chosen.k,v,undefined,'爆裂呈現・廣域亂射','S',i)}}}
      else{const cands=rm.seats.map((_,j)=>j).filter(j=>j!==i&&hp[j]>0);if(cands.length){const t=rm.seats.length===2?cands[0]:rnd(cands);target=nm(t);dealt=take(hp,t,v,i);if(v>0)got[t]=i}}
      if(dealt>0)hits.push(i);log.push(`　【爆裂呈現】第${k+1}擊 → ${target||'沒有存活的敵方目標'}：${v} 點傷害${target?`（實際 ${dealt}）`:''}`);
    }guard();
  });
  rm.pair.forEach(i=>{if(!P[i]||P[i].none)return;P[i].r=effRank(rm.chars[i],st[i],mv[i],multOf(i,P[i].s),(leiU[i]?.bonus||0)+(P[i].spiderBonus||0)+(extra?.wardenJointBonus?.[i]||0)+(i===1?extra?.wardenSaveBonus||0:0));
    if(rm.chars[i]==='card_ish'){if(mv[i][0]===st[i].ishSet||(st[i].dualColor&&mv[i][0]===st[i].ishExtra)){st[i].light=Math.min(5,(st[i].light||0)+1);log.push(`${nm(i)} 打出組札花色，獲得1層光（共${st[i].light}/5）`)}else{st[i].ishSet=mv[i][0];log.push(`${nm(i)} 打出其他花色，組札改為【${SU[st[i].ishSet]}】`) }if(sk&&sk[i]&&st[i].light>=5){st[i].light-=5;st[i].ishSlashPending=true;log.push(`${nm(i)} 發動【光斬】，消耗5層光，回合結束連擊5次，每擊基礎傷害4點`)}}
    if(sk&&sk[i]&&rm.chars[i]==='sinclair'&&(st[i].endlessHunger||0)>=40&&!st[i].laCastrationUsed){P[i].laCastration=1;st[i].laCastrationUsed=1;log.push(`${nm(i)} 將本場唯一一次【La Castration】設為啟動`);return}
    if(rm.team&&st[i].urgentHunger&&hp[i]>=mx(i)*.3){const cost=Math.ceil(hp[i]*.1),owner=rm.cfg.boss&&i!==1?[0,2].find(j=>rm.team[j].some(m=>m.c==='sinclair')):i,oi=owner===undefined?-1:rm.team[owner].findIndex(m=>m.c==='sinclair');if(oi>=0){const before=hp[i];hp[i]=damagedHp(before,mx(i),cost,rm.chars[i],st[i],log,nm(i),true);addDamageFx(damage,rm0,i,recordHpLoss(rm0.chars[i],st[i],before,hp[i]));const os=oi===rm.act[owner]?st[owner]:tcl[owner][oi].st;os.endlessHunger=(os.endlessHunger||0)+cost;P[i].r+=cost+1;log.push(`${nm(i)} 的迫切飢餓消耗 ${cost} 點生命，點數 +${cost+1}；辛克萊無盡的飢餓×${os.endlessHunger}`);if(os.endlessHunger>=20&&!os.noble){os.noble=1;os.resolve=1;os.asuraStrong=(os.asuraStrong||0)+3;log.push(`${nm(owner)} 的辛克萊獲得【高貴的品格】：毅力×1、永久強壯×3`)}}}
    if(st[i].torchRound===rm.round){P[i].r*=2;log.push(`${nm(i)} 的【火炬】使本回合點數×2`)}
    P[i].r=envRank(rm,st[i],mv[i],P[i].r,mv[P[i].o]);
    if(assassinZero(rm,mv[P[i].o]))log.push(`🗡️【刺客】${nm(i)} 遇上對手的A／2／3，最終點數歸零`);
  });
  rm.pair.forEach(i=>{if(rm.chars[i]==='sad'&&mv[i]){P[i].sadEmpowered=sadEmpowered(st[i]);if(P[i].sadEmpowered)log.push(`${nm(i)} 的淚鋒使本張牌點數+6，命中附帶理智削減或追加傷害`)}});
  const assassinTargets=rm.pair.filter(i=>mv[i]&&assassinZero(rm,mv[P[i].o]));if(assassinTargets.length)cueEnvironment('assassin','impact',assassinTargets,'A／2／3破解刺客・點數歸零');
  Object.keys(ohNew).forEach(i=>{st[i].fx=(st[i].fx||[]).concat([{k:'w',n:3,t:99999,oh:1}]);log.push(`${nm(+i)} 獲得【過熱】：3 層虛弱（永久）`)});
  const gunRank=p=>{if(!isValorant(rm.chars[p.i])||!mv[p.i])return p.r;let rank=effRank(rm.chars[p.i],st[p.i],mv[p.i],multOf(p.i,p.s),extra?.wardenJointBonus?.[p.i]||0);if(st[p.i].torchRound===rm.round)rank*=2;return envRank(rm,st[p.i],mv[p.i],rank,mv[p.o])};
  const gunCount=p=>valorantTriggers(rm.chars[p.i],st[p.i],mv[p.i]);
  // 之刃取代本張牌的四花色效果；原始牌面與角色出牌資源仍保留。
  ps.filter(p=>rm.cfg.warden&&p.i!==1&&st[p.i].wardenGebura&&!p.none).forEach(p=>{p.gebura=true;p.s='N';const q=P[p.o],blocked=q?.s==='D',v=dm(p.i,p.r),dealt=takeBody(hp,p.o,v,p.i,blocked?1:2,'gebura');if(dealt>0){effd[p.i]=1;got[p.o]=p.i;hits.push(p.i);const before=hp[p.i],gain=healingGain(st[p.i],Math.ceil(dealt/2));hp[p.i]=healedHp(before,mx(p.i),gain,rm.chars[p.i],st[p.i],log,nm(p.i));recordHeal(p.i,hp[p.i]-before,p.i,'drain');log.push(`${nm(p.i)} 的【Gebura之刃】回復${hp[p.i]-before}血量（實際傷害${dealt}的一半，向上取整）`)}log.push(`${nm(p.i)} 的【Gebura之刃】特殊攻擊${blocked?'穿透方塊，傷害減半且不可反擊':'傷害翻倍'}，實際造成${dealt}點傷害`);guard()});
  const rdwSeat=extra&&extra.redraw;let redrawDo,redrawFree=false;
  if(extra?.wardenExecution){const target=rm.pair.find(i=>i!==1),E=extra.wardenExecution,label=E.final?'強制退場':'死刑執行';if(target!==undefined){if(E.success){const shield=E.final?damageAmount(rm.cfg.hp*2.5):wardenSlayDamage(rm);st[target].shield=(st[target].shield||0)+shield;st[target].shieldPersistent=(st[target].shieldPersistent||0)+shield;log.push(`【${label}】兩名挑戰者原牌合計${E.sum}，符合${E.number}正負${E.final?1:2}；${nm(target)} 獲得${shield}護盾`)}
    let dealt=0;const count=rm.cfg.hp*(E.final?2:1);
    for(let hit=0;hit<count;hit++){const start=combat.length;if(hp[target]>0)dealt+=takeBody(hp,target,1,1,undefined,'wardenExecution');if(combat.length===start)combat.push({seat:target,member:rm0.act?.[target]??-1,source:1,sourceMember:rm0.act?.[1]??-1,amount:0,shield:false,kind:'strike',attackKind:'wardenExecution',power:0});combat.slice(start).forEach(e=>{e.executionHit=hit;e.executionCount=count;if(E.final)e.wardenBeam='forcedExit'});guard0()}
    effd[1]=1;got[target]=1;if(P[target])P[target].v=true;log.push(`【${label}】${nm(target)} 的出牌無效，受到1點×${count}次固定傷害（實際${dealt}；不受增減傷影響）`)}guard()}
  else if(extra?.wardenShiftDelete){const target=rm.pair.find(i=>i!==1),E=extra.wardenShiftDelete;if(target!==undefined){let dealt=0;const count=rm.cfg.hp*2;
    for(let hit=0;hit<count;hit++){const start=combat.length;if(!E.success&&hp[target]>0)dealt+=takeBody(hp,target,1,1,undefined,'wardenExecution');if(combat.length===start)combat.push({seat:target,member:rm0.act?.[target]??-1,source:1,sourceMember:rm0.act?.[1]??-1,amount:0,shield:false,kind:'strike',attackKind:'wardenExecution',power:0});combat.slice(start).forEach(e=>{e.executionHit=hit;e.executionCount=count;e.wardenBeam='shiftDelete'});guard0()}
    effd[1]=1;got[target]=1;if(P[target])P[target].v=true;log.push(`【shift+delete】原牌合計${E.sum}；${E.success?'達標，牧師下回合受傷增加100%':`${nm(target)} 受到1點×${count}次固定傷害（實際${dealt}；不受增減傷影響）`}`)}guard()}
  else if(extra?.wardenPunishment){const target=rm.pair.find(i=>i!==1);if(target!==undefined){const dealt=take(hp,target,15,1,undefined,'fixed');effd[1]=1;got[target]=1;if(dealt>0)hits.push(1);if(P[target])P[target].v=true;log.push(`【懲罰】${nm(1)} 的出牌化為15點固定特殊攻擊，${nm(target)} 的牌無效，方塊不可阻擋（實際${dealt}）`)}guard()}
  else if(rdwSeat!==undefined){const i=rdwSeat,dmgs=redrawCost(rm0,i);redrawFree=freeWardenRedraw(rm0,i)||freeLkdRedraw(rm0,i);if(freeWardenRedraw(rm0,i)){rm.wardenRedraws=[...rm0.wardenRedraws];rm.wardenRedraws[i]--;log.push(`${nm(i)} 使用階段免費換牌（剩${rm.wardenRedraws[i]}次）`)}else if(redrawFree){rm.lkdRedraws=rm.seats.map((_,j)=>lkdRedrawRemaining(rm0,j));rm.lkdRedraws[i]--;log.push(`${nm(i)} 使用全體集合免費換牌（玩家剩${rm.lkdRedraws[i]}次）`)}if(!redrawFree&&rm.env?.supply[i]>0){rm.env=JSON.parse(JSON.stringify(rm.env));rm.env.supply[i]--;queueEnvironmentFx(rm,'supply','redeem');log.push(`${nm(i)} 消耗一次補給折抵（換牌生命消耗-5）`)}if(dmgs>0&&nutTake(i,dmgs)===null){const before=hp[i];hp[i]=damagedHp(before,mx(i),dmgs,rm.chars[i],st[i],log,nm(i));addDamageFx(damage,rm0,i,recordHpLoss(rm0.chars[i],st[i],before,hp[i]))}guard();redrawDo=i;
    log.push(`${nm(i)} 喊出「我牌太爛啦！」：受到 ${dmgs} 點傷害，重新抽取手牌，本回合直接結束`)}
  else if(rep!==undefined){const d=[...hp];
    log.push(`${nm(rep)} 發動【Furioso-Replica】！本回合直接結束，單方面連續攻擊 9 次`);
    const B0=calcBuffs(rm.chars[rep],st[rep]);
    if(rm.team){const targets=enemies(rep);
      for(let k=1;k<=9;k++){const cands=[];targets.forEach(e=>{if(d[e]>0)cands.push({e,k:-1});
        tcl[e].forEach((m,j)=>{if(j===rm.act[e]||m.dead)return;const cur=rres[e]&&rres[e][j]!==undefined?rres[e][j]:m.hp;if(cur<=0)return;if(m.c==='nut'&&!(nut[e]&&nut[e].hp>0))return;cands.push({e,k:j})})});enemyCandles(rep).forEach(c=>cands.push({e:1,candle:c.id}));
        if(!cands.length)break;const target=rnd(cands),e=target.e,j=target.k,v0=dm(rep,Math.max(0,1+B0.strong-B0.weak));let dealt;
        if(target.candle){dealt=candleHit(rep,v0,'skill',target.candle);log.push(`　第 ${k} 擊 → 刑罰之燭台：${dealt} 點傷害`)}
        else if(j<0){dealt=takeBody(d,e,v0,rep);got[e]=rep;log.push(`　第 ${k} 擊 → ${nm(e)}（場上 ${CHARS[rm.chars[e]].n}）：${dealt} 點傷害`)}
        else{dealt=hitRes(e,j,v0,undefined,'廣域亂射','S',rep,undefined,d);log.push(`　第 ${k} 擊 → ${nm(e)} 的後備 ${CHARS[tcl[e][j].c].n}：${dealt} 點傷害`)}
        if(dealt>0)hits.push(rep)}}
    else for(let k=1;k<=9;k++){const al=rm.seats.map((_,j)=>j).filter(j=>j!==rep&&d[j]>0);if(!al.length)break;
      const t=rm.seats.length===2?al[0]:rnd(al),dealt=take(d,t,dm(rep,Math.max(0,1+B0.strong-B0.weak)),rep);if(dealt>0)hits.push(rep);got[t]=rep;
      log.push(`　第 ${k} 擊 → ${nm(t)}：${dealt} 點傷害`)}
    d.forEach((v,i)=>hp[i]=v);guard();
    st[rep].karma=0;st[rep].noKarma=true;st[rep].repUsed=true}
  else if(T.length){const d=[...hp];
    T.forEach(p=>{const q=P[p.o],qs=T.includes(q);
      if(!st[p.i].ketsuen)cut[p.i]=1;
      st[p.i].yoshiCd=2;
      if(!extra?.wardenCandleTargets?.[p.i]&&!qs&&q.s!=='D'&&handCount(q.i)>=2)cut[q.i]=1;
      effd[p.i]=1;log.push(`${nm(p.i)} 發動【天殺】！對手的牌效果全數無效${st[p.i].ketsuen?'（持有血缘，不消除自身卡牌）':''}`);
      if(!extra?.wardenCandleTargets?.[p.i]&&!qs&&q.s==='D')log.push(`${nm(q.i)} 的方塊免疫傷害，但無法反擊`);
      else{const dealt=take(d,q.i,isoAdapt?0:envAttack(rm,p.r),p.i);if(dealt>0)hits.push(p.i);got[q.i]=p.i;log.push(`天殺對 ${nm(q.i)} 造成 ${envAttack(rm,p.r)} 點傷害`)}});
    d.forEach((v,i)=>hp[i]=v);guard()}
  else{
  ps.filter(p=>p.laCastration&&hp[p.i]>0).forEach(p=>{p.v=true;p.s='D';const e=p.o;let count=0;if(rm.team){enemies(p.i).forEach(es=>tcl[es].forEach((m,k)=>{if(m.c==='nut'||m.dead)return;if(k===rm.act[es]){if(hp[es]<=0)return;const d=takeBody(hp,es,envAttack(rm,15),p.i);if(d>0){hits.push(p.i);count++}}else{const d=hitRes(es,k,envAttack(rm,15),undefined,'La Castration');if(d>0)count++}}))}else{const d=take(hp,e,envAttack(rm,15),p.i);if(d>0){hits.push(p.i);count++}}count+=hitAllCandles(p.i,envAttack(rm,15),'skill');log.push(`${nm(p.i)} 發動【La Castration】：視為♦，對敵方全體單方面造成${envAttack(rm,15)}點傷害（命中 ${count} 名）`)});
  ps.filter(p=>rm.chars[p.i]==='moses'&&st[p.i].crimsonBreathRound===rm.round&&hp[p.i]>0).forEach(p=>{const target=p.o;if(hp[target]<=0)return;const real=slay(target,p.i);hits.push(p.i);got[target]=p.i;effd[p.i]=1;log.push(`${nm(p.i)} 發動【吐息-深紅】（先於萊萬汀）${real?`，${nm(target)} 被直接斬殺！`:'，依斬殺防護規則結算'}`);guard()});
  const mt=ps.find(p=>sk&&sk[p.i]&&rm.chars[p.i]==='mat'&&hp[p.i]>0&&rm.st[p.i].wrap>=3&&matTarget(rm,p.i,hp)>=0);
  if(mt){const t=matTarget(rm,mt.i,hp);const real=slay(t,mt.i);hits.push(mt.i);got[t]=mt.i;st[mt.i].wrap=0;(st[t].fingerRevenge||{})[middleFingerSide(rm0,mt.i)]=0;log.push(`${nm(mt.i)} 發動【萊萬汀】`+(real?`，${nm(t)} 被直接擊殺！`:'！'))}
  const sn=ps.find(p=>sk&&sk[p.i]&&rm.chars[p.i]==='san'&&rm.st[p.i].feast>=5&&hp[p.i]>0);
  if(sn){const tier=rm.st[sn.i].feast>=10?2:1;boost[sn.i]=tier;lock[sn.i]=1;st[sn.i].feast-=tier*5;log.push(`${nm(sn.i)} 發動【血宴強化・${tier}階】（${SU[sn.s]}）`);
    if(sn.s==='D'){st[sn.i].shield=(st[sn.i].shield||0)+5;st[sn.i].shNew=rm.turn===sn.i;st[sn.i].shTail=0;st[sn.i].shExtra=tier===2?2:0;log.push(`${nm(sn.i)} 獲得 5 點臨時護盾`);
      if(tier===2){st[sn.i].hard=3;log.push(`${nm(sn.i)} 獲得【硬血盾】（3 場戰鬥，受到傷害 -2），護盾額外持續 2 場戰鬥`)}}}
  ps.forEach(p=>{if(!isoAdapt&&p.s==='S'&&isA(p)&&hp[p.i]>0){const q=P[p.o];if(isA(q)&&q.s!=='S'){const real=slay(q.i,p.i);hits.push(p.i);if(real)log.push(`${nm(p.i)} 的♠A 發動斬殺，${nm(q.i)} 直接倒下！`)}}});
  ps.forEach(p=>{if(p.s==='H'){const requested=extra?.wardenHeartTargets?.[p.i];p.wardenSupport=rm.cfg.warden&&requested!==undefined&&requested!==p.i&&wardenHeartValid(rm0,p.i,submittedMv[p.i],requested)&&!p.corrodeHeart;p.healTarget=p.corrodeHeart?p.o:p.wardenSupport?requested:p.i;p.healKey=p.wardenSupport?p.i:p.healTarget;heal[p.healKey]=true;healAlive[p.healKey]=hp[p.healTarget]>0}});
  ps.forEach(p=>{if(boost[p.i]&&p.s==='H'&&p.healTarget===p.i&&hp[p.i]>0){let v=isA(p)?Math.max(0,hp[p.o]):p.r;const mul=healingFactor(st[p.i]);if(mul<1)v=Math.ceil(v*mul);const blocker=ps.find(q=>q.i===p.o&&q.s==='C'&&hp[q.i]>0);if(boost[p.i]===1)v=Math.ceil(v*(blocker?.4:1.5));else v=Math.ceil(v*1.5);if(rm.chars[p.o]==='heathcliff'&&st[p.o].shieldSuit==='H'&&hp[p.o]>0)v=Math.ceil(v/2);if(blocker&&boost[p.i]===1)cblk[blocker.i]=1;v=envHeal(rm,v);const b=hp[p.i];hp[p.i]=healedHp(b,mx(p.i),v,rm.chars[p.i],st[p.i],log,nm(p.i));recordHeartHeal(p.i,hp[p.i]-b);heal[p.i]=false;effd[p.i]=1;log.push(`${nm(p.i)} 的血宴強化：紅心優先結算，回復 +${hp[p.i]-b}${blocker&&boost[p.i]===1?'（梅花斷補，0.4倍）':boost[p.i]===2?'（二階1.5倍，無視梅花斷補）': '（1.5倍）'}${healingNote(st[p.i])}${rm.chars[p.o]==='heathcliff'&&st[p.o].shieldSuit==='H'?'（希斯克利夫♥盾減半）':''}`)}});
  ps.forEach(p=>{if(p.s==='C'&&!extra?.wardenCandleTargets?.[p.i]&&hp[p.i]>0&&heal[p.o]){heal[p.o]=false;cblk[p.i]=1;effd[p.i]=1;d25Success[p.i]=true;if(rm.chars[p.i]==='rufo'&&hp[p.o]>0)rufoTaskEvents[p.i].C=true;const shield=!P[p.o]?.wardenSupport&&rm.chars[p.o]==='heathcliff'&&st[p.o].shieldSuit==='C';if(shield){let h0=isA(P[p.o])?Math.max(0,hp[p.i]):P[p.o].r;const mul=healingFactor(st[p.o]);if(mul<1)h0=Math.ceil(h0*mul);const v=envHeal(rm,Math.ceil(h0/2)),b=hp[p.o];hp[p.o]=healedHp(b,mx(p.o),v,rm.chars[p.o],st[p.o],log,nm(p.o));recordHeartHeal(p.o,hp[p.o]-b,p.o);log.push(`${nm(p.o)} 的希斯克利夫♣盾使梅花斷補效果減半，仍回復 ${hp[p.o]-b} 點${healingNote(st[p.o])}`)}else if(boost[p.i]){const q0=P[p.o],h0=isA(q0)?Math.max(0,hp[p.i]):q0.r,g0=healedHp(hp[p.i],mx(p.i),envHeal(rm,healingGain(st[p.i],h0)),rm.chars[p.i],st[p.i],log,nm(p.i))-hp[p.i];hp[p.i]+=g0;recordHeal(p.i,g0,p.i);log.push(`${nm(p.i)} 將被阻止的 ${h0} 點回復轉給自己 +${g0}${healingNote(st[p.i])}`)}if(!shield)log.push(`${nm(p.i)} 的梅花封鎖了 ${nm(p.o)} 的治療`);
    if(isA(p)){const q=P[p.o],v=isA(q)?Math.max(0,hp[p.i]):q.r;ex[p.i]=v;log.push(`♣A 額外追加 ${v} 點傷害`)}}});
  const canClash=p=>!extra?.wardenCandleTargets?.[p.i]&&!extra?.wardenCandleTargets?.[p.o]&&(hp[p.i]>0||extra?.wardenLeg&&p.i===1)&&(hp[p.o]>0||extra?.wardenLeg&&p.o===1)&&'SC'.includes(p.s)&&'SC'.includes(P[p.o].s)&&[p,P[p.o]].every(x=>rm.chars[x.i]!=='lucio'||x.r>=5);
  const V=ps.find(p=>rm.chars[p.i]==='val'&&st[p.i].eye>0&&canClash(p)),L=ps.filter(p=>rm.chars[p.i]==='lucio'&&p.r>=5&&canClash(p));
  if(V||L.length){
    const starter=V||L[0],q=P[starter.o],bonus={};if(V)bonus[V.i]=st[V.i].eye;
    // 先保存舊層數，再施加高潮；本次新增不影響拼點或本回合強壯。
    L.forEach(p=>bonus[p.i]=st[p.o].duelClimax||0);
    L.forEach(p=>{st[p.o].duelClimax=Math.min(6,(st[p.o].duelClimax||0)+1);log.push(`${nm(p.i)} 觸發拼點，${nm(p.o)} 決鬥高潮+1（${st[p.o].duelClimax}/6；本次拼點加成使用原有${bonus[p.i]}層）`)});
    const score=p=>p.r+(bonus[p.i]||0),win=score(starter)>=score(q)?starter:q,lose=win===starter?q:starter;lose.v=true;
    log.push(`⚔ ${V?'預知眼':'搖搖欲墜的姿勢'}拼點：${nm(starter.i)} ${starter.r}+${bonus[starter.i]||0}=${score(starter)} vs ${nm(q.i)} ${q.r}+${bonus[q.i]||0}=${score(q)} → ${nm(win.i)} 獲勝，${nm(lose.i)} 的攻擊無效`);
    if(win===V){V.winClash=true;addSan(V.i,15);st[V.i].eye--;st[V.i].sw=(st[V.i].sw||0)+1;log.push(`${nm(V.i)} 拼點成功：預知眼-1，獲得巴勒莫劍術（點數+${st[V.i].sw}）`)}
    if(L.includes(win)){win.winClash=true;addSan(win.i,15);if(st[win.o].duelClimax>0){addLucioLesson(st[win.i]);log.push(`${nm(win.i)} 拼點勝利，獲得教材（${st[win.i].lucioLesson}${st[win.i].lucioHeart?'，無上限':'/3'}）`)}}
    if(V&&st[V.i].eye===0&&!st[V.i].xinVal){st[V.i].heat=3;log.push(`${nm(V.i)} 預知眼耗盡，進入過熱（3場戰鬥：傷害-2）`)}
  }
  const bambooSlash=(a,d)=>{guard0(d);if(d[a.i]<=0)return;const targets=st[a.i].bambooEgo?enemies(a.i):[a.o],b=calcBuffs('bamboo',st[a.i]);
    log.push(`${nm(a.i)} 被成功反擊，發動【斷汝筋骨】${st[a.i].bambooEgo?'群體攻擊（含敵方後備）':''}，四次斬擊分開結算`);
    for(let hit=1;hit<=4&&d[a.i]>0;hit++){const v=dm(a.i,Math.max(0,Math.floor(4*multOf(a.i,'S')+1e-9)+b.strong-b.weak));
      targets.forEach(es=>{if(d[es]>0){const dealt=(st[a.i].bambooEgo?takeBody:take)(d,es,v,a.i,undefined,'spade');if(dealt>0){got[es]=a.i;effd[a.i]=1}log.push(`　【斷汝筋骨】第${hit}斬 → ${nm(es)}：${v}點傷害（實際${dealt}）`)}
        if(st[a.i].bambooEgo&&tcl)tcl[es].forEach((m,k)=>{const cur=m.c==='nut'?(nut[es]?.hp||0):(rres[es]?.[k]??m.hp);if(k===rm.act[es]||k===xichnPrimary[es]||m.dead||cur<=0)return;const dealt=hitRes(es,k,v,undefined,'斷汝筋骨','S',a.i,'spade',d);if(dealt>0)effd[a.i]=1;log.push(`　【斷汝筋骨】第${hit}斬 → ${nm(es)} 的後備 ${CHARS[m.c].n}：${v}點傷害（實際${dealt}）`)})
      });if(st[a.i].bambooEgo)hitAllCandles(a.i,v,'spade');guard0(d);
    }
  };
  const group=(list,dmg)=>{const act=list.filter(a=>(hp[a.i]>0||extra?.wardenLeg&&a.i===1)&&(hp[a.o]>0||extra?.wardenLeg&&a.o===1)&&!a.v),d=[...hp];
    act.forEach(a=>{const growthStart=combat.length,tg=extra?.wardenCandleTargets?.[a.i]?{...P[a.o],s:'N'}:P[a.o],rk=rm.chars[a.i]==='rean'&&artNow[a.i]==='roku'&&'SC'.includes(a.s),lk=!!(leiU[a.i]&&leiU[a.i].quick)&&a.s==='S',lh=lk&&(rm.cfg.boss&&a.i===1||enemyGroup(a.i)),lfm=lk?(lh?.6:1.2):undefined;
      const reflect=()=>{if(!rk)addCounterGuard(combat,rm0,a.i,a.o);const count=gunCount(tg);let total=0;
        for(let hit=0;hit<count&&(hit===0||d[a.i]>0);hit++){const gun=valorantGun(rm.chars[tg.i],st[tg.i]),base=(isA(tg)?mx(tg.i)-hp[tg.i]:gunRank(tg)),v=dm(tg.i,base*(gun===VALORANT_GUNS.judge?2:1)),dealt=take(d,a.i,v,tg.i,undefined,'counter');total+=dealt;if(dealt>0){hits.push(a.o);if(rm.chars[a.o]==='rufo')rufoTaskEvents[a.o].D=true}ringHit(a.o,a.i,dealt,false);if(rm.chars[tg.i]==='san')ls({i:tg.i,s:'D'},v,d);if(count>1)guard0(d)}
        got[a.i]=a.o;refl[a.i]=1;cntd[a.o]=1;effd[a.o]=1;d25Success[a.o]=true;if(rm.chars[tg.i]==='mat')wrapUp[tg.i]=1;log.push(`${nm(a.o)} 的方塊${rk?'無法擋下六連疾風，但仍':'免疫攻擊並'}反擊 ${nm(a.i)} ${total} 點${count>1?'（'+count+'次效果分開結算）':''}${isA(tg)?'（♦A：損失的生命量）':''}`);if(a.bambooSkin)bambooSlash(a,d)};
      if(tg.s==='D'&&!rk&&!tg.corrodeDiamond)reflect();
      else if(a.bambooSkin){const dealt=take(d,a.o,isoAdapt?0:3,a.i,undefined,'fixed',playedBlackRank(a.i));if(dealt>0){effd[a.i]=1;d25Success[a.i]=true;got[a.o]=a.i}log.push(`${nm(a.i)} 的【捨吾皮肉】對 ${nm(a.o)} 造成固定3點傷害（實際${dealt}），不附原黑牌效果`)}
      else{const count=gunCount(a),gun=valorantGun(rm.chars[a.i],st[a.i]);
        for(let hit=0;hit<count&&(hit===0||d[a.i]>0&&d[a.o]>0);hit++){let b0=dmg({...a,r:gunRank(a)});const hv=rk&&(rm.cfg.boss&&a.i===1||enemyGroup(a.i));if(hv)b0/=2;const v=isoAdapt?0:envBlackDamage(rm,blackDm(a.i,b0),a.s),dodgeBefore=valDodged[a.o]||0,dealt=take(d,a.o,v,a.i,lfm,a.s==='S'?'spade':'club',playedBlackRank(a.i)),dodged=(valDodged[a.o]||0)>dodgeBefore;if(dealt>0){hits.push(a.i);effd[a.i]=1;if(rm.chars[a.i]==='rufo'&&a.s==='S')rufoTaskEvents[a.i].S=true}ringHit(a.i,a.o,dealt,a.s==='C');if(v>0&&!dodged)got[a.o]=a.i;if(rm.chars[a.i]==='san'&&!dodged)ls(a,v,d);if(a.s==='S'&&dealt>0)d25Success[a.i]=true;log.push(`${nm(a.i)} 的${SU[a.s]}${count>1?'第'+(hit+1)+'次觸發':''}對 ${nm(a.o)} 造成 ${dealt} 點傷害${dodged?'（預知眼閃避）':''}`);if(lh)groupRes(a,v,.6,d);if(lk)log.push(`快刀亂麻（${lh?'群體・最終傷害×0.6':'單體・效果翻倍，最終傷害×1.2'}）`);if(rk){log.push(`六連疾風${hv?'（群體・傷害減半）':'（單體・傷害不減半）'}`);if(hv)groupRes(a,v,undefined,d)}if(count>1)guard0(d)}
        if(gun===VALORANT_GUNS.guardian&&a.s==='C'&&cblk[a.i]&&d[a.o]>0){const dealt=take(d,a.o,envBlackDamage(rm,dm(a.i,5),'C'),a.i,undefined,'club',playedBlackRank(a.i));if(dealt>0){effd[a.i]=1;got[a.o]=a.i}log.push(`${nm(a.i)} 的捍衛者斷補成功，追加5點傷害（實際${dealt}）`)}
        if(rk&&tg.s==='D'&&!tg.corrodeDiamond)reflect()
      }const events=combat.slice(growthStart),black=events.filter(e=>e.source===a.i&&['spade','club'].includes(e.attackKind)).reduce((n,e)=>n+e.amount,0),counter=events.filter(e=>e.source===a.o&&e.attackKind==='counter').reduce((n,e)=>n+e.amount,0);if(black>5)xichnLearning.push({route:0,seat:a.i,member:rm.act?.[a.i]??-1});if(counter>5)xichnLearning.push({route:2,seat:a.o,member:rm.act?.[a.o]??-1})});
    d.forEach((v,i)=>hp[i]=v);guard()};
  const sp=ps.filter(p=>p.s==='S');
  [...new Set(sp.map(p=>p.r))].sort((a,b)=>a-b).forEach(r=>group(sp.filter(p=>p.r===r),a=>Math.max(0,a.r-hd(a))));
  group(ps.filter(p=>p.s==='C'),a=>Math.max(0,(extra?.wardenCandleTargets?.[a.i]||boost[a.i]===2||valorantGun(rm.chars[a.i],st[a.i])===VALORANT_GUNS.odin?a.r:a.r/2)+(ex[a.i]||0)-hd(a)));
  ps.forEach(p=>{if(!p.corrodeBlack||hp[p.i]<=0)return;const base=p.s==='S'?Math.max(0,p.r-hd(p)):Math.max(0,p.r/2-hd(p)),v=envBlackDamage(rm,dm(p.i,base),p.s),dealt=take(hp,p.i,v,p.i,undefined,p.s==='S'?'spade':undefined);if(dealt>0)got[p.i]=p.i;log.push(`${nm(p.i)} 的侵蝕反噬命中自己，受到 ${v} 點傷害（實際 ${dealt}）`)});
  ps.forEach(p=>{if(p.s!=='H')return;const target=p.healTarget===undefined?p.i:p.healTarget;if(!heal[p.healKey??target])return;
    if(hp[target]<=0){log.push(`${nm(target)} 已倒下，治療無效`);return}
    const count=gunCount(p);for(let hit=0;hit<count&&hp[target]>0;hit++){
    let v=isA(p)?Math.max(0,hp[p.o]):gunRank(p);if(target===p.i)v=xichnHeartGain(rm.chars[p.i],st[p.i],v);const mul=healingFactor(st[target]);if(mul<1)v=Math.ceil(v*mul);const heartShield=rm.chars[target]==='heathcliff'&&st[target].shieldSuit==='H'&&hp[target]>0;if(heartShield)v=Math.ceil(v/2);v=envHeal(rm,v);const b=hp[target];hp[target]=healedHp(b,mx(target),v,rm.chars[target],st[target],log,nm(target));recordHeartHeal(target,hp[target]-b,p.i);if(target===p.i&&rm.chars[p.i]==='rufo'&&hp[target]>b)rufoTaskEvents[p.i].H=true;effd[p.i]=1;if(target===p.i&&rm.chars[p.i]==='san'&&!lock[p.i]){const add=st[p.i].feastBoost?Math.round((hp[target]-b)*1.5):(hp[target]-b);st[p.i].feast+=add}log.push(`${nm(p.i)} 的♥${p.corrodeHeart?'侵蝕治療敵方':'治療'} ${nm(target)} +${hp[target]-b}${healingNote(st[target])}${heartShield?'（希斯克利夫♥盾減半）':''}${isA(p)?'（♥A：對手剩餘血量）':''}${count>1?'（第'+(hit+1)+'次觸發）':''}`)}});
  }
  rm.pair.forEach(i=>{if(st[i].crimsonBreathRound===rm.round)st[i].crimsonBreathRound=0});
  if(!envActive(rm,'cheer')&&gs&&gs.guess>=0&&hp[gs.seat]>0){const g=gs.seat,[x,y]=rm.pair,big=P[x].r>P[y].r?x:y;
    if(P[x].r===P[y].r){const before=hp[g];hp[g]=damagedHp(before,mx(g),5,rm.chars[g],st[g],log,nm(g));addDamageFx(damage,rm0,g,recordHpLoss(rm0.chars[g],st[g],before,hp[g]));log.push(`旁觀者 ${nm(g)} 猜了，但雙方點數相同，自損 5 點`)}
    else if(gs.guess===big){
      if(gs.reward==='heal'){const v=envHeal(rm,Math.ceil(healingFactor(st[g]))),before=hp[g];hp[g]=healedHp(hp[g],mx(g),v,rm.chars[g],st[g],log,nm(g));recordHeal(g,hp[g]-before);log.push(`旁觀者 ${nm(g)} 猜中，回復 ${v} 血${healingNote(st[g])}`)}
      else if(hp[big]>0){const dealt=take(hp,big,dm(g,1),g);if(dealt>0)hits.push(g);if(got[big]===undefined)guessOnly[big]=1;got[big]=g;if(rm.chars[g]==='san')ls({i:g,s:'X'},1,hp);log.push(`旁觀者 ${nm(g)} 猜中，對 ${nm(big)} 造成 1 點傷害`)}
      else log.push(`旁觀者 ${nm(g)} 猜中，但目標已倒下`)}
    else log.push(`旁觀者 ${nm(g)} 猜錯，無事發生`)}
  guard();
  rm.pair.forEach(i=>{if(rm.chars[i]!=='spider'||!mv[i]||P[i]?.none)return;const key=spiderResource(P[i].s);if(!key)return;const success=P[i].s==='D'?!!cntd[i]:!!effd[i],gain=spiderGain(st[i],Math.max(0,P[i].r)*(success?1:.5));st[i][key]=(st[i][key]||0)+gain;log.push(`${nm(i)} 的${key==='spiderEye'?'赤曈':'懺悔'}${success?'成功':'失敗減半'}：獲得${gain}層（最終點數${P[i].r}，倍率×${st[i].spiderGain||1}）`)});
  // 立繪2只消耗羅佳自己的下一次出牌；旁觀、後備及立即絕技不扣次數。
  rm.pair.forEach(i=>{if(rm0.chars[i]==='sad'&&mv[i])st[i].sadArtTurns=0;if(rm0.chars[i]==='lkd'&&mv[i])st[i].lkdArtTurns=0});
  rm.pair.forEach(i=>{if(rm0.chars[i]==='kira'&&mv[i])st[i].kiraArtTurns=0;if(rm.chars[i]!=='kira'||!cntd[i])return;st[i].kiraCounters=(st[i].kiraCounters||0)+1;if(st[i].kiraCounters>=2){st[i].kiraCounters-=2;st[i].kiraDadUses=(st[i].kiraDadUses||0)+1}st[i].kiraArtTurns=1;soundCues.push({seat:i,file:kiraSoundFile(2),replaceAttack:true});log.push(`${nm(i)} 的綺羅反擊成功，老爸技資格${st[i].kiraDadUses}次（反擊累積${st[i].kiraCounters}/2）`)});
  rm.pair.forEach(i=>{if(rm.chars[i]!=='lkd'||!cntd[i])return;st[i].lkdCounters=(st[i].lkdCounters||0)+1;if(st[i].lkdCounters>=2){st[i].lkdCounters-=2;st[i].lkdHaircuts=(st[i].lkdHaircuts||0)+1}st[i].lkdArtTurns=1;soundCues.push({seat:i,file:lkdSoundFile(2),replaceAttack:true});log.push(`${nm(i)} 反擊成功，理髮卷資格${st[i].lkdHaircuts}次（反擊累積${st[i].lkdCounters}/2）`)});
  rm.pair.forEach(i=>{if(rm.chars[i]!=='sad'||!mv[i])return;const s0=st[i];s0.sadNext=0;s0.noD=0;s0.dDefFail=0;
    if(P[i]?.sadEmpowered)soundCues.push({seat:i,file:sadSoundFile(3)});
    if(mv[i][0]!=='D')return;const before=s0.sadTears||0;s0.sadCounters=(s0.sadCounters||0)+1;s0.sadTears=Math.min(3,before+1);log.push(`${nm(i)} 打出方塊，獲得1層淚鋒（${s0.sadTears}/3；本局已出${s0.sadCounters}張方塊）`);
    if(s0.sadTears>before){s0.sadArtTurns=1;soundCues.push({seat:i,file:sadSoundFile(2)})}
    if(s0.sadTears===3&&!s0.sadPride){s0.sadTears=0;s0.sadNext=1;log.push(`${nm(i)} 消耗全部淚鋒，恢復虛弱1、移除淚鋒強壯；下一張牌點數+6，命中使敵方理智-20或追加3點固定傷害`)}
  });
  rm.pair.forEach(i=>{const card=mv[i];if(rm.chars[i]!=='moses'||!card)return;const color='SC'.includes(card[0])?'red':card[0]==='D'?'purple':card[0]==='H'?'white':null;if(color)addMosesSmoke(st[i],color,+submittedMv[i].slice(1),log,nm(i),'基本點數'+submittedMv[i].slice(1))});
  if(!rm.cfg.warden&&!extra?.noD25)rm.pair.forEach(i=>{if(hp[i]<=0||!mv[i])return;const d=d25List[i];if(d.bust||d.ready||d.used)return;const gain=mv[i][0]==='H'?(d25HeartGain[i]||0):d25Success[i]?+mv[i].slice(1):0;if(gain>0){d.val=tidyHp(d.val+gain);if(d.val===25){if(!d25Claimed){d25Candidates.push(i);log.push(`🌟【二十五之刻】${nm(i)} 累積 +${gain} 點，剛好集滿25點！`)}else log.push(`⏳【二十五之刻】${nm(i)} 累積 +${gain} 點（達到25點，但全場已有一位達成完美決鬥）`)}else if(d.val>25){d.bust=true;log.push(`💥【二十五之刻】${nm(i)} 累積 +${gain} 點，達到 ${d.val} 點（超過25點），爆牌崩壞！`)}else log.push(`⏳【二十五之刻】${nm(i)} 累積 +${gain} 點（目前 ${d.val} / 25 點）`)}});
  rm.pair.forEach(i=>{if(!mv[i])return;if(rm.chars[i]==='sad'){st[i].noD=0;st[i].dDefFail=0;return}const suit=mv[i][0];if(suit==='D'){if(cntd[i]){st[i].dDefFail=0;}else{st[i].dDefFail=(st[i].dDefFail||0)+1;if(st[i].dDefFail>=2){st[i].noD=1;st[i].dDefFail=0;log.push(`🛡️【連續防守懲罰】${nm(i)} 連續兩回合出方塊且未反擊成功，第三回合無法出方塊牌！`);}else{log.push(`🛡️【防守警告】${nm(i)} 出方塊未反擊成功（連續 1 回合；若連續 2 回合未反擊成功，下回合將無法出方塊）`);}}}else{st[i].dDefFail=0;if(st[i].noD)st[i].noD=0;}});
  rm.pair.forEach(i=>{if(rm.chars[i]!=='rufo'||rufoUsed[i]||st[i].rufoReady)return;const task=st[i].rufoTasks||(st[i].rufoTasks={S:false,C:false,H:false,D:false}),quest=st[i].rufoQuest;
    if(quest){if(!rufoTaskEvents[i][quest])return;st[i].rufoReady=true;st[i].rufoQuest=null;st[i].rufoTasks={S:false,C:false,H:false,D:false};log.push(`${nm(i)} 完成追加任務【${rufoTaskSuit[quest]}】，重新解鎖【爆裂呈現】`);return}
    for(const suit of ['S','D','H','C'])if(rufoTaskEvents[i][suit]&&!task[suit]){task[suit]=true;log.push(`${nm(i)} 完成花色任務【${rufoTaskSuit[suit]}】`)}
    if(['S','D','H','C'].filter(s=>task[s]).length>=3){st[i].rufoWolf=(st[i].rufoWolf||0)+1;st[i].rufoReady=true;st[i].rufoTasks={S:false,C:false,H:false,D:false};log.push(`${nm(i)} 完成任意三種花色任務，獲得【野獸派－狼面】×${st[i].rufoWolf}，解鎖【爆裂呈現】`)} });
  rm.pair.forEach(i=>{const p=P[i],n=st[i].rufoBleed||0;if(!p||!['S','C'].includes(p.s)||n<=0||hp[i]<=0)return;const dealt=take(hp,i,n);st[i].rufoBleed=Math.max(0,n-1);log.push(`${nm(i)} 使用黑色牌觸發流血，受到 ${n} 點傷害（剩餘流血 ${st[i].rufoBleed}）${dealt<n?'（傷害受到護盾等效果抵擋）':''}`)});guard();
  guard();
  rm.pair.forEach(i=>{const a=rm.pair.find(j=>j!==i);if(rm.chars[a]!=='ailan'||hp[i]<=0)return;const ts=st[i];if(ts.superDeepTrauma||ts.deepTrauma||hp[i]<mx(i)*.2){const fixed=!!st[a].superChase,n=fixed?5:envAttack(rm,rnd([1,2,3])),d=take(hp,i,n,a,undefined,fixed?'fixed':undefined);if(d>0)log.push(`${nm(a)} 的【${fixed?'超追擊':'夜錐追擊'}】對 ${nm(i)} 發動單方面攻擊，造成 ${d} 點傷害`)}});
  const demandeDebuffs=[];
  rm.pair.forEach(i=>{if(rm.chars[i]!=='sinclair'||!st[i].laDemande||hp[i]<=0)return;const target=rm.pair.find(j=>j!==i&&enemies(i).includes(j)&&hp[j]>0);if(target===undefined)return;
    const v=dm(i,3),dealt=take(hp,target,v,i);if(v>0)got[target]=i;log.push(`${nm(i)} 的【la demande】追擊 ${nm(target)}：基礎3點，實際${dealt}點傷害`);guard();
    if(hp[target]>0)demandeDebuffs.push({target,k:rnd(['w','v'])});
  });
  rm.pair.forEach(i=>{if(rm.chars[i]!=='heathcliff'||hp[i]<=0||!st[i].shieldSuit)return;const o=rm.pair.find(j=>j!==i);if(o===undefined||P[o]?.s===st[i].shieldSuit)return;st[i].coffin=(st[i].coffin||0)+1;let gained=0;while(st[i].coffin>=7){st[i].coffin-=7;st[i].will=(st[i].will||0)+1;gained++}log.push(`${nm(i)} 的對手沒有打出${SU[st[i].shieldSuit]}牌，獲得1層棺（${st[i].coffin}/7）`);if(gained)log.push(`${nm(i)} 的棺集滿7層，獲得${gained}層毅力（共${st[i].will}）`)});
  rm.seats.forEach((_,i)=>{if(extra?.wardenFinish||extra?.wardenLeg&&!rm.pair.includes(i))return;const c=rm.chars[i];
    if(c==='mat'){
      if(wrapUp[i]){st[i].wrap++;log.push(`${nm(i)} 獲得拆開的包裝紙（×${st[i].wrap}）`)}}
    if(c==='rien'&&P[i]&&!P[i].none&&rm.st[i].cmd&&hp[i]>0){
      if(mv[i]===rm.st[i].cmd){const p=P[i];let ok=false;
        if(p.s==='S'||p.s==='C')ok=hits.includes(i);else if(p.s==='D')ok=!!cntd[i];else if(p.s==='H')ok=!!heal[i];
        const g=ok?3:1;st[i].grace=Math.min(9,(st[i].grace||0)+g);log.push(`${nm(i)} 使用指令牌（${ok?'成功':'失敗'}），獲得 ${g} 層指令加護（共 ${st[i].grace}）`)}
      else if(!st[i].noKarma){st[i].karma=(st[i].karma||0)+1;log.push(`${nm(i)} 未使用指令牌，業【福爾圖娜】+1（共 ${st[i].karma}）`)}}
    if(c==='val'){
      if(P[i]&&rm.st[i].heat>0){st[i].heat--;if(!st[i].heat){st[i].eye=6;log.push(`${nm(i)} 過熱結束，恢復 6 層預知眼`)}}
      if(!(rm.st[i].heat>0)&&got[i]!==undefined&&!guessOnly[i]&&st[i].eye>0){st[i].eye=Math.max(0,st[i].eye-2);log.push(`${nm(i)} 被攻擊命中，預知眼-2（剩 ${st[i].eye}）`);
        if(!st[i].eye&&!st[i].xinVal){st[i].heat=3;log.push(`${nm(i)} 預知眼耗盡，進入過熱（3場戰鬥：傷害-2）`)}}}
    if(c==='san'){
      if(P[i]&&st[i].hard>0){st[i].hard--;if(!st[i].hard)log.push(`${nm(i)} 的硬血盾消失`)}
      if((st[i].shield||0)>(st[i].shieldPersistent||0)){
        if(st[i].shNew)st[i].shNew=false;
        else if(st[i].shTail>0){if(P[i]){st[i].shTail--;if(!st[i].shTail){st[i].shield=st[i].shieldPersistent||0;log.push(`${nm(i)} 的臨時護盾消失`)}}}
        else if(rm.turn===i){if(st[i].shExtra>0){st[i].shTail=st[i].shExtra;st[i].shExtra=0}else{st[i].shield=st[i].shieldPersistent||0;log.push(`${nm(i)} 的臨時護盾消失`)}}}}
    if(c==='umb'){
      if(rm.st[i].rage>0){if(P[i]){st[i].rage--;if(!st[i].rage){st[i].stack=0;log.push(`${nm(i)} 的神怒結束`)}}}
      else if(P[i]&&hp[i]>0){const q=P[P[i].o];
        if(q.s==='S'||q.s==='C'||T.includes(q)||refl[i]||(rep!==undefined&&got[i]!==undefined)){st[i].stack++;log.push(`${nm(i)} 受到攻擊，神罰 ×${st[i].stack}`);
          if(st[i].stack>=3){st[i].rage=2;log.push(`${nm(i)} 進入【神怒】（持續2場自己的戰鬥）`)}}}}});
  if(rep===undefined&&!T.length){const [x,y]=rm.pair,px=P[x],py=P[y];
    if(px&&py&&!px.none&&!py.none)[[px,py],[py,px]].forEach(([a,b])=>{if(a.winClash)return;if(a.r>b.r)addSan(a.i,5);else if(a.r<b.r)addSan(a.i,-5)});
    ps.forEach(p=>{if(cntd[p.i])addSan(p.i,10);if(refl[p.i])addSan(p.i,-10)})}
  rm.seats.forEach((_,i)=>{if(hp[i]<=0&&!(i===1&&wardenCanContinue(rm0))&&(!extra?.wardenLeg||rm.hp[i]>0)&&got[i]!==undefined&&got[i]!==i)addSan(got[i],15)});
  if(!extra?.wardenLeg){
  rm.seats.forEach((_,i)=>{const b=st[i].burn||0;if(b>0&&hp[i]>0){const dl=takeOne(hp,i,b,undefined,undefined,'burn');log.push(`${nm(i)} 受到炎傷 ${b} 點傷害`+(dl<b?`（實際 ${dl}）`:''));matBurnRelay(st[i],b,dl);st[i].burn=b-1}});if(tcl)tcl.forEach((t,es)=>t.forEach((m,k)=>{if(k===rm.act[es]||m.dead)return;const b=m.st.burn||0;if(b>0){const dl=hitRes(es,k,b,undefined,'炎傷');log.push(`${nm(es)} 的後備 ${CHARS[m.c].n} 受到炎傷 ${b} 點傷害`+(dl<b?`（實際 ${dl}）`:''));matBurnRelay(m.st,b,dl);m.st.burn=b-1}}));guard();
  upkeepPair.forEach(i=>{if(rm.chars[i]==='verg')tickVerg(st[i],i)});if(tcl)tcl.forEach((t,es)=>t.forEach((m,k)=>{if(k!==rm.act[es]&&m.c==='verg'&&!m.dead)tickVerg(m.st,es)}));
  }
  rm.pair.forEach(i=>{if(rm.chars[i]!=='card_ish'||!st[i].ishSlashPending)return;st[i].ishSlashPending=false;const target=rm.pair.find(j=>j!==i&&hp[j]>0);if(target===undefined){log.push(`${nm(i)} 的【光斬】沒有存活的敵方目標`);return}
    for(let hit=1;hit<=5;hit++){if(hp[target]<=0)break;const v=dm(i,4),dealt=take(hp,target,v,i);if(dealt>0)hits.push(i);if(v>0)got[target]=i;log.push(`${nm(i)} 的【光斬】第${hit}擊 → ${nm(target)}：${v}點單方面傷害（實際${dealt}）`);guard()}
  });guard();
  if(!extra?.wardenLeg){
  upkeepPair.forEach(i=>{if((st[i].sealT||0)>0)st[i].sealT--;if((st[i].shin||0)>0&&!st[i].musouShin){st[i].shin--;if(!st[i].shin)log.push(`${nm(i)} 的神氣合一結束`)}
    tickTimeUp(st[i],i);if(rm.chars[i]==='lucio')st[i].lucioStrong=0;
    if(rm.chars[i]==='teaflower'&&st[i].teaClubUsedRound!==rm.round&&st[i].teaClubTickRound!==rm.round&&st[i].teaClubCd>0){st[i].teaClubCd--;st[i].teaClubTickRound=rm.round;}
    st[i].fx=(st[i].fx||[]).map(x=>x.source==='teaflower'?x:{...x,t:x.t-1}).filter(x=>x.t>0);['stun','asura','cpg','yoshiCd','paralysis','divineAnnihilation'].forEach(k=>{if((st[i][k]||0)>0)st[i][k]--});
    // 超毅力計時器遞減
    if(rm.chars[i]==='mat'&&st[i].superRes&&(st[i].superResTimer||0)>0){st[i].superResTimer--;if(!st[i].superResTimer)log.push(`${nm(i)} 的【超毅力】保護期結束`)}});
  if(tcl)tcl.forEach((t,es)=>{if(!upkeepPair.includes(es))return;t.forEach((m,k)=>{if(k===rm.act[es]||m.dead)return;m.st.fx=(m.st.fx||[]).map(x=>x.source==='sun'?{...x,t:x.t-1}:x).filter(x=>x.source!=='sun'||x.t>0);if(m.c!=='mat'||!m.st.superRes||!(m.st.superResTimer>0))return;m.st.superResTimer--;if(!m.st.superResTimer)log.push(`${nm(es)} 的後備馬蒂亞斯【超毅力】保護期結束`)})});
  if(tcl)tcl.forEach((t,es)=>{if(upkeepPair.includes(es))t.forEach((m,k)=>{if(k!==rm.act[es]&&!m.dead)tickTimeUp(m.st,es)})});
  rm.seats.forEach((_,i)=>{
    if((st[i].yoshiCd||0)>0&&!upkeepPair.includes(i))st[i].yoshiCd--;
    if(rm.chars[i]==='val'&&st[i].xinVal&&hp[i]>0){st[i].eye=(st[i].eye||0)+1;log.push(`${nm(i)} 的【心-瓦倫希娜】回復 1 層預知眼（現有 ${st[i].eye} 層）`)}
  });
  }
  demandeDebuffs.forEach(({target,k})=>{if(hp[target]<=0)return;st[target].fx.push({k,n:1,t:3,source:'laDemande'});log.push(`${nm(target)} 被【la demande】附加1層${k==='w'?'虛弱':'易損'}（3回合，獨立計時）`)});
  rm.pair.forEach(i=>{if(artNow[i]==='karyu'&&hp[i]>0){const o=rm.pair.find(x=>x!==i),n=enhA[i]?4:2;fxAdd(o,-1,{k:'v',n,t:2});fxAdd(o,-1,{k:'w',n,t:2});log.push(`${nm(o)} 被給與 ${n} 層易損及 ${n} 層虛弱（2 回合）`)}});
  rm.pair.forEach(i=>{if(rm.chars[i]==='estelle'&&(st[i].cpg||0)>0)cpAdd(i,10)});
  rm.pair.forEach(i=>{const a=usedArt[i];if(!a||hp[i]<=0)return;const o=rm.pair.find(x=>x!==i),ch=rm.chars[i],en=enhA[i],A0=CHARS[ch].arts.find(x=>x.id===a)||{},an=(en&&A0.n2)||A0.n,L=m=>log.push(`${nm(i)} 的戰技【${an}】生效：${m}`);
    if(['hiba','kongo','smash','zero'].includes(a)&&hp[o]<=0){L('目標已倒下，無效');return}
    if(a==='hiba'){const n=en?2:1;st[o].burn=(st[o].burn||0)+n;st[o].sealT=Math.max(st[o].sealT||0,en?2:1);L(`封鎖 ${nm(o)} 的技能 ${n} 回合（含被動），並給與 ${n} 層炎傷`)}
    else if(a==='karyu')L(`點數倍率 +${en?70:50}%，回合結束時給與敵方易損與虛弱`);
    else if(a==='roku')L((en?'點數倍率 +30%，':'')+'傷害不會被方塊消掉，並為群體攻擊');
    else if(a==='whirl'){const group=enemyGroup(i),n=group?1:2;const targets=rm.team&&!rm.cfg.boss?enemies(i):[o];targets.forEach(es=>forTeam(es,(target,k)=>{fxAdd(target,k,{k:'v',n,t:1});fxAdd(target,k,{k:'w',n,t:1})}));L(`給與敵方${group?'全體':''} ${n} 層易損及虛弱（1 回合）`)}
    else if(a==='kongo'){fxAdd(o,-1,{k:'dm',n:-.5,t:2});L(`${nm(o)} 2 回合造成傷害減半`)}
    else if(a==='inspire'){st[i].cpg=2;cpAdd(i,10);const t=halvedFor(i)?2:4;forTeam(i,(target,k)=>{fxAdd(target,k,{k:'dm',n:.3,t});fxAdd(target,k,{k:'rd',n:.2,t})});L(`自身2回合每回合+10CP；我方傷害+30%、受傷-20%（${t} 回合）`)}
    else if(a==='smash'){fxAdd(o,-1,{k:'v',n:6,t:1});L(`給與 ${nm(o)} 6 層易損（1 回合）`)}
    else if(a==='zero'){st[i].fx=(st[i].fx||[]).filter(x=>x.k!=='v'&&x.k!=='w');fxAdd(o,-1,{k:'ns',n:1,t:2});L(`解除自身易損及虛弱，${nm(o)} 的強壯無效 2 回合`)}
    else if(a==='clone'){if(!tcl||tcl[i].some(m=>m.c==='leoc'&&!m.dead))L('分身已存在，無效');else{tcl[i].push({c:'leoc',hp:5,st:newSt(),dead:false});st[i].cl=tcl[i].length;L('創造了 5 點生命的分身，下回合自動切換為分身')}}
    else if(a==='wall'){forTeam(i,(target,k)=>{const s0=stAt(target,k);s0.wall=(s0.wall||0)+1});L(`我方${halvedFor(i)?'全體':''}獲得 1 次抵擋任何傷害`)}});
  rm.pair.forEach(i=>{if(rm.chars[i]!=='shi_faust'||hp[i]<=0||!P[i])return;const s0=st[i],o=rm.pair.find(x=>x!==i),wasBow=!!rm.st[i].bow,used=!!(sk&&sk[i])&&!P[i].none;
    if((rm.st[i].rarrow||0)>0&&'SC'.includes(P[i].s)){s0.rarrow--;log.push(`${nm(i)} 的紅矢發動（${P[i].s==='S'?'♠點數×3':'♣點數×5'}），${s0.rarrow>0?`紅矢剩${s0.rarrow}層`:'紅矢消失'}`)}
    if(!wasBow){if(used){s0.bow=1;s0.arrow=0;log.push(`${nm(i)} 發動【拉弓】，下回合起進入拉弓模式`)}}
    else{const gain=s0.fastBow?4:1;s0.arrow=Math.min(4,(s0.arrow||0)+gain);log.push(`${nm(i)} 拉弓中，獲得 ${gain} 層矢（共 ${s0.arrow}）`);
      if(used){const n=s0.arrow,T={0:[0,0],1:[1,0],2:[3,1],3:[4,4],4:[5,5]}[n],f=[];if(T[0])f.push({k:'v',n:T[0],t:2});if(T[1])f.push({k:'w',n:T[1],t:2});
        if(f.length&&hp[o]>0)st[o].fx=(st[o].fx||[]).concat(f);
        log.push(`${nm(i)} 發動【放矢】（${n} 層矢），取消拉弓`+(f.length?`：${nm(o)} 獲得 ${T[0]} 層易損${T[1]?`及 ${T[1]} 層虛弱`:''}（2 回合）`:''));
        s0.bow=0;s0.arrow=0;if(n>=4){s0.rarrow=(s0.rarrow||0)+1;log.push(`${nm(i)} 獲得 1 層紅矢（下一張♠點數×3或♣點數×5）`)}}}});
  rm.pair.forEach(i=>{st[i].dihuiBuff=null;st[i].markedCards=[];st[i].markTarget=null});
  if(envActive(rm,'allIn'))rm.pair.forEach(i=>{if(mv[i]&&+mv[i].slice(1)>=10){const lost=environmentLoseLife(rm0,i,5,log,damage,hp,st);if(lost)damage[damage.length-1].environment='allIn';log.push(`🎲【孤注一擲】${nm(i)} 使用基礎點數10以上的牌，回合結束失去${lost}點生命`)}});
  if(envActive(rm,'blueSmoke')){rm.pair.forEach(i=>{if(hp[i]<=0)return;const start=damage.length,dealt=take(hp,i,5,undefined,undefined,'fixed');damage.slice(start).forEach(e=>e.environment='blueSmoke');log.push(`🌫️【青煙】${nm(i)} 的出戰角色受到5點環境傷害（實際${dealt}）`)});guard()}
  if(envActive(rm,'mirrorResonance')&&rm.pair.every(i=>P[i]&&!P[i].none)&&P[rm.pair[0]].s===P[rm.pair[1]].s){const alive=rm.pair.filter(i=>hp[i]>0);alive.forEach(i=>{st[i].shield=(st[i].shield||0)+3;st[i].shieldPersistent=(st[i].shieldPersistent||0)+3;log.push(`🪞【鏡像共鳴】${nm(i)} 獲得3點護盾`)});if(alive.length)cueEnvironment('mirrorResonance','impact',alive,'同花色共鳴・護盾＋3')}
  if(support){const success=rm.env?.support?.round===rm.round&&!!rm.env.support.damage||combat.some(e=>e.source===support.to&&e.seat!==support.to&&e.amount>0);[support.to,support.by].forEach(i=>{if(success&&hp[i]>0){st[i].shield=(st[i].shield||0)+5;st[i].shieldPersistent=(st[i].shieldPersistent||0)+5}else if(!success)environmentLoseLife(rm0,i,5,log,damage,hp,st)});guard();log.push(success?'📣【上阿上阿我的朋友!】支持成功，雙方護盾＋5':'📣【上阿上阿我的朋友!】未造成傷害，雙方生命−5');cueEnvironment('cheer',success?'success':'failed',[support.to,support.by],success?'支持成功・護盾＋5':'支持失敗・生命−5');delete rm.env.support}
  rm.pair.forEach(i=>{const advances=rm.env?.advances?.[i]||[];advances.forEach(a=>{if(a.lastRound===rm.round)return;a.lastRound=rm.round;if(--a.left>0)return;const before=hp[i];if(before>0){hp[i]=healedHp(before,mx(i),envHeal(rm,healingGain(st[i],10)),rm.chars[i],st[i],log,nm(i));recordHeal(i,hp[i]-before);if(rm.chars[i]==='san'&&!lock[i])st[i].feast=(st[i].feast||0)+(st[i].feastBoost?Math.round((hp[i]-before)*1.5):hp[i]-before)}log.push('🩸【預支血量】'+nm(i)+' 完成3次出戰，回復'+(hp[i]-before)+'點生命');cueEnvironment('bloodAdvance','redeem',[i],nm(i)+'・預支到期')});if(rm.env?.advances)rm.env.advances[i]=advances.filter(a=>a.left>0)});
  // 只在完整戰鬥收尾處理出戰期限；立即技能、後備與旁觀均不額外倒數。
  const bombs=rm.pair.flatMap(i=>(st[i].bombs||[]).map(b=>({i,b}))),bombPass=extra?.bombPass||{},bombPassed={};
  bombs.forEach(({i,b})=>{let holder=i;const o=rm.pair.find(j=>j!==i);if(bombPass[i]===b.id){
      if(P[o]&&!P[o].none&&'HD'.includes(P[o].s)&&hp[o]>0){st[i].bombs=(st[i].bombs||[]).filter(x=>x.id!==b.id);st[o].bombs=[...(st[o].bombs||[]),b];holder=o;bombPassed[i]=true;log.push(`💣 ${nm(i)} 傳遞炸彈成功，${nm(o)} 接收炸彈`)}else log.push(`💣 ${nm(i)} 傳遞炸彈失敗`)}
    if(bombPass[i]===b.id)cueEnvironment('bomb',holder===o?'pass':'failed',holder===o?[i,o]:[i],holder===o?`${nm(i)} → ${nm(o)}・傳遞成功`:`${nm(i)}・傳遞失敗`,{reverse:rm.pair.indexOf(i)===1});
    if(b.lastRound===rm.round)return;b.lastRound=rm.round;b.left--;
    if(b.left<=0){st[holder].bombs=(st[holder].bombs||[]).filter(x=>x.id!==b.id);const start=damage.length,dealt=hp[holder]>0?take(hp,holder,15,undefined,undefined,'fixed'):0;damage.slice(start).forEach(e=>e.environment='bomb');log.push(`💣【炸彈!!】${nm(holder)} 的炸彈爆炸，造成15點固定傷害（實際${dealt}）`);guard()}
    else log.push(`💣 ${nm(holder)} 的炸彈剩${b.left}次持有者出戰`);
    if(b.left<=0)cueEnvironment('bomb','explode',[holder],`${nm(holder)}・炸彈爆炸！`);
  });
  rm.pair.forEach(i=>{const U=rm.env?.ultimatums?.[i];if(!U||U.lastRound===rm.round)return;U.lastRound=rm.round;
    if(submittedMv[i]===U.card&&(U.sunId?extra?.sunUsed?.[i]===U.sunId:!extra?.sunUsed?.[i]&&extra?.visibility?.[i]!==false)){delete rm.env.ultimatums[i];log.push(`📜 ${nm(i)} 打出${cs(U.card)}，完成最後通牒`);cueEnvironment('ultimatum','fulfilled',[i],`${nm(i)}・通牒解除`)}
    else if(--U.left<=0){delete rm.env.ultimatums[i];const lost=environmentLoseLife(rm0,i,4,log,damage,hp,st);if(lost)damage[damage.length-1].environment='ultimatum';log.push(`📜【最後通牒】${nm(i)} 未在兩次出戰內打出${cs(U.card)}，失去${lost}點生命`);guard();cueEnvironment('ultimatum','impact',[i],`${nm(i)}・未完成通牒，生命−${lost}`)}
  });
  soberDrunk({...rm0,hp,st,team:tcl,chars:rm.chars},damage,combat,log);if(!extra?.wardenFinish)finishDrunkTurn({...rm0,hp,st,team:tcl,chars:rm.chars},submittedMv,sk,d25HeartGain,log,soundCues);
  flushEnvironmentConversions({...rm,hp,st,team:tcl});
  st.forEach(s=>s.fx=(s.fx||[]).filter(f=>f.source!=='environment'));if(tcl)tcl.forEach(t=>t.forEach(m=>m.st.fx=(m.st.fx||[]).filter(f=>f.source!=='environment')));
  const sunUsed=extra&&extra.sunUsed||{},hands={...rm.hands},up={...rm.up},oc={...rm.oc},pend=[];let deck=[...rm.deck];
  Object.entries(valDodgeCards).forEach(([i,cards])=>{hands[i]=subtractCards(hands[i],cards);up[i]=subtractCards(up[i],cards)});
  rm.pair.forEach(i=>{const c=submittedMv[i];if(!c)return;const recycled=envActive(rm,'handRecycle')&&!cut[i];if(recycled){if(sunUsed[i])log.push(`${nm(i)} 的向日葵手牌回收，保留原期限`);else log.push(`♻️【手牌回收】${nm(i)} 的${cs(c)}返回手牌，不補新牌`);cueEnvironment('handRecycle','redeem',[i],'出牌返回手牌');return}if(sunUsed[i]){hostSunCards[i]=(hostSunCards[i]||[]).filter(x=>x.id!==sunUsed[i]);log.push(`${nm(i)} 打出向日葵的暫時手牌 ${cs(mv[i])}`);return}const k=cut[i]||0,wasUp=extra?.visibility?.[i]===false&&subtractCards(hands[i],up[i]).includes(c)?false:up[i].includes(c);
    hands[i]=removeCardOnce(hands[i],c);if(wasUp)up[i]=removeCardOnce(up[i],c);
    if(k){if(wasUp)oc[i]--;
      if(k===2){const r=rnd(hands[i]);hands[i]=removeCardOnce(hands[i],r);if(up[i].includes(r)){up[i]=removeCardOnce(up[i],r);oc[i]--}}
      log.push(`${nm(i)} 永久失去 ${k} 個卡牌槽`)}
    else if(rm.chars[i]==='firefu'&&st[i].firefuThirst&&c===st[i].firefuCard){hands[i]=[rnd(['S','C','H','D'])+'10'];st[i].firefuCard=hands[i][0];up[i]=[];oc[i]=0}
    else{if(!deck.length)deck=newDeck(Object.values(hands).flat());hands[i]=[...hands[i],deck.shift()]}
  });
  const valDodgeSeats=[...new Set([...Object.keys(valDodgeCards),...Object.keys(valDodgeSun)])];
  valDodgeSeats.forEach(i=>{const n=(valDodgeCards[i]||[]).length+(valDodgeSun[i]||[]).length;
    for(let k=0;k<n;k++){if(!deck.length)deck=newDeck(Object.values(hands).flat());hands[i]=[...hands[i],deck.shift()]}
    log.push(`${nm(i)} 的預知眼閃避消耗${n}張方塊，補抽${n}張手牌（連閃不重複補抽）`);
  });
  enforceFirefuHands({...rm,st,hp,hands,up,oc});const wardenHand=enforceWardenHands({...rm,hp,hands,deck});deck=wardenHand.deck;
  [...new Set([...rm.pair,...valDodgeSeats.map(Number)])].forEach(i=>{if(hp[i]<=0)return;
    const short=oc[i]-up[i].length;
    if(short>0){const hid=subtractCards(hands[i],up[i]);
      if(hid.length>short)pend.push(i);else up[i]=[...up[i],...hid]}});
  if(!extra?.wardenLeg)hostSunCards=Object.fromEntries(Object.entries(hostSunCards).map(([i,a])=>[i,a.filter(x=>x.expires>=rm.round+1&&!(valDodgeSun[i]||[]).includes(x.id))]));
  if(rm.env?.publicSun)Object.keys(rm.env.publicSun).forEach(i=>rm.env.publicSun[i]=rm.env.publicSun[i].filter(c=>(hostSunCards[i]||[]).some(x=>x.id===c.id)));
  if(redrawDo!==undefined){const i=redrawDo,n=hands[i].length,others=Object.keys(hands).filter(k=>+k!==i).flatMap(k=>hands[k]);deck=newDeck(others);hands[i]=deck.splice(0,n);up[i]=hands[i].slice(0,Math.min(n,oc[i]))}
  enforceFirefuHands({...rm,st,hp,hands,up,oc});
  const rdwN=rm.seats.map((_,k)=>(+(rm.rdw&&rm.rdw[k])||0)+(k===redrawDo&&!redrawFree?1:0));
  // 完成侵蝕回合後歸零；先於換人同步，讓下回合與接替角色都從0理智開始。
  ps.forEach(p=>{if(p.corrosion){st[p.i].san=0;log.push(`${nm(p.i)} 的侵蝕回合結束，下回合理智重置為0`)}});
  if(ps.length===2&&ps.every(p=>!p.none&&!p.v&&'SC'.includes(p.s)))ps.forEach(p=>{if(rm.chars[p.i]==='iso'&&hp[p.i]>0&&st[p.i].isoDualRefresh){st[p.i].isoDual=1;st[p.i].isoDualRefresh=0;log.push(`${nm(p.i)} 的【雙源】於雙方互攻後刷新，本次技能的刷新已使用`)}});
  if(!extra?.wardenLeg){st.forEach(s=>{s.isoCut=0;s.isoAdapt=0});if(tcl)tcl.forEach(t=>t.forEach(m=>{m.st.isoCut=0;m.st.isoAdapt=0}))}
  Object.keys(cblk).forEach(i=>{if(cblk[i])xichnLearning.push({route:3,seat:+i,member:rm.act?.[i]??-1})});
  if(wardenPriest(rm0)&&extra?.wardenLeg){const target=rm.pair.find(i=>i!==1),card=submittedMv[1];if(target!==undefined&&card&&!P[1]?.none){const success=!!effd[1],count=success?(+card.slice(1)>=10?3:2):1;addWardenEvidence(stAt(target,xichnExits[target]?.to??-1),card[0],count,log,nm(target))}if(target!==undefined&&submittedMv[target]?.[0]==='H'&&effd[target]){const lost=reduceWardenEvidence(st[target],2);if(lost)log.push(`${nm(target)} 紅心成功，告解證據-${lost}（剩${wardenEvidence(st[target]).n}層）`)}}
  if(wardenFinalPriest(rm0)&&extra?.wardenLeg){const target=rm.pair.find(i=>i!==1),card=submittedMv[1];if(target!==undefined&&card&&!P[1]?.none&&hp[target]>0){const view={...rm0,hp,st,team:tcl},state=stAt(target,xichnExits[target]?.to??-1);applyWardenMaintenance(view,state,'SC'.includes(card[0])?'Exception':'Breakpoint',wardenMaintenanceCardLayers(card,!!effd[1])+wardenMaintenanceBonus(view),log,nm(target))}if(target!==undefined&&submittedMv[target]?.[0]==='H'&&effd[target])reduceWardenMaintenance(st[target],2)}
  recordValorantIncome(rm,valorantEconomy,P,cblk,cntd,refl,effd,log);
  if(rm.teaflower){rm.hands=hands;rm.up=up;const view=teaView(),actions={};rm.pair.forEach(i=>{if(submittedMv[i])actions[i]={retained:envActive(rm,'handRecycle')&&!cut[i],card:submittedMv[i],sunId:sunUsed[i],visible:extra?.visibility?.[i],cardId:extra?.teaCardIds?.[i]}});settleTeaCards(view,rm0,actions,teaDamageCard,redrawDo===undefined?[]:[redrawDo],(i,n,m)=>takeBody(hp,i,n,m.sourceSeat,undefined,'teaFailure',undefined,{c:'teaflower',s:teaSourceState(view,m),member:m.sourceMember}),log);guard();}
  const {team:nteam,act:nact,swapsLeft:nsw,chars:nchars}=settleResolved({hp,st,cp,team:tcl,rres,nut,spk,autoZilu,log,passChars:rm.chars,swaps,instant:!!extra?.wardenLeg});
  for(let q=pend.length-1;q>=0;q--)if(hp[pend[q]]<=0)pend.splice(q,1);
  if(!extra?.wardenLeg)waitXichn({...rm,hp,st,team:nteam,act:nact,chars:nchars},upkeepPair,rm.round,log,xichnBlocked);
  normalizeFingerRevenge({...rm,hp,st,team:nteam,act:nact,chars:nchars});
  d25JustTriggered=claimD25({...rm,hp,chars:nchars},d25List,d25Candidates);
  if(d25JustTriggered){d25Claimed=true;log.push(d25JustTriggered.draw?`🎡【完美決鬥爭奪】${d25JustTriggered.draw.candidates.map(p=>p.name).join('、')} 同回合集滿25點，先公告5秒、點擊爭奪5秒，再轉加權輪盤。`:`🌟【完美決鬥】${d25JustTriggered.name} 取得本局絕技資格！`)}
  const al=hp.filter(h=>h>0).length;
  let nx={...rm,...(valorantEconomy?{valorantEconomy}:{}),cp,sLog:null,rdw:rdwN,team:nteam,act:nact,swapsLeft:nsw,chars:nchars,hp,st,hands:rm.teaflower?rm.hands:hands,up:rm.teaflower?rm.up:up,oc,deck,pend,round:rm.round+1,d25:d25List,d25Claimed,d25Banner:d25JustTriggered||(rm.d25Banner&&rm.d25Banner.round===rm.round+1?rm.d25Banner:null),
    last:{round:rm.round,pair:[...rm.pair],chars:[...rm0.chars],weapons:valorantWeaponSnapshot(rm0).map((g,i)=>Object.hasOwn(attackWeapons,i)?attackWeapons[i]:g),firefuSounds:firefuSoundSnapshot(rm0),soundCues,plays:rm.pair.filter(i=>mv[i]||bombPass[i]).map(i=>({i,card:bombPass[i]?'B0':mv[i],...(mv[i]!==submittedMv[i]?{originalCard:submittedMv[i]}:{}),eff:bombPass[i]?!!bombPassed[i]:!!effd[i],...(sunUsed[i]?{sunId:sunUsed[i]}:{}),...(P[i]?.s==='H'?{healTarget:P[i].healTarget}:{}),rank:P[i]?.r??0,...(P[i]?.gebura?{gebura:true}:{})})),...(Object.keys(valDodgeSun).length?{consumedSun:Object.values(valDodgeSun).flat()}:{}),hits:[...new Set(hits)],damage,combat,healing,log:log.length?log:['本回合沒有造成影響']}};
  if(!extra?.wardenLeg)initTeaflower(nx);
  if(extra?.wardenLeg)return {...nx,status:'playing',winner:null,round:rm.round};
  if(!extra?.wardenFinish){startWardenEnding(nx);if(wardenEndingPending(nx))return nx}
  if(rm.cfg.boss&&(hp[1]<=0&&!wardenCanContinue(nx)||hp[0]<=0&&hp[2]<=0))return offerWardenContinue({...nx,status:'over',winner:hp[1]<=0&&!wardenCanContinue(nx)?0:1});
  if(!rm.cfg.warden&&al<=1)return{...nx,status:'over',winner:al?hp.findIndex(h=>h>0):-1};
  nx=syncDrunkHands(nx);
  if(nx.pend.length)return{...nx,phase:'reveal',deadline:rm.cfg.time?Date.now()+rm.cfg.time*1000:0};
  return extra?.deferAdvance?nx:advance(nx)}

/* ---------- 連線 ---------- */
let busy='',hostSunCards={},hostPrivateMoves={},hostSunRequests={},hostZiluWaits={};
let test=false,testSeat=0;
function nextActor(){if(room&&room.status==='pick'){const order=room.selection.order||[];return order.length?order[(room.selection.step||0)%order.length]:testSeat}if(room&&room.status==='ban'){const order=room.ban.order||[];return order.length?order[(room.ban.step||0)%order.length]:testSeat}if(room&&(room.status==='draft'||room.status==='bossDraft')){const order=room.draft.order||[];return order.length?order[Math.min(room.draft.step||0,order.length-1)]:testSeat}
  if(wardenContinuePending())return [0,2].find(i=>!moves[wardenContinueMoveKey(room,i)])??testSeat;
  if(wardenJudgmentChoicePending())return [0,2].find(i=>moves[wardenJudgmentVoteKey(room,i)]?.yes!==false)??testSeat;
  if(!room||room.status!=='playing')return testSeat;
  if(isoPending())return room.phase==='isoTarget'?room.isoTarget.by:room.isoDuel.seats.find(i=>!room.isoDuel.cards[i])??testSeat;
  if(valorantShopPending())return room.valorantShop.seats.find(i=>!room.valorantShop.confirmed.includes(i))??testSeat;
  if(mirrorPending())return room.mirrorChoice.seat;
  if(environmentTradePending()){const T=room.env.trade;return T.seats.find(i=>T.choices[i]===undefined)??testSeat}
  if(room.phase==='answer'&&room.question)return room.question.target;
  if(room.phase==='play'){if(envActive(room,'cheer')&&room.cfg.n===3&&!room.cfg.boss){const sp=room.seats.findIndex((_,i)=>room.hp[i]>0&&!room.pair.includes(i));if(sp>=0&&!moves['g'+room.round+'_'+sp]&&room.env.support?.round!==room.round)return sp}for(const i of room.pair)if((room.hp[i]>0||room.cfg.warden&&wardenSeatAlive(room,i))&&!moves[room.round+'_'+i]&&(wardenJudgmentArmed()||!kiraCardLocked(room,i)&&(envSilent(room)||!(room.st[i].stun>0))))return i;
    if(room.cfg.n===3&&!room.cfg.boss){const sp=room.seats.findIndex((_,i)=>room.hp[i]>0&&!room.pair.includes(i));if(sp>=0&&!moves['g'+room.round+'_'+sp])return sp}}
  else for(const i of room.pend)if(!moves['v'+room.round+'_'+i])return i;
  return testSeat}
const rd=()=>test?(testSeat=nextActor()):room?room.seats.findIndex(s=>s.id===uid):-1;
const sortedJoins=()=>[...joins].sort((a,b)=>a.t-b.t||(a.id<b.id?-1:1));
// 五秒死線由房主保存；每位出戰玩家獨立計時，回合、角色或可出牌階段改變才重開。
function timeCanPlay(r,i){return !!(r&&r.status==='playing'&&r.phase==='play'&&!kiraCardLocked(r,i)&&r.timeTargets?.includes(i)&&r.pair.includes(i)&&(r.hp[i]>0||r.cfg.warden&&wardenSeatAlive(r,i))&&!envSilent(r)&&!mirrorPending(r)&&!environmentTradePending(r)&&!d25DrawPending(r)&&!(r.st[i].stun>0)&&!(CHARS[r.chars[i]]?.f==='bus'&&r.st[i].san<=-45))}
function refreshTimeClocks(r,now=Date.now()){
  if(!r?.timeTargets?.length){if(r?.timeClocks)r.timeClocks={};return r}const next={};
  r.timeTargets.forEach(i=>{if(!timeCanPlay(r,i))return;const key=`${r.roundBase||1}:${r.round}:${r.act?.[i]??-1}:${r.chars[i]}`,old=r.timeClocks?.[i];next[i]=old?.key===key?{...old}:{key,startedAt:now,endsAt:now+5000}});r.timeClocks=next;return r;
}
function timeMoveDone(r,i,m=moves[r.round+'_'+i]){
  if(m?.purify)return wardenPurifyValid(r,i,m);
  if(m?.revive)return wardenReviveValid(r,i,m);
  if(m?.bomb)return bombMoveValid(r,i,m);
  if(!m)return false;if(m.card)return !!(r.hands[i]?.includes(m.card)&&!(diamondBanned(r,i)&&m.card[0]==='D'));
  if(m.hidden){if(!isHost&&!test)return true;const sm=hostPrivateMoves[r.round+'_'+i];return !!(sm&&(hostSunCards[i]||[]).some(c=>c.id===sm.id&&c.card===sm.card&&c.expires>=r.round))}
  return !!(m.redraw||m.rep&&r.chars[i]==='rien'&&(r.st[i].grace||0)>=9&&!r.st[i].repUsed&&!(r.st[i].sealT>0));
}
function bombMoveValid(r,i,m){return !!(r&&m?.bomb&&m.round===r.round&&r.status==='playing'&&r.phase==='play'&&r.pair.includes(i)&&r.hp[i]>0&&!isoPending(r)&&!valorantShopPending(r)&&!mirrorPending(r)&&!environmentTradePending(r)&&!d25DrawPending(r)&&(envSilent(r)||!(r.st[i].stun>0)&&!(CHARS[r.chars[i]]?.f==='bus'&&r.st[i].san<=-45))&&(r.st[i].bombs||[]).some(b=>b.id===m.bomb)&&!m.card&&!m.hidden&&!m.rep&&!m.redraw&&!m.skill&&!m.art&&!m.lei)}
function passBomb(){const i=rd(),b=room?.st[i]?.bombs?.[0];if(!b||moves[room.round+'_'+i]||!bombMoveValid(room,i,{bomb:b.id,round:room.round})||!timeActionOpen(room,i))return;db.doc(`rooms/${code}/moves/${room.round}_${i}`).set({bomb:b.id,round:room.round});sel=null;sunCardSel=null;skOn=false;artPick='';leiPick=0}
function allowTimeMove(path,data,owner){
  if(wardenForcedExit(room)&&data?.redraw&&String(path).startsWith(`rooms/${code}/moves/`))return false;
  if(wardenContinuePending()&&String(path).startsWith(`rooms/${code}/moves/`))return wardenContinueMoveAllowed(path,data,owner);
  if(String(path).includes('/moves/wardenContinue_'))return false;
  if(wardenJudgmentChoicePending()&&String(path).startsWith(`rooms/${code}/moves/`))return wardenJudgmentMoveAllowed(path,data,owner);
  if(String(path).includes('/moves/wardenJudgment_'))return false;
  if(wardenPaused()&&String(path).startsWith(`rooms/${code}/moves/`))return false;
  if(wardenJudgmentArmed()&&String(path).startsWith(`rooms/${code}/moves/`)){const allowed=String(path).match(/\/moves\/(v?)(\d+)_(\d+)$/);if(!allowed||+allowed[2]!==room.round||allowed[1]!==('reveal'===room.phase?'v':'')||owner!==undefined&&room.seats[+allowed[3]]?.id!==owner||data&&(data.redraw||data.rep||data.bomb))return false}
  if(owner!==undefined&&envActive(room,'cheer')&&/\/moves\/g\d+_\d+$/.test(String(path)))return false;
  const bombMatch=String(path).match(/\/moves\/(\d+)_(\d+)$/);
  if(owner!==undefined&&bombMatch&&moves[bombMatch[1]+'_'+bombMatch[2]]?.bomb)return false;
  if(data&&bombMatch&&(data.bomb||moves[bombMatch[1]+'_'+bombMatch[2]]?.bomb)){
    const i=+bombMatch[2];if(+bombMatch[1]!==room?.round||owner!==undefined&&room.seats[i]?.id!==owner||!bombMoveValid(room,i,data)||moves[room.round+'_'+i])return false;
  }
  if(!data||!room?.timeTargets?.length)return true;const match=String(path).match(/\/moves\/(\d+)_(\d+)$/);if(!match||+match[1]!==room.round)return true;
  const i=+match[2],clock=room.timeClocks?.[i];if(!clock||!timeCanPlay(room,i))return true;
  if(owner!==undefined&&room.seats[i]?.id!==owner)return false;
  return Date.now()<clock.endsAt&&timeMoveDone(room,i,data);
}
function timeActionOpen(r,i){return !wardenPaused(r)&&(!timeCanPlay(r,i)||!r.timeClocks?.[i]||timeMoveDone(r,i)||d25Now()<r.timeClocks[i].endsAt)}
function timeExpiredSeats(r=room,now=Date.now()){return(r?.timeTargets||[]).filter(i=>timeCanPlay(r,i)&&r.timeClocks?.[i]&&now>=r.timeClocks[i].endsAt&&!timeMoveDone(r,i))}
function expireTimeClocks(){
  const expired=timeExpiredSeats();if(!expired.length)return false;const before=room,pair=[...before.pair],lock=`instant_time_${before.round}`;busy=lock;
  const r=resolve(before,{},null,null,null,{timeExpired:expired}),result=r.instantResult;delete r.instantResult;
  const log=[...(before.sLog||[]),...result.log],writes=returnBattleMoves(r,-1,log,pair);r.timeClocks={};
  expired.forEach(i=>{['s','q','a','t','h','w','u25_'].forEach(prefix=>writes.push(db.doc(`rooms/${code}/moves/${prefix}${r.round}_${i}`).set(null)))});
  r.sLog=log;r.instantFx={id:(before.instantFx?.id||0)+1,seat:-1,chars:[...before.chars],...result,log};
  Promise.all(writes).then(()=>save(r)).then(()=>{if(busy===lock)busy='';setTimeout(tick,0)}).catch(()=>{if(busy===lock)busy=''});return true;
}
function timeClockText(i){if(!room||room.hp[i]<=0||room.status!=='playing')return'';if(!room.pair.includes(i))return'⌛ 出戰時限5秒';if(!timeCanPlay(room,i))return'⌛ 5秒死線・暫停';if(timeMoveDone(room,i))return'⌛ 已出牌・倒數停止';const C=room.timeClocks?.[i];return`⌛ 出牌剩餘 ${C?(Math.max(0,C.endsAt-d25Now())/1000).toFixed(1):'5.0'} 秒・逾時死亡`}
function timeClockUI(i){return room.timeTargets?.includes(i)&&room.hp[i]>0&&room.status==='playing'?`<div class="time-death-clock" data-time-clock="${i}" role="timer">${timeClockText(i)}</div>`:''}
function syncTimeClockUI(){document.querySelectorAll('[data-time-clock]').forEach(el=>el.textContent=timeClockText(+el.dataset.timeClock))}
const save=r=>db.doc('rooms/'+code).set(syncDrunkSight(refreshTimeClocks(syncTktHealth(syncWardenState(initTeaflower(r)))))).catch(()=>{busy=''});
// 回合中技能退回已提交的牌；暫時手牌只清除提交紀錄，仍留在原玩家手中。
function returnBattleMoves(r,seat,log,originalPair=r.pair){const changed=originalPair.some((i,k)=>i!==r.pair[k]),writes=[];let returned=false;
  new Set([...originalPair,...r.pair]).forEach(i=>{const key=r.round+'_'+i;
    if((i!==seat||changed)&&moves[key]){if(r.timeClocks){r.timeClocks={...r.timeClocks};delete r.timeClocks[i]}delete hostPrivateMoves[key];delete hostZiluWaits[key];writes.push(db.doc(`rooms/${code}/moves/${key}`).set(null));log.push(`${r.seats[i].name} 已出的牌被退回，可重新出牌`);returned=true}
    if(changed&&moves['g'+r.round+'_'+i])writes.push(db.doc(`rooms/${code}/moves/g${r.round}_${i}`).set(null));
  });if(returned&&r.cfg.time)r.deadline=Date.now()+r.cfg.time*1000;return writes;
}
function sendPrivateTo(userId,msg){const cn=conns.find(x=>x.uid===userId);if(cn)try{cn.send({privateData:msg})}catch(e){}}
function handlePrivateData(m){if(!m)return;if(m.drunkSight){privateDrunkSight=m.drunkSight;render()}if(m.sunCard){if(!privateSunCards.some(x=>x.id===m.sunCard.id))privateSunCards.push(m.sunCard);sunPending=false;render()}if(m.sunCardUpdate){privateSunCards=privateSunCards.map(c=>c.id===m.sunCardUpdate.id?{...m.sunCardUpdate}:c);render()}if(m.sunError){sunPending=false;if(m.dropSun)privateSunCards=privateSunCards.filter(x=>x.id!==m.dropSun);render()}}
function handlePrivateRequest(cn,req){if(req?.type==='hostLastDraft'){acceptHostLastDraft(cn,req);return}if(req?.type==='wardenConsole'){acceptWardenConsole(cn,req);return}if(req?.type==='wardenEndingClick'){acceptWardenEndingClick(cn,req);return}if(wardenPaused()||wardenJudgmentArmed()&&req?.type!=='playSun')return;if(req?.type==='wardenDraft'){acceptWardenDraft(cn,req);return}if(req?.type==='environmentSupport'){acceptEnvironmentSupport(cn,req);return}if(req?.type==='isoTarget'){acceptIsoTarget(cn,req);return}if(req?.type==='isoCard'){acceptIsoCard(cn,req);return}if(isoPending())return;if(req?.type==='isoSkill'){acceptIsoSkill(cn,req);return}if(req?.type==='valorantShop'){acceptValorantShop(cn,req);return}if(valorantShopPending())return;if(req?.type==='mosesBreath'){acceptMosesBreath(cn,req);return}if(req?.type==='mirrorChoice'){acceptMirrorChoice(cn,req);return}if(isoPending()||valorantShopPending()||mirrorPending())return;if(req?.type==='environmentTrade'){acceptEnvironmentTrade(cn,req);return}if(environmentTradePending())return;if(req?.type==='d25Click'){acceptD25Click(cn,req);return}if(!room||!req||!room.seats||envSilent(room)&&req.type==='sun')return;const seat=test?req.seat:room.seats.findIndex(x=>x.id===req.uid);if(seat<0||seat!==req.seat||(cn&&cn.uid&&cn.uid!==req.uid))return;if(cn)cn.uid=req.uid;
  if(req.type==='sun'&&req.round===room.round&&'SCHD'.includes(req.suit)&&room.pair.includes(seat)){
    const p=`rooms/${code}/moves/u${req.round}_${seat}_${req.requestId}`;hostSunRequests[req.requestId]=req.suit;db.doc(p).set({owner:seat,requestId:req.requestId});return}
  if(req.type==='sun'){if(cn)cn.send({privateData:{sunError:true}});else sunPending=false;return}
  if(req.type==='playSun'&&!(req.round===room.round&&room.pair.includes(seat))){if(cn)try{cn.send({privateData:{sunError:true,dropSun:req.id}})}catch(e){}return}
  if(req.type==='playSun'){
    if(!timeActionOpen(room,seat))return;
    const card=(hostSunCards[seat]||[]).find(x=>x.id===req.id);if(!card||card.card!==req.card){if(cn)try{cn.send({privateData:{sunError:true,dropSun:req.id}})}catch(e){}return}hostPrivateMoves[req.round+'_'+seat]={...req};db.doc(`rooms/${code}/moves/${req.round}_${seat}`).set({hidden:true})}}
function cleanup(){stopWardenEndingFx();Object.keys(wardenEndingLocalSeq).forEach(k=>delete wardenEndingLocalSeq[k]);stopWardenBeams();stopWardenFinalCues();clearTimeout(wardenRewriteTimer);wardenRewriteTimer=null;document.body?.classList.toggle('warden-rewriting',false);clearWardenCuePreloads();stopWardenContinueFx();activeSfx.forEach((file,a)=>{if(file.startsWith('assets/audio/sfx/warden/')){a.pause();activeSfx.delete(a)}});stopWardenJoint();if(hpAnim.raf)cancelAnimationFrame(hpAnim.raf);hpAnim.raf=0;stopWardenJudgmentFx();stopWardenFinalFx();wardenImagePreloads.clear();stopWardenShiftFx(true);stopWardenIntroFx(true);battleObservationKey='';battleConfirm=null;resetBgm();damageFx.pending.length=0;combatFx.pending.length=0;combatFx.recoils.length=0;healingFx.pending.length=0;['damageFxLayer','combatFxLayer','healingFxLayer'].forEach(id=>document.getElementById(id)?.remove());Object.keys(hpAnim).forEach(k=>{if(k!=='raf')delete hpAnim[k]});lastR=0;lastInstantFxKey='';teaSelId=null;unsubs.forEach(u=>u());unsubs=[];room=null;joins=[];moves={};sel=null;wardenSelections=[];wardenLane=0;wardenHeartTarget=null;wardenCandleTarget=null;wardenSaveSpend=0;sunCardSel=null;privateSunCards=[];privateDrunkSight=null;sunPending=false;hostSunCards={};hostSunRequests={};hostZiluWaits={};hostEnvironmentChoices={};busy='';hostClockOffset=0;[d25ClickSeq,d25ClickWindows].forEach(o=>Object.keys(o).forEach(k=>delete o[k]));lastSeenD25Round=-1;lastSeenD25Key='';d25BannerSeq=0;hideSlots=[];selUp=null;d25BannerDismissed=false;}
function enter(c){cleanup();code=c;const base='rooms/'+c;
  unsubs.push(db.doc(base).onSnapshot(s=>{const incoming=s.exists?s.data():null,consoleChanged=room&&incoming&&incoming.round===room.round&&incoming.roundBase===room.roundBase&&JSON.stringify(incoming.wardenConsole)!==JSON.stringify(room.wardenConsole),chosen=consoleChanged?{sel,selUp,teaSelId,sunCardSel,wardenSelections,wardenLane,wardenHeartTarget,wardenCandleTarget,wardenSaveSpend}:null;room=incoming;teaSelId=null;sel=null;wardenSelections=[];wardenLane=0;wardenHeartTarget=null;wardenCandleTarget=null;wardenSaveSpend=0;sunCardSel=null;hideSel=[];hideSlots=[];selUp=null;if(chosen){sel=chosen.sel;selUp=chosen.selUp;teaSelId=chosen.teaSelId;sunCardSel=chosen.sunCardSel;wardenSelections=chosen.wardenSelections;wardenLane=chosen.wardenLane;wardenHeartTarget=chosen.wardenHeartTarget;wardenCandleTarget=chosen.wardenCandleTarget;wardenSaveSpend=chosen.wardenSaveSpend}if(room)privateSunCards=privateSunCards.filter(x=>x.expires>=room.round);if(room&&room.last&&room.last.round!==lastR){lastR=room.last.round;sunPending=false;privateSunCards=privateSunCards.filter(x=>!(room.last.consumedSun||[]).includes(x.id));(room.last.plays||[]).forEach(p=>{if(p.sunId)privateSunCards=privateSunCards.filter(x=>x.id!==p.sunId)});playFx(room.last)}syncInstantFx();tick();render()}));
  unsubs.push(db.collection(base+'/joins').onSnapshot(s=>{joins=s.docs.map(d=>({id:d.id,...d.data()}));render()}));
  unsubs.push(db.collection(base+'/moves').onSnapshot(s=>{moves={};s.docs.forEach(d=>moves[d.id]=d.data());if(room)syncDrunkSight(room);tick();render()}));
  render()}
function tick(){ // 房主負責結算、輪盤與逾時
  if(!room||(!test&&(room.hostId?room.hostId!==uid:rd()!==0)))return;
  if(wardenEndingPending()){const at=nextWardenEndingAt(room);if(Date.now()<at){scheduleWardenEndingTick(room);return}const next=advanceWardenEnding(JSON.parse(JSON.stringify(room)));room=next;save(next);return}
  if(wardenRewritePending()){if(Date.now()<room.wardenRewrite.endsAt){syncWardenRewrite();return}save(finishWardenRewrite(JSON.parse(JSON.stringify(room))));return}
  if(wardenContinuePending()){if(busy==='wardenContinueDone')return;const next=advanceWardenContinue(JSON.parse(JSON.stringify(room)));if(JSON.stringify(next.wardenContinue)===JSON.stringify(room.wardenContinue)&&next.status===room.status){scheduleWardenContinueTick(room);return}busy='wardenContinueDone';save(next).finally(()=>{if(busy==='wardenContinueDone')busy='';tick()});return}
  if(wardenJudgmentPending()){if(busy==='wardenJudgmentDone')return;const now=Date.now();if(wardenJudgmentChoicePending()? !wardenJudgmentRefused(room):now<nextWardenJudgmentAt(room)){scheduleWardenJudgmentTick(room);return}busy='wardenJudgmentDone';save(advanceWardenJudgment(JSON.parse(JSON.stringify(room)),now)).finally(()=>{if(busy==='wardenJudgmentDone')busy='';tick()});return}
  if(wardenShiftPending()){
    if(busy==='wardenShiftDone')return;const shift=room.wardenShift,now=Date.now();
    if(now<nextWardenShiftAt(room)){scheduleWardenShiftTick(room);return}
    busy='wardenShiftDone';let next=JSON.parse(JSON.stringify(room));
    if(shift.from===2)next=advanceWardenGrowth(next,now);
    else{promoteWarden(next,shift.to);delete next.wardenShift;next=resumeWardenRound(next)}
    save(next).finally(()=>{if(busy==='wardenShiftDone')busy=''});return;
  }
  if(wardenIntroPending()){if(busy==='wardenIntroDone')return;if(Date.now()<room.wardenIntro.endsAt){scheduleWardenIntroTick(room);return}busy='wardenIntroDone';const next={...startBattle(room),hostId:room.hostId};save(next).finally(()=>{if(busy==='wardenIntroDone')busy=''});return}
  if(busy.startsWith('instant_'))return;
  if(room.status==='pick'){const P=room.selection,step=P.step||0;if(step>=P.order.length){busy='pickDone';save(startStandardBattle(room,P.picks));return}const seat=P.order[step],key='pick'+step;if(busy===key||busy==='pickDone')return;const m=moves[`p${room.roundBase}_${step}_${seat}`];if(!m||!CHARS[m.char]||CHARS[m.char].v3only||CHARS[m.char].hidden||(room.bans||[]).includes(m.char)||P.picks.includes(m.char)||room.cfg.factions&&room.cfg.factions[CHARS[m.char].f]===false)return;busy=key;const picks=[...P.picks];picks[seat]=m.char;const selection={...P,step:step+1,picks};save(step+1>=P.order.length?startStandardBattle({...room,selection},picks):{...room,selection});return}
  if(room.status==='ban'){const B=room.ban,step=B.step||0;if(step>=B.order.length){busy='banDone';save(finishBan(room));return}const seat=B.order[step],key='ban'+step;if(busy===key||busy==='banDone')return;const m=moves[`b${room.roundBase}_${step}_${seat}`];if(!m||!canBanChar(room,m.char))return;busy=key;const picks=[...B.picks];picks[seat]=m.char;const next={...room,ban:{...B,step:step+1,picks}};save(step+1>=B.order.length?finishBan(next):next);return}
  if(room.status==='bossDraft'){const D=room.draft,step=D.step||0;if(step>=D.order.length){busy='bossDraftDone';save(startBattle(room));return}const seat=D.order[step],key='d'+step;if(busy===key||busy==='bossDraftDone')return;if(bossDraftFull(D,seat)){busy=key;let next=step+1;while(next<D.order.length&&bossDraftFull(D,D.order[next]))next++;const r2={...room,draft:{...D,step:next}};save(next>=D.order.length?startBattle(r2):r2);return}const m=moves[`d${room.roundBase}_${step}_${seat}`];if(!m||!CHARS[m.char]||!bossDraftCanPick(D,m.char,seat))return;busy=key;const picks=D.picks.map(p=>[...p]);picks[seat].push(m.char);let next=step+1;while(next<D.order.length&&bossDraftFull({...D,picks},D.order[next]))next++;const r2={...room,draft:{...D,picks,step:next}};save(next>=D.order.length?startBattle(r2):r2);return}
  if(room.status==='draft'){if(busy==='wardenDraft')return;const D=room.draft,step=D.step||0;if(D.picks.every((_,x)=>dfull(D,x))){busy='draftDone';save(startBattle(room));return}const seat=D.order[step%D.order.length],key='d'+step;if(busy===key||busy==='draftDone')return;
    const adv=(picks,pass)=>{const D2={...D,picks,pass:pass||D.pass||D.picks.map(()=>false)};let next=step+1,guard=0;while(guard++<D.order.length&&(dfull(D2,D.order[next%D.order.length])||draftWaitsForLast(D2,D.order[next%D.order.length])))next++;const r2={...room,draft:{...D2,step:next}};save(picks.every((_,x)=>dfull(r2.draft,x))?startBattle(r2):r2)};
    if(dfull(D,seat)||draftWaitsForLast(D,seat)){busy=key;adv(D.picks);return}
    if(!Object.keys(CHARS).some(c=>draftCanPick(D,c,seat))&&D.picks[seat].some(canDeploy)){busy=key;const pass=[...(D.pass||D.picks.map(()=>false))];pass[seat]=true;adv(D.picks,pass);return}
    const m=moves[`d${room.roundBase}_${D.step}_${seat}`];
    if(!m||!draftCanPick(D,m.char,seat))return;
    busy=key;const picks=D.picks.map(p=>[...p]);picks[seat].push(m.char);adv(picks);return}
  if(room.status!=='playing')return;
  if(wardenJudgmentArmed()&&room.phase==='play'){const key=room.phase+room.round;if(busy===key)return;const actions=collectWardenJudgmentMoves(room,room.deadline&&Date.now()>room.deadline);if(!actions)return;busy=key;save(startWardenJudgment(room,actions.mv,actions.extra));return}
  if(isoPending()||valorantShopPending())return;
  syncEnvironmentSunCards();if(isoPending()||valorantShopPending()||mirrorPending()||environmentTradePending())return;
  if(d25DrawPending()){const next=advanceD25Draw(room);if(next){busy='d25Draw'+room.round;save(next)}return}
  if(busy.startsWith('u25_'+room.round+'_'))return;
  if(expireTimeClocks())return;
  if(room.phase==='answer'){const q=room.question;if(!q)return;const savedAnswer=moves['a'+room.round+'_'+q.target],timedOut=!savedAnswer&&room.deadline&&Date.now()>room.deadline,ans=savedAnswer||(timedOut?{answer:'__timeout'}:null);if(!ans||ans.answer===undefined)return;const key='answer'+room.round;if(busy===key)return;busy=key;
    const truthHand=[...(room.hands[q.target]||[]),...(hostSunCards[q.target]||[]).filter(x=>x.expires>=room.round).map(x=>x.card)],truth=q.kind==='max'?Math.max(0,...truthHand.map(c=>+c.slice(1))):truthHand.filter(c=>c[0]===q.suit).length,said=Number(ans.answer),honest=Number.isFinite(said)&&said===truth,st=JSON.parse(JSON.stringify(room.st)),team=room.team?JSON.parse(JSON.stringify(room.team)):null;
    if(!honest){const x=st[q.by];x.expectation=Math.max(0,(x.expectation||0)-1);if(!x.expectation&&!x.notExpecting)x.notExpecting=1;if(team)team[q.by][room.act[q.by]].st=JSON.parse(JSON.stringify(x))}
    const answerText=timedOut?'未回答':`回答「${String(ans.answer)}」`,msg=honest?`${room.seats[q.target].name} ${answerText}（正確），賈丘的期待沒有減少`:`${room.seats[q.target].name} ${answerText}（錯誤），賈丘的期待降至 ${st[q.by].expectation} 層${st[q.by].notExpecting?'；轉為【不再期待】，獲得20層強壯':''}`;
    const nx={...room,phase:'play',question:null,st,team,deadline:room.cfg.time?Date.now()+room.cfg.time*1000:0,sLog:[...(room.sLog||[]),msg]};const qkey='q'+room.round+'_'+q.by,akey='a'+room.round+'_'+q.target;Promise.all([db.doc(`rooms/${code}/moves/${qkey}`).set(null),db.doc(`rooms/${code}/moves/${akey}`).set(null)]).then(()=>save(nx)).then(()=>{busy='';setTimeout(tick,0)}).catch(()=>{busy='' });return}
  const swapsOf=()=>{const o={};room.seats.forEach((_,i)=>{const w=moves['w'+room.round+'_'+i];if(w&&w.to>=0)o[i]=w.to});return o};
  if(room.phase==='play'&&!envSilent(room)){
    for(const i of room.pair){if((room.st[i].san||0)<=-45&&room.chars[i]&&CHARS[room.chars[i]]&&CHARS[room.chars[i]].f==='bus'){const moveKey=room.round+'_'+i,current=moves[moveKey];if(!current||!current.corrosion){const hand=room.hands[i]||[];if(hand.length){const pool=[...hand],cards=room.cfg.warden&&i===1?wardenTargets(room).map(target=>({target,card:pool.splice(Math.floor(Math.random()*pool.length),1)[0]})):null,auto=cards?{card:cards[0].card,cards,corrosion:true}:{card:rnd(hand),corrosion:true};moves[moveKey]=auto;db.doc(`rooms/${code}/moves/${moveKey}`).set(auto);return}}}}
    const askSeat=room.pair.find(i=>moves['q'+room.round+'_'+i]);if(askSeat!==undefined){const q=moves['q'+room.round+'_'+askSeat],target=battleOpponent(room,askSeat),s0=room.st[askSeat],targetKey=target===undefined?'':room.round+'_'+target,targetMove=targetKey&&moves[targetKey];if(room.chars[askSeat]==='jia_qiu'&&q&&target!==undefined&&room.round>=(s0.askReadyRound||0)&&!(s0.sealT>0)&&!(s0.stun>0)&&room.hp[askSeat]>0&&!moves[room.round+'_'+askSeat]&&(!targetMove||targetMove.card||targetMove.hidden)&&(q.kind==='max'||'SCHD'.includes(q.kind))){const st=JSON.parse(JSON.stringify(room.st)),team=room.team?JSON.parse(JSON.stringify(room.team)):null;st[askSeat].askLastRound=room.round;st[askSeat].askReadyRound=room.round+askGap(st[askSeat]);if(team)team[askSeat][room.act[askSeat]].st=JSON.parse(JSON.stringify(st[askSeat]));const askText=q.kind==='max'?'最大點數是多少':`${SU[q.kind]}有幾張`;const nx={...room,phase:'answer',question:{by:askSeat,target,kind:q.kind,suit:q.kind==='max'?null:q.kind},st,team,deadline:room.cfg.time?Date.now()+room.cfg.time*1000:0,sLog:[...(room.sLog||[]),`${room.seats[askSeat].name} 發動賈丘【問】：你的${askText}？${targetMove?'；對方已出的牌退回手牌':''}`]};busy='ask'+room.round;const writes=[db.doc(`rooms/${code}/moves/q${room.round}_${askSeat}`).set(null)];if(targetMove){delete hostPrivateMoves[targetKey];writes.push(db.doc(`rooms/${code}/moves/${targetKey}`).set(null))}Promise.all(writes).then(()=>save(nx)).then(()=>{busy='';setTimeout(tick,0)}).catch(()=>{busy=''});return}else{db.doc(`rooms/${code}/moves/q${room.round}_${askSeat}`).set(null)}}
    const dhSeat=room.pair.find(i=>moves['h'+room.round+'_'+i]);if(dhSeat!==undefined){const dhBusy='dihui'+room.round;if(busy===dhBusy)return;const action=moves['h'+room.round+'_'+dhSeat];if(room.chars[dhSeat]==='dihui'&&action&&['forward','reverse'].includes(action.kind)){const st=JSON.parse(JSON.stringify(room.st)),team=room.team?JSON.parse(JSON.stringify(room.team)):null;st[dhSeat].dihuiNext=action.kind;if(team)team[dhSeat][room.act[dhSeat]].st=JSON.parse(JSON.stringify(st[dhSeat]));const direction=action.kind==='forward'?'順行－憐憫':'逆行－憎惡';busy=dhBusy;db.doc(`rooms/${code}/moves/h${room.round}_${dhSeat}`).set(null).then(()=>save({...room,st,team,sLog:[...(room.sLog||[]),`${room.seats[dhSeat].name} 選擇下回合啟用地彗星【${direction}】`]})).then(()=>{busy='';setTimeout(tick,0)}).catch(()=>{busy=''});return}else db.doc(`rooms/${code}/moves/h${room.round}_${dhSeat}`).set(null)}
    const gainZilu=(i,n,fast)=>{const st=JSON.parse(JSON.stringify(room.st)),team=room.team?JSON.parse(JSON.stringify(room.team)):null;st[i].ziluStrong=(st[i].ziluStrong||0)+n;if(fast)st[i].ziluFastRound=room.round;if(team)team[i][room.act[i]].st=JSON.parse(JSON.stringify(st[i]));save({...room,team,st,sLog:[...(room.sLog||[]),`${room.seats[i].name} 的子路${fast?'【超高速】先於對手出牌，立即':'等待超過10秒，'}獲得${n}層強壯`]})};
    for(const i of room.pair){const j=battleOpponent(room,i),key0=room.round+'_'+i,m=moves[key0],s0=room.st[i],played=m&&(m.card||(m.hidden&&hostPrivateMoves[key0]?.card));if(room.chars[i]!=='zilu'||!played||room.hp[i]<=0||s0.sealT>0||s0.stun>0||moves[room.round+'_'+j]){delete hostZiluWaits[key0];continue}
      if(s0.ziluFast&&s0.ziluFastRound!==room.round){gainZilu(i,2,true);return}
      if(!hostZiluWaits[key0])hostZiluWaits[key0]=Date.now();if(Date.now()-hostZiluWaits[key0]>=10000){hostZiluWaits[key0]=Date.now()+86400000;gainZilu(i,1,false);return}}
    const fi=room.pair.find(i=>moves['t'+room.round+'_'+i]);if(fi!==undefined){const key0='t'+room.round+'_'+fi;if(busy===key0)return;busy=key0;const next={...room,team:JSON.parse(JSON.stringify(room.team)),st:JSON.parse(JSON.stringify(room.st))},wood=next.team[fi].find(m=>m.c==='wood'&&!m.dead),opp=battleOpponent(room,fi),opKey=opp===undefined?'':room.round+'_'+opp,opMove=opKey&&moves[opKey];
      if(!wood||(wood.st.torchUses||0)<=0||next.st[fi].torchRound===room.round){db.doc(`rooms/${code}/moves/${key0}`).set(null);return}
      wood.st.torchUses--;next.st[fi].torchRound=room.round;
      next.sLog=[...(room.sLog||[]),`${room.seats[fi].name} 發動【火炬】：本回合點數×2（剩${wood.st.torchUses}次）`];busy=`instant_${room.round}_${fi}`;const writes=returnBattleMoves(next,fi,next.sLog);writes.push(db.doc(`rooms/${code}/moves/${key0}`).set(null));Promise.all(writes).then(()=>save(next)).then(()=>{busy='';setTimeout(tick,0)}).catch(()=>{busy=''});return}
    const sunKey=Object.keys(moves).find(k=>k.startsWith('u'+room.round+'_')&&moves[k]&&moves[k].owner!==undefined);if(sunKey){const action=moves[sunKey],i=+action.owner,key0=sunKey,suit=hostSunRequests[action.requestId];if(busy===key0)return;if(busy===room.phase+room.round||busy==='ask'+room.round||busy==='answer'+room.round||busy==='dihui'+room.round||busy.indexOf('t'+room.round+'_')===0)return;if(!suit){db.doc(`rooms/${code}/moves/${key0}`).set(null);return}busy=key0;const sunflower=room.team&&room.team[i]&&room.team[i].find(m=>m.c==='sunflower'&&!m.dead);
      if(!room.pair.includes(i)||!sunflower||(sunflower.st.sun||0)<4){delete hostSunRequests[action.requestId];if(test||room.seats[i].id===uid)sunPending=false;else sendPrivateTo(room.seats[i].id,{sunError:true});db.doc(`rooms/${code}/moves/${key0}`).set(null);busy='';return}
      const team=JSON.parse(JSON.stringify(room.team)),sun=team[i].find(m=>m.c==='sunflower'&&!m.dead);sun.st.sun-=4;const card={id:'sun-'+room.round+'-'+i+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),card:suit+'7',expires:room.round+1};hostSunCards[i]=[...(hostSunCards[i]||[]),card];if(test||room.seats[i].id===uid){privateSunCards.push(card);sunPending=false}else sendPrivateTo(room.seats[i].id,{sunCard:card});delete hostSunRequests[action.requestId];
      const next={...room,team,sLog:[...(room.sLog||[]),`${room.seats[i].name} 消耗4點陽光發動向日葵技能`]};busy=`instant_${room.round}_${i}`;const writes=returnBattleMoves(next,i,next.sLog);writes.push(db.doc(`rooms/${code}/moves/${key0}`).set(null));Promise.all(writes).then(()=>save(next)).then(()=>{busy='';setTimeout(tick,0)}).catch(()=>{busy=''});return}
  }
  const key=room.phase+room.round;if(busy===key)return;
  const late=room.deadline&&Date.now()>room.deadline;
  if(room.phase==='play'){const mv={};
    const d25Seat=envSilent(room)?-1:room.seats.findIndex((_,i)=>{const m=moves['u25_'+room.round+'_'+i],d=room.d25&&room.d25[i];return m&&m.skill&&d25SkillAvailable(room,i,m.skill)&&d&&d.ready&&!d.used&&!(room.st[i].stun>0)&&room.hp[i]>0});
    if(d25Seat>=0){const k2='u25_'+room.round+'_'+d25Seat;if(busy===k2)return;busy=k2;useD25(d25Seat,moves[k2].skill);return}
    const sq=envSilent(room)?undefined:room.pair.find(i=>{const m=moves['s'+room.round+'_'+i],C=CHARS[room.chars[i]];return m&&m.s&&C&&C.ss&&(C.ss.repeat||room.st[i].sRound!==room.round)&&cpOf(i)>=C.ss.cost&&!(room.st[i].sealT>0)&&!(room.st[i].stun>0)&&(!C.ss.can||C.ss.can(room,i))});
    if(sq!==undefined){const k2='s'+room.round+'_'+sq;if(busy===k2)return;busy=k2;useS(sq);return}
    const rp=envSilent(room)||room.cfg.warden?undefined:room.pair.find(i=>{const m=moves[room.round+'_'+i];return m&&m.rep&&room.chars[i]==='rien'&&(room.st[i].grace||0)>=9&&!room.st[i].repUsed&&!(room.st[i].sealT>0)});
    if(rp!==undefined){busy=key;mv[rp]=null;save(resolve(room,mv,null,{[rp]:true},swapsOf()));return}
    const rq=room.cfg.warden?undefined:room.pair.find(i=>{const m=moves[room.round+'_'+i];return !kiraCardLocked(room,i)&&m&&m.redraw});
    if(rq!==undefined){busy=key;save(resolve(room,{},null,{},swapsOf(),{redraw:rq}));return}
    if(room.cfg.warden){const actions=collectWardenMoves(room,late);if(!actions)return;busy=key;save(resolveWardenBattle(room,actions.mv,actions.sk,swapsOf(),actions.extra));return}
    const sk={},sunUsed={},bombPass={},teaCardIds={};for(const i of room.pair){if(kiraCardLocked(room,i)||!envSilent(room)&&room.st[i].stun>0)continue;const m=moves[room.round+'_'+i];if(m){teaCardIds[i]=m.teaCardId;if(m.bomb){if(!bombMoveValid(room,i,m)){db.doc(`rooms/${code}/moves/${room.round}_${i}`).set(null);return}bombPass[i]=m.bomb;mv[i]=null;sk[i]=false}else if(m.hidden){const sm=hostPrivateMoves[room.round+'_'+i],sc=sm&&(hostSunCards[i]||[]).find(x=>x.id===sm.id);if(!sm||!sc||sc.card!==sm.card){delete hostPrivateMoves[room.round+'_'+i];db.doc(`rooms/${code}/moves/${room.round}_${i}`).set(null);if(!test&&room.seats[i].id!==uid)sendPrivateTo(room.seats[i].id,{sunError:true,dropSun:sm&&sm.id});else{sunPending=false;if(sm)privateSunCards=privateSunCards.filter(x=>x.id!==sm.id)}return}mv[i]=sc.card;sunUsed[i]=sc.id;sk[i]=room.chars[i]==='spider'?{spiderSpend:sm.spiderSpend||0}:(sm.lei!==undefined&&sm.lei!==null)?{lei:sm.lei}:(sm.art||!!sm.skill)}else{mv[i]=m.card;sk[i]=room.chars[i]==='spider'?{spiderSpend:m.spiderSpend||0}:(m.lei!==undefined&&m.lei!==null)?{lei:m.lei}:(m.art||!!m.skill)}}else if(late&&!timeCanPlay(room,i)){const validHand=diamondBanned(room,i)?room.hands[i].filter(c=>c[0]!=='D'):room.hands[i];mv[i]=rnd(validHand.length?validHand:room.hands[i]);}else return}
    let gs=null;if(room.cfg.n===3&&!room.cfg.boss){const sp=room.seats.findIndex((_,i)=>room.hp[i]>0&&!room.pair.includes(i)),m=moves['g'+room.round+'_'+sp];
      if(sp>=0){if(m)gs={seat:sp,...m};else if(!late)return;else if(envActive(room,'cheer'))gs={seat:sp,support:rnd(room.pair)}}}
    busy=key;save(resolve(room,mv,gs,sk,swapsOf(),{sunUsed,bombPass,teaCardIds,visibility:Object.fromEntries(room.pair.map(i=>[i,moves[room.round+'_'+i]?.visible]))}))}
  else{const up={...room.up};
    for(const i of room.pend){const m=moves['v'+room.round+'_'+i],hid=subtractCards(room.hands[i],up[i]),need=hid.length-Math.max(0,room.oc[i]-up[i].length);
      let hide=null;if(drunkActive(room,i)&&room.st[i].drunkSip>=4)hide=hid.slice().sort(()=>Math.random()-.5).slice(0,need);if(!hide&&m&&Array.isArray(m.hide)&&m.hide.length===need&&containsCards(hid,m.hide))hide=m.hide;
      if(!hide){if(late)hide=hid.slice().sort(()=>Math.random()-.5).slice(0,need);else return}
      up[i]=[...up[i],...subtractCards(hid,hide)]}
    busy=key;save(advance({...room,up,pend:[]}))}}
setInterval(()=>{tick();const e=document.getElementById('tm');
  if(e&&room&&room.deadline)e.textContent=d25DrawPending()?'🎡 抽選中':'⏱ '+Math.max(0,Math.ceil((room.deadline-d25Now())/1000))+' 秒'},1000);
setInterval(()=>{if((isHost||test)&&(room?.timeTargets?.length||d25DrawPending()&&Date.now()>=room.d25Banner.draw.endsAt))tick();syncD25DrawUI();syncTimeClockUI()},100);
const num=(id,lo,hi,d)=>{const v=parseInt(document.getElementById(id).value);return Math.min(hi,Math.max(lo,isNaN(v)?d:v))};
let roomConnecting=false;
function readRoomCode(id){const c=val(id).toUpperCase();if(c&&!/^[A-Z0-9]{2,16}$/.test(c)){alert('房間代碼請使用2～16個英文字母或數字，不含空白與符號。');return null}document.getElementById(id).value=c;return c}
function setRoomConnecting(on){roomConnecting=on;['createRoomBtn','joinRoomBtn','lobbyCreateToggle','lobbyJoinToggle',...LOBBY_MODES.map(m=>'lobbyMode'+m.id)].forEach(id=>{const e=document.getElementById(id);if(e)e.disabled=on})}
async function createRoom(){
  if(roomConnecting)return;
  const hand=num('hand',3,8,6),mode=val('mode'),cfg=modeConfig(val('n'),{hostId:uid,events:!!document.getElementById('events')?.checked,ban:!!document.getElementById('ban')?.checked,hp:num('hp',5,100,25),hand,open:mode==='open'?num('open',1,hand,4):0,time:num('time',0,300,0),chars:document.getElementById('chars').checked,factions:{bus:document.getElementById('fac_bus').checked,pvz:document.getElementById('fac_pvz').checked,trails:document.getElementById('fac_trails').checked,valorant:document.getElementById('fac_valorant')?.checked!==false}});
  if(cfg.boss&&Object.keys(CHARS).filter(c=>!CHARS[c].hidden&&!isPvz(c)&&(!cfg.factions||cfg.factions[CHARS[c].f]!==false)).length<5){alert('Boss挑戰賽需要至少5名已啟用且可選的角色，才能讓三方選滿角色槽。');return}
  if(cfg.v3&&!cfg.boss&&!v3RosterOk(cfg.factions,cfg.n)){alert(v3RosterMessage(cfg.n));return}
  if(!cfg.v3&&cfg.chars&&!normalRosterOk(cfg.factions,cfg.n*(cfg.ban?2:1))){alert(`目前啟用陣營中可選角色不足 ${cfg.n*(cfg.ban?2:1)} 名${cfg.ban?'（需要預留每人各禁用一名的名額）':''}，請多啟用一些陣營。`);return}
  const custom=readRoomCode('hostCode');if(custom===null)return;
  const c=custom||Math.floor(Math.random()*36**4).toString(36).padStart(4,'0').toUpperCase();
  setRoomConnecting(true);
  try{await netHost(c);await db.doc(`rooms/${c}/joins/${uid}`).set({name:val('name'),t:Date.now(),cfg});enter(c)}
  catch(e){netClose();alert(e&&e.type==='unavailable-id'?`房間代碼「${c}」已被使用，請換一個代碼。`:'無法建立房間（連不上配對伺服器），請稍後重試')}
  finally{setRoomConnecting(false)}}
async function joinRoom(){if(roomConnecting)return;const c=readRoomCode('code');if(!c)return;
  setRoomConnecting(true);
  try{await netJoin(c);await db.doc(`rooms/${c}/joins/${uid}`).set({name:val('name'),t:Date.now()+1e12});enter(c)} // +1e12：確保房主一定排在最前面
  catch(e){netClose();alert('找不到這個房間，或連線失敗')}
  finally{setRoomConnecting(false)}}
const v3RosterOk=(f,n=2)=>Object.keys(CHARS).filter(c=>!CHARS[c].hidden&&canDeploy(c)&&dwt(c)===1&&(!f||f[CHARS[c].f]!==false)).length>=n*4;
const ROSTER_MSG='3v3 目前勾選的陣營，可上場的一格角色不足（至少需要 8 名，以供雙方各禁用一名後仍可選滿），請多勾選幾個陣營（建議保留 Limbus）。';
const v3RosterMessage=n=>n===3?'3v3v3 需要至少 12 名可上場的一格角色，以供三方各禁用一名後仍可選滿，請多啟用一些陣營。':ROSTER_MSG;
const normalRosterOk=(f,n)=>Object.keys(CHARS).filter(c=>!CHARS[c].hidden&&!CHARS[c].v3only&&(!f||f[CHARS[c].f]!==false)).length>=n;
let lobbyView='home',lobbyNormalChars=true,lobbyFixedMode=false;
const LOBBY_MODES=[{id:'2',n:'兩人戰',d:'一對一決鬥'},{id:'3',n:'三人戰',d:'輪流交鋒與猜牌'},{id:'33',n:'3v3',d:'雙人・角色隊伍'},{id:'333',n:'3v3v3',d:'三人・隊伍與猜牌'},{id:'boss',n:'Boss 挑戰',d:'三人・協力迎戰'}];
const roomMode=cfg=>cfg.boss?'boss':cfg.v3?(cfg.n===3?'333':'33'):String(cfg.n);
const modeConfig=(value,cfg)=>{const boss=value==='boss',v3=boss||value==='33'||value==='333';return{...cfg,warden:false,n:boss||value==='333'?3:value==='33'?2:+value,v3,boss,chars:v3||!!cfg.chars}};
const battleModeName=cfg=>cfg.warden?'6v1':cfg.boss?'Boss 挑戰賽':cfg.v3?(cfg.n===3?'3v3v3 角色戰':'3v3 角色戰'):cfg.n===3?'三人對戰':'兩人對戰';
function lobbyDraftCornerUI(){const host=sortedJoins()[0];return !room&&code&&host?.cfg&&roomMode(host.cfg)==='333'?'<button type="button" class="draft-corner" onclick="reserveHostLastDraft()"></button>':''}
function reserveHostLastDraft(){const j=sortedJoins(),host=j[0];if(room||!code||!host?.cfg||roomMode(host.cfg)!=='333'||!j.some(p=>p.id===uid))return;const req={type:'hostLastDraft',uid,hostId:host.id};if(isHost)acceptHostLastDraft(null,req);else if(hostConn)hostConn.send({privateRequest:req})}
function acceptHostLastDraft(cn,req){const j=sortedJoins(),host=j[0];if(!isHost||room||!code||!host?.cfg||roomMode(host.cfg)!=='333'||req?.hostId!==host.id||(cn?cn.uid:uid)!==req.uid||!j.some(p=>p.id===req.uid))return false;
  const factions=Object.fromEntries(Object.keys(FAC).map(f=>[f,f==='bus']));
  if(host.cfg.hostLastDraft&&host.cfg.singleSlotDraft&&Object.keys(factions).every(f=>host.cfg.factions?.[f]===factions[f]))return true;
  const {id,...join}=host;db.doc(`rooms/${code}/joins/${id}`).set({...join,cfg:{...host.cfg,hostLastDraft:true,singleSlotDraft:true,factions}});return true}
function setRoomMode(value){const j=sortedJoins(),host=j[0];if(room||!host||host.id!==uid||!LOBBY_MODES.some(m=>m.id===value))return;const cfg=modeConfig(value,host.cfg);
  if(cfg.boss&&Object.keys(CHARS).filter(c=>!CHARS[c].hidden&&!isPvz(c)&&(!cfg.factions||cfg.factions[CHARS[c].f]!==false)).length<5){alert('Boss挑戰賽需要至少5名已啟用且可選的角色。');render();return}
  if(cfg.v3&&!cfg.boss&&!v3RosterOk(cfg.factions,cfg.n)){alert(v3RosterMessage(cfg.n));render();return}
  if(!cfg.v3&&cfg.chars&&!normalRosterOk(cfg.factions,cfg.n*(cfg.ban?2:1))){alert('啟用陣營的可選角色不足，請多啟用一些陣營。');render();return}
  const {id,...join}=host;db.doc(`rooms/${code}/joins/${id}`).set({...join,cfg});}
function setLobbyView(view){if(roomConnecting||!['home','create','join'].includes(view))return;lobbyView=view;
  const shell=document.getElementById('lobbyShell');if(shell)shell.setAttribute('data-view',view);
  ['create','join'].forEach(key=>{const panel=document.getElementById(key==='create'?'lobbyCreate':'lobbyJoin'),button=document.getElementById(key==='create'?'lobbyCreateToggle':'lobbyJoinToggle');if(panel)panel.hidden=view!==key;if(button)button.setAttribute('aria-expanded',String(view===key))});
}
function setLobbyMode(value){if(roomConnecting||!LOBBY_MODES.some(m=>m.id===value))return;document.getElementById('n').value=value;updateLobbyOptions()}
function updateLobbyOptions(){const mode=document.getElementById('n').value,chars=document.getElementById('chars'),ban=document.getElementById('ban'),fixed=mode==='33'||mode==='333'||mode==='boss';
  if(fixed){if(!lobbyFixedMode)lobbyNormalChars=!!chars.checked;chars.checked=true}else if(lobbyFixedMode)chars.checked=lobbyNormalChars;else lobbyNormalChars=!!chars.checked;
  lobbyFixedMode=fixed;ban.disabled=fixed||!chars.checked;chars.disabled=fixed;
  LOBBY_MODES.forEach(m=>{const button=document.getElementById('lobbyMode'+m.id);if(button)button.setAttribute('aria-pressed',String(mode===m.id))});
  const hint=document.getElementById('lobbyCharacterHint');if(hint)hint.textContent=fixed?'此模式固定啟用角色選角。':'兩人戰、三人戰可自由開關。';
  const open=document.getElementById('open');if(open)open.disabled=document.getElementById('mode').value==='hidden';
}
function setLobbyBan(enabled){const j=sortedJoins(),host=j[0];if(room||!host||host.id!==uid||!host.cfg.chars||host.cfg.v3||host.cfg.boss)return;const cfg={...host.cfg,ban:!!enabled};if(!normalRosterOk(cfg.factions,cfg.n*(enabled?2:1))){alert('啟用角色禁用需要至少每人兩名可選角色，請多啟用一些陣營。');render();return}const {id,...join}=host;db.doc(`rooms/${code}/joins/${id}`).set({...join,cfg})}
function val(id){const v=document.getElementById(id).value.trim();
  if(id==='name'){myName=v||'玩家'+Math.floor(Math.random()*90+10);try{localStorage.setItem('d25name',myName)}catch(e){}return myName}return v}
function startGame(){const j=sortedJoins(),host=j[0];if(room||!host||host.id!==uid||j.length<host.cfg.n)return;const cfg=host.cfg;db.doc('rooms/'+code).set(startRoom(j.slice(0,cfg.n).map(x=>({id:x.id,name:x.name})),cfg))}
function rematch(){if(!room||room.status!=='over')return;const base=room.round+1;busy='';moves={};const cfg={...room.cfg};if(cfg.v3)cfg.v3=true;save(startRoom(room.seats,cfg,base))}
const pick=(c,visible=null,cardId=null)=>{if(sel!==c)spiderPick=0;if(wardenPaused()||isoPending()||valorantShopPending()||mirrorPending())return;if(!wardenJudgmentArmed()&&diamondBanned(room,rd())&&c[0]==='D'){alert('受到連續防守懲罰：本回合無法出方塊牌！');return;}if(room?.cfg.warden&&rd()===1){setWardenCard(c,visible);return}sel=c;selUp=visible;teaSelId=cardId;sunCardSel=null;wardenHeartTarget=null;wardenCandleTarget=null;render()};
function pickSunCard(id){if(sunCardSel!==id)spiderPick=0;if(isoPending()||valorantShopPending()||mirrorPending())return;const sc=privateSunCards.find(x=>x.id===id);if(sc){const mark=wardenConsoleMark(room,rd(),sc.card,false,null,id);if(mark)clickWardenConsole(mark.id);sel=sc.card;sunCardSel=id;selUp=publicTemporaryCards(room,rd()).some(c=>c.id===id);wardenHeartTarget=null;wardenCandleTarget=null;render()}}
function activateTorch(){if(isoPending()||valorantShopPending()||mirrorPending()||envSilent(room)||environmentTradePending())return;const s=rd();db.doc(`rooms/${code}/moves/t${room.round}_${s}`).set({owner:s})}
function activateSun(){if(isoPending()||valorantShopPending()||mirrorPending()||envSilent(room)||environmentTradePending())return;const s=rd(),requestId='sunreq-'+room.round+'-'+s+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),req={type:'sun',uid,seat:s,round:room.round,suit:sunSuitPick,requestId};sunPending=true;render();setTimeout(()=>{if(sunPending){sunPending=false;render()}},6000);if(test||isHost)handlePrivateRequest(null,req);else if(hostConn)hostConn.send({privateRequest:req})}
function play(){if(wardenPaused())return;if(room?.cfg.warden&&rd()===1){playWardenCards();return}if(battleObservationActive())return;if(isoPending()||valorantShopPending()||mirrorPending()||environmentTradePending())return;const s=rd();if(!wardenJudgmentArmed()&&kiraCardLocked(room,s)||moves[room.round+'_'+s]||!sel)return;if(!wardenJudgmentArmed()&&sel&&sel[0]==='D'&&diamondBanned(room,s)){alert('受到連續防守懲罰：本回合無法出方塊牌！');return;}const teaChosen=teaPlayedRecord(room,s,sel,sunCardSel,selUp,teaSelId),base={...(room.cfg.warden&&s!==1&&sel[0]==='H'?{target:wardenHeartTarget??s}:{}),...(wardenCandleTarget&&wardenCandleTargetValid(room,s,sel,wardenCandleTarget)?{candleTarget:wardenCandleTarget}:{}),visible:selUp,teaCardId:teaChosen?.id||null,spiderSpend:room.chars[s]==='spider'&&!envSilent(room)&&!(room.st[s].sealT>0)?spiderSpendAmount(room.st[s],sel[0],spiderPick):0,skill:!envSilent(room)&&!!skOn&&!!skillLabel(s),art:envSilent(room)?null:artPick||null,lei:!envSilent(room)&&room.chars[s]==='lei'?leiVal(s):null};if(sunCardSel){const c=privateSunCards.find(x=>x.id===sunCardSel);if(!c)return;const req={type:'playSun',uid,seat:s,round:room.round,id:c.id,card:c.card,...base};if(test||isHost){hostPrivateMoves[room.round+'_'+s]=req;db.doc(`rooms/${code}/moves/${room.round}_${s}`).set({hidden:true})}else if(hostConn){hostConn.send({privateRequest:req})}}else db.doc(`rooms/${code}/moves/${room.round}_${s}`).set({card:sel,...base});sel=null;sunCardSel=null;wardenHeartTarget=null;wardenCandleTarget=null;skOn=false;artPick='';leiPick=0;spiderPick=0;}
function reveal(c){if(isoPending()||valorantShopPending()||mirrorPending())return;db.doc(`rooms/${code}/moves/v${room.round}_${rd()}`).set({card:c})}
function guess(g){if(envActive(room,'cheer')||environmentTradePending()||d25DrawPending())return;if(isoPending()||valorantShopPending()||mirrorPending())return;const e=document.getElementById('rw');db.doc(`rooms/${code}/moves/g${room.round}_${rd()}`).set({guess:g,reward:e?e.value:'heal'})}
function supportPlayer(target){const seat=rd(),req={type:'environmentSupport',uid,seat,round:room.round,target};if(test||isHost)acceptEnvironmentSupport(null,req);else if(hostConn)hostConn.send({privateRequest:req})}
function acceptEnvironmentSupport(cn,req){
  if(!isHost||!room||room.status!=='playing'||room.phase!=='play'||!envActive(room,'cheer')||room.cfg.n!==3||room.cfg.boss||isoPending()||valorantShopPending()||mirrorPending()||environmentTradePending()||d25DrawPending()||!req||req.round!==room.round||!Number.isInteger(req.seat)||!Number.isInteger(req.target)||room.hp[req.seat]<=0||room.pair.includes(req.seat)||!room.pair.includes(req.target)||room.hp[req.target]<=0||moves['g'+room.round+'_'+req.seat])return false;
  if(test?!!cn:((cn?cn.uid:uid)!==req.uid||room.seats[req.seat]?.id!==req.uid))return false;
  if(room.env.support?.round===room.round)return false;
  const r=JSON.parse(JSON.stringify(room));r.env.support={round:r.round,by:req.seat,to:req.target};r.st[req.target].fx.push({k:'s',n:5,t:1,source:'environment',round:r.round,cheer:r.round});syncEnvironmentTeam(r);queueEnvironmentFx(r,'cheer','support',[],[],{focus:[{seat:req.target,member:r.act?.[req.target]??-1}],detail:`${r.seats[req.seat].name} 支持 ${r.seats[req.target].name}・強壯＋5`});
  save(r);db.doc(`rooms/${code}/moves/g${r.round}_${req.seat}`).set({support:req.target});return true;
}
function specView(s){const gm=moves['g'+room.round+'_'+s]||(room.env?.support?.round===room.round&&room.env.support.by===s?{support:room.env.support.to}:null),nm=room.seats.map(p=>esc(p.name));
  if(envActive(room,'cheer'))return gm?`<p>你已支持 ${nm[gm.support]||'出戰玩家'}，等待結果…</p>`:`<div><b>📣 上阿上阿我的朋友!・支持一名玩家</b><p class="mut">支持的人本回合強壯＋5；造成傷害時，你與他各獲得5點護盾，否則各失去5點生命。</p><div class="row">${room.pair.map(i=>`<button onclick="supportPlayer(${i})">支持 ${nm[i]}</button>`).join('')}</div></div>`;
  if(gm)return`<div>你已選擇${gm.guess<0?'不猜':'猜 '+nm[gm.guess]+' 較大'}，等待結果…</div>`;
  return`<div><b>你是旁觀者：猜誰出的數字較大？</b><div class="mut">猜中可選擇回 1 血，或對較大者造成 1 點傷害；雙方點數相同則自損 5 點；不猜無事發生。</div>
  <div class="row"><label>猜中獎勵 <select id="rw"><option value="heal">我回復 1 血</option><option value="dmg">對較大者 1 點傷害</option></select></label></div>
  <div class="row">${room.pair.map(i=>`<button onclick="guess(${i})">猜 ${nm[i]} 較大</button>`).join('')}<button onclick="guess(-1)">不猜</button></div></div>`}
function applyD25Effect(r,i,skillId,forced=false){
  armXichn(r);
  if(!d25SkillAvailable(r,i,skillId))return {log:['隊伍需有存活馬蒂亞斯才可發動此技能。'],hits:[],damage:[],combat:[],healing:[],soundCues:[]};
  const d=r.d25[i];
  const o=r.pair.find(x=>x!==i&&environmentEnemies(r,i).includes(x)&&r.hp[x]>0)??environmentEnemies(r,i).find(x=>r.hp[x]>0),nm=n=>r.seats[n].name;
  const c=r.chars&&r.chars[i],originalChars=[...(r.chars||[])],originalWeapons=valorantWeaponSnapshot(r),originalFirefuSounds=firefuSoundSnapshot(r),attackHits=[],attackDamage=[],attackCombat=[],attackHealing=[],soundCues=[];
  if(c==='firefu'&&skillId===2)originalFirefuSounds[i]='assets/audio/sfx/characters/attack_firefu3.mp3';
  if(c==='lkd'&&skillId===1)soundCues.push({seat:i,file:lkdSoundFile(4),replaceAttack:true});
  if(c==='spider'&&skillId===1)soundCues.push({seat:i,file:spiderSoundFile(3),replaceAttack:true});
  if(c==='sad'&&skillId===1)soundCues.push({seat:i,file:sadSoundFile(4)});
  d.aura={char:c||'',start:Date.now()};
  const charSkills=(CHARS[c]&&CHARS[c].d25Skills)||[
    {id:1,name:'崩滅之刃',desc:'對敵方造成 15 點直接傷害'},
    {id:2,name:'天命之泉',desc:'自身回復 15 點生命'}
  ];
  const skObj=charSkills.find(s=>s.id===skillId)||charSkills[0];
  const L=[`🌟【25絕技】${nm(i)} 於回合開始發動【${skObj.name}】！`];
  if(c==='iso'&&skillId===1&&r.d25Batch){r.d25Batch.iso.push({seat:i,member:r.act?.[i]??-1});return {log:L,hits:[],damage:[],combat:[],healing:[]}}
  if(c==='iso'&&skillId===1){if(r.status!=='playing'||r.hp[i]<=0||!forced&&(r.phase!=='play'||r.st[i].sealT>0||r.st[i].stun>0))return {log:L,hits:[],damage:[],combat:[],healing:[]};beginIsoUltimate(r,i,L,false);return {log:L,hits:[],damage:[],combat:[],healing:[]}}
  let charactersSettled=false;

  if(skObj&&typeof skObj.instantFx==='function'){
    const msg=skObj.instantFx(r,i,o);
    if(msg&&typeof msg==='object'){L.push(...(msg.log||[]));attackHits.push(...(msg.hits||[]));attackDamage.push(...(msg.damage||[]));attackCombat.push(...(msg.combat||[]));attackHealing.push(...(msg.healing||[]));soundCues.push(...(msg.soundCues||[]));charactersSettled=!!msg.charactersSettled}else if(msg)L.push(msg);
  }else if(skillId===1){
    const dmg=envAttack(r,15),shieldBefore=o!==undefined?r.st[o].shield||0:0;
    let actualDmg=o!==undefined?prepareDamage(r,r.chars[o],r.st[o],dmg,L,nm(o)):0;
    if(o!==undefined){
      const shield=absorbShield(r.st[o],actualDmg),abs=shield.absorbed;
      actualDmg=shield.remaining;
      if(abs>0)attackHits.push(i);
      addDamageFx(attackDamage,r,o,abs,undefined,true);
      L.push(`${nm(o)} 的護盾抵擋了 ${abs} 點傷害`);
    }
    const before=o!==undefined?r.hp[o]:0;
    if(o!==undefined){
      r.hp[o]=Math.max(0,damagedHp(before,characterMaxHp(r,o,r.chars[o],r.st[o]),actualDmg,r.chars[o],r.st[o],L,nm(o),true));
      recordHpLoss(r.chars[o],r.st[o],before,r.hp[o]);
      addDamageFx(attackDamage,r,o,before-r.hp[o]);
      if(r.hp[o]<before)attackHits.push(i);
      L.push(`對 ${nm(o)} 造成 ${dmg} 點傷害（實際血量扣除 ${before-r.hp[o]} 點，剩餘 ${r.hp[o]}）！`);
    }
    addCombatDamage(attackCombat,r,i,attackDamage,0,'',shieldBefore);
  }else if(skillId===2){
    const healAmt=envHeal(r,healingGain(r.st[i],15)),before=r.hp[i],mHp=characterMaxHp(r,i,r.chars[i],r.st[i]);
    r.hp[i]=healedHp(before,mHp,healAmt,r.chars[i],r.st[i],L,nm(i));addHealingFx(attackHealing,r,i,r.hp[i]-before);
    L.push(`回復了 ${r.hp[i]-before} 點生命（血量：${before} → ${r.hp[i]}）${healingNote(r.st[i])}！`);
  }

  if(!charactersSettled){environmentThorns(r,i,attackDamage.slice(),L,attackDamage);attackHealing.slice().forEach(e=>shareEnvironmentHealing(r,e.seat,e.amount,L,attackHealing))}
  markEnvironmentSupportDamage(r,{combat:attackCombat,hits:attackHits,damage:attackDamage});
  settleInstantBattle(r,L,charactersSettled,{damage:attackDamage,combat:attackCombat,healing:attackHealing,hits:attackHits,soundCues});

  syncEnvironmentTeam(r);
  return {log:L,hits:[...new Set(attackHits)],damage:attackDamage,combat:attackCombat,healing:attackHealing,chars:originalChars,weapons:originalWeapons,firefuSounds:originalFirefuSounds,soundCues};
}
function activateCrisis(r,log){
  const alive=r.seats.map((_,i)=>i).filter(i=>r.hp[i]>0),low=Math.min(...alive.map(i=>r.hp[i])),i=rnd(alive.filter(i=>r.hp[i]===low));if(i===undefined)return;
  queueEnvironmentFx(r,'crisis','arrival',[],[],{caster:i,focus:[{seat:i,member:r.team?r.act[i]:-1}],detail:`${r.seats[i].name}・雙25絕技啟動`});
  resetEnvironmentD25Banner(r);r.d25Claimed=true;r.d25[i].val=25;r.d25[i].bust=false;r.d25[i].used=true;r.d25[i].ready=false;
  // 環境直接啟用效果；沉默仍保留，交易稍後繼續，但不得帶回舊的絕技資格。
  const trade=r.env.trade,silence=environmentEvents(r).filter(e=>e.id==='silence');if(trade){delete trade.banner;r.env.trade=null}
  if(silence.length){if(r.env.event?.id==='silence')r.env.event=null;r.env.extraEvents=(r.env.extraEvents||[]).filter(e=>e.id!=='silence')}
  const damage=[],healing=[],hits=[],combat=[],soundCues=[],chars=[...r.chars],weapons=valorantWeaponSnapshot(r),pair=[...r.pair];
  log.push(`🌟【危機就是轉機】${r.seats[i].name} 同時啟用兩種25絕技！`);
  // 先啟用輔助招，再施放進攻招；離索兩招都完成後才建立決滅快照。
  for(const skill of (['kira','spider'].includes(chars[i])?[1,2]:[2,1])){const result=applyD25Effect(r,i,skill,true);log.push(...result.log);damage.push(...result.damage);healing.push(...result.healing);hits.push(...result.hits);combat.push(...result.combat);soundCues.push(...(result.soundCues||[]))}
  r.d25[i].aura.crisis=true;
  if(trade)r.env.trade=trade;silence.forEach(e=>{if(['mirror','skyfall'].includes(e.source))r.env.extraEvents.push(e);else r.env.event=e});
  r.env.deferredD25=null;r.d25Banner=null;if(r.env.trade)delete r.env.trade.banner;
  returnBattleMoves(r,-1,log,pair);syncEnvironmentTeam(r);
  if(r.isoDuel)r.isoDuel.snapshot=JSON.parse(JSON.stringify({...r,isoDuel:undefined,phase:'play'}));
  r.instantFx={id:(r.instantFx?.id||0)+1,seat:i,chars,weapons,hits:[...new Set(hits)],damage,combat,healing,soundCues,log:[...log]};
  return i;
}
function beginQueuedIsoUltimate(r,log){if(r.status!=='playing'||isoPending(r))return;while(r.isoUltimateQueue?.length){const q=r.isoUltimateQueue.shift();if(r.hp[q.seat]>0&&r.chars[q.seat]==='iso'&&(r.act?.[q.seat]??-1)===q.member&&beginIsoUltimate(r,q.seat,log,false))return}delete r.isoUltimateQueue}
function activateFrenzy(r,log){
  const seats=r.seats.map((_,i)=>i).filter(i=>r.hp[i]>0),caster=rnd(seats);if(caster===undefined)return;
  const chars=[...r.chars],weapons=valorantWeaponSnapshot(r),pair=[...r.pair],start=Date.now(),damage=[],healing=[],hits=[],combat=[],soundCues=[];
  queueEnvironmentFx(r,'frenzy','arrival',[],[],{caster,focus:seats.map(seat=>({seat,member:r.act?.[seat]??-1})),detail:'全員雙25絕技啟動'});
  resetEnvironmentD25Banner(r);r.d25Claimed=true;r.env.frenzyBgmSeat=caster;
  seats.forEach(i=>Object.assign(r.d25[i],{val:25,bust:false,used:true,ready:false}));
  const trade=r.env.trade,silence=environmentEvents(r).filter(e=>e.id==='silence');if(trade){delete trade.banner;r.env.trade=null}
  if(r.env.event?.id==='silence')r.env.event=null;r.env.extraEvents=(r.env.extraEvents||[]).filter(e=>e.id!=='silence');
  // 原角色全數施放完畢後，才一起判定倒下、復活與換人；離索決滅最後啟動。
  r.d25Batch={iso:[]};log.push('🔥【發瘋啦!!】所有存活玩家同時啟用兩種25絕技！');
  for(const skill of [2,1])for(const i of seats){const result=applyD25Effect(r,i,['kira','spider'].includes(chars[i])?3-skill:skill,true);log.push(...result.log);damage.push(...result.damage);healing.push(...result.healing);hits.push(...result.hits);combat.push(...result.combat);soundCues.push(...(result.soundCues||[]))}
  const autoZilu=r.d25Batch.autoZilu||{},spk=r.d25Batch.spk||{};r.isoUltimateQueue=[...(r.isoUltimateQueue||[]),...r.d25Batch.iso];delete r.d25Batch;
  seats.forEach(i=>r.d25[i].aura={char:chars[i],start,crisis:true});
  if(trade)r.env.trade=trade;silence.forEach(e=>{if(['mirror','skyfall'].includes(e.source))r.env.extraEvents.push(e);else r.env.event=e});
  r.env.deferredD25=null;r.d25Banner=null;if(r.env.trade)delete r.env.trade.banner;
  syncEnvironmentTeam(r);r.seats.forEach((_,i)=>{if(spk[i])r.hp[i]=0;else r.hp[i]=protectLife(r.chars[i],r.st[i],r.hp[i],r.seats[i].name,log)});Object.assign(r,settleCharacters(r,{hp:r.hp,st:r.st,cp:r.cp,team:r.team,autoZilu,spk,log,instant:true}));settleInstantBattle(r,log,true);returnBattleMoves(r,-1,log,pair);syncEnvironmentTeam(r);
  r.instantFx={id:(r.instantFx?.id||0)+1,seat:caster,chars,weapons,hits:[...new Set(hits)],damage,combat,healing,soundCues,log:[...log]};
  beginQueuedIsoUltimate(r,log);return caster;
}
function useD25(i,skillId){
  if(battleObservationActive())return;
  if(isoPending()||valorantShopPending()||mirrorPending()||envSilent(room)||d25DrawPending()||environmentTradePending()||!timeActionOpen(room,i))return;
  const r=JSON.parse(JSON.stringify(room)),d=r.d25?.[i];if(!d||!d.ready||d.used||!d25SkillAvailable(r,i,skillId))return;
  const lock=`u25_${r.round}_${i}`;busy=lock;
  try{
    d.ready=false;d.used=true;const pair=[...r.pair],result=applyD25Effect(r,i,skillId);
    if(isoPending(r)){save(r);return}
    returnBattleMoves(r,i,result.log,pair);r.sLog=result.log;
    r.instantFx={id:(r.instantFx?.id||0)+1,seat:i,...result};
    if(r.cfg.time)r.deadline=Date.now()+r.cfg.time*1000;
    db.doc(`rooms/${code}/moves/u25_${r.round}_${i}`).set(null);save(r);
  }finally{if(busy===lock)busy=''}tick();
}
function useS(i){if(wardenJudgmentArmed()||wardenPaused()||isoPending()||valorantShopPending()||mirrorPending()||envSilent(room)||environmentTradePending()||!sAvail(i)||!timeActionOpen(room,i))return;const S=CHARS[room.chars[i]].ss,r=JSON.parse(JSON.stringify(room)),o=battleOpponent(r,i),nm=n=>r.seats[n].name,lock=`instant_${r.round}_${i}`;busy=lock;
  try{const originalMember=r.act?.[i]??-1,originalChar=r.chars[i];r.cp=[...(r.cp||r.seats.map(()=>0))];r.cp[i]-=S.cost;r.st[i].sRound=r.round;
    const L=[['lkd','kira','drunk'].includes(r.chars[i])?`${nm(i)} 發動【${S.n}】`:`${nm(i)} 發動S技【${S.n}】（-${S.cost} CP）`];
    if(S.fx){const m=S.fx(r,i,o);if(m)L.push(m)}
    returnBattleMoves(r,(r.act?.[i]??-1)!==originalMember||r.chars[i]!==originalChar?-1:i,L);r.sLog=L;syncEnvironmentTeam(r);if(r.cfg.time)r.deadline=Date.now()+r.cfg.time*1000;db.doc(`rooms/${code}/moves/s${r.round}_${i}`).set(null);save(r);
  }finally{if(busy===lock)busy=''}tick();
}
const sAvail=s=>{const C=CHARS[room.chars[s]],S=C&&C.ss;return !envSilent(room)&&S&&cpOf(s)>=S.cost&&(S.repeat||room.st[s].sRound!==room.round)&&!(room.st[s].sealT>0)&&!(room.st[s].stun>0)&&(!S.can||S.can(room,s))};
function playS(){if(wardenJudgmentArmed()||wardenPaused()||isoPending()||valorantShopPending()||mirrorPending()||environmentTradePending())return;db.doc(`rooms/${code}/moves/s${room.round}_${rd()}`).set({s:1})}
function leave(){cleanup();netClose();test=false;code=null;lobbyView='home';lobbyNormalChars=true;lobbyFixedMode=false;render()}
function unlockTest(){if(prompt('請輸入測試區密碼')==='1234'){setLobbyView('create');document.getElementById('tbox').style.display=''}else alert('密碼錯誤')}
function startTest(){const hand=num('hand',3,8,6),mode=val('mode'),cfg=modeConfig(val('n'),{events:!!document.getElementById('events')?.checked,ban:!!document.getElementById('ban')?.checked,hp:num('hp',5,100,25),hand,open:mode==='open'?num('open',1,hand,4):0,time:0,chars:document.getElementById('chars').checked,factions:{bus:document.getElementById('fac_bus').checked,pvz:document.getElementById('fac_pvz').checked,trails:document.getElementById('fac_trails').checked,valorant:document.getElementById('fac_valorant')?.checked!==false}});
  if(cfg.boss&&Object.keys(CHARS).filter(c=>!CHARS[c].hidden&&!isPvz(c)&&(!cfg.factions||cfg.factions[CHARS[c].f]!==false)).length<5){alert('Boss挑戰賽需要至少5名已啟用且可選的角色，才能讓三方選滿角色槽。');return}
  if(cfg.v3&&!cfg.boss&&!v3RosterOk(cfg.factions,cfg.n)){alert(v3RosterMessage(cfg.n));return}
  if(!cfg.v3&&cfg.chars&&!normalRosterOk(cfg.factions,cfg.n*(cfg.ban?2:1))){alert(`目前啟用陣營中可選角色不足 ${cfg.n*(cfg.ban?2:1)} 名${cfg.ban?'（需要預留每人各禁用一名的名額）':''}，請多啟用一些陣營。`);return}
  const pick=[0,1,2].slice(0,cfg.n).map(i=>document.getElementById('tc'+i).value);
  cleanup();netClose();test=true;isHost=true;uid='test';code='TEST';
  const r=startRoom(Array.from({length:cfg.n},(_,i)=>({id:'t'+i,name:'玩家'+(i+1)})),cfg);
  if(cfg.chars&&!cfg.v3&&!cfg.ban&&pick.some(Boolean)){const chosen=[...pick],rest=Object.keys(CHARS).filter(k=>!chosen.includes(k)&&!CHARS[k].v3only&&!CHARS[k].hidden&&(!cfg.factions||cfg.factions[CHARS[k].f]!==false)).sort(()=>Math.random()-.5);chosen.forEach((c,i)=>{if(!c)chosen[i]=rest.shift()||null});Object.assign(r,startStandardBattle(r,chosen))}
  enter('TEST');db.doc('rooms/TEST').set(r)}

/* ---------- 畫面 ---------- */
const markedFor=(owner,c)=>!envSilent(room)&&owner!==undefined&&!!(room&&room.st&&room.chars&&room.chars.some((ch,i)=>ch==='dihui'&&room.st[i].markTarget===owner&&(room.st[i].markedCards||[]).includes(c)));
const chip=(c,owner,up=true,slot=null,sunId=null)=>!drunkCanSee(room,rd(),owner,up)?'<span class="chip" title="牌面隱藏">🂠</span>':`<span class="chip ${RED[c[0]]?'r':''} ${markedFor(owner,c)?'dihui-marked':''}" title="${markedFor(owner,c)?'已被地彗星標記':' '}">${teaCardMark(room,owner,c,up,slot,sunId)?teaFlowerIcon()+NM(+c.slice(1)):cs(c)}</span>`;
function drunkCardTxt(c,owner,up=true){return drunkCanSee(room,rd(),owner,up)?cs(c):'🂠 隱藏牌'}
function drunkLogText(text){return drunkActive(room,rd())&&!drunkAwake(room.st[rd()])&&room.st[rd()].drunkSip>=6?text.replace(/[♠♥♡♣♦](?:10|1[123]|[2-9AJQK])/g,'🂠'):text}
function pickDrunkCard(up,index){const i=rd(),pool=up?room.up[i]:subtractCards(room.hands[i],room.up[i]);if(pool[index])pickWardenMarkedCard(pool[index],up,index,teaCardRecord(room,i,pool[index],up,index)?.id)}
function toggleDrunkHide(index){const i=rd(),hidden=subtractCards(room.hands[i],room.up[i]);if(hidden[index])toggleHide(hidden[index],index)}
let privateDrunkSight=null;
function wardenSubmitted(r,i,viewer=rd()){
  if(!r?.cfg.warden||!wardenAllies(r,i,viewer)||r.status!=='playing'||r.phase!=='play')return null;
  const m=moves[r.round+'_'+i];if(!m)return null;
  if(m.purify)return drunkCanSee(r,viewer,i,false)&&wardenPurifyValid(r,i,m)?{card:'P0',target:m.purify.target,purify:true}:null;
  if(m.revive)return drunkCanSee(r,viewer,i,false)&&wardenReviveValid(r,i,m)?{card:'R0',target:m.revive.target,revive:true}:null;
  if(m.redraw||m.rep||r.st[i].stun>0||kiraCardLocked(r,i))return null;
  const packet=privateDrunkSight?.code===code&&privateDrunkSight.round===r.round?privateDrunkSight.plays?.[i]:null,action=m.hidden?(isHost||test?hostPrivateMoves[r.round+'_'+i]:packet):m;
  if(!action?.card||!wardenHeartValid(r,i,action.card,action.target)||!drunkCanSee(r,viewer,i,!!action.visible))return null;
  return {card:action.card,visible:action.visible,target:action.card[0]==='H'?action.target??i:1,...(action.candleTarget?{candleTarget:action.candleTarget}:{})};
}
function wardenSightPacket(r,viewer){
  const awake=drunkActive(r,viewer)&&drunkAwake(r.st[viewer]),cards={},plays={};
  r.seats.forEach((_,i)=>{if(awake||wardenAllies(r,viewer,i)&&drunkCanSee(r,viewer,i,false))cards[i]=(hostSunCards[i]||[]).filter(c=>c.expires>=r.round).map(c=>({...c}));const p=wardenSubmitted(r,i,viewer);if(p)plays[i]=p});return{code,round:r.round,cards,plays};
}
function syncDrunkSight(r){if(!isHost&&!test)return r;r.seats.forEach((seat,i)=>{if(seat.id===uid||test)return;sendPrivateTo(seat.id,{drunkSight:wardenSightPacket(r,i)})});return r}
function drunkTemporaryCards(i){if(drunkActive(room,rd())&&drunkAwake(room.st[rd()])||wardenAllies(room,rd(),i)&&drunkCanSee(room,rd(),i,false))return (isHost||test?hostSunCards[i]:privateDrunkSight?.code===code&&privateDrunkSight.round===room.round?privateDrunkSight.cards[i]:null)||publicTemporaryCards(room,i);return publicTemporaryCards(room,i)}
function visibleHandUI(i){const up=room.up[i]||[],awake=drunkActive(room,rd())&&drunkAwake(room.st[rd()]),cards=awake||wardenAllies(room,rd(),i)&&rd()!==i&&drunkCanSee(room,rd(),i,false)?room.hands[i]||[]:up;return cards.map((c,k)=>chip(c,i,up.includes(c),cards===up?k:null)).join('')+drunkTemporaryCards(i).map(c=>chip(c.card,i,publicTemporaryCards(room,i).some(x=>x.id===c.id),null,c.id)).join('')}
function wardenPreviewJoint(i,card){if(!wardenAllies(room,i,wardenFriend(i)))return 0;const p=wardenSubmitted(room,wardenFriend(i),i);return p&&p.card[0]===card[0]&&'SCHD'.includes(card[0])?3:0}
const WARDEN_JOINT_IMAGE='assets/images/effects/warden/joint.png';
let wardenJointFrame=0,wardenJointKey='';
function stopWardenJoint(){if(wardenJointFrame)cancelAnimationFrame(wardenJointFrame);wardenJointFrame=0;wardenJointKey='';document.getElementById('wardenJointLayer')?.remove()}
function wardenJointView(){
  if(!room?.cfg.warden||!room.st||wardenPaused())return null;
  const current=[0,2].some(i=>moves[room.round+'_'+i]),cards=current?[0,2].map(i=>wardenSubmitted(room,i)):room.last?.plays.filter(p=>[0,2].includes(p.i));
  if(!cards||cards.length!==2||cards.some(p=>!p?.card||!'SCHD'.includes(p.card[0]))||cards[0].card[0]!==cards[1].card[0]||!current&&(!cards.every(p=>p.joint===3)||!cards.every(p=>drunkCanSee(room,rd(),p.i,true))))return null;
  return {key:code+':'+(current?room.round:room.last.round)+':'+cards.map(p=>p.card).join(':')};
}
function scheduleWardenJoint(){if(wardenJointFrame)cancelAnimationFrame(wardenJointFrame);wardenJointFrame=requestAnimationFrame(()=>{wardenJointFrame=0;drawWardenJoint()})}
function drawWardenJoint(){
  const view=wardenJointView();if(!view){stopWardenJoint();return}
  const slots=[0,2].map(i=>document.querySelectorAll(`.clash-slot[data-clash-seat="${i}"] .pc`)[0]);if(slots.some(x=>!x?.getBoundingClientRect)){stopWardenJoint();return}
  const boxes=slots.map(x=>x.getBoundingClientRect()),points=boxes.map(b=>({x:b.left+b.width/2,y:b.top+b.height/2})),dx=points[1].x-points[0].x,dy=points[1].y-points[0].y,length=Math.hypot(dx,dy),angle=Math.atan2(dy,dx)*180/Math.PI;
  if(!length){stopWardenJoint();return}
  const ux=dx/length,uy=dy/length,insets=boxes.map(b=>Math.min(ux?b.width/2/Math.abs(ux):Infinity,uy?b.height/2/Math.abs(uy):Infinity)),gap=length-insets[0]-insets[1];
  if(gap<=0){stopWardenJoint();return}
  let layer=document.getElementById('wardenJointLayer');if(!layer){layer=document.createElement('div');layer.id='wardenJointLayer';layer.className='warden-joint-layer';layer.setAttribute('aria-hidden','true');document.body.appendChild(layer)}
  if(wardenJointKey!==view.key){layer.classList.add('linking');wardenJointKey=view.key}
  layer.style.left=points[0].x+'px';layer.style.top=points[0].y+'px';layer.style.width=length+'px';layer.style.transform=`rotate(${angle}deg)`;
  const iconSize=Math.min(40,gap),chainLength=(gap-iconSize)/2,count=Math.ceil(chainLength/10),chain=Array.from({length:count},(_,n)=>`<i style="left:${(n+.5)/count*100}%"></i>`).join('');
  layer.innerHTML=`<span class="warden-joint-chain" style="left:${insets[0]}px;width:${chainLength}px">${chain}</span><span class="warden-joint-chain" style="left:${insets[0]+chainLength+iconSize}px;width:${chainLength}px">${chain}</span><img class="warden-joint-icon" src="${WARDEN_JOINT_IMAGE}" alt="" style="left:${insets[0]+gap/2}px;width:${iconSize}px;height:${iconSize}px;transform:translate(-50%,-50%) rotate(${-angle}deg)">`;
}
window.addEventListener?.('resize',scheduleWardenJoint);
const teaFlowerIcon=()=>'<svg class="tea-camellia" viewBox="0 0 48 48" role="img" aria-label="山茶花"><path d="M25 30C37 23 44 29 43 39C34 41 28 37 25 30Z" fill="#477849"/><g fill="#b93748" stroke="#742338" stroke-width="1"><ellipse cx="24" cy="15" rx="10" ry="13"/><ellipse cx="24" cy="15" rx="10" ry="13" transform="rotate(72 24 24)"/><ellipse cx="24" cy="15" rx="10" ry="13" transform="rotate(144 24 24)"/><ellipse cx="24" cy="15" rx="10" ry="13" transform="rotate(216 24 24)"/><ellipse cx="24" cy="15" rx="10" ry="13" transform="rotate(288 24 24)"/></g><g fill="#e47483"><ellipse cx="24" cy="20" rx="6" ry="8"/><ellipse cx="24" cy="20" rx="6" ry="8" transform="rotate(120 24 24)"/><ellipse cx="24" cy="20" rx="6" ry="8" transform="rotate(240 24 24)"/></g><circle cx="24" cy="24" r="4" fill="#e9bd61"/></svg>';
function cardFace(c,tag='',bloom=false){
  if(c==='P0')return'<span class="card-pip">0</span><small class="card-visibility">淨化・無花色</small>';
  if(c==='R0')return'<span class="card-pip">0</span><small class="card-visibility">復活・無花色</small>';
  if(c==='B0')return'<span class="card-pip" aria-label="炸彈">💣</span><small class="card-visibility">傳遞炸彈</small>';
  const pip=bloom?teaFlowerIcon():SU[c[0]],corner=`<b>${NM(+c.slice(1))}</b><i>${pip}</i>`;
  return`<span class="card-corner" aria-hidden="true">${corner}</span><span class="card-pip" aria-hidden="true">${pip}</span><span class="card-corner reverse" aria-hidden="true">${corner}</span>${tag?`<small class="card-visibility">${tag}</small>`:''}`;
}
function cardBtn(c,h,up,owner,slot=null){
  const consoleMark=h==='pick'?wardenConsoleMark(room,owner,c,up,slot):null;
  if(!drunkCanSee(room,rd(),owner,up))return `<button class="c concealed ${sel===c&&selUp===up?'sel':''}" aria-label="隱藏牌" title="牌面隱藏，選牌後不顯示預覽" onclick="pickDrunkCard(${!!up},${slot??0})"><span class="card-pip">🂠</span><small class="card-visibility">隱藏牌</small>${wardenConsoleIcon(consoleMark)}</button>`;
  const teaRecord=teaCardRecord(room,owner,c,up,slot),bloom=!!teaRecord&&teaBlooms(room,owner).some(m=>m.id===teaRecord.id),thirst=owner!==undefined&&firefuThirstCard(room,owner,c);
  const U=room.env?.ultimatums?.[owner],ultimatum=owner!==undefined&&U?.card===c&&!U.sunId&&(slot===null||up&&room.up[owner].indexOf(c)===slot),marked=markedFor(owner,c),noDiamond=!!(h==='pick'&&owner!==undefined&&!wardenJudgmentArmed()&&diamondBanned(room,owner)&&c[0]==='D');
  return`<button class="c ${RED[c[0]]?'r':''} ${sel===c&&(selUp===null||selUp===up)&&(!teaSelId||teaSelId===teaRecord?.id)?'sel':''} ${up?'up':'concealed'} ${cmdCard(c)?'cmd':''} ${ultimatum?'marked':''} ${marked?'dihui-marked':''} ${h==='pick'&&environmentFateCard(c)?'fate-card':''} ${noDiamond?'disabled':''}" ${noDiamond?'disabled':''} ${h==='pick'?wardenCardDragAttrs(c,up,owner):''} aria-label="${cs(c)}，${up?'明牌':'暗牌'}" aria-pressed="${sel===c&&(selUp===null||selUp===up)&&(!teaSelId||teaSelId===teaRecord?.id)}" title="${esc((thirst?'🔥渴火：牌面10點，仍受加成，永久暗牌｜':'')+(noDiamond?'🚫 連續防守懲罰：本回合無法出方塊牌｜':'')+(ultimatum?'📜最後通牒標記｜':'')+(marked?'☄已被地彗星標記｜':'')+estimate(c,h))}" onclick="${noDiamond?'':h==='pick'&&consoleMark?`pickWardenMarkedCard('${c}',${!!up},${slot??'null'},${teaRecord?.id||'null'})`:h+'(\''+c+'\''+(h==='pick'?','+up+','+(teaRecord?.id||'null'):'')+')'}">${cardFace(c,bloom?'開花 · 山茶花':thirst?'渴火 · 暗牌':ultimatum?'最後通牒':'',bloom)}${h==='pick'?environmentCardMark(c)+environmentHandFxUI(c,owner,ultimatum)+wardenConsoleIcon(consoleMark):''}</button>`;
}
function tempSunButtons(s){return(s===rd()?privateSunCards:[]).map(x=>{const consoleMark=wardenConsoleMark(room,s,x.card,false,null,x.id),bloom=teaCardMark(room,s,x.card,false,null,x.id),marked=room.env?.ultimatums?.[s]?.sunId===x.id,publicCard=publicTemporaryCards(room,s).some(c=>c.id===x.id);if(!drunkCanSee(room,s,s,publicCard))return`<button class="c sun concealed ${sunCardSel===x.id?'sel':''}" aria-label="隱藏暫時手牌" title="下回合結束時消失" onclick="pickSunCard('${x.id}')"><span class="card-pip">🂠</span><small class="card-visibility">暫時手牌</small>${wardenConsoleIcon(consoleMark)}</button>`;return`<button class="c sun ${publicCard?'up':'concealed'} ${marked?'marked':''} ${environmentFateCard(x.card)?'fate-card':''} ${RED[x.card[0]]?'r':''} ${sunCardSel===x.id?'sel':''}" ${wardenCardDragAttrs(x.card,publicCard,s,x.id)} aria-label="${cs(x.card)}，向日葵暫時手牌" aria-pressed="${sunCardSel===x.id}" title="${esc('向日葵暫時手牌，點數'+(+x.card.slice(1))+'；下回合結束時消失。'+estimate(x.card,'pick'))}" onclick="pickSunCard('${x.id}')">${cardFace(x.card,bloom?'開花 · 山茶花':marked?'最後通牒':publicCard?'公開暫時手牌':'暫時手牌',bloom)}${environmentCardMark(x.card)}${environmentHandFxUI(x.card,s,marked)}${wardenConsoleIcon(consoleMark)}</button>`}).join('')}
function handSelectionUI(s){
  if(sel&&!drunkCanSee(room,s,s,sunCardSel?publicTemporaryCards(room,s).some(x=>x.id===sunCardSel):!!selUp))return '<div class="selection-preview"><span>已選隱藏牌</span><p>牌面隱藏，出牌時依實際卡牌結算。</p></div>';
  const temp=sunCardSel&&privateSunCards.find(x=>x.id===sunCardSel),card=temp?temp.card:sel;
  return`<div class="selection-preview ${card?'':'empty'}"><span>${card?'已選 '+cs(card):'預計效果'}</span>${environmentFateCard(card)?'<small class="fate-selection-note">✨ 命運加成＋5（固定點數效果仍優先）</small>':''}<p>${card?esc(estimate(card,'pick')):'選擇一張手牌，查看預計效果。'}</p></div>`;
}
function playHandUI(s,mine,up,names){if(room.cfg.warden&&s===1)return wardenHandUI(s,mine,up);
  const cards=[...mine];
  const supply=room.env?.supply[s]||0;
  const skills=wardenJudgmentArmed()?'':`<div class="skill-controls">${room.st[s].bombs?.length?`<button type="button" class="bomb-pass-btn ${room.st[s].bombs[0].left<=2?'imminent':''}" onclick="passBomb()">💣 傳遞炸彈・取代出牌（剩${room.st[s].bombs[0].left}次出戰）</button>`:''}${supply?`<span class="mut">📦 補給折抵×${supply}（下次換牌-5血）</span>`:''}${skillLabel(s)?`<label><input type="checkbox" ${skOn?'checked':''} onchange="skOn=this.checked;render()"> 發動【${skillLabel(s)}】</label>`:''}${artSel(s)}${leiSel(s)}${spiderSel(s)}${repOk(s)?'<button onclick="playRep()">Furioso-Replica</button>':''}${sAvail(s)?`<button onclick="playS()">${['lkd','kira','drunk'].includes(room.chars[s])?'主動技':'S技'}【${CHARS[room.chars[s]].ss.n}】${CHARS[room.chars[s]].ss.cost?'· '+CHARS[room.chars[s]].ss.cost+'CP':''}</button>`:''}<button class="redraw-button ${supply?'supply-ready':''}" ${wardenForcedExit(room)?'disabled':''} onclick="playRedraw()">${supply?'<span class="supply-button-mark" aria-hidden="true">📦</span>':''}我牌太爛啦！（${redrawLabel(room,s)}）</button></div>`;
  return`<div class="hand-workspace"><div class="hand-cards"><div class="hand-heading"><h3>你的手牌</h3><span>${mine.length+privateSunCards.length} 張 · 對手 ${esc(names[battleOpponent(room,s)])}</span></div><div class="hand">${up.map((c,k)=>cardBtn(c,'pick',true,s,k)).join('')}${subtractCards(cards,up).map((c,k)=>cardBtn(c,'pick',false,s,k)).join('')}${tempSunButtons(s)}</div></div><div class="selection-row">${skills}<div class="hand-extra-actions">${wardenJudgmentArmed()?'':askUI(s)+dihuiUI(s)+plantsUI(s)+mosesBreathUI(s)+isoSkillsUI(s)}</div>${wardenReviveUI(s)}${wardenPurifyUI(s)}${wardenHeartUI(s)}${wardenCandleTargetUI(s)}${handSelectionUI(s)}<button class="pri commit-card" ${sel?'':'disabled'} onclick="play()">出牌 →</button></div></div>`;
}
function lobbyUI(){return`<main class="lobby-shell" id="lobbyShell" data-view="${lobbyView}" aria-labelledby="lobbyTitle">
  <header class="lobby-topline"><div class="lobby-suits" aria-hidden="true"><span>♠</span><span class="red">♥</span><span>♣</span><span class="red">♦</span></div><a class="rules-entry" href="rules.html">規則介紹 <span aria-hidden="true">↗</span></a></header>
  <div class="lobby-hero"><h1 class="lobby-title" id="lobbyTitle" aria-label="決鬥25點"><span class="lobby-title-word">決鬥</span><span class="lobby-title-number">25<small>點</small></span></h1>
  <div class="lobby-deck" aria-hidden="true">${[['K','♠',''],['Q','♥','red'],['A','♦','red']].map(([rank,suit,red])=>`<div class="lobby-card ${red}"><span class="lobby-card-corner">${rank}<span>${suit}</span></span><span class="lobby-card-suit">${suit}</span><span class="lobby-card-corner">${rank}<span>${suit}</span></span></div>`).join('')}</div></div>
  <div class="lobby-center"><label class="lobby-name" for="name"><span>你的暱稱</span><input id="name" placeholder="輸入暱稱" value="${esc(myName)}" autocomplete="nickname"></label>
  <div class="lobby-actions" aria-label="房間操作"><button type="button" class="lobby-action" id="lobbyCreateToggle" aria-controls="lobbyCreate" aria-expanded="${lobbyView==='create'}" onclick="setLobbyView(lobbyView==='create'?'home':'create')"><strong>建立房間</strong><small>選好模式，邀請朋友</small><span aria-hidden="true">→</span></button><button type="button" class="lobby-action" id="lobbyJoinToggle" aria-controls="lobbyJoin" aria-expanded="${lobbyView==='join'}" onclick="setLobbyView(lobbyView==='join'?'home':'join')"><strong>加入房間</strong><small>輸入代碼，準備入座</small><span aria-hidden="true">→</span></button></div>
  <form class="lobby-panel" id="lobbyCreate" ${lobbyView==='create'?'':'hidden'} aria-label="建立房間設定" onsubmit="event.preventDefault();createRoom()">
    <h2>選擇對戰形式</h2><select id="n" hidden aria-label="對戰形式" onchange="updateLobbyOptions()">${LOBBY_MODES.map(m=>`<option value="${m.id}">${m.n}</option>`).join('')}</select>
    <div class="lobby-modes" role="group" aria-label="對戰形式">${LOBBY_MODES.map(m=>`<button type="button" class="lobby-mode" id="lobbyMode${m.id}" aria-pressed="${m.id==='2'}" onclick="setLobbyMode('${m.id}')"><strong>${m.n}</strong><small>${m.d}</small></button>`).join('')}</div>
    <div class="lobby-fields"><label for="mode">牌面模式<select id="mode" onchange="updateLobbyOptions()"><option value="open">明牌</option><option value="hidden">暗牌</option></select></label><label for="hp">起始血量<input id="hp" type="number" value="25" inputmode="numeric"></label><label for="hand">手牌張數<input id="hand" type="number" value="6" inputmode="numeric"></label></div>
    <details class="lobby-options"><summary>進階設定</summary><div class="lobby-options-body">
      <div class="lobby-fields"><label for="open">明牌張數<input id="open" type="number" value="4" inputmode="numeric"></label><label for="time">回合限時（秒）<input id="time" type="number" value="0" inputmode="numeric"><small>0 為不限時</small></label></div>
      <div class="lobby-checks"><label class="lobby-check"><input id="chars" type="checkbox" checked onchange="updateLobbyOptions()"><span>啟用角色選角<small id="lobbyCharacterHint">兩人戰、三人戰可自由開關。</small></span></label><label class="lobby-check"><input id="ban" type="checkbox"><span>開局角色禁用<small>一般角色戰每人禁用 1 名，順序隨機。</small></span></label><label class="lobby-check"><input id="events" type="checkbox" checked><span>環境事件<small>每 3～5 回合隨機發生。</small></span></label></div>
      <fieldset class="lobby-factions"><legend>啟用陣營</legend><div class="lobby-faction-list"><label><input id="fac_bus" type="checkbox" checked> Limbus</label><label><input id="fac_pvz" type="checkbox" checked> PVZ</label><label><input id="fac_trails" type="checkbox" checked> 軌跡</label><label><input id="fac_valorant" type="checkbox" checked> Valorant</label></div></fieldset>
    </div></details>
    <div class="lobby-room-code"><label for="hostCode"><span>房間代碼 <small class="lobby-hint">・選填</small></span><input class="lobby-code-input" id="hostCode" placeholder="留空自動產生" maxlength="16" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="roomCodeHint"></label><button type="submit" id="createRoomBtn" class="pri">建立房間 →</button></div>
    <p id="roomCodeHint" class="lobby-hint">可自訂 2～16 個英文字母或數字，大小寫相同。</p>
  </form>
  <form class="lobby-panel" id="lobbyJoin" ${lobbyView==='join'?'':'hidden'} aria-label="加入朋友的房間" onsubmit="event.preventDefault();joinRoom()">
    <h2>加入朋友的牌桌</h2><div class="lobby-join-form"><label for="code">房間代碼<input class="lobby-code-input" id="code" placeholder="輸入朋友的房間代碼" maxlength="16" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="joinCodeHint"></label><button type="submit" id="joinRoomBtn" class="pri">加入房間 →</button></div><p class="lobby-hint" id="joinCodeHint">向房主取得代碼，輸入後即可加入。</p>
  </form></div>
  <footer class="lobby-table-edge"><span>♠ 進攻　♣ 干擾　♥ 回復　♦ 反擊</span><button type="button" class="lobby-test-entry" onclick="unlockTest()">單人測試區</button></footer>
  <div id="tbox" class="lobby-test-panel" style="display:none"><p class="lobby-hint">沿用建立房間的設定，限時固定關閉。一人操控所有玩家，無需連線。</p><div class="row">${[0,1,2].map(i=>`<label for="tc${i}">玩家 ${i+1} 角色<select id="tc${i}"><option value="">隨機</option>${Object.keys(CHARS).filter(k=>!CHARS[k].v3only&&!CHARS[k].hidden).map(k=>`<option value="${k}">${CHARS[k].n}</option>`).join('')}</select></label>`).join('')}</div><button type="button" class="pri" onclick="startTest()">開始測試 →</button></div>
</main>`}
function render(){syncWardenRewrite();scheduleWardenJoint();syncWardenAudio();try{syncBgm()}catch(e){}
  syncWardenFinalFx();
  if(room?.cfg.warden){if(wardenIntroPending())preloadWardenStage(1);else if(room.st)preloadWardenStage(Math.min(3,wardenStage(room)+1))}
  if(document.body)document.body.classList.toggle('warden-entering',wardenIntroPending());
  if(wardenIntroPending()){document.getElementById('app').innerHTML='';syncWardenIntroFx();return}
  syncWardenIntroFx();
  if(document.body){document.body.classList.toggle('warden-shifting',wardenShiftPending());if(wardenShiftPending())document.body.classList.add('warden-battle')}
  if(wardenContinuePending()){document.getElementById('app').innerHTML=`<div inert>${wardenArena('')}</div>`;mountWardenFinalLight();animHp();flushCombatFx();flushHealingFx();flushDamageFx();syncWardenContinueFx();return}
  syncWardenContinueFx();
  if(wardenEndingPending()){document.body?.classList.add('warden-battle');const fx=syncWardenEndingFx(),key=room.wardenEnding.id+':'+wardenEndingCorpse(room);if(fx.arenaKey!==key){fx.arenaKey=key;document.getElementById('app').innerHTML=`<div inert>${wardenArena('')}</div>`;mountWardenFinalLight();animHp();flushCombatFx();flushHealingFx();flushDamageFx()}return}
  syncWardenEndingFx();
  if(room?.cfg.warden&&room.status==='over'&&room.wardenEnding?.phase==='done')room.hp.forEach((hp,i)=>{hpAnim[i]={v:Math.max(0,hp),to:Math.max(0,hp),m:maxHp(i),c:room.chars[i]}});
  if(wardenShiftPending()){const s=rd(),act=s>=0&&wardenSeatAlive(room,s)?playHandUI(s,room.hands[s],room.up[s],room.seats.map(p=>p.name)):'',fake=room.wardenShift.from===2&&wardenStage(room)===2;document.getElementById('app').innerHTML=`<div inert>${fake?wardenFalseVictoryUI():wardenArena(act)}</div>`;mountWardenFinalLight();hpAnim[1]={v:room.hp[1],to:room.hp[1],m:maxHp(1),c:'warden'};animHp();flushCombatFx();flushHealingFx();flushDamageFx();syncWardenShiftFx();return}
  syncWardenShiftFx();
  if(wardenJudgmentPending()){document.body?.classList.add('warden-battle');const s=rd();document.getElementById('app').innerHTML=`<div inert>${wardenArena(s>=0?playHandUI(s,room.hands[s],room.up[s],room.seats.map(p=>p.name)):'')}</div>`;mountWardenFinalLight();room.hp.forEach((hp,i)=>{hpAnim[i]={v:hp,to:hp,m:maxHp(i),c:room.chars[i]}});animHp();syncWardenJudgmentFx();return}
  syncWardenJudgmentFx();
  if(battleConfirm&&(!room||room.status!=='playing'||code!==battleConfirm.code||room.round!==battleConfirm.round||room.roundBase!==battleConfirm.roundBase||room.phase!==battleConfirm.phase))battleConfirm=null;
  const popup=activeBattlePopup();if(battleObservationKey&&battleObservationKey!==popup?.key)battleObservationKey='';
  if(!battleObservationActive()&&!battleConfirm&&!isoPending()&&!valorantShopPending()&&syncD25DrawUI())return;
  if(document.body){document.body.classList.toggle('in-battle',!!(room&&(room.status==='playing'||room.status==='over')));document.body.classList.toggle('in-menu',!code);document.body.classList.toggle('warden-battle',!!(room?.cfg.warden&&['playing','over'].includes(room.status)))}

  const A=document.getElementById('app');
  if(!code){A.innerHTML=lobbyUI();updateLobbyOptions();return}
  const top=room?.cfg.warden?'':`<div class="combat-room-strip row" style="justify-content:space-between;margin:0 0 8px"><span class="mut">房間代碼 <b class="code" style="font-size:20px;letter-spacing:4px">${esc(code)}</b></span><button onclick="leave()">離開</button></div>`;
  if(!room){
    const j=sortedJoins(),cfg=j[0]&&j[0].cfg,host=j[0]&&j[0].id===uid;
    if(!cfg){A.innerHTML=top+`<div class="box">找不到這個房間（或正在連線…）</div>`;return}
    A.innerHTML=top+`<div class="box"><b>${battleModeName(cfg)}</b>　${Math.min(j.length,cfg.n)}/${cfg.n} 人
    <div class="row"><label for="roomMode">對戰模式 <select id="roomMode" ${host?'':'disabled'} onchange="setRoomMode(this.value)">${LOBBY_MODES.map(m=>`<option value="${m.id}" ${roomMode(cfg)===m.id?'selected':''}>${m.n}</option>`).join('')}</select></label><span class="mut">${host?'開始遊戲前可切換模式':'由房主選擇模式'}</span></div>
    <div class="mut">血量 ${cfg.hp}｜手牌 ${cfg.hand}｜${cfg.open?'明牌 '+cfg.open+' 張':'暗牌模式'}｜${cfg.time?'限時 '+cfg.time+' 秒':'不限時'}${cfg.chars?'｜角色選角':''}｜環境事件${cfg.events?'開啟（每3～5回合）':'關閉'}</div>
    ${cfg.chars&&!cfg.v3&&!cfg.boss?`<div class="row"><label><input type="checkbox" ${cfg.ban?'checked':''} ${host?'':'disabled'} onchange="setLobbyBan(this.checked)"> 角色禁用（每人1名，順序隨機）</label></div>`:''}
    ${j.map((p,i)=>`<div>${i>=cfg.n?'（旁觀）':''}${esc(p.name)}${p.id===uid?'（你）':''}${i===0?' 👑':''}</div>`).join('')}
    <div class="row">${host?`<button class="pri" ${j.length>=cfg.n?'':'disabled'} onclick="startGame()">開始遊戲</button>`:'<span class="mut">等待房主開始…</span>'}</div>
    <div class="mut">把房間代碼傳給朋友，請他們開同一個網頁並輸入代碼。</div></div>`+lobbyDraftCornerUI();return}
  if(room.status==='pick'){A.innerHTML=top+normalPickUI(rd());return}
  if(room.status==='ban'){A.innerHTML=top+banUI(rd());return}
  if(room.status==='draft'||room.status==='bossDraft'){A.innerHTML=top+draftUI(rd())+wardenDraftUI(rd());return}
  if(isoPending()&&!battleObservationActive()){A.innerHTML=top+(room.phase==='isoTarget'?`<div class="battle-stage-panel">${popupEyeUI()}${isoDuelUI(rd())}</div>`:isoDuelUI(rd()));flushCombatFx();flushHealingFx();flushDamageFx();return}
  if(valorantShopVisible()&&!battleObservationActive()){A.innerHTML=top+`<div class="battle-stage-panel">${popupEyeUI()}${valorantShopUI(rd())}</div>`;return}
  const s=rd(),cfg=room.cfg,names=room.seats.map(p=>p.name),playing=room.status==='playing';
  const pls=room.seats.map((p,i)=>{
    const inPair=playing&&room.phase==='play'&&room.pair.includes(i),done=inPair&&moves[room.round+'_'+i]||room.phase==='reveal'&&moves['v'+room.round+'_'+i];
    const hid=room.hands[i].length+(i===s?privateSunCards.length:0)-room.up[i].length;
    return`<div data-damage-target="${i}:summary" class="pl ${room.hp[i]<=0?'dead':''}">${!room.pair.includes(i)?environmentTargetFxUI(i,room.team?room.act[i]:-1):''}<div class="row" style="justify-content:space-between;margin:0"><b class="${i===s?'me':''}">${cfg.boss?(i===1?'👑 '+bossRole(cfg,i)+'｜':'🤝 挑戰者｜'):''}${esc(p.name)}${room.chars[i]?'【'+CHARS[room.chars[i]].n+'】':''}${i===s?'（你）':''}${playing&&room.turn===i&&cfg.n===3?' 🎯':''}${inPair?' ⚔️':''}</b><span>${Math.max(0,room.hp[i])} / ${maxHp(i)} ${done?'✅':''}</span></div>
    ${healthBarUI(i)}${timeClockUI(i)}${combatStatusUI(i)}${cfg.v3&&cfg.n===3&&!cfg.boss&&!room.pair.includes(i)?`<div class="spectator-team">${teamInfo(i)}${resv(i,'left')}</div>`:''}
    ${i!==s?`<div class="mut">${visibleHandUI(i)} ${hid?`🂠×${hid}`:''}</div>`:''}${!room.pair.includes(i)||(d25AuraOf(i)&&d25AuraOf(i).char!==room.chars[i])?d25AuraUI(i,true):''}</div>`}).join('');
  const timer=playing&&room.deadline?'<div class="mut" id="tm"></div>':'';
  let act='';
  if(!playing)act=`<b style="font-size:18px">${room.winner>=0?'🏆 '+(cfg.boss?bossSideName(cfg,room.winner)+'（'+esc(names[room.winner])+'）':esc(names[room.winner]))+' 獲勝！':'平手！全員倒下'}</b><div class="row" style="justify-content:center"><button class="pri" onclick="rematch()">再來一場</button><button onclick="leave()">離開房間</button></div>`;
  else if(battleObservationActive())act=observationHandUI(s);
  else if(valorantShopPending())act='<span class="mut">等待 Valorant 玩家確認裝備，回合尚未開始…</span>';
  else if(mirrorPending())act='<span class="mut">🪞 等待李箱選擇鏡世界，全員行動與倒數暫停…</span>';
  else if(d25DrawPending())act='<span class="mut">🎡 完美決鬥資格抽選中，出牌與倒數暫停…</span>';
  else if(environmentTradePending())act=s>=0&&room.hp[s]>0?environmentTradeUI(s):'<span class="mut">等待玩家完成環境選擇…</span>';
  else if(s<0)act='<span class="mut">你是旁觀者</span>';
  else if(room.hp[s]<=0&&!(cfg.warden&&wardenSeatAlive(room,s)))act='<span class="mut">你已被淘汰，等待結果…</span>';
  else{const mine=room.hands[s],up=room.up[s];
    if(room.phase==='answer'){
      const q=room.question||{},target=q.target,asker=q.by,question=q.kind==='max'?'你的最大點數是多少？':`你的${SU[q.suit]}有幾張？`;
      if(s===target){const submitted=moves['a'+room.round+'_'+s],cards=[...(room.hands[s]||[]),...(test?(hostSunCards[s]||[]).filter(x=>x.expires>=room.round).map(x=>x.card):privateSunCards.map(x=>x.card))];act=`<div>賈丘問你：${esc(question)}</div><div class="mut">你的手牌（已出牌已退回）：</div><div class="hand">${cards.map(c=>chip(c,s,room.up[s].includes(c))).join('')||'<span class="mut">沒有手牌</span>'}</div>${submitted?`<div class="mut">你回答：「${esc(submitted.answer)}」，等待判定…</div>`:`<div class="row" style="justify-content:center"><input id="jiaAnswer" type="number" min="0" max="13" placeholder="回答數字"><button class="pri" onclick="answerJia()">回答</button></div>`}`}
      else{const response=moves['a'+room.round+'_'+target];act=`賈丘正在詢問 ${esc(names[target])}：${esc(question)}${response?`<div class="mut">${esc(names[target])} 回答：「${esc(response.answer)}」，等待判定…</div>`:'<div class="mut">等待對方回答…</div>'}`}
    }else if(room.phase==='play'){
      if(!room.pair.includes(s))act=cfg.boss?'<div><b>與另一名挑戰者互為隊友</b><div class="mut">本回合由另一位挑戰者出戰；你不會被當作敵人或旁觀猜測者。</div></div>':specView(s);
      else if(wardenJudgmentArmed())act=moves[room.round+'_'+s]?'已出牌，等待其他玩家…':playHandUI(s,mine,up,names);
      else if(kiraCardLocked(room,s))act='🚫 '+(room.st[s].teaSkipRound&&room.st[s].teaBloomRound===room.round?'〔盛放〕本回合空過':'受到綺羅技能影響，本回合無法出牌')+(sAvail(s)?`<button onclick="playS()">${['lkd','kira','drunk'].includes(room.chars[s])?'主動技':'S技'}【${esc(CHARS[room.chars[s]].ss.n)}】</button>`:'');
      else if(!envSilent(room)&&(room.st[s].stun||0)>0)act='😵 你被暈眩，本回合無法出牌或行動'
      else if(!envSilent(room)&&(room.st[s].san||0)<=-45&&CHARS[room.chars[s]]?.f==='bus')act='🌀 理智 -45：侵蝕中，系統將隨機選牌並依花色觸發侵蝕效果；本回合結算後，下回合理智重置為0'
      else if(moves[room.round+'_'+s])act=`你已出牌 <b>${moves[room.round+'_'+s].hidden?'暫時手牌':moves[room.round+'_'+s].rep?'Furioso-Replica':moves[room.round+'_'+s].redraw?'「我牌太爛啦！」':moves[room.round+'_'+s].bomb?'💣 傳遞炸彈':moves[room.round+'_'+s].purify?'0・淨化':moves[room.round+'_'+s].revive?'0・復活':room.cfg.warden&&s===1?'兩張對戰牌':drunkCardTxt(moves[room.round+'_'+s].card,s,moves[room.round+'_'+s].visible===true)}</b>，等待對手…${dihuiUI(s)}${plantsUI(s)}`;
      else act=playHandUI(s,mine,up,names)}
    else if(room.pend.includes(s)&&drunkActive(room,s)&&room.st[s].drunkSip>=4)act='系統隨機蓋牌中…';
    else if(room.pend.includes(s)){
      if(moves['v'+room.round+'_'+s])act='已選擇，等待其他玩家…';
      else{const hid=subtractCards(mine,up),need=hid.length-Math.max(0,room.oc[s]-up.length);
        act=`<div class="mut">選擇要保持暗牌的牌（${hideSel.length}/${need}），其餘將公開</div><div class="hand">${hid.map((c,index)=>drunkCanSee(room,s,s,false,true)?`<button class="c concealed ${RED[c[0]]?'r':''} ${hideSlots.includes(index)?'sel':''}" onclick="toggleHide('${c}',${index})">${cardFace(c)}</button>`:`<button class="c concealed ${hideSlots.includes(index)?'sel':''}" aria-label="隱藏牌" onclick="toggleDrunkHide(${index})"><span class="card-pip">🂠</span></button>`).join('')}</div>`}}
    else act='等待對方選擇亮牌…'}
  if(test&&!battleObservationActive())act=`<div class="mut">🧪 目前操作：${esc(names[s])}</div>`+environmentTestUI()+(cfg.warden?wardenTestUI():testD25ContestUI())+act;
  let h=top+battleObservationUI()+arena(timer+act);
  if(test&&!cfg.warden)h+=`<div class="box mut">🧪 全部手牌（有底線＝已公開）${room.seats.map((p,i)=>`<div>${esc(p.name)}：${room.hands[i].map(c=>chip(c,i,room.up[i].includes(c))).join('')}</div>`).join('')}</div>`;
  if(!cfg.warden)h+=cfg.n===3?`<div class="box players-summary"><b>全場玩家狀態</b>${pls}</div>`:`<div class="players-summary players-summary-hidden">${pls}</div>`;
  if(room.last&&!cfg.warden){const L=room.last;
    h+=`<details class="box"><summary>第 ${shownRound(L.round)} 回合詳細結果</summary><div class="log">${L.plays.map(p=>`<div>${esc(names[p.i])} 出了 <b>${drunkCardTxt(p.card,p.i,true)}</b></div>`).join('')}<hr style="border:0;border-top:1px solid var(--line)">${L.log.map(x=>`<div>${esc(drunkLogText(x))}</div>`).join('')}</div></details>`}
  if(!cfg.warden&&s>=0&&room.chars[s]){const C=CHARS[room.chars[s]],fd=room.chars[s]==='verg'?'維吉里烏斯理智固定顯示「?」，不套用Limbus共通理智增減傷、侵蝕或理智變化。':FACD[C.f];h+=`<details class="box"><summary>我的角色：${C.n}${C.t?'・'+C.t:''}</summary><div class="mut">陣營【${FAC[C.f]}】：${fd}<br>${C.d}</div></details>`}
  A.innerHTML=battleObservationActive()?`<div onkeydown="if(event.key==='Escape'){event.preventDefault();returnBattlePopup()}">${h}</div>`:h;mountWardenFinalLight();animHp();flushCombatFx();syncCombatRecoil();flushHealingFx();flushDamageFx();syncWardenFinalCues();syncWardenBeamQuake();focusD25Dialog()}

/* ---------- 點對點連線（房主當伺服器，PeerJS/WebRTC） ---------- */
const store={},subs=[];let peer=null,conns=[],hostConn=null,isHost=false;
const snapDoc=p=>({exists:p in store,data:()=>store[p],id:p.split('/').pop()});
const direct=(k,p)=>k.startsWith(p+'/')&&!k.slice(p.length+1).includes('/');
const snapCol=p=>({docs:Object.keys(store).filter(k=>direct(k,p)).map(k=>({id:k.split('/').pop(),data:()=>store[k]}))});
function notify(path){subs.slice().forEach(x=>{if(x.t==='d'?x.p===path:direct(path,x.p))x.fn(x.t==='d'?snapDoc(x.p):snapCol(x.p))})}
// 向日葵的牌面只透過既有私有訊息傳送；公開開花資料僅保留識別碼與層數。
function teaPublicState(r){if(!r?.teaflower)return r;const next={...r,teaflower:JSON.parse(JSON.stringify(r.teaflower))};next.teaflower.cards.forEach((cards,i)=>cards.forEach(c=>{if(c.sunId&&!(r.env?.publicSun?.[i]||[]).some(x=>x.id===c.sunId))delete c.card}));next.teaflower.blooms.forEach((marks,i)=>marks.forEach(m=>{if(m.privateCard&&!next.teaflower.cards[i].some(c=>c.id===m.id&&c.card))delete m.card}));return next}
const teaPublicPacket=m=>m.full?{...m,full:Object.fromEntries(Object.entries(m.full).map(([p,d])=>[p,teaPublicState(d)]))}:m.d?.teaflower?{...m,d:teaPublicState(m.d)}:m;
const bcast=m=>conns.forEach(c=>{try{c.send(teaPublicPacket(m))}catch(e){}});
function send(p,d){if(wardenPaused()&&!wardenContinuePending()&&!wardenJudgmentChoicePending()&&typeof p==='string'&&p.startsWith(`rooms/${code}/moves/`))return;if(((isoPending()&&d!==null)||valorantShopPending()||mirrorPending())&&typeof p==='string'&&p.startsWith(`rooms/${code}/moves/`))return;d=JSON.parse(JSON.stringify(d));
  // 訂閱回呼可能立即推進階段，只傳送仍為最新狀態的一次寫入。
  if(isHost){if(!allowTimeMove(p,d)){setTimeout(tick,0);return}store[p]=d;notify(p);if(store[p]===d)bcast({p,d,hostTime:Date.now()})}else if(hostConn)hostConn.send({w:1,p,d})}
const sub=(t,p,fn)=>{const x={t,p,fn};subs.push(x);fn(t==='d'?snapDoc(p):snapCol(p));return()=>{const i=subs.indexOf(x);if(i>=0)subs.splice(i,1)}};
db={doc:p=>({set:async d=>send(p,d),onSnapshot:fn=>sub('d',p,fn)}),collection:p=>({onSnapshot:fn=>sub('c',p,fn)})};
function netClose(){try{peer&&peer.destroy()}catch(e){}peer=null;conns=[];hostConn=null;isHost=false;subs.length=0;Object.keys(store).forEach(k=>delete store[k])}
function netHost(c){return new Promise((res,rej)=>{isHost=true;peer=new Peer('d25-'+c);
  peer.on('open',()=>res());peer.on('error',rej);
  peer.on('connection',cn=>{
    cn.on('open',()=>{conns.push(cn);cn.send(teaPublicPacket({full:store,hostTime:Date.now()}))});
    cn.on('data',m=>{if(m&&m.privateRequest){handlePrivateRequest(cn,m.privateRequest);return}if(m&&m.w){if(((isoPending()&&m.d!==null)||valorantShopPending()||mirrorPending()||environmentTradePending())&&typeof m.p==='string'&&m.p.startsWith(`rooms/${c}/moves/`))return;const prefix=`rooms/${c}/joins/`;if(typeof m.p==='string'&&m.p.startsWith(prefix)){const joining=m.p.slice(prefix.length);if(cn.uid&&cn.uid!==joining)return;cn.uid=joining}if((wardenContinuePending()||wardenJudgmentChoicePending())&&!cn.uid&&typeof m.p==='string'&&m.p.startsWith(`rooms/${c}/moves/`))return;if(!cn.uid&&(m.d?.bomb||moves[String(m.p).split('/moves/')[1]]?.bomb))return;if(envActive(room,'cheer')&&/\/moves\/g\d+_\d+$/.test(String(m.p)))return;if(!allowTimeMove(m.p,m.d,cn.uid)){setTimeout(tick,0);return}store[m.p]=m.d;notify(m.p);if(store[m.p]===m.d)bcast({p:m.p,d:m.d,hostTime:Date.now()})}});
    cn.on('close',()=>{conns=conns.filter(x=>x!==cn)})})})}
function netJoin(c){return new Promise((res,rej)=>{isHost=false;peer=new Peer();peer.on('error',rej);
  // JSON通道單包上限16300位元組；完整戰鬥與重連快照使用BinaryPack自動分段。
  peer.on('open',()=>{hostConn=peer.connect('d25-'+c,{serialization:'binary',reliable:true});
    const to=setTimeout(()=>rej(new Error('timeout')),12000);
    hostConn.on('open',()=>{clearTimeout(to);res()});
    hostConn.on('data',m=>{if(Number.isFinite(m.hostTime))hostClockOffset=m.hostTime-Date.now();if(m.privateData){handlePrivateData(m.privateData);return}if(m.full)Object.keys(m.full).forEach(k=>{store[k]=m.full[k];notify(k)});else{store[m.p]=m.d;notify(m.p)}});
    hostConn.on('close',()=>{if(code){alert('與房主的連線中斷了，遊戲結束');leave()}})})})}
updAud();uid=Math.random().toString(36).slice(2,10);render();
