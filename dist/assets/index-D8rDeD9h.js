(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))a(n);new MutationObserver(n=>{for(const o of n)if(o.type==="childList")for(const r of o.addedNodes)r.tagName==="LINK"&&r.rel==="modulepreload"&&a(r)}).observe(document,{childList:!0,subtree:!0});function i(n){const o={};return n.integrity&&(o.integrity=n.integrity),n.referrerPolicy&&(o.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?o.credentials="include":n.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function a(n){if(n.ep)return;n.ep=!0;const o=i(n);fetch(n.href,o)}})();let rt=null;function Me(){rt&&rt.close()}function be({title:e,bodyHtml:t,footerHtml:i="",size:a="",onClose:n=null}){Me();const o=document.createElement("div");o.className="modal-overlay",o.innerHTML=`
    <div class="modal-box ${a}" role="dialog" aria-modal="true">
      <div class="modal-box__head">
        <h3>${e}</h3>
        <button type="button" class="modal-box__close" data-modal-close aria-label="닫기">&times;</button>
      </div>
      <div class="modal-box__body">${t}</div>
      ${i?`<div class="modal-box__footer">${i}</div>`:""}
    </div>
  `,document.body.appendChild(o),document.body.classList.add("modal-open");function r(y){y.key==="Escape"&&l()}let d=!1;function l(){d||(d=!0,o.remove(),document.body.classList.remove("modal-open"),document.removeEventListener("keydown",r),rt===c&&(rt=null),typeof n=="function"&&n())}o.addEventListener("click",y=>{y.target===o&&l()}),o.querySelectorAll("[data-modal-close]").forEach(y=>y.addEventListener("click",l)),document.addEventListener("keydown",r);const c={el:o,close:l};return rt=c,c}const fa=[];let vt=null,Et=null,ti=()=>{};function ge(e,t){fa.push({pattern:e,page:t})}function V(e){const t=`#/${e}`.replace(/^#\/\/+/,"#/");location.hash===t?ii():location.hash=t}function Ka(){let e=location.hash||"#/";e=e.replace(/^#\/?/,"");const[t,i]=e.split("?"),a={};return i&&new URLSearchParams(i).forEach((n,o)=>a[o]=n),{path:t,query:a}}function Ja(e){for(const t of fa){const i=e.match(t.pattern);if(i)return{page:t.page,params:i.groups||{}}}return null}function ii(){const{path:e,query:t}=Ka(),i=Ja(e);if(typeof vt=="function")try{vt()}catch(n){console.error(n)}if(vt=null,Me(),Et.innerHTML="",!i){Et.innerHTML='<div class="center-state"><div class="center-state__icon">🎫</div><div class="center-state__title">페이지를 찾을 수 없습니다</div><div class="center-state__desc">주소를 다시 확인해주세요.</div></div>',ti(e);return}const a=i.page.render(Et,i.params,t);typeof a=="function"&&(vt=a),window.scrollTo({top:0,behavior:"instant"in window?"instant":"auto"}),ti(e)}function Xa(e,{onChange:t}={}){Et=e,t&&(ti=t),window.addEventListener("hashchange",ii),ii()}const ai=new Set,N={user:null,membership:null,interests:new Set,bookings:[],cancelQueues:{},cancelPools:{},currentOrder:null,returnTo:null,chatRooms:{},selectedSessions:{},venueZones:{},sessionExpiresAt:null,sessionJustExpired:!1,notifications:[],admissionTokens:{},seatSelectDeadline:null},ba=20*60*1e3,It="queuing_auth";function ga(e){return e===!0||e===1||e==="1"}function Je(){try{localStorage.setItem(It,JSON.stringify({user:N.user,sessionExpiresAt:N.sessionExpiresAt,membership:N.membership}))}catch{}}function ha(){try{localStorage.removeItem(It)}catch{}}function vi(){N.bookings=[],N.interests.clear(),N.cancelQueues={},N.notifications=[],N.currentOrder=null,N.selectedSessions={},N.admissionTokens={}}try{const e=JSON.parse(localStorage.getItem(It)||"null");e&&e.user&&e.sessionExpiresAt>Date.now()?(N.user=e.user,N.sessionExpiresAt=e.sessionExpiresAt,N.membership=e.membership||null,setTimeout(()=>{Aa(),Ia()},100)):e&&localStorage.removeItem(It)}catch{}function xe(){ai.forEach(e=>e(N))}function mt(e){return ai.add(e),()=>ai.delete(e)}function ie(){return N}function Za({name:e,email:t,isAdmin:i=!1,isMonitor:a=!1,role:n,userId:o,phone:r="",birthDate:d="",marketingOptIn:l=!1,joinedAt:c}){const y=n,x=o||(t||"guest").split("@")[0];(!N.user||N.user.userId!==x)&&vi(),N.user={name:e,userId:x,email:t||"guest@queuing.app",isAdmin:i||y==="ADMIN",isMonitor:a||y==="MONITOR",role:y,phone:r||"",birthDate:d||"",marketingOptIn:ga(l),joinedAt:c||Date.now(),accessToken:`mock-access-${Math.random().toString(36).slice(2)}`,refreshToken:`mock-refresh-${Math.random().toString(36).slice(2)}`},N.sessionExpiresAt=Date.now()+ba,N.sessionJustExpired=!1,Je(),xe(),Aa(),Ia()}function Qa(e){N.user&&(Object.assign(N.user,e),Je(),xe())}function Ea(e){var i;const t=(i=N.user)==null?void 0:i.userId;return t?fetch("/auth/profile",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:t,...e})}).then(async a=>{let n={};try{n=await a.json()}catch{}if(!a.ok||!n.success)return{success:!1,message:n.message||n.error||"회원정보를 저장하지 못했습니다."};const o=n.user||{};return Qa({...o.name!==void 0?{name:o.name}:{},...o.phone!==void 0?{phone:o.phone}:{},...o.birthDate!==void 0?{birthDate:o.birthDate}:{},...o.marketingOptIn!==void 0?{marketingOptIn:ga(o.marketingOptIn)}:{},...o.joinedAt!==void 0?{joinedAt:o.joinedAt}:{}}),n}).catch(a=>(console.error("[Auth] 회원정보 수정 API 실패:",a),{success:!1,message:"네트워크 오류로 회원정보를 저장하지 못했습니다."})):Promise.resolve({success:!1,message:"로그인이 필요합니다."})}function xt(){return!!(N.user&&N.user.isAdmin)}function oi(){return!!(N.user&&N.user.isMonitor)}function eo(){vi(),N.user=null,N.sessionExpiresAt=null,N.membership=null,ha(),xe()}function Rt(){!N.user||!N.sessionExpiresAt||(N.sessionExpiresAt=Date.now()+ba,Je())}function Ce(){return!!N.user}function to(){const e=N.sessionJustExpired;return N.sessionJustExpired=!1,e}function Fa(){N.user&&(vi(),N.user=null,N.sessionExpiresAt=null,N.membership=null,N.sessionJustExpired=!0,ha(),xe())}function io(e){var i;const t=(i=N.user)==null?void 0:i.userId;return t?fetch("/membership/subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:t,plan:e})}).then(a=>a.json()).then(a=>(a.success&&(N.membership={plan:e,since:a.expiresAt||new Date().toISOString()},Je(),xe()),a)).catch(a=>(console.error("[Membership] 가입 API 실패:",a),{success:!1,message:"네트워크 오류가 발생했습니다."})):Promise.resolve({success:!1,message:"로그인이 필요합니다."})}function ze(){return!!N.membership}function ao(){var t;const e=(t=N.user)==null?void 0:t.userId;return e?fetch("/membership/cancel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:e})}).then(i=>i.json()).then(i=>(i.success&&(N.membership=null,Je(),xe()),i)).catch(i=>(console.error("[Membership] 해지 API 실패:",i),{success:!1,message:"네트워크 오류가 발생했습니다."})):Promise.resolve({success:!1,message:"로그인이 필요합니다."})}function Ia(){var t;const e=(t=N.user)==null?void 0:t.userId;e&&fetch(`/membership/${e}`).then(i=>i.json()).then(i=>{i.isMembership?(N.membership={plan:i.plan,since:i.createdAt},Je()):(N.membership=null,Je()),xe()}).catch(()=>{})}function fi(e){var i;const t=(i=N.user)==null?void 0:i.userId;N.interests.has(e)?(N.interests.delete(e),t&&fetch("/wishlist/remove",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:t,eventId:e})}).catch(()=>{})):(N.interests.add(e),t&&fetch("/wishlist/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:t,eventId:e})}).catch(()=>{})),xe()}function at(e){return N.interests.has(e)}function Aa(){var t;const e=(t=N.user)==null?void 0:t.userId;e&&fetch(`/wishlist/${e}`).then(i=>i.json()).then(i=>{N.interests.clear(),(i.wishlists||[]).forEach(a=>N.interests.add(a.eventId)),xe()}).catch(()=>{})}function bi(e){N.currentOrder=e,xe()}function At(){N.currentOrder=null,xe()}function oo(e){var i;const t={...e,ownerUserId:e.ownerUserId||((i=N.user)==null?void 0:i.userId)||null};return N.bookings.unshift(t),kt({title:t.status==="unpaid"?"입금 대기 중인 예매가 있어요":"예매가 확정되었습니다",body:t.status==="unpaid"?`예매번호 ${t.bookingId} · 가상계좌로 입금을 완료해주세요.`:`예매번호 ${t.bookingId} 결제가 정상적으로 완료되었습니다.`}),xe(),t}function no(e){var a;const t=(a=N.user)==null?void 0:a.userId;if(!t||e.ownerUserId&&e.ownerUserId!==t)return e;const i={...e,ownerUserId:t};return N.bookings.some(n=>n.bookingId===i.bookingId)||(N.bookings.push(i),xe()),i}function so(e){return N.bookings.some(t=>{var i,a;return((i=t.seat)==null?void 0:i.id)===e||((a=t.seats)==null?void 0:a.some(n=>n.id===e))})}function St(e,t){return!(t!=null&&t.date)&&!(t!=null&&t.time)?e:`${e}:${t.date||"date"}:${t.time||"time"}`}function _t(e,t,i){N.admissionTokens[St(e,i)]=t}function Sa(e,t){const i=N.admissionTokens[St(e,t)];return i?i.expiresAt&&Date.now()>new Date(i.expiresAt).getTime()?(delete N.admissionTokens[St(e,t)],null):i:null}function ro(e,t){delete N.admissionTokens[St(e,t)]}function lo(e=7*60*1e3){return N.seatSelectDeadline&&N.seatSelectDeadline>Date.now()||(N.seatSelectDeadline=Date.now()+e,xe()),N.seatSelectDeadline}function Ai(){return N.seatSelectDeadline}function ut(){N.seatSelectDeadline&&(N.seatSelectDeadline=null,xe())}function kt({title:e,body:t}){N.notifications.unshift({id:`N${Date.now()}${Math.floor(Math.random()*1e3)}`,title:e,body:t,createdAt:Date.now(),read:!1}),xe()}function _a(){return N.notifications}function co(){return N.notifications.filter(e=>!e.read).length}function ka(){N.notifications.some(e=>!e.read)&&(N.notifications.forEach(e=>e.read=!0),xe())}function Si(e){return N.bookings.find(t=>t.bookingId===e)}function $a(e,{max:t=2e3}={}){if(N.cancelQueues[e])return N.cancelQueues[e];const a={myNumber:Math.max(1,Math.floor(Math.random()*t*.9)+1),total:t,joinedAt:Date.now()};return N.cancelQueues[e]=a,xe(),a}function pt(e){return N.cancelPools[e]||(N.cancelPools[e]={VIP:3,R:9,S:17},xe()),N.cancelPools[e]}function wa(e,t){const i=pt(e);i[t]=(i[t]||0)+1,xe()}function Da(e,t){const i=pt(e);i[t]>0&&(i[t]-=1),xe()}function Xe(e){N.returnTo=e}function Ta(){const e=N.returnTo;return N.returnTo=null,e}function _i(e){return N.chatRooms[e]||(N.chatRooms[e]={viewers:60+Math.floor(Math.random()*480),messages:[]}),N.chatRooms[e]}function et(e,t){N.selectedSessions[e]=t,xe()}function $t(e){return N.selectedSessions[e]||null}function yo(e,t){if(!N.venueZones[e]){const i={};t.forEach(a=>{i[a.id]=a.seed}),N.venueZones[e]=i,xe()}return N.venueZones[e]}function xo(e,t,i){const a=N.venueZones[e];!a||a[t]==null||(a[t]=Math.max(0,a[t]-i),xe())}function ni(e,t){var i;return((i=N.venueZones[e])==null?void 0:i[t])??0}function uo(e){const t=N.bookings.find(i=>i.bookingId===e);!t||t.status!=="confirmed"||(t.status="refund_pending",t.cancelledAt=Date.now(),kt({title:"환불 처리 중입니다",body:`예매번호 ${t.bookingId}의 환불이 접수되었습니다.`}),xe(),setTimeout(()=>{t.status="refunded",(t.seats&&t.seats.length?t.seats:t.seat?[t.seat]:[]).forEach(a=>wa(t.concertId,a.grade)),kt({title:"환불이 완료되었습니다",body:`예매번호 ${t.bookingId}의 환불 처리가 완료되었습니다.`}),xe()},4e3))}function po(e){const t=N.bookings.find(i=>i.bookingId===e);!t||t.status!=="unpaid"||(t.status="cancelled",t.cancelledAt=Date.now(),kt({title:"입금 전 예매가 취소되었습니다",body:`예매번호 ${t.bookingId}의 무통장입금 예매가 취소되었습니다.`}),xe())}setInterval(()=>{N.user&&N.sessionExpiresAt&&Date.now()>N.sessionExpiresAt&&Fa()},5e3);typeof window<"u"&&(window.__queuingDebug={...window.__queuingDebug||{},expireSession:Fa});let di=null;function La(e){di=e}function J({title:e,body:t,actionLabel:i,onAction:a,type:n="default",duration:o=3600}){if(!di)return;const r=document.createElement("div");r.className=`toast ${n==="success"?"toast-success":""}`,r.innerHTML=`
    ${e?`<div class="toast__title">${e}</div>`:""}
    ${t?`<div class="toast__body">${t}</div>`:""}
    ${i?`<div class="toast__action">${i}</div>`:""}
  `,i&&a&&r.querySelector(".toast__action").addEventListener("click",()=>{a(),l()}),di.appendChild(r);let d=!1;function l(){d||(d=!0,r.style.transition="opacity .2s ease",r.style.opacity="0",setTimeout(()=>r.remove(),200))}const c=setTimeout(l,o);return r.addEventListener("click",()=>{clearTimeout(c),l()}),l}const mo=Object.freeze(Object.defineProperty({__proto__:null,mountToastRoot:La,showToast:J},Symbol.toStringTag,{value:"Module"}));function ye(e){return Math.max(0,Math.round(e)).toLocaleString("ko-KR")}function ve(e){return`₩${ye(e)}`}function Le(e){return String(Math.max(0,Math.floor(e))).padStart(2,"0")}function Ma(e){if(e<=0)return"00 : 00 : 00";const t=Math.floor(e/1e3),i=Math.floor(t/3600),a=Math.floor(t%3600/60),n=t%60;return`${Le(i)} : ${Le(a)} : ${Le(n)}`}function gi(e){if(e<=0)return"00:00";const t=Math.floor(e/1e3),i=Math.floor(t/60),a=t%60;return`${Le(i)}:${Le(a)}`}function wt(e){if(e<=0)return"마감";const t=Math.floor(e/1e3),i=Math.floor(t/86400),a=Math.floor(t%86400/3600),n=Math.floor(t%3600/60),o=t%60;return`${i>0?`D-${i} `:""}${Le(a)}:${Le(n)}:${Le(o)}`}function Bt(e){const t=new Date(e),i=["일","월","화","수","목","금","토"];return`${t.getFullYear()}.${Le(t.getMonth()+1)}.${Le(t.getDate())}(${i[t.getDay()]})`}function Ht(e){const t=new Date(e);return`${t.getFullYear()}.${Le(t.getMonth()+1)}.${Le(t.getDate())}`}function vo(e,t){return!t||e===t?Ht(e):`${Ht(e)} ~ ${Ht(t)}`}function fo(e="A"){const i=new Date().getFullYear(),a=Math.floor(1e5+Math.random()*9e5);return`${e}${i}${a}`}const bo=[{label:"공연",path:"",match:/^$|^concert\//},{label:"콘서트",path:"concerts",match:/^concerts$/},{label:"관심 공연",path:"mypage/interests",match:/^mypage\/interests$/},{label:"마이페이지",path:"mypage",match:/^mypage/}],si=/^(queue|zones|payment)\//,go=/^complete\//;let $e=null,tt="",Ne=!1,He=!1,Ze=null;function ho(e){const t=Date.now()-e,i=Math.floor(t/6e4);if(i<1)return"방금 전";if(i<60)return`${i}분 전`;const a=Math.floor(i/60);return a<24?`${a}시간 전`:`${Math.floor(a/24)}일 전`}function Eo(){var e;be({title:"로그아웃하시겠습니까?",bodyHtml:"<p>로그아웃 시 다시 로그인해야 예매내역과 마이페이지를 이용할 수 있습니다.</p>",footerHtml:`
      <button type="button" class="btn btn-ghost" data-modal-close>취소</button>
      <button type="button" class="btn btn-primary" data-confirm-logout>로그아웃</button>
    `}),(e=document.querySelector("[data-confirm-logout]"))==null||e.addEventListener("click",()=>{Me(),eo(),V("")})}function Fo(){var e;be({title:"로그인 세션이 만료되었습니다",bodyHtml:"<p>안전한 서비스 이용을 위해 다시 로그인해주세요.</p>",footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close data-relogin>다시 로그인</button>'}),(e=document.querySelector("[data-relogin]"))==null||e.addEventListener("click",()=>{Xe(tt),V("login")})}function qe(){const{user:e,membership:t}=ie();if(!e&&to()&&Fo(),Ze&&(clearInterval(Ze),Ze=null),go.test(tt)){$e.style.display="none",$e.innerHTML="";return}$e.style.display="";const i=_a(),a=co(),n=Ai(),o=si.test(tt),r=n?`<div class="header-seat-timer" data-seat-timer>
        <span class="header-seat-timer__label">좌석선택 제한시간</span>
        <span class="header-seat-timer__clock num-mono" data-seat-timer-clock>--:--</span>
      </div>`:"";if($e.innerHTML=o?`
    <div class="container">
      <div class="site-header__left">
        <a href="#/" class="site-header__logo">
          <img src="/images/queuing-logo-header.png" alt="QUEUING" class="site-header__mark" />
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
          <img src="/images/queuing-logo-header.png" alt="QUEUING" class="site-header__mark" />
        </a>
        <div class="site-header__nav-shell">
          <nav class="site-header__nav">
            ${bo.map(x=>`<a href="#/${x.path}" data-path="${x.path}" class="${x.match.test(tt)?"active":""}">${x.label}</a>`).join("")}
          </nav>
          <form class="site-header__search" data-header-search role="search">
            <input type="search" name="search" placeholder="공연 검색" autocomplete="off" aria-label="공연 검색" />
            <button type="submit" aria-label="공연 검색">⌕</button>
          </form>
        </div>
      </div>
      <div class="site-header__actions">
        ${r}
        ${e?`
          <div class="notif-wrap">
            <button type="button" class="notif-bell" data-notif-toggle aria-label="알림">
              🔔${a>0?`<span class="notif-bell__dot">${a>9?"9+":a}</span>`:""}
            </button>
            <div class="notif-dropdown ${He?"open":""}" data-notif-panel>
              <div class="notif-dropdown__head">알림</div>
              ${i.length?i.slice(0,8).map(x=>`
                    <div class="notif-item ${x.read?"":"is-unread"}">
                      <div class="notif-item__title">${x.title}</div>
                      <div class="notif-item__body">${x.body}</div>
                      <div class="notif-item__time">${ho(x.createdAt)}</div>
                    </div>`).join(""):'<div class="notif-empty">아직 알림이 없습니다.</div>'}
            </div>
          </div>

          <div class="profile-wrap">
            <button type="button" class="site-header__user ${Ne?"open":""}" data-profile-toggle>
              <span>${e.name}님</span>
              ${t?'<span class="site-header__member-chip">MEMBERSHIP</span>':""}
              ${e.isAdmin?'<span class="site-header__member-chip site-header__member-chip--admin">ADMIN</span>':""}
              ${e.isMonitor?'<span class="site-header__member-chip site-header__member-chip--admin">MONITOR</span>':""}
              <span class="profile-caret">▾</span>
            </button>
            <div class="profile-dropdown ${Ne?"open":""}" data-profile-panel>
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
  `,n){const x=$e.querySelector("[data-seat-timer-clock]"),_=$e.querySelector("[data-seat-timer]"),u=()=>{const g=Ai()-Date.now();if(g<=0){clearInterval(Ze),Ze=null,ut(),At(),J({title:"좌석선택 시간이 만료되었습니다",body:"처음부터 다시 예매해주세요."}),V("");return}x&&(x.textContent=gi(g)),_&&_.classList.toggle("header-seat-timer--urgent",g<=6e4)};u(),Ze=setInterval(u,1e3)}const d=$e.querySelector("[data-notif-toggle]");d&&d.addEventListener("click",x=>{x.stopPropagation(),He=!He,Ne=!1,He&&ka(),qe()});const l=$e.querySelector("[data-header-search]");l&&l.addEventListener("submit",x=>{x.preventDefault();const _=l.elements.search.value.trim();V(_?`concerts?search=${encodeURIComponent(_)}`:"concerts")});const c=$e.querySelector("[data-profile-toggle]");c&&c.addEventListener("click",x=>{x.stopPropagation(),Ne=!Ne,He=!1,qe()});const y=$e.querySelector('[data-action="logout"]');y&&y.addEventListener("click",()=>{Ne=!1,qe(),Eo()})}function Io(e){$e&&$e.contains(e.target)&&(!e.target.closest("[data-notif-toggle]")&&!e.target.closest("[data-notif-panel]")&&He&&(He=!1,qe()),!e.target.closest("[data-profile-toggle]")&&!e.target.closest("[data-profile-panel]")&&Ne&&(Ne=!1,qe()))}function Ao(e){$e=e,qe(),mt(qe),document.addEventListener("click",t=>{if($e){if(!$e.contains(t.target)){He&&(He=!1,qe()),Ne&&(Ne=!1,qe());return}Io(t)}})}function So(e){const t=si.test(tt),i=si.test(e);tt=e,Ne=!1,He=!1,t&&!i&&ut(),qe()}function _o(e){e.innerHTML=`
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
  `}const ko=["일","월","화","수","목","금","토"],$o=(e,t)=>`${e}.${String(t+1).padStart(2,"0")}`;function Pt(e){return`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,"0")}-${String(e.getDate()).padStart(2,"0")}`}function ki(e){const t=new Date(e.getFullYear(),e.getMonth(),e.getDate());return t.setDate(t.getDate()-t.getDay()),t}function wo(e){const t=new Date(e);t.setDate(t.getDate()+6);const i=e.getMonth()===t.getMonth(),a=`${e.getMonth()+1}.${e.getDate()}`,n=i?`${t.getDate()}`:`${t.getMonth()+1}.${t.getDate()}`;return`${e.getFullYear()}.${a} ~ ${n}`}function Do(e){return e==="performance"?{label:"공연 일정",cls:"badge-gray"}:e==="booked"?{label:"예매 완료",cls:"badge-red"}:e==="interest"?{label:"관심 공연",cls:"badge-red-light"}:e==="upcoming"?{label:"예매 오픈",cls:"badge-outline"}:{label:"",cls:"badge-gray"}}function To(e,{events:t=[],onSelectConcert:i=()=>{}}={}){const a=new Date;let n="month",o=new Date(a.getFullYear(),a.getMonth(),1),r=ki(a),d=Pt(a);function l(g){return t.filter(m=>m.date===g)}function c(g,m){const F=Pt(a),f=Pt(g);if(m)return`<div class="cal__day is-outside"><span class="cal__day-num">${g.getDate()}</span></div>`;const s=l(f),A=s.some(S=>S.type==="booked"),I=s.some(S=>S.type==="interest"),C=s.some(S=>S.type==="upcoming"),O=s.some(S=>S.type==="performance");return`
      <div class="${["cal__day",f===F?"is-today":"",f===d?"is-selected":""].join(" ")}" data-date="${f}">
        <span class="cal__day-num">${g.getDate()}</span>
        <span class="cal__day-dots">
          ${A?'<span class="cal__dot cal__dot--booked" title="예매 완료"></span>':""}
          ${I?'<span class="cal__dot--interest">♥</span>':""}
          ${C?'<span class="cal__dot cal__dot--upcoming" title="예매 오픈"></span>':""}
          ${O?'<span class="cal__dot cal__dot--performance" title="공연 일정"></span>':""}
        </span>
      </div>
    `}function y(){const g=o.getFullYear(),m=o.getMonth(),f=new Date(g,m,1).getDay(),s=new Date(g,m+1,0).getDate(),A=[];for(let C=f;C>0;C--)A.push({date:new Date(g,m,1-C),outside:!0});for(let C=1;C<=s;C++)A.push({date:new Date(g,m,C),outside:!1});let I=1;for(;A.length<42;)A.push({date:new Date(g,m+1,I),outside:!0}),I++;return A}function x(){const g=[];for(let m=0;m<7;m++){const F=new Date(r);F.setDate(F.getDate()+m),g.push({date:F,outside:!1})}return g}function _(){const g=n==="month"?y():x(),m=n==="month"?$o(o.getFullYear(),o.getMonth()):wo(r);e.classList.toggle("cal--week",n==="week"),e.classList.toggle("cal--month",n==="month"),e.innerHTML=`
      <div class="cal__head">
        <div class="cal__head-title">${m}</div>
        <div class="cal__head-right">
          <div class="cal__view-toggle">
            <button type="button" data-mode="month" class="${n==="month"?"active":""}">월간</button>
            <button type="button" data-mode="week" class="${n==="week"?"active":""}">주간</button>
          </div>
          <div class="cal__nav">
            <button type="button" data-nav="-1">‹</button>
            <button type="button" data-nav="1">›</button>
          </div>
        </div>
      </div>
      <div class="cal__weekdays">${ko.map(F=>`<span>${F}</span>`).join("")}</div>
      <div class="cal__grid ${n==="week"?"cal__grid--week":""}">
        ${g.map(F=>c(F.date,F.outside)).join("")}
      </div>
      <div class="cal__legend">
        <span><span class="cal__dot cal__dot--booked"></span>예매 완료</span>
        <span><span class="cal__dot--interest">♥</span>관심 공연</span>
        <span><span class="cal__dot cal__dot--upcoming"></span>예매 오픈/예정</span>
        <span><span class="cal__dot cal__dot--performance"></span>공연 일정</span>
      </div>
      <div class="cal__selected-info" data-info></div>
    `,u(),e.querySelectorAll("[data-mode]").forEach(F=>{F.addEventListener("click",()=>{const f=F.dataset.mode;if(f!==n){if(f==="week"){const s=d?new Date(d):a;r=ki(s)}else o=new Date(r.getFullYear(),r.getMonth(),1);n=f,_()}})}),e.querySelectorAll("[data-nav]").forEach(F=>{F.addEventListener("click",()=>{const f=Number(F.dataset.nav);if(n==="month")o=new Date(o.getFullYear(),o.getMonth()+f,1);else{const s=new Date(r);s.setDate(s.getDate()+f*7),r=s}_()})}),e.querySelectorAll(".cal__day[data-date]").forEach(F=>{F.addEventListener("click",()=>{d=F.dataset.date,_()})})}function u(){const g=e.querySelector("[data-info]");if(!g)return;const m=l(d);if(!m.length){g.innerHTML=`<div class="empty">${d==null?void 0:d.slice(5).replace("-",".")} 일정이 없습니다.</div>`;return}g.innerHTML=m.map(F=>{const f=Do(F.type);return`
          <div class="cal__event-row" data-concert="${F.concertId||""}">
            <b>${F.title}</b>
            <span class="badge ${f.cls}">${f.label}</span>
          </div>
        `}).join(""),g.querySelectorAll("[data-concert]").forEach(F=>{const f=F.dataset.concert;f&&(F.style.cursor="pointer",F.addEventListener("click",()=>i(f)))})}return _(),{setEvents(g){t=g,_()}}}const Te={zones:[{id:"A1",name:"A1 구역",grade:"S",floor:"1F",seats:[{id:"A1-1",x:56,y:914.7},{id:"A1-2",x:56,y:905.7},{id:"A1-3",x:56,y:896.3},{id:"A1-4",x:56,y:886.8},{id:"A1-5",x:56,y:877.8},{id:"A1-6",x:56,y:868.4},{id:"A1-7",x:66.9,y:951.6},{id:"A1-8",x:66.9,y:942.6},{id:"A1-9",x:66.9,y:933.2},{id:"A1-10",x:66.9,y:923.7},{id:"A1-11",x:66.9,y:914.7},{id:"A1-12",x:66.9,y:905.7},{id:"A1-13",x:66.9,y:896.3},{id:"A1-14",x:66.9,y:886.8},{id:"A1-15",x:66.9,y:877.8},{id:"A1-16",x:66.9,y:868.4},{id:"A1-17",x:85.1,y:951.6},{id:"A1-18",x:85.1,y:942.6},{id:"A1-19",x:85.1,y:933.2},{id:"A1-20",x:85.1,y:923.7},{id:"A1-21",x:85.1,y:914.7},{id:"A1-22",x:85.1,y:905.7},{id:"A1-23",x:85.1,y:896.3},{id:"A1-24",x:85.1,y:886.8},{id:"A1-25",x:85.1,y:877.8},{id:"A1-26",x:85.1,y:868.4},{id:"A1-27",x:95.9,y:951.6},{id:"A1-28",x:95.9,y:942.6},{id:"A1-29",x:95.9,y:933.2},{id:"A1-30",x:95.9,y:923.7},{id:"A1-31",x:95.9,y:914.7},{id:"A1-32",x:95.9,y:905.7},{id:"A1-33",x:95.9,y:896.3},{id:"A1-34",x:95.9,y:886.8},{id:"A1-35",x:95.9,y:877.8},{id:"A1-36",x:95.9,y:868.4},{id:"A1-37",x:106.9,y:951.6},{id:"A1-38",x:106.9,y:942.6},{id:"A1-39",x:106.9,y:933.2},{id:"A1-40",x:106.9,y:923.7},{id:"A1-41",x:106.9,y:914.7},{id:"A1-42",x:106.9,y:905.7},{id:"A1-43",x:106.9,y:896.3},{id:"A1-44",x:106.9,y:886.8},{id:"A1-45",x:106.9,y:877.8},{id:"A1-46",x:106.9,y:868.4},{id:"A1-47",x:117.2,y:951.6},{id:"A1-48",x:117.2,y:942.6},{id:"A1-49",x:117.2,y:933.2},{id:"A1-50",x:117.2,y:923.7},{id:"A1-51",x:117.2,y:914.7},{id:"A1-52",x:117.2,y:905.7},{id:"A1-53",x:117.2,y:896.3},{id:"A1-54",x:117.2,y:886.8},{id:"A1-55",x:117.2,y:877.8},{id:"A1-56",x:117.2,y:868.4},{id:"A1-57",x:128.3,y:951.6},{id:"A1-58",x:128.3,y:942.6},{id:"A1-59",x:128.3,y:933.2},{id:"A1-60",x:128.3,y:923.7},{id:"A1-61",x:128.3,y:914.7},{id:"A1-62",x:128.3,y:905.7},{id:"A1-63",x:128.3,y:896.3},{id:"A1-64",x:128.3,y:886.8},{id:"A1-65",x:128.3,y:877.8},{id:"A1-66",x:128.3,y:868.4},{id:"A1-67",x:138.7,y:951.6},{id:"A1-68",x:138.7,y:942.6},{id:"A1-69",x:138.7,y:933.2},{id:"A1-70",x:138.7,y:923.7},{id:"A1-71",x:138.7,y:914.7},{id:"A1-72",x:138.7,y:905.7},{id:"A1-73",x:138.7,y:896.3},{id:"A1-74",x:138.7,y:886.8},{id:"A1-75",x:138.7,y:877.8},{id:"A1-76",x:138.7,y:868.4},{id:"A1-77",x:149.1,y:951.6},{id:"A1-78",x:149.1,y:942.6},{id:"A1-79",x:149.1,y:933.2},{id:"A1-80",x:149.1,y:923.7},{id:"A1-81",x:149.1,y:914.7},{id:"A1-82",x:149.1,y:905.7},{id:"A1-83",x:149.1,y:896.3},{id:"A1-84",x:149.1,y:886.8},{id:"A1-85",x:149.1,y:877.8},{id:"A1-86",x:149.1,y:868.4}]},{id:"A2",name:"A2 구역",grade:"S",floor:"1F",seats:[{id:"A2-1",x:44.4,y:828.9},{id:"A2-2",x:44.4,y:819.9},{id:"A2-3",x:44.4,y:810.9},{id:"A2-4",x:44.4,y:801.4},{id:"A2-5",x:44.4,y:792},{id:"A2-6",x:44.4,y:783},{id:"A2-7",x:44.4,y:773.6},{id:"A2-8",x:44.4,y:764.5},{id:"A2-9",x:44.4,y:755.1},{id:"A2-10",x:44.4,y:746.1},{id:"A2-11",x:44.4,y:736.6},{id:"A2-12",x:44.4,y:727.6},{id:"A2-13",x:56.2,y:828.9},{id:"A2-14",x:56.2,y:819.9},{id:"A2-15",x:56.2,y:810.9},{id:"A2-16",x:56.2,y:801.4},{id:"A2-17",x:56.2,y:792},{id:"A2-18",x:56.2,y:783},{id:"A2-19",x:56.2,y:773.6},{id:"A2-20",x:56.2,y:764.5},{id:"A2-21",x:56.2,y:755.1},{id:"A2-22",x:56.2,y:746.1},{id:"A2-23",x:56.2,y:736.6},{id:"A2-24",x:56.2,y:727.6},{id:"A2-25",x:65.8,y:828.9},{id:"A2-26",x:65.8,y:819.9},{id:"A2-27",x:65.8,y:810.9},{id:"A2-28",x:65.8,y:801.4},{id:"A2-29",x:65.8,y:792},{id:"A2-30",x:65.8,y:783},{id:"A2-31",x:65.8,y:773.6},{id:"A2-32",x:65.8,y:764.5},{id:"A2-33",x:65.8,y:755.1},{id:"A2-34",x:65.8,y:746.1},{id:"A2-35",x:65.8,y:736.6},{id:"A2-36",x:65.8,y:727.6},{id:"A2-37",x:84.4,y:828.9},{id:"A2-38",x:84.4,y:819.9},{id:"A2-39",x:84.4,y:810.9},{id:"A2-40",x:84.4,y:801.4},{id:"A2-41",x:84.4,y:792},{id:"A2-42",x:84.4,y:783},{id:"A2-43",x:84.4,y:773.6},{id:"A2-44",x:84.4,y:764.5},{id:"A2-45",x:84.4,y:755.1},{id:"A2-46",x:84.4,y:746.1},{id:"A2-47",x:84.4,y:736.6},{id:"A2-48",x:84.4,y:727.6},{id:"A2-49",x:96.2,y:828.9},{id:"A2-50",x:96.2,y:819.9},{id:"A2-51",x:96.2,y:810.9},{id:"A2-52",x:96.2,y:801.4},{id:"A2-53",x:96.2,y:792},{id:"A2-54",x:96.2,y:783},{id:"A2-55",x:96.2,y:773.6},{id:"A2-56",x:96.2,y:764.5},{id:"A2-57",x:96.2,y:755.1},{id:"A2-58",x:96.2,y:746.1},{id:"A2-59",x:96.2,y:736.6},{id:"A2-60",x:96.2,y:727.6},{id:"A2-61",x:105.8,y:828.9},{id:"A2-62",x:105.8,y:819.9},{id:"A2-63",x:105.8,y:810.9},{id:"A2-64",x:105.8,y:801.4},{id:"A2-65",x:105.8,y:792},{id:"A2-66",x:105.8,y:783},{id:"A2-67",x:105.8,y:773.6},{id:"A2-68",x:105.8,y:764.5},{id:"A2-69",x:105.8,y:755.1},{id:"A2-70",x:105.8,y:746.1},{id:"A2-71",x:105.8,y:736.6},{id:"A2-72",x:105.8,y:727.6},{id:"A2-73",x:117.6,y:828.9},{id:"A2-74",x:117.6,y:819.9},{id:"A2-75",x:117.6,y:810.9},{id:"A2-76",x:117.6,y:801.4},{id:"A2-77",x:117.6,y:792},{id:"A2-78",x:117.6,y:783},{id:"A2-79",x:117.6,y:773.6},{id:"A2-80",x:117.6,y:764.5},{id:"A2-81",x:117.6,y:755.1},{id:"A2-82",x:117.6,y:746.1},{id:"A2-83",x:117.6,y:736.6},{id:"A2-84",x:117.6,y:727.6},{id:"A2-85",x:127.2,y:810.9},{id:"A2-86",x:127.2,y:801.4},{id:"A2-87",x:127.2,y:773.6},{id:"A2-88",x:127.2,y:764.5},{id:"A2-89",x:127.2,y:736.6},{id:"A2-90",x:127.2,y:727.6},{id:"A2-91",x:127.2,y:828.9},{id:"A2-92",x:127.2,y:819.9},{id:"A2-93",x:127.2,y:792},{id:"A2-94",x:127.2,y:783},{id:"A2-95",x:127.2,y:755.1},{id:"A2-96",x:127.2,y:746.1},{id:"A2-97",x:139.1,y:810.9},{id:"A2-98",x:139.1,y:801.4},{id:"A2-99",x:139.1,y:773.6},{id:"A2-100",x:139.1,y:764.5},{id:"A2-101",x:139.1,y:736.6},{id:"A2-102",x:139.1,y:727.6},{id:"A2-103",x:139.1,y:828.9},{id:"A2-104",x:139.1,y:819.9},{id:"A2-105",x:139.1,y:792},{id:"A2-106",x:139.1,y:783},{id:"A2-107",x:139.1,y:755.1},{id:"A2-108",x:139.1,y:746.1},{id:"A2-109",x:148.1,y:828.9},{id:"A2-110",x:148.1,y:819.9},{id:"A2-111",x:148.1,y:810.9},{id:"A2-112",x:148.1,y:801.4},{id:"A2-113",x:148.1,y:792},{id:"A2-114",x:148.1,y:783},{id:"A2-115",x:148.1,y:773.6},{id:"A2-116",x:148.1,y:764.5},{id:"A2-117",x:148.1,y:755.1},{id:"A2-118",x:148.1,y:736.6},{id:"A2-119",x:148.1,y:727.6},{id:"A2-120",x:148.1,y:746.1}]},{id:"A3",name:"A3 구역",grade:"S",floor:"1F",seats:[{id:"A3-1",x:45.1,y:687.9},{id:"A3-2",x:45.1,y:678.5},{id:"A3-3",x:45.1,y:669},{id:"A3-4",x:45.1,y:660},{id:"A3-5",x:45.1,y:650.6},{id:"A3-6",x:45.1,y:641.5},{id:"A3-7",x:45.1,y:632.1},{id:"A3-8",x:45.1,y:623.1},{id:"A3-9",x:45.1,y:613.7},{id:"A3-10",x:45.1,y:604.6},{id:"A3-11",x:45.1,y:595.2},{id:"A3-12",x:45.1,y:586.2},{id:"A3-13",x:56.9,y:687.9},{id:"A3-14",x:56.9,y:678.5},{id:"A3-15",x:56.9,y:669},{id:"A3-16",x:56.9,y:660},{id:"A3-17",x:56.9,y:650.6},{id:"A3-18",x:56.9,y:641.5},{id:"A3-19",x:56.9,y:632.1},{id:"A3-20",x:56.9,y:623.1},{id:"A3-21",x:56.9,y:613.7},{id:"A3-22",x:56.9,y:604.6},{id:"A3-23",x:56.9,y:595.2},{id:"A3-24",x:56.9,y:586.2},{id:"A3-25",x:66.5,y:687.9},{id:"A3-26",x:66.5,y:678.5},{id:"A3-27",x:66.5,y:669},{id:"A3-28",x:66.5,y:660},{id:"A3-29",x:66.5,y:650.6},{id:"A3-30",x:66.5,y:641.5},{id:"A3-31",x:66.5,y:632.1},{id:"A3-32",x:66.5,y:623.1},{id:"A3-33",x:66.5,y:613.7},{id:"A3-34",x:66.5,y:604.6},{id:"A3-35",x:66.5,y:595.2},{id:"A3-36",x:66.5,y:586.2},{id:"A3-37",x:85.1,y:687.9},{id:"A3-38",x:85.1,y:678.5},{id:"A3-39",x:85.1,y:669},{id:"A3-40",x:85.1,y:660},{id:"A3-41",x:85.1,y:650.6},{id:"A3-42",x:85.1,y:641.5},{id:"A3-43",x:85.1,y:632.1},{id:"A3-44",x:85.1,y:623.1},{id:"A3-45",x:85.1,y:613.7},{id:"A3-46",x:85.1,y:604.6},{id:"A3-47",x:85.1,y:595.2},{id:"A3-48",x:85.1,y:586.2},{id:"A3-49",x:96.9,y:687.9},{id:"A3-50",x:96.9,y:678.5},{id:"A3-51",x:96.9,y:669},{id:"A3-52",x:96.9,y:660},{id:"A3-53",x:96.9,y:650.6},{id:"A3-54",x:96.9,y:641.5},{id:"A3-55",x:96.9,y:632.1},{id:"A3-56",x:96.9,y:623.1},{id:"A3-57",x:96.9,y:613.7},{id:"A3-58",x:96.9,y:604.6},{id:"A3-59",x:96.9,y:595.2},{id:"A3-60",x:96.9,y:586.2},{id:"A3-61",x:106.5,y:687.9},{id:"A3-62",x:106.5,y:678.5},{id:"A3-63",x:106.5,y:669},{id:"A3-64",x:106.5,y:660},{id:"A3-65",x:106.5,y:650.6},{id:"A3-66",x:106.5,y:641.5},{id:"A3-67",x:106.5,y:632.1},{id:"A3-68",x:106.5,y:623.1},{id:"A3-69",x:106.5,y:613.7},{id:"A3-70",x:106.5,y:604.6},{id:"A3-71",x:106.5,y:595.2},{id:"A3-72",x:106.5,y:586.2},{id:"A3-73",x:118.3,y:687.9},{id:"A3-74",x:118.3,y:678.5},{id:"A3-75",x:118.3,y:669},{id:"A3-76",x:118.3,y:660},{id:"A3-77",x:118.3,y:650.6},{id:"A3-78",x:118.3,y:641.5},{id:"A3-79",x:118.3,y:632.1},{id:"A3-80",x:118.3,y:623.1},{id:"A3-81",x:118.3,y:613.7},{id:"A3-82",x:118.3,y:604.6},{id:"A3-83",x:118.3,y:595.2},{id:"A3-84",x:118.3,y:586.2},{id:"A3-85",x:127.2,y:669},{id:"A3-86",x:127.2,y:660},{id:"A3-87",x:127.2,y:632.1},{id:"A3-88",x:127.2,y:623.1},{id:"A3-89",x:127.2,y:595.2},{id:"A3-90",x:127.2,y:586.2},{id:"A3-91",x:127.2,y:687.9},{id:"A3-92",x:127.2,y:678.5},{id:"A3-93",x:127.2,y:650.6},{id:"A3-94",x:127.2,y:641.5},{id:"A3-95",x:127.2,y:613.7},{id:"A3-96",x:127.2,y:604.6},{id:"A3-97",x:139.7,y:669},{id:"A3-98",x:139.7,y:660},{id:"A3-99",x:139.7,y:632.1},{id:"A3-100",x:139.7,y:623.1},{id:"A3-101",x:139.7,y:595.2},{id:"A3-102",x:139.7,y:586.2},{id:"A3-103",x:139.7,y:687.9},{id:"A3-104",x:139.7,y:678.5},{id:"A3-105",x:139.7,y:650.6},{id:"A3-106",x:139.7,y:641.5},{id:"A3-107",x:139.7,y:613.7},{id:"A3-108",x:139.7,y:604.6},{id:"A3-109",x:148.7,y:687.9},{id:"A3-110",x:148.7,y:678.5},{id:"A3-111",x:148.7,y:669},{id:"A3-112",x:148.7,y:660},{id:"A3-113",x:148.7,y:650.6},{id:"A3-114",x:148.7,y:641.5},{id:"A3-115",x:148.7,y:632.1},{id:"A3-116",x:148.7,y:623.1},{id:"A3-117",x:148.7,y:613.7},{id:"A3-118",x:148.7,y:604.6},{id:"A3-119",x:148.7,y:595.2},{id:"A3-120",x:148.7,y:586.2}]},{id:"A4",name:"A4 구역",grade:"S",floor:"1F",seats:[{id:"A4-1",x:54.9,y:546.8},{id:"A4-2",x:54.9,y:537.4},{id:"A4-3",x:54.9,y:528.4},{id:"A4-4",x:54.9,y:518.9},{id:"A4-5",x:54.9,y:509.9},{id:"A4-6",x:54.9,y:500.5},{id:"A4-7",x:66.8,y:491.4},{id:"A4-8",x:66.8,y:482},{id:"A4-9",x:66.8,y:473},{id:"A4-10",x:66.8,y:463.5},{id:"A4-11",x:66.8,y:454.5},{id:"A4-12",x:66.8,y:546.8},{id:"A4-13",x:66.8,y:537.4},{id:"A4-14",x:66.8,y:528.4},{id:"A4-15",x:66.8,y:518.9},{id:"A4-16",x:66.8,y:509.9},{id:"A4-17",x:66.8,y:500.5},{id:"A4-18",x:84.2,y:546.8},{id:"A4-19",x:84.2,y:537.4},{id:"A4-20",x:84.2,y:528.4},{id:"A4-21",x:84.2,y:518.9},{id:"A4-22",x:84.2,y:509.9},{id:"A4-23",x:84.2,y:500.5},{id:"A4-24",x:84.2,y:491.4},{id:"A4-25",x:84.2,y:482},{id:"A4-26",x:84.2,y:473},{id:"A4-27",x:84.2,y:463.5},{id:"A4-28",x:84.2,y:454.5},{id:"A4-29",x:84.2,y:445},{id:"A4-30",x:84.2,y:435.6},{id:"A4-31",x:84.2,y:426.5},{id:"A4-32",x:96.1,y:546.8},{id:"A4-33",x:96.1,y:537.4},{id:"A4-34",x:96.1,y:528.4},{id:"A4-35",x:96.1,y:518.9},{id:"A4-36",x:96.1,y:509.9},{id:"A4-37",x:96.1,y:500.5},{id:"A4-38",x:96.1,y:491.4},{id:"A4-39",x:96.1,y:482},{id:"A4-40",x:96.1,y:473},{id:"A4-41",x:96.1,y:463.5},{id:"A4-42",x:96.1,y:454.5},{id:"A4-43",x:96.1,y:445},{id:"A4-44",x:96.1,y:435.6},{id:"A4-45",x:96.1,y:426.5},{id:"A4-46",x:106.5,y:546.8},{id:"A4-47",x:106.5,y:537.4},{id:"A4-48",x:106.5,y:528.4},{id:"A4-49",x:106.5,y:518.9},{id:"A4-50",x:106.5,y:509.9},{id:"A4-51",x:106.5,y:500.5},{id:"A4-52",x:106.5,y:491.4},{id:"A4-53",x:106.5,y:482},{id:"A4-54",x:106.5,y:473},{id:"A4-55",x:106.5,y:463.5},{id:"A4-56",x:106.5,y:454.5},{id:"A4-57",x:106.5,y:445},{id:"A4-58",x:106.5,y:435.6},{id:"A4-59",x:106.5,y:426.5},{id:"A4-60",x:116.9,y:546.8},{id:"A4-61",x:116.9,y:537.4},{id:"A4-62",x:116.9,y:528.4},{id:"A4-63",x:116.9,y:518.9},{id:"A4-64",x:116.9,y:509.9},{id:"A4-65",x:116.9,y:500.5},{id:"A4-66",x:116.9,y:491.4},{id:"A4-67",x:116.9,y:482},{id:"A4-68",x:116.9,y:473},{id:"A4-69",x:116.9,y:463.5},{id:"A4-70",x:116.9,y:454.5},{id:"A4-71",x:116.9,y:445},{id:"A4-72",x:116.9,y:435.6},{id:"A4-73",x:116.9,y:426.5},{id:"A4-74",x:127,y:528.4},{id:"A4-75",x:127,y:518.9},{id:"A4-76",x:127,y:491.4},{id:"A4-77",x:127,y:482},{id:"A4-78",x:127,y:454.5},{id:"A4-79",x:127,y:445},{id:"A4-80",x:127,y:435.6},{id:"A4-81",x:127,y:426.5},{id:"A4-82",x:127,y:546.8},{id:"A4-83",x:127,y:537.4},{id:"A4-84",x:127,y:509.9},{id:"A4-85",x:127,y:500.5},{id:"A4-86",x:127,y:473},{id:"A4-87",x:127,y:463.5},{id:"A4-88",x:138.1,y:528.4},{id:"A4-89",x:138.1,y:518.9},{id:"A4-90",x:138.1,y:491.4},{id:"A4-91",x:138.1,y:482},{id:"A4-92",x:138.1,y:454.5},{id:"A4-93",x:138.1,y:445},{id:"A4-94",x:138.1,y:435.6},{id:"A4-95",x:138.1,y:426.5},{id:"A4-96",x:138.1,y:546.8},{id:"A4-97",x:138.1,y:537.4},{id:"A4-98",x:138.1,y:509.9},{id:"A4-99",x:138.1,y:500.5},{id:"A4-100",x:138.1,y:473},{id:"A4-101",x:138.1,y:463.5},{id:"A4-102",x:148.8,y:546.8},{id:"A4-103",x:148.8,y:537.4},{id:"A4-104",x:148.8,y:528.4},{id:"A4-105",x:148.8,y:518.9},{id:"A4-106",x:148.8,y:509.9},{id:"A4-107",x:148.8,y:500.5},{id:"A4-108",x:148.8,y:491.4},{id:"A4-109",x:148.8,y:482},{id:"A4-110",x:148.8,y:473},{id:"A4-111",x:148.8,y:463.5},{id:"A4-112",x:148.8,y:454.5},{id:"A4-113",x:148.8,y:445},{id:"A4-114",x:148.8,y:435.6},{id:"A4-115",x:148.8,y:426.5}]},{id:"B1",name:"B1 구역",grade:"R",floor:"1F",seats:[{id:"B1-1",x:188.5,y:700.4},{id:"B1-2",x:188,y:633.1},{id:"B1-3",x:190.3,y:743},{id:"B1-4",x:189.4,y:676.1},{id:"B1-5",x:191.1,y:718.7},{id:"B1-6",x:190.6,y:651.8},{id:"B1-7",x:192.8,y:626.5},{id:"B1-8",x:193.3,y:694.1},{id:"B1-9",x:194.4,y:669},{id:"B1-10",x:194.9,y:735.7},{id:"B1-11",x:195.8,y:711},{id:"B1-12",x:195.9,y:644.6},{id:"B1-13",x:198.3,y:753.9},{id:"B1-14",x:197.9,y:687.1},{id:"B1-15",x:199.2,y:729},{id:"B1-16",x:199.2,y:662.5},{id:"B1-17",x:200.8,y:638},{id:"B1-18",x:200.9,y:704.6},{id:"B1-19",x:202.3,y:680.8},{id:"B1-20",x:203.2,y:746.7},{id:"B1-21",x:203.8,y:655.9},{id:"B1-22",x:204.2,y:722.5},{id:"B1-23",x:205.4,y:698.5},{id:"B1-24",x:205.9,y:607.9},{id:"B1-25",x:206.1,y:765.7},{id:"B1-26",x:206.9,y:673.7},{id:"B1-27",x:207.5,y:740.9},{id:"B1-28",x:208.7,y:715.8},{id:"B1-29",x:209,y:648.8},{id:"B1-30",x:209.9,y:691.7},{id:"B1-31",x:210.7,y:601.2},{id:"B1-32",x:211.1,y:758},{id:"B1-33",x:211.5,y:667.3},{id:"B1-34",x:212.6,y:733.8},{id:"B1-35",x:214.3,y:777.2},{id:"B1-36",x:213.9,y:709.6},{id:"B1-37",x:214.4,y:619},{id:"B1-38",x:214.6,y:685.1},{id:"B1-39",x:215.6,y:752},{id:"B1-40",x:215.6,y:594.2},{id:"B1-41",x:216.7,y:660.2},{id:"B1-42",x:217.3,y:727.6},{id:"B1-43",x:218.2,y:702.9},{id:"B1-44",x:218.8,y:612.8},{id:"B1-45",x:219.1,y:770.7},{id:"B1-46",x:219.5,y:678.3},{id:"B1-47",x:220.3,y:587.8},{id:"B1-48",x:220.8,y:745.8},{id:"B1-49",x:221.8,y:788.2},{id:"B1-50",x:222,y:720.7},{id:"B1-51",x:222.9,y:696.4},{id:"B1-52",x:222,y:630.3},{id:"B1-53",x:223.8,y:763.4},{id:"B1-54",x:224.2,y:671.7},{id:"B1-55",x:223.7,y:605.9},{id:"B1-56",x:224.9,y:581.6},{id:"B1-57",x:225.1,y:739.3},{id:"B1-58",x:226.2,y:714.9},{id:"B1-59",x:227.1,y:623.4},{id:"B1-60",x:226.7,y:780.8},{id:"B1-61",x:227.4,y:690.3},{id:"B1-62",x:228.5,y:599.2},{id:"B1-63",x:228.4,y:756.7},{id:"B1-64",x:229.7,y:799.4},{id:"B1-65",x:229.6,y:732.4},{id:"B1-66",x:230.3,y:642},{id:"B1-67",x:229.8,y:575.2},{id:"B1-68",x:231.3,y:708.1},{id:"B1-69",x:231.6,y:616.9},{id:"B1-70",x:231.8,y:774.8},{id:"B1-71",x:232.7,y:683},{id:"B1-72",x:233.2,y:592.9},{id:"B1-73",x:232.9,y:750.3},{id:"B1-74",x:234,y:568.4},{id:"B1-75",x:234.2,y:792.5},{id:"B1-76",x:234.3,y:725.7},{id:"B1-77",x:234.7,y:635},{id:"B1-78",x:235.7,y:767.2},{id:"B1-79",x:235.7,y:700.8},{id:"B1-80",x:236.3,y:609.8},{id:"B1-81",x:237.9,y:810.6},{id:"B1-82",x:237.6,y:653},{id:"B1-83",x:237.5,y:585.7},{id:"B1-84",x:237.9,y:743.6},{id:"B1-85",x:238.5,y:561.6},{id:"B1-86",x:239.4,y:786.2},{id:"B1-87",x:239.1,y:718.7},{id:"B1-88",x:240.6,y:693.8},{id:"B1-89",x:239.7,y:628.6},{id:"B1-90",x:240.4,y:760.6},{id:"B1-91",x:240.5,y:603.2},{id:"B1-92",x:242.5,y:737.2},{id:"B1-93",x:242.6,y:804.5},{id:"B1-94",x:242.8,y:646.2},{id:"B1-95",x:242.3,y:579.4},{id:"B1-96",x:243.6,y:554.9},{id:"B1-97",x:243.7,y:712},{id:"B1-98",x:244.1,y:779.2},{id:"B1-99",x:244.4,y:622},{id:"B1-100",x:245.4,y:753.8},{id:"B1-101",x:245.7,y:664.5},{id:"B1-102",x:245.7,y:597.5},{id:"B1-103",x:246.6,y:573.5},{id:"B1-104",x:247,y:730.5},{id:"B1-105",x:246.9,y:640.1},{id:"B1-106",x:247.5,y:797.5},{id:"B1-107",x:248.6,y:705.5},{id:"B1-108",x:247.9,y:548.6},{id:"B1-109",x:248.8,y:773.1},{id:"B1-110",x:249.1,y:615.2},{id:"B1-111",x:249.7,y:748},{id:"B1-112",x:250.4,y:657.9},{id:"B1-113",x:250.2,y:590.9},{id:"B1-114",x:252.1,y:791.4},{id:"B1-115",x:251.9,y:633.3},{id:"B1-116",x:251.9,y:723.7},{id:"B1-117",x:251.8,y:566.6},{id:"B1-118",x:252.8,y:541.3},{id:"B1-119",x:253.8,y:608.9},{id:"B1-120",x:253.4,y:765.7},{id:"B1-121",x:254.6,y:584.5},{id:"B1-122",x:254.5,y:740.7},{id:"B1-123",x:253.9,y:676.6},{id:"B1-124",x:255.2,y:651.4},{id:"B1-125",x:256.2,y:560.2},{id:"B1-126",x:256.5,y:784.4},{id:"B1-127",x:256.8,y:717.1},{id:"B1-128",x:256.7,y:626.5},{id:"B1-129",x:257.4,y:535.2},{id:"B1-130",x:258,y:759.4},{id:"B1-131",x:258.8,y:669.1},{id:"B1-132",x:258.5,y:602.1},{id:"B1-133",x:259.3,y:577.2},{id:"B1-134",x:259.8,y:644.8},{id:"B1-135",x:259.3,y:734.2},{id:"B1-136",x:261.1,y:777.1},{id:"B1-137",x:261.7,y:688},{id:"B1-138",x:261.1,y:619.7},{id:"B1-139",x:260.9,y:553.2},{id:"B1-140",x:262.6,y:527.8},{id:"B1-141",x:262.8,y:752.8},{id:"B1-142",x:263.7,y:662.6},{id:"B1-143",x:263.3,y:595.3},{id:"B1-144",x:263.7,y:570.5},{id:"B1-145",x:264.4,y:637.7},{id:"B1-146",x:264.6,y:727.4},{id:"B1-147",x:265.6,y:612.8},{id:"B1-148",x:266,y:545.4},{id:"B1-149",x:266,y:770.3},{id:"B1-150",x:267.3,y:745.6},{id:"B1-151",x:266.6,y:681.7},{id:"B1-152",x:268,y:655.7},{id:"B1-153",x:268.3,y:588.3},{id:"B1-154",x:268.2,y:563.7},{id:"B1-155",x:269.4,y:631.5},{id:"B1-156",x:270.9,y:763.9}]},{id:"B2",name:"B2 구역",grade:"R",floor:"1F",seats:[{id:"B2-1",x:185.8,y:567.9},{id:"B2-2",x:186.7,y:502.4},{id:"B2-3",x:187.2,y:477.2},{id:"B2-4",x:188.3,y:543.9},{id:"B2-5",x:188.7,y:452.4},{id:"B2-6",x:190,y:586.3},{id:"B2-7",x:189.6,y:519.7},{id:"B2-8",x:190.4,y:561.5},{id:"B2-9",x:190.9,y:427.7},{id:"B2-10",x:191.2,y:496.4},{id:"B2-11",x:191.8,y:470.7},{id:"B2-12",x:193,y:537.4},{id:"B2-13",x:193.5,y:445.5},{id:"B2-14",x:194.1,y:513.2},{id:"B2-15",x:194.8,y:579.5},{id:"B2-16",x:195.7,y:554.1},{id:"B2-17",x:195.9,y:397.7},{id:"B2-18",x:196.1,y:489.2},{id:"B2-19",x:196.4,y:463.7},{id:"B2-20",x:197.2,y:530.8},{id:"B2-21",x:197.9,y:438.6},{id:"B2-22",x:198.8,y:506.1},{id:"B2-23",x:199.6,y:572.5},{id:"B2-24",x:200.3,y:547.4},{id:"B2-25",x:200.5,y:482.8},{id:"B2-26",x:201.6,y:457},{id:"B2-27",x:201,y:390.3},{id:"B2-28",x:202.2,y:523.8},{id:"B2-29",x:203.8,y:499.9},{id:"B2-30",x:204.4,y:565.8},{id:"B2-31",x:204.1,y:408.7},{id:"B2-32",x:205.2,y:540.7},{id:"B2-33",x:205.4,y:475.8},{id:"B2-34",x:205.7,y:383.6},{id:"B2-35",x:206.5,y:450.3},{id:"B2-36",x:207,y:517.2},{id:"B2-37",x:208.1,y:493.6},{id:"B2-38",x:208.9,y:402.1},{id:"B2-39",x:209.1,y:559.4},{id:"B2-40",x:209.9,y:533.7},{id:"B2-41",x:210,y:469.2},{id:"B2-42",x:210.7,y:377.3},{id:"B2-43",x:267.6,y:431.3},{id:"B2-44",x:211.6,y:510.8},{id:"B2-45",x:212,y:420.1},{id:"B2-46",x:213,y:487},{id:"B2-47",x:213.5,y:395.2},{id:"B2-48",x:214,y:552.4},{id:"B2-49",x:214.3,y:527.6},{id:"B2-50",x:215,y:462},{id:"B2-51",x:215.4,y:370.4},{id:"B2-52",x:216.4,y:504.4},{id:"B2-53",x:217.1,y:413.5},{id:"B2-54",x:217.9,y:479.9},{id:"B2-55",x:218.2,y:388.6},{id:"B2-56",x:218.9,y:545.4},{id:"B2-57",x:219.3,y:521},{id:"B2-58",x:220.1,y:431.2},{id:"B2-59",x:220,y:364},{id:"B2-60",x:221,y:497.5},{id:"B2-61",x:222,y:406.1},{id:"B2-62",x:222.8,y:382},{id:"B2-63",x:222.8,y:473},{id:"B2-64",x:223.4,y:538.8},{id:"B2-65",x:223.8,y:514.5},{id:"B2-66",x:225,y:424.4},{id:"B2-67",x:224.5,y:357.9},{id:"B2-68",x:225.9,y:490.8},{id:"B2-69",x:226.2,y:400.2},{id:"B2-70",x:227.2,y:375.3},{id:"B2-71",x:227.9,y:532.7},{id:"B2-72",x:228.5,y:507.3},{id:"B2-73",x:228.6,y:442.8},{id:"B2-74",x:228.7,y:351.7},{id:"B2-75",x:230.4,y:483.7},{id:"B2-76",x:229.9,y:417.5},{id:"B2-77",x:231.1,y:393.4},{id:"B2-78",x:232.1,y:368.9},{id:"B2-79",x:232.8,y:526},{id:"B2-80",x:233.2,y:501.2},{id:"B2-81",x:233.5,y:436.3},{id:"B2-82",x:233.7,y:345},{id:"B2-83",x:234.3,y:411.1},{id:"B2-84",x:235.8,y:453.5},{id:"B2-85",x:235.7,y:387},{id:"B2-86",x:236.7,y:362.6},{id:"B2-87",x:237.6,y:519.8},{id:"B2-88",x:238.1,y:494.4},{id:"B2-89",x:237.9,y:429.4},{id:"B2-90",x:238.4,y:337.8},{id:"B2-91",x:238.7,y:404.5},{id:"B2-92",x:241,y:446.7},{id:"B2-93",x:240.5,y:380.3},{id:"B2-94",x:242.2,y:512.9},{id:"B2-95",x:242.3,y:423.2},{id:"B2-96",x:241.7,y:355.7},{id:"B2-97",x:243.8,y:465.2},{id:"B2-98",x:243.6,y:397.9},{id:"B2-99",x:245.5,y:440.4},{id:"B2-100",x:244.8,y:373.7},{id:"B2-101",x:246.4,y:348.8},{id:"B2-102",x:246.8,y:506.1},{id:"B2-103",x:247.3,y:416.1},{id:"B2-104",x:248.5,y:458.4},{id:"B2-105",x:248.5,y:390.9},{id:"B2-106",x:249.7,y:366.6},{id:"B2-107",x:250.1,y:433.4},{id:"B2-108",x:252,y:476.4},{id:"B2-109",x:252,y:409.3},{id:"B2-110",x:253.5,y:451.1},{id:"B2-111",x:252.8,y:384.7},{id:"B2-112",x:254.7,y:359.9},{id:"B2-113",x:255,y:426.5},{id:"B2-114",x:256.9,y:470.2},{id:"B2-115",x:256.6,y:402.7},{id:"B2-116",x:258.1,y:444.9},{id:"B2-117",x:257.5,y:377.4},{id:"B2-118",x:259.5,y:420},{id:"B2-119",x:260.1,y:488.7},{id:"B2-120",x:261.5,y:396},{id:"B2-121",x:261.5,y:463.1},{id:"B2-122",x:262.5,y:370.2},{id:"B2-123",x:262.9,y:438},{id:"B2-124",x:264.1,y:413.1},{id:"B2-125",x:265.1,y:481.9},{id:"B2-126",x:266.7,y:456},{id:"B2-127",x:266.7,y:388.8}]},{id:"D1",name:"D1 구역",grade:"R",floor:"1F",seats:[{id:"D1-1",x:728.6,y:764.9},{id:"D1-2",x:730.7,y:630.9},{id:"D1-3",x:731.8,y:655.5},{id:"D1-4",x:731.6,y:588.5},{id:"D1-5",x:732,y:747.3},{id:"D1-6",x:733.4,y:680.8},{id:"D1-7",x:733.5,y:772.2},{id:"D1-8",x:738.6,y:619.3},{id:"D1-9",x:733.5,y:546.3},{id:"D1-10",x:735.4,y:637.8},{id:"D1-11",x:736.4,y:595.2},{id:"D1-12",x:736.7,y:754.2},{id:"D1-13",x:736.9,y:662.5},{id:"D1-14",x:737,y:528.2},{id:"D1-15",x:738.1,y:687.7},{id:"D1-16",x:738.4,y:552.9},{id:"D1-17",x:737.6,y:778.4},{id:"D1-18",x:740.4,y:576.9},{id:"D1-19",x:741.7,y:669.2},{id:"D1-20",x:745.7,y:608.2},{id:"D1-21",x:741.6,y:760.8},{id:"D1-22",x:742.1,y:535},{id:"D1-23",x:742.5,y:718.4},{id:"D1-24",x:743.2,y:559.6},{id:"D1-25",x:744.4,y:741.7},{id:"D1-26",x:745.2,y:583.7},{id:"D1-27",x:746.4,y:767.5},{id:"D1-28",x:746.4,y:676.1},{id:"D1-29",x:747.3,y:725.1},{id:"D1-30",x:748.1,y:632.4},{id:"D1-31",x:748,y:566.2},{id:"D1-32",x:749.1,y:748.6},{id:"D1-33",x:749.8,y:657.9},{id:"D1-34",x:749.9,y:590.4},{id:"D1-35",x:750.2,y:706.1},{id:"D1-36",x:755.8,y:780.8},{id:"D1-37",x:752.1,y:731.7},{id:"D1-38",x:753,y:639.1},{id:"D1-39",x:752.7,y:572.8},{id:"D1-40",x:754,y:755.3},{id:"D1-41",x:754.5,y:664.6},{id:"D1-42",x:754.6,y:596.9},{id:"D1-43",x:755,y:712.7},{id:"D1-44",x:755.3,y:621.7},{id:"D1-45",x:756.1,y:554.8},{id:"D1-46",x:757.7,y:646},{id:"D1-47",x:757.4,y:579.6},{id:"D1-48",x:759.2,y:603.6},{id:"D1-49",x:760.1,y:628.3},{id:"D1-50",x:759.8,y:719.4},{id:"D1-51",x:760.9,y:561.5},{id:"D1-52",x:762.5,y:652.6},{id:"D1-53",x:762,y:586},{id:"D1-54",x:764,y:610.1},{id:"D1-55",x:764.5,y:726.2},{id:"D1-56",x:764.9,y:635},{id:"D1-57",x:765.3,y:793.9},{id:"D1-58",x:766,y:751.7},{id:"D1-59",x:765.7,y:568.2},{id:"D1-60",x:766.8,y:592.7},{id:"D1-61",x:766.6,y:683.8},{id:"D1-62",x:768.1,y:774.9},{id:"D1-63",x:767.8,y:708.1},{id:"D1-64",x:768.9,y:616.7},{id:"D1-65",x:769.2,y:732.7},{id:"D1-66",x:769.6,y:641.8},{id:"D1-67",x:770.2,y:800.8},{id:"D1-68",x:770.6,y:574.8},{id:"D1-69",x:771.7,y:599.4},{id:"D1-70",x:772.9,y:781.6},{id:"D1-71",x:772.5,y:714.8},{id:"D1-72",x:773.6,y:623.5},{id:"D1-73",x:774,y:739.3},{id:"D1-74",x:774.5,y:672.5},{id:"D1-75",x:776.3,y:605.8},{id:"D1-76",x:777.9,y:788.5},{id:"D1-77",x:777.3,y:721.5},{id:"D1-78",x:778.4,y:630.2},{id:"D1-79",x:778.6,y:745.8},{id:"D1-80",x:779.2,y:679.4},{id:"D1-81",x:780.5,y:771.7},{id:"D1-82",x:780.9,y:703.6},{id:"D1-83",x:781.3,y:612.7},{id:"D1-84",x:781.8,y:661.5},{id:"D1-85",x:783.5,y:752.5},{id:"D1-86",x:784,y:686.1},{id:"D1-87",x:784.6,y:594.6},{id:"D1-88",x:785.3,y:778.4},{id:"D1-89",x:785.5,y:710},{id:"D1-90",x:786,y:619.5},{id:"D1-91",x:791.3,y:674.9},{id:"D1-92",x:788.2,y:759.3},{id:"D1-93",x:788.8,y:692.7},{id:"D1-94",x:789.4,y:601.3},{id:"D1-95",x:790.2,y:716.9},{id:"D1-96",x:790.3,y:650.3},{id:"D1-97",x:791.5,y:741.2},{id:"D1-98",x:793,y:766},{id:"D1-99",x:793.5,y:699.2},{id:"D1-100",x:794.4,y:608.2},{id:"D1-101",x:795,y:723.5},{id:"D1-102",x:795.2,y:657},{id:"D1-103",x:796.2,y:748.1},{id:"D1-104",x:798.2,y:705.6},{id:"D1-105",x:798.3,y:639},{id:"D1-106",x:799.7,y:730},{id:"D1-107",x:799.8,y:663.4},{id:"D1-108",x:800.6,y:688},{id:"D1-109",x:801.2,y:755.1},{id:"D1-110",x:803.1,y:712.5},{id:"D1-111",x:803.3,y:646},{id:"D1-112",x:804.7,y:737},{id:"D1-113",x:804.8,y:670.3},{id:"D1-114",x:805.5,y:694.6},{id:"D1-115",x:806.1,y:628},{id:"D1-116",x:808,y:719.6},{id:"D1-117",x:808.2,y:652.8},{id:"D1-118",x:809.3,y:743.7},{id:"D1-119",x:809.6,y:677},{id:"D1-120",x:810.4,y:701.5},{id:"D1-121",x:810.8,y:634.9},{id:"D1-122",x:742,y:785.4},{id:"D1-123",x:747.2,y:791.2},{id:"D1-124",x:751.4,y:799},{id:"D1-125",x:760.7,y:787.6},{id:"D1-126",x:751.4,y:774.8},{id:"D1-127",x:762.9,y:768.4},{id:"D1-128",x:758.2,y:762},{id:"D1-129",x:739.7,y:734.8},{id:"D1-130",x:735.1,y:728.4},{id:"D1-131",x:757,y:739.6},{id:"D1-132",x:761.6,y:745.9},{id:"D1-133",x:770.9,y:758.7},{id:"D1-134",x:775.5,y:765.1},{id:"D1-135",x:786.8,y:734.6},{id:"D1-136",x:782.2,y:728.3},{id:"D1-137",x:762.6,y:702.7},{id:"D1-138",x:757.9,y:694.7},{id:"D1-139",x:771.7,y:691.4},{id:"D1-140",x:776.3,y:697.8},{id:"D1-141",x:795.8,y:681.7},{id:"D1-142",x:786.5,y:668.9},{id:"D1-143",x:744.9,y:651.2},{id:"D1-144",x:740.3,y:644.8},{id:"D1-145",x:743.7,y:627.1},{id:"D1-146",x:734.4,y:612.7},{id:"D1-147",x:741.3,y:601.5},{id:"D1-148",x:750.5,y:615.9},{id:"D1-149",x:735.4,y:569.5},{id:"D1-150",x:730.7,y:564.7},{id:"D1-151",x:751.4,y:548.6},{id:"D1-152",x:746.7,y:542.2},{id:"D1-153",x:775.7,y:582.1},{id:"D1-154",x:779.1,y:588.5},{id:"D1-155",x:756.7,y:806},{id:"D1-156",x:761.6,y:813.2}]},{id:"D2",name:"D2 구역",grade:"R",floor:"1F",seats:[{id:"D2-1",x:732,y:432.2},{id:"D2-2",x:733.1,y:456.7},{id:"D2-3",x:733,y:389.7},{id:"D2-4",x:734.7,y:482},{id:"D2-5",x:736.7,y:439},{id:"D2-6",x:737,y:371.5},{id:"D2-7",x:737.8,y:396.3},{id:"D2-8",x:738.2,y:463.6},{id:"D2-9",x:739.5,y:488.9},{id:"D2-10",x:741.8,y:378.1},{id:"D2-11",x:743,y:470.4},{id:"D2-12",x:744.6,y:427.1},{id:"D2-13",x:744.5,y:360.9},{id:"D2-14",x:746.4,y:384.8},{id:"D2-15",x:747.7,y:477.3},{id:"D2-16",x:749.4,y:433.7},{id:"D2-17",x:749.2,y:367.3},{id:"D2-18",x:751.1,y:459.1},{id:"D2-19",x:752.1,y:505.1},{id:"D2-20",x:751.8,y:416.2},{id:"D2-21",x:753.4,y:346.1},{id:"D2-22",x:754.1,y:440.2},{id:"D2-23",x:753.9,y:373.8},{id:"D2-24",x:755.9,y:465.9},{id:"D2-25",x:757,y:512},{id:"D2-26",x:756.6,y:422.9},{id:"D2-27",x:758.4,y:353.5},{id:"D2-28",x:759,y:447.2},{id:"D2-29",x:758.6,y:380.7},{id:"D2-30",x:760.5,y:404.7},{id:"D2-31",x:761.5,y:337.1},{id:"D2-32",x:761.6,y:494.5},{id:"D2-33",x:761.4,y:429.3},{id:"D2-34",x:763.3,y:360},{id:"D2-35",x:763.8,y:453.9},{id:"D2-36",x:763.4,y:387.3},{id:"D2-37",x:765.3,y:411.4},{id:"D2-38",x:766.2,y:343.1},{id:"D2-39",x:766.2,y:436.3},{id:"D2-40",x:768.5,y:482.9},{id:"D2-41",x:768.2,y:394},{id:"D2-42",x:770,y:417.8},{id:"D2-43",x:771,y:349.7},{id:"D2-44",x:771.4,y:531.8},{id:"D2-45",x:771,y:443},{id:"D2-46",x:773.3,y:489.6},{id:"D2-47",x:775,y:424.8},{id:"D2-48",x:775.7,y:356.6},{id:"D2-49",x:776.2,y:538.5},{id:"D2-50",x:775.9,y:514.3},{id:"D2-51",x:776.9,y:472.7},{id:"D2-52",x:776.3,y:380.1},{id:"D2-53",x:777.8,y:496.2},{id:"D2-54",x:780.5,y:363.2},{id:"D2-55",x:779.8,y:431.4},{id:"D2-56",x:780.9,y:545.2},{id:"D2-57",x:780.7,y:521},{id:"D2-58",x:781.3,y:386.6},{id:"D2-59",x:781.6,y:479.6},{id:"D2-60",x:782.5,y:413.8},{id:"D2-61",x:784.6,y:462.2},{id:"D2-62",x:785.6,y:551.6},{id:"D2-63",x:785.4,y:527.8},{id:"D2-64",x:786.4,y:486.2},{id:"D2-65",x:785.8,y:394},{id:"D2-66",x:787.3,y:420.8},{id:"D2-67",x:789.2,y:468.7},{id:"D2-68",x:790.3,y:558.5},{id:"D2-69",x:790.1,y:534.3},{id:"D2-70",x:790.3,y:401.4},{id:"D2-71",x:792,y:516.1},{id:"D2-72",x:793,y:450},{id:"D2-73",x:793.9,y:475.6},{id:"D2-74",x:794.7,y:382.9},{id:"D2-75",x:794.8,y:540.9},{id:"D2-76",x:795,y:564.9},{id:"D2-77",x:795.5,y:409.2},{id:"D2-78",x:796.8,y:522.8},{id:"D2-79",x:797.8,y:456.7},{id:"D2-80",x:799.4,y:389.5},{id:"D2-81",x:799.9,y:571.6},{id:"D2-82",x:799.6,y:547.4},{id:"D2-83",x:800.5,y:505.8},{id:"D2-84",x:800.9,y:438.8},{id:"D2-85",x:801.5,y:529.3},{id:"D2-86",x:802.5,y:463.2},{id:"D2-87",x:804.4,y:554.1},{id:"D2-88",x:804.4,y:396.6},{id:"D2-89",x:804.6,y:578.4},{id:"D2-90",x:805.3,y:512.5},{id:"D2-91",x:806.5,y:536.2},{id:"D2-92",x:805.9,y:445.7},{id:"D2-93",x:807.4,y:470},{id:"D2-94",x:808.4,y:495.4},{id:"D2-95",x:809.4,y:585.1},{id:"D2-96",x:809.1,y:560.8},{id:"D2-97",x:808.6,y:428},{id:"D2-98",x:810.2,y:519.4},{id:"D2-99",x:810.7,y:452.7},{id:"D2-100",x:811.3,y:542.9},{id:"D2-101",x:812.1,y:476.9},{id:"D2-102",x:813.2,y:502.2},{id:"D2-103",x:813.9,y:567.6},{id:"D2-104",x:766.2,y:524.5},{id:"D2-105",x:762.7,y:518.1},{id:"D2-106",x:770.7,y:508.4},{id:"D2-107",x:766.1,y:502},{id:"D2-108",x:786.8,y:508.4},{id:"D2-109",x:783.3,y:502},{id:"D2-110",x:796,y:500.4},{id:"D2-111",x:791.3,y:492.4},{id:"D2-112",x:802.8,y:489.1},{id:"D2-113",x:799.3,y:482.7},{id:"D2-114",x:746.3,y:452.4},{id:"D2-115",x:741.7,y:446},{id:"D2-116",x:740.4,y:420.4},{id:"D2-117",x:735.8,y:414},{id:"D2-118",x:747.3,y:409.2},{id:"D2-119",x:742.6,y:402.8},{id:"D2-120",x:756.4,y:397.9},{id:"D2-121",x:751.8,y:391.5},{id:"D2-122",x:777.2,y:407.5},{id:"D2-123",x:772.5,y:401.1},{id:"D2-124",x:771.9,y:373.9},{id:"D2-125",x:767.8,y:367.2},{id:"D2-126",x:789.7,y:377},{id:"D2-127",x:785.1,y:370.6}]},{id:"E1",name:"E1 구역",grade:"S",floor:"1F",seats:[{id:"E1-1",x:851.6,y:950},{id:"E1-2",x:851.6,y:940.6},{id:"E1-3",x:851.6,y:931.5},{id:"E1-4",x:851.6,y:922.1},{id:"E1-5",x:851.6,y:913.1},{id:"E1-6",x:851.6,y:903.6},{id:"E1-7",x:851.6,y:894.2},{id:"E1-8",x:851.6,y:885.2},{id:"E1-9",x:851.6,y:876.2},{id:"E1-10",x:851.6,y:866.7},{id:"E1-11",x:861.3,y:866.7},{id:"E1-12",x:861.3,y:950},{id:"E1-13",x:861.3,y:940.6},{id:"E1-14",x:861.3,y:931.5},{id:"E1-15",x:861.3,y:922.1},{id:"E1-16",x:861.3,y:913.1},{id:"E1-17",x:861.3,y:903.6},{id:"E1-18",x:861.3,y:894.2},{id:"E1-19",x:861.3,y:885.2},{id:"E1-20",x:861.3,y:876.2},{id:"E1-21",x:872.4,y:950},{id:"E1-22",x:872.4,y:940.6},{id:"E1-23",x:872.4,y:931.5},{id:"E1-24",x:872.4,y:922.1},{id:"E1-25",x:872.4,y:913.1},{id:"E1-26",x:872.4,y:903.6},{id:"E1-27",x:872.4,y:894.2},{id:"E1-28",x:872.4,y:885.2},{id:"E1-29",x:872.4,y:876.2},{id:"E1-30",x:872.4,y:866.7},{id:"E1-31",x:882.7,y:866.7},{id:"E1-32",x:882.7,y:950},{id:"E1-33",x:882.7,y:940.6},{id:"E1-34",x:882.7,y:931.5},{id:"E1-35",x:882.7,y:922.1},{id:"E1-36",x:882.7,y:913.1},{id:"E1-37",x:882.7,y:903.6},{id:"E1-38",x:882.7,y:894.2},{id:"E1-39",x:882.7,y:885.2},{id:"E1-40",x:882.7,y:876.2},{id:"E1-41",x:893.8,y:950},{id:"E1-42",x:893.8,y:940.6},{id:"E1-43",x:893.8,y:931.5},{id:"E1-44",x:893.8,y:922.1},{id:"E1-45",x:893.8,y:913.1},{id:"E1-46",x:893.8,y:903.6},{id:"E1-47",x:893.8,y:894.2},{id:"E1-48",x:893.8,y:885.2},{id:"E1-49",x:893.8,y:876.2},{id:"E1-50",x:893.8,y:866.7},{id:"E1-51",x:904.2,y:866.7},{id:"E1-52",x:904.2,y:950},{id:"E1-53",x:904.2,y:940.6},{id:"E1-54",x:904.2,y:931.5},{id:"E1-55",x:904.2,y:922.1},{id:"E1-56",x:904.2,y:913.1},{id:"E1-57",x:904.2,y:903.6},{id:"E1-58",x:904.2,y:894.2},{id:"E1-59",x:904.2,y:885.2},{id:"E1-60",x:904.2,y:876.2},{id:"E1-61",x:915.2,y:950},{id:"E1-62",x:915.2,y:940.6},{id:"E1-63",x:915.2,y:931.5},{id:"E1-64",x:915.2,y:922.1},{id:"E1-65",x:915.2,y:913.1},{id:"E1-66",x:915.2,y:903.6},{id:"E1-67",x:915.2,y:894.2},{id:"E1-68",x:915.2,y:885.2},{id:"E1-69",x:915.2,y:876.2},{id:"E1-70",x:915.2,y:866.7},{id:"E1-71",x:933.8,y:950},{id:"E1-72",x:933.8,y:940.6},{id:"E1-73",x:933.8,y:931.5},{id:"E1-74",x:933.8,y:922.1},{id:"E1-75",x:933.8,y:913.1},{id:"E1-76",x:933.8,y:903.6},{id:"E1-77",x:933.8,y:894.2},{id:"E1-78",x:933.8,y:885.2},{id:"E1-79",x:933.8,y:876.2},{id:"E1-80",x:933.8,y:866.7},{id:"E1-81",x:944.4,y:913.1},{id:"E1-82",x:944.4,y:903.6},{id:"E1-83",x:944.4,y:894.2},{id:"E1-84",x:944.4,y:885.2},{id:"E1-85",x:944.4,y:876.2},{id:"E1-86",x:944.4,y:866.7}]},{id:"E2",name:"E2 구역",grade:"S",floor:"1F",seats:[{id:"E2-1",x:851,y:827.8},{id:"E2-2",x:851,y:818.8},{id:"E2-3",x:851,y:809.4},{id:"E2-4",x:851,y:800},{id:"E2-5",x:851,y:790.9},{id:"E2-6",x:851,y:781.9},{id:"E2-7",x:851,y:772.5},{id:"E2-8",x:851,y:763},{id:"E2-9",x:851,y:754},{id:"E2-10",x:851,y:744.6},{id:"E2-11",x:851,y:735.5},{id:"E2-12",x:851,y:726.1},{id:"E2-13",x:862.8,y:744.6},{id:"E2-14",x:862.8,y:735.5},{id:"E2-15",x:862.8,y:726.1},{id:"E2-16",x:862.8,y:827.8},{id:"E2-17",x:862.8,y:818.8},{id:"E2-18",x:862.8,y:809.4},{id:"E2-19",x:862.8,y:800},{id:"E2-20",x:862.8,y:790.9},{id:"E2-21",x:862.8,y:781.9},{id:"E2-22",x:862.8,y:772.5},{id:"E2-23",x:862.8,y:763},{id:"E2-24",x:862.8,y:754},{id:"E2-25",x:871.9,y:827.8},{id:"E2-26",x:871.9,y:818.8},{id:"E2-27",x:871.9,y:790.9},{id:"E2-28",x:871.9,y:781.9},{id:"E2-29",x:871.9,y:754},{id:"E2-30",x:871.9,y:809.4},{id:"E2-31",x:871.9,y:800},{id:"E2-32",x:871.9,y:772.5},{id:"E2-33",x:871.9,y:763},{id:"E2-34",x:871.9,y:744.6},{id:"E2-35",x:871.9,y:735.5},{id:"E2-36",x:871.9,y:726.1},{id:"E2-37",x:883.7,y:744.6},{id:"E2-38",x:883.7,y:735.5},{id:"E2-39",x:883.7,y:726.1},{id:"E2-40",x:883.7,y:827.8},{id:"E2-41",x:883.7,y:818.8},{id:"E2-42",x:883.7,y:790.9},{id:"E2-43",x:883.7,y:781.9},{id:"E2-44",x:883.7,y:754},{id:"E2-45",x:883.7,y:809.4},{id:"E2-46",x:883.7,y:800},{id:"E2-47",x:883.7,y:772.5},{id:"E2-48",x:883.7,y:763},{id:"E2-49",x:893.3,y:827.8},{id:"E2-50",x:893.3,y:818.8},{id:"E2-51",x:893.3,y:809.4},{id:"E2-52",x:893.3,y:800},{id:"E2-53",x:893.3,y:790.9},{id:"E2-54",x:893.3,y:781.9},{id:"E2-55",x:893.3,y:772.5},{id:"E2-56",x:893.3,y:763},{id:"E2-57",x:893.3,y:754},{id:"E2-58",x:893.3,y:744.6},{id:"E2-59",x:893.3,y:735.5},{id:"E2-60",x:893.3,y:726.1},{id:"E2-61",x:905.1,y:744.6},{id:"E2-62",x:905.1,y:735.5},{id:"E2-63",x:905.1,y:726.1},{id:"E2-64",x:905.1,y:827.8},{id:"E2-65",x:905.1,y:818.8},{id:"E2-66",x:905.1,y:809.4},{id:"E2-67",x:905.1,y:800},{id:"E2-68",x:905.1,y:790.9},{id:"E2-69",x:905.1,y:781.9},{id:"E2-70",x:905.1,y:772.5},{id:"E2-71",x:905.1,y:763},{id:"E2-72",x:905.1,y:754},{id:"E2-73",x:914.7,y:827.8},{id:"E2-74",x:914.7,y:818.8},{id:"E2-75",x:914.7,y:809.4},{id:"E2-76",x:914.7,y:800},{id:"E2-77",x:914.7,y:790.9},{id:"E2-78",x:914.7,y:781.9},{id:"E2-79",x:914.7,y:772.5},{id:"E2-80",x:914.7,y:763},{id:"E2-81",x:914.7,y:754},{id:"E2-82",x:914.7,y:744.6},{id:"E2-83",x:914.7,y:735.5},{id:"E2-84",x:914.7,y:726.1},{id:"E2-85",x:933.3,y:827.8},{id:"E2-86",x:933.3,y:818.8},{id:"E2-87",x:933.3,y:809.4},{id:"E2-88",x:933.3,y:800},{id:"E2-89",x:933.3,y:790.9},{id:"E2-90",x:933.3,y:781.9},{id:"E2-91",x:933.3,y:772.5},{id:"E2-92",x:933.3,y:763},{id:"E2-93",x:933.3,y:754},{id:"E2-94",x:933.3,y:744.6},{id:"E2-95",x:933.3,y:735.5},{id:"E2-96",x:933.3,y:726.1},{id:"E2-97",x:945.1,y:827.8},{id:"E2-98",x:945.1,y:818.8},{id:"E2-99",x:945.1,y:809.4},{id:"E2-100",x:945.1,y:800},{id:"E2-101",x:945.1,y:790.9},{id:"E2-102",x:945.1,y:781.9},{id:"E2-103",x:945.1,y:772.5},{id:"E2-104",x:945.1,y:763},{id:"E2-105",x:945.1,y:754},{id:"E2-106",x:945.1,y:744.6},{id:"E2-107",x:945.1,y:735.5},{id:"E2-108",x:945.1,y:726.1},{id:"E2-109",x:954.7,y:827.8},{id:"E2-110",x:954.7,y:818.8},{id:"E2-111",x:954.7,y:809.4},{id:"E2-112",x:954.7,y:800},{id:"E2-113",x:954.7,y:790.9},{id:"E2-114",x:954.7,y:781.9},{id:"E2-115",x:954.7,y:772.5},{id:"E2-116",x:954.7,y:763},{id:"E2-117",x:954.7,y:754},{id:"E2-118",x:954.7,y:744.6},{id:"E2-119",x:954.7,y:735.5},{id:"E2-120",x:954.7,y:726.1}]},{id:"E3",name:"E3 구역",grade:"S",floor:"1F",seats:[{id:"E3-1",x:849.8,y:688.8},{id:"E3-2",x:849.8,y:679.4},{id:"E3-3",x:849.8,y:651.5},{id:"E3-4",x:849.8,y:642.4},{id:"E3-5",x:849.8,y:614.2},{id:"E3-6",x:849.8,y:605.5},{id:"E3-7",x:849.8,y:669.9},{id:"E3-8",x:849.8,y:660.5},{id:"E3-9",x:849.8,y:633},{id:"E3-10",x:849.8,y:623.6},{id:"E3-11",x:849.8,y:596.1},{id:"E3-12",x:849.8,y:586.7},{id:"E3-13",x:861.9,y:688.8},{id:"E3-14",x:861.9,y:679.4},{id:"E3-15",x:861.9,y:651.5},{id:"E3-16",x:861.9,y:642.4},{id:"E3-17",x:861.9,y:614.2},{id:"E3-18",x:861.9,y:605.5},{id:"E3-19",x:861.9,y:669.9},{id:"E3-20",x:861.9,y:660.5},{id:"E3-21",x:861.9,y:633},{id:"E3-22",x:861.9,y:623.6},{id:"E3-23",x:861.9,y:596.1},{id:"E3-24",x:861.9,y:586.7},{id:"E3-25",x:871.2,y:688.8},{id:"E3-26",x:871.2,y:679.4},{id:"E3-27",x:871.2,y:669.9},{id:"E3-28",x:871.2,y:660.5},{id:"E3-29",x:871.2,y:651.5},{id:"E3-30",x:871.2,y:642.4},{id:"E3-31",x:871.2,y:633},{id:"E3-32",x:871.2,y:623.6},{id:"E3-33",x:871.2,y:614.2},{id:"E3-34",x:871.2,y:605.5},{id:"E3-35",x:871.2,y:596.1},{id:"E3-36",x:871.2,y:586.7},{id:"E3-37",x:883.3,y:688.8},{id:"E3-38",x:883.3,y:679.4},{id:"E3-39",x:883.3,y:669.9},{id:"E3-40",x:883.3,y:660.5},{id:"E3-41",x:883.3,y:651.5},{id:"E3-42",x:883.3,y:642.4},{id:"E3-43",x:883.3,y:633},{id:"E3-44",x:883.3,y:623.6},{id:"E3-45",x:883.3,y:614.2},{id:"E3-46",x:883.3,y:605.5},{id:"E3-47",x:883.3,y:596.1},{id:"E3-48",x:883.3,y:586.7},{id:"E3-49",x:892.6,y:688.8},{id:"E3-50",x:892.6,y:679.4},{id:"E3-51",x:892.6,y:669.9},{id:"E3-52",x:892.6,y:660.5},{id:"E3-53",x:892.6,y:651.5},{id:"E3-54",x:892.6,y:642.4},{id:"E3-55",x:892.6,y:633},{id:"E3-56",x:892.6,y:623.6},{id:"E3-57",x:892.6,y:614.2},{id:"E3-58",x:892.6,y:605.5},{id:"E3-59",x:892.6,y:596.1},{id:"E3-60",x:892.6,y:586.7},{id:"E3-61",x:904.5,y:688.8},{id:"E3-62",x:904.5,y:679.4},{id:"E3-63",x:904.5,y:669.9},{id:"E3-64",x:904.5,y:660.5},{id:"E3-65",x:904.5,y:651.5},{id:"E3-66",x:904.5,y:642.4},{id:"E3-67",x:904.5,y:633},{id:"E3-68",x:904.5,y:623.6},{id:"E3-69",x:904.5,y:614.2},{id:"E3-70",x:904.5,y:605.5},{id:"E3-71",x:904.5,y:596.1},{id:"E3-72",x:904.5,y:586.7},{id:"E3-73",x:914,y:688.8},{id:"E3-74",x:914,y:679.4},{id:"E3-75",x:914,y:669.9},{id:"E3-76",x:914,y:660.5},{id:"E3-77",x:914,y:651.5},{id:"E3-78",x:914,y:642.4},{id:"E3-79",x:914,y:633},{id:"E3-80",x:914,y:623.6},{id:"E3-81",x:914,y:614.2},{id:"E3-82",x:914,y:605.5},{id:"E3-83",x:914,y:596.1},{id:"E3-84",x:914,y:586.7},{id:"E3-85",x:932.6,y:688.8},{id:"E3-86",x:932.6,y:679.4},{id:"E3-87",x:932.6,y:669.9},{id:"E3-88",x:932.6,y:660.5},{id:"E3-89",x:932.6,y:651.5},{id:"E3-90",x:932.6,y:642.4},{id:"E3-91",x:932.6,y:633},{id:"E3-92",x:932.6,y:623.6},{id:"E3-93",x:932.6,y:614.2},{id:"E3-94",x:932.6,y:605.5},{id:"E3-95",x:932.6,y:596.1},{id:"E3-96",x:932.6,y:586.7},{id:"E3-97",x:944.5,y:688.8},{id:"E3-98",x:944.5,y:679.4},{id:"E3-99",x:944.5,y:669.9},{id:"E3-100",x:944.5,y:660.5},{id:"E3-101",x:944.5,y:651.5},{id:"E3-102",x:944.5,y:642.4},{id:"E3-103",x:944.5,y:633},{id:"E3-104",x:944.5,y:623.6},{id:"E3-105",x:944.5,y:614.2},{id:"E3-106",x:944.5,y:605.5},{id:"E3-107",x:944.5,y:596.1},{id:"E3-108",x:944.5,y:586.7},{id:"E3-109",x:953.5,y:688.8},{id:"E3-110",x:953.5,y:679.4},{id:"E3-111",x:953.5,y:669.9},{id:"E3-112",x:953.5,y:660.5},{id:"E3-113",x:953.5,y:651.5},{id:"E3-114",x:953.5,y:642.4},{id:"E3-115",x:953.5,y:633},{id:"E3-116",x:953.5,y:623.6},{id:"E3-117",x:953.5,y:614.2},{id:"E3-118",x:953.5,y:605.5},{id:"E3-119",x:953.5,y:596.1},{id:"E3-120",x:953.5,y:586.7}]},{id:"E4",name:"E4 구역",grade:"S",floor:"1F",seats:[{id:"E4-1",x:850.6,y:546.6},{id:"E4-2",x:850.6,y:537.1},{id:"E4-3",x:850.6,y:527.7},{id:"E4-4",x:850.6,y:518.7},{id:"E4-5",x:850.6,y:509.3},{id:"E4-6",x:850.6,y:500.2},{id:"E4-7",x:850.6,y:490.8},{id:"E4-8",x:850.6,y:481.8},{id:"E4-9",x:850.6,y:472.3},{id:"E4-10",x:850.6,y:463.3},{id:"E4-11",x:850.6,y:453.9},{id:"E4-12",x:850.6,y:444.8},{id:"E4-13",x:850.6,y:435.4},{id:"E4-14",x:850.6,y:426.4},{id:"E4-15",x:861.3,y:546.6},{id:"E4-16",x:861.3,y:537.1},{id:"E4-17",x:861.3,y:527.7},{id:"E4-18",x:861.3,y:518.7},{id:"E4-19",x:861.3,y:509.3},{id:"E4-20",x:861.3,y:500.2},{id:"E4-21",x:861.3,y:490.8},{id:"E4-22",x:861.3,y:481.8},{id:"E4-23",x:861.3,y:472.3},{id:"E4-24",x:861.3,y:463.3},{id:"E4-25",x:861.3,y:453.9},{id:"E4-26",x:861.3,y:444.8},{id:"E4-27",x:861.3,y:435.4},{id:"E4-28",x:861.3,y:426.4},{id:"E4-29",x:872.3,y:546.6},{id:"E4-30",x:872.3,y:537.1},{id:"E4-31",x:872.3,y:509.3},{id:"E4-32",x:872.3,y:500.2},{id:"E4-33",x:872.3,y:472.3},{id:"E4-34",x:872.3,y:463.3},{id:"E4-35",x:872.3,y:527.7},{id:"E4-36",x:872.3,y:518.7},{id:"E4-37",x:872.3,y:490.8},{id:"E4-38",x:872.3,y:481.8},{id:"E4-39",x:872.3,y:453.9},{id:"E4-40",x:872.3,y:444.8},{id:"E4-41",x:872.3,y:435.4},{id:"E4-42",x:872.3,y:426.4},{id:"E4-43",x:882.7,y:546.6},{id:"E4-44",x:882.7,y:537.1},{id:"E4-45",x:882.7,y:509.3},{id:"E4-46",x:882.7,y:500.2},{id:"E4-47",x:882.7,y:472.3},{id:"E4-48",x:882.7,y:463.3},{id:"E4-49",x:882.7,y:527.7},{id:"E4-50",x:882.7,y:518.7},{id:"E4-51",x:882.7,y:490.8},{id:"E4-52",x:882.7,y:481.8},{id:"E4-53",x:882.7,y:453.9},{id:"E4-54",x:882.7,y:444.8},{id:"E4-55",x:882.7,y:435.4},{id:"E4-56",x:882.7,y:426.4},{id:"E4-57",x:893.8,y:546.6},{id:"E4-58",x:893.8,y:537.1},{id:"E4-59",x:893.8,y:527.7},{id:"E4-60",x:893.8,y:518.7},{id:"E4-61",x:893.8,y:509.3},{id:"E4-62",x:893.8,y:500.2},{id:"E4-63",x:893.8,y:490.8},{id:"E4-64",x:893.8,y:481.8},{id:"E4-65",x:893.8,y:472.3},{id:"E4-66",x:893.8,y:463.3},{id:"E4-67",x:893.8,y:453.9},{id:"E4-68",x:893.8,y:444.8},{id:"E4-69",x:893.8,y:435.4},{id:"E4-70",x:893.8,y:426.4},{id:"E4-71",x:904.9,y:546.6},{id:"E4-72",x:904.9,y:537.1},{id:"E4-73",x:904.9,y:527.7},{id:"E4-74",x:904.9,y:518.7},{id:"E4-75",x:904.9,y:509.3},{id:"E4-76",x:904.9,y:500.2},{id:"E4-77",x:904.9,y:490.8},{id:"E4-78",x:904.9,y:481.8},{id:"E4-79",x:904.9,y:472.3},{id:"E4-80",x:904.9,y:463.3},{id:"E4-81",x:904.9,y:453.9},{id:"E4-82",x:904.9,y:444.8},{id:"E4-83",x:904.9,y:435.4},{id:"E4-84",x:904.9,y:426.4},{id:"E4-85",x:915.2,y:546.6},{id:"E4-86",x:915.2,y:537.1},{id:"E4-87",x:915.2,y:527.7},{id:"E4-88",x:915.2,y:518.7},{id:"E4-89",x:915.2,y:509.3},{id:"E4-90",x:915.2,y:500.2},{id:"E4-91",x:915.2,y:490.8},{id:"E4-92",x:915.2,y:481.8},{id:"E4-93",x:915.2,y:472.3},{id:"E4-94",x:915.2,y:463.3},{id:"E4-95",x:915.2,y:453.9},{id:"E4-96",x:915.2,y:444.8},{id:"E4-97",x:915.2,y:435.4},{id:"E4-98",x:915.2,y:426.4},{id:"E4-99",x:933.7,y:546.6},{id:"E4-100",x:933.7,y:537.1},{id:"E4-101",x:933.7,y:527.7},{id:"E4-102",x:933.7,y:518.7},{id:"E4-103",x:933.7,y:509.3},{id:"E4-104",x:933.7,y:500.2},{id:"E4-105",x:933.7,y:490.8},{id:"E4-106",x:933.7,y:481.8},{id:"E4-107",x:933.7,y:472.3},{id:"E4-108",x:933.7,y:463.3},{id:"E4-109",x:943.8,y:546.6},{id:"E4-110",x:943.8,y:537.1},{id:"E4-111",x:943.8,y:527.7},{id:"E4-112",x:943.8,y:518.7},{id:"E4-113",x:943.8,y:509.3},{id:"E4-114",x:943.8,y:500.2}]},{id:"F1",name:"F1 구역",grade:"R",floor:"1F",seats:[{id:"F1-1",x:394.3,y:683.2},{id:"F1-2",x:394.3,y:665.7},{id:"F1-3",x:394.3,y:614.6},{id:"F1-4",x:394.3,y:596.7},{id:"F1-5",x:394.3,y:579.7},{id:"F1-6",x:394.3,y:562},{id:"F1-7",x:394.3,y:545.1},{id:"F1-8",x:394.3,y:528.2},{id:"F1-9",x:394.3,y:511.7},{id:"F1-10",x:394.3,y:648.9},{id:"F1-11",x:394.3,y:632},{id:"F1-12",x:400.9,y:683.2},{id:"F1-13",x:400.9,y:665.7},{id:"F1-14",x:400.9,y:614.6},{id:"F1-15",x:400.9,y:596.7},{id:"F1-16",x:400.9,y:579.7},{id:"F1-17",x:400.9,y:562},{id:"F1-18",x:400.9,y:545.1},{id:"F1-19",x:400.9,y:528.2},{id:"F1-20",x:400.9,y:511.7},{id:"F1-21",x:400.9,y:648.9},{id:"F1-22",x:400.9,y:632},{id:"F1-23",x:407.1,y:683.2},{id:"F1-24",x:407.1,y:665.7},{id:"F1-25",x:407.1,y:614.6},{id:"F1-26",x:407.1,y:596.7},{id:"F1-27",x:407.1,y:579.7},{id:"F1-28",x:407.1,y:562},{id:"F1-29",x:407.1,y:545.1},{id:"F1-30",x:407.1,y:528.2},{id:"F1-31",x:407.1,y:511.7},{id:"F1-32",x:407.1,y:648.9},{id:"F1-33",x:407.1,y:632},{id:"F1-34",x:413.4,y:683.2},{id:"F1-35",x:413.4,y:665.7},{id:"F1-36",x:413.4,y:614.6},{id:"F1-37",x:413.4,y:596.7},{id:"F1-38",x:413.4,y:579.7},{id:"F1-39",x:413.4,y:562},{id:"F1-40",x:413.4,y:545.1},{id:"F1-41",x:413.4,y:528.2},{id:"F1-42",x:413.4,y:511.7},{id:"F1-43",x:413.4,y:648.9},{id:"F1-44",x:413.4,y:632},{id:"F1-45",x:419.6,y:683.2},{id:"F1-46",x:419.6,y:665.7},{id:"F1-47",x:419.6,y:614.6},{id:"F1-48",x:419.6,y:596.7},{id:"F1-49",x:419.6,y:579.7},{id:"F1-50",x:419.6,y:562},{id:"F1-51",x:419.6,y:545.1},{id:"F1-52",x:419.6,y:528.2},{id:"F1-53",x:419.6,y:511.7},{id:"F1-54",x:419.6,y:648.9},{id:"F1-55",x:419.6,y:632},{id:"F1-56",x:424.7,y:683.2},{id:"F1-57",x:424.7,y:665.7},{id:"F1-58",x:424.7,y:614.6},{id:"F1-59",x:424.7,y:596.7},{id:"F1-60",x:424.7,y:579.7},{id:"F1-61",x:424.7,y:562},{id:"F1-62",x:424.7,y:545.1},{id:"F1-63",x:424.7,y:528.2},{id:"F1-64",x:424.7,y:511.7},{id:"F1-65",x:424.7,y:648.9},{id:"F1-66",x:424.7,y:632}]},{id:"F2",name:"F2 구역",grade:"R",floor:"1F",seats:[{id:"F2-1",x:444.2,y:683},{id:"F2-2",x:444.2,y:665.5},{id:"F2-3",x:444.2,y:614.4},{id:"F2-4",x:444.2,y:596.5},{id:"F2-5",x:444.2,y:579.5},{id:"F2-6",x:444.2,y:561.8},{id:"F2-7",x:444.2,y:545},{id:"F2-8",x:444.2,y:528.1},{id:"F2-9",x:444.2,y:511.6},{id:"F2-10",x:444.2,y:648.7},{id:"F2-11",x:444.2,y:631.8},{id:"F2-12",x:450.5,y:683},{id:"F2-13",x:450.5,y:665.5},{id:"F2-14",x:450.5,y:614.4},{id:"F2-15",x:450.5,y:596.5},{id:"F2-16",x:450.5,y:579.5},{id:"F2-17",x:450.5,y:561.8},{id:"F2-18",x:450.5,y:545},{id:"F2-19",x:450.5,y:528.1},{id:"F2-20",x:450.5,y:511.6},{id:"F2-21",x:450.5,y:648.7},{id:"F2-22",x:450.5,y:631.8},{id:"F2-23",x:456.7,y:683},{id:"F2-24",x:456.7,y:665.5},{id:"F2-25",x:456.7,y:614.4},{id:"F2-26",x:456.7,y:596.5},{id:"F2-27",x:456.7,y:579.5},{id:"F2-28",x:456.7,y:561.8},{id:"F2-29",x:456.7,y:545},{id:"F2-30",x:456.7,y:528.1},{id:"F2-31",x:456.7,y:511.6},{id:"F2-32",x:456.7,y:648.7},{id:"F2-33",x:456.7,y:631.8},{id:"F2-34",x:463,y:683},{id:"F2-35",x:463,y:665.5},{id:"F2-36",x:463,y:614.4},{id:"F2-37",x:463,y:596.5},{id:"F2-38",x:463,y:579.5},{id:"F2-39",x:463,y:561.8},{id:"F2-40",x:463,y:545},{id:"F2-41",x:463,y:528.1},{id:"F2-42",x:463,y:511.6},{id:"F2-43",x:463,y:648.7},{id:"F2-44",x:463,y:631.8},{id:"F2-45",x:469.2,y:683},{id:"F2-46",x:469.2,y:665.5},{id:"F2-47",x:469.2,y:614.4},{id:"F2-48",x:469.2,y:596.5},{id:"F2-49",x:469.2,y:579.5},{id:"F2-50",x:469.2,y:561.8},{id:"F2-51",x:469.2,y:545},{id:"F2-52",x:469.2,y:528.1},{id:"F2-53",x:469.2,y:511.6},{id:"F2-54",x:469.2,y:648.7},{id:"F2-55",x:469.2,y:631.8},{id:"F2-56",x:475.5,y:683},{id:"F2-57",x:475.5,y:665.5},{id:"F2-58",x:475.5,y:614.4},{id:"F2-59",x:475.5,y:596.5},{id:"F2-60",x:475.5,y:579.5},{id:"F2-61",x:475.5,y:561.8},{id:"F2-62",x:475.5,y:545},{id:"F2-63",x:475.5,y:528.1},{id:"F2-64",x:475.5,y:511.6},{id:"F2-65",x:475.5,y:648.7},{id:"F2-66",x:475.5,y:631.8},{id:"F2-67",x:481.7,y:683},{id:"F2-68",x:481.7,y:665.5},{id:"F2-69",x:481.7,y:614.4},{id:"F2-70",x:481.7,y:596.5},{id:"F2-71",x:481.7,y:579.5},{id:"F2-72",x:481.7,y:561.8},{id:"F2-73",x:481.7,y:545},{id:"F2-74",x:481.7,y:528.1},{id:"F2-75",x:481.7,y:511.6},{id:"F2-76",x:481.7,y:648.7},{id:"F2-77",x:481.7,y:631.8},{id:"F2-78",x:488,y:683},{id:"F2-79",x:488,y:665.5},{id:"F2-80",x:488,y:614.4},{id:"F2-81",x:488,y:596.5},{id:"F2-82",x:488,y:579.5},{id:"F2-83",x:488,y:561.8},{id:"F2-84",x:488,y:545},{id:"F2-85",x:488,y:528.1},{id:"F2-86",x:488,y:511.6},{id:"F2-87",x:488,y:648.7},{id:"F2-88",x:488,y:631.8},{id:"F2-89",x:494.2,y:683},{id:"F2-90",x:494.2,y:665.5},{id:"F2-91",x:494.2,y:614.4},{id:"F2-92",x:494.2,y:596.5},{id:"F2-93",x:494.2,y:579.5},{id:"F2-94",x:494.2,y:561.8},{id:"F2-95",x:494.2,y:545},{id:"F2-96",x:494.2,y:528.1},{id:"F2-97",x:494.2,y:511.6},{id:"F2-98",x:494.2,y:648.7},{id:"F2-99",x:494.2,y:631.8},{id:"F2-100",x:500.6,y:683},{id:"F2-101",x:500.6,y:665.5},{id:"F2-102",x:500.6,y:614.4},{id:"F2-103",x:500.6,y:596.5},{id:"F2-104",x:500.6,y:579.5},{id:"F2-105",x:500.6,y:561.8},{id:"F2-106",x:500.6,y:545},{id:"F2-107",x:500.6,y:528.1},{id:"F2-108",x:500.6,y:511.6},{id:"F2-109",x:500.6,y:648.7},{id:"F2-110",x:500.6,y:631.8},{id:"F2-111",x:506.8,y:683},{id:"F2-112",x:506.8,y:665.5},{id:"F2-113",x:506.8,y:614.4},{id:"F2-114",x:506.8,y:596.5},{id:"F2-115",x:506.8,y:579.5},{id:"F2-116",x:506.8,y:561.8},{id:"F2-117",x:506.8,y:545},{id:"F2-118",x:506.8,y:528.1},{id:"F2-119",x:506.8,y:511.6},{id:"F2-120",x:506.8,y:648.7},{id:"F2-121",x:506.8,y:631.8},{id:"F2-122",x:513.1,y:683},{id:"F2-123",x:513.1,y:665.5},{id:"F2-124",x:513.1,y:614.4},{id:"F2-125",x:513.1,y:596.5},{id:"F2-126",x:513.1,y:579.5},{id:"F2-127",x:513.1,y:561.8},{id:"F2-128",x:513.1,y:545},{id:"F2-129",x:513.1,y:528.1},{id:"F2-130",x:513.1,y:511.6},{id:"F2-131",x:513.1,y:648.7},{id:"F2-132",x:513.1,y:631.8},{id:"F2-133",x:519.3,y:683},{id:"F2-134",x:519.3,y:665.5},{id:"F2-135",x:519.3,y:614.4},{id:"F2-136",x:519.3,y:596.5},{id:"F2-137",x:519.3,y:579.5},{id:"F2-138",x:519.3,y:561.8},{id:"F2-139",x:519.3,y:545},{id:"F2-140",x:519.3,y:528.1},{id:"F2-141",x:519.3,y:511.6},{id:"F2-142",x:519.3,y:648.7},{id:"F2-143",x:519.3,y:631.8},{id:"F2-144",x:525.6,y:683},{id:"F2-145",x:525.6,y:665.5},{id:"F2-146",x:525.6,y:614.4},{id:"F2-147",x:525.6,y:596.5},{id:"F2-148",x:525.6,y:579.5},{id:"F2-149",x:525.6,y:561.8},{id:"F2-150",x:525.6,y:545},{id:"F2-151",x:525.6,y:528.1},{id:"F2-152",x:525.6,y:511.6},{id:"F2-153",x:525.6,y:648.7},{id:"F2-154",x:525.6,y:631.8},{id:"F2-155",x:531.8,y:683},{id:"F2-156",x:531.8,y:665.5},{id:"F2-157",x:531.8,y:614.4},{id:"F2-158",x:531.8,y:596.5},{id:"F2-159",x:531.8,y:579.5},{id:"F2-160",x:531.8,y:561.8},{id:"F2-161",x:531.8,y:545},{id:"F2-162",x:531.8,y:528.1},{id:"F2-163",x:531.8,y:511.6},{id:"F2-164",x:531.8,y:648.7},{id:"F2-165",x:531.8,y:631.8},{id:"F2-166",x:538.1,y:683},{id:"F2-167",x:538.1,y:665.5},{id:"F2-168",x:538.1,y:614.4},{id:"F2-169",x:538.1,y:596.5},{id:"F2-170",x:538.1,y:579.5},{id:"F2-171",x:538.1,y:561.8},{id:"F2-172",x:538.1,y:545},{id:"F2-173",x:538.1,y:528.1},{id:"F2-174",x:538.1,y:511.6},{id:"F2-175",x:538.1,y:648.7},{id:"F2-176",x:538.1,y:631.8},{id:"F2-177",x:544.3,y:683},{id:"F2-178",x:544.3,y:665.5},{id:"F2-179",x:544.3,y:614.4},{id:"F2-180",x:544.3,y:596.5},{id:"F2-181",x:544.3,y:579.5},{id:"F2-182",x:544.3,y:561.8},{id:"F2-183",x:544.3,y:545},{id:"F2-184",x:544.3,y:528.1},{id:"F2-185",x:544.3,y:511.6},{id:"F2-186",x:544.3,y:648.7},{id:"F2-187",x:544.3,y:631.8},{id:"F2-188",x:550.6,y:683},{id:"F2-189",x:550.6,y:665.5},{id:"F2-190",x:550.6,y:614.4},{id:"F2-191",x:550.6,y:596.5},{id:"F2-192",x:550.6,y:579.5},{id:"F2-193",x:550.6,y:561.8},{id:"F2-194",x:550.6,y:545},{id:"F2-195",x:550.6,y:528.1},{id:"F2-196",x:550.6,y:511.6},{id:"F2-197",x:550.6,y:648.7},{id:"F2-198",x:550.6,y:631.8},{id:"F2-199",x:556.6,y:683},{id:"F2-200",x:556.6,y:665.5},{id:"F2-201",x:556.6,y:614.4},{id:"F2-202",x:556.6,y:596.5},{id:"F2-203",x:556.6,y:579.5},{id:"F2-204",x:556.6,y:561.8},{id:"F2-205",x:556.6,y:545},{id:"F2-206",x:556.6,y:528.1},{id:"F2-207",x:556.6,y:511.6},{id:"F2-208",x:556.6,y:648.7},{id:"F2-209",x:556.6,y:631.8}]},{id:"F3",name:"F3 구역",grade:"R",floor:"1F",seats:[{id:"F3-1",x:576.3,y:682.6},{id:"F3-2",x:576.3,y:665.1},{id:"F3-3",x:576.3,y:614},{id:"F3-4",x:576.3,y:596.1},{id:"F3-5",x:576.3,y:579.1},{id:"F3-6",x:576.3,y:561.4},{id:"F3-7",x:576.3,y:544.5},{id:"F3-8",x:576.3,y:527.6},{id:"F3-9",x:576.3,y:511.1},{id:"F3-10",x:576.3,y:648.3},{id:"F3-11",x:576.3,y:631.4},{id:"F3-12",x:582.9,y:682.6},{id:"F3-13",x:582.9,y:665.1},{id:"F3-14",x:582.9,y:614},{id:"F3-15",x:582.9,y:596.1},{id:"F3-16",x:582.9,y:579.1},{id:"F3-17",x:582.9,y:561.4},{id:"F3-18",x:582.9,y:544.5},{id:"F3-19",x:582.9,y:527.6},{id:"F3-20",x:582.9,y:511.1},{id:"F3-21",x:582.9,y:648.3},{id:"F3-22",x:582.9,y:631.4},{id:"F3-23",x:589.1,y:682.6},{id:"F3-24",x:589.1,y:665.1},{id:"F3-25",x:589.1,y:614},{id:"F3-26",x:589.1,y:596.1},{id:"F3-27",x:589.1,y:579.1},{id:"F3-28",x:589.1,y:561.4},{id:"F3-29",x:589.1,y:544.5},{id:"F3-30",x:589.1,y:527.6},{id:"F3-31",x:589.1,y:511.1},{id:"F3-32",x:589.1,y:648.3},{id:"F3-33",x:589.1,y:631.4},{id:"F3-34",x:595.4,y:682.6},{id:"F3-35",x:595.4,y:665.1},{id:"F3-36",x:595.4,y:614},{id:"F3-37",x:595.4,y:596.1},{id:"F3-38",x:595.4,y:579.1},{id:"F3-39",x:595.4,y:561.4},{id:"F3-40",x:595.4,y:544.5},{id:"F3-41",x:595.4,y:527.6},{id:"F3-42",x:595.4,y:511.1},{id:"F3-43",x:595.4,y:648.3},{id:"F3-44",x:595.4,y:631.4},{id:"F3-45",x:601.6,y:682.6},{id:"F3-46",x:601.6,y:665.1},{id:"F3-47",x:601.6,y:614},{id:"F3-48",x:601.6,y:596.1},{id:"F3-49",x:601.6,y:579.1},{id:"F3-50",x:601.6,y:561.4},{id:"F3-51",x:601.6,y:544.5},{id:"F3-52",x:601.6,y:527.6},{id:"F3-53",x:601.6,y:511.1},{id:"F3-54",x:601.6,y:648.3},{id:"F3-55",x:601.6,y:631.4},{id:"F3-56",x:606.7,y:682.6},{id:"F3-57",x:606.7,y:665.1},{id:"F3-58",x:606.7,y:614},{id:"F3-59",x:606.7,y:596.1},{id:"F3-60",x:606.7,y:579.1},{id:"F3-61",x:606.7,y:561.4},{id:"F3-62",x:606.7,y:544.5},{id:"F3-63",x:606.7,y:527.6},{id:"F3-64",x:606.7,y:511.1},{id:"F3-65",x:606.7,y:648.3},{id:"F3-66",x:606.7,y:631.4}]},{id:"Floor",name:"Floor 구역",grade:"VIP",floor:"1F",seats:[{id:"Floor-1",x:388.9,y:967.2},{id:"Floor-2",x:395.1,y:967.2},{id:"Floor-3",x:401.2,y:967.2},{id:"Floor-4",x:407.4,y:967.2},{id:"Floor-5",x:413.5,y:967.2},{id:"Floor-6",x:419.7,y:967.2},{id:"Floor-7",x:425.8,y:967.2},{id:"Floor-8",x:432,y:967.2},{id:"Floor-9",x:438.1,y:967.2},{id:"Floor-10",x:444.3,y:967.2},{id:"Floor-11",x:450.4,y:967.2},{id:"Floor-12",x:456.6,y:967.2},{id:"Floor-13",x:462.7,y:967.2},{id:"Floor-14",x:468.9,y:967.2},{id:"Floor-15",x:475,y:967.2},{id:"Floor-16",x:481.2,y:967.2},{id:"Floor-17",x:487.3,y:967.2},{id:"Floor-18",x:493.5,y:967.2},{id:"Floor-19",x:499.6,y:967.2},{id:"Floor-20",x:505.8,y:967.2},{id:"Floor-21",x:511.9,y:967.2},{id:"Floor-22",x:518.1,y:967.2},{id:"Floor-23",x:524.2,y:967.2},{id:"Floor-24",x:530.4,y:967.2},{id:"Floor-25",x:536.5,y:967.2},{id:"Floor-26",x:542.7,y:967.2},{id:"Floor-27",x:548.8,y:967.2},{id:"Floor-28",x:555,y:967.2},{id:"Floor-29",x:561.1,y:967.2},{id:"Floor-30",x:567.3,y:967.2},{id:"Floor-31",x:573.4,y:967.2},{id:"Floor-32",x:579.6,y:967.2},{id:"Floor-33",x:585.7,y:967.2},{id:"Floor-34",x:591.9,y:967.2},{id:"Floor-35",x:598,y:967.2},{id:"Floor-36",x:604.2,y:967.2},{id:"Floor-37",x:610.3,y:967.2},{id:"Floor-38",x:388.9,y:958.2},{id:"Floor-39",x:395.1,y:958.2},{id:"Floor-40",x:401.2,y:958.2},{id:"Floor-41",x:407.4,y:958.2},{id:"Floor-42",x:413.5,y:958.2},{id:"Floor-43",x:419.7,y:958.2},{id:"Floor-44",x:425.8,y:958.2},{id:"Floor-45",x:432,y:958.2},{id:"Floor-46",x:438.1,y:958.2},{id:"Floor-47",x:444.3,y:958.2},{id:"Floor-48",x:450.4,y:958.2},{id:"Floor-49",x:456.6,y:958.2},{id:"Floor-50",x:462.7,y:958.2},{id:"Floor-51",x:468.9,y:958.2},{id:"Floor-52",x:475,y:958.2},{id:"Floor-53",x:481.2,y:958.2},{id:"Floor-54",x:487.3,y:958.2},{id:"Floor-55",x:493.5,y:958.2},{id:"Floor-56",x:499.6,y:958.2},{id:"Floor-57",x:505.8,y:958.2},{id:"Floor-58",x:511.9,y:958.2},{id:"Floor-59",x:518.1,y:958.2},{id:"Floor-60",x:524.2,y:958.2},{id:"Floor-61",x:530.4,y:958.2},{id:"Floor-62",x:536.5,y:958.2},{id:"Floor-63",x:542.7,y:958.2},{id:"Floor-64",x:548.8,y:958.2},{id:"Floor-65",x:555,y:958.2},{id:"Floor-66",x:561.1,y:958.2},{id:"Floor-67",x:567.3,y:958.2},{id:"Floor-68",x:573.4,y:958.2},{id:"Floor-69",x:579.6,y:958.2},{id:"Floor-70",x:585.7,y:958.2},{id:"Floor-71",x:591.9,y:958.2},{id:"Floor-72",x:598,y:958.2},{id:"Floor-73",x:604.2,y:958.2},{id:"Floor-74",x:610.3,y:958.2},{id:"Floor-75",x:388.9,y:949.2},{id:"Floor-76",x:395.1,y:949.2},{id:"Floor-77",x:401.2,y:949.2},{id:"Floor-78",x:407.4,y:949.2},{id:"Floor-79",x:413.5,y:949.2},{id:"Floor-80",x:419.7,y:949.2},{id:"Floor-81",x:425.8,y:949.2},{id:"Floor-82",x:432,y:949.2},{id:"Floor-83",x:438.1,y:949.2},{id:"Floor-84",x:444.3,y:949.2},{id:"Floor-85",x:450.4,y:949.2},{id:"Floor-86",x:456.6,y:949.2},{id:"Floor-87",x:462.7,y:949.2},{id:"Floor-88",x:468.9,y:949.2},{id:"Floor-89",x:475,y:949.2},{id:"Floor-90",x:481.2,y:949.2},{id:"Floor-91",x:487.3,y:949.2},{id:"Floor-92",x:493.5,y:949.2},{id:"Floor-93",x:499.6,y:949.2},{id:"Floor-94",x:505.8,y:949.2},{id:"Floor-95",x:511.9,y:949.2},{id:"Floor-96",x:518.1,y:949.2},{id:"Floor-97",x:524.2,y:949.2},{id:"Floor-98",x:530.4,y:949.2},{id:"Floor-99",x:536.5,y:949.2},{id:"Floor-100",x:542.7,y:949.2},{id:"Floor-101",x:548.8,y:949.2},{id:"Floor-102",x:555,y:949.2},{id:"Floor-103",x:561.1,y:949.2},{id:"Floor-104",x:567.3,y:949.2},{id:"Floor-105",x:573.4,y:949.2},{id:"Floor-106",x:579.6,y:949.2},{id:"Floor-107",x:585.7,y:949.2},{id:"Floor-108",x:591.9,y:949.2},{id:"Floor-109",x:598,y:949.2},{id:"Floor-110",x:604.2,y:949.2},{id:"Floor-111",x:610.3,y:949.2},{id:"Floor-112",x:388.9,y:940.2},{id:"Floor-113",x:395.1,y:940.2},{id:"Floor-114",x:401.2,y:940.2},{id:"Floor-115",x:407.4,y:940.2},{id:"Floor-116",x:413.5,y:940.2},{id:"Floor-117",x:419.7,y:940.2},{id:"Floor-118",x:425.8,y:940.2},{id:"Floor-119",x:432,y:940.2},{id:"Floor-120",x:438.1,y:940.2},{id:"Floor-121",x:444.3,y:940.2},{id:"Floor-122",x:450.4,y:940.2},{id:"Floor-123",x:456.6,y:940.2},{id:"Floor-124",x:462.7,y:940.2},{id:"Floor-125",x:468.9,y:940.2},{id:"Floor-126",x:475,y:940.2},{id:"Floor-127",x:481.2,y:940.2},{id:"Floor-128",x:487.3,y:940.2},{id:"Floor-129",x:493.5,y:940.2},{id:"Floor-130",x:499.6,y:940.2},{id:"Floor-131",x:505.8,y:940.2},{id:"Floor-132",x:511.9,y:940.2},{id:"Floor-133",x:518.1,y:940.2},{id:"Floor-134",x:524.2,y:940.2},{id:"Floor-135",x:530.4,y:940.2},{id:"Floor-136",x:536.5,y:940.2},{id:"Floor-137",x:542.7,y:940.2},{id:"Floor-138",x:548.8,y:940.2},{id:"Floor-139",x:555,y:940.2},{id:"Floor-140",x:561.1,y:940.2},{id:"Floor-141",x:567.3,y:940.2},{id:"Floor-142",x:573.4,y:940.2},{id:"Floor-143",x:579.6,y:940.2},{id:"Floor-144",x:585.7,y:940.2},{id:"Floor-145",x:591.9,y:940.2},{id:"Floor-146",x:598,y:940.2},{id:"Floor-147",x:604.2,y:940.2},{id:"Floor-148",x:610.3,y:940.2},{id:"Floor-149",x:388.9,y:931.2},{id:"Floor-150",x:395.1,y:931.2},{id:"Floor-151",x:401.2,y:931.2},{id:"Floor-152",x:407.4,y:931.2},{id:"Floor-153",x:413.5,y:931.2},{id:"Floor-154",x:419.7,y:931.2},{id:"Floor-155",x:425.8,y:931.2},{id:"Floor-156",x:432,y:931.2},{id:"Floor-157",x:438.1,y:931.2},{id:"Floor-158",x:444.3,y:931.2},{id:"Floor-159",x:450.4,y:931.2},{id:"Floor-160",x:456.6,y:931.2},{id:"Floor-161",x:462.7,y:931.2},{id:"Floor-162",x:468.9,y:931.2},{id:"Floor-163",x:475,y:931.2},{id:"Floor-164",x:481.2,y:931.2},{id:"Floor-165",x:487.3,y:931.2},{id:"Floor-166",x:493.5,y:931.2},{id:"Floor-167",x:499.6,y:931.2},{id:"Floor-168",x:505.8,y:931.2},{id:"Floor-169",x:511.9,y:931.2},{id:"Floor-170",x:518.1,y:931.2},{id:"Floor-171",x:524.2,y:931.2},{id:"Floor-172",x:530.4,y:931.2},{id:"Floor-173",x:536.5,y:931.2},{id:"Floor-174",x:542.7,y:931.2},{id:"Floor-175",x:548.8,y:931.2},{id:"Floor-176",x:555,y:931.2},{id:"Floor-177",x:561.1,y:931.2},{id:"Floor-178",x:567.3,y:931.2},{id:"Floor-179",x:573.4,y:931.2},{id:"Floor-180",x:579.6,y:931.2},{id:"Floor-181",x:585.7,y:931.2},{id:"Floor-182",x:591.9,y:931.2},{id:"Floor-183",x:598,y:931.2},{id:"Floor-184",x:604.2,y:931.2},{id:"Floor-185",x:610.3,y:931.2},{id:"Floor-186",x:388.9,y:922.2},{id:"Floor-187",x:395.1,y:922.2},{id:"Floor-188",x:401.2,y:922.2},{id:"Floor-189",x:407.4,y:922.2},{id:"Floor-190",x:413.5,y:922.2},{id:"Floor-191",x:419.7,y:922.2},{id:"Floor-192",x:425.8,y:922.2},{id:"Floor-193",x:432,y:922.2},{id:"Floor-194",x:438.1,y:922.2},{id:"Floor-195",x:444.3,y:922.2},{id:"Floor-196",x:450.4,y:922.2},{id:"Floor-197",x:456.6,y:922.2},{id:"Floor-198",x:462.7,y:922.2},{id:"Floor-199",x:468.9,y:922.2},{id:"Floor-200",x:475,y:922.2},{id:"Floor-201",x:481.2,y:922.2},{id:"Floor-202",x:487.3,y:922.2},{id:"Floor-203",x:493.5,y:922.2},{id:"Floor-204",x:499.6,y:922.2},{id:"Floor-205",x:505.8,y:922.2},{id:"Floor-206",x:511.9,y:922.2},{id:"Floor-207",x:518.1,y:922.2},{id:"Floor-208",x:524.2,y:922.2},{id:"Floor-209",x:530.4,y:922.2},{id:"Floor-210",x:536.5,y:922.2},{id:"Floor-211",x:542.7,y:922.2},{id:"Floor-212",x:548.8,y:922.2},{id:"Floor-213",x:555,y:922.2},{id:"Floor-214",x:561.1,y:922.2},{id:"Floor-215",x:567.3,y:922.2},{id:"Floor-216",x:573.4,y:922.2},{id:"Floor-217",x:579.6,y:922.2},{id:"Floor-218",x:585.7,y:922.2},{id:"Floor-219",x:591.9,y:922.2},{id:"Floor-220",x:598,y:922.2},{id:"Floor-221",x:604.2,y:922.2},{id:"Floor-222",x:610.3,y:922.2},{id:"Floor-223",x:388.9,y:913.2},{id:"Floor-224",x:395.1,y:913.2},{id:"Floor-225",x:401.2,y:913.2},{id:"Floor-226",x:407.4,y:913.2},{id:"Floor-227",x:413.5,y:913.2},{id:"Floor-228",x:419.7,y:913.2},{id:"Floor-229",x:425.8,y:913.2},{id:"Floor-230",x:432,y:913.2},{id:"Floor-231",x:438.1,y:913.2},{id:"Floor-232",x:444.3,y:913.2},{id:"Floor-233",x:450.4,y:913.2},{id:"Floor-234",x:456.6,y:913.2},{id:"Floor-235",x:462.7,y:913.2},{id:"Floor-236",x:468.9,y:913.2},{id:"Floor-237",x:475,y:913.2},{id:"Floor-238",x:481.2,y:913.2},{id:"Floor-239",x:487.3,y:913.2},{id:"Floor-240",x:493.5,y:913.2},{id:"Floor-241",x:499.6,y:913.2},{id:"Floor-242",x:505.8,y:913.2},{id:"Floor-243",x:511.9,y:913.2},{id:"Floor-244",x:518.1,y:913.2},{id:"Floor-245",x:524.2,y:913.2},{id:"Floor-246",x:530.4,y:913.2},{id:"Floor-247",x:536.5,y:913.2},{id:"Floor-248",x:542.7,y:913.2},{id:"Floor-249",x:548.8,y:913.2},{id:"Floor-250",x:555,y:913.2},{id:"Floor-251",x:561.1,y:913.2},{id:"Floor-252",x:567.3,y:913.2},{id:"Floor-253",x:573.4,y:913.2},{id:"Floor-254",x:579.6,y:913.2},{id:"Floor-255",x:585.7,y:913.2},{id:"Floor-256",x:591.9,y:913.2},{id:"Floor-257",x:598,y:913.2},{id:"Floor-258",x:604.2,y:913.2},{id:"Floor-259",x:610.3,y:913.2},{id:"Floor-260",x:388.9,y:904.2},{id:"Floor-261",x:395.1,y:904.2},{id:"Floor-262",x:401.2,y:904.2},{id:"Floor-263",x:407.4,y:904.2},{id:"Floor-264",x:413.5,y:904.2},{id:"Floor-265",x:419.7,y:904.2},{id:"Floor-266",x:425.8,y:904.2},{id:"Floor-267",x:432,y:904.2},{id:"Floor-268",x:438.1,y:904.2},{id:"Floor-269",x:444.3,y:904.2},{id:"Floor-270",x:450.4,y:904.2},{id:"Floor-271",x:456.6,y:904.2},{id:"Floor-272",x:462.7,y:904.2},{id:"Floor-273",x:468.9,y:904.2},{id:"Floor-274",x:475,y:904.2},{id:"Floor-275",x:481.2,y:904.2},{id:"Floor-276",x:487.3,y:904.2},{id:"Floor-277",x:493.5,y:904.2},{id:"Floor-278",x:499.6,y:904.2},{id:"Floor-279",x:505.8,y:904.2},{id:"Floor-280",x:511.9,y:904.2},{id:"Floor-281",x:518.1,y:904.2},{id:"Floor-282",x:524.2,y:904.2},{id:"Floor-283",x:530.4,y:904.2},{id:"Floor-284",x:536.5,y:904.2},{id:"Floor-285",x:542.7,y:904.2},{id:"Floor-286",x:548.8,y:904.2},{id:"Floor-287",x:555,y:904.2},{id:"Floor-288",x:561.1,y:904.2},{id:"Floor-289",x:567.3,y:904.2},{id:"Floor-290",x:573.4,y:904.2},{id:"Floor-291",x:579.6,y:904.2},{id:"Floor-292",x:585.7,y:904.2},{id:"Floor-293",x:591.9,y:904.2},{id:"Floor-294",x:598,y:904.2},{id:"Floor-295",x:604.2,y:904.2},{id:"Floor-296",x:610.3,y:904.2},{id:"Floor-297",x:388.9,y:895.2},{id:"Floor-298",x:395.1,y:895.2},{id:"Floor-299",x:401.2,y:895.2},{id:"Floor-300",x:407.4,y:895.2},{id:"Floor-301",x:413.5,y:895.2},{id:"Floor-302",x:419.7,y:895.2},{id:"Floor-303",x:425.8,y:895.2},{id:"Floor-304",x:432,y:895.2},{id:"Floor-305",x:438.1,y:895.2},{id:"Floor-306",x:444.3,y:895.2},{id:"Floor-307",x:450.4,y:895.2},{id:"Floor-308",x:456.6,y:895.2},{id:"Floor-309",x:462.7,y:895.2},{id:"Floor-310",x:468.9,y:895.2},{id:"Floor-311",x:475,y:895.2},{id:"Floor-312",x:481.2,y:895.2},{id:"Floor-313",x:487.3,y:895.2},{id:"Floor-314",x:493.5,y:895.2},{id:"Floor-315",x:499.6,y:895.2},{id:"Floor-316",x:505.8,y:895.2},{id:"Floor-317",x:511.9,y:895.2},{id:"Floor-318",x:518.1,y:895.2},{id:"Floor-319",x:524.2,y:895.2},{id:"Floor-320",x:530.4,y:895.2},{id:"Floor-321",x:536.5,y:895.2},{id:"Floor-322",x:542.7,y:895.2},{id:"Floor-323",x:548.8,y:895.2},{id:"Floor-324",x:555,y:895.2},{id:"Floor-325",x:561.1,y:895.2},{id:"Floor-326",x:567.3,y:895.2},{id:"Floor-327",x:573.4,y:895.2},{id:"Floor-328",x:579.6,y:895.2},{id:"Floor-329",x:585.7,y:895.2},{id:"Floor-330",x:591.9,y:895.2},{id:"Floor-331",x:598,y:895.2},{id:"Floor-332",x:604.2,y:895.2},{id:"Floor-333",x:610.3,y:895.2},{id:"Floor-334",x:388.9,y:886.2},{id:"Floor-335",x:395.1,y:886.2},{id:"Floor-336",x:401.2,y:886.2},{id:"Floor-337",x:407.4,y:886.2},{id:"Floor-338",x:413.5,y:886.2},{id:"Floor-339",x:419.7,y:886.2},{id:"Floor-340",x:425.8,y:886.2},{id:"Floor-341",x:432,y:886.2},{id:"Floor-342",x:438.1,y:886.2},{id:"Floor-343",x:444.3,y:886.2},{id:"Floor-344",x:450.4,y:886.2},{id:"Floor-345",x:456.6,y:886.2},{id:"Floor-346",x:462.7,y:886.2},{id:"Floor-347",x:468.9,y:886.2},{id:"Floor-348",x:475,y:886.2},{id:"Floor-349",x:481.2,y:886.2},{id:"Floor-350",x:487.3,y:886.2},{id:"Floor-351",x:493.5,y:886.2},{id:"Floor-352",x:499.6,y:886.2},{id:"Floor-353",x:505.8,y:886.2},{id:"Floor-354",x:511.9,y:886.2},{id:"Floor-355",x:518.1,y:886.2},{id:"Floor-356",x:524.2,y:886.2},{id:"Floor-357",x:530.4,y:886.2},{id:"Floor-358",x:536.5,y:886.2},{id:"Floor-359",x:542.7,y:886.2},{id:"Floor-360",x:548.8,y:886.2},{id:"Floor-361",x:555,y:886.2},{id:"Floor-362",x:561.1,y:886.2},{id:"Floor-363",x:567.3,y:886.2},{id:"Floor-364",x:573.4,y:886.2},{id:"Floor-365",x:579.6,y:886.2},{id:"Floor-366",x:585.7,y:886.2},{id:"Floor-367",x:591.9,y:886.2},{id:"Floor-368",x:598,y:886.2},{id:"Floor-369",x:604.2,y:886.2},{id:"Floor-370",x:610.3,y:886.2},{id:"Floor-371",x:388.9,y:877.2},{id:"Floor-372",x:395.1,y:877.2},{id:"Floor-373",x:401.2,y:877.2},{id:"Floor-374",x:407.4,y:877.2},{id:"Floor-375",x:413.5,y:877.2},{id:"Floor-376",x:419.7,y:877.2},{id:"Floor-377",x:425.8,y:877.2},{id:"Floor-378",x:432,y:877.2},{id:"Floor-379",x:438.1,y:877.2},{id:"Floor-380",x:444.3,y:877.2},{id:"Floor-381",x:450.4,y:877.2},{id:"Floor-382",x:456.6,y:877.2},{id:"Floor-383",x:462.7,y:877.2},{id:"Floor-384",x:468.9,y:877.2},{id:"Floor-385",x:475,y:877.2},{id:"Floor-386",x:481.2,y:877.2},{id:"Floor-387",x:487.3,y:877.2},{id:"Floor-388",x:493.5,y:877.2},{id:"Floor-389",x:499.6,y:877.2},{id:"Floor-390",x:505.8,y:877.2},{id:"Floor-391",x:511.9,y:877.2},{id:"Floor-392",x:518.1,y:877.2},{id:"Floor-393",x:524.2,y:877.2},{id:"Floor-394",x:530.4,y:877.2},{id:"Floor-395",x:536.5,y:877.2},{id:"Floor-396",x:542.7,y:877.2},{id:"Floor-397",x:548.8,y:877.2},{id:"Floor-398",x:555,y:877.2},{id:"Floor-399",x:561.1,y:877.2},{id:"Floor-400",x:567.3,y:877.2},{id:"Floor-401",x:573.4,y:877.2},{id:"Floor-402",x:579.6,y:877.2},{id:"Floor-403",x:585.7,y:877.2},{id:"Floor-404",x:591.9,y:877.2},{id:"Floor-405",x:598,y:877.2},{id:"Floor-406",x:604.2,y:877.2},{id:"Floor-407",x:610.3,y:877.2},{id:"Floor-408",x:388.9,y:868.2},{id:"Floor-409",x:395.1,y:868.2},{id:"Floor-410",x:401.2,y:868.2},{id:"Floor-411",x:407.4,y:868.2},{id:"Floor-412",x:413.5,y:868.2},{id:"Floor-413",x:419.7,y:868.2},{id:"Floor-414",x:425.8,y:868.2},{id:"Floor-415",x:432,y:868.2},{id:"Floor-416",x:438.1,y:868.2},{id:"Floor-417",x:444.3,y:868.2},{id:"Floor-418",x:450.4,y:868.2},{id:"Floor-419",x:456.6,y:868.2},{id:"Floor-420",x:462.7,y:868.2},{id:"Floor-421",x:468.9,y:868.2},{id:"Floor-422",x:475,y:868.2},{id:"Floor-423",x:481.2,y:868.2},{id:"Floor-424",x:487.3,y:868.2},{id:"Floor-425",x:493.5,y:868.2},{id:"Floor-426",x:499.6,y:868.2},{id:"Floor-427",x:505.8,y:868.2},{id:"Floor-428",x:511.9,y:868.2},{id:"Floor-429",x:518.1,y:868.2},{id:"Floor-430",x:524.2,y:868.2},{id:"Floor-431",x:530.4,y:868.2},{id:"Floor-432",x:536.5,y:868.2},{id:"Floor-433",x:542.7,y:868.2},{id:"Floor-434",x:548.8,y:868.2},{id:"Floor-435",x:555,y:868.2},{id:"Floor-436",x:561.1,y:868.2},{id:"Floor-437",x:567.3,y:868.2},{id:"Floor-438",x:573.4,y:868.2},{id:"Floor-439",x:579.6,y:868.2},{id:"Floor-440",x:585.7,y:868.2},{id:"Floor-441",x:591.9,y:868.2},{id:"Floor-442",x:598,y:868.2},{id:"Floor-443",x:604.2,y:868.2},{id:"Floor-444",x:610.3,y:868.2},{id:"Floor-445",x:388.9,y:859.2},{id:"Floor-446",x:395.1,y:859.2},{id:"Floor-447",x:401.2,y:859.2},{id:"Floor-448",x:407.4,y:859.2},{id:"Floor-449",x:413.5,y:859.2},{id:"Floor-450",x:419.7,y:859.2},{id:"Floor-451",x:425.8,y:859.2},{id:"Floor-452",x:432,y:859.2},{id:"Floor-453",x:438.1,y:859.2},{id:"Floor-454",x:444.3,y:859.2},{id:"Floor-455",x:450.4,y:859.2},{id:"Floor-456",x:456.6,y:859.2},{id:"Floor-457",x:462.7,y:859.2},{id:"Floor-458",x:468.9,y:859.2},{id:"Floor-459",x:475,y:859.2},{id:"Floor-460",x:481.2,y:859.2},{id:"Floor-461",x:487.3,y:859.2},{id:"Floor-462",x:493.5,y:859.2},{id:"Floor-463",x:499.6,y:859.2},{id:"Floor-464",x:505.8,y:859.2},{id:"Floor-465",x:511.9,y:859.2},{id:"Floor-466",x:518.1,y:859.2},{id:"Floor-467",x:524.2,y:859.2},{id:"Floor-468",x:530.4,y:859.2},{id:"Floor-469",x:536.5,y:859.2},{id:"Floor-470",x:542.7,y:859.2},{id:"Floor-471",x:548.8,y:859.2},{id:"Floor-472",x:555,y:859.2},{id:"Floor-473",x:561.1,y:859.2},{id:"Floor-474",x:567.3,y:859.2},{id:"Floor-475",x:573.4,y:859.2},{id:"Floor-476",x:579.6,y:859.2},{id:"Floor-477",x:585.7,y:859.2},{id:"Floor-478",x:591.9,y:859.2},{id:"Floor-479",x:598,y:859.2},{id:"Floor-480",x:604.2,y:859.2},{id:"Floor-481",x:610.3,y:859.2},{id:"Floor-482",x:388.9,y:850.2},{id:"Floor-483",x:395.1,y:850.2},{id:"Floor-484",x:401.2,y:850.2},{id:"Floor-485",x:407.4,y:850.2},{id:"Floor-486",x:413.5,y:850.2},{id:"Floor-487",x:419.7,y:850.2},{id:"Floor-488",x:425.8,y:850.2},{id:"Floor-489",x:432,y:850.2},{id:"Floor-490",x:438.1,y:850.2},{id:"Floor-491",x:444.3,y:850.2},{id:"Floor-492",x:450.4,y:850.2},{id:"Floor-493",x:456.6,y:850.2},{id:"Floor-494",x:462.7,y:850.2},{id:"Floor-495",x:468.9,y:850.2},{id:"Floor-496",x:475,y:850.2},{id:"Floor-497",x:481.2,y:850.2},{id:"Floor-498",x:487.3,y:850.2},{id:"Floor-499",x:493.5,y:850.2},{id:"Floor-500",x:499.6,y:850.2},{id:"Floor-501",x:505.8,y:850.2},{id:"Floor-502",x:511.9,y:850.2},{id:"Floor-503",x:518.1,y:850.2},{id:"Floor-504",x:524.2,y:850.2},{id:"Floor-505",x:530.4,y:850.2},{id:"Floor-506",x:536.5,y:850.2},{id:"Floor-507",x:542.7,y:850.2},{id:"Floor-508",x:548.8,y:850.2},{id:"Floor-509",x:555,y:850.2},{id:"Floor-510",x:561.1,y:850.2},{id:"Floor-511",x:567.3,y:850.2},{id:"Floor-512",x:573.4,y:850.2},{id:"Floor-513",x:579.6,y:850.2},{id:"Floor-514",x:585.7,y:850.2},{id:"Floor-515",x:591.9,y:850.2},{id:"Floor-516",x:598,y:850.2},{id:"Floor-517",x:604.2,y:850.2},{id:"Floor-518",x:610.3,y:850.2},{id:"Floor-519",x:388.9,y:841.2},{id:"Floor-520",x:395.1,y:841.2},{id:"Floor-521",x:401.2,y:841.2},{id:"Floor-522",x:407.4,y:841.2},{id:"Floor-523",x:413.5,y:841.2},{id:"Floor-524",x:419.7,y:841.2},{id:"Floor-525",x:425.8,y:841.2},{id:"Floor-526",x:432,y:841.2},{id:"Floor-527",x:438.1,y:841.2},{id:"Floor-528",x:444.3,y:841.2},{id:"Floor-529",x:450.4,y:841.2},{id:"Floor-530",x:456.6,y:841.2},{id:"Floor-531",x:462.7,y:841.2},{id:"Floor-532",x:468.9,y:841.2},{id:"Floor-533",x:475,y:841.2},{id:"Floor-534",x:481.2,y:841.2},{id:"Floor-535",x:487.3,y:841.2},{id:"Floor-536",x:493.5,y:841.2},{id:"Floor-537",x:499.6,y:841.2},{id:"Floor-538",x:505.8,y:841.2},{id:"Floor-539",x:511.9,y:841.2},{id:"Floor-540",x:518.1,y:841.2},{id:"Floor-541",x:524.2,y:841.2},{id:"Floor-542",x:530.4,y:841.2},{id:"Floor-543",x:536.5,y:841.2},{id:"Floor-544",x:542.7,y:841.2},{id:"Floor-545",x:548.8,y:841.2},{id:"Floor-546",x:555,y:841.2},{id:"Floor-547",x:561.1,y:841.2},{id:"Floor-548",x:567.3,y:841.2},{id:"Floor-549",x:573.4,y:841.2},{id:"Floor-550",x:579.6,y:841.2},{id:"Floor-551",x:585.7,y:841.2},{id:"Floor-552",x:591.9,y:841.2},{id:"Floor-553",x:598,y:841.2},{id:"Floor-554",x:604.2,y:841.2},{id:"Floor-555",x:610.3,y:841.2},{id:"Floor-556",x:388.9,y:832.2},{id:"Floor-557",x:395.1,y:832.2},{id:"Floor-558",x:401.2,y:832.2},{id:"Floor-559",x:407.4,y:832.2},{id:"Floor-560",x:413.5,y:832.2},{id:"Floor-561",x:419.7,y:832.2},{id:"Floor-562",x:425.8,y:832.2},{id:"Floor-563",x:432,y:832.2},{id:"Floor-564",x:438.1,y:832.2},{id:"Floor-565",x:444.3,y:832.2},{id:"Floor-566",x:450.4,y:832.2},{id:"Floor-567",x:456.6,y:832.2},{id:"Floor-568",x:462.7,y:832.2},{id:"Floor-569",x:468.9,y:832.2},{id:"Floor-570",x:475,y:832.2},{id:"Floor-571",x:481.2,y:832.2},{id:"Floor-572",x:487.3,y:832.2},{id:"Floor-573",x:493.5,y:832.2},{id:"Floor-574",x:499.6,y:832.2},{id:"Floor-575",x:505.8,y:832.2},{id:"Floor-576",x:511.9,y:832.2},{id:"Floor-577",x:518.1,y:832.2},{id:"Floor-578",x:524.2,y:832.2},{id:"Floor-579",x:530.4,y:832.2},{id:"Floor-580",x:536.5,y:832.2},{id:"Floor-581",x:542.7,y:832.2},{id:"Floor-582",x:548.8,y:832.2},{id:"Floor-583",x:555,y:832.2},{id:"Floor-584",x:561.1,y:832.2},{id:"Floor-585",x:567.3,y:832.2},{id:"Floor-586",x:573.4,y:832.2},{id:"Floor-587",x:579.6,y:832.2},{id:"Floor-588",x:585.7,y:832.2},{id:"Floor-589",x:591.9,y:832.2},{id:"Floor-590",x:598,y:832.2},{id:"Floor-591",x:604.2,y:832.2},{id:"Floor-592",x:610.3,y:832.2},{id:"Floor-593",x:388.9,y:823.2},{id:"Floor-594",x:395.1,y:823.2},{id:"Floor-595",x:401.2,y:823.2},{id:"Floor-596",x:407.4,y:823.2},{id:"Floor-597",x:413.5,y:823.2},{id:"Floor-598",x:419.7,y:823.2},{id:"Floor-599",x:425.8,y:823.2},{id:"Floor-600",x:432,y:823.2},{id:"Floor-601",x:438.1,y:823.2},{id:"Floor-602",x:444.3,y:823.2},{id:"Floor-603",x:450.4,y:823.2},{id:"Floor-604",x:456.6,y:823.2},{id:"Floor-605",x:462.7,y:823.2},{id:"Floor-606",x:468.9,y:823.2},{id:"Floor-607",x:475,y:823.2},{id:"Floor-608",x:481.2,y:823.2},{id:"Floor-609",x:487.3,y:823.2},{id:"Floor-610",x:493.5,y:823.2},{id:"Floor-611",x:499.6,y:823.2},{id:"Floor-612",x:505.8,y:823.2},{id:"Floor-613",x:511.9,y:823.2},{id:"Floor-614",x:518.1,y:823.2},{id:"Floor-615",x:524.2,y:823.2},{id:"Floor-616",x:530.4,y:823.2},{id:"Floor-617",x:536.5,y:823.2},{id:"Floor-618",x:542.7,y:823.2},{id:"Floor-619",x:548.8,y:823.2},{id:"Floor-620",x:555,y:823.2},{id:"Floor-621",x:561.1,y:823.2},{id:"Floor-622",x:567.3,y:823.2},{id:"Floor-623",x:573.4,y:823.2},{id:"Floor-624",x:579.6,y:823.2},{id:"Floor-625",x:585.7,y:823.2},{id:"Floor-626",x:591.9,y:823.2},{id:"Floor-627",x:598,y:823.2},{id:"Floor-628",x:604.2,y:823.2},{id:"Floor-629",x:610.3,y:823.2},{id:"Floor-630",x:388.9,y:814.2},{id:"Floor-631",x:395.1,y:814.2},{id:"Floor-632",x:401.2,y:814.2},{id:"Floor-633",x:407.4,y:814.2},{id:"Floor-634",x:413.5,y:814.2},{id:"Floor-635",x:419.7,y:814.2},{id:"Floor-636",x:425.8,y:814.2},{id:"Floor-637",x:432,y:814.2},{id:"Floor-638",x:438.1,y:814.2},{id:"Floor-639",x:444.3,y:814.2},{id:"Floor-640",x:450.4,y:814.2},{id:"Floor-641",x:456.6,y:814.2},{id:"Floor-642",x:462.7,y:814.2},{id:"Floor-643",x:468.9,y:814.2},{id:"Floor-644",x:475,y:814.2},{id:"Floor-645",x:481.2,y:814.2},{id:"Floor-646",x:487.3,y:814.2},{id:"Floor-647",x:493.5,y:814.2},{id:"Floor-648",x:499.6,y:814.2},{id:"Floor-649",x:505.8,y:814.2},{id:"Floor-650",x:511.9,y:814.2},{id:"Floor-651",x:518.1,y:814.2},{id:"Floor-652",x:524.2,y:814.2},{id:"Floor-653",x:530.4,y:814.2},{id:"Floor-654",x:536.5,y:814.2},{id:"Floor-655",x:542.7,y:814.2},{id:"Floor-656",x:548.8,y:814.2},{id:"Floor-657",x:555,y:814.2},{id:"Floor-658",x:561.1,y:814.2},{id:"Floor-659",x:567.3,y:814.2},{id:"Floor-660",x:573.4,y:814.2},{id:"Floor-661",x:579.6,y:814.2},{id:"Floor-662",x:585.7,y:814.2},{id:"Floor-663",x:591.9,y:814.2},{id:"Floor-664",x:598,y:814.2},{id:"Floor-665",x:604.2,y:814.2},{id:"Floor-666",x:610.3,y:814.2},{id:"Floor-667",x:388.9,y:805.2},{id:"Floor-668",x:395.1,y:805.2},{id:"Floor-669",x:401.2,y:805.2},{id:"Floor-670",x:407.4,y:805.2},{id:"Floor-671",x:413.5,y:805.2},{id:"Floor-672",x:419.7,y:805.2},{id:"Floor-673",x:425.8,y:805.2},{id:"Floor-674",x:432,y:805.2},{id:"Floor-675",x:438.1,y:805.2},{id:"Floor-676",x:444.3,y:805.2},{id:"Floor-677",x:450.4,y:805.2},{id:"Floor-678",x:456.6,y:805.2},{id:"Floor-679",x:462.7,y:805.2},{id:"Floor-680",x:468.9,y:805.2},{id:"Floor-681",x:475,y:805.2},{id:"Floor-682",x:481.2,y:805.2},{id:"Floor-683",x:487.3,y:805.2},{id:"Floor-684",x:493.5,y:805.2},{id:"Floor-685",x:499.6,y:805.2},{id:"Floor-686",x:505.8,y:805.2},{id:"Floor-687",x:511.9,y:805.2},{id:"Floor-688",x:518.1,y:805.2},{id:"Floor-689",x:524.2,y:805.2},{id:"Floor-690",x:530.4,y:805.2},{id:"Floor-691",x:536.5,y:805.2},{id:"Floor-692",x:542.7,y:805.2},{id:"Floor-693",x:548.8,y:805.2},{id:"Floor-694",x:555,y:805.2},{id:"Floor-695",x:561.1,y:805.2},{id:"Floor-696",x:567.3,y:805.2},{id:"Floor-697",x:573.4,y:805.2},{id:"Floor-698",x:579.6,y:805.2},{id:"Floor-699",x:585.7,y:805.2},{id:"Floor-700",x:591.9,y:805.2},{id:"Floor-701",x:598,y:805.2},{id:"Floor-702",x:604.2,y:805.2},{id:"Floor-703",x:610.3,y:805.2},{id:"Floor-704",x:388.9,y:796.2},{id:"Floor-705",x:395.1,y:796.2},{id:"Floor-706",x:401.2,y:796.2},{id:"Floor-707",x:407.4,y:796.2},{id:"Floor-708",x:413.5,y:796.2},{id:"Floor-709",x:419.7,y:796.2},{id:"Floor-710",x:425.8,y:796.2},{id:"Floor-711",x:432,y:796.2},{id:"Floor-712",x:438.1,y:796.2},{id:"Floor-713",x:444.3,y:796.2},{id:"Floor-714",x:450.4,y:796.2},{id:"Floor-715",x:456.6,y:796.2},{id:"Floor-716",x:462.7,y:796.2},{id:"Floor-717",x:468.9,y:796.2},{id:"Floor-718",x:475,y:796.2},{id:"Floor-719",x:481.2,y:796.2},{id:"Floor-720",x:487.3,y:796.2},{id:"Floor-721",x:493.5,y:796.2},{id:"Floor-722",x:499.6,y:796.2},{id:"Floor-723",x:505.8,y:796.2},{id:"Floor-724",x:511.9,y:796.2},{id:"Floor-725",x:518.1,y:796.2},{id:"Floor-726",x:524.2,y:796.2},{id:"Floor-727",x:530.4,y:796.2},{id:"Floor-728",x:536.5,y:796.2},{id:"Floor-729",x:542.7,y:796.2},{id:"Floor-730",x:548.8,y:796.2},{id:"Floor-731",x:555,y:796.2},{id:"Floor-732",x:561.1,y:796.2},{id:"Floor-733",x:567.3,y:796.2},{id:"Floor-734",x:573.4,y:796.2},{id:"Floor-735",x:579.6,y:796.2},{id:"Floor-736",x:585.7,y:796.2},{id:"Floor-737",x:591.9,y:796.2},{id:"Floor-738",x:598,y:796.2},{id:"Floor-739",x:604.2,y:796.2},{id:"Floor-740",x:610.3,y:796.2},{id:"Floor-741",x:388.9,y:787.2},{id:"Floor-742",x:395.1,y:787.2},{id:"Floor-743",x:401.2,y:787.2},{id:"Floor-744",x:407.4,y:787.2},{id:"Floor-745",x:413.5,y:787.2},{id:"Floor-746",x:419.7,y:787.2},{id:"Floor-747",x:425.8,y:787.2},{id:"Floor-748",x:432,y:787.2},{id:"Floor-749",x:438.1,y:787.2},{id:"Floor-750",x:444.3,y:787.2},{id:"Floor-751",x:450.4,y:787.2},{id:"Floor-752",x:456.6,y:787.2},{id:"Floor-753",x:462.7,y:787.2},{id:"Floor-754",x:468.9,y:787.2},{id:"Floor-755",x:475,y:787.2},{id:"Floor-756",x:481.2,y:787.2},{id:"Floor-757",x:487.3,y:787.2},{id:"Floor-758",x:493.5,y:787.2},{id:"Floor-759",x:499.6,y:787.2},{id:"Floor-760",x:505.8,y:787.2},{id:"Floor-761",x:511.9,y:787.2},{id:"Floor-762",x:518.1,y:787.2},{id:"Floor-763",x:524.2,y:787.2},{id:"Floor-764",x:530.4,y:787.2},{id:"Floor-765",x:536.5,y:787.2},{id:"Floor-766",x:542.7,y:787.2},{id:"Floor-767",x:548.8,y:787.2},{id:"Floor-768",x:555,y:787.2},{id:"Floor-769",x:561.1,y:787.2},{id:"Floor-770",x:567.3,y:787.2},{id:"Floor-771",x:573.4,y:787.2},{id:"Floor-772",x:579.6,y:787.2},{id:"Floor-773",x:585.7,y:787.2},{id:"Floor-774",x:591.9,y:787.2},{id:"Floor-775",x:598,y:787.2},{id:"Floor-776",x:604.2,y:787.2},{id:"Floor-777",x:610.3,y:787.2},{id:"Floor-778",x:388.9,y:778.2},{id:"Floor-779",x:395.1,y:778.2},{id:"Floor-780",x:401.2,y:778.2},{id:"Floor-781",x:407.4,y:778.2},{id:"Floor-782",x:413.5,y:778.2},{id:"Floor-783",x:419.7,y:778.2},{id:"Floor-784",x:425.8,y:778.2},{id:"Floor-785",x:432,y:778.2},{id:"Floor-786",x:438.1,y:778.2},{id:"Floor-787",x:444.3,y:778.2},{id:"Floor-788",x:450.4,y:778.2},{id:"Floor-789",x:456.6,y:778.2},{id:"Floor-790",x:462.7,y:778.2},{id:"Floor-791",x:468.9,y:778.2},{id:"Floor-792",x:475,y:778.2},{id:"Floor-793",x:481.2,y:778.2},{id:"Floor-794",x:487.3,y:778.2},{id:"Floor-795",x:493.5,y:778.2},{id:"Floor-796",x:499.6,y:778.2},{id:"Floor-797",x:505.8,y:778.2},{id:"Floor-798",x:511.9,y:778.2},{id:"Floor-799",x:518.1,y:778.2},{id:"Floor-800",x:524.2,y:778.2},{id:"Floor-801",x:530.4,y:778.2},{id:"Floor-802",x:536.5,y:778.2},{id:"Floor-803",x:542.7,y:778.2},{id:"Floor-804",x:548.8,y:778.2},{id:"Floor-805",x:555,y:778.2},{id:"Floor-806",x:561.1,y:778.2},{id:"Floor-807",x:567.3,y:778.2},{id:"Floor-808",x:573.4,y:778.2},{id:"Floor-809",x:579.6,y:778.2},{id:"Floor-810",x:585.7,y:778.2},{id:"Floor-811",x:591.9,y:778.2},{id:"Floor-812",x:598,y:778.2},{id:"Floor-813",x:604.2,y:778.2},{id:"Floor-814",x:610.3,y:778.2},{id:"Floor-815",x:388.9,y:769.2},{id:"Floor-816",x:395.1,y:769.2},{id:"Floor-817",x:401.2,y:769.2},{id:"Floor-818",x:407.4,y:769.2},{id:"Floor-819",x:413.5,y:769.2},{id:"Floor-820",x:419.7,y:769.2},{id:"Floor-821",x:425.8,y:769.2},{id:"Floor-822",x:432,y:769.2},{id:"Floor-823",x:438.1,y:769.2},{id:"Floor-824",x:444.3,y:769.2},{id:"Floor-825",x:450.4,y:769.2},{id:"Floor-826",x:456.6,y:769.2},{id:"Floor-827",x:462.7,y:769.2},{id:"Floor-828",x:468.9,y:769.2},{id:"Floor-829",x:475,y:769.2},{id:"Floor-830",x:481.2,y:769.2},{id:"Floor-831",x:487.3,y:769.2},{id:"Floor-832",x:493.5,y:769.2},{id:"Floor-833",x:499.6,y:769.2},{id:"Floor-834",x:505.8,y:769.2},{id:"Floor-835",x:511.9,y:769.2},{id:"Floor-836",x:518.1,y:769.2},{id:"Floor-837",x:524.2,y:769.2},{id:"Floor-838",x:530.4,y:769.2},{id:"Floor-839",x:536.5,y:769.2},{id:"Floor-840",x:542.7,y:769.2},{id:"Floor-841",x:548.8,y:769.2},{id:"Floor-842",x:555,y:769.2},{id:"Floor-843",x:561.1,y:769.2},{id:"Floor-844",x:567.3,y:769.2},{id:"Floor-845",x:573.4,y:769.2},{id:"Floor-846",x:579.6,y:769.2},{id:"Floor-847",x:585.7,y:769.2},{id:"Floor-848",x:591.9,y:769.2},{id:"Floor-849",x:598,y:769.2},{id:"Floor-850",x:604.2,y:769.2},{id:"Floor-851",x:610.3,y:769.2},{id:"Floor-852",x:388.9,y:760.2},{id:"Floor-853",x:395.1,y:760.2},{id:"Floor-854",x:401.2,y:760.2},{id:"Floor-855",x:407.4,y:760.2},{id:"Floor-856",x:413.5,y:760.2},{id:"Floor-857",x:419.7,y:760.2},{id:"Floor-858",x:425.8,y:760.2},{id:"Floor-859",x:432,y:760.2},{id:"Floor-860",x:438.1,y:760.2},{id:"Floor-861",x:444.3,y:760.2},{id:"Floor-862",x:450.4,y:760.2},{id:"Floor-863",x:456.6,y:760.2},{id:"Floor-864",x:462.7,y:760.2},{id:"Floor-865",x:468.9,y:760.2},{id:"Floor-866",x:475,y:760.2},{id:"Floor-867",x:481.2,y:760.2},{id:"Floor-868",x:487.3,y:760.2},{id:"Floor-869",x:493.5,y:760.2},{id:"Floor-870",x:499.6,y:760.2},{id:"Floor-871",x:505.8,y:760.2},{id:"Floor-872",x:511.9,y:760.2},{id:"Floor-873",x:518.1,y:760.2},{id:"Floor-874",x:524.2,y:760.2},{id:"Floor-875",x:530.4,y:760.2},{id:"Floor-876",x:536.5,y:760.2},{id:"Floor-877",x:542.7,y:760.2},{id:"Floor-878",x:548.8,y:760.2},{id:"Floor-879",x:555,y:760.2},{id:"Floor-880",x:561.1,y:760.2},{id:"Floor-881",x:567.3,y:760.2},{id:"Floor-882",x:573.4,y:760.2},{id:"Floor-883",x:579.6,y:760.2},{id:"Floor-884",x:585.7,y:760.2},{id:"Floor-885",x:591.9,y:760.2},{id:"Floor-886",x:598,y:760.2},{id:"Floor-887",x:604.2,y:760.2},{id:"Floor-888",x:610.3,y:760.2}]},{id:"G",name:"G 구역",grade:"S",floor:"1F",seats:[{id:"G-1",x:177.7,y:951},{id:"G-2",x:177.7,y:941.9},{id:"G-3",x:177.7,y:932.5},{id:"G-4",x:177.7,y:923.5},{id:"G-5",x:177.7,y:914.1},{id:"G-6",x:177.7,y:905},{id:"G-7",x:177.7,y:895.6},{id:"G-8",x:177.7,y:886.2},{id:"G-9",x:177.7,y:877.1},{id:"G-10",x:177.7,y:868.1},{id:"G-11",x:177.7,y:858.7},{id:"G-12",x:177.7,y:819},{id:"G-13",x:177.7,y:810},{id:"G-14",x:177.7,y:798.6},{id:"G-15",x:188.5,y:848.5},{id:"G-16",x:188.5,y:951},{id:"G-17",x:188.5,y:941.9},{id:"G-18",x:188.5,y:932.5},{id:"G-19",x:188.5,y:923.5},{id:"G-20",x:188.5,y:914.1},{id:"G-21",x:188.5,y:905},{id:"G-22",x:188.5,y:895.6},{id:"G-23",x:188.5,y:886.2},{id:"G-24",x:188.5,y:877.1},{id:"G-25",x:188.5,y:868.1},{id:"G-26",x:188.5,y:858.7},{id:"G-27",x:188.5,y:819},{id:"G-28",x:188.5,y:810},{id:"G-29",x:199.7,y:951},{id:"G-30",x:199.7,y:941.9},{id:"G-31",x:199.7,y:932.5},{id:"G-32",x:199.7,y:923.5},{id:"G-33",x:199.7,y:914.1},{id:"G-34",x:199.7,y:905},{id:"G-35",x:212.1,y:951},{id:"G-36",x:212.1,y:941.9},{id:"G-37",x:212.1,y:932.5},{id:"G-38",x:212.1,y:923.5},{id:"G-39",x:223.9,y:951},{id:"G-40",x:223.9,y:941.9},{id:"G-41",x:235.2,y:951}]},{id:"H",name:"H 구역",grade:"S",floor:"1F",seats:[{id:"H-1",x:763.8,y:950.7},{id:"H-2",x:776.2,y:950.7},{id:"H-3",x:776.2,y:941.2},{id:"H-4",x:776.2,y:932.2},{id:"H-5",x:786.9,y:950.7},{id:"H-6",x:786.9,y:941.2},{id:"H-7",x:786.9,y:932.2},{id:"H-8",x:786.9,y:922.7},{id:"H-9",x:799.3,y:950.7},{id:"H-10",x:799.3,y:941.2},{id:"H-11",x:799.3,y:932.2},{id:"H-12",x:799.3,y:922.7},{id:"H-13",x:799.3,y:913.6},{id:"H-14",x:799.3,y:904.2},{id:"H-15",x:810.6,y:950.7},{id:"H-16",x:810.6,y:941.2},{id:"H-17",x:810.6,y:932.2},{id:"H-18",x:810.6,y:922.7},{id:"H-19",x:810.6,y:913.6},{id:"H-20",x:810.6,y:904.2},{id:"H-21",x:810.6,y:894.4},{id:"H-22",x:810.6,y:884.9},{id:"H-23",x:810.6,y:875.9},{id:"H-24",x:810.6,y:866.5},{id:"H-25",x:810.6,y:857},{id:"H-26",x:810.6,y:827.2},{id:"H-27",x:810.6,y:818.2},{id:"H-28",x:821.3,y:827.2},{id:"H-29",x:821.3,y:950.7},{id:"H-30",x:821.3,y:941.2},{id:"H-31",x:821.3,y:932.2},{id:"H-32",x:821.3,y:922.7},{id:"H-33",x:821.3,y:913.6},{id:"H-34",x:821.3,y:904.2},{id:"H-35",x:821.3,y:894.4},{id:"H-36",x:821.3,y:884.9},{id:"H-37",x:821.3,y:875.9},{id:"H-38",x:821.3,y:866.5},{id:"H-39",x:821.3,y:818.2},{id:"H-40",x:821.3,y:809.1}]},{id:"I1",name:"I1 구역",grade:"A",floor:"2F",seats:[{id:"I1-1",x:271.4,y:170.4},{id:"I1-2",x:276.1,y:163.7},{id:"I1-3",x:280.8,y:157.2},{id:"I1-4",x:283.5,y:174.6},{id:"I1-5",x:285.4,y:150.7},{id:"I1-6",x:288.1,y:167.8},{id:"I1-7",x:291.2,y:186.9},{id:"I1-8",x:292.5,y:161.2},{id:"I1-9",x:295.7,y:180.5},{id:"I1-10",x:300.6,y:199.9},{id:"I1-11",x:300.4,y:173.8},{id:"I1-12",x:302.8,y:217},{id:"I1-13",x:305.4,y:193.2},{id:"I1-14",x:307.4,y:210.5},{id:"I1-15",x:309.8,y:186.7},{id:"I1-16",x:311.9,y:203.8},{id:"I1-17",x:313.1,y:138.7},{id:"I1-18",x:313,y:122.6},{id:"I1-19",x:313,y:106.9},{id:"I1-20",x:316.6,y:196.9},{id:"I1-21",x:319.7,y:244.3},{id:"I1-22",x:319.7,y:154},{id:"I1-23",x:319.6,y:138.7},{id:"I1-24",x:319.5,y:122.6},{id:"I1-25",x:319.4,y:106.9},{id:"I1-26",x:324.3,y:237.5},{id:"I1-27",x:326.2,y:170.5},{id:"I1-28",x:326.1,y:154},{id:"I1-29",x:326.1,y:138.7},{id:"I1-30",x:326,y:122.6},{id:"I1-31",x:325.9,y:106.9},{id:"I1-32",x:327.7,y:255.6},{id:"I1-33",x:328.8,y:231.1},{id:"I1-34",x:332.3,y:249.2},{id:"I1-35",x:333.6,y:224.4},{id:"I1-36",x:333.3,y:186.2},{id:"I1-37",x:333.3,y:170.5},{id:"I1-38",x:333.2,y:154},{id:"I1-39",x:333.1,y:138.7},{id:"I1-40",x:333,y:122.6},{id:"I1-41",x:333,y:106.8},{id:"I1-42",x:332.9,y:90.7},{id:"I1-43",x:335.2,y:266.4},{id:"I1-44",x:337.1,y:242.4},{id:"I1-45",x:340,y:259.7},{id:"I1-46",x:339.2,y:122.5},{id:"I1-47",x:339.1,y:90.7},{id:"I1-48",x:339.8,y:186.2},{id:"I1-49",x:339.7,y:170.5},{id:"I1-50",x:339.7,y:154},{id:"I1-51",x:339.6,y:138.6},{id:"I1-52",x:339.4,y:106.8},{id:"I1-53",x:341.8,y:235.7},{id:"I1-54",x:343.9,y:276.5},{id:"I1-55",x:344.6,y:253.3},{id:"I1-56",x:346.1,y:216.1},{id:"I1-57",x:346.3,y:186.1},{id:"I1-58",x:345.9,y:170.4},{id:"I1-59",x:345.9,y:153.9},{id:"I1-60",x:345.8,y:138.6},{id:"I1-61",x:345.7,y:122.5},{id:"I1-62",x:345.6,y:106.8},{id:"I1-63",x:345.6,y:90.7},{id:"I1-64",x:348.5,y:269.9},{id:"I1-65",x:352.2,y:287.6},{id:"I1-66",x:352.4,y:231.8},{id:"I1-67",x:352.5,y:186.1},{id:"I1-68",x:352.4,y:170.4},{id:"I1-69",x:352.3,y:153.9},{id:"I1-70",x:352.3,y:138.6},{id:"I1-71",x:352.2,y:122.5},{id:"I1-72",x:352.1,y:106.8},{id:"I1-73",x:352.1,y:90.7},{id:"I1-74",x:352.7,y:247.9},{id:"I1-75",x:352.6,y:216.1},{id:"I1-76",x:356.7,y:281.1},{id:"I1-77",x:359.1,y:231.8},{id:"I1-78",x:359.3,y:186.1},{id:"I1-79",x:359.2,y:170.4},{id:"I1-80",x:359.1,y:153.9},{id:"I1-81",x:359,y:138.6},{id:"I1-82",x:359,y:122.5},{id:"I1-83",x:358.9,y:106.8},{id:"I1-84",x:358.8,y:90.7},{id:"I1-85",x:359.6,y:263.6},{id:"I1-86",x:359.5,y:247.9},{id:"I1-87",x:359.4,y:216.1},{id:"I1-88",x:366.7,y:279.3},{id:"I1-89",x:366.6,y:263.6},{id:"I1-90",x:366.5,y:247.9},{id:"I1-91",x:366.5,y:231.8},{id:"I1-92",x:366.4,y:216.1},{id:"I1-93",x:366.6,y:186.1},{id:"I1-94",x:366.5,y:170.4},{id:"I1-95",x:366.4,y:153.9},{id:"I1-96",x:366.4,y:138.6},{id:"I1-97",x:366,y:122.4},{id:"I1-98",x:366.2,y:106.7},{id:"I1-99",x:365.9,y:90.6},{id:"I1-100",x:373.5,y:279.3},{id:"I1-101",x:373.4,y:263.6},{id:"I1-102",x:373.3,y:247.9},{id:"I1-103",x:373.2,y:231.8},{id:"I1-104",x:373.2,y:216.1},{id:"I1-105",x:373.3,y:186.1},{id:"I1-106",x:373,y:170.3},{id:"I1-107",x:372.9,y:153.8},{id:"I1-108",x:372.8,y:138.5},{id:"I1-109",x:372.8,y:122.4},{id:"I1-110",x:372.7,y:106.7},{id:"I1-111",x:372.6,y:90.6},{id:"I1-112",x:379.2,y:122.4},{id:"I1-113",x:379.1,y:90.6},{id:"I1-114",x:380.2,y:279.3},{id:"I1-115",x:380.1,y:263.6},{id:"I1-116",x:380.1,y:247.8},{id:"I1-117",x:379.7,y:231.7},{id:"I1-118",x:379.9,y:216},{id:"I1-119",x:379.8,y:186},{id:"I1-120",x:379.7,y:170.3},{id:"I1-121",x:379.7,y:153.8},{id:"I1-122",x:379.6,y:138.5},{id:"I1-123",x:379.5,y:106.7},{id:"I1-124",x:386.2,y:170.3},{id:"I1-125",x:386.1,y:153.8},{id:"I1-126",x:386.1,y:138.5},{id:"I1-127",x:386,y:122.4},{id:"I1-128",x:385.9,y:106.7},{id:"I1-129",x:385.9,y:90.6},{id:"I1-130",x:387,y:279.2},{id:"I1-131",x:386.9,y:263.5},{id:"I1-132",x:386.8,y:247.8},{id:"I1-133",x:386.5,y:231.7},{id:"I1-134",x:386.7,y:216},{id:"I1-135",x:386.6,y:186},{id:"I1-136",x:393,y:231.7},{id:"I1-137",x:393.1,y:186},{id:"I1-138",x:393,y:170.3},{id:"I1-139",x:392.9,y:153.8},{id:"I1-140",x:392.8,y:138.5},{id:"I1-141",x:392.8,y:122.4},{id:"I1-142",x:392.7,y:106.7},{id:"I1-143",x:392.6,y:90.5},{id:"I1-144",x:393.5,y:279.2},{id:"I1-145",x:393.4,y:263.5},{id:"I1-146",x:393.3,y:247.8},{id:"I1-147",x:393.2,y:216},{id:"I1-148",x:399.7,y:231.7},{id:"I1-149",x:399.8,y:186},{id:"I1-150",x:399.7,y:170.3},{id:"I1-151",x:399.7,y:153.8},{id:"I1-152",x:399.6,y:138.4},{id:"I1-153",x:399.5,y:122.3},{id:"I1-154",x:399.5,y:106.6},{id:"I1-155",x:399.4,y:90.5},{id:"I1-156",x:400.2,y:279.2},{id:"I1-157",x:400.1,y:263.5},{id:"I1-158",x:400.1,y:247.8},{id:"I1-159",x:399.9,y:216},{id:"I1-160",x:406.7,y:279.2},{id:"I1-161",x:406.6,y:263.5},{id:"I1-162",x:406.6,y:247.8},{id:"I1-163",x:406.5,y:231.7},{id:"I1-164",x:406.4,y:215.9},{id:"I1-165",x:406.6,y:185.9},{id:"I1-166",x:406.5,y:170.2},{id:"I1-167",x:406.4,y:153.7},{id:"I1-168",x:406.4,y:138.4},{id:"I1-169",x:406,y:122.3},{id:"I1-170",x:406.2,y:106.6},{id:"I1-171",x:405.9,y:90.5},{id:"I1-172",x:413.5,y:279.2},{id:"I1-173",x:413.4,y:263.5},{id:"I1-174",x:413.3,y:247.7},{id:"I1-175",x:413,y:231.6},{id:"I1-176",x:413.2,y:215.9},{id:"I1-177",x:413.1,y:185.9},{id:"I1-178",x:413,y:170.2},{id:"I1-179",x:412.9,y:153.7},{id:"I1-180",x:412.8,y:138.4},{id:"I1-181",x:412.8,y:122.3},{id:"I1-182",x:412.7,y:106.6},{id:"I1-183",x:412.6,y:90.5},{id:"I1-184",x:326.1,y:186.2}]},{id:"I2",name:"I2 구역",grade:"A",floor:"2F",seats:[{id:"I2-1",x:443.5,y:247.1},{id:"I2-2",x:443.5,y:156},{id:"I2-3",x:443.5,y:278.6},{id:"I2-4",x:443.5,y:262.9},{id:"I2-5",x:443.5,y:231},{id:"I2-6",x:443.5,y:215.7},{id:"I2-7",x:443.5,y:187.4},{id:"I2-8",x:443.5,y:171.7},{id:"I2-9",x:443.5,y:140.3},{id:"I2-10",x:443.5,y:124.6},{id:"I2-11",x:443.5,y:108.9},{id:"I2-12",x:450,y:247.1},{id:"I2-13",x:450,y:187.4},{id:"I2-14",x:450,y:156},{id:"I2-15",x:450,y:140.3},{id:"I2-16",x:450,y:278.6},{id:"I2-17",x:450,y:262.9},{id:"I2-18",x:450,y:231},{id:"I2-19",x:450,y:215.7},{id:"I2-20",x:450,y:171.7},{id:"I2-21",x:450,y:124.6},{id:"I2-22",x:450,y:108.9},{id:"I2-23",x:456.7,y:247.1},{id:"I2-24",x:456.7,y:187.4},{id:"I2-25",x:456.7,y:156},{id:"I2-26",x:456.7,y:140.3},{id:"I2-27",x:456.7,y:278.6},{id:"I2-28",x:456.7,y:262.9},{id:"I2-29",x:456.7,y:231},{id:"I2-30",x:456.7,y:215.7},{id:"I2-31",x:456.7,y:171.7},{id:"I2-32",x:456.7,y:124.6},{id:"I2-33",x:456.7,y:108.9},{id:"I2-34",x:463.2,y:278.6},{id:"I2-35",x:463.2,y:247.1},{id:"I2-36",x:463.2,y:231},{id:"I2-37",x:463.2,y:187.4},{id:"I2-38",x:463.2,y:156},{id:"I2-39",x:463.2,y:140.3},{id:"I2-40",x:463.2,y:262.9},{id:"I2-41",x:463.2,y:215.7},{id:"I2-42",x:463.2,y:171.7},{id:"I2-43",x:463.2,y:124.6},{id:"I2-44",x:463.2,y:108.9},{id:"I2-45",x:470,y:156},{id:"I2-46",x:470,y:278.6},{id:"I2-47",x:470,y:247.1},{id:"I2-48",x:470,y:231},{id:"I2-49",x:470,y:187.4},{id:"I2-50",x:470,y:171.7},{id:"I2-51",x:470,y:140.3},{id:"I2-52",x:470,y:124.6},{id:"I2-53",x:470,y:262.9},{id:"I2-54",x:470,y:215.7},{id:"I2-55",x:470,y:108.9},{id:"I2-56",x:476.7,y:247.1},{id:"I2-57",x:476.7,y:156},{id:"I2-58",x:476.7,y:278.6},{id:"I2-59",x:476.7,y:231},{id:"I2-60",x:476.7,y:187.4},{id:"I2-61",x:476.7,y:171.7},{id:"I2-62",x:476.7,y:140.3},{id:"I2-63",x:476.7,y:124.6},{id:"I2-64",x:476.7,y:108.9},{id:"I2-65",x:476.7,y:262.9},{id:"I2-66",x:476.7,y:215.7},{id:"I2-67",x:483.5,y:247.1},{id:"I2-68",x:483.5,y:156},{id:"I2-69",x:483.5,y:278.6},{id:"I2-70",x:483.5,y:262.9},{id:"I2-71",x:483.5,y:231},{id:"I2-72",x:483.5,y:215.7},{id:"I2-73",x:483.5,y:187.4},{id:"I2-74",x:483.5,y:171.7},{id:"I2-75",x:483.5,y:140.3},{id:"I2-76",x:483.5,y:124.6},{id:"I2-77",x:483.5,y:108.9},{id:"I2-78",x:490,y:247.1},{id:"I2-79",x:490,y:187.4},{id:"I2-80",x:490,y:156},{id:"I2-81",x:490,y:140.3},{id:"I2-82",x:490,y:278.6},{id:"I2-83",x:490,y:262.9},{id:"I2-84",x:490,y:231},{id:"I2-85",x:490,y:215.7},{id:"I2-86",x:490,y:171.7},{id:"I2-87",x:490,y:124.6},{id:"I2-88",x:490,y:108.9},{id:"I2-89",x:496.7,y:247.1},{id:"I2-90",x:496.7,y:231},{id:"I2-91",x:496.7,y:187.4},{id:"I2-92",x:496.7,y:156},{id:"I2-93",x:496.7,y:140.3},{id:"I2-94",x:496.7,y:278.6},{id:"I2-95",x:496.7,y:262.9},{id:"I2-96",x:496.7,y:215.7},{id:"I2-97",x:496.7,y:171.7},{id:"I2-98",x:496.7,y:124.6},{id:"I2-99",x:496.7,y:108.9},{id:"I2-100",x:503.2,y:156},{id:"I2-101",x:503.2,y:278.6},{id:"I2-102",x:503.2,y:247.1},{id:"I2-103",x:503.2,y:231},{id:"I2-104",x:503.2,y:187.4},{id:"I2-105",x:503.2,y:140.3},{id:"I2-106",x:503.2,y:262.9},{id:"I2-107",x:503.2,y:215.7},{id:"I2-108",x:503.2,y:171.7},{id:"I2-109",x:503.2,y:124.6},{id:"I2-110",x:503.2,y:108.9},{id:"I2-111",x:510,y:156},{id:"I2-112",x:510,y:278.6},{id:"I2-113",x:510,y:247.1},{id:"I2-114",x:510,y:231},{id:"I2-115",x:510,y:187.4},{id:"I2-116",x:510,y:171.7},{id:"I2-117",x:510,y:140.3},{id:"I2-118",x:510,y:124.6},{id:"I2-119",x:510,y:108.9},{id:"I2-120",x:510,y:262.9},{id:"I2-121",x:510,y:215.7},{id:"I2-122",x:516.7,y:247.1},{id:"I2-123",x:516.7,y:156},{id:"I2-124",x:516.7,y:278.6},{id:"I2-125",x:516.7,y:231},{id:"I2-126",x:516.7,y:187.4},{id:"I2-127",x:516.7,y:171.7},{id:"I2-128",x:516.7,y:140.3},{id:"I2-129",x:516.7,y:124.6},{id:"I2-130",x:516.7,y:108.9},{id:"I2-131",x:516.7,y:262.9},{id:"I2-132",x:516.7,y:215.7},{id:"I2-133",x:523.2,y:247.1},{id:"I2-134",x:523.2,y:156},{id:"I2-135",x:523.2,y:140.3},{id:"I2-136",x:523.2,y:278.6},{id:"I2-137",x:523.2,y:262.9},{id:"I2-138",x:523.2,y:231},{id:"I2-139",x:523.2,y:215.7},{id:"I2-140",x:523.2,y:187.4},{id:"I2-141",x:523.2,y:171.7},{id:"I2-142",x:523.2,y:124.6},{id:"I2-143",x:523.2,y:108.9},{id:"I2-144",x:530,y:247.1},{id:"I2-145",x:530,y:187.4},{id:"I2-146",x:530,y:156},{id:"I2-147",x:530,y:140.3},{id:"I2-148",x:530,y:278.6},{id:"I2-149",x:530,y:262.9},{id:"I2-150",x:530,y:231},{id:"I2-151",x:530,y:215.7},{id:"I2-152",x:530,y:171.7},{id:"I2-153",x:530,y:124.6},{id:"I2-154",x:530,y:108.9},{id:"I2-155",x:536.7,y:247.1},{id:"I2-156",x:536.7,y:231},{id:"I2-157",x:536.7,y:187.4},{id:"I2-158",x:536.7,y:156},{id:"I2-159",x:536.7,y:140.3},{id:"I2-160",x:536.7,y:278.6},{id:"I2-161",x:536.7,y:262.9},{id:"I2-162",x:536.7,y:215.7},{id:"I2-163",x:536.7,y:171.7},{id:"I2-164",x:536.7,y:124.6},{id:"I2-165",x:536.7,y:108.9},{id:"I2-166",x:543.2,y:156},{id:"I2-167",x:543.2,y:278.6},{id:"I2-168",x:543.2,y:247.1},{id:"I2-169",x:543.2,y:231},{id:"I2-170",x:543.2,y:187.4},{id:"I2-171",x:543.2,y:140.3},{id:"I2-172",x:543.2,y:262.9},{id:"I2-173",x:543.2,y:215.7},{id:"I2-174",x:543.2,y:171.7},{id:"I2-175",x:543.2,y:124.6},{id:"I2-176",x:543.2,y:108.9},{id:"I2-177",x:550,y:156},{id:"I2-178",x:550,y:278.6},{id:"I2-179",x:550,y:247.1},{id:"I2-180",x:550,y:231},{id:"I2-181",x:550,y:187.4},{id:"I2-182",x:550,y:171.7},{id:"I2-183",x:550,y:140.3},{id:"I2-184",x:550,y:124.6},{id:"I2-185",x:550,y:108.9},{id:"I2-186",x:550,y:262.9},{id:"I2-187",x:550,y:215.7},{id:"I2-188",x:556.7,y:247.1},{id:"I2-189",x:556.7,y:156},{id:"I2-190",x:556.7,y:278.6},{id:"I2-191",x:556.7,y:262.9},{id:"I2-192",x:556.7,y:231},{id:"I2-193",x:556.7,y:215.7},{id:"I2-194",x:556.7,y:187.4},{id:"I2-195",x:556.7,y:171.7},{id:"I2-196",x:556.7,y:140.3},{id:"I2-197",x:556.7,y:124.6},{id:"I2-198",x:556.7,y:108.9}]},{id:"I3",name:"I3 구역",grade:"A",floor:"2F",seats:[{id:"I3-1",x:587.1,y:278.8},{id:"I3-2",x:587,y:263.1},{id:"I3-3",x:586.9,y:247.4},{id:"I3-4",x:587.1,y:231.3},{id:"I3-5",x:586.8,y:215.6},{id:"I3-6",x:586,y:185.5},{id:"I3-7",x:586,y:169.8},{id:"I3-8",x:585.9,y:153.3},{id:"I3-9",x:585.8,y:137.9},{id:"I3-10",x:585.7,y:121.8},{id:"I3-11",x:585.7,y:106.1},{id:"I3-12",x:585.6,y:90},{id:"I3-13",x:593.5,y:278.8},{id:"I3-14",x:593.5,y:263.1},{id:"I3-15",x:593.4,y:247.4},{id:"I3-16",x:593.3,y:215.6},{id:"I3-17",x:593.6,y:231.3},{id:"I3-18",x:592.5,y:185.4},{id:"I3-19",x:592.7,y:169.7},{id:"I3-20",x:592.6,y:153.2},{id:"I3-21",x:592.6,y:137.9},{id:"I3-22",x:592.5,y:121.8},{id:"I3-23",x:592.4,y:106.1},{id:"I3-24",x:592.4,y:90},{id:"I3-25",x:600.3,y:278.8},{id:"I3-26",x:600.2,y:263.1},{id:"I3-27",x:600.2,y:247.3},{id:"I3-28",x:600,y:215.5},{id:"I3-29",x:600.4,y:231.2},{id:"I3-30",x:599.3,y:185.4},{id:"I3-31",x:599.2,y:169.7},{id:"I3-32",x:599.1,y:153.2},{id:"I3-33",x:599.1,y:137.9},{id:"I3-34",x:599.3,y:121.8},{id:"I3-35",x:598.9,y:106.1},{id:"I3-36",x:599.1,y:90},{id:"I3-37",x:607.1,y:278.7},{id:"I3-38",x:607,y:263},{id:"I3-39",x:606.9,y:247.3},{id:"I3-40",x:606.9,y:231.2},{id:"I3-41",x:606.8,y:215.5},{id:"I3-42",x:605.8,y:185.4},{id:"I3-43",x:606,y:169.7},{id:"I3-44",x:605.9,y:153.2},{id:"I3-45",x:605.8,y:137.9},{id:"I3-46",x:605.7,y:121.8},{id:"I3-47",x:605.7,y:106.1},{id:"I3-48",x:605.6,y:90},{id:"I3-49",x:613.8,y:278.7},{id:"I3-50",x:613.8,y:263},{id:"I3-51",x:613.7,y:247.3},{id:"I3-52",x:613.6,y:231.2},{id:"I3-53",x:613.5,y:215.5},{id:"I3-54",x:612.5,y:185.4},{id:"I3-55",x:612.4,y:169.7},{id:"I3-56",x:612.4,y:153.2},{id:"I3-57",x:612.3,y:137.9},{id:"I3-58",x:612.2,y:106},{id:"I3-59",x:612.5,y:121.8},{id:"I3-60",x:612.4,y:89.9},{id:"I3-61",x:620.3,y:278.7},{id:"I3-62",x:620.2,y:263},{id:"I3-63",x:620.2,y:247.3},{id:"I3-64",x:620.4,y:231.2},{id:"I3-65",x:620,y:215.5},{id:"I3-66",x:619.3,y:185.4},{id:"I3-67",x:619.2,y:169.7},{id:"I3-68",x:619.1,y:153.2},{id:"I3-69",x:619.1,y:137.8},{id:"I3-70",x:619,y:121.7},{id:"I3-71",x:618.9,y:106},{id:"I3-72",x:618.8,y:89.9},{id:"I3-73",x:627.1,y:278.7},{id:"I3-74",x:627,y:263},{id:"I3-75",x:626.9,y:247.3},{id:"I3-76",x:627.1,y:231.2},{id:"I3-77",x:626.8,y:215.4},{id:"I3-78",x:626,y:185.3},{id:"I3-79",x:626,y:169.6},{id:"I3-80",x:625.9,y:153.1},{id:"I3-81",x:625.8,y:137.8},{id:"I3-82",x:625.7,y:121.7},{id:"I3-83",x:625.7,y:106},{id:"I3-84",x:625.6,y:89.9},{id:"I3-85",x:633.6,y:278.7},{id:"I3-86",x:633.5,y:262.9},{id:"I3-87",x:633.4,y:247.2},{id:"I3-88",x:633.3,y:215.4},{id:"I3-89",x:633.6,y:231.1},{id:"I3-90",x:632.5,y:185.3},{id:"I3-91",x:632.4,y:169.6},{id:"I3-92",x:632.4,y:153.1},{id:"I3-93",x:632.6,y:137.8},{id:"I3-94",x:632.5,y:121.7},{id:"I3-95",x:632.2,y:106},{id:"I3-96",x:632.4,y:89.9},{id:"I3-97",x:640.8,y:262.9},{id:"I3-98",x:640.7,y:247.2},{id:"I3-99",x:640.6,y:215.4},{id:"I3-100",x:640.9,y:231.1},{id:"I3-101",x:639.8,y:185.3},{id:"I3-102",x:639.8,y:169.6},{id:"I3-103",x:639.7,y:153.1},{id:"I3-104",x:639.6,y:137.8},{id:"I3-105",x:639.6,y:121.7},{id:"I3-106",x:639.5,y:106},{id:"I3-107",x:639.4,y:89.9},{id:"I3-108",x:644.2,y:282.1},{id:"I3-109",x:647.5,y:247.2},{id:"I3-110",x:647.4,y:231.1},{id:"I3-111",x:647.3,y:215.4},{id:"I3-112",x:646.3,y:185.3},{id:"I3-113",x:648.9,y:288.6},{id:"I3-114",x:646.5,y:169.6},{id:"I3-115",x:646.5,y:153.1},{id:"I3-116",x:646.4,y:137.8},{id:"I3-117",x:646.3,y:121.6},{id:"I3-118",x:646.2,y:105.9},{id:"I3-119",x:646.2,y:89.8},{id:"I3-120",x:652.3,y:270.8},{id:"I3-121",x:653.8,y:215.4},{id:"I3-122",x:653.1,y:185.3},{id:"I3-123",x:653,y:169.5},{id:"I3-124",x:652.9,y:153},{id:"I3-125",x:652.9,y:137.7},{id:"I3-126",x:652.8,y:121.6},{id:"I3-127",x:652.7,y:105.9},{id:"I3-128",x:652.6,y:89.8},{id:"I3-129",x:656.2,y:254.3},{id:"I3-130",x:657.1,y:277.8},{id:"I3-131",x:658.9,y:237},{id:"I3-132",x:660.9,y:260.9},{id:"I3-133",x:659.3,y:185.2},{id:"I3-134",x:659.2,y:169.5},{id:"I3-135",x:659.1,y:153},{id:"I3-136",x:659.1,y:137.7},{id:"I3-137",x:659,y:121.6},{id:"I3-138",x:658.9,y:105.9},{id:"I3-139",x:658.8,y:89.8},{id:"I3-140",x:663.5,y:243.4},{id:"I3-141",x:665.5,y:267.4},{id:"I3-142",x:666.7,y:225.3},{id:"I3-143",x:665.8,y:185.2},{id:"I3-144",x:665.7,y:169.5},{id:"I3-145",x:665.6,y:153},{id:"I3-146",x:665.5,y:137.7},{id:"I3-147",x:665.7,y:121.6},{id:"I3-148",x:665.4,y:105.9},{id:"I3-149",x:665.6,y:89.8},{id:"I3-150",x:668.3,y:250.1},{id:"I3-151",x:671.6,y:232},{id:"I3-152",x:673.1,y:256.7},{id:"I3-153",x:672.7,y:169.5},{id:"I3-154",x:672.7,y:153},{id:"I3-155",x:672.6,y:137.7},{id:"I3-156",x:672.5,y:121.6},{id:"I3-157",x:672.4,y:105.9},{id:"I3-158",x:676.3,y:238.7},{id:"I3-159",x:680.8,y:245.3},{id:"I3-160",x:679.1,y:153},{id:"I3-161",x:679.1,y:137.6},{id:"I3-162",x:679,y:121.5},{id:"I3-163",x:678.9,y:105.8},{id:"I3-164",x:683.6,y:198},{id:"I3-165",x:685.5,y:137.6},{id:"I3-166",x:685.5,y:121.5},{id:"I3-167",x:685.4,y:105.8},{id:"I3-168",x:688.2,y:204.6},{id:"I3-169",x:690.2,y:187.5},{id:"I3-170",x:692.9,y:211.4},{id:"I3-171",x:695,y:194.1},{id:"I3-172",x:697.6,y:217.9},{id:"I3-173",x:699.6,y:200.7},{id:"I3-174",x:699.5,y:174.6},{id:"I3-175",x:704.3,y:181.2},{id:"I3-176",x:707.3,y:162},{id:"I3-177",x:709.1,y:187.7},{id:"I3-178",x:712,y:168.6},{id:"I3-179",x:714.3,y:151.3},{id:"I3-180",x:716.4,y:175.2},{id:"I3-181",x:719.1,y:158},{id:"I3-182",x:723.7,y:164.4},{id:"I3-183",x:728.5,y:170.9}]}]},Na=Te.zones.filter(e=>e.id!=="Floor"),Lo=Na.reduce((e,t)=>e+t.seats.length,0),ot=888,Mo=Lo+ot;function oe(e,t){const i=new Date(e);return i.setDate(i.getDate()+t),i}function ee(e){return e.toISOString()}const ne=new Date,No=[{key:"VIP",name:"VIP석",price:198e3},{key:"R",name:"R석",price:154e3},{key:"S",name:"S석",price:121e3},{key:"A",name:"A석",price:88e3}],De={crimson:"linear-gradient(155deg,#3a0a0d 0%, #E31B23 55%, #7a0e14 100%)",rose:"linear-gradient(155deg,#7a0e14 0%, #E31B23 50%, #2b0406 100%)",iceChrome:"linear-gradient(155deg,#0a1420 0%, #2c4a63 45%, #a9c3d4 100%)",flameMono:"linear-gradient(160deg,#050505 0%, #1c1c1c 45%, #8a2f22 100%)",stoneWarm:"linear-gradient(155deg,#382f22 0%, #8f7a5c 55%, #e6d9c2 100%)",neonNight:"linear-gradient(155deg,#14001c 0%, #6a1f72 45%, #2451c9 100%)",editorialRB:"linear-gradient(160deg,#050505 0%, #050505 55%, #c81e2c 120%)",galaxyPurple:"linear-gradient(155deg,#0a0515 0%, #2d1854 45%, #6b3fa0 100%)",pinkNoir:"linear-gradient(155deg,#120010 0%, #4a0033 55%, #ff1493 100%)",royalNavy:"linear-gradient(155deg,#0a1628 0%, #1a3a5c 50%, #c9a84c 100%)",amberNight:"linear-gradient(155deg,#1a0f00 0%, #8b5e3c 50%, #0a1932 100%)",burgundyGold:"linear-gradient(155deg,#2d0a14 0%, #7a0e28 50%, #c9a84c 100%)"},Oo={BTS:"/images/posters/poster-bts.png",BLACKPINK:"/images/posters/poster-blackpink.png",SEVENTEEN:"/images/posters/poster-seventeen.png",NewJeans:"/images/posters/poster-newjeans.png",IVE:"/images/posters/poster-ive.png",aespa:"/images/posters/poster-aespa.png",TWICE:"/images/posters/poster-twice.png",EXO:"/images/posters/poster-exo.png","Stray Kids":"/images/posters/poster-straykids.png","NCT DREAM":"/images/posters/poster-nctdream.png","(G)I-DLE":"/images/posters/poster-gidle.png","LE SSERAFIM":"/images/posters/poster-lesserafim.png",RIIZE:"/images/posters/poster-riize.png","Red Velvet":"/images/posters/poster-redvelvet.png","TOMORROW X TOGETHER":"/images/posters/poster-tomorrow.png",TXT:"/images/posters/poster-tomorrow.png",IU:"/images/posters/poster-iu.png",박효신:"/images/posters/poster-parkhyoshin.png",성시경:"/images/posters/poster-sungsikyung.png",TAEYEON:"/images/posters/poster-taeyeon.png",윤하:"/images/posters/poster-younha.png",AILEE:"/images/posters/poster-ailee.png",김범수:"/images/posters/poster-kimbumsu.png",이승철:"/images/posters/poster-leeseungchul.png",Heize:"/images/posters/poster-heize.png",ZICO:"/images/posters/poster-zico.png",임영웅:"/images/posters/poster-limyoungwoong.png",송가인:"/images/posters/poster-songgain.png",영탁:"/images/posters/poster-youngtak.png",이찬원:"/images/posters/poster-leechanwon.png",장윤정:"/images/posters/poster-jangyunjeong.png",AKMU:"/images/posters/poster-akmu.png",이적:"/images/posters/poster-leejuck.png",백예린:"/images/posters/poster-baekyerin.png",선우정아:"/images/posters/poster-sunwoojunga.png",폴킴:"/images/posters/poster-paulkim.png",YB:"/images/posters/poster-yb.png",자우림:"/images/posters/poster-jaurim.png",DAY6:"/images/posters/poster-day6.png",잔나비:"/images/posters/poster-jannabi.png",NELL:"/images/posters/poster-nell.png"},qt=["/images/posters/poster-bts.png","/images/posters/poster-blackpink.png","/images/posters/poster-seventeen.png","/images/posters/poster-newjeans.png","/images/posters/poster-ive.png","/images/posters/poster-aespa.png","/images/posters/poster-twice.png","/images/posters/poster-exo.png","/images/posters/poster-straykids.png","/images/posters/poster-nctdream.png","/images/posters/poster-gidle.png","/images/posters/poster-lesserafim.png","/images/posters/poster-riize.png","/images/posters/poster-redvelvet.png","/images/posters/poster-tomorrow.png","/images/posters/poster-iu.png","/images/posters/poster-parkhyoshin.png","/images/posters/poster-sungsikyung.png","/images/posters/poster-taeyeon.png","/images/posters/poster-younha.png","/images/posters/poster-ailee.png","/images/posters/poster-kimbumsu.png","/images/posters/poster-leeseungchul.png","/images/posters/poster-heize.png","/images/posters/poster-zico.png","/images/posters/poster-limyoungwoong.png","/images/posters/poster-songgain.png","/images/posters/poster-youngtak.png","/images/posters/poster-leechanwon.png","/images/posters/poster-jangyunjeong.png","/images/posters/poster-akmu.png","/images/posters/poster-leejuck.png","/images/posters/poster-baekyerin.png","/images/posters/poster-sunwoojunga.png","/images/posters/poster-paulkim.png","/images/posters/poster-yb.png","/images/posters/poster-jaurim.png","/images/posters/poster-day6.png","/images/posters/poster-jannabi.png","/images/posters/poster-nell.png"];function je(e){if(!e)return qt[0];const t=String(e);for(const[a,n]of Object.entries(Oo))if(t.includes(a)||t.toLowerCase().includes(a.toLowerCase()))return n;let i=0;for(let a=0;a<t.length;a++)i=(i<<5)-i+t.charCodeAt(a)|0;return qt[Math.abs(i)%qt.length]}const hi=[{id:"bts-2027-eternal",artist:"BTS",title:"2027 WORLD TOUR [BEYOND THE SCENE : ETERNAL]",dateStart:ee(oe(ne,9)),dateEnd:ee(oe(ne,10)),venue:"올림픽주경기장",totalSeats:4e4,grad:De.galaxyPurple,bookingOpenAt:ee(new Date(Date.now()+40*1e3)),grades:[{key:"VIP",name:"VIP석",price:22e4},{key:"R",name:"R석",price:176e3},{key:"S",name:"S석",price:143e3},{key:"A",name:"A석",price:99e3}],desc:"방탄소년단 BTS의 2027년 월드투어 서울 공연. 7명의 멤버가 함께하는 역대급 스타디움 투어.",hot:!0,views:312504},{id:"iu-2027-goldenhour",artist:"IU",title:"2027 CONCERT [THE GOLDEN HOUR : CURTAIN CALL]",dateStart:ee(oe(ne,-2)),dateEnd:ee(oe(ne,-1)),venue:"올림픽주경기장",totalSeats:3e4,grad:De.neonNight,bookingOpenAt:ee(oe(ne,-10)),grades:[{key:"VIP",name:"VIP석",price:198e3},{key:"R",name:"R석",price:154e3},{key:"S",name:"S석",price:121e3},{key:"A",name:"A석",price:88e3}],desc:"솔로 아티스트 IU의 단독 콘서트. 황금빛 조명 아래 펼쳐지는 감동적인 무대.",hot:!0,views:267891},{id:"skz-2026-unchained",artist:"Stray Kids",title:"2026 WORLD TOUR [THUNDEROUS : UNCHAINED]",dateStart:ee(oe(ne,3)),dateEnd:ee(oe(ne,4)),venue:"고척스카이돔",totalSeats:22e3,grad:De.editorialRB,bookingOpenAt:ee(oe(ne,-5)),grades:[{key:"VIP",name:"VIP석",price:187e3},{key:"R",name:"R석",price:154e3},{key:"S",name:"S석",price:121e3},{key:"A",name:"A석",price:85e3}],desc:"Stray Kids의 2026 월드투어 서울 공연. 폭발적인 퍼포먼스로 완성하는 무대.",hot:!0,views:197532},{id:"aespa-2027-synkhorizon",artist:"aespa",title:"2027 WORLD TOUR [SUPERNOVA : SYNK HORIZON]",dateStart:ee(oe(ne,21)),dateEnd:ee(oe(ne,22)),venue:"고척스카이돔",totalSeats:2e4,grad:De.iceChrome,bookingOpenAt:ee(oe(ne,6)),grades:[{key:"VIP",name:"VIP석",price:176e3},{key:"R",name:"R석",price:143e3},{key:"S",name:"S석",price:11e4},{key:"A",name:"A석",price:77e3}],desc:"aespa의 SYNK HORIZON 투어. 메타버스 세계관을 담은 미래형 무대.",hot:!0,views:178423,seatingType:"archall"},{id:"twice-2027-oncemore",artist:"TWICE",title:"2027 WORLD TOUR [FEEL SPECIAL : ONCE MORE]",dateStart:ee(oe(ne,30)),dateEnd:ee(oe(ne,31)),venue:"올림픽주경기장",totalSeats:3e4,grad:De.rose,bookingOpenAt:ee(oe(ne,12)),grades:[{key:"VIP",name:"VIP석",price:187e3},{key:"R",name:"R석",price:154e3},{key:"S",name:"S석",price:121e3},{key:"A",name:"A석",price:88e3}],desc:"TWICE의 ONCE와 함께하는 스페셜 월드투어 서울 공연.",hot:!0,views:156730},{id:"bp-2027-finale",artist:"BLACKPINK",title:"2027 WORLD TOUR [PINK VENOM : THE FINALE]",dateStart:ee(oe(ne,15)),dateEnd:ee(oe(ne,16)),venue:"올림픽주경기장",totalSeats:35e3,grad:De.pinkNoir,bookingOpenAt:ee(oe(ne,-1)),grades:[{key:"VIP",name:"VIP석",price:21e4},{key:"R",name:"R석",price:165e3},{key:"S",name:"S석",price:132e3},{key:"A",name:"A석",price:95e3}],desc:"BLACKPINK의 FINALE 월드투어. 4인 4색 퍼포먼스와 히트곡 총집합.",hot:!0,views:298104},{id:"lsf-2027-fearless",artist:"LE SSERAFIM",title:"2027 WORLD TOUR [FEARLESS : FLAME RISES]",dateStart:ee(oe(ne,-1)),dateEnd:ee(oe(ne,-1)),venue:"KSPO DOME",totalSeats:6e3,grad:De.flameMono,bookingOpenAt:ee(oe(ne,-20)),grades:[{key:"VIP",name:"VIP석",price:165e3},{key:"R",name:"R석",price:132e3},{key:"S",name:"S석",price:99e3},{key:"A",name:"A석",price:66e3}],desc:"LE SSERAFIM의 소규모 스페셜 단독 공연. 전석 매진으로 취소표 대기열 운영 중.",hot:!0,forceSoldOut:!0,views:209981,seatingType:"standing"},{id:"nj-2027-dreaming",artist:"NewJeans",title:"2027 FAN CONCERT [OMG : SUMMER DREAMING]",dateStart:ee(oe(ne,45)),dateEnd:ee(oe(ne,46)),venue:"KSPO DOME",totalSeats:18e3,grad:De.crimson,bookingOpenAt:ee(oe(ne,25)),grades:[{key:"VIP",name:"VIP석",price:165e3},{key:"R",name:"R석",price:132e3},{key:"S",name:"S석",price:99e3},{key:"A",name:"A석",price:71500}],desc:"NewJeans의 팬콘서트. 버니들과 함께하는 특별한 여름 무대.",hot:!1,views:89210},{id:"svt-2026-diamond",artist:"SEVENTEEN",title:"2026 WORLD TOUR [DIAMOND EDGE : REBORN]",dateStart:ee(oe(ne,14)),dateEnd:ee(oe(ne,15)),venue:"KSPO DOME",totalSeats:28e3,grad:De.stoneWarm,bookingOpenAt:ee(new Date(Date.now()+2*60*1e3)),grades:[{key:"VIP",name:"VIP석",price:198e3},{key:"R",name:"R석",price:154e3},{key:"S",name:"S석",price:121e3},{key:"A",name:"A석",price:85e3}],desc:"SEVENTEEN의 DIAMOND EDGE : REBORN 월드투어. 13인조 퍼포먼스의 정점.",hot:!0,views:187302,zoneScaleOverride:.001},{id:"lyw-2027-legend",artist:"임영웅",title:"2027 전국투어 [IM HERO : LEGEND TOUR]",dateStart:ee(oe(ne,50)),dateEnd:ee(oe(ne,51)),venue:"올림픽주경기장",totalSeats:35e3,grad:De.royalNavy,bookingOpenAt:ee(oe(ne,20)),grades:[{key:"VIP",name:"VIP석",price:176e3},{key:"R",name:"R석",price:143e3},{key:"S",name:"S석",price:11e4},{key:"A",name:"A석",price:77e3}],desc:"임영웅의 전국투어 서울 공연. 대한민국을 대표하는 히어로의 감동 무대.",hot:!0,views:245109},{id:"day6-2026-forever",artist:"DAY6",title:"2026 CONCERT [한 페이지가 될 수 있게 : FOREVER YOUNG]",dateStart:ee(oe(ne,7)),dateEnd:ee(oe(ne,8)),venue:"KSPO DOME",totalSeats:15e3,grad:De.amberNight,bookingOpenAt:ee(oe(ne,-3)),grades:[{key:"VIP",name:"VIP석",price:143e3},{key:"R",name:"R석",price:11e4},{key:"S",name:"S석",price:88e3},{key:"A",name:"A석",price:66e3}],desc:"DAY6의 감성 콘서트. 밴드 사운드와 함께하는 잊을 수 없는 페이지.",hot:!1,views:92143},{id:"ive-2026-crown",artist:"IVE",title:"2026 CONCERT [AFTER LIKE : THE CROWN]",dateStart:ee(oe(ne,18)),dateEnd:ee(oe(ne,19)),venue:"KSPO DOME",totalSeats:2e4,grad:De.burgundyGold,bookingOpenAt:ee(oe(ne,4)),grades:[{key:"VIP",name:"VIP석",price:176e3},{key:"R",name:"R석",price:143e3},{key:"S",name:"S석",price:11e4},{key:"A",name:"A석",price:77e3}],desc:"IVE의 THE CROWN 콘서트. 자신감 넘치는 퍼포먼스와 화려한 왕관 컨셉.",hot:!0,views:167432},{id:"aespa-2027-synk",artist:"aespa",title:"2027 LIVE TOUR [MY WORLD : SYNK]",dateStart:ee(oe(ne,14)),dateEnd:ee(oe(ne,15)),venue:"올림픽홀",totalSeats:Mo,grad:De.neonNight,bookingOpenAt:ee(new Date(Date.now()+30*1e3)),grades:[{key:"VIP",name:"VIP석",price:198e3},{key:"R",name:"R석",price:154e3},{key:"S",name:"S석",price:121e3},{key:"A",name:"A석",price:88e3}],desc:"aespa의 올림픽홀 단독 콘서트. MY WORLD 세계관의 완결 라이브.",hot:!0,views:198234}];function Ot(e){return hi.find(t=>t.id===e)}const Oa=["일","월","화","수","목","금","토"];function ri(e){return!Array.isArray(e)||e.length===0?null:e.map(t=>{const i=new Date(t.date+"T00:00:00"),a=Oa[i.getDay()],n=`${i.getMonth()+1}.${String(i.getDate()).padStart(2,"0")} (${a})`;return{date:t.date,time:t.time,label:`${n} 1회 ${t.time}`,shortLabel:n,round:1}})}function li(e){if(!e)return[];const t=e.includes("T")?e.split("T")[0]:e,[i,a,n]=t.split("-").map(Number),o=new Date(i,a-1,n);function r(_){return`${_.getFullYear()}-${String(_.getMonth()+1).padStart(2,"0")}-${String(_.getDate()).padStart(2,"0")}`}function d(_){const u=Oa[_.getDay()];return`${_.getMonth()+1}.${String(_.getDate()).padStart(2,"0")} (${u})`}const c=2+(i*1e4+a*100+n)%3,y=["14:00","17:00","19:00"],x=[];for(let _=0;_<c;_++){const u=new Date(o);u.setDate(u.getDate()+_);const g=r(u),m=d(u),F=y[(n+_)%y.length];x.push({date:g,time:F,label:`${m} 1회 ${F}`,shortLabel:m,round:1})}return x}const Co=[{grade:"VIP",count:4,radius:108,blockW:78,blockH:46,seedPerBlock:42,labels:["가","나","다","라"]},{grade:"R",count:6,radius:182,blockW:72,blockH:52,seedPerBlock:130},{grade:"S",count:9,radius:256,blockW:66,blockH:56,seedPerBlock:210},{grade:"A",count:12,radius:330,blockW:60,blockH:58,seedPerBlock:270}],$i=168;function Ro(e){const t=o=>e.grades.find(r=>r.key===o)||e.grades[e.grades.length-1],i=e.zoneScaleOverride??Math.max(.5,Math.min(2.2,e.totalSeats/22e3)),a=e.zoneScaleOverride!=null?1:20,n=[];return Co.forEach((o,r)=>{for(let d=0;d<o.count;d++){const l=-$i/2+(d+.5)*$i/o.count,c=o.labels?o.labels[d]:String(d+1),y=o.labels?`${o.grade} ${o.labels[d]}구역`:`${o.grade} ${d+1}구역`;n.push({id:`${o.grade}-${d+1}`,grade:o.grade,label:y,short:c,price:t(o.grade).price,seed:Math.max(a,Math.round(o.seedPerBlock*i)),venueType:"arena",ring:r,angle:l,radius:o.radius,blockW:o.blockW,blockH:o.blockH})}}),n}const Bo=60,fe={vip:"#D9481F",gen:"#6E1620",restricted:"#8C8C8C"},Ho=[{id:"F1",grade:"VIP",color:fe.vip,angle:-20,radius:92,blockW:88,blockH:52},{id:"F2",grade:"VIP",color:fe.vip,angle:20,radius:92,blockW:88,blockH:52},{id:"14",grade:"R",color:fe.gen,angle:-42,radius:132,blockW:68,blockH:50,wheelchair:!0},{id:"13",grade:"R",color:fe.gen,angle:42,radius:132,blockW:68,blockH:50,wheelchair:!0},{id:"15",grade:"R",color:fe.gen,angle:-58,radius:170,blockW:66,blockH:52},{id:"12",grade:"R",color:fe.gen,angle:58,radius:170,blockW:66,blockH:52},{id:"16",grade:"R",color:fe.gen,angle:-72,radius:208,blockW:64,blockH:54},{id:"11",grade:"R",color:fe.gen,angle:72,radius:208,blockW:64,blockH:54},{id:"17",grade:"R",color:fe.gen,angle:-84,radius:246,blockW:62,blockH:56},{id:"10",grade:"R",color:fe.gen,angle:84,radius:246,blockW:62,blockH:56},{id:"18",grade:"A",color:fe.restricted,angle:-84,radius:306,blockW:62,blockH:50},{id:"9",grade:"A",color:fe.restricted,angle:84,radius:306,blockW:62,blockH:50},{id:"36",grade:"A",color:fe.restricted,angle:-84,radius:364,blockW:62,blockH:50},{id:"27",grade:"A",color:fe.restricted,angle:84,radius:364,blockW:62,blockH:50},{id:"35",grade:"R",color:fe.gen,angle:-86,radius:150,blockW:64,blockH:52},{id:"34",grade:"R",color:fe.gen,angle:-90,radius:185,blockW:64,blockH:54},{id:"33",grade:"R",color:fe.gen,angle:-94,radius:220,blockW:64,blockH:56},{id:"32",grade:"R",color:fe.gen,angle:-98,radius:255,blockW:64,blockH:58},{id:"28",grade:"R",color:fe.gen,angle:86,radius:150,blockW:64,blockH:52},{id:"29",grade:"R",color:fe.gen,angle:90,radius:185,blockW:64,blockH:54},{id:"30",grade:"R",color:fe.gen,angle:94,radius:220,blockW:64,blockH:56},{id:"31",grade:"R",color:fe.gen,angle:98,radius:255,blockW:64,blockH:58}];function Po(e){const t=i=>e.grades.find(a=>a.key===i)||e.grades[e.grades.length-1];return Ho.map(i=>({...i,label:`${i.id}구역`,price:t(i.grade).price,seed:Bo,venueType:"archall"}))}function qo(e){const t=o=>e.grades.find(r=>r.key===o)||e.grades[e.grades.length-1],i=e.grades.find(o=>o.key==="S")||e.grades[e.grades.length-1],a=Math.max(.5,Math.min(2,e.totalSeats/15e3)),n=[420,360,385,340].map(o=>Math.max(60,Math.round(o*a)));return["S1","S2","S3","S4"].map((o,r)=>({id:`STANDING-${o}`,grade:i.key,label:`스탠딩 ${o}구역`,price:t(i.key).price,seed:n[r],venueType:"standing",quadrant:r}))}function Uo(e){const t=Array.isArray(e==null?void 0:e.grades)&&e.grades.length?e.grades:No,i=a=>t.find(n=>n.key===a)||t[t.length-1];return Te.zones.map(a=>{var n;return{id:a.id,grade:a.grade,label:a.name,seed:a.id==="Floor"?ot:a.seats.length,price:((n=i(a.grade))==null?void 0:n.price)||e.price||0,venueType:"olympichall"}})}function Ct(e){return e.venue==="올림픽홀"?Uo(e):e.seatingType==="standing"?qo(e):e.seatingType==="archall"?Po(e):Ro(e)}function Ca(e){const t=Array.isArray(e==null?void 0:e.sections)?e.sections:[],i=(e==null?void 0:e.venue)==="올림픽홀"?new Map(Ct(e).map(o=>[o.id,o])):new Map,a=new Map;t.forEach(o=>{const r=o.id||o.name,d=i.get(r),l=o.grade||(d==null?void 0:d.grade)||o.label||o.name,c=String(l||"").replace(/석$/,"").trim();if(!c||a.has(c))return;const y=Number(o.price??(d==null?void 0:d.price)??(e==null?void 0:e.price)??0);a.set(c,Number.isFinite(y)?y:0)}),!a.size&&(e==null?void 0:e.price)!=null&&a.set("일반",Number(e.price)||0);const n=["VIP","R","S","A"];return[...a.entries()].sort(([o],[r])=>{const d=n.indexOf(o),l=n.indexOf(r);return d===-1&&l===-1?o.localeCompare(r,"ko"):d===-1?1:l===-1?-1:d-l}).map(([o,r])=>({grade:o,price:r}))}function wi(e,t){const i=Ot(e);if(i){const n=String(i.dateStart||"").slice(0,10);return{title:`${i.artist} ${i.title}`,date:n,dates:n?[n]:[]}}const a=t.find(n=>n.eventId===e);if(a){const n=Ra(a);return{title:a.eventName,date:n[0]||"",dates:n}}return null}function Dt(e){var t;return((t=String(e||"").match(/\d{4}-\d{2}-\d{2}/))==null?void 0:t[0])||""}function Ra(e){const i=(Array.isArray(e.sessions)?e.sessions.map(a=>Dt(typeof a=="string"?a:a==null?void 0:a.date)):[]).filter(Boolean);if(!i.length){const a=Dt(e.eventDate);a&&i.push(a)}return[...new Set(i)]}function Ut(e=[]){const{bookings:t,interests:i}=ie(),a=Array.isArray(e)?e:[],n=[];return a.forEach(o=>{const r=String(o.status||"").toLowerCase();r!=="cancelled"&&Ra(o).forEach(l=>{n.push({date:l,type:"performance",title:o.eventName||"공연 일정",concertId:o.eventId})});const d=o.ticketOpenAt||o.bookingOpenAt;if(d&&!["closed","cancelled"].includes(r)&&new Date(d).getTime()>Date.now()){const l=Dt(d);if(!l)return;n.push({date:l,type:"upcoming",title:`${o.eventName||"공연"} 예매 오픈`,concertId:o.eventId})}}),t.filter(o=>o.status==="confirmed").forEach(o=>{var l;const r=wi(o.concertId,a);if(!r)return;((l=o.session)!=null&&l.date?[Dt(o.session.date)]:r.dates||[r.date]).filter(Boolean).forEach(c=>{n.push({date:c,type:"booked",title:r.title,concertId:o.concertId})})}),i.forEach(o=>{const r=wi(o,a);r&&(r.dates||[r.date]).filter(Boolean).forEach(d=>{n.push({date:d,type:"interest",title:r.title,concertId:o})})}),n}function Ei(e){return e==="sold_out"?'<span class="badge badge-dark-red">SOLD OUT</span>':e==="closed"||e==="cancelled"?'<span class="badge badge-outline">마감</span>':'<span class="badge badge-red">예매중</span>'}function Oe(e){return String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t])}function Tt(e){return e.ticketOpenAt||e.bookingOpenAt||null}function Ba(e){const t=Tt(e),i=t?new Date(t).getTime():NaN;return Number.isFinite(i)&&i>Date.now()&&e.status!=="closed"&&e.status!=="cancelled"}function jo(e){const t=new Date(e);return Number.isFinite(t.getTime())?`예매 오픈 ${t.toLocaleString("ko-KR",{month:"numeric",day:"numeric",weekday:"short",hour:"2-digit",minute:"2-digit"})}`:"예매 오픈 일정 확인 필요"}function Go(e){return Ca(e).map(({grade:t,price:i})=>`${Oe(t)}석 ${ve(i)}`).join(" · ")||"-"}function Wo(e){return`url('${je(e.eventName||e.eventId)}') center/cover no-repeat, linear-gradient(135deg,${e.color||"#667eea,#764ba2"})`}function zo(e,t,i){const a=Oe(e.eventName||e.eventId||"공연"),n=Oe(e.eventDate||"-"),o=Oe(e.venue||"-"),r=ye(e.totalSeats||0);return`
    <article class="hot-card" data-event-card="${Oe(e.eventId)}" style="animation-delay:${t*.07}s">
      <div class="hot-card__bg" style="background:${Wo(e)}"></div>
      <div class="hot-card__rank">${t+1}</div>
      <button type="button" class="badge hot-card__heart" data-heart="${Oe(e.eventId)}" aria-label="관심 공연 ${a}">${at(e.eventId)?"♥":"♡"}</button>
      <div class="hot-card__overlay"></div>
      <div class="hot-card__info">
        <div class="hot-card__artist">관심 ${ye(i)}명</div>
        <div class="hot-card__title">${a}</div>
        <div class="hot-card__detail">
          공연일 &nbsp;${n}<br/>
          공연장 &nbsp;${o}<br/>
          총 좌석 &nbsp;${r}석<br/>
          티켓 가격 &nbsp;${Go(e)}
        </div>
        ${Ba(e)?'<span class="badge badge-gray">예매예정</span>':Ei(e.status)}
      </div>
    </article>`}function Di(e,t,i,a=!1){const n=Oe(e.eventName||e.eventId||"공연"),o=Oe(e.eventDate||"-"),r=Oe(e.venue||"-"),d=Oe(e.eventId),l=je(e.eventName||e.eventId),c=a?jo(Tt(e)):`${o} · ${r}`;return`
    <article class="home-poster-card fade-in" style="animation-delay:${(t||0)*.05}s">
      <div class="home-poster-card__media" data-event-open="${d}">
        <img src="${l}" alt="${n} 포스터" loading="lazy" />
        <div class="home-poster-card__badges">
          ${a?'<span class="badge badge-gray">오픈 예정</span>':Ei(e.status)}
        </div>
        <button type="button" class="home-poster-card__heart" data-heart="${d}" aria-label="관심 공연 ${n}">${at(e.eventId)?"♥":"♡"}</button>
      </div>
      <div class="home-poster-card__body">
        <h3>${n}</h3>
        <p>${Oe(c)}</p>
        <span>관심 ${ye(i)}명</span>
      </div>
    </article>`}const Yo={render(e){var p,k;e.innerHTML=`
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
          <h2 class="section-title">요즘 HOT 공연</h2>
          <p class="section-sub">요즘 가장 많은 관심을 받고 있는 공연이에요</p>
          <div class="hot-grid" id="hot-grid">
            <p style="color:#666">공연 목록 불러오는 중...</p>
          </div>
        </div>
      </section>

      <section class="home-secondary-section" data-upcoming-section hidden>
        <div class="container">
          <div class="eyebrow">COMING SOON</div>
          <h2 class="section-title">오픈 예정</h2>
          <p class="section-sub">예매 오픈을 기다리고 있는 공연이에요</p>
          <div class="home-poster-grid" id="upcoming-grid"></div>
        </div>
      </section>

      <section class="home-secondary-section home-secondary-section--muted" data-explore-section hidden>
        <div class="container">
          <div class="eyebrow">EXPLORE</div>
          <h2 class="section-title">콘서트 둘러보기</h2>
          <p class="section-sub">등록된 공연 정보를 한눈에 살펴보세요</p>
          <div class="home-poster-grid home-poster-grid--explore" id="explore-grid"></div>
        </div>
      </section>
    `;const t=e.querySelector("[data-disc]"),i=e.querySelector("[data-disc-label]"),a=e.querySelector("[data-disc-artist]"),n=e.querySelector("[data-tonearm]"),o=e.querySelector("[data-info]"),r=e.querySelector("[data-arrows]"),d=e.querySelector("[data-dots]");let l=[],c=0,y=null,x=null,_=null;function u(){const h=l[c];if(!h)return;const D=je(h.eventName||h.eventId);i.style.background=`url('${D}') center/cover no-repeat, linear-gradient(135deg,${h.color||"#667eea,#764ba2"})`,a.textContent=h.eventName;const R=e.querySelector("[data-slider]");R&&(R.style.background=`linear-gradient(90deg, rgba(5,4,4,0.92) 0%, rgba(5,4,4,0.7) 40%, rgba(5,4,4,0.3) 100%), url('${D}') center/cover no-repeat`),o.innerHTML=`
        <div class="lp-hero__badges">${Ei(h.status)}<span class="badge badge-gray" style="background:rgba(255,255,255,0.16);color:#fff;">${ye(h.totalSeats||0)}석</span></div>
        <div class="lp-hero__title">${h.eventName}</div>
        <div class="lp-hero__meta">
          <div>공연일<b>${h.eventDate||"-"}</b></div>
          <div>공연장<b>${h.venue||"-"}</b></div>
        </div>
        <button class="btn btn-primary btn-lg" data-book>예매하기</button>
      `,o.querySelector("[data-book]").addEventListener("click",()=>V(`concert/${h.eventId}`)),[...d.querySelectorAll("[data-dot]")].forEach((H,X)=>H.classList.toggle("active",X===c))}function g(h){l.length<=1||(y&&clearTimeout(y),x&&clearTimeout(x),n.classList.add("lp-tonearm--lift"),t.classList.add("lp-disc--swap"),o.classList.add("is-swapping"),y=setTimeout(()=>{c=(h+l.length)%l.length,u(),t.classList.remove("lp-disc--swap"),o.classList.remove("is-swapping")},380),x=setTimeout(()=>{n.classList.remove("lp-tonearm--lift")},520))}function m(h){if(l=h,c=0,_&&clearInterval(_),l.length===0){o.innerHTML='<p style="color:#ccc;">등록된 공연이 없습니다.</p>',r.style.display="none",d.innerHTML="";return}d.innerHTML=l.map((D,R)=>`<span class="slider__dot ${R===0?"active":""}" data-dot="${R}"></span>`).join(""),d.querySelectorAll("[data-dot]").forEach(D=>D.addEventListener("click",()=>g(Number(D.dataset.dot)))),r.style.display=l.length>1?"":"none",u(),l.length>1&&(_=setInterval(()=>g(c+1),5e3))}(p=e.querySelector("[data-next]"))==null||p.addEventListener("click",()=>g(c+1)),(k=e.querySelector("[data-prev]"))==null||k.addEventListener("click",()=>g(c-1));let F=To(e.querySelector("[data-calendar]"),{events:Ut([]),onSelectConcert:h=>V(`concert/${h}`)});const f=e.querySelector("#hot-grid"),s=e.querySelector("[data-upcoming-section]"),A=e.querySelector("#upcoming-grid"),I=e.querySelector("[data-explore-section]"),C=e.querySelector("#explore-grid");let O=new Map,L=0,S=null;function E(){return M.map((h,D)=>({event:h,originalIndex:D,interestCount:O.get(h.eventId)||0})).sort((h,D)=>D.interestCount-h.interestCount||h.originalIndex-D.originalIndex)}function b(h){h.querySelectorAll("[data-event-card]").forEach(D=>{D.addEventListener("click",()=>V(`concert/${D.dataset.eventCard}`))}),h.querySelectorAll("[data-event-open]").forEach(D=>{D.addEventListener("click",()=>V(`concert/${D.dataset.eventOpen}`))}),h.querySelectorAll("[data-heart]").forEach(D=>{D.addEventListener("click",R=>{R.stopPropagation();const H=D.dataset.heart,X=at(H),G=O.get(H)||0;O.set(H,Math.max(0,G+(X?-1:1))),fi(H),v(),S&&clearTimeout(S),S=setTimeout(()=>{S=null,$(M)},350)})})}function v(){if(!M.length){f.innerHTML='<p style="color:#666">등록된 공연이 없습니다.</p>',s.hidden=!0,I.hidden=!0;return}const D=E().slice(0,5);f.innerHTML=D.map(({event:G,interestCount:K},de)=>zo(G,de,K)).join(""),b(f);const R=M.filter(Ba).sort((G,K)=>new Date(Tt(G)).getTime()-new Date(Tt(K)).getTime());s.hidden=R.length===0,R.length&&(A.innerHTML=R.map((G,K)=>Di(G,K,O.get(G.eventId)||0,!0)).join(""),b(A));const H=new Set([...D.map(({event:G})=>G.eventId),...R.map(G=>G.eventId)]),X=M.filter(G=>!H.has(G.eventId));I.hidden=X.length===0,X.length&&(C.innerHTML=X.map((G,K)=>Di(G,K,O.get(G.eventId)||0)).join(""),b(C))}function $(h){if(!h.length)return Promise.resolve();const D=++L;return Promise.all(h.map(async R=>{try{const H=await fetch(`/wishlist/count/${encodeURIComponent(R.eventId)}`);if(!H.ok)throw new Error("interest count request failed");const X=await H.json();return[R.eventId,Number(X.count)||0]}catch{return[R.eventId,O.get(R.eventId)||0]}})).then(R=>{D===L&&(R.forEach(([H,X])=>O.set(H,X)),v())})}let M=[];fetch("/events").then(h=>h.json()).then(h=>{const D=h.events||[];M=D,m(D),F&&F.setEvents(Ut(M)),D.forEach(R=>O.set(R.eventId,0)),v(),$(D)}).catch(()=>{f.innerHTML='<p style="color:#e31b23">공연 목록을 불러오지 못했습니다.</p>',o.innerHTML='<p style="color:#e31b23;">공연 정보를 불러오지 못했습니다.</p>'});const B=mt(()=>{e.querySelectorAll("[data-heart]").forEach(h=>{h.textContent=at(h.dataset.heart)?"♥":"♡"}),F&&F.setEvents(Ut(M))});return()=>{B(),_&&clearInterval(_),y&&clearTimeout(y),x&&clearTimeout(x),S&&clearTimeout(S)}}};function Vo(e){return e==="sold_out"?'<span class="badge badge-dark-red">SOLD OUT</span>':e==="closed"||e==="cancelled"?'<span class="badge badge-outline">마감</span>':'<span class="badge badge-red">예매중</span>'}function dt(e){return String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t])}function Ko(e,t){const a=`url('${je(e.eventName||e.eventId)}') center/cover no-repeat, linear-gradient(135deg,${e.color||"#667eea,#764ba2"})`,n=dt(e.eventId),o=dt(e.eventName||e.eventId||"공연"),r=dt(e.eventDate||"-"),d=dt(e.venue||"-");return`
    <div class="card fade-in" style="overflow:hidden;animation-delay:${(t||0)*.05}s;">
      <div style="height:180px;background:${a};position:relative;cursor:pointer;transition:transform .4s ease;" data-open="${n}" onmouseenter="this.style.transform='scale(1.04)'" onmouseleave="this.style.transform='none'">
        <div style="position:absolute;top:10px;left:10px;">${Vo(e.status)}</div>
        <button type="button" class="badge" data-heart="${n}" style="position:absolute;top:10px;right:10px;border:none;background:rgba(0,0,0,0.35);color:#fff;cursor:pointer;" aria-label="관심 공연 ${o}">
          ${at(e.eventId)?"♥":"♡"}
        </button>
      </div>
      <div style="padding:16px;">
        <div style="font-weight:800;font-size:14.5px;margin:4px 0 10px;line-height:1.4;height:38px;overflow:hidden;">${o}</div>
        <div class="text-secondary" style="font-size:12px;">${r}</div>
        <div class="text-secondary" style="font-size:12px;margin-top:2px;">${d} · ${Number(e.totalSeats||0).toLocaleString()}석</div>
      </div>
    </div>`}const Jo={render(e,t,i={}){const a=String(i.search||"").trim();e.innerHTML=`
      <section class="page-section">
        <div class="container">
          <div class="eyebrow">${a?"SEARCH RESULT":"ALL CONCERTS"}</div>
          <h2 class="section-title">${a?`'${dt(a)}' 검색 결과`:"예매 가능한 공연"}</h2>
          <p class="section-sub">${a?"공연명 또는 공연장으로 검색한 결과입니다":"QUEUING에서 진행 중인 모든 공연을 확인하세요"}</p>
          <div class="interest-grid mt-24" data-grid>
            <p style="color:#666">공연 목록 불러오는 중...</p>
          </div>
        </div>
      </section>
    `;const n=e.querySelector("[data-grid]");function o(d){const l=a?d.filter(c=>`${c.eventName||""} ${c.venue||""}`.toLowerCase().includes(a.toLowerCase())):d;if(l.length===0){n.innerHTML=`<p style="color:#666">${a?"검색 결과가 없습니다.":"등록된 공연이 없습니다."}</p>`;return}n.innerHTML=l.map(Ko).join(""),n.querySelectorAll("[data-open]").forEach(c=>{c.addEventListener("click",()=>V(`concert/${c.dataset.open}`))}),n.querySelectorAll("[data-heart]").forEach(c=>{c.addEventListener("click",y=>{y.stopPropagation(),fi(c.dataset.heart)})})}return fetch("/events").then(d=>d.json()).then(d=>o(d.events||[])).catch(()=>{n.innerHTML='<p style="color:#e31b23">공연 목록을 불러오지 못했습니다.</p>'}),mt(()=>{n.querySelectorAll("[data-heart]").forEach(d=>{d.textContent=at(d.dataset.heart)?"♥":"♡"})})}},Xo="modulepreload",Zo=function(e){return"/"+e},Ti={},Qo=function(t,i,a){let n=Promise.resolve();if(i&&i.length>0){document.getElementsByTagName("link");const r=document.querySelector("meta[property=csp-nonce]"),d=(r==null?void 0:r.nonce)||(r==null?void 0:r.getAttribute("nonce"));n=Promise.allSettled(i.map(l=>{if(l=Zo(l),l in Ti)return;Ti[l]=!0;const c=l.endsWith(".css"),y=c?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${l}"]${y}`))return;const x=document.createElement("link");if(x.rel=c?"stylesheet":Xo,c||(x.as="script"),x.crossOrigin="",x.href=l,d&&x.setAttribute("nonce",d),document.head.appendChild(x),c)return new Promise((_,u)=>{x.addEventListener("load",_),x.addEventListener("error",()=>u(new Error(`Unable to preload CSS for ${l}`)))})}))}function o(r){const d=new Event("vite:preloadError",{cancelable:!0});if(d.payload=r,window.dispatchEvent(d),!d.defaultPrevented)throw r}return n.then(r=>{for(const d of r||[])d.status==="rejected"&&o(d.reason);return t().catch(o)})},en="공연 7일 전까지 취소 가능 · 취소 시점에 따라 수수료가 발생할 수 있습니다.",tn="관람일 전일 오후 5시(토요일은 오전 11시) 이후 또는 관람일 당일 예매 건은 예매 후 취소·변경·환불이 불가합니다. 토요일이 공휴일인 경우 토요일 오전 11시 기준이 적용됩니다.",an=[{period:"예매 후 7일 이내 (공연일 10일 전까지)",fee:"없음"},{period:"예매 후 8일 ~ 관람일 10일 전",fee:"공연권 4,000원 · 입장권 2,000원 (티켓금액 10% 이내)"},{period:"관람일 9일 전 ~ 7일 전",fee:"티켓 금액의 10%"},{period:"관람일 6일 전 ~ 3일 전",fee:"티켓 금액의 20%"},{period:"관람일 2일 전 ~ 1일 전",fee:"티켓 금액의 30%"},{period:"관람일 당일",fee:"취소 및 환불 불가"}],on="※ 취소 수수료 및 환불 기준은 공연별 판매 정책에 따라 달라질 수 있습니다. 정확한 환불 조건은 해당 공연의 상세 페이지에서 확인해주세요.",nn=[{method:"신용카드",desc:"취소 처리 완료 후 4~5일 뒤 카드사 취소가 확인됩니다. 취소 시점과 카드사에 따라 환급 방법·기간이 다를 수 있습니다."},{method:"무통장 입금",desc:"접수 완료 후 5~7일 이내 처리됩니다. 반드시 예매자 본인 명의 계좌로만 환불 가능합니다."},{method:"휴대폰 결제",desc:"당월 예매건만 사이트에서 취소 가능하며, 그 외 기간은 고객센터 문의가 필요합니다."},{method:"예매권",desc:"공연예매권은 취소가 불가하며, 문화예매권은 사용한 금액만큼 즉시 복원됩니다."}],dn="공연이 주최 측의 사정으로 취소되는 경우 해당 공연의 정책에 따라 티켓 금액을 환불합니다.",sn="공연 일정 또는 장소가 변경되는 경우, 변경된 공연을 관람할 수 없는 사용자를 대상으로 별도의 취소 및 환불 절차가 제공될 수 있습니다.",rn='결제 제한시간 내에 결제를 완료하지 않으면 좌석은 자동으로 해제되어 다른 사용자가 다시 선택할 수 있게 됩니다. 이는 "환불"이 아니라 "좌석 예약 시간 만료"로 처리되며, 결제 전이므로 수수료도 발생하지 않습니다.',ln=["취소표는 1인 1매만 구매할 수 있습니다.","Private Link를 통해서만 취소표를 예매할 수 있습니다.","Private Link는 발급 후 5분 동안만 유효합니다.","Private Link가 만료되면 해당 링크로는 예매할 수 없습니다.","Private Link로 티켓을 확보하면 해당 링크는 즉시 사용이 종료됩니다.","이미 사용된 Private Link는 다시 사용할 수 없습니다."],cn="Private Link의 5분 제한과, 결제 완료 후 티켓의 환불 가능 기간은 서로 다른 개념입니다. Private Link가 만료되어도 이미 결제한 티켓에는 공연별 환불 정책이 정상적으로 적용됩니다.";function Ha(e){return e>=10?0:e>=7?.1:e>=3?.2:e>=1?.3:1}function yn(){return`
    <section class="policy-section">
      <h4>예매 취소</h4>
      <p>${tn}</p>
    </section>

    <section class="policy-section">
      <h4>취소 수수료</h4>
      <table class="policy-table">
        ${an.map(e=>`<tr><td>${e.period}</td><td>${e.fee}</td></tr>`).join("")}
      </table>
      <p class="policy-note">${on}</p>
    </section>

    <section class="policy-section">
      <h4>환불 방법</h4>
      ${nn.map(e=>`<div class="policy-kv"><b>${e.method}</b><span>${e.desc}</span></div>`).join("")}
    </section>

    <section class="policy-section">
      <h4>공연 취소</h4>
      <p>${dn}</p>
    </section>

    <section class="policy-section">
      <h4>공연 일정 변경</h4>
      <p>${sn}</p>
    </section>

    <section class="policy-section">
      <h4>좌석 결제 제한시간</h4>
      <p>${rn}</p>
    </section>

    <section class="policy-section">
      <h4>취소표 관련 규정</h4>
      <ul class="policy-list">
        ${ln.map(e=>`<li>${e}</li>`).join("")}
      </ul>
    </section>

    <section class="policy-section">
      <h4>Private Link 관련 규정</h4>
      <p>${cn}</p>
    </section>
  `}function xn(){be({title:"취소 및 환불 규정",size:"modal-lg",bodyHtml:yn(),footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close>확인했습니다</button>'})}function Pa(e,{compact:t=!1}={}){e.innerHTML=`
    <div class="refund-summary ${t?"refund-summary--compact":""}">
      <div class="refund-summary__text">
        <div class="refund-summary__title">취소 및 환불 규정</div>
        <div class="refund-summary__desc">${en}</div>
      </div>
      <button type="button" class="btn btn-outline btn-sm" data-open-refund-policy>자세히 보기</button>
    </div>
  `,e.querySelector("[data-open-refund-policy]").addEventListener("click",xn)}const un="dev-only-secret-change-me";function jt(e){const t=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];let i=1779033703,a=3144134277,n=1013904242,o=2773480762,r=1359893119,d=2600822924,l=528734635,c=1541459225;const y=(F,f)=>F>>>f|F<<32-f,x=e.length,_=x*8,u=new Uint8Array(x+9+63&-64);u.set(e),u[x]=128;const g=new DataView(u.buffer);g.setUint32(u.length-4,_,!1);for(let F=0;F<u.length;F+=64){const f=new Int32Array(64);for(let b=0;b<16;b++)f[b]=g.getInt32(F+b*4,!1);for(let b=16;b<64;b++){const v=y(f[b-15]>>>0,7)^y(f[b-15]>>>0,18)^f[b-15]>>>3,$=y(f[b-2]>>>0,17)^y(f[b-2]>>>0,19)^f[b-2]>>>10;f[b]=f[b-16]+v+f[b-7]+$|0}let s=i,A=a,I=n,C=o,O=r,L=d,S=l,E=c;for(let b=0;b<64;b++){const v=y(O>>>0,6)^y(O>>>0,11)^y(O>>>0,25),$=O&L^~O&S,M=E+v+$+t[b]+f[b]|0,B=y(s>>>0,2)^y(s>>>0,13)^y(s>>>0,22),p=s&A^s&I^A&I,k=B+p|0;E=S,S=L,L=O,O=C+M|0,C=I,I=A,A=s,s=M+k|0}i=i+s|0,a=a+A|0,n=n+I|0,o=o+C|0,r=r+O|0,d=d+L|0,l=l+S|0,c=c+E|0}const m=new Uint8Array(32);return new DataView(m.buffer).setUint32(0,i),new DataView(m.buffer).setUint32(4,a),new DataView(m.buffer).setUint32(8,n),new DataView(m.buffer).setUint32(12,o),new DataView(m.buffer).setUint32(16,r),new DataView(m.buffer).setUint32(20,d),new DataView(m.buffer).setUint32(24,l),new DataView(m.buffer).setUint32(28,c),m}function pn(e,t){let a=e.length>64?jt(e):e;const n=new Uint8Array(64);n.set(a);const o=new Uint8Array(64+t.length),r=new Uint8Array(96);for(let l=0;l<64;l++)o[l]=n[l]^54,r[l]=n[l]^92;o.set(t,64);const d=jt(o);return r.set(d,64),jt(r)}function qa(e){let t="";for(let i=0;i<e.length;i++)t+=String.fromCharCode(e[i]);return btoa(t).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}function Li(e){return qa(new TextEncoder().encode(JSON.stringify(e)))}function Ua(e,t){const i=Math.floor(Date.now()/1e3),a=Li({alg:"HS256",typ:"JWT"}),n=Li({userId:e,nickname:t,iat:i,exp:i+3600}),o=`${a}.${n}`,r=pn(new TextEncoder().encode(un),new TextEncoder().encode(o));return`${o}.${qa(r)}`}function mn(e,t,i,{onMessage:a,onOpen:n,onClose:o,onError:r}={}){const d=Ua(t,i),l=`ws://${location.host}/ws/chat/${e}?token=${d}`;console.log("[Chat] 연결 시도:",l.replace(/token=.*/,"token=***"));const c=new WebSocket(l);return c.addEventListener("open",()=>{console.log("[Chat] 연결 성공"),n==null||n()}),c.addEventListener("message",y=>{try{a==null||a(JSON.parse(y.data))}catch{}}),c.addEventListener("close",y=>{console.log("[Chat] 연결 종료 code:",y.code,"reason:",y.reason),o==null||o()}),c.addEventListener("error",y=>{console.error("[Chat] 에러 발생:",y),r==null||r()}),{sendMessage(y){c.readyState===WebSocket.OPEN&&c.send(y)},close(){c.close()},get readyState(){return c.readyState},ws:c}}function vn(e,t,i,{onMessage:a,onOpen:n,onClose:o}={}){const r=Ua(t,i),d=new WebSocket(`ws://${location.host}/ws/seats/${e}?token=${r}`);return d.addEventListener("open",()=>n==null?void 0:n()),d.addEventListener("message",l=>{try{a==null||a(JSON.parse(l.data))}catch{}}),d.addEventListener("close",()=>o==null?void 0:o()),{ws:d,close(){d.close()}}}function Mi(e){const t=document.createElement("div");return t.textContent=e,t.innerHTML}const fn=5e3;function bn(e,{concertId:t,artist:i}){const a=[];let n=0,o=null,r=null,d=0,l=null,c=!1;async function y(){try{await fetch("/rooms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({eventId:t,name:`${i} 채팅방`})})}catch{}}async function x(){if(c||(await y(),c))return;const f=ie().user,s=(f==null?void 0:f.userId)||"anonymous",A=(f==null?void 0:f.name)||"게스트";try{o=mn(t,s,A,{onMessage:I=>{if(I.type==="chat"){const C=ie().user;a.push({id:`${I.ts}-${Math.random()}`,author:I.author,text:I.message,mine:!!(C&&I.author===C.name)}),a.length>200&&a.shift(),g()}},onClose:()=>{c||(l=setTimeout(x,3e3))},onError:()=>{o&&o.close()}})}catch{c||(l=setTimeout(x,3e3))}}function _(){e.innerHTML=`
      <div class="live-panel__viewers">
        <span class="live-dot"></span>
        현재 <b data-viewers class="num-mono">${ye(n)}</b>명이 함께 보고 있어요
      </div>
      <div class="live-chat">
        <div class="live-chat__head">
          <span>실시간 채팅</span>
          <span class="badge badge-gray">${i} 전용방</span>
        </div>
        <div class="live-chat__list" data-list></div>
        <form class="live-chat__form" data-form>
          <input type="text" data-input maxlength="120" placeholder="${Ce()?"메시지를 입력하세요":"로그인 후 채팅에 참여할 수 있어요"}" />
          <button type="submit" class="btn btn-primary btn-sm" data-send>전송</button>
        </form>
        <div class="live-chat__notice" data-cooldown-notice>채팅 도배 방지를 위해 메시지 전송 후 5초 뒤에 다음 메시지를 보낼 수 있습니다.</div>
      </div>
    `,g();const f=e.querySelector("[data-input]"),s=e.querySelector("[data-send]");e.querySelector("[data-form]").addEventListener("submit",A=>{if(A.preventDefault(),s.disabled)return;const I=f.value.trim();if(I){if(!Ce()){Xe(`concert/${t}`),V("login");return}!o||o.readyState!==WebSocket.OPEN||(o.sendMessage(I),f.value="",u())}})}function u(){const f=e.querySelector("[data-input]"),s=e.querySelector("[data-send]"),A=e.querySelector("[data-cooldown-notice]");if(!f||!s)return;d=Date.now()+fn,f.disabled=!0,s.disabled=!0,r&&clearInterval(r);function I(){const C=d-Date.now();if(C<=0){clearInterval(r),r=null,f.disabled=!1,s.disabled=!1,s.textContent="전송",A&&(A.textContent="채팅 도배 방지를 위해 메시지 전송 후 5초 뒤에 다음 메시지를 보낼 수 있습니다.");return}s.textContent=`${Math.ceil(C/1e3)}초`,A&&(A.textContent=`다음 메시지를 보내려면 ${Math.ceil(C/1e3)}초 기다려주세요.`)}I(),r=setInterval(I,200)}function g(){const f=e.querySelector("[data-list]");f&&(f.innerHTML=a.length?a.map(s=>`
        <div class="chat-msg ${s.mine?"chat-msg--mine":""}">
          <div class="chat-msg__author">${Mi(s.author)}</div>
          <div class="chat-msg__bubble">${Mi(s.text)}</div>
        </div>`).join(""):'<div class="chat-msg__empty">아직 채팅이 없어요. 가장 먼저 인사해보세요!</div>',f.scrollTop=f.scrollHeight)}function m(){fetch(`/rooms/${t}`).then(f=>f.ok?f.json():null).then(f=>{if(!f||c)return;n=f.chatConnections||0;const s=e.querySelector("[data-viewers]");s&&(s.textContent=ye(n))}).catch(()=>{})}_(),x(),m();const F=setInterval(m,5e3);return()=>{c=!0,clearInterval(F),r&&clearInterval(r),l&&clearTimeout(l),o&&o.close()}}const ci=14,We=20,gn=30,Ni=280,yi=36,xi=18,hn=xi+yi+40,En=.25,ja=5,Fn=.4,In=.0012,Oi=1.25,Ci=4,An=ci/2+8,Lt=50,Ue="#7C4DFF",Ri="#5E35D8",Bi="#9E9E9E";function Ve(e,t){const i=parseInt(e.slice(1,3),16),a=parseInt(e.slice(3,5),16),n=parseInt(e.slice(5,7),16);return`rgba(${i},${a},${n},${t})`}const Hi={VIP:0,R:1,S:2,A:3};function Sn(e,t){const i=[],a=new Set,n={};e.forEach((u,g)=>{a.has(u.grade)||(a.add(u.grade),i.push(u.grade),n[u.grade]={...u,_idx:g})}),i.sort((u,g)=>{const m=Hi[u]??100+n[u]._idx,F=Hi[g]??100+n[g]._idx;return m-F});const o={};i.forEach(u=>o[u]=[]),t.forEach(u=>{o[u.grade]&&o[u.grade].push(u)});const r=Math.max(40,Math.ceil(Math.sqrt(t.length)*1.6)),d=r*We,l=d/2;let c=hn;const y=[],x=[];i.forEach(u=>{const g=o[u];if(!g.length)return;const m=n[u],F=c;let f=0;for(;f<g.length;){const s=Math.min(r,g.length-f),A=s*We,I=l-A/2+We/2;for(let C=0;C<s;C++)g[f]._x=I+C*We,g[f]._y=c,g[f]._displayNum=f+1,y.push(g[f]),f++;c+=We}x.push({grade:u,label:m.label||u,yStart:F,yEnd:c-We}),c+=gn});const _=40;return{seats:y,zones:x,canvasW:d+_*2,canvasH:c+_,offsetX:_,cx:l+_}}function _n(e){const{zones:t,canvasW:i,canvasH:a,cx:n}=e,o=t.map(d=>`<rect x="20" y="${d.yStart-We/2}" width="${i-40}" height="${d.yEnd-d.yStart+We}" rx="8" fill="${Bi}" fill-opacity="0.06" stroke="${Bi}" stroke-opacity="0.12" stroke-width="1"/>`).join(""),r=t.map(d=>`<text x="14" y="${(d.yStart+d.yEnd)/2+4}" font-size="13" font-weight="800" fill="#666" text-anchor="start" opacity="0.7">${d.label}</text>`).join("");return`<svg width="${i}" height="${a}" viewBox="0 0 ${i} ${a}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="stg" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#444"/><stop offset="100%" stop-color="#181818"/></linearGradient></defs>
    <rect x="${n-Ni/2}" y="${xi}" width="${Ni}" height="${yi}" rx="8" fill="url(#stg)"/>
    <text x="${n}" y="${xi+yi/2+5}" text-anchor="middle" fill="#fff" font-size="13" font-weight="800" letter-spacing="4">S T A G E</text>
    ${o}${r}
  </svg>`}function st(e,t,i){const a=i.clientWidth,n=i.clientHeight,o=t.canvasW*e.scale,r=t.canvasH*e.scale;o<=a?e.tx=(a-o)/2:e.tx=Math.min(0,Math.max(a-o,e.tx)),r<=n?e.ty=(n-r)/2:e.ty=Math.min(0,Math.max(n-r,e.ty))}function Pi(e,t,i,a){const n=i.clientWidth,o=i.clientHeight,r=n/t.canvasW,d=o/t.canvasH;e.scale=Math.min(r,d)*.92,e.scale=Math.max(a||.005,Math.min(ja,e.scale)),st(e,t,i)}function kn(e,t,i,a){const n={sold:"매진",holding:"다른 사용자 선택 중",mine:"내 좌석",available:"선택 가능"},o=a||i.label||i.grade,r=i._block?` (${i._block})`:"",d=`${i._displayNum||i.seatNum}번`;e.innerHTML=`<strong>${o}${r}</strong><br>${d}<br><span style="opacity:0.7">${n[i.status]||"선택 가능"}</span>`,e.classList.add("show"),e.style.left=`${t.clientX+14}px`,e.style.top=`${t.clientY-10}px`}function $n(e){e.classList.remove("show")}const wn=1426,Dn=1103,Tn=1.27,Ln=70,Mn=.9025,Nn=1057,Mt=7,Nt=8,On=Te.zones.filter(e=>e.id!=="Floor"),Gt=Te.zones.find(e=>e.id==="Floor"),Ke={x:560,y:180,width:289,height:195,cols:37,rows:24},Cn=Ke.cols*Ke.rows,Wt={B1:48*Math.PI/180,B2:48*Math.PI/180,D1:-48*Math.PI/180,D2:-48*Math.PI/180};function Rn(e){const t=new Set;return e.forEach(i=>{e.some(n=>{if(n===i)return!1;const o=Math.abs(n.x-i.x),r=Math.abs(n.y-i.y);return o>=4&&o<=11&&r<2})||t.add(i.id)}),t}function qi(e){return{x:e.x*Tn+Ln,y:Nn-e.y*Mn}}function Ui(e,t,i){return e==="I1"&&(t.id==="I1-76"||i!=null&&i.has(t.id))?Wt.B1:e==="I3"&&(i!=null&&i.has(t.id))?Wt.D1:Wt[e]||0}function Bn(e,t){const{x:i,y:a,width:n,height:o,cols:r,rows:d}=Ke,l=n/r,c=o/d,y=Math.floor(t/d),x=t%d;let _=0;for(let u=0;u<d;u++){const g=Math.min(r,y+(u<x?1:0));if(e<_+g){const m=e-_,F=(r-g)*l/2;return{x:i+F+(m+.5)*l,y:a+(u+.5)*c}}_+=g}return{x:i+n/2,y:a+o/2}}function Hn(e,t){const i={};t.forEach(y=>{const x=y.section||y.grade;i[x]||(i[x]=[]),i[x].push(y)});const a=[],n=[],o=[];let r=0;On.forEach(y=>{const x=i[y.id]||[],_=new Map(y.seats.map(A=>{const I=A.id.match(/-(\d+)$/);return[I?Number(I[1]):null,A]})),u=y.id==="I1"||y.id==="I3"?Rn(y.seats):null,g=new Map(y.seats.map(A=>{const I=qi(A);return[A.id,{x:I.x,y:I.y,angle:Ui(y.id,A,u)}]}));let m=0,F=0,f=0;for(let A=0;A<x.length;A++){const I=x[A],O=String(I.id||I.seatId||"").match(/-(\d+)$/),L=O?Number(O[1]):A+1,S=_.get(L);if(!S)continue;const E=g.get(S.id)||qi(S);I._x=E.x,I._y=E.y,I._sw=Mt,I._sh=Nt,I._angle=E.angle??Ui(y.id,S,u),I._displayNum=L,I._block=y.id,a.push(I),f+=1,m+=I._x,F+=I._y}r+=Math.max(0,x.length-f),f>0&&n.push({id:y.id,x:m/f,y:F/f});const s=e.find(A=>A.id===y.id||A.grade===y.id);o.push({id:y.id,grade:y.grade,label:(s==null?void 0:s.label)||y.name})});const d=i.Floor||[],l=Cn,c=Math.min(d.length,l);for(let y=0;y<c;y++){const x=d[y],_=Bn(y,c);x._x=_.x,x._y=_.y,x._sw=Mt,x._sh=Nt,x._angle=0,x._displayNum=y+1,x._block="Floor",a.push(x)}if(r+=Math.max(0,d.length-l),c>0){n.push({id:"Floor",x:Ke.x+Ke.width/2,y:Ke.y+Ke.height/2});const y=e.find(x=>x.id==="Floor"||x.grade==="Floor");o.push({id:"Floor",grade:(Gt==null?void 0:Gt.grade)||"VIP",label:(y==null?void 0:y.label)||"Floor 구역"})}return r&&console.warn(`[SeatMap] CSV 좌표가 없는 올림픽홀 좌석 ${r}개는 렌더링하지 않습니다.`),{seats:a,zones:o,canvasW:wn,canvasH:Dn,offsetX:0,isOlympicHall:!0,bgImageUrl:"/images/seatmaps/올림픽홀-interactive-bg.png",zoneLabels:n}}function Pn(e){const{canvasW:t,canvasH:i,stageX:a,stageY:n,stageW:o,stageH:r,zoneLabels:d}=e,l=(d||[]).map(c=>`<text x="${c.x}" y="${c.y}" text-anchor="middle" dominant-baseline="central" font-size="20" font-weight="800" fill="#555" opacity="0.5">${c.id}</text>`).join("");return`<svg width="${t}" height="${i}" viewBox="0 0 ${t} ${i}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="ohstg" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#e74c3c"/><stop offset="100%" stop-color="#c0392b"/></linearGradient></defs>
    <rect x="${a}" y="${n}" width="${o}" height="${r}" rx="8" fill="url(#ohstg)"/>
    <text x="${a+o/2}" y="${n+r/2+5}" text-anchor="middle" fill="#fff" font-size="20" font-weight="800" letter-spacing="6">S T A G E</text>
    ${l}
  </svg>`}function qn(e){const t=new Map;return e.forEach((i,a)=>{const n=Math.floor(i._x/Lt),o=Math.floor(i._y/Lt),r=n<<16|o&65535;let d=t.get(r);d||(d=[],t.set(r,d)),d.push(a)}),t}function ji(e,t,i,a){const n=Math.floor(i/Lt),o=Math.floor(a/Lt);let r=null,d=1/0;for(let l=-1;l<=1;l++)for(let c=-1;c<=1;c++){const y=n+l<<16|o+c&65535,x=e.get(y);if(x)for(let _=0;_<x.length;_++){const u=t[x[_]],g=Math.hypot(u._x-i,u._y-a);g<d&&(d=g,r=u)}}return d<=An?r:null}function Fi(e,{sections:t,seats:i,onSeatClick:a,cancelMode:n=!1,readOnly:o=!1,venue:r}){const d=r==="올림픽홀",l=d?Hn(t,i):Sn(t,i),c=new Map;i.forEach(T=>c.set(T.id,T));const y=new Map;l.seats.forEach(T=>y.set(T.id,T));const x=e.closest(".seatmap-scroll");x&&(x.style.maxHeight="none",x.style.overflow="hidden",x.style.padding="0",x.style.border="none",x.style.background="none"),e.style.padding="0";const _=Object.fromEntries(t.map(T=>[T.grade,T.color||Ue])),u=o?`<span class="vm-legend__item"><span class="vm-legend__dot" style="background:${Ue};border-color:${Ri}"></span>좌석 배치도</span>`:`<span class="vm-legend__item">선택 가능 (구역별 색상은 우측 목록 참고)</span>
       <span class="vm-legend__item"><span class="vm-legend__dot" style="background:var(--color-primary);border-color:var(--color-primary-dark)"></span>내 좌석</span>
       <span class="vm-legend__item"><span class="vm-legend__dot" style="background:#F0A030;border-color:#C88010"></span>선택중</span>
       <span class="vm-legend__item"><span class="vm-legend__dot" style="background:#BCBCBC;border-color:#999"></span>매진</span>`;e.innerHTML=`
    <div class="vm-legend">${u}</div>
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
  `;const g=e.querySelector("[data-seat-canvas]"),m=e.querySelector("[data-viewport]"),F=e.querySelector("[data-tooltip]"),f=e.querySelector("[data-hint]"),s=g.getContext("2d"),A=new Image;let I=!1;if(A.onload=()=>{I=!0,p()},l.bgImageUrl)A.src=l.bgImageUrl;else{const T=d?Pn(l):_n(l);A.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(T)}const C=qn(l.seats);function O(T,z){return{x:(T-L.tx)/L.scale,y:(z-L.ty)/L.scale}}const L={scale:1,tx:0,ty:0};let S=null,E=0,b=!1,v=!1;const $=l.isOlympicHall?.12:Fn,M=Math.min(En,Math.min(m.clientWidth/l.canvasW,m.clientHeight/l.canvasH)*.85);Pi(L,l,m,M);function B(){const T=window.devicePixelRatio||1,z=m.clientWidth,Y=m.clientHeight;(g.width!==z*T||g.height!==Y*T)&&(g.width=z*T,g.height=Y*T)}function p(){if(v)return;const T=window.devicePixelRatio||1,z=m.clientWidth,Y=m.clientHeight;B(),s.save(),s.scale(T,T),s.clearRect(0,0,z,Y),s.save(),s.translate(L.tx,L.ty),s.scale(L.scale,L.scale),I&&s.drawImage(A,0,0,l.canvasW,l.canvasH);const ce=ci/2,he=L.scale>=$;if(l.isOlympicHall&&!he){s.save(),s.fillStyle="rgba(0,0,0,0.45)";const ae=340,j=46,Q=l.canvasW/2-ae/2,te=l.canvasH-100,w=12;s.beginPath(),s.moveTo(Q+w,te),s.lineTo(Q+ae-w,te),s.quadraticCurveTo(Q+ae,te,Q+ae,te+w),s.lineTo(Q+ae,te+j-w),s.quadraticCurveTo(Q+ae,te+j,Q+ae-w,te+j),s.lineTo(Q+w,te+j),s.quadraticCurveTo(Q,te+j,Q,te+j-w),s.lineTo(Q,te+w),s.quadraticCurveTo(Q,te,Q+w,te),s.closePath(),s.fill(),s.fillStyle="#fff",s.font="bold 16px sans-serif",s.textAlign="center",s.textBaseline="middle",s.fillText("스크롤하여 확대하면 좌석이 나타납니다",l.canvasW/2,te+j/2),s.restore()}const _e=!!l.isOlympicHall,Ee=[],ue=[],Fe=[],Re=[],ke={};for(let ae=0;ae<l.seats.length;ae++){const j=l.seats[ae],Q=c.get(j.id),te=Q?Q.status:"available";if(te==="sold"){ue.push(j);continue}if(te==="holding"){Fe.push(j);continue}if(te==="mine"){Re.push(j);continue}if(_e)Ee.push(j);else{const w=_[j.grade]||Ue;ke[w]||(ke[w]=[]),ke[w].push(j)}}if(he){if(_e){const ae=(j,Q,te,w,U=1)=>{const P=(j._sw||Mt)*U,se=(j._sh||Nt)*U,re=Math.min(P,se)/2;s.save(),s.translate(j._x,j._y),s.rotate(j._angle||0),s.fillStyle=Q,s.strokeStyle=te,s.lineWidth=w,s.beginPath(),s.arc(0,0,re,0,Math.PI*2),s.fill(),s.stroke(),s.restore()};for(let j=0;j<Ee.length;j++)ae(Ee[j],Ve(Ue,.2),Ve(Ri,.9),1);if(ue.length){s.globalAlpha=.5;for(let j=0;j<ue.length;j++)ae(ue[j],"#BCBCBC","#999",2);s.globalAlpha=1}if(Fe.length){s.globalAlpha=.55+.45*Math.abs(Math.sin(E));for(let j=0;j<Fe.length;j++)ae(Fe[j],"#F0A030","#C88010",2);s.globalAlpha=1}for(let j=0;j<Re.length;j++){const Q=Re[j],te=Q._sw||Mt,w=Q._sh||Nt,U=Math.min(te,w)*1.7;s.save(),s.translate(Q._x,Q._y),s.rotate(Q._angle||0),s.shadowColor="rgba(0,0,0,0.3)",s.shadowBlur=8,s.fillStyle="#fff",s.beginPath(),s.arc(0,0,U/2+2,0,Math.PI*2),s.fill(),s.shadowBlur=0,s.fillStyle=Ue,s.beginPath(),s.arc(0,0,U/2,0,Math.PI*2),s.fill(),s.strokeStyle="rgba(255,255,255,0.7)",s.lineWidth=1.5,s.stroke();const P=U*.3;s.strokeStyle="#fff",s.lineWidth=1.8,s.lineCap="round",s.lineJoin="round",s.beginPath(),s.moveTo(-P*.5,0),s.lineTo(-P*.1,P*.5),s.lineTo(P*.6,-P*.4),s.stroke(),s.restore()}}else{for(const ae in ke){const j=ke[ae];s.fillStyle=Ve(ae,.18),s.beginPath();for(let Q=0;Q<j.length;Q++){const te=j[Q];s.moveTo(te._x+ce,te._y),s.arc(te._x,te._y,ce,0,6.2832)}s.fill(),s.strokeStyle=ae,s.lineWidth=2,s.stroke()}if(ue.length){s.globalAlpha=.5,s.fillStyle="#BCBCBC",s.beginPath();for(let ae=0;ae<ue.length;ae++){const j=ue[ae];s.moveTo(j._x+ce,j._y),s.arc(j._x,j._y,ce,0,6.2832)}s.fill(),s.strokeStyle="#999",s.lineWidth=2,s.stroke(),s.globalAlpha=1}if(Fe.length){s.globalAlpha=.55+.45*Math.abs(Math.sin(E)),s.fillStyle="#F0A030",s.beginPath();for(let ae=0;ae<Fe.length;ae++){const j=Fe[ae];s.moveTo(j._x+ce,j._y),s.arc(j._x,j._y,ce,0,6.2832)}s.fill(),s.strokeStyle="#C88010",s.lineWidth=2,s.stroke(),s.globalAlpha=1}for(let ae=0;ae<Re.length;ae++){const j=Re[ae],Q=_[j.grade]||Ue,te=ce*1.7;s.save(),s.shadowColor="rgba(0,0,0,0.25)",s.shadowBlur=10,s.fillStyle="#fff",s.beginPath(),s.arc(j._x,j._y,te+3,0,6.2832),s.fill(),s.shadowBlur=0,s.fillStyle=Q,s.beginPath(),s.arc(j._x,j._y,te,0,6.2832),s.fill(),s.strokeStyle="rgba(255,255,255,0.7)",s.lineWidth=2.5,s.stroke();const w=te*.55;s.strokeStyle="#fff",s.lineWidth=2.2,s.lineCap="round",s.lineJoin="round",s.beginPath(),s.moveTo(j._x-w*.35,j._y+w*.05),s.lineTo(j._x-w*.05,j._y+w*.35),s.lineTo(j._x+w*.4,j._y-w*.3),s.stroke(),s.restore()}}s.globalAlpha=1}if(he&&S){const ae=c.get(S.id),j=ae?ae.status:"available";if(j!=="sold"&&j!=="holding"&&j!=="mine"){if(s.save(),_e){const Q=(S._sw||10)+2,te=(S._sh||10)+2;s.translate(S._x,S._y),s.rotate(S._angle||0),s.shadowColor="rgba(0,0,0,0.2)",s.shadowBlur=6,s.fillStyle=Ve(Ue,.5),s.fillRect(-Q/2,-te/2,Q,te),s.shadowBlur=0,s.strokeStyle=Ve(Ue,.9),s.lineWidth=1.5,s.strokeRect(-Q/2-1,-te/2-1,Q+2,te+2)}else{const Q=_[S.grade]||Ue;s.shadowColor="rgba(0,0,0,0.2)",s.shadowBlur=8,s.fillStyle=Ve(Q,.35),s.beginPath(),s.arc(S._x,S._y,ce+1,0,6.2832),s.fill(),s.shadowColor="transparent",s.shadowBlur=0,s.strokeStyle=Ve(Q,.6),s.lineWidth=3,s.beginPath(),s.arc(S._x,S._y,ce+3,0,6.2832),s.stroke()}s.restore()}}s.restore(),s.restore()}function k(){if(b||v)return;b=!0;function T(){!b||v||(E+=.06,p(),requestAnimationFrame(T))}requestAnimationFrame(T)}function h(){b=!1}function D(){let T=!1;for(let z=0;z<l.seats.length;z++){const Y=c.get(l.seats[z].id);if(Y&&Y.status==="holding"){T=!0;break}}T&&!b&&k(),!T&&b&&h()}B(),p(),D();const R=new ResizeObserver(()=>{st(L,l,m),p()});R.observe(m);function H(T,z,Y){Y=Math.max(M,Math.min(ja,Y)),L.tx=T-(T-L.tx)*Y/L.scale,L.ty=z-(z-L.ty)*Y/L.scale,L.scale=Y,st(L,l,m),p()}e.querySelector("[data-zoom-in]").addEventListener("click",()=>{H(m.clientWidth/2,m.clientHeight/2,L.scale*Oi)}),e.querySelector("[data-zoom-out]").addEventListener("click",()=>{H(m.clientWidth/2,m.clientHeight/2,L.scale/Oi)}),e.querySelector("[data-zoom-reset]").addEventListener("click",()=>{Pi(L,l,m,M),p()}),m.addEventListener("wheel",T=>{T.preventDefault();const z=m.getBoundingClientRect(),Y=T.clientX-z.left,ce=T.clientY-z.top,he=-T.deltaY*In;H(Y,ce,L.scale*(1+he)),f&&f.parentElement&&f.remove()},{passive:!1});let X=!1,G=!1,K=0,de=0,Ae=0,Ie=0,q=null;m.addEventListener("pointerdown",T=>{if(T.button!==0||T.target.closest(".vm-zoom-controls"))return;X=!0,G=!1;const z=m.getBoundingClientRect(),Y=O(T.clientX-z.left,T.clientY-z.top);q=L.scale>=$?ji(C,l.seats,Y.x,Y.y):null,K=T.clientX,de=T.clientY,Ae=T.clientX,Ie=T.clientY,m.classList.add("dragging"),m.setPointerCapture(T.pointerId)}),m.addEventListener("pointermove",T=>{if(!X){const ce=L.scale>=$,he=m.getBoundingClientRect(),_e=O(T.clientX-he.left,T.clientY-he.top),Ee=ce?ji(C,l.seats,_e.x,_e.y):null;if(Ee!==S){if(S=Ee,Ee){const ue=c.get(Ee.id),Fe=t.find(ke=>ke.id===((ue==null?void 0:ue.section)||Ee._block))||t.find(ke=>ke.grade===((ue==null?void 0:ue.grade)||Ee.grade));kn(F,T,{...Ee,...ue},Fe==null?void 0:Fe.label);const Re=ue==null?void 0:ue.status;m.style.cursor=Re==="sold"?"not-allowed":Re==="holding"?"wait":"pointer"}else $n(F),m.style.cursor="grab";b||p()}else F.classList.contains("show")&&(F.style.left=`${T.clientX+14}px`,F.style.top=`${T.clientY-10}px`);return}const z=T.clientX-Ae,Y=T.clientY-Ie;(Math.abs(z)>Ci||Math.abs(Y)>Ci)&&(G=!0),L.tx+=T.clientX-K,L.ty+=T.clientY-de,K=T.clientX,de=T.clientY,st(L,l,m),p()});const W=()=>{const T=L.scale>=$;if(!o&&X&&!G&&q&&T){const z=c.get(q.id),Y=z?z.status:"available";Y!=="sold"&&Y!=="holding"&&a(q.id)}X=!1,q=null,m.classList.remove("dragging")};m.addEventListener("pointerup",W),m.addEventListener("pointercancel",W);let Z=0;return m.addEventListener("touchmove",T=>{if(T.touches.length===2){T.preventDefault();const z=T.touches[0].clientX-T.touches[1].clientX,Y=T.touches[0].clientY-T.touches[1].clientY,ce=Math.sqrt(z*z+Y*Y);if(Z>0){const he=ce/Z,_e=m.getBoundingClientRect(),Ee=(T.touches[0].clientX+T.touches[1].clientX)/2-_e.left,ue=(T.touches[0].clientY+T.touches[1].clientY)/2-_e.top;H(Ee,ue,L.scale*he)}Z=ce}},{passive:!1}),m.addEventListener("touchend",()=>{Z=0}),setTimeout(()=>{f&&f.parentElement&&(f.style.opacity="0",setTimeout(()=>f.remove(),600))},4e3),{updateStatuses(T){T.forEach(z=>{const Y=c.get(z.id);Y&&(Y.status=z.status)}),p(),D()},flashSold(T){const z=y.get(T);if(!z)return;let Y=0;const ce=8;function he(){if(Y>=ce||v)return;Y++,p();const _e=Math.sin(Y*Math.PI*.5)*3,Ee=window.devicePixelRatio||1;s.save(),s.scale(Ee,Ee),s.translate(L.tx,L.ty),s.scale(L.scale,L.scale),s.translate(z._x+_e,z._y),s.fillStyle="#ff4444",s.globalAlpha=1-Y/ce,s.beginPath(),s.arc(0,0,ci/2+4,0,6.2832),s.fill(),s.restore(),requestAnimationFrame(he)}requestAnimationFrame(he)},scrollToZone(T){const z=l.seats.filter(Fe=>Fe._block===T||Fe.section===T||Fe.grade===T);if(!z.length)return;let Y=0,ce=0;z.forEach(Fe=>{Y+=Fe._x,ce+=Fe._y});const he=Y/z.length,_e=ce/z.length,Ee=m.clientWidth,ue=m.clientHeight;L.scale=Math.max(1.2,L.scale),L.tx=Ee/2-he*L.scale,L.ty=ue/2-_e*L.scale,st(L,l,m),p()},destroy(){v=!0,b=!1,R.disconnect(),S=null}}}const Gi={올림픽홀:"/images/seatmaps/올림픽홀-csv.png",고척스카이돔:"/images/seatmaps/고척스카이돔.jpg"};function Un(e){var d,l;const t=Ct(e),i=new Map((e.sections||[]).map(c=>[c.id||c.name,c])),a=new Map(t.map(c=>[c.id,c])),n=t.map(c=>{var y;return{id:c.id,grade:c.grade,label:`${c.id}구역 · ${c.grade}석`,price:Number(((y=i.get(c.id))==null?void 0:y.price)??c.price??e.price??0)}}),o=Na.flatMap(c=>c.seats.map(y=>{var x;return{id:y.id,section:c.id,status:"available",price:((x=n.find(_=>_.id===c.id))==null?void 0:x.price)||0}})),r=Number(((d=i.get("Floor"))==null?void 0:d.price)??((l=a.get("Floor"))==null?void 0:l.price)??e.price??0);for(let c=0;c<ot;c++)o.push({id:`Floor-${c+1}`,section:"Floor",status:"available",price:r});return{sections:n,seats:o}}const jn={render(e,t){e.innerHTML='<div class="center-state"><div class="center-state__title">공연 정보 불러오는 중...</div></div>';let i=!1,a=null,n=null,o=null;return fetch("/events").then(r=>r.json()).then(r=>{var b;if(i)return;const d=(r.events||[]).find(v=>v.eventId===t.id);if(!d){e.innerHTML='<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>';return}const l=je(d.eventName||d.eventId),c=`--detail-poster-image: url('${l}')`,y=ri(d.sessions)||li(d.eventDate),x=[...new Set(y.map(v=>v.date))],_=x.length>1?`${x[0]} ~ ${x[x.length-1]}`:x[0]||d.eventDate||"-",u=d.description||`${d.eventName} 공연입니다.`,g=Ca(d);if(e.innerHTML=`
          <section class="detail-hero detail-hero--spread" style="${c}">
            <div class="detail-hero__overlay"></div>
            <div class="container detail-hero__content">
              <div class="detail-hero__artist">${d.eventName}</div>
              <div class="detail-hero__title">${_}</div>
              <dl class="detail-hero__meta">
                <div><dt>공연일</dt><dd>${_}</dd></div>
                <div><dt>공연장</dt><dd>${d.venue||"-"}</dd></div>
                <div><dt>총 좌석</dt><dd>${ye(d.totalSeats)}석</dd></div>
                ${d.runtime?`<div><dt>관람 시간</dt><dd>${d.runtime}</dd></div>`:""}
                ${d.ageRating?`<div><dt>관람 등급</dt><dd>${d.ageRating}</dd></div>`:""}
              </dl>
            </div>
          </section>

          <div class="container detail-body">
            <div>
              <div class="detail-info-card">
                <h3>공연 정보</h3>
                <p style="font-size:14px;line-height:1.9;color:var(--color-text-secondary);">
                  ${u}
                </p>
                <div style="margin-top:16px;padding-top:14px;border-top:1px dashed var(--color-border);">
                  <img src="${l}" alt="${d.eventName} 포스터" style="width:100%;border-radius:12px;object-fit:cover;" />
                </div>
                ${Gi[d.venue]?`
                <div style="margin-top:16px;padding-top:14px;border-top:1px dashed var(--color-border);">
                  <div style="font-size:13px;font-weight:700;color:var(--color-text-secondary);margin-bottom:8px;">좌석 배치도 — ${d.venue}</div>
                  ${d.venue==="올림픽홀"?`<div class="detail-seatmap detail-seatmap--static" data-venue-seatmap role="img" aria-label="${d.venue} 좌석 배치도"></div>`:`<img src="${Gi[d.venue]}" alt="${d.venue} 좌석배치도" style="width:100%;border-radius:12px;object-fit:contain;background:#fff;" />`}
                </div>`:""}
                ${d.cast?`
                <div style="margin-top:16px;padding-top:14px;border-top:1px dashed var(--color-border);">
                  <div style="font-size:13px;font-weight:700;color:var(--color-text-secondary);margin-bottom:6px;">출연진</div>
                  <div style="font-size:14px;font-weight:600;line-height:1.8;">${d.cast}</div>
                </div>`:""}
                ${d.agency?`
                <div style="margin-top:12px;">
                  <div style="font-size:13px;font-weight:700;color:var(--color-text-secondary);margin-bottom:4px;">주최/기획</div>
                  <div style="font-size:14px;font-weight:600;">${d.agency}</div>
                </div>`:""}
                ${d.runtime||d.ageRating?`
                <div style="margin-top:12px;display:flex;gap:24px;">
                  ${d.runtime?`<div><div style="font-size:13px;font-weight:700;color:var(--color-text-secondary);margin-bottom:4px;">관람 시간</div><div style="font-size:14px;font-weight:600;">${d.runtime}</div></div>`:""}
                  ${d.ageRating?`<div><div style="font-size:13px;font-weight:700;color:var(--color-text-secondary);margin-bottom:4px;">관람 등급</div><div style="font-size:14px;font-weight:600;">${d.ageRating}</div></div>`:""}
                </div>`:""}
              </div>
              <div class="detail-info-card">
                <h3>티켓 가격</h3>
                ${g.map(({grade:v,price:$})=>`<div class="price-row"><span>${v}석</span><b>${ve($)}</b></div>`).join("")}
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
        `,d.venue==="올림픽홀"){const v=Un(d);o=Fi(e.querySelector("[data-venue-seatmap]"),{sections:v.sections,seats:v.seats,readOnly:!0,venue:"올림픽홀"})}let m=null,F=null,f=!0;const s=new Set(y.map(v=>v.date)),A=ie().bookings.filter(v=>v.concertId===d.eventId&&(v.status==="confirmed"||v.status==="unpaid")),I=new Set(A.map(v=>{var $;return($=v.session)==null?void 0:$.date}).filter(Boolean)),C=A.length>=2;function O(v){const $=new Date(y[0].date);let M=$.getFullYear(),B=$.getMonth();const p=["일","월","화","수","목","금","토"];function k(){const h=new Date(M,B+1,0).getDate(),D=new Date(M,B,1).getDay();let R="";for(let G=0;G<D;G++)R+='<div class="bcal-day bcal-day--empty"></div>';for(let G=1;G<=h;G++){const K=`${M}-${String(B+1).padStart(2,"0")}-${String(G).padStart(2,"0")}`,de=s.has(K)&&!I.has(K),Ae=s.has(K)&&I.has(K),q=["bcal-day",Ae?"bcal-day--disabled":de?"bcal-day--valid":"bcal-day--disabled",K===m?"bcal-day--selected":""].join(" ");R+=`<div class="${q}" ${de?`data-cal-date="${K}"`:""}>${G}${Ae?'<span style="display:block;font-size:10px;color:var(--color-red);">예매완료</span>':""}</div>`}const H=m?y.filter(G=>G.date===m):[];let X;m?X=H.map(G=>{const K=y.indexOf(G);return`<button type="button" class="chip-btn ${K===F?"active":""}" data-pick-session="${K}" style="padding:10px 20px;font-size:14px;">${G.round}회 ${G.time}</button>`}).join(""):X='<span style="font-size:13px;color:var(--color-text-secondary);">날짜를 먼저 선택해주세요</span>',v.innerHTML=`
              <div class="bcal">
                <div class="bcal-section">
                  <div class="bcal-section-hd"><span style="font-weight:700;">관람일</span></div>
                  <div class="bcal-nav">
                    <button type="button" data-cal-dir="-1" class="bcal-nav-btn">‹</button>
                    <span class="bcal-nav-title">${M}. ${String(B+1).padStart(2,"0")}</span>
                    <button type="button" data-cal-dir="1" class="bcal-nav-btn">›</button>
                  </div>
                  <div class="bcal-weekdays">${p.map(G=>`<span>${G}</span>`).join("")}</div>
                  <div class="bcal-grid">${R}</div>
                </div>
                <div class="bcal-section" style="border-top:1px solid var(--color-border);">
                  <div class="bcal-section-hd"><span style="font-weight:700;">회차</span></div>
                  <div style="padding:0 20px 16px;display:flex;gap:8px;flex-wrap:wrap;" data-session-area>${X}</div>
                </div>
                <div style="padding:0 20px 4px;font-size:12px;color:var(--color-text-secondary);">
                  · 공연일마다 <strong>1매</strong>, 인당 최대 <strong>2매</strong> 예매 가능
                </div>
              </div>
            `,v.querySelectorAll("[data-cal-dir]").forEach(G=>{G.addEventListener("click",()=>{B+=parseInt(G.dataset.calDir),B<0&&(B=11,M--),B>11&&(B=0,M++),k()})}),v.querySelectorAll("[data-cal-date]").forEach(G=>{G.addEventListener("click",()=>{m=G.dataset.calDate,F=null,k(),L()})}),v.querySelectorAll("[data-pick-session]").forEach(G=>{G.addEventListener("click",()=>{F=parseInt(G.dataset.pickSession),k(),L()})})}k()}O(e.querySelector("[data-booking-cal]"));function L(){if(!f)return;const v=e.querySelector("[data-book]");v&&(F==null?(v.disabled=!0,v.textContent="날짜를 선택해주세요"):(v.disabled=!1,v.textContent="예매하기"))}(b=e.querySelector("[data-book]"))==null||b.addEventListener("click",()=>{if(!Ce()){Xe(`concert/${d.eventId}`),V("login");return}if(C){Qo(async()=>{const{showToast:$}=await Promise.resolve().then(()=>mo);return{showToast:$}},void 0).then(({showToast:$})=>{$({title:"예매 한도 초과",body:"이 공연은 1인당 최대 2매까지 예매 가능합니다."})});return}if(F==null)return;const v=y[F];et(d.eventId,{date:v.date,time:v.time}),V(`queue/${d.eventId}`)}),Pa(e.querySelector("[data-refund-summary]")),n=bn(e.querySelector("[data-live]"),{concertId:d.eventId,artist:d.eventName});const S=e.querySelector("[data-book]");function E(v){f=!1;function $(){const M=v-Date.now();if(M<=0){clearInterval(a),a=null,f=!0,L(),S.classList.remove("btn--countdown");return}S.disabled=!0,S.classList.add("btn--countdown"),S.textContent=`예매 시작까지 ${wt(M)}`}$(),a=setInterval($,1e3)}if(d.ticketOpenAt){const v=new Date(d.ticketOpenAt).getTime();Number.isNaN(v)||E(v)}else fetch("/admin/ticketing/schedule").then(v=>v.json()).then(v=>{if(i||!v.scheduled||!v.openAt)return;const $=new Date(v.openAt).getTime();Number.isNaN($)||E($)}).catch(()=>{})}).catch(()=>{i||(e.innerHTML='<div class="center-state"><div class="center-state__title">공연 정보를 불러오지 못했습니다.</div></div>')}),()=>{i=!0,a&&clearInterval(a),n&&n(),o&&o.destroy()}}},Gn=[{name:"수성",pct:9,color:"#b4a695"},{name:"금성",pct:20,color:"#e7c98a"},{name:"지구",pct:32,color:"#4f9bdb"},{name:"화성",pct:44,color:"#d1602f"},{name:"목성",pct:58,color:"#dcae7c"},{name:"토성",pct:71,color:"#e8d4a0"},{name:"천왕성",pct:84,color:"#a7e2da"},{name:"해왕성",pct:95,color:"#5b7cfa"}];function Wn(e,t=0){e.innerHTML=`
    <div class="rocket-wrap">
      <div class="rocket-track rocket-track--space">
        <div class="rocket-fill" data-fill></div>
        ${Gn.map(o=>`
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
  `;const i=e.querySelector("[data-fill]"),a=e.querySelector("[data-ship]");function n(o){const r=Math.max(0,Math.min(100,o));i.style.width=`${r}%`,a.style.left=`${r}%`}return n(t),{update:n}}const Wi=1500,zn=100,Yn=1e3,Vn={render(e,t){e.innerHTML='<div class="center-state"><div class="center-state__title">대기열 진입 중...</div></div>';let i=!1,a=null;return fetch("/events").then(n=>n.json()).then(n=>{var p,k;if(i)return;const o=(n.events||[]).find(h=>h.eventId===t.id);if(!o){e.innerHTML='<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>';return}const r=((p=ie().user)==null?void 0:p.userId)||((k=ie().user)==null?void 0:k.email);if(!r){e.innerHTML='<div class="center-state"><div class="center-state__title">로그인이 필요합니다</div></div>',V("login");return}let d=$t(o.eventId);!d&&Array.isArray(o.sessions)&&o.sessions[0]&&(d={date:o.sessions[0].date||"",time:o.sessions[0].time||""},et(o.eventId,d));const l={eventId:o.eventId,sessionDate:(d==null?void 0:d.date)||"",sessionTime:(d==null?void 0:d.time)||""};e.innerHTML=`
          <section class="queue-page container">
            <div class="eyebrow">BOOKING QUEUE · STEP 3</div>
            <div class="section-title" style="margin-bottom:4px;">${o.eventName} 예매 대기열</div>
            <div class="section-sub">${d?`${d.date} ${d.time}`:""}</div>

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
        `;const c=Wn(e.querySelector("[data-rocket]"),0),y=e.querySelector("[data-mynum]"),x=e.querySelector("[data-mynum-label]"),_=e.querySelector("[data-total]"),u=e.querySelector("[data-eta]"),g=e.querySelector("[data-status]"),m=e.querySelector("[data-enter-box]");let F=null,f=null,s=null,A=!1,I=!1;function C(){F&&clearInterval(F),f&&clearInterval(f),s&&clearTimeout(s),F=null,f=null,s=null}function O(){A||(A=!0,C(),c.update(100),g.textContent="입장 완료",u.textContent="입장 완료",m.innerHTML=`
            <div class="badge badge-green" style="font-size:13px;padding:8px 16px;margin-bottom:16px;">입장이 완료되었습니다</div>
            <div style="font-size:15px;color:var(--color-text-secondary);">이제 좌석 구역으로 이동합니다...</div>
          `,s=setTimeout(()=>V(`zones/${o.eventId}`),1400))}function L(h){const R=Math.max(0,Math.ceil(h/zn)-1)*Wi;if(R<=0)return"곧 입장";const H=Math.ceil(R/1e3);return H<60?`약 ${H}초`:`약 ${Math.ceil(H/60)}분`}function S(h){const D=h.type==="standby",R=D?h.standbyPosition:h.position,H=D?h.totalStandby:h.totalWaiting;x.textContent=D?"취소표 대기번호":"내 대기번호",y.textContent=ye(R),y.classList.toggle("hot",R<=1e3),y.classList.toggle("pulse-red",R<=200),_.textContent=H!=null?`${ye(H)}명`:"-",g.textContent=D?"취소표 대기 중":"대기 중",u.textContent=D?"취소표 발생 시 안내":L(R);const X=H>0?Math.min(99,Math.max(1,Math.round((1-R/H)*100))):1;c.update(D?Math.min(X,40):X)}function E(){const h=new URLSearchParams(l);fetch(`/queue/position/${encodeURIComponent(r)}?${h.toString()}`).then(D=>D.json()).then(D=>{if(!A){if(D.status==="admitted"){g.textContent="입장 허용됨 · 토큰 발급 중...";return}if(D.status==="not_found"){B();return}S(D)}}).catch(()=>{})}function b(){return fetch("/queue/admit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(l)}).then(h=>h.json()).then(h=>{var R;const D=(R=h.tokens)==null?void 0:R[r];D!=null&&D.token&&(_t(o.eventId,D,d),O())}).catch(()=>{})}function v(){F||f||(E(),f=setInterval(E,Yn),F=setInterval(b,Wi))}function $(h){if(!A){if(h.status==="closed"){g.textContent="마감",m.innerHTML=`<div class="notice-box"><p>${h.message||"현재 티켓팅이 마감되었습니다."}</p></div>`;return}if(h.status==="error"){g.textContent="오류",m.innerHTML=`<div class="notice-box"><p>${h.message||"대기열 진입 중 오류가 발생했습니다."}</p></div>`;return}if(h.token){_t(o.eventId,h,d),O();return}v(),b()}}function M(){return fetch("/queue/enter",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:r,...l})}).then(h=>h.json()).then($).catch(()=>{g.textContent="오류",m.innerHTML='<div class="notice-box"><p>대기열 진입에 실패했습니다. 새로고침 후 다시 시도해주세요.</p></div>'})}function B(){I||A||(I=!0,C(),g.textContent="대기열 재진입 중...",M().finally(()=>{I=!1}))}M(),a=C}).catch(()=>{i||(e.innerHTML='<div class="center-state"><div class="center-state__title">대기열 진입에 실패했습니다.</div></div>')}),()=>{i=!0,a&&a()}}};function ui(e){var t,i;if(ze()){const a=$a(e);be({title:"매진 안내",bodyHtml:`
        <p>본 콘서트의 티켓이 마감되었습니다.</p>
        <p class="mt-16">취소 티켓팅 대기번호는 <b class="text-red">${ye(a.myNumber)}</b>번입니다.<br/>취소 티켓팅 날에 가입하신 이메일로 알림과 링크를 보내드리겠습니다.</p>
      `,footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close data-confirm>확인</button>'}),(t=document.querySelector("[data-confirm]"))==null||t.addEventListener("click",()=>{V(`cancel-queue/${e}`)})}else be({title:"매진 안내",bodyHtml:`
        <p>본 콘서트의 티켓이 마감되었습니다.</p>
        <p class="mt-16 text-secondary" style="font-size:13px;">다음 콘서트에서는 취소 티켓팅 대기를 하고 싶으시면?</p>
      `,footerHtml:`
        <button type="button" class="btn btn-outline" data-modal-close>닫기</button>
        <button type="button" class="btn btn-primary" data-join-membership>멤버십 가입</button>
      `}),(i=document.querySelector("[data-join-membership]"))==null||i.addEventListener("click",()=>{Me(),V("membership")})}const zi={VIP:"#B5121B",R:"#C98500",S:"#199E70",A:"#3987E5"},Yi=["#B5121B","#C98500","#199E70","#3987E5","#8E44AD","#16A085","#D35400","#2C3E50"],Kn=4e3,Jn=8*60*1e3+42*1e3,Xn=["일","월","화","수","목","금","토"];function zt(e,t){const i=(e==null?void 0:e.date)||t;if(!i)return"";const[a,n,o]=i.split("-").map(Number),r=Xn[new Date(a,n-1,o).getDay()],d=e!=null&&e.time?` ${e.time}`:"";return`${a}년 ${n}월 ${o}일 (${r})${d}`}function Zn(e,t){return e.color||zi[e.grade]||zi[e.name]||Yi[t%Yi.length]}function nt({seatId:e,userId:t}){!e||!t||fetch("/seats/release",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:t,seatId:e})}).catch(()=>{})}function Qn(e,t,i){e.innerHTML='<div class="center-state"><div class="center-state__title">좌석 정보 불러오는 중...</div></div>';let a=!1,n=null,o=null,r=null,d=null,l=null;const c=[];return fetch("/events").then(y=>y.json()).then(y=>{const x=(y.events||[]).find(s=>s.eventId===t);if(!x)return{eventsData:y,seatsData:{seats:[]},selectedSession:null};const _=ri(x.sessions)||li(x.eventDate),u=new Set(ie().bookings.filter(s=>s.concertId===t&&(s.status==="confirmed"||s.status==="unpaid")).map(s=>{var A;return(A=s.session)==null?void 0:A.date}).filter(Boolean)),g=_.filter(s=>!u.has(s.date)),m=$t(t),F=m&&!u.has(m.date)?m:g[0]||_[0]||null;F&&(!m||m.date!==F.date||m.time!==F.time)&&et(t,{date:F.date,time:F.time});const f=new URLSearchParams({eventId:t});return F!=null&&F.date&&f.set("sessionDate",F.date),F!=null&&F.time&&f.set("sessionTime",F.time),fetch(`/seats?${f.toString()}`).then(s=>s.json()).then(s=>({eventsData:y,seatsData:s,selectedSession:F}))}).then(({eventsData:y,seatsData:x,selectedSession:_})=>{if(a)return;const u=(y.events||[]).find(w=>w.eventId===t);if(!u){e.innerHTML='<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>';return}const g=x.seats||[],m=(u.sections||[]).length?u.sections:[{name:"A",seats:u.totalSeats,price:u.price}],F=u.venue==="올림픽홀"?new Map(Ct(u).map(w=>[w.id,w])):new Map,f=u.venue==="올림픽홀"?m.map(w=>{const U=w.name||w.id,P=F.get(U);return{...w,id:U,name:U,grade:(P==null?void 0:P.grade)||w.grade||U,label:(P==null?void 0:P.label)||w.label||`${U}구역`}}):m;let s=_||$t(u.eventId);const A=ri(u.sessions)||li(u.eventDate),I=ie().bookings.filter(w=>w.concertId===u.eventId&&(w.status==="confirmed"||w.status==="unpaid")),C=new Set(I.map(w=>{var U;return(U=w.session)==null?void 0:U.date}).filter(Boolean)),O=2;if(I.length>=O){e.innerHTML=`
          <div class="container" style="padding:60px 0;text-align:center;">
            <div class="soldout-panel">
              <div class="soldout-title">예매 한도 초과</div>
              <div class="soldout-desc">이 공연은 1인당 최대 ${O}매까지 예매 가능합니다.<br/>이미 ${I.length}매를 예매하셨습니다.</div>
              <button class="btn btn-primary mt-24" onclick="location.hash='#/mypage'">마이페이지로 이동</button>
            </div>
          </div>
        `;return}const L=A.filter(w=>!C.has(w.date));if(L.length===0){e.innerHTML=`
          <div class="container" style="padding:60px 0;text-align:center;">
            <div class="soldout-panel">
              <div class="soldout-title">예매 가능한 날짜 없음</div>
              <div class="soldout-desc">모든 공연일의 예매가 완료되었습니다.</div>
              <button class="btn btn-primary mt-24" onclick="location.hash='#/mypage'">마이페이지로 이동</button>
            </div>
          </div>
        `;return}s&&C.has(s.date)&&(s={date:L[0].date,time:L[0].time},et(u.eventId,s)),!s&&L[0]&&(s={date:L[0].date,time:L[0].time},et(u.eventId,s));const S=`${u.eventId}:`;function E(w){return w.seatId.startsWith(S)}const b=[],v=[],$={};let M=0;if(f.forEach((w,U)=>{var le;const P=g.filter(pe=>pe.section===w.name&&E(pe)),se=P.filter(pe=>pe.status==="AVAILABLE");M+=se.length;const re=Zn(w,U),Se=u.venue==="올림픽홀"&&w.grade?`${w.name}구역 · ${w.grade}석`:`${w.name}구역`;$[w.name]={label:Se,grade:w.grade||w.name,price:Number(((le=se[0])==null?void 0:le.price)||w.price||u.price)||0,color:re},P.length!==0&&(b.push({id:w.name,label:Se,grade:w.grade||w.name,zone:u.eventName,cols:P.length,color:re}),P.forEach((pe,me)=>{const Ye=pe.seatId.includes(":")?pe.seatId.split(":").pop():pe.seatId;let Ge="available";pe.status==="SOLD"?Ge="sold":pe.status==="HELD"&&(Ge="holding"),v.push({id:pe.seatId,section:pe.section,zoneId:w.name,row:Ye.split("-")[0],seatNum:parseInt(Ye.split("-")[1],10)||me+1,grade:w.grade||w.name,status:Ge,price:Number(pe.price||w.price||u.price)||0})}))}),M===0){e.innerHTML=`
          <div class="container" style="padding:60px 0;">
            <div class="soldout-panel">
              <div class="soldout-title">SOLD OUT</div>
              <div class="soldout-desc">티켓이 모두 매진되었습니다.<br/>현재 예매 가능한 좌석이 없습니다.</div>
            </div>
          </div>
        `,ui(u.eventId);return}const B=["VIP","R","S","A"],p=[],k=new Set;b.forEach(w=>{const U=$[w.id],P=String((U==null?void 0:U.grade)||"").replace(/석$/,"").trim();!U||!B.includes(P)||k.has(P)||(k.add(P),p.push({grade:P,price:U.price,color:U.color}))}),p.sort((w,U)=>B.indexOf(w.grade)-B.indexOf(U.grade)),lo(),e.innerHTML=`
        <section class="seat-page-header">
          <div class="container seat-page-header__top">
            <div>
              <div class="seat-page-header__title">${u.eventName}</div>
              <div class="seat-page-header__date">
                <span data-session-date>${zt(s,u.eventDate)}</span> · ${u.venue}
              </div>
            </div>
            <div class="seat-page-header__right"></div>
          </div>
        </section>
        <div class="container">
          <div class="seats-left-banner" data-banner>
            <div><div class="seats-left-banner__msg">실시간으로 좌석이 예매되고 있습니다.</div></div>
            <div style="text-align:right;">
              <div class="seats-left-banner__num num-mono" data-remaining>${ye(M)}석</div>
            </div>
          </div>
        </div>
        <div class="container" style="padding-top:12px;padding-bottom:0;">
          <div class="chip-row" data-session-tabs style="gap:8px;flex-wrap:wrap;">
            ${A.map((w,U)=>{const P=C.has(w.date);return`
              <button type="button" class="chip-btn ${!P&&(s==null?void 0:s.date)===w.date&&(s==null?void 0:s.time)===w.time?"active":""}" data-session-tab="${U}" ${P?"disabled":""} style="flex:1;min-width:calc(50% - 6px);justify-content:center;padding:10px 12px;font-size:13px;${P?"opacity:0.4;text-decoration:line-through;":""}">
                ${w.shortLabel} ${w.round}회 ${w.time}${P?" (예매완료)":""}
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
            ${p.map(({grade:w,price:U,color:P})=>`<span><span class="zone-legend__dot" style="background:${P}"></span>${w}석 · ${ve(U)}</span>`).join("")}
          </div>
        </div>
      `;const h=e.querySelector("[data-seatmap]"),D=e.querySelector("[data-order-box]"),R=1;let H=[],X=null,G=!1;function K(w="색칠된 구역의 좌석 중 원하는 자리를 선택해주세요"){D.innerHTML=`<div class="order-rail__title">선택 좌석 정보</div><div class="order-rail__session" data-order-session>${zt(s,u.eventDate)}</div><div class="order-rail__empty">${w}</div>`}K(),e.querySelectorAll("[data-session-tab]").forEach(w=>{w.addEventListener("click",()=>{var se,re;const U=parseInt(w.dataset.sessionTab),P=A[U];if(!(!P||(s==null?void 0:s.date)===P.date&&(s==null?void 0:s.time)===P.time)){if(C.has(P.date)){J({title:"이미 예매한 날짜입니다",body:`${P.shortLabel} 공연은 이미 예매가 완료되었습니다.`});return}if(H.length){ke();const Se=((se=ie().user)==null?void 0:se.userId)||((re=ie().user)==null?void 0:re.email);H.forEach(le=>{nt({seatId:le.id,userId:Se}),le.status="available"}),H=[],c.length=0}s={date:P.date,time:P.time},et(u.eventId,s),J({title:"공연 일정이 변경되었습니다",body:P.label,type:"success"}),V(`zones/${u.eventId}`)}})});const de=1200,Ae=8;function Ie(w,U){return fetch("/queue/admit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({eventId:u.eventId,sessionDate:(s==null?void 0:s.date)||"",sessionTime:(s==null?void 0:s.time)||""})}).then(P=>P.json()).then(P=>{var re;const se=(re=P.tokens)==null?void 0:re[w];if(se!=null&&se.token)return _t(u.eventId,se,s),se.token;if(U<=0)throw new Error("token_unavailable");return new Promise(Se=>setTimeout(Se,de)).then(()=>Ie(w,U-1))})}function q(w){const U=Sa(u.eventId,s);return U!=null&&U.token?Promise.resolve(U.token):fetch("/queue/enter",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:w,eventId:u.eventId,sessionDate:(s==null?void 0:s.date)||"",sessionTime:(s==null?void 0:s.time)||""})}).then(P=>P.json()).then(P=>P.token?(_t(u.eventId,P,s),P.token):Ie(w,Ae))}const W=new Set(["no_token","expired","revoked","invalid","user_mismatch","mismatch","session_mismatch"]);function Z(w,U,P){return fetch("/seats/hold",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:w,seatId:U,token:P,eventId:u.eventId,sessionDate:(s==null?void 0:s.date)||"",sessionTime:(s==null?void 0:s.time)||""})}).then(se=>se.json().then(re=>({ok:se.ok,data:re})))}function T(w){var se,re;const U=((se=ie().user)==null?void 0:se.userId)||((re=ie().user)==null?void 0:re.email);nt({seatId:w.id,userId:U}),w.status="available",H=H.filter(Se=>Se.id!==w.id);const P=c.findIndex(Se=>Se.seatId===w.id);P>=0&&c.splice(P,1),Y.updateStatuses(v),H.length===0?(ke(),K()):Fe()}function z(w){var re,Se;if(G)return;const U=v.find(le=>le.id===w);if(!U)return;const P=((re=ie().user)==null?void 0:re.userId)||((Se=ie().user)==null?void 0:Se.email);if(!P){J({title:"로그인이 필요합니다",body:"좌석을 선점하려면 먼저 로그인해주세요.",type:"default"});return}const se=H.find(le=>le.id===w);if(se){T(se);return}if(H.length>=R){const le=H[0];nt({seatId:le.id,userId:P}),le.status="available",H=[];const pe=c.findIndex(me=>me.seatId===le.id);pe>=0&&c.splice(pe,1),ke(),Y.updateStatuses(v)}G=!0,q(P).then(le=>Z(P,w,le)).then(le=>!le.ok&&W.has(le.data.reason)?(ro(u.eventId,s),q(P).then(pe=>Z(P,w,pe))):le).then(({ok:le,data:pe})=>{if(!le||!pe.success){J({title:"좌석을 선점하지 못했습니다",body:pe.message||"이미 다른 사용자가 선택했거나 만료되었습니다.",type:"default"}),pe.reason==="unavailable"&&(U.status=U.status==="available"?"holding":U.status,Y.updateStatuses(v));return}U.status="mine",H.push(U),c.push({seatId:U.id,userId:P}),Y.updateStatuses(v),H.length===1&&Re(),Fe()}).catch(le=>{(le==null?void 0:le.message)==="token_unavailable"?J({title:"입장 허용 대기 중입니다",body:"아직 대기열 순서가 오지 않았거나 티켓팅이 열리지 않았을 수 있어요. 잠시 후 다시 시도해주세요.",type:"default"}):J({title:"좌석 선점 요청에 실패했습니다",body:"네트워크 상태를 확인하고 다시 시도해주세요.",type:"default"})}).finally(()=>{G=!1})}const Y=Fi(h,{sections:b,seats:v,onSeatClick:z,seatingType:u.seatingType,venue:u.venue});r=Y;const ce={"seat.held":"holding","seat.sold":"sold","seat.released":"available","seat.cancelled":"available"};let he=!1;function _e(){n||(n=setInterval(te,Kn))}function Ee(){n&&(clearInterval(n),n=null)}function ue(){if(a)return;const w=ie().user;d=vn(u.eventId,(w==null?void 0:w.email)||"anonymous",(w==null?void 0:w.name)||"게스트",{onMessage:U=>{if(!(U!=null&&U.seatId)||!U.type||H.some(re=>re.id===U.seatId))return;const P=v.find(re=>re.id===U.seatId);if(!P)return;const se=ce[U.type];if(se&&P.status!==se){P.status=se,Y.updateStatuses(v);const re=e.querySelector("[data-remaining]");if(re){const Se=v.filter(le=>le.status==="available").length;re.textContent=`${ye(Se)}석`}}},onOpen:()=>{console.log("[Seats WS] 연결 성공 — 폴링 중지"),he=!0,Ee()},onClose:()=>{console.log("[Seats WS] 연결 종료 — 폴링 fallback 시작"),he=!1,_e(),a||(l=setTimeout(ue,3e3))}})}ue();function Fe(){const w=H.reduce((U,P)=>U+Number(P.price||0),0);D.innerHTML=`
          <div class="order-rail__title">선택 좌석 (${H.length}/${R})</div>
          <div class="order-rail__session">${zt(s,u.eventDate)}</div>
          <div class="order-rail__seat-list">
            ${H.map(U=>`
              <div class="order-rail__seat-item">
                <div>
                  <div class="order-rail__seat-grade">${$[U.zoneId||U.section||U.grade].label}</div>
                  <div class="order-rail__seat-loc">${U._displayNum||U.seatNum}번</div>
                </div>
                <div style="text-align:right;">
                  <div class="order-rail__seat-price num-mono">${ve(U.price)}</div>
                  <button type="button" class="order-rail__seat-remove" data-remove-seat="${U.id}">취소</button>
                </div>
              </div>`).join("")}
          </div>
          <div class="order-rail__total">
            <span>총 결제 금액</span>
            <b class="num-mono">${ve(w)}</b>
          </div>
          <button class="btn btn-primary btn-block" data-next>선택 완료</button>
        `,D.querySelectorAll("[data-remove-seat]").forEach(U=>{U.addEventListener("click",()=>{const P=H.find(se=>se.id===U.dataset.removeSeat);P&&T(P)})}),D.querySelector("[data-next]").addEventListener("click",()=>{const U=X;ke(),c.length=0,bi({concertId:u.eventId,session:s,seats:H.map(P=>({...P,gradeName:$[P.zoneId||P.section||P.grade].label})),source:"regular",securedAt:Date.now(),holdDeadline:U}),V("payment/regular")})}function Re(){ke(),X=Date.now()+Jn,o=setInterval(()=>{var U,P;if(X-Date.now()<=0){ke();const se=((U=ie().user)==null?void 0:U.userId)||((P=ie().user)==null?void 0:P.email);H.forEach(re=>{nt({seatId:re.id,userId:se}),re.status="available"}),H=[],c.length=0,Y.updateStatuses(v),K("시간이 만료되었습니다. 다시 선택해주세요.");return}},1e3)}function ke(){o&&clearInterval(o),o=null}const ae=new Map(v.map(w=>[w.id,w])),j=new Set;let Q=!1;function te(){const w=new URLSearchParams({eventId:u.eventId});s!=null&&s.date&&w.set("sessionDate",s.date),s!=null&&s.time&&w.set("sessionTime",s.time),fetch(`/seats?${w.toString()}`).then(U=>U.json()).then(U=>{const P=U.seats||[],se=f.map(me=>me.name);let re=!1;H.forEach(me=>j.add(me.id));const Se=new Map;for(const me of P){if(!E(me))continue;Se.set(me.seatId,me.status);const Ye=ae.get(me.seatId);if(!Ye||j.has(Ye.id))continue;let Ge="available";me.status==="SOLD"?Ge="sold":me.status==="HELD"&&(Ge="holding"),Ye.status!==Ge&&(Ye.status=Ge,re=!0)}for(const me of v)j.has(me.id)||me.status!=="available"&&!Se.has(me.id)&&(me.status="available",re=!0);j.clear(),re&&Y.updateStatuses(v);const le=P.filter(me=>se.includes(me.section)&&E(me)&&me.status==="AVAILABLE").length,pe=e.querySelector("[data-remaining]");pe&&(pe.textContent=`${ye(le)}석`),!Q&&le===0&&(Q=!0,Ee(),ui(u.eventId))}).catch(()=>{})}he||_e()}).catch(()=>{a||(e.innerHTML='<div class="center-state"><div class="center-state__title">좌석 정보를 불러오지 못했습니다.</div></div>')}),()=>{a=!0,n&&clearInterval(n),o&&clearInterval(o),l&&clearTimeout(l),d&&d.close(),c.forEach(y=>nt(y)),r==null||r.destroy()}}const ed={render(e,t){return Qn(e,t.id)}};function pi(e,t){return Math.floor(e+Math.random()*(t-e+1))}function td(e){const t=[];return e.forEach(i=>{const a=i.count!=null?i.count:i.rows*i.cols,n=i.cols,o=i.rows||Math.ceil(a/n);for(let r=0;r<a;r++){const d=Math.floor(r/n),l=r%n,c=o>1?1-d/(o-1):1,y=(n-1)/2||1,x=1-Math.abs(l-y)/y,_=c*.6+x*.4;t.push({id:`${i.grade}-${d+1}-${l+1}`,grade:i.grade,label:i.label,section:i.zone||`${i.grade[0]}구역`,row:d+1,seatNum:l+1,popularity:_,status:"available"})}}),t}const id={VIP:3.2,R:1.8,S:1.2,A:1};function ad(e,t){if(t<=0||e.length===0)return[];const i=[];e.forEach(o=>{const r=id[o.grade]||1,d=Math.max(1,Math.round(r*(.5+(o.popularity||0)*1.5)*3));for(let l=0;l<d;l++)i.push(o)});const a=new Set;let n=0;for(;a.size<Math.min(t,e.length)&&n<i.length*4;){const o=i[pi(0,i.length-1)];a.add(o),n++}return[...a]}function od(e,t={}){const{tickMs:i=850,holdRangeMs:a=[900,2e3],onTick:n=()=>{},onSoldOut:o=()=>{}}=t;let r=null,d=null,l=!1;const c=new Set;function y(){const u=e.length;let g=0,m=0,F=0;const f={};return e.forEach(s=>{f[s.grade]=f[s.grade]||{total:0,available:0},f[s.grade].total+=1,s.status==="sold"?g+=1:s.status==="mine"?m+=1:s.status==="holding"&&(F+=1),s.status==="available"&&(f[s.grade].available+=1)}),{total:u,sold:g,mine:m,holding:F,available:u-g-m-F,byGrade:f}}function x(){const u=y();return u.available===0&&u.holding===0?(stop(),o(),!0):!1}function _(){if(l)return;const u=e.filter(s=>s.status==="available");if(u.length===0){x()||(r=setTimeout(_,i));return}let g;u.length<=12?g=1:u.length<=80?g=pi(2,5):g=Math.max(3,Math.floor(u.length*(.04+Math.random()*.07))),ad(u,g).forEach(s=>{s.status="holding";const A=pi(a[0],a[1]),I=setTimeout(()=>{c.delete(I),!(l||s.status!=="holding")&&(s.status="sold",n(e,y()),x())},A);c.add(I)}),n(e,y());const F=y();if(F.available===0&&F.holding===0)return;const f=Math.max(260,i-(1-F.available/F.total)*400);r=setTimeout(_,f)}return{start(){l=!1,r=setTimeout(_,i)},stop(){l=!0,r&&clearTimeout(r),c.forEach(u=>clearTimeout(u)),c.clear()},stats:y,getMineId:()=>d,selectSeat(u){const g=e.find(m=>m.id===u);if(!g||g.status!=="available")return{ok:!1,reason:g&&g.status==="holding"?"holding":"sold"};if(Math.random()<.15)return g.status="sold",n(e,y()),{ok:!1,reason:"taken"};if(d){const m=e.find(F=>F.id===d);m&&m.status==="mine"&&(m.status="available")}return g.status="mine",d=u,n(e,y()),{ok:!0,seat:g}},releaseMine(){if(d){const u=e.find(g=>g.id===d);u&&u.status==="mine"&&(u.status="available"),d=null,n(e,y())}}}}function Ga(e,t=120){return[{grade:e.grade,label:e.label,zone:e.label,cols:12,count:t}]}const Vi=location.host,Ki=5,nd=1e3;function dd(e,{onMessage:t,onStatusChange:i}={}){let a=null,n=0,o=!1;function r(){if(!o){try{a=new WebSocket(`ws://${Vi}/ws/seats/${e}`)}catch(d){console.warn("[SeatSocket] WebSocket 생성 실패:",d.message),i==null||i("failed");return}a.addEventListener("open",()=>{console.log(`[SeatSocket] 연결 성공 (${Vi})`),n=0,i==null||i("connected")}),a.addEventListener("message",d=>{try{const l=JSON.parse(d.data);t==null||t(l)}catch{}}),a.addEventListener("close",()=>{if(!o)if(n<Ki){const d=nd*Math.pow(2,n)+Math.random()*500;n++,console.log(`[SeatSocket] 재연결 시도 ${n}/${Ki} (${Math.round(d)}ms 후)`),i==null||i("reconnecting"),setTimeout(r,d)}else console.warn("[SeatSocket] 최대 재연결 횟수 초과"),i==null||i("failed")}),a.addEventListener("error",()=>{})}}return r(),{close(){o=!0,a&&a.readyState<=WebSocket.OPEN&&a.close()}}}const Ii=3e3;async function sd(e){const t=new AbortController,i=setTimeout(()=>t.abort(),Ii);try{const a=await fetch(e,{signal:t.signal});if(!a.ok)throw new Error(`HTTP ${a.status}`);return await a.json()}finally{clearTimeout(i)}}async function rd(e={}){const t=new URLSearchParams;Object.entries(e).forEach(([a,n])=>{n&&t.set(a,n)});const i=await sd(`/seats${t.toString()?`?${t.toString()}`:""}`);return Array.isArray(i.seats)?i.seats:[]}async function ld(e,t,i,a={}){const n=new AbortController,o=setTimeout(()=>n.abort(),Ii);try{return await(await fetch("/seats/hold",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:e,seatId:t,token:i,...a}),signal:n.signal})).json()}finally{clearTimeout(o)}}async function Ji(e,t,i={}){const a=new AbortController,n=setTimeout(()=>a.abort(),Ii);try{return await(await fetch("/seats/release",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:e,seatId:t,...i}),signal:a.signal})).json()}finally{clearTimeout(n)}}const Xi=8*60*1e3+42*1e3,cd=168,yd={VIP:"#B5121B",R:"#C98500",S:"#199E70",A:"#3987E5"},xd={AVAILABLE:"available",HELD:"holding",SOLD:"sold",CANCELLED:"available"};function ud(e,t){return t.every(i=>ni(e,i.id)<=0)}function Zi(e,t,i,a){ud(t.id,a)?(e.innerHTML=`
      <div class="soldout-panel">
        <div class="soldout-title">SOLD OUT</div>
        <div class="soldout-desc">티켓이 모두 매진되었습니다.<br/>현재 예매 가능한 좌석이 없습니다.</div>
      </div>
    `,ui(t.id)):(e.innerHTML=`
      <div class="soldout-panel">
        <div class="soldout-title" style="font-size:30px;">${i.label} 매진</div>
        <div class="soldout-desc">이 구역의 좌석이 모두 판매되었습니다.<br/>다른 구역에는 아직 좌석이 남아있어요.</div>
        <div class="soldout-actions">
          <button class="btn btn-primary btn-lg" data-back-zones>다른 구역 선택하기</button>
        </div>
      </div>
    `,e.querySelector("[data-back-zones]").addEventListener("click",()=>V(`zones/${t.id}`)))}async function pd(e){const i=(await rd()).filter(r=>r.section===e.id||r.section===e.grade||r.section===e.label);if(i.length===0)return null;const a=12,n=i.map((r,d)=>({id:r.seatId,grade:e.grade,label:e.label,section:e.label,row:Math.floor(d/a)+1,seatNum:d%a+1,popularity:.5,status:xd[r.status]||"available"}));return{sections:Ga(e,n.length),seats:n}}const md={render(e,t){const i=Ot(t.id);if(!i){e.innerHTML='<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>';return}const a=Ct(i);yo(i.id,a);const n=a.find(q=>q.id===t.zoneId);if(!n){e.innerHTML='<div class="center-state"><div class="center-state__title">구역 정보를 찾을 수 없습니다</div></div>';return}const o=$t(i.id),d=i.venue==="올림픽홀"?1200:cd,l=Math.max(0,Math.min(d,ni(i.id,n.id)));if(l<=0){e.innerHTML='<div class="container" style="padding:60px 0;"></div>',Zi(e.querySelector(".container"),i,n,a);return}let c=Ga(n,l),y=td(c);e.innerHTML=`
      <section class="seat-page-header">
        <div class="container seat-page-header__top">
          <div>
            <div class="seat-page-header__title">${i.artist} <span class="badge badge-outline">${n.label}</span></div>
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
            <div class="seats-left-banner__num num-mono" data-remaining>${ye(y.length)}석</div>
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
    `;const x=e.querySelector("[data-seatmap]"),_=e.querySelector("[data-remaining]"),u=e.querySelector("[data-banner]"),g=e.querySelector("[data-tension-msg]");e.querySelector("[data-rail]");const m=e.querySelector("[data-order-box]"),F=e.querySelector("[data-zone-nav]"),f=e.querySelector("[data-hold-timer-box]"),s=e.querySelector("[data-body]"),A=e.querySelector("[data-soldout]");let I=null,C=null,O=null,L=!1,S=null,E=null;function b(q){const W=q.available;_.textContent=`${ye(W)}석`;const Z=W<=40;u.classList.toggle("tension",Z),W<=5?g.textContent="곧 매진됩니다. 서둘러주세요!":W<=15?g.textContent="남은 좌석이 얼마 남지 않았습니다.":W<=40?g.textContent="좌석이 빠르게 매진되고 있습니다.":g.textContent="실시간으로 좌석이 예매되고 있습니다."}function v(q,W){c=q,y=W,x.innerHTML="",S=Fi(x,{sections:c,seats:y,onSeatClick:h,venue:i.venue}),E&&E.stop(),E=od(y,{tickMs:900,onTick:(Z,T)=>{S.updateStatuses(Z),b(T)},onSoldOut:()=>{O||Ie()}}),b(E.stats())}v(c,y);let $=!1,M=null;const B={"seat.held":"holding","seat.sold":"sold","seat.released":"available","seat.cancelled":"available"};function p(q){if($||($=!0,E.stop()),q&&q.type==="snapshot"&&Array.isArray(q.seats))q.seats.forEach(W=>{const Z=y.find(T=>T.id===W.seatId);Z&&Z.id!==(O==null?void 0:O.id)&&(Z.status=W.status)}),S.updateStatuses(y);else if(q&&q.type==="seat.sold_out"){O||Ie();return}else if(q&&q.seatId&&B[q.type]){if(O&&q.seatId===O.id)return;const W=y.find(Z=>Z.id===q.seatId);if(!W)return;W.status=B[q.type],S.updateStatuses([W])}else return;b(E.stats())}pd(n).then(q=>{var Z;if(!q||O)return;v(q.sections,q.seats),$=!0;const W=(Z=q.seats[0])==null?void 0:Z.id.split(":")[0];W&&(M=dd(W,{onMessage:p,onStatusChange:T=>{T==="failed"&&!$&&E.start()}}),console.log(`[live] WebSocket 연결 — eventId: ${W}`)),console.log(`[live] A파트 실좌석 ${q.seats.length}석 로딩 완료`)}).catch(q=>console.warn("[live] 실좌석 로딩 실패 — mock 유지:",q.message));let k=!1;function h(q){if(k)return;const W=y.find(Z=>Z.id===q);if(!W||W.status!=="available"){S.flashSold(q),be({title:"이미 선택된 좌석입니다!",bodyHtml:"<p>다른 사용자가 먼저 해당 좌석을 선택했습니다.<br/>다른 좌석을 선택해주세요.</p>",footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close>다른 좌석 선택</button>'});return}$?R(q,W):D(q)}function D(q){const W=E.selectSeat(q);if(!W.ok){S.flashSold(q),be({title:"이미 선택된 좌석입니다!",bodyHtml:"<p>다른 사용자가 먼저 해당 좌석을 선택했습니다.<br/>다른 좌석을 선택해주세요.</p>",footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close>다른 좌석 선택</button>'});return}O=W.seat,de(),G()}async function R(q,W){const Z=ie().user;if(!Z){be({title:"로그인이 필요합니다",bodyHtml:"<p>좌석을 선점하려면 로그인해주세요.</p>",footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close>확인</button>'});return}const T=Sa(i.id);if(!T){be({title:"입장 토큰이 없습니다",bodyHtml:"<p>대기열을 통해 입장 허용을 받아야 좌석을 선점할 수 있습니다.</p>",footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close>확인</button>'});return}if(k=!0,W.status="holding",S.updateStatuses([W]),O&&O.id!==q)try{await Ji(Z.userId,O.id);const z=y.find(Y=>Y.id===O.id);z&&(z.status="available",S.updateStatuses([z]))}catch{}try{const z=await ld(Z.userId,q,T.token);z.success?(W.status="mine",S.updateStatuses([W]),O=W,de(),G(),console.log(`[live] 좌석 선점 성공: ${q}`)):(W.status=z.reason==="unavailable"?"holding":"available",S.updateStatuses([W]),S.flashSold(q),be({title:"좌석 선점 실패",bodyHtml:`<p>${z.message||"다른 사용자가 먼저 선택했습니다."}<br/>다른 좌석을 선택해주세요.</p>`,footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close>다른 좌석 선택</button>'}))}catch(z){W.status="available",S.updateStatuses([W]),be({title:"서버 연결 실패",bodyHtml:"<p>좌석 선점 요청에 실패했습니다.<br/>잠시 후 다시 시도해주세요.</p>",footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close>확인</button>'}),console.error("[live] holdSeat API 실패:",z.message)}finally{k=!1}}function H(){F.innerHTML=`
        <div class="order-rail__zones-title">구역 선택</div>
        <div class="zone-nav-list">
          ${a.map(q=>{const W=ni(i.id,q.id),Z=q.id===n.id,T=W<=0;return`
                <button type="button" class="zone-nav-row ${Z?"active":""} ${T?"is-soldout":""}"
                  data-switch-zone="${q.id}" style="--zone-color:${q.color||yd[q.grade]||"var(--color-primary)"}" ${Z||T?"disabled":""}>
                  <span class="zone-nav-row__label">${q.label}</span>
                  <span class="zone-nav-row__remain">${T?"SOLD OUT":`${ye(W)}석`}</span>
                </button>
              `}).join("")}
        </div>
      `,F.querySelectorAll("[data-switch-zone]").forEach(q=>{q.addEventListener("click",()=>V(`seats/${i.id}/${q.dataset.switchZone}`))})}H();function X(){m.innerHTML=`
        <div class="order-rail__title">선택 좌석 정보</div>
        <div class="order-rail__empty">보라색 좌석 중 원하는 자리를 선택해주세요</div>
      `}function G(){const q=i.grades.find(W=>W.key===O.grade);m.innerHTML=`
        <div class="order-rail__title">선택 좌석</div>
        <div class="order-rail__seat">
          <div class="order-rail__seat-grade">${q.name}</div>
          <div class="order-rail__seat-loc">${n.label} ${O.row}열 ${O.seatNum}번</div>
          <div class="order-rail__seat-price num-mono">${ve(q.price)}</div>
        </div>
        <button class="btn btn-primary btn-block" data-next>좌석 선택하기</button>
      `,m.querySelector("[data-next]").addEventListener("click",()=>{const W=C;Ae(),E.stop(),xo(i.id,n.id,1),bi({concertId:i.id,session:o,zone:{id:n.id,label:n.label},seat:{...O,price:q.price,gradeName:q.name},source:"regular",securedAt:Date.now(),holdDeadline:W}),V("payment/regular")})}function K(q){f.innerHTML=`
        <div class="seat-page-header__timer">좌석 선택 제한시간</div>
        <div class="seat-page-header__timer num-mono"><b>${gi(q)}</b></div>
      `}function de(){Ae(),C=Date.now()+Xi,K(Xi),I=setInterval(()=>{const q=C-Date.now();if(q<=0){if(Ae(),O){const W=y.find(Z=>Z.id===O.id);W&&W.status==="mine"&&(W.status="available"),S.updateStatuses(W?[W]:[]),O=null,X(),be({title:"좌석 예약 시간이 만료되었습니다",bodyHtml:'<p>결제 제한시간 내에 결제하지 않아 선택하신 좌석이 자동으로 해제되었습니다.<br/>다시 좌석을 선택해주세요.</p><p class="policy-note mt-8">※ 결제 전 예약이 만료된 것이므로 취소 수수료는 발생하지 않습니다.</p>',footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close>확인</button>'})}f.innerHTML="";return}K(q)},1e3)}function Ae(){I&&clearInterval(I),I=null,O||(f.innerHTML="")}function Ie(){L||(L=!0,s.style.display="none",A.style.display="block",Zi(A,i,n,a))}return()=>{if(E.stop(),M&&M.close(),I&&clearInterval(I),O){const q=ie().user;q&&Ji(q.userId,O.id).catch(()=>{})}}}},vd={clock:Ma,mmss:gi,deadline:wt};function fd(e,t){const{targetMs:i,format:a="clock",label:n="",size:o="",onComplete:r=()=>{},onTick:d=()=>{}}=t,l=vd[a]||Ma;let c=!1;function y(u){const g=l(u);if(a==="deadline")e.innerHTML=`${n?`<div class="countdown-label">${n}</div>`:""}<div class="countdown-clock ${o} num-mono">${g}</div>`;else{const m=g.split(":").map(F=>F.trim());e.innerHTML=`
        ${n?`<div class="countdown-label">${n}</div>`:""}
        <div class="countdown-clock ${o} num-mono">${m.map((F,f)=>`<span>${F}</span>${f<m.length-1?'<span class="colon">:</span>':""}`).join("")}</div>
      `}}function x(){const u=i-Date.now();if(u<=0){y(0),c||(c=!0,r());return}y(u),d(u)}x();const _=setInterval(x,1e3);return()=>clearInterval(_)}const bd=24*60*60*1e3,gd=8*60*1e3+42*1e3,hd=/^01[016789]-\d{3,4}-\d{4}$/,mi=["카카오뱅크","국민은행","신한은행","우리은행","하나은행","토스뱅크"];function Yt(e){let t="";for(let i=0;i<e;i++)t+=Math.floor(Math.random()*10);return t}function Qi(e){return{bank:e||mi[Math.floor(Math.random()*mi.length)],number:`${Yt(3)}-${Yt(2)}-${Yt(6)}`}}function Vt(e){const t=String(e||"").replace(/\D/g,"").slice(0,11);return t.length<=3?t:t.length<=7?`${t.slice(0,3)}-${t.slice(3)}`:`${t.slice(0,3)}-${t.slice(3,t.length===10?6:7)}-${t.slice(t.length===10?6:7)}`}function ea(e){return String(e??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}const Ed={render(e,t){const i=t.type==="cancel"?"cancel":"regular",a=ie().currentOrder,n=a?i==="cancel"?[a.seat]:a.seats||[]:[];if(!a||n.length===0){e.innerHTML=`
        <div class="center-state">
          <div class="center-state__icon">🎫</div>
          <div class="center-state__title">결제할 주문이 없습니다</div>
          <div class="center-state__desc">좌석을 먼저 선택해주세요.</div>
          <button class="btn btn-primary" data-home>홈으로</button>
        </div>`,e.querySelector("[data-home]").addEventListener("click",()=>V(""));return}e.innerHTML='<div class="center-state"><div class="center-state__title">결제 정보 불러오는 중...</div></div>';let o=!1,r=null;return fetch("/events").then(l=>l.json()).then(l=>{if(o)return;const c=(l.events||[]).find(y=>y.eventId===a.concertId);if(!c){e.innerHTML='<div class="center-state"><div class="center-state__title">공연 정보를 찾을 수 없습니다</div></div>';return}r=d(c)}).catch(()=>{o||(e.innerHTML='<div class="center-state"><div class="center-state__title">결제 정보를 불러오지 못했습니다.</div></div>')}),()=>{o=!0,r&&r()};function d(l){var E,b,v,$,M;const c=i==="cancel"?a.securedAt+bd:a.holdDeadline||a.securedAt+gd,y=(E=a.session)!=null&&E.date?a.session.date.replaceAll("-","."):l.eventDate||"",x=((b=a.session)==null?void 0:b.time)||"",_=0,u=n.reduce((B,p)=>B+Number(p.price||0),0),g=u-_;let m=null,F=!1;e.innerHTML=`
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
              <input type="text" data-buyer-name placeholder="예매자 이름" value="${((v=ie().user)==null?void 0:v.name)||""}" />
            </div>
            <div class="field">
              <label>전화번호</label>
              <input type="tel" data-buyer-phone placeholder="010-1234-5678" value="${Vt((($=ie().user)==null?void 0:$.phone)||"")}" maxlength="13" inputmode="numeric" autocomplete="tel" />
            </div>
            <div class="field" style="margin-bottom:0;">
              <label>이메일</label>
              <input type="email" data-buyer-email placeholder="example@email.com" value="${((M=ie().user)==null?void 0:M.email)||""}" />
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
                ${mi.map(B=>`<option value="${B}">${B}</option>`).join("")}
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
            ${x?`<div class="kv-row"><span>공연 시간</span><b>${x}</b></div>`:""}
            <div class="kv-row"><span>공연장</span><b>${l.venue}</b></div>
            ${n.length===1?`<div class="kv-row"><span>좌석 등급</span><b>${n[0].gradeName}</b></div>
                   <div class="kv-row"><span>구역</span><b>${n[0].section||n[0].gradeName}</b></div>
                   <div class="kv-row"><span>좌석 번호</span><b>${n[0]._displayNum||n[0].seatNum}번</b></div>`:`<div class="kv-row" style="align-items:flex-start;"><span>선택 좌석 (${n.length}매)</span>
                     <b style="text-align:right;">${n.map(B=>`${B.gradeName} ${B._displayNum||B.seatNum}번`).join("<br/>")}</b>
                   </div>`}
          </div>

          <div class="divider" style="margin:0 0 20px;"></div>

          <div class="summary-card__title">결제 금액</div>
          <div class="kv-row"><span>티켓 금액</span><b class="num-mono">${ve(u)}</b></div>
          <div class="kv-row"><span>할인 금액</span><b class="num-mono">-${ve(_)}</b></div>
          ${i==="cancel"?'<div class="kv-row"><span>구분</span><b><span class="badge badge-red">취소표</span></b></div>':""}
          <div class="summary-total"><span>최종 결제 금액</span><b class="num-mono">${ve(g)}</b></div>

          <div class="vbank-box" data-vbank-box style="display:none;"></div>

          <label class="pay-agree-row mt-24">
            <input type="checkbox" data-agree />
            <span>취소 및 환불 규정을 확인했으며 이에 동의합니다.</span>
          </label>

          <button class="btn btn-primary btn-block mt-16" data-pay disabled>결제하기</button>
        </div>
      </div>
    `;const f=e.querySelector("[data-vbank-box]"),s=e.querySelector("[data-vbank-bank-field]"),A=e.querySelector("[data-vbank-bank]"),I=e.querySelector("[data-buyer-phone]");I==null||I.addEventListener("input",()=>{const B=I.value.length,p=I.selectionStart??B;I.value=Vt(I.value);const k=I.value.length-B,h=Math.max(0,Math.min(I.value.length,p+k));I.setSelectionRange(h,h)});function C(){var p;if(((p=e.querySelector('input[name="pay"]:checked'))==null?void 0:p.value)!=="vbank"){f.style.display="none",s.style.display="none";return}s.style.display="block",m||(m=Qi(A.value)),f.style.display="block",f.innerHTML=`
        <div class="vbank-box__label">입금할 가상계좌</div>
        <div class="vbank-box__bank">${m.bank}</div>
        <div class="vbank-box__number num-mono">${m.number}</div>
        <div class="vbank-box__amount">입금액 <b class="num-mono">${ve(g)}</b></div>
        <p class="policy-note mt-8">결제하기를 누른 뒤, 마이페이지 &gt; 예매내역의 "티켓 확인"에서 이 계좌로 입금하시면 예매가 확정됩니다.</p>
      `}A.addEventListener("change",()=>{m=Qi(A.value),C()}),e.querySelectorAll(".radio-row").forEach(B=>{B.addEventListener("click",()=>{e.querySelectorAll(".radio-row").forEach(p=>p.classList.remove("checked")),B.classList.add("checked"),B.querySelector("input").checked=!0,C()})}),Pa(e.querySelector("[data-refund-summary]"),{compact:!0});const O=e.querySelector("[data-pay]"),L=e.querySelector("[data-agree]");e.querySelector("[data-agree]").addEventListener("change",B=>{O.disabled=F||!B.target.checked});const S=fd(e.querySelector("[data-deadline]"),{targetMs:c,format:i==="cancel"?"deadline":"mmss",onComplete:i==="cancel"?void 0:()=>{var B;F||(F=!0,O.disabled=!0,L.disabled=!0,At(),ut(),be({title:"제한시간이 초과되었습니다",bodyHtml:"<p>좌석 선택 제한시간 내에 결제하기를 누르지 않아 예매가 취소되었습니다.<br/>좌석은 자동으로 해제되었습니다. 다시 시도해주세요.</p>",footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close data-goto-zones>구역 다시 선택하기</button>'}),(B=document.querySelector("[data-goto-zones]"))==null||B.addEventListener("click",()=>V(`zones/${l.eventId}`)))}});return O.addEventListener("click",()=>{var G,K,de,Ae,Ie,q;if(O.disabled||F)return;const B=(G=a.session)==null?void 0:G.date;if(B&&ie().bookings.some(Z=>{var T;return Z.concertId===l.eventId&&((T=Z.session)==null?void 0:T.date)===B&&(Z.status==="confirmed"||Z.status==="unpaid")})){J({title:"이미 예매한 날짜입니다",body:`${B} 공연은 이미 예매가 완료되었습니다. 다른 날짜를 선택해주세요.`});return}const p=e.querySelector("[data-buyer-name]").value.trim(),k=e.querySelector("[data-buyer-phone]").value.trim(),h=e.querySelector("[data-buyer-email]").value.trim();if(!p||!k||!h){J({title:"구매자 정보를 입력해주세요",body:"이름, 전화번호, 이메일을 모두 입력해야 결제할 수 있습니다.",type:"default"});return}if(!hd.test(k)){J({title:"전화번호 형식을 확인해주세요",body:"010-1234-5678 형식으로 입력해주세요.",type:"default"});return}const D=((K=e.querySelector('input[name="pay"]:checked'))==null?void 0:K.value)||"card",R=((de=ie().user)==null?void 0:de.userId)||((Ae=ie().user)==null?void 0:Ae.email);O.disabled=!0;const H=()=>{const W=n.filter(T=>typeof T.id=="string"&&T.id.includes(":")&&!!R);(W.length?Promise.all(W.map(T=>{var z,Y;return fetch("/seats/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:R,seatId:T.id,eventId:l.eventId,sessionDate:((z=a.session)==null?void 0:z.date)||"",sessionTime:((Y=a.session)==null?void 0:Y.time)||""})}).then(ce=>ce.json().then(he=>({ok:ce.ok,data:he})))})).then(T=>T.find(z=>!z.ok||!z.data.success)||T[0]):Promise.resolve({ok:!0,data:{success:!0}})).then(({ok:T,data:z})=>{if(!T||!z.success){O.disabled=!1,J({title:"결제를 완료하지 못했습니다",body:z.message||"좌석 선점이 만료되었을 수 있습니다. 다시 선택해주세요.",type:"default"});return}const Y=fo("A");oo({bookingId:Y,concertId:l.eventId,session:a.session||null,seats:n,price:g,buyer:{name:p,phone:k,email:h},status:D==="vbank"?"unpaid":"confirmed",source:i,paymentMethod:D,virtualAccount:D==="vbank"?m:null,vbankDeadline:D==="vbank"?Date.now()+24*60*60*1e3:null,paidAt:Date.now()}),i==="cancel"&&Da(l.eventId,n[0].grade),At(),ut(),V(`complete/${Y}`)}).catch(()=>{O.disabled=!1,J({title:"결제 요청에 실패했습니다",body:"네트워크 상태를 확인하고 다시 시도해주세요.",type:"default"})})},X=Vt(((Ie=ie().user)==null?void 0:Ie.phone)||"");if(X!==k){let W=!1;(q=be({title:"전화번호 변경 확인",bodyHtml:`
            <p style="margin-bottom:14px;">입력한 전화번호가 회원정보와 다릅니다. 이 번호를 회원정보에 저장하고 결제를 진행할까요?</p>
            <div class="kv-row"><span>기존 전화번호</span><b>${ea(X||"미등록")}</b></div>
            <div class="kv-row"><span>변경할 전화번호</span><b>${ea(k)}</b></div>
            <p class="text-secondary" style="font-size:12px;margin-top:14px;">이메일 정보는 변경하지 않습니다.</p>
          `,footerHtml:`
            <button type="button" class="btn btn-ghost" data-modal-close>다시 입력</button>
            <button type="button" class="btn btn-primary" data-confirm-phone-change>저장하고 결제하기</button>
          `,onClose:()=>{W||(O.disabled=F||!L.checked)}}).el.querySelector("[data-confirm-phone-change]"))==null||q.addEventListener("click",async T=>{const z=T.currentTarget;z.disabled=!0,z.textContent="저장 중...";const Y=await Ea({phone:k});if(!Y.success){z.disabled=!1,z.textContent="저장하고 결제하기",J({title:"전화번호 저장에 실패했습니다",body:Y.message||"잠시 후 다시 시도해주세요.",type:"default"});return}W=!0,Me(),H()});return}H()}),S}}};function Fd(e){return(e.seats&&e.seats.length?e.seats:e.seat?[e.seat]:[]).map(i=>`${i.gradeName||i.section} ${i._displayNum||i.seatNum}번`).join(", ")}function Id(e){return e==="refunded"?'<span class="badge badge-gray">환불 완료</span>':e==="refund_pending"?'<span class="badge badge-orange">환불 처리 중</span>':e==="unpaid"?'<span class="badge badge-orange">미입금</span>':'<span class="badge badge-green">🟢 예매 확정</span>'}const Ad={render(e,t){let i=null;function a(){var l,c;const o=Si(t.id);if(!o){e.innerHTML='<div class="center-state"><div class="center-state__title">예매 내역을 찾을 수 없습니다</div></div>';return}const r=(l=o.session)!=null&&l.date?o.session.date.replaceAll("-","."):i.eventDate||"",d=o.status==="unpaid";e.innerHTML=`
        <div class="container complete-page">
          ${d?'<div class="vbank-notice">🏦 마이페이지의 예매한 티켓에서 가상계좌를 확인해서 입금을 완료해주세요.</div>':""}
          <div class="complete-check">${d?"🏦":"✓"}</div>
          <h2 class="section-title">${d?"입금 확인 대기 중":o.status==="confirmed"?"예매가 완료되었습니다":"예매 티켓"}</h2>
          <p class="section-sub">${d?"아래 가상계좌로 입금을 완료하면 예매가 확정됩니다.":o.source==="cancel"?"취소표 예매가 정상적으로 확정되었습니다.":"결제가 정상적으로 완료되었습니다."}</p>

          <div class="complete-ticket">
            <div class="complete-ticket__head">
              <span>예매번호</span>
              <b class="num-mono">${o.bookingId}</b>
            </div>
            <div class="complete-ticket__body">
              <div class="kv-row"><span>공연명</span><b>${i.eventName}</b></div>
              <div class="kv-row"><span>공연일</span><b>${r}${(c=o.session)!=null&&c.time?" "+o.session.time:""}</b></div>
              <div class="kv-row"><span>좌석</span><b>${Fd(o)}</b></div>
              <div class="complete-ticket__punch"></div>
              <div class="kv-row"><span>결제금액</span><b class="num-mono">${ve(o.price)}</b></div>
              <div class="kv-row"><span>상태</span><b>${Id(o.status)}</b></div>
            </div>
            ${d&&o.virtualAccount?`
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
      `,e.querySelector("[data-history]").addEventListener("click",()=>V("mypage/bookings")),e.querySelector("[data-mypage]").addEventListener("click",()=>V("mypage"))}const n=Si(t.id);if(!n){e.innerHTML='<div class="center-state"><div class="center-state__title">예매 내역을 찾을 수 없습니다</div></div>';return}e.innerHTML='<div class="center-state"><div class="center-state__title">예매 정보 불러오는 중...</div></div>',fetch("/events").then(o=>o.json()).then(o=>{if(i=(o.events||[]).find(r=>r.eventId===n.concertId),!i){e.innerHTML='<div class="center-state"><div class="center-state__title">공연 정보를 찾을 수 없습니다</div></div>';return}a()}).catch(()=>{e.innerHTML='<div class="center-state"><div class="center-state__title">예매 정보를 불러오지 못했습니다.</div></div>'})}},Kt=5*60*1e3,Sd={render(e,t){const i=t.id;if(!Ce()){Xe(`cancel-queue/${i}`),V("login");return}e.innerHTML='<div class="center-state"><div class="center-state__title">취소표 대기열 불러오는 중...</div></div>';let a=!1,n=null,o=null;return fetch("/events").then(r=>r.json()).then(r=>{if(a)return;const d=(r.events||[]).find(A=>A.eventId===i);if(!d){e.innerHTML='<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>';return}const l=$a(i),c=pt(i);ie().user;const y=ze();e.innerHTML=`
          <section class="cancel-hero">
            <div class="container">
              <div class="eyebrow" style="color:var(--color-primary);font-family:var(--font-mono);font-size:11px;letter-spacing:3px;">CANCELLATION QUEUE</div>
              <h2 class="section-title">${d.eventName}</h2>
              <p class="section-sub">${d.eventDate||""} · ${d.venue||""} · 매진된 좌석의 취소표를 대기열 순서대로 배부합니다</p>
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
                <div class="queue-mynum num-mono" style="font-size:64px;" data-mynum>${ye(l.myNumber)}번</div>
                <div class="divider"></div>
                <div class="kv-row"><span>전체 대기자</span><b class="num-mono">${ye(l.total)}명</b></div>
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
                  ${(d.sections||[{name:"A"}]).map(A=>`
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
        `;const x=e.querySelector("[data-membership-card]");let _=y?"member-waiting":"non-member",u=null;function g(A){var C,O,L,S,E,b,v,$,M;_=A;const I=e.querySelectorAll(".cancel-step");if(A==="non-member"&&((C=I[0])==null||C.classList.add("active"),(O=I[1])==null||O.classList.remove("active","done"),(L=I[2])==null||L.classList.remove("active","done"),x.innerHTML=`
              <div class="lock-box">
                <div class="lock-box__icon">🔒</div>
                <div class="lock-box__title">멤버십 가입 필요</div>
                <div class="lock-box__desc">
                  현재 <strong>${ye(l.myNumber)}번째</strong> 대기 중입니다.<br/>
                  취소표 발생 시 <strong>Secret Link(5분 예매권)</strong>는 멤버십 회원에게만 제공됩니다.<br/>
                  지금 멤버십에 가입하시면, 순번 도래 시 즉시 Secret Link가 발급됩니다.
                </div>
                <button class="btn btn-primary" data-join-membership>멤버십 가입하기</button>
              </div>
            `,x.querySelector("[data-join-membership]").addEventListener("click",()=>V("membership"))),A==="member-waiting"&&((S=I[0])==null||S.classList.add("active","done"),(E=I[1])==null||E.classList.add("active"),(b=I[2])==null||b.classList.remove("active","done"),x.innerHTML=`
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="font-size:15px;font-weight:800;">Secret Link 대기 현황</h3>
                <span class="badge badge-green" style="font-size:11px;">MEMBERSHIP ✓</span>
              </div>
              <div class="notice-box" style="background:rgba(34,197,94,0.08);border-color:rgba(34,197,94,0.2);margin-bottom:16px;">
                <p style="color:var(--color-text);">멤버십 상태가 확인되었습니다! 순번 도래 시 Secret Link가 발급됩니다.</p>
              </div>
              <div class="kv-row"><span>내 대기번호</span><b class="num-mono" data-m-num>${ye(l.myNumber)}번</b></div>
              <div class="kv-row"><span>상태</span><b><span class="queue-status-pill"><span class="dot"></span>대기 중 — Secret Link 발급 대기</span></b></div>
              <div class="kv-row"><span>알림</span><b class="text-red">ON</b></div>
              <div style="margin-top:16px;" data-m-progress></div>
            `,f()),A==="secret-link-active"){(v=I[0])==null||v.classList.add("done"),($=I[1])==null||$.classList.add("active","done"),(M=I[2])==null||M.classList.add("active");const B=e.querySelector("[data-status]");B&&(B.textContent="Secret Link 발급됨"),x.innerHTML=`
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
            `,x.querySelector("[data-enter-link]").addEventListener("click",()=>{V(`private-link/${i}`)}),s()}if(A==="link-expired"){I.forEach(p=>p.classList.remove("active"));const B=e.querySelector("[data-status]");B&&(B.textContent="만료됨"),x.innerHTML=`
              <div style="text-align:center;padding:16px 0 4px;">
                <div class="badge badge-dark-red" style="font-size:14px;padding:10px 20px;margin-bottom:16px;">⏱ 시간 초과</div>
                <div style="font-size:15px;font-weight:700;margin-bottom:12px;">5분 제한시간이 초과되었습니다</div>
                <div style="font-size:13px;color:var(--color-text-secondary);line-height:1.8;margin-bottom:20px;">
                  기회가 다음 순번의 멤버십 회원에게 이관되었습니다.<br/>
                  이 링크는 더 이상 사용할 수 없습니다.
                </div>
                <button class="btn btn-outline" data-go-home>홈으로 돌아가기</button>
              </div>
            `,x.querySelector("[data-go-home]").addEventListener("click",()=>V(""))}}const m=14e3;let F=null;function f(){const A=l.myNumber,I=Date.now();let C=!1;function O(){if(C||a)return;const L=Date.now()-I,S=Math.min(1,L/m),E=1-Math.pow(1-S,4),b=Math.max(1,Math.round(A-(A-1)*E)),v=x.querySelector("[data-m-num]");v&&(v.textContent=`${ye(b)}번`),b<=1&&(C=!0,clearInterval(F),u=Date.now()+Kt,g("secret-link-active"))}F=setInterval(O,200),O()}function s(){u||(u=Date.now()+Kt);const A=Kt;function I(){if(a)return;const C=u-Date.now(),O=x.querySelector("[data-countdown]"),L=x.querySelector("[data-timer-bar]");if(C<=0){clearInterval(o),g("link-expired");return}if(O){const S=String(Math.floor(C/6e4)).padStart(2,"0"),E=String(Math.floor(C%6e4/1e3)).padStart(2,"0");O.textContent=`${S}:${E}`,C<=6e4&&O.classList.add("warn")}L&&(L.style.width=`${C/A*100}%`)}o=setInterval(I,1e3),I()}g(_),n=setInterval(()=>{if(a)return;const A=Object.keys(c),I=Math.random();if(I<.55){const L=A[Math.floor(Math.random()*A.length)];wa(i,L)}else if(I<.8){const L=A.filter(S=>c[S]>0);L.length&&Da(i,L[Math.floor(Math.random()*L.length)])}const C=pt(i);A.forEach(L=>{const S=e.querySelector(`[data-pool-${L}]`);S&&(S.textContent=`${C[L]||0}매`)});const O=e.querySelector("[data-pool-total]");O&&(O.textContent=Object.values(C).reduce((L,S)=>L+S,0))},2600)}).catch(()=>{a||(e.innerHTML='<div class="center-state"><div class="center-state__title">취소표 대기열을 불러오지 못했습니다.</div></div>')}),()=>{a=!0,n&&clearInterval(n),o&&clearInterval(o)}}},_d={render(e){const t=ze();e.innerHTML=`
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
    `,e.querySelectorAll("[data-plan]").forEach(i=>{i.addEventListener("click",()=>{if(!Ce()){Xe("membership"),V("login");return}V(`membership-checkout/${i.dataset.plan}`)})})}},ta={monthly:{label:"월간 멤버십",price:3900,cycle:"월"},yearly:{label:"연간 멤버십",price:34800,cycle:"년"}},kd={render(e,t){const i=ta[t.plan]?t.plan:"monthly",a=ta[i];if(!Ce()){Xe(`membership-checkout/${i}`),V("login");return}if(ze()){V("mypage/membership");return}e.innerHTML=`
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
    `,e.querySelectorAll(".radio-row").forEach(n=>{n.addEventListener("click",()=>{e.querySelectorAll(".radio-row").forEach(o=>o.classList.remove("checked")),n.classList.add("checked"),n.querySelector("input").checked=!0})}),e.querySelector("[data-cancel]").addEventListener("click",()=>V("membership")),e.querySelector("[data-pay]").addEventListener("click",()=>{const n=e.querySelector("[data-pay]");n.disabled=!0,n.textContent="처리 중...",io(i).then(o=>{if(o.success){J({title:"멤버십 결제 완료",body:"취소표 Private Link 이용이 가능합니다.",type:"success"});const r=Ta();V(r||"mypage/membership")}else n.disabled=!1,n.textContent="결제하기",J({title:"결제에 실패했습니다",body:o.message||"잠시 후 다시 시도해주세요."})})})}},ia=4*60*1e3+52*1e3,$d={render(e,t){const i=t.id;if(!Ce()||!ze()){V(`cancel-queue/${i}`);return}let a=!1,n=null;const o=Date.now()+ia;return fetch("/events").then(r=>r.json()).then(r=>{if(a)return;const d=(r.events||[]).find(x=>x.eventId===i),l=d?d.eventName:"공연",c=d?d.venue:"";e.innerHTML=`
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
        `,e.querySelector("[data-enter]").addEventListener("click",()=>{clearInterval(n),V(`cancel-seats/${i}`)});function y(){var g;if(a)return;const x=o-Date.now(),_=e.querySelector("[data-countdown]"),u=e.querySelector("[data-timer-bar]");if(x<=0){clearInterval(n);const m=e.querySelector(".cancel-timer-wrap");m&&(m.style.display="none");const F=(g=e.querySelector("[data-enter]"))==null?void 0:g.parentElement;F&&(F.innerHTML=`
                <div class="badge badge-dark-red" style="font-size:13px;padding:8px 16px;margin-bottom:14px;">입장 시간 만료</div>
                <div style="font-size:14px;color:var(--color-text-secondary);line-height:1.8;margin-bottom:20px;">
                  Secret Link 사용 시간이 종료되었습니다.<br/>해당 링크는 다시 사용할 수 없습니다.
                </div>
                <button class="btn btn-outline btn-lg" data-mypage>마이페이지로 이동</button>
              `,F.querySelector("[data-mypage]").addEventListener("click",()=>V("mypage")));return}if(_){const m=String(Math.floor(x/6e4)).padStart(2,"0"),F=String(Math.floor(x%6e4/1e3)).padStart(2,"0");_.textContent=`${m}:${F}`,x<=6e4&&_.classList.add("warn")}u&&(u.style.width=`${x/ia*100}%`)}n=setInterval(y,1e3),y()}).catch(()=>{a||(e.innerHTML='<div class="center-state"><div class="center-state__title">페이지를 불러오지 못했습니다.</div></div>')}),()=>{a=!0,n&&clearInterval(n)}}},wd={render(e,t){const i=t.id;if(!Ce()||!ze()){V(`cancel-queue/${i}`);return}e.innerHTML='<div class="center-state"><div class="center-state__title">취소표 좌석 불러오는 중...</div></div>';let a=!1;return Promise.all([fetch("/events").then(n=>n.json()),fetch(`/seats?eventId=${encodeURIComponent(i)}`).then(n=>n.json())]).then(([n,o])=>{var u;if(a)return;const r=(n.events||[]).find(g=>g.eventId===i);if(!r){e.innerHTML='<div class="center-state"><div class="center-state__title">공연을 찾을 수 없습니다</div></div>';return}const d=o.seats||[],l=`${i}:`,c=d.filter(g=>g.seatId.startsWith(l)&&g.status==="AVAILABLE");if(c.length===0){e.innerHTML=`
            <div class="center-state">
              <div class="center-state__icon">😥</div>
              <div class="center-state__title">현재 취소표가 소진되었습니다</div>
              <div class="center-state__desc">다음 순번 대기자에게 기회가 넘어갔습니다.</div>
              <button class="btn btn-primary" data-back>취소표 대기열로</button>
            </div>`,e.querySelector("[data-back]").addEventListener("click",()=>V(`cancel-queue/${i}`));return}const y=(r.sections||[]).length?r.sections:[{name:"A",price:r.price}],x={};y.forEach(g=>{const m=c.filter(F=>F.section===g.name);m.length>0&&(x[g.name]={seats:m,price:Number(g.price||r.price),label:`${g.label||g.name}석`})}),e.innerHTML=`
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
              ${Object.entries(x).map(([g,m])=>`
                <div class="cancel-zone-card">
                  <div class="cancel-zone-card__header">
                    <span class="cancel-zone-card__grade">${m.label}</span>
                    <span class="cancel-zone-card__price num-mono">${ve(m.price)}</span>
                  </div>
                  <div class="cancel-zone-card__seats">
                    ${m.seats.map(F=>{const f=F.seatId.includes(":")?F.seatId.split(":").pop():F.seatId;return`<button type="button" class="cancel-seat-btn" data-seat-id="${F.seatId}" data-section="${g}" data-price="${m.price}" data-label="${m.label} ${f}">${f}</button>`}).join("")}
                  </div>
                  <div class="cancel-zone-card__remain">잔여 ${m.seats.length}석</div>
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
        `;let _=null;e.querySelectorAll(".cancel-seat-btn").forEach(g=>{g.addEventListener("click",()=>{e.querySelectorAll(".cancel-seat-btn").forEach(F=>F.classList.remove("active")),g.classList.add("active"),_={seatId:g.dataset.seatId,section:g.dataset.section,price:Number(g.dataset.price),label:g.dataset.label};const m=e.querySelector("[data-selected-info]");m.style.display="block",e.querySelector("[data-sel-label]").textContent=_.label,e.querySelector("[data-sel-price]").textContent=ve(_.price)})}),(u=e.querySelector("[data-next]"))==null||u.addEventListener("click",()=>{_&&(bi({concertId:i,seats:[{id:_.seatId,section:_.section,price:_.price,gradeName:_.label}],source:"cancel",securedAt:Date.now()}),V("payment/cancel"))})}).catch(()=>{a||(e.innerHTML='<div class="center-state"><div class="center-state__title">좌석 정보를 불러오지 못했습니다.</div></div>')}),()=>{a=!0}}},Dd=/^01[016789]-\d{3,4}-\d{4}$/;function Jt(e){const t=String(e||"").replace(/\D/g,"").slice(0,11);return t.length<=3?t:t.length<=7?`${t.slice(0,3)}-${t.slice(3)}`:`${t.slice(0,3)}-${t.slice(3,t.length===10?6:7)}-${t.slice(t.length===10?6:7)}`}function we(e){return String(e??"").replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;")}const Td=[{key:"",label:"마이페이지"},{key:"bookings",label:"예매내역"},{key:"refunds",label:"취소/환불내역"},{key:"cancel-queue",label:"취소표 대기열"},{key:"membership",label:"멤버십"},{key:"interests",label:"관심 공연"},{key:"notifications",label:"알림"},{key:"profile",label:"회원정보"},{key:"profile-edit",label:"회원정보 수정"}];function Wa(e){return(e.seats&&e.seats.length?e.seats:e.seat?[e.seat]:[]).map(i=>`${i.gradeName||i.section} ${i._displayNum||i.seatNum}번`).join(", ")}function aa(e){return e.status==="confirmed"?'<span class="badge badge-green">예매 확정</span>':e.status==="unpaid"?'<span class="badge badge-orange">미입금</span>':e.status==="cancelled"?'<span class="badge badge-gray">예매 취소</span>':e.status==="refund_pending"?'<span class="badge badge-orange">환불 처리 중</span>':e.status==="refunded"?'<span class="badge badge-gray">환불 완료</span>':'<span class="badge badge-orange">결제 대기</span>'}function Xt(e,t){const i=Ot(e);if(i)return{name:`${i.artist} · ${i.title}`,dateStart:i.dateStart,venue:i.venue,image:je(i.artist||i.title)};const a=(t||[]).find(n=>n.eventId===e);return a?{name:a.eventName,dateStart:a.eventDate||null,venue:a.venue,image:je(a.eventName||a.eventId)}:null}function za(e,t){var c,y;const i=((c=e.session)==null?void 0:c.date)||((y=t.dateStart)==null?void 0:y.slice(0,10));if(!i)return 999;const[a,n,o]=i.split("-").map(Number),r=new Date(a,n-1,o),d=new Date,l=new Date(d.getFullYear(),d.getMonth(),d.getDate());return Math.round((r-l)/864e5)}function Ld(e,t){var c,y,x,_;const i=e.status==="unpaid",a=za(e,t),n=i?0:Ha(a),o=Math.round(e.price*n),r=Math.max(0,e.price-o),d=((c=e.session)==null?void 0:c.date)||((y=t.dateStart)==null?void 0:y.slice(0,10)),l=d?d.replaceAll("-","."):"";be({title:i?"입금 전 예매를 취소하시겠습니까?":"예매를 취소하시겠습니까?",bodyHtml:`
      <p style="margin-bottom:14px;"><strong>${t.name}</strong> 티켓을 ${i?"취소하시겠습니까?":"환불하시겠습니까?"}</p>
      ${l?`<div class="kv-row"><span>공연일</span><b>${l}${(x=e.session)!=null&&x.time?" "+e.session.time:""}</b></div>`:""}
      <div class="kv-row"><span>좌석</span><b>${Wa(e)}</b></div>
      <div class="divider"></div>
      <div class="kv-row"><span>결제금액</span><b class="num-mono">${ve(e.price)}</b></div>
      ${i?'<div class="notice-box mt-16"><p>아직 입금 전이므로 취소 수수료와 환불 금액이 없습니다.</p></div>':`
        <div class="kv-row"><span>취소 수수료</span><b class="num-mono text-red">-${ve(o)}</b></div>
        <div class="kv-row" style="font-size:15px;"><span><b>예상 환불금액</b></span><b class="num-mono text-red" style="font-size:19px;">${ve(r)}</b></div>`}
      ${n>=1?'<div class="notice-box mt-16"><p>공연 당일에는 취소 및 환불이 불가합니다.</p></div>':""}
    `,footerHtml:`
      <button type="button" class="btn btn-ghost" data-modal-close>취소하지 않기</button>
      <button type="button" class="btn btn-primary" data-confirm-refund ${n>=1?"disabled":""}>${i?"예매 취소":"네, 환불합니다"}</button>
    `}),(_=document.querySelector("[data-confirm-refund]"))==null||_.addEventListener("click",()=>{var s,A;const u=document.querySelector("[data-confirm-refund]");u&&(u.disabled=!0);const g=()=>{i?po(e.bookingId):uo(e.bookingId),Me(),J({title:i?"입금 전 예매가 취소되었습니다":"환불 신청이 접수되었습니다",body:i?"좌석이 다시 예매 가능한 상태로 변경되었습니다.":"환불 처리 중 상태로 변경되며, 완료되면 상태가 업데이트됩니다.",type:"success"})},m=((s=ie().user)==null?void 0:s.userId)||((A=ie().user)==null?void 0:A.email),f=(e.seats&&e.seats.length?e.seats:e.seat?[e.seat]:[]).filter(I=>typeof I.id=="string"&&I.id.includes(":"));f.length&&m?Promise.all(f.map(I=>fetch("/seats/cancel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:m,seatId:I.id})}).then(C=>C.json().then(O=>({ok:C.ok,data:O}))))).then(I=>{const C=I.find(O=>!O.ok||!O.data.success);if(C){u&&(u.disabled=!1),J({title:"환불 처리에 실패했습니다",body:C.data.message||"잠시 후 다시 시도해주세요.",type:"default"});return}g()}).catch(()=>{u&&(u.disabled=!1),J({title:"환불 요청에 실패했습니다",body:"네트워크 상태를 확인하고 다시 시도해주세요.",type:"default"})}):g()})}const Md={render(e,t){if(!Ce()){Xe("mypage"),V("login");return}const i=t.section||"",{user:a,bookings:n,interests:o,cancelQueues:r}=ie();e.innerHTML=`
      <div class="container mypage-body">
        <aside class="mypage-nav">
          <div class="mypage-profile-card">
            <div data-mypage-avatar class="mypage-avatar">${we(a.name.slice(0,1))}</div>
            <div>
              <div data-mypage-user-name style="font-weight:800;font-size:14px;">${we(a.name)}</div>
              <div class="text-secondary" style="font-size:12px;">${a.email}</div>
            </div>
          </div>
          ${Td.map(p=>`<a href="#/mypage${p.key?"/"+p.key:""}" class="${i===p.key?"active":""}">${p.label}</a>`).join("")}
        </aside>
        <div data-content></div>
      </div>
    `;const d=e.querySelector("[data-content]");let l=null;function c(p){if(l){p(l);return}fetch("/events").then(k=>k.json()).then(k=>{l=k.events||[],p(l)}).catch(()=>p([]))}const y=7*24*60*60*1e3;function x(){const p=(a==null?void 0:a.userId)||(a==null?void 0:a.email);p&&fetch(`/reservations/user/${encodeURIComponent(p)}`).then(k=>k.json()).then(({reservations:k})=>{var D;if(((D=ie().user)==null?void 0:D.userId)!==p)return;const h=(k||[]).filter(R=>!so(R.seatId)&&(R.status!=="CANCELLED"||R.cancelledAt&&Date.now()-new Date(R.cancelledAt).getTime()<=y));if(h.length)return Promise.all([fetch("/events").then(R=>R.json()),fetch("/seats").then(R=>R.json())]).then(([R,H])=>{var G;if(((G=ie().user)==null?void 0:G.userId)!==p)return;const X=new Map((H.seats||[]).map(K=>[K.seatId,K]));h.forEach(K=>{const de=K.seatId.split(":")[0];if(!(R.events||[]).find(T=>T.eventId===de))return;const Ie=K.seatId.includes(":")?K.seatId.split(":").pop():K.seatId,q=X.get(K.seatId),W=(q==null?void 0:q.section)||Ie.split("-")[0],Z=K.status==="CANCELLED";no({bookingId:`R-${K.seatId}`,ownerUserId:p,concertId:de,session:null,zone:{id:W,label:`${W}구역`},seat:{id:K.seatId,section:W,row:Ie.split("-")[0],seatNum:parseInt(Ie.split("-")[1],10)||0,grade:W,gradeName:`${W}구역`},price:Number(q==null?void 0:q.price)||0,status:Z?"refunded":"confirmed",cancelledAt:Z?new Date(K.cancelledAt).getTime():void 0,source:"regular",paymentMethod:"card",paidAt:new Date(K.reservedAt).getTime()||Date.now()})})})}).catch(()=>{})}x();function _(){i==="bookings"?m():i==="cancel-queue"?F():i==="membership"?f():i==="interests"?I():i==="profile"?C():i==="refunds"?S():i==="notifications"?E():i==="profile-edit"?b():g()}_();const u=mt(()=>{(i==="bookings"||i==="")&&_()});function g(){const p=n.filter(R=>R.status!=="refunded"&&R.status!=="refund_pending"),k=o.size,h=Object.keys(r).length,D=ze();c(R=>{d.innerHTML=`
          <div class="stat-cards">
            <div class="stat-card"><div class="stat-card__label">예매한 티켓</div><div class="stat-card__value red">${p.length}건</div></div>
            <div class="stat-card"><div class="stat-card__label">관심 공연</div><div class="stat-card__value">${k}건</div></div>
            <div class="stat-card"><div class="stat-card__label">취소표 대기</div><div class="stat-card__value">${h}건</div></div>
            <div class="stat-card">
              <div class="stat-card__label">멤버십</div>
              <div class="stat-card__value membership-mini-status ${D?"is-active":"is-standby"}" role="img" aria-label="${D?"멤버십 활성화":"멤버십 비활성화"}" title="${D?"멤버십 활성화":"멤버십 비활성화"}">
                <span class="membership-mini-stage" aria-hidden="true"><span class="membership-rocket-emoji">🚀</span></span>
              </div>
            </div>
          </div>

          <div class="mypage-section-title">최근 예매내역</div>
          ${p.length?p.slice(0,3).map(H=>v(H,R)).join(""):B("아직 예매한 티켓이 없습니다.")}

        `,M(d)})}function m(){const p=n.filter(k=>k.status!=="refunded"&&k.status!=="refund_pending");c(k=>{d.innerHTML=`
          <div class="mypage-section-title" style="margin-top:0;">예매내역</div>
          ${p.length?p.map(h=>v(h,k)).join(""):B("아직 예매한 티켓이 없습니다.")}
        `,M(d)})}function F(){const p=Object.entries(r);d.innerHTML=`
        <div class="mypage-section-title" style="margin-top:0;">취소표 대기열</div>
        ${p.length?p.map(([k,h])=>{const D=Ot(k);return D?`
                  <div class="ticket-row" data-open="${k}" style="cursor:pointer;">
                    <div>
                      <div class="ticket-row__concert">${D.artist} · ${D.title}</div>
                      <div class="ticket-row__meta">전체 대기자 ${ye(h.total)}명 · 예상 대기시간 약 ${Math.max(1,Math.round(h.myNumber/h.total*210))}분</div>
                    </div>
                    <div style="text-align:right;">
                      <div class="ticket-row__price num-mono text-red">${ye(h.myNumber)}번</div>
                      <div class="ticket-row__meta">${ze()?"Private Link 이용 가능":"멤버십 필요"}</div>
                    </div>
                  </div>`:""}).join(""):B("취소표 대기열에 참여 중인 공연이 없습니다.")}
      `,d.querySelectorAll("[data-open]").forEach(k=>{k.addEventListener("click",()=>V(`cancel-queue/${k.dataset.open}`))})}function f(){var k,h;const p=ie().membership;d.innerHTML=`
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
      `,(k=d.querySelector("[data-join]"))==null||k.addEventListener("click",()=>V("membership")),(h=d.querySelector("[data-cancel-membership]"))==null||h.addEventListener("click",()=>{var D;be({title:"멤버십을 해지하시겠습니까?",bodyHtml:`
            <p style="margin-bottom:14px;">멤버십을 해지하시면 다음 혜택을 더 이상 이용할 수 없습니다.</p>
            <ul style="font-size:13.5px;color:var(--color-text-secondary);line-height:2;margin-bottom:14px;">
              <li>취소표 대기열 우선 배정</li>
              <li>Secret Link 전용 예매 기회</li>
            </ul>
            <div class="notice-box"><p>해지 후 재가입은 언제든 가능합니다.</p></div>
          `,footerHtml:`
            <button type="button" class="btn btn-ghost" data-modal-close>유지하기</button>
            <button type="button" class="btn btn-primary" style="background:var(--color-text-secondary);" data-confirm-cancel>해지하기</button>
          `}),(D=document.querySelector("[data-confirm-cancel]"))==null||D.addEventListener("click",()=>{const R=document.querySelector("[data-confirm-cancel]");R&&(R.disabled=!0,R.textContent="처리 중..."),ao().then(H=>{H.success?(Me(),J({title:"멤버십이 해지되었습니다",body:"재가입은 멤버십 페이지에서 언제든 가능합니다.",type:"success"}),f()):(R&&(R.disabled=!1,R.textContent="해지하기"),J({title:"해지에 실패했습니다",body:H.message||"잠시 후 다시 시도해주세요."}))})})})}function s(p){return`
        <div class="card" style="overflow:hidden;">
          <div class="interest-card__poster-wrap" data-open="${p.id}">
            <img class="interest-card__poster" src="${je(p.artist||p.title)}" alt="${we(p.artist)} 포스터" loading="lazy" />
            <button class="badge" data-heart="${p.id}" style="position:absolute;top:10px;right:10px;border:none;background:rgba(0,0,0,0.35);color:#fff;cursor:pointer;">♥</button>
          </div>
          <div style="padding:14px;">
            <div class="text-red" style="font-size:12px;font-weight:700;">${p.artist}</div>
            <div style="font-weight:800;font-size:13.5px;margin:4px 0 8px;">${p.title}</div>
            <div class="text-secondary" style="font-size:12px;">${vo(p.dateStart,p.dateEnd)}</div>
          </div>
        </div>`}function A(p){return`
        <div class="card" style="overflow:hidden;">
          <div class="interest-card__poster-wrap" data-open="${p.eventId}">
            <img class="interest-card__poster" src="${je(p.eventName||p.eventId)}" alt="${we(p.eventName)} 포스터" loading="lazy" />
            <button class="badge" data-heart="${p.eventId}" style="position:absolute;top:10px;right:10px;border:none;background:rgba(0,0,0,0.35);color:#fff;cursor:pointer;">♥</button>
          </div>
          <div style="padding:14px;">
            <div style="font-weight:800;font-size:13.5px;margin:4px 0 8px;">${p.eventName}</div>
            <div class="text-secondary" style="font-size:12px;">${p.eventDate||""} · ${p.venue||"-"}</div>
          </div>
        </div>`}function I(){c(p=>{const k=hi.filter(H=>o.has(H.id)),h=p.filter(H=>o.has(H.eventId)),D=k.map(s).join("")+h.map(A).join(""),R=k.length+h.length>0;d.innerHTML=`
          <div class="mypage-section-title" style="margin-top:0;">관심 공연</div>
          <div class="interest-grid">${D}</div>
          ${R?"":B("관심 등록한 공연이 없습니다.")}
        `,d.querySelectorAll("[data-open]").forEach(H=>H.addEventListener("click",()=>V(`concert/${H.dataset.open}`))),d.querySelectorAll("[data-heart]").forEach(H=>H.addEventListener("click",X=>{X.stopPropagation(),fi(H.dataset.heart),I()}))})}function C(){var p;d.innerHTML=`
        <div class="mypage-section-title" style="margin-top:0;">회원정보</div>
        <div class="card" style="padding:28px;max-width:480px;">
          <div class="field"><label>이름</label><input type="text" value="${we(a.name)}" readonly /></div>
          <div class="field"><label>아이디</label><input type="text" value="${we(a.userId)}" readonly /></div>
          <div class="field"><label>이메일</label><input type="text" value="${we(a.email)}" readonly /></div>
          <div class="field"><label>휴대폰 번호</label><input type="text" value="${we(Jt(a.phone||""))}" readonly /></div>
          ${a.birthDate?`<div class="field"><label>생년월일</label><input type="text" value="${we(a.birthDate)}" readonly /></div>`:""}
          <button type="button" class="btn btn-primary btn-block mt-16" data-go-profile-edit>회원정보 수정</button>
        </div>
      `,(p=d.querySelector("[data-go-profile-edit]"))==null||p.addEventListener("click",()=>V("mypage/profile-edit"))}function O(p,k){const h=Xt(p.concertId,k);if(!h)return"";const D=za(p,h),R=Ha(D),H=Math.round(p.price*R),X=Math.max(0,p.price-H),G=p.status==="refunded"?'<span class="badge badge-gray">환불 완료</span>':'<span class="badge badge-orange">환불 처리 중</span>';return`
        <div class="ticket-row" style="align-items:flex-start;">
          <div>
            <div class="ticket-row__concert">${h.name}</div>
            <div class="ticket-row__meta">취소일 ${p.cancelledAt?Bt(p.cancelledAt):"-"}</div>
          </div>
          <div style="text-align:right;">
            <div class="kv-row"><span>결제금액</span><b class="num-mono">${ve(p.price)}</b></div>
            <div class="kv-row"><span>취소 수수료</span><b class="num-mono text-red">-${ve(H)}</b></div>
            <div class="kv-row"><span>환불금액</span><b class="num-mono">${ve(X)}</b></div>
            <div class="mt-8">${G}</div>
          </div>
        </div>
      `}const L=7*24*60*60*1e3;function S(){c(p=>{const k=n.filter(h=>(h.status==="refund_pending"||h.status==="refunded")&&(!h.cancelledAt||Date.now()-h.cancelledAt<=L));d.innerHTML=`
          <div class="mypage-section-title" style="margin-top:0;">취소/환불내역</div>
          <div class="notice-box mt-8" style="margin-bottom:16px;"><p>취소/환불내역은 취소일로부터 7일간만 보관됩니다.</p></div>
          ${k.length?k.map(h=>O(h,p)).join(""):B("취소 및 환불 내역이 없습니다.")}
        `})}function E(){const p=_a();d.innerHTML=`
        <div class="mypage-section-title" style="margin-top:0;">알림</div>
        ${p.length?p.map(k=>`
              <div class="notif-list-item ${k.read?"":"is-unread"}">
                <div class="notif-list-item__title">${k.title}</div>
                <div class="notif-list-item__body text-secondary">${k.body}</div>
                <div class="notif-list-item__time text-secondary">${new Date(k.createdAt).toLocaleString("ko-KR")}</div>
              </div>`).join(""):B("아직 알림이 없습니다.")}
      `,ka()}function b(){d.innerHTML=`
        <div class="mypage-section-title" style="margin-top:0;">회원정보 수정</div>
        <div class="card" style="padding:28px;max-width:480px;">
          <div class="field"><label>이름</label><input type="text" data-edit="name" value="${we(a.name)}" maxlength="50" /></div>
          <div class="field">
            <label>이메일</label>
            <input type="text" value="${we(a.email)}" readonly />
            <div class="text-secondary" style="font-size:12px;margin-top:4px;">이메일은 계정 식별자로 사용되어 수정할 수 없습니다.</div>
          </div>
          <div class="field"><label>휴대폰 번호</label><input type="tel" data-edit="phone" value="${we(Jt(a.phone||""))}" placeholder="010-1234-5678" maxlength="13" /></div>
          <div class="field"><label>새 비밀번호</label><input type="password" data-edit="password" placeholder="변경하지 않으려면 비워두세요" /></div>
          <div class="field"><label>새 비밀번호 확인</label><input type="password" data-edit="password-confirm" placeholder="새 비밀번호를 한 번 더 입력해주세요" /></div>
          <label class="terms-row" style="margin:4px 0 6px;">
            <input type="checkbox" data-edit="marketing" ${a.marketingOptIn?"checked":""} />
            <span>이벤트 및 마케팅 정보 수신 동의</span>
          </label>
          ${a.birthDate?`<div class="field"><label>생년월일</label><input type="text" value="${we(a.birthDate)}" readonly /></div>`:""}
          ${a.joinedAt?`<div class="text-secondary" style="font-size:12px;">가입일 · ${Bt(a.joinedAt)}</div>`:""}
          <button type="button" class="btn btn-primary btn-block mt-24" data-save-profile>저장하기</button>
        </div>
      `;const p=d.querySelector('[data-edit="phone"]');p==null||p.addEventListener("input",()=>{p.value=Jt(p.value)});const k=d.querySelector("[data-save-profile]");k.addEventListener("click",async()=>{var Ae,Ie;const h=d.querySelector('[data-edit="name"]').value.trim(),D=d.querySelector('[data-edit="phone"]').value.trim(),R=d.querySelector('[data-edit="password"]').value,H=d.querySelector('[data-edit="password-confirm"]').value,X=d.querySelector('[data-edit="marketing"]').checked;if(!h){J({title:"이름을 입력해주세요."});return}if(D&&!Dd.test(D)){J({title:"휴대폰 번호 형식을 확인해주세요."});return}if(R&&R.length<4){J({title:"새 비밀번호는 4자 이상이어야 합니다."});return}if(R!==H){J({title:"새 비밀번호가 일치하지 않습니다."});return}k.disabled=!0,k.textContent="저장 중...";const G=await Ea({name:h,phone:D,password:R,marketingOptIn:X});if(!G.success){k.disabled=!1,k.textContent="저장하기",J({title:G.message||"회원정보를 저장하지 못했습니다."});return}J({title:"회원정보가 수정되었습니다",type:"success"});const K=e.querySelector("[data-mypage-user-name]");K&&(K.textContent=((Ae=ie().user)==null?void 0:Ae.name)||"");const de=e.querySelector("[data-mypage-avatar]");de&&(de.textContent=(((Ie=ie().user)==null?void 0:Ie.name)||"게").slice(0,1)),b()})}function v(p,k){var R,H;const h=Xt(p.concertId,k);if(!h)return"";const D=(R=p.session)!=null&&R.date?p.session.date.replaceAll("-","."):h.dateStart?Bt(h.dateStart):"";return`
        <div class="ticket-row" style="align-items:flex-start;flex-wrap:wrap;">
          <div class="ticket-row__main">
            <img class="ticket-row__poster" src="${h.image}" alt="${we(h.name)} 포스터" loading="lazy" />
            <div class="ticket-row__info">
            <div class="ticket-row__concert">${h.name} ${p.source==="cancel"?'<span class="badge badge-red-light">취소표</span>':""}</div>
            <div class="ticket-row__meta">${D}${(H=p.session)!=null&&H.time?" "+p.session.time:""}${D?" · ":""}${Wa(p)}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div class="ticket-row__price num-mono">${ve(p.price)}</div>
            <div class="ticket-row__meta mt-8">${aa(p)}</div>
            <div class="ticket-row__actions mt-8">
              <button type="button" class="btn btn-ghost btn-sm" data-ticket="${p.bookingId}">티켓 확인</button>
              ${p.status==="confirmed"?`<button type="button" class="btn btn-outline btn-sm" data-refund="${p.bookingId}">환불하기</button>`:""}
              ${p.status==="unpaid"?`<button type="button" class="btn btn-outline btn-sm" data-refund="${p.bookingId}">입금 취소</button>`:""}
            </div>
          </div>
          ${p.status==="unpaid"&&p.virtualAccount?$(p):""}
        </div>
      `}function $(p){return`
        <div class="vbank-box" style="width:100%;margin-top:14px;">
          <div class="vbank-box__label">가상계좌 입금 정보</div>
          <div class="kv-row"><span>결제 수단</span><b>무통장입금</b></div>
          <div class="vbank-box__bank">${p.virtualAccount.bank}</div>
          <div class="vbank-box__number num-mono">${p.virtualAccount.number}</div>
          <div class="vbank-box__amount">입금액 <b class="num-mono">${ve(p.price)}</b></div>
          ${p.vbankDeadline?`<div class="kv-row"><span>입금기한</span><b>${new Date(p.vbankDeadline).toLocaleString("ko-KR")}</b></div>`:""}
          <div class="kv-row"><span>입금상태</span><b>${aa(p)}</b></div>
        </div>
      `}function M(p){p.querySelectorAll("[data-ticket]").forEach(k=>{k.addEventListener("click",()=>V(`complete/${k.dataset.ticket}`))}),p.querySelectorAll("[data-refund]").forEach(k=>{k.addEventListener("click",()=>{const h=ie().bookings.find(D=>D.bookingId===k.dataset.refund);h&&c(D=>{const R=Xt(h.concertId,D);R&&Ld(h,R)})})})}function B(p){return`<div class="card" style="padding:40px;text-align:center;color:var(--color-disabled);font-size:13.5px;">${p}</div>`}return u}},oa=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;function Nd(e){be({title:e==="id"?"아이디/이메일 찾기":"비밀번호 찾기",bodyHtml:"<p>데모 환경에서는 아이디/비밀번호 찾기 기능이 제공되지 않습니다.<br/>가입 시 등록한 이메일과 비밀번호로 로그인해주세요.</p>",footerHtml:'<button type="button" class="btn btn-primary btn-block" data-modal-close>확인</button>'})}const Od={render(e){e.innerHTML=`
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
    `;const t=e.querySelector("[data-form]"),i=t.querySelector('[data-err="form"]');function a(r,d){const l=t.querySelector(`[data-err="${r}"]`);l&&(l.textContent=d||"");const c=l==null?void 0:l.closest(".field");c&&c.classList.toggle("field--invalid",!!d)}function n(){i.textContent="";const r=t.email.value.trim(),d=t.password.value;r&&!oa.test(r)?a("email","이메일 형식이 올바르지 않습니다."):a("email",""),d&&d.length<4?a("password","비밀번호는 4자 이상 입력해주세요."):a("password","")}t.email.addEventListener("input",n),t.password.addEventListener("input",n),e.querySelectorAll("[data-find]").forEach(r=>{r.addEventListener("click",d=>{d.preventDefault(),Nd(r.dataset.find)})});const o=t.querySelector('button[type="submit"]');t.addEventListener("submit",r=>{r.preventDefault();const d=t.email.value.trim(),l=t.password.value;if(!(oa.test(d)&&l.length>=4)){i.textContent="이메일 또는 비밀번호가 올바르지 않습니다.";return}i.textContent="",o.disabled=!0,fetch("/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:d,password:l})}).then(y=>y.json()).then(y=>{if(!y.success){i.textContent=y.message||"이메일 또는 비밀번호가 올바르지 않습니다.",o.disabled=!1;return}Za({name:y.name||d.split("@")[0]||"게스트",email:y.email||d,isAdmin:y.role==="admin",isMonitor:y.role==="monitor",role:y.role==="admin"?"ADMIN":y.role==="monitor"?"MONITOR":"USER",userId:y.userId||d,phone:y.phone||"",birthDate:y.birthDate||"",marketingOptIn:y.marketingOptIn,joinedAt:y.joinedAt});const x=Ta();y.role==="admin"?V(x||"admin"):y.role==="monitor"?V("monitoring"):V(x||"")}).catch(()=>{i.textContent="로그인 처리 중 오류가 발생했습니다.",o.disabled=!1})})}},Cd=/^[^\s@]+@[^\s@]+\.[^\s@]+$/,Rd=/^01[016789]-\d{3,4}-\d{4}$/;function Bd(e){const t=e.replace(/\D/g,"").slice(0,11);return t.length<4?t:t.length<8?`${t.slice(0,3)}-${t.slice(3)}`:t.length<=10?`${t.slice(0,3)}-${t.slice(3,6)}-${t.slice(6)}`:`${t.slice(0,3)}-${t.slice(3,7)}-${t.slice(7)}`}const Hd=[{key:"terms",required:!0,label:"[필수] 이용약관 동의"},{key:"privacy",required:!0,label:"[필수] 개인정보 수집 및 이용 동의"},{key:"service",required:!0,label:"[필수] 서비스 이용약관 동의"},{key:"marketing",required:!1,label:"[선택] 이벤트 및 마케팅 정보 수신 동의"}],Pd={render(e){e.innerHTML=`
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
            ${Hd.map(c=>`
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
    `;const t=e.querySelector("[data-form]"),i=t.querySelector('button[type="submit"]'),a={name:t.name,email:t.email,password:t.password,password2:t.password2,phone:t.phone,birth:t.birth},n=t.querySelector("[data-term-all]"),o=[...t.querySelectorAll("[data-term]")],r=o.filter(c=>c.dataset.required);function d(c,y){const x=t.querySelector(`[data-err="${c}"]`);x&&(x.textContent=y||"");const _=x==null?void 0:x.closest(".field");_&&_.classList.toggle("field--invalid",!!y)}function l(){let c=!0;return a.name.value.trim()?d("name",""):(d("name","이름을 입력해주세요."),c=!1),a.email.value.trim()?Cd.test(a.email.value.trim())?d("email",""):(d("email","이메일 형식이 올바르지 않습니다."),c=!1):(d("email","이메일을 입력해주세요."),c=!1),a.password.value?a.password.value.length<8?(d("password","비밀번호는 8자 이상 입력해주세요."),c=!1):d("password",""):(d("password","비밀번호를 입력해주세요."),c=!1),a.password2.value?a.password2.value!==a.password.value?(d("password2","비밀번호가 일치하지 않습니다."),c=!1):d("password2",""):(d("password2","비밀번호를 다시 입력해주세요."),c=!1),a.phone.value.trim()?Rd.test(a.phone.value.trim())?d("phone",""):(d("phone","휴대폰 번호 형식이 올바르지 않습니다."),c=!1):(d("phone","휴대폰 번호를 입력해주세요."),c=!1),a.birth.value?d("birth",""):(d("birth","생년월일을 입력해주세요."),c=!1),r.every(x=>x.checked)?d("terms",""):(d("terms","필수 약관에 동의해주세요."),c=!1),i.disabled=!c,c}a.phone.addEventListener("input",()=>{const c=a.phone.selectionStart,y=a.phone.value.length;a.phone.value=Bd(a.phone.value);const x=a.phone.value.length-y;a.phone.setSelectionRange(c+x,c+x),l()}),Object.values(a).forEach(c=>{c!==a.phone&&(c.addEventListener("input",l),c.addEventListener("blur",l))}),n.addEventListener("change",()=>{o.forEach(c=>c.checked=n.checked),l()}),o.forEach(c=>c.addEventListener("change",()=>{n.checked=o.every(y=>y.checked),l()})),t.addEventListener("submit",c=>{c.preventDefault(),l()&&(d("form",""),i.disabled=!0,fetch("/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:a.email.value.trim(),password:a.password.value,email:a.email.value.trim(),name:a.name.value.trim(),phone:a.phone.value.trim(),birthDate:a.birth.value})}).then(y=>y.json()).then(y=>{if(!y.success){d("form",y.message||"회원가입 처리 중 오류가 발생했습니다."),i.disabled=!1;return}V("signup-complete")}).catch(()=>{d("form","회원가입 처리 중 오류가 발생했습니다."),i.disabled=!1}))})}},qd={render(e){e.innerHTML=`
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
    `,e.querySelector("[data-login]").addEventListener("click",()=>V("login")),e.querySelector("[data-home]").addEventListener("click",()=>V(""))}},lt=[{key:"VIP",seats:20,price:18e4},{key:"R",seats:50,price:14e4},{key:"S",seats:80,price:11e4},{key:"A",seats:100,price:8e4}],Ud=Te.zones.reduce((e,t)=>{const i=t.id==="Floor"?ot:t.seats.length;return e[t.grade]=(e[t.grade]||0)+i,e},{});function jd(e){const t=Ud[e.key]||e.seats;return`
    <tr data-grade-row="${e.key}">
      <td><b>${e.key}</b></td>
      <td><input type="number" min="0" data-grade-seats="${e.key}" value="${t}" style="width:90px;" disabled /></td>
      <td><input type="number" min="0" step="1000" data-grade-price="${e.key}" value="${e.price}" style="width:120px;" /></td>
    </tr>
  `}function Ya(e){return fetch("/event/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)}).then(t=>t.json())}const ct=[{artist:"AKMU",eventName:"AKMU 2026 CONCERT [사춘기 : SAILING HOME]",eventDate:"2026-11-01",venue:"올림픽홀",sessions:[{date:"2026-11-01",time:"19:00"},{date:"2026-11-02",time:"18:00"}]},{artist:"윤하",eventName:"윤하 2026 CONCERT [STARDUST : EVENT HORIZON]",eventDate:"2026-11-08",venue:"올림픽홀",sessions:[{date:"2026-11-08",time:"19:00"}]},{artist:"Stray Kids",eventName:"Stray Kids 2026 WORLD TOUR [THUNDEROUS : UNCHAINED]",eventDate:"2026-11-14",venue:"올림픽홀",sessions:[{date:"2026-11-14",time:"18:00"},{date:"2026-11-15",time:"17:00"}]},{artist:"RIIZE",eventName:"RIIZE 2026 FAN CONCERT [GET A GUITAR : FIRST LIGHT]",eventDate:"2026-11-22",venue:"올림픽홀",sessions:[{date:"2026-11-22",time:"18:00"},{date:"2026-11-23",time:"17:00"}]},{artist:"IVE",eventName:"IVE 2026 CONCERT [AFTER LIKE : THE CROWN]",eventDate:"2026-11-28",venue:"올림픽홀",sessions:[{date:"2026-11-28",time:"18:00"},{date:"2026-11-29",time:"17:00"}]},{artist:"DAY6",eventName:"DAY6 2026 CONCERT [한 페이지가 될 수 있게 : FOREVER YOUNG]",eventDate:"2026-11-29",venue:"올림픽홀",sessions:[{date:"2026-11-29",time:"18:00"},{date:"2026-11-30",time:"17:00"}]},{artist:"(G)I-DLE",eventName:"(G)I-DLE 2026 WORLD TOUR [SUPER LADY : QUEENDOM]",eventDate:"2026-12-05",venue:"올림픽홀",sessions:[{date:"2026-12-05",time:"18:00"},{date:"2026-12-06",time:"17:00"}]},{artist:"TXT",eventName:"TOMORROW X TOGETHER 2026 WORLD TOUR [STAR SEEKERS : ACT TWO]",eventDate:"2026-12-12",venue:"올림픽홀",sessions:[{date:"2026-12-12",time:"18:00"},{date:"2026-12-13",time:"17:00"}]},{artist:"SEVENTEEN",eventName:"SEVENTEEN 2026 WORLD TOUR [DIAMOND EDGE : REBORN]",eventDate:"2026-12-19",venue:"올림픽홀",sessions:[{date:"2026-12-19",time:"18:00"},{date:"2026-12-20",time:"17:00"}]},{artist:"백예린",eventName:"백예린 2026 CONCERT [Square : INDIE NIGHT]",eventDate:"2026-12-25",venue:"올림픽홀",sessions:[{date:"2026-12-25",time:"19:00"}]},{artist:"Heize",eventName:"Heize 2026 CONCERT [HAPPEN IN WINTER]",eventDate:"2026-12-26",venue:"올림픽홀",sessions:[{date:"2026-12-26",time:"20:00"}]},{artist:"성시경",eventName:"성시경 2026 연말콘서트 [두 사람 : YEAR-END BALLAD NIGHT]",eventDate:"2026-12-31",venue:"올림픽홀",sessions:[{date:"2026-12-31",time:"20:00"}]},{artist:"이적",eventName:"이적 2027 CONCERT [하늘을 달리다 : VOICE OF A GENERATION]",eventDate:"2027-01-03",venue:"올림픽홀",sessions:[{date:"2027-01-03",time:"19:00"}]},{artist:"NewJeans",eventName:"NewJeans 2027 FAN CONCERT [OMG : SUMMER DREAMING]",eventDate:"2027-01-10",venue:"올림픽홀",sessions:[{date:"2027-01-10",time:"18:00"},{date:"2027-01-11",time:"17:00"}]},{artist:"BLACKPINK",eventName:"BLACKPINK 2027 WORLD TOUR [PINK VENOM : THE FINALE]",eventDate:"2027-01-17",venue:"올림픽홀",sessions:[{date:"2027-01-17",time:"18:00"},{date:"2027-01-18",time:"17:00"}]},{artist:"박효신",eventName:"박효신 2027 CONCERT [SOULS AND SONGS]",eventDate:"2027-01-24",venue:"올림픽홀",sessions:[{date:"2027-01-24",time:"19:00"},{date:"2027-01-25",time:"18:00"}]},{artist:"NCT DREAM",eventName:"NCT DREAM 2027 CONCERT [THE DREAM SHOW 4 : WONDERLAND]",eventDate:"2027-01-31",venue:"올림픽홀",sessions:[{date:"2027-01-31",time:"18:00"},{date:"2027-02-01",time:"17:00"}]},{artist:"TAEYEON",eventName:"TAEYEON 2027 CONCERT [ONCE UPON A TIME]",eventDate:"2027-02-07",venue:"올림픽홀",sessions:[{date:"2027-02-07",time:"18:00"},{date:"2027-02-08",time:"17:00"}]},{artist:"aespa",eventName:"aespa 2027 WORLD TOUR [SUPERNOVA : SYNK HORIZON]",eventDate:"2027-02-14",venue:"올림픽홀",sessions:[{date:"2027-02-14",time:"18:00"},{date:"2027-02-15",time:"17:00"}]},{artist:"자우림",eventName:"자우림 2027 CONCERT [스물다섯, 스물하나 : TIMELESS ECHOES]",eventDate:"2027-02-15",venue:"올림픽홀",sessions:[{date:"2027-02-15",time:"19:00"}]},{artist:"ZICO",eventName:"ZICO 2027 CONCERT [SPOT! : KING OF THE JUNGLE]",eventDate:"2027-02-22",venue:"올림픽홀",sessions:[{date:"2027-02-22",time:"19:00"}]},{artist:"LE SSERAFIM",eventName:"LE SSERAFIM 2027 WORLD TOUR [FEARLESS : FLAME RISES]",eventDate:"2027-02-28",venue:"올림픽홀",sessions:[{date:"2027-02-28",time:"18:00"},{date:"2027-03-01",time:"17:00"}]},{artist:"BTS",eventName:"BTS 2027 WORLD TOUR [BEYOND THE SCENE : ETERNAL]",eventDate:"2027-03-01",venue:"올림픽홀",sessions:[{date:"2027-03-01",time:"18:00"},{date:"2027-03-02",time:"17:00"}]},{artist:"AILEE",eventName:"AILEE 2027 CONCERT [I WILL SHOW YOU : THE POWERHOUSE]",eventDate:"2027-03-08",venue:"올림픽홀",sessions:[{date:"2027-03-08",time:"19:00"}]},{artist:"IU",eventName:"IU 2027 CONCERT [THE GOLDEN HOUR : CURTAIN CALL]",eventDate:"2027-03-14",venue:"올림픽홀",sessions:[{date:"2027-03-14",time:"18:00"},{date:"2027-03-15",time:"17:00"}]},{artist:"잔나비",eventName:"잔나비 2027 CONCERT [주저하는 연인들을 위해 : MONKEY CINEMA]",eventDate:"2027-03-15",venue:"올림픽홀",sessions:[{date:"2027-03-15",time:"19:00"}]},{artist:"EXO",eventName:"EXO 2027 CONCERT [EXO PLANET #6 : CHRONICLE]",eventDate:"2027-03-22",venue:"올림픽홀",sessions:[{date:"2027-03-22",time:"18:00"},{date:"2027-03-23",time:"17:00"}]},{artist:"영탁",eventName:"영탁 2027 CONCERT [찐이야 : ALL-IN LIVE]",eventDate:"2027-03-29",venue:"올림픽홀",sessions:[{date:"2027-03-29",time:"18:00"}]},{artist:"폴킴",eventName:"폴킴 2027 CONCERT [비 : EVERY DAY EVERY MOMENT]",eventDate:"2027-04-05",venue:"올림픽홀",sessions:[{date:"2027-04-05",time:"19:00"}]},{artist:"TWICE",eventName:"TWICE 2027 WORLD TOUR [FEEL SPECIAL : ONCE MORE]",eventDate:"2027-04-05",venue:"올림픽홀",sessions:[{date:"2027-04-05",time:"18:00"},{date:"2027-04-06",time:"17:00"}]},{artist:"김범수",eventName:"김범수 2027 CONCERT [보고 싶다 : A VOICE FOR ETERNITY]",eventDate:"2027-04-12",venue:"올림픽홀",sessions:[{date:"2027-04-12",time:"19:00"}]},{artist:"Red Velvet",eventName:"Red Velvet 2027 CONCERT [CHILL KILL : THE VELVET NIGHT]",eventDate:"2027-04-19",venue:"올림픽홀",sessions:[{date:"2027-04-19",time:"18:00"},{date:"2027-04-20",time:"17:00"}]},{artist:"송가인",eventName:"송가인 2027 CONCERT [트로트의 여왕 : 꽃길만 걸으세요]",eventDate:"2027-04-26",venue:"올림픽홀",sessions:[{date:"2027-04-26",time:"18:00"}]},{artist:"이승철",eventName:"이승철 2027 CONCERT [LEGEND CONTINUES]",eventDate:"2027-05-03",venue:"올림픽홀",sessions:[{date:"2027-05-03",time:"19:00"},{date:"2027-05-04",time:"18:00"}]},{artist:"임영웅",eventName:"임영웅 2027 전국투어 [IM HERO : LEGEND TOUR]",eventDate:"2027-05-10",venue:"올림픽홀",sessions:[{date:"2027-05-10",time:"18:00"},{date:"2027-05-11",time:"17:00"}]},{artist:"YB",eventName:"YB 2027 CONCERT [나는 나비 : ROCK NEVER DIES]",eventDate:"2027-05-17",venue:"올림픽홀",sessions:[{date:"2027-05-17",time:"19:00"}]},{artist:"장윤정",eventName:"장윤정 2027 CONCERT [어머나! : TIMELESS DIVA]",eventDate:"2027-05-24",venue:"올림픽홀",sessions:[{date:"2027-05-24",time:"18:00"}]},{artist:"이찬원",eventName:"이찬원 2027 CONCERT [진또배기 : YOUNG KING OF TROT]",eventDate:"2027-06-07",venue:"올림픽홀",sessions:[{date:"2027-06-07",time:"18:00"}]},{artist:"선우정아",eventName:"선우정아 2027 CONCERT [도망가자 : CATHARSIS]",eventDate:"2027-06-14",venue:"올림픽홀",sessions:[{date:"2027-06-14",time:"19:00"}]},{artist:"NELL",eventName:"NELL 2027 CONCERT [지구가 태양을 네 번 : FOUR SEASONS]",eventDate:"2027-06-21",venue:"올림픽홀",sessions:[{date:"2027-06-21",time:"19:00"}]}],Gd={BTS:"BIGHIT MUSIC / HYBE",BLACKPINK:"YG Entertainment",SEVENTEEN:"Pledis Entertainment / HYBE",NewJeans:"ADOR / HYBE",IVE:"Starship Entertainment",aespa:"SM Entertainment",TWICE:"JYP Entertainment",EXO:"SM Entertainment","Stray Kids":"JYP Entertainment","NCT DREAM":"SM Entertainment","(G)I-DLE":"CUBE Entertainment","LE SSERAFIM":"SOURCE MUSIC / HYBE",RIIZE:"SM Entertainment","Red Velvet":"SM Entertainment",TXT:"BIGHIT MUSIC / HYBE",IU:"EDAM Entertainment",박효신:"Glove Entertainment",성시경:"JELLYFISH Entertainment",TAEYEON:"SM Entertainment",윤하:"C9 Entertainment",AILEE:"THE L1VE",김범수:"Polaris Entertainment",이승철:"HOOK Entertainment",Heize:"P NATION",ZICO:"KOZ Entertainment",임영웅:"fish music",송가인:"POCKET DOL STUDIO",영탁:"TV 조선",이찬원:"GREEN FISH",장윤정:"K-PERFORMANCE",AKMU:"YG Entertainment",이적:"Music Farm",백예린:"Blue Vinyl",선우정아:"Magic Strawberry Sound",폴킴:"Neuron Music",YB:"Dee Company",자우림:"JAUR.M",DAY6:"JYP Entertainment",잔나비:"Peponi Music",NELL:"Space Bohemian"},Wd=["약 120분","약 130분 (인터미션 포함)","약 150분 (인터미션 20분 포함)","약 100분","약 180분 (인터미션 15분 포함)"],zd=["전체 관람가","만 7세 이상 관람가","만 12세 이상 관람가"],Yd={BTS:"RM, JIN, SUGA, J-HOPE, JIMIN, V, JUNGKOOK",BLACKPINK:"JISOO, JENNIE, ROSÉ, LISA",SEVENTEEN:"S.COUPS, JEONGHAN, JOSHUA, JUN, HOSHI, WONWOO, WOOZI, DK, MINGYU, THE8, SEUNGKWAN, VERNON, DINO",NewJeans:"MINJI, HANNI, DANIELLE, HAERIN, HYEIN",IVE:"YUJIN, GAEUL, REI, WONYOUNG, LIZ, LEESEO",aespa:"KARINA, GISELLE, WINTER, NINGNING",TWICE:"NAYEON, JEONGYEON, MOMO, SANA, JIHYO, MINA, DAHYUN, CHAEYOUNG, TZUYU",EXO:"XIUMIN, SUHO, LAY, BAEKHYUN, CHEN, CHANYEOL, D.O., KAI, SEHUN","Stray Kids":"Bang Chan, Lee Know, Changbin, Hyunjin, HAN, Felix, Seungmin, I.N","NCT DREAM":"MARK, RENJUN, JENO, HAECHAN, JAEMIN, CHENLE, JISUNG","(G)I-DLE":"MIYEON, MINNIE, SOYEON, YUQI, SHUHUA","LE SSERAFIM":"SAKURA, KIM CHAEWON, HUH YUNJIN, KAZUHA, HONG EUNCHAE",RIIZE:"SHOTARO, EUNSEOK, SUNGCHAN, WONBIN, SEUNGHAN, SOHEE, ANTON","Red Velvet":"IRENE, SEULGI, WENDY, JOY, YERI",TXT:"SOOBIN, YEONJUN, BEOMGYU, TAEHYUN, HUENINGKAI",IU:"IU (이지은)",박효신:"박효신",성시경:"성시경",TAEYEON:"TAEYEON (태연)",윤하:"윤하",AILEE:"AILEE (에일리)",김범수:"김범수",이승철:"이승철",Heize:"Heize (헤이즈)",ZICO:"ZICO (지코)",임영웅:"임영웅",송가인:"송가인",영탁:"영탁",이찬원:"이찬원",장윤정:"장윤정",AKMU:"이찬혁, 이수현",이적:"이적",백예린:"백예린",선우정아:"선우정아",폴킴:"폴킴",YB:"윤도현, 박태희, 허준, 김진원, 스캇 할로웰",자우림:"김윤아, 이선규, 김지민, 구태훈",DAY6:"Jae, Sungjin, Young K, Wonpil, Dowoon",잔나비:"최정훈, 김도형",NELL:"김종완, 이재경, 이정재, 정재원"};function Vd(e,t,i){const a=[`${e}의 ${t} 서울 공연이 ${i}에서 개최됩니다. 화려한 무대 연출과 완벽한 라이브 퍼포먼스로 관객들에게 잊을 수 없는 경험을 선사합니다. 아티스트와 팬이 함께 만들어가는 특별한 시간, 놓치지 마세요.`,`${i}에서 펼쳐지는 ${e}의 대규모 공연! 히트곡 메들리부터 신곡 최초 무대까지, 오직 이 공연에서만 볼 수 있는 스페셜 세트리스트가 준비되어 있습니다. 최첨단 LED 스크린과 조명 연출이 어우러진 몰입감 넘치는 무대를 경험하세요.`,`${e}가 팬들과 함께하는 ${t}! ${i}의 넓은 무대를 가득 채울 역대급 스케일의 공연이 찾아옵니다. 앵콜 무대를 포함한 약 2시간의 공연 동안 최고의 퍼포먼스와 감동적인 멘트까지, 팬이라면 반드시 함께해야 할 순간입니다.`,`글로벌 아티스트 ${e}의 ${t}이 드디어 서울에 상륙합니다. ${i}에서 진행되는 이번 공연은 월드투어의 하이라이트로, 해외에서 먼저 검증된 완성도 높은 세트리스트와 무대 구성이 그대로 재현됩니다. 현장에서만 느낄 수 있는 압도적인 사운드와 비주얼을 직접 체험해보세요.`];return a[Math.floor(Math.random()*a.length)]}function Kd(){return["본 공연은 지정좌석제로 운영됩니다.","공연 시작 후 입장이 제한될 수 있습니다.","촬영(사진/영상) 및 녹음은 금지됩니다.","티켓 양도 및 교환은 공식 채널을 통해서만 가능합니다.","공연 당일 본인 확인이 진행됩니다. 신분증을 지참해주세요."]}let yt=0;function na(e){return e[Math.floor(Math.random()*e.length)]}function Jd(){const e=ct[yt%ct.length];yt++;const t=e.artist,i=n=>{var r;const o=((r=lt.find(d=>d.key===n))==null?void 0:r.price)||lt[lt.length-1].price;return Math.round(o*(.85+Math.random()*.3)/1e3)*1e3},a=Te.zones.map(n=>({name:n.id,seats:n.id==="Floor"?ot:n.seats.length,price:i(n.grade)}));return{eventName:e.eventName,eventDate:e.eventDate,venue:"올림픽홀",seatingType:"olympichall",sections:a,sessions:e.sessions,runtime:na(Wd),ageRating:na(zd),cast:Yd[t]||t,agency:Gd[t]||"Entertainment Corp.",description:Vd(t,e.eventName,e.venue),notices:Kd()}}let Pe=[];function Xd(e,t){return fetch(`/events/${e}/open-time`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({ticketOpenAt:t})}).then(i=>i.json())}function Zd(e,t){return fetch(`/events/${e}/close-time`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({ticketCloseAt:t})}).then(i=>i.json())}function Va(e){Pe.forEach(t=>{const i=e.querySelector(`[data-open-status="${t.eventId}"]`);if(!i)return;const a=t.ticketOpenAt?new Date(t.ticketOpenAt).getTime()-Date.now():0,n=t.ticketCloseAt?new Date(t.ticketCloseAt).getTime()-Date.now():0;if(t.ticketOpenAt&&a>0){i.innerHTML=`<span class="badge badge-orange">오픈 예정</span><div class="num-mono" style="font-size:12px;margin-top:4px;color:var(--color-text-secondary);">${wt(a)}</div>`;return}if(t.ticketCloseAt&&n<=0){i.innerHTML='<span class="badge badge-outline">마감됨</span>';return}let o='<span class="badge badge-green">예매중</span>';t.ticketCloseAt&&n>0&&(o+=`<div class="num-mono" style="font-size:11px;margin-top:4px;color:var(--color-text-secondary);">마감까지 ${wt(n)}</div>`),i.innerHTML=o})}function Be(e){const t=e.querySelector("[data-events-tbody]");t&&fetch("/events").then(i=>i.json()).then(i=>{if(Pe=i.events||[],Pe.length===0){t.innerHTML='<tr><td colspan="7" class="text-secondary">생성된 공연이 없습니다.</td></tr>',Zt(e);return}t.innerHTML=Pe.map((a,n)=>`
        <tr>
          <td class="num-mono">${n+1}</td>
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
        </tr>`).join(""),Va(e),Zt(e),t.querySelectorAll("[data-set-open-time]").forEach(a=>{a.addEventListener("click",()=>{const n=Pe.find(o=>o.eventId===a.dataset.setOpenTime);n&&ts(n,()=>Be(e))})}),t.querySelectorAll("[data-set-close-time]").forEach(a=>{a.addEventListener("click",()=>{const n=Pe.find(o=>o.eventId===a.dataset.setCloseTime);n&&is(n,()=>Be(e))})}),t.querySelectorAll("[data-delete-event]").forEach(a=>{a.addEventListener("click",()=>{var o,r;const n=((r=(o=a.closest("tr"))==null?void 0:o.children[1])==null?void 0:r.textContent)||"";confirm(`"${n}" 공연을 삭제할까요? (좌석 데이터도 함께 삭제됩니다)`)&&(a.disabled=!0,fetch(`/events/${a.dataset.deleteEvent}`,{method:"DELETE"}).then(async d=>{const l=await d.json();if(!d.ok||!l.success)throw new Error(l.message||"삭제 실패");return l}).then(d=>{J({title:d.dbSynced===!1?"공연은 삭제됐지만 DB 동기화 실패":"공연이 삭제되었습니다",body:n,type:d.dbSynced===!1?"default":"success"}),Be(e)}).catch(d=>{J({title:"삭제 중 오류가 발생했습니다",body:d.message}),a.disabled=!1}))})})}).catch(()=>{t.innerHTML='<tr><td colspan="7" class="text-red">목록을 불러오지 못했습니다.</td></tr>',Zt(e)})}function Zt(e){const t=e.querySelector("[data-bulk-delete]");t&&(t.disabled=Pe.length===0,t.textContent="5개씩 삭제")}async function Qd(e){const t=[];for(const i of e){const a=await fetch(`/events/${encodeURIComponent(i.eventId)}`,{method:"DELETE"}),n=await a.json().catch(()=>({}));if(!a.ok||!n.success)throw new Error(n.message||`${i.eventName} 삭제에 실패했습니다.`);t.push(n)}return{success:!0,deletedCount:t.length,results:t}}async function es(e){const t=await fetch("/events/batch-delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({eventIds:e.map(a=>a.eventId)})}),i=await t.json().catch(()=>({}));if(t.status===404)return Qd(e);if(!t.ok)throw new Error(i.message||"일괄 삭제 요청에 실패했습니다.");return i}function it(e){const t=i=>String(i).padStart(2,"0");return`${e.getFullYear()}-${t(e.getMonth()+1)}-${t(e.getDate())}T${t(e.getHours())}:${t(e.getMinutes())}:${t(e.getSeconds())}`}function ft(e,t,i,a){Xd(e,t).then(n=>{if(n.error){J({title:"오픈 시간 설정 실패",body:n.error});return}J({title:i,body:n.message,type:"success"}),Me(),a==null||a()}).catch(()=>J({title:"오픈 시간 설정 중 오류가 발생했습니다"}))}function ts(e,t){const i=e.ticketOpenAt?it(new Date(e.ticketOpenAt)):it(new Date(Date.now()+3e5));be({title:`예매 오픈 시간 설정 — ${e.eventName}`,bodyHtml:`
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
    `});const a=document.querySelector("[data-open-time-input]");document.querySelectorAll("[data-quick-preset]").forEach(n=>{n.addEventListener("click",()=>{const o=n.dataset.quickPreset;if(o==="now"){ft(e.eventId,null,"예매가 즉시 오픈으로 설정되었습니다",t);return}const r={"10s":1e4,"1m":6e4,"10m":6e5}[o]||0,d=new Date(Date.now()+r);a.value=it(d),ft(e.eventId,d.toISOString(),`오픈 시간이 "${n.textContent}"(으)로 설정되었습니다`,t)})}),document.querySelector("[data-clear-open-time]").addEventListener("click",()=>{ft(e.eventId,null,"오픈 시간 제한이 해제되었습니다",t)}),document.querySelector("[data-save-open-time]").addEventListener("click",()=>{if(!a.value){J({title:"오픈 일시를 입력해주세요"});return}const n=new Date(a.value);if(Number.isNaN(n.getTime())){J({title:"올바른 날짜/시간을 입력해주세요"});return}ft(e.eventId,n.toISOString(),"오픈 시간이 설정되었습니다",t)})}function Qt(e,t,i,a){Zd(e,t).then(n=>{if(n.error){J({title:"마감 시간 설정 실패",body:n.error});return}J({title:i,body:n.message,type:"success"}),Me(),a==null||a()}).catch(()=>J({title:"마감 시간 설정 중 오류가 발생했습니다"}))}function is(e,t){const i=e.ticketCloseAt?it(new Date(e.ticketCloseAt)):it(new Date(Date.now()+36e5));be({title:`마감 시간 설정 — ${e.eventName}`,bodyHtml:`
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
    `});const a=document.querySelector("[data-close-time-input]");document.querySelectorAll("[data-close-preset]").forEach(n=>{n.addEventListener("click",()=>{const o={"5m":3e5,"30m":18e5,"1h":36e5,"24h":864e5}[n.dataset.closePreset]||0,r=new Date(Date.now()+o);a.value=it(r),Qt(e.eventId,r.toISOString(),`마감 시간이 "${n.textContent}"(으)로 설정되었습니다`,t)})}),document.querySelector("[data-clear-close-time]").addEventListener("click",()=>{Qt(e.eventId,null,"마감 시간 제한이 해제되었습니다 (수동 마감)",t)}),document.querySelector("[data-save-close-time]").addEventListener("click",()=>{if(!a.value){J({title:"마감 일시를 입력해주세요"});return}const n=new Date(a.value);if(Number.isNaN(n.getTime())){J({title:"올바른 날짜/시간을 입력해주세요"});return}Qt(e.eventId,n.toISOString(),"마감 시간이 설정되었습니다",t)})}function as(e){be({title:"공연 생성",bodyHtml:`
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
            <tbody>${lt.map(jd).join("")}</tbody>
          </table>
        </div>
        <div class="field-error field-error--form" data-err="form"></div>
      </form>
    `,footerHtml:`
      <button type="button" class="btn btn-outline" data-modal-close>취소</button>
      <button type="button" class="btn btn-primary" data-submit-create-event>공연 생성</button>
    `});const t=document.querySelector("[data-create-event]"),i=document.querySelector('[data-err="form"]'),a=document.querySelector("[data-submit-create-event]");a.addEventListener("click",()=>{const n=t.eventName.value.trim();if(!n){i.textContent="공연명을 입력해주세요.";return}const o=Object.fromEntries(lt.map(d=>[d.key,parseInt(t.querySelector(`[data-grade-price="${d.key}"]`).value,10)||0])),r=Te.zones.map(d=>({name:d.id,seats:d.id==="Floor"?ot:d.seats.length,price:o[d.grade]||0}));if(Pe.some(d=>d.eventName===n)){i.textContent="이미 동일한 이름의 공연이 존재합니다.";return}i.textContent="",a.disabled=!0,Ya({eventName:n,eventDate:t.eventDate.value||void 0,venue:"올림픽홀",seatingType:"olympichall",sections:r}).then(d=>{if(d.error){i.textContent=d.error,a.disabled=!1;return}J({title:"공연이 생성되었습니다",body:d.message||`${n} 생성 완료`,type:"success"}),Me(),e==null||e()}).catch(()=>{i.textContent="공연 생성 중 오류가 발생했습니다.",a.disabled=!1})})}const os={render(e){if(!xt()){J({title:"접근 권한이 없습니다",body:Ce()?"관리자만 이용할 수 있는 페이지입니다.":"로그인이 필요한 페이지입니다."}),V("");return}e.innerHTML=`
      <div class="container admin-topbar">
        <div>
          <div class="eyebrow">ADMIN CONSOLE</div>
          <h2 class="section-title">공연 관리</h2>
          <p class="section-sub">공연 생성 · 오픈 시간 설정 · 삭제</p>
        </div>
        <div class="admin-status">
          <button type="button" class="btn btn-primary btn-sm" data-open-create-event>+ 공연 생성</button>
          <button type="button" class="btn btn-outline btn-sm" data-random-create-event>📋 포스터 공연 생성</button>
          <button type="button" class="btn btn-outline btn-sm" data-bulk-delete disabled>5개씩 삭제</button>
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
    `,Be(e);const t=setInterval(()=>Va(e),1e3);return e.querySelector("[data-bulk-delete]").addEventListener("click",()=>{const i=Pe.slice(0,5);if(!i.length)return;const a=i.map(o=>o.eventName).join(`
`);if(!confirm(`공연 목록의 앞에서부터 ${i.length}개 공연을 삭제할까요?

${a}

좌석·관심·예매 데이터도 함께 삭제됩니다.`))return;const n=e.querySelector("[data-bulk-delete]");n.disabled=!0,n.textContent="삭제 중...",es(i).then(o=>{const r=(o.results||[]).filter(d=>!d.success||d.dbSynced===!1);r.length?J({title:`${o.deletedCount||0}개 삭제 완료 · ${r.length}개 확인 필요`,body:r.map(d=>`${d.eventId}: ${d.message}`).join(" / ")}):J({title:`${o.deletedCount||i.length}개 공연이 삭제되었습니다`,type:"success"}),Be(e)}).catch(o=>{J({title:"일괄 삭제 중 오류가 발생했습니다",body:o.message}),Be(e)})}),e.querySelector("[data-open-create-event]").addEventListener("click",()=>{as(()=>Be(e))}),e.querySelector("[data-random-create-event]").addEventListener("click",i=>{const a=i.currentTarget,n=new Set(Pe.map(l=>l.eventName)),o=ct.filter(l=>!n.has(l.eventName));if(o.length===0){J({title:"모든 포스터 공연이 이미 생성되었습니다",body:`${ct.length}개 공연 등록 완료`});return}a.disabled=!0;const r=yt;yt=ct.indexOf(o[0]);const d=Jd();yt=r,Ya(d).then(l=>{if(l.error){J({title:"생성 실패",body:l.error});return}J({title:"공연이 생성되었습니다",body:`${d.eventName} (남은 포스터: ${o.length-1}개)`,type:"success"}),Be(e)}).catch(()=>J({title:"포스터 공연 생성 중 오류가 발생했습니다"})).finally(()=>{a.disabled=!1})}),e.querySelector("[data-redis-reset]").addEventListener("click",()=>{be({title:"Redis 초기화",bodyHtml:`
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
        `,footerHtml:'<button type="button" class="btn btn-outline" data-modal-close>취소</button>'}),document.querySelectorAll("[data-redis-mode]").forEach(i=>{i.addEventListener("click",()=>{const a=i.dataset.redisMode;Me(),fetch("/admin/redis/reset",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:a})}).then(n=>n.json()).then(n=>{n.success?(J({title:`Redis 초기화 완료 (${a})`,body:n.cleared.join(", "),type:"success"}),Be(e)):J({title:"Redis 초기화 실패",body:n.message||"알 수 없는 오류"})}).catch(()=>J({title:"Redis 초기화 요청 실패",body:"서버 연결을 확인해주세요."}))})})}),e.querySelector("[data-redis-recover]").addEventListener("click",()=>{var i;be({title:"MariaDB → Redis 복구",bodyHtml:`
          <p style="margin-bottom:12px;">Redis가 비어있을 때 MariaDB 데이터를 기반으로 복구합니다.</p>
          <p style="font-size:13px;color:var(--color-text-secondary);margin-bottom:16px;">이벤트 목록, 좌석 상태, 대기열을 모두 복원합니다.<br/>이미 Redis에 데이터가 있는 항목은 건너뜁니다.</p>
          <button type="button" class="btn btn-primary btn-block" data-do-recover>복구 실행</button>
        `,footerHtml:'<button type="button" class="btn btn-outline" data-modal-close>취소</button>'}),(i=document.querySelector("[data-do-recover]"))==null||i.addEventListener("click",()=>{Me(),fetch("/admin/redis/recover",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({})}).then(a=>a.json()).then(a=>{var n,o,r,d,l;if(a.success){const c=a.results,y=[(n=c.events)!=null&&n.recovered?`이벤트 ${c.events.count}개`:null,(o=c.seats)!=null&&o.recovered?`좌석 ${c.seats.total}석`:((r=c.seats)==null?void 0:r.message)||null,(d=c.queue)!=null&&d.recovered?`대기열 (eligible=${c.queue.eligible}, standby=${c.queue.standby})`:((l=c.queue)==null?void 0:l.message)||null].filter(Boolean).join(" · ");J({title:"Redis 복구 완료",body:y||"복구할 데이터 없음",type:"success"}),Be(e)}else J({title:"Redis 복구 실패",body:a.message||"알 수 없는 오류"})}).catch(()=>J({title:"Redis 복구 요청 실패",body:"서버 연결을 확인해주세요."}))})}),()=>{clearInterval(t)}}},bt=400;function Qe(e,{title:t,unit:i="",height:a=120,maxPoints:n=40,formatValue:o}={}){const r=[],d=o||(f=>ye(f));e.innerHTML=`
    <div class="mchart">
      <div class="mchart__head">
        <span class="mchart__title">${t}</span>
        <b class="mchart__val num-mono" data-val>–</b>
      </div>
      <div class="mchart__body" data-body>
        <svg class="mchart__svg" viewBox="0 0 ${bt} ${a}" preserveAspectRatio="none" data-svg>
          <line x1="0" y1="${a-1}" x2="${bt}" y2="${a-1}" class="mchart__baseline" />
          <path data-area class="mchart__area"></path>
          <path data-line class="mchart__line"></path>
          <line data-crosshair class="mchart__crosshair" y1="0" y2="${a}" style="display:none" />
          <circle data-dot class="mchart__dot" r="3.5" style="display:none" />
        </svg>
        <div class="mchart__tooltip" data-tooltip style="display:none"></div>
      </div>
    </div>
  `;const l=e.querySelector("[data-svg]"),c=e.querySelector("[data-line]"),y=e.querySelector("[data-area]"),x=e.querySelector("[data-val]"),_=e.querySelector("[data-crosshair]"),u=e.querySelector("[data-dot]"),g=e.querySelector("[data-tooltip]");function m(){const f=Math.max(...r)*1.15||1,s=Math.min(0,Math.min(...r)),A=bt/(n-1),I=f-s||1;return r.map((C,O)=>[O*A,a-(C-s)/I*a])}function F(){if(r.length<2)return;const f=m();c.setAttribute("d",f.map((s,A)=>A===0?`M${s[0]},${s[1]}`:`L${s[0]},${s[1]}`).join(" ")),y.setAttribute("d",`${f.map((s,A)=>A===0?`M${s[0]},${s[1]}`:`L${s[0]},${s[1]}`).join(" ")} L${f[f.length-1][0]},${a} L0,${a} Z`),x.textContent=`${d(r[r.length-1])}${i}`}return l.addEventListener("mousemove",f=>{if(r.length<2)return;const s=l.getBoundingClientRect(),A=(f.clientX-s.left)/s.width,I=Math.max(0,Math.min(r.length-1,Math.round(A*(n-1))));if(I>=r.length)return;const C=m(),[O,L]=C[I];_.setAttribute("x1",O),_.setAttribute("x2",O),_.style.display="",u.setAttribute("cx",O),u.setAttribute("cy",L),u.style.display="",g.style.display="",g.style.left=`${O/bt*100}%`,g.textContent=`${d(r[I])}${i}`}),l.addEventListener("mouseleave",()=>{_.style.display="none",u.style.display="none",g.style.display="none"}),{push(f){r.push(f),r.length>n&&r.shift(),F()}}}function da(e,{title:t,items:i,unit:a=""}){const n=Math.max(1,...i.map(o=>o.value));e.innerHTML=`
    <div class="mchart">
      <div class="mchart__head"><span class="mchart__title">${t}</span></div>
      <div class="mbar-list">
        ${i.map(o=>`
          <div class="mbar-row" title="${o.label}: ${ye(o.value)}${a}">
            <span class="mbar-row__label">${o.label}</span>
            <span class="mbar-row__track"><span class="mbar-row__fill" style="width:${o.value/n*100}%;background:${o.color}"></span></span>
            <span class="mbar-row__val num-mono">${ye(o.value)}${a}</span>
          </div>`).join("")}
      </div>
    </div>
  `}const sa=["#3987e5","#d95926","#199e70","#c98500","#d55181","#008300","#9085e9","#e66767"],Ft=hi.slice(0,8),ra=Object.fromEntries(Ft.map((e,t)=>[e.id,sa[t%sa.length]])),ei=[{name:"backend-counter-6b7f7dd8d4-hfbkh",ready:"1/1",status:"Running"},{name:"backend-counter-6b7f7dd8d4-qz9pw",ready:"1/1",status:"Running"},{name:"redis-counter-master-0",ready:"1/1",status:"Running"},{name:"prometheus-kube-prometheus-prometheus-0",ready:"2/2",status:"Running"},{name:"prometheus-grafana-7c9d6f9b7-2k5xs",ready:"3/3",status:"Running"}];function la(e){const t=e.querySelector("[data-monitor-badge]");t&&fetch("/api/monitor/health").then(i=>i.json().then(a=>({ok:i.ok,body:a}))).then(({ok:i,body:a})=>{const n=i&&a.status==="UP";t.className=`badge ${n?"badge-green":"badge-red"}`,t.innerHTML=`<span class="status-dot ${n?"status-dot--up":"status-dot--down"}"></span>Prometheus ${n?"UP":"DOWN"}`}).catch(()=>{t.className="badge badge-red",t.innerHTML='<span class="status-dot status-dot--down"></span>연결 실패'})}const ns={render(e){if(!oi()){J({title:"접근 권한이 없습니다",body:Ce()?"모니터링 계정만 이용할 수 있는 페이지입니다.":"로그인이 필요한 페이지입니다."}),V("");return}Ft.forEach(s=>_i(s.id)),e.innerHTML=`
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
          <div class="mchart__head"><span class="mchart__title">Kubernetes Pods</span><span class="badge badge-gray">${ei.length}/${ei.length} Ready</span></div>
          <table class="pods-table">
            ${ei.map(s=>`
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
    `;const t=Qe(e.querySelector("[data-heap]"),{title:"JVM Heap Memory Used (jvm_memory_used_bytes)",unit:" MB"}),i=Qe(e.querySelector("[data-cpu]"),{title:"CPU Usage",unit:"%",formatValue:s=>s.toFixed(1)}),a=Qe(e.querySelector("[data-c-cpu]"),{title:"C파트 CPU Usage (process_cpu_seconds_total)",unit:"%",formatValue:s=>s.toFixed(1)}),n=Qe(e.querySelector("[data-c-mem]"),{title:"C파트 Memory (process_resident_memory_bytes)",unit:" MB"}),o=Qe(e.querySelector("[data-c-ws]"),{title:"WebSocket 활성 연결 수 (ws_active_connections)",unit:"개",formatValue:s=>s.toFixed(0)}),r=Qe(e.querySelector("[data-req]"),{title:"HTTP Request Rate",unit:" req/s",formatValue:s=>s.toFixed(1)});function d(s){const A={val:0},I=s.split(`
`);let C=0,O=d._prevHttpCount||0,L=d._prevTs||Date.now();for(const v of I)if(!(v.startsWith("#")||!v.trim())){if(v.startsWith("jvm_memory_used_bytes")&&v.includes('area="heap"')){const $=v.match(/\}\s+([\d.E+-]+)/);$&&(A.val+=parseFloat($[1]))}if(v.startsWith("process_cpu_usage ")&&(A.cpu=parseFloat(v.split(" ")[1])*100),v.startsWith("http_server_requests_seconds_count")){const $=v.match(/\}\s+([\d.E+-]+)/);$&&(C+=parseFloat($[1]))}}const S=Date.now(),E=(S-L)/1e3||15,b=Math.max(0,(C-O)/E);return d._prevHttpCount=C,d._prevTs=S,{heapMb:A.val/1024/1024,cpuPercent:A.cpu??0,reqPerSec:b}}function l(){fetch("/actuator/prometheus").then(s=>s.text()).then(s=>{const{heapMb:A,cpuPercent:I,reqPerSec:C}=d(s);t.push(A),i.push(I),r.push(C)}).catch(()=>{})}l();const c=setInterval(l,15e3);function y(){const s=['rate(process_cpu_seconds_total{job="realtime-ws"}[1m])*100','sum(process_resident_memory_bytes{job="realtime-ws"})','sum(ws_active_connections{job="realtime-ws"})'];Promise.all(s.map(A=>fetch(`/prom-api/api/v1/query?query=${encodeURIComponent(A)}`).then(I=>I.json()))).then(([A,I,C])=>{var b,v,$,M,B,p,k,h,D;const O=((b=A.data)==null?void 0:b.result)||[],L=O.reduce((R,H)=>R+parseFloat(H.value[1]),0)/(O.length||1),S=((B=(M=($=(v=I.data)==null?void 0:v.result)==null?void 0:$[0])==null?void 0:M.value)==null?void 0:B[1])||0,E=((D=(h=(k=(p=C.data)==null?void 0:p.result)==null?void 0:k[0])==null?void 0:h.value)==null?void 0:D[1])||0;a.push(L),n.push(parseFloat(S)/1024/1024),o.push(parseFloat(E))}).catch(()=>{})}y();const x=setInterval(y,15e3);function _(){da(e.querySelector("[data-viewers]"),{title:"Redis Counter — 콘서트별 실시간 시청자수",unit:"명",items:Ft.map(A=>({label:A.artist,value:_i(A.id).viewers,color:ra[A.id]})).sort((A,I)=>I.value-A.value)});const s=Ft.map(A=>{const I=pt(A.id);return{label:A.artist,value:I.VIP+I.R+I.S,color:ra[A.id]}}).filter(A=>A.value>0).sort((A,I)=>I.value-A.value);da(e.querySelector("[data-cancelpool]"),{title:"취소표 Pool 현황 (원자적 카운터 합계)",unit:"매",items:s.length?s:[{label:"데이터 없음",value:0,color:"var(--color-border)"}]})}_();const u=setInterval(_,3e3);la(e);const g=setInterval(()=>la(e),15e3);let m=0;const F=e.querySelector("[data-scrape]"),f=setInterval(()=>{m+=1,m>=15&&(m=0),F.textContent=m===0?"마지막 스크랩: 방금 전":`마지막 스크랩: ${m}초 전`},1e3);return()=>{clearInterval(c),clearInterval(x),clearInterval(u),clearInterval(g),clearInterval(f)}}},gt=["#B5121B","#C98500","#199E70","#3987E5","#8E44AD","#16A085","#D35400","#2C3E50","#E74C3C","#1ABC9C"],ds={render(e){if(!xt()){e.innerHTML='<div class="center-state"><div class="center-state__title">관리자 전용 페이지입니다</div></div>';return}e.innerHTML=`
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
    `;const t=e.querySelector("[data-canvas]"),i=t.getContext("2d"),a=e.querySelector("[data-canvas-wrap]"),n=e.querySelector("[data-guide]"),o=e.querySelector("[data-zone-list]"),r=e.querySelector("[data-output]"),d=e.querySelector("[data-file-input]"),l=e.querySelector("[data-img-info]");let c=null,y=[],x=[],_=0;const u=480;function g(){const E=a.getBoundingClientRect(),b=Math.floor(E.width);if(c){const v=c.naturalHeight/c.naturalWidth;let $=Math.floor(b*v);$>u&&($=u),t.width=b,t.height=$}else t.width=b,t.height=Math.min(Math.floor(b*.5),u);m()}function m(){i.clearRect(0,0,t.width,t.height),c?i.drawImage(c,0,0,t.width,t.height):(i.fillStyle="#222",i.fillRect(0,0,t.width,t.height),i.fillStyle="#555",i.font="16px sans-serif",i.textAlign="center",i.fillText("이미지를 불러오세요",t.width/2,t.height/2)),y.forEach((E,b)=>{F(E,b)}),x.forEach((E,b)=>{f(E.x,E.y,"#FFD600",b+1)})}function F(E,b){const v=gt[b%gt.length],$=E.corners,M=s($[0],$[1],$[2]);i.beginPath(),i.moveTo($[0].x,$[0].y),i.lineTo($[1].x,$[1].y),i.lineTo(M.x,M.y),i.lineTo($[2].x,$[2].y),i.closePath(),i.fillStyle=v+"33",i.fill(),i.strokeStyle=v,i.lineWidth=2,i.stroke(),$.forEach((k,h)=>f(k.x,k.y,v,h+1)),f(M.x,M.y,v,4),E.seats&&E.seats.forEach(k=>{i.beginPath(),i.arc(k.x,k.y,3,0,Math.PI*2),i.fillStyle=v+"AA",i.fill()});const B=($[0].x+$[1].x+$[2].x+M.x)/4,p=($[0].y+$[1].y+$[2].y+M.y)/4;i.fillStyle="#fff",i.font="bold 14px sans-serif",i.textAlign="center",i.textBaseline="middle",i.strokeStyle="#000",i.lineWidth=3,i.strokeText(E.name,B,p),i.fillText(E.name,B,p)}function f(E,b,v,$){i.beginPath(),i.arc(E,b,8,0,Math.PI*2),i.fillStyle=v,i.fill(),i.strokeStyle="#fff",i.lineWidth=2,i.stroke(),i.fillStyle="#fff",i.font="bold 10px sans-serif",i.textAlign="center",i.textBaseline="middle",i.fillText(String($),E,b)}function s(E,b,v){return{x:v.x+(b.x-E.x),y:v.y+(b.y-E.y)}}function A(E,b,v){const[$,M,B]=E,p=s($,M,B),k=[];for(let h=0;h<b;h++){const D=b>1?h/(b-1):0,R=$.x+(B.x-$.x)*D,H=$.y+(B.y-$.y)*D,X=M.x+(p.x-M.x)*D,G=M.y+(p.y-M.y)*D;for(let K=0;K<v;K++){const de=v>1?K/(v-1):0;k.push({row:h+1,col:K+1,x:Math.round(R+(X-R)*de),y:Math.round(H+(G-H)*de)})}}return k}function I(E){const b=t.getBoundingClientRect();return{x:Math.round((E.clientX-b.left)*(t.width/b.width)),y:Math.round((E.clientY-b.top)*(t.height/b.height))}}function C(){if(!c){n.textContent="이미지를 먼저 불러오세요";return}if(_===0){n.textContent="캔버스를 클릭하여 구역 정의를 시작하세요 (좌측 상단 → 우측 상단 → 좌측 하단 순서로 3점 클릭)";return}const E=["① 좌측 상단","② 우측 상단","③ 좌측 하단"],b=x.length;b<3&&(n.textContent=`${E[b]}을 클릭하세요 (${b}/3)`)}function O(){const E=document.createElement("div");E.className="mapper-modal-overlay",E.innerHTML=`
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
      `,document.body.appendChild(E),E.querySelector("[data-m-cancel]").addEventListener("click",()=>{x=[],_=0,C(),m(),E.remove()}),E.querySelector("[data-m-ok]").addEventListener("click",()=>{const b=E.querySelector("[data-m-name]").value.trim()||`구역 ${y.length+1}`,v=E.querySelector("[data-m-grade]").value,$=parseInt(E.querySelector("[data-m-rows]").value)||10,M=parseInt(E.querySelector("[data-m-cols]").value)||12,B=A(x,$,M);y.push({name:b,grade:v,rows:$,cols:M,corners:[...x],seats:B}),x=[],_=0,C(),L(),m(),E.remove()})}t.addEventListener("click",E=>{if(c&&(_===0&&(_=1),_===1)){const b=I(E);x.push(b),m(),C(),x.length===3&&O()}});function L(){if(y.length===0){o.innerHTML='<li style="color:var(--color-text-secondary);font-size:13px;">아직 정의된 구역이 없습니다.</li>';return}o.innerHTML=y.map((E,b)=>`
        <li class="zone-item" style="border-left: 4px solid ${gt[b%gt.length]};">
          <div class="zone-item__head">
            <span class="zone-item__name">${E.name} (${E.grade})</span>
            <div class="zone-item__actions">
              <button class="zone-item__btn zone-item__btn--del" data-del="${b}">삭제</button>
            </div>
          </div>
          <div class="zone-item__info">${E.rows}행 × ${E.cols}열 = ${E.rows*E.cols}석 | 꼭짓점: (${E.corners.map(v=>`${v.x},${v.y}`).join(") (")})</div>
        </li>
      `).join(""),o.querySelectorAll("[data-del]").forEach(E=>{E.addEventListener("click",()=>{const b=parseInt(E.dataset.del);y.splice(b,1),L(),m()})})}function S(){const E=y.map(b=>({name:b.name,grade:b.grade,rows:b.rows,cols:b.cols,totalSeats:b.rows*b.cols,corners:b.corners,fourthPoint:s(b.corners[0],b.corners[1],b.corners[2]),seats:b.seats.map(v=>({id:`${b.grade}-${v.row}-${v.col}`,row:v.row,col:v.col,x:v.x,y:v.y,grade:b.grade,section:b.name}))}));return JSON.stringify(E,null,2)}return e.querySelector("[data-export]").addEventListener("click",()=>{if(y.length===0)return;const E=S();r.textContent=E,r.style.display="block"}),e.querySelector("[data-copy]").addEventListener("click",()=>{if(y.length===0)return;const E=S();navigator.clipboard.writeText(E).then(()=>{const b=e.querySelector("[data-copy]");b.textContent="복사 완료!",setTimeout(()=>b.textContent="클립보드 복사",1500)})}),e.querySelector("[data-clear]").addEventListener("click",()=>{y=[],x=[],_=0,C(),L(),m(),r.style.display="none"}),d.addEventListener("change",E=>{const b=E.target.files[0];if(!b)return;const v=new FileReader;v.onload=$=>{const M=new Image;M.onload=()=>{c=M,l.textContent=`${M.naturalWidth} × ${M.naturalHeight}px`,g(),C()},M.src=$.target.result},v.readAsDataURL(b)}),window.addEventListener("resize",g),g(),C(),L(),()=>{window.removeEventListener("resize",g)}}},ca={VIP:"#B5121B",R:"#C98500",S:"#199E70",A:"#3987E5"},ss={VIP:"VIP (Floor)",R:"R석",S:"S석",A:"A석"},ya=3.2,rs=.6,xa=8,ls=.0012,cs=6;function ys(e,t={}){const{onSelect:i=()=>{},gradeFilter:a=null}=t,n=document.createElement("canvas");n.style.cssText="display:block;width:100%;border-radius:8px;cursor:grab;touch-action:none;",e.appendChild(n);const o=n.getContext("2d"),r=[],d=[];Te.zones.forEach(S=>{const E=ca[S.grade]||"#888",b={id:S.id,name:S.name,grade:S.grade,floor:S.floor,color:E,cx:0,cy:0};S.seats.forEach(M=>{r.push({id:M.id,zoneId:S.id,grade:S.grade,rawX:M.x,rawY:1e3-M.y,color:E,status:"available"})});const v=S.seats.map(M=>M.x),$=S.seats.map(M=>1e3-M.y);b.cx=v.reduce((M,B)=>M+B,0)/v.length,b.cy=$.reduce((M,B)=>M+B,0)/$.length,d.push(b)}),a&&r.forEach(S=>{S.grade!==a&&(S.status="sold")});let l=1,c=0,y=0,x=!1,_=0,u=0,g=0,m=0,F=!1,f=null,s=null;function A(){const S=e.getBoundingClientRect(),E=window.devicePixelRatio||1;n.width=S.width*E,n.height=Math.min(S.width*.75,600)*E,n.style.height=`${n.height/E}px`,o.setTransform(E,0,0,E,0,0),C()}function I(S,E){const b=n.width/(window.devicePixelRatio||1),v=n.height/(window.devicePixelRatio||1),$=Math.min(b,v)/1e3*l,M=b/2+c,B=v/2+y;return{x:M+(S-500)*$,y:B+(E-500)*$}}function C(){const S=n.width/(window.devicePixelRatio||1),E=n.height/(window.devicePixelRatio||1);o.clearRect(0,0,S,E),o.fillStyle="#111",o.fillRect(0,0,S,E);const b=Math.max(1.5,ya*l),v=I(350,-15),$=I(650,25);o.fillStyle="#e74c3c",o.beginPath(),o.roundRect(v.x,v.y,$.x-v.x,$.y-v.y,4),o.fill(),o.fillStyle="#fff",o.font=`bold ${Math.max(8,12*l)}px sans-serif`,o.textAlign="center",o.textBaseline="middle";const M=I(500,5);o.fillText("STAGE",M.x,M.y),r.forEach(k=>{const h=I(k.rawX,k.rawY);if(h.x<-10||h.x>S+10||h.y<-10||h.y>E+10)return;let D;k.id===f?D="#7C4DFF":k.status==="sold"?D="#333":k.status==="holding"?D="#666":D=k.color,o.beginPath(),o.arc(h.x,h.y,b,0,Math.PI*2),o.fillStyle=D,o.fill(),k.id===s&&k.status==="available"&&(o.strokeStyle="#fff",o.lineWidth=1.5,o.stroke()),k.id===f&&(o.strokeStyle="#fff",o.lineWidth=2,o.stroke())}),l<3&&(o.font=`bold ${Math.max(7,9*l)}px sans-serif`,o.textAlign="center",o.textBaseline="middle",d.forEach(k=>{const h=I(k.cx,k.cy);o.strokeStyle="#000",o.lineWidth=2.5,o.strokeText(k.id,h.x,h.y),o.fillStyle="#fff",o.fillText(k.id,h.x,h.y)}));const B=10;let p=E-80;o.font="bold 11px sans-serif",Object.entries(ca).forEach(([k,h])=>{o.fillStyle=h,o.beginPath(),o.arc(B+6,p+6,5,0,Math.PI*2),o.fill(),o.fillStyle="#ccc",o.textAlign="left",o.textBaseline="middle",o.fillText(ss[k]||k,B+16,p+6),p+=18})}function O(S,E){n.width/(window.devicePixelRatio||1),n.height/(window.devicePixelRatio||1);const b=Math.max(cs,ya*l+3);let v=null,$=1/0;return r.forEach(M=>{if(M.status!=="available"&&M.id!==f)return;const B=I(M.rawX,M.rawY),p=B.x-S,k=B.y-E,h=Math.sqrt(p*p+k*k);h<b&&h<$&&(v=M,$=h)}),v}function L(S){const E=n.getBoundingClientRect();return{x:S.clientX-E.left,y:S.clientY-E.top}}return n.addEventListener("wheel",S=>{S.preventDefault();const E=-S.deltaY*ls,b=Math.max(rs,Math.min(xa,l*(1+E))),v=L(S),$=n.width/(window.devicePixelRatio||1),M=n.height/(window.devicePixelRatio||1),B=v.x-$/2-c,p=v.y-M/2-y,k=b/l;c-=B*(k-1),y-=p*(k-1),l=b,C()},{passive:!1}),n.addEventListener("pointerdown",S=>{x=!0,F=!1,_=S.clientX,u=S.clientY,g=c,m=y,n.setPointerCapture(S.pointerId),n.style.cursor="grabbing"}),n.addEventListener("pointermove",S=>{if(x){const E=S.clientX-_,b=S.clientY-u;(Math.abs(E)>3||Math.abs(b)>3)&&(F=!0),c=g+E,y=m+b,C()}else{const E=L(S),b=O(E.x,E.y),v=b?b.id:null;v!==s&&(s=v,n.style.cursor=s?"pointer":"grab",C())}}),n.addEventListener("pointerup",S=>{if(x=!1,n.style.cursor=s?"pointer":"grab",!F){const E=L(S),b=O(E.x,E.y);b&&(f===b.id?(f=null,i(null)):(f=b.id,i(b)),C())}}),window.addEventListener("resize",A),A(),{getSeats:()=>r,getSelected:()=>r.find(S=>S.id===f),setStatus(S,E){const b=r.find(v=>v.id===S);b&&(b.status=E,C())},batchSetStatus(S,E){S.forEach(b=>{const v=r.find($=>$.id===b);v&&(v.status=E)}),C()},clearSelection(){f=null,C()},stats(){let S=0,E=0,b=0,v=0;const $={};return r.forEach(M=>{$[M.grade]=$[M.grade]||{total:0,available:0},$[M.grade].total++,M.status==="available"?(S++,$[M.grade].available++):M.status==="sold"?E++:M.status==="holding"?b++:M.status==="mine"&&v++}),{total:r.length,available:S,sold:E,holding:b,mine:v,byGrade:$}},destroy(){window.removeEventListener("resize",A)},zoomToZone(S){if(!d.find(de=>de.id===S))return;const b=r.filter(de=>de.zoneId===S),v=b.map(de=>de.rawX),$=b.map(de=>de.rawY),M=Math.min(...v),B=Math.max(...v),p=Math.min(...$),k=Math.max(...$),h=B-M+60,D=k-p+60,R=n.width/(window.devicePixelRatio||1),H=n.height/(window.devicePixelRatio||1),X=Math.min(R,H)/1e3;l=Math.min(xa,Math.min(R/(h*X),H/(D*X)));const G=(M+B)/2,K=(p+k)/2;c=-(G-500)*X*l,y=-(K-500)*X*l,C()},resetView(){l=1,c=0,y=0,C()}}}const ua={VIP:"#B5121B",R:"#C98500",S:"#199E70",A:"#3987E5"},pa={VIP:"VIP (Floor)",R:"R석",S:"S석",A:"A석"},xs={render(e){if(!xt()){e.innerHTML='<div class="center-state"><div class="center-state__title">관리자 전용 페이지입니다</div></div>';return}const t=Te.zones.reduce((o,r)=>o+r.seats.length,0),i={};Te.zones.forEach(o=>{i[o.grade]=(i[o.grade]||0)+o.seats.length}),e.innerHTML=`
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
        <div class="oh-sub">총 ${t.toLocaleString()}석 · ${Te.zones.length}개 구역</div>
        <div class="oh-stats">
          ${Object.entries(i).map(([o,r])=>`
            <div class="oh-stat">
              <div class="oh-stat__dot" style="background:${ua[o]}"></div>
              <span class="oh-stat__label">${pa[o]}</span>
              <span class="oh-stat__num">${r}</span>
            </div>
          `).join("")}
        </div>
        <div class="oh-map-wrap" data-map></div>
        <div class="oh-zones">
          <button class="oh-zone-btn" data-reset>전체 보기</button>
          ${Te.zones.map(o=>`
            <button class="oh-zone-btn" data-zone="${o.id}" style="border-color:${ua[o.grade]}55">${o.id}</button>
          `).join("")}
        </div>
        <div class="oh-info" data-info>좌석을 클릭하면 정보가 표시됩니다</div>
      </div>
    `;const a=e.querySelector("[data-info]"),n=ys(e.querySelector("[data-map]"),{onSelect(o){if(o){const r=Te.zones.find(d=>d.id===o.zoneId);a.textContent=`${o.id} | ${r==null?void 0:r.name} | ${pa[o.grade]} | 좌표: (${o.rawX.toFixed(0)}, ${o.rawY.toFixed(0)})`}else a.textContent="좌석을 클릭하면 정보가 표시됩니다"}});return e.querySelector("[data-reset]").addEventListener("click",()=>n.resetView()),e.querySelectorAll("[data-zone]").forEach(o=>{o.addEventListener("click",()=>n.zoomToZone(o.dataset.zone))}),()=>n.destroy()}};ge(/^$/,Yo);ge(/^concerts$/,Jo);ge(/^concert\/(?<id>[\w-]+)$/,jn);ge(/^booking\/(?<id>[\w-]+)$/,{render(e,t){V(`concert/${t.id}`)}});ge(/^queue\/(?<id>[\w-]+)$/,Vn);ge(/^zones\/(?<id>[\w-]+)$/,ed);ge(/^seats\/(?<id>[\w-]+)\/(?<zoneId>[\w-]+)$/,md);ge(/^payment\/(?<type>regular|cancel)$/,Ed);ge(/^complete\/(?<id>[\w-]+)$/,Ad);ge(/^cancel-queue\/(?<id>[\w-]+)$/,Sd);ge(/^membership$/,_d);ge(/^membership-checkout\/(?<plan>monthly|yearly)$/,kd);ge(/^private-link\/(?<id>[\w-]+)$/,$d);ge(/^cancel-seats\/(?<id>[\w-]+)$/,wd);ge(/^mypage(?:\/(?<section>[\w-]+))?$/,Md);ge(/^login$/,Od);ge(/^signup$/,Pd);ge(/^signup-complete$/,qd);ge(/^admin$/,os);ge(/^monitoring$/,ns);ge(/^seat-mapper$/,ds);ge(/^olympic-hall$/,xs);const ma=/^(queue|zones|seats)\//;let ht=!1;function va(e){e.preventDefault(),e.returnValue=""}document.addEventListener("DOMContentLoaded",()=>{Ao(document.getElementById("site-header")),_o(document.getElementById("site-footer")),La(document.getElementById("toast-root")),document.body.classList.toggle("admin-dark",xt()||oi()),mt(()=>document.body.classList.toggle("admin-dark",xt()||oi()));const e=(location.hash||"#/").replace(/^#\/?/,"");ma.test(e)&&(ut(),At(),sessionStorage.removeItem("booking_step"),history.replaceState(null,"","#/")),document.addEventListener("click",Rt),document.addEventListener("keydown",Rt),Xa(document.getElementById("app-page"),{onChange:t=>{Rt(),So(t),ma.test(t)?(sessionStorage.setItem("booking_step",t.split("/")[0]),ht||(window.addEventListener("beforeunload",va),ht=!0)):(sessionStorage.removeItem("booking_step"),ht&&(window.removeEventListener("beforeunload",va),ht=!1))}})});
