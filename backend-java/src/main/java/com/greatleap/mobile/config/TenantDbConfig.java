package com.greatleap.mobile.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages SQLite connections to per-tenant databases.
 * Mirrors the Node.js backend's src/db/tenant.js connection pool.
 */
@Component
public class TenantDbConfig {

    @Value("${greatleap.data-root:/data}")
    private String dataRoot;

    private final Map<Long, Connection> pool = new ConcurrentHashMap<>();

    public Connection getTenantConnection(long appId) throws SQLException {
        return pool.computeIfAbsent(appId, id -> {
            try {
                String path = dataRoot + "/tenants/" + id + ".db";
                return DriverManager.getConnection("jdbc:sqlite:" + path);
            } catch (SQLException e) {
                throw new RuntimeException("Cannot open tenant DB for appId=" + id, e);
            }
        });
    }
}
