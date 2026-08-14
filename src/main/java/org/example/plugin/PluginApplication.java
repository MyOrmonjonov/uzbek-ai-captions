package org.example.plugin;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/** @EnableScheduling backs WebCaptionOrchestrationService's/WebCaptionCleanupService's @Scheduled
 * eviction sweeps (only relevant under the "webserver" profile — harmless no-op otherwise). */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class PluginApplication {

    public static void main(String[] args) {
        SpringApplication.run(PluginApplication.class, args);
    }

}
