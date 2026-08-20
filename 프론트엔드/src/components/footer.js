export function mountFooter(el) {
  el.innerHTML = `
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
  `;
}
