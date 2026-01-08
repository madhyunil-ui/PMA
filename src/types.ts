export interface UserData {
    email: string;
    points: number;
    is_admin: boolean;
    referral_code: string;
    referrer_uid: string | null;
    created_at: any;
    lastCheckInDate?: string;
    dailyAdCount?: number;
    lastAdDate?: string;
    dailyRouletteSpins?: number;
    lastRouletteDate?: string;
    referral_count?: number;
    referral_bonus?: number;
    daily_self_earned?: number;
    consecutiveDays?: number;
    lastAdWatched?: any;
    lastSelfEarnDate?: string;
    referredBy?: string;
    last_withdrawal_date?: string;
    attendanceStreak?: number;
    attendanceHistory?: string[]; // ["2024-12-01", "2024-12-02"]
    total_withdrawn?: number;
}

export enum Tab {
    HOME = 'HOME',
    MISSION = 'MISSION',
    STORE = 'STORE',
    PROFILE = 'PROFILE',
    ADMIN = 'ADMIN',
}

export type Lang = 'ko' | 'en' | 'ph';

export interface ToastProps {
    message: string;
    type: 'success' | 'error' | 'info';
    onClose: () => void;
}
