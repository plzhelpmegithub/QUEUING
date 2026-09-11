package com.example.springboot.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * 관심등록(좋아요) 원본 데이터를 D-Cloud MariaDB의 wishlists 테이블에 읽고 쓴다.
 *
 * 설계 전제:
 *  - Redis는 화면에 바로 보여줄 빠른 카운터일 뿐이고, 진짜 원본은 이 테이블이다.
 *    클러스터가 삭제되면 Redis PVC도 함께 사라지므로 Redis만으로는 영속성이 없다.
 *  - wishlists에는 UNIQUE KEY unique_user_event(user_id, event_id)가 걸려 있어
 *    같은 사용자가 같은 이벤트를 중복 등록할 수 없다.
 *  - user_id에는 users(user_id) 외래키가 걸려 있어,
 *    users에 없는 사용자로는 INSERT가 실패한다. (부하테스트 시 주의)
 */
@Repository
public class WishlistRepository {

    private final JdbcTemplate jdbc;

    public WishlistRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 좋아요 등록.
     *
     * ON DUPLICATE KEY UPDATE created_at = created_at 은
     * "유니크 키와 충돌하면 아무것도 바꾸지 말라"는 관용적 표현이다.
     * 중복 요청이 와도 예외 없이 조용히 넘어간다.
     *
     * @return 1이면 새로 등록됨, 0이면 이미 등록돼 있던 것
     */
    public int insert(String userId, String eventId) {
        return jdbc.update(
            "INSERT INTO wishlists (user_id, event_id) VALUES (?, ?) " +
            "ON DUPLICATE KEY UPDATE created_at = created_at",
            userId, eventId);
    }

    /**
     * 좋아요 취소.
     *
     * @return 1이면 실제로 지워짐, 0이면 원래 없던 것
     */
    public int delete(String userId, String eventId) {
        return jdbc.update(
            "DELETE FROM wishlists WHERE user_id = ? AND event_id = ?",
            userId, eventId);
    }

    /**
     * 이벤트별 좋아요 수.
     *
     * 집계 컬럼을 따로 두지 않고 원본 행을 직접 세기 때문에 값이 틀어질 일이 없다.
     * Redis가 비었을 때 이 값으로 다시 채운다(warm-up).
     */
    public long countByEvent(String eventId) {
        Long n = jdbc.queryForObject(
            "SELECT COUNT(*) FROM wishlists WHERE event_id = ?",
            Long.class, eventId);
        return n == null ? 0L : n;
    }
}
