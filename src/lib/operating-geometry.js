import pointInPolygon from '@turf/boolean-point-in-polygon';
import valid from '@turf/boolean-valid';
import kinks from '@turf/kinks';
import difference from '@turf/difference';
import {feature,featureCollection} from '@turf/helpers';
import EG from './geography/EG.json' with {type:'json'};
import JO from './geography/JO.json' with {type:'json'};
import IQ from './geography/IQ.json' with {type:'json'};
import SA from './geography/SA.json' with {type:'json'};
import AE from './geography/AE.json' with {type:'json'};
import BH from './geography/BH.json' with {type:'json'};
import QA from './geography/QA.json' with {type:'json'};
import KW from './geography/KW.json' with {type:'json'};
import OM from './geography/OM.json' with {type:'json'};
import SY from './geography/SY.json' with {type:'json'};
import LB from './geography/LB.json' with {type:'json'};
import PS from './geography/PS.json' with {type:'json'};
import YE from './geography/YE.json' with {type:'json'};
import TR from './geography/TR.json' with {type:'json'};
import IR from './geography/IR.json' with {type:'json'};
import MA from './geography/MA.json' with {type:'json'};
import DZ from './geography/DZ.json' with {type:'json'};
import TN from './geography/TN.json' with {type:'json'};
import LY from './geography/LY.json' with {type:'json'};
import SD from './geography/SD.json' with {type:'json'};
import MR from './geography/MR.json' with {type:'json'};
export const countryBoundaries={EG,JO,IQ,SA,AE,BH,QA,KW,OM,SY,LB,PS,YE,TR,IR,MA,DZ,TN,LY,SD,MR};
export function contains(geometry,point){if(!geometry||!Number.isFinite(point?.lat)||!Number.isFinite(point?.lng))return false;return pointInPolygon([point.lng,point.lat],geometry,{ignoreBoundary:false});}
export function geometryError(geometry,country){
 try{
  if(!['Polygon','MultiPolygon'].includes(geometry?.type))return 'Draw a polygon or multipolygon.';
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  if(!polygons.length||polygons.length>10)return 'A zone must have 1–10 polygon parts.';
  let count=0;for(const rings of polygons){if(!rings.length||rings.length>10)return 'Invalid polygon rings.';for(const ring of rings){count+=ring.length;if(ring.length<4||ring.length>500||JSON.stringify(ring[0])!==JSON.stringify(ring.at(-1)))return 'Close each boundary with at least three vertices.';for(const p of ring)if(p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90)return 'Invalid longitude/latitude coordinates.';const area=ring.slice(0,-1).reduce((sum,p,i)=>sum+p[0]*ring[i+1][1]-ring[i+1][0]*p[1],0);if(Math.abs(area)<1e-10)return 'A boundary must enclose a non-zero area.';}}
  if(count>1000)return 'Use at most 1,000 vertices per zone.';
  if(!valid(geometry)||kinks(geometry).features.length)return 'Boundary is invalid or intersects itself.';
  if(!countryBoundaries[country])return 'Unsupported country.';
  if(difference(featureCollection([feature(geometry),feature(countryBoundaries[country])]))!==null)return 'The entire zone must lie inside its selected country.';
  return null;
 }catch{return 'Invalid service-zone geometry.';}
}
