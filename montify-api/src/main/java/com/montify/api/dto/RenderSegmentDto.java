package com.montify.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class RenderSegmentDto {
    @JsonProperty("file_name")
    private String fileName;

    @JsonProperty("start_from")
    private String startFrom;

    @JsonProperty("end_at")
    private String endAt;
}