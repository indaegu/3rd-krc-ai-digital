package com.mulsigye.app.core.notifications

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.mulsigye.app.MainActivity
import com.mulsigye.app.R

/**
 * 로컬 알림 채널 생성과 발송을 담당한다(플랫폼 NotificationManagerCompat만 사용, FCM 없음).
 *
 * 발송 전에 알림 권한을 항상 확인하고, 꺼져 있으면 조용히 넘어간다(거부 시 크래시·재요청 없음).
 */
object WaterNotifications {
    const val CHANNEL_ID = "susinho_water"
    const val CHANNEL_NAME = "물 사정 알림"
    const val DAILY_NOTIFICATION_ID = 4801
    const val STAGE_NOTIFICATION_ID = 4802

    /** 앱 시작·설정 진입 시 채널을 만든다(minSdk 26 이상이라 채널은 항상 존재). 재호출은 안전하다. */
    fun ensureChannel(context: Context) {
        val channel = NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "우리 지역 물 사정과 단계 변화를 알려드려요."
        }
        context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }

    /** 알림을 켤 수 있는 상태인지(시스템 토글 on + Android 13+ 런타임 권한 허용). */
    fun canPost(context: Context): Boolean {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) return false
        }
        return true
    }

    /**
     * 알림 하나 발송. 권한이 없으면 아무 것도 하지 않는다. 탭하면 앱 메인으로 들어간다.
     * OEM 별 예외(SecurityException)에도 워커가 죽지 않도록 방어한다.
     */
    // canPost()가 POST_NOTIFICATIONS 권한과 시스템 토글을 먼저 확인하므로 notify는 안전하다.
    // (lint는 메서드 경계를 넘는 권한 가드를 추적하지 못해 오탐하므로 억제한다.)
    @SuppressLint("MissingPermission")
    fun post(context: Context, id: Int, title: String, text: String) {
        if (!canPost(context)) return
        val contentIntent = PendingIntent.getActivity(
            context,
            id,
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_water)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(id, notification)
        } catch (_: SecurityException) {
            // 권한이 방금 회수된 드문 경합. 조용히 무시한다(재시도·크래시 없음).
        }
    }
}
