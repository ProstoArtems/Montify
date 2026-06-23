package com.montify.api.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class UserSession implements Serializable {
    private static final long serialVersionUID = 1L;

    private String sessionId;
    private List<String> uploadedFileKeys = new ArrayList<>();
}