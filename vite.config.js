// Vite 개발 서버 설정 — 프록시를 통해 프론트(5173)에서 백엔드 서버로 API 요청을 투명하게 전달.
// 빌드 결과물은 dist/ 폴더에 생성되며 nginx가 서빙한다.

import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '0.0.0.0', // 모든 네트워크 인터페이스에서 접근 허용 (LAN 내 다른 기기 테스트 용)
    port: 5173,
    proxy: {
      // 실시간 서버 (쿠버네티스 NodePort 30081) — WebSocket 채팅·좌석 상태, 채팅방 관리, 좌석 이벤트 발행, 헬스체크
      '/ws':      { target: 'ws://192.168.0.192:30081',  ws: true, changeOrigin: true },
      '/rooms':   { target: 'http://192.168.0.192:30081', changeOrigin: true },
      '/publish': { target: 'http://192.168.0.192:30081', changeOrigin: true },
      '/healthz': { target: 'http://192.168.0.192:30081', changeOrigin: true },
      '/metrics': { target: 'http://192.168.0.192:30081', changeOrigin: true },

      // API 서버 (쿠버네티스 NodePort 30090) — 공연 목록·인증·대기열·좌석·예매·SSE 등 주요 비즈니스 로직
      // 찬규님 파트가 K8s로 이전되면서 단독 VM(192.168.0.190:2000) 대신 클러스터 마스터 노드 IP + NodePort로 접근
      '/events':       { target: 'http://192.168.0.192:30090', changeOrigin: true },
      '/auth':         { target: 'http://192.168.0.192:30090', changeOrigin: true },
      '/queue':        { target: 'http://192.168.0.192:30090', changeOrigin: true },
      '/seats':        { target: 'http://192.168.0.192:30090', changeOrigin: true },
      '/event':        { target: 'http://192.168.0.192:30090', changeOrigin: true },
      '/admin':        { target: 'http://192.168.0.192:30090', changeOrigin: true },
      '/sse':          { target: 'http://192.168.0.192:30090', changeOrigin: true },
      '/reservations': { target: 'http://192.168.0.192:30090', changeOrigin: true },
      // 위시리스트/멤버십은 A파트에 이미 완전한 API(add/remove/subscribe/cancel)가 있어
      // B파트(건아)의 중복 조회 API 대신 A파트로 연결 — B에는 add/remove가 없어 하트 토글이 깨져있었음
      '/membership': { target: 'http://192.168.0.192:30090', changeOrigin: true },
      '/wishlist':   { target: 'http://192.168.0.192:30090', changeOrigin: true },

      // D파트 — 모니터링/카운터 (쿠버네티스 NodePort 30083, 예지 파트)
      '/actuator': { target: 'http://192.168.0.192:30083', changeOrigin: true },
      // D파트에 별도 /api/monitor/health 엔드포인트가 없어 Spring Boot 표준 /actuator/health로 리라이트
      '/api/monitor': {
        target: 'http://192.168.0.192:30083',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/monitor\/health/, '/actuator/health'),
      },

      // Prometheus API (쿠버네티스 NodePort 30092) — Grafana/admin.js에서 메트릭 쿼리용
      '/prom-api': {
        target: 'http://192.168.0.192:30092',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/prom-api/, ''),
      },

      // B파트 — 재판매 대기열 전용 (쿠버네티스 NodePort 30082, 건아 파트)
      '/api':      { target: 'http://192.168.0.192:30082', changeOrigin: true },
    }
  }
})
