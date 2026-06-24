package com.montify.api.consumer;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.montify.api.dto.request.RenderTaskDto;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Component
public class VideoRenderConsumer {

    private final StringRedisTemplate redisTemplate;
    private final String queueKey;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private volatile boolean isRunning = true;

    public VideoRenderConsumer(StringRedisTemplate redisTemplate,
                               @Value("${app.redis.queue-name}") String queueKey) {
        this.redisTemplate = redisTemplate;
        this.queueKey = queueKey;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void startListening() {
        Thread.startVirtualThread(() -> {
            while (isRunning) {
                try {
                    // Используем queueKey, подтянутый из .env
                    String rawJson = redisTemplate.opsForList().leftPop(queueKey, Duration.ofSeconds(5));

                    if (rawJson != null) {
                        RenderTaskDto task = objectMapper.readValue(rawJson, RenderTaskDto.class);
                        processRender(task);
                    }
                } catch (JsonProcessingException e) {
                    System.err.println("Ошибка парсинга JSON: " + e.getMessage());
                } catch (Exception e) {
                    System.err.println("Ошибка очереди: " + e.getMessage());
                }
            }
        });
    }

    @PreDestroy
    public void stopListening() {
        this.isRunning = false;
    }

    private void processRender(RenderTaskDto task) {
        String sessionId = task.getSessionId();
        String renderId = task.getRenderId();

        System.out.println("[Render Engine] Задача " + renderId + " маршрутизирована. Ожидается финальный файл: exports/" + sessionId + "/final.mp4");
    }
}