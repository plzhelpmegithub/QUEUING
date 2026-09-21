// 현재 페이지의 프로토콜에 맞는 실시간 WebSocket URL 생성 유틸리티.
// 개발(HTTP): ws://host
// 운영(HTTPS): wss://host

export function getRealtimeWebSocketBaseUrl() {
  const currentLocation = globalThis.location;

  if (!currentLocation?.host) {
    throw new Error('브라우저 location을 확인할 수 없어 WebSocket URL을 만들 수 없습니다.');
  }

  const protocol = currentLocation.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${currentLocation.host}`;
}

export function createRealtimeWebSocketUrl(path, query = {}) {
  const url = new URL(path, getRealtimeWebSocketBaseUrl());

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}
