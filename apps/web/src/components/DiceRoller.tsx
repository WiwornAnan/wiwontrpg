import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// The dial markup + controls, ported verbatim from the reference prototype so
// the tuned art/animations transfer exactly. Wrapped in .wiwon-dice-host which
// supplies the design tokens the widget's inline styles reference.
const WIDGET_HTML = `
<style>
.wiwon-dice-host{--font-sans:system-ui,-apple-system,"Segoe UI",sans-serif;--border:#3a3a3a;--border-strong:#55554f;--radius:8px;--text-primary:#eee;--text-secondary:#a8a8a0;--text-muted:#7a7a72;--surface-1:#16161a;--surface-2:#1f1f24;--bg-success:rgba(15,110,86,0.12);--bg-danger:rgba(163,45,45,0.12);color:var(--text-primary);font-family:var(--font-sans)}
.wiwon-dice-host .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
.wiwon-dice-host button{font-family:var(--font-sans);background:var(--surface-2);color:var(--text-primary);border:0.5px solid var(--border);border-radius:var(--radius);cursor:pointer}
.wiwon-dice-host button:disabled{opacity:0.5;cursor:not-allowed}
.wiwon-dice-host .row{border:0.5px solid var(--border);border-radius:var(--radius);padding:10px 14px;position:relative;transition:border-color .2s,background .2s}
.wiwon-dice-host .row.adv{border:2px solid #0f6e56;background:var(--bg-success)}
.wiwon-dice-host .row.dis{border:2px dashed #A32D2D;background:var(--bg-danger)}
.wiwon-dice-host .badge{position:absolute;top:-9px;right:12px;font-size:11px;padding:2px 10px;border-radius:var(--radius);display:none}
.wiwon-dice-host .row.adv .badge.a{display:block;background:#0f6e56;color:#eaf3de}
.wiwon-dice-host .row.dis .badge.d{display:block;background:#A32D2D;color:#fcebeb}
.wiwon-dice-host .seg{display:flex;border:0.5px solid var(--border);border-radius:var(--radius);overflow:hidden}
.wiwon-dice-host .seg button{padding:4px 12px;font-size:12px;border:none;border-radius:0}
.wiwon-dice-host .seg button.on-a{background:#0f6e56;color:#eaf3de}
.wiwon-dice-host .seg button.on-d{background:#A32D2D;color:#fcebeb}
.wiwon-dice-host .chip{padding:4px 10px;font-size:12px}
.wiwon-dice-host .chip.on{border-color:#c23a3a;color:#c23a3a}
.wiwon-dice-host .glow{opacity:0;transition:opacity .35s}
.wiwon-dice-host .glow.show{opacity:1}
.wiwon-dice-host .glow.adv-anim.show{animation:advPulse 1.6s ease-in-out infinite}
.wiwon-dice-host .glow.dis-anim.show{animation:disCrawl 1s linear infinite}
@keyframes advPulse{0%,100%{opacity:.5}50%{opacity:1}}
@keyframes disCrawl{to{stroke-dashoffset:-24}}
@keyframes waterRipple{0%{transform:scale(0.04);opacity:0.85}70%{opacity:0.4}100%{transform:scale(1);opacity:0}}
.wiwon-dice-host .ripple-ring{fill:none;stroke:#8fd6ff;opacity:0;transform-origin:200px 200px;transform:scale(0.04)}
.wiwon-dice-host .ripple-ring.go{animation:waterRipple 1.15s ease-out forwards}
.wiwon-dice-host .ripple-ring.gold{stroke:#f7dca0}
.wiwon-dice-host .ripple-ring.go.big{animation-duration:1.5s}
@keyframes dialShake{0%,100%{transform:translate(0,0)}20%{transform:translate(-6px,3px)}40%{transform:translate(5px,-5px)}60%{transform:translate(-5px,-3px)}80%{transform:translate(6px,4px)}}
.wiwon-dice-host #dial.shake{animation:dialShake .4s ease-in-out 3}
@keyframes crackPop{0%{opacity:0;transform:scale(.7)}60%{opacity:1;transform:scale(1.05)}100%{opacity:1;transform:scale(1)}}
.wiwon-dice-host .crack-show{animation:crackPop .35s ease-out forwards;transform-origin:200px 200px}
@keyframes flashBurst{0%{opacity:.85;transform:scale(.4)}100%{opacity:0;transform:scale(1.5)}}
.wiwon-dice-host .flash-anim{animation:flashBurst .6s ease-out forwards;transform-origin:200px 200px}
</style>
<div class="wiwon-dice-host">
<h2 class="sr-only">เข็มทิศลูกเต๋าสามชั้น</h2>
<div style="background:#0a0e18;border-radius:16px;padding:1.25rem;display:flex;flex-direction:column;align-items:center;gap:8px">
<svg id="dial" viewBox="0 0 400 400" width="320" height="320" role="img">
<title>Triple layer dice astrolabe</title>
<circle cx="200" cy="200" r="196" fill="#0a0e18"/>
<g opacity="0.55">
<circle cx="200" cy="200" r="178.0" fill="none" stroke="#2a2a22" stroke-width="1"/>
<path d="M378.0 217.4 L386.0 189.6 L386.0 210.4 L378.0 182.6 Z" fill="none" stroke="#2a2a22" stroke-width="1"/>
<path d="M361.3 277.2 L378.4 253.8 L371.2 273.4 L373.2 244.5 Z" fill="none" stroke="#2a2a22" stroke-width="1"/>
<path d="M325.2 327.7 L349.2 311.6 L335.8 327.6 L347.5 301.1 Z" fill="none" stroke="#2a2a22" stroke-width="1"/>
<path d="M273.9 362.9 L302.0 355.9 L284.0 366.3 L304.1 345.5 Z" fill="none" stroke="#2a2a22" stroke-width="1"/>
<path d="M213.8 378.3 L242.6 381.4 L222.0 385.0 L248.0 372.3 Z" fill="none" stroke="#2a2a22" stroke-width="1"/>
<path d="M152.0 372.3 L178.0 385.0 L157.4 381.4 L186.2 378.3 Z" fill="none" stroke="#2a2a22" stroke-width="1"/>
<path d="M95.9 345.5 L116.0 366.3 L98.0 355.9 L126.1 362.9 Z" fill="none" stroke="#2a2a22" stroke-width="1"/>
<path d="M52.5 301.1 L64.2 327.6 L50.8 311.6 L74.8 327.7 Z" fill="none" stroke="#2a2a22" stroke-width="1"/>
<path d="M26.8 244.5 L28.8 273.4 L21.6 253.8 L38.7 277.2 Z" fill="none" stroke="#2a2a22" stroke-width="1"/>
<path d="M22.0 182.6 L14.0 210.4 L14.0 189.6 L22.0 217.4 Z" fill="none" stroke="#2a2a22" stroke-width="1"/>
<path d="M38.7 122.8 L21.6 146.2 L28.8 126.6 L26.8 155.5 Z" fill="none" stroke="#2a2a22" stroke-width="1"/>
<path d="M74.8 72.3 L50.8 88.4 L64.2 72.4 L52.5 98.9 Z" fill="none" stroke="#2a2a22" stroke-width="1"/>
<path d="M126.1 37.1 L98.0 44.1 L116.0 33.7 L95.9 54.5 Z" fill="none" stroke="#2a2a22" stroke-width="1"/>
<path d="M186.2 21.7 L157.4 18.6 L178.0 15.0 L152.0 27.7 Z" fill="none" stroke="#2a2a22" stroke-width="1"/>
<path d="M248.0 27.7 L222.0 15.0 L242.6 18.6 L213.8 21.7 Z" fill="none" stroke="#2a2a22" stroke-width="1"/>
<path d="M304.1 54.5 L284.0 33.7 L302.0 44.1 L273.9 37.1 Z" fill="none" stroke="#2a2a22" stroke-width="1"/>
<path d="M347.5 98.9 L335.8 72.4 L349.2 88.4 L325.2 72.3 Z" fill="none" stroke="#2a2a22" stroke-width="1"/>
<path d="M373.2 155.5 L371.2 126.6 L378.4 146.2 L361.3 122.8 Z" fill="none" stroke="#2a2a22" stroke-width="1"/>
</g>
<circle cx="200" cy="200" r="191" fill="none" stroke="#cfc6a8" stroke-width="1.5"/>
<circle cx="200" cy="200" r="185" fill="none" stroke="#4a4636" stroke-width="0.75"/>
<line x1="200" y1="2" x2="200" y2="20" stroke="#e8c98a" stroke-width="2"/>
<line x1="200" y1="380" x2="200" y2="398" stroke="#e8c98a" stroke-width="2"/>
<line x1="2" y1="200" x2="20" y2="200" stroke="#e8c98a" stroke-width="2"/>
<line x1="380" y1="200" x2="398" y2="200" stroke="#e8c98a" stroke-width="2"/>
<g id="deco-top-orbit" style="transform-origin:200px 200px;transition:transform 3.2s cubic-bezier(.2,.7,.3,1)">
<g transform="translate(338 90)"><g id="deco-top" style="transform-origin:0px 0px;transition:transform 3.2s cubic-bezier(.2,.7,.3,1)">
<circle cx="0" cy="0" r="13.0" fill="#AFA9EC" stroke="#3C3489" stroke-width="1"/>
<circle cx="0" cy="0" r="5.2" fill="#26215C"/>
</g></g></g>
<g id="deco-bottom-orbit" style="transform-origin:200px 200px;transition:transform 3.2s cubic-bezier(.2,.7,.3,1)">
<g transform="translate(355 305)"><g id="deco-bottom" style="transform-origin:0px 0px;transition:transform 3.2s cubic-bezier(.2,.7,.3,1)">
<circle cx="0" cy="0" r="8.0" fill="#f0c76a" stroke="#8a5a12" stroke-width="1"/>
<circle cx="0" cy="0" r="3.2" fill="#4a2f08"/>
</g></g></g>
<g id="ego-band-group">
<circle cx="200" cy="200" r="158" fill="none" stroke="#7a1620" stroke-width="32"/>
<circle cx="200" cy="200" r="174" fill="none" stroke="#3d0d12" stroke-width="1.25"/>
<circle cx="200" cy="200" r="142" fill="none" stroke="#3d0d12" stroke-width="1.25"/>
<circle cx="200" cy="200" r="158" fill="none" stroke="#c23a3a" stroke-width="1" opacity="0.6"/>
</g>
<circle id="ego-adv-glow" class="glow adv-anim" cx="200" cy="200" r="179" fill="none" stroke="#2fd18b" stroke-width="6"/>
<circle id="ego-dis-glow" class="glow dis-anim" cx="200" cy="200" r="179" fill="none" stroke="#ff5a5a" stroke-width="3" stroke-dasharray="10 6"/>
<g id="ego-numerals"></g>
<g id="ambient-band-group">
<circle cx="200" cy="200" r="109" fill="none" stroke="#155f4f" stroke-width="26"/>
<circle cx="200" cy="200" r="123" fill="none" stroke="#0a382e" stroke-width="1.25"/>
<circle cx="200" cy="200" r="95" fill="none" stroke="#0a382e" stroke-width="1.25"/>
</g>
<circle id="ambient-adv-glow" class="glow adv-anim" cx="200" cy="200" r="128" fill="none" stroke="#2fd18b" stroke-width="6"/>
<circle id="ambient-dis-glow" class="glow dis-anim" cx="200" cy="200" r="128" fill="none" stroke="#ff5a5a" stroke-width="3" stroke-dasharray="8 5"/>
<text x="200.0" y="91.0" text-anchor="middle" dominant-baseline="central" font-size="22" fill="#e8f9f2" font-family="var(--font-sans)" font-weight="500" transform="rotate(0.0 200.0 91.0)">I</text>
<text x="277.1" y="122.9" text-anchor="middle" dominant-baseline="central" font-size="22" fill="#e8f9f2" font-family="var(--font-sans)" font-weight="500" transform="rotate(45.0 277.1 122.9)">II</text>
<text x="309.0" y="200.0" text-anchor="middle" dominant-baseline="central" font-size="22" fill="#e8f9f2" font-family="var(--font-sans)" font-weight="500" transform="rotate(90.0 309.0 200.0)">III</text>
<text x="277.1" y="277.1" text-anchor="middle" dominant-baseline="central" font-size="22" fill="#e8f9f2" font-family="var(--font-sans)" font-weight="500" transform="rotate(135.0 277.1 277.1)">IV</text>
<text x="200.0" y="309.0" text-anchor="middle" dominant-baseline="central" font-size="22" fill="#e8f9f2" font-family="var(--font-sans)" font-weight="500" transform="rotate(180.0 200.0 309.0)">V</text>
<text x="122.9" y="277.1" text-anchor="middle" dominant-baseline="central" font-size="22" fill="#e8f9f2" font-family="var(--font-sans)" font-weight="500" transform="rotate(225.0 122.9 277.1)">VI</text>
<text x="91.0" y="200.0" text-anchor="middle" dominant-baseline="central" font-size="22" fill="#e8f9f2" font-family="var(--font-sans)" font-weight="500" transform="rotate(270.0 91.0 200.0)">VII</text>
<text x="122.9" y="122.9" text-anchor="middle" dominant-baseline="central" font-size="22" fill="#e8f9f2" font-family="var(--font-sans)" font-weight="500" transform="rotate(315.0 122.9 122.9)">VIII</text>
<g id="fortuity-band-group">
<circle cx="200" cy="200" r="63" fill="none" stroke="#8a5a12" stroke-width="19"/>
<circle cx="200" cy="200" r="74" fill="none" stroke="#4a2f08" stroke-width="1.25"/>
<circle cx="200" cy="200" r="52" fill="none" stroke="#4a2f08" stroke-width="1.25"/>
</g>
<circle id="fortuity-adv-glow" class="glow adv-anim" cx="200" cy="200" r="79" fill="none" stroke="#2fd18b" stroke-width="6"/>
<circle id="fortuity-dis-glow" class="glow dis-anim" cx="200" cy="200" r="79" fill="none" stroke="#ff5a5a" stroke-width="3" stroke-dasharray="6 4"/>
<text x="200.0" y="137.0" text-anchor="middle" dominant-baseline="central" font-size="14" fill="#fff6e0" font-family="var(--font-sans)" font-weight="500" transform="rotate(-0.0 200.0 137.0)">I</text>
<text x="163.0" y="149.0" text-anchor="middle" dominant-baseline="central" font-size="14" fill="#fff6e0" font-family="var(--font-sans)" font-weight="500" transform="rotate(-36.0 163.0 149.0)">II</text>
<text x="140.1" y="180.5" text-anchor="middle" dominant-baseline="central" font-size="14" fill="#fff6e0" font-family="var(--font-sans)" font-weight="500" transform="rotate(-72.0 140.1 180.5)">III</text>
<text x="140.1" y="219.5" text-anchor="middle" dominant-baseline="central" font-size="14" fill="#fff6e0" font-family="var(--font-sans)" font-weight="500" transform="rotate(-108.0 140.1 219.5)">IV</text>
<text x="163.0" y="251.0" text-anchor="middle" dominant-baseline="central" font-size="14" fill="#fff6e0" font-family="var(--font-sans)" font-weight="500" transform="rotate(-144.0 163.0 251.0)">V</text>
<text x="200.0" y="263.0" text-anchor="middle" dominant-baseline="central" font-size="14" fill="#fff6e0" font-family="var(--font-sans)" font-weight="500" transform="rotate(-180.0 200.0 263.0)">VI</text>
<text x="237.0" y="251.0" text-anchor="middle" dominant-baseline="central" font-size="14" fill="#fff6e0" font-family="var(--font-sans)" font-weight="500" transform="rotate(-216.0 237.0 251.0)">VII</text>
<text x="259.9" y="219.5" text-anchor="middle" dominant-baseline="central" font-size="14" fill="#fff6e0" font-family="var(--font-sans)" font-weight="500" transform="rotate(-252.0 259.9 219.5)">VIII</text>
<text x="259.9" y="180.5" text-anchor="middle" dominant-baseline="central" font-size="14" fill="#fff6e0" font-family="var(--font-sans)" font-weight="500" transform="rotate(-288.0 259.9 180.5)">IX</text>
<text x="237.0" y="149.0" text-anchor="middle" dominant-baseline="central" font-size="14" fill="#fff6e0" font-family="var(--font-sans)" font-weight="500" transform="rotate(-324.0 237.0 149.0)">X</text>
<g id="ego-pivot" style="transform-origin:200px 200px;transition:transform 2.6s cubic-bezier(.15,.7,.15,1)">
<g transform="translate(200 42)">
<circle cx="0" cy="0" r="15.0" fill="#f7dca0" stroke="#7a1620" stroke-width="1.5"/>
<circle cx="0" cy="0" r="5.0" fill="#c23a3a"/>
</g></g>
<g id="ambient-pivot" style="transform-origin:200px 200px;transition:transform 2.2s cubic-bezier(.15,.7,.15,1)">
<g transform="translate(200 91)">
<circle cx="0" cy="0" r="15.0" fill="#0c2b23" stroke="#e8f9f2" stroke-width="1.5"/>
<circle cx="0" cy="0" r="9.3" fill="none" stroke="#e8f9f2" stroke-width="1"/>
<polygon points="0.0,-9.3 8.1,4.6 -8.1,4.6" fill="none" stroke="#e8f9f2" stroke-width="1"/>
</g></g>
<g id="fortuity-pivot" style="transform-origin:200px 200px;transition:transform 3.0s cubic-bezier(.15,.7,.15,1)">
<path d="M200.0 200.0 L207.0 200.0 L216.0 182.0 L200.0 134.0 L184.0 182.0 L193.0 200.0 Z" fill="#fdf6e3" stroke="#8a5a12" stroke-width="1.5"/>
<path d="M200.0 124.0 L210.0 134.0 L200.0 144.0 L190.0 134.0 Z" fill="#ffffff" stroke="#8a5a12" stroke-width="1.5"/>
</g>
<circle cx="200" cy="200" r="16" fill="#0a0e18" stroke="#e8c98a" stroke-width="1.5"/>
<circle cx="200" cy="200" r="4" fill="#f7dca0"/>
<g id="ego-markers"></g>
<g id="ambient-markers"></g>
<g id="fortuity-markers"></g>
<g id="ripple-group">
<circle class="ripple-ring" cx="200" cy="200" r="190" vector-effect="non-scaling-stroke" stroke-width="5"/>
<circle class="ripple-ring" cx="200" cy="200" r="190" vector-effect="non-scaling-stroke" stroke-width="5"/>
<circle class="ripple-ring" cx="200" cy="200" r="190" vector-effect="non-scaling-stroke" stroke-width="5"/>
</g>
<g id="fortuity-crack-group" style="opacity:0">
<path d="M200.0 10.0 L205.6 44.5 L211.2 79.1 L195.2 113.6 L213.7 148.2 L198.9 182.7 L204.3 217.3 L214.1 251.8 L199.8 286.4 L214.8 320.9 L202.1 355.5 L200.0 390.0" fill="none" stroke="#140a04" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M200.0 10.0 L205.6 44.5 L211.2 79.1 L195.2 113.6 L213.7 148.2 L198.9 182.7 L204.3 217.3 L214.1 251.8 L199.8 286.4 L214.8 320.9 L202.1 355.5 L200.0 390.0" fill="none" stroke="#ff6a4a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>
</g>
<g id="grand-crack-group" style="opacity:0">
<circle id="flash-burst" cx="200" cy="200" r="190" fill="#fff3d6" opacity="0"/>
<path d="M200.0 10.0 L205.6 44.5 L211.2 79.1 L195.2 113.6 L213.7 148.2 L198.9 182.7 L204.3 217.3 L214.1 251.8 L199.8 286.4 L214.8 320.9 L202.1 355.5 L200.0 390.0" fill="none" stroke="#0a0602" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M80.0 90.0 L111.2 109.5 L129.8 142.7 L156.5 167.1 L180.1 195.0 L219.3 205.7 L245.1 231.1 L273.3 253.8 L298.5 279.9 L320.0 310.0" fill="none" stroke="#0a0602" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M200.0 10.0 L205.6 44.5 L211.2 79.1 L195.2 113.6 L213.7 148.2 L198.9 182.7 L204.3 217.3 L214.1 251.8 L199.8 286.4 L214.8 320.9 L202.1 355.5 L200.0 390.0" fill="none" stroke="#ff5a3a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>
<path d="M80.0 90.0 L111.2 109.5 L129.8 142.7 L156.5 167.1 L180.1 195.0 L219.3 205.7 L245.1 231.1 L273.3 253.8 L298.5 279.9 L320.0 310.0" fill="none" stroke="#ff5a3a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>
</g>
<circle id="drag-zone" cx="200" cy="200" r="196" fill="transparent" style="cursor:grab;touch-action:none" pointer-events="all"/>
</svg>
</div>
<div style="display:flex;flex-direction:column;gap:10px;margin-top:1rem">
<div class="row" id="row-ego">
<span class="badge a">Advantage</span><span class="badge d">Disadvantage</span>
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
<div style="display:flex;align-items:center;gap:10px">
<span style="width:14px;height:14px;border-radius:50%;background:#c23a3a;display:inline-block"></span>
<div><p style="margin:0;font-size:14px;font-weight:500">Ego dice</p><p style="margin:0;font-size:12px;color:var(--text-secondary)" id="ego-result">ยังไม่ได้ทอย</p></div>
</div>
<div id="ego-chips" style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;max-width:240px"></div>
</div>
<div style="display:flex;justify-content:flex-end"><div class="seg" id="ego-seg"></div></div>
</div>
<div class="row" id="row-ambient">
<span class="badge a">Advantage</span><span class="badge d">Disadvantage</span>
<div style="display:flex;align-items:center;justify-content:space-between">
<div style="display:flex;align-items:center;gap:10px">
<span style="width:14px;height:14px;border-radius:50%;background:#4fb99f;display:inline-block"></span>
<div><p style="margin:0;font-size:14px;font-weight:500">Ambient dice</p><p style="margin:0;font-size:12px;color:var(--text-secondary)" id="ambient-result">ยังไม่ได้ทอย</p></div>
</div>
<div class="seg" id="ambient-seg"></div>
</div>
</div>
<div class="row" id="row-fortuity">
<span class="badge a">Advantage</span><span class="badge d">Disadvantage</span>
<div style="display:flex;align-items:center;justify-content:space-between">
<div style="display:flex;align-items:center;gap:10px">
<span style="width:14px;height:14px;border-radius:50%;background:#d9a441;display:inline-block"></span>
<div><p style="margin:0;font-size:14px;font-weight:500">Fortuity dice</p><p style="margin:0;font-size:12px;color:var(--text-secondary)" id="fortuity-result">ยังไม่ได้ทอย</p></div>
</div>
<div class="seg" id="fortuity-seg"></div>
</div>
</div>
<button id="rollBtn" style="padding:10px 0;font-weight:500;font-size:14px;width:100%">ทอยลูกเต๋าทั้งสามวง (สุ่ม)</button>
</div>
</div>
`;

const WIDGET_JS = `
(function(){
function romanize(n){var vals=[[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]];var out="";for(var i=0;i<vals.length;i++){while(n>=vals[i][0]){out+=vals[i][1];n-=vals[i][0];}}return out;}
function wait(ms){return new Promise(function(res){setTimeout(res,ms);});}
function specialLabel(ego,amb,fort){
  if(ego===amb&&amb===fort){
    if(ego===1)return 'สามวงตรงกันที่ 1 — หายนะครั้งใหญ่!';
    if(ego<=8)return 'สามวงตรงกัน ('+ego+') — โชคทอง!';
    return 'สามวงตรงกัน ('+ego+')';
  }
  if(fort===10)return 'Fortuity = 10 — คลื่นน้ำแห่งโชค';
  if(fort===1)return 'Fortuity = 1 — รอยร้าวอาถรรพ์';
  return '';
}
function emitRoll(ego,amb,fort,manual){
  window.dispatchEvent(new CustomEvent('wiwon-dice',{detail:{ego:ego,ambient:amb,fortuity:fort,egoFaces:state.egoFaces,egoMode:state.egoMode,ambientMode:state.ambientMode,fortuityMode:state.fortuityMode,special:specialLabel(ego,amb,fort),manual:!!manual}}));
}
var state={egoFaces:20,egoMode:"normal",ambientMode:"normal",fortuityMode:"normal",egoTurn:0,ambientTurn:0,fortuityTurn:0,topOrbit:0,topSpin:0,bottomOrbit:0,bottomSpin:0};
var MARKER_R={ego:133,ambient:85,fortuity:38};
var MARKER_THEME={ego:{bg:"#3a1414",border:"#e05a5a",text:"#ffe3e3"},ambient:{bg:"#0c2b23",border:"#4fb99f",text:"#d8f2e9"},fortuity:{bg:"#3a2a08",border:"#f0c76a",text:"#fff3d6"}};
var DIM_THEME={bg:"#262626",border:"#8a8a8a",text:"#cfcfcf"};
function renderEgoRing(faces){var g=document.getElementById("ego-numerals");var count=faces;var fontSize=count<=6?23:count<=10?19:count<=14?16:13;var html="";for(var i=0;i<count;i++){var deg=-1*(360/count)*i;var rad=(deg*Math.PI/180)-Math.PI/2;var x=200+158*Math.cos(rad);var y=200+158*Math.sin(rad);html+='<text x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" text-anchor="middle" dominant-baseline="central" font-size="'+fontSize+'" fill="#f7dca0" font-family="var(--font-sans)" font-weight="500" transform="rotate('+deg.toFixed(1)+' '+x.toFixed(1)+' '+y.toFixed(1)+')">'+romanize(i+1)+'</text>';}g.innerHTML=html;}
function buildChips(){var wrap=document.getElementById("ego-chips");var faces=[2,4,6,8,10,12,20];wrap.innerHTML="";faces.forEach(function(f){var b=document.createElement("button");b.className="chip"+(f===state.egoFaces?" on":"");b.textContent="d"+f;b.onclick=function(){state.egoFaces=f;renderEgoRing(f);state.egoTurn=0;clearMarkers("ego");document.getElementById("ego-pivot").style.transition="transform .5s ease-out";document.getElementById("ego-pivot").style.transform="rotate(0deg)";document.getElementById("ego-result").textContent="เปลี่ยนเป็น d"+f+" แล้ว ยังไม่ได้ทอย";buildChips();};wrap.appendChild(b);});}
function updateRingVisual(ringName,mode){document.getElementById(ringName+"-adv-glow").classList.toggle("show",mode==="adv");document.getElementById(ringName+"-dis-glow").classList.toggle("show",mode==="dis");}
function buildSeg(id,key){var wrap=document.getElementById(id);wrap.innerHTML="";[["dis","Dis","on-d"],["normal","Normal",""],["adv","Adv","on-a"]].forEach(function(opt){var b=document.createElement("button");var current=state[key];b.textContent=opt[1];if(current===opt[0]&&opt[2])b.className=opt[2];b.onclick=function(){state[key]=opt[0];var ringName=key.replace("Mode","");var row=document.getElementById("row-"+ringName);row.classList.remove("adv","dis");if(opt[0]==="adv")row.classList.add("adv");if(opt[0]==="dis")row.classList.add("dis");updateRingVisual(ringName,opt[0]);buildSeg(id,key);};wrap.appendChild(b);});}
function clearMarkers(ringName){var g=document.getElementById(ringName+"-markers");if(g)g.innerHTML="";}
function badgeSVG(x,y,r,val,theme,fontSize){return '<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="'+r+'" fill="'+theme.bg+'" stroke="'+theme.border+'" stroke-width="2"/>'+'<text x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" text-anchor="middle" dominant-baseline="central" font-size="'+fontSize+'" fill="'+theme.text+'" font-family="var(--font-sans)" font-weight="600">'+val+'</text>';}
function showRollMarkers(ringName,count,dir,mode,r1,r2,keep){var R=MARKER_R[ringName];var theme=MARKER_THEME[ringName];function posFor(v){var deg=dir*(360/count)*(v-1);var rad=deg*Math.PI/180-Math.PI/2;return{x:200+R*Math.cos(rad),y:200+R*Math.sin(rad)};}var g=document.getElementById(ringName+"-markers");var html;if(mode==="normal"){var pos=posFor(keep);html=badgeSVG(pos.x,pos.y,13,keep,theme,13);}else{var keptVal=keep,otherVal=(keep===r1)?r2:r1;var keptPos=posFor(keptVal),otherPos=posFor(otherVal);html=''+'<circle cx="'+otherPos.x.toFixed(1)+'" cy="'+otherPos.y.toFixed(1)+'" r="10" fill="'+DIM_THEME.bg+'" stroke="'+DIM_THEME.border+'" stroke-width="1.5" opacity="0.7"/>'+'<text x="'+otherPos.x.toFixed(1)+'" y="'+otherPos.y.toFixed(1)+'" text-anchor="middle" dominant-baseline="central" font-size="11" fill="'+DIM_THEME.text+'" font-family="var(--font-sans)" opacity="0.85">'+otherVal+'</text>'+'<line x1="'+(otherPos.x-7).toFixed(1)+'" y1="'+(otherPos.y-7).toFixed(1)+'" x2="'+(otherPos.x+7).toFixed(1)+'" y2="'+(otherPos.y+7).toFixed(1)+'" stroke="'+DIM_THEME.border+'" stroke-width="1.5"/>'+badgeSVG(keptPos.x,keptPos.y,13,keptVal,theme,13);}g.innerHTML='<g style="opacity:0;transition:opacity .5s" id="'+ringName+'-marker-fade">'+html+'</g>';requestAnimationFrame(function(){var el=document.getElementById(ringName+"-marker-fade");if(el)el.style.opacity="1";});}
function formatResult(res,mode,label){var text=res.detail?(mode==="adv"?"Advantage":"Disadvantage")+": "+res.detail[0]+" กับ "+res.detail[1]+" → ใช้ "+res.value:"ผลทอย "+res.value;return text+" "+label;}
async function rollRingAnimated(ringName,pivotEl,count,dir,mode,faces,baseMs){function one(){return 1+Math.floor(Math.random()*faces);}function targetFor(v){return dir*(360/count)*(v-1);}function setRot(deg,ms,ease){pivotEl.style.transition="transform "+(ms/1000)+"s "+ease;pivotEl.style.transform="rotate("+deg+"deg)";}if(mode==="normal"){var v=one();var t=targetFor(v);state[ringName+"Turn"]=Math.floor(state[ringName+"Turn"]/360)*360+dir*1440+t;setRot(state[ringName+"Turn"],baseMs,"cubic-bezier(.15,.7,.15,1)");await wait(baseMs+80);showRollMarkers(ringName,count,dir,"normal",null,null,v);return{value:v,detail:null};}var r1=one(),r2=one();var keep=mode==="adv"?Math.max(r1,r2):Math.min(r1,r2);var t2=targetFor(keep);state[ringName+"Turn"]=Math.floor(state[ringName+"Turn"]/360)*360+dir*1800+t2;setRot(state[ringName+"Turn"],baseMs+400,"cubic-bezier(.15,.7,.15,1)");await wait(baseMs+480);showRollMarkers(ringName,count,dir,mode,r1,r2,keep);return{value:keep,detail:[r1,r2]};}
function resetEffects(){var dialEl=document.getElementById("dial");dialEl.classList.remove("shake");["fortuity-crack-group","grand-crack-group"].forEach(function(id){var g=document.getElementById(id);g.style.transition="none";g.classList.remove("crack-show");g.style.opacity="0";});var f=document.getElementById("flash-burst");f.classList.remove("flash-anim");f.style.opacity="0";document.querySelectorAll("#ripple-group .ripple-ring").forEach(function(r){r.classList.remove("go","big","gold");r.style.animationDelay="0s";});}
function showCrack(groupId,holdMs){var g=document.getElementById(groupId);g.style.transition="none";g.style.opacity="0";g.classList.remove("crack-show");void g.offsetWidth;g.classList.add("crack-show");setTimeout(function(){g.style.transition="opacity 1.2s ease-in";g.style.opacity="0";},holdMs);}
function showFlash(){var f=document.getElementById("flash-burst");f.classList.remove("flash-anim");f.style.opacity="0";void f.offsetWidth;f.classList.add("flash-anim");}
function triggerRipple(big){var rings=document.querySelectorAll("#ripple-group .ripple-ring");rings.forEach(function(r,i){r.classList.remove("go","big","gold");void r.offsetWidth;r.style.animationDelay=(i*0.18)+"s";if(big)r.classList.add("big","gold");r.classList.add("go");});}
function checkSpecialEffects(results){var ego=results[0].value,amb=results[1].value,fort=results[2].value;var dialEl=document.getElementById("dial");if(ego===amb&&amb===fort){if(ego===1){dialEl.classList.remove("shake");void dialEl.offsetWidth;dialEl.classList.add("shake");showCrack("grand-crack-group",5000);showFlash();}else if(ego<=8){triggerRipple(true);}}else{if(fort===10)triggerRipple(false);if(fort===1)showCrack("fortuity-crack-group",3500);}}
async function rollAll(){var btn=document.getElementById("rollBtn");btn.disabled=true;resetEffects();clearMarkers("ego");clearMarkers("ambient");clearMarkers("fortuity");state.topOrbit+=720;state.topSpin+=1080;state.bottomOrbit-=720;state.bottomSpin-=1080;document.getElementById("deco-top-orbit").style.transform="rotate("+state.topOrbit+"deg)";document.getElementById("deco-top").style.transform="rotate("+state.topSpin+"deg)";document.getElementById("deco-bottom-orbit").style.transform="rotate("+state.bottomOrbit+"deg)";document.getElementById("deco-bottom").style.transform="rotate("+state.bottomSpin+"deg)";var egoPivotEl=document.getElementById("ego-pivot"),ambientPivotEl=document.getElementById("ambient-pivot"),fortuityPivotEl=document.getElementById("fortuity-pivot");var results=await Promise.all([rollRingAnimated("ego",egoPivotEl,state.egoFaces,-1,state.egoMode,state.egoFaces,2600),rollRingAnimated("ambient",ambientPivotEl,8,1,state.ambientMode,8,2200),rollRingAnimated("fortuity",fortuityPivotEl,10,-1,state.fortuityMode,10,3000)]);document.getElementById("ego-result").textContent=formatResult(results[0],state.egoMode,"(d"+state.egoFaces+")");document.getElementById("ambient-result").textContent=formatResult(results[1],state.ambientMode,"(d8)");document.getElementById("fortuity-result").textContent=formatResult(results[2],state.fortuityMode,"(d10)");checkSpecialEffects(results);emitRoll(results[0].value,results[1].value,results[2].value,false);btn.disabled=false;}
renderEgoRing(20);buildChips();buildSeg("ego-seg","egoMode");buildSeg("ambient-seg","ambientMode");buildSeg("fortuity-seg","fortuityMode");document.getElementById("rollBtn").addEventListener("click",rollAll);window.__wiwonRoll=rollAll;
var svgEl=document.getElementById("dial");var dragZone=document.getElementById("drag-zone");var egoPivotEl2=document.getElementById("ego-pivot"),ambientPivotEl2=document.getElementById("ambient-pivot"),fortuityPivotEl2=document.getElementById("fortuity-pivot");var dragging=false,lastAngle=0,dragEgoStart=0,dragAmbientStart=0,dragFortuityStart=0;
function angleFromEvent(evt){var pt=svgEl.createSVGPoint();pt.x=evt.clientX;pt.y=evt.clientY;var loc=pt.matrixTransform(svgEl.getScreenCTM().inverse());var dx=loc.x-200,dy=loc.y-200;return Math.atan2(dx,-dy)*180/Math.PI;}
function snapRing(rawDeg,count,dir){var step=360/count;var idx=Math.round(rawDeg/(dir*step));var snappedDeg=dir*step*idx;var value=((idx%count)+count)%count+1;return{snappedDeg:snappedDeg,value:value};}
dragZone.addEventListener("pointerdown",function(evt){dragging=true;dragZone.setPointerCapture(evt.pointerId);dragZone.style.cursor="grabbing";lastAngle=angleFromEvent(evt);dragEgoStart=state.egoTurn;dragAmbientStart=state.ambientTurn;dragFortuityStart=state.fortuityTurn;resetEffects();clearMarkers("ego");clearMarkers("ambient");clearMarkers("fortuity");[egoPivotEl2,ambientPivotEl2,fortuityPivotEl2].forEach(function(p){p.style.transition="none";});});
dragZone.addEventListener("pointermove",function(evt){if(!dragging)return;var ang=angleFromEvent(evt);var diff=ang-lastAngle;if(diff>180)diff-=360;if(diff<-180)diff+=360;lastAngle=ang;dragEgoStart+=diff;dragAmbientStart+=diff;dragFortuityStart+=diff;state.egoTurn=dragEgoStart;state.ambientTurn=dragAmbientStart;state.fortuityTurn=dragFortuityStart;egoPivotEl2.style.transform="rotate("+state.egoTurn+"deg)";ambientPivotEl2.style.transform="rotate("+state.ambientTurn+"deg)";fortuityPivotEl2.style.transform="rotate("+state.fortuityTurn+"deg)";});
function endDrag(){if(!dragging)return;dragging=false;dragZone.style.cursor="grab";[egoPivotEl2,ambientPivotEl2,fortuityPivotEl2].forEach(function(p){p.style.transition="transform .5s cubic-bezier(.17,.67,.2,1)";});var egoSnap=snapRing(state.egoTurn,state.egoFaces,-1);var ambientSnap=snapRing(state.ambientTurn,8,1);var fortuitySnap=snapRing(state.fortuityTurn,10,-1);state.egoTurn=egoSnap.snappedDeg;state.ambientTurn=ambientSnap.snappedDeg;state.fortuityTurn=fortuitySnap.snappedDeg;egoPivotEl2.style.transform="rotate("+state.egoTurn+"deg)";ambientPivotEl2.style.transform="rotate("+state.ambientTurn+"deg)";fortuityPivotEl2.style.transform="rotate("+state.fortuityTurn+"deg)";document.getElementById("ego-result").textContent="ตั้งค่าด้วยมือ: "+egoSnap.value+" (d"+state.egoFaces+")";document.getElementById("ambient-result").textContent="ตั้งค่าด้วยมือ: "+ambientSnap.value+" (d8)";document.getElementById("fortuity-result").textContent="ตั้งค่าด้วยมือ: "+fortuitySnap.value+" (d10)";showRollMarkers("ego",state.egoFaces,-1,"normal",null,null,egoSnap.value);showRollMarkers("ambient",8,1,"normal",null,null,ambientSnap.value);showRollMarkers("fortuity",10,-1,"normal",null,null,fortuitySnap.value);checkSpecialEffects([{value:egoSnap.value},{value:ambientSnap.value},{value:fortuitySnap.value}]);emitRoll(egoSnap.value,ambientSnap.value,fortuitySnap.value,true);}
dragZone.addEventListener("pointerup",endDrag);dragZone.addEventListener("pointercancel",endDrag);
})();
`;

interface LogEntry {
  id: number;
  ego: number;
  ambient: number;
  fortuity: number;
  egoFaces: number;
  egoMode: string;
  ambientMode: string;
  fortuityMode: string;
  special: string;
  manual: boolean;
}

export function DiceRoller({ open, onClose }: { open: boolean; onClose: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [dropped, setDropped] = useState(false);

  useEffect(() => {
    if (!open) return;
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = WIDGET_HTML;
    const script = document.createElement('script');
    script.textContent = WIDGET_JS;
    host.appendChild(script);

    const onDice = (e: Event) => {
      const d = (e as CustomEvent).detail as Omit<LogEntry, 'id'>;
      setLog((prev) => [{ id: ++seqRef.current, ...d }, ...prev].slice(0, 40));
    };
    window.addEventListener('wiwon-dice', onDice);

    const raf = requestAnimationFrame(() => setDropped(true));
    // after the wheel finishes dropping in, spin it once automatically
    const spinTimer = window.setTimeout(() => {
      (window as unknown as { __wiwonRoll?: () => void }).__wiwonRoll?.();
    }, 1000);

    return () => {
      window.removeEventListener('wiwon-dice', onDice);
      cancelAnimationFrame(raf);
      clearTimeout(spinTimer);
      host.innerHTML = '';
      setDropped(false);
    };
  }, [open]);

  if (!open) return null;

  const modeTag = (m: string) => (m === 'adv' ? ' ▲' : m === 'dis' ? ' ▼' : '');

  return createPortal(
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(5,7,12,.74)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 760, width: '100%', transform: dropped ? 'translateY(0)' : 'translateY(-130vh)', transition: 'transform .85s cubic-bezier(.18,.85,.25,1)' }}
      >
        <div style={{ position: 'relative' }}>
          <div ref={hostRef} style={{ width: 360, maxWidth: '92vw' }} />
        </div>

        <div style={{ flex: '1 1 240px', minWidth: 240, maxWidth: 320, background: '#0f1118', border: '1px solid #23232a', borderRadius: 16, padding: '16px 18px', color: '#eee', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>🎲 บันทึกการทอย (LOG)</h3>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#a8a8a0', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
          {log.length > 0 && (
            <button onClick={() => setLog([])} style={{ background: 'none', border: '1px solid #2c2c34', color: '#a8a8a0', borderRadius: 7, fontSize: 11, padding: '3px 10px', cursor: 'pointer', marginBottom: 8 }}>ล้าง LOG</button>
          )}
          <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {log.length === 0 ? (
              <div style={{ fontSize: 13, color: '#7a7a72', padding: '12px 0' }}>ยังไม่มีการทอย — กดปุ่มหรือลากวงล้อ</div>
            ) : (
              log.map((e) => (
                <div key={e.id} style={{ borderBottom: '1px solid #1e1e25', paddingBottom: 8 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12.5, alignItems: 'center' }}>
                    <span style={{ color: '#e05a5a', fontWeight: 700 }}>Ego {e.ego}<span style={{ color: '#7a7a72', fontWeight: 400 }}> d{e.egoFaces}{modeTag(e.egoMode)}</span></span>
                    <span style={{ color: '#4fb99f', fontWeight: 700 }}>Amb {e.ambient}<span style={{ color: '#7a7a72', fontWeight: 400 }}>{modeTag(e.ambientMode)}</span></span>
                    <span style={{ color: '#f0c76a', fontWeight: 700 }}>For {e.fortuity}<span style={{ color: '#7a7a72', fontWeight: 400 }}>{modeTag(e.fortuityMode)}</span></span>
                    {e.manual && <span style={{ fontSize: 10, color: '#7a7a72' }}>(มือ)</span>}
                  </div>
                  {e.special && <div style={{ fontSize: 11.5, color: '#f7dca0', marginTop: 3 }}>✦ {e.special}</div>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
