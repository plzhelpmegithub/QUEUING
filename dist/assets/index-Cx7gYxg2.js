(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const d of document.querySelectorAll('link[rel="modulepreload"]'))a(d);new MutationObserver(d=>{for(const o of d)if(o.type==="childList")for(const r of o.addedNodes)r.tagName==="LINK"&&r.rel==="modulepreload"&&a(r)}).observe(document,{childList:!0,subtree:!0});function i(d){const o={};return d.integrity&&(o.integrity=d.integrity),d.referrerPolicy&&(o.referrerPolicy=d.referrerPolicy),d.crossOrigin==="use-credentials"?o.credentials="include":d.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function a(d){if(d.ep)return;d.ep=!0;const o=i(d);fetch(d.href,o)}})();let Qe=null;function ke(){Qe&&Qe.close()}function fe({title:e,bodyHtml:t,footerHtml:i="",size:a="",onClose:d=null}){ke();const o=document.createElement("div");o.className="modal-overlay",o.innerHTML=`
    <div class="modal-box ${a}" role="dialog" aria-modal="true">
      <div class="modal-box__head">
        <h3>${e}</h3>
        <button type="button" class="modal-box__close" data-modal-close aria-label="닫기">&times;</button>
      </div>
      <div class="modal-box__body">${t}</div>
      ${i?`<div class="modal-box__footer">${i}</div>`:""}
    </div>
  `,document.body.appendChild(o),document.body.classList.add("modal-open");function r(y){y.key==="Escape"&&l()}let n=!1;function l(){n||(n=!0,o.remove(),document.body.classList.remove("modal-open"),document.removeEventListener("keydown",r),Qe===c&&(Qe=null),typeof d=="function"&&d())}o.addEventListener("click",y=>{y.target===o&&l()}),o.querySelectorAll("[data-modal-close]").forEach(y=>y.addEventListener("click",l)),document.addEventListener("keydown",r);const c={el:o,close:l};return Qe=c,c}const oa=[];let st=null,ut=null,Gt=()=>{};function be(e,t){oa.push({pattern:e,page:t})}function z(e){const t=`#/${e}`.replace(/^#\/\/+/,"#/");location.hash===t?Wt():location.hash=t}function Ba(){let e=location.hash||"#/";e=e.replace(/^#\/?/,"");const[t,i]=e.split("?"),a={};return i&&new URLSearchParams(i).forEach((d,o)=>a[o]=d),{path:t,query:a}}function Ra(e){for(const t of oa){const i=e.match(t.pattern);if(i)return{page:t.page,params:i.groups||{}}}return null}function Wt(){const{path:e,query:t}=Ba(),i=Ra(e);if(typeof st=="function")try{st()}catch(d){console.error(d)}if(st=null,ke(),ut.innerHTML="",!i){ut.innerHTML='<div class="center-state"><div class="center-state__icon">🎫</div><div class="center-state__title">페이지를 찾을 수 없습니다</div><div class="center-state__desc">주소를 다시 확인해주세요.</div></div>',Gt(e);return}const a=i.page.render(ut,i.params,t);typeof a=="function"&&(st=a),window.scrollTo({top:0,behavior:"instant"in window?"instant":"auto"}),Gt(e)}function Ha(e,{onChange:t}={}){ut=e,t&&(Gt=t),window.addEventListener("hashchange",Wt),Wt()}const zt=new Set,B={user:null,membership:null,interests:new Set,bookings:[],cancelQueues:{},cancelPools:{},currentOrder:null,returnTo:null,chatRooms:{},selectedSessions:{},venueZones:{},sessionExpiresAt:null,sessionJustExpired:!1,notifications:[],admissionTokens:{},seatSelectDeadline:null},da=20*60*1e3,vt="queuing_auth";function na(e){return e===!0||e===1||e==="1"}function Ge(){try{localStorage.setItem(vt,JSON.stringify({user:B.user,sessionExpiresAt:B.sessionExpiresAt,membership:B.membership}))}catch{}}function sa(){try{localStorage.removeItem(vt)}catch{}}try{const e=JSON.parse(localStorage.getItem(vt)||"null");e&&e.user&&e.sessionExpiresAt>Date.now()?(B.user=e.user,B.sessionExpiresAt=e.sessionExpiresAt,B.membership=e.membership||null,setTimeout(()=>{ya(),ca()},100)):e&&localStorage.removeItem(vt)}catch{}function se(){zt.forEach(e=>e(B))}function nt(e){return zt.add(e),()=>zt.delete(e)}function oe(){return B}function Pa({name:e,email:t,isAdmin:i=!1,isMonitor:a=!1,role:d,userId:o,phone:r="",birthDate:n="",marketingOptIn:l=!1,joinedAt:c}){const y=d;B.user={name:e,userId:o||(t||"guest").split("@")[0],email:t||"guest@queuing.app",isAdmin:i||y==="ADMIN",isMonitor:a||y==="MONITOR",role:y,phone:r||"",birthDate:n||"",marketingOptIn:na(l),joinedAt:c||Date.now(),accessToken:`mock-access-${Math.random().toString(36).slice(2)}`,refreshToken:`mock-refresh-${Math.random().toString(36).slice(2)}`},B.sessionExpiresAt=Date.now()+da,B.sessionJustExpired=!1,Ge(),se(),ya(),ca()}function qa(e){B.user&&(Object.assign(B.user,e),Ge(),se())}function ra(e){var i;const t=(i=B.user)==null?void 0:i.userId;return t?fetch("/auth/profile",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:t,...e})}).then(async a=>{let d={};try{d=await a.json()}catch{}if(!a.ok||!d.success)return{success:!1,message:d.message||d.error||"회원정보를 저장하지 못했습니다."};const o=d.user||{};return qa({...o.name!==void 0?{name:o.name}:{},...o.phone!==void 0?{phone:o.phone}:{},...o.birthDate!==void 0?{birthDate:o.birthDate}:{},...o.marketingOptIn!==void 0?{marketingOptIn:na(o.marketingOptIn)}:{},...o.joinedAt!==void 0?{joinedAt:o.joinedAt}:{}}),d}).catch(a=>(console.error("[Auth] 회원정보 수정 API 실패:",a),{success:!1,message:"네트워크 오류로 회원정보를 저장하지 못했습니다."})):Promise.resolve({success:!1,message:"로그인이 필요합니다."})}function at(){return!!(B.user&&B.user.isAdmin)}function Yt(){return!!(B.user&&B.user.isMonitor)}function Ua(){B.user=null,B.sessionExpiresAt=null,B.membership=null,sa(),se()}function $t(){!B.user||!B.sessionExpiresAt||(B.sessionExpiresAt=Date.now()+da,Ge())}function Le(){return!!B.user}function ja(){const e=B.sessionJustExpired;return B.sessionJustExpired=!1,e}function la(){B.user&&(B.user=null,B.sessionExpiresAt=null,B.membership=null,B.sessionJustExpired=!0,sa(),se())}function Ga(e){var i;const t=(i=B.user)==null?void 0:i.userId;return t?fetch("/membership/subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:t,plan:e})}).then(a=>a.json()).then(a=>(a.success&&(B.membership={plan:e,since:a.expiresAt||new Date().toISOString()},Ge(),se()),a)).catch(a=>(console.error("[Membership] 가입 API 실패:",a),{success:!1,message:"네트워크 오류가 발생했습니다."})):Promise.resolve({success:!1,message:"로그인이 필요합니다."})}function He(){return!!B.membership}function Wa(){var t;const e=(t=B.user)==null?void 0:t.userId;return e?fetch("/membership/cancel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:e})}).then(i=>i.json()).then(i=>(i.success&&(B.membership=null,Ge(),se()),i)).catch(i=>(console.error("[Membership] 해지 API 실패:",i),{success:!1,message:"네트워크 오류가 발생했습니다."})):Promise.resolve({success:!1,message:"로그인이 필요합니다."})}function ca(){var t;const e=(t=B.user)==null?void 0:t.userId;e&&fetch(`/membership/${e}`).then(i=>i.json()).then(i=>{i.isMembership?(B.membership={plan:i.plan,since:i.createdAt},Ge()):(B.membership=null,Ge()),se()}).catch(()=>{})}function oi(e){var i;const t=(i=B.user)==null?void 0:i.userId;B.interests.has(e)?(B.interests.delete(e),t&&fetch("/wishlist/remove",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:t,eventId:e})}).catch(()=>{})):(B.interests.add(e),t&&fetch("/wishlist/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:t,eventId:e})}).catch(()=>{})),se()}function mt(e){return B.interests.has(e)}function ya(){var t;const e=(t=B.user)==null?void 0:t.userId;e&&fetch(`/wishlist/${e}`).then(i=>i.json()).then(i=>{B.interests.clear(),(i.wishlists||[]).forEach(a=>B.interests.add(a.eventId)),se()}).catch(()=>{})}function di(e){B.currentOrder=e,se()}function ft(){B.currentOrder=null,se()}function za(e){return B.bookings.unshift(e),gt({title:e.status==="unpaid"?"입금 대기 중인 예매가 있어요":"예매가 확정되었습니다",body:e.status==="unpaid"?`예매번호 ${e.bookingId} · 가상계좌로 입금을 완료해주세요.`:`예매번호 ${e.bookingId} 결제가 정상적으로 완료되었습니다.`}),se(),e}function Ya(e){return B.bookings.some(t=>t.bookingId===e.bookingId)||(B.bookings.push(e),se()),e}function Va(e){return B.bookings.some(t=>{var i,a;return((i=t.seat)==null?void 0:i.id)===e||((a=t.seats)==null?void 0:a.some(d=>d.id===e))})}function bt(e,t){B.admissionTokens[e]=t}function xa(e){const t=B.admissionTokens[e];return t?t.expiresAt&&Date.now()>new Date(t.expiresAt).getTime()?(delete B.admissionTokens[e],null):t:null}function Ka(e){delete B.admissionTokens[e]}function Ja(e=7*60*1e3){return B.seatSelectDeadline&&B.seatSelectDeadline>Date.now()||(B.seatSelectDeadline=Date.now()+e,se()),B.seatSelectDeadline}function yi(){return B.seatSelectDeadline}function ot(){B.seatSelectDeadline&&(B.seatSelectDeadline=null,se())}function gt({title:e,body:t}){B.notifications.unshift({id:`N${Date.now()}${Math.floor(Math.random()*1e3)}`,title:e,body:t,createdAt:Date.now(),read:!1}),se()}function ua(){return B.notifications}function Xa(){return B.notifications.filter(e=>!e.read).length}function pa(){B.notifications.some(e=>!e.read)&&(B.notifications.forEach(e=>e.read=!0),se())}function xi(e){return B.bookings.find(t=>t.bookingId===e)}function va(e,{max:t=2e3}={}){if(B.cancelQueues[e])return B.cancelQueues[e];const a={myNumber:Math.max(1,Math.floor(Math.random()*t*.9)+1),total:t,joinedAt:Date.now()};return B.cancelQueues[e]=a,se(),a}function dt(e){return B.cancelPools[e]||(B.cancelPools[e]={VIP:3,R:9,S:17},se()),B.cancelPools[e]}function ma(e,t){const i=dt(e);i[t]=(i[t]||0)+1,se()}function fa(e,t){const i=dt(e);i[t]>0&&(i[t]-=1),se()}function We(e){B.returnTo=e}function ba(){const e=B.returnTo;return B.returnTo=null,e}function ui(e){return B.chatRooms[e]||(B.chatRooms[e]={viewers:60+Math.floor(Math.random()*480),messages:[]}),B.chatRooms[e]}function Vt(e,t){B.selectedSessions[e]=t,se()}function ni(e){return B.selectedSessions[e]||null}function Za(e,t){if(!B.venueZones[e]){const i={};t.forEach(a=>{i[a.id]=a.seed}),B.venueZones[e]=i,se()}return B.venueZones[e]}function Qa(e,t,i){const a=B.venueZones[e];!a||a[t]==null||(a[t]=Math.max(0,a[t]-i),se())}function Kt(e,t){var i;return((i=B.venueZones[e])==null?void 0:i[t])??0}function eo(e){const t=B.bookings.find(i=>i.bookingId===e);!t||t.status!=="confirmed"||(t.status="refund_pending",t.cancelledAt=Date.now(),gt({title:"환불 처리 중입니다",body:`예매번호 ${t.bookingId}의 환불이 접수되었습니다.`}),se(),setTimeout(()=>{t.status="refunded",(t.seats&&t.seats.length?t.seats:t.seat?[t.seat]:[]).forEach(a=>ma(t.concertId,a.grade)),gt({title:"환불이 완료되었습니다",body:`예매번호 ${t.bookingId}의 환불 처리가 완료되었습니다.`}),se()},4e3))}function to(e){const t=B.bookings.find(i=>i.bookingId===e);!t||t.status!=="unpaid"||(t.status="cancelled",t.cancelledAt=Date.now(),gt({title:"입금 전 예매가 취소되었습니다",body:`예매번호 ${t.bookingId}의 무통장입금 예매가 취소되었습니다.`}),se())}setInterval(()=>{B.user&&B.sessionExpiresAt&&Date.now()>B.sessionExpiresAt&&la()},5e3);typeof window<"u"&&(window.__queuingDebug={...window.__queuingDebug||{},expireSession:la});let Jt=null;function ga(e){Jt=e}function Y({title:e,body:t,actionLabel:i,onAction:a,type:d="default",duration:o=3600}){if(!Jt)return;const r=document.createElement("div");r.className=`toast ${d==="success"?"toast-success":""}`,r.innerHTML=`
    ${e?`<div class="toast__title">${e}</div>`:""}
    ${t?`<div class="toast__body">${t}</div>`:""}
    ${i?`<div class="toast__action">${i}</div>`:""}
  `,i&&a&&r.querySelector(".toast__action").addEventListener("click",()=>{a(),l()}),Jt.appendChild(r);let n=!1;function l(){n||(n=!0,r.style.transition="opacity .2s ease",r.style.opacity="0",setTimeout(()=>r.remove(),200))}const c=setTimeout(l,o);return r.addEventListener("click",()=>{clearTimeout(c),l()}),l}const io=Object.freeze(Object.defineProperty({__proto__:null,mountToastRoot:ga,showToast:Y},Symbol.toStringTag,{value:"Module"}));function ue(e){return Math.max(0,Math.round(e)).toLocaleString("ko-KR")}function ve(e){return`₩${ue(e)}`}function _e(e){return String(Math.max(0,Math.floor(e))).padStart(2,"0")}function ha(e){if(e<=0)return"00 : 00 : 00";const t=Math.floor(e/1e3),i=Math.floor(t/3600),a=Math.floor(t%3600/60),d=t%60;return`${_e(i)} : ${_e(a)} : ${_e(d)}`}function si(e){if(e<=0)return"00:00";const t=Math.floor(e/1e3),i=Math.floor(t/60),a=t%60;return`${_e(i)}:${_e(a)}`}function ht(e){if(e<=0)return"마감";const t=Math.floor(e/1e3),i=Math.floor(t/86400),a=Math.floor(t%86400/3600),d=Math.floor(t%3600/60),o=t%60;return`${i>0?`D-${i} `:""}${_e(a)}:${_e(d)}:${_e(o)}`}function wt(e){const t=new Date(e),i=["일","월","화","수","목","금","토"];return`${t.getFullYear()}.${_e(t.getMonth()+1)}.${_e(t.getDate())}(${i[t.getDay()]})`}function Dt(e){const t=new Date(e);return`${t.getFullYear()}.${_e(t.getMonth()+1)}.${_e(t.getDate())}`}function ao(e,t){return!t||e===t?Dt(e):`${Dt(e)} ~ ${Dt(t)}`}function oo(e="A"){const i=new Date().getFullYear(),a=Math.floor(1e5+Math.random()*9e5);return`${e}${i}${a}`}const no=[{label:"공연",path:"",match:/^$|^concert\//},{label:"콘서트",path:"concerts",match:/^concerts$/},{label:"관심 공연",path:"mypage/interests",match:/^mypage\/interests$/},{label:"마이페이지",path:"mypage",match:/^mypage/}],Xt=/^(queue|zones|payment)\//,so=/^complete\//;let Ie=null,Ve="",De=!1,Me=!1,ze=null;function ro(e){const t=Date.now()-e,i=Math.floor(t/6e4);if(i<1)return"방금 전";if(i<60)return`${i}분 전`;const a=Math.floor(i/60);return a<24?`${a}시간 전`:`${Math.floor(a/24)}일 전`}function lo(){var e;fe({title:"로그아웃하시겠습니까?",bodyHtml:"<p>로그아웃 시 다시 로그인해야 예매내역과 마이페이지를 이용할 수 있습니다.</p>",footerHtml:`
      <button type="button" class="btn btn-ghost" data-modal-close>취소</button>
      <button type="button" class="btn btn-primary" data-confirm-logout>로그아웃</button>
    `}),(e=document.querySelector("[data-confirm-logout]"))==null||e.addEventListener("click",()=>{ke(),Ua(),z("")})}function co(){var e;fe({title:"로그인 세션이 만료되었습니다",bodyHtml:"<p>안전한 서비스 이용을 위해 다시 로그인해주세요.</p>",footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close data-relogin>다시 로그인</button>'}),(e=document.querySelector("[data-relogin]"))==null||e.addEventListener("click",()=>{We(Ve),z("login")})}function Ne(){const{user:e,membership:t}=oe();if(!e&&ja()&&co(),ze&&(clearInterval(ze),ze=null),so.test(Ve)){Ie.style.display="none",Ie.innerHTML="";return}Ie.style.display="";const i=ua(),a=Xa(),d=yi(),o=Xt.test(Ve),r=d?`<div class="header-seat-timer" data-seat-timer>
        <span class="header-seat-timer__label">좌석선택 제한시간</span>
        <span class="header-seat-timer__clock num-mono" data-seat-timer-clock>--:--</span>
      </div>`:"";if(Ie.innerHTML=o?`
    <div class="container">
      <div class="site-header__left">
        <a href="#/" class="site-header__logo">
          <img src="/images/queuing-logo.png" alt="QUEUING" class="site-header__mark" />
        </a>
      </div>
      <div class="site-header__actions">
        ${r}
        <a href="#/mypage" class="site-header__ghost-btn">마이페이지</a>
        <a href="#/mypage/bookings" class="site-header__ghost-btn">예매 확인</a>
      </div>
    </div>
  `:`
    <div class="container">
      <div class="site-header__left">
        <a href="#/" class="site-header__logo">
          <img src="/images/queuing-logo.png" alt="QUEUING" class="site-header__mark" />
        </a>
        <nav class="site-header__nav">
          ${no.map(y=>`<a href="#/${y.path}" data-path="${y.path}" class="${y.match.test(Ve)?"active":""}">${y.label}</a>`).join("")}
        </nav>
      </div>
      <div class="site-header__actions">
        ${r}
        ${e?`
          <div class="notif-wrap">
            <button type="button" class="notif-bell" data-notif-toggle aria-label="알림">
              🔔${a>0?`<span class="notif-bell__dot">${a>9?"9+":a}</span>`:""}
            </button>
            <div class="notif-dropdown ${Me?"open":""}" data-notif-panel>
              <div class="notif-dropdown__head">알림</div>
              ${i.length?i.slice(0,8).map(y=>`
                    <div class="notif-item ${y.read?"":"is-unread"}">
                      <div class="notif-item__title">${y.title}</div>
                      <div class="notif-item__body">${y.body}</div>
                      <div class="notif-item__time">${ro(y.createdAt)}</div>
                    </div>`).join(""):'<div class="notif-empty">아직 알림이 없습니다.</div>'}
            </div>
          </div>

          <div class="profile-wrap">
            <button type="button" class="site-header__user ${De?"open":""}" data-profile-toggle>
              <span>${e.name}님</span>
              ${t?'<span class="site-header__member-chip">MEMBERSHIP</span>':""}
              ${e.isAdmin?'<span class="site-header__member-chip site-header__member-chip--admin">ADMIN</span>':""}
              ${e.isMonitor?'<span class="site-header__member-chip site-header__member-chip--admin">MONITOR</span>':""}
              <span class="profile-caret">▾</span>
            </button>
            <div class="profile-dropdown ${De?"open":""}" data-profile-panel>
              <div class="profile-dropdown__head">${e.name}님</div>
              <a href="#/mypage">마이페이지</a>
              <a href="#/mypage/bookings">예매내역</a>
              <a href="#/mypage/refunds">취소/환불내역</a>
              <a href="#/mypage/profile-edit">회원정보 수정</a>
              <div class="divider" style="margin:6px 0;"></div>
              <button type="button" class="profile-dropdown__logout" data-action="logout">로그아웃</button>
            </div>
          </div>
          ${e.isAdmin?'<a href="#/admin" class="site-header__ghost-btn">관리</a>':""}
          ${e.isMonitor?'<a href="#/monitoring" class="site-header__ghost-btn">모니터링</a>':""}
        `:`
          <a href="#/login" class="site-header__ghost-btn">로그인</a>
          <a href="#/signup" class="site-header__solid-btn">회원가입</a>
        `}
      </div>
    </div>
  `,d){const y=Ie.querySelector("[data-seat-timer-clock]"),g=Ie.querySelector("[data-seat-timer]"),b=()=>{const S=yi()-Date.now();if(S<=0){clearInterval(ze),ze=null,ot(),ft(),Y({title:"좌석선택 시간이 만료되었습니다",body:"처음부터 다시 예매해주세요."}),z("");return}y&&(y.textContent=si(S)),g&&g.classList.toggle("header-seat-timer--urgent",S<=6e4)};b(),ze=setInterval(b,1e3)}const n=Ie.querySelector("[data-notif-toggle]");n&&n.addEventListener("click",y=>{y.stopPropagation(),Me=!Me,De=!1,Me&&pa(),Ne()});const l=Ie.querySelector("[data-profile-toggle]");l&&l.addEventListener("click",y=>{y.stopPropagation(),De=!De,Me=!1,Ne()});const c=Ie.querySelector('[data-action="logout"]');c&&c.addEventListener("click",()=>{De=!1,Ne(),lo()})}function yo(e){Ie&&Ie.contains(e.target)&&(!e.target.closest("[data-notif-toggle]")&&!e.target.closest("[data-notif-panel]")&&Me&&(Me=!1,Ne()),!e.target.closest("[data-profile-toggle]")&&!e.target.closest("[data-profile-panel]")&&De&&(De=!1,Ne()))}function xo(e){Ie=e,Ne(),nt(Ne),document.addEventListener("click",t=>{if(Ie){if(!Ie.contains(t.target)){Me&&(Me=!1,Ne()),De&&(De=!1,Ne());return}yo(t)}})}function uo(e){const t=Xt.test(Ve),i=Xt.test(e);Ve=e,De=!1,Me=!1,t&&!i&&ot(),Ne()}function po(e){e.innerHTML=`
    <div class="container">
      <div class="site-footer__logo">QUEUING</div>
      <div class="site-footer__links">
        <a href="#/">이용약관</a>
        <a href="#/">개인정보처리방침</a>
        <a href="#/">고객센터</a>
        <a href="#/membership">멤버십 안내</a>
      </div>
      <div class="site-footer__meta">
        (주)큐잉 대표 김큐잉 · 사업자등록번호 000-00-00000 · 통신판매업신고 제0000-서울강남-00000호<br />
        본 사이트는 프론트엔드 데모용으로 제작되었으며 실제 예매·결제가 이루어지지 않습니다. © QUEUING. All rights reserved.
      </div>
    </div>
  `}const vo=["일","월","화","수","목","금","토"],mo=(e,t)=>`${e}.${String(t+1).padStart(2,"0")}`;function Lt(e){return`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,"0")}-${String(e.getDate()).padStart(2,"0")}`}function pi(e){const t=new Date(e.getFullYear(),e.getMonth(),e.getDate());return t.setDate(t.getDate()-t.getDay()),t}function fo(e){const t=new Date(e);t.setDate(t.getDate()+6);const i=e.getMonth()===t.getMonth(),a=`${e.getMonth()+1}.${e.getDate()}`,d=i?`${t.getDate()}`:`${t.getMonth()+1}.${t.getDate()}`;return`${e.getFullYear()}.${a} ~ ${d}`}function bo(e){return e==="performance"?{label:"공연 일정",cls:"badge-gray"}:e==="booked"?{label:"예매 완료",cls:"badge-red"}:e==="interest"?{label:"관심 공연",cls:"badge-red-light"}:e==="upcoming"?{label:"예매 오픈",cls:"badge-outline"}:{label:"",cls:"badge-gray"}}function go(e,{events:t=[],onSelectConcert:i=()=>{}}={}){const a=new Date;let d="month",o=new Date(a.getFullYear(),a.getMonth(),1),r=pi(a),n=Lt(a);function l(E){return t.filter(v=>v.date===E)}function c(E,v){const k=Lt(a),x=Lt(E);if(v)return`<div class="cal__day is-outside"><span class="cal__day-num">${E.getDate()}</span></div>`;const s=l(x),A=s.some(f=>f.type==="booked"),I=s.some(f=>f.type==="interest"),w=s.some(f=>f.type==="upcoming"),M=s.some(f=>f.type==="performance");return`
      <div class="${["cal__day",x===k?"is-today":"",x===n?"is-selected":""].join(" ")}" data-date="${x}">
        <span class="cal__day-num">${E.getDate()}</span>
        <span class="cal__day-dots">
          ${A?'<span class="cal__dot cal__dot--booked" title="예매 완료"></span>':""}
          ${I?'<span class="cal__dot--interest">♥</span>':""}
          ${w?'<span class="cal__dot cal__dot--upcoming" title="예매 오픈"></span>':""}
          ${M?'<span class="cal__dot cal__dot--performance" title="공연 일정"></span>':""}
        </span>
      </div>
    `}function y(){const E=o.getFullYear(),v=o.getMonth(),x=new Date(E,v,1).getDay(),s=new Date(E,v+1,0).getDate(),A=[];for(let w=x;w>0;w--)A.push({date:new Date(E,v,1-w),outside:!0});for(let w=1;w<=s;w++)A.push({date:new Date(E,v,w),outside:!1});let I=1;for(;A.length<42;)A.push({date:new Date(E,v+1,I),outside:!0}),I++;return A}function g(){const E=[];for(let v=0;v<7;v++){const k=new Date(r);k.setDate(k.getDate()+v),E.push({date:k,outside:!1})}return E}function b(){const E=d==="month"?y():g(),v=d==="month"?mo(o.getFullYear(),o.getMonth()):fo(r);e.classList.toggle("cal--week",d==="week"),e.classList.toggle("cal--month",d==="month"),e.innerHTML=`
      <div class="cal__head">
        <div class="cal__head-title">${v}</div>
        <div class="cal__head-right">
          <div class="cal__view-toggle">
            <button type="button" data-mode="month" class="${d==="month"?"active":""}">월간</button>
            <button type="button" data-mode="week" class="${d==="week"?"active":""}">주간</button>
          </div>
          <div class="cal__nav">
            <button type="button" data-nav="-1">‹</button>
            <button type="button" data-nav="1">›</button>
          </div>
        </div>
      </div>
      <div class="cal__weekdays">${vo.map(k=>`<span>${k}</span>`).join("")}</div>
      <div class="cal__grid ${d==="week"?"cal__grid--week":""}">
        ${E.map(k=>c(k.date,k.outside)).join("")}
      </div>
      <div class="cal__legend">
        <span><span class="cal__dot cal__dot--booked"></span>예매 완료</span>
        <span><span class="cal__dot--interest">♥</span>관심 공연</span>
        <span><span class="cal__dot cal__dot--upcoming"></span>예매 오픈/예정</span>
        <span><span class="cal__dot cal__dot--performance"></span>공연 일정</span>
      </div>
      <div class="cal__selected-info" data-info></div>
    `,S(),e.querySelectorAll("[data-mode]").forEach(k=>{k.addEventListener("click",()=>{const x=k.dataset.mode;if(x!==d){if(x==="week"){const s=n?new Date(n):a;r=pi(s)}else o=new Date(r.getFullYear(),r.getMonth(),1);d=x,b()}})}),e.querySelectorAll("[data-nav]").forEach(k=>{k.addEventListener("click",()=>{const x=Number(k.dataset.nav);if(d==="month")o=new Date(o.getFullYear(),o.getMonth()+x,1);else{const s=new Date(r);s.setDate(s.getDate()+x*7),r=s}b()})}),e.querySelectorAll(".cal__day[data-date]").forEach(k=>{k.addEventListener("click",()=>{n=k.dataset.date,b()})})}function S(){const E=e.querySelector("[data-info]");if(!E)return;const v=l(n);if(!v.length){E.innerHTML=`<div class="empty">${n==null?void 0:n.slice(5).replace("-",".")} 일정이 없습니다.</div>`;return}E.innerHTML=v.map(k=>{const x=bo(k.type);return`
          <div class="cal__event-row" data-concert="${k.concertId||""}">
            <b>${k.title}</b>
            <span class="badge ${x.cls}">${x.label}</span>
          </div>
        `}).join(""),E.querySelectorAll("[data-concert]").forEach(k=>{const x=k.dataset.concert;x&&(k.style.cursor="pointer",k.addEventListener("click",()=>i(x)))})}return b(),{setEvents(E){t=E,b()}}}const Se={zones:[{id:"A1",name:"A1 구역",grade:"S",floor:"1F",seats:[{id:"A1-1",x:56,y:914.7},{id:"A1-2",x:56,y:905.7},{id:"A1-3",x:56,y:896.3},{id:"A1-4",x:56,y:886.8},{id:"A1-5",x:56,y:877.8},{id:"A1-6",x:56,y:868.4},{id:"A1-7",x:66.9,y:951.6},{id:"A1-8",x:66.9,y:942.6},{id:"A1-9",x:66.9,y:933.2},{id:"A1-10",x:66.9,y:923.7},{id:"A1-11",x:66.9,y:914.7},{id:"A1-12",x:66.9,y:905.7},{id:"A1-13",x:66.9,y:896.3},{id:"A1-14",x:66.9,y:886.8},{id:"A1-15",x:66.9,y:877.8},{id:"A1-16",x:66.9,y:868.4},{id:"A1-17",x:85.1,y:951.6},{id:"A1-18",x:85.1,y:942.6},{id:"A1-19",x:85.1,y:933.2},{id:"A1-20",x:85.1,y:923.7},{id:"A1-21",x:85.1,y:914.7},{id:"A1-22",x:85.1,y:905.7},{id:"A1-23",x:85.1,y:896.3},{id:"A1-24",x:85.1,y:886.8},{id:"A1-25",x:85.1,y:877.8},{id:"A1-26",x:85.1,y:868.4},{id:"A1-27",x:95.9,y:951.6},{id:"A1-28",x:95.9,y:942.6},{id:"A1-29",x:95.9,y:933.2},{id:"A1-30",x:95.9,y:923.7},{id:"A1-31",x:95.9,y:914.7},{id:"A1-32",x:95.9,y:905.7},{id:"A1-33",x:95.9,y:896.3},{id:"A1-34",x:95.9,y:886.8},{id:"A1-35",x:95.9,y:877.8},{id:"A1-36",x:95.9,y:868.4},{id:"A1-37",x:106.9,y:951.6},{id:"A1-38",x:106.9,y:942.6},{id:"A1-39",x:106.9,y:933.2},{id:"A1-40",x:106.9,y:923.7},{id:"A1-41",x:106.9,y:914.7},{id:"A1-42",x:106.9,y:905.7},{id:"A1-43",x:106.9,y:896.3},{id:"A1-44",x:106.9,y:886.8},{id:"A1-45",x:106.9,y:877.8},{id:"A1-46",x:106.9,y:868.4},{id:"A1-47",x:117.2,y:951.6},{id:"A1-48",x:117.2,y:942.6},{id:"A1-49",x:117.2,y:933.2},{id:"A1-50",x:117.2,y:923.7},{id:"A1-51",x:117.2,y:914.7},{id:"A1-52",x:117.2,y:905.7},{id:"A1-53",x:117.2,y:896.3},{id:"A1-54",x:117.2,y:886.8},{id:"A1-55",x:117.2,y:877.8},{id:"A1-56",x:117.2,y:868.4},{id:"A1-57",x:128.3,y:951.6},{id:"A1-58",x:128.3,y:942.6},{id:"A1-59",x:128.3,y:933.2},{id:"A1-60",x:128.3,y:923.7},{id:"A1-61",x:128.3,y:914.7},{id:"A1-62",x:128.3,y:905.7},{id:"A1-63",x:128.3,y:896.3},{id:"A1-64",x:128.3,y:886.8},{id:"A1-65",x:128.3,y:877.8},{id:"A1-66",x:128.3,y:868.4},{id:"A1-67",x:138.7,y:951.6},{id:"A1-68",x:138.7,y:942.6},{id:"A1-69",x:138.7,y:933.2},{id:"A1-70",x:138.7,y:923.7},{id:"A1-71",x:138.7,y:914.7},{id:"A1-72",x:138.7,y:905.7},{id:"A1-73",x:138.7,y:896.3},{id:"A1-74",x:138.7,y:886.8},{id:"A1-75",x:138.7,y:877.8},{id:"A1-76",x:138.7,y:868.4},{id:"A1-77",x:149.1,y:951.6},{id:"A1-78",x:149.1,y:942.6},{id:"A1-79",x:149.1,y:933.2},{id:"A1-80",x:149.1,y:923.7},{id:"A1-81",x:149.1,y:914.7},{id:"A1-82",x:149.1,y:905.7},{id:"A1-83",x:149.1,y:896.3},{id:"A1-84",x:149.1,y:886.8},{id:"A1-85",x:149.1,y:877.8},{id:"A1-86",x:149.1,y:868.4}]},{id:"A2",name:"A2 구역",grade:"S",floor:"1F",seats:[{id:"A2-1",x:44.4,y:828.9},{id:"A2-2",x:44.4,y:819.9},{id:"A2-3",x:44.4,y:810.9},{id:"A2-4",x:44.4,y:801.4},{id:"A2-5",x:44.4,y:792},{id:"A2-6",x:44.4,y:783},{id:"A2-7",x:44.4,y:773.6},{id:"A2-8",x:44.4,y:764.5},{id:"A2-9",x:44.4,y:755.1},{id:"A2-10",x:44.4,y:746.1},{id:"A2-11",x:44.4,y:736.6},{id:"A2-12",x:44.4,y:727.6},{id:"A2-13",x:56.2,y:828.9},{id:"A2-14",x:56.2,y:819.9},{id:"A2-15",x:56.2,y:810.9},{id:"A2-16",x:56.2,y:801.4},{id:"A2-17",x:56.2,y:792},{id:"A2-18",x:56.2,y:783},{id:"A2-19",x:56.2,y:773.6},{id:"A2-20",x:56.2,y:764.5},{id:"A2-21",x:56.2,y:755.1},{id:"A2-22",x:56.2,y:746.1},{id:"A2-23",x:56.2,y:736.6},{id:"A2-24",x:56.2,y:727.6},{id:"A2-25",x:65.8,y:828.9},{id:"A2-26",x:65.8,y:819.9},{id:"A2-27",x:65.8,y:810.9},{id:"A2-28",x:65.8,y:801.4},{id:"A2-29",x:65.8,y:792},{id:"A2-30",x:65.8,y:783},{id:"A2-31",x:65.8,y:773.6},{id:"A2-32",x:65.8,y:764.5},{id:"A2-33",x:65.8,y:755.1},{id:"A2-34",x:65.8,y:746.1},{id:"A2-35",x:65.8,y:736.6},{id:"A2-36",x:65.8,y:727.6},{id:"A2-37",x:84.4,y:828.9},{id:"A2-38",x:84.4,y:819.9},{id:"A2-39",x:84.4,y:810.9},{id:"A2-40",x:84.4,y:801.4},{id:"A2-41",x:84.4,y:792},{id:"A2-42",x:84.4,y:783},{id:"A2-43",x:84.4,y:773.6},{id:"A2-44",x:84.4,y:764.5},{id:"A2-45",x:84.4,y:755.1},{id:"A2-46",x:84.4,y:746.1},{id:"A2-47",x:84.4,y:736.6},{id:"A2-48",x:84.4,y:727.6},{id:"A2-49",x:96.2,y:828.9},{id:"A2-50",x:96.2,y:819.9},{id:"A2-51",x:96.2,y:810.9},{id:"A2-52",x:96.2,y:801.4},{id:"A2-53",x:96.2,y:792},{id:"A2-54",x:96.2,y:783},{id:"A2-55",x:96.2,y:773.6},{id:"A2-56",x:96.2,y:764.5},{id:"A2-57",x:96.2,y:755.1},{id:"A2-58",x:96.2,y:746.1},{id:"A2-59",x:96.2,y:736.6},{id:"A2-60",x:96.2,y:727.6},{id:"A2-61",x:105.8,y:828.9},{id:"A2-62",x:105.8,y:819.9},{id:"A2-63",x:105.8,y:810.9},{id:"A2-64",x:105.8,y:801.4},{id:"A2-65",x:105.8,y:792},{id:"A2-66",x:105.8,y:783},{id:"A2-67",x:105.8,y:773.6},{id:"A2-68",x:105.8,y:764.5},{id:"A2-69",x:105.8,y:755.1},{id:"A2-70",x:105.8,y:746.1},{id:"A2-71",x:105.8,y:736.6},{id:"A2-72",x:105.8,y:727.6},{id:"A2-73",x:117.6,y:828.9},{id:"A2-74",x:117.6,y:819.9},{id:"A2-75",x:117.6,y:810.9},{id:"A2-76",x:117.6,y:801.4},{id:"A2-77",x:117.6,y:792},{id:"A2-78",x:117.6,y:783},{id:"A2-79",x:117.6,y:773.6},{id:"A2-80",x:117.6,y:764.5},{id:"A2-81",x:117.6,y:755.1},{id:"A2-82",x:117.6,y:746.1},{id:"A2-83",x:117.6,y:736.6},{id:"A2-84",x:117.6,y:727.6},{id:"A2-85",x:127.2,y:810.9},{id:"A2-86",x:127.2,y:801.4},{id:"A2-87",x:127.2,y:773.6},{id:"A2-88",x:127.2,y:764.5},{id:"A2-89",x:127.2,y:736.6},{id:"A2-90",x:127.2,y:727.6},{id:"A2-91",x:127.2,y:828.9},{id:"A2-92",x:127.2,y:819.9},{id:"A2-93",x:127.2,y:792},{id:"A2-94",x:127.2,y:783},{id:"A2-95",x:127.2,y:755.1},{id:"A2-96",x:127.2,y:746.1},{id:"A2-97",x:139.1,y:810.9},{id:"A2-98",x:139.1,y:801.4},{id:"A2-99",x:139.1,y:773.6},{id:"A2-100",x:139.1,y:764.5},{id:"A2-101",x:139.1,y:736.6},{id:"A2-102",x:139.1,y:727.6},{id:"A2-103",x:139.1,y:828.9},{id:"A2-104",x:139.1,y:819.9},{id:"A2-105",x:139.1,y:792},{id:"A2-106",x:139.1,y:783},{id:"A2-107",x:139.1,y:755.1},{id:"A2-108",x:139.1,y:746.1},{id:"A2-109",x:148.1,y:828.9},{id:"A2-110",x:148.1,y:819.9},{id:"A2-111",x:148.1,y:810.9},{id:"A2-112",x:148.1,y:801.4},{id:"A2-113",x:148.1,y:792},{id:"A2-114",x:148.1,y:783},{id:"A2-115",x:148.1,y:773.6},{id:"A2-116",x:148.1,y:764.5},{id:"A2-117",x:148.1,y:755.1},{id:"A2-118",x:148.1,y:736.6},{id:"A2-119",x:148.1,y:727.6},{id:"A2-120",x:148.1,y:746.1}]},{id:"A3",name:"A3 구역",grade:"S",floor:"1F",seats:[{id:"A3-1",x:45.1,y:687.9},{id:"A3-2",x:45.1,y:678.5},{id:"A3-3",x:45.1,y:669},{id:"A3-4",x:45.1,y:660},{id:"A3-5",x:45.1,y:650.6},{id:"A3-6",x:45.1,y:641.5},{id:"A3-7",x:45.1,y:632.1},{id:"A3-8",x:45.1,y:623.1},{id:"A3-9",x:45.1,y:613.7},{id:"A3-10",x:45.1,y:604.6},{id:"A3-11",x:45.1,y:595.2},{id:"A3-12",x:45.1,y:586.2},{id:"A3-13",x:56.9,y:687.9},{id:"A3-14",x:56.9,y:678.5},{id:"A3-15",x:56.9,y:669},{id:"A3-16",x:56.9,y:660},{id:"A3-17",x:56.9,y:650.6},{id:"A3-18",x:56.9,y:641.5},{id:"A3-19",x:56.9,y:632.1},{id:"A3-20",x:56.9,y:623.1},{id:"A3-21",x:56.9,y:613.7},{id:"A3-22",x:56.9,y:604.6},{id:"A3-23",x:56.9,y:595.2},{id:"A3-24",x:56.9,y:586.2},{id:"A3-25",x:66.5,y:687.9},{id:"A3-26",x:66.5,y:678.5},{id:"A3-27",x:66.5,y:669},{id:"A3-28",x:66.5,y:660},{id:"A3-29",x:66.5,y:650.6},{id:"A3-30",x:66.5,y:641.5},{id:"A3-31",x:66.5,y:632.1},{id:"A3-32",x:66.5,y:623.1},{id:"A3-33",x:66.5,y:613.7},{id:"A3-34",x:66.5,y:604.6},{id:"A3-35",x:66.5,y:595.2},{id:"A3-36",x:66.5,y:586.2},{id:"A3-37",x:85.1,y:687.9},{id:"A3-38",x:85.1,y:678.5},{id:"A3-39",x:85.1,y:669},{id:"A3-40",x:85.1,y:660},{id:"A3-41",x:85.1,y:650.6},{id:"A3-42",x:85.1,y:641.5},{id:"A3-43",x:85.1,y:632.1},{id:"A3-44",x:85.1,y:623.1},{id:"A3-45",x:85.1,y:613.7},{id:"A3-46",x:85.1,y:604.6},{id:"A3-47",x:85.1,y:595.2},{id:"A3-48",x:85.1,y:586.2},{id:"A3-49",x:96.9,y:687.9},{id:"A3-50",x:96.9,y:678.5},{id:"A3-51",x:96.9,y:669},{id:"A3-52",x:96.9,y:660},{id:"A3-53",x:96.9,y:650.6},{id:"A3-54",x:96.9,y:641.5},{id:"A3-55",x:96.9,y:632.1},{id:"A3-56",x:96.9,y:623.1},{id:"A3-57",x:96.9,y:613.7},{id:"A3-58",x:96.9,y:604.6},{id:"A3-59",x:96.9,y:595.2},{id:"A3-60",x:96.9,y:586.2},{id:"A3-61",x:106.5,y:687.9},{id:"A3-62",x:106.5,y:678.5},{id:"A3-63",x:106.5,y:669},{id:"A3-64",x:106.5,y:660},{id:"A3-65",x:106.5,y:650.6},{id:"A3-66",x:106.5,y:641.5},{id:"A3-67",x:106.5,y:632.1},{id:"A3-68",x:106.5,y:623.1},{id:"A3-69",x:106.5,y:613.7},{id:"A3-70",x:106.5,y:604.6},{id:"A3-71",x:106.5,y:595.2},{id:"A3-72",x:106.5,y:586.2},{id:"A3-73",x:118.3,y:687.9},{id:"A3-74",x:118.3,y:678.5},{id:"A3-75",x:118.3,y:669},{id:"A3-76",x:118.3,y:660},{id:"A3-77",x:118.3,y:650.6},{id:"A3-78",x:118.3,y:641.5},{id:"A3-79",x:118.3,y:632.1},{id:"A3-80",x:118.3,y:623.1},{id:"A3-81",x:118.3,y:613.7},{id:"A3-82",x:118.3,y:604.6},{id:"A3-83",x:118.3,y:595.2},{id:"A3-84",x:118.3,y:586.2},{id:"A3-85",x:127.2,y:669},{id:"A3-86",x:127.2,y:660},{id:"A3-87",x:127.2,y:632.1},{id:"A3-88",x:127.2,y:623.1},{id:"A3-89",x:127.2,y:595.2},{id:"A3-90",x:127.2,y:586.2},{id:"A3-91",x:127.2,y:687.9},{id:"A3-92",x:127.2,y:678.5},{id:"A3-93",x:127.2,y:650.6},{id:"A3-94",x:127.2,y:641.5},{id:"A3-95",x:127.2,y:613.7},{id:"A3-96",x:127.2,y:604.6},{id:"A3-97",x:139.7,y:669},{id:"A3-98",x:139.7,y:660},{id:"A3-99",x:139.7,y:632.1},{id:"A3-100",x:139.7,y:623.1},{id:"A3-101",x:139.7,y:595.2},{id:"A3-102",x:139.7,y:586.2},{id:"A3-103",x:139.7,y:687.9},{id:"A3-104",x:139.7,y:678.5},{id:"A3-105",x:139.7,y:650.6},{id:"A3-106",x:139.7,y:641.5},{id:"A3-107",x:139.7,y:613.7},{id:"A3-108",x:139.7,y:604.6},{id:"A3-109",x:148.7,y:687.9},{id:"A3-110",x:148.7,y:678.5},{id:"A3-111",x:148.7,y:669},{id:"A3-112",x:148.7,y:660},{id:"A3-113",x:148.7,y:650.6},{id:"A3-114",x:148.7,y:641.5},{id:"A3-115",x:148.7,y:632.1},{id:"A3-116",x:148.7,y:623.1},{id:"A3-117",x:148.7,y:613.7},{id:"A3-118",x:148.7,y:604.6},{id:"A3-119",x:148.7,y:595.2},{id:"A3-120",x:148.7,y:586.2}]},{id:"A4",name:"A4 구역",grade:"S",floor:"1F",seats:[{id:"A4-1",x:54.9,y:546.8},{id:"A4-2",x:54.9,y:537.4},{id:"A4-3",x:54.9,y:528.4},{id:"A4-4",x:54.9,y:518.9},{id:"A4-5",x:54.9,y:509.9},{id:"A4-6",x:54.9,y:500.5},{id:"A4-7",x:66.8,y:491.4},{id:"A4-8",x:66.8,y:482},{id:"A4-9",x:66.8,y:473},{id:"A4-10",x:66.8,y:463.5},{id:"A4-11",x:66.8,y:454.5},{id:"A4-12",x:66.8,y:546.8},{id:"A4-13",x:66.8,y:537.4},{id:"A4-14",x:66.8,y:528.4},{id:"A4-15",x:66.8,y:518.9},{id:"A4-16",x:66.8,y:509.9},{id:"A4-17",x:66.8,y:500.5},{id:"A4-18",x:84.2,y:546.8},{id:"A4-19",x:84.2,y:537.4},{id:"A4-20",x:84.2,y:528.4},{id:"A4-21",x:84.2,y:518.9},{id:"A4-22",x:84.2,y:509.9},{id:"A4-23",x:84.2,y:500.5},{id:"A4-24",x:84.2,y:491.4},{id:"A4-25",x:84.2,y:482},{id:"A4-26",x:84.2,y:473},{id:"A4-27",x:84.2,y:463.5},{id:"A4-28",x:84.2,y:454.5},{id:"A4-29",x:84.2,y:445},{id:"A4-30",x:84.2,y:435.6},{id:"A4-31",x:84.2,y:426.5},{id:"A4-32",x:96.1,y:546.8},{id:"A4-33",x:96.1,y:537.4},{id:"A4-34",x:96.1,y:528.4},{id:"A4-35",x:96.1,y:518.9},{id:"A4-36",x:96.1,y:509.9},{id:"A4-37",x:96.1,y:500.5},{id:"A4-38",x:96.1,y:491.4},{id:"A4-39",x:96.1,y:482},{id:"A4-40",x:96.1,y:473},{id:"A4-41",x:96.1,y:463.5},{id:"A4-42",x:96.1,y:454.5},{id:"A4-43",x:96.1,y:445},{id:"A4-44",x:96.1,y:435.6},{id:"A4-45",x:96.1,y:426.5},{id:"A4-46",x:106.5,y:546.8},{id:"A4-47",x:106.5,y:537.4},{id:"A4-48",x:106.5,y:528.4},{id:"A4-49",x:106.5,y:518.9},{id:"A4-50",x:106.5,y:509.9},{id:"A4-51",x:106.5,y:500.5},{id:"A4-52",x:106.5,y:491.4},{id:"A4-53",x:106.5,y:482},{id:"A4-54",x:106.5,y:473},{id:"A4-55",x:106.5,y:463.5},{id:"A4-56",x:106.5,y:454.5},{id:"A4-57",x:106.5,y:445},{id:"A4-58",x:106.5,y:435.6},{id:"A4-59",x:106.5,y:426.5},{id:"A4-60",x:116.9,y:546.8},{id:"A4-61",x:116.9,y:537.4},{id:"A4-62",x:116.9,y:528.4},{id:"A4-63",x:116.9,y:518.9},{id:"A4-64",x:116.9,y:509.9},{id:"A4-65",x:116.9,y:500.5},{id:"A4-66",x:116.9,y:491.4},{id:"A4-67",x:116.9,y:482},{id:"A4-68",x:116.9,y:473},{id:"A4-69",x:116.9,y:463.5},{id:"A4-70",x:116.9,y:454.5},{id:"A4-71",x:116.9,y:445},{id:"A4-72",x:116.9,y:435.6},{id:"A4-73",x:116.9,y:426.5},{id:"A4-74",x:127,y:528.4},{id:"A4-75",x:127,y:518.9},{id:"A4-76",x:127,y:491.4},{id:"A4-77",x:127,y:482},{id:"A4-78",x:127,y:454.5},{id:"A4-79",x:127,y:445},{id:"A4-80",x:127,y:435.6},{id:"A4-81",x:127,y:426.5},{id:"A4-82",x:127,y:546.8},{id:"A4-83",x:127,y:537.4},{id:"A4-84",x:127,y:509.9},{id:"A4-85",x:127,y:500.5},{id:"A4-86",x:127,y:473},{id:"A4-87",x:127,y:463.5},{id:"A4-88",x:138.1,y:528.4},{id:"A4-89",x:138.1,y:518.9},{id:"A4-90",x:138.1,y:491.4},{id:"A4-91",x:138.1,y:482},{id:"A4-92",x:138.1,y:454.5},{id:"A4-93",x:138.1,y:445},{id:"A4-94",x:138.1,y:435.6},{id:"A4-95",x:138.1,y:426.5},{id:"A4-96",x:138.1,y:546.8},{id:"A4-97",x:138.1,y:537.4},{id:"A4-98",x:138.1,y:509.9},{id:"A4-99",x:138.1,y:500.5},{id:"A4-100",x:138.1,y:473},{id:"A4-101",x:138.1,y:463.5},{id:"A4-102",x:148.8,y:546.8},{id:"A4-103",x:148.8,y:537.4},{id:"A4-104",x:148.8,y:528.4},{id:"A4-105",x:148.8,y:518.9},{id:"A4-106",x:148.8,y:509.9},{id:"A4-107",x:148.8,y:500.5},{id:"A4-108",x:148.8,y:491.4},{id:"A4-109",x:148.8,y:482},{id:"A4-110",x:148.8,y:473},{id:"A4-111",x:148.8,y:463.5},{id:"A4-112",x:148.8,y:454.5},{id:"A4-113",x:148.8,y:445},{id:"A4-114",x:148.8,y:435.6},{id:"A4-115",x:148.8,y:426.5}]},{id:"B1",name:"B1 구역",grade:"R",floor:"1F",seats:[{id:"B1-1",x:188.5,y:700.4},{id:"B1-2",x:188,y:633.1},{id:"B1-3",x:190.3,y:743},{id:"B1-4",x:189.4,y:676.1},{id:"B1-5",x:191.1,y:718.7},{id:"B1-6",x:190.6,y:651.8},{id:"B1-7",x:192.8,y:626.5},{id:"B1-8",x:193.3,y:694.1},{id:"B1-9",x:194.4,y:669},{id:"B1-10",x:194.9,y:735.7},{id:"B1-11",x:195.8,y:711},{id:"B1-12",x:195.9,y:644.6},{id:"B1-13",x:198.3,y:753.9},{id:"B1-14",x:197.9,y:687.1},{id:"B1-15",x:199.2,y:729},{id:"B1-16",x:199.2,y:662.5},{id:"B1-17",x:200.8,y:638},{id:"B1-18",x:200.9,y:704.6},{id:"B1-19",x:202.3,y:680.8},{id:"B1-20",x:203.2,y:746.7},{id:"B1-21",x:203.8,y:655.9},{id:"B1-22",x:204.2,y:722.5},{id:"B1-23",x:205.4,y:698.5},{id:"B1-24",x:205.9,y:607.9},{id:"B1-25",x:206.1,y:765.7},{id:"B1-26",x:206.9,y:673.7},{id:"B1-27",x:207.5,y:740.9},{id:"B1-28",x:208.7,y:715.8},{id:"B1-29",x:209,y:648.8},{id:"B1-30",x:209.9,y:691.7},{id:"B1-31",x:210.7,y:601.2},{id:"B1-32",x:211.1,y:758},{id:"B1-33",x:211.5,y:667.3},{id:"B1-34",x:212.6,y:733.8},{id:"B1-35",x:214.3,y:777.2},{id:"B1-36",x:213.9,y:709.6},{id:"B1-37",x:214.4,y:619},{id:"B1-38",x:214.6,y:685.1},{id:"B1-39",x:215.6,y:752},{id:"B1-40",x:215.6,y:594.2},{id:"B1-41",x:216.7,y:660.2},{id:"B1-42",x:217.3,y:727.6},{id:"B1-43",x:218.2,y:702.9},{id:"B1-44",x:218.8,y:612.8},{id:"B1-45",x:219.1,y:770.7},{id:"B1-46",x:219.5,y:678.3},{id:"B1-47",x:220.3,y:587.8},{id:"B1-48",x:220.8,y:745.8},{id:"B1-49",x:221.8,y:788.2},{id:"B1-50",x:222,y:720.7},{id:"B1-51",x:222.9,y:696.4},{id:"B1-52",x:222,y:630.3},{id:"B1-53",x:223.8,y:763.4},{id:"B1-54",x:224.2,y:671.7},{id:"B1-55",x:223.7,y:605.9},{id:"B1-56",x:224.9,y:581.6},{id:"B1-57",x:225.1,y:739.3},{id:"B1-58",x:226.2,y:714.9},{id:"B1-59",x:227.1,y:623.4},{id:"B1-60",x:226.7,y:780.8},{id:"B1-61",x:227.4,y:690.3},{id:"B1-62",x:228.5,y:599.2},{id:"B1-63",x:228.4,y:756.7},{id:"B1-64",x:229.7,y:799.4},{id:"B1-65",x:229.6,y:732.4},{id:"B1-66",x:230.3,y:642},{id:"B1-67",x:229.8,y:575.2},{id:"B1-68",x:231.3,y:708.1},{id:"B1-69",x:231.6,y:616.9},{id:"B1-70",x:231.8,y:774.8},{id:"B1-71",x:232.7,y:683},{id:"B1-72",x:233.2,y:592.9},{id:"B1-73",x:232.9,y:750.3},{id:"B1-74",x:234,y:568.4},{id:"B1-75",x:234.2,y:792.5},{id:"B1-76",x:234.3,y:725.7},{id:"B1-77",x:234.7,y:635},{id:"B1-78",x:235.7,y:767.2},{id:"B1-79",x:235.7,y:700.8},{id:"B1-80",x:236.3,y:609.8},{id:"B1-81",x:237.9,y:810.6},{id:"B1-82",x:237.6,y:653},{id:"B1-83",x:237.5,y:585.7},{id:"B1-84",x:237.9,y:743.6},{id:"B1-85",x:238.5,y:561.6},{id:"B1-86",x:239.4,y:786.2},{id:"B1-87",x:239.1,y:718.7},{id:"B1-88",x:240.6,y:693.8},{id:"B1-89",x:239.7,y:628.6},{id:"B1-90",x:240.4,y:760.6},{id:"B1-91",x:240.5,y:603.2},{id:"B1-92",x:242.5,y:737.2},{id:"B1-93",x:242.6,y:804.5},{id:"B1-94",x:242.8,y:646.2},{id:"B1-95",x:242.3,y:579.4},{id:"B1-96",x:243.6,y:554.9},{id:"B1-97",x:243.7,y:712},{id:"B1-98",x:244.1,y:779.2},{id:"B1-99",x:244.4,y:622},{id:"B1-100",x:245.4,y:753.8},{id:"B1-101",x:245.7,y:664.5},{id:"B1-102",x:245.7,y:597.5},{id:"B1-103",x:246.6,y:573.5},{id:"B1-104",x:247,y:730.5},{id:"B1-105",x:246.9,y:640.1},{id:"B1-106",x:247.5,y:797.5},{id:"B1-107",x:248.6,y:705.5},{id:"B1-108",x:247.9,y:548.6},{id:"B1-109",x:248.8,y:773.1},{id:"B1-110",x:249.1,y:615.2},{id:"B1-111",x:249.7,y:748},{id:"B1-112",x:250.4,y:657.9},{id:"B1-113",x:250.2,y:590.9},{id:"B1-114",x:252.1,y:791.4},{id:"B1-115",x:251.9,y:633.3},{id:"B1-116",x:251.9,y:723.7},{id:"B1-117",x:251.8,y:566.6},{id:"B1-118",x:252.8,y:541.3},{id:"B1-119",x:253.8,y:608.9},{id:"B1-120",x:253.4,y:765.7},{id:"B1-121",x:254.6,y:584.5},{id:"B1-122",x:254.5,y:740.7},{id:"B1-123",x:253.9,y:676.6},{id:"B1-124",x:255.2,y:651.4},{id:"B1-125",x:256.2,y:560.2},{id:"B1-126",x:256.5,y:784.4},{id:"B1-127",x:256.8,y:717.1},{id:"B1-128",x:256.7,y:626.5},{id:"B1-129",x:257.4,y:535.2},{id:"B1-130",x:258,y:759.4},{id:"B1-131",x:258.8,y:669.1},{id:"B1-132",x:258.5,y:602.1},{id:"B1-133",x:259.3,y:577.2},{id:"B1-134",x:259.8,y:644.8},{id:"B1-135",x:259.3,y:734.2},{id:"B1-136",x:261.1,y:777.1},{id:"B1-137",x:261.7,y:688},{id:"B1-138",x:261.1,y:619.7},{id:"B1-139",x:260.9,y:553.2},{id:"B1-140",x:262.6,y:527.8},{id:"B1-141",x:262.8,y:752.8},{id:"B1-142",x:263.7,y:662.6},{id:"B1-143",x:263.3,y:595.3},{id:"B1-144",x:263.7,y:570.5},{id:"B1-145",x:264.4,y:637.7},{id:"B1-146",x:264.6,y:727.4},{id:"B1-147",x:265.6,y:612.8},{id:"B1-148",x:266,y:545.4},{id:"B1-149",x:266,y:770.3},{id:"B1-150",x:267.3,y:745.6},{id:"B1-151",x:266.6,y:681.7},{id:"B1-152",x:268,y:655.7},{id:"B1-153",x:268.3,y:588.3},{id:"B1-154",x:268.2,y:563.7},{id:"B1-155",x:269.4,y:631.5},{id:"B1-156",x:270.9,y:763.9}]},{id:"B2",name:"B2 구역",grade:"R",floor:"1F",seats:[{id:"B2-1",x:185.8,y:567.9},{id:"B2-2",x:186.7,y:502.4},{id:"B2-3",x:187.2,y:477.2},{id:"B2-4",x:188.3,y:543.9},{id:"B2-5",x:188.7,y:452.4},{id:"B2-6",x:190,y:586.3},{id:"B2-7",x:189.6,y:519.7},{id:"B2-8",x:190.4,y:561.5},{id:"B2-9",x:190.9,y:427.7},{id:"B2-10",x:191.2,y:496.4},{id:"B2-11",x:191.8,y:470.7},{id:"B2-12",x:193,y:537.4},{id:"B2-13",x:193.5,y:445.5},{id:"B2-14",x:194.1,y:513.2},{id:"B2-15",x:194.8,y:579.5},{id:"B2-16",x:195.7,y:554.1},{id:"B2-17",x:195.9,y:397.7},{id:"B2-18",x:196.1,y:489.2},{id:"B2-19",x:196.4,y:463.7},{id:"B2-20",x:197.2,y:530.8},{id:"B2-21",x:197.9,y:438.6},{id:"B2-22",x:198.8,y:506.1},{id:"B2-23",x:199.6,y:572.5},{id:"B2-24",x:200.3,y:547.4},{id:"B2-25",x:200.5,y:482.8},{id:"B2-26",x:201.6,y:457},{id:"B2-27",x:201,y:390.3},{id:"B2-28",x:202.2,y:523.8},{id:"B2-29",x:203.8,y:499.9},{id:"B2-30",x:204.4,y:565.8},{id:"B2-31",x:204.1,y:408.7},{id:"B2-32",x:205.2,y:540.7},{id:"B2-33",x:205.4,y:475.8},{id:"B2-34",x:205.7,y:383.6},{id:"B2-35",x:206.5,y:450.3},{id:"B2-36",x:207,y:517.2},{id:"B2-37",x:208.1,y:493.6},{id:"B2-38",x:208.9,y:402.1},{id:"B2-39",x:209.1,y:559.4},{id:"B2-40",x:209.9,y:533.7},{id:"B2-41",x:210,y:469.2},{id:"B2-42",x:210.7,y:377.3},{id:"B2-43",x:267.6,y:431.3},{id:"B2-44",x:211.6,y:510.8},{id:"B2-45",x:212,y:420.1},{id:"B2-46",x:213,y:487},{id:"B2-47",x:213.5,y:395.2},{id:"B2-48",x:214,y:552.4},{id:"B2-49",x:214.3,y:527.6},{id:"B2-50",x:215,y:462},{id:"B2-51",x:215.4,y:370.4},{id:"B2-52",x:216.4,y:504.4},{id:"B2-53",x:217.1,y:413.5},{id:"B2-54",x:217.9,y:479.9},{id:"B2-55",x:218.2,y:388.6},{id:"B2-56",x:218.9,y:545.4},{id:"B2-57",x:219.3,y:521},{id:"B2-58",x:220.1,y:431.2},{id:"B2-59",x:220,y:364},{id:"B2-60",x:221,y:497.5},{id:"B2-61",x:222,y:406.1},{id:"B2-62",x:222.8,y:382},{id:"B2-63",x:222.8,y:473},{id:"B2-64",x:223.4,y:538.8},{id:"B2-65",x:223.8,y:514.5},{id:"B2-66",x:225,y:424.4},{id:"B2-67",x:224.5,y:357.9},{id:"B2-68",x:225.9,y:490.8},{id:"B2-69",x:226.2,y:400.2},{id:"B2-70",x:227.2,y:375.3},{id:"B2-71",x:227.9,y:532.7},{id:"B2-72",x:228.5,y:507.3},{id:"B2-73",x:228.6,y:442.8},{id:"B2-74",x:228.7,y:351.7},{id:"B2-75",x:230.4,y:483.7},{id:"B2-76",x:229.9,y:417.5},{id:"B2-77",x:231.1,y:393.4},{id:"B2-78",x:232.1,y:368.9},{id:"B2-79",x:232.8,y:526},{id:"B2-80",x:233.2,y:501.2},{id:"B2-81",x:233.5,y:436.3},{id:"B2-82",x:233.7,y:345},{id:"B2-83",x:234.3,y:411.1},{id:"B2-84",x:235.8,y:453.5},{id:"B2-85",x:235.7,y:387},{id:"B2-86",x:236.7,y:362.6},{id:"B2-87",x:237.6,y:519.8},{id:"B2-88",x:238.1,y:494.4},{id:"B2-89",x:237.9,y:429.4},{id:"B2-90",x:238.4,y:337.8},{id:"B2-91",x:238.7,y:404.5},{id:"B2-92",x:241,y:446.7},{id:"B2-93",x:240.5,y:380.3},{id:"B2-94",x:242.2,y:512.9},{id:"B2-95",x:242.3,y:423.2},{id:"B2-96",x:241.7,y:355.7},{id:"B2-97",x:243.8,y:465.2},{id:"B2-98",x:243.6,y:397.9},{id:"B2-99",x:245.5,y:440.4},{id:"B2-100",x:244.8,y:373.7},{id:"B2-101",x:246.4,y:348.8},{id:"B2-102",x:246.8,y:506.1},{id:"B2-103",x:247.3,y:416.1},{id:"B2-104",x:248.5,y:458.4},{id:"B2-105",x:248.5,y:390.9},{id:"B2-106",x:249.7,y:366.6},{id:"B2-107",x:250.1,y:433.4},{id:"B2-108",x:252,y:476.4},{id:"B2-109",x:252,y:409.3},{id:"B2-110",x:253.5,y:451.1},{id:"B2-111",x:252.8,y:384.7},{id:"B2-112",x:254.7,y:359.9},{id:"B2-113",x:255,y:426.5},{id:"B2-114",x:256.9,y:470.2},{id:"B2-115",x:256.6,y:402.7},{id:"B2-116",x:258.1,y:444.9},{id:"B2-117",x:257.5,y:377.4},{id:"B2-118",x:259.5,y:420},{id:"B2-119",x:260.1,y:488.7},{id:"B2-120",x:261.5,y:396},{id:"B2-121",x:261.5,y:463.1},{id:"B2-122",x:262.5,y:370.2},{id:"B2-123",x:262.9,y:438},{id:"B2-124",x:264.1,y:413.1},{id:"B2-125",x:265.1,y:481.9},{id:"B2-126",x:266.7,y:456},{id:"B2-127",x:266.7,y:388.8}]},{id:"D1",name:"D1 구역",grade:"R",floor:"1F",seats:[{id:"D1-1",x:728.6,y:764.9},{id:"D1-2",x:730.7,y:630.9},{id:"D1-3",x:731.8,y:655.5},{id:"D1-4",x:731.6,y:588.5},{id:"D1-5",x:732,y:747.3},{id:"D1-6",x:733.4,y:680.8},{id:"D1-7",x:733.5,y:772.2},{id:"D1-8",x:738.6,y:619.3},{id:"D1-9",x:733.5,y:546.3},{id:"D1-10",x:735.4,y:637.8},{id:"D1-11",x:736.4,y:595.2},{id:"D1-12",x:736.7,y:754.2},{id:"D1-13",x:736.9,y:662.5},{id:"D1-14",x:737,y:528.2},{id:"D1-15",x:738.1,y:687.7},{id:"D1-16",x:738.4,y:552.9},{id:"D1-17",x:737.6,y:778.4},{id:"D1-18",x:740.4,y:576.9},{id:"D1-19",x:741.7,y:669.2},{id:"D1-20",x:745.7,y:608.2},{id:"D1-21",x:741.6,y:760.8},{id:"D1-22",x:742.1,y:535},{id:"D1-23",x:742.5,y:718.4},{id:"D1-24",x:743.2,y:559.6},{id:"D1-25",x:744.4,y:741.7},{id:"D1-26",x:745.2,y:583.7},{id:"D1-27",x:746.4,y:767.5},{id:"D1-28",x:746.4,y:676.1},{id:"D1-29",x:747.3,y:725.1},{id:"D1-30",x:748.1,y:632.4},{id:"D1-31",x:748,y:566.2},{id:"D1-32",x:749.1,y:748.6},{id:"D1-33",x:749.8,y:657.9},{id:"D1-34",x:749.9,y:590.4},{id:"D1-35",x:750.2,y:706.1},{id:"D1-36",x:755.8,y:780.8},{id:"D1-37",x:752.1,y:731.7},{id:"D1-38",x:753,y:639.1},{id:"D1-39",x:752.7,y:572.8},{id:"D1-40",x:754,y:755.3},{id:"D1-41",x:754.5,y:664.6},{id:"D1-42",x:754.6,y:596.9},{id:"D1-43",x:755,y:712.7},{id:"D1-44",x:755.3,y:621.7},{id:"D1-45",x:756.1,y:554.8},{id:"D1-46",x:757.7,y:646},{id:"D1-47",x:757.4,y:579.6},{id:"D1-48",x:759.2,y:603.6},{id:"D1-49",x:760.1,y:628.3},{id:"D1-50",x:759.8,y:719.4},{id:"D1-51",x:760.9,y:561.5},{id:"D1-52",x:762.5,y:652.6},{id:"D1-53",x:762,y:586},{id:"D1-54",x:764,y:610.1},{id:"D1-55",x:764.5,y:726.2},{id:"D1-56",x:764.9,y:635},{id:"D1-57",x:765.3,y:793.9},{id:"D1-58",x:766,y:751.7},{id:"D1-59",x:765.7,y:568.2},{id:"D1-60",x:766.8,y:592.7},{id:"D1-61",x:766.6,y:683.8},{id:"D1-62",x:768.1,y:774.9},{id:"D1-63",x:767.8,y:708.1},{id:"D1-64",x:768.9,y:616.7},{id:"D1-65",x:769.2,y:732.7},{id:"D1-66",x:769.6,y:641.8},{id:"D1-67",x:770.2,y:800.8},{id:"D1-68",x:770.6,y:574.8},{id:"D1-69",x:771.7,y:599.4},{id:"D1-70",x:772.9,y:781.6},{id:"D1-71",x:772.5,y:714.8},{id:"D1-72",x:773.6,y:623.5},{id:"D1-73",x:774,y:739.3},{id:"D1-74",x:774.5,y:672.5},{id:"D1-75",x:776.3,y:605.8},{id:"D1-76",x:777.9,y:788.5},{id:"D1-77",x:777.3,y:721.5},{id:"D1-78",x:778.4,y:630.2},{id:"D1-79",x:778.6,y:745.8},{id:"D1-80",x:779.2,y:679.4},{id:"D1-81",x:780.5,y:771.7},{id:"D1-82",x:780.9,y:703.6},{id:"D1-83",x:781.3,y:612.7},{id:"D1-84",x:781.8,y:661.5},{id:"D1-85",x:783.5,y:752.5},{id:"D1-86",x:784,y:686.1},{id:"D1-87",x:784.6,y:594.6},{id:"D1-88",x:785.3,y:778.4},{id:"D1-89",x:785.5,y:710},{id:"D1-90",x:786,y:619.5},{id:"D1-91",x:791.3,y:674.9},{id:"D1-92",x:788.2,y:759.3},{id:"D1-93",x:788.8,y:692.7},{id:"D1-94",x:789.4,y:601.3},{id:"D1-95",x:790.2,y:716.9},{id:"D1-96",x:790.3,y:650.3},{id:"D1-97",x:791.5,y:741.2},{id:"D1-98",x:793,y:766},{id:"D1-99",x:793.5,y:699.2},{id:"D1-100",x:794.4,y:608.2},{id:"D1-101",x:795,y:723.5},{id:"D1-102",x:795.2,y:657},{id:"D1-103",x:796.2,y:748.1},{id:"D1-104",x:798.2,y:705.6},{id:"D1-105",x:798.3,y:639},{id:"D1-106",x:799.7,y:730},{id:"D1-107",x:799.8,y:663.4},{id:"D1-108",x:800.6,y:688},{id:"D1-109",x:801.2,y:755.1},{id:"D1-110",x:803.1,y:712.5},{id:"D1-111",x:803.3,y:646},{id:"D1-112",x:804.7,y:737},{id:"D1-113",x:804.8,y:670.3},{id:"D1-114",x:805.5,y:694.6},{id:"D1-115",x:806.1,y:628},{id:"D1-116",x:808,y:719.6},{id:"D1-117",x:808.2,y:652.8},{id:"D1-118",x:809.3,y:743.7},{id:"D1-119",x:809.6,y:677},{id:"D1-120",x:810.4,y:701.5},{id:"D1-121",x:810.8,y:634.9},{id:"D1-122",x:742,y:785.4},{id:"D1-123",x:747.2,y:791.2},{id:"D1-124",x:751.4,y:799},{id:"D1-125",x:760.7,y:787.6},{id:"D1-126",x:751.4,y:774.8},{id:"D1-127",x:762.9,y:768.4},{id:"D1-128",x:758.2,y:762},{id:"D1-129",x:739.7,y:734.8},{id:"D1-130",x:735.1,y:728.4},{id:"D1-131",x:757,y:739.6},{id:"D1-132",x:761.6,y:745.9},{id:"D1-133",x:770.9,y:758.7},{id:"D1-134",x:775.5,y:765.1},{id:"D1-135",x:786.8,y:734.6},{id:"D1-136",x:782.2,y:728.3},{id:"D1-137",x:762.6,y:702.7},{id:"D1-138",x:757.9,y:694.7},{id:"D1-139",x:771.7,y:691.4},{id:"D1-140",x:776.3,y:697.8},{id:"D1-141",x:795.8,y:681.7},{id:"D1-142",x:786.5,y:668.9},{id:"D1-143",x:744.9,y:651.2},{id:"D1-144",x:740.3,y:644.8},{id:"D1-145",x:743.7,y:627.1},{id:"D1-146",x:734.4,y:612.7},{id:"D1-147",x:741.3,y:601.5},{id:"D1-148",x:750.5,y:615.9},{id:"D1-149",x:735.4,y:569.5},{id:"D1-150",x:730.7,y:564.7},{id:"D1-151",x:751.4,y:548.6},{id:"D1-152",x:746.7,y:542.2},{id:"D1-153",x:775.7,y:582.1},{id:"D1-154",x:779.1,y:588.5},{id:"D1-155",x:756.7,y:806},{id:"D1-156",x:761.6,y:813.2}]},{id:"D2",name:"D2 구역",grade:"R",floor:"1F",seats:[{id:"D2-1",x:732,y:432.2},{id:"D2-2",x:733.1,y:456.7},{id:"D2-3",x:733,y:389.7},{id:"D2-4",x:734.7,y:482},{id:"D2-5",x:736.7,y:439},{id:"D2-6",x:737,y:371.5},{id:"D2-7",x:737.8,y:396.3},{id:"D2-8",x:738.2,y:463.6},{id:"D2-9",x:739.5,y:488.9},{id:"D2-10",x:741.8,y:378.1},{id:"D2-11",x:743,y:470.4},{id:"D2-12",x:744.6,y:427.1},{id:"D2-13",x:744.5,y:360.9},{id:"D2-14",x:746.4,y:384.8},{id:"D2-15",x:747.7,y:477.3},{id:"D2-16",x:749.4,y:433.7},{id:"D2-17",x:749.2,y:367.3},{id:"D2-18",x:751.1,y:459.1},{id:"D2-19",x:752.1,y:505.1},{id:"D2-20",x:751.8,y:416.2},{id:"D2-21",x:753.4,y:346.1},{id:"D2-22",x:754.1,y:440.2},{id:"D2-23",x:753.9,y:373.8},{id:"D2-24",x:755.9,y:465.9},{id:"D2-25",x:757,y:512},{id:"D2-26",x:756.6,y:422.9},{id:"D2-27",x:758.4,y:353.5},{id:"D2-28",x:759,y:447.2},{id:"D2-29",x:758.6,y:380.7},{id:"D2-30",x:760.5,y:404.7},{id:"D2-31",x:761.5,y:337.1},{id:"D2-32",x:761.6,y:494.5},{id:"D2-33",x:761.4,y:429.3},{id:"D2-34",x:763.3,y:360},{id:"D2-35",x:763.8,y:453.9},{id:"D2-36",x:763.4,y:387.3},{id:"D2-37",x:765.3,y:411.4},{id:"D2-38",x:766.2,y:343.1},{id:"D2-39",x:766.2,y:436.3},{id:"D2-40",x:768.5,y:482.9},{id:"D2-41",x:768.2,y:394},{id:"D2-42",x:770,y:417.8},{id:"D2-43",x:771,y:349.7},{id:"D2-44",x:771.4,y:531.8},{id:"D2-45",x:771,y:443},{id:"D2-46",x:773.3,y:489.6},{id:"D2-47",x:775,y:424.8},{id:"D2-48",x:775.7,y:356.6},{id:"D2-49",x:776.2,y:538.5},{id:"D2-50",x:775.9,y:514.3},{id:"D2-51",x:776.9,y:472.7},{id:"D2-52",x:776.3,y:380.1},{id:"D2-53",x:777.8,y:496.2},{id:"D2-54",x:780.5,y:363.2},{id:"D2-55",x:779.8,y:431.4},{id:"D2-56",x:780.9,y:545.2},{id:"D2-57",x:780.7,y:521},{id:"D2-58",x:781.3,y:386.6},{id:"D2-59",x:781.6,y:479.6},{id:"D2-60",x:782.5,y:413.8},{id:"D2-61",x:784.6,y:462.2},{id:"D2-62",x:785.6,y:551.6},{id:"D2-63",x:785.4,y:527.8},{id:"D2-64",x:786.4,y:486.2},{id:"D2-65",x:785.8,y:394},{id:"D2-66",x:787.3,y:420.8},{id:"D2-67",x:789.2,y:468.7},{id:"D2-68",x:790.3,y:558.5},{id:"D2-69",x:790.1,y:534.3},{id:"D2-70",x:790.3,y:401.4},{id:"D2-71",x:792,y:516.1},{id:"D2-72",x:793,y:450},{id:"D2-73",x:793.9,y:475.6},{id:"D2-74",x:794.7,y:382.9},{id:"D2-75",x:794.8,y:540.9},{id:"D2-76",x:795,y:564.9},{id:"D2-77",x:795.5,y:409.2},{id:"D2-78",x:796.8,y:522.8},{id:"D2-79",x:797.8,y:456.7},{id:"D2-80",x:799.4,y:389.5},{id:"D2-81",x:799.9,y:571.6},{id:"D2-82",x:799.6,y:547.4},{id:"D2-83",x:800.5,y:505.8},{id:"D2-84",x:800.9,y:438.8},{id:"D2-85",x:801.5,y:529.3},{id:"D2-86",x:802.5,y:463.2},{id:"D2-87",x:804.4,y:554.1},{id:"D2-88",x:804.4,y:396.6},{id:"D2-89",x:804.6,y:578.4},{id:"D2-90",x:805.3,y:512.5},{id:"D2-91",x:806.5,y:536.2},{id:"D2-92",x:805.9,y:445.7},{id:"D2-93",x:807.4,y:470},{id:"D2-94",x:808.4,y:495.4},{id:"D2-95",x:809.4,y:585.1},{id:"D2-96",x:809.1,y:560.8},{id:"D2-97",x:808.6,y:428},{id:"D2-98",x:810.2,y:519.4},{id:"D2-99",x:810.7,y:452.7},{id:"D2-100",x:811.3,y:542.9},{id:"D2-101",x:812.1,y:476.9},{id:"D2-102",x:813.2,y:502.2},{id:"D2-103",x:813.9,y:567.6},{id:"D2-104",x:766.2,y:524.5},{id:"D2-105",x:762.7,y:518.1},{id:"D2-106",x:770.7,y:508.4},{id:"D2-107",x:766.1,y:502},{id:"D2-108",x:786.8,y:508.4},{id:"D2-109",x:783.3,y:502},{id:"D2-110",x:796,y:500.4},{id:"D2-111",x:791.3,y:492.4},{id:"D2-112",x:802.8,y:489.1},{id:"D2-113",x:799.3,y:482.7},{id:"D2-114",x:746.3,y:452.4},{id:"D2-115",x:741.7,y:446},{id:"D2-116",x:740.4,y:420.4},{id:"D2-117",x:735.8,y:414},{id:"D2-118",x:747.3,y:409.2},{id:"D2-119",x:742.6,y:402.8},{id:"D2-120",x:756.4,y:397.9},{id:"D2-121",x:751.8,y:391.5},{id:"D2-122",x:777.2,y:407.5},{id:"D2-123",x:772.5,y:401.1},{id:"D2-124",x:771.9,y:373.9},{id:"D2-125",x:767.8,y:367.2},{id:"D2-126",x:789.7,y:377},{id:"D2-127",x:785.1,y:370.6}]},{id:"E1",name:"E1 구역",grade:"S",floor:"1F",seats:[{id:"E1-1",x:851.6,y:950},{id:"E1-2",x:851.6,y:940.6},{id:"E1-3",x:851.6,y:931.5},{id:"E1-4",x:851.6,y:922.1},{id:"E1-5",x:851.6,y:913.1},{id:"E1-6",x:851.6,y:903.6},{id:"E1-7",x:851.6,y:894.2},{id:"E1-8",x:851.6,y:885.2},{id:"E1-9",x:851.6,y:876.2},{id:"E1-10",x:851.6,y:866.7},{id:"E1-11",x:861.3,y:866.7},{id:"E1-12",x:861.3,y:950},{id:"E1-13",x:861.3,y:940.6},{id:"E1-14",x:861.3,y:931.5},{id:"E1-15",x:861.3,y:922.1},{id:"E1-16",x:861.3,y:913.1},{id:"E1-17",x:861.3,y:903.6},{id:"E1-18",x:861.3,y:894.2},{id:"E1-19",x:861.3,y:885.2},{id:"E1-20",x:861.3,y:876.2},{id:"E1-21",x:872.4,y:950},{id:"E1-22",x:872.4,y:940.6},{id:"E1-23",x:872.4,y:931.5},{id:"E1-24",x:872.4,y:922.1},{id:"E1-25",x:872.4,y:913.1},{id:"E1-26",x:872.4,y:903.6},{id:"E1-27",x:872.4,y:894.2},{id:"E1-28",x:872.4,y:885.2},{id:"E1-29",x:872.4,y:876.2},{id:"E1-30",x:872.4,y:866.7},{id:"E1-31",x:882.7,y:866.7},{id:"E1-32",x:882.7,y:950},{id:"E1-33",x:882.7,y:940.6},{id:"E1-34",x:882.7,y:931.5},{id:"E1-35",x:882.7,y:922.1},{id:"E1-36",x:882.7,y:913.1},{id:"E1-37",x:882.7,y:903.6},{id:"E1-38",x:882.7,y:894.2},{id:"E1-39",x:882.7,y:885.2},{id:"E1-40",x:882.7,y:876.2},{id:"E1-41",x:893.8,y:950},{id:"E1-42",x:893.8,y:940.6},{id:"E1-43",x:893.8,y:931.5},{id:"E1-44",x:893.8,y:922.1},{id:"E1-45",x:893.8,y:913.1},{id:"E1-46",x:893.8,y:903.6},{id:"E1-47",x:893.8,y:894.2},{id:"E1-48",x:893.8,y:885.2},{id:"E1-49",x:893.8,y:876.2},{id:"E1-50",x:893.8,y:866.7},{id:"E1-51",x:904.2,y:866.7},{id:"E1-52",x:904.2,y:950},{id:"E1-53",x:904.2,y:940.6},{id:"E1-54",x:904.2,y:931.5},{id:"E1-55",x:904.2,y:922.1},{id:"E1-56",x:904.2,y:913.1},{id:"E1-57",x:904.2,y:903.6},{id:"E1-58",x:904.2,y:894.2},{id:"E1-59",x:904.2,y:885.2},{id:"E1-60",x:904.2,y:876.2},{id:"E1-61",x:915.2,y:950},{id:"E1-62",x:915.2,y:940.6},{id:"E1-63",x:915.2,y:931.5},{id:"E1-64",x:915.2,y:922.1},{id:"E1-65",x:915.2,y:913.1},{id:"E1-66",x:915.2,y:903.6},{id:"E1-67",x:915.2,y:894.2},{id:"E1-68",x:915.2,y:885.2},{id:"E1-69",x:915.2,y:876.2},{id:"E1-70",x:915.2,y:866.7},{id:"E1-71",x:933.8,y:950},{id:"E1-72",x:933.8,y:940.6},{id:"E1-73",x:933.8,y:931.5},{id:"E1-74",x:933.8,y:922.1},{id:"E1-75",x:933.8,y:913.1},{id:"E1-76",x:933.8,y:903.6},{id:"E1-77",x:933.8,y:894.2},{id:"E1-78",x:933.8,y:885.2},{id:"E1-79",x:933.8,y:876.2},{id:"E1-80",x:933.8,y:866.7},{id:"E1-81",x:944.4,y:913.1},{id:"E1-82",x:944.4,y:903.6},{id:"E1-83",x:944.4,y:894.2},{id:"E1-84",x:944.4,y:885.2},{id:"E1-85",x:944.4,y:876.2},{id:"E1-86",x:944.4,y:866.7}]},{id:"E2",name:"E2 구역",grade:"S",floor:"1F",seats:[{id:"E2-1",x:851,y:827.8},{id:"E2-2",x:851,y:818.8},{id:"E2-3",x:851,y:809.4},{id:"E2-4",x:851,y:800},{id:"E2-5",x:851,y:790.9},{id:"E2-6",x:851,y:781.9},{id:"E2-7",x:851,y:772.5},{id:"E2-8",x:851,y:763},{id:"E2-9",x:851,y:754},{id:"E2-10",x:851,y:744.6},{id:"E2-11",x:851,y:735.5},{id:"E2-12",x:851,y:726.1},{id:"E2-13",x:862.8,y:744.6},{id:"E2-14",x:862.8,y:735.5},{id:"E2-15",x:862.8,y:726.1},{id:"E2-16",x:862.8,y:827.8},{id:"E2-17",x:862.8,y:818.8},{id:"E2-18",x:862.8,y:809.4},{id:"E2-19",x:862.8,y:800},{id:"E2-20",x:862.8,y:790.9},{id:"E2-21",x:862.8,y:781.9},{id:"E2-22",x:862.8,y:772.5},{id:"E2-23",x:862.8,y:763},{id:"E2-24",x:862.8,y:754},{id:"E2-25",x:871.9,y:827.8},{id:"E2-26",x:871.9,y:818.8},{id:"E2-27",x:871.9,y:790.9},{id:"E2-28",x:871.9,y:781.9},{id:"E2-29",x:871.9,y:754},{id:"E2-30",x:871.9,y:809.4},{id:"E2-31",x:871.9,y:800},{id:"E2-32",x:871.9,y:772.5},{id:"E2-33",x:871.9,y:763},{id:"E2-34",x:871.9,y:744.6},{id:"E2-35",x:871.9,y:735.5},{id:"E2-36",x:871.9,y:726.1},{id:"E2-37",x:883.7,y:744.6},{id:"E2-38",x:883.7,y:735.5},{id:"E2-39",x:883.7,y:726.1},{id:"E2-40",x:883.7,y:827.8},{id:"E2-41",x:883.7,y:818.8},{id:"E2-42",x:883.7,y:790.9},{id:"E2-43",x:883.7,y:781.9},{id:"E2-44",x:883.7,y:754},{id:"E2-45",x:883.7,y:809.4},{id:"E2-46",x:883.7,y:800},{id:"E2-47",x:883.7,y:772.5},{id:"E2-48",x:883.7,y:763},{id:"E2-49",x:893.3,y:827.8},{id:"E2-50",x:893.3,y:818.8},{id:"E2-51",x:893.3,y:809.4},{id:"E2-52",x:893.3,y:800},{id:"E2-53",x:893.3,y:790.9},{id:"E2-54",x:893.3,y:781.9},{id:"E2-55",x:893.3,y:772.5},{id:"E2-56",x:893.3,y:763},{id:"E2-57",x:893.3,y:754},{id:"E2-58",x:893.3,y:744.6},{id:"E2-59",x:893.3,y:735.5},{id:"E2-60",x:893.3,y:726.1},{id:"E2-61",x:905.1,y:744.6},{id:"E2-62",x:905.1,y:735.5},{id:"E2-63",x:905.1,y:726.1},{id:"E2-64",x:905.1,y:827.8},{id:"E2-65",x:905.1,y:818.8},{id:"E2-66",x:905.1,y:809.4},{id:"E2-67",x:905.1,y:800},{id:"E2-68",x:905.1,y:790.9},{id:"E2-69",x:905.1,y:781.9},{id:"E2-70",x:905.1,y:772.5},{id:"E2-71",x:905.1,y:763},{id:"E2-72",x:905.1,y:754},{id:"E2-73",x:914.7,y:827.8},{id:"E2-74",x:914.7,y:818.8},{id:"E2-75",x:914.7,y:809.4},{id:"E2-76",x:914.7,y:800},{id:"E2-77",x:914.7,y:790.9},{id:"E2-78",x:914.7,y:781.9},{id:"E2-79",x:914.7,y:772.5},{id:"E2-80",x:914.7,y:763},{id:"E2-81",x:914.7,y:754},{id:"E2-82",x:914.7,y:744.6},{id:"E2-83",x:914.7,y:735.5},{id:"E2-84",x:914.7,y:726.1},{id:"E2-85",x:933.3,y:827.8},{id:"E2-86",x:933.3,y:818.8},{id:"E2-87",x:933.3,y:809.4},{id:"E2-88",x:933.3,y:800},{id:"E2-89",x:933.3,y:790.9},{id:"E2-90",x:933.3,y:781.9},{id:"E2-91",x:933.3,y:772.5},{id:"E2-92",x:933.3,y:763},{id:"E2-93",x:933.3,y:754},{id:"E2-94",x:933.3,y:744.6},{id:"E2-95",x:933.3,y:735.5},{id:"E2-96",x:933.3,y:726.1},{id:"E2-97",x:945.1,y:827.8},{id:"E2-98",x:945.1,y:818.8},{id:"E2-99",x:945.1,y:809.4},{id:"E2-100",x:945.1,y:800},{id:"E2-101",x:945.1,y:790.9},{id:"E2-102",x:945.1,y:781.9},{id:"E2-103",x:945.1,y:772.5},{id:"E2-104",x:945.1,y:763},{id:"E2-105",x:945.1,y:754},{id:"E2-106",x:945.1,y:744.6},{id:"E2-107",x:945.1,y:735.5},{id:"E2-108",x:945.1,y:726.1},{id:"E2-109",x:954.7,y:827.8},{id:"E2-110",x:954.7,y:818.8},{id:"E2-111",x:954.7,y:809.4},{id:"E2-112",x:954.7,y:800},{id:"E2-113",x:954.7,y:790.9},{id:"E2-114",x:954.7,y:781.9},{id:"E2-115",x:954.7,y:772.5},{id:"E2-116",x:954.7,y:763},{id:"E2-117",x:954.7,y:754},{id:"E2-118",x:954.7,y:744.6},{id:"E2-119",x:954.7,y:735.5},{id:"E2-120",x:954.7,y:726.1}]},{id:"E3",name:"E3 구역",grade:"S",floor:"1F",seats:[{id:"E3-1",x:849.8,y:688.8},{id:"E3-2",x:849.8,y:679.4},{id:"E3-3",x:849.8,y:651.5},{id:"E3-4",x:849.8,y:642.4},{id:"E3-5",x:849.8,y:614.2},{id:"E3-6",x:849.8,y:605.5},{id:"E3-7",x:849.8,y:669.9},{id:"E3-8",x:849.8,y:660.5},{id:"E3-9",x:849.8,y:633},{id:"E3-10",x:849.8,y:623.6},{id:"E3-11",x:849.8,y:596.1},{id:"E3-12",x:849.8,y:586.7},{id:"E3-13",x:861.9,y:688.8},{id:"E3-14",x:861.9,y:679.4},{id:"E3-15",x:861.9,y:651.5},{id:"E3-16",x:861.9,y:642.4},{id:"E3-17",x:861.9,y:614.2},{id:"E3-18",x:861.9,y:605.5},{id:"E3-19",x:861.9,y:669.9},{id:"E3-20",x:861.9,y:660.5},{id:"E3-21",x:861.9,y:633},{id:"E3-22",x:861.9,y:623.6},{id:"E3-23",x:861.9,y:596.1},{id:"E3-24",x:861.9,y:586.7},{id:"E3-25",x:871.2,y:688.8},{id:"E3-26",x:871.2,y:679.4},{id:"E3-27",x:871.2,y:669.9},{id:"E3-28",x:871.2,y:660.5},{id:"E3-29",x:871.2,y:651.5},{id:"E3-30",x:871.2,y:642.4},{id:"E3-31",x:871.2,y:633},{id:"E3-32",x:871.2,y:623.6},{id:"E3-33",x:871.2,y:614.2},{id:"E3-34",x:871.2,y:605.5},{id:"E3-35",x:871.2,y:596.1},{id:"E3-36",x:871.2,y:586.7},{id:"E3-37",x:883.3,y:688.8},{id:"E3-38",x:883.3,y:679.4},{id:"E3-39",x:883.3,y:669.9},{id:"E3-40",x:883.3,y:660.5},{id:"E3-41",x:883.3,y:651.5},{id:"E3-42",x:883.3,y:642.4},{id:"E3-43",x:883.3,y:633},{id:"E3-44",x:883.3,y:623.6},{id:"E3-45",x:883.3,y:614.2},{id:"E3-46",x:883.3,y:605.5},{id:"E3-47",x:883.3,y:596.1},{id:"E3-48",x:883.3,y:586.7},{id:"E3-49",x:892.6,y:688.8},{id:"E3-50",x:892.6,y:679.4},{id:"E3-51",x:892.6,y:669.9},{id:"E3-52",x:892.6,y:660.5},{id:"E3-53",x:892.6,y:651.5},{id:"E3-54",x:892.6,y:642.4},{id:"E3-55",x:892.6,y:633},{id:"E3-56",x:892.6,y:623.6},{id:"E3-57",x:892.6,y:614.2},{id:"E3-58",x:892.6,y:605.5},{id:"E3-59",x:892.6,y:596.1},{id:"E3-60",x:892.6,y:586.7},{id:"E3-61",x:904.5,y:688.8},{id:"E3-62",x:904.5,y:679.4},{id:"E3-63",x:904.5,y:669.9},{id:"E3-64",x:904.5,y:660.5},{id:"E3-65",x:904.5,y:651.5},{id:"E3-66",x:904.5,y:642.4},{id:"E3-67",x:904.5,y:633},{id:"E3-68",x:904.5,y:623.6},{id:"E3-69",x:904.5,y:614.2},{id:"E3-70",x:904.5,y:605.5},{id:"E3-71",x:904.5,y:596.1},{id:"E3-72",x:904.5,y:586.7},{id:"E3-73",x:914,y:688.8},{id:"E3-74",x:914,y:679.4},{id:"E3-75",x:914,y:669.9},{id:"E3-76",x:914,y:660.5},{id:"E3-77",x:914,y:651.5},{id:"E3-78",x:914,y:642.4},{id:"E3-79",x:914,y:633},{id:"E3-80",x:914,y:623.6},{id:"E3-81",x:914,y:614.2},{id:"E3-82",x:914,y:605.5},{id:"E3-83",x:914,y:596.1},{id:"E3-84",x:914,y:586.7},{id:"E3-85",x:932.6,y:688.8},{id:"E3-86",x:932.6,y:679.4},{id:"E3-87",x:932.6,y:669.9},{id:"E3-88",x:932.6,y:660.5},{id:"E3-89",x:932.6,y:651.5},{id:"E3-90",x:932.6,y:642.4},{id:"E3-91",x:932.6,y:633},{id:"E3-92",x:932.6,y:623.6},{id:"E3-93",x:932.6,y:614.2},{id:"E3-94",x:932.6,y:605.5},{id:"E3-95",x:932.6,y:596.1},{id:"E3-96",x:932.6,y:586.7},{id:"E3-97",x:944.5,y:688.8},{id:"E3-98",x:944.5,y:679.4},{id:"E3-99",x:944.5,y:669.9},{id:"E3-100",x:944.5,y:660.5},{id:"E3-101",x:944.5,y:651.5},{id:"E3-102",x:944.5,y:642.4},{id:"E3-103",x:944.5,y:633},{id:"E3-104",x:944.5,y:623.6},{id:"E3-105",x:944.5,y:614.2},{id:"E3-106",x:944.5,y:605.5},{id:"E3-107",x:944.5,y:596.1},{id:"E3-108",x:944.5,y:586.7},{id:"E3-109",x:953.5,y:688.8},{id:"E3-110",x:953.5,y:679.4},{id:"E3-111",x:953.5,y:669.9},{id:"E3-112",x:953.5,y:660.5},{id:"E3-113",x:953.5,y:651.5},{id:"E3-114",x:953.5,y:642.4},{id:"E3-115",x:953.5,y:633},{id:"E3-116",x:953.5,y:623.6},{id:"E3-117",x:953.5,y:614.2},{id:"E3-118",x:953.5,y:605.5},{id:"E3-119",x:953.5,y:596.1},{id:"E3-120",x:953.5,y:586.7}]},{id:"E4",name:"E4 구역",grade:"S",floor:"1F",seats:[{id:"E4-1",x:850.6,y:546.6},{id:"E4-2",x:850.6,y:537.1},{id:"E4-3",x:850.6,y:527.7},{id:"E4-4",x:850.6,y:518.7},{id:"E4-5",x:850.6,y:509.3},{id:"E4-6",x:850.6,y:500.2},{id:"E4-7",x:850.6,y:490.8},{id:"E4-8",x:850.6,y:481.8},{id:"E4-9",x:850.6,y:472.3},{id:"E4-10",x:850.6,y:463.3},{id:"E4-11",x:850.6,y:453.9},{id:"E4-12",x:850.6,y:444.8},{id:"E4-13",x:850.6,y:435.4},{id:"E4-14",x:850.6,y:426.4},{id:"E4-15",x:861.3,y:546.6},{id:"E4-16",x:861.3,y:537.1},{id:"E4-17",x:861.3,y:527.7},{id:"E4-18",x:861.3,y:518.7},{id:"E4-19",x:861.3,y:509.3},{id:"E4-20",x:861.3,y:500.2},{id:"E4-21",x:861.3,y:490.8},{id:"E4-22",x:861.3,y:481.8},{id:"E4-23",x:861.3,y:472.3},{id:"E4-24",x:861.3,y:463.3},{id:"E4-25",x:861.3,y:453.9},{id:"E4-26",x:861.3,y:444.8},{id:"E4-27",x:861.3,y:435.4},{id:"E4-28",x:861.3,y:426.4},{id:"E4-29",x:872.3,y:546.6},{id:"E4-30",x:872.3,y:537.1},{id:"E4-31",x:872.3,y:509.3},{id:"E4-32",x:872.3,y:500.2},{id:"E4-33",x:872.3,y:472.3},{id:"E4-34",x:872.3,y:463.3},{id:"E4-35",x:872.3,y:527.7},{id:"E4-36",x:872.3,y:518.7},{id:"E4-37",x:872.3,y:490.8},{id:"E4-38",x:872.3,y:481.8},{id:"E4-39",x:872.3,y:453.9},{id:"E4-40",x:872.3,y:444.8},{id:"E4-41",x:872.3,y:435.4},{id:"E4-42",x:872.3,y:426.4},{id:"E4-43",x:882.7,y:546.6},{id:"E4-44",x:882.7,y:537.1},{id:"E4-45",x:882.7,y:509.3},{id:"E4-46",x:882.7,y:500.2},{id:"E4-47",x:882.7,y:472.3},{id:"E4-48",x:882.7,y:463.3},{id:"E4-49",x:882.7,y:527.7},{id:"E4-50",x:882.7,y:518.7},{id:"E4-51",x:882.7,y:490.8},{id:"E4-52",x:882.7,y:481.8},{id:"E4-53",x:882.7,y:453.9},{id:"E4-54",x:882.7,y:444.8},{id:"E4-55",x:882.7,y:435.4},{id:"E4-56",x:882.7,y:426.4},{id:"E4-57",x:893.8,y:546.6},{id:"E4-58",x:893.8,y:537.1},{id:"E4-59",x:893.8,y:527.7},{id:"E4-60",x:893.8,y:518.7},{id:"E4-61",x:893.8,y:509.3},{id:"E4-62",x:893.8,y:500.2},{id:"E4-63",x:893.8,y:490.8},{id:"E4-64",x:893.8,y:481.8},{id:"E4-65",x:893.8,y:472.3},{id:"E4-66",x:893.8,y:463.3},{id:"E4-67",x:893.8,y:453.9},{id:"E4-68",x:893.8,y:444.8},{id:"E4-69",x:893.8,y:435.4},{id:"E4-70",x:893.8,y:426.4},{id:"E4-71",x:904.9,y:546.6},{id:"E4-72",x:904.9,y:537.1},{id:"E4-73",x:904.9,y:527.7},{id:"E4-74",x:904.9,y:518.7},{id:"E4-75",x:904.9,y:509.3},{id:"E4-76",x:904.9,y:500.2},{id:"E4-77",x:904.9,y:490.8},{id:"E4-78",x:904.9,y:481.8},{id:"E4-79",x:904.9,y:472.3},{id:"E4-80",x:904.9,y:463.3},{id:"E4-81",x:904.9,y:453.9},{id:"E4-82",x:904.9,y:444.8},{id:"E4-83",x:904.9,y:435.4},{id:"E4-84",x:904.9,y:426.4},{id:"E4-85",x:915.2,y:546.6},{id:"E4-86",x:915.2,y:537.1},{id:"E4-87",x:915.2,y:527.7},{id:"E4-88",x:915.2,y:518.7},{id:"E4-89",x:915.2,y:509.3},{id:"E4-90",x:915.2,y:500.2},{id:"E4-91",x:915.2,y:490.8},{id:"E4-92",x:915.2,y:481.8},{id:"E4-93",x:915.2,y:472.3},{id:"E4-94",x:915.2,y:463.3},{id:"E4-95",x:915.2,y:453.9},{id:"E4-96",x:915.2,y:444.8},{id:"E4-97",x:915.2,y:435.4},{id:"E4-98",x:915.2,y:426.4},{id:"E4-99",x:933.7,y:546.6},{id:"E4-100",x:933.7,y:537.1},{id:"E4-101",x:933.7,y:527.7},{id:"E4-102",x:933.7,y:518.7},{id:"E4-103",x:933.7,y:509.3},{id:"E4-104",x:933.7,y:500.2},{id:"E4-105",x:933.7,y:490.8},{id:"E4-106",x:933.7,y:481.8},{id:"E4-107",x:933.7,y:472.3},{id:"E4-108",x:933.7,y:463.3},{id:"E4-109",x:943.8,y:546.6},{id:"E4-110",x:943.8,y:537.1},{id:"E4-111",x:943.8,y:527.7},{id:"E4-112",x:943.8,y:518.7},{id:"E4-113",x:943.8,y:509.3},{id:"E4-114",x:943.8,y:500.2}]},{id:"F1",name:"F1 구역",grade:"R",floor:"1F",seats:[{id:"F1-1",x:394.3,y:683.2},{id:"F1-2",x:394.3,y:665.7},{id:"F1-3",x:394.3,y:614.6},{id:"F1-4",x:394.3,y:596.7},{id:"F1-5",x:394.3,y:579.7},{id:"F1-6",x:394.3,y:562},{id:"F1-7",x:394.3,y:545.1},{id:"F1-8",x:394.3,y:528.2},{id:"F1-9",x:394.3,y:511.7},{id:"F1-10",x:394.3,y:648.9},{id:"F1-11",x:394.3,y:632},{id:"F1-12",x:400.9,y:683.2},{id:"F1-13",x:400.9,y:665.7},{id:"F1-14",x:400.9,y:614.6},{id:"F1-15",x:400.9,y:596.7},{id:"F1-16",x:400.9,y:579.7},{id:"F1-17",x:400.9,y:562},{id:"F1-18",x:400.9,y:545.1},{id:"F1-19",x:400.9,y:528.2},{id:"F1-20",x:400.9,y:511.7},{id:"F1-21",x:400.9,y:648.9},{id:"F1-22",x:400.9,y:632},{id:"F1-23",x:407.1,y:683.2},{id:"F1-24",x:407.1,y:665.7},{id:"F1-25",x:407.1,y:614.6},{id:"F1-26",x:407.1,y:596.7},{id:"F1-27",x:407.1,y:579.7},{id:"F1-28",x:407.1,y:562},{id:"F1-29",x:407.1,y:545.1},{id:"F1-30",x:407.1,y:528.2},{id:"F1-31",x:407.1,y:511.7},{id:"F1-32",x:407.1,y:648.9},{id:"F1-33",x:407.1,y:632},{id:"F1-34",x:413.4,y:683.2},{id:"F1-35",x:413.4,y:665.7},{id:"F1-36",x:413.4,y:614.6},{id:"F1-37",x:413.4,y:596.7},{id:"F1-38",x:413.4,y:579.7},{id:"F1-39",x:413.4,y:562},{id:"F1-40",x:413.4,y:545.1},{id:"F1-41",x:413.4,y:528.2},{id:"F1-42",x:413.4,y:511.7},{id:"F1-43",x:413.4,y:648.9},{id:"F1-44",x:413.4,y:632},{id:"F1-45",x:419.6,y:683.2},{id:"F1-46",x:419.6,y:665.7},{id:"F1-47",x:419.6,y:614.6},{id:"F1-48",x:419.6,y:596.7},{id:"F1-49",x:419.6,y:579.7},{id:"F1-50",x:419.6,y:562},{id:"F1-51",x:419.6,y:545.1},{id:"F1-52",x:419.6,y:528.2},{id:"F1-53",x:419.6,y:511.7},{id:"F1-54",x:419.6,y:648.9},{id:"F1-55",x:419.6,y:632},{id:"F1-56",x:424.7,y:683.2},{id:"F1-57",x:424.7,y:665.7},{id:"F1-58",x:424.7,y:614.6},{id:"F1-59",x:424.7,y:596.7},{id:"F1-60",x:424.7,y:579.7},{id:"F1-61",x:424.7,y:562},{id:"F1-62",x:424.7,y:545.1},{id:"F1-63",x:424.7,y:528.2},{id:"F1-64",x:424.7,y:511.7},{id:"F1-65",x:424.7,y:648.9},{id:"F1-66",x:424.7,y:632}]},{id:"F2",name:"F2 구역",grade:"R",floor:"1F",seats:[{id:"F2-1",x:444.2,y:683},{id:"F2-2",x:444.2,y:665.5},{id:"F2-3",x:444.2,y:614.4},{id:"F2-4",x:444.2,y:596.5},{id:"F2-5",x:444.2,y:579.5},{id:"F2-6",x:444.2,y:561.8},{id:"F2-7",x:444.2,y:545},{id:"F2-8",x:444.2,y:528.1},{id:"F2-9",x:444.2,y:511.6},{id:"F2-10",x:444.2,y:648.7},{id:"F2-11",x:444.2,y:631.8},{id:"F2-12",x:450.5,y:683},{id:"F2-13",x:450.5,y:665.5},{id:"F2-14",x:450.5,y:614.4},{id:"F2-15",x:450.5,y:596.5},{id:"F2-16",x:450.5,y:579.5},{id:"F2-17",x:450.5,y:561.8},{id:"F2-18",x:450.5,y:545},{id:"F2-19",x:450.5,y:528.1},{id:"F2-20",x:450.5,y:511.6},{id:"F2-21",x:450.5,y:648.7},{id:"F2-22",x:450.5,y:631.8},{id:"F2-23",x:456.7,y:683},{id:"F2-24",x:456.7,y:665.5},{id:"F2-25",x:456.7,y:614.4},{id:"F2-26",x:456.7,y:596.5},{id:"F2-27",x:456.7,y:579.5},{id:"F2-28",x:456.7,y:561.8},{id:"F2-29",x:456.7,y:545},{id:"F2-30",x:456.7,y:528.1},{id:"F2-31",x:456.7,y:511.6},{id:"F2-32",x:456.7,y:648.7},{id:"F2-33",x:456.7,y:631.8},{id:"F2-34",x:463,y:683},{id:"F2-35",x:463,y:665.5},{id:"F2-36",x:463,y:614.4},{id:"F2-37",x:463,y:596.5},{id:"F2-38",x:463,y:579.5},{id:"F2-39",x:463,y:561.8},{id:"F2-40",x:463,y:545},{id:"F2-41",x:463,y:528.1},{id:"F2-42",x:463,y:511.6},{id:"F2-43",x:463,y:648.7},{id:"F2-44",x:463,y:631.8},{id:"F2-45",x:469.2,y:683},{id:"F2-46",x:469.2,y:665.5},{id:"F2-47",x:469.2,y:614.4},{id:"F2-48",x:469.2,y:596.5},{id:"F2-49",x:469.2,y:579.5},{id:"F2-50",x:469.2,y:561.8},{id:"F2-51",x:469.2,y:545},{id:"F2-52",x:469.2,y:528.1},{id:"F2-53",x:469.2,y:511.6},{id:"F2-54",x:469.2,y:648.7},{id:"F2-55",x:469.2,y:631.8},{id:"F2-56",x:475.5,y:683},{id:"F2-57",x:475.5,y:665.5},{id:"F2-58",x:475.5,y:614.4},{id:"F2-59",x:475.5,y:596.5},{id:"F2-60",x:475.5,y:579.5},{id:"F2-61",x:475.5,y:561.8},{id:"F2-62",x:475.5,y:545},{id:"F2-63",x:475.5,y:528.1},{id:"F2-64",x:475.5,y:511.6},{id:"F2-65",x:475.5,y:648.7},{id:"F2-66",x:475.5,y:631.8},{id:"F2-67",x:481.7,y:683},{id:"F2-68",x:481.7,y:665.5},{id:"F2-69",x:481.7,y:614.4},{id:"F2-70",x:481.7,y:596.5},{id:"F2-71",x:481.7,y:579.5},{id:"F2-72",x:481.7,y:561.8},{id:"F2-73",x:481.7,y:545},{id:"F2-74",x:481.7,y:528.1},{id:"F2-75",x:481.7,y:511.6},{id:"F2-76",x:481.7,y:648.7},{id:"F2-77",x:481.7,y:631.8},{id:"F2-78",x:488,y:683},{id:"F2-79",x:488,y:665.5},{id:"F2-80",x:488,y:614.4},{id:"F2-81",x:488,y:596.5},{id:"F2-82",x:488,y:579.5},{id:"F2-83",x:488,y:561.8},{id:"F2-84",x:488,y:545},{id:"F2-85",x:488,y:528.1},{id:"F2-86",x:488,y:511.6},{id:"F2-87",x:488,y:648.7},{id:"F2-88",x:488,y:631.8},{id:"F2-89",x:494.2,y:683},{id:"F2-90",x:494.2,y:665.5},{id:"F2-91",x:494.2,y:614.4},{id:"F2-92",x:494.2,y:596.5},{id:"F2-93",x:494.2,y:579.5},{id:"F2-94",x:494.2,y:561.8},{id:"F2-95",x:494.2,y:545},{id:"F2-96",x:494.2,y:528.1},{id:"F2-97",x:494.2,y:511.6},{id:"F2-98",x:494.2,y:648.7},{id:"F2-99",x:494.2,y:631.8},{id:"F2-100",x:500.6,y:683},{id:"F2-101",x:500.6,y:665.5},{id:"F2-102",x:500.6,y:614.4},{id:"F2-103",x:500.6,y:596.5},{id:"F2-104",x:500.6,y:579.5},{id:"F2-105",x:500.6,y:561.8},{id:"F2-106",x:500.6,y:545},{id:"F2-107",x:500.6,y:528.1},{id:"F2-108",x:500.6,y:511.6},{id:"F2-109",x:500.6,y:648.7},{id:"F2-110",x:500.6,y:631.8},{id:"F2-111",x:506.8,y:683},{id:"F2-112",x:506.8,y:665.5},{id:"F2-113",x:506.8,y:614.4},{id:"F2-114",x:506.8,y:596.5},{id:"F2-115",x:506.8,y:579.5},{id:"F2-116",x:506.8,y:561.8},{id:"F2-117",x:506.8,y:545},{id:"F2-118",x:506.8,y:528.1},{id:"F2-119",x:506.8,y:511.6},{id:"F2-120",x:506.8,y:648.7},{id:"F2-121",x:506.8,y:631.8},{id:"F2-122",x:513.1,y:683},{id:"F2-123",x:513.1,y:665.5},{id:"F2-124",x:513.1,y:614.4},{id:"F2-125",x:513.1,y:596.5},{id:"F2-126",x:513.1,y:579.5},{id:"F2-127",x:513.1,y:561.8},{id:"F2-128",x:513.1,y:545},{id:"F2-129",x:513.1,y:528.1},{id:"F2-130",x:513.1,y:511.6},{id:"F2-131",x:513.1,y:648.7},{id:"F2-132",x:513.1,y:631.8},{id:"F2-133",x:519.3,y:683},{id:"F2-134",x:519.3,y:665.5},{id:"F2-135",x:519.3,y:614.4},{id:"F2-136",x:519.3,y:596.5},{id:"F2-137",x:519.3,y:579.5},{id:"F2-138",x:519.3,y:561.8},{id:"F2-139",x:519.3,y:545},{id:"F2-140",x:519.3,y:528.1},{id:"F2-141",x:519.3,y:511.6},{id:"F2-142",x:519.3,y:648.7},{id:"F2-143",x:519.3,y:631.8},{id:"F2-144",x:525.6,y:683},{id:"F2-145",x:525.6,y:665.5},{id:"F2-146",x:525.6,y:614.4},{id:"F2-147",x:525.6,y:596.5},{id:"F2-148",x:525.6,y:579.5},{id:"F2-149",x:525.6,y:561.8},{id:"F2-150",x:525.6,y:545},{id:"F2-151",x:525.6,y:528.1},{id:"F2-152",x:525.6,y:511.6},{id:"F2-153",x:525.6,y:648.7},{id:"F2-154",x:525.6,y:631.8},{id:"F2-155",x:531.8,y:683},{id:"F2-156",x:531.8,y:665.5},{id:"F2-157",x:531.8,y:614.4},{id:"F2-158",x:531.8,y:596.5},{id:"F2-159",x:531.8,y:579.5},{id:"F2-160",x:531.8,y:561.8},{id:"F2-161",x:531.8,y:545},{id:"F2-162",x:531.8,y:528.1},{id:"F2-163",x:531.8,y:511.6},{id:"F2-164",x:531.8,y:648.7},{id:"F2-165",x:531.8,y:631.8},{id:"F2-166",x:538.1,y:683},{id:"F2-167",x:538.1,y:665.5},{id:"F2-168",x:538.1,y:614.4},{id:"F2-169",x:538.1,y:596.5},{id:"F2-170",x:538.1,y:579.5},{id:"F2-171",x:538.1,y:561.8},{id:"F2-172",x:538.1,y:545},{id:"F2-173",x:538.1,y:528.1},{id:"F2-174",x:538.1,y:511.6},{id:"F2-175",x:538.1,y:648.7},{id:"F2-176",x:538.1,y:631.8},{id:"F2-177",x:544.3,y:683},{id:"F2-178",x:544.3,y:665.5},{id:"F2-179",x:544.3,y:614.4},{id:"F2-180",x:544.3,y:596.5},{id:"F2-181",x:544.3,y:579.5},{id:"F2-182",x:544.3,y:561.8},{id:"F2-183",x:544.3,y:545},{id:"F2-184",x:544.3,y:528.1},{id:"F2-185",x:544.3,y:511.6},{id:"F2-186",x:544.3,y:648.7},{id:"F2-187",x:544.3,y:631.8},{id:"F2-188",x:550.6,y:683},{id:"F2-189",x:550.6,y:665.5},{id:"F2-190",x:550.6,y:614.4},{id:"F2-191",x:550.6,y:596.5},{id:"F2-192",x:550.6,y:579.5},{id:"F2-193",x:550.6,y:561.8},{id:"F2-194",x:550.6,y:545},{id:"F2-195",x:550.6,y:528.1},{id:"F2-196",x:550.6,y:511.6},{id:"F2-197",x:550.6,y:648.7},{id:"F2-198",x:550.6,y:631.8},{id:"F2-199",x:556.6,y:683},{id:"F2-200",x:556.6,y:665.5},{id:"F2-201",x:556.6,y:614.4},{id:"F2-202",x:556.6,y:596.5},{id:"F2-203",x:556.6,y:579.5},{id:"F2-204",x:556.6,y:561.8},{id:"F2-205",x:556.6,y:545},{id:"F2-206",x:556.6,y:528.1},{id:"F2-207",x:556.6,y:511.6},{id:"F2-208",x:556.6,y:648.7},{id:"F2-209",x:556.6,y:631.8}]},{id:"F3",name:"F3 구역",grade:"R",floor:"1F",seats:[{id:"F3-1",x:576.3,y:682.6},{id:"F3-2",x:576.3,y:665.1},{id:"F3-3",x:576.3,y:614},{id:"F3-4",x:576.3,y:596.1},{id:"F3-5",x:576.3,y:579.1},{id:"F3-6",x:576.3,y:561.4},{id:"F3-7",x:576.3,y:544.5},{id:"F3-8",x:576.3,y:527.6},{id:"F3-9",x:576.3,y:511.1},{id:"F3-10",x:576.3,y:648.3},{id:"F3-11",x:576.3,y:631.4},{id:"F3-12",x:582.9,y:682.6},{id:"F3-13",x:582.9,y:665.1},{id:"F3-14",x:582.9,y:614},{id:"F3-15",x:582.9,y:596.1},{id:"F3-16",x:582.9,y:579.1},{id:"F3-17",x:582.9,y:561.4},{id:"F3-18",x:582.9,y:544.5},{id:"F3-19",x:582.9,y:527.6},{id:"F3-20",x:582.9,y:511.1},{id:"F3-21",x:582.9,y:648.3},{id:"F3-22",x:582.9,y:631.4},{id:"F3-23",x:589.1,y:682.6},{id:"F3-24",x:589.1,y:665.1},{id:"F3-25",x:589.1,y:614},{id:"F3-26",x:589.1,y:596.1},{id:"F3-27",x:589.1,y:579.1},{id:"F3-28",x:589.1,y:561.4},{id:"F3-29",x:589.1,y:544.5},{id:"F3-30",x:589.1,y:527.6},{id:"F3-31",x:589.1,y:511.1},{id:"F3-32",x:589.1,y:648.3},{id:"F3-33",x:589.1,y:631.4},{id:"F3-34",x:595.4,y:682.6},{id:"F3-35",x:595.4,y:665.1},{id:"F3-36",x:595.4,y:614},{id:"F3-37",x:595.4,y:596.1},{id:"F3-38",x:595.4,y:579.1},{id:"F3-39",x:595.4,y:561.4},{id:"F3-40",x:595.4,y:544.5},{id:"F3-41",x:595.4,y:527.6},{id:"F3-42",x:595.4,y:511.1},{id:"F3-43",x:595.4,y:648.3},{id:"F3-44",x:595.4,y:631.4},{id:"F3-45",x:601.6,y:682.6},{id:"F3-46",x:601.6,y:665.1},{id:"F3-47",x:601.6,y:614},{id:"F3-48",x:601.6,y:596.1},{id:"F3-49",x:601.6,y:579.1},{id:"F3-50",x:601.6,y:561.4},{id:"F3-51",x:601.6,y:544.5},{id:"F3-52",x:601.6,y:527.6},{id:"F3-53",x:601.6,y:511.1},{id:"F3-54",x:601.6,y:648.3},{id:"F3-55",x:601.6,y:631.4},{id:"F3-56",x:606.7,y:682.6},{id:"F3-57",x:606.7,y:665.1},{id:"F3-58",x:606.7,y:614},{id:"F3-59",x:606.7,y:596.1},{id:"F3-60",x:606.7,y:579.1},{id:"F3-61",x:606.7,y:561.4},{id:"F3-62",x:606.7,y:544.5},{id:"F3-63",x:606.7,y:527.6},{id:"F3-64",x:606.7,y:511.1},{id:"F3-65",x:606.7,y:648.3},{id:"F3-66",x:606.7,y:631.4}]},{id:"Floor",name:"Floor 구역",grade:"VIP",floor:"1F",seats:[{id:"Floor-1",x:388.9,y:967.2},{id:"Floor-2",x:395.1,y:967.2},{id:"Floor-3",x:401.2,y:967.2},{id:"Floor-4",x:407.4,y:967.2},{id:"Floor-5",x:413.5,y:967.2},{id:"Floor-6",x:419.7,y:967.2},{id:"Floor-7",x:425.8,y:967.2},{id:"Floor-8",x:432,y:967.2},{id:"Floor-9",x:438.1,y:967.2},{id:"Floor-10",x:444.3,y:967.2},{id:"Floor-11",x:450.4,y:967.2},{id:"Floor-12",x:456.6,y:967.2},{id:"Floor-13",x:462.7,y:967.2},{id:"Floor-14",x:468.9,y:967.2},{id:"Floor-15",x:475,y:967.2},{id:"Floor-16",x:481.2,y:967.2},{id:"Floor-17",x:487.3,y:967.2},{id:"Floor-18",x:493.5,y:967.2},{id:"Floor-19",x:499.6,y:967.2},{id:"Floor-20",x:505.8,y:967.2},{id:"Floor-21",x:511.9,y:967.2},{id:"Floor-22",x:518.1,y:967.2},{id:"Floor-23",x:524.2,y:967.2},{id:"Floor-24",x:530.4,y:967.2},{id:"Floor-25",x:536.5,y:967.2},{id:"Floor-26",x:542.7,y:967.2},{id:"Floor-27",x:548.8,y:967.2},{id:"Floor-28",x:555,y:967.2},{id:"Floor-29",x:561.1,y:967.2},{id:"Floor-30",x:567.3,y:967.2},{id:"Floor-31",x:573.4,y:967.2},{id:"Floor-32",x:579.6,y:967.2},{id:"Floor-33",x:585.7,y:967.2},{id:"Floor-34",x:591.9,y:967.2},{id:"Floor-35",x:598,y:967.2},{id:"Floor-36",x:604.2,y:967.2},{id:"Floor-37",x:610.3,y:967.2},{id:"Floor-38",x:388.9,y:958.2},{id:"Floor-39",x:395.1,y:958.2},{id:"Floor-40",x:401.2,y:958.2},{id:"Floor-41",x:407.4,y:958.2},{id:"Floor-42",x:413.5,y:958.2},{id:"Floor-43",x:419.7,y:958.2},{id:"Floor-44",x:425.8,y:958.2},{id:"Floor-45",x:432,y:958.2},{id:"Floor-46",x:438.1,y:958.2},{id:"Floor-47",x:444.3,y:958.2},{id:"Floor-48",x:450.4,y:958.2},{id:"Floor-49",x:456.6,y:958.2},{id:"Floor-50",x:462.7,y:958.2},{id:"Floor-51",x:468.9,y:958.2},{id:"Floor-52",x:475,y:958.2},{id:"Floor-53",x:481.2,y:958.2},{id:"Floor-54",x:487.3,y:958.2},{id:"Floor-55",x:493.5,y:958.2},{id:"Floor-56",x:499.6,y:958.2},{id:"Floor-57",x:505.8,y:958.2},{id:"Floor-58",x:511.9,y:958.2},{id:"Floor-59",x:518.1,y:958.2},{id:"Floor-60",x:524.2,y:958.2},{id:"Floor-61",x:530.4,y:958.2},{id:"Floor-62",x:536.5,y:958.2},{id:"Floor-63",x:542.7,y:958.2},{id:"Floor-64",x:548.8,y:958.2},{id:"Floor-65",x:555,y:958.2},{id:"Floor-66",x:561.1,y:958.2},{id:"Floor-67",x:567.3,y:958.2},{id:"Floor-68",x:573.4,y:958.2},{id:"Floor-69",x:579.6,y:958.2},{id:"Floor-70",x:585.7,y:958.2},{id:"Floor-71",x:591.9,y:958.2},{id:"Floor-72",x:598,y:958.2},{id:"Floor-73",x:604.2,y:958.2},{id:"Floor-74",x:610.3,y:958.2},{id:"Floor-75",x:388.9,y:949.2},{id:"Floor-76",x:395.1,y:949.2},{id:"Floor-77",x:401.2,y:949.2},{id:"Floor-78",x:407.4,y:949.2},{id:"Floor-79",x:413.5,y:949.2},{id:"Floor-80",x:419.7,y:949.2},{id:"Floor-81",x:425.8,y:949.2},{id:"Floor-82",x:432,y:949.2},{id:"Floor-83",x:438.1,y:949.2},{id:"Floor-84",x:444.3,y:949.2},{id:"Floor-85",x:450.4,y:949.2},{id:"Floor-86",x:456.6,y:949.2},{id:"Floor-87",x:462.7,y:949.2},{id:"Floor-88",x:468.9,y:949.2},{id:"Floor-89",x:475,y:949.2},{id:"Floor-90",x:481.2,y:949.2},{id:"Floor-91",x:487.3,y:949.2},{id:"Floor-92",x:493.5,y:949.2},{id:"Floor-93",x:499.6,y:949.2},{id:"Floor-94",x:505.8,y:949.2},{id:"Floor-95",x:511.9,y:949.2},{id:"Floor-96",x:518.1,y:949.2},{id:"Floor-97",x:524.2,y:949.2},{id:"Floor-98",x:530.4,y:949.2},{id:"Floor-99",x:536.5,y:949.2},{id:"Floor-100",x:542.7,y:949.2},{id:"Floor-101",x:548.8,y:949.2},{id:"Floor-102",x:555,y:949.2},{id:"Floor-103",x:561.1,y:949.2},{id:"Floor-104",x:567.3,y:949.2},{id:"Floor-105",x:573.4,y:949.2},{id:"Floor-106",x:579.6,y:949.2},{id:"Floor-107",x:585.7,y:949.2},{id:"Floor-108",x:591.9,y:949.2},{id:"Floor-109",x:598,y:949.2},{id:"Floor-110",x:604.2,y:949.2},{id:"Floor-111",x:610.3,y:949.2},{id:"Floor-112",x:388.9,y:940.2},{id:"Floor-113",x:395.1,y:940.2},{id:"Floor-114",x:401.2,y:940.2},{id:"Floor-115",x:407.4,y:940.2},{id:"Floor-116",x:413.5,y:940.2},{id:"Floor-117",x:419.7,y:940.2},{id:"Floor-118",x:425.8,y:940.2},{id:"Floor-119",x:432,y:940.2},{id:"Floor-120",x:438.1,y:940.2},{id:"Floor-121",x:444.3,y:940.2},{id:"Floor-122",x:450.4,y:940.2},{id:"Floor-123",x:456.6,y:940.2},{id:"Floor-124",x:462.7,y:940.2},{id:"Floor-125",x:468.9,y:940.2},{id:"Floor-126",x:475,y:940.2},{id:"Floor-127",x:481.2,y:940.2},{id:"Floor-128",x:487.3,y:940.2},{id:"Floor-129",x:493.5,y:940.2},{id:"Floor-130",x:499.6,y:940.2},{id:"Floor-131",x:505.8,y:940.2},{id:"Floor-132",x:511.9,y:940.2},{id:"Floor-133",x:518.1,y:940.2},{id:"Floor-134",x:524.2,y:940.2},{id:"Floor-135",x:530.4,y:940.2},{id:"Floor-136",x:536.5,y:940.2},{id:"Floor-137",x:542.7,y:940.2},{id:"Floor-138",x:548.8,y:940.2},{id:"Floor-139",x:555,y:940.2},{id:"Floor-140",x:561.1,y:940.2},{id:"Floor-141",x:567.3,y:940.2},{id:"Floor-142",x:573.4,y:940.2},{id:"Floor-143",x:579.6,y:940.2},{id:"Floor-144",x:585.7,y:940.2},{id:"Floor-145",x:591.9,y:940.2},{id:"Floor-146",x:598,y:940.2},{id:"Floor-147",x:604.2,y:940.2},{id:"Floor-148",x:610.3,y:940.2},{id:"Floor-149",x:388.9,y:931.2},{id:"Floor-150",x:395.1,y:931.2},{id:"Floor-151",x:401.2,y:931.2},{id:"Floor-152",x:407.4,y:931.2},{id:"Floor-153",x:413.5,y:931.2},{id:"Floor-154",x:419.7,y:931.2},{id:"Floor-155",x:425.8,y:931.2},{id:"Floor-156",x:432,y:931.2},{id:"Floor-157",x:438.1,y:931.2},{id:"Floor-158",x:444.3,y:931.2},{id:"Floor-159",x:450.4,y:931.2},{id:"Floor-160",x:456.6,y:931.2},{id:"Floor-161",x:462.7,y:931.2},{id:"Floor-162",x:468.9,y:931.2},{id:"Floor-163",x:475,y:931.2},{id:"Floor-164",x:481.2,y:931.2},{id:"Floor-165",x:487.3,y:931.2},{id:"Floor-166",x:493.5,y:931.2},{id:"Floor-167",x:499.6,y:931.2},{id:"Floor-168",x:505.8,y:931.2},{id:"Floor-169",x:511.9,y:931.2},{id:"Floor-170",x:518.1,y:931.2},{id:"Floor-171",x:524.2,y:931.2},{id:"Floor-172",x:530.4,y:931.2},{id:"Floor-173",x:536.5,y:931.2},{id:"Floor-174",x:542.7,y:931.2},{id:"Floor-175",x:548.8,y:931.2},{id:"Floor-176",x:555,y:931.2},{id:"Floor-177",x:561.1,y:931.2},{id:"Floor-178",x:567.3,y:931.2},{id:"Floor-179",x:573.4,y:931.2},{id:"Floor-180",x:579.6,y:931.2},{id:"Floor-181",x:585.7,y:931.2},{id:"Floor-182",x:591.9,y:931.2},{id:"Floor-183",x:598,y:931.2},{id:"Floor-184",x:604.2,y:931.2},{id:"Floor-185",x:610.3,y:931.2},{id:"Floor-186",x:388.9,y:922.2},{id:"Floor-187",x:395.1,y:922.2},{id:"Floor-188",x:401.2,y:922.2},{id:"Floor-189",x:407.4,y:922.2},{id:"Floor-190",x:413.5,y:922.2},{id:"Floor-191",x:419.7,y:922.2},{id:"Floor-192",x:425.8,y:922.2},{id:"Floor-193",x:432,y:922.2},{id:"Floor-194",x:438.1,y:922.2},{id:"Floor-195",x:444.3,y:922.2},{id:"Floor-196",x:450.4,y:922.2},{id:"Floor-197",x:456.6,y:922.2},{id:"Floor-198",x:462.7,y:922.2},{id:"Floor-199",x:468.9,y:922.2},{id:"Floor-200",x:475,y:922.2},{id:"Floor-201",x:481.2,y:922.2},{id:"Floor-202",x:487.3,y:922.2},{id:"Floor-203",x:493.5,y:922.2},{id:"Floor-204",x:499.6,y:922.2},{id:"Floor-205",x:505.8,y:922.2},{id:"Floor-206",x:511.9,y:922.2},{id:"Floor-207",x:518.1,y:922.2},{id:"Floor-208",x:524.2,y:922.2},{id:"Floor-209",x:530.4,y:922.2},{id:"Floor-210",x:536.5,y:922.2},{id:"Floor-211",x:542.7,y:922.2},{id:"Floor-212",x:548.8,y:922.2},{id:"Floor-213",x:555,y:922.2},{id:"Floor-214",x:561.1,y:922.2},{id:"Floor-215",x:567.3,y:922.2},{id:"Floor-216",x:573.4,y:922.2},{id:"Floor-217",x:579.6,y:922.2},{id:"Floor-218",x:585.7,y:922.2},{id:"Floor-219",x:591.9,y:922.2},{id:"Floor-220",x:598,y:922.2},{id:"Floor-221",x:604.2,y:922.2},{id:"Floor-222",x:610.3,y:922.2},{id:"Floor-223",x:388.9,y:913.2},{id:"Floor-224",x:395.1,y:913.2},{id:"Floor-225",x:401.2,y:913.2},{id:"Floor-226",x:407.4,y:913.2},{id:"Floor-227",x:413.5,y:913.2},{id:"Floor-228",x:419.7,y:913.2},{id:"Floor-229",x:425.8,y:913.2},{id:"Floor-230",x:432,y:913.2},{id:"Floor-231",x:438.1,y:913.2},{id:"Floor-232",x:444.3,y:913.2},{id:"Floor-233",x:450.4,y:913.2},{id:"Floor-234",x:456.6,y:913.2},{id:"Floor-235",x:462.7,y:913.2},{id:"Floor-236",x:468.9,y:913.2},{id:"Floor-237",x:475,y:913.2},{id:"Floor-238",x:481.2,y:913.2},{id:"Floor-239",x:487.3,y:913.2},{id:"Floor-240",x:493.5,y:913.2},{id:"Floor-241",x:499.6,y:913.2},{id:"Floor-242",x:505.8,y:913.2},{id:"Floor-243",x:511.9,y:913.2},{id:"Floor-244",x:518.1,y:913.2},{id:"Floor-245",x:524.2,y:913.2},{id:"Floor-246",x:530.4,y:913.2},{id:"Floor-247",x:536.5,y:913.2},{id:"Floor-248",x:542.7,y:913.2},{id:"Floor-249",x:548.8,y:913.2},{id:"Floor-250",x:555,y:913.2},{id:"Floor-251",x:561.1,y:913.2},{id:"Floor-252",x:567.3,y:913.2},{id:"Floor-253",x:573.4,y:913.2},{id:"Floor-254",x:579.6,y:913.2},{id:"Floor-255",x:585.7,y:913.2},{id:"Floor-256",x:591.9,y:913.2},{id:"Floor-257",x:598,y:913.2},{id:"Floor-258",x:604.2,y:913.2},{id:"Floor-259",x:610.3,y:913.2},{id:"Floor-260",x:388.9,y:904.2},{id:"Floor-261",x:395.1,y:904.2},{id:"Floor-262",x:401.2,y:904.2},{id:"Floor-263",x:407.4,y:904.2},{id:"Floor-264",x:413.5,y:904.2},{id:"Floor-265",x:419.7,y:904.2},{id:"Floor-266",x:425.8,y:904.2},{id:"Floor-267",x:432,y:904.2},{id:"Floor-268",x:438.1,y:904.2},{id:"Floor-269",x:444.3,y:904.2},{id:"Floor-270",x:450.4,y:904.2},{id:"Floor-271",x:456.6,y:904.2},{id:"Floor-272",x:462.7,y:904.2},{id:"Floor-273",x:468.9,y:904.2},{id:"Floor-274",x:475,y:904.2},{id:"Floor-275",x:481.2,y:904.2},{id:"Floor-276",x:487.3,y:904.2},{id:"Floor-277",x:493.5,y:904.2},{id:"Floor-278",x:499.6,y:904.2},{id:"Floor-279",x:505.8,y:904.2},{id:"Floor-280",x:511.9,y:904.2},{id:"Floor-281",x:518.1,y:904.2},{id:"Floor-282",x:524.2,y:904.2},{id:"Floor-283",x:530.4,y:904.2},{id:"Floor-284",x:536.5,y:904.2},{id:"Floor-285",x:542.7,y:904.2},{id:"Floor-286",x:548.8,y:904.2},{id:"Floor-287",x:555,y:904.2},{id:"Floor-288",x:561.1,y:904.2},{id:"Floor-289",x:567.3,y:904.2},{id:"Floor-290",x:573.4,y:904.2},{id:"Floor-291",x:579.6,y:904.2},{id:"Floor-292",x:585.7,y:904.2},{id:"Floor-293",x:591.9,y:904.2},{id:"Floor-294",x:598,y:904.2},{id:"Floor-295",x:604.2,y:904.2},{id:"Floor-296",x:610.3,y:904.2},{id:"Floor-297",x:388.9,y:895.2},{id:"Floor-298",x:395.1,y:895.2},{id:"Floor-299",x:401.2,y:895.2},{id:"Floor-300",x:407.4,y:895.2},{id:"Floor-301",x:413.5,y:895.2},{id:"Floor-302",x:419.7,y:895.2},{id:"Floor-303",x:425.8,y:895.2},{id:"Floor-304",x:432,y:895.2},{id:"Floor-305",x:438.1,y:895.2},{id:"Floor-306",x:444.3,y:895.2},{id:"Floor-307",x:450.4,y:895.2},{id:"Floor-308",x:456.6,y:895.2},{id:"Floor-309",x:462.7,y:895.2},{id:"Floor-310",x:468.9,y:895.2},{id:"Floor-311",x:475,y:895.2},{id:"Floor-312",x:481.2,y:895.2},{id:"Floor-313",x:487.3,y:895.2},{id:"Floor-314",x:493.5,y:895.2},{id:"Floor-315",x:499.6,y:895.2},{id:"Floor-316",x:505.8,y:895.2},{id:"Floor-317",x:511.9,y:895.2},{id:"Floor-318",x:518.1,y:895.2},{id:"Floor-319",x:524.2,y:895.2},{id:"Floor-320",x:530.4,y:895.2},{id:"Floor-321",x:536.5,y:895.2},{id:"Floor-322",x:542.7,y:895.2},{id:"Floor-323",x:548.8,y:895.2},{id:"Floor-324",x:555,y:895.2},{id:"Floor-325",x:561.1,y:895.2},{id:"Floor-326",x:567.3,y:895.2},{id:"Floor-327",x:573.4,y:895.2},{id:"Floor-328",x:579.6,y:895.2},{id:"Floor-329",x:585.7,y:895.2},{id:"Floor-330",x:591.9,y:895.2},{id:"Floor-331",x:598,y:895.2},{id:"Floor-332",x:604.2,y:895.2},{id:"Floor-333",x:610.3,y:895.2},{id:"Floor-334",x:388.9,y:886.2},{id:"Floor-335",x:395.1,y:886.2},{id:"Floor-336",x:401.2,y:886.2},{id:"Floor-337",x:407.4,y:886.2},{id:"Floor-338",x:413.5,y:886.2},{id:"Floor-339",x:419.7,y:886.2},{id:"Floor-340",x:425.8,y:886.2},{id:"Floor-341",x:432,y:886.2},{id:"Floor-342",x:438.1,y:886.2},{id:"Floor-343",x:444.3,y:886.2},{id:"Floor-344",x:450.4,y:886.2},{id:"Floor-345",x:456.6,y:886.2},{id:"Floor-346",x:462.7,y:886.2},{id:"Floor-347",x:468.9,y:886.2},{id:"Floor-348",x:475,y:886.2},{id:"Floor-349",x:481.2,y:886.2},{id:"Floor-350",x:487.3,y:886.2},{id:"Floor-351",x:493.5,y:886.2},{id:"Floor-352",x:499.6,y:886.2},{id:"Floor-353",x:505.8,y:886.2},{id:"Floor-354",x:511.9,y:886.2},{id:"Floor-355",x:518.1,y:886.2},{id:"Floor-356",x:524.2,y:886.2},{id:"Floor-357",x:530.4,y:886.2},{id:"Floor-358",x:536.5,y:886.2},{id:"Floor-359",x:542.7,y:886.2},{id:"Floor-360",x:548.8,y:886.2},{id:"Floor-361",x:555,y:886.2},{id:"Floor-362",x:561.1,y:886.2},{id:"Floor-363",x:567.3,y:886.2},{id:"Floor-364",x:573.4,y:886.2},{id:"Floor-365",x:579.6,y:886.2},{id:"Floor-366",x:585.7,y:886.2},{id:"Floor-367",x:591.9,y:886.2},{id:"Floor-368",x:598,y:886.2},{id:"Floor-369",x:604.2,y:886.2},{id:"Floor-370",x:610.3,y:886.2},{id:"Floor-371",x:388.9,y:877.2},{id:"Floor-372",x:395.1,y:877.2},{id:"Floor-373",x:401.2,y:877.2},{id:"Floor-374",x:407.4,y:877.2},{id:"Floor-375",x:413.5,y:877.2},{id:"Floor-376",x:419.7,y:877.2},{id:"Floor-377",x:425.8,y:877.2},{id:"Floor-378",x:432,y:877.2},{id:"Floor-379",x:438.1,y:877.2},{id:"Floor-380",x:444.3,y:877.2},{id:"Floor-381",x:450.4,y:877.2},{id:"Floor-382",x:456.6,y:877.2},{id:"Floor-383",x:462.7,y:877.2},{id:"Floor-384",x:468.9,y:877.2},{id:"Floor-385",x:475,y:877.2},{id:"Floor-386",x:481.2,y:877.2},{id:"Floor-387",x:487.3,y:877.2},{id:"Floor-388",x:493.5,y:877.2},{id:"Floor-389",x:499.6,y:877.2},{id:"Floor-390",x:505.8,y:877.2},{id:"Floor-391",x:511.9,y:877.2},{id:"Floor-392",x:518.1,y:877.2},{id:"Floor-393",x:524.2,y:877.2},{id:"Floor-394",x:530.4,y:877.2},{id:"Floor-395",x:536.5,y:877.2},{id:"Floor-396",x:542.7,y:877.2},{id:"Floor-397",x:548.8,y:877.2},{id:"Floor-398",x:555,y:877.2},{id:"Floor-399",x:561.1,y:877.2},{id:"Floor-400",x:567.3,y:877.2},{id:"Floor-401",x:573.4,y:877.2},{id:"Floor-402",x:579.6,y:877.2},{id:"Floor-403",x:585.7,y:877.2},{id:"Floor-404",x:591.9,y:877.2},{id:"Floor-405",x:598,y:877.2},{id:"Floor-406",x:604.2,y:877.2},{id:"Floor-407",x:610.3,y:877.2},{id:"Floor-408",x:388.9,y:868.2},{id:"Floor-409",x:395.1,y:868.2},{id:"Floor-410",x:401.2,y:868.2},{id:"Floor-411",x:407.4,y:868.2},{id:"Floor-412",x:413.5,y:868.2},{id:"Floor-413",x:419.7,y:868.2},{id:"Floor-414",x:425.8,y:868.2},{id:"Floor-415",x:432,y:868.2},{id:"Floor-416",x:438.1,y:868.2},{id:"Floor-417",x:444.3,y:868.2},{id:"Floor-418",x:450.4,y:868.2},{id:"Floor-419",x:456.6,y:868.2},{id:"Floor-420",x:462.7,y:868.2},{id:"Floor-421",x:468.9,y:868.2},{id:"Floor-422",x:475,y:868.2},{id:"Floor-423",x:481.2,y:868.2},{id:"Floor-424",x:487.3,y:868.2},{id:"Floor-425",x:493.5,y:868.2},{id:"Floor-426",x:499.6,y:868.2},{id:"Floor-427",x:505.8,y:868.2},{id:"Floor-428",x:511.9,y:868.2},{id:"Floor-429",x:518.1,y:868.2},{id:"Floor-430",x:524.2,y:868.2},{id:"Floor-431",x:530.4,y:868.2},{id:"Floor-432",x:536.5,y:868.2},{id:"Floor-433",x:542.7,y:868.2},{id:"Floor-434",x:548.8,y:868.2},{id:"Floor-435",x:555,y:868.2},{id:"Floor-436",x:561.1,y:868.2},{id:"Floor-437",x:567.3,y:868.2},{id:"Floor-438",x:573.4,y:868.2},{id:"Floor-439",x:579.6,y:868.2},{id:"Floor-440",x:585.7,y:868.2},{id:"Floor-441",x:591.9,y:868.2},{id:"Floor-442",x:598,y:868.2},{id:"Floor-443",x:604.2,y:868.2},{id:"Floor-444",x:610.3,y:868.2},{id:"Floor-445",x:388.9,y:859.2},{id:"Floor-446",x:395.1,y:859.2},{id:"Floor-447",x:401.2,y:859.2},{id:"Floor-448",x:407.4,y:859.2},{id:"Floor-449",x:413.5,y:859.2},{id:"Floor-450",x:419.7,y:859.2},{id:"Floor-451",x:425.8,y:859.2},{id:"Floor-452",x:432,y:859.2},{id:"Floor-453",x:438.1,y:859.2},{id:"Floor-454",x:444.3,y:859.2},{id:"Floor-455",x:450.4,y:859.2},{id:"Floor-456",x:456.6,y:859.2},{id:"Floor-457",x:462.7,y:859.2},{id:"Floor-458",x:468.9,y:859.2},{id:"Floor-459",x:475,y:859.2},{id:"Floor-460",x:481.2,y:859.2},{id:"Floor-461",x:487.3,y:859.2},{id:"Floor-462",x:493.5,y:859.2},{id:"Floor-463",x:499.6,y:859.2},{id:"Floor-464",x:505.8,y:859.2},{id:"Floor-465",x:511.9,y:859.2},{id:"Floor-466",x:518.1,y:859.2},{id:"Floor-467",x:524.2,y:859.2},{id:"Floor-468",x:530.4,y:859.2},{id:"Floor-469",x:536.5,y:859.2},{id:"Floor-470",x:542.7,y:859.2},{id:"Floor-471",x:548.8,y:859.2},{id:"Floor-472",x:555,y:859.2},{id:"Floor-473",x:561.1,y:859.2},{id:"Floor-474",x:567.3,y:859.2},{id:"Floor-475",x:573.4,y:859.2},{id:"Floor-476",x:579.6,y:859.2},{id:"Floor-477",x:585.7,y:859.2},{id:"Floor-478",x:591.9,y:859.2},{id:"Floor-479",x:598,y:859.2},{id:"Floor-480",x:604.2,y:859.2},{id:"Floor-481",x:610.3,y:859.2},{id:"Floor-482",x:388.9,y:850.2},{id:"Floor-483",x:395.1,y:850.2},{id:"Floor-484",x:401.2,y:850.2},{id:"Floor-485",x:407.4,y:850.2},{id:"Floor-486",x:413.5,y:850.2},{id:"Floor-487",x:419.7,y:850.2},{id:"Floor-488",x:425.8,y:850.2},{id:"Floor-489",x:432,y:850.2},{id:"Floor-490",x:438.1,y:850.2},{id:"Floor-491",x:444.3,y:850.2},{id:"Floor-492",x:450.4,y:850.2},{id:"Floor-493",x:456.6,y:850.2},{id:"Floor-494",x:462.7,y:850.2},{id:"Floor-495",x:468.9,y:850.2},{id:"Floor-496",x:475,y:850.2},{id:"Floor-497",x:481.2,y:850.2},{id:"Floor-498",x:487.3,y:850.2},{id:"Floor-499",x:493.5,y:850.2},{id:"Floor-500",x:499.6,y:850.2},{id:"Floor-501",x:505.8,y:850.2},{id:"Floor-502",x:511.9,y:850.2},{id:"Floor-503",x:518.1,y:850.2},{id:"Floor-504",x:524.2,y:850.2},{id:"Floor-505",x:530.4,y:850.2},{id:"Floor-506",x:536.5,y:850.2},{id:"Floor-507",x:542.7,y:850.2},{id:"Floor-508",x:548.8,y:850.2},{id:"Floor-509",x:555,y:850.2},{id:"Floor-510",x:561.1,y:850.2},{id:"Floor-511",x:567.3,y:850.2},{id:"Floor-512",x:573.4,y:850.2},{id:"Floor-513",x:579.6,y:850.2},{id:"Floor-514",x:585.7,y:850.2},{id:"Floor-515",x:591.9,y:850.2},{id:"Floor-516",x:598,y:850.2},{id:"Floor-517",x:604.2,y:850.2},{id:"Floor-518",x:610.3,y:850.2},{id:"Floor-519",x:388.9,y:841.2},{id:"Floor-520",x:395.1,y:841.2},{id:"Floor-521",x:401.2,y:841.2},{id:"Floor-522",x:407.4,y:841.2},{id:"Floor-523",x:413.5,y:841.2},{id:"Floor-524",x:419.7,y:841.2},{id:"Floor-525",x:425.8,y:841.2},{id:"Floor-526",x:432,y:841.2},{id:"Floor-527",x:438.1,y:841.2},{id:"Floor-528",x:444.3,y:841.2},{id:"Floor-529",x:450.4,y:841.2},{id:"Floor-530",x:456.6,y:841.2},{id:"Floor-531",x:462.7,y:841.2},{id:"Floor-532",x:468.9,y:841.2},{id:"Floor-533",x:475,y:841.2},{id:"Floor-534",x:481.2,y:841.2},{id:"Floor-535",x:487.3,y:841.2},{id:"Floor-536",x:493.5,y:841.2},{id:"Floor-537",x:499.6,y:841.2},{id:"Floor-538",x:505.8,y:841.2},{id:"Floor-539",x:511.9,y:841.2},{id:"Floor-540",x:518.1,y:841.2},{id:"Floor-541",x:524.2,y:841.2},{id:"Floor-542",x:530.4,y:841.2},{id:"Floor-543",x:536.5,y:841.2},{id:"Floor-544",x:542.7,y:841.2},{id:"Floor-545",x:548.8,y:841.2},{id:"Floor-546",x:555,y:841.2},{id:"Floor-547",x:561.1,y:841.2},{id:"Floor-548",x:567.3,y:841.2},{id:"Floor-549",x:573.4,y:841.2},{id:"Floor-550",x:579.6,y:841.2},{id:"Floor-551",x:585.7,y:841.2},{id:"Floor-552",x:591.9,y:841.2},{id:"Floor-553",x:598,y:841.2},{id:"Floor-554",x:604.2,y:841.2},{id:"Floor-555",x:610.3,y:841.2},{id:"Floor-556",x:388.9,y:832.2},{id:"Floor-557",x:395.1,y:832.2},{id:"Floor-558",x:401.2,y:832.2},{id:"Floor-559",x:407.4,y:832.2},{id:"Floor-560",x:413.5,y:832.2},{id:"Floor-561",x:419.7,y:832.2},{id:"Floor-562",x:425.8,y:832.2},{id:"Floor-563",x:432,y:832.2},{id:"Floor-564",x:438.1,y:832.2},{id:"Floor-565",x:444.3,y:832.2},{id:"Floor-566",x:450.4,y:832.2},{id:"Floor-567",x:456.6,y:832.2},{id:"Floor-568",x:462.7,y:832.2},{id:"Floor-569",x:468.9,y:832.2},{id:"Floor-570",x:475,y:832.2},{id:"Floor-571",x:481.2,y:832.2},{id:"Floor-572",x:487.3,y:832.2},{id:"Floor-573",x:493.5,y:832.2},{id:"Floor-574",x:499.6,y:832.2},{id:"Floor-575",x:505.8,y:832.2},{id:"Floor-576",x:511.9,y:832.2},{id:"Floor-577",x:518.1,y:832.2},{id:"Floor-578",x:524.2,y:832.2},{id:"Floor-579",x:530.4,y:832.2},{id:"Floor-580",x:536.5,y:832.2},{id:"Floor-581",x:542.7,y:832.2},{id:"Floor-582",x:548.8,y:832.2},{id:"Floor-583",x:555,y:832.2},{id:"Floor-584",x:561.1,y:832.2},{id:"Floor-585",x:567.3,y:832.2},{id:"Floor-586",x:573.4,y:832.2},{id:"Floor-587",x:579.6,y:832.2},{id:"Floor-588",x:585.7,y:832.2},{id:"Floor-589",x:591.9,y:832.2},{id:"Floor-590",x:598,y:832.2},{id:"Floor-591",x:604.2,y:832.2},{id:"Floor-592",x:610.3,y:832.2},{id:"Floor-593",x:388.9,y:823.2},{id:"Floor-594",x:395.1,y:823.2},{id:"Floor-595",x:401.2,y:823.2},{id:"Floor-596",x:407.4,y:823.2},{id:"Floor-597",x:413.5,y:823.2},{id:"Floor-598",x:419.7,y:823.2},{id:"Floor-599",x:425.8,y:823.2},{id:"Floor-600",x:432,y:823.2},{id:"Floor-601",x:438.1,y:823.2},{id:"Floor-602",x:444.3,y:823.2},{id:"Floor-603",x:450.4,y:823.2},{id:"Floor-604",x:456.6,y:823.2},{id:"Floor-605",x:462.7,y:823.2},{id:"Floor-606",x:468.9,y:823.2},{id:"Floor-607",x:475,y:823.2},{id:"Floor-608",x:481.2,y:823.2},{id:"Floor-609",x:487.3,y:823.2},{id:"Floor-610",x:493.5,y:823.2},{id:"Floor-611",x:499.6,y:823.2},{id:"Floor-612",x:505.8,y:823.2},{id:"Floor-613",x:511.9,y:823.2},{id:"Floor-614",x:518.1,y:823.2},{id:"Floor-615",x:524.2,y:823.2},{id:"Floor-616",x:530.4,y:823.2},{id:"Floor-617",x:536.5,y:823.2},{id:"Floor-618",x:542.7,y:823.2},{id:"Floor-619",x:548.8,y:823.2},{id:"Floor-620",x:555,y:823.2},{id:"Floor-621",x:561.1,y:823.2},{id:"Floor-622",x:567.3,y:823.2},{id:"Floor-623",x:573.4,y:823.2},{id:"Floor-624",x:579.6,y:823.2},{id:"Floor-625",x:585.7,y:823.2},{id:"Floor-626",x:591.9,y:823.2},{id:"Floor-627",x:598,y:823.2},{id:"Floor-628",x:604.2,y:823.2},{id:"Floor-629",x:610.3,y:823.2},{id:"Floor-630",x:388.9,y:814.2},{id:"Floor-631",x:395.1,y:814.2},{id:"Floor-632",x:401.2,y:814.2},{id:"Floor-633",x:407.4,y:814.2},{id:"Floor-634",x:413.5,y:814.2},{id:"Floor-635",x:419.7,y:814.2},{id:"Floor-636",x:425.8,y:814.2},{id:"Floor-637",x:432,y:814.2},{id:"Floor-638",x:438.1,y:814.2},{id:"Floor-639",x:444.3,y:814.2},{id:"Floor-640",x:450.4,y:814.2},{id:"Floor-641",x:456.6,y:814.2},{id:"Floor-642",x:462.7,y:814.2},{id:"Floor-643",x:468.9,y:814.2},{id:"Floor-644",x:475,y:814.2},{id:"Floor-645",x:481.2,y:814.2},{id:"Floor-646",x:487.3,y:814.2},{id:"Floor-647",x:493.5,y:814.2},{id:"Floor-648",x:499.6,y:814.2},{id:"Floor-649",x:505.8,y:814.2},{id:"Floor-650",x:511.9,y:814.2},{id:"Floor-651",x:518.1,y:814.2},{id:"Floor-652",x:524.2,y:814.2},{id:"Floor-653",x:530.4,y:814.2},{id:"Floor-654",x:536.5,y:814.2},{id:"Floor-655",x:542.7,y:814.2},{id:"Floor-656",x:548.8,y:814.2},{id:"Floor-657",x:555,y:814.2},{id:"Floor-658",x:561.1,y:814.2},{id:"Floor-659",x:567.3,y:814.2},{id:"Floor-660",x:573.4,y:814.2},{id:"Floor-661",x:579.6,y:814.2},{id:"Floor-662",x:585.7,y:814.2},{id:"Floor-663",x:591.9,y:814.2},{id:"Floor-664",x:598,y:814.2},{id:"Floor-665",x:604.2,y:814.2},{id:"Floor-666",x:610.3,y:814.2},{id:"Floor-667",x:388.9,y:805.2},{id:"Floor-668",x:395.1,y:805.2},{id:"Floor-669",x:401.2,y:805.2},{id:"Floor-670",x:407.4,y:805.2},{id:"Floor-671",x:413.5,y:805.2},{id:"Floor-672",x:419.7,y:805.2},{id:"Floor-673",x:425.8,y:805.2},{id:"Floor-674",x:432,y:805.2},{id:"Floor-675",x:438.1,y:805.2},{id:"Floor-676",x:444.3,y:805.2},{id:"Floor-677",x:450.4,y:805.2},{id:"Floor-678",x:456.6,y:805.2},{id:"Floor-679",x:462.7,y:805.2},{id:"Floor-680",x:468.9,y:805.2},{id:"Floor-681",x:475,y:805.2},{id:"Floor-682",x:481.2,y:805.2},{id:"Floor-683",x:487.3,y:805.2},{id:"Floor-684",x:493.5,y:805.2},{id:"Floor-685",x:499.6,y:805.2},{id:"Floor-686",x:505.8,y:805.2},{id:"Floor-687",x:511.9,y:805.2},{id:"Floor-688",x:518.1,y:805.2},{id:"Floor-689",x:524.2,y:805.2},{id:"Floor-690",x:530.4,y:805.2},{id:"Floor-691",x:536.5,y:805.2},{id:"Floor-692",x:542.7,y:805.2},{id:"Floor-693",x:548.8,y:805.2},{id:"Floor-694",x:555,y:805.2},{id:"Floor-695",x:561.1,y:805.2},{id:"Floor-696",x:567.3,y:805.2},{id:"Floor-697",x:573.4,y:805.2},{id:"Floor-698",x:579.6,y:805.2},{id:"Floor-699",x:585.7,y:805.2},{id:"Floor-700",x:591.9,y:805.2},{id:"Floor-701",x:598,y:805.2},{id:"Floor-702",x:604.2,y:805.2},{id:"Floor-703",x:610.3,y:805.2},{id:"Floor-704",x:388.9,y:796.2},{id:"Floor-705",x:395.1,y:796.2},{id:"Floor-706",x:401.2,y:796.2},{id:"Floor-707",x:407.4,y:796.2},{id:"Floor-708",x:413.5,y:796.2},{id:"Floor-709",x:419.7,y:796.2},{id:"Floor-710",x:425.8,y:796.2},{id:"Floor-711",x:432,y:796.2},{id:"Floor-712",x:438.1,y:796.2},{id:"Floor-713",x:444.3,y:796.2},{id:"Floor-714",x:450.4,y:796.2},{id:"Floor-715",x:456.6,y:796.2},{id:"Floor-716",x:462.7,y:796.2},{id:"Floor-717",x:468.9,y:796.2},{id:"Floor-718",x:475,y:796.2},{id:"Floor-719",x:481.2,y:796.2},{id:"Floor-720",x:487.3,y:796.2},{id:"Floor-721",x:493.5,y:796.2},{id:"Floor-722",x:499.6,y:796.2},{id:"Floor-723",x:505.8,y:796.2},{id:"Floor-724",x:511.9,y:796.2},{id:"Floor-725",x:518.1,y:796.2},{id:"Floor-726",x:524.2,y:796.2},{id:"Floor-727",x:530.4,y:796.2},{id:"Floor-728",x:536.5,y:796.2},{id:"Floor-729",x:542.7,y:796.2},{id:"Floor-730",x:548.8,y:796.2},{id:"Floor-731",x:555,y:796.2},{id:"Floor-732",x:561.1,y:796.2},{id:"Floor-733",x:567.3,y:796.2},{id:"Floor-734",x:573.4,y:796.2},{id:"Floor-735",x:579.6,y:796.2},{id:"Floor-736",x:585.7,y:796.2},{id:"Floor-737",x:591.9,y:796.2},{id:"Floor-738",x:598,y:796.2},{id:"Floor-739",x:604.2,y:796.2},{id:"Floor-740",x:610.3,y:796.2},{id:"Floor-741",x:388.9,y:787.2},{id:"Floor-742",x:395.1,y:787.2},{id:"Floor-743",x:401.2,y:787.2},{id:"Floor-744",x:407.4,y:787.2},{id:"Floor-745",x:413.5,y:787.2},{id:"Floor-746",x:419.7,y:787.2},{id:"Floor-747",x:425.8,y:787.2},{id:"Floor-748",x:432,y:787.2},{id:"Floor-749",x:438.1,y:787.2},{id:"Floor-750",x:444.3,y:787.2},{id:"Floor-751",x:450.4,y:787.2},{id:"Floor-752",x:456.6,y:787.2},{id:"Floor-753",x:462.7,y:787.2},{id:"Floor-754",x:468.9,y:787.2},{id:"Floor-755",x:475,y:787.2},{id:"Floor-756",x:481.2,y:787.2},{id:"Floor-757",x:487.3,y:787.2},{id:"Floor-758",x:493.5,y:787.2},{id:"Floor-759",x:499.6,y:787.2},{id:"Floor-760",x:505.8,y:787.2},{id:"Floor-761",x:511.9,y:787.2},{id:"Floor-762",x:518.1,y:787.2},{id:"Floor-763",x:524.2,y:787.2},{id:"Floor-764",x:530.4,y:787.2},{id:"Floor-765",x:536.5,y:787.2},{id:"Floor-766",x:542.7,y:787.2},{id:"Floor-767",x:548.8,y:787.2},{id:"Floor-768",x:555,y:787.2},{id:"Floor-769",x:561.1,y:787.2},{id:"Floor-770",x:567.3,y:787.2},{id:"Floor-771",x:573.4,y:787.2},{id:"Floor-772",x:579.6,y:787.2},{id:"Floor-773",x:585.7,y:787.2},{id:"Floor-774",x:591.9,y:787.2},{id:"Floor-775",x:598,y:787.2},{id:"Floor-776",x:604.2,y:787.2},{id:"Floor-777",x:610.3,y:787.2},{id:"Floor-778",x:388.9,y:778.2},{id:"Floor-779",x:395.1,y:778.2},{id:"Floor-780",x:401.2,y:778.2},{id:"Floor-781",x:407.4,y:778.2},{id:"Floor-782",x:413.5,y:778.2},{id:"Floor-783",x:419.7,y:778.2},{id:"Floor-784",x:425.8,y:778.2},{id:"Floor-785",x:432,y:778.2},{id:"Floor-786",x:438.1,y:778.2},{id:"Floor-787",x:444.3,y:778.2},{id:"Floor-788",x:450.4,y:778.2},{id:"Floor-789",x:456.6,y:778.2},{id:"Floor-790",x:462.7,y:778.2},{id:"Floor-791",x:468.9,y:778.2},{id:"Floor-792",x:475,y:778.2},{id:"Floor-793",x:481.2,y:778.2},{id:"Floor-794",x:487.3,y:778.2},{id:"Floor-795",x:493.5,y:778.2},{id:"Floor-796",x:499.6,y:778.2},{id:"Floor-797",x:505.8,y:778.2},{id:"Floor-798",x:511.9,y:778.2},{id:"Floor-799",x:518.1,y:778.2},{id:"Floor-800",x:524.2,y:778.2},{id:"Floor-801",x:530.4,y:778.2},{id:"Floor-802",x:536.5,y:778.2},{id:"Floor-803",x:542.7,y:778.2},{id:"Floor-804",x:548.8,y:778.2},{id:"Floor-805",x:555,y:778.2},{id:"Floor-806",x:561.1,y:778.2},{id:"Floor-807",x:567.3,y:778.2},{id:"Floor-808",x:573.4,y:778.2},{id:"Floor-809",x:579.6,y:778.2},{id:"Floor-810",x:585.7,y:778.2},{id:"Floor-811",x:591.9,y:778.2},{id:"Floor-812",x:598,y:778.2},{id:"Floor-813",x:604.2,y:778.2},{id:"Floor-814",x:610.3,y:778.2},{id:"Floor-815",x:388.9,y:769.2},{id:"Floor-816",x:395.1,y:769.2},{id:"Floor-817",x:401.2,y:769.2},{id:"Floor-818",x:407.4,y:769.2},{id:"Floor-819",x:413.5,y:769.2},{id:"Floor-820",x:419.7,y:769.2},{id:"Floor-821",x:425.8,y:769.2},{id:"Floor-822",x:432,y:769.2},{id:"Floor-823",x:438.1,y:769.2},{id:"Floor-824",x:444.3,y:769.2},{id:"Floor-825",x:450.4,y:769.2},{id:"Floor-826",x:456.6,y:769.2},{id:"Floor-827",x:462.7,y:769.2},{id:"Floor-828",x:468.9,y:769.2},{id:"Floor-829",x:475,y:769.2},{id:"Floor-830",x:481.2,y:769.2},{id:"Floor-831",x:487.3,y:769.2},{id:"Floor-832",x:493.5,y:769.2},{id:"Floor-833",x:499.6,y:769.2},{id:"Floor-834",x:505.8,y:769.2},{id:"Floor-835",x:511.9,y:769.2},{id:"Floor-836",x:518.1,y:769.2},{id:"Floor-837",x:524.2,y:769.2},{id:"Floor-838",x:530.4,y:769.2},{id:"Floor-839",x:536.5,y:769.2},{id:"Floor-840",x:542.7,y:769.2},{id:"Floor-841",x:548.8,y:769.2},{id:"Floor-842",x:555,y:769.2},{id:"Floor-843",x:561.1,y:769.2},{id:"Floor-844",x:567.3,y:769.2},{id:"Floor-845",x:573.4,y:769.2},{id:"Floor-846",x:579.6,y:769.2},{id:"Floor-847",x:585.7,y:769.2},{id:"Floor-848",x:591.9,y:769.2},{id:"Floor-849",x:598,y:769.2},{id:"Floor-850",x:604.2,y:769.2},{id:"Floor-851",x:610.3,y:769.2},{id:"Floor-852",x:388.9,y:760.2},{id:"Floor-853",x:395.1,y:760.2},{id:"Floor-854",x:401.2,y:760.2},{id:"Floor-855",x:407.4,y:760.2},{id:"Floor-856",x:413.5,y:760.2},{id:"Floor-857",x:419.7,y:760.2},{id:"Floor-858",x:425.8,y:760.2},{id:"Floor-859",x:432,y:760.2},{id:"Floor-860",x:438.1,y:760.2},{id:"Floor-861",x:444.3,y:760.2},{id:"Floor-862",x:450.4,y:760.2},{id:"Floor-863",x:456.6,y:760.2},{id:"Floor-864",x:462.7,y:760.2},{id:"Floor-865",x:468.9,y:760.2},{id:"Floor-866",x:475,y:760.2},{id:"Floor-867",x:481.2,y:760.2},{id:"Floor-868",x:487.3,y:760.2},{id:"Floor-869",x:493.5,y:760.2},{id:"Floor-870",x:499.6,y:760.2},{id:"Floor-871",x:505.8,y:760.2},{id:"Floor-872",x:511.9,y:760.2},{id:"Floor-873",x:518.1,y:760.2},{id:"Floor-874",x:524.2,y:760.2},{id:"Floor-875",x:530.4,y:760.2},{id:"Floor-876",x:536.5,y:760.2},{id:"Floor-877",x:542.7,y:760.2},{id:"Floor-878",x:548.8,y:760.2},{id:"Floor-879",x:555,y:760.2},{id:"Floor-880",x:561.1,y:760.2},{id:"Floor-881",x:567.3,y:760.2},{id:"Floor-882",x:573.4,y:760.2},{id:"Floor-883",x:579.6,y:760.2},{id:"Floor-884",x:585.7,y:760.2},{id:"Floor-885",x:591.9,y:760.2},{id:"Floor-886",x:598,y:760.2},{id:"Floor-887",x:604.2,y:760.2},{id:"Floor-888",x:610.3,y:760.2}]},{id:"G",name:"G 구역",grade:"S",floor:"1F",seats:[{id:"G-1",x:177.7,y:951},{id:"G-2",x:177.7,y:941.9},{id:"G-3",x:177.7,y:932.5},{id:"G-4",x:177.7,y:923.5},{id:"G-5",x:177.7,y:914.1},{id:"G-6",x:177.7,y:905},{id:"G-7",x:177.7,y:895.6},{id:"G-8",x:177.7,y:886.2},{id:"G-9",x:177.7,y:877.1},{id:"G-10",x:177.7,y:868.1},{id:"G-11",x:177.7,y:858.7},{id:"G-12",x:177.7,y:819},{id:"G-13",x:177.7,y:810},{id:"G-14",x:177.7,y:798.6},{id:"G-15",x:188.5,y:848.5},{id:"G-16",x:188.5,y:951},{id:"G-17",x:188.5,y:941.9},{id:"G-18",x:188.5,y:932.5},{id:"G-19",x:188.5,y:923.5},{id:"G-20",x:188.5,y:914.1},{id:"G-21",x:188.5,y:905},{id:"G-22",x:188.5,y:895.6},{id:"G-23",x:188.5,y:886.2},{id:"G-24",x:188.5,y:877.1},{id:"G-25",x:188.5,y:868.1},{id:"G-26",x:188.5,y:858.7},{id:"G-27",x:188.5,y:819},{id:"G-28",x:188.5,y:810},{id:"G-29",x:199.7,y:951},{id:"G-30",x:199.7,y:941.9},{id:"G-31",x:199.7,y:932.5},{id:"G-32",x:199.7,y:923.5},{id:"G-33",x:199.7,y:914.1},{id:"G-34",x:199.7,y:905},{id:"G-35",x:212.1,y:951},{id:"G-36",x:212.1,y:941.9},{id:"G-37",x:212.1,y:932.5},{id:"G-38",x:212.1,y:923.5},{id:"G-39",x:223.9,y:951},{id:"G-40",x:223.9,y:941.9},{id:"G-41",x:235.2,y:951}]},{id:"H",name:"H 구역",grade:"S",floor:"1F",seats:[{id:"H-1",x:763.8,y:950.7},{id:"H-2",x:776.2,y:950.7},{id:"H-3",x:776.2,y:941.2},{id:"H-4",x:776.2,y:932.2},{id:"H-5",x:786.9,y:950.7},{id:"H-6",x:786.9,y:941.2},{id:"H-7",x:786.9,y:932.2},{id:"H-8",x:786.9,y:922.7},{id:"H-9",x:799.3,y:950.7},{id:"H-10",x:799.3,y:941.2},{id:"H-11",x:799.3,y:932.2},{id:"H-12",x:799.3,y:922.7},{id:"H-13",x:799.3,y:913.6},{id:"H-14",x:799.3,y:904.2},{id:"H-15",x:810.6,y:950.7},{id:"H-16",x:810.6,y:941.2},{id:"H-17",x:810.6,y:932.2},{id:"H-18",x:810.6,y:922.7},{id:"H-19",x:810.6,y:913.6},{id:"H-20",x:810.6,y:904.2},{id:"H-21",x:810.6,y:894.4},{id:"H-22",x:810.6,y:884.9},{id:"H-23",x:810.6,y:875.9},{id:"H-24",x:810.6,y:866.5},{id:"H-25",x:810.6,y:857},{id:"H-26",x:810.6,y:827.2},{id:"H-27",x:810.6,y:818.2},{id:"H-28",x:821.3,y:827.2},{id:"H-29",x:821.3,y:950.7},{id:"H-30",x:821.3,y:941.2},{id:"H-31",x:821.3,y:932.2},{id:"H-32",x:821.3,y:922.7},{id:"H-33",x:821.3,y:913.6},{id:"H-34",x:821.3,y:904.2},{id:"H-35",x:821.3,y:894.4},{id:"H-36",x:821.3,y:884.9},{id:"H-37",x:821.3,y:875.9},{id:"H-38",x:821.3,y:866.5},{id:"H-39",x:821.3,y:818.2},{id:"H-40",x:821.3,y:809.1}]},{id:"I1",name:"I1 구역",grade:"A",floor:"2F",seats:[{id:"I1-1",x:271.4,y:170.4},{id:"I1-2",x:276.1,y:163.7},{id:"I1-3",x:280.8,y:157.2},{id:"I1-4",x:283.5,y:174.6},{id:"I1-5",x:285.4,y:150.7},{id:"I1-6",x:288.1,y:167.8},{id:"I1-7",x:291.2,y:186.9},{id:"I1-8",x:292.5,y:161.2},{id:"I1-9",x:295.7,y:180.5},{id:"I1-10",x:300.6,y:199.9},{id:"I1-11",x:300.4,y:173.8},{id:"I1-12",x:302.8,y:217},{id:"I1-13",x:305.4,y:193.2},{id:"I1-14",x:307.4,y:210.5},{id:"I1-15",x:309.8,y:186.7},{id:"I1-16",x:311.9,y:203.8},{id:"I1-17",x:313.1,y:138.7},{id:"I1-18",x:313,y:122.6},{id:"I1-19",x:313,y:106.9},{id:"I1-20",x:316.6,y:196.9},{id:"I1-21",x:319.7,y:244.3},{id:"I1-22",x:319.7,y:154},{id:"I1-23",x:319.6,y:138.7},{id:"I1-24",x:319.5,y:122.6},{id:"I1-25",x:319.4,y:106.9},{id:"I1-26",x:324.3,y:237.5},{id:"I1-27",x:326.2,y:170.5},{id:"I1-28",x:326.1,y:154},{id:"I1-29",x:326.1,y:138.7},{id:"I1-30",x:326,y:122.6},{id:"I1-31",x:325.9,y:106.9},{id:"I1-32",x:327.7,y:255.6},{id:"I1-33",x:328.8,y:231.1},{id:"I1-34",x:332.3,y:249.2},{id:"I1-35",x:333.6,y:224.4},{id:"I1-36",x:333.3,y:186.2},{id:"I1-37",x:333.3,y:170.5},{id:"I1-38",x:333.2,y:154},{id:"I1-39",x:333.1,y:138.7},{id:"I1-40",x:333,y:122.6},{id:"I1-41",x:333,y:106.8},{id:"I1-42",x:332.9,y:90.7},{id:"I1-43",x:335.2,y:266.4},{id:"I1-44",x:337.1,y:242.4},{id:"I1-45",x:340,y:259.7},{id:"I1-46",x:339.2,y:122.5},{id:"I1-47",x:339.1,y:90.7},{id:"I1-48",x:339.8,y:186.2},{id:"I1-49",x:339.7,y:170.5},{id:"I1-50",x:339.7,y:154},{id:"I1-51",x:339.6,y:138.6},{id:"I1-52",x:339.4,y:106.8},{id:"I1-53",x:341.8,y:235.7},{id:"I1-54",x:343.9,y:276.5},{id:"I1-55",x:344.6,y:253.3},{id:"I1-56",x:346.1,y:216.1},{id:"I1-57",x:346.3,y:186.1},{id:"I1-58",x:345.9,y:170.4},{id:"I1-59",x:345.9,y:153.9},{id:"I1-60",x:345.8,y:138.6},{id:"I1-61",x:345.7,y:122.5},{id:"I1-62",x:345.6,y:106.8},{id:"I1-63",x:345.6,y:90.7},{id:"I1-64",x:348.5,y:269.9},{id:"I1-65",x:352.2,y:287.6},{id:"I1-66",x:352.4,y:231.8},{id:"I1-67",x:352.5,y:186.1},{id:"I1-68",x:352.4,y:170.4},{id:"I1-69",x:352.3,y:153.9},{id:"I1-70",x:352.3,y:138.6},{id:"I1-71",x:352.2,y:122.5},{id:"I1-72",x:352.1,y:106.8},{id:"I1-73",x:352.1,y:90.7},{id:"I1-74",x:352.7,y:247.9},{id:"I1-75",x:352.6,y:216.1},{id:"I1-76",x:356.7,y:281.1},{id:"I1-77",x:359.1,y:231.8},{id:"I1-78",x:359.3,y:186.1},{id:"I1-79",x:359.2,y:170.4},{id:"I1-80",x:359.1,y:153.9},{id:"I1-81",x:359,y:138.6},{id:"I1-82",x:359,y:122.5},{id:"I1-83",x:358.9,y:106.8},{id:"I1-84",x:358.8,y:90.7},{id:"I1-85",x:359.6,y:263.6},{id:"I1-86",x:359.5,y:247.9},{id:"I1-87",x:359.4,y:216.1},{id:"I1-88",x:366.7,y:279.3},{id:"I1-89",x:366.6,y:263.6},{id:"I1-90",x:366.5,y:247.9},{id:"I1-91",x:366.5,y:231.8},{id:"I1-92",x:366.4,y:216.1},{id:"I1-93",x:366.6,y:186.1},{id:"I1-94",x:366.5,y:170.4},{id:"I1-95",x:366.4,y:153.9},{id:"I1-96",x:366.4,y:138.6},{id:"I1-97",x:366,y:122.4},{id:"I1-98",x:366.2,y:106.7},{id:"I1-99",x:365.9,y:90.6},{id:"I1-100",x:373.5,y:279.3},{id:"I1-101",x:373.4,y:263.6},{id:"I1-102",x:373.3,y:247.9},{id:"I1-103",x:373.2,y:231.8},{id:"I1-104",x:373.2,y:216.1},{id:"I1-105",x:373.3,y:186.1},{id:"I1-106",x:373,y:170.3},{id:"I1-107",x:372.9,y:153.8},{id:"I1-108",x:372.8,y:138.5},{id:"I1-109",x:372.8,y:122.4},{id:"I1-110",x:372.7,y:106.7},{id:"I1-111",x:372.6,y:90.6},{id:"I1-112",x:379.2,y:122.4},{id:"I1-113",x:379.1,y:90.6},{id:"I1-114",x:380.2,y:279.3},{id:"I1-115",x:380.1,y:263.6},{id:"I1-116",x:380.1,y:247.8},{id:"I1-117",x:379.7,y:231.7},{id:"I1-118",x:379.9,y:216},{id:"I1-119",x:379.8,y:186},{id:"I1-120",x:379.7,y:170.3},{id:"I1-121",x:379.7,y:153.8},{id:"I1-122",x:379.6,y:138.5},{id:"I1-123",x:379.5,y:106.7},{id:"I1-124",x:386.2,y:170.3},{id:"I1-125",x:386.1,y:153.8},{id:"I1-126",x:386.1,y:138.5},{id:"I1-127",x:386,y:122.4},{id:"I1-128",x:385.9,y:106.7},{id:"I1-129",x:385.9,y:90.6},{id:"I1-130",x:387,y:279.2},{id:"I1-131",x:386.9,y:263.5},{id:"I1-132",x:386.8,y:247.8},{id:"I1-133",x:386.5,y:231.7},{id:"I1-134",x:386.7,y:216},{id:"I1-135",x:386.6,y:186},{id:"I1-136",x:393,y:231.7},{id:"I1-137",x:393.1,y:186},{id:"I1-138",x:393,y:170.3},{id:"I1-139",x:392.9,y:153.8},{id:"I1-140",x:392.8,y:138.5},{id:"I1-141",x:392.8,y:122.4},{id:"I1-142",x:392.7,y:106.7},{id:"I1-143",x:392.6,y:90.5},{id:"I1-144",x:393.5,y:279.2},{id:"I1-145",x:393.4,y:263.5},{id:"I1-146",x:393.3,y:247.8},{id:"I1-147",x:393.2,y:216},{id:"I1-148",x:399.7,y:231.7},{id:"I1-149",x:399.8,y:186},{id:"I1-150",x:399.7,y:170.3},{id:"I1-151",x:399.7,y:153.8},{id:"I1-152",x:399.6,y:138.4},{id:"I1-153",x:399.5,y:122.3},{id:"I1-154",x:399.5,y:106.6},{id:"I1-155",x:399.4,y:90.5},{id:"I1-156",x:400.2,y:279.2},{id:"I1-157",x:400.1,y:263.5},{id:"I1-158",x:400.1,y:247.8},{id:"I1-159",x:399.9,y:216},{id:"I1-160",x:406.7,y:279.2},{id:"I1-161",x:406.6,y:263.5},{id:"I1-162",x:406.6,y:247.8},{id:"I1-163",x:406.5,y:231.7},{id:"I1-164",x:406.4,y:215.9},{id:"I1-165",x:406.6,y:185.9},{id:"I1-166",x:406.5,y:170.2},{id:"I1-167",x:406.4,y:153.7},{id:"I1-168",x:406.4,y:138.4},{id:"I1-169",x:406,y:122.3},{id:"I1-170",x:406.2,y:106.6},{id:"I1-171",x:405.9,y:90.5},{id:"I1-172",x:413.5,y:279.2},{id:"I1-173",x:413.4,y:263.5},{id:"I1-174",x:413.3,y:247.7},{id:"I1-175",x:413,y:231.6},{id:"I1-176",x:413.2,y:215.9},{id:"I1-177",x:413.1,y:185.9},{id:"I1-178",x:413,y:170.2},{id:"I1-179",x:412.9,y:153.7},{id:"I1-180",x:412.8,y:138.4},{id:"I1-181",x:412.8,y:122.3},{id:"I1-182",x:412.7,y:106.6},{id:"I1-183",x:412.6,y:90.5},{id:"I1-184",x:326.1,y:186.2}]},{id:"I2",name:"I2 구역",grade:"A",floor:"2F",seats:[{id:"I2-1",x:443.5,y:247.1},{id:"I2-2",x:443.5,y:156},{id:"I2-3",x:443.5,y:278.6},{id:"I2-4",x:443.5,y:262.9},{id:"I2-5",x:443.5,y:231},{id:"I2-6",x:443.5,y:215.7},{id:"I2-7",x:443.5,y:187.4},{id:"I2-8",x:443.5,y:171.7},{id:"I2-9",x:443.5,y:140.3},{id:"I2-10",x:443.5,y:124.6},{id:"I2-11",x:443.5,y:108.9},{id:"I2-12",x:450,y:247.1},{id:"I2-13",x:450,y:187.4},{id:"I2-14",x:450,y:156},{id:"I2-15",x:450,y:140.3},{id:"I2-16",x:450,y:278.6},{id:"I2-17",x:450,y:262.9},{id:"I2-18",x:450,y:231},{id:"I2-19",x:450,y:215.7},{id:"I2-20",x:450,y:171.7},{id:"I2-21",x:450,y:124.6},{id:"I2-22",x:450,y:108.9},{id:"I2-23",x:456.7,y:247.1},{id:"I2-24",x:456.7,y:187.4},{id:"I2-25",x:456.7,y:156},{id:"I2-26",x:456.7,y:140.3},{id:"I2-27",x:456.7,y:278.6},{id:"I2-28",x:456.7,y:262.9},{id:"I2-29",x:456.7,y:231},{id:"I2-30",x:456.7,y:215.7},{id:"I2-31",x:456.7,y:171.7},{id:"I2-32",x:456.7,y:124.6},{id:"I2-33",x:456.7,y:108.9},{id:"I2-34",x:463.2,y:278.6},{id:"I2-35",x:463.2,y:247.1},{id:"I2-36",x:463.2,y:231},{id:"I2-37",x:463.2,y:187.4},{id:"I2-38",x:463.2,y:156},{id:"I2-39",x:463.2,y:140.3},{id:"I2-40",x:463.2,y:262.9},{id:"I2-41",x:463.2,y:215.7},{id:"I2-42",x:463.2,y:171.7},{id:"I2-43",x:463.2,y:124.6},{id:"I2-44",x:463.2,y:108.9},{id:"I2-45",x:470,y:156},{id:"I2-46",x:470,y:278.6},{id:"I2-47",x:470,y:247.1},{id:"I2-48",x:470,y:231},{id:"I2-49",x:470,y:187.4},{id:"I2-50",x:470,y:171.7},{id:"I2-51",x:470,y:140.3},{id:"I2-52",x:470,y:124.6},{id:"I2-53",x:470,y:262.9},{id:"I2-54",x:470,y:215.7},{id:"I2-55",x:470,y:108.9},{id:"I2-56",x:476.7,y:247.1},{id:"I2-57",x:476.7,y:156},{id:"I2-58",x:476.7,y:278.6},{id:"I2-59",x:476.7,y:231},{id:"I2-60",x:476.7,y:187.4},{id:"I2-61",x:476.7,y:171.7},{id:"I2-62",x:476.7,y:140.3},{id:"I2-63",x:476.7,y:124.6},{id:"I2-64",x:476.7,y:108.9},{id:"I2-65",x:476.7,y:262.9},{id:"I2-66",x:476.7,y:215.7},{id:"I2-67",x:483.5,y:247.1},{id:"I2-68",x:483.5,y:156},{id:"I2-69",x:483.5,y:278.6},{id:"I2-70",x:483.5,y:262.9},{id:"I2-71",x:483.5,y:231},{id:"I2-72",x:483.5,y:215.7},{id:"I2-73",x:483.5,y:187.4},{id:"I2-74",x:483.5,y:171.7},{id:"I2-75",x:483.5,y:140.3},{id:"I2-76",x:483.5,y:124.6},{id:"I2-77",x:483.5,y:108.9},{id:"I2-78",x:490,y:247.1},{id:"I2-79",x:490,y:187.4},{id:"I2-80",x:490,y:156},{id:"I2-81",x:490,y:140.3},{id:"I2-82",x:490,y:278.6},{id:"I2-83",x:490,y:262.9},{id:"I2-84",x:490,y:231},{id:"I2-85",x:490,y:215.7},{id:"I2-86",x:490,y:171.7},{id:"I2-87",x:490,y:124.6},{id:"I2-88",x:490,y:108.9},{id:"I2-89",x:496.7,y:247.1},{id:"I2-90",x:496.7,y:231},{id:"I2-91",x:496.7,y:187.4},{id:"I2-92",x:496.7,y:156},{id:"I2-93",x:496.7,y:140.3},{id:"I2-94",x:496.7,y:278.6},{id:"I2-95",x:496.7,y:262.9},{id:"I2-96",x:496.7,y:215.7},{id:"I2-97",x:496.7,y:171.7},{id:"I2-98",x:496.7,y:124.6},{id:"I2-99",x:496.7,y:108.9},{id:"I2-100",x:503.2,y:156},{id:"I2-101",x:503.2,y:278.6},{id:"I2-102",x:503.2,y:247.1},{id:"I2-103",x:503.2,y:231},{id:"I2-104",x:503.2,y:187.4},{id:"I2-105",x:503.2,y:140.3},{id:"I2-106",x:503.2,y:262.9},{id:"I2-107",x:503.2,y:215.7},{id:"I2-108",x:503.2,y:171.7},{id:"I2-109",x:503.2,y:124.6},{id:"I2-110",x:503.2,y:108.9},{id:"I2-111",x:510,y:156},{id:"I2-112",x:510,y:278.6},{id:"I2-113",x:510,y:247.1},{id:"I2-114",x:510,y:231},{id:"I2-115",x:510,y:187.4},{id:"I2-116",x:510,y:171.7},{id:"I2-117",x:510,y:140.3},{id:"I2-118",x:510,y:124.6},{id:"I2-119",x:510,y:108.9},{id:"I2-120",x:510,y:262.9},{id:"I2-121",x:510,y:215.7},{id:"I2-122",x:516.7,y:247.1},{id:"I2-123",x:516.7,y:156},{id:"I2-124",x:516.7,y:278.6},{id:"I2-125",x:516.7,y:231},{id:"I2-126",x:516.7,y:187.4},{id:"I2-127",x:516.7,y:171.7},{id:"I2-128",x:516.7,y:140.3},{id:"I2-129",x:516.7,y:124.6},{id:"I2-130",x:516.7,y:108.9},{id:"I2-131",x:516.7,y:262.9},{id:"I2-132",x:516.7,y:215.7},{id:"I2-133",x:523.2,y:247.1},{id:"I2-134",x:523.2,y:156},{id:"I2-135",x:523.2,y:140.3},{id:"I2-136",x:523.2,y:278.6},{id:"I2-137",x:523.2,y:262.9},{id:"I2-138",x:523.2,y:231},{id:"I2-139",x:523.2,y:215.7},{id:"I2-140",x:523.2,y:187.4},{id:"I2-141",x:523.2,y:171.7},{id:"I2-142",x:523.2,y:124.6},{id:"I2-143",x:523.2,y:108.9},{id:"I2-144",x:530,y:247.1},{id:"I2-145",x:530,y:187.4},{id:"I2-146",x:530,y:156},{id:"I2-147",x:530,y:140.3},{id:"I2-148",x:530,y:278.6},{id:"I2-149",x:530,y:262.9},{id:"I2-150",x:530,y:231},{id:"I2-151",x:530,y:215.7},{id:"I2-152",x:530,y:171.7},{id:"I2-153",x:530,y:124.6},{id:"I2-154",x:530,y:108.9},{id:"I2-155",x:536.7,y:247.1},{id:"I2-156",x:536.7,y:231},{id:"I2-157",x:536.7,y:187.4},{id:"I2-158",x:536.7,y:156},{id:"I2-159",x:536.7,y:140.3},{id:"I2-160",x:536.7,y:278.6},{id:"I2-161",x:536.7,y:262.9},{id:"I2-162",x:536.7,y:215.7},{id:"I2-163",x:536.7,y:171.7},{id:"I2-164",x:536.7,y:124.6},{id:"I2-165",x:536.7,y:108.9},{id:"I2-166",x:543.2,y:156},{id:"I2-167",x:543.2,y:278.6},{id:"I2-168",x:543.2,y:247.1},{id:"I2-169",x:543.2,y:231},{id:"I2-170",x:543.2,y:187.4},{id:"I2-171",x:543.2,y:140.3},{id:"I2-172",x:543.2,y:262.9},{id:"I2-173",x:543.2,y:215.7},{id:"I2-174",x:543.2,y:171.7},{id:"I2-175",x:543.2,y:124.6},{id:"I2-176",x:543.2,y:108.9},{id:"I2-177",x:550,y:156},{id:"I2-178",x:550,y:278.6},{id:"I2-179",x:550,y:247.1},{id:"I2-180",x:550,y:231},{id:"I2-181",x:550,y:187.4},{id:"I2-182",x:550,y:171.7},{id:"I2-183",x:550,y:140.3},{id:"I2-184",x:550,y:124.6},{id:"I2-185",x:550,y:108.9},{id:"I2-186",x:550,y:262.9},{id:"I2-187",x:550,y:215.7},{id:"I2-188",x:556.7,y:247.1},{id:"I2-189",x:556.7,y:156},{id:"I2-190",x:556.7,y:278.6},{id:"I2-191",x:556.7,y:262.9},{id:"I2-192",x:556.7,y:231},{id:"I2-193",x:556.7,y:215.7},{id:"I2-194",x:556.7,y:187.4},{id:"I2-195",x:556.7,y:171.7},{id:"I2-196",x:556.7,y:140.3},{id:"I2-197",x:556.7,y:124.6},{id:"I2-198",x:556.7,y:108.9}]},{id:"I3",name:"I3 구역",grade:"A",floor:"2F",seats:[{id:"I3-1",x:587.1,y:278.8},{id:"I3-2",x:587,y:263.1},{id:"I3-3",x:586.9,y:247.4},{id:"I3-4",x:587.1,y:231.3},{id:"I3-5",x:586.8,y:215.6},{id:"I3-6",x:586,y:185.5},{id:"I3-7",x:586,y:169.8},{id:"I3-8",x:585.9,y:153.3},{id:"I3-9",x:585.8,y:137.9},{id:"I3-10",x:585.7,y:121.8},{id:"I3-11",x:585.7,y:106.1},{id:"I3-12",x:585.6,y:90},{id:"I3-13",x:593.5,y:278.8},{id:"I3-14",x:593.5,y:263.1},{id:"I3-15",x:593.4,y:247.4},{id:"I3-16",x:593.3,y:215.6},{id:"I3-17",x:593.6,y:231.3},{id:"I3-18",x:592.5,y:185.4},{id:"I3-19",x:592.7,y:169.7},{id:"I3-20",x:592.6,y:153.2},{id:"I3-21",x:592.6,y:137.9},{id:"I3-22",x:592.5,y:121.8},{id:"I3-23",x:592.4,y:106.1},{id:"I3-24",x:592.4,y:90},{id:"I3-25",x:600.3,y:278.8},{id:"I3-26",x:600.2,y:263.1},{id:"I3-27",x:600.2,y:247.3},{id:"I3-28",x:600,y:215.5},{id:"I3-29",x:600.4,y:231.2},{id:"I3-30",x:599.3,y:185.4},{id:"I3-31",x:599.2,y:169.7},{id:"I3-32",x:599.1,y:153.2},{id:"I3-33",x:599.1,y:137.9},{id:"I3-34",x:599.3,y:121.8},{id:"I3-35",x:598.9,y:106.1},{id:"I3-36",x:599.1,y:90},{id:"I3-37",x:607.1,y:278.7},{id:"I3-38",x:607,y:263},{id:"I3-39",x:606.9,y:247.3},{id:"I3-40",x:606.9,y:231.2},{id:"I3-41",x:606.8,y:215.5},{id:"I3-42",x:605.8,y:185.4},{id:"I3-43",x:606,y:169.7},{id:"I3-44",x:605.9,y:153.2},{id:"I3-45",x:605.8,y:137.9},{id:"I3-46",x:605.7,y:121.8},{id:"I3-47",x:605.7,y:106.1},{id:"I3-48",x:605.6,y:90},{id:"I3-49",x:613.8,y:278.7},{id:"I3-50",x:613.8,y:263},{id:"I3-51",x:613.7,y:247.3},{id:"I3-52",x:613.6,y:231.2},{id:"I3-53",x:613.5,y:215.5},{id:"I3-54",x:612.5,y:185.4},{id:"I3-55",x:612.4,y:169.7},{id:"I3-56",x:612.4,y:153.2},{id:"I3-57",x:612.3,y:137.9},{id:"I3-58",x:612.2,y:106},{id:"I3-59",x:612.5,y:121.8},{id:"I3-60",x:612.4,y:89.9},{id:"I3-61",x:620.3,y:278.7},{id:"I3-62",x:620.2,y:263},{id:"I3-63",x:620.2,y:247.3},{id:"I3-64",x:620.4,y:231.2},{id:"I3-65",x:620,y:215.5},{id:"I3-66",x:619.3,y:185.4},{id:"I3-67",x:619.2,y:169.7},{id:"I3-68",x:619.1,y:153.2},{id:"I3-69",x:619.1,y:137.8},{id:"I3-70",x:619,y:121.7},{id:"I3-71",x:618.9,y:106},{id:"I3-72",x:618.8,y:89.9},{id:"I3-73",x:627.1,y:278.7},{id:"I3-74",x:627,y:263},{id:"I3-75",x:626.9,y:247.3},{id:"I3-76",x:627.1,y:231.2},{id:"I3-77",x:626.8,y:215.4},{id:"I3-78",x:626,y:185.3},{id:"I3-79",x:626,y:169.6},{id:"I3-80",x:625.9,y:153.1},{id:"I3-81",x:625.8,y:137.8},{id:"I3-82",x:625.7,y:121.7},{id:"I3-83",x:625.7,y:106},{id:"I3-84",x:625.6,y:89.9},{id:"I3-85",x:633.6,y:278.7},{id:"I3-86",x:633.5,y:262.9},{id:"I3-87",x:633.4,y:247.2},{id:"I3-88",x:633.3,y:215.4},{id:"I3-89",x:633.6,y:231.1},{id:"I3-90",x:632.5,y:185.3},{id:"I3-91",x:632.4,y:169.6},{id:"I3-92",x:632.4,y:153.1},{id:"I3-93",x:632.6,y:137.8},{id:"I3-94",x:632.5,y:121.7},{id:"I3-95",x:632.2,y:106},{id:"I3-96",x:632.4,y:89.9},{id:"I3-97",x:640.8,y:262.9},{id:"I3-98",x:640.7,y:247.2},{id:"I3-99",x:640.6,y:215.4},{id:"I3-100",x:640.9,y:231.1},{id:"I3-101",x:639.8,y:185.3},{id:"I3-102",x:639.8,y:169.6},{id:"I3-103",x:639.7,y:153.1},{id:"I3-104",x:639.6,y:137.8},{id:"I3-105",x:639.6,y:121.7},{id:"I3-106",x:639.5,y:106},{id:"I3-107",x:639.4,y:89.9},{id:"I3-108",x:644.2,y:282.1},{id:"I3-109",x:647.5,y:247.2},{id:"I3-110",x:647.4,y:231.1},{id:"I3-111",x:647.3,y:215.4},{id:"I3-112",x:646.3,y:185.3},{id:"I3-113",x:648.9,y:288.6},{id:"I3-114",x:646.5,y:169.6},{id:"I3-115",x:646.5,y:153.1},{id:"I3-116",x:646.4,y:137.8},{id:"I3-117",x:646.3,y:121.6},{id:"I3-118",x:646.2,y:105.9},{id:"I3-119",x:646.2,y:89.8},{id:"I3-120",x:652.3,y:270.8},{id:"I3-121",x:653.8,y:215.4},{id:"I3-122",x:653.1,y:185.3},{id:"I3-123",x:653,y:169.5},{id:"I3-124",x:652.9,y:153},{id:"I3-125",x:652.9,y:137.7},{id:"I3-126",x:652.8,y:121.6},{id:"I3-127",x:652.7,y:105.9},{id:"I3-128",x:652.6,y:89.8},{id:"I3-129",x:656.2,y:254.3},{id:"I3-130",x:657.1,y:277.8},{id:"I3-131",x:658.9,y:237},{id:"I3-132",x:660.9,y:260.9},{id:"I3-133",x:659.3,y:185.2},{id:"I3-134",x:659.2,y:169.5},{id:"I3-135",x:659.1,y:153},{id:"I3-136",x:659.1,y:137.7},{id:"I3-137",x:659,y:121.6},{id:"I3-138",x:658.9,y:105.9},{id:"I3-139",x:658.8,y:89.8},{id:"I3-140",x:663.5,y:243.4},{id:"I3-141",x:665.5,y:267.4},{id:"I3-142",x:666.7,y:225.3},{id:"I3-143",x:665.8,y:185.2},{id:"I3-144",x:665.7,y:169.5},{id:"I3-145",x:665.6,y:153},{id:"I3-146",x:665.5,y:137.7},{id:"I3-147",x:665.7,y:121.6},{id:"I3-148",x:665.4,y:105.9},{id:"I3-149",x:665.6,y:89.8},{id:"I3-150",x:668.3,y:250.1},{id:"I3-151",x:671.6,y:232},{id:"I3-152",x:673.1,y:256.7},{id:"I3-153",x:672.7,y:169.5},{id:"I3-154",x:672.7,y:153},{id:"I3-155",x:672.6,y:137.7},{id:"I3-156",x:672.5,y:121.6},{id:"I3-157",x:672.4,y:105.9},{id:"I3-158",x:676.3,y:238.7},{id:"I3-159",x:680.8,y:245.3},{id:"I3-160",x:679.1,y:153},{id:"I3-161",x:679.1,y:137.6},{id:"I3-162",x:679,y:121.5},{id:"I3-163",x:678.9,y:105.8},{id:"I3-164",x:683.6,y:198},{id:"I3-165",x:685.5,y:137.6},{id:"I3-166",x:685.5,y:121.5},{id:"I3-167",x:685.4,y:105.8},{id:"I3-168",x:688.2,y:204.6},{id:"I3-169",x:690.2,y:187.5},{id:"I3-170",x:692.9,y:211.4},{id:"I3-171",x:695,y:194.1},{id:"I3-172",x:697.6,y:217.9},{id:"I3-173",x:699.6,y:200.7},{id:"I3-174",x:699.5,y:174.6},{id:"I3-175",x:704.3,y:181.2},{id:"I3-176",x:707.3,y:162},{id:"I3-177",x:709.1,y:187.7},{id:"I3-178",x:712,y:168.6},{id:"I3-179",x:714.3,y:151.3},{id:"I3-180",x:716.4,y:175.2},{id:"I3-181",x:719.1,y:158},{id:"I3-182",x:723.7,y:164.4},{id:"I3-183",x:728.5,y:170.9}]}]},Ea=Se.zones.filter(e=>e.id!=="Floor"),ho=Ea.reduce((e,t)=>e+t.seats.length,0),Je=888,Eo=ho+Je;function ie(e,t){const i=new Date(e);return i.setDate(i.getDate()+t),i}function ee(e){return e.toISOString()}const ae=new Date,Fo=[{key:"VIP",name:"VIP석",price:198e3},{key:"R",name:"R석",price:154e3},{key:"S",name:"S석",price:121e3},{key:"A",name:"A석",price:88e3}],Ae={crimson:"linear-gradient(155deg,#3a0a0d 0%, #E31B23 55%, #7a0e14 100%)",rose:"linear-gradient(155deg,#7a0e14 0%, #E31B23 50%, #2b0406 100%)",iceChrome:"linear-gradient(155deg,#0a1420 0%, #2c4a63 45%, #a9c3d4 100%)",flameMono:"linear-gradient(160deg,#050505 0%, #1c1c1c 45%, #8a2f22 100%)",stoneWarm:"linear-gradient(155deg,#382f22 0%, #8f7a5c 55%, #e6d9c2 100%)",neonNight:"linear-gradient(155deg,#14001c 0%, #6a1f72 45%, #2451c9 100%)",editorialRB:"linear-gradient(160deg,#050505 0%, #050505 55%, #c81e2c 120%)",galaxyPurple:"linear-gradient(155deg,#0a0515 0%, #2d1854 45%, #6b3fa0 100%)",pinkNoir:"linear-gradient(155deg,#120010 0%, #4a0033 55%, #ff1493 100%)",royalNavy:"linear-gradient(155deg,#0a1628 0%, #1a3a5c 50%, #c9a84c 100%)",amberNight:"linear-gradient(155deg,#1a0f00 0%, #8b5e3c 50%, #0a1932 100%)",burgundyGold:"linear-gradient(155deg,#2d0a14 0%, #7a0e28 50%, #c9a84c 100%)"},Io={BTS:"/images/posters/poster-bts.png",BLACKPINK:"/images/posters/poster-blackpink.png",SEVENTEEN:"/images/posters/poster-seventeen.png",NewJeans:"/images/posters/poster-newjeans.png",IVE:"/images/posters/poster-ive.png",aespa:"/images/posters/poster-aespa.png",TWICE:"/images/posters/poster-twice.png",EXO:"/images/posters/poster-exo.png","Stray Kids":"/images/posters/poster-straykids.png","NCT DREAM":"/images/posters/poster-nctdream.png","(G)I-DLE":"/images/posters/poster-gidle.png","LE SSERAFIM":"/images/posters/poster-lesserafim.png",RIIZE:"/images/posters/poster-riize.png","Red Velvet":"/images/posters/poster-redvelvet.png",TXT:"/images/posters/poster-txt.png",IU:"/images/posters/poster-iu.png",박효신:"/images/posters/poster-parkhyoshin.png",성시경:"/images/posters/poster-sungsikyung.png",TAEYEON:"/images/posters/poster-taeyeon.png",윤하:"/images/posters/poster-younha.png",AILEE:"/images/posters/poster-ailee.png",김범수:"/images/posters/poster-kimbumsu.png",이승철:"/images/posters/poster-leeseungchul.png",Heize:"/images/posters/poster-heize.png",ZICO:"/images/posters/poster-zico.png",임영웅:"/images/posters/poster-limyoungwoong.png",송가인:"/images/posters/poster-songgain.png",영탁:"/images/posters/poster-youngtak.png",이찬원:"/images/posters/poster-leechanwon.png",장윤정:"/images/posters/poster-jangyunjeong.png",AKMU:"/images/posters/poster-akmu.png",이적:"/images/posters/poster-leejuck.png",백예린:"/images/posters/poster-baekyerin.png",선우정아:"/images/posters/poster-sunwoojunga.png",폴킴:"/images/posters/poster-paulkim.png",YB:"/images/posters/poster-yb.png",자우림:"/images/posters/poster-jaurim.png",DAY6:"/images/posters/poster-day6.png",잔나비:"/images/posters/poster-jannabi.png",NELL:"/images/posters/poster-nell.png"},Tt=["/images/posters/poster-bts.png","/images/posters/poster-blackpink.png","/images/posters/poster-seventeen.png","/images/posters/poster-newjeans.png","/images/posters/poster-ive.png","/images/posters/poster-aespa.png","/images/posters/poster-twice.png","/images/posters/poster-exo.png","/images/posters/poster-straykids.png","/images/posters/poster-nctdream.png","/images/posters/poster-gidle.png","/images/posters/poster-lesserafim.png","/images/posters/poster-riize.png","/images/posters/poster-redvelvet.png","/images/posters/poster-txt.png","/images/posters/poster-iu.png","/images/posters/poster-parkhyoshin.png","/images/posters/poster-sungsikyung.png","/images/posters/poster-taeyeon.png","/images/posters/poster-younha.png","/images/posters/poster-ailee.png","/images/posters/poster-kimbumsu.png","/images/posters/poster-leeseungchul.png","/images/posters/poster-heize.png","/images/posters/poster-zico.png","/images/posters/poster-limyoungwoong.png","/images/posters/poster-songgain.png","/images/posters/poster-youngtak.png","/images/posters/poster-leechanwon.png","/images/posters/poster-jangyunjeong.png","/images/posters/poster-akmu.png","/images/posters/poster-leejuck.png","/images/posters/poster-baekyerin.png","/images/posters/poster-sunwoojunga.png","/images/posters/poster-paulkim.png","/images/posters/poster-yb.png","/images/posters/poster-jaurim.png","/images/posters/poster-day6.png","/images/posters/poster-jannabi.png","/images/posters/poster-nell.png"];function Pe(e){if(!e)return Tt[0];const t=String(e);for(const[a,d]of Object.entries(Io))if(t.includes(a)||t.toLowerCase().includes(a.toLowerCase()))return d;let i=0;for(let a=0;a<t.length;a++)i=(i<<5)-i+t.charCodeAt(a)|0;return Tt[Math.abs(i)%Tt.length]}const ri=[{id:"bts-2027-eternal",artist:"BTS",title:"2027 WORLD TOUR [BEYOND THE SCENE : ETERNAL]",dateStart:ee(ie(ae,9)),dateEnd:ee(ie(ae,10)),venue:"올림픽주경기장",totalSeats:4e4,grad:Ae.galaxyPurple,bookingOpenAt:ee(new Date(Date.now()+40*1e3)),grades:[{key:"VIP",name:"VIP석",price:22e4},{key:"R",name:"R석",price:176e3},{key:"S",name:"S석",price:143e3},{key:"A",name:"A석",price:99e3}],desc:"방탄소년단 BTS의 2027년 월드투어 서울 공연. 7명의 멤버가 함께하는 역대급 스타디움 투어.",hot:!0,views:312504},{id:"iu-2027-goldenhour",artist:"IU",title:"2027 CONCERT [THE GOLDEN HOUR : CURTAIN CALL]",dateStart:ee(ie(ae,-2)),dateEnd:ee(ie(ae,-1)),venue:"올림픽주경기장",totalSeats:3e4,grad:Ae.neonNight,bookingOpenAt:ee(ie(ae,-10)),grades:[{key:"VIP",name:"VIP석",price:198e3},{key:"R",name:"R석",price:154e3},{key:"S",name:"S석",price:121e3},{key:"A",name:"A석",price:88e3}],desc:"솔로 아티스트 IU의 단독 콘서트. 황금빛 조명 아래 펼쳐지는 감동적인 무대.",hot:!0,views:267891},{id:"skz-2026-unchained",artist:"Stray Kids",title:"2026 WORLD TOUR [THUNDEROUS : UNCHAINED]",dateStart:ee(ie(ae,3)),dateEnd:ee(ie(ae,4)),venue:"고척스카이돔",totalSeats:22e3,grad:Ae.editorialRB,bookingOpenAt:ee(ie(ae,-5)),grades:[{key:"VIP",name:"VIP석",price:187e3},{key:"R",name:"R석",price:154e3},{key:"S",name:"S석",price:121e3},{key:"A",name:"A석",price:85e3}],desc:"Stray Kids의 2026 월드투어 서울 공연. 폭발적인 퍼포먼스로 완성하는 무대.",hot:!0,views:197532},{id:"aespa-2027-synkhorizon",artist:"aespa",title:"2027 WORLD TOUR [SUPERNOVA : SYNK HORIZON]",dateStart:ee(ie(ae,21)),dateEnd:ee(ie(ae,22)),venue:"고척스카이돔",totalSeats:2e4,grad:Ae.iceChrome,bookingOpenAt:ee(ie(ae,6)),grades:[{key:"VIP",name:"VIP석",price:176e3},{key:"R",name:"R석",price:143e3},{key:"S",name:"S석",price:11e4},{key:"A",name:"A석",price:77e3}],desc:"aespa의 SYNK HORIZON 투어. 메타버스 세계관을 담은 미래형 무대.",hot:!0,views:178423,seatingType:"archall"},{id:"twice-2027-oncemore",artist:"TWICE",title:"2027 WORLD TOUR [FEEL SPECIAL : ONCE MORE]",dateStart:ee(ie(ae,30)),dateEnd:ee(ie(ae,31)),venue:"올림픽주경기장",totalSeats:3e4,grad:Ae.rose,bookingOpenAt:ee(ie(ae,12)),grades:[{key:"VIP",name:"VIP석",price:187e3},{key:"R",name:"R석",price:154e3},{key:"S",name:"S석",price:121e3},{key:"A",name:"A석",price:88e3}],desc:"TWICE의 ONCE와 함께하는 스페셜 월드투어 서울 공연.",hot:!0,views:156730},{id:"bp-2027-finale",artist:"BLACKPINK",title:"2027 WORLD TOUR [PINK VENOM : THE FINALE]",dateStart:ee(ie(ae,15)),dateEnd:ee(ie(ae,16)),venue:"올림픽주경기장",totalSeats:35e3,grad:Ae.pinkNoir,bookingOpenAt:ee(ie(ae,-1)),grades:[{key:"VIP",name:"VIP석",price:21e4},{key:"R",name:"R석",price:165e3},{key:"S",name:"S석",price:132e3},{key:"A",name:"A석",price:95e3}],desc:"BLACKPINK의 FINALE 월드투어. 4인 4색 퍼포먼스와 히트곡 총집합.",hot:!0,views:298104},{id:"lsf-2027-fearless",artist:"LE SSERAFIM",title:"2027 WORLD TOUR [FEARLESS : FLAME RISES]",dateStart:ee(ie(ae,-1)),dateEnd:ee(ie(ae,-1)),venue:"KSPO DOME",totalSeats:6e3,grad:Ae.flameMono,bookingOpenAt:ee(ie(ae,-20)),grades:[{key:"VIP",name:"VIP석",price:165e3},{key:"R",name:"R석",price:132e3},{key:"S",name:"S석",price:99e3},{key:"A",name:"A석",price:66e3}],desc:"LE SSERAFIM의 소규모 스페셜 단독 공연. 전석 매진으로 취소표 대기열 운영 중.",hot:!0,forceSoldOut:!0,views:209981,seatingType:"standing"},{id:"nj-2027-dreaming",artist:"NewJeans",title:"2027 FAN CONCERT [OMG : SUMMER DREAMING]",dateStart:ee(ie(ae,45)),dateEnd:ee(ie(ae,46)),venue:"KSPO DOME",totalSeats:18e3,grad:Ae.crimson,bookingOpenAt:ee(ie(ae,25)),grades:[{key:"VIP",name:"VIP석",price:165e3},{key:"R",name:"R석",price:132e3},{key:"S",name:"S석",price:99e3},{key:"A",name:"A석",price:71500}],desc:"NewJeans의 팬콘서트. 버니들과 함께하는 특별한 여름 무대.",hot:!1,views:89210},{id:"svt-2026-diamond",artist:"SEVENTEEN",title:"2026 WORLD TOUR [DIAMOND EDGE : REBORN]",dateStart:ee(ie(ae,14)),dateEnd:ee(ie(ae,15)),venue:"KSPO DOME",totalSeats:28e3,grad:Ae.stoneWarm,bookingOpenAt:ee(new Date(Date.now()+2*60*1e3)),grades:[{key:"VIP",name:"VIP석",price:198e3},{key:"R",name:"R석",price:154e3},{key:"S",name:"S석",price:121e3},{key:"A",name:"A석",price:85e3}],desc:"SEVENTEEN의 DIAMOND EDGE : REBORN 월드투어. 13인조 퍼포먼스의 정점.",hot:!0,views:187302,zoneScaleOverride:.001},{id:"lyw-2027-legend",artist:"임영웅",title:"2027 전국투어 [IM HERO : LEGEND TOUR]",dateStart:ee(ie(ae,50)),dateEnd:ee(ie(ae,51)),venue:"올림픽주경기장",totalSeats:35e3,grad:Ae.royalNavy,bookingOpenAt:ee(ie(ae,20)),grades:[{key:"VIP",name:"VIP석",price:176e3},{key:"R",name:"R석",price:143e3},{key:"S",name:"S석",price:11e4},{key:"A",name:"A석",price:77e3}],desc:"임영웅의 전국투어 서울 공연. 대한민국을 대표하는 히어로의 감동 무대.",hot:!0,views:245109},{id:"day6-2026-forever",artist:"DAY6",title:"2026 CONCERT [한 페이지가 될 수 있게 : FOREVER YOUNG]",dateStart:ee(ie(ae,7)),dateEnd:ee(ie(ae,8)),venue:"KSPO DOME",totalSeats:15e3,grad:Ae.amberNight,bookingOpenAt:ee(ie(ae,-3)),grades:[{key:"VIP",name:"VIP석",price:143e3},{key:"R",name:"R석",price:11e4},{key:"S",name:"S석",price:88e3},{key:"A",name:"A석",price:66e3}],desc:"DAY6의 감성 콘서트. 밴드 사운드와 함께하는 잊을 수 없는 페이지.",hot:!1,views:92143},{id:"ive-2026-crown",artist:"IVE",title:"2026 CONCERT [AFTER LIKE : THE CROWN]",dateStart:ee(ie(ae,18)),dateEnd:ee(ie(ae,19)),venue:"KSPO DOME",totalSeats:2e4,grad:Ae.burgundyGold,bookingOpenAt:ee(ie(ae,4)),grades:[{key:"VIP",name:"VIP석",price:176e3},{key:"R",name:"R석",price:143e3},{key:"S",name:"S석",price:11e4},{key:"A",name:"A석",price:77e3}],desc:"IVE의 THE CROWN 콘서트. 자신감 넘치는 퍼포먼스와 화려한 왕관 컨셉.",hot:!0,views:167432},{id:"aespa-2027-synk",artist:"aespa",title:"2027 LIVE TOUR [MY WORLD : SYNK]",dateStart:ee(ie(ae,14)),dateEnd:ee(ie(ae,15)),venue:"올림픽홀",totalSeats:Eo,grad:Ae.neonNight,bookingOpenAt:ee(new Date(Date.now()+30*1e3)),grades:[{key:"VIP",name:"VIP석",price:198e3},{key:"R",name:"R석",price:154e3},{key:"S",name:"S석",price:121e3},{key:"A",name:"A석",price:88e3}],desc:"aespa의 올림픽홀 단독 콘서트. MY WORLD 세계관의 완결 라이브.",hot:!0,views:198234}];function St(e){return ri.find(t=>t.id===e)}const Fa=["일","월","화","수","목","금","토"];function Ia(e){return!Array.isArray(e)||e.length===0?null:e.map(t=>{const i=new Date(t.date+"T00:00:00"),a=Fa[i.getDay()],d=`${i.getMonth()+1}.${String(i.getDate()).padStart(2,"0")} (${a})`;return{date:t.date,time:t.time,label:`${d} 1회 ${t.time}`,shortLabel:d,round:1}})}function Aa(e){if(!e)return[];const t=e.includes("T")?e.split("T")[0]:e,[i,a,d]=t.split("-").map(Number),o=new Date(i,a-1,d);function r(b){return`${b.getFullYear()}-${String(b.getMonth()+1).padStart(2,"0")}-${String(b.getDate()).padStart(2,"0")}`}function n(b){const S=Fa[b.getDay()];return`${b.getMonth()+1}.${String(b.getDate()).padStart(2,"0")} (${S})`}const c=2+(i*1e4+a*100+d)%3,y=["14:00","17:00","19:00"],g=[];for(let b=0;b<c;b++){const S=new Date(o);S.setDate(S.getDate()+b);const E=r(S),v=n(S),k=y[(d+b)%y.length];g.push({date:E,time:k,label:`${v} 1회 ${k}`,shortLabel:v,round:1})}return g}const Ao=[{grade:"VIP",count:4,radius:108,blockW:78,blockH:46,seedPerBlock:42,labels:["가","나","다","라"]},{grade:"R",count:6,radius:182,blockW:72,blockH:52,seedPerBlock:130},{grade:"S",count:9,radius:256,blockW:66,blockH:56,seedPerBlock:210},{grade:"A",count:12,radius:330,blockW:60,blockH:58,seedPerBlock:270}],vi=168;function So(e){const t=o=>e.grades.find(r=>r.key===o)||e.grades[e.grades.length-1],i=e.zoneScaleOverride??Math.max(.5,Math.min(2.2,e.totalSeats/22e3)),a=e.zoneScaleOverride!=null?1:20,d=[];return Ao.forEach((o,r)=>{for(let n=0;n<o.count;n++){const l=-vi/2+(n+.5)*vi/o.count,c=o.labels?o.labels[n]:String(n+1),y=o.labels?`${o.grade} ${o.labels[n]}구역`:`${o.grade} ${n+1}구역`;d.push({id:`${o.grade}-${n+1}`,grade:o.grade,label:y,short:c,price:t(o.grade).price,seed:Math.max(a,Math.round(o.seedPerBlock*i)),venueType:"arena",ring:r,angle:l,radius:o.radius,blockW:o.blockW,blockH:o.blockH})}}),d}const _o=60,me={vip:"#D9481F",gen:"#6E1620",restricted:"#8C8C8C"},ko=[{id:"F1",grade:"VIP",color:me.vip,angle:-20,radius:92,blockW:88,blockH:52},{id:"F2",grade:"VIP",color:me.vip,angle:20,radius:92,blockW:88,blockH:52},{id:"14",grade:"R",color:me.gen,angle:-42,radius:132,blockW:68,blockH:50,wheelchair:!0},{id:"13",grade:"R",color:me.gen,angle:42,radius:132,blockW:68,blockH:50,wheelchair:!0},{id:"15",grade:"R",color:me.gen,angle:-58,radius:170,blockW:66,blockH:52},{id:"12",grade:"R",color:me.gen,angle:58,radius:170,blockW:66,blockH:52},{id:"16",grade:"R",color:me.gen,angle:-72,radius:208,blockW:64,blockH:54},{id:"11",grade:"R",color:me.gen,angle:72,radius:208,blockW:64,blockH:54},{id:"17",grade:"R",color:me.gen,angle:-84,radius:246,blockW:62,blockH:56},{id:"10",grade:"R",color:me.gen,angle:84,radius:246,blockW:62,blockH:56},{id:"18",grade:"A",color:me.restricted,angle:-84,radius:306,blockW:62,blockH:50},{id:"9",grade:"A",color:me.restricted,angle:84,radius:306,blockW:62,blockH:50},{id:"36",grade:"A",color:me.restricted,angle:-84,radius:364,blockW:62,blockH:50},{id:"27",grade:"A",color:me.restricted,angle:84,radius:364,blockW:62,blockH:50},{id:"35",grade:"R",color:me.gen,angle:-86,radius:150,blockW:64,blockH:52},{id:"34",grade:"R",color:me.gen,angle:-90,radius:185,blockW:64,blockH:54},{id:"33",grade:"R",color:me.gen,angle:-94,radius:220,blockW:64,blockH:56},{id:"32",grade:"R",color:me.gen,angle:-98,radius:255,blockW:64,blockH:58},{id:"28",grade:"R",color:me.gen,angle:86,radius:150,blockW:64,blockH:52},{id:"29",grade:"R",color:me.gen,angle:90,radius:185,blockW:64,blockH:54},{id:"30",grade:"R",color:me.gen,angle:94,radius:220,blockW:64,blockH:56},{id:"31",grade:"R",color:me.gen,angle:98,radius:255,blockW:64,blockH:58}];function $o(e){const t=i=>e.grades.find(a=>a.key===i)||e.grades[e.grades.length-1];return ko.map(i=>({...i,label:`${i.id}구역`,price:t(i.grade).price,seed:_o,venueType:"archall"}))}function wo(e){const t=o=>e.grades.find(r=>r.key===o)||e.grades[e.grades.length-1],i=e.grades.find(o=>o.key==="S")||e.grades[e.grades.length-1],a=Math.max(.5,Math.min(2,e.totalSeats/15e3)),d=[420,360,385,340].map(o=>Math.max(60,Math.round(o*a)));return["S1","S2","S3","S4"].map((o,r)=>({id:`STANDING-${o}`,grade:i.key,label:`스탠딩 ${o}구역`,price:t(i.key).price,seed:d[r],venueType:"standing",quadrant:r}))}function Do(e){const t=Array.isArray(e==null?void 0:e.grades)&&e.grades.length?e.grades:Fo,i=a=>t.find(d=>d.key===a)||t[t.length-1];return Se.zones.map(a=>{var d;return{id:a.id,grade:a.grade,label:a.name,seed:a.id==="Floor"?Je:a.seats.length,price:((d=i(a.grade))==null?void 0:d.price)||e.price||0,venueType:"olympichall"}})}function _t(e){return e.venue==="올림픽홀"?Do(e):e.seatingType==="standing"?wo(e):e.seatingType==="archall"?$o(e):So(e)}function Sa(e){const t=Array.isArray(e==null?void 0:e.sections)?e.sections:[],i=(e==null?void 0:e.venue)==="올림픽홀"?new Map(_t(e).map(o=>[o.id,o])):new Map,a=new Map;t.forEach(o=>{const r=o.id||o.name,n=i.get(r),l=o.grade||(n==null?void 0:n.grade)||o.label||o.name,c=String(l||"").replace(/석$/,"").trim();if(!c||a.has(c))return;const y=Number(o.price??(n==null?void 0:n.price)??(e==null?void 0:e.price)??0);a.set(c,Number.isFinite(y)?y:0)}),!a.size&&(e==null?void 0:e.price)!=null&&a.set("일반",Number(e.price)||0);const d=["VIP","R","S","A"];return[...a.entries()].sort(([o],[r])=>{const n=d.indexOf(o),l=d.indexOf(r);return n===-1&&l===-1?o.localeCompare(r,"ko"):n===-1?1:l===-1?-1:n-l}).map(([o,r])=>({grade:o,price:r}))}function mi(e,t){const i=St(e);if(i){const d=String(i.dateStart||"").slice(0,10);return{title:`${i.artist} ${i.title}`,date:d,dates:d?[d]:[]}}const a=t.find(d=>d.eventId===e);if(a){const d=_a(a);return{title:a.eventName,date:d[0]||"",dates:d}}return null}function Et(e){var t;return((t=String(e||"").match(/\d{4}-\d{2}-\d{2}/))==null?void 0:t[0])||""}function _a(e){const i=(Array.isArray(e.sessions)?e.sessions.map(a=>Et(typeof a=="string"?a:a==null?void 0:a.date)):[]).filter(Boolean);if(!i.length){const a=Et(e.eventDate);a&&i.push(a)}return[...new Set(i)]}function Mt(e=[]){const{bookings:t,interests:i}=oe(),a=Array.isArray(e)?e:[],d=[];return a.forEach(o=>{const r=String(o.status||"").toLowerCase();r!=="cancelled"&&_a(o).forEach(l=>{d.push({date:l,type:"performance",title:o.eventName||"공연 일정",concertId:o.eventId})});const n=o.ticketOpenAt||o.bookingOpenAt;if(n&&!["closed","cancelled"].includes(r)&&new Date(n).getTime()>Date.now()){const l=Et(n);if(!l)return;d.push({date:l,type:"upcoming",title:`${o.eventName||"공연"} 예매 오픈`,concertId:o.eventId})}}),t.filter(o=>o.status==="confirmed").forEach(o=>{var l;const r=mi(o.concertId,a);if(!r)return;((l=o.session)!=null&&l.date?[Et(o.session.date)]:r.dates||[r.date]).filter(Boolean).forEach(c=>{d.push({date:c,type:"booked",title:r.title,concertId:o.concertId})})}),i.forEach(o=>{const r=mi(o,a);r&&(r.dates||[r.date]).filter(Boolean).forEach(n=>{d.push({date:n,type:"interest",title:r.title,concertId:o})})}),d}function fi(e){return e==="sold_out"?'<span class="badge badge-dark-red">SOLD OUT</span>':e==="closed"||e==="cancelled"?'<span class="badge badge-outline">마감</span>':'<span class="badge badge-red">예매중</span>'}const Lo={render(e){var A,I;e.innerHTML=`
      <section class="hero-section">
        <div class="container hero-grid">
          <div class="lp-hero" data-slider>
            <div class="lp-stage">
              <div class="lp-disc" data-disc>
                <div class="lp-disc__label" data-disc-label>
                  <span class="lp-disc__label-artist" data-disc-artist></span>
                </div>
                <div class="lp-disc__hole"></div>
              </div>
              <div class="lp-tonearm" data-tonearm>
                <div class="lp-tonearm__arm"></div>
                <div class="lp-tonearm__pivot"></div>
              </div>
            </div>
            <div class="lp-hero__info" data-info><p style="color:#ccc;">공연 정보를 불러오는 중...</p></div>
            <div class="slider__arrows" data-arrows style="display:none;">
              <button class="slider__arrow" data-prev type="button">‹</button>
              <button class="slider__arrow" data-next type="button">›</button>
            </div>
            <div class="slider__dots" data-dots></div>
          </div>
          <div class="cal" data-calendar></div>
        </div>
      </section>

      <section class="hot-section">
        <div class="container">
          <div class="eyebrow">LIVE NOW</div>
          <h2 class="section-title">실시간 HOT 공연</h2>
          <p class="section-sub">지금 가장 많은 관심을 받고 있는 공연이에요</p>
          <div class="hot-grid" id="hot-grid">
            <p style="color:#666">공연 목록 불러오는 중...</p>
          </div>
        </div>
      </section>
    `;const t=e.querySelector("[data-disc]"),i=e.querySelector("[data-disc-label]"),a=e.querySelector("[data-disc-artist]"),d=e.querySelector("[data-tonearm]"),o=e.querySelector("[data-info]"),r=e.querySelector("[data-arrows]"),n=e.querySelector("[data-dots]");let l=[],c=0,y=null,g=null,b=null;function S(){const w=l[c];if(!w)return;const M=Pe(w.eventName||w.eventId);i.style.background=`url('${M}') center/cover no-repeat, linear-gradient(135deg,${w.color||"#667eea,#764ba2"})`,a.textContent=w.eventName;const L=e.querySelector("[data-slider]");L&&(L.style.background=`linear-gradient(90deg, rgba(5,4,4,0.92) 0%, rgba(5,4,4,0.7) 40%, rgba(5,4,4,0.3) 100%), url('${M}') center/cover no-repeat`),o.innerHTML=`
        <div class="lp-hero__badges">${fi(w.status)}<span class="badge badge-gray" style="background:rgba(255,255,255,0.16);color:#fff;">${ue(w.totalSeats||0)}석</span></div>
        <div class="lp-hero__title">${w.eventName}</div>
        <div class="lp-hero__meta">
          <div>공연일<b>${w.eventDate||"-"}</b></div>
          <div>공연장<b>${w.venue||"-"}</b></div>
        </div>
        <button class="btn btn-primary btn-lg" data-book>예매하기</button>
      `,o.querySelector("[data-book]").addEventListener("click",()=>z(`concert/${w.eventId}`)),[...n.querySelectorAll("[data-dot]")].forEach((f,h)=>f.classList.toggle("active",h===c))}function E(w){l.length<=1||(y&&clearTimeout(y),g&&clearTimeout(g),d.classList.add("lp-tonearm--lift"),t.classList.add("lp-disc--swap"),o.classList.add("is-swapping"),y=setTimeout(()=>{c=(w+l.length)%l.length,S(),t.classList.remove("lp-disc--swap"),o.classList.remove("is-swapping")},380),g=setTimeout(()=>{d.classList.remove("lp-tonearm--lift")},520))}function v(w){if(l=w,c=0,b&&clearInterval(b),l.length===0){o.innerHTML='<p style="color:#ccc;">등록된 공연이 없습니다.</p>',r.style.display="none",n.innerHTML="";return}n.innerHTML=l.map((M,L)=>`<span class="slider__dot ${L===0?"active":""}" data-dot="${L}"></span>`).join(""),n.querySelectorAll("[data-dot]").forEach(M=>M.addEventListener("click",()=>E(Number(M.dataset.dot)))),r.style.display=l.length>1?"":"none",S(),l.length>1&&(b=setInterval(()=>E(c+1),5e3))}(A=e.querySelector("[data-next]"))==null||A.addEventListener("click",()=>E(c+1)),(I=e.querySelector("[data-prev]"))==null||I.addEventListener("click",()=>E(c-1));let k=go(e.querySelector("[data-calendar]"),{events:Mt([]),onSelectConcert:w=>z(`concert/${w}`)}),x=[];fetch("/events").then(w=>w.json()).then(w=>{const M=w.events||[];x=M,v(M),k&&k.setEvents(Mt(x));const L=e.querySelector("#hot-grid");if(M.length===0){L.innerHTML='<p style="color:#666">등록된 공연이 없습니다.</p>';return}L.innerHTML=M.map((f,h)=>{const u=Pe(f.eventName||f.eventId),F=Sa(f).map(({grade:D,price:C})=>`${D}석 ${ve(C)}`).join(" · ")||"-";return`
          <div class="hot-card" data-id="${f.eventId}" style="animation-delay:${h*.07}s">
            <div class="hot-card__bg" style="background:url('${u}') center/cover no-repeat, linear-gradient(135deg,${f.color||"#667eea,#764ba2"})"></div>
            <div class="hot-card__rank">${h+1}</div>
            <button type="button" class="badge hot-card__heart" data-heart="${f.eventId}">${mt(f.eventId)?"♥":"♡"}</button>
            <div class="hot-card__overlay"></div>
            <div class="hot-card__info">
              <div class="hot-card__artist">${f.eventName}</div>
              <div class="hot-card__title">${f.eventDate||""}</div>
              <div class="hot-card__detail">
                공연장 &nbsp;${f.venue||"-"}<br/>
                총 좌석 &nbsp;${f.totalSeats||"-"}석<br/>
                티켓 가격 &nbsp;${F}
              </div>
              ${fi(f.status)}
            </div>
          </div>`}).join(""),L.querySelectorAll(".hot-card").forEach(f=>{f.addEventListener("click",()=>z(`concert/${f.dataset.id}`))}),L.querySelectorAll("[data-heart]").forEach(f=>{f.addEventListener("click",h=>{h.stopPropagation(),oi(f.dataset.heart)})})}).catch(()=>{e.querySelector("#hot-grid").innerHTML='<p style="color:#e31b23">공연 목록을 불러오지 못했습니다.</p>',o.innerHTML='<p style="color:#e31b23;">공연 정보를 불러오지 못했습니다.</p>'});const s=nt(()=>{e.querySelectorAll("[data-heart]").forEach(w=>{w.textContent=mt(w.dataset.heart)?"♥":"♡"}),k&&k.setEvents(Mt(x))});return()=>{s(),b&&clearInterval(b),y&&clearTimeout(y),g&&clearTimeout(g)}}};function To(e){return e==="sold_out"?'<span class="badge badge-dark-red">SOLD OUT</span>':e==="closed"||e==="cancelled"?'<span class="badge badge-outline">마감</span>':'<span class="badge badge-red">예매중</span>'}function Mo(e,t){const a=`url('${Pe(e.eventName||e.eventId)}') center/cover no-repeat, linear-gradient(135deg,${e.color||"#667eea,#764ba2"})`;return`
    <div class="card fade-in" style="overflow:hidden;animation-delay:${(t||0)*.05}s;">
      <div style="height:180px;background:${a};position:relative;cursor:pointer;transition:transform .4s ease;" data-open="${e.eventId}" onmouseenter="this.style.transform='scale(1.04)'" onmouseleave="this.style.transform='none'">
        <div style="position:absolute;top:10px;left:10px;">${To(e.status)}</div>
        <button type="button" class="badge" data-heart="${e.eventId}" style="position:absolute;top:10px;right:10px;border:none;background:rgba(0,0,0,0.35);color:#fff;cursor:pointer;">
          ${mt(e.eventId)?"♥":"♡"}
        </button>
      </div>
      <div style="padding:16px;">
        <div style="font-weight:800;font-size:14.5px;margin:4px 0 10px;line-height:1.4;height:38px;overflow:hidden;">${e.eventName}</div>
        <div class="text-secondary" style="font-size:12px;">${e.eventDate||"-"}</div>
        <div class="text-secondary" style="font-size:12px;margin-top:2px;">${e.venue||"-"} · ${Number(e.totalSeats||0).toLocaleString()}석</div>
      </div>
    </div>`}const No={render(e){e.innerHTML=`
      <section class="page-section">
        <div class="container">
          <div class="eyebrow">ALL CONCERTS</div>
          <h2 class="section-title">예매 가능한 공연</h2>
          <p class="section-sub">QUEUING에서 진행 중인 모든 공연을 확인하세요</p>
          <div class="interest-grid mt-24" data-grid>
            <p style="color:#666">공연 목록 불러오는 중...</p>
          </div>
        </div>
      </section>
    `;const t=e.querySelector("[data-grid]");function i(d){if(d.length===0){t.innerHTML='<p style="color:#666">등록된 공연이 없습니다.</p>';return}t.innerHTML=d.map(Mo).join(""),t.querySelectorAll("[data-open]").forEach(o=>{o.addEventListener("click",()=>z(`concert/${o.dataset.open}`))}),t.querySelectorAll("[data-heart]").forEach(o=>{o.addEventListener("click",r=>{r.stopPropagation(),oi(o.dataset.heart)})})}return fetch("/events").then(d=>d.json()).then(d=>i(d.events||[])).catch(()=>{t.innerHTML='<p style="color:#e31b23">공연 목록을 불러오지 못했습니다.</p>'}),nt(()=>{t.querySelectorAll("[data-heart]").forEach(d=>{d.textContent=mt(d.dataset.heart)?"♥":"♡"})})}},Oo="modulepreload",Co=function(e){return"/"+e},bi={},Bo=function(t,i,a){let d=Promise.resolve();if(i&&i.length>0){document.getElementsByTagName("link");const r=document.querySelector("meta[property=csp-nonce]"),n=(r==null?void 0:r.nonce)||(r==null?void 0:r.getAttribute("nonce"));d=Promise.allSettled(i.map(l=>{if(l=Co(l),l in bi)return;bi[l]=!0;const c=l.endsWith(".css"),y=c?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${l}"]${y}`))return;const g=document.createElement("link");if(g.rel=c?"stylesheet":Oo,c||(g.as="script"),g.crossOrigin="",g.href=l,n&&g.setAttribute("nonce",n),document.head.appendChild(g),c)return new Promise((b,S)=>{g.addEventListener("load",b),g.addEventListener("error",()=>S(new Error(`Unable to preload CSS for ${l}`)))})}))}function o(r){const n=new Event("vite:preloadError",{cancelable:!0});if(n.payload=r,window.dispatchEvent(n),!n.defaultPrevented)throw r}return d.then(r=>{for(const n of r||[])n.status==="rejected"&&o(n.reason);return t().catch(o)})},Ro="공연 7일 전까지 취소 가능 · 취소 시점에 따라 수수료가 발생할 수 있습니다.",Ho="관람일 전일 오후 5시(토요일은 오전 11시) 이후 또는 관람일 당일 예매 건은 예매 후 취소·변경·환불이 불가합니다. 토요일이 공휴일인 경우 토요일 오전 11시 기준이 적용됩니다.",Po=[{period:"예매 후 7일 이내 (공연일 10일 전까지)",fee:"없음"},{period:"예매 후 8일 ~ 관람일 10일 전",fee:"공연권 4,000원 · 입장권 2,000원 (티켓금액 10% 이내)"},{period:"관람일 9일 전 ~ 7일 전",fee:"티켓 금액의 10%"},{period:"관람일 6일 전 ~ 3일 전",fee:"티켓 금액의 20%"},{period:"관람일 2일 전 ~ 1일 전",fee:"티켓 금액의 30%"},{period:"관람일 당일",fee:"취소 및 환불 불가"}],qo="※ 취소 수수료 및 환불 기준은 공연별 판매 정책에 따라 달라질 수 있습니다. 정확한 환불 조건은 해당 공연의 상세 페이지에서 확인해주세요.",Uo=[{method:"신용카드",desc:"취소 처리 완료 후 4~5일 뒤 카드사 취소가 확인됩니다. 취소 시점과 카드사에 따라 환급 방법·기간이 다를 수 있습니다."},{method:"무통장 입금",desc:"접수 완료 후 5~7일 이내 처리됩니다. 반드시 예매자 본인 명의 계좌로만 환불 가능합니다."},{method:"휴대폰 결제",desc:"당월 예매건만 사이트에서 취소 가능하며, 그 외 기간은 고객센터 문의가 필요합니다."},{method:"예매권",desc:"공연예매권은 취소가 불가하며, 문화예매권은 사용한 금액만큼 즉시 복원됩니다."}],jo="공연이 주최 측의 사정으로 취소되는 경우 해당 공연의 정책에 따라 티켓 금액을 환불합니다.",Go="공연 일정 또는 장소가 변경되는 경우, 변경된 공연을 관람할 수 없는 사용자를 대상으로 별도의 취소 및 환불 절차가 제공될 수 있습니다.",Wo='결제 제한시간 내에 결제를 완료하지 않으면 좌석은 자동으로 해제되어 다른 사용자가 다시 선택할 수 있게 됩니다. 이는 "환불"이 아니라 "좌석 예약 시간 만료"로 처리되며, 결제 전이므로 수수료도 발생하지 않습니다.',zo=["취소표는 1인 1매만 구매할 수 있습니다.","Private Link를 통해서만 취소표를 예매할 수 있습니다.","Private Link는 발급 후 5분 동안만 유효합니다.","Private Link가 만료되면 해당 링크로는 예매할 수 없습니다.","Private Link로 티켓을 확보하면 해당 링크는 즉시 사용이 종료됩니다.","이미 사용된 Private Link는 다시 사용할 수 없습니다."],Yo="Private Link의 5분 제한과, 결제 완료 후 티켓의 환불 가능 기간은 서로 다른 개념입니다. Private Link가 만료되어도 이미 결제한 티켓에는 공연별 환불 정책이 정상적으로 적용됩니다.";function ka(e){return e>=10?0:e>=7?.1:e>=3?.2:e>=1?.3:1}function Vo(){return`
    <section class="policy-section">
      <h4>예매 취소</h4>
      <p>${Ho}</p>
    </section>

    <section class="policy-section">
      <h4>취소 수수료</h4>
      <table class="policy-table">
        ${Po.map(e=>`<tr><td>${e.period}</td><td>${e.fee}</td></tr>`).join("")}
      </table>
      <p class="policy-note">${qo}</p>
    </section>

    <section class="policy-section">
      <h4>환불 방법</h4>
      ${Uo.map(e=>`<div class="policy-kv"><b>${e.method}</b><span>${e.desc}</span></div>`).join("")}
    </section>

    <section class="policy-section">
      <h4>공연 취소</h4>
      <p>${jo}</p>
    </section>

    <section class="policy-section">
      <h4>공연 일정 변경</h4>
      <p>${Go}</p>
    </section>

    <section class="policy-section">
      <h4>좌석 결제 제한시간</h4>
      <p>${Wo}</p>
    </section>

    <section class="policy-section">
      <h4>취소표 관련 규정</h4>
      <ul class="policy-list">
        ${zo.map(e=>`<li>${e}</li>`).join("")}
      </ul>
    </section>

    <section class="policy-section">
      <h4>Private Link 관련 규정</h4>
      <p>${Yo}</p>
    </section>
  `}function Ko(){fe({title:"취소 및 환불 규정",size:"modal-lg",bodyHtml:Vo(),footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close>확인했습니다</button>'})}function $a(e,{compact:t=!1}={}){e.innerHTML=`
    <div class="refund-summary ${t?"refund-summary--compact":""}">
      <div class="refund-summary__text">
        <div class="refund-summary__title">취소 및 환불 규정</div>
        <div class="refund-summary__desc">${Ro}</div>
      </div>
      <button type="button" class="btn btn-outline btn-sm" data-open-refund-policy>자세히 보기</button>
    </div>
  `,e.querySelector("[data-open-refund-policy]").addEventListener("click",Ko)}const Jo="dev-only-secret-change-me";function Nt(e){const t=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];let i=1779033703,a=3144134277,d=1013904242,o=2773480762,r=1359893119,n=2600822924,l=528734635,c=1541459225;const y=(k,x)=>k>>>x|k<<32-x,g=e.length,b=g*8,S=new Uint8Array(g+9+63&-64);S.set(e),S[g]=128;const E=new DataView(S.buffer);E.setUint32(S.length-4,b,!1);for(let k=0;k<S.length;k+=64){const x=new Int32Array(64);for(let u=0;u<16;u++)x[u]=E.getInt32(k+u*4,!1);for(let u=16;u<64;u++){const F=y(x[u-15]>>>0,7)^y(x[u-15]>>>0,18)^x[u-15]>>>3,D=y(x[u-2]>>>0,17)^y(x[u-2]>>>0,19)^x[u-2]>>>10;x[u]=x[u-16]+F+x[u-7]+D|0}let s=i,A=a,I=d,w=o,M=r,L=n,f=l,h=c;for(let u=0;u<64;u++){const F=y(M>>>0,6)^y(M>>>0,11)^y(M>>>0,25),D=M&L^~M&f,C=h+F+D+t[u]+x[u]|0,R=y(s>>>0,2)^y(s>>>0,13)^y(s>>>0,22),p=s&A^s&I^A&I,m=R+p|0;h=f,f=L,L=M,M=w+C|0,w=I,I=A,A=s,s=C+m|0}i=i+s|0,a=a+A|0,d=d+I|0,o=o+w|0,r=r+M|0,n=n+L|0,l=l+f|0,c=c+h|0}const v=new Uint8Array(32);return new DataView(v.buffer).setUint32(0,i),new DataView(v.buffer).setUint32(4,a),new DataView(v.buffer).setUint32(8,d),new DataView(v.buffer).setUint32(12,o),new DataView(v.buffer).setUint32(16,r),new DataView(v.buffer).setUint32(20,n),new DataView(v.buffer).setUint32(24,l),new DataView(v.buffer).setUint32(28,c),v}function Xo(e,t){let a=e.length>64?Nt(e):e;const d=new Uint8Array(64);d.set(a);const o=new Uint8Array(64+t.length),r=new Uint8Array(96);for(let l=0;l<64;l++)o[l]=d[l]^54,r[l]=d[l]^92;o.set(t,64);const n=Nt(o);return r.set(n,64),Nt(r)}function wa(e){let t="";for(let i=0;i<e.length;i++)t+=String.fromCharCode(e[i]);return btoa(t).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}function gi(e){return wa(new TextEncoder().encode(JSON.stringify(e)))}function Da(e,t){const i=Math.floor(Date.now()/1e3),a=gi({alg:"HS256",typ:"JWT"}),d=gi({userId:e,nickname:t,iat:i,exp:i+3600}),o=`${a}.${d}`,r=Xo(new TextEncoder().encode(Jo),new TextEncoder().encode(o));return`${o}.${wa(r)}`}function Zo(e,t,i,{onMessage:a,onOpen:d,onClose:o,onError:r}={}){const n=Da(t,i),l=`ws://${location.host}/ws/chat/${e}?token=${n}`;console.log("[Chat] 연결 시도:",l.replace(/token=.*/,"token=***"));const c=new WebSocket(l);return c.addEventListener("open",()=>{console.log("[Chat] 연결 성공"),d==null||d()}),c.addEventListener("message",y=>{try{a==null||a(JSON.parse(y.data))}catch{}}),c.addEventListener("close",y=>{console.log("[Chat] 연결 종료 code:",y.code,"reason:",y.reason),o==null||o()}),c.addEventListener("error",y=>{console.error("[Chat] 에러 발생:",y),r==null||r()}),{sendMessage(y){c.readyState===WebSocket.OPEN&&c.send(y)},close(){c.close()},get readyState(){return c.readyState},ws:c}}function Qo(e,t,i,{onMessage:a,onOpen:d,onClose:o}={}){const r=Da(t,i),n=new WebSocket(`ws://${location.host}/ws/seats/${e}?token=${r}`);return n.addEventListener("open",()=>d==null?void 0:d()),n.addEventListener("message",l=>{try{a==null||a(JSON.parse(l.data))}catch{}}),n.addEventListener("close",()=>o==null?void 0:o()),{ws:n,close(){n.close()}}}function hi(e){const t=document.createElement("div");return t.textContent=e,t.innerHTML}const ed=5e3;function td(e,{concertId:t,artist:i}){const a=[];let d=0,o=null,r=null,n=0,l=null,c=!1;async function y(){try{await fetch("/rooms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({eventId:t,name:`${i} 채팅방`})})}catch{}}async function g(){if(c||(await y(),c))return;const x=oe().user,s=(x==null?void 0:x.userId)||"anonymous",A=(x==null?void 0:x.name)||"게스트";try{o=Zo(t,s,A,{onMessage:I=>{if(I.type==="chat"){const w=oe().user;a.push({id:`${I.ts}-${Math.random()}`,author:I.author,text:I.message,mine:!!(w&&I.author===w.name)}),a.length>200&&a.shift(),E()}},onClose:()=>{c||(l=setTimeout(g,3e3))},onError:()=>{o&&o.close()}})}catch{c||(l=setTimeout(g,3e3))}}function b(){e.innerHTML=`
      <div class="live-panel__viewers">
        <span class="live-dot"></span>
        현재 <b data-viewers class="num-mono">${ue(d)}</b>명이 함께 보고 있어요
      </div>
      <div class="live-chat">
        <div class="live-chat__head">
          <span>실시간 채팅</span>
          <span class="badge badge-gray">${i} 전용방</span>
        </div>
        <div class="live-chat__list" data-list></div>
        <form class="live-chat__form" data-form>
          <input type="text" data-input maxlength="120" placeholder="${Le()?"메시지를 입력하세요":"로그인 후 채팅에 참여할 수 있어요"}" />
          <button type="submit" class="btn btn-primary btn-sm" data-send>전송</button>
        </form>
        <div class="live-chat__notice" data-cooldown-notice>채팅 도배 방지를 위해 메시지 전송 후 5초 뒤에 다음 메시지를 보낼 수 있습니다.</div>
      </div>
    `,E();const x=e.querySelector("[data-input]"),s=e.querySelector("[data-send]");e.querySelector("[data-form]").addEventListener("submit",A=>{if(A.preventDefault(),s.disabled)return;const I=x.value.trim();if(I){if(!Le()){We(`concert/${t}`),z("login");return}!o||o.readyState!==WebSocket.OPEN||(o.sendMessage(I),x.value="",S())}})}function S(){const x=e.querySelector("[data-input]"),s=e.querySelector("[data-send]"),A=e.querySelector("[data-cooldown-notice]");if(!x||!s)return;n=Date.now()+ed,x.disabled=!0,s.disabled=!0,r&&clearInterval(r);function I(){const w=n-Date.now();if(w<=0){clearInterval(r),r=null,x.disabled=!1,s.disabled=!1,s.textContent="전송",A&&(A.textContent="채팅 도배 방지를 위해 메시지 전송 후 5초 뒤에 다음 메시지를 보낼 수 있습니다.");return}s.textContent=`${Math.ceil(w/1e3)}초`,A&&(A.textContent=`다음 메시지를 보내려면 ${Math.ceil(w/1e3)}초 기다려주세요.`)}I(),r=setInterval(I,200)}function E(){const x=e.querySelector("[data-list]");x&&(x.innerHTML=a.length?a.map(s=>`
        <div class="chat-msg ${s.mine?"chat-msg--mine":""}">
          <div class="chat-msg__author">${hi(s.author)}</div>
          <div class="chat-msg__bubble">${hi(s.text)}</div>
        </div>`).join(""):'<div class="chat-msg__empty">아직 채팅이 없어요. 가장 먼저 인사해보세요!</div>',x.scrollTop=x.scrollHeight)}function v(){fetch(`/rooms/${t}`).then(x=>x.ok?x.json():null).then(x=>{if(!x||c)return;d=x.chatConnections||0;const s=e.querySelector("[data-viewers]");s&&(s.textContent=ue(d))}).catch(()=>{})}b(),g(),v();const k=setInterval(v,5e3);return()=>{c=!0,clearInterval(k),r&&clearInterval(r),l&&clearTimeout(l),o&&o.close()}}const Zt=14,Ce=20,id=30,Ei=280,Qt=36,ei=18,ad=ei+Qt+40,od=.25,La=5,dd=.4,nd=.0012,Fi=1.25,Ii=4,sd=Zt/2+8,Ft=50,Oe="#7C4DFF",Ai="#5E35D8",Si="#9E9E9E";function Ue(e,t){const i=parseInt(e.slice(1,3),16),a=parseInt(e.slice(3,5),16),d=parseInt(e.slice(5,7),16);return`rgba(${i},${a},${d},${t})`}const _i={VIP:0,R:1,S:2,A:3};function rd(e,t){const i=[],a=new Set,d={};e.forEach((S,E)=>{a.has(S.grade)||(a.add(S.grade),i.push(S.grade),d[S.grade]={...S,_idx:E})}),i.sort((S,E)=>{const v=_i[S]??100+d[S]._idx,k=_i[E]??100+d[E]._idx;return v-k});const o={};i.forEach(S=>o[S]=[]),t.forEach(S=>{o[S.grade]&&o[S.grade].push(S)});const r=Math.max(40,Math.ceil(Math.sqrt(t.length)*1.6)),n=r*Ce,l=n/2;let c=ad;const y=[],g=[];i.forEach(S=>{const E=o[S];if(!E.length)return;const v=d[S],k=c;let x=0;for(;x<E.length;){const s=Math.min(r,E.length-x),A=s*Ce,I=l-A/2+Ce/2;for(let w=0;w<s;w++)E[x]._x=I+w*Ce,E[x]._y=c,E[x]._displayNum=x+1,y.push(E[x]),x++;c+=Ce}g.push({grade:S,label:v.label||S,yStart:k,yEnd:c-Ce}),c+=id});const b=40;return{seats:y,zones:g,canvasW:n+b*2,canvasH:c+b,offsetX:b,cx:l+b}}function ld(e){const{zones:t,canvasW:i,canvasH:a,cx:d}=e,o=t.map(n=>`<rect x="20" y="${n.yStart-Ce/2}" width="${i-40}" height="${n.yEnd-n.yStart+Ce}" rx="8" fill="${Si}" fill-opacity="0.06" stroke="${Si}" stroke-opacity="0.12" stroke-width="1"/>`).join(""),r=t.map(n=>`<text x="14" y="${(n.yStart+n.yEnd)/2+4}" font-size="13" font-weight="800" fill="#666" text-anchor="start" opacity="0.7">${n.label}</text>`).join("");return`<svg width="${i}" height="${a}" viewBox="0 0 ${i} ${a}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="stg" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#444"/><stop offset="100%" stop-color="#181818"/></linearGradient></defs>
    <rect x="${d-Ei/2}" y="${ei}" width="${Ei}" height="${Qt}" rx="8" fill="url(#stg)"/>
    <text x="${d}" y="${ei+Qt/2+5}" text-anchor="middle" fill="#fff" font-size="13" font-weight="800" letter-spacing="4">S T A G E</text>
    ${o}${r}
  </svg>`}function Ze(e,t,i){const a=i.clientWidth,d=i.clientHeight,o=t.canvasW*e.scale,r=t.canvasH*e.scale;o<=a?e.tx=(a-o)/2:e.tx=Math.min(0,Math.max(a-o,e.tx)),r<=d?e.ty=(d-r)/2:e.ty=Math.min(0,Math.max(d-r,e.ty))}function ki(e,t,i,a){const d=i.clientWidth,o=i.clientHeight,r=d/t.canvasW,n=o/t.canvasH;e.scale=Math.min(r,n)*.92,e.scale=Math.max(a||.005,Math.min(La,e.scale)),Ze(e,t,i)}function cd(e,t,i,a){const d={sold:"매진",holding:"다른 사용자 선택 중",mine:"내 좌석",available:"선택 가능"},o=a||i.label||i.grade,r=i._block?` (${i._block})`:"",n=`${i._displayNum||i.seatNum}번`;e.innerHTML=`<strong>${o}${r}</strong><br>${n}<br><span style="opacity:0.7">${d[i.status]||"선택 가능"}</span>`,e.classList.add("show"),e.style.left=`${t.clientX+14}px`,e.style.top=`${t.clientY-10}px`}function yd(e){e.classList.remove("show")}const xd=1426,ud=1103,pd=1.27,vd=70,md=.9025,fd=1057,It=7,At=8,bd=Se.zones.filter(e=>e.id!=="Floor"),Ot=Se.zones.find(e=>e.id==="Floor"),je={x:560,y:180,width:289,height:195,cols:37,rows:24},gd=je.cols*je.rows,Ct={B1:48*Math.PI/180,B2:48*Math.PI/180,D1:-48*Math.PI/180,D2:-48*Math.PI/180};function hd(e){const t=new Set;return e.forEach(i=>{e.some(d=>{if(d===i)return!1;const o=Math.abs(d.x-i.x),r=Math.abs(d.y-i.y);return o>=4&&o<=11&&r<2})||t.add(i.id)}),t}function $i(e){return{x:e.x*pd+vd,y:fd-e.y*md}}function wi(e,t,i){return e==="I1"&&(t.id==="I1-76"||i!=null&&i.has(t.id))?Ct.B1:e==="I3"&&(i!=null&&i.has(t.id))?Ct.D1:Ct[e]||0}function Ed(e,t){const{x:i,y:a,width:d,height:o,cols:r,rows:n}=je,l=d/r,c=o/n,y=Math.floor(t/n),g=t%n;let b=0;for(let S=0;S<n;S++){const E=Math.min(r,y+(S<g?1:0));if(e<b+E){const v=e-b,k=(r-E)*l/2;return{x:i+k+(v+.5)*l,y:a+(S+.5)*c}}b+=E}return{x:i+d/2,y:a+o/2}}function Fd(e,t){const i={};t.forEach(y=>{const g=y.section||y.grade;i[g]||(i[g]=[]),i[g].push(y)});const a=[],d=[],o=[];let r=0;bd.forEach(y=>{const g=i[y.id]||[],b=new Map(y.seats.map(A=>{const I=A.id.match(/-(\d+)$/);return[I?Number(I[1]):null,A]})),S=y.id==="I1"||y.id==="I3"?hd(y.seats):null,E=new Map(y.seats.map(A=>{const I=$i(A);return[A.id,{x:I.x,y:I.y,angle:wi(y.id,A,S)}]}));let v=0,k=0,x=0;for(let A=0;A<g.length;A++){const I=g[A],M=String(I.id||I.seatId||"").match(/-(\d+)$/),L=M?Number(M[1]):A+1,f=b.get(L);if(!f)continue;const h=E.get(f.id)||$i(f);I._x=h.x,I._y=h.y,I._sw=It,I._sh=At,I._angle=h.angle??wi(y.id,f,S),I._displayNum=L,I._block=y.id,a.push(I),x+=1,v+=I._x,k+=I._y}r+=Math.max(0,g.length-x),x>0&&d.push({id:y.id,x:v/x,y:k/x});const s=e.find(A=>A.id===y.id||A.grade===y.id);o.push({id:y.id,grade:y.grade,label:(s==null?void 0:s.label)||y.name})});const n=i.Floor||[],l=gd,c=Math.min(n.length,l);for(let y=0;y<c;y++){const g=n[y],b=Ed(y,c);g._x=b.x,g._y=b.y,g._sw=It,g._sh=At,g._angle=0,g._displayNum=y+1,g._block="Floor",a.push(g)}if(r+=Math.max(0,n.length-l),c>0){d.push({id:"Floor",x:je.x+je.width/2,y:je.y+je.height/2});const y=e.find(g=>g.id==="Floor"||g.grade==="Floor");o.push({id:"Floor",grade:(Ot==null?void 0:Ot.grade)||"VIP",label:(y==null?void 0:y.label)||"Floor 구역"})}return r&&console.warn(`[SeatMap] CSV 좌표가 없는 올림픽홀 좌석 ${r}개는 렌더링하지 않습니다.`),{seats:a,zones:o,canvasW:xd,canvasH:ud,offsetX:0,isOlympicHall:!0,bgImageUrl:"/images/seatmaps/올림픽홀-interactive-bg.png",zoneLabels:d}}function Id(e){const{canvasW:t,canvasH:i,stageX:a,stageY:d,stageW:o,stageH:r,zoneLabels:n}=e,l=(n||[]).map(c=>`<text x="${c.x}" y="${c.y}" text-anchor="middle" dominant-baseline="central" font-size="20" font-weight="800" fill="#555" opacity="0.5">${c.id}</text>`).join("");return`<svg width="${t}" height="${i}" viewBox="0 0 ${t} ${i}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="ohstg" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#e74c3c"/><stop offset="100%" stop-color="#c0392b"/></linearGradient></defs>
    <rect x="${a}" y="${d}" width="${o}" height="${r}" rx="8" fill="url(#ohstg)"/>
    <text x="${a+o/2}" y="${d+r/2+5}" text-anchor="middle" fill="#fff" font-size="20" font-weight="800" letter-spacing="6">S T A G E</text>
    ${l}
  </svg>`}function Ad(e){const t=new Map;return e.forEach((i,a)=>{const d=Math.floor(i._x/Ft),o=Math.floor(i._y/Ft),r=d<<16|o&65535;let n=t.get(r);n||(n=[],t.set(r,n)),n.push(a)}),t}function Di(e,t,i,a){const d=Math.floor(i/Ft),o=Math.floor(a/Ft);let r=null,n=1/0;for(let l=-1;l<=1;l++)for(let c=-1;c<=1;c++){const y=d+l<<16|o+c&65535,g=e.get(y);if(g)for(let b=0;b<g.length;b++){const S=t[g[b]],E=Math.hypot(S._x-i,S._y-a);E<n&&(n=E,r=S)}}return n<=sd?r:null}function li(e,{sections:t,seats:i,onSeatClick:a,cancelMode:d=!1,readOnly:o=!1,venue:r}){const n=r==="올림픽홀",l=n?Fd(t,i):rd(t,i),c=new Map;i.forEach(T=>c.set(T.id,T));const y=new Map;l.seats.forEach(T=>y.set(T.id,T));const g=e.closest(".seatmap-scroll");g&&(g.style.maxHeight="none",g.style.overflow="hidden",g.style.padding="0",g.style.border="none",g.style.background="none"),e.style.padding="0";const b=Object.fromEntries(t.map(T=>[T.grade,T.color||Oe])),S=o?`<span class="vm-legend__item"><span class="vm-legend__dot" style="background:${Oe};border-color:${Ai}"></span>좌석 배치도</span>`:`<span class="vm-legend__item">선택 가능 (구역별 색상은 우측 목록 참고)</span>
       <span class="vm-legend__item"><span class="vm-legend__dot" style="background:var(--color-primary);border-color:var(--color-primary-dark)"></span>내 좌석</span>
       <span class="vm-legend__item"><span class="vm-legend__dot" style="background:#F0A030;border-color:#C88010"></span>선택중</span>
       <span class="vm-legend__item"><span class="vm-legend__dot" style="background:#BCBCBC;border-color:#999"></span>매진</span>`;e.innerHTML=`
    <div class="vm-legend">${S}</div>
    <div class="vm-viewport" data-viewport>
      <canvas data-seat-canvas style="position:absolute;top:0;left:0;width:100%;height:100%"></canvas>
      <div class="vm-zoom-controls">
        <button type="button" class="vm-zoom-btn" data-zoom-in aria-label="확대">+</button>
        <button type="button" class="vm-zoom-btn" data-zoom-out aria-label="축소">−</button>
        <button type="button" class="vm-zoom-btn vm-zoom-btn--reset" data-zoom-reset aria-label="원래 크기로">⟲</button>
      </div>
    </div>
    <div class="vm-tooltip" data-tooltip></div>
    <div class="vm-zoom-hint" data-hint>마우스 스크롤로 확대/축소 · 드래그로 이동</div>
  `;const E=e.querySelector("[data-seat-canvas]"),v=e.querySelector("[data-viewport]"),k=e.querySelector("[data-tooltip]"),x=e.querySelector("[data-hint]"),s=E.getContext("2d"),A=new Image;let I=!1;if(A.onload=()=>{I=!0,p()},l.bgImageUrl)A.src=l.bgImageUrl;else{const T=n?Id(l):ld(l);A.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(T)}const w=Ad(l.seats);function M(T,j){return{x:(T-L.tx)/L.scale,y:(j-L.ty)/L.scale}}const L={scale:1,tx:0,ty:0};let f=null,h=0,u=!1,F=!1;const D=l.isOlympicHall?.12:dd,C=Math.min(od,Math.min(v.clientWidth/l.canvasW,v.clientHeight/l.canvasH)*.85);ki(L,l,v,C);function R(){const T=window.devicePixelRatio||1,j=v.clientWidth,V=v.clientHeight;(E.width!==j*T||E.height!==V*T)&&(E.width=j*T,E.height=V*T)}function p(){if(F)return;const T=window.devicePixelRatio||1,j=v.clientWidth,V=v.clientHeight;R(),s.save(),s.scale(T,T),s.clearRect(0,0,j,V),s.save(),s.translate(L.tx,L.ty),s.scale(L.scale,L.scale),I&&s.drawImage(A,0,0,l.canvasW,l.canvasH);const ce=Zt/2,he=L.scale>=D;if(l.isOlympicHall&&!he){s.save(),s.fillStyle="rgba(0,0,0,0.45)";const $=340,_=46,N=l.canvasW/2-$/2,U=l.canvasH-100,W=12;s.beginPath(),s.moveTo(N+W,U),s.lineTo(N+$-W,U),s.quadraticCurveTo(N+$,U,N+$,U+W),s.lineTo(N+$,U+_-W),s.quadraticCurveTo(N+$,U+_,N+$-W,U+_),s.lineTo(N+W,U+_),s.quadraticCurveTo(N,U+_,N,U+_-W),s.lineTo(N,U+W),s.quadraticCurveTo(N,U,N+W,U),s.closePath(),s.fill(),s.fillStyle="#fff",s.font="bold 16px sans-serif",s.textAlign="center",s.textBaseline="middle",s.fillText("스크롤하여 확대하면 좌석이 나타납니다",l.canvasW/2,U+_/2),s.restore()}const Ee=!!l.isOlympicHall,ye=[],xe=[],pe=[],$e=[],we={};for(let $=0;$<l.seats.length;$++){const _=l.seats[$],N=c.get(_.id),U=N?N.status:"available";if(U==="sold"){xe.push(_);continue}if(U==="holding"){pe.push(_);continue}if(U==="mine"){$e.push(_);continue}if(Ee)ye.push(_);else{const W=b[_.grade]||Oe;we[W]||(we[W]=[]),we[W].push(_)}}if(he){if(Ee){const $=(_,N,U,W,re=1)=>{const Q=(_._sw||It)*re,X=(_._sh||At)*re,Te=Math.min(Q,X)/2;s.save(),s.translate(_._x,_._y),s.rotate(_._angle||0),s.fillStyle=N,s.strokeStyle=U,s.lineWidth=W,s.beginPath(),s.arc(0,0,Te,0,Math.PI*2),s.fill(),s.stroke(),s.restore()};for(let _=0;_<ye.length;_++)$(ye[_],Ue(Oe,.2),Ue(Ai,.9),1);if(xe.length){s.globalAlpha=.5;for(let _=0;_<xe.length;_++)$(xe[_],"#BCBCBC","#999",2);s.globalAlpha=1}if(pe.length){s.globalAlpha=.55+.45*Math.abs(Math.sin(h));for(let _=0;_<pe.length;_++)$(pe[_],"#F0A030","#C88010",2);s.globalAlpha=1}for(let _=0;_<$e.length;_++){const N=$e[_],U=N._sw||It,W=N._sh||At,re=Math.min(U,W)*1.7;s.save(),s.translate(N._x,N._y),s.rotate(N._angle||0),s.shadowColor="rgba(0,0,0,0.3)",s.shadowBlur=8,s.fillStyle="#fff",s.beginPath(),s.arc(0,0,re/2+2,0,Math.PI*2),s.fill(),s.shadowBlur=0,s.fillStyle=Oe,s.beginPath(),s.arc(0,0,re/2,0,Math.PI*2),s.fill(),s.strokeStyle="rgba(255,255,255,0.7)",s.lineWidth=1.5,s.stroke();const Q=re*.3;s.strokeStyle="#fff",s.lineWidth=1.8,s.lineCap="round",s.lineJoin="round",s.beginPath(),s.moveTo(-Q*.5,0),s.lineTo(-Q*.1,Q*.5),s.lineTo(Q*.6,-Q*.4),s.stroke(),s.restore()}}else{for(const $ in we){const _=we[$];s.fillStyle=Ue($,.18),s.beginPath();for(let N=0;N<_.length;N++){const U=_[N];s.moveTo(U._x+ce,U._y),s.arc(U._x,U._y,ce,0,6.2832)}s.fill(),s.strokeStyle=$,s.lineWidth=2,s.stroke()}if(xe.length){s.globalAlpha=.5,s.fillStyle="#BCBCBC",s.beginPath();for(let $=0;$<xe.length;$++){const _=xe[$];s.moveTo(_._x+ce,_._y),s.arc(_._x,_._y,ce,0,6.2832)}s.fill(),s.strokeStyle="#999",s.lineWidth=2,s.stroke(),s.globalAlpha=1}if(pe.length){s.globalAlpha=.55+.45*Math.abs(Math.sin(h)),s.fillStyle="#F0A030",s.beginPath();for(let $=0;$<pe.length;$++){const _=pe[$];s.moveTo(_._x+ce,_._y),s.arc(_._x,_._y,ce,0,6.2832)}s.fill(),s.strokeStyle="#C88010",s.lineWidth=2,s.stroke(),s.globalAlpha=1}for(let $=0;$<$e.length;$++){const _=$e[$],N=b[_.grade]||Oe,U=ce*1.7;s.save(),s.shadowColor="rgba(0,0,0,0.25)",s.shadowBlur=10,s.fillStyle="#fff",s.beginPath(),s.arc(_._x,_._y,U+3,0,6.2832),s.fill(),s.shadowBlur=0,s.fillStyle=N,s.beginPath(),s.arc(_._x,_._y,U,0,6.2832),s.fill(),s.strokeStyle="rgba(255,255,255,0.7)",s.lineWidth=2.5,s.stroke();const W=U*.55;s.strokeStyle="#fff",s.lineWidth=2.2,s.lineCap="round",s.lineJoin="round",s.beginPath(),s.moveTo(_._x-W*.35,_._y+W*.05),s.lineTo(_._x-W*.05,_._y+W*.35),s.lineTo(_._x+W*.4,_._y-W*.3),s.stroke(),s.restore()}}s.globalAlpha=1}if(he&&f){const $=c.get(f.id),_=$?$.status:"available";if(_!=="sold"&&_!=="holding"&&_!=="mine"){if(s.save(),Ee){const N=(f._sw||10)+2,U=(f._sh||10)+2;s.translate(f._x,f._y),s.rotate(f._angle||0),s.shadowColor="rgba(0,0,0,0.2)",s.shadowBlur=6,s.fillStyle=Ue(Oe,.5),s.fillRect(-N/2,-U/2,N,U),s.shadowBlur=0,s.strokeStyle=Ue(Oe,.9),s.lineWidth=1.5,s.strokeRect(-N/2-1,-U/2-1,N+2,U+2)}else{const N=b[f.grade]||Oe;s.shadowColor="rgba(0,0,0,0.2)",s.shadowBlur=8,s.fillStyle=Ue(N,.35),s.beginPath(),s.arc(f._x,f._y,ce+1,0,6.2832),s.fill(),s.shadowColor="transparent",s.shadowBlur=0,s.strokeStyle=Ue(N,.6),s.lineWidth=3,s.beginPath(),s.arc(f._x,f._y,ce+3,0,6.2832),s.stroke()}s.restore()}}s.restore(),s.restore()}function m(){if(u||F)return;u=!0;function T(){!u||F||(h+=.06,p(),requestAnimationFrame(T))}requestAnimationFrame(T)}function O(){u=!1}function H(){let T=!1;for(let j=0;j<l.seats.length;j++){const V=c.get(l.seats[j].id);if(V&&V.status==="holding"){T=!0;break}}T&&!u&&m(),!T&&u&&O()}R(),p(),H();const G=new ResizeObserver(()=>{Ze(L,l,v),p()});G.observe(v);function K(T,j,V){V=Math.max(C,Math.min(La,V)),L.tx=T-(T-L.tx)*V/L.scale,L.ty=j-(j-L.ty)*V/L.scale,L.scale=V,Ze(L,l,v),p()}e.querySelector("[data-zoom-in]").addEventListener("click",()=>{K(v.clientWidth/2,v.clientHeight/2,L.scale*Fi)}),e.querySelector("[data-zoom-out]").addEventListener("click",()=>{K(v.clientWidth/2,v.clientHeight/2,L.scale/Fi)}),e.querySelector("[data-zoom-reset]").addEventListener("click",()=>{ki(L,l,v,C),p()}),v.addEventListener("wheel",T=>{T.preventDefault();const j=v.getBoundingClientRect(),V=T.clientX-j.left,ce=T.clientY-j.top,he=-T.deltaY*nd;K(V,ce,L.scale*(1+he)),x&&x.parentElement&&x.remove()},{passive:!1});let Z=!1,J=!1,de=0,ne=0,le=0,ge=0,P=null;v.addEventListener("pointerdown",T=>{if(T.button!==0||T.target.closest(".vm-zoom-controls"))return;Z=!0,J=!1;const j=v.getBoundingClientRect(),V=M(T.clientX-j.left,T.clientY-j.top);P=L.scale>=D?Di(w,l.seats,V.x,V.y):null,de=T.clientX,ne=T.clientY,le=T.clientX,ge=T.clientY,v.classList.add("dragging"),v.setPointerCapture(T.pointerId)}),v.addEventListener("pointermove",T=>{if(!Z){const ce=L.scale>=D,he=v.getBoundingClientRect(),Ee=M(T.clientX-he.left,T.clientY-he.top),ye=ce?Di(w,l.seats,Ee.x,Ee.y):null;if(ye!==f){if(f=ye,ye){const xe=c.get(ye.id),pe=t.find(we=>we.id===((xe==null?void 0:xe.section)||ye._block))||t.find(we=>we.grade===((xe==null?void 0:xe.grade)||ye.grade));cd(k,T,{...ye,...xe},pe==null?void 0:pe.label);const $e=xe==null?void 0:xe.status;v.style.cursor=$e==="sold"?"not-allowed":$e==="holding"?"wait":"pointer"}else yd(k),v.style.cursor="grab";u||p()}else k.classList.contains("show")&&(k.style.left=`${T.clientX+14}px`,k.style.top=`${T.clientY-10}px`);return}const j=T.clientX-le,V=T.clientY-ge;(Math.abs(j)>Ii||Math.abs(V)>Ii)&&(J=!0),L.tx+=T.clientX-de,L.ty+=T.clientY-ne,de=T.clientX,ne=T.clientY,Ze(L,l,v),p()});const q=()=>{const T=L.scale>=D;if(!o&&Z&&!J&&P&&T){const j=c.get(P.id),V=j?j.status:"available";V!=="sold"&&V!=="holding"&&a(P.id)}Z=!1,P=null,v.classList.remove("dragging")};v.addEventListener("pointerup",q),v.addEventListener("pointercancel",q);let te=0;return v.addEventListener("touchmove",T=>{if(T.touches.length===2){T.preventDefault();const j=T.touches[0].clientX-T.touches[1].clientX,V=T.touches[0].clientY-T.touches[1].clientY,ce=Math.sqrt(j*j+V*V);if(te>0){const he=ce/te,Ee=v.getBoundingClientRect(),ye=(T.touches[0].clientX+T.touches[1].clientX)/2-Ee.left,xe=(T.touches[0].clientY+T.touches[1].clientY)/2-Ee.top;K(ye,xe,L.scale*he)}te=ce}},{passive:!1}),v.addEventListener("touchend",()=>{te=0}),setTimeout(()=>{x&&x.parentElement&&(x.style.opacity="0",setTimeout(()=>x.remove(),600))},4e3),{updateStatuses(T){T.forEach(j=>{const V=c.get(j.id);V&&(V.status=j.status)}),p(),H()},flashSold(T){const j=y.get(T);if(!j)return;let V=0;const ce=8;function he(){if(V>=ce||F)return;V++,p();const Ee=Math.sin(V*Math.PI*.5)*3,ye=window.devicePixelRatio||1;s.save(),s.scale(ye,ye),s.translate(L.tx,L.ty),s.scale(L.scale,L.scale),s.translate(j._x+Ee,j._y),s.fillStyle="#ff4444",s.globalAlpha=1-V/ce,s.beginPath(),s.arc(0,0,Zt/2+4,0,6.2832),s.fill(),s.restore(),requestAnimationFrame(he)}requestAnimationFrame(he)},scrollToZone(T){const j=l.seats.filter(pe=>pe._block===T||pe.section===T||pe.grade===T);if(!j.length)return;let V=0,ce=0;j.forEach(pe=>{V+=pe._x,ce+=pe._y});const he=V/j.length,Ee=ce/j.length,ye=v.clientWidth,xe=v.clientHeight;L.scale=Math.max(1.2,L.scale),L.tx=ye/2-he*L.scale,L.ty=xe/2-Ee*L.scale,Ze(L,l,v),p()},destroy(){F=!0,u=!1,G.disconnect(),f=null}}}const Li={올림픽홀:"/images/seatmaps/올림픽홀-csv.png",고척스카이돔:"/images/seatmaps/고척스카이돔.jpg"};function Sd(e){var n,l;const t=_t(e),i=new Map((e.sections||[]).map(c=>[c.id||c.name,c])),a=new Map(t.map(c=>[c.id,c])),d=t.map(c=>{var y;return{id:c.id,grade:c.grade,label:`${c.id}구역 · ${c.grade}석`,price:Number(((y=i.get(c.id))==null?void 0:y.price)??c.price??e.price??0)}}),o=Ea.flatMap(c=>c.seats.map(y=>{var g;return{id:y.id,section:c.id,status:"available",price:((g=d.find(b=>b.id===c.id))==null?void 0:g.price)||0}})),r=Number(((n=i.get("Floor"))==null?void 0:n.price)??((l=a.get("Floor"))==null?void 0:l.price)??e.price??0);for(let c=0;c<Je;c++)o.push({id:`Floor-${c+1}`,section:"Floor",status:"available",price:r});return{sections:d,seats:o}}const _d={render(e,t){e.innerHTML='<div class="center-state"><div class="center-state__title">공연 정보 불러오는 중...</div></div>';let i=!1,a=null,d=null,o=null;return fetch("/events").then(r=>r.json()).then(r=>{var u;if(i)return;const n=(r.events||[]).find(F=>F.eventId===t.id);if(!n){e.innerHTML='<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>';return}const l=Pe(n.eventName||n.eventId),c=`--detail-poster-image: url('${l}')`,y=Ia(n.sessions)||Aa(n.eventDate),g=[...new Set(y.map(F=>F.date))],b=g.length>1?`${g[0]} ~ ${g[g.length-1]}`:g[0]||n.eventDate||"-",S=n.description||`${n.eventName} 공연입니다.`,E=Sa(n);if(e.innerHTML=`
          <section class="detail-hero detail-hero--spread" style="${c}">
            <div class="detail-hero__overlay"></div>
            <div class="container detail-hero__content">
              <div class="detail-hero__artist">${n.eventName}</div>
              <div class="detail-hero__title">${b}</div>
              <dl class="detail-hero__meta">
                <div><dt>공연일</dt><dd>${b}</dd></div>
                <div><dt>공연장</dt><dd>${n.venue||"-"}</dd></div>
                <div><dt>총 좌석</dt><dd>${ue(n.totalSeats)}석</dd></div>
                ${n.runtime?`<div><dt>관람 시간</dt><dd>${n.runtime}</dd></div>`:""}
                ${n.ageRating?`<div><dt>관람 등급</dt><dd>${n.ageRating}</dd></div>`:""}
              </dl>
            </div>
          </section>

          <div class="container detail-body">
            <div>
              <div class="detail-info-card">
                <h3>공연 정보</h3>
                <p style="font-size:14px;line-height:1.9;color:var(--color-text-secondary);">
                  ${S}
                </p>
                <div style="margin-top:16px;padding-top:14px;border-top:1px dashed var(--color-border);">
                  <img src="${l}" alt="${n.eventName} 포스터" style="width:100%;border-radius:12px;object-fit:cover;" />
                </div>
                ${Li[n.venue]?`
                <div style="margin-top:16px;padding-top:14px;border-top:1px dashed var(--color-border);">
                  <div style="font-size:13px;font-weight:700;color:var(--color-text-secondary);margin-bottom:8px;">좌석 배치도 — ${n.venue}</div>
                  ${n.venue==="올림픽홀"?`<div class="detail-seatmap detail-seatmap--static" data-venue-seatmap role="img" aria-label="${n.venue} 좌석 배치도"></div>`:`<img src="${Li[n.venue]}" alt="${n.venue} 좌석배치도" style="width:100%;border-radius:12px;object-fit:contain;background:#fff;" />`}
                </div>`:""}
                ${n.cast?`
                <div style="margin-top:16px;padding-top:14px;border-top:1px dashed var(--color-border);">
                  <div style="font-size:13px;font-weight:700;color:var(--color-text-secondary);margin-bottom:6px;">출연진</div>
                  <div style="font-size:14px;font-weight:600;line-height:1.8;">${n.cast}</div>
                </div>`:""}
                ${n.agency?`
                <div style="margin-top:12px;">
                  <div style="font-size:13px;font-weight:700;color:var(--color-text-secondary);margin-bottom:4px;">주최/기획</div>
                  <div style="font-size:14px;font-weight:600;">${n.agency}</div>
                </div>`:""}
                ${n.runtime||n.ageRating?`
                <div style="margin-top:12px;display:flex;gap:24px;">
                  ${n.runtime?`<div><div style="font-size:13px;font-weight:700;color:var(--color-text-secondary);margin-bottom:4px;">관람 시간</div><div style="font-size:14px;font-weight:600;">${n.runtime}</div></div>`:""}
                  ${n.ageRating?`<div><div style="font-size:13px;font-weight:700;color:var(--color-text-secondary);margin-bottom:4px;">관람 등급</div><div style="font-size:14px;font-weight:600;">${n.ageRating}</div></div>`:""}
                </div>`:""}
              </div>
              <div class="detail-info-card">
                <h3>티켓 가격</h3>
                ${E.map(({grade:F,price:D})=>`<div class="price-row"><span>${F}석</span><b>${ve(D)}</b></div>`).join("")}
              </div>
              <div class="detail-info-card">
                <h3>예매 유의사항</h3>
                <div class="notice-box">
                  <p>· <strong>공연일마다 1매, 인당 최대 2매</strong> 구매 가능합니다.</p>
                  <p>· 예매 후 취소 시 취소 수수료가 부과될 수 있습니다.</p>
                  <p>· <strong>멤버십 가입자</strong>에 한해 매진 이후 좌석 선택 화면까지 진입했던 회원은 <strong>취소표 대기열</strong> 대상자로 자동 등록됩니다.</p>
                  <p>· 실명 확인 및 본인 입장이 원칙입니다.</p>
                </div>
              </div>
              <div class="detail-info-card" data-refund-summary></div>
            </div>

            <div class="detail-right-col">
              <div class="booking-panel" data-panel style="padding:0;overflow:hidden;">
                <div data-booking-cal></div>
                <div style="padding:0 24px 20px;">
                  <button class="btn btn-primary btn-block" data-book disabled>날짜를 선택해주세요</button>
                </div>
              </div>
              <div class="live-panel" data-live></div>
            </div>
          </div>
        `,n.venue==="올림픽홀"){const F=Sd(n);o=li(e.querySelector("[data-venue-seatmap]"),{sections:F.sections,seats:F.seats,readOnly:!0,venue:"올림픽홀"})}let v=null,k=null,x=!0;const s=new Set(y.map(F=>F.date)),A=oe().bookings.filter(F=>F.concertId===n.eventId&&(F.status==="confirmed"||F.status==="unpaid")),I=new Set(A.map(F=>{var D;return(D=F.session)==null?void 0:D.date}).filter(Boolean)),w=A.length>=2;function M(F){const D=new Date(y[0].date);let C=D.getFullYear(),R=D.getMonth();const p=["일","월","화","수","목","금","토"];function m(){const O=new Date(C,R+1,0).getDate(),H=new Date(C,R,1).getDay();let G="";for(let J=0;J<H;J++)G+='<div class="bcal-day bcal-day--empty"></div>';for(let J=1;J<=O;J++){const de=`${C}-${String(R+1).padStart(2,"0")}-${String(J).padStart(2,"0")}`,ne=s.has(de)&&!I.has(de),le=s.has(de)&&I.has(de),P=["bcal-day",le?"bcal-day--disabled":ne?"bcal-day--valid":"bcal-day--disabled",de===v?"bcal-day--selected":""].join(" ");G+=`<div class="${P}" ${ne?`data-cal-date="${de}"`:""}>${J}${le?'<span style="display:block;font-size:10px;color:var(--color-red);">예매완료</span>':""}</div>`}const K=v?y.filter(J=>J.date===v):[];let Z;v?Z=K.map(J=>{const de=y.indexOf(J);return`<button type="button" class="chip-btn ${de===k?"active":""}" data-pick-session="${de}" style="padding:10px 20px;font-size:14px;">${J.round}회 ${J.time}</button>`}).join(""):Z='<span style="font-size:13px;color:var(--color-text-secondary);">날짜를 먼저 선택해주세요</span>',F.innerHTML=`
              <div class="bcal">
                <div class="bcal-section">
                  <div class="bcal-section-hd"><span style="font-weight:700;">관람일</span></div>
                  <div class="bcal-nav">
                    <button type="button" data-cal-dir="-1" class="bcal-nav-btn">‹</button>
                    <span class="bcal-nav-title">${C}. ${String(R+1).padStart(2,"0")}</span>
                    <button type="button" data-cal-dir="1" class="bcal-nav-btn">›</button>
                  </div>
                  <div class="bcal-weekdays">${p.map(J=>`<span>${J}</span>`).join("")}</div>
                  <div class="bcal-grid">${G}</div>
                </div>
                <div class="bcal-section" style="border-top:1px solid var(--color-border);">
                  <div class="bcal-section-hd"><span style="font-weight:700;">회차</span></div>
                  <div style="padding:0 20px 16px;display:flex;gap:8px;flex-wrap:wrap;" data-session-area>${Z}</div>
                </div>
                <div style="padding:0 20px 4px;font-size:12px;color:var(--color-text-secondary);">
                  · 공연일마다 <strong>1매</strong>, 인당 최대 <strong>2매</strong> 예매 가능
                </div>
              </div>
            `,F.querySelectorAll("[data-cal-dir]").forEach(J=>{J.addEventListener("click",()=>{R+=parseInt(J.dataset.calDir),R<0&&(R=11,C--),R>11&&(R=0,C++),m()})}),F.querySelectorAll("[data-cal-date]").forEach(J=>{J.addEventListener("click",()=>{v=J.dataset.calDate,k=null,m(),L()})}),F.querySelectorAll("[data-pick-session]").forEach(J=>{J.addEventListener("click",()=>{k=parseInt(J.dataset.pickSession),m(),L()})})}m()}M(e.querySelector("[data-booking-cal]"));function L(){if(!x)return;const F=e.querySelector("[data-book]");F&&(k==null?(F.disabled=!0,F.textContent="날짜를 선택해주세요"):(F.disabled=!1,F.textContent="예매하기"))}(u=e.querySelector("[data-book]"))==null||u.addEventListener("click",()=>{if(!Le()){We(`concert/${n.eventId}`),z("login");return}if(w){Bo(async()=>{const{showToast:D}=await Promise.resolve().then(()=>io);return{showToast:D}},void 0).then(({showToast:D})=>{D({title:"예매 한도 초과",body:"이 공연은 1인당 최대 2매까지 예매 가능합니다."})});return}if(k==null)return;const F=y[k];Vt(n.eventId,{date:F.date,time:F.time}),z(`queue/${n.eventId}`)}),$a(e.querySelector("[data-refund-summary]")),d=td(e.querySelector("[data-live]"),{concertId:n.eventId,artist:n.eventName});const f=e.querySelector("[data-book]");function h(F){x=!1;function D(){const C=F-Date.now();if(C<=0){clearInterval(a),a=null,x=!0,L(),f.classList.remove("btn--countdown");return}f.disabled=!0,f.classList.add("btn--countdown"),f.textContent=`예매 시작까지 ${ht(C)}`}D(),a=setInterval(D,1e3)}if(n.ticketOpenAt){const F=new Date(n.ticketOpenAt).getTime();Number.isNaN(F)||h(F)}else fetch("/admin/ticketing/schedule").then(F=>F.json()).then(F=>{if(i||!F.scheduled||!F.openAt)return;const D=new Date(F.openAt).getTime();Number.isNaN(D)||h(D)}).catch(()=>{})}).catch(()=>{i||(e.innerHTML='<div class="center-state"><div class="center-state__title">공연 정보를 불러오지 못했습니다.</div></div>')}),()=>{i=!0,a&&clearInterval(a),d&&d(),o&&o.destroy()}}},kd=[{name:"수성",pct:9,color:"#b4a695"},{name:"금성",pct:20,color:"#e7c98a"},{name:"지구",pct:32,color:"#4f9bdb"},{name:"화성",pct:44,color:"#d1602f"},{name:"목성",pct:58,color:"#dcae7c"},{name:"토성",pct:71,color:"#e8d4a0"},{name:"천왕성",pct:84,color:"#a7e2da"},{name:"해왕성",pct:95,color:"#5b7cfa"}];function $d(e,t=0){e.innerHTML=`
    <div class="rocket-wrap">
      <div class="rocket-track rocket-track--space">
        <div class="rocket-fill" data-fill></div>
        ${kd.map(o=>`
          <div class="rocket-planet" style="left:${o.pct}%;--planet-color:${o.color}">
            <span class="rocket-planet__dot"></span>
            <span class="rocket-planet__label">${o.name}</span>
          </div>`).join("")}
        <div class="rocket-ship" data-ship>🚀</div>
      </div>
      <div class="rocket-labels">
        <span>☀ 대기 시작</span>
        <span>입장 🌌</span>
      </div>
    </div>
  `;const i=e.querySelector("[data-fill]"),a=e.querySelector("[data-ship]");function d(o){const r=Math.max(0,Math.min(100,o));i.style.width=`${r}%`,a.style.left=`${r}%`}return d(t),{update:d}}const Ti=1500,wd=100,Dd=1e3,Ld={render(e,t){e.innerHTML='<div class="center-state"><div class="center-state__title">대기열 진입 중...</div></div>';let i=!1,a=null;return fetch("/events").then(d=>d.json()).then(d=>{var R,p;if(i)return;const o=(d.events||[]).find(m=>m.eventId===t.id);if(!o){e.innerHTML='<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>';return}const r=((R=oe().user)==null?void 0:R.userId)||((p=oe().user)==null?void 0:p.email);if(!r){e.innerHTML='<div class="center-state"><div class="center-state__title">로그인이 필요합니다</div></div>',z("login");return}const n=ni(o.eventId);e.innerHTML=`
          <section class="queue-page container">
            <div class="eyebrow">BOOKING QUEUE · STEP 3</div>
            <div class="section-title" style="margin-bottom:4px;">${o.eventName} 예매 대기열</div>
            <div class="section-sub">${n?`${n.date} ${n.time}`:""}</div>

            <div class="queue-stats mt-40">
              <div>
                <div class="queue-stat-label">전체 대기자</div>
                <div class="queue-stat-value num-mono" data-total>--</div>
              </div>
              <div>
                <div class="queue-stat-label">예상 대기시간</div>
                <div class="queue-stat-value num-mono" data-eta>약 --분</div>
              </div>
              <div>
                <div class="queue-stat-label">현재 상태</div>
                <div class="queue-stat-value">
                  <span class="queue-status-pill"><span class="dot"></span><span data-status>대기열 확인 중</span></span>
                </div>
              </div>
            </div>

            <div class="queue-mynum-label" data-mynum-label>내 대기번호</div>
            <div class="queue-mynum num-mono" data-mynum>-</div>

            <div class="queue-progress-wrap" data-rocket></div>

            <div class="queue-notice">
              <p>페이지를 새로고침하지 마세요.</p>
              <p>대기번호는 실제 서버 순번을 주기적으로 조회해 갱신됩니다.</p>
              <p>현재 많은 사용자가 동시에 예매를 진행하고 있습니다.</p>
            </div>

            <div class="queue-enter-box" data-enter-box></div>
          </section>
        `;const l=$d(e.querySelector("[data-rocket]"),0),c=e.querySelector("[data-mynum]"),y=e.querySelector("[data-mynum-label]"),g=e.querySelector("[data-total]"),b=e.querySelector("[data-eta]"),S=e.querySelector("[data-status]"),E=e.querySelector("[data-enter-box]");let v=null,k=null,x=null,s=!1,A=!1;function I(){v&&clearInterval(v),k&&clearInterval(k),x&&clearTimeout(x),v=null,k=null,x=null}function w(){s||(s=!0,I(),l.update(100),S.textContent="입장 완료",b.textContent="입장 완료",E.innerHTML=`
            <div class="badge badge-green" style="font-size:13px;padding:8px 16px;margin-bottom:16px;">입장이 완료되었습니다</div>
            <div style="font-size:15px;color:var(--color-text-secondary);">이제 좌석 구역으로 이동합니다...</div>
          `,x=setTimeout(()=>z(`zones/${o.eventId}`),1400))}function M(m){const H=Math.max(0,Math.ceil(m/wd)-1)*Ti;if(H<=0)return"곧 입장";const G=Math.ceil(H/1e3);return G<60?`약 ${G}초`:`약 ${Math.ceil(G/60)}분`}function L(m){const O=m.type==="standby",H=O?m.standbyPosition:m.position,G=O?m.totalStandby:m.totalWaiting;y.textContent=O?"취소표 대기번호":"내 대기번호",c.textContent=ue(H),c.classList.toggle("hot",H<=1e3),c.classList.toggle("pulse-red",H<=200),g.textContent=G!=null?`${ue(G)}명`:"-",S.textContent=O?"취소표 대기 중":"대기 중",b.textContent=O?"취소표 발생 시 안내":M(H);const K=G>0?Math.min(99,Math.max(1,Math.round((1-H/G)*100))):1;l.update(O?Math.min(K,40):K)}function f(){fetch(`/queue/position/${encodeURIComponent(r)}`).then(m=>m.json()).then(m=>{if(!s){if(m.status==="admitted"){S.textContent="입장 허용됨 · 토큰 발급 중...";return}if(m.status==="not_found"){C();return}L(m)}}).catch(()=>{})}function h(){return fetch("/queue/admit",{method:"POST"}).then(m=>m.json()).then(m=>{var H;const O=(H=m.tokens)==null?void 0:H[r];O!=null&&O.token&&(bt(o.eventId,O),w())}).catch(()=>{})}function u(){v||k||(f(),k=setInterval(f,Dd),v=setInterval(h,Ti))}function F(m){if(!s){if(m.status==="closed"){S.textContent="마감",E.innerHTML=`<div class="notice-box"><p>${m.message||"현재 티켓팅이 마감되었습니다."}</p></div>`;return}if(m.status==="error"){S.textContent="오류",E.innerHTML=`<div class="notice-box"><p>${m.message||"대기열 진입 중 오류가 발생했습니다."}</p></div>`;return}if(m.token){bt(o.eventId,m),w();return}u(),h()}}function D(){return fetch("/queue/enter",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:r})}).then(m=>m.json()).then(F).catch(()=>{S.textContent="오류",E.innerHTML='<div class="notice-box"><p>대기열 진입에 실패했습니다. 새로고침 후 다시 시도해주세요.</p></div>'})}function C(){A||s||(A=!0,I(),S.textContent="대기열 재진입 중...",D().finally(()=>{A=!1}))}D(),a=I}).catch(()=>{i||(e.innerHTML='<div class="center-state"><div class="center-state__title">대기열 진입에 실패했습니다.</div></div>')}),()=>{i=!0,a&&a()}}};function ti(e){var t,i;if(He()){const a=va(e);fe({title:"매진 안내",bodyHtml:`
        <p>본 콘서트의 티켓이 마감되었습니다.</p>
        <p class="mt-16">취소 티켓팅 대기번호는 <b class="text-red">${ue(a.myNumber)}</b>번입니다.<br/>취소 티켓팅 날에 가입하신 이메일로 알림과 링크를 보내드리겠습니다.</p>
      `,footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close data-confirm>확인</button>'}),(t=document.querySelector("[data-confirm]"))==null||t.addEventListener("click",()=>{z(`cancel-queue/${e}`)})}else fe({title:"매진 안내",bodyHtml:`
        <p>본 콘서트의 티켓이 마감되었습니다.</p>
        <p class="mt-16 text-secondary" style="font-size:13px;">다음 콘서트에서는 취소 티켓팅 대기를 하고 싶으시면?</p>
      `,footerHtml:`
        <button type="button" class="btn btn-outline" data-modal-close>닫기</button>
        <button type="button" class="btn btn-primary" data-join-membership>멤버십 가입</button>
      `}),(i=document.querySelector("[data-join-membership]"))==null||i.addEventListener("click",()=>{ke(),z("membership")})}const Mi={VIP:"#B5121B",R:"#C98500",S:"#199E70",A:"#3987E5"},Ni=["#B5121B","#C98500","#199E70","#3987E5","#8E44AD","#16A085","#D35400","#2C3E50"],Td=4e3,Md=8*60*1e3+42*1e3,Nd=["일","월","화","수","목","금","토"];function rt(e,t){const i=(e==null?void 0:e.date)||t;if(!i)return"";const[a,d,o]=i.split("-").map(Number),r=Nd[new Date(a,d-1,o).getDay()],n=e!=null&&e.time?` ${e.time}`:"";return`${a}년 ${d}월 ${o}일 (${r})${n}`}function Od(e,t){return e.color||Mi[e.grade]||Mi[e.name]||Ni[t%Ni.length]}function Xe({seatId:e,userId:t}){!e||!t||fetch("/seats/release",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:t,seatId:e})}).catch(()=>{})}function Cd(e,t,i){e.innerHTML='<div class="center-state"><div class="center-state__title">좌석 정보 불러오는 중...</div></div>';let a=!1,d=null,o=null,r=null,n=null,l=null;const c=[];return Promise.all([fetch("/events").then(y=>y.json()),fetch(`/seats?eventId=${encodeURIComponent(t)}`).then(y=>y.json())]).then(([y,g])=>{if(a)return;const b=(y.events||[]).find($=>$.eventId===t);if(!b){e.innerHTML='<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>';return}const S=g.seats||[],E=(b.sections||[]).length?b.sections:[{name:"A",seats:b.totalSeats,price:b.price}],v=b.venue==="올림픽홀"?new Map(_t(b).map($=>[$.id,$])):new Map,k=b.venue==="올림픽홀"?E.map($=>{const _=$.name||$.id,N=v.get(_);return{...$,id:_,name:_,grade:(N==null?void 0:N.grade)||$.grade||_,label:(N==null?void 0:N.label)||$.label||`${_}구역`}}):E;let x=ni(b.eventId);const s=Ia(b.sessions)||Aa(b.eventDate),A=oe().bookings.filter($=>$.concertId===b.eventId&&($.status==="confirmed"||$.status==="unpaid")),I=new Set(A.map($=>{var _;return(_=$.session)==null?void 0:_.date}).filter(Boolean)),w=2;if(A.length>=w){e.innerHTML=`
          <div class="container" style="padding:60px 0;text-align:center;">
            <div class="soldout-panel">
              <div class="soldout-title">예매 한도 초과</div>
              <div class="soldout-desc">이 공연은 1인당 최대 ${w}매까지 예매 가능합니다.<br/>이미 ${A.length}매를 예매하셨습니다.</div>
              <button class="btn btn-primary mt-24" onclick="location.hash='#/mypage'">마이페이지로 이동</button>
            </div>
          </div>
        `;return}const M=s.filter($=>!I.has($.date));if(M.length===0){e.innerHTML=`
          <div class="container" style="padding:60px 0;text-align:center;">
            <div class="soldout-panel">
              <div class="soldout-title">예매 가능한 날짜 없음</div>
              <div class="soldout-desc">모든 공연일의 예매가 완료되었습니다.</div>
              <button class="btn btn-primary mt-24" onclick="location.hash='#/mypage'">마이페이지로 이동</button>
            </div>
          </div>
        `;return}x&&I.has(x.date)&&(x={date:M[0].date,time:M[0].time},Vt(b.eventId,x));const L=`${b.eventId}:`;function f($){return $.seatId.startsWith(L)}const h=[],u=[],F={};let D=0;if(k.forEach(($,_)=>{var Q;const N=S.filter(X=>X.section===$.name&&f(X)),U=N.filter(X=>X.status==="AVAILABLE");D+=U.length;const W=Od($,_),re=b.venue==="올림픽홀"&&$.grade?`${$.name}구역 · ${$.grade}석`:`${$.name}구역`;F[$.name]={label:re,grade:$.grade||$.name,price:Number(((Q=U[0])==null?void 0:Q.price)||$.price||b.price)||0,color:W},N.length!==0&&(h.push({id:$.name,label:re,grade:$.grade||$.name,zone:b.eventName,cols:N.length,color:W}),N.forEach((X,Te)=>{const qe=X.seatId.includes(":")?X.seatId.split(":").pop():X.seatId;let kt="available";X.status==="SOLD"?kt="sold":X.status==="HELD"&&(kt="holding"),u.push({id:X.seatId,section:X.section,zoneId:$.name,row:qe.split("-")[0],seatNum:parseInt(qe.split("-")[1],10)||Te+1,grade:$.grade||$.name,status:kt,price:Number(X.price||$.price||b.price)||0})}))}),D===0){e.innerHTML=`
          <div class="container" style="padding:60px 0;">
            <div class="soldout-panel">
              <div class="soldout-title">SOLD OUT</div>
              <div class="soldout-desc">티켓이 모두 매진되었습니다.<br/>현재 예매 가능한 좌석이 없습니다.</div>
            </div>
          </div>
        `,ti(b.eventId);return}Ja(),e.innerHTML=`
        <section class="seat-page-header">
          <div class="container seat-page-header__top">
            <div>
              <div class="seat-page-header__title">${b.eventName}</div>
              <div class="seat-page-header__date">
                <span data-session-date>${rt(x,b.eventDate)}</span> · ${b.venue}
              </div>
            </div>
            <div class="seat-page-header__right"></div>
          </div>
        </section>
        <div class="container">
          <div class="seats-left-banner" data-banner>
            <div><div class="seats-left-banner__msg">실시간으로 좌석이 예매되고 있습니다.</div></div>
            <div style="text-align:right;">
              <div class="seats-left-banner__num num-mono" data-remaining>${ue(D)}석</div>
            </div>
          </div>
        </div>
        <div class="container" style="padding-top:12px;padding-bottom:0;">
          <div class="chip-row" data-session-tabs style="gap:8px;flex-wrap:wrap;">
            ${s.map(($,_)=>{const N=I.has($.date);return`
              <button type="button" class="chip-btn ${!N&&(x==null?void 0:x.date)===$.date&&(x==null?void 0:x.time)===$.time?"active":""}" data-session-tab="${_}" ${N?"disabled":""} style="flex:1;min-width:calc(50% - 6px);justify-content:center;padding:10px 12px;font-size:13px;${N?"opacity:0.4;text-decoration:line-through;":""}">
                ${$.shortLabel} ${$.round}회 ${$.time}${N?" (예매완료)":""}
              </button>`}).join("")}
          </div>
        </div>
        <div class="container" data-body>
          <div class="seat-select-body">
            <div class="seatmap-scroll"><div class="seatmap-inner" data-seatmap></div></div>
            <div class="order-rail" data-rail>
              <div class="order-rail__order" data-order-box></div>
            </div>
          </div>
        </div>
        <div class="container mt-16">
          <div class="zone-legend">
            ${Object.entries(F).map(([$,_])=>`<span><span class="zone-legend__dot" style="background:${_.color}"></span>${$} · ${_.grade}석 · ${ve(_.price)}</span>`).join("")}
          </div>
        </div>
      `;const C=e.querySelector("[data-seatmap]"),R=e.querySelector("[data-order-box]"),p=1;let m=[],O=null,H=!1;function G($="색칠된 구역의 좌석 중 원하는 자리를 선택해주세요"){R.innerHTML=`<div class="order-rail__title">선택 좌석 정보</div><div class="order-rail__session" data-order-session>${rt(x,b.eventDate)}</div><div class="order-rail__empty">${$}</div>`}G(),e.querySelectorAll("[data-session-tab]").forEach($=>{$.addEventListener("click",()=>{var W,re;const _=parseInt($.dataset.sessionTab),N=s[_];if(!N||(x==null?void 0:x.date)===N.date&&(x==null?void 0:x.time)===N.time)return;if(I.has(N.date)){Y({title:"이미 예매한 날짜입니다",body:`${N.shortLabel} 공연은 이미 예매가 완료되었습니다.`});return}if(m.length){ye();const Q=((W=oe().user)==null?void 0:W.userId)||((re=oe().user)==null?void 0:re.email);m.forEach(X=>{Xe({seatId:X.id,userId:Q}),X.status="available"}),m=[],c.length=0,q.updateStatuses(u)}x={date:N.date,time:N.time},Vt(b.eventId,x);const U=e.querySelector("[data-session-date]");U&&(U.textContent=rt(x,b.eventDate)),e.querySelectorAll("[data-session-tab]").forEach((Q,X)=>Q.classList.toggle("active",X===_)),G(),Y({title:"공연 일정이 변경되었습니다",body:N.label,type:"success"})})});const K=1200,Z=8;function J($,_){return fetch("/queue/admit",{method:"POST"}).then(N=>N.json()).then(N=>{var W;const U=(W=N.tokens)==null?void 0:W[$];if(U!=null&&U.token)return bt(b.eventId,U),U.token;if(_<=0)throw new Error("token_unavailable");return new Promise(re=>setTimeout(re,K)).then(()=>J($,_-1))})}function de($){const _=xa(b.eventId);return _!=null&&_.token?Promise.resolve(_.token):fetch("/queue/enter",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:$})}).then(N=>N.json()).then(N=>N.token?(bt(b.eventId,N),N.token):J($,Z))}const ne=new Set(["no_token","expired","revoked","invalid","user_mismatch","mismatch"]);function le($,_,N){return fetch("/seats/hold",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:$,seatId:_,token:N})}).then(U=>U.json().then(W=>({ok:U.ok,data:W})))}function ge($){var U,W;const _=((U=oe().user)==null?void 0:U.userId)||((W=oe().user)==null?void 0:W.email);Xe({seatId:$.id,userId:_}),$.status="available",m=m.filter(re=>re.id!==$.id);const N=c.findIndex(re=>re.seatId===$.id);N>=0&&c.splice(N,1),q.updateStatuses(u),m.length===0?(ye(),G()):he()}function P($){var W,re;if(H)return;const _=u.find(Q=>Q.id===$);if(!_)return;const N=((W=oe().user)==null?void 0:W.userId)||((re=oe().user)==null?void 0:re.email);if(!N){Y({title:"로그인이 필요합니다",body:"좌석을 선점하려면 먼저 로그인해주세요.",type:"default"});return}const U=m.find(Q=>Q.id===$);if(U){ge(U);return}if(m.length>=p){const Q=m[0];Xe({seatId:Q.id,userId:N}),Q.status="available",m=[];const X=c.findIndex(Te=>Te.seatId===Q.id);X>=0&&c.splice(X,1),ye(),q.updateStatuses(u)}H=!0,de(N).then(Q=>le(N,$,Q)).then(Q=>!Q.ok&&ne.has(Q.data.reason)?(Ka(b.eventId),de(N).then(X=>le(N,$,X))):Q).then(({ok:Q,data:X})=>{if(!Q||!X.success){Y({title:"좌석을 선점하지 못했습니다",body:X.message||"이미 다른 사용자가 선택했거나 만료되었습니다.",type:"default"}),X.reason==="unavailable"&&(_.status=_.status==="available"?"holding":_.status,q.updateStatuses(u));return}_.status="mine",m.push(_),c.push({seatId:_.id,userId:N}),q.updateStatuses(u),m.length===1&&Ee(),he()}).catch(Q=>{(Q==null?void 0:Q.message)==="token_unavailable"?Y({title:"입장 허용 대기 중입니다",body:"아직 대기열 순서가 오지 않았거나 티켓팅이 열리지 않았을 수 있어요. 잠시 후 다시 시도해주세요.",type:"default"}):Y({title:"좌석 선점 요청에 실패했습니다",body:"네트워크 상태를 확인하고 다시 시도해주세요.",type:"default"})}).finally(()=>{H=!1})}const q=li(C,{sections:h,seats:u,onSeatClick:P,seatingType:b.seatingType,venue:b.venue});r=q;const te={"seat.held":"holding","seat.sold":"sold","seat.released":"available","seat.cancelled":"available"};let T=!1;function j(){d||(d=setInterval(we,Td))}function V(){d&&(clearInterval(d),d=null)}function ce(){if(a)return;const $=oe().user;n=Qo(b.eventId,($==null?void 0:$.email)||"anonymous",($==null?void 0:$.name)||"게스트",{onMessage:_=>{if(!(_!=null&&_.seatId)||!_.type||m.some(W=>W.id===_.seatId))return;const N=u.find(W=>W.id===_.seatId);if(!N)return;const U=te[_.type];if(U&&N.status!==U){N.status=U,q.updateStatuses(u);const W=e.querySelector("[data-remaining]");if(W){const re=u.filter(Q=>Q.status==="available").length;W.textContent=`${ue(re)}석`}}},onOpen:()=>{console.log("[Seats WS] 연결 성공 — 폴링 중지"),T=!0,V()},onClose:()=>{console.log("[Seats WS] 연결 종료 — 폴링 fallback 시작"),T=!1,j(),a||(l=setTimeout(ce,3e3))}})}ce();function he(){const $=m.reduce((_,N)=>_+Number(N.price||0),0);R.innerHTML=`
          <div class="order-rail__title">선택 좌석 (${m.length}/${p})</div>
          <div class="order-rail__session">${rt(x,b.eventDate)}</div>
          <div class="order-rail__seat-list">
            ${m.map(_=>`
              <div class="order-rail__seat-item">
                <div>
                  <div class="order-rail__seat-grade">${F[_.zoneId||_.section||_.grade].label}</div>
                  <div class="order-rail__seat-loc">${_._displayNum||_.seatNum}번</div>
                </div>
                <div style="text-align:right;">
                  <div class="order-rail__seat-price num-mono">${ve(_.price)}</div>
                  <button type="button" class="order-rail__seat-remove" data-remove-seat="${_.id}">취소</button>
                </div>
              </div>`).join("")}
          </div>
          <div class="order-rail__total">
            <span>총 결제 금액</span>
            <b class="num-mono">${ve($)}</b>
          </div>
          <button class="btn btn-primary btn-block" data-next>선택 완료</button>
        `,R.querySelectorAll("[data-remove-seat]").forEach(_=>{_.addEventListener("click",()=>{const N=m.find(U=>U.id===_.dataset.removeSeat);N&&ge(N)})}),R.querySelector("[data-next]").addEventListener("click",()=>{const _=O;ye(),c.length=0,di({concertId:b.eventId,session:x,seats:m.map(N=>({...N,gradeName:F[N.zoneId||N.section||N.grade].label})),source:"regular",securedAt:Date.now(),holdDeadline:_}),z("payment/regular")})}function Ee(){ye(),O=Date.now()+Md,o=setInterval(()=>{var _,N;if(O-Date.now()<=0){ye();const U=((_=oe().user)==null?void 0:_.userId)||((N=oe().user)==null?void 0:N.email);m.forEach(W=>{Xe({seatId:W.id,userId:U}),W.status="available"}),m=[],c.length=0,q.updateStatuses(u),G("시간이 만료되었습니다. 다시 선택해주세요.");return}},1e3)}function ye(){o&&clearInterval(o),o=null}const xe=new Map(u.map($=>[$.id,$])),pe=new Set;let $e=!1;function we(){fetch(`/seats?eventId=${encodeURIComponent(b.eventId)}`).then($=>$.json()).then($=>{const _=$.seats||[],N=k.map(X=>X.name);let U=!1;m.forEach(X=>pe.add(X.id));const W=new Map;for(const X of _){if(!f(X))continue;W.set(X.seatId,X.status);const Te=xe.get(X.seatId);if(!Te||pe.has(Te.id))continue;let qe="available";X.status==="SOLD"?qe="sold":X.status==="HELD"&&(qe="holding"),Te.status!==qe&&(Te.status=qe,U=!0)}for(const X of u)pe.has(X.id)||X.status!=="available"&&!W.has(X.id)&&(X.status="available",U=!0);pe.clear(),U&&q.updateStatuses(u);const re=_.filter(X=>N.includes(X.section)&&f(X)&&X.status==="AVAILABLE").length,Q=e.querySelector("[data-remaining]");Q&&(Q.textContent=`${ue(re)}석`),!$e&&re===0&&($e=!0,V(),ti(b.eventId))}).catch(()=>{})}T||j()}).catch(()=>{a||(e.innerHTML='<div class="center-state"><div class="center-state__title">좌석 정보를 불러오지 못했습니다.</div></div>')}),()=>{a=!0,d&&clearInterval(d),o&&clearInterval(o),l&&clearTimeout(l),n&&n.close(),c.forEach(y=>Xe(y)),r==null||r.destroy()}}const Bd={render(e,t){return Cd(e,t.id)}};function ii(e,t){return Math.floor(e+Math.random()*(t-e+1))}function Rd(e){const t=[];return e.forEach(i=>{const a=i.count!=null?i.count:i.rows*i.cols,d=i.cols,o=i.rows||Math.ceil(a/d);for(let r=0;r<a;r++){const n=Math.floor(r/d),l=r%d,c=o>1?1-n/(o-1):1,y=(d-1)/2||1,g=1-Math.abs(l-y)/y,b=c*.6+g*.4;t.push({id:`${i.grade}-${n+1}-${l+1}`,grade:i.grade,label:i.label,section:i.zone||`${i.grade[0]}구역`,row:n+1,seatNum:l+1,popularity:b,status:"available"})}}),t}const Hd={VIP:3.2,R:1.8,S:1.2,A:1};function Pd(e,t){if(t<=0||e.length===0)return[];const i=[];e.forEach(o=>{const r=Hd[o.grade]||1,n=Math.max(1,Math.round(r*(.5+(o.popularity||0)*1.5)*3));for(let l=0;l<n;l++)i.push(o)});const a=new Set;let d=0;for(;a.size<Math.min(t,e.length)&&d<i.length*4;){const o=i[ii(0,i.length-1)];a.add(o),d++}return[...a]}function qd(e,t={}){const{tickMs:i=850,holdRangeMs:a=[900,2e3],onTick:d=()=>{},onSoldOut:o=()=>{}}=t;let r=null,n=null,l=!1;const c=new Set;function y(){const S=e.length;let E=0,v=0,k=0;const x={};return e.forEach(s=>{x[s.grade]=x[s.grade]||{total:0,available:0},x[s.grade].total+=1,s.status==="sold"?E+=1:s.status==="mine"?v+=1:s.status==="holding"&&(k+=1),s.status==="available"&&(x[s.grade].available+=1)}),{total:S,sold:E,mine:v,holding:k,available:S-E-v-k,byGrade:x}}function g(){const S=y();return S.available===0&&S.holding===0?(stop(),o(),!0):!1}function b(){if(l)return;const S=e.filter(s=>s.status==="available");if(S.length===0){g()||(r=setTimeout(b,i));return}let E;S.length<=12?E=1:S.length<=80?E=ii(2,5):E=Math.max(3,Math.floor(S.length*(.04+Math.random()*.07))),Pd(S,E).forEach(s=>{s.status="holding";const A=ii(a[0],a[1]),I=setTimeout(()=>{c.delete(I),!(l||s.status!=="holding")&&(s.status="sold",d(e,y()),g())},A);c.add(I)}),d(e,y());const k=y();if(k.available===0&&k.holding===0)return;const x=Math.max(260,i-(1-k.available/k.total)*400);r=setTimeout(b,x)}return{start(){l=!1,r=setTimeout(b,i)},stop(){l=!0,r&&clearTimeout(r),c.forEach(S=>clearTimeout(S)),c.clear()},stats:y,getMineId:()=>n,selectSeat(S){const E=e.find(v=>v.id===S);if(!E||E.status!=="available")return{ok:!1,reason:E&&E.status==="holding"?"holding":"sold"};if(Math.random()<.15)return E.status="sold",d(e,y()),{ok:!1,reason:"taken"};if(n){const v=e.find(k=>k.id===n);v&&v.status==="mine"&&(v.status="available")}return E.status="mine",n=S,d(e,y()),{ok:!0,seat:E}},releaseMine(){if(n){const S=e.find(E=>E.id===n);S&&S.status==="mine"&&(S.status="available"),n=null,d(e,y())}}}}function Ta(e,t=120){return[{grade:e.grade,label:e.label,zone:e.label,cols:12,count:t}]}const Oi=location.host,Ci=5,Ud=1e3;function jd(e,{onMessage:t,onStatusChange:i}={}){let a=null,d=0,o=!1;function r(){if(!o){try{a=new WebSocket(`ws://${Oi}/ws/seats/${e}`)}catch(n){console.warn("[SeatSocket] WebSocket 생성 실패:",n.message),i==null||i("failed");return}a.addEventListener("open",()=>{console.log(`[SeatSocket] 연결 성공 (${Oi})`),d=0,i==null||i("connected")}),a.addEventListener("message",n=>{try{const l=JSON.parse(n.data);t==null||t(l)}catch{}}),a.addEventListener("close",()=>{if(!o)if(d<Ci){const n=Ud*Math.pow(2,d)+Math.random()*500;d++,console.log(`[SeatSocket] 재연결 시도 ${d}/${Ci} (${Math.round(n)}ms 후)`),i==null||i("reconnecting"),setTimeout(r,n)}else console.warn("[SeatSocket] 최대 재연결 횟수 초과"),i==null||i("failed")}),a.addEventListener("error",()=>{})}}return r(),{close(){o=!0,a&&a.readyState<=WebSocket.OPEN&&a.close()}}}const ci=3e3;async function Gd(e){const t=new AbortController,i=setTimeout(()=>t.abort(),ci);try{const a=await fetch(e,{signal:t.signal});if(!a.ok)throw new Error(`HTTP ${a.status}`);return await a.json()}finally{clearTimeout(i)}}async function Wd(){const e=await Gd("/seats");return Array.isArray(e.seats)?e.seats:[]}async function zd(e,t,i){const a=new AbortController,d=setTimeout(()=>a.abort(),ci);try{return await(await fetch("/seats/hold",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:e,seatId:t,token:i}),signal:a.signal})).json()}finally{clearTimeout(d)}}async function Bi(e,t){const i=new AbortController,a=setTimeout(()=>i.abort(),ci);try{return await(await fetch("/seats/release",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:e,seatId:t}),signal:i.signal})).json()}finally{clearTimeout(a)}}const Ri=8*60*1e3+42*1e3,Yd=168,Vd={VIP:"#B5121B",R:"#C98500",S:"#199E70",A:"#3987E5"},Kd={AVAILABLE:"available",HELD:"holding",SOLD:"sold",CANCELLED:"available"};function Jd(e,t){return t.every(i=>Kt(e,i.id)<=0)}function Hi(e,t,i,a){Jd(t.id,a)?(e.innerHTML=`
      <div class="soldout-panel">
        <div class="soldout-title">SOLD OUT</div>
        <div class="soldout-desc">티켓이 모두 매진되었습니다.<br/>현재 예매 가능한 좌석이 없습니다.</div>
      </div>
    `,ti(t.id)):(e.innerHTML=`
      <div class="soldout-panel">
        <div class="soldout-title" style="font-size:30px;">${i.label} 매진</div>
        <div class="soldout-desc">이 구역의 좌석이 모두 판매되었습니다.<br/>다른 구역에는 아직 좌석이 남아있어요.</div>
        <div class="soldout-actions">
          <button class="btn btn-primary btn-lg" data-back-zones>다른 구역 선택하기</button>
        </div>
      </div>
    `,e.querySelector("[data-back-zones]").addEventListener("click",()=>z(`zones/${t.id}`)))}async function Xd(e){const i=(await Wd()).filter(r=>r.section===e.id||r.section===e.grade||r.section===e.label);if(i.length===0)return null;const a=12,d=i.map((r,n)=>({id:r.seatId,grade:e.grade,label:e.label,section:e.label,row:Math.floor(n/a)+1,seatNum:n%a+1,popularity:.5,status:Kd[r.status]||"available"}));return{sections:Ta(e,d.length),seats:d}}const Zd={render(e,t){const i=St(t.id);if(!i){e.innerHTML='<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>';return}const a=_t(i);Za(i.id,a);const d=a.find(P=>P.id===t.zoneId);if(!d){e.innerHTML='<div class="center-state"><div class="center-state__title">구역 정보를 찾을 수 없습니다</div></div>';return}const o=ni(i.id),n=i.venue==="올림픽홀"?1200:Yd,l=Math.max(0,Math.min(n,Kt(i.id,d.id)));if(l<=0){e.innerHTML='<div class="container" style="padding:60px 0;"></div>',Hi(e.querySelector(".container"),i,d,a);return}let c=Ta(d,l),y=Rd(c);e.innerHTML=`
      <section class="seat-page-header">
        <div class="container seat-page-header__top">
          <div>
            <div class="seat-page-header__title">${i.artist} <span class="badge badge-outline">${d.label}</span></div>
            <div class="section-sub">${i.title}</div>
            <div class="seat-page-header__date">${o?`${o.date} ${o.time}`:""} · ${i.venue}</div>
          </div>
          <div class="seat-page-header__right" data-hold-timer-box></div>
        </div>
        <div class="container" style="padding:0;">
          <div class="notice-box mt-16"><p><strong>공연일마다 1매, 인당 최대 2매</strong> 구매 가능합니다.</p></div>
        </div>
      </section>

      <div class="container">
        <div class="seats-left-banner" data-banner>
          <div>
            <div class="seats-left-banner__msg" data-tension-msg>실시간으로 좌석이 예매되고 있습니다.</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:12px;color:var(--color-text-secondary);">AVAILABLE</div>
            <div class="seats-left-banner__num num-mono" data-remaining>${ue(y.length)}석</div>
          </div>
        </div>
      </div>

      <div class="container" data-body>
        <div class="seat-select-body">
          <div class="seatmap-scroll"><div class="seatmap-inner" data-seatmap></div></div>
          <div class="order-rail" data-rail>
            <div class="order-rail__zones" data-zone-nav></div>
            <div class="order-rail__order" data-order-box>
              <div class="order-rail__title">선택 좌석 정보</div>
              <div class="order-rail__empty">보라색 좌석 중 원하는 자리를 선택해주세요</div>
            </div>
          </div>
        </div>
      </div>
      <div class="container" data-soldout style="display:none;"></div>
    `;const g=e.querySelector("[data-seatmap]"),b=e.querySelector("[data-remaining]"),S=e.querySelector("[data-banner]"),E=e.querySelector("[data-tension-msg]");e.querySelector("[data-rail]");const v=e.querySelector("[data-order-box]"),k=e.querySelector("[data-zone-nav]"),x=e.querySelector("[data-hold-timer-box]"),s=e.querySelector("[data-body]"),A=e.querySelector("[data-soldout]");let I=null,w=null,M=null,L=!1,f=null,h=null;function u(P){const q=P.available;b.textContent=`${ue(q)}석`;const te=q<=40;S.classList.toggle("tension",te),q<=5?E.textContent="곧 매진됩니다. 서둘러주세요!":q<=15?E.textContent="남은 좌석이 얼마 남지 않았습니다.":q<=40?E.textContent="좌석이 빠르게 매진되고 있습니다.":E.textContent="실시간으로 좌석이 예매되고 있습니다."}function F(P,q){c=P,y=q,g.innerHTML="",f=li(g,{sections:c,seats:y,onSeatClick:O,venue:i.venue}),h&&h.stop(),h=qd(y,{tickMs:900,onTick:(te,T)=>{f.updateStatuses(te),u(T)},onSoldOut:()=>{M||ge()}}),u(h.stats())}F(c,y);let D=!1,C=null;const R={"seat.held":"holding","seat.sold":"sold","seat.released":"available","seat.cancelled":"available"};function p(P){if(D||(D=!0,h.stop()),P&&P.type==="snapshot"&&Array.isArray(P.seats))P.seats.forEach(q=>{const te=y.find(T=>T.id===q.seatId);te&&te.id!==(M==null?void 0:M.id)&&(te.status=q.status)}),f.updateStatuses(y);else if(P&&P.type==="seat.sold_out"){M||ge();return}else if(P&&P.seatId&&R[P.type]){if(M&&P.seatId===M.id)return;const q=y.find(te=>te.id===P.seatId);if(!q)return;q.status=R[P.type],f.updateStatuses([q])}else return;u(h.stats())}Xd(d).then(P=>{var te;if(!P||M)return;F(P.sections,P.seats),D=!0;const q=(te=P.seats[0])==null?void 0:te.id.split(":")[0];q&&(C=jd(q,{onMessage:p,onStatusChange:T=>{T==="failed"&&!D&&h.start()}}),console.log(`[live] WebSocket 연결 — eventId: ${q}`)),console.log(`[live] A파트 실좌석 ${P.seats.length}석 로딩 완료`)}).catch(P=>console.warn("[live] 실좌석 로딩 실패 — mock 유지:",P.message));let m=!1;function O(P){if(m)return;const q=y.find(te=>te.id===P);if(!q||q.status!=="available"){f.flashSold(P),fe({title:"이미 선택된 좌석입니다!",bodyHtml:"<p>다른 사용자가 먼저 해당 좌석을 선택했습니다.<br/>다른 좌석을 선택해주세요.</p>",footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close>다른 좌석 선택</button>'});return}D?G(P,q):H(P)}function H(P){const q=h.selectSeat(P);if(!q.ok){f.flashSold(P),fe({title:"이미 선택된 좌석입니다!",bodyHtml:"<p>다른 사용자가 먼저 해당 좌석을 선택했습니다.<br/>다른 좌석을 선택해주세요.</p>",footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close>다른 좌석 선택</button>'});return}M=q.seat,ne(),J()}async function G(P,q){const te=oe().user;if(!te){fe({title:"로그인이 필요합니다",bodyHtml:"<p>좌석을 선점하려면 로그인해주세요.</p>",footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close>확인</button>'});return}const T=xa(i.id);if(!T){fe({title:"입장 토큰이 없습니다",bodyHtml:"<p>대기열을 통해 입장 허용을 받아야 좌석을 선점할 수 있습니다.</p>",footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close>확인</button>'});return}if(m=!0,q.status="holding",f.updateStatuses([q]),M&&M.id!==P)try{await Bi(te.userId,M.id);const j=y.find(V=>V.id===M.id);j&&(j.status="available",f.updateStatuses([j]))}catch{}try{const j=await zd(te.userId,P,T.token);j.success?(q.status="mine",f.updateStatuses([q]),M=q,ne(),J(),console.log(`[live] 좌석 선점 성공: ${P}`)):(q.status=j.reason==="unavailable"?"holding":"available",f.updateStatuses([q]),f.flashSold(P),fe({title:"좌석 선점 실패",bodyHtml:`<p>${j.message||"다른 사용자가 먼저 선택했습니다."}<br/>다른 좌석을 선택해주세요.</p>`,footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close>다른 좌석 선택</button>'}))}catch(j){q.status="available",f.updateStatuses([q]),fe({title:"서버 연결 실패",bodyHtml:"<p>좌석 선점 요청에 실패했습니다.<br/>잠시 후 다시 시도해주세요.</p>",footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close>확인</button>'}),console.error("[live] holdSeat API 실패:",j.message)}finally{m=!1}}function K(){k.innerHTML=`
        <div class="order-rail__zones-title">구역 선택</div>
        <div class="zone-nav-list">
          ${a.map(P=>{const q=Kt(i.id,P.id),te=P.id===d.id,T=q<=0;return`
                <button type="button" class="zone-nav-row ${te?"active":""} ${T?"is-soldout":""}"
                  data-switch-zone="${P.id}" style="--zone-color:${P.color||Vd[P.grade]||"var(--color-primary)"}" ${te||T?"disabled":""}>
                  <span class="zone-nav-row__label">${P.label}</span>
                  <span class="zone-nav-row__remain">${T?"SOLD OUT":`${ue(q)}석`}</span>
                </button>
              `}).join("")}
        </div>
      `,k.querySelectorAll("[data-switch-zone]").forEach(P=>{P.addEventListener("click",()=>z(`seats/${i.id}/${P.dataset.switchZone}`))})}K();function Z(){v.innerHTML=`
        <div class="order-rail__title">선택 좌석 정보</div>
        <div class="order-rail__empty">보라색 좌석 중 원하는 자리를 선택해주세요</div>
      `}function J(){const P=i.grades.find(q=>q.key===M.grade);v.innerHTML=`
        <div class="order-rail__title">선택 좌석</div>
        <div class="order-rail__seat">
          <div class="order-rail__seat-grade">${P.name}</div>
          <div class="order-rail__seat-loc">${d.label} ${M.row}열 ${M.seatNum}번</div>
          <div class="order-rail__seat-price num-mono">${ve(P.price)}</div>
        </div>
        <button class="btn btn-primary btn-block" data-next>좌석 선택하기</button>
      `,v.querySelector("[data-next]").addEventListener("click",()=>{const q=w;le(),h.stop(),Qa(i.id,d.id,1),di({concertId:i.id,session:o,zone:{id:d.id,label:d.label},seat:{...M,price:P.price,gradeName:P.name},source:"regular",securedAt:Date.now(),holdDeadline:q}),z("payment/regular")})}function de(P){x.innerHTML=`
        <div class="seat-page-header__timer">좌석 선택 제한시간</div>
        <div class="seat-page-header__timer num-mono"><b>${si(P)}</b></div>
      `}function ne(){le(),w=Date.now()+Ri,de(Ri),I=setInterval(()=>{const P=w-Date.now();if(P<=0){if(le(),M){const q=y.find(te=>te.id===M.id);q&&q.status==="mine"&&(q.status="available"),f.updateStatuses(q?[q]:[]),M=null,Z(),fe({title:"좌석 예약 시간이 만료되었습니다",bodyHtml:'<p>결제 제한시간 내에 결제하지 않아 선택하신 좌석이 자동으로 해제되었습니다.<br/>다시 좌석을 선택해주세요.</p><p class="policy-note mt-8">※ 결제 전 예약이 만료된 것이므로 취소 수수료는 발생하지 않습니다.</p>',footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close>확인</button>'})}x.innerHTML="";return}de(P)},1e3)}function le(){I&&clearInterval(I),I=null,M||(x.innerHTML="")}function ge(){L||(L=!0,s.style.display="none",A.style.display="block",Hi(A,i,d,a))}return()=>{if(h.stop(),C&&C.close(),I&&clearInterval(I),M){const P=oe().user;P&&Bi(P.userId,M.id).catch(()=>{})}}}},Qd={clock:ha,mmss:si,deadline:ht};function en(e,t){const{targetMs:i,format:a="clock",label:d="",size:o="",onComplete:r=()=>{},onTick:n=()=>{}}=t,l=Qd[a]||ha;let c=!1;function y(S){const E=l(S);if(a==="deadline")e.innerHTML=`${d?`<div class="countdown-label">${d}</div>`:""}<div class="countdown-clock ${o} num-mono">${E}</div>`;else{const v=E.split(":").map(k=>k.trim());e.innerHTML=`
        ${d?`<div class="countdown-label">${d}</div>`:""}
        <div class="countdown-clock ${o} num-mono">${v.map((k,x)=>`<span>${k}</span>${x<v.length-1?'<span class="colon">:</span>':""}`).join("")}</div>
      `}}function g(){const S=i-Date.now();if(S<=0){y(0),c||(c=!0,r());return}y(S),n(S)}g();const b=setInterval(g,1e3);return()=>clearInterval(b)}const tn=24*60*60*1e3,an=8*60*1e3+42*1e3,on=/^01[016789]-\d{3,4}-\d{4}$/,ai=["카카오뱅크","국민은행","신한은행","우리은행","하나은행","토스뱅크"];function Bt(e){let t="";for(let i=0;i<e;i++)t+=Math.floor(Math.random()*10);return t}function Pi(e){return{bank:e||ai[Math.floor(Math.random()*ai.length)],number:`${Bt(3)}-${Bt(2)}-${Bt(6)}`}}function Rt(e){const t=String(e||"").replace(/\D/g,"").slice(0,11);return t.length<=3?t:t.length<=7?`${t.slice(0,3)}-${t.slice(3)}`:`${t.slice(0,3)}-${t.slice(3,t.length===10?6:7)}-${t.slice(t.length===10?6:7)}`}function qi(e){return String(e??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}const dn={render(e,t){const i=t.type==="cancel"?"cancel":"regular",a=oe().currentOrder,d=a?i==="cancel"?[a.seat]:a.seats||[]:[];if(!a||d.length===0){e.innerHTML=`
        <div class="center-state">
          <div class="center-state__icon">🎫</div>
          <div class="center-state__title">결제할 주문이 없습니다</div>
          <div class="center-state__desc">좌석을 먼저 선택해주세요.</div>
          <button class="btn btn-primary" data-home>홈으로</button>
        </div>`,e.querySelector("[data-home]").addEventListener("click",()=>z(""));return}e.innerHTML='<div class="center-state"><div class="center-state__title">결제 정보 불러오는 중...</div></div>';let o=!1,r=null;return fetch("/events").then(l=>l.json()).then(l=>{if(o)return;const c=(l.events||[]).find(y=>y.eventId===a.concertId);if(!c){e.innerHTML='<div class="center-state"><div class="center-state__title">공연 정보를 찾을 수 없습니다</div></div>';return}r=n(c)}).catch(()=>{o||(e.innerHTML='<div class="center-state"><div class="center-state__title">결제 정보를 불러오지 못했습니다.</div></div>')}),()=>{o=!0,r&&r()};function n(l){var h,u,F,D,C;const c=i==="cancel"?a.securedAt+tn:a.holdDeadline||a.securedAt+an,y=(h=a.session)!=null&&h.date?a.session.date.replaceAll("-","."):l.eventDate||"",g=((u=a.session)==null?void 0:u.time)||"",b=0,S=d.reduce((R,p)=>R+Number(p.price||0),0),E=S-b;let v=null,k=!1;e.innerHTML=`
      <div class="container payment-body">
        <div>
          <div class="eyebrow">${i==="cancel"?"취소표 결제":"PAYMENT · STEP 5"}</div>
          <h2 class="section-title">${i==="cancel"?"취소표 결제":"결제 정보 확인"}</h2>

          ${i==="cancel"?`
          <div class="payment-deadline-box mt-24">
            <div>
              <div class="payment-deadline-box__label">남은 결제시간</div>
              <div class="payment-deadline-box__time num-mono" data-deadline></div>
            </div>
            <span class="badge badge-red">결제 대기</span>
          </div>
          <div class="notice-box mt-16">
              <p>취소표를 확보한 시점부터 <strong>24시간 이내</strong> 결제를 완료해야 합니다.</p>
              <p>24시간 이내 결제하지 않으면 티켓은 <strong>자동 취소</strong>됩니다.</p>
              <p>취소된 티켓은 다시 취소표 Pool로 돌아가며 다음 대기자에게 배부됩니다.</p>
          </div>`:`
          <div class="notice-box mt-16">
              <p>우측 상단의 <strong>제한시간 내에 결제하기 버튼을 눌러야</strong> 예매가 확정됩니다.</p>
              <p>제한시간이 지나면 좌석이 자동 해제됩니다.</p>
          </div>
          <div style="display:none;"><span data-deadline></span></div>`}

          <div class="detail-info-card mt-24">
            <h3>구매자 정보</h3>
            <div class="field">
              <label>이름</label>
              <input type="text" data-buyer-name placeholder="예매자 이름" value="${((F=oe().user)==null?void 0:F.name)||""}" />
            </div>
            <div class="field">
              <label>전화번호</label>
              <input type="tel" data-buyer-phone placeholder="010-1234-5678" value="${Rt(((D=oe().user)==null?void 0:D.phone)||"")}" maxlength="13" inputmode="numeric" autocomplete="tel" />
            </div>
            <div class="field" style="margin-bottom:0;">
              <label>이메일</label>
              <input type="email" data-buyer-email placeholder="example@email.com" value="${((C=oe().user)==null?void 0:C.email)||""}" />
            </div>
          </div>

          <div class="mt-24">
            <h3 style="font-size:15px;font-weight:800;margin-bottom:14px;">결제 수단</h3>
            <label class="radio-row checked"><input type="radio" name="pay" value="card" checked /> 신용카드</label>
            <label class="radio-row"><input type="radio" name="pay" value="easy" /> 간편결제</label>
            <label class="radio-row"><input type="radio" name="pay" value="vbank" /> 무통장 입금</label>

            <div class="field" data-vbank-bank-field style="display:none;margin-top:14px;margin-bottom:0;">
              <label>입금 은행 선택</label>
              <select data-vbank-bank>
                ${ai.map(R=>`<option value="${R}">${R}</option>`).join("")}
              </select>
              <p class="policy-note mt-8">· 은행 점검 시간(매일 23:30 이후)에는 입금이 제한될 수 있습니다.</p>
              <p class="policy-note">· 가상계좌는 ATM 입금이 되지 않을 수 있으니 인터넷/모바일 뱅킹을 이용해주세요.</p>
              <p class="policy-note">· 현금영수증 발급을 원하시면 결제 완료 후 고객센터 FAQ의 안내를 참고해주세요.</p>
            </div>
          </div>

          <div class="mt-24" data-refund-summary></div>
        </div>

        <div class="summary-card">
          <div class="detail-info-card" style="margin-bottom:20px;box-shadow:none;padding:0;border:none;">
            <h3>예매 상세 정보</h3>
            <div class="kv-row"><span>공연명</span><b>${l.eventName}</b></div>
            <div class="kv-row"><span>공연 날짜</span><b>${y}</b></div>
            ${g?`<div class="kv-row"><span>공연 시간</span><b>${g}</b></div>`:""}
            <div class="kv-row"><span>공연장</span><b>${l.venue}</b></div>
            ${d.length===1?`<div class="kv-row"><span>좌석 등급</span><b>${d[0].gradeName}</b></div>
                   <div class="kv-row"><span>구역</span><b>${d[0].section||d[0].gradeName}</b></div>
                   <div class="kv-row"><span>좌석 번호</span><b>${d[0]._displayNum||d[0].seatNum}번</b></div>`:`<div class="kv-row" style="align-items:flex-start;"><span>선택 좌석 (${d.length}매)</span>
                     <b style="text-align:right;">${d.map(R=>`${R.gradeName} ${R._displayNum||R.seatNum}번`).join("<br/>")}</b>
                   </div>`}
          </div>

          <div class="divider" style="margin:0 0 20px;"></div>

          <div class="summary-card__title">결제 금액</div>
          <div class="kv-row"><span>티켓 금액</span><b class="num-mono">${ve(S)}</b></div>
          <div class="kv-row"><span>할인 금액</span><b class="num-mono">-${ve(b)}</b></div>
          ${i==="cancel"?'<div class="kv-row"><span>구분</span><b><span class="badge badge-red">취소표</span></b></div>':""}
          <div class="summary-total"><span>최종 결제 금액</span><b class="num-mono">${ve(E)}</b></div>

          <div class="vbank-box" data-vbank-box style="display:none;"></div>

          <label class="pay-agree-row mt-24">
            <input type="checkbox" data-agree />
            <span>취소 및 환불 규정을 확인했으며 이에 동의합니다.</span>
          </label>

          <button class="btn btn-primary btn-block mt-16" data-pay disabled>결제하기</button>
        </div>
      </div>
    `;const x=e.querySelector("[data-vbank-box]"),s=e.querySelector("[data-vbank-bank-field]"),A=e.querySelector("[data-vbank-bank]"),I=e.querySelector("[data-buyer-phone]");I==null||I.addEventListener("input",()=>{const R=I.value.length,p=I.selectionStart??R;I.value=Rt(I.value);const m=I.value.length-R,O=Math.max(0,Math.min(I.value.length,p+m));I.setSelectionRange(O,O)});function w(){var p;if(((p=e.querySelector('input[name="pay"]:checked'))==null?void 0:p.value)!=="vbank"){x.style.display="none",s.style.display="none";return}s.style.display="block",v||(v=Pi(A.value)),x.style.display="block",x.innerHTML=`
        <div class="vbank-box__label">입금할 가상계좌</div>
        <div class="vbank-box__bank">${v.bank}</div>
        <div class="vbank-box__number num-mono">${v.number}</div>
        <div class="vbank-box__amount">입금액 <b class="num-mono">${ve(E)}</b></div>
        <p class="policy-note mt-8">결제하기를 누른 뒤, 마이페이지 &gt; 예매내역의 "티켓 확인"에서 이 계좌로 입금하시면 예매가 확정됩니다.</p>
      `}A.addEventListener("change",()=>{v=Pi(A.value),w()}),e.querySelectorAll(".radio-row").forEach(R=>{R.addEventListener("click",()=>{e.querySelectorAll(".radio-row").forEach(p=>p.classList.remove("checked")),R.classList.add("checked"),R.querySelector("input").checked=!0,w()})}),$a(e.querySelector("[data-refund-summary]"),{compact:!0});const M=e.querySelector("[data-pay]"),L=e.querySelector("[data-agree]");e.querySelector("[data-agree]").addEventListener("change",R=>{M.disabled=k||!R.target.checked});const f=en(e.querySelector("[data-deadline]"),{targetMs:c,format:i==="cancel"?"deadline":"mmss",onComplete:i==="cancel"?void 0:()=>{var R;k||(k=!0,M.disabled=!0,L.disabled=!0,ft(),ot(),fe({title:"제한시간이 초과되었습니다",bodyHtml:"<p>좌석 선택 제한시간 내에 결제하기를 누르지 않아 예매가 취소되었습니다.<br/>좌석은 자동으로 해제되었습니다. 다시 시도해주세요.</p>",footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close data-goto-zones>구역 다시 선택하기</button>'}),(R=document.querySelector("[data-goto-zones]"))==null||R.addEventListener("click",()=>z(`zones/${l.eventId}`)))}});return M.addEventListener("click",()=>{var J,de,ne,le,ge,P;if(M.disabled||k)return;const R=(J=a.session)==null?void 0:J.date;if(R&&oe().bookings.some(te=>{var T;return te.concertId===l.eventId&&((T=te.session)==null?void 0:T.date)===R&&(te.status==="confirmed"||te.status==="unpaid")})){Y({title:"이미 예매한 날짜입니다",body:`${R} 공연은 이미 예매가 완료되었습니다. 다른 날짜를 선택해주세요.`});return}const p=e.querySelector("[data-buyer-name]").value.trim(),m=e.querySelector("[data-buyer-phone]").value.trim(),O=e.querySelector("[data-buyer-email]").value.trim();if(!p||!m||!O){Y({title:"구매자 정보를 입력해주세요",body:"이름, 전화번호, 이메일을 모두 입력해야 결제할 수 있습니다.",type:"default"});return}if(!on.test(m)){Y({title:"전화번호 형식을 확인해주세요",body:"010-1234-5678 형식으로 입력해주세요.",type:"default"});return}const H=((de=e.querySelector('input[name="pay"]:checked'))==null?void 0:de.value)||"card",G=((ne=oe().user)==null?void 0:ne.userId)||((le=oe().user)==null?void 0:le.email);M.disabled=!0;const K=()=>{const q=d.filter(T=>typeof T.id=="string"&&T.id.includes(":")&&!!G);(q.length?Promise.all(q.map(T=>fetch("/seats/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:G,seatId:T.id})}).then(j=>j.json().then(V=>({ok:j.ok,data:V}))))).then(T=>T.find(j=>!j.ok||!j.data.success)||T[0]):Promise.resolve({ok:!0,data:{success:!0}})).then(({ok:T,data:j})=>{if(!T||!j.success){M.disabled=!1,Y({title:"결제를 완료하지 못했습니다",body:j.message||"좌석 선점이 만료되었을 수 있습니다. 다시 선택해주세요.",type:"default"});return}const V=oo("A");za({bookingId:V,concertId:l.eventId,session:a.session||null,seats:d,price:E,buyer:{name:p,phone:m,email:O},status:H==="vbank"?"unpaid":"confirmed",source:i,paymentMethod:H,virtualAccount:H==="vbank"?v:null,vbankDeadline:H==="vbank"?Date.now()+24*60*60*1e3:null,paidAt:Date.now()}),i==="cancel"&&fa(l.eventId,d[0].grade),ft(),ot(),z(`complete/${V}`)}).catch(()=>{M.disabled=!1,Y({title:"결제 요청에 실패했습니다",body:"네트워크 상태를 확인하고 다시 시도해주세요.",type:"default"})})},Z=Rt(((ge=oe().user)==null?void 0:ge.phone)||"");if(Z!==m){let q=!1;(P=fe({title:"전화번호 변경 확인",bodyHtml:`
            <p style="margin-bottom:14px;">입력한 전화번호가 회원정보와 다릅니다. 이 번호를 회원정보에 저장하고 결제를 진행할까요?</p>
            <div class="kv-row"><span>기존 전화번호</span><b>${qi(Z||"미등록")}</b></div>
            <div class="kv-row"><span>변경할 전화번호</span><b>${qi(m)}</b></div>
            <p class="text-secondary" style="font-size:12px;margin-top:14px;">이메일 정보는 변경하지 않습니다.</p>
          `,footerHtml:`
            <button type="button" class="btn btn-ghost" data-modal-close>다시 입력</button>
            <button type="button" class="btn btn-primary" data-confirm-phone-change>저장하고 결제하기</button>
          `,onClose:()=>{q||(M.disabled=k||!L.checked)}}).el.querySelector("[data-confirm-phone-change]"))==null||P.addEventListener("click",async T=>{const j=T.currentTarget;j.disabled=!0,j.textContent="저장 중...";const V=await ra({phone:m});if(!V.success){j.disabled=!1,j.textContent="저장하고 결제하기",Y({title:"전화번호 저장에 실패했습니다",body:V.message||"잠시 후 다시 시도해주세요.",type:"default"});return}q=!0,ke(),K()});return}K()}),f}}};function nn(e){return(e.seats&&e.seats.length?e.seats:e.seat?[e.seat]:[]).map(i=>`${i.gradeName||i.section} ${i._displayNum||i.seatNum}번`).join(", ")}function sn(e){return e==="refunded"?'<span class="badge badge-gray">환불 완료</span>':e==="refund_pending"?'<span class="badge badge-orange">환불 처리 중</span>':e==="unpaid"?'<span class="badge badge-orange">미입금</span>':'<span class="badge badge-green">🟢 예매 확정</span>'}const rn={render(e,t){let i=null;function a(){var l,c;const o=xi(t.id);if(!o){e.innerHTML='<div class="center-state"><div class="center-state__title">예매 내역을 찾을 수 없습니다</div></div>';return}const r=(l=o.session)!=null&&l.date?o.session.date.replaceAll("-","."):i.eventDate||"",n=o.status==="unpaid";e.innerHTML=`
        <div class="container complete-page">
          ${n?'<div class="vbank-notice">🏦 마이페이지의 예매한 티켓에서 가상계좌를 확인해서 입금을 완료해주세요.</div>':""}
          <div class="complete-check">${n?"🏦":"✓"}</div>
          <h2 class="section-title">${n?"입금 확인 대기 중":o.status==="confirmed"?"예매가 완료되었습니다":"예매 티켓"}</h2>
          <p class="section-sub">${n?"아래 가상계좌로 입금을 완료하면 예매가 확정됩니다.":o.source==="cancel"?"취소표 예매가 정상적으로 확정되었습니다.":"결제가 정상적으로 완료되었습니다."}</p>

          <div class="complete-ticket">
            <div class="complete-ticket__head">
              <span>예매번호</span>
              <b class="num-mono">${o.bookingId}</b>
            </div>
            <div class="complete-ticket__body">
              <div class="kv-row"><span>공연명</span><b>${i.eventName}</b></div>
              <div class="kv-row"><span>공연일</span><b>${r}${(c=o.session)!=null&&c.time?" "+o.session.time:""}</b></div>
              <div class="kv-row"><span>좌석</span><b>${nn(o)}</b></div>
              <div class="complete-ticket__punch"></div>
              <div class="kv-row"><span>결제금액</span><b class="num-mono">${ve(o.price)}</b></div>
              <div class="kv-row"><span>상태</span><b>${sn(o.status)}</b></div>
            </div>
            ${n&&o.virtualAccount?`
              <div class="complete-ticket__vbank">
                <div class="vbank-box__label">입금할 가상계좌</div>
                <div class="vbank-box__bank">${o.virtualAccount.bank}</div>
                <div class="vbank-box__number num-mono">${o.virtualAccount.number}</div>
                <div class="vbank-box__amount">입금액 <b class="num-mono">${ve(o.price)}</b></div>
                <p class="policy-note mt-8">마이페이지 &gt; 예매내역에서 언제든 이 계좌 정보를 다시 확인할 수 있습니다.</p>
              </div>`:""}
          </div>

          <div class="flex gap-12 mt-40" style="justify-content:center;">
            <button class="btn btn-outline btn-lg" data-history>예매내역 보기</button>
            <button class="btn btn-primary btn-lg" data-mypage>마이페이지로 이동</button>
          </div>
        </div>
      `,e.querySelector("[data-history]").addEventListener("click",()=>z("mypage/bookings")),e.querySelector("[data-mypage]").addEventListener("click",()=>z("mypage"))}const d=xi(t.id);if(!d){e.innerHTML='<div class="center-state"><div class="center-state__title">예매 내역을 찾을 수 없습니다</div></div>';return}e.innerHTML='<div class="center-state"><div class="center-state__title">예매 정보 불러오는 중...</div></div>',fetch("/events").then(o=>o.json()).then(o=>{if(i=(o.events||[]).find(r=>r.eventId===d.concertId),!i){e.innerHTML='<div class="center-state"><div class="center-state__title">공연 정보를 찾을 수 없습니다</div></div>';return}a()}).catch(()=>{e.innerHTML='<div class="center-state"><div class="center-state__title">예매 정보를 불러오지 못했습니다.</div></div>'})}},Ht=5*60*1e3,ln={render(e,t){const i=t.id;if(!Le()){We(`cancel-queue/${i}`),z("login");return}e.innerHTML='<div class="center-state"><div class="center-state__title">취소표 대기열 불러오는 중...</div></div>';let a=!1,d=null,o=null;return fetch("/events").then(r=>r.json()).then(r=>{if(a)return;const n=(r.events||[]).find(A=>A.eventId===i);if(!n){e.innerHTML='<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>';return}const l=va(i),c=dt(i);oe().user;const y=He();e.innerHTML=`
          <section class="cancel-hero">
            <div class="container">
              <div class="eyebrow" style="color:var(--color-primary);font-family:var(--font-mono);font-size:11px;letter-spacing:3px;">CANCELLATION QUEUE</div>
              <h2 class="section-title">${n.eventName}</h2>
              <p class="section-sub">${n.eventDate||""} · ${n.venue||""} · 매진된 좌석의 취소표를 대기열 순서대로 배부합니다</p>
            </div>
          </section>

          <div class="container cancel-body">
            <div>
              <!-- 단계 표시 -->
              <div class="cancel-steps" data-steps>
                <div class="cancel-step active"><span class="cancel-step__num">01</span>대기열 등록</div>
                <div class="cancel-step"><span class="cancel-step__num">02</span>Secret Link 발급</div>
                <div class="cancel-step"><span class="cancel-step__num">03</span>좌석 선택 · 결제</div>
              </div>

              <!-- 대기 현황 카드 -->
              <div class="card" style="padding:28px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <h3 style="font-size:15px;font-weight:800;">내 취소표 대기 현황</h3>
                  <span class="queue-status-pill"><span class="dot"></span><span data-status>대기 중</span></span>
                </div>
                <div class="queue-mynum-label" style="margin-top:22px;">내 대기번호</div>
                <div class="queue-mynum num-mono" style="font-size:64px;" data-mynum>${ue(l.myNumber)}번</div>
                <div class="divider"></div>
                <div class="kv-row"><span>전체 대기자</span><b class="num-mono">${ue(l.total)}명</b></div>
                <div class="kv-row"><span>예상 대기시간</span><b class="num-mono" data-eta>약 ${Math.max(1,Math.round(l.myNumber/l.total*210))}분</b></div>
              </div>

              <!-- 멤버십/Secret Link 상태 카드 -->
              <div class="card mt-24" style="padding:28px;" data-membership-card></div>
            </div>

            <div>
              <!-- 취소표 Pool -->
              <div class="card" style="padding:28px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <h3 style="font-size:15px;font-weight:800;">취소표 Pool</h3>
                  <span class="queue-status-pill"><span class="dot"></span>취소표 수집 중</span>
                </div>
                <p class="section-sub" style="margin-top:6px;">취소된 티켓은 즉시 배부되지 않고 Pool에 모여 순서대로 배부됩니다.</p>
                <div class="pool-grid" data-pool>
                  ${(n.sections||[{name:"A"}]).map(A=>`
                    <div class="pool-grade-card">
                      <div class="pool-grade-card__grade">${A.name||A.label}</div>
                      <div class="pool-grade-card__count num-mono" data-pool-${A.name||A.label}>${c[A.name||A.label]||0}매</div>
                    </div>
                  `).join("")}
                </div>
                <div class="pool-total">현재 수집된 취소표 총 <b class="num-mono" data-pool-total>${Object.values(c).reduce((A,I)=>A+I,0)}</b>매</div>
              </div>

              <!-- 정책 안내 -->
              <div class="card mt-24" style="padding:28px;">
                <h3 style="font-size:15px;font-weight:800;margin-bottom:14px;">취소표 배부 정책</h3>
                <div class="notice-box">
                  <p>· 이 링크는 대기열에서 발급된 <strong>1인 전용 링크</strong>이며, 타인과 공유할 수 없습니다.</p>
                  <p>· Secret Link 발급 후 <strong>5분</strong> 안에 좌석·결제를 모두 완료해야 합니다.</p>
                  <p>· 5분을 초과하면 링크가 즉시 만료되며, 대기열의 다음 순번에게 넘어갑니다.</p>
                  <p>· Secret Link는 <strong>멤버십 회원</strong>에게만 제공됩니다.</p>
                  <p>· <strong>1인 1매</strong> — 취소표는 1인 1매만 구매할 수 있습니다.</p>
                </div>
              </div>

              <!-- 순차 배부 흐름 -->
              <div class="card mt-24" style="padding:28px;">
                <h3 style="font-size:15px;font-weight:800;margin-bottom:14px;">취소표 순차 배부 방식</h3>
                <div class="flow-diagram">
                  <span class="flow-step active">1번 Secret Link 발급</span>
                  <span class="flow-arrow">→</span>
                  <span class="flow-step">취켓팅 진행</span>
                  <span class="flow-arrow">→</span>
                  <span class="flow-step">종료</span>
                  <span class="flow-arrow">→</span>
                  <span class="flow-step">2번 Secret Link 발급</span>
                  <span class="flow-arrow">→</span>
                  <span class="flow-step">... 반복</span>
                </div>
              </div>
            </div>
          </div>
        `;const g=e.querySelector("[data-membership-card]");let b=y?"member-waiting":"non-member",S=null;function E(A){var w,M,L,f,h,u,F,D,C;b=A;const I=e.querySelectorAll(".cancel-step");if(A==="non-member"&&((w=I[0])==null||w.classList.add("active"),(M=I[1])==null||M.classList.remove("active","done"),(L=I[2])==null||L.classList.remove("active","done"),g.innerHTML=`
              <div class="lock-box">
                <div class="lock-box__icon">🔒</div>
                <div class="lock-box__title">멤버십 가입 필요</div>
                <div class="lock-box__desc">
                  현재 <strong>${ue(l.myNumber)}번째</strong> 대기 중입니다.<br/>
                  취소표 발생 시 <strong>Secret Link(5분 예매권)</strong>는 멤버십 회원에게만 제공됩니다.<br/>
                  지금 멤버십에 가입하시면, 순번 도래 시 즉시 Secret Link가 발급됩니다.
                </div>
                <button class="btn btn-primary" data-join-membership>멤버십 가입하기</button>
              </div>
            `,g.querySelector("[data-join-membership]").addEventListener("click",()=>z("membership"))),A==="member-waiting"&&((f=I[0])==null||f.classList.add("active","done"),(h=I[1])==null||h.classList.add("active"),(u=I[2])==null||u.classList.remove("active","done"),g.innerHTML=`
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="font-size:15px;font-weight:800;">Secret Link 대기 현황</h3>
                <span class="badge badge-green" style="font-size:11px;">MEMBERSHIP ✓</span>
              </div>
              <div class="notice-box" style="background:rgba(34,197,94,0.08);border-color:rgba(34,197,94,0.2);margin-bottom:16px;">
                <p style="color:var(--color-text);">멤버십 상태가 확인되었습니다! 순번 도래 시 Secret Link가 발급됩니다.</p>
              </div>
              <div class="kv-row"><span>내 대기번호</span><b class="num-mono" data-m-num>${ue(l.myNumber)}번</b></div>
              <div class="kv-row"><span>상태</span><b><span class="queue-status-pill"><span class="dot"></span>대기 중 — Secret Link 발급 대기</span></b></div>
              <div class="kv-row"><span>알림</span><b class="text-red">ON</b></div>
              <div style="margin-top:16px;" data-m-progress></div>
            `,x()),A==="secret-link-active"){(F=I[0])==null||F.classList.add("done"),(D=I[1])==null||D.classList.add("active","done"),(C=I[2])==null||C.classList.add("active");const R=e.querySelector("[data-status]");R&&(R.textContent="Secret Link 발급됨"),g.innerHTML=`
              <div style="text-align:center;padding:16px 0 4px;">
                <div class="badge badge-green" style="font-size:14px;padding:10px 20px;margin-bottom:16px;">🎉 취소표가 배정되었습니다!</div>
                <div class="cancel-timer-wrap">
                  <div class="cancel-timer-label">남은 예매 시간</div>
                  <div class="cancel-timer num-mono" data-countdown>05:00</div>
                  <div class="cancel-timer-bar"><div class="cancel-timer-bar__fill" data-timer-bar></div></div>
                </div>
                <div style="font-size:13px;color:var(--color-text-secondary);margin:16px 0;line-height:1.8;">
                  Secret Link가 발급되었습니다. 5분 안에 좌석을 선택하고 결제를 완료해주세요.<br/>
                  시간 초과 시 기회가 다음 순번으로 넘어갑니다.
                </div>
                <button class="btn btn-primary btn-lg btn-block" data-enter-link>Secret Link 입장하기</button>
              </div>
            `,g.querySelector("[data-enter-link]").addEventListener("click",()=>{z(`private-link/${i}`)}),s()}if(A==="link-expired"){I.forEach(p=>p.classList.remove("active"));const R=e.querySelector("[data-status]");R&&(R.textContent="만료됨"),g.innerHTML=`
              <div style="text-align:center;padding:16px 0 4px;">
                <div class="badge badge-dark-red" style="font-size:14px;padding:10px 20px;margin-bottom:16px;">⏱ 시간 초과</div>
                <div style="font-size:15px;font-weight:700;margin-bottom:12px;">5분 제한시간이 초과되었습니다</div>
                <div style="font-size:13px;color:var(--color-text-secondary);line-height:1.8;margin-bottom:20px;">
                  기회가 다음 순번의 멤버십 회원에게 이관되었습니다.<br/>
                  이 링크는 더 이상 사용할 수 없습니다.
                </div>
                <button class="btn btn-outline" data-go-home>홈으로 돌아가기</button>
              </div>
            `,g.querySelector("[data-go-home]").addEventListener("click",()=>z(""))}}const v=14e3;let k=null;function x(){const A=l.myNumber,I=Date.now();let w=!1;function M(){if(w||a)return;const L=Date.now()-I,f=Math.min(1,L/v),h=1-Math.pow(1-f,4),u=Math.max(1,Math.round(A-(A-1)*h)),F=g.querySelector("[data-m-num]");F&&(F.textContent=`${ue(u)}번`),u<=1&&(w=!0,clearInterval(k),S=Date.now()+Ht,E("secret-link-active"))}k=setInterval(M,200),M()}function s(){S||(S=Date.now()+Ht);const A=Ht;function I(){if(a)return;const w=S-Date.now(),M=g.querySelector("[data-countdown]"),L=g.querySelector("[data-timer-bar]");if(w<=0){clearInterval(o),E("link-expired");return}if(M){const f=String(Math.floor(w/6e4)).padStart(2,"0"),h=String(Math.floor(w%6e4/1e3)).padStart(2,"0");M.textContent=`${f}:${h}`,w<=6e4&&M.classList.add("warn")}L&&(L.style.width=`${w/A*100}%`)}o=setInterval(I,1e3),I()}E(b),d=setInterval(()=>{if(a)return;const A=Object.keys(c),I=Math.random();if(I<.55){const L=A[Math.floor(Math.random()*A.length)];ma(i,L)}else if(I<.8){const L=A.filter(f=>c[f]>0);L.length&&fa(i,L[Math.floor(Math.random()*L.length)])}const w=dt(i);A.forEach(L=>{const f=e.querySelector(`[data-pool-${L}]`);f&&(f.textContent=`${w[L]||0}매`)});const M=e.querySelector("[data-pool-total]");M&&(M.textContent=Object.values(w).reduce((L,f)=>L+f,0))},2600)}).catch(()=>{a||(e.innerHTML='<div class="center-state"><div class="center-state__title">취소표 대기열을 불러오지 못했습니다.</div></div>')}),()=>{a=!0,d&&clearInterval(d),o&&clearInterval(o)}}},cn={render(e){const t=He();e.innerHTML=`
      <section class="membership-hero">
        <div class="container">
          <div class="eyebrow">QUEUING MEMBERSHIP</div>
          <h2 class="section-title">취소표를 가장 빠르게 만나는 방법</h2>
          <p class="section-sub">멤버십 회원만 취소표 Private Link를 통해 취켓팅에 참여할 수 있습니다</p>
          ${t?'<div class="mt-16"><span class="badge badge-red" style="font-size:13px;padding:8px 16px;">✓ 이미 멤버십에 가입되어 있습니다</span></div>':""}
        </div>
      </section>

      <div class="container">
        <div class="membership-plans">
          <div class="plan-card">
            <div class="plan-card__name">월간 멤버십</div>
            <div class="plan-card__price">₩3,900<span> / 월</span></div>
            <ul class="plan-benefits">
              <li><b>✓</b> 취소표 예매 권한</li>
              <li><b>✓</b> 취소표 발생 알림</li>
              <li><b>✓</b> 내 차례 알림</li>
              <li><b>✓</b> Private Link 제공</li>
            </ul>
            <button class="btn btn-outline btn-block" data-plan="monthly" ${t?"disabled":""}>${t?"가입됨":"멤버십 가입하기"}</button>
          </div>
          <div class="plan-card featured">
            <div class="plan-card__ribbon">추천</div>
            <div class="plan-card__name">연간 멤버십</div>
            <div class="plan-card__price">₩34,800<span> / 년</span></div>
            <ul class="plan-benefits">
              <li><b>✓</b> 취소표 예매 권한</li>
              <li><b>✓</b> 취소표 발생 알림</li>
              <li><b>✓</b> 내 차례 알림</li>
              <li><b>✓</b> Private Link 제공</li>
            </ul>
            <button class="btn btn-primary btn-block" data-plan="yearly" ${t?"disabled":""}>${t?"가입됨":"멤버십 가입하기"}</button>
          </div>
        </div>

        <div class="membership-benefits-strip">
          <div><div class="b-icon">🎟️</div><div class="b-title">취소표 예매 권한</div></div>
          <div><div class="b-icon">🔔</div><div class="b-title">취소표 발생 알림</div></div>
          <div><div class="b-icon">⏰</div><div class="b-title">내 차례 알림</div></div>
          <div><div class="b-icon">🔗</div><div class="b-title">Private Link 제공</div></div>
        </div>
      </div>
    `,e.querySelectorAll("[data-plan]").forEach(i=>{i.addEventListener("click",()=>{if(!Le()){We("membership"),z("login");return}z(`membership-checkout/${i.dataset.plan}`)})})}},Ui={monthly:{label:"월간 멤버십",price:3900,cycle:"월"},yearly:{label:"연간 멤버십",price:34800,cycle:"년"}},yn={render(e,t){const i=Ui[t.plan]?t.plan:"monthly",a=Ui[i];if(!Le()){We(`membership-checkout/${i}`),z("login");return}if(He()){z("mypage/membership");return}e.innerHTML=`
      <div class="container payment-body">
        <div>
          <div class="eyebrow">MEMBERSHIP CHECKOUT</div>
          <h2 class="section-title">멤버십 결제</h2>

          <div class="notice-box mt-24">
            <p>멤버십은 <strong>결제 즉시</strong> 적용되며, 취소표 Private Link 이용 권한이 바로 활성화됩니다.</p>
            <p>구독은 마이페이지 &gt; 멤버십에서 언제든 확인할 수 있습니다.</p>
          </div>

          <div class="mt-24">
            <h3 style="font-size:15px;font-weight:800;margin-bottom:14px;">결제 수단</h3>
            <label class="radio-row checked"><input type="radio" name="pay" checked /> 신용카드</label>
            <label class="radio-row"><input type="radio" name="pay" /> 간편결제</label>
            <label class="radio-row"><input type="radio" name="pay" /> 기타 결제수단</label>
          </div>
        </div>

        <div class="summary-card">
          <div class="summary-card__title">주문 요약</div>
          <div class="kv-row"><span>플랜</span><b>${a.label}</b></div>
          <div class="kv-row"><span>결제 주기</span><b>${a.cycle} 1회</b></div>
          <div class="kv-row"><span>혜택</span><b style="text-align:right;">취소표 예매 권한 · Private Link<br/>발생 알림 · 내 차례 알림</b></div>
          <div class="summary-total"><span>총 결제금액</span><b class="num-mono">${ve(a.price)}</b></div>
          <button class="btn btn-primary btn-block mt-24" data-pay>결제하기</button>
          <button class="btn btn-ghost btn-block mt-8" data-cancel>취소</button>
        </div>
      </div>
    `,e.querySelectorAll(".radio-row").forEach(d=>{d.addEventListener("click",()=>{e.querySelectorAll(".radio-row").forEach(o=>o.classList.remove("checked")),d.classList.add("checked"),d.querySelector("input").checked=!0})}),e.querySelector("[data-cancel]").addEventListener("click",()=>z("membership")),e.querySelector("[data-pay]").addEventListener("click",()=>{const d=e.querySelector("[data-pay]");d.disabled=!0,d.textContent="처리 중...",Ga(i).then(o=>{if(o.success){Y({title:"멤버십 결제 완료",body:"취소표 Private Link 이용이 가능합니다.",type:"success"});const r=ba();z(r||"mypage/membership")}else d.disabled=!1,d.textContent="결제하기",Y({title:"결제에 실패했습니다",body:o.message||"잠시 후 다시 시도해주세요."})})})}},ji=4*60*1e3+52*1e3,xn={render(e,t){const i=t.id;if(!Le()||!He()){z(`cancel-queue/${i}`);return}let a=!1,d=null;const o=Date.now()+ji;return fetch("/events").then(r=>r.json()).then(r=>{if(a)return;const n=(r.events||[]).find(g=>g.eventId===i),l=n?n.eventName:"공연",c=n?n.venue:"";e.innerHTML=`
          <div class="container privatelink-page">
            <div class="privatelink-badge">🔗 SECRET LINK</div>
            <h2 class="section-title">입장할 차례입니다</h2>
            <p class="section-sub mt-8">회원님의 취소표 예매 링크가 발급되었습니다.<br/>${l} · ${c}</p>

            <div class="cancel-timer-wrap mt-40" style="text-align:center;">
              <div class="cancel-timer-label">남은 입장 시간</div>
              <div class="cancel-timer num-mono" data-countdown>04:52</div>
              <div class="cancel-timer-bar"><div class="cancel-timer-bar__fill" data-timer-bar></div></div>
            </div>

            <div class="mt-40" style="text-align:center;">
              <button class="btn btn-primary btn-lg" data-enter>취소표 예매 입장</button>
            </div>

            <div class="privatelink-policy">
              <div class="lock-box__icon" style="text-align:left;">🔒 본인 전용 Secret Link</div>
              <ul>
                <li>1인 1링크 · 1회성</li>
                <li>5분 유효 · 시간 초과 시 자동 만료</li>
                <li>양도/공유/대리 티켓팅 불가</li>
                <li>멤버십 상태 실시간 확인</li>
              </ul>
            </div>
          </div>
        `,e.querySelector("[data-enter]").addEventListener("click",()=>{clearInterval(d),z(`cancel-seats/${i}`)});function y(){var E;if(a)return;const g=o-Date.now(),b=e.querySelector("[data-countdown]"),S=e.querySelector("[data-timer-bar]");if(g<=0){clearInterval(d);const v=e.querySelector(".cancel-timer-wrap");v&&(v.style.display="none");const k=(E=e.querySelector("[data-enter]"))==null?void 0:E.parentElement;k&&(k.innerHTML=`
                <div class="badge badge-dark-red" style="font-size:13px;padding:8px 16px;margin-bottom:14px;">입장 시간 만료</div>
                <div style="font-size:14px;color:var(--color-text-secondary);line-height:1.8;margin-bottom:20px;">
                  Secret Link 사용 시간이 종료되었습니다.<br/>해당 링크는 다시 사용할 수 없습니다.
                </div>
                <button class="btn btn-outline btn-lg" data-mypage>마이페이지로 이동</button>
              `,k.querySelector("[data-mypage]").addEventListener("click",()=>z("mypage")));return}if(b){const v=String(Math.floor(g/6e4)).padStart(2,"0"),k=String(Math.floor(g%6e4/1e3)).padStart(2,"0");b.textContent=`${v}:${k}`,g<=6e4&&b.classList.add("warn")}S&&(S.style.width=`${g/ji*100}%`)}d=setInterval(y,1e3),y()}).catch(()=>{a||(e.innerHTML='<div class="center-state"><div class="center-state__title">페이지를 불러오지 못했습니다.</div></div>')}),()=>{a=!0,d&&clearInterval(d)}}},un={render(e,t){const i=t.id;if(!Le()||!He()){z(`cancel-queue/${i}`);return}e.innerHTML='<div class="center-state"><div class="center-state__title">취소표 좌석 불러오는 중...</div></div>';let a=!1;return Promise.all([fetch("/events").then(d=>d.json()),fetch(`/seats?eventId=${encodeURIComponent(i)}`).then(d=>d.json())]).then(([d,o])=>{var S;if(a)return;const r=(d.events||[]).find(E=>E.eventId===i);if(!r){e.innerHTML='<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>';return}const n=o.seats||[],l=`${i}:`,c=n.filter(E=>E.seatId.startsWith(l)&&E.status==="AVAILABLE");if(c.length===0){e.innerHTML=`
            <div class="center-state">
              <div class="center-state__icon">😥</div>
              <div class="center-state__title">현재 취소표가 소진되었습니다</div>
              <div class="center-state__desc">다음 순번 대기자에게 기회가 넘어갔습니다.</div>
              <button class="btn btn-primary" data-back>취소표 대기열로</button>
            </div>`,e.querySelector("[data-back]").addEventListener("click",()=>z(`cancel-queue/${i}`));return}const y=(r.sections||[]).length?r.sections:[{name:"A",price:r.price}],g={};y.forEach(E=>{const v=c.filter(k=>k.section===E.name);v.length>0&&(g[E.name]={seats:v,price:Number(E.price||r.price),label:`${E.label||E.name}석`})}),e.innerHTML=`
          <section class="seat-page-header">
            <div class="container seat-page-header__top">
              <div>
                <div class="seat-page-header__title">${r.eventName} <span class="badge badge-red">취소표 예매</span></div>
                <div class="seat-page-header__date">${r.eventDate||""} · ${r.venue||""}</div>
              </div>
            </div>
          </section>

          <div class="container">
            <div class="notice-box mt-16">
              <p>지금은 <strong>회원님 순번에만 단독으로 배정된 시간</strong>입니다.</p>
              <p><strong>1인 1매</strong> 제한이 적용됩니다. 좌석을 선택하면 바로 결제로 이동합니다.</p>
            </div>
          </div>

          <div class="container" style="padding-top:20px;">
            <div class="cancel-seat-grid" data-seat-list>
              ${Object.entries(g).map(([E,v])=>`
                <div class="cancel-zone-card">
                  <div class="cancel-zone-card__header">
                    <span class="cancel-zone-card__grade">${v.label}</span>
                    <span class="cancel-zone-card__price num-mono">${ve(v.price)}</span>
                  </div>
                  <div class="cancel-zone-card__seats">
                    ${v.seats.map(k=>{const x=k.seatId.includes(":")?k.seatId.split(":").pop():k.seatId;return`<button type="button" class="cancel-seat-btn" data-seat-id="${k.seatId}" data-section="${E}" data-price="${v.price}" data-label="${v.label} ${x}">${x}</button>`}).join("")}
                  </div>
                  <div class="cancel-zone-card__remain">잔여 ${v.seats.length}석</div>
                </div>
              `).join("")}
            </div>
          </div>

          <div class="container mt-24" data-selected-info style="display:none;">
            <div class="card" style="padding:24px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <div style="font-size:13px;color:var(--color-text-secondary);">선택된 좌석</div>
                  <div style="font-size:18px;font-weight:800;margin-top:4px;" data-sel-label></div>
                </div>
                <div class="num-mono" style="font-size:22px;font-weight:700;color:var(--color-primary);" data-sel-price></div>
              </div>
              <div class="badge badge-red-light" style="margin-top:12px;">1인 1매 제한 적용</div>
              <button class="btn btn-primary btn-block mt-16" data-next>결제하기</button>
            </div>
          </div>
        `;let b=null;e.querySelectorAll(".cancel-seat-btn").forEach(E=>{E.addEventListener("click",()=>{e.querySelectorAll(".cancel-seat-btn").forEach(k=>k.classList.remove("active")),E.classList.add("active"),b={seatId:E.dataset.seatId,section:E.dataset.section,price:Number(E.dataset.price),label:E.dataset.label};const v=e.querySelector("[data-selected-info]");v.style.display="block",e.querySelector("[data-sel-label]").textContent=b.label,e.querySelector("[data-sel-price]").textContent=ve(b.price)})}),(S=e.querySelector("[data-next]"))==null||S.addEventListener("click",()=>{b&&(di({concertId:i,seats:[{id:b.seatId,section:b.section,price:b.price,gradeName:b.label}],source:"cancel",securedAt:Date.now()}),z("payment/cancel"))})}).catch(()=>{a||(e.innerHTML='<div class="center-state"><div class="center-state__title">좌석 정보를 불러오지 못했습니다.</div></div>')}),()=>{a=!0}}},pn=/^01[016789]-\d{3,4}-\d{4}$/;function Pt(e){const t=String(e||"").replace(/\D/g,"").slice(0,11);return t.length<=3?t:t.length<=7?`${t.slice(0,3)}-${t.slice(3)}`:`${t.slice(0,3)}-${t.slice(3,t.length===10?6:7)}-${t.slice(t.length===10?6:7)}`}function Fe(e){return String(e??"").replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;")}const vn=[{key:"",label:"마이페이지"},{key:"bookings",label:"예매내역"},{key:"refunds",label:"취소/환불내역"},{key:"cancel-queue",label:"취소표 대기열"},{key:"membership",label:"멤버십"},{key:"interests",label:"관심 공연"},{key:"notifications",label:"알림"},{key:"profile",label:"회원정보"},{key:"profile-edit",label:"회원정보 수정"}];function Ma(e){return(e.seats&&e.seats.length?e.seats:e.seat?[e.seat]:[]).map(i=>`${i.gradeName||i.section} ${i._displayNum||i.seatNum}번`).join(", ")}function Gi(e){return e.status==="confirmed"?'<span class="badge badge-green">예매 확정</span>':e.status==="unpaid"?'<span class="badge badge-orange">미입금</span>':e.status==="cancelled"?'<span class="badge badge-gray">예매 취소</span>':e.status==="refund_pending"?'<span class="badge badge-orange">환불 처리 중</span>':e.status==="refunded"?'<span class="badge badge-gray">환불 완료</span>':'<span class="badge badge-orange">결제 대기</span>'}function qt(e,t){const i=St(e);if(i)return{name:`${i.artist} · ${i.title}`,dateStart:i.dateStart,venue:i.venue,image:Pe(i.artist||i.title)};const a=(t||[]).find(d=>d.eventId===e);return a?{name:a.eventName,dateStart:a.eventDate||null,venue:a.venue,image:Pe(a.eventName||a.eventId)}:null}function Na(e,t){var c,y;const i=((c=e.session)==null?void 0:c.date)||((y=t.dateStart)==null?void 0:y.slice(0,10));if(!i)return 999;const[a,d,o]=i.split("-").map(Number),r=new Date(a,d-1,o),n=new Date,l=new Date(n.getFullYear(),n.getMonth(),n.getDate());return Math.round((r-l)/864e5)}function mn(e,t){var c,y,g,b;const i=e.status==="unpaid",a=Na(e,t),d=i?0:ka(a),o=Math.round(e.price*d),r=Math.max(0,e.price-o),n=((c=e.session)==null?void 0:c.date)||((y=t.dateStart)==null?void 0:y.slice(0,10)),l=n?n.replaceAll("-","."):"";fe({title:i?"입금 전 예매를 취소하시겠습니까?":"예매를 취소하시겠습니까?",bodyHtml:`
      <p style="margin-bottom:14px;"><strong>${t.name}</strong> 티켓을 ${i?"취소하시겠습니까?":"환불하시겠습니까?"}</p>
      ${l?`<div class="kv-row"><span>공연일</span><b>${l}${(g=e.session)!=null&&g.time?" "+e.session.time:""}</b></div>`:""}
      <div class="kv-row"><span>좌석</span><b>${Ma(e)}</b></div>
      <div class="divider"></div>
      <div class="kv-row"><span>결제금액</span><b class="num-mono">${ve(e.price)}</b></div>
      ${i?'<div class="notice-box mt-16"><p>아직 입금 전이므로 취소 수수료와 환불 금액이 없습니다.</p></div>':`
        <div class="kv-row"><span>취소 수수료</span><b class="num-mono text-red">-${ve(o)}</b></div>
        <div class="kv-row" style="font-size:15px;"><span><b>예상 환불금액</b></span><b class="num-mono text-red" style="font-size:19px;">${ve(r)}</b></div>`}
      ${d>=1?'<div class="notice-box mt-16"><p>공연 당일에는 취소 및 환불이 불가합니다.</p></div>':""}
    `,footerHtml:`
      <button type="button" class="btn btn-ghost" data-modal-close>취소하지 않기</button>
      <button type="button" class="btn btn-primary" data-confirm-refund ${d>=1?"disabled":""}>${i?"예매 취소":"네, 환불합니다"}</button>
    `}),(b=document.querySelector("[data-confirm-refund]"))==null||b.addEventListener("click",()=>{var s,A;const S=document.querySelector("[data-confirm-refund]");S&&(S.disabled=!0);const E=()=>{i?to(e.bookingId):eo(e.bookingId),ke(),Y({title:i?"입금 전 예매가 취소되었습니다":"환불 신청이 접수되었습니다",body:i?"좌석이 다시 예매 가능한 상태로 변경되었습니다.":"환불 처리 중 상태로 변경되며, 완료되면 상태가 업데이트됩니다.",type:"success"})},v=((s=oe().user)==null?void 0:s.userId)||((A=oe().user)==null?void 0:A.email),x=(e.seats&&e.seats.length?e.seats:e.seat?[e.seat]:[]).filter(I=>typeof I.id=="string"&&I.id.includes(":"));x.length&&v?Promise.all(x.map(I=>fetch("/seats/cancel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:v,seatId:I.id})}).then(w=>w.json().then(M=>({ok:w.ok,data:M}))))).then(I=>{const w=I.find(M=>!M.ok||!M.data.success);if(w){S&&(S.disabled=!1),Y({title:"환불 처리에 실패했습니다",body:w.data.message||"잠시 후 다시 시도해주세요.",type:"default"});return}E()}).catch(()=>{S&&(S.disabled=!1),Y({title:"환불 요청에 실패했습니다",body:"네트워크 상태를 확인하고 다시 시도해주세요.",type:"default"})}):E()})}const fn={render(e,t){if(!Le()){We("mypage"),z("login");return}const i=t.section||"",{user:a,bookings:d,interests:o,cancelQueues:r}=oe();e.innerHTML=`
      <div class="container mypage-body">
        <aside class="mypage-nav">
          <div class="mypage-profile-card">
            <div data-mypage-avatar class="mypage-avatar">${Fe(a.name.slice(0,1))}</div>
            <div>
              <div data-mypage-user-name style="font-weight:800;font-size:14px;">${Fe(a.name)}</div>
              <div class="text-secondary" style="font-size:12px;">${a.email}</div>
            </div>
          </div>
          ${vn.map(p=>`<a href="#/mypage${p.key?"/"+p.key:""}" class="${i===p.key?"active":""}">${p.label}</a>`).join("")}
        </aside>
        <div data-content></div>
      </div>
    `;const n=e.querySelector("[data-content]");let l=null;function c(p){if(l){p(l);return}fetch("/events").then(m=>m.json()).then(m=>{l=m.events||[],p(l)}).catch(()=>p([]))}const y=7*24*60*60*1e3;function g(){const p=(a==null?void 0:a.userId)||(a==null?void 0:a.email);p&&fetch(`/reservations/user/${encodeURIComponent(p)}`).then(m=>m.json()).then(({reservations:m})=>{const O=(m||[]).filter(H=>!Va(H.seatId)&&(H.status!=="CANCELLED"||H.cancelledAt&&Date.now()-new Date(H.cancelledAt).getTime()<=y));if(O.length)return Promise.all([fetch("/events").then(H=>H.json()),fetch("/seats").then(H=>H.json())]).then(([H,G])=>{const K=new Map((G.seats||[]).map(Z=>[Z.seatId,Z]));O.forEach(Z=>{const J=Z.seatId.split(":")[0];if(!(H.events||[]).find(q=>q.eventId===J))return;const ne=Z.seatId.includes(":")?Z.seatId.split(":").pop():Z.seatId,le=K.get(Z.seatId),ge=(le==null?void 0:le.section)||ne.split("-")[0],P=Z.status==="CANCELLED";Ya({bookingId:`R-${Z.seatId}`,concertId:J,session:null,zone:{id:ge,label:`${ge}구역`},seat:{id:Z.seatId,section:ge,row:ne.split("-")[0],seatNum:parseInt(ne.split("-")[1],10)||0,grade:ge,gradeName:`${ge}구역`},price:Number(le==null?void 0:le.price)||0,status:P?"refunded":"confirmed",cancelledAt:P?new Date(Z.cancelledAt).getTime():void 0,source:"regular",paymentMethod:"card",paidAt:new Date(Z.reservedAt).getTime()||Date.now()})})})}).catch(()=>{})}g();function b(){i==="bookings"?v():i==="cancel-queue"?k():i==="membership"?x():i==="interests"?I():i==="profile"?w():i==="refunds"?f():i==="notifications"?h():i==="profile-edit"?u():E()}b();const S=nt(()=>{(i==="bookings"||i==="")&&b()});function E(){const p=d.filter(G=>G.status!=="refunded"&&G.status!=="refund_pending"),m=o.size,O=Object.keys(r).length,H=He();c(G=>{n.innerHTML=`
          <div class="stat-cards">
            <div class="stat-card"><div class="stat-card__label">예매한 티켓</div><div class="stat-card__value red">${p.length}건</div></div>
            <div class="stat-card"><div class="stat-card__label">관심 공연</div><div class="stat-card__value">${m}건</div></div>
            <div class="stat-card"><div class="stat-card__label">취소표 대기</div><div class="stat-card__value">${O}건</div></div>
            <div class="stat-card">
              <div class="stat-card__label">멤버십</div>
              <div class="stat-card__value membership-mini-status ${H?"is-active":"is-standby"}" role="img" aria-label="${H?"멤버십 활성화":"멤버십 비활성화"}" title="${H?"멤버십 활성화":"멤버십 비활성화"}">
                <span class="membership-mini-stage" aria-hidden="true"><span class="membership-rocket-emoji">🚀</span></span>
              </div>
            </div>
          </div>

          <div class="mypage-section-title">최근 예매내역</div>
          ${p.length?p.slice(0,3).map(K=>F(K,G)).join(""):R("아직 예매한 티켓이 없습니다.")}

        `,C(n)})}function v(){const p=d.filter(m=>m.status!=="refunded"&&m.status!=="refund_pending");c(m=>{n.innerHTML=`
          <div class="mypage-section-title" style="margin-top:0;">예매내역</div>
          ${p.length?p.map(O=>F(O,m)).join(""):R("아직 예매한 티켓이 없습니다.")}
        `,C(n)})}function k(){const p=Object.entries(r);n.innerHTML=`
        <div class="mypage-section-title" style="margin-top:0;">취소표 대기열</div>
        ${p.length?p.map(([m,O])=>{const H=St(m);return H?`
                  <div class="ticket-row" data-open="${m}" style="cursor:pointer;">
                    <div>
                      <div class="ticket-row__concert">${H.artist} · ${H.title}</div>
                      <div class="ticket-row__meta">전체 대기자 ${ue(O.total)}명 · 예상 대기시간 약 ${Math.max(1,Math.round(O.myNumber/O.total*210))}분</div>
                    </div>
                    <div style="text-align:right;">
                      <div class="ticket-row__price num-mono text-red">${ue(O.myNumber)}번</div>
                      <div class="ticket-row__meta">${He()?"Private Link 이용 가능":"멤버십 필요"}</div>
                    </div>
                  </div>`:""}).join(""):R("취소표 대기열에 참여 중인 공연이 없습니다.")}
      `,n.querySelectorAll("[data-open]").forEach(m=>{m.addEventListener("click",()=>z(`cancel-queue/${m.dataset.open}`))})}function x(){var m,O;const p=oe().membership;n.innerHTML=`
        <div class="mypage-section-title" style="margin-top:0;">멤버십</div>
        <div class="card" style="padding:28px;">
          <div class="membership-status-row">
            <div class="membership-status-visual ${p?"is-active":"is-standby"}" role="img" aria-label="${p?"멤버십 활성화":"멤버십 비활성화"}">
              <div class="membership-rocket-stage">
                <span class="membership-rocket-emoji" aria-hidden="true">🚀</span>
                ${p?"":'<span class="membership-rocket__standby-light" aria-hidden="true"></span>'}
              </div>
              <div class="membership-status-visual__copy">
                <strong>${p?"멤버십 활성화":"멤버십 발사 대기"}</strong>
                <span>${p?"취소표 우선 예매 준비 완료":"멤버십 가입 후 이용할 수 있습니다"}</span>
              </div>
            </div>
            <div class="membership-status-actions">
              ${p?'<span class="badge badge-red">✓ 이용중</span>':'<button class="btn btn-primary" data-join>멤버십 가입하기</button>'}
            </div>
          </div>
          ${p?`<div class="membership-plan-meta">
            <div class="text-secondary" style="font-size:12.5px;">플랜: ${p.plan==="yearly"?"연간 멤버십":"월간 멤버십"}</div>
            ${p.since?`<div class="text-secondary" style="font-size:12px;margin-top:4px;">가입일: ${new Date(p.since).toLocaleDateString("ko-KR")}</div>`:""}
          </div>`:""}
          ${p?`
          <div style="border-top:1px solid var(--color-border);margin-top:24px;padding-top:20px;">
            <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;">멤버십 혜택</h4>
            <ul style="font-size:13px;color:var(--color-text-secondary);line-height:2;">
              <li>취소표 대기열 우선 배정</li>
              <li>Secret Link 전용 예매 기회</li>
              <li>비회원 대비 빠른 순번 배정</li>
            </ul>
            <button class="btn btn-outline btn-block mt-24" style="color:var(--color-text-secondary);border-color:var(--color-border);" data-cancel-membership>멤버십 해지하기</button>
          </div>
          `:""}
        </div>
      `,(m=n.querySelector("[data-join]"))==null||m.addEventListener("click",()=>z("membership")),(O=n.querySelector("[data-cancel-membership]"))==null||O.addEventListener("click",()=>{var H;fe({title:"멤버십을 해지하시겠습니까?",bodyHtml:`
            <p style="margin-bottom:14px;">멤버십을 해지하시면 다음 혜택을 더 이상 이용할 수 없습니다.</p>
            <ul style="font-size:13.5px;color:var(--color-text-secondary);line-height:2;margin-bottom:14px;">
              <li>취소표 대기열 우선 배정</li>
              <li>Secret Link 전용 예매 기회</li>
            </ul>
            <div class="notice-box"><p>해지 후 재가입은 언제든 가능합니다.</p></div>
          `,footerHtml:`
            <button type="button" class="btn btn-ghost" data-modal-close>유지하기</button>
            <button type="button" class="btn btn-primary" style="background:var(--color-text-secondary);" data-confirm-cancel>해지하기</button>
          `}),(H=document.querySelector("[data-confirm-cancel]"))==null||H.addEventListener("click",()=>{const G=document.querySelector("[data-confirm-cancel]");G&&(G.disabled=!0,G.textContent="처리 중..."),Wa().then(K=>{K.success?(ke(),Y({title:"멤버십이 해지되었습니다",body:"재가입은 멤버십 페이지에서 언제든 가능합니다.",type:"success"}),x()):(G&&(G.disabled=!1,G.textContent="해지하기"),Y({title:"해지에 실패했습니다",body:K.message||"잠시 후 다시 시도해주세요."}))})})})}function s(p){return`
        <div class="card" style="overflow:hidden;">
          <div class="interest-card__poster-wrap" data-open="${p.id}">
            <img class="interest-card__poster" src="${Pe(p.artist||p.title)}" alt="${Fe(p.artist)} 포스터" loading="lazy" />
            <button class="badge" data-heart="${p.id}" style="position:absolute;top:10px;right:10px;border:none;background:rgba(0,0,0,0.35);color:#fff;cursor:pointer;">♥</button>
          </div>
          <div style="padding:14px;">
            <div class="text-red" style="font-size:12px;font-weight:700;">${p.artist}</div>
            <div style="font-weight:800;font-size:13.5px;margin:4px 0 8px;">${p.title}</div>
            <div class="text-secondary" style="font-size:12px;">${ao(p.dateStart,p.dateEnd)}</div>
          </div>
        </div>`}function A(p){return`
        <div class="card" style="overflow:hidden;">
          <div class="interest-card__poster-wrap" data-open="${p.eventId}">
            <img class="interest-card__poster" src="${Pe(p.eventName||p.eventId)}" alt="${Fe(p.eventName)} 포스터" loading="lazy" />
            <button class="badge" data-heart="${p.eventId}" style="position:absolute;top:10px;right:10px;border:none;background:rgba(0,0,0,0.35);color:#fff;cursor:pointer;">♥</button>
          </div>
          <div style="padding:14px;">
            <div style="font-weight:800;font-size:13.5px;margin:4px 0 8px;">${p.eventName}</div>
            <div class="text-secondary" style="font-size:12px;">${p.eventDate||""} · ${p.venue||"-"}</div>
          </div>
        </div>`}function I(){c(p=>{const m=ri.filter(K=>o.has(K.id)),O=p.filter(K=>o.has(K.eventId)),H=m.map(s).join("")+O.map(A).join(""),G=m.length+O.length>0;n.innerHTML=`
          <div class="mypage-section-title" style="margin-top:0;">관심 공연</div>
          <div class="interest-grid">${H}</div>
          ${G?"":R("관심 등록한 공연이 없습니다.")}
        `,n.querySelectorAll("[data-open]").forEach(K=>K.addEventListener("click",()=>z(`concert/${K.dataset.open}`))),n.querySelectorAll("[data-heart]").forEach(K=>K.addEventListener("click",Z=>{Z.stopPropagation(),oi(K.dataset.heart),I()}))})}function w(){var p;n.innerHTML=`
        <div class="mypage-section-title" style="margin-top:0;">회원정보</div>
        <div class="card" style="padding:28px;max-width:480px;">
          <div class="field"><label>이름</label><input type="text" value="${Fe(a.name)}" readonly /></div>
          <div class="field"><label>아이디</label><input type="text" value="${Fe(a.userId)}" readonly /></div>
          <div class="field"><label>이메일</label><input type="text" value="${Fe(a.email)}" readonly /></div>
          <div class="field"><label>휴대폰 번호</label><input type="text" value="${Fe(Pt(a.phone||""))}" readonly /></div>
          ${a.birthDate?`<div class="field"><label>생년월일</label><input type="text" value="${Fe(a.birthDate)}" readonly /></div>`:""}
          <button type="button" class="btn btn-primary btn-block mt-16" data-go-profile-edit>회원정보 수정</button>
        </div>
      `,(p=n.querySelector("[data-go-profile-edit]"))==null||p.addEventListener("click",()=>z("mypage/profile-edit"))}function M(p,m){const O=qt(p.concertId,m);if(!O)return"";const H=Na(p,O),G=ka(H),K=Math.round(p.price*G),Z=Math.max(0,p.price-K),J=p.status==="refunded"?'<span class="badge badge-gray">환불 완료</span>':'<span class="badge badge-orange">환불 처리 중</span>';return`
        <div class="ticket-row" style="align-items:flex-start;">
          <div>
            <div class="ticket-row__concert">${O.name}</div>
            <div class="ticket-row__meta">취소일 ${p.cancelledAt?wt(p.cancelledAt):"-"}</div>
          </div>
          <div style="text-align:right;">
            <div class="kv-row"><span>결제금액</span><b class="num-mono">${ve(p.price)}</b></div>
            <div class="kv-row"><span>취소 수수료</span><b class="num-mono text-red">-${ve(K)}</b></div>
            <div class="kv-row"><span>환불금액</span><b class="num-mono">${ve(Z)}</b></div>
            <div class="mt-8">${J}</div>
          </div>
        </div>
      `}const L=7*24*60*60*1e3;function f(){c(p=>{const m=d.filter(O=>(O.status==="refund_pending"||O.status==="refunded")&&(!O.cancelledAt||Date.now()-O.cancelledAt<=L));n.innerHTML=`
          <div class="mypage-section-title" style="margin-top:0;">취소/환불내역</div>
          <div class="notice-box mt-8" style="margin-bottom:16px;"><p>취소/환불내역은 취소일로부터 7일간만 보관됩니다.</p></div>
          ${m.length?m.map(O=>M(O,p)).join(""):R("취소 및 환불 내역이 없습니다.")}
        `})}function h(){const p=ua();n.innerHTML=`
        <div class="mypage-section-title" style="margin-top:0;">알림</div>
        ${p.length?p.map(m=>`
              <div class="notif-list-item ${m.read?"":"is-unread"}">
                <div class="notif-list-item__title">${m.title}</div>
                <div class="notif-list-item__body text-secondary">${m.body}</div>
                <div class="notif-list-item__time text-secondary">${new Date(m.createdAt).toLocaleString("ko-KR")}</div>
              </div>`).join(""):R("아직 알림이 없습니다.")}
      `,pa()}function u(){n.innerHTML=`
        <div class="mypage-section-title" style="margin-top:0;">회원정보 수정</div>
        <div class="card" style="padding:28px;max-width:480px;">
          <div class="field"><label>이름</label><input type="text" data-edit="name" value="${Fe(a.name)}" maxlength="50" /></div>
          <div class="field">
            <label>이메일</label>
            <input type="text" value="${Fe(a.email)}" readonly />
            <div class="text-secondary" style="font-size:12px;margin-top:4px;">이메일은 계정 식별자로 사용되어 수정할 수 없습니다.</div>
          </div>
          <div class="field"><label>휴대폰 번호</label><input type="tel" data-edit="phone" value="${Fe(Pt(a.phone||""))}" placeholder="010-1234-5678" maxlength="13" /></div>
          <div class="field"><label>새 비밀번호</label><input type="password" data-edit="password" placeholder="변경하지 않으려면 비워두세요" /></div>
          <div class="field"><label>새 비밀번호 확인</label><input type="password" data-edit="password-confirm" placeholder="새 비밀번호를 한 번 더 입력해주세요" /></div>
          <label class="terms-row" style="margin:4px 0 6px;">
            <input type="checkbox" data-edit="marketing" ${a.marketingOptIn?"checked":""} />
            <span>이벤트 및 마케팅 정보 수신 동의</span>
          </label>
          ${a.birthDate?`<div class="field"><label>생년월일</label><input type="text" value="${Fe(a.birthDate)}" readonly /></div>`:""}
          ${a.joinedAt?`<div class="text-secondary" style="font-size:12px;">가입일 · ${wt(a.joinedAt)}</div>`:""}
          <button type="button" class="btn btn-primary btn-block mt-24" data-save-profile>저장하기</button>
        </div>
      `;const p=n.querySelector('[data-edit="phone"]');p==null||p.addEventListener("input",()=>{p.value=Pt(p.value)});const m=n.querySelector("[data-save-profile]");m.addEventListener("click",async()=>{var le,ge;const O=n.querySelector('[data-edit="name"]').value.trim(),H=n.querySelector('[data-edit="phone"]').value.trim(),G=n.querySelector('[data-edit="password"]').value,K=n.querySelector('[data-edit="password-confirm"]').value,Z=n.querySelector('[data-edit="marketing"]').checked;if(!O){Y({title:"이름을 입력해주세요."});return}if(H&&!pn.test(H)){Y({title:"휴대폰 번호 형식을 확인해주세요."});return}if(G&&G.length<4){Y({title:"새 비밀번호는 4자 이상이어야 합니다."});return}if(G!==K){Y({title:"새 비밀번호가 일치하지 않습니다."});return}m.disabled=!0,m.textContent="저장 중...";const J=await ra({name:O,phone:H,password:G,marketingOptIn:Z});if(!J.success){m.disabled=!1,m.textContent="저장하기",Y({title:J.message||"회원정보를 저장하지 못했습니다."});return}Y({title:"회원정보가 수정되었습니다",type:"success"});const de=e.querySelector("[data-mypage-user-name]");de&&(de.textContent=((le=oe().user)==null?void 0:le.name)||"");const ne=e.querySelector("[data-mypage-avatar]");ne&&(ne.textContent=(((ge=oe().user)==null?void 0:ge.name)||"게").slice(0,1)),u()})}function F(p,m){var G,K;const O=qt(p.concertId,m);if(!O)return"";const H=(G=p.session)!=null&&G.date?p.session.date.replaceAll("-","."):O.dateStart?wt(O.dateStart):"";return`
        <div class="ticket-row" style="align-items:flex-start;flex-wrap:wrap;">
          <div class="ticket-row__main">
            <img class="ticket-row__poster" src="${O.image}" alt="${Fe(O.name)} 포스터" loading="lazy" />
            <div class="ticket-row__info">
            <div class="ticket-row__concert">${O.name} ${p.source==="cancel"?'<span class="badge badge-red-light">취소표</span>':""}</div>
            <div class="ticket-row__meta">${H}${(K=p.session)!=null&&K.time?" "+p.session.time:""}${H?" · ":""}${Ma(p)}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div class="ticket-row__price num-mono">${ve(p.price)}</div>
            <div class="ticket-row__meta mt-8">${Gi(p)}</div>
            <div class="ticket-row__actions mt-8">
              <button type="button" class="btn btn-ghost btn-sm" data-ticket="${p.bookingId}">티켓 확인</button>
              ${p.status==="confirmed"?`<button type="button" class="btn btn-outline btn-sm" data-refund="${p.bookingId}">환불하기</button>`:""}
              ${p.status==="unpaid"?`<button type="button" class="btn btn-outline btn-sm" data-refund="${p.bookingId}">입금 취소</button>`:""}
            </div>
          </div>
          ${p.status==="unpaid"&&p.virtualAccount?D(p):""}
        </div>
      `}function D(p){return`
        <div class="vbank-box" style="width:100%;margin-top:14px;">
          <div class="vbank-box__label">가상계좌 입금 정보</div>
          <div class="kv-row"><span>결제 수단</span><b>무통장입금</b></div>
          <div class="vbank-box__bank">${p.virtualAccount.bank}</div>
          <div class="vbank-box__number num-mono">${p.virtualAccount.number}</div>
          <div class="vbank-box__amount">입금액 <b class="num-mono">${ve(p.price)}</b></div>
          ${p.vbankDeadline?`<div class="kv-row"><span>입금기한</span><b>${new Date(p.vbankDeadline).toLocaleString("ko-KR")}</b></div>`:""}
          <div class="kv-row"><span>입금상태</span><b>${Gi(p)}</b></div>
        </div>
      `}function C(p){p.querySelectorAll("[data-ticket]").forEach(m=>{m.addEventListener("click",()=>z(`complete/${m.dataset.ticket}`))}),p.querySelectorAll("[data-refund]").forEach(m=>{m.addEventListener("click",()=>{const O=oe().bookings.find(H=>H.bookingId===m.dataset.refund);O&&c(H=>{const G=qt(O.concertId,H);G&&mn(O,G)})})})}function R(p){return`<div class="card" style="padding:40px;text-align:center;color:var(--color-disabled);font-size:13.5px;">${p}</div>`}return S}},Wi=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;function bn(e){fe({title:e==="id"?"아이디/이메일 찾기":"비밀번호 찾기",bodyHtml:"<p>데모 환경에서는 아이디/비밀번호 찾기 기능이 제공되지 않습니다.<br/>가입 시 등록한 이메일과 비밀번호로 로그인해주세요.</p>",footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close>확인</button>'})}const gn={render(e){e.innerHTML=`
      <div class="container auth-page">
        <h1>로그인</h1>
        <p class="sub">QUEUING과 함께 티켓팅을 시작하세요</p>
        <form data-form novalidate>
          <div class="field">
            <label>이메일 / 아이디</label>
            <input type="text" name="email" placeholder="you@queuing.kr" autocomplete="username" required />
            <div class="field-error" data-err="email"></div>
          </div>
          <div class="field">
            <label>비밀번호</label>
            <input type="password" name="password" placeholder="비밀번호" autocomplete="current-password" required />
            <div class="field-error" data-err="password"></div>
          </div>
          <div class="field-error field-error--form" data-err="form"></div>
          <button class="btn btn-primary btn-block btn-lg" type="submit">로그인</button>
        </form>
        <div class="auth-find-links">
          <a href="#" data-find="id">아이디/이메일 찾기</a>
          <span>·</span>
          <a href="#" data-find="pw">비밀번호 찾기</a>
        </div>
        <div class="auth-switch">아직 회원이 아니신가요? <a href="#/signup">회원가입</a></div>
        <div class="notice-box mt-24">가입하신 이메일과 비밀번호로 로그인해주세요.</div>
      </div>
    `;const t=e.querySelector("[data-form]"),i=t.querySelector('[data-err="form"]');function a(r,n){const l=t.querySelector(`[data-err="${r}"]`);l&&(l.textContent=n||"");const c=l==null?void 0:l.closest(".field");c&&c.classList.toggle("field--invalid",!!n)}function d(){i.textContent="";const r=t.email.value.trim(),n=t.password.value;r&&!Wi.test(r)?a("email","이메일 형식이 올바르지 않습니다."):a("email",""),n&&n.length<4?a("password","비밀번호는 4자 이상 입력해주세요."):a("password","")}t.email.addEventListener("input",d),t.password.addEventListener("input",d),e.querySelectorAll("[data-find]").forEach(r=>{r.addEventListener("click",n=>{n.preventDefault(),bn(r.dataset.find)})});const o=t.querySelector('button[type="submit"]');t.addEventListener("submit",r=>{r.preventDefault();const n=t.email.value.trim(),l=t.password.value;if(!(Wi.test(n)&&l.length>=4)){i.textContent="이메일 또는 비밀번호가 올바르지 않습니다.";return}i.textContent="",o.disabled=!0,fetch("/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:n,password:l})}).then(y=>y.json()).then(y=>{if(!y.success){i.textContent=y.message||"이메일 또는 비밀번호가 올바르지 않습니다.",o.disabled=!1;return}Pa({name:y.name||n.split("@")[0]||"게스트",email:y.email||n,isAdmin:y.role==="admin",isMonitor:y.role==="monitor",role:y.role==="admin"?"ADMIN":y.role==="monitor"?"MONITOR":"USER",userId:y.userId||n,phone:y.phone||"",birthDate:y.birthDate||"",marketingOptIn:y.marketingOptIn,joinedAt:y.joinedAt});const g=ba();y.role==="admin"?z(g||"admin"):y.role==="monitor"?z("monitoring"):z(g||"")}).catch(()=>{i.textContent="로그인 처리 중 오류가 발생했습니다.",o.disabled=!1})})}},hn=/^[^\s@]+@[^\s@]+\.[^\s@]+$/,En=/^01[016789]-\d{3,4}-\d{4}$/;function Fn(e){const t=e.replace(/\D/g,"").slice(0,11);return t.length<4?t:t.length<8?`${t.slice(0,3)}-${t.slice(3)}`:t.length<=10?`${t.slice(0,3)}-${t.slice(3,6)}-${t.slice(6)}`:`${t.slice(0,3)}-${t.slice(3,7)}-${t.slice(7)}`}const In=[{key:"terms",required:!0,label:"[필수] 이용약관 동의"},{key:"privacy",required:!0,label:"[필수] 개인정보 수집 및 이용 동의"},{key:"service",required:!0,label:"[필수] 서비스 이용약관 동의"},{key:"marketing",required:!1,label:"[선택] 이벤트 및 마케팅 정보 수신 동의"}],An={render(e){e.innerHTML=`
      <div class="container auth-page auth-page--wide">
        <h1>회원가입</h1>
        <p class="sub">QUEUING 회원이 되고 다양한 공연을 예매하세요</p>
        <form data-form novalidate>
          <div class="field">
            <label>이름</label>
            <input type="text" name="name" placeholder="홍길동" autocomplete="name" required />
            <div class="field-error" data-err="name"></div>
          </div>
          <div class="field">
            <label>이메일</label>
            <input type="email" name="email" placeholder="you@queuing.kr" autocomplete="email" required />
            <div class="field-error" data-err="email"></div>
          </div>
          <div class="field">
            <label>비밀번호</label>
            <input type="password" name="password" placeholder="8자 이상 입력해주세요" autocomplete="new-password" required />
            <div class="field-error" data-err="password"></div>
          </div>
          <div class="field">
            <label>비밀번호 확인</label>
            <input type="password" name="password2" placeholder="비밀번호를 다시 입력해주세요" autocomplete="new-password" required />
            <div class="field-error" data-err="password2"></div>
          </div>
          <div class="field">
            <label>휴대폰 번호</label>
            <input type="tel" name="phone" placeholder="010-1234-5678" maxlength="13" required />
            <div class="field-error" data-err="phone"></div>
          </div>
          <div class="field">
            <label>생년월일</label>
            <input type="date" name="birth" required />
            <div class="field-error" data-err="birth"></div>
          </div>

          <div class="terms-box">
            <label class="terms-row terms-row--all">
              <input type="checkbox" data-term-all />
              <span>전체 동의</span>
            </label>
            <div class="divider" style="margin:10px 0;"></div>
            ${In.map(c=>`
              <label class="terms-row">
                <input type="checkbox" data-term="${c.key}" ${c.required?'data-required="1"':""} />
                <span>${c.label}</span>
              </label>`).join("")}
            <div class="field-error" data-err="terms"></div>
          </div>

          <div class="field-error field-error--form" data-err="form"></div>
          <button class="btn btn-primary btn-block btn-lg mt-16" type="submit" disabled>회원가입</button>
        </form>
        <div class="auth-switch">이미 회원이신가요? <a href="#/login">로그인</a></div>
      </div>
    `;const t=e.querySelector("[data-form]"),i=t.querySelector('button[type="submit"]'),a={name:t.name,email:t.email,password:t.password,password2:t.password2,phone:t.phone,birth:t.birth},d=t.querySelector("[data-term-all]"),o=[...t.querySelectorAll("[data-term]")],r=o.filter(c=>c.dataset.required);function n(c,y){const g=t.querySelector(`[data-err="${c}"]`);g&&(g.textContent=y||"");const b=g==null?void 0:g.closest(".field");b&&b.classList.toggle("field--invalid",!!y)}function l(){let c=!0;return a.name.value.trim()?n("name",""):(n("name","이름을 입력해주세요."),c=!1),a.email.value.trim()?hn.test(a.email.value.trim())?n("email",""):(n("email","이메일 형식이 올바르지 않습니다."),c=!1):(n("email","이메일을 입력해주세요."),c=!1),a.password.value?a.password.value.length<8?(n("password","비밀번호는 8자 이상 입력해주세요."),c=!1):n("password",""):(n("password","비밀번호를 입력해주세요."),c=!1),a.password2.value?a.password2.value!==a.password.value?(n("password2","비밀번호가 일치하지 않습니다."),c=!1):n("password2",""):(n("password2","비밀번호를 다시 입력해주세요."),c=!1),a.phone.value.trim()?En.test(a.phone.value.trim())?n("phone",""):(n("phone","휴대폰 번호 형식이 올바르지 않습니다."),c=!1):(n("phone","휴대폰 번호를 입력해주세요."),c=!1),a.birth.value?n("birth",""):(n("birth","생년월일을 입력해주세요."),c=!1),r.every(g=>g.checked)?n("terms",""):(n("terms","필수 약관에 동의해주세요."),c=!1),i.disabled=!c,c}a.phone.addEventListener("input",()=>{const c=a.phone.selectionStart,y=a.phone.value.length;a.phone.value=Fn(a.phone.value);const g=a.phone.value.length-y;a.phone.setSelectionRange(c+g,c+g),l()}),Object.values(a).forEach(c=>{c!==a.phone&&(c.addEventListener("input",l),c.addEventListener("blur",l))}),d.addEventListener("change",()=>{o.forEach(c=>c.checked=d.checked),l()}),o.forEach(c=>c.addEventListener("change",()=>{d.checked=o.every(y=>y.checked),l()})),t.addEventListener("submit",c=>{c.preventDefault(),l()&&(n("form",""),i.disabled=!0,fetch("/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:a.email.value.trim(),password:a.password.value,email:a.email.value.trim(),name:a.name.value.trim(),phone:a.phone.value.trim(),birthDate:a.birth.value})}).then(y=>y.json()).then(y=>{if(!y.success){n("form",y.message||"회원가입 처리 중 오류가 발생했습니다."),i.disabled=!1;return}z("signup-complete")}).catch(()=>{n("form","회원가입 처리 중 오류가 발생했습니다."),i.disabled=!1}))})}},Sn={render(e){e.innerHTML=`
      <div class="container auth-page" style="text-align:center;padding-top:90px;">
        <div class="complete-check">✓</div>
        <h1 style="margin-top:18px;">회원가입이 완료되었습니다</h1>
        <p class="sub" style="margin-bottom:8px;">QUEUING 회원이 되신 것을 환영합니다.</p>
        <p class="sub" style="margin-top:0;">이제 다양한 공연과 이벤트를 만나보세요.</p>
        <div class="flex gap-12 mt-40" style="justify-content:center;">
          <button class="btn btn-primary btn-lg" data-login>로그인하기</button>
          <button class="btn btn-outline btn-lg" data-home>홈으로 이동</button>
        </div>
      </div>
    `,e.querySelector("[data-login]").addEventListener("click",()=>z("login")),e.querySelector("[data-home]").addEventListener("click",()=>z(""))}},et=[{key:"VIP",seats:20,price:18e4},{key:"R",seats:50,price:14e4},{key:"S",seats:80,price:11e4},{key:"A",seats:100,price:8e4}],_n=Se.zones.reduce((e,t)=>{const i=t.id==="Floor"?Je:t.seats.length;return e[t.grade]=(e[t.grade]||0)+i,e},{});function kn(e){const t=_n[e.key]||e.seats;return`
    <tr data-grade-row="${e.key}">
      <td><b>${e.key}</b></td>
      <td><input type="number" min="0" data-grade-seats="${e.key}" value="${t}" style="width:90px;" disabled /></td>
      <td><input type="number" min="0" step="1000" data-grade-price="${e.key}" value="${e.price}" style="width:120px;" /></td>
    </tr>
  `}function Oa(e){return fetch("/event/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)}).then(t=>t.json())}const tt=[{artist:"AKMU",eventName:"AKMU 2026 CONCERT [사춘기 : SAILING HOME]",eventDate:"2026-11-01",venue:"올림픽홀",sessions:[{date:"2026-11-01",time:"19:00"},{date:"2026-11-02",time:"18:00"}]},{artist:"윤하",eventName:"윤하 2026 CONCERT [STARDUST : EVENT HORIZON]",eventDate:"2026-11-08",venue:"올림픽홀",sessions:[{date:"2026-11-08",time:"19:00"}]},{artist:"Stray Kids",eventName:"Stray Kids 2026 WORLD TOUR [THUNDEROUS : UNCHAINED]",eventDate:"2026-11-14",venue:"올림픽홀",sessions:[{date:"2026-11-14",time:"18:00"},{date:"2026-11-15",time:"17:00"}]},{artist:"RIIZE",eventName:"RIIZE 2026 FAN CONCERT [GET A GUITAR : FIRST LIGHT]",eventDate:"2026-11-22",venue:"올림픽홀",sessions:[{date:"2026-11-22",time:"18:00"},{date:"2026-11-23",time:"17:00"}]},{artist:"IVE",eventName:"IVE 2026 CONCERT [AFTER LIKE : THE CROWN]",eventDate:"2026-11-28",venue:"올림픽홀",sessions:[{date:"2026-11-28",time:"18:00"},{date:"2026-11-29",time:"17:00"}]},{artist:"DAY6",eventName:"DAY6 2026 CONCERT [한 페이지가 될 수 있게 : FOREVER YOUNG]",eventDate:"2026-11-29",venue:"올림픽홀",sessions:[{date:"2026-11-29",time:"18:00"},{date:"2026-11-30",time:"17:00"}]},{artist:"(G)I-DLE",eventName:"(G)I-DLE 2026 WORLD TOUR [SUPER LADY : QUEENDOM]",eventDate:"2026-12-05",venue:"올림픽홀",sessions:[{date:"2026-12-05",time:"18:00"},{date:"2026-12-06",time:"17:00"}]},{artist:"TXT",eventName:"TOMORROW X TOGETHER 2026 WORLD TOUR [STAR SEEKERS : ACT TWO]",eventDate:"2026-12-12",venue:"올림픽홀",sessions:[{date:"2026-12-12",time:"18:00"},{date:"2026-12-13",time:"17:00"}]},{artist:"SEVENTEEN",eventName:"SEVENTEEN 2026 WORLD TOUR [DIAMOND EDGE : REBORN]",eventDate:"2026-12-19",venue:"올림픽홀",sessions:[{date:"2026-12-19",time:"18:00"},{date:"2026-12-20",time:"17:00"}]},{artist:"백예린",eventName:"백예린 2026 CONCERT [Square : INDIE NIGHT]",eventDate:"2026-12-25",venue:"올림픽홀",sessions:[{date:"2026-12-25",time:"19:00"}]},{artist:"Heize",eventName:"Heize 2026 CONCERT [HAPPEN IN WINTER]",eventDate:"2026-12-26",venue:"올림픽홀",sessions:[{date:"2026-12-26",time:"20:00"}]},{artist:"성시경",eventName:"성시경 2026 연말콘서트 [두 사람 : YEAR-END BALLAD NIGHT]",eventDate:"2026-12-31",venue:"올림픽홀",sessions:[{date:"2026-12-31",time:"20:00"}]},{artist:"이적",eventName:"이적 2027 CONCERT [하늘을 달리다 : VOICE OF A GENERATION]",eventDate:"2027-01-03",venue:"올림픽홀",sessions:[{date:"2027-01-03",time:"19:00"}]},{artist:"NewJeans",eventName:"NewJeans 2027 FAN CONCERT [OMG : SUMMER DREAMING]",eventDate:"2027-01-10",venue:"올림픽홀",sessions:[{date:"2027-01-10",time:"18:00"},{date:"2027-01-11",time:"17:00"}]},{artist:"BLACKPINK",eventName:"BLACKPINK 2027 WORLD TOUR [PINK VENOM : THE FINALE]",eventDate:"2027-01-17",venue:"올림픽홀",sessions:[{date:"2027-01-17",time:"18:00"},{date:"2027-01-18",time:"17:00"}]},{artist:"박효신",eventName:"박효신 2027 CONCERT [SOULS AND SONGS]",eventDate:"2027-01-24",venue:"올림픽홀",sessions:[{date:"2027-01-24",time:"19:00"},{date:"2027-01-25",time:"18:00"}]},{artist:"NCT DREAM",eventName:"NCT DREAM 2027 CONCERT [THE DREAM SHOW 4 : WONDERLAND]",eventDate:"2027-01-31",venue:"올림픽홀",sessions:[{date:"2027-01-31",time:"18:00"},{date:"2027-02-01",time:"17:00"}]},{artist:"TAEYEON",eventName:"TAEYEON 2027 CONCERT [ONCE UPON A TIME]",eventDate:"2027-02-07",venue:"올림픽홀",sessions:[{date:"2027-02-07",time:"18:00"},{date:"2027-02-08",time:"17:00"}]},{artist:"aespa",eventName:"aespa 2027 WORLD TOUR [SUPERNOVA : SYNK HORIZON]",eventDate:"2027-02-14",venue:"올림픽홀",sessions:[{date:"2027-02-14",time:"18:00"},{date:"2027-02-15",time:"17:00"}]},{artist:"자우림",eventName:"자우림 2027 CONCERT [스물다섯, 스물하나 : TIMELESS ECHOES]",eventDate:"2027-02-15",venue:"올림픽홀",sessions:[{date:"2027-02-15",time:"19:00"}]},{artist:"ZICO",eventName:"ZICO 2027 CONCERT [SPOT! : KING OF THE JUNGLE]",eventDate:"2027-02-22",venue:"올림픽홀",sessions:[{date:"2027-02-22",time:"19:00"}]},{artist:"LE SSERAFIM",eventName:"LE SSERAFIM 2027 WORLD TOUR [FEARLESS : FLAME RISES]",eventDate:"2027-02-28",venue:"올림픽홀",sessions:[{date:"2027-02-28",time:"18:00"},{date:"2027-03-01",time:"17:00"}]},{artist:"BTS",eventName:"BTS 2027 WORLD TOUR [BEYOND THE SCENE : ETERNAL]",eventDate:"2027-03-01",venue:"올림픽홀",sessions:[{date:"2027-03-01",time:"18:00"},{date:"2027-03-02",time:"17:00"}]},{artist:"AILEE",eventName:"AILEE 2027 CONCERT [I WILL SHOW YOU : THE POWERHOUSE]",eventDate:"2027-03-08",venue:"올림픽홀",sessions:[{date:"2027-03-08",time:"19:00"}]},{artist:"IU",eventName:"IU 2027 CONCERT [THE GOLDEN HOUR : CURTAIN CALL]",eventDate:"2027-03-14",venue:"올림픽홀",sessions:[{date:"2027-03-14",time:"18:00"},{date:"2027-03-15",time:"17:00"}]},{artist:"잔나비",eventName:"잔나비 2027 CONCERT [주저하는 연인들을 위해 : MONKEY CINEMA]",eventDate:"2027-03-15",venue:"올림픽홀",sessions:[{date:"2027-03-15",time:"19:00"}]},{artist:"EXO",eventName:"EXO 2027 CONCERT [EXO PLANET #6 : CHRONICLE]",eventDate:"2027-03-22",venue:"올림픽홀",sessions:[{date:"2027-03-22",time:"18:00"},{date:"2027-03-23",time:"17:00"}]},{artist:"영탁",eventName:"영탁 2027 CONCERT [찐이야 : ALL-IN LIVE]",eventDate:"2027-03-29",venue:"올림픽홀",sessions:[{date:"2027-03-29",time:"18:00"}]},{artist:"폴킴",eventName:"폴킴 2027 CONCERT [비 : EVERY DAY EVERY MOMENT]",eventDate:"2027-04-05",venue:"올림픽홀",sessions:[{date:"2027-04-05",time:"19:00"}]},{artist:"TWICE",eventName:"TWICE 2027 WORLD TOUR [FEEL SPECIAL : ONCE MORE]",eventDate:"2027-04-05",venue:"올림픽홀",sessions:[{date:"2027-04-05",time:"18:00"},{date:"2027-04-06",time:"17:00"}]},{artist:"김범수",eventName:"김범수 2027 CONCERT [보고 싶다 : A VOICE FOR ETERNITY]",eventDate:"2027-04-12",venue:"올림픽홀",sessions:[{date:"2027-04-12",time:"19:00"}]},{artist:"Red Velvet",eventName:"Red Velvet 2027 CONCERT [CHILL KILL : THE VELVET NIGHT]",eventDate:"2027-04-19",venue:"올림픽홀",sessions:[{date:"2027-04-19",time:"18:00"},{date:"2027-04-20",time:"17:00"}]},{artist:"송가인",eventName:"송가인 2027 CONCERT [트로트의 여왕 : 꽃길만 걸으세요]",eventDate:"2027-04-26",venue:"올림픽홀",sessions:[{date:"2027-04-26",time:"18:00"}]},{artist:"이승철",eventName:"이승철 2027 CONCERT [LEGEND CONTINUES]",eventDate:"2027-05-03",venue:"올림픽홀",sessions:[{date:"2027-05-03",time:"19:00"},{date:"2027-05-04",time:"18:00"}]},{artist:"임영웅",eventName:"임영웅 2027 전국투어 [IM HERO : LEGEND TOUR]",eventDate:"2027-05-10",venue:"올림픽홀",sessions:[{date:"2027-05-10",time:"18:00"},{date:"2027-05-11",time:"17:00"}]},{artist:"YB",eventName:"YB 2027 CONCERT [나는 나비 : ROCK NEVER DIES]",eventDate:"2027-05-17",venue:"올림픽홀",sessions:[{date:"2027-05-17",time:"19:00"}]},{artist:"장윤정",eventName:"장윤정 2027 CONCERT [어머나! : TIMELESS DIVA]",eventDate:"2027-05-24",venue:"올림픽홀",sessions:[{date:"2027-05-24",time:"18:00"}]},{artist:"이찬원",eventName:"이찬원 2027 CONCERT [진또배기 : YOUNG KING OF TROT]",eventDate:"2027-06-07",venue:"올림픽홀",sessions:[{date:"2027-06-07",time:"18:00"}]},{artist:"선우정아",eventName:"선우정아 2027 CONCERT [도망가자 : CATHARSIS]",eventDate:"2027-06-14",venue:"올림픽홀",sessions:[{date:"2027-06-14",time:"19:00"}]},{artist:"NELL",eventName:"NELL 2027 CONCERT [지구가 태양을 네 번 : FOUR SEASONS]",eventDate:"2027-06-21",venue:"올림픽홀",sessions:[{date:"2027-06-21",time:"19:00"}]}],$n={BTS:"BIGHIT MUSIC / HYBE",BLACKPINK:"YG Entertainment",SEVENTEEN:"Pledis Entertainment / HYBE",NewJeans:"ADOR / HYBE",IVE:"Starship Entertainment",aespa:"SM Entertainment",TWICE:"JYP Entertainment",EXO:"SM Entertainment","Stray Kids":"JYP Entertainment","NCT DREAM":"SM Entertainment","(G)I-DLE":"CUBE Entertainment","LE SSERAFIM":"SOURCE MUSIC / HYBE",RIIZE:"SM Entertainment","Red Velvet":"SM Entertainment",TXT:"BIGHIT MUSIC / HYBE",IU:"EDAM Entertainment",박효신:"Glove Entertainment",성시경:"JELLYFISH Entertainment",TAEYEON:"SM Entertainment",윤하:"C9 Entertainment",AILEE:"THE L1VE",김범수:"Polaris Entertainment",이승철:"HOOK Entertainment",Heize:"P NATION",ZICO:"KOZ Entertainment",임영웅:"fish music",송가인:"POCKET DOL STUDIO",영탁:"TV 조선",이찬원:"GREEN FISH",장윤정:"K-PERFORMANCE",AKMU:"YG Entertainment",이적:"Music Farm",백예린:"Blue Vinyl",선우정아:"Magic Strawberry Sound",폴킴:"Neuron Music",YB:"Dee Company",자우림:"JAUR.M",DAY6:"JYP Entertainment",잔나비:"Peponi Music",NELL:"Space Bohemian"},wn=["약 120분","약 130분 (인터미션 포함)","약 150분 (인터미션 20분 포함)","약 100분","약 180분 (인터미션 15분 포함)"],Dn=["전체 관람가","만 7세 이상 관람가","만 12세 이상 관람가"],Ln={BTS:"RM, JIN, SUGA, J-HOPE, JIMIN, V, JUNGKOOK",BLACKPINK:"JISOO, JENNIE, ROSÉ, LISA",SEVENTEEN:"S.COUPS, JEONGHAN, JOSHUA, JUN, HOSHI, WONWOO, WOOZI, DK, MINGYU, THE8, SEUNGKWAN, VERNON, DINO",NewJeans:"MINJI, HANNI, DANIELLE, HAERIN, HYEIN",IVE:"YUJIN, GAEUL, REI, WONYOUNG, LIZ, LEESEO",aespa:"KARINA, GISELLE, WINTER, NINGNING",TWICE:"NAYEON, JEONGYEON, MOMO, SANA, JIHYO, MINA, DAHYUN, CHAEYOUNG, TZUYU",EXO:"XIUMIN, SUHO, LAY, BAEKHYUN, CHEN, CHANYEOL, D.O., KAI, SEHUN","Stray Kids":"Bang Chan, Lee Know, Changbin, Hyunjin, HAN, Felix, Seungmin, I.N","NCT DREAM":"MARK, RENJUN, JENO, HAECHAN, JAEMIN, CHENLE, JISUNG","(G)I-DLE":"MIYEON, MINNIE, SOYEON, YUQI, SHUHUA","LE SSERAFIM":"SAKURA, KIM CHAEWON, HUH YUNJIN, KAZUHA, HONG EUNCHAE",RIIZE:"SHOTARO, EUNSEOK, SUNGCHAN, WONBIN, SEUNGHAN, SOHEE, ANTON","Red Velvet":"IRENE, SEULGI, WENDY, JOY, YERI",TXT:"SOOBIN, YEONJUN, BEOMGYU, TAEHYUN, HUENINGKAI",IU:"IU (이지은)",박효신:"박효신",성시경:"성시경",TAEYEON:"TAEYEON (태연)",윤하:"윤하",AILEE:"AILEE (에일리)",김범수:"김범수",이승철:"이승철",Heize:"Heize (헤이즈)",ZICO:"ZICO (지코)",임영웅:"임영웅",송가인:"송가인",영탁:"영탁",이찬원:"이찬원",장윤정:"장윤정",AKMU:"이찬혁, 이수현",이적:"이적",백예린:"백예린",선우정아:"선우정아",폴킴:"폴킴",YB:"윤도현, 박태희, 허준, 김진원, 스캇 할로웰",자우림:"김윤아, 이선규, 김지민, 구태훈",DAY6:"Jae, Sungjin, Young K, Wonpil, Dowoon",잔나비:"최정훈, 김도형",NELL:"김종완, 이재경, 이정재, 정재원"};function Tn(e,t,i){const a=[`${e}의 ${t} 서울 공연이 ${i}에서 개최됩니다. 화려한 무대 연출과 완벽한 라이브 퍼포먼스로 관객들에게 잊을 수 없는 경험을 선사합니다. 아티스트와 팬이 함께 만들어가는 특별한 시간, 놓치지 마세요.`,`${i}에서 펼쳐지는 ${e}의 대규모 공연! 히트곡 메들리부터 신곡 최초 무대까지, 오직 이 공연에서만 볼 수 있는 스페셜 세트리스트가 준비되어 있습니다. 최첨단 LED 스크린과 조명 연출이 어우러진 몰입감 넘치는 무대를 경험하세요.`,`${e}가 팬들과 함께하는 ${t}! ${i}의 넓은 무대를 가득 채울 역대급 스케일의 공연이 찾아옵니다. 앵콜 무대를 포함한 약 2시간의 공연 동안 최고의 퍼포먼스와 감동적인 멘트까지, 팬이라면 반드시 함께해야 할 순간입니다.`,`글로벌 아티스트 ${e}의 ${t}이 드디어 서울에 상륙합니다. ${i}에서 진행되는 이번 공연은 월드투어의 하이라이트로, 해외에서 먼저 검증된 완성도 높은 세트리스트와 무대 구성이 그대로 재현됩니다. 현장에서만 느낄 수 있는 압도적인 사운드와 비주얼을 직접 체험해보세요.`];return a[Math.floor(Math.random()*a.length)]}function Mn(){return["본 공연은 지정좌석제로 운영됩니다.","공연 시작 후 입장이 제한될 수 있습니다.","촬영(사진/영상) 및 녹음은 금지됩니다.","티켓 양도 및 교환은 공식 채널을 통해서만 가능합니다.","공연 당일 본인 확인이 진행됩니다. 신분증을 지참해주세요."]}let it=0;function zi(e){return e[Math.floor(Math.random()*e.length)]}function Nn(){const e=tt[it%tt.length];it++;const t=e.artist,i=d=>{var r;const o=((r=et.find(n=>n.key===d))==null?void 0:r.price)||et[et.length-1].price;return Math.round(o*(.85+Math.random()*.3)/1e3)*1e3},a=Se.zones.map(d=>({name:d.id,seats:d.id==="Floor"?Je:d.seats.length,price:i(d.grade)}));return{eventName:e.eventName,eventDate:e.eventDate,venue:"올림픽홀",seatingType:"olympichall",sections:a,sessions:e.sessions,runtime:zi(wn),ageRating:zi(Dn),cast:Ln[t]||t,agency:$n[t]||"Entertainment Corp.",description:Tn(t,e.eventName,e.venue),notices:Mn()}}let Be=[];function On(e,t){return fetch(`/events/${e}/open-time`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({ticketOpenAt:t})}).then(i=>i.json())}function Cn(e,t){return fetch(`/events/${e}/close-time`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({ticketCloseAt:t})}).then(i=>i.json())}function Ca(e){Be.forEach(t=>{const i=e.querySelector(`[data-open-status="${t.eventId}"]`);if(!i)return;const a=t.ticketOpenAt?new Date(t.ticketOpenAt).getTime()-Date.now():0,d=t.ticketCloseAt?new Date(t.ticketCloseAt).getTime()-Date.now():0;if(t.ticketOpenAt&&a>0){i.innerHTML=`<span class="badge badge-orange">오픈 예정</span><div class="num-mono" style="font-size:12px;margin-top:4px;color:var(--color-text-secondary);">${ht(a)}</div>`;return}if(t.ticketCloseAt&&d<=0){i.innerHTML='<span class="badge badge-outline">마감됨</span>';return}let o='<span class="badge badge-green">예매중</span>';t.ticketCloseAt&&d>0&&(o+=`<div class="num-mono" style="font-size:11px;margin-top:4px;color:var(--color-text-secondary);">마감까지 ${ht(d)}</div>`),i.innerHTML=o})}function Re(e){const t=e.querySelector("[data-events-tbody]");t&&fetch("/events").then(i=>i.json()).then(i=>{if(Be=i.events||[],Be.length===0){t.innerHTML='<tr><td colspan="7" class="text-secondary">생성된 공연이 없습니다.</td></tr>';return}t.innerHTML=Be.map((a,d)=>`
        <tr>
          <td class="num-mono">${d+1}</td>
          <td>${a.eventName}</td>
          <td>${a.eventDate||"-"}</td>
          <td>${a.venue||"-"}</td>
          <td class="seat-tip-wrap">${Number(a.totalSeats||0).toLocaleString()}석${(a.sections||[]).length?`<span class="seat-tip">${(a.sections||[]).map(o=>`<span>${o.name}: ${o.seats.toLocaleString()}석</span>`).join("")}</span>`:""}</td>
          <td data-open-status="${a.eventId}"></td>
          <td>
            <button type="button" class="btn btn-outline btn-sm" data-set-open-time="${a.eventId}">오픈 시간</button>
            <button type="button" class="btn btn-outline btn-sm" data-set-close-time="${a.eventId}">마감 시간</button>
            <button type="button" class="btn btn-outline btn-sm" data-delete-event="${a.eventId}">삭제</button>
          </td>
        </tr>`).join(""),Ca(e),t.querySelectorAll("[data-set-open-time]").forEach(a=>{a.addEventListener("click",()=>{const d=Be.find(o=>o.eventId===a.dataset.setOpenTime);d&&Bn(d,()=>Re(e))})}),t.querySelectorAll("[data-set-close-time]").forEach(a=>{a.addEventListener("click",()=>{const d=Be.find(o=>o.eventId===a.dataset.setCloseTime);d&&Rn(d,()=>Re(e))})}),t.querySelectorAll("[data-delete-event]").forEach(a=>{a.addEventListener("click",()=>{var o,r;const d=((r=(o=a.closest("tr"))==null?void 0:o.children[1])==null?void 0:r.textContent)||"";confirm(`"${d}" 공연을 삭제할까요? (좌석 데이터도 함께 삭제됩니다)`)&&(a.disabled=!0,fetch(`/events/${a.dataset.deleteEvent}`,{method:"DELETE"}).then(n=>n.json()).then(()=>{Y({title:"공연이 삭제되었습니다",body:d}),Re(e)}).catch(()=>{Y({title:"삭제 중 오류가 발생했습니다"}),a.disabled=!1}))})})}).catch(()=>{t.innerHTML='<tr><td colspan="6" class="text-red">목록을 불러오지 못했습니다.</td></tr>'})}function Ke(e){const t=i=>String(i).padStart(2,"0");return`${e.getFullYear()}-${t(e.getMonth()+1)}-${t(e.getDate())}T${t(e.getHours())}:${t(e.getMinutes())}:${t(e.getSeconds())}`}function lt(e,t,i,a){On(e,t).then(d=>{if(d.error){Y({title:"오픈 시간 설정 실패",body:d.error});return}Y({title:i,body:d.message,type:"success"}),ke(),a==null||a()}).catch(()=>Y({title:"오픈 시간 설정 중 오류가 발생했습니다"}))}function Bn(e,t){const i=e.ticketOpenAt?Ke(new Date(e.ticketOpenAt)):Ke(new Date(Date.now()+3e5));fe({title:`예매 오픈 시간 설정 — ${e.eventName}`,bodyHtml:`
      <div class="field">
        <label>예매 오픈 일시</label>
        <input type="datetime-local" step="1" data-open-time-input value="${i}" />
      </div>
      <div class="field" style="margin-bottom:0;">
        <label>빠른 설정 (테스트용 — 클릭 즉시 저장)</label>
        <div class="chip-row">
          <button type="button" class="chip-btn" data-quick-preset="now">지금 바로 오픈</button>
          <button type="button" class="chip-btn" data-quick-preset="10s">10초 후 오픈</button>
          <button type="button" class="chip-btn" data-quick-preset="1m">1분 후 오픈</button>
          <button type="button" class="chip-btn" data-quick-preset="10m">10분 후 오픈</button>
        </div>
      </div>
      ${e.ticketOpenAt?`<p class="policy-note mt-16">현재 설정: ${new Date(e.ticketOpenAt).toLocaleString("ko-KR")}</p>`:""}
    `,footerHtml:`
      <button type="button" class="btn btn-outline" data-modal-close>취소</button>
      <button type="button" class="btn btn-outline" data-clear-open-time>오픈 제한 해제</button>
      <button type="button" class="btn btn-primary" data-save-open-time>저장</button>
    `});const a=document.querySelector("[data-open-time-input]");document.querySelectorAll("[data-quick-preset]").forEach(d=>{d.addEventListener("click",()=>{const o=d.dataset.quickPreset;if(o==="now"){lt(e.eventId,null,"예매가 즉시 오픈으로 설정되었습니다",t);return}const r={"10s":1e4,"1m":6e4,"10m":6e5}[o]||0,n=new Date(Date.now()+r);a.value=Ke(n),lt(e.eventId,n.toISOString(),`오픈 시간이 "${d.textContent}"(으)로 설정되었습니다`,t)})}),document.querySelector("[data-clear-open-time]").addEventListener("click",()=>{lt(e.eventId,null,"오픈 시간 제한이 해제되었습니다",t)}),document.querySelector("[data-save-open-time]").addEventListener("click",()=>{if(!a.value){Y({title:"오픈 일시를 입력해주세요"});return}const d=new Date(a.value);if(Number.isNaN(d.getTime())){Y({title:"올바른 날짜/시간을 입력해주세요"});return}lt(e.eventId,d.toISOString(),"오픈 시간이 설정되었습니다",t)})}function Ut(e,t,i,a){Cn(e,t).then(d=>{if(d.error){Y({title:"마감 시간 설정 실패",body:d.error});return}Y({title:i,body:d.message,type:"success"}),ke(),a==null||a()}).catch(()=>Y({title:"마감 시간 설정 중 오류가 발생했습니다"}))}function Rn(e,t){const i=e.ticketCloseAt?Ke(new Date(e.ticketCloseAt)):Ke(new Date(Date.now()+36e5));fe({title:`마감 시간 설정 — ${e.eventName}`,bodyHtml:`
      <div class="field">
        <label>예매 마감 일시</label>
        <input type="datetime-local" step="1" data-close-time-input value="${i}" />
      </div>
      <div class="field" style="margin-bottom:0;">
        <label>빠른 설정 (테스트용 — 클릭 즉시 저장)</label>
        <div class="chip-row">
          <button type="button" class="chip-btn" data-close-preset="5m">5분 후 마감</button>
          <button type="button" class="chip-btn" data-close-preset="30m">30분 후 마감</button>
          <button type="button" class="chip-btn" data-close-preset="1h">1시간 후 마감</button>
          <button type="button" class="chip-btn" data-close-preset="24h">24시간 후 마감</button>
        </div>
      </div>
      ${e.ticketCloseAt?`<p class="policy-note mt-16">현재 설정: ${new Date(e.ticketCloseAt).toLocaleString("ko-KR")}</p>`:'<p class="policy-note mt-16">현재: 마감 시간 미설정 (수동 마감)</p>'}
    `,footerHtml:`
      <button type="button" class="btn btn-outline" data-modal-close>취소</button>
      <button type="button" class="btn btn-outline" data-clear-close-time>마감 제한 해제</button>
      <button type="button" class="btn btn-primary" data-save-close-time>저장</button>
    `});const a=document.querySelector("[data-close-time-input]");document.querySelectorAll("[data-close-preset]").forEach(d=>{d.addEventListener("click",()=>{const o={"5m":3e5,"30m":18e5,"1h":36e5,"24h":864e5}[d.dataset.closePreset]||0,r=new Date(Date.now()+o);a.value=Ke(r),Ut(e.eventId,r.toISOString(),`마감 시간이 "${d.textContent}"(으)로 설정되었습니다`,t)})}),document.querySelector("[data-clear-close-time]").addEventListener("click",()=>{Ut(e.eventId,null,"마감 시간 제한이 해제되었습니다 (수동 마감)",t)}),document.querySelector("[data-save-close-time]").addEventListener("click",()=>{if(!a.value){Y({title:"마감 일시를 입력해주세요"});return}const d=new Date(a.value);if(Number.isNaN(d.getTime())){Y({title:"올바른 날짜/시간을 입력해주세요"});return}Ut(e.eventId,d.toISOString(),"마감 시간이 설정되었습니다",t)})}function Hn(e){fe({title:"공연 생성",bodyHtml:`
      <form data-create-event novalidate>
        <div class="field">
          <label>공연명</label>
          <input type="text" name="eventName" placeholder="예: 2026 연말 콘서트" required />
        </div>
        <div class="field">
          <label>공연일</label>
          <input type="date" name="eventDate" />
        </div>
        <div class="field">
          <label>공연장</label>
          <select name="venue">
            <option value="올림픽홀">서울 올림픽홀</option>
          </select>
        </div>
        <div class="field">
          <label>좌석 형태</label>
          <select name="seatingType">
            <option value="olympichall">서울 올림픽홀 실제 좌석 배치</option>
          </select>
        </div>
        <div class="field">
          <label>등급별 좌석 수 / 가격 (올림픽홀 실제 구역 기준)</label>
          <table class="qtable">
            <thead><tr><th>등급</th><th>좌석 수</th><th>가격(원)</th></tr></thead>
            <tbody>${et.map(kn).join("")}</tbody>
          </table>
        </div>
        <div class="field-error field-error--form" data-err="form"></div>
      </form>
    `,footerHtml:`
      <button type="button" class="btn btn-outline" data-modal-close>취소</button>
      <button type="button" class="btn btn-primary" data-submit-create-event>공연 생성</button>
    `});const t=document.querySelector("[data-create-event]"),i=document.querySelector('[data-err="form"]'),a=document.querySelector("[data-submit-create-event]");a.addEventListener("click",()=>{const d=t.eventName.value.trim();if(!d){i.textContent="공연명을 입력해주세요.";return}const o=Object.fromEntries(et.map(n=>[n.key,parseInt(t.querySelector(`[data-grade-price="${n.key}"]`).value,10)||0])),r=Se.zones.map(n=>({name:n.id,seats:n.id==="Floor"?Je:n.seats.length,price:o[n.grade]||0}));if(Be.some(n=>n.eventName===d)){i.textContent="이미 동일한 이름의 공연이 존재합니다.";return}i.textContent="",a.disabled=!0,Oa({eventName:d,eventDate:t.eventDate.value||void 0,venue:"올림픽홀",seatingType:"olympichall",sections:r}).then(n=>{if(n.error){i.textContent=n.error,a.disabled=!1;return}Y({title:"공연이 생성되었습니다",body:n.message||`${d} 생성 완료`,type:"success"}),ke(),e==null||e()}).catch(()=>{i.textContent="공연 생성 중 오류가 발생했습니다.",a.disabled=!1})})}const Pn={render(e){if(!at()){Y({title:"접근 권한이 없습니다",body:Le()?"관리자만 이용할 수 있는 페이지입니다.":"로그인이 필요한 페이지입니다."}),z("");return}e.innerHTML=`
      <div class="container admin-topbar">
        <div>
          <div class="eyebrow">ADMIN CONSOLE</div>
          <h2 class="section-title">공연 관리</h2>
          <p class="section-sub">공연 생성 · 오픈 시간 설정 · 삭제</p>
        </div>
        <div class="admin-status">
          <button type="button" class="btn btn-primary btn-sm" data-open-create-event>+ 공연 생성</button>
          <button type="button" class="btn btn-outline btn-sm" data-random-create-event>📋 포스터 공연 생성</button>
          <button type="button" class="btn btn-outline btn-sm" data-redis-reset style="border-color:#e67e22;color:#e67e22;">Redis 초기화</button>
          <button type="button" class="btn btn-outline btn-sm" data-redis-recover style="border-color:#27ae60;color:#27ae60;">DB→Redis 복구</button>
        </div>
      </div>

      <div class="container admin-grid">
        <div class="admin-panel admin-panel--wide">
          <div class="mchart__head"><span class="mchart__title">생성된 공연 목록</span></div>
          <table class="qtable">
            <thead><tr><th>No.</th><th>공연명</th><th>날짜</th><th>장소</th><th>총좌석</th><th>예매 상태</th><th></th></tr></thead>
            <tbody data-events-tbody><tr><td colspan="7" class="text-secondary">불러오는 중...</td></tr></tbody>
          </table>
        </div>
      </div>
    `,Re(e);const t=setInterval(()=>Ca(e),1e3);return e.querySelector("[data-open-create-event]").addEventListener("click",()=>{Hn(()=>Re(e))}),e.querySelector("[data-random-create-event]").addEventListener("click",i=>{const a=i.currentTarget,d=new Set(Be.map(l=>l.eventName)),o=tt.filter(l=>!d.has(l.eventName));if(o.length===0){Y({title:"모든 포스터 공연이 이미 생성되었습니다",body:`${tt.length}개 공연 등록 완료`});return}a.disabled=!0;const r=it;it=tt.indexOf(o[0]);const n=Nn();it=r,Oa(n).then(l=>{if(l.error){Y({title:"생성 실패",body:l.error});return}Y({title:"공연이 생성되었습니다",body:`${n.eventName} (남은 포스터: ${o.length-1}개)`,type:"success"}),Re(e)}).catch(()=>Y({title:"포스터 공연 생성 중 오류가 발생했습니다"})).finally(()=>{a.disabled=!1})}),e.querySelector("[data-redis-reset]").addEventListener("click",()=>{fe({title:"Redis 초기화",bodyHtml:`
          <p style="margin-bottom:12px;">이벤트 관련 Redis 상태를 초기화합니다. 인증 세션은 유지됩니다.</p>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <button type="button" class="btn btn-outline btn-block" data-redis-mode="soft" style="text-align:left;padding:12px 16px;">
              <b>Soft</b><br/><span style="font-size:12px;color:var(--color-text-secondary);">대기열 · 매진 플래그 · 활성 이벤트 포인터 초기화 (좌석 유지)</span>
            </button>
            <button type="button" class="btn btn-outline btn-block" data-redis-mode="hard" style="text-align:left;padding:12px 16px;border-color:#e74c3c;">
              <b>Hard</b><br/><span style="font-size:12px;color:var(--color-text-secondary);">위 항목 + 전체 좌석 키 삭제 + DB에서 이벤트 목록 재동기화</span>
            </button>
            <button type="button" class="btn btn-outline btn-block" data-redis-mode="resync" style="text-align:left;padding:12px 16px;">
              <b>Resync</b><br/><span style="font-size:12px;color:var(--color-text-secondary);">MariaDB 기준으로 이벤트 목록 캐시만 재구성 (좌석·대기열 유지)</span>
            </button>
          </div>
        `,footerHtml:'<button type="button" class="btn btn-outline" data-modal-close>취소</button>'}),document.querySelectorAll("[data-redis-mode]").forEach(i=>{i.addEventListener("click",()=>{const a=i.dataset.redisMode;ke(),fetch("/admin/redis/reset",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:a})}).then(d=>d.json()).then(d=>{d.success?(Y({title:`Redis 초기화 완료 (${a})`,body:d.cleared.join(", "),type:"success"}),Re(e)):Y({title:"Redis 초기화 실패",body:d.message||"알 수 없는 오류"})}).catch(()=>Y({title:"Redis 초기화 요청 실패",body:"서버 연결을 확인해주세요."}))})})}),e.querySelector("[data-redis-recover]").addEventListener("click",()=>{var i;fe({title:"MariaDB → Redis 복구",bodyHtml:`
          <p style="margin-bottom:12px;">Redis가 비어있을 때 MariaDB 데이터를 기반으로 복구합니다.</p>
          <p style="font-size:13px;color:var(--color-text-secondary);margin-bottom:16px;">이벤트 목록, 좌석 상태, 대기열을 모두 복원합니다.<br/>이미 Redis에 데이터가 있는 항목은 건너뜁니다.</p>
          <button type="button" class="btn btn-primary btn-block" data-do-recover>복구 실행</button>
        `,footerHtml:'<button type="button" class="btn btn-outline" data-modal-close>취소</button>'}),(i=document.querySelector("[data-do-recover]"))==null||i.addEventListener("click",()=>{ke(),fetch("/admin/redis/recover",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({})}).then(a=>a.json()).then(a=>{var d,o,r,n,l;if(a.success){const c=a.results,y=[(d=c.events)!=null&&d.recovered?`이벤트 ${c.events.count}개`:null,(o=c.seats)!=null&&o.recovered?`좌석 ${c.seats.total}석`:((r=c.seats)==null?void 0:r.message)||null,(n=c.queue)!=null&&n.recovered?`대기열 (eligible=${c.queue.eligible}, standby=${c.queue.standby})`:((l=c.queue)==null?void 0:l.message)||null].filter(Boolean).join(" · ");Y({title:"Redis 복구 완료",body:y||"복구할 데이터 없음",type:"success"}),Re(e)}else Y({title:"Redis 복구 실패",body:a.message||"알 수 없는 오류"})}).catch(()=>Y({title:"Redis 복구 요청 실패",body:"서버 연결을 확인해주세요."}))})}),()=>{clearInterval(t)}}},ct=400;function Ye(e,{title:t,unit:i="",height:a=120,maxPoints:d=40,formatValue:o}={}){const r=[],n=o||(x=>ue(x));e.innerHTML=`
    <div class="mchart">
      <div class="mchart__head">
        <span class="mchart__title">${t}</span>
        <b class="mchart__val num-mono" data-val>–</b>
      </div>
      <div class="mchart__body" data-body>
        <svg class="mchart__svg" viewBox="0 0 ${ct} ${a}" preserveAspectRatio="none" data-svg>
          <line x1="0" y1="${a-1}" x2="${ct}" y2="${a-1}" class="mchart__baseline" />
          <path data-area class="mchart__area"></path>
          <path data-line class="mchart__line"></path>
          <line data-crosshair class="mchart__crosshair" y1="0" y2="${a}" style="display:none" />
          <circle data-dot class="mchart__dot" r="3.5" style="display:none" />
        </svg>
        <div class="mchart__tooltip" data-tooltip style="display:none"></div>
      </div>
    </div>
  `;const l=e.querySelector("[data-svg]"),c=e.querySelector("[data-line]"),y=e.querySelector("[data-area]"),g=e.querySelector("[data-val]"),b=e.querySelector("[data-crosshair]"),S=e.querySelector("[data-dot]"),E=e.querySelector("[data-tooltip]");function v(){const x=Math.max(...r)*1.15||1,s=Math.min(0,Math.min(...r)),A=ct/(d-1),I=x-s||1;return r.map((w,M)=>[M*A,a-(w-s)/I*a])}function k(){if(r.length<2)return;const x=v();c.setAttribute("d",x.map((s,A)=>A===0?`M${s[0]},${s[1]}`:`L${s[0]},${s[1]}`).join(" ")),y.setAttribute("d",`${x.map((s,A)=>A===0?`M${s[0]},${s[1]}`:`L${s[0]},${s[1]}`).join(" ")} L${x[x.length-1][0]},${a} L0,${a} Z`),g.textContent=`${n(r[r.length-1])}${i}`}return l.addEventListener("mousemove",x=>{if(r.length<2)return;const s=l.getBoundingClientRect(),A=(x.clientX-s.left)/s.width,I=Math.max(0,Math.min(r.length-1,Math.round(A*(d-1))));if(I>=r.length)return;const w=v(),[M,L]=w[I];b.setAttribute("x1",M),b.setAttribute("x2",M),b.style.display="",S.setAttribute("cx",M),S.setAttribute("cy",L),S.style.display="",E.style.display="",E.style.left=`${M/ct*100}%`,E.textContent=`${n(r[I])}${i}`}),l.addEventListener("mouseleave",()=>{b.style.display="none",S.style.display="none",E.style.display="none"}),{push(x){r.push(x),r.length>d&&r.shift(),k()}}}function Yi(e,{title:t,items:i,unit:a=""}){const d=Math.max(1,...i.map(o=>o.value));e.innerHTML=`
    <div class="mchart">
      <div class="mchart__head"><span class="mchart__title">${t}</span></div>
      <div class="mbar-list">
        ${i.map(o=>`
          <div class="mbar-row" title="${o.label}: ${ue(o.value)}${a}">
            <span class="mbar-row__label">${o.label}</span>
            <span class="mbar-row__track"><span class="mbar-row__fill" style="width:${o.value/d*100}%;background:${o.color}"></span></span>
            <span class="mbar-row__val num-mono">${ue(o.value)}${a}</span>
          </div>`).join("")}
      </div>
    </div>
  `}const Vi=["#3987e5","#d95926","#199e70","#c98500","#d55181","#008300","#9085e9","#e66767"],pt=ri.slice(0,8),Ki=Object.fromEntries(pt.map((e,t)=>[e.id,Vi[t%Vi.length]])),jt=[{name:"backend-counter-6b7f7dd8d4-hfbkh",ready:"1/1",status:"Running"},{name:"backend-counter-6b7f7dd8d4-qz9pw",ready:"1/1",status:"Running"},{name:"redis-counter-master-0",ready:"1/1",status:"Running"},{name:"prometheus-kube-prometheus-prometheus-0",ready:"2/2",status:"Running"},{name:"prometheus-grafana-7c9d6f9b7-2k5xs",ready:"3/3",status:"Running"}];function Ji(e){const t=e.querySelector("[data-monitor-badge]");t&&fetch("/api/monitor/health").then(i=>i.json().then(a=>({ok:i.ok,body:a}))).then(({ok:i,body:a})=>{const d=i&&a.status==="UP";t.className=`badge ${d?"badge-green":"badge-red"}`,t.innerHTML=`<span class="status-dot ${d?"status-dot--up":"status-dot--down"}"></span>Prometheus ${d?"UP":"DOWN"}`}).catch(()=>{t.className="badge badge-red",t.innerHTML='<span class="status-dot status-dot--down"></span>연결 실패'})}const qn={render(e){if(!Yt()){Y({title:"접근 권한이 없습니다",body:Le()?"모니터링 계정만 이용할 수 있는 페이지입니다.":"로그인이 필요한 페이지입니다."}),z("");return}pt.forEach(s=>ui(s.id)),e.innerHTML=`
      <div class="container admin-topbar">
        <div>
          <div class="eyebrow">MONITORING</div>
          <h2 class="section-title">모니터링 대시보드</h2>
          <p class="section-sub">Prometheus 파이프라인 실시간 지표 패널 — backend-counter /actuator/prometheus 연동</p>
        </div>
        <div class="admin-status">
          <a href="#/" class="btn btn-outline btn-sm">← 홈</a>
          <span class="badge badge-gray" data-monitor-badge><span class="status-dot"></span>확인 중...</span>
          <span class="text-secondary" data-scrape>마지막 스크랩: 방금 전</span>
        </div>
      </div>

      <div class="container admin-grid">
        <div class="admin-panel" data-heap></div>
        <div class="admin-panel" data-cpu></div>
        <div class="admin-panel" data-req></div>

        <div class="admin-panel admin-panel--wide" data-viewers></div>
        <div class="admin-panel admin-panel--wide" data-cancelpool></div>

        <div class="admin-panel admin-panel--wide" style="padding-bottom:0;">
          <div class="mchart__head">
            <span class="mchart__title">C파트(realtime-ws) Prometheus 모니터링</span>
            <a href="http://192.168.0.192:30091" target="_blank" class="btn btn-outline btn-sm" style="font-size:11px;padding:4px 12px;">Grafana 대시보드 열기 ↗</a>
          </div>
          <p class="section-sub" style="margin:2px 0 14px;">Prometheus에서 수집한 C파트 지표 (전체 Pod 합산) — 위 JVM 패널(D파트)과는 별개입니다.</p>
        </div>
        <div class="admin-panel" data-c-cpu></div>
        <div class="admin-panel" data-c-mem></div>
        <div class="admin-panel" data-c-ws></div>

        <div class="admin-panel">
          <div class="mchart__head"><span class="mchart__title">Kubernetes Pods</span><span class="badge badge-gray">${jt.length}/${jt.length} Ready</span></div>
          <table class="pods-table">
            ${jt.map(s=>`
              <tr>
                <td class="pod-name">${s.name}</td>
                <td><span class="status-dot status-dot--up"></span>${s.status}</td>
                <td class="text-secondary">${s.ready}</td>
              </tr>`).join("")}
          </table>
        </div>

        <div class="admin-panel">
          <div class="mchart__head"><span class="mchart__title">Prometheus Targets</span></div>
          <div class="target-row">
            <span class="target-row__name">backend-counter-service<br/><span class="text-secondary">/actuator/prometheus · 15s</span></span>
            <span><span class="status-dot status-dot--up"></span>UP</span>
          </div>
          <div class="target-row">
            <span class="target-row__name">redis-counter-master<br/><span class="text-secondary">redis_exporter · 15s</span></span>
            <span><span class="status-dot status-dot--up"></span>UP</span>
          </div>
          <div class="notice-box mt-16" style="margin-top:14px;">
            <p>jvm_memory_used_bytes, http_requests_total 등 Actuator 지표가 정상 스크랩되고 있습니다.</p>
          </div>
        </div>
      </div>
    `;const t=Ye(e.querySelector("[data-heap]"),{title:"JVM Heap Memory Used (jvm_memory_used_bytes)",unit:" MB"}),i=Ye(e.querySelector("[data-cpu]"),{title:"CPU Usage",unit:"%",formatValue:s=>s.toFixed(1)}),a=Ye(e.querySelector("[data-c-cpu]"),{title:"C파트 CPU Usage (process_cpu_seconds_total)",unit:"%",formatValue:s=>s.toFixed(1)}),d=Ye(e.querySelector("[data-c-mem]"),{title:"C파트 Memory (process_resident_memory_bytes)",unit:" MB"}),o=Ye(e.querySelector("[data-c-ws]"),{title:"WebSocket 활성 연결 수 (ws_active_connections)",unit:"개",formatValue:s=>s.toFixed(0)}),r=Ye(e.querySelector("[data-req]"),{title:"HTTP Request Rate",unit:" req/s",formatValue:s=>s.toFixed(1)});function n(s){const A={val:0},I=s.split(`
`);let w=0,M=n._prevHttpCount||0,L=n._prevTs||Date.now();for(const F of I)if(!(F.startsWith("#")||!F.trim())){if(F.startsWith("jvm_memory_used_bytes")&&F.includes('area="heap"')){const D=F.match(/\}\s+([\d.E+-]+)/);D&&(A.val+=parseFloat(D[1]))}if(F.startsWith("process_cpu_usage ")&&(A.cpu=parseFloat(F.split(" ")[1])*100),F.startsWith("http_server_requests_seconds_count")){const D=F.match(/\}\s+([\d.E+-]+)/);D&&(w+=parseFloat(D[1]))}}const f=Date.now(),h=(f-L)/1e3||15,u=Math.max(0,(w-M)/h);return n._prevHttpCount=w,n._prevTs=f,{heapMb:A.val/1024/1024,cpuPercent:A.cpu??0,reqPerSec:u}}function l(){fetch("/actuator/prometheus").then(s=>s.text()).then(s=>{const{heapMb:A,cpuPercent:I,reqPerSec:w}=n(s);t.push(A),i.push(I),r.push(w)}).catch(()=>{})}l();const c=setInterval(l,15e3);function y(){const s=['rate(process_cpu_seconds_total{job="realtime-ws"}[1m])*100','sum(process_resident_memory_bytes{job="realtime-ws"})','sum(ws_active_connections{job="realtime-ws"})'];Promise.all(s.map(A=>fetch(`/prom-api/api/v1/query?query=${encodeURIComponent(A)}`).then(I=>I.json()))).then(([A,I,w])=>{var u,F,D,C,R,p,m,O,H;const M=((u=A.data)==null?void 0:u.result)||[],L=M.reduce((G,K)=>G+parseFloat(K.value[1]),0)/(M.length||1),f=((R=(C=(D=(F=I.data)==null?void 0:F.result)==null?void 0:D[0])==null?void 0:C.value)==null?void 0:R[1])||0,h=((H=(O=(m=(p=w.data)==null?void 0:p.result)==null?void 0:m[0])==null?void 0:O.value)==null?void 0:H[1])||0;a.push(L),d.push(parseFloat(f)/1024/1024),o.push(parseFloat(h))}).catch(()=>{})}y();const g=setInterval(y,15e3);function b(){Yi(e.querySelector("[data-viewers]"),{title:"Redis Counter — 콘서트별 실시간 시청자수",unit:"명",items:pt.map(A=>({label:A.artist,value:ui(A.id).viewers,color:Ki[A.id]})).sort((A,I)=>I.value-A.value)});const s=pt.map(A=>{const I=dt(A.id);return{label:A.artist,value:I.VIP+I.R+I.S,color:Ki[A.id]}}).filter(A=>A.value>0).sort((A,I)=>I.value-A.value);Yi(e.querySelector("[data-cancelpool]"),{title:"취소표 Pool 현황 (원자적 카운터 합계)",unit:"매",items:s.length?s:[{label:"데이터 없음",value:0,color:"var(--color-border)"}]})}b();const S=setInterval(b,3e3);Ji(e);const E=setInterval(()=>Ji(e),15e3);let v=0;const k=e.querySelector("[data-scrape]"),x=setInterval(()=>{v+=1,v>=15&&(v=0),k.textContent=v===0?"마지막 스크랩: 방금 전":`마지막 스크랩: ${v}초 전`},1e3);return()=>{clearInterval(c),clearInterval(g),clearInterval(S),clearInterval(E),clearInterval(x)}}},yt=["#B5121B","#C98500","#199E70","#3987E5","#8E44AD","#16A085","#D35400","#2C3E50","#E74C3C","#1ABC9C"],Un={render(e){if(!at()){e.innerHTML='<div class="center-state"><div class="center-state__title">관리자 전용 페이지입니다</div></div>';return}e.innerHTML=`
      <style>
        .mapper-wrap { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }
        .mapper-title { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
        .mapper-desc { color: var(--color-text-secondary); font-size: 14px; margin-bottom: 20px; }
        .mapper-toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
        .mapper-toolbar label { font-size: 13px; font-weight: 600; }
        .mapper-toolbar input[type="file"] { font-size: 13px; }
        .mapper-canvas-wrap {
          position: relative; border: 2px solid var(--color-border);
          border-radius: 12px; overflow: hidden; background: #111;
          cursor: crosshair; user-select: none; touch-action: none;
        }
        .mapper-canvas-wrap canvas { display: block; width: 100%; }
        .mapper-guide {
          position: absolute; top: 12px; left: 12px; right: 12px;
          background: rgba(0,0,0,0.75); color: #fff; padding: 10px 14px;
          border-radius: 8px; font-size: 13px; pointer-events: none;
          z-index: 2;
        }
        .mapper-sidebar { margin-top: 20px; color: #eee; }
        .mapper-sidebar h3 { color: #fff; }
        .zone-list { list-style: none; padding: 0; }
        .zone-item {
          background: var(--color-bg-secondary); border-radius: 8px;
          padding: 14px; margin-bottom: 10px; position: relative;
        }
        .zone-item__head { display: flex; justify-content: space-between; align-items: center; }
        .zone-item__name { font-weight: 700; font-size: 15px; }
        .zone-item__info { font-size: 13px; color: var(--color-text-secondary); margin-top: 4px; }
        .zone-item__actions { display: flex; gap: 8px; }
        .zone-item__btn {
          background: none; border: 1px solid var(--color-border);
          border-radius: 6px; padding: 4px 10px; font-size: 12px;
          cursor: pointer; color: var(--color-text-primary);
        }
        .zone-item__btn:hover { background: var(--color-bg-tertiary); }
        .zone-item__btn--del { color: #e74c3c; border-color: #e74c3c; }
        .mapper-output {
          margin-top: 20px; background: #1e1e1e; color: #d4d4d4;
          border-radius: 8px; padding: 16px; font-family: monospace;
          font-size: 12px; max-height: 400px; overflow: auto;
          white-space: pre-wrap; word-break: break-all;
        }
        .mapper-btn-row { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
        .mapper-btn {
          padding: 10px 20px; border-radius: 8px; border: none;
          font-size: 14px; font-weight: 600; cursor: pointer;
        }
        .mapper-btn--primary { background: var(--color-primary); color: #fff; }
        .mapper-btn--secondary { background: var(--color-bg-secondary); color: var(--color-text-primary); border: 1px solid var(--color-border); }
        .mapper-modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.6);
          display: flex; align-items: center; justify-content: center; z-index: 1000;
        }
        .mapper-modal {
          background: var(--color-bg-primary); border-radius: 12px; padding: 24px;
          min-width: 320px; max-width: 90vw;
        }
        .mapper-modal h3 { margin: 0 0 16px; font-size: 18px; }
        .mapper-modal label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px; }
        .mapper-modal input, .mapper-modal select {
          width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--color-border);
          font-size: 14px; margin-bottom: 12px; background: var(--color-bg-secondary);
          color: var(--color-text-primary); box-sizing: border-box;
        }
        .mapper-modal .btn-row { display: flex; gap: 10px; justify-content: flex-end; }
      </style>

      <div class="mapper-wrap">
        <div class="mapper-title">좌석 맵핑 도구</div>
        <div class="mapper-desc">공연장 이미지 위에 구역별 3점을 클릭하여 좌석 좌표를 자동 생성합니다.</div>

        <div class="mapper-toolbar">
          <label>배경 이미지:</label>
          <input type="file" accept="image/*" data-file-input />
          <span style="font-size:12px;color:var(--color-text-secondary);" data-img-info>이미지를 불러오세요</span>
        </div>

        <div class="mapper-canvas-wrap" data-canvas-wrap>
          <div class="mapper-guide" data-guide>이미지를 먼저 불러오세요</div>
          <canvas data-canvas width="1200" height="700"></canvas>
        </div>

        <div class="mapper-sidebar">
          <h3 style="margin:0 0 12px;">정의된 구역</h3>
          <ul class="zone-list" data-zone-list></ul>
        </div>

        <div class="mapper-btn-row">
          <button class="mapper-btn mapper-btn--primary" data-export>JSON 내보내기</button>
          <button class="mapper-btn mapper-btn--secondary" data-copy>클립보드 복사</button>
          <button class="mapper-btn mapper-btn--secondary" data-clear>전체 초기화</button>
        </div>

        <pre class="mapper-output" data-output style="display:none;"></pre>
      </div>
    `;const t=e.querySelector("[data-canvas]"),i=t.getContext("2d"),a=e.querySelector("[data-canvas-wrap]"),d=e.querySelector("[data-guide]"),o=e.querySelector("[data-zone-list]"),r=e.querySelector("[data-output]"),n=e.querySelector("[data-file-input]"),l=e.querySelector("[data-img-info]");let c=null,y=[],g=[],b=0;const S=480;function E(){const h=a.getBoundingClientRect(),u=Math.floor(h.width);if(c){const F=c.naturalHeight/c.naturalWidth;let D=Math.floor(u*F);D>S&&(D=S),t.width=u,t.height=D}else t.width=u,t.height=Math.min(Math.floor(u*.5),S);v()}function v(){i.clearRect(0,0,t.width,t.height),c?i.drawImage(c,0,0,t.width,t.height):(i.fillStyle="#222",i.fillRect(0,0,t.width,t.height),i.fillStyle="#555",i.font="16px sans-serif",i.textAlign="center",i.fillText("이미지를 불러오세요",t.width/2,t.height/2)),y.forEach((h,u)=>{k(h,u)}),g.forEach((h,u)=>{x(h.x,h.y,"#FFD600",u+1)})}function k(h,u){const F=yt[u%yt.length],D=h.corners,C=s(D[0],D[1],D[2]);i.beginPath(),i.moveTo(D[0].x,D[0].y),i.lineTo(D[1].x,D[1].y),i.lineTo(C.x,C.y),i.lineTo(D[2].x,D[2].y),i.closePath(),i.fillStyle=F+"33",i.fill(),i.strokeStyle=F,i.lineWidth=2,i.stroke(),D.forEach((m,O)=>x(m.x,m.y,F,O+1)),x(C.x,C.y,F,4),h.seats&&h.seats.forEach(m=>{i.beginPath(),i.arc(m.x,m.y,3,0,Math.PI*2),i.fillStyle=F+"AA",i.fill()});const R=(D[0].x+D[1].x+D[2].x+C.x)/4,p=(D[0].y+D[1].y+D[2].y+C.y)/4;i.fillStyle="#fff",i.font="bold 14px sans-serif",i.textAlign="center",i.textBaseline="middle",i.strokeStyle="#000",i.lineWidth=3,i.strokeText(h.name,R,p),i.fillText(h.name,R,p)}function x(h,u,F,D){i.beginPath(),i.arc(h,u,8,0,Math.PI*2),i.fillStyle=F,i.fill(),i.strokeStyle="#fff",i.lineWidth=2,i.stroke(),i.fillStyle="#fff",i.font="bold 10px sans-serif",i.textAlign="center",i.textBaseline="middle",i.fillText(String(D),h,u)}function s(h,u,F){return{x:F.x+(u.x-h.x),y:F.y+(u.y-h.y)}}function A(h,u,F){const[D,C,R]=h,p=s(D,C,R),m=[];for(let O=0;O<u;O++){const H=u>1?O/(u-1):0,G=D.x+(R.x-D.x)*H,K=D.y+(R.y-D.y)*H,Z=C.x+(p.x-C.x)*H,J=C.y+(p.y-C.y)*H;for(let de=0;de<F;de++){const ne=F>1?de/(F-1):0;m.push({row:O+1,col:de+1,x:Math.round(G+(Z-G)*ne),y:Math.round(K+(J-K)*ne)})}}return m}function I(h){const u=t.getBoundingClientRect();return{x:Math.round((h.clientX-u.left)*(t.width/u.width)),y:Math.round((h.clientY-u.top)*(t.height/u.height))}}function w(){if(!c){d.textContent="이미지를 먼저 불러오세요";return}if(b===0){d.textContent="캔버스를 클릭하여 구역 정의를 시작하세요 (좌측 상단 → 우측 상단 → 좌측 하단 순서로 3점 클릭)";return}const h=["① 좌측 상단","② 우측 상단","③ 좌측 하단"],u=g.length;u<3&&(d.textContent=`${h[u]}을 클릭하세요 (${u}/3)`)}function M(){const h=document.createElement("div");h.className="mapper-modal-overlay",h.innerHTML=`
        <div class="mapper-modal">
          <h3>구역 정보 입력</h3>
          <label>구역 이름</label>
          <input type="text" data-m-name placeholder="예: VIP-A, 1층 B구역" />
          <label>등급 (Grade)</label>
          <select data-m-grade>
            <option value="VIP">VIP</option>
            <option value="R" selected>R</option>
            <option value="S">S</option>
            <option value="A">A</option>
          </select>
          <label>행 수 (Rows)</label>
          <input type="number" data-m-rows value="10" min="1" max="100" />
          <label>열 수 (Cols)</label>
          <input type="number" data-m-cols value="12" min="1" max="100" />
          <div class="btn-row">
            <button class="mapper-btn mapper-btn--secondary" data-m-cancel>취소</button>
            <button class="mapper-btn mapper-btn--primary" data-m-ok>생성</button>
          </div>
        </div>
      `,document.body.appendChild(h),h.querySelector("[data-m-cancel]").addEventListener("click",()=>{g=[],b=0,w(),v(),h.remove()}),h.querySelector("[data-m-ok]").addEventListener("click",()=>{const u=h.querySelector("[data-m-name]").value.trim()||`구역 ${y.length+1}`,F=h.querySelector("[data-m-grade]").value,D=parseInt(h.querySelector("[data-m-rows]").value)||10,C=parseInt(h.querySelector("[data-m-cols]").value)||12,R=A(g,D,C);y.push({name:u,grade:F,rows:D,cols:C,corners:[...g],seats:R}),g=[],b=0,w(),L(),v(),h.remove()})}t.addEventListener("click",h=>{if(c&&(b===0&&(b=1),b===1)){const u=I(h);g.push(u),v(),w(),g.length===3&&M()}});function L(){if(y.length===0){o.innerHTML='<li style="color:var(--color-text-secondary);font-size:13px;">아직 정의된 구역이 없습니다.</li>';return}o.innerHTML=y.map((h,u)=>`
        <li class="zone-item" style="border-left: 4px solid ${yt[u%yt.length]};">
          <div class="zone-item__head">
            <span class="zone-item__name">${h.name} (${h.grade})</span>
            <div class="zone-item__actions">
              <button class="zone-item__btn zone-item__btn--del" data-del="${u}">삭제</button>
            </div>
          </div>
          <div class="zone-item__info">${h.rows}행 × ${h.cols}열 = ${h.rows*h.cols}석 | 꼭짓점: (${h.corners.map(F=>`${F.x},${F.y}`).join(") (")})</div>
        </li>
      `).join(""),o.querySelectorAll("[data-del]").forEach(h=>{h.addEventListener("click",()=>{const u=parseInt(h.dataset.del);y.splice(u,1),L(),v()})})}function f(){const h=y.map(u=>({name:u.name,grade:u.grade,rows:u.rows,cols:u.cols,totalSeats:u.rows*u.cols,corners:u.corners,fourthPoint:s(u.corners[0],u.corners[1],u.corners[2]),seats:u.seats.map(F=>({id:`${u.grade}-${F.row}-${F.col}`,row:F.row,col:F.col,x:F.x,y:F.y,grade:u.grade,section:u.name}))}));return JSON.stringify(h,null,2)}return e.querySelector("[data-export]").addEventListener("click",()=>{if(y.length===0)return;const h=f();r.textContent=h,r.style.display="block"}),e.querySelector("[data-copy]").addEventListener("click",()=>{if(y.length===0)return;const h=f();navigator.clipboard.writeText(h).then(()=>{const u=e.querySelector("[data-copy]");u.textContent="복사 완료!",setTimeout(()=>u.textContent="클립보드 복사",1500)})}),e.querySelector("[data-clear]").addEventListener("click",()=>{y=[],g=[],b=0,w(),L(),v(),r.style.display="none"}),n.addEventListener("change",h=>{const u=h.target.files[0];if(!u)return;const F=new FileReader;F.onload=D=>{const C=new Image;C.onload=()=>{c=C,l.textContent=`${C.naturalWidth} × ${C.naturalHeight}px`,E(),w()},C.src=D.target.result},F.readAsDataURL(u)}),window.addEventListener("resize",E),E(),w(),L(),()=>{window.removeEventListener("resize",E)}}},Xi={VIP:"#B5121B",R:"#C98500",S:"#199E70",A:"#3987E5"},jn={VIP:"VIP (Floor)",R:"R석",S:"S석",A:"A석"},Zi=3.2,Gn=.6,Qi=8,Wn=.0012,zn=6;function Yn(e,t={}){const{onSelect:i=()=>{},gradeFilter:a=null}=t,d=document.createElement("canvas");d.style.cssText="display:block;width:100%;border-radius:8px;cursor:grab;touch-action:none;",e.appendChild(d);const o=d.getContext("2d"),r=[],n=[];Se.zones.forEach(f=>{const h=Xi[f.grade]||"#888",u={id:f.id,name:f.name,grade:f.grade,floor:f.floor,color:h,cx:0,cy:0};f.seats.forEach(C=>{r.push({id:C.id,zoneId:f.id,grade:f.grade,rawX:C.x,rawY:1e3-C.y,color:h,status:"available"})});const F=f.seats.map(C=>C.x),D=f.seats.map(C=>1e3-C.y);u.cx=F.reduce((C,R)=>C+R,0)/F.length,u.cy=D.reduce((C,R)=>C+R,0)/D.length,n.push(u)}),a&&r.forEach(f=>{f.grade!==a&&(f.status="sold")});let l=1,c=0,y=0,g=!1,b=0,S=0,E=0,v=0,k=!1,x=null,s=null;function A(){const f=e.getBoundingClientRect(),h=window.devicePixelRatio||1;d.width=f.width*h,d.height=Math.min(f.width*.75,600)*h,d.style.height=`${d.height/h}px`,o.setTransform(h,0,0,h,0,0),w()}function I(f,h){const u=d.width/(window.devicePixelRatio||1),F=d.height/(window.devicePixelRatio||1),D=Math.min(u,F)/1e3*l,C=u/2+c,R=F/2+y;return{x:C+(f-500)*D,y:R+(h-500)*D}}function w(){const f=d.width/(window.devicePixelRatio||1),h=d.height/(window.devicePixelRatio||1);o.clearRect(0,0,f,h),o.fillStyle="#111",o.fillRect(0,0,f,h);const u=Math.max(1.5,Zi*l),F=I(350,-15),D=I(650,25);o.fillStyle="#e74c3c",o.beginPath(),o.roundRect(F.x,F.y,D.x-F.x,D.y-F.y,4),o.fill(),o.fillStyle="#fff",o.font=`bold ${Math.max(8,12*l)}px sans-serif`,o.textAlign="center",o.textBaseline="middle";const C=I(500,5);o.fillText("STAGE",C.x,C.y),r.forEach(m=>{const O=I(m.rawX,m.rawY);if(O.x<-10||O.x>f+10||O.y<-10||O.y>h+10)return;let H;m.id===x?H="#7C4DFF":m.status==="sold"?H="#333":m.status==="holding"?H="#666":H=m.color,o.beginPath(),o.arc(O.x,O.y,u,0,Math.PI*2),o.fillStyle=H,o.fill(),m.id===s&&m.status==="available"&&(o.strokeStyle="#fff",o.lineWidth=1.5,o.stroke()),m.id===x&&(o.strokeStyle="#fff",o.lineWidth=2,o.stroke())}),l<3&&(o.font=`bold ${Math.max(7,9*l)}px sans-serif`,o.textAlign="center",o.textBaseline="middle",n.forEach(m=>{const O=I(m.cx,m.cy);o.strokeStyle="#000",o.lineWidth=2.5,o.strokeText(m.id,O.x,O.y),o.fillStyle="#fff",o.fillText(m.id,O.x,O.y)}));const R=10;let p=h-80;o.font="bold 11px sans-serif",Object.entries(Xi).forEach(([m,O])=>{o.fillStyle=O,o.beginPath(),o.arc(R+6,p+6,5,0,Math.PI*2),o.fill(),o.fillStyle="#ccc",o.textAlign="left",o.textBaseline="middle",o.fillText(jn[m]||m,R+16,p+6),p+=18})}function M(f,h){d.width/(window.devicePixelRatio||1),d.height/(window.devicePixelRatio||1);const u=Math.max(zn,Zi*l+3);let F=null,D=1/0;return r.forEach(C=>{if(C.status!=="available"&&C.id!==x)return;const R=I(C.rawX,C.rawY),p=R.x-f,m=R.y-h,O=Math.sqrt(p*p+m*m);O<u&&O<D&&(F=C,D=O)}),F}function L(f){const h=d.getBoundingClientRect();return{x:f.clientX-h.left,y:f.clientY-h.top}}return d.addEventListener("wheel",f=>{f.preventDefault();const h=-f.deltaY*Wn,u=Math.max(Gn,Math.min(Qi,l*(1+h))),F=L(f),D=d.width/(window.devicePixelRatio||1),C=d.height/(window.devicePixelRatio||1),R=F.x-D/2-c,p=F.y-C/2-y,m=u/l;c-=R*(m-1),y-=p*(m-1),l=u,w()},{passive:!1}),d.addEventListener("pointerdown",f=>{g=!0,k=!1,b=f.clientX,S=f.clientY,E=c,v=y,d.setPointerCapture(f.pointerId),d.style.cursor="grabbing"}),d.addEventListener("pointermove",f=>{if(g){const h=f.clientX-b,u=f.clientY-S;(Math.abs(h)>3||Math.abs(u)>3)&&(k=!0),c=E+h,y=v+u,w()}else{const h=L(f),u=M(h.x,h.y),F=u?u.id:null;F!==s&&(s=F,d.style.cursor=s?"pointer":"grab",w())}}),d.addEventListener("pointerup",f=>{if(g=!1,d.style.cursor=s?"pointer":"grab",!k){const h=L(f),u=M(h.x,h.y);u&&(x===u.id?(x=null,i(null)):(x=u.id,i(u)),w())}}),window.addEventListener("resize",A),A(),{getSeats:()=>r,getSelected:()=>r.find(f=>f.id===x),setStatus(f,h){const u=r.find(F=>F.id===f);u&&(u.status=h,w())},batchSetStatus(f,h){f.forEach(u=>{const F=r.find(D=>D.id===u);F&&(F.status=h)}),w()},clearSelection(){x=null,w()},stats(){let f=0,h=0,u=0,F=0;const D={};return r.forEach(C=>{D[C.grade]=D[C.grade]||{total:0,available:0},D[C.grade].total++,C.status==="available"?(f++,D[C.grade].available++):C.status==="sold"?h++:C.status==="holding"?u++:C.status==="mine"&&F++}),{total:r.length,available:f,sold:h,holding:u,mine:F,byGrade:D}},destroy(){window.removeEventListener("resize",A)},zoomToZone(f){if(!n.find(ne=>ne.id===f))return;const u=r.filter(ne=>ne.zoneId===f),F=u.map(ne=>ne.rawX),D=u.map(ne=>ne.rawY),C=Math.min(...F),R=Math.max(...F),p=Math.min(...D),m=Math.max(...D),O=R-C+60,H=m-p+60,G=d.width/(window.devicePixelRatio||1),K=d.height/(window.devicePixelRatio||1),Z=Math.min(G,K)/1e3;l=Math.min(Qi,Math.min(G/(O*Z),K/(H*Z)));const J=(C+R)/2,de=(p+m)/2;c=-(J-500)*Z*l,y=-(de-500)*Z*l,w()},resetView(){l=1,c=0,y=0,w()}}}const ea={VIP:"#B5121B",R:"#C98500",S:"#199E70",A:"#3987E5"},ta={VIP:"VIP (Floor)",R:"R석",S:"S석",A:"A석"},Vn={render(e){if(!at()){e.innerHTML='<div class="center-state"><div class="center-state__title">관리자 전용 페이지입니다</div></div>';return}const t=Se.zones.reduce((o,r)=>o+r.seats.length,0),i={};Se.zones.forEach(o=>{i[o.grade]=(i[o.grade]||0)+o.seats.length}),e.innerHTML=`
      <style>
        .oh-wrap { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }
        .oh-title { font-size: 22px; font-weight: 700; margin-bottom: 4px; color: #fff; }
        .oh-sub { font-size: 13px; color: #aaa; margin-bottom: 16px; }
        .oh-stats { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
        .oh-stat {
          background: #222; border-radius: 8px; padding: 10px 16px;
          display: flex; align-items: center; gap: 8px;
        }
        .oh-stat__dot { width: 10px; height: 10px; border-radius: 50%; }
        .oh-stat__label { font-size: 13px; color: #aaa; }
        .oh-stat__num { font-size: 15px; font-weight: 700; color: #fff; }
        .oh-map-wrap { border: 2px solid #333; border-radius: 12px; overflow: hidden; }
        .oh-zones { margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap; }
        .oh-zone-btn {
          background: #222; border: 1px solid #444; border-radius: 6px;
          padding: 4px 10px; font-size: 12px; cursor: pointer; color: #ddd;
        }
        .oh-zone-btn:hover { background: #333; }
        .oh-info { margin-top: 12px; font-size: 13px; color: #aaa; min-height: 20px; }
      </style>
      <div class="oh-wrap">
        <div class="oh-title">서울 올림픽홀 좌석 배치도</div>
        <div class="oh-sub">총 ${t.toLocaleString()}석 · ${Se.zones.length}개 구역</div>
        <div class="oh-stats">
          ${Object.entries(i).map(([o,r])=>`
            <div class="oh-stat">
              <div class="oh-stat__dot" style="background:${ea[o]}"></div>
              <span class="oh-stat__label">${ta[o]}</span>
              <span class="oh-stat__num">${r}</span>
            </div>
          `).join("")}
        </div>
        <div class="oh-map-wrap" data-map></div>
        <div class="oh-zones">
          <button class="oh-zone-btn" data-reset>전체 보기</button>
          ${Se.zones.map(o=>`
            <button class="oh-zone-btn" data-zone="${o.id}" style="border-color:${ea[o.grade]}55">${o.id}</button>
          `).join("")}
        </div>
        <div class="oh-info" data-info>좌석을 클릭하면 정보가 표시됩니다</div>
      </div>
    `;const a=e.querySelector("[data-info]"),d=Yn(e.querySelector("[data-map]"),{onSelect(o){if(o){const r=Se.zones.find(n=>n.id===o.zoneId);a.textContent=`${o.id} | ${r==null?void 0:r.name} | ${ta[o.grade]} | 좌표: (${o.rawX.toFixed(0)}, ${o.rawY.toFixed(0)})`}else a.textContent="좌석을 클릭하면 정보가 표시됩니다"}});return e.querySelector("[data-reset]").addEventListener("click",()=>d.resetView()),e.querySelectorAll("[data-zone]").forEach(o=>{o.addEventListener("click",()=>d.zoomToZone(o.dataset.zone))}),()=>d.destroy()}};be(/^$/,Lo);be(/^concerts$/,No);be(/^concert\/(?<id>[\w-]+)$/,_d);be(/^booking\/(?<id>[\w-]+)$/,{render(e,t){z(`concert/${t.id}`)}});be(/^queue\/(?<id>[\w-]+)$/,Ld);be(/^zones\/(?<id>[\w-]+)$/,Bd);be(/^seats\/(?<id>[\w-]+)\/(?<zoneId>[\w-]+)$/,Zd);be(/^payment\/(?<type>regular|cancel)$/,dn);be(/^complete\/(?<id>[\w-]+)$/,rn);be(/^cancel-queue\/(?<id>[\w-]+)$/,ln);be(/^membership$/,cn);be(/^membership-checkout\/(?<plan>monthly|yearly)$/,yn);be(/^private-link\/(?<id>[\w-]+)$/,xn);be(/^cancel-seats\/(?<id>[\w-]+)$/,un);be(/^mypage(?:\/(?<section>[\w-]+))?$/,fn);be(/^login$/,gn);be(/^signup$/,An);be(/^signup-complete$/,Sn);be(/^admin$/,Pn);be(/^monitoring$/,qn);be(/^seat-mapper$/,Un);be(/^olympic-hall$/,Vn);const ia=/^(queue|zones|seats)\//;let xt=!1;function aa(e){e.preventDefault(),e.returnValue=""}document.addEventListener("DOMContentLoaded",()=>{xo(document.getElementById("site-header")),po(document.getElementById("site-footer")),ga(document.getElementById("toast-root")),document.body.classList.toggle("admin-dark",at()||Yt()),nt(()=>document.body.classList.toggle("admin-dark",at()||Yt()));const e=(location.hash||"#/").replace(/^#\/?/,"");ia.test(e)&&(ot(),ft(),sessionStorage.removeItem("booking_step"),history.replaceState(null,"","#/")),document.addEventListener("click",$t),document.addEventListener("keydown",$t),Ha(document.getElementById("app-page"),{onChange:t=>{$t(),uo(t),ia.test(t)?(sessionStorage.setItem("booking_step",t.split("/")[0]),xt||(window.addEventListener("beforeunload",aa),xt=!0)):(sessionStorage.removeItem("booking_step"),xt&&(window.removeEventListener("beforeunload",aa),xt=!1))}})});
