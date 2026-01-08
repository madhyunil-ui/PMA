
export interface Notice {
    id: number;
    date: string; // YYYY-MM-DD
    version: string;
    title: { [key: string]: string }; // localized title
    content: { [key: string]: string }; // localized content
}

export const NOTICE_DATA: Notice[] = [
    {
        id: 3,
        date: "2025-12-23",
        version: "v1.0.16",
        title: {
            en: "Final Stability Release",
            ko: "최종 안정화 업데이트",
            ph: "Final Stability Release"
        },
        content: {
            en: "Final polish for Attendance, Roulette, and overall stability.",
            ko: "출석체크, 룰렛 기능 및 전체 시스템 안정화 완료.",
            ph: "Final polish for Attendance, Roulette, and overall stability."
        }
    },
    {
        id: 2,
        date: "2025-12-23",
        version: "v1.0.15",
        title: {
            en: "Attendance Check & Optimizations",
            ko: "출석체크 기능 및 성능 최적화",
            ph: "Attendance Check & Optimizations"
        },
        content: {
            en: "Enhanced Attendance speed and fixed bugs.",
            ko: "출석체크 반응 속도가 개선되고 버그가 수정되었습니다.",
            ph: "Enhanced Attendance speed and fixed bugs."
        }
    },
    {
        id: 1,
        date: "2024-12-22",
        version: "v1.1.0",
        title: {
            en: "Major Update: Rankings & Missions",
            ko: "대규모 업데이트: 랭킹 및 미션",
            ph: "Major Update: Rankings & Missions"
        },
        content: {
            en: "Added Withdrawal Rankings, improved Roulette UI, and fixed bugs.",
            ko: "출금 랭킹 추가, 룰렛 UI 개선 및 버그 수정이 완료되었습니다.",
            ph: "Added Withdrawal Rankings, improved Roulette UI, and fixed bugs."
        }
    },
    // Add more historical data here if needed for testing
];
