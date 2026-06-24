package com.montify.api.dto.queue;

import com.fasterxml.jackson.annotation.JsonProperty;

public class RedisRenderTaskDto {
    @JsonProperty("session_id")
    private String sessionId;

    @JsonProperty("render_id")
    private String renderId;

    private RedisManifestDto manifest;

    public RedisRenderTaskDto(String sessionId, String renderId, RedisManifestDto manifest) {
        this.sessionId = sessionId;
        this.renderId = renderId;
        this.manifest = manifest;
    }

    public String getSessionId() { return sessionId; }
    public String getRenderId() { return renderId; }
    public RedisManifestDto getManifest() { return manifest; }
}