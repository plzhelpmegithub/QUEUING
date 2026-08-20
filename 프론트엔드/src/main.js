import { registerRoute, initRouter } from './router.js';
import { mountHeader, setHeaderActivePath } from './components/header.js';
import { mountFooter } from './components/footer.js';
import { mountToastRoot } from './components/toast.js';

import { homePage } from './pages/home.js';
import { concertsListPage } from './pages/concertsList.js';
import { concertDetailPage } from './pages/concertDetail.js';
import { queuePage } from './pages/queue.js';
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
import { adminPage } from './pages/admin.js';
import { subscribe, isAdmin } from './state/store.js';

registerRoute(/^$/, homePage);
registerRoute(/^concerts$/, concertsListPage);
registerRoute(/^concert\/(?<id>[\w-]+)$/, concertDetailPage);
registerRoute(/^queue\/(?<id>[\w-]+)$/, queuePage);
registerRoute(/^seats\/(?<id>[\w-]+)$/, seatSelectPage);
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
registerRoute(/^admin$/, adminPage);

document.addEventListener('DOMContentLoaded', () => {
  mountHeader(document.getElementById('site-header'));
  mountFooter(document.getElementById('site-footer'));
  mountToastRoot(document.getElementById('toast-root'));

  document.body.classList.toggle('admin-dark', isAdmin());
  subscribe(() => document.body.classList.toggle('admin-dark', isAdmin()));

  initRouter(document.getElementById('app-page'), {
    onChange: (path) => setHeaderActivePath(path),
  });
});
