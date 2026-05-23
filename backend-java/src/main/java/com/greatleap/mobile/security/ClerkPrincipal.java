package com.greatleap.mobile.security;

import io.jsonwebtoken.Claims;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public class ClerkPrincipal {
    private final String clerkId;
    private final String email;
    private final Claims claims;
}
