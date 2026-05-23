package com.greatleap.mobile.controller;

import com.greatleap.mobile.dto.ApiResponse;
import com.greatleap.mobile.service.UserSyncService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/notifications")
public class NotificationController extends BaseController {

    private final JdbcTemplate jdbc;

    public NotificationController(UserSyncService userSyncService, JdbcTemplate jdbc) {
        super(userSyncService);
        this.jdbc = jdbc;
    }

    @GetMapping
    public ResponseEntity<?> list(@RequestParam(defaultValue = "50") int limit,
                                   @RequestParam(required = false) Boolean unread,
                                   Authentication auth) {
        try {
            long userId = resolveUserId(auth);
            String sql = "SELECT * FROM notifications WHERE recipient_user_id = ? " +
                         (Boolean.TRUE.equals(unread) ? "AND read_at IS NULL " : "") +
                         "ORDER BY created_at DESC LIMIT ?";
            List<Map<String, Object>> rows = jdbc.queryForList(sql, userId, limit);
            return ResponseEntity.ok(ApiResponse.ok(Map.of("notifications", rows)));
        } catch (Exception e) {
            log.error("listNotifications", e);
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    @GetMapping("/unread-count")
    public ResponseEntity<?> unreadCount(Authentication auth) {
        try {
            long userId = resolveUserId(auth);
            Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM notifications WHERE recipient_user_id = ? AND read_at IS NULL",
                Integer.class, userId);
            return ResponseEntity.ok(ApiResponse.ok(Map.of("count", count == null ? 0 : count)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    @PatchMapping("/{id}/read")
    public ResponseEntity<?> markRead(@PathVariable long id, Authentication auth) {
        try {
            long userId = resolveUserId(auth);
            jdbc.update(
                "UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND recipient_user_id = ?",
                id, userId);
            return ResponseEntity.ok(ApiResponse.ok(Map.of("read", true)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }

    @PostMapping("/read-all")
    public ResponseEntity<?> markAllRead(Authentication auth) {
        try {
            long userId = resolveUserId(auth);
            jdbc.update(
                "UPDATE notifications SET read_at = datetime('now') WHERE recipient_user_id = ? AND read_at IS NULL",
                userId);
            return ResponseEntity.ok(ApiResponse.ok(Map.of("readAll", true)));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error(e.getMessage()));
        }
    }
}
