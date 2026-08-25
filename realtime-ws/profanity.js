// filter.js

// 욕설 및 비하 발언 목록
const BANNED_WORDS = [
  // 대표 강한 욕설
  '씨발', '시발', '씨팔', '개새끼', '개새', '병신', '좆같', '좆까', '지랄', '염병', '옘병', '미친년', '미친놈', '닥쳐', '꺼져',
  
  // 초성 및 변형 / 숫자
  'ㅅㅂ', 'ㅆㅂ', 'ㅂㅅ', 'ㅄ', 'ㅈㄹ', 'ㄷㅊ', 'ㅈㄴ', 'ㅈ까', 'ㄲㅈ', 'ㅗ', '18놈', '18년', '십팔', '십새끼',
  
  // 패드립 및 비하 표현
  '느금마', '느금', '느애미', '애미', '애비', '엠창', '애자', '틀딱', '한남', '한녀', '개독',
  
  // 단일 문자 및 기타
  '좆', '씹', '엿'
];

/**
 * 메시지 내 욕설/비하 표현 필터링
 * @param {string} text - 원본 메시지
 * @returns {{ filtered: string, matched: boolean }}
 */
function filterMessage(text) {
  if (!text || typeof text !== 'string') {
    return { filtered: text, matched: false };
  }

  let filtered = text;
  let matched = false;

  // 공백 및 특수문자 제거 후 검사용 텍스트 생성 (우회 방지)
  const cleanText = text.replace(/[\s~!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g, '');

  for (const word of BANNED_WORDS) {
    if (cleanText.includes(word) || filtered.includes(word)) {
      matched = true;

      // 글자 사이에 공백/특수문자가 들어간 패턴(예: '씨.발', '씨 발')까지 감지해 치환
      const pattern = word.split('').join('[\\s~!@#$%^&*()_+\\-=\\[\\]{};\':"\\\\|,.<>\\/?]*');
      const regex = new RegExp(pattern, 'gi');

      filtered = filtered.replace(regex, '*'.repeat(word.length));
    }
  }

  return { filtered, matched };
}

module.exports = { filterMessage, BANNED_WORDS };