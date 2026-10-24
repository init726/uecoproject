# 우리학교 (가칭)

고교학점제 시간표에 맞춰 클래스를 만들고, 과제 제출·생기부 글쓰기·공지를 한곳에서 처리하는 학교 웹서비스. 2026 울산 AI 해커톤 MVP.

## 처음 실행하기

1. **Supabase 프로젝트 만들기**: [supabase.com](https://supabase.com)에서 무료 프로젝트를 만든다.
2. **DB 만들기**: 대시보드 > SQL Editor에 [supabase/schema.sql](supabase/schema.sql) 전체를 붙여넣고 Run.
3. **환경변수**: `.env.example`을 `.env.local`로 복사하고 URL, Publishable key, Secret key를 넣는다. (Supabase 대시보드 위쪽 **Connect** 버튼, 또는 Project Settings > API Keys)
4. **실행**
   ```bash
   npm install
   npm run dev
   ```
   http://localhost:3000 에서 확인한다.
5. **첫 관리자 발급**: 관리자 및 개발자 계정은 회원가입이 없다. 터미널에서 발급한다.
   ```bash
   npm run issue-account -- --role admin --name 홍길동 --username hong
   ```
   이후 계정은 관리자 콘솔의 **계정 발급** / **학생 단체 발급** 화면에서 만든다.

## 로그인과 계정 발급

- **아이디 로그인**: 이메일이 아니라 `202620315`, `kimteacher` 같은 아이디로 로그인한다. Supabase는 이메일이 필요해서 내부적으로만 `아이디@id.invalid`로 저장한다 (`src/lib/username.ts`). 아이디는 본인이 **내 정보**에서 바꿀 수 있다.
- **임시 비밀번호**: 관리자가 발급·초기화한 계정은 첫 로그인 때 `/welcome`에서 새 비밀번호를 정해야 다른 화면을 쓸 수 있다.
- **학생 단체 발급**: 엑셀의 학번·이름·전화번호 열을 붙여넣는다. 아이디 기본값은 `발급연도+학번`. 결과(임시 비밀번호)는 CSV로 내려받는다.
- **문자 발송**: `.env.local`에 솔라피 키와 발신번호가 있으면 발급 직후 아이디·임시 비밀번호를 문자로 보낸다. 전화번호는 저장하지 않는다.
- **단체 삭제**: 사용자 관리 → 학생 → 학년 → 모두 선택. 졸업생은 "제출 기록·파일까지 함께 삭제"를 켠다. 클래스가 있는 교사는 삭제되지 않는다.

## 계정 종류

| 종류 | 만드는 방법 | 할 수 있는 것 | 화면 |
| --- | --- | --- | --- |
| 학생 | 관리자 발급 (단체 발급) | 시간표, 클래스 참여, 과제 제출, 할 일 | 파랑, 휴대폰 하단 탭 |
| 교사 | 회원가입 후 관리자 승인, 또는 관리자 발급 | 클래스·과제·공지 관리, 제출 현황 | 초록, 왼쪽 사이드바 |
| 관리자 및 개발자 | 발급만 가능 | 통계, 교사 승인, 계정 발급, 비밀번호 초기화·삭제, 시스템 점검 | 다크 콘솔 |

관리자도 학생 제출물 내용은 볼 수 없다. 화면 틀은 `src/components/shells/`, 역할별 색은 `globals.css`의 `[data-role=...]`에 있다.

## 데모 순서

1. 관리자 로그인 → 학생 단체 발급(명단 붙여넣기) → 교사 승인
2. 교사 가입 → 관리자가 승인 → 교사가 클래스 만들기(요일·교시 선택) → 초대코드 확인
3. 학생이 발급받은 아이디로 첫 로그인 → 새 비밀번호 설정 → 초대코드로 참여 → 홈 시간표에 자동 표시
4. 교사가 과제 내기(파일 / 글) → 학생이 제출 → 교사가 제출 현황 확인

## 명령어

| 명령어 | 하는 일 |
| --- | --- |
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 배포용 빌드 (타입 검사 포함) |
| `npm run lint` | 코드 규칙 검사 |
| `npm run test:db` | DB 보안 규칙(RLS) 테스트 46개. **schema.sql을 고치면 꼭 실행** |
| `npm run issue-account -- ...` | 터미널에서 계정 발급 (Secret key 필요) |

## 폴더 구조

요구사항 ID는 [요구명세서](https://claude.ai/artifact/LgDYfVgqB7xWbF33CGSYYf)를 따른다.

```
supabase/
  schema.sql          테이블, 보안 규칙(RLS), 트리거 — 권한 검사는 전부 여기서
  test-rls.mjs        보안 규칙 테스트
src/
  proxy.ts            로그인 안 했으면 /login으로 보냄
  lib/
    supabase/         Supabase 연결 (server: 서버용, client: 브라우저용, admin: 관리자 키 — 서버 전용)
    auth.ts           getProfile(), requireRole(), requireAdmin() — 페이지·액션 맨 위에서 호출
    accounts.ts       계정 발급·비밀번호 초기화·아이디 변경·삭제
    username.ts       아이디 ↔ 내부 이메일 변환 규칙
    sms.ts            문자 발송 (솔라피)
    format.ts         날짜(한국 시간), 교시, 글자 수 표시
  components/
    shells/           계정 종류별 화면 틀 (학생 / 교사 / 관리자)
    timetable.tsx     주간 시간표 (TT-01, TT-02)
    ui/               shadcn/ui 부품 (버튼, 카드, 표 등)
  app/
    (auth)/           아이디 로그인, 교사 회원가입 (AUTH-01, 02)
    welcome/          임시 비밀번호 첫 로그인 → 새 비밀번호 설정
    pending/          승인 대기 교사 화면 (AUTH-03)
    (main)/
      home/           홈 (학생 홈 / 교사 대시보드)
      todo/           학생 할 일 목록
      me/             내 정보, 비밀번호 바꾸기
      classes/new/    클래스 만들기 (CLS-01, 02)
      classes/join/   초대코드로 참여 (CLS-03)
      classes/[classId]/              클래스 상세: 과제·공지·학생 탭 (CLS-04, 05)
      classes/[classId]/assignments/new/  과제 내기 (ASG-01)
      assignments/[assignmentId]/     과제 제출(학생), 제출 현황(교사) (ASG-02~05)
      admin/          관리자 콘솔: 대시보드, approvals, accounts/new, accounts/bulk, users(단체 삭제), system
    submissions/[submissionId]/download/  제출 파일 내려받기 (5분짜리 임시 링크)
```

## 새 기능을 만들 때 규칙

- **권한은 schema.sql의 RLS로 막는다.** 화면에서 버튼을 숨기는 것만으로는 안전하지 않다.
- `createAdminClient()`(Secret key)는 RLS를 무시한다. 관리자 기능에서만, `requireAdmin()` 다음에만 쓴다.
- 데이터를 바꾸는 코드는 `actions.ts`(서버 액션)에 쓰고, 폼에서 `useActionState`로 부른다.
- 날짜는 `lib/format.ts`의 함수로 표시한다. 서버가 해외 시간대여도 한국 시간으로 나온다.
- Next.js 16은 예전 버전과 다른 점이 있다. 막히면 `node_modules/next/dist/docs/`를 먼저 찾아본다.

## 아직 안 만든 것 (2차)

설문(SRV), 커뮤니티(COM), AI 피드백(ASG-08, SRV-04), 교사 피드백(ASG-06), 비밀번호 재설정(AUTH-04), 로그인 시도 제한(SEC-08)
