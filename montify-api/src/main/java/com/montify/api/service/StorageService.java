package com.montify.api.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import java.nio.file.Path;

import java.io.IOException;
import java.util.UUID;

@Service
public class StorageService {

    private final S3Client s3Client;
    private final String bucketName;

    public StorageService(S3Client s3Client, @Value("${minio.bucket-name}") String bucketName) {
        this.s3Client = s3Client;
        this.bucketName = bucketName;
    }

    public String uploadFile(MultipartFile file, String sessionId) {
        String originalFilename = file.getOriginalFilename();
        String extension = "";
        if (originalFilename != null && originalFilename.contains(".")) {
            extension = originalFilename.substring(originalFilename.lastIndexOf("."));
        }

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

    public void downloadFile(String minioKey, Path localPath) {
        try {
            GetObjectRequest getObjectRequest = GetObjectRequest.builder()
                    .bucket(bucketName)
                    .key(minioKey)
                    .build();

            // Потоково скачиваем файл прямо на диск
            s3Client.getObject(getObjectRequest, localPath);
            System.out.println("[MinIO] Файл успешно скачан: " + minioKey + " -> " + localPath.toAbsolutePath());
        } catch (Exception e) {
            throw new RuntimeException("Не удалось скачать файл из MinIO: " + minioKey, e);
        }
    }
}