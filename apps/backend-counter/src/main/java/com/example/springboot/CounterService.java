package com.example.springboot;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class CounterService {

    private final StringRedisTemplate redisTemplate;

    public CounterService(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    // ===== 기존 방문자 카운터 (건드리지 않음) =====
    public Long increment() {
        return redisTemplate.opsForValue().increment("visit_count");
    }

    public String getCount() {
        return redisTemplate.opsForValue().get("visit_count");
    }

    // ===== 페이지별 접속자 수 + 혼잡도 (신규) =====

    public Long enterPage(String page) {
        return redisTemplate.opsForValue().increment("traffic:" + page);
    }

    public Long leavePage(String page) {
        Long current = redisTemplate.opsForValue().decrement("traffic:" + page);
        if (current != null && current < 0) {
            redisTemplate.opsForValue().set("traffic:" + page, "0");
            current = 0L;
        }
        return current;
    }

    public Long getPageCount(String page) {
        String val = redisTemplate.opsForValue().get("traffic:" + page);
        return val != null ? Long.parseLong(val) : 0L;
    }

    public String calculateLevel(Long count) {
        if (count == null || count <= 50) return "한산";
        if (count <= 200) return "보통";
        return "혼잡";
    }
}
