import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { User } from 'firebase/auth';

// Mapped types for internal safety
export type AdType = 'roulette_reward' | 'mission_video' | 'point' | 'roulette';
// New Contract Result Types + Legacy for safety
export type AdResultType = 'completed' | 'skipped' | 'load_failed' | 'show_failed' | 'success' | 'error';

interface AdResponse {
    success: boolean;
    reward?: number;
    message?: string;
}

class AdManager {
    private static instance: AdManager;
    private isProcessing: boolean = false;
    private adCallback: ((result: AdResultType, adType: string) => void) | null = null; // adType string to accept raw bridge values

    private constructor() {
        (window as any).onUnityAdFinished = (result: AdResultType, adType: string) => {
            console.log(`[AdManager] Bridge Callback: ${result}, ${adType}`);
            if (this.adCallback) {
                this.adCallback(result, adType);
            }
        };
    }

    public static getInstance(): AdManager {
        if (!AdManager.instance) {
            AdManager.instance = new AdManager();
        }
        return AdManager.instance;
    }

    public async showUnityAd(user: User, adType: AdType): Promise<AdResponse> {
        if (this.isProcessing) return { success: false, message: "adProcessing" };
        this.isProcessing = true;

        // ADAPTER LOGIC: Map Legacy -> Contract
        let bridgeType = '';
        if (adType === 'mission_video' || adType === 'point') bridgeType = 'point';
        else if (adType === 'roulette_reward' || adType === 'roulette') bridgeType = 'roulette';
        else {
            console.error(`[AdManager] Invalid Ad Type: ${adType}`);
            return { success: false, message: "invalid_type" };
        }

        return new Promise(async (resolve) => {
            this.adCallback = async (result, returnedType) => {
                // Bridge returns 'point'/'roulette' and 'success'/'skipped'/'error'

                // Validate if it's the response we are waiting for
                // (Allowing simplified type check or legacy check for safety)
                if (returnedType !== bridgeType && returnedType !== adType) {
                    console.warn(`[AdManager] Mismatched ad type: ${returnedType} vs ${bridgeType}`);
                    return; // Ignore mismatch
                }

                this.isProcessing = false;
                this.adCallback = null;

                // ADAPTER LOGIC: Map Contract -> Legacy for Server if needed
                // Server expects 'mission_video' or 'roulette_reward'
                const serverType = (bridgeType === 'point') ? 'mission_video' : 'roulette_reward';

                if (result === 'success' || result === 'completed') {
                    const res = await this.requestServerReward(user, serverType as AdType);
                    resolve(res);
                } else {
                    // skipped, error, show_failed, load_failed
                    resolve({ success: false, message: result });
                }
            };

            try {
                if ((window as any).Android && (window as any).Android.showRewardAd) {
                    console.log(`[AdManager] Calling Bridge: showRewardAd(${bridgeType})`);
                    (window as any).Android.showRewardAd(bridgeType);
                } else {
                    console.warn("Android Interface not found. Simulating success...");
                    setTimeout(() => (window as any).onUnityAdFinished('success', bridgeType), 2000);
                }
            } catch (e) {
                this.isProcessing = false;
                console.error("Bridge call failed:", e);
                resolve({ success: false, message: 'show_failed' });
            }
        });
    }

    private async requestServerReward(user: User, adType: AdType): Promise<AdResponse> {
        try {
            const token = await user.getIdToken(true);

            // Roulette reward ads don't grant points - they just unlock the second spin
            // We check against both legacy and new names just in case, but adType should be legacy here due to logic above.
            if (adType === 'roulette_reward' || adType === 'roulette') {
                const requestSpinAdReward = httpsCallable(functions, 'requestSpinAdReward');
                const result = await requestSpinAdReward({ token });
                const data = result.data as any;
                return { success: data.success, message: data.message };
            }

            // Mission video ads grant points
            const requestAdReward = httpsCallable(functions, 'requestAdReward');
            const result = await requestAdReward({
                token,
                ad_type: adType, // Server expects legacy 'mission_video'
                timezoneOffset: new Date().getTimezoneOffset()
            });
            const data = result.data as any;
            return { success: data.success, reward: data.reward, message: data.message };
        } catch (error) {
            console.error("Server reward request failed:", error);
            return { success: false, message: "load_failed" };
        }
    }
}

const adManagerInstance = AdManager.getInstance();
export default adManagerInstance;
