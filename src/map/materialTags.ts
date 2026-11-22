// Which palette colours are which surface material (materials.ts). Tagging by colour lets the existing
// builders keep their colours unchanged: any vertex drawn with one of these exact colours picks up the
// material's surface detail and shading. Imported once, before the map is built (osmMap.ts).
import { hex } from '../engine/geometry';
import { MAT, tagColour } from '../engine/materials';
import { M } from './landmarks/kingsRoad';
import { K } from './landmarks/facadeKit';
import { P } from './palette';

const tag = (mat: number, ...cs: (string | [number, number, number])[]) => { for (const c of cs) tagColour(typeof c === 'string' ? hex(c) : c, mat); };

// King's Road, Sloane Street, side streets (shared corridor palette)
tag(MAT.BRICK, M.red, M.redDeep, M.redBright, M.brown, M.plum, M.rubbed);
tag(MAT.STOCK, M.stock, M.stockDark, M.stockGrey, M.buff, M.buffModern);
tag(MAT.STONE, M.portland, M.stone, M.travertine, M.stoneGrey, M.terracotta, M.concrete);
tag(MAT.STUCCO, M.stucco, M.stuccoWarm, M.stuccoGrey, M.stuccoPink, M.stuccoGreen, M.white, M.paintBlue, M.paintYellow, M.paintMint);
tag(MAT.KERB, M.kerb, M.granite);
tag(MAT.PAVING, M.pave, M.paveJoint);
tag(MAT.GLASS, M.glass);
tag(MAT.SHOPGLASS, M.shopGlass);
tag(MAT.METAL, M.iron);
// Sloane Square perimeter buildings (facade kit and the per-building colours in squareBuildings.ts)
tag(MAT.BRICK, K.redBrick, K.redBrickDark, K.terracotta, K.terracottaDeep, K.brownBrick,
  '#bb5537', '#b24c33', '#a9472f', '#a8462f', '#b3553a', '#a2432d', '#b04b33', '#ab4a31', '#ad4a31', '#a7442f');
tag(MAT.STOCK, K.yellowStock, '#b9a47d');
tag(MAT.STONE, K.beigeTerracotta, K.portland, K.portlandShade, K.stoneBand, K.concrete, '#dccba6', '#dcc3a0', '#dec4a0', '#dcc5a3', '#d9cba9');
tag(MAT.STUCCO, K.cream, K.paint, K.whitePaint, '#ebe4d3', '#e9e1cf', '#efebe2', '#ecebe6');
tag(MAT.GLASS, K.glass, K.glassLight, K.curtainGlass);
tag(MAT.METAL, K.ironBlack, K.black);
tag(MAT.KERB, K.graniteGrey);
// Map base: roads, pavements, plain massing
tag(MAT.ASPHALT, '#858991', '#979ba2', '#b2aea5', '#c6c1b6');
tag(MAT.PAVING, '#e6d9bd', '#d6c7a6', '#ece2cf', P.pavement);
tag(MAT.BRICK, '#a9563f', '#b5664a', '#9b4c3a', '#b9775a', '#94604a');
tag(MAT.STUCCO, '#f0e7d4', '#e9ddc5', '#f4ecdc', '#e6dccb');
