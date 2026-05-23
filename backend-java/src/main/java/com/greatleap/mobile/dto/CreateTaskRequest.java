package com.greatleap.mobile.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CreateTaskRequest {
    @NotBlank
    private String title;
    private String description;
    private String status = "todo";
    private String priority = "medium";
    private String dueDate;
    private String assigneeIdsJson;
}
