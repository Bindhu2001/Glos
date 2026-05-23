package com.greatleap.mobile.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CreatePostRequest {
    @NotBlank
    private String content;
    private String type = "post";
}
