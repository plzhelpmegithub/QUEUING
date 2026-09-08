package com.example.springboot.config;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.StringRedisTemplate;

@Configuration
public class MetricsConfig {

    @Bean
    public Counter idempotencyBlockedCounter(MeterRegistry meterRegistry) {
        return Counter.builder("custom_idempotency_blocked_total")
                .description("멱등키로 차단된 중복 요청 수")
                .register(meterRegistry);
    }

    @Bean
    public Gauge activeUsersMainGauge(MeterRegistry meterRegistry, StringRedisTemplate redisTemplate) {
        return Gauge.builder("custom_active_users_main", redisTemplate, rt -> {
            String count = rt.opsForValue().get("traffic:main");
            return count != null ? Double.parseDouble(count) : 0.0;
        }).description("메인 페이지 실시간 접속자 수").register(meterRegistry);
    }
}
