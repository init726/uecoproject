import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// SUPABASE_SECRET_KEY가 없을 때 관리자 기능 대신 보여준다.
export function MissingKey() {
  return (
    <Alert>
      <AlertTitle>관리자 키가 설정되지 않았어요</AlertTitle>
      <AlertDescription>
        <p>
          Supabase 대시보드 → Project Settings → API Keys의 <b>Secret key</b>를 서버의{" "}
          <code>.env.local</code>에 <code>SUPABASE_SECRET_KEY=...</code>로 넣고 서버를 다시 시작하세요.
        </p>
      </AlertDescription>
    </Alert>
  );
}
