package com.suya.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class YapeNotificationListenerServiceTest {

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
}
