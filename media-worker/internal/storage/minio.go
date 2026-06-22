package storage

import (
	"context"
	"fmt"
	"path/filepath"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type MinioStorage struct {
	client     *minio.Client
	bucketName string
}

func NewMinioStorage(endpoint, accessKey, secretKey, bucketName string, useSSL bool) (*MinioStorage, error) {
	minioClient, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, err
	}
	return &MinioStorage{client: minioClient, bucketName: bucketName}, nil
}

// DownloadInput скачивает файл из папки uploads/session_id/ во временную локальную директорию
func (m *MinioStorage) DownloadInput(ctx context.Context, sessionID, fileName, destDir string) (string, error) {
	objectName := fmt.Sprintf("uploads/%s/%s", sessionID, fileName) // [cite: 3, 9]
	localPath := filepath.Join(destDir, fileName)

	err := m.client.FGetObject(ctx, m.bucketName, objectName, localPath, minio.GetObjectOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to download file %s: %w", objectName, err)
	}
	return localPath, nil
}

// UploadResult загружает готовый файл в папку exports/session_id/final.mp4
func (m *MinioStorage) UploadResult(ctx context.Context, sessionID, localFilePath string) error {
	objectName := fmt.Sprintf("exports/%s/final.mp4", sessionID) //

	_, err := m.client.FPutObject(ctx, m.bucketName, objectName, localFilePath, minio.PutObjectOptions{
		ContentType: "video/mp4",
	})
	if err != nil {
		return fmt.Errorf("failed to upload final video: %w", err)
	}
	return nil
}
