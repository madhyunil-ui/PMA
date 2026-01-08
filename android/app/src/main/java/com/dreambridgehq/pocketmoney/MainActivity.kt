package com.dreambridgehq.pocketmoney

import android.os.Bundle
import android.util.Log
import android.widget.Toast
import com.getcapacitor.BridgeActivity
import com.unity3d.ads.*
import com.unity3d.services.banners.BannerErrorInfo
import com.unity3d.services.banners.BannerView
import com.unity3d.services.banners.UnityBannerSize
import kotlinx.coroutines.*

class MainActivity : BridgeActivity() {

    private val TAG = "PMA_MainActivity"

    // ⚠️ 반드시 실제 Unity Dashboard Game ID로 교체
    private val UNITY_GAME_ID = "6018679"
    private val TEST_MODE = false

    // Unity Dashboard Placement ID (Rewarded)
    private val AD_UNIT_ID = "mission_video"
    // Unity Banner Placement ID
    private val BANNER_AD_UNIT_ID = "Banner_Android" // User provided ID
    
    private var bottomBanner: BannerView? = null

    private var isAdLoaded = false
    private var isAdShowing = false
    private var retryCount = 0
    private val maxRetries = 3

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        initializeUnityAds()
    }

    /** Unity Ads 초기화 */
    private fun initializeUnityAds() {
        if (UnityAds.isInitialized) return

        UnityAds.initialize(
            applicationContext,
            UNITY_GAME_ID,
            TEST_MODE,
            object : IUnityAdsInitializationListener {

                override fun onInitializationComplete() {
                    Log.d(TAG, "Unity Ads initialized")
                }

                override fun onInitializationFailed(
                    error: UnityAds.UnityAdsInitializationError,
                    message: String
                ) {
                    Log.e(TAG, "Init failed: $message")
                    retryInitialization()
                }
            }
        )
    }

    private fun retryInitialization() {
        if (retryCount >= maxRetries) return
        retryCount++

        CoroutineScope(Dispatchers.Main).launch {
            delay((1000L * retryCount))
            initializeUnityAds()
        }
    }

    /** 광고 로드 */
    fun loadRewardAd() {
        if (isAdLoaded || isAdShowing) return

        UnityAds.load(
            AD_UNIT_ID,
            object : IUnityAdsLoadListener {

                override fun onUnityAdsAdLoaded(placementId: String) {
                    Log.d(TAG, "Ad loaded")
                    isAdLoaded = true
                }

                override fun onUnityAdsFailedToLoad(
                    placementId: String,
                    error: UnityAds.UnityAdsLoadError,
                    message: String
                ) {
                    Log.e(TAG, "Load failed: $message")
                    isAdLoaded = false
                }
            }
        )
    }

    private var currentAdType: String = ""

    /** 광고 표시 (JS → Android 호출용) */
    @android.webkit.JavascriptInterface
    fun showRewardAd(adType: String) {
        if (!isAdLoaded || isAdShowing) {
             // If not loaded, treat as failure immediately or handle logic
             // But for now, we just return. The JS side has a timeout fallback.
             return
        }

        isAdShowing = true
        currentAdType = adType

        UnityAds.show(
            this,
            AD_UNIT_ID,
            object : IUnityAdsShowListener {

                override fun onUnityAdsShowStart(placementId: String) {
                    Log.d(TAG, "Ad started")
                }

                override fun onUnityAdsShowClick(placementId: String) {}

                override fun onUnityAdsShowComplete(
                    placementId: String,
                    state: UnityAds.UnityAdsShowCompletionState
                ) {
                    isAdShowing = false
                    isAdLoaded = false

                    if (state == UnityAds.UnityAdsShowCompletionState.COMPLETED) {
                        grantReward()
                    } else {
                        // Notify failure/skip to JS
                        bridge.eval("window.onUnityAdFinished('skipped', '$currentAdType')", null)
                    }
                }

                override fun onUnityAdsShowFailure(
                    placementId: String,
                    error: UnityAds.UnityAdsShowError,
                    message: String
                ) {
                    Log.e(TAG, "Show failed: $message")
                    isAdShowing = false
                    isAdLoaded = false
                    bridge.eval("window.onUnityAdFinished('show_failed', '$currentAdType')", null)
                }
            }
        )
    }

    private fun grantReward() {
        Toast.makeText(this, "보상 지급 완료", Toast.LENGTH_SHORT).show()
        bridge.eval("window.onUnityAdFinished('completed', '$currentAdType')", null)
    }

    /** 배너 광고 표시 (JS → Android) */
    @android.webkit.JavascriptInterface
    fun showBannerAd() {
        runOnUiThread {
            if (bottomBanner != null) return@runOnUiThread // 이미 생성됨

            // 1. 배너 뷰 생성 (가로 320, 세로 50)
            bottomBanner = BannerView(this, BANNER_AD_UNIT_ID, UnityBannerSize(320, 50))
            
            // 2. 리스너 설정
            bottomBanner?.listener = object : BannerView.IListener {
                override fun onBannerLoaded(bannerAdView: BannerView) {
                    Log.d(TAG, "Banner loaded")
                    // 배너가 로드되면 화면에 표시 (기본적으로 visible 상태로 로드됨)
                }

                override fun onBannerClick(bannerAdView: BannerView) {
                    Log.d(TAG, "Banner clicked")
                }

                override fun onBannerFailedToLoad(bannerAdView: BannerView, error: BannerErrorInfo) {
                    Log.e(TAG, "Banner error: ${error.errorMessage}")
                }

                override fun onBannerShown(bannerAdView: BannerView?) {
                    Log.d(TAG, "Banner shown")
                }

                override fun onBannerLeftApplication(bannerAdView: BannerView) {
                    Log.d(TAG, "Banner left app")
                }
            }

            // 3. 레이아웃 파라미터 설정 (화면 하단 중앙 정렬)
            val params = android.widget.FrameLayout.LayoutParams(
                android.widget.FrameLayout.LayoutParams.WRAP_CONTENT,
                android.widget.FrameLayout.LayoutParams.WRAP_CONTENT
            )
            params.gravity = android.view.Gravity.BOTTOM or android.view.Gravity.CENTER_HORIZONTAL
            // 하단 Safe Area 고려하지 않고 바닥에 붙임 (웹뷰에서 마진으로 처리했으므로)
            // 필요 시 마진 추가: params.setMargins(0, 0, 0, 0)

            // 4. 액티비티에 추가
            addContentView(bottomBanner, params)

            // 5. 로드 시작
            bottomBanner?.load()
        }
    }
}
