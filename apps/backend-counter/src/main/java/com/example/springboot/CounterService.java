package com.example.springboot;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class CounterService {

    private final StringRedisTemplate redisTemplate;

    public CounterService(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public Long increment() {
        return redisTemplate.opsForValue().increment("visit_count");
    }

    public String getCount() {
        return redisTemplate.opsForValue().get("visit_count");
    }
}
