// Item registry + recipes. Items are strings; blocks referenced by numeric id.
import { B } from './blocks.js';

export const ITEMS = {};
function item(name, o){ ITEMS[name] = Object.assign({ name, label:name.replace(/_/g,' '), stack:64 }, o); }

item('stick',{fuel:5});
item('coal',{fuel:80});
item('flint',{});
item('feather',{});
item('arrow',{});
item('gunpowder',{});
item('bow',{stack:1,tool:true,bow:true,durability:180});
item('raw_iron',{smeltTo:'iron_ingot'});
item('raw_gold',{smeltTo:'gold_ingot'});
item('iron_ingot',{});
item('gold_ingot',{});
item('diamond',{});
item('seeds',{plant:B.WHEAT0, on:B.FARMLAND});
item('wheat',{});
item('wheat_item',{label:'Wheat'});
item('bread',{food:5});
item('apple',{food:4});
item('golden_apple',{food:4});
item('porkchop',{food:2, smeltTo:'cooked_porkchop'}); item('cooked_porkchop',{food:7});
item('mutton',{food:1, smeltTo:'cooked_mutton'}); item('cooked_mutton',{food:6});
item('chicken_raw',{food:1, smeltTo:'cooked_chicken'}); item('cooked_chicken',{food:6});
item('rotten_flesh',{food:2});
item('glowstone_dust',{});
item('sapling_item',{place:B.SAPLING});
item('tnt_item',{place:B.TNT});
item('bone',{});
item('beef',{food:2,smeltTo:'cooked_beef'});
item('cooked_beef',{food:7});
item('leather',{});


item('redstone',{fuel:0});
item('charcoal',{fuel:80});
item('string',{});
item('sugar',{});

item('glass',{place:B.GLASS}); // convenience alias rarely used

// tools: tiers wood..diamond ; speed multiplier & durability
const TIERS = [
  ['wooden', 2, 60, 1],
  ['stone', 4, 132, 2],
  ['iron', 6, 250, 3],
  ['golden', 9, 56, 2],
  ['diamond', 8, 1560, 4],
];
for(let t=0;t<5;t++){
  const [pre,speed,dur,tier] = TIERS[t];
  const base = {stack:1, tool:true, speed, durability:dur, tier};
  item(pre+'_pickaxe', {...base, toolType:'pickaxe', dmg:2+tier});
  item(pre+'_axe', {...base, toolType:'axe', dmg:3+tier});
  item(pre+'_shovel', {...base, toolType:'shovel', dmg:1+tier});
  item(pre+'_sword', {stack:1, tool:true, speed:1.5, durability:Math.round(dur*1.2), tier, toolType:'sword', dmg:3+2*tier});
}
item('hoe',{stack:1,tool:true,toolType:'hoe',speed:1,durability:60,tier:0,dmg:1});

export function itemName(x){ return typeof x === 'number' ? 'block:'+x : x; }
export function stackMax(x){ return typeof x === 'number' ? 64 : (ITEMS[x]?.stack ?? 64); }
export function foodValue(x){ return (typeof x==='string' && ITEMS[x]) ? ITEMS[x].food||0 : 0; }
export function fuelValue(x){
  if(typeof x === 'number'){ const b=B; if(x===b.PLANKS||x===b.LOG||x===b.SPRUCE_LOG||x===b.BIRCH_LOG) return 15; return 0; }
  return (ITEMS[x] && ITEMS[x].fuel)||0;
}
export function smeltOf(x){ return (typeof x==='string' && ITEMS[x]?.smeltTo) || null; }

// ---- Recipes
export const RECIPES = [];
function shaped(result, count, pattern, keys){
  const rows = pattern.map(r=>r.split('').map(c=>c===' '? null : keys[c]));
  RECIPES.push({type:'shaped', result, count, rows, w:rows[0].length, h:rows.length});
}
function shapeless(result, count, ingredients){
  RECIPES.push({type:'shapeless', result, count, ingredients});
}

shapeless(B.PLANKS,4,[B.LOG]);
shapeless(B.PLANKS,4,[B.SPRUCE_LOG]);
shapeless(B.PLANKS,4,[B.BIRCH_LOG]);
shapeless('stick',4,[B.PLANKS,B.PLANKS]);
shapeless(B.SANDSTONE,1,[B.SAND,B.SAND,B.SAND,B.SAND]);
shapeless(B.TORCH,4,['coal','stick']);
shapeless(B.LAMP_OFF,1,['glowstone_dust',B.GLASS,'iron_ingot']);
shapeless(B.LEVER_OFF,1,['stick',B.COBBLE]);
shapeless(B.WOOL,1,['string']); RECIPES.pop();
shapeless('arrow',4,['flint','stick','feather']);
shapeless('charcoal',1,[B.LOG,B.LOG]);
shaped(B.LADDER,3,['S.S','SSS','S.S'],{S:'stick'});
shaped(B.TNT,1,['GSG','SGS','GSG'],{G:'gunpowder',S:B.SAND});
shaped('bow',1,[' SF','S F',' SF'],{S:'stick',F:'feather'});

shaped(B.CRAFTING,1,['PP','PP'],{P:B.PLANKS});
shaped(B.FURNACE,1,['CCC','C C','CCC'],{C:B.COBBLE});
shaped(B.CHEST,1,['PPP','P P','PPP'],{P:B.PLANKS});
shaped('bread',1,['WWW'],{W:'wheat'});

const MATS = [[B.PLANKS,'wooden'],[B.COBBLE,'stone'],['iron_ingot','iron'],['gold_ingot','golden'],['diamond','diamond']];
for(const [mat,pre] of MATS){
  shaped(pre+'_pickaxe',1,['MMM',' S ',' S '],{M:mat,S:'stick'});
  shaped(pre+'_axe',1,['MM ','MS ',' S '],{M:mat,S:'stick'});
  shaped(pre+'_axe',1,[' MM',' SM',' S '],{M:mat,S:'stick'});
  shaped(pre+'_shovel',1,['M','S','S'],{M:mat,S:'stick'});
  shaped(pre+'_sword',1,['M','M','S'],{M:mat,S:'stick'});
}
shaped('hoe',1,['PP',' S',' S'],{P:B.PLANKS,S:'stick'});

// Smelting map for non-item-defined cases (blocks)
export const SMELT_BLOCK = {
  [B.SAND]: 'glass',
  [B.COBBLE]: B.STONE,
};

// match a grid (array length w*h of stack-or-null where stack={id,item,count}) against recipes.
export function matchRecipe(slots, w, h){
  const key = s=>s==null?null:(typeof s.id==='number'? s.id : s.item ?? s.id);
  const ids = slots.map(s=>s==null?null:key(s));
  let minx=99,miny=99,maxx=-1,maxy=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if(ids[y*w+x]!=null){ minx=Math.min(minx,x);maxx=Math.max(maxx,x);miny=Math.min(miny,y);maxy=Math.max(maxy,y); }
  }
  if(maxx<0) return null;
  const bw=maxx-minx+1, bh=maxy-miny+1;
  const list = ids.filter(v=>v!=null);
  for(const r of RECIPES){
    if(r.type==='shapeless'){
      if(list.length!==r.ingredients.length) continue;
      const pool=[...r.ingredients];
      let ok=true;
      for(const v of list){ const i=pool.indexOf(v); if(i<0){ok=false;break;} pool.splice(i,1); }
      if(ok) return r;
    } else {
      if(bw!==r.w||bh!==r.h) continue;
      let ok=true, okMirror=true;
      for(let y=0;y<bh&&(ok||okMirror);y++)for(let x=0;x<bw;x++){
        const want=r.rows[y][x], got=ids[(miny+y)*w+(minx+x)];
        if(got!==want) ok=false;
        const wm=r.rows[y][bw-1-x];
        if(wm===undefined || got!==wm) okMirror=false;
      }
      if(ok||okMirror) return r;
    }
  }
  return null;
}
