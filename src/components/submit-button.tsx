"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

// <form action={서버액션}> 안에서 쓰는 버튼. 누르는 즉시 비활성화되고 문구가 바뀌어
// 서버 응답을 기다리는 동안에도 눌렸다는 걸 알 수 있다. (두 번 눌리는 것도 막는다)
export function SubmitButton({
  pendingText = "처리 중...",
  children,
  ...props
}: React.ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}
