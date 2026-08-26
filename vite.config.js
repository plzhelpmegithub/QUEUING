// Vite 개발 서버 설정 — 프록시를 통해 프론트(5173)에서 백엔드 서버로 API 요청을 투명하게 전달.
// 빌드 결과물은 dist/ 폴더에 생성되며 nginx가 서빙한다.

import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '0.0.0.0', // 모든 네트워크 인터페이스에서 접근 허용 (LAN 내 다른 기기 테스트 용)
    port: 5173,
    proxy: {
      // 실시간 서버 (192.168.0.220) — WebSocket 채팅·좌석 상태, 채팅방 관리, 좌석 이벤트 발행, 헬스체크
      '/ws':      { target: 'ws://192.168.0.220',  ws: true, changeOrigin: true },
      '/rooms':   { target: 'http://192.168.0.220', changeOrigin: true },
      '/publish': { target: 'http://192.168.0.220', changeOrigin: true },
      '/healthz': { target: 'http://192.168.0.220', changeOrigin: true },

      // API 서버 (192.168.0.190:3000) — 공연 목록·인증·대기열·좌석·예매·SSE 등 주요 비즈니스 로직
      '/events':       { target: 'http://192.168.0.190:2000', changeOrigin: true },
      '/auth':         { target: 'http://192.168.0.190:2000', changeOrigin: true },
      '/queue':        { target: 'http://192.168.0.190:2000', changeOrigin: true },
      '/seats':        { target: 'http://192.168.0.190:2000', changeOrigin: true },
      '/event':        { target: 'http://192.168.0.190:2000', changeOrigin: true },
      '/admin':        { target: 'http://192.168.0.190:2000', changeOrigin: true },
      '/sse':          { target: 'http://192.168.0.190:2000', changeOrigin: true },
      '/reservations': { target: 'http://192.168.0.190:2000', changeOrigin: true },

      // 멤버십·위시리스트 서버 (192.168.0.193:8080) — Spring Boot 기반
      '/api':      { target: 'http://192.168.0.193:8080', changeOrigin: true },
      '/actuator': { target: 'http://192.168.0.193:8080', changeOrigin: true },
      '/membership': { target: 'http://192.168.0.193:8080', changeOrigin: true },
      '/wishlist':   { target: 'http://192.168.0.193:8080', changeOrigin: true },
    }
  }
})
