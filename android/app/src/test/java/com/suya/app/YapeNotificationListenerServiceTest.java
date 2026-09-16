package com.suya.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class YapeNotificationListenerServiceTest {

    @Test
    public void parsesFourDigitThousandsAmountWithoutTruncatingIt() {
        assertEquals(Long.valueOf(100000), YapeNotificationListenerService.normalizeAmount("1000.00"));
        assertEquals(Long.valueOf(100000), YapeNotificationListenerService.normalizeAmount("1,000.00"));
    }

    @Test
    public void doesNotNormalizeNegativeAmountsAsIncomingPayments() {
        assertEquals(Long.valueOf(3000), YapeNotificationListenerService.normalizeAmount("30.00"));
        assertTrue(!YapeNotificationListenerService.containsIncomingMoney("Reversión -S/ 30.00"));
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
}
