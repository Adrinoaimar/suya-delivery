package com.suya.app;

import android.app.job.JobParameters;
import android.app.job.JobService;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Retries encrypted wallet evidence while the caja device has network access. */
public final class SuyaWalletSyncJobService extends JobService {
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public boolean onStartJob(JobParameters params) {
        EXECUTOR.execute(() -> {
            try {
                YapeNotificationListenerService.syncPendingEventsBlockingForJob(this);
            } finally {
                jobFinished(params, false);
            }
        });
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
