package org.example.plugin.service;

import java.time.LocalDate;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.example.plugin.config.PluginProperties;
import org.springframework.stereotype.Service;

/**
 * Free-tier abuse throttle for the anonymous web caption tool: N uploads per IP per day, then the
 * visitor must activate a real license the same way the desktop plugin does (paste a device code
 * into the bot, pay, get a token). Deliberately in-memory rather than persisted to srt_bot's
 * licenses.db — this is just an abuse throttle, not the entitlement record of truth (that stays
 * durable in licenses.db, checked via VisitorLicenseClient), so a redeploy resetting everyone's
 * daily counter early is a minor, self-correcting cost, not a data-loss concern.
 */
@Service
public class WebQuotaService {

    public record QuotaResult(boolean allowed, String pseudoDeviceCode) {
    }

    private static final class DayCounter {
        volatile LocalDate date = LocalDate.now();
        final AtomicInteger count = new AtomicInteger();
    }

    private final PluginProperties properties;
    private final VisitorLicenseClient licenseClient;
    private final ConcurrentHashMap<String, DayCounter> ipCounters = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> ipToPseudoCode = new ConcurrentHashMap<>();

    public WebQuotaService(PluginProperties properties, VisitorLicenseClient licenseClient) {
        this.properties = properties;
        this.licenseClient = licenseClient;
    }

    /** Paid visitors (valid deviceCode+token) bypass the counter entirely. */
    public QuotaResult checkAndReserve(String ip, String deviceCode, String licenseToken) {
        if (deviceCode != null && !deviceCode.isBlank() && licenseToken != null && !licenseToken.isBlank()
                && licenseClient.verify(deviceCode, licenseToken).valid()) {
            return new QuotaResult(true, null);
        }

        DayCounter counter = ipCounters.computeIfAbsent(ip, k -> new DayCounter());
        synchronized (counter) {
            LocalDate today = LocalDate.now();
            if (!today.equals(counter.date)) {
                counter.date = today;
                counter.count.set(0);
            }
            if (counter.count.get() >= properties.getWeb().getFreeUploadsPerIpPerDay()) {
                return new QuotaResult(false, deviceCodeFor(ip));
            }
            counter.count.incrementAndGet();
            return new QuotaResult(true, null);
        }
    }

    /** Stable per-IP pseudo device code so repeated visits paste the same code into the bot. */
    private String deviceCodeFor(String ip) {
        return ipToPseudoCode.computeIfAbsent(ip, k -> DeviceCodeGenerator.generate());
    }
}
