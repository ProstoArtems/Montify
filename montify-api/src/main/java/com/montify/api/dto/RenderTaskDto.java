package com.montify.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class RenderTaskDto {
    @JsonProperty("render_id")
    private String renderId;

    @JsonProperty("session_id")
    private String sessionId;

    private RenderManifestDto manifest;
}