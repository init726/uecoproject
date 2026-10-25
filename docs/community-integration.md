# 커뮤니티 통합

원격 `feature/community`의 `0d9930e`를 `feature/core`에 병합했다. 해당 브랜치의 공통 색상과 커뮤니티 화면을 적용하고, 기존 시간표·과제·설문·계정 복구 메뉴와 학교 알림은 유지했다.

## 포함 기능

- 학교 공지·질문·자유 게시판, 검색·필터·정렬·페이지 이동
- 글과 댓글 작성·수정·삭제, 질문 답변 채택, 스크랩, 내 활동
- 참여한 글의 새 댓글 알림과 읽음 처리, 새 글 표시
- 신고, 관리자 게시글·댓글 관리 및 처리 기록
- 학생·교사 모바일 커뮤니티 탭과 관리자 커뮤니티 관리 메뉴

## DB 설치

새 DB에는 `supabase/schema.sql`을 먼저 적용한 뒤 아래 순서로 실행한다.

1. `supabase/community.sql`
2. `supabase/community-v2.sql`
3. `supabase/community-v3.sql`
4. `supabase/community-v4.sql`
5. `supabase/community-v5.sql` (학생 글·댓글을 "학번 이름" 실명으로 표시, 이미 쓴 글도 맞춤)

기존 DB에는 적용하지 않은 업데이트만 순서대로 실행한다. 초기 SQL은 재실행하지 않는다. 현재 연결된 DB는 커뮤니티 테이블과 최신 RPC 준비를 확인했으며 데이터를 변경하지 않았다. 수업용 `learning_notifications`와 커뮤니티용 `notifications`는 별도로 유지한다.

## 검증

`npm run lint`, `npm run build`, `npm run test:community`, `npm run test:db`, `npm run test:workflows`, `npm run test:import`로 검사한다. DB 테스트는 격리된 PGlite를 사용한다. 학생·교사·관리자의 375 / 768 / 1024 / 1440px 화면에서 가로 넘침과 실행 오류를 확인했다.
