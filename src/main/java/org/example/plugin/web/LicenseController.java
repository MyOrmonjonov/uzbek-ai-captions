package org.example.plugin.web;

import org.example.plugin.service.LicenseService;
import org.example.plugin.web.dto.LicenseActivateRequest;
import org.example.plugin.web.dto.LicenseStatusResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LicenseController {

    private final LicenseService licenseService;

    public LicenseController(LicenseService licenseService) {
        this.licenseService = licenseService;
    }

    @GetMapping("/api/license/status")
    public LicenseStatusResponse status() {
        LicenseService.Status status = licenseService.checkValid();
        return new LicenseStatusResponse(licenseService.deviceCode(), status.valid(), status.daysLeft(), status.reason());
    }

    @PostMapping("/api/license/activate")
    public LicenseStatusResponse activate(@RequestBody LicenseActivateRequest request) {
        LicenseService.Status status = licenseService.activate(request.token());
        return new LicenseStatusResponse(licenseService.deviceCode(), status.valid(), status.daysLeft(), status.reason());
    }

    /** Polled by the panel's activation screen on a timer -- no token in the request, since the
     * device code alone is enough for the server to say "yes, this got approved" once it has. */
    @GetMapping("/api/license/poll")
    public LicenseStatusResponse poll() {
        LicenseService.Status status = licenseService.pollActivation();
        return new LicenseStatusResponse(licenseService.deviceCode(), status.valid(), status.daysLeft(), status.reason());
    }
}