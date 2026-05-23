package com.greatleap.mobile.controller;

import com.greatleap.mobile.security.ClerkPrincipal;
import com.greatleap.mobile.service.UserSyncService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;

import java.util.Map;

/**
 * Shared helper for all API controllers — resolves the synced platform user
 * from the Clerk JWT attached to the current request.
 */
@RequiredArgsConstructor
public abstract class BaseController {

    protected final UserSyncService userSyncService;

    protected Map<String, Object> resolveUser(Authentication auth) {
        ClerkPrincipal principal = (ClerkPrincipal) auth.getPrincipal();
        return userSyncService.syncUser(principal);
    }

    protected long resolveUserId(Authentication auth) {
        Map<String, Object> user = resolveUser(auth);
        return ((Number) user.get("id")).longValue();
    }
}
