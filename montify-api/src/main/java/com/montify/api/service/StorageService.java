package com.montify.api.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadBucketRequest;
import software.amazon.awssdk.services.s3.model.NoSuchBucketException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.core.ResponseInputStream;

import java.io.IOException;
import java.util.UUID;

@Service
public class StorageService {

    private final S3Client s3Client;

    @Value("${minio.bucket-name}")
    private String bucketName;

    public StorageService(S3Client s3Client) {
        this.s3Client = s3Client;
    }

    public String uploadFile(MultipartFile file, String sessionId) {
        String originalFilename = file.getOriginalFilename();
        String extension = "";
        if (originalFilename != null && originalFilename.contains(".")) {
            extension = originalFilename.substring(originalFilename.lastIndexOf("."));
        }

        createBucketIfNeeded();

        String fileKey = UUID.randomUUID().toString() + extension;
        String fullPath = "uploads/" + sessionId + "/" + fileKey;
        try {
            PutObjectRequest putObjectRequest = PutObjectRequest.builder()
                    .bucket(bucketName)
                    .key(fullPath)
                    .contentType(file.getContentType())
                    .build();

            s3Client.putObject(putObjectRequest,
                    RequestBody.fromInputStream(file.getInputStream(), file.getSize()));

            return fileKey;
        } catch (IOException e) {
            throw new RuntimeException("Ошибка при загрузке файла в MinIO", e);
        }
    }

    private void createBucketIfNeeded() {
        try {
            s3Client.headBucket(HeadBucketRequest.builder().bucket(bucketName).build());
        } catch (NoSuchBucketException e) {
            s3Client.createBucket(CreateBucketRequest.builder().bucket(bucketName).build());
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                s3Client.createBucket(CreateBucketRequest.builder().bucket(bucketName).build());
            } else {
                throw e;
            }
        }
    }

    public ResponseInputStream<GetObjectResponse> getExportedFileStream(String sessionId, String rangeHeader) {
        String minioKey = "exports/" + sessionId + "/final.mp4";

        GetObjectRequest.Builder requestBuilder = GetObjectRequest.builder()
                .bucket(bucketName)
                .key(minioKey);

        // Если браузер запросил конкретный кусок, просим у MinIO только его
        if (rangeHeader != null && !rangeHeader.isEmpty()) {
            requestBuilder.range(rangeHeader);
        }

        return s3Client.getObject(requestBuilder.build());
    }

    public ResponseInputStream<GetObjectResponse> getUploadedFileStream(String sessionId, String fileKey,
            String rangeHeader) {
        String minioKey = "uploads/" + sessionId + "/" + fileKey;

        GetObjectRequest.Builder requestBuilder = GetObjectRequest.builder()
                .bucket(bucketName)
                .key(minioKey);

        // Добавляем поддержку R
        if (rangeHeader != null && !rangeHeader.isEmpty()) {
            requestBuilder.range(rangeHeader);
        }

        return s3Client.getObject(requestBuilder.build());
    }
}