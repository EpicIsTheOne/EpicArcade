// Crafting recipes, smelting, fuel, loot tables.
import { B } from './blocks.js';

const P=B.PLANKS,C=B.COBBLE,S='stick',W=B.WOOL,I='iron_ingot',G='gold_ingot',D='diamond',K=B.COAL_ORE;
void K;

export const RECIPES=[
  {o:[B.PLANKS,4],any:[B.LOG,B.BIRCH_LOG,B.SPRUCE_LOG]},
  {o:['stick',4],g:[[P],[P]]},
  {o:[B.CRAFTING,1],g:[[P,P],[P,P]]},
  {o:[B.TORCH,4],g:[['coal'],[S]]},
  {o:[B.TORCH,4],g:[['charcoal'],[S]]},
  {o:[B.FURNACE,1],g:[[C,C,C],[C,0,C],[C,C,C]]},
  {o:[B.CHEST,1],g:[[P,P,P],[P,0,P],[P,P,P]]},
  {o:[B.LAMP_OFF,1],g:[[0,'redstone',0],['redstone',B.GLASS,'redstone'],[0,'redstone',0]]},
  {o:[B.LEVER_OFF,1],g:[[S],[C]]},
  {o:[B.TNT,1],g:[['gunpowder',B.SAND,'gunpowder'],[B.SAND,'gunpowder',B.SAND],['gunpowder',B.SAND,'gunpowder']]},
  {o:[B.LADDER,3],g:[[S,0,S],[S,S,S],[S,0,S]]},
  {o:[B.BED,1],g:[[W,W,W],[P,P,P]]},
  {o:['bread',1],g:[['wheat_item','wheat_item','wheat_item']]},
  {o:['golden_apple',1],g:[[G,G,G],[G,'apple',G],[G,G,G]]},
];

const TOOL_MATS=[[P,'wooden'],[C,'stone'],[I,'iron'],[G,'golden'],[D,'diamond']];
for(const[M,pre]of TOOL_MATS){
  RECIPES.push({o:[pre+'_pickaxe',1],g:[[M,M,M],[0,S,0],[0,S,0]]});
  RECIPES.push({o:[pre+'_axe',1],g:[[M,M],[M,S],[0,S]]});
  RECIPES.push({o:[pre+'_axe',1],g:[[M,M],[S,M],[S,0]]});
  RECIPES.push({o:[pre+'_shovel',1],g:[[M],[S],[S]]});
  RECIPES.push({o:[pre+'_sword',1],g:[[M],[M],[S]]});
  RECIPES.push({o:[pre+'_hoe',1],g:[[M,M],[0,S],[0,S]]});
}
RECIPES.push({o:['hoe',1],g:[[B.PLANKS,B.PLANKS],[0,S],[0,S]]});

export function matchRecipe(cells,w){
  const hgt=cells.length/w|0;
  let minX=w,minY=hgt,maxX=-1,maxY=-1;
  for(let y=0;y<hgt;y++)for(let x=0;x<w;x++){
    if(cells[y*w+x]){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  }
  if(maxX<0)return null;
  const tw=maxX-minX+1,th=maxY-minY+1;
  const trim=[];
  for(let y=minY;y<=maxY;y++){const row=[];for(let x=minX;x<=maxX;x++)row.push(cells[y*w+x]||0);trim.push(row);}
  outer:
  for(const r of RECIPES){
    if(r.any){
      if(tw!==1||th!==1)continue;
      const v=trim[0][0];
      if(r.any.includes(v))return r;
      continue;
    }
    const g=r.g;
    const gh=g.length,gw=g[0].length;
    if(gw!==tw||gh!==th)continue;
    let ok=true,okM=true;
    for(let y=0;y<th&&(ok||okM);y++)for(let x=0;x<tw;x++){
      const want=g[y][x]||0;
      if((trim[y][x]||0)!==want)ok=false;
      if((trim[y][tw-1-x]||0)!==want)okM=false;
    }
    if(ok||okM)return r;
  }
  return null;
}

export const SMELT={
  'raw_iron':'iron_ingot',
  'raw_gold':'gold_ingot',
  [B.SAND]:B.GLASS,
  [B.COBBLE]:B.STONE,
  'porkchop':'cooked_porkchop',
  'beef':'cooked_beef',
  'mutton':'cooked_mutton',
  'chicken_raw':'cooked_chicken',
  [B.LOG]:'charcoal',
  [B.BIRCH_LOG]:'charcoal',
  [B.SPRUCE_LOG]:'charcoal'
};

export const FUEL={
  'coal':80,'charcoal':80,
  [B.PLANKS]:15,[B.LOG]:15,[B.BIRCH_LOG]:15,[B.SPRUCE_LOG]:15,
  'stick':5,'sapling_item':5,[B.CRAFTING]:15,[B.CHEST]:15,
};

export const LOOT={
  dungeon:[
    ['iron_ingot',1,4,0.8],['bread',1,2,0.7],['redstone',2,5,0.6],
    ['glowstone_dust',1,3,0.5],['apple',1,2,0.5],['iron_pickaxe',1,1,0.25],
    ['diamond',1,1,0.18],['golden_apple',1,1,0.08],['bone','x']
  ].filter(e=>e[1]!=='x'),
  ruins:[
    ['bread',1,3,0.8],['coal',2,6,0.8],[B.TORCH+'',2,5,0.7],
    ['sapling_item',1,2,0.5],['iron_ingot',1,2,0.45],['string','x'],
  ].filter(e=>e[1]!=='x').map(e=>e[1]==='x'?null:e),
  treasure:[
    ['iron_ingot',2,5,1],['gold_ingot',1,3,0.8],['diamond',1,2,0.35],
    ['golden_apple',1,1,0.3],['tnt_item','x']
  ].filter(e=>e[1]!=='x')
};
