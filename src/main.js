// QUEUING 앱 진입점 — 라우트 등록, 공통 레이아웃(헤더/푸터/토스트) 마운트,
// 예매 흐름(대기열·구역·좌석) 진입 시 새로고침 방지(beforeunload)와 세션 갱신(touchSession)을 담당.
import { registerRoute, initRouter } from './router.js';
import { mountHeader, setHeaderActivePath } from './components/header.js';
import { mountFooter } from './components/footer.js';
import { mountToastRoot } from './components/toast.js';

import { homePage } from './pages/home.js';
import { concertsListPage } from './pages/concertsList.js';
import { concertDetailPage } from './pages/concertDetail.js';
import { navigate as nav } from './router.js';
import { queuePage } from './pages/queue.js';
import { zoneSelectPage } from './pages/zoneSelect.js';
import { seatSelectPage } from './pages/seatSelect.js';
import { paymentPage } from './pages/payment.js';
import { bookingCompletePage } from './pages/bookingComplete.js';
import { cancelQueuePage } from './pages/cancelQueue.js';
import { membershipPage } from './pages/membership.js';
import { membershipCheckoutPage } from './pages/membershipCheckout.js';
import { privateLinkPage } from './pages/privateLink.js';
import { cancelSeatSelectPage } from './pages/cancelSeatSelect.js';
import { myPage } from './pages/mypage.js';
import { loginPage } from './pages/login.js';
import { signupPage } from './pages/signup.js';
import { signupCompletePage } from './pages/signupComplete.js';
import { adminPage } from './pages/admin.js';
import { subscribe, isAdmin, clearSeatSelectTimer, clearCurrentOrder, touchSession } from './state/store.js';

registerRoute(/^$/, homePage);
registerRoute(/^concerts$/, concertsListPage);
registerRoute(/^concert\/(?<id>[\w-]+)$/, concertDetailPage);
registerRoute(/^booking\/(?<id>[\w-]+)$/, { render(_, p) { nav(`concert/${p.id}`); } });
registerRoute(/^queue\/(?<id>[\w-]+)$/, queuePage);
registerRoute(/^zones\/(?<id>[\w-]+)$/, zoneSelectPage);
registerRoute(/^seats\/(?<id>[\w-]+)\/(?<zoneId>[\w-]+)$/, seatSelectPage);
registerRoute(/^payment\/(?<type>regular|cancel)$/, paymentPage);
registerRoute(/^complete\/(?<id>[\w-]+)$/, bookingCompletePage);
registerRoute(/^cancel-queue\/(?<id>[\w-]+)$/, cancelQueuePage);
registerRoute(/^membership$/, membershipPage);
registerRoute(/^membership-checkout\/(?<plan>monthly|yearly)$/, membershipCheckoutPage);
registerRoute(/^private-link\/(?<id>[\w-]+)$/, privateLinkPage);
registerRoute(/^cancel-seats\/(?<id>[\w-]+)$/, cancelSeatSelectPage);
registerRoute(/^mypage(?:\/(?<section>[\w-]+))?$/, myPage);
registerRoute(/^login$/, loginPage);
registerRoute(/^signup$/, signupPage);
registerRoute(/^signup-complete$/, signupCompletePage);
registerRoute(/^admin$/, adminPage);

const BOOKING_GUARD_RE = /^(queue|zones|seats)\//;
let beforeUnloadBound = false;

function handleBeforeUnload(e) {
  e.preventDefault();
  e.returnValue = '';
}

document.addEventListener('DOMContentLoaded', () => {
  mountHeader(document.getElementById('site-header'));
  mountFooter(document.getElementById('site-footer'));
  mountToastRoot(document.getElementById('toast-root'));

  document.body.classList.toggle('admin-dark', isAdmin());
  subscribe(() => document.body.classList.toggle('admin-dark', isAdmin()));

  const rawHash = (location.hash || '#/').replace(/^#\/?/, '');
  if (BOOKING_GUARD_RE.test(rawHash)) {
    clearSeatSelectTimer();
    clearCurrentOrder();
    sessionStorage.removeItem('booking_step');
    history.replaceState(null, '', '#/');
  }

  document.addEventListener('click', touchSession);
  document.addEventListener('keydown', touchSession);

  initRouter(document.getElementById('app-page'), {
    onChange: (path) => {
      touchSession();
      setHeaderActivePath(path);

      if (BOOKING_GUARD_RE.test(path)) {
        sessionStorage.setItem('booking_step', path.split('/')[0]);
        if (!beforeUnloadBound) {
          window.addEventListener('beforeunload', handleBeforeUnload);
          beforeUnloadBound = true;
        }
      } else {
        sessionStorage.removeItem('booking_step');
        if (beforeUnloadBound) {
          window.removeEventListener('beforeunload', handleBeforeUnload);
          beforeUnloadBound = false;
        }
      }
    },
  });
});
