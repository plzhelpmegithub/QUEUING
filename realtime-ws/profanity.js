// 채팅 욕설/비하 발언 필터링
// ⚠️ 아래 목록은 예시입니다. 실제 서비스 기준에 맞게 단어를 추가/보완해서 쓰세요.
const BANNED_WORDS = [
  // 대표 강한 욕설
  '씨발', '시발', '씨팔', '개새끼', '개새', '병신', '좆같', '좆까', '지랄', '염병', '옘병', '미친년', '미친놈', '닥쳐', '꺼져',
  
  // 초성 및 변형 / 숫자
  'ㅅㅂ', 'ㅆㅂ', 'ㅂㅅ', 'ㅄ', 'ㅈㄹ', 'ㄷㅊ', 'ㅈㄴ', 'ㅈ까', 'ㄲㅈ', 'ㅗ', '18놈', '18년', '십팔', '십새끼',
  
  // 패드립 및 비하 표현
  '느금마', '느금', '느애미', '애미', '애비', '엠창', '애자', '틀딱', '한남', '한녀', '개독',
  
  // 단일 문자 및 기타
  '좆', '씹', '엿'
  , '개좆같네', 'ㅅㅂ', 'ㅆㅂ', '좆', '새끼', 'ㅄㅅㄲ'
];

function filterMessage(text) {
  let filtered = text;
  let matched = false;
  for (const word of BANNED_WORDS) {
    if (filtered.includes(word)) {
      matched = true;
      filtered = filtered.split(word).join('*'.repeat(word.length));
    }
  }
  return { filtered, matched };
}

module.exports = { filterMessage };