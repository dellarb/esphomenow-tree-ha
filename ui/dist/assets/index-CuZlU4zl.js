(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))s(n);new MutationObserver(n=>{for(const r of n)if(r.type==="childList")for(const o of r.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&s(o)}).observe(document,{childList:!0,subtree:!0});function t(n){const r={};return n.integrity&&(r.integrity=n.integrity),n.referrerPolicy&&(r.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?r.credentials="include":n.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function s(n){if(n.ep)return;n.ep=!0;const r=t(n);fetch(n.href,r)}})();/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Fn=globalThis,Ta=Fn.ShadowRoot&&(Fn.ShadyCSS===void 0||Fn.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,Da=Symbol(),Ol=new WeakMap;let Lc=class{constructor(e,t,s){if(this._$cssResult$=!0,s!==Da)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=t}get styleSheet(){let e=this.o;const t=this.t;if(Ta&&e===void 0){const s=t!==void 0&&t.length===1;s&&(e=Ol.get(t)),e===void 0&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),s&&Ol.set(t,e))}return e}toString(){return this.cssText}};const qu=i=>new Lc(typeof i=="string"?i:i+"",void 0,Da),me=(i,...e)=>{const t=i.length===1?i[0]:e.reduce((s,n,r)=>s+(o=>{if(o._$cssResult$===!0)return o.cssText;if(typeof o=="number")return o;throw Error("Value passed to 'css' function must be a 'css' function result: "+o+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(n)+i[r+1],i[0]);return new Lc(t,i,Da)},Qu=(i,e)=>{if(Ta)i.adoptedStyleSheets=e.map(t=>t instanceof CSSStyleSheet?t:t.styleSheet);else for(const t of e){const s=document.createElement("style"),n=Fn.litNonce;n!==void 0&&s.setAttribute("nonce",n),s.textContent=t.cssText,i.appendChild(s)}},Al=Ta?i=>i:i=>i instanceof CSSStyleSheet?(e=>{let t="";for(const s of e.cssRules)t+=s.cssText;return qu(t)})(i):i;/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const{is:Vu,defineProperty:Uu,getOwnPropertyDescriptor:ju,getOwnPropertyNames:Xu,getOwnPropertySymbols:Ju,getPrototypeOf:Ku}=Object,Xt=globalThis,$l=Xt.trustedTypes,Gu=$l?$l.emptyScript:"",Vr=Xt.reactiveElementPolyfillSupport,Cs=(i,e)=>i,Gn={toAttribute(i,e){switch(e){case Boolean:i=i?Gu:null;break;case Object:case Array:i=i==null?i:JSON.stringify(i)}return i},fromAttribute(i,e){let t=i;switch(e){case Boolean:t=i!==null;break;case Number:t=i===null?null:Number(i);break;case Object:case Array:try{t=JSON.parse(i)}catch{t=null}}return t}},Ea=(i,e)=>!Vu(i,e),Pl={attribute:!0,type:String,converter:Gn,reflect:!1,useDefault:!1,hasChanged:Ea};Symbol.metadata??(Symbol.metadata=Symbol("metadata")),Xt.litPropertyMetadata??(Xt.litPropertyMetadata=new WeakMap);let Ni=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??(this.l=[])).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,t=Pl){if(t.state&&(t.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((t=Object.create(t)).wrapped=!0),this.elementProperties.set(e,t),!t.noAccessor){const s=Symbol(),n=this.getPropertyDescriptor(e,s,t);n!==void 0&&Uu(this.prototype,e,n)}}static getPropertyDescriptor(e,t,s){const{get:n,set:r}=ju(this.prototype,e)??{get(){return this[t]},set(o){this[t]=o}};return{get:n,set(o){const a=n==null?void 0:n.call(this);r==null||r.call(this,o),this.requestUpdate(e,a,s)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??Pl}static _$Ei(){if(this.hasOwnProperty(Cs("elementProperties")))return;const e=Ku(this);e.finalize(),e.l!==void 0&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(Cs("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(Cs("properties"))){const t=this.properties,s=[...Xu(t),...Ju(t)];for(const n of s)this.createProperty(n,t[n])}const e=this[Symbol.metadata];if(e!==null){const t=litPropertyMetadata.get(e);if(t!==void 0)for(const[s,n]of t)this.elementProperties.set(s,n)}this._$Eh=new Map;for(const[t,s]of this.elementProperties){const n=this._$Eu(t,s);n!==void 0&&this._$Eh.set(n,t)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){const t=[];if(Array.isArray(e)){const s=new Set(e.flat(1/0).reverse());for(const n of s)t.unshift(Al(n))}else e!==void 0&&t.push(Al(e));return t}static _$Eu(e,t){const s=t.attribute;return s===!1?void 0:typeof s=="string"?s:typeof e=="string"?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){var e;this._$ES=new Promise(t=>this.enableUpdating=t),this._$AL=new Map,this._$E_(),this.requestUpdate(),(e=this.constructor.l)==null||e.forEach(t=>t(this))}addController(e){var t;(this._$EO??(this._$EO=new Set)).add(e),this.renderRoot!==void 0&&this.isConnected&&((t=e.hostConnected)==null||t.call(e))}removeController(e){var t;(t=this._$EO)==null||t.delete(e)}_$E_(){const e=new Map,t=this.constructor.elementProperties;for(const s of t.keys())this.hasOwnProperty(s)&&(e.set(s,this[s]),delete this[s]);e.size>0&&(this._$Ep=e)}createRenderRoot(){const e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return Qu(e,this.constructor.elementStyles),e}connectedCallback(){var e;this.renderRoot??(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),(e=this._$EO)==null||e.forEach(t=>{var s;return(s=t.hostConnected)==null?void 0:s.call(t)})}enableUpdating(e){}disconnectedCallback(){var e;(e=this._$EO)==null||e.forEach(t=>{var s;return(s=t.hostDisconnected)==null?void 0:s.call(t)})}attributeChangedCallback(e,t,s){this._$AK(e,s)}_$ET(e,t){var r;const s=this.constructor.elementProperties.get(e),n=this.constructor._$Eu(e,s);if(n!==void 0&&s.reflect===!0){const o=(((r=s.converter)==null?void 0:r.toAttribute)!==void 0?s.converter:Gn).toAttribute(t,s.type);this._$Em=e,o==null?this.removeAttribute(n):this.setAttribute(n,o),this._$Em=null}}_$AK(e,t){var r,o;const s=this.constructor,n=s._$Eh.get(e);if(n!==void 0&&this._$Em!==n){const a=s.getPropertyOptions(n),l=typeof a.converter=="function"?{fromAttribute:a.converter}:((r=a.converter)==null?void 0:r.fromAttribute)!==void 0?a.converter:Gn;this._$Em=n;const h=l.fromAttribute(t,a.type);this[n]=h??((o=this._$Ej)==null?void 0:o.get(n))??h,this._$Em=null}}requestUpdate(e,t,s,n=!1,r){var o;if(e!==void 0){const a=this.constructor;if(n===!1&&(r=this[e]),s??(s=a.getPropertyOptions(e)),!((s.hasChanged??Ea)(r,t)||s.useDefault&&s.reflect&&r===((o=this._$Ej)==null?void 0:o.get(e))&&!this.hasAttribute(a._$Eu(e,s))))return;this.C(e,t,s)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(e,t,{useDefault:s,reflect:n,wrapped:r},o){s&&!(this._$Ej??(this._$Ej=new Map)).has(e)&&(this._$Ej.set(e,o??t??this[e]),r!==!0||o!==void 0)||(this._$AL.has(e)||(this.hasUpdated||s||(t=void 0),this._$AL.set(e,t)),n===!0&&this._$Em!==e&&(this._$Eq??(this._$Eq=new Set)).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(t){Promise.reject(t)}const e=this.scheduleUpdate();return e!=null&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){var s;if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??(this.renderRoot=this.createRenderRoot()),this._$Ep){for(const[r,o]of this._$Ep)this[r]=o;this._$Ep=void 0}const n=this.constructor.elementProperties;if(n.size>0)for(const[r,o]of n){const{wrapped:a}=o,l=this[r];a!==!0||this._$AL.has(r)||l===void 0||this.C(r,void 0,o,l)}}let e=!1;const t=this._$AL;try{e=this.shouldUpdate(t),e?(this.willUpdate(t),(s=this._$EO)==null||s.forEach(n=>{var r;return(r=n.hostUpdate)==null?void 0:r.call(n)}),this.update(t)):this._$EM()}catch(n){throw e=!1,this._$EM(),n}e&&this._$AE(t)}willUpdate(e){}_$AE(e){var t;(t=this._$EO)==null||t.forEach(s=>{var n;return(n=s.hostUpdated)==null?void 0:n.call(s)}),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&(this._$Eq=this._$Eq.forEach(t=>this._$ET(t,this[t]))),this._$EM()}updated(e){}firstUpdated(e){}};Ni.elementStyles=[],Ni.shadowRootOptions={mode:"open"},Ni[Cs("elementProperties")]=new Map,Ni[Cs("finalized")]=new Map,Vr==null||Vr({ReactiveElement:Ni}),(Xt.reactiveElementVersions??(Xt.reactiveElementVersions=[])).push("2.1.2");/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Os=globalThis,Ml=i=>i,Yn=Os.trustedTypes,Tl=Yn?Yn.createPolicy("lit-html",{createHTML:i=>i}):void 0,Ic="$lit$",Qt=`lit$${Math.random().toFixed(9).slice(2)}$`,Nc="?"+Qt,Yu=`<${Nc}>`,Ai=document,Bs=()=>Ai.createComment(""),_s=i=>i===null||typeof i!="object"&&typeof i!="function",Ra=Array.isArray,Zu=i=>Ra(i)||typeof(i==null?void 0:i[Symbol.iterator])=="function",Ur=`[ 	
\f\r]`,gs=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,Dl=/-->/g,El=/>/g,li=RegExp(`>|${Ur}(?:([^\\s"'>=/]+)(${Ur}*=${Ur}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),Rl=/'/g,Bl=/"/g,zc=/^(?:script|style|textarea|title)$/i,ep=i=>(e,...t)=>({_$litType$:i,strings:e,values:t}),g=ep(1),es=Symbol.for("lit-noChange"),y=Symbol.for("lit-nothing"),_l=new WeakMap,pi=Ai.createTreeWalker(Ai,129);function Fc(i,e){if(!Ra(i)||!i.hasOwnProperty("raw"))throw Error("invalid template strings array");return Tl!==void 0?Tl.createHTML(e):e}const tp=(i,e)=>{const t=i.length-1,s=[];let n,r=e===2?"<svg>":e===3?"<math>":"",o=gs;for(let a=0;a<t;a++){const l=i[a];let h,c,d=-1,f=0;for(;f<l.length&&(o.lastIndex=f,c=o.exec(l),c!==null);)f=o.lastIndex,o===gs?c[1]==="!--"?o=Dl:c[1]!==void 0?o=El:c[2]!==void 0?(zc.test(c[2])&&(n=RegExp("</"+c[2],"g")),o=li):c[3]!==void 0&&(o=li):o===li?c[0]===">"?(o=n??gs,d=-1):c[1]===void 0?d=-2:(d=o.lastIndex-c[2].length,h=c[1],o=c[3]===void 0?li:c[3]==='"'?Bl:Rl):o===Bl||o===Rl?o=li:o===Dl||o===El?o=gs:(o=li,n=void 0);const u=o===li&&i[a+1].startsWith("/>")?" ":"";r+=o===gs?l+Yu:d>=0?(s.push(h),l.slice(0,d)+Ic+l.slice(d)+Qt+u):l+Qt+(d===-2?a:u)}return[Fc(i,r+(i[t]||"<?>")+(e===2?"</svg>":e===3?"</math>":"")),s]};class Ls{constructor({strings:e,_$litType$:t},s){let n;this.parts=[];let r=0,o=0;const a=e.length-1,l=this.parts,[h,c]=tp(e,t);if(this.el=Ls.createElement(h,s),pi.currentNode=this.el.content,t===2||t===3){const d=this.el.content.firstChild;d.replaceWith(...d.childNodes)}for(;(n=pi.nextNode())!==null&&l.length<a;){if(n.nodeType===1){if(n.hasAttributes())for(const d of n.getAttributeNames())if(d.endsWith(Ic)){const f=c[o++],u=n.getAttribute(d).split(Qt),p=/([.?@])?(.*)/.exec(f);l.push({type:1,index:r,name:p[2],strings:u,ctor:p[1]==="."?sp:p[1]==="?"?np:p[1]==="@"?rp:Mr}),n.removeAttribute(d)}else d.startsWith(Qt)&&(l.push({type:6,index:r}),n.removeAttribute(d));if(zc.test(n.tagName)){const d=n.textContent.split(Qt),f=d.length-1;if(f>0){n.textContent=Yn?Yn.emptyScript:"";for(let u=0;u<f;u++)n.append(d[u],Bs()),pi.nextNode(),l.push({type:2,index:++r});n.append(d[f],Bs())}}}else if(n.nodeType===8)if(n.data===Nc)l.push({type:2,index:r});else{let d=-1;for(;(d=n.data.indexOf(Qt,d+1))!==-1;)l.push({type:7,index:r}),d+=Qt.length-1}r++}}static createElement(e,t){const s=Ai.createElement("template");return s.innerHTML=e,s}}function ts(i,e,t=i,s){var o,a;if(e===es)return e;let n=s!==void 0?(o=t._$Co)==null?void 0:o[s]:t._$Cl;const r=_s(e)?void 0:e._$litDirective$;return(n==null?void 0:n.constructor)!==r&&((a=n==null?void 0:n._$AO)==null||a.call(n,!1),r===void 0?n=void 0:(n=new r(i),n._$AT(i,t,s)),s!==void 0?(t._$Co??(t._$Co=[]))[s]=n:t._$Cl=n),n!==void 0&&(e=ts(i,n._$AS(i,e.values),n,s)),e}class ip{constructor(e,t){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=t}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){const{el:{content:t},parts:s}=this._$AD,n=((e==null?void 0:e.creationScope)??Ai).importNode(t,!0);pi.currentNode=n;let r=pi.nextNode(),o=0,a=0,l=s[0];for(;l!==void 0;){if(o===l.index){let h;l.type===2?h=new sn(r,r.nextSibling,this,e):l.type===1?h=new l.ctor(r,l.name,l.strings,this,e):l.type===6&&(h=new op(r,this,e)),this._$AV.push(h),l=s[++a]}o!==(l==null?void 0:l.index)&&(r=pi.nextNode(),o++)}return pi.currentNode=Ai,n}p(e){let t=0;for(const s of this._$AV)s!==void 0&&(s.strings!==void 0?(s._$AI(e,s,t),t+=s.strings.length-2):s._$AI(e[t])),t++}}class sn{get _$AU(){var e;return((e=this._$AM)==null?void 0:e._$AU)??this._$Cv}constructor(e,t,s,n){this.type=2,this._$AH=y,this._$AN=void 0,this._$AA=e,this._$AB=t,this._$AM=s,this.options=n,this._$Cv=(n==null?void 0:n.isConnected)??!0}get parentNode(){let e=this._$AA.parentNode;const t=this._$AM;return t!==void 0&&(e==null?void 0:e.nodeType)===11&&(e=t.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,t=this){e=ts(this,e,t),_s(e)?e===y||e==null||e===""?(this._$AH!==y&&this._$AR(),this._$AH=y):e!==this._$AH&&e!==es&&this._(e):e._$litType$!==void 0?this.$(e):e.nodeType!==void 0?this.T(e):Zu(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==y&&_s(this._$AH)?this._$AA.nextSibling.data=e:this.T(Ai.createTextNode(e)),this._$AH=e}$(e){var r;const{values:t,_$litType$:s}=e,n=typeof s=="number"?this._$AC(e):(s.el===void 0&&(s.el=Ls.createElement(Fc(s.h,s.h[0]),this.options)),s);if(((r=this._$AH)==null?void 0:r._$AD)===n)this._$AH.p(t);else{const o=new ip(n,this),a=o.u(this.options);o.p(t),this.T(a),this._$AH=o}}_$AC(e){let t=_l.get(e.strings);return t===void 0&&_l.set(e.strings,t=new Ls(e)),t}k(e){Ra(this._$AH)||(this._$AH=[],this._$AR());const t=this._$AH;let s,n=0;for(const r of e)n===t.length?t.push(s=new sn(this.O(Bs()),this.O(Bs()),this,this.options)):s=t[n],s._$AI(r),n++;n<t.length&&(this._$AR(s&&s._$AB.nextSibling,n),t.length=n)}_$AR(e=this._$AA.nextSibling,t){var s;for((s=this._$AP)==null?void 0:s.call(this,!1,!0,t);e!==this._$AB;){const n=Ml(e).nextSibling;Ml(e).remove(),e=n}}setConnected(e){var t;this._$AM===void 0&&(this._$Cv=e,(t=this._$AP)==null||t.call(this,e))}}class Mr{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,t,s,n,r){this.type=1,this._$AH=y,this._$AN=void 0,this.element=e,this.name=t,this._$AM=n,this.options=r,s.length>2||s[0]!==""||s[1]!==""?(this._$AH=Array(s.length-1).fill(new String),this.strings=s):this._$AH=y}_$AI(e,t=this,s,n){const r=this.strings;let o=!1;if(r===void 0)e=ts(this,e,t,0),o=!_s(e)||e!==this._$AH&&e!==es,o&&(this._$AH=e);else{const a=e;let l,h;for(e=r[0],l=0;l<r.length-1;l++)h=ts(this,a[s+l],t,l),h===es&&(h=this._$AH[l]),o||(o=!_s(h)||h!==this._$AH[l]),h===y?e=y:e!==y&&(e+=(h??"")+r[l+1]),this._$AH[l]=h}o&&!n&&this.j(e)}j(e){e===y?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}}class sp extends Mr{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===y?void 0:e}}class np extends Mr{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==y)}}class rp extends Mr{constructor(e,t,s,n,r){super(e,t,s,n,r),this.type=5}_$AI(e,t=this){if((e=ts(this,e,t,0)??y)===es)return;const s=this._$AH,n=e===y&&s!==y||e.capture!==s.capture||e.once!==s.once||e.passive!==s.passive,r=e!==y&&(s===y||n);n&&this.element.removeEventListener(this.name,this,s),r&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){var t;typeof this._$AH=="function"?this._$AH.call(((t=this.options)==null?void 0:t.host)??this.element,e):this._$AH.handleEvent(e)}}class op{constructor(e,t,s){this.element=e,this.type=6,this._$AN=void 0,this._$AM=t,this.options=s}get _$AU(){return this._$AM._$AU}_$AI(e){ts(this,e)}}const jr=Os.litHtmlPolyfillSupport;jr==null||jr(Ls,sn),(Os.litHtmlVersions??(Os.litHtmlVersions=[])).push("3.3.2");const ap=(i,e,t)=>{const s=(t==null?void 0:t.renderBefore)??e;let n=s._$litPart$;if(n===void 0){const r=(t==null?void 0:t.renderBefore)??null;s._$litPart$=n=new sn(e.insertBefore(Bs(),r),r,void 0,t??{})}return n._$AI(i),n};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const vi=globalThis;let ne=class extends Ni{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){var t;const e=super.createRenderRoot();return(t=this.renderOptions).renderBefore??(t.renderBefore=e.firstChild),e}update(e){const t=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=ap(t,this.renderRoot,this.renderOptions)}connectedCallback(){var e;super.connectedCallback(),(e=this._$Do)==null||e.setConnected(!0)}disconnectedCallback(){var e;super.disconnectedCallback(),(e=this._$Do)==null||e.setConnected(!1)}render(){return es}};var _c;ne._$litElement$=!0,ne.finalized=!0,(_c=vi.litElementHydrateSupport)==null||_c.call(vi,{LitElement:ne});const Xr=vi.litElementPolyfillSupport;Xr==null||Xr({LitElement:ne});(vi.litElementVersions??(vi.litElementVersions=[])).push("4.2.2");/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const be=i=>(e,t)=>{t!==void 0?t.addInitializer(()=>{customElements.define(i,e)}):customElements.define(i,e)};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const lp={attribute:!0,type:String,converter:Gn,reflect:!1,hasChanged:Ea},hp=(i=lp,e,t)=>{const{kind:s,metadata:n}=t;let r=globalThis.litPropertyMetadata.get(n);if(r===void 0&&globalThis.litPropertyMetadata.set(n,r=new Map),s==="setter"&&((i=Object.create(i)).wrapped=!0),r.set(t.name,i),s==="accessor"){const{name:o}=t;return{set(a){const l=e.get.call(this);e.set.call(this,a),this.requestUpdate(o,l,i,!0,a)},init(a){return a!==void 0&&this.C(o,void 0,i,a),a}}}if(s==="setter"){const{name:o}=t;return function(a){const l=this[o];e.call(this,a),this.requestUpdate(o,l,i,!0,a)}}throw Error("Unsupported decorator location: "+s)};function Q(i){return(e,t)=>typeof t=="object"?hp(i,e,t):((s,n,r)=>{const o=n.hasOwnProperty(r);return n.constructor.createProperty(r,s),o?Object.getOwnPropertyDescriptor(n,r):void 0})(i,e,t)}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function w(i){return Q({...i,state:!0,attribute:!1})}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const cp=(i,e,t)=>(t.configurable=!0,t.enumerable=!0,Reflect.decorate&&typeof e!="object"&&Object.defineProperty(i,e,t),t);/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function dp(i,e){return(t,s,n)=>{const r=o=>{var a;return((a=o.renderRoot)==null?void 0:a.querySelector(i))??null};return cp(t,s,{get(){return r(this)}})}}const fp=(()=>{const i=document.querySelector('meta[name="x-ingress-path"]');return i&&i.getAttribute("content")?i.getAttribute("content").replace(/\/+$/,""):""})(),up=15e3,pp=3e4;let gn=null,Jr=null;function gi(i){const e=fp||"";return i.startsWith("/")?e+i:e+"/"+i}function gp(i,e){if(!i)return null;if(e!=null&&e.includes("application/json"))return JSON.parse(i);try{return JSON.parse(i)}catch{return i}}async function B(i,e){const t=new AbortController,s=setTimeout(()=>t.abort("timeout"),up);try{const n=await fetch(gi(i),{...e,signal:t.signal,headers:(e==null?void 0:e.body)instanceof FormData?e.headers:{"Content-Type":"application/json",...(e==null?void 0:e.headers)||{}}});clearTimeout(s);const r=await n.text(),o=gp(r,n.headers.get("content-type"));if(!n.ok){let a=`${n.status} ${n.statusText}`;if(o&&typeof o=="object"){const l=o,h=l.detail,c=l.error;typeof h=="string"&&h?a=h:typeof c=="string"&&c&&(a=c)}else typeof o=="string"&&o&&(a=o);throw new Error(a)}return o}catch(n){if(clearTimeout(s),n instanceof DOMException&&n.name==="AbortError"){const r=t.signal.reason;throw new Error(r==="timeout"?"timeout":"cancelled")}throw n}}const O={config:()=>B("/api/config"),updateConfig:i=>B("/api/config",{method:"PUT",body:JSON.stringify(i)}),discoverBridges:()=>B("/api/bridge/discover"),triggerScan:()=>B("/api/bridge/scan",{method:"POST"}),getScanLog:()=>B("/api/bridge/scan-log"),getBridges:()=>B("/api/bridges"),addBridge:(i,e,t,s,n)=>B("/api/bridges",{method:"POST",body:JSON.stringify({host:i,port:e,name:t,api_key:s,hostname:n})}),updateBridge:(i,e,t,s,n)=>B(`/api/bridges/${i}`,{method:"PUT",body:JSON.stringify({name:e,host:t,port:s,api_key:n})}),deleteBridge:i=>B(`/api/bridges/${i}`,{method:"DELETE"}),activateBridge:i=>B(`/api/bridges/${i}/activate`,{method:"PUT"}),deactivateBridge:i=>B(`/api/bridges/${i}/deactivate`,{method:"PUT"}),selectBridge:(i,e,t,s,n,r,o)=>B("/api/bridge/select",{method:"POST",body:JSON.stringify({host:i,port:e,name:t,version:s,api_key:n,network_id:r,hostname:o})}),topology:(i=!1)=>{const e=Date.now();return!i&&gn&&e-gn.ts<pp?Promise.resolve(gn.data):B("/api/bridge/topology.json").then(t=>(gn={data:t,ts:e},t))},hideDevice:i=>B(`/api/topology/hide/${encodeURIComponent(i)}`,{method:"DELETE"}),unhideDevice:i=>B(`/api/topology/unhide/${encodeURIComponent(i)}`,{method:"POST"}),devices:()=>B("/api/devices"),device:i=>B(`/api/devices/${encodeURIComponent(i)}`),currentOta:()=>B("/api/ota/current"),currentOtaForDevice:i=>B(`/api/ota/current?mac=${encodeURIComponent(i)}`),uploadFirmware:(i,e)=>{const t=new FormData;return t.set("mac",i),t.set("file",e),B("/api/ota/upload",{method:"POST",body:t})},startOta:i=>B(`/api/ota/start/${i}`,{method:"POST"}),abortOta:()=>B("/api/ota/abort",{method:"POST"}),cancelPending:i=>B(`/api/ota/pending/${i}`,{method:"DELETE"}),getQueue:()=>B("/api/ota/queue"),getQueuePaused:()=>B("/api/ota/queue/paused"),pauseQueue:()=>B("/api/ota/queue/pause",{method:"POST"}),resumeQueue:()=>B("/api/ota/queue/resume",{method:"POST"}),abortQueuedJob:i=>B(`/api/ota/queue/${i}/abort`,{method:"POST"}),reorderJobUp:i=>B(`/api/ota/queue/${i}/up`,{method:"POST"}),reorderJobDown:i=>B(`/api/ota/queue/${i}/down`,{method:"POST"}),history:i=>B(`/api/ota/history/${encodeURIComponent(i)}`),jobLog:i=>B(`/api/ota/jobs/${i}/log`),retained:()=>B("/api/firmware/retained"),reflash:i=>B(`/api/ota/reflash/${i}`,{method:"POST"}),deleteRetained:i=>B(`/api/firmware/retained/${i}`,{method:"DELETE"}),getConfig:i=>B(`/api/devices/${encodeURIComponent(i)}/config`),saveConfig:(i,e,t)=>B(`/api/devices/${encodeURIComponent(i)}/config`,{method:"PUT",body:JSON.stringify({content:e,scaffold:t})}),deleteConfig:i=>B(`/api/devices/${encodeURIComponent(i)}/config`,{method:"DELETE"}),importConfig:(i,e)=>{if(typeof e=="string")return B(`/api/devices/${encodeURIComponent(i)}/config/import`,{method:"POST",body:JSON.stringify({content:e})});const t=new FormData;return t.set("file",e),B(`/api/devices/${encodeURIComponent(i)}/config/import`,{method:"POST",body:t})},getConfigStatus:i=>B(`/api/devices/${encodeURIComponent(i)}/config/status`),compileDevice:i=>B(`/api/devices/${encodeURIComponent(i)}/compile`,{method:"POST"}),getCompileStatus:i=>B(`/api/devices/${encodeURIComponent(i)}/compile/status`),cancelCompile:i=>B(`/api/devices/${encodeURIComponent(i)}/compile/cancel`,{method:"POST"}),startCompileFlash:i=>B(`/api/devices/${encodeURIComponent(i)}/compile/start-flash`,{method:"POST"}),getCompileHistory:i=>B(`/api/devices/${encodeURIComponent(i)}/compile/history`),rebootDevice:i=>B(`/api/devices/${encodeURIComponent(i)}/reboot`,{method:"POST"}),setHeartbeatInterval:(i,e)=>B(`/api/devices/${encodeURIComponent(i)}/heartbeat`,{method:"POST",body:JSON.stringify({interval_seconds:e})}),forceRediscover:i=>B(`/api/devices/${encodeURIComponent(i)}/rediscover`,{method:"POST"}),setParentMac:(i,e,t=!0)=>B(`/api/devices/${encodeURIComponent(i)}/parent`,{method:"POST",body:JSON.stringify({parent_mac:e,clear:t})}),setRelay:(i,e)=>B(`/api/devices/${encodeURIComponent(i)}/relay`,{method:"POST",body:JSON.stringify({enable:e})}),getCompileQueue:()=>B("/api/compile/queue"),abortCompileJob:i=>B(`/api/compile/queue/${i}/abort`,{method:"POST"}),getSecrets:()=>B("/api/secrets"),saveSecrets:i=>B("/api/secrets",{method:"PUT",body:JSON.stringify({content:i})}),getContainerStatus:()=>B("/api/compile/container/status"),cleanArtifacts:()=>B("/api/compile/artifacts",{method:"DELETE"}),getSerialPorts:()=>B("/api/serial/ports"),startSerialFlash:(i,e)=>B(`/api/devices/${encodeURIComponent(i)}/flash/serial`,{method:"POST",body:JSON.stringify({port:e})}),getSerialFlashStatus:i=>B(`/api/devices/${encodeURIComponent(i)}/flash/serial/status`),cancelSerialFlash:i=>B(`/api/devices/${encodeURIComponent(i)}/flash/serial/cancel`,{method:"POST"}),restartRequired:()=>B("/api/restart-required"),requestRestart:()=>B("/api/restart",{method:"POST"}),setupStatus:()=>B("/api/setup-status"),integrationSetup:()=>B("/api/integration/setup",{method:"POST"}),streamCompileLogs(i,e,t){const s=gi(`/api/devices/${encodeURIComponent(i)}/compile/logs`),n=new EventSource(s);return n.onmessage=r=>{e(r.data)},n.addEventListener("status",r=>{e(`[status: ${r.data}]`)}),n.addEventListener("exit",r=>{e(`[build exited with code ${r.data}]`)}),n.addEventListener("queue_position",r=>{e(`[queue position: ${r.data}]`)}),n.onerror=t,n},streamSerialFlashLogs(i,e,t,s){const n=gi(`/api/devices/${encodeURIComponent(i)}/flash/serial/logs`),r=new EventSource(n);return r.onmessage=o=>{e(o.data)},r.addEventListener("status",o=>{t(o.data)}),r.onerror=s,r},downloadFactoryBinary(i){return gi(`/api/devices/${encodeURIComponent(i)}/firmware/download`)},activityLog(i,e,t){const s=gi("/api/integration/activity"),n=new EventSource(s);return n.addEventListener("line",r=>{i(r.data)}),n.addEventListener("end",()=>{e()}),n.addEventListener("error",r=>{t(r)}),n.onerror=t,n}};function mp(i){let e=null,t=!1,s=1e3;const n=()=>{if(t)return;const r=gi("/ws/topology");e=new WebSocket(r),e.onopen=()=>{s=1e3},e.onmessage=o=>{try{const a=JSON.parse(o.data);a.type==="bridge.connection"&&typeof a.payload=="object"&&a.payload!==null&&i(a.payload.connected)}catch{}},e.onclose=()=>{t||(setTimeout(n,s),s=Math.min(s*2,1e4))},e.onerror=()=>{e==null||e.close()}};return n(),{close(){t=!0,e==null||e.close()}}}function bp(i){let e=null,t=!1,s=1e3;const n=()=>{if(t)return;const r=gi("/ws/topology");e=new WebSocket(r),e.onopen=()=>{s=1e3},e.onmessage=o=>{try{const a=JSON.parse(o.data);a&&a.type==="server_id"&&typeof a.value=="string"&&(Jr!==null&&Jr!==a.value&&location.reload(),Jr=a.value),i(a)}catch{}},e.onclose=()=>{t||(setTimeout(n,s),s=Math.min(s*2,1e4))},e.onerror=()=>{e==null||e.close()}};return n(),{close(){t=!0,e==null||e.close()}}}function he(i){const e=i.replace(/[^0-9A-Fa-f]/g,"");return e.length!==12?i.trim().toUpperCase():e.match(/.{2}/g).join(":").toUpperCase()}function wi(i){const e=i||0;return e<1024?`${e} B`:e<1024*1024?`${(e/1024).toFixed(1)} KB`:`${(e/1024/1024).toFixed(2)} MB`}function is(i){return i?new Date(i*1e3).toLocaleString():"-"}function ki(i){if(i==null||i<=0)return"";const e=Number(i);if(e<60)return`${e}s`;if(e<3600)return`${Math.floor(e/60)}m ${e%60}s`;const t=Math.floor(e/3600),s=Math.floor(e%3600/60);return`${t}h ${s}m`}var yp=Object.defineProperty,xp=Object.getOwnPropertyDescriptor,zt=(i,e,t,s)=>{for(var n=s>1?void 0:s?xp(e,t):e,r=i.length-1,o;r>=0;r--)(o=i[r])&&(n=(s?o(e,t,n):o(n))||n);return s&&n&&yp(e,t,n),n};function vp(i){if(i.offline_started_at&&i.offline_started_at>0)return Math.floor(Date.now()/1e3-i.offline_started_at);if(i.last_seen_bridge_uptime_s&&i.bridge_uptime_s&&!i.online)return Math.max(0,i.bridge_uptime_s-i.last_seen_bridge_uptime_s)}let rt=class extends ne{constructor(){super(...arguments),this.childNodesData=[],this.childMap=new Map,this.jobForMac=()=>null,this.configForMac=()=>null,this.onHideDevice=()=>{},this.isRoot=!1,this.isLast=!1}selectNode(){this.dispatchEvent(new CustomEvent("node-selected",{detail:this.node.mac,bubbles:!0,composed:!0}))}navigateTo(i){window.location.hash=i}rssiBars(i){return i==null?"-":i>=-50?"▂▄▆█":i>=-65?"▂▄▆":i>=-80?"▂▄":i>=-90?"▂":"▁"}childKey(i){return he(i.mac||"")}render(){const i=this.jobForMac(this.node.mac),e=!!i&&["starting","transferring","verifying","transfer_success_waiting_rejoin"].includes(i.status),t=!!i&&i.status==="queued",s=(i==null?void 0:i.percent)??0,n=this.childNodesData.length>0,r=(this.node.hops??0)>0,o=this.configForMac(this.node.mac),a=(o==null?void 0:o.config_state)??"no_config";return g`
      <div class="tree-row">
        <div class="branch ${this.isRoot?"root":""}" aria-hidden="true"></div>
        <div class="tree-node ${this.node.online?"online":"offline"}" @click=${this.selectNode}>
          ${r?g`
            <span class="config-badge config-${a}">
              ${a==="no_config"?"—":a==="has_config"?"✓":a==="compiled_ready"?"↑":"—"}
            </span>
          `:g`<span></span>`}
          <span class="status-dot ${this.node.online?"online":"offline"}"></span>
          <span class="identity">
            <span class="bridge-name-line">${this.isRoot&&this.node.network_id?g`<strong>${this.node.friendly_name||this.node.esphome_name||this.node.label||this.node.mac}</strong><span class="network-id">${this.node.network_id}</span>`:g`<strong>${this.node.friendly_name||this.node.esphome_name||this.node.label||this.node.mac}</strong>`}</span>
            <small>${this.node.mac}</small>
          </span>
          <span class="metrics">
            <span class="${this.node.online?"":"offline-metric"}">${this.node.online?ki(this.node.uptime_s):ki(vp(this.node))}</span>
            ${!this.isRoot&&this.node.online&&this.node.last_seen_ago?g`<span class="last-seen">${ki(this.node.last_seen_ago)} ago</span>`:y}
            ${this.isRoot?y:g`
          ${this.node.online?g`<span title="${this.node.rssi!=null?`${this.node.rssi} dBm`:""}">${this.rssiBars(this.node.rssi)}${(this.node.hops??0)>0?`  ${this.node.hops}↷`:""}</span>`:g`<span class="offline-metric">${this.node.offline_reason||"offline"}</span>`}`}
            <span class="chip-name">${this.node.chip_name||"-"}</span>
          </span>
          ${r?g`
            ${this.node.online?g`
              <span class="ota-badge ${e?"active":t?"queued":"idle"}"
                    @click=${l=>{l.stopPropagation(),this.navigateTo(`/device/${encodeURIComponent(this.node.mac)}`)}}>
                ${e?`📡 ${s}%`:t?`⏳ #${i.queue_position??1}`:"📤"}
              </span>
            `:g`
              <button class="hide-btn" title="Hide device" @click=${l=>{l.stopPropagation(),this.onHideDevice(this.node.mac)}}>✕</button>
            `}
          `:g`<span></span>`}
          ${r?g`
            <span class="action-buttons">
              <button class="icon-btn" title="Edit config" @click=${l=>{l.stopPropagation(),this.navigateTo(`/device/${encodeURIComponent(this.node.mac)}/config`)}}>&#9998;</button>
            </span>
          `:y}
        </div>
      </div>
      ${n?g`
            <div class="tree-child">
              ${this.childNodesData.map((l,h)=>g`
                  <esp-topology-node
                    .node=${l}
                    .childNodesData=${this.childMap.get(this.childKey(l))||[]}
                    .childMap=${this.childMap}
                    .jobForMac=${this.jobForMac}
                    .configForMac=${this.configForMac}
                    .onHideDevice=${this.onHideDevice}
                    .isLast=${h===this.childNodesData.length-1}
                  ></esp-topology-node>
                `)}
            </div>
          `:y}
    `}};rt.styles=me`
    :host {
      display: block;
      position: relative;
      margin-left: 10px;
    }

    :host([is-root]) {
      margin-left: 0;
    }

    .tree-row {
      display: flex;
      align-items: stretch;
      position: relative;
      padding: 6px 0;
    }

    .branch {
      position: relative;
      width: 22px;
      flex: 0 0 22px;
      margin-right: 2px;
    }

    .branch.root {
      width: 0;
      flex-basis: 0;
      margin-right: 0;
    }

    /* For last child, stop the vertical line at the horizontal connector */
    :host([is-last])::before {
      display: none;
    }

    /* Don't show continuation line on the root */
    :host([is-root])::before {
      display: none;
    }

    .tree-node {
      width: 100%;
      display: grid;
      grid-template-columns: 14px 10px minmax(180px, 1fr) 1fr 76px 76px;
      gap: 12px;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #fafbfc;
      color: var(--ink);
      padding: 12px 14px;
      cursor: pointer;
      font: inherit;
      transition: all 0.12s;
    }

    .tree-node:hover {
      border-color: var(--primary);
      background: #f0f7fa;
    }

    .tree-node.offline {
      background: #fef2f2;
      border-color: #fecaca;
    }

    .tree-node.offline .status-dot {
      background: var(--danger);
    }

    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--ok);
    }

    .config-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      font-size: 9px;
      font-weight: 700;
      border: 1px solid var(--line);
      border-radius: 4px;
    }

    .config-badge.config-has_config {
      border-color: var(--ok);
      color: var(--ok);
      background: #dcfce7;
    }

    .config-badge.config-compiled_ready {
      border-color: var(--primary);
      color: var(--primary);
      background: #d5f0f3;
    }

    .config-badge.config-no_config {
      border-color: var(--line);
      color: var(--muted);
    }

    .action-buttons {
      display: flex;
      gap: 12px;
    }

    .icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 76px;
      height: 28px;
      border: 1px solid var(--line);
      background: #fff;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      padding: 0;
      transition: all 0.12s;
    }

    .icon-btn:hover {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }

    .identity {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }

    .bridge-name-line {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .network-id {
      color: var(--primary);
      font-weight: 500;
      font-size: 14px;
      flex-shrink: 0;
    }

    strong,
    small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    small {
      color: var(--muted);
      font-size: 12px;
    }

    .metrics {
      display: flex;
      gap: 8px;
      font-size: 12px;
      color: var(--muted);
      justify-content: flex-end;
    }

    .metrics span {
      background: #f1f5f9;
      padding: 3px 8px;
      border-radius: 6px;
      white-space: nowrap;
      width: 76px;
      text-align: center;
    }

    .metrics span.offline-metric {
      background: var(--danger);
      color: #fff;
    }

    .metrics .chip-name {
      min-width: 72px;
    }

    .metrics .last-seen {
      color: var(--muted, #888);
      font-size: 11px;
    }

    .ota-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 6px;
      white-space: nowrap;
      cursor: pointer;
      transition: all 0.12s;
    }

    .ota-badge.active {
      position: relative;
      overflow: hidden;
      background: #5b9bd5;
    }

    .ota-badge.active::before {
      content: '';
      position: absolute;
      inset: 0;
      background: repeating-linear-gradient(
        -45deg,
        transparent,
        transparent 4px,
        rgba(255, 255, 255, 0.2) 4px,
        rgba(255, 255, 255, 0.2) 8px
      );
      background-size: 12px 12px;
      animation: ota-stripes 0.6s linear infinite;
    }

    .ota-badge.idle {
      background: #fff;
      color: var(--ink);
      border: 1px solid var(--line);
      font-size: 16px;
    }

    .ota-badge.queued {
      background: #5b9bd5;
    }

    .ota-badge:hover {
      opacity: 0.85;
    }

    .hide-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 76px;
      padding: 2px 8px;
      border: 1px solid var(--line);
      background: #fff;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      color: var(--danger);
      transition: all 0.12s;
    }

    .hide-btn:hover {
      background: var(--danger);
      color: #fff;
      border-color: var(--danger);
    }

    @keyframes ota-stripes {
      0% { background-position: 0 0; }
      100% { background-position: 12px 0; }
    }

    .tree-child {
      position: relative;
      margin-left: 6px;
      padding-left: 0;
    }

    @media (max-width: 840px) {
      :host {
        margin-left: 0;
      }
      .branch {
        display: none;
      }
      .tree-node {
        grid-template-columns: 1fr auto;
        grid-auto-flow: row;
        align-items: start;
        gap: 6px 10px;
        padding: 12px 12px;
      }
      .config-badge {
        display: none;
      }
      .status-dot {
        grid-column: 2;
        grid-row: 1;
        justify-self: end;
        margin-top: 8px;
      }
      .identity {
        grid-column: 1;
        grid-row: 1;
        align-self: start;
        gap: 2px;
      }
      strong,
      small {
        white-space: normal;
      }
      strong {
        font-size: 14px;
        line-height: 1.25;
      }
      small {
        font-size: 11px;
        line-height: 1.3;
      }
      .metrics,
      .ota-badge,
      .offline-note {
        grid-column: 1 / -1;
      }
      .metrics {
        display: flex;
        flex-wrap: wrap;
        grid-row: 2;
        gap: 6px;
      }
      .ota-badge,
      .offline-note {
        grid-row: 3;
      }
      .action-buttons {
        display: none;
      }
    }
  `;zt([Q({type:Object})],rt.prototype,"node",2);zt([Q({type:Array})],rt.prototype,"childNodesData",2);zt([Q({attribute:!1})],rt.prototype,"childMap",2);zt([Q({attribute:!1})],rt.prototype,"jobForMac",2);zt([Q({attribute:!1})],rt.prototype,"configForMac",2);zt([Q({attribute:!1})],rt.prototype,"onHideDevice",2);zt([Q({type:Boolean})],rt.prototype,"isRoot",2);zt([Q({type:Boolean,reflect:!0})],rt.prototype,"isLast",2);rt=zt([be("esp-topology-node")],rt);var wp=Object.defineProperty,kp=Object.getOwnPropertyDescriptor,ni=(i,e,t,s)=>{for(var n=s>1?void 0:s?kp(e,t):e,r=i.length-1,o;r>=0;r--)(o=i[r])&&(n=(s?o(e,t,n):o(n))||n);return s&&n&&wp(e,t,n),n};let Ct=class extends ne{constructor(){super(...arguments),this.topology=[],this.currentJob=null,this.queueData=null,this.configStatuses=new Map,this.loading=!0,this.error="",this.hiddenExpanded=!1}connectedCallback(){super.connectedCallback(),this.load(),this.stream=bp(i=>{(i.type==="topology.snapshot"||i.type==="topology.changed"||i.type==="remote.availability"||i.type==="bridge.heartbeat")&&this.load(!1,!0)})}disconnectedCallback(){var i;(i=this.stream)==null||i.close(),super.disconnectedCallback()}async load(i=!0,e=!1){i&&(this.loading=!0);try{const[t,s,n]=await Promise.all([O.topology(e),O.currentOta(),O.getQueue()]);this.topology=t,this.currentJob=s.job,this.queueData=n,this.error="";const r=t.filter(l=>(l.hops??0)>0).map(l=>O.getConfigStatus(l.mac).catch(()=>null)),o=await Promise.all(r),a=new Map;o.forEach(l=>{l&&a.set(he(l.mac),l)}),this.configStatuses=a}catch(t){this.error=t instanceof Error?t.message:String(t)}finally{this.loading=!1}}async handleHideDevice(i){try{await O.hideDevice(i),await this.load(!1,!0)}catch(e){console.error("Failed to hide device:",e)}}async handleUnhideDevice(i){try{await O.unhideDevice(i),await this.load(!1,!0)}catch(e){console.error("Failed to unhide device:",e)}}jobForMac(i){var s;const e=he(i);return this.currentJob&&he(this.currentJob.mac)===e?this.currentJob:(((s=this.queueData)==null?void 0:s.queued_jobs)??[]).find(n=>he(n.mac)===e)??null}configForMac(i){return this.configStatuses.get(he(i))??null}childKey(i){return he(i||"")}buildChildren(){const i=new Map;for(const t of this.topology){const s=this.childKey(t.parent_mac);if(!s)continue;const n=i.get(s)||[];n.push(t),i.set(s,n)}for(const t of i.values())t.sort((s,n)=>(s.friendly_name||s.label||s.esphome_name||s.mac).localeCompare(n.friendly_name||n.label||n.esphome_name||n.mac));return{root:this.topology.find(t=>(t.hops??0)===0)||this.topology.find(t=>!t.parent_mac)||this.topology[0]||null,childMap:i}}render(){const{root:i}=this.buildChildren(),e=this.topology.filter(n=>!n.hidden&&(n.hops??0)>0),t=this.topology.filter(n=>n.hidden),s=new Map;for(const n of e){const r=this.childKey(n.parent_mac);if(!r)continue;const o=s.get(r)||[];o.push(n),s.set(r,o)}for(const n of s.values())n.sort((r,o)=>(r.friendly_name||r.label||r.esphome_name||r.mac).localeCompare(o.friendly_name||o.label||o.esphome_name||o.mac));return g`
      ${this.error?g`<div class="error">${this.error}</div>`:y}
      ${this.loading?g`<div class="loading">Reading bridge topology...</div>`:y}
      ${!this.loading&&!i&&!this.error?g`<div class="loading">No topology data returned by the bridge.</div>`:y}
      ${i?g`
            <section class="card">
              <div class="card-header">
                <h2>${i.friendly_name||i.label||i.esphome_name||"Bridge"} Topology</h2>
                <button class="btn" @click=${()=>void this.load()}>Refresh</button>
              </div>
              <div class="card-body">
                <div class="tree-root">
                  <esp-topology-node
                    .node=${i}
                    .childNodesData=${s.get(this.childKey(i.mac))||[]}
                    .childMap=${s}
                    .jobForMac=${n=>this.jobForMac(n)}
                    .configForMac=${n=>this.configForMac(n)}
                    .onHideDevice=${n=>this.handleHideDevice(n)}
                    .isRoot=${!0}
                  ></esp-topology-node>
                </div>
              </div>
            </section>
          `:y}
      ${t.length>0?g`
            <section class="card hidden-section">
              <div class="card-header collapsible" @click=${()=>{this.hiddenExpanded=!this.hiddenExpanded}}>
                <h2>Hidden Devices (${t.length})</h2>
                <span class="expand-icon">${this.hiddenExpanded?"▼":"▶"}</span>
              </div>
              ${this.hiddenExpanded?g`
                    <div class="card-body">
                      <div class="hidden-devices">
                        ${t.map(n=>g`
                          <div class="hidden-device-row" @click=${()=>{window.location.hash=`/device/${encodeURIComponent(n.mac)}`}}>
                            <span class="status-dot offline"></span>
                            <span class="device-name">${n.friendly_name||n.esphome_name||n.label||n.mac}</span>
                            <span class="device-mac">${n.mac}</span>
                            <span class="device-status">${n.offline_reason||"offline"}</span>
                            <button class="restore-btn" @click=${r=>{r.stopPropagation(),this.handleUnhideDevice(n.mac)}}>Restore</button>
                          </div>
                        `)}
                      </div>
                    </div>
                  `:y}
            </section>
          `:y}
    `}};Ct.styles=me`
    .card {
      background: var(--surface);
      border-radius: 12px;
      box-shadow: var(--shadow);
      border: 1px solid var(--line);
      margin-bottom: 20px;
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--line);
    }

    .card-header h2 {
      font-size: 16px;
      font-weight: 600;
      margin: 0;
    }

    .card-body {
      padding: 16px 10px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 5px 10px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      transition: all 0.12s;
      min-height: 32px;
    }

    .btn:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }

    .tree-root {
      margin: 0;
      padding: 0;
      overflow: hidden;
    }

    .error,
    .loading {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 20px;
      color: var(--muted);
      font-size: 14px;
    }

    .error {
      border-color: var(--danger);
      color: var(--danger);
      background: #fef2f2;
    }

    .hidden-section {
      margin-top: 0;
    }

    .hidden-section .card-header {
      cursor: pointer;
      user-select: none;
    }

    .hidden-section .card-header:hover {
      background: #f8fafc;
    }

    .expand-icon {
      font-size: 12px;
      color: var(--muted);
    }

    .hidden-devices {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .hidden-device-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.12s;
    }

    .hidden-device-row:hover {
      background: #fee2e2;
      border-color: var(--danger);
    }

    .hidden-device-row .status-dot {
      flex-shrink: 0;
    }

    .hidden-device-row .device-name {
      flex: 1;
      font-weight: 500;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .hidden-device-row .device-mac {
      color: var(--muted);
      font-size: 12px;
    }

    .hidden-device-row .device-status {
      color: var(--danger);
      font-size: 12px;
    }

    .hidden-device-row .restore-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border: 1px solid var(--line);
      background: #fff;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      color: var(--ink);
      transition: all 0.12s;
      white-space: nowrap;
    }

    .hidden-device-row .restore-btn:hover {
      background: var(--ok);
      color: #fff;
      border-color: var(--ok);
    }

    @media (max-width: 720px) {
      .summary {
        display: none;
      }

      .card {
        margin-bottom: 14px;
      }

      .card-header {
        align-items: flex-start;
        gap: 12px;
        flex-direction: column;
        padding: 14px 16px;
      }

      .card-header h2 {
        font-size: 15px;
      }

      .card-body {
        padding: 12px 14px;
      }
    }
  `;ni([w()],Ct.prototype,"topology",2);ni([w()],Ct.prototype,"currentJob",2);ni([w()],Ct.prototype,"queueData",2);ni([w()],Ct.prototype,"configStatuses",2);ni([w()],Ct.prototype,"loading",2);ni([w()],Ct.prototype,"error",2);ni([w()],Ct.prototype,"hiddenExpanded",2);Ct=ni([be("esp-topology-map")],Ct);var Sp=Object.defineProperty,Cp=Object.getOwnPropertyDescriptor,Oe=(i,e,t,s)=>{for(var n=s>1?void 0:s?Cp(e,t):e,r=i.length-1,o;r>=0;r--)(o=i[r])&&(n=(s?o(e,t,n):o(n))||n);return s&&n&&Sp(e,t,n),n};let ge=class extends ne{constructor(){super(...arguments),this.mac="",this.online=!1,this.isRemote=!1,this.relayNodes=[],this.relayEnabled=!1,this.busy="",this.heartbeatSeconds=60,this.selectedParent="",this.customParentMac="",this.showRelayModal=!1,this.showHeartbeatModal=!1,this.showParentModal=!1,this.parentDropdownOpen=!1,this.showConfirmModal="",this.confirmAction=null,this.toast=null}disconnectedCallback(){this.toastTimer&&window.clearTimeout(this.toastTimer),super.disconnectedCallback()}disabled(i=""){return!this.online||!!this.busy||!!i&&this.busy!==i}notify(i,e){this.toast={message:i,tone:e},this.toastTimer&&window.clearTimeout(this.toastTimer),this.toastTimer=window.setTimeout(()=>{this.toast=null},4500)}configError(i,e,t){if(e===void 0){console.error("Unexpected config response:",t),this.notify(`${i} returned an unexpected response`,"error");return}const n={rejected:"Config Fail Device Rejected",busy:"Config Fail Device Busy",timeout:"Config Fail Device Timeout",no_session:"Config Fail No Session",not_remote:"Config Fail Not Remote",invalid_payload:"Config Fail Invalid Payload",unsupported:"Config Fail Unsupported"}[e]??`${i} returned ${e}`;this.notify(n,"error")}dispatchChanged(){this.dispatchEvent(new CustomEvent("config-changed",{bubbles:!0,composed:!0}))}reboot(){this.showConfirmModal="Reboot",this.confirmAction=()=>{this.busy="reboot",O.rebootDevice(this.mac).then(i=>{i.result==="ok"?(this.notify("Reboot command accepted","ok"),this.dispatchChanged()):this.configError(i.command,i.result,i)}).catch(i=>{this.notify(i instanceof Error?i.message:String(i),"error")}).finally(()=>{this.busy=""})}}rediscover(){this.showConfirmModal="Rediscover",this.confirmAction=()=>{this.busy="rediscover",O.forceRediscover(this.mac).then(i=>{i.result==="ok"?(this.notify("Rediscover command accepted","ok"),this.dispatchChanged()):this.configError(i.command,i.result,i)}).catch(i=>{this.notify(i instanceof Error?i.message:String(i),"error")}).finally(()=>{this.busy=""})}}applyHeartbeat(){const i=Math.trunc(Number(this.heartbeatSeconds));return i<5||i>3600?(this.notify("Heartbeat must be 5-3600 seconds","error"),Promise.resolve()):(console.log("[debug-modal] applyHeartbeat setting showHeartbeatModal=false"),this.showHeartbeatModal=!1,this.busy="heartbeat",O.setHeartbeatInterval(this.mac,i).then(e=>{e.result==="ok"?(this.notify("Heartbeat interval set","ok"),this.dispatchChanged()):this.configError(e.command,e.result,e)}).catch(e=>{this.notify(e instanceof Error?e.message:String(e),"error")}).finally(()=>{this.busy=""}))}applyParent(i){const e=he((this.customParentMac||this.selectedParent).trim());if(!/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(e)){this.notify("Parent MAC is invalid","error");return}this.showParentModal=!1,this.busy="parent",O.setParentMac(this.mac,e,i).then(t=>{t.result==="ok"?(this.notify("Parent set","ok"),this.dispatchChanged()):this.configError(t.command,t.result,t)}).catch(t=>{this.notify(t instanceof Error?t.message:String(t),"error")}).finally(()=>{this.busy=""})}openRelayModal(){this.showRelayModal=!0}closeRelayModal(){this.showRelayModal=!1}applyRelayModal(i){this.showRelayModal=!1,this.busy="relay",O.setRelay(this.mac,i).then(e=>{if(e.result!==void 0&&!["no_session","timeout","rejected","busy","invalid_payload","not_remote"].includes(e.result)){const s=e.result==="ok"?i?"Relay Enabled Successfully":"Relay Disabled Successfully":e.result;this.notify(s,"ok"),this.dispatchChanged()}else this.configError(e.command,e.result,e)}).catch(e=>{this.notify(e instanceof Error?e.message:String(e),"error")}).finally(()=>{this.busy=""})}render(){return this.isRemote?g`
      <section class="config-panel">
        <div class="title-row">
          <div>
            <h2>Device Controls</h2>
          </div>
          ${this.busy?g`<small class="busy">${this.busy}</small>`:y}
        </div>

        ${this.online?y:g`<div class="offline">Device offline</div>`}

        <div class="command-row three">
          <button class="danger" ?disabled=${this.disabled()} @click=${this.reboot}>Reboot</button>
          <button ?disabled=${this.disabled()} @click=${this.rediscover}>Force Rediscover</button>
          <button ?disabled=${this.disabled()} @click=${this.openRelayModal}>Relay Config</button>
        </div>

        <div class="command-row three">
          <button class="config-btn" ?disabled=${this.disabled()} @click=${()=>{console.log("[debug-modal] Set Heartbeat button clicked"),this.showHeartbeatModal=!0}}>Set Heartbeat</button>
          <div></div>
          <button class="config-btn" ?disabled=${this.disabled()} @click=${()=>{this.showParentModal=!0}}>Set Parent</button>
        </div>

        ${this.showRelayModal?this.renderRelayModal():y}
        ${this.showHeartbeatModal?this.renderHeartbeatModal():y}
        ${this.showParentModal?this.renderParentModal():y}
        ${this.showConfirmModal?this.renderConfirmModal():y}

        ${this.toast?g`<div class="toast ${this.toast.tone}">${this.toast.message}</div>`:y}
      </section>
    `:y}renderRelayModal(){return g`
      <div class="modal-backdrop" @click=${this.handleBackdropClick}>
        <div class="modal" @click=${i=>i.stopPropagation()}>
          <h3>Relay Config</h3>
          <p>Configure relay mode for this device.</p>
          <div class="modal-actions">
            <button @click=${()=>this.applyRelayModal(!0)} ?disabled=${this.disabled()}>Enable Relay</button>
            <button @click=${()=>this.applyRelayModal(!1)} ?disabled=${this.disabled()}>Disable Relay</button>
            <button class="cancel" @click=${this.closeRelayModal}>Cancel</button>
          </div>
        </div>
      </div>
    `}renderHeartbeatModal(){return g`
      <div class="modal-backdrop" @click=${this.handleBackdropClick}>
        <div class="modal" @click=${i=>i.stopPropagation()}>
          <h3>Set Heartbeat</h3>
          <label>
            <span>Interval (seconds)</span>
            <input
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              min="5"
              max="3600"
              .value=${String(this.heartbeatSeconds)}
              @input=${i=>{this.heartbeatSeconds=Number(i.target.value)}}
              @keydown=${i=>{i.key==="Enter"&&this.applyHeartbeatFromModal()}}
            />
          </label>
          <div class="modal-actions">
            <button @click=${this.applyHeartbeatFromModal} ?disabled=${this.disabled()||this.heartbeatSeconds<5||this.heartbeatSeconds>3600}>Set</button>
            <button class="cancel" @click=${()=>{this.showHeartbeatModal=!1}}>Cancel</button>
          </div>
        </div>
      </div>
    `}handleBackdropClick(i){const e=i.target;console.log("[debug-modal] handleBackdropClick target class:",e.classList.contains("modal-backdrop"),e.className),e.classList.contains("modal-backdrop")&&(console.log("[debug-modal] handleBackdropClick closing modals"),this.showHeartbeatModal=!1,this.showParentModal=!1,this.showConfirmModal="")}renderParentModal(){const i=!!(this.customParentMac.trim()||this.selectedParent),e=this.relayNodes.filter(t=>he(t.mac)!==he(this.mac));return g`
      <div class="modal-backdrop" @click=${this.handleBackdropClick}>
        <div class="modal" @click=${t=>t.stopPropagation()}>
          <h3>Set Parent</h3>
          <p class="callout">Configures the remote device's preferred parent - is not blocking so if remote cannot reach the parent it may select an alternate</p>
          <label>
            <span>Parent</span>
            <select
              .value=${this.selectedParent}
              ?disabled=${this.disabled()}
              @change=${t=>{const s=t.target.value;s==="__custom__"?(this.parentDropdownOpen=!0,this.selectedParent=""):(this.selectedParent=s,this.customParentMac="",this.parentDropdownOpen=!1)}}
            >
              <option value="">Select parent</option>
              ${e.map(t=>g`
                <option value=${he(t.mac)}>
                  ${t.friendly_name||t.esphome_name||t.label||he(t.mac)}
                </option>
              `)}
              <option value="__custom__">Custom MAC...</option>
            </select>
          </label>
          ${this.parentDropdownOpen?g`
            <label class="custom-mac-label">
              <span>Custom MAC</span>
              <input
                type="text"
                autocomplete="off"
                placeholder="AA:BB:CC:DD:EE:FF"
                .value=${this.customParentMac}
                ?disabled=${this.disabled()}
                @input=${t=>{this.customParentMac=t.target.value}}
              />
            </label>
          `:y}
          ${this.customParentMac?g`<div class="custom-mac-display">Custom: ${this.customParentMac}</div>`:y}
          <div class="modal-actions two">
            <button @click=${()=>this.applyParentFromModal(!0)} ?disabled=${this.disabled()||!i}>Set Parent Replace All Parents</button>
            <button @click=${()=>this.applyParentFromModal(!1)} ?disabled=${this.disabled()||!i}>Set Parent Add to List</button>
          </div>
          <div class="modal-actions">
            <button class="cancel" @click=${()=>{this.showParentModal=!1}}>Cancel</button>
          </div>
        </div>
      </div>
    `}applyHeartbeatFromModal(){this.applyHeartbeat()}applyParentFromModal(i){this.showParentModal=!1,this.parentDropdownOpen=!1,this.applyParent(i)}renderConfirmModal(){const i=this.showConfirmModal==="Reboot";return g`
      <div class="modal-backdrop" @click=${this.handleBackdropClick}>
        <div class="modal" @click=${e=>e.stopPropagation()}>
          <h3>${i?"Reboot Device":"Force Rediscover"}</h3>
          <p class="callout">${i?"Are you sure you want to reboot this device?":"Force this device to rediscover its parent route?"}</p>
          <div class="modal-actions two">
            <button @click=${()=>{const e=this.confirmAction;this.showConfirmModal="",this.confirmAction=null,e&&e()}} ?disabled=${this.disabled()}>Go</button>
            <button class="cancel" @click=${()=>{this.showConfirmModal="",this.confirmAction=null}}>Cancel</button>
          </div>
        </div>
      </div>
    `}};ge.styles=me`
    .config-panel {
      position: relative;
      display: grid;
      gap: 16px;
    }

    .title-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
    }

    .title-row span,
    label > span {
      display: block;
      color: #64748b;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
      margin-bottom: 5px;
    }

    h2 {
      margin: 0;
      color: #0f172a;
      font-size: 20px;
      line-height: 1.1;
    }

    .busy {
      color: #0f766e;
      font-weight: 700;
      text-transform: uppercase;
    }

    .offline {
      border: 1px solid #fecaca;
      background: #fef2f2;
      color: #991b1b;
      border-radius: 8px;
      padding: 9px 11px;
      font-size: 13px;
      font-weight: 700;
    }

    .command-row,
    .field-row,
    .config-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      align-items: end;
    }

    .command-row.three {
      grid-template-columns: 1fr 1fr 1fr;
    }

    .config-btn {
      width: 100%;
    }

    input,
    select,
    button {
      width: 100%;
      min-height: 38px;
      box-sizing: border-box;
      border-radius: 8px;
      font: inherit;
      font-size: 13px;
    }

    input,
    select {
      border: 1px solid #cbd5e1;
      background: #fff;
      padding: 0 10px;
    }

    button {
      border: 1px solid #0f766e;
      background: #0f766e;
      color: #fff;
      padding: 0 12px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.12s, background 0.12s, border-color 0.12s;
    }

    button:hover:not(:disabled) {
      background: #115e59;
      border-color: #115e59;
      transform: translateY(-1px);
    }

    button.danger {
      background: #b91c1c;
      border-color: #b91c1c;
    }

    button.danger:hover:not(:disabled) {
      background: #991b1b;
      border-color: #991b1b;
    }

    button:disabled,
    input:disabled,
    select:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .check {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 38px;
    }

    .check input {
      width: 42px;
      min-height: 22px;
      accent-color: #0f766e;
    }

    .check span {
      margin: 0;
      color: #334155;
      font-size: 13px;
      font-weight: 700;
      text-transform: none;
    }

    .toast {
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 13px;
      font-weight: 700;
      border: 1px solid;
    }

    .toast.ok {
      background: #ecfdf5;
      color: #065f46;
      border-color: #a7f3d0;
    }

    .toast.error {
      background: #fff7ed;
      color: #9a3412;
      border-color: #fed7aa;
    }

    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal {
      background: #fff;
      border-radius: 12px;
      padding: 24px;
      width: 90%;
      max-width: 380px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
    }

    .modal h3 {
      margin: 0 0 16px 0;
      color: #0f172a;
      font-size: 18px;
    }

    .modal label {
      display: block;
    }

    .modal label span {
      display: block;
      color: #64748b;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
      margin-bottom: 5px;
    }

    .modal input {
      width: 100%;
      min-height: 38px;
      box-sizing: border-box;
      border-radius: 8px;
      font: inherit;
      font-size: 13px;
      border: 1px solid #cbd5e1;
      background: #fff;
      padding: 0 10px;
    }

    .modal-actions {
      display: flex;
      gap: 10px;
      margin-top: 20px;
      justify-content: flex-end;
    }

    .modal-actions button {
      width: auto;
      min-width: 80px;
      padding: 0 16px;
    }

    .modal-actions button.cancel {
      background: #fff;
      border-color: #cbd5e1;
      color: #64748b;
    }

    .modal-actions button.cancel:hover:not(:disabled) {
      background: #f1f5f9;
      border-color: #94a3b8;
      transform: none;
    }

    .modal-actions.two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 20px;
    }

    .modal-actions.two button {
      width: 100%;
      min-width: auto;
    }

    .callout {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 12px;
      color: #64748b;
      margin: 0 0 16px 0;
    }

    .custom-mac-label {
      display: block;
      margin-top: 10px;
    }

    .custom-mac-display {
      font-size: 12px;
      color: #64748b;
      padding: 4px 0;
    }

    @media (max-width: 760px) {
      .command-row,
      .field-row,
      .command-row.three {
        grid-template-columns: 1fr;
      }
    }
  `;Oe([Q({type:String})],ge.prototype,"mac",2);Oe([Q({type:Boolean})],ge.prototype,"online",2);Oe([Q({type:Boolean})],ge.prototype,"isRemote",2);Oe([Q({type:Array})],ge.prototype,"relayNodes",2);Oe([Q({type:Boolean})],ge.prototype,"relayEnabled",2);Oe([w()],ge.prototype,"busy",2);Oe([w()],ge.prototype,"heartbeatSeconds",2);Oe([w()],ge.prototype,"selectedParent",2);Oe([w()],ge.prototype,"customParentMac",2);Oe([w()],ge.prototype,"showRelayModal",2);Oe([w()],ge.prototype,"showHeartbeatModal",2);Oe([w()],ge.prototype,"showParentModal",2);Oe([w()],ge.prototype,"parentDropdownOpen",2);Oe([w()],ge.prototype,"showConfirmModal",2);Oe([w()],ge.prototype,"confirmAction",2);Oe([w()],ge.prototype,"toast",2);ge=Oe([be("esp-device-config")],ge);var Op=Object.defineProperty,Ap=Object.getOwnPropertyDescriptor,Ba=(i,e,t,s)=>{for(var n=s>1?void 0:s?Ap(e,t):e,r=i.length-1,o;r>=0;r--)(o=i[r])&&(n=(s?o(e,t,n):o(n))||n);return s&&n&&Op(e,t,n),n};let Is=class extends ne{constructor(){super(...arguments),this.showAbort=!1}abort(){this.dispatchEvent(new CustomEvent("abort",{bubbles:!0,composed:!0}))}render(){const i=Math.max(0,Math.min(100,Number(this.job.percent||0))),t=["success","failed","aborted","rejoin_timeout","version_mismatch"].includes(this.job.status)?this.job.status==="success"?"progress-panel success":"progress-panel failure":"progress-panel";return g`
      <section class="${t}">
        <div class="progress-header">
          <div>
            <span class="label">Current flash</span>
            <h3>${this.job.firmware_name||"firmware.ota.bin"}</h3>
          </div>
          <strong class="state">${this.job.status.replaceAll("_"," ")}</strong>
        </div>
        <div class="bar" style="--bar-percent: ${i}%" aria-label="OTA progress">
          <span>${i}%</span>
        </div>
        <dl>
          <div><dt>Chunks</dt><dd>${this.job.chunks_sent??0} / ${this.job.total_chunks??"-"}</dd></div>
          <div><dt>Bridge</dt><dd>${this.job.bridge_state||"-"}</dd></div>
          <div><dt>Increment</dt><dd>${this.job.current_increment!=null&&this.job.total_increments!=null?`${this.job.current_increment}/${this.job.total_increments}`:"-"}</dd></div>
          <div><dt>Round</dt><dd>${this.job.retransmit_round??0}</dd></div>
          <div><dt>Size</dt><dd>${wi(this.job.firmware_size)}</dd></div>
          <div><dt>Started</dt><dd>${is(this.job.started_at)}</dd></div>
        </dl>
        ${this.job.error_msg?g`<p class="error">${this.job.error_msg}</p>`:y}
        ${this.showAbort?g`<button class="abort-btn" @click=${this.abort}>Abort</button>`:y}
      </section>
    `}};Is.styles=me`
    .progress-panel {
      position: relative;
      border: 1px solid var(--line);
      background: #fffbeb;
      border-radius: 8px;
      padding: 16px;
    }

    .progress-panel.success {
      border-color: var(--ok);
      background: #dcfce7;
    }

    .progress-panel.failure {
      border-color: var(--danger);
      background: #fef2f2;
    }

    .progress-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
      margin-bottom: 12px;
    }

    .label {
      color: var(--muted);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    h3 {
      margin: 4px 0 0;
      font-size: 16px;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .state {
      color: var(--accent);
      text-transform: uppercase;
      font-size: 12px;
      font-weight: 500;
      text-align: right;
    }

    .bar {
      position: relative;
      height: 8px;
      background: var(--line);
      border-radius: 4px;
      margin-bottom: 12px;
      overflow: hidden;
    }

    .bar::after {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      width: var(--bar-percent, 0%);
      background: var(--primary);
      border-radius: 4px;
      transition: width 180ms ease;
    }

    .bar::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      width: var(--bar-percent, 0%);
      background: linear-gradient(
        90deg,
        transparent 0%,
        rgba(255, 255, 255, 0.35) 50%,
        transparent 100%
      );
      border-radius: 4px;
      transition: width 180ms ease;
      animation: ota-shimmer 1.4s ease-in-out infinite;
    }

    @keyframes ota-shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(200%); }
    }

    .bar span {
      display: none;
    }

    dl {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin: 0;
    }

    dt {
      color: var(--muted);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }

    dd {
      margin: 3px 0 0;
      overflow-wrap: anywhere;
      font-size: 12px;
    }

    .error {
      color: var(--danger);
      margin: 10px 0 0;
      font-size: 12px;
    }

    @media (max-width: 760px) {
      dl {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    .abort-btn {
      position: absolute;
      bottom: 12px;
      right: 12px;
      background: var(--danger);
      color: #fff;
      border: none;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    }

    .abort-btn:hover {
      background: #dc2626;
    }
  `;Ba([Q({type:Object})],Is.prototype,"job",2);Ba([Q({type:Boolean})],Is.prototype,"showAbort",2);Is=Ba([be("esp-ota-progress")],Is);var $p=Object.defineProperty,Pp=Object.getOwnPropertyDescriptor,at=(i,e,t,s)=>{for(var n=s>1?void 0:s?Pp(e,t):e,r=i.length-1,o;r>=0;r--)(o=i[r])&&(n=(s?o(e,t,n):o(n))||n);return s&&n&&$p(e,t,n),n};const Kr=new Set(["success","failed","aborted","rejoin_timeout","version_mismatch"]);let Ue=class extends ne{constructor(){super(...arguments),this.mac="",this.currentJob=null,this.pendingJob=null,this.preflight=null,this.acceptedWarnings=!1,this.busy=!1,this.error="",this.completedJob=null,this.showAbortModal=!1}willUpdate(i){if(i.has("currentJob")&&this.currentJob===null){const e=i.get("currentJob");e&&!this.completedJob&&Kr.has(e.status)&&(this.completedJob=e)}}async upload(i){var s;const e=i.target,t=(s=e.files)==null?void 0:s[0];if(t){this.busy=!0,this.error="",this.acceptedWarnings=!1;try{const n=await O.uploadFirmware(this.mac,t);this.pendingJob=n.job,this.preflight=n.preflight||null,this.dispatchChanged()}catch(n){this.error=n instanceof Error?n.message:String(n)}finally{this.busy=!1,e.value=""}}}async start(){if(this.pendingJob){this.busy=!0,this.error="";try{(await O.startOta(this.pendingJob.id)).job.status==="queued"?(this.pendingJob=null,this.preflight=null,this.dispatchChanged()):(this.pendingJob=null,this.preflight=null,this.dispatchChanged())}catch(i){this.error=i instanceof Error?i.message:String(i)}finally{this.busy=!1}}}async abortQueued(){if(this.currentJob){this.busy=!0,this.error="";try{await O.abortQueuedJob(this.currentJob.id),this.dispatchChanged()}catch(i){this.error=i instanceof Error?i.message:String(i)}finally{this.busy=!1}}}async abort(){var e,t,s;const i=((e=this.pendingJob)==null?void 0:e.id)??(((t=this.currentJob)==null?void 0:t.status)==="pending_confirm"?(s=this.currentJob)==null?void 0:s.id:null);if(i){this.pendingJob=null,this.preflight=null,this.acceptedWarnings=!1,this.busy=!0,this.error="";try{await O.cancelPending(i),this.dispatchChanged()}catch(n){this.error=n instanceof Error?n.message:String(n)}finally{this.busy=!1}return}try{if((await O.getQueue()).count>0){this.showAbortModal=!0;return}}catch{}this.pendingJob=null,this.preflight=null,this.acceptedWarnings=!1,this.busy=!0,this.error="";try{await O.abortOta(),this.dispatchChanged()}catch(n){this.error=n instanceof Error?n.message:String(n)}finally{this.busy=!1}}async dismissAndClear(){this.completedJob=null,this.pendingJob=null,this.preflight=null,this.acceptedWarnings=!1,this.dispatchChanged()}dispatchChanged(){this.dispatchEvent(new CustomEvent("ota-changed",{bubbles:!0,composed:!0}))}render(){var l,h,c,d;const i=this.currentJob&&he(this.currentJob.mac)===he(this.mac),e=i&&((l=this.currentJob)==null?void 0:l.status)==="compile_queued",t=i&&((h=this.currentJob)==null?void 0:h.status)==="compiling",s=i&&((c=this.currentJob)==null?void 0:c.status)==="queued",n=i&&this.currentJob&&!s&&!e&&!t&&this.currentJob.status!=="pending_confirm"&&!Kr.has(this.currentJob.status),r=this.pendingJob,o=!!r&&(!((d=this.preflight)!=null&&d.has_warnings)||this.acceptedWarnings)&&!this.busy,a=this.completedJob&&Kr.has(this.completedJob.status);return g`
      <section class="ota">
        <div class="title-row">
          <div>
            <h2>Firmware Flash</h2>
          </div>
          ${i&&this.currentJob&&!a&&!s&&!e&&!t&&!r&&!n?g`<button class="btn btn-danger" ?disabled=${this.busy} @click=${this.abort}>Abort</button>`:y}
        </div>

        ${a?this.renderFlashResult(this.completedJob):g`
              ${e&&this.currentJob?this.renderCompileQueued(this.currentJob):y}
              ${t&&this.currentJob?this.renderCompiling(this.currentJob):y}
              ${s&&this.currentJob?this.renderQueued(this.currentJob):n&&this.currentJob?g`<esp-ota-progress .job=${this.currentJob} .showAbort=${!0} @abort=${this.abort}></esp-ota-progress>`:y}

              ${!r&&!s&&!n&&!e&&!t?g`
                    <label class="upload ${this.busy?"busy":""}">
                      <input type="file" accept=".bin,.ota.bin,application/octet-stream" ?disabled=${this.busy} @change=${this.upload} />
                      <strong>${this.busy?"Processing firmware...":"Choose .ota.bin firmware"}</strong>
                      <small>Stored in the add-on, then chunk-fed to the bridge.</small>
                    </label>
                  `:y}

              ${r?this.renderPending(r,o):y}
            `}
        ${this.showAbortModal?this.renderAbortModal():y}
        ${this.error?g`<p class="error">${this.error}</p>`:y}
      </section>
    `}renderQueued(i){const e=i.queue_position??1;return g`
      <div class="queued-wrapper">
        <esp-ota-progress .job=${i}></esp-ota-progress>
        <div class="queued-overlay">
          <span class="queued-icon">⏳</span>
          <strong>Firmware Update Queued</strong>
          <small>#${e} in queue</small>
          <button class="btn btn-danger" ?disabled=${this.busy} @click=${this.abortQueued}>Abort</button>
        </div>
      </div>
    `}renderCompileQueued(i){const e=(i.queue_position??0)+1;return g`
      <div class="queued-wrapper">
        <div class="queued-overlay compile-overlay">
          <span class="queued-icon">⏳</span>
          <strong>Compiling Firmware...</strong>
          <small>#${e} in compile queue</small>
          <button class="btn btn-danger" ?disabled=${this.busy} @click=${this.abortCompileQueuedJob}>Cancel</button>
        </div>
      </div>
    `}renderCompiling(i){return g`
      <div class="queued-wrapper">
        <div class="queued-overlay compile-overlay compiling-overlay">
          <span class="queued-icon">⚙</span>
          <strong>Building Firmware...</strong>
          <a class="view-logs-link" href=${`#/device/${encodeURIComponent(this.mac)}/config`}>View compile logs →</a>
          <button class="btn btn-danger" ?disabled=${this.busy} @click=${this.cancelCompile}>Cancel</button>
        </div>
      </div>
    `}async abortCompileQueuedJob(){if(this.currentJob){this.busy=!0,this.error="";try{await O.cancelCompile(this.mac),this.dispatchChanged()}catch(i){this.error=i instanceof Error?i.message:String(i)}finally{this.busy=!1}}}async cancelCompile(){this.busy=!0,this.error="";try{await O.cancelCompile(this.mac),this.dispatchChanged()}catch(i){this.error=i instanceof Error?i.message:String(i)}finally{this.busy=!1}}renderAbortModal(){return g`
      <div class="modal-backdrop" @click=${()=>{this.showAbortModal=!1,this.pendingJob=null,this.preflight=null}}>
        <div class="modal" @click=${i=>i.stopPropagation()}>
          <h3>Other queued jobs waiting</h3>
          <p>Continue running the next queued job after aborting this one?</p>
          <div class="actions">
            <button class="start" @click=${this.abortAndContinue}>Yes, continue queue</button>
            <button class="btn btn-danger" @click=${this.abortAndPause}>No, pause queue</button>
            <button @click=${()=>{this.showAbortModal=!1,this.pendingJob=null,this.preflight=null}}>Cancel</button>
          </div>
        </div>
      </div>
    `}async abortAndContinue(){this.showAbortModal=!1,this.pendingJob=null,this.preflight=null,this.busy=!0;try{await O.abortOta(),this.dispatchChanged()}catch(i){this.error=i instanceof Error?i.message:String(i)}finally{this.busy=!1}}async abortAndPause(){this.showAbortModal=!1,this.pendingJob=null,this.preflight=null,this.busy=!0;try{await O.abortOta(),await O.pauseQueue(),this.dispatchChanged()}catch(i){this.error=i instanceof Error?i.message:String(i)}finally{this.busy=!1}}renderPending(i,e){const t=this.preflight,n=`tag ${t!=null&&t.name.match?"match":"mismatch"}`,r=t!=null&&t.name.match?"MATCH":"MISMATCH",a=`tag ${t!=null&&t.chip.match?"match":"mismatch"}`,l=t!=null&&t.chip.match?"MATCH":"MISMATCH",h=(t==null?void 0:t.build_date.status)||"unknown";let c="tag ",d="";return h==="same"?(c+="same",d="SAME"):h==="newer"?(c+="newer",d=`NEWER ${t==null?void 0:t.build_date.delta}`):h==="older"&&(c+="older",d=`OLDER ${t==null?void 0:t.build_date.delta}`),t!=null&&t.metadata_unavailable?g`
        <div class="pending">
          <h3>${i.firmware_name||"Selected firmware"}</h3>
          <p class="meta-unavailable">Metadata not available for ESP8266 Arduino firmware.</p>
          <div class="meta-info">
            <span>Size: ${wi(i.firmware_size)}</span>
            <span>MD5: ${i.firmware_md5||"-"}</span>
          </div>
          <div class="actions">
            <button class="btn btn-primary" ?disabled=${!e} @click=${this.start}>Flash</button>
            <button class="btn" ?disabled=${this.busy} @click=${this.abort}>Cancel</button>
          </div>
        </div>
      `:g`
      <div class="pending">
        <h3>${i.firmware_name||"Selected firmware"}</h3>
        <table class="compare-table">
          <thead>
            <tr><th>Field</th><th>Current (Remote)</th><th>New (Firmware)</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Name</td>
              <td>${(t==null?void 0:t.name.current)||"-"}</td>
              <td>${(t==null?void 0:t.name.new)||"-"}<br><span class="${n}">${r}</span></td>
            </tr>
            <tr>
              <td>Build Date</td>
              <td>${(t==null?void 0:t.build_date.current)||"-"}</td>
              <td>${(t==null?void 0:t.build_date.new)||"-"}<br><span class="${c}">${d}</span></td>
            </tr>
            <tr>
              <td>Chip Type</td>
              <td>${(t==null?void 0:t.chip.current)||"-"}</td>
              <td>${(t==null?void 0:t.chip.new)||"-"}<br><span class="${a}">${l}</span></td>
            </tr>
          </tbody>
        </table>
        <div class="meta-info">
          <span>Size: ${wi(i.firmware_size)}</span>
          <span>MD5: ${i.firmware_md5||"-"}</span>
        </div>
        ${t!=null&&t.has_warnings?g`
              <div class="warnings">
                ${t.warnings.map(f=>g`<p>${f}</p>`)}
                <label>
                  <input type="checkbox" .checked=${this.acceptedWarnings} @change=${f=>this.acceptedWarnings=f.target.checked} />
                  Flash anyway
                </label>
              </div>
            `:y}
        <div class="actions">
          <button class="btn btn-primary" ?disabled=${!e} @click=${this.start}>Flash</button>
          <button class="btn" ?disabled=${this.busy} @click=${this.abort}>Cancel</button>
        </div>
      </div>
    `}renderFlashResult(i){const e=i.status==="success",t=e?"success":"failure",s=e?"FLASH SUCCESSFUL":i.status.replaceAll("_"," ").toUpperCase(),n=i.parsed_esphome_name||i.firmware_name||"-",r=this.node.esphome_name||"-",o=n===r||n==="-"&&r==="-",a=i.parsed_build_date||"-",l=this.node.firmware_build_date||"-",h=a===l||a==="-"&&l==="-",c=i.parsed_chip_name||"-",d=this.node.chip_name||"-",f=c===d||c==="-"&&d==="-",u=i.firmware_md5||"-",p=this.node.firmware_md5||"-",m=u===p||u==="-"&&p==="-";return g`
      <div class="flash-result ${t}">
        <div class="result-banner">
          <span class="result-icon">${e?"✓":"✗"}</span>
          <span class="result-label">${s}</span>
        </div>
        <h3>${i.firmware_name||"firmware.ota.bin"}</h3>
        <table class="compare-table">
          <thead>
            <tr><th>Field</th><th>Flashed</th><th>Device Now</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Name</td>
              <td>${n}</td>
              <td>${r} ${o?y:g`<span class="tag mismatch">CHANGED</span>`}</td>
            </tr>
            <tr>
              <td>Build Date</td>
              <td>${a}</td>
              <td>${l} ${h?y:g`<span class="tag mismatch">CHANGED</span>`}</td>
            </tr>
            <tr>
              <td>Chip Type</td>
              <td>${c}</td>
              <td>${d} ${f?y:g`<span class="tag mismatch">CHANGED</span>`}</td>
            </tr>
            <tr>
              <td>Firmware MD5</td>
              <td>${u}</td>
              <td>${p} ${m?y:g`<span class="tag mismatch">CHANGED</span>`}</td>
            </tr>
          </tbody>
        </table>
        <div class="meta-info">
          <span>Size: ${wi(i.firmware_size)}</span>
          ${i.completed_at?g`<span>Completed: ${is(i.completed_at)}</span>`:y}
        </div>
        <div class="actions">
          <button @click=${this.dismissAndClear}>Clear Result</button>
        </div>
      </div>
    `}};Ue.styles=me`
    .ota {
      display: grid;
      gap: 12px;
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    .card-header h2 {
      font-size: 16px;
      font-weight: 600;
      margin: 0;
    }

    .title-row {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }

    .title-row span {
      color: var(--primary);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .title-row h2 {
      margin: 2px 0 0;
      font-size: 20px;
    }

    .upload {
      display: grid;
      gap: 6px;
      place-items: center;
      min-height: 130px;
      border: 2px dashed var(--line);
      background: #fafbfc;
      border-radius: 10px;
      cursor: pointer;
      padding: 18px;
      text-align: center;
      transition: all 0.12s;
    }

    .upload:hover {
      border-color: var(--primary);
      background: #f0f7fa;
    }

    input[type='file'] {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      opacity: 0;
      pointer-events: none;
    }

    small,
    .meta {
      color: var(--muted);
      font-size: 12px;
    }

    .pending {
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 8px;
      padding: 16px;
    }

    .pending h3 {
      margin: 0 0 12px;
    }

    .meta-unavailable {
      color: var(--muted);
      font-style: italic;
      margin: 0 0 12px;
    }

    .compare-table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 13px;
    }

    .compare-table th,
    .compare-table td {
      border: 1px solid var(--line);
      padding: 8px 10px;
      text-align: left;
    }

    .compare-table th {
      background: #f8fafc;
      font-size: 11px;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 600;
    }

    .compare-table td:first-child {
      font-weight: 500;
      color: var(--muted);
    }

    .tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      margin-top: 4px;
    }

    .tag.match {
      background: #dcfce7;
      color: #166534;
    }

    .tag.same {
      background: #f1f5f9;
      color: var(--muted);
    }

    .tag.mismatch,
    .tag.newer {
      background: #fef2f2;
      color: #991b1b;
    }

    .tag.older {
      background: #dcfce7;
      color: #166534;
    }

    .meta-info {
      display: flex;
      gap: 16px;
      font-size: 11px;
      color: var(--muted);
      margin-bottom: 12px;
    }

    .warnings {
      border-left: 4px solid var(--accent);
      background: #fffbeb;
      padding: 12px;
      display: grid;
      gap: 8px;
      margin-bottom: 12px;
      border-radius: 6px;
    }

    .warnings p {
      margin: 0;
      font-size: 13px;
    }

    .warnings label {
      font-weight: 500;
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .flash-result {
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 8px;
      padding: 16px;
    }

    .flash-result.failure {
      border-color: var(--danger);
    }

    .result-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      margin: -16px -16px 12px -16px;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 14px;
      border-radius: 8px 8px 0 0;
    }

    .flash-result.success .result-banner {
      background: #dcfce7;
      color: #166534;
    }

    .flash-result.failure .result-banner {
      background: #fef2f2;
      color: #991b1b;
    }

    .result-icon {
      font-size: 18px;
      line-height: 1;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      transition: all 0.12s;
      min-height: 38px;
    }

    .btn:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }

    .btn-primary {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }

    .btn-primary:hover {
      background: #0d4d5e;
    }

    .btn-danger {
      background: var(--danger);
      color: #fff;
      border-color: var(--danger);
    }

    .btn-danger:hover {
      background: #dc2626;
    }

    button:disabled,
    .btn:disabled {
      opacity: 0.48;
      cursor: not-allowed;
    }

    .notice,
    .error {
      margin: 0;
      padding: 10px 12px;
      border: 1px solid var(--accent);
      background: #fffbeb;
      color: #7c3f00;
      font-weight: 500;
      border-radius: 6px;
    }

    .error {
      border-color: var(--danger);
      background: #fef2f2;
      color: #991b1b;
    }

    .queued-wrapper {
      position: relative;
      overflow: visible;
    }

    .queued-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      background: rgba(255, 247, 223, 0.92);
      z-index: 2;
      text-align: center;
      padding: 8px;
      overflow: visible;
      border-radius: 8px;
    }

    .queued-icon {
      font-size: 24px;
    }

    .queued-overlay strong {
      font-size: 14px;
    }

    .queued-overlay small {
      color: var(--muted);
      font-size: 11px;
    }

    .queued-overlay .btn-danger {
      margin-top: 8px;
    }

    .compile-overlay {
      background: rgba(255, 249, 230, 0.95);
    }

    .compiling-overlay {
      background: rgba(232, 248, 245, 0.95);
    }

    .view-logs-link {
      color: var(--primary);
      font-size: 12px;
      font-weight: 500;
      text-decoration: underline;
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 20px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    .modal h3 {
      margin: 0 0 8px 0;
      font-size: 16px;
      font-weight: 600;
    }

    .modal p {
      margin: 0 0 16px 0;
      font-size: 14px;
      color: var(--muted);
    }

    @media (max-width: 760px) {
      .compare-table {
        font-size: 11px;
      }
    }
  `;at([Q({type:String})],Ue.prototype,"mac",2);at([Q({type:Object})],Ue.prototype,"node",2);at([Q({type:Object})],Ue.prototype,"currentJob",2);at([w()],Ue.prototype,"pendingJob",2);at([w()],Ue.prototype,"preflight",2);at([w()],Ue.prototype,"acceptedWarnings",2);at([w()],Ue.prototype,"busy",2);at([w()],Ue.prototype,"error",2);at([w()],Ue.prototype,"completedJob",2);at([w()],Ue.prototype,"showAbortModal",2);Ue=at([be("esp-ota-box")],Ue);var Mp=Object.defineProperty,Tp=Object.getOwnPropertyDescriptor,nn=(i,e,t,s)=>{for(var n=s>1?void 0:s?Tp(e,t):e,r=i.length-1,o;r>=0;r--)(o=i[r])&&(n=(s?o(e,t,n):o(n))||n);return s&&n&&Mp(e,t,n),n};let $i=class extends ne{constructor(){super(...arguments),this.jobs=[],this.mac="",this.busyJob=null,this.error=""}retained(i){return!!i.firmware_path&&!!i.retained_until&&i.retained_until>Math.floor(Date.now()/1e3)}viewLog(i){const e=`/device/${encodeURIComponent(this.mac||i.mac)}`;window.location.hash=`/job/${i.id}?from=${encodeURIComponent(e)}`}async reflash(i){this.busyJob=i.id,this.error="";try{const e=await O.reflash(i.id);this.dispatchEvent(new CustomEvent("ota-reflash-result",{bubbles:!0,composed:!0,detail:{job:e.job,preflight:e.preflight}})),this.dispatchChanged()}catch(e){this.error=e instanceof Error?e.message:String(e)}finally{this.busyJob=null}}async deleteRetained(i){this.busyJob=i.id,this.error="";try{await O.deleteRetained(i.id),this.dispatchChanged()}catch(e){this.error=e instanceof Error?e.message:String(e)}finally{this.busyJob=null}}dispatchChanged(){this.dispatchEvent(new CustomEvent("ota-changed",{bubbles:!0,composed:!0}))}render(){return g`
      <section>
        <div class="title-row">
          <div>
            <h2>Flash Log</h2>
          </div>
        </div>
        ${this.error?g`<p class="error">${this.error}</p>`:y}
        ${this.jobs.length?g`
              <div class="table">
                ${this.jobs.map(i=>g`
                    <article>
                      <div>
                        <strong>${i.firmware_name||"firmware.ota.bin"}</strong>
                        <small>${is(i.created_at)} / ${wi(i.firmware_size)}</small>
                      </div>
                      <span class="status-chip ${i.status}">${i.status.replaceAll("_"," ")}</span>
                      <div class="version">
                        <small>${i.parsed_build_date||"-"}</small>
                        ${i.error_msg?g`<em>${i.error_msg}</em>`:y}
                      </div>
                      <div class="actions">
                        <button class="btn" @click=${()=>this.viewLog(i)}>View log</button>
                        ${this.retained(i)?g`
                              <button class="btn" ?disabled=${this.busyJob===i.id} @click=${()=>this.reflash(i)}>Flash again</button>
                              <button class="btn" ?disabled=${this.busyJob===i.id} @click=${()=>this.deleteRetained(i)}>Delete binary</button>
                            `:y}
                      </div>
                    </article>
                  `)}
              </div>
            `:g`<p class="empty">No flash history for this node yet.</p>`}
      </section>
    `}};$i.styles=me`
    section {
      display: grid;
      gap: 12px;
    }

    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .title-row span {
      color: var(--primary);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    h2 {
      margin: 2px 0 0;
      font-size: 16px;
      font-weight: 600;
    }

    .table {
      display: grid;
      gap: 8px;
    }

    article {
      display: grid;
      grid-template-columns: 1.2fr auto 1fr auto;
      gap: 12px;
      align-items: center;
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 8px;
      padding: 10px 12px;
    }

    strong,
    small,
    em {
      display: block;
      overflow-wrap: anywhere;
    }

    small {
      color: var(--muted);
      font-size: 12px;
    }

    em {
      color: var(--danger);
      font-style: normal;
      margin-top: 4px;
      font-size: 12px;
    }

    .status-chip {
      border: 1px solid var(--line);
      padding: 4px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      font-weight: 600;
      font-size: 11px;
      white-space: nowrap;
    }

    .success {
      color: var(--ok);
    }

    .failed,
    .rejoin_timeout,
    .version_mismatch,
    .aborted {
      color: var(--danger);
    }

    .actions {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
      flex-wrap: wrap;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      padding: 5px 10px;
      border-radius: 6px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      transition: all 0.12s;
      min-height: 30px;
    }

    .btn:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }

    .empty,
    .error {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
    }

    .error {
      color: var(--danger);
      font-weight: 500;
    }

    @media (max-width: 880px) {
      article {
        grid-template-columns: 1fr;
        align-items: stretch;
      }
      .actions {
        justify-content: flex-start;
      }
    }
  `;nn([Q({type:Array})],$i.prototype,"jobs",2);nn([Q({type:String})],$i.prototype,"mac",2);nn([w()],$i.prototype,"busyJob",2);nn([w()],$i.prototype,"error",2);$i=nn([be("esp-flash-history")],$i);var Dp=Object.defineProperty,Ep=Object.getOwnPropertyDescriptor,_a=(i,e,t,s)=>{for(var n=s>1?void 0:s?Ep(e,t):e,r=i.length-1,o;r>=0;r--)(o=i[r])&&(n=(s?o(e,t,n):o(n))||n);return s&&n&&Dp(e,t,n),n};let Ns=class extends ne{constructor(){super(...arguments),this.jobs=[],this.mac=""}viewJobLog(i){const e=`/device/${encodeURIComponent(this.mac)}`;window.location.hash=`/job/${i.id}?from=${encodeURIComponent(e)}`}render(){const i=this.jobs.filter(e=>e.status==="success"||e.status==="failed");return g`
      <section>
        <div class="title-row">
          <h2>Compile Log</h2>
        </div>
        ${i.length?g`
              <div class="table">
                ${i.map(e=>g`
                    <article>
                      <div>
                        <strong>${e.parsed_esphome_name||e.firmware_name||"compile"}</strong>
                        <small>${is(e.created_at)}</small>
                      </div>
                      <span class="status ${e.status}">${e.status.replaceAll("_"," ")}</span>
                      <div class="version">
                        <small>${e.parsed_build_date||"-"} / v${e.parsed_version||"-"}</small>
                        ${e.error_msg?g`<em>${e.error_msg}</em>`:y}
                      </div>
                      <div class="actions">
                        <button class="btn" @click=${()=>this.viewJobLog(e)}>View log</button>
                      </div>
                    </article>
                  `)}
              </div>
            `:g`<p class="empty">No compile history for this node yet.</p>`}
      </section>
    `}};Ns.styles=me`
    section {
      display: grid;
      gap: 10px;
    }

    .title-row span {
      color: var(--primary);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    h2 {
      margin: 2px 0 0;
      font-size: 16px;
      font-weight: 600;
    }

    .table {
      display: grid;
      gap: 8px;
    }

    article {
      display: grid;
      grid-template-columns: minmax(160px, 1.2fr) auto minmax(160px, 1fr) auto;
      gap: 12px;
      align-items: center;
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 8px;
      padding: 10px 12px;
    }

    strong,
    small,
    em {
      display: block;
      overflow-wrap: anywhere;
    }

    small {
      color: var(--muted);
      font-size: 11px;
    }

    em {
      color: var(--danger);
      font-style: normal;
      margin-top: 4px;
      font-size: 11px;
    }

    .status {
      border: 1px solid var(--line);
      padding: 4px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      font-weight: 600;
      font-size: 11px;
      white-space: nowrap;
    }

    .success {
      color: var(--ok);
    }

    .failed {
      color: var(--danger);
    }

    .actions {
      display: flex;
      gap: 6px;
      justify-content: end;
      flex-wrap: wrap;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      padding: 5px 10px;
      border-radius: 6px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      transition: all 0.12s;
      min-height: 30px;
    }

    .btn:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }

    .empty {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
    }

    @media (max-width: 880px) {
      article {
        grid-template-columns: 1fr;
        align-items: stretch;
      }
      .actions {
        justify-content: start;
      }
    }
  `;_a([Q({type:Array})],Ns.prototype,"jobs",2);_a([Q({type:String})],Ns.prototype,"mac",2);Ns=_a([be("esp-compile-history")],Ns);var Rp=Object.defineProperty,Bp=Object.getOwnPropertyDescriptor,rn=(i,e,t,s)=>{for(var n=s>1?void 0:s?Bp(e,t):e,r=i.length-1,o;r>=0;r--)(o=i[r])&&(n=(s?o(e,t,n):o(n))||n);return s&&n&&Rp(e,t,n),n};let Pi=class extends ne{constructor(){super(...arguments),this.mac="",this.visible=!0,this.logs=[],this.autoScroll=!0,this.eventSource=null,this._macObserved="",this.scrollTarget=null}connectedCallback(){super.connectedCallback(),this.connect()}disconnectedCallback(){this.disconnect(),super.disconnectedCallback()}updated(i){this.hidden=!this.visible,i.has("mac")&&this.mac!==this._macObserved&&(this.logs=[],this.connect())}connect(){this.disconnect(),this.mac&&(this._macObserved=this.mac,this.eventSource=O.streamCompileLogs(this.mac,i=>{this.logs=[...this.logs,i],this.requestUpdate(),this.autoScroll&&this.visible&&requestAnimationFrame(()=>this.scrollToBottom())},()=>{this.eventSource&&(this.eventSource.close(),this.eventSource=null)}))}disconnect(){this.eventSource&&(this.eventSource.close(),this.eventSource=null)}scrollToBottom(){this.scrollTarget&&(this.scrollTarget.scrollTop=this.scrollTarget.scrollHeight)}toggleAutoScroll(){this.autoScroll=!this.autoScroll}clearLogs(){this.logs=[]}render(){return g`
      <div class="log-header">
        <span class="label">Build Log</span>
        <div class="controls">
          <button class="ctrl-btn" @click=${this.clearLogs}>Clear</button>
          <button class="ctrl-btn ${this.autoScroll?"active":""}" @click=${this.toggleAutoScroll}>
            ${this.autoScroll?"Auto-scroll ↓":"Scroll lock"}
          </button>
        </div>
      </div>
      <div class="log-body" ${i=>{this.scrollTarget=i}}>
        ${this.logs.length===0?g`<span class="empty">Waiting for build output...</span>`:g`<pre>${this.logs.join(`
`)}</pre>`}
      </div>
    `}};Pi.styles=me`
    :host {
      display: block;
      border: 1px solid var(--line);
      background: #1a1b1e;
      border-radius: 8px;
      overflow: hidden;
      margin-top: 8px;
    }
    :host([hidden]) {
      display: none;
    }
    .log-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-bottom: 1px solid var(--line);
      background: #25262b;
      font-size: 11px;
    }
    .label {
      color: var(--muted);
      font-weight: 600;
      text-transform: uppercase;
    }
    .controls {
      display: flex;
      gap: 4px;
    }
    .ctrl-btn {
      border: 1px solid rgba(255,255,255,0.08);
      background: transparent;
      color: var(--muted);
      font: inherit;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.12s;
    }
    .ctrl-btn:hover,
    .ctrl-btn.active {
      background: var(--primary);
      color: white;
      border-color: var(--primary);
    }
    .log-body {
      max-height: 400px;
      overflow-y: auto;
      padding: 10px;
    }
    pre {
      margin: 0;
      color: #c0c5ce;
      font-family: ui-monospace, "SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .empty {
      color: var(--muted);
      font-style: italic;
      font-size: 12px;
    }
  `;rn([Q({type:String})],Pi.prototype,"mac",2);rn([Q({type:Boolean})],Pi.prototype,"visible",2);rn([w()],Pi.prototype,"logs",2);rn([w()],Pi.prototype,"autoScroll",2);Pi=rn([be("esp-compile-log-viewer")],Pi);var _p=Object.defineProperty,Lp=Object.getOwnPropertyDescriptor,lt=(i,e,t,s)=>{for(var n=s>1?void 0:s?Lp(e,t):e,r=i.length-1,o;r>=0;r--)(o=i[r])&&(n=(s?o(e,t,n):o(n))||n);return s&&n&&_p(e,t,n),n};const Ip=["queued","starting","transferring","verifying","transfer_success_waiting_rejoin"],Gr=["compile_queued","compiling"];let je=class extends ne{constructor(){super(...arguments),this.mac="",this.node=null,this.topology=[],this.currentJob=null,this.history=[],this.compileHistoryList=[],this.compileStatus="idle",this.loading=!0,this.error="",this.compileTimer=null}connectedCallback(){super.connectedCallback(),this.load(),this.schedulePoll()}disconnectedCallback(){this.timer&&window.clearInterval(this.timer),this.compileTimer&&window.clearInterval(this.compileTimer),super.disconnectedCallback()}schedulePoll(){this.timer&&window.clearInterval(this.timer);const e=this.currentJob&&Ip.includes(this.currentJob.status)?2e3:5e3;this.timer=window.setInterval(()=>void this.load(!1),e)}pollCompileStatus(){O.getCompileStatus(this.mac).then(i=>{this.compileStatus=i.status,Gr.includes(i.status)?this.compileTimer||(this.compileTimer=setInterval(()=>this.pollCompileStatus(),3e3)):this.compileTimer&&(clearInterval(this.compileTimer),this.compileTimer=null)}).catch(()=>{})}handleReflashResult(i){this.otaBox.preflight=i.detail.preflight,this.load(!1)}updated(){this.schedulePoll()}async load(i=!0){i&&(this.loading=!0);try{const[e,t,s,n,r]=await Promise.all([O.topology(),O.currentOtaForDevice(this.mac),O.getQueue(),O.history(this.mac),O.getCompileHistory(this.mac)]);this.topology=e,this.node=e.find(h=>he(h.mac)===he(this.mac))||null;const o=he(this.mac),a=(s.queued_jobs??[]).find(h=>he(h.mac)===o)??null;t&&t.job&&he(t.job.mac)===o?this.currentJob=t.job:a?this.currentJob=a:this.currentJob=t.job,this.history=n.jobs,this.compileHistoryList=r.jobs,this.error="";const l=await O.getCompileStatus(this.mac).catch(()=>null);l&&(this.compileStatus=l.status),Gr.includes(this.compileStatus)&&this.pollCompileStatus()}catch(e){this.error=e instanceof Error?e.message:String(e)}finally{this.loading=!1}}goBack(){window.location.hash="/"}goToConfig(){window.location.hash=`/device/${encodeURIComponent(this.mac)}/config`}render(){if(this.loading)return g`<div class="card">Loading device...</div>`;if(this.error)return g`<div class="card error">${this.error}</div>`;if(!this.node)return g`
        <div class="card">
          <button class="back" @click=${this.goBack}>Back</button>
          <p>Device ${this.mac} is not present in the current bridge topology.</p>
        </div>
      `;const i=!this.node.is_bridge&&(this.node.hops??0)>0,e=this.topology.filter(t=>!t.online||he(t.mac)===he(this.node.mac)?!1:!!t.is_bridge||!!t.can_relay||(t.hops??0)>0);return g`
      <button class="back" @click=${this.goBack}>Back to topology</button>
      <section class="hero">
        <div class="hero-left">
          <h2>${this.node.friendly_name||this.node.esphome_name||this.node.label||this.node.mac}<span class="mac-suffix"> ${this.node.mac}</span></h2>
          <div class="hero-stats">
            <div class="hero-box sm ${this.node.online?"box-online":"box-offline"}" title="${this.node.firmware_md5?`firmware MD5: ${this.node.firmware_md5}`:"firmware MD5: —"}"><span class="lbl">Status</span><span class="val">${this.node.online?"Online":this.node.offline_reason||"Offline"}</span></div>
            <div class="hero-box sm"><span class="lbl">Hops</span><span class="val">${this.node.hops??0}</span></div>
            <div class="hero-box sm"><span class="lbl">Uptime</span><span class="val">${ki(this.node.uptime_s)}</span></div>
            <div class="hero-box sm"><span class="lbl">Last Seen</span><span class="val">${this.node.last_seen_ago?ki(this.node.last_seen_ago):"-"}</span></div>
            ${this.node.chip_name?g`<div class="hero-box sm"><span class="lbl">Chip</span><span class="val">${this.node.chip_name}</span></div>`:y}
            <div class="hero-box sm"><span class="lbl">RSSI</span><span class="val">${this.node.rssi==null?"-":`${this.node.rssi}`}<span class="unit">dBm</span></span></div>
          </div>
        </div>
        ${i?g`<button class="edit-config-btn" @click=${this.goToConfig}>Edit Config</button>`:y}
      </section>

      <div class="layout">
        ${i?g`
              <section class="card config-card">
                <esp-device-config
                  .mac=${this.node.mac}
                  .online=${!!this.node.online}
                  .isRemote=${i}
                  .relayNodes=${e}
                  .relayEnabled=${!!this.node.relay_enabled}
                  @config-changed=${()=>void this.load(!1)}
                ></esp-device-config>
              </section>
              <section class="card">
                <esp-ota-box .mac=${this.node.mac} .node=${this.node} .currentJob=${this.currentJob} @ota-changed=${()=>void this.load(!1)}></esp-ota-box>
              </section>
              <section class="layout-empty"></section>
            `:g`
              <section class="card">
                <esp-ota-box .mac=${this.node.mac} .node=${this.node} .currentJob=${this.currentJob} @ota-changed=${()=>void this.load(!1)}></esp-ota-box>
              </section>
            `}
        <section class="card history">
          <esp-flash-history .jobs=${this.history} @ota-changed=${()=>void this.load(!1)} @ota-reflash-result=${this.handleReflashResult}></esp-flash-history>
        </section>
        <section class="panel history">
          <esp-compile-history .jobs=${this.compileHistoryList} .mac=${this.mac}></esp-compile-history>
        </section>
        ${Gr.includes(this.compileStatus)||this.compileStatus==="failed"?g`<section class="panel history">
              <esp-compile-log-viewer .mac=${this.mac} .visible=${!0}></esp-compile-log-viewer>
            </section>`:y}
      </div>
    `}};je.styles=me`
    .back {
      border: 1px solid var(--line);
      background: var(--surface);
      min-height: 36px;
      padding: 0 14px;
      font: inherit;
      font-weight: 500;
      border-radius: 8px;
      cursor: pointer;
      margin-bottom: 16px;
      font-size: 13px;
      transition: all 0.12s;
    }

    .back:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }

    .hero,
    .card {
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 12px;
      box-shadow: var(--shadow);
    }

    .hero {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      padding: 20px 24px;
      margin-bottom: 20px;
    }

    .hero-left {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .hero-left h2 {
      margin: 0;
      font-size: 28px;
      font-weight: 700;
      line-height: 1;
      overflow-wrap: anywhere;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .mac-suffix {
      font-size: 14px;
      font-weight: 400;
      color: var(--muted);
      font-family: monospace;
    }

    .hero-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .hero-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 8px 14px;
      min-width: 80px;
    }

    .hero-box.sm {
      min-width: 70px;
      padding: 6px 10px;
    }

    .hero-box.sm .lbl {
      font-size: 9px;
    }

.hero-box.sm {
      min-width: 70px;
      padding: 6px 10px;
    }

    .hero-box.sm .lbl {
      font-size: 9px;
    }

.hero-box.sm .val {
      font-size: 13px;
    }

    .box-online {
      background: #dcfce7;
      border-color: #bbf7d0;
    }

    .box-online .lbl,
    .box-online .val {
      color: #166534;
    }

    .box-offline {
      background: #fef2f2;
      border-color: #fecaca;
    }

    .box-offline .lbl,
    .box-offline .val {
      color: #991b1b;
    }

    .hero-box .lbl {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 600;
      color: #94a3b8;
      margin-bottom: 2px;
    }

    .hero-box .val {
      font-size: 16px;
      font-weight: 700;
      color: var(--primary);
      display: flex;
      align-items: baseline;
      gap: 2px;
    }

    .hero-box .val .unit {
      font-size: 11px;
      font-weight: 500;
      color: #94a3b8;
    }

    .edit-config-btn {
      border: 1px solid var(--line);
      background: var(--surface);
      min-height: 36px;
      padding: 0 16px;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      border-radius: 8px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.12s;
      align-self: flex-start;
    }

    .edit-config-btn:hover {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }

    .layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }

    .card {
      padding: 16px 20px;
    }

    .history {
      grid-column: 1 / -1;
    }

    .layout-empty {
      min-height: 1px;
    }

    .error {
      color: var(--danger);
      font-weight: 500;
      padding: 12px;
      border: 1px solid var(--danger);
      border-radius: 8px;
      background: #fef2f2;
    }

    @media (max-width: 900px) {
      .layout {
        grid-template-columns: 1fr;
      }
      .hero-stats {
        flex-wrap: wrap;
      }
    }

    @media (max-width: 500px) {
      .hero-stats {
        flex-direction: column;
      }
    }
  `;lt([Q({type:String})],je.prototype,"mac",2);lt([w()],je.prototype,"node",2);lt([w()],je.prototype,"topology",2);lt([w()],je.prototype,"currentJob",2);lt([w()],je.prototype,"history",2);lt([w()],je.prototype,"compileHistoryList",2);lt([w()],je.prototype,"compileStatus",2);lt([w()],je.prototype,"loading",2);lt([w()],je.prototype,"error",2);lt([dp("esp-ota-box")],je.prototype,"otaBox",2);je=lt([be("esp-device-detail")],je);var Np=Object.defineProperty,zp=Object.getOwnPropertyDescriptor,te=(i,e,t,s)=>{for(var n=s>1?void 0:s?zp(e,t):e,r=i.length-1,o;r>=0;r--)(o=i[r])&&(n=(s?o(e,t,n):o(n))||n);return s&&n&&Np(e,t,n),n};let Y=class extends ne{constructor(){super(...arguments),this.autoInit=!1,this.config=null,this.configuredBridges=[],this.discoveredBridges=[],this.loading=!0,this.discovering=!1,this.saving=!1,this.error="",this.saved="",this.containerStatus=null,this.cleaningArtifacts=!1,this.artifactsMessage="",this.editingBridgeId=null,this.editApiKey="",this.newBridgeApiKey="",this.showManualEntry=!1,this.manualHost="",this.manualPort=80,this.manualApiKey="",this.showScanLog=!1,this.scanLogContent="",this.scanLogLoading=!1,this.restarting=!1,this.restartFeedback="",this.integrationPollTimer=null}connectedCallback(){super.connectedCallback(),this.load(),this.loadContainerStatus(),this.integrationPollTimer=setInterval(()=>void this.pollIntegrationStatus(),5e3),this.autoInit&&this.discover()}disconnectedCallback(){super.disconnectedCallback(),this.integrationPollTimer&&(clearInterval(this.integrationPollTimer),this.integrationPollTimer=null)}async pollIntegrationStatus(){try{this.config=await O.config()}catch{}}async restartHa(){this.restarting=!0,this.restartFeedback="";try{const i=await O.requestRestart();i.success?this.restartFeedback="Restart requested":this.restartFeedback=i.error||"Restart failed"}catch{this.restartFeedback="Restart failed"}finally{this.restarting=!1,setTimeout(()=>{this.restartFeedback=""},4e3)}}renderIntegrationStatus(){var a;const i=(a=this.config)==null?void 0:a.integration;if(!i)return g`<p class="int-status-note muted">Loading integration status...</p>`;const{installed:e,loaded:t,configured:s,connected:n,bridge_count:r,remote_count:o}=i;return e?t?s?n?g`
      <div class="int-connected-box">
        <div class="int-connected-header">
          <span class="status-dot green pulse"></span>
          <span class="int-connected-label">Connected</span>
        </div>
        <div class="int-connected-counts">
          ${r>0?g`<span>${r} ${r===1?"bridge":"bridges"}</span>`:y}
          ${o>0?g`<span>${o} ${o===1?"remote":"remotes"}</span>`:y}
        </div>
      </div>
    `:g`
        <div class="int-status-row">
          <span class="status-dot gray"></span>
          <span>Bridge connection lost</span>
        </div>
      `:g`
        <div class="int-status-row">
          <span class="status-dot yellow"></span>
          <span>Integration not yet configured</span>
        </div>
        <div class="int-configure-hint">
          <strong>Add ESP-Tree integration</strong>
          <p>Go to <strong>Settings → Devices &amp; Services → Add Integration</strong> → search for <em>ESP-Tree</em></p>
        </div>
      `:g`
        <div class="int-status-row">
          <span class="status-dot yellow"></span>
          <span>Integration installed but not yet loaded — Restart Home Assistant</span>
        </div>
        <button class="btn btn-primary" ?disabled=${this.restarting} @click=${this.restartHa}>
          ${this.restarting?"Restarting...":"Restart Home Assistant"}
        </button>
        ${this.restartFeedback?g`<p class="saved">${this.restartFeedback}</p>`:y}
      `:g`
        <div class="int-status-row">
          <span class="status-dot red"></span>
          <span>Integration files not found — Restart Home Assistant to complete installation</span>
        </div>
      `}async load(){this.loading=!0,this.error="";try{this.config=await O.config(),this.configuredBridges=await O.getBridges()}catch(i){this.error=i instanceof Error?i.message:String(i)}finally{this.loading=!1}}async loadContainerStatus(){try{this.containerStatus=await O.getContainerStatus()}catch{this.containerStatus=null}}isBridgeConnected(i){var t;if(!((t=this.config)!=null&&t.active_bridge)||this.config.active_bridge.error)return!1;const e=this.config.active_bridge;return e.uuid===i.uuid||e.host===i.host&&e.port===i.port}isBridgeActive(i){return!!i.is_active}async discover(){this.discovering=!0,this.error="",this.newBridgeApiKey="";try{this.discoveredBridges=await O.discoverBridges(),this.discoveredBridges.length===0&&(this.error="No bridges found. Make sure your bridge is powered on and connected to the same network, then try again. You can also use Manual IP to connect directly.")}catch(i){const e=i instanceof Error?i.message:String(i);e==="timeout"?this.error="Scan timed out. Try again or use View Scan Log to see scanned IPs, or use Manual IP to connect directly.":e==="cancelled"?this.error="":this.error=e}finally{this.discovering=!1}}async triggerScan(){this.discovering=!0,this.error="",this.newBridgeApiKey="";try{const i=await O.triggerScan();!i.success&&i.error&&(this.error=i.error),await this.discover()}catch(i){this.error=i instanceof Error?i.message:String(i)}finally{this.discovering=!1}}async viewScanLog(){if(this.showScanLog){this.showScanLog=!1;return}this.scanLogLoading=!0,this.showScanLog=!0;try{this.scanLogContent=await O.getScanLog()||"(empty)"}catch(i){this.scanLogContent=i instanceof Error?i.message:String(i)}finally{this.scanLogLoading=!1}}async selectBridge(i){if(!this.newBridgeApiKey.trim()){this.error="API key is required";return}this.saving=!0,this.error="",this.saved="";try{await O.selectBridge(i.host,i.port,i.name,i.version,this.newBridgeApiKey,i.network_id,i.hostname),this.saved=`Connected to ${i.name||i.host}`,this.discoveredBridges=[],this.newBridgeApiKey="",await this.load()}catch(e){this.error=e instanceof Error?e.message:String(e)}finally{this.saving=!1}}async addManualBridge(){if(!this.manualHost.trim()){this.error="Host is required";return}if(!this.manualPort||this.manualPort<1||this.manualPort>65535){this.error="Valid port is required";return}this.saving=!0,this.error="",this.saved="";try{await O.addBridge(this.manualHost.trim(),this.manualPort,void 0,this.manualApiKey||"",""),this.saved=`Connected to ${this.manualHost}:${this.manualPort}`,this.showManualEntry=!1,this.manualHost="",this.manualPort=80,this.manualApiKey="",await this.load()}catch(i){this.error=i instanceof Error?i.message:String(i)}finally{this.saving=!1}}async deleteBridge(i){this.saving=!0,this.error="";try{await O.deleteBridge(i.uuid),this.saved="Bridge removed",await this.load()}catch(e){this.error=e instanceof Error?e.message:String(e)}finally{this.saving=!1}}async updateBridgeApiKey(i){if(!this.editApiKey.trim()){this.error="API key is required";return}this.saving=!0,this.error="";try{await O.updateBridge(i.uuid,void 0,void 0,void 0,this.editApiKey),this.saved=`API key updated for ${i.name||i.host}`,this.editingBridgeId=null,this.editApiKey="",await this.load()}catch(e){this.error=e instanceof Error?e.message:String(e)}finally{this.saving=!1}}startEditingBridge(i){this.editingBridgeId=i.uuid,this.editApiKey=i.api_key||""}cancelEditing(){this.editingBridgeId=null,this.editApiKey=""}async cleanArtifacts(){this.cleaningArtifacts=!0,this.artifactsMessage="";try{const e=((await O.cleanArtifacts()).total_bytes/(1024*1024)).toFixed(1);this.artifactsMessage=`Cleared ${e} MB of build cache. Next compile will be slower.`,this.loadContainerStatus()}catch(i){this.artifactsMessage=`Error: ${i instanceof Error?i.message:String(i)}`}finally{this.cleaningArtifacts=!1}}async activateBridge(i){this.saving=!0,this.error="",this.saved="";try{await O.activateBridge(i.uuid),this.saved=`Activated ${i.name||i.host}`,await this.load()}catch(e){this.error=e instanceof Error?e.message:String(e)}finally{this.saving=!1}}async deactivateBridge(i){this.saving=!0,this.error="",this.saved="";try{await O.deactivateBridge(i.uuid),this.saved=`Deactivated ${i.name||i.host}`,await this.load()}catch(e){this.error=e instanceof Error?e.message:String(e)}finally{this.saving=!1}}render(){var i,e,t,s,n;return this.loading?g`<section class="card">Loading settings...</section>`:g`
      <section class="card">
        <div class="title">
          <h2>Connection</h2>
        </div>

        <div class="actions">
          <button class="btn btn-primary" ?disabled=${this.discovering} @click=${this.triggerScan}>
            ${this.discovering?g`<span class="spinner"></span> Scanning...`:"Scan Network"}
          </button>
          <button class="btn" ?disabled=${this.saving} @click=${()=>this.showManualEntry=!this.showManualEntry}>
            ${this.showManualEntry?"Cancel":"Manual IP"}
          </button>
          <button class="btn" @click=${this.viewScanLog}>
            ${this.showScanLog?"Hide Scan Log":"View Scan Log"}
          </button>
        </div>

        ${this.showScanLog?g`
          <div class="scan-log">
            <h3>Scan Log</h3>
            ${this.scanLogLoading?g`<p class="info">Loading...</p>`:g`
              <pre class="scan-log-content">${this.scanLogContent}</pre>
            `}
          </div>
        `:y}

        ${this.showManualEntry?g`
          <div class="manual-entry">
            <div class="manual-form">
              <label>
                Host / IP
                <input type="text" placeholder="192.168.1.50 or hostname.local" .value=${this.manualHost} @input=${r=>this.manualHost=r.target.value} />
              </label>
              <label>
                Port
                <input type="number" min="1" max="65535" .value=${String(this.manualPort)} @input=${r=>this.manualPort=Number(r.target.value||80)} />
              </label>
              <label>
                API Key
                <input type="password" placeholder="API Key" .value=${this.manualApiKey} @input=${r=>this.manualApiKey=r.target.value} />
              </label>
            </div>
            <button class="btn btn-primary" ?disabled=${this.saving} @click=${this.addManualBridge}>Connect</button>
          </div>
        `:y}

        ${this.discovering?g`<p class="info">Scanning your network for bridges (8s)...</p>`:y}

        ${this.discoveredBridges.length>0?g`
          <div class="bridge-list">
            <h3>Discovered Bridges</h3>
            <table class="bridge-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Hostname</th>
                  <th>IP</th>
                  <th>Port</th>
                  <th>Network ID</th>
                  <th>API Key</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${this.discoveredBridges.map(r=>g`
                  <tr>
                    <td><strong>${r.name||r.host}</strong></td>
                    <td>${r.hostname||"-"}</td>
                    <td>${r.host}</td>
                    <td>${r.port}</td>
                    <td>${r.network_id||"-"}</td>
                    <td>
                      <input
                        type="password"
                        placeholder="API Key"
                        .value=${this.newBridgeApiKey}
                        @input=${o=>this.newBridgeApiKey=o.target.value}
                      />
                    </td>
                    <td>
                      <button class="btn btn-primary" ?disabled=${this.saving} @click=${()=>this.selectBridge(r)}>
                        Select
                      </button>
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        `:y}

        ${this.configuredBridges.length>0?g`
          <div class="bridge-list-container">
            <h3>Configured Bridges</h3>
            <table class="bridge-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Hostname</th>
                  <th>IP</th>
                  <th>Port</th>
                  <th>Network ID</th>
                  <th>Discovery</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${this.configuredBridges.map(r=>g`
                  <tr class="${this.isBridgeActive(r)?"active-row":""}">
                    <td>
                      <span class="bridge-status ${this.isBridgeConnected(r)?"connected":"disconnected"}">
                        ${this.isBridgeConnected(r)?"connected":"disconnected"}
                      </span>
                      ${this.isBridgeActive(r)?g`<span class="active-badge">Active</span>`:y}
                    </td>
                    <td>${r.hostname||"-"}</td>
                    <td>${r.host}</td>
                    <td>${r.port}</td>
                    <td>${r.network_id||"-"}</td>
                    <td>${r.discovered_via}</td>
                    <td class="actions-cell">
                      ${this.editingBridgeId===r.uuid?g`
                        <input
                          type="password"
                          placeholder="API Key"
                          .value=${this.editApiKey}
                          @input=${o=>this.editApiKey=o.target.value}
                        />
                        <button class="btn btn-primary" ?disabled=${this.saving} @click=${()=>this.updateBridgeApiKey(r)}>Save</button>
                        <button class="btn" ?disabled=${this.saving} @click=${this.cancelEditing}>Cancel</button>
                      `:g`
                        ${this.isBridgeActive(r)?g`<button class="btn" ?disabled=${this.saving} @click=${()=>this.deactivateBridge(r)}>Deactivate</button>`:g`<button class="btn btn-primary" ?disabled=${this.saving} @click=${()=>this.activateBridge(r)}>Activate</button>`}
                        <button class="btn" ?disabled=${this.saving} @click=${()=>this.startEditingBridge(r)}>Edit API Key</button>
                        <button class="btn btn-danger" ?disabled=${this.saving} @click=${()=>this.deleteBridge(r)}>Delete</button>
                      `}
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        `:y}

        ${this.error?g`<p class="error">${this.error}</p>`:y}
        ${this.saved?g`<p class="saved">${this.saved}</p>`:y}
      </section>

      <section class="card integration-status-card">
        <div class="title">
          <h2>Integration Status</h2>
          ${(i=this.config)!=null&&i.integration?g`
            <span class="integration-version">v${this.config.integration.version||"?"}</span>
          `:y}
        </div>
        ${this.renderIntegrationStatus()}
        <div class="actions">
          <a href="#/activity-log" class="btn">
            Activity Log
            <span class="sub">Bridge/remote/protobuf events</span>
          </a>
        </div>
      </section>

      <section class="card">
        <div class="title">
          <h2>ESPHome</h2>
        </div>

        <div class="current">
          <div><span>Status</span><strong class=${(e=this.containerStatus)!=null&&e.available?"ok":"danger"}>${(t=this.containerStatus)!=null&&t.available?"Available":"Unavailable"}</strong></div>
          <div><span>ESPHome</span><strong>${((s=this.containerStatus)==null?void 0:s.tag)||"unknown"}</strong></div>
          ${(n=this.containerStatus)!=null&&n.error?g`<div><span>Error</span><strong>${this.containerStatus.error}</strong></div>`:y}
        </div>

        <div class="actions">
          <button class="btn btn-danger" ?disabled=${this.cleaningArtifacts} @click=${this.cleanArtifacts}>Clean build artifacts</button>
        </div>

        ${this.artifactsMessage?g`<p class="info">${this.artifactsMessage}</p>`:y}

        <p class="hint">Clean build artifacts removes PlatformIO cache and ESPHome build output. Useful for freeing space or resolving stale build state.</p>
      </section>
    `}};Y.styles=me`
    .card {
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 12px;
      box-shadow: var(--shadow);
      padding: 16px 20px;
      display: grid;
      gap: 16px;
      margin-bottom: 16px;
    }

    .title span,
    .current span {
      color: var(--primary);
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 600;
    }

    h2 {
      margin: 3px 0 0;
      font-size: 16px;
      font-weight: 600;
    }

    h3 {
      margin: 8px 0 4px;
      font-size: 13px;
      font-weight: 600;
      color: var(--muted);
    }

    .current {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 8px;
    }

    .current > div {
      background: #f8fafc;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid #f1f5f9;
    }

    .current span {
      display: block;
      color: #94a3b8;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .current strong {
      display: block;
      margin-top: 4px;
      overflow-wrap: anywhere;
      font-size: 14px;
      font-weight: 500;
    }

    .ok { color: var(--ok); }
    .danger { color: var(--danger); }

    .bridge-list-container {
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 12px;
      box-shadow: var(--shadow);
      padding: 16px 20px;
      margin-bottom: 16px;
    }

    .bridge-list {
      background: #f8fafc;
      border: 1px solid #f1f5f9;
      border-radius: 8px;
      padding: 12px;
    }

    .bridge-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .bridge-table th {
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 600;
      padding: 6px 8px;
      border-bottom: 2px solid var(--line);
    }

    .bridge-table td {
      padding: 8px;
      border-bottom: 1px solid #f1f5f9;
    }

    .bridge-table tr:last-child td {
      border-bottom: none;
    }

    .bridge-table .actions-cell {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
    }

    .bridge-table input[type="password"] {
      padding: 4px 8px;
      font-size: 12px;
      border: 1px solid var(--line);
      border-radius: 6px;
    }

    .bridge-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #f1f5f9;
      gap: 12px;
    }

    .bridge-item:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .bridge-item:first-child {
      padding-top: 0;
    }

    .bridge-item.default {
      background: #dcfce7;
      margin: -12px;
      padding: 10px 12px;
      border-radius: 8px;
    }

    .bridge-info {
      display: flex;
      flex-direction: row;
      gap: 12px;
      align-items: center;
    }

    .bridge-info strong {
      font-size: 14px;
      font-weight: 600;
    }

    .bridge-info span {
      font-size: 12px;
      color: var(--muted);
    }

    .bridge-info .version {
      color: var(--ok);
    }

    .bridge-info .via {
      font-size: 11px;
      text-transform: uppercase;
    }

    .bridge-status {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid;
    }

    .bridge-status.connected {
      color: var(--ok);
      border-color: var(--ok);
      background: #dcfce7;
    }

    .bridge-status.disconnected {
      color: var(--danger);
      border-color: var(--danger);
      background: #fee2e2;
    }

    .active-badge {
      color: var(--ok);
      background: #dcfce7;
      border: 1px solid var(--ok);
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      padding: 3px 8px;
      text-transform: uppercase;
    }

    .bridge-form {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .manual-entry {
      background: #f8fafc;
      border: 1px solid #f1f5f9;
      border-radius: 8px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .manual-form {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 100px;
      gap: 12px;
    }

    .manual-form label {
      display: grid;
      gap: 4px;
      font-weight: 500;
      font-size: 13px;
    }

    .manual-form input {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      min-height: 38px;
      padding: 8px 12px;
      font: inherit;
      font-size: 14px;
      background: var(--surface);
      color: var(--ink);
    }

    .manual-form input:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(11,59,75,0.1);
    }

    .bridge-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }

    .unavailable-note {
      background: #fef2f2;
      border: 1px solid var(--danger);
      padding: 12px;
      border-radius: 8px;
    }
    .unavailable-note strong {
      color: var(--danger);
      font-size: 14px;
      display: block;
      margin-bottom: 4px;
    }
    .unavailable-note p {
      margin: 2px 0;
      font-size: 12px;
      color: var(--ink);
    }

    .form {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 140px;
      gap: 12px;
    }

    label {
      display: grid;
      gap: 4px;
      font-weight: 500;
      font-size: 13px;
    }

    input[type="text"],
    input[type="password"] {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      min-height: 38px;
      padding: 8px 12px;
      font: inherit;
      font-size: 14px;
      background: var(--surface);
      color: var(--ink);
      transition: border-color 0.12s;
    }

    input:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(11,59,75,0.1);
    }

    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      transition: all 0.12s;
      min-height: 38px;
    }

    .btn:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }

    a.btn {
      display: inline-flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      text-decoration: none;
    }

    a.btn .sub {
      font-size: 10px;
      font-weight: 400;
      color: var(--muted);
      line-height: 1;
    }

    .btn-primary {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }

    .btn-primary:hover {
      background: #0d4d5e;
    }

    .btn-danger {
      background: var(--danger);
      color: #fff;
      border-color: var(--danger);
    }

    .btn-danger:hover {
      background: #dc2626;
    }

    button:disabled,
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error,
    .saved,
    .info {
      margin: 0;
      font-weight: 500;
      font-size: 13px;
    }

    .error {
      color: var(--danger);
      padding: 10px 12px;
      background: #fef2f2;
      border: 1px solid var(--danger);
      border-radius: 6px;
    }

    .saved {
      color: var(--ok);
      padding: 10px 12px;
      background: #dcfce7;
      border: 1px solid var(--ok);
      border-radius: 6px;
    }

    .info {
      color: var(--primary);
    }

    .hint {
      font-size: 11px;
      color: var(--muted);
      margin: 0;
    }

    .toggle-row {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .toggle {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
    }

    .toggle input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: var(--primary);
      cursor: pointer;
    }

    .toggle-label {
      font-weight: 500;
      font-size: 14px;
    }

    .scan-log {
      margin-top: 12px;
    }

    .scan-log h3 {
      margin: 0 0 8px;
      font-size: 14px;
      font-weight: 600;
    }

    .scan-log-content {
      background: #1e293b;
      color: #e2e8f0;
      padding: 12px;
      border-radius: 6px;
      font-family: 'Menlo', 'Consolas', monospace;
      font-size: 12px;
      line-height: 1.5;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 400px;
      overflow-y: auto;
      margin: 0;
    }

    .integration-version {
      font-size: 11px;
      color: var(--muted);
      font-weight: 400;
      margin-left: 8px;
    }

    .int-status-row {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
    }

    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .status-dot.red { background: #ef4444; }
    .status-dot.yellow { background: #eab308; }
    .status-dot.gray { background: #9ca3af; }
    .status-dot.green { background: #22c55e; }

    .status-dot.green.pulse {
      animation: pulse-green 2s ease-in-out infinite;
    }

    @keyframes pulse-green {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(0.85); }
    }

    .int-status-note {
      font-size: 13px;
    }

    .int-configure-hint {
      margin-top: 8px;
      padding: 12px;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #f1f5f9;
    }

    .int-configure-hint strong {
      display: block;
      font-size: 14px;
      margin-bottom: 4px;
    }

    .int-configure-hint p {
      margin: 0;
      font-size: 13px;
      color: #64748b;
    }

    .int-connected-box {
      border: 2px solid #22c55e;
      border-radius: 10px;
      padding: 14px 16px;
      background: #f0fdf4;
    }

    .int-connected-header {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .int-connected-label {
      font-size: 15px;
      font-weight: 600;
      color: #166534;
    }

    .int-connected-counts {
      margin-top: 6px;
      display: flex;
      gap: 16px;
      font-size: 13px;
      color: #15803d;
    }

    .muted {
      color: var(--muted);
    }

    @media (max-width: 760px) {
      .current,
      .form,
      .manual-form {
        grid-template-columns: 1fr;
      }

      .bridge-item,
      .bridge-form,
      .bridge-actions {
        align-items: stretch;
        flex-direction: column;
      }

      .bridge-info {
        align-items: flex-start;
        flex-direction: column;
        gap: 6px;
      }
    }
  `;te([Q({type:Boolean})],Y.prototype,"autoInit",2);te([w()],Y.prototype,"config",2);te([w()],Y.prototype,"configuredBridges",2);te([w()],Y.prototype,"discoveredBridges",2);te([w()],Y.prototype,"loading",2);te([w()],Y.prototype,"discovering",2);te([w()],Y.prototype,"saving",2);te([w()],Y.prototype,"error",2);te([w()],Y.prototype,"saved",2);te([w()],Y.prototype,"containerStatus",2);te([w()],Y.prototype,"cleaningArtifacts",2);te([w()],Y.prototype,"artifactsMessage",2);te([w()],Y.prototype,"editingBridgeId",2);te([w()],Y.prototype,"editApiKey",2);te([w()],Y.prototype,"newBridgeApiKey",2);te([w()],Y.prototype,"showManualEntry",2);te([w()],Y.prototype,"manualHost",2);te([w()],Y.prototype,"manualPort",2);te([w()],Y.prototype,"manualApiKey",2);te([w()],Y.prototype,"showScanLog",2);te([w()],Y.prototype,"scanLogContent",2);te([w()],Y.prototype,"scanLogLoading",2);te([w()],Y.prototype,"restarting",2);te([w()],Y.prototype,"restartFeedback",2);Y=te([be("esp-settings")],Y);var Fp=Object.defineProperty,Hp=Object.getOwnPropertyDescriptor,Bi=(i,e,t,s)=>{for(var n=s>1?void 0:s?Hp(e,t):e,r=i.length-1,o;r>=0;r--)(o=i[r])&&(n=(s?o(e,t,n):o(n))||n);return s&&n&&Fp(e,t,n),n};let Rt=class extends ne{constructor(){super(...arguments),this.queueData=null,this.compileData=null,this.error="",this.busyJob=null,this.busyAction="",this.showAbortModal=!1,this.pollTimer=null}connectedCallback(){super.connectedCallback(),this.fetchQueue(),this.pollTimer=setInterval(()=>this.fetchQueue(),2e3)}disconnectedCallback(){this.pollTimer&&(clearInterval(this.pollTimer),this.pollTimer=null),super.disconnectedCallback()}async fetchQueue(){try{const[i,e]=await Promise.all([O.getQueue(),O.getCompileQueue()]);this.queueData=i,this.compileData=e}catch{}}async pauseQueue(){this.busyAction="pause",this.error="";try{await O.pauseQueue(),await this.fetchQueue()}catch(i){this.error=i instanceof Error?i.message:String(i)}finally{this.busyAction=""}}async resumeQueue(){this.busyAction="resume",this.error="";try{await O.resumeQueue(),await this.fetchQueue()}catch(i){this.error=i instanceof Error?i.message:String(i)}finally{this.busyAction=""}}async abortQueuedJob(i){this.busyJob=i,this.error="";try{await O.abortQueuedJob(i),await this.fetchQueue()}catch(e){this.error=e instanceof Error?e.message:String(e)}finally{this.busyJob=null}}async abortCompileJob(i){this.busyJob=i,this.error="";try{await O.abortCompileJob(i),await this.fetchQueue()}catch(e){this.error=e instanceof Error?e.message:String(e)}finally{this.busyJob=null}}async moveUp(i){this.busyJob=i,this.error="";try{await O.reorderJobUp(i),await this.fetchQueue()}catch(e){this.error=e instanceof Error?e.message:String(e)}finally{this.busyJob=null}}async abortActiveJob(){this.busyAction="abort-active",this.error="";try{if((await O.getQueue()).count>0){this.showAbortModal=!0;return}await O.abortOta(),await this.fetchQueue()}catch(i){this.error=i instanceof Error?i.message:String(i)}finally{this.busyAction=""}}async abortActiveAndContinue(){this.showAbortModal=!1;try{await O.abortOta(),await this.fetchQueue()}catch(i){this.error=i instanceof Error?i.message:String(i)}}async abortActiveAndPause(){this.showAbortModal=!1;try{await O.abortOta(),await O.pauseQueue(),await this.fetchQueue()}catch(i){this.error=i instanceof Error?i.message:String(i)}}navigateToDevice(i){window.location.hash=`/device/${encodeURIComponent(i)}`}navigateToJob(i){window.location.hash=`/job/${i.id}?from=${encodeURIComponent("/queue")}`}async moveDown(i){this.busyJob=i,this.error="";try{await O.reorderJobDown(i),await this.fetchQueue()}catch(e){this.error=e instanceof Error?e.message:String(e)}finally{this.busyJob=null}}render(){var l,h,c;const i=this.queueData,e=!!(i!=null&&i.active_job)&&!["success","failed","aborted","rejoin_timeout","version_mismatch"].includes(i.active_job.status),t=(i==null?void 0:i.queued_jobs)??[],s=(i==null?void 0:i.paused)??!1,n=t.length+(e?1:0),r=((l=this.compileData)==null?void 0:l.active_job)??null,o=((h=this.compileData)==null?void 0:h.queued_jobs)??[],a=((c=this.compileData)==null?void 0:c.count)??0;return g`
      <section>
        <div class="title-row">
          <div>
            <h2>Compile Queue</h2>
          </div>
        </div>

        ${this.error?g`<p class="error">${this.error}</p>`:y}

        ${a===0?g`<p class="empty">No compiles in progress or queued.</p>`:y}

        ${r?this.renderCompileActiveRow(r):y}
        ${o.map((d,f)=>this.renderCompileQueuedRow(d,f+2))}
      </section>

      <section>
        <div class="title-row">
          <div>
            <h2>Firmware Flash Queue</h2>
          </div>
          <div class="controls">
            ${s?g`<button class="btn btn-resume" ?disabled=${this.busyAction==="resume"} @click=${this.resumeQueue}>▶ Resume</button>`:g`<button class="btn btn-pause" ?disabled=${this.busyAction==="pause"} @click=${this.pauseQueue}>⏸ Pause</button>`}
            ${s?g`<span class="pause-badge">PAUSED</span>`:y}
          </div>
        </div>

        ${n===0&&!e?g`<p class="empty">No firmware flashes in progress or queued.</p>`:y}

        ${e||t.length>0?g`
              <div class="table">
                ${e&&i.active_job?this.renderActiveRow(i.active_job):y}
                ${t.map((d,f)=>this.renderQueuedRow(d,f+2,t.length))}
              </div>
            `:y}
      </section>

      ${this.showAbortModal?this.renderAbortModal():y}
    `}renderCompileActiveRow(i){const e=i.device_label||i.esphome_name||i.mac;return g`
      <article class="compile-active-row">
        <div class="device-info clickable" @click=${()=>this.navigateToDevice(i.mac)}>
          <strong>&#9881; ${e}</strong>
          <small>Compiling...</small>
        </div>
        <div class="progress-cell">
          <small>COMPILING</small>
        </div>
        <div class="actions">
          <button class="btn" @click=${()=>this.navigateToJob(i)}>View log</button>
          <button class="btn btn-abort" ?disabled=${this.busyJob===i.id} @click=${()=>this.abortCompileJob(i.id)}>Abort</button>
        </div>
      </article>
    `}renderCompileQueuedRow(i,e){const t=this.busyJob===i.id,s=i.device_label||i.esphome_name||i.mac;return g`
      <article class="compile-queued-row">
        <div class="device-info clickable" @click=${()=>this.navigateToDevice(i.mac)}>
          <strong>${e}. ${s}</strong>
          <small>Waiting to compile</small>
        </div>
        <div class="progress-cell">
          <small>QUEUED</small>
        </div>
        <div class="actions">
          <button ?disabled=${t} @click=${()=>this.abortCompileJob(i.id)}>&#10005;</button>
        </div>
      </article>
    `}renderAbortModal(){return g`
      <div class="modal-backdrop" @click=${()=>{this.showAbortModal=!1}}>
        <div class="modal" @click=${i=>i.stopPropagation()}>
          <h3>Other queued jobs waiting</h3>
          <p>Continue running the next queued job after aborting this one?</p>
          <div class="modal-actions">
            <button class="continue" @click=${this.abortActiveAndContinue}>Yes, continue queue</button>
            <button class="btn btn-abort" @click=${this.abortActiveAndPause}>No, pause queue</button>
            <button @click=${()=>{this.showAbortModal=!1}}>Cancel</button>
          </div>
        </div>
      </div>
    `}renderActiveRow(i){const e=(i.bridge_state||i.status).replaceAll("_"," "),t=i.percent??0,s=i.device_label||i.mac;return g`
      <article class="active-row">
        <div class="device-info clickable" @click=${()=>this.navigateToDevice(i.mac)}>
          <strong>① ${s}</strong>
          <small>${i.firmware_name||"firmware.ota.bin"}</small>
        </div>
        <div class="progress-cell">
          <div class="progress-wrap"><div class="progress-fill" style="width: ${t}%"></div></div>
          <small>${e} · ${t}%</small>
        </div>
        <div class="actions">
          <button class="btn" @click=${()=>this.navigateToJob(i)}>View log</button>
          <button class="btn btn-abort" ?disabled=${this.busyAction==="abort-active"} @click=${this.abortActiveJob}>Abort</button>
        </div>
      </article>
    `}renderQueuedRow(i,e,t){const s=this.busyJob===i.id,n=i.device_label||i.mac;return g`
      <article class="queued-row">
        <div class="device-info clickable" @click=${()=>this.navigateToDevice(i.mac)}>
          <strong>${e}. ${n}</strong>
          <small>${i.firmware_name||"firmware.ota.bin"} · ${wi(i.firmware_size)}</small>
        </div>
        <div class="progress-cell">
          <div class="progress-wrap queued"><div class="progress-fill queued" style="width: 0%"></div></div>
          <small>Queued</small>
        </div>
        <div class="actions">
          <button ?disabled=${s} @click=${()=>this.abortQueuedJob(i.id)}>✕</button>
          ${e>2?g`<button ?disabled=${s} @click=${()=>this.moveUp(i.id)}>▲</button>`:y}
          ${e<t+1?g`<button ?disabled=${s} @click=${()=>this.moveDown(i.id)}>▼</button>`:y}
        </div>
      </article>
    `}};Rt.styles=me`
    section {
      display: grid;
      gap: 16px;
    }

    .card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 12px;
      box-shadow: var(--shadow);
      padding: 16px 20px;
    }

    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }

    .title-row span {
      color: var(--primary);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .title-row h2 {
      margin: 2px 0 0;
      font-size: 16px;
      font-weight: 600;
    }

    .controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .pause-badge {
      background: var(--accent);
      color: #fff;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      border-radius: 20px;
    }

    .table {
      display: grid;
      gap: 8px;
    }

    article {
      display: grid;
      grid-template-columns: 1.5fr 1fr auto;
      gap: 12px;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px 16px;
      background: var(--surface);
    }

    .active-row {
      background: #f0f9ff;
      border-color: #bae6fd;
    }

    .compile-active-row {
      background: #f0f9ff;
      border-color: var(--primary);
    }

    .queued-row {
      background: #fffbeb;
      border-color: #fde68a;
    }

    .compile-queued-row {
      background: #fffbeb;
      border-color: var(--accent);
    }

    .device-info strong {
      display: block;
      overflow-wrap: anywhere;
      font-size: 14px;
      font-weight: 600;
    }

    .device-info.clickable {
      cursor: pointer;
    }

    .device-info.clickable:hover strong {
      text-decoration: underline;
    }

    .device-info small {
      color: var(--muted);
      font-size: 12px;
    }

    .progress-cell {
      display: grid;
      gap: 4px;
    }

    .progress-wrap {
      width: 100%;
      height: 8px;
      background: var(--line);
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--primary);
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .progress-fill.queued {
      background: var(--accent);
    }

    .progress-cell small {
      color: var(--muted);
      font-size: 11px;
    }

    .actions {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      transition: all 0.12s;
      min-height: 32px;
    }

    .btn:hover {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }

    .btn-pause {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }

    .btn-pause:hover {
      background: #e68a00;
    }

    .btn-resume {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }

    .btn-resume:hover {
      background: #0d4d5e;
    }

    .btn-abort {
      background: var(--danger);
      color: #fff;
      border-color: var(--danger);
    }

    .btn-abort:hover {
      background: #dc2626;
    }

    button:disabled,
    .btn:disabled {
      opacity: 0.48;
      cursor: not-allowed;
    }

    .empty,
    .error {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
    }

    .error {
      color: var(--danger);
      font-weight: 500;
      padding: 12px;
      border: 1px solid var(--danger);
      background: #fef2f2;
      border-radius: 8px;
    }

    @media (max-width: 720px) {
      article {
        grid-template-columns: 1fr;
        align-items: stretch;
      }
      .actions {
        justify-content: flex-start;
      }
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 20px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    .modal h3 {
      margin: 0 0 8px 0;
      font-size: 16px;
      font-weight: 600;
    }

    .modal p {
      margin: 0 0 16px 0;
      font-size: 14px;
      color: var(--muted);
    }

    .modal-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
  `;Bi([w()],Rt.prototype,"queueData",2);Bi([w()],Rt.prototype,"compileData",2);Bi([w()],Rt.prototype,"error",2);Bi([w()],Rt.prototype,"busyJob",2);Bi([w()],Rt.prototype,"busyAction",2);Bi([w()],Rt.prototype,"showAbortModal",2);Rt=Bi([be("esp-queue-page")],Rt);let Eo=[],Hc=[];(()=>{let i="lc,34,7n,7,7b,19,,,,2,,2,,,20,b,1c,l,g,,2t,7,2,6,2,2,,4,z,,u,r,2j,b,1m,9,9,,o,4,,9,,3,,5,17,3,3b,f,,w,1j,,,,4,8,4,,3,7,a,2,t,,1m,,,,2,4,8,,9,,a,2,q,,2,2,1l,,4,2,4,2,2,3,3,,u,2,3,,b,2,1l,,4,5,,2,4,,k,2,m,6,,,1m,,,2,,4,8,,7,3,a,2,u,,1n,,,,c,,9,,14,,3,,1l,3,5,3,,4,7,2,b,2,t,,1m,,2,,2,,3,,5,2,7,2,b,2,s,2,1l,2,,,2,4,8,,9,,a,2,t,,20,,4,,2,3,,,8,,29,,2,7,c,8,2q,,2,9,b,6,22,2,r,,,,,,1j,e,,5,,2,5,b,,10,9,,2u,4,,6,,2,2,2,p,2,4,3,g,4,d,,2,2,6,,f,,jj,3,qa,3,t,3,t,2,u,2,1s,2,,7,8,,2,b,9,,19,3,3b,2,y,,3a,3,4,2,9,,6,3,63,2,2,,1m,,,7,,,,,2,8,6,a,2,,1c,h,1r,4,1c,7,,,5,,14,9,c,2,w,4,2,2,,3,1k,,,2,3,,,3,1m,8,2,2,48,3,,d,,7,4,,6,,3,2,5i,1m,,5,ek,,5f,x,2da,3,3x,,2o,w,fe,6,2x,2,n9w,4,,a,w,2,28,2,7k,,3,,4,,p,2,5,,47,2,q,i,d,,12,8,p,b,1a,3,1c,,2,4,2,2,13,,1v,6,2,2,2,2,c,,8,,1b,,1f,,,3,2,2,5,2,,,16,2,8,,6m,,2,,4,,fn4,,kh,g,g,g,a6,2,gt,,6a,,45,5,1ae,3,,2,5,4,14,3,4,,4l,2,fx,4,ar,2,49,b,4w,,1i,f,1k,3,1d,4,2,2,1x,3,10,5,,8,1q,,c,2,1g,9,a,4,2,,2n,3,2,,,2,6,,4g,,3,8,l,2,1l,2,,,,,m,,e,7,3,5,5f,8,2,3,,,n,,29,,2,6,,,2,,,2,,2,6j,,2,4,6,2,,2,r,2,2d,8,2,,,2,2y,,,,2,6,,,2t,3,2,4,,5,77,9,,2,6t,,a,2,,,4,,40,4,2,2,4,,w,a,14,6,2,4,8,,9,6,2,3,1a,d,,2,ba,7,,6,,,2a,m,2,7,,2,,2,3e,6,3,,,2,,7,,,20,2,3,,,,9n,2,f0b,5,1n,7,t4,,1r,4,29,,f5k,2,43q,,,3,4,5,8,8,2,7,u,4,44,3,1iz,1j,4,1e,8,,e,,m,5,,f,11s,7,,h,2,7,,2,,5,79,7,c5,4,15s,7,31,7,240,5,gx7k,2o,3k,6o".split(",").map(e=>e?parseInt(e,36):1);for(let e=0,t=0;e<i.length;e++)(e%2?Hc:Eo).push(t=t+i[e])})();function Wp(i){if(i<768)return!1;for(let e=0,t=Eo.length;;){let s=e+t>>1;if(i<Eo[s])t=s;else if(i>=Hc[s])e=s+1;else return!0;if(e==t)return!1}}function Ll(i){return i>=127462&&i<=127487}const Il=8205;function qp(i,e,t=!0,s=!0){return(t?Wc:Qp)(i,e,s)}function Wc(i,e,t){if(e==i.length)return e;e&&qc(i.charCodeAt(e))&&Qc(i.charCodeAt(e-1))&&e--;let s=Yr(i,e);for(e+=Nl(s);e<i.length;){let n=Yr(i,e);if(s==Il||n==Il||t&&Wp(n))e+=Nl(n),s=n;else if(Ll(n)){let r=0,o=e-2;for(;o>=0&&Ll(Yr(i,o));)r++,o-=2;if(r%2==0)break;e+=2}else break}return e}function Qp(i,e,t){for(;e>0;){let s=Wc(i,e-2,t);if(s<e)return s;e--}return 0}function Yr(i,e){let t=i.charCodeAt(e);if(!Qc(t)||e+1==i.length)return t;let s=i.charCodeAt(e+1);return qc(s)?(t-55296<<10)+(s-56320)+65536:t}function qc(i){return i>=56320&&i<57344}function Qc(i){return i>=55296&&i<56320}function Nl(i){return i<65536?1:2}class V{lineAt(e){if(e<0||e>this.length)throw new RangeError(`Invalid position ${e} in document of length ${this.length}`);return this.lineInner(e,!1,1,0)}line(e){if(e<1||e>this.lines)throw new RangeError(`Invalid line number ${e} in ${this.lines}-line document`);return this.lineInner(e,!0,1,0)}replace(e,t,s){[e,t]=ss(this,e,t);let n=[];return this.decompose(0,e,n,2),s.length&&s.decompose(0,s.length,n,3),this.decompose(t,this.length,n,1),bt.from(n,this.length-(t-e)+s.length)}append(e){return this.replace(this.length,this.length,e)}slice(e,t=this.length){[e,t]=ss(this,e,t);let s=[];return this.decompose(e,t,s,0),bt.from(s,t-e)}eq(e){if(e==this)return!0;if(e.length!=this.length||e.lines!=this.lines)return!1;let t=this.scanIdentical(e,1),s=this.length-this.scanIdentical(e,-1),n=new As(this),r=new As(e);for(let o=t,a=t;;){if(n.next(o),r.next(o),o=0,n.lineBreak!=r.lineBreak||n.done!=r.done||n.value!=r.value)return!1;if(a+=n.value.length,n.done||a>=s)return!0}}iter(e=1){return new As(this,e)}iterRange(e,t=this.length){return new Vc(this,e,t)}iterLines(e,t){let s;if(e==null)s=this.iter();else{t==null&&(t=this.lines+1);let n=this.line(e).from;s=this.iterRange(n,Math.max(n,t==this.lines+1?this.length:t<=1?0:this.line(t-1).to))}return new Uc(s)}toString(){return this.sliceString(0)}toJSON(){let e=[];return this.flatten(e),e}constructor(){}static of(e){if(e.length==0)throw new RangeError("A document must have at least one line");return e.length==1&&!e[0]?V.empty:e.length<=32?new le(e):bt.from(le.split(e,[]))}}class le extends V{constructor(e,t=Vp(e)){super(),this.text=e,this.length=t}get lines(){return this.text.length}get children(){return null}lineInner(e,t,s,n){for(let r=0;;r++){let o=this.text[r],a=n+o.length;if((t?s:a)>=e)return new Up(n,a,s,o);n=a+1,s++}}decompose(e,t,s,n){let r=e<=0&&t>=this.length?this:new le(zl(this.text,e,t),Math.min(t,this.length)-Math.max(0,e));if(n&1){let o=s.pop(),a=Hn(r.text,o.text.slice(),0,r.length);if(a.length<=32)s.push(new le(a,o.length+r.length));else{let l=a.length>>1;s.push(new le(a.slice(0,l)),new le(a.slice(l)))}}else s.push(r)}replace(e,t,s){if(!(s instanceof le))return super.replace(e,t,s);[e,t]=ss(this,e,t);let n=Hn(this.text,Hn(s.text,zl(this.text,0,e)),t),r=this.length+s.length-(t-e);return n.length<=32?new le(n,r):bt.from(le.split(n,[]),r)}sliceString(e,t=this.length,s=`
`){[e,t]=ss(this,e,t);let n="";for(let r=0,o=0;r<=t&&o<this.text.length;o++){let a=this.text[o],l=r+a.length;r>e&&o&&(n+=s),e<l&&t>r&&(n+=a.slice(Math.max(0,e-r),t-r)),r=l+1}return n}flatten(e){for(let t of this.text)e.push(t)}scanIdentical(){return 0}static split(e,t){let s=[],n=-1;for(let r of e)s.push(r),n+=r.length+1,s.length==32&&(t.push(new le(s,n)),s=[],n=-1);return n>-1&&t.push(new le(s,n)),t}}class bt extends V{constructor(e,t){super(),this.children=e,this.length=t,this.lines=0;for(let s of e)this.lines+=s.lines}lineInner(e,t,s,n){for(let r=0;;r++){let o=this.children[r],a=n+o.length,l=s+o.lines-1;if((t?l:a)>=e)return o.lineInner(e,t,s,n);n=a+1,s=l+1}}decompose(e,t,s,n){for(let r=0,o=0;o<=t&&r<this.children.length;r++){let a=this.children[r],l=o+a.length;if(e<=l&&t>=o){let h=n&((o<=e?1:0)|(l>=t?2:0));o>=e&&l<=t&&!h?s.push(a):a.decompose(e-o,t-o,s,h)}o=l+1}}replace(e,t,s){if([e,t]=ss(this,e,t),s.lines<this.lines)for(let n=0,r=0;n<this.children.length;n++){let o=this.children[n],a=r+o.length;if(e>=r&&t<=a){let l=o.replace(e-r,t-r,s),h=this.lines-o.lines+l.lines;if(l.lines<h>>4&&l.lines>h>>6){let c=this.children.slice();return c[n]=l,new bt(c,this.length-(t-e)+s.length)}return super.replace(r,a,l)}r=a+1}return super.replace(e,t,s)}sliceString(e,t=this.length,s=`
`){[e,t]=ss(this,e,t);let n="";for(let r=0,o=0;r<this.children.length&&o<=t;r++){let a=this.children[r],l=o+a.length;o>e&&r&&(n+=s),e<l&&t>o&&(n+=a.sliceString(e-o,t-o,s)),o=l+1}return n}flatten(e){for(let t of this.children)t.flatten(e)}scanIdentical(e,t){if(!(e instanceof bt))return 0;let s=0,[n,r,o,a]=t>0?[0,0,this.children.length,e.children.length]:[this.children.length-1,e.children.length-1,-1,-1];for(;;n+=t,r+=t){if(n==o||r==a)return s;let l=this.children[n],h=e.children[r];if(l!=h)return s+l.scanIdentical(h,t);s+=l.length+1}}static from(e,t=e.reduce((s,n)=>s+n.length+1,-1)){let s=0;for(let u of e)s+=u.lines;if(s<32){let u=[];for(let p of e)p.flatten(u);return new le(u,t)}let n=Math.max(32,s>>5),r=n<<1,o=n>>1,a=[],l=0,h=-1,c=[];function d(u){let p;if(u.lines>r&&u instanceof bt)for(let m of u.children)d(m);else u.lines>o&&(l>o||!l)?(f(),a.push(u)):u instanceof le&&l&&(p=c[c.length-1])instanceof le&&u.lines+p.lines<=32?(l+=u.lines,h+=u.length+1,c[c.length-1]=new le(p.text.concat(u.text),p.length+1+u.length)):(l+u.lines>n&&f(),l+=u.lines,h+=u.length+1,c.push(u))}function f(){l!=0&&(a.push(c.length==1?c[0]:bt.from(c,h)),h=-1,l=c.length=0)}for(let u of e)d(u);return f(),a.length==1?a[0]:new bt(a,t)}}V.empty=new le([""],0);function Vp(i){let e=-1;for(let t of i)e+=t.length+1;return e}function Hn(i,e,t=0,s=1e9){for(let n=0,r=0,o=!0;r<i.length&&n<=s;r++){let a=i[r],l=n+a.length;l>=t&&(l>s&&(a=a.slice(0,s-n)),n<t&&(a=a.slice(t-n)),o?(e[e.length-1]+=a,o=!1):e.push(a)),n=l+1}return e}function zl(i,e,t){return Hn(i,[""],e,t)}class As{constructor(e,t=1){this.dir=t,this.done=!1,this.lineBreak=!1,this.value="",this.nodes=[e],this.offsets=[t>0?1:(e instanceof le?e.text.length:e.children.length)<<1]}nextInner(e,t){for(this.done=this.lineBreak=!1;;){let s=this.nodes.length-1,n=this.nodes[s],r=this.offsets[s],o=r>>1,a=n instanceof le?n.text.length:n.children.length;if(o==(t>0?a:0)){if(s==0)return this.done=!0,this.value="",this;t>0&&this.offsets[s-1]++,this.nodes.pop(),this.offsets.pop()}else if((r&1)==(t>0?0:1)){if(this.offsets[s]+=t,e==0)return this.lineBreak=!0,this.value=`
`,this;e--}else if(n instanceof le){let l=n.text[o+(t<0?-1:0)];if(this.offsets[s]+=t,l.length>Math.max(0,e))return this.value=e==0?l:t>0?l.slice(e):l.slice(0,l.length-e),this;e-=l.length}else{let l=n.children[o+(t<0?-1:0)];e>l.length?(e-=l.length,this.offsets[s]+=t):(t<0&&this.offsets[s]--,this.nodes.push(l),this.offsets.push(t>0?1:(l instanceof le?l.text.length:l.children.length)<<1))}}}next(e=0){return e<0&&(this.nextInner(-e,-this.dir),e=this.value.length),this.nextInner(e,this.dir)}}class Vc{constructor(e,t,s){this.value="",this.done=!1,this.cursor=new As(e,t>s?-1:1),this.pos=t>s?e.length:0,this.from=Math.min(t,s),this.to=Math.max(t,s)}nextInner(e,t){if(t<0?this.pos<=this.from:this.pos>=this.to)return this.value="",this.done=!0,this;e+=Math.max(0,t<0?this.pos-this.to:this.from-this.pos);let s=t<0?this.pos-this.from:this.to-this.pos;e>s&&(e=s),s-=e;let{value:n}=this.cursor.next(e);return this.pos+=(n.length+e)*t,this.value=n.length<=s?n:t<0?n.slice(n.length-s):n.slice(0,s),this.done=!this.value,this}next(e=0){return e<0?e=Math.max(e,this.from-this.pos):e>0&&(e=Math.min(e,this.to-this.pos)),this.nextInner(e,this.cursor.dir)}get lineBreak(){return this.cursor.lineBreak&&this.value!=""}}class Uc{constructor(e){this.inner=e,this.afterBreak=!0,this.value="",this.done=!1}next(e=0){let{done:t,lineBreak:s,value:n}=this.inner.next(e);return t&&this.afterBreak?(this.value="",this.afterBreak=!1):t?(this.done=!0,this.value=""):s?this.afterBreak?this.value="":(this.afterBreak=!0,this.next()):(this.value=n,this.afterBreak=!1),this}get lineBreak(){return!1}}typeof Symbol<"u"&&(V.prototype[Symbol.iterator]=function(){return this.iter()},As.prototype[Symbol.iterator]=Vc.prototype[Symbol.iterator]=Uc.prototype[Symbol.iterator]=function(){return this});class Up{constructor(e,t,s,n){this.from=e,this.to=t,this.number=s,this.text=n}get length(){return this.to-this.from}}function ss(i,e,t){return e=Math.max(0,Math.min(i.length,e)),[e,Math.max(e,Math.min(i.length,t))]}function xe(i,e,t=!0,s=!0){return qp(i,e,t,s)}function jp(i){return i>=56320&&i<57344}function Xp(i){return i>=55296&&i<56320}function Be(i,e){let t=i.charCodeAt(e);if(!Xp(t)||e+1==i.length)return t;let s=i.charCodeAt(e+1);return jp(s)?(t-55296<<10)+(s-56320)+65536:t}function La(i){return i<=65535?String.fromCharCode(i):(i-=65536,String.fromCharCode((i>>10)+55296,(i&1023)+56320))}function yt(i){return i<65536?1:2}const Ro=/\r\n?|\n/;var Ee=(function(i){return i[i.Simple=0]="Simple",i[i.TrackDel=1]="TrackDel",i[i.TrackBefore=2]="TrackBefore",i[i.TrackAfter=3]="TrackAfter",i})(Ee||(Ee={}));class St{constructor(e){this.sections=e}get length(){let e=0;for(let t=0;t<this.sections.length;t+=2)e+=this.sections[t];return e}get newLength(){let e=0;for(let t=0;t<this.sections.length;t+=2){let s=this.sections[t+1];e+=s<0?this.sections[t]:s}return e}get empty(){return this.sections.length==0||this.sections.length==2&&this.sections[1]<0}iterGaps(e){for(let t=0,s=0,n=0;t<this.sections.length;){let r=this.sections[t++],o=this.sections[t++];o<0?(e(s,n,r),n+=r):n+=o,s+=r}}iterChangedRanges(e,t=!1){Bo(this,e,t)}get invertedDesc(){let e=[];for(let t=0;t<this.sections.length;){let s=this.sections[t++],n=this.sections[t++];n<0?e.push(s,n):e.push(n,s)}return new St(e)}composeDesc(e){return this.empty?e:e.empty?this:jc(this,e)}mapDesc(e,t=!1){return e.empty?this:_o(this,e,t)}mapPos(e,t=-1,s=Ee.Simple){let n=0,r=0;for(let o=0;o<this.sections.length;){let a=this.sections[o++],l=this.sections[o++],h=n+a;if(l<0){if(h>e)return r+(e-n);r+=a}else{if(s!=Ee.Simple&&h>=e&&(s==Ee.TrackDel&&n<e&&h>e||s==Ee.TrackBefore&&n<e||s==Ee.TrackAfter&&h>e))return null;if(h>e||h==e&&t<0&&!a)return e==n||t<0?r:r+l;r+=l}n=h}if(e>n)throw new RangeError(`Position ${e} is out of range for changeset of length ${n}`);return r}touchesRange(e,t=e){for(let s=0,n=0;s<this.sections.length&&n<=t;){let r=this.sections[s++],o=this.sections[s++],a=n+r;if(o>=0&&n<=t&&a>=e)return n<e&&a>t?"cover":!0;n=a}return!1}toString(){let e="";for(let t=0;t<this.sections.length;){let s=this.sections[t++],n=this.sections[t++];e+=(e?" ":"")+s+(n>=0?":"+n:"")}return e}toJSON(){return this.sections}static fromJSON(e){if(!Array.isArray(e)||e.length%2||e.some(t=>typeof t!="number"))throw new RangeError("Invalid JSON representation of ChangeDesc");return new St(e)}static create(e){return new St(e)}}class ue extends St{constructor(e,t){super(e),this.inserted=t}apply(e){if(this.length!=e.length)throw new RangeError("Applying change set to a document with the wrong length");return Bo(this,(t,s,n,r,o)=>e=e.replace(n,n+(s-t),o),!1),e}mapDesc(e,t=!1){return _o(this,e,t,!0)}invert(e){let t=this.sections.slice(),s=[];for(let n=0,r=0;n<t.length;n+=2){let o=t[n],a=t[n+1];if(a>=0){t[n]=a,t[n+1]=o;let l=n>>1;for(;s.length<l;)s.push(V.empty);s.push(o?e.slice(r,r+o):V.empty)}r+=o}return new ue(t,s)}compose(e){return this.empty?e:e.empty?this:jc(this,e,!0)}map(e,t=!1){return e.empty?this:_o(this,e,t,!0)}iterChanges(e,t=!1){Bo(this,e,t)}get desc(){return St.create(this.sections)}filter(e){let t=[],s=[],n=[],r=new zs(this);e:for(let o=0,a=0;;){let l=o==e.length?1e9:e[o++];for(;a<l||a==l&&r.len==0;){if(r.done)break e;let c=Math.min(r.len,l-a);Ae(n,c,-1);let d=r.ins==-1?-1:r.off==0?r.ins:0;Ae(t,c,d),d>0&&Ut(s,t,r.text),r.forward(c),a+=c}let h=e[o++];for(;a<h;){if(r.done)break e;let c=Math.min(r.len,h-a);Ae(t,c,-1),Ae(n,c,r.ins==-1?-1:r.off==0?r.ins:0),r.forward(c),a+=c}}return{changes:new ue(t,s),filtered:St.create(n)}}toJSON(){let e=[];for(let t=0;t<this.sections.length;t+=2){let s=this.sections[t],n=this.sections[t+1];n<0?e.push(s):n==0?e.push([s]):e.push([s].concat(this.inserted[t>>1].toJSON()))}return e}static of(e,t,s){let n=[],r=[],o=0,a=null;function l(c=!1){if(!c&&!n.length)return;o<t&&Ae(n,t-o,-1);let d=new ue(n,r);a=a?a.compose(d.map(a)):d,n=[],r=[],o=0}function h(c){if(Array.isArray(c))for(let d of c)h(d);else if(c instanceof ue){if(c.length!=t)throw new RangeError(`Mismatched change set length (got ${c.length}, expected ${t})`);l(),a=a?a.compose(c.map(a)):c}else{let{from:d,to:f=d,insert:u}=c;if(d>f||d<0||f>t)throw new RangeError(`Invalid change range ${d} to ${f} (in doc of length ${t})`);let p=u?typeof u=="string"?V.of(u.split(s||Ro)):u:V.empty,m=p.length;if(d==f&&m==0)return;d<o&&l(),d>o&&Ae(n,d-o,-1),Ae(n,f-d,m),Ut(r,n,p),o=f}}return h(e),l(!a),a}static empty(e){return new ue(e?[e,-1]:[],[])}static fromJSON(e){if(!Array.isArray(e))throw new RangeError("Invalid JSON representation of ChangeSet");let t=[],s=[];for(let n=0;n<e.length;n++){let r=e[n];if(typeof r=="number")t.push(r,-1);else{if(!Array.isArray(r)||typeof r[0]!="number"||r.some((o,a)=>a&&typeof o!="string"))throw new RangeError("Invalid JSON representation of ChangeSet");if(r.length==1)t.push(r[0],0);else{for(;s.length<n;)s.push(V.empty);s[n]=V.of(r.slice(1)),t.push(r[0],s[n].length)}}}return new ue(t,s)}static createSet(e,t){return new ue(e,t)}}function Ae(i,e,t,s=!1){if(e==0&&t<=0)return;let n=i.length-2;n>=0&&t<=0&&t==i[n+1]?i[n]+=e:n>=0&&e==0&&i[n]==0?i[n+1]+=t:s?(i[n]+=e,i[n+1]+=t):i.push(e,t)}function Ut(i,e,t){if(t.length==0)return;let s=e.length-2>>1;if(s<i.length)i[i.length-1]=i[i.length-1].append(t);else{for(;i.length<s;)i.push(V.empty);i.push(t)}}function Bo(i,e,t){let s=i.inserted;for(let n=0,r=0,o=0;o<i.sections.length;){let a=i.sections[o++],l=i.sections[o++];if(l<0)n+=a,r+=a;else{let h=n,c=r,d=V.empty;for(;h+=a,c+=l,l&&s&&(d=d.append(s[o-2>>1])),!(t||o==i.sections.length||i.sections[o+1]<0);)a=i.sections[o++],l=i.sections[o++];e(n,h,r,c,d),n=h,r=c}}}function _o(i,e,t,s=!1){let n=[],r=s?[]:null,o=new zs(i),a=new zs(e);for(let l=-1;;){if(o.done&&a.len||a.done&&o.len)throw new Error("Mismatched change set lengths");if(o.ins==-1&&a.ins==-1){let h=Math.min(o.len,a.len);Ae(n,h,-1),o.forward(h),a.forward(h)}else if(a.ins>=0&&(o.ins<0||l==o.i||o.off==0&&(a.len<o.len||a.len==o.len&&!t))){let h=a.len;for(Ae(n,a.ins,-1);h;){let c=Math.min(o.len,h);o.ins>=0&&l<o.i&&o.len<=c&&(Ae(n,0,o.ins),r&&Ut(r,n,o.text),l=o.i),o.forward(c),h-=c}a.next()}else if(o.ins>=0){let h=0,c=o.len;for(;c;)if(a.ins==-1){let d=Math.min(c,a.len);h+=d,c-=d,a.forward(d)}else if(a.ins==0&&a.len<c)c-=a.len,a.next();else break;Ae(n,h,l<o.i?o.ins:0),r&&l<o.i&&Ut(r,n,o.text),l=o.i,o.forward(o.len-c)}else{if(o.done&&a.done)return r?ue.createSet(n,r):St.create(n);throw new Error("Mismatched change set lengths")}}}function jc(i,e,t=!1){let s=[],n=t?[]:null,r=new zs(i),o=new zs(e);for(let a=!1;;){if(r.done&&o.done)return n?ue.createSet(s,n):St.create(s);if(r.ins==0)Ae(s,r.len,0,a),r.next();else if(o.len==0&&!o.done)Ae(s,0,o.ins,a),n&&Ut(n,s,o.text),o.next();else{if(r.done||o.done)throw new Error("Mismatched change set lengths");{let l=Math.min(r.len2,o.len),h=s.length;if(r.ins==-1){let c=o.ins==-1?-1:o.off?0:o.ins;Ae(s,l,c,a),n&&c&&Ut(n,s,o.text)}else o.ins==-1?(Ae(s,r.off?0:r.len,l,a),n&&Ut(n,s,r.textBit(l))):(Ae(s,r.off?0:r.len,o.off?0:o.ins,a),n&&!o.off&&Ut(n,s,o.text));a=(r.ins>l||o.ins>=0&&o.len>l)&&(a||s.length>h),r.forward2(l),o.forward(l)}}}}class zs{constructor(e){this.set=e,this.i=0,this.next()}next(){let{sections:e}=this.set;this.i<e.length?(this.len=e[this.i++],this.ins=e[this.i++]):(this.len=0,this.ins=-2),this.off=0}get done(){return this.ins==-2}get len2(){return this.ins<0?this.len:this.ins}get text(){let{inserted:e}=this.set,t=this.i-2>>1;return t>=e.length?V.empty:e[t]}textBit(e){let{inserted:t}=this.set,s=this.i-2>>1;return s>=t.length&&!e?V.empty:t[s].slice(this.off,e==null?void 0:this.off+e)}forward(e){e==this.len?this.next():(this.len-=e,this.off+=e)}forward2(e){this.ins==-1?this.forward(e):e==this.ins?this.next():(this.ins-=e,this.off+=e)}}class mi{constructor(e,t,s){this.from=e,this.to=t,this.flags=s}get anchor(){return this.flags&32?this.to:this.from}get head(){return this.flags&32?this.from:this.to}get empty(){return this.from==this.to}get assoc(){return this.flags&8?-1:this.flags&16?1:0}get bidiLevel(){let e=this.flags&7;return e==7?null:e}get goalColumn(){let e=this.flags>>6;return e==16777215?void 0:e}map(e,t=-1){let s,n;return this.empty?s=n=e.mapPos(this.from,t):(s=e.mapPos(this.from,1),n=e.mapPos(this.to,-1)),s==this.from&&n==this.to?this:new mi(s,n,this.flags)}extend(e,t=e,s=0){if(e<=this.anchor&&t>=this.anchor)return k.range(e,t,void 0,void 0,s);let n=Math.abs(e-this.anchor)>Math.abs(t-this.anchor)?e:t;return k.range(this.anchor,n,void 0,void 0,s)}eq(e,t=!1){return this.anchor==e.anchor&&this.head==e.head&&this.goalColumn==e.goalColumn&&(!t||!this.empty||this.assoc==e.assoc)}toJSON(){return{anchor:this.anchor,head:this.head}}static fromJSON(e){if(!e||typeof e.anchor!="number"||typeof e.head!="number")throw new RangeError("Invalid JSON representation for SelectionRange");return k.range(e.anchor,e.head)}static create(e,t,s){return new mi(e,t,s)}}class k{constructor(e,t){this.ranges=e,this.mainIndex=t}map(e,t=-1){return e.empty?this:k.create(this.ranges.map(s=>s.map(e,t)),this.mainIndex)}eq(e,t=!1){if(this.ranges.length!=e.ranges.length||this.mainIndex!=e.mainIndex)return!1;for(let s=0;s<this.ranges.length;s++)if(!this.ranges[s].eq(e.ranges[s],t))return!1;return!0}get main(){return this.ranges[this.mainIndex]}asSingle(){return this.ranges.length==1?this:new k([this.main],0)}addRange(e,t=!0){return k.create([e].concat(this.ranges),t?0:this.mainIndex+1)}replaceRange(e,t=this.mainIndex){let s=this.ranges.slice();return s[t]=e,k.create(s,this.mainIndex)}toJSON(){return{ranges:this.ranges.map(e=>e.toJSON()),main:this.mainIndex}}static fromJSON(e){if(!e||!Array.isArray(e.ranges)||typeof e.main!="number"||e.main>=e.ranges.length)throw new RangeError("Invalid JSON representation for EditorSelection");return new k(e.ranges.map(t=>mi.fromJSON(t)),e.main)}static single(e,t=e){return new k([k.range(e,t)],0)}static create(e,t=0){if(e.length==0)throw new RangeError("A selection needs at least one range");for(let s=0,n=0;n<e.length;n++){let r=e[n];if(r.empty?r.from<=s:r.from<s)return k.normalized(e.slice(),t);s=r.to}return new k(e,t)}static cursor(e,t=0,s,n){return mi.create(e,e,(t==0?0:t<0?8:16)|(s==null?7:Math.min(6,s))|(n??16777215)<<6)}static range(e,t,s,n,r){let o=(s??16777215)<<6|(n==null?7:Math.min(6,n));return!r&&e!=t&&(r=t<e?1:-1),t<e?mi.create(t,e,48|o):mi.create(e,t,(r?r<0?8:16:0)|o)}static normalized(e,t=0){let s=e[t];e.sort((n,r)=>n.from-r.from),t=e.indexOf(s);for(let n=1;n<e.length;n++){let r=e[n],o=e[n-1];if(r.empty?r.from<=o.to:r.from<o.to){let a=o.from,l=Math.max(r.to,o.to);n<=t&&t--,e.splice(--n,2,r.anchor>r.head?k.range(l,a):k.range(a,l))}}return new k(e,t)}}function Xc(i,e){for(let t of i.ranges)if(t.to>e)throw new RangeError("Selection points outside of document")}let Ia=0;class D{constructor(e,t,s,n,r){this.combine=e,this.compareInput=t,this.compare=s,this.isStatic=n,this.id=Ia++,this.default=e([]),this.extensions=typeof r=="function"?r(this):r}get reader(){return this}static define(e={}){return new D(e.combine||(t=>t),e.compareInput||((t,s)=>t===s),e.compare||(e.combine?(t,s)=>t===s:Na),!!e.static,e.enables)}of(e){return new Wn([],this,0,e)}compute(e,t){if(this.isStatic)throw new Error("Can't compute a static facet");return new Wn(e,this,1,t)}computeN(e,t){if(this.isStatic)throw new Error("Can't compute a static facet");return new Wn(e,this,2,t)}from(e,t){return t||(t=s=>s),this.compute([e],s=>t(s.field(e)))}}function Na(i,e){return i==e||i.length==e.length&&i.every((t,s)=>t===e[s])}class Wn{constructor(e,t,s,n){this.dependencies=e,this.facet=t,this.type=s,this.value=n,this.id=Ia++}dynamicSlot(e){var t;let s=this.value,n=this.facet.compareInput,r=this.id,o=e[r]>>1,a=this.type==2,l=!1,h=!1,c=[];for(let d of this.dependencies)d=="doc"?l=!0:d=="selection"?h=!0:(((t=e[d.id])!==null&&t!==void 0?t:1)&1)==0&&c.push(e[d.id]);return{create(d){return d.values[o]=s(d),1},update(d,f){if(l&&f.docChanged||h&&(f.docChanged||f.selection)||Lo(d,c)){let u=s(d);if(a?!Fl(u,d.values[o],n):!n(u,d.values[o]))return d.values[o]=u,1}return 0},reconfigure:(d,f)=>{let u,p=f.config.address[r];if(p!=null){let m=er(f,p);if(this.dependencies.every(b=>b instanceof D?f.facet(b)===d.facet(b):b instanceof Pe?f.field(b,!1)==d.field(b,!1):!0)||(a?Fl(u=s(d),m,n):n(u=s(d),m)))return d.values[o]=m,0}else u=s(d);return d.values[o]=u,1}}}}function Fl(i,e,t){if(i.length!=e.length)return!1;for(let s=0;s<i.length;s++)if(!t(i[s],e[s]))return!1;return!0}function Lo(i,e){let t=!1;for(let s of e)$s(i,s)&1&&(t=!0);return t}function Jp(i,e,t){let s=t.map(l=>i[l.id]),n=t.map(l=>l.type),r=s.filter(l=>!(l&1)),o=i[e.id]>>1;function a(l){let h=[];for(let c=0;c<s.length;c++){let d=er(l,s[c]);if(n[c]==2)for(let f of d)h.push(f);else h.push(d)}return e.combine(h)}return{create(l){for(let h of s)$s(l,h);return l.values[o]=a(l),1},update(l,h){if(!Lo(l,r))return 0;let c=a(l);return e.compare(c,l.values[o])?0:(l.values[o]=c,1)},reconfigure(l,h){let c=Lo(l,s),d=h.config.facets[e.id],f=h.facet(e);if(d&&!c&&Na(t,d))return l.values[o]=f,0;let u=a(l);return e.compare(u,f)?(l.values[o]=f,0):(l.values[o]=u,1)}}}const mn=D.define({static:!0});class Pe{constructor(e,t,s,n,r){this.id=e,this.createF=t,this.updateF=s,this.compareF=n,this.spec=r,this.provides=void 0}static define(e){let t=new Pe(Ia++,e.create,e.update,e.compare||((s,n)=>s===n),e);return e.provide&&(t.provides=e.provide(t)),t}create(e){let t=e.facet(mn).find(s=>s.field==this);return((t==null?void 0:t.create)||this.createF)(e)}slot(e){let t=e[this.id]>>1;return{create:s=>(s.values[t]=this.create(s),1),update:(s,n)=>{let r=s.values[t],o=this.updateF(r,n);return this.compareF(r,o)?0:(s.values[t]=o,1)},reconfigure:(s,n)=>{let r=s.facet(mn),o=n.facet(mn),a;return(a=r.find(l=>l.field==this))&&a!=o.find(l=>l.field==this)?(s.values[t]=a.create(s),1):n.config.address[this.id]!=null?(s.values[t]=n.field(this),0):(s.values[t]=this.create(s),1)}}}init(e){return[this,mn.of({field:this,create:e})]}get extension(){return this}}const di={lowest:4,low:3,default:2,high:1,highest:0};function ms(i){return e=>new Jc(e,i)}const _i={highest:ms(di.highest),high:ms(di.high),default:ms(di.default),low:ms(di.low),lowest:ms(di.lowest)};class Jc{constructor(e,t){this.inner=e,this.prec=t}}class Tr{of(e){return new Io(this,e)}reconfigure(e){return Tr.reconfigure.of({compartment:this,extension:e})}get(e){return e.config.compartments.get(this)}}class Io{constructor(e,t){this.compartment=e,this.inner=t}}class Zn{constructor(e,t,s,n,r,o){for(this.base=e,this.compartments=t,this.dynamicSlots=s,this.address=n,this.staticValues=r,this.facets=o,this.statusTemplate=[];this.statusTemplate.length<s.length;)this.statusTemplate.push(0)}staticFacet(e){let t=this.address[e.id];return t==null?e.default:this.staticValues[t>>1]}static resolve(e,t,s){let n=[],r=Object.create(null),o=new Map;for(let f of Kp(e,t,o))f instanceof Pe?n.push(f):(r[f.facet.id]||(r[f.facet.id]=[])).push(f);let a=Object.create(null),l=[],h=[];for(let f of n)a[f.id]=h.length<<1,h.push(u=>f.slot(u));let c=s==null?void 0:s.config.facets;for(let f in r){let u=r[f],p=u[0].facet,m=c&&c[f]||[];if(u.every(b=>b.type==0))if(a[p.id]=l.length<<1|1,Na(m,u))l.push(s.facet(p));else{let b=p.combine(u.map(x=>x.value));l.push(s&&p.compare(b,s.facet(p))?s.facet(p):b)}else{for(let b of u)b.type==0?(a[b.id]=l.length<<1|1,l.push(b.value)):(a[b.id]=h.length<<1,h.push(x=>b.dynamicSlot(x)));a[p.id]=h.length<<1,h.push(b=>Jp(b,p,u))}}let d=h.map(f=>f(a));return new Zn(e,o,d,a,l,r)}}function Kp(i,e,t){let s=[[],[],[],[],[]],n=new Map;function r(o,a){let l=n.get(o);if(l!=null){if(l<=a)return;let h=s[l].indexOf(o);h>-1&&s[l].splice(h,1),o instanceof Io&&t.delete(o.compartment)}if(n.set(o,a),Array.isArray(o))for(let h of o)r(h,a);else if(o instanceof Io){if(t.has(o.compartment))throw new RangeError("Duplicate use of compartment in extensions");let h=e.get(o.compartment)||o.inner;t.set(o.compartment,h),r(h,a)}else if(o instanceof Jc)r(o.inner,o.prec);else if(o instanceof Pe)s[a].push(o),o.provides&&r(o.provides,a);else if(o instanceof Wn)s[a].push(o),o.facet.extensions&&r(o.facet.extensions,di.default);else{let h=o.extension;if(!h)throw new Error(`Unrecognized extension value in extension set (${o}). This sometimes happens because multiple instances of @codemirror/state are loaded, breaking instanceof checks.`);r(h,a)}}return r(i,di.default),s.reduce((o,a)=>o.concat(a))}function $s(i,e){if(e&1)return 2;let t=e>>1,s=i.status[t];if(s==4)throw new Error("Cyclic dependency between fields and/or facets");if(s&2)return s;i.status[t]=4;let n=i.computeSlot(i,i.config.dynamicSlots[t]);return i.status[t]=2|n}function er(i,e){return e&1?i.config.staticValues[e>>1]:i.values[e>>1]}const Kc=D.define(),No=D.define({combine:i=>i.some(e=>e),static:!0}),Gc=D.define({combine:i=>i.length?i[0]:void 0,static:!0}),Yc=D.define(),Zc=D.define(),ed=D.define(),td=D.define({combine:i=>i.length?i[0]:!1});class Ft{constructor(e,t){this.type=e,this.value=t}static define(){return new Gp}}class Gp{of(e){return new Ft(this,e)}}class Yp{constructor(e){this.map=e}of(e){return new N(this,e)}}class N{constructor(e,t){this.type=e,this.value=t}map(e){let t=this.type.map(this.value,e);return t===void 0?void 0:t==this.value?this:new N(this.type,t)}is(e){return this.type==e}static define(e={}){return new Yp(e.map||(t=>t))}static mapEffects(e,t){if(!e.length)return e;let s=[];for(let n of e){let r=n.map(t);r&&s.push(r)}return s}}N.reconfigure=N.define();N.appendConfig=N.define();class pe{constructor(e,t,s,n,r,o){this.startState=e,this.changes=t,this.selection=s,this.effects=n,this.annotations=r,this.scrollIntoView=o,this._doc=null,this._state=null,s&&Xc(s,t.newLength),r.some(a=>a.type==pe.time)||(this.annotations=r.concat(pe.time.of(Date.now())))}static create(e,t,s,n,r,o){return new pe(e,t,s,n,r,o)}get newDoc(){return this._doc||(this._doc=this.changes.apply(this.startState.doc))}get newSelection(){return this.selection||this.startState.selection.map(this.changes)}get state(){return this._state||this.startState.applyTransaction(this),this._state}annotation(e){for(let t of this.annotations)if(t.type==e)return t.value}get docChanged(){return!this.changes.empty}get reconfigured(){return this.startState.config!=this.state.config}isUserEvent(e){let t=this.annotation(pe.userEvent);return!!(t&&(t==e||t.length>e.length&&t.slice(0,e.length)==e&&t[e.length]=="."))}}pe.time=Ft.define();pe.userEvent=Ft.define();pe.addToHistory=Ft.define();pe.remote=Ft.define();function Zp(i,e){let t=[];for(let s=0,n=0;;){let r,o;if(s<i.length&&(n==e.length||e[n]>=i[s]))r=i[s++],o=i[s++];else if(n<e.length)r=e[n++],o=e[n++];else return t;!t.length||t[t.length-1]<r?t.push(r,o):t[t.length-1]<o&&(t[t.length-1]=o)}}function id(i,e,t){var s;let n,r,o;return t?(n=e.changes,r=ue.empty(e.changes.length),o=i.changes.compose(e.changes)):(n=e.changes.map(i.changes),r=i.changes.mapDesc(e.changes,!0),o=i.changes.compose(n)),{changes:o,selection:e.selection?e.selection.map(r):(s=i.selection)===null||s===void 0?void 0:s.map(n),effects:N.mapEffects(i.effects,n).concat(N.mapEffects(e.effects,r)),annotations:i.annotations.length?i.annotations.concat(e.annotations):e.annotations,scrollIntoView:i.scrollIntoView||e.scrollIntoView}}function zo(i,e,t){let s=e.selection,n=ji(e.annotations);return e.userEvent&&(n=n.concat(pe.userEvent.of(e.userEvent))),{changes:e.changes instanceof ue?e.changes:ue.of(e.changes||[],t,i.facet(Gc)),selection:s&&(s instanceof k?s:k.single(s.anchor,s.head)),effects:ji(e.effects),annotations:n,scrollIntoView:!!e.scrollIntoView}}function sd(i,e,t){let s=zo(i,e.length?e[0]:{},i.doc.length);e.length&&e[0].filter===!1&&(t=!1);for(let r=1;r<e.length;r++){e[r].filter===!1&&(t=!1);let o=!!e[r].sequential;s=id(s,zo(i,e[r],o?s.changes.newLength:i.doc.length),o)}let n=pe.create(i,s.changes,s.selection,s.effects,s.annotations,s.scrollIntoView);return tg(t?eg(n):n)}function eg(i){let e=i.startState,t=!0;for(let n of e.facet(Yc)){let r=n(i);if(r===!1){t=!1;break}Array.isArray(r)&&(t=t===!0?r:Zp(t,r))}if(t!==!0){let n,r;if(t===!1)r=i.changes.invertedDesc,n=ue.empty(e.doc.length);else{let o=i.changes.filter(t);n=o.changes,r=o.filtered.mapDesc(o.changes).invertedDesc}i=pe.create(e,n,i.selection&&i.selection.map(r),N.mapEffects(i.effects,r),i.annotations,i.scrollIntoView)}let s=e.facet(Zc);for(let n=s.length-1;n>=0;n--){let r=s[n](i);r instanceof pe?i=r:Array.isArray(r)&&r.length==1&&r[0]instanceof pe?i=r[0]:i=sd(e,ji(r),!1)}return i}function tg(i){let e=i.startState,t=e.facet(ed),s=i;for(let n=t.length-1;n>=0;n--){let r=t[n](i);r&&Object.keys(r).length&&(s=id(s,zo(e,r,i.changes.newLength),!0))}return s==i?i:pe.create(e,i.changes,i.selection,s.effects,s.annotations,s.scrollIntoView)}const ig=[];function ji(i){return i==null?ig:Array.isArray(i)?i:[i]}var ie=(function(i){return i[i.Word=0]="Word",i[i.Space=1]="Space",i[i.Other=2]="Other",i})(ie||(ie={}));const sg=/[\u00df\u0587\u0590-\u05f4\u0600-\u06ff\u3040-\u309f\u30a0-\u30ff\u3400-\u4db5\u4e00-\u9fcc\uac00-\ud7af]/;let Fo;try{Fo=new RegExp("[\\p{Alphabetic}\\p{Number}_]","u")}catch{}function ng(i){if(Fo)return Fo.test(i);for(let e=0;e<i.length;e++){let t=i[e];if(/\w/.test(t)||t>""&&(t.toUpperCase()!=t.toLowerCase()||sg.test(t)))return!0}return!1}function rg(i){return e=>{if(!/\S/.test(e))return ie.Space;if(ng(e))return ie.Word;for(let t=0;t<i.length;t++)if(e.indexOf(i[t])>-1)return ie.Word;return ie.Other}}class q{constructor(e,t,s,n,r,o){this.config=e,this.doc=t,this.selection=s,this.values=n,this.status=e.statusTemplate.slice(),this.computeSlot=r,o&&(o._state=this);for(let a=0;a<this.config.dynamicSlots.length;a++)$s(this,a<<1);this.computeSlot=null}field(e,t=!0){let s=this.config.address[e.id];if(s==null){if(t)throw new RangeError("Field is not present in this state");return}return $s(this,s),er(this,s)}update(...e){return sd(this,e,!0)}applyTransaction(e){let t=this.config,{base:s,compartments:n}=t;for(let a of e.effects)a.is(Tr.reconfigure)?(t&&(n=new Map,t.compartments.forEach((l,h)=>n.set(h,l)),t=null),n.set(a.value.compartment,a.value.extension)):a.is(N.reconfigure)?(t=null,s=a.value):a.is(N.appendConfig)&&(t=null,s=ji(s).concat(a.value));let r;t?r=e.startState.values.slice():(t=Zn.resolve(s,n,this),r=new q(t,this.doc,this.selection,t.dynamicSlots.map(()=>null),(l,h)=>h.reconfigure(l,this),null).values);let o=e.startState.facet(No)?e.newSelection:e.newSelection.asSingle();new q(t,e.newDoc,o,r,(a,l)=>l.update(a,e),e)}replaceSelection(e){return typeof e=="string"&&(e=this.toText(e)),this.changeByRange(t=>({changes:{from:t.from,to:t.to,insert:e},range:k.cursor(t.from+e.length)}))}changeByRange(e){let t=this.selection,s=e(t.ranges[0]),n=this.changes(s.changes),r=[s.range],o=ji(s.effects);for(let a=1;a<t.ranges.length;a++){let l=e(t.ranges[a]),h=this.changes(l.changes),c=h.map(n);for(let f=0;f<a;f++)r[f]=r[f].map(c);let d=n.mapDesc(h,!0);r.push(l.range.map(d)),n=n.compose(c),o=N.mapEffects(o,c).concat(N.mapEffects(ji(l.effects),d))}return{changes:n,selection:k.create(r,t.mainIndex),effects:o}}changes(e=[]){return e instanceof ue?e:ue.of(e,this.doc.length,this.facet(q.lineSeparator))}toText(e){return V.of(e.split(this.facet(q.lineSeparator)||Ro))}sliceDoc(e=0,t=this.doc.length){return this.doc.sliceString(e,t,this.lineBreak)}facet(e){let t=this.config.address[e.id];return t==null?e.default:($s(this,t),er(this,t))}toJSON(e){let t={doc:this.sliceDoc(),selection:this.selection.toJSON()};if(e)for(let s in e){let n=e[s];n instanceof Pe&&this.config.address[n.id]!=null&&(t[s]=n.spec.toJSON(this.field(e[s]),this))}return t}static fromJSON(e,t={},s){if(!e||typeof e.doc!="string")throw new RangeError("Invalid JSON representation for EditorState");let n=[];if(s){for(let r in s)if(Object.prototype.hasOwnProperty.call(e,r)){let o=s[r],a=e[r];n.push(o.init(l=>o.spec.fromJSON(a,l)))}}return q.create({doc:e.doc,selection:k.fromJSON(e.selection),extensions:t.extensions?n.concat([t.extensions]):n})}static create(e={}){let t=Zn.resolve(e.extensions||[],new Map),s=e.doc instanceof V?e.doc:V.of((e.doc||"").split(t.staticFacet(q.lineSeparator)||Ro)),n=e.selection?e.selection instanceof k?e.selection:k.single(e.selection.anchor,e.selection.head):k.single(0);return Xc(n,s.length),t.staticFacet(No)||(n=n.asSingle()),new q(t,s,n,t.dynamicSlots.map(()=>null),(r,o)=>o.create(r),null)}get tabSize(){return this.facet(q.tabSize)}get lineBreak(){return this.facet(q.lineSeparator)||`
`}get readOnly(){return this.facet(td)}phrase(e,...t){for(let s of this.facet(q.phrases))if(Object.prototype.hasOwnProperty.call(s,e)){e=s[e];break}return t.length&&(e=e.replace(/\$(\$|\d*)/g,(s,n)=>{if(n=="$")return"$";let r=+(n||1);return!r||r>t.length?s:t[r-1]})),e}languageDataAt(e,t,s=-1){let n=[];for(let r of this.facet(Kc))for(let o of r(this,t,s))Object.prototype.hasOwnProperty.call(o,e)&&n.push(o[e]);return n}charCategorizer(e){let t=this.languageDataAt("wordChars",e);return rg(t.length?t[0]:"")}wordAt(e){let{text:t,from:s,length:n}=this.doc.lineAt(e),r=this.charCategorizer(e),o=e-s,a=e-s;for(;o>0;){let l=xe(t,o,!1);if(r(t.slice(l,o))!=ie.Word)break;o=l}for(;a<n;){let l=xe(t,a);if(r(t.slice(a,l))!=ie.Word)break;a=l}return o==a?null:k.range(o+s,a+s)}}q.allowMultipleSelections=No;q.tabSize=D.define({combine:i=>i.length?i[0]:4});q.lineSeparator=Gc;q.readOnly=td;q.phrases=D.define({compare(i,e){let t=Object.keys(i),s=Object.keys(e);return t.length==s.length&&t.every(n=>i[n]==e[n])}});q.languageData=Kc;q.changeFilter=Yc;q.transactionFilter=Zc;q.transactionExtender=ed;Tr.reconfigure=N.define();function At(i,e,t={}){let s={};for(let n of i)for(let r of Object.keys(n)){let o=n[r],a=s[r];if(a===void 0)s[r]=o;else if(!(a===o||o===void 0))if(Object.hasOwnProperty.call(t,r))s[r]=t[r](a,o);else throw new Error("Config merge conflict for field "+r)}for(let n in e)s[n]===void 0&&(s[n]=e[n]);return s}class Kt{eq(e){return this==e}range(e,t=e){return Ho.create(e,t,this)}}Kt.prototype.startSide=Kt.prototype.endSide=0;Kt.prototype.point=!1;Kt.prototype.mapMode=Ee.TrackDel;function za(i,e){return i==e||i.constructor==e.constructor&&i.eq(e)}let Ho=class nd{constructor(e,t,s){this.from=e,this.to=t,this.value=s}static create(e,t,s){return new nd(e,t,s)}};function Wo(i,e){return i.from-e.from||i.value.startSide-e.value.startSide}class Fa{constructor(e,t,s,n){this.from=e,this.to=t,this.value=s,this.maxPoint=n}get length(){return this.to[this.to.length-1]}findIndex(e,t,s,n=0){let r=s?this.to:this.from;for(let o=n,a=r.length;;){if(o==a)return o;let l=o+a>>1,h=r[l]-e||(s?this.value[l].endSide:this.value[l].startSide)-t;if(l==o)return h>=0?o:a;h>=0?a=l:o=l+1}}between(e,t,s,n){for(let r=this.findIndex(t,-1e9,!0),o=this.findIndex(s,1e9,!1,r);r<o;r++)if(n(this.from[r]+e,this.to[r]+e,this.value[r])===!1)return!1}map(e,t){let s=[],n=[],r=[],o=-1,a=-1;for(let l=0;l<this.value.length;l++){let h=this.value[l],c=this.from[l]+e,d=this.to[l]+e,f,u;if(c==d){let p=t.mapPos(c,h.startSide,h.mapMode);if(p==null||(f=u=p,h.startSide!=h.endSide&&(u=t.mapPos(c,h.endSide),u<f)))continue}else if(f=t.mapPos(c,h.startSide),u=t.mapPos(d,h.endSide),f>u||f==u&&h.startSide>0&&h.endSide<=0)continue;(u-f||h.endSide-h.startSide)<0||(o<0&&(o=f),h.point&&(a=Math.max(a,u-f)),s.push(h),n.push(f-o),r.push(u-o))}return{mapped:s.length?new Fa(n,r,s,a):null,pos:o}}}class H{constructor(e,t,s,n){this.chunkPos=e,this.chunk=t,this.nextLayer=s,this.maxPoint=n}static create(e,t,s,n){return new H(e,t,s,n)}get length(){let e=this.chunk.length-1;return e<0?0:Math.max(this.chunkEnd(e),this.nextLayer.length)}get size(){if(this.isEmpty)return 0;let e=this.nextLayer.size;for(let t of this.chunk)e+=t.value.length;return e}chunkEnd(e){return this.chunkPos[e]+this.chunk[e].length}update(e){let{add:t=[],sort:s=!1,filterFrom:n=0,filterTo:r=this.length}=e,o=e.filter;if(t.length==0&&!o)return this;if(s&&(t=t.slice().sort(Wo)),this.isEmpty)return t.length?H.of(t):this;let a=new rd(this,null,-1).goto(0),l=0,h=[],c=new Bt;for(;a.value||l<t.length;)if(l<t.length&&(a.from-t[l].from||a.startSide-t[l].value.startSide)>=0){let d=t[l++];c.addInner(d.from,d.to,d.value)||h.push(d)}else a.rangeIndex==1&&a.chunkIndex<this.chunk.length&&(l==t.length||this.chunkEnd(a.chunkIndex)<t[l].from)&&(!o||n>this.chunkEnd(a.chunkIndex)||r<this.chunkPos[a.chunkIndex])&&c.addChunk(this.chunkPos[a.chunkIndex],this.chunk[a.chunkIndex])?a.nextChunk():((!o||n>a.to||r<a.from||o(a.from,a.to,a.value))&&(c.addInner(a.from,a.to,a.value)||h.push(Ho.create(a.from,a.to,a.value))),a.next());return c.finishInner(this.nextLayer.isEmpty&&!h.length?H.empty:this.nextLayer.update({add:h,filter:o,filterFrom:n,filterTo:r}))}map(e){if(e.empty||this.isEmpty)return this;let t=[],s=[],n=-1;for(let o=0;o<this.chunk.length;o++){let a=this.chunkPos[o],l=this.chunk[o],h=e.touchesRange(a,a+l.length);if(h===!1)n=Math.max(n,l.maxPoint),t.push(l),s.push(e.mapPos(a));else if(h===!0){let{mapped:c,pos:d}=l.map(a,e);c&&(n=Math.max(n,c.maxPoint),t.push(c),s.push(d))}}let r=this.nextLayer.map(e);return t.length==0?r:new H(s,t,r||H.empty,n)}between(e,t,s){if(!this.isEmpty){for(let n=0;n<this.chunk.length;n++){let r=this.chunkPos[n],o=this.chunk[n];if(t>=r&&e<=r+o.length&&o.between(r,e-r,t-r,s)===!1)return}this.nextLayer.between(e,t,s)}}iter(e=0){return Fs.from([this]).goto(e)}get isEmpty(){return this.nextLayer==this}static iter(e,t=0){return Fs.from(e).goto(t)}static compare(e,t,s,n,r=-1){let o=e.filter(d=>d.maxPoint>0||!d.isEmpty&&d.maxPoint>=r),a=t.filter(d=>d.maxPoint>0||!d.isEmpty&&d.maxPoint>=r),l=Hl(o,a,s),h=new bs(o,l,r),c=new bs(a,l,r);s.iterGaps((d,f,u)=>Wl(h,d,c,f,u,n)),s.empty&&s.length==0&&Wl(h,0,c,0,0,n)}static eq(e,t,s=0,n){n==null&&(n=999999999);let r=e.filter(c=>!c.isEmpty&&t.indexOf(c)<0),o=t.filter(c=>!c.isEmpty&&e.indexOf(c)<0);if(r.length!=o.length)return!1;if(!r.length)return!0;let a=Hl(r,o),l=new bs(r,a,0).goto(s),h=new bs(o,a,0).goto(s);for(;;){if(l.to!=h.to||!qo(l.active,h.active)||l.point&&(!h.point||!za(l.point,h.point)))return!1;if(l.to>n)return!0;l.next(),h.next()}}static spans(e,t,s,n,r=-1){let o=new bs(e,null,r).goto(t),a=t,l=o.openStart;for(;;){let h=Math.min(o.to,s);if(o.point){let c=o.activeForPoint(o.to),d=o.pointFrom<t?c.length+1:o.point.startSide<0?c.length:Math.min(c.length,l);n.point(a,h,o.point,c,d,o.pointRank),l=Math.min(o.openEnd(h),c.length)}else h>a&&(n.span(a,h,o.active,l),l=o.openEnd(h));if(o.to>s)return l+(o.point&&o.to>s?1:0);a=o.to,o.next()}}static of(e,t=!1){let s=new Bt;for(let n of e instanceof Ho?[e]:t?og(e):e)s.add(n.from,n.to,n.value);return s.finish()}static join(e){if(!e.length)return H.empty;let t=e[e.length-1];for(let s=e.length-2;s>=0;s--)for(let n=e[s];n!=H.empty;n=n.nextLayer)t=new H(n.chunkPos,n.chunk,t,Math.max(n.maxPoint,t.maxPoint));return t}}H.empty=new H([],[],null,-1);function og(i){if(i.length>1)for(let e=i[0],t=1;t<i.length;t++){let s=i[t];if(Wo(e,s)>0)return i.slice().sort(Wo);e=s}return i}H.empty.nextLayer=H.empty;class Bt{finishChunk(e){this.chunks.push(new Fa(this.from,this.to,this.value,this.maxPoint)),this.chunkPos.push(this.chunkStart),this.chunkStart=-1,this.setMaxPoint=Math.max(this.setMaxPoint,this.maxPoint),this.maxPoint=-1,e&&(this.from=[],this.to=[],this.value=[])}constructor(){this.chunks=[],this.chunkPos=[],this.chunkStart=-1,this.last=null,this.lastFrom=-1e9,this.lastTo=-1e9,this.from=[],this.to=[],this.value=[],this.maxPoint=-1,this.setMaxPoint=-1,this.nextLayer=null}add(e,t,s){this.addInner(e,t,s)||(this.nextLayer||(this.nextLayer=new Bt)).add(e,t,s)}addInner(e,t,s){let n=e-this.lastTo||s.startSide-this.last.endSide;if(n<=0&&(e-this.lastFrom||s.startSide-this.last.startSide)<0)throw new Error("Ranges must be added sorted by `from` position and `startSide`");return n<0?!1:(this.from.length==250&&this.finishChunk(!0),this.chunkStart<0&&(this.chunkStart=e),this.from.push(e-this.chunkStart),this.to.push(t-this.chunkStart),this.last=s,this.lastFrom=e,this.lastTo=t,this.value.push(s),s.point&&(this.maxPoint=Math.max(this.maxPoint,t-e)),!0)}addChunk(e,t){if((e-this.lastTo||t.value[0].startSide-this.last.endSide)<0)return!1;this.from.length&&this.finishChunk(!0),this.setMaxPoint=Math.max(this.setMaxPoint,t.maxPoint),this.chunks.push(t),this.chunkPos.push(e);let s=t.value.length-1;return this.last=t.value[s],this.lastFrom=t.from[s]+e,this.lastTo=t.to[s]+e,!0}finish(){return this.finishInner(H.empty)}finishInner(e){if(this.from.length&&this.finishChunk(!1),this.chunks.length==0)return e;let t=H.create(this.chunkPos,this.chunks,this.nextLayer?this.nextLayer.finishInner(e):e,this.setMaxPoint);return this.from=null,t}}function Hl(i,e,t){let s=new Map;for(let r of i)for(let o=0;o<r.chunk.length;o++)r.chunk[o].maxPoint<=0&&s.set(r.chunk[o],r.chunkPos[o]);let n=new Set;for(let r of e)for(let o=0;o<r.chunk.length;o++){let a=s.get(r.chunk[o]);a!=null&&(t?t.mapPos(a):a)==r.chunkPos[o]&&!(t!=null&&t.touchesRange(a,a+r.chunk[o].length))&&n.add(r.chunk[o])}return n}class rd{constructor(e,t,s,n=0){this.layer=e,this.skip=t,this.minPoint=s,this.rank=n}get startSide(){return this.value?this.value.startSide:0}get endSide(){return this.value?this.value.endSide:0}goto(e,t=-1e9){return this.chunkIndex=this.rangeIndex=0,this.gotoInner(e,t,!1),this}gotoInner(e,t,s){for(;this.chunkIndex<this.layer.chunk.length;){let n=this.layer.chunk[this.chunkIndex];if(!(this.skip&&this.skip.has(n)||this.layer.chunkEnd(this.chunkIndex)<e||n.maxPoint<this.minPoint))break;this.chunkIndex++,s=!1}if(this.chunkIndex<this.layer.chunk.length){let n=this.layer.chunk[this.chunkIndex].findIndex(e-this.layer.chunkPos[this.chunkIndex],t,!0);(!s||this.rangeIndex<n)&&this.setRangeIndex(n)}this.next()}forward(e,t){(this.to-e||this.endSide-t)<0&&this.gotoInner(e,t,!0)}next(){for(;;)if(this.chunkIndex==this.layer.chunk.length){this.from=this.to=1e9,this.value=null;break}else{let e=this.layer.chunkPos[this.chunkIndex],t=this.layer.chunk[this.chunkIndex],s=e+t.from[this.rangeIndex];if(this.from=s,this.to=e+t.to[this.rangeIndex],this.value=t.value[this.rangeIndex],this.setRangeIndex(this.rangeIndex+1),this.minPoint<0||this.value.point&&this.to-this.from>=this.minPoint)break}}setRangeIndex(e){if(e==this.layer.chunk[this.chunkIndex].value.length){if(this.chunkIndex++,this.skip)for(;this.chunkIndex<this.layer.chunk.length&&this.skip.has(this.layer.chunk[this.chunkIndex]);)this.chunkIndex++;this.rangeIndex=0}else this.rangeIndex=e}nextChunk(){this.chunkIndex++,this.rangeIndex=0,this.next()}compare(e){return this.from-e.from||this.startSide-e.startSide||this.rank-e.rank||this.to-e.to||this.endSide-e.endSide}}class Fs{constructor(e){this.heap=e}static from(e,t=null,s=-1){let n=[];for(let r=0;r<e.length;r++)for(let o=e[r];!o.isEmpty;o=o.nextLayer)o.maxPoint>=s&&n.push(new rd(o,t,s,r));return n.length==1?n[0]:new Fs(n)}get startSide(){return this.value?this.value.startSide:0}goto(e,t=-1e9){for(let s of this.heap)s.goto(e,t);for(let s=this.heap.length>>1;s>=0;s--)Zr(this.heap,s);return this.next(),this}forward(e,t){for(let s of this.heap)s.forward(e,t);for(let s=this.heap.length>>1;s>=0;s--)Zr(this.heap,s);(this.to-e||this.value.endSide-t)<0&&this.next()}next(){if(this.heap.length==0)this.from=this.to=1e9,this.value=null,this.rank=-1;else{let e=this.heap[0];this.from=e.from,this.to=e.to,this.value=e.value,this.rank=e.rank,e.value&&e.next(),Zr(this.heap,0)}}}function Zr(i,e){for(let t=i[e];;){let s=(e<<1)+1;if(s>=i.length)break;let n=i[s];if(s+1<i.length&&n.compare(i[s+1])>=0&&(n=i[s+1],s++),t.compare(n)<0)break;i[s]=t,i[e]=n,e=s}}class bs{constructor(e,t,s){this.minPoint=s,this.active=[],this.activeTo=[],this.activeRank=[],this.minActive=-1,this.point=null,this.pointFrom=0,this.pointRank=0,this.to=-1e9,this.endSide=0,this.openStart=-1,this.cursor=Fs.from(e,t,s)}goto(e,t=-1e9){return this.cursor.goto(e,t),this.active.length=this.activeTo.length=this.activeRank.length=0,this.minActive=-1,this.to=e,this.endSide=t,this.openStart=-1,this.next(),this}forward(e,t){for(;this.minActive>-1&&(this.activeTo[this.minActive]-e||this.active[this.minActive].endSide-t)<0;)this.removeActive(this.minActive);this.cursor.forward(e,t)}removeActive(e){bn(this.active,e),bn(this.activeTo,e),bn(this.activeRank,e),this.minActive=ql(this.active,this.activeTo)}addActive(e){let t=0,{value:s,to:n,rank:r}=this.cursor;for(;t<this.activeRank.length&&(r-this.activeRank[t]||n-this.activeTo[t])>0;)t++;yn(this.active,t,s),yn(this.activeTo,t,n),yn(this.activeRank,t,r),e&&yn(e,t,this.cursor.from),this.minActive=ql(this.active,this.activeTo)}next(){let e=this.to,t=this.point;this.point=null;let s=this.openStart<0?[]:null;for(;;){let n=this.minActive;if(n>-1&&(this.activeTo[n]-this.cursor.from||this.active[n].endSide-this.cursor.startSide)<0){if(this.activeTo[n]>e){this.to=this.activeTo[n],this.endSide=this.active[n].endSide;break}this.removeActive(n),s&&bn(s,n)}else if(this.cursor.value)if(this.cursor.from>e){this.to=this.cursor.from,this.endSide=this.cursor.startSide;break}else{let r=this.cursor.value;if(!r.point)this.addActive(s),this.cursor.next();else if(t&&this.cursor.to==this.to&&this.cursor.from<this.cursor.to)this.cursor.next();else{this.point=r,this.pointFrom=this.cursor.from,this.pointRank=this.cursor.rank,this.to=this.cursor.to,this.endSide=r.endSide,this.cursor.next(),this.forward(this.to,this.endSide);break}}else{this.to=this.endSide=1e9;break}}if(s){this.openStart=0;for(let n=s.length-1;n>=0&&s[n]<e;n--)this.openStart++}}activeForPoint(e){if(!this.active.length)return this.active;let t=[];for(let s=this.active.length-1;s>=0&&!(this.activeRank[s]<this.pointRank);s--)(this.activeTo[s]>e||this.activeTo[s]==e&&this.active[s].endSide>=this.point.endSide)&&t.push(this.active[s]);return t.reverse()}openEnd(e){let t=0;for(let s=this.activeTo.length-1;s>=0&&this.activeTo[s]>e;s--)t++;return t}}function Wl(i,e,t,s,n,r){i.goto(e),t.goto(s);let o=s+n,a=s,l=s-e,h=!!r.boundChange;for(let c=!1;;){let d=i.to+l-t.to,f=d||i.endSide-t.endSide,u=f<0?i.to+l:t.to,p=Math.min(u,o);if(i.point||t.point?(i.point&&t.point&&za(i.point,t.point)&&qo(i.activeForPoint(i.to),t.activeForPoint(t.to))||r.comparePoint(a,p,i.point,t.point),c=!1):(c&&r.boundChange(a),p>a&&!qo(i.active,t.active)&&r.compareRange(a,p,i.active,t.active),h&&p<o&&(d||i.openEnd(u)!=t.openEnd(u))&&(c=!0)),u>o)break;a=u,f<=0&&i.next(),f>=0&&t.next()}}function qo(i,e){if(i.length!=e.length)return!1;for(let t=0;t<i.length;t++)if(i[t]!=e[t]&&!za(i[t],e[t]))return!1;return!0}function bn(i,e){for(let t=e,s=i.length-1;t<s;t++)i[t]=i[t+1];i.pop()}function yn(i,e,t){for(let s=i.length-1;s>=e;s--)i[s+1]=i[s];i[e]=t}function ql(i,e){let t=-1,s=1e9;for(let n=0;n<e.length;n++)(e[n]-s||i[n].endSide-i[t].endSide)<0&&(t=n,s=e[n]);return t}function ds(i,e,t=i.length){let s=0;for(let n=0;n<t&&n<i.length;)i.charCodeAt(n)==9?(s+=e-s%e,n++):(s++,n=xe(i,n));return s}function Qo(i,e,t,s){for(let n=0,r=0;;){if(r>=e)return n;if(n==i.length)break;r+=i.charCodeAt(n)==9?t-r%t:1,n=xe(i,n)}return s===!0?-1:i.length}const Vo="ͼ",Ql=typeof Symbol>"u"?"__"+Vo:Symbol.for(Vo),Uo=typeof Symbol>"u"?"__styleSet"+Math.floor(Math.random()*1e8):Symbol("styleSet"),Vl=typeof globalThis<"u"?globalThis:typeof window<"u"?window:{};class Gt{constructor(e,t){this.rules=[];let{finish:s}=t||{};function n(o){return/^@/.test(o)?[o]:o.split(/,\s*/)}function r(o,a,l,h){let c=[],d=/^@(\w+)\b/.exec(o[0]),f=d&&d[1]=="keyframes";if(d&&a==null)return l.push(o[0]+";");for(let u in a){let p=a[u];if(/&/.test(u))r(u.split(/,\s*/).map(m=>o.map(b=>m.replace(/&/,b))).reduce((m,b)=>m.concat(b)),p,l);else if(p&&typeof p=="object"){if(!d)throw new RangeError("The value of a property ("+u+") should be a primitive value.");r(n(u),p,c,f)}else p!=null&&c.push(u.replace(/_.*/,"").replace(/[A-Z]/g,m=>"-"+m.toLowerCase())+": "+p+";")}(c.length||f)&&l.push((s&&!d&&!h?o.map(s):o).join(", ")+" {"+c.join(" ")+"}")}for(let o in e)r(n(o),e[o],this.rules)}getRules(){return this.rules.join(`
`)}static newName(){let e=Vl[Ql]||1;return Vl[Ql]=e+1,Vo+e.toString(36)}static mount(e,t,s){let n=e[Uo],r=s&&s.nonce;n?r&&n.setNonce(r):n=new ag(e,r),n.mount(Array.isArray(t)?t:[t],e)}}let Ul=new Map;class ag{constructor(e,t){let s=e.ownerDocument||e,n=s.defaultView;if(!e.head&&e.adoptedStyleSheets&&n.CSSStyleSheet){let r=Ul.get(s);if(r)return e[Uo]=r;this.sheet=new n.CSSStyleSheet,Ul.set(s,this)}else this.styleTag=s.createElement("style"),t&&this.styleTag.setAttribute("nonce",t);this.modules=[],e[Uo]=this}mount(e,t){let s=this.sheet,n=0,r=0;for(let o=0;o<e.length;o++){let a=e[o],l=this.modules.indexOf(a);if(l<r&&l>-1&&(this.modules.splice(l,1),r--,l=-1),l==-1){if(this.modules.splice(r++,0,a),s)for(let h=0;h<a.rules.length;h++)s.insertRule(a.rules[h],n++)}else{for(;r<l;)n+=this.modules[r++].rules.length;n+=a.rules.length,r++}}if(s)t.adoptedStyleSheets.indexOf(this.sheet)<0&&(t.adoptedStyleSheets=[this.sheet,...t.adoptedStyleSheets]);else{let o="";for(let l=0;l<this.modules.length;l++)o+=this.modules[l].getRules()+`
`;this.styleTag.textContent=o;let a=t.head||t;this.styleTag.parentNode!=a&&a.insertBefore(this.styleTag,a.firstChild)}}setNonce(e){this.styleTag&&this.styleTag.getAttribute("nonce")!=e&&this.styleTag.setAttribute("nonce",e)}}var Yt={8:"Backspace",9:"Tab",10:"Enter",12:"NumLock",13:"Enter",16:"Shift",17:"Control",18:"Alt",20:"CapsLock",27:"Escape",32:" ",33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",44:"PrintScreen",45:"Insert",46:"Delete",59:";",61:"=",91:"Meta",92:"Meta",106:"*",107:"+",108:",",109:"-",110:".",111:"/",144:"NumLock",145:"ScrollLock",160:"Shift",161:"Shift",162:"Control",163:"Control",164:"Alt",165:"Alt",173:"-",186:";",187:"=",188:",",189:"-",190:".",191:"/",192:"`",219:"[",220:"\\",221:"]",222:"'"},Hs={48:")",49:"!",50:"@",51:"#",52:"$",53:"%",54:"^",55:"&",56:"*",57:"(",59:":",61:"+",173:"_",186:":",187:"+",188:"<",189:"_",190:">",191:"?",192:"~",219:"{",220:"|",221:"}",222:'"'},lg=typeof navigator<"u"&&/Mac/.test(navigator.platform),hg=typeof navigator<"u"&&/MSIE \d|Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(navigator.userAgent);for(var Se=0;Se<10;Se++)Yt[48+Se]=Yt[96+Se]=String(Se);for(var Se=1;Se<=24;Se++)Yt[Se+111]="F"+Se;for(var Se=65;Se<=90;Se++)Yt[Se]=String.fromCharCode(Se+32),Hs[Se]=String.fromCharCode(Se);for(var eo in Yt)Hs.hasOwnProperty(eo)||(Hs[eo]=Yt[eo]);function cg(i){var e=lg&&i.metaKey&&i.shiftKey&&!i.ctrlKey&&!i.altKey||hg&&i.shiftKey&&i.key&&i.key.length==1||i.key=="Unidentified",t=!e&&i.key||(i.shiftKey?Hs:Yt)[i.keyCode]||i.key||"Unidentified";return t=="Esc"&&(t="Escape"),t=="Del"&&(t="Delete"),t=="Left"&&(t="ArrowLeft"),t=="Up"&&(t="ArrowUp"),t=="Right"&&(t="ArrowRight"),t=="Down"&&(t="ArrowDown"),t}function X(){var i=arguments[0];typeof i=="string"&&(i=document.createElement(i));var e=1,t=arguments[1];if(t&&typeof t=="object"&&t.nodeType==null&&!Array.isArray(t)){for(var s in t)if(Object.prototype.hasOwnProperty.call(t,s)){var n=t[s];typeof n=="string"?i.setAttribute(s,n):n!=null&&(i[s]=n)}e++}for(;e<arguments.length;e++)od(i,arguments[e]);return i}function od(i,e){if(typeof e=="string")i.appendChild(document.createTextNode(e));else if(e!=null)if(e.nodeType!=null)i.appendChild(e);else if(Array.isArray(e))for(var t=0;t<e.length;t++)od(i,e[t]);else throw new RangeError("Unsupported child node: "+e)}let De=typeof navigator<"u"?navigator:{userAgent:"",vendor:"",platform:""},jo=typeof document<"u"?document:{documentElement:{style:{}}};const Xo=/Edge\/(\d+)/.exec(De.userAgent),ad=/MSIE \d/.test(De.userAgent),Jo=/Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(De.userAgent),Dr=!!(ad||Jo||Xo),jl=!Dr&&/gecko\/(\d+)/i.test(De.userAgent),to=!Dr&&/Chrome\/(\d+)/.exec(De.userAgent),Xl="webkitFontSmoothing"in jo.documentElement.style,Ko=!Dr&&/Apple Computer/.test(De.vendor),Jl=Ko&&(/Mobile\/\w+/.test(De.userAgent)||De.maxTouchPoints>2);var T={mac:Jl||/Mac/.test(De.platform),windows:/Win/.test(De.platform),linux:/Linux|X11/.test(De.platform),ie:Dr,ie_version:ad?jo.documentMode||6:Jo?+Jo[1]:Xo?+Xo[1]:0,gecko:jl,gecko_version:jl?+(/Firefox\/(\d+)/.exec(De.userAgent)||[0,0])[1]:0,chrome:!!to,chrome_version:to?+to[1]:0,ios:Jl,android:/Android\b/.test(De.userAgent),webkit:Xl,webkit_version:Xl?+(/\bAppleWebKit\/(\d+)/.exec(De.userAgent)||[0,0])[1]:0,safari:Ko,safari_version:Ko?+(/\bVersion\/(\d+(\.\d+)?)/.exec(De.userAgent)||[0,0])[1]:0,tabSize:jo.documentElement.style.tabSize!=null?"tab-size":"-moz-tab-size"};function Ha(i,e){for(let t in i)t=="class"&&e.class?e.class+=" "+i.class:t=="style"&&e.style?e.style+=";"+i.style:e[t]=i[t];return e}const tr=Object.create(null);function Wa(i,e,t){if(i==e)return!0;i||(i=tr),e||(e=tr);let s=Object.keys(i),n=Object.keys(e);if(s.length-0!=n.length-0)return!1;for(let r of s)if(r!=t&&(n.indexOf(r)==-1||i[r]!==e[r]))return!1;return!0}function dg(i,e){for(let t=i.attributes.length-1;t>=0;t--){let s=i.attributes[t].name;e[s]==null&&i.removeAttribute(s)}for(let t in e){let s=e[t];t=="style"?i.style.cssText=s:i.getAttribute(t)!=s&&i.setAttribute(t,s)}}function Kl(i,e,t){let s=!1;if(e)for(let n in e)t&&n in t||(s=!0,n=="style"?i.style.cssText="":i.removeAttribute(n));if(t)for(let n in t)e&&e[n]==t[n]||(s=!0,n=="style"?i.style.cssText=t[n]:i.setAttribute(n,t[n]));return s}function fg(i){let e=Object.create(null);for(let t=0;t<i.attributes.length;t++){let s=i.attributes[t];e[s.name]=s.value}return e}class Ht{eq(e){return!1}updateDOM(e,t,s){return!1}compare(e){return this==e||this.constructor==e.constructor&&this.eq(e)}get estimatedHeight(){return-1}get lineBreaks(){return 0}ignoreEvent(e){return!0}coordsAt(e,t,s){return null}get isHidden(){return!1}get editable(){return!1}destroy(e){}}var Ce=(function(i){return i[i.Text=0]="Text",i[i.WidgetBefore=1]="WidgetBefore",i[i.WidgetAfter=2]="WidgetAfter",i[i.WidgetRange=3]="WidgetRange",i})(Ce||(Ce={}));class L extends Kt{constructor(e,t,s,n){super(),this.startSide=e,this.endSide=t,this.widget=s,this.spec=n}get heightRelevant(){return!1}static mark(e){return new on(e)}static widget(e){let t=Math.max(-1e4,Math.min(1e4,e.side||0)),s=!!e.block;return t+=s&&!e.inlineOrder?t>0?3e8:-4e8:t>0?1e8:-1e8,new Mi(e,t,t,s,e.widget||null,!1)}static replace(e){let t=!!e.block,s,n;if(e.isBlockGap)s=-5e8,n=4e8;else{let{start:r,end:o}=ld(e,t);s=(r?t?-3e8:-1:5e8)-1,n=(o?t?2e8:1:-6e8)+1}return new Mi(e,s,n,t,e.widget||null,!0)}static line(e){return new an(e)}static set(e,t=!1){return H.of(e,t)}hasHeight(){return this.widget?this.widget.estimatedHeight>-1:!1}}L.none=H.empty;class on extends L{constructor(e){let{start:t,end:s}=ld(e);super(t?-1:5e8,s?1:-6e8,null,e),this.tagName=e.tagName||"span",this.attrs=e.class&&e.attributes?Ha(e.attributes,{class:e.class}):e.class?{class:e.class}:e.attributes||tr}eq(e){return this==e||e instanceof on&&this.tagName==e.tagName&&Wa(this.attrs,e.attrs)}range(e,t=e){if(e>=t)throw new RangeError("Mark decorations may not be empty");return super.range(e,t)}}on.prototype.point=!1;class an extends L{constructor(e){super(-2e8,-2e8,null,e)}eq(e){return e instanceof an&&this.spec.class==e.spec.class&&Wa(this.spec.attributes,e.spec.attributes)}range(e,t=e){if(t!=e)throw new RangeError("Line decoration ranges must be zero-length");return super.range(e,t)}}an.prototype.mapMode=Ee.TrackBefore;an.prototype.point=!0;class Mi extends L{constructor(e,t,s,n,r,o){super(t,s,r,e),this.block=n,this.isReplace=o,this.mapMode=n?t<=0?Ee.TrackBefore:Ee.TrackAfter:Ee.TrackDel}get type(){return this.startSide!=this.endSide?Ce.WidgetRange:this.startSide<=0?Ce.WidgetBefore:Ce.WidgetAfter}get heightRelevant(){return this.block||!!this.widget&&(this.widget.estimatedHeight>=5||this.widget.lineBreaks>0)}eq(e){return e instanceof Mi&&ug(this.widget,e.widget)&&this.block==e.block&&this.startSide==e.startSide&&this.endSide==e.endSide}range(e,t=e){if(this.isReplace&&(e>t||e==t&&this.startSide>0&&this.endSide<=0))throw new RangeError("Invalid range for replacement decoration");if(!this.isReplace&&t!=e)throw new RangeError("Widget decorations can only have zero-length ranges");return super.range(e,t)}}Mi.prototype.point=!0;function ld(i,e=!1){let{inclusiveStart:t,inclusiveEnd:s}=i;return t==null&&(t=i.inclusive),s==null&&(s=i.inclusive),{start:t??e,end:s??e}}function ug(i,e){return i==e||!!(i&&e&&i.compare(e))}function Xi(i,e,t,s=0){let n=t.length-1;n>=0&&t[n]+s>=i?t[n]=Math.max(t[n],e):t.push(i,e)}class Ws extends Kt{constructor(e,t){super(),this.tagName=e,this.attributes=t}eq(e){return e==this||e instanceof Ws&&this.tagName==e.tagName&&Wa(this.attributes,e.attributes)}static create(e){return new Ws(e.tagName,e.attributes||tr)}static set(e,t=!1){return H.of(e,t)}}Ws.prototype.startSide=Ws.prototype.endSide=-1;function qs(i){let e;return i.nodeType==11?e=i.getSelection?i:i.ownerDocument:e=i,e.getSelection()}function Go(i,e){return e?i==e||i.contains(e.nodeType!=1?e.parentNode:e):!1}function Ps(i,e){if(!e.anchorNode)return!1;try{return Go(i,e.anchorNode)}catch{return!1}}function qn(i){return i.nodeType==3?Qs(i,0,i.nodeValue.length).getClientRects():i.nodeType==1?i.getClientRects():[]}function Ms(i,e,t,s){return t?Gl(i,e,t,s,-1)||Gl(i,e,t,s,1):!1}function Zt(i){for(var e=0;;e++)if(i=i.previousSibling,!i)return e}function ir(i){return i.nodeType==1&&/^(DIV|P|LI|UL|OL|BLOCKQUOTE|DD|DT|H\d|SECTION|PRE)$/.test(i.nodeName)}function Gl(i,e,t,s,n){for(;;){if(i==t&&e==s)return!0;if(e==(n<0?0:_t(i))){if(i.nodeName=="DIV")return!1;let r=i.parentNode;if(!r||r.nodeType!=1)return!1;e=Zt(i)+(n<0?0:1),i=r}else if(i.nodeType==1){if(i=i.childNodes[e+(n<0?-1:0)],i.nodeType==1&&i.contentEditable=="false")return!1;e=n<0?_t(i):0}else return!1}}function _t(i){return i.nodeType==3?i.nodeValue.length:i.childNodes.length}function sr(i,e){let t=e?i.left:i.right;return{left:t,right:t,top:i.top,bottom:i.bottom}}function pg(i){let e=i.visualViewport;return e?{left:0,right:e.width,top:0,bottom:e.height}:{left:0,right:i.innerWidth,top:0,bottom:i.innerHeight}}function hd(i,e){let t=e.width/i.offsetWidth,s=e.height/i.offsetHeight;return(t>.995&&t<1.005||!isFinite(t)||Math.abs(e.width-i.offsetWidth)<1)&&(t=1),(s>.995&&s<1.005||!isFinite(s)||Math.abs(e.height-i.offsetHeight)<1)&&(s=1),{scaleX:t,scaleY:s}}function gg(i,e,t,s,n,r,o,a){let l=i.ownerDocument,h=l.defaultView||window;for(let c=i,d=!1;c&&!d;)if(c.nodeType==1){let f,u=c==l.body,p=1,m=1;if(u)f=pg(h);else{if(/^(fixed|sticky)$/.test(getComputedStyle(c).position)&&(d=!0),c.scrollHeight<=c.clientHeight&&c.scrollWidth<=c.clientWidth){c=c.assignedSlot||c.parentNode;continue}let S=c.getBoundingClientRect();({scaleX:p,scaleY:m}=hd(c,S)),f={left:S.left,right:S.left+c.clientWidth*p,top:S.top,bottom:S.top+c.clientHeight*m}}let b=0,x=0;if(n=="nearest")e.top<f.top+o?(x=e.top-(f.top+o),t>0&&e.bottom>f.bottom+x&&(x=e.bottom-f.bottom+o)):e.bottom>f.bottom-o&&(x=e.bottom-f.bottom+o,t<0&&e.top-x<f.top&&(x=e.top-(f.top+o)));else{let S=e.bottom-e.top,C=f.bottom-f.top;x=(n=="center"&&S<=C?e.top+S/2-C/2:n=="start"||n=="center"&&t<0?e.top-o:e.bottom-C+o)-f.top}if(s=="nearest"?e.left<f.left+r?(b=e.left-(f.left+r),t>0&&e.right>f.right+b&&(b=e.right-f.right+r)):e.right>f.right-r&&(b=e.right-f.right+r,t<0&&e.left<f.left+b&&(b=e.left-(f.left+r))):b=(s=="center"?e.left+(e.right-e.left)/2-(f.right-f.left)/2:s=="start"==a?e.left-r:e.right-(f.right-f.left)+r)-f.left,b||x)if(u)h.scrollBy(b,x);else{let S=0,C=0;if(x){let R=c.scrollTop;c.scrollTop+=x/m,C=(c.scrollTop-R)*m}if(b){let R=c.scrollLeft;c.scrollLeft+=b/p,S=(c.scrollLeft-R)*p}e={left:e.left-S,top:e.top-C,right:e.right-S,bottom:e.bottom-C},S&&Math.abs(S-b)<1&&(s="nearest"),C&&Math.abs(C-x)<1&&(n="nearest")}if(u)break;(e.top<f.top||e.bottom>f.bottom||e.left<f.left||e.right>f.right)&&(e={left:Math.max(e.left,f.left),right:Math.min(e.right,f.right),top:Math.max(e.top,f.top),bottom:Math.min(e.bottom,f.bottom)}),c=c.assignedSlot||c.parentNode}else if(c.nodeType==11)c=c.host;else break}function cd(i,e=!0){let t=i.ownerDocument,s=null,n=null;for(let r=i.parentNode;r&&!(r==t.body||(!e||s)&&n);)if(r.nodeType==1)!n&&r.scrollHeight>r.clientHeight&&(n=r),e&&!s&&r.scrollWidth>r.clientWidth&&(s=r),r=r.assignedSlot||r.parentNode;else if(r.nodeType==11)r=r.host;else break;return{x:s,y:n}}class mg{constructor(){this.anchorNode=null,this.anchorOffset=0,this.focusNode=null,this.focusOffset=0}eq(e){return this.anchorNode==e.anchorNode&&this.anchorOffset==e.anchorOffset&&this.focusNode==e.focusNode&&this.focusOffset==e.focusOffset}setRange(e){let{anchorNode:t,focusNode:s}=e;this.set(t,Math.min(e.anchorOffset,t?_t(t):0),s,Math.min(e.focusOffset,s?_t(s):0))}set(e,t,s,n){this.anchorNode=e,this.anchorOffset=t,this.focusNode=s,this.focusOffset=n}}let ci=null;T.safari&&T.safari_version>=26&&(ci=!1);function dd(i){if(i.setActive)return i.setActive();if(ci)return i.focus(ci);let e=[];for(let t=i;t&&(e.push(t,t.scrollTop,t.scrollLeft),t!=t.ownerDocument);t=t.parentNode);if(i.focus(ci==null?{get preventScroll(){return ci={preventScroll:!0},!0}}:void 0),!ci){ci=!1;for(let t=0;t<e.length;){let s=e[t++],n=e[t++],r=e[t++];s.scrollTop!=n&&(s.scrollTop=n),s.scrollLeft!=r&&(s.scrollLeft=r)}}}let Yl;function Qs(i,e,t=e){let s=Yl||(Yl=document.createRange());return s.setEnd(i,t),s.setStart(i,e),s}function Ji(i,e,t,s){let n={key:e,code:e,keyCode:t,which:t,cancelable:!0};s&&({altKey:n.altKey,ctrlKey:n.ctrlKey,shiftKey:n.shiftKey,metaKey:n.metaKey}=s);let r=new KeyboardEvent("keydown",n);r.synthetic=!0,i.dispatchEvent(r);let o=new KeyboardEvent("keyup",n);return o.synthetic=!0,i.dispatchEvent(o),r.defaultPrevented||o.defaultPrevented}function bg(i){for(;i;){if(i&&(i.nodeType==9||i.nodeType==11&&i.host))return i;i=i.assignedSlot||i.parentNode}return null}function yg(i,e){let t=e.focusNode,s=e.focusOffset;if(!t||e.anchorNode!=t||e.anchorOffset!=s)return!1;for(s=Math.min(s,_t(t));;)if(s){if(t.nodeType!=1)return!1;let n=t.childNodes[s-1];n.contentEditable=="false"?s--:(t=n,s=_t(t))}else{if(t==i)return!0;s=Zt(t),t=t.parentNode}}function fd(i){return i instanceof Window?i.pageYOffset>Math.max(0,i.document.documentElement.scrollHeight-i.innerHeight-4):i.scrollTop>Math.max(1,i.scrollHeight-i.clientHeight-4)}function ud(i,e){for(let t=i,s=e;;){if(t.nodeType==3&&s>0)return{node:t,offset:s};if(t.nodeType==1&&s>0){if(t.contentEditable=="false")return null;t=t.childNodes[s-1],s=_t(t)}else if(t.parentNode&&!ir(t))s=Zt(t),t=t.parentNode;else return null}}function pd(i,e){for(let t=i,s=e;;){if(t.nodeType==3&&s<t.nodeValue.length)return{node:t,offset:s};if(t.nodeType==1&&s<t.childNodes.length){if(t.contentEditable=="false")return null;t=t.childNodes[s],s=0}else if(t.parentNode&&!ir(t))s=Zt(t)+1,t=t.parentNode;else return null}}class st{constructor(e,t,s=!0){this.node=e,this.offset=t,this.precise=s}static before(e,t){return new st(e.parentNode,Zt(e),t)}static after(e,t){return new st(e.parentNode,Zt(e)+1,t)}}var G=(function(i){return i[i.LTR=0]="LTR",i[i.RTL=1]="RTL",i})(G||(G={}));const Ti=G.LTR,qa=G.RTL;function gd(i){let e=[];for(let t=0;t<i.length;t++)e.push(1<<+i[t]);return e}const xg=gd("88888888888888888888888888888888888666888888787833333333337888888000000000000000000000000008888880000000000000000000000000088888888888888888888888888888888888887866668888088888663380888308888800000000000000000000000800000000000000000000000000000008"),vg=gd("4444448826627288999999999992222222222222222222222222222222222222222222222229999999999999999999994444444444644222822222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222222999999949999999229989999223333333333"),Yo=Object.create(null),ut=[];for(let i of["()","[]","{}"]){let e=i.charCodeAt(0),t=i.charCodeAt(1);Yo[e]=t,Yo[t]=-e}function md(i){return i<=247?xg[i]:1424<=i&&i<=1524?2:1536<=i&&i<=1785?vg[i-1536]:1774<=i&&i<=2220?4:8192<=i&&i<=8204?256:64336<=i&&i<=65023?4:1}const wg=/[\u0590-\u05f4\u0600-\u06ff\u0700-\u08ac\ufb50-\ufdff]/;class vt{get dir(){return this.level%2?qa:Ti}constructor(e,t,s){this.from=e,this.to=t,this.level=s}side(e,t){return this.dir==t==e?this.to:this.from}forward(e,t){return e==(this.dir==t)}static find(e,t,s,n){let r=-1;for(let o=0;o<e.length;o++){let a=e[o];if(a.from<=t&&a.to>=t){if(a.level==s)return o;(r<0||(n!=0?n<0?a.from<t:a.to>t:e[r].level>a.level))&&(r=o)}}if(r<0)throw new RangeError("Index out of range");return r}}function bd(i,e){if(i.length!=e.length)return!1;for(let t=0;t<i.length;t++){let s=i[t],n=e[t];if(s.from!=n.from||s.to!=n.to||s.direction!=n.direction||!bd(s.inner,n.inner))return!1}return!0}const K=[];function kg(i,e,t,s,n){for(let r=0;r<=s.length;r++){let o=r?s[r-1].to:e,a=r<s.length?s[r].from:t,l=r?256:n;for(let h=o,c=l,d=l;h<a;h++){let f=md(i.charCodeAt(h));f==512?f=c:f==8&&d==4&&(f=16),K[h]=f==4?2:f,f&7&&(d=f),c=f}for(let h=o,c=l,d=l;h<a;h++){let f=K[h];if(f==128)h<a-1&&c==K[h+1]&&c&24?f=K[h]=c:K[h]=256;else if(f==64){let u=h+1;for(;u<a&&K[u]==64;)u++;let p=h&&c==8||u<t&&K[u]==8?d==1?1:8:256;for(let m=h;m<u;m++)K[m]=p;h=u-1}else f==8&&d==1&&(K[h]=1);c=f,f&7&&(d=f)}}}function Sg(i,e,t,s,n){let r=n==1?2:1;for(let o=0,a=0,l=0;o<=s.length;o++){let h=o?s[o-1].to:e,c=o<s.length?s[o].from:t;for(let d=h,f,u,p;d<c;d++)if(u=Yo[f=i.charCodeAt(d)])if(u<0){for(let m=a-3;m>=0;m-=3)if(ut[m+1]==-u){let b=ut[m+2],x=b&2?n:b&4?b&1?r:n:0;x&&(K[d]=K[ut[m]]=x),a=m;break}}else{if(ut.length==189)break;ut[a++]=d,ut[a++]=f,ut[a++]=l}else if((p=K[d])==2||p==1){let m=p==n;l=m?0:1;for(let b=a-3;b>=0;b-=3){let x=ut[b+2];if(x&2)break;if(m)ut[b+2]|=2;else{if(x&4)break;ut[b+2]|=4}}}}}function Cg(i,e,t,s){for(let n=0,r=s;n<=t.length;n++){let o=n?t[n-1].to:i,a=n<t.length?t[n].from:e;for(let l=o;l<a;){let h=K[l];if(h==256){let c=l+1;for(;;)if(c==a){if(n==t.length)break;c=t[n++].to,a=n<t.length?t[n].from:e}else if(K[c]==256)c++;else break;let d=r==1,f=(c<e?K[c]:s)==1,u=d==f?d?1:2:s;for(let p=c,m=n,b=m?t[m-1].to:i;p>l;)p==b&&(p=t[--m].from,b=m?t[m-1].to:i),K[--p]=u;l=c}else r=h,l++}}}function Zo(i,e,t,s,n,r,o){let a=s%2?2:1;if(s%2==n%2)for(let l=e,h=0;l<t;){let c=!0,d=!1;if(h==r.length||l<r[h].from){let m=K[l];m!=a&&(c=!1,d=m==16)}let f=!c&&a==1?[]:null,u=c?s:s+1,p=l;e:for(;;)if(h<r.length&&p==r[h].from){if(d)break e;let m=r[h];if(!c)for(let b=m.to,x=h+1;;){if(b==t)break e;if(x<r.length&&r[x].from==b)b=r[x++].to;else{if(K[b]==a)break e;break}}if(h++,f)f.push(m);else{m.from>l&&o.push(new vt(l,m.from,u));let b=m.direction==Ti!=!(u%2);ea(i,b?s+1:s,n,m.inner,m.from,m.to,o),l=m.to}p=m.to}else{if(p==t||(c?K[p]!=a:K[p]==a))break;p++}f?Zo(i,l,p,s+1,n,f,o):l<p&&o.push(new vt(l,p,u)),l=p}else for(let l=t,h=r.length;l>e;){let c=!0,d=!1;if(!h||l>r[h-1].to){let m=K[l-1];m!=a&&(c=!1,d=m==16)}let f=!c&&a==1?[]:null,u=c?s:s+1,p=l;e:for(;;)if(h&&p==r[h-1].to){if(d)break e;let m=r[--h];if(!c)for(let b=m.from,x=h;;){if(b==e)break e;if(x&&r[x-1].to==b)b=r[--x].from;else{if(K[b-1]==a)break e;break}}if(f)f.push(m);else{m.to<l&&o.push(new vt(m.to,l,u));let b=m.direction==Ti!=!(u%2);ea(i,b?s+1:s,n,m.inner,m.from,m.to,o),l=m.from}p=m.from}else{if(p==e||(c?K[p-1]!=a:K[p-1]==a))break;p--}f?Zo(i,p,l,s+1,n,f,o):p<l&&o.push(new vt(p,l,u)),l=p}}function ea(i,e,t,s,n,r,o){let a=e%2?2:1;kg(i,n,r,s,a),Sg(i,n,r,s,a),Cg(n,r,s,a),Zo(i,n,r,e,t,s,o)}function Og(i,e,t){if(!i)return[new vt(0,0,e==qa?1:0)];if(e==Ti&&!t.length&&!wg.test(i))return yd(i.length);if(t.length)for(;i.length>K.length;)K[K.length]=256;let s=[],n=e==Ti?0:1;return ea(i,n,n,t,0,i.length,s),s}function yd(i){return[new vt(0,i,0)]}let xd="";function Ag(i,e,t,s,n){var r;let o=s.head-i.from,a=vt.find(e,o,(r=s.bidiLevel)!==null&&r!==void 0?r:-1,s.assoc),l=e[a],h=l.side(n,t);if(o==h){let f=a+=n?1:-1;if(f<0||f>=e.length)return null;l=e[a=f],o=l.side(!n,t),h=l.side(n,t)}let c=xe(i.text,o,l.forward(n,t));(c<l.from||c>l.to)&&(c=h),xd=i.text.slice(Math.min(o,c),Math.max(o,c));let d=a==(n?e.length-1:0)?null:e[a+(n?1:-1)];return d&&c==h&&d.level+(n?0:1)<l.level?k.cursor(d.side(!n,t)+i.from,d.forward(n,t)?1:-1,d.level):k.cursor(c+i.from,l.forward(n,t)?-1:1,l.level)}function $g(i,e,t){for(let s=e;s<t;s++){let n=md(i.charCodeAt(s));if(n==1)return Ti;if(n==2||n==4)return qa}return Ti}const vd=D.define(),wd=D.define(),kd=D.define(),Sd=D.define(),ta=D.define(),Cd=D.define(),Od=D.define(),Qa=D.define(),Va=D.define(),Ad=D.define({combine:i=>i.some(e=>e)}),$d=D.define({combine:i=>i.some(e=>e)}),Pd=D.define();class Ki{constructor(e,t,s,n,r,o=!1){this.range=e,this.y=t,this.x=s,this.yMargin=n,this.xMargin=r,this.isSnapshot=o}map(e){return e.empty?this:new Ki(this.range.map(e),this.y,this.x,this.yMargin,this.xMargin,this.isSnapshot)}clip(e){return this.range.to<=e.doc.length?this:new Ki(k.cursor(e.doc.length),this.y,this.x,this.yMargin,this.xMargin,this.isSnapshot)}}const xn=N.define({map:(i,e)=>i.map(e)}),Md=N.define();function Ie(i,e,t){let s=i.facet(Sd);s.length?s[0](e):window.onerror&&window.onerror(String(e),t,void 0,void 0,e)||(t?console.error(t+":",e):console.error(e))}const Dt=D.define({combine:i=>i.length?i[0]:!0});let Pg=0;const qi=D.define({combine(i){return i.filter((e,t)=>{for(let s=0;s<t;s++)if(i[s].plugin==e.plugin)return!1;return!0})}});class de{constructor(e,t,s,n,r){this.id=e,this.create=t,this.domEventHandlers=s,this.domEventObservers=n,this.baseExtensions=r(this),this.extension=this.baseExtensions.concat(qi.of({plugin:this,arg:void 0}))}of(e){return this.baseExtensions.concat(qi.of({plugin:this,arg:e}))}static define(e,t){const{eventHandlers:s,eventObservers:n,provide:r,decorations:o}=t||{};return new de(Pg++,e,s,n,a=>{let l=[];return o&&l.push(Er.of(h=>{let c=h.plugin(a);return c?o(c):L.none})),r&&l.push(r(a)),l})}static fromClass(e,t){return de.define((s,n)=>new e(s,n),t)}}class io{constructor(e){this.spec=e,this.mustUpdate=null,this.value=null}get plugin(){return this.spec&&this.spec.plugin}update(e){if(this.value){if(this.mustUpdate){let t=this.mustUpdate;if(this.mustUpdate=null,this.value.update)try{this.value.update(t)}catch(s){if(Ie(t.state,s,"CodeMirror plugin crashed"),this.value.destroy)try{this.value.destroy()}catch{}this.deactivate()}}}else if(this.spec)try{this.value=this.spec.plugin.create(e,this.spec.arg)}catch(t){Ie(e.state,t,"CodeMirror plugin crashed"),this.deactivate()}return this}destroy(e){var t;if(!((t=this.value)===null||t===void 0)&&t.destroy)try{this.value.destroy()}catch(s){Ie(e.state,s,"CodeMirror plugin crashed")}}deactivate(){this.spec=this.value=null}}const Td=D.define(),Ua=D.define(),Er=D.define(),Dd=D.define(),ja=D.define(),ln=D.define(),Ed=D.define();function Zl(i,e){let t=i.state.facet(Ed);if(!t.length)return t;let s=t.map(r=>r instanceof Function?r(i):r),n=[];return H.spans(s,e.from,e.to,{point(){},span(r,o,a,l){let h=r-e.from,c=o-e.from,d=n;for(let f=a.length-1;f>=0;f--,l--){let u=a[f].spec.bidiIsolate,p;if(u==null&&(u=$g(e.text,h,c)),l>0&&d.length&&(p=d[d.length-1]).to==h&&p.direction==u)p.to=c,d=p.inner;else{let m={from:h,to:c,direction:u,inner:[]};d.push(m),d=m.inner}}}}),n}const Rd=D.define();function Xa(i){let e=0,t=0,s=0,n=0;for(let r of i.state.facet(Rd)){let o=r(i);o&&(o.left!=null&&(e=Math.max(e,o.left)),o.right!=null&&(t=Math.max(t,o.right)),o.top!=null&&(s=Math.max(s,o.top)),o.bottom!=null&&(n=Math.max(n,o.bottom)))}return{left:e,right:t,top:s,bottom:n}}const ws=D.define();class Ke{constructor(e,t,s,n){this.fromA=e,this.toA=t,this.fromB=s,this.toB=n}join(e){return new Ke(Math.min(this.fromA,e.fromA),Math.max(this.toA,e.toA),Math.min(this.fromB,e.fromB),Math.max(this.toB,e.toB))}addToSet(e){let t=e.length,s=this;for(;t>0;t--){let n=e[t-1];if(!(n.fromA>s.toA)){if(n.toA<s.fromA)break;s=s.join(n),e.splice(t-1,1)}}return e.splice(t,0,s),e}static extendWithRanges(e,t){if(t.length==0)return e;let s=[];for(let n=0,r=0,o=0;;){let a=n<e.length?e[n].fromB:1e9,l=r<t.length?t[r]:1e9,h=Math.min(a,l);if(h==1e9)break;let c=h+o,d=h,f=c;for(;;)if(r<t.length&&t[r]<=d){let u=t[r+1];r+=2,d=Math.max(d,u);for(let p=n;p<e.length&&e[p].fromB<=d;p++)o=e[p].toA-e[p].toB;f=Math.max(f,u+o)}else if(n<e.length&&e[n].fromB<=d){let u=e[n++];d=Math.max(d,u.toB),f=Math.max(f,u.toA),o=u.toA-u.toB}else break;s.push(new Ke(c,f,h,d))}return s}}class nr{constructor(e,t,s){this.view=e,this.state=t,this.transactions=s,this.flags=0,this.startState=e.state,this.changes=ue.empty(this.startState.doc.length);for(let r of s)this.changes=this.changes.compose(r.changes);let n=[];this.changes.iterChangedRanges((r,o,a,l)=>n.push(new Ke(r,o,a,l))),this.changedRanges=n}static create(e,t,s){return new nr(e,t,s)}get viewportChanged(){return(this.flags&4)>0}get viewportMoved(){return(this.flags&8)>0}get heightChanged(){return(this.flags&2)>0}get geometryChanged(){return this.docChanged||(this.flags&18)>0}get focusChanged(){return(this.flags&1)>0}get docChanged(){return!this.changes.empty}get selectionSet(){return this.transactions.some(e=>e.selection)}get empty(){return this.flags==0&&this.transactions.length==0}}const Mg=[];class oe{constructor(e,t,s=0){this.dom=e,this.length=t,this.flags=s,this.parent=null,e.cmTile=this}get breakAfter(){return this.flags&1}get children(){return Mg}isWidget(){return!1}get isHidden(){return!1}isComposite(){return!1}isLine(){return!1}isText(){return!1}isBlock(){return!1}get domAttrs(){return null}sync(e){if(this.flags|=2,this.flags&4){this.flags&=-5;let t=this.domAttrs;t&&dg(this.dom,t)}}toString(){return this.constructor.name+(this.children.length?`(${this.children})`:"")+(this.breakAfter?"#":"")}destroy(){this.parent=null}setDOM(e){this.dom=e,e.cmTile=this}get posAtStart(){return this.parent?this.parent.posBefore(this):0}get posAtEnd(){return this.posAtStart+this.length}posBefore(e,t=this.posAtStart){let s=t;for(let n of this.children){if(n==e)return s;s+=n.length+n.breakAfter}throw new RangeError("Invalid child in posBefore")}posAfter(e){return this.posBefore(e)+e.length}covers(e){return!0}coordsIn(e,t){return null}domPosFor(e,t){let s=Zt(this.dom),n=this.length?e>0:t>0;return new st(this.parent.dom,s+(n?1:0),e==0||e==this.length)}markDirty(e){this.flags&=-3,e&&(this.flags|=4),this.parent&&this.parent.flags&2&&this.parent.markDirty(!1)}get overrideDOMText(){return null}get root(){for(let e=this;e;e=e.parent)if(e instanceof Br)return e;return null}static get(e){return e.cmTile}}class Rr extends oe{constructor(e){super(e,0),this._children=[]}isComposite(){return!0}get children(){return this._children}get lastChild(){return this.children.length?this.children[this.children.length-1]:null}append(e){this.children.push(e),e.parent=this}sync(e){if(this.flags&2)return;super.sync(e);let t=this.dom,s=null,n,r=(e==null?void 0:e.node)==t?e:null,o=0;for(let a of this.children){if(a.sync(e),o+=a.length+a.breakAfter,n=s?s.nextSibling:t.firstChild,r&&n!=a.dom&&(r.written=!0),a.dom.parentNode==t)for(;n&&n!=a.dom;)n=eh(n);else t.insertBefore(a.dom,n);s=a.dom}for(n=s?s.nextSibling:t.firstChild,r&&n&&(r.written=!0);n;)n=eh(n);this.length=o}}function eh(i){let e=i.nextSibling;return i.parentNode.removeChild(i),e}class Br extends Rr{constructor(e,t){super(t),this.view=e}owns(e){for(;e;e=e.parent)if(e==this)return!0;return!1}isBlock(){return!0}nearest(e){for(;;){if(!e)return null;let t=oe.get(e);if(t&&this.owns(t))return t;e=e.parentNode}}blockTiles(e){for(let t=[],s=this,n=0,r=0;;)if(n==s.children.length){if(!t.length)return;s=s.parent,s.breakAfter&&r++,n=t.pop()}else{let o=s.children[n++];if(o instanceof Et)t.push(n),s=o,n=0;else{let a=r+o.length,l=e(o,r);if(l!==void 0)return l;r=a+o.breakAfter}}}resolveBlock(e,t){let s,n=-1,r,o=-1;if(this.blockTiles((a,l)=>{let h=l+a.length;if(e>=l&&e<=h){if(a.isWidget()&&t>=-1&&t<=1){if(a.flags&32)return!0;a.flags&16&&(s=void 0)}(l<e||e==h&&(t<-1?a.length:a.covers(1)))&&(!s||!a.isWidget()&&s.isWidget())&&(s=a,n=e-l),(h>e||e==l&&(t>1?a.length:a.covers(-1)))&&(!r||!a.isWidget()&&r.isWidget())&&(r=a,o=e-l)}}),!s&&!r)throw new Error("No tile at position "+e);return s&&t<0||!r?{tile:s,offset:n}:{tile:r,offset:o}}}class Et extends Rr{constructor(e,t){super(e),this.wrapper=t}isBlock(){return!0}covers(e){return this.children.length?e<0?this.children[0].covers(-1):this.lastChild.covers(1):!1}get domAttrs(){return this.wrapper.attributes}static of(e,t){let s=new Et(t||document.createElement(e.tagName),e);return t||(s.flags|=4),s}}class ns extends Rr{constructor(e,t){super(e),this.attrs=t}isLine(){return!0}static start(e,t,s){let n=new ns(t||document.createElement("div"),e);return(!t||!s)&&(n.flags|=4),n}get domAttrs(){return this.attrs}resolveInline(e,t,s){let n=null,r=-1,o=null,a=-1;function l(c,d){for(let f=0,u=0;f<c.children.length&&u<=d;f++){let p=c.children[f],m=u+p.length;m>=d&&(p.isComposite()?l(p,d-u):(!o||o.isHidden&&(t>0||s&&Dg(o,p)))&&(m>d||p.flags&32)?(o=p,a=d-u):(u<d||p.flags&16&&!p.isHidden)&&(n=p,r=d-u)),u=m}}l(this,e);let h=(t<0?n:o)||n||o;return h?{tile:h,offset:h==n?r:a}:null}coordsIn(e,t){let s=this.resolveInline(e,t,!0);return s?s.tile.coordsIn(Math.max(0,s.offset),t):Tg(this)}domIn(e,t){let s=this.resolveInline(e,t);if(s){let{tile:n,offset:r}=s;if(this.dom.contains(n.dom))return n.isText()?new st(n.dom,Math.min(n.dom.nodeValue.length,r)):n.domPosFor(r,n.flags&16?1:n.flags&32?-1:t);let o=s.tile.parent,a=!1;for(let l of o.children){if(a)return new st(l.dom,0);l==s.tile&&(a=!0)}}return new st(this.dom,0)}}function Tg(i){let e=i.dom.lastChild;if(!e)return i.dom.getBoundingClientRect();let t=qn(e);return t[t.length-1]||null}function Dg(i,e){let t=i.coordsIn(0,1),s=e.coordsIn(0,1);return t&&s&&s.top<t.bottom}class Le extends Rr{constructor(e,t){super(e),this.mark=t}get domAttrs(){return this.mark.attrs}static of(e,t){let s=new Le(t||document.createElement(e.tagName),e);return t||(s.flags|=4),s}}class bi extends oe{constructor(e,t){super(e,t.length),this.text=t}sync(e){this.flags&2||(super.sync(e),this.dom.nodeValue!=this.text&&(e&&e.node==this.dom&&(e.written=!0),this.dom.nodeValue=this.text))}isText(){return!0}toString(){return JSON.stringify(this.text)}coordsIn(e,t){let s=this.dom.nodeValue.length;e>s&&(e=s);let n=e,r=e,o=0;e==0&&t<0||e==s&&t>=0?T.chrome||T.gecko||(e?(n--,o=1):r<s&&(r++,o=-1)):t<0?n--:r<s&&r++;let a=Qs(this.dom,n,r).getClientRects();if(!a.length)return null;let l=a[(o?o<0:t>=0)?0:a.length-1];return T.safari&&!o&&l.width==0&&(l=Array.prototype.find.call(a,h=>h.width)||l),o?sr(l,o<0):l||null}static of(e,t){let s=new bi(t||document.createTextNode(e),e);return t||(s.flags|=2),s}}class Di extends oe{constructor(e,t,s,n){super(e,t,n),this.widget=s}isWidget(){return!0}get isHidden(){return this.widget.isHidden}covers(e){return this.flags&48?!1:(this.flags&(e<0?64:128))>0}coordsIn(e,t){return this.coordsInWidget(e,t,!1)}coordsInWidget(e,t,s){let n=this.widget.coordsAt(this.dom,e,t);if(n)return n;if(s)return sr(this.dom.getBoundingClientRect(),this.length?e==0:t<=0);{let r=this.dom.getClientRects(),o=null;if(!r.length)return null;let a=this.flags&16?!0:this.flags&32?!1:e>0;for(let l=a?r.length-1:0;o=r[l],!(e>0?l==0:l==r.length-1||o.top<o.bottom);l+=a?-1:1);return sr(o,!a)}}get overrideDOMText(){if(!this.length)return V.empty;let{root:e}=this;if(!e)return V.empty;let t=this.posAtStart;return e.view.state.doc.slice(t,t+this.length)}destroy(){super.destroy(),this.widget.destroy(this.dom)}static of(e,t,s,n,r){return r||(r=e.toDOM(t),e.editable||(r.contentEditable="false")),new Di(r,s,e,n)}}class rr extends oe{constructor(e){let t=document.createElement("img");t.className="cm-widgetBuffer",t.setAttribute("aria-hidden","true"),super(t,0,e)}get isHidden(){return!0}get overrideDOMText(){return V.empty}coordsIn(e){return this.dom.getBoundingClientRect()}}class Eg{constructor(e){this.index=0,this.beforeBreak=!1,this.parents=[],this.tile=e}advance(e,t,s){let{tile:n,index:r,beforeBreak:o,parents:a}=this;for(;e||t>0;)if(n.isComposite())if(o){if(!e)break;s&&s.break(),e--,o=!1}else if(r==n.children.length){if(!e&&!a.length)break;s&&s.leave(n),o=!!n.breakAfter,{tile:n,index:r}=a.pop(),r++}else{let l=n.children[r],h=l.breakAfter;(t>0?l.length<=e:l.length<e)&&(!s||s.skip(l,0,l.length)!==!1||!l.isComposite)?(o=!!h,r++,e-=l.length):(a.push({tile:n,index:r}),n=l,r=0,s&&l.isComposite()&&s.enter(l))}else if(r==n.length)o=!!n.breakAfter,{tile:n,index:r}=a.pop(),r++;else if(e){let l=Math.min(e,n.length-r);s&&s.skip(n,r,r+l),e-=l,r+=l}else break;return this.tile=n,this.index=r,this.beforeBreak=o,this}get root(){return this.parents.length?this.parents[0].tile:this.tile}}class Rg{constructor(e,t,s,n){this.from=e,this.to=t,this.wrapper=s,this.rank=n}}class Bg{constructor(e,t,s){this.cache=e,this.root=t,this.blockWrappers=s,this.curLine=null,this.lastBlock=null,this.afterWidget=null,this.pos=0,this.wrappers=[],this.wrapperPos=0}addText(e,t,s,n){var r;this.flushBuffer();let o=this.ensureMarks(t,s),a=o.lastChild;if(a&&a.isText()&&!(a.flags&8)&&a.length+e.length<512){this.cache.reused.set(a,2);let l=o.children[o.children.length-1]=new bi(a.dom,a.text+e);l.parent=o}else o.append(n||bi.of(e,(r=this.cache.find(bi))===null||r===void 0?void 0:r.dom));this.pos+=e.length,this.afterWidget=null}addComposition(e,t){let s=this.curLine;s.dom!=t.line.dom&&(s.setDOM(this.cache.reused.has(t.line)?so(t.line.dom):t.line.dom),this.cache.reused.set(t.line,2));let n=s;for(let a=t.marks.length-1;a>=0;a--){let l=t.marks[a],h=n.lastChild;if(h instanceof Le&&h.mark.eq(l.mark))h.dom!=l.dom&&h.setDOM(so(l.dom)),n=h;else{if(this.cache.reused.get(l)){let d=oe.get(l.dom);d&&d.setDOM(so(l.dom))}let c=Le.of(l.mark,l.dom);n.append(c),n=c}this.cache.reused.set(l,2)}let r=oe.get(e.text);r&&this.cache.reused.set(r,2);let o=new bi(e.text,e.text.nodeValue);o.flags|=8,n.append(o)}addInlineWidget(e,t,s){let n=this.afterWidget&&e.flags&48&&(this.afterWidget.flags&48)==(e.flags&48);n||this.flushBuffer();let r=this.ensureMarks(t,s);!n&&!(e.flags&16)&&r.append(this.getBuffer(1)),r.append(e),this.pos+=e.length,this.afterWidget=e}addMark(e,t,s){this.flushBuffer(),this.ensureMarks(t,s).append(e),this.pos+=e.length,this.afterWidget=null}addBlockWidget(e){this.getBlockPos().append(e),this.pos+=e.length,this.lastBlock=e,this.endLine()}continueWidget(e){let t=this.afterWidget||this.lastBlock;t.length+=e,this.pos+=e}addLineStart(e,t){var s;e||(e=Bd);let n=ns.start(e,t||((s=this.cache.find(ns))===null||s===void 0?void 0:s.dom),!!t);this.getBlockPos().append(this.lastBlock=this.curLine=n)}addLine(e){this.getBlockPos().append(e),this.pos+=e.length,this.lastBlock=e,this.endLine()}addBreak(){this.lastBlock.flags|=1,this.endLine(),this.pos++}addLineStartIfNotCovered(e){this.blockPosCovered()||this.addLineStart(e)}ensureLine(e){this.curLine||this.addLineStart(e)}ensureMarks(e,t){var s;let n=this.curLine;for(let r=e.length-1;r>=0;r--){let o=e[r],a;if(t>0&&(a=n.lastChild)&&a instanceof Le&&a.mark.eq(o))n=a,t--;else{let l=Le.of(o,(s=this.cache.find(Le,h=>h.mark.eq(o)))===null||s===void 0?void 0:s.dom);n.append(l),n=l,t=0}}return n}endLine(){if(this.curLine){this.flushBuffer();let e=this.curLine.lastChild;(!e||!th(this.curLine,!1)||e.dom.nodeName!="BR"&&e.isWidget()&&!(T.ios&&th(this.curLine,!0)))&&this.curLine.append(this.cache.findWidget(no,0,32)||new Di(no.toDOM(),0,no,32)),this.curLine=this.afterWidget=null}}updateBlockWrappers(){this.wrapperPos>this.pos+1e4&&(this.blockWrappers.goto(this.pos),this.wrappers.length=0);for(let e=this.wrappers.length-1;e>=0;e--)this.wrappers[e].to<this.pos&&this.wrappers.splice(e,1);for(let e=this.blockWrappers;e.value&&e.from<=this.pos;e.next())if(e.to>=this.pos){let t=new Rg(e.from,e.to,e.value,e.rank),s=this.wrappers.length;for(;s>0&&(this.wrappers[s-1].rank-t.rank||this.wrappers[s-1].to-t.to)<0;)s--;this.wrappers.splice(s,0,t)}this.wrapperPos=this.pos}getBlockPos(){var e;this.updateBlockWrappers();let t=this.root;for(let s of this.wrappers){let n=t.lastChild;if(s.from<this.pos&&n instanceof Et&&n.wrapper.eq(s.wrapper))t=n;else{let r=Et.of(s.wrapper,(e=this.cache.find(Et,o=>o.wrapper.eq(s.wrapper)))===null||e===void 0?void 0:e.dom);t.append(r),t=r}}return t}blockPosCovered(){let e=this.lastBlock;return e!=null&&!e.breakAfter&&(!e.isWidget()||(e.flags&160)>0)}getBuffer(e){let t=2|(e<0?16:32),s=this.cache.find(rr,void 0,1);return s&&(s.flags=t),s||new rr(t)}flushBuffer(){this.afterWidget&&!(this.afterWidget.flags&32)&&(this.afterWidget.parent.append(this.getBuffer(-1)),this.afterWidget=null)}}class _g{constructor(e){this.skipCount=0,this.text="",this.textOff=0,this.cursor=e.iter()}skip(e){this.textOff+e<=this.text.length?this.textOff+=e:(this.skipCount+=e-(this.text.length-this.textOff),this.text="",this.textOff=0)}next(e){if(this.textOff==this.text.length){let{value:n,lineBreak:r,done:o}=this.cursor.next(this.skipCount);if(this.skipCount=0,o)throw new Error("Ran out of text content when drawing inline views");this.text=n;let a=this.textOff=Math.min(e,n.length);return r?null:n.slice(0,a)}let t=Math.min(this.text.length,this.textOff+e),s=this.text.slice(this.textOff,t);return this.textOff=t,s}}const or=[Di,ns,bi,Le,rr,Et,Br];for(let i=0;i<or.length;i++)or[i].bucket=i;class Lg{constructor(e){this.view=e,this.buckets=or.map(()=>[]),this.index=or.map(()=>0),this.reused=new Map}add(e){let t=e.constructor.bucket,s=this.buckets[t];s.length<6?s.push(e):s[this.index[t]=(this.index[t]+1)%6]=e}find(e,t,s=2){let n=e.bucket,r=this.buckets[n],o=this.index[n];for(let a=r.length-1;a>=0;a--){let l=(a+o)%r.length,h=r[l];if((!t||t(h))&&!this.reused.has(h))return r.splice(l,1),l<o&&this.index[n]--,this.reused.set(h,s),h}return null}findWidget(e,t,s){let n=this.buckets[0];if(n.length)for(let r=0,o=0;;r++){if(r==n.length){if(o)return null;o=1,r=0}let a=n[r];if(!this.reused.has(a)&&(o==0?a.widget.compare(e):a.widget.constructor==e.constructor&&e.updateDOM(a.dom,this.view,a.widget)))return n.splice(r,1),r<this.index[0]&&this.index[0]--,a.widget==e&&a.length==t&&(a.flags&497)==s?(this.reused.set(a,1),a):(this.reused.set(a,2),new Di(a.dom,t,e,a.flags&-498|s))}}reuse(e){return this.reused.set(e,1),e}maybeReuse(e,t=2){if(!this.reused.has(e))return this.reused.set(e,t),e.dom}clear(){for(let e=0;e<this.buckets.length;e++)this.buckets[e].length=this.index[e]=0}}class Ig{constructor(e,t,s,n,r){this.view=e,this.decorations=n,this.disallowBlockEffectsFor=r,this.openWidget=!1,this.openMarks=0,this.cache=new Lg(e),this.text=new _g(e.state.doc),this.builder=new Bg(this.cache,new Br(e,e.contentDOM),H.iter(s)),this.cache.reused.set(t,2),this.old=new Eg(t),this.reuseWalker={skip:(o,a,l)=>{if(this.cache.add(o),o.isComposite())return!1},enter:o=>this.cache.add(o),leave:()=>{},break:()=>{}}}run(e,t){let s=t&&this.getCompositionContext(t.text);for(let n=0,r=0,o=0;;){let a=o<e.length?e[o++]:null,l=a?a.fromA:this.old.root.length;if(l>n){let h=l-n;this.preserve(h,!o,!a),n=l,r+=h}if(!a)break;t&&a.fromA<=t.range.fromA&&a.toA>=t.range.toA?(this.forward(a.fromA,t.range.fromA,t.range.fromA<t.range.toA?1:-1),this.emit(r,t.range.fromB),this.cache.clear(),this.builder.addComposition(t,s),this.text.skip(t.range.toB-t.range.fromB),this.forward(t.range.fromA,a.toA),this.emit(t.range.toB,a.toB)):(this.forward(a.fromA,a.toA),this.emit(r,a.toB)),r=a.toB,n=a.toA}return this.builder.curLine&&this.builder.endLine(),this.builder.root}preserve(e,t,s){let n=Fg(this.old),r=this.openMarks;this.old.advance(e,s?1:-1,{skip:(o,a,l)=>{if(o.isWidget())if(this.openWidget)this.builder.continueWidget(l-a);else{let h=l>0||a<o.length?Di.of(o.widget,this.view,l-a,o.flags&496,this.cache.maybeReuse(o)):this.cache.reuse(o);h.flags&256?(h.flags&=-2,this.builder.addBlockWidget(h)):(this.builder.ensureLine(null),this.builder.addInlineWidget(h,n,r),r=n.length)}else if(o.isText())this.builder.ensureLine(null),!a&&l==o.length&&!this.cache.reused.has(o)?this.builder.addText(o.text,n,r,this.cache.reuse(o)):(this.cache.add(o),this.builder.addText(o.text.slice(a,l),n,r)),r=n.length;else if(o.isLine())o.flags&=-2,this.cache.reused.set(o,1),this.builder.addLine(o);else if(o instanceof rr)this.cache.add(o);else if(o instanceof Le)this.builder.ensureLine(null),this.builder.addMark(o,n,r),this.cache.reused.set(o,1),r=n.length;else return!1;this.openWidget=!1},enter:o=>{o.isLine()?this.builder.addLineStart(o.attrs,this.cache.maybeReuse(o)):(this.cache.add(o),o instanceof Le&&n.unshift(o.mark)),this.openWidget=!1},leave:o=>{o.isLine()?n.length&&(n.length=r=0):o instanceof Le&&(n.shift(),r=Math.min(r,n.length))},break:()=>{this.builder.addBreak(),this.openWidget=!1}}),this.text.skip(e)}emit(e,t){let s=null,n=this.builder,r=0,o=H.spans(this.decorations,e,t,{point:(a,l,h,c,d,f)=>{if(h instanceof Mi){if(this.disallowBlockEffectsFor[f]){if(h.block)throw new RangeError("Block decorations may not be specified via plugins");if(l>this.view.state.doc.lineAt(a).to)throw new RangeError("Decorations that replace line breaks may not be specified via plugins")}if(r=c.length,d>c.length)n.continueWidget(l-a);else{let u=h.widget||(h.block?rs.block:rs.inline),p=Ng(h),m=this.cache.findWidget(u,l-a,p)||Di.of(u,this.view,l-a,p);h.block?(h.startSide>0&&n.addLineStartIfNotCovered(s),n.addBlockWidget(m)):(n.ensureLine(s),n.addInlineWidget(m,c,d))}s=null}else s=zg(s,h);l>a&&this.text.skip(l-a)},span:(a,l,h,c)=>{for(let d=a;d<l;){let f=this.text.next(Math.min(512,l-d));f==null?(n.addLineStartIfNotCovered(s),n.addBreak(),d++):(n.ensureLine(s),n.addText(f,h,d==a?c:h.length),d+=f.length),s=null}}});n.addLineStartIfNotCovered(s),this.openWidget=o>r,this.openMarks=o}forward(e,t,s=1){t-e<=10?this.old.advance(t-e,s,this.reuseWalker):(this.old.advance(5,-1,this.reuseWalker),this.old.advance(t-e-10,-1),this.old.advance(5,s,this.reuseWalker))}getCompositionContext(e){let t=[],s=null;for(let n=e.parentNode;;n=n.parentNode){let r=oe.get(n);if(n==this.view.contentDOM)break;r instanceof Le?t.push(r):r!=null&&r.isLine()?s=r:r instanceof Et||(n.nodeName=="DIV"&&!s&&n!=this.view.contentDOM?s=new ns(n,Bd):s||t.push(Le.of(new on({tagName:n.nodeName.toLowerCase(),attributes:fg(n)}),n)))}return{line:s,marks:t}}}function th(i,e){let t=s=>{for(let n of s.children)if((e?n.isText():n.length)||t(n))return!0;return!1};return t(i)}function Ng(i){let e=i.isReplace?(i.startSide<0?64:0)|(i.endSide>0?128:0):i.startSide>0?32:16;return i.block&&(e|=256),e}const Bd={class:"cm-line"};function zg(i,e){let t=e.spec.attributes,s=e.spec.class;return!t&&!s||(i||(i={class:"cm-line"}),t&&Ha(t,i),s&&(i.class+=" "+s)),i}function Fg(i){let e=[];for(let t=i.parents.length;t>1;t--){let s=t==i.parents.length?i.tile:i.parents[t].tile;s instanceof Le&&e.push(s.mark)}return e}function so(i){let e=oe.get(i);return e&&e.setDOM(i.cloneNode()),i}class rs extends Ht{constructor(e){super(),this.tag=e}eq(e){return e.tag==this.tag}toDOM(){return document.createElement(this.tag)}updateDOM(e){return e.nodeName.toLowerCase()==this.tag}get isHidden(){return!0}}rs.inline=new rs("span");rs.block=new rs("div");const no=new class extends Ht{toDOM(){return document.createElement("br")}get isHidden(){return!0}get editable(){return!0}};class ih{constructor(e){this.view=e,this.decorations=[],this.blockWrappers=[],this.dynamicDecorationMap=[!1],this.domChanged=null,this.hasComposition=null,this.editContextFormatting=L.none,this.lastCompositionAfterCursor=!1,this.minWidth=0,this.minWidthFrom=0,this.minWidthTo=0,this.impreciseAnchor=null,this.impreciseHead=null,this.forceSelection=!1,this.lastUpdate=Date.now(),this.updateDeco(),this.tile=new Br(e,e.contentDOM),this.updateInner([new Ke(0,0,0,e.state.doc.length)],null)}update(e){var t;let s=e.changedRanges;this.minWidth>0&&s.length&&(s.every(({fromA:c,toA:d})=>d<this.minWidthFrom||c>this.minWidthTo)?(this.minWidthFrom=e.changes.mapPos(this.minWidthFrom,1),this.minWidthTo=e.changes.mapPos(this.minWidthTo,1)):this.minWidth=this.minWidthFrom=this.minWidthTo=0),this.updateEditContextFormatting(e);let n=-1;this.view.inputState.composing>=0&&!this.view.observer.editContext&&(!((t=this.domChanged)===null||t===void 0)&&t.newSel?n=this.domChanged.newSel.head:!Jg(e.changes,this.hasComposition)&&!e.selectionSet&&(n=e.state.selection.main.head));let r=n>-1?Wg(this.view,e.changes,n):null;if(this.domChanged=null,this.hasComposition){let{from:c,to:d}=this.hasComposition;s=new Ke(c,d,e.changes.mapPos(c,-1),e.changes.mapPos(d,1)).addToSet(s.slice())}this.hasComposition=r?{from:r.range.fromB,to:r.range.toB}:null,(T.ie||T.chrome)&&!r&&e&&e.state.doc.lines!=e.startState.doc.lines&&(this.forceSelection=!0);let o=this.decorations,a=this.blockWrappers;this.updateDeco();let l=Vg(o,this.decorations,e.changes);l.length&&(s=Ke.extendWithRanges(s,l));let h=jg(a,this.blockWrappers,e.changes);return h.length&&(s=Ke.extendWithRanges(s,h)),r&&!s.some(c=>c.fromA<=r.range.fromA&&c.toA>=r.range.toA)&&(s=r.range.addToSet(s.slice())),this.tile.flags&2&&s.length==0?!1:(this.updateInner(s,r),e.transactions.length&&(this.lastUpdate=Date.now()),!0)}updateInner(e,t){this.view.viewState.mustMeasureContent=!0;let{observer:s}=this.view;s.ignore(()=>{if(t||e.length){let o=this.tile,a=new Ig(this.view,o,this.blockWrappers,this.decorations,this.dynamicDecorationMap);t&&oe.get(t.text)&&a.cache.reused.set(oe.get(t.text),2),this.tile=a.run(e,t),ia(o,a.cache.reused)}this.tile.dom.style.height=this.view.viewState.contentHeight/this.view.scaleY+"px",this.tile.dom.style.flexBasis=this.minWidth?this.minWidth+"px":"";let r=T.chrome||T.ios?{node:s.selectionRange.focusNode,written:!1}:void 0;this.tile.sync(r),r&&(r.written||s.selectionRange.focusNode!=r.node||!this.tile.dom.contains(r.node))&&(this.forceSelection=!0),this.tile.dom.style.height=""});let n=[];if(this.view.viewport.from||this.view.viewport.to<this.view.state.doc.length)for(let r of this.tile.children)r.isWidget()&&r.widget instanceof ro&&n.push(r.dom);s.updateGaps(n)}updateEditContextFormatting(e){this.editContextFormatting=this.editContextFormatting.map(e.changes);for(let t of e.transactions)for(let s of t.effects)s.is(Md)&&(this.editContextFormatting=s.value)}updateSelection(e=!1,t=!1){(e||!this.view.observer.selectionRange.focusNode)&&this.view.observer.readSelectionRange();let{dom:s}=this.tile,n=this.view.root.activeElement,r=n==s,o=!r&&!(this.view.state.facet(Dt)||s.tabIndex>-1)&&Ps(s,this.view.observer.selectionRange)&&!(n&&s.contains(n));if(!(r||t||o))return;let a=this.forceSelection;this.forceSelection=!1;let l=this.view.state.selection.main,h,c;if(l.empty?c=h=this.inlineDOMNearPos(l.anchor,l.assoc||1):(c=this.inlineDOMNearPos(l.head,l.head==l.from?1:-1),h=this.inlineDOMNearPos(l.anchor,l.anchor==l.from?1:-1)),T.gecko&&l.empty&&!this.hasComposition&&Hg(h)){let f=document.createTextNode("");this.view.observer.ignore(()=>h.node.insertBefore(f,h.node.childNodes[h.offset]||null)),h=c=new st(f,0),a=!0}let d=this.view.observer.selectionRange;(a||!d.focusNode||(!Ms(h.node,h.offset,d.anchorNode,d.anchorOffset)||!Ms(c.node,c.offset,d.focusNode,d.focusOffset))&&!this.suppressWidgetCursorChange(d,l))&&(this.view.observer.ignore(()=>{T.android&&T.chrome&&s.contains(d.focusNode)&&Xg(d.focusNode,s)&&(s.blur(),s.focus({preventScroll:!0}));let f=qs(this.view.root);if(f)if(l.empty){if(T.gecko){let u=qg(h.node,h.offset);if(u&&u!=3){let p=(u==1?ud:pd)(h.node,h.offset);p&&(h=new st(p.node,p.offset))}}f.collapse(h.node,h.offset),l.bidiLevel!=null&&f.caretBidiLevel!==void 0&&(f.caretBidiLevel=l.bidiLevel)}else if(f.extend){f.collapse(h.node,h.offset);try{f.extend(c.node,c.offset)}catch{}}else{let u=document.createRange();l.anchor>l.head&&([h,c]=[c,h]),u.setEnd(c.node,c.offset),u.setStart(h.node,h.offset),f.removeAllRanges(),f.addRange(u)}o&&this.view.root.activeElement==s&&(s.blur(),n&&n.focus())}),this.view.observer.setSelectionRange(h,c)),this.impreciseAnchor=h.precise?null:new st(d.anchorNode,d.anchorOffset),this.impreciseHead=c.precise?null:new st(d.focusNode,d.focusOffset)}suppressWidgetCursorChange(e,t){return this.hasComposition&&t.empty&&Ms(e.focusNode,e.focusOffset,e.anchorNode,e.anchorOffset)&&this.posFromDOM(e.focusNode,e.focusOffset)==t.head}enforceCursorAssoc(){if(this.hasComposition)return;let{view:e}=this,t=e.state.selection.main,s=qs(e.root),{anchorNode:n,anchorOffset:r}=e.observer.selectionRange;if(!s||!t.empty||!t.assoc||!s.modify)return;let o=this.lineAt(t.head,t.assoc);if(!o)return;let a=o.posAtStart;if(t.head==a||t.head==a+o.length)return;let l=this.coordsAt(t.head,-1),h=this.coordsAt(t.head,1);if(!l||!h||l.bottom>h.top)return;let c=this.domAtPos(t.head+t.assoc,t.assoc);s.collapse(c.node,c.offset),s.modify("move",t.assoc<0?"forward":"backward","lineboundary"),e.observer.readSelectionRange();let d=e.observer.selectionRange;e.docView.posFromDOM(d.anchorNode,d.anchorOffset)!=t.from&&s.collapse(n,r)}posFromDOM(e,t){let s=this.tile.nearest(e);if(!s)return this.tile.dom.compareDocumentPosition(e)&2?0:this.view.state.doc.length;let n=s.posAtStart;if(s.isComposite()){let r;if(e==s.dom)r=s.dom.childNodes[t];else{let o=_t(e)==0?0:t==0?-1:1;for(;;){let a=e.parentNode;if(a==s.dom)break;o==0&&a.firstChild!=a.lastChild&&(e==a.firstChild?o=-1:o=1),e=a}o<0?r=e:r=e.nextSibling}if(r==s.dom.firstChild)return n;for(;r&&!oe.get(r);)r=r.nextSibling;if(!r)return n+s.length;for(let o=0,a=n;;o++){let l=s.children[o];if(l.dom==r)return a;a+=l.length+l.breakAfter}}else return s.isText()?e==s.dom?n+t:n+(t?s.length:0):n}domAtPos(e,t){let{tile:s,offset:n}=this.tile.resolveBlock(e,t);return s.isWidget()?s.domPosFor(e,t):s.domIn(n,t)}inlineDOMNearPos(e,t){let s,n=-1,r=!1,o,a=-1,l=!1;return this.tile.blockTiles((h,c)=>{if(h.isWidget()){if(h.flags&32&&c>=e)return!0;h.flags&16&&(r=!0)}else{let d=c+h.length;if(c<=e&&(s=h,n=e-c,r=d<e),d>=e&&!o&&(o=h,a=e-c,l=c>e),c>e&&o)return!0}}),!s&&!o?this.domAtPos(e,t):(r&&o?s=null:l&&s&&(o=null),s&&t<0||!o?s.domIn(n,t):o.domIn(a,t))}coordsAt(e,t){let{tile:s,offset:n}=this.tile.resolveBlock(e,t);return s.isWidget()?s.widget instanceof ro?null:s.coordsInWidget(n,t,!0):s.coordsIn(n,t)}lineAt(e,t){let{tile:s}=this.tile.resolveBlock(e,t);return s.isLine()?s:null}coordsForChar(e){let{tile:t,offset:s}=this.tile.resolveBlock(e,1);if(!t.isLine())return null;function n(r,o){if(r.isComposite())for(let a of r.children){if(a.length>=o){let l=n(a,o);if(l)return l}if(o-=a.length,o<0)break}else if(r.isText()&&o<r.length){let a=xe(r.text,o);if(a==o)return null;let l=Qs(r.dom,o,a).getClientRects();for(let h=0;h<l.length;h++){let c=l[h];if(h==l.length-1||c.top<c.bottom&&c.left<c.right)return c}}return null}return n(t,s)}measureVisibleLineHeights(e){let t=[],{from:s,to:n}=e,r=this.view.contentDOM.clientWidth,o=r>Math.max(this.view.scrollDOM.clientWidth,this.minWidth)+1,a=-1,l=this.view.textDirection==G.LTR,h=0,c=(d,f,u)=>{for(let p=0;p<d.children.length&&!(f>n);p++){let m=d.children[p],b=f+m.length,x=m.dom.getBoundingClientRect(),{height:S}=x;if(u&&!p&&(h+=x.top-u.top),m instanceof Et)b>s&&c(m,f,x);else if(f>=s&&(h>0&&t.push(-h),t.push(S+h),h=0,o)){let C=m.dom.lastChild,R=C?qn(C):[];if(R.length){let A=R[R.length-1],$=l?A.right-x.left:x.right-A.left;$>a&&(a=$,this.minWidth=r,this.minWidthFrom=f,this.minWidthTo=b)}}u&&p==d.children.length-1&&(h+=u.bottom-x.bottom),f=b+m.breakAfter}};return c(this.tile,0,null),t}textDirectionAt(e){let{tile:t}=this.tile.resolveBlock(e,1);return getComputedStyle(t.dom).direction=="rtl"?G.RTL:G.LTR}measureTextSize(){let e=this.tile.blockTiles(o=>{if(o.isLine()&&o.children.length&&o.length<=20){let a=0,l;for(let h of o.children){if(!h.isText()||/[^ -~]/.test(h.text))return;let c=qn(h.dom);if(c.length!=1)return;a+=c[0].width,l=c[0].height}if(a)return{lineHeight:o.dom.getBoundingClientRect().height,charWidth:a/o.length,textHeight:l}}});if(e)return e;let t=document.createElement("div"),s,n,r;return t.className="cm-line",t.style.width="99999px",t.style.position="absolute",t.textContent="abc def ghi jkl mno pqr stu",this.view.observer.ignore(()=>{this.tile.dom.appendChild(t);let o=qn(t.firstChild)[0];s=t.getBoundingClientRect().height,n=o&&o.width?o.width/27:7,r=o&&o.height?o.height:s,t.remove()}),{lineHeight:s,charWidth:n,textHeight:r}}computeBlockGapDeco(){let e=[],t=this.view.viewState;for(let s=0,n=0;;n++){let r=n==t.viewports.length?null:t.viewports[n],o=r?r.from-1:this.view.state.doc.length;if(o>s){let a=(t.lineBlockAt(o).bottom-t.lineBlockAt(s).top)/this.view.scaleY;e.push(L.replace({widget:new ro(a),block:!0,inclusive:!0,isBlockGap:!0}).range(s,o))}if(!r)break;s=r.to+1}return L.set(e)}updateDeco(){let e=1,t=this.view.state.facet(Er).map(r=>(this.dynamicDecorationMap[e++]=typeof r=="function")?r(this.view):r),s=!1,n=this.view.state.facet(ja).map((r,o)=>{let a=typeof r=="function";return a&&(s=!0),a?r(this.view):r});for(n.length&&(this.dynamicDecorationMap[e++]=s,t.push(H.join(n))),this.decorations=[this.editContextFormatting,...t,this.computeBlockGapDeco(),this.view.viewState.lineGapDeco];e<this.decorations.length;)this.dynamicDecorationMap[e++]=!1;this.blockWrappers=this.view.state.facet(Dd).map(r=>typeof r=="function"?r(this.view):r)}scrollIntoView(e){var t;if(e.isSnapshot){let c=this.view.viewState.lineBlockAt(e.range.head);this.view.scrollDOM.scrollTop=c.top-e.yMargin,this.view.scrollDOM.scrollLeft=e.xMargin;return}for(let c of this.view.state.facet(Pd))try{if(c(this.view,e.range,e))return!0}catch(d){Ie(this.view.state,d,"scroll handler")}let{range:s}=e,n=this.coordsAt(s.head,(t=s.assoc)!==null&&t!==void 0?t:s.empty?0:s.head>s.anchor?-1:1),r;if(!n)return;!s.empty&&(r=this.coordsAt(s.anchor,s.anchor>s.head?-1:1))&&(n={left:Math.min(n.left,r.left),top:Math.min(n.top,r.top),right:Math.max(n.right,r.right),bottom:Math.max(n.bottom,r.bottom)});let o=Xa(this.view),a={left:n.left-o.left,top:n.top-o.top,right:n.right+o.right,bottom:n.bottom+o.bottom},{offsetWidth:l,offsetHeight:h}=this.view.scrollDOM;if(gg(this.view.scrollDOM,a,s.head<s.anchor?-1:1,e.x,e.y,Math.max(Math.min(e.xMargin,l),-l),Math.max(Math.min(e.yMargin,h),-h),this.view.textDirection==G.LTR),window.visualViewport&&window.innerHeight-window.visualViewport.height>1&&(n.top>window.pageYOffset+window.visualViewport.offsetTop+window.visualViewport.height||n.bottom<window.pageYOffset+window.visualViewport.offsetTop)){let c=this.view.docView.lineAt(s.head,1);c&&c.dom.scrollIntoView({block:"nearest"})}}lineHasWidget(e){let t=s=>s.isWidget()||s.children.some(t);return t(this.tile.resolveBlock(e,1).tile)}destroy(){ia(this.tile)}}function ia(i,e){let t=e==null?void 0:e.get(i);if(t!=1){t==null&&i.destroy();for(let s of i.children)ia(s,e)}}function Hg(i){return i.node.nodeType==1&&i.node.firstChild&&(i.offset==0||i.node.childNodes[i.offset-1].contentEditable=="false")&&(i.offset==i.node.childNodes.length||i.node.childNodes[i.offset].contentEditable=="false")}function _d(i,e){let t=i.observer.selectionRange;if(!t.focusNode)return null;let s=ud(t.focusNode,t.focusOffset),n=pd(t.focusNode,t.focusOffset),r=s||n;if(n&&s&&n.node!=s.node){let a=oe.get(n.node);if(!a||a.isText()&&a.text!=n.node.nodeValue)r=n;else if(i.docView.lastCompositionAfterCursor){let l=oe.get(s.node);!l||l.isText()&&l.text!=s.node.nodeValue||(r=n)}}if(i.docView.lastCompositionAfterCursor=r!=s,!r)return null;let o=e-r.offset;return{from:o,to:o+r.node.nodeValue.length,node:r.node}}function Wg(i,e,t){let s=_d(i,t);if(!s)return null;let{node:n,from:r,to:o}=s,a=n.nodeValue;if(/[\n\r]/.test(a)||i.state.doc.sliceString(s.from,s.to)!=a)return null;let l=e.invertedDesc;return{range:new Ke(l.mapPos(r),l.mapPos(o),r,o),text:n}}function qg(i,e){return i.nodeType!=1?0:(e&&i.childNodes[e-1].contentEditable=="false"?1:0)|(e<i.childNodes.length&&i.childNodes[e].contentEditable=="false"?2:0)}let Qg=class{constructor(){this.changes=[]}compareRange(e,t){Xi(e,t,this.changes)}comparePoint(e,t){Xi(e,t,this.changes)}boundChange(e){Xi(e,e,this.changes)}};function Vg(i,e,t){let s=new Qg;return H.compare(i,e,t,s),s.changes}class Ug{constructor(){this.changes=[]}compareRange(e,t){Xi(e,t,this.changes)}comparePoint(){}boundChange(e){Xi(e,e,this.changes)}}function jg(i,e,t){let s=new Ug;return H.compare(i,e,t,s),s.changes}function Xg(i,e){for(let t=i;t&&t!=e;t=t.assignedSlot||t.parentNode)if(t.nodeType==1&&t.contentEditable=="false")return!0;return!1}function Jg(i,e){let t=!1;return e&&i.iterChangedRanges((s,n)=>{s<e.to&&n>e.from&&(t=!0)}),t}class ro extends Ht{constructor(e){super(),this.height=e}toDOM(){let e=document.createElement("div");return e.className="cm-gap",this.updateDOM(e),e}eq(e){return e.height==this.height}updateDOM(e){return e.style.height=this.height+"px",!0}get editable(){return!0}get estimatedHeight(){return this.height}ignoreEvent(){return!1}}function Kg(i,e,t=1){let s=i.charCategorizer(e),n=i.doc.lineAt(e),r=e-n.from;if(n.length==0)return k.cursor(e);r==0?t=1:r==n.length&&(t=-1);let o=r,a=r;t<0?o=xe(n.text,r,!1):a=xe(n.text,r);let l=s(n.text.slice(o,a));for(;o>0;){let h=xe(n.text,o,!1);if(s(n.text.slice(h,o))!=l)break;o=h}for(;a<n.length;){let h=xe(n.text,a);if(s(n.text.slice(a,h))!=l)break;a=h}return k.range(o+n.from,a+n.from)}function Gg(i,e,t,s,n){let r=Math.round((s-e.left)*i.defaultCharacterWidth);if(i.lineWrapping&&t.height>i.defaultLineHeight*1.5){let a=i.viewState.heightOracle.textHeight,l=Math.floor((n-t.top-(i.defaultLineHeight-a)*.5)/a);r+=l*i.viewState.heightOracle.lineLength}let o=i.state.sliceDoc(t.from,t.to);return t.from+Qo(o,r,i.state.tabSize)}function sa(i,e,t){let s=i.lineBlockAt(e);if(Array.isArray(s.type)){let n;for(let r of s.type){if(r.from>e)break;if(!(r.to<e)){if(r.from<e&&r.to>e)return r;(!n||r.type==Ce.Text&&(n.type!=r.type||(t<0?r.from<e:r.to>e)))&&(n=r)}}return n||s}return s}function Yg(i,e,t,s){let n=sa(i,e.head,e.assoc||-1),r=!s||n.type!=Ce.Text||!(i.lineWrapping||n.widgetLineBreaks)?null:i.coordsAtPos(e.assoc<0&&e.head>n.from?e.head-1:e.head);if(r){let o=i.dom.getBoundingClientRect(),a=i.textDirectionAt(n.from),l=i.posAtCoords({x:t==(a==G.LTR)?o.right-1:o.left+1,y:(r.top+r.bottom)/2});if(l!=null)return k.cursor(l,t?-1:1)}return k.cursor(t?n.to:n.from,t?-1:1)}function sh(i,e,t,s){let n=i.state.doc.lineAt(e.head),r=i.bidiSpans(n),o=i.textDirectionAt(n.from);for(let a=e,l=null;;){let h=Ag(n,r,o,a,t),c=xd;if(!h){if(n.number==(t?i.state.doc.lines:1))return a;c=`
`,n=i.state.doc.line(n.number+(t?1:-1)),r=i.bidiSpans(n),h=i.visualLineSide(n,!t)}if(l){if(!l(c))return a}else{if(!s)return h;l=s(c)}a=h}}function Zg(i,e,t){let s=i.state.charCategorizer(e),n=s(t);return r=>{let o=s(r);return n==ie.Space&&(n=o),n==o}}function em(i,e,t,s){let n=e.head,r=t?1:-1;if(n==(t?i.state.doc.length:0))return k.cursor(n,e.assoc);let o=e.goalColumn,a,l=i.contentDOM.getBoundingClientRect(),h=i.coordsAtPos(n,e.assoc||((e.empty?t:e.head==e.from)?1:-1)),c=i.documentTop;if(h)o==null&&(o=h.left-l.left),a=r<0?h.top:h.bottom;else{let p=i.viewState.lineBlockAt(n);o==null&&(o=Math.min(l.right-l.left,i.defaultCharacterWidth*(n-p.from))),a=(r<0?p.top:p.bottom)+c}let d=l.left+o,f=i.viewState.heightOracle.textHeight>>1,u=s??f;for(let p=0;;p+=f){let m=a+(u+p)*r,b=na(i,{x:d,y:m},!1,r);if(t?m>l.bottom:m<l.top)return k.cursor(b.pos,b.assoc);let x=i.coordsAtPos(b.pos,b.assoc),S=x?(x.top+x.bottom)/2:0;if(!x||(t?S>a:S<a))return k.cursor(b.pos,b.assoc,void 0,o)}}function Ts(i,e,t){for(;;){let s=0;for(let n of i)n.between(e-1,e+1,(r,o,a)=>{if(e>r&&e<o){let l=s||t||(e-r<o-e?-1:1);e=l<0?r:o,s=l}});if(!s)return e}}function Ld(i,e){let t=null;for(let s=0;s<e.ranges.length;s++){let n=e.ranges[s],r=null;if(n.empty){let o=Ts(i,n.from,0);o!=n.from&&(r=k.cursor(o,-1))}else{let o=Ts(i,n.from,-1),a=Ts(i,n.to,1);(o!=n.from||a!=n.to)&&(r=k.range(n.from==n.anchor?o:a,n.from==n.head?o:a))}r&&(t||(t=e.ranges.slice()),t[s]=r)}return t?k.create(t,e.mainIndex):e}function oo(i,e,t){let s=Ts(i.state.facet(ln).map(n=>n(i)),t.from,e.head>t.from?-1:1);return s==t.from?t:k.cursor(s,s<t.from?1:-1)}class xt{constructor(e,t){this.pos=e,this.assoc=t}}function na(i,e,t,s){let n=i.contentDOM.getBoundingClientRect(),r=n.top+i.viewState.paddingTop,{x:o,y:a}=e,l=a-r,h;for(;;){if(l<0)return new xt(0,1);if(l>i.viewState.docHeight)return new xt(i.state.doc.length,-1);if(h=i.elementAtHeight(l),s==null)break;if(h.type==Ce.Text){if(s<0?h.to<i.viewport.from:h.from>i.viewport.to)break;let f=i.docView.coordsAt(s<0?h.from:h.to,s>0?-1:1);if(f&&(s<0?f.top<=l+r:f.bottom>=l+r))break}let d=i.viewState.heightOracle.textHeight/2;l=s>0?h.bottom+d:h.top-d}if(i.viewport.from>=h.to||i.viewport.to<=h.from){if(t)return null;if(h.type==Ce.Text){let d=Gg(i,n,h,o,a);return new xt(d,d==h.from?1:-1)}}if(h.type!=Ce.Text)return l<(h.top+h.bottom)/2?new xt(h.from,1):new xt(h.to,-1);let c=i.docView.lineAt(h.from,2);return(!c||c.length!=h.length)&&(c=i.docView.lineAt(h.from,-2)),new tm(i,o,a,i.textDirectionAt(h.from)).scanTile(c,h.from)}class tm{constructor(e,t,s,n){this.view=e,this.x=t,this.y=s,this.baseDir=n,this.line=null,this.spans=null}bidiSpansAt(e){return(!this.line||this.line.from>e||this.line.to<e)&&(this.line=this.view.state.doc.lineAt(e),this.spans=this.view.bidiSpans(this.line)),this}baseDirAt(e,t){let{line:s,spans:n}=this.bidiSpansAt(e);return n[vt.find(n,e-s.from,-1,t)].level==this.baseDir}dirAt(e,t){let{line:s,spans:n}=this.bidiSpansAt(e);return n[vt.find(n,e-s.from,-1,t)].dir}bidiIn(e,t){let{spans:s,line:n}=this.bidiSpansAt(e);return s.length>1||s.length&&(s[0].level!=this.baseDir||s[0].to+n.from<t)}scan(e,t){let s=0,n=e.length-1,r=new Set,o=this.bidiIn(e[0],e[n]),a,l,h=-1,c=1e9,d;e:for(;s<n;){let u=n-s,p=s+n>>1;t:if(r.has(p)){let b=s+Math.floor(Math.random()*u);for(let x=0;x<u;x++){if(!r.has(b)){p=b;break t}b++,b==n&&(b=s)}break e}r.add(p);let m=t(p);if(m)for(let b=0;b<m.length;b++){let x=m[b],S=0;if(!(x.width==0&&m.length>1)){if(x.bottom<this.y)(!a||a.bottom<x.bottom)&&(a=x),S=1;else if(x.top>this.y)(!l||l.top>x.top)&&(l=x),S=-1;else{let C=x.left>this.x?this.x-x.left:x.right<this.x?this.x-x.right:0,R=Math.abs(C);R<c&&(h=p,c=R,d=x),C&&(S=C<0==(this.baseDir==G.LTR)?-1:1)}S==-1&&(!o||this.baseDirAt(e[p],1))?n=p:S==1&&(!o||this.baseDirAt(e[p+1],-1))&&(s=p+1)}}}if(!d){let u=a&&(!l||this.y-a.bottom<l.top-this.y)?a:l;return this.y=(u.top+u.bottom)/2,this.scan(e,t)}if(c){let{top:u,bottom:p}=d;if(a&&a.bottom>(u+u+p)/3)return this.y=a.bottom-1,this.scan(e,t);if(l&&l.top<(u+p+p)/3)return this.y=l.top+1,this.scan(e,t)}let f=(o?this.dirAt(e[h],1):this.baseDir)==G.LTR;return{i:h,after:this.x>(d.left+d.right)/2==f}}scanText(e,t){let s=[];for(let r=0;r<e.length;r=xe(e.text,r))s.push(t+r);s.push(t+e.length);let n=this.scan(s,r=>{let o=s[r]-t,a=s[r+1]-t;return Qs(e.dom,o,a).getClientRects()});return n.after?new xt(s[n.i+1],-1):new xt(s[n.i],1)}scanTile(e,t){if(!e.length)return new xt(t,1);if(e.children.length==1){let a=e.children[0];if(a.isText())return this.scanText(a,t);if(a.isComposite())return this.scanTile(a,t)}let s=[t];for(let a=0,l=t;a<e.children.length;a++)s.push(l+=e.children[a].length);let n=this.scan(s,a=>{let l=e.children[a];return l.flags&48?null:(l.dom.nodeType==1?l.dom:Qs(l.dom,0,l.length)).getClientRects()}),r=e.children[n.i],o=s[n.i];return r.isText()?this.scanText(r,o):r.isComposite()?this.scanTile(r,o):n.after?new xt(s[n.i+1],-1):new xt(o,1)}}const zi="￿";class im{constructor(e,t){this.points=e,this.view=t,this.text="",this.lineSeparator=t.state.facet(q.lineSeparator)}append(e){this.text+=e}lineBreak(){this.text+=zi}readRange(e,t){if(!e)return this;let s=e.parentNode;for(let n=e;;){this.findPointBefore(s,n);let r=this.text.length;this.readNode(n);let o=oe.get(n),a=n.nextSibling;if(a==t){o!=null&&o.breakAfter&&!a&&s!=this.view.contentDOM&&this.lineBreak();break}let l=oe.get(a);(o&&l?o.breakAfter:(o?o.breakAfter:ir(n))||ir(a)&&(n.nodeName!="BR"||o!=null&&o.isWidget())&&this.text.length>r)&&!nm(a,t)&&this.lineBreak(),n=a}return this.findPointBefore(s,t),this}readTextNode(e){let t=e.nodeValue;for(let s of this.points)s.node==e&&(s.pos=this.text.length+Math.min(s.offset,t.length));for(let s=0,n=this.lineSeparator?null:/\r\n?|\n/g;;){let r=-1,o=1,a;if(this.lineSeparator?(r=t.indexOf(this.lineSeparator,s),o=this.lineSeparator.length):(a=n.exec(t))&&(r=a.index,o=a[0].length),this.append(t.slice(s,r<0?t.length:r)),r<0)break;if(this.lineBreak(),o>1)for(let l of this.points)l.node==e&&l.pos>this.text.length&&(l.pos-=o-1);s=r+o}}readNode(e){let t=oe.get(e),s=t&&t.overrideDOMText;if(s!=null){this.findPointInside(e,s.length);for(let n=s.iter();!n.next().done;)n.lineBreak?this.lineBreak():this.append(n.value)}else e.nodeType==3?this.readTextNode(e):e.nodeName=="BR"?e.nextSibling&&this.lineBreak():e.nodeType==1&&this.readRange(e.firstChild,null)}findPointBefore(e,t){for(let s of this.points)s.node==e&&e.childNodes[s.offset]==t&&(s.pos=this.text.length)}findPointInside(e,t){for(let s of this.points)(e.nodeType==3?s.node==e:e.contains(s.node))&&(s.pos=this.text.length+(sm(e,s.node,s.offset)?t:0))}}function sm(i,e,t){for(;;){if(!e||t<_t(e))return!1;if(e==i)return!0;t=Zt(e)+1,e=e.parentNode}}function nm(i,e){let t;for(;!(i==e||!i);i=i.nextSibling){let s=oe.get(i);if(!(s!=null&&s.isWidget()))return!1;s&&(t||(t=[])).push(s)}if(t)for(let s of t){let n=s.overrideDOMText;if(n!=null&&n.length)return!1}return!0}class nh{constructor(e,t){this.node=e,this.offset=t,this.pos=-1}}class rm{constructor(e,t,s,n){this.typeOver=n,this.bounds=null,this.text="",this.domChanged=t>-1;let{impreciseHead:r,impreciseAnchor:o}=e.docView,a=e.state.selection;if(e.state.readOnly&&t>-1)this.newSel=null;else if(t>-1&&(this.bounds=Id(e.docView.tile,t,s,0))){let l=r||o?[]:am(e),h=new im(l,e);h.readRange(this.bounds.startDOM,this.bounds.endDOM),this.text=h.text,this.newSel=lm(l,this.bounds.from)}else{let l=e.observer.selectionRange,h=r&&r.node==l.focusNode&&r.offset==l.focusOffset||!Go(e.contentDOM,l.focusNode)?a.main.head:e.docView.posFromDOM(l.focusNode,l.focusOffset),c=o&&o.node==l.anchorNode&&o.offset==l.anchorOffset||!Go(e.contentDOM,l.anchorNode)?a.main.anchor:e.docView.posFromDOM(l.anchorNode,l.anchorOffset),d=e.viewport;if((T.ios||T.chrome)&&a.main.empty&&h!=c&&(d.from>0||d.to<e.state.doc.length)){let f=Math.min(h,c),u=Math.max(h,c),p=d.from-f,m=d.to-u;(p==0||p==1||f==0)&&(m==0||m==-1||u==e.state.doc.length)&&(h=0,c=e.state.doc.length)}if(e.inputState.composing>-1&&a.ranges.length>1)this.newSel=a.replaceRange(k.range(c,h));else if(e.lineWrapping&&c==h&&!(a.main.empty&&a.main.head==h)&&e.inputState.lastTouchTime>Date.now()-100){let f=e.coordsAtPos(h,-1),u=0;f&&(u=e.inputState.lastTouchY<=f.bottom?-1:1),this.newSel=k.create([k.cursor(h,u)])}else this.newSel=k.single(c,h)}}}function Id(i,e,t,s){if(i.isComposite()){let n=-1,r=-1,o=-1,a=-1;for(let l=0,h=s,c=s;l<i.children.length;l++){let d=i.children[l],f=h+d.length;if(h<e&&f>t)return Id(d,e,t,h);if(f>=e&&n==-1&&(n=l,r=h),h>t&&d.dom.parentNode==i.dom){o=l,a=c;break}c=f,h=f+d.breakAfter}return{from:r,to:a<0?s+i.length:a,startDOM:(n?i.children[n-1].dom.nextSibling:null)||i.dom.firstChild,endDOM:o<i.children.length&&o>=0?i.children[o].dom:null}}else return i.isText()?{from:s,to:s+i.length,startDOM:i.dom,endDOM:i.dom.nextSibling}:null}function Nd(i,e){let t,{newSel:s}=e,{state:n}=i,r=n.selection.main,o=i.inputState.lastKeyTime>Date.now()-100?i.inputState.lastKeyCode:-1;if(e.bounds){let{from:a,to:l}=e.bounds,h=r.from,c=null;(o===8||T.android&&e.text.length<l-a)&&(h=r.to,c="end");let d=n.doc.sliceString(a,l,zi),f,u;!r.empty&&r.from>=a&&r.to<=l&&(e.typeOver||d!=e.text)&&d.slice(0,r.from-a)==e.text.slice(0,r.from-a)&&d.slice(r.to-a)==e.text.slice(f=e.text.length-(d.length-(r.to-a)))?t={from:r.from,to:r.to,insert:V.of(e.text.slice(r.from-a,f).split(zi))}:(u=zd(d,e.text,h-a,c))&&(T.chrome&&o==13&&u.toB==u.from+2&&e.text.slice(u.from,u.toB)==zi+zi&&u.toB--,t={from:a+u.from,to:a+u.toA,insert:V.of(e.text.slice(u.from,u.toB).split(zi))})}else s&&(!i.hasFocus&&n.facet(Dt)||ar(s,r))&&(s=null);if(!t&&!s)return!1;if((T.mac||T.android)&&t&&t.from==t.to&&t.from==r.head-1&&/^\. ?$/.test(t.insert.toString())&&i.contentDOM.getAttribute("autocorrect")=="off"?(s&&t.insert.length==2&&(s=k.single(s.main.anchor-1,s.main.head-1)),t={from:t.from,to:t.to,insert:V.of([t.insert.toString().replace("."," ")])}):n.doc.lineAt(r.from).to<r.to&&i.docView.lineHasWidget(r.to)&&i.inputState.insertingTextAt>Date.now()-50?t={from:r.from,to:r.to,insert:n.toText(i.inputState.insertingText)}:T.chrome&&t&&t.from==t.to&&t.from==r.head&&t.insert.toString()==`
 `&&i.lineWrapping&&(s&&(s=k.single(s.main.anchor-1,s.main.head-1)),t={from:r.from,to:r.to,insert:V.of([" "])}),t)return Ja(i,t,s,o);if(s&&!ar(s,r)){let a=!1,l="select";return i.inputState.lastSelectionTime>Date.now()-50&&(i.inputState.lastSelectionOrigin=="select"&&(a=!0),l=i.inputState.lastSelectionOrigin,l=="select.pointer"&&(s=Ld(n.facet(ln).map(h=>h(i)),s))),i.dispatch({selection:s,scrollIntoView:a,userEvent:l}),!0}else return!1}function Ja(i,e,t,s=-1){if(T.ios&&i.inputState.flushIOSKey(e))return!0;let n=i.state.selection.main;if(T.android&&(e.to==n.to&&(e.from==n.from||e.from==n.from-1&&i.state.sliceDoc(e.from,n.from)==" ")&&e.insert.length==1&&e.insert.lines==2&&Ji(i.contentDOM,"Enter",13)||(e.from==n.from-1&&e.to==n.to&&e.insert.length==0||s==8&&e.insert.length<e.to-e.from&&e.to>n.head)&&Ji(i.contentDOM,"Backspace",8)||e.from==n.from&&e.to==n.to+1&&e.insert.length==0&&Ji(i.contentDOM,"Delete",46)))return!0;let r=e.insert.toString();i.inputState.composing>=0&&i.inputState.composing++;let o,a=()=>o||(o=om(i,e,t));return i.state.facet(Cd).some(l=>l(i,e.from,e.to,r,a))||i.dispatch(a()),!0}function om(i,e,t){let s,n=i.state,r=n.selection.main,o=-1;if(e.from==e.to&&e.from<r.from||e.from>r.to){let l=e.from<r.from?-1:1,h=l<0?r.from:r.to,c=Ts(n.facet(ln).map(d=>d(i)),h,l);e.from==c&&(o=c)}if(o>-1)s={changes:e,selection:k.cursor(e.from+e.insert.length,-1)};else if(e.from>=r.from&&e.to<=r.to&&e.to-e.from>=(r.to-r.from)/3&&(!t||t.main.empty&&t.main.from==e.from+e.insert.length)&&i.inputState.composing<0){let l=r.from<e.from?n.sliceDoc(r.from,e.from):"",h=r.to>e.to?n.sliceDoc(e.to,r.to):"";s=n.replaceSelection(i.state.toText(l+e.insert.sliceString(0,void 0,i.state.lineBreak)+h))}else{let l=n.changes(e),h=t&&t.main.to<=l.newLength?t.main:void 0;if(n.selection.ranges.length>1&&(i.inputState.composing>=0||i.inputState.compositionPendingChange)&&e.to<=r.to+10&&e.to>=r.to-10){let c=i.state.sliceDoc(e.from,e.to),d,f=t&&_d(i,t.main.head);if(f){let p=e.insert.length-(e.to-e.from);d={from:f.from,to:f.to-p}}else d=i.state.doc.lineAt(r.head);let u=r.to-e.to;s=n.changeByRange(p=>{if(p.from==r.from&&p.to==r.to)return{changes:l,range:h||p.map(l)};let m=p.to-u,b=m-c.length;if(i.state.sliceDoc(b,m)!=c||m>=d.from&&b<=d.to)return{range:p};let x=n.changes({from:b,to:m,insert:e.insert}),S=p.to-r.to;return{changes:x,range:h?k.range(Math.max(0,h.anchor+S),Math.max(0,h.head+S)):p.map(x)}})}else s={changes:l,selection:h&&n.selection.replaceRange(h)}}let a="input.type";return(i.composing||i.inputState.compositionPendingChange&&i.inputState.compositionEndedAt>Date.now()-50)&&(i.inputState.compositionPendingChange=!1,a+=".compose",i.inputState.compositionFirstChange&&(a+=".start",i.inputState.compositionFirstChange=!1)),n.update(s,{userEvent:a,scrollIntoView:!0})}function zd(i,e,t,s){let n=Math.min(i.length,e.length),r=0;for(;r<n&&i.charCodeAt(r)==e.charCodeAt(r);)r++;if(r==n&&i.length==e.length)return null;let o=i.length,a=e.length;for(;o>0&&a>0&&i.charCodeAt(o-1)==e.charCodeAt(a-1);)o--,a--;if(s=="end"){let l=Math.max(0,r-Math.min(o,a));t-=o+l-r}if(o<r&&i.length<e.length){let l=t<=r&&t>=o?r-t:0;r-=l,a=r+(a-o),o=r}else if(a<r){let l=t<=r&&t>=a?r-t:0;r-=l,o=r+(o-a),a=r}return{from:r,toA:o,toB:a}}function am(i){let e=[];if(i.root.activeElement!=i.contentDOM)return e;let{anchorNode:t,anchorOffset:s,focusNode:n,focusOffset:r}=i.observer.selectionRange;return t&&(e.push(new nh(t,s)),(n!=t||r!=s)&&e.push(new nh(n,r))),e}function lm(i,e){if(i.length==0)return null;let t=i[0].pos,s=i.length==2?i[1].pos:t;return t>-1&&s>-1?k.single(t+e,s+e):null}function ar(i,e){return e.head==i.main.head&&e.anchor==i.main.anchor}class hm{setSelectionOrigin(e){this.lastSelectionOrigin=e,this.lastSelectionTime=Date.now()}constructor(e){this.view=e,this.lastKeyCode=0,this.lastKeyTime=0,this.lastTouchTime=0,this.lastTouchX=0,this.lastTouchY=0,this.lastFocusTime=0,this.lastScrollTop=0,this.lastScrollLeft=0,this.lastWheelEvent=0,this.pendingIOSKey=void 0,this.tabFocusMode=-1,this.lastSelectionOrigin=null,this.lastSelectionTime=0,this.lastContextMenu=0,this.scrollHandlers=[],this.handlers=Object.create(null),this.composing=-1,this.compositionFirstChange=null,this.compositionEndedAt=0,this.compositionPendingKey=!1,this.compositionPendingChange=!1,this.insertingText="",this.insertingTextAt=0,this.mouseSelection=null,this.draggedContent=null,this.handleEvent=this.handleEvent.bind(this),this.notifiedFocused=e.hasFocus,T.safari&&e.contentDOM.addEventListener("input",()=>null),T.gecko&&Cm(e.contentDOM.ownerDocument)}handleEvent(e){!bm(this.view,e)||this.ignoreDuringComposition(e)||e.type=="keydown"&&this.keydown(e)||(this.view.updateState!=0?Promise.resolve().then(()=>this.runHandlers(e.type,e)):this.runHandlers(e.type,e))}runHandlers(e,t){let s=this.handlers[e];if(s){for(let n of s.observers)n(this.view,t);for(let n of s.handlers){if(t.defaultPrevented)break;if(n(this.view,t)){t.preventDefault();break}}}}ensureHandlers(e){let t=cm(e),s=this.handlers,n=this.view.contentDOM;for(let r in t)if(r!="scroll"){let o=!t[r].handlers.length,a=s[r];a&&o!=!a.handlers.length&&(n.removeEventListener(r,this.handleEvent),a=null),a||n.addEventListener(r,this.handleEvent,{passive:o})}for(let r in s)r!="scroll"&&!t[r]&&n.removeEventListener(r,this.handleEvent);this.handlers=t}keydown(e){if(this.lastKeyCode=e.keyCode,this.lastKeyTime=Date.now(),e.keyCode==9&&this.tabFocusMode>-1&&(!this.tabFocusMode||Date.now()<=this.tabFocusMode))return!0;if(this.tabFocusMode>0&&e.keyCode!=27&&Hd.indexOf(e.keyCode)<0&&(this.tabFocusMode=-1),T.android&&T.chrome&&!e.synthetic&&(e.keyCode==13||e.keyCode==8))return this.view.observer.delayAndroidKey(e.key,e.keyCode),!0;let t;return T.ios&&!e.synthetic&&!e.altKey&&!e.metaKey&&!e.shiftKey&&((t=Fd.find(s=>s.keyCode==e.keyCode))&&!e.ctrlKey||dm.indexOf(e.key)>-1&&e.ctrlKey)?(this.pendingIOSKey=t||e,setTimeout(()=>this.flushIOSKey(),250),!0):(e.keyCode!=229&&this.view.observer.forceFlush(),!1)}flushIOSKey(e){let t=this.pendingIOSKey;return!t||t.key=="Enter"&&e&&e.from<e.to&&/^\S+$/.test(e.insert.toString())?!1:(this.pendingIOSKey=void 0,Ji(this.view.contentDOM,t.key,t.keyCode,t instanceof KeyboardEvent?t:void 0))}ignoreDuringComposition(e){return!/^key/.test(e.type)||e.synthetic?!1:this.composing>0?!0:T.safari&&!T.ios&&this.compositionPendingKey&&Date.now()-this.compositionEndedAt<100?(this.compositionPendingKey=!1,!0):!1}startMouseSelection(e){this.mouseSelection&&this.mouseSelection.destroy(),this.mouseSelection=e}update(e){this.view.observer.update(e),this.mouseSelection&&this.mouseSelection.update(e),this.draggedContent&&e.docChanged&&(this.draggedContent=this.draggedContent.map(e.changes)),e.transactions.length&&(this.lastKeyCode=this.lastSelectionTime=0)}destroy(){this.mouseSelection&&this.mouseSelection.destroy()}}function rh(i,e){return(t,s)=>{try{return e.call(i,s,t)}catch(n){Ie(t.state,n)}}}function cm(i){let e=Object.create(null);function t(s){return e[s]||(e[s]={observers:[],handlers:[]})}for(let s of i){let n=s.spec,r=n&&n.plugin.domEventHandlers,o=n&&n.plugin.domEventObservers;if(r)for(let a in r){let l=r[a];l&&t(a).handlers.push(rh(s.value,l))}if(o)for(let a in o){let l=o[a];l&&t(a).observers.push(rh(s.value,l))}}for(let s in ot)t(s).handlers.push(ot[s]);for(let s in ze)t(s).observers.push(ze[s]);return e}const Fd=[{key:"Backspace",keyCode:8,inputType:"deleteContentBackward"},{key:"Enter",keyCode:13,inputType:"insertParagraph"},{key:"Enter",keyCode:13,inputType:"insertLineBreak"},{key:"Delete",keyCode:46,inputType:"deleteContentForward"}],dm="dthko",Hd=[16,17,18,20,91,92,224,225],vn=6;function wn(i){return Math.max(0,i)*.7+8}function fm(i,e){return Math.max(Math.abs(i.clientX-e.clientX),Math.abs(i.clientY-e.clientY))}class um{constructor(e,t,s,n){this.view=e,this.startEvent=t,this.style=s,this.mustSelect=n,this.scrollSpeed={x:0,y:0},this.scrolling=-1,this.lastEvent=t,this.scrollParents=cd(e.contentDOM),this.atoms=e.state.facet(ln).map(o=>o(e));let r=e.contentDOM.ownerDocument;r.addEventListener("mousemove",this.move=this.move.bind(this)),r.addEventListener("mouseup",this.up=this.up.bind(this)),this.extend=t.shiftKey,this.multiple=e.state.facet(q.allowMultipleSelections)&&pm(e,t),this.dragging=mm(e,t)&&Qd(t)==1?null:!1}start(e){this.dragging===!1&&this.select(e)}move(e){if(e.buttons==0)return this.destroy();if(this.dragging||this.dragging==null&&fm(this.startEvent,e)<10)return;this.select(this.lastEvent=e);let t=0,s=0,n=0,r=0,o=this.view.win.innerWidth,a=this.view.win.innerHeight;this.scrollParents.x&&({left:n,right:o}=this.scrollParents.x.getBoundingClientRect()),this.scrollParents.y&&({top:r,bottom:a}=this.scrollParents.y.getBoundingClientRect());let l=Xa(this.view);e.clientX-l.left<=n+vn?t=-wn(n-e.clientX):e.clientX+l.right>=o-vn&&(t=wn(e.clientX-o)),e.clientY-l.top<=r+vn?s=-wn(r-e.clientY):e.clientY+l.bottom>=a-vn&&(s=wn(e.clientY-a)),this.setScrollSpeed(t,s)}up(e){this.dragging==null&&this.select(this.lastEvent),this.dragging||e.preventDefault(),this.destroy()}destroy(){this.setScrollSpeed(0,0);let e=this.view.contentDOM.ownerDocument;e.removeEventListener("mousemove",this.move),e.removeEventListener("mouseup",this.up),this.view.inputState.mouseSelection=this.view.inputState.draggedContent=null}setScrollSpeed(e,t){this.scrollSpeed={x:e,y:t},e||t?this.scrolling<0&&(this.scrolling=setInterval(()=>this.scroll(),50)):this.scrolling>-1&&(clearInterval(this.scrolling),this.scrolling=-1)}scroll(){let{x:e,y:t}=this.scrollSpeed;e&&this.scrollParents.x&&(this.scrollParents.x.scrollLeft+=e,e=0),t&&this.scrollParents.y&&(this.scrollParents.y.scrollTop+=t,t=0),(e||t)&&this.view.win.scrollBy(e,t),this.dragging===!1&&this.select(this.lastEvent)}select(e){let{view:t}=this,s=Ld(this.atoms,this.style.get(e,this.extend,this.multiple));(this.mustSelect||!s.eq(t.state.selection,this.dragging===!1))&&this.view.dispatch({selection:s,userEvent:"select.pointer"}),this.mustSelect=!1}update(e){e.transactions.some(t=>t.isUserEvent("input.type"))?this.destroy():this.style.update(e)&&setTimeout(()=>this.select(this.lastEvent),20)}}function pm(i,e){let t=i.state.facet(vd);return t.length?t[0](e):T.mac?e.metaKey:e.ctrlKey}function gm(i,e){let t=i.state.facet(wd);return t.length?t[0](e):T.mac?!e.altKey:!e.ctrlKey}function mm(i,e){let{main:t}=i.state.selection;if(t.empty)return!1;let s=qs(i.root);if(!s||s.rangeCount==0)return!0;let n=s.getRangeAt(0).getClientRects();for(let r=0;r<n.length;r++){let o=n[r];if(o.left<=e.clientX&&o.right>=e.clientX&&o.top<=e.clientY&&o.bottom>=e.clientY)return!0}return!1}function bm(i,e){if(!e.bubbles)return!0;if(e.defaultPrevented)return!1;for(let t=e.target,s;t!=i.contentDOM;t=t.parentNode)if(!t||t.nodeType==11||(s=oe.get(t))&&s.isWidget()&&!s.isHidden&&s.widget.ignoreEvent(e))return!1;return!0}const ot=Object.create(null),ze=Object.create(null),Wd=T.ie&&T.ie_version<15||T.ios&&T.webkit_version<604;function ym(i){let e=i.dom.parentNode;if(!e)return;let t=e.appendChild(document.createElement("textarea"));t.style.cssText="position: fixed; left: -10000px; top: 10px",t.focus(),setTimeout(()=>{i.focus(),t.remove(),qd(i,t.value)},50)}function _r(i,e,t){for(let s of i.facet(e))t=s(t,i);return t}function qd(i,e){e=_r(i.state,Qa,e);let{state:t}=i,s,n=1,r=t.toText(e),o=r.lines==t.selection.ranges.length;if(ra!=null&&t.selection.ranges.every(l=>l.empty)&&ra==r.toString()){let l=-1;s=t.changeByRange(h=>{let c=t.doc.lineAt(h.from);if(c.from==l)return{range:h};l=c.from;let d=t.toText((o?r.line(n++).text:e)+t.lineBreak);return{changes:{from:c.from,insert:d},range:k.cursor(h.from+d.length)}})}else o?s=t.changeByRange(l=>{let h=r.line(n++);return{changes:{from:l.from,to:l.to,insert:h.text},range:k.cursor(l.from+h.length)}}):s=t.replaceSelection(r);i.dispatch(s,{userEvent:"input.paste",scrollIntoView:!0})}ze.scroll=i=>{i.inputState.lastScrollTop=i.scrollDOM.scrollTop,i.inputState.lastScrollLeft=i.scrollDOM.scrollLeft};ze.wheel=ze.mousewheel=i=>{i.inputState.lastWheelEvent=Date.now()};ot.keydown=(i,e)=>(i.inputState.setSelectionOrigin("select"),e.keyCode==27&&i.inputState.tabFocusMode!=0&&(i.inputState.tabFocusMode=Date.now()+2e3),!1);ze.touchstart=(i,e)=>{let t=i.inputState,s=e.targetTouches[0];t.lastTouchTime=Date.now(),s&&(t.lastTouchX=s.clientX,t.lastTouchY=s.clientY),t.setSelectionOrigin("select.pointer")};ze.touchmove=i=>{i.inputState.setSelectionOrigin("select.pointer")};ot.mousedown=(i,e)=>{if(i.observer.flush(),i.inputState.lastTouchTime>Date.now()-2e3)return!1;let t=null;for(let s of i.state.facet(kd))if(t=s(i,e),t)break;if(!t&&e.button==0&&(t=vm(i,e)),t){let s=!i.hasFocus;i.inputState.startMouseSelection(new um(i,e,t,s)),s&&i.observer.ignore(()=>{dd(i.contentDOM);let r=i.root.activeElement;r&&!r.contains(i.contentDOM)&&r.blur()});let n=i.inputState.mouseSelection;if(n)return n.start(e),n.dragging===!1}else i.inputState.setSelectionOrigin("select.pointer");return!1};function oh(i,e,t,s){if(s==1)return k.cursor(e,t);if(s==2)return Kg(i.state,e,t);{let n=i.docView.lineAt(e,t),r=i.state.doc.lineAt(n?n.posAtEnd:e),o=n?n.posAtStart:r.from,a=n?n.posAtEnd:r.to;return a<i.state.doc.length&&a==r.to&&a++,k.range(o,a)}}const xm=T.ie&&T.ie_version<=11;let ah=null,lh=0,hh=0;function Qd(i){if(!xm)return i.detail;let e=ah,t=hh;return ah=i,hh=Date.now(),lh=!e||t>Date.now()-400&&Math.abs(e.clientX-i.clientX)<2&&Math.abs(e.clientY-i.clientY)<2?(lh+1)%3:1}function vm(i,e){let t=i.posAndSideAtCoords({x:e.clientX,y:e.clientY},!1),s=Qd(e),n=i.state.selection;return{update(r){r.docChanged&&(t.pos=r.changes.mapPos(t.pos),n=n.map(r.changes))},get(r,o,a){let l=i.posAndSideAtCoords({x:r.clientX,y:r.clientY},!1),h,c=oh(i,l.pos,l.assoc,s);if(t.pos!=l.pos&&!o){let d=oh(i,t.pos,t.assoc,s),f=Math.min(d.from,c.from),u=Math.max(d.to,c.to);c=f<c.from?k.range(f,u,c.assoc):k.range(u,f,c.assoc)}return o?n.replaceRange(n.main.extend(c.from,c.to,c.assoc)):a&&s==1&&n.ranges.length>1&&(h=wm(n,l.pos))?h:a?n.addRange(c):k.create([c])}}}function wm(i,e){for(let t=0;t<i.ranges.length;t++){let{from:s,to:n}=i.ranges[t];if(s<=e&&n>=e)return k.create(i.ranges.slice(0,t).concat(i.ranges.slice(t+1)),i.mainIndex==t?0:i.mainIndex-(i.mainIndex>t?1:0))}return null}ot.dragstart=(i,e)=>{let{selection:{main:t}}=i.state;if(e.target.draggable){let n=i.docView.tile.nearest(e.target);if(n&&n.isWidget()){let r=n.posAtStart,o=r+n.length;(r>=t.to||o<=t.from)&&(t=k.range(r,o))}}let{inputState:s}=i;return s.mouseSelection&&(s.mouseSelection.dragging=!0),s.draggedContent=t,e.dataTransfer&&(e.dataTransfer.setData("Text",_r(i.state,Va,i.state.sliceDoc(t.from,t.to))),e.dataTransfer.effectAllowed="copyMove"),!1};ot.dragend=i=>(i.inputState.draggedContent=null,!1);function ch(i,e,t,s){if(t=_r(i.state,Qa,t),!t)return;let n=i.posAtCoords({x:e.clientX,y:e.clientY},!1),{draggedContent:r}=i.inputState,o=s&&r&&gm(i,e)?{from:r.from,to:r.to}:null,a={from:n,insert:t},l=i.state.changes(o?[o,a]:a);i.focus(),i.dispatch({changes:l,selection:{anchor:l.mapPos(n,-1),head:l.mapPos(n,1)},userEvent:o?"move.drop":"input.drop"}),i.inputState.draggedContent=null}ot.drop=(i,e)=>{if(!e.dataTransfer)return!1;if(i.state.readOnly)return!0;let t=e.dataTransfer.files;if(t&&t.length){let s=Array(t.length),n=0,r=()=>{++n==t.length&&ch(i,e,s.filter(o=>o!=null).join(i.state.lineBreak),!1)};for(let o=0;o<t.length;o++){let a=new FileReader;a.onerror=r,a.onload=()=>{/[\x00-\x08\x0e-\x1f]{2}/.test(a.result)||(s[o]=a.result),r()},a.readAsText(t[o])}return!0}else{let s=e.dataTransfer.getData("Text");if(s)return ch(i,e,s,!0),!0}return!1};ot.paste=(i,e)=>{if(i.state.readOnly)return!0;i.observer.flush();let t=Wd?null:e.clipboardData;return t?(qd(i,t.getData("text/plain")||t.getData("text/uri-list")),!0):(ym(i),!1)};function km(i,e){let t=i.dom.parentNode;if(!t)return;let s=t.appendChild(document.createElement("textarea"));s.style.cssText="position: fixed; left: -10000px; top: 10px",s.value=e,s.focus(),s.selectionEnd=e.length,s.selectionStart=0,setTimeout(()=>{s.remove(),i.focus()},50)}function Sm(i){let e=[],t=[],s=!1;for(let n of i.selection.ranges)n.empty||(e.push(i.sliceDoc(n.from,n.to)),t.push(n));if(!e.length){let n=-1;for(let{from:r}of i.selection.ranges){let o=i.doc.lineAt(r);o.number>n&&(e.push(o.text),t.push({from:o.from,to:Math.min(i.doc.length,o.to+1)})),n=o.number}s=!0}return{text:_r(i,Va,e.join(i.lineBreak)),ranges:t,linewise:s}}let ra=null;ot.copy=ot.cut=(i,e)=>{if(!Ps(i.contentDOM,i.observer.selectionRange))return!1;let{text:t,ranges:s,linewise:n}=Sm(i.state);if(!t&&!n)return!1;ra=n?t:null,e.type=="cut"&&!i.state.readOnly&&i.dispatch({changes:s,scrollIntoView:!0,userEvent:"delete.cut"});let r=Wd?null:e.clipboardData;return r?(r.clearData(),r.setData("text/plain",t),!0):(km(i,t),!1)};const Vd=Ft.define();function Ud(i,e){let t=[];for(let s of i.facet(Od)){let n=s(i,e);n&&t.push(n)}return t.length?i.update({effects:t,annotations:Vd.of(!0)}):null}function jd(i){setTimeout(()=>{let e=i.hasFocus;if(e!=i.inputState.notifiedFocused){let t=Ud(i.state,e);t?i.dispatch(t):i.update([])}},10)}ze.focus=i=>{i.inputState.lastFocusTime=Date.now(),!i.scrollDOM.scrollTop&&(i.inputState.lastScrollTop||i.inputState.lastScrollLeft)&&(i.scrollDOM.scrollTop=i.inputState.lastScrollTop,i.scrollDOM.scrollLeft=i.inputState.lastScrollLeft),jd(i)};ze.blur=i=>{i.observer.clearSelectionRange(),jd(i)};ze.compositionstart=ze.compositionupdate=i=>{i.observer.editContext||(i.inputState.compositionFirstChange==null&&(i.inputState.compositionFirstChange=!0),i.inputState.composing<0&&(i.inputState.composing=0))};ze.compositionend=i=>{i.observer.editContext||(i.inputState.composing=-1,i.inputState.compositionEndedAt=Date.now(),i.inputState.compositionPendingKey=!0,i.inputState.compositionPendingChange=i.observer.pendingRecords().length>0,i.inputState.compositionFirstChange=null,T.chrome&&T.android?i.observer.flushSoon():i.inputState.compositionPendingChange?Promise.resolve().then(()=>i.observer.flush()):setTimeout(()=>{i.inputState.composing<0&&i.docView.hasComposition&&i.update([])},50))};ze.contextmenu=i=>{i.inputState.lastContextMenu=Date.now()};ot.beforeinput=(i,e)=>{var t,s;if((e.inputType=="insertText"||e.inputType=="insertCompositionText")&&(i.inputState.insertingText=e.data,i.inputState.insertingTextAt=Date.now()),e.inputType=="insertReplacementText"&&i.observer.editContext){let r=(t=e.dataTransfer)===null||t===void 0?void 0:t.getData("text/plain"),o=e.getTargetRanges();if(r&&o.length){let a=o[0],l=i.posAtDOM(a.startContainer,a.startOffset),h=i.posAtDOM(a.endContainer,a.endOffset);return Ja(i,{from:l,to:h,insert:i.state.toText(r)},null),!0}}let n;if(T.chrome&&T.android&&(n=Fd.find(r=>r.inputType==e.inputType))&&(i.observer.delayAndroidKey(n.key,n.keyCode),n.key=="Backspace"||n.key=="Delete")){let r=((s=window.visualViewport)===null||s===void 0?void 0:s.height)||0;setTimeout(()=>{var o;(((o=window.visualViewport)===null||o===void 0?void 0:o.height)||0)>r+10&&i.hasFocus&&(i.contentDOM.blur(),i.focus())},100)}return T.ios&&e.inputType=="deleteContentForward"&&i.observer.flushSoon(),T.safari&&e.inputType=="insertText"&&i.inputState.composing>=0&&setTimeout(()=>ze.compositionend(i,e),20),!1};const dh=new Set;function Cm(i){dh.has(i)||(dh.add(i),i.addEventListener("copy",()=>{}),i.addEventListener("cut",()=>{}))}const fh=["pre-wrap","normal","pre-line","break-spaces"];let os=!1;function uh(){os=!1}class Om{constructor(e){this.lineWrapping=e,this.doc=V.empty,this.heightSamples={},this.lineHeight=14,this.charWidth=7,this.textHeight=14,this.lineLength=30}heightForGap(e,t){let s=this.doc.lineAt(t).number-this.doc.lineAt(e).number+1;return this.lineWrapping&&(s+=Math.max(0,Math.ceil((t-e-s*this.lineLength*.5)/this.lineLength))),this.lineHeight*s}heightForLine(e){return this.lineWrapping?(1+Math.max(0,Math.ceil((e-this.lineLength)/Math.max(1,this.lineLength-5))))*this.lineHeight:this.lineHeight}setDoc(e){return this.doc=e,this}mustRefreshForWrapping(e){return fh.indexOf(e)>-1!=this.lineWrapping}mustRefreshForHeights(e){let t=!1;for(let s=0;s<e.length;s++){let n=e[s];n<0?s++:this.heightSamples[Math.floor(n*10)]||(t=!0,this.heightSamples[Math.floor(n*10)]=!0)}return t}refresh(e,t,s,n,r,o){let a=fh.indexOf(e)>-1,l=Math.abs(t-this.lineHeight)>.3||this.lineWrapping!=a||Math.abs(s-this.charWidth)>.1;if(this.lineWrapping=a,this.lineHeight=t,this.charWidth=s,this.textHeight=n,this.lineLength=r,l){this.heightSamples={};for(let h=0;h<o.length;h++){let c=o[h];c<0?h++:this.heightSamples[Math.floor(c*10)]=!0}}return l}}class Am{constructor(e,t){this.from=e,this.heights=t,this.index=0}get more(){return this.index<this.heights.length}}class it{constructor(e,t,s,n,r){this.from=e,this.length=t,this.top=s,this.height=n,this._content=r}get type(){return typeof this._content=="number"?Ce.Text:Array.isArray(this._content)?this._content:this._content.type}get to(){return this.from+this.length}get bottom(){return this.top+this.height}get widget(){return this._content instanceof Mi?this._content.widget:null}get widgetLineBreaks(){return typeof this._content=="number"?this._content:0}join(e){let t=(Array.isArray(this._content)?this._content:[this]).concat(Array.isArray(e._content)?e._content:[e]);return new it(this.from,this.length+e.length,this.top,this.height+e.height,t)}}var ee=(function(i){return i[i.ByPos=0]="ByPos",i[i.ByHeight=1]="ByHeight",i[i.ByPosNoHeight=2]="ByPosNoHeight",i})(ee||(ee={}));const Qn=.001;class Re{constructor(e,t,s=2){this.length=e,this.height=t,this.flags=s}get outdated(){return(this.flags&2)>0}set outdated(e){this.flags=(e?2:0)|this.flags&-3}setHeight(e){this.height!=e&&(Math.abs(this.height-e)>Qn&&(os=!0),this.height=e)}replace(e,t,s){return Re.of(s)}decomposeLeft(e,t){t.push(this)}decomposeRight(e,t){t.push(this)}applyChanges(e,t,s,n){let r=this,o=s.doc;for(let a=n.length-1;a>=0;a--){let{fromA:l,toA:h,fromB:c,toB:d}=n[a],f=r.lineAt(l,ee.ByPosNoHeight,s.setDoc(t),0,0),u=f.to>=h?f:r.lineAt(h,ee.ByPosNoHeight,s,0,0);for(d+=u.to-h,h=u.to;a>0&&f.from<=n[a-1].toA;)l=n[a-1].fromA,c=n[a-1].fromB,a--,l<f.from&&(f=r.lineAt(l,ee.ByPosNoHeight,s,0,0));c+=f.from-l,l=f.from;let p=Ka.build(s.setDoc(o),e,c,d);r=lr(r,r.replace(l,h,p))}return r.updateHeight(s,0)}static empty(){return new Qe(0,0,0)}static of(e){if(e.length==1)return e[0];let t=0,s=e.length,n=0,r=0;for(;;)if(t==s)if(n>r*2){let a=e[t-1];a.break?e.splice(--t,1,a.left,null,a.right):e.splice(--t,1,a.left,a.right),s+=1+a.break,n-=a.size}else if(r>n*2){let a=e[s];a.break?e.splice(s,1,a.left,null,a.right):e.splice(s,1,a.left,a.right),s+=2+a.break,r-=a.size}else break;else if(n<r){let a=e[t++];a&&(n+=a.size)}else{let a=e[--s];a&&(r+=a.size)}let o=0;return e[t-1]==null?(o=1,t--):e[t]==null&&(o=1,s++),new Pm(Re.of(e.slice(0,t)),o,Re.of(e.slice(s)))}}function lr(i,e){return i==e?i:(i.constructor!=e.constructor&&(os=!0),e)}Re.prototype.size=1;const $m=L.replace({});class Xd extends Re{constructor(e,t,s){super(e,t),this.deco=s,this.spaceAbove=0}mainBlock(e,t){return new it(t,this.length,e+this.spaceAbove,this.height-this.spaceAbove,this.deco||0)}blockAt(e,t,s,n){return this.spaceAbove&&e<s+this.spaceAbove?new it(n,0,s,this.spaceAbove,$m):this.mainBlock(s,n)}lineAt(e,t,s,n,r){let o=this.mainBlock(n,r);return this.spaceAbove?this.blockAt(0,s,n,r).join(o):o}forEachLine(e,t,s,n,r,o){e<=r+this.length&&t>=r&&o(this.lineAt(0,ee.ByPos,s,n,r))}setMeasuredHeight(e){let t=e.heights[e.index++];t<0?(this.spaceAbove=-t,t=e.heights[e.index++]):this.spaceAbove=0,this.setHeight(t)}updateHeight(e,t=0,s=!1,n){return n&&n.from<=t&&n.more&&this.setMeasuredHeight(n),this.outdated=!1,this}toString(){return`block(${this.length})`}}class Qe extends Xd{constructor(e,t,s){super(e,t,null),this.collapsed=0,this.widgetHeight=0,this.breaks=0,this.spaceAbove=s}mainBlock(e,t){return new it(t,this.length,e+this.spaceAbove,this.height-this.spaceAbove,this.breaks)}replace(e,t,s){let n=s[0];return s.length==1&&(n instanceof Qe||n instanceof ke&&n.flags&4)&&Math.abs(this.length-n.length)<10?(n instanceof ke?n=new Qe(n.length,this.height,this.spaceAbove):n.height=this.height,this.outdated||(n.outdated=!1),n):Re.of(s)}updateHeight(e,t=0,s=!1,n){return n&&n.from<=t&&n.more?this.setMeasuredHeight(n):(s||this.outdated)&&(this.spaceAbove=0,this.setHeight(Math.max(this.widgetHeight,e.heightForLine(this.length-this.collapsed))+this.breaks*e.lineHeight)),this.outdated=!1,this}toString(){return`line(${this.length}${this.collapsed?-this.collapsed:""}${this.widgetHeight?":"+this.widgetHeight:""})`}}class ke extends Re{constructor(e){super(e,0)}heightMetrics(e,t){let s=e.doc.lineAt(t).number,n=e.doc.lineAt(t+this.length).number,r=n-s+1,o,a=0;if(e.lineWrapping){let l=Math.min(this.height,e.lineHeight*r);o=l/r,this.length>r+1&&(a=(this.height-l)/(this.length-r-1))}else o=this.height/r;return{firstLine:s,lastLine:n,perLine:o,perChar:a}}blockAt(e,t,s,n){let{firstLine:r,lastLine:o,perLine:a,perChar:l}=this.heightMetrics(t,n);if(t.lineWrapping){let h=n+(e<t.lineHeight?0:Math.round(Math.max(0,Math.min(1,(e-s)/this.height))*this.length)),c=t.doc.lineAt(h),d=a+c.length*l,f=Math.max(s,e-d/2);return new it(c.from,c.length,f,d,0)}else{let h=Math.max(0,Math.min(o-r,Math.floor((e-s)/a))),{from:c,length:d}=t.doc.line(r+h);return new it(c,d,s+a*h,a,0)}}lineAt(e,t,s,n,r){if(t==ee.ByHeight)return this.blockAt(e,s,n,r);if(t==ee.ByPosNoHeight){let{from:u,to:p}=s.doc.lineAt(e);return new it(u,p-u,0,0,0)}let{firstLine:o,perLine:a,perChar:l}=this.heightMetrics(s,r),h=s.doc.lineAt(e),c=a+h.length*l,d=h.number-o,f=n+a*d+l*(h.from-r-d);return new it(h.from,h.length,Math.max(n,Math.min(f,n+this.height-c)),c,0)}forEachLine(e,t,s,n,r,o){e=Math.max(e,r),t=Math.min(t,r+this.length);let{firstLine:a,perLine:l,perChar:h}=this.heightMetrics(s,r);for(let c=e,d=n;c<=t;){let f=s.doc.lineAt(c);if(c==e){let p=f.number-a;d+=l*p+h*(e-r-p)}let u=l+h*f.length;o(new it(f.from,f.length,d,u,0)),d+=u,c=f.to+1}}replace(e,t,s){let n=this.length-t;if(n>0){let r=s[s.length-1];r instanceof ke?s[s.length-1]=new ke(r.length+n):s.push(null,new ke(n-1))}if(e>0){let r=s[0];r instanceof ke?s[0]=new ke(e+r.length):s.unshift(new ke(e-1),null)}return Re.of(s)}decomposeLeft(e,t){t.push(new ke(e-1),null)}decomposeRight(e,t){t.push(null,new ke(this.length-e-1))}updateHeight(e,t=0,s=!1,n){let r=t+this.length;if(n&&n.from<=t+this.length&&n.more){let o=[],a=Math.max(t,n.from),l=-1;for(n.from>t&&o.push(new ke(n.from-t-1).updateHeight(e,t));a<=r&&n.more;){let c=e.doc.lineAt(a).length;o.length&&o.push(null);let d=n.heights[n.index++],f=0;d<0&&(f=-d,d=n.heights[n.index++]),l==-1?l=d:Math.abs(d-l)>=Qn&&(l=-2);let u=new Qe(c,d,f);u.outdated=!1,o.push(u),a+=c+1}a<=r&&o.push(null,new ke(r-a).updateHeight(e,a));let h=Re.of(o);return(l<0||Math.abs(h.height-this.height)>=Qn||Math.abs(l-this.heightMetrics(e,t).perLine)>=Qn)&&(os=!0),lr(this,h)}else(s||this.outdated)&&(this.setHeight(e.heightForGap(t,t+this.length)),this.outdated=!1);return this}toString(){return`gap(${this.length})`}}class Pm extends Re{constructor(e,t,s){super(e.length+t+s.length,e.height+s.height,t|(e.outdated||s.outdated?2:0)),this.left=e,this.right=s,this.size=e.size+s.size}get break(){return this.flags&1}blockAt(e,t,s,n){let r=s+this.left.height;return e<r?this.left.blockAt(e,t,s,n):this.right.blockAt(e,t,r,n+this.left.length+this.break)}lineAt(e,t,s,n,r){let o=n+this.left.height,a=r+this.left.length+this.break,l=t==ee.ByHeight?e<o:e<a,h=l?this.left.lineAt(e,t,s,n,r):this.right.lineAt(e,t,s,o,a);if(this.break||(l?h.to<a:h.from>a))return h;let c=t==ee.ByPosNoHeight?ee.ByPosNoHeight:ee.ByPos;return l?h.join(this.right.lineAt(a,c,s,o,a)):this.left.lineAt(a,c,s,n,r).join(h)}forEachLine(e,t,s,n,r,o){let a=n+this.left.height,l=r+this.left.length+this.break;if(this.break)e<l&&this.left.forEachLine(e,t,s,n,r,o),t>=l&&this.right.forEachLine(e,t,s,a,l,o);else{let h=this.lineAt(l,ee.ByPos,s,n,r);e<h.from&&this.left.forEachLine(e,h.from-1,s,n,r,o),h.to>=e&&h.from<=t&&o(h),t>h.to&&this.right.forEachLine(h.to+1,t,s,a,l,o)}}replace(e,t,s){let n=this.left.length+this.break;if(t<n)return this.balanced(this.left.replace(e,t,s),this.right);if(e>this.left.length)return this.balanced(this.left,this.right.replace(e-n,t-n,s));let r=[];e>0&&this.decomposeLeft(e,r);let o=r.length;for(let a of s)r.push(a);if(e>0&&ph(r,o-1),t<this.length){let a=r.length;this.decomposeRight(t,r),ph(r,a)}return Re.of(r)}decomposeLeft(e,t){let s=this.left.length;if(e<=s)return this.left.decomposeLeft(e,t);t.push(this.left),this.break&&(s++,e>=s&&t.push(null)),e>s&&this.right.decomposeLeft(e-s,t)}decomposeRight(e,t){let s=this.left.length,n=s+this.break;if(e>=n)return this.right.decomposeRight(e-n,t);e<s&&this.left.decomposeRight(e,t),this.break&&e<n&&t.push(null),t.push(this.right)}balanced(e,t){return e.size>2*t.size||t.size>2*e.size?Re.of(this.break?[e,null,t]:[e,t]):(this.left=lr(this.left,e),this.right=lr(this.right,t),this.setHeight(e.height+t.height),this.outdated=e.outdated||t.outdated,this.size=e.size+t.size,this.length=e.length+this.break+t.length,this)}updateHeight(e,t=0,s=!1,n){let{left:r,right:o}=this,a=t+r.length+this.break,l=null;return n&&n.from<=t+r.length&&n.more?l=r=r.updateHeight(e,t,s,n):r.updateHeight(e,t,s),n&&n.from<=a+o.length&&n.more?l=o=o.updateHeight(e,a,s,n):o.updateHeight(e,a,s),l?this.balanced(r,o):(this.height=this.left.height+this.right.height,this.outdated=!1,this)}toString(){return this.left+(this.break?" ":"-")+this.right}}function ph(i,e){let t,s;i[e]==null&&(t=i[e-1])instanceof ke&&(s=i[e+1])instanceof ke&&i.splice(e-1,3,new ke(t.length+1+s.length))}const Mm=5;class Ka{constructor(e,t){this.pos=e,this.oracle=t,this.nodes=[],this.lineStart=-1,this.lineEnd=-1,this.covering=null,this.writtenTo=e}get isCovered(){return this.covering&&this.nodes[this.nodes.length-1]==this.covering}span(e,t){if(this.lineStart>-1){let s=Math.min(t,this.lineEnd),n=this.nodes[this.nodes.length-1];n instanceof Qe?n.length+=s-this.pos:(s>this.pos||!this.isCovered)&&this.nodes.push(new Qe(s-this.pos,-1,0)),this.writtenTo=s,t>s&&(this.nodes.push(null),this.writtenTo++,this.lineStart=-1)}this.pos=t}point(e,t,s){if(e<t||s.heightRelevant){let n=s.widget?s.widget.estimatedHeight:0,r=s.widget?s.widget.lineBreaks:0;n<0&&(n=this.oracle.lineHeight);let o=t-e;s.block?this.addBlock(new Xd(o,n,s)):(o||r||n>=Mm)&&this.addLineDeco(n,r,o)}else t>e&&this.span(e,t);this.lineEnd>-1&&this.lineEnd<this.pos&&(this.lineEnd=this.oracle.doc.lineAt(this.pos).to)}enterLine(){if(this.lineStart>-1)return;let{from:e,to:t}=this.oracle.doc.lineAt(this.pos);this.lineStart=e,this.lineEnd=t,this.writtenTo<e&&((this.writtenTo<e-1||this.nodes[this.nodes.length-1]==null)&&this.nodes.push(this.blankContent(this.writtenTo,e-1)),this.nodes.push(null)),this.pos>e&&this.nodes.push(new Qe(this.pos-e,-1,0)),this.writtenTo=this.pos}blankContent(e,t){let s=new ke(t-e);return this.oracle.doc.lineAt(e).to==t&&(s.flags|=4),s}ensureLine(){this.enterLine();let e=this.nodes.length?this.nodes[this.nodes.length-1]:null;if(e instanceof Qe)return e;let t=new Qe(0,-1,0);return this.nodes.push(t),t}addBlock(e){this.enterLine();let t=e.deco;t&&t.startSide>0&&!this.isCovered&&this.ensureLine(),this.nodes.push(e),this.writtenTo=this.pos=this.pos+e.length,t&&t.endSide>0&&(this.covering=e)}addLineDeco(e,t,s){let n=this.ensureLine();n.length+=s,n.collapsed+=s,n.widgetHeight=Math.max(n.widgetHeight,e),n.breaks+=t,this.writtenTo=this.pos=this.pos+s}finish(e){let t=this.nodes.length==0?null:this.nodes[this.nodes.length-1];this.lineStart>-1&&!(t instanceof Qe)&&!this.isCovered?this.nodes.push(new Qe(0,-1,0)):(this.writtenTo<this.pos||t==null)&&this.nodes.push(this.blankContent(this.writtenTo,this.pos));let s=e;for(let n of this.nodes)n instanceof Qe&&n.updateHeight(this.oracle,s),s+=n?n.length:1;return this.nodes}static build(e,t,s,n){let r=new Ka(s,e);return H.spans(t,s,n,r,0),r.finish(s)}}function Tm(i,e,t){let s=new Dm;return H.compare(i,e,t,s,0),s.changes}class Dm{constructor(){this.changes=[]}compareRange(){}comparePoint(e,t,s,n){(e<t||s&&s.heightRelevant||n&&n.heightRelevant)&&Xi(e,t,this.changes,5)}}function Em(i,e){let t=i.getBoundingClientRect(),s=i.ownerDocument,n=s.defaultView||window,r=Math.max(0,t.left),o=Math.min(n.innerWidth,t.right),a=Math.max(0,t.top),l=Math.min(n.innerHeight,t.bottom);for(let h=i.parentNode;h&&h!=s.body;)if(h.nodeType==1){let c=h,d=window.getComputedStyle(c);if((c.scrollHeight>c.clientHeight||c.scrollWidth>c.clientWidth)&&d.overflow!="visible"){let f=c.getBoundingClientRect();r=Math.max(r,f.left),o=Math.min(o,f.right),a=Math.max(a,f.top),l=Math.min(h==i.parentNode?n.innerHeight:l,f.bottom)}h=d.position=="absolute"||d.position=="fixed"?c.offsetParent:c.parentNode}else if(h.nodeType==11)h=h.host;else break;return{left:r-t.left,right:Math.max(r,o)-t.left,top:a-(t.top+e),bottom:Math.max(a,l)-(t.top+e)}}function Rm(i){let e=i.getBoundingClientRect(),t=i.ownerDocument.defaultView||window;return e.left<t.innerWidth&&e.right>0&&e.top<t.innerHeight&&e.bottom>0}function Bm(i,e){let t=i.getBoundingClientRect();return{left:0,right:t.right-t.left,top:e,bottom:t.bottom-(t.top+e)}}class ao{constructor(e,t,s,n){this.from=e,this.to=t,this.size=s,this.displaySize=n}static same(e,t){if(e.length!=t.length)return!1;for(let s=0;s<e.length;s++){let n=e[s],r=t[s];if(n.from!=r.from||n.to!=r.to||n.size!=r.size)return!1}return!0}draw(e,t){return L.replace({widget:new _m(this.displaySize*(t?e.scaleY:e.scaleX),t)}).range(this.from,this.to)}}class _m extends Ht{constructor(e,t){super(),this.size=e,this.vertical=t}eq(e){return e.size==this.size&&e.vertical==this.vertical}toDOM(){let e=document.createElement("div");return this.vertical?e.style.height=this.size+"px":(e.style.width=this.size+"px",e.style.height="2px",e.style.display="inline-block"),e}get estimatedHeight(){return this.vertical?this.size:-1}}class gh{constructor(e,t){this.view=e,this.state=t,this.pixelViewport={left:0,right:window.innerWidth,top:0,bottom:0},this.inView=!0,this.paddingTop=0,this.paddingBottom=0,this.contentDOMWidth=0,this.contentDOMHeight=0,this.editorHeight=0,this.editorWidth=0,this.scaleX=1,this.scaleY=1,this.scrollOffset=0,this.scrolledToBottom=!1,this.scrollAnchorPos=0,this.scrollAnchorHeight=-1,this.scaler=mh,this.scrollTarget=null,this.printing=!1,this.mustMeasureContent=!0,this.defaultTextDirection=G.LTR,this.visibleRanges=[],this.mustEnforceCursorAssoc=!1;let s=t.facet(Ua).some(n=>typeof n!="function"&&n.class=="cm-lineWrapping");this.heightOracle=new Om(s),this.stateDeco=bh(t),this.heightMap=Re.empty().applyChanges(this.stateDeco,V.empty,this.heightOracle.setDoc(t.doc),[new Ke(0,0,0,t.doc.length)]);for(let n=0;n<2&&(this.viewport=this.getViewport(0,null),!!this.updateForViewport());n++);this.updateViewportLines(),this.lineGaps=this.ensureLineGaps([]),this.lineGapDeco=L.set(this.lineGaps.map(n=>n.draw(this,!1))),this.scrollParent=e.scrollDOM,this.computeVisibleRanges()}updateForViewport(){let e=[this.viewport],{main:t}=this.state.selection;for(let s=0;s<=1;s++){let n=s?t.head:t.anchor;if(!e.some(({from:r,to:o})=>n>=r&&n<=o)){let{from:r,to:o}=this.lineBlockAt(n);e.push(new kn(r,o))}}return this.viewports=e.sort((s,n)=>s.from-n.from),this.updateScaler()}updateScaler(){let e=this.scaler;return this.scaler=this.heightMap.height<=7e6?mh:new Ga(this.heightOracle,this.heightMap,this.viewports),e.eq(this.scaler)?0:2}updateViewportLines(){this.viewportLines=[],this.heightMap.forEachLine(this.viewport.from,this.viewport.to,this.heightOracle.setDoc(this.state.doc),0,0,e=>{this.viewportLines.push(ks(e,this.scaler))})}update(e,t=null){this.state=e.state;let s=this.stateDeco;this.stateDeco=bh(this.state);let n=e.changedRanges,r=Ke.extendWithRanges(n,Tm(s,this.stateDeco,e?e.changes:ue.empty(this.state.doc.length))),o=this.heightMap.height,a=this.scrolledToBottom?null:this.scrollAnchorAt(this.scrollOffset);uh(),this.heightMap=this.heightMap.applyChanges(this.stateDeco,e.startState.doc,this.heightOracle.setDoc(this.state.doc),r),(this.heightMap.height!=o||os)&&(e.flags|=2),a?(this.scrollAnchorPos=e.changes.mapPos(a.from,-1),this.scrollAnchorHeight=a.top):(this.scrollAnchorPos=-1,this.scrollAnchorHeight=o);let l=r.length?this.mapViewport(this.viewport,e.changes):this.viewport;(t&&(t.range.head<l.from||t.range.head>l.to)||!this.viewportIsAppropriate(l))&&(l=this.getViewport(0,t));let h=l.from!=this.viewport.from||l.to!=this.viewport.to;this.viewport=l,e.flags|=this.updateForViewport(),(h||!e.changes.empty||e.flags&2)&&this.updateViewportLines(),(this.lineGaps.length||this.viewport.to-this.viewport.from>4e3)&&this.updateLineGaps(this.ensureLineGaps(this.mapLineGaps(this.lineGaps,e.changes))),e.flags|=this.computeVisibleRanges(e.changes),t&&(this.scrollTarget=t),!this.mustEnforceCursorAssoc&&(e.selectionSet||e.focusChanged)&&e.view.lineWrapping&&e.state.selection.main.empty&&e.state.selection.main.assoc&&!e.state.facet($d)&&(this.mustEnforceCursorAssoc=!0)}measure(){let{view:e}=this,t=e.contentDOM,s=window.getComputedStyle(t),n=this.heightOracle,r=s.whiteSpace;this.defaultTextDirection=s.direction=="rtl"?G.RTL:G.LTR;let o=this.heightOracle.mustRefreshForWrapping(r)||this.mustMeasureContent==="refresh",a=t.getBoundingClientRect(),l=o||this.mustMeasureContent||this.contentDOMHeight!=a.height;this.contentDOMHeight=a.height,this.mustMeasureContent=!1;let h=0,c=0;if(a.width&&a.height){let{scaleX:A,scaleY:$}=hd(t,a);(A>.005&&Math.abs(this.scaleX-A)>.005||$>.005&&Math.abs(this.scaleY-$)>.005)&&(this.scaleX=A,this.scaleY=$,h|=16,o=l=!0)}let d=(parseInt(s.paddingTop)||0)*this.scaleY,f=(parseInt(s.paddingBottom)||0)*this.scaleY;(this.paddingTop!=d||this.paddingBottom!=f)&&(this.paddingTop=d,this.paddingBottom=f,h|=18),this.editorWidth!=e.scrollDOM.clientWidth&&(n.lineWrapping&&(l=!0),this.editorWidth=e.scrollDOM.clientWidth,h|=16);let u=cd(this.view.contentDOM,!1).y;u!=this.scrollParent&&(this.scrollParent=u,this.scrollAnchorHeight=-1,this.scrollOffset=0);let p=this.getScrollOffset();this.scrollOffset!=p&&(this.scrollAnchorHeight=-1,this.scrollOffset=p),this.scrolledToBottom=fd(this.scrollParent||e.win);let m=(this.printing?Bm:Em)(t,this.paddingTop),b=m.top-this.pixelViewport.top,x=m.bottom-this.pixelViewport.bottom;this.pixelViewport=m;let S=this.pixelViewport.bottom>this.pixelViewport.top&&this.pixelViewport.right>this.pixelViewport.left;if(S!=this.inView&&(this.inView=S,S&&(l=!0)),!this.inView&&!this.scrollTarget&&!Rm(e.dom))return 0;let C=a.width;if((this.contentDOMWidth!=C||this.editorHeight!=e.scrollDOM.clientHeight)&&(this.contentDOMWidth=a.width,this.editorHeight=e.scrollDOM.clientHeight,h|=16),l){let A=e.docView.measureVisibleLineHeights(this.viewport);if(n.mustRefreshForHeights(A)&&(o=!0),o||n.lineWrapping&&Math.abs(C-this.contentDOMWidth)>n.charWidth){let{lineHeight:$,charWidth:P,textHeight:I}=e.docView.measureTextSize();o=$>0&&n.refresh(r,$,P,I,Math.max(5,C/P),A),o&&(e.docView.minWidth=0,h|=16)}b>0&&x>0?c=Math.max(b,x):b<0&&x<0&&(c=Math.min(b,x)),uh();for(let $ of this.viewports){let P=$.from==this.viewport.from?A:e.docView.measureVisibleLineHeights($);this.heightMap=(o?Re.empty().applyChanges(this.stateDeco,V.empty,this.heightOracle,[new Ke(0,0,0,e.state.doc.length)]):this.heightMap).updateHeight(n,0,o,new Am($.from,P))}os&&(h|=2)}let R=!this.viewportIsAppropriate(this.viewport,c)||this.scrollTarget&&(this.scrollTarget.range.head<this.viewport.from||this.scrollTarget.range.head>this.viewport.to);return R&&(h&2&&(h|=this.updateScaler()),this.viewport=this.getViewport(c,this.scrollTarget),h|=this.updateForViewport()),(h&2||R)&&this.updateViewportLines(),(this.lineGaps.length||this.viewport.to-this.viewport.from>4e3)&&this.updateLineGaps(this.ensureLineGaps(o?[]:this.lineGaps,e)),h|=this.computeVisibleRanges(),this.mustEnforceCursorAssoc&&(this.mustEnforceCursorAssoc=!1,e.docView.enforceCursorAssoc()),h}get visibleTop(){return this.scaler.fromDOM(this.pixelViewport.top)}get visibleBottom(){return this.scaler.fromDOM(this.pixelViewport.bottom)}getViewport(e,t){let s=.5-Math.max(-.5,Math.min(.5,e/1e3/2)),n=this.heightMap,r=this.heightOracle,{visibleTop:o,visibleBottom:a}=this,l=new kn(n.lineAt(o-s*1e3,ee.ByHeight,r,0,0).from,n.lineAt(a+(1-s)*1e3,ee.ByHeight,r,0,0).to);if(t){let{head:h}=t.range;if(h<l.from||h>l.to){let c=Math.min(this.editorHeight,this.pixelViewport.bottom-this.pixelViewport.top),d=n.lineAt(h,ee.ByPos,r,0,0),f;t.y=="center"?f=(d.top+d.bottom)/2-c/2:t.y=="start"||t.y=="nearest"&&h<l.from?f=d.top:f=d.bottom-c,l=new kn(n.lineAt(f-1e3/2,ee.ByHeight,r,0,0).from,n.lineAt(f+c+1e3/2,ee.ByHeight,r,0,0).to)}}return l}mapViewport(e,t){let s=t.mapPos(e.from,-1),n=t.mapPos(e.to,1);return new kn(this.heightMap.lineAt(s,ee.ByPos,this.heightOracle,0,0).from,this.heightMap.lineAt(n,ee.ByPos,this.heightOracle,0,0).to)}viewportIsAppropriate({from:e,to:t},s=0){if(!this.inView)return!0;let{top:n}=this.heightMap.lineAt(e,ee.ByPos,this.heightOracle,0,0),{bottom:r}=this.heightMap.lineAt(t,ee.ByPos,this.heightOracle,0,0),{visibleTop:o,visibleBottom:a}=this;return(e==0||n<=o-Math.max(10,Math.min(-s,250)))&&(t==this.state.doc.length||r>=a+Math.max(10,Math.min(s,250)))&&n>o-2*1e3&&r<a+2*1e3}mapLineGaps(e,t){if(!e.length||t.empty)return e;let s=[];for(let n of e)t.touchesRange(n.from,n.to)||s.push(new ao(t.mapPos(n.from),t.mapPos(n.to),n.size,n.displaySize));return s}ensureLineGaps(e,t){let s=this.heightOracle.lineWrapping,n=s?1e4:2e3,r=n>>1,o=n<<1;if(this.defaultTextDirection!=G.LTR&&!s)return[];let a=[],l=(c,d,f,u)=>{if(d-c<r)return;let p=this.state.selection.main,m=[p.from];p.empty||m.push(p.to);for(let x of m)if(x>c&&x<d){l(c,x-10,f,u),l(x+10,d,f,u);return}let b=Im(e,x=>x.from>=f.from&&x.to<=f.to&&Math.abs(x.from-c)<r&&Math.abs(x.to-d)<r&&!m.some(S=>x.from<S&&x.to>S));if(!b){if(d<f.to&&t&&s&&t.visibleRanges.some(C=>C.from<=d&&C.to>=d)){let C=t.moveToLineBoundary(k.cursor(d),!1,!0).head;C>c&&(d=C)}let x=this.gapSize(f,c,d,u),S=s||x<2e6?x:2e6;b=new ao(c,d,x,S)}a.push(b)},h=c=>{if(c.length<o||c.type!=Ce.Text)return;let d=Lm(c.from,c.to,this.stateDeco);if(d.total<o)return;let f=this.scrollTarget?this.scrollTarget.range.head:null,u,p;if(s){let m=n/this.heightOracle.lineLength*this.heightOracle.lineHeight,b,x;if(f!=null){let S=Cn(d,f),C=((this.visibleBottom-this.visibleTop)/2+m)/c.height;b=S-C,x=S+C}else b=(this.visibleTop-c.top-m)/c.height,x=(this.visibleBottom-c.top+m)/c.height;u=Sn(d,b),p=Sn(d,x)}else{let m=d.total*this.heightOracle.charWidth,b=n*this.heightOracle.charWidth,x=0;if(m>2e6)for(let $ of e)$.from>=c.from&&$.from<c.to&&$.size!=$.displaySize&&$.from*this.heightOracle.charWidth+x<this.pixelViewport.left&&(x=$.size-$.displaySize);let S=this.pixelViewport.left+x,C=this.pixelViewport.right+x,R,A;if(f!=null){let $=Cn(d,f),P=((C-S)/2+b)/m;R=$-P,A=$+P}else R=(S-b)/m,A=(C+b)/m;u=Sn(d,R),p=Sn(d,A)}u>c.from&&l(c.from,u,c,d),p<c.to&&l(p,c.to,c,d)};for(let c of this.viewportLines)Array.isArray(c.type)?c.type.forEach(h):h(c);return a}gapSize(e,t,s,n){let r=Cn(n,s)-Cn(n,t);return this.heightOracle.lineWrapping?e.height*r:n.total*this.heightOracle.charWidth*r}updateLineGaps(e){ao.same(e,this.lineGaps)||(this.lineGaps=e,this.lineGapDeco=L.set(e.map(t=>t.draw(this,this.heightOracle.lineWrapping))))}computeVisibleRanges(e){let t=this.stateDeco;this.lineGaps.length&&(t=t.concat(this.lineGapDeco));let s=[];H.spans(t,this.viewport.from,this.viewport.to,{span(r,o){s.push({from:r,to:o})},point(){}},20);let n=0;if(s.length!=this.visibleRanges.length)n=12;else for(let r=0;r<s.length&&!(n&8);r++){let o=this.visibleRanges[r],a=s[r];(o.from!=a.from||o.to!=a.to)&&(n|=4,e&&e.mapPos(o.from,-1)==a.from&&e.mapPos(o.to,1)==a.to||(n|=8))}return this.visibleRanges=s,n}lineBlockAt(e){return e>=this.viewport.from&&e<=this.viewport.to&&this.viewportLines.find(t=>t.from<=e&&t.to>=e)||ks(this.heightMap.lineAt(e,ee.ByPos,this.heightOracle,0,0),this.scaler)}lineBlockAtHeight(e){return e>=this.viewportLines[0].top&&e<=this.viewportLines[this.viewportLines.length-1].bottom&&this.viewportLines.find(t=>t.top<=e&&t.bottom>=e)||ks(this.heightMap.lineAt(this.scaler.fromDOM(e),ee.ByHeight,this.heightOracle,0,0),this.scaler)}getScrollOffset(){return(this.scrollParent==this.view.scrollDOM?this.scrollParent.scrollTop:(this.scrollParent?this.scrollParent.getBoundingClientRect().top:0)-this.view.contentDOM.getBoundingClientRect().top)*this.scaleY}scrollAnchorAt(e){let t=this.lineBlockAtHeight(e+8);return t.from>=this.viewport.from||this.viewportLines[0].top-e>200?t:this.viewportLines[0]}elementAtHeight(e){return ks(this.heightMap.blockAt(this.scaler.fromDOM(e),this.heightOracle,0,0),this.scaler)}get docHeight(){return this.scaler.toDOM(this.heightMap.height)}get contentHeight(){return this.docHeight+this.paddingTop+this.paddingBottom}}class kn{constructor(e,t){this.from=e,this.to=t}}function Lm(i,e,t){let s=[],n=i,r=0;return H.spans(t,i,e,{span(){},point(o,a){o>n&&(s.push({from:n,to:o}),r+=o-n),n=a}},20),n<e&&(s.push({from:n,to:e}),r+=e-n),{total:r,ranges:s}}function Sn({total:i,ranges:e},t){if(t<=0)return e[0].from;if(t>=1)return e[e.length-1].to;let s=Math.floor(i*t);for(let n=0;;n++){let{from:r,to:o}=e[n],a=o-r;if(s<=a)return r+s;s-=a}}function Cn(i,e){let t=0;for(let{from:s,to:n}of i.ranges){if(e<=n){t+=e-s;break}t+=n-s}return t/i.total}function Im(i,e){for(let t of i)if(e(t))return t}const mh={toDOM(i){return i},fromDOM(i){return i},scale:1,eq(i){return i==this}};function bh(i){let e=i.facet(Er).filter(s=>typeof s!="function"),t=i.facet(ja).filter(s=>typeof s!="function");return t.length&&e.push(H.join(t)),e}class Ga{constructor(e,t,s){let n=0,r=0,o=0;this.viewports=s.map(({from:a,to:l})=>{let h=t.lineAt(a,ee.ByPos,e,0,0).top,c=t.lineAt(l,ee.ByPos,e,0,0).bottom;return n+=c-h,{from:a,to:l,top:h,bottom:c,domTop:0,domBottom:0}}),this.scale=(7e6-n)/(t.height-n);for(let a of this.viewports)a.domTop=o+(a.top-r)*this.scale,o=a.domBottom=a.domTop+(a.bottom-a.top),r=a.bottom}toDOM(e){for(let t=0,s=0,n=0;;t++){let r=t<this.viewports.length?this.viewports[t]:null;if(!r||e<r.top)return n+(e-s)*this.scale;if(e<=r.bottom)return r.domTop+(e-r.top);s=r.bottom,n=r.domBottom}}fromDOM(e){for(let t=0,s=0,n=0;;t++){let r=t<this.viewports.length?this.viewports[t]:null;if(!r||e<r.domTop)return s+(e-n)/this.scale;if(e<=r.domBottom)return r.top+(e-r.domTop);s=r.bottom,n=r.domBottom}}eq(e){return e instanceof Ga?this.scale==e.scale&&this.viewports.length==e.viewports.length&&this.viewports.every((t,s)=>t.from==e.viewports[s].from&&t.to==e.viewports[s].to):!1}}function ks(i,e){if(e.scale==1)return i;let t=e.toDOM(i.top),s=e.toDOM(i.bottom);return new it(i.from,i.length,t,s-t,Array.isArray(i._content)?i._content.map(n=>ks(n,e)):i._content)}const On=D.define({combine:i=>i.join(" ")}),oa=D.define({combine:i=>i.indexOf(!0)>-1}),aa=Gt.newName(),Jd=Gt.newName(),Kd=Gt.newName(),Gd={"&light":"."+Jd,"&dark":"."+Kd};function la(i,e,t){return new Gt(e,{finish(s){return/&/.test(s)?s.replace(/&\w*/,n=>{if(n=="&")return i;if(!t||!t[n])throw new RangeError(`Unsupported selector: ${n}`);return t[n]}):i+" "+s}})}const Nm=la("."+aa,{"&":{position:"relative !important",boxSizing:"border-box","&.cm-focused":{outline:"1px dotted #212121"},display:"flex !important",flexDirection:"column"},".cm-scroller":{display:"flex !important",alignItems:"flex-start !important",fontFamily:"monospace",lineHeight:1.4,height:"100%",overflowX:"auto",position:"relative",zIndex:0,overflowAnchor:"none"},".cm-content":{margin:0,flexGrow:2,flexShrink:0,display:"block",whiteSpace:"pre",wordWrap:"normal",boxSizing:"border-box",minHeight:"100%",padding:"4px 0",outline:"none","&[contenteditable=true]":{WebkitUserModify:"read-write-plaintext-only"}},".cm-lineWrapping":{whiteSpace_fallback:"pre-wrap",whiteSpace:"break-spaces",wordBreak:"break-word",overflowWrap:"anywhere",flexShrink:1},"&light .cm-content":{caretColor:"black"},"&dark .cm-content":{caretColor:"white"},".cm-line":{display:"block",padding:"0 2px 0 6px"},".cm-layer":{position:"absolute",left:0,top:0,contain:"size style","& > *":{position:"absolute"}},"&light .cm-selectionBackground":{background:"#d9d9d9"},"&dark .cm-selectionBackground":{background:"#222"},"&light.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":{background:"#d7d4f0"},"&dark.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":{background:"#233"},".cm-cursorLayer":{pointerEvents:"none"},"&.cm-focused > .cm-scroller > .cm-cursorLayer":{animation:"steps(1) cm-blink 1.2s infinite"},"@keyframes cm-blink":{"0%":{},"50%":{opacity:0},"100%":{}},"@keyframes cm-blink2":{"0%":{},"50%":{opacity:0},"100%":{}},".cm-cursor, .cm-dropCursor":{borderLeft:"1.2px solid black",marginLeft:"-0.6px",pointerEvents:"none"},".cm-cursor":{display:"none"},"&dark .cm-cursor":{borderLeftColor:"#ddd"},".cm-selectionHandle":{backgroundColor:"currentColor",width:"1.5px"},".cm-selectionHandle-start::before, .cm-selectionHandle-end::before":{content:'""',backgroundColor:"inherit",borderRadius:"50%",width:"8px",height:"8px",position:"absolute",left:"-3.25px"},".cm-selectionHandle-start::before":{top:"-8px"},".cm-selectionHandle-end::before":{bottom:"-8px"},".cm-dropCursor":{position:"absolute"},"&.cm-focused > .cm-scroller > .cm-cursorLayer .cm-cursor":{display:"block"},".cm-iso":{unicodeBidi:"isolate"},".cm-announced":{position:"fixed",top:"-10000px"},"@media print":{".cm-announced":{display:"none"}},"&light .cm-activeLine":{backgroundColor:"#cceeff44"},"&dark .cm-activeLine":{backgroundColor:"#99eeff33"},"&light .cm-specialChar":{color:"red"},"&dark .cm-specialChar":{color:"#f78"},".cm-gutters":{flexShrink:0,display:"flex",height:"100%",boxSizing:"border-box",zIndex:200},".cm-gutters-before":{insetInlineStart:0},".cm-gutters-after":{insetInlineEnd:0},"&light .cm-gutters":{backgroundColor:"#f5f5f5",color:"#6c6c6c",border:"0px solid #ddd","&.cm-gutters-before":{borderRightWidth:"1px"},"&.cm-gutters-after":{borderLeftWidth:"1px"}},"&dark .cm-gutters":{backgroundColor:"#333338",color:"#ccc"},".cm-gutter":{display:"flex !important",flexDirection:"column",flexShrink:0,boxSizing:"border-box",minHeight:"100%",overflow:"hidden"},".cm-gutterElement":{boxSizing:"border-box"},".cm-lineNumbers .cm-gutterElement":{padding:"0 3px 0 5px",minWidth:"20px",textAlign:"right",whiteSpace:"nowrap"},"&light .cm-activeLineGutter":{backgroundColor:"#e2f2ff"},"&dark .cm-activeLineGutter":{backgroundColor:"#222227"},".cm-panels":{boxSizing:"border-box",position:"sticky",left:0,right:0,zIndex:300},"&light .cm-panels":{backgroundColor:"#f5f5f5",color:"black"},"&light .cm-panels-top":{borderBottom:"1px solid #ddd"},"&light .cm-panels-bottom":{borderTop:"1px solid #ddd"},"&dark .cm-panels":{backgroundColor:"#333338",color:"white"},".cm-dialog":{padding:"2px 19px 4px 6px",position:"relative","& label":{fontSize:"80%"}},".cm-dialog-close":{position:"absolute",top:"3px",right:"4px",backgroundColor:"inherit",border:"none",font:"inherit",fontSize:"14px",padding:"0"},".cm-tab":{display:"inline-block",overflow:"hidden",verticalAlign:"bottom"},".cm-widgetBuffer":{verticalAlign:"text-top",height:"1em",width:0,display:"inline"},".cm-placeholder":{color:"#888",display:"inline-block",verticalAlign:"top",userSelect:"none"},".cm-highlightSpace":{backgroundImage:"radial-gradient(circle at 50% 55%, #aaa 20%, transparent 5%)",backgroundPosition:"center"},".cm-highlightTab":{backgroundImage:`url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="20"><path stroke="%23888" stroke-width="1" fill="none" d="M1 10H196L190 5M190 15L196 10M197 4L197 16"/></svg>')`,backgroundSize:"auto 100%",backgroundPosition:"right 90%",backgroundRepeat:"no-repeat"},".cm-trailingSpace":{backgroundColor:"#ff332255"},".cm-button":{verticalAlign:"middle",color:"inherit",fontSize:"70%",padding:".2em 1em",borderRadius:"1px"},"&light .cm-button":{backgroundImage:"linear-gradient(#eff1f5, #d9d9df)",border:"1px solid #888","&:active":{backgroundImage:"linear-gradient(#b4b4b4, #d0d3d6)"}},"&dark .cm-button":{backgroundImage:"linear-gradient(#393939, #111)",border:"1px solid #888","&:active":{backgroundImage:"linear-gradient(#111, #333)"}},".cm-textfield":{verticalAlign:"middle",color:"inherit",fontSize:"70%",border:"1px solid silver",padding:".2em .5em"},"&light .cm-textfield":{backgroundColor:"white"},"&dark .cm-textfield":{border:"1px solid #555",backgroundColor:"inherit"}},Gd),zm={childList:!0,characterData:!0,subtree:!0,attributes:!0,characterDataOldValue:!0},lo=T.ie&&T.ie_version<=11;class Fm{constructor(e){this.view=e,this.active=!1,this.editContext=null,this.selectionRange=new mg,this.selectionChanged=!1,this.delayedFlush=-1,this.resizeTimeout=-1,this.queue=[],this.delayedAndroidKey=null,this.flushingAndroidKey=-1,this.lastChange=0,this.scrollTargets=[],this.intersection=null,this.resizeScroll=null,this.intersecting=!1,this.gapIntersection=null,this.gaps=[],this.printQuery=null,this.parentCheck=-1,this.dom=e.contentDOM,this.observer=new MutationObserver(t=>{for(let s of t)this.queue.push(s);(T.ie&&T.ie_version<=11||T.ios&&e.composing)&&t.some(s=>s.type=="childList"&&s.removedNodes.length||s.type=="characterData"&&s.oldValue.length>s.target.nodeValue.length)?this.flushSoon():this.flush()}),window.EditContext&&T.android&&e.constructor.EDIT_CONTEXT!==!1&&!(T.chrome&&T.chrome_version<126)&&(this.editContext=new Wm(e),e.state.facet(Dt)&&(e.contentDOM.editContext=this.editContext.editContext)),lo&&(this.onCharData=t=>{this.queue.push({target:t.target,type:"characterData",oldValue:t.prevValue}),this.flushSoon()}),this.onSelectionChange=this.onSelectionChange.bind(this),this.onResize=this.onResize.bind(this),this.onPrint=this.onPrint.bind(this),this.onScroll=this.onScroll.bind(this),window.matchMedia&&(this.printQuery=window.matchMedia("print")),typeof ResizeObserver=="function"&&(this.resizeScroll=new ResizeObserver(()=>{var t;((t=this.view.docView)===null||t===void 0?void 0:t.lastUpdate)<Date.now()-75&&this.onResize()}),this.resizeScroll.observe(e.scrollDOM)),this.addWindowListeners(this.win=e.win),this.start(),typeof IntersectionObserver=="function"&&(this.intersection=new IntersectionObserver(t=>{this.parentCheck<0&&(this.parentCheck=setTimeout(this.listenForScroll.bind(this),1e3)),t.length>0&&t[t.length-1].intersectionRatio>0!=this.intersecting&&(this.intersecting=!this.intersecting,this.intersecting!=this.view.inView&&this.onScrollChanged(document.createEvent("Event")))},{threshold:[0,.001]}),this.intersection.observe(this.dom),this.gapIntersection=new IntersectionObserver(t=>{t.length>0&&t[t.length-1].intersectionRatio>0&&this.onScrollChanged(document.createEvent("Event"))},{})),this.listenForScroll(),this.readSelectionRange()}onScrollChanged(e){this.view.inputState.runHandlers("scroll",e),this.intersecting&&this.view.measure()}onScroll(e){this.intersecting&&this.flush(!1),this.editContext&&this.view.requestMeasure(this.editContext.measureReq),this.onScrollChanged(e)}onResize(){this.resizeTimeout<0&&(this.resizeTimeout=setTimeout(()=>{this.resizeTimeout=-1,this.view.requestMeasure()},50))}onPrint(e){(e.type=="change"||!e.type)&&!e.matches||(this.view.viewState.printing=!0,this.view.measure(),setTimeout(()=>{this.view.viewState.printing=!1,this.view.requestMeasure()},500))}updateGaps(e){if(this.gapIntersection&&(e.length!=this.gaps.length||this.gaps.some((t,s)=>t!=e[s]))){this.gapIntersection.disconnect();for(let t of e)this.gapIntersection.observe(t);this.gaps=e}}onSelectionChange(e){let t=this.selectionChanged;if(!this.readSelectionRange()||this.delayedAndroidKey)return;let{view:s}=this,n=this.selectionRange;if(s.state.facet(Dt)?s.root.activeElement!=this.dom:!Ps(this.dom,n))return;let r=n.anchorNode&&s.docView.tile.nearest(n.anchorNode);if(r&&r.isWidget()&&r.widget.ignoreEvent(e)){t||(this.selectionChanged=!1);return}(T.ie&&T.ie_version<=11||T.android&&T.chrome)&&!s.state.selection.main.empty&&n.focusNode&&Ms(n.focusNode,n.focusOffset,n.anchorNode,n.anchorOffset)?this.flushSoon():this.flush(!1)}readSelectionRange(){let{view:e}=this,t=qs(e.root);if(!t)return!1;let s=T.safari&&e.root.nodeType==11&&e.root.activeElement==this.dom&&Hm(this.view,t)||t;if(!s||this.selectionRange.eq(s))return!1;let n=Ps(this.dom,s);return n&&!this.selectionChanged&&e.inputState.lastFocusTime>Date.now()-200&&e.inputState.lastTouchTime<Date.now()-300&&yg(this.dom,s)?(this.view.inputState.lastFocusTime=0,e.docView.updateSelection(),!1):(this.selectionRange.setRange(s),n&&(this.selectionChanged=!0),!0)}setSelectionRange(e,t){this.selectionRange.set(e.node,e.offset,t.node,t.offset),this.selectionChanged=!1}clearSelectionRange(){this.selectionRange.set(null,0,null,0)}listenForScroll(){this.parentCheck=-1;let e=0,t=null;for(let s=this.dom;s;)if(s.nodeType==1)!t&&e<this.scrollTargets.length&&this.scrollTargets[e]==s?e++:t||(t=this.scrollTargets.slice(0,e)),t&&t.push(s),s=s.assignedSlot||s.parentNode;else if(s.nodeType==11)s=s.host;else break;if(e<this.scrollTargets.length&&!t&&(t=this.scrollTargets.slice(0,e)),t){for(let s of this.scrollTargets)s.removeEventListener("scroll",this.onScroll);for(let s of this.scrollTargets=t)s.addEventListener("scroll",this.onScroll)}}ignore(e){if(!this.active)return e();try{return this.stop(),e()}finally{this.start(),this.clear()}}start(){this.active||(this.observer.observe(this.dom,zm),lo&&this.dom.addEventListener("DOMCharacterDataModified",this.onCharData),this.active=!0)}stop(){this.active&&(this.active=!1,this.observer.disconnect(),lo&&this.dom.removeEventListener("DOMCharacterDataModified",this.onCharData))}clear(){this.processRecords(),this.queue.length=0,this.selectionChanged=!1}delayAndroidKey(e,t){var s;if(!this.delayedAndroidKey){let n=()=>{let r=this.delayedAndroidKey;r&&(this.clearDelayedAndroidKey(),this.view.inputState.lastKeyCode=r.keyCode,this.view.inputState.lastKeyTime=Date.now(),!this.flush()&&r.force&&Ji(this.dom,r.key,r.keyCode))};this.flushingAndroidKey=this.view.win.requestAnimationFrame(n)}(!this.delayedAndroidKey||e=="Enter")&&(this.delayedAndroidKey={key:e,keyCode:t,force:this.lastChange<Date.now()-50||!!(!((s=this.delayedAndroidKey)===null||s===void 0)&&s.force)})}clearDelayedAndroidKey(){this.win.cancelAnimationFrame(this.flushingAndroidKey),this.delayedAndroidKey=null,this.flushingAndroidKey=-1}flushSoon(){this.delayedFlush<0&&(this.delayedFlush=this.view.win.requestAnimationFrame(()=>{this.delayedFlush=-1,this.flush()}))}forceFlush(){this.delayedFlush>=0&&(this.view.win.cancelAnimationFrame(this.delayedFlush),this.delayedFlush=-1),this.flush()}pendingRecords(){for(let e of this.observer.takeRecords())this.queue.push(e);return this.queue}processRecords(){let e=this.pendingRecords();e.length&&(this.queue=[]);let t=-1,s=-1,n=!1;for(let r of e){let o=this.readMutation(r);o&&(o.typeOver&&(n=!0),t==-1?{from:t,to:s}=o:(t=Math.min(o.from,t),s=Math.max(o.to,s)))}return{from:t,to:s,typeOver:n}}readChange(){let{from:e,to:t,typeOver:s}=this.processRecords(),n=this.selectionChanged&&Ps(this.dom,this.selectionRange);if(e<0&&!n)return null;e>-1&&(this.lastChange=Date.now()),this.view.inputState.lastFocusTime=0,this.selectionChanged=!1;let r=new rm(this.view,e,t,s);return this.view.docView.domChanged={newSel:r.newSel?r.newSel.main:null},r}flush(e=!0){if(this.delayedFlush>=0||this.delayedAndroidKey)return!1;e&&this.readSelectionRange();let t=this.readChange();if(!t)return this.view.requestMeasure(),!1;let s=this.view.state,n=Nd(this.view,t);return this.view.state==s&&(t.domChanged||t.newSel&&!ar(this.view.state.selection,t.newSel.main))&&this.view.update([]),n}readMutation(e){let t=this.view.docView.tile.nearest(e.target);if(!t||t.isWidget())return null;if(t.markDirty(e.type=="attributes"),e.type=="childList"){let s=yh(t,e.previousSibling||e.target.previousSibling,-1),n=yh(t,e.nextSibling||e.target.nextSibling,1);return{from:s?t.posAfter(s):t.posAtStart,to:n?t.posBefore(n):t.posAtEnd,typeOver:!1}}else return e.type=="characterData"?{from:t.posAtStart,to:t.posAtEnd,typeOver:e.target.nodeValue==e.oldValue}:null}setWindow(e){e!=this.win&&(this.removeWindowListeners(this.win),this.win=e,this.addWindowListeners(this.win))}addWindowListeners(e){e.addEventListener("resize",this.onResize),this.printQuery?this.printQuery.addEventListener?this.printQuery.addEventListener("change",this.onPrint):this.printQuery.addListener(this.onPrint):e.addEventListener("beforeprint",this.onPrint),e.addEventListener("scroll",this.onScroll),e.document.addEventListener("selectionchange",this.onSelectionChange)}removeWindowListeners(e){e.removeEventListener("scroll",this.onScroll),e.removeEventListener("resize",this.onResize),this.printQuery?this.printQuery.removeEventListener?this.printQuery.removeEventListener("change",this.onPrint):this.printQuery.removeListener(this.onPrint):e.removeEventListener("beforeprint",this.onPrint),e.document.removeEventListener("selectionchange",this.onSelectionChange)}update(e){this.editContext&&(this.editContext.update(e),e.startState.facet(Dt)!=e.state.facet(Dt)&&(e.view.contentDOM.editContext=e.state.facet(Dt)?this.editContext.editContext:null))}destroy(){var e,t,s;this.stop(),(e=this.intersection)===null||e===void 0||e.disconnect(),(t=this.gapIntersection)===null||t===void 0||t.disconnect(),(s=this.resizeScroll)===null||s===void 0||s.disconnect();for(let n of this.scrollTargets)n.removeEventListener("scroll",this.onScroll);this.removeWindowListeners(this.win),clearTimeout(this.parentCheck),clearTimeout(this.resizeTimeout),this.win.cancelAnimationFrame(this.delayedFlush),this.win.cancelAnimationFrame(this.flushingAndroidKey),this.editContext&&(this.view.contentDOM.editContext=null,this.editContext.destroy())}}function yh(i,e,t){for(;e;){let s=oe.get(e);if(s&&s.parent==i)return s;let n=e.parentNode;e=n!=i.dom?n:t>0?e.nextSibling:e.previousSibling}return null}function xh(i,e){let t=e.startContainer,s=e.startOffset,n=e.endContainer,r=e.endOffset,o=i.docView.domAtPos(i.state.selection.main.anchor,1);return Ms(o.node,o.offset,n,r)&&([t,s,n,r]=[n,r,t,s]),{anchorNode:t,anchorOffset:s,focusNode:n,focusOffset:r}}function Hm(i,e){if(e.getComposedRanges){let n=e.getComposedRanges(i.root)[0];if(n)return xh(i,n)}let t=null;function s(n){n.preventDefault(),n.stopImmediatePropagation(),t=n.getTargetRanges()[0]}return i.contentDOM.addEventListener("beforeinput",s,!0),i.dom.ownerDocument.execCommand("indent"),i.contentDOM.removeEventListener("beforeinput",s,!0),t?xh(i,t):null}class Wm{constructor(e){this.from=0,this.to=0,this.pendingContextChange=null,this.handlers=Object.create(null),this.composing=null,this.resetRange(e.state);let t=this.editContext=new window.EditContext({text:e.state.doc.sliceString(this.from,this.to),selectionStart:this.toContextPos(Math.max(this.from,Math.min(this.to,e.state.selection.main.anchor))),selectionEnd:this.toContextPos(e.state.selection.main.head)});this.handlers.textupdate=s=>{let n=e.state.selection.main,{anchor:r,head:o}=n,a=this.toEditorPos(s.updateRangeStart),l=this.toEditorPos(s.updateRangeEnd);e.inputState.composing>=0&&!this.composing&&(this.composing={contextBase:s.updateRangeStart,editorBase:a,drifted:!1});let h=l-a>s.text.length;a==this.from&&r<this.from?a=r:l==this.to&&r>this.to&&(l=r);let c=zd(e.state.sliceDoc(a,l),s.text,(h?n.from:n.to)-a,h?"end":null);if(!c){let f=k.single(this.toEditorPos(s.selectionStart),this.toEditorPos(s.selectionEnd));ar(f,n)||e.dispatch({selection:f,userEvent:"select"});return}let d={from:c.from+a,to:c.toA+a,insert:V.of(s.text.slice(c.from,c.toB).split(`
`))};if((T.mac||T.android)&&d.from==o-1&&/^\. ?$/.test(s.text)&&e.contentDOM.getAttribute("autocorrect")=="off"&&(d={from:a,to:l,insert:V.of([s.text.replace("."," ")])}),this.pendingContextChange=d,!e.state.readOnly){let f=this.to-this.from+(d.to-d.from+d.insert.length);Ja(e,d,k.single(this.toEditorPos(s.selectionStart,f),this.toEditorPos(s.selectionEnd,f)))}this.pendingContextChange&&(this.revertPending(e.state),this.setSelection(e.state)),d.from<d.to&&!d.insert.length&&e.inputState.composing>=0&&!/[\\p{Alphabetic}\\p{Number}_]/.test(t.text.slice(Math.max(0,s.updateRangeStart-1),Math.min(t.text.length,s.updateRangeStart+1)))&&this.handlers.compositionend(s)},this.handlers.characterboundsupdate=s=>{let n=[],r=null;for(let o=this.toEditorPos(s.rangeStart),a=this.toEditorPos(s.rangeEnd);o<a;o++){let l=e.coordsForChar(o);r=l&&new DOMRect(l.left,l.top,l.right-l.left,l.bottom-l.top)||r||new DOMRect,n.push(r)}t.updateCharacterBounds(s.rangeStart,n)},this.handlers.textformatupdate=s=>{let n=[];for(let r of s.getTextFormats()){let o=r.underlineStyle,a=r.underlineThickness;if(!/none/i.test(o)&&!/none/i.test(a)){let l=this.toEditorPos(r.rangeStart),h=this.toEditorPos(r.rangeEnd);if(l<h){let c=`text-decoration: underline ${/^[a-z]/.test(o)?o+" ":o=="Dashed"?"dashed ":o=="Squiggle"?"wavy ":""}${/thin/i.test(a)?1:2}px`;n.push(L.mark({attributes:{style:c}}).range(l,h))}}}e.dispatch({effects:Md.of(L.set(n))})},this.handlers.compositionstart=()=>{e.inputState.composing<0&&(e.inputState.composing=0,e.inputState.compositionFirstChange=!0)},this.handlers.compositionend=()=>{if(e.inputState.composing=-1,e.inputState.compositionFirstChange=null,this.composing){let{drifted:s}=this.composing;this.composing=null,s&&this.reset(e.state)}};for(let s in this.handlers)t.addEventListener(s,this.handlers[s]);this.measureReq={read:s=>{this.editContext.updateControlBounds(s.contentDOM.getBoundingClientRect());let n=qs(s.root);n&&n.rangeCount&&this.editContext.updateSelectionBounds(n.getRangeAt(0).getBoundingClientRect())}}}applyEdits(e){let t=0,s=!1,n=this.pendingContextChange;return e.changes.iterChanges((r,o,a,l,h)=>{if(s)return;let c=h.length-(o-r);if(n&&o>=n.to)if(n.from==r&&n.to==o&&n.insert.eq(h)){n=this.pendingContextChange=null,t+=c,this.to+=c;return}else n=null,this.revertPending(e.state);if(r+=t,o+=t,o<=this.from)this.from+=c,this.to+=c;else if(r<this.to){if(r<this.from||o>this.to||this.to-this.from+h.length>3e4){s=!0;return}this.editContext.updateText(this.toContextPos(r),this.toContextPos(o),h.toString()),this.to+=c}t+=c}),n&&!s&&this.revertPending(e.state),!s}update(e){let t=this.pendingContextChange,s=e.startState.selection.main;this.composing&&(this.composing.drifted||!e.changes.touchesRange(s.from,s.to)&&e.transactions.some(n=>!n.isUserEvent("input.type")&&n.changes.touchesRange(this.from,this.to)))?(this.composing.drifted=!0,this.composing.editorBase=e.changes.mapPos(this.composing.editorBase)):!this.applyEdits(e)||!this.rangeIsValid(e.state)?(this.pendingContextChange=null,this.reset(e.state)):(e.docChanged||e.selectionSet||t)&&this.setSelection(e.state),(e.geometryChanged||e.docChanged||e.selectionSet)&&e.view.requestMeasure(this.measureReq)}resetRange(e){let{head:t}=e.selection.main;this.from=Math.max(0,t-1e4),this.to=Math.min(e.doc.length,t+1e4)}reset(e){this.resetRange(e),this.editContext.updateText(0,this.editContext.text.length,e.doc.sliceString(this.from,this.to)),this.setSelection(e)}revertPending(e){let t=this.pendingContextChange;this.pendingContextChange=null,this.editContext.updateText(this.toContextPos(t.from),this.toContextPos(t.from+t.insert.length),e.doc.sliceString(t.from,t.to))}setSelection(e){let{main:t}=e.selection,s=this.toContextPos(Math.max(this.from,Math.min(this.to,t.anchor))),n=this.toContextPos(t.head);(this.editContext.selectionStart!=s||this.editContext.selectionEnd!=n)&&this.editContext.updateSelection(s,n)}rangeIsValid(e){let{head:t}=e.selection.main;return!(this.from>0&&t-this.from<500||this.to<e.doc.length&&this.to-t<500||this.to-this.from>1e4*3)}toEditorPos(e,t=this.to-this.from){e=Math.min(e,t);let s=this.composing;return s&&s.drifted?s.editorBase+(e-s.contextBase):e+this.from}toContextPos(e){let t=this.composing;return t&&t.drifted?t.contextBase+(e-t.editorBase):e-this.from}destroy(){for(let e in this.handlers)this.editContext.removeEventListener(e,this.handlers[e])}}class E{get state(){return this.viewState.state}get viewport(){return this.viewState.viewport}get visibleRanges(){return this.viewState.visibleRanges}get inView(){return this.viewState.inView}get composing(){return!!this.inputState&&this.inputState.composing>0}get compositionStarted(){return!!this.inputState&&this.inputState.composing>=0}get root(){return this._root}get win(){return this.dom.ownerDocument.defaultView||window}constructor(e={}){var t;this.plugins=[],this.pluginMap=new Map,this.editorAttrs={},this.contentAttrs={},this.bidiCache=[],this.destroyed=!1,this.updateState=2,this.measureScheduled=-1,this.measureRequests=[],this.contentDOM=document.createElement("div"),this.scrollDOM=document.createElement("div"),this.scrollDOM.tabIndex=-1,this.scrollDOM.className="cm-scroller",this.scrollDOM.appendChild(this.contentDOM),this.announceDOM=document.createElement("div"),this.announceDOM.className="cm-announced",this.announceDOM.setAttribute("aria-live","polite"),this.dom=document.createElement("div"),this.dom.appendChild(this.announceDOM),this.dom.appendChild(this.scrollDOM),e.parent&&e.parent.appendChild(this.dom);let{dispatch:s}=e;this.dispatchTransactions=e.dispatchTransactions||s&&(n=>n.forEach(r=>s(r,this)))||(n=>this.update(n)),this.dispatch=this.dispatch.bind(this),this._root=e.root||bg(e.parent)||document,this.viewState=new gh(this,e.state||q.create(e)),e.scrollTo&&e.scrollTo.is(xn)&&(this.viewState.scrollTarget=e.scrollTo.value.clip(this.viewState.state)),this.plugins=this.state.facet(qi).map(n=>new io(n));for(let n of this.plugins)n.update(this);this.observer=new Fm(this),this.inputState=new hm(this),this.inputState.ensureHandlers(this.plugins),this.docView=new ih(this),this.mountStyles(),this.updateAttrs(),this.updateState=0,this.requestMeasure(),!((t=document.fonts)===null||t===void 0)&&t.ready&&document.fonts.ready.then(()=>{this.viewState.mustMeasureContent="refresh",this.requestMeasure()})}dispatch(...e){let t=e.length==1&&e[0]instanceof pe?e:e.length==1&&Array.isArray(e[0])?e[0]:[this.state.update(...e)];this.dispatchTransactions(t,this)}update(e){if(this.updateState!=0)throw new Error("Calls to EditorView.update are not allowed while an update is in progress");let t=!1,s=!1,n,r=this.state;for(let f of e){if(f.startState!=r)throw new RangeError("Trying to update state with a transaction that doesn't start from the previous state.");r=f.state}if(this.destroyed){this.viewState.state=r;return}let o=this.hasFocus,a=0,l=null;e.some(f=>f.annotation(Vd))?(this.inputState.notifiedFocused=o,a=1):o!=this.inputState.notifiedFocused&&(this.inputState.notifiedFocused=o,l=Ud(r,o),l||(a=1));let h=this.observer.delayedAndroidKey,c=null;if(h?(this.observer.clearDelayedAndroidKey(),c=this.observer.readChange(),(c&&!this.state.doc.eq(r.doc)||!this.state.selection.eq(r.selection))&&(c=null)):this.observer.clear(),r.facet(q.phrases)!=this.state.facet(q.phrases))return this.setState(r);n=nr.create(this,r,e),n.flags|=a;let d=this.viewState.scrollTarget;try{this.updateState=2;for(let f of e){if(d&&(d=d.map(f.changes)),f.scrollIntoView){let{main:u}=f.state.selection,{x:p,y:m}=this.state.facet(E.cursorScrollMargin);d=new Ki(u.empty?u:k.cursor(u.head,u.head>u.anchor?-1:1),"nearest","nearest",m,p)}for(let u of f.effects)u.is(xn)&&(d=u.value.clip(this.state))}this.viewState.update(n,d),this.bidiCache=hr.update(this.bidiCache,n.changes),n.empty||(this.updatePlugins(n),this.inputState.update(n)),t=this.docView.update(n),this.state.facet(ws)!=this.styleModules&&this.mountStyles(),s=this.updateAttrs(),this.showAnnouncements(e),this.docView.updateSelection(t,e.some(f=>f.isUserEvent("select.pointer")))}finally{this.updateState=0}if(n.startState.facet(On)!=n.state.facet(On)&&(this.viewState.mustMeasureContent=!0),(t||s||d||this.viewState.mustEnforceCursorAssoc||this.viewState.mustMeasureContent)&&this.requestMeasure(),t&&this.docViewUpdate(),!n.empty)for(let f of this.state.facet(ta))try{f(n)}catch(u){Ie(this.state,u,"update listener")}(l||c)&&Promise.resolve().then(()=>{l&&this.state==l.startState&&this.dispatch(l),c&&!Nd(this,c)&&h.force&&Ji(this.contentDOM,h.key,h.keyCode)})}setState(e){if(this.updateState!=0)throw new Error("Calls to EditorView.setState are not allowed while an update is in progress");if(this.destroyed){this.viewState.state=e;return}this.updateState=2;let t=this.hasFocus;try{for(let s of this.plugins)s.destroy(this);this.viewState=new gh(this,e),this.plugins=e.facet(qi).map(s=>new io(s)),this.pluginMap.clear();for(let s of this.plugins)s.update(this);this.docView.destroy(),this.docView=new ih(this),this.inputState.ensureHandlers(this.plugins),this.mountStyles(),this.updateAttrs(),this.bidiCache=[]}finally{this.updateState=0}t&&this.focus(),this.requestMeasure()}updatePlugins(e){let t=e.startState.facet(qi),s=e.state.facet(qi);if(t!=s){let n=[];for(let r of s){let o=t.indexOf(r);if(o<0)n.push(new io(r));else{let a=this.plugins[o];a.mustUpdate=e,n.push(a)}}for(let r of this.plugins)r.mustUpdate!=e&&r.destroy(this);this.plugins=n,this.pluginMap.clear()}else for(let n of this.plugins)n.mustUpdate=e;for(let n=0;n<this.plugins.length;n++)this.plugins[n].update(this);t!=s&&this.inputState.ensureHandlers(this.plugins)}docViewUpdate(){for(let e of this.plugins){let t=e.value;if(t&&t.docViewUpdate)try{t.docViewUpdate(this)}catch(s){Ie(this.state,s,"doc view update listener")}}}measure(e=!0){if(this.destroyed)return;if(this.measureScheduled>-1&&this.win.cancelAnimationFrame(this.measureScheduled),this.observer.delayedAndroidKey){this.measureScheduled=-1,this.requestMeasure();return}this.measureScheduled=0,e&&this.observer.forceFlush();let t=null,s=this.viewState.scrollParent,n=this.viewState.getScrollOffset(),{scrollAnchorPos:r,scrollAnchorHeight:o}=this.viewState;Math.abs(n-this.viewState.scrollOffset)>1&&(o=-1),this.viewState.scrollAnchorHeight=-1;try{for(let a=0;;a++){if(o<0)if(fd(s||this.win))r=-1,o=this.viewState.heightMap.height;else{let u=this.viewState.scrollAnchorAt(n);r=u.from,o=u.top}this.updateState=1;let l=this.viewState.measure();if(!l&&!this.measureRequests.length&&this.viewState.scrollTarget==null)break;if(a>5){console.warn(this.measureRequests.length?"Measure loop restarted more than 5 times":"Viewport failed to stabilize");break}let h=[];l&4||([this.measureRequests,h]=[h,this.measureRequests]);let c=h.map(u=>{try{return u.read(this)}catch(p){return Ie(this.state,p),vh}}),d=nr.create(this,this.state,[]),f=!1;d.flags|=l,t?t.flags|=l:t=d,this.updateState=2,d.empty||(this.updatePlugins(d),this.inputState.update(d),this.updateAttrs(),f=this.docView.update(d),f&&this.docViewUpdate());for(let u=0;u<h.length;u++)if(c[u]!=vh)try{let p=h[u];p.write&&p.write(c[u],this)}catch(p){Ie(this.state,p)}if(f&&this.docView.updateSelection(!0),!d.viewportChanged&&this.measureRequests.length==0){if(this.viewState.editorHeight)if(this.viewState.scrollTarget){this.docView.scrollIntoView(this.viewState.scrollTarget),this.viewState.scrollTarget=null,o=-1;continue}else{let p=((r<0?this.viewState.heightMap.height:this.viewState.lineBlockAt(r).top)-o)/this.scaleY;if((p>1||p<-1)&&(s==this.scrollDOM||this.hasFocus||Math.max(this.inputState.lastWheelEvent,this.inputState.lastTouchTime)>Date.now()-100)){n=n+p,s?s.scrollTop+=p:this.win.scrollBy(0,p),o=-1;continue}}break}}}finally{this.updateState=0,this.measureScheduled=-1}if(t&&!t.empty)for(let a of this.state.facet(ta))a(t)}get themeClasses(){return aa+" "+(this.state.facet(oa)?Kd:Jd)+" "+this.state.facet(On)}updateAttrs(){let e=wh(this,Td,{class:"cm-editor"+(this.hasFocus?" cm-focused ":" ")+this.themeClasses}),t={spellcheck:"false",autocorrect:"off",autocapitalize:"off",writingsuggestions:"false",translate:"no",contenteditable:this.state.facet(Dt)?"true":"false",class:"cm-content",style:`${T.tabSize}: ${this.state.tabSize}`,role:"textbox","aria-multiline":"true"};this.state.readOnly&&(t["aria-readonly"]="true"),wh(this,Ua,t);let s=this.observer.ignore(()=>{let n=Kl(this.contentDOM,this.contentAttrs,t),r=Kl(this.dom,this.editorAttrs,e);return n||r});return this.editorAttrs=e,this.contentAttrs=t,s}showAnnouncements(e){let t=!0;for(let s of e)for(let n of s.effects)if(n.is(E.announce)){t&&(this.announceDOM.textContent=""),t=!1;let r=this.announceDOM.appendChild(document.createElement("div"));r.textContent=n.value}}mountStyles(){this.styleModules=this.state.facet(ws);let e=this.state.facet(E.cspNonce);Gt.mount(this.root,this.styleModules.concat(Nm).reverse(),e?{nonce:e}:void 0)}readMeasured(){if(this.updateState==2)throw new Error("Reading the editor layout isn't allowed during an update");this.updateState==0&&this.measureScheduled>-1&&this.measure(!1)}requestMeasure(e){if(this.measureScheduled<0&&(this.measureScheduled=this.win.requestAnimationFrame(()=>this.measure())),e){if(this.measureRequests.indexOf(e)>-1)return;if(e.key!=null){for(let t=0;t<this.measureRequests.length;t++)if(this.measureRequests[t].key===e.key){this.measureRequests[t]=e;return}}this.measureRequests.push(e)}}plugin(e){let t=this.pluginMap.get(e);return(t===void 0||t&&t.plugin!=e)&&this.pluginMap.set(e,t=this.plugins.find(s=>s.plugin==e)||null),t&&t.update(this).value}get documentTop(){return this.contentDOM.getBoundingClientRect().top+this.viewState.paddingTop}get documentPadding(){return{top:this.viewState.paddingTop,bottom:this.viewState.paddingBottom}}get scaleX(){return this.viewState.scaleX}get scaleY(){return this.viewState.scaleY}elementAtHeight(e){return this.readMeasured(),this.viewState.elementAtHeight(e)}lineBlockAtHeight(e){return this.readMeasured(),this.viewState.lineBlockAtHeight(e)}get viewportLineBlocks(){return this.viewState.viewportLines}lineBlockAt(e){return this.viewState.lineBlockAt(e)}get contentHeight(){return this.viewState.contentHeight}moveByChar(e,t,s){return oo(this,e,sh(this,e,t,s))}moveByGroup(e,t){return oo(this,e,sh(this,e,t,s=>Zg(this,e.head,s)))}visualLineSide(e,t){let s=this.bidiSpans(e),n=this.textDirectionAt(e.from),r=s[t?s.length-1:0];return k.cursor(r.side(t,n)+e.from,r.forward(!t,n)?1:-1)}moveToLineBoundary(e,t,s=!0){return Yg(this,e,t,s)}moveVertically(e,t,s){return oo(this,e,em(this,e,t,s))}domAtPos(e,t=1){return this.docView.domAtPos(e,t)}posAtDOM(e,t=0){return this.docView.posFromDOM(e,t)}posAtCoords(e,t=!0){this.readMeasured();let s=na(this,e,t);return s&&s.pos}posAndSideAtCoords(e,t=!0){return this.readMeasured(),na(this,e,t)}coordsAtPos(e,t=1){this.readMeasured();let s=this.docView.coordsAt(e,t);if(!s||s.left==s.right)return s;let n=this.state.doc.lineAt(e),r=this.bidiSpans(n),o=r[vt.find(r,e-n.from,-1,t)];return sr(s,o.dir==G.LTR==t>0)}coordsForChar(e){return this.readMeasured(),this.docView.coordsForChar(e)}get defaultCharacterWidth(){return this.viewState.heightOracle.charWidth}get defaultLineHeight(){return this.viewState.heightOracle.lineHeight}get textDirection(){return this.viewState.defaultTextDirection}textDirectionAt(e){return!this.state.facet(Ad)||e<this.viewport.from||e>this.viewport.to?this.textDirection:(this.readMeasured(),this.docView.textDirectionAt(e))}get lineWrapping(){return this.viewState.heightOracle.lineWrapping}bidiSpans(e){if(e.length>qm)return yd(e.length);let t=this.textDirectionAt(e.from),s;for(let r of this.bidiCache)if(r.from==e.from&&r.dir==t&&(r.fresh||bd(r.isolates,s=Zl(this,e))))return r.order;s||(s=Zl(this,e));let n=Og(e.text,t,s);return this.bidiCache.push(new hr(e.from,e.to,t,s,!0,n)),n}get hasFocus(){var e;return(this.dom.ownerDocument.hasFocus()||T.safari&&((e=this.inputState)===null||e===void 0?void 0:e.lastContextMenu)>Date.now()-3e4)&&this.root.activeElement==this.contentDOM}focus(){this.observer.ignore(()=>{dd(this.contentDOM),this.docView.updateSelection()})}setRoot(e){this._root!=e&&(this._root=e,this.observer.setWindow((e.nodeType==9?e:e.ownerDocument).defaultView||window),this.mountStyles())}destroy(){this.root.activeElement==this.contentDOM&&this.contentDOM.blur();for(let e of this.plugins)e.destroy(this);this.plugins=[],this.inputState.destroy(),this.docView.destroy(),this.dom.remove(),this.observer.destroy(),this.measureScheduled>-1&&this.win.cancelAnimationFrame(this.measureScheduled),this.destroyed=!0}static scrollIntoView(e,t={}){var s,n,r,o;return xn.of(new Ki(typeof e=="number"?k.cursor(e):e,(s=t.y)!==null&&s!==void 0?s:"nearest",(n=t.x)!==null&&n!==void 0?n:"nearest",(r=t.yMargin)!==null&&r!==void 0?r:5,(o=t.xMargin)!==null&&o!==void 0?o:5))}scrollSnapshot(){let{scrollTop:e,scrollLeft:t}=this.scrollDOM,s=this.viewState.scrollAnchorAt(e);return xn.of(new Ki(k.cursor(s.from),"start","start",s.top-e,t,!0))}setTabFocusMode(e){e==null?this.inputState.tabFocusMode=this.inputState.tabFocusMode<0?0:-1:typeof e=="boolean"?this.inputState.tabFocusMode=e?0:-1:this.inputState.tabFocusMode!=0&&(this.inputState.tabFocusMode=Date.now()+e)}static domEventHandlers(e){return de.define(()=>({}),{eventHandlers:e})}static domEventObservers(e){return de.define(()=>({}),{eventObservers:e})}static theme(e,t){let s=Gt.newName(),n=[On.of(s),ws.of(la(`.${s}`,e))];return t&&t.dark&&n.push(oa.of(!0)),n}static baseTheme(e){return _i.lowest(ws.of(la("."+aa,e,Gd)))}static findFromDOM(e){var t;let s=e.querySelector(".cm-content"),n=s&&oe.get(s)||oe.get(e);return((t=n==null?void 0:n.root)===null||t===void 0?void 0:t.view)||null}}E.styleModule=ws;E.inputHandler=Cd;E.clipboardInputFilter=Qa;E.clipboardOutputFilter=Va;E.scrollHandler=Pd;E.focusChangeEffect=Od;E.perLineTextDirection=Ad;E.exceptionSink=Sd;E.updateListener=ta;E.editable=Dt;E.mouseSelectionStyle=kd;E.dragMovesSelection=wd;E.clickAddsSelectionRange=vd;E.decorations=Er;E.blockWrappers=Dd;E.outerDecorations=ja;E.atomicRanges=ln;E.bidiIsolatedRanges=Ed;E.cursorScrollMargin=D.define({combine:i=>{let e=5,t=5;for(let s of i)typeof s=="number"?e=t=s:{x:e,y:t}=s;return{x:e,y:t}}});E.scrollMargins=Rd;E.darkTheme=oa;E.cspNonce=D.define({combine:i=>i.length?i[0]:""});E.contentAttributes=Ua;E.editorAttributes=Td;E.lineWrapping=E.contentAttributes.of({class:"cm-lineWrapping"});E.announce=N.define();const qm=4096,vh={};class hr{constructor(e,t,s,n,r,o){this.from=e,this.to=t,this.dir=s,this.isolates=n,this.fresh=r,this.order=o}static update(e,t){if(t.empty&&!e.some(r=>r.fresh))return e;let s=[],n=e.length?e[e.length-1].dir:G.LTR;for(let r=Math.max(0,e.length-10);r<e.length;r++){let o=e[r];o.dir==n&&!t.touchesRange(o.from,o.to)&&s.push(new hr(t.mapPos(o.from,1),t.mapPos(o.to,-1),o.dir,o.isolates,!1,o.order))}return s}}function wh(i,e,t){for(let s=i.state.facet(e),n=s.length-1;n>=0;n--){let r=s[n],o=typeof r=="function"?r(i):r;o&&Ha(o,t)}return t}const Qm=T.mac?"mac":T.windows?"win":T.linux?"linux":"key";function Vm(i,e){const t=i.split(/-(?!$)/);let s=t[t.length-1];s=="Space"&&(s=" ");let n,r,o,a;for(let l=0;l<t.length-1;++l){const h=t[l];if(/^(cmd|meta|m)$/i.test(h))a=!0;else if(/^a(lt)?$/i.test(h))n=!0;else if(/^(c|ctrl|control)$/i.test(h))r=!0;else if(/^s(hift)?$/i.test(h))o=!0;else if(/^mod$/i.test(h))e=="mac"?a=!0:r=!0;else throw new Error("Unrecognized modifier name: "+h)}return n&&(s="Alt-"+s),r&&(s="Ctrl-"+s),a&&(s="Meta-"+s),o&&(s="Shift-"+s),s}function An(i,e,t){return e.altKey&&(i="Alt-"+i),e.ctrlKey&&(i="Ctrl-"+i),e.metaKey&&(i="Meta-"+i),t!==!1&&e.shiftKey&&(i="Shift-"+i),i}const Um=_i.default(E.domEventHandlers({keydown(i,e){return Zd(Yd(e.state),i,e,"editor")}})),Ya=D.define({enables:Um}),kh=new WeakMap;function Yd(i){let e=i.facet(Ya),t=kh.get(e);return t||kh.set(e,t=Jm(e.reduce((s,n)=>s.concat(n),[]))),t}function jm(i,e,t){return Zd(Yd(i.state),e,i,t)}let Vt=null;const Xm=4e3;function Jm(i,e=Qm){let t=Object.create(null),s=Object.create(null),n=(o,a)=>{let l=s[o];if(l==null)s[o]=a;else if(l!=a)throw new Error("Key binding "+o+" is used both as a regular binding and as a multi-stroke prefix")},r=(o,a,l,h,c)=>{var d,f;let u=t[o]||(t[o]=Object.create(null)),p=a.split(/ (?!$)/).map(x=>Vm(x,e));for(let x=1;x<p.length;x++){let S=p.slice(0,x).join(" ");n(S,!0),u[S]||(u[S]={preventDefault:!0,stopPropagation:!1,run:[C=>{let R=Vt={view:C,prefix:S,scope:o};return setTimeout(()=>{Vt==R&&(Vt=null)},Xm),!0}]})}let m=p.join(" ");n(m,!1);let b=u[m]||(u[m]={preventDefault:!1,stopPropagation:!1,run:((f=(d=u._any)===null||d===void 0?void 0:d.run)===null||f===void 0?void 0:f.slice())||[]});l&&b.run.push(l),h&&(b.preventDefault=!0),c&&(b.stopPropagation=!0)};for(let o of i){let a=o.scope?o.scope.split(" "):["editor"];if(o.any)for(let h of a){let c=t[h]||(t[h]=Object.create(null));c._any||(c._any={preventDefault:!1,stopPropagation:!1,run:[]});let{any:d}=o;for(let f in c)c[f].run.push(u=>d(u,ha))}let l=o[e]||o.key;if(l)for(let h of a)r(h,l,o.run,o.preventDefault,o.stopPropagation),o.shift&&r(h,"Shift-"+l,o.shift,o.preventDefault,o.stopPropagation)}return t}let ha=null;function Zd(i,e,t,s){ha=e;let n=cg(e),r=Be(n,0),o=yt(r)==n.length&&n!=" ",a="",l=!1,h=!1,c=!1;Vt&&Vt.view==t&&Vt.scope==s&&(a=Vt.prefix+" ",Hd.indexOf(e.keyCode)<0&&(h=!0,Vt=null));let d=new Set,f=b=>{if(b){for(let x of b.run)if(!d.has(x)&&(d.add(x),x(t)))return b.stopPropagation&&(c=!0),!0;b.preventDefault&&(b.stopPropagation&&(c=!0),h=!0)}return!1},u=i[s],p,m;return u&&(f(u[a+An(n,e,!o)])?l=!0:o&&(e.altKey||e.metaKey||e.ctrlKey)&&!(T.windows&&e.ctrlKey&&e.altKey)&&!(T.mac&&e.altKey&&!(e.ctrlKey||e.metaKey))&&(p=Yt[e.keyCode])&&p!=n?(f(u[a+An(p,e,!0)])||e.shiftKey&&(m=Hs[e.keyCode])!=n&&m!=p&&f(u[a+An(m,e,!1)]))&&(l=!0):o&&e.shiftKey&&f(u[a+An(n,e,!0)])&&(l=!0),!l&&f(u._any)&&(l=!0)),h&&(l=!0),l&&c&&e.stopPropagation(),ha=null,l}class Si{constructor(e,t,s,n,r){this.className=e,this.left=t,this.top=s,this.width=n,this.height=r}draw(){let e=document.createElement("div");return e.className=this.className,this.adjust(e),e}update(e,t){return t.className!=this.className?!1:(this.adjust(e),!0)}adjust(e){e.style.left=this.left+"px",e.style.top=this.top+"px",this.width!=null&&(e.style.width=this.width+"px"),e.style.height=this.height+"px"}eq(e){return this.left==e.left&&this.top==e.top&&this.width==e.width&&this.height==e.height&&this.className==e.className}static forRange(e,t,s){if(s.empty){let n=e.coordsAtPos(s.head,s.assoc||1);if(!n)return[];let r=ef(e);return[new Si(t,n.left-r.left,n.top-r.top,null,n.bottom-n.top)]}else return Km(e,t,s)}}function ef(i){let e=i.scrollDOM.getBoundingClientRect();return{left:(i.textDirection==G.LTR?e.left:e.right-i.scrollDOM.clientWidth*i.scaleX)-i.scrollDOM.scrollLeft*i.scaleX,top:e.top-i.scrollDOM.scrollTop*i.scaleY}}function Sh(i,e,t,s){let n=i.coordsAtPos(e,t*2);if(!n)return s;let r=i.dom.getBoundingClientRect(),o=(n.top+n.bottom)/2,a=i.posAtCoords({x:r.left+1,y:o}),l=i.posAtCoords({x:r.right-1,y:o});return a==null||l==null?s:{from:Math.max(s.from,Math.min(a,l)),to:Math.min(s.to,Math.max(a,l))}}function Km(i,e,t){if(t.to<=i.viewport.from||t.from>=i.viewport.to)return[];let s=Math.max(t.from,i.viewport.from),n=Math.min(t.to,i.viewport.to),r=i.textDirection==G.LTR,o=i.contentDOM,a=o.getBoundingClientRect(),l=ef(i),h=o.querySelector(".cm-line"),c=h&&window.getComputedStyle(h),d=a.left+(c?parseInt(c.paddingLeft)+Math.min(0,parseInt(c.textIndent)):0),f=a.right-(c?parseInt(c.paddingRight):0),u=sa(i,s,1),p=sa(i,n,-1),m=u.type==Ce.Text?u:null,b=p.type==Ce.Text?p:null;if(m&&(i.lineWrapping||u.widgetLineBreaks)&&(m=Sh(i,s,1,m)),b&&(i.lineWrapping||p.widgetLineBreaks)&&(b=Sh(i,n,-1,b)),m&&b&&m.from==b.from&&m.to==b.to)return S(C(t.from,t.to,m));{let A=m?C(t.from,null,m):R(u,!1),$=b?C(null,t.to,b):R(p,!0),P=[];return(m||u).to<(b||p).from-(m&&b?1:0)||u.widgetLineBreaks>1&&A.bottom+i.defaultLineHeight/2<$.top?P.push(x(d,A.bottom,f,$.top)):A.bottom<$.top&&i.elementAtHeight((A.bottom+$.top)/2).type==Ce.Text&&(A.bottom=$.top=(A.bottom+$.top)/2),S(A).concat(P).concat(S($))}function x(A,$,P,I){return new Si(e,A-l.left,$-l.top,Math.max(0,P-A),I-$)}function S({top:A,bottom:$,horizontal:P}){let I=[];for(let W=0;W<P.length;W+=2)I.push(x(P[W],A,P[W+1],$));return I}function C(A,$,P){let I=1e9,W=-1e9,J=[];function F(U,Z,Te,He,dt){let we=i.coordsAtPos(U,U==P.to?-2:2),Xe=i.coordsAtPos(Te,Te==P.from?2:-2);!we||!Xe||(I=Math.min(we.top,Xe.top,I),W=Math.max(we.bottom,Xe.bottom,W),dt==G.LTR?J.push(r&&Z?d:we.left,r&&He?f:Xe.right):J.push(!r&&He?d:Xe.left,!r&&Z?f:we.right))}let _=A??P.from,j=$??P.to;for(let U of i.visibleRanges)if(U.to>_&&U.from<j)for(let Z=Math.max(U.from,_),Te=Math.min(U.to,j);;){let He=i.state.doc.lineAt(Z);for(let dt of i.bidiSpans(He)){let we=dt.from+He.from,Xe=dt.to+He.from;if(we>=Te)break;Xe>Z&&F(Math.max(we,Z),A==null&&we<=_,Math.min(Xe,Te),$==null&&Xe>=j,dt.dir)}if(Z=He.to+1,Z>=Te)break}return J.length==0&&F(_,A==null,j,$==null,i.textDirection),{top:I,bottom:W,horizontal:J}}function R(A,$){let P=a.top+($?A.top:A.bottom);return{top:P,bottom:P,horizontal:[]}}}function Gm(i,e){return i.constructor==e.constructor&&i.eq(e)}class Ym{constructor(e,t){this.view=e,this.layer=t,this.drawn=[],this.scaleX=1,this.scaleY=1,this.measureReq={read:this.measure.bind(this),write:this.draw.bind(this)},this.dom=e.scrollDOM.appendChild(document.createElement("div")),this.dom.classList.add("cm-layer"),t.above&&this.dom.classList.add("cm-layer-above"),t.class&&this.dom.classList.add(t.class),this.scale(),this.dom.setAttribute("aria-hidden","true"),this.setOrder(e.state),e.requestMeasure(this.measureReq),t.mount&&t.mount(this.dom,e)}update(e){e.startState.facet(Vn)!=e.state.facet(Vn)&&this.setOrder(e.state),(this.layer.update(e,this.dom)||e.geometryChanged)&&(this.scale(),e.view.requestMeasure(this.measureReq))}docViewUpdate(e){this.layer.updateOnDocViewUpdate!==!1&&e.requestMeasure(this.measureReq)}setOrder(e){let t=0,s=e.facet(Vn);for(;t<s.length&&s[t]!=this.layer;)t++;this.dom.style.zIndex=String((this.layer.above?150:-1)-t)}measure(){return this.layer.markers(this.view)}scale(){let{scaleX:e,scaleY:t}=this.view;(e!=this.scaleX||t!=this.scaleY)&&(this.scaleX=e,this.scaleY=t,this.dom.style.transform=`scale(${1/e}, ${1/t})`)}draw(e){if(e.length!=this.drawn.length||e.some((t,s)=>!Gm(t,this.drawn[s]))){let t=this.dom.firstChild,s=0;for(let n of e)n.update&&t&&n.constructor&&this.drawn[s].constructor&&n.update(t,this.drawn[s])?(t=t.nextSibling,s++):this.dom.insertBefore(n.draw(),t);for(;t;){let n=t.nextSibling;t.remove(),t=n}this.drawn=e,T.webkit&&(this.dom.style.display=this.dom.firstChild?"":"none")}}destroy(){this.layer.destroy&&this.layer.destroy(this.dom,this.view),this.dom.remove()}}const Vn=D.define();function tf(i){return[de.define(e=>new Ym(e,i)),Vn.of(i)]}const as=D.define({combine(i){return At(i,{cursorBlinkRate:1200,drawRangeCursor:!0,iosSelectionHandles:!0},{cursorBlinkRate:(e,t)=>Math.min(e,t),drawRangeCursor:(e,t)=>e||t})}});function Zm(i={}){return[as.of(i),eb,tb,ib,$d.of(!0)]}function sf(i){return i.startState.facet(as)!=i.state.facet(as)}const eb=tf({above:!0,markers(i){let{state:e}=i,t=e.facet(as),s=[];for(let n of e.selection.ranges){let r=n==e.selection.main;if(n.empty||t.drawRangeCursor&&!(r&&T.ios&&t.iosSelectionHandles)){let o=r?"cm-cursor cm-cursor-primary":"cm-cursor cm-cursor-secondary",a=n.empty?n:k.cursor(n.head,n.assoc);for(let l of Si.forRange(i,o,a))s.push(l)}}return s},update(i,e){i.transactions.some(s=>s.selection)&&(e.style.animationName=e.style.animationName=="cm-blink"?"cm-blink2":"cm-blink");let t=sf(i);return t&&Ch(i.state,e),i.docChanged||i.selectionSet||t},mount(i,e){Ch(e.state,i)},class:"cm-cursorLayer"});function Ch(i,e){e.style.animationDuration=i.facet(as).cursorBlinkRate+"ms"}const tb=tf({above:!1,markers(i){let e=[],{main:t,ranges:s}=i.state.selection;for(let n of s)if(!n.empty)for(let r of Si.forRange(i,"cm-selectionBackground",n))e.push(r);if(T.ios&&!t.empty&&i.state.facet(as).iosSelectionHandles){for(let n of Si.forRange(i,"cm-selectionHandle cm-selectionHandle-start",k.cursor(t.from,1)))e.push(n);for(let n of Si.forRange(i,"cm-selectionHandle cm-selectionHandle-end",k.cursor(t.to,1)))e.push(n)}return e},update(i,e){return i.docChanged||i.selectionSet||i.viewportChanged||sf(i)},class:"cm-selectionLayer"}),ib=_i.highest(E.theme({".cm-line":{"& ::selection, &::selection":{backgroundColor:"transparent !important"},caretColor:"transparent !important"},".cm-content":{caretColor:"transparent !important","& :focus":{caretColor:"initial !important","&::selection, & ::selection":{backgroundColor:"Highlight !important"}}}})),nf=N.define({map(i,e){return i==null?null:e.mapPos(i)}}),Ss=Pe.define({create(){return null},update(i,e){return i!=null&&(i=e.changes.mapPos(i)),e.effects.reduce((t,s)=>s.is(nf)?s.value:t,i)}}),sb=de.fromClass(class{constructor(i){this.view=i,this.cursor=null,this.measureReq={read:this.readPos.bind(this),write:this.drawCursor.bind(this)}}update(i){var e;let t=i.state.field(Ss);t==null?this.cursor!=null&&((e=this.cursor)===null||e===void 0||e.remove(),this.cursor=null):(this.cursor||(this.cursor=this.view.scrollDOM.appendChild(document.createElement("div")),this.cursor.className="cm-dropCursor"),(i.startState.field(Ss)!=t||i.docChanged||i.geometryChanged)&&this.view.requestMeasure(this.measureReq))}readPos(){let{view:i}=this,e=i.state.field(Ss),t=e!=null&&i.coordsAtPos(e);if(!t)return null;let s=i.scrollDOM.getBoundingClientRect();return{left:t.left-s.left+i.scrollDOM.scrollLeft*i.scaleX,top:t.top-s.top+i.scrollDOM.scrollTop*i.scaleY,height:t.bottom-t.top}}drawCursor(i){if(this.cursor){let{scaleX:e,scaleY:t}=this.view;i?(this.cursor.style.left=i.left/e+"px",this.cursor.style.top=i.top/t+"px",this.cursor.style.height=i.height/t+"px"):this.cursor.style.left="-100000px"}}destroy(){this.cursor&&this.cursor.remove()}setDropPos(i){this.view.state.field(Ss)!=i&&this.view.dispatch({effects:nf.of(i)})}},{eventObservers:{dragover(i){this.setDropPos(this.view.posAtCoords({x:i.clientX,y:i.clientY}))},dragleave(i){(i.target==this.view.contentDOM||!this.view.contentDOM.contains(i.relatedTarget))&&this.setDropPos(null)},dragend(){this.setDropPos(null)},drop(){this.setDropPos(null)}}});function nb(){return[Ss,sb]}function Oh(i,e,t,s,n){e.lastIndex=0;for(let r=i.iterRange(t,s),o=t,a;!r.next().done;o+=r.value.length)if(!r.lineBreak)for(;a=e.exec(r.value);)n(o+a.index,a)}function rb(i,e){let t=i.visibleRanges;if(t.length==1&&t[0].from==i.viewport.from&&t[0].to==i.viewport.to)return t;let s=[];for(let{from:n,to:r}of t)n=Math.max(i.state.doc.lineAt(n).from,n-e),r=Math.min(i.state.doc.lineAt(r).to,r+e),s.length&&s[s.length-1].to>=n?s[s.length-1].to=r:s.push({from:n,to:r});return s}class ob{constructor(e){const{regexp:t,decoration:s,decorate:n,boundary:r,maxLength:o=1e3}=e;if(!t.global)throw new RangeError("The regular expression given to MatchDecorator should have its 'g' flag set");if(this.regexp=t,n)this.addMatch=(a,l,h,c)=>n(c,h,h+a[0].length,a,l);else if(typeof s=="function")this.addMatch=(a,l,h,c)=>{let d=s(a,l,h);d&&c(h,h+a[0].length,d)};else if(s)this.addMatch=(a,l,h,c)=>c(h,h+a[0].length,s);else throw new RangeError("Either 'decorate' or 'decoration' should be provided to MatchDecorator");this.boundary=r,this.maxLength=o}createDeco(e){let t=new Bt,s=t.add.bind(t);for(let{from:n,to:r}of rb(e,this.maxLength))Oh(e.state.doc,this.regexp,n,r,(o,a)=>this.addMatch(a,e,o,s));return t.finish()}updateDeco(e,t){let s=1e9,n=-1;return e.docChanged&&e.changes.iterChanges((r,o,a,l)=>{l>=e.view.viewport.from&&a<=e.view.viewport.to&&(s=Math.min(a,s),n=Math.max(l,n))}),e.viewportMoved||n-s>1e3?this.createDeco(e.view):n>-1?this.updateRange(e.view,t.map(e.changes),s,n):t}updateRange(e,t,s,n){for(let r of e.visibleRanges){let o=Math.max(r.from,s),a=Math.min(r.to,n);if(a>=o){let l=e.state.doc.lineAt(o),h=l.to<a?e.state.doc.lineAt(a):l,c=Math.max(r.from,l.from),d=Math.min(r.to,h.to);if(this.boundary){for(;o>l.from;o--)if(this.boundary.test(l.text[o-1-l.from])){c=o;break}for(;a<h.to;a++)if(this.boundary.test(h.text[a-h.from])){d=a;break}}let f=[],u,p=(m,b,x)=>f.push(x.range(m,b));if(l==h)for(this.regexp.lastIndex=c-l.from;(u=this.regexp.exec(l.text))&&u.index<d-l.from;)this.addMatch(u,e,u.index+l.from,p);else Oh(e.state.doc,this.regexp,c,d,(m,b)=>this.addMatch(b,e,m,p));t=t.update({filterFrom:c,filterTo:d,filter:(m,b)=>m<c||b>d,add:f})}}return t}}const ca=/x/.unicode!=null?"gu":"g",ab=new RegExp(`[\0-\b
--­؜​‎‏\u2028\u2029‭‮⁦⁧⁩\uFEFF￹-￼]`,ca),lb={0:"null",7:"bell",8:"backspace",10:"newline",11:"vertical tab",13:"carriage return",27:"escape",8203:"zero width space",8204:"zero width non-joiner",8205:"zero width joiner",8206:"left-to-right mark",8207:"right-to-left mark",8232:"line separator",8237:"left-to-right override",8238:"right-to-left override",8294:"left-to-right isolate",8295:"right-to-left isolate",8297:"pop directional isolate",8233:"paragraph separator",65279:"zero width no-break space",65532:"object replacement"};let ho=null;function hb(){var i;if(ho==null&&typeof document<"u"&&document.body){let e=document.body.style;ho=((i=e.tabSize)!==null&&i!==void 0?i:e.MozTabSize)!=null}return ho||!1}const Un=D.define({combine(i){let e=At(i,{render:null,specialChars:ab,addSpecialChars:null});return(e.replaceTabs=!hb())&&(e.specialChars=new RegExp("	|"+e.specialChars.source,ca)),e.addSpecialChars&&(e.specialChars=new RegExp(e.specialChars.source+"|"+e.addSpecialChars.source,ca)),e}});function cb(i={}){return[Un.of(i),db()]}let Ah=null;function db(){return Ah||(Ah=de.fromClass(class{constructor(i){this.view=i,this.decorations=L.none,this.decorationCache=Object.create(null),this.decorator=this.makeDecorator(i.state.facet(Un)),this.decorations=this.decorator.createDeco(i)}makeDecorator(i){return new ob({regexp:i.specialChars,decoration:(e,t,s)=>{let{doc:n}=t.state,r=Be(e[0],0);if(r==9){let o=n.lineAt(s),a=t.state.tabSize,l=ds(o.text,a,s-o.from);return L.replace({widget:new gb((a-l%a)*this.view.defaultCharacterWidth/this.view.scaleX)})}return this.decorationCache[r]||(this.decorationCache[r]=L.replace({widget:new pb(i,r)}))},boundary:i.replaceTabs?void 0:/[^]/})}update(i){let e=i.state.facet(Un);i.startState.facet(Un)!=e?(this.decorator=this.makeDecorator(e),this.decorations=this.decorator.createDeco(i.view)):this.decorations=this.decorator.updateDeco(i,this.decorations)}},{decorations:i=>i.decorations}))}const fb="•";function ub(i){return i>=32?fb:i==10?"␤":String.fromCharCode(9216+i)}class pb extends Ht{constructor(e,t){super(),this.options=e,this.code=t}eq(e){return e.code==this.code}toDOM(e){let t=ub(this.code),s=e.state.phrase("Control character")+" "+(lb[this.code]||"0x"+this.code.toString(16)),n=this.options.render&&this.options.render(this.code,s,t);if(n)return n;let r=document.createElement("span");return r.textContent=t,r.title=s,r.setAttribute("aria-label",s),r.className="cm-specialChar",r}ignoreEvent(){return!1}}class gb extends Ht{constructor(e){super(),this.width=e}eq(e){return e.width==this.width}toDOM(){let e=document.createElement("span");return e.textContent="	",e.className="cm-tab",e.style.width=this.width+"px",e}ignoreEvent(){return!1}}function mb(){return yb}const bb=L.line({class:"cm-activeLine"}),yb=de.fromClass(class{constructor(i){this.decorations=this.getDeco(i)}update(i){(i.docChanged||i.selectionSet)&&(this.decorations=this.getDeco(i.view))}getDeco(i){let e=-1,t=[];for(let s of i.state.selection.ranges){let n=i.lineBlockAt(s.head);n.from>e&&(t.push(bb.range(n.from)),e=n.from)}return L.set(t)}},{decorations:i=>i.decorations}),da=2e3;function xb(i,e,t){let s=Math.min(e.line,t.line),n=Math.max(e.line,t.line),r=[];if(e.off>da||t.off>da||e.col<0||t.col<0){let o=Math.min(e.off,t.off),a=Math.max(e.off,t.off);for(let l=s;l<=n;l++){let h=i.doc.line(l);h.length<=a&&r.push(k.range(h.from+o,h.to+a))}}else{let o=Math.min(e.col,t.col),a=Math.max(e.col,t.col);for(let l=s;l<=n;l++){let h=i.doc.line(l),c=Qo(h.text,o,i.tabSize,!0);if(c<0)r.push(k.cursor(h.to));else{let d=Qo(h.text,a,i.tabSize);r.push(k.range(h.from+c,h.from+d))}}}return r}function vb(i,e){let t=i.coordsAtPos(i.viewport.from);return t?Math.round(Math.abs((t.left-e)/i.defaultCharacterWidth)):-1}function $h(i,e){let t=i.posAtCoords({x:e.clientX,y:e.clientY},!1),s=i.state.doc.lineAt(t),n=t-s.from,r=n>da?-1:n==s.length?vb(i,e.clientX):ds(s.text,i.state.tabSize,t-s.from);return{line:s.number,col:r,off:n}}function wb(i,e){let t=$h(i,e),s=i.state.selection;return t?{update(n){if(n.docChanged){let r=n.changes.mapPos(n.startState.doc.line(t.line).from),o=n.state.doc.lineAt(r);t={line:o.number,col:t.col,off:Math.min(t.off,o.length)},s=s.map(n.changes)}},get(n,r,o){let a=$h(i,n);if(!a)return s;let l=xb(i.state,t,a);return l.length?o?k.create(l.concat(s.ranges)):k.create(l):s}}:null}function kb(i){let e=(t=>t.altKey&&t.button==0);return E.mouseSelectionStyle.of((t,s)=>e(s)?wb(t,s):null)}const Sb={Alt:[18,i=>!!i.altKey],Control:[17,i=>!!i.ctrlKey],Shift:[16,i=>!!i.shiftKey],Meta:[91,i=>!!i.metaKey]},Cb={style:"cursor: crosshair"};function Ob(i={}){let[e,t]=Sb[i.key||"Alt"],s=de.fromClass(class{constructor(n){this.view=n,this.isDown=!1}set(n){this.isDown!=n&&(this.isDown=n,this.view.update([]))}},{eventObservers:{keydown(n){this.set(n.keyCode==e||t(n))},keyup(n){(n.keyCode==e||!t(n))&&this.set(!1)},mousemove(n){this.set(t(n))}}});return[s,E.contentAttributes.of(n=>{var r;return!((r=n.plugin(s))===null||r===void 0)&&r.isDown?Cb:null})]}const $n="-10000px";class rf{constructor(e,t,s,n){this.facet=t,this.createTooltipView=s,this.removeTooltipView=n,this.input=e.state.facet(t),this.tooltips=this.input.filter(o=>o);let r=null;this.tooltipViews=this.tooltips.map(o=>r=s(o,r))}update(e,t){var s;let n=e.state.facet(this.facet),r=n.filter(l=>l);if(n===this.input){for(let l of this.tooltipViews)l.update&&l.update(e);return!1}let o=[],a=t?[]:null;for(let l=0;l<r.length;l++){let h=r[l],c=-1;if(h){for(let d=0;d<this.tooltips.length;d++){let f=this.tooltips[d];f&&f.create==h.create&&(c=d)}if(c<0)o[l]=this.createTooltipView(h,l?o[l-1]:null),a&&(a[l]=!!h.above);else{let d=o[l]=this.tooltipViews[c];a&&(a[l]=t[c]),d.update&&d.update(e)}}}for(let l of this.tooltipViews)o.indexOf(l)<0&&(this.removeTooltipView(l),(s=l.destroy)===null||s===void 0||s.call(l));return t&&(a.forEach((l,h)=>t[h]=l),t.length=a.length),this.input=n,this.tooltips=r,this.tooltipViews=o,!0}}function Ab(i){let e=i.dom.ownerDocument.documentElement;return{top:0,left:0,bottom:e.clientHeight,right:e.clientWidth}}const co=D.define({combine:i=>{var e,t,s;return{position:T.ios?"absolute":((e=i.find(n=>n.position))===null||e===void 0?void 0:e.position)||"fixed",parent:((t=i.find(n=>n.parent))===null||t===void 0?void 0:t.parent)||null,tooltipSpace:((s=i.find(n=>n.tooltipSpace))===null||s===void 0?void 0:s.tooltipSpace)||Ab}}}),Ph=new WeakMap,Za=de.fromClass(class{constructor(i){this.view=i,this.above=[],this.inView=!0,this.madeAbsolute=!1,this.lastTransaction=0,this.measureTimeout=-1;let e=i.state.facet(co);this.position=e.position,this.parent=e.parent,this.classes=i.themeClasses,this.createContainer(),this.measureReq={read:this.readMeasure.bind(this),write:this.writeMeasure.bind(this),key:this},this.resizeObserver=typeof ResizeObserver=="function"?new ResizeObserver(()=>this.measureSoon()):null,this.manager=new rf(i,el,(t,s)=>this.createTooltip(t,s),t=>{this.resizeObserver&&this.resizeObserver.unobserve(t.dom),t.dom.remove()}),this.above=this.manager.tooltips.map(t=>!!t.above),this.intersectionObserver=typeof IntersectionObserver=="function"?new IntersectionObserver(t=>{Date.now()>this.lastTransaction-50&&t.length>0&&t[t.length-1].intersectionRatio<1&&this.measureSoon()},{threshold:[1]}):null,this.observeIntersection(),i.win.addEventListener("resize",this.measureSoon=this.measureSoon.bind(this)),this.maybeMeasure()}createContainer(){this.parent?(this.container=document.createElement("div"),this.container.style.position="relative",this.container.className=this.view.themeClasses,this.parent.appendChild(this.container)):this.container=this.view.dom}observeIntersection(){if(this.intersectionObserver){this.intersectionObserver.disconnect();for(let i of this.manager.tooltipViews)this.intersectionObserver.observe(i.dom)}}measureSoon(){this.measureTimeout<0&&(this.measureTimeout=setTimeout(()=>{this.measureTimeout=-1,this.maybeMeasure()},50))}update(i){i.transactions.length&&(this.lastTransaction=Date.now());let e=this.manager.update(i,this.above);e&&this.observeIntersection();let t=e||i.geometryChanged,s=i.state.facet(co);if(s.position!=this.position&&!this.madeAbsolute){this.position=s.position;for(let n of this.manager.tooltipViews)n.dom.style.position=this.position;t=!0}if(s.parent!=this.parent){this.parent&&this.container.remove(),this.parent=s.parent,this.createContainer();for(let n of this.manager.tooltipViews)this.container.appendChild(n.dom);t=!0}else this.parent&&this.view.themeClasses!=this.classes&&(this.classes=this.container.className=this.view.themeClasses);t&&this.maybeMeasure()}createTooltip(i,e){let t=i.create(this.view),s=e?e.dom:null;if(t.dom.classList.add("cm-tooltip"),i.arrow&&!t.dom.querySelector(".cm-tooltip > .cm-tooltip-arrow")){let n=document.createElement("div");n.className="cm-tooltip-arrow",t.dom.appendChild(n)}return t.dom.style.position=this.position,t.dom.style.top=$n,t.dom.style.left="0px",this.container.insertBefore(t.dom,s),t.mount&&t.mount(this.view),this.resizeObserver&&this.resizeObserver.observe(t.dom),t}destroy(){var i,e,t;this.view.win.removeEventListener("resize",this.measureSoon);for(let s of this.manager.tooltipViews)s.dom.remove(),(i=s.destroy)===null||i===void 0||i.call(s);this.parent&&this.container.remove(),(e=this.resizeObserver)===null||e===void 0||e.disconnect(),(t=this.intersectionObserver)===null||t===void 0||t.disconnect(),clearTimeout(this.measureTimeout)}readMeasure(){let i=1,e=1,t=!1;if(this.position=="fixed"&&this.manager.tooltipViews.length){let{dom:r}=this.manager.tooltipViews[0];if(T.safari){let o=r.getBoundingClientRect();t=Math.abs(o.top+1e4)>1||Math.abs(o.left)>1}else t=!!r.offsetParent&&r.offsetParent!=this.container.ownerDocument.body}if(t||this.position=="absolute")if(this.parent){let r=this.parent.getBoundingClientRect();r.width&&r.height&&(i=r.width/this.parent.offsetWidth,e=r.height/this.parent.offsetHeight)}else({scaleX:i,scaleY:e}=this.view.viewState);let s=this.view.scrollDOM.getBoundingClientRect(),n=Xa(this.view);return{visible:{left:s.left+n.left,top:s.top+n.top,right:s.right-n.right,bottom:s.bottom-n.bottom},parent:this.parent?this.container.getBoundingClientRect():this.view.dom.getBoundingClientRect(),pos:this.manager.tooltips.map((r,o)=>{let a=this.manager.tooltipViews[o];return a.getCoords?a.getCoords(r.pos):this.view.coordsAtPos(r.pos)}),size:this.manager.tooltipViews.map(({dom:r})=>r.getBoundingClientRect()),space:this.view.state.facet(co).tooltipSpace(this.view),scaleX:i,scaleY:e,makeAbsolute:t}}writeMeasure(i){var e;if(i.makeAbsolute){this.madeAbsolute=!0,this.position="absolute";for(let a of this.manager.tooltipViews)a.dom.style.position="absolute"}let{visible:t,space:s,scaleX:n,scaleY:r}=i,o=[];for(let a=0;a<this.manager.tooltips.length;a++){let l=this.manager.tooltips[a],h=this.manager.tooltipViews[a],{dom:c}=h,d=i.pos[a],f=i.size[a];if(!d||l.clip!==!1&&(d.bottom<=Math.max(t.top,s.top)||d.top>=Math.min(t.bottom,s.bottom)||d.right<Math.max(t.left,s.left)-.1||d.left>Math.min(t.right,s.right)+.1)){c.style.top=$n;continue}let u=l.arrow?h.dom.querySelector(".cm-tooltip-arrow"):null,p=u?7:0,m=f.right-f.left,b=(e=Ph.get(h))!==null&&e!==void 0?e:f.bottom-f.top,x=h.offset||Pb,S=this.view.textDirection==G.LTR,C=f.width>s.right-s.left?S?s.left:s.right-f.width:S?Math.max(s.left,Math.min(d.left-(u?14:0)+x.x,s.right-m)):Math.min(Math.max(s.left,d.left-m+(u?14:0)-x.x),s.right-m),R=this.above[a];!l.strictSide&&(R?d.top-b-p-x.y<s.top:d.bottom+b+p+x.y>s.bottom)&&R==s.bottom-d.bottom>d.top-s.top&&(R=this.above[a]=!R);let A=(R?d.top-s.top:s.bottom-d.bottom)-p;if(A<b&&h.resize!==!1){if(A<this.view.defaultLineHeight){c.style.top=$n;continue}Ph.set(h,b),c.style.height=(b=A)/r+"px"}else c.style.height&&(c.style.height="");let $=R?d.top-b-p-x.y:d.bottom+p+x.y,P=C+m;if(h.overlap!==!0)for(let I of o)I.left<P&&I.right>C&&I.top<$+b&&I.bottom>$&&($=R?I.top-b-2-p:I.bottom+p+2);if(this.position=="absolute"?(c.style.top=($-i.parent.top)/r+"px",Mh(c,(C-i.parent.left)/n)):(c.style.top=$/r+"px",Mh(c,C/n)),u){let I=d.left+(S?x.x:-x.x)-(C+14-7);u.style.left=I/n+"px"}h.overlap!==!0&&o.push({left:C,top:$,right:P,bottom:$+b}),c.classList.toggle("cm-tooltip-above",R),c.classList.toggle("cm-tooltip-below",!R),h.positioned&&h.positioned(i.space)}}maybeMeasure(){if(this.manager.tooltips.length&&(this.view.inView&&this.view.requestMeasure(this.measureReq),this.inView!=this.view.inView&&(this.inView=this.view.inView,!this.inView)))for(let i of this.manager.tooltipViews)i.dom.style.top=$n}},{eventObservers:{scroll(){this.maybeMeasure()}}});function Mh(i,e){let t=parseInt(i.style.left,10);(isNaN(t)||Math.abs(e-t)>1)&&(i.style.left=e+"px")}const $b=E.baseTheme({".cm-tooltip":{zIndex:500,boxSizing:"border-box"},"&light .cm-tooltip":{border:"1px solid #bbb",backgroundColor:"#f5f5f5"},"&light .cm-tooltip-section:not(:first-child)":{borderTop:"1px solid #bbb"},"&dark .cm-tooltip":{backgroundColor:"#333338",color:"white"},".cm-tooltip-arrow":{height:"7px",width:"14px",position:"absolute",zIndex:-1,overflow:"hidden","&:before, &:after":{content:"''",position:"absolute",width:0,height:0,borderLeft:"7px solid transparent",borderRight:"7px solid transparent"},".cm-tooltip-above &":{bottom:"-7px","&:before":{borderTop:"7px solid #bbb"},"&:after":{borderTop:"7px solid #f5f5f5",bottom:"1px"}},".cm-tooltip-below &":{top:"-7px","&:before":{borderBottom:"7px solid #bbb"},"&:after":{borderBottom:"7px solid #f5f5f5",top:"1px"}}},"&dark .cm-tooltip .cm-tooltip-arrow":{"&:before":{borderTopColor:"#333338",borderBottomColor:"#333338"},"&:after":{borderTopColor:"transparent",borderBottomColor:"transparent"}}}),Pb={x:0,y:0},el=D.define({enables:[Za,$b]}),cr=D.define({combine:i=>i.reduce((e,t)=>e.concat(t),[])});class Lr{static create(e){return new Lr(e)}constructor(e){this.view=e,this.mounted=!1,this.dom=document.createElement("div"),this.dom.classList.add("cm-tooltip-hover"),this.manager=new rf(e,cr,(t,s)=>this.createHostedView(t,s),t=>t.dom.remove())}createHostedView(e,t){let s=e.create(this.view);return s.dom.classList.add("cm-tooltip-section"),this.dom.insertBefore(s.dom,t?t.dom.nextSibling:this.dom.firstChild),this.mounted&&s.mount&&s.mount(this.view),s}mount(e){for(let t of this.manager.tooltipViews)t.mount&&t.mount(e);this.mounted=!0}positioned(e){for(let t of this.manager.tooltipViews)t.positioned&&t.positioned(e)}update(e){this.manager.update(e)}destroy(){var e;for(let t of this.manager.tooltipViews)(e=t.destroy)===null||e===void 0||e.call(t)}passProp(e){let t;for(let s of this.manager.tooltipViews){let n=s[e];if(n!==void 0){if(t===void 0)t=n;else if(t!==n)return}}return t}get offset(){return this.passProp("offset")}get getCoords(){return this.passProp("getCoords")}get overlap(){return this.passProp("overlap")}get resize(){return this.passProp("resize")}}const Mb=el.compute([cr],i=>{let e=i.facet(cr);return e.length===0?null:{pos:Math.min(...e.map(t=>t.pos)),end:Math.max(...e.map(t=>{var s;return(s=t.end)!==null&&s!==void 0?s:t.pos})),create:Lr.create,above:e[0].above,arrow:e.some(t=>t.arrow)}});class Tb{constructor(e,t,s,n,r){this.view=e,this.source=t,this.field=s,this.setHover=n,this.hoverTime=r,this.hoverTimeout=-1,this.restartTimeout=-1,this.pending=null,this.lastMove={x:0,y:0,target:e.dom,time:0},this.checkHover=this.checkHover.bind(this),e.dom.addEventListener("mouseleave",this.mouseleave=this.mouseleave.bind(this)),e.dom.addEventListener("mousemove",this.mousemove=this.mousemove.bind(this))}update(){this.pending&&(this.pending=null,clearTimeout(this.restartTimeout),this.restartTimeout=setTimeout(()=>this.startHover(),20))}get active(){return this.view.state.field(this.field)}checkHover(){if(this.hoverTimeout=-1,this.active.length)return;let e=Date.now()-this.lastMove.time;e<this.hoverTime?this.hoverTimeout=setTimeout(this.checkHover,this.hoverTime-e):this.startHover()}startHover(){clearTimeout(this.restartTimeout);let{view:e,lastMove:t}=this,s=e.docView.tile.nearest(t.target);if(!s)return;let n,r=1;if(s.isWidget())n=s.posAtStart;else{if(n=e.posAtCoords(t),n==null)return;let a=e.coordsAtPos(n);if(!a||t.y<a.top||t.y>a.bottom||t.x<a.left-e.defaultCharacterWidth||t.x>a.right+e.defaultCharacterWidth)return;let l=e.bidiSpans(e.state.doc.lineAt(n)).find(c=>c.from<=n&&c.to>=n),h=l&&l.dir==G.RTL?-1:1;r=t.x<a.left?-h:h}let o=this.source(e,n,r);if(o!=null&&o.then){let a=this.pending={pos:n};o.then(l=>{this.pending==a&&(this.pending=null,l&&!(Array.isArray(l)&&!l.length)&&e.dispatch({effects:this.setHover.of(Array.isArray(l)?l:[l])}))},l=>Ie(e.state,l,"hover tooltip"))}else o&&!(Array.isArray(o)&&!o.length)&&e.dispatch({effects:this.setHover.of(Array.isArray(o)?o:[o])})}get tooltip(){let e=this.view.plugin(Za),t=e?e.manager.tooltips.findIndex(s=>s.create==Lr.create):-1;return t>-1?e.manager.tooltipViews[t]:null}mousemove(e){var t,s;this.lastMove={x:e.clientX,y:e.clientY,target:e.target,time:Date.now()},this.hoverTimeout<0&&(this.hoverTimeout=setTimeout(this.checkHover,this.hoverTime));let{active:n,tooltip:r}=this;if(n.length&&r&&!Db(r.dom,e)||this.pending){let{pos:o}=n[0]||this.pending,a=(s=(t=n[0])===null||t===void 0?void 0:t.end)!==null&&s!==void 0?s:o;(o==a?this.view.posAtCoords(this.lastMove)!=o:!Eb(this.view,o,a,e.clientX,e.clientY))&&(this.view.dispatch({effects:this.setHover.of([])}),this.pending=null)}}mouseleave(e){clearTimeout(this.hoverTimeout),this.hoverTimeout=-1;let{active:t}=this;if(t.length){let{tooltip:s}=this;s&&s.dom.contains(e.relatedTarget)?this.watchTooltipLeave(s.dom):this.view.dispatch({effects:this.setHover.of([])})}}watchTooltipLeave(e){let t=s=>{e.removeEventListener("mouseleave",t),this.active.length&&!this.view.dom.contains(s.relatedTarget)&&this.view.dispatch({effects:this.setHover.of([])})};e.addEventListener("mouseleave",t)}destroy(){clearTimeout(this.hoverTimeout),clearTimeout(this.restartTimeout),this.view.dom.removeEventListener("mouseleave",this.mouseleave),this.view.dom.removeEventListener("mousemove",this.mousemove)}}const Pn=4;function Db(i,e){let{left:t,right:s,top:n,bottom:r}=i.getBoundingClientRect(),o;if(o=i.querySelector(".cm-tooltip-arrow")){let a=o.getBoundingClientRect();n=Math.min(a.top,n),r=Math.max(a.bottom,r)}return e.clientX>=t-Pn&&e.clientX<=s+Pn&&e.clientY>=n-Pn&&e.clientY<=r+Pn}function Eb(i,e,t,s,n,r){let o=i.scrollDOM.getBoundingClientRect(),a=i.documentTop+i.documentPadding.top+i.contentHeight;if(o.left>s||o.right<s||o.top>n||Math.min(o.bottom,a)<n)return!1;let l=i.posAtCoords({x:s,y:n},!1);return l>=e&&l<=t}function Rb(i,e={}){let t=N.define(),s=Pe.define({create(){return[]},update(n,r){if(n.length&&(e.hideOnChange&&(r.docChanged||r.selection)?n=[]:e.hideOn&&(n=n.filter(o=>!e.hideOn(r,o))),r.docChanged)){let o=[];for(let a of n){let l=r.changes.mapPos(a.pos,-1,Ee.TrackDel);if(l!=null){let h=Object.assign(Object.create(null),a);h.pos=l,h.end!=null&&(h.end=r.changes.mapPos(h.end)),o.push(h)}}n=o}for(let o of r.effects)o.is(t)&&(n=o.value),o.is(Bb)&&(n=[]);return n},provide:n=>cr.from(n)});return{active:s,extension:[s,de.define(n=>new Tb(n,i,s,t,e.hoverTime||300)),Mb]}}function of(i,e){let t=i.plugin(Za);if(!t)return null;let s=t.manager.tooltips.indexOf(e);return s<0?null:t.manager.tooltipViews[s]}const Bb=N.define(),Th=D.define({combine(i){let e,t;for(let s of i)e=e||s.topContainer,t=t||s.bottomContainer;return{topContainer:e,bottomContainer:t}}});function tl(i,e){let t=i.plugin(af),s=t?t.specs.indexOf(e):-1;return s>-1?t.panels[s]:null}const af=de.fromClass(class{constructor(i){this.input=i.state.facet(Vs),this.specs=this.input.filter(t=>t),this.panels=this.specs.map(t=>t(i));let e=i.state.facet(Th);this.top=new Mn(i,!0,e.topContainer),this.bottom=new Mn(i,!1,e.bottomContainer),this.top.sync(this.panels.filter(t=>t.top)),this.bottom.sync(this.panels.filter(t=>!t.top));for(let t of this.panels)t.dom.classList.add("cm-panel"),t.mount&&t.mount()}update(i){let e=i.state.facet(Th);this.top.container!=e.topContainer&&(this.top.sync([]),this.top=new Mn(i.view,!0,e.topContainer)),this.bottom.container!=e.bottomContainer&&(this.bottom.sync([]),this.bottom=new Mn(i.view,!1,e.bottomContainer)),this.top.syncClasses(),this.bottom.syncClasses();let t=i.state.facet(Vs);if(t!=this.input){let s=t.filter(l=>l),n=[],r=[],o=[],a=[];for(let l of s){let h=this.specs.indexOf(l),c;h<0?(c=l(i.view),a.push(c)):(c=this.panels[h],c.update&&c.update(i)),n.push(c),(c.top?r:o).push(c)}this.specs=s,this.panels=n,this.top.sync(r),this.bottom.sync(o);for(let l of a)l.dom.classList.add("cm-panel"),l.mount&&l.mount()}else for(let s of this.panels)s.update&&s.update(i)}destroy(){this.top.sync([]),this.bottom.sync([])}},{provide:i=>E.scrollMargins.of(e=>{let t=e.plugin(i);return t&&{top:t.top.scrollMargin(),bottom:t.bottom.scrollMargin()}})});class Mn{constructor(e,t,s){this.view=e,this.top=t,this.container=s,this.dom=void 0,this.classes="",this.panels=[],this.syncClasses()}sync(e){for(let t of this.panels)t.destroy&&e.indexOf(t)<0&&t.destroy();this.panels=e,this.syncDOM()}syncDOM(){if(this.panels.length==0){this.dom&&(this.dom.remove(),this.dom=void 0);return}if(!this.dom){this.dom=document.createElement("div"),this.dom.className=this.top?"cm-panels cm-panels-top":"cm-panels cm-panels-bottom",this.dom.style[this.top?"top":"bottom"]="0";let t=this.container||this.view.dom;t.insertBefore(this.dom,this.top?t.firstChild:null)}let e=this.dom.firstChild;for(let t of this.panels)if(t.dom.parentNode==this.dom){for(;e!=t.dom;)e=Dh(e);e=e.nextSibling}else this.dom.insertBefore(t.dom,e);for(;e;)e=Dh(e)}scrollMargin(){return!this.dom||this.container?0:Math.max(0,this.top?this.dom.getBoundingClientRect().bottom-Math.max(0,this.view.scrollDOM.getBoundingClientRect().top):Math.min(innerHeight,this.view.scrollDOM.getBoundingClientRect().bottom)-this.dom.getBoundingClientRect().top)}syncClasses(){if(!(!this.container||this.classes==this.view.themeClasses)){for(let e of this.classes.split(" "))e&&this.container.classList.remove(e);for(let e of(this.classes=this.view.themeClasses).split(" "))e&&this.container.classList.add(e)}}}function Dh(i){let e=i.nextSibling;return i.remove(),e}const Vs=D.define({enables:af});function _b(i,e){let t,s=new Promise(o=>t=o),n=o=>Lb(o,e,t);i.state.field(fo,!1)?i.dispatch({effects:lf.of(n)}):i.dispatch({effects:N.appendConfig.of(fo.init(()=>[n]))});let r=hf.of(n);return{close:r,result:s.then(o=>((i.win.queueMicrotask||(l=>i.win.setTimeout(l,10)))(()=>{i.state.field(fo).indexOf(n)>-1&&i.dispatch({effects:r})}),o))}}const fo=Pe.define({create(){return[]},update(i,e){for(let t of e.effects)t.is(lf)?i=[t.value].concat(i):t.is(hf)&&(i=i.filter(s=>s!=t.value));return i},provide:i=>Vs.computeN([i],e=>e.field(i))}),lf=N.define(),hf=N.define();function Lb(i,e,t){let s=e.content?e.content(i,()=>o(null)):null;if(!s){if(s=X("form"),e.input){let a=X("input",e.input);/^(text|password|number|email|tel|url)$/.test(a.type)&&a.classList.add("cm-textfield"),a.name||(a.name="input"),s.appendChild(X("label",(e.label||"")+": ",a))}else s.appendChild(document.createTextNode(e.label||""));s.appendChild(document.createTextNode(" ")),s.appendChild(X("button",{class:"cm-button",type:"submit"},e.submitLabel||"OK"))}let n=s.nodeName=="FORM"?[s]:s.querySelectorAll("form");for(let a=0;a<n.length;a++){let l=n[a];l.addEventListener("keydown",h=>{h.keyCode==27?(h.preventDefault(),o(null)):h.keyCode==13&&(h.preventDefault(),o(l))}),l.addEventListener("submit",h=>{h.preventDefault(),o(l)})}let r=X("div",s,X("button",{onclick:()=>o(null),"aria-label":i.state.phrase("close"),class:"cm-dialog-close",type:"button"},["×"]));e.class&&(r.className=e.class),r.classList.add("cm-dialog");function o(a){r.contains(r.ownerDocument.activeElement)&&i.focus(),t(a)}return{dom:r,top:e.top,mount:()=>{if(e.focus){let a;typeof e.focus=="string"?a=s.querySelector(e.focus):a=s.querySelector("input")||s.querySelector("button"),a&&"select"in a?a.select():a&&"focus"in a&&a.focus()}}}}class Lt extends Kt{compare(e){return this==e||this.constructor==e.constructor&&this.eq(e)}eq(e){return!1}destroy(e){}}Lt.prototype.elementClass="";Lt.prototype.toDOM=void 0;Lt.prototype.mapMode=Ee.TrackBefore;Lt.prototype.startSide=Lt.prototype.endSide=-1;Lt.prototype.point=!0;const jn=D.define(),Ib=D.define(),Nb={class:"",renderEmptyElements:!1,elementStyle:"",markers:()=>H.empty,lineMarker:()=>null,widgetMarker:()=>null,lineMarkerChange:null,initialSpacer:null,updateSpacer:null,domEventHandlers:{},side:"before"},Ds=D.define();function zb(i){return[cf(),Ds.of({...Nb,...i})]}const Eh=D.define({combine:i=>i.some(e=>e)});function cf(i){return[Fb]}const Fb=de.fromClass(class{constructor(i){this.view=i,this.domAfter=null,this.prevViewport=i.viewport,this.dom=document.createElement("div"),this.dom.className="cm-gutters cm-gutters-before",this.dom.setAttribute("aria-hidden","true"),this.dom.style.minHeight=this.view.contentHeight/this.view.scaleY+"px",this.gutters=i.state.facet(Ds).map(e=>new Bh(i,e)),this.fixed=!i.state.facet(Eh);for(let e of this.gutters)e.config.side=="after"?this.getDOMAfter().appendChild(e.dom):this.dom.appendChild(e.dom);this.fixed&&(this.dom.style.position="sticky"),this.syncGutters(!1),i.scrollDOM.insertBefore(this.dom,i.contentDOM)}getDOMAfter(){return this.domAfter||(this.domAfter=document.createElement("div"),this.domAfter.className="cm-gutters cm-gutters-after",this.domAfter.setAttribute("aria-hidden","true"),this.domAfter.style.minHeight=this.view.contentHeight/this.view.scaleY+"px",this.domAfter.style.position=this.fixed?"sticky":"",this.view.scrollDOM.appendChild(this.domAfter)),this.domAfter}update(i){if(this.updateGutters(i)){let e=this.prevViewport,t=i.view.viewport,s=Math.min(e.to,t.to)-Math.max(e.from,t.from);this.syncGutters(s<(t.to-t.from)*.8)}if(i.geometryChanged){let e=this.view.contentHeight/this.view.scaleY+"px";this.dom.style.minHeight=e,this.domAfter&&(this.domAfter.style.minHeight=e)}this.view.state.facet(Eh)!=!this.fixed&&(this.fixed=!this.fixed,this.dom.style.position=this.fixed?"sticky":"",this.domAfter&&(this.domAfter.style.position=this.fixed?"sticky":"")),this.prevViewport=i.view.viewport}syncGutters(i){let e=this.dom.nextSibling;i&&(this.dom.remove(),this.domAfter&&this.domAfter.remove());let t=H.iter(this.view.state.facet(jn),this.view.viewport.from),s=[],n=this.gutters.map(r=>new Hb(r,this.view.viewport,-this.view.documentPadding.top));for(let r of this.view.viewportLineBlocks)if(s.length&&(s=[]),Array.isArray(r.type)){let o=!0;for(let a of r.type)if(a.type==Ce.Text&&o){fa(t,s,a.from);for(let l of n)l.line(this.view,a,s);o=!1}else if(a.widget)for(let l of n)l.widget(this.view,a)}else if(r.type==Ce.Text){fa(t,s,r.from);for(let o of n)o.line(this.view,r,s)}else if(r.widget)for(let o of n)o.widget(this.view,r);for(let r of n)r.finish();i&&(this.view.scrollDOM.insertBefore(this.dom,e),this.domAfter&&this.view.scrollDOM.appendChild(this.domAfter))}updateGutters(i){let e=i.startState.facet(Ds),t=i.state.facet(Ds),s=i.docChanged||i.heightChanged||i.viewportChanged||!H.eq(i.startState.facet(jn),i.state.facet(jn),i.view.viewport.from,i.view.viewport.to);if(e==t)for(let n of this.gutters)n.update(i)&&(s=!0);else{s=!0;let n=[];for(let r of t){let o=e.indexOf(r);o<0?n.push(new Bh(this.view,r)):(this.gutters[o].update(i),n.push(this.gutters[o]))}for(let r of this.gutters)r.dom.remove(),n.indexOf(r)<0&&r.destroy();for(let r of n)r.config.side=="after"?this.getDOMAfter().appendChild(r.dom):this.dom.appendChild(r.dom);this.gutters=n}return s}destroy(){for(let i of this.gutters)i.destroy();this.dom.remove(),this.domAfter&&this.domAfter.remove()}},{provide:i=>E.scrollMargins.of(e=>{let t=e.plugin(i);if(!t||t.gutters.length==0||!t.fixed)return null;let s=t.dom.offsetWidth*e.scaleX,n=t.domAfter?t.domAfter.offsetWidth*e.scaleX:0;return e.textDirection==G.LTR?{left:s,right:n}:{right:s,left:n}})});function Rh(i){return Array.isArray(i)?i:[i]}function fa(i,e,t){for(;i.value&&i.from<=t;)i.from==t&&e.push(i.value),i.next()}class Hb{constructor(e,t,s){this.gutter=e,this.height=s,this.i=0,this.cursor=H.iter(e.markers,t.from)}addElement(e,t,s){let{gutter:n}=this,r=(t.top-this.height)/e.scaleY,o=t.height/e.scaleY;if(this.i==n.elements.length){let a=new df(e,o,r,s);n.elements.push(a),n.dom.appendChild(a.dom)}else n.elements[this.i].update(e,o,r,s);this.height=t.bottom,this.i++}line(e,t,s){let n=[];fa(this.cursor,n,t.from),s.length&&(n=n.concat(s));let r=this.gutter.config.lineMarker(e,t,n);r&&n.unshift(r);let o=this.gutter;n.length==0&&!o.config.renderEmptyElements||this.addElement(e,t,n)}widget(e,t){let s=this.gutter.config.widgetMarker(e,t.widget,t),n=s?[s]:null;for(let r of e.state.facet(Ib)){let o=r(e,t.widget,t);o&&(n||(n=[])).push(o)}n&&this.addElement(e,t,n)}finish(){let e=this.gutter;for(;e.elements.length>this.i;){let t=e.elements.pop();e.dom.removeChild(t.dom),t.destroy()}}}class Bh{constructor(e,t){this.view=e,this.config=t,this.elements=[],this.spacer=null,this.dom=document.createElement("div"),this.dom.className="cm-gutter"+(this.config.class?" "+this.config.class:"");for(let s in t.domEventHandlers)this.dom.addEventListener(s,n=>{let r=n.target,o;if(r!=this.dom&&this.dom.contains(r)){for(;r.parentNode!=this.dom;)r=r.parentNode;let l=r.getBoundingClientRect();o=(l.top+l.bottom)/2}else o=n.clientY;let a=e.lineBlockAtHeight(o-e.documentTop);t.domEventHandlers[s](e,a,n)&&n.preventDefault()});this.markers=Rh(t.markers(e)),t.initialSpacer&&(this.spacer=new df(e,0,0,[t.initialSpacer(e)]),this.dom.appendChild(this.spacer.dom),this.spacer.dom.style.cssText+="visibility: hidden; pointer-events: none")}update(e){let t=this.markers;if(this.markers=Rh(this.config.markers(e.view)),this.spacer&&this.config.updateSpacer){let n=this.config.updateSpacer(this.spacer.markers[0],e);n!=this.spacer.markers[0]&&this.spacer.update(e.view,0,0,[n])}let s=e.view.viewport;return!H.eq(this.markers,t,s.from,s.to)||(this.config.lineMarkerChange?this.config.lineMarkerChange(e):!1)}destroy(){for(let e of this.elements)e.destroy()}}class df{constructor(e,t,s,n){this.height=-1,this.above=0,this.markers=[],this.dom=document.createElement("div"),this.dom.className="cm-gutterElement",this.update(e,t,s,n)}update(e,t,s,n){this.height!=t&&(this.height=t,this.dom.style.height=t+"px"),this.above!=s&&(this.dom.style.marginTop=(this.above=s)?s+"px":""),Wb(this.markers,n)||this.setMarkers(e,n)}setMarkers(e,t){let s="cm-gutterElement",n=this.dom.firstChild;for(let r=0,o=0;;){let a=o,l=r<t.length?t[r++]:null,h=!1;if(l){let c=l.elementClass;c&&(s+=" "+c);for(let d=o;d<this.markers.length;d++)if(this.markers[d].compare(l)){a=d,h=!0;break}}else a=this.markers.length;for(;o<a;){let c=this.markers[o++];if(c.toDOM){c.destroy(n);let d=n.nextSibling;n.remove(),n=d}}if(!l)break;l.toDOM&&(h?n=n.nextSibling:this.dom.insertBefore(l.toDOM(e),n)),h&&o++}this.dom.className=s,this.markers=t}destroy(){this.setMarkers(null,[])}}function Wb(i,e){if(i.length!=e.length)return!1;for(let t=0;t<i.length;t++)if(!i[t].compare(e[t]))return!1;return!0}const qb=D.define(),Qb=D.define(),Qi=D.define({combine(i){return At(i,{formatNumber:String,domEventHandlers:{}},{domEventHandlers(e,t){let s=Object.assign({},e);for(let n in t){let r=s[n],o=t[n];s[n]=r?(a,l,h)=>r(a,l,h)||o(a,l,h):o}return s}})}});class uo extends Lt{constructor(e){super(),this.number=e}eq(e){return this.number==e.number}toDOM(){return document.createTextNode(this.number)}}function po(i,e){return i.state.facet(Qi).formatNumber(e,i.state)}const Vb=Ds.compute([Qi],i=>({class:"cm-lineNumbers",renderEmptyElements:!1,markers(e){return e.state.facet(qb)},lineMarker(e,t,s){return s.some(n=>n.toDOM)?null:new uo(po(e,e.state.doc.lineAt(t.from).number))},widgetMarker:(e,t,s)=>{for(let n of e.state.facet(Qb)){let r=n(e,t,s);if(r)return r}return null},lineMarkerChange:e=>e.startState.facet(Qi)!=e.state.facet(Qi),initialSpacer(e){return new uo(po(e,_h(e.state.doc.lines)))},updateSpacer(e,t){let s=po(t.view,_h(t.view.state.doc.lines));return s==e.number?e:new uo(s)},domEventHandlers:i.facet(Qi).domEventHandlers,side:"before"}));function Ub(i={}){return[Qi.of(i),cf(),Vb]}function _h(i){let e=9;for(;e<i;)e=e*10+9;return e}const jb=new class extends Lt{constructor(){super(...arguments),this.elementClass="cm-activeLineGutter"}},Xb=jn.compute(["selection"],i=>{let e=[],t=-1;for(let s of i.selection.ranges){let n=i.doc.lineAt(s.head).from;n>t&&(t=n,e.push(jb.range(n)))}return H.of(e)});function Jb(){return Xb}const ff=1024;let Kb=0;class go{constructor(e,t){this.from=e,this.to=t}}class z{constructor(e={}){this.id=Kb++,this.perNode=!!e.perNode,this.deserialize=e.deserialize||(()=>{throw new Error("This node type doesn't define a deserialize function")}),this.combine=e.combine||null}add(e){if(this.perNode)throw new RangeError("Can't add per-node props to node types");return typeof e!="function"&&(e=Fe.match(e)),t=>{let s=e(t);return s===void 0?null:[this,s]}}}z.closedBy=new z({deserialize:i=>i.split(" ")});z.openedBy=new z({deserialize:i=>i.split(" ")});z.group=new z({deserialize:i=>i.split(" ")});z.isolate=new z({deserialize:i=>{if(i&&i!="rtl"&&i!="ltr"&&i!="auto")throw new RangeError("Invalid value for isolate: "+i);return i||"auto"}});z.contextHash=new z({perNode:!0});z.lookAhead=new z({perNode:!0});z.mounted=new z({perNode:!0});class Es{constructor(e,t,s,n=!1){this.tree=e,this.overlay=t,this.parser=s,this.bracketed=n}static get(e){return e&&e.props&&e.props[z.mounted.id]}}const Gb=Object.create(null);class Fe{constructor(e,t,s,n=0){this.name=e,this.props=t,this.id=s,this.flags=n}static define(e){let t=e.props&&e.props.length?Object.create(null):Gb,s=(e.top?1:0)|(e.skipped?2:0)|(e.error?4:0)|(e.name==null?8:0),n=new Fe(e.name||"",t,e.id,s);if(e.props){for(let r of e.props)if(Array.isArray(r)||(r=r(n)),r){if(r[0].perNode)throw new RangeError("Can't store a per-node prop on a node type");t[r[0].id]=r[1]}}return n}prop(e){return this.props[e.id]}get isTop(){return(this.flags&1)>0}get isSkipped(){return(this.flags&2)>0}get isError(){return(this.flags&4)>0}get isAnonymous(){return(this.flags&8)>0}is(e){if(typeof e=="string"){if(this.name==e)return!0;let t=this.prop(z.group);return t?t.indexOf(e)>-1:!1}return this.id==e}static match(e){let t=Object.create(null);for(let s in e)for(let n of s.split(" "))t[n]=e[s];return s=>{for(let n=s.prop(z.group),r=-1;r<(n?n.length:0);r++){let o=t[r<0?s.name:n[r]];if(o)return o}}}}Fe.none=new Fe("",Object.create(null),0,8);class il{constructor(e){this.types=e;for(let t=0;t<e.length;t++)if(e[t].id!=t)throw new RangeError("Node type ids should correspond to array positions when creating a node set")}extend(...e){let t=[];for(let s of this.types){let n=null;for(let r of e){let o=r(s);if(o){n||(n=Object.assign({},s.props));let a=o[1],l=o[0];l.combine&&l.id in n&&(a=l.combine(n[l.id],a)),n[l.id]=a}}t.push(n?new Fe(s.name,n,s.id,s.flags):s)}return new il(t)}}const Tn=new WeakMap,Lh=new WeakMap;var re;(function(i){i[i.ExcludeBuffers=1]="ExcludeBuffers",i[i.IncludeAnonymous=2]="IncludeAnonymous",i[i.IgnoreMounts=4]="IgnoreMounts",i[i.IgnoreOverlays=8]="IgnoreOverlays",i[i.EnterBracketed=16]="EnterBracketed"})(re||(re={}));class ce{constructor(e,t,s,n,r){if(this.type=e,this.children=t,this.positions=s,this.length=n,this.props=null,r&&r.length){this.props=Object.create(null);for(let[o,a]of r)this.props[typeof o=="number"?o:o.id]=a}}toString(){let e=Es.get(this);if(e&&!e.overlay)return e.tree.toString();let t="";for(let s of this.children){let n=s.toString();n&&(t&&(t+=","),t+=n)}return this.type.name?(/\W/.test(this.type.name)&&!this.type.isError?JSON.stringify(this.type.name):this.type.name)+(t.length?"("+t+")":""):t}cursor(e=0){return new pa(this.topNode,e)}cursorAt(e,t=0,s=0){let n=Tn.get(this)||this.topNode,r=new pa(n);return r.moveTo(e,t),Tn.set(this,r._tree),r}get topNode(){return new Ze(this,0,0,null)}resolve(e,t=0){let s=Us(Tn.get(this)||this.topNode,e,t,!1);return Tn.set(this,s),s}resolveInner(e,t=0){let s=Us(Lh.get(this)||this.topNode,e,t,!0);return Lh.set(this,s),s}resolveStack(e,t=0){return e0(this,e,t)}iterate(e){let{enter:t,leave:s,from:n=0,to:r=this.length}=e,o=e.mode||0,a=(o&re.IncludeAnonymous)>0;for(let l=this.cursor(o|re.IncludeAnonymous);;){let h=!1;if(l.from<=r&&l.to>=n&&(!a&&l.type.isAnonymous||t(l)!==!1)){if(l.firstChild())continue;h=!0}for(;h&&s&&(a||!l.type.isAnonymous)&&s(l),!l.nextSibling();){if(!l.parent())return;h=!0}}}prop(e){return e.perNode?this.props?this.props[e.id]:void 0:this.type.prop(e)}get propValues(){let e=[];if(this.props)for(let t in this.props)e.push([+t,this.props[t]]);return e}balance(e={}){return this.children.length<=8?this:rl(Fe.none,this.children,this.positions,0,this.children.length,0,this.length,(t,s,n)=>new ce(this.type,t,s,n,this.propValues),e.makeTree||((t,s,n)=>new ce(Fe.none,t,s,n)))}static build(e){return t0(e)}}ce.empty=new ce(Fe.none,[],[],0);class sl{constructor(e,t){this.buffer=e,this.index=t}get id(){return this.buffer[this.index-4]}get start(){return this.buffer[this.index-3]}get end(){return this.buffer[this.index-2]}get size(){return this.buffer[this.index-1]}get pos(){return this.index}next(){this.index-=4}fork(){return new sl(this.buffer,this.index)}}class ei{constructor(e,t,s){this.buffer=e,this.length=t,this.set=s}get type(){return Fe.none}toString(){let e=[];for(let t=0;t<this.buffer.length;)e.push(this.childString(t)),t=this.buffer[t+3];return e.join(",")}childString(e){let t=this.buffer[e],s=this.buffer[e+3],n=this.set.types[t],r=n.name;if(/\W/.test(r)&&!n.isError&&(r=JSON.stringify(r)),e+=4,s==e)return r;let o=[];for(;e<s;)o.push(this.childString(e)),e=this.buffer[e+3];return r+"("+o.join(",")+")"}findChild(e,t,s,n,r){let{buffer:o}=this,a=-1;for(let l=e;l!=t&&!(uf(r,n,o[l+1],o[l+2])&&(a=l,s>0));l=o[l+3]);return a}slice(e,t,s){let n=this.buffer,r=new Uint16Array(t-e),o=0;for(let a=e,l=0;a<t;){r[l++]=n[a++],r[l++]=n[a++]-s;let h=r[l++]=n[a++]-s;r[l++]=n[a++]-e,o=Math.max(o,h)}return new ei(r,o,this.set)}}function uf(i,e,t,s){switch(i){case-2:return t<e;case-1:return s>=e&&t<e;case 0:return t<e&&s>e;case 1:return t<=e&&s>e;case 2:return s>e;case 4:return!0}}function Us(i,e,t,s){for(var n;i.from==i.to||(t<1?i.from>=e:i.from>e)||(t>-1?i.to<=e:i.to<e);){let o=!s&&i instanceof Ze&&i.index<0?null:i.parent;if(!o)return i;i=o}let r=s?0:re.IgnoreOverlays;if(s)for(let o=i,a=o.parent;a;o=a,a=o.parent)o instanceof Ze&&o.index<0&&((n=a.enter(e,t,r))===null||n===void 0?void 0:n.from)!=o.from&&(i=a);for(;;){let o=i.enter(e,t,r);if(!o)return i;i=o}}class pf{cursor(e=0){return new pa(this,e)}getChild(e,t=null,s=null){let n=Ih(this,e,t,s);return n.length?n[0]:null}getChildren(e,t=null,s=null){return Ih(this,e,t,s)}resolve(e,t=0){return Us(this,e,t,!1)}resolveInner(e,t=0){return Us(this,e,t,!0)}matchContext(e){return ua(this.parent,e)}enterUnfinishedNodesBefore(e){let t=this.childBefore(e),s=this;for(;t;){let n=t.lastChild;if(!n||n.to!=t.to)break;n.type.isError&&n.from==n.to?(s=t,t=n.prevSibling):t=n}return s}get node(){return this}get next(){return this.parent}}class Ze extends pf{constructor(e,t,s,n){super(),this._tree=e,this.from=t,this.index=s,this._parent=n}get type(){return this._tree.type}get name(){return this._tree.type.name}get to(){return this.from+this._tree.length}nextChild(e,t,s,n,r=0){for(let o=this;;){for(let{children:a,positions:l}=o._tree,h=t>0?a.length:-1;e!=h;e+=t){let c=a[e],d=l[e]+o.from,f;if(!(!(r&re.EnterBracketed&&c instanceof ce&&(f=Es.get(c))&&!f.overlay&&f.bracketed&&s>=d&&s<=d+c.length)&&!uf(n,s,d,d+c.length))){if(c instanceof ei){if(r&re.ExcludeBuffers)continue;let u=c.findChild(0,c.buffer.length,t,s-d,n);if(u>-1)return new jt(new Yb(o,c,e,d),null,u)}else if(r&re.IncludeAnonymous||!c.type.isAnonymous||nl(c)){let u;if(!(r&re.IgnoreMounts)&&(u=Es.get(c))&&!u.overlay)return new Ze(u.tree,d,e,o);let p=new Ze(c,d,e,o);return r&re.IncludeAnonymous||!p.type.isAnonymous?p:p.nextChild(t<0?c.children.length-1:0,t,s,n,r)}}}if(r&re.IncludeAnonymous||!o.type.isAnonymous||(o.index>=0?e=o.index+t:e=t<0?-1:o._parent._tree.children.length,o=o._parent,!o))return null}}get firstChild(){return this.nextChild(0,1,0,4)}get lastChild(){return this.nextChild(this._tree.children.length-1,-1,0,4)}childAfter(e){return this.nextChild(0,1,e,2)}childBefore(e){return this.nextChild(this._tree.children.length-1,-1,e,-2)}prop(e){return this._tree.prop(e)}enter(e,t,s=0){let n;if(!(s&re.IgnoreOverlays)&&(n=Es.get(this._tree))&&n.overlay){let r=e-this.from,o=s&re.EnterBracketed&&n.bracketed;for(let{from:a,to:l}of n.overlay)if((t>0||o?a<=r:a<r)&&(t<0||o?l>=r:l>r))return new Ze(n.tree,n.overlay[0].from+this.from,-1,this)}return this.nextChild(0,1,e,t,s)}nextSignificantParent(){let e=this;for(;e.type.isAnonymous&&e._parent;)e=e._parent;return e}get parent(){return this._parent?this._parent.nextSignificantParent():null}get nextSibling(){return this._parent&&this.index>=0?this._parent.nextChild(this.index+1,1,0,4):null}get prevSibling(){return this._parent&&this.index>=0?this._parent.nextChild(this.index-1,-1,0,4):null}get tree(){return this._tree}toTree(){return this._tree}toString(){return this._tree.toString()}}function Ih(i,e,t,s){let n=i.cursor(),r=[];if(!n.firstChild())return r;if(t!=null){for(let o=!1;!o;)if(o=n.type.is(t),!n.nextSibling())return r}for(;;){if(s!=null&&n.type.is(s))return r;if(n.type.is(e)&&r.push(n.node),!n.nextSibling())return s==null?r:[]}}function ua(i,e,t=e.length-1){for(let s=i;t>=0;s=s.parent){if(!s)return!1;if(!s.type.isAnonymous){if(e[t]&&e[t]!=s.name)return!1;t--}}return!0}class Yb{constructor(e,t,s,n){this.parent=e,this.buffer=t,this.index=s,this.start=n}}class jt extends pf{get name(){return this.type.name}get from(){return this.context.start+this.context.buffer.buffer[this.index+1]}get to(){return this.context.start+this.context.buffer.buffer[this.index+2]}constructor(e,t,s){super(),this.context=e,this._parent=t,this.index=s,this.type=e.buffer.set.types[e.buffer.buffer[s]]}child(e,t,s){let{buffer:n}=this.context,r=n.findChild(this.index+4,n.buffer[this.index+3],e,t-this.context.start,s);return r<0?null:new jt(this.context,this,r)}get firstChild(){return this.child(1,0,4)}get lastChild(){return this.child(-1,0,4)}childAfter(e){return this.child(1,e,2)}childBefore(e){return this.child(-1,e,-2)}prop(e){return this.type.prop(e)}enter(e,t,s=0){if(s&re.ExcludeBuffers)return null;let{buffer:n}=this.context,r=n.findChild(this.index+4,n.buffer[this.index+3],t>0?1:-1,e-this.context.start,t);return r<0?null:new jt(this.context,this,r)}get parent(){return this._parent||this.context.parent.nextSignificantParent()}externalSibling(e){return this._parent?null:this.context.parent.nextChild(this.context.index+e,e,0,4)}get nextSibling(){let{buffer:e}=this.context,t=e.buffer[this.index+3];return t<(this._parent?e.buffer[this._parent.index+3]:e.buffer.length)?new jt(this.context,this._parent,t):this.externalSibling(1)}get prevSibling(){let{buffer:e}=this.context,t=this._parent?this._parent.index+4:0;return this.index==t?this.externalSibling(-1):new jt(this.context,this._parent,e.findChild(t,this.index,-1,0,4))}get tree(){return null}toTree(){let e=[],t=[],{buffer:s}=this.context,n=this.index+4,r=s.buffer[this.index+3];if(r>n){let o=s.buffer[this.index+1];e.push(s.slice(n,r,o)),t.push(0)}return new ce(this.type,e,t,this.to-this.from)}toString(){return this.context.buffer.childString(this.index)}}function gf(i){if(!i.length)return null;let e=0,t=i[0];for(let r=1;r<i.length;r++){let o=i[r];(o.from>t.from||o.to<t.to)&&(t=o,e=r)}let s=t instanceof Ze&&t.index<0?null:t.parent,n=i.slice();return s?n[e]=s:n.splice(e,1),new Zb(n,t)}class Zb{constructor(e,t){this.heads=e,this.node=t}get next(){return gf(this.heads)}}function e0(i,e,t){let s=i.resolveInner(e,t),n=null;for(let r=s instanceof Ze?s:s.context.parent;r;r=r.parent)if(r.index<0){let o=r.parent;(n||(n=[s])).push(o.resolve(e,t)),r=o}else{let o=Es.get(r.tree);if(o&&o.overlay&&o.overlay[0].from<=e&&o.overlay[o.overlay.length-1].to>=e){let a=new Ze(o.tree,o.overlay[0].from+r.from,-1,r);(n||(n=[s])).push(Us(a,e,t,!1))}}return n?gf(n):s}class pa{get name(){return this.type.name}constructor(e,t=0){if(this.buffer=null,this.stack=[],this.index=0,this.bufferNode=null,this.mode=t&~re.EnterBracketed,e instanceof Ze)this.yieldNode(e);else{this._tree=e.context.parent,this.buffer=e.context;for(let s=e._parent;s;s=s._parent)this.stack.unshift(s.index);this.bufferNode=e,this.yieldBuf(e.index)}}yieldNode(e){return e?(this._tree=e,this.type=e.type,this.from=e.from,this.to=e.to,!0):!1}yieldBuf(e,t){this.index=e;let{start:s,buffer:n}=this.buffer;return this.type=t||n.set.types[n.buffer[e]],this.from=s+n.buffer[e+1],this.to=s+n.buffer[e+2],!0}yield(e){return e?e instanceof Ze?(this.buffer=null,this.yieldNode(e)):(this.buffer=e.context,this.yieldBuf(e.index,e.type)):!1}toString(){return this.buffer?this.buffer.buffer.childString(this.index):this._tree.toString()}enterChild(e,t,s){if(!this.buffer)return this.yield(this._tree.nextChild(e<0?this._tree._tree.children.length-1:0,e,t,s,this.mode));let{buffer:n}=this.buffer,r=n.findChild(this.index+4,n.buffer[this.index+3],e,t-this.buffer.start,s);return r<0?!1:(this.stack.push(this.index),this.yieldBuf(r))}firstChild(){return this.enterChild(1,0,4)}lastChild(){return this.enterChild(-1,0,4)}childAfter(e){return this.enterChild(1,e,2)}childBefore(e){return this.enterChild(-1,e,-2)}enter(e,t,s=this.mode){return this.buffer?s&re.ExcludeBuffers?!1:this.enterChild(1,e,t):this.yield(this._tree.enter(e,t,s))}parent(){if(!this.buffer)return this.yieldNode(this.mode&re.IncludeAnonymous?this._tree._parent:this._tree.parent);if(this.stack.length)return this.yieldBuf(this.stack.pop());let e=this.mode&re.IncludeAnonymous?this.buffer.parent:this.buffer.parent.nextSignificantParent();return this.buffer=null,this.yieldNode(e)}sibling(e){if(!this.buffer)return this._tree._parent?this.yield(this._tree.index<0?null:this._tree._parent.nextChild(this._tree.index+e,e,0,4,this.mode)):!1;let{buffer:t}=this.buffer,s=this.stack.length-1;if(e<0){let n=s<0?0:this.stack[s]+4;if(this.index!=n)return this.yieldBuf(t.findChild(n,this.index,-1,0,4))}else{let n=t.buffer[this.index+3];if(n<(s<0?t.buffer.length:t.buffer[this.stack[s]+3]))return this.yieldBuf(n)}return s<0?this.yield(this.buffer.parent.nextChild(this.buffer.index+e,e,0,4,this.mode)):!1}nextSibling(){return this.sibling(1)}prevSibling(){return this.sibling(-1)}atLastNode(e){let t,s,{buffer:n}=this;if(n){if(e>0){if(this.index<n.buffer.buffer.length)return!1}else for(let r=0;r<this.index;r++)if(n.buffer.buffer[r+3]<this.index)return!1;({index:t,parent:s}=n)}else({index:t,_parent:s}=this._tree);for(;s;{index:t,_parent:s}=s)if(t>-1)for(let r=t+e,o=e<0?-1:s._tree.children.length;r!=o;r+=e){let a=s._tree.children[r];if(this.mode&re.IncludeAnonymous||a instanceof ei||!a.type.isAnonymous||nl(a))return!1}return!0}move(e,t){if(t&&this.enterChild(e,0,4))return!0;for(;;){if(this.sibling(e))return!0;if(this.atLastNode(e)||!this.parent())return!1}}next(e=!0){return this.move(1,e)}prev(e=!0){return this.move(-1,e)}moveTo(e,t=0){for(;(this.from==this.to||(t<1?this.from>=e:this.from>e)||(t>-1?this.to<=e:this.to<e))&&this.parent(););for(;this.enterChild(1,e,t););return this}get node(){if(!this.buffer)return this._tree;let e=this.bufferNode,t=null,s=0;if(e&&e.context==this.buffer)e:for(let n=this.index,r=this.stack.length;r>=0;){for(let o=e;o;o=o._parent)if(o.index==n){if(n==this.index)return o;t=o,s=r+1;break e}n=this.stack[--r]}for(let n=s;n<this.stack.length;n++)t=new jt(this.buffer,t,this.stack[n]);return this.bufferNode=new jt(this.buffer,t,this.index)}get tree(){return this.buffer?null:this._tree._tree}iterate(e,t){for(let s=0;;){let n=!1;if(this.type.isAnonymous||e(this)!==!1){if(this.firstChild()){s++;continue}this.type.isAnonymous||(n=!0)}for(;;){if(n&&t&&t(this),n=this.type.isAnonymous,!s)return;if(this.nextSibling())break;this.parent(),s--,n=!0}}}matchContext(e){if(!this.buffer)return ua(this.node.parent,e);let{buffer:t}=this.buffer,{types:s}=t.set;for(let n=e.length-1,r=this.stack.length-1;n>=0;r--){if(r<0)return ua(this._tree,e,n);let o=s[t.buffer[this.stack[r]]];if(!o.isAnonymous){if(e[n]&&e[n]!=o.name)return!1;n--}}return!0}}function nl(i){return i.children.some(e=>e instanceof ei||!e.type.isAnonymous||nl(e))}function t0(i){var e;let{buffer:t,nodeSet:s,maxBufferLength:n=ff,reused:r=[],minRepeatType:o=s.types.length}=i,a=Array.isArray(t)?new sl(t,t.length):t,l=s.types,h=0,c=0;function d(A,$,P,I,W,J){let{id:F,start:_,end:j,size:U}=a,Z=c,Te=h;if(U<0)if(a.next(),U==-1){let Pt=r[F];P.push(Pt),I.push(_-A);return}else if(U==-3){h=F;return}else if(U==-4){c=F;return}else throw new RangeError(`Unrecognized record size: ${U}`);let He=l[F],dt,we,Xe=_-A;if(j-_<=n&&(we=b(a.pos-$,W))){let Pt=new Uint16Array(we.size-we.skip),Je=a.pos-we.size,ft=Pt.length;for(;a.pos>Je;)ft=x(we.start,Pt,ft);dt=new ei(Pt,j-we.start,s),Xe=we.start-A}else{let Pt=a.pos-U;a.next();let Je=[],ft=[],ai=F>=o?F:-1,Ii=0,pn=j;for(;a.pos>Pt;)ai>=0&&a.id==ai&&a.size>=0?(a.end<=pn-n&&(p(Je,ft,_,Ii,a.end,pn,ai,Z,Te),Ii=Je.length,pn=a.end),a.next()):J>2500?f(_,Pt,Je,ft):d(_,Pt,Je,ft,ai,J+1);if(ai>=0&&Ii>0&&Ii<Je.length&&p(Je,ft,_,Ii,_,pn,ai,Z,Te),Je.reverse(),ft.reverse(),ai>-1&&Ii>0){let Cl=u(He,Te);dt=rl(He,Je,ft,0,Je.length,0,j-_,Cl,Cl)}else dt=m(He,Je,ft,j-_,Z-j,Te)}P.push(dt),I.push(Xe)}function f(A,$,P,I){let W=[],J=0,F=-1;for(;a.pos>$;){let{id:_,start:j,end:U,size:Z}=a;if(Z>4)a.next();else{if(F>-1&&j<F)break;F<0&&(F=U-n),W.push(_,j,U),J++,a.next()}}if(J){let _=new Uint16Array(J*4),j=W[W.length-2];for(let U=W.length-3,Z=0;U>=0;U-=3)_[Z++]=W[U],_[Z++]=W[U+1]-j,_[Z++]=W[U+2]-j,_[Z++]=Z;P.push(new ei(_,W[2]-j,s)),I.push(j-A)}}function u(A,$){return(P,I,W)=>{let J=0,F=P.length-1,_,j;if(F>=0&&(_=P[F])instanceof ce){if(!F&&_.type==A&&_.length==W)return _;(j=_.prop(z.lookAhead))&&(J=I[F]+_.length+j)}return m(A,P,I,W,J,$)}}function p(A,$,P,I,W,J,F,_,j){let U=[],Z=[];for(;A.length>I;)U.push(A.pop()),Z.push($.pop()+P-W);A.push(m(s.types[F],U,Z,J-W,_-J,j)),$.push(W-P)}function m(A,$,P,I,W,J,F){if(J){let _=[z.contextHash,J];F=F?[_].concat(F):[_]}if(W>25){let _=[z.lookAhead,W];F=F?[_].concat(F):[_]}return new ce(A,$,P,I,F)}function b(A,$){let P=a.fork(),I=0,W=0,J=0,F=P.end-n,_={size:0,start:0,skip:0};e:for(let j=P.pos-A;P.pos>j;){let U=P.size;if(P.id==$&&U>=0){_.size=I,_.start=W,_.skip=J,J+=4,I+=4,P.next();continue}let Z=P.pos-U;if(U<0||Z<j||P.start<F)break;let Te=P.id>=o?4:0,He=P.start;for(P.next();P.pos>Z;){if(P.size<0)if(P.size==-3||P.size==-4)Te+=4;else break e;else P.id>=o&&(Te+=4);P.next()}W=He,I+=U,J+=Te}return($<0||I==A)&&(_.size=I,_.start=W,_.skip=J),_.size>4?_:void 0}function x(A,$,P){let{id:I,start:W,end:J,size:F}=a;if(a.next(),F>=0&&I<o){let _=P;if(F>4){let j=a.pos-(F-4);for(;a.pos>j;)P=x(A,$,P)}$[--P]=_,$[--P]=J-A,$[--P]=W-A,$[--P]=I}else F==-3?h=I:F==-4&&(c=I);return P}let S=[],C=[];for(;a.pos>0;)d(i.start||0,i.bufferStart||0,S,C,-1,0);let R=(e=i.length)!==null&&e!==void 0?e:S.length?C[0]+S[0].length:0;return new ce(l[i.topID],S.reverse(),C.reverse(),R)}const Nh=new WeakMap;function Xn(i,e){if(!i.isAnonymous||e instanceof ei||e.type!=i)return 1;let t=Nh.get(e);if(t==null){t=1;for(let s of e.children){if(s.type!=i||!(s instanceof ce)){t=1;break}t+=Xn(i,s)}Nh.set(e,t)}return t}function rl(i,e,t,s,n,r,o,a,l){let h=0;for(let p=s;p<n;p++)h+=Xn(i,e[p]);let c=Math.ceil(h*1.5/8),d=[],f=[];function u(p,m,b,x,S){for(let C=b;C<x;){let R=C,A=m[C],$=Xn(i,p[C]);for(C++;C<x;C++){let P=Xn(i,p[C]);if($+P>=c)break;$+=P}if(C==R+1){if($>c){let P=p[R];u(P.children,P.positions,0,P.children.length,m[R]+S);continue}d.push(p[R])}else{let P=m[C-1]+p[C-1].length-A;d.push(rl(i,p,m,R,C,A,P,null,l))}f.push(A+S-r)}}return u(e,t,s,n,0),(a||l)(d,f,o)}class Ci{constructor(e,t,s,n,r=!1,o=!1){this.from=e,this.to=t,this.tree=s,this.offset=n,this.open=(r?1:0)|(o?2:0)}get openStart(){return(this.open&1)>0}get openEnd(){return(this.open&2)>0}static addTree(e,t=[],s=!1){let n=[new Ci(0,e.length,e,0,!1,s)];for(let r of t)r.to>e.length&&n.push(r);return n}static applyChanges(e,t,s=128){if(!t.length)return e;let n=[],r=1,o=e.length?e[0]:null;for(let a=0,l=0,h=0;;a++){let c=a<t.length?t[a]:null,d=c?c.fromA:1e9;if(d-l>=s)for(;o&&o.from<d;){let f=o;if(l>=f.from||d<=f.to||h){let u=Math.max(f.from,l)-h,p=Math.min(f.to,d)-h;f=u>=p?null:new Ci(u,p,f.tree,f.offset+h,a>0,!!c)}if(f&&n.push(f),o.to>d)break;o=r<e.length?e[r++]:null}if(!c)break;l=c.toA,h=c.toA-c.toB}return n}}class mf{startParse(e,t,s){return typeof e=="string"&&(e=new i0(e)),s=s?s.length?s.map(n=>new go(n.from,n.to)):[new go(0,0)]:[new go(0,e.length)],this.createParse(e,t||[],s)}parse(e,t,s){let n=this.startParse(e,t,s);for(;;){let r=n.advance();if(r)return r}}}class i0{constructor(e){this.string=e}get length(){return this.string.length}chunk(e){return this.string.slice(e)}get lineChunks(){return!1}read(e,t){return this.string.slice(e,t)}}new z({perNode:!0});let s0=0,Mt=class ga{constructor(e,t,s,n){this.name=e,this.set=t,this.base=s,this.modified=n,this.id=s0++}toString(){let{name:e}=this;for(let t of this.modified)t.name&&(e=`${t.name}(${e})`);return e}static define(e,t){let s=typeof e=="string"?e:"?";if(e instanceof ga&&(t=e),t!=null&&t.base)throw new Error("Can not derive from a modified tag");let n=new ga(s,[],null,[]);if(n.set.push(n),t)for(let r of t.set)n.set.push(r);return n}static defineModifier(e){let t=new dr(e);return s=>s.modified.indexOf(t)>-1?s:dr.get(s.base||s,s.modified.concat(t).sort((n,r)=>n.id-r.id))}},n0=0;class dr{constructor(e){this.name=e,this.instances=[],this.id=n0++}static get(e,t){if(!t.length)return e;let s=t[0].instances.find(a=>a.base==e&&r0(t,a.modified));if(s)return s;let n=[],r=new Mt(e.name,n,e,t);for(let a of t)a.instances.push(r);let o=o0(t);for(let a of e.set)if(!a.modified.length)for(let l of o)n.push(dr.get(a,l));return r}}function r0(i,e){return i.length==e.length&&i.every((t,s)=>t==e[s])}function o0(i){let e=[[]];for(let t=0;t<i.length;t++)for(let s=0,n=e.length;s<n;s++)e.push(e[s].concat(i[t]));return e.sort((t,s)=>s.length-t.length)}function bf(i){let e=Object.create(null);for(let t in i){let s=i[t];Array.isArray(s)||(s=[s]);for(let n of t.split(" "))if(n){let r=[],o=2,a=n;for(let d=0;;){if(a=="..."&&d>0&&d+3==n.length){o=1;break}let f=/^"(?:[^"\\]|\\.)*?"|[^\/!]+/.exec(a);if(!f)throw new RangeError("Invalid path: "+n);if(r.push(f[0]=="*"?"":f[0][0]=='"'?JSON.parse(f[0]):f[0]),d+=f[0].length,d==n.length)break;let u=n[d++];if(d==n.length&&u=="!"){o=0;break}if(u!="/")throw new RangeError("Invalid path: "+n);a=n.slice(d)}let l=r.length-1,h=r[l];if(!h)throw new RangeError("Invalid path: "+n);let c=new js(s,o,l>0?r.slice(0,l):null);e[h]=c.sort(e[h])}}return yf.add(e)}const yf=new z({combine(i,e){let t,s,n;for(;i||e;){if(!i||e&&i.depth>=e.depth?(n=e,e=e.next):(n=i,i=i.next),t&&t.mode==n.mode&&!n.context&&!t.context)continue;let r=new js(n.tags,n.mode,n.context);t?t.next=r:s=r,t=r}return s}});class js{constructor(e,t,s,n){this.tags=e,this.mode=t,this.context=s,this.next=n}get opaque(){return this.mode==0}get inherit(){return this.mode==1}sort(e){return!e||e.depth<this.depth?(this.next=e,this):(e.next=this.sort(e.next),e)}get depth(){return this.context?this.context.length:0}}js.empty=new js([],2,null);function xf(i,e){let t=Object.create(null);for(let r of i)if(!Array.isArray(r.tag))t[r.tag.id]=r.class;else for(let o of r.tag)t[o.id]=r.class;let{scope:s,all:n=null}=e||{};return{style:r=>{let o=n;for(let a of r)for(let l of a.set){let h=t[l.id];if(h){o=o?o+" "+h:h;break}}return o},scope:s}}function a0(i,e){let t=null;for(let s of i){let n=s.style(e);n&&(t=t?t+" "+n:n)}return t}function l0(i,e,t,s=0,n=i.length){let r=new h0(s,Array.isArray(e)?e:[e],t);r.highlightRange(i.cursor(),s,n,"",r.highlighters),r.flush(n)}class h0{constructor(e,t,s){this.at=e,this.highlighters=t,this.span=s,this.class=""}startSpan(e,t){t!=this.class&&(this.flush(e),e>this.at&&(this.at=e),this.class=t)}flush(e){e>this.at&&this.class&&this.span(this.at,e,this.class)}highlightRange(e,t,s,n,r){let{type:o,from:a,to:l}=e;if(a>=s||l<=t)return;o.isTop&&(r=this.highlighters.filter(u=>!u.scope||u.scope(o)));let h=n,c=c0(e)||js.empty,d=a0(r,c.tags);if(d&&(h&&(h+=" "),h+=d,c.mode==1&&(n+=(n?" ":"")+d)),this.startSpan(Math.max(t,a),h),c.opaque)return;let f=e.tree&&e.tree.prop(z.mounted);if(f&&f.overlay){let u=e.node.enter(f.overlay[0].from+a,1),p=this.highlighters.filter(b=>!b.scope||b.scope(f.tree.type)),m=e.firstChild();for(let b=0,x=a;;b++){let S=b<f.overlay.length?f.overlay[b]:null,C=S?S.from+a:l,R=Math.max(t,x),A=Math.min(s,C);if(R<A&&m)for(;e.from<A&&(this.highlightRange(e,R,A,n,r),this.startSpan(Math.min(A,e.to),h),!(e.to>=C||!e.nextSibling())););if(!S||C>s)break;x=S.to+a,x>t&&(this.highlightRange(u.cursor(),Math.max(t,S.from+a),Math.min(s,x),"",p),this.startSpan(Math.min(s,x),h))}m&&e.parent()}else if(e.firstChild()){f&&(n="");do if(!(e.to<=t)){if(e.from>=s)break;this.highlightRange(e,t,s,n,r),this.startSpan(Math.min(s,e.to),h)}while(e.nextSibling());e.parent()}}}function c0(i){let e=i.type.prop(yf);for(;e&&e.context&&!i.matchContext(e.context);)e=e.next;return e||null}const M=Mt.define,Dn=M(),Wt=M(),zh=M(Wt),Fh=M(Wt),qt=M(),En=M(qt),mo=M(qt),mt=M(),hi=M(mt),pt=M(),gt=M(),ma=M(),ys=M(ma),Rn=M(),v={comment:Dn,lineComment:M(Dn),blockComment:M(Dn),docComment:M(Dn),name:Wt,variableName:M(Wt),typeName:zh,tagName:M(zh),propertyName:Fh,attributeName:M(Fh),className:M(Wt),labelName:M(Wt),namespace:M(Wt),macroName:M(Wt),literal:qt,string:En,docString:M(En),character:M(En),attributeValue:M(En),number:mo,integer:M(mo),float:M(mo),bool:M(qt),regexp:M(qt),escape:M(qt),color:M(qt),url:M(qt),keyword:pt,self:M(pt),null:M(pt),atom:M(pt),unit:M(pt),modifier:M(pt),operatorKeyword:M(pt),controlKeyword:M(pt),definitionKeyword:M(pt),moduleKeyword:M(pt),operator:gt,derefOperator:M(gt),arithmeticOperator:M(gt),logicOperator:M(gt),bitwiseOperator:M(gt),compareOperator:M(gt),updateOperator:M(gt),definitionOperator:M(gt),typeOperator:M(gt),controlOperator:M(gt),punctuation:ma,separator:M(ma),bracket:ys,angleBracket:M(ys),squareBracket:M(ys),paren:M(ys),brace:M(ys),content:mt,heading:hi,heading1:M(hi),heading2:M(hi),heading3:M(hi),heading4:M(hi),heading5:M(hi),heading6:M(hi),contentSeparator:M(mt),list:M(mt),quote:M(mt),emphasis:M(mt),strong:M(mt),link:M(mt),monospace:M(mt),strikethrough:M(mt),inserted:M(),deleted:M(),changed:M(),invalid:M(),meta:Rn,documentMeta:M(Rn),annotation:M(Rn),processingInstruction:M(Rn),definition:Mt.defineModifier("definition"),constant:Mt.defineModifier("constant"),function:Mt.defineModifier("function"),standard:Mt.defineModifier("standard"),local:Mt.defineModifier("local"),special:Mt.defineModifier("special")};for(let i in v){let e=v[i];e instanceof Mt&&(e.name=i)}xf([{tag:v.link,class:"tok-link"},{tag:v.heading,class:"tok-heading"},{tag:v.emphasis,class:"tok-emphasis"},{tag:v.strong,class:"tok-strong"},{tag:v.keyword,class:"tok-keyword"},{tag:v.atom,class:"tok-atom"},{tag:v.bool,class:"tok-bool"},{tag:v.url,class:"tok-url"},{tag:v.labelName,class:"tok-labelName"},{tag:v.inserted,class:"tok-inserted"},{tag:v.deleted,class:"tok-deleted"},{tag:v.literal,class:"tok-literal"},{tag:v.string,class:"tok-string"},{tag:v.number,class:"tok-number"},{tag:[v.regexp,v.escape,v.special(v.string)],class:"tok-string2"},{tag:v.variableName,class:"tok-variableName"},{tag:v.local(v.variableName),class:"tok-variableName tok-local"},{tag:v.definition(v.variableName),class:"tok-variableName tok-definition"},{tag:v.special(v.variableName),class:"tok-variableName2"},{tag:v.definition(v.propertyName),class:"tok-propertyName tok-definition"},{tag:v.typeName,class:"tok-typeName"},{tag:v.namespace,class:"tok-namespace"},{tag:v.className,class:"tok-className"},{tag:v.macroName,class:"tok-macroName"},{tag:v.propertyName,class:"tok-propertyName"},{tag:v.operator,class:"tok-operator"},{tag:v.comment,class:"tok-comment"},{tag:v.meta,class:"tok-meta"},{tag:v.invalid,class:"tok-invalid"},{tag:v.punctuation,class:"tok-punctuation"}]);var bo;const Vi=new z;function d0(i){return D.define({combine:i?e=>e.concat(i):void 0})}const f0=new z;class nt{constructor(e,t,s=[],n=""){this.data=e,this.name=n,q.prototype.hasOwnProperty("tree")||Object.defineProperty(q.prototype,"tree",{get(){return $e(this)}}),this.parser=t,this.extension=[ti.of(this),q.languageData.of((r,o,a)=>{let l=Hh(r,o,a),h=l.type.prop(Vi);if(!h)return[];let c=r.facet(h),d=l.type.prop(f0);if(d){let f=l.resolve(o-l.from,a);for(let u of d)if(u.test(f,r)){let p=r.facet(u.facet);return u.type=="replace"?p:p.concat(c)}}return c})].concat(s)}isActiveAt(e,t,s=-1){return Hh(e,t,s).type.prop(Vi)==this.data}findRegions(e){let t=e.facet(ti);if((t==null?void 0:t.data)==this.data)return[{from:0,to:e.doc.length}];if(!t||!t.allowsNesting)return[];let s=[],n=(r,o)=>{if(r.prop(Vi)==this.data){s.push({from:o,to:o+r.length});return}let a=r.prop(z.mounted);if(a){if(a.tree.prop(Vi)==this.data){if(a.overlay)for(let l of a.overlay)s.push({from:l.from+o,to:l.to+o});else s.push({from:o,to:o+r.length});return}else if(a.overlay){let l=s.length;if(n(a.tree,a.overlay[0].from+o),s.length>l)return}}for(let l=0;l<r.children.length;l++){let h=r.children[l];h instanceof ce&&n(h,r.positions[l]+o)}};return n($e(e),0),s}get allowsNesting(){return!0}}nt.setState=N.define();function Hh(i,e,t){let s=i.facet(ti),n=$e(i).topNode;if(!s||s.allowsNesting)for(let r=n;r;r=r.enter(e,t,re.ExcludeBuffers|re.EnterBracketed))r.type.isTop&&(n=r);return n}class fr extends nt{constructor(e,t,s){super(e,t,[],s),this.parser=t}static define(e){let t=d0(e.languageData);return new fr(t,e.parser.configure({props:[Vi.add(s=>s.isTop?t:void 0)]}),e.name)}configure(e,t){return new fr(this.data,this.parser.configure(e),t||this.name)}get allowsNesting(){return this.parser.hasWrappers()}}function $e(i){let e=i.field(nt.state,!1);return e?e.tree:ce.empty}class u0{constructor(e){this.doc=e,this.cursorPos=0,this.string="",this.cursor=e.iter()}get length(){return this.doc.length}syncTo(e){return this.string=this.cursor.next(e-this.cursorPos).value,this.cursorPos=e+this.string.length,this.cursorPos-this.string.length}chunk(e){return this.syncTo(e),this.string}get lineChunks(){return!0}read(e,t){let s=this.cursorPos-this.string.length;return e<s||t>=this.cursorPos?this.doc.sliceString(e,t):this.string.slice(e-s,t-s)}}let xs=null;class ur{constructor(e,t,s=[],n,r,o,a,l){this.parser=e,this.state=t,this.fragments=s,this.tree=n,this.treeLen=r,this.viewport=o,this.skipped=a,this.scheduleOn=l,this.parse=null,this.tempSkipped=[]}static create(e,t,s){return new ur(e,t,[],ce.empty,0,s,[],null)}startParse(){return this.parser.startParse(new u0(this.state.doc),this.fragments)}work(e,t){return t!=null&&t>=this.state.doc.length&&(t=void 0),this.tree!=ce.empty&&this.isDone(t??this.state.doc.length)?(this.takeTree(),!0):this.withContext(()=>{var s;if(typeof e=="number"){let n=Date.now()+e;e=()=>Date.now()>n}for(this.parse||(this.parse=this.startParse()),t!=null&&(this.parse.stoppedAt==null||this.parse.stoppedAt>t)&&t<this.state.doc.length&&this.parse.stopAt(t);;){let n=this.parse.advance();if(n)if(this.fragments=this.withoutTempSkipped(Ci.addTree(n,this.fragments,this.parse.stoppedAt!=null)),this.treeLen=(s=this.parse.stoppedAt)!==null&&s!==void 0?s:this.state.doc.length,this.tree=n,this.parse=null,this.treeLen<(t??this.state.doc.length))this.parse=this.startParse();else return!0;if(e())return!1}})}takeTree(){let e,t;this.parse&&(e=this.parse.parsedPos)>=this.treeLen&&((this.parse.stoppedAt==null||this.parse.stoppedAt>e)&&this.parse.stopAt(e),this.withContext(()=>{for(;!(t=this.parse.advance()););}),this.treeLen=e,this.tree=t,this.fragments=this.withoutTempSkipped(Ci.addTree(this.tree,this.fragments,!0)),this.parse=null)}withContext(e){let t=xs;xs=this;try{return e()}finally{xs=t}}withoutTempSkipped(e){for(let t;t=this.tempSkipped.pop();)e=Wh(e,t.from,t.to);return e}changes(e,t){let{fragments:s,tree:n,treeLen:r,viewport:o,skipped:a}=this;if(this.takeTree(),!e.empty){let l=[];if(e.iterChangedRanges((h,c,d,f)=>l.push({fromA:h,toA:c,fromB:d,toB:f})),s=Ci.applyChanges(s,l),n=ce.empty,r=0,o={from:e.mapPos(o.from,-1),to:e.mapPos(o.to,1)},this.skipped.length){a=[];for(let h of this.skipped){let c=e.mapPos(h.from,1),d=e.mapPos(h.to,-1);c<d&&a.push({from:c,to:d})}}}return new ur(this.parser,t,s,n,r,o,a,this.scheduleOn)}updateViewport(e){if(this.viewport.from==e.from&&this.viewport.to==e.to)return!1;this.viewport=e;let t=this.skipped.length;for(let s=0;s<this.skipped.length;s++){let{from:n,to:r}=this.skipped[s];n<e.to&&r>e.from&&(this.fragments=Wh(this.fragments,n,r),this.skipped.splice(s--,1))}return this.skipped.length>=t?!1:(this.reset(),!0)}reset(){this.parse&&(this.takeTree(),this.parse=null)}skipUntilInView(e,t){this.skipped.push({from:e,to:t})}static getSkippingParser(e){return new class extends mf{createParse(t,s,n){let r=n[0].from,o=n[n.length-1].to;return{parsedPos:r,advance(){let l=xs;if(l){for(let h of n)l.tempSkipped.push(h);e&&(l.scheduleOn=l.scheduleOn?Promise.all([l.scheduleOn,e]):e)}return this.parsedPos=o,new ce(Fe.none,[],[],o-r)},stoppedAt:null,stopAt(){}}}}}isDone(e){e=Math.min(e,this.state.doc.length);let t=this.fragments;return this.treeLen>=e&&t.length&&t[0].from==0&&t[0].to>=e}static get(){return xs}}function Wh(i,e,t){return Ci.applyChanges(i,[{fromA:e,toA:t,fromB:e,toB:t}])}class ls{constructor(e){this.context=e,this.tree=e.tree}apply(e){if(!e.docChanged&&this.tree==this.context.tree)return this;let t=this.context.changes(e.changes,e.state),s=this.context.treeLen==e.startState.doc.length?void 0:Math.max(e.changes.mapPos(this.context.treeLen),t.viewport.to);return t.work(20,s)||t.takeTree(),new ls(t)}static init(e){let t=Math.min(3e3,e.doc.length),s=ur.create(e.facet(ti).parser,e,{from:0,to:t});return s.work(20,t)||s.takeTree(),new ls(s)}}nt.state=Pe.define({create:ls.init,update(i,e){for(let t of e.effects)if(t.is(nt.setState))return t.value;return e.startState.facet(ti)!=e.state.facet(ti)?ls.init(e.state):i.apply(e)}});let vf=i=>{let e=setTimeout(()=>i(),500);return()=>clearTimeout(e)};typeof requestIdleCallback<"u"&&(vf=i=>{let e=-1,t=setTimeout(()=>{e=requestIdleCallback(i,{timeout:400})},100);return()=>e<0?clearTimeout(t):cancelIdleCallback(e)});const yo=typeof navigator<"u"&&(!((bo=navigator.scheduling)===null||bo===void 0)&&bo.isInputPending)?()=>navigator.scheduling.isInputPending():null,p0=de.fromClass(class{constructor(e){this.view=e,this.working=null,this.workScheduled=0,this.chunkEnd=-1,this.chunkBudget=-1,this.work=this.work.bind(this),this.scheduleWork()}update(e){let t=this.view.state.field(nt.state).context;(t.updateViewport(e.view.viewport)||this.view.viewport.to>t.treeLen)&&this.scheduleWork(),(e.docChanged||e.selectionSet)&&(this.view.hasFocus&&(this.chunkBudget+=50),this.scheduleWork()),this.checkAsyncSchedule(t)}scheduleWork(){if(this.working)return;let{state:e}=this.view,t=e.field(nt.state);(t.tree!=t.context.tree||!t.context.isDone(e.doc.length))&&(this.working=vf(this.work))}work(e){this.working=null;let t=Date.now();if(this.chunkEnd<t&&(this.chunkEnd<0||this.view.hasFocus)&&(this.chunkEnd=t+3e4,this.chunkBudget=3e3),this.chunkBudget<=0)return;let{state:s,viewport:{to:n}}=this.view,r=s.field(nt.state);if(r.tree==r.context.tree&&r.context.isDone(n+1e5))return;let o=Date.now()+Math.min(this.chunkBudget,100,e&&!yo?Math.max(25,e.timeRemaining()-5):1e9),a=r.context.treeLen<n&&s.doc.length>n+1e3,l=r.context.work(()=>yo&&yo()||Date.now()>o,n+(a?0:1e5));this.chunkBudget-=Date.now()-t,(l||this.chunkBudget<=0)&&(r.context.takeTree(),this.view.dispatch({effects:nt.setState.of(new ls(r.context))})),this.chunkBudget>0&&!(l&&!a)&&this.scheduleWork(),this.checkAsyncSchedule(r.context)}checkAsyncSchedule(e){e.scheduleOn&&(this.workScheduled++,e.scheduleOn.then(()=>this.scheduleWork()).catch(t=>Ie(this.view.state,t)).then(()=>this.workScheduled--),e.scheduleOn=null)}destroy(){this.working&&this.working()}isWorking(){return!!(this.working||this.workScheduled>0)}},{eventHandlers:{focus(){this.scheduleWork()}}}),ti=D.define({combine(i){return i.length?i[0]:null},enables:i=>[nt.state,p0,E.contentAttributes.compute([i],e=>{let t=e.facet(i);return t&&t.name?{"data-language":t.name}:{}})]});class g0{constructor(e,t=[]){this.language=e,this.support=t,this.extension=[e,t]}}const m0=D.define(),ol=D.define({combine:i=>{if(!i.length)return"  ";let e=i[0];if(!e||/\S/.test(e)||Array.from(e).some(t=>t!=e[0]))throw new Error("Invalid indent unit: "+JSON.stringify(i[0]));return e}});function pr(i){let e=i.facet(ol);return e.charCodeAt(0)==9?i.tabSize*e.length:e.length}function Xs(i,e){let t="",s=i.tabSize,n=i.facet(ol)[0];if(n=="	"){for(;e>=s;)t+="	",e-=s;n=" "}for(let r=0;r<e;r++)t+=n;return t}function al(i,e){i instanceof q&&(i=new Ir(i));for(let s of i.state.facet(m0)){let n=s(i,e);if(n!==void 0)return n}let t=$e(i.state);return t.length>=e?b0(i,t,e):null}class Ir{constructor(e,t={}){this.state=e,this.options=t,this.unit=pr(e)}lineAt(e,t=1){let s=this.state.doc.lineAt(e),{simulateBreak:n,simulateDoubleBreak:r}=this.options;return n!=null&&n>=s.from&&n<=s.to?r&&n==e?{text:"",from:e}:(t<0?n<e:n<=e)?{text:s.text.slice(n-s.from),from:n}:{text:s.text.slice(0,n-s.from),from:s.from}:s}textAfterPos(e,t=1){if(this.options.simulateDoubleBreak&&e==this.options.simulateBreak)return"";let{text:s,from:n}=this.lineAt(e,t);return s.slice(e-n,Math.min(s.length,e+100-n))}column(e,t=1){let{text:s,from:n}=this.lineAt(e,t),r=this.countColumn(s,e-n),o=this.options.overrideIndentation?this.options.overrideIndentation(n):-1;return o>-1&&(r+=o-this.countColumn(s,s.search(/\S|$/))),r}countColumn(e,t=e.length){return ds(e,this.state.tabSize,t)}lineIndent(e,t=1){let{text:s,from:n}=this.lineAt(e,t),r=this.options.overrideIndentation;if(r){let o=r(n);if(o>-1)return o}return this.countColumn(s,s.search(/\S|$/))}get simulatedBreak(){return this.options.simulateBreak||null}}const wf=new z;function b0(i,e,t){let s=e.resolveStack(t),n=e.resolveInner(t,-1).resolve(t,0).enterUnfinishedNodesBefore(t);if(n!=s.node){let r=[];for(let o=n;o&&!(o.from<s.node.from||o.to>s.node.to||o.from==s.node.from&&o.type==s.node.type);o=o.parent)r.push(o);for(let o=r.length-1;o>=0;o--)s={node:r[o],next:s}}return kf(s,i,t)}function kf(i,e,t){for(let s=i;s;s=s.next){let n=x0(s.node);if(n)return n(ll.create(e,t,s))}return 0}function y0(i){return i.pos==i.options.simulateBreak&&i.options.simulateDoubleBreak}function x0(i){let e=i.type.prop(wf);if(e)return e;let t=i.firstChild,s;if(t&&(s=t.type.prop(z.closedBy))){let n=i.lastChild,r=n&&s.indexOf(n.name)>-1;return o=>Sf(o,!0,1,void 0,r&&!y0(o)?n.from:void 0)}return i.parent==null?v0:null}function v0(){return 0}class ll extends Ir{constructor(e,t,s){super(e.state,e.options),this.base=e,this.pos=t,this.context=s}get node(){return this.context.node}static create(e,t,s){return new ll(e,t,s)}get textAfter(){return this.textAfterPos(this.pos)}get baseIndent(){return this.baseIndentFor(this.node)}baseIndentFor(e){let t=this.state.doc.lineAt(e.from);for(;;){let s=e.resolve(t.from);for(;s.parent&&s.parent.from==s.from;)s=s.parent;if(w0(s,e))break;t=this.state.doc.lineAt(s.from)}return this.lineIndent(t.from)}continue(){return kf(this.context.next,this.base,this.pos)}}function w0(i,e){for(let t=e;t;t=t.parent)if(i==t)return!0;return!1}function k0(i){let e=i.node,t=e.childAfter(e.from),s=e.lastChild;if(!t)return null;let n=i.options.simulateBreak,r=i.state.doc.lineAt(t.from),o=n==null||n<=r.from?r.to:Math.min(r.to,n);for(let a=t.to;;){let l=e.childAfter(a);if(!l||l==s)return null;if(!l.type.isSkipped){if(l.from>=o)return null;let h=/^ */.exec(r.text.slice(t.to-r.from))[0].length;return{from:t.from,to:t.to+h}}a=l.to}}function qh({closing:i,align:e=!0,units:t=1}){return s=>Sf(s,e,t,i)}function Sf(i,e,t,s,n){let r=i.textAfter,o=r.match(/^\s*/)[0].length,a=s&&r.slice(o,o+s.length)==s||n==i.pos+o,l=e?k0(i):null;return l?a?i.column(l.from):i.column(l.to):i.baseIndent+(a?0:i.unit*t)}const S0=200;function C0(){return q.transactionFilter.of(i=>{if(!i.docChanged||!i.isUserEvent("input.type")&&!i.isUserEvent("input.complete"))return i;let e=i.startState.languageDataAt("indentOnInput",i.startState.selection.main.head);if(!e.length)return i;let t=i.newDoc,{head:s}=i.newSelection.main,n=t.lineAt(s);if(s>n.from+S0)return i;let r=t.sliceString(n.from,s);if(!e.some(h=>h.test(r)))return i;let{state:o}=i,a=-1,l=[];for(let{head:h}of o.selection.ranges){let c=o.doc.lineAt(h);if(c.from==a)continue;a=c.from;let d=al(o,c.from);if(d==null)continue;let f=/^\s*/.exec(c.text)[0],u=Xs(o,d);f!=u&&l.push({from:c.from,to:c.from+f.length,insert:u})}return l.length?[i,{changes:l,sequential:!0}]:i})}const O0=D.define(),Cf=new z;function A0(i){let e=i.firstChild,t=i.lastChild;return e&&e.to<t.from?{from:e.to,to:t.type.isError?i.to:t.from}:null}function $0(i,e,t){let s=$e(i);if(s.length<t)return null;let n=s.resolveStack(t,1),r=null;for(let o=n;o;o=o.next){let a=o.node;if(a.to<=t||a.from>t)continue;if(r&&a.from<e)break;let l=a.type.prop(Cf);if(l&&(a.to<s.length-50||s.length==i.doc.length||!P0(a))){let h=l(a,i);h&&h.from<=t&&h.from>=e&&h.to>t&&(r=h)}}return r}function P0(i){let e=i.lastChild;return e&&e.to==i.to&&e.type.isError}function gr(i,e,t){for(let s of i.facet(O0)){let n=s(i,e,t);if(n)return n}return $0(i,e,t)}function Of(i,e){let t=e.mapPos(i.from,1),s=e.mapPos(i.to,-1);return t>=s?void 0:{from:t,to:s}}const Nr=N.define({map:Of}),hn=N.define({map:Of});function Af(i){let e=[];for(let{head:t}of i.state.selection.ranges)e.some(s=>s.from<=t&&s.to>=t)||e.push(i.lineBlockAt(t));return e}const Ei=Pe.define({create(){return L.none},update(i,e){e.isUserEvent("delete")&&e.changes.iterChangedRanges((t,s)=>i=Qh(i,t,s)),i=i.map(e.changes);for(let t of e.effects)if(t.is(Nr)&&!M0(i,t.value.from,t.value.to)){let{preparePlaceholder:s}=e.state.facet(Mf),n=s?L.replace({widget:new L0(s(e.state,t.value))}):Vh;i=i.update({add:[n.range(t.value.from,t.value.to)]})}else t.is(hn)&&(i=i.update({filter:(s,n)=>t.value.from!=s||t.value.to!=n,filterFrom:t.value.from,filterTo:t.value.to}));return e.selection&&(i=Qh(i,e.selection.main.head)),i},provide:i=>E.decorations.from(i),toJSON(i,e){let t=[];return i.between(0,e.doc.length,(s,n)=>{t.push(s,n)}),t},fromJSON(i){if(!Array.isArray(i)||i.length%2)throw new RangeError("Invalid JSON for fold state");let e=[];for(let t=0;t<i.length;){let s=i[t++],n=i[t++];if(typeof s!="number"||typeof n!="number")throw new RangeError("Invalid JSON for fold state");e.push(Vh.range(s,n))}return L.set(e,!0)}});function Qh(i,e,t=e){let s=!1;return i.between(e,t,(n,r)=>{n<t&&r>e&&(s=!0)}),s?i.update({filterFrom:e,filterTo:t,filter:(n,r)=>n>=t||r<=e}):i}function mr(i,e,t){var s;let n=null;return(s=i.field(Ei,!1))===null||s===void 0||s.between(e,t,(r,o)=>{(!n||n.from>r)&&(n={from:r,to:o})}),n}function M0(i,e,t){let s=!1;return i.between(e,e,(n,r)=>{n==e&&r==t&&(s=!0)}),s}function $f(i,e){return i.field(Ei,!1)?e:e.concat(N.appendConfig.of(Tf()))}const T0=i=>{for(let e of Af(i)){let t=gr(i.state,e.from,e.to);if(t)return i.dispatch({effects:$f(i.state,[Nr.of(t),Pf(i,t)])}),!0}return!1},D0=i=>{if(!i.state.field(Ei,!1))return!1;let e=[];for(let t of Af(i)){let s=mr(i.state,t.from,t.to);s&&e.push(hn.of(s),Pf(i,s,!1))}return e.length&&i.dispatch({effects:e}),e.length>0};function Pf(i,e,t=!0){let s=i.state.doc.lineAt(e.from).number,n=i.state.doc.lineAt(e.to).number;return E.announce.of(`${i.state.phrase(t?"Folded lines":"Unfolded lines")} ${s} ${i.state.phrase("to")} ${n}.`)}const E0=i=>{let{state:e}=i,t=[];for(let s=0;s<e.doc.length;){let n=i.lineBlockAt(s),r=gr(e,n.from,n.to);r&&t.push(Nr.of(r)),s=(r?i.lineBlockAt(r.to):n).to+1}return t.length&&i.dispatch({effects:$f(i.state,t)}),!!t.length},R0=i=>{let e=i.state.field(Ei,!1);if(!e||!e.size)return!1;let t=[];return e.between(0,i.state.doc.length,(s,n)=>{t.push(hn.of({from:s,to:n}))}),i.dispatch({effects:t}),!0},B0=[{key:"Ctrl-Shift-[",mac:"Cmd-Alt-[",run:T0},{key:"Ctrl-Shift-]",mac:"Cmd-Alt-]",run:D0},{key:"Ctrl-Alt-[",run:E0},{key:"Ctrl-Alt-]",run:R0}],_0={placeholderDOM:null,preparePlaceholder:null,placeholderText:"…"},Mf=D.define({combine(i){return At(i,_0)}});function Tf(i){return[Ei,z0]}function Df(i,e){let{state:t}=i,s=t.facet(Mf),n=o=>{let a=i.lineBlockAt(i.posAtDOM(o.target)),l=mr(i.state,a.from,a.to);l&&i.dispatch({effects:hn.of(l)}),o.preventDefault()};if(s.placeholderDOM)return s.placeholderDOM(i,n,e);let r=document.createElement("span");return r.textContent=s.placeholderText,r.setAttribute("aria-label",t.phrase("folded code")),r.title=t.phrase("unfold"),r.className="cm-foldPlaceholder",r.onclick=n,r}const Vh=L.replace({widget:new class extends Ht{toDOM(i){return Df(i,null)}}});class L0 extends Ht{constructor(e){super(),this.value=e}eq(e){return this.value==e.value}toDOM(e){return Df(e,this.value)}}const I0={openText:"⌄",closedText:"›",markerDOM:null,domEventHandlers:{},foldingChanged:()=>!1};class xo extends Lt{constructor(e,t){super(),this.config=e,this.open=t}eq(e){return this.config==e.config&&this.open==e.open}toDOM(e){if(this.config.markerDOM)return this.config.markerDOM(this.open);let t=document.createElement("span");return t.textContent=this.open?this.config.openText:this.config.closedText,t.title=e.state.phrase(this.open?"Fold line":"Unfold line"),t}}function N0(i={}){let e={...I0,...i},t=new xo(e,!0),s=new xo(e,!1),n=de.fromClass(class{constructor(o){this.from=o.viewport.from,this.markers=this.buildMarkers(o)}update(o){(o.docChanged||o.viewportChanged||o.startState.facet(ti)!=o.state.facet(ti)||o.startState.field(Ei,!1)!=o.state.field(Ei,!1)||$e(o.startState)!=$e(o.state)||e.foldingChanged(o))&&(this.markers=this.buildMarkers(o.view))}buildMarkers(o){let a=new Bt;for(let l of o.viewportLineBlocks){let h=mr(o.state,l.from,l.to)?s:gr(o.state,l.from,l.to)?t:null;h&&a.add(l.from,l.from,h)}return a.finish()}}),{domEventHandlers:r}=e;return[n,zb({class:"cm-foldGutter",markers(o){var a;return((a=o.plugin(n))===null||a===void 0?void 0:a.markers)||H.empty},initialSpacer(){return new xo(e,!1)},domEventHandlers:{...r,click:(o,a,l)=>{if(r.click&&r.click(o,a,l))return!0;let h=mr(o.state,a.from,a.to);if(h)return o.dispatch({effects:hn.of(h)}),!0;let c=gr(o.state,a.from,a.to);return c?(o.dispatch({effects:Nr.of(c)}),!0):!1}}}),Tf()]}const z0=E.baseTheme({".cm-foldPlaceholder":{backgroundColor:"#eee",border:"1px solid #ddd",color:"#888",borderRadius:".2em",margin:"0 1px",padding:"0 1px",cursor:"pointer"},".cm-foldGutter span":{padding:"0 1px",cursor:"pointer"}});class cn{constructor(e,t){this.specs=e;let s;function n(a){let l=Gt.newName();return(s||(s=Object.create(null)))["."+l]=a,l}const r=typeof t.all=="string"?t.all:t.all?n(t.all):void 0,o=t.scope;this.scope=o instanceof nt?a=>a.prop(Vi)==o.data:o?a=>a==o:void 0,this.style=xf(e.map(a=>({tag:a.tag,class:a.class||n(Object.assign({},a,{tag:null}))})),{all:r}).style,this.module=s?new Gt(s):null,this.themeType=t.themeType}static define(e,t){return new cn(e,t||{})}}const ba=D.define(),Ef=D.define({combine(i){return i.length?[i[0]]:null}});function vo(i){let e=i.facet(ba);return e.length?e:i.facet(Ef)}function Rf(i,e){let t=[H0],s;return i instanceof cn&&(i.module&&t.push(E.styleModule.of(i.module)),s=i.themeType),e!=null&&e.fallback?t.push(Ef.of(i)):s?t.push(ba.computeN([E.darkTheme],n=>n.facet(E.darkTheme)==(s=="dark")?[i]:[])):t.push(ba.of(i)),t}class F0{constructor(e){this.markCache=Object.create(null),this.tree=$e(e.state),this.decorations=this.buildDeco(e,vo(e.state)),this.decoratedTo=e.viewport.to}update(e){let t=$e(e.state),s=vo(e.state),n=s!=vo(e.startState),{viewport:r}=e.view,o=e.changes.mapPos(this.decoratedTo,1);t.length<r.to&&!n&&t.type==this.tree.type&&o>=r.to?(this.decorations=this.decorations.map(e.changes),this.decoratedTo=o):(t!=this.tree||e.viewportChanged||n)&&(this.tree=t,this.decorations=this.buildDeco(e.view,s),this.decoratedTo=r.to)}buildDeco(e,t){if(!t||!this.tree.length)return L.none;let s=new Bt;for(let{from:n,to:r}of e.visibleRanges)l0(this.tree,t,(o,a,l)=>{s.add(o,a,this.markCache[l]||(this.markCache[l]=L.mark({class:l})))},n,r);return s.finish()}}const H0=_i.high(de.fromClass(F0,{decorations:i=>i.decorations})),W0=cn.define([{tag:v.meta,color:"#404740"},{tag:v.link,textDecoration:"underline"},{tag:v.heading,textDecoration:"underline",fontWeight:"bold"},{tag:v.emphasis,fontStyle:"italic"},{tag:v.strong,fontWeight:"bold"},{tag:v.strikethrough,textDecoration:"line-through"},{tag:v.keyword,color:"#708"},{tag:[v.atom,v.bool,v.url,v.contentSeparator,v.labelName],color:"#219"},{tag:[v.literal,v.inserted],color:"#164"},{tag:[v.string,v.deleted],color:"#a11"},{tag:[v.regexp,v.escape,v.special(v.string)],color:"#e40"},{tag:v.definition(v.variableName),color:"#00f"},{tag:v.local(v.variableName),color:"#30a"},{tag:[v.typeName,v.namespace],color:"#085"},{tag:v.className,color:"#167"},{tag:[v.special(v.variableName),v.macroName],color:"#256"},{tag:v.definition(v.propertyName),color:"#00c"},{tag:v.comment,color:"#940"},{tag:v.invalid,color:"#f00"}]),q0=E.baseTheme({"&.cm-focused .cm-matchingBracket":{backgroundColor:"#328c8252"},"&.cm-focused .cm-nonmatchingBracket":{backgroundColor:"#bb555544"}}),Bf=1e4,_f="()[]{}",Lf=D.define({combine(i){return At(i,{afterCursor:!0,brackets:_f,maxScanDistance:Bf,renderMatch:U0})}}),Q0=L.mark({class:"cm-matchingBracket"}),V0=L.mark({class:"cm-nonmatchingBracket"});function U0(i){let e=[],t=i.matched?Q0:V0;return e.push(t.range(i.start.from,i.start.to)),i.end&&e.push(t.range(i.end.from,i.end.to)),e}function Uh(i){let e=[],t=i.facet(Lf);for(let s of i.selection.ranges){if(!s.empty)continue;let n=wt(i,s.head,-1,t)||s.head>0&&wt(i,s.head-1,1,t)||t.afterCursor&&(wt(i,s.head,1,t)||s.head<i.doc.length&&wt(i,s.head+1,-1,t));n&&(e=e.concat(t.renderMatch(n,i)))}return L.set(e,!0)}const j0=de.fromClass(class{constructor(i){this.paused=!1,this.decorations=Uh(i.state)}update(i){(i.docChanged||i.selectionSet||this.paused)&&(i.view.composing?(this.decorations=this.decorations.map(i.changes),this.paused=!0):(this.decorations=Uh(i.state),this.paused=!1))}},{decorations:i=>i.decorations}),X0=[j0,q0];function J0(i={}){return[Lf.of(i),X0]}const K0=new z;function ya(i,e,t){let s=i.prop(e<0?z.openedBy:z.closedBy);if(s)return s;if(i.name.length==1){let n=t.indexOf(i.name);if(n>-1&&n%2==(e<0?1:0))return[t[n+e]]}return null}function xa(i){let e=i.type.prop(K0);return e?e(i.node):i}function wt(i,e,t,s={}){let n=s.maxScanDistance||Bf,r=s.brackets||_f,o=$e(i),a=o.resolveInner(e,t);for(let l=a;l;l=l.parent){let h=ya(l.type,t,r);if(h&&l.from<l.to){let c=xa(l);if(c&&(t>0?e>=c.from&&e<c.to:e>c.from&&e<=c.to))return G0(i,e,t,l,c,h,r)}}return Y0(i,e,t,o,a.type,n,r)}function G0(i,e,t,s,n,r,o){let a=s.parent,l={from:n.from,to:n.to},h=0,c=a==null?void 0:a.cursor();if(c&&(t<0?c.childBefore(s.from):c.childAfter(s.to)))do if(t<0?c.to<=s.from:c.from>=s.to){if(h==0&&r.indexOf(c.type.name)>-1&&c.from<c.to){let d=xa(c);return{start:l,end:d?{from:d.from,to:d.to}:void 0,matched:!0}}else if(ya(c.type,t,o))h++;else if(ya(c.type,-t,o)){if(h==0){let d=xa(c);return{start:l,end:d&&d.from<d.to?{from:d.from,to:d.to}:void 0,matched:!1}}h--}}while(t<0?c.prevSibling():c.nextSibling());return{start:l,matched:!1}}function Y0(i,e,t,s,n,r,o){if(t<0?!e:e==i.doc.length)return null;let a=t<0?i.sliceDoc(e-1,e):i.sliceDoc(e,e+1),l=o.indexOf(a);if(l<0||l%2==0!=t>0)return null;let h={from:t<0?e-1:e,to:t>0?e+1:e},c=i.doc.iterRange(e,t>0?i.doc.length:0),d=0;for(let f=0;!c.next().done&&f<=r;){let u=c.value;t<0&&(f+=u.length);let p=e+f*t;for(let m=t>0?0:u.length-1,b=t>0?u.length:-1;m!=b;m+=t){let x=o.indexOf(u[m]);if(!(x<0||s.resolveInner(p+m,1).type!=n))if(x%2==0==t>0)d++;else{if(d==1)return{start:h,end:{from:p+m,to:p+m+1},matched:x>>1==l>>1};d--}}t>0&&(f+=u.length)}return c.done?{start:h,matched:!1}:null}const Z0=Object.create(null),jh=[Fe.none],Xh=[],Jh=Object.create(null),ey=Object.create(null);for(let[i,e]of[["variable","variableName"],["variable-2","variableName.special"],["string-2","string.special"],["def","variableName.definition"],["tag","tagName"],["attribute","attributeName"],["type","typeName"],["builtin","variableName.standard"],["qualifier","modifier"],["error","invalid"],["header","heading"],["property","propertyName"]])ey[i]=ty(Z0,e);function wo(i,e){Xh.indexOf(i)>-1||(Xh.push(i),console.warn(e))}function ty(i,e){let t=[];for(let a of e.split(" ")){let l=[];for(let h of a.split(".")){let c=i[h]||v[h];c?typeof c=="function"?l.length?l=l.map(c):wo(h,`Modifier ${h} used at start of tag`):l.length?wo(h,`Tag ${h} used as modifier`):l=Array.isArray(c)?c:[c]:wo(h,`Unknown highlighting tag ${h}`)}for(let h of l)t.push(h)}if(!t.length)return 0;let s=e.replace(/ /g,"_"),n=s+" "+t.map(a=>a.id),r=Jh[n];if(r)return r.id;let o=Jh[n]=Fe.define({id:jh.length,name:s,props:[bf({[s]:t})]});return jh.push(o),o.id}G.RTL,G.LTR;const iy=i=>{let{state:e}=i,t=e.doc.lineAt(e.selection.main.from),s=cl(i.state,t.from);return s.line?sy(i):s.block?ry(i):!1};function hl(i,e){return({state:t,dispatch:s})=>{if(t.readOnly)return!1;let n=i(e,t);return n?(s(t.update(n)),!0):!1}}const sy=hl(ly,0),ny=hl(If,0),ry=hl((i,e)=>If(i,e,ay(e)),0);function cl(i,e){let t=i.languageDataAt("commentTokens",e,1);return t.length?t[0]:{}}const vs=50;function oy(i,{open:e,close:t},s,n){let r=i.sliceDoc(s-vs,s),o=i.sliceDoc(n,n+vs),a=/\s*$/.exec(r)[0].length,l=/^\s*/.exec(o)[0].length,h=r.length-a;if(r.slice(h-e.length,h)==e&&o.slice(l,l+t.length)==t)return{open:{pos:s-a,margin:a&&1},close:{pos:n+l,margin:l&&1}};let c,d;n-s<=2*vs?c=d=i.sliceDoc(s,n):(c=i.sliceDoc(s,s+vs),d=i.sliceDoc(n-vs,n));let f=/^\s*/.exec(c)[0].length,u=/\s*$/.exec(d)[0].length,p=d.length-u-t.length;return c.slice(f,f+e.length)==e&&d.slice(p,p+t.length)==t?{open:{pos:s+f+e.length,margin:/\s/.test(c.charAt(f+e.length))?1:0},close:{pos:n-u-t.length,margin:/\s/.test(d.charAt(p-1))?1:0}}:null}function ay(i){let e=[];for(let t of i.selection.ranges){let s=i.doc.lineAt(t.from),n=t.to<=s.to?s:i.doc.lineAt(t.to);n.from>s.from&&n.from==t.to&&(n=t.to==s.to+1?s:i.doc.lineAt(t.to-1));let r=e.length-1;r>=0&&e[r].to>s.from?e[r].to=n.to:e.push({from:s.from+/^\s*/.exec(s.text)[0].length,to:n.to})}return e}function If(i,e,t=e.selection.ranges){let s=t.map(r=>cl(e,r.from).block);if(!s.every(r=>r))return null;let n=t.map((r,o)=>oy(e,s[o],r.from,r.to));if(i!=2&&!n.every(r=>r))return{changes:e.changes(t.map((r,o)=>n[o]?[]:[{from:r.from,insert:s[o].open+" "},{from:r.to,insert:" "+s[o].close}]))};if(i!=1&&n.some(r=>r)){let r=[];for(let o=0,a;o<n.length;o++)if(a=n[o]){let l=s[o],{open:h,close:c}=a;r.push({from:h.pos-l.open.length,to:h.pos+h.margin},{from:c.pos-c.margin,to:c.pos+l.close.length})}return{changes:r}}return null}function ly(i,e,t=e.selection.ranges){let s=[],n=-1;e:for(let{from:r,to:o}of t){let a=s.length,l=1e9,h;for(let c=r;c<=o;){let d=e.doc.lineAt(c);if(h==null&&(h=cl(e,d.from).line,!h))continue e;if(d.from>n&&(r==o||o>d.from)){n=d.from;let f=/^\s*/.exec(d.text)[0].length,u=f==d.length,p=d.text.slice(f,f+h.length)==h?f:-1;f<d.text.length&&f<l&&(l=f),s.push({line:d,comment:p,token:h,indent:f,empty:u,single:!1})}c=d.to+1}if(l<1e9)for(let c=a;c<s.length;c++)s[c].indent<s[c].line.text.length&&(s[c].indent=l);s.length==a+1&&(s[a].single=!0)}if(i!=2&&s.some(r=>r.comment<0&&(!r.empty||r.single))){let r=[];for(let{line:a,token:l,indent:h,empty:c,single:d}of s)(d||!c)&&r.push({from:a.from+h,insert:l+" "});let o=e.changes(r);return{changes:o,selection:e.selection.map(o,1)}}else if(i!=1&&s.some(r=>r.comment>=0)){let r=[];for(let{line:o,comment:a,token:l}of s)if(a>=0){let h=o.from+a,c=h+l.length;o.text[c-o.from]==" "&&c++,r.push({from:h,to:c})}return{changes:r}}return null}const va=Ft.define(),hy=Ft.define(),cy=D.define(),Nf=D.define({combine(i){return At(i,{minDepth:100,newGroupDelay:500,joinToEvent:(e,t)=>t},{minDepth:Math.max,newGroupDelay:Math.min,joinToEvent:(e,t)=>(s,n)=>e(s,n)||t(s,n)})}}),zf=Pe.define({create(){return kt.empty},update(i,e){let t=e.state.facet(Nf),s=e.annotation(va);if(s){let l=Ne.fromTransaction(e,s.selection),h=s.side,c=h==0?i.undone:i.done;return l?c=br(c,c.length,t.minDepth,l):c=Wf(c,e.startState.selection),new kt(h==0?s.rest:c,h==0?c:s.rest)}let n=e.annotation(hy);if((n=="full"||n=="before")&&(i=i.isolate()),e.annotation(pe.addToHistory)===!1)return e.changes.empty?i:i.addMapping(e.changes.desc);let r=Ne.fromTransaction(e),o=e.annotation(pe.time),a=e.annotation(pe.userEvent);return r?i=i.addChanges(r,o,a,t,e):e.selection&&(i=i.addSelection(e.startState.selection,o,a,t.newGroupDelay)),(n=="full"||n=="after")&&(i=i.isolate()),i},toJSON(i){return{done:i.done.map(e=>e.toJSON()),undone:i.undone.map(e=>e.toJSON())}},fromJSON(i){return new kt(i.done.map(Ne.fromJSON),i.undone.map(Ne.fromJSON))}});function dy(i={}){return[zf,Nf.of(i),E.domEventHandlers({beforeinput(e,t){let s=e.inputType=="historyUndo"?Ff:e.inputType=="historyRedo"?wa:null;return s?(e.preventDefault(),s(t)):!1}})]}function zr(i,e){return function({state:t,dispatch:s}){if(!e&&t.readOnly)return!1;let n=t.field(zf,!1);if(!n)return!1;let r=n.pop(i,t,e);return r?(s(r),!0):!1}}const Ff=zr(0,!1),wa=zr(1,!1),fy=zr(0,!0),uy=zr(1,!0);class Ne{constructor(e,t,s,n,r){this.changes=e,this.effects=t,this.mapped=s,this.startSelection=n,this.selectionsAfter=r}setSelAfter(e){return new Ne(this.changes,this.effects,this.mapped,this.startSelection,e)}toJSON(){var e,t,s;return{changes:(e=this.changes)===null||e===void 0?void 0:e.toJSON(),mapped:(t=this.mapped)===null||t===void 0?void 0:t.toJSON(),startSelection:(s=this.startSelection)===null||s===void 0?void 0:s.toJSON(),selectionsAfter:this.selectionsAfter.map(n=>n.toJSON())}}static fromJSON(e){return new Ne(e.changes&&ue.fromJSON(e.changes),[],e.mapped&&St.fromJSON(e.mapped),e.startSelection&&k.fromJSON(e.startSelection),e.selectionsAfter.map(k.fromJSON))}static fromTransaction(e,t){let s=Ge;for(let n of e.startState.facet(cy)){let r=n(e);r.length&&(s=s.concat(r))}return!s.length&&e.changes.empty?null:new Ne(e.changes.invert(e.startState.doc),s,void 0,t||e.startState.selection,Ge)}static selection(e){return new Ne(void 0,Ge,void 0,void 0,e)}}function br(i,e,t,s){let n=e+1>t+20?e-t-1:0,r=i.slice(n,e);return r.push(s),r}function py(i,e){let t=[],s=!1;return i.iterChangedRanges((n,r)=>t.push(n,r)),e.iterChangedRanges((n,r,o,a)=>{for(let l=0;l<t.length;){let h=t[l++],c=t[l++];a>=h&&o<=c&&(s=!0)}}),s}function gy(i,e){return i.ranges.length==e.ranges.length&&i.ranges.filter((t,s)=>t.empty!=e.ranges[s].empty).length===0}function Hf(i,e){return i.length?e.length?i.concat(e):i:e}const Ge=[],my=200;function Wf(i,e){if(i.length){let t=i[i.length-1],s=t.selectionsAfter.slice(Math.max(0,t.selectionsAfter.length-my));return s.length&&s[s.length-1].eq(e)?i:(s.push(e),br(i,i.length-1,1e9,t.setSelAfter(s)))}else return[Ne.selection([e])]}function by(i){let e=i[i.length-1],t=i.slice();return t[i.length-1]=e.setSelAfter(e.selectionsAfter.slice(0,e.selectionsAfter.length-1)),t}function ko(i,e){if(!i.length)return i;let t=i.length,s=Ge;for(;t;){let n=yy(i[t-1],e,s);if(n.changes&&!n.changes.empty||n.effects.length){let r=i.slice(0,t);return r[t-1]=n,r}else e=n.mapped,t--,s=n.selectionsAfter}return s.length?[Ne.selection(s)]:Ge}function yy(i,e,t){let s=Hf(i.selectionsAfter.length?i.selectionsAfter.map(a=>a.map(e)):Ge,t);if(!i.changes)return Ne.selection(s);let n=i.changes.map(e),r=e.mapDesc(i.changes,!0),o=i.mapped?i.mapped.composeDesc(r):r;return new Ne(n,N.mapEffects(i.effects,e),o,i.startSelection.map(r),s)}const xy=/^(input\.type|delete)($|\.)/;class kt{constructor(e,t,s=0,n=void 0){this.done=e,this.undone=t,this.prevTime=s,this.prevUserEvent=n}isolate(){return this.prevTime?new kt(this.done,this.undone):this}addChanges(e,t,s,n,r){let o=this.done,a=o[o.length-1];return a&&a.changes&&!a.changes.empty&&e.changes&&(!s||xy.test(s))&&(!a.selectionsAfter.length&&t-this.prevTime<n.newGroupDelay&&n.joinToEvent(r,py(a.changes,e.changes))||s=="input.type.compose")?o=br(o,o.length-1,n.minDepth,new Ne(e.changes.compose(a.changes),Hf(N.mapEffects(e.effects,a.changes),a.effects),a.mapped,a.startSelection,Ge)):o=br(o,o.length,n.minDepth,e),new kt(o,Ge,t,s)}addSelection(e,t,s,n){let r=this.done.length?this.done[this.done.length-1].selectionsAfter:Ge;return r.length>0&&t-this.prevTime<n&&s==this.prevUserEvent&&s&&/^select($|\.)/.test(s)&&gy(r[r.length-1],e)?this:new kt(Wf(this.done,e),this.undone,t,s)}addMapping(e){return new kt(ko(this.done,e),ko(this.undone,e),this.prevTime,this.prevUserEvent)}pop(e,t,s){let n=e==0?this.done:this.undone;if(n.length==0)return null;let r=n[n.length-1],o=r.selectionsAfter[0]||(r.startSelection?r.startSelection.map(r.changes.invertedDesc,1):t.selection);if(s&&r.selectionsAfter.length)return t.update({selection:r.selectionsAfter[r.selectionsAfter.length-1],annotations:va.of({side:e,rest:by(n),selection:o}),userEvent:e==0?"select.undo":"select.redo",scrollIntoView:!0});if(r.changes){let a=n.length==1?Ge:n.slice(0,n.length-1);return r.mapped&&(a=ko(a,r.mapped)),t.update({changes:r.changes,selection:r.startSelection,effects:r.effects,annotations:va.of({side:e,rest:a,selection:o}),filter:!1,userEvent:e==0?"undo":"redo",scrollIntoView:!0})}else return null}}kt.empty=new kt(Ge,Ge);const vy=[{key:"Mod-z",run:Ff,preventDefault:!0},{key:"Mod-y",mac:"Mod-Shift-z",run:wa,preventDefault:!0},{linux:"Ctrl-Shift-z",run:wa,preventDefault:!0},{key:"Mod-u",run:fy,preventDefault:!0},{key:"Alt-u",mac:"Mod-Shift-u",run:uy,preventDefault:!0}];function fs(i,e){return k.create(i.ranges.map(e),i.mainIndex)}function ht(i,e){return i.update({selection:e,scrollIntoView:!0,userEvent:"select"})}function ct({state:i,dispatch:e},t){let s=fs(i.selection,t);return s.eq(i.selection,!0)?!1:(e(ht(i,s)),!0)}function Fr(i,e){return k.cursor(e?i.to:i.from)}function qf(i,e){return ct(i,t=>t.empty?i.moveByChar(t,e):Fr(t,e))}function Me(i){return i.textDirectionAt(i.state.selection.main.head)==G.LTR}const Qf=i=>qf(i,!Me(i)),Vf=i=>qf(i,Me(i));function Uf(i,e){return ct(i,t=>t.empty?i.moveByGroup(t,e):Fr(t,e))}const wy=i=>Uf(i,!Me(i)),ky=i=>Uf(i,Me(i));function Sy(i,e,t){if(e.type.prop(t))return!0;let s=e.to-e.from;return s&&(s>2||/[^\s,.;:]/.test(i.sliceDoc(e.from,e.to)))||e.firstChild}function Hr(i,e,t){let s=$e(i).resolveInner(e.head),n=t?z.closedBy:z.openedBy;for(let l=e.head;;){let h=t?s.childAfter(l):s.childBefore(l);if(!h)break;Sy(i,h,n)?s=h:l=t?h.to:h.from}let r=s.type.prop(n),o,a;return r&&(o=t?wt(i,s.from,1):wt(i,s.to,-1))&&o.matched?a=t?o.end.to:o.end.from:a=t?s.to:s.from,k.cursor(a,t?-1:1)}const Cy=i=>ct(i,e=>Hr(i.state,e,!Me(i))),Oy=i=>ct(i,e=>Hr(i.state,e,Me(i)));function jf(i,e){return ct(i,t=>{if(!t.empty)return Fr(t,e);let s=i.moveVertically(t,e);return s.head!=t.head?s:i.moveToLineBoundary(t,e)})}const Xf=i=>jf(i,!1),Jf=i=>jf(i,!0);function Kf(i){let e=i.scrollDOM.clientHeight<i.scrollDOM.scrollHeight-2,t=0,s=0,n;if(e){for(let r of i.state.facet(E.scrollMargins)){let o=r(i);o!=null&&o.top&&(t=Math.max(o==null?void 0:o.top,t)),o!=null&&o.bottom&&(s=Math.max(o==null?void 0:o.bottom,s))}n=i.scrollDOM.clientHeight-t-s}else n=(i.dom.ownerDocument.defaultView||window).innerHeight;return{marginTop:t,marginBottom:s,selfScroll:e,height:Math.max(i.defaultLineHeight,n-5)}}function Gf(i,e){let t=Kf(i),{state:s}=i,n=fs(s.selection,o=>o.empty?i.moveVertically(o,e,t.height):Fr(o,e));if(n.eq(s.selection))return!1;let r;if(t.selfScroll){let o=i.coordsAtPos(s.selection.main.head),a=i.scrollDOM.getBoundingClientRect(),l=a.top+t.marginTop,h=a.bottom-t.marginBottom;o&&o.top>l&&o.bottom<h&&(r=E.scrollIntoView(n.main.head,{y:"start",yMargin:o.top-l}))}return i.dispatch(ht(s,n),{effects:r}),!0}const Kh=i=>Gf(i,!1),ka=i=>Gf(i,!0);function ri(i,e,t){let s=i.lineBlockAt(e.head),n=i.moveToLineBoundary(e,t);if(n.head==e.head&&n.head!=(t?s.to:s.from)&&(n=i.moveToLineBoundary(e,t,!1)),!t&&n.head==s.from&&s.length){let r=/^\s*/.exec(i.state.sliceDoc(s.from,Math.min(s.from+100,s.to)))[0].length;r&&e.head!=s.from+r&&(n=k.cursor(s.from+r))}return n}const Ay=i=>ct(i,e=>ri(i,e,!0)),$y=i=>ct(i,e=>ri(i,e,!1)),Py=i=>ct(i,e=>ri(i,e,!Me(i))),My=i=>ct(i,e=>ri(i,e,Me(i))),Ty=i=>ct(i,e=>k.cursor(i.lineBlockAt(e.head).from,1)),Dy=i=>ct(i,e=>k.cursor(i.lineBlockAt(e.head).to,-1));function Ey(i,e,t){let s=!1,n=fs(i.selection,r=>{let o=wt(i,r.head,-1)||wt(i,r.head,1)||r.head>0&&wt(i,r.head-1,1)||r.head<i.doc.length&&wt(i,r.head+1,-1);if(!o||!o.end)return r;s=!0;let a=o.start.from==r.head?o.end.to:o.end.from;return k.cursor(a)});return s?(e(ht(i,n)),!0):!1}const Ry=({state:i,dispatch:e})=>Ey(i,e);function tt(i,e){let t=fs(i.state.selection,s=>{let n=e(s);return k.range(s.anchor,n.head,n.goalColumn,n.bidiLevel||void 0,n.assoc)});return t.eq(i.state.selection)?!1:(i.dispatch(ht(i.state,t)),!0)}function Yf(i,e){return tt(i,t=>i.moveByChar(t,e))}const Zf=i=>Yf(i,!Me(i)),eu=i=>Yf(i,Me(i));function tu(i,e){return tt(i,t=>i.moveByGroup(t,e))}const By=i=>tu(i,!Me(i)),_y=i=>tu(i,Me(i)),Ly=i=>tt(i,e=>Hr(i.state,e,!Me(i))),Iy=i=>tt(i,e=>Hr(i.state,e,Me(i)));function iu(i,e){return tt(i,t=>i.moveVertically(t,e))}const su=i=>iu(i,!1),nu=i=>iu(i,!0);function ru(i,e){return tt(i,t=>i.moveVertically(t,e,Kf(i).height))}const Gh=i=>ru(i,!1),Yh=i=>ru(i,!0),Ny=i=>tt(i,e=>ri(i,e,!0)),zy=i=>tt(i,e=>ri(i,e,!1)),Fy=i=>tt(i,e=>ri(i,e,!Me(i))),Hy=i=>tt(i,e=>ri(i,e,Me(i))),Wy=i=>tt(i,e=>k.cursor(i.lineBlockAt(e.head).from)),qy=i=>tt(i,e=>k.cursor(i.lineBlockAt(e.head).to)),Zh=({state:i,dispatch:e})=>(e(ht(i,{anchor:0})),!0),ec=({state:i,dispatch:e})=>(e(ht(i,{anchor:i.doc.length})),!0),tc=({state:i,dispatch:e})=>(e(ht(i,{anchor:i.selection.main.anchor,head:0})),!0),ic=({state:i,dispatch:e})=>(e(ht(i,{anchor:i.selection.main.anchor,head:i.doc.length})),!0),Qy=({state:i,dispatch:e})=>(e(i.update({selection:{anchor:0,head:i.doc.length},userEvent:"select"})),!0),Vy=({state:i,dispatch:e})=>{let t=Wr(i).map(({from:s,to:n})=>k.range(s,Math.min(n+1,i.doc.length)));return e(i.update({selection:k.create(t),userEvent:"select"})),!0},Uy=({state:i,dispatch:e})=>{let t=fs(i.selection,s=>{let n=$e(i),r=n.resolveStack(s.from,1);if(s.empty){let o=n.resolveStack(s.from,-1);o.node.from>=r.node.from&&o.node.to<=r.node.to&&(r=o)}for(let o=r;o;o=o.next){let{node:a}=o;if((a.from<s.from&&a.to>=s.to||a.to>s.to&&a.from<=s.from)&&o.next)return k.range(a.to,a.from)}return s});return t.eq(i.selection)?!1:(e(ht(i,t)),!0)};function ou(i,e){let{state:t}=i,s=t.selection,n=t.selection.ranges.slice();for(let r of t.selection.ranges){let o=t.doc.lineAt(r.head);if(e?o.to<i.state.doc.length:o.from>0)for(let a=r;;){let l=i.moveVertically(a,e);if(l.head<o.from||l.head>o.to){n.some(h=>h.head==l.head)||n.push(l);break}else{if(l.head==a.head)break;a=l}}}return n.length==s.ranges.length?!1:(i.dispatch(ht(t,k.create(n,n.length-1))),!0)}const jy=i=>ou(i,!1),Xy=i=>ou(i,!0),Jy=({state:i,dispatch:e})=>{let t=i.selection,s=null;return t.ranges.length>1?s=k.create([t.main]):t.main.empty||(s=k.create([k.cursor(t.main.head)])),s?(e(ht(i,s)),!0):!1};function dn(i,e){if(i.state.readOnly)return!1;let t="delete.selection",{state:s}=i,n=s.changeByRange(r=>{let{from:o,to:a}=r;if(o==a){let l=e(r);l<o?(t="delete.backward",l=Bn(i,l,!1)):l>o&&(t="delete.forward",l=Bn(i,l,!0)),o=Math.min(o,l),a=Math.max(a,l)}else o=Bn(i,o,!1),a=Bn(i,a,!0);return o==a?{range:r}:{changes:{from:o,to:a},range:k.cursor(o,o<r.head?-1:1)}});return n.changes.empty?!1:(i.dispatch(s.update(n,{scrollIntoView:!0,userEvent:t,effects:t=="delete.selection"?E.announce.of(s.phrase("Selection deleted")):void 0})),!0)}function Bn(i,e,t){if(i instanceof E)for(let s of i.state.facet(E.atomicRanges).map(n=>n(i)))s.between(e,e,(n,r)=>{n<e&&r>e&&(e=t?r:n)});return e}const au=(i,e,t)=>dn(i,s=>{let n=s.from,{state:r}=i,o=r.doc.lineAt(n),a,l;if(t&&!e&&n>o.from&&n<o.from+200&&!/[^ \t]/.test(a=o.text.slice(0,n-o.from))){if(a[a.length-1]=="	")return n-1;let h=ds(a,r.tabSize),c=h%pr(r)||pr(r);for(let d=0;d<c&&a[a.length-1-d]==" ";d++)n--;l=n}else l=xe(o.text,n-o.from,e,e)+o.from,l==n&&o.number!=(e?r.doc.lines:1)?l+=e?1:-1:!e&&/[\ufe00-\ufe0f]/.test(o.text.slice(l-o.from,n-o.from))&&(l=xe(o.text,l-o.from,!1,!1)+o.from);return l}),Sa=i=>au(i,!1,!0),lu=i=>au(i,!0,!1),hu=(i,e)=>dn(i,t=>{let s=t.head,{state:n}=i,r=n.doc.lineAt(s),o=n.charCategorizer(s);for(let a=null;;){if(s==(e?r.to:r.from)){s==t.head&&r.number!=(e?n.doc.lines:1)&&(s+=e?1:-1);break}let l=xe(r.text,s-r.from,e)+r.from,h=r.text.slice(Math.min(s,l)-r.from,Math.max(s,l)-r.from),c=o(h);if(a!=null&&c!=a)break;(h!=" "||s!=t.head)&&(a=c),s=l}return s}),cu=i=>hu(i,!1),Ky=i=>hu(i,!0),Gy=i=>dn(i,e=>{let t=i.lineBlockAt(e.head).to;return e.head<t?t:Math.min(i.state.doc.length,e.head+1)}),Yy=i=>dn(i,e=>{let t=i.moveToLineBoundary(e,!1).head;return e.head>t?t:Math.max(0,e.head-1)}),Zy=i=>dn(i,e=>{let t=i.moveToLineBoundary(e,!0).head;return e.head<t?t:Math.min(i.state.doc.length,e.head+1)}),ex=({state:i,dispatch:e})=>{if(i.readOnly)return!1;let t=i.changeByRange(s=>({changes:{from:s.from,to:s.to,insert:V.of(["",""])},range:k.cursor(s.from)}));return e(i.update(t,{scrollIntoView:!0,userEvent:"input"})),!0},tx=({state:i,dispatch:e})=>{if(i.readOnly)return!1;let t=i.changeByRange(s=>{if(!s.empty||s.from==0||s.from==i.doc.length)return{range:s};let n=s.from,r=i.doc.lineAt(n),o=n==r.from?n-1:xe(r.text,n-r.from,!1)+r.from,a=n==r.to?n+1:xe(r.text,n-r.from,!0)+r.from;return{changes:{from:o,to:a,insert:i.doc.slice(n,a).append(i.doc.slice(o,n))},range:k.cursor(a)}});return t.changes.empty?!1:(e(i.update(t,{scrollIntoView:!0,userEvent:"move.character"})),!0)};function Wr(i){let e=[],t=-1;for(let s of i.selection.ranges){let n=i.doc.lineAt(s.from),r=i.doc.lineAt(s.to);if(!s.empty&&s.to==r.from&&(r=i.doc.lineAt(s.to-1)),t>=n.number){let o=e[e.length-1];o.to=r.to,o.ranges.push(s)}else e.push({from:n.from,to:r.to,ranges:[s]});t=r.number+1}return e}function du(i,e,t){if(i.readOnly)return!1;let s=[],n=[];for(let r of Wr(i)){if(t?r.to==i.doc.length:r.from==0)continue;let o=i.doc.lineAt(t?r.to+1:r.from-1),a=o.length+1;if(t){s.push({from:r.to,to:o.to},{from:r.from,insert:o.text+i.lineBreak});for(let l of r.ranges)n.push(k.range(Math.min(i.doc.length,l.anchor+a),Math.min(i.doc.length,l.head+a)))}else{s.push({from:o.from,to:r.from},{from:r.to,insert:i.lineBreak+o.text});for(let l of r.ranges)n.push(k.range(l.anchor-a,l.head-a))}}return s.length?(e(i.update({changes:s,scrollIntoView:!0,selection:k.create(n,i.selection.mainIndex),userEvent:"move.line"})),!0):!1}const ix=({state:i,dispatch:e})=>du(i,e,!1),sx=({state:i,dispatch:e})=>du(i,e,!0);function fu(i,e,t){if(i.readOnly)return!1;let s=[];for(let r of Wr(i))t?s.push({from:r.from,insert:i.doc.slice(r.from,r.to)+i.lineBreak}):s.push({from:r.to,insert:i.lineBreak+i.doc.slice(r.from,r.to)});let n=i.changes(s);return e(i.update({changes:n,selection:i.selection.map(n,t?1:-1),scrollIntoView:!0,userEvent:"input.copyline"})),!0}const nx=({state:i,dispatch:e})=>fu(i,e,!1),rx=({state:i,dispatch:e})=>fu(i,e,!0),ox=i=>{if(i.state.readOnly)return!1;let{state:e}=i,t=e.changes(Wr(e).map(({from:n,to:r})=>(n>0?n--:r<e.doc.length&&r++,{from:n,to:r}))),s=fs(e.selection,n=>{let r;if(i.lineWrapping){let o=i.lineBlockAt(n.head),a=i.coordsAtPos(n.head,n.assoc||1);a&&(r=o.bottom+i.documentTop-a.bottom+i.defaultLineHeight/2)}return i.moveVertically(n,!0,r)}).map(t);return i.dispatch({changes:t,selection:s,scrollIntoView:!0,userEvent:"delete.line"}),!0};function ax(i,e){if(/\(\)|\[\]|\{\}/.test(i.sliceDoc(e-1,e+1)))return{from:e,to:e};let t=$e(i).resolveInner(e),s=t.childBefore(e),n=t.childAfter(e),r;return s&&n&&s.to<=e&&n.from>=e&&(r=s.type.prop(z.closedBy))&&r.indexOf(n.name)>-1&&i.doc.lineAt(s.to).from==i.doc.lineAt(n.from).from&&!/\S/.test(i.sliceDoc(s.to,n.from))?{from:s.to,to:n.from}:null}const sc=uu(!1),lx=uu(!0);function uu(i){return({state:e,dispatch:t})=>{if(e.readOnly)return!1;let s=e.changeByRange(n=>{let{from:r,to:o}=n,a=e.doc.lineAt(r),l=!i&&r==o&&ax(e,r);i&&(r=o=(o<=a.to?a:e.doc.lineAt(o)).to);let h=new Ir(e,{simulateBreak:r,simulateDoubleBreak:!!l}),c=al(h,r);for(c==null&&(c=ds(/^\s*/.exec(e.doc.lineAt(r).text)[0],e.tabSize));o<a.to&&/\s/.test(a.text[o-a.from]);)o++;l?{from:r,to:o}=l:r>a.from&&r<a.from+100&&!/\S/.test(a.text.slice(0,r))&&(r=a.from);let d=["",Xs(e,c)];return l&&d.push(Xs(e,h.lineIndent(a.from,-1))),{changes:{from:r,to:o,insert:V.of(d)},range:k.cursor(r+1+d[1].length)}});return t(e.update(s,{scrollIntoView:!0,userEvent:"input"})),!0}}function dl(i,e){let t=-1;return i.changeByRange(s=>{let n=[];for(let o=s.from;o<=s.to;){let a=i.doc.lineAt(o);a.number>t&&(s.empty||s.to>a.from)&&(e(a,n,s),t=a.number),o=a.to+1}let r=i.changes(n);return{changes:n,range:k.range(r.mapPos(s.anchor,1),r.mapPos(s.head,1))}})}const hx=({state:i,dispatch:e})=>{if(i.readOnly)return!1;let t=Object.create(null),s=new Ir(i,{overrideIndentation:r=>{let o=t[r];return o??-1}}),n=dl(i,(r,o,a)=>{let l=al(s,r.from);if(l==null)return;/\S/.test(r.text)||(l=0);let h=/^\s*/.exec(r.text)[0],c=Xs(i,l);(h!=c||a.from<r.from+h.length)&&(t[r.from]=l,o.push({from:r.from,to:r.from+h.length,insert:c}))});return n.changes.empty||e(i.update(n,{userEvent:"indent"})),!0},cx=({state:i,dispatch:e})=>i.readOnly?!1:(e(i.update(dl(i,(t,s)=>{s.push({from:t.from,insert:i.facet(ol)})}),{userEvent:"input.indent"})),!0),dx=({state:i,dispatch:e})=>i.readOnly?!1:(e(i.update(dl(i,(t,s)=>{let n=/^\s*/.exec(t.text)[0];if(!n)return;let r=ds(n,i.tabSize),o=0,a=Xs(i,Math.max(0,r-pr(i)));for(;o<n.length&&o<a.length&&n.charCodeAt(o)==a.charCodeAt(o);)o++;s.push({from:t.from+o,to:t.from+n.length,insert:a.slice(o)})}),{userEvent:"delete.dedent"})),!0),fx=i=>(i.setTabFocusMode(),!0),ux=[{key:"Ctrl-b",run:Qf,shift:Zf,preventDefault:!0},{key:"Ctrl-f",run:Vf,shift:eu},{key:"Ctrl-p",run:Xf,shift:su},{key:"Ctrl-n",run:Jf,shift:nu},{key:"Ctrl-a",run:Ty,shift:Wy},{key:"Ctrl-e",run:Dy,shift:qy},{key:"Ctrl-d",run:lu},{key:"Ctrl-h",run:Sa},{key:"Ctrl-k",run:Gy},{key:"Ctrl-Alt-h",run:cu},{key:"Ctrl-o",run:ex},{key:"Ctrl-t",run:tx},{key:"Ctrl-v",run:ka}],px=[{key:"ArrowLeft",run:Qf,shift:Zf,preventDefault:!0},{key:"Mod-ArrowLeft",mac:"Alt-ArrowLeft",run:wy,shift:By,preventDefault:!0},{mac:"Cmd-ArrowLeft",run:Py,shift:Fy,preventDefault:!0},{key:"ArrowRight",run:Vf,shift:eu,preventDefault:!0},{key:"Mod-ArrowRight",mac:"Alt-ArrowRight",run:ky,shift:_y,preventDefault:!0},{mac:"Cmd-ArrowRight",run:My,shift:Hy,preventDefault:!0},{key:"ArrowUp",run:Xf,shift:su,preventDefault:!0},{mac:"Cmd-ArrowUp",run:Zh,shift:tc},{mac:"Ctrl-ArrowUp",run:Kh,shift:Gh},{key:"ArrowDown",run:Jf,shift:nu,preventDefault:!0},{mac:"Cmd-ArrowDown",run:ec,shift:ic},{mac:"Ctrl-ArrowDown",run:ka,shift:Yh},{key:"PageUp",run:Kh,shift:Gh},{key:"PageDown",run:ka,shift:Yh},{key:"Home",run:$y,shift:zy,preventDefault:!0},{key:"Mod-Home",run:Zh,shift:tc},{key:"End",run:Ay,shift:Ny,preventDefault:!0},{key:"Mod-End",run:ec,shift:ic},{key:"Enter",run:sc,shift:sc},{key:"Mod-a",run:Qy},{key:"Backspace",run:Sa,shift:Sa,preventDefault:!0},{key:"Delete",run:lu,preventDefault:!0},{key:"Mod-Backspace",mac:"Alt-Backspace",run:cu,preventDefault:!0},{key:"Mod-Delete",mac:"Alt-Delete",run:Ky,preventDefault:!0},{mac:"Mod-Backspace",run:Yy,preventDefault:!0},{mac:"Mod-Delete",run:Zy,preventDefault:!0}].concat(ux.map(i=>({mac:i.key,run:i.run,shift:i.shift}))),gx=[{key:"Alt-ArrowLeft",mac:"Ctrl-ArrowLeft",run:Cy,shift:Ly},{key:"Alt-ArrowRight",mac:"Ctrl-ArrowRight",run:Oy,shift:Iy},{key:"Alt-ArrowUp",run:ix},{key:"Shift-Alt-ArrowUp",run:nx},{key:"Alt-ArrowDown",run:sx},{key:"Shift-Alt-ArrowDown",run:rx},{key:"Mod-Alt-ArrowUp",run:jy},{key:"Mod-Alt-ArrowDown",run:Xy},{key:"Escape",run:Jy},{key:"Mod-Enter",run:lx},{key:"Alt-l",mac:"Ctrl-l",run:Vy},{key:"Mod-i",run:Uy,preventDefault:!0},{key:"Mod-[",run:dx},{key:"Mod-]",run:cx},{key:"Mod-Alt-\\",run:hx},{key:"Shift-Mod-k",run:ox},{key:"Shift-Mod-\\",run:Ry},{key:"Mod-/",run:iy},{key:"Alt-A",run:ny},{key:"Ctrl-m",mac:"Shift-Alt-m",run:fx}].concat(px),nc=typeof String.prototype.normalize=="function"?i=>i.normalize("NFKD"):i=>i;class hs{constructor(e,t,s=0,n=e.length,r,o){this.test=o,this.value={from:0,to:0,precise:!1},this.done=!1,this.matches=[],this.buffer="",this.bufferPos=0,this.iter=e.iterRange(s,n),this.bufferStart=s,this.normalize=r?a=>r(nc(a)):nc,this.query=this.normalize(t)}peek(){if(this.bufferPos==this.buffer.length){if(this.bufferStart+=this.buffer.length,this.iter.next(),this.iter.done)return-1;this.bufferPos=0,this.buffer=this.iter.value}return Be(this.buffer,this.bufferPos)}next(){for(;this.matches.length;)this.matches.pop();return this.nextOverlapping()}nextOverlapping(){for(;;){let e=this.peek();if(e<0)return this.done=!0,this;let t=La(e),s=this.bufferStart+this.bufferPos;this.bufferPos+=yt(e);let n=this.normalize(t);if(n.length)for(let r=0,o=s,a=!0;;r++){let l=n.charCodeAt(r),h=this.match(l,o,a,this.bufferPos+this.bufferStart,r==n.length-1);if(h)return this.value=h,this;if(r==n.length-1)break;a&&r<t.length&&t.charCodeAt(r)==l?o++:a=!1}}}match(e,t,s,n,r){let o=null;for(let a=0;a<this.matches.length;){let l=this.matches[a],h=!1;this.query.charCodeAt(l.index)==e&&(l.index==this.query.length-1?o={from:l.from,to:n,precise:r&&l.precise}:(l.index++,h=!0)),h?a++:this.matches.splice(a,1)}return this.query.charCodeAt(0)==e&&(this.query.length==1?o={from:t,to:n,precise:s&&r}:this.matches.push({from:t,index:1,precise:s})),o&&this.test&&!this.test(o.from,o.to,this.buffer,this.bufferStart)&&(o=null),o}}typeof Symbol<"u"&&(hs.prototype[Symbol.iterator]=function(){return this});const pu={from:-1,to:-1,match:/.*/.exec(""),precise:!0},fl="gm"+(/x/.unicode==null?"":"u");class gu{constructor(e,t,s,n=0,r=e.length){if(this.text=e,this.to=r,this.curLine="",this.done=!1,this.value=pu,/\\[sWDnr]|\n|\r|\[\^/.test(t))return new mu(e,t,s,n,r);this.re=new RegExp(t,fl+(s!=null&&s.ignoreCase?"i":"")),this.test=s==null?void 0:s.test,this.iter=e.iter();let o=e.lineAt(n);this.curLineStart=o.from,this.matchPos=yr(e,n),this.getLine(this.curLineStart)}getLine(e){this.iter.next(e),this.iter.lineBreak?this.curLine="":(this.curLine=this.iter.value,this.curLineStart+this.curLine.length>this.to&&(this.curLine=this.curLine.slice(0,this.to-this.curLineStart)),this.iter.next())}nextLine(){this.curLineStart=this.curLineStart+this.curLine.length+1,this.curLineStart>this.to?this.curLine="":this.getLine(0)}next(){for(let e=this.matchPos-this.curLineStart;;){this.re.lastIndex=e;let t=this.matchPos<=this.to&&this.re.exec(this.curLine);if(t){let s=this.curLineStart+t.index,n=s+t[0].length;if(this.matchPos=yr(this.text,n+(s==n?1:0)),s==this.curLineStart+this.curLine.length&&this.nextLine(),(s<n||s>this.value.to)&&(!this.test||this.test(s,n,t)))return this.value={from:s,to:n,precise:!0,match:t},this;e=this.matchPos-this.curLineStart}else if(this.curLineStart+this.curLine.length<this.to)this.nextLine(),e=0;else return this.done=!0,this}}}const So=new WeakMap;class Gi{constructor(e,t){this.from=e,this.text=t}get to(){return this.from+this.text.length}static get(e,t,s){let n=So.get(e);if(!n||n.from>=s||n.to<=t){let a=new Gi(t,e.sliceString(t,s));return So.set(e,a),a}if(n.from==t&&n.to==s)return n;let{text:r,from:o}=n;return o>t&&(r=e.sliceString(t,o)+r,o=t),n.to<s&&(r+=e.sliceString(n.to,s)),So.set(e,new Gi(o,r)),new Gi(t,r.slice(t-o,s-o))}}class mu{constructor(e,t,s,n,r){this.text=e,this.to=r,this.done=!1,this.value=pu,this.matchPos=yr(e,n),this.re=new RegExp(t,fl+(s!=null&&s.ignoreCase?"i":"")),this.test=s==null?void 0:s.test,this.flat=Gi.get(e,n,this.chunkEnd(n+5e3))}chunkEnd(e){return e>=this.to?this.to:this.text.lineAt(e).to}next(){for(;;){let e=this.re.lastIndex=this.matchPos-this.flat.from,t=this.re.exec(this.flat.text);if(t&&!t[0]&&t.index==e&&(this.re.lastIndex=e+1,t=this.re.exec(this.flat.text)),t){let s=this.flat.from+t.index,n=s+t[0].length;if((this.flat.to>=this.to||t.index+t[0].length<=this.flat.text.length-10)&&(!this.test||this.test(s,n,t)))return this.value={from:s,to:n,precise:!0,match:t},this.matchPos=yr(this.text,n+(s==n?1:0)),this}if(this.flat.to==this.to)return this.done=!0,this;this.flat=Gi.get(this.text,this.flat.from,this.chunkEnd(this.flat.from+this.flat.text.length*2))}}}typeof Symbol<"u"&&(gu.prototype[Symbol.iterator]=mu.prototype[Symbol.iterator]=function(){return this});function mx(i){try{return new RegExp(i,fl),!0}catch{return!1}}function yr(i,e){if(e>=i.length)return e;let t=i.lineAt(e),s;for(;e<t.to&&(s=t.text.charCodeAt(e-t.from))>=56320&&s<57344;)e++;return e}const bx=i=>{let{state:e}=i,t=String(e.doc.lineAt(i.state.selection.main.head).number),{close:s,result:n}=_b(i,{label:e.phrase("Go to line"),input:{type:"text",name:"line",value:t},focus:!0,submitLabel:e.phrase("go")});return n.then(r=>{let o=r&&/^([+-])?(\d+)?(:\d+)?(%)?$/.exec(r.elements.line.value);if(!o){i.dispatch({effects:s});return}let a=e.doc.lineAt(e.selection.main.head),[,l,h,c,d]=o,f=c?+c.slice(1):0,u=h?+h:a.number;if(h&&d){let b=u/100;l&&(b=b*(l=="-"?-1:1)+a.number/e.doc.lines),u=Math.round(e.doc.lines*b)}else h&&l&&(u=u*(l=="-"?-1:1)+a.number);let p=e.doc.line(Math.max(1,Math.min(e.doc.lines,u))),m=k.cursor(p.from+Math.max(0,Math.min(f,p.length)));i.dispatch({effects:[s,E.scrollIntoView(m.from,{y:"center"})],selection:m})}),!0},yx={highlightWordAroundCursor:!1,minSelectionLength:1,maxMatches:100,wholeWords:!1},xx=D.define({combine(i){return At(i,yx,{highlightWordAroundCursor:(e,t)=>e||t,minSelectionLength:Math.min,maxMatches:Math.min})}});function vx(i){return[Ox,Cx]}const wx=L.mark({class:"cm-selectionMatch"}),kx=L.mark({class:"cm-selectionMatch cm-selectionMatch-main"});function rc(i,e,t,s){return(t==0||i(e.sliceDoc(t-1,t))!=ie.Word)&&(s==e.doc.length||i(e.sliceDoc(s,s+1))!=ie.Word)}function Sx(i,e,t,s){return i(e.sliceDoc(t,t+1))==ie.Word&&i(e.sliceDoc(s-1,s))==ie.Word}const Cx=de.fromClass(class{constructor(i){this.decorations=this.getDeco(i)}update(i){(i.selectionSet||i.docChanged||i.viewportChanged)&&(this.decorations=this.getDeco(i.view))}getDeco(i){let e=i.state.facet(xx),{state:t}=i,s=t.selection;if(s.ranges.length>1)return L.none;let n=s.main,r,o=null;if(n.empty){if(!e.highlightWordAroundCursor)return L.none;let l=t.wordAt(n.head);if(!l)return L.none;o=t.charCategorizer(n.head),r=t.sliceDoc(l.from,l.to)}else{let l=n.to-n.from;if(l<e.minSelectionLength||l>200)return L.none;if(e.wholeWords){if(r=t.sliceDoc(n.from,n.to),o=t.charCategorizer(n.head),!(rc(o,t,n.from,n.to)&&Sx(o,t,n.from,n.to)))return L.none}else if(r=t.sliceDoc(n.from,n.to),!r)return L.none}let a=[];for(let l of i.visibleRanges){let h=new hs(t.doc,r,l.from,l.to);for(;!h.next().done;){let{from:c,to:d}=h.value;if((!o||rc(o,t,c,d))&&(n.empty&&c<=n.from&&d>=n.to?a.push(kx.range(c,d)):(c>=n.to||d<=n.from)&&a.push(wx.range(c,d)),a.length>e.maxMatches))return L.none}}return L.set(a)}},{decorations:i=>i.decorations}),Ox=E.baseTheme({".cm-selectionMatch":{backgroundColor:"#99ff7780"},".cm-searchMatch .cm-selectionMatch":{backgroundColor:"transparent"}}),Ax=({state:i,dispatch:e})=>{let{selection:t}=i,s=k.create(t.ranges.map(n=>i.wordAt(n.head)||k.cursor(n.head)),t.mainIndex);return s.eq(t)?!1:(e(i.update({selection:s})),!0)};function $x(i,e){let{main:t,ranges:s}=i.selection,n=i.wordAt(t.head),r=n&&n.from==t.from&&n.to==t.to;for(let o=!1,a=new hs(i.doc,e,s[s.length-1].to);;)if(a.next(),a.done){if(o)return null;a=new hs(i.doc,e,0,Math.max(0,s[s.length-1].from-1)),o=!0}else{if(o&&s.some(l=>l.from==a.value.from))continue;if(r){let l=i.wordAt(a.value.from);if(!l||l.from!=a.value.from||l.to!=a.value.to)continue}return a.value}}const Px=({state:i,dispatch:e})=>{let{ranges:t}=i.selection;if(t.some(r=>r.from===r.to))return Ax({state:i,dispatch:e});let s=i.sliceDoc(t[0].from,t[0].to);if(i.selection.ranges.some(r=>i.sliceDoc(r.from,r.to)!=s))return!1;let n=$x(i,s);return n?(e(i.update({selection:i.selection.addRange(k.range(n.from,n.to),!1),effects:E.scrollIntoView(n.to)})),!0):!1},us=D.define({combine(i){return At(i,{top:!1,caseSensitive:!1,literal:!1,regexp:!1,wholeWord:!1,createPanel:e=>new Wx(e),scrollToMatch:e=>E.scrollIntoView(e)})}});class bu{constructor(e){this.search=e.search,this.caseSensitive=!!e.caseSensitive,this.literal=!!e.literal,this.regexp=!!e.regexp,this.replace=e.replace||"",this.valid=!!this.search&&(!this.regexp||mx(this.search)),this.unquoted=this.unquote(this.search),this.wholeWord=!!e.wholeWord,this.test=e.test}unquote(e){return this.literal?e:e.replace(/\\([nrt\\])/g,(t,s)=>s=="n"?`
`:s=="r"?"\r":s=="t"?"	":"\\")}eq(e){return this.search==e.search&&this.replace==e.replace&&this.caseSensitive==e.caseSensitive&&this.regexp==e.regexp&&this.wholeWord==e.wholeWord&&this.test==e.test}create(){return this.regexp?new Bx(this):new Dx(this)}getCursor(e,t=0,s){let n=e.doc?e:q.create({doc:e});return s==null&&(s=n.doc.length),this.regexp?Hi(this,n,t,s):Fi(this,n,t,s)}}class yu{constructor(e){this.spec=e}}function Mx(i,e,t){return(s,n,r,o)=>{if(t&&!t(s,n,r,o))return!1;let a=s>=o&&n<=o+r.length?r.slice(s-o,n-o):e.doc.sliceString(s,n);return i(a,e,s,n)}}function Fi(i,e,t,s){let n;return i.wholeWord&&(n=Tx(e.doc,e.charCategorizer(e.selection.main.head))),i.test&&(n=Mx(i.test,e,n)),new hs(e.doc,i.unquoted,t,s,i.caseSensitive?void 0:r=>r.toLowerCase(),n)}function Tx(i,e){return(t,s,n,r)=>((r>t||r+n.length<s)&&(r=Math.max(0,t-2),n=i.sliceString(r,Math.min(i.length,s+2))),(e(xr(n,t-r))!=ie.Word||e(vr(n,t-r))!=ie.Word)&&(e(vr(n,s-r))!=ie.Word||e(xr(n,s-r))!=ie.Word))}class Dx extends yu{constructor(e){super(e)}nextMatch(e,t,s){let n=Fi(this.spec,e,s,e.doc.length).nextOverlapping();if(n.done){let r=Math.min(e.doc.length,t+this.spec.unquoted.length);n=Fi(this.spec,e,0,r).nextOverlapping()}return n.done||n.value.from==t&&n.value.to==s?null:n.value}prevMatchInRange(e,t,s){for(let n=s;;){let r=Math.max(t,n-1e4-this.spec.unquoted.length),o=Fi(this.spec,e,r,n),a=null;for(;!o.nextOverlapping().done;)a=o.value;if(a)return a;if(r==t)return null;n-=1e4}}prevMatch(e,t,s){let n=this.prevMatchInRange(e,0,t);return n||(n=this.prevMatchInRange(e,Math.max(0,s-this.spec.unquoted.length),e.doc.length)),n&&(n.from!=t||n.to!=s)?n:null}getReplacement(e){return this.spec.unquote(this.spec.replace)}matchAll(e,t){let s=Fi(this.spec,e,0,e.doc.length),n=[];for(;!s.next().done;){if(n.length>=t)return null;n.push(s.value)}return n}highlight(e,t,s,n){let r=Fi(this.spec,e,Math.max(0,t-this.spec.unquoted.length),Math.min(s+this.spec.unquoted.length,e.doc.length));for(;!r.next().done;)n(r.value.from,r.value.to)}}function Ex(i,e,t){return(s,n,r)=>(!t||t(s,n,r))&&i(r[0],e,s,n)}function Hi(i,e,t,s){let n;return i.wholeWord&&(n=Rx(e.charCategorizer(e.selection.main.head))),i.test&&(n=Ex(i.test,e,n)),new gu(e.doc,i.search,{ignoreCase:!i.caseSensitive,test:n},t,s)}function xr(i,e){return i.slice(xe(i,e,!1),e)}function vr(i,e){return i.slice(e,xe(i,e))}function Rx(i){return(e,t,s)=>!s[0].length||(i(xr(s.input,s.index))!=ie.Word||i(vr(s.input,s.index))!=ie.Word)&&(i(vr(s.input,s.index+s[0].length))!=ie.Word||i(xr(s.input,s.index+s[0].length))!=ie.Word)}class Bx extends yu{nextMatch(e,t,s){let n=Hi(this.spec,e,s,e.doc.length).next();return n.done&&(n=Hi(this.spec,e,0,t).next()),n.done?null:n.value}prevMatchInRange(e,t,s){for(let n=1;;n++){let r=Math.max(t,s-n*1e4),o=Hi(this.spec,e,r,s),a=null;for(;!o.next().done;)a=o.value;if(a&&(r==t||a.from>r+10))return a;if(r==t)return null}}prevMatch(e,t,s){return this.prevMatchInRange(e,0,t)||this.prevMatchInRange(e,s,e.doc.length)}getReplacement(e){return this.spec.unquote(this.spec.replace).replace(/\$([$&]|\d+)/g,(t,s)=>{if(s=="&")return e.match[0];if(s=="$")return"$";for(let n=s.length;n>0;n--){let r=+s.slice(0,n);if(r>0&&r<e.match.length)return e.match[r]+s.slice(n)}return t})}matchAll(e,t){let s=Hi(this.spec,e,0,e.doc.length),n=[];for(;!s.next().done;){if(n.length>=t)return null;n.push(s.value)}return n}highlight(e,t,s,n){let r=Hi(this.spec,e,Math.max(0,t-250),Math.min(s+250,e.doc.length));for(;!r.next().done;)n(r.value.from,r.value.to)}}const Js=N.define(),ul=N.define(),Jt=Pe.define({create(i){return new Co(Ca(i).create(),null)},update(i,e){for(let t of e.effects)t.is(Js)?i=new Co(t.value.create(),i.panel):t.is(ul)&&(i=new Co(i.query,t.value?pl:null));return i},provide:i=>Vs.from(i,e=>e.panel)});class Co{constructor(e,t){this.query=e,this.panel=t}}const _x=L.mark({class:"cm-searchMatch"}),Lx=L.mark({class:"cm-searchMatch cm-searchMatch-selected"}),Ix=de.fromClass(class{constructor(i){this.view=i,this.decorations=this.highlight(i.state.field(Jt))}update(i){let e=i.state.field(Jt);(e!=i.startState.field(Jt)||i.docChanged||i.selectionSet||i.viewportChanged)&&(this.decorations=this.highlight(e))}highlight({query:i,panel:e}){if(!e||!i.spec.valid)return L.none;let{view:t}=this,s=new Bt;for(let n=0,r=t.visibleRanges,o=r.length;n<o;n++){let{from:a,to:l}=r[n];for(;n<o-1&&l>r[n+1].from-500;)l=r[++n].to;i.highlight(t.state,a,l,(h,c)=>{let d=t.state.selection.ranges.some(f=>f.from==h&&f.to==c);s.add(h,c,d?Lx:_x)})}return s.finish()}},{decorations:i=>i.decorations});function fn(i){return e=>{let t=e.state.field(Jt,!1);return t&&t.query.spec.valid?i(e,t):wu(e)}}const wr=fn((i,{query:e})=>{let{to:t}=i.state.selection.main,s=e.nextMatch(i.state,t,t);if(!s)return!1;let n=k.single(s.from,s.to),r=i.state.facet(us);return i.dispatch({selection:n,effects:[gl(i,s),r.scrollToMatch(n.main,i)],userEvent:"select.search"}),vu(i),!0}),kr=fn((i,{query:e})=>{let{state:t}=i,{from:s}=t.selection.main,n=e.prevMatch(t,s,s);if(!n)return!1;let r=k.single(n.from,n.to),o=i.state.facet(us);return i.dispatch({selection:r,effects:[gl(i,n),o.scrollToMatch(r.main,i)],userEvent:"select.search"}),vu(i),!0}),Nx=fn((i,{query:e})=>{let t=e.matchAll(i.state,1e3);return!t||!t.length?!1:(i.dispatch({selection:k.create(t.map(s=>k.range(s.from,s.to))),userEvent:"select.search.matches"}),!0)}),zx=({state:i,dispatch:e})=>{let t=i.selection;if(t.ranges.length>1||t.main.empty)return!1;let{from:s,to:n}=t.main,r=[],o=0;for(let a=new hs(i.doc,i.sliceDoc(s,n));!a.next().done;){if(r.length>1e3)return!1;a.value.from==s&&(o=r.length),r.push(k.range(a.value.from,a.value.to))}return e(i.update({selection:k.create(r,o),userEvent:"select.search.matches"})),!0},oc=fn((i,{query:e})=>{let{state:t}=i,{from:s,to:n}=t.selection.main;if(t.readOnly)return!1;let r=e.nextMatch(t,s,s);if(!r)return!1;let o=r,a=[],l,h,c=[];o.precise?o.from==s&&o.to==n&&(h=t.toText(e.getReplacement(o)),a.push({from:o.from,to:o.to,insert:h}),c.push(E.announce.of(t.phrase("replaced match on line $",t.doc.lineAt(s).number)+"."))):o=e.nextMatch(t,o.from,o.to);let d=i.state.changes(a);return o&&(l=k.single(o.from,o.to).map(d),c.push(gl(i,o)),c.push(t.facet(us).scrollToMatch(l.main,i))),i.dispatch({changes:d,selection:l,effects:c,userEvent:"input.replace"}),!0}),Fx=fn((i,{query:e})=>{if(i.state.readOnly)return!1;let t=[];for(let n of e.matchAll(i.state,1e9)){let{from:r,to:o,precise:a}=n;a&&t.push({from:r,to:o,insert:e.getReplacement(n)})}if(!t.length)return!1;let s=i.state.phrase("replaced $ matches",t.length)+".";return i.dispatch({changes:t,effects:E.announce.of(s),userEvent:"input.replace.all"}),!0});function pl(i){return i.state.facet(us).createPanel(i)}function Ca(i,e){var t,s,n,r,o;let a=i.selection.main,l=a.empty||a.to>a.from+100?"":i.sliceDoc(a.from,a.to);if(e&&!l)return e;let h=i.facet(us);return new bu({search:((t=e==null?void 0:e.literal)!==null&&t!==void 0?t:h.literal)?l:l.replace(/\n/g,"\\n"),caseSensitive:(s=e==null?void 0:e.caseSensitive)!==null&&s!==void 0?s:h.caseSensitive,literal:(n=e==null?void 0:e.literal)!==null&&n!==void 0?n:h.literal,regexp:(r=e==null?void 0:e.regexp)!==null&&r!==void 0?r:h.regexp,wholeWord:(o=e==null?void 0:e.wholeWord)!==null&&o!==void 0?o:h.wholeWord})}function xu(i){let e=tl(i,pl);return e&&e.dom.querySelector("[main-field]")}function vu(i){let e=xu(i);e&&e==i.root.activeElement&&e.select()}const wu=i=>{let e=i.state.field(Jt,!1);if(e&&e.panel){let t=xu(i);if(t&&t!=i.root.activeElement){let s=Ca(i.state,e.query.spec);s.valid&&i.dispatch({effects:Js.of(s)}),t.focus(),t.select()}}else i.dispatch({effects:[ul.of(!0),e?Js.of(Ca(i.state,e.query.spec)):N.appendConfig.of(Qx)]});return!0},ku=i=>{let e=i.state.field(Jt,!1);if(!e||!e.panel)return!1;let t=tl(i,pl);return t&&t.dom.contains(i.root.activeElement)&&i.focus(),i.dispatch({effects:ul.of(!1)}),!0},Hx=[{key:"Mod-f",run:wu,scope:"editor search-panel"},{key:"F3",run:wr,shift:kr,scope:"editor search-panel",preventDefault:!0},{key:"Mod-g",run:wr,shift:kr,scope:"editor search-panel",preventDefault:!0},{key:"Escape",run:ku,scope:"editor search-panel"},{key:"Mod-Shift-l",run:zx},{key:"Mod-Alt-g",run:bx},{key:"Mod-d",run:Px,preventDefault:!0}];class Wx{constructor(e){this.view=e;let t=this.query=e.state.field(Jt).query.spec;this.commit=this.commit.bind(this),this.searchField=X("input",{value:t.search,placeholder:We(e,"Find"),"aria-label":We(e,"Find"),class:"cm-textfield",name:"search",form:"","main-field":"true",onchange:this.commit,onkeyup:this.commit}),this.replaceField=X("input",{value:t.replace,placeholder:We(e,"Replace"),"aria-label":We(e,"Replace"),class:"cm-textfield",name:"replace",form:"",onchange:this.commit,onkeyup:this.commit}),this.caseField=X("input",{type:"checkbox",name:"case",form:"",checked:t.caseSensitive,onchange:this.commit}),this.reField=X("input",{type:"checkbox",name:"re",form:"",checked:t.regexp,onchange:this.commit}),this.wordField=X("input",{type:"checkbox",name:"word",form:"",checked:t.wholeWord,onchange:this.commit});function s(n,r,o){return X("button",{class:"cm-button",name:n,onclick:r,type:"button"},o)}this.dom=X("div",{onkeydown:n=>this.keydown(n),class:"cm-search"},[this.searchField,s("next",()=>wr(e),[We(e,"next")]),s("prev",()=>kr(e),[We(e,"previous")]),s("select",()=>Nx(e),[We(e,"all")]),X("label",null,[this.caseField,We(e,"match case")]),X("label",null,[this.reField,We(e,"regexp")]),X("label",null,[this.wordField,We(e,"by word")]),...e.state.readOnly?[]:[X("br"),this.replaceField,s("replace",()=>oc(e),[We(e,"replace")]),s("replaceAll",()=>Fx(e),[We(e,"replace all")])],X("button",{name:"close",onclick:()=>ku(e),"aria-label":We(e,"close"),type:"button"},["×"])])}commit(){let e=new bu({search:this.searchField.value,caseSensitive:this.caseField.checked,regexp:this.reField.checked,wholeWord:this.wordField.checked,replace:this.replaceField.value});e.eq(this.query)||(this.query=e,this.view.dispatch({effects:Js.of(e)}))}keydown(e){jm(this.view,e,"search-panel")?e.preventDefault():e.keyCode==13&&e.target==this.searchField?(e.preventDefault(),(e.shiftKey?kr:wr)(this.view)):e.keyCode==13&&e.target==this.replaceField&&(e.preventDefault(),oc(this.view))}update(e){for(let t of e.transactions)for(let s of t.effects)s.is(Js)&&!s.value.eq(this.query)&&this.setQuery(s.value)}setQuery(e){this.query=e,this.searchField.value=e.search,this.replaceField.value=e.replace,this.caseField.checked=e.caseSensitive,this.reField.checked=e.regexp,this.wordField.checked=e.wholeWord}mount(){this.searchField.select()}get pos(){return 80}get top(){return this.view.state.facet(us).top}}function We(i,e){return i.state.phrase(e)}const _n=30,Ln=/[\s\.,:;?!]/;function gl(i,{from:e,to:t}){let s=i.state.doc.lineAt(e),n=i.state.doc.lineAt(t).to,r=Math.max(s.from,e-_n),o=Math.min(n,t+_n),a=i.state.sliceDoc(r,o);if(r!=s.from){for(let l=0;l<_n;l++)if(!Ln.test(a[l+1])&&Ln.test(a[l])){a=a.slice(l);break}}if(o!=n){for(let l=a.length-1;l>a.length-_n;l--)if(!Ln.test(a[l-1])&&Ln.test(a[l])){a=a.slice(0,l);break}}return E.announce.of(`${i.state.phrase("current match")}. ${a} ${i.state.phrase("on line")} ${s.number}.`)}const qx=E.baseTheme({".cm-panel.cm-search":{padding:"2px 6px 4px",position:"relative","& [name=close]":{position:"absolute",top:"0",right:"4px",backgroundColor:"inherit",border:"none",font:"inherit",padding:0,margin:0},"& input, & button, & label":{margin:".2em .6em .2em 0"},"& input[type=checkbox]":{marginRight:".2em"},"& label":{fontSize:"80%",whiteSpace:"pre"}},"&light .cm-searchMatch":{backgroundColor:"#ffff0054"},"&dark .cm-searchMatch":{backgroundColor:"#00ffff8a"},"&light .cm-searchMatch-selected":{backgroundColor:"#ff6a0054"},"&dark .cm-searchMatch-selected":{backgroundColor:"#ff00ff8a"}}),Qx=[Jt,_i.low(Ix),qx];class Su{constructor(e,t,s,n){this.state=e,this.pos=t,this.explicit=s,this.view=n,this.abortListeners=[],this.abortOnDocChange=!1}tokenBefore(e){let t=$e(this.state).resolveInner(this.pos,-1);for(;t&&e.indexOf(t.name)<0;)t=t.parent;return t?{from:t.from,to:this.pos,text:this.state.sliceDoc(t.from,this.pos),type:t.type}:null}matchBefore(e){let t=this.state.doc.lineAt(this.pos),s=Math.max(t.from,this.pos-250),n=t.text.slice(s-t.from,this.pos-t.from),r=n.search(Cu(e,!1));return r<0?null:{from:s+r,to:this.pos,text:n.slice(r)}}get aborted(){return this.abortListeners==null}addEventListener(e,t,s){e=="abort"&&this.abortListeners&&(this.abortListeners.push(t),s&&s.onDocChange&&(this.abortOnDocChange=!0))}}function ac(i){let e=Object.keys(i).join(""),t=/\w/.test(e);return t&&(e=e.replace(/\w/g,"")),`[${t?"\\w":""}${e.replace(/[^\w\s]/g,"\\$&")}]`}function Vx(i){let e=Object.create(null),t=Object.create(null);for(let{label:n}of i){e[n[0]]=!0;for(let r=1;r<n.length;r++)t[n[r]]=!0}let s=ac(e)+ac(t)+"*$";return[new RegExp("^"+s),new RegExp(s)]}function Ux(i){let e=i.map(n=>typeof n=="string"?{label:n}:n),[t,s]=e.every(n=>/^\w+$/.test(n.label))?[/\w*$/,/\w+$/]:Vx(e);return n=>{let r=n.matchBefore(s);return r||n.explicit?{from:r?r.from:n.pos,options:e,validFor:t}:null}}class lc{constructor(e,t,s,n){this.completion=e,this.source=t,this.match=s,this.score=n}}function Oi(i){return i.selection.main.from}function Cu(i,e){var t;let{source:s}=i,n=e&&s[0]!="^",r=s[s.length-1]!="$";return!n&&!r?i:new RegExp(`${n?"^":""}(?:${s})${r?"$":""}`,(t=i.flags)!==null&&t!==void 0?t:i.ignoreCase?"i":"")}const Ou=Ft.define();function jx(i,e,t,s){let{main:n}=i.selection,r=t-n.from,o=s-n.from;return{...i.changeByRange(a=>{if(a!=n&&t!=s&&i.sliceDoc(a.from+r,a.from+o)!=i.sliceDoc(t,s))return{range:a};let l=i.toText(e);return{changes:{from:a.from+r,to:s==n.from?a.to:a.from+o,insert:l},range:k.cursor(a.from+r+l.length)}}),scrollIntoView:!0,userEvent:"input.complete"}}const hc=new WeakMap;function Xx(i){if(!Array.isArray(i))return i;let e=hc.get(i);return e||hc.set(i,e=Ux(i)),e}const Sr=N.define(),Ks=N.define();class Jx{constructor(e){this.pattern=e,this.chars=[],this.folded=[],this.any=[],this.precise=[],this.byWord=[],this.score=0,this.matched=[];for(let t=0;t<e.length;){let s=Be(e,t),n=yt(s);this.chars.push(s);let r=e.slice(t,t+n),o=r.toUpperCase();this.folded.push(Be(o==r?r.toLowerCase():o,0)),t+=n}this.astral=e.length!=this.chars.length}ret(e,t){return this.score=e,this.matched=t,this}match(e){if(this.pattern.length==0)return this.ret(-100,[]);if(e.length<this.pattern.length)return null;let{chars:t,folded:s,any:n,precise:r,byWord:o}=this;if(t.length==1){let S=Be(e,0),C=yt(S),R=C==e.length?0:-100;if(S!=t[0])if(S==s[0])R+=-200;else return null;return this.ret(R,[0,C])}let a=e.indexOf(this.pattern);if(a==0)return this.ret(e.length==this.pattern.length?0:-100,[0,this.pattern.length]);let l=t.length,h=0;if(a<0){for(let S=0,C=Math.min(e.length,200);S<C&&h<l;){let R=Be(e,S);(R==t[h]||R==s[h])&&(n[h++]=S),S+=yt(R)}if(h<l)return null}let c=0,d=0,f=!1,u=0,p=-1,m=-1,b=/[a-z]/.test(e),x=!0;for(let S=0,C=Math.min(e.length,200),R=0;S<C&&d<l;){let A=Be(e,S);a<0&&(c<l&&A==t[c]&&(r[c++]=S),u<l&&(A==t[u]||A==s[u]?(u==0&&(p=S),m=S+1,u++):u=0));let $,P=A<255?A>=48&&A<=57||A>=97&&A<=122?2:A>=65&&A<=90?1:0:($=La(A))!=$.toLowerCase()?1:$!=$.toUpperCase()?2:0;(!S||P==1&&b||R==0&&P!=0)&&(t[d]==A||s[d]==A&&(f=!0)?o[d++]=S:o.length&&(x=!1)),R=P,S+=yt(A)}return d==l&&o[0]==0&&x?this.result(-100+(f?-200:0),o,e):u==l&&p==0?this.ret(-200-e.length+(m==e.length?0:-100),[0,m]):a>-1?this.ret(-700-e.length,[a,a+this.pattern.length]):u==l?this.ret(-900-e.length,[p,m]):d==l?this.result(-100+(f?-200:0)+-700+(x?0:-1100),o,e):t.length==2?null:this.result((n[0]?-700:0)+-200+-1100,n,e)}result(e,t,s){let n=[],r=0;for(let o of t){let a=o+(this.astral?yt(Be(s,o)):1);r&&n[r-1]==o?n[r-1]=a:(n[r++]=o,n[r++]=a)}return this.ret(e-s.length,n)}}class Kx{constructor(e){this.pattern=e,this.matched=[],this.score=0,this.folded=e.toLowerCase()}match(e){if(e.length<this.pattern.length)return null;let t=e.slice(0,this.pattern.length),s=t==this.pattern?0:t.toLowerCase()==this.folded?-200:null;return s==null?null:(this.matched=[0,t.length],this.score=s+(e.length==this.pattern.length?0:-100),this)}}const ye=D.define({combine(i){return At(i,{activateOnTyping:!0,activateOnCompletion:()=>!1,activateOnTypingDelay:100,selectOnOpen:!0,override:null,closeOnBlur:!0,maxRenderedOptions:100,defaultKeymap:!0,tooltipClass:()=>"",optionClass:()=>"",aboveCursor:!1,icons:!0,addToOptions:[],positionInfo:Gx,filterStrict:!1,compareCompletions:(e,t)=>(e.sortText||e.label).localeCompare(t.sortText||t.label),interactionDelay:75,updateSyncTime:100},{defaultKeymap:(e,t)=>e&&t,closeOnBlur:(e,t)=>e&&t,icons:(e,t)=>e&&t,tooltipClass:(e,t)=>s=>cc(e(s),t(s)),optionClass:(e,t)=>s=>cc(e(s),t(s)),addToOptions:(e,t)=>e.concat(t),filterStrict:(e,t)=>e||t})}});function cc(i,e){return i?e?i+" "+e:i:e}function Gx(i,e,t,s,n,r){let o=i.textDirection==G.RTL,a=o,l=!1,h="top",c,d,f=e.left-n.left,u=n.right-e.right,p=s.right-s.left,m=s.bottom-s.top;if(a&&f<Math.min(p,u)?a=!1:!a&&u<Math.min(p,f)&&(a=!0),p<=(a?f:u))c=Math.max(n.top,Math.min(t.top,n.bottom-m))-e.top,d=Math.min(400,a?f:u);else{l=!0,d=Math.min(400,(o?e.right:n.right-e.left)-30);let S=n.bottom-e.bottom;S>=m||S>e.top?c=t.bottom-e.top:(h="bottom",c=e.bottom-t.top)}let b=(e.bottom-e.top)/r.offsetHeight,x=(e.right-e.left)/r.offsetWidth;return{style:`${h}: ${c/b}px; max-width: ${d/x}px`,class:"cm-completionInfo-"+(l?o?"left-narrow":"right-narrow":a?"left":"right")}}const ml=N.define();function Yx(i){let e=i.addToOptions.slice();return i.icons&&e.push({render(t){let s=document.createElement("div");return s.classList.add("cm-completionIcon"),t.type&&s.classList.add(...t.type.split(/\s+/g).map(n=>"cm-completionIcon-"+n)),s.setAttribute("aria-hidden","true"),s},position:20}),e.push({render(t,s,n,r){let o=document.createElement("span");o.className="cm-completionLabel";let a=t.displayLabel||t.label,l=0;for(let h=0;h<r.length;){let c=r[h++],d=r[h++];c>l&&o.appendChild(document.createTextNode(a.slice(l,c)));let f=o.appendChild(document.createElement("span"));f.appendChild(document.createTextNode(a.slice(c,d))),f.className="cm-completionMatchedText",l=d}return l<a.length&&o.appendChild(document.createTextNode(a.slice(l))),o},position:50},{render(t){if(!t.detail)return null;let s=document.createElement("span");return s.className="cm-completionDetail",s.textContent=t.detail,s},position:80}),e.sort((t,s)=>t.position-s.position).map(t=>t.render)}function Oo(i,e,t){if(i<=t)return{from:0,to:i};if(e<0&&(e=0),e<=i>>1){let n=Math.floor(e/t);return{from:n*t,to:(n+1)*t}}let s=Math.floor((i-e)/t);return{from:i-(s+1)*t,to:i-s*t}}class Zx{constructor(e,t,s){this.view=e,this.stateField=t,this.applyCompletion=s,this.info=null,this.infoDestroy=null,this.placeInfoReq={read:()=>this.measureInfo(),write:l=>this.placeInfo(l),key:this},this.space=null,this.currentClass="";let n=e.state.field(t),{options:r,selected:o}=n.open,a=e.state.facet(ye);this.optionContent=Yx(a),this.optionClass=a.optionClass,this.tooltipClass=a.tooltipClass,this.range=Oo(r.length,o,a.maxRenderedOptions),this.dom=document.createElement("div"),this.dom.className="cm-tooltip-autocomplete",this.updateTooltipClass(e.state),this.dom.addEventListener("mousedown",l=>{let{options:h}=e.state.field(t).open;for(let c=l.target,d;c&&c!=this.dom;c=c.parentNode)if(c.nodeName=="LI"&&(d=/-(\d+)$/.exec(c.id))&&+d[1]<h.length){this.applyCompletion(e,h[+d[1]]),l.preventDefault();return}if(l.target==this.list){let c=this.list.classList.contains("cm-completionListIncompleteTop")&&l.clientY<this.list.firstChild.getBoundingClientRect().top?this.range.from-1:this.list.classList.contains("cm-completionListIncompleteBottom")&&l.clientY>this.list.lastChild.getBoundingClientRect().bottom?this.range.to:null;c!=null&&(e.dispatch({effects:ml.of(c)}),l.preventDefault())}}),this.dom.addEventListener("focusout",l=>{let h=e.state.field(this.stateField,!1);h&&h.tooltip&&e.state.facet(ye).closeOnBlur&&l.relatedTarget!=e.contentDOM&&e.dispatch({effects:Ks.of(null)})}),this.showOptions(r,n.id)}mount(){this.updateSel()}showOptions(e,t){this.list&&this.list.remove(),this.list=this.dom.appendChild(this.createListBox(e,t,this.range)),this.list.addEventListener("scroll",()=>{this.info&&this.view.requestMeasure(this.placeInfoReq)})}update(e){var t;let s=e.state.field(this.stateField),n=e.startState.field(this.stateField);if(this.updateTooltipClass(e.state),s!=n){let{options:r,selected:o,disabled:a}=s.open;(!n.open||n.open.options!=r)&&(this.range=Oo(r.length,o,e.state.facet(ye).maxRenderedOptions),this.showOptions(r,s.id)),this.updateSel(),a!=((t=n.open)===null||t===void 0?void 0:t.disabled)&&this.dom.classList.toggle("cm-tooltip-autocomplete-disabled",!!a)}}updateTooltipClass(e){let t=this.tooltipClass(e);if(t!=this.currentClass){for(let s of this.currentClass.split(" "))s&&this.dom.classList.remove(s);for(let s of t.split(" "))s&&this.dom.classList.add(s);this.currentClass=t}}positioned(e){this.space=e,this.info&&this.view.requestMeasure(this.placeInfoReq)}updateSel(){let e=this.view.state.field(this.stateField),t=e.open;(t.selected>-1&&t.selected<this.range.from||t.selected>=this.range.to)&&(this.range=Oo(t.options.length,t.selected,this.view.state.facet(ye).maxRenderedOptions),this.showOptions(t.options,e.id));let s=this.updateSelectedOption(t.selected);if(s){this.destroyInfo();let{completion:n}=t.options[t.selected],{info:r}=n;if(!r)return;let o=typeof r=="string"?document.createTextNode(r):r(n);if(!o)return;"then"in o?o.then(a=>{a&&this.view.state.field(this.stateField,!1)==e&&this.addInfoPane(a,n)}).catch(a=>Ie(this.view.state,a,"completion info")):(this.addInfoPane(o,n),s.setAttribute("aria-describedby",this.info.id))}}addInfoPane(e,t){this.destroyInfo();let s=this.info=document.createElement("div");if(s.className="cm-tooltip cm-completionInfo",s.id="cm-completionInfo-"+Math.floor(Math.random()*65535).toString(16),e.nodeType!=null)s.appendChild(e),this.infoDestroy=null;else{let{dom:n,destroy:r}=e;s.appendChild(n),this.infoDestroy=r||null}this.dom.appendChild(s),this.view.requestMeasure(this.placeInfoReq)}updateSelectedOption(e){let t=null;for(let s=this.list.firstChild,n=this.range.from;s;s=s.nextSibling,n++)s.nodeName!="LI"||!s.id?n--:n==e?s.hasAttribute("aria-selected")||(s.setAttribute("aria-selected","true"),t=s):s.hasAttribute("aria-selected")&&(s.removeAttribute("aria-selected"),s.removeAttribute("aria-describedby"));return t&&tv(this.list,t),t}measureInfo(){let e=this.dom.querySelector("[aria-selected]");if(!e||!this.info)return null;let t=this.dom.getBoundingClientRect(),s=this.info.getBoundingClientRect(),n=e.getBoundingClientRect(),r=this.space;if(!r){let o=this.dom.ownerDocument.documentElement;r={left:0,top:0,right:o.clientWidth,bottom:o.clientHeight}}return n.top>Math.min(r.bottom,t.bottom)-10||n.bottom<Math.max(r.top,t.top)+10?null:this.view.state.facet(ye).positionInfo(this.view,t,n,s,r,this.dom)}placeInfo(e){this.info&&(e?(e.style&&(this.info.style.cssText=e.style),this.info.className="cm-tooltip cm-completionInfo "+(e.class||"")):this.info.style.cssText="top: -1e6px")}createListBox(e,t,s){const n=document.createElement("ul");n.id=t,n.setAttribute("role","listbox"),n.setAttribute("aria-expanded","true"),n.setAttribute("aria-label",this.view.state.phrase("Completions")),n.addEventListener("mousedown",o=>{o.target==n&&o.preventDefault()});let r=null;for(let o=s.from;o<s.to;o++){let{completion:a,match:l}=e[o],{section:h}=a;if(h){let f=typeof h=="string"?h:h.name;if(f!=r&&(o>s.from||s.from==0))if(r=f,typeof h!="string"&&h.header)n.appendChild(h.header(h));else{let u=n.appendChild(document.createElement("completion-section"));u.textContent=f}}const c=n.appendChild(document.createElement("li"));c.id=t+"-"+o,c.setAttribute("role","option");let d=this.optionClass(a);d&&(c.className=d);for(let f of this.optionContent){let u=f(a,this.view.state,this.view,l);u&&c.appendChild(u)}}return s.from&&n.classList.add("cm-completionListIncompleteTop"),s.to<e.length&&n.classList.add("cm-completionListIncompleteBottom"),n}destroyInfo(){this.info&&(this.infoDestroy&&this.infoDestroy(),this.info.remove(),this.info=null)}destroy(){this.destroyInfo()}}function ev(i,e){return t=>new Zx(t,i,e)}function tv(i,e){let t=i.getBoundingClientRect(),s=e.getBoundingClientRect(),n=t.height/i.offsetHeight;s.top<t.top?i.scrollTop-=(t.top-s.top)/n:s.bottom>t.bottom&&(i.scrollTop+=(s.bottom-t.bottom)/n)}function dc(i){return(i.boost||0)*100+(i.apply?10:0)+(i.info?5:0)+(i.type?1:0)}function iv(i,e){let t=[],s=null,n=null,r=c=>{t.push(c);let{section:d}=c.completion;if(d){s||(s=[]);let f=typeof d=="string"?d:d.name;s.some(u=>u.name==f)||s.push(typeof d=="string"?{name:f}:d)}},o=e.facet(ye);for(let c of i)if(c.hasResult()){let d=c.result.getMatch;if(c.result.filter===!1)for(let f of c.result.options)r(new lc(f,c.source,d?d(f):[],1e9-t.length));else{let f=e.sliceDoc(c.from,c.to),u,p=o.filterStrict?new Kx(f):new Jx(f);for(let m of c.result.options)if(u=p.match(m.label)){let b=m.displayLabel?d?d(m,u.matched):[]:u.matched,x=u.score+(m.boost||0);if(r(new lc(m,c.source,b,x)),typeof m.section=="object"&&m.section.rank==="dynamic"){let{name:S}=m.section;n||(n=Object.create(null)),n[S]=Math.max(x,n[S]||-1e9)}}}}if(s){let c=Object.create(null),d=0,f=(u,p)=>(u.rank==="dynamic"&&p.rank==="dynamic"?n[p.name]-n[u.name]:0)||(typeof u.rank=="number"?u.rank:1e9)-(typeof p.rank=="number"?p.rank:1e9)||(u.name<p.name?-1:1);for(let u of s.sort(f))d-=1e5,c[u.name]=d;for(let u of t){let{section:p}=u.completion;p&&(u.score+=c[typeof p=="string"?p:p.name])}}let a=[],l=null,h=o.compareCompletions;for(let c of t.sort((d,f)=>f.score-d.score||h(d.completion,f.completion))){let d=c.completion;!l||l.label!=d.label||l.detail!=d.detail||l.type!=null&&d.type!=null&&l.type!=d.type||l.apply!=d.apply||l.boost!=d.boost?a.push(c):dc(c.completion)>dc(l)&&(a[a.length-1]=c),l=c.completion}return a}class Ui{constructor(e,t,s,n,r,o){this.options=e,this.attrs=t,this.tooltip=s,this.timestamp=n,this.selected=r,this.disabled=o}setSelected(e,t){return e==this.selected||e>=this.options.length?this:new Ui(this.options,fc(t,e),this.tooltip,this.timestamp,e,this.disabled)}static build(e,t,s,n,r,o){if(n&&!o&&e.some(h=>h.isPending))return n.setDisabled();let a=iv(e,t);if(!a.length)return n&&e.some(h=>h.isPending)?n.setDisabled():null;let l=t.facet(ye).selectOnOpen?0:-1;if(n&&n.selected!=l&&n.selected!=-1){let h=n.options[n.selected].completion;for(let c=0;c<a.length;c++)if(a[c].completion==h){l=c;break}}return new Ui(a,fc(s,l),{pos:e.reduce((h,c)=>c.hasResult()?Math.min(h,c.from):h,1e8),create:lv,above:r.aboveCursor},n?n.timestamp:Date.now(),l,!1)}map(e){return new Ui(this.options,this.attrs,{...this.tooltip,pos:e.mapPos(this.tooltip.pos)},this.timestamp,this.selected,this.disabled)}setDisabled(){return new Ui(this.options,this.attrs,this.tooltip,this.timestamp,this.selected,!0)}}class Cr{constructor(e,t,s){this.active=e,this.id=t,this.open=s}static start(){return new Cr(ov,"cm-ac-"+Math.floor(Math.random()*2e6).toString(36),null)}update(e){let{state:t}=e,s=t.facet(ye),r=(s.override||t.languageDataAt("autocomplete",Oi(t)).map(Xx)).map(l=>(this.active.find(c=>c.source==l)||new Ye(l,this.active.some(c=>c.state!=0)?1:0)).update(e,s));r.length==this.active.length&&r.every((l,h)=>l==this.active[h])&&(r=this.active);let o=this.open,a=e.effects.some(l=>l.is(bl));o&&e.docChanged&&(o=o.map(e.changes)),e.selection||r.some(l=>l.hasResult()&&e.changes.touchesRange(l.from,l.to))||!sv(r,this.active)||a?o=Ui.build(r,t,this.id,o,s,a):o&&o.disabled&&!r.some(l=>l.isPending)&&(o=null),!o&&r.every(l=>!l.isPending)&&r.some(l=>l.hasResult())&&(r=r.map(l=>l.hasResult()?new Ye(l.source,0):l));for(let l of e.effects)l.is(ml)&&(o=o&&o.setSelected(l.value,this.id));return r==this.active&&o==this.open?this:new Cr(r,this.id,o)}get tooltip(){return this.open?this.open.tooltip:null}get attrs(){return this.open?this.open.attrs:this.active.length?nv:rv}}function sv(i,e){if(i==e)return!0;for(let t=0,s=0;;){for(;t<i.length&&!i[t].hasResult();)t++;for(;s<e.length&&!e[s].hasResult();)s++;let n=t==i.length,r=s==e.length;if(n||r)return n==r;if(i[t++].result!=e[s++].result)return!1}}const nv={"aria-autocomplete":"list"},rv={};function fc(i,e){let t={"aria-autocomplete":"list","aria-haspopup":"listbox","aria-controls":i};return e>-1&&(t["aria-activedescendant"]=i+"-"+e),t}const ov=[];function Au(i,e){if(i.isUserEvent("input.complete")){let s=i.annotation(Ou);if(s&&e.activateOnCompletion(s))return 12}let t=i.isUserEvent("input.type");return t&&e.activateOnTyping?5:t?1:i.isUserEvent("delete.backward")?2:i.selection?8:i.docChanged?16:0}class Ye{constructor(e,t,s=!1){this.source=e,this.state=t,this.explicit=s}hasResult(){return!1}get isPending(){return this.state==1}update(e,t){let s=Au(e,t),n=this;(s&8||s&16&&this.touches(e))&&(n=new Ye(n.source,0)),s&4&&n.state==0&&(n=new Ye(this.source,1)),n=n.updateFor(e,s);for(let r of e.effects)if(r.is(Sr))n=new Ye(n.source,1,r.value);else if(r.is(Ks))n=new Ye(n.source,0);else if(r.is(bl))for(let o of r.value)o.source==n.source&&(n=o);return n}updateFor(e,t){return this.map(e.changes)}map(e){return this}touches(e){return e.changes.touchesRange(Oi(e.state))}}class Yi extends Ye{constructor(e,t,s,n,r,o){super(e,3,t),this.limit=s,this.result=n,this.from=r,this.to=o}hasResult(){return!0}updateFor(e,t){var s;if(!(t&3))return this.map(e.changes);let n=this.result;n.map&&!e.changes.empty&&(n=n.map(n,e.changes));let r=e.changes.mapPos(this.from),o=e.changes.mapPos(this.to,1),a=Oi(e.state);if(a>o||!n||t&2&&(Oi(e.startState)==this.from||a<this.limit))return new Ye(this.source,t&4?1:0);let l=e.changes.mapPos(this.limit);return av(n.validFor,e.state,r,o)?new Yi(this.source,this.explicit,l,n,r,o):n.update&&(n=n.update(n,r,o,new Su(e.state,a,!1)))?new Yi(this.source,this.explicit,l,n,n.from,(s=n.to)!==null&&s!==void 0?s:Oi(e.state)):new Ye(this.source,1,this.explicit)}map(e){return e.empty?this:(this.result.map?this.result.map(this.result,e):this.result)?new Yi(this.source,this.explicit,e.mapPos(this.limit),this.result,e.mapPos(this.from),e.mapPos(this.to,1)):new Ye(this.source,0)}touches(e){return e.changes.touchesRange(this.from,this.to)}}function av(i,e,t,s){if(!i)return!1;let n=e.sliceDoc(t,s);return typeof i=="function"?i(n,t,s,e):Cu(i,!0).test(n)}const bl=N.define({map(i,e){return i.map(t=>t.map(e))}}),_e=Pe.define({create(){return Cr.start()},update(i,e){return i.update(e)},provide:i=>[el.from(i,e=>e.tooltip),E.contentAttributes.from(i,e=>e.attrs)]});function yl(i,e){const t=e.completion.apply||e.completion.label;let s=i.state.field(_e).active.find(n=>n.source==e.source);return s instanceof Yi?(typeof t=="string"?i.dispatch({...jx(i.state,t,s.from,s.to),annotations:Ou.of(e.completion)}):t(i,e.completion,s.from,s.to),!0):!1}const lv=ev(_e,yl);function In(i,e="option"){return t=>{let s=t.state.field(_e,!1);if(!s||!s.open||s.open.disabled||Date.now()-s.open.timestamp<t.state.facet(ye).interactionDelay)return!1;let n=1,r;e=="page"&&(r=of(t,s.open.tooltip))&&(n=Math.max(2,Math.floor(r.dom.offsetHeight/r.dom.querySelector("li").offsetHeight)-1));let{length:o}=s.open.options,a=s.open.selected>-1?s.open.selected+n*(i?1:-1):i?0:o-1;return a<0?a=e=="page"?0:o-1:a>=o&&(a=e=="page"?o-1:0),t.dispatch({effects:ml.of(a)}),!0}}const hv=i=>{let e=i.state.field(_e,!1);return i.state.readOnly||!e||!e.open||e.open.selected<0||e.open.disabled||Date.now()-e.open.timestamp<i.state.facet(ye).interactionDelay?!1:yl(i,e.open.options[e.open.selected])},Ao=i=>i.state.field(_e,!1)?(i.dispatch({effects:Sr.of(!0)}),!0):!1,cv=i=>{let e=i.state.field(_e,!1);return!e||!e.active.some(t=>t.state!=0)?!1:(i.dispatch({effects:Ks.of(null)}),!0)};class dv{constructor(e,t){this.active=e,this.context=t,this.time=Date.now(),this.updates=[],this.done=void 0}}const fv=50,uv=1e3,pv=de.fromClass(class{constructor(i){this.view=i,this.debounceUpdate=-1,this.running=[],this.debounceAccept=-1,this.pendingStart=!1,this.composing=0;for(let e of i.state.field(_e).active)e.isPending&&this.startQuery(e)}update(i){let e=i.state.field(_e),t=i.state.facet(ye);if(!i.selectionSet&&!i.docChanged&&i.startState.field(_e)==e)return;let s=i.transactions.some(r=>{let o=Au(r,t);return o&8||(r.selection||r.docChanged)&&!(o&3)});for(let r=0;r<this.running.length;r++){let o=this.running[r];if(s||o.context.abortOnDocChange&&i.docChanged||o.updates.length+i.transactions.length>fv&&Date.now()-o.time>uv){for(let a of o.context.abortListeners)try{a()}catch(l){Ie(this.view.state,l)}o.context.abortListeners=null,this.running.splice(r--,1)}else o.updates.push(...i.transactions)}this.debounceUpdate>-1&&clearTimeout(this.debounceUpdate),i.transactions.some(r=>r.effects.some(o=>o.is(Sr)))&&(this.pendingStart=!0);let n=this.pendingStart?50:t.activateOnTypingDelay;if(this.debounceUpdate=e.active.some(r=>r.isPending&&!this.running.some(o=>o.active.source==r.source))?setTimeout(()=>this.startUpdate(),n):-1,this.composing!=0)for(let r of i.transactions)r.isUserEvent("input.type")?this.composing=2:this.composing==2&&r.selection&&(this.composing=3)}startUpdate(){this.debounceUpdate=-1,this.pendingStart=!1;let{state:i}=this.view,e=i.field(_e);for(let t of e.active)t.isPending&&!this.running.some(s=>s.active.source==t.source)&&this.startQuery(t);this.running.length&&e.open&&e.open.disabled&&(this.debounceAccept=setTimeout(()=>this.accept(),this.view.state.facet(ye).updateSyncTime))}startQuery(i){let{state:e}=this.view,t=Oi(e),s=new Su(e,t,i.explicit,this.view),n=new dv(i,s);this.running.push(n),Promise.resolve(i.source(s)).then(r=>{n.context.aborted||(n.done=r||null,this.scheduleAccept())},r=>{this.view.dispatch({effects:Ks.of(null)}),Ie(this.view.state,r)})}scheduleAccept(){this.running.every(i=>i.done!==void 0)?this.accept():this.debounceAccept<0&&(this.debounceAccept=setTimeout(()=>this.accept(),this.view.state.facet(ye).updateSyncTime))}accept(){var i;this.debounceAccept>-1&&clearTimeout(this.debounceAccept),this.debounceAccept=-1;let e=[],t=this.view.state.facet(ye),s=this.view.state.field(_e);for(let n=0;n<this.running.length;n++){let r=this.running[n];if(r.done===void 0)continue;if(this.running.splice(n--,1),r.done){let a=Oi(r.updates.length?r.updates[0].startState:this.view.state),l=Math.min(a,r.done.from+(r.active.explicit?0:1)),h=new Yi(r.active.source,r.active.explicit,l,r.done,r.done.from,(i=r.done.to)!==null&&i!==void 0?i:a);for(let c of r.updates)h=h.update(c,t);if(h.hasResult()){e.push(h);continue}}let o=s.active.find(a=>a.source==r.active.source);if(o&&o.isPending)if(r.done==null){let a=new Ye(r.active.source,0);for(let l of r.updates)a=a.update(l,t);a.isPending||e.push(a)}else this.startQuery(o)}(e.length||s.open&&s.open.disabled)&&this.view.dispatch({effects:bl.of(e)})}},{eventHandlers:{blur(i){let e=this.view.state.field(_e,!1);if(e&&e.tooltip&&this.view.state.facet(ye).closeOnBlur){let t=e.open&&of(this.view,e.open.tooltip);(!t||!t.dom.contains(i.relatedTarget))&&setTimeout(()=>this.view.dispatch({effects:Ks.of(null)}),10)}},compositionstart(){this.composing=1},compositionend(){this.composing==3&&setTimeout(()=>this.view.dispatch({effects:Sr.of(!1)}),20),this.composing=0}}}),gv=typeof navigator=="object"&&/Win/.test(navigator.platform),mv=_i.highest(E.domEventHandlers({keydown(i,e){let t=e.state.field(_e,!1);if(!t||!t.open||t.open.disabled||t.open.selected<0||i.key.length>1||i.ctrlKey&&!(gv&&i.altKey)||i.metaKey)return!1;let s=t.open.options[t.open.selected],n=t.active.find(o=>o.source==s.source),r=s.completion.commitCharacters||n.result.commitCharacters;return r&&r.indexOf(i.key)>-1&&yl(e,s),!1}})),bv=E.baseTheme({".cm-tooltip.cm-tooltip-autocomplete":{"& > ul":{fontFamily:"monospace",whiteSpace:"nowrap",overflow:"hidden auto",maxWidth_fallback:"700px",maxWidth:"min(700px, 95vw)",minWidth:"250px",maxHeight:"10em",height:"100%",listStyle:"none",margin:0,padding:0,"& > li, & > completion-section":{padding:"1px 3px",lineHeight:1.2},"& > li":{overflowX:"hidden",textOverflow:"ellipsis",cursor:"pointer"},"& > completion-section":{display:"list-item",borderBottom:"1px solid silver",paddingLeft:"0.5em",opacity:.7}}},"&light .cm-tooltip-autocomplete ul li[aria-selected]":{background:"#17c",color:"white"},"&light .cm-tooltip-autocomplete-disabled ul li[aria-selected]":{background:"#777"},"&dark .cm-tooltip-autocomplete ul li[aria-selected]":{background:"#347",color:"white"},"&dark .cm-tooltip-autocomplete-disabled ul li[aria-selected]":{background:"#444"},".cm-completionListIncompleteTop:before, .cm-completionListIncompleteBottom:after":{content:'"···"',opacity:.5,display:"block",textAlign:"center"},".cm-tooltip.cm-completionInfo":{position:"absolute",padding:"3px 9px",width:"max-content",maxWidth:"400px",boxSizing:"border-box",whiteSpace:"pre-line"},".cm-completionInfo.cm-completionInfo-left":{right:"100%"},".cm-completionInfo.cm-completionInfo-right":{left:"100%"},".cm-completionInfo.cm-completionInfo-left-narrow":{right:"30px"},".cm-completionInfo.cm-completionInfo-right-narrow":{left:"30px"},"&light .cm-snippetField":{backgroundColor:"#00000022"},"&dark .cm-snippetField":{backgroundColor:"#ffffff22"},".cm-snippetFieldPosition":{verticalAlign:"text-top",width:0,height:"1.15em",display:"inline-block",margin:"0 -0.7px -.7em",borderLeft:"1.4px dotted #888"},".cm-completionMatchedText":{textDecoration:"underline"},".cm-completionDetail":{marginLeft:"0.5em",fontStyle:"italic"},".cm-completionIcon":{fontSize:"90%",width:".8em",display:"inline-block",textAlign:"center",paddingRight:".6em",opacity:"0.6",boxSizing:"content-box"},".cm-completionIcon-function, .cm-completionIcon-method":{"&:after":{content:"'ƒ'"}},".cm-completionIcon-class":{"&:after":{content:"'○'"}},".cm-completionIcon-interface":{"&:after":{content:"'◌'"}},".cm-completionIcon-variable":{"&:after":{content:"'𝑥'"}},".cm-completionIcon-constant":{"&:after":{content:"'𝐶'"}},".cm-completionIcon-type":{"&:after":{content:"'𝑡'"}},".cm-completionIcon-enum":{"&:after":{content:"'∪'"}},".cm-completionIcon-property":{"&:after":{content:"'□'"}},".cm-completionIcon-keyword":{"&:after":{content:"'🔑︎'"}},".cm-completionIcon-namespace":{"&:after":{content:"'▢'"}},".cm-completionIcon-text":{"&:after":{content:"'abc'",fontSize:"50%",verticalAlign:"middle"}}}),Gs={brackets:["(","[","{","'",'"'],before:")]}:;>",stringPrefixes:[]},yi=N.define({map(i,e){let t=e.mapPos(i,-1,Ee.TrackAfter);return t??void 0}}),xl=new class extends Kt{};xl.startSide=1;xl.endSide=-1;const $u=Pe.define({create(){return H.empty},update(i,e){if(i=i.map(e.changes),e.selection){let t=e.state.doc.lineAt(e.selection.main.head);i=i.update({filter:s=>s>=t.from&&s<=t.to})}for(let t of e.effects)t.is(yi)&&(i=i.update({add:[xl.range(t.value,t.value+1)]}));return i}});function yv(){return[vv,$u]}const $o="()[]{}<>«»»«［］｛｝";function Pu(i){for(let e=0;e<$o.length;e+=2)if($o.charCodeAt(e)==i)return $o.charAt(e+1);return La(i<128?i:i+1)}function Mu(i,e){return i.languageDataAt("closeBrackets",e)[0]||Gs}const xv=typeof navigator=="object"&&/Android\b/.test(navigator.userAgent),vv=E.inputHandler.of((i,e,t,s)=>{if((xv?i.composing:i.compositionStarted)||i.state.readOnly)return!1;let n=i.state.selection.main;if(s.length>2||s.length==2&&yt(Be(s,0))==1||e!=n.from||t!=n.to)return!1;let r=Sv(i.state,s);return r?(i.dispatch(r),!0):!1}),wv=({state:i,dispatch:e})=>{if(i.readOnly)return!1;let s=Mu(i,i.selection.main.head).brackets||Gs.brackets,n=null,r=i.changeByRange(o=>{if(o.empty){let a=Cv(i.doc,o.head);for(let l of s)if(l==a&&qr(i.doc,o.head)==Pu(Be(l,0)))return{changes:{from:o.head-l.length,to:o.head+l.length},range:k.cursor(o.head-l.length)}}return{range:n=o}});return n||e(i.update(r,{scrollIntoView:!0,userEvent:"delete.backward"})),!n},kv=[{key:"Backspace",run:wv}];function Sv(i,e){let t=Mu(i,i.selection.main.head),s=t.brackets||Gs.brackets;for(let n of s){let r=Pu(Be(n,0));if(e==n)return r==n?$v(i,n,s.indexOf(n+n+n)>-1,t):Ov(i,n,r,t.before||Gs.before);if(e==r&&Tu(i,i.selection.main.from))return Av(i,n,r)}return null}function Tu(i,e){let t=!1;return i.field($u).between(0,i.doc.length,s=>{s==e&&(t=!0)}),t}function qr(i,e){let t=i.sliceString(e,e+2);return t.slice(0,yt(Be(t,0)))}function Cv(i,e){let t=i.sliceString(e-2,e);return yt(Be(t,0))==t.length?t:t.slice(1)}function Ov(i,e,t,s){let n=null,r=i.changeByRange(o=>{if(!o.empty)return{changes:[{insert:e,from:o.from},{insert:t,from:o.to}],effects:yi.of(o.to+e.length),range:k.range(o.anchor+e.length,o.head+e.length)};let a=qr(i.doc,o.head);return!a||/\s/.test(a)||s.indexOf(a)>-1?{changes:{insert:e+t,from:o.head},effects:yi.of(o.head+e.length),range:k.cursor(o.head+e.length)}:{range:n=o}});return n?null:i.update(r,{scrollIntoView:!0,userEvent:"input.type"})}function Av(i,e,t){let s=null,n=i.changeByRange(r=>r.empty&&qr(i.doc,r.head)==t?{changes:{from:r.head,to:r.head+t.length,insert:t},range:k.cursor(r.head+t.length)}:s={range:r});return s?null:i.update(n,{scrollIntoView:!0,userEvent:"input.type"})}function $v(i,e,t,s){let n=s.stringPrefixes||Gs.stringPrefixes,r=null,o=i.changeByRange(a=>{if(!a.empty)return{changes:[{insert:e,from:a.from},{insert:e,from:a.to}],effects:yi.of(a.to+e.length),range:k.range(a.anchor+e.length,a.head+e.length)};let l=a.head,h=qr(i.doc,l),c;if(h==e){if(uc(i,l))return{changes:{insert:e+e,from:l},effects:yi.of(l+e.length),range:k.cursor(l+e.length)};if(Tu(i,l)){let f=t&&i.sliceDoc(l,l+e.length*3)==e+e+e?e+e+e:e;return{changes:{from:l,to:l+f.length,insert:f},range:k.cursor(l+f.length)}}}else{if(t&&i.sliceDoc(l-2*e.length,l)==e+e&&(c=pc(i,l-2*e.length,n))>-1&&uc(i,c))return{changes:{insert:e+e+e+e,from:l},effects:yi.of(l+e.length),range:k.cursor(l+e.length)};if(i.charCategorizer(l)(h)!=ie.Word&&pc(i,l,n)>-1&&!Pv(i,l,e,n))return{changes:{insert:e+e,from:l},effects:yi.of(l+e.length),range:k.cursor(l+e.length)}}return{range:r=a}});return r?null:i.update(o,{scrollIntoView:!0,userEvent:"input.type"})}function uc(i,e){let t=$e(i).resolveInner(e+1);return t.parent&&t.from==e}function Pv(i,e,t,s){let n=$e(i).resolveInner(e,-1),r=s.reduce((o,a)=>Math.max(o,a.length),0);for(let o=0;o<5;o++){let a=i.sliceDoc(n.from,Math.min(n.to,n.from+t.length+r)),l=a.indexOf(t);if(!l||l>-1&&s.indexOf(a.slice(0,l))>-1){let c=n.firstChild;for(;c&&c.from==n.from&&c.to-c.from>t.length+l;){if(i.sliceDoc(c.to-t.length,c.to)==t)return!1;c=c.firstChild}return!0}let h=n.to==e&&n.parent;if(!h)break;n=h}return!1}function pc(i,e,t){let s=i.charCategorizer(e);if(s(i.sliceDoc(e-1,e))!=ie.Word)return e;for(let n of t){let r=e-n.length;if(i.sliceDoc(r,e)==n&&s(i.sliceDoc(r-1,r))!=ie.Word)return r}return-1}function Mv(i={}){return[mv,_e,ye.of(i),pv,Tv,bv]}const Du=[{key:"Ctrl-Space",run:Ao},{mac:"Alt-`",run:Ao},{mac:"Alt-i",run:Ao},{key:"Escape",run:cv},{key:"ArrowDown",run:In(!0)},{key:"ArrowUp",run:In(!1)},{key:"PageDown",run:In(!0,"page")},{key:"PageUp",run:In(!1,"page")},{key:"Enter",run:hv}],Tv=_i.highest(Ya.computeN([ye],i=>i.facet(ye).defaultKeymap?[Du]:[]));class gc{constructor(e,t,s){this.from=e,this.to=t,this.diagnostic=s}}class fi{constructor(e,t,s){this.diagnostics=e,this.panel=t,this.selected=s}static init(e,t,s){let n=s.facet(Ys).markerFilter;n&&(e=n(e,s));let r=e.slice().sort((u,p)=>u.from-p.from||u.to-p.to),o=new Bt,a=[],l=0,h=s.doc.iter(),c=0,d=s.doc.length;for(let u=0;;){let p=u==r.length?null:r[u];if(!p&&!a.length)break;let m,b;if(a.length)m=l,b=a.reduce((C,R)=>Math.min(C,R.to),p&&p.from>m?p.from:1e8);else{if(m=p.from,m>d)break;b=p.to,a.push(p),u++}for(;u<r.length;){let C=r[u];if(C.from==m&&(C.to>C.from||C.to==m))a.push(C),u++,b=Math.min(C.to,b);else{b=Math.min(C.from,b);break}}b=Math.min(b,d);let x=!1;if(a.some(C=>C.from==m&&(C.to==b||b==d))&&(x=m==b,!x&&b-m<10)){let C=m-(c+h.value.length);C>0&&(h.next(C),c=m);for(let R=m;;){if(R>=b){x=!0;break}if(!h.lineBreak&&c+h.value.length>R)break;R=c+h.value.length,c+=h.value.length,h.next()}}let S=qv(a);if(x)o.add(m,m,L.widget({widget:new zv(S),diagnostics:a.slice()}));else{let C=a.reduce((R,A)=>A.markClass?R+" "+A.markClass:R,"");o.add(m,b,L.mark({class:"cm-lintRange cm-lintRange-"+S+C,diagnostics:a.slice(),inclusiveEnd:a.some(R=>R.to>b)}))}if(l=b,l==d)break;for(let C=0;C<a.length;C++)a[C].to<=l&&a.splice(C--,1)}let f=o.finish();return new fi(f,t,ii(f))}}function ii(i,e=null,t=0){let s=null;return i.between(t,1e9,(n,r,{spec:o})=>{if(!(e&&o.diagnostics.indexOf(e)<0))if(!s)s=new gc(n,r,e||o.diagnostics[0]);else{if(o.diagnostics.indexOf(s.diagnostic)<0)return!1;s=new gc(s.from,r,s.diagnostic)}}),s}function Dv(i,e){let t=e.pos,s=e.end||t,n=i.state.facet(Ys).hideOn(i,t,s);if(n!=null)return n;let r=i.startState.doc.lineAt(e.pos);return!!(i.effects.some(o=>o.is(Eu))||i.changes.touchesRange(r.from,Math.max(r.to,s)))}function Ev(i,e){return i.field(Ve,!1)?e:e.concat(N.appendConfig.of(Qv))}const Eu=N.define(),vl=N.define(),Ru=N.define(),Ve=Pe.define({create(){return new fi(L.none,null,null)},update(i,e){if(e.docChanged&&i.diagnostics.size){let t=i.diagnostics.map(e.changes),s=null,n=i.panel;if(i.selected){let r=e.changes.mapPos(i.selected.from,1);s=ii(t,i.selected.diagnostic,r)||ii(t,null,r)}!t.size&&n&&e.state.facet(Ys).autoPanel&&(n=null),i=new fi(t,n,s)}for(let t of e.effects)if(t.is(Eu)){let s=e.state.facet(Ys).autoPanel?t.value.length?Zs.open:null:i.panel;i=fi.init(t.value,s,e.state)}else t.is(vl)?i=new fi(i.diagnostics,t.value?Zs.open:null,i.selected):t.is(Ru)&&(i=new fi(i.diagnostics,i.panel,t.value));return i},provide:i=>[Vs.from(i,e=>e.panel),E.decorations.from(i,e=>e.diagnostics)]}),Rv=L.mark({class:"cm-lintRange cm-lintRange-active"});function Bv(i,e,t){let{diagnostics:s}=i.state.field(Ve),n,r=-1,o=-1;s.between(e-(t<0?1:0),e+(t>0?1:0),(l,h,{spec:c})=>{if(e>=l&&e<=h&&(l==h||(e>l||t>0)&&(e<h||t<0)))return n=c.diagnostics,r=l,o=h,!1});let a=i.state.facet(Ys).tooltipFilter;return n&&a&&(n=a(n,i.state)),n?{pos:r,end:o,above:i.state.doc.lineAt(r).to<o,create(){return{dom:_v(i,n)}}}:null}function _v(i,e){return X("ul",{class:"cm-tooltip-lint"},e.map(t=>_u(i,t,!1)))}const Lv=i=>{let e=i.state.field(Ve,!1);(!e||!e.panel)&&i.dispatch({effects:Ev(i.state,[vl.of(!0)])});let t=tl(i,Zs.open);return t&&t.dom.querySelector(".cm-panel-lint ul").focus(),!0},mc=i=>{let e=i.state.field(Ve,!1);return!e||!e.panel?!1:(i.dispatch({effects:vl.of(!1)}),!0)},Iv=i=>{let e=i.state.field(Ve,!1);if(!e)return!1;let t=i.state.selection.main,s=ii(e.diagnostics,null,t.to+1);return!s&&(s=ii(e.diagnostics,null,0),!s||s.from==t.from&&s.to==t.to)?!1:(i.dispatch({selection:{anchor:s.from,head:s.to},scrollIntoView:!0}),!0)},Nv=[{key:"Mod-Shift-m",run:Lv,preventDefault:!0},{key:"F8",run:Iv}],Ys=D.define({combine(i){return{sources:i.map(e=>e.source).filter(e=>e!=null),...At(i.map(e=>e.config),{delay:750,markerFilter:null,tooltipFilter:null,needsRefresh:null,hideOn:()=>null},{delay:Math.max,markerFilter:bc,tooltipFilter:bc,needsRefresh:(e,t)=>e?t?s=>e(s)||t(s):e:t,hideOn:(e,t)=>e?t?(s,n,r)=>e(s,n,r)||t(s,n,r):e:t,autoPanel:(e,t)=>e||t})}}});function bc(i,e){return i?e?(t,s)=>e(i(t,s),s):i:e}function Bu(i){let e=[];if(i)e:for(let{name:t}of i){for(let s=0;s<t.length;s++){let n=t[s];if(/[a-zA-Z]/.test(n)&&!e.some(r=>r.toLowerCase()==n.toLowerCase())){e.push(n);continue e}}e.push("")}return e}function _u(i,e,t){var s;let n=t?Bu(e.actions):[];return X("li",{class:"cm-diagnostic cm-diagnostic-"+e.severity},X("span",{class:"cm-diagnosticText"},e.renderMessage?e.renderMessage(i):e.message),(s=e.actions)===null||s===void 0?void 0:s.map((r,o)=>{let a=!1,l=u=>{if(u.preventDefault(),a)return;a=!0;let p=ii(i.state.field(Ve).diagnostics,e);p&&r.apply(i,p.from,p.to)},{name:h}=r,c=n[o]?h.indexOf(n[o]):-1,d=c<0?h:[h.slice(0,c),X("u",h.slice(c,c+1)),h.slice(c+1)],f=r.markClass?" "+r.markClass:"";return X("button",{type:"button",class:"cm-diagnosticAction"+f,onclick:l,onmousedown:l,"aria-label":` Action: ${h}${c<0?"":` (access key "${n[o]})"`}.`},d)}),e.source&&X("div",{class:"cm-diagnosticSource"},e.source))}class zv extends Ht{constructor(e){super(),this.sev=e}eq(e){return e.sev==this.sev}toDOM(){return X("span",{class:"cm-lintPoint cm-lintPoint-"+this.sev})}}class yc{constructor(e,t){this.diagnostic=t,this.id="item_"+Math.floor(Math.random()*4294967295).toString(16),this.dom=_u(e,t,!0),this.dom.id=this.id,this.dom.setAttribute("role","option")}}class Zs{constructor(e){this.view=e,this.items=[];let t=n=>{if(!(n.ctrlKey||n.altKey||n.metaKey)){if(n.keyCode==27)mc(this.view),this.view.focus();else if(n.keyCode==38||n.keyCode==33)this.moveSelection((this.selectedIndex-1+this.items.length)%this.items.length);else if(n.keyCode==40||n.keyCode==34)this.moveSelection((this.selectedIndex+1)%this.items.length);else if(n.keyCode==36)this.moveSelection(0);else if(n.keyCode==35)this.moveSelection(this.items.length-1);else if(n.keyCode==13)this.view.focus();else if(n.keyCode>=65&&n.keyCode<=90&&this.selectedIndex>=0){let{diagnostic:r}=this.items[this.selectedIndex],o=Bu(r.actions);for(let a=0;a<o.length;a++)if(o[a].toUpperCase().charCodeAt(0)==n.keyCode){let l=ii(this.view.state.field(Ve).diagnostics,r);l&&r.actions[a].apply(e,l.from,l.to)}}else return;n.preventDefault()}},s=n=>{for(let r=0;r<this.items.length;r++)this.items[r].dom.contains(n.target)&&this.moveSelection(r)};this.list=X("ul",{tabIndex:0,role:"listbox","aria-label":this.view.state.phrase("Diagnostics"),onkeydown:t,onclick:s}),this.dom=X("div",{class:"cm-panel-lint"},this.list,X("button",{type:"button",name:"close","aria-label":this.view.state.phrase("close"),onclick:()=>mc(this.view)},"×")),this.update()}get selectedIndex(){let e=this.view.state.field(Ve).selected;if(!e)return-1;for(let t=0;t<this.items.length;t++)if(this.items[t].diagnostic==e.diagnostic)return t;return-1}update(){let{diagnostics:e,selected:t}=this.view.state.field(Ve),s=0,n=!1,r=null,o=new Set;for(e.between(0,this.view.state.doc.length,(a,l,{spec:h})=>{for(let c of h.diagnostics){if(o.has(c))continue;o.add(c);let d=-1,f;for(let u=s;u<this.items.length;u++)if(this.items[u].diagnostic==c){d=u;break}d<0?(f=new yc(this.view,c),this.items.splice(s,0,f),n=!0):(f=this.items[d],d>s&&(this.items.splice(s,d-s),n=!0)),t&&f.diagnostic==t.diagnostic?f.dom.hasAttribute("aria-selected")||(f.dom.setAttribute("aria-selected","true"),r=f):f.dom.hasAttribute("aria-selected")&&f.dom.removeAttribute("aria-selected"),s++}});s<this.items.length&&!(this.items.length==1&&this.items[0].diagnostic.from<0);)n=!0,this.items.pop();this.items.length==0&&(this.items.push(new yc(this.view,{from:-1,to:-1,severity:"info",message:this.view.state.phrase("No diagnostics")})),n=!0),r?(this.list.setAttribute("aria-activedescendant",r.id),this.view.requestMeasure({key:this,read:()=>({sel:r.dom.getBoundingClientRect(),panel:this.list.getBoundingClientRect()}),write:({sel:a,panel:l})=>{let h=l.height/this.list.offsetHeight;a.top<l.top?this.list.scrollTop-=(l.top-a.top)/h:a.bottom>l.bottom&&(this.list.scrollTop+=(a.bottom-l.bottom)/h)}})):this.selectedIndex<0&&this.list.removeAttribute("aria-activedescendant"),n&&this.sync()}sync(){let e=this.list.firstChild;function t(){let s=e;e=s.nextSibling,s.remove()}for(let s of this.items)if(s.dom.parentNode==this.list){for(;e!=s.dom;)t();e=s.dom.nextSibling}else this.list.insertBefore(s.dom,e);for(;e;)t()}moveSelection(e){if(this.selectedIndex<0)return;let t=this.view.state.field(Ve),s=ii(t.diagnostics,this.items[e].diagnostic);s&&this.view.dispatch({selection:{anchor:s.from,head:s.to},scrollIntoView:!0,effects:Ru.of(s)})}static open(e){return new Zs(e)}}function Fv(i,e='viewBox="0 0 40 40"'){return`url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" ${e}>${encodeURIComponent(i)}</svg>')`}function Nn(i){return Fv(`<path d="m0 2.5 l2 -1.5 l1 0 l2 1.5 l1 0" stroke="${i}" fill="none" stroke-width=".7"/>`,'width="6" height="3"')}const Hv=E.baseTheme({".cm-diagnostic":{padding:"3px 6px 3px 8px",marginLeft:"-1px",display:"block",whiteSpace:"pre-wrap"},".cm-diagnostic-error":{borderLeft:"5px solid #d11"},".cm-diagnostic-warning":{borderLeft:"5px solid orange"},".cm-diagnostic-info":{borderLeft:"5px solid #999"},".cm-diagnostic-hint":{borderLeft:"5px solid #66d"},".cm-diagnosticAction":{font:"inherit",border:"none",padding:"2px 4px",backgroundColor:"#444",color:"white",borderRadius:"3px",marginLeft:"8px",cursor:"pointer"},".cm-diagnosticSource":{fontSize:"70%",opacity:.7},".cm-lintRange":{backgroundPosition:"left bottom",backgroundRepeat:"repeat-x",paddingBottom:"0.7px"},".cm-lintRange-error":{backgroundImage:Nn("#d11")},".cm-lintRange-warning":{backgroundImage:Nn("orange")},".cm-lintRange-info":{backgroundImage:Nn("#999")},".cm-lintRange-hint":{backgroundImage:Nn("#66d")},".cm-lintRange-active":{backgroundColor:"#ffdd9980"},".cm-tooltip-lint":{padding:0,margin:0},".cm-lintPoint":{position:"relative","&:after":{content:'""',position:"absolute",bottom:0,left:"-2px",borderLeft:"3px solid transparent",borderRight:"3px solid transparent",borderBottom:"4px solid #d11"}},".cm-lintPoint-warning":{"&:after":{borderBottomColor:"orange"}},".cm-lintPoint-info":{"&:after":{borderBottomColor:"#999"}},".cm-lintPoint-hint":{"&:after":{borderBottomColor:"#66d"}},".cm-panel.cm-panel-lint":{position:"relative","& ul":{maxHeight:"100px",overflowY:"auto","& [aria-selected]":{backgroundColor:"#ddd","& u":{textDecoration:"underline"}},"&:focus [aria-selected]":{background_fallback:"#bdf",backgroundColor:"Highlight",color_fallback:"white",color:"HighlightText"},"& u":{textDecoration:"none"},padding:0,margin:0},"& [name=close]":{position:"absolute",top:"0",right:"2px",background:"inherit",border:"none",font:"inherit",padding:0,margin:0}},"&dark .cm-lintRange-active":{backgroundColor:"#86714a80"},"&dark .cm-panel.cm-panel-lint ul":{"& [aria-selected]":{backgroundColor:"#2e343e"}}});function Wv(i){return i=="error"?4:i=="warning"?3:i=="info"?2:1}function qv(i){let e="hint",t=1;for(let s of i){let n=Wv(s.severity);n>t&&(t=n,e=s.severity)}return e}const Qv=[Ve,E.decorations.compute([Ve],i=>{let{selected:e,panel:t}=i.field(Ve);return!e||!t||e.from==e.to?L.none:L.set([Rv.range(e.from,e.to)])}),Rb(Bv,{hideOn:Dv}),Hv],Vv=[Ub(),Jb(),cb(),dy(),N0(),Zm(),nb(),q.allowMultipleSelections.of(!0),C0(),Rf(W0,{fallback:!0}),J0(),yv(),Mv(),kb(),Ob(),mb(),vx(),Ya.of([...kv,...gx,...Hx,...vy,...B0,...Du,...Nv])];var xc={};class Or{constructor(e,t,s,n,r,o,a,l,h,c=0,d){this.p=e,this.stack=t,this.state=s,this.reducePos=n,this.pos=r,this.score=o,this.buffer=a,this.bufferBase=l,this.curContext=h,this.lookAhead=c,this.parent=d}toString(){return`[${this.stack.filter((e,t)=>t%3==0).concat(this.state)}]@${this.pos}${this.score?"!"+this.score:""}`}static start(e,t,s=0){let n=e.parser.context;return new Or(e,[],t,s,s,0,[],0,n?new vc(n,n.start):null,0,null)}get context(){return this.curContext?this.curContext.context:null}pushState(e,t){this.stack.push(this.state,t,this.bufferBase+this.buffer.length),this.state=e}reduce(e){var t;let s=e>>19,n=e&65535,{parser:r}=this.p,o=this.reducePos<this.pos-25&&this.setLookAhead(this.pos),a=r.dynamicPrecedence(n);if(a&&(this.score+=a),s==0){n<r.minRepeatTerm&&this.reducePos<this.pos&&(this.reducePos=this.pos),this.pushState(r.getGoto(this.state,n,!0),this.reducePos),n<r.minRepeatTerm&&this.storeNode(n,this.reducePos,this.reducePos,o?8:4,!0),this.reduceContext(n,this.reducePos);return}let l=this.stack.length-(s-1)*3-(e&262144?6:0),h=l?this.stack[l-2]:this.p.ranges[0].from;n<r.minRepeatTerm&&h==this.reducePos&&this.reducePos<this.pos&&(this.reducePos=this.pos);let c=this.reducePos-h;c>=2e3&&!(!((t=this.p.parser.nodeSet.types[n])===null||t===void 0)&&t.isAnonymous)&&(h==this.p.lastBigReductionStart?(this.p.bigReductionCount++,this.p.lastBigReductionSize=c):this.p.lastBigReductionSize<c&&(this.p.bigReductionCount=1,this.p.lastBigReductionStart=h,this.p.lastBigReductionSize=c));let d=l?this.stack[l-1]:0,f=this.bufferBase+this.buffer.length-d;if(n<r.minRepeatTerm||e&131072){let u=r.stateFlag(this.state,1)?this.pos:this.reducePos;this.storeNode(n,h,u,f+4,!0)}if(e&262144)this.state=this.stack[l];else{let u=this.stack[l-3];this.state=r.getGoto(u,n,!0)}for(;this.stack.length>l;)this.stack.pop();this.reduceContext(n,h)}storeNode(e,t,s,n=4,r=!1){if(e==0&&(!this.stack.length||this.stack[this.stack.length-1]<this.buffer.length+this.bufferBase)){let o=this.buffer.length;if(o>0&&this.buffer[o-4]==0&&this.buffer[o-1]>-1){if(t==s)return;if(this.buffer[o-2]>=t){this.buffer[o-2]=s;return}}}if(!r||this.pos==s)this.buffer.push(e,t,s,n);else{let o=this.buffer.length;if(o>0&&(this.buffer[o-4]!=0||this.buffer[o-1]<0)){let a=!1;for(let l=o;l>0&&this.buffer[l-2]>s;l-=4)if(this.buffer[l-1]>=0){a=!0;break}if(a)for(;o>0&&this.buffer[o-2]>s;)this.buffer[o]=this.buffer[o-4],this.buffer[o+1]=this.buffer[o-3],this.buffer[o+2]=this.buffer[o-2],this.buffer[o+3]=this.buffer[o-1],o-=4,n>4&&(n-=4)}this.buffer[o]=e,this.buffer[o+1]=t,this.buffer[o+2]=s,this.buffer[o+3]=n}}shift(e,t,s,n){if(e&131072)this.pushState(e&65535,this.pos);else if((e&262144)==0){let r=e,{parser:o}=this.p;this.pos=n;let a=o.stateFlag(r,1);!a&&(n>s||t<=o.maxNode)&&(this.reducePos=n),this.pushState(r,a?s:Math.min(s,this.reducePos)),this.shiftContext(t,s),t<=o.maxNode&&this.buffer.push(t,s,n,4)}else this.pos=n,this.shiftContext(t,s),t<=this.p.parser.maxNode&&this.buffer.push(t,s,n,4)}apply(e,t,s,n){e&65536?this.reduce(e):this.shift(e,t,s,n)}useNode(e,t){let s=this.p.reused.length-1;(s<0||this.p.reused[s]!=e)&&(this.p.reused.push(e),s++);let n=this.pos;this.reducePos=this.pos=n+e.length,this.pushState(t,n),this.buffer.push(s,n,this.reducePos,-1),this.curContext&&this.updateContext(this.curContext.tracker.reuse(this.curContext.context,e,this,this.p.stream.reset(this.pos-e.length)))}split(){let e=this,t=e.buffer.length;for(t&&e.buffer[t-4]==0&&(t-=4);t>0&&e.buffer[t-2]>e.reducePos;)t-=4;let s=e.buffer.slice(t),n=e.bufferBase+t;for(;e&&n==e.bufferBase;)e=e.parent;return new Or(this.p,this.stack.slice(),this.state,this.reducePos,this.pos,this.score,s,n,this.curContext,this.lookAhead,e)}recoverByDelete(e,t){let s=e<=this.p.parser.maxNode;s&&this.storeNode(e,this.pos,t,4),this.storeNode(0,this.pos,t,s?8:4),this.pos=this.reducePos=t,this.score-=190}canShift(e){for(let t=new Uv(this);;){let s=this.p.parser.stateSlot(t.state,4)||this.p.parser.hasAction(t.state,e);if(s==0)return!1;if((s&65536)==0)return!0;t.reduce(s)}}recoverByInsert(e){if(this.stack.length>=300)return[];let t=this.p.parser.nextStates(this.state);if(t.length>8||this.stack.length>=120){let n=[];for(let r=0,o;r<t.length;r+=2)(o=t[r+1])!=this.state&&this.p.parser.hasAction(o,e)&&n.push(t[r],o);if(this.stack.length<120)for(let r=0;n.length<8&&r<t.length;r+=2){let o=t[r+1];n.some((a,l)=>l&1&&a==o)||n.push(t[r],o)}t=n}let s=[];for(let n=0;n<t.length&&s.length<4;n+=2){let r=t[n+1];if(r==this.state)continue;let o=this.split();o.pushState(r,this.pos),o.storeNode(0,o.pos,o.pos,4,!0),o.shiftContext(t[n],this.pos),o.reducePos=this.pos,o.score-=200,s.push(o)}return s}forceReduce(){let{parser:e}=this.p,t=e.stateSlot(this.state,5);if((t&65536)==0)return!1;if(!e.validAction(this.state,t)){let s=t>>19,n=t&65535,r=this.stack.length-s*3;if(r<0||e.getGoto(this.stack[r],n,!1)<0){let o=this.findForcedReduction();if(o==null)return!1;t=o}this.storeNode(0,this.pos,this.pos,4,!0),this.score-=100}return this.reducePos=this.pos,this.reduce(t),!0}findForcedReduction(){let{parser:e}=this.p,t=[],s=(n,r)=>{if(!t.includes(n))return t.push(n),e.allActions(n,o=>{if(!(o&393216))if(o&65536){let a=(o>>19)-r;if(a>1){let l=o&65535,h=this.stack.length-a*3;if(h>=0&&e.getGoto(this.stack[h],l,!1)>=0)return a<<19|65536|l}}else{let a=s(o,r+1);if(a!=null)return a}})};return s(this.state,0)}forceAll(){for(;!this.p.parser.stateFlag(this.state,2);)if(!this.forceReduce()){this.storeNode(0,this.pos,this.pos,4,!0);break}return this}get deadEnd(){if(this.stack.length!=3)return!1;let{parser:e}=this.p;return e.data[e.stateSlot(this.state,1)]==65535&&!e.stateSlot(this.state,4)}restart(){this.storeNode(0,this.pos,this.pos,4,!0),this.state=this.stack[0],this.stack.length=0}sameState(e){if(this.state!=e.state||this.stack.length!=e.stack.length)return!1;for(let t=0;t<this.stack.length;t+=3)if(this.stack[t]!=e.stack[t])return!1;return!0}get parser(){return this.p.parser}dialectEnabled(e){return this.p.parser.dialect.flags[e]}shiftContext(e,t){this.curContext&&this.updateContext(this.curContext.tracker.shift(this.curContext.context,e,this,this.p.stream.reset(t)))}reduceContext(e,t){this.curContext&&this.updateContext(this.curContext.tracker.reduce(this.curContext.context,e,this,this.p.stream.reset(t)))}emitContext(){let e=this.buffer.length-1;(e<0||this.buffer[e]!=-3)&&this.buffer.push(this.curContext.hash,this.pos,this.pos,-3)}emitLookAhead(){let e=this.buffer.length-1;(e<0||this.buffer[e]!=-4)&&this.buffer.push(this.lookAhead,this.pos,this.pos,-4)}updateContext(e){if(e!=this.curContext.context){let t=new vc(this.curContext.tracker,e);t.hash!=this.curContext.hash&&this.emitContext(),this.curContext=t}}setLookAhead(e){return e<=this.lookAhead?!1:(this.emitLookAhead(),this.lookAhead=e,!0)}close(){this.curContext&&this.curContext.tracker.strict&&this.emitContext(),this.lookAhead>0&&this.emitLookAhead()}}class vc{constructor(e,t){this.tracker=e,this.context=t,this.hash=e.strict?e.hash(t):0}}class Uv{constructor(e){this.start=e,this.state=e.state,this.stack=e.stack,this.base=this.stack.length}reduce(e){let t=e&65535,s=e>>19;s==0?(this.stack==this.start.stack&&(this.stack=this.stack.slice()),this.stack.push(this.state,0,0),this.base+=3):this.base-=(s-1)*3;let n=this.start.p.parser.getGoto(this.stack[this.base-3],t,!0);this.state=n}}class Ar{constructor(e,t,s){this.stack=e,this.pos=t,this.index=s,this.buffer=e.buffer,this.index==0&&this.maybeNext()}static create(e,t=e.bufferBase+e.buffer.length){return new Ar(e,t,t-e.bufferBase)}maybeNext(){let e=this.stack.parent;e!=null&&(this.index=this.stack.bufferBase-e.bufferBase,this.stack=e,this.buffer=e.buffer)}get id(){return this.buffer[this.index-4]}get start(){return this.buffer[this.index-3]}get end(){return this.buffer[this.index-2]}get size(){return this.buffer[this.index-1]}next(){this.index-=4,this.pos-=4,this.index==0&&this.maybeNext()}fork(){return new Ar(this.stack,this.pos,this.index)}}function zn(i,e=Uint16Array){if(typeof i!="string")return i;let t=null;for(let s=0,n=0;s<i.length;){let r=0;for(;;){let o=i.charCodeAt(s++),a=!1;if(o==126){r=65535;break}o>=92&&o--,o>=34&&o--;let l=o-32;if(l>=46&&(l-=46,a=!0),r+=l,a)break;r*=46}t?t[n++]=r:t=new e(r)}return t}class Jn{constructor(){this.start=-1,this.value=-1,this.end=-1,this.extended=-1,this.lookAhead=0,this.mask=0,this.context=0}}const wc=new Jn;class jv{constructor(e,t){this.input=e,this.ranges=t,this.chunk="",this.chunkOff=0,this.chunk2="",this.chunk2Pos=0,this.next=-1,this.token=wc,this.rangeIndex=0,this.pos=this.chunkPos=t[0].from,this.range=t[0],this.end=t[t.length-1].to,this.readNext()}resolveOffset(e,t){let s=this.range,n=this.rangeIndex,r=this.pos+e;for(;r<s.from;){if(!n)return null;let o=this.ranges[--n];r-=s.from-o.to,s=o}for(;t<0?r>s.to:r>=s.to;){if(n==this.ranges.length-1)return null;let o=this.ranges[++n];r+=o.from-s.to,s=o}return r}clipPos(e){if(e>=this.range.from&&e<this.range.to)return e;for(let t of this.ranges)if(t.to>e)return Math.max(e,t.from);return this.end}peek(e){let t=this.chunkOff+e,s,n;if(t>=0&&t<this.chunk.length)s=this.pos+e,n=this.chunk.charCodeAt(t);else{let r=this.resolveOffset(e,1);if(r==null)return-1;if(s=r,s>=this.chunk2Pos&&s<this.chunk2Pos+this.chunk2.length)n=this.chunk2.charCodeAt(s-this.chunk2Pos);else{let o=this.rangeIndex,a=this.range;for(;a.to<=s;)a=this.ranges[++o];this.chunk2=this.input.chunk(this.chunk2Pos=s),s+this.chunk2.length>a.to&&(this.chunk2=this.chunk2.slice(0,a.to-s)),n=this.chunk2.charCodeAt(0)}}return s>=this.token.lookAhead&&(this.token.lookAhead=s+1),n}acceptToken(e,t=0){let s=t?this.resolveOffset(t,-1):this.pos;if(s==null||s<this.token.start)throw new RangeError("Token end out of bounds");this.token.value=e,this.token.end=s}acceptTokenTo(e,t){this.token.value=e,this.token.end=t}getChunk(){if(this.pos>=this.chunk2Pos&&this.pos<this.chunk2Pos+this.chunk2.length){let{chunk:e,chunkPos:t}=this;this.chunk=this.chunk2,this.chunkPos=this.chunk2Pos,this.chunk2=e,this.chunk2Pos=t,this.chunkOff=this.pos-this.chunkPos}else{this.chunk2=this.chunk,this.chunk2Pos=this.chunkPos;let e=this.input.chunk(this.pos),t=this.pos+e.length;this.chunk=t>this.range.to?e.slice(0,this.range.to-this.pos):e,this.chunkPos=this.pos,this.chunkOff=0}}readNext(){return this.chunkOff>=this.chunk.length&&(this.getChunk(),this.chunkOff==this.chunk.length)?this.next=-1:this.next=this.chunk.charCodeAt(this.chunkOff)}advance(e=1){for(this.chunkOff+=e;this.pos+e>=this.range.to;){if(this.rangeIndex==this.ranges.length-1)return this.setDone();e-=this.range.to-this.pos,this.range=this.ranges[++this.rangeIndex],this.pos=this.range.from}return this.pos+=e,this.pos>=this.token.lookAhead&&(this.token.lookAhead=this.pos+1),this.readNext()}setDone(){return this.pos=this.chunkPos=this.end,this.range=this.ranges[this.rangeIndex=this.ranges.length-1],this.chunk="",this.next=-1}reset(e,t){if(t?(this.token=t,t.start=e,t.lookAhead=e+1,t.value=t.extended=-1):this.token=wc,this.pos!=e){if(this.pos=e,e==this.end)return this.setDone(),this;for(;e<this.range.from;)this.range=this.ranges[--this.rangeIndex];for(;e>=this.range.to;)this.range=this.ranges[++this.rangeIndex];e>=this.chunkPos&&e<this.chunkPos+this.chunk.length?this.chunkOff=e-this.chunkPos:(this.chunk="",this.chunkOff=0),this.readNext()}return this}read(e,t){if(e>=this.chunkPos&&t<=this.chunkPos+this.chunk.length)return this.chunk.slice(e-this.chunkPos,t-this.chunkPos);if(e>=this.chunk2Pos&&t<=this.chunk2Pos+this.chunk2.length)return this.chunk2.slice(e-this.chunk2Pos,t-this.chunk2Pos);if(e>=this.range.from&&t<=this.range.to)return this.input.read(e,t);let s="";for(let n of this.ranges){if(n.from>=t)break;n.to>e&&(s+=this.input.read(Math.max(n.from,e),Math.min(n.to,t)))}return s}}class Zi{constructor(e,t){this.data=e,this.id=t}token(e,t){let{parser:s}=t.p;Xv(this.data,e,t,this.id,s.data,s.tokenPrecTable)}}Zi.prototype.contextual=Zi.prototype.fallback=Zi.prototype.extend=!1;Zi.prototype.fallback=Zi.prototype.extend=!1;class Qr{constructor(e,t={}){this.token=e,this.contextual=!!t.contextual,this.fallback=!!t.fallback,this.extend=!!t.extend}}function Xv(i,e,t,s,n,r){let o=0,a=1<<s,{dialect:l}=t.p.parser;e:for(;(a&i[o])!=0;){let h=i[o+1];for(let u=o+3;u<h;u+=2)if((i[u+1]&a)>0){let p=i[u];if(l.allows(p)&&(e.token.value==-1||e.token.value==p||Jv(p,e.token.value,n,r))){e.acceptToken(p);break}}let c=e.next,d=0,f=i[o+2];if(e.next<0&&f>d&&i[h+f*3-3]==65535){o=i[h+f*3-1];continue e}for(;d<f;){let u=d+f>>1,p=h+u+(u<<1),m=i[p],b=i[p+1]||65536;if(c<m)f=u;else if(c>=b)d=u+1;else{o=i[p+2],e.advance();continue e}}break}}function kc(i,e,t){for(let s=e,n;(n=i[s])!=65535;s++)if(n==t)return s-e;return-1}function Jv(i,e,t,s){let n=kc(t,s,e);return n<0||kc(t,s,i)<n}const qe=typeof process<"u"&&xc&&/\bparse\b/.test(xc.LOG);let Po=null;function Sc(i,e,t){let s=i.cursor(re.IncludeAnonymous);for(s.moveTo(e);;)if(!(t<0?s.childBefore(e):s.childAfter(e)))for(;;){if((t<0?s.to<e:s.from>e)&&!s.type.isError)return t<0?Math.max(0,Math.min(s.to-1,e-25)):Math.min(i.length,Math.max(s.from+1,e+25));if(t<0?s.prevSibling():s.nextSibling())break;if(!s.parent())return t<0?0:i.length}}class Kv{constructor(e,t){this.fragments=e,this.nodeSet=t,this.i=0,this.fragment=null,this.safeFrom=-1,this.safeTo=-1,this.trees=[],this.start=[],this.index=[],this.nextFragment()}nextFragment(){let e=this.fragment=this.i==this.fragments.length?null:this.fragments[this.i++];if(e){for(this.safeFrom=e.openStart?Sc(e.tree,e.from+e.offset,1)-e.offset:e.from,this.safeTo=e.openEnd?Sc(e.tree,e.to+e.offset,-1)-e.offset:e.to;this.trees.length;)this.trees.pop(),this.start.pop(),this.index.pop();this.trees.push(e.tree),this.start.push(-e.offset),this.index.push(0),this.nextStart=this.safeFrom}else this.nextStart=1e9}nodeAt(e){if(e<this.nextStart)return null;for(;this.fragment&&this.safeTo<=e;)this.nextFragment();if(!this.fragment)return null;for(;;){let t=this.trees.length-1;if(t<0)return this.nextFragment(),null;let s=this.trees[t],n=this.index[t];if(n==s.children.length){this.trees.pop(),this.start.pop(),this.index.pop();continue}let r=s.children[n],o=this.start[t]+s.positions[n];if(o>e)return this.nextStart=o,null;if(r instanceof ce){if(o==e){if(o<this.safeFrom)return null;let a=o+r.length;if(a<=this.safeTo){let l=r.prop(z.lookAhead);if(!l||a+l<this.fragment.to)return r}}this.index[t]++,o+r.length>=Math.max(this.safeFrom,e)&&(this.trees.push(r),this.start.push(o),this.index.push(0))}else this.index[t]++,this.nextStart=o+r.length}}}class Gv{constructor(e,t){this.stream=t,this.tokens=[],this.mainToken=null,this.actions=[],this.tokens=e.tokenizers.map(s=>new Jn)}getActions(e){let t=0,s=null,{parser:n}=e.p,{tokenizers:r}=n,o=n.stateSlot(e.state,3),a=e.curContext?e.curContext.hash:0,l=0;for(let h=0;h<r.length;h++){if((1<<h&o)==0)continue;let c=r[h],d=this.tokens[h];if(!(s&&!c.fallback)&&((c.contextual||d.start!=e.pos||d.mask!=o||d.context!=a)&&(this.updateCachedToken(d,c,e),d.mask=o,d.context=a),d.lookAhead>d.end+25&&(l=Math.max(d.lookAhead,l)),d.value!=0)){let f=t;if(d.extended>-1&&(t=this.addActions(e,d.extended,d.end,t)),t=this.addActions(e,d.value,d.end,t),!c.extend&&(s=d,t>f))break}}for(;this.actions.length>t;)this.actions.pop();return l&&e.setLookAhead(l),!s&&e.pos==this.stream.end&&(s=new Jn,s.value=e.p.parser.eofTerm,s.start=s.end=e.pos,t=this.addActions(e,s.value,s.end,t)),this.mainToken=s,this.actions}getMainToken(e){if(this.mainToken)return this.mainToken;let t=new Jn,{pos:s,p:n}=e;return t.start=s,t.end=Math.min(s+1,n.stream.end),t.value=s==n.stream.end?n.parser.eofTerm:0,t}updateCachedToken(e,t,s){let n=this.stream.clipPos(s.pos);if(t.token(this.stream.reset(n,e),s),e.value>-1){let{parser:r}=s.p;for(let o=0;o<r.specialized.length;o++)if(r.specialized[o]==e.value){let a=r.specializers[o](this.stream.read(e.start,e.end),s);if(a>=0&&s.p.parser.dialect.allows(a>>1)){(a&1)==0?e.value=a>>1:e.extended=a>>1;break}}}else e.value=0,e.end=this.stream.clipPos(n+1)}putAction(e,t,s,n){for(let r=0;r<n;r+=3)if(this.actions[r]==e)return n;return this.actions[n++]=e,this.actions[n++]=t,this.actions[n++]=s,n}addActions(e,t,s,n){let{state:r}=e,{parser:o}=e.p,{data:a}=o;for(let l=0;l<2;l++)for(let h=o.stateSlot(r,l?2:1);;h+=3){if(a[h]==65535)if(a[h+1]==1)h=Tt(a,h+2);else{n==0&&a[h+1]==2&&(n=this.putAction(Tt(a,h+2),t,s,n));break}a[h]==t&&(n=this.putAction(Tt(a,h+1),t,s,n))}return n}}class Yv{constructor(e,t,s,n){this.parser=e,this.input=t,this.ranges=n,this.recovering=0,this.nextStackID=9812,this.minStackPos=0,this.reused=[],this.stoppedAt=null,this.lastBigReductionStart=-1,this.lastBigReductionSize=0,this.bigReductionCount=0,this.stream=new jv(t,n),this.tokens=new Gv(e,this.stream),this.topTerm=e.top[1];let{from:r}=n[0];this.stacks=[Or.start(this,e.top[0],r)],this.fragments=s.length&&this.stream.end-r>e.bufferLength*4?new Kv(s,e.nodeSet):null}get parsedPos(){return this.minStackPos}advance(){let e=this.stacks,t=this.minStackPos,s=this.stacks=[],n,r;if(this.bigReductionCount>300&&e.length==1){let[o]=e;for(;o.forceReduce()&&o.stack.length&&o.stack[o.stack.length-2]>=this.lastBigReductionStart;);this.bigReductionCount=this.lastBigReductionSize=0}for(let o=0;o<e.length;o++){let a=e[o];for(;;){if(this.tokens.mainToken=null,a.pos>t)s.push(a);else{if(this.advanceStack(a,s,e))continue;{n||(n=[],r=[]),n.push(a);let l=this.tokens.getMainToken(a);r.push(l.value,l.end)}}break}}if(!s.length){let o=n&&t1(n);if(o)return qe&&console.log("Finish with "+this.stackID(o)),this.stackToTree(o);if(this.parser.strict)throw qe&&n&&console.log("Stuck with token "+(this.tokens.mainToken?this.parser.getName(this.tokens.mainToken.value):"none")),new SyntaxError("No parse at "+t);this.recovering||(this.recovering=5)}if(this.recovering&&n){let o=this.stoppedAt!=null&&n[0].pos>this.stoppedAt?n[0]:this.runRecovery(n,r,s);if(o)return qe&&console.log("Force-finish "+this.stackID(o)),this.stackToTree(o.forceAll())}if(this.recovering){let o=this.recovering==1?1:this.recovering*3;if(s.length>o)for(s.sort((a,l)=>l.score-a.score);s.length>o;)s.pop();s.some(a=>a.reducePos>t)&&this.recovering--}else if(s.length>1){e:for(let o=0;o<s.length-1;o++){let a=s[o];for(let l=o+1;l<s.length;l++){let h=s[l];if(a.sameState(h)||a.buffer.length>500&&h.buffer.length>500)if((a.score-h.score||a.buffer.length-h.buffer.length)>0)s.splice(l--,1);else{s.splice(o--,1);continue e}}}s.length>12&&(s.sort((o,a)=>a.score-o.score),s.splice(12,s.length-12))}this.minStackPos=s[0].pos;for(let o=1;o<s.length;o++)s[o].pos<this.minStackPos&&(this.minStackPos=s[o].pos);return null}stopAt(e){if(this.stoppedAt!=null&&this.stoppedAt<e)throw new RangeError("Can't move stoppedAt forward");this.stoppedAt=e}advanceStack(e,t,s){let n=e.pos,{parser:r}=this,o=qe?this.stackID(e)+" -> ":"";if(this.stoppedAt!=null&&n>this.stoppedAt)return e.forceReduce()?e:null;if(this.fragments){let h=e.curContext&&e.curContext.tracker.strict,c=h?e.curContext.hash:0;for(let d=this.fragments.nodeAt(n);d;){let f=this.parser.nodeSet.types[d.type.id]==d.type?r.getGoto(e.state,d.type.id):-1;if(f>-1&&d.length&&(!h||(d.prop(z.contextHash)||0)==c))return e.useNode(d,f),qe&&console.log(o+this.stackID(e)+` (via reuse of ${r.getName(d.type.id)})`),!0;if(!(d instanceof ce)||d.children.length==0||d.positions[0]>0)break;let u=d.children[0];if(u instanceof ce&&d.positions[0]==0)d=u;else break}}let a=r.stateSlot(e.state,4);if(a>0)return e.reduce(a),qe&&console.log(o+this.stackID(e)+` (via always-reduce ${r.getName(a&65535)})`),!0;if(e.stack.length>=8400)for(;e.stack.length>6e3&&e.forceReduce(););let l=this.tokens.getActions(e);for(let h=0;h<l.length;){let c=l[h++],d=l[h++],f=l[h++],u=h==l.length||!s,p=u?e:e.split(),m=this.tokens.mainToken;if(p.apply(c,d,m?m.start:p.pos,f),qe&&console.log(o+this.stackID(p)+` (via ${(c&65536)==0?"shift":`reduce of ${r.getName(c&65535)}`} for ${r.getName(d)} @ ${n}${p==e?"":", split"})`),u)return!0;p.pos>n?t.push(p):s.push(p)}return!1}advanceFully(e,t){let s=e.pos;for(;;){if(!this.advanceStack(e,null,null))return!1;if(e.pos>s)return Cc(e,t),!0}}runRecovery(e,t,s){let n=null,r=!1;for(let o=0;o<e.length;o++){let a=e[o],l=t[o<<1],h=t[(o<<1)+1],c=qe?this.stackID(a)+" -> ":"";if(a.deadEnd&&(r||(r=!0,a.restart(),qe&&console.log(c+this.stackID(a)+" (restarted)"),this.advanceFully(a,s))))continue;let d=a.split(),f=c;for(let u=0;u<10&&d.forceReduce()&&(qe&&console.log(f+this.stackID(d)+" (via force-reduce)"),!this.advanceFully(d,s));u++)qe&&(f=this.stackID(d)+" -> ");for(let u of a.recoverByInsert(l))qe&&console.log(c+this.stackID(u)+" (via recover-insert)"),this.advanceFully(u,s);this.stream.end>a.pos?(h==a.pos&&(h++,l=0),a.recoverByDelete(l,h),qe&&console.log(c+this.stackID(a)+` (via recover-delete ${this.parser.getName(l)})`),Cc(a,s)):(!n||n.score<d.score)&&(n=d)}return n}stackToTree(e){return e.close(),ce.build({buffer:Ar.create(e),nodeSet:this.parser.nodeSet,topID:this.topTerm,maxBufferLength:this.parser.bufferLength,reused:this.reused,start:this.ranges[0].from,length:e.pos-this.ranges[0].from,minRepeatType:this.parser.minRepeatTerm})}stackID(e){let t=(Po||(Po=new WeakMap)).get(e);return t||Po.set(e,t=String.fromCodePoint(this.nextStackID++)),t+e}}function Cc(i,e){for(let t=0;t<e.length;t++){let s=e[t];if(s.pos==i.pos&&s.sameState(i)){e[t].score<i.score&&(e[t]=i);return}}e.push(i)}class Zv{constructor(e,t,s){this.source=e,this.flags=t,this.disabled=s}allows(e){return!this.disabled||this.disabled[e]==0}}const Mo=i=>i;class e1{constructor(e){this.start=e.start,this.shift=e.shift||Mo,this.reduce=e.reduce||Mo,this.reuse=e.reuse||Mo,this.hash=e.hash||(()=>0),this.strict=e.strict!==!1}}class $r extends mf{constructor(e){if(super(),this.wrappers=[],e.version!=14)throw new RangeError(`Parser version (${e.version}) doesn't match runtime version (14)`);let t=e.nodeNames.split(" ");this.minRepeatTerm=t.length;for(let a=0;a<e.repeatNodeCount;a++)t.push("");let s=Object.keys(e.topRules).map(a=>e.topRules[a][1]),n=[];for(let a=0;a<t.length;a++)n.push([]);function r(a,l,h){n[a].push([l,l.deserialize(String(h))])}if(e.nodeProps)for(let a of e.nodeProps){let l=a[0];typeof l=="string"&&(l=z[l]);for(let h=1;h<a.length;){let c=a[h++];if(c>=0)r(c,l,a[h++]);else{let d=a[h+-c];for(let f=-c;f>0;f--)r(a[h++],l,d);h++}}}this.nodeSet=new il(t.map((a,l)=>Fe.define({name:l>=this.minRepeatTerm?void 0:a,id:l,props:n[l],top:s.indexOf(l)>-1,error:l==0,skipped:e.skippedNodes&&e.skippedNodes.indexOf(l)>-1}))),e.propSources&&(this.nodeSet=this.nodeSet.extend(...e.propSources)),this.strict=!1,this.bufferLength=ff;let o=zn(e.tokenData);this.context=e.context,this.specializerSpecs=e.specialized||[],this.specialized=new Uint16Array(this.specializerSpecs.length);for(let a=0;a<this.specializerSpecs.length;a++)this.specialized[a]=this.specializerSpecs[a].term;this.specializers=this.specializerSpecs.map(Oc),this.states=zn(e.states,Uint32Array),this.data=zn(e.stateData),this.goto=zn(e.goto),this.maxTerm=e.maxTerm,this.tokenizers=e.tokenizers.map(a=>typeof a=="number"?new Zi(o,a):a),this.topRules=e.topRules,this.dialects=e.dialects||{},this.dynamicPrecedences=e.dynamicPrecedences||null,this.tokenPrecTable=e.tokenPrec,this.termNames=e.termNames||null,this.maxNode=this.nodeSet.types.length-1,this.dialect=this.parseDialect(),this.top=this.topRules[Object.keys(this.topRules)[0]]}createParse(e,t,s){let n=new Yv(this,e,t,s);for(let r of this.wrappers)n=r(n,e,t,s);return n}getGoto(e,t,s=!1){let n=this.goto;if(t>=n[0])return-1;for(let r=n[t+1];;){let o=n[r++],a=o&1,l=n[r++];if(a&&s)return l;for(let h=r+(o>>1);r<h;r++)if(n[r]==e)return l;if(a)return-1}}hasAction(e,t){let s=this.data;for(let n=0;n<2;n++)for(let r=this.stateSlot(e,n?2:1),o;;r+=3){if((o=s[r])==65535)if(s[r+1]==1)o=s[r=Tt(s,r+2)];else{if(s[r+1]==2)return Tt(s,r+2);break}if(o==t||o==0)return Tt(s,r+1)}return 0}stateSlot(e,t){return this.states[e*6+t]}stateFlag(e,t){return(this.stateSlot(e,0)&t)>0}validAction(e,t){return!!this.allActions(e,s=>s==t?!0:null)}allActions(e,t){let s=this.stateSlot(e,4),n=s?t(s):void 0;for(let r=this.stateSlot(e,1);n==null;r+=3){if(this.data[r]==65535)if(this.data[r+1]==1)r=Tt(this.data,r+2);else break;n=t(Tt(this.data,r+1))}return n}nextStates(e){let t=[];for(let s=this.stateSlot(e,1);;s+=3){if(this.data[s]==65535)if(this.data[s+1]==1)s=Tt(this.data,s+2);else break;if((this.data[s+2]&1)==0){let n=this.data[s+1];t.some((r,o)=>o&1&&r==n)||t.push(this.data[s],n)}}return t}configure(e){let t=Object.assign(Object.create($r.prototype),this);if(e.props&&(t.nodeSet=this.nodeSet.extend(...e.props)),e.top){let s=this.topRules[e.top];if(!s)throw new RangeError(`Invalid top rule name ${e.top}`);t.top=s}return e.tokenizers&&(t.tokenizers=this.tokenizers.map(s=>{let n=e.tokenizers.find(r=>r.from==s);return n?n.to:s})),e.specializers&&(t.specializers=this.specializers.slice(),t.specializerSpecs=this.specializerSpecs.map((s,n)=>{let r=e.specializers.find(a=>a.from==s.external);if(!r)return s;let o=Object.assign(Object.assign({},s),{external:r.to});return t.specializers[n]=Oc(o),o})),e.contextTracker&&(t.context=e.contextTracker),e.dialect&&(t.dialect=this.parseDialect(e.dialect)),e.strict!=null&&(t.strict=e.strict),e.wrap&&(t.wrappers=t.wrappers.concat(e.wrap)),e.bufferLength!=null&&(t.bufferLength=e.bufferLength),t}hasWrappers(){return this.wrappers.length>0}getName(e){return this.termNames?this.termNames[e]:String(e<=this.maxNode&&this.nodeSet.types[e].name||e)}get eofTerm(){return this.maxNode+1}get topNode(){return this.nodeSet.types[this.top[1]]}dynamicPrecedence(e){let t=this.dynamicPrecedences;return t==null?0:t[e]||0}parseDialect(e){let t=Object.keys(this.dialects),s=t.map(()=>!1);if(e)for(let r of e.split(" ")){let o=t.indexOf(r);o>=0&&(s[o]=!0)}let n=null;for(let r=0;r<t.length;r++)if(!s[r])for(let o=this.dialects[t[r]],a;(a=this.data[o++])!=65535;)(n||(n=new Uint8Array(this.maxTerm+1)))[a]=1;return new Zv(e,s,n)}static deserialize(e){return new $r(e)}}function Tt(i,e){return i[e]|i[e+1]<<16}function t1(i){let e=null;for(let t of i){let s=t.p.stoppedAt;(t.pos==t.p.stream.end||s!=null&&t.pos>s)&&t.p.parser.stateFlag(t.state,2)&&(!e||e.score<t.score)&&(e=t)}return e}function Oc(i){if(i.external){let e=i.extend?1:0;return(t,s)=>i.external(t,s)<<1|e}return i.get}const Wi=63,Ac=64,i1=1,s1=2,Lu=3,n1=4,Iu=5,r1=6,o1=7,Nu=65,a1=66,l1=8,h1=9,c1=10,d1=11,f1=12,zu=13,u1=19,p1=20,g1=29,m1=33,b1=34,y1=47,x1=0,wl=1,Oa=2,en=3,Aa=4;class ui{constructor(e,t,s){this.parent=e,this.depth=t,this.type=s,this.hash=(e?e.hash+e.hash<<8:0)+t+(t<<4)+s}}ui.top=new ui(null,-1,x1);function Rs(i,e){for(let t=0,s=e-i.pos-1;;s--,t++){let n=i.peek(s);if(It(n)||n==-1)return t}}function $a(i){return i==32||i==9}function It(i){return i==10||i==13}function Fu(i){return $a(i)||It(i)}function xi(i){return i<0||Fu(i)}const v1=new e1({start:ui.top,reduce(i,e){return i.type==en&&(e==p1||e==b1)?i.parent:i},shift(i,e,t,s){if(e==Lu)return new ui(i,Rs(s,s.pos),wl);if(e==Nu||e==Iu)return new ui(i,Rs(s,s.pos),Oa);if(e==Wi)return i.parent;if(e==u1||e==m1)return new ui(i,0,en);if(e==zu&&i.type==Aa)return i.parent;if(e==y1){let n=/[1-9]/.exec(s.read(s.pos,t.pos));if(n)return new ui(i,i.depth+ +n[0],Aa)}return i},hash(i){return i.hash}});function cs(i,e,t=0){return i.peek(t)==e&&i.peek(t+1)==e&&i.peek(t+2)==e&&xi(i.peek(t+3))}const w1=new Qr((i,e)=>{if(i.next==-1&&e.canShift(Ac))return i.acceptToken(Ac);let t=i.peek(-1);if((It(t)||t<0)&&e.context.type!=en){if(cs(i,45))if(e.canShift(Wi))i.acceptToken(Wi);else return i.acceptToken(i1,3);if(cs(i,46))if(e.canShift(Wi))i.acceptToken(Wi);else return i.acceptToken(s1,3);let s=0;for(;i.next==32;)s++,i.advance();(s<e.context.depth||s==e.context.depth&&e.context.type==wl&&(i.next!=45||!xi(i.peek(1))))&&i.next!=-1&&!It(i.next)&&i.next!=35&&i.acceptToken(Wi,-s)}},{contextual:!0}),k1=new Qr((i,e)=>{if(e.context.type==en){i.next==63&&(i.advance(),xi(i.next)&&i.acceptToken(o1));return}if(i.next==45)i.advance(),xi(i.next)&&i.acceptToken(e.context.type==wl&&e.context.depth==Rs(i,i.pos-1)?n1:Lu);else if(i.next==63)i.advance(),xi(i.next)&&i.acceptToken(e.context.type==Oa&&e.context.depth==Rs(i,i.pos-1)?r1:Iu);else{let t=i.pos;for(;;)if($a(i.next)){if(i.pos==t)return;i.advance()}else if(i.next==33)Hu(i);else if(i.next==38)Pa(i);else if(i.next==42){Pa(i);break}else if(i.next==39||i.next==34){if(kl(i,!0))break;return}else if(i.next==91||i.next==123){if(!C1(i))return;break}else{Wu(i,!0,!1,0);break}for(;$a(i.next);)i.advance();if(i.next==58){if(i.pos==t&&e.canShift(g1))return;let s=i.peek(1);xi(s)&&i.acceptTokenTo(e.context.type==Oa&&e.context.depth==Rs(i,t)?a1:Nu,t)}}},{contextual:!0});function S1(i){return i>32&&i<127&&i!=34&&i!=37&&i!=44&&i!=60&&i!=62&&i!=92&&i!=94&&i!=96&&i!=123&&i!=124&&i!=125}function $c(i){return i>=48&&i<=57||i>=97&&i<=102||i>=65&&i<=70}function Pc(i,e){return i.next==37?(i.advance(),$c(i.next)&&i.advance(),$c(i.next)&&i.advance(),!0):S1(i.next)||e&&i.next==44?(i.advance(),!0):!1}function Hu(i){if(i.advance(),i.next==60){for(i.advance();;)if(!Pc(i,!0)){i.next==62&&i.advance();break}}else for(;Pc(i,!1););}function Pa(i){for(i.advance();!xi(i.next)&&Pr(i.next)!="f";)i.advance()}function kl(i,e){let t=i.next,s=!1,n=i.pos;for(i.advance();;){let r=i.next;if(r<0)break;if(i.advance(),r==t)if(r==39)if(i.next==39)i.advance();else break;else break;else if(r==92&&t==34)i.next>=0&&i.advance();else if(It(r)){if(e)return!1;s=!0}else if(e&&i.pos>=n+1024)return!1}return!s}function C1(i){for(let e=[],t=i.pos+1024;;)if(i.next==91||i.next==123)e.push(i.next),i.advance();else if(i.next==39||i.next==34){if(!kl(i,!0))return!1}else if(i.next==93||i.next==125){if(e[e.length-1]!=i.next-2)return!1;if(e.pop(),i.advance(),!e.length)return!0}else{if(i.next<0||i.pos>t||It(i.next))return!1;i.advance()}}const O1="iiisiiissisfissssssssssssisssiiissssssssssssssssssssssssssfsfssissssssssssssssssssssssssssfif";function Pr(i){return i<33?"u":i>125?"s":O1[i-33]}function To(i,e){let t=Pr(i);return t!="u"&&!(e&&t=="f")}function Wu(i,e,t,s){if(Pr(i.next)=="s"||(i.next==63||i.next==58||i.next==45)&&To(i.peek(1),t))i.advance();else return!1;let n=i.pos;for(;;){let r=i.next,o=0,a=s+1;for(;Fu(r);){if(It(r)){if(e)return!1;a=0}else a++;r=i.peek(++o)}if(!(r>=0&&(r==58?To(i.peek(o+1),t):r==35?i.peek(o-1)!=32:To(r,t)))||!t&&a<=s||a==0&&!t&&(cs(i,45,o)||cs(i,46,o)))break;if(e&&Pr(r)=="f")return!1;for(let h=o;h>=0;h--)i.advance();if(e&&i.pos>n+1024)return!1}return!0}const A1=new Qr((i,e)=>{if(i.next==33)Hu(i),i.acceptToken(f1);else if(i.next==38||i.next==42){let t=i.next==38?c1:d1;Pa(i),i.acceptToken(t)}else i.next==39||i.next==34?(kl(i,!1),i.acceptToken(h1)):Wu(i,!1,e.context.type==en,e.context.depth)&&i.acceptToken(l1)}),$1=new Qr((i,e)=>{let t=e.context.type==Aa?e.context.depth:-1,s=i.pos;e:for(;;){let n=0,r=i.next;for(;r==32;)r=i.peek(++n);if(!n&&(cs(i,45,n)||cs(i,46,n))||!It(r)&&(t<0&&(t=Math.max(e.context.depth+1,n)),n<t))break;for(;;){if(i.next<0)break e;let o=It(i.next);if(i.advance(),o)continue e;s=i.pos}}i.acceptTokenTo(zu,s)}),P1=bf({DirectiveName:v.keyword,DirectiveContent:v.attributeValue,"DirectiveEnd DocEnd":v.meta,QuotedLiteral:v.string,BlockLiteralHeader:v.special(v.string),BlockLiteralContent:v.content,Literal:v.content,"Key/Literal Key/QuotedLiteral":v.definition(v.propertyName),"Anchor Alias":v.labelName,Tag:v.typeName,Comment:v.lineComment,": , -":v.separator,"?":v.punctuation,"[ ]":v.squareBracket,"{ }":v.brace}),M1=$r.deserialize({version:14,states:"5lQ!ZQgOOO#PQfO'#CpO#uQfO'#DOOOQR'#Dv'#DvO$qQgO'#DRO%gQdO'#DUO%nQgO'#DUO&ROaO'#D[OOQR'#Du'#DuO&{QgO'#D^O'rQgO'#D`OOQR'#Dt'#DtO(iOqO'#DbOOQP'#Dj'#DjO(zQaO'#CmO)YQgO'#CmOOQP'#Cm'#CmQ)jQaOOQ)uQgOOQ]QgOOO*PQdO'#CrO*nQdO'#CtOOQO'#Dw'#DwO+]Q`O'#CxO+hQdO'#CwO+rQ`O'#CwOOQO'#Cv'#CvO+wQdO'#CvOOQO'#Cq'#CqO,UQ`O,59[O,^QfO,59[OOQR,59[,59[OOQO'#Cx'#CxO,eQ`O'#DPO,pQdO'#DPOOQO'#Dx'#DxO,zQdO'#DxO-XQ`O,59jO-aQfO,59jOOQR,59j,59jOOQR'#DS'#DSO-hQcO,59mO-sQgO'#DVO.TQ`O'#DVO.YQcO,59pOOQR'#DX'#DXO#|QfO'#DWO.hQcO'#DWOOQR,59v,59vO.yOWO,59vO/OOaO,59vO/WOaO,59vO/cQgO'#D_OOQR,59x,59xO0VQgO'#DaOOQR,59z,59zOOQP,59|,59|O0yOaO,59|O1ROaO,59|O1aOqO,59|OOQP-E7h-E7hO1oQgO,59XOOQP,59X,59XO2PQaO'#DeO2_QgO'#DeO2oQgO'#DkOOQP'#Dk'#DkQ)jQaOOO3PQdO'#CsOOQO,59^,59^O3kQdO'#CuOOQO,59`,59`OOQO,59c,59cO4VQdO,59cO4aQdO'#CzO4kQ`O'#CzOOQO,59b,59bOOQU,5:Q,5:QOOQR1G.v1G.vO4pQ`O1G.vOOQU-E7d-E7dO4xQdO,59kOOQO,59k,59kO5SQdO'#DQO5^Q`O'#DQOOQO,5:d,5:dOOQU,5:R,5:ROOQR1G/U1G/UO5cQ`O1G/UOOQU-E7e-E7eO5kQgO'#DhO5xQcO1G/XOOQR1G/X1G/XOOQR,59q,59qO6TQgO,59qO6eQdO'#DiO6lQgO'#DiO7PQcO1G/[OOQR1G/[1G/[OOQR,59r,59rO#|QfO,59rOOQR1G/b1G/bO7_OWO1G/bO7dOaO1G/bOOQR,59y,59yOOQR,59{,59{OOQP1G/h1G/hO7lOaO1G/hO7tOaO1G/hO8POaO1G/hOOQP1G.s1G.sO8_QgO,5:POOQP,5:P,5:POOQP,5:V,5:VOOQP-E7i-E7iOOQO,59_,59_OOQO,59a,59aOOQO1G.}1G.}OOQO,59f,59fO8oQdO,59fOOQR7+$b7+$bP,XQ`O'#DfOOQO1G/V1G/VOOQO,59l,59lO8yQdO,59lOOQR7+$p7+$pP9TQ`O'#DgOOQR'#DT'#DTOOQR,5:S,5:SOOQR-E7f-E7fOOQR7+$s7+$sOOQR1G/]1G/]O9YQgO'#DYO9jQ`O'#DYOOQR,5:T,5:TO#|QfO'#DZO9oQcO'#DZOOQR-E7g-E7gOOQR7+$v7+$vOOQR1G/^1G/^OOQR7+$|7+$|O:QOWO7+$|OOQP7+%S7+%SO:VOaO7+%SO:_OaO7+%SOOQP1G/k1G/kOOQO1G/Q1G/QOOQO1G/W1G/WOOQR,59t,59tO:jQgO,59tOOQR,59u,59uO#|QfO,59uOOQR<<Hh<<HhOOQP<<Hn<<HnO:zOaO<<HnOOQR1G/`1G/`OOQR1G/a1G/aOOQPAN>YAN>Y",stateData:";S~O!fOS!gOS^OS~OP_OQbORSOTUOWROXROYYOZZO[XOcPOqQO!PVO!V[O!cTO~O`cO~P]OVkOWROXROYeOZfO[dOcPOmhOqQO~OboO~P!bOVtOWROXROYeOZfO[dOcPOmrOqQO~OpwO~P#WORSOTUOWROXROYYOZZO[XOcPOqQO!PVO!cTO~OSvP!avP!bvP~P#|OWROXROYeOZfO[dOcPOqQO~OmzO~P%OOm!OOUzP!azP!bzP!dzP~P#|O^!SO!b!QO!f!TO!g!RO~ORSOTUOWROXROcPOqQO!PVO!cTO~OY!UOP!QXQ!QX!V!QX!`!QXS!QX!a!QX!b!QXU!QXm!QX!d!QX~P&aO[!WOP!SXQ!SX!V!SX!`!SXS!SX!a!SX!b!SXU!SXm!SX!d!SX~P&aO^!ZO!W![O!b!YO!f!]O!g!YO~OP!_O!V[OQaX!`aX~OPaXQaX!VaX!`aX~P#|OP!bOQ!cO!V[O~OP_O!V[O~P#|OWROXROY!fOcPOqQObfXmfXofXpfX~OWROXRO[!hOcPOqQObhXmhXohXphX~ObeXmlXoeX~ObkXokX~P%OOm!kO~Om!lObnPonP~P%OOb!pOo!oO~Ob!pO~P!bOm!sOosXpsX~OosXpsX~P%OOm!uOotPptP~P%OOo!xOp!yO~Op!yO~P#WOS!|O!a#OO!b#OO~OUyX!ayX!byX!dyX~P#|Om#QO~OU#SO!a#UO!b#UO!d#RO~Om#WOUzX!azX!bzX!dzX~O]#XO~O!b#XO!g#YO~O^#ZO!b#XO!g#YO~OP!RXQ!RX!V!RX!`!RXS!RX!a!RX!b!RXU!RXm!RX!d!RX~P&aOP!TXQ!TX!V!TX!`!TXS!TX!a!TX!b!TXU!TXm!TX!d!TX~P&aO!b#^O!g#^O~O^#_O!b#^O!f#`O!g#^O~O^#_O!W#aO!b#^O!g#^O~OPaaQaa!Vaa!`aa~P#|OP#cO!V[OQ!XX!`!XX~OP!XXQ!XX!V!XX!`!XX~P#|OP_O!V[OQ!_X!`!_X~P#|OWROXROcPOqQObgXmgXogXpgX~OWROXROcPOqQObiXmiXoiXpiX~Obkaoka~P%OObnXonX~P%OOm#kO~Ob#lOo!oO~Oosapsa~P%OOotXptX~P%OOm#pO~Oo!xOp#qO~OSwP!awP!bwP~P#|OS!|O!a#vO!b#vO~OUya!aya!bya!dya~P#|Om#xO~P%OOm#{OU}P!a}P!b}P!d}P~P#|OU#SO!a$OO!b$OO!d#RO~O]$QO~O!b$QO!g$RO~O!b$SO!g$SO~O^$TO!b$SO!g$SO~O^$TO!b$SO!f$UO!g$SO~OP!XaQ!Xa!V!Xa!`!Xa~P#|Obnaona~P%OOotapta~P%OOo!xO~OU|X!a|X!b|X!d|X~P#|Om$ZO~Om$]OU}X!a}X!b}X!d}X~O]$^O~O!b$_O!g$_O~O^$`O!b$_O!g$_O~OU|a!a|a!b|a!d|a~P#|O!b$cO!g$cO~O",goto:",]!mPPPPPPPPPPPPPPPPP!nPP!v#v#|$`#|$c$f$j$nP%VPPP!v%Y%^%a%{&O%a&R&U&X&_&b%aP&e&{&e'O'RPP']'a'g'm's'y(XPPPPPPPP(_)e*X+c,VUaObcR#e!c!{ROPQSTUXY_bcdehknrtvz!O!U!W!_!b!c!f!h!k!l!s!u!|#Q#R#S#W#c#k#p#x#{$Z$]QmPR!qnqfPQThknrtv!k!l!s!u#R#k#pR!gdR!ieTlPnTjPnSiPnSqQvQ{TQ!mkQ!trQ!vtR#y#RR!nkTsQvR!wt!RWOSUXY_bcz!O!U!W!_!b!c!|#Q#S#W#c#x#{$Z$]RySR#t!|R|TR|UQ!PUR#|#SR#z#RR#z#SyZOSU_bcz!O!_!b!c!|#Q#S#W#c#x#{$Z$]R!VXR!XYa]O^abc!a!c!eT!da!eQnPR!rnQvQR!{vQ!}yR#u!}Q#T|R#}#TW^Obc!cS!^^!aT!aa!eQ!eaR#f!eW`Obc!cQxSS}U#SQ!`_Q#PzQ#V!OQ#b!_Q#d!bQ#s!|Q#w#QQ$P#WQ$V#cQ$Y#xQ$[#{Q$a$ZR$b$]xZOSU_bcz!O!_!b!c!|#Q#S#W#c#x#{$Z$]Q!VXQ!XYQ#[!UR#]!W!QWOSUXY_bcz!O!U!W!_!b!c!|#Q#S#W#c#x#{$Z$]pfPQThknrtv!k!l!s!u#R#k#pQ!gdQ!ieQ#g!fR#h!hSgPn^pQTkrtv#RQ!jhQ#i!kQ#j!lQ#n!sQ#o!uQ$W#kR$X#pQuQR!zv",nodeNames:"⚠ DirectiveEnd DocEnd - - ? ? ? Literal QuotedLiteral Anchor Alias Tag BlockLiteralContent Comment Stream BOM Document ] [ FlowSequence Item Tagged Anchored Anchored Tagged FlowMapping Pair Key : Pair , } { FlowMapping Pair Pair BlockSequence Item Item BlockMapping Pair Pair Key Pair Pair BlockLiteral BlockLiteralHeader Tagged Anchored Anchored Tagged Directive DirectiveName DirectiveContent Document",maxTerm:74,context:v1,nodeProps:[["isolate",-3,8,9,14,""],["openedBy",18,"[",32,"{"],["closedBy",19,"]",33,"}"]],propSources:[P1],skippedNodes:[0],repeatNodeCount:6,tokenData:"-Y~RnOX#PXY$QYZ$]Z]#P]^$]^p#Ppq$Qqs#Pst$btu#Puv$yv|#P|}&e}![#P![!]'O!]!`#P!`!a'i!a!}#P!}#O*g#O#P#P#P#Q+Q#Q#o#P#o#p+k#p#q'i#q#r,U#r;'S#P;'S;=`#z<%l?HT#P?HT?HU,o?HUO#PQ#UU!WQOY#PZp#Ppq#hq;'S#P;'S;=`#z<%lO#PQ#kTOY#PZs#Pt;'S#P;'S;=`#z<%lO#PQ#}P;=`<%l#P~$VQ!f~XY$Qpq$Q~$bO!g~~$gS^~OY$bZ;'S$b;'S;=`$s<%lO$b~$vP;=`<%l$bR%OX!WQOX%kXY#PZ]%k]^#P^p%kpq#hq;'S%k;'S;=`&_<%lO%kR%rX!WQ!VPOX%kXY#PZ]%k]^#P^p%kpq#hq;'S%k;'S;=`&_<%lO%kR&bP;=`<%l%kR&lUoP!WQOY#PZp#Ppq#hq;'S#P;'S;=`#z<%lO#PR'VUmP!WQOY#PZp#Ppq#hq;'S#P;'S;=`#z<%lO#PR'p[!PP!WQOY#PZp#Ppq#hq{#P{|(f|}#P}!O(f!O!R#P!R![)p![;'S#P;'S;=`#z<%lO#PR(mW!PP!WQOY#PZp#Ppq#hq!R#P!R![)V![;'S#P;'S;=`#z<%lO#PR)^U!PP!WQOY#PZp#Ppq#hq;'S#P;'S;=`#z<%lO#PR)wY!PP!WQOY#PZp#Ppq#hq{#P{|)V|}#P}!O)V!O;'S#P;'S;=`#z<%lO#PR*nUcP!WQOY#PZp#Ppq#hq;'S#P;'S;=`#z<%lO#PR+XUbP!WQOY#PZp#Ppq#hq;'S#P;'S;=`#z<%lO#PR+rUqP!WQOY#PZp#Ppq#hq;'S#P;'S;=`#z<%lO#PR,]UpP!WQOY#PZp#Ppq#hq;'S#P;'S;=`#z<%lO#PR,vU`P!WQOY#PZp#Ppq#hq;'S#P;'S;=`#z<%lO#P",tokenizers:[w1,k1,A1,$1,0,1],topRules:{Stream:[0,15]},tokenPrec:0}),T1=fr.define({name:"yaml",parser:M1.configure({props:[wf.add({Stream:i=>{for(let e=i.node.resolve(i.pos,-1);e&&e.to>=i.pos;e=e.parent){if(e.name=="BlockLiteralContent"&&e.from<e.to)return i.baseIndentFor(e);if(e.name=="BlockLiteral")return i.baseIndentFor(e)+i.unit;if(e.name=="BlockSequence"||e.name=="BlockMapping")return i.column(e.firstChild.from,1);if(e.name=="QuotedLiteral")return null;if(e.name=="Literal"){let t=i.column(e.from,1);if(t==i.lineIndent(e.from,1))return t;if(e.to>i.pos)return null}}return null},FlowMapping:qh({closing:"}"}),FlowSequence:qh({closing:"]"})}),Cf.add({"FlowMapping FlowSequence":A0,"Item Pair BlockLiteral":(i,e)=>({from:e.doc.lineAt(i.from).to,to:i.to})})]}),languageData:{commentTokens:{line:"#"},indentOnInput:/^\s*[\]\}]$/}});function D1(){return new g0(T1)}const E1="#e5c07b",Mc="#e06c75",R1="#56b6c2",B1="#ffffff",Kn="#abb2bf",Ma="#7d8799",_1="#61afef",L1="#98c379",Tc="#d19a66",I1="#c678dd",N1="#21252b",Dc="#2c313a",Ec="#282c34",Do="#353a42",z1="#3E4451",Rc="#528bff",F1=E.theme({"&":{color:Kn,backgroundColor:Ec},".cm-content":{caretColor:Rc},".cm-cursor, .cm-dropCursor":{borderLeftColor:Rc},"&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":{backgroundColor:z1},".cm-panels":{backgroundColor:N1,color:Kn},".cm-panels.cm-panels-top":{borderBottom:"2px solid black"},".cm-panels.cm-panels-bottom":{borderTop:"2px solid black"},".cm-searchMatch":{backgroundColor:"#72a1ff59",outline:"1px solid #457dff"},".cm-searchMatch.cm-searchMatch-selected":{backgroundColor:"#6199ff2f"},".cm-activeLine":{backgroundColor:"#6699ff0b"},".cm-selectionMatch":{backgroundColor:"#aafe661a"},"&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket":{backgroundColor:"#bad0f847"},".cm-gutters":{backgroundColor:Ec,color:Ma,border:"none"},".cm-activeLineGutter":{backgroundColor:Dc},".cm-foldPlaceholder":{backgroundColor:"transparent",border:"none",color:"#ddd"},".cm-tooltip":{border:"none",backgroundColor:Do},".cm-tooltip .cm-tooltip-arrow:before":{borderTopColor:"transparent",borderBottomColor:"transparent"},".cm-tooltip .cm-tooltip-arrow:after":{borderTopColor:Do,borderBottomColor:Do},".cm-tooltip-autocomplete":{"& > ul > li[aria-selected]":{backgroundColor:Dc,color:Kn}}},{dark:!0}),H1=cn.define([{tag:v.keyword,color:I1},{tag:[v.name,v.deleted,v.character,v.propertyName,v.macroName],color:Mc},{tag:[v.function(v.variableName),v.labelName],color:_1},{tag:[v.color,v.constant(v.name),v.standard(v.name)],color:Tc},{tag:[v.definition(v.name),v.separator],color:Kn},{tag:[v.typeName,v.className,v.number,v.changed,v.annotation,v.modifier,v.self,v.namespace],color:E1},{tag:[v.operator,v.operatorKeyword,v.url,v.escape,v.regexp,v.link,v.special(v.string)],color:R1},{tag:[v.meta,v.comment],color:Ma},{tag:v.strong,fontWeight:"bold"},{tag:v.emphasis,fontStyle:"italic"},{tag:v.strikethrough,textDecoration:"line-through"},{tag:v.link,color:Ma,textDecoration:"underline"},{tag:v.heading,fontWeight:"bold",color:Mc},{tag:[v.atom,v.bool,v.special(v.variableName)],color:Tc},{tag:[v.processingInstruction,v.string,v.inserted],color:L1},{tag:v.invalid,color:B1}]),W1=[F1,Rf(H1)];var q1=Object.defineProperty,Q1=Object.getOwnPropertyDescriptor,Sl=(i,e,t,s)=>{for(var n=s>1?void 0:s?Q1(e,t):e,r=i.length-1,o;r>=0;r--)(o=i[r])&&(n=(s?o(e,t,n):o(n))||n);return s&&n&&q1(e,t,n),n};function Bc(i){const e=[];return/(^|\s)!include\s/m.test(i)&&e.push("This config uses !include which is not supported. ESPHome compile will fail — only single-file configs are allowed."),/(^|\s)packages:/m.test(i)&&e.push("This config uses packages: which is not supported in V1. Each device must be a single YAML file."),e}let tn=class extends ne{constructor(){super(...arguments),this.value="",this.readonly=!1,this.editorView=null,this._resizeObserver=null}disconnectedCallback(){this.destroyEditor(),super.disconnectedCallback()}destroyEditor(){this._resizeObserver&&(this._resizeObserver.disconnect(),this._resizeObserver=null),this.editorView&&(this.editorView.destroy(),this.editorView=null)}initEditor(){var t;this.destroyEditor();const i=(t=this.shadowRoot)==null?void 0:t.querySelector(".editor-container");if(!i)return;const e=q.create({doc:this.value,extensions:[Vv,D1(),W1,q.readOnly.of(this.readonly),E.updateListener.of(s=>{s.docChanged&&(this.value=s.state.doc.toString(),this.dispatchEvent(new CustomEvent("content-change",{detail:{content:this.value,warnings:Bc(this.value)},bubbles:!0,composed:!0})))})]});this.editorView=new E({state:e,parent:i}),this._resizeObserver=new ResizeObserver(()=>{var s;(s=this.editorView)==null||s.requestMeasure()}),this._resizeObserver.observe(i)}updated(i){i.has("readonly")?this.initEditor():this.editorView&&i.has("value")&&!i.get("value")&&this.initEditor()}firstUpdated(){this.initEditor()}getContent(){var i;return((i=this.editorView)==null?void 0:i.state.doc.toString())??this.value}getWarnings(){return Bc(this.getContent())}render(){return g`<div class="editor-container"></div>`}};tn.styles=me`
    :host {
      display: block;
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }
    .editor-container {
      min-height: 400px;
      max-height: 60vh;
      overflow: auto;
      background: #282c34;
    }
    .editor-container .cm-editor {
      height: 100%;
    }
    .editor-container .cm-editor .cm-scroller {
      font-family: ui-monospace, "SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace;
      font-size: 13px;
      line-height: 1.5;
    }
  `;Sl([Q({type:String})],tn.prototype,"value",2);Sl([Q({type:Boolean})],tn.prototype,"readonly",2);tn=Sl([be("esp-config-editor")],tn);var V1=Object.defineProperty,U1=Object.getOwnPropertyDescriptor,Li=(i,e,t,s)=>{for(var n=s>1?void 0:s?U1(e,t):e,r=i.length-1,o;r>=0;r--)(o=i[r])&&(n=(s?o(e,t,n):o(n))||n);return s&&n&&V1(e,t,n),n};let Nt=class extends ne{constructor(){super(...arguments),this.mac="",this.hasConfig=!1,this.phase="idle",this.result=null,this.error="",this.acceptedWarnings=!1}async triggerCompile(){var i;if(this.phase!=="compiling"){this.phase="compiling",this.error="",this.result=null,this.acceptedWarnings=!1;try{this.result=await O.compileDevice(this.mac);const e=(i=this.result.job)==null?void 0:i.status;e==="compiling"||e==="compile_queued"?this.phase="success":this.phase="success"}catch(e){this.error=e instanceof Error?e.message:String(e),this.phase="failed"}}}async flashNow(){try{const{job:i}=await O.startCompileFlash(this.mac);i&&(window.location.hash=`/device/${encodeURIComponent(this.mac)}`)}catch(i){this.error=i instanceof Error?i.message:String(i)}}downloadFactory(){const i=O.downloadFactoryBinary(this.mac);window.open(i,"_blank")}render(){var i,e,t,s,n;return g`
      <div class="compile-section">
        ${this.phase==="idle"?g`
              <button class="btn btn-primary" ?disabled=${!this.hasConfig} @click=${this.triggerCompile}>
                ${this.hasConfig?"Compile & Install":"No config to compile"}
              </button>
            `:this.phase==="compiling"?g`<button class="btn compiling" disabled>Compiling...</button>`:this.phase==="success"?g`
                  <div class="success-banner">&#10003; Build submitted</div>
                  ${(e=(i=this.result)==null?void 0:i.preflight)!=null&&e.metadata_unavailable?g`<p class="meta-unavailable">Metadata not available for ESP8266 Arduino firmware.</p>`:(t=this.result)!=null&&t.preflight?g`
                          ${this.preflightTable(this.result.preflight)}
                          ${this.result.preflight.has_warnings?g`
                                <div class="warnings">
                                  ${this.result.preflight.warnings.map(r=>g`<p>${r}</p>`)}
                                  <label>
                                    <input type="checkbox" .checked=${this.acceptedWarnings} @change=${r=>this.acceptedWarnings=r.target.checked} />
                                    Flash anyway
                                  </label>
                                </div>
                              `:y}
                        `:y}
                  <div class="action-row">
                    <button class="btn flash-btn" ?disabled=${((n=(s=this.result)==null?void 0:s.preflight)==null?void 0:n.has_warnings)&&!this.acceptedWarnings} @click=${this.flashNow}>&#9654; Flash via ESP-NOW</button>
                    <button class="btn download-btn" @click=${this.downloadFactory}>&#8595; Download factory .bin</button>
                  </div>
                  <p class="hint">The build has been queued. You can monitor progress on the config page.</p>
                `:this.phase==="failed"?g`
                    <div class="fail-banner">&#10007; Build failed</div>
                    ${this.error?g`<p class="error-msg">${this.error}</p>`:y}
                    <p class="hint">Fix the YAML above and try again.</p>
                    <a class="view-logs-link" href=${`#/device/${encodeURIComponent(this.mac)}/config`}>View build log →</a>
                  `:y}
      </div>
    `}preflightTable(i){const e=i.chip,t=i.name,s=i.build_date;return g`
      <div class="preflight-section">
        <h4>Preflight</h4>
        <table class="preflight-table">
          <tr>
            <td>Name</td>
            <td>
              ${t.new||"-"}
              <span class="badge ${t.match?"match":"mismatch"}">${t.match?"MATCH":"MISMATCH"}</span>
            </td>
          </tr>
          <tr>
            <td>Build</td>
            <td>
              ${s.status!=="unknown"&&s.delta?`${s.status.toUpperCase()} ${s.delta}`:s.status.toUpperCase()}
            </td>
          </tr>
          <tr>
            <td>Chip</td>
            <td>
              ${e.new||"-"}
              <span class="badge ${e.match?"match":"mismatch"}">${e.match?"MATCH":"MISMATCH"}</span>
            </td>
          </tr>
        </table>
        ${i.has_warnings?g`<div class="warnings">${i.warnings.map(n=>g`<p>${n}</p>`)}</div>`:y}
      </div>
    `}};Nt.styles=me`
    .compile-section {
      margin-top: 8px;
    }
    .compile-btn {
      border: 1px solid var(--ok);
      background: var(--ok);
      color: white;
      padding: 8px 18px;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border-radius: 8px;
      min-width: 200px;
      transition: all 0.12s;
    }
    .compile-btn:hover {
      background: #16a34a;
    }
    .compile-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .compile-btn.compiling {
      background: var(--accent);
      border-color: var(--accent);
    }
    .btn-primary {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }
    .btn-primary:hover {
      background: #0d4d5e;
    }
    .success-banner {
      background: #dcfce7;
      color: #166534;
      border: 1px solid var(--ok);
      border-radius: 8px;
      padding: 8px 12px;
      font-weight: 600;
      font-size: 14px;
    }
    .fail-banner {
      background: #fef2f2;
      color: #991b1b;
      border: 1px solid var(--danger);
      border-radius: 8px;
      padding: 8px 12px;
      font-weight: 600;
      font-size: 14px;
    }
    .summary-row {
      display: flex;
      gap: 12px;
      padding: 8px 0;
      font-size: 13px;
      color: var(--muted);
    }
    .build-meta { font-weight: 500; }
    .build-sizes { font-weight: 500; color: var(--ink); }

    .preflight-section {
      margin: 8px 0;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
    }
    .preflight-section h4 {
      margin: 0 0 6px;
      font-size: 12px;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 600;
    }
    .preflight-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .preflight-table td {
      padding: 4px 0;
    }
    .preflight-table td:first-child {
      font-weight: 500;
      color: var(--muted);
      width: 80px;
    }
    .badge {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 6px;
      font-size: 10px;
      font-weight: 600;
      border-radius: 4px;
    }
    .badge.match { background: #dcfce7; color: #166534; }
    .badge.mismatch { background: #fef2f2; color: #991b1b; }
    .warnings { margin-top: 6px; border-left: 4px solid var(--accent); background: #fffbeb; padding: 12px; border-radius: 6px; display: grid; gap: 8px; }
    .warnings p {
      margin: 0;
      font-size: 13px;
      color: #7c3f00;
    }
    .warnings label {
      font-weight: 500;
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .action-row {
      display: flex;
      gap: 8px;
      margin: 10px 0;
    }
    .meta-unavailable {
      color: var(--muted);
      font-style: italic;
      margin: 8px 0;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      transition: all 0.12s;
    }
    .btn:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }
    .flash-btn {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }
    .flash-btn:hover {
      background: #0d4d5e;
    }
    .download-btn {
      background: var(--surface);
    }
    .hint {
      font-size: 11px;
      color: var(--muted);
      font-style: italic;
    }
    .error-msg {
      color: var(--danger);
      font-size: 13px;
      font-weight: 500;
    }
    .view-logs-link {
      display: inline-block;
      margin-top: 8px;
      color: var(--primary);
      font-size: 12px;
      font-weight: 500;
    }
  `;Li([Q({type:String})],Nt.prototype,"mac",2);Li([Q({type:Boolean})],Nt.prototype,"hasConfig",2);Li([w()],Nt.prototype,"phase",2);Li([w()],Nt.prototype,"result",2);Li([w()],Nt.prototype,"error",2);Li([w()],Nt.prototype,"acceptedWarnings",2);Nt=Li([be("esp-compile-status")],Nt);var j1=Object.defineProperty,X1=Object.getOwnPropertyDescriptor,ae=(i,e,t,s)=>{for(var n=s>1?void 0:s?X1(e,t):e,r=i.length-1,o;r>=0;r--)(o=i[r])&&(n=(s?o(e,t,n):o(n))||n);return s&&n&&j1(e,t,n),n};let se=class extends ne{constructor(){super(...arguments),this.mac="",this.state="loading",this.device=null,this.config=null,this.editorContent="",this.saveIndicator="",this.error="",this.compilePhase="idle",this.compileJobId=null,this.compileQueuePosition=null,this.preflight=null,this.acceptedWarnings=!1,this.yamlWarnings=[],this.showCompileLog=!0,this.serialPanelOpen=!1,this.serialPorts=[],this.selectedSerialPort="",this.serialPortsLoading=!1,this.serialStatus=null,this.serialError="",this.serialLogs=[],this.pollTimer=null,this.serialPollTimer=null,this.serialEventSource=null}connectedCallback(){super.connectedCallback(),this.load()}disconnectedCallback(){this.stopPolling(),this.stopSerialPolling(),this.closeSerialLog(),super.disconnectedCallback()}startPolling(){this.pollTimer||(this.pollTimer=setInterval(()=>this.pollCompileStatus(),2e3))}stopPolling(){this.pollTimer&&(clearInterval(this.pollTimer),this.pollTimer=null)}startSerialPolling(){this.serialPollTimer||(this.serialPollTimer=setInterval(()=>void this.pollSerialFlashStatus(),1e3))}stopSerialPolling(){this.serialPollTimer&&(clearInterval(this.serialPollTimer),this.serialPollTimer=null)}closeSerialLog(){this.serialEventSource&&(this.serialEventSource.close(),this.serialEventSource=null)}async load(){this.state="loading";try{const[i,e]=await Promise.all([O.device(this.mac).catch(()=>null),O.getConfig(this.mac).catch(()=>null)]);this.device=i||{},e&&e.has_config?(this.config=e,this.editorContent=this.config.content,this.state="editor"):this.state="no_config",await this.pollCompileStatus()}catch{this.state="no_config"}}async pollCompileStatus(){try{const i=await O.getCompileStatus(this.mac);i.status==="compile_queued"?(this.compilePhase="compile_queued",this.compileJobId=i.job_id,this.compileQueuePosition=i.queue_position,this.startPolling()):i.status==="compiling"?(this.compilePhase="compiling",this.compileJobId=i.job_id,this.compileQueuePosition=null,this.startPolling()):i.status==="queued"?(this.compilePhase="queued_for_flash",this.compileJobId=i.job_id,this.compileQueuePosition=i.queue_position,this.startPolling()):["starting","transferring","verifying","transfer_success_waiting_rejoin"].includes(i.status)?(this.compilePhase="queued_for_flash",this.compileJobId=i.job_id,this.compileQueuePosition=null,this.startPolling()):["success","aborted","rejoin_timeout","version_mismatch"].includes(i.status)?(this.compilePhase="idle",this.compileJobId=null,this.compileQueuePosition=null,this.stopPolling()):i.status==="idle"?(this.compilePhase==="queued_for_flash"?(this.compilePhase="idle",this.compileJobId=null,this.compileQueuePosition=null):(this.compilePhase==="compile_queued"||this.compilePhase==="compiling")&&(this.compilePhase="idle",this.compileJobId=null,this.compileQueuePosition=null),this.stopPolling()):i.status==="failed"?(this.compilePhase="failed",this.compileJobId=null,this.compileQueuePosition=null,this.stopPolling()):i.error&&(this.compilePhase="failed",this.error=i.error,this.stopPolling())}catch{}}async createScaffold(){try{const i=await O.saveConfig(this.mac,"",!0);this.config=i,this.editorContent=i.content,this.state="editor"}catch(i){this.error=i instanceof Error?i.message:String(i)}}async importYaml(){const i=document.createElement("input");i.type="file",i.accept=".yaml,.yml",i.onchange=async()=>{var t;const e=(t=i.files)==null?void 0:t[0];if(e)try{const s=await O.importConfig(this.mac,e);this.config=s,this.editorContent=s.content,this.state="editor"}catch(s){this.error=s instanceof Error?s.message:String(s)}},i.click()}async saveConfig(){this.saveIndicator="Saving...";try{const i=await O.saveConfig(this.mac,this.editorContent);this.config=i,this.saveIndicator="Saved ✓",setTimeout(()=>{this.saveIndicator="",this.requestUpdate()},2e3)}catch(i){this.saveIndicator="",this.error=i instanceof Error?i.message:String(i)}}onEditorChange(i){this.editorContent=i.detail.content,this.yamlWarnings=i.detail.warnings??[],this.saveIndicator=""}async triggerCompile(){if(!(this.compilePhase==="compiling"||this.compilePhase==="compile_queued")){this.compilePhase="compiling",this.error="",this.showCompileLog=!0,this.acceptedWarnings=!1;try{const i=await O.compileDevice(this.mac);this.compileJobId=i.job.id,this.preflight=i.preflight||null,i.job.status==="compile_queued"?(this.compilePhase="compile_queued",this.compileQueuePosition=i.queue_position):i.job.status==="compiling"&&(this.compilePhase="compiling",this.compileQueuePosition=null),this.startPolling()}catch(i){this.compilePhase="failed",this.error=i instanceof Error?i.message:String(i)}}}async cancelCompile(){try{await O.cancelCompile(this.mac),this.compilePhase="idle",this.compileJobId=null,this.compileQueuePosition=null,this.stopPolling()}catch(i){this.error=i instanceof Error?i.message:String(i)}}async flashNow(){try{await O.startCompileFlash(this.mac),window.location.hash=`/device/${encodeURIComponent(this.mac)}`}catch(i){this.error=i instanceof Error?i.message:String(i)}}downloadFactory(){window.open(O.downloadFactoryBinary(this.mac),"_blank")}async openSerialPanel(i=!1){if(this.serialPanelOpen=!0,this.serialError="",!(!i&&this.serialPorts.length>0)){this.serialPortsLoading=!0;try{const e=await O.getSerialPorts();this.serialPorts=e.ports;const t=this.serialPorts.find(s=>s.available)||this.serialPorts[0];this.selectedSerialPort=(t==null?void 0:t.port)||"",this.serialPorts.length===0&&(this.serialError="No serial ports are visible to the add-on.")}catch(e){this.serialError=e instanceof Error?e.message:String(e)}finally{this.serialPortsLoading=!1}}}beginSerialLog(){this.closeSerialLog(),this.serialEventSource=O.streamSerialFlashLogs(this.mac,i=>{this.serialLogs=[...this.serialLogs,i]},i=>{this.serialStatus&&(this.serialStatus={...this.serialStatus,status:i})},()=>{this.closeSerialLog()})}async startSerialFlash(){var i;if(!this.selectedSerialPort){this.serialError="Select a serial port first.";return}this.serialError="",this.serialLogs=[],this.serialStatus={status:"starting",esphome_name:String(((i=this.device)==null?void 0:i.esphome_name)||""),port:this.selectedSerialPort,error:null};try{await O.startSerialFlash(this.mac,this.selectedSerialPort),this.beginSerialLog(),this.startSerialPolling(),await this.pollSerialFlashStatus()}catch(e){this.closeSerialLog(),this.serialStatus={...this.serialStatus,status:"failed",error:e instanceof Error?e.message:String(e)},this.serialError=e instanceof Error?e.message:String(e)}}async pollSerialFlashStatus(){try{const i=await O.getSerialFlashStatus(this.mac);this.serialStatus=i,(i.status==="success"||i.status==="failed"||i.status==="idle")&&(this.stopSerialPolling(),this.closeSerialLog()),i.error&&(this.serialError=i.error)}catch{}}async cancelSerialFlash(){try{await O.cancelSerialFlash(this.mac),await this.pollSerialFlashStatus()}catch(i){this.serialError=i instanceof Error?i.message:String(i)}}goBack(){window.location.hash=`/device/${encodeURIComponent(this.mac)}`}goToSecrets(){window.location.hash="/secrets"}render(){var s,n,r,o,a,l;const i=String(((s=this.device)==null?void 0:s.esphome_name)||((n=this.device)==null?void 0:n.label)||this.mac),e=String(((r=this.device)==null?void 0:r.chip_name)||"-"),t=!!((o=this.device)!=null&&o.online);return g`
      <div class="config-page" data-job-id=${this.compileJobId??""}>
        <header class="config-header">
          <button class="back" @click=${this.goBack}>&#8592; Back to device</button>
          <div class="header-info">
            <h2>${i}</h2>
            <p>${this.mac} &middot; ${e} &middot; <span class=${t?"ok":"danger"}>${t?"online":"offline"}</span></p>
          </div>
          <button class="secrets-link" @click=${this.goToSecrets}>Secrets &#9881;</button>
        </header>

        ${this.state==="loading"?g`<div class="card">Loading config...</div>`:this.state==="no_config"?g`
                <div class="card no-config">
                  <h3>No configuration yet for this device.</h3>
                  <div class="no-config-actions">
                    <button class="btn btn-primary" @click=${this.createScaffold}>Create Config</button>
                    <button class="btn" @click=${this.importYaml}>Import YAML</button>
                  </div>
                  <p class="hint">Create Config generates a minimal scaffold populated from this device's topology data.</p>
                  <p class="hint">Import lets you upload an existing YAML file.</p>
                  ${this.error?g`<p class="error">${this.error}</p>`:y}
                </div>
              `:this.state==="editor"?g`
                    <esp-config-editor
                    .value=${this.editorContent}
                    .readonly=${this.compilePhase==="compiling"||this.compilePhase==="compile_queued"}
                    @content-change=${this.onEditorChange}
                  ></esp-config-editor>

                  ${this.yamlWarnings.length>0?g`<div class="yaml-warnings">${this.yamlWarnings.map(h=>g`<p>&#9888; ${h}</p>`)}</div>`:y}

                  <esp-compile-log-viewer
                    .mac=${this.mac}
                    .visible=${(this.compilePhase==="compiling"||this.compilePhase==="compile_queued"||this.compilePhase==="queued_for_flash"||this.compilePhase==="failed")&&this.showCompileLog}
                  ></esp-compile-log-viewer>

                  ${this.compilePhase==="compile_queued"?g`
                        <div class="queue-banner">
                          <strong>&#9203; Position ${this.compileQueuePosition!==null?this.compileQueuePosition:"?"} in compile queue</strong>
                          <small>Waiting for compile slot...</small>
                          <button class="cancel-btn" @click=${this.cancelCompile}>Cancel</button>
                        </div>
                      `:y}

                  <div class="action-bar">
                    <button class="btn btn-primary" @click=${this.saveConfig} ?disabled=${this.compilePhase==="compiling"||this.compilePhase==="compile_queued"}>
                      ${this.saveIndicator||"Save"}
                    </button>
                    ${this.compilePhase==="idle"||this.compilePhase==="failed"?g`<button class="btn btn-success" ?disabled=${!this.config} @click=${this.triggerCompile}>Compile & Install</button>`:this.compilePhase==="compiling"||this.compilePhase==="compile_queued"?g`<button class="btn btn-danger" @click=${this.cancelCompile}>Cancel</button>`:y}
                  </div>

                  ${this.compilePhase==="compiling"?g`<p class="status-line">Status: compiling... <button class="cancel-link" @click=${this.cancelCompile}>Cancel</button></p>`:this.compilePhase==="compile_queued"?g`<p class="status-line">Status: waiting to compile (#${this.compileQueuePosition!==null?this.compileQueuePosition:"?"})</p>`:g`<p class="status-line">Status: ${this.saveIndicator?"saved":"unsaved"}</p>`}

                  ${this.error&&this.compilePhase!=="compiling"?g`<p class="error">${this.error}</p>`:y}

                  ${this.compilePhase==="queued_for_flash"?g`
                        <div class="success-section">
                          <div class="success-banner">&#10003; Build successful</div>
                          <p class="build-info">${i} &middot; ready for flash</p>
                          ${this.preflight?this.renderPreflight():y}
                          ${(a=this.preflight)!=null&&a.has_warnings?g`
                                <div class="warnings">
                                  ${this.preflight.warnings.map(h=>g`<p>${h}</p>`)}
                                  <label>
                                    <input type="checkbox" .checked=${this.acceptedWarnings} @change=${h=>this.acceptedWarnings=h.target.checked} />
                                    Flash anyway
                                  </label>
                                </div>
                              `:y}
                          ${this.compileQueuePosition!==null&&this.compileQueuePosition>1?g`<p class="build-info">&#9203; Position ${this.compileQueuePosition} in flash queue</p>`:y}
                  <div class="flash-actions">
                    <button class="btn btn-primary" ?disabled=${((l=this.preflight)==null?void 0:l.has_warnings)&&!this.acceptedWarnings} @click=${this.flashNow}>&#9654; Flash via ESP-NOW</button>
                    <button class="btn" @click=${this.downloadFactory}>&#8595; Download factory .bin</button>
                    <button class="btn" @click=${()=>this.openSerialPanel()}>Flash via USB</button>
                  </div>
                          ${this.serialPanelOpen?this.renderSerialFlashPanel():y}
                          <p class="hint">You can also monitor progress on the device page.</p>
                        </div>
                      `:y}

                  ${this.compilePhase==="failed"?g`
                        <div class="fail-section">
                          <div class="fail-banner">
                            <span>&#10007; Build failed</span>
                            ${this.showCompileLog?g`<button class="close-logs-link" @click=${()=>{this.showCompileLog=!1}}>Hide logs</button>`:g`<button class="close-logs-link" @click=${()=>{this.showCompileLog=!0}}>Show logs</button>`}
                          </div>
                          <p class="hint">Fix the YAML above and try again.</p>
                        </div>
                      `:y}
                `:y}
      </div>
    `}renderPreflight(){const i=this.preflight;return i?g`
      <table class="compare-table">
        <thead><tr><th>Field</th><th>Current</th><th>New</th></tr></thead>
        <tbody>
          <tr>
            <td>Name</td>
            <td>${i.name.current||"-"}</td>
            <td>${i.name.new||"-"} <span class="ver-badge ${i.name.match?"match":"mismatch"}">${i.name.match?"MATCH":"MISMATCH"}</span></td>
          </tr>
          <tr>
            <td>Chip</td>
            <td>${i.chip.current||"-"}</td>
            <td>${i.chip.new||"-"} <span class="ver-badge ${i.chip.match?"match":"mismatch"}">${i.chip.match?"MATCH":"MISMATCH"}</span></td>
          </tr>
        </tbody>
      </table>
    `:y}renderSerialFlashPanel(){var t;const i=((t=this.serialStatus)==null?void 0:t.status)||"idle",e=i==="starting"||i==="flashing";return g`
      <div class="serial-panel">
        <div class="serial-controls">
          <label>
            Port
            <select
              .value=${this.selectedSerialPort}
              ?disabled=${e||this.serialPortsLoading}
              @change=${s=>this.selectedSerialPort=s.target.value}
            >
              ${this.serialPorts.map(s=>g`
                <option value=${s.port}>${s.by_id?s.label:s.port}${s.available?"":" (permission?)"}</option>
              `)}
            </select>
          </label>
          <button class="btn" ?disabled=${this.serialPortsLoading||e} @click=${()=>this.openSerialPanel(!0)}>
            ${this.serialPortsLoading?"Scanning...":"Refresh ports"}
          </button>
          ${e?g`<button class="btn btn-danger" @click=${this.cancelSerialFlash}>Cancel</button>`:g`<button class="btn btn-primary" ?disabled=${!this.selectedSerialPort||this.serialPortsLoading} @click=${this.startSerialFlash}>Flash selected port</button>`}
        </div>

        ${this.serialStatus?g`
          <p class="serial-status ${i}">
            ${i==="success"?`USB flash complete${this.serialStatus.flashed_bytes?` (${Math.round(this.serialStatus.flashed_bytes/1024)} KB)`:""}`:i==="failed"?"USB flash failed":i==="flashing"?`Flashing ${this.serialStatus.port||this.selectedSerialPort}...`:i==="starting"?"Starting USB flash...":"USB flash idle"}
          </p>
        `:y}

        ${this.serialError?g`<p class="error">${this.serialError}</p>`:y}

        ${this.serialLogs.length>0?g`
          <div class="serial-log">
            <pre>${this.serialLogs.join(`
`)}</pre>
          </div>
        `:y}
      </div>
    `}};se.styles=me`
    .config-page {
      color: var(--ink);
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .config-header {
      display: flex;
      align-items: end;
      gap: 16px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--line);
    }
    .back {
      border: 1px solid var(--line);
      background: var(--surface);
      min-height: 36px;
      padding: 0 14px;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      border-radius: 8px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.12s;
    }
    .back:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }
    .header-info h2 {
      margin: 0;
      font-size: clamp(20px, 3vw, 32px);
      font-weight: 700;
      line-height: 1.1;
    }
    .header-info p {
      margin: 4px 0 0;
      font-size: 13px;
      color: var(--muted);
    }
    .ok { color: var(--ok); }
    .danger { color: var(--danger); }

    .card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 12px;
      box-shadow: var(--shadow);
      padding: 20px 24px;
      margin-bottom: 16px;
    }
    .no-config {
      text-align: center;
    }
    .no-config h3 {
      font-size: 16px;
      font-weight: 600;
      margin: 0 0 18px;
    }
    .no-config-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      margin-bottom: 16px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      transition: all 0.12s;
      min-height: 38px;
    }
    .btn:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }
    .btn-primary {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }
    .btn-primary:hover {
      background: #0d4d5e;
    }
    .btn-success {
      background: var(--ok);
      color: #fff;
      border-color: var(--ok);
    }
    .btn-success:hover {
      background: #16a34a;
    }
    .btn-danger {
      background: var(--danger);
      color: #fff;
      border-color: var(--danger);
    }
    .btn-danger:hover {
      background: #dc2626;
    }
    .hint {
      font-size: 12px;
      color: var(--muted);
      margin: 4px 0;
    }

    .yaml-warnings {
      border: 1px solid var(--accent);
      background: #fffbeb;
      border-radius: 8px;
      padding: 10px 14px;
      margin-top: 8px;
    }
    .yaml-warnings p {
      font-size: 12px;
      color: #7c3f00;
      margin: 4px 0;
      font-weight: 500;
    }

    .queue-banner {
      border: 1px solid var(--accent);
      background: #fffbeb;
      border-radius: 8px;
      padding: 12px 16px;
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .queue-banner strong {
      font-size: 14px;
      font-weight: 600;
    }
    .queue-banner small {
      color: var(--muted);
      font-size: 11px;
    }

    .action-bar {
      display: flex;
      gap: 8px;
      padding: 16px 0 8px;
      border-top: 1px solid var(--line);
      margin-top: 12px;
    }
    .config-header .secrets-link {
      margin-left: auto;
      border: 1px solid var(--line);
      background: transparent;
      padding: 8px 14px;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      border-radius: 8px;
      cursor: pointer;
      color: var(--muted);
      transition: all 0.12s;
    }
    .config-header .secrets-link:hover {
      border-color: var(--primary);
      color: var(--primary);
    }
    .cancel-link {
      border: 1px solid var(--danger);
      background: transparent;
      color: var(--danger);
      font: inherit;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      padding: 2px 8px;
      border-radius: 4px;
    }
    .cancel-link:hover {
      background: var(--danger);
      color: white;
    }
    .close-logs-link {
      margin-left: auto;
      border: 1px solid rgba(255,255,255,0.1);
      background: transparent;
      color: var(--muted);
      font: inherit;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 10px;
      font-weight: 500;
      cursor: pointer;
      padding: 2px 8px;
      border-radius: 4px;
    }
    .close-logs-link:hover {
      background: rgba(255,255,255,0.1);
      color: #fff;
    }

    .status-line {
      font-size: 11px;
      color: var(--muted);
      margin: 4px 0 0;
    }

    .success-section,
    .fail-section {
      margin-top: 10px;
    }
    .success-banner {
      background: #dcfce7;
      color: #166534;
      border: 1px solid var(--ok);
      border-radius: 8px;
      padding: 8px 12px;
      font-weight: 600;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .fail-banner {
      background: #fef2f2;
      color: #991b1b;
      border: 1px solid var(--danger);
      border-radius: 8px;
      padding: 8px 12px;
      font-weight: 600;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .build-info {
      font-size: 13px;
      color: var(--muted);
      margin: 6px 0;
    }
    .flash-actions {
      display: flex;
      gap: 8px;
      margin: 10px 0;
      flex-wrap: wrap;
    }
    .serial-panel {
      border: 1px solid var(--line);
      background: #f8fafc;
      border-radius: 8px;
      padding: 12px;
      display: grid;
      gap: 10px;
      margin-top: 8px;
    }
    .serial-controls {
      display: flex;
      gap: 8px;
      align-items: end;
      flex-wrap: wrap;
    }
    .serial-controls label {
      display: grid;
      gap: 4px;
      font-size: 11px;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 600;
      min-width: min(280px, 100%);
    }
    .serial-controls select {
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      color: var(--ink);
      padding: 0 10px;
      font: inherit;
      font-size: 13px;
    }
    .serial-status {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      color: var(--muted);
    }
    .serial-status.success { color: var(--ok); }
    .serial-status.failed { color: var(--danger); }
    .serial-status.flashing,
    .serial-status.starting { color: var(--primary); }
    .serial-log {
      max-height: 240px;
      overflow: auto;
      background: #1a1b1e;
      border-radius: 8px;
      padding: 10px;
    }
    .serial-log pre {
      margin: 0;
      color: #c0c5ce;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 12px;
      line-height: 1.4;
    }
    .warnings {
      border-left: 4px solid var(--accent);
      background: #fffbeb;
      padding: 12px;
      border-radius: 6px;
      display: grid;
      gap: 8px;
      margin: 8px 0;
    }
    .warnings p {
      margin: 0;
      font-size: 13px;
      color: #7c3f00;
    }
    .warnings label {
      font-weight: 500;
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .error {
      color: var(--danger);
      font-size: 13px;
      font-weight: 500;
      padding: 10px 12px;
      background: #fef2f2;
      border: 1px solid var(--danger);
      border-radius: 6px;
    }

    .compare-table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 13px;
    }
    .compare-table th,
    .compare-table td {
      border: 1px solid var(--line);
      padding: 8px 10px;
      text-align: left;
    }
    .compare-table th {
      background: #f8fafc;
      font-size: 11px;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 600;
    }
    .tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      margin-left: 4px;
    }
    .tag.match {
      background: #dcfce7;
      color: #166534;
    }
    .tag.mismatch {
      background: #fef2f2;
      color: #991b1b;
    }
  `;ae([Q({type:String})],se.prototype,"mac",2);ae([w()],se.prototype,"state",2);ae([w()],se.prototype,"device",2);ae([w()],se.prototype,"config",2);ae([w()],se.prototype,"editorContent",2);ae([w()],se.prototype,"saveIndicator",2);ae([w()],se.prototype,"error",2);ae([w()],se.prototype,"compilePhase",2);ae([w()],se.prototype,"compileJobId",2);ae([w()],se.prototype,"compileQueuePosition",2);ae([w()],se.prototype,"preflight",2);ae([w()],se.prototype,"acceptedWarnings",2);ae([w()],se.prototype,"yamlWarnings",2);ae([w()],se.prototype,"showCompileLog",2);ae([w()],se.prototype,"serialPanelOpen",2);ae([w()],se.prototype,"serialPorts",2);ae([w()],se.prototype,"selectedSerialPort",2);ae([w()],se.prototype,"serialPortsLoading",2);ae([w()],se.prototype,"serialStatus",2);ae([w()],se.prototype,"serialError",2);ae([w()],se.prototype,"serialLogs",2);se=ae([be("esp-config-page")],se);var J1=Object.defineProperty,K1=Object.getOwnPropertyDescriptor,un=(i,e,t,s)=>{for(var n=s>1?void 0:s?K1(e,t):e,r=i.length-1,o;r>=0;r--)(o=i[r])&&(n=(s?o(e,t,n):o(n))||n);return s&&n&&J1(e,t,n),n};let Ri=class extends ne{constructor(){super(...arguments),this.content="",this.saved=!1,this.loading=!0,this.error=""}connectedCallback(){super.connectedCallback(),this.load()}async load(){this.loading=!0;try{const i=await O.getSecrets();this.content=i.content,this.error=""}catch(i){this.error=i instanceof Error?i.message:String(i)}finally{this.loading=!1}}async save(){this.saved=!1;try{await O.saveSecrets(this.content),this.saved=!0,this.error="",setTimeout(()=>{this.saved=!1,this.requestUpdate()},2e3)}catch(i){this.error=i instanceof Error?i.message:String(i)}}onInput(i){this.content=i.target.value}goBack(){window.location.hash="/"}render(){return g`
      <button class="back" @click=${this.goBack}>&#8592; Back to topology</button>
      <h2>Secrets</h2>
      ${this.loading?g`<div class="card">Loading...</div>`:g`
            <textarea
              class="secrets-textarea"
              .value=${this.content}
              @input=${this.onInput}
              spellcheck="false"
            ></textarea>
            <div class="actions">
              <button class="btn btn-primary" @click=${this.save}>Save</button>
              ${this.saved?g`<span class="saved">Saved &#10003;</span>`:y}
              ${this.error?g`<span class="error">${this.error}</span>`:y}
            </div>
            <div class="warnings">
              <p>&#9888; These secrets are stored in plaintext. Access is protected by Home Assistant ingress authentication.</p>
              <p>&#9888; Missing keys referenced by device configs will cause compile failures.</p>
            </div>
          `}
    `}};Ri.styles=me`
    :host {
      display: block;
      color: var(--ink);
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .back {
      border: 1px solid var(--line);
      background: var(--surface);
      min-height: 36px;
      padding: 0 14px;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      border-radius: 8px;
      cursor: pointer;
      margin-bottom: 16px;
      transition: all 0.12s;
    }
    .back:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 24px;
      font-weight: 700;
    }
    .card {
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 12px;
      box-shadow: var(--shadow);
      padding: 20px 24px;
      margin-bottom: 16px;
    }
    .secrets-textarea {
      width: 100%;
      min-height: 300px;
      border: 1px solid var(--line);
      background: #1a1b1e;
      color: #c0c5ce;
      font: inherit;
      font-size: 13px;
      line-height: 1.5;
      padding: 12px;
      resize: vertical;
      border-radius: 8px;
      box-sizing: border-box;
      font-family: ui-monospace, "SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace;
    }
    .secrets-textarea:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(11,59,75,0.1);
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 12px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 8px 16px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      cursor: pointer;
      transition: all 0.12s;
    }
    .btn:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }
    .btn-primary {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }
    .btn-primary:hover {
      background: #0d4d5e;
    }
    .saved { color: var(--ok); font-weight: 500; font-size: 13px; }
    .error { color: var(--danger); font-weight: 500; font-size: 13px; }
    .warnings {
      margin-top: 16px;
      padding: 10px 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      font-size: 12px;
      color: var(--muted);
    }
    .warnings p { margin: 4px 0; }
  `;un([w()],Ri.prototype,"content",2);un([w()],Ri.prototype,"saved",2);un([w()],Ri.prototype,"loading",2);un([w()],Ri.prototype,"error",2);Ri=un([be("esp-secrets-page")],Ri);var G1=Object.defineProperty,Y1=Object.getOwnPropertyDescriptor,oi=(i,e,t,s)=>{for(var n=s>1?void 0:s?Y1(e,t):e,r=i.length-1,o;r>=0;r--)(o=i[r])&&(n=(s?o(e,t,n):o(n))||n);return s&&n&&G1(e,t,n),n};const Z1={compile_queued:"Queued for compile",compiling:"Compiling",queued:"Queued for flash",starting:"Starting",announcing:"Waiting for device accept",transferring:"Transferring",verifying:"Verifying",transfer_success_waiting_rejoin:"Waiting for device rejoin",success:"Success",failed:"Failed",aborted:"Aborted",rejoin_timeout:"Rejoin timeout",version_mismatch:"Version mismatch"},ew={compile_queued:"⚙",compile_dequeued:"⚙",compiling:"⚙",compile_success:"✅",compile_failed:"❌",compile_output:"📋",compile_cancelled:"❌",flash_queued:"📦",flash_dequeued:"📦",flash_starting:"▶",flash_announcing:"⏳",flash_transferring:"📤",flash_progress:"📈",flash_verifying:"✅",flash_rejoin_waiting:"⏳",flash_rejoined:"🔄",flash_version_mismatch:"⚠",flash_rejoin_timeout:"⏰",flash_success:"✅",flash_failed:"❌",flash_aborted:"🛑",flash_start_failed:"❌",dequeue_retry:"🔄",dequeue_moved_back:"🔄",ota_start_retry:"🔄"},tw=["success","failed","aborted","rejoin_timeout","version_mismatch"];let Ot=class extends ne{constructor(){super(...arguments),this.jobId=0,this.from="/queue",this.job=null,this.logData=null,this.error="",this.loading=!0,this.expandedOutput=new Set,this.pollTimer=null}connectedCallback(){super.connectedCallback()}disconnectedCallback(){this.stopPolling(),super.disconnectedCallback()}updated(i){i.has("jobId")&&this.jobId&&(this.loading=!0,this.error="",this.fetchLog())}startPolling(){this.pollTimer||(this.pollTimer=setInterval(()=>this.fetchLog(),2e3))}stopPolling(){this.pollTimer&&(clearInterval(this.pollTimer),this.pollTimer=null)}async fetchJob(){var i;if(this.jobId)try{const e=(i=this.logData)==null?void 0:i.mac;if(e){const s=(await O.history(e)).jobs.find(n=>n.id===this.jobId);this.job=s||null}}catch{}}async fetchLog(){var i,e;if(this.jobId)try{this.logData=await O.jobLog(this.jobId),this.loading=!1,!this.job&&((i=this.logData)!=null&&i.mac)&&await this.fetchJob(),(e=this.logData)!=null&&e.is_terminal?this.stopPolling():this.startPolling()}catch(t){this.error=t instanceof Error?t.message:String(t),this.loading=!1,this.stopPolling()}}toggleOutput(i){const e=new Set(this.expandedOutput);e.has(i)?e.delete(i):e.add(i),this.expandedOutput=e}formatEventTime(i){return new Date(i*1e3).toLocaleTimeString()}renderEvent(i,e){const t=ew[i.type]||"•",s=this.formatEventTime(i.ts),n=i.type==="compile_output",r=this.expandedOutput.has(e),a={compile_success:"ok",flash_success:"ok",compile_failed:"danger",flash_failed:"danger",flash_aborted:"danger",flash_version_mismatch:"warn",flash_rejoin_timeout:"warn"}[i.type]||"";return g`
      <div class="event ${n?"event-output":""} ${a}">
        <div class="event-header" @click=${n?(()=>this.toggleOutput(e)):void 0}>
          <span class="event-icon">${t}</span>
          <span class="event-time">${s}</span>
          <span class="event-type">${i.type.replaceAll("_"," ")}</span>
          ${i.percent!=null?g`<span class="event-detail">${i.percent}%</span>`:y}
          ${i.error?g`<span class="event-error">${i.error}</span>`:y}
          ${i.reason?g`<span class="event-detail">${i.reason}</span>`:y}
          ${i.esphome_name?g`<span class="event-detail">${i.esphome_name}</span>`:y}
          ${i.firmware_name?g`<span class="event-detail">${i.firmware_name}</span>`:y}
          ${i.duration_s!=null?g`<span class="event-detail">took ${ki(i.duration_s)}</span>`:y}
          ${i.current_md5?g`<span class="event-detail">current running firmware MD5: ${i.current_md5}</span>`:y}
          ${i.md5?g`<span class="event-detail">New firmware MD5: ${i.md5}</span>`:y}
          ${i.rejoined_md5&&i.expected_md5?g`<span class="event-detail">running firmware MD5: ${i.rejoined_md5} expected MD5: ${i.expected_md5}</span>`:y}
          ${i.rejoined_md5&&!i.expected_md5?g`<span class="event-detail">running firmware MD5: ${i.rejoined_md5}</span>`:y}
          ${i.expected_md5&&!i.rejoined_md5?g`<span class="event-detail">expected MD5: ${i.expected_md5}</span>`:y}
          ${i.md5_match?g`<span class="event-tag ${i.md5_match==="match"?"ok":"warn"}">MD5 ${i.md5_match}</span>`:y}
          ${n?g`<span class="toggle">${r?"hide":"show output"}</span>`:y}
        </div>
        ${n&&r?g`<pre class="compile-output">${i.output||""}</pre>`:y}
      </div>
    `}render(){const i=this.logData,e=this.job,t=(i==null?void 0:i.log_events)||[],s=(i==null?void 0:i.status)||(e==null?void 0:e.status)||"",n=(i==null?void 0:i.is_terminal)??(e?tw.includes(e.status):!1),r=this.from||"/queue",o=r.startsWith("/device/")?"Device":r==="/queue"?"Queue":r.replace(/^\//,"");return g`
      <section>
        <div class="title-row">
          <a class="back-link" href="#${r}">&larr; ${o}</a>
          <div>
            <h2>${(e==null?void 0:e.firmware_name)||"Firmware"}</h2>
          </div>
        </div>

        ${this.error?g`<p class="error">${this.error}</p>`:y}

        ${e?g`
          <div class="meta">
            <div class="meta-item">
              <small>Status</small>
              <span class="status-chip ${s}">${Z1[s]||s.replaceAll("_"," ")}</span>
            </div>
            <div class="meta-item">
              <small>Device</small>
              <span>${e.mac}</span>
            </div>
            <div class="meta-item">
              <small>Size</small>
              <span>${wi(e.firmware_size)}</span>
            </div>
            ${e.started_at?g`
              <div class="meta-item">
                <small>Started</small>
                <span>${is(e.started_at)}</span>
              </div>
            `:y}
            ${e.completed_at?g`
              <div class="meta-item">
                <small>Completed</small>
                <span>${is(e.completed_at)}</span>
              </div>
            `:y}
            ${e.started_at&&e.completed_at?g`
              <div class="meta-item">
                <small>Duration</small>
                <span>${ki(e.completed_at-e.started_at)}</span>
              </div>
            `:y}
            ${e.error_msg?g`
              <div class="meta-item meta-full">
                <small>Error</small>
                <span class="error">${e.error_msg}</span>
              </div>
            `:y}
          </div>
        `:y}

        ${n?y:g`<div class="live-indicator">Live<span class="pulse"></span></div>`}

        <div class="log-header">
          <span class="label">Event Log</span>
          <span class="count">${t.length} events</span>
        </div>
        <div class="log-body">
          ${this.loading?g`<span class="empty">Loading...</span>`:t.length===0?g`<span class="empty">No events recorded for this job.</span>`:t.map((a,l)=>this.renderEvent(a,l))}
        </div>
      </section>
    `}};Ot.styles=me`
    section {
      display: grid;
      gap: 12px;
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 8px;
    }

    .back-link {
      color: var(--primary);
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      white-space: nowrap;
    }

    .back-link:hover {
      text-decoration: underline;
    }

    .title-row span {
      color: var(--primary);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    h2 {
      margin: 2px 0 0;
      font-size: 16px;
      font-weight: 600;
    }

    .meta {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 8px 16px;
      border: 1px solid var(--line);
      background: var(--surface);
      border-radius: 8px;
      padding: 12px 16px;
    }

    .meta-item {
      display: grid;
      gap: 2px;
    }

    .meta-item small {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 600;
    }

    .meta-item span {
      font-size: 13px;
    }

    .meta-full {
      grid-column: 1 / -1;
    }

    .status-chip {
      border: 1px solid var(--line);
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      font-weight: 600;
      font-size: 11px;
    }

    .success {
      color: var(--ok);
    }

    .failed,
    .aborted {
      color: var(--danger);
    }

    .rejoin_timeout,
    .version_mismatch {
      color: var(--accent);
    }

    .live-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      color: var(--ok);
    }

    .pulse {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--ok);
      animation: blink 1.2s ease-in-out infinite;
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    .log-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #25262b;
      border: 1px solid var(--line);
      border-bottom: none;
      border-radius: 8px 8px 0 0;
      margin-top: 4px;
    }

    .label {
      color: #9ba1a7;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
    }

    .count {
      color: #64748b;
      font-size: 11px;
    }

    .log-body {
      background: #1a1b1e;
      border: 1px solid var(--line);
      border-top: none;
      border-radius: 0 0 8px 8px;
      max-height: 600px;
      overflow-y: auto;
      padding: 8px 0;
    }

    .empty {
      color: var(--muted);
      font-style: italic;
      font-size: 13px;
      display: block;
      padding: 16px 12px;
    }

    .event {
      padding: 4px 12px;
    }

    .event:hover {
      background: rgba(255,255,255,0.03);
    }

    .event.ok .event-type {
      color: var(--ok);
    }

    .event.danger .event-type,
    .event.danger .event-error {
      color: var(--danger);
    }

    .event.warn .event-type {
      color: var(--accent);
    }

    .event-output .event-header {
      cursor: pointer;
    }

    .event-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      flex-wrap: wrap;
    }

    .event-icon {
      font-size: 12px;
      width: 18px;
      text-align: center;
    }

    .event-time {
      color: #64748b;
      font-family: ui-monospace, 'SFMono-Regular', 'Cascadia Code', monospace;
      font-size: 12px;
    }

    .event-type {
      color: #c0c5ce;
      font-weight: 600;
      font-size: 12px;
    }

    .event-detail {
      color: #9ba1a7;
      font-size: 11px;
    }

    .event-tag {
      font-size: 11px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 4px;
    }

    .event-tag.ok {
      color: var(--ok);
      background: color-mix(in srgb, var(--ok) 15%, transparent);
    }

    .event-tag.warn {
      color: var(--accent);
      background: color-mix(in srgb, var(--accent) 15%, transparent);
    }

    .event-error {
      color: var(--danger);
      font-size: 12px;
    }

    .toggle {
      color: var(--primary);
      font-size: 11px;
      cursor: pointer;
    }

    .compile-output {
      margin: 4px 0 4px 26px;
      color: #9ba1a7;
      font-family: ui-monospace, 'SFMono-Regular', 'Cascadia Code', monospace;
      font-size: 11px;
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 400px;
      overflow-y: auto;
      background: #111216;
      border-radius: 4px;
      padding: 8px;
    }

    .error {
      color: var(--danger);
      font-weight: 500;
      margin: 0;
    }

    @media (max-width: 720px) {
      .meta {
        grid-template-columns: 1fr;
      }
    }
  `;oi([Q({type:Number})],Ot.prototype,"jobId",2);oi([Q({type:String})],Ot.prototype,"from",2);oi([w()],Ot.prototype,"job",2);oi([w()],Ot.prototype,"logData",2);oi([w()],Ot.prototype,"error",2);oi([w()],Ot.prototype,"loading",2);oi([w()],Ot.prototype,"expandedOutput",2);Ot=oi([be("esp-job-page")],Ot);var iw=Object.defineProperty,sw=Object.getOwnPropertyDescriptor,ps=(i,e,t,s)=>{for(var n=s>1?void 0:s?sw(e,t):e,r=i.length-1,o;r>=0;r--)(o=i[r])&&(n=(s?o(e,t,n):o(n))||n);return s&&n&&iw(e,t,n),n};let si=class extends ne{constructor(){super(...arguments),this.logs=[],this.error="",this.loading=!0,this.fullscreen=!1,this.connected=!1,this.eventSource=null,this.handleFullscreenChange=()=>{this.fullscreen=!!document.fullscreenElement}}connectedCallback(){super.connectedCallback(),this.connect()}connect(){this.disconnect(),this.loading=!0,this.error="",this.logs=[],this.eventSource=O.activityLog(i=>{this.logs=[i,...this.logs],this.loading=!1,this.connected=!0,this.requestUpdate()},()=>{this.loading=!1},i=>{this.loading=!1,this.logs.length===0&&(this.error="Could not load activity log")})}disconnect(){this.eventSource&&(this.eventSource.close(),this.eventSource=null,this.connected=!1)}clearLogs(){this.logs=[]}downloadLog(){const i=this.logs.join(`
`),e=new Blob([i],{type:"text/plain"}),t=URL.createObjectURL(e),s=document.createElement("a");s.href=t,s.download="activity.log",s.click(),URL.revokeObjectURL(t)}toggleFullscreen(){var i,e;this.fullscreen?(e=document.exitFullscreen)==null||e.call(document):(i=this.requestFullscreen)==null||i.call(this)}firstUpdated(){document.addEventListener("fullscreenchange",this.handleFullscreenChange)}disconnectedCallback(){this.disconnect(),document.removeEventListener("fullscreenchange",this.handleFullscreenChange),super.disconnectedCallback()}renderLine(i){return g`<pre class="log-line">${i}</pre>`}render(){return g`
      <div class="page-header">
        <div class="header-left">
          <a href="#/settings" class="back-btn">\u2190 Back</a>
          <span class="title">Activity Log</span>
          ${this.connected?g`<span class="live-dot" title="Connected"></span>`:""}
        </div>
        <div class="header-controls">
          <button class="ctrl-btn" @click=${this.clearLogs}>Clear</button>
          <button class="ctrl-btn" @click=${this.downloadLog}>Download</button>
          <button class="ctrl-btn" @click=${this.toggleFullscreen}>
            ${this.fullscreen?"Collapse":"Fullscreen"}
          </button>
        </div>
      </div>
      <div class="log-body">
        ${this.error?g`<span class="error-msg">${this.error}</span>`:this.loading&&this.logs.length===0?g`<span class="empty">Loading...</span>`:this.logs.length===0?g`<span class="empty">No activity yet</span>`:this.logs.map(i=>this.renderLine(i))}
      </div>
    `}};si.styles=me`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    :host([hidden]) {
      display: none;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--line);
      background: var(--surface);
      flex-shrink: 0;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .back-btn {
      color: var(--primary);
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      padding: 4px 8px;
      border-radius: 4px;
      transition: background 0.12s;
    }
    .back-btn:hover {
      background: rgba(255,255,255,0.05);
    }
    .title {
      font-size: 15px;
      font-weight: 600;
    }
    .live-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
      box-shadow: 0 0 6px #22c55e;
    }
    .header-controls {
      display: flex;
      gap: 6px;
    }
    .ctrl-btn {
      border: 1px solid rgba(255,255,255,0.1);
      background: transparent;
      color: var(--muted);
      font-family: inherit;
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.12s;
    }
    .ctrl-btn:hover {
      background: var(--primary);
      color: white;
      border-color: var(--primary);
    }
    .log-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
    }
    .log-line {
      margin: 0 0 2px 0;
      color: #c0c5ce;
      font-family: ui-monospace, "SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .empty, .error-msg {
      color: var(--muted);
      font-size: 13px;
      font-style: italic;
    }
    .error-msg {
      color: #ef4444;
    }

    :host(:fullscreen) {
      position: fixed;
      inset: 0;
      z-index: 9999;
    }
    :host(:fullscreen) .page-header {
      position: sticky;
      top: 0;
      z-index: 1;
    }
    :host(:fullscreen) .log-body {
      max-height: none;
      height: calc(100vh - 53px);
    }
  `;ps([w()],si.prototype,"logs",2);ps([w()],si.prototype,"error",2);ps([w()],si.prototype,"loading",2);ps([w()],si.prototype,"fullscreen",2);ps([w()],si.prototype,"connected",2);si=ps([be("esp-activity-log-page")],si);var nw=Object.defineProperty,rw=Object.getOwnPropertyDescriptor,ve=(i,e,t,s)=>{for(var n=s>1?void 0:s?rw(e,t):e,r=i.length-1,o;r>=0;r--)(o=i[r])&&(n=(s?o(e,t,n):o(n))||n);return s&&n&&nw(e,t,n),n};let fe=class extends ne{constructor(){super(...arguments),this.step1="scanning",this.step2="disabled",this.step3="disabled",this.discoveredBridges=[],this.bridgeError=null,this.manualMode=!1,this.manualHost="",this.manualPort=80,this.manualApiKey="",this.apiKeyInput="",this.selectedBridge=null,this.restartError=null,this.integrationError=null,this.statusPollTimer=null,this.integrationPollTimer=null,this.integrationFailures=0,this.pollingSeconds=0,this.discoveryTimer=null,this.doneTimer=null}connectedCallback(){super.connectedCallback(),this.pollStatus(),this.startDiscovery(),this.statusPollTimer=setInterval(()=>void this.pollStatus(),3e3)}disconnectedCallback(){this.statusPollTimer&&(clearInterval(this.statusPollTimer),this.statusPollTimer=null),this.integrationPollTimer&&(clearInterval(this.integrationPollTimer),this.integrationPollTimer=null),this.discoveryTimer&&(clearInterval(this.discoveryTimer),this.discoveryTimer=null),this.doneTimer&&(clearTimeout(this.doneTimer),this.doneTimer=null),super.disconnectedCallback()}async startDiscovery(){this.discoveryTimer&&(clearInterval(this.discoveryTimer),this.discoveryTimer=null),this.step1!=="complete"&&(this.step1="scanning"),this.bridgeError=null,await this.refreshDiscoveredBridges(),O.triggerScan().catch(i=>{const e=i instanceof Error?i.message:String(i);e.toLowerCase().includes("already")||(this.bridgeError=e)}),this.discoveryTimer=setInterval(()=>void this.refreshDiscoveredBridges(),2e3)}async refreshDiscoveredBridges(){if(!(this.step1==="complete"||this.step1==="connecting"))try{this.discoveredBridges=await O.discoverBridges(),this.discoveredBridges.length>0?(this.step1="found",this.bridgeError=null):this.step1!=="error"&&(this.step1="scanning")}catch(i){this.bridgeError=i instanceof Error?i.message:String(i)}}async pollStatus(){try{const i=await O.setupStatus(),e=i.integration.configured||i.integration.loaded;i.bridge.configured?(this.step1="complete",this.discoveryTimer&&(clearInterval(this.discoveryTimer),this.discoveryTimer=null),i.restart.required?["restarting","polling","complete"].includes(this.step2)||(this.step2="ready"):(this.step2="complete",!e&&this.step3==="disabled"&&this.triggerIntegrationSetup())):(this.step2!=="disabled"&&(this.step2="disabled"),this.step3!=="disabled"&&(this.step3="disabled")),i.bridge.configured&&!i.restart.required&&this.step2==="polling"&&(this.step2="complete",this.pollingSeconds=0,!e&&this.step3==="disabled"&&this.triggerIntegrationSetup()),e&&(this.step3="complete",this.integrationFailures=0,this.step1==="complete"&&this.step2==="complete"&&this.onAllDone()),this.step2==="polling"&&(this.pollingSeconds+=3)}catch{}}async connectBridgeBySelect(i){if(!this.apiKeyInput.trim()){this.bridgeError="API key is required";return}this.step1="connecting",this.bridgeError=null;try{await O.selectBridge(i.host,i.port,i.name,i.version,this.apiKeyInput,i.network_id,i.hostname),this.step1="complete",this.step2="ready"}catch(e){this.step1="found",this.bridgeError=e instanceof Error?e.message:String(e)}}async connectManualBridge(){if(!this.manualHost.trim()){this.bridgeError="Host is required";return}this.step1="connecting",this.bridgeError=null;try{await O.addBridge(this.manualHost.trim(),this.manualPort,void 0,this.manualApiKey||"",""),this.step1="complete",this.step2="ready"}catch(i){this.step1=this.discoveredBridges.length>0?"found":"error",this.bridgeError=i instanceof Error?i.message:String(i)}}selectBridgeForApiKey(i){this.selectedBridge=i}async handleRestart(){this.step2="restarting",this.restartError=null;try{const i=await O.requestRestart();i.success?(this.step2="polling",this.pollingSeconds=0):(this.step2="error",this.restartError=i.error||"Restart failed")}catch{this.step2="polling",this.pollingSeconds=0,this.restartError=null}}async triggerIntegrationSetup(){if(!["triggering","polling","complete"].includes(this.step3)){this.step3="triggering",this.integrationError=null,this.integrationFailures=0;try{const i=await O.integrationSetup();if(i.entry_created){this.step3="complete",this.onAllDone();return}i.success?(this.step3="polling",this.integrationPollTimer||(this.integrationPollTimer=setInterval(()=>void this.pollIntegrationForEntry(),3e3))):(this.step3="error",this.integrationError=i.error||"Failed to set up integration")}catch(i){this.step3="error",this.integrationError=i instanceof Error?i.message:String(i)}}}async pollIntegrationForEntry(){this.integrationFailures++;try{if((await O.setupStatus()).integration.configured){this.step3="complete",this.integrationPollTimer&&(clearInterval(this.integrationPollTimer),this.integrationPollTimer=null),this.onAllDone();return}}catch{}this.integrationFailures>=10&&(this.integrationPollTimer&&(clearInterval(this.integrationPollTimer),this.integrationPollTimer=null),this.step3="fallback")}async onAllDone(){this.doneTimer||(this.doneTimer=setTimeout(()=>{window.location.hash="/"},2e3))}dismiss(){this.dispatchEvent(new CustomEvent("setup-dismissed",{bubbles:!0,composed:!0})),window.location.hash="/"}retryDiscovery(){this.startDiscovery()}render(){return g`
      <div class="wizard-page">
        <header class="wizard-header">
          <div>
            <h1>ESP-Tree Setup</h1>
            <p class="tagline">Connect your ESP-NOW LR bridge and get started.</p>
          </div>
          <button class="dismiss-btn" @click=${this.dismiss}>Close and go to topology</button>
        </header>

        <div class="stepper">
          ${this.renderStep1()}
          ${this.renderStep2()}
          ${this.renderStep3()}
          ${this.renderDone()}
        </div>
      </div>
    `}renderStep1(){const i=this.step1==="complete"&&this.step2!=="disabled";return g`
      <div class="step ${i?"collapsed":""} ${this.step1==="complete"?"done":""} ${this.step1==="error"?"has-error":""}">
        <div class="step-header" @click=${()=>{i&&this.requestUpdate()}}>
          <span class="step-icon">
            ${this.step1==="scanning"?g`<span class="spinner"></span>`:this.step1==="connecting"?g`<span class="spinner"></span>`:this.step1==="complete"?"✅":this.step1==="error"?"❌":"1"}
          </span>
          <div class="step-title-area">
            <h2>Connect Your Bridge</h2>
            <p class="step-summary">
              ${this.step1==="scanning"?"Scanning for bridges on your network...":this.step1==="found"?`${this.discoveredBridges.length} bridge(s) found`:this.step1==="connecting"?"Connecting to bridge...":this.step1==="complete"?"Bridge connected":this.step1==="error"?"Connection failed":""}
            </p>
          </div>
          ${i?g`<span class="collapse-icon">\u25B6</span>`:y}
        </div>

        ${i?y:g`
          <div class="step-body">
            ${this.step1==="scanning"||this.step1==="connecting"?g`
              <div class="scanning-state">
                <span class="spinner large"></span>
                <p>${this.step1==="scanning"?"Scanning for bridges on your network...":"Connecting to bridge..."}</p>
              </div>
            `:y}

            ${this.step1==="found"||this.step1==="error"?g`
              ${this.discoveredBridges.length>0?g`
                <div class="bridge-list">
                  ${this.discoveredBridges.map(e=>g`
                    <div class="bridge-card">
                      <div class="bridge-info">
                        <strong>${e.name||e.host}</strong>
                        <span>${e.hostname||e.host}:${e.port}</span>
                        ${e.network_id?g`<span class="net-id">Network: ${e.network_id}</span>`:y}
                      </div>
                      ${this.selectedBridge===e?g`
                        <div class="api-key-row">
                          <input
                            type="password"
                            placeholder="API Key"
                            .value=${this.apiKeyInput}
                            @input=${t=>this.apiKeyInput=t.target.value}
                          />
                          <button class="btn btn-primary" @click=${()=>this.connectBridgeBySelect(e)}>
                            Connect
                          </button>
                        </div>
                      `:g`
                        <button class="btn btn-outline" @click=${()=>this.selectBridgeForApiKey(e)}>
                          Connect
                        </button>
                      `}
                    </div>
                  `)}
                </div>
              `:g`
                <p class="muted">No bridges found on your network.</p>
              `}
            `:y}

            ${this.step1!=="connecting"?g`
              <div class="manual-toggle">
                <button class="btn btn-outline" @click=${()=>this.manualMode=!this.manualMode}>
                  ${this.manualMode?"Hide manual entry":"Enter bridge address manually"}
                </button>
              </div>

              ${this.manualMode?g`
                <div class="manual-form">
                  <label>
                    Host / IP
                    <input type="text" placeholder="192.168.1.50 or hostname.local" .value=${this.manualHost} @input=${e=>this.manualHost=e.target.value} />
                  </label>
                  <label>
                    Port
                    <input type="number" min="1" max="65535" .value=${String(this.manualPort)} @input=${e=>this.manualPort=Number(e.target.value||80)} />
                  </label>
                  <label>
                    API Key
                    <input type="password" placeholder="API Key (optional)" .value=${this.manualApiKey} @input=${e=>this.manualApiKey=e.target.value} />
                  </label>
                  <button class="btn btn-primary" @click=${this.connectManualBridge}>
                    Connect
                  </button>
                </div>
              `:y}

              ${this.bridgeError?g`
                <div class="error-block">
                  <p>${this.bridgeError}</p>
                  <button class="btn btn-outline" @click=${this.retryDiscovery}>Retry</button>
                </div>
              `:y}
            `:y}

            ${this.step1==="complete"&&this.step2==="disabled"?g`
              <div class="complete-state">
                <span class="check">\u2705</span>
                <span>Bridge connected successfully</span>
              </div>
            `:y}
          </div>
        `}
      </div>
    `}renderStep2(){const i=this.step2==="complete"&&this.step3!=="disabled";return g`
      <div class="step ${this.step2==="disabled"?"locked":""} ${i?"collapsed":""} ${this.step2==="complete"?"done":""} ${this.step2==="error"?"has-error":""}">
        <div class="step-header">
          <span class="step-icon">
            ${this.step2==="disabled"?"🔒":this.step2==="restarting"?g`<span class="spinner"></span>`:this.step2==="polling"?g`<span class="spinner"></span>`:this.step2==="complete"?"✅":this.step2==="error"?"❌":"2"}
          </span>
          <div class="step-title-area">
            <h2>Restart Home Assistant</h2>
            <p class="step-summary">
              ${this.step2==="disabled"?"Complete step 1 first":this.step2==="ready"?"Home Assistant needs to restart to activate the integration":this.step2==="restarting"?"Restarting...":this.step2==="polling"?`Waiting for Home Assistant to come back online... (${this.pollingSeconds}s)`:this.step2==="complete"?"Home Assistant restarted successfully":this.step2==="error"?"Restart failed":""}
            </p>
          </div>
          ${i?g`<span class="collapse-icon">\u25B6</span>`:y}
        </div>

        ${i?y:g`
          <div class="step-body">
            ${this.step2==="disabled"?g`
              <p class="muted">Connect a bridge first to continue.</p>
            `:y}

            ${this.step2==="ready"?g`
              <p>Home Assistant needs to restart to activate the ESP Tree integration.</p>
              <button class="btn btn-primary" @click=${this.handleRestart}>
                Restart Home Assistant
              </button>
            `:y}

            ${this.step2==="restarting"?g`
              <div class="scanning-state">
                <span class="spinner large"></span>
                <p>Sending restart request...</p>
              </div>
            `:y}

            ${this.step2==="polling"?g`
              <div class="polling-state">
                <span class="spinner large"></span>
                <p>Waiting for Home Assistant to come back online...</p>
                ${this.pollingSeconds>40?g`
                  <p class="muted">Taking longer than expected. Check if Home Assistant restarted successfully.</p>
                `:y}
              </div>
            `:y}

            ${this.step2==="complete"?g`
              <div class="complete-state">
                <span class="check">\u2705</span>
                <span>Home Assistant restarted successfully</span>
              </div>
            `:y}

            ${this.step2==="error"&&this.restartError?g`
              <div class="error-block">
                <p>Restart failed: ${this.restartError}</p>
                <button class="btn btn-outline" @click=${this.handleRestart}>Retry</button>
              </div>
            `:y}
          </div>
        `}
      </div>
    `}renderStep3(){return g`
      <div class="step ${this.step3==="disabled"?"locked":""} ${this.step3==="complete"?"done":""}">
        <div class="step-header">
          <span class="step-icon">
            ${this.step3==="disabled"?"🔒":this.step3==="triggering"?g`<span class="spinner"></span>`:this.step3==="polling"?g`<span class="spinner"></span>`:this.step3==="complete"?"✅":this.step3==="fallback"?"⚠️":this.step3==="error"?"❌":"3"}
          </span>
          <div class="step-title-area">
            <h2>Add ESP Tree Integration</h2>
            <p class="step-summary">
              ${this.step3==="disabled"?"Complete step 2 first":this.step3==="triggering"?"Setting up the ESP Tree integration...":this.step3==="polling"?"Waiting for integration to activate...":this.step3==="complete"?"ESP Tree integration is active":this.step3==="fallback"?"Manual setup required":this.step3==="error"?"Could not set up integration":""}
            </p>
          </div>
        </div>

        <div class="step-body">
          ${this.step3==="disabled"?g`
            <p class="muted">Restart Home Assistant first to continue.</p>
          `:y}

          ${this.step3==="triggering"?g`
            <div class="scanning-state">
              <span class="spinner large"></span>
              <p>Setting up the ESP Tree integration...</p>
            </div>
          `:y}

          ${this.step3==="polling"?g`
            <div class="polling-state">
              <span class="spinner large"></span>
              <p>Waiting for integration to become active...</p>
            </div>
          `:y}

          ${this.step3==="complete"?g`
            <div class="complete-state">
              <span class="check">\u2705</span>
              <span>ESP Tree integration is active</span>
            </div>
          `:y}

          ${this.step3==="fallback"?g`
            <div class="fallback-state">
              <p>Automatic setup didn't complete. You can add it manually:</p>
              <div class="fallback-actions">
                <button class="btn btn-outline" @click=${()=>window.open("/config/integrations/dashboard","_blank")}>
                  Open Devices &amp; Services
                </button>
                <button class="btn btn-outline" @click=${()=>window.open("/config/integrations/dashboard/add?domain=esp_tree","_blank")}>
                  Add ESP Tree Integration
                </button>
              </div>
              <button class="btn" @click=${()=>{this.integrationFailures=0,this.triggerIntegrationSetup()}}>
                Retry Automatic Setup
              </button>
            </div>
          `:y}

          ${this.step3==="error"&&this.integrationError?g`
            <div class="error-block">
              <p>Could not set up integration automatically: ${this.integrationError}</p>
              <div class="fallback-actions">
                <button class="btn btn-outline" @click=${()=>window.open("/config/integrations/dashboard","_blank")}>
                  Open Devices &amp; Services
                </button>
                <button class="btn btn-outline" @click=${()=>window.open("/config/integrations/dashboard/add?domain=esp_tree","_blank")}>
                  Add ESP Tree Integration
                </button>
              </div>
              <button class="btn" @click=${()=>{this.integrationError=null,this.triggerIntegrationSetup()}}>
                Retry
              </button>
            </div>
          `:y}
        </div>
      </div>
    `}renderDone(){return this.step1!=="complete"||this.step2!=="complete"||this.step3!=="complete"?y:g`
      <div class="step done expanded">
        <div class="step-header">
          <span class="step-icon">\u2728</span>
          <div class="step-title-area">
            <h2>Setup Complete!</h2>
            <p class="step-summary">Redirecting to topology map...</p>
          </div>
        </div>
      </div>
    `}};fe.styles=me`
    :host {
      --bg: #f5f7fa;
      --surface: #ffffff;
      --ink: #1c1c1e;
      --muted: #64748b;
      --line: #e2e8f0;
      --primary: #0b3b4b;
      --accent: #f39c12;
      --danger: #ef4444;
      --ok: #22c55e;
      --shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
      display: block;
      min-height: 100vh;
      background: var(--bg);
      color: var(--ink);
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }

    .wizard-page {
      max-width: 680px;
      margin: 0 auto;
      padding: 40px 24px;
    }

    .wizard-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 32px;
      padding-bottom: 20px;
      border-bottom: 2px solid var(--line);
    }

    .wizard-header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 700;
      color: var(--primary);
    }

    .tagline {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 15px;
    }

    .dismiss-btn {
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--muted);
      padding: 8px 16px;
      font: inherit;
      font-size: 13px;
      cursor: pointer;
      border-radius: 8px;
      white-space: nowrap;
      transition: all 0.15s;
    }

    .dismiss-btn:hover {
      border-color: var(--muted);
      color: var(--ink);
    }

    .stepper {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .step {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 12px;
      box-shadow: var(--shadow);
      overflow: hidden;
      transition: opacity 0.2s;
    }

    .step.locked {
      opacity: 0.55;
    }

    .step.done {
      border-color: var(--ok);
    }

    .step.has-error {
      border-color: var(--danger);
    }

    .step-header {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 18px 20px;
    }

    .step.collapsed .step-header {
      cursor: pointer;
    }

    .step-icon {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      background: #f1f5f9;
      border-radius: 50%;
      margin-top: 2px;
    }

    .step.complete .step-icon,
    .step.done .step-icon {
      background: #dcfce7;
    }

    .step-title-area {
      flex: 1;
    }

    .step-title-area h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .step-summary {
      margin: 4px 0 0;
      font-size: 13px;
      color: var(--muted);
    }

    .collapse-icon {
      font-size: 12px;
      color: var(--muted);
      margin-top: 6px;
    }

    .step-body {
      padding: 0 20px 20px 70px;
    }

    .step.collapsed .step-body {
      display: none;
    }

    .scanning-state,
    .polling-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 0;
      gap: 12px;
    }

    .scanning-state p,
    .polling-state p {
      margin: 0;
      font-size: 14px;
      color: var(--muted);
    }

    .complete-state {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 0;
      font-size: 14px;
      font-weight: 500;
      color: var(--ok);
    }

    .check {
      font-size: 18px;
    }

    .bridge-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 16px;
    }

    .bridge-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      background: #f8fafc;
      border: 1px solid #f1f5f9;
      border-radius: 10px;
      gap: 12px;
      flex-wrap: wrap;
    }

    .bridge-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 13px;
    }

    .bridge-info strong {
      font-size: 14px;
    }

    .net-id {
      font-size: 11px;
      color: var(--muted);
      font-family: monospace;
    }

    .api-key-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .api-key-row input {
      padding: 6px 10px;
      font-size: 13px;
      border: 1px solid var(--line);
      border-radius: 6px;
      width: 180px;
    }

    .manual-toggle {
      margin-bottom: 12px;
    }

    .manual-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      background: #f8fafc;
      border: 1px solid #f1f5f9;
      border-radius: 10px;
      margin-bottom: 12px;
    }

    .manual-form label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
    }

    .manual-form input {
      padding: 8px 12px;
      font-size: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      font-family: inherit;
    }

    .error-block {
      margin-top: 12px;
      padding: 12px 16px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
    }

    .error-block p {
      margin: 0 0 8px;
      color: var(--danger);
      font-size: 13px;
    }

    .fallback-state {
      padding: 16px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      margin-top: 8px;
    }

    .fallback-state p {
      margin: 0 0 12px;
      font-size: 14px;
    }

    .fallback-actions {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    .btn {
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--ink);
      padding: 8px 16px;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border-radius: 8px;
      transition: all 0.15s;
    }

    .btn:hover {
      background: #f1f5f9;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }

    .btn-primary:hover {
      background: #0e4a5e;
    }

    .btn-outline {
      border-color: var(--primary);
      color: var(--primary);
      background: transparent;
    }

    .btn-outline:hover {
      background: rgba(11, 59, 75, 0.06);
    }

    .muted {
      color: var(--muted);
      font-size: 13px;
    }

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 3px solid rgba(11, 59, 75, 0.2);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    .spinner.large {
      width: 32px;
      height: 32px;
      border-width: 4px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @media (max-width: 600px) {
      .wizard-page {
        padding: 24px 16px;
      }

      .wizard-header {
        flex-direction: column;
        gap: 12px;
      }

      .step-body {
        padding: 0 16px 16px 54px;
      }

      .bridge-card {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  `;ve([w()],fe.prototype,"step1",2);ve([w()],fe.prototype,"step2",2);ve([w()],fe.prototype,"step3",2);ve([w()],fe.prototype,"discoveredBridges",2);ve([w()],fe.prototype,"bridgeError",2);ve([w()],fe.prototype,"manualMode",2);ve([w()],fe.prototype,"manualHost",2);ve([w()],fe.prototype,"manualPort",2);ve([w()],fe.prototype,"manualApiKey",2);ve([w()],fe.prototype,"apiKeyInput",2);ve([w()],fe.prototype,"selectedBridge",2);ve([w()],fe.prototype,"restartError",2);ve([w()],fe.prototype,"integrationError",2);ve([w()],fe.prototype,"statusPollTimer",2);ve([w()],fe.prototype,"integrationPollTimer",2);ve([w()],fe.prototype,"integrationFailures",2);ve([w()],fe.prototype,"pollingSeconds",2);fe=ve([be("esp-setup-wizard")],fe);var ow=Object.defineProperty,aw=Object.getOwnPropertyDescriptor,$t=(i,e,t,s)=>{for(var n=s>1?void 0:s?aw(e,t):e,r=i.length-1,o;r>=0;r--)(o=i[r])&&(n=(s?o(e,t,n):o(n))||n);return s&&n&&ow(e,t,n),n};let et=class extends ne{constructor(){super(...arguments),this.route=this.readRoute(),this.queueData=null,this.compileData=null,this.addonConnected=!0,this.bridgeConnected=null,this.bridgeConfigured=null,this.integrationLoaded=null,this.integrationConfigured=!1,this.restartRequired=!1,this.pollTimer=null,this.bridgeStreamHandle=null,this.setupDismissed=!1,this.onHashChange=()=>{this.route=this.readRoute()},this.onSetupDismissed=()=>{this.setupDismissed=!0}}connectedCallback(){super.connectedCallback(),window.addEventListener("hashchange",this.onHashChange),this.addEventListener("setup-dismissed",this.onSetupDismissed),this.bridgeStreamHandle=mp(i=>{this.bridgeConnected=i,this.fetchConfig()}),this.fetchQueue(),this.pollTimer=setInterval(()=>{this.fetchQueue(),this.fetchConfig(),this.checkRestartRequired()},3e3),this.fetchConfig(),this.checkRestartRequired(),this.maybeRedirectToSetup()}async checkRestartRequired(){var i,e;try{const t=await O.restartRequired();this.restartRequired=t.restart_required,this.integrationLoaded=((i=t.integration)==null?void 0:i.loaded)??this.integrationLoaded,this.integrationConfigured=((e=t.integration)==null?void 0:e.configured)??this.integrationConfigured}catch{this.restartRequired=!1}this.maybeRedirectToSetup()}async fetchConfig(){var i,e,t;try{const s=await O.config();this.integrationLoaded=((i=s.integration)==null?void 0:i.loaded)??null,this.integrationConfigured=((e=s.integration)==null?void 0:e.configured)??!1,this.bridgeConfigured=!!(s.active_bridge&&!s.active_bridge.error||(((t=s.integration)==null?void 0:t.bridge_count)??0)>0),this.addonConnected=!0}catch{this.addonConnected=!1,this.bridgeConfigured=!1}this.maybeRedirectToSetup()}needsSetup(){return this.bridgeConfigured===!1||this.restartRequired||this.integrationLoaded===!1&&!this.integrationConfigured}maybeRedirectToSetup(){this.needsSetup()&&this.route.name==="topology"&&!this.setupDismissed&&this.navigate("/setup")}disconnectedCallback(){var i;window.removeEventListener("hashchange",this.onHashChange),this.removeEventListener("setup-dismissed",this.onSetupDismissed),this.pollTimer&&(clearInterval(this.pollTimer),this.pollTimer=null),(i=this.bridgeStreamHandle)==null||i.close(),this.bridgeStreamHandle=null,super.disconnectedCallback()}async fetchQueue(){try{const[i,e]=await Promise.all([O.getQueue(),O.getCompileQueue()]);this.queueData=i,this.compileData=e,this.addonConnected=!0}catch{this.addonConnected=!1}}readRoute(){const i=window.location.hash.replace(/^#\/?/,"");if(i.startsWith("device/")){const e=i.slice(7);return e.endsWith("/config")?{name:"device-config",mac:decodeURIComponent(e.replace(/\/config$/,""))}:{name:"device",mac:decodeURIComponent(e)}}if(i.startsWith("job/")){const e=i.slice(4),[t,s]=e.split("?"),n=parseInt(t,10);let r="/queue";return s&&(r=new URLSearchParams(s).get("from")||"/queue"),{name:"job",jobId:n,from:r}}return i==="settings"?{name:"settings"}:i==="queue"?{name:"queue"}:i==="secrets"?{name:"secrets"}:i==="activity-log"?{name:"activity-log"}:i==="setup"?{name:"setup"}:{name:"topology"}}navigate(i){window.location.hash=i}render(){if(this.route.name==="setup")return g`<esp-setup-wizard></esp-setup-wizard>`;const i=this.queueData,e=this.compileData,t=(i==null?void 0:i.count)??0,s=(e==null?void 0:e.count)??0,n=!!(i!=null&&i.active_job)&&!["success","failed","aborted","rejoin_timeout","version_mismatch"].includes(i.active_job.status),r=!!(e!=null&&e.active_job),o=(i==null?void 0:i.paused)??!1,a=n||t>0||r||s>0;return g`
      <div class="app-shell">
        ${this.addonConnected?y:g`<div class="connection-banner">Cannot reach addon</div>`}
        ${this.bridgeConnected===!1?g`<div class="connection-banner">Addon cannot reach bridge</div>`:y}

        <header>
          <div class="brand">
            <a class="brand-name" href="#/">ESP-Tree<small>Go where WiFi won't</small></a>
          </div>
          <div class="header-right">
            <nav>
              <button class=${this.route.name==="topology"?"active":""} @click=${()=>this.navigate("/")}>Topology</button>
              <button class=${this.route.name==="queue"?"active":""} @click=${()=>this.navigate("/queue")}>
                Queue${a?g`<span class="badge ${r||n?"loading":""}">${o?"⏸ ":""}${t+s+(n?1:0)+(r?1:0)}</span>`:y}
              </button>
              <button class=${this.route.name==="settings"?"active":""} @click=${()=>this.navigate("/settings")}>Settings</button>
            </nav>
          </div>
        </header>
        <main>
          ${this.route.name==="topology"?g`<esp-topology-map @node-selected=${l=>this.navigate(`/device/${encodeURIComponent(l.detail)}`)}></esp-topology-map>`:this.route.name==="device"?g`<esp-device-detail .mac=${this.route.mac}></esp-device-detail>`:this.route.name==="device-config"?g`<esp-config-page .mac=${this.route.mac}></esp-config-page>`:this.route.name==="job"?g`<esp-job-page .jobId=${this.route.jobId} .from=${this.route.from}></esp-job-page>`:this.route.name==="queue"?g`<esp-queue-page></esp-queue-page>`:this.route.name==="secrets"?g`<esp-secrets-page></esp-secrets-page>`:this.route.name==="settings"?g`<esp-settings ?autoInit=${this.bridgeConfigured===!1}></esp-settings>`:g`<esp-settings></esp-settings>`}
        </main>
      </div>
    `}};et.styles=me`
    :host {
      --bg: #f5f7fa;
      --surface: #ffffff;
      --ink: #1c1c1e;
      --muted: #64748b;
      --line: #e2e8f0;
      --primary: #0b3b4b;
      --accent: #f39c12;
      --danger: #ef4444;
      --ok: #22c55e;
      --shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
      display: block;
      min-height: 100vh;
      background: var(--bg);
      color: var(--ink);
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }

    .app-shell {
      max-width: 1100px;
      margin: 0 auto;
      padding: 24px;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--primary);
      color: #fff;
      padding: 0 24px;
      height: 56px;
      border-radius: 12px;
      margin-bottom: 24px;
      box-shadow: var(--shadow);
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .brand-name,
    .brand-name:visited {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.3px;
      color: inherit;
      text-decoration: none;
    }

    .brand-name small {
      font-weight: 400;
      opacity: 0.7;
      font-size: 13px;
      margin-left: 6px;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    nav {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    nav button {
      border: none;
      background: rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.8);
      min-height: 36px;
      padding: 0 16px;
      font: inherit;
      font-weight: 500;
      font-size: 14px;
      cursor: pointer;
      border-radius: 8px;
      transition: all 0.15s;
    }

    nav button:hover,
    nav button.active {
      background: rgba(255,255,255,0.18);
      color: #fff;
      font-weight: 600;
    }

    .badge {
      display: inline-block;
      margin-left: 5px;
      padding: 1px 7px;
      font-size: 10px;
      font-weight: 700;
      background: var(--accent);
      color: white;
      border-radius: 10px;
      vertical-align: middle;
    }

.badge.loading {
      position: relative;
      width: 24px;
      height: 24px;
      padding: 0;
      border-radius: 50%;
      background: transparent;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
    }

    .badge.loading::before {
      content: '';
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      border: 3px solid rgba(243, 156, 18, 0.3);
      border-top-color: var(--accent);
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .connection-banner {
      background: var(--danger);
      color: #fff;
      text-align: center;
      padding: 8px;
      font-weight: 600;
      font-size: 14px;
      border-radius: 8px;
      margin-bottom: 12px;
    }

    .info-banner {
      background: #1e40af;
      color: #fff;
      text-align: center;
      padding: 8px;
      font-weight: 600;
      font-size: 14px;
      border-radius: 8px;
      margin-bottom: 12px;
    }

    .no-bridge-banner {
      background: var(--accent);
      color: #fff;
      text-align: center;
      padding: 8px;
      font-weight: 600;
      font-size: 14px;
      border-radius: 8px;
      margin-bottom: 12px;
      cursor: pointer;
    }

    .no-bridge-banner:hover {
      opacity: 0.9;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    main {
      max-width: 1100px;
      margin: 0 auto;
    }

    @media (max-width: 720px) {
      .app-shell {
        padding: 12px;
      }
      header {
        flex-wrap: wrap;
        height: auto;
        padding: 12px 16px;
        gap: 8px;
      }
      nav {
        justify-content: flex-start;
      }
    }
  `;$t([w()],et.prototype,"route",2);$t([w()],et.prototype,"queueData",2);$t([w()],et.prototype,"compileData",2);$t([w()],et.prototype,"addonConnected",2);$t([w()],et.prototype,"bridgeConnected",2);$t([w()],et.prototype,"bridgeConfigured",2);$t([w()],et.prototype,"integrationLoaded",2);$t([w()],et.prototype,"integrationConfigured",2);$t([w()],et.prototype,"restartRequired",2);et=$t([be("espnow-app")],et);
//# sourceMappingURL=index-CuZlU4zl.js.map
