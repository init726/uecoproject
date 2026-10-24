import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionState } from "@/lib/types";

// 서버 액션이 돌려준 에러/안내 문구를 보여준다.
export function FormMessage({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    );
  }
  if (state.message) {
    return (
      <Alert>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }
  return null;
}
