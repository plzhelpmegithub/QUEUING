package com.example.springboot.controller;

import io.micrometer.core.instrument.Counter;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.Map;

/**
 * 좋아요 API - 멱등키(Idempotency-Key) 기반 중복 요청 차단
 * - 같은 사용자가 같은 요청을 여러 번 보내도 실제 카운트는 한 번만 증가
 * - Redis의 SETNX(setIfAbsent) 원자적 연산을 이용해 동시 요청에서도 정합성 보장
 */
@RestController
@RequestMapping("/api")
public class LikeController {

    private final StringRedisTemplate redisTemplate;
    private final Counter idempotencyBlockedCounter;

    public LikeController(StringRedisTemplate redisTemplate, Counter idempotencyBlockedCounter) {
        this.redisTemplate = redisTemplate;
        this.idempotencyBlockedCounter = idempotencyBlockedCounter;
    }

    @PostMapping("/like")
    public ResponseEntity<Map<String, Object>> like(
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @RequestParam String eventId,
            @RequestParam String userId) {

        String key = idempotencyKey != null
                ? "idemp:like:" + idempotencyKey
                : "idemp:like:" + eventId + ":" + userId;

        Boolean isFirstRequest = redisTemplate.opsForValue()
                .setIfAbsent(key, "PROCESSED", Duration.ofMinutes(10));

        if (Boolean.FALSE.equals(isFirstRequest)) {
            idempotencyBlockedCounter.increment();
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of(
                            "error", "DUPLICATE_REQUEST",
                            "message", "이미 처리된 요청입니다"
                    ));
        }

        Long totalLikes = redisTemplate.opsForValue().increment("event:" + eventId + ":likes");

        return ResponseEntity.ok(Map.of(
                "eventId", eventId,
                "totalLikes", totalLikes,
                "status", "SUCCESS"
        ));
    }

    @GetMapping("/like/count")
    public ResponseEntity<Map<String, Object>> getLikeCount(@RequestParam String eventId) {
        String count = redisTemplate.opsForValue().get("event:" + eventId + ":likes");
        return ResponseEntity.ok(Map.of(
                "eventId", eventId,
                "totalLikes", count != null ? Long.parseLong(count) : 0L
        ));
    }
}
