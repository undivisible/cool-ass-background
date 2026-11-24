package dev.undivisible.background;

import android.service.notification.NotificationListenerService;

// Notification access is Android's user-granted route to active media sessions.
// Notification contents are not inspected, stored or transmitted.
public final class PlaybackAccess extends NotificationListenerService {}
