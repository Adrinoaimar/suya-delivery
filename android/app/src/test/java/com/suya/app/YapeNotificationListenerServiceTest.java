package com.suya.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Test;

public class YapeNotificationListenerServiceTest {

    @Test
    public void parsesFourDigitThousandsAmountWithoutTruncatingIt() {
        assertEquals(Long.valueOf(100000), YapeNotificationListenerService.normalizeAmount("1000.00"));
        assertEquals(Long.valueOf(100000), YapeNotificationListenerService.normalizeAmount("1,000.00"));
        assertEquals(Long.valueOf(100000), YapeNotificationListenerService.normalizeAmount("1.000,00"));
    }

    @Test
    public void rejectsMalformedMonetaryTokensInsteadOfPartiallyParsingThem() {
        assertEquals(null, YapeNotificationListenerService.parseMoney("S/", "30.5"));
        assertEquals(null, YapeNotificationListenerService.parseMoney("S/", "30,5"));
        assertEquals(null, YapeNotificationListenerService.parseMoney("S/", "1,2345"));
        assertTrue(YapeNotificationListenerService.hasMalformedAmountContinuation("S/ 30.5", 5));
        assertTrue(YapeNotificationListenerService.hasMalformedAmountContinuation("S/ 1,2345", 4));
    }

    @Test
    public void rejectsObservationsAboveTheServerAmountContract() {
        assertEquals(null, YapeNotificationListenerService.parseMoney("S/", "1000000.01"));
    }

    @Test
    public void doesNotNormalizeNegativeAmountsAsIncomingPayments() {
        assertEquals(Long.valueOf(3000), YapeNotificationListenerService.normalizeAmount("30.00"));
        assertTrue(!YapeNotificationListenerService.containsIncomingMoney("Reversión -S/ 30.00"));
    }

    @Test
    public void ignoresNonIncomingNotificationLanguage() {
        assertTrue(!YapeNotificationListenerService.isIncomingNotification("Saldo disponible: S/ 30.00"));
        assertTrue(!YapeNotificationListenerService.isIncomingNotification("Enviaste S/ 30.00"));
        assertTrue(!YapeNotificationListenerService.isIncomingNotification("Solicitud de pago: S/ 30.00"));
        assertTrue(!YapeNotificationListenerService.isIncomingNotification("Reversión de S/ 30.00"));
        assertTrue(YapeNotificationListenerService.isIncomingNotification("Recibiste S/ 30.00"));
    }

    @Test
    public void extractsSenderAfterWalletTitle() {
        assertEquals(
                "Ana María Torres",
                YapeNotificationListenerService.extractSenderNameFromFields(
                        new String[]{"Yape", "Ana María Torres te envió S/ 30.00"},
                        "Yape Ana María Torres te envió S/ 30.00"
                )
        );
    }

    @Test
    public void extractsSenderFromLabelWithoutSwallowingOperationCode() {
        assertEquals(
                "Ana María Torres",
                YapeNotificationListenerService.extractSenderName(
                        "Yape recibido S/ 30.00. De: Ana María Torres. Código de operación: 482901"
                )
        );
    }

    @Test
    public void preservesPendingEventsBeforeSyncedHistoryWhenQueueReachesLimit() {
        boolean[] synced = new boolean[500];
        for (int index = 0; index < 100; index++) {
            synced[index] = true;
        }

        int[] indexes = YapeNotificationListenerService.pendingPriorityIndexes(synced);

        int pending = 0;
        for (int index : indexes) {
            if (!synced[index]) pending++;
        }
        assertEquals(499, indexes.length);
        assertEquals(400, pending);
        assertTrue(!synced[indexes[0]]);
    }

    @Test
    public void derivesQueueFullFromCurrentPendingEvents() throws JSONException {
        JSONArray events = new JSONArray();
        for (int index = 0; index < 499; index++) {
            events.put(new JSONObject().put("synced", false));
        }
        assertTrue(!YapeNotificationListenerService.isPendingCapacityReached(events));
        events.put(new JSONObject().put("synced", false));
        assertTrue(YapeNotificationListenerService.isPendingCapacityReached(events));
    }

    @Test
    public void scopesQueueCapacityToTheActiveBinding() throws JSONException {
        JSONArray events = new JSONArray();
        for (int index = 0; index < 500; index++) {
            events.put(new JSONObject().put("bindingId", "old-binding").put("synced", false));
        }

        assertTrue(YapeNotificationListenerService.isPendingCapacityReached(events, "old-binding"));
        assertTrue(!YapeNotificationListenerService.isPendingCapacityReached(events, "new-binding"));
    }

    @Test
    public void retainsAllPendingEventsWhenOnlySyncedHistoryMustBeTrimmed() {
        boolean[] synced = new boolean[501];
        int[] indexes = YapeNotificationListenerService.pendingPriorityIndexes(synced);

        assertEquals(501, indexes.length);
        for (int index : indexes) {
            assertTrue(!synced[index]);
        }
    }
}
