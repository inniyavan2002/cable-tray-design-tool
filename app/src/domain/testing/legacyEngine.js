// Verbatim copy of computeTray() from tool.html at commit b56bb36 (lines 918-1147).
// Used only by tests and the engine comparison report, to compare the new
// engine with the one it replaces. Do not edit: the point is that it is the
// original code.
/* eslint-disable */

const SPACING_OPTS = [
  { label: 'Touching (0d)', factor: 0 },
  { label: '0.5d', factor: 0.5 },
  { label: '1d', factor: 1 },
  { label: '2d', factor: 2 },
];

/**
 * @param {{ widths: number[], heights: number[] }} standards
 * @returns {(tray: object) => object}
 */
export function createLegacyComputeTray(standards) {
  const state = { standards };
  function spacingFactor(tray) {
    const o = SPACING_OPTS.find((s) => s.label === tray.spacingLabel);
    return o ? o.factor : 1;
  }
  function catalogById() {
    return null;
  }

  function computeTray(tray){
    //  FIX: deterministic, defensive calculation engine. Never allow a stale
    // catalogue/standard value to stop the live result from rendering.
    const instances=[];
    const cableRows=Array.isArray(tray && tray.cables) ? tray.cables : [];
    cableRows.forEach((c,idx)=>{
      let od=0, weight=0, cat=null;
      if(c && c.mode==='catalog'){
        cat=catalogById(c.catalogId);
        if(cat){ od=parseFloat(cat.od)||0; weight=parseFloat(cat.weight)||0; }
      } else if(c){
        od=parseFloat(c.od)||0; weight=parseFloat(c.weight)||0;
      }
      const qty=Math.max(1,parseInt(c && c.qty,10)||1);
      if(!(od>0)) return;
      for(let i=0;i<qty;i++) instances.push({od,weight,colorIdx:idx,rowId:c.id,cat});
    });

    const layers=Math.max(1,parseInt(tray && tray.layers,10)||1);
    const sf=spacingFactor(tray)||0;
    const cf=parseFloat(tray && tray.clearanceFactor);
    const clrFactor=Number.isFinite(cf) ? cf : 0.5;
    const topPct=Math.max(0,parseFloat(tray && tray.topClearance)||0)/100;
    const maxFill=Math.max(0.01,parseFloat(tray && tray.maxFillPct)||40)/100;
    const sparePct=Math.max(0,parseFloat(tray && tray.sparePct)||0)/100;
    const std=state.standards || {};
    const widths=(Array.isArray(std.widths)?std.widths:[]).slice().sort((a,b)=>a-b);
    const heights=(Array.isArray(std.heights)?std.heights:[]).slice().sort((a,b)=>a-b);

    if(!instances.length){
      return {empty:true,cableCount:0,maxFill,layers,sf,clrFactor,topClearancePct:topPct,sparePct};
    }

    const largestOD=Math.max.apply(null,instances.map(i=>i.od));
    const clearanceApplied=clrFactor*largestOD;
    const clearanceBothSides=clearanceApplied*2;
    const topClearance=topPct*largestOD;

    //  - GEOMETRY OPTIMIZER
    // Cable input order is NOT used for layer placement.  Every individual
    // cable may move to any layer.  The optimizer searches for the arrangement
    // that uses the smallest standard tray footprint, while respecting:
    //   • horizontal gap = spacing factor x max(adjacent cable OD)
    //   • optional vertical gap = MAX OD of the upper populated layer
    //   • maximum 3 populated layers
    //   • Layer 1 starts directly on the tray bottom
    // This intentionally allows one input row to be split across layers.
    const maxLayers=Math.min(3,Math.max(1,layers));
    const activeLayerCount=Math.min(maxLayers,instances.length);
    const tiers=Array.from({length:activeLayerCount},()=>[]);

    const pickStd=(req,list)=>{ for(const x of list){const n=parseFloat(x);if(Number.isFinite(n)&&n>=req-1e-9)return n;} return null; };

    function orderedTierWidth(items){
      if(!items.length) return 0;
      const a=items.slice().sort((x,y)=>(y.od-x.od)||(y.weight-x.weight));
      let w=0;
      for(let i=0;i<a.length;i++){
        w+=Number(a[i].od)||0;
        if(i<a.length-1) w += sf*Math.max(Number(a[i].od)||0,Number(a[i+1].od)||0);
      }
      return w;
    }

    function arrangementMetrics(candidateTiers){
      const used=candidateTiers.filter(t=>t.length);
      if(!used.length) return {reqW:0,reqH:0,area:0,stdW:0,stdH:0,score:0};
      const widths=used.map(orderedTierWidth);
      const maxW=Math.max(...widths);
      const spare=maxW*sparePct;
      const reqW=maxW+spare+clearanceApplied;
      const heights=used.map(t=>Math.max(...t.map(i=>Number(i.od)||0)));
      let reqH=heights.reduce((a,b)=>a+b,0)+topClearance;
      if(useLayerSpace){
        for(let i=0;i<heights.length-1;i++) reqH+=heights[i+1];
      }
      const stdW=pickStd(reqW,widthsStdForOptimizer);
      const stdH=pickStd(reqH,heightsStdForOptimizer);
      const dw=stdW||reqW, dh=stdH||reqH;
      // Primary goal: smallest standard tray footprint. Then width, height,
      // and finally raw required footprint for stable, neat results.
      const score=(reqW*1000000000)+(reqH*1000000)+(dw*1000)+dh+(dw*dh*0.001);
      return {reqW,reqH,area:dw*dh,stdW,stdH,score};
    }

    // Standard sizes are declared below in computeTray, so use the tray
    // catalog arrays captured here after their declarations are hoisted by
    // moving the values through local aliases before the search.
    const widthsStdForOptimizer=widths;
    const heightsStdForOptimizer=heights;
    const useLayerSpace = tray && tray.layerSpaceMode !== "no";

    // Beam-search all useful layer assignments.  Large cables are considered
    // first; states that are geometrically dominated are discarded.  This is
    // deliberately a geometry search, not an input-order or size-sort rule.
    let states=[{ts:Array.from({length:activeLayerCount},()=>[])}];
    const searchItems=instances.slice().sort((a,b)=>(b.od-a.od)||(b.weight-a.weight));
    const BEAM=1800;
    for(const inst of searchItems){
      const next=[];
      for(const st of states){
        for(let k=0;k<activeLayerCount;k++){
          // Symmetry break: do not create a later empty layer while an earlier
          // layer is still empty.
          if(k>0 && !st.ts[k-1].length) continue;
          const nt=st.ts.map(t=>t.slice());
          nt[k].push(inst);
          next.push({ts:nt});
        }
      }
      // Fast partial score: width plus current vertical stack. This keeps
      // promising compact arrangements while avoiding an expensive full
      // combinatorial search for large schedules.
      next.sort((a,b)=>{
        const pa=a.ts.filter(t=>t.length);
        const pb=b.ts.filter(t=>t.length);
        const wa=pa.length?Math.max(...pa.map(orderedTierWidth)):0;
        const wb=pb.length?Math.max(...pb.map(orderedTierWidth)):0;
        const ha=pa.reduce((m,t)=>m+Math.max(...t.map(x=>x.od)),0);
        const hb=pb.reduce((m,t)=>m+Math.max(...t.map(x=>x.od)),0);
        const ga=useLayerSpace?pa.slice(1).reduce((m,t)=>m+Math.max(...t.map(x=>x.od)),0):0;
        const gb=useLayerSpace?pb.slice(1).reduce((m,t)=>m+Math.max(...t.map(x=>x.od)),0):0;
        return (wa+0.25*ha+ga)-(wb+0.25*hb+gb);
      });
      // Remove exact duplicate layer-size states.
      const seen=new Set(), kept=[];
      for(const st of next){
        const key=st.ts.map(t=>t.map(x=>x.od.toFixed(3)).sort((a,b)=>b-a).join(',')).join('|');
        if(seen.has(key)) continue;
        seen.add(key); kept.push(st);
        if(kept.length>=BEAM) break;
      }
      states=kept;
    }

    let best=null;
    for(const st of states){
      // If the user selected multiple layers and there are enough cables,
      // populate each selected layer. The optimizer then decides which cable
      // goes where; it does not follow input order.
      const nonEmpty=st.ts.filter(t=>t.length);
      if(activeLayerCount>1 && nonEmpty.length<activeLayerCount) continue;
      const compact=st.ts.filter(t=>t.length).map(t=>t.slice().sort((a,b)=>(b.od-a.od)||(b.weight-a.weight)));
      const m=arrangementMetrics(compact);
      if(!best || m.score<best.m.score) best={ts:compact,m};
    }
    // Fallback only for the one-cable case or if beam pruning left no full state.
    if(!best){
      for(const st of states){
        const compact=st.ts.filter(t=>t.length).map(t=>t.slice().sort((a,b)=>(b.od-a.od)||(b.weight-a.weight)));
        const m=arrangementMetrics(compact);
        if(!best || m.score<best.m.score) best={ts:compact,m};
      }
    }
    if(best) best.ts.forEach((t,i)=>tiers[i].push(...t));

    const tierGaps=tiers.map(tier=>{
      const gaps=[];
      for(let i=0;i<tier.length-1;i++) gaps.push(sf*Math.max(tier[i].od,tier[i+1].od));
      return gaps;
    });
    const tierWidths=tiers.map((tier,k)=>{
      const odSum=tier.reduce((sum,i)=>sum+i.od,0);
      const gapSum=(tierGaps[k]||[]).reduce((sum,g)=>sum+g,0);
      return odSum+gapSum;
    });
    const activeTierWidths=tierWidths.slice(0,activeLayerCount);
    const maxLayerWidth=activeTierWidths.length?Math.max.apply(null,activeTierWidths):0;
    const spareWidth=maxLayerWidth*sparePct;
    const widthSubtotal=maxLayerWidth;
    const requiredWidth=widthSubtotal+spareWidth+clearanceApplied;

    // : explicit occupied-layer stack.
    // Layer 1 is the tray-bottom layer. Each next populated layer is placed
    // above the previous populated layer. The requested inter-layer gap is
    // based on the MAX OD of the UPPER populated layer.
    const tierHeights=tiers.map(t=>t.length?Math.max(...t.map(i=>Number(i.od)||0)):0);
    const occupiedLayerIndices=tiers.map((t,i)=>t.length?i:-1).filter(i=>i>=0);

    const tierGapsV=Array(Math.max(0,layers-1)).fill(0);
    for(let k=0;k<occupiedLayerIndices.length-1;k++){
      const lowerIndex=occupiedLayerIndices[k];
      const upperIndex=occupiedLayerIndices[k+1];
      const upperLayer=tiers[upperIndex]||[];
      const upperMax=upperLayer.length ? Math.max(...upperLayer.map(x=>Number(x.od)||0)) : 0;
      tierGapsV[lowerIndex]=useLayerSpace ? upperMax : 0;
    }

    const activeTierHeights=occupiedLayerIndices.map(i=>tierHeights[i]);
    const cableLayerStack=activeTierHeights.reduce((sum,h)=>sum+h,0);

    const interLayerGaps=occupiedLayerIndices.slice(0,-1).reduce(
      (sum,lowerIndex)=>sum+(Number(tierGapsV[lowerIndex])||0),0
    );

    const requiredHeight=cableLayerStack+interLayerGaps+topClearance;

    // Physical vertical positions measured upward from the tray bottom.
    // layerBottoms[i] = bottom elevation of that populated layer.
    const layerBottoms={};
    let stackY=0;
    occupiedLayerIndices.forEach((layerIndex,pos)=>{
      layerBottoms[layerIndex]=stackY;
      stackY += tierHeights[layerIndex];
      if(pos<occupiedLayerIndices.length-1){
        stackY += Number(tierGapsV[layerIndex])||0;
      }
    });

    const selWidth=pickStd(requiredWidth,widths);
    const selHeight=pickStd(requiredHeight,heights);
    const totalArea=instances.reduce((sum,i)=>sum+(Math.PI/4)*i.od*i.od,0);
    const displayWidth=selWidth||requiredWidth;
    const displayHeight=selHeight||requiredHeight;
    const fillArea=(displayWidth>0&&displayHeight>0)?displayWidth*displayHeight:null;
    const fillPct=fillArea?totalArea/fillArea:null;
    const totalWeightKgM=instances.reduce((sum,i)=>sum+i.weight/1000,0);
    const status=fillPct!=null&&fillPct>maxFill?'fail':(!selWidth||!selHeight?'warn':'pass');

    return {
      empty:false,instances,tiers,tierHeights,tierGaps,tierWidths,maxLayerWidth,
      largestOD,clearanceApplied,clearanceBothSides,topClearance,gap:sf*largestOD,
      requiredWidthSub:widthSubtotal,requiredWidth,requiredHeight,selWidth,selHeight,
      fillPct,maxFill,status,totalWeightKgM,cableCount:instances.length,layers,sf,
      clrFactor,topClearancePct:topPct,sparePct,tierGapsV,activeTierHeights,
      activeVerticalGaps:tierGapsV.slice(),occupiedLayerIndices,tierHeights,cableLayerStack,interLayerGaps,layerBottoms,layerSpaceMode:(useLayerSpace?"yes":"no"),
      totalOccupiedWidthSingleLayer:maxLayerWidth,widthPerLayer:maxLayerWidth,
      spareWidth,widthSubtotal,rowWidthDetails:[]
    };
  }

  return computeTray;
}
