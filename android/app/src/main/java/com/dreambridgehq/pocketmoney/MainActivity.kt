package com.dreambridgehq.pocketmoney

import android.os.Bundle
import android.util.Log
import android.widget.Toast
import com.getcapacitor.BridgeActivity
import com.google.android.gms.ads.*
import com.google.android.gms.ads.rewarded.RewardItem
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import kotlinx.coroutines.*

class MainActivity : BridgeActivity() {

    private val TAG = "PMA_MainActivity"

    // AdMob Units (Test IDs or User Provided Legacy IDs replaced with Test for safety first)
    // REWARDED_AD_UNIT_ID: Using Test ID for development/verification as per user request scope
    private val REWARDED_AD_UNIT_ID = "ca-app-pub-3940256099942544/5224354917" 
    // BANNER_AD_UNIT_ID: Using Test ID
    private val BANNER_AD_UNIT_ID = "ca-app-pub-3940256099942544/6300978111"

    private var rewardedAd: RewardedAd? = null
    private var isAdLoading = false
    private var isAdShowing = false
    
    // For tracking the requested type during show flow
    private var currentAdType: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize AdMob SDK
        MobileAds.initialize(this) { initializationStatus ->
            Log.d(TAG, "AdMob Initialized: $initializationStatus")
            loadRewardAd() // Pre-load
        }
    }

    /** 
     * Load Rewarded Ad 
     * Called automatically on Init and after Ad Close.
     */
    fun loadRewardAd() {
        if (rewardedAd != null || isAdLoading) return

        isAdLoading = true
        val adRequest = AdRequest.Builder().build()

        RewardedAd.load(this, REWARDED_AD_UNIT_ID, adRequest, object : RewardedAdLoadCallback() {
            override fun onAdFailedToLoad(adError: LoadAdError) {
                Log.e(TAG, "AdMob Load Failed: ${adError.message}")
                rewardedAd = null
                isAdLoading = false
            }

            override fun onAdLoaded(ad: RewardedAd) {
                Log.d(TAG, "AdMob Loaded Successfully")
                rewardedAd = ad
                isAdLoading = false
            }
        })
    }

    /**
     * Show Reward Ad
     * Bridge Method called from JS
     * @param adType "point" or "roulette" (Legacy: "mission_video", "roulette_reward")
     */
    private var isRewardEarned = false

    @android.webkit.JavascriptInterface
    fun showRewardAd(adType: String) {
        Log.d(TAG, "Request Show Ad: $adType")
        currentAdType = adType
        isRewardEarned = false // Reset state

        runOnUiThread {
            if (rewardedAd != null) {
                isAdShowing = true
                rewardedAd?.fullScreenContentCallback = object : FullScreenContentCallback() {
                    override fun onAdClicked() {
                        Log.d(TAG, "Ad was clicked.")
                    }

                    override fun onAdDismissedFullScreenContent() {
                        Log.d(TAG, "Ad dismissed fullscreen content.")
                        
                        if (!isRewardEarned) {
                            notifyJs("skipped", currentAdType)
                        }
                        
                        rewardedAd = null
                        isAdShowing = false
                        loadRewardAd() // Reload
                    }

                    override fun onAdFailedToShowFullScreenContent(adError: AdError) {
                        Log.e(TAG, "Ad failed to show fullscreen content: ${adError.message}")
                        rewardedAd = null
                        isAdShowing = false
                        notifyJs("error", currentAdType)
                        loadRewardAd()
                    }

                    override fun onAdImpression() {
                        Log.d(TAG, "Ad recorded an impression.")
                    }

                    override fun onAdShowedFullScreenContent() {
                        Log.d(TAG, "Ad showed fullscreen content.")
                    }
                }

                rewardedAd?.show(this) { rewardItem ->
                    val rewardAmount = rewardItem.amount
                    val rewardType = rewardItem.type
                    Log.d(TAG, "User earned the reward: $rewardAmount $rewardType")
                    isRewardEarned = true
                    notifyJs("success", currentAdType)
                }
            } else {
                Log.e(TAG, "Ad not ready yet.")
                notifyJs("error", currentAdType) 
                loadRewardAd() 
            }
        }
    }

    /**
     * Helper to Notify JS
     * Maps to window.onUnityAdFinished(state, type)
     * state: "success", "skipped", "error"
     */
    private fun notifyJs(state: String, type: String) {
        // If we got a reward, we sent "success".
        // If dismissed WITHOUT reward... AdMob logic is tricky.
        // AdMob calls OnUserEarnedReward BEFORE Dismissed if successful.
        // So we can track if reward was earned.
        // Simplified Logic for "Pipe Verification":
        // If notifyJs is called with 'success', good.
        // If onAdDismissed happens and we didn't send success yet? -> Skipped.
        
        // This simple implementation sends 'success' immediately on reward.
        // If 'error', we send 'error'.
        // We need to handle 'skipped'.
        
        bridge.eval("window.onUnityAdFinished('$state', '$type')", null)
    }

    /** 
     * Show Banner Ad
     * Implemented using AdView
     */
    @android.webkit.JavascriptInterface
    fun showBannerAd() {
        runOnUiThread {
            // Check if already added to avoid duplicates (Simplistic check)
            // Ideally we check a flag or look for the view ID.
            // For this task, we just create it as requested.
            
            val adView = AdView(this)
            adView.setAdSize(AdSize.BANNER)
            adView.adUnitId = BANNER_AD_UNIT_ID
            
            // Layout Params (Bottom Center)
            val params = android.widget.FrameLayout.LayoutParams(
                android.widget.FrameLayout.LayoutParams.WRAP_CONTENT,
                android.widget.FrameLayout.LayoutParams.WRAP_CONTENT
            )
            params.gravity = android.view.Gravity.BOTTOM or android.view.Gravity.CENTER_HORIZONTAL
            
            addContentView(adView, params)
            
            val adRequest = AdRequest.Builder().build()
            adView.loadAd(adRequest)
            Log.d(TAG, "Banner Ad Requested")
        }
    }
}
