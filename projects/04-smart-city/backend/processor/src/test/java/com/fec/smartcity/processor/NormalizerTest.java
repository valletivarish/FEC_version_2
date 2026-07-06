package com.fec.smartcity.processor;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class NormalizerTest {

    static final String READING = "{\"site_id\":\"zone-1\",\"sensor_type\":\"noise_level\",\"unit\":\"dB\"," +
        "\"count\":4,\"min\":60.0,\"max\":80.0,\"avg\":70.0,\"latest\":75.0," +
        "\"window_start\":\"s\",\"window_end\":\"e\",\"alerts\":[]}";

    @Nested
    class WhenNormalizingACompleteReading {

        @Test
        void thenCoreFieldsAreConvertedToAttributeValues() throws Exception {
            var item = Normalizer.normalize(READING);

            assertThat(item.get("sensor_type").s()).isEqualTo("noise_level");
            assertThat(item.get("avg").n()).isEqualTo("70.0");
            assertThat(item.get("window_end").s()).isEqualTo("e");
        }
    }

    @Nested
    class WhenSiteIdIsMissing {

        static final String NO_SITE_ID = "{\"sensor_type\":\"vehicle_count\",\"window_start\":\"s\"," +
            "\"window_end\":\"e\",\"count\":1,\"min\":1.0,\"max\":1.0,\"avg\":1.0,\"latest\":1.0}";

        @Test
        void thenDefaultZoneIsApplied() throws Exception {
            var item = Normalizer.normalize(NO_SITE_ID);

            assertThat(item.get("site_id").s()).isEqualTo("zone-1");
        }

        @Test
        void thenAlertsDefaultsToEmptyList() throws Exception {
            var item = Normalizer.normalize(NO_SITE_ID);

            assertThat(item.get("alerts").l()).isEmpty();
        }
    }

    @Nested
    class WhenTwoZonesShareAWindow {

        @ParameterizedTest
        @ValueSource(strings = {"zone-2", "zone-3", "zone-9"})
        void thenSortKeysDisambiguateByZone(String otherZone) throws Exception {
            String other = READING.replace("\"site_id\":\"zone-1\"", "\"site_id\":\"" + otherZone + "\"");

            var itemA = Normalizer.normalize(READING);
            var itemB = Normalizer.normalize(other);

            assertThat(itemA.get("window_end").s()).isEqualTo(itemB.get("window_end").s());
            assertThat(itemA.get("sort_key").s()).isNotEqualTo(itemB.get("sort_key").s());
        }
    }
}
