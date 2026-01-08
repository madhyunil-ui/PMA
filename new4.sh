sh
# 1. 파이어베이스 서버 로직 배포 (랭크/보상 로직 적용)
cd functions
firebase deploy --only functions
cd ..

# 2. 웹앱 빌드 (안드로이드 동기화용 결과물 생성)
npm run build

# 3. 안드로이드 프로젝트에 최신 코드 동기화
npx cap sync android

# 4. GitHub에 푸시 (Vercel 자동 배포 트리거)
git add .
git commit -m "Update v1.0.29: Sync all logic"
git push origin main

echo "✅ 모든 배포와 동기화가 완료되었습니다!"