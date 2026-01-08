package com.dreambridgehq.pocketmoney

import android.content.Context
import android.content.SharedPreferences
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.random.Random

/**
 * 보상 및 광고 로직을 관리하는 싱글톤 객체
 * - 랜덤 포인트 확률 계산
 * - 광고 로드 실패 시 보상 우회 지급 (일일 제한)
 * - 친구 초대 링크 생성
 */
object RewardManager {

    private const val PREF_NAME = "RewardPrefs"
    private const val KEY_FALLBACK_COUNT = "fallback_count"
    private const val KEY_LAST_DATE = "last_date"
    private const val MAX_FALLBACK_COUNT = 20

    // 포인트 구간 정의
    private const val REWARD_MIN = 90
    private const val REWARD_NORMAL_MIN = 101
    private const val REWARD_LUCKY_MIN = 130
    private const val REWARD_JACKPOT_MIN = 201
    
    // 친구 초대 링크
    private const val INVITE_URL = "https://play.google.com/store/apps/details?id=com.dreambridgehq.pocketmoney"

    /**
     * 보상 포인트 계산 (정밀 타겟팅)
     * Random(1~100) 기준 4단계 구간 적용
     * (1) [2%] 90~100p (최저/아쉬움)
     * (2) [68%] 101~129p (일반)
     * (3) [28%] 130~200p (행운)
     * (4) [2%] 201~250p (대박)
     */
    fun calculateRewardPoints(): Int {
        val chance = Random.nextInt(1, 101) // 1 ~ 100

        return when {
            chance <= 2 -> Random.nextInt(90, 101)        // 2% 확률: 90~100 (아쉬움)
            chance <= 70 -> Random.nextInt(101, 130)      // 68% 확률: 101~129 (일반) (2+68=70)
            chance <= 98 -> Random.nextInt(130, 201)      // 28% 확률: 130~200 (행운) (70+28=98)
            else -> Random.nextInt(201, 251)              // 2% 확률: 201~250 (대박)
        }
    }

    /**
     * 광고 로드 실패 시 보상 우회 지급 가능 여부 확인 및 카운트 증가
     * 일일 20회 제한
     */
    fun tryGrantFallbackReward(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        val today = getTodayString()
        val lastDate = prefs.getString(KEY_LAST_DATE, "")
        
        var count = prefs.getInt(KEY_FALLBACK_COUNT, 0)

        // 날짜가 바뀌었으면 초기화
        if (today != lastDate) {
            count = 0
            prefs.edit()
                .putString(KEY_LAST_DATE, today)
                .putInt(KEY_FALLBACK_COUNT, 0)
                .apply()
        }

        if (count < MAX_FALLBACK_COUNT) {
            // 지급 가능 -> 카운트 증가
            prefs.edit().putInt(KEY_FALLBACK_COUNT, count + 1).apply()
            return true
        }

        // 제한 초과
        return false
    }

    /**
     * 친구 초대 링크 반환
     * @param referralCode Optional referral code to append to the URL
     */
    fun getInviteLink(referralCode: String? = null): String {
        return if (referralCode != null && referralCode.isNotEmpty()) {
            "$INVITE_URL&ref=$referralCode"
        } else {
            INVITE_URL
        }
    }

    private fun getTodayString(): String {
        val sdf = SimpleDateFormat("yyyyMMdd", Locale.KOREA)
        return sdf.format(Date())
    }
}
