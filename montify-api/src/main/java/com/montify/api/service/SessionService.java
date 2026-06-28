package com.montify.api.service;

import com.montify.api.model.UserSession;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.UUID;

@Service
public class SessionService {

    private final RedisTemplate<String, Object> redisTemplate;
    private static final String SESSION_PREFIX = "session:";

    public SessionService(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public UserSession createSession() {
        String sessionId = UUID.randomUUID().toString();
        UserSession session = new UserSession(sessionId, new ArrayList<>());

        redisTemplate.opsForValue().set(SESSION_PREFIX + sessionId, session, Duration.ofDays(1));
        return session;
    }

    public UserSession getSession(String sessionId) {
        return (UserSession) redisTemplate.opsForValue().get(SESSION_PREFIX + sessionId);
    }

    public void addFileToSession(String sessionId, String fileKey) {
        UserSession session = getSession(sessionId);
        if (session != null) {
            session.getUploadedFileKeys().add(fileKey);
            redisTemplate.opsForValue().set(SESSION_PREFIX + sessionId, session, Duration.ofDays(1));
        } else {
            throw new RuntimeException("Сессия не найдена или истекла!");
        }
    }

    public void deleteSession(String sessionId) {
        redisTemplate.delete(SESSION_PREFIX + sessionId);
    }
}