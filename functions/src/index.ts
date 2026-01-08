import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();

const AD_COOLDOWN_SECONDS = 30;

const DEFAULT_CONFIG = {
    self_earning_limit: 7500,
    active_balance_threshold: 5000,
    referral_bonus_initial: 0,
    referral_bonus_activation: 500,
    referral_activation_threshold: 10
};

async function getGlobalSettings(transaction: admin.firestore.Transaction) {
    const configRef = db.collection("sys_config").doc("global_settings");
    const configDoc = await transaction.get(configRef);
    if (configDoc.exists) {
        return { ...DEFAULT_CONFIG, ...configDoc.data() };
    }
    return DEFAULT_CONFIG;
}

function checkDailyLimit(userData: any, today: string, limit: number) {
    const lastDate = userData?.lastSelfEarnDate || "";
    let currentSelfEarned = 0;
    if (lastDate === today) {
        currentSelfEarned = userData?.pointsToday_self || 0;
    }
    if (currentSelfEarned >= limit) {
        throw new HttpsError("resource-exhausted", `일일 적립 한도(${limit}P)를 초과했습니다.`);
    }
}

async function checkIpLimit(transaction: admin.firestore.Transaction, ip: string, today: string) {
    if (ip === "unknown") return;
    const safeIp = ip.replace(/[^a-zA-Z0-9]/g, "_");
    const banRef = db.collection("banned_ips").doc(safeIp);
    const banDoc = await transaction.get(banRef);
    if (banDoc.exists) {
        const banData = banDoc.data();
        const expireAt = banData?.expireAt?.toDate();
        if (expireAt && expireAt > new Date()) {
            throw new HttpsError("permission-denied", "차단된 IP입니다.");
        }
    }
    const ipRef = db.collection("daily_ip_activity").doc(`${today}_${safeIp}`);
    const ipDoc = await transaction.get(ipRef);
    let count = ipDoc.exists ? (ipDoc.data()?.count || 0) : 0;
    if (count >= 200) {
        const banUntil = new Date();
        banUntil.setHours(banUntil.getHours() + 24);
        transaction.set(banRef, { ip, expireAt: admin.firestore.Timestamp.fromDate(banUntil) });
        throw new HttpsError("resource-exhausted", "IP 요청 한도 초과로 차단되었습니다.");
    }
    transaction.set(ipRef, { count: admin.firestore.FieldValue.increment(1) }, { merge: true });
}

export const requestAdReward = onCall({ cors: true }, async (request) => {
    const crypto = require('crypto');
    const AD_REWARD_SECRET = "YOUR_CLIENT_SECRET_KEY_HERE";
    const data = request.data;
    const contextAuth = request.auth;
    let uid;
    if (contextAuth) uid = contextAuth.uid;
    else if (data && data.token) {
        const decodedToken = await admin.auth().verifyIdToken(data.token);
        uid = decodedToken.uid;
    } else throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

    const { signature, timestamp } = data;
    const payload = `${uid}_${timestamp}`;
    const expectedSignature = crypto.createHmac('sha256', AD_REWARD_SECRET).update(payload).digest('hex');
    if (signature !== expectedSignature) throw new HttpsError("permission-denied", "서명 검증 실패.");

    const clientOffset = data.timezoneOffset !== undefined ? Number(data.timezoneOffset) : -540;
    const now = new Date();
    const localNow = new Date(now.getTime() - (clientOffset * 60 * 1000));
    const today = localNow.toISOString().split('T')[0];
    const userRef = db.collection("users").doc(uid);

    return db.runTransaction(async (transaction) => {
        const config = await getGlobalSettings(transaction);
        const userDoc = await transaction.get(userRef);
        const userData = userDoc.data();
        checkDailyLimit(userData, today, config.self_earning_limit);
        const ip = request.rawRequest.ip || request.rawRequest.headers['x-forwarded-for'] || "unknown";
        await checkIpLimit(transaction, ip as string, today);

        const lastWatched = userData?.lastAdWatched ? userData.lastAdWatched.toDate() : new Date(0);
        if ((now.getTime() - lastWatched.getTime()) / 1000 < AD_COOLDOWN_SECONDS) throw new HttpsError("resource-exhausted", "너무 빠릅니다.");

        const isSameDay = (userData?.lastAdDate || "") === today;
        if (isSameDay && (userData?.dailyAdCount || 0) >= 50) throw new HttpsError("resource-exhausted", "한도 초과");

        const rand = Math.random();
        const rewardPoints = rand < 0.7 ? Math.floor(Math.random() * 31) + 100 : Math.floor(Math.random() * 120) + 131;

        let streakBonus = 0;
        let currentStreak = userData?.attendanceStreak || 0;
        if ((userData?.lastAttendanceDate || "") !== today) {
            const yesterday = new Date(localNow.getTime() - 86400000).toISOString().split('T')[0];
            currentStreak = (userData?.lastAttendanceDate === yesterday) ? currentStreak + 1 : 1;
            if (currentStreak === 7) streakBonus = 100;
            else if (currentStreak === 15) streakBonus = 200;
            else if (currentStreak === 30) streakBonus = 500;
        }

        const totalReward = rewardPoints + streakBonus;
        transaction.update(userRef, {
            points: admin.firestore.FieldValue.increment(totalReward),
            pointsToday_self: isSameDay ? admin.firestore.FieldValue.increment(totalReward) : totalReward,
            lastSelfEarnDate: today,
            lastAdWatched: now,
            lastAdDate: today,
            dailyAdCount: isSameDay ? admin.firestore.FieldValue.increment(1) : 1,
            totalAdCount: admin.firestore.FieldValue.increment(1),
            lastAttendanceDate: today,
            attendanceStreak: currentStreak,
            attendanceHistory: admin.firestore.FieldValue.arrayUnion(today)
        });

        const referrerId = userData?.referredBy;
        if (referrerId) {
            const referrerRef = db.collection("users").doc(referrerId);
            const referrerDoc = await transaction.get(referrerRef);
            if (referrerDoc.exists) {
                const refData = referrerDoc.data();
                const refCount = refData?.referral_count || 0;
                let rate = 0.05;
                if (refCount >= 50) rate = 0.10;
                else if (refCount >= 30) rate = 0.08;
                else if (refCount >= 10) rate = 0.07;
                const bonusPoints = Math.floor(rewardPoints * rate);
                if (bonusPoints > 0) {
                    const isRefToday = (refData?.lastReferralEarnDate || "") === today;
                    transaction.update(referrerRef, {
                        points: admin.firestore.FieldValue.increment(bonusPoints),
                        pointsToday_referral: isRefToday ? admin.firestore.FieldValue.increment(bonusPoints) : bonusPoints,
                        lastReferralEarnDate: today
                    });
                }
            }
        }
        return { success: true, reward: totalReward, message: `${rewardPoints}P 적립!` };
    });
});

/**
 * Roulette Reward Function
 * Allows 2 spins per day:
 * - First spin: Free (no ad required)
 * - Second spin: Requires ad (tracked via dailySpinAdCount)
 */
export const requestRouletteReward = onCall({ cors: true }, async (request) => {
    const data = request.data;
    const contextAuth = request.auth;
    let uid;
    if (contextAuth) uid = contextAuth.uid;
    else if (data && data.token) {
        const decodedToken = await admin.auth().verifyIdToken(data.token);
        uid = decodedToken.uid;
    } else throw new HttpsError("unauthenticated", "로그인 필요");

    const userRef = db.collection("users").doc(uid);
    return db.runTransaction(async (transaction) => {
        const config = await getGlobalSettings(transaction);
        const userDoc = await transaction.get(userRef);
        const userData = userDoc.data();
        const now = new Date();
        const today = new Date(now.getTime() + 32400000).toISOString().split('T')[0];
        checkDailyLimit(userData, today, config.self_earning_limit);

        const isSameDay = (userData?.lastRouletteDate || "") === today;
        const currentSpins = isSameDay ? (userData?.dailyRouletteSpins || 0) : 0;
        const dailySpinAdCount = (userData?.lastSpinAdDate === today) ? (userData?.dailySpinAdCount || 0) : 0;
        
        // Logic: First spin is free (currentSpins === 0), second requires ad (currentSpins === 1 && dailySpinAdCount === 1)
        // Maximum 2 spins per day
        if (currentSpins >= 2) {
            throw new HttpsError("resource-exhausted", "일일 룰렛 기회를 모두 사용했습니다.");
        }
        
        // If this is the second spin, verify that ad was watched
        if (currentSpins === 1 && dailySpinAdCount < 1) {
            throw new HttpsError("failed-precondition", "두 번째 룰렛을 하려면 광고를 시청해야 합니다.");
        }

        const rewardPoints = Math.min(Math.random() < 0.3 ? Math.floor(Math.random() * 120) + 131 : Math.floor(Math.random() * 31) + 100, 250);
        transaction.update(userRef, {
            points: admin.firestore.FieldValue.increment(rewardPoints),
            lastRouletteDate: today,
            dailyRouletteSpins: isSameDay ? admin.firestore.FieldValue.increment(1) : 1,
            pointsToday_self: isSameDay ? admin.firestore.FieldValue.increment(rewardPoints) : rewardPoints,
            lastSelfEarnDate: today
        });
        return { success: true, reward: rewardPoints };
    });
});

export const submitReferralCode = onCall({ cors: true }, async (request) => {
    const contextAuth = request.auth;
    const inputCode = request.data.referralCode;
    if (!contextAuth) throw new HttpsError("unauthenticated", "로그인 필요");
    const uid = contextAuth.uid;
    const userRef = db.collection("users").doc(uid);
    const referrerQuery = await db.collection("users").where("referral_code", "==", inputCode).limit(1).get();
    if (referrerQuery.empty) throw new HttpsError("not-found", "코드 오류");
    const referrerUid = referrerQuery.docs[0].id;
    if (referrerUid === uid) throw new HttpsError("invalid-argument", "본인 코드 불가");

    return db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (userDoc.data()?.referredBy) throw new HttpsError("already-exists", "이미 등록됨");
        transaction.update(userRef, { referredBy: referrerUid });
        return { success: true };
    });
});

export const claimDailyMissionReward = onCall({ cors: true }, async (request) => {
    const contextAuth = request.auth;
    const tier = request.data.tier;
    if (!contextAuth || ![10, 30, 50].includes(tier)) throw new HttpsError("invalid-argument", "오류");
    const uid = contextAuth.uid;
    const userRef = db.collection("users").doc(uid);

    return db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        const userData = userDoc.data();
        const today = new Date(Date.now() + 32400000).toISOString().split('T')[0];
        if ((userData?.lastAdDate === today ? userData?.dailyAdCount : 0) < tier) throw new HttpsError("failed-precondition", "미달성");
        
        let currentClaims = userData?.lastMissionClaimDate === today ? (userData?.missionClaims || []) : [];
        if (currentClaims.includes(tier)) throw new HttpsError("already-exists", "수령 완료");

        const reward = tier === 10 ? 50 : tier === 30 ? 100 : 200;
        currentClaims.push(tier);
        transaction.update(userRef, {
            points: admin.firestore.FieldValue.increment(reward),
            pointsToday_self: admin.firestore.FieldValue.increment(reward),
            lastMissionClaimDate: today,
            missionClaims: currentClaims
        });
        return { success: true, reward };
    });
});

export const updateRankings = onSchedule("every 1 hours", async () => {
    const snapshot = await db.collection("users").orderBy("points", "desc").limit(10).get();
    const rankings: any[] = [];
    snapshot.forEach(doc => rankings.push({ email: doc.data().email?.replace(/(.{2})(.*)(@.*)/, "$1***$3"), points: doc.data().points }));
    await db.collection("system").doc("rankings").set({ top10: rankings, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
});

/**
 * Spin Ad Reward Function
 * Tracks when user watches ad for second roulette spin
 * Allows only 1 ad-watched roulette spin per day
 */
export const requestSpinAdReward = onCall({ cors: true }, async (request) => {
    const contextAuth = request.auth;
    if (!contextAuth) throw new HttpsError("unauthenticated", "로그인 필요");
    const uid = contextAuth.uid;
    const userRef = db.collection("users").doc(uid);
    return db.runTransaction(async (transaction) => {
        const userData = (await transaction.get(userRef)).data();
        const today = new Date(Date.now() + 32400000).toISOString().split('T')[0];
        const isSameDay = (userData?.lastSpinAdDate || "") === today;
        const currentCount = isSameDay ? (userData?.dailySpinAdCount || 0) : 0;
        
        if (currentCount >= 1) {
            throw new HttpsError("resource-exhausted", "일일 룰렛 광고 시청 한도 초과");
        }
        
        transaction.update(userRef, { 
            dailySpinAdCount: admin.firestore.FieldValue.increment(1), 
            lastSpinAdDate: today, 
            totalAdCount: admin.firestore.FieldValue.increment(1) 
        });
        return { success: true };
    });
});

/**
 * Fallback Reward Function
 * Grants fallback reward when ad fails to load or show
 * Limited to 20 per day per user
 */
export const requestFallbackReward = onCall({ cors: true }, async (request) => {
    const data = request.data;
    const contextAuth = request.auth;
    let uid;
    if (contextAuth) uid = contextAuth.uid;
    else if (data && data.token) {
        const decodedToken = await admin.auth().verifyIdToken(data.token);
        uid = decodedToken.uid;
    } else throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

    const clientOffset = data.timezoneOffset !== undefined ? Number(data.timezoneOffset) : -540;
    const now = new Date();
    const localNow = new Date(now.getTime() - (clientOffset * 60 * 1000));
    const today = localNow.toISOString().split('T')[0];
    const userRef = db.collection("users").doc(uid);
    const MAX_FALLBACK_REWARDS = 20;
    const FALLBACK_REWARD_POINTS = 50;

    return db.runTransaction(async (transaction) => {
        const config = await getGlobalSettings(transaction);
        const userDoc = await transaction.get(userRef);
        const userData = userDoc.data();
        checkDailyLimit(userData, today, config.self_earning_limit);
        
        // Check fallback reward limit
        const isSameDay = (userData?.lastFallbackDate || "") === today;
        const fallbackCount = isSameDay ? (userData?.dailyFallbackCount || 0) : 0;
        if (fallbackCount >= MAX_FALLBACK_REWARDS) {
            throw new HttpsError("resource-exhausted", "일일 보상 우회 한도 초과");
        }

        const rewardPoints = FALLBACK_REWARD_POINTS;
        const isSelfEarnSameDay = (userData?.lastSelfEarnDate || "") === today;
        
        transaction.update(userRef, {
            points: admin.firestore.FieldValue.increment(rewardPoints),
            pointsToday_self: isSelfEarnSameDay ? admin.firestore.FieldValue.increment(rewardPoints) : rewardPoints,
            lastSelfEarnDate: today,
            lastFallbackDate: today,
            dailyFallbackCount: isSameDay ? admin.firestore.FieldValue.increment(1) : 1
        });

        return { success: true, reward: rewardPoints, message: `Fallback reward: ${rewardPoints}P` };
    });
});
