package com.montify.api.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.S3Object;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

@Service
public class CleanupService {

    private final S3Client s3Client;
    private final SessionService sessionService;

    @Value("${minio.bucket-name}")
    private String bucketName;

    public CleanupService(S3Client s3Client, SessionService sessionService) {
        this.s3Client = s3Client;
        this.sessionService = sessionService;
    }

    // Метод запускается каждый час (3600000 мс)
    @Scheduled(fixedRate = 3600000)
    public void cleanOldFiles() {
        Instant threshold = Instant.now().minus(3, ChronoUnit.HOURS);

        ListObjectsV2Request request = ListObjectsV2Request.builder()
                .bucket(bucketName)
                .build();

        for (S3Object s3Object : s3Client.listObjectsV2Paginator(request).contents()) {
            if (s3Object.lastModified().isBefore(threshold)) {
                String key = s3Object.key();

                s3Client.deleteObject(DeleteObjectRequest.builder()
                        .bucket(bucketName)
                        .key(key)
                        .build());

                String[] parts = key.split("/");
                if (parts.length >= 2 && (parts[0].equals("uploads") || parts[0].equals("exports"))) {
                    String sessionId = parts[1];
                    sessionService.deleteSession(sessionId);
                }
            }
        }
    }
}