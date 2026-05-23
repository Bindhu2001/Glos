package com.greatleap.mobile.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.security.PublicKey;
import java.security.KeyFactory;
import java.security.spec.RSAPublicKeySpec;
import java.math.BigInteger;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Fetches Clerk's JWKS and caches public keys for JWT signature verification.
 * Keys are refreshed automatically when an unknown kid is encountered.
 */
@Slf4j
@Service
public class ClerkJwksService {

    @Value("${clerk.jwks-url}")
    private String jwksUrl;

    @Value("${clerk.issuer}")
    private String issuer;

    private final WebClient webClient = WebClient.builder().build();
    private final Map<String, PublicKey> keyCache = new ConcurrentHashMap<>();

    public Claims parseClaims(String token) {
        String[] parts = token.split("\\.");
        String headerJson = new String(Base64.getUrlDecoder().decode(parts[0]));

        String kid = extractKid(headerJson);

        PublicKey publicKey = keyCache.get(kid);
        if (publicKey == null) {
            refreshKeys();
            publicKey = keyCache.get(kid);
        }

        if (publicKey == null) {
            throw new IllegalArgumentException("Unknown key id: " + kid);
        }

        return Jwts.parser()
                .verifyWith(publicKey)
                .requireIssuer(issuer)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    @SuppressWarnings("unchecked")
    private void refreshKeys() {
        try {
            Map<String, Object> jwks = webClient.get()
                    .uri(jwksUrl)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();

            if (jwks == null) return;

            List<Map<String, Object>> keys = (List<Map<String, Object>>) jwks.get("keys");
            if (keys == null) return;

            for (Map<String, Object> key : keys) {
                String kid = (String) key.get("kid");
                String n   = (String) key.get("n");
                String e   = (String) key.get("e");
                if (kid != null && n != null && e != null) {
                    keyCache.put(kid, buildRsaKey(n, e));
                }
            }
        } catch (Exception ex) {
            log.error("Failed to refresh Clerk JWKS: {}", ex.getMessage());
        }
    }

    private PublicKey buildRsaKey(String n, String e) {
        try {
            BigInteger modulus  = new BigInteger(1, Base64.getUrlDecoder().decode(n));
            BigInteger exponent = new BigInteger(1, Base64.getUrlDecoder().decode(e));
            return KeyFactory.getInstance("RSA").generatePublic(new RSAPublicKeySpec(modulus, exponent));
        } catch (Exception ex) {
            throw new RuntimeException("Could not build RSA public key", ex);
        }
    }

    private String extractKid(String headerJson) {
        // Simple regex-free extraction
        int idx = headerJson.indexOf("\"kid\"");
        if (idx < 0) return "default";
        int start = headerJson.indexOf('"', idx + 5) + 1;
        int end   = headerJson.indexOf('"', start);
        return headerJson.substring(start, end);
    }
}
