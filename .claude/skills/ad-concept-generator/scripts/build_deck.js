/**
 * build_deck.js — Ad concept deck generator (brand-agnostic).
 *
 * Usage:
 *   node build_deck.js <config.json> [out.pptx]
 *
 * config.json shape:
 * {
 *   "brand": {
 *     "name": "Brand",                 // shown on cover
 *     "agency": "Creative AdBundance",  // optional, cover eyebrow
 *     "accent": "7A3FF2",               // hex WITHOUT '#', used for titles/dividers
 *     "font": "Poppins",                // any font available in the target (Google Slides/PowerPoint)
 *     "coverTitle": "Ad Concepts",      // optional
 *     "coverSubtitle": "..."            // optional
 *   },
 *   "sections": [
 *     {
 *       "title": "Sleep",
 *       "sub": "Concepts 001-004",      // optional divider subtitle
 *       "concepts": [
 *         {
 *           "num": "001",
 *           "title": "We Can Leave the House Again",
 *           "desc": "2-3 sentence concept-focused description...",
 *           "narrative": ["Open on ...", "Cut to ...", ... 5-6 beats ...],
 *           "design": ["unique device ...", "...", "Duration: 20-30 seconds."],
 *           "awareness": "Problem Aware",   // optional: Problem/Solution/Most Aware — prints as chip
 *           "lane": "Creator UGC"           // optional: Creator UGC / B-roll only / Animation / AI + B-roll / In-house
 *         }
 *       ]
 *     }
 *   ]
 * }
 *
 * Notes:
 * - Each concept slide reserves a 9:16 mockup placeholder on the right.
 * - Titles render as "NNN_Title" in the brand accent color.
 * - Layout is tuned so 5-6 narrative beats + up to 4 design lines fit without overflow.
 */
const pptxgen = require("pptxgenjs");
const fs = require("fs");

const cfgPath = process.argv[2];
const outPath = process.argv[3] || "/home/claude/ad-concepts.pptx";
if (!cfgPath) { console.error("Usage: node build_deck.js <config.json> [out.pptx]"); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

const B = cfg.brand || {};
const ACCENT = (B.accent || "7A3FF2").replace(/^#/, "");
const F = B.font || "Poppins";
const HEAD="20242E", INKD="2A2E37", MUTE="9AA3B2", BOX="D9DEE8", BOXF="F7F8FB", WHITE="FFFFFF";
// light tint of accent for divider subtitle
function tint(hex){ try{const n=parseInt(hex,16);let r=(n>>16)&255,g=(n>>8)&255,b=n&255;r=Math.round(r+(255-r)*0.75);g=Math.round(g+(255-g)*0.75);b=Math.round(b+(255-b)*0.75);return ((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1).toUpperCase();}catch(e){return "EADFFF";}}
const ACCENT_TINT = tint(ACCENT);

const p = new pptxgen();
p.layout = "LAYOUT_WIDE"; // 13.333 x 7.5

function mock(s){
  const w=3.375, h=6.0, x=13.333-0.5-w, y=0.75;
  s.addShape(p.ShapeType.roundRect,{x,y,w,h,rectRadius:0.1,fill:{color:BOXF},line:{color:BOX,width:1.25,dashType:"dash"}});
  s.addText("9:16 mockup",{x,y:y+h/2-0.35,w,h:0.4,align:"center",fontFace:F,fontSize:13,color:MUTE,bold:true,margin:0});
  s.addText("add ad still here",{x,y:y+h/2+0.02,w,h:0.35,align:"center",fontFace:F,fontSize:10,color:MUTE,margin:0});
}

function conceptSlide(c){
  const s=p.addSlide(); s.background={color:WHITE}; const LW=8.35;
  s.addText((c.num?c.num+"_":"")+c.title,{x:0.5,y:0.34,w:LW,h:0.8,fontFace:F,fontSize:20,bold:true,color:ACCENT,valign:"top",lineSpacingMultiple:1.0,margin:0});
  // Tags: awareness stage + production lane, printed as small chips under the mockup box
  const tags=[c.awareness,c.lane].filter(Boolean);
  if(tags.length){
    s.addText(tags.join("   ·   "),{x:9.05,y:6.9,w:3.6,h:0.3,align:"center",fontFace:F,fontSize:9.5,bold:true,color:ACCENT,margin:0});
  }
  const hk = c.hooks||{}; const hookLines=[];
  if(hk.overlay) hookLines.push("Overlay:  \u201C"+hk.overlay+"\u201D");
  if(hk.line) hookLines.push("First line:  \u201C"+hk.line+"\u201D");
  if(hookLines.length){
    s.addText(c.desc||"",{x:0.5,y:1.12,w:LW,h:1.0,fontFace:F,fontSize:10.5,color:INKD,valign:"top",lineSpacingMultiple:1.04,margin:0});
    s.addText("Hooks",{x:0.5,y:2.14,w:LW,h:0.26,fontFace:F,fontSize:13,bold:true,color:HEAD,margin:0});
    s.addText(hookLines.map((b,i)=>({text:b,options:{bullet:{characterCode:"2013",indent:14},breakLine:i<hookLines.length-1}})),
      {x:0.5,y:2.42,w:LW,h:0.66,fontFace:F,fontSize:10.5,color:INKD,valign:"top",paraSpaceAfter:2,lineSpacingMultiple:1.0,margin:0});
    s.addText("Narrative",{x:0.5,y:3.12,w:LW,h:0.26,fontFace:F,fontSize:13,bold:true,color:HEAD,margin:0});
    s.addText((c.narrative||[]).map((b,i)=>({text:b,options:{bullet:{characterCode:"2013",indent:14},breakLine:i<c.narrative.length-1}})),
      {x:0.5,y:3.4,w:LW,h:2.15,fontFace:F,fontSize:10.5,color:INKD,valign:"top",paraSpaceAfter:3,lineSpacingMultiple:1.0,margin:0});
    s.addText("Design Components",{x:0.5,y:5.66,w:LW,h:0.26,fontFace:F,fontSize:13,bold:true,color:HEAD,margin:0});
    s.addText((c.design||[]).map((b,i)=>({text:b,options:{bullet:{characterCode:"2013",indent:14},breakLine:i<c.design.length-1}})),
      {x:0.5,y:5.94,w:LW,h:1.35,fontFace:F,fontSize:10.5,color:INKD,valign:"top",paraSpaceAfter:2,lineSpacingMultiple:1.0,margin:0});
  } else {
    s.addText(c.desc||"",{x:0.5,y:1.2,w:LW,h:1.15,fontFace:F,fontSize:10.5,color:INKD,valign:"top",lineSpacingMultiple:1.04,margin:0});
    s.addText("Narrative",{x:0.5,y:2.5,w:LW,h:0.28,fontFace:F,fontSize:13,bold:true,color:HEAD,margin:0});
    s.addText((c.narrative||[]).map((b,i)=>({text:b,options:{bullet:{characterCode:"2013",indent:14},breakLine:i<c.narrative.length-1}})),
      {x:0.5,y:2.8,w:LW,h:2.55,fontFace:F,fontSize:10.5,color:INKD,valign:"top",paraSpaceAfter:3,lineSpacingMultiple:1.0,margin:0});
    s.addText("Design Components",{x:0.5,y:5.5,w:LW,h:0.28,fontFace:F,fontSize:13,bold:true,color:HEAD,margin:0});
    s.addText((c.design||[]).map((b,i)=>({text:b,options:{bullet:{characterCode:"2013",indent:14},breakLine:i<c.design.length-1}})),
      {x:0.5,y:5.8,w:LW,h:1.4,fontFace:F,fontSize:10.5,color:INKD,valign:"top",paraSpaceAfter:2,lineSpacingMultiple:1.0,margin:0});
  }
  mock(s);
}

function sectionSlide(title, sub){
  const s=p.addSlide(); s.background={color:ACCENT};
  s.addText(title,{x:0.8,y:2.95,w:11.7,h:1.0,fontFace:F,fontSize:36,bold:true,color:WHITE});
  if(sub) s.addText(sub,{x:0.82,y:4.0,w:11.5,h:0.6,fontFace:F,fontSize:15,color:ACCENT_TINT});
}

// Cover
(function(){
  const s=p.addSlide(); s.background={color:WHITE};
  const eyebrow = (B.agency? B.agency+"  \u00D7  " : "") + (B.name||"Brand");
  s.addText(eyebrow,{x:0.7,y:1.95,w:12,h:0.5,fontFace:F,fontSize:15,color:MUTE,bold:true});
  s.addText(B.coverTitle||"Ad Concepts",{x:0.7,y:2.45,w:12,h:1.0,fontFace:F,fontSize:42,bold:true,color:ACCENT});
  if(B.coverSubtitle) s.addText(B.coverSubtitle,{x:0.72,y:3.7,w:12,h:0.7,fontFace:F,fontSize:15,color:INKD});
})();

(cfg.sections||[]).forEach(sec=>{
  if(sec.title) sectionSlide(sec.title, sec.sub);
  (sec.concepts||[]).forEach(conceptSlide);
});

p.writeFile({fileName: outPath}).then(f=>console.log("WROTE", f));
