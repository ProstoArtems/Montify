package com.montify.api.service;

import java.time.Duration;
import java.time.Instant;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.S3Object;
import software.amazon.awssdk.services.s3.paginators.ListObjectsV2Iterable;

@Service
public class SessionCleanupService {

    private static final Logger logger = LoggerFactory.getLogger(SessionCleanupService.class);

    private final StringRedisTemplate redisTemplate;
    private final S3Client s3Client;

    @Value("${minio.bucket-name}")
    private String bucketName;

    @Value("${app.cleanup.retention-days:1}")
    private int retentionDays;

    public SessionCleanupService(StringRedisTemplate redisTemplate, S3Client s3Client) {
        this.redisTemplate = redisTemplate;
        this.s3Client = s3Client;
    }

    @Scheduled(cron = "${app.cleanup.cron:0 0 0 * * *}", zone = "UTC")
    public void performDailyCleanup() {
        logger.info("Starting daily cleanup of expired sessions and MinIO objects at UTC midnight");

        try {
            cleanRedisPatterns("session:*");
            cleanRedisPatterns("status:*");
            cleanMinioPrefix("uploads/");
            cleanMinioPrefix("exports/");
        } catch (Exception e) {
            logger.error("Error during daily cleanup", e);
        }

        logger.info("Daily cleanup complete");
    }

    private void cleanRedisPatterns(String pattern) {
        Set<String> keys = redisTemplate.keys(pattern);
        if (keys == null || keys.isEmpty()) {
            logger.info("No Redis keys found matching pattern {}", pattern);
            return;
        }

        Instant threshold = Instant.now().minus(Duration.ofDays(retentionDays));
        int deleted = 0;

        for (String key : keys) {
            Long ttl = redisTemplate.getExpire(key);
            if (retentionDays == 0) {
                logger.info("Deleting Redis key {} because retentionDays is 0", key);
                redisTemplate.delete(key);
                deleted++;
                continue;
            }
            if (ttl == null) {
                logger.debug("Skipping Redis key {} because TTL is unavailable", key);
                continue;
            }
            if (ttl <= 0) {
                logger.info("Deleting Redis key {} with expired or missing TTL", key);
                redisTemplate.delete(key);
                deleted++;
            }
        }

        logger.info("Deleted {} Redis keys matching {}", deleted, pattern);
    }

    private void cleanMinioPrefix(String prefix) {
        Instant threshold = Instant.now().minus(Duration.ofDays(retentionDays));
        ListObjectsV2Request request = ListObjectsV2Request.builder()
                .bucket(bucketName)
                .prefix(prefix)
                .build();

        try {
            ListObjectsV2Iterable responses = s3Client.listObjectsV2Paginator(request);
            int deleted = 0;
            for (var response : responses) {
                for (S3Object object : response.contents()) {
                    if (object.lastModified() != null && object.lastModified().isBefore(threshold)) {
                        deleteMinioObject(object.key());
                        deleted++;
                    }
                }
            }
            logger.info("Deleted {} MinIO objects under prefix {} older than {} days", deleted, prefix,
                    retentionDays);
        } catch (SdkException e) {
            logger.error("Failed to cleanup MinIO prefix {}", prefix, e);
        }
    }

    private void deleteMinioObject(String key) {
        try {
            DeleteObjectRequest deleteRequest = DeleteObjectRequest.builder()
                    .bucket(bucketName)
                    .key(key)
                    .build();
            s3Client.deleteObject(deleteRequest);
            logger.debug("Deleted MinIO object {}", key);
        } catch (SdkException e) {
            logger.error("Failed to delete MinIO object {}", key, e);
        }
    }
}
