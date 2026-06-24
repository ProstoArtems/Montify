package com.montify.api.dto.queue;

import java.util.List;

public class RedisManifestDto {
    private List<RedisSegmentDto> segments;

    public RedisManifestDto(List<RedisSegmentDto> segments) {
        this.segments = segments;
    }

    public List<RedisSegmentDto> getSegments() { return segments; }
    public void setSegments(List<RedisSegmentDto> segments) { this.segments = segments; }
}