import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { User } from 'firebase/auth';

export type AdType = 'roulette_reward' | 'mission_video';
export type AdResultType = 'completed' | 'skipped' | 'load_failed' | 'show_failed';

interface AdResponse {
    success: boolean;
    reward?: number;
    message?: string;
}

class AdManager {
    private static instance: AdManager;
    private isProcessing: boolean = false;
    private adCallback: ((result: AdResultType, adType: AdType) => void) | null = null;

    private constructor() {
        (window as any).onUnityAdFinished = (result: AdResultType, adType: AdType) => {
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

        return new Promise(async (resolve) => {
            this.adCallback = async (result, returnedType) => {
                this.isProcessing = false;
                this.adCallback = null;

                if (result === 'completed' && returnedType === adType) {
                    const res = await this.requestServerReward(user, adType);
                    resolve(res);
                } else {
                    resolve({ success: false, message: result });
                }
            };

            try {
                if ((window as any).Android && (window as any).Android.showRewardAd) {
                    (window as any).Android.showRewardAd(adType);
                } else {
                    console.warn("Android Interface not found. Simulating success...");
                    setTimeout(() => (window as any).onUnityAdFinished('completed', adType), 2000);
                }
            } catch (e) {
                this.isProcessing = false;
                resolve({ success: false, message: 'show_failed' });
            }
        });
    }

    private async requestServerReward(user: User, adType: AdType): Promise<AdResponse> {
        try {
            const token = await user.getIdToken(true);
            
            // Roulette reward ads don't grant points - they just unlock the second spin
            if (adType === 'roulette_reward') {
                const requestSpinAdReward = httpsCallable(functions, 'requestSpinAdReward');
                const result = await requestSpinAdReward({ token });
                const data = result.data as any;
                return { success: data.success, message: data.message };
            }
            
            // Mission video ads grant points
            const requestAdReward = httpsCallable(functions, 'requestAdReward');
            const result = await requestAdReward({
                token,
                ad_type: adType,
                timezoneOffset: new Date().getTimezoneOffset()
            });
            const data = result.data as any;
            return { success: data.success, reward: data.reward, message: data.message };
        } catch (error) {
            return { success: false, message: "load_failed" };
        }
    }
}

const adManagerInstance = AdManager.getInstance();
export default adManagerInstance;
