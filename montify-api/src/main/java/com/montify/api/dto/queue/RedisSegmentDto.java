package com.montify.api.dto.queue;

import com.fasterxml.jackson.annotation.JsonProperty;

public class RedisSegmentDto {
    @JsonProperty("file_name")
    private String fileName;

    @JsonProperty("start_from")
    private String startFrom;

    @JsonProperty("end_at")
    private String endAt;

    @JsonProperty("type")
    private String type;

    public RedisSegmentDto(String fileName, String startFrom, String endAt) {
        this.fileName = fileName;
        this.startFrom = startFrom;
        this.endAt = endAt;
        this.type = "video"; // default
    }

    public RedisSegmentDto(String fileName, String startFrom, String endAt, String type) {
        this.fileName = fileName;
        this.startFrom = startFrom;
        this.endAt = endAt;
        this.type = type;
    }

    public String getFileName() { return fileName; }
    public String getStartFrom() { return startFrom; }
    public String getEndAt() { return endAt; }
    public String getType() { return type; }
}