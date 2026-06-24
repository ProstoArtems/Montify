package com.montify.api.dto.request;

import java.util.List;

public class RenderTaskDto {
    private String sessionId;
    private String renderId;
    private List<RenderSegmentDto> segments;

    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }

    public String getRenderId() { return renderId; }
    public void setRenderId(String renderId) { this.renderId = renderId; }

    public List<RenderSegmentDto> getSegments() { return segments; }
    public void setSegments(List<RenderSegmentDto> segments) { this.segments = segments; }
}