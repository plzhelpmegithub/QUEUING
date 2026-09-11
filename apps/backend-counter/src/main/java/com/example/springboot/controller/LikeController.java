package com.example.springboot.controller;

import com.example.springboot.repository.WishlistRepository;
import io.micrometer.core.instrument.Counter;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.Map;

/**
 * 좋아요 API - 멱등키(Idempotency-Key) + 영속 계층 이중 방어
 *
 * 방어가 두 겹인 이유:
 *  1) 멱등키(Redis SETNX, TTL 10분)
 *     - 짧은 시간에 몰리는 중복 요청(네트워크 재시도, 따닥 클릭)을 원자적으로 차단
 *     - 단, TTL이 지나면 키가 사라지므로 10분 뒤 같은 요청은 통과한다
 *  2) wishlists 테이블의 UNIQUE(user_id, event_id)
 *     - 시간과 무관하게 "한 사용자는 한 이벤트에 한 번만"을 영구 보장
 *     - 여러 pod가 동시에 INSERT해도 DB가 하나만 남긴다
 *
 * 저장소 역할 분담:
 *  - MariaDB wishlists : 진실의 원본. 사라지면 안 되는 데이터
 *  - Redis 카운터      : 화면에 즉시 보여줄 빠른 집계. 사라져도 DB에서 복구 가능
 */
@RestController
@RequestMapping("/api")
public class LikeController {

    /** 멱등키 유효시간. 짧은 구간의 중복 요청만 막는 용도이므로 길게 잡지 않는다. */
    private static final Duration IDEMPOTENCY_TTL = Duration.ofMinutes(10);

    private final StringRedisTemplate redisTemplate;
    private final Counter idempotencyBlockedCounter;
    private final WishlistRepository wishlistRepository;

    public LikeController(StringRedisTemplate redisTemplate,
                          Counter idempotencyBlockedCounter,
                          WishlistRepository wishlistRepository) {
        this.redisTemplate = redisTemplate;
        this.idempotencyBlockedCounter = idempotencyBlockedCounter;
        this.wishlistRepository = wishlistRepository;
    }

    /** 이벤트별 좋아요 카운터의 Redis 키 */
    private String likeKey(String eventId) {
        return "event:" + eventId + ":likes";
    }

    @PostMapping("/like")
    public ResponseEntity<Map<String, Object>> like(
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @RequestParam String eventId,
            @RequestParam String userId) {

        String key = idempotencyKey != null
                ? "idemp:like:" + idempotencyKey
                : "idemp:like:" + eventId + ":" + userId;

        // --- 1단계: 멱등키 선점 (SETNX) ---
        Boolean isFirstRequest = redisTemplate.opsForValue()
                .setIfAbsent(key, "PROCESSED", IDEMPOTENCY_TTL);

        if (Boolean.FALSE.equals(isFirstRequest)) {
            idempotencyBlockedCounter.increment();
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of(
                            "error", "DUPLICATE_REQUEST",
                            "message", "이미 처리된 요청입니다"
                    ));
        }

        // --- 2단계: 원본을 먼저 기록한다 ---
        //
        // 순서가 중요하다. Redis를 먼저 올리고 DB 쓰기가 실패하면
        // "화면에는 좋아요가 늘었는데 원본에는 없는" 상태가 되고,
        // 나중에 Redis가 초기화되면 그 숫자가 조용히 사라진다.
        // DB를 먼저 쓰면 반대로 원본은 항상 정확하고,
        // Redis만 어긋난 경우는 아래 currentCount()가 스스로 복구한다.
        int inserted;
        try {
            inserted = wishlistRepository.insert(userId, eventId);

        } catch (DataIntegrityViolationException e) {
            // wishlists.user_id -> users.user_id 외래키 위반.
            // users 테이블에 없는 사용자로 요청이 온 경우다.
            // 멱등키를 되돌려서 올바른 요청으로 재시도할 수 있게 한다.
            redisTemplate.delete(key);
            return ResponseEntity.badRequest()
                    .body(Map.of(
                            "error", "INVALID_USER",
                            "message", "users 테이블에 없는 사용자입니다: " + userId
                    ));

        } catch (Exception e) {
            // DB 장애. 멱등키를 되돌리지 않으면 사용자가 10분간 재시도조차 못 한다.
            redisTemplate.delete(key);
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of(
                            "error", "DB_UNAVAILABLE",
                            "message", "잠시 후 다시 시도해 주세요"
                    ));
        }

        // --- 3단계: 실제로 새로 등록된 경우에만 Redis 카운터 증가 ---
        //
        // inserted == 0 은 UNIQUE 제약에 걸렸다는 뜻, 즉 이미 좋아요한 사용자다.
        // 멱등키 TTL이 만료된 뒤 다시 눌러도 여기서 걸러지므로 카운터가 부풀지 않는다.
        long totalLikes;
        if (inserted > 0) {
            Long v = redisTemplate.opsForValue().increment(likeKey(eventId));
            totalLikes = (v != null) ? v : currentCount(eventId);
        } else {
            totalLikes = currentCount(eventId);
        }

        return ResponseEntity.ok(Map.of(
                "eventId", eventId,
                "totalLikes", totalLikes,
                "status", inserted > 0 ? "SUCCESS" : "ALREADY_LIKED"
        ));
    }

    @GetMapping("/like/count")
    public ResponseEntity<Map<String, Object>> getLikeCount(@RequestParam String eventId) {
        return ResponseEntity.ok(Map.of(
                "eventId", eventId,
                "totalLikes", currentCount(eventId)
        ));
    }

    /**
     * 좋아요 수 조회. Redis에 값이 없으면 DB 원본에서 읽어와 채운다(warm-up).
     *
     * 클러스터가 삭제되어 Redis PVC까지 사라져도, 첫 조회 때 이 경로를 타고
     * 정확한 값이 복원된다. 집계 컬럼이 아니라 원본 행을 COUNT 하므로 값이 틀어질 일이 없다.
     *
     * pod 2개가 동시에 이 경로를 타면 둘 다 DB를 읽고 둘 다 SET 하지만,
     * 같은 원본에서 같은 값을 읽으므로 결과가 같다. 별도 락이 필요 없다.
     */
    private long currentCount(String eventId) {
        String cached = redisTemplate.opsForValue().get(likeKey(eventId));
        if (cached != null) {
            return Long.parseLong(cached);
        }

        try {
            long fromDb = wishlistRepository.countByEvent(eventId);
            redisTemplate.opsForValue().set(likeKey(eventId), String.valueOf(fromDb));
            return fromDb;
        } catch (Exception e) {
            // DB가 일시적으로 안 붙어도 조회 API까지 죽지는 않게 한다.
            // 0을 캐시에 넣지 않으므로 다음 요청에서 다시 복구를 시도한다.
            return 0L;
        }
    }
}
