package org.example.plugin.web.dto;

public record LicenseStatusResponse(String deviceCode, boolean valid, double daysLeft, String reason) {
}