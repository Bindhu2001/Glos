package com.greatleap.mobile.service;

import com.greatleap.mobile.security.ClerkPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * Mirrors Node.js syncUser middleware.
 * Upserts the platform users table from Clerk JWT claims.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class UserSyncService {

    private final JdbcTemplate jdbcTemplate;

    public Map<String, Object> syncUser(ClerkPrincipal principal) {
        String clerkId    = principal.getClerkId();
        String email      = principal.getEmail();
        String firstName  = (String) principal.getClaims().get("given_name");
        String lastName   = (String) principal.getClaims().get("family_name");

        jdbcTemplate.update("""
            INSERT INTO users (clerk_id, email, first_name, last_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(clerk_id) DO UPDATE SET
              email = excluded.email,
              first_name = COALESCE(excluded.first_name, users.first_name),
              last_name  = COALESCE(excluded.last_name,  users.last_name),
              updated_at = datetime('now')
            """,
            clerkId, email, firstName, lastName);

        return jdbcTemplate.queryForMap(
            "SELECT * FROM users WHERE clerk_id = ?", clerkId);
    }

    public Map<String, Object> getUser(String clerkId) {
        return jdbcTemplate.queryForMap(
            "SELECT * FROM users WHERE clerk_id = ?", clerkId);
    }
}
