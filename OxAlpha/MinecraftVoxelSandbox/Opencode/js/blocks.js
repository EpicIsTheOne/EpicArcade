// Block registry. tex indices refer to atlas tile slots (see textures.js TILE map)
export const B = {
  AIR:0, STONE:1, GRASS:2, DIRT:3, COBBLE:4, PLANKS:5, SAND:6, GRAVEL:7,
  LOG:8, LEAVES:9, GLASS:10, WATER:11, BEDROCK:12,
  COAL_ORE:13, IRON_ORE:14, GOLD_ORE:15, DIAMOND_ORE:16,
  CRAFTING:17, FURNACE:18, FURNACE_LIT:19, CHEST:20, TORCH:21,
  TALLGRASS:22, FLOWER_R:23, FLOWER_Y:24, SNOW_GRASS:25, SNOW:26,
  CACTUS:27, SANDSTONE:28, SPRUCE_LOG:29, SPRUCE_LEAVES:30,
  BIRCH_LOG:31, BIRCH_LEAVES:32, FARMLAND:33,
  WHEAT0:34, WHEAT1:35, WHEAT2:36,
  LAMP_OFF:37, LAMP_ON:38, LEVER_OFF:39, LEVER_ON:40,
  MOSSY:41, WOOL:42, BED:43, TNT:44,
  LADDER:45, SAPLING:46, WIRE_OFF:47, WIRE_ON:48,
  WIRE:47,
  GLOWSTONE:49, ICE:50, REDSTONE_ORE:51, SNOW_LAYER:52
};

// def: name, solid (collision), opaque (blocks light/faces), cross (plant render), liquid, emit (0-15),
// tex {top,bottom,side} or {all}, hard (seconds base), tool ('pick','axe','shovel',null), tier (min tool tier for drops), drop
export const BLOCKS = [];
function def(id, o){ const d=Object.assign({
  id, name:'?', solid:true, opaque:true, cross:false, liquid:false, emit:0,
  tex:{}, hard:1, tool:null, tier:0, drop:id, dropCount:1,
  shape:null, cutout:false, cullSame:false, interact:null, hw:0.5, hgt:1.0, tint:null
}, o);
if(d.cross && !d.shape) d.shape='cross';
BLOCKS[id]=d; }
export const opacityOf=id=>{if(id===undefined||id===B.AIR)return 0;const b=BLOCKS[id];if(!b)return 15;if(b.opaque)return 15;return b.attenuate||0;};

def(B.AIR,{name:'Air',solid:false,opaque:false});
def(B.STONE,{name:'Stone',tex:{all:'stone'},hard:2.2,tool:'pick',drop:B.COBBLE});
def(B.GRASS,{name:'Grass Block',tex:{top:'grass_top',bottom:'dirt',side:'grass_side'},tint:'grass',hard:0.9,tool:'shovel',drop:B.DIRT});
def(B.DIRT,{name:'Dirt',tex:{all:'dirt'},hard:0.8,tool:'shovel'});
def(B.COBBLE,{name:'Cobblestone',tex:{all:'cobble'},hard:2.4,tool:'pick'});
def(B.PLANKS,{name:'Oak Planks',tex:{all:'planks'},hard:1.6,tool:'axe'});
def(B.SAND,{name:'Sand',tex:{all:'sand'},hard:0.7,tool:'shovel'});
def(B.GRAVEL,{name:'Gravel',tex:{all:'gravel'},hard:0.8,tool:'shovel',dropFlint:true});
def(B.LOG,{name:'Oak Log',tex:{top:'log_top',bottom:'log_top',side:'log'},hard:1.8,tool:'axe'});
def(B.LEAVES,{name:'Oak Leaves',tex:{all:'leaves'},opaque:false,cutout:true,tint:'foliage',hard:0.35,drop:-1});
def(B.GLASS,{name:'Glass',tex:{all:'glass'},opaque:false,cutout:true,cullSame:true,hard:0.5,drop:-1});
def(B.WATER,{name:'Water',tex:{all:'water'},solid:false,opaque:false,liquid:true,attenuate:2,drop:-1});
def(B.BEDROCK,{name:'Bedrock',tex:{all:'bedrock'},hard:-1});
def(B.COAL_ORE,{name:'Coal Ore',tex:{all:'coal_ore'},hard:3.5,tool:'pick',tier:1,drop:'coal'});
def(B.IRON_ORE,{name:'Iron Ore',tex:{all:'iron_ore'},hard:4,tool:'pick',tier:2,drop:'raw_iron'});
def(B.GOLD_ORE,{name:'Gold Ore',tex:{all:'gold_ore'},hard:4,tool:'pick',tier:3,drop:'raw_gold'});
def(B.DIAMOND_ORE,{name:'Diamond Ore',tex:{all:'diamond_ore'},hard:4.5,tool:'pick',tier:3,drop:'diamond'});
def(B.CRAFTING,{name:'Crafting Table',interact:'craft',hw:0.5,hgt:0.85,tex:{top:'crafting_top',bottom:'planks',side:'crafting_side'},hard:1.6,tool:'axe'});
def(B.FURNACE,{name:'Furnace',tex:{top:'furnace_top',bottom:'furnace_top',side:'furnace_side',front:'furnace_front'},hard:3.2,tool:'pick',interact:'furnace'});
def(B.FURNACE_LIT,{name:'Furnace',tex:{top:'furnace_top',bottom:'furnace_top',side:'furnace_side',front:'furnace_front_lit'},hard:3.2,tool:'pick',emit:13,drop:B.FURNACE,interact:'furnace'});
def(B.CHEST,{name:'Chest',tex:{top:'chest_top',bottom:'chest_top',side:'chest_side',front:'chest_front'},hard:1.6,tool:'axe',interact:'chest'});
def(B.TORCH,{name:'Torch',tex:{all:'torch'},solid:false,opaque:false,cross:true,shape:'torch',emit:14,hard:0.05,cutout:true,interact:null,hw:0.12,hgt:0.65});
def(B.TALLGRASS,{name:'Grass',tex:{all:'tallgrass'},solid:false,opaque:false,cross:true,tint:'grass',cutout:true,hard:0.05,drop:'seeds',dropChance:0.4});
def(B.FLOWER_R,{name:'Poppy',tex:{all:'flower_r'},solid:false,opaque:false,cross:true,hard:0.05});
def(B.FLOWER_Y,{name:'Dandelion',tex:{all:'flower_y'},solid:false,opaque:false,cross:true,hard:0.05});
def(B.SNOW_GRASS,{name:'Snowy Grass',tex:{top:'snow',bottom:'dirt',side:'snow_side'},hard:0.9,tool:'shovel',drop:B.DIRT});
def(B.SNOW,{name:'Snow Block',tex:{all:'snow'},hard:0.5,tool:'shovel'});
def(B.CACTUS,{name:'Cactus',tex:{top:'cactus_top',bottom:'cactus_top',side:'cactus_side'},hard:0.6,opaque:false,damage:1});
def(B.SANDSTONE,{name:'Sandstone',tex:{top:'sandstone_top',bottom:'sandstone_top',side:'sandstone'},hard:2,tool:'pick'});
def(B.SPRUCE_LOG,{name:'Spruce Log',tex:{top:'spruce_log_top',bottom:'spruce_log_top',side:'spruce_log'},hard:1.8,tool:'axe'});
def(B.SPRUCE_LEAVES,{name:'Spruce Leaves',tex:{all:'spruce_leaves'},opaque:false,cutout:true,tint:'pine',hard:0.35,drop:-1});
def(B.BIRCH_LOG,{name:'Birch Log',tex:{top:'birch_log_top',bottom:'birch_log_top',side:'birch_log'},hard:1.8,tool:'axe'});
def(B.BIRCH_LEAVES,{name:'Birch Leaves',tex:{all:'birch_leaves'},opaque:false,cutout:true,tint:'foliage',hard:0.35,drop:-1});
def(B.FARMLAND,{name:'Farmland',tex:{top:'farmland',bottom:'dirt',side:'dirt'},hard:0.8,tool:'shovel',drop:B.DIRT});
def(B.WHEAT0,{name:'Wheat Crop',tex:{all:'wheat0'},solid:false,opaque:false,cross:true,hard:0.05,drop:'seeds'});
def(B.WHEAT1,{name:'Wheat Crop',tex:{all:'wheat1'},solid:false,opaque:false,cross:true,hard:0.05,drop:'seeds'});
def(B.WHEAT2,{name:'Wheat Crop',tex:{all:'wheat2'},solid:false,opaque:false,cross:true,hard:0.05,drop:'wheat',dropExtra:'seeds'});
def(B.LAMP_OFF,{name:'Lamp',tex:{all:'lamp_off'},hard:1.2});
def(B.LAMP_ON,{name:'Lamp',tex:{all:'lamp_on'},hard:1.2,emit:15,drop:B.LAMP_OFF});
def(B.LEVER_OFF,{name:'Lever',tex:{all:'lever_off'},solid:false,opaque:false,cross:true,shape:'cross',cutout:true,hard:0.4,interact:'lever'});
def(B.LEVER_ON,{name:'Lever',tex:{all:'lever_on'},solid:false,opaque:false,cross:true,shape:'cross',cutout:true,hard:0.4,emit:6,drop:B.LEVER_OFF,interact:'lever'});
def(B.MOSSY,{name:'Mossy Cobblestone',tex:{all:'mossy'},hard:2.4,tool:'pick'});
def(B.WOOL,{name:'Wool',tex:{all:'wool'},hard:0.9});
def(B.BED,{name:'Bed',tex:{top:'bed_top',bottom:'planks',side:'bed_side'},hard:0.6,tool:'axe'});
def(B.TNT,{name:'TNT',tex:{top:'tnt_top',bottom:'tnt_top',side:'tnt_side'},hard:0.2,interact:'tnt'});


def(B.LADDER,{name:'Ladder',tex:{all:'ladder'},solid:false,opaque:false,cross:true,ladder:true,hard:0.4});
def(B.SAPLING,{name:'Sapling',tex:{all:'sapling'},solid:false,opaque:false,cross:true,hard:0.05});
def(B.WIRE_OFF,{name:'Redstone Wire',tex:{all:'wire'},solid:false,opaque:false,cross:true,shape:'wire',cutout:true,hard:0.1,drop:B.WIRE_OFF,interact:null,hw:0.5,hgt:0.06});
def(B.WIRE_ON,{name:'Redstone Wire',tex:{all:'wire'},solid:false,opaque:false,cross:true,emit:5,hard:0.1,drop:B.WIRE_OFF});
def(B.GLOWSTONE,{name:'Glowstone',tex:{all:'glowstone'},hard:1.2,drop:'redstone',dropCount:2});
def(B.ICE,{name:'Ice',tex:{all:'ice'},opaque:false,hard:1.2,tool:'pick',slippery:true,drop:-1});
def(B.REDSTONE_ORE,{name:'Redstone Ore',tex:{all:'redstone_ore'},hard:4.2,tool:'pick',tier:2,drop:'redstone',dropCount:3});
def(B.SNOW_LAYER,{name:'Snow',tex:{all:'snow'},solid:false,opaque:false,cross:true,hard:0.3,drop:-1});

export const isSolid = id => id !== undefined && BLOCKS[id] && BLOCKS[id].solid;
export const isOpaque = id => id !== undefined && BLOCKS[id] && BLOCKS[id].opaque;
export const isCross = id => id !== undefined && BLOCKS[id] && BLOCKS[id].cross;
export const isLiquid = id => id === B.WATER;
export const blockName = id => BLOCKS[id] ? BLOCKS[id].name : '?';
export const emitOf = id => (BLOCKS[id] && BLOCKS[id].emit) || 0;
// light attenuation for skylight passing through (vertical)
export const attOf = id => {
  if(id===undefined || id===B.AIR) return 0;
  const b = BLOCKS[id];
  if(!b) return 15;
  if(b.opaque) return 15;
  return b.attenuate || 0;
};
